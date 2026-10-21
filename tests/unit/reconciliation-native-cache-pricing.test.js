import { describe, expect, it } from "vitest";
import { calculateCostBreakdown, getPricingForModel } from "../../open-sse/providers/pricing.js";

const tokens = {
  prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 1000,
  cache_write_tokens: 30000, cache_write_30m_tokens: 10000, cache_write_12h_tokens: 20000,
};

describe("native OpenAI cache-write lifetime tariffs", () => {
  it("bills disjoint 30m and 12h writes once rather than as ordinary input or Anthropic writes", () => {
    const cost = calculateCostBreakdown(tokens, getPricingForModel("openai", "gpt-6.1-sol"));
    expect(cost.inputCost).toBeCloseTo(0.1, 12);
    expect(cost.cachedCost).toBeCloseTo(0.002, 12);
    expect(cost.cacheCreationCost).toBeCloseTo(0.125, 12);
    expect(cost.totalCost).toBeCloseTo(0.237, 12);
  });

  it("uses the confirmed premium tier's own write tariffs", () => {
    const cost = calculateCostBreakdown({ ...tokens, actualServiceTier: "fast", serviceTierCostStatus: "unpriced" }, getPricingForModel("openai", "gpt-6.1-sol"));
    expect(cost.inputCost).toBeCloseTo(0.2, 12);
    expect(cost.cacheCreationCost).toBeCloseTo(0.25, 12);
    expect(cost.totalCost).toBeCloseTo(0.474, 12);
  });

  it("does not guess the lifetime of an aggregate-only native write count", () => {
    const cost = calculateCostBreakdown({ prompt_tokens: 30000, cache_write_tokens: 30000 }, getPricingForModel("openai", "gpt-6.1-sol"));
    expect(cost.inputCost).toBe(0);
    expect(cost.cacheCreationCost).toBeNull();
    expect(cost.totalCost).toBeNull();
  });

  it("does not convert 12h native writes into an unrelated provider's one-hour tariff", () => {
    const quote = { input: 2, output: 10, cache_creation: 2.5, cache_creation_1h: 4 };
    const cost = calculateCostBreakdown({ prompt_tokens: 1000, cache_write_tokens: 1000, cache_write_12h_tokens: 1000 }, quote);
    expect(cost.cacheCreationCost).toBeNull();
    expect(cost.totalCost).toBeNull();
  });

  it("does not undercount a native split whose aggregate contradicts its lifetime counters", () => {
    const cost = calculateCostBreakdown({ prompt_tokens: 1000, cache_write_tokens: 100, cache_write_30m_tokens: 200 }, getPricingForModel("openai", "gpt-6.1-sol"));
    expect(cost.cacheCreationCost).toBeNull();
    expect(cost.totalCost).toBeNull();
  });

  it("does not hide a contradictory Anthropic TTL subset beside valid native write counters", async () => {
    const { canonicalizeUsage, normalizeUsage } = await import("../../open-sse/utils/usageTracking.js");
    const usage = canonicalizeUsage(normalizeUsage({
      prompt_tokens: 1000, cached_tokens: 100, completion_tokens: 0,
      cache_creation_input_tokens: 0, cache_creation_5m_tokens: 500,
      cache_write_tokens: 300, cache_write_30m_tokens: 100, cache_write_12h_tokens: 200,
    }));
    const cost = calculateCostBreakdown({ ...usage, actualServiceTier: "fast" }, getPricingForModel("openai", "gpt-6.1-sol"));
    expect(cost.cacheCreationCost).toBeNull();
    expect(cost.totalCost).toBeNull();
  });
});
