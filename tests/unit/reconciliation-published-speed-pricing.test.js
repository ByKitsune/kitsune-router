import { describe, expect, it } from "vitest";
import { calculateCostBreakdown, getDefaultPricing, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getOpenAIPublishedTokenPricing } from "../../open-sse/config/processingSpeedPricing.js";
import { getServiceTierOptions, resolveServiceTier } from "../../open-sse/providers/serviceTiers.js";

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

  it.each(["gpt-5.5", "gpt-5.4"])("leaves the published long-context Fast dash unpriced for %s", model => {
    const quote = getOpenAIPublishedTokenPricing(model);
    expect(quote.service_tiers.fast.tier).toMatchObject({ threshold: 272000, input: null, output: null, cached: null });
    expect(calculateCostBreakdown({ prompt_tokens: 272001, completion_tokens: 1000, actualServiceTier: "priority" }, quote).totalCost).toBeNull();
    expect(calculateCostBreakdown({ prompt_tokens: 273000, completion_tokens: 1000, actualServiceTier: "default" }, quote).totalCost).not.toBeNull();
  });

  it("honors the documented native gpt-5.6 alias without borrowing it across providers", () => {
    const options = { timestamp: "2026-11-18T00:00:00Z" };
    expect(getPricingForModel("openai", "gpt-5.6", options)).toEqual(getPricingForModel("openai", "gpt-5.6-sol", options));
    expect(getPricingForModel("unverified-reseller", "gpt-5.6", options)).toBeNull();
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
    const options = { timestamp: "2027-03-01T08:00:00Z" };
    expect(getOpenAIPublishedTokenPricing(model, options)).toEqual(price(options.timestamp));
    expect(getDefaultPricing(options).openai[model]).toEqual(price(options.timestamp));
  });
});

describe("official OpenAI text Batch tariffs", () => {
  it("prices Astra Batch cache reads, writes and output at the delivered context tier", () => {
    const quote = getPricingForModel("openai", "gpt-6-astra");
    const usage = {
      cached_tokens: 10000, cache_write_tokens: 3000, cache_write_30m_tokens: 1000, cache_write_12h_tokens: 2000,
      completion_tokens: 1000, reasoning_tokens: 100, actualServiceTier: "batch",
    };
    const short = calculateCostBreakdown({ ...usage, prompt_tokens: 272000 }, quote);
    expect(short).toMatchObject({ inputCost: 1.295, cachedCost: 0.005, cacheCreationCost: 0.03125 });
    expect(short.outputCost + short.reasoningCost).toBeCloseTo(0.025, 12);
    const long = calculateCostBreakdown({ ...usage, prompt_tokens: 272001 }, quote);
    expect(long).toMatchObject({ inputCost: 2.59001, cachedCost: 0.01, cacheCreationCost: 0.0625 });
    expect(long.outputCost + long.reasoningCost).toBeCloseTo(0.0375, 12);
  });

  it("uses literal Batch cells and retains published gaps", () => {
    const gpt54 = getPricingForModel("openai", "gpt-5.4");
    expect(gpt54.service_tiers.batch.cached).toBe(0.13);
    const usage = { prompt_tokens: 272001, completion_tokens: 1000, actualServiceTier: "batch" };
    expect(calculateCostBreakdown(usage, getPricingForModel("openai", "gpt-5.5-pro")).totalCost).toBeNull();
    const gpt41 = getPricingForModel("openai", "gpt-4.1");
    expect(calculateCostBreakdown(usage, gpt41).totalCost).toBeCloseTo(0.276001, 12);
    expect(calculateCostBreakdown({ ...usage, cached_tokens: 100 }, gpt41).totalCost).toBeNull();
  });

  it.each([["gpt-5.2-pro", 10.5, 84], ["gpt-5-pro", 7.5, 60], ["o3-pro", 10, 40]])("indexes the standalone %s Batch quote", (model, input, output) => {
    expect(getDefaultPricing().openai[model].service_tiers).toMatchObject({ batch: { input, output, cached: null } });
  });

  it("keeps Batch quote coverage separate from online gateway speed support", () => {
    const model = "gpt-6-astra";
    expect(getPricingForModel("openai", model).service_tiers.batch).toBeDefined();
    expect(getServiceTierOptions("openai", model).map(option => option.value)).not.toContain("batch");
    expect(() => resolveServiceTier("openai", model, "batch"))
      .toThrow(expect.objectContaining({ code: "invalid_service_tier", param: "service_tier" }));
    expect(getPricingForModel("codex", model)?.service_tiers?.batch).toBeUndefined();
  });
});
