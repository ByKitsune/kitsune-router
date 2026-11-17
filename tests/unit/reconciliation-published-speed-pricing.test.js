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

describe("GPT-6.2 public OpenAI rates", () => {
  it.each([
    ["gpt-6.2-astra", 8, 16, 40, 60, 20],
    ["gpt-6.2-sol", 2, 4, 10, 15, 5],
  ])("prices %s at the exact long-context boundary and honors batch quotes", (model, shortInput, longInput, shortOutput, longOutput, batchOutput) => {
    const quote = getPricingForModel("openai", model, { timestamp: "2026-11-18T00:00:00Z" });
    const standard = prompt_tokens => calculateCostBreakdown({ prompt_tokens, completion_tokens: 10000, actualServiceTier: "default" }, quote);
    expect(standard(272000)).toMatchObject({ inputCost: shortInput * 0.272, outputCost: shortOutput * 0.01 });
    expect(standard(272001)).toMatchObject({ inputCost: longInput * 272001 / 1000000, outputCost: longOutput * 0.01 });
    expect(calculateCostBreakdown({ prompt_tokens: 100000, completion_tokens: 10000, actualServiceTier: "batch" }, quote).outputCost)
      .toBe(batchOutput * 0.01);
    expect(calculateCostBreakdown({ prompt_tokens: 100000, actualServiceTier: "flex" }, quote).totalCost).toBeNull();
  });

  it.each([["gpt-6.2-astra", 180, 360], ["gpt-6.2-sol", 45, 90]])("changes %s Ultrafast at midnight Pacific", (model, promotionalOutput, listOutput) => {
    const usage = { prompt_tokens: 272001, completion_tokens: 10000, actualServiceTier: "ultrafast" };
    const price = timestamp => getPricingForModel("openai", model, { timestamp });
    expect(calculateCostBreakdown(usage, price("2027-03-01T07:59:59.999Z")).outputCost).toBe(promotionalOutput * 0.01);
    expect(calculateCostBreakdown(usage, price("2027-03-01T08:00:00Z")).outputCost).toBe(listOutput * 0.01);
    expect(calculateCostBreakdown(usage, price("2027-02-29T00:00:00Z")).totalCost).toBeNull();
    expect(calculateCostBreakdown(usage, getPricingForModel("cx", model, { timestamp: "2027-03-01T08:00:00Z" })).totalCost).toBeNull();
  });
});
