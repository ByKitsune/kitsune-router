import { describe, expect, it } from "vitest";
import { calculateCostBreakdown, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { prepareServiceTierRequest } from "../../open-sse/providers/serviceTiers.js";

const usage = { prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 10000, reasoning_tokens: 6000 };
describe("all published native OpenAI processing-speed quotes reach costing", () => {
  it.each([
    ["gpt-6-sol", 0.528], ["gpt-5.6-sol", 1.056], ["gpt-5.6-terra", 0.568], ["gpt-5.6-luna", 0.0568],
    ["gpt-5.5", 1.775], ["gpt-5.4", 0.71], ["gpt-5.4-mini", 0.213], ["gpt-5.2", 0.567],
    ["gpt-5.1", 0.405], ["gpt-5", 0.405], ["gpt-5-mini", 0.0729], ["gpt-4.1", 0.4375],
    ["gpt-4.1-mini", 0.0875], ["gpt-4.1-nano", 0.025], ["gpt-4o", 0.5525], ["gpt-4o-mini", 0.0325],
    ["o3", 0.4375], ["o4-mini", 0.25], ["gpt-5.3-codex", 0.567],
  ])("bills delivered %s Fast with its literal tariff", (model, expected) => {
    const price = getPricingForModel("openai", model);
    expect(calculateCostBreakdown({ ...usage, actualServiceTier: "priority", serviceTierCostStatus: "unpriced" }, price).totalCost).toBeCloseTo(expected, 12);
  });

  it("does not extrapolate an unpublished Fast long-context quote from short context", () => {
    const price = getPricingForModel("openai", "gpt-5.5");
    expect(calculateCostBreakdown({ prompt_tokens: 272001, completion_tokens: 1, actualServiceTier: "fast" }, price).totalCost).toBeNull();
  });

  it("retains literal rounded Flex cached prices rather than inventing a 50% multiplier", () => {
    const price = getPricingForModel("openai", "gpt-5.4");
    expect(calculateCostBreakdown({ prompt_tokens: 100000, cached_tokens: 100000, actualServiceTier: "flex" }, price).totalCost).toBeCloseTo(0.013, 12);
  });

  it("exposes a published model's supported Fast request independently from its output cap", () => {
    const body = { model: "gpt-5.3-codex", service_tier: "fast", max_output_tokens: 37 };
    const result = prepareServiceTierRequest("openai", "gpt-5.3-codex", body);
    expect(result?.error).toBeUndefined();
    expect(body).toMatchObject({ service_tier: "fast", max_output_tokens: 37 });
  });
});
