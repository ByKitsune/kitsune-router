/**
 * Cursor live model catalog fetcher.
 *
 * Cursor exposes the account-specific model picker through the AgentService
 * `GetUsableModels` Connect RPC. Unlike the static provider registry, this
 * includes models newly enabled for the account and omits unavailable ones.
 */

import crypto from "crypto";
import http2 from "http2";
import { PROVIDER_OAUTH } from "../providers/index.js";
import { buildCursorHeaders } from "../utils/cursorChecksum.js";
import { decodeMessage } from "../utils/cursorProtobuf.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { getRefreshProxyKey } from "./tokenRefresh/dedup.js";
import {
  MODEL_CATALOG_CACHE_TTL_MS,
  MODEL_CATALOG_MAX_BYTES,
  MODEL_CATALOG_MAX_CACHE_BYTES,
  MODEL_CATALOG_MAX_CACHE_ENTRIES,
} from "../config/modelCatalog.js";
import { getDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";

const FETCH_TIMEOUT_MS = 10_000;

// agent.v1.ModelDetails protobuf field numbers.
const MODEL_ID_FIELD = 1;
const DISPLAY_MODEL_ID_FIELD = 3;
const DISPLAY_NAME_FIELD = 4;
const DISPLAY_NAME_SHORT_FIELD = 5;
const RESPONSE_MODELS_FIELD = 1;

/** @type {Map<string, { expiresAt: number, value: string, bytes: number }>} */
const catalogCache = new Map();
let cacheBytes = 0;
let cacheGeneration = 0;
let importedGeneration = getDbImportGeneration();

function getCursorModelsUrl() {
  const config = PROVIDER_OAUTH.cursor;
  if (!config?.agentEndpoint || !config?.modelsEndpoint) return null;
  return `${config.agentEndpoint.replace(/\/$/, "")}${config.modelsEndpoint}`;
}

function cacheKey(credentials, proxyOptions) {
  return crypto.createHash("sha256").update(JSON.stringify([
    getCursorModelsUrl(), credentials?.id || credentials?.connectionId || null,
    credentials?.accessToken, credentials?.providerSpecificData?.machineId,
    credentials?.providerSpecificData?.ghostMode !== false,
    getRefreshProxyKey(proxyOptions),
    proxyOptions?.proxyPoolId ?? proxyOptions?.connectionProxyPoolId ?? null,
  ])).digest("hex");
}

function forget(key) {
  const previous = catalogCache.get(key);
  if (!previous) return;
  cacheBytes -= previous.bytes;
  catalogCache.delete(key);
}

function remember(key, result) {
  const value = JSON.stringify(result);
  const bytes = Buffer.byteLength(value);
  if (bytes > MODEL_CATALOG_MAX_CACHE_BYTES) return;
  forget(key);
  catalogCache.set(key, { value, bytes, expiresAt: Date.now() + MODEL_CATALOG_CACHE_TTL_MS });
  cacheBytes += bytes;
  while (catalogCache.size > MODEL_CATALOG_MAX_CACHE_ENTRIES || cacheBytes > MODEL_CATALOG_MAX_CACHE_BYTES) {
    forget(catalogCache.keys().next().value);
  }
}

function firstString(fields, fieldNumber) {
  const value = fields.get(fieldNumber)?.[0]?.value;
  if (!value || typeof value === "number") return "";
  return Buffer.from(value).toString("utf8");
}

/**
 * Decode Cursor's `agent.v1.GetUsableModelsResponse` protobuf payload.
 * The response contains repeated `agent.v1.ModelDetails` messages in field 1.
 */
export function parseCursorUsableModels(payload) {
  const response = decodeMessage(payload);
  const seen = new Set();
  const models = [];

  for (const entry of response.get(RESPONSE_MODELS_FIELD) || []) {
    if (!entry?.value || typeof entry.value === "number") continue;
    const detail = decodeMessage(entry.value);
    const id = firstString(detail, MODEL_ID_FIELD).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const name = (
      firstString(detail, DISPLAY_NAME_FIELD)
      || firstString(detail, DISPLAY_NAME_SHORT_FIELD)
      || firstString(detail, DISPLAY_MODEL_ID_FIELD)
      || id
    ).trim();
    models.push({ id, name });
  }

  return models;
}

/**
 * agent.api5.cursor.sh is HTTP/2-only; Node fetch/undici cannot speak h2.
 * Unary GetUsableModels uses an unframed protobuf body (application/proto).
 */
function http2PostProto(url, headers, body, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const chunks = [];
    let bytes = 0;
    let responseHeaders = {};
    let settled = false;
    let client;
    let req;
    const onAbort = () => finish(reject, signal.reason);
    const finish = (callback, value, complete = false) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      chunks.length = 0;
      if (!complete) {
        try { req?.close?.(http2.constants?.NGHTTP2_CANCEL); } catch {}
        try { req?.destroy?.(); } catch {}
        try { client?.destroy?.(); } catch {}
      }
      try { client?.close(); } catch {}
      callback(value);
    };
    const onError = error => finish(reject, error);
    const onClose = () => finish(reject, new Error("Cursor catalog transport closed before completion"));
    try {
      const urlObj = new URL(url);
      client = http2.connect(`https://${urlObj.host}`);
      client.on("error", onError);
      client.on("close", onClose);
      req = client.request({
        ":method": "POST",
        ":path": urlObj.pathname,
        ":authority": urlObj.host,
        ":scheme": "https",
        ...headers,
      });
      req.on("response", (hdrs) => { responseHeaders = hdrs; });
      req.on("data", (chunk) => {
        if (settled) return;
        bytes += chunk.byteLength;
        if (bytes > MODEL_CATALOG_MAX_BYTES) return onError(new Error("Cursor catalog exceeds size limit"));
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (settled) return;
        const body = Buffer.concat(chunks);
        finish(resolve, { status: Number(responseHeaders[":status"] || 0), body }, true);
      });
      req.on("error", onError);
      req.on("aborted", onClose);
      req.on("close", onClose);
      signal.addEventListener("abort", onAbort, { once: true });
      signal.throwIfAborted();
      req.end(body?.length ? Buffer.from(body) : undefined);
    } catch (error) {
      onError(error);
    }
  });
}

async function readProtoBody(response, signal) {
  if (!response.body) throw new Error("Missing Cursor catalog response body");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  const onAbort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MODEL_CATALOG_MAX_BYTES) throw new Error("Cursor catalog exceeds size limit");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener("abort", onAbort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function waitForResponse(pending, signal) {
  let aborted = false;
  let onAbort;
  const cancellation = new Promise((_, reject) => {
    onAbort = () => { aborted = true; reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  const operation = Promise.resolve(pending).then(response => {
    if (aborted) void response?.body?.cancel?.().catch(() => {});
    return response;
  });
  try { return await Promise.race([operation, cancellation]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

async function fetchCursorCatalog(credentials, signal, proxyOptions, url) {
  const accessToken = credentials?.accessToken;
  const machineId = credentials?.providerSpecificData?.machineId;
  if (!accessToken || !machineId || !url) return null;

  const headers = {
    ...buildCursorHeaders(accessToken, machineId, credentials?.providerSpecificData?.ghostMode !== false),
    // Connect unary calls use an unframed protobuf body, unlike Cursor chat's
    // streaming `application/connect+proto` endpoint.
    accept: "application/proto",
    "content-type": "application/proto",
  };
  delete headers["connect-accept-encoding"];
  delete headers["connect-protocol-version"];

  // Preserve Cursor's native HTTP/2 path only when no account proxy is configured.
  // A configured proxy/relay must carry this credentialed unary RPC too.
  let response;
  const poolId = proxyOptions?.proxyPoolId ?? proxyOptions?.connectionProxyPoolId;
  if (proxyOptions?.strictProxy || proxyOptions?.enabled || proxyOptions?.connectionProxyEnabled
    || proxyOptions?.vercelRelayUrl || poolId && poolId !== "__none__") {
    const res = await waitForResponse(proxyAwareFetch(url, {
      method: "POST",
      redirect: "error",
      headers,
      body: new Uint8Array(),
      signal,
    }, proxyOptions), signal);
    if (res.status !== 200) {
      void res.body?.cancel().catch(() => {});
      const error = new Error(`Cursor GetUsableModels returned ${res.status}`);
      error.status = res.status;
      throw error;
    }
    response = { status: res.status, body: await readProtoBody(res, signal) };
  } else {
    response = await http2PostProto(url, headers, new Uint8Array(), signal);
  }
  if (response.status !== 200) {
    const error = new Error(`Cursor GetUsableModels returned ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return parseCursorUsableModels(new Uint8Array(response.body));
}

/**
 * Resolve the live Cursor catalog for the authenticated account.
 * Returns null on any failure so callers can fall back to static models.
 */
export async function resolveCursorModels(credentials, options = {}) {
  const callerSignal = options.signal;
  callerSignal?.throwIfAborted();
  if (!credentials?.accessToken || !credentials?.providerSpecificData?.machineId) {
    options.log?.debug?.("CURSOR_MODELS", "No Cursor access token or machine ID; skipping live fetch");
    return null;
  }

  const imported = getDbImportGeneration();
  if (imported !== importedGeneration) {
    importedGeneration = imported;
    clearCursorModelCache();
  }
  const proxyOptions = options.proxyOptions || null;
  const key = cacheKey(credentials, proxyOptions);
  const now = Date.now();
  for (const [entryKey, entry] of catalogCache) {
    if (entry.expiresAt <= now) forget(entryKey);
  }
  if (!options.forceRefresh) {
    const cached = catalogCache.get(key);
    if (cached) {
      catalogCache.delete(key);
      catalogCache.set(key, cached);
      return JSON.parse(cached.value);
    }
  }

  const epoch = cacheGeneration;
  const selected = {
    accessToken: credentials.accessToken,
    providerSpecificData: {
      machineId: credentials.providerSpecificData.machineId,
      ghostMode: credentials.providerSpecificData.ghostMode,
    },
  };
  const selectedProxy = proxyOptions ? { ...proxyOptions } : null;
  const url = getCursorModelsUrl();
  const unchanged = () => epoch === cacheGeneration && imported === getDbImportGeneration()
    && key === cacheKey(credentials, options.proxyOptions || null);
  const controller = new AbortController();
  const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
  const deadline = setTimeout(() => controller.abort(new Error("Cursor GetUsableModels timed out")), FETCH_TIMEOUT_MS);
  try {
    const models = await Promise.resolve().then(() => {
      signal.throwIfAborted();
      if (!unchanged()) return null;
      return fetchCursorCatalog(selected, signal, selectedProxy, url);
    });
    signal.throwIfAborted();
    if (!unchanged()) return null;
    if (!models?.length) return null;
    const result = { models };
    remember(key, result);
    return structuredClone(result);
  } catch (error) {
    if (callerSignal?.aborted) throw callerSignal.reason;
    if (error?.message?.includes("strictProxy=true")) throw error;
    options.log?.warn?.("CURSOR_MODELS", `Live model fetch failed: ${error?.message || error}`);
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

export function clearCursorModelCache() {
  catalogCache.clear();
  cacheBytes = 0;
  cacheGeneration++;
}
