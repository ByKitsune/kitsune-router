import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousAdapter, listeners, repo, nodes, custom;
beforeEach(async () => {
  directory = await mkdtemp("/tmp/opencode/refresh-pricing-identity-");
  previousAdapter = global._dbAdapter;
  listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  vi.stubEnv("DATA_DIR", join(directory, "data")); vi.stubEnv("TMPDIR", directory);
  delete global._dbAdapter; vi.resetModules();
  repo = await import("../../src/lib/db/repos/pricingRepo.js");
  nodes = await import("../../src/lib/db/repos/nodesRepo.js");
  custom = await import("../../src/lib/db/repos/aliasRepo.js");
});
afterEach(async () => {
  await global._dbAdapter?.instance?.close();
  for (const event of events) for (const listener of process.listeners(event)) if (!listeners.get(event).has(listener)) process.removeListener(event, listener);
  if (previousAdapter === undefined) delete global._dbAdapter; else global._dbAdapter = previousAdapter;
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("effective pricing retains literal override and native provider ownership", () => {
  it("inherits peak defaults from the base model beneath an exact annotated partial override", async () => {
    await repo.updatePricing({ deepseek: { "deepseek-flash(high)": { input: 9 } } });
    const quote = await repo.getPricingForModel("deepseek", "deepseek-flash(high)", { timestamp: "2026-10-21T02:00:00Z" });
    expect(quote).toMatchObject({ input: 9, output: 1.2, cached: 0.006, reasoning: 1.2 });
    expect(quote.cache_creation ?? null).toBeNull();
  });

  it("inherits dated future defaults beneath an exact annotated zero override", async () => {
    await repo.updatePricing({ gemini: { "gemini-4-argon(high)": { cached: 0 } } });
    const quote = await repo.getPricingForModel("gemini", "gemini-4-argon(high)", { timestamp: "2026-12-02T00:00:00Z" });
    expect(quote).toMatchObject({ input: 4, output: 20, cached: 0, reasoning: 20 });
  });

  it("preserves an independently quoted literal annotated product above its base tariff", async () => {
    const { PROVIDER_PRICING } = await import("../../open-sse/providers/pricing.js");
    PROVIDER_PRICING["literal-pricing-fixture"] = { audit: { input: 1, output: 2 }, "audit(high)": { input: 7, output: 8 } };
    try {
      await repo.updatePricing({ "literal-pricing-fixture": { "audit(high)": { output: 9 } } });
      expect(await repo.getPricingForModel("literal-pricing-fixture", "audit(high)")).toMatchObject({ input: 7, output: 9 });
    } finally { delete PROVIDER_PRICING["literal-pricing-fixture"]; }
  });

  it("does not let a custom native-prefix collision steal the current native schedule", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-21T02:00:00Z"));
    const id = "openai-compatible-chat-collision-fixture";
    await nodes.createProviderNode({ id, name: "Synthetic collision", type: "openai-compatible", prefix: "deepseek", baseUrl: "https://unverified.example/v1", apiType: "chat" });
    const pricing = await repo.getConfiguredPricing();
    expect(pricing.deepseek["deepseek-flash"]).toMatchObject({ input: 0.3, output: 1.2, cached: 0.006 });
    expect(pricing[id]?.["deepseek-flash"]).toBeUndefined();
  });

  it("preserves an operator's literal __proto__ model as an own key through effective JSON", async () => {
    const id = "openai-compatible-chat-literal-key-fixture";
    await nodes.createProviderNode({ id, name: "Synthetic literal", type: "openai-compatible", prefix: "literal", baseUrl: "https://unverified.example/v1", apiType: "chat" });
    await custom.addCustomModel({ providerAlias: id, id: "__proto__", type: "llm" });
    const pricing = JSON.parse(JSON.stringify(await repo.getConfiguredPricing()));
    expect(Object.hasOwn(pricing[id], "__proto__")).toBe(true);
    await repo.updatePricing({ [id]: JSON.parse('{"__proto__":{"input":0,"output":2}}') });
    const saved = (await repo.getSavedPricing())[id];
    expect(Object.hasOwn(saved, "__proto__")).toBe(true);
    expect(saved["__proto__"].input).toBe(0);
    expect(await repo.getPricingForModel(id, "__proto__")).toMatchObject({ input: 0, output: 2 });
    expect({}.input).toBeUndefined();
  });
});
