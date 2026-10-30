import { createHash } from "node:crypto";
import { PROVIDERS } from "../config/providers.js";
import { GEMINI_AUTH_USER_AGENT, GEMINI_CLI_API_CLIENT, ANTIGRAVITY_CLI_USER_AGENT, ANTIGRAVITY_CLI_VERSION } from "../config/clientVersions.js";
import { MODEL_CATALOG_CACHE_TTL_MS, MODEL_CATALOG_TIMEOUT_MS, MODEL_CATALOG_MAX_CACHE_ENTRIES, MODEL_CATALOG_MAX_CACHE_BYTES } from "../config/modelCatalog.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { readModelCatalogResponse } from "../utils/modelCatalog.js";
import { inferModelKind, modelKind } from "../providers/models/schema.js";
import { DEFAULT_CAPABILITIES } from "../providers/capabilities.js";
import { ANTIGRAVITY_RETIRED_FLASH_IDS } from "../config/antigravity.js";
import { getModelsByProviderId } from "../config/providerModels.js";
import { normalizeCloudCodeProjectId } from "./usage/shared.js";
import { createRefreshOperation, getRefreshProxyKey, waitForRefresh } from "./tokenRefresh/dedup.js";
import { getDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";

const cache = new Map();
const inflight = new Map();
let cacheBytes = 0;
let generation = 0;
let importedGeneration = getDbImportGeneration();

const limit = value => (typeof value === "number" || typeof value === "string" && value.trim() !== "")
  && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;

function catalogRows(data) {
  if (Array.isArray(data?.models)) return data.models.map(info => [info?.id || info?.model || info?.name, info]);
  return data?.models && typeof data.models === "object" ? Object.entries(data.models) : null;
}

const validDescriptor = ([id, info]) => typeof id === "string" && !!id.trim()
  && info && typeof info === "object" && !Array.isArray(info);

// Both endpoints return account-specific CloudCode models, not public GenAI
// models. Never transplant API-key names, infer plan access or expose quota data.
export function parseGoogleOAuthModels(provider, data) {
  const rows = catalogRows(data) || [];
  const registered = new Map(getModelsByProviderId(provider).map(row => [row.id, row]));
  const models = new Map();
  for (const [id, info] of rows) {
    if (!validDescriptor([id, info]) || info.isInternal) continue;
    if (provider === "antigravity" && ANTIGRAVITY_RETIRED_FLASH_IDS.has(id)) continue;
    const capabilities = {};
    for (const [field, value] of Object.entries(info.capabilities || {})) {
      if (typeof value === "boolean" && typeof DEFAULT_CAPABILITIES[field] === "boolean") capabilities[field] = value;
    }
    for (const [field, value] of Object.entries({
      contextWindow: info.contextWindow ?? info.capabilities?.contextWindow,
      maxInput: info.maxInputTokens ?? info.inputTokenLimit ?? info.capabilities?.maxInput,
      maxOutput: info.maxOutputTokens ?? info.outputTokenLimit ?? info.capabilities?.maxOutput,
    })) {
      const parsed = limit(value);
      if (parsed !== undefined) capabilities[field] = parsed;
    }
    const declaredKind = ["llm", "image", "video", "embedding", "tts", "stt", "search"].includes(info.kind || info.type)
      ? info.kind || info.type : undefined;
    const known = registered.get(id);
    const kind = known ? modelKind(known) : declaredKind || inferModelKind({ id }) || "llm";
    const name = typeof info.displayName === "string" ? info.displayName : typeof info.name === "string" ? info.name : id;
    const row = { id, name, kind, ...(Object.keys(capabilities).length ? { capabilities } : {}) };
    if (typeof info.description === "string") row.description = info.description;
    models.set(id, row);
  }
  return [...models.values()];
}

function profile(provider) {
  if (provider === "gemini-cli") return {
    url: `${PROVIDERS[provider].baseUrl}:fetchAvailableModels`,
    headers: { "User-Agent": GEMINI_AUTH_USER_AGENT, "X-Goog-Api-Client": GEMINI_CLI_API_CLIENT },
  };
  if (provider === "antigravity") return {
    url: PROVIDERS[provider].usage.quotaApiUrl,
    headers: { "User-Agent": ANTIGRAVITY_CLI_USER_AGENT, "X-Client-Name": "antigravity", "X-Client-Version": ANTIGRAVITY_CLI_VERSION },
  };
  return null;
}

function project(connection) {
  return normalizeCloudCodeProjectId(connection.projectId)
    || normalizeCloudCodeProjectId(connection.providerSpecificData?.projectId);
}

function removeCached(key) {
  const existing = cache.get(key);
  if (existing) cacheBytes -= existing.bytes;
  cache.delete(key);
}

function remember(key, models) {
  const bytes = Buffer.byteLength(JSON.stringify(models));
  if (bytes > MODEL_CATALOG_MAX_CACHE_BYTES) return;
  removeCached(key);
  while (cache.size && (cache.size >= MODEL_CATALOG_MAX_CACHE_ENTRIES || cacheBytes + bytes > MODEL_CATALOG_MAX_CACHE_BYTES)) {
    removeCached(cache.keys().next().value);
  }
  cache.set(key, { models, bytes, expiresAt: Date.now() + MODEL_CATALOG_CACHE_TTL_MS });
  cacheBytes += bytes;
}

export function clearGoogleOAuthModelsCache() {
  cache.clear();
  inflight.clear();
  cacheBytes = 0;
  generation++;
  importedGeneration = getDbImportGeneration();
}

/** Read only metadata. Public callers omit onUnauthorized and never refresh. */
export async function resolveGoogleOAuthModels(provider, connection, options = {}) {
  const callerSignal = options.signal;
  callerSignal?.throwIfAborted();
  const selected = profile(provider);
  if (!selected || typeof connection?.accessToken !== "string" || !connection.accessToken.trim()
    || connection.provider && connection.provider !== provider) return null;
  if (importedGeneration !== getDbImportGeneration()) clearGoogleOAuthModelsCache();
  // Defer transport, never its credential/policy binding. Managers may rotate
  // or replace the caller's objects while a coalesced request is queued.
  const binding = { accessToken: connection.accessToken, projectId: project(connection) };
  const proxyOptions = options.proxyOptions ? { ...options.proxyOptions } : options.proxyOptions;
  const onUnauthorized = options.onUnauthorized;
  const requestGeneration = generation;
  const requestImport = importedGeneration;
  const key = createHash("sha256").update(JSON.stringify([
    provider, connection.id || null, binding.accessToken, binding.projectId,
    selected, getRefreshProxyKey(proxyOptions), requestImport, typeof onUnauthorized === "function",
  ])).digest("hex");
  if (options.useCache !== false && !options.forceRefresh) {
    const saved = cache.get(key);
    if (saved && saved.expiresAt > Date.now()) return { models: structuredClone(saved.models), complete: true };
    removeCached(key);
  }
  let operation = inflight.get(key);
  if (operation?.controller.signal.aborted) {
    inflight.delete(key);
    operation = null;
  }
  if (!operation) {
    if (inflight.size >= MODEL_CATALOG_MAX_CACHE_ENTRIES) return null;
    operation = createRefreshOperation(async operationSignal => {
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new Error("Model catalog deadline exceeded")), MODEL_CATALOG_TIMEOUT_MS);
      const signal = AbortSignal.any([operationSignal, deadline.signal]);
      const request = async current => {
        signal.throwIfAborted();
        const projectId = project(current);
        return proxyAwareFetch(selected.url, {
          method: "POST", redirect: "error", cache: "no-store", signal,
          headers: { "Content-Type": "application/json", Accept: "application/json", ...selected.headers, Authorization: `Bearer ${current.accessToken}` },
          body: JSON.stringify(projectId ? { project: projectId } : {}),
        }, proxyOptions);
      };
      try {
        let response = await request(binding);
        let refreshed = false;
        if ([401, 403].includes(response.status) && typeof onUnauthorized === "function") {
          void response.body?.cancel().catch(() => {});
          const next = await onUnauthorized(signal);
          signal.throwIfAborted();
          if (!next?.accessToken) return null;
          refreshed = true;
          response = await request(next);
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          return null;
        }
        const data = await readModelCatalogResponse(response, signal);
        const rows = catalogRows(data);
        // A failed/partial contract cannot establish that the account has no
        // models. A verified complete empty/internal-only response can.
        if (!rows || !rows.every(validDescriptor) || data.nextPageToken || data.has_more === true) return null;
        const models = parseGoogleOAuthModels(provider, data);
        if (requestGeneration !== generation || requestImport !== getDbImportGeneration()) return null;
        // A rotated credential is never cached under the proof it replaced.
        if (!refreshed) remember(key, models);
        return { models, complete: true };
      } finally {
        clearTimeout(timer);
      }
    });
    inflight.set(key, operation);
    void operation.promise.finally(() => { if (inflight.get(key) === operation) inflight.delete(key); }).catch(() => {});
  }
  try {
    const result = await waitForRefresh(operation, callerSignal);
    return result ? { models: structuredClone(result.models), complete: result.complete === true } : null;
  } catch (error) {
    callerSignal?.throwIfAborted();
    if (proxyOptions?.strictProxy === true) throw error;
    return null;
  }
}
