import { describe, expect, it } from "vitest";
import { calculateCostBreakdown } from "../../open-sse/providers/pricing.js";

const quote = { input: 2, output: 10, cached: 0.1, cache_creation: 2.5, reasoning: 10 };

describe("cost estimates reject contradictory canonical token accounting", () => {
  it("does not prefer a stale secondary input field above an explicit canonical zero", () => {
    expect(calculateCostBreakdown({ prompt_tokens: 0, input_tokens: 1000, completion_tokens: 0 }, quote).totalCost).toBe(0);
  });

  it("does not prefer a stale secondary output field above an explicit canonical zero", () => {
    expect(calculateCostBreakdown({ prompt_tokens: 0, completion_tokens: 0, output_tokens: 1000 }, quote).totalCost).toBe(0);
  });

  it.each([
    { prompt_tokens: -1, completion_tokens: 1 },
    { prompt_tokens: 1.5, completion_tokens: 1 },
    { prompt_tokens: Infinity, completion_tokens: 1 },
    { prompt_tokens: 100, cached_tokens: 101, completion_tokens: 1 },
    { prompt_tokens: 100, cached_tokens: 80, cache_creation_input_tokens: 30, completion_tokens: 1 },
    { prompt_tokens: 100, completion_tokens: 10, reasoning_tokens: 11 },
    { prompt_tokens: 100, completion_tokens: 10, reasoning_tokens: -1 },
  ])("keeps a complete charge unknown for invalid canonical counters %j", tokens => {
    expect(calculateCostBreakdown(tokens, quote).totalCost).toBeNull();
  });

  it("still bills valid cache/reasoning subsets once and leaves the caller's usage untouched", () => {
    const tokens = { prompt_tokens: 1000, cached_tokens: 200, cache_creation_input_tokens: 100, completion_tokens: 100, reasoning_tokens: 60 };
    const before = structuredClone(tokens);
    const result = calculateCostBreakdown(tokens, quote);
    expect(result.totalCost).toBeCloseTo(0.00267, 12);
    expect(result).toMatchObject({ inputCost: 0.0014, cachedCost: 0.00002, cacheCreationCost: 0.00025, outputCost: 0.0004, reasoningCost: 0.0006 });
    expect(tokens).toEqual(before);
  });

  it("does not turn a normalization invalid-accounting marker into a complete numeric estimate", () => {
    expect(calculateCostBreakdown({ prompt_tokens: 100, completion_tokens: 10, usage_invalid: true }, quote).totalCost).toBeNull();
  });

  it("avoids intermediate overflow for a valid finite JSON quote and leaves unrepresentable totals unknown", () => {
    const finite = calculateCostBreakdown({ prompt_tokens: 2 }, { input: 1e308 });
    expect(finite.inputCost).toBeCloseTo(2e302, -290);
    expect(Number.isFinite(finite.totalCost)).toBe(true);
    const overflow = calculateCostBreakdown({ prompt_tokens: 1000000, completion_tokens: 1000000 }, { input: 1e308, output: 1e308 });
    expect(overflow.totalCost).toBeNull();
  });
});
