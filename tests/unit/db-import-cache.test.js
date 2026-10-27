import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const globalKeys = [
  Symbol.for("kitsunerouter.db.importState"),
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
];
const envKeys = ["HOME", "DATA_DIR", "OBSERVABILITY_ENABLED", "ENABLE_REQUEST_LOGS"];
const beforeImport = {
  settings: {
    requireApiKey: false, cloudEnabled: false, outboundProxyEnabled: false,
    providerStrategies: { openai: "round-robin" },
    enableObservability: false, observabilityBatchSize: 1,
  },
  apiKeys: [
    { id: "removed-key", key: "sk-test-removed", isActive: true },
    { id: "disabled-key", key: "sk-test-disabled", isActive: true },
    { id: "activated-key", key: "sk-test-activated", isActive: false },
  ],
  providerConnections: [
    { id: "retained", provider: "openai", name: "Before import", apiKey: "old-provider-key", isActive: true, priority: 1 },
    { id: "removed", provider: "openai", name: "Removed account", isActive: false, priority: 2 },
  ],
  providerNodes: [{ id: "node", type: "openai-compatible", name: "Old node", prefix: "old" }],
  proxyPools: [{ id: "pool", name: "Old pool", proxyUrl: "http://127.0.0.1:8080" }],
  combos: [{ id: "combo", name: "chat-combo", models: ["openai/old"] }],
  modelAliases: { chat: "openai/old", removed: "openai/removed" },
  customModels: [{ providerAlias: "openai", id: "import-model", type: "llm", caps: { vision: false } }],
  mitmAlias: { claude: { chat: "openai/old" } },
  pricing: { "import-provider": { "import-model": { input: 1, output: 2 }, removed: { input: 5, output: 10 } } },
};
const afterImport = {
  settings: {
    requireApiKey: true, cloudEnabled: true, outboundProxyEnabled: true,
    outboundProxyUrl: "http://127.0.0.1:9080", providerStrategies: { openai: "fallback" },
    enableObservability: true, observabilityBatchSize: 1,
  },
  apiKeys: [
    { id: "new-key", key: "sk-test-new", isActive: true },
    { id: "disabled-key", key: "sk-test-disabled", isActive: false },
    { id: "activated-key", key: "sk-test-activated", isActive: true },
  ],
  providerConnections: [
    { id: "retained", provider: "openai", name: "After import", apiKey: "new-provider-key", isActive: false, priority: 1 },
    { id: "added", provider: "anthropic", name: "Imported account", isActive: true, priority: 2 },
  ],
  providerNodes: [{ id: "node", type: "openai-compatible", name: "New node", prefix: "new" }],
  proxyPools: [{ id: "pool", name: "New pool", proxyUrl: "http://127.0.0.1:9080" }],
  combos: [{ id: "combo", name: "chat-combo", models: ["openai/new"] }],
  modelAliases: { chat: "openai/new", added: "anthropic/new" },
  customModels: [{ providerAlias: "openai", id: "import-model", type: "llm", caps: { vision: true } }],
  mitmAlias: { claude: { chat: "openai/new" } },
  pricing: { "import-provider": { "import-model": { input: 3, output: 6 } } },
};

let root;
let previousGlobals;
let previousEnv;
let previousListeners;
let db;
let adapter;

beforeEach(async () => {
  previousGlobals = Object.fromEntries(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  previousListeners = new Map(shutdownEvents.map(event => [event, process.rawListeners(event)]));
  root = await mkdtemp(join(tmpdir(), "kitsunerouter-db-import-cache-"));
  process.env.HOME = join(root, "home");
  process.env.DATA_DIR = join(root, "data");
  await mkdir(process.env.HOME);
  delete process.env.OBSERVABILITY_ENABLED;
  delete process.env.ENABLE_REQUEST_LOGS;
  for (const key of globalKeys) delete global[key];
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
  db = await import("@/lib/db/index.js");
  adapter = await (await import("@/lib/db/driver.js")).getAdapter();
  await db.importDb(structuredClone(beforeImport));
});

afterEach(async () => {
  try {
    await adapter?.close();
  } finally {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    for (const event of shutdownEvents) {
      const existing = [...previousListeners.get(event)];
      for (const listener of process.rawListeners(event)) {
        const index = existing.indexOf(listener);
        if (index === -1) process.removeListener(event, listener);
        else existing.splice(index, 1);
      }
    }
    for (const key of globalKeys) {
      if (previousGlobals[key]) Object.defineProperty(global, key, previousGlobals[key]);
      else delete global[key];
    }
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    vi.resetModules();
    if (root) await rm(root, { recursive: true, force: true });
    adapter = undefined;
  }
});

function afterNextQuery(method, action) {
  // A pass-through observer coordinates the import with a real SQLite read.
  // Every query executes normally; no repository result or write is replaced.
  const query = adapter[method].bind(adapter);
  return new Promise(resolve => {
    const observer = vi.spyOn(adapter, method).mockImplementation((...args) => {
      const result = query(...args);
      observer.mockRestore();
      resolve(action());
      return result;
    });
  });
}

describe("atomic database import cache visibility", () => {
  it("immediately revokes warmed deleted/disabled keys and accepts imported active keys", async () => {
    expect(await db.validateApiKey("sk-test-removed")).toBe(true);
    expect(await db.validateApiKey("sk-test-disabled")).toBe(true);
    expect(await db.validateApiKey("sk-test-new")).toBe(false);
    expect(await db.validateApiKey("sk-test-activated")).toBe(false);

    await db.importDb(structuredClone(afterImport));

    expect.soft(await db.validateApiKey("sk-test-removed")).toBe(false);
    expect.soft(await db.validateApiKey("sk-test-disabled")).toBe(false);
    expect.soft(await db.validateApiKey("sk-test-new")).toBe(true);
    expect.soft(await db.validateApiKey("sk-test-activated")).toBe(true);
  });

  it("exports and reads imported settings immediately while retaining the two-second raw cache", async () => {
    const previous = await db.exportSettings();
    expect((await db.getSettings()).requireApiKey).toBe(false);

    const imported = await db.importDb(structuredClone(afterImport));

    expect.soft(imported.settings).toEqual(afterImport.settings);
    expect.soft(await db.getSettings()).toMatchObject(afterImport.settings);
    expect.soft(await db.isCloudEnabled()).toBe(true);
    const current = await db.exportSettings();
    expect.soft(current).not.toBe(previous);
    expect.soft(current).toEqual(afterImport.settings);
    expect(await db.exportSettings()).toBe(current);

    // Model an out-of-band SQLite writer: ordinary reads retain their deliberate TTL.
    adapter.run("UPDATE settings SET data = ? WHERE id = 1", [JSON.stringify({ requireApiKey: false })]);
    vi.advanceTimersByTime(1999);
    expect(await db.exportSettings()).toBe(current);
    vi.advanceTimersByTime(1);
    expect(await db.exportSettings()).toEqual({ requireApiKey: false });
  });

  it("refreshes every warmed connection filter, including previously empty results", async () => {
    const filters = [{}, { provider: "openai" }, { isActive: true }, { isActive: false }, { provider: "openai", isActive: true }, { provider: "anthropic" }];
    for (const filter of filters) await db.getProviderConnections(filter);

    await db.importDb(structuredClone(afterImport));

    const expectedIds = [["retained", "added"], ["retained"], ["added"], ["retained"], [], ["added"]];
    for (const [index, filter] of filters.entries()) {
      expect.soft((await db.getProviderConnections(filter)).map(c => c.id)).toEqual(expectedIds[index]);
    }
    expect.soft((await db.getProviderConnections())[0]).toMatchObject({
      name: "After import", apiKey: "new-provider-key", isActive: false,
    });
  });

  it("refreshes merged pricing without retaining removed overrides", async () => {
    expect((await db.getPricing())["import-provider"]["import-model"]).toEqual({ input: 1, output: 2 });

    await db.importDb(structuredClone(afterImport));

    expect.soft((await db.getPricing())["import-provider"]).toEqual({ "import-model": { input: 3, output: 6 } });
    expect.soft(await db.getPricingForModel("import-provider", "import-model")).toEqual({ input: 3, output: 6 });
    expect.soft(await db.getPricingForModel("import-provider", "removed")).toBeNull();
  });

  it("does not let a pricing read started before import repopulate the cache with old rates", async () => {
    const loading = db.getPricing();
    await db.importDb(structuredClone(afterImport));
    await loading;

    expect((await db.getPricing())["import-provider"]).toEqual({ "import-model": { input: 3, output: 6 } });
  });

  it("reads replaced aliases, custom models, nodes, pools and combos after warming their APIs", async () => {
    await db.getModelAliases();
    await db.getCustomModels();
    await db.getMitmAlias("claude");
    await db.getProviderNodes();
    await db.getProxyPools();
    await db.getCombos();
    await db.getComboByName("chat-combo");

    await db.importDb(structuredClone(afterImport));

    expect(await db.getModelAliases()).toEqual({ chat: "openai/new", added: "anthropic/new" });
    expect(await db.getCustomModels()).toEqual([{ providerAlias: "openai", id: "import-model", type: "llm", caps: { vision: true } }]);
    expect(await db.getMitmAlias("claude")).toEqual({ chat: "openai/new" });
    expect(await db.getProviderNodes()).toMatchObject([{ id: "node", name: "New node", prefix: "new" }]);
    expect(await db.getProxyPools()).toMatchObject([{ id: "pool", name: "New pool", proxyUrl: "http://127.0.0.1:9080" }]);
    expect(await db.getComboByName("chat-combo")).toMatchObject({ models: ["openai/new"] });
  });

  it("refreshes active-account names while preserving pending requests and usage identity dedup", async () => {
    const entry = {
      provider: "import-provider", model: "import-model", connectionId: "retained",
      tokens: { prompt_tokens: 1000000, completion_tokens: 1000000 }, status: "ok",
    };
    await db.saveRequestUsage(entry);
    db.trackPendingRequest("import-model", "import-provider", "retained", true);
    expect((await db.getActiveRequests()).activeRequests[0].account).toBe("Before import");
    const previous = await db.getActiveRequests();
    await db.disableModels("openai", ["kept-disabled"]);

    await db.importDb(structuredClone(afterImport));

    const current = await db.getActiveRequests();
    expect.soft(current.activeRequests).toEqual([{ model: "import-model", provider: "import-provider", account: "After import", count: 1 }]);
    expect(current.recentRequests).toEqual(previous.recentRequests);
    expect(await db.getDisabledByProvider("openai")).toEqual(["kept-disabled"]);
    // The same object backfills its endpoint; an equal but distinct request is new usage.
    entry.endpoint = "/v1/chat/completions";
    await db.saveRequestUsage(entry);
    await db.saveRequestUsage({
      provider: "import-provider", model: "import-model", connectionId: "retained",
      timestamp: entry.timestamp, tokens: { prompt_tokens: 1000000, completion_tokens: 1000000 }, status: "ok",
    });
    expect(await db.getUsageHistory()).toMatchObject([
      { cost: 3, endpoint: "/v1/chat/completions" }, { cost: 9, endpoint: null },
    ]);
    const stats = await db.getUsageStats("all");
    expect(stats.totalRequests).toBe(2);
    expect(stats.totalCost).toBe(12);
  });

  it("enables request-detail recording immediately from imported observability settings", async () => {
    await db.saveRequestDetail({ id: "not-recorded", model: "import-model" });

    await db.importDb(structuredClone(afterImport));
    await db.saveRequestDetail({ id: "recorded", model: "import-model" });
    await vi.advanceTimersByTimeAsync(1);

    expect(await db.getRequestDetailById("not-recorded")).toBeNull();
    expect(await db.getRequestDetailById("recorded")).toMatchObject({ id: "recorded", model: "import-model" });
  });

  it("keeps imported observability settings when a configuration read overlaps the import", async () => {
    vi.advanceTimersByTime(2000);
    const importing = afterNextQuery("get", () => db.importDb(structuredClone(afterImport)));
    const loading = db.saveRequestDetail({ id: "overlapping", model: "import-model" });
    await importing;
    await loading;
    await db.saveRequestDetail({ id: "after-overlap", model: "import-model" });
    await vi.advanceTimersByTimeAsync(1);

    expect(await db.getRequestDetailById("after-overlap")).toMatchObject({ id: "after-overlap" });
  });

  it("keeps imported account names when a connection-name read overlaps the import", async () => {
    db.trackPendingRequest("import-model", "openai", "retained", true);
    const importing = afterNextQuery("all", () => db.importDb(structuredClone(afterImport)));
    const loading = db.getActiveRequests();
    await importing;
    await loading;

    expect((await db.getActiveRequests()).activeRequests[0].account).toBe("After import");
  });

  it("disables new request details without discarding a batch already buffered before import", async () => {
    await db.updateSettings({ enableObservability: true, observabilityBatchSize: 20, observabilityFlushIntervalMs: 50 });
    await db.saveRequestDetail({ id: "buffered", model: "import-model" });
    expect(await db.getRequestDetailById("buffered")).toBeNull();

    await db.importDb({ ...structuredClone(afterImport), settings: { enableObservability: false } });
    await db.saveRequestDetail({ id: "disabled", model: "import-model" });
    await vi.advanceTimersByTimeAsync(50);

    expect(await db.getRequestDetailById("buffered")).toMatchObject({ id: "buffered" });
    expect(await db.getRequestDetailById("disabled")).toBeNull();
  });

  it("invalidates warmed caches even when imported sections are omitted", async () => {
    await db.validateApiKey("sk-test-removed");
    await db.getProviderConnections();
    await db.getSettings();
    await db.getPricing();

    const imported = await db.importDb({});

    expect.soft(imported.settings).toEqual({});
    expect.soft(await db.validateApiKey("sk-test-removed")).toBe(false);
    expect.soft(await db.getProviderConnections()).toEqual([]);
    expect.soft((await db.getSettings()).requireApiKey).toBe(true);
    expect.soft((await db.getPricing())["import-provider"]).toBeUndefined();
  });

  it("rolls back a late SQLite constraint failure without expiring any warmed snapshot", async () => {
    const previous = await db.exportDb();
    const settings = await db.exportSettings();
    const connections = await db.getProviderConnections();
    const pricing = await db.getPricing();
    expect(await db.validateApiKey("sk-test-removed")).toBe(true);
    db.trackPendingRequest("import-model", "openai", "retained", true);
    const active = await db.getActiveRequests();
    await db.saveRequestDetail({ id: "not-recorded", model: "import-model" });

    // A NULL combo name fails after settings, connections and keys have been replaced.
    await expect(db.importDb({ ...structuredClone(afterImport), combos: [{ id: "invalid", name: null }] }))
      .rejects.toThrow(/NOT NULL constraint failed: combos.name/);

    expect(await db.exportDb()).toEqual(previous);
    expect(await db.exportSettings()).toBe(settings);
    expect(await db.getProviderConnections()).toBe(connections);
    expect(await db.getPricing()).toBe(pricing);
    expect(await db.validateApiKey("sk-test-removed")).toBe(true);
    expect(await db.validateApiKey("sk-test-new")).toBe(false);
    expect(await db.getActiveRequests()).toEqual(active);
    await db.saveRequestDetail({ id: "still-disabled", model: "import-model" });
    await vi.advanceTimersByTimeAsync(1);
    expect(await db.getRequestDetailById("still-disabled")).toBeNull();
  });
});
