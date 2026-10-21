import { describe, expect, it } from "vitest";
import { calculateCostBreakdown, calculateCostFromTokens, getDefaultPricing, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

describe("native media pricing cannot regain literal chat tariffs", () => {
  it.each([
    ["openai", "gpt-4o-transcribe"], ["openai", "gpt-4o-mini-transcribe"],
    ["xai", "grok-imagine-video"], ["xai", "grok-imagine-video-1.5"],
    ["tokenrouter", "kling-3.0-turbo"], ["recraft", "recraftv4_1"],
    ["fish-audio", "s2.1-pro-free"],
  ])("resolves %s/%s to a complete unknown token quote, never a minute/byte tariff", (provider, model) => {
    const pricing = getPricingForModel(provider, model);
    expect(pricing).toMatchObject({
      input: null, output: null, cached: null, reasoning: null,
      cache_creation: null, cache_creation_1h: null, cache_write_30m: null, cache_write_12h: null,
    });
    expect(calculateCostFromTokens({ completion_tokens: 1 }, pricing)).toBeNull();
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1000 }, pricing)).toBeNull();
    expect(calculateCostFromTokens({}, pricing)).toBe(0);
    expect(calculateCostFromTokens({ prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, cache_write_30m_tokens: 0, cache_write_12h_tokens: 0 }, pricing)).toBe(0);
  });

  it.each(["cache_write_30m_tokens", "cache_write_12h_tokens"])("does not mark used unsupported native %s as a free media token metric", field => {
    const pricing = getPricingForModel("openai", "gpt-4o-mini-tts");
    expect(pricing).toMatchObject({ input: 0.6, output: null, cached: null, cache_write_30m: null, cache_write_12h: null });
    const cost = calculateCostBreakdown({ prompt_tokens: 1000, cache_write_tokens: 1000, [field]: 1000 }, pricing);
    expect(cost).toMatchObject({ inputCost: 0, cacheCreationCost: null, outputCost: 0, totalCost: null });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, pricing)).toBeCloseTo(0.6, 12);
    expect(calculateCostFromTokens({ completion_tokens: 1 }, pricing)).toBeNull();
  });

  it("publishes an explicit unknown Kling token quote instead of the stale literal 2.1/2.1", () => {
    const pricing = getDefaultPricing().tokenrouter["kling-3.0-turbo"];
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1000000 }, pricing)).toBeNull();
    expect(getReviewedModelMetadata("tokenrouter", "kling-3.0-turbo")).toMatchObject({ billing: {
      currency: "USD", unit: "output_second_by_resolution", rates: { "720p": 0.112, "1080p": 0.14 }, tokenPricingSupported: false,
    } });
  });
});
