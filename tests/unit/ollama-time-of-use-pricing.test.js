import { describe, expect, it } from "vitest";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getTimeOfUsePricing } from "../../open-sse/config/timeOfUsePricing.js";

describe("Ollama Cloud DeepSeek usage-credit schedule", () => {
  it.each([
    ["2026-10-29T11:59:59Z", 0.66],
    ["2026-10-29T12:00:00Z", 1.32],
    ["2026-10-29T17:59:59Z", 1.32],
    ["2026-10-29T18:00:00Z", 0.66],
    ["2026-10-31T14:00:00Z", 0.66],
    ["2026-11-01T14:00:00Z", 0.66],
    ["2026-10-29T20:00:00+08:00", 1.32],
  ])("resolves the recorded instant %s rather than the estimator's wall clock", (timestamp, input) => {
    const quote = getPricingForModel("ollama", "deepseek-v4-pro", { timestamp });
    expect(quote.input).toBe(input);
    expect(quote.output).toBeCloseTo(input * 3);
    expect(quote.reasoning).toBe(quote.output);
  });
  it("keeps the existing non-dated editor reference and unrelated products unchanged", () => {
    expect(getPricingForModel("ollama", "deepseek-v4-pro").input).toBe(1.32);
    expect(getTimeOfUsePricing("ollama-local", "deepseek-v4-pro", "2026-10-29T06:00:00Z")).toBeUndefined();
    expect(getTimeOfUsePricing("ollama", "deepseek-v4-flash", "2026-10-29T06:00:00Z")).toBeUndefined();
    expect(getTimeOfUsePricing("ollama", "deepseek-v4-pro", "2026-10-20T06:00:00Z")).toBeUndefined();
  });
  it("resolves exact Flash cache reads at off-peak and rejects ambiguous local timestamps", () => {
    expect(getPricingForModel("ollama", "deepseek-v4.1-flash", { timestamp: "2026-10-29T06:00:00Z" })).toMatchObject({ input: 0.15, cached: 0.003, output: 0.6 });
    expect(getPricingForModel("ollama", "deepseek-v4.1-flash", { timestamp: "2026-10-29T06:00:00" })).toMatchObject({ input: null, cached: null, output: null });
  });
});
