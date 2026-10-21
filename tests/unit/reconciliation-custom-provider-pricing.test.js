import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousAdapter, listeners, repo, nodes, custom;
const provider = "openai-compatible-chat-synthetic-tokenharbor";
const models = ["mimo-v2.6-flash:free", "deepseek-v4.1-flash:free"];

beforeEach(async () => {
  directory = await mkdtemp("/tmp/opencode/custom-price-reconciliation-");
  previousAdapter = global._dbAdapter;
  listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  vi.stubEnv("DATA_DIR", join(directory, "data"));
  vi.stubEnv("TMPDIR", directory);
  delete global._dbAdapter;
  vi.resetModules();
  repo = await import("../../src/lib/db/repos/pricingRepo.js");
  nodes = await import("../../src/lib/db/repos/nodesRepo.js");
  custom = await import("../../src/lib/db/repos/aliasRepo.js");
  await nodes.createProviderNode({ id: provider, name: "Operator label", type: "openai-compatible", prefix: "harbor", baseUrl: "https://tokenharbor.ai/v1", apiType: "chat" });
});

afterEach(async () => {
  await global._dbAdapter?.instance?.close();
  for (const event of events) for (const listener of process.listeners(event)) {
    if (!listeners.get(event).has(listener)) process.removeListener(event, listener);
  }
  if (previousAdapter === undefined) delete global._dbAdapter;
  else global._dbAdapter = previousAdapter;
  vi.unstubAllEnvs(); vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("host-scoped custom provider pricing", () => {
  it.each(models)("prices the publicly never-billed route %s as free, including cache and reasoning", async model => {
    const tariff = await repo.getPricingForModel(provider, model);
    const { calculateCostBreakdown } = await import("../../open-sse/providers/pricing.js");
    expect(tariff).toMatchObject({ input: 0, cached: 0, output: 0, reasoning: 0, cache_creation: 0 });
    expect(calculateCostBreakdown({ prompt_tokens: 1000, cached_tokens: 500, completion_tokens: 100, reasoning_tokens: 20 }, tariff).totalCost).toBe(0);
  });

  it.each(["http://tokenharbor.ai/v1", "https://tokenharbor.ai.attacker.example/v1", "https://attacker.example/tokenharbor.ai", "https://user:password@tokenharbor.ai/v1"])("never derives a free quote from a lookalike or untrusted base URL %s", async baseUrl => {
    await nodes.updateProviderNode(provider, { name: "TokenHarbor", prefix: "thbr", baseUrl });
    const tariff = await repo.getPricingForModel(provider, "mimo-v2.6-flash:free");
    expect(tariff?.input).not.toBe(0);
    expect(tariff?.output).not.toBe(0);
  });

  it("does not generalize the :free suffix to an unknown model or provider", async () => {
    expect(await repo.getPricingForModel(provider, "unverified-model:free")).toBeNull();
    expect(await repo.getPricingForModel("unknown-provider", "mimo-v2.6-flash:free")).toBeNull();
  });

  it("keeps operator price and explicit unknown overrides above the public quote", async () => {
    await repo.updatePricing({ [provider]: {
      "mimo-v2.6-flash:free": { input: 2, output: 4 },
      "deepseek-v4.1-flash:free": { input: null },
    } });
    expect(await repo.getPricingForModel(provider, "mimo-v2.6-flash:free")).toMatchObject({ input: 2, output: 4, cached: 0 });
    expect(await repo.getPricingForModel(provider, "deepseek-v4.1-flash:free")).toMatchObject({ input: null, output: 0 });
  });

  it("exposes configured custom routes in effective pricing without writing public references as overrides", async () => {
    await custom.addCustomModel({ providerAlias: provider, id: "mimo-v2.6-flash:free", type: "llm" });
    const { GET } = await import("../../src/app/api/pricing/route.js");
    const data = await (await GET(new Request("http://localhost/api/pricing"))).json();
    expect(data[provider]?.["mimo-v2.6-flash:free"]).toMatchObject({ input: 0, output: 0 });
    expect(await repo.getSavedPricing()).toEqual({});
  });

  it("uses a changed provider URL immediately instead of retaining a previous host's free quote", async () => {
    expect((await repo.getPricingForModel(provider, models[0]))?.input).toBe(0);
    await nodes.updateProviderNode(provider, { baseUrl: "https://unverified.example/v1" });
    expect((await repo.getPricingForModel(provider, models[0]))?.input).not.toBe(0);
  });

  it.each(["MIMO-V2.6-FLASH:FREE", "DEEPSEEK-V4.1-FLASH:FREE"])("does not expand literal free quotes to an unverified case variant %s", async model => {
    const tariff = await repo.getPricingForModel(provider, model);
    expect(tariff?.input).not.toBe(0);
    expect(tariff?.output).not.toBe(0);
  });

  it("resolves saved-only custom rows identically for the editor and runtime", async () => {
    await repo.updatePricing({ [provider]: { [models[1]]: { input: null } } });
    const data = await repo.getConfiguredPricing();
    expect(data[provider][models[1]]).toEqual(await repo.getPricingForModel(provider, models[1]));
    expect(data[provider][models[1]]).toMatchObject({ input: null, output: 0, cached: 0 });
  });

  it("keeps native cache-write components zero under a never-billed route without claiming feature support", async () => {
    const { calculateCostBreakdown } = await import("../../open-sse/providers/pricing.js");
    const tariff = await repo.getPricingForModel(provider, models[0]);
    const cost = calculateCostBreakdown({ prompt_tokens: 1000, completion_tokens: 10,
      cache_write_tokens: 300, cache_write_30m_tokens: 100, cache_write_12h_tokens: 200 }, tariff);
    expect(cost.totalCost).toBe(0);
  });

  it("exposes each registered model's effective or explicitly unknown quote without saving defaults as overrides", async () => {
    const { default: registry } = await import("../../open-sse/providers/registry/index.js");
    const effective = await repo.getConfiguredPricing();
    const missing = [];
    for (const provider of registry) for (const model of provider.models || []) {
      if (!Object.hasOwn(effective[provider.id] || {}, model.id)) missing.push(`${provider.id}/${model.id}`);
    }
    expect(missing).toEqual([]);
    expect(await repo.getSavedPricing()).toEqual({});
  });
});
