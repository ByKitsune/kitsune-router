import { createErrorResult, MAX_UPSTREAM_ERROR_BYTES } from "../utils/error.js";
import { HTTP_STATUS, VIDEO_FETCH_TIMEOUT_MS, VIDEO_MAX_RESPONSE_BYTES } from "../config/runtimeConfig.js";
import { refreshTokenByProvider } from "../services/tokenRefresh.js";
import { PROVIDER_MEDIA } from "../providers/index.js";
import { createAccountTransport } from "../utils/accountTransport.js";

// POST /videos/* creates a billable upstream job. A network error after the
// request left the socket may still have created the job, so creation is NEVER
// auto-retried (the only re-send is the auth retry after a 401/403 refresh,
// which upstream rejects before job creation).
export const VIDEO_ACTIONS = new Set(["generations", "edits", "extensions"]);

export function getVideoConfig(provider) {
  return PROVIDER_MEDIA[provider]?.videoConfig || null;
}

/** Strip bearer tokens / obvious secrets from text destined for clients or logs. */
export function sanitizeSecrets(text, credentials = null) {
  if (!text) return text;
  let out = String(text).replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]");
  for (const key of ["accessToken", "refreshToken", "apiKey"]) {
    const secret = credentials?.[key];
    if (typeof secret === "string" && secret.length >= 8) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out;
}

function buildUpstreamUrl(config, action, requestId) {
  const base = config.baseUrl.replace(/\/$/, "");
  return requestId ? `${base}/${encodeURIComponent(requestId)}` : `${base}/${action}`;
}

function buildHeaders({ token, contentType, idempotencyKey }) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (contentType) headers["Content-Type"] = contentType;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return headers;
}

function combineSignals(signal, timeoutMs) {
  const timeoutSignal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : null;
  if (signal && timeoutSignal && typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }
  return signal || timeoutSignal || undefined;
}

const cancelled = () => createErrorResult(499, "Client closed request");

function discardBody(response) {
  try { void response?.body?.cancel().catch(() => {}); } catch { /* Already locked or discarded. */ }
}

async function readVideoBody(response, signal) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const limit = response.ok ? VIDEO_MAX_RESPONSE_BYTES : MAX_UPSTREAM_ERROR_BYTES;
  const chunks = [];
  let size = 0;
  let completed = false;
  let discarded = false;
  const cancel = reason => {
    if (discarded) return;
    discarded = true;
    // Cancellation closes pending reads even if an upstream source leaves its
    // cleanup acknowledgment pending. Do not retain the request on that promise.
    try { void reader.cancel(reason).catch(() => {}); } catch { /* Already closed. */ }
  };
  const onAbort = () => cancel(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) onAbort();
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) { completed = true; break; }
      const remaining = limit - size;
      if (response.ok && value.byteLength > remaining) throw new Error("Video response exceeds size limit");
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(chunk);
      size += chunk.byteLength;
      if (!response.ok && size >= limit) break;
    }
  } catch (error) {
    // Error diagnostics remain bounded best-effort text. Successful metadata
    // must be complete; a failed body read cannot become an empty HTTP 200.
    if (response.ok || signal?.aborted) throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!completed) cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/**
 * Transparent proxy for async video jobs (xAI Grok Imagine shape).
 *
 * - Forwards the raw body byte-for-byte (JSON or multipart) — no reshaping.
 * - Passes upstream JSON (request_id, status, video.url, error) back verbatim.
 * - 401/403 with a refresh token: refresh ONCE, retry ONCE. No other retry.
 * - Upstream error text is sanitized before it reaches the client.
 *
 * @param {object} options
 * @param {string} options.provider - Provider id (must have registry videoConfig)
 * @param {"generations"|"edits"|"extensions"|null} options.action - Creation action (POST)
 * @param {string|null} [options.requestId] - Poll target (GET /videos/{id})
 * @param {Buffer|string|null} [options.rawBody] - Exact body to forward
 * @param {string|null} [options.contentType] - Original Content-Type header
 * @param {string|null} [options.idempotencyKey] - Forwarded Idempotency-Key
 * @param {object} options.credentials - { accessToken?, apiKey?, refreshToken?, authType? }
 * @param {object|null} [options.proxyOptions] - Resolved account policy shared by submission, refresh and retry
 * @param {AbortSignal} [options.signal] - Client cancellation signal
 * @param {number} [options.timeoutMs]
 * @param {object} [options.log]
 * @param {function} [options.onCredentialsRefreshed]
 * @returns {Promise<{ success: boolean, response: Response, status?: number, error?: string }>}
 */
export async function handleVideoProxyCore({
  provider,
  action = null,
  requestId = null,
  rawBody = null,
  contentType = null,
  idempotencyKey = null,
  credentials,
  proxyOptions = null,
  signal,
  timeoutMs = VIDEO_FETCH_TIMEOUT_MS,
  log,
  onCredentialsRefreshed,
}) {
  if (signal?.aborted) return cancelled();
  const config = getVideoConfig(provider);
  if (!config) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, `Provider '${provider}' does not support video generation`);
  }
  if (!requestId && !VIDEO_ACTIONS.has(action)) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, `Unknown video action: ${action}`);
  }

  const method = requestId ? "GET" : "POST";
  const url = buildUpstreamUrl(config, action, requestId);
  const fetchSignal = combineSignals(signal, timeoutMs);
  // App callers resolve pools once before proactive refresh. Standalone core
  // callers still retain explicit legacy/strict metadata, and an unresolved
  // pool fails closed rather than selecting an unrelated global/direct route.
  const routingPolicy = proxyOptions && Object.isFrozen(proxyOptions)
    ? proxyOptions : Object.freeze({ ...(proxyOptions ?? credentials?.providerSpecificData) });
  const transport = createAccountTransport(credentials, { signal: fetchSignal, proxyOptions: routingPolicy });

  const doFetch = (token) =>
    transport.fetch(url, {
      method,
      headers: buildHeaders({ token, contentType: method === "POST" ? contentType : null, idempotencyKey: method === "POST" ? idempotencyKey : null }),
      body: method === "POST" ? rawBody : undefined,
      signal: fetchSignal,
    });

  let upstream;
  try {
    upstream = await doFetch(credentials?.accessToken || credentials?.apiKey);
  } catch (error) {
    if (signal?.aborted) return cancelled();
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      return createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, `[${provider}] video ${method} aborted: ${error.message}`);
    }
    // Never re-send a creation POST on network error — the job may already exist upstream.
    return {
      ...createErrorResult(HTTP_STATUS.BAD_GATEWAY, sanitizeSecrets(`[${provider}] video upstream fetch failed: ${error.message}`, credentials)),
      ...(error.message?.startsWith("[ProxyFetch]") ? { localFailure: true } : {}),
    };
  }

  if (signal?.aborted) { discardBody(upstream); return cancelled(); }

  // 401/403 → refresh once → retry once (OAuth accounts only; API keys can't refresh)
  if (
    (upstream.status === HTTP_STATUS.UNAUTHORIZED || upstream.status === HTTP_STATUS.FORBIDDEN) &&
    credentials?.refreshToken
  ) {
    let refreshed = null;
    try {
      refreshed = await refreshTokenByProvider(provider, credentials, log, routingPolicy, fetchSignal);
    } catch (error) {
      if (signal?.aborted) { discardBody(upstream); return cancelled(); }
      if (fetchSignal?.aborted) { discardBody(upstream); return createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, "Video request timed out"); }
      log?.warn?.("TOKEN", `${provider} | video refresh error: ${sanitizeSecrets(error.message, credentials)}`);
    }
    if (refreshed?.accessToken) {
      log?.info?.("TOKEN", `${provider.toUpperCase()} | refreshed for video ${method}`);
      Object.assign(credentials, refreshed);
      // A rotated token already acquired must be persisted even if its caller
      // leaves during that commit. Cancellation still prevents another POST.
      if (onCredentialsRefreshed) await onCredentialsRefreshed(refreshed);
      discardBody(upstream);
      if (signal?.aborted) return cancelled();
      if (fetchSignal?.aborted) return createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, "Video request timed out");
      try {
        upstream = await doFetch(credentials.accessToken || credentials.apiKey);
      } catch (error) {
        if (signal?.aborted) return cancelled();
        if (fetchSignal?.aborted) return createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, "Video request timed out");
        return {
          ...createErrorResult(HTTP_STATUS.BAD_GATEWAY, sanitizeSecrets(`[${provider}] video retry after refresh failed: ${error.message}`, credentials)),
          ...(error.message?.startsWith("[ProxyFetch]") ? { localFailure: true } : {}),
        };
      }
    } else {
      log?.warn?.("TOKEN", `${provider.toUpperCase()} | video refresh failed — account needs re-auth`);
    }
  }

  let bytes;
  try {
    bytes = await readVideoBody(upstream, fetchSignal);
  } catch (error) {
    if (signal?.aborted) return cancelled();
    if (fetchSignal?.aborted) return createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, "Video request timed out");
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, sanitizeSecrets(`[${provider}] video response could not be read: ${error.message}`, credentials));
  }
  if (signal?.aborted) return cancelled();
  const bodyText = new TextDecoder().decode(bytes);

  if (!upstream.ok) {
    const message = sanitizeSecrets(bodyText || `HTTP ${upstream.status}`, credentials);
    return createErrorResult(upstream.status, `[${provider}] ${message.slice(0, 2000)}`);
  }

  try {
    // Validate the complete metadata envelope without reserializing it: signed
    // asset URLs, JSON whitespace and UTF-8 bytes still pass through unchanged.
    const metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("Invalid metadata envelope");
  } catch {
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Video upstream returned invalid JSON metadata");
  }

  // Success: pass the upstream JSON through untouched (request_id / status / video.url).
  return {
    success: true,
    response: new Response(bytes, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }),
  };
}
