import { createHash } from "node:crypto";
import { CODEX_CATALOG_HIDDEN_VISIBILITIES, CODEX_CATALOG_KINDS, CODEX_CATALOG_LIMIT_FIELDS, CODEX_CATALOG_VISIBILITIES, CODEX_MODELS_URL } from "../config/codexModels.js";
import { CODEX_USER_AGENT } from "../config/clientVersions.js";
import {
  MODEL_CATALOG_CACHE_TTL_MS,
  MODEL_CATALOG_MAX_CACHE_BYTES,
  MODEL_CATALOG_MAX_CACHE_ENTRIES,
  MODEL_CATALOG_TIMEOUT_MS,
} from "../config/modelCatalog.js";
import { MODEL_DEFAULTS, inferModelKind } from "../providers/models/schema.js";
import { DEFAULT_CAPABILITIES } from "../providers/capabilities.js";
import { getDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { readModelCatalogResponse } from "../utils/modelCatalog.js";
import { getRefreshProxyKey } from "./tokenRefresh/dedup.js";

const cache = new Map();
let cacheBytes = 0;
let generation = 0;
let importedGeneration = getDbImportGeneration();

export function clearCodexModelsCache() {
  cache.clear();
  cacheBytes = 0;
  generation++;
}

function accountId(credentials) {
  const value = credentials?.providerSpecificData?.workspaceId
    || credentials?.providerSpecificData?.chatgptAccountId
    || credentials?.providerSpecificData?.accountId;
  return typeof value === "string" && value ? value : null;
}

function scopeKey(credentials, proxyOptions) {
  return createHash("sha256").update(JSON.stringify([
    CODEX_MODELS_URL, CODEX_USER_AGENT, credentials?.id || credentials?.connectionId || null,
    credentials?.accessToken || null, accountId(credentials), getRefreshProxyKey(proxyOptions),
  ])).digest("hex");
}

const tokenLimit = value => (typeof value === "number" || typeof value === "string" && value.trim() !== "")
  && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;

function declaredCapabilities(value) {
  const caps = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return caps;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "boolean" && typeof DEFAULT_CAPABILITIES[key] === "boolean") caps[key] = item;
    else if (["contextWindow", "maxInput", "maxOutput"].includes(key)) {
      const limit = tokenLimit(item);
      if (limit !== undefined) caps[key] = limit;
    }
  }
  return caps;
}

export function parseCodexModels(data) {
  const rows = Array.isArray(data) ? data : data?.data ?? data?.models ?? data?.results;
  if (!Array.isArray(rows)) throw new Error("Invalid Codex model catalog");
  const seen = new Set();
  const normalized = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid Codex model row");
    const id = row.id ?? row.slug ?? row.model ?? row.name;
    if (typeof id !== "string" || !id.trim()) throw new Error("Invalid Codex model identifier");
    if (row.visibility !== undefined && !CODEX_CATALOG_VISIBILITIES.has(row.visibility)) throw new Error("Invalid Codex model visibility");
    if (seen.has(id)) continue;
    seen.add(id);
    if (CODEX_CATALOG_HIDDEN_VISIBILITIES.has(row.visibility)) continue;
    const name = [row.display_name, row.displayName, row.name].find(value => typeof value === "string" && value) || id;
    // type:"model" describes the native object, not a gateway service kind.
    const declaredKind = row.kind || (row.type === "model" ? null : row.type);
    if (declaredKind && !CODEX_CATALOG_KINDS.has(declaredKind)) throw new Error("Invalid Codex model service kind");
    const kind = declaredKind || inferModelKind({ ...row, id }) || MODEL_DEFAULTS.kind;
    const model = { ...row, id, name, kind };
    for (const field of CODEX_CATALOG_LIMIT_FIELDS) {
      if (!Object.hasOwn(model, field)) continue;
      const value = tokenLimit(model[field]);
      if (value === undefined) delete model[field];
      else model[field] = value;
    }
    // Preserve optional native fields while projecting only typed public facts.
    if (Object.hasOwn(model, "capabilities")) model.capabilities = declaredCapabilities(model.capabilities);
    if (Object.hasOwn(model, "caps")) model.caps = declaredCapabilities(model.caps);
    normalized.push(model);
  }
  return normalized.flatMap(model => {
    if (model.kind !== MODEL_DEFAULTS.kind || model.id.endsWith("-review") || seen.has(`${model.id}-review`)) return [model];
    return [model, { ...model, id: `${model.id}-review`, name: `${model.name} Review`, upstreamModelId: model.id, quotaFamily: "review" }];
  });
}

function dropCached(key) {
  const entry = cache.get(key);
  if (!entry) return;
  cacheBytes -= entry.bytes;
  cache.delete(key);
}

function remember(key, result) {
  const value = JSON.stringify(result);
  const bytes = Buffer.byteLength(value);
  if (bytes > MODEL_CATALOG_MAX_CACHE_BYTES) return;
  dropCached(key);
  cache.set(key, { value, bytes, expiresAt: Date.now() + MODEL_CATALOG_CACHE_TTL_MS });
  cacheBytes += bytes;
  while (cache.size > MODEL_CATALOG_MAX_CACHE_ENTRIES || cacheBytes > MODEL_CATALOG_MAX_CACHE_BYTES) {
    dropCached(cache.keys().next().value);
  }
}

// Bound even an injected transport/refresh callback that fails to settle on
// abort. A late response is cancelled and can never populate this cache.
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
  try {
    return await Promise.race([operation, cancellation]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** Read-only account catalog; public callers never rotate credentials. */
export async function resolveCodexModels(credentials, options = {}) {
  options.signal?.throwIfAborted();
  if (!credentials?.accessToken) return null;
  const imported = getDbImportGeneration();
  if (imported !== importedGeneration) {
    importedGeneration = imported;
    clearCodexModelsCache();
  }
  const proxyOptions = options.proxyOptions || null;
  let expectedScope = scopeKey(credentials, proxyOptions);
  let cacheScope = expectedScope;
  if (!options.forceRefresh) {
    const cached = cache.get(cacheScope);
    if (cached?.expiresAt > Date.now()) return JSON.parse(cached.value);
    dropCached(cacheScope);
  }
  const epoch = generation;
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const deadline = setTimeout(() => controller.abort(new DOMException("Model catalog deadline exceeded", "TimeoutError")), MODEL_CATALOG_TIMEOUT_MS);
  const selectedAccount = accountId(credentials);
  const selectedBinding = scopeKey({ ...credentials, accessToken: null }, proxyOptions);
  let token = credentials.accessToken;
  const unchanged = () => epoch === generation && imported === getDbImportGeneration() && expectedScope === scopeKey(credentials, proxyOptions);
  const cancelBody = response => { void response?.body?.cancel().catch(() => {}); };
  const request = () => waitForOperation(Promise.resolve().then(() => {
    signal.throwIfAborted();
    // Dispatch is queued: an import or caller mutation may have invalidated
    // the selected destination since scope selection. Reject before sending
    // the proof, not merely before publishing the eventual response.
    if (!unchanged()) throw new Error("Codex catalog scope changed before dispatch");
    return (options.fetchFn || proxyAwareFetch)(CODEX_MODELS_URL, {
      method: "GET", redirect: "error", cache: "no-store", signal,
      headers: {
        Accept: "application/json", "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, originator: "codex_cli_rs", "User-Agent": CODEX_USER_AGENT,
        ...(selectedAccount ? { "ChatGPT-Account-ID": selectedAccount } : {}),
      },
    }, proxyOptions);
  }), signal, cancelBody);

  try {
    let response = await request();
    signal.throwIfAborted();
    if ((response.status === 401 || response.status === 403) && typeof options.onUnauthorized === "function") {
      cancelBody(response);
      // Only an explicit dashboard policy may refresh; a public listing does
      // not consume/rotate a pooled account's refresh proof.
      if (!unchanged()) return null;
      const refreshed = await waitForOperation(Promise.resolve().then(() => {
        signal.throwIfAborted();
        if (!unchanged()) throw new Error("Codex catalog scope changed before refresh");
        return options.onUnauthorized(signal);
      }), signal);
      signal.throwIfAborted();
      if (epoch !== generation || imported !== getDbImportGeneration()
        || selectedBinding !== scopeKey({ ...credentials, accessToken: null }, proxyOptions)) return null;
      if (typeof refreshed?.accessToken !== "string" || !refreshed.accessToken) return null;
      token = refreshed.accessToken;
      expectedScope = scopeKey(credentials, proxyOptions);
      cacheScope = scopeKey({ ...credentials, accessToken: token }, proxyOptions);
      response = await request();
    }
    signal.throwIfAborted();
    if (!response.ok) {
      cancelBody(response);
      const error = new Error(`Codex catalog request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    const models = parseCodexModels(await readModelCatalogResponse(response, signal));
    signal.throwIfAborted();
    if (!unchanged()) return null;
    // A complete empty/hidden-only result is authoritative, not a failed fetch
    // that may be replaced by unrelated static model suggestions.
    const result = { models, complete: true };
    remember(cacheScope, result);
    return result;
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (proxyOptions?.strictProxy === true || error?.message?.includes("strictProxy=true")) throw error;
    return null;
  } finally {
    clearTimeout(deadline);
  }
}
