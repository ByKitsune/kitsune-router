import { describe, it, expect } from "vitest";
import metadata from "../../open-sse/providers/metadata/vendorModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";

describe("vendor factual metadata shard", () => {
  it("imports finite route facts and uses them at the real capability/pricing consumers", () => {
    expect(getCapabilitiesForModel("deepseek", "deepseek-v4-pro").vision).toBe(false);
    expect(getCapabilitiesForModel("glm", "glm-5.3-flash").thinkingCanDisable).toBe(false);
    expect(getCapabilitiesForModel("kimi", "kimi-for-coding-highspeed").contextWindow).toBe(262144);
    expect(getCapabilitiesForModel("cohere", "command-a-03-2025").maxOutput).toBe(8000);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 1000000, completion_tokens: 100000 }, getPricingForModel("perplexity-agent", "perplexity/sonar"))).toBeCloseTo(0.3125, 12);

    for (const models of Object.values(metadata)) for (const entry of Object.values(models)) {
      expect(entry.sources.length).toBeGreaterThan(0);
      for (const field of ["contextWindow", "maxInput", "maxOutput"]) {
        const value = entry.capabilities[field];
        expect(value === null || Number.isSafeInteger(value) && value > 0).toBe(true);
      }
      for (const field of ["input", "output", "cached", "reasoning", "cache_creation"]) {
        const value = entry.pricing[field];
        expect(value === null || Number.isFinite(value) && value >= 0).toBe(true);
      }
      expect(entry.billing.authenticatedRouteVerified).toBe(false);
    }
  });

  it("keeps subscription and native-CNY records explicit unknowns in the USD calculator", () => {
    const usage = { prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 };
    for (const [provider, model] of [
      ["alicode-intl", "qwen3.7-plus"], ["xiaomi-tokenplan", "mimo-v2.6-pro"],
      ["glm-cn", "glm-5.3"], ["baidu", "ernie-5.1"], ["minimax-cn", "MiniMax-M3"],
    ]) {
      expect(metadata[provider][model].pricing).toMatchObject({ input: null, output: null, cached: null });
      expect(calculateCostFromTokens(usage, getPricingForModel(provider, model))).toBeNull();
    }
    expect(metadata.baidu["ernie-5.1"].billing).toMatchObject({ currency: "CNY", unit: "per_1000_tokens" });
  });
});
