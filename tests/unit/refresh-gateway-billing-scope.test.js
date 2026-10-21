import { describe, expect, it } from "vitest";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

describe("gateway quota and account billing boundaries", () => {
  it.each([
    ["github", "gpt-5.5", "subscription-credits"],
    ["ollama", "qwen3.5", "usage-credit"],
    ["clinepass", "cline-pass/glm-5.2", "subscription-reference"],
    ["opencode-go", "minimax-m2.7", "subscription-reference"],
    ["opencode", "muse-spark-1.2-contributor-free", "unverified-pricing"],
    ["nvidia", "deepseek-ai/deepseek-v4.1-flash", "trial-or-enterprise"],
    ["hyperbolic", "deepseek-ai/DeepSeek-R1", "unverified-pricing"],
    ["groq", "llama-3.3-70b-versatile", "enterprise-quote"],
    ["groq", "minimaxai/minimax-m2.7", "enterprise-quote"],
  ])("does not turn %s/%s quotas or vendor prices into a verified USD invoice", (provider, model, kind) => {
    const record = getReviewedModelMetadata(provider, model);
    expect(record?.billing.kind).toBe(kind);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100000 }, getPricingForModel(provider, model))).toBeNull();
  });

  it("retains Ollama's published credit debit separately from an unknown marginal cash invoice", () => {
    const billing = getReviewedModelMetadata("ollama", "kimi-k3").billing;
    expect(billing.referencePricing).toMatchObject({ input: 3, output: 15, cached: 0.3 });
    expect(billing.referenceUnit).toBe("USD_usage_credits_per_1000000_tokens");
    expect(billing.invoiceVerified).toBe(false);
  });

  it("preserves a documented OpenCode free promotion without making every free-suffixed provider free", () => {
    const usage = { prompt_tokens: 1000000, completion_tokens: 100000 };
    expect(calculateCostFromTokens(usage, getPricingForModel("opencode", "deepseek-v4.1-flash-free"))).toBe(0);
    expect(getReviewedModelMetadata("opencode", "deepseek-v4.1-flash-free").billing.kind).toBe("free-promotion");
    expect(calculateCostFromTokens(usage, getPricingForModel("hyperbolic", "deepseek-v4.1-flash-free"))).not.toBe(0);
  });

  it.each([
    ["openrouter", "minimax/minimax-m3.1-flash:free"],
    ["kilo-gateway", "minimax/minimax-m3.1-flash:free"],
    ["opencode", "minimax-m3.1-flash-free"],
  ])("prices the primary-published %s/%s free route before advertising it", (provider, model) => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100000 }, getPricingForModel(provider, model))).toBe(0);
  });

  it("retains TokenRouter's published high tier without claiming its exact boundary is verified", () => {
    const record = getReviewedModelMetadata("tokenrouter", "openai/gpt-6.1-sol");
    expect(record?.billing.tierBoundaryVerified).toBe(false);
    expect(record?.billing.publishedTiers.input).toEqual([
      { minTokens: 272000, maxTokens: null, pricePerUnit: 4, ratio: 2 },
      { minTokens: 0, maxTokens: 272000, pricePerUnit: 2, ratio: 1 },
    ]);
    expect(calculateCostFromTokens({ prompt_tokens: 272001, completion_tokens: 1000 }, getPricingForModel("tokenrouter", "openai/gpt-6.1-sol"))).toBeCloseTo(1.103004, 12);
  });

  it("uses Copilot's own 200K Luna quota threshold rather than a native 272K reference", () => {
    const quote = getReviewedModelMetadata("github", "gpt-5.6-luna").billing.referencePricing;
    expect(calculateCostFromTokens({ prompt_tokens: 200000, completion_tokens: 1000 }, quote)).toBeCloseTo(0.0412, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 200001, completion_tokens: 1000 }, quote)).toBeCloseTo(0.0818004, 12);
  });

  it.each([
    ["github", "gpt-5.6-sol", 2.22, 100000],
    ["ollama", "kimi-k3", 3.15, 1000000],
    ["clinepass", "cline-pass/qwen3.7-plus", 0.182, 100000],
    ["opencode-go", "gpt-6-luna", 0.0555, 100000],
  ])("uses the exact published %s/%s token/credit reference as an estimate, not a marginal invoice", (provider, model, expected, prompt) => {
    const pricing = getPricingForModel(provider, model);
    expect(calculateCostFromTokens({ prompt_tokens: prompt, cached_tokens: prompt / 2, completion_tokens: 100000 }, pricing)).toBeCloseTo(expected, 12);
    const billing = getReviewedModelMetadata(provider, model).billing;
    expect(billing.invoiceVerified).toBe(false);
    expect(billing.currency).toBe("USD");
    expect(billing.unit).toBe("per_1000000_tokens");
  });
});
