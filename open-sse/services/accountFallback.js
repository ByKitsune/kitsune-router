import { ERROR_RULES, BACKOFF_CONFIG, TRANSIENT_COOLDOWN_MS, MAX_RATE_LIMIT_COOLDOWN_MS } from "../config/errorConfig.js";

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
  if (!message) return null;
  const text = typeof message === "string" ? message : JSON.stringify(message);

  // GLM/Z.AI: "reset at 2026-08-17 02:56:15" (provider sends UTC without suffix)
  const resetAt = text.match(/reset at\s+(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/i);
  if (resetAt) {
    const ms = Date.parse(`${resetAt[1]}T${resetAt[2]}Z`);
    if (Number.isFinite(ms) && ms > Date.now()) return ms;
  }

  // "retry in 300 seconds" / "resets in 5 minutes" / "reset after 1m 51s" / "resets in 4m22s"
  const durMatch = text.match(/(?:retry|try again|resets?)\s+(?:after|in)\s+([0-9a-z\s\.]+?)(?:\.\s|\.[\"'\)\]]|\.$|[\,\)\"\']|$)/i);
  if (durMatch) {
    const str = durMatch[1].trim();
    let totalSecs = 0;
    const h = str.match(/(\d+)\s*(?:h(?:ours?)?)/i);
    const m = str.match(/(\d+)\s*(?:m(?:in(?:utes?)?)?)/i);
    const s = str.match(/(\d+(?:\.\d+)?)\s*(?:s(?:ec(?:onds?)?)?)/i);
    if (h) totalSecs += parseInt(h[1], 10) * 3600;
    if (m) totalSecs += parseInt(m[1], 10) * 60;
    if (s) totalSecs += parseFloat(s[1]);
    if (totalSecs > 0) return Date.now() + totalSecs * 1000;
  }

  // Retry-After header (seconds or HTTP-date) — PR #3612
  const ra = response?.headers?.get?.("retry-after") ?? response?.headers?.get?.("Retry-After");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs > 0) return Date.now() + secs * 1000;
    const dateMs = Date.parse(ra);
    if (Number.isFinite(dateMs) && dateMs > Date.now()) return dateMs;
  }

  return null;
}

/**
 * Parse Retry-After header value to epoch ms.
 * Separate helper for callers that only have the header string.
 * @param {string|number} retryAfter - Raw Retry-After header value
 * @returns {number|null} Epoch ms or null
 */
export function parseRetryAfter(retryAfter) {
  if (retryAfter == null) return null;
  const raw = String(retryAfter).trim();
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs > 0) return Date.now() + secs * 1000;
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs) && dateMs > Date.now()) return dateMs;
  return null;
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
 * @returns {{ shouldFallback: boolean, cooldownMs: number, newBackoffLevel?: number, resetsAtMs?: number }}
 */
export function checkFallbackError(status, errorText, backoffLevel = 0, response = null) {
  const lowerError = errorText
    ? (typeof errorText === "string" ? errorText : JSON.stringify(errorText)).toLowerCase()
    : "";

  // Client abort / cancellation: client disconnected, not an account fault
  if (status === 499 || lowerError.includes("client_aborted") || lowerError.includes("aborted")) {
    return { shouldFallback: false, cooldownMs: 0 };
  }

  // Provider-reported precise reset (429, 403, 503 + Retry-After or "reset at / in" pattern)
  const resetsAtMs = extractResetsAtMs(response, errorText);
  if (resetsAtMs) {
    const cooldownMs = Math.min(resetsAtMs - Date.now(), MAX_RATE_LIMIT_COOLDOWN_MS);
    if (cooldownMs > 0) {
      return { shouldFallback: true, cooldownMs, resetsAtMs };
    }
  }

  for (const rule of ERROR_RULES) {
    // Text-based rule: match substring in error message
    if (rule.text && lowerError && lowerError.includes(rule.text)) {
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
 * Get the earliest rateLimitedUntil from a list of accounts
 * @param {Array} accounts - Array of account objects with rateLimitedUntil
 * @returns {string|null} Earliest rateLimitedUntil ISO string, or null
 */
export function getEarliestRateLimitedUntil(accounts) {
  let earliest = null;
  const now = Date.now();
  for (const acc of accounts) {
    if (!acc.rateLimitedUntil) continue;
    const until = new Date(acc.rateLimitedUntil).getTime();
    if (until <= now) continue;
    if (!earliest || until < earliest) earliest = until;
  }
  if (!earliest) return null;
  return new Date(earliest).toISOString();
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
export function isModelLockActive(connection, model) {
  const now = Date.now();
  const stillLocked = (value) => {
    if (!value) return false;
    const until = new Date(value).getTime();
    return Number.isFinite(until) && until > now;
  };
  // Each key is judged on its own expiry. `a || b` picked the per-model key on the
  // truthiness of the string, so a stale one hid a still-active account-wide lock:
  // the connection then read as free for exactly the model that had just failed,
  // while still reading as locked for every other model. Nothing clears the stale
  // key either -- the lazy cleanup runs only after a successful request, and an
  // account under an `__all` lock never gets one. Same rule the sibling
  // `getEarliestModelLockUntil` already applies when it skips expired entries.
  return stillLocked(connection[getModelLockKey(model)]) || stillLocked(connection[MODEL_LOCK_ALL]);
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

/**
 * Reset account state when request succeeds
 * Clears cooldown and resets backoff level to 0
 * @param {object} account - Account object
 * @returns {object} Updated account with reset state
 */
export function resetAccountState(account) {
  if (!account) return account;
  return {
    ...account,
    rateLimitedUntil: null,
    backoffLevel: 0,
    lastError: null,
    status: "active"
  };
}

/**
 * Apply error state to account
 * @param {object} account - Account object
 * @param {number} status - HTTP status code
 * @param {string} errorText - Error message
 * @returns {object} Updated account with error state
 */
export function applyErrorState(account, status, errorText) {
  if (!account) return account;

  const backoffLevel = account.backoffLevel || 0;
  const { cooldownMs, newBackoffLevel } = checkFallbackError(status, errorText, backoffLevel);

  return {
    ...account,
    rateLimitedUntil: cooldownMs > 0 ? getUnavailableUntil(cooldownMs) : null,
    backoffLevel: newBackoffLevel ?? backoffLevel,
    lastError: { status, message: errorText, timestamp: new Date().toISOString() },
    status: "error"
  };
}
