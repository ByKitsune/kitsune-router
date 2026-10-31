/**
 * Kiro model catalog fetcher.
 *
 * Calls AWS CodeWhisperer's `ListAvailableModels` endpoint to get the live
 * catalog for an authenticated Kiro account, then expands each upstream model
 * into kitsunerouter-shaped variants:
 *
 *   {upstream}                          - base model
 *   {upstream}-thinking                 - same model, thinking on at request time
 *   {upstream}-agentic                  - same model, chunked-write prompt prepended
 *   {upstream}-thinking-agentic         - both
 *
 * The `-thinking` and `-agentic` suffixes do not exist on the Kiro upstream
 * API. They are kitsunerouter fictions and the `openai-to-kiro` translator strips
 * them before the request leaves this process.
 *
 * The runtime UA is built to match what Kiro IDE itself sends, because the
 * upstream rejects requests with malformed `User-Agent` headers (returns 400
 * "format of value 'os/win/10 lang/js ...' is invalid").
 */

import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import { refreshKiroToken } from "./tokenRefresh.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { getRefreshProxyKey } from "./tokenRefresh/dedup.js";
import {
  MODEL_CATALOG_CACHE_TTL_MS,
  MODEL_CATALOG_MAX_CACHE_BYTES,
  MODEL_CATALOG_MAX_CACHE_ENTRIES,
} from "../config/modelCatalog.js";
import { readModelCatalogResponse } from "../utils/modelCatalog.js";
import { getDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";
import {
  KIRO_IDE_VERSION,
  KIRO_RUNTIME_SDK_VERSION,
  KIRO_FINGERPRINT,
} from "../config/clientVersions.js";

const KIRO_AGENT_OS = "windows";
const KIRO_AGENT_OS_VERSION = "10.0.26200";
const KIRO_NODE_VERSION = "22.21.1";
// KIRO_VERSION kept as alias for back-compat (Kiro IDE version line; the
// deprecated 0.10.32 CLI line is no longer referenced).
const KIRO_VERSION = KIRO_IDE_VERSION;

const DEFAULT_REGION = "us-east-1";
const FETCH_TIMEOUT_MS = 30_000;

/** @type {Map<string, { expiresAt: number, models: any[] }>} */
const catalogCache = new Map();
let cacheBytes = 0;
let generation = 0;
let importedGeneration = getDbImportGeneration();

function removeCached(key) {
  const entry = catalogCache.get(key);
  if (entry) cacheBytes -= entry.bytes;
  catalogCache.delete(key);
}

function sweepExpired() {
  const now = Date.now();
  for (const [key, entry] of catalogCache) if (entry.expiresAt <= now) removeCached(key);
}

function remember(key, scope, result) {
  const bytes = Buffer.byteLength(JSON.stringify(result));
  sweepExpired();
  removeCached(key);
  if (bytes > MODEL_CATALOG_MAX_CACHE_BYTES) return;
  while (catalogCache.size >= MODEL_CATALOG_MAX_CACHE_ENTRIES || cacheBytes + bytes > MODEL_CATALOG_MAX_CACHE_BYTES) {
    removeCached(catalogCache.keys().next().value);
  }
  catalogCache.set(key, { ...structuredClone(result), scope, bytes, expiresAt: Date.now() + MODEL_CATALOG_CACHE_TTL_MS });
  cacheBytes += bytes;
}

/**
 * Strip the `-agentic` and/or `-thinking` suffixes from a synthetic id, if
 * any. Used only for display naming when a Kiro upstream id happens to look
 * synthetic (defensive).
 */
function stripSyntheticSuffixes(id) {
  let out = id;
  if (out.endsWith("-agentic")) out = out.slice(0, -"-agentic".length);
  if (out.endsWith("-thinking")) out = out.slice(0, -"-thinking".length);
  return out;
}

/**
 * Extract region from a profileArn like
 *   arn:aws:codewhisperer:us-east-1:123456789012:profile/ABC
 */
function regionFromProfileArn(profileArn) {
  if (!profileArn || typeof profileArn !== "string") return DEFAULT_REGION;
  const parts = profileArn.split(":");
  if (parts.length >= 4 && parts[3]) return parts[3];
  return DEFAULT_REGION;
}

/**
 * Build the per-account fingerprint headers Kiro upstream validates.
 * Keyed off whatever stable identifier we have for this credential, so the
 * same account always presents the same machineId.
 */
function buildKiroFingerprintHeaders(credentials) {
  const seed =
    credentials?.providerSpecificData?.clientId
    || credentials?.refreshToken
    || credentials?.providerSpecificData?.profileArn
    || credentials?.accessToken
    || "kiro-anonymous";
  const machineId = createHash("sha256").update(String(seed)).digest("hex");

  const { userAgent, amzUserAgent } = KIRO_FINGERPRINT({
    kiroAgentOs: KIRO_AGENT_OS,
    kiroAgentOsVersion: KIRO_AGENT_OS_VERSION,
    kiroNodeVersion: KIRO_NODE_VERSION,
    machineId,
  });

  return {
    "User-Agent": userAgent,
    "x-amz-user-agent": amzUserAgent,
    "x-amzn-kiro-agent-mode": "vibe",
    "x-amzn-codewhisperer-optout": "true",
    "amz-sdk-request": "attempt=1; max=1",
    "amz-sdk-invocation-id": uuidv4(),
    "Accept": "application/json"
  };
}

/**
 * Build the synthetic kitsunerouter variant set for a single upstream Kiro model.
 *
 * Returns objects shaped for `PROVIDER_MODELS` (`{ id, name }`) so they can
 * be slotted directly into the existing model registry.
 *
 * The `auto` model is special: Kiro picks the underlying model server-side,
 * so the chunked-write `-agentic` prompt is not meaningful (the prompt
 * targets coding-agent file writes). Match CLIProxyAPIPlus and skip
 * `-agentic` / `-thinking-agentic` for `auto`.
 */
function buildVariants(upstream, displayName) {
  const safeUpstream = stripSyntheticSuffixes(upstream);
  const display = displayName || `Kiro ${safeUpstream}`;
  const isAuto = safeUpstream === "auto";

  const variants = [
    {
      id: safeUpstream,
      name: display,
      capabilities: { thinking: false, agentic: false }
    },
    {
      id: `${safeUpstream}-thinking`,
      name: `${display} (Thinking)`,
      capabilities: { thinking: true, agentic: false }
    }
  ];

  if (!isAuto) {
    variants.push({
      id: `${safeUpstream}-agentic`,
      name: `${display} (Agentic)`,
      capabilities: { thinking: false, agentic: true }
    });
    variants.push({
      id: `${safeUpstream}-thinking-agentic`,
      name: `${display} (Thinking + Agentic)`,
      capabilities: { thinking: true, agentic: true }
    });
  }

  return variants;
}

/**
 * Format the human-friendly display name for a Kiro model, including the
 * rate multiplier when it is something other than 1.0x.
 */
function formatDisplayName(modelName, modelId, rateMultiplier) {
  const base = (modelName || modelId || "Kiro").trim();
  const rate = Number(rateMultiplier);
  if (!Number.isFinite(rate) || rate === 1 || rate < 0) {
    return `Kiro ${base}`;
  }
  // Locale-independent decimal formatting.
  const rateStr = String(rate);
  return `Kiro ${base} (${rateStr}x credit)`;
}

function nativeNonnegativeNumber(value) {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function nativeTokenLimit(value) {
  const number = nativeNonnegativeNumber(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

/**
 * Fetch the raw model catalog from Kiro. Returns the array under `.models`
 * from the API response, or throws on network/HTTP error.
 */
async function fetchKiroCatalogRaw(credentials, signal, proxyOptions = null) {
  signal?.throwIfAborted();
  const profileArn = credentials?.providerSpecificData?.profileArn || "";
  const region = regionFromProfileArn(profileArn);
  const params = new URLSearchParams();
  params.set("origin", "AI_EDITOR");
  if (profileArn) params.set("profileArn", profileArn);
  const url = `https://q.${region}.amazonaws.com/ListAvailableModels?${params.toString()}`;

  const headers = {
    ...buildKiroFingerprintHeaders(credentials),
    "Authorization": `Bearer ${credentials?.accessToken || ""}`
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    requestSignal.throwIfAborted();
    const response = await proxyAwareFetch(url, {
      method: "GET",
      redirect: "error",
      headers,
      signal: requestSignal
    }, proxyOptions);
    if (requestSignal.aborted || !response.ok) {
      // An error body is neither model metadata nor required for refresh. Never
      // wait for an unlimited diagnostic body or keep its connection occupied.
      void response.body?.cancel().catch(() => {});
      requestSignal.throwIfAborted();
      const err = new Error(`Kiro ListAvailableModels ${response.status}`);
      err.status = response.status;
      throw err;
    }

    // Keep the existing per-request deadline active through the bounded body,
    // not merely until headers. The reader cancels and unlocks on every path.
    const data = await readModelCatalogResponse(response, requestSignal);
    return Array.isArray(data?.models) ? data.models : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scope metadata to the selected proof, connection and fingerprint inputs.
 * A registered client/profile is not a substitute for the authenticated token.
 */
function cacheKey(credentials) {
  const psd = credentials?.providerSpecificData || {};
  return createHash("sha256").update(JSON.stringify([
    credentials?.id || credentials?.connectionId || null,
    credentials?.accessToken || null, credentials?.refreshToken || null,
    psd.profileArn || null, psd.clientId || psd.client_id || null,
    psd.clientSecret || null, psd.authMethod || null, psd.region || null,
    psd.tokenEndpoint || psd.token_endpoint || null, psd.scope || psd.scopes || null,
  ])).digest("hex");
}

/**
 * Resolve the live Kiro model catalog for a credential and expand each entry
 * into kitsunerouter variants (`-thinking`, `-agentic`, `-thinking-agentic`).
 *
 * On any error (network, 4xx, 5xx), returns `null` so callers can fall back
 * to the static catalog without taking down the dashboard or `/v1/models`.
 *
 * @param {object} credentials Connection record (accessToken, refreshToken,
 *   providerSpecificData {profileArn, authMethod, clientId, clientSecret, region})
 * @param {object} [options]
 * @param {boolean} [options.forceRefresh] Bypass the per-credential cache.
 * @param {object}  [options.log] Logger.
 * @param {function} [options.onCredentialsRefreshed] Persist refreshed token
 *   back to your credential store. Called with `{ accessToken, refreshToken,
 *   expiresIn }` whenever a 401 triggers a token refresh.
 * @returns {Promise<{ models: object[], rawModels: object[] } | null>}
 */
export async function resolveKiroModels(credentials, options = {}) {
  if (options.signal?.aborted) return null;
  if (!credentials || !credentials.accessToken) {
    options.log?.debug?.("KIRO_MODELS", "No accessToken; skipping live fetch");
    return null;
  }

  if (importedGeneration !== getDbImportGeneration()) clearKiroModelCache();

  const epoch = generation;
  const imported = importedGeneration;
  let scope = cacheKey(credentials);
  const proxyKey = getRefreshProxyKey(options.proxyOptions);
  const proxyOptions = options.proxyOptions ? { ...options.proxyOptions } : null;
  const selected = { ...credentials, providerSpecificData: structuredClone(credentials.providerSpecificData || {}) };
  const unchanged = () => !options.signal?.aborted && epoch === generation
    && imported === getDbImportGeneration()
    && scope === cacheKey(credentials) && proxyKey === getRefreshProxyKey(options.proxyOptions);
  const key = JSON.stringify([scope, proxyKey]);
  sweepExpired();
  if (!options.forceRefresh) {
    const cached = catalogCache.get(key);
    if (cached) return structuredClone({ models: cached.models, rawModels: cached.rawModels });
  }

  let raw;
  try {
    raw = await fetchKiroCatalogRaw(selected, options.signal, proxyOptions);
  } catch (err) {
    if (err?.message?.includes("strictProxy=true")) throw err;
    if (!unchanged()) return null;
    if (err && err.status === 401 && selected.refreshToken) {
      options.log?.info?.("KIRO_MODELS", "Got 401 from Kiro; refreshing token");
      let refreshed;
      try {
        refreshed = await refreshKiroToken(selected.refreshToken, selected.providerSpecificData, options.log, proxyOptions, options.signal);
      } catch (error) {
        if (error?.message?.includes("strictProxy=true")) throw error;
        options.log?.warn?.("KIRO_MODELS", `Token refresh failed: ${error?.message || error}`);
        return null;
      }
      if (!unchanged()) return null;
      if (refreshed?.accessToken) {
        const next = { ...selected, ...refreshed };
        if (typeof options.onCredentialsRefreshed === "function") {
          try { await options.onCredentialsRefreshed(refreshed); } catch (e) {
            options.log?.warn?.("KIRO_MODELS", `onCredentialsRefreshed failed: ${e?.message || e}`);
          }
        }
        if (!unchanged()) return null;
        try {
          raw = await fetchKiroCatalogRaw(next, options.signal, proxyOptions);
          if (!unchanged()) return null;
          // Update the in-memory credential reference too so retry logic uses
          // the fresh token consistently.
          credentials.accessToken = next.accessToken;
          if (next.refreshToken) credentials.refreshToken = next.refreshToken;
          scope = cacheKey(credentials);
        } catch (err2) {
          if (err2?.message?.includes("strictProxy=true")) throw err2;
          options.log?.warn?.("KIRO_MODELS", `Retry after refresh failed: ${err2?.message || err2}`);
          return null;
        }
      } else {
        options.log?.warn?.("KIRO_MODELS", "Token refresh did not return accessToken");
        return null;
      }
    } else {
      options.log?.warn?.("KIRO_MODELS", `ListAvailableModels failed: ${err?.message || err}`);
      return null;
    }
  }

  if (!unchanged()) return null;

  const expanded = [];
  for (const m of raw) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const upstreamId = m.modelId || m.id;
    if (typeof upstreamId !== "string" || !upstreamId.trim()) continue;
    const name = typeof m.modelName === "string" && m.modelName.trim() ? m.modelName : upstreamId;
    const rateMultiplier = nativeNonnegativeNumber(m.rateMultiplier);
    const display = formatDisplayName(name, upstreamId, rateMultiplier);
    // The native tokenLimits fields are directional limits, not a combined
    // context window. Absence does not establish a 200k-token budget or 1x rate.
    const maxInput = nativeTokenLimit(m?.tokenLimits?.maxInputTokens);
    const maxOutput = nativeTokenLimit(m?.tokenLimits?.maxOutputTokens);
    for (const v of buildVariants(upstreamId, display)) {
      expanded.push({
        ...v,
        capabilities: {
          ...v.capabilities,
          ...(maxInput !== undefined ? { maxInput } : {}),
          ...(maxOutput !== undefined ? { maxOutput } : {}),
        },
        ...(maxInput !== undefined ? { maxInputTokens: maxInput } : {}),
        ...(maxOutput !== undefined ? { maxOutputTokens: maxOutput } : {}),
        ...(rateMultiplier !== undefined ? { rateMultiplier } : {}),
        upstreamModelId: upstreamId,
        description: typeof m.description === "string" ? m.description : ""
      });
    }
  }

  const result = { models: expanded, rawModels: raw };
  remember(JSON.stringify([scope, proxyKey]), scope, result);
  return structuredClone(result);
}

/**
 * Drop any cached catalog for this credential. Call this after rotating /
 * importing tokens so the next fetch is fresh.
 */
export function invalidateKiroModelCache(credentials) {
  if (!credentials) return;
  const scope = cacheKey(credentials);
  for (const [key, entry] of catalogCache) if (entry.scope === scope) removeCached(key);
  // Do not allow an older in-flight observation to repopulate invalidated data.
  generation++;
}

/**
 * Drop the entire in-memory cache. Mostly for tests / manual debug.
 */
export function clearKiroModelCache() {
  catalogCache.clear();
  cacheBytes = 0;
  generation++;
  importedGeneration = getDbImportGeneration();
}
