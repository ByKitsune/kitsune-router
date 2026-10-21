import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { supportsGrokCliReasoningEffort } from "../../open-sse/config/grokCli.js";

beforeEach(() => setCatalogSource(null));
afterEach(() => setCatalogSource(null));

describe("verified specs for flagship 2026 models", () => {
  it("resolves gpt-6.1-sol capabilities and pricing correctly", () => {
    const caps = getCapabilitiesForModel("openai", "gpt-6.1-sol");
    expect(caps).toMatchObject({
      contextWindow: 1050000,
      maxOutput: 128000,
      vision: true,
      pdf: true,
      reasoning: true,
    });
    const pricing = getPricingForModel("openai", "gpt-6.1-sol");
    expect(pricing).toMatchObject({
      input: 2.0,
      output: 10.0,
      cached: 0.1,
      cache_write_30m: 2.5,
      cache_write_12h: 5,
    });
    // Native TTL categories replace ordinary input, not an additive write fee
    // and not Anthropic 5m/1h cache_creation counters.
    expect(calculateCostFromTokens({ prompt_tokens: 2000, cache_write_30m_tokens: 1000, cache_write_12h_tokens: 1000 }, pricing)).toBeCloseTo(0.0075, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cache_creation_input_tokens: 1000 }, pricing)).toBeNull();
  });

  it("resolves Grok 4.7 with 500k context and no invented numeric output maximum", () => {
    const caps = getCapabilitiesForModel("xai", "grok-4.7");
    expect(caps).toMatchObject({
      contextWindow: 500000,
      maxOutput: null,
      vision: true,
      pdf: true,
      reasoning: true,
    });
    const metadata = getReviewedModelMetadata("xai", "grok-4.7");
    expect(metadata.limits).toMatchObject({
      unverifiedCapabilityFields: expect.arrayContaining(["maxOutput"]),
      scope: "public-api-specification", authenticatedRouteVerified: false,
    });
    expect(metadata.sources).toContain("https://docs.x.ai/developers/models/grok-4.7");
    expect(supportsGrokCliReasoningEffort("grok-4.7")).toBe(true);
    const p = getPricingForModel("xai", "grok-4.7");
    expect(p).toMatchObject({
      input: 2.0,
      output: 6.0,
      cached: 0.5,
    });
  });

  it("resolves Grok 4.3 with 1M context and explicitly unverified output", () => {
    const metadata = getReviewedModelMetadata("xai", "grok-4.3");
    expect(metadata.limits).toMatchObject({
      unverifiedCapabilityFields: expect.arrayContaining(["maxOutput"]), authenticatedRouteVerified: false,
    });
    expect(metadata.sources).toContain("https://docs.x.ai/developers/models/grok-4.3");
    const caps = getCapabilitiesForModel("xai", "grok-4.3");
    expect(caps).toMatchObject({
      contextWindow: 1000000,
      maxOutput: null,
      vision: true,
      pdf: true,
      reasoning: true,
    });
  });

  it("prices literal Gemini 3.8/3.6 Flash rows at the official 2026 schedule ($0.75/$3.75)", () => {
    for (const model of ["gemini-3.8-flash", "gemini-3.6-flash"]) {
      const p = getPricingForModel("gemini", model);
      expect(p).toMatchObject({
        input: 0.75,
        output: 3.75,
        cached: 0.075,
      });
    }
  });

  it("does not turn the Gemini 3.7 redirect destination into an established alias invoice", () => {
    const metadata = getReviewedModelMetadata("gemini", "gemini-3.7-flash");
    expect(metadata.limits.documentedSnapshot).toBe("gemini-3.8-flash");
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 100 }, getPricingForModel("gemini", "gemini-3.7-flash"))).toBeNull();
  });

  it("prices Gemini 3.1 Pro Preview at official $2/$12 ($0.20 cache read)", () => {
    const p = getPricingForModel("gemini", "gemini-3.1-pro-preview");
    expect(p).toMatchObject({
      input: 2.0,
      output: 12.0,
      cached: 0.2,
    });
  });

  it("uses the official text-only Spark preview instead of secondary catalog limits", () => {
    // The ChatGPT-account Codex route rejects this model outright:
    // "The 'gpt-5.3-codex-spark' model is not supported when using Codex with a
    // ChatGPT account" (reproduced live, HTTP 400). Its context_length therefore
    // stays unset rather than advertising a window the route cannot serve; the
    // reference numbers are recorded under limits for display.
    expect(getCapabilitiesForModel("codex", "gpt-5.3-codex-spark")).toMatchObject({
      vision: false, pdf: false, contextWindow: null, maxOutput: null,
    });
    const spark = getReviewedModelMetadata("codex", "gpt-5.3-codex-spark");
    expect(spark.limits).toMatchObject({
      scope: "cli-preview", authenticatedRouteVerified: false,
      routeContextWindow: null, routeMaxOutput: null,
      apiContextWindow: 128000, apiMaxInput: 100000, apiMaxOutput: 32000,
      unverifiedCapabilityFields: expect.arrayContaining(["contextWindow", "maxInput", "maxOutput"]),
    });
  });

  it.each(["codex", "cx"])("does not promote GPT-5.4 API specifications into unverified %s route limits", (provider) => {
    expect(getCapabilitiesForModel(provider, "gpt-5.4")).toMatchObject({
      contextWindow: null, maxInput: null, maxOutput: null,
    });
    expect(getCapabilitiesForModel("openai", "gpt-5.4")).toMatchObject({
      contextWindow: 1050000, maxOutput: 128000,
    });
    const metadata = getReviewedModelMetadata(provider, "gpt-5.4");
    expect(metadata.limits).toMatchObject({
      scope: "api-reference-for-client-route", authenticatedRouteVerified: false,
      apiContextWindow: 1050000, apiMaxOutput: 128000,
      routeContextWindow: null, routeMaxOutput: null,
      unverifiedCapabilityFields: expect.arrayContaining(["contextWindow", "maxInput", "maxOutput"]),
    });
  });
});
