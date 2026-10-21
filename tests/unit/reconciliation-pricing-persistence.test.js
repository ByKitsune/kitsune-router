import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousAdapter, listeners, route, repo, db;

beforeEach(async () => {
  directory = await mkdtemp("/tmp/opencode/pricing-reconciliation-");
  previousAdapter = global._dbAdapter;
  listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  vi.stubEnv("DATA_DIR", join(directory, "data"));
  vi.stubEnv("TMPDIR", directory);
  delete global._dbAdapter;
  vi.resetModules();
  route = await import("../../src/app/api/pricing/route.js");
  repo = await import("../../src/lib/db/repos/pricingRepo.js");
  db = await (await import("../../src/lib/db/driver.js")).getAdapter();
});

afterEach(async () => {
  await global._dbAdapter?.instance?.close();
  for (const event of events) for (const listener of process.listeners(event)) {
    if (!listeners.get(event).has(listener)) process.removeListener(event, listener);
  }
  if (previousAdapter === undefined) delete global._dbAdapter;
  else global._dbAdapter = previousAdapter;
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

const patch = body => route.PATCH(new Request("http://localhost/api/pricing", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));

describe("delivered-tier pricing through HTTP validation and SQLite", () => {
  it("round-trips independent premium tariffs and explicit unknown components", async () => {
    const tariff = { input: 2, output: 10, cached: 0.1,
      service_tiers: { fast: { input: 4, output: 20, cached: 0, tier: { threshold: 200000, input: 8 } }, ultrafast: null } };
    const response = await patch({ fixture: { model: tariff } });
    expect(response.status).toBe(200);
    expect((await response.json()).fixture.model).toEqual(tariff);
    expect(JSON.parse(db.get("SELECT value FROM kv WHERE scope='pricing' AND key='fixture'").value).model).toEqual(tariff);
    const saved = await (await route.GET(new Request("http://localhost/api/pricing?view=overrides"))).json();
    expect(saved.fixture.model).toEqual(tariff);
    const effective = await repo.getPricingForModel("fixture", "model");
    const { calculateCostFromTokens } = await import("../../open-sse/providers/pricing.js");
    expect(calculateCostFromTokens({ prompt_tokens: 100000, completion_tokens: 1000, actualServiceTier: "fast", serviceTierCostStatus: "unpriced" }, effective)).toBeCloseTo(0.42, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 100000, completion_tokens: 1000, actualServiceTier: "ultrafast", serviceTierCostStatus: "unpriced" }, effective)).toBeNull();
  });

  it.each([
    { service_tiers: [] },
    { service_tiers: { turbo: { input: 1 } } },
    { service_tiers: { fast: [] } },
    { service_tiers: { fast: { input: -1 } } },
    { service_tiers: { fast: { output: "20" } } },
    { service_tiers: { fast: { service_tiers: {} } } },
    { service_tiers: { fast: { tier: { threshold: 0 } } } },
  ])("rejects malformed nested pricing without replacing prior rates: %j", async invalid => {
    await repo.updatePricing({ fixture: { model: { input: 2, output: 10 } } });
    expect((await patch({ fixture: { model: invalid } })).status).toBe(400);
    expect((await repo.getSavedPricing()).fixture.model).toEqual({ input: 2, output: 10 });
  });

  it("merges a partial saved premium quote only with that delivered tier's static quote", async () => {
    const { PROVIDER_PRICING, calculateCostBreakdown } = await import("../../open-sse/providers/pricing.js");
    PROVIDER_PRICING["tier-reconciliation-fixture"] = { model: {
      input: 2, output: 10, cached: 0.1,
      service_tiers: { fast: { input: 4, output: 20, cached: 0.2, tier: { threshold: 200000, input: 8, output: 30 } } },
    } };
    try {
      await repo.updatePricing({ "tier-reconciliation-fixture": { model: { input: 9, service_tiers: { fast: { cached: 0, tier: { output: 0 } } } } } });
      const effective = await repo.getPricingForModel("tier-reconciliation-fixture", "model");
      expect(effective.service_tiers.fast).toMatchObject({ input: 4, output: 20, cached: 0, tier: { threshold: 200000, input: 8, output: 0 } });
      const cost = calculateCostBreakdown({ prompt_tokens: 300000, cached_tokens: 100000, completion_tokens: 10000, actualServiceTier: "fast", serviceTierCostStatus: "unpriced" }, effective);
      expect(cost.totalCost).toBeCloseTo(1.6, 12);
      expect(effective.input).toBe(9);
    } finally {
      delete PROVIDER_PRICING["tier-reconciliation-fixture"];
    }
  });

  it("preserves explicit unknown input and reasoning overrides above an inherited context tier", async () => {
    await repo.updatePricing({ openai: { "gpt-6.1-sol": { input: null, output: 9, reasoning: null } } });
    const tariff = await repo.getPricingForModel("openai", "gpt-6.1-sol");
    const { calculateCostBreakdown } = await import("../../open-sse/providers/pricing.js");
    const cost = calculateCostBreakdown({ prompt_tokens: 300000, completion_tokens: 1000, reasoning_tokens: 500 }, tariff);
    expect(tariff.reasoning).toBeNull();
    expect(cost.inputCost).toBeNull();
    expect(cost.reasoningCost).toBeNull();
    expect(cost.totalCost).toBeNull();
  });

  it("uses an operator's complete output quote for output-billed reasoning above an unknown static quote", async () => {
    await repo.updatePricing({ antigravity: { "gemini-4-argon": { output: 9 } } });
    const tariff = await repo.getPricingForModel("antigravity", "gemini-4-argon");
    const { calculateCostBreakdown } = await import("../../open-sse/providers/pricing.js");
    expect(calculateCostBreakdown({ prompt_tokens: 0, completion_tokens: 100, reasoning_tokens: 60 }, tariff).totalCost).toBeCloseTo(0.0009, 12);
    await repo.updatePricing({ antigravity: { "gemini-4-argon": { output: 9, reasoning: null } } });
    expect(calculateCostBreakdown({ prompt_tokens: 0, completion_tokens: 100, reasoning_tokens: 60 }, await repo.getPricingForModel("antigravity", "gemini-4-argon")).totalCost).toBeNull();
  });
});
