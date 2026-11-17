import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousGlobals, previousListeners;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-deep-db-upgrade-"));
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  previousListeners = new Map(events.map(event => [event, process.rawListeners(event)]));
  for (const key of globals) delete globalThis[key];
  vi.stubEnv("HOME", directory);
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("KITSUNE_ROUTER_MIGRATION", "skip");
  vi.resetModules();
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const timer of Object.values(globalThis._pendingTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(globalThis._statsEmitTimers || {})) clearTimeout(timer);
  await globalThis._dbAdapter?.instance?.close();
  vi.clearAllTimers();
  vi.useRealTimers();
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

const legacy = {
  settings: { requireLogin: true, requireApiKey: true, password: "synthetic-retained-password" },
  providerConnections: [{ id: "retained-account", provider: "openai", authType: "apikey", name: "Retained", apiKey: "synthetic-retained-key" }],
  apiKeys: [{ id: "retained-client", key: "synthetic-retained-client-key" }],
};

describe("legacy migration recovery without losing credentials", () => {
  it.each(["db.json", "usage.json", "disabledModels.json", "request-details.json"])("refuses malformed %s before schema stamps and retries after repair in the same process", async name => {
    fs.writeFileSync(path.join(directory, "db.json"), JSON.stringify(legacy));
    const damaged = path.join(directory, name);
    const bytes = '{"synthetic-secret-that-must-not-appear-in-errors":"truncated';
    fs.writeFileSync(damaged, bytes);
    const { getAdapter } = await import("@/lib/db/driver.js");
    const attempts = await Promise.allSettled([getAdapter(), getAdapter()]);
    expect(attempts.map(result => result.status)).toEqual(["rejected", "rejected"]);
    for (const result of attempts) {
      expect(result.reason.code).toBe("DB_LEGACY_INVALID_JSON");
      expect(result.reason.message).not.toContain("synthetic-secret-that-must-not-appear-in-errors");
    }
    expect(fs.readFileSync(damaged, "utf8")).toBe(bytes);
    expect(fs.existsSync(path.join(directory, "db", ".migrated-from-json"))).toBe(false);
    const before = new DatabaseSync(path.join(directory, "db", "data.sqlite"));
    expect(before.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
    before.close();
    fs.writeFileSync(damaged, JSON.stringify(name === "db.json" ? legacy : {}));
    const db = await getAdapter();
    expect(db.get("SELECT key FROM apiKeys WHERE id = ?", ["retained-client"]).key).toBe(legacy.apiKeys[0].key);
    expect(JSON.parse(db.get("SELECT data FROM providerConnections WHERE id = ?", ["retained-account"]).data).apiKey).toBe(legacy.providerConnections[0].apiKey);
    expect(JSON.parse(db.get("SELECT data FROM settings WHERE id = 1").data)).toEqual(legacy.settings);
    expect(fs.existsSync(path.join(directory, "db", ".migrated-from-json"))).toBe(true);
  });

  it.each(["null", "[]", '"not an object"'])("refuses a legacy top-level %s instead of stamping an empty import", async bytes => {
    fs.writeFileSync(path.join(directory, "db.json"), bytes);
    const { getAdapter } = await import("@/lib/db/driver.js");
    await expect(getAdapter()).rejects.toMatchObject({ code: "DB_LEGACY_INVALID_JSON" });
    expect(fs.existsSync(path.join(directory, "db", ".migrated-from-json"))).toBe(false);
    expect(fs.readFileSync(path.join(directory, "db.json"), "utf8")).toBe(bytes);
  });

  it("does not re-read obsolete malformed JSON when a valid SQLite database is authoritative", async () => {
    const { getAdapter, closeDb } = await import("@/lib/db/driver.js");
    const db = await getAdapter();
    db.run("INSERT INTO settings(id,data) VALUES(1,?)", [JSON.stringify(legacy.settings)]);
    await closeDb();
    fs.writeFileSync(path.join(directory, "db.json"), "corrupt obsolete JSON");
    const reopened = await getAdapter();
    expect(JSON.parse(reopened.get("SELECT data FROM settings WHERE id=1").data)).toEqual(legacy.settings);
  });

  it("recovers from a temporary configured-directory failure without resetting singleton globals", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const dbDirectory = path.join(directory, "db");
    fs.writeFileSync(dbDirectory, "owned fixture obstruction");
    await expect(getAdapter()).rejects.toBeInstanceOf(Error);
    expect(fs.readFileSync(dbDirectory, "utf8")).toBe("owned fixture obstruction");
    fs.unlinkSync(dbDirectory);
    const db = await getAdapter();
    expect(db.get("PRAGMA quick_check")).toEqual({ quick_check: "ok" });
  });
});

describe("adapter close/open serialization", () => {
  it("coalesces concurrent close calls and keeps new readers waiting until the old handle closes", async () => {
    const { getAdapter, closeDb } = await import("@/lib/db/driver.js");
    const db = await getAdapter();
    db.run("INSERT INTO settings(id,data) VALUES(1,?)", [JSON.stringify(legacy.settings)]);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const close = db.close.bind(db);
    const observed = vi.spyOn(db, "close").mockImplementation(async () => { await gate; close(); });
    const first = closeDb(), second = closeDb();
    let settled = false;
    const reopening = getAdapter().then(adapter => { settled = true; return adapter; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(observed).toHaveBeenCalledTimes(1);
    const reopened = await reopening;
    expect(reopened).not.toBe(db);
    expect(JSON.parse(reopened.get("SELECT data FROM settings WHERE id=1").data)).toEqual(legacy.settings);
  });
});

describe("safe additive upgrade and indexed account creation", () => {
  async function previousDatabase(version = "2") {
    const { TABLES, buildCreateTableSql } = await import("@/lib/db/schema.js");
    fs.mkdirSync(path.join(directory, "db"));
    const old = new DatabaseSync(path.join(directory, "db", "data.sqlite"));
    for (const [name, definition] of Object.entries(TABLES)) {
      old.exec(buildCreateTableSql(name, definition));
      for (const index of definition.indexes || []) {
        if (!index.includes("idx_pc_provider_auth_name")) old.exec(index);
      }
    }
    old.prepare("INSERT INTO _meta(key,value) VALUES('schemaVersion',?),('backupSchemaVersion','3'),('appVersion','1.0.8'),('totalRequestsLifetime','1')").run(version);
    old.prepare("INSERT INTO apiKeys(id,key,createdAt) VALUES(?,?,?)").run("retained-client", "synthetic-client-key", "2026-01-01T00:00:00.000Z");
    old.prepare("INSERT INTO usageHistory(timestamp,provider,model,tokens,cost) VALUES(?,?,?,?,?)").run("2026-01-01T00:00:00.000Z", "openai", "retained-model", '{"prompt_tokens":12}', null);
    return old;
  }

  it("updates a current schema3 installation without losing queued accounting or repricing retained usage", async () => {
    vi.useFakeTimers();
    const old = await previousDatabase();
    const timestamp = "2026-11-17T12:00:00.000Z";
    const event = { eventId: "retained-queued-event", timestamp, dateKey: "2026-11-17", provider: "openai", model: "retained-model", tokens: { prompt_tokens: 9, completion_tokens: 2 }, cost: 0.125,
      inputCost: 0.1, cachedCost: 0, outputCost: 0.025, quote: { timestamp, pricing: { input: 5, output: 25 }, provenance: "synthetic-old-accepted-quote" } };
    const serialized = JSON.stringify(event);
    old.prepare("INSERT INTO usageOutbox(eventId,payload,bytes,acceptedAt) VALUES(?,?,?,?)").run(event.eventId, serialized, Buffer.byteLength(serialized), Date.now());
    old.close();
    const { getAdapter, closeDb } = await import("@/lib/db/driver.js");
    const { SCHEMA_VERSION } = await import("@/lib/db/schema.js");
    const db = await getAdapter();
    expect(db.get("SELECT payload FROM usageOutbox").payload).toBe(serialized);
    expect(db.get("SELECT value FROM _meta WHERE key='backupSchemaVersion'").value).toBe(String(SCHEMA_VERSION));
    const { flushUsageQueue } = await import("@/lib/db/repos/usageRepo.js");
    expect(await flushUsageQueue()).toMatchObject({ drained: true, depth: 0 });
    const projected = db.get("SELECT cost,tokens,meta FROM usageHistory WHERE eventId=?", [event.eventId]);
    expect(projected.cost).toBe(event.cost);
    expect(JSON.parse(projected.meta).quote).toEqual(event.quote);
    expect(db.get("SELECT cost FROM usageHistory WHERE eventId IS NULL").cost).toBeNull();
    expect(db.get("SELECT key FROM apiKeys").key).toBe("synthetic-client-key");
    expect(db.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(2);
    expect(db.get("SELECT value FROM _meta WHERE key='totalRequestsLifetime'").value).toBe("2");
    const backups = fs.readdirSync(path.join(directory, "db", "backups"));
    expect(backups).toHaveLength(1);
    const before = new DatabaseSync(path.join(directory, "db", "backups", backups[0], "data.sqlite"), { readOnly: true });
    expect(before.prepare("SELECT payload FROM usageOutbox").get().payload).toBe(serialized);
    expect(before.prepare("SELECT cost FROM usageHistory").get().cost).toBeNull();
    before.close();
    await closeDb();
    const reopened = await getAdapter();
    expect(reopened.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(2);
    expect(fs.readdirSync(path.join(directory, "db", "backups"))).toEqual(backups);
  });

  it("retains an old installation after a real SQL migration failure and retries successfully after its cause is repaired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T12:00:00.000Z"));
    const old = await previousDatabase("1");
    old.exec("CREATE TRIGGER synthetic_migration_failure BEFORE UPDATE ON _meta WHEN OLD.key='schemaVersion' BEGIN SELECT RAISE(ABORT, 'synthetic migration failure'); END");
    old.close();
    const { getAdapter } = await import("@/lib/db/driver.js");
    await expect(getAdapter()).rejects.toThrow("synthetic migration failure");
    const preserved = new DatabaseSync(path.join(directory, "db", "data.sqlite"));
    expect(preserved.prepare("SELECT key FROM apiKeys").get().key).toBe("synthetic-client-key");
    expect(preserved.prepare("SELECT COUNT(*) AS n FROM usageHistory").get().n).toBe(1);
    expect(preserved.prepare("SELECT value FROM _meta WHERE key='schemaVersion'").get().value).toBe("1");
    preserved.exec("DROP TRIGGER synthetic_migration_failure");
    preserved.close();
    vi.setSystemTime(new Date("2026-11-17T12:00:01.000Z"));
    const recovered = await getAdapter();
    expect(recovered.get("SELECT value FROM _meta WHERE key='schemaVersion'").value).toBe(String((await import("@/lib/db/migrations/index.js")).latestVersion()));
    expect(recovered.get("SELECT key FROM apiKeys").key).toBe("synthetic-client-key");
    expect(recovered.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(1);
    expect(recovered.all("PRAGMA index_list(providerConnections)").map(index => index.name)).toContain("idx_pc_provider_auth_name");
  });

  it("upgrades a pre-outbox schema automatically while retaining credentials, usage and a readable pre-change backup", async () => {
    const { TABLES, buildCreateTableSql, SCHEMA_VERSION } = await import("@/lib/db/schema.js");
    fs.mkdirSync(path.join(directory, "db"));
    const old = new DatabaseSync(path.join(directory, "db", "data.sqlite"));
    for (const [name, definition] of Object.entries(TABLES)) {
      if (["usageOutbox", "connectionRuntime"].includes(name)) continue;
      const columns = { ...definition.columns };
      if (name === "usageHistory") { delete columns.eventId; delete columns.ttftMs; delete columns.totalMs; }
      old.exec(buildCreateTableSql(name, { ...definition, columns }));
    }
    old.exec("INSERT INTO _meta(key,value) VALUES('schemaVersion','1'),('backupSchemaVersion','1'),('appVersion','0.9.9')");
    old.prepare("INSERT INTO settings(id,data) VALUES(1,?)").run(JSON.stringify(legacy.settings));
    old.prepare("INSERT INTO apiKeys(id,key,createdAt) VALUES(?,?,?)").run("retained-client", "synthetic-client-key", "2026-01-01T00:00:00.000Z");
    old.prepare("INSERT INTO providerConnections(id,provider,authType,name,data,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)").run("retained-account", "openai", "apikey", "Retained", '{"apiKey":"synthetic-provider-key"}', "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    old.prepare("INSERT INTO usageHistory(timestamp,provider,model,tokens,cost) VALUES(?,?,?,?,?)").run("2026-01-01T00:00:00.000Z", "openai", "retained-model", '{"prompt_tokens":12}', 0.04);
    old.close();
    const { getAdapter, closeDb } = await import("@/lib/db/driver.js");
    const db = await getAdapter();
    expect(db.get("SELECT key FROM apiKeys WHERE id='retained-client'").key).toBe("synthetic-client-key");
    expect(JSON.parse(db.get("SELECT data FROM providerConnections WHERE id='retained-account'").data).apiKey).toBe("synthetic-provider-key");
    expect(db.get("SELECT tokens,cost,eventId,ttftMs,totalMs FROM usageHistory")).toMatchObject({ tokens: '{"prompt_tokens":12}', cost: 0.04, eventId: null, ttftMs: null, totalMs: null });
    expect(db.get("SELECT value FROM _meta WHERE key='backupSchemaVersion'").value).toBe(String(SCHEMA_VERSION));
    const plan = db.all("EXPLAIN QUERY PLAN SELECT * FROM providerConnections WHERE provider=? AND authType=? AND name=?", ["openai", "apikey", "Retained"]).map(row => row.detail).join(" ");
    expect(plan).toContain("idx_pc_provider_auth_name");
    expect(plan).toContain("provider=? AND authType=? AND name=?");
    const backups = fs.readdirSync(path.join(directory, "db", "backups"));
    expect(backups).toHaveLength(1);
    const snapshot = new DatabaseSync(path.join(directory, "db", "backups", backups[0], "data.sqlite"), { readOnly: true });
    expect(snapshot.prepare("PRAGMA quick_check").get()).toEqual({ quick_check: "ok" });
    expect(snapshot.prepare("SELECT key FROM apiKeys").get().key).toBe("synthetic-client-key");
    expect(snapshot.prepare("SELECT tokens,cost FROM usageHistory").get()).toMatchObject({ tokens: '{"prompt_tokens":12}', cost: 0.04 });
    snapshot.close();
    await closeDb();
    await getAdapter();
    expect(fs.readdirSync(path.join(directory, "db", "backups"))).toEqual(backups);
  });

  it("does not count or load the whole account pool when inserting a named API-key connection", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const { createProviderConnection } = await import("@/lib/db/repos/connectionsRepo.js");
    const db = await getAdapter();
    const queries = vi.spyOn(db, "get");
    const rows = vi.spyOn(db, "all");
    for (let i = 0; i < 25; i++) await createProviderConnection({ provider: "openai", authType: "apikey", name: `Synthetic ${i}`, apiKey: `synthetic-key-${i}` });
    expect(queries.mock.calls.filter(([sql]) => /COUNT\(\*\).*providerConnections/i.test(sql))).toHaveLength(0);
    expect(rows.mock.calls.filter(([sql]) => /^SELECT \* FROM providerConnections WHERE provider = \?$/.test(sql))).toHaveLength(0);
    expect(db.get("SELECT COUNT(*) AS n FROM providerConnections").n).toBe(25);
  });
});
