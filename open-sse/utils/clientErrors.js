// Client-facing error messages, kept free of internal routing detail.
//
// Zen is the internal engine behind ByKitsune. The owner's rule: a user must
// never see which provider, account, channel or routing prefix served (or
// refused) their request. The concrete leak that motivated this module was
//
//   {"error":{"message":"No active credentials for provider: openai",
//             "code":"model_not_found"}}
//
// which tells an outside caller which upstream provider the gateway maps a
// model to. The same class of leak exists in the image/video/search handlers.
//
// Two audiences, deliberately separated:
//   - the CLIENT gets a neutral, actionable message plus the request_id so
//     support can correlate it;
//   - the OPERATOR gets the full detail (provider, model, account, status) in
//     the server log, which never leaves the host.
//
// `publicMessage` is the single place that decides what a client may read.
// Callers keep logging the specific reason themselves.
//
// Upstream errors are untrusted; public output allowlists diagnostics and hides
// routing identities. Callers retain the original detail in operator logs.
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { PROVIDER_IDENTITIES } from "../providers/identity.js";
import { ERROR_TYPES, DEFAULT_ERROR_MESSAGES } from "../config/errorConfig.js";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_DIAGNOSTIC = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/;

export function publicRequestId(value) {
  return typeof value === "string" && SAFE_REQUEST_ID.test(value) && redactClientDiagnostic(value) === value ? value : crypto.randomUUID();
}

// Only scalar diagnostics may leave the host. Never stringify debug objects,
// headers or nested provider payloads to manufacture a client message.
export function redactClientDiagnostic(value) {
  if (typeof value !== "string") return "";
  return value.slice(0, 8192)
    .replace(/\b(?:debug|stack(?:trace)?|traceback|request[_ -]?headers|response[_ -]?body|raw[_ -]?body)\s*[:=][\s\S]*$/i, "")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/(["']?\b(?:api[\s_-]*key|access[\s_-]*token|refresh[\s_-]*token|client[\s_-]*secret|authorization|password|credentials?|secret|token|(?:account|connection|project|tenant|organization|org)[\s_-]*id)["']?(?:\s+(?:provided|supplied|used|received))?\s*(?:[:=]|\bis\b)\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, "[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]")
    .replace(/https?:\/\/[^\s<>"']+/gi, "[REDACTED URL]")
    .replace(/\b[A-Z]:\\[^\s<>"';,]+/gi, "[REDACTED PATH]")
    .replace(/(?:file:\/\/)?\/(?:root|home|tmp|var|etc|opt|usr|app|workspace|private|Users|mnt|srv|proc|run|data|dev)(?:\/[^\s<>"';,]*)?/g, "[REDACTED PATH]")
    .replace(/[\r\n\0-\x1f\x7f]/g, " ")
    .trim().slice(0, 500);
}

const INTERNAL_PROVIDER_NAMES = new RegExp(`\\b(?:${[...new Set(Object.values(PROVIDER_IDENTITIES))]
  .map(id => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");

// Fixed, neutral client messages keyed by internal condition.
const CLIENT_MESSAGES = {
  // No usable credential exists for the requested model's provider.
  no_credentials: "The requested model is not available right now.",
  // All accounts for the provider are cooling down / rate limited.
  all_accounts_unavailable: "The requested model is temporarily unavailable. Please try again shortly.",
  // The provider exists but does not serve this modality at all.
  provider_unsupported_modality: "This model does not support the requested operation.",
  // The model itself is disabled by operator configuration.
  model_disabled: "The requested model is not available right now.",
  // Upstream rejected the request in a way the client can act on.
  upstream_rejected: "The upstream provider rejected this request.",
  // Unspecified upstream failure.
  upstream_failed: "The upstream provider failed to complete the request.",
  // Internal failure that must not describe internals.
  internal: "The request could not be completed.",
};

/**
 * Neutral client-facing message for an internal condition.
 * @param {keyof typeof CLIENT_MESSAGES} key
 * @returns {string}
 */
export function publicMessage(key) {
  return CLIENT_MESSAGES[key] || CLIENT_MESSAGES.internal;
}

/**
 * True when a message still names an internal provider, routing prefix, account
 * or channel. Used by tests to assert responses stay clean, and defensively by
 * handlers that forward an upstream message verbatim.
 *
 * Deliberately conservative: it looks for the routing prefixes and the
 * "provider:" phrasing the audit flagged, not for the word "provider" alone
 * (which is legitimate English in messages such as "The upstream provider
 * rejected this request.").
 *
 * @param {unknown} text
 * @param {string[]} [providerIds] - Concrete provider ids/aliases to look for
 * @returns {boolean}
 */
export function leaksInternalDetail(text, providerIds = []) {
  if (typeof text !== "string" || !text) return false;
  if (/provider:\s*[a-z0-9_-]+/i.test(text)) return true;
  if (/\b(?:cx|ag|gcli|do|ort|thbr|kmc)\//.test(text)) return true;
  if (INTERNAL_PROVIDER_NAMES.test(text)) return true;
  const lower = text.toLowerCase();
  for (const id of providerIds) {
    if (typeof id !== "string" || !id.trim()) continue;
    // Word-boundary match so "openai" does not match inside an unrelated word.
    const pattern = new RegExp(`\\b${id.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(lower)) return true;
  }
  return false;
}

/**
 * Guard an upstream-supplied message before it reaches a client.
 *
 * Upstream error bodies are untrusted input: they can echo the account, the
 * internal provider id, or a routing prefix. When the text looks like it leaks
 * internal detail, the neutral message is used instead; the full text is still
 * logged by the caller.
 *
 * @param {string} upstreamMessage
 * @param {{ fallback?: string, providerIds?: string[] }} [options]
 * @returns {string}
 */
export function safeClientMessage(upstreamMessage, options = {}) {
  const fallback = options.fallback || CLIENT_MESSAGES.upstream_failed;
  const message = redactClientDiagnostic(upstreamMessage).replace(/^\[\d{3}\]:\s*/, "");
  if (!message || /^[{<]|^\[\s*[{"]/.test(message)) return fallback;
  if (!leaksInternalDetail(message, options.providerIds)) return message;

  // A provider name must not turn a useful parameter/quota constraint into an
  // opaque HTTP 400. Retain the constraint, not the internal routing identity.
  if (!/\b(?:must|minimum|maximum|parameter|unsupported|quota|rate limit|usage limit|credits?|exceed|reduce|increase|not supported|not entitled)\b/i.test(message)) return fallback;
  let neutral = message.replace(new RegExp(INTERNAL_PROVIDER_NAMES.source, "gi"), "upstream")
    .replace(/\b(?:AgentService|ChatService)\b/gi, "transport")
    .replace(/provider:\s*[a-z0-9_-]+/gi, "upstream")
    .replace(/\b(?:cx|ag|gcli|do|ort|thbr|kmc)\/[^\s,;]+/g, "the requested model");
  for (const id of options.providerIds || []) {
    if (typeof id !== "string" || !id.trim()) continue;
    neutral = neutral.replace(new RegExp(`\\b${id.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "upstream");
  }
  return leaksInternalDetail(neutral, options.providerIds) ? fallback : neutral;
}

export function sanitizeClientError(value, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : { message: value };
  const status = Number(options.status) || 500;
  const defaults = ERROR_TYPES[status] || (status >= 500
    ? ERROR_TYPES[500] : { type: "invalid_request_error", code: "invalid_request" });
  const diagnostic = (field) => {
    const text = typeof source[field] === "number" && Number.isFinite(source[field])
      ? String(source[field]) : typeof source[field] === "string" ? source[field].trim() : "";
    return SAFE_DIAGNOSTIC.test(text) && redactClientDiagnostic(text) === text && !leaksInternalDetail(text, options.providerIds) ? text : "";
  };
  const error = {
    message: safeClientMessage(source.message, {
      ...options, fallback: options.fallback || DEFAULT_ERROR_MESSAGES[status] || CLIENT_MESSAGES.upstream_failed,
    }),
    type: diagnostic("type") || defaults.type,
    code: diagnostic("code") || defaults.code,
    request_id: publicRequestId(options.requestId || source.request_id),
  };
  if (typeof source.param === "string" && /^[A-Za-z_][A-Za-z0-9_.\[\]-]{0,127}$/.test(source.param) && !leaksInternalDetail(source.param, options.providerIds)) error.param = source.param;
  return error;
}

export const CLIENT_ERROR_STATUS = {
  noCredentials: HTTP_STATUS.NOT_FOUND,
  allAccountsUnavailable: HTTP_STATUS.SERVICE_UNAVAILABLE,
};
