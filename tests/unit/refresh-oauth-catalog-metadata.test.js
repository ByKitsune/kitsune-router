import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
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

  it("does not fabricate missing Blackbox cache-read or Kilo cache-write prices", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 }, getPricingForModel("blackbox", "gemini-3.5-flash"))).toBeNull();
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cache_creation_input_tokens: 200000, completion_tokens: 100000 }, getPricingForModel("kilocode", "deepseek/deepseek-v4.1-flash-1017"))).toBeNull();
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
