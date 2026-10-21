import { describe, expect, it } from "vitest";
import { calculateCostBreakdown, calculateCostFromTokens, getPricingForModel, PROVIDER_PRICING } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

// Independently hand-calculated from the captured 2026-10-21 primary catalogs.
// Evidence: /tmp/opencode/zenrouter-client-pricing-refresh-20261021/gateway.
// These cases catch reseller/vendor substitution, stale rates, and lost real zeros.
describe("2026-10-21 hosted route token estimates", () => {
  it.each([
    ["tokenrouter", "z-ai/glm-5.3", 0.56, 1.76, 0.104, 0.508],
    ["tr", "moonshotai/kimi-k3", 1.8, 9, 0.18, 1.89],
    ["tokenrouter", "deepseek/deepseek-v4.1-flash-1017", 0.18, 0.72, 0.0036, 0.1638],
    ["tokenrouter", "deepseek/deepseek-v4-pro", 1.32, 3.96, 0.044, 1.078],
    ["tokenrouter", "openai/gpt-6.1-sol", 2, 10, 0.1, 0.205, 0.1],
    ["tokenrouter", "moonshotai/kimi-k2.7-code", 0.9286, 3.8571, 0.1857, 0.94286],
    ["nebius", "deepseek-ai/DeepSeek-V4-Flash-0731", 0.14, 0.28, 0.01, 0.103],
    ["nebius", "deepseek-ai/DeepSeek-V4.1-Flash", 0.3, 1.2, 0.01, 0.275],
    ["nebius", "MiniMaxAI/MiniMax-M3", 0.3, 1.2, 0.06, 0.3],
    ["morph", "morph-dsv41flash-1017", 0.206, 0.6, 0.018, 0.172],
    ["morph", "morph-glm53-744b", 0.217, 4.4, 0.055, 0.576],
    ["siliconflow", "deepseek-ai/DeepSeek-V4.1-Flash", 0.15, 0.6, 0.003, 0.1365],
    ["siliconflow", "openai/gpt-oss-120b", 0.05, 0.45, 0.075, 0.1075],
    ["together", "Qwen/Qwen3.8-2.4T-A95B", 2, 6, 0.25, 1.725],
    ["venice", "deepseek-v4-1-flash-1017", 0.3, 1.2, 0.0075, 0.27375],
    ["cloudflare-ai", "@cf/deepseek-ai/deepseek-v4.1-flash-1017", 0.300003, 1.200001, 0.005995, 0.2729991],
  ])("bills %s/%s from its literal hosted quote", (provider, model, input, output, cached, total, scale = 1) => {
    const pricing = getPricingForModel(provider, model);
    expect(pricing?.input).toBeCloseTo(input, 12);
    expect(pricing.output).toBeCloseTo(output, 12);
    expect(pricing.cached).toBeCloseTo(cached, 12);
    const usage = { prompt_tokens: 1000000 * scale, cached_tokens: 500000 * scale, completion_tokens: 100000 * scale, reasoning_tokens: 60000 * scale };
    expect(calculateCostFromTokens(usage, pricing)).toBeCloseTo(total, 12);
    expect(calculateCostBreakdown(usage, pricing).totalCost).toBeCloseTo(total, 12);
  });

  it("retains Together's primary price rather than a conflicting secondary catalog", () => {
    // Pricing landing page: 1.50/4.50/0.30; serverless API-ID table: 2.50/7.50/0.50.
    const pricing = getPricingForModel("together", "Qwen/Qwen3.7-Max");
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 500000, completion_tokens: 100000 }, pricing)).toBeCloseTo(1.35, 12);
    expect(getReviewedModelMetadata("together", "Qwen/Qwen3.7-Max").billing.kind).toBe("metered");
  });

  it("preserves SambaNova's explicit zero cache write instead of inventing an input-rate fee", () => {
    const usage = { prompt_tokens: 1000000, cache_creation_input_tokens: 1000000, completion_tokens: 0 };
    const pricing = getPricingForModel("sambanova", "MiniMax-M3");
    expect(calculateCostFromTokens(usage, pricing)).toBe(0);
    expect(calculateCostBreakdown(usage, pricing).cacheCreationCost).toBe(0);
  });

  it.each([
    ["cerebras", "qwen-3.8-27b"],
    ["cloudflare-ai", "@cf/qwen/qwen3.8-27b"],
    ["featherless", "deepseek-ai/DeepSeek-V4-Pro"],
  ])("leaves an unpublished used cache tariff unknown for %s/%s", (provider, model) => {
    const price = getPricingForModel(provider, model);
    expect(price.input).toBeGreaterThan(0);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 1000000 }, price)).toBeNull();
  });

  it("charges Featherless Developer's exact model rate, not a native DeepSeek leaf", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100000 }, getPricingForModel("featherless", "deepseek-ai/DeepSeek-V4-Pro"))).toBeCloseTo(1.92, 12);
  });

  it("keeps TokenRouter's ratio-zero route scoped to the quoted provider", () => {
    const usage = { prompt_tokens: 1000000, completion_tokens: 100000 };
    expect(calculateCostFromTokens(usage, getPricingForModel("tokenrouter", "minimax/minimax-m3.1-flash"))).toBe(0);
    expect(calculateCostFromTokens(usage, getPricingForModel("openrouter", "minimax/minimax-m3.1-flash"))).toBeGreaterThan(0);
  });

  it("keeps a dynamic Kilo auto quote unknown rather than treating its -1 sentinel as a credit", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100000 }, getPricingForModel("kilo-gateway", "kilo-auto/efficient"))).toBeNull();
    expect(getReviewedModelMetadata("kilo-gateway", "kilo-auto/efficient")?.billing.kind).toBe("dynamic-route");
  });

  it.each([
    ["MiniMax-M3", 512001, 0.3091206],
    ["openai/gpt-5.6-luna", 272001, 0.1102404],
    ["google/gemini-3.1-pro-preview", 200001, 0.814404],
  ])("uses TokenRouter's own high-context quote above the %s threshold", (model, prompt, total) => {
    const usage = { prompt_tokens: prompt, cached_tokens: 1000, completion_tokens: 1000, reasoning_tokens: 400 };
    expect(calculateCostFromTokens(usage, getPricingForModel("tokenrouter", model))).toBeCloseTo(total, 12);
  });

  it.each([
    [{ input: null, output: null, cached: null }, null],
    [{ input: 0, output: 0, cached: 0 }, 0],
    [{ input: 7, output: 8, cached: 9 }, 8.8],
  ])("keeps an explicit provider quote above refreshed default metadata (%j)", (quote, total) => {
    const model = "deepseek/deepseek-v4-pro";
    const before = PROVIDER_PRICING.tokenrouter[model];
    try {
      PROVIDER_PRICING.tokenrouter[model] = quote;
      expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 500000, completion_tokens: 100000 }, getPricingForModel("tr", model))).toBe(total);
    } finally {
      PROVIDER_PRICING.tokenrouter[model] = before;
    }
  });

});
