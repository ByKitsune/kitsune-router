import { describe, expect, it } from "vitest";
import { calculateCostBreakdown, getPricingForModel } from "../../open-sse/providers/pricing.js";

describe("dated public OpenAI processing-speed tariffs", () => {
  // Literal USD/1M-token table from OpenAI pricing.md, captured 2026-10-21.
  it.each([
    ["gpt-6-astra", "fast", 20, 2, 100],
    ["gpt-6-astra", "ultrafast", 60, 6, 300],
    ["gpt-6.1-sol", "fast", 4, 0.2, 20],
    ["gpt-6.1-sol", "ultrafast", 12, 0.6, 60],
    ["gpt-6-luna", "fast", 0.2, 0.02, 1],
  ])("resolves %s %s without guessing a blanket multiplier", (model, actualServiceTier, input, cached, output) => {
    const quote = getPricingForModel("openai", model);
    const cost = calculateCostBreakdown({ prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 10000, actualServiceTier, serviceTierCostStatus: "unpriced" }, quote);
    expect(cost.inputCost).toBeCloseTo(input * 0.08, 12);
    expect(cost.cachedCost).toBeCloseTo(cached * 0.02, 12);
    expect(cost.outputCost).toBeCloseTo(output * 0.01, 12);
  });

  it("does not reuse a public API premium quote for a Codex subscription or arbitrary reseller", () => {
    for (const provider of ["codex", "unverified-reseller"]) {
      expect(calculateCostBreakdown({ prompt_tokens: 1000, completion_tokens: 100, actualServiceTier: "priority", serviceTierCostStatus: "unpriced" }, getPricingForModel(provider, "gpt-6.1-sol")).totalCost).toBeNull();
    }
  });

  it("keeps Luna Ultrafast and contract Scale unpriced", () => {
    const quote = getPricingForModel("openai", "gpt-6-luna");
    for (const actualServiceTier of ["ultrafast", "scale"]) {
      expect(calculateCostBreakdown({ prompt_tokens: 1000, completion_tokens: 100, actualServiceTier }, quote).totalCost).toBeNull();
    }
  });
});
