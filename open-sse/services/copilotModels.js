/**
 * GitHub Copilot model catalog fetcher.
 *
 * Calls Copilot's `GET /models` endpoint to get the live catalog for an
 * authenticated account, so `/v1/models` reflects what the account can
 * actually use, including new releases and account-specific availability, instead of
 * the hand-maintained static registry, which inevitably lags behind.
 *
 * Returns chat-capable models the account's policy allows. Embeddings and
 * disabled models are filtered out.
 */

import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { GITHUB_COPILOT } from "../config/appConstants.js";
import { refreshCopilotToken } from "./tokenRefresh.js";
import { getRefreshProxyKey } from "./tokenRefresh/dedup.js";
import { createHash } from "node:crypto";
import {
  MODEL_CATALOG_CACHE_TTL_MS,
  MODEL_CATALOG_MAX_CACHE_BYTES,
  MODEL_CATALOG_MAX_CACHE_ENTRIES,
} from "../config/modelCatalog.js";
import { readModelCatalogResponse } from "../utils/modelCatalog.js";
import { getDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";

const MODELS_URL = "https://api.githubcopilot.com/models";
const FETCH_TIMEOUT_MS = 10_000;

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

function remember(key, result) {
  const bytes = Buffer.byteLength(JSON.stringify(result));
  sweepExpired();
  removeCached(key);
  if (bytes > MODEL_CATALOG_MAX_CACHE_BYTES) return;
  while (catalogCache.size >= MODEL_CATALOG_MAX_CACHE_ENTRIES || cacheBytes + bytes > MODEL_CATALOG_MAX_CACHE_BYTES) {
    removeCached(catalogCache.keys().next().value);
  }
  catalogCache.set(key, { ...structuredClone(result), bytes, expiresAt: Date.now() + MODEL_CATALOG_CACHE_TTL_MS });
  cacheBytes += bytes;
}

function cacheKey(credentials) {
  // The GitHub proof can refresh a stale Copilot token. Keep both credentials
  // and the selected connection scoped, rather than keying by that token alone.
  return createHash("sha256").update(JSON.stringify([
    credentials?.id || credentials?.connectionId || null,
    credentials?.providerSpecificData?.copilotToken || null,
    credentials?.accessToken || null,
  ])).digest("hex");
}

function buildHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "Copilot-Integration-Id": "vscode-chat",
    "editor-version": `vscode/${GITHUB_COPILOT.VSCODE_VERSION}`,
    "editor-plugin-version": `copilot-chat/${GITHUB_COPILOT.COPILOT_CHAT_VERSION}`,
    "user-agent": GITHUB_COPILOT.USER_AGENT,
    "x-github-api-version": GITHUB_COPILOT.API_VERSION,
  };
}

async function fetchCatalogRaw(token, signal, proxyOptions = null) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    requestSignal.throwIfAborted();
    const response = await proxyAwareFetch(MODELS_URL, {
      method: "GET",
      redirect: "error",
      headers: buildHeaders(token),
      cache: "no-store",
      signal: requestSignal,
    }, proxyOptions);
    if (requestSignal.aborted || !response.ok) {
      void response.body?.cancel().catch(() => {});
      requestSignal.throwIfAborted();
      const err = new Error(`Copilot /models returned ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const data = await readModelCatalogResponse(response, requestSignal);
    return Array.isArray(data?.data) ? data.data : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// Keep only chat models the account is allowed to use. The static registry
// surfaced disabled/embedding entries inconsistently; here we trust upstream.
function expandCatalog(raw) {
  const seen = new Set();
  const models = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    if (m.capabilities?.type !== "chat") continue;
    if (m.policy && m.policy.state !== "enabled") continue;
    const id = m.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const contextLength = Number(m.capabilities?.limits?.max_context_window_tokens) || undefined;
    const maxOutputTokens = Number(m.capabilities?.limits?.max_output_tokens) || undefined;
    const supportsVision = m.capabilities?.supports?.vision === true;
    const caps = {};
    if (contextLength) caps.contextWindow = contextLength;
    if (maxOutputTokens) caps.maxOutput = maxOutputTokens;
    if (supportsVision) caps.vision = true;

    models.push({
      id,
      name: m.name || id,
      ...(Object.keys(caps).length > 0 ? { capabilities: caps } : {}),
      ...(contextLength ? { contextLength } : {}),
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
    });
  }
  return models;
}

/**
 * Resolve the live Copilot model catalog for a connection.
 *
 * @param {object} credentials Connection record (accessToken, refreshToken,
 *   providerSpecificData {copilotToken, copilotTokenExpiresAt}).
 * @param {object} [options]
 * @param {boolean} [options.forceRefresh] Bypass the per-credential cache.
 * @param {object}  [options.log] Logger.
 * @param {function} [options.onCredentialsRefreshed] Persist a refreshed
 *   Copilot token back to your store. Called with `{ copilotToken,
 *   copilotTokenExpiresAt }` whenever a 401 triggers a refresh.
 * @returns {Promise<{ models: object[] } | null>}
 */
export async function resolveCopilotModels(credentials, options = {}) {
  if (options.signal?.aborted) return null;
  const token = credentials?.providerSpecificData?.copilotToken || credentials?.accessToken;
  if (!token) {
    options.log?.debug?.("COPILOT_MODELS", "No copilotToken/accessToken; skipping live fetch");
    return null;
  }

  if (importedGeneration !== getDbImportGeneration()) clearCopilotModelCache();

  const epoch = generation;
  const imported = importedGeneration;
  const scope = cacheKey(credentials);
  const proxyKey = getRefreshProxyKey(options.proxyOptions);
  const key = JSON.stringify([scope, proxyKey]);
  const proxyOptions = options.proxyOptions ? { ...options.proxyOptions } : null;
  const selected = { ...credentials, providerSpecificData: { ...credentials.providerSpecificData } };
  const unchanged = () => !options.signal?.aborted && epoch === generation
    && imported === getDbImportGeneration()
    && scope === cacheKey(credentials) && proxyKey === getRefreshProxyKey(options.proxyOptions);
  sweepExpired();
  if (!options.forceRefresh) {
    const cached = catalogCache.get(key);
    if (cached) return structuredClone({ models: cached.models });
  }

  let raw;
  try {
    raw = await fetchCatalogRaw(token, options.signal, proxyOptions);
  } catch (err) {
    if (err?.message?.includes("strictProxy=true")) throw err;
    if (!unchanged()) return null;
    // A 401/403 means the Copilot token is stale — refresh from the GitHub
    // access token and retry once.
    if (err && (err.status === 401 || err.status === 403) && selected.accessToken) {
      options.log?.info?.("COPILOT_MODELS", `Got ${err.status}; refreshing Copilot token`);
      let refreshed;
      try {
        refreshed = await refreshCopilotToken(selected.accessToken, options.log, proxyOptions, options.signal);
      } catch (error) {
        if (error?.message?.includes("strictProxy=true")) throw error;
        options.log?.warn?.("COPILOT_MODELS", `Token refresh failed: ${error?.message || error}`);
        return null;
      }
      if (!unchanged()) return null;
      if (refreshed?.token) {
        if (typeof options.onCredentialsRefreshed === "function") {
          try {
            await options.onCredentialsRefreshed({
              copilotToken: refreshed.token,
              copilotTokenExpiresAt: refreshed.expiresAt,
            });
          } catch (e) {
            options.log?.warn?.("COPILOT_MODELS", `onCredentialsRefreshed failed: ${e?.message || e}`);
          }
        }
        if (!unchanged()) return null;
        try {
          raw = await fetchCatalogRaw(refreshed.token, options.signal, proxyOptions);
        } catch (err2) {
          if (err2?.message?.includes("strictProxy=true")) throw err2;
          options.log?.warn?.("COPILOT_MODELS", `Retry after refresh failed: ${err2?.message || err2}`);
          return null;
        }
      } else {
        options.log?.warn?.("COPILOT_MODELS", "Token refresh did not return a token");
        return null;
      }
    } else {
      options.log?.warn?.("COPILOT_MODELS", `Live model fetch failed: ${err?.message || err}`);
      return null;
    }
  }

  if (!unchanged()) return null;

  const models = expandCatalog(raw);
  if (!models.length) return null;

  const result = { models };
  remember(key, result);
  return structuredClone(result);
}

export function clearCopilotModelCache() {
  catalogCache.clear();
  cacheBytes = 0;
  generation++;
  importedGeneration = getDbImportGeneration();
}
