import { describe, expect, it } from "vitest";
import { calculateCostFromTokens, getPricingForModel, resolveEffectivePricing } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

// Independent literals from the primary price lists captured 2026-10-21:
// developers.openai.com/api/docs/pricing.md,
// platform.claude.com/docs/en/about-claude/pricing.md,
// docs.x.ai/developers/pricing. Hashes/UTC are in the core audit directory.
describe("refreshed core tariffs at the cost consumer", () => {
  it.each(["gpt-daybreak-blue-latest", "gpt-daybreak-red-latest"])("prices the documented %s API alias rather than guessing a family tariff", model => {
    const quote = getPricingForModel("openai", model);
    const expected = model === "gpt-daybreak-blue-latest" ? 0.348 : 1.1;
    expect(calculateCostFromTokens({ prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 1000 }, quote)).toBeCloseTo(expected, 12);
  });

  it.each(["gpt-5.6-cyber", "gpt-daybreak-red-latest"])("does not extrapolate unpublished long-context tariffs for restricted %s", model => {
    const quote = getPricingForModel("openai", model);
    expect(calculateCostFromTokens({ prompt_tokens: 272000, completion_tokens: 1000 }, quote)).toBeCloseTo(3.475, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 272001, completion_tokens: 1000 }, quote)).toBeNull();
  });

  it("prices Chat Latest as its own changing API model, not a GPT-6 alias", () => {
    const quote = getPricingForModel("openai", "chat-latest");
    expect(calculateCostFromTokens({ prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 1000 }, quote)).toBeCloseTo(0.44, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cache_write_30m_tokens: 1000 }, quote)).toBeNull();
  });

  it.each(["gpt-6.1-sol", "gpt-6.1-sol-review"])("retains API-reference cache lifetimes on Codex %s without converting them to subscription debits", model => {
    const quote = getPricingForModel("cx", model);
    expect(calculateCostFromTokens({ prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 1000, cache_write_30m_tokens: 10000, cache_write_12h_tokens: 20000 }, quote)).toBeCloseTo(0.237, 12);
    expect(getReviewedModelMetadata("cx", model).billing.kind).toBe("api-reference");
    expect(getReviewedModelMetadata("cx", model).billing.planPricing).toMatchObject({ currency: "credits", unit: "1M tokens", input: 50, cached: 2.5, output: 250, separateCacheWriteCharge: false });
  });

  it.each(["gpt-reserve", "gpt-reserve-review", "codex-auto-review"])("does not price undocumented virtual %s as a separately sold API model", model => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 100 }, getPricingForModel("cx", model))).toBeNull();
  });

  it.each(["claude-opus-4-8", "claude-opus-4.8", "claude-opus-4-7", "claude-opus-4-5", "claude-opus-4-5-20251101"])("keeps %s cache lifetimes through literal and version-spelling resolution", model => {
    const quote = getPricingForModel("anthropic", model);
    expect(calculateCostFromTokens({ prompt_tokens: 3000, cache_creation_input_tokens: 3000, cache_creation_1h_tokens: 1000 }, quote)).toBeCloseTo(0.0225, 12);
  });

  it.each([["claude-mythos-5-1", 0.025], ["claude-mythos-5", 0.1]])("uses the restricted native %s cache tariff without granting Code OAuth access", (model, expected) => {
    expect(calculateCostFromTokens({ prompt_tokens: 100000, cached_tokens: 100000 }, getPricingForModel("anthropic", model))).toBeCloseTo(expected, 12);
  });

  it.each(["grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning", "grok-4.20-multi-agent-0309", "grok-4.20-reasoning", "grok-4.20-non-reasoning", "grok-4.20-multi-agent"])("applies xAI's inclusive 200K tier for exact %s", model => {
    const quote = getPricingForModel("xai", model);
    const usage = { cached_tokens: 100000, completion_tokens: 1000, reasoning_tokens: 400 };
    expect(calculateCostFromTokens({ ...usage, prompt_tokens: 199999 }, quote)).toBeCloseTo(0.14749875, 12);
    expect(calculateCostFromTokens({ ...usage, prompt_tokens: 200000 }, quote)).toBeCloseTo(0.295, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cache_creation_input_tokens: 1000 }, quote)).toBeNull();
  });

  it("keeps Standard long-context quotes independent from delivered Fast quotes", () => {
    const quote = getPricingForModel("openai", "gpt-6.1-sol");
    expect(resolveEffectivePricing(quote, 272000)).toMatchObject({ input: 2, output: 10, cached: 0.1, cache_write_30m: 2.5, cache_write_12h: 5 });
    expect(resolveEffectivePricing(quote, 272001)).toMatchObject({ input: 4, output: 15, cached: 0.2, cache_write_30m: 5, cache_write_12h: 10 });
  });

  it.each(["gemini-3.5-flash", "gemini-3.7-flash"])("retains the working %s redirect without inferring its literal tariff or promotion from its destination", model => {
    // The current price list has no literal row for these retained redirects.
    // A destination model's price is useful reference, not a verified invoice.
    const quote = getPricingForModel("gemini", model);
    expect(calculateCostFromTokens({ prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 1000 }, quote)).toBeNull();
    const billing = getReviewedModelMetadata("gemini", model).billing;
    expect(billing).not.toHaveProperty("nextRates");
    expect(billing).not.toHaveProperty("validThrough");
    expect(billing.redirectReference).toMatchObject({ rates: { input: 0.75, output: 3.75, cached: 0.075 }, nextRates: { from: "2027-01-01", input: 1.5, output: 7.5, cached: 0.15 } });
  });

  it.each(["gemma-4-31b-it", "gemma-4-26b-a4b-it"])("uses the real Gemma 4 native free-tier zero for %s without calling the CLI plan free", model => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, getPricingForModel("gemini", model))).toBe(0);
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, getPricingForModel("gc", model))).toBeNull();
  });

  it("retains the legacy bare Grok 4 ID without pricing an unverified current alias as a different model", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, getPricingForModel("xai", "grok-4"))).toBeNull();
  });
});
