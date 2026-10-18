import { describe, expect, it } from "vitest";
import { calculateCostFromTokens, getPricingForModel, MODEL_PRICING, PROVIDER_PRICING } from "../../open-sse/providers/pricing.js";

// Literal facts: models.dev commit 22dc88b304dd15ab1c1692794ead3696bc97994d
// (2026-10-17T23:21:55Z), cross-checked against the vendors' public price lists.
// Raw responses, SHA256 and actual fetch dates: docs/audit/data/catalog-review-20261017.json.
describe("2026-10-17 reviewed tariffs at the cost consumer", () => {
  it("uses Haiku 5.5's reviewed tier across supported version spellings", () => {
    // https://platform.claude.com/docs/en/about-claude/pricing.md
    // <=100K: $0.10/$0.50/$0.01; >100K: $0.50/$2.50/$0.05.
    const price = getPricingForModel("anthropic", "claude-haiku-5.5");
    expect(calculateCostFromTokens({ prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 1000, reasoning_tokens: 400 }, price)).toBeCloseTo(0.0087, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 100001, cached_tokens: 20000, completion_tokens: 1000, reasoning_tokens: 400 }, price)).toBeCloseTo(0.0435005, 12);
  });

  it("keeps Opus 5.5 one-hour cache writes when resolving its dot spelling", () => {
    // https://platform.claude.com/docs/en/models/opus-5-5/overview.md: $8/MTok.
    const price = getPricingForModel("anthropic", "claude-opus-5.5");
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cache_creation_input_tokens: 1000, cache_creation_1h_tokens: 1000 }, price)).toBeCloseTo(0.008, 12);
  });

  it.each([
    ["anthropic", "other-vendor/claude-haiku-5.5"],
    ["catalog-unverified", "claude-haiku-5.5"],
  ])("does not apply native reviewed pricing to %s/%s", (provider, model) => {
    expect(calculateCostFromTokens({ prompt_tokens: 100000 }, getPricingForModel(provider, model))).toBe(0.1);
  });

  it("retains explicit tariffs ahead of reviewed version-spelling fallback", () => {
    const model = "claude-haiku-5.5";
    const fullId = "deepseek-ai/deepseek-v4-pro";
    const providerPrice = { input: 7, output: 8 };
    const fullIdPrice = { input: 9, output: 10 };
    const oldProvider = PROVIDER_PRICING.anthropic[model];
    const oldGlobal = MODEL_PRICING[fullId];
    try {
      MODEL_PRICING[fullId] = fullIdPrice;
      PROVIDER_PRICING.anthropic[model] = providerPrice;
      expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, getPricingForModel("anthropic", model))).toBe(7);
      expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, getPricingForModel("siliconflow", fullId))).toBe(9);
    } finally {
      if (oldProvider === undefined) delete PROVIDER_PRICING.anthropic[model];
      else PROVIDER_PRICING.anthropic[model] = oldProvider;
      if (oldGlobal === undefined) delete MODEL_PRICING[fullId];
      else MODEL_PRICING[fullId] = oldGlobal;
    }
  });

  it.each([
    ["xai/grok-4.7", 0.255998, 0.512],
    ["xai/grok-4.6", 0.255998, 0.512],
    ["xai/grok-4.5", 0.235998, 0.472],
  ])("bills Perplexity Agent's inclusive 200K tier for %s", (model, below, at) => {
    // https://docs.perplexity.ai/docs/agent-api/models.md: >=200K doubles
    // input/output/cache rates; cache-inclusive input determines the tier.
    const price = getPricingForModel("perplexity-agent", model);
    const tokens = { cached_tokens: 100000, completion_tokens: 1000, reasoning_tokens: 400 };
    expect(calculateCostFromTokens({ ...tokens, prompt_tokens: 199999 }, price)).toBeCloseTo(below, 12);
    expect(calculateCostFromTokens({ ...tokens, prompt_tokens: 200000 }, price)).toBeCloseTo(at, 12);
    expect(calculateCostFromTokens({ ...tokens, prompt_tokens: 200001 }, price)).toBeCloseTo(at + 0.000004, 12);
  });

  it.each([
    ["gpt-5.5-pro", 30, 180], ["gpt-5.4-pro", 30, 180],
    ["gpt-5.2", 1.75, 14], ["gpt-5.2-pro", 21, 168],
    ["gpt-5.1", 1.25, 10], ["gpt-5", 1.25, 10],
    ["gpt-5-mini", 0.25, 2], ["gpt-5-nano", 0.05, 0.4],
    ["gpt-5-pro", 15, 120], ["gpt-4o", 2.5, 10],
    ["gpt-4o-mini", 0.15, 0.6], ["gpt-4-turbo", 10, 30],
    ["gpt-4.1", 2, 8], ["gpt-4.1-mini", 0.4, 1.6],
    ["gpt-4.1-nano", 0.1, 0.4], ["o3", 2, 8],
    ["o3-mini", 1.1, 4.4], ["o3-pro", 20, 80],
    ["o4-mini", 1.1, 4.4], ["o1", 15, 60], ["o1-pro", 150, 600],
  ])("does not invent a native OpenAI cache-write tariff for %s", (model, input, output) => {
    // https://developers.openai.com/api/docs/pricing.md: standard text table.
    const price = getPricingForModel("openai", model);
    expect(price).toMatchObject({ input, output });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cache_creation_input_tokens: 1000 }, price)).toBeNull();
  });

  it.each([["o1", 75], ["o1-pro", 750]])("bills %s reasoning within its published output rate", (model, expected) => {
    // Same standard table: o1 $15/$60; o1-pro $150/$600, no separate reasoning surcharge.
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1000000, reasoning_tokens: 500000 }, getPricingForModel("openai", model))).toBe(expected);
  });

  it.each(["gpt-5.5-pro", "gpt-5.4-pro", "gpt-5.2-pro", "gpt-5-pro", "gpt-4-turbo", "o3-pro", "o1-pro"])("does not invent a discounted cached-input rate for %s", (model) => {
    const price = getPricingForModel("openai", model);
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cached_tokens: 1000 }, price)).toBeNull();
  });

  it.each(["gpt-5.5-pro", "gpt-5.4-pro"])("preserves the strict 272K input threshold for %s", (model) => {
    const price = getPricingForModel("openai", model);
    expect(calculateCostFromTokens({ prompt_tokens: 272000, completion_tokens: 1000 }, price)).toBeCloseTo(8.34, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 272001, completion_tokens: 1000 }, price)).toBeCloseTo(16.59006, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 272001, cached_tokens: 1000 }, price)).toBeNull();
  });
});
