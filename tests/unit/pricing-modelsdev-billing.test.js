import { describe, expect, it } from "vitest";
import {
  calculateCostBreakdown,
  calculateCostFromTokens,
  getPricingForModel,
  ZERO_PRICING,
} from "../../open-sse/providers/pricing.js";
import { canonicalizeUsage } from "../../open-sse/utils/usageTracking.js";

describe("2026-10-17 provider-scoped billing evidence", () => {
  it("charges Sonnet 5.5 cached input at its documented 5% rate without charging reasoning twice", () => {
    const tokens = canonicalizeUsage({ prompt_tokens: 0, cache_read_input_tokens: 1000000, completion_tokens: 10000, reasoning_tokens: 6000 });
    const pricing = getPricingForModel("anthropic", "claude-sonnet-5-5");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.2, 12);
    expect(calculateCostBreakdown(tokens, pricing)).toMatchObject({ cachedCost: 0.1, outputCost: 0.04, reasoningCost: 0.06 });
  });

  it("charges Gemini 3 Flash Preview cache hits at the paid API rate rather than the family estimate", () => {
    const tokens = { prompt_tokens: 1000000, cached_tokens: 1000000, completion_tokens: 0 };
    const pricing = getPricingForModel("gemini", "gemini-3-flash-preview");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.05, 12);
    expect(calculateCostBreakdown(tokens, pricing).cachedCost).toBeCloseTo(0.05, 12);
  });

  it("bills Gemini 3 Flash Preview thinking at its output rate without an invented reasoning premium", () => {
    const tokens = { prompt_tokens: 0, completion_tokens: 100000, reasoning_tokens: 100000 };
    const pricing = getPricingForModel("gemini", "gemini-3-flash-preview");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.3, 12);
    expect(calculateCostBreakdown(tokens, pricing)).toMatchObject({ outputCost: 0, reasoningCost: 0.3 });
  });

  it("charges native o1 reasoning at the documented output tariff rather than a 50% premium", () => {
    const tokens = { prompt_tokens: 1000000, cached_tokens: 500000, completion_tokens: 100000, reasoning_tokens: 60000 };
    const pricing = getPricingForModel("openai", "o1");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(17.25, 12);
    expect(calculateCostBreakdown(tokens, pricing).reasoningCost).toBeCloseTo(3.6, 12);
  });

  it("keeps GPT 5.4 Pro cache-hit costs unknown when its published API tariff has no cache rate", () => {
    const tokens = { prompt_tokens: 300000, cached_tokens: 300000, completion_tokens: 0 };
    const pricing = getPricingForModel("openai", "gpt-5.4-pro");
    expect(calculateCostFromTokens(tokens, pricing)).toBeNull();
    expect(calculateCostBreakdown(tokens, pricing).cachedCost).toBeNull();
  });

  it.each([
    [100000, 0.03075],
    [100001, 0.1537505],
  ])("uses total cache-inclusive input for the Haiku 5.5 >100K tier at %i tokens", (prompt, expected) => {
    const tokens = { prompt_tokens: prompt, cached_tokens: 50000, cache_creation_input_tokens: 10000, completion_tokens: 50000, reasoning_tokens: 30000 };
    const pricing = getPricingForModel("anthropic", "claude-haiku-5-5");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(expected, 12);
    expect(calculateCostBreakdown(tokens, pricing).totalCost).toBeCloseTo(expected, 12);
  });

  it("uses Groq's literal hosted GPT OSS tariff instead of an unknown or vendor price", () => {
    const tokens = { prompt_tokens: 1000000, cached_tokens: 500000, completion_tokens: 100000, reasoning_tokens: 60000 };
    const pricing = getPricingForModel("groq", "openai/gpt-oss-120b");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.1725, 12);
    expect(calculateCostBreakdown(tokens, pricing).totalCost).toBeCloseTo(0.1725, 12);
  });

  it("does not substitute SiliconFlow's hosted DeepSeek tariff with the cheaper vendor tariff", () => {
    const tokens = { prompt_tokens: 1000000, cached_tokens: 500000, completion_tokens: 100000, reasoning_tokens: 60000 };
    const pricing = getPricingForModel("siliconflow", "deepseek-ai/DeepSeek-V4-Pro");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(1.13181, 12);
    expect(calculateCostBreakdown(tokens, pricing).totalCost).toBeCloseTo(1.13181, 12);
  });

  it("uses Cloudflare's exact documented neuron charge rather than rounded token prices", () => {
    const tokens = { prompt_tokens: 1000000, completion_tokens: 100000 };
    const pricing = getPricingForModel("cloudflare-ai", "@cf/meta/llama-3.2-3b-instruct");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.0843975, 12);
    expect(calculateCostBreakdown(tokens, pricing).totalCost).toBeCloseTo(0.0843975, 12);
  });

  it("does not invent a Cloudflare Qwen cache discount omitted from its primary tariff", () => {
    const tokens = { prompt_tokens: 1000000, cached_tokens: 1000000, completion_tokens: 0 };
    const pricing = getPricingForModel("cloudflare-ai", "@cf/qwen/qwen3.8-27b");
    expect(calculateCostFromTokens(tokens, pricing)).toBeNull();
    expect(calculateCostBreakdown(tokens, pricing).cachedCost).toBeNull();
  });

  it("uses Together's current literal Qwen tariff over a stale catalog reference", () => {
    const tokens = { prompt_tokens: 1000000, cached_tokens: 500000, completion_tokens: 100000 };
    const pricing = getPricingForModel("together", "Qwen/Qwen3.7-Max");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(1.35, 12);
    expect(calculateCostBreakdown(tokens, pricing).totalCost).toBeCloseTo(1.35, 12);
  });

  it.each([
    ["gemini-3.1-flash-image", 0.5],
    ["gemini-3-pro-image", 2],
    ["gemini-2.5-flash-image", 0.3],
    ["gemini-3.1-flash-tts-preview", 1],
    ["gemini-2.5-flash-preview-tts", 0.5],
    ["gemini-2.5-pro-preview-tts", 1],
  ])("retains known %s input charges without pretending generic output counters identify their native modality", (model, inputCost) => {
    const pricing = getPricingForModel("gemini", model);
    const tokens = { prompt_tokens: 1000000, completion_tokens: 10000 };
    const cost = calculateCostBreakdown(tokens, pricing);
    expect(cost.inputCost).toBeCloseTo(inputCost, 12);
    expect(cost.outputCost).toBeNull();
    expect(cost.totalCost).toBeNull();
    expect(calculateCostFromTokens(tokens, pricing)).toBeNull();
  });

  it("preserves an exact Kilo :free model as free without borrowing its paid canonical leaf", () => {
    const tokens = { prompt_tokens: 1000000, completion_tokens: 100000, reasoning_tokens: 60000 };
    expect(calculateCostFromTokens(tokens, getPricingForModel("kilo-gateway", "nvidia/nemotron-3-super-120b-a12b:free"))).toBe(0);
  });
});

describe("honest unknown token cost components", () => {
  it("keeps an unknown used cache-write charge null instead of billing the input rate", () => {
    const tokens = { prompt_tokens: 100, cache_creation_input_tokens: 40, completion_tokens: 20 };
    const pricing = { input: 2, output: 10 };
    const cost = calculateCostBreakdown(tokens, pricing);
    expect(cost.inputCost).toBeCloseTo(0.00012, 12);
    expect(cost.outputCost).toBeCloseTo(0.0002, 12);
    expect(cost.cacheCreationCost).toBeNull();
    expect(cost.cachedCost).toBe(0);
    expect(cost.totalCost).toBeNull();
    expect(calculateCostFromTokens(tokens, pricing)).toBeNull();
  });

  it("keeps an unknown used cache-read charge null without losing known components", () => {
    const tokens = { prompt_tokens: 100, cached_tokens: 40, completion_tokens: 20 };
    const pricing = { input: 2, output: 10 };
    const cost = calculateCostBreakdown(tokens, pricing);
    expect(cost.inputCost).toBeCloseTo(0.00012, 12);
    expect(cost.outputCost).toBeCloseTo(0.0002, 12);
    expect(cost.cachedCost).toBeNull();
    expect(cost.cacheCreationCost).toBe(0);
    expect(cost.totalCost).toBeNull();
    expect(calculateCostFromTokens(tokens, pricing)).toBeNull();
  });

  it.each([null, {}, { input: 2, output: null }])("does not report an unknown used output tariff as a zero-dollar request (%j)", (pricing) => {
    const tokens = { prompt_tokens: 0, completion_tokens: 20 };
    expect(calculateCostFromTokens(tokens, pricing)).toBeNull();
    const cost = calculateCostBreakdown(tokens, pricing);
    expect(cost.outputCost).toBeNull();
    expect(cost.inputCost).toBe(0);
    expect(cost.totalCost).toBeNull();
  });

  it("does not require unused output/cache tariffs to bill an input-only embedding request", () => {
    const tokens = { prompt_tokens: 1000000, completion_tokens: 0 };
    expect(calculateCostFromTokens(tokens, { input: 0.02 })).toBeCloseTo(0.02, 12);
    expect(calculateCostBreakdown(tokens, { input: 0.02 })).toEqual({ inputCost: 0.02, outputCost: 0, cachedCost: 0, cacheCreationCost: 0, reasoningCost: 0, totalCost: 0.02 });
  });

  it("keeps zero usage and explicit zero tariffs distinct from unknown used rates", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 0, completion_tokens: 0 }, null)).toBe(0);
    const tokens = { prompt_tokens: 100, cached_tokens: 40, cache_creation_input_tokens: 20, completion_tokens: 50, reasoning_tokens: 20 };
    expect(calculateCostFromTokens(tokens, ZERO_PRICING)).toBe(0);
    expect(calculateCostBreakdown(tokens, ZERO_PRICING).totalCost).toBe(0);
  });

  it("uses the documented output rate for reasoning when no separate reasoning tariff exists", () => {
    const tokens = { prompt_tokens: 0, completion_tokens: 100, reasoning_tokens: 60 };
    const pricing = { output: 10 };
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.001, 12);
    const cost = calculateCostBreakdown(tokens, pricing);
    expect(cost.outputCost).toBeCloseTo(0.0004, 12);
    expect(cost.reasoningCost).toBeCloseTo(0.0006, 12);
    expect(cost.totalCost).toBeCloseTo(0.001, 12);
  });
});

describe("cache-write TTL billing", () => {
  it("bills mixed Sonnet 5.5 five-minute and one-hour writes without counting their input twice", () => {
    const tokens = { prompt_tokens: 100000, cached_tokens: 50000, cache_creation_input_tokens: 40000, cache_creation_5m_tokens: 30000, cache_creation_1h_tokens: 10000, completion_tokens: 10000, reasoning_tokens: 6000 };
    const pricing = getPricingForModel("anthropic", "claude-sonnet-5-5");
    const cost = calculateCostBreakdown(tokens, pricing);
    expect(cost.inputCost).toBeCloseTo(0.02, 12);
    expect(cost.cachedCost).toBeCloseTo(0.005, 12);
    expect(cost.cacheCreationCost).toBeCloseTo(0.115, 12);
    expect(cost.totalCost).toBeCloseTo(0.24, 12);
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.24, 12);
  });

  it.each([
    [100000, 0.01225],
    [100001, 0.0612505],
  ])("applies the Haiku 5.5 whole-request tariff to both cache TTLs at %i input tokens", (prompt, expected) => {
    const tokens = { prompt_tokens: prompt, cached_tokens: 50000, cache_creation_input_tokens: 40000, cache_creation_5m_tokens: 30000, cache_creation_1h_tokens: 10000, completion_tokens: 10000, reasoning_tokens: 6000 };
    const pricing = getPricingForModel("anthropic", "claude-haiku-5-5");
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(expected, 12);
    expect(calculateCostBreakdown(tokens, pricing).totalCost).toBeCloseTo(expected, 12);
  });

  it("keeps a used one-hour write unknown rather than charging the five-minute rate", () => {
    const tokens = { prompt_tokens: 100, cache_creation_input_tokens: 50, cache_creation_5m_tokens: 30, cache_creation_1h_tokens: 20, completion_tokens: 20 };
    const pricing = { input: 2, output: 10, cache_creation: 2.5 };
    const cost = calculateCostBreakdown(tokens, pricing);
    expect(cost.inputCost).toBeCloseTo(0.0001, 12);
    expect(cost.outputCost).toBeCloseTo(0.0002, 12);
    expect(cost.cacheCreationCost).toBeNull();
    expect(cost.totalCost).toBeNull();
    expect(calculateCostFromTokens(tokens, pricing)).toBeNull();
  });

  it("does not require an unused five-minute tariff for an exclusively one-hour write", () => {
    const tokens = { prompt_tokens: 100, cache_creation_input_tokens: 25, cache_creation_1h_tokens: 25, completion_tokens: 0 };
    const pricing = { input: 2, cache_creation_1h: 4 };
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.00025, 12);
    expect(calculateCostBreakdown(tokens, pricing).cacheCreationCost).toBeCloseTo(0.0001, 12);
  });

  it.each([
    { cache_creation_5m_tokens: 30, cache_creation_1h_tokens: 20 },
    { cache_creation_input_tokens: 50, cache_creation_1h_tokens: 20 },
  ])("resolves aggregate creation and TTL subsets without charging their overlap twice (%j)", (creation) => {
    const tokens = { prompt_tokens: 100, completion_tokens: 0, ...creation };
    const pricing = { input: 2, cache_creation: 2.5, cache_creation_1h: 4 };
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.000255, 12);
    const cost = calculateCostBreakdown(tokens, pricing);
    expect(cost.inputCost).toBeCloseTo(0.0001, 12);
    expect(cost.cacheCreationCost).toBeCloseTo(0.000155, 12);
    expect(cost.totalCost).toBeCloseTo(0.000255, 12);
  });

  it("retains the documented five-minute tariff for legacy aggregate-only cache writes", () => {
    const tokens = { prompt_tokens: 100, cache_creation_input_tokens: 50, completion_tokens: 0 };
    const pricing = { input: 2, cache_creation: 2.5, cache_creation_1h: 4 };
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(0.000225, 12);
    expect(calculateCostBreakdown(tokens, pricing).cacheCreationCost).toBeCloseTo(0.000125, 12);
  });
});
