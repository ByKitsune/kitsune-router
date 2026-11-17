import { describe, it, expect } from "vitest";
import { MODEL_PRICING, calculateCostBreakdown, getPricingForModel } from "../../open-sse/providers/pricing.js";
import openaiRegistry from "../../open-sse/providers/registry/openai.js";
import { canonicalizeUsage, extractUsage } from "../../open-sse/utils/usageTracking.js";

// Official OpenAI pricing (developers.openai.com/api/docs/pricing, snapshot 2026-09-23).
describe("OpenAI current pricing", () => {
  it("prices gpt-5.4 family at 2.50/15, mini 0.75/4.50, nano 0.20/1.25", () => {
    expect(MODEL_PRICING["gpt-5.4"]).toMatchObject({ input: 2.5, output: 15 });
    expect(MODEL_PRICING["gpt-5.4-mini"]).toMatchObject({ input: 0.75, output: 4.5 });
    expect(MODEL_PRICING["gpt-5.4-nano"]).toMatchObject({ input: 0.2, output: 1.25 });
  });

  it("prices gpt-5.5 at 5/30 and gpt-5.6-sol at promo 4/20", () => {
    expect(getPricingForModel("openai", "gpt-5.5")).toMatchObject({ input: 5, output: 30 });
    expect(getPricingForModel("openai", "gpt-5.6-sol")).toMatchObject({ input: 4, output: 20 });
    expect(getPricingForModel("openai", "gpt-5.6-luna")).toMatchObject({ input: 0.2, output: 1.2 });
    expect(getPricingForModel("openai", "gpt-5.6-terra")).toMatchObject({ input: 2, output: 12 });
  });

  it("uses 10% cache reads for GPT-5+ (not 50%)", () => {
    expect(MODEL_PRICING["gpt-5"].cached).toBe(0.125);
    expect(MODEL_PRICING["gpt-5-mini"].cached).toBe(0.025);
    expect(MODEL_PRICING["gpt-5.1"].cached).toBe(0.125);
  });

  it("prices o3 at 2/8 and o3-mini/o4-mini at 1.10/4.40", () => {
    expect(getPricingForModel("openai", "o3")).toMatchObject({ input: 2, output: 8 });
    expect(getPricingForModel("openai", "o3-mini")).toMatchObject({ input: 1.1, output: 4.4 });
    expect(getPricingForModel("openai", "o4-mini")).toMatchObject({ input: 1.1, output: 4.4 });
  });

  it("prices gpt-4.1 family at 2/8, mini 0.40/1.60, nano 0.10/0.40", () => {
    expect(MODEL_PRICING["gpt-4.1"]).toMatchObject({ input: 2, output: 8 });
    expect(MODEL_PRICING["gpt-4.1-mini"]).toMatchObject({ input: 0.4, output: 1.6 });
    expect(MODEL_PRICING["gpt-4.1-nano"]).toMatchObject({ input: 0.1, output: 0.4 });
  });

  it("dropped retired codex IDs from canonical pricing", () => {
    expect(MODEL_PRICING["gpt-5-codex"]).toBeUndefined();
    expect(MODEL_PRICING["gpt-5.1-codex"]).toBeUndefined();
    expect(MODEL_PRICING["gpt-5.2-codex"]).toBeUndefined();
  });

  it.each([
    ["gpt-6.2-astra", 0.48, 0.12, 0.68, 1.28],
    ["gpt-6.2-sol", 0.12, 0.03, 0.17, 0.32],
  ])("uses the same Standard token tariff for actual %s pro-mode reasoning usage", (model, input, output, reasoning, total) => {
    const pricing = getPricingForModel("openai", model);
    const cost = (mode, reasoningTokens) => calculateCostBreakdown(canonicalizeUsage(extractUsage({
      model, reasoning: { mode, effort: "medium" },
      usage: { input_tokens: 60000, output_tokens: 3000 + reasoningTokens, output_tokens_details: { reasoning_tokens: reasoningTokens } },
    })), pricing);
    const pro = cost("pro", 17000);
    expect(pro).toEqual(cost("standard", 17000));
    expect(pro).toMatchObject({ inputCost: input, outputCost: output, reasoningCost: reasoning });
    expect(pro.totalCost).toBeCloseTo(total, 12);
    expect(cost("standard", 0).totalCost).toBeCloseTo(input + output, 12);
    expect(getPricingForModel("openai", `${model}-pro`)).toBeNull();
  });
});

describe("OpenAI registry lineup", () => {
  const ids = openaiRegistry.models.map((m) => m.id);
  it("lists current flagships incl. GPT-6 family", () => {
    for (const id of ["gpt-5.5", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "gpt-transcribe", "gpt-image-2", "o1-pro"]) {
      expect(ids).toContain(id);
    }
  });
  it("removed retired DALL-E models", () => {
    expect(ids).not.toContain("dall-e-2");
    expect(ids).not.toContain("dall-e-3");
  });
});
