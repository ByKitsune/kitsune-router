import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousGlobals, previousListeners, api, db;

beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-deep-db-node-"));
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  previousListeners = new Map(events.map(event => [event, process.rawListeners(event)]));
  for (const key of globals) delete globalThis[key];
  vi.stubEnv("HOME", directory);
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("KITSUNE_ROUTER_MIGRATION", "skip");
  vi.resetModules();
  api = await import("@/lib/db/index.js");
  db = await (await import("@/lib/db/driver.js")).getAdapter();
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const timer of Object.values(globalThis._pendingTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(globalThis._statsEmitTimers || {})) clearTimeout(timer);
  await globalThis._dbAdapter?.instance?.close();
  for (const event of events) {
    for (const listener of process.rawListeners(event)) {
      if (!previousListeners.get(event).includes(listener)) process.removeListener(event, listener);
    }
  }
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  vi.unstubAllEnvs();
  vi.resetModules();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function node(id = "openai-compatible-chat-owned", prefix = "owned", type = "openai-compatible") {
  return api.createProviderNode({ id, prefix, type, name: id, apiType: "chat", baseUrl: "https://example.invalid/v1" });
}

async function connection(provider, name = "Synthetic") {
  const result = await api.createProviderConnection({ provider, authType: "apikey", name, apiKey: "synthetic-key" });
  await api.updateProviderConnection(result.id, { lastUsedAt: "2026-11-17T12:00:00.000Z", consecutiveUseCount: 1 });
  return result;
}

describe("compatible-node deletion owns one atomic database change", () => {
  it("removes only its own connections/runtime/custom models and invalidates already-warm views", async () => {
    const target = await node();
    const other = await node(`${target.id}-other`, "other");
    const first = await connection(target.id, "one");
    await connection(target.id, "two");
    const untouched = await connection(other.id);
    for (const id of ["model", "model|with|separators"]) await api.addCustomModel({ providerAlias: target.id, id, caps: { vision: true } });
    await api.addCustomModel({ providerAlias: other.id, id: "model" });
    await api.addCustomModel({ providerAlias: "openai", id: "native-declaration" });
    await api.setModelAlias("operator-alias", `${target.id}/model`);
    const combo = await api.createCombo({ name: "operator-combo", models: [`${target.id}/model`, `${other.id}/model`] });
    await api.saveRequestUsage({ provider: target.id, model: "model", connectionId: first.id, tokens: { prompt_tokens: 7 }, eventId: "synthetic-retained-usage" });
    const { getCachedModelsResponse } = await import("@/lib/modelsResponseCache.js");
    const load = vi.fn(() => api.getCustomModels());
    expect(await getCachedModelsResponse(load)).toHaveLength(4);
    await api.getProviderConnections({ provider: target.id });
    const otherConnections = await api.getProviderConnections({ provider: other.id });
    const lateWrite = await api.getProviderConnectionById(first.id);
    expect(await api.deleteProviderNode(target.id)).toMatchObject({ id: target.id });
    expect(await api.getProviderNodeById(target.id)).toBeNull();
    expect(await api.getProviderConnections({ provider: target.id })).toEqual([]);
    expect(db.all("SELECT * FROM connectionRuntime WHERE provider=?", [target.id])).toEqual([]);
    expect(await api.getProviderConnections({ provider: other.id })).toBe(otherConnections);
    expect(await api.getProviderConnectionById(untouched.id)).not.toBeNull();
    expect((await api.getCustomModels()).map(row => row.providerAlias).sort()).toEqual(["openai", other.id].sort());
    expect(await getCachedModelsResponse(load)).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(await api.getModelAliases()).toMatchObject({ "operator-alias": `${target.id}/model` });
    expect((await api.getComboById(combo.id)).models).toEqual([`${target.id}/model`, `${other.id}/model`]);
    expect((await api.getUsageHistory({ provider: target.id }))).toHaveLength(1);
    expect(await api.updateProviderConnection(first.id, { apiKey: "synthetic-late" }, { expected: lateWrite._writeFence })).toBeNull();
    expect(await api.getProviderConnectionById(first.id)).toBeNull();
  });

  it("rolls all dependent deletion and cache revisions back when deleting the node fails", async () => {
    const target = await node();
    const account = await connection(target.id);
    await api.addCustomModel({ providerAlias: target.id, id: "model" });
    const warm = await api.getProviderConnections({ provider: target.id });
    const { readScopeRevision } = await import("@/lib/db/helpers/scopedCache.js");
    const scopes = ["nodes", "connections", "customModels", "connectionRuntime"];
    const revision = readScopeRevision(db, scopes);
    db.exec("CREATE TRIGGER synthetic_refuse_node BEFORE DELETE ON providerNodes BEGIN SELECT RAISE(ABORT, 'synthetic node constraint'); END");
    await expect(api.deleteProviderNode(target.id)).rejects.toThrow("synthetic node constraint");
    expect(await api.getProviderNodeById(target.id)).not.toBeNull();
    expect(await api.getProviderConnections({ provider: target.id })).toBe(warm);
    expect(await api.getProviderConnectionById(account.id)).not.toBeNull();
    expect((await api.getCustomModels())).toHaveLength(1);
    expect(db.get("SELECT COUNT(*) AS n FROM connectionRuntime WHERE provider=?", [target.id]).n).toBe(1);
    expect(readScopeRevision(db, scopes)).toBe(revision);
  });

  it("does not delete a different provider's declarations when legacy prefixes are shared or name a built-in provider", async () => {
    const target = await node("custom-embedding-owned", "openai", "custom-embedding");
    await node("openai-compatible-chat-other", "openai");
    await api.addCustomModel({ providerAlias: target.id, id: "owned" });
    await api.addCustomModel({ providerAlias: "openai", id: "native" });
    const native = await connection("openai");
    await api.deleteProviderNode(target.id);
    expect(await api.getCustomModels()).toEqual([{ providerAlias: "openai", id: "native", type: "llm", name: "native" }]);
    expect(await api.getProviderConnectionById(native.id)).not.toBeNull();
  });

  it("removes a uniquely owned custom-embedding prefix but retains prefix-similar declarations", async () => {
    const target = await node("custom-embedding-owned", "synthetic-embedding", "custom-embedding");
    await api.addCustomModel({ providerAlias: target.prefix, id: "vector", type: "embedding" });
    await api.addCustomModel({ providerAlias: `${target.prefix}-other`, id: "vector", type: "embedding" });
    await api.deleteProviderNode(target.id);
    expect((await api.getCustomModels()).map(row => row.providerAlias)).toEqual([`${target.prefix}-other`]);
  });

  it("returns null for a missing node without deleting dangling or unrelated stored records", async () => {
    const provider = "openai-compatible-chat-missing";
    const account = await connection(provider);
    await api.addCustomModel({ providerAlias: provider, id: "retained-in-export" });
    expect(await api.deleteProviderNode(provider)).toBeNull();
    expect(await api.getProviderConnectionById(account.id)).not.toBeNull();
    expect((await api.exportDb()).customModels).toHaveLength(1);
  });
});

describe("older orphaned declarations are hidden without deleting operator backup data", () => {
  it("hides a reserved missing-node ID, retains raw/exported state, and shows it again when the node is restored", async () => {
    const providerAlias = "anthropic-compatible-restored";
    await api.addCustomModel({ providerAlias, id: "retained-model", caps: { vision: true } });
    await api.addCustomModel({ providerAlias: "custom-unknown-prefix", id: "other-model" });
    expect((await api.getCustomModels()).map(row => row.id)).toEqual(["other-model"]);
    expect((await api.exportDb()).customModels).toHaveLength(2);
    await node(providerAlias, "restored", "anthropic-compatible");
    expect((await api.getCustomModels()).map(row => row.id).sort()).toEqual(["other-model", "retained-model"]);
  });
});

describe("provider-node DELETE uses the same atomic owner boundary", () => {
  it("invalidates request-path declared capabilities after a successful deletion", async () => {
    const target = await node();
    await connection(target.id);
    await api.addCustomModel({ providerAlias: target.id, id: "model", caps: { vision: true } });
    const { getDeclaredModelCaps } = await import("open-sse/providers/declaredCaps.js");
    expect(await getDeclaredModelCaps(target.id, "model")).toMatchObject({ vision: true });
    const { DELETE } = await import("@/app/api/provider-nodes/[id]/route.js");
    const response = await DELETE(new Request("http://localhost/api/provider-nodes/owned", { method: "DELETE" }), { params: Promise.resolve({ id: target.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(await getDeclaredModelCaps(target.id, "model")).toBeUndefined();
    expect(await api.getProviderConnections({ provider: target.id })).toEqual([]);
  });

  it("keeps connections and model declarations if the final node delete fails", async () => {
    const target = await node();
    const account = await connection(target.id);
    await api.addCustomModel({ providerAlias: target.id, id: "model" });
    db.exec("CREATE TRIGGER synthetic_refuse_node BEFORE DELETE ON providerNodes BEGIN SELECT RAISE(ABORT, 'synthetic node constraint'); END");
    const { DELETE } = await import("@/app/api/provider-nodes/[id]/route.js");
    const response = await DELETE(new Request("http://localhost/api/provider-nodes/owned", { method: "DELETE" }), { params: Promise.resolve({ id: target.id }) });
    expect(response.status).toBe(500);
    expect(await api.getProviderConnectionById(account.id)).not.toBeNull();
    expect(await api.getCustomModels()).toHaveLength(1);
    expect(await api.getProviderNodeById(target.id)).not.toBeNull();
  });
});

describe("provider-node endpoint changes remain atomic across the account pool", () => {
  async function pool() {
    const target = await node();
    const accounts = [];
    for (const name of ["one", "two"]) {
      const account = await api.createProviderConnection({ provider: target.id, authType: "apikey", name, apiKey: `synthetic-${name}`, refreshToken: `synthetic-refresh-${name}`,
        providerSpecificData: { baseUrl: target.baseUrl, prefix: target.prefix, enabledModels: ["retained-model"], connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.invalid:8080" } });
      await api.updateProviderConnection(account.id, { lastUsedAt: "2026-11-17T12:00:00.000Z", consecutiveUseCount: 2 });
      accounts.push(await api.getProviderConnectionById(account.id));
    }
    return { target, accounts };
  }

  const changes = { name: "Renamed", prefix: "renamed", apiType: "responses", baseUrl: "https://new.example.invalid/v1" };

  it("changes routing metadata together while retaining credentials, account policy, runtime data and stale-write fences", async () => {
    const { target, accounts } = await pool();
    const other = await node("openai-compatible-chat-other", "other");
    const unrelated = await connection(other.id);
    const warmOther = await api.getProviderConnections({ provider: other.id });
    await api.updateProviderNode(target.id, changes);
    for (const before of accounts) {
      const after = await api.getProviderConnectionById(before.id);
      expect(after).toMatchObject({ apiKey: before.apiKey, refreshToken: before.refreshToken, lastUsedAt: before.lastUsedAt, consecutiveUseCount: 2,
        providerSpecificData: { baseUrl: changes.baseUrl, prefix: changes.prefix, nodeName: changes.name, apiType: "responses", enabledModels: ["retained-model"], connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.invalid:8080" } });
      await expect(api.updateProviderConnection(before.id, { accessToken: "synthetic-stale-token" }, { expected: before._writeFence })).rejects.toMatchObject({ code: "STALE_CONNECTION_WRITE" });
      const exported = (await api.exportDb()).providerConnections.find(row => row.id === before.id);
      expect(exported.updatedAt).toBe(after.updatedAt);
    }
    expect(await api.getProviderConnections({ provider: other.id })).toBe(warmOther);
    expect(await api.getProviderConnectionById(unrelated.id)).not.toHaveProperty("providerSpecificData.nodeName");
    expect(db.get("SELECT COUNT(*) AS n FROM connectionRuntime WHERE provider=?", [target.id]).n).toBe(2);
  });

  it("rolls the node, first account and warmed views back when updating the second account fails, then succeeds after repair", async () => {
    const { target, accounts } = await pool();
    const warm = await api.getProviderConnections({ provider: target.id });
    db.exec("CREATE TRIGGER synthetic_refuse_endpoint BEFORE UPDATE ON providerConnections WHEN OLD.name='two' BEGIN SELECT RAISE(ABORT, 'synthetic endpoint constraint'); END");
    await expect(api.updateProviderNode(target.id, changes)).rejects.toThrow("synthetic endpoint constraint");
    expect(await api.getProviderNodeById(target.id)).toMatchObject(target);
    expect(await api.getProviderConnections({ provider: target.id })).toBe(warm);
    for (const account of accounts) expect(await api.getProviderConnectionById(account.id)).toMatchObject(account);
    db.exec("DROP TRIGGER synthetic_refuse_endpoint");
    await api.updateProviderNode(target.id, changes);
    expect((await api.getProviderConnections({ provider: target.id })).every(account => account.providerSpecificData.baseUrl === changes.baseUrl)).toBe(true);
  });

  it("does not remove the node or its credentials when a PUT body fails validation", async () => {
    const { target, accounts } = await pool();
    const { PUT } = await import("@/app/api/provider-nodes/[id]/route.js");
    const response = await PUT(new Request("http://localhost/api/provider-nodes/owned", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...changes, name: "" }) }), { params: Promise.resolve({ id: target.id }) });
    expect(response.status).toBe(400);
    expect(await api.getProviderNodeById(target.id)).toMatchObject(target);
    expect(await api.getProviderConnectionById(accounts[0].id)).not.toBeNull();
  });

  it("keeps the API update atomic when a later account update is rejected", async () => {
    const { target, accounts } = await pool();
    db.exec("CREATE TRIGGER synthetic_refuse_endpoint BEFORE UPDATE ON providerConnections WHEN OLD.name='two' BEGIN SELECT RAISE(ABORT, 'synthetic endpoint constraint'); END");
    const { PUT } = await import("@/app/api/provider-nodes/[id]/route.js");
    const response = await PUT(new Request("http://localhost/api/provider-nodes/owned", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(changes) }), { params: Promise.resolve({ id: target.id }) });
    expect(response.status).toBe(500);
    expect(await api.getProviderNodeById(target.id)).toMatchObject(target);
    for (const account of accounts) expect(await api.getProviderConnectionById(account.id)).toMatchObject(account);
  });
});
