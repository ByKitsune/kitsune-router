import { describe, expect, it } from "vitest";
import {
  OPENAI_STANDARD_TOKEN_PRICING,
  OPENAI_PROCESSING_SPEED_PRICING,
  OPENAI_TERRA_TOKEN_PRICING_SOURCE,
  OPENAI_TOKEN_PRICING_SOURCE,
} from "../../open-sse/config/processingSpeedPricing.js";
import { calculateCostBreakdown, getPricingForModel, resolveEffectivePricing } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { getServiceTierAvailability, getServiceTierOptions, resolveServiceTier } from "../../open-sse/providers/serviceTiers.js";

const model = "gpt-6.1-terra";
// Literal USD/1M-token values from OpenAI's independently captured pricing.md:
// sha256 93d302a9b7a384877533bc3ab5bb48eebf4b56bd6add0f194095054b2a13f952.
const rows = [
  ["default", { input: 1, cached: 0.05, output: 5, cache_write_30m: 1.25, cache_write_12h: 2.5 },
    { input: 2, cached: 0.1, output: 7.5, cache_write_30m: 2.5, cache_write_12h: 5 }, 0.267, 0.529002],
  ["fast", { input: 2, cached: 0.1, output: 10, cache_write_30m: 2.5, cache_write_12h: 5 },
    { input: 4, cached: 0.2, output: 15, cache_write_30m: 5, cache_write_12h: 10 }, 0.534, 1.058004],
  ["flex", { input: 0.5, cached: 0.025, output: 2.5, cache_write_30m: 0.625, cache_write_12h: 1.25 },
    { input: 1, cached: 0.05, output: 3.75, cache_write_30m: 1.25, cache_write_12h: 2.5 }, 0.1335, 0.264501],
];
const usage = {
  cached_tokens: 50000, completion_tokens: 2000, reasoning_tokens: 500,
  cache_write_tokens: 30000, cache_write_30m_tokens: 10000, cache_write_12h_tokens: 20000,
};

describe("GPT-6.1 Terra public API speed tariffs", () => {
  it("pins its newer price table separately and records, without applying, the regional uplift", () => {
    expect(OPENAI_TOKEN_PRICING_SOURCE).toMatchObject({ capturedAtUtc: "2026-10-21T10:47:37.142421Z", sha256: "129d6019819379a6f30edc0811d4631ddb085dcd4b3b1d0012a945cd1af1bfbf" });
    expect(OPENAI_TERRA_TOKEN_PRICING_SOURCE).toMatchObject({
      url: "https://developers.openai.com/api/docs/pricing.md", capturedAtUtc: "2026-10-28T18:02:28Z",
      sha256: "93d302a9b7a384877533bc3ab5bb48eebf4b56bd6add0f194095054b2a13f952", currency: "USD", unit: "1M tokens",
      regionalProcessing: { uplift: 0.1, source: "https://developers.openai.com/api/docs/guides/your-data.md",
        capturedAtUtc: "2026-10-28T18:12:00Z", sha256: "d527075387065bc57754b177f356d86dc65dcf7a7434d67ea4e7fdbeafbc82f3" },
    });
    expect(getReviewedModelMetadata("openai", model).provenance.primaryPricing).toMatchObject({
      url: OPENAI_TERRA_TOKEN_PRICING_SOURCE.url, capturedAtUtc: OPENAI_TERRA_TOKEN_PRICING_SOURCE.capturedAtUtc,
      sha256: OPENAI_TERRA_TOKEN_PRICING_SOURCE.sha256,
    });
  });

  it.each(rows)("uses literal %s quotes and charges the entire request at the strict threshold", (tier, short, long, shortTotal, longTotal) => {
    const source = tier === "default" ? OPENAI_STANDARD_TOKEN_PRICING[model] : OPENAI_PROCESSING_SPEED_PRICING[model][tier];
    expect(resolveEffectivePricing(source, 272000)).toMatchObject({ ...short, reasoning: short.output, cache_creation: null, cache_creation_1h: null });
    expect(resolveEffectivePricing(source, 272001)).toMatchObject({ ...long, reasoning: long.output, cache_creation: null, cache_creation_1h: null });
    const quote = getPricingForModel("openai", model);
    const small = calculateCostBreakdown({ ...usage, prompt_tokens: 272000, actualServiceTier: tier }, quote);
    const large = calculateCostBreakdown({ ...usage, prompt_tokens: 272001, actualServiceTier: tier }, quote);
    expect(small.totalCost).toBeCloseTo(shortTotal, 12);
    expect(large.totalCost).toBeCloseTo(longTotal, 12);
    // Reasoning tokens are already included in completion_tokens, not a second charge.
    expect(small.outputCost + small.reasoningCost).toBeCloseTo(short.output * 2000 / 1e6, 12);
  });

  it("uses the Fast quote for the priority wire alias and does not invent a cache lifetime", () => {
    const quote = getPricingForModel("openai", model);
    expect(calculateCostBreakdown({ ...usage, prompt_tokens: 272001, actualServiceTier: "priority" }, quote).totalCost).toBeCloseTo(1.058004, 12);
    expect(calculateCostBreakdown({ prompt_tokens: 1000, cache_write_tokens: 1000, actualServiceTier: "fast" }, quote).totalCost).toBeNull();
    expect(calculateCostBreakdown({ prompt_tokens: 1000, cache_creation_input_tokens: 1000, actualServiceTier: "flex" }, quote).totalCost).toBeNull();
  });

  it("keeps unsupported and unconfirmed service tiers unpriced", () => {
    const quote = getPricingForModel("openai", model);
    expect(quote.service_tiers).not.toHaveProperty("ultrafast");
    expect(quote.service_tiers).not.toHaveProperty("scale");
    for (const actualServiceTier of ["ultrafast", "scale", "auto", "unknown-upstream-tier"]) {
      expect(calculateCostBreakdown({ prompt_tokens: 1000, completion_tokens: 100, actualServiceTier }, quote).totalCost).toBeNull();
    }
    expect(calculateCostBreakdown({ prompt_tokens: 1000, serviceTierCostStatus: "unconfirmed" }, quote).totalCost).toBeNull();
  });

  it("accepts API Fast and Flex while keeping Terra Ultrafast unsupported", () => {
    expect(getServiceTierAvailability("openai", model, "fast").status).toBe("supported");
    expect(getServiceTierAvailability("openai", model, "fast", { providerSpecificData: { dataResidency: "eu" } }).status).toBe("supported");
    expect(getServiceTierOptions("openai", model).map(option => option.value)).toEqual(["auto", "default", "fast"]);
    expect(resolveServiceTier("openai", model, "priority")).toBe("priority");
    expect(resolveServiceTier("openai", model, "fast")).toBe("fast");
    expect(resolveServiceTier("openai", model, "flex")).toBe("flex");
    expect(() => resolveServiceTier("openai", model, "ultrafast")).toThrow(/ultrafast/i);
  });

  it("does not infer Codex entitlement or reuse API prices for a subscription", () => {
    expect(getServiceTierAvailability("codex", model, "fast").status).toBe("unknown");
    expect(getServiceTierAvailability("codex", model, "ultrafast").status).toBe("unknown");
    const account = { providerSpecificData: { models: [{ slug: model, service_tiers: [{ id: "priority" }] }] } };
    expect(getServiceTierAvailability("codex", model, "fast", account).status).toBe("supported");
    expect(getServiceTierAvailability("codex", model, "ultrafast", account).status).toBe("unsupported");
    expect(() => resolveServiceTier("codex", model, "flex", {})).toThrow(/not supported/i);
    const quote = getPricingForModel("codex", model);
    expect(calculateCostBreakdown({ prompt_tokens: 1000, completion_tokens: 100 }, quote).totalCost).toBeNull();
    expect(calculateCostBreakdown({ prompt_tokens: 1000, completion_tokens: 100, actualServiceTier: "priority" }, quote).totalCost).toBeNull();
  });
});
