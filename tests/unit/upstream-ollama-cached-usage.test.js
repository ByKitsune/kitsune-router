import { describe, expect, it } from "vitest";
import { toOpenAIUsage } from "../../open-sse/translator/concerns/usage.js";
import { canonicalizeUsage, extractUsage } from "../../open-sse/utils/usageTracking.js";
import { extractUsageFromResponse } from "../../open-sse/handlers/chatCore/requestDetail.js";
import { ollamaToOpenAIResponse, ollamaBodyToOpenAI } from "../../open-sse/translator/response/ollama-to-openai.js";
import { calculateCostFromTokens } from "../../open-sse/providers/pricing.js";

const final = { model: "fixture-cloud-model", done: true, prompt_eval_count: 100, eval_count: 20, prompt_eval_cached_count: 80 };
const rates = { input: 10, output: 30, cached: 1 };
const expected = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cached_tokens: 80 };

describe("native Ollama cached input (9router #4604)", () => {
  it.each([
    ["native usage converter", value => canonicalizeUsage(toOpenAIUsage(value, "ollama"))],
    ["raw stream accounting", value => canonicalizeUsage(extractUsage(value))],
    ["non-stream request detail", extractUsageFromResponse],
    ["client JSON response", value => canonicalizeUsage(ollamaBodyToOpenAI({ ...value, message: { content: "fixture" } }).usage)],
    ["client SSE final chunk", value => canonicalizeUsage(ollamaToOpenAIResponse(value, {}).usage)],
  ])("preserves cache-inclusive usage through %s", (label, convert) => {
    const usage = convert(final);
    expect(usage).toMatchObject(expected);
    expect(canonicalizeUsage(usage)).toMatchObject(expected);
    // Only20 input tokens are uncached; cached80 are not appended to prompt100.
    expect(calculateCostFromTokens(usage, rates)).toBeCloseTo(0.00088, 12);
  });

  it("supports explicit zero cache and does not fabricate a positive cache counter", () => {
    expect(canonicalizeUsage(toOpenAIUsage({ ...final, prompt_eval_cached_count: 0 }, "ollama")).cached_tokens).toBe(0);
    const { prompt_eval_cached_count, ...uncached } = final;
    expect(canonicalizeUsage(toOpenAIUsage(uncached, "ollama")).cached_tokens).toBe(0);
  });

  it("converts finite integer string counters without losing cached input", () => {
    expect(canonicalizeUsage(toOpenAIUsage({ prompt_eval_count: "100", eval_count: "20", prompt_eval_cached_count: "80" }, "ollama"))).toMatchObject(expected);
  });

  it.each([null, true, -1, 1.5, "malformed", NaN, Infinity])("does not turn invalid cache observation %s into a definite uncached price", (cached) => {
    const usage = canonicalizeUsage(extractUsage({ ...final, prompt_eval_cached_count: cached }));
    expect(usage.usage_invalid).toBe(true);
    expect(calculateCostFromTokens(usage, rates)).toBeNull();
  });

  it("does not price a cache subset larger than the inclusive prompt", () => {
    const usage = canonicalizeUsage(extractUsage({ ...final, prompt_eval_cached_count: 101 }));
    expect(calculateCostFromTokens(usage, rates)).toBeNull();
  });

  it("ignores a non-final chunk's provisional usage counters", () => {
    expect(extractUsage({ ...final, done: false })).toBeNull();
  });
});
