// P01 regression gate — revoked OAuth credentials + provider Retry-After.
//
// Two production defects are locked here:
//
//  1. A revoked/invalidated OAuth token matched no error rule, so it fell
//     through to the generic `{ status: 401, cooldownMs: 2min }` rule. The
//     account was therefore retried every two minutes forever — production
//     logged 31 `token_revoked` events across 8 hours, retrying one account
//     16 times and another 15 times.
//
//  2. `checkFallbackError(status, errorText, backoffLevel, response)` accepted a
//     `Response` specifically to read the provider's `Retry-After`, but no
//     caller passed it. The whole "provider-reported precise reset" branch was
//     dead code, so a provider asking for an hour of quiet was retried after
//     seconds (1s→2s→4s backoff).
//
// The tests below also pin the cases that must NOT change: a revocable token
// still gets one refresh attempt, transient quota errors keep backing off, and
// model-scoped failures keep their zero cooldown.
import { describe, expect, it } from "vitest";
import {
  checkFallbackError,
  isPermanentAuthDenial,
  isRevokedCredentialError,
  needsOperatorReauth,
} from "../../open-sse/services/accountFallback.js";
import { REVOKED_TOKEN_COOLDOWN_MS, ERROR_RULES } from "../../open-sse/config/errorConfig.js";

const HOUR = 60 * 60 * 1000;
const TWO_MIN = 2 * 60 * 1000;

// Verbatim shape from the production journal (Codex / ChatGPT backend).
const CODEX_TOKEN_REVOKED = JSON.stringify({
  error: {
    message: "Encountered invalidated oauth token for user, failing request",
    code: "token_revoked",
    status: 401,
  },
});

describe("revoked OAuth credentials are classified as permanent", () => {
  it("detects the Codex token_revoked payload", () => {
    expect(isRevokedCredentialError(401, CODEX_TOKEN_REVOKED)).toBe(true);
  });

  it("detects the message text without the code field", () => {
    expect(isRevokedCredentialError(401, "Encountered invalidated oauth token for user")).toBe(true);
  });

  it("detects xAI/Grok refresh-token revocation", () => {
    expect(isRevokedCredentialError(401, "refresh token has been revoked")).toBe(true);
    expect(isRevokedCredentialError(401, "refresh_token_reused")).toBe(true);
  });

  it("is case-insensitive and accepts non-string bodies", () => {
    expect(isRevokedCredentialError(401, { error: { message: "TOKEN_REVOKED" } })).toBe(true);
  });

  it("does not claim ordinary auth failures are revocations", () => {
    expect(isRevokedCredentialError(401, "invalid api key")).toBe(false);
    expect(isRevokedCredentialError(401, "Unauthorized")).toBe(false);
    expect(isRevokedCredentialError(429, "token_revoked")).toBe(false);
  });

  it("drives the needs_reauth operator signal", () => {
    expect(needsOperatorReauth(401, CODEX_TOKEN_REVOKED)).toBe(true);
    // org-policy denials keep signalling re-auth too
    expect(needsOperatorReauth(403, "oauth_org_not_allowed")).toBe(true);
    // an ordinary bad key is not a re-auth case (the operator may just fix it)
    expect(needsOperatorReauth(401, "invalid api key")).toBe(false);
  });
});

describe("revoked credential cooldown", () => {
  it("is terminal with the 1h revocation cooldown, not the 2min 401 rule", () => {
    const result = checkFallbackError(401, CODEX_TOKEN_REVOKED);
    expect(result.shouldFallback).toBe(true);
    expect(result.terminal).toBe(true);
    expect(result.cooldownMs).toBe(REVOKED_TOKEN_COOLDOWN_MS);
    expect(result.cooldownMs).toBe(HOUR);
  });

  it("is at least 10x longer than the generic 401 cooldown", () => {
    // Guards the actual regression: reverting to the generic 401 rule must fail.
    const revoked = checkFallbackError(401, CODEX_TOKEN_REVOKED).cooldownMs;
    const generic = checkFallbackError(401, "Unauthorized").cooldownMs;
    expect(generic).toBe(TWO_MIN);
    expect(revoked).toBeGreaterThanOrEqual(generic * 10);
  });

  it("still falls back to the next account (does not fail the request)", () => {
    expect(checkFallbackError(401, CODEX_TOKEN_REVOKED).shouldFallback).toBe(true);
  });
});

describe("error rules that must not regress", () => {
  it("keeps rate limits on exponential backoff", () => {
    const l1 = checkFallbackError(429, "rate limit exceeded", 0);
    const l2 = checkFallbackError(429, "rate limit exceeded", l1.newBackoffLevel);
    expect(l1.shouldFallback).toBe(true);
    expect(l1.newBackoffLevel).toBe(1);
    expect(l2.cooldownMs).toBeGreaterThan(l1.cooldownMs);
    expect(l1.terminal).toBeUndefined();
  });

  it("keeps quota-exceeded wording on backoff, not the revocation cooldown", () => {
    const result = checkFallbackError(429, "quota exceeded");
    expect(result.newBackoffLevel).toBe(1);
    expect(result.cooldownMs).toBeLessThan(HOUR);
  });

  it("keeps model-scoped failures at zero cooldown", () => {
    for (const text of ["model_not_found", "unknown model", "has been retired"]) {
      const result = checkFallbackError(404, text);
      expect(result.shouldFallback, text).toBe(true);
      expect(result.cooldownMs, text).toBe(0);
    }
  });

  it("keeps org-policy denials on the 15min extended cooldown", () => {
    const result = checkFallbackError(403, "oauth_org_not_allowed");
    expect(result.terminal).toBe(true);
    expect(result.cooldownMs).toBe(15 * 60 * 1000);
  });

  it("keeps client aborts from locking anything", () => {
    const result = checkFallbackError(499, "client_aborted");
    expect(result.shouldFallback).toBe(false);
    expect(result.cooldownMs).toBe(0);
  });

  it("does not treat every 401 as a revocation", () => {
    // A plain 401 must keep the ordinary (short) terminal cooldown so a token
    // that a refresh CAN heal is not locked for an hour.
    expect(checkFallbackError(401, "invalid api key").cooldownMs).toBe(TWO_MIN);
  });
});

describe("revocation text rules are ordered before the generic 401 status rule", () => {
  it("places every revoked-credential text rule above the 401 status rule", () => {
    const firstRevoked = ERROR_RULES.findIndex((r) => r.text === "token_revoked");
    const first401 = ERROR_RULES.findIndex((r) => r.status === 401);
    expect(firstRevoked).toBeGreaterThanOrEqual(0);
    expect(first401).toBeGreaterThan(firstRevoked);
  });
});

describe("provider Retry-After is honoured instead of a guessed backoff", () => {
  const responseWithRetryAfter = (seconds) =>
    new Response("{}", { status: 429, headers: { "Retry-After": String(seconds) } });

  it("uses the provider's Retry-After when a Response is passed", () => {
    const result = checkFallbackError(429, "rate limit", 0, responseWithRetryAfter(3600));
    expect(result.resetsAtMs).toBeGreaterThan(Date.now() + 3500 * 1000);
    // 3600s is capped by MAX_RATE_LIMIT_COOLDOWN_MS (6h), so it survives intact.
    expect(result.cooldownMs).toBeGreaterThan(3500 * 1000);
  });

  it("accepts an HTTP-date Retry-After", () => {
    const when = new Date(Date.now() + 1800 * 1000).toUTCString();
    const res = new Response("{}", { status: 429, headers: { "Retry-After": when } });
    const result = checkFallbackError(429, "rate limit", 0, res);
    expect(result.cooldownMs).toBeGreaterThan(1700 * 1000);
  });

  it("still works without a Response (backward compatible)", () => {
    const result = checkFallbackError(429, "rate limit", 0);
    expect(result.newBackoffLevel).toBe(1);
    expect(result.cooldownMs).toBeLessThan(10 * 1000);
  });

  it("honours Retry-After on a 403 quota exhaustion (not only 429)", () => {
    const res = new Response("{}", { status: 403, headers: { "Retry-After": "600" } });
    const result = checkFallbackError(403, "quota exhausted", 0, res);
    expect(result.cooldownMs).toBeGreaterThan(590 * 1000);
  });

  it("ignores a malformed Retry-After instead of inventing a cooldown", () => {
    const res = new Response("{}", { status: 429, headers: { "Retry-After": "soon" } });
    const result = checkFallbackError(429, "rate limit", 0, res);
    expect(result.newBackoffLevel).toBe(1);
    expect(result.cooldownMs).toBeLessThan(10 * 1000);
  });
});
