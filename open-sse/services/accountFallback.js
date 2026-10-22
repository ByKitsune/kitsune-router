import { ERROR_RULES, BACKOFF_CONFIG, TRANSIENT_COOLDOWN_MS, MAX_RATE_LIMIT_COOLDOWN_MS, FALLBACK_SCOPE } from "../config/errorConfig.js";
import { getModelUpstreamId, getModelQuotaFamily, PROVIDER_ID_TO_ALIAS } from "../config/providerModels.js";

const QUOTA_CODES = new Set(["rate_limit", "rate_limit_exceeded", "quota_exceeded", "quota_exhausted", "insufficient_quota", "usage_limit_reached", "resource_exhausted", "too_many_requests"]);
const QUOTA_TYPES = new Set(["rate_limit_error", "quota_error", "resource_exhausted"]);
const BILLING_CODES = new Set(["insufficient_credits", "insufficient_credit", "insufficient_balance", "insufficient_funds", "credit_balance_exhausted", "balance_zero", "payment_required"]);
const REQUEST_VALIDATION_CODES = new Set(["invalid_parameter", "invalid_value", "invalid_argument", "invalid_role", "invalid_type", "invalid_enum", "missing_parameter", "validation_error", "malformed_request", "unsupported_parameter", "invalid_thinking_budget", "invalid_output_budget", "context_length_exceeded", "context_window_exceeded"]);
const DESTINATION_VALIDATION_CODES = new Set(["unsupported_parameter", "context_length_exceeded", "context_window_exceeded"]);

function unquotedDiagnostic(message) {
  return message.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`/g, "");
}

function errorEvidence(value, diagnostics = {}) {
  let source = value;
  if (typeof value === "string" && value.length <= 8192 && /^\s*\{/.test(value)) {
    try { source = JSON.parse(value); } catch { /* not a structured error */ }
  }
  if (source?.error && typeof source.error === "object" && !Array.isArray(source.error)) source = source.error;
  const scalar = value => typeof value === "string" ? value.trim().toLowerCase() : "";
  return {
    message: typeof source?.message === "string" ? source.message : typeof source?.detail === "string" ? source.detail : typeof value === "string" ? value : "",
    code: scalar(diagnostics.code ?? source?.code),
    type: scalar(diagnostics.type ?? source?.type ?? source?.status),
  };
}

export function isRequestValidationError(status, errorText, diagnostics = {}) {
  if (Number(status) !== 400 && Number(status) !== 422) return false;
  const evidence = errorEvidence(errorText, diagnostics);
  if (REQUEST_VALIDATION_CODES.has(evidence.code)) return true;
  const message = unquotedDiagnostic(evidence.message);
  return /\b(?:invalid|unsupported|unknown|unrecognized|unexpected|missing|malformed)\s+(?:(?:request|input|body)\s+)?(?:role|parameter|param|field|value|argument|property|enum|messages?|json)\b|\b(?:role|parameter|param|field|argument|property|enum|messages?)\s+(?:is |was )?(?:invalid|unsupported|unknown|not allowed|not supported|must\b)|\b(?:improperly formed request|expected one of|received value)\b/i.test(message);
}

export function classifyAvailabilityError(status, errorText, diagnostics = {}) {
  const statusCode = Number(status);
  const evidence = errorEvidence(errorText, diagnostics);
  const text = unquotedDiagnostic(evidence.message).toLowerCase();
  // Echoed invalid input cannot become a credential fault merely by containing
  // a quota-looking value or a retry duration supplied by the upstream.
  if (statusCode === 401 || statusCode === 410 || statusCode === 499 || isRequestValidationError(statusCode, errorText, diagnostics)) return { statusCode, kind: null };
  if (statusCode === 402 || BILLING_CODES.has(evidence.code) || evidence.type === "billing_error" || /\binsufficient (?:credits?|balance|funds)\b|\b(?:credit|balance) (?:exhausted|zero)\b|balance is at \$0|余额不足|请充值/.test(text)) {
    return { statusCode: 503, kind: "billing", code: "insufficient_credits" };
  }
  if (statusCode === 429 || QUOTA_CODES.has(evidence.code) || QUOTA_TYPES.has(evidence.type) || /\brate[- ]limit (?:exceeded|reached|hit)\b|\brate[- ]limited\b|\btoo many requests\b|\bquota (?:has been |is )?(?:exceeded|exhausted)\b|\bresource exhausted\b|\b(?:usage|plan|subscription) limit(?: for (?:your |the )?plan)? (?:has been |was )?(?:reached|exceeded|exhausted)\b|\b(?:reached|exceeded|exhausted) (?:your |the )?(?:\w+ )?(?:usage|plan|subscription) limit\b/.test(text)) {
    return { statusCode: 429, kind: "quota", code: "rate_limit_exceeded" };
  }
  if (statusCode >= 500 && /overload|(?:service|server|upstream|temporarily).{0,40}(?:at capacity|capacity exhausted|capacity unavailable)|model is unavailable/.test(text)) {
    return { statusCode: 503, kind: "capacity", code: "service_unavailable" };
  }
  return { statusCode, kind: null };
}

export function retryAfterDateMs(value, now = Date.now()) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const seconds = Number(text);
    const ms = now + seconds * 1000;
    return seconds > 0 && Number.isFinite(ms) ? ms : null;
  }
  const ms = /[A-Za-z]{3},?\s+\d|^\d{4}-\d{2}-\d{2}T/.test(text) ? Date.parse(text) : NaN;
  return Number.isFinite(ms) && ms > now ? ms : null;
}

/**
 * Calculate exponential backoff cooldown for rate limits (429)
 * Level 1: 1s, Level 2: 2s, Level 3: 4s... → max 4 min
 * @param {number} backoffLevel - Current backoff level
 * @returns {number} Cooldown in milliseconds
 */
export function getQuotaCooldown(backoffLevel = 0) {
  const level = Math.max(0, backoffLevel - 1);
  const cooldown = BACKOFF_CONFIG.base * Math.pow(2, level);
  return Math.min(cooldown, BACKOFF_CONFIG.max);
}

/**
 * Best-effort extraction of a precise rate-limit reset time from common
 * provider error shapes. Handles GLM/Z.AI "reset at" datetime, "retry in N"
 * relative phrases, and standard Retry-After header (seconds or HTTP-date).
 * Returns epoch ms or null.
 * Ported from PR #3612 (generic parser for provider-reported reset times).
 * @param {Response|null} response - Fetch response (for Retry-After header)
 * @param {string} message - Error message text
 * @returns {number|null} Epoch ms when rate limit resets, or null
 */
export function extractResetsAtMs(response, message) {
  const header = response?.headers?.get?.("retry-after");
  const headerReset = retryAfterDateMs(header);
  if (headerReset) return headerReset;
  if (!message) return null;
  const text = unquotedDiagnostic(errorEvidence(message).message);
  const resetAt = text.match(/reset at\s+(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/i);
  if (resetAt) {
    const ms = Date.parse(`${resetAt[1]}T${resetAt[2]}Z`);
    if (Number.isFinite(ms) && ms > Date.now()) return ms;
  }
  const duration = text.match(/(?:retry|try again|resets?)\s+(?:after|in)\s+(\d+(?:\.\d+)?\s*(?:hours?|h|minutes?|mins?|m|seconds?|secs?|s)(?:\s*\d+(?:\.\d+)?\s*(?:hours?|h|minutes?|mins?|m|seconds?|secs?|s))*)/i);
  if (!duration) return null;
  let seconds = 0;
  for (const match of duration[1].matchAll(/(\d+(?:\.\d+)?)\s*(h(?:ours?)?|m(?:in(?:utes?)?|ins?)?|s(?:ec(?:onds?)?|ecs?)?)/gi)) {
    seconds += Number(match[1]) * (match[2][0].toLowerCase() === "h" ? 3600 : match[2][0].toLowerCase() === "m" ? 60 : 1);
  }
  const ms = Date.now() + seconds * 1000;
  return seconds > 0 && Number.isFinite(ms) ? ms : null;
}

/**
 * Permanent OAuth/org-policy denial substrings (lowercase). Mirrors the
 * terminal ERROR_RULES entries above: a server-side policy decision that
 * token refresh can never heal (Anthropic `oauth_not_allowed_for_organization`,
 * Claude Code `oauth_org_not_allowed`). Matched against the lowercased
 * error text; deliberately specific so ordinary quota/permission 403s
 * keep their transient handling.
 */
export const PERMANENT_AUTH_DENIAL_TEXTS = [
  "oauth_not_allowed",
  "oauth_org_not_allowed",
  "oauth authentication is currently not allowed",
  "organization has disabled",
];

/**
 * Revoked / invalidated OAuth credential substrings (lowercase).
 *
 * Deliberately SEPARATE from PERMANENT_AUTH_DENIAL_TEXTS. An org-policy denial
 * provably cannot be healed by refreshing (the policy is server-side), so that
 * path skips refresh entirely. A revoked token is different: the provider
 * rejected this credential, but a still-valid refresh token may legitimately
 * mint a working access token, and providers also emit these codes when only
 * the access token was invalidated. Skipping refresh here would lock a
 * recoverable account for an hour — a worse failure than the retry storm we
 * are fixing. So these codes keep the normal refresh attempt (one bounded HTTP
 * call, which fails fast with `invalid_grant` when truly dead) and only change
 * the COOLDOWN once the retry also fails.
 *
 * Production evidence (0.9.7, journal): Codex returned
 * `{"code":"token_revoked","message":"Encountered invalidated oauth token for
 * user"}` 31 times across 8h, retrying one account 16 times and another 15
 * times, because the text matched no rule and fell through to the generic 401
 * rule (2 min cooldown, forever).
 */
export const REVOKED_CREDENTIAL_TEXTS = [
  "token_revoked",
  "token revoked",
  "token has been revoked",
  "revoked token",
  "invalidated oauth token",
  "invalidated token",
  "credentials revoked",
  "refresh token has been revoked",
  "refresh_token_reused",
];

/**
 * True when an upstream 401/403 carries a permanent org-policy denial.
 * Callers must skip token refresh AND retry for these — refreshing a
 * denied credential only burns rate-limit budget and locks every sibling
 * account in turn (retry storm).
 * @param {number} status - HTTP status code
 * @param {string} errorText - Error message text (any shape)
 * @returns {boolean}
 */
export function isPermanentAuthDenial(status, errorText) {
  if (status !== 401 && status !== 403) return false;
  if (!errorText) return false;
  const lower = (typeof errorText === "string" ? errorText : JSON.stringify(errorText)).toLowerCase();
  return PERMANENT_AUTH_DENIAL_TEXTS.some((t) => lower.includes(t));
}

/**
 * True when an upstream error reports a revoked/invalidated credential.
 * These get the long revocation cooldown and the `needs_reauth` status (the
 * operator must re-auth if a refresh attempt also fails), but they still get
 * one refresh attempt first — see REVOKED_CREDENTIAL_TEXTS.
 * @param {number} status - HTTP status code
 * @param {string} errorText - Error message text (any shape)
 * @returns {boolean}
 */
export function isRevokedCredentialError(status, errorText) {
  if (status !== 401 && status !== 403) return false;
  if (!errorText) return false;
  const lower = (typeof errorText === "string" ? errorText : JSON.stringify(errorText)).toLowerCase();
  return REVOKED_CREDENTIAL_TEXTS.some((t) => lower.includes(t));
}

/**
 * True when the credential needs operator action (re-auth) rather than an
 * automatic cooldown: either a server-side org-policy denial or a revoked
 * token. Drives the `needs_reauth` connection status so the dashboard stops
 * rendering a dead account as a temporary cooldown.
 * @param {number} status
 * @param {string} errorText
 * @returns {boolean}
 */
export function needsOperatorReauth(status, errorText) {
  return isPermanentAuthDenial(status, errorText) || isRevokedCredentialError(status, errorText);
}

/**
 * Check if error should trigger account fallback (switch to next account)
 * Config-driven: matches ERROR_RULES top-to-bottom (text rules first, then status)
 * @param {number} status - HTTP status code
 * @param {string} errorText - Error message text
 * @param {number} backoffLevel - Current backoff level for exponential backoff
 * @param {Response|null} [response] - Optional fetch Response for Retry-After header parsing (PR #3612)
 * @param {"account"|"combo"} [scope] - Retry accounts or advance across different models
 * @returns {{ shouldFallback: boolean, cooldownMs: number, newBackoffLevel?: number, resetsAtMs?: number }}
 */
export function checkFallbackError(status, errorText, backoffLevel = 0, response = null, scope = FALLBACK_SCOPE.ACCOUNT) {
  status = Number(status);
  const evidence = errorEvidence(errorText);
  const lowerError = unquotedDiagnostic(evidence.message).toLowerCase();

  // Cancellation is terminal; Google's typed ABORTED quota status is not a
  // client disconnect merely because its name contains "aborted".
  if (Number(status) === 499 || /client_aborted|aborterror|^(?:error:\s*)?aborted\s*$|\b(?:client|request|operation)(?: was)? aborted\b/.test(lowerError)) {
    return { shouldFallback: false, cooldownMs: 0 };
  }

  if (isRequestValidationError(status, errorText)) return { shouldFallback: scope === FALLBACK_SCOPE.COMBO && DESTINATION_VALIDATION_CODES.has(evidence.code), cooldownMs: 0 };
  const availability = classifyAvailabilityError(status, errorText);
  if ((Number(status) === 404 || Number(status) === 410) && !availability.kind) {
    return { shouldFallback: true, cooldownMs: 0 };
  }
  // A hint does not make a malformed request an account fault. Require an
  // availability status or explicit quota/billing evidence before honoring it.
  const resetBearing = availability.kind || [403, 500, 502, 503, 504, 529].includes(Number(status));
  const resetsAtMs = resetBearing ? extractResetsAtMs(response, errorText) : null;
  if (resetsAtMs) {
    const cooldownMs = Math.min(resetsAtMs - Date.now(), MAX_RATE_LIMIT_COOLDOWN_MS);
    if (cooldownMs > 0) return { shouldFallback: true, cooldownMs, resetsAtMs };
  }
  // Typed quota/plan codes must agree with their message equivalents, including
  // providers that report quota on HTTP 400/403/404 instead of 429.
  if (availability.kind === "quota" && !ERROR_RULES.some(rule => rule.text && lowerError.includes(rule.text))) {
    const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
    return { shouldFallback: true, cooldownMs: getQuotaCooldown(newLevel), newBackoffLevel: newLevel };
  }

  for (const rule of ERROR_RULES) {
    // Text-based rule: match substring in error message
    if (rule.backoff && status < 500 && !availability.kind) continue;
    if (rule.text === "capacity" && status < 500 && !availability.kind) continue;
    if (rule.text && lowerError && lowerError.includes(rule.text)) {
      // Request-only errors never lock a healthy account. Only explicitly
      // model-dependent failures can advance a combo on a client status.
      if (rule.accountFault === false) {
        return { shouldFallback: status >= 500 || (scope === FALLBACK_SCOPE.COMBO && rule.comboFallback === true), cooldownMs: 0 };
      }
      if (rule.terminal) {
        return { shouldFallback: true, cooldownMs: rule.cooldownMs, terminal: true };
      }
      if (rule.backoff) {
        const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
        return { shouldFallback: true, cooldownMs: getQuotaCooldown(newLevel), newBackoffLevel: newLevel };
      }
      return { shouldFallback: true, cooldownMs: rule.cooldownMs };
    }

    // Status-based rule: match HTTP status code
    if (rule.status && rule.status === status) {
      if (rule.terminal) {
        return { shouldFallback: true, cooldownMs: rule.cooldownMs, terminal: true };
      }
      if (rule.backoff) {
        const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
        return { shouldFallback: true, cooldownMs: getQuotaCooldown(newLevel), newBackoffLevel: newLevel };
      }
      return { shouldFallback: true, cooldownMs: rule.cooldownMs };
    }
  }

  // Request-scoped client errors that matched no rule above: a 4xx caused by the
  // request itself (context overflow, malformed body, payload too large, unsupported parameter)
  // says nothing about credential health, so cooling the account down only removes a
  // healthy connection from rotation (#20a43f5a2).
  // Account-scoped statuses keep their rules above (401/402/403/404/429), and the
  // text rules still win for rate-limit / quota / capacity wording.
  if (status >= 400 && status < 500 && status !== 401 && status !== 402 && status !== 403 && status !== 429) {
    return { shouldFallback: false, cooldownMs: 0 };
  }

  // Default: transient cooldown for any unmatched error
  return { shouldFallback: true, cooldownMs: TRANSIENT_COOLDOWN_MS };
}

/**
 * Check if account is currently unavailable (cooldown not expired)
 */
export function isAccountUnavailable(unavailableUntil) {
  if (!unavailableUntil) return false;
  return new Date(unavailableUntil).getTime() > Date.now();
}

/**
 * Calculate unavailable until timestamp
 */
export function getUnavailableUntil(cooldownMs) {
  return new Date(Date.now() + cooldownMs).toISOString();
}

/**
 * Format rateLimitedUntil to human-readable "reset after Xm Ys"
 * @param {string} rateLimitedUntil - ISO timestamp
 * @returns {string} e.g. "reset after 2m 30s"
 */
export function formatRetryAfter(rateLimitedUntil) {
  if (!rateLimitedUntil) return "";
  const diffMs = new Date(rateLimitedUntil).getTime() - Date.now();
  if (diffMs <= 0) return "reset after 0s";
  const totalSec = Math.ceil(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return `reset after ${parts.join(" ")}`;
}

/** Prefix for model lock flat fields on connection record */
export const MODEL_LOCK_PREFIX = "modelLock_";

/** Special key used when no model is known (account-level lock) */
export const MODEL_LOCK_ALL = `${MODEL_LOCK_PREFIX}__all`;

/** Build the flat field key for a model lock */
export function getModelLockKey(model) {
  return model ? `${MODEL_LOCK_PREFIX}${model}` : MODEL_LOCK_ALL;
}

/**
 * Check if a model lock on a connection is still active.
 * Reads flat field `modelLock_${model}` (or `modelLock___all` when model=null).
 */
export function getModelLockIdentity(provider, model) {
  const alias = PROVIDER_ID_TO_ALIAS[provider] || provider;
  return alias && model ? `${getModelQuotaFamily(alias, model) || "normal"}:${getModelUpstreamId(alias, model)}` : model;
}

export function getModelLockUntil(connection, model, provider = connection?.provider) {
  if (!connection) return null;
  const now = Date.now();
  const target = getModelLockIdentity(provider, model);
  let latest = null;
  for (const [key, value] of Object.entries(connection)) {
    if (!key.startsWith(MODEL_LOCK_PREFIX) || !value) continue;
    const lockedModel = key.slice(MODEL_LOCK_PREFIX.length);
    if (key !== MODEL_LOCK_ALL && lockedModel !== model && (!provider || getModelLockIdentity(provider, lockedModel) !== target)) continue;
    const until = new Date(value).getTime();
    if (Number.isFinite(until) && until > now && (latest === null || until > latest)) latest = until;
  }
  return latest === null ? null : new Date(latest).toISOString();
}

export function isModelLockActive(connection, model, provider = connection?.provider) {
  return getModelLockUntil(connection, model, provider) !== null;
}

/**
 * Get earliest active model lock expiry across all modelLock_* fields.
 * Used for UI cooldown display.
 */
export function getEarliestModelLockUntil(connection) {
  if (!connection) return null;
  let earliest = null;
  const now = Date.now();
  for (const [key, val] of Object.entries(connection)) {
    if (!key.startsWith(MODEL_LOCK_PREFIX) || !val) continue;
    const t = new Date(val).getTime();
    if (t <= now) continue;
    if (!earliest || t < earliest) earliest = t;
  }
  return earliest ? new Date(earliest).toISOString() : null;
}

/**
 * Build update object to set a model lock on a connection.
 */
export function buildModelLockUpdate(model, cooldownMs) {
  const key = getModelLockKey(model);
  return { [key]: new Date(Date.now() + cooldownMs).toISOString() };
}

/**
 * Build update object to clear all model locks on a connection.
 */
export function buildClearModelLocksUpdate(connection) {
  const cleared = {};
  for (const key of Object.keys(connection)) {
    if (key.startsWith(MODEL_LOCK_PREFIX)) cleared[key] = null;
  }
  return cleared;
}

/**
 * Filter available accounts (not in cooldown)
 */
export function filterAvailableAccounts(accounts, excludeId = null) {
  const now = Date.now();
  return accounts.filter(acc => {
    if (excludeId && acc.id === excludeId) return false;
    if (acc.rateLimitedUntil) {
      const until = new Date(acc.rateLimitedUntil).getTime();
      if (until > now) return false;
    }
    return true;
  });
}

