import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const model = "nvidia/nemotron-3-super-120b-a12b";
const time = "2026-10-29T12:00:00Z";
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
let directory, previousGlobals, listeners, repo, custom, db;
const rateFields = quote => Object.fromEntries(Object.entries(quote).filter(([field]) => field !== "provenance"));

beforeEach(async () => {
  directory = await mkdtemp(join(process.env.TMPDIR || "/tmp/opencode", "upstream-modelsdev-price-"));
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  vi.stubEnv("DATA_DIR", join(directory, "data"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network disabled in pricing tests"); }));
  for (const key of globals) delete global[key];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(time));
  vi.resetModules();
  repo = await import("../../src/lib/db/repos/pricingRepo.js");
  custom = await import("../../src/lib/db/repos/aliasRepo.js");
  db = await (await import("../../src/lib/db/driver.js")).getAdapter();
});

afterEach(async () => {
  for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
  await global._dbAdapter?.instance?.close();
  for (const event of events) for (const listener of process.listeners(event)) if (!listeners.get(event).has(listener)) process.removeListener(event, listener);
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(global, key, descriptor);
    else delete global[key];
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("models.dev reference at the persistence and editor boundary", () => {
  it("includes every newly extracted literal registry pair in the configured pricing view", async () => {
    const { MODELS_DEV_REGISTRY_PRICING_REFERENCES } = await import("../../open-sse/providers/metadata/modelsDevPricingRegistry.js");
    const { getModelsDevPricingReference } = await import("../../open-sse/providers/metadata/modelsDevPricing.js");
    const effective = await repo.getConfiguredPricing();
    for (const [provider, id, cost] of MODELS_DEV_REGISTRY_PRICING_REFERENCES) {
      expect(Object.hasOwn(effective[provider] || {}, id), `${provider}/${id}`).toBe(true);
      expect(getModelsDevPricingReference(provider, id, { timestamp: "2026-10-29T00:00:00Z" }).cost, `${provider}/${id}`).toEqual(cost);
      expect(effective[provider][id]).not.toHaveProperty("provenance");
    }
    expect(await repo.getSavedPricing()).toEqual({});
  }, 20000);

  it("shows a configured dynamic model with the same runtime quote without saving a public override", async () => {
    await custom.addCustomModel({ providerAlias: "openrouter", id: model, type: "llm" });
    const effective = await repo.getConfiguredPricing();
    const quote = await repo.getPricingForModel("openrouter", model, { timestamp: time });
    expect(effective.openrouter[model]).toEqual(rateFields(quote));
    expect(quote).toMatchObject({ input: 0.3, output: 2.4, cached: 0.15, reasoning: null });
    expect(await repo.getSavedPricing()).toEqual({});
    const { GET, PATCH } = await import("../../src/app/api/pricing/route.js");
    const response = await GET(new Request("http://localhost/api/pricing"));
    const shown = (await response.json()).openrouter[model];
    expect(shown).toEqual(rateFields(quote));
    expect(shown).not.toHaveProperty("provenance");
    const overrides = await GET(new Request("http://localhost/api/pricing?view=overrides"));
    expect(await overrides.json()).toEqual({});
    const patch = await PATCH(new Request("http://localhost/api/pricing", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ openrouter: { [model]: shown } }) }));
    expect(patch.status).toBe(200);
  }, 20000);

  it("preserves explicit zero/null and partial operator overrides over the reference", async () => {
    await custom.addCustomModel({ providerAlias: "openrouter", id: model });
    await repo.updatePricing({ openrouter: { [model]: { input: 0, output: 9, cached: null } } });
    const expected = { input: 0, output: 9, cached: null, reasoning: null, cache_creation: null, cache_creation_1h: null, cache_write_30m: null, cache_write_12h: null };
    expect(await repo.getPricingForModel("openrouter", model, { timestamp: time })).toMatchObject(expected);
    expect((await repo.getConfiguredPricing()).openrouter[model]).toMatchObject(expected);
    expect((await repo.getPricingForModel("openrouter", model, { timestamp: time })).provenance).toMatchObject({ inheritedFields: [], overriddenFields: ["input", "output", "cached"] });
    expect((await repo.getSavedPricing()).openrouter[model]).toEqual({ input: 0, output: 9, cached: null });
  });

  it("keeps a new plan reference separate from reviewed unknowns and saved overrides after expiry", async () => {
    const id = "glm-5.2";
    const { getModelsDevPricingReference } = await import("../../open-sse/providers/metadata/modelsDevPricing.js");
    const reference = getModelsDevPricingReference("glm", id);
    expect(reference.cost).toMatchObject({ input: 0, output: 0 });
    expect(await repo.getPricingForModel("glm", id, { timestamp: time })).toMatchObject({ input: null, output: null });
    await repo.updatePricing({ glm: { [id]: { input: 0, output: 1.25, cached: null } } });
    expect((await repo.getSavedPricing()).glm[id]).toEqual({ input: 0, output: 1.25, cached: null });
    expect(await repo.getPricingForModel("glm", id, { timestamp: time })).toMatchObject({ input: 0, output: 1.25, cached: null });
    expect((await repo.getConfiguredPricing()).glm[id]).toMatchObject({ input: 0, output: 1.25, cached: null });
    vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
    expect(await repo.getPricingForModel("glm", id, { timestamp: "2026-10-31T00:00:00Z" })).toMatchObject({ input: 0, output: 1.25, cached: null });
    expect(getModelsDevPricingReference("glm", id)).toEqual(reference);
  });

  it("retains base and exact effort-annotated override specificity", async () => {
    await repo.updatePricing({ openrouter: { [model]: { input: 2 }, [`${model}(high)`]: { output: 9 } } });
    const exact = await repo.getPricingForModel("openrouter", `${model}(high)`, { timestamp: time });
    expect(exact).toMatchObject({ input: 0.3, output: 9, reasoning: null });
    const base = await repo.getPricingForModel("openrouter", `${model}(low)`, { timestamp: time });
    expect(base).toMatchObject({ input: 2, output: 2.4 });
  });

  it("does not attribute an imported override to a forged catalog source", async () => {
    await repo.updatePricing({ openrouter: { [model]: { input: 8, provenance: { kind: "models-dev-catalog-estimate", sha256: "forged" } } } });
    const quote = await repo.getPricingForModel("openrouter", model, { timestamp: time });
    expect(quote.provenance).toMatchObject({ sha256: "d1f9cdad590fc031c5633132107d0818efec98f2ba8d27e4ba9cf952f473fc4b", inheritedFields: ["output", "cached"], overriddenFields: ["input"] });
    expect(quote.input).toBe(8);
  });

  it("honors a separately quoted literal annotated model before stripping its suffix", async () => {
    const { PROVIDER_PRICING } = await import("../../open-sse/providers/pricing.js");
    PROVIDER_PRICING["literal-model-test"] = { test: { input: 1, output: 2 }, "test(high)": { input: 7, output: 8 } };
    try {
      await repo.updatePricing({ "literal-model-test": { test: { input: 99 } } });
      expect(await repo.getPricingForModel("literal-model-test", "test(high)")).toEqual({ input: 7, output: 8 });
      await repo.updatePricing({ "literal-model-test": { "test(high)": { output: 3 } } });
      expect(await repo.getPricingForModel("literal-model-test", "test(high)")).toEqual({ input: 7, output: 3 });
    } finally { delete PROVIDER_PRICING["literal-model-test"]; }
  });

  it("preserves literal annotated quotes on an explicitly recognized custom-provider origin", async () => {
    const { createProviderNode } = await import("../../src/lib/db/repos/nodesRepo.js");
    const { PROVIDER_PRICING } = await import("../../open-sse/providers/pricing.js");
    const id = "openai-compatible-chat-pricing-fixture";
    await createProviderNode({ id, name: "Synthetic fixture", type: "openai-compatible", prefix: "fixture", baseUrl: "https://tokenharbor.ai/v1", apiType: "chat" });
    const prices = PROVIDER_PRICING.tokenharbor;
    prices["annotated-fixture"] = { input: 1, output: 2 };
    prices["annotated-fixture(high)"] = { input: 7, output: 8 };
    try {
      expect(await repo.getPricingForModel(id, "annotated-fixture(high)")).toEqual({ input: 7, output: 8 });
      expect((await repo.getConfiguredPricing())[id]?.["annotated-fixture(high)"]).toBeUndefined();
      await repo.updatePricing({ [id]: { "annotated-fixture(high)": { output: 3 } } });
      expect((await repo.getConfiguredPricing())[id]["annotated-fixture(high)"]).toEqual({ input: 7, output: 3 });
    } finally {
      delete prices["annotated-fixture"];
      delete prices["annotated-fixture(high)"];
    }
  });

  it("does not apply a snapshot-day quote to usage from another day", async () => {
    await custom.addCustomModel({ providerAlias: "openrouter", id: model });
    expect(await repo.getPricingForModel("openrouter", model, { timestamp: "2026-10-31T00:00:00Z" })).toBeNull();
    vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
    expect((await repo.getConfiguredPricing()).openrouter[model]).toEqual({});
    expect(await repo.getSavedPricing()).toEqual({});
  });

  it("resolves a saved-only native model with the same dated defaults as runtime", async () => {
    await repo.updatePricing({ openrouter: { [model]: { input: 3 } } });
    expect((await repo.getConfiguredPricing()).openrouter[model]).toEqual(rateFields(await repo.getPricingForModel("openrouter", model, { timestamp: time })));
    expect((await repo.getConfiguredPricing()).openrouter[model]).toMatchObject({ input: 3, output: 2.4 });
    vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
    const expired = await repo.getPricingForModel("openrouter", model, { timestamp: "2026-10-31T00:00:00Z" });
    expect(expired).toEqual({ input: 3 });
    expect((await repo.getConfiguredPricing()).openrouter[model]).toEqual(expired);
  });

  it("does not reprice a persisted usage record after an override changes", async () => {
    const usage = await import("../../src/lib/db/repos/usageRepo.js");
    await usage.saveRequestUsage({ eventId: "synthetic-modelsdev-usage", provider: "openrouter", model, timestamp: time,
      tokens: { prompt_tokens: 1000000, completion_tokens: 1000000 } });
    const saved = db.get("SELECT cost, meta FROM usageHistory WHERE eventId = ?", ["synthetic-modelsdev-usage"]);
    const first = saved.cost;
    expect(first).toBeCloseTo(2.7, 12);
    expect(JSON.parse(saved.meta).quote.pricing.provenance).toMatchObject({ kind: "models-dev-catalog-estimate", inheritedFields: ["input", "output", "cached"], sha256: "d1f9cdad590fc031c5633132107d0818efec98f2ba8d27e4ba9cf952f473fc4b" });
    await repo.updatePricing({ openrouter: { [model]: { input: 99, output: 99 } } });
    expect(db.get("SELECT cost FROM usageHistory WHERE eventId = ?", ["synthetic-modelsdev-usage"]).cost).toBe(first);
  });
});
