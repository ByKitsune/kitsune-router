import { describe, expect, it } from "vitest";
import { calculateCostBreakdown, calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";

describe("Gemini 4 Argon reference billing", () => {
  it("bills cached input separately from output-inclusive reasoning", () => {
    // https://ai.google.dev/gemini-api/docs/pricing
    const tokens = { prompt_tokens: 100000, cached_tokens: 50000, completion_tokens: 10000, reasoning_tokens: 6000 };
    const pricing = getPricingForModel("gemini", "gemini-4-argon");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.205, 12);
    expect(calculateCostBreakdown(tokens, pricing)).toMatchObject({ cachedCost: 0.005, outputCost: 0.04, reasoningCost: 0.06 });
  });
});
