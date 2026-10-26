import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateCostBreakdown, calculateCostFromTokens, getPricingForModel as price } from "../../open-sse/providers/pricing.js";

const store = vi.hoisted(() => ({ value: {}, adapter: null, getAdapter: vi.fn(), read: vi.fn(), getAll: vi.fn(), write: vi.fn(() => { throw Error("Unexpected DB write"); }) }));
vi.mock("../../src/lib/db/helpers/kvStore.js", () => ({ makeKv: () => ({ getAll: store.getAll, set: store.write, setMany: store.write, remove: store.write, clear: store.write }) }));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: store.getAdapter }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  store.value = {};
  store.getAll.mockImplementation(async () => store.value);
  store.read.mockImplementation((sql, keys) => {
    expect([["cacheRevision:pricing"], ["cacheRevision:nodes", "cacheRevision:pricing"]]).toContainEqual(keys);
    expect(sql).toBe(`SELECT key, value FROM _meta WHERE key IN (${keys.map(() => "?").join(",")})`);
    return keys.map(key => ({ key, value: "0" }));
  });
  store.adapter = { all: store.read, run: store.write, exec: store.write, transaction: store.write, pragma: store.write, close: vi.fn() };
  store.getAdapter.mockResolvedValue(store.adapter);
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Unexpected network request"); }));
});
afterEach(() => {
  try {
    expect(store.getAdapter).toHaveBeenCalled();
    expect(store.read).toHaveBeenCalledWith("SELECT key, value FROM _meta WHERE key IN (?,?)", ["cacheRevision:nodes", "cacheRevision:pricing"]);
    expect(store.read).toHaveBeenCalledWith("SELECT key, value FROM _meta WHERE key IN (?)", ["cacheRevision:pricing"]);
    expect(store.write).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    store.adapter.close();
    vi.unstubAllGlobals();
  }
});

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
    const saved = await repo.getSavedPricing();
    expect(saved).toEqual(before);
    expect(saved).not.toBe(store.value);
    expect(saved.tr).not.toBe(store.value.tr);
    expect(saved.tr[model]).not.toBe(store.value.tr[model]);
    expect(Object.isFrozen(saved)).toBe(true);
    expect(Object.isFrozen(saved.tr)).toBe(true);
    expect(Object.isFrozen(saved.tr[model])).toBe(true);
    expect(() => { saved.tr[model].input = 11; }).toThrow(TypeError);
    expect(await repo.getSavedPricing()).toBe(saved);
    expect(store.getAll).toHaveBeenCalledTimes(1);
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
