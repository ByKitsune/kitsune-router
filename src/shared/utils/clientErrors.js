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
// Security note: these helpers never accept credentials, tokens or prompt
// content, and never echo the caller's raw input. They only map a small set of
// internal conditions onto fixed strings.
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";

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
  if (typeof upstreamMessage !== "string" || !upstreamMessage.trim()) return fallback;
  if (leaksInternalDetail(upstreamMessage, options.providerIds)) return fallback;
  return upstreamMessage;
}

export const CLIENT_ERROR_STATUS = {
  noCredentials: HTTP_STATUS.NOT_FOUND,
  allAccountsUnavailable: HTTP_STATUS.SERVICE_UNAVAILABLE,
};
