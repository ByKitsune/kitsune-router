import { createHash } from "crypto";

import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { getRefreshProxyKey } from "./tokenRefresh/dedup.js";
import { KIMCHI_USER_AGENT } from "../config/clientVersions.js";
import { KIMCHI_API_BASE, KIMCHI_CATALOG_CONFIG, KIMCHI_ORGANIZATION_HEADER,
  normalizeKimchiEndpoint, readKimchiOrganizationId, readKimchiToken } from "../config/kimchiConfig.js";

export const KIMCHI_API = KIMCHI_API_BASE;
// KIMCHI_USER_AGENT is single-sourced from open-sse/config/clientVersions.js
// (verified 2026-08-25 against kimchi.dev landing page + getkimchi/kimchi repo).
// Re-exported here for legacy callers that import from this module.
export { KIMCHI_USER_AGENT };

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** @type {Map<string, { expiresAt: number, models: object[], rawModels: object[] }>} */
const catalogCache = new Map();
const metadataByScope = new Map();

export function buildKimchiModelsUrl(endpoint) {
  return `${normalizeKimchiEndpoint(endpoint)}/v1/models/metadata?include_in_cli=true`;
}

function cacheKey(credentials, endpoint) {
  return createHash("sha256")
    .update(JSON.stringify([normalizeKimchiEndpoint(endpoint), readKimchiToken(credentials), readKimchiOrganizationId(credentials)]))
    .digest("hex");
}

function setBounded(cache, key, value) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > KIMCHI_CATALOG_CONFIG.maxEntries) cache.delete(cache.keys().next().value);
}

function toModelKind(inputModalities) {
  return Array.isArray(inputModalities) && inputModalities.includes("image")
    ? "imageToText"
    : "llm";
}

export function normalizeKimchiModel(item) {
  if (!item || typeof item !== "object") return null;
  const id = item.slug || item.id || item.model || item.name;
  if (typeof id !== "string" || id.trim() === "") return null;

  const inputModalities = Array.isArray(item.input_modalities)
    ? item.input_modalities.filter((value) => value === "text" || value === "image")
    : [];
  const limits = item.limits && typeof item.limits === "object" ? item.limits : {};
  const contextLength = Number(limits.context_window || item.contextLength || item.context_length) || undefined;
  const maxOutputTokens = Number(limits.max_output_tokens || item.maxOutputTokens || item.max_output_tokens) || undefined;
  const upstreamProvider = typeof item.provider === "string" ? item.provider : "";
  const reasoning = item.reasoning === true;
  const kind = toModelKind(inputModalities);

  const model = {
    ...item,
    id: id.trim(),
    name: String(item.display_name || item.displayName || item.name || id).trim(),
    provider: upstreamProvider,
    upstreamProvider,
    reasoning,
    inputModalities,
    kind,
    type: kind,
    capabilities: {
      vision: inputModalities.includes("image"),
      reasoning,
      ...(contextLength ? { contextWindow: contextLength } : {}),
      ...(maxOutputTokens ? { maxOutput: maxOutputTokens } : {}),
      ...(upstreamProvider ? { upstreamProvider } : {}),
    },
    ...(contextLength ? { contextLength } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
  };

  if (upstreamProvider === "anthropic") {
    model.compat = { supportsReasoningEffort: false, cacheControlFormat: "anthropic" };
  }

  return model;
}

function rememberModels(scope, models, expiresAt) {
  setBounded(metadataByScope, scope, { expiresAt, models: new Map(models.map(model => [model.id, model])) });
}

export function getCachedKimchiModelMetadata(modelId, credentials, options = {}) {
  if (typeof modelId !== "string" || !modelId || !readKimchiToken(credentials)) return null;
  const endpoint = credentials?.providerSpecificData?.kimchiEndpoint || options.endpoint || KIMCHI_API;
  const scope = cacheKey(credentials, endpoint);
  const entry = metadataByScope.get(scope);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { metadataByScope.delete(scope); return null; }
  // Literal hosted IDs are case-sensitive; do not invent vendor/slash aliases.
  return entry.models.get(modelId) || null;
}

async function fetchKimchiCatalogRaw(token, endpoint, options = {}) {
  const url = buildKimchiModelsUrl(endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Kimchi models fetch timeout")), KIMCHI_CATALOG_CONFIG.fetchTimeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  try {
    const response = await proxyAwareFetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
        "User-Agent": KIMCHI_USER_AGENT,
        ...(options.organizationId ? { [KIMCHI_ORGANIZATION_HEADER]: options.organizationId } : {}),
      },
      cache: "no-store",
      signal,
    }, options.proxyOptions || null);

    if (!response.ok) {
      const error = new Error(`Kimchi models ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.retryable = RETRYABLE_STATUSES.has(response.status);
      throw error;
    }

    const data = await response.json();
    return Array.isArray(data?.models) ? data.models : [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveKimchiModels(credentials, options = {}) {
  const token = readKimchiToken(credentials);
  if (!token) return null;

  const endpoint = credentials?.providerSpecificData?.kimchiEndpoint || options.endpoint || KIMCHI_API;
  const scope = cacheKey(credentials, endpoint);
  const key = JSON.stringify([scope, getRefreshProxyKey(options.proxyOptions)]);
  const now = Date.now();
  if (!options.forceRefresh) {
    const cached = catalogCache.get(key);
    if (cached && cached.expiresAt > now) {
      rememberModels(scope, cached.models, cached.expiresAt);
      return cached;
    }
    if (cached) catalogCache.delete(key);
  }

  let rawModels;
  try {
    rawModels = await fetchKimchiCatalogRaw(token, endpoint, { ...options, organizationId: readKimchiOrganizationId(credentials) });
  } catch (error) {
    if (error?.message?.includes("strictProxy=true")) throw error;
    options.log?.warn?.("KIMCHI_MODELS", error.message);
    return null;
  }

  const models = rawModels.map(normalizeKimchiModel).filter(Boolean);
  if (models.length === 0) return null;

  const entry = {
    expiresAt: Date.now() + KIMCHI_CATALOG_CONFIG.ttlMs,
    models,
    rawModels,
  };
  rememberModels(scope, models, entry.expiresAt);
  setBounded(catalogCache, key, entry);
  return entry;
}

export function clearKimchiCatalog() {
  catalogCache.clear();
  metadataByScope.clear();
}
