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
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

async function childWrite(code) {
  const driver = pathToFileURL(join(process.cwd(), "src/lib/db/driver.js")).href;
  const child = spawn(process.execPath, ["--input-type=module", "-e", `const { getAdapter, closeDb } = await import(${JSON.stringify(driver)}); const db = await getAdapter(); ${code}; await closeDb();`], {
    env: { PATH: process.env.PATH, HOME: directory, DATA_DIR: directory }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stdout.resume();
  child.stderr.on("data", chunk => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", status => status === 0 ? resolve() : reject(new Error(stderr || `child exited ${status}`)));
  });
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
});
