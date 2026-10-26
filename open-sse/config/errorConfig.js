// OpenAI-compatible error types mapping (client-facing)
export const ERROR_TYPES = {
  400: { type: "invalid_request_error", code: "bad_request" },
  401: { type: "authentication_error", code: "invalid_api_key" },
  402: { type: "billing_error", code: "payment_required" },
  403: { type: "permission_error", code: "permission_denied" },
  404: { type: "invalid_request_error", code: "model_not_found" },
  410: { type: "invalid_request_error", code: "model_retired" },
  406: { type: "invalid_request_error", code: "model_not_supported" },
  429: { type: "rate_limit_error", code: "rate_limit_exceeded" },
  500: { type: "server_error", code: "internal_server_error" },
  502: { type: "server_error", code: "bad_gateway" },
  503: { type: "server_error", code: "service_unavailable" },
  504: { type: "server_error", code: "gateway_timeout" }
};

// Default error messages per status code (client-facing)
export const DEFAULT_ERROR_MESSAGES = {
  400: "Bad request",
  401: "Invalid API key provided",
  402: "Payment required",
  403: "Permission denied",
  404: "Model not found",
  410: "Model has been retired",
  406: "Model not supported",
  429: "Rate limit exceeded",
  500: "Internal server error",
  502: "Bad gateway - upstream provider error",
  503: "Service temporarily unavailable",
  504: "Gateway timeout"
};

export const FALLBACK_SCOPE = { ACCOUNT: "account", COMBO: "combo" };
export const NON_RETRYABLE_ROUTER_CODES = new Set(["usage_acceptance_failed", "usage_accounting_uncertain"]);
export const NONFINAL_CHAT_FINISH_REASONS = new Set([null, undefined, "in_progress", "incomplete"]);

// Exponential backoff config for rate limits
export const BACKOFF_CONFIG = {
  base: 2000,
  max: 5 * 60 * 1000,
  maxLevel: 15
};

// Default cooldown for transient/unknown errors
export const TRANSIENT_COOLDOWN_MS = 30 * 1000;

// Hard cap for provider-reported rate limit cooldown (e.g. codex resets_at can be 5-6h)
export const MAX_RATE_LIMIT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// New Google structured reset hints remain untrusted/bounded. This does not
// change separately authenticated quota windows or provider-specific resets.
export const GOOGLE_QUOTA_RESET_HINTS = {
  statuses: new Set([403, 409, 429]),
  errorInfoType: "type.googleapis.com/google.rpc.ErrorInfo",
  retryInfoType: "type.googleapis.com/google.rpc.RetryInfo",
  domains: new Set(["cloudcode-pa.googleapis.com", "googleapis.com"]),
  reasons: new Set(["QUOTA_EXHAUSTED", "QUOTA_EXCEEDED", "RATE_LIMIT_EXCEEDED"]),
  maxDetails: 32,
};

// Cooldown durations (ms)
const COOLDOWN = {
  extended: 15 * 60 * 1000, // 15m for zero balance / quota exhausted across accounts
  revoked: 60 * 60 * 1000,  // 1h for a revoked/invalidated OAuth token (see below)
  long: 2 * 60 * 1000,
  short: 5 * 1000,
};

// Cooldown for a provider-revoked OAuth token, exported for the regression test.
// Rationale: a revoked token does NOT heal on its own — only a human re-auth
// fixes it, and the retry budget is otherwise wasted every `COOLDOWN.long`
// (observed: one account retried 16x across 8h). 1h is deliberately bounded so
// a credential that starts working again (operator re-auth, provider-side
// reinstatement) returns to rotation within the hour without operator action,
// while cutting the wasted retry rate by ~30x. The refresh path still runs
// first, so a token that a refresh CAN heal never reaches this cooldown.
export const REVOKED_TOKEN_COOLDOWN_MS = COOLDOWN.revoked;

/**
 * Unified error classification rules.
 * Checked top-to-bottom: text rules first (by order), then status rules.
 * Each rule: { text?, status?, cooldownMs?, backoff?, accountFault?, comboFallback? }
 *   - text: substring match (case-insensitive) on error message
 *   - status: HTTP status code match
 *   - cooldownMs: fixed cooldown duration
 *   - accountFault: false prevents request-only failures from locking credentials
 *   - comboFallback: true allows a different model to serve that request
 *   - backoff: true = use exponential backoff (rate limit)
 */
export const ERROR_RULES = [
  // --- Terminal billing rules (checked first, order = priority) (#4147) ---
  { text: "余额不足",                 cooldownMs: COOLDOWN.extended, terminal: true },
  { text: "请充值",                   cooldownMs: COOLDOWN.extended, terminal: true },
  { text: "balance is at $0",         cooldownMs: COOLDOWN.extended, terminal: true },
  { text: "balance_zero",             cooldownMs: COOLDOWN.extended, terminal: true },
  { text: "insufficient balance",     cooldownMs: COOLDOWN.extended, terminal: true },
  { text: "insufficient funds",       cooldownMs: COOLDOWN.extended, terminal: true },
  { text: "no credentials",           cooldownMs: COOLDOWN.long, terminal: true },
  { text: "request not allowed",      cooldownMs: COOLDOWN.short },
  { text: "improperly formed request", cooldownMs: COOLDOWN.long },
  { text: "rate limit",               backoff: true },
  { text: "too many requests",        backoff: true },
  { text: "quota exceeded",           backoff: true },
  // Credit exhaustion can ride on HTTP 400 (upstream reports it as a bad
  // request instead of 402). The account is out of credits for this model but
  // the combo should advance to the next member rather than fail the request
  // (9router #4715/#4713).
  { text: "insufficient credit",      backoff: true },
  { text: "capacity",                 backoff: true },
  { text: "overloaded",               backoff: true },
  // Model-scoped permanent failures (9router #4271/#4263): the account cannot
  // serve THIS model (unentitled slug, retired/EOL id, client too old) but is
  // otherwise healthy. Fall through to the next combo member / account WITHOUT
  // cooling the account down — a cooldown here would lock a healthy credential
  // for an unrelated model's problem. Cooldown 0 = no lock, still fallback.
  { text: "unentitled",                 cooldownMs: 0 },
  { text: "not entitled",               cooldownMs: 0 },
  { text: "model_not_found",            cooldownMs: 0 },
  { text: "no such model",              cooldownMs: 0 },
  { text: "unknown model",              cooldownMs: 0 },
  { text: "unsupported model",          cooldownMs: 0 },
  { text: "version_too_old",            cooldownMs: 0 },
  { text: "model has been retired",     cooldownMs: 0 },
  { text: "has been retired",           cooldownMs: 0 },
  { text: "end of life",                cooldownMs: 0 },
  { text: "no longer supported",        cooldownMs: 0 },
  { text: "model is unavailable",       cooldownMs: COOLDOWN.long },
  // Model/schema incompatibility failures (9router #4447): specific upstream schema
  // rejections (e.g. Gemini INVALID_ARGUMENT on unsupported schema forms) that should
  // allow the combo to advance to the next model without cooling down the healthy account.
  // 404 "Requested entity was not found." (Antigravity/Cloud Code) is a
  // resource/model-scoped miss, not a credential fault: the project or the
  // requested model does not exist for this call. Cooling the account down
  // removes a healthy connection from rotation and, with a paged provider,
  // locks the whole pool at once for the same unavailable model. Route around
  // it instead, like the 410 retired-model rule below.
  {
    text: "requested entity was not found",
    cooldownMs: 0,
  },
  { text: "function_declarations",      cooldownMs: 0 },
  { text: "unsupported schema",         cooldownMs: 0 },
  // A larger-context combo member may serve the same prompt. Another account
  // for the rejected model cannot; its credentials must remain healthy.
  { text: "context_length_exceeded",    cooldownMs: 0, accountFault: false, comboFallback: true },
  { text: "context_window_exceeded",    cooldownMs: 0, accountFault: false, comboFallback: true },
  { text: "exceeds the context window", cooldownMs: 0, accountFault: false, comboFallback: true },
  { text: "maximum context length",     cooldownMs: 0, accountFault: false, comboFallback: true },
  { text: "context length exceeded",    cooldownMs: 0, accountFault: false, comboFallback: true },
  { text: "input token count exceeds", cooldownMs: 0, accountFault: false, comboFallback: true },
  { text: "unsupported_parameter",     cooldownMs: 0, accountFault: false, comboFallback: true },
  { text: "empty nonterminal completion", cooldownMs: 0, accountFault: false },
  // Request-scoped reasoning exhaustion: a different combo model may fit the
  // budget, but the upstream account is healthy and must never be locked.
  { text: "output budget exhausted before any text or tool calls", cooldownMs: 0 },
  // ChatGPT account model restriction on Codex (9router #4369)
  { text: "not supported when using codex with a chatgpt account", cooldownMs: 0 },
  { text: "chatgpt account",            cooldownMs: 0 },
  { text: "response.failed",            cooldownMs: 0 },
  // AiHubMix free-tier abuse gate (#3602): "Sorry, to prevent abuse of free resources..."
  { text: "prevent abuse",            cooldownMs: COOLDOWN.extended },
  { text: "can only try",             cooldownMs: COOLDOWN.extended },
  // CommandCode stream error interception (#3636)
  { text: "[commandcode error",        cooldownMs: COOLDOWN.short },
  { text: "commandcode error",         cooldownMs: COOLDOWN.short },
  // Permanent OAuth/org-policy denials (Anthropic `oauth_not_allowed_for_organization`,
  // Claude Code `oauth_org_not_allowed`). Server-side org policy — token refresh
  // can never heal it, so mark terminal with a long cooldown and never retry
  // aggressively. Fallback to the next account is still allowed (different org
  // credentials may work), but the failing account stays locked.
  { text: "oauth_not_allowed",          cooldownMs: COOLDOWN.extended, terminal: true },
  { text: "oauth_org_not_allowed",      cooldownMs: COOLDOWN.extended, terminal: true },
  { text: "oauth authentication is currently not allowed", cooldownMs: COOLDOWN.extended, terminal: true },
  { text: "organization has disabled",  cooldownMs: COOLDOWN.extended, terminal: true },

  // Permanently revoked / invalidated OAuth credentials. A revoked token cannot
  // be healed by refreshing it, so the generic 401 rule (2 min) turned a dead
  // account into an endless retry loop — production observed one account
  // retried 16x across 8h and 31 `token_revoked` events total, each burning a
  // refresh round-trip plus upstream rate-limit budget. These are marked
  // terminal with the dedicated 1h cooldown (see REVOKED_TOKEN_COOLDOWN_MS):
  // long enough to stop the storm, short enough that a human re-auth returns
  // the account to rotation within the hour. Checked BEFORE the generic 401
  // status rule, which otherwise matches first.
  //   - OpenAI/Codex: {"code":"token_revoked","message":"Encountered invalidated oauth token for user"}
  //   - xAI/Grok CLI: "invalid_grant"/"refresh token has been revoked"
  //   - generic OAuth: "token has been revoked", "token revoked", "credentials revoked"
  { text: "token_revoked",              cooldownMs: COOLDOWN.revoked, terminal: true },
  { text: "token revoked",              cooldownMs: COOLDOWN.revoked, terminal: true },
  { text: "token has been revoked",     cooldownMs: COOLDOWN.revoked, terminal: true },
  { text: "revoked token",              cooldownMs: COOLDOWN.revoked, terminal: true },
  { text: "invalidated oauth token",    cooldownMs: COOLDOWN.revoked, terminal: true },
  { text: "invalidated token",          cooldownMs: COOLDOWN.revoked, terminal: true },
  { text: "credentials revoked",        cooldownMs: COOLDOWN.revoked, terminal: true },
  { text: "refresh token has been revoked", cooldownMs: COOLDOWN.revoked, terminal: true },
  { text: "refresh_token_reused",       cooldownMs: COOLDOWN.revoked, terminal: true },

  // --- Status-based rules (fallback when text doesn't match) ---
  { status: 401, cooldownMs: COOLDOWN.long, terminal: true },
  { status: 402, cooldownMs: COOLDOWN.extended, terminal: true },
  { status: 403, cooldownMs: COOLDOWN.long },
  { status: 404, cooldownMs: COOLDOWN.long },
  // 410 Gone = retired/EOL model id: route around it, don't lock the account.
  { status: 410, cooldownMs: 0 },
  { status: 429, backoff: true },
];

// Backward compat: COOLDOWN_MS object (used by index.js re-export)
export const COOLDOWN_MS = {
  unauthorized: COOLDOWN.long,
  paymentRequired: COOLDOWN.long,
  notFound: COOLDOWN.long,
  transient: TRANSIENT_COOLDOWN_MS,
  requestNotAllowed: COOLDOWN.short,
};
