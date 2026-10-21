import { ERROR_TYPES, DEFAULT_ERROR_MESSAGES, GOOGLE_QUOTA_RESET_HINTS, MAX_RATE_LIMIT_COOLDOWN_MS } from "../config/errorConfig.js";

export const MAX_UPSTREAM_ERROR_BYTES = 8192;

async function readBoundedErrorBody(response, maxBytes = MAX_UPSTREAM_ERROR_BYTES) {
  const reader = response.body?.getReader?.();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let body = "";
  let bytesRead = 0;
  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytesRead;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      body += decoder.decode(chunk, { stream: true });
      bytesRead += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
    body += decoder.decode();
    return body;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/**
 * Build OpenAI-compatible error response body
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {object} Error response object
 */
export function buildErrorBody(statusCode, message, diagnostics = {}) {
  const errorInfo = ERROR_TYPES[statusCode] || 
    (statusCode >= 500 
      ? { type: "server_error", code: "internal_server_error" }
      : { type: "invalid_request_error", code: "" });

  const error = {
      message: message || DEFAULT_ERROR_MESSAGES[statusCode] || "An error occurred",
      type: errorInfo.type,
      code: errorInfo.code
  };
  for (const key of ["type", "param", "code", "request_id"]) {
    if (diagnostics[key]) error[key] = diagnostics[key];
  }
  return { error };
}

/**
 * Create error Response object (for non-streaming)
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {Response} HTTP Response object
 */
export function errorResponse(statusCode, message, diagnostics = {}, retryAfterSec = null) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
  if (retryAfterSec && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    headers["Retry-After"] = String(Math.ceil(retryAfterSec));
  }
  return new Response(JSON.stringify(buildErrorBody(statusCode, message, diagnostics)), {
    status: statusCode,
    headers,
  });
}

/**
 * Write error to SSE stream (for streaming)
 * @param {WritableStreamDefaultWriter} writer - Stream writer
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
export async function writeStreamError(writer, statusCode, message) {
  const errorBody = buildErrorBody(statusCode, message);
  const encoder = new TextEncoder();
  await writer.write(encoder.encode(`data: ${JSON.stringify(errorBody)}\n\n`));
}

/**
 * Best-effort extraction of a precise rate-limit reset time from common
 * provider error shapes. GLM/Z.AI: "Your limit will reset at 2026-08-17 02:56:15"
 * (UTC). Also handles "retry in N seconds", "resets in Ns" and Retry-After.
 * Returns epoch ms or null.
 * PR #3612
 */
export function extractResetsAtMs(response, message) {
  if (!message) return null;
  const text = typeof message === "string" ? message : JSON.stringify(message);

  // GLM/Z.AI: "reset at 2026-08-17 02:56:15" (provider sends UTC without suffix)
  const resetAt = text.match(/reset at\s+(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/i);
  if (resetAt) {
    const ms = Date.parse(`${resetAt[1]}T${resetAt[2]}Z`);
    if (Number.isFinite(ms) && ms > Date.now()) return ms;
  }

  // "retry in 300 seconds" / "resets in 5 minutes" / "try again in 1 hour"
  const inTime = text.match(/(?:retry|try again|resets?)\s+(?:after|in)\s+(\d+(?:\.\d+)?)\s*(seconds?|minutes?|hours?)/i);
  if (inTime) {
    const n = Number(inTime[1]);
    const unit = inTime[2][0].toLowerCase();
    const mult = unit === "s" ? 1000 : unit === "m" ? 60000 : 3600000;
    const ms = Date.now() + n * mult;
    if (Number.isFinite(ms)) return ms;
  }

  // Retry-After header (seconds or HTTP-date)
  const ra = response?.headers?.get?.("retry-after") ?? response?.headers?.get?.("Retry-After");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs > 0) return Date.now() + secs * 1000;
    const dateMs = Date.parse(ra);
    if (Number.isFinite(dateMs) && dateMs > Date.now()) return dateMs;
  }

  return null;
}

// Google Cloud Code Assist regional allowlist rejection (Antigravity/Gemini
// free tier): "User location is not supported for the API use."
// (FAILED_PRECONDITION). Google evaluates this from the SERVER's egress IP
// region (plus account signals) — not from anything in the request body — so
// reshaping the payload or retrying can never help. The hint below is worded
// to avoid ERROR_RULES trigger phrases so this error keeps its fail-fast,
// no-cooldown, no-fallback classification in accountFallback.js.
const GOOGLE_LOCATION_GATE_RE = /user location is not supported/i;
const ZEN_LOCATION_GATE_HINT = "[ZenRouter hint: Google decided this from your server's egress IP region (the Antigravity free tier enforces its own regional allowlist) — not from your request content, account, or quota. Options: (1) send this connection through a proxy/VPN exiting in a supported region, (2) use Claude models on the same Antigravity account (unaffected), (3) turn off TUN-mode VPN / IPv6 egress to Google and retry. Details: docs/antigravity-location-error.md]";

export function withLocationGateHint(message) {
  if (typeof message !== "string" || message.length === 0) return message;
  if (!GOOGLE_LOCATION_GATE_RE.test(message)) return message;
  if (message.includes("[ZenRouter hint:")) return message;
  return `${message} ${ZEN_LOCATION_GATE_HINT}`;
}

/**
 * Parse upstream provider error response
 * @param {Response} response - Fetch response from provider
 * @param {object} [executor] - Optional executor with parseError() override for provider-specific parsing
 * @returns {Promise<{statusCode: number, message: string, type?: string, param?: string, code?: string|number, request_id?: string, resetsAtMs?: number}>}
 */
export async function parseUpstreamError(response, executor = null) {
  let bodyText = "";
  try {
    bodyText = await readBoundedErrorBody(response);
  } catch {
    bodyText = "";
  }
  const generic = parseUpstreamErrorBody(response, bodyText);
  const { message, ...diagnostics } = generic;
  const structuredReset = executor?.provider === "antigravity"
    ? parseGoogleQuotaReset(response, bodyText) : null;

  // Let executor-specific parser extract provider-specific fields (e.g. codex resetsAtMs)
  if (executor && typeof executor.parseError === "function") {
    try {
      const parsed = executor.parseError(response, bodyText, generic);
      if (parsed && typeof parsed === "object") {
        // Antigravity's legacy retry parser expands details as message text.
        // A typed reset adds no public diagnostic fields from that private map.
        const msg = (structuredReset && message) || safeDiagnostic(parsed.message) || message || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`;
        // Executor parse wins; fill resetsAtMs from generic patterns when absent — PR #3612
        const hint = parsed.resetsAtMs == null ? structuredReset : null;
        const resetsAtMs = parsed.resetsAtMs ?? hint?.resetsAtMs ?? (RESET_BEARING_STATUSES.has(response.status) ? extractResetsAtMs(response, msg) : null);
        return {
          statusCode: parsed.status || response.status,
          message: withLocationGateHint(msg),
          type: safeDiagnostic(parsed.type) ?? diagnostics.type,
          param: safeDiagnostic(parsed.param) ?? diagnostics.param,
          code: safeDiagnosticCode(parsed.code) ?? diagnostics.code,
          request_id: safeRequestId(response, parsed.request_id) || diagnostics.request_id,
          resetsAtMs,
          ...(hint ? { resetsAtSource: hint.resetsAtSource } : {})
        };
      }
    } catch { /* fall through to default parsing */ }
  }


  const messageStr = safeDiagnostic(message);
  const finalMessage = withLocationGateHint(messageStr || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`);
  if (structuredReset) return { statusCode: response.status, message: finalMessage, ...diagnostics, ...structuredReset };

  // Provider-reported precise reset time (Retry-After header or "reset at/in"
  // wording). A 403/503 carrying `Retry-After: 3600` used to be discarded, so
  // the account fell back to exponential-backoff guessing (1s→2s→4s…) and
  // hammered an upstream that had explicitly asked for an hour of quiet.
  // Downstream, markAccountUnavailable() already accepts resetsAtMs and prefers
  // it over the guessed backoff.
  //
  // Restricted to statuses that actually mean "come back later". A 400/404/422
  // describes the request, not account health, and extractResetsAtMs() also
  // matches loose wording like "retry in 5 minutes" — applying that to a client
  // error would cool down a perfectly healthy account.
  if (RESET_BEARING_STATUSES.has(response.status)) {
    const resetsAtMs = extractResetsAtMs(response, finalMessage);
    if (resetsAtMs) return { statusCode: response.status, message: finalMessage, ...diagnostics, resetsAtMs };
  }

  return { statusCode: response.status, message: finalMessage, ...diagnostics };
}

// M05 upstream candidate a07ed95beae8ce295907082220c386e8e7db138b.
// Parse only authenticated transport context + canonical typed error.details,
// never recursive quota-looking keys, human prose or parseFloat prefixes.
// ProtoJSON RetryInfo: googleapis/googleapis at
// ebd1d23ac613b177828dad42ad8dfb13ba498279/google/rpc/error_details.proto.
function parseGoogleQuotaReset(response, text) {
  const policy = GOOGLE_QUOTA_RESET_HINTS;
  if (!policy.statuses.has(response.status)) return null;
  let error;
  try { error = JSON.parse(text)?.error; } catch { return null; }
  if (!error || typeof error !== "object" || Array.isArray(error) ||
      (error.code != null && error.code !== response.status) ||
      !["RESOURCE_EXHAUSTED", "ABORTED"].includes(error.status) || !Array.isArray(error.details)) return null;
  const now = Date.now();
  const timestamps = [];
  const delays = [];
  let quotaError = false;
  for (const detail of error.details.slice(0, policy.maxDetails)) {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) continue;
    if (detail["@type"] === policy.errorInfoType && policy.domains.has(detail.domain) && policy.reasons.has(detail.reason)) {
      quotaError = true;
      const value = parseQuotaTimestamp(detail.metadata?.quotaResetTimeStamp);
      if (value > now) timestamps.push(value);
    }
    if (detail["@type"] === policy.retryInfoType && typeof detail.retryDelay === "string") {
      // ProtoJSON Duration has a mandatory seconds suffix and at most 9
      // fractional digits; accept only positive canonical values.
      const match = /^(0|[1-9]\d{0,11})(?:\.(\d{1,9}))?s$/.exec(detail.retryDelay);
      if (!match) continue;
      const seconds = Number(match[1]);
      const nanos = Number((match[2] || "").padEnd(9, "0"));
      const delay = seconds * 1000 + Math.ceil(nanos / 1000000);
      if (seconds <= 315576000000 && delay > 0) delays.push(now + delay);
    }
  }
  // ABORTED is ordinarily a conflict, not quota. Require typed quota evidence.
  if (error.status === "ABORTED" && !quotaError) return null;
  const candidates = timestamps.length ? timestamps : delays;
  if (!candidates.length) return null;
  return {
    resetsAtMs: Math.min(Math.max(...candidates), now + MAX_RATE_LIMIT_COOLDOWN_MS),
    resetsAtSource: timestamps.length ? "google.rpc.ErrorInfo.metadata.quotaResetTimeStamp" : "google.rpc.RetryInfo.retryDelay",
  };
}

function parseQuotaTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate() ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
      (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed + (fraction?.length > 3 && /[1-9]/.test(fraction.slice(3)) ? 1 : 0);
}

export function parseUpstreamErrorBody(response, bodyText) {
  try {
    const json = JSON.parse(bodyText);
    const source = json.error && typeof json.error === "object" ? json.error : json;
    return {
      message: safeDiagnostic(source?.message || json.message || (typeof json.error === "string" ? json.error : "")),
      type: safeDiagnostic(source?.type),
      param: safeDiagnostic(source?.param),
      code: safeDiagnosticCode(source?.code),
      request_id: safeRequestId(response, source?.request_id || json.request_id),
    };
  } catch {
    return {};
  }
}

// Upstream statuses that legitimately carry a retry/reset hint. 403 is included
// because several providers (Anthropic org limits, Antigravity quota) report
// quota exhaustion there instead of 429, and 402 for credit/billing resets.
const RESET_BEARING_STATUSES = new Set([402, 403, 429, 500, 502, 503, 504, 529]);

function safeDiagnostic(value) {
  if (typeof value !== "string") return undefined;
  return value.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]").replace(/[\r\n\0]/g, " ").trim().slice(0, 500) || undefined;
}

function safeDiagnosticCode(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : safeDiagnostic(value);
}

function safeRequestId(response, value) {
  const headerId = response?.headers?.get("x-request-id") || response?.headers?.get("request-id") || response?.headers?.get("x-correlation-id");
  const candidate = safeDiagnostic(value || headerId);
  return candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : undefined;
}

/**
 * Create error result for chatCore handler
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {number} [resetsAtMs] - Optional precise cooldown expiry (ms epoch) for provider-specific quota errors
 * @returns {{ success: false, status: number, error: string, response: Response, resetsAtMs?: number }}
 */
export function createErrorResult(statusCode, message, resetsAtMs, diagnostics = {}) {
  const retryAfterSec = resetsAtMs && resetsAtMs > Date.now()
    ? Math.max(1, Math.ceil((resetsAtMs - Date.now()) / 1000))
    : null;
  return {
    success: false,
    status: statusCode,
    error: message,
    resetsAtMs,
    response: errorResponse(statusCode, message, diagnostics, retryAfterSec)
  };
}

/**
 * Create unavailable response when all accounts are rate limited
 * @param {number} statusCode - Original error status code
 * @param {string} message - Error message (without retry info)
 * @param {string} retryAfter - ISO timestamp when earliest account becomes available
 * @param {string} retryAfterHuman - Human-readable retry info e.g. "reset after 30s"
 * @returns {Response}
 */
export function unavailableResponse(statusCode, message, retryAfter, retryAfterHuman) {
  const msg = `${message} (${retryAfterHuman})`;
  const headers = { "Content-Type": "application/json" };

  // `retryAfter` arrives from provider payloads and is not guaranteed to be a
  // parseable date: values like "soon", "1 minute", "" or "30" all yield NaN,
  // which previously emitted the literal header `Retry-After: NaN`. Clients
  // (and intermediaries) cannot act on that, and it is worse than omitting the
  // header entirely — so only send a header when the value is a real instant.
  const retryAfterMs = retryAfter == null ? NaN : new Date(retryAfter).getTime();
  if (Number.isFinite(retryAfterMs)) {
    const retryAfterSec = Math.max(Math.ceil((retryAfterMs - Date.now()) / 1000), 1);
    if (Number.isFinite(retryAfterSec)) headers["Retry-After"] = String(retryAfterSec);
  }

  return new Response(
    JSON.stringify({ error: { message: msg } }),
    { status: statusCode, headers }
  );
}

/**
 * Format provider error with context
 * @param {Error} error - Original error
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {number|string} statusCode - HTTP status code or error code
 * @returns {string} Formatted error message
 */
export function formatProviderError(error, provider, model, statusCode) {
  const code = statusCode || error.code || "FETCH_FAILED";
  const message = error.message || "Unknown error";
  // Expose low-level cause (e.g. UND_ERR_SOCKET, ECONNRESET, ETIMEDOUT) for diagnosing fetch failures
  const causeCode = error.cause?.code;
  const causeMsg = error.cause?.message;
  const causeStr = causeCode || causeMsg ? ` (cause: ${[causeCode, causeMsg].filter(Boolean).join(": ")})` : "";
  return `[${code}]: ${message}${causeStr}`;
}
