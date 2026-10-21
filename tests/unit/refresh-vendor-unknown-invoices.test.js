import { describe, expect, it } from "vitest";
import { calculateCostBreakdown, getPricingForModel } from "../../open-sse/providers/pricing.js";

// These routes use plan quotas/credits, or have no verified USD invoice quote.
// A model-name match must not turn the same weights' PAYG price into their bill.
describe("vendor product boundaries at the invoice calculator", () => {
  it.each([
    ["alicode", "qwen3.7-plus"],
    ["alicode-intl", "MiniMax-M2.5"],
    ["alitp-intl", "qwen3.8-max"],
    ["glm", "glm-5.3"],
    ["glm-cn", "glm-4.7-flash"],
    ["kimi", "k3"],
    ["kimi", "kimi-k3"],
    ["xiaomi-tokenplan", "mimo-v2.6-pro"],
    ["xiaomi-tokenplan", "mimo-v2.5-pro-claude"],
    ["volcengine-ark", "DeepSeek-V4-Pro"],
    ["byteplus", "seed-2-0-pro-260328"],
    ["tencent", "hy3-preview"],
    ["baidu", "ernie-5.1"],
    ["minimax-cn", "MiniMax-M3"],
    ["perplexity", "sonar-pro"],
    ["perplexity-agent", "anthropic/claude-opus-4-8"],
    ["cohere", "command-a-plus-05-2026"],
    ["poolside", "poolside/laguna-xs-2.1"],
  ])("does not fabricate USD input/output costs for %s/%s", (provider, model) => {
    const pricing = getPricingForModel(provider, model);
    const cost = calculateCostBreakdown({
      prompt_tokens: 1000000, completion_tokens: 1000000, reasoning_tokens: 250000,
    }, pricing);
    expect(cost).toMatchObject({ inputCost: null, outputCost: null, reasoningCost: null, totalCost: null });
  });

  it.each([
    ["alicode", "qwen3.5-plus"], ["glm", "glm-4.7-flash"],
    ["xiaomi-tokenplan", "mimo-v2.6-flash"], ["baidu", "ernie-5.0"],
    ["tencent", "hunyuan-t1-latest"],
  ])("does not report unknown cache usage as free on %s/%s", (provider, model) => {
    const cost = calculateCostBreakdown({
      prompt_tokens: 1000000, cached_tokens: 400000,
      cache_creation_input_tokens: 600000,
    }, getPricingForModel(provider, model));
    expect(cost).toMatchObject({ cachedCost: null, cacheCreationCost: null, totalCost: null });
  });
});
