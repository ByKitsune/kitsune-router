import { describe, expect, it } from "vitest";
import { calculateCostBreakdown } from "../../open-sse/providers/pricing.js";
import { getServiceTierAccounting } from "../../open-sse/providers/serviceTiers.js";

const quote = {
  input: 2, output: 10, cached: 0.1,
  service_tiers: {
    fast: { input: 4, output: 20, cached: 0.2, tier: { threshold: 200000, input: 8, output: 30, cached: 0.4 } },
    ultrafast: { input: 12, output: 60, cached: 0.6 },
  },
};
const usage = { prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 10000, reasoning_tokens: 6000 };

describe("delivered service-tier estimates use explicit tier tariffs", () => {
  it("prices confirmed Fast without substituting Standard rates", () => {
    const breakdown = calculateCostBreakdown({ ...usage, actualServiceTier: "priority", serviceTierCostStatus: "unpriced" }, quote);
    expect(breakdown.inputCost).toBeCloseTo(0.32, 12);
    expect(breakdown.cachedCost).toBeCloseTo(0.004, 12);
    expect(breakdown.outputCost).toBeCloseTo(0.08, 12);
    expect(breakdown.reasoningCost).toBeCloseTo(0.12, 12);
    expect(breakdown.totalCost).toBeCloseTo(0.524, 12);
  });

  it("applies the delivered tier's own long-context boundary", () => {
    const cost = calculateCostBreakdown({ ...usage, prompt_tokens: 300000, actualServiceTier: "fast", serviceTierCostStatus: "unpriced" }, quote);
    expect(cost.inputCost).toBeCloseTo(2.24, 12);
    expect(cost.cachedCost).toBeCloseTo(0.008, 12);
    expect(cost.totalCost).toBeCloseTo(2.548, 12);
  });

  it("leaves a missing premium component unknown rather than inheriting Standard caching", () => {
    const cost = calculateCostBreakdown({ ...usage, actualServiceTier: "fast", serviceTierCostStatus: "unpriced" }, {
      input: 2, output: 10, cached: 0.1, service_tiers: { fast: { input: 4, output: 20 } },
    });
    expect(cost.inputCost).toBeCloseTo(0.32, 12);
    expect(cost.cachedCost).toBeNull();
    expect(cost.totalCost).toBeNull();
  });

  it.each([undefined, null, "auto", "new-unverified-tier"])("does not price an unconfirmed delivered tier %s", actualServiceTier => {
    const cost = calculateCostBreakdown({ ...usage, requestedServiceTier: "fast", actualServiceTier, serviceTierCostStatus: "unconfirmed" }, quote);
    expect(cost.totalCost).toBeNull();
  });

  it("honors an explicit null Fast tariff and a genuinely free premium tariff", () => {
    const tokens = { ...usage, actualServiceTier: "priority", serviceTierCostStatus: "unpriced" };
    expect(calculateCostBreakdown(tokens, { ...quote, service_tiers: { priority: null, fast: quote.service_tiers.fast } }).totalCost).toBeNull();
    expect(calculateCostBreakdown(tokens, { ...quote, service_tiers: { fast: { input: 0, output: 0, cached: 0 } } }).totalCost).toBe(0);
  });

  it("uses Standard when the upstream downgraded requested Ultrafast", () => {
    const cost = calculateCostBreakdown({ ...usage, requestedServiceTier: "ultrafast", actualServiceTier: "default", serviceTierCostStatus: "standard" }, quote);
    expect(cost.totalCost).toBeCloseTo(0.262, 12);
  });

  it("records returned Auto as unconfirmed delivery rather than a priced or known premium tier", () => {
    expect(getServiceTierAccounting("codex", { requestedServiceTier: null }, { service_tier: "auto" }))
      .toMatchObject({ actualServiceTier: "auto", serviceTierCostStatus: "unconfirmed" });
  });

  it("never uses inherited object keys as delivered tariffs", () => {
    const cost = calculateCostBreakdown({ ...usage, actualServiceTier: "constructor", serviceTierCostStatus: "unpriced" }, quote);
    expect(cost.totalCost).toBeNull();
  });
});
