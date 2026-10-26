import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
let directory, previous, db, adapter;

beforeEach(async () => {
  previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) delete globalThis[key];
  directory = await mkdtemp(join(tmpdir(), "zen-scoped-cache-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  adapter = await (await import("@/lib/db/driver.js")).getAdapter();
});

afterEach(async () => {
  await adapter?.close();
  for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

async function childWrite(code, dataDir = directory) {
  const root = pathToFileURL(`${process.cwd()}/`).href;
  const script = `
    import { registerHooks } from "node:module";
    registerHooks({ resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) specifier = new URL("src/" + specifier.slice(2), ${JSON.stringify(root)}).href;
      else if (specifier.startsWith("open-sse/")) specifier = new URL(specifier, ${JSON.stringify(root)}).href;
      return nextResolve(specifier, context);
    } });
    const { getAdapter, closeDb } = await import(new URL("src/lib/db/driver.js", ${JSON.stringify(root)}));
    const db = await getAdapter();
    const repos = await import(new URL("src/lib/db/index.js", ${JSON.stringify(root)}));
    try {
      const result = await (async () => { ${code} })();
      process.send({ result: result ?? null });
    } finally { await closeDb(); }
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    env: { PATH: process.env.PATH, HOME: dataDir, DATA_DIR: dataDir, TMPDIR: process.env.TMPDIR,
      MODEL_CATALOG_SYNC: "off", DISABLE_BACKGROUND_TOKEN_REFRESH: "1", KITSUNE_ROUTER_DISABLE_MITM: "1" },
    stdio: ["ignore", "pipe", "pipe", "ipc"], timeout: 10_000, killSignal: "SIGKILL",
  });
  let stderr = "", result;
  child.stdout.resume();
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-16_384); });
  child.on("message", message => { result = message.result; });
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (status, signal) => status === 0 ? resolve() : reject(new Error(stderr || `child exited ${status} (${signal})`)));
  });
  return result;
}

describe("bounded scoped configuration cache", () => {
  it("coalesces cold loads, preserves references and owns immutable nested credentials", async () => {
    const saved = await db.createProviderConnection({ provider: "cache-provider", authType: "apikey", name: "one", apiKey: "synthetic", providerSpecificData: { nested: { label: "saved" } } });
    const calls = vi.spyOn(adapter, "all");
    const [first, second] = await Promise.all([db.getProviderConnections({ provider: saved.provider }), db.getProviderConnections({ provider: saved.provider })]);
    expect(second).toBe(first);
    expect(calls.mock.calls.filter(([sql]) => sql.startsWith("SELECT * FROM providerConnections"))).toHaveLength(1);
    expect(() => { first[0].providerSpecificData.nested.label = "corrupt"; }).toThrow();
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData.nested.label).toBe("saved");
  });

  it("invalidates negative, list, id and renamed combo entries without discarding unrelated nodes", async () => {
    expect(await db.getComboByName("new-name")).toBeNull();
    const node = await db.createProviderNode({ type: "openai-compatible", name: "node", prefix: "n", baseUrl: "https://example.invalid" });
    const nodes = await db.getProviderNodes();
    const combo = await db.createCombo({ name: "old-name", models: ["n/one"] });
    expect(await db.getComboById(combo.id)).toMatchObject({ name: "old-name" });
    await db.updateCombo(combo.id, { name: "new-name", models: ["n/two"] });
    expect(await db.getComboByName("old-name")).toBeNull();
    expect(await db.getComboByName("new-name")).toMatchObject({ models: ["n/two"] });
    expect(await db.getProviderNodes()).toBe(nodes);
    await db.updateProviderNode(node.id, { type: "anthropic-compatible", prefix: "changed" });
    expect(await db.getProviderNodes({ type: "openai-compatible" })).toEqual([]);
    expect(await db.getProviderNodeById(node.id)).toMatchObject({ prefix: "changed" });
    await db.deleteCombo(combo.id);
    expect(await db.getCombos()).toEqual([]);
    await db.deleteProviderNode(node.id);
    expect(await db.getProviderNodeById(node.id)).toBeNull();
  });

  it("keeps configuration warm on round-robin writes and observes updated runtime fields", async () => {
    const a = await db.createProviderConnection({ provider: "a", authType: "apikey", name: "a" });
    await db.createProviderConnection({ provider: "b", authType: "apikey", name: "b" });
    await db.getProviderConnections({ provider: "a" });
    const b = await db.getProviderConnections({ provider: "b" });
    const { readScopeRevision } = await import("@/lib/db/helpers/scopedCache.js");
    const revision = readScopeRevision(adapter, ["connections"]);
    const calls = vi.spyOn(adapter, "all");
    await db.updateProviderConnection(a.id, { lastUsedAt: "2026-10-26T12:00:00Z", consecutiveUseCount: 2 });
    expect(await db.getProviderConnections({ provider: "a" })).toMatchObject([{ consecutiveUseCount: 2 }]);
    expect(calls.mock.calls.filter(([sql]) => sql.startsWith("SELECT * FROM providerConnections"))).toHaveLength(0);
    expect(readScopeRevision(adapter, ["connections"])).toBe(revision);
    expect(await db.getProviderConnections({ provider: "b" })).toBe(b);
    expect((await db.exportDb()).providerConnections.find(row => row.id === a.id).consecutiveUseCount).toBe(2);
  });

  it("rejects a delayed loader after a committed scope write and bounds entries/bytes", async () => {
    const { getScopedCache } = await import("@/lib/db/helpers/scopedCache.js");
    const { bumpScopeRevisions } = await import("@/lib/db/helpers/cacheRevisions.js");
    const cache = getScopedCache(adapter, "fixture", { maxEntries: 2, maxBytes: 256 });
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    let loads = 0;
    const loading = cache.get(["dataset", "access", "params"], ["fixture"], async () => {
      const value = ++loads;
      if (value === 1) await wait;
      return { value };
    });
    await Promise.resolve();
    adapter.transaction(() => bumpScopeRevisions(adapter, ["fixture"]));
    release();
    expect(await loading).toEqual({ value: 2 });
    for (let i = 0; i < 8; i++) await cache.get(["dataset", "access", i], ["fixture"], () => ({ i }));
    expect(cache.stats()).toMatchObject({ entries: 2 });
    expect(cache.stats().bytes).toBeLessThanOrEqual(256);
    expect(cache.stats().evictions).toBeGreaterThan(0);
  });

  it("invalidates an already-warm key/node across real processes sharing native SQLite", async () => {
    expect(adapter.driver).not.toBe("sql.js");
    const key = await db.createApiKey("child-key", "synthetic-machine");
    const node = await db.createProviderNode({ id: "child-node", type: "openai-compatible", name: "old", prefix: "old" });
    expect(await db.validateApiKey(key.key)).toBe(true);
    expect(await db.getProviderNodeById(node.id)).toMatchObject({ name: "old" });
    await childWrite(`db.transaction(() => { db.run("UPDATE apiKeys SET isActive = 0 WHERE id = ?", [${JSON.stringify(key.id)}]); db.run("UPDATE providerNodes SET name = ? WHERE id = ?", ["child", "child-node"]); })`);
    expect(await db.validateApiKey(key.key)).toBe(false);
    expect(await db.getProviderNodeById(node.id)).toMatchObject({ name: "child" });
  });

  it("keys model responses by parameters/access and ignores accounting/runtime-only writes", async () => {
    const { getCachedModelsResponse } = await import("@/lib/modelsResponseCache.js");
    const connection = await db.createProviderConnection({ provider: "catalog-fixture", authType: "apikey", name: "catalog" });
    let loads = 0;
    const load = () => [{ id: `model-${++loads}` }];
    const first = await getCachedModelsResponse(load, { params: { kind: "llm" }, access: "public" });
    expect(await getCachedModelsResponse(load, { params: { kind: "llm" }, access: "public" })).toBe(first);
    await db.updateProviderConnection(connection.id, { consecutiveUseCount: 1 });
    await db.saveRequestUsage({ provider: "catalog-fixture", model: "no-tariff", tokens: { prompt_tokens: 1 } });
    expect(await getCachedModelsResponse(load, { params: { kind: "llm" }, access: "public" })).toBe(first);
    expect(await getCachedModelsResponse(load, { params: { kind: "embedding" }, access: "public" })).not.toBe(first);
    expect(await getCachedModelsResponse(load, { params: { kind: "llm" }, access: "admin" })).not.toBe(first);
    await db.createCombo({ name: "catalog-change", models: ["catalog-fixture/one"] });
    expect(await getCachedModelsResponse(load, { params: { kind: "llm" }, access: "public" })).not.toBe(first);
  });

  it("fences stale credential commits against runtime-neutral import and credential replacement", async () => {
    const saved = await db.createProviderConnection({ provider: "fence", authType: "oauth", name: "account", accessToken: "old", refreshToken: "refresh" });
    const { _writeFence: expected } = await db.getProviderConnectionById(saved.id);
    await db.updateProviderConnection(saved.id, { lastUsedAt: new Date().toISOString() });
    await expect(db.updateProviderConnection(saved.id, { accessToken: "new" }, { expected })).resolves.toMatchObject({ accessToken: "new" });
    await expect(db.updateProviderConnection(saved.id, { accessToken: "stale" }, { expected })).rejects.toMatchObject({ code: "STALE_CONNECTION_WRITE" });
    const current = await db.getProviderConnectionById(saved.id);
    await db.importDb(await db.exportDb());
    await expect(db.updateProviderConnection(saved.id, { accessToken: "pre-import" }, { expected: current._writeFence })).rejects.toMatchObject({ code: "STALE_CONNECTION_WRITE" });
  });

  it("invalidates node create, type/routing update and delete across repository-writing processes", async () => {
    const id = "cross-process-node";
    expect(await db.getProviderNodeById(id)).toBeNull();
    const empty = await db.getProviderNodes({ type: "openai-compatible" });
    await childWrite(`await repos.createProviderNode({ id: ${JSON.stringify(id)}, type: "openai-compatible", name: "child-node", prefix: "before", baseUrl: "https://before.invalid/v1" });`);
    expect(await db.getProviderNodes({ type: "openai-compatible" })).not.toBe(empty);
    expect(await db.getProviderNodeById(id)).toMatchObject({ id, prefix: "before" });
    expect(await db.getProviderNodes({ type: "anthropic-compatible" })).toEqual([]);
    await childWrite(`await repos.updateProviderNode(${JSON.stringify(id)}, { type: "anthropic-compatible", prefix: "after", baseUrl: "https://after.invalid/v1" });`);
    expect(await db.getProviderNodes({ type: "openai-compatible" })).toEqual([]);
    expect(await db.getProviderNodes({ type: "anthropic-compatible" })).toMatchObject([{ id, prefix: "after", baseUrl: "https://after.invalid/v1" }]);
    await childWrite(`await repos.deleteProviderNode(${JSON.stringify(id)});`);
    expect(await db.getProviderNodeById(id)).toBeNull();
    expect(await db.getProviderNodes()).toEqual([]);
  });

  it("invalidates combo create, rename, ordered members and delete across repository-writing processes", async () => {
    expect(await db.getComboByName("child-before")).toBeNull();
    expect(await db.getComboByName("child-after")).toBeNull();
    expect(await db.getCombos()).toEqual([]);
    const combo = await childWrite('return await repos.createCombo({ name: "child-before", models: ["provider/first", "provider/second"] });');
    expect(await db.getComboById(combo.id)).toMatchObject({ name: "child-before", models: ["provider/first", "provider/second"] });
    expect(await db.getCombos()).toHaveLength(1);
    await childWrite(`await repos.updateCombo(${JSON.stringify(combo.id)}, { name: "child-after", models: ["provider/second", "provider/first", "provider/third"] });`);
    expect(await db.getComboByName("child-before")).toBeNull();
    expect(await db.getComboByName("child-after")).toMatchObject({ id: combo.id, models: ["provider/second", "provider/first", "provider/third"] });
    expect(await db.getComboById(combo.id)).toMatchObject({ name: "child-after" });
    await childWrite(`await repos.deleteCombo(${JSON.stringify(combo.id)});`);
    expect(await db.getCombos()).toEqual([]);
    expect(await db.getComboById(combo.id)).toBeNull();
    expect(await db.getComboByName("child-after")).toBeNull();
  });

  it("refreshes credential, active, priority and routing filters across repository-writing processes", async () => {
    const first = await db.createProviderConnection({ provider: "tenant-a", authType: "oauth", name: "first", accessToken: "old-token", providerSpecificData: { strictProxy: true, vercelRelayUrl: "https://old.invalid" } });
    const sibling = await db.createProviderConnection({ provider: "tenant-a", authType: "apikey", name: "sibling", apiKey: "synthetic-sibling" });
    const other = await db.createProviderConnection({ provider: "tenant-b", authType: "apikey", name: "other", apiKey: "synthetic-other" });
    const filters = [{}, { provider: "tenant-a" }, { provider: "tenant-a", isActive: true }, { provider: "tenant-a", isActive: false }, { provider: "tenant-b", isActive: true }];
    for (const filter of filters) await db.getProviderConnections(filter);
    const otherWarm = await db.getProviderConnections(filters[4]);
    const selected = await db.getProviderConnectionById(first.id);
    const inserted = await childWrite('return await repos.createProviderConnection({ provider: "tenant-a", authType: "apikey", name: "third", apiKey: "synthetic-third" });');
    expect((await db.getProviderConnections({ provider: "tenant-a" })).map(row => row.id)).toEqual([first.id, sibling.id, inserted.id]);
    await childWrite(`await repos.updateProviderConnection(${JSON.stringify(first.id)}, { accessToken: "new-token", isActive: false, providerSpecificData: { strictProxy: true, vercelRelayUrl: "https://new.invalid" } }); await repos.updateProviderConnection(${JSON.stringify(inserted.id)}, { priority: 1 });`);
    expect((await db.getProviderConnections({ provider: "tenant-a" })).map(row => row.id)).toEqual([inserted.id, first.id, sibling.id]);
    expect((await db.getProviderConnections({ provider: "tenant-a", isActive: true })).map(row => row.id)).toEqual([inserted.id, sibling.id]);
    expect(await db.getProviderConnections({ provider: "tenant-a", isActive: false })).toMatchObject([{ id: first.id, accessToken: "new-token", providerSpecificData: { vercelRelayUrl: "https://new.invalid", strictProxy: true } }]);
    await expect(db.updateProviderConnection(first.id, { accessToken: "stale-parent-write" }, { expected: selected._writeFence })).rejects.toMatchObject({ code: "STALE_CONNECTION_WRITE" });
    expect(await db.getProviderConnections(filters[4])).toBe(otherWarm);
    expect(otherWarm.map(row => row.id)).toEqual([other.id]);
    await childWrite(`await repos.updateProviderConnection(${JSON.stringify(first.id)}, { provider: "tenant-b", isActive: true }); await repos.deleteProviderConnection(${JSON.stringify(inserted.id)});`);
    expect((await db.getProviderConnections({ provider: "tenant-a" })).map(row => row.id)).toEqual([sibling.id]);
    expect((await db.getProviderConnections({ provider: "tenant-b", isActive: true })).map(row => row.id).sort()).toEqual([first.id, other.id].sort());
    expect(await db.getProviderConnections({ provider: "tenant-a", isActive: false })).toEqual([]);
    expect(await db.getProviderConnectionById(inserted.id)).toBeNull();
  });

  it("invalidates settings, pricing and alias-derived model snapshots across processes without a TTL wait", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { getCachedModelsResponse } = await import("@/lib/modelsResponseCache.js");
    await db.updateSettings({ stickyRoundRobinLimit: 2 });
    await db.updatePricing({ "cache-pricing-fixture": { model: { input: 1, output: 2 } } });
    await db.setModelAlias("child-alias", "provider/old");
    const settings = await db.exportSettings();
    const pricing = await db.getPricing();
    let loads = 0;
    const load = async () => ({ aliases: await db.getModelAliases(), custom: await db.getCustomModels(), sequence: ++loads });
    const options = { dataset: "tenant-a-catalog", access: "public", params: { type: "llm" } };
    const before = await getCachedModelsResponse(load, options);
    await childWrite('await repos.updateSettings({ stickyRoundRobinLimit: 7 }); await repos.updatePricing({ "cache-pricing-fixture": { model: { input: 3, output: 6 } } }); await repos.setModelAlias("child-alias", "provider/new"); await repos.addCustomModel({ providerAlias: "fixture", id: "child-custom", caps: { vision: true } });');
    expect(await db.exportSettings()).not.toBe(settings);
    expect((await db.getSettings()).stickyRoundRobinLimit).toBe(7);
    expect(await db.getPricing()).not.toBe(pricing);
    expect(await db.getPricingForModel("cache-pricing-fixture", "model")).toEqual({ input: 3, output: 6 });
    const updated = await getCachedModelsResponse(load, options);
    expect(updated).not.toBe(before);
    expect(updated.aliases).toEqual({ "child-alias": "provider/new" });
    expect(updated.custom).toMatchObject([{ id: "child-custom", caps: { vision: true } }]);
    await childWrite('await repos.resetPricing("cache-pricing-fixture", "model"); await repos.deleteModelAlias("child-alias"); await repos.deleteCustomModel({ providerAlias: "fixture", id: "child-custom" });');
    expect(await db.getPricingForModel("cache-pricing-fixture", "model")).toBeNull();
    expect(await getCachedModelsResponse(load, options)).toMatchObject({ aliases: {}, custom: [], sequence: 3 });
  });

  it("preserves warmed parent snapshots after a child import rollback then observes the committed replacement", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const node = await db.createProviderNode({ id: "import-node", type: "openai-compatible", prefix: "old" });
    const combo = await db.createCombo({ name: "import-combo", models: ["provider/old"] });
    await db.createProviderConnection({ provider: "import-fixture", authType: "apikey", name: "old-account", apiKey: "old-key" });
    await db.updateSettings({ stickyRoundRobinLimit: 2 });
    await db.updatePricing({ "import-fixture": { model: { input: 1, output: 2 } } });
    await db.setModelAlias("import-alias", "provider/old");
    const warm = { nodes: await db.getProviderNodes(), combo: await db.getComboById(combo.id), connections: await db.getProviderConnections(), settings: await db.exportSettings(), pricing: await db.getPricing() };
    const { getCachedModelsResponse } = await import("@/lib/modelsResponseCache.js");
    const options = { dataset: "import-proof", access: "public" };
    const catalog = await getCachedModelsResponse(() => db.getModelAliases(), options);
    const failed = await childWrite(`const next = structuredClone(await repos.exportDb()); next.settings.stickyRoundRobinLimit = 9; next.providerNodes[0].prefix = "rolled-back"; next.providerConnections[0].apiKey = "rolled-back"; next.combos = [{ id: "invalid", name: null }]; try { await repos.importDb(next); throw new Error("Expected constraint failure"); } catch (error) { if (!/NOT NULL constraint failed: combos.name/.test(error.message)) throw error; return true; }`);
    expect(failed).toBe(true);
    expect(await db.getProviderNodes()).toBe(warm.nodes);
    expect(await db.getComboById(combo.id)).toBe(warm.combo);
    expect(await db.getProviderConnections()).toBe(warm.connections);
    expect(await db.exportSettings()).toBe(warm.settings);
    expect(await db.getPricing()).toBe(warm.pricing);
    expect(await getCachedModelsResponse(() => db.getModelAliases(), options)).toBe(catalog);
    await childWrite('const next = structuredClone(await repos.exportDb()); next.settings.stickyRoundRobinLimit = 9; next.providerNodes[0].prefix = "committed"; next.providerConnections[0].apiKey = "committed-key"; next.combos[0].models = ["provider/committed"]; next.modelAliases = { "import-alias": "provider/committed" }; next.pricing = { "import-fixture": { model: { input: 4, output: 8 } } }; await repos.importDb(next);');
    expect(await db.getProviderNodeById(node.id)).toMatchObject({ prefix: "committed" });
    expect(await db.getComboById(combo.id)).toMatchObject({ models: ["provider/committed"] });
    expect(await db.getProviderConnections()).toMatchObject([{ apiKey: "committed-key" }]);
    expect((await db.getSettings()).stickyRoundRobinLimit).toBe(9);
    expect(await db.getPricingForModel("import-fixture", "model")).toEqual({ input: 4, output: 8 });
    expect(await getCachedModelsResponse(() => db.getModelAliases(), options)).toEqual({ "import-alias": "provider/committed" });
  });

  it("isolates simultaneously live DATA_DIR adapters and model dataset/access/filter cache keys", async () => {
    const firstState = global._dbAdapter;
    const firstNode = await db.createProviderNode({ id: "same-node", type: "openai-compatible", name: "first-dataset" });
    await db.createProviderConnection({ provider: "same-provider", authType: "apikey", name: "same-name", apiKey: "first-key" });
    const firstNodes = await db.getProviderNodes();
    const firstConnections = await db.getProviderConnections({ provider: "same-provider" });
    const firstModels = (await import("@/lib/modelsResponseCache.js")).getCachedModelsResponse;
    const options = { dataset: "tenant-a", access: "public", params: { type: "llm" } };
    const firstCatalog = await firstModels(() => [{ id: "first-only" }], options);
    vi.stubEnv("DATA_DIR", join(directory, "other-dataset"));
    delete global._dbAdapter;
    vi.resetModules();
    const second = await import("@/lib/db/index.js");
    const secondAdapter = await (await import("@/lib/db/driver.js")).getAdapter();
    try {
      expect(secondAdapter).not.toBe(adapter);
      expect(await second.getProviderNodeById(firstNode.id)).toBeNull();
      await second.createProviderNode({ id: firstNode.id, type: "openai-compatible", name: "second-dataset" });
      await second.createProviderConnection({ provider: "same-provider", authType: "apikey", name: "same-name", apiKey: "second-key" });
      expect(await second.getProviderNodes()).toMatchObject([{ id: firstNode.id, name: "second-dataset" }]);
      expect(await second.getProviderConnections({ provider: "same-provider" })).toMatchObject([{ apiKey: "second-key" }]);
      const secondModels = (await import("@/lib/modelsResponseCache.js")).getCachedModelsResponse;
      let loads = 0;
      const load = () => [{ id: `second-${++loads}` }];
      const secondCatalog = await secondModels(load, options);
      expect(secondCatalog).not.toBe(firstCatalog);
      expect(await secondModels(load, options)).toBe(secondCatalog);
      for (const isolated of [{ ...options, dataset: "tenant-b" }, { ...options, access: "admin" }, { ...options, params: { type: "embedding" } }]) {
        expect(await secondModels(load, isolated)).not.toBe(secondCatalog);
      }
      expect(loads).toBe(4);
      expect(await db.getProviderNodes()).toBe(firstNodes);
      expect(await db.getProviderConnections({ provider: "same-provider" })).toBe(firstConnections);
      expect(firstConnections[0].apiKey).toBe("first-key");
      expect(await firstModels(() => { throw new Error("First dataset should remain warm"); }, options)).toBe(firstCatalog);
    } finally {
      await secondAdapter.close();
      global._dbAdapter = firstState;
      vi.stubEnv("DATA_DIR", directory);
    }
  });
});
