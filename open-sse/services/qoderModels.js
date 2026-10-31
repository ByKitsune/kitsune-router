/**
 * Qoder model catalog fetcher.
 *
 * Calls /algo/api/v2/model/list (COSY-signed) on the inference host to get
 * the live catalog for an authenticated Qoder account, then caches the
 * per-model `model_config` blocks by key. Chat requests later look up the
 * exact server-published metadata for the model they want — Qoder's chat
 * endpoint silently downgrades to a different model when the wrong
 * model_config is sent.
 *
 * On any error the live cache stays empty and chatExecuteCall surfaces the
 * problem to the user as "model config not yet fetched, retry shortly".
 *
 * PAT (Personal Access Token, pt-...) connections: a PAT cannot sign COSY
 * requests directly, so we exchange it for a short-lived job token (jt-...)
 * via openapi.qoder.sh/api/v1/jobToken/exchange (plain JSON POST), then use
 * that job token for signing. Job-token traffic must hit api2.qoder.sh —
 * api3 rejects jt- with "Login expired" (403).
 */

import { createHash } from "crypto";

import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { createRefreshOperation, getRefreshProxyKey, waitForRefresh } from "./tokenRefresh/dedup.js";
import { MODEL_CATALOG_MAX_CACHE_BYTES, MODEL_CATALOG_MAX_CACHE_ENTRIES } from "../config/modelCatalog.js";
import { readModelCatalogResponse } from "../utils/modelCatalog.js";
import { buildCosyHeaders } from "../shared/qoder/cosy.js";
import { QODER_CLI_USER_AGENT } from "../config/clientVersions.js";
import { getDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";
import {
  QODER_MODEL_LIST_URL,
  QODER_CHAT_BASE_ALT,
  QODER_JOB_TOKEN_EXCHANGE_URL,
  QODER_USERINFO_URL,
  QODER_IDE_VERSION,
  QODER_CLIENT_TYPE,
} from "../shared/qoder/constants.js";

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // Preserve Qoder's existing 1h freshness policy.

const PAT_PREFIX = "pt-";

// PAT → job-token cache: a job token is short-lived (24h), so we keep it per
// PAT and re-exchange once it is within 5 minutes of expiry.
const PAT_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const PAT_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function isQoderPat(token) {
  return typeof token === "string" && token.startsWith(PAT_PREFIX);
}

/** @type {Map<string, { accessToken: string, userId: string, expiresAt: number, bytes: number }>} */
const patJobCache = new Map();

/** @type {Map<string, { expiresAt: number, value: object, bytes: number }>} */
const catalogCache = new Map();

/**
 * In-flight fetch promises keyed by cacheKey. Concurrent first-time
 * callers (parallel chat windows) all observe the same Promise so we
 * fan-out exactly one upstream request per credential per miss.
 * Each operation owns transport cancellation; callers own their subscriptions.
 */
const inflight = new Map();
const activeRequests = new Set();
let catalogBytes = 0;
let patBytes = 0;
let generation = 0;
let importedGeneration = getDbImportGeneration();

function synchronizeImportGeneration() {
  const imported = getDbImportGeneration();
  if (imported !== importedGeneration) {
    importedGeneration = imported;
    clearQoderCatalog();
  }
  return imported;
}

function cancelResponse(response) {
  void response?.body?.cancel().catch(() => {});
}

async function waitForOperation(pending, signal, disposeLate = null) {
  let aborted = false;
  let onAbort;
  const cancellation = new Promise((_, reject) => {
    onAbort = () => { aborted = true; reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  const operation = Promise.resolve(pending).then(value => {
    if (aborted) disposeLate?.(value);
    return value;
  });
  try { return await Promise.race([operation, cancellation]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

function dropCatalog(key) {
  const entry = catalogCache.get(key);
  if (entry) catalogBytes -= entry.bytes;
  catalogCache.delete(key);
}

function dropPat(key) {
  const entry = patJobCache.get(key);
  if (entry) patBytes -= entry.bytes;
  patJobCache.delete(key);
}

function sweepCaches() {
  const now = Date.now();
  for (const [key, entry] of catalogCache) if (entry.expiresAt <= now) dropCatalog(key);
  for (const [key, entry] of patJobCache) if (entry.expiresAt - now <= PAT_REFRESH_BUFFER_MS) dropPat(key);
}

function rememberPat(key, resolved) {
  dropPat(key);
  const bytes = Buffer.byteLength(JSON.stringify([resolved.accessToken, resolved.userId]));
  if (bytes > MODEL_CATALOG_MAX_CACHE_BYTES) return;
  resolved.bytes = bytes;
  patJobCache.set(key, resolved);
  patBytes += bytes;
  while (patJobCache.size > MODEL_CATALOG_MAX_CACHE_ENTRIES || patBytes > MODEL_CATALOG_MAX_CACHE_BYTES) {
    dropPat(patJobCache.keys().next().value);
  }
}

function prepareCatalogEntry(fetched) {
  const value = { models: fetched.models, rawConfigs: [...fetched.rawConfigs], fetched: true };
  // Budget serialized metadata as before, but preserve decoded native config
  // values such as -0 or exponent overflow for the unchanged chat serializer.
  const bytes = Buffer.byteLength(JSON.stringify(value));
  return { value: structuredClone(value), bytes, expiresAt: Date.now() + CACHE_TTL_MS };
}

function cloneCatalog(entry) {
  if (!entry) return null;
  const value = structuredClone(entry.value);
  return { expiresAt: entry.expiresAt, ...value, rawConfigs: new Map(value.rawConfigs) };
}

function rememberCatalog(key, entry) {
  dropCatalog(key);
  if (entry.bytes > MODEL_CATALOG_MAX_CACHE_BYTES) return;
  catalogCache.set(key, entry);
  catalogBytes += entry.bytes;
  while (catalogCache.size > MODEL_CATALOG_MAX_CACHE_ENTRIES || catalogBytes > MODEL_CATALOG_MAX_CACHE_BYTES) {
    dropCatalog(catalogCache.keys().next().value);
  }
}

/**
 * Exchange a Qoder PAT (pt-...) for a short-lived job token (jt-...).
 * This endpoint is plain JSON POST — NOT COSY-signed.
 */
async function exchangeJobToken(pat, proxyOptions = null, signal = null) {
  const res = await proxyAwareFetch(
    QODER_JOB_TOKEN_EXCHANGE_URL,
    {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": QODER_CLI_USER_AGENT,
        "Cosy-Version": QODER_IDE_VERSION,
        "Cosy-ClientType": QODER_CLIENT_TYPE,
      },
      body: JSON.stringify({ personal_token: pat }),
      signal,
    },
    proxyOptions,
  );
  if (!res.ok) {
    cancelResponse(res);
    throw new Error(`qoder PAT exchange failed (${res.status})`);
  }
  const data = await readModelCatalogResponse(res, signal || new AbortController().signal);
  if (!data.token) throw new Error("qoder PAT exchange returned no job token");

  let expiresAt = Date.now() + PAT_DEFAULT_TTL_MS;
  if (data.expires_at) {
    const parsed = Date.parse(data.expires_at);
    if (!Number.isNaN(parsed)) expiresAt = parsed;
  } else if (typeof data.expires_in === "number" && data.expires_in > 0) {
    expiresAt = Date.now() + data.expires_in;
  }
  return { jobToken: data.token, jobRefreshToken: data.refresh_token || "", expiresAt };
}

/**
 * Resolve the Qoder userId for a job token (needed for COSY signing).
 * Returns "" on any failure — callers fall back to the stored userId.
 */
async function fetchUserIdForJobToken(jobToken, proxyOptions = null, signal = null) {
  try {
    const res = await proxyAwareFetch(
      QODER_USERINFO_URL,
      {
        method: "GET",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${jobToken}`,
          Accept: "application/json",
          "User-Agent": QODER_CLI_USER_AGENT,
        },
        signal,
      },
      proxyOptions,
    );
    if (!res.ok) { cancelResponse(res); return ""; }
    const data = await readModelCatalogResponse(res, signal || new AbortController().signal);
    return data.id || data.userId || data.user_id || "";
  } catch {
    return "";
  }
}

/**
 * Resolve a PAT to a job-token credential, cached per-PAT. Missing identity
 * is retried on the next request without discarding a still-valid job token.
 */
async function resolvePatCredential(pat, proxyOptions = null, signal = null) {
  signal?.throwIfAborted();
  sweepCaches();
  const epoch = generation;
  const imported = getDbImportGeneration();
  const key = createHash("sha256").update(JSON.stringify([pat, getRefreshProxyKey(proxyOptions)])).digest("hex");
  let resolved = patJobCache.get(key);
  if (resolved) { patJobCache.delete(key); patJobCache.set(key, resolved); }
  if (!resolved || resolved.expiresAt - Date.now() <= PAT_REFRESH_BUFFER_MS) {
    const { jobToken, expiresAt } = await exchangeJobToken(pat, proxyOptions, signal);
    resolved = { accessToken: jobToken, userId: "", expiresAt };
    signal?.throwIfAborted();
    if (epoch === generation && imported === getDbImportGeneration()) rememberPat(key, resolved);
  }
  if (!resolved.userId) {
    const userId = await fetchUserIdForJobToken(resolved.accessToken, proxyOptions, signal);
    signal?.throwIfAborted();
    if (userId) {
      // A pending identity lookup may still hold the old cache object after an
      // import. Return its selected result without mutating that shared entry.
      if (epoch === generation && imported === getDbImportGeneration()) resolved.userId = userId;
      else resolved = { ...resolved, userId };
    }
    if (epoch === generation && imported === getDbImportGeneration()) rememberPat(key, resolved);
  }
  return resolved;
}

/**
 * Resolve connection credentials to COSY-signable form:
 *   - PAT (pt-...) connections → exchanged to a job token (jt-...) + userId
 *   - everything else → passed through unchanged
 */
export async function resolveQoderCredentials(credentials, proxyOptions = null, signal = null) {
  signal?.throwIfAborted();
  synchronizeImportGeneration();
  const raw = credentials?.apiKey || credentials?.accessToken;
  if (isQoderPat(raw)) {
    // Standalone usage lookups have no enclosing catalog deadline. Keep an
    // explicit caller's exact signal; otherwise own one for the complete PAT
    // exchange and identity body, including transports that ignore cancellation.
    const controller = signal ? null : new AbortController();
    const activeSignal = signal || controller.signal;
    const deadline = controller ? setTimeout(() => controller.abort(new DOMException("Qoder credential deadline exceeded", "TimeoutError")), FETCH_TIMEOUT_MS) : null;
    try {
      const resolved = await waitForOperation(resolvePatCredential(raw, proxyOptions, activeSignal), activeSignal);
      activeSignal.throwIfAborted();
      return {
        ...credentials,
        accessToken: resolved.accessToken,
        apiKey: undefined,
        providerSpecificData: {
          authMethod: "pat",
          ...(credentials?.providerSpecificData || {}),
          userId: resolved.userId || credentials?.providerSpecificData?.userId || "",
          machineId: credentials?.providerSpecificData?.machineId || "",
        },
      };
    } finally {
      if (deadline !== null) clearTimeout(deadline);
    }
  }
  return credentials;
}

/**
 * Exact proof and native signing identity. Account IDs alone must not share
 * a catalog between different login tokens or machine identities.
 */
function cacheKey(credentials) {
  const psd = credentials?.providerSpecificData || {};
  return createHash("sha256").update(JSON.stringify([
    credentials?.id || credentials?.connectionId || null,
    credentials?.apiKey || null, credentials?.accessToken || null,
    psd.userId || null, psd.machineId || null,
    credentials?.displayName || null, credentials?.email || null,
  ])).digest("hex");
}

/**
 * Strip credential -> COSY creds for buildCosyHeaders.
 */
function cosyCredsFromConnection(credentials) {
  const psd = credentials?.providerSpecificData || {};
  return {
    userId: psd.userId,
    authToken: credentials.accessToken,
    name: credentials.displayName || "",
    email: credentials.email || "",
    machineId: psd.machineId || "",
  };
}

function positiveTokenLimit(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return undefined;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : undefined;
}

/**
 * Fetch the live model list for this credential. Returns:
 *   { models: [{ id, name, maxInputTokens?, maxOutputTokens?, isVL, isReasoning, ... }, ...],
 *     rawConfigs: Map<modelKey, modelConfigObject> }
 * or `null` on any error.
 */
async function fetchQoderCatalogRaw(credentials, signal, proxyOptions = null) {
  const creds = cosyCredsFromConnection(credentials);
  if (!creds.userId || !creds.authToken) return null;

  // Job-token traffic is rejected by api3 ("Login expired" 403) — the
  // official qodercli serves it from api2 instead.
  const modelListUrl = String(creds.authToken).startsWith("jt-")
    ? `${QODER_CHAT_BASE_ALT}/algo/api/v2/model/list`
    : QODER_MODEL_LIST_URL;

  const headers = {
    Accept: "application/json",
    "Accept-Encoding": "identity",
    ...buildCosyHeaders(Buffer.alloc(0), modelListUrl, creds),
  };

  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new DOMException("Qoder catalog deadline exceeded", "TimeoutError")), FETCH_TIMEOUT_MS);
  try {
    combined.throwIfAborted();
    const response = await waitForOperation(proxyAwareFetch(
      modelListUrl,
      { method: "GET", redirect: "error", headers, signal: combined },
      proxyOptions,
    ), combined, cancelResponse);
    combined.throwIfAborted();
    if (!response.ok) { cancelResponse(response); return null; }
    const body = await readModelCatalogResponse(response, combined);
    combined.throwIfAborted();
    if (!body || !Array.isArray(body.chat)) return null;

    const models = [];
    const rawConfigs = new Map();
    for (const entry of body.chat) {
      if (!entry || typeof entry !== "object") continue;
      const key = entry.key;
      if (!key) continue;

      // Always cache the config — chat needs model_config even for UI-hidden
      // models (enable:false). Upstream still accepts chat for these keys.
      rawConfigs.set(key, entry);
      if (entry.enable === false) continue;

      const display = entry.display_name || key;
      const maxInputTokens = positiveTokenLimit(entry.max_input_tokens);
      const maxOutputTokens = positiveTokenLimit(entry.max_output_tokens);
      models.push({
        id: key,
        name: `${display}`,
        // These are directional limits, not a verified total context window.
        ...(maxInputTokens === undefined ? {} : { maxInputTokens }),
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
        isVL: !!entry.is_vl,
        isReasoning: !!entry.is_reasoning,
        description: entry.description || "",
      });
    }

    return { models, rawConfigs };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get the cached model_config block for a given model key, fetching the
 * catalog first if needed. Returns null when the catalog can't be fetched
 * (so callers can fall back to the static registry).
 */
export async function getQoderModelConfig(credentials, modelKey, options = {}) {
  const cached = await resolveQoderModels(credentials, options);
  if (!cached) return null;
  const config = cached.rawConfigs.get(modelKey);
  if (!config) return null;
  // Defensive copy — chat code may mutate `key` to align with the alias path.
  return { ...config, key: modelKey };
}

/**
 * Resolve the live model catalog + raw configs for a credential. Caches
 * results for CACHE_TTL_MS so repeated chat requests don't re-fetch, and
 * deduplicates concurrent misses so parallel chat windows fan-out exactly
 * one upstream request per credential.
 */
export async function resolveQoderModels(credentials, options = {}) {
  options.signal?.throwIfAborted();
  const imported = synchronizeImportGeneration();
  sweepCaches();
  // One entry budget also bounds subscribers/PAT lookups before coalescing.
  if (activeRequests.size >= MODEL_CATALOG_MAX_CACHE_ENTRIES) return null;
  const originalScope = cacheKey(credentials);
  const captured = { ...credentials, providerSpecificData: { ...credentials?.providerSpecificData } };
  const proxyOptions = options.proxyOptions ? { ...options.proxyOptions } : null;
  const proxyScope = getRefreshProxyKey(proxyOptions);
  const epoch = generation;
  const request = { scope: originalScope, controller: new AbortController() };
  activeRequests.add(request);
  const signal = options.signal ? AbortSignal.any([options.signal, request.controller.signal]) : request.controller.signal;
  const deadline = setTimeout(() => request.controller.abort(new DOMException("Qoder catalog deadline exceeded", "TimeoutError")), FETCH_TIMEOUT_MS);
  const unchanged = () => epoch === generation && imported === getDbImportGeneration() && !request.controller.signal.aborted
    && originalScope === cacheKey(credentials) && proxyScope === getRefreshProxyKey(options.proxyOptions);
  try {
    const resolved = await waitForOperation(resolveQoderCredentials(captured, proxyOptions, signal), signal);
    signal.throwIfAborted();
    if (!unchanged() || !resolved?.accessToken || !resolved.providerSpecificData?.userId) return null;
    const key = JSON.stringify([originalScope, cacheKey(resolved), proxyScope]);
    if (!options.forceRefresh) {
      const cached = catalogCache.get(key);
      if (cached) {
        catalogCache.delete(key);
        catalogCache.set(key, cached);
        return cloneCatalog(cached);
      }
    }
    let operation = inflight.get(key);
    if (!operation || options.forceRefresh || operation.controller.signal.aborted) {
      operation = createRefreshOperation(async operationSignal => {
        const fetched = await fetchQoderCatalogRaw(resolved, operationSignal, proxyOptions);
        if (!fetched || operationSignal.aborted || epoch !== generation || imported !== getDbImportGeneration() || inflight.get(key) !== operation) return null;
        const entry = prepareCatalogEntry(fetched);
        rememberCatalog(key, entry);
        return entry;
      });
      inflight.set(key, operation);
      operation.promise.finally(() => {
        if (inflight.get(key) === operation) inflight.delete(key);
      }).catch(() => {});
    }
    const entry = await waitForRefresh(operation, signal);
    signal.throwIfAborted();
    return unchanged() ? cloneCatalog(entry) : null;
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (epoch !== generation || imported !== getDbImportGeneration()
      || request.controller.signal.reason?.name === "AbortError") return null;
    if (options.proxyOptions?.strictProxy === true || error?.message?.includes("strictProxy=true")) throw error;
    options.log?.warn?.("QODER", "Model catalog lookup failed");
    return null;
  } finally {
    clearTimeout(deadline);
    activeRequests.delete(request);
  }
}

export function invalidateQoderCatalog(credentials) {
  if (!credentials) return;
  const scope = cacheKey(credentials);
  const matches = key => JSON.parse(key).slice(0, 2).includes(scope);
  for (const key of catalogCache.keys()) if (matches(key)) dropCatalog(key);
  for (const [key, operation] of inflight) {
    if (!matches(key)) continue;
    inflight.delete(key);
    operation.controller.abort(new DOMException("Qoder catalog invalidated", "AbortError"));
  }
  for (const request of activeRequests) if (request.scope === scope) request.controller.abort(new DOMException("Qoder catalog invalidated", "AbortError"));
}

export function clearQoderCatalog() {
  generation++;
  catalogCache.clear();
  catalogBytes = 0;
  patJobCache.clear();
  patBytes = 0;
  for (const operation of inflight.values()) operation.controller.abort(new DOMException("Qoder catalog cleared", "AbortError"));
  inflight.clear();
  for (const request of activeRequests) request.controller.abort(new DOMException("Qoder catalog cleared", "AbortError"));
}
