import { describe, expect, it } from "vitest";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";
import { TRANSIENT_COOLDOWN_MS } from "../../open-sse/config/errorConfig.js";

const denial = "The 'gpt-6-astra' model is not supported when using Codex with a ChatGPT account.";

describe("Codex restriction text with authoritative availability evidence", () => {
  it("keeps an ordinary model entitlement denial healthy", () => {
    expect(checkFallbackError(400, { message: denial, type: "invalid_request_error" }))
      .toEqual({ shouldFallback: true, cooldownMs: 0 });
  });

  it.each([
    [400, { code: "rate_limit_exceeded" }],
    [429, { code: "rate_limit_exceeded" }],
    [400, { type: "quota_error" }],
    [503, { type: "resource_exhausted" }],
  ])("retains quota cooldown on status %i with %j", (status, evidence) => {
    expect(checkFallbackError(status, { message: denial, ...evidence }))
      .toMatchObject({ shouldFallback: true, cooldownMs: expect.any(Number), newBackoffLevel: 1 });
    expect(checkFallbackError(status, { message: denial, ...evidence }).cooldownMs).toBeGreaterThan(0);
  });

  it.each([{ code: "insufficient_credits" }, { type: "billing_error" }])("retains normalized billing cooldown with %j", evidence => {
    expect(checkFallbackError(503, { message: denial, ...evidence }))
      .toEqual({ shouldFallback: true, cooldownMs: TRANSIENT_COOLDOWN_MS });
    // Legacy callers that have not normalized a billing 400 retain bounded
    // fallback with a positive account cooldown, just like the public path.
    expect(checkFallbackError(400, { message: denial, ...evidence }))
      .toEqual({ shouldFallback: true, cooldownMs: TRANSIENT_COOLDOWN_MS });
    expect(checkFallbackError(400, { message: "Purchase more usage to continue.", ...evidence }))
      .toEqual({ shouldFallback: true, cooldownMs: TRANSIENT_COOLDOWN_MS });
  });

  it("honors precise retry evidence before model restriction rules", () => {
    const response = new Response(null, { status: 429, headers: { "retry-after": "60" } });
    const decision = checkFallbackError(429, { message: denial, code: "rate_limit_exceeded" }, 0, response);
    expect(decision.shouldFallback).toBe(true);
    expect(decision.cooldownMs).toBeGreaterThan(59_000);
    expect(decision.cooldownMs).toBeLessThanOrEqual(60_000);
    expect(decision.resetsAtMs).toBeGreaterThan(Date.now());
  });

  it("preserves request validation, cancellation and terminal auth decisions", () => {
    expect(checkFallbackError(400, { message: denial, code: "unsupported_parameter" }))
      .toEqual({ shouldFallback: false, cooldownMs: 0 });
    expect(checkFallbackError(499, { message: denial, code: "rate_limit_exceeded" }))
      .toEqual({ shouldFallback: false, cooldownMs: 0 });
    expect(checkFallbackError(403, {
      message: "OAuth authentication is currently not allowed for this organization and ChatGPT account.",
      code: "rate_limit_exceeded",
    })).toMatchObject({ shouldFallback: true, terminal: true, cooldownMs: 15 * 60 * 1000 });
  });
});
