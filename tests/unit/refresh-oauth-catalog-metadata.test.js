import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { calculateCostFromTokens, getPricingForModel, resolveEffectivePricing } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

// Exercise real metadata consumers, not a shard snapshot: catch hosted routes
// inheriting vendor modality/limit guesses or billing a subscription multiplier.
// The parent owns adding oauthModels.js to the existing reviewed shard loader.
describe("reviewed exact OAuth and hosted-route model facts", () => {
  it("resolves Cursor's ordinary window and leaves unverified output unknown", () => {
    expect(getCapabilitiesForModel("cursor", "claude-sonnet-5-5")).toMatchObject({ contextWindow: 200000, maxInput: null, maxOutput: null, reasoning: true, tools: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false });
    expect(getCapabilitiesForModel("cu", "grok-4.7")).toMatchObject({ contextWindow: 256000, maxOutput: null });
  });

  it("keeps Kiro's 1M experimental window separate from its credit-based invoice", () => {
    expect(getCapabilitiesForModel("kr", "gpt-5.6-sol-thinking-agentic")).toMatchObject({ contextWindow: 1000000, maxInput: null, maxOutput: null });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100000 }, getPricingForModel("kiro", "gpt-5.6-sol"))).toBeNull();
  });

  it.each([
    ["codebuddy-cn", "kimi-k3-2", 1000000, 32000],
    ["codebuddy-intl", "kimi-k3", 1000000, 32000],
    ["codebuddy-intl", "deepseek-v4.1-flash", 300000, 128000],
    ["commandcode", "Qwen/Qwen3.8-Max-Prime", 1000000, 131072],
    ["commandcode", "Qwen/Qwen3.8-27B", 262144, 32768],
  ])("resolves %s/%s's own context and output independently", (provider, model, contextWindow, maxOutput) => {
    expect(getCapabilitiesForModel(provider, model)).toMatchObject({ contextWindow, maxOutput, audioInput: false, videoInput: false });
  });

  it("does not replace CommandCode's explicit unknown output with a direct-vendor limit", () => {
    expect(getCapabilitiesForModel("cmc", "deepseek/deepseek-v4.1-flash")).toMatchObject({ contextWindow: 1000000, maxOutput: null, vision: true });
  });

  it("keeps LLM7's case-sensitive DeepSeek route text-only and prices the provider's actual USD quote", () => {
    expect(getCapabilitiesForModel("llm7", "DeepSeek-V4.1-Flash")).toMatchObject({ contextWindow: 1000000, maxOutput: null, vision: false, reasoning: true, tools: true });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 }, getPricingForModel("llm7", "DeepSeek-V4.1-Flash"))).toBeCloseTo(0.366, 12);
  });

  it("does not inherit direct OpenAI context tiers for LLM7's GPT-6.1 Sol quote", () => {
    expect(getCapabilitiesForModel("llm7", "gpt-6.1-sol")).toMatchObject({ contextWindow: 1000000, maxInput: null, maxOutput: null });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 }, getPricingForModel("llm7", "gpt-6.1-sol"))).toBeCloseTo(0.48, 12);
  });

  it("bills Blackbox's fully qualified Gemini wire alias at its own rate", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100000 }, getPricingForModel("bb", "gemini-3.5-flash"))).toBeCloseTo(2.4, 12);
    expect(getCapabilitiesForModel("blackbox", "blackboxai/google/gemini-3.5-flash")).toMatchObject({ contextWindow: 1000000, maxOutput: null });
  });

  it.each([
    ["anthropic", "claude-opus-4.8", 5, 25, 1000000],
    ["anthropic", "claude-sonnet-4.6", 3, 15, 1000000],
    ["openai", "gpt-5.5", 5, 30, 1000000],
    ["openai", "gpt-5.4-pro", 30, 180, 1050000],
    ["openai", "gpt-5.4", 2.5, 15, 1050000],
    ["openai", "gpt-5.3-codex", 1.75, 14, 400000],
    ["openai", "gpt-5.4-nano", 0.2, 1.25, 400000],
    ["deepseek", "deepseek-v4-flash", 0.14, 0.28, 1000000],
    ["x-ai", "grok-4.3", 1.25, 2.5, 1000000],
  ])("uses Blackbox's own rates for %s/%s on both route and wire IDs", (vendor, model, input, output, contextWindow) => {
    const wireModel = `blackboxai/${vendor}/${model}`;
    const publicQuote = getPricingForModel("bb", model);
    expect(publicQuote).toEqual({ input, output, reasoning: output });
    expect(getPricingForModel("blackbox", wireModel)).toEqual(publicQuote);
    expect(getCapabilitiesForModel("blackbox", wireModel)).toMatchObject({ contextWindow, maxInput: null, maxOutput: null });
    expect(getReviewedModelMetadata("bb", model)).toMatchObject({
      billing: { currency: "USD", unit: "per_1000000_tokens", wireModelId: wireModel },
      limits: { authenticatedRouteVerified: false },
    });
  });

  it("keeps Blackbox Fable pricing unknown without a published provider quote", () => {
    expect(getPricingForModel("bb", "claude-fable-5")).toBeNull();
    expect(getPricingForModel("blackbox", "blackboxai/anthropic/claude-fable-5")).toBeNull();
  });

  it("does not fabricate missing Blackbox cache-read or Kilo cache-write prices", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 }, getPricingForModel("blackbox", "gemini-3.5-flash"))).toBeNull();
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cached_tokens: 200, completion_tokens: 100 }, getPricingForModel("bb", "gpt-5.4"))).toBeNull();
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cache_creation_input_tokens: 200000, completion_tokens: 100000 }, getPricingForModel("kilocode", "deepseek/deepseek-v4.1-flash-1017"))).toBeNull();
  });

  it("uses BazaarLink's public USD text quote as an estimate for its exact model ID", () => {
    const model = "deepseek-v4.1-flash-1017";
    const pricing = getPricingForModel("bzl", model);
    expect(pricing).toEqual({ input: 0.21225, output: 0.84825, cached: 0.021, reasoning: 0.84825 });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 }, pricing)).toBeCloseTo(0.258825, 12);
    expect(getReviewedModelMetadata("bzl", model)).toMatchObject({
      limits: { authenticatedRouteVerified: false },
      billing: { kind: "public-catalog-estimate", currency: "USD", invoiceVerified: false },
    });
    expect(getPricingForModel("bzl", "kimi-k2.6")).toBeNull();
  });

  it.each([
    ["minimax-m3", 524288, 0.3, 0.6, 2.4, 0.12],
    ["gemini-3.1-pro-preview", 200000, 1.8, 3.6, 16.2, 0.36],
    ["qwen3.6-plus", 256000, 0.26, 1.04, 3.12, 0.0224],
    ["grok-4.3", 200000, 1.125, 2.25, 4.5, 0.36],
    ["gpt-6.1-sol", 272000, 2, 4, 15, 0.4],
    ["gpt-5.4", 272000, 2.25, 4.5, 20.25, 0.45],
    ["gpt-5.5", 272000, 5, 10, 45, 1],
  ])("uses BazaarLink's %s price table only above %i input tokens", (model, threshold, baseInput, input, output, cached) => {
    const quote = getPricingForModel("bazaarlink", model);
    expect(resolveEffectivePricing(quote, threshold)?.input).toBe(baseInput);
    expect(resolveEffectivePricing(quote, threshold + 1)).toMatchObject({ input, output, cached, reasoning: output });
  });

  it("applies BazaarLink's next tariff to the entire usage and keeps writes without a verified lifetime unpriced", () => {
    const pricing = getPricingForModel("bzl", "gpt-6.1-sol");
    const usage = { prompt_tokens: 272000, cached_tokens: 20000, completion_tokens: 1000, reasoning_tokens: 300 };
    expect(calculateCostFromTokens(usage, pricing)).toBeCloseTo(0.518, 12);
    expect(calculateCostFromTokens({ ...usage, prompt_tokens: 272001 }, pricing)).toBeCloseTo(1.031004, 12);
    expect(calculateCostFromTokens({ ...usage, cache_write_tokens: 2000 }, pricing)).toBeNull();
    expect(getReviewedModelMetadata("bzl", "gpt-6.1-sol")?.billing).toMatchObject({
      cacheWriteReference: { rate: 2.5, lifetime: null },
      tierCacheWriteReference: { rate: 5, lifetime: null, threshold: 272000 },
    });
  });

  it("keeps BazaarLink's published zero-priced text router distinct from missing quotes", () => {
    const pricing = getPricingForModel("bzl", "auto:free");
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100000 }, pricing)).toBe(0);
    expect(getReviewedModelMetadata("bzl", "auto:free")?.billing).toMatchObject({ kind: "verified-zero-token-quote" });
  });

  it.each([
    ["bb", "gpt-5.4", "2026-11-17T22:58:44Z", 2.5, 15],
    ["blackbox", "blackboxai/openai/gpt-5.4", "2026-11-17T22:58:44Z", 2.5, 15],
    ["bzl", "gpt-6.1-sol", "2026-11-17T22:56:57.199Z", 2, 10],
    ["bazaarlink", "auto:free", "2026-11-17T22:56:57.199Z", 0, 0],
  ])("uses the observed pricing boundary for %s/%s in live and historical estimates", async (provider, model, effectiveFrom, input, output) => {
    const { createHistoricalPricingResolver } = await import("../../src/lib/db/repos/pricingRepo.js");
    const historicalQuote = await createHistoricalPricingResolver();
    const startTime = Date.parse(effectiveFrom);
    const before = new Date(startTime - 1).toISOString();
    const after = new Date(startTime + 1).toISOString();
    expect(getPricingForModel(provider, model, { timestamp: before })).toMatchObject({ input: null, output: null });
    expect(historicalQuote(provider, model, before)).toBeNull();
    for (const timestamp of [effectiveFrom, after]) {
      expect(getPricingForModel(provider, model, { timestamp })).toMatchObject({ input, output });
      expect(historicalQuote(provider, model, timestamp)).toMatchObject({
        input, output, provenance: { kind: "published-provider-tariff", effectiveFrom },
      });
    }
  });

  it("preserves Kilo's explicit zero tariff instead of converting catalog -1/Auto sentinels to free", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100000 }, getPricingForModel("kc", "minimax/minimax-m3.1-flash:free"))).toBe(0);
  });

  it("uses Cline's native free-feed namespace without granting a Cline Pass route", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100000 }, getPricingForModel("cl", "cline-free/minimax-m3.1-flash"))).toBe(0);
    expect(getReviewedModelMetadata("cline", "cline-free/minimax-m3.1-flash")?.sources).toContain("https://api.cline.bot/api/v1/ai/cline/recommended-models");
  });

  it("records public evidence without claiming authenticated model access", () => {
    expect(getReviewedModelMetadata("codebuddy-cn", "kimi-k3-2")?.limits).toMatchObject({ authenticatedRouteVerified: false, scope: "publisher-bundled-fallback", catalogAsOf: "2026-10-21" });
    expect(getReviewedModelMetadata("llm7", "DeepSeek-V4.1-Flash")?.limits).toMatchObject({ authenticatedRouteVerified: false, scope: "public-provider-catalog", catalogAsOf: "2026-10-21" });
  });
});
