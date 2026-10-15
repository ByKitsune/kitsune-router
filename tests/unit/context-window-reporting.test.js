// P02 regression gate — honest context reporting + correct status for overflow.
//
// Two production defects are locked here.
//
//  1. `/v1/models` under-reported the GPT context window. The Codex route
//     published the Codex CLI configuration ceiling (872,000 for GPT-6, the
//     272,000 CLI default for GPT-5.6) as `context_length`, while the real
//     backend accepted far more. Measured live against the running gateway:
//       272,000 advertised -> 402,486 tokens accepted (HTTP 200)
//       872,000 advertised -> 902,486 tokens accepted (HTTP 200)
//       909,486 tokens accepted, 957,000 rejected with context_length_exceeded
//     The true ceiling is apiMaxInput (922,000). models.dev's official OpenAI
//     entries, Griphub's live /v1/models and 9router's patterns all agree on a
//     1,050,000 window / 922,000 input / 128,000 output.
//
//  2. A context overflow was answered with HTTP 502 (Bad Gateway) even though
//     the body said `invalid_request_error`. ByKitsune treats 502 as retryable,
//     so a too-long prompt was retried through every channel for an error that
//     could never succeed — and each attempt locked a healthy account.
import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";

const API_CONTEXT = 1050000;
const API_MAX_INPUT = 922000;
const API_MAX_OUTPUT = 128000;

// The family the audit measured. Every one of these must report the API limits.
const GPT6_FAMILY = ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "gpt-6.1-sol"];
const GPT56_FAMILY = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];

describe("reported context window matches the real capability", () => {
  it("reports the API window for every GPT-6 / GPT-5.6 model", () => {
    for (const model of [...GPT6_FAMILY, ...GPT56_FAMILY]) {
      const caps = getCapabilitiesForModel("codex", model);
      expect(caps.contextWindow, model).toBe(API_CONTEXT);
      expect(caps.maxInput, model).toBe(API_MAX_INPUT);
      expect(caps.maxOutput, model).toBe(API_MAX_OUTPUT);
    }
  });

  it("never reports the CLI configuration ceiling as the context window", () => {
    // Guards the exact regression: 872000/272000 were the CLI numbers.
    for (const model of [...GPT6_FAMILY, ...GPT56_FAMILY]) {
      const ctx = getCapabilitiesForModel("codex", model).contextWindow;
      expect(ctx, model).not.toBe(872000);
      expect(ctx, model).not.toBe(272000);
    }
  });

  it("is not smaller than the largest prompt the gateway actually served", () => {
    // 902,486 tokens were accepted for a model advertised at 872,000. Reporting
    // anything below the measured acceptance would under-advertise again.
    const MEASURED_ACCEPTED = 902486;
    for (const model of [...GPT6_FAMILY, ...GPT56_FAMILY]) {
      expect(getCapabilitiesForModel("codex", model).contextWindow, model)
        .toBeGreaterThan(MEASURED_ACCEPTED);
    }
  });

  it("keeps the CLI ceilings as a separate, client-scoped fact", () => {
    const metadata = getReviewedModelMetadata("codex", "gpt-6-luna");
    expect(metadata.limits.cliDefaultContext).toBe(272000);
    expect(metadata.limits.cliMaxContext).toBe(872000);
    expect(metadata.limits.cliMaxContextSemantics).toMatch(/not a backend hard cap/i);
    // The published window is the API one, not the CLI one.
    expect(metadata.capabilities.contextWindow).toBe(API_CONTEXT);
  });

  it("reports the documented window for the smaller GPT-5.4 mini", () => {
    const mini = getCapabilitiesForModel("codex", "gpt-5.4-mini");
    // gpt-5.4-mini is also absent from the pinned Codex bundle and rejected by
    // the ChatGPT-account route, so its route window stays unset while the
    // reference numbers live under limits.
    const miniMeta = getReviewedModelMetadata("codex", "gpt-5.4-mini");
    expect(miniMeta.limits.apiContextWindow).toBe(400000);
    expect(miniMeta.limits.apiMaxInput).toBe(272000);
    expect(miniMeta.limits.apiMaxOutput).toBe(128000);
    expect(mini.contextWindow ?? null).toBeNull();
    // The API-side declaration is unaffected.
    expect(getCapabilitiesForModel("openai", "gpt-5.4-mini")).toMatchObject({
      contextWindow: 400000, maxInput: 272000, maxOutput: 128000,
    });
  });

  it("keeps an unusable route's window unset rather than advertising it", () => {
    // cx/gpt-5.4 and cx/gpt-5.3-codex-spark are listed but rejected upstream
    // ("not supported when using Codex with a ChatGPT account", reproduced live
    // with HTTP 400). Advertising a context window for them would promise a
    // capability the route cannot serve.
    for (const model of ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark"]) {
      const meta = getReviewedModelMetadata("codex", model);
      expect(meta.limits.routeContextWindow, model).toBeNull();
      expect(meta.limits.unverifiedCapabilityFields, model).toContain("contextWindow");
      expect(meta.limits.authenticatedRouteVerified, model).toBe(false);
    }
  });
});

describe("context overflow never locks a healthy account", () => {
  it("fails fast on a 400 (the request is the problem, not the credential)", () => {
    // Deliberate contract (#20a43f5a2): a prompt that is too long fails
    // identically on every account, so falling through only multiplies the
    // latency of an unavoidable error. No fallback, no cooldown.
    const result = checkFallbackError(400, "Your input exceeds the context window of this model. Please adjust your input and try again.");
    expect(result).toEqual({ shouldFallback: false, cooldownMs: 0 });
  });

  it("recognises the upstream code form", () => {
    const result = checkFallbackError(400, JSON.stringify({
      error: { type: "invalid_request_error", code: "context_length_exceeded", param: "input" },
    }));
    expect(result).toEqual({ shouldFallback: false, cooldownMs: 0 });
  });

  it("recognises the common wording variants", () => {
    for (const text of [
      "maximum context length is 1050000 tokens",
      "context length exceeded",
      "This model's maximum context length is 128000 tokens",
    ]) {
      expect(checkFallbackError(400, text), text).toEqual({ shouldFallback: false, cooldownMs: 0 });
    }
  });

  it("does not lock the account when the upstream mislabels it as 5xx", () => {
    // Upstream reported the overflow inside a stream, which the executor used to
    // surface as 503/502. Even if a 502 arrives carrying that text, the account
    // must not be cooled down: the prompt is the problem, not the credential.
    for (const status of [500, 502, 503, 504]) {
      const result = checkFallbackError(status, "Your input exceeds the context window of this model.");
      expect(result.cooldownMs, `status ${status}`).toBe(0);
      expect(result.shouldFallback, `status ${status}`).toBe(true);
    }
  });
});

describe("the error is not confused with a genuine gateway fault", () => {
  it("still cools down for a real 5xx without overflow wording", () => {
    const transient = checkFallbackError(502, "upstream connect error");
    expect(transient.shouldFallback).toBe(true);
    expect(transient.cooldownMs).toBeGreaterThan(0);
  });
});
