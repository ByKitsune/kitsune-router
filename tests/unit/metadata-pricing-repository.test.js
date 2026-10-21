import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateCostBreakdown, calculateCostFromTokens, getPricingForModel as price } from "../../open-sse/providers/pricing.js";

const store = vi.hoisted(() => ({ value: {}, getAll: vi.fn(), write: vi.fn(() => { throw Error("Unexpected DB write"); }) }));
vi.mock("../../src/lib/db/helpers/kvStore.js", () => ({ makeKv: () => ({ getAll: store.getAll, clear: store.write }) }));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: store.write }));
beforeEach(() => { vi.resetModules(); store.value = {}; store.getAll.mockImplementation(async () => store.value); store.write.mockClear(); });

describe("saved pricing metadata merge", () => {
  it("merges partial saved rates identically for billing and display without writing storage", async () => {
    const model = "deepseek/deepseek-v4-pro";
    store.value = { tr: { [model]: { input: 9 } } };
    const before = structuredClone(store.value);
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const expected = { ...price("tokenrouter", model), input: 9 };
    expect(await repo.getPricingForModel("tokenrouter", model)).toEqual(expected);
    expect(await repo.getPricingForModel("tr", model)).toEqual(expected);
    const displayed = await repo.getPricing();
    expect(displayed.tokenrouter[model]).toEqual(expected);
    expect(displayed.tr[model]).toEqual(expected);
    expect(store.value).toEqual(before);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("honors the exact saved token over conflicting aliases and inherits only static missing fields", async () => {
    const model = "gpt-5.3-codex";
    store.value = { gh: { [model]: { input: 9, output: 99 } }, github: { [model]: { input: 7 } } };
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const canonical = { ...price("github", model), input: 7 };
    const alias = { ...price("gh", model), input: 9, output: 99, reasoning: 99 };
    expect(await repo.getPricingForModel("github", model)).toEqual(canonical);
    expect(await repo.getPricingForModel("gh", model)).toEqual(alias);
    const displayed = await repo.getPricing();
    expect(displayed.github[model]).toEqual(canonical);
    expect(displayed.gh[model]).toEqual(alias);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("recognizes legacy gh saved tariffs from canonical github billing", async () => {
    store.value = { gh: { "gpt-5.3-codex": { input: 9, output: 99 } } };
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const expected = { ...price("github", "gpt-5.3-codex"), input: 9, output: 99, reasoning: 99 };
    expect(await repo.getPricingForModel("github", "gpt-5.3-codex")).toEqual(expected);
    expect((await repo.getPricing()).github?.["gpt-5.3-codex"]).toEqual(expected);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("retains partial saved component tariffs above the inherited long-context threshold", async () => {
    store.value = { openai: { "gpt-6.1-sol": { input: 9, output: 99 } } };
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const pricing = await repo.getPricingForModel("openai", "gpt-6.1-sol");
    const tokens = { prompt_tokens: 300000, cached_tokens: 100000, cache_write_tokens: 50000, cache_write_30m_tokens: 50000, completion_tokens: 10000, reasoning_tokens: 6000 };
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(2.61, 12);
    const cost = calculateCostBreakdown(tokens, pricing);
    expect(cost.inputCost).toBeCloseTo(1.35, 12);
    expect(cost.cachedCost).toBeCloseTo(0.02, 12);
    expect(cost.cacheCreationCost).toBeCloseTo(0.25, 12);
    expect(cost.outputCost).toBeCloseTo(0.396, 12);
    expect(cost.reasoningCost).toBeCloseTo(0.594, 12);
    expect(cost.totalCost).toBeCloseTo(2.61, 12);
  });

  it("preserves a separately saved zero reasoning tariff above an inherited output tier", async () => {
    store.value = { openai: { "gpt-6.1-sol": { reasoning: 0 } } };
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const pricing = await repo.getPricingForModel("openai", "gpt-6.1-sol");
    const tokens = { prompt_tokens: 300000, completion_tokens: 10000, reasoning_tokens: 6000 };
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(1.26, 12);
    expect(calculateCostBreakdown(tokens, pricing).reasoningCost).toBe(0);
  });

  it("merges a saved partial tier without dropping inherited tariffs or overriding explicit tier fields", async () => {
    store.value = { openai: { "gpt-6.1-sol": { input: 9, output: 99, tier: { output: 7 } } } };
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const pricing = await repo.getPricingForModel("openai", "gpt-6.1-sol");
    const before = structuredClone(store.value);
    const tokens = { prompt_tokens: 300000, cached_tokens: 100000, cache_write_tokens: 50000, cache_write_30m_tokens: 50000, completion_tokens: 10000, reasoning_tokens: 6000 };
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(1.69, 12);
    const cost = calculateCostBreakdown(tokens, pricing);
    expect(cost.inputCost).toBeCloseTo(1.35, 12);
    expect(cost.cachedCost).toBeCloseTo(0.02, 12);
    expect(cost.cacheCreationCost).toBeCloseTo(0.25, 12);
    expect(cost.outputCost).toBeCloseTo(0.028, 12);
    expect(cost.reasoningCost).toBeCloseTo(0.042, 12);
    expect(cost.totalCost).toBeCloseTo(1.69, 12);
    expect(store.value).toEqual(before);
  });

  it("keeps a saved one-hour write tariff over an inherited long-context tariff", async () => {
    store.value = { anthropic: { "claude-haiku-5-5": { cache_creation_1h: 0 } } };
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const pricing = await repo.getPricingForModel("anthropic", "claude-haiku-5-5");
    const tokens = { prompt_tokens: 200000, cache_creation_input_tokens: 200000, cache_creation_1h_tokens: 200000, completion_tokens: 0 };
    expect(calculateCostFromTokens(tokens, pricing)).toBe(0);
    expect(calculateCostBreakdown(tokens, pricing).cacheCreationCost).toBe(0);
  });
});
