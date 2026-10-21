import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateCostFromTokens } from "../../open-sse/providers/pricing.js";

const fixture = vi.hoisted(() => ({ prices: {} }));
vi.mock("../../src/lib/db/helpers/kvStore.js", () => ({ makeKv: () => ({ getAll: async () => fixture.prices }) }));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter() { throw new Error("Unexpected state write"); } }));

beforeEach(() => { fixture.prices = {}; vi.resetModules(); });
afterEach(() => vi.resetModules());

describe("published future price transitions use the recorded quote date", () => {
  it.each([
    ["2026-11-30T23:59:59Z", 0.012],
    ["2026-12-01T00:00:00Z", 0.024],
  ])("selects the native Argon %s reference without changing old recorded costs", async (timestamp, expected) => {
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const price = await repo.getPricingForModel("gemini", "gemini-4-argon", { timestamp });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, price)).toBeCloseTo(expected, 12);
  });

  it.each(["gemini", "vertex"])("uses the published %s Flash post-promotion cache rate rather than leaving the old promo forever", async provider => {
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const before = await repo.getPricingForModel(provider, "gemini-3.8-flash", { timestamp: "2026-12-31T12:00:00Z" });
    const after = await repo.getPricingForModel(provider, "gemini-3.8-flash", { timestamp: "2027-01-01T12:00:00Z" });
    const tokens = { prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 10000, reasoning_tokens: 6000 };
    expect(calculateCostFromTokens(tokens, before)).toBeCloseTo(0.099, 12);
    expect(calculateCostFromTokens(tokens, after)).toBeCloseTo(0.198, 12);
  });

  it("keeps operator zero/null overrides above a dated future quote", async () => {
    fixture.prices = { gemini: { "gemini-4-argon": { input: 0, output: null } } };
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const price = await repo.getPricingForModel("gemini", "gemini-4-argon", { timestamp: "2026-12-02T12:00:00Z" });
    expect(price).toMatchObject({ input: 0, output: null, cached: 0.2 });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, price)).toBeNull();
  });

  it("does not confuse a guaranteed-minimum promotion date with a price expiry", async () => {
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const price = await repo.getPricingForModel("openai", "gpt-5.6-sol", { timestamp: "2026-11-22T12:00:00Z" });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, price)).toBeCloseTo(0.024, 12);
  });

  it("does not roll a nonexistent November date into the next published tariff", async () => {
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const price = await repo.getPricingForModel("gemini", "gemini-4-argon", { timestamp: "2026-11-31T02:00:00Z" });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, price)).toBeNull();
  });
});
