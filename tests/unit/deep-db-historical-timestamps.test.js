import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { captureExpectedDiagnostics } from "../helpers/expectedDiagnostics.js";

vi.mock("@/dashboardGuard", () => ({ hasValidCliToken: async request => request.headers.get("x-kitsune-router-cli-token") === "synthetic-history-token", isAuthenticated: async () => false }));
const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousGlobals, previousListeners, adapters, diagnostics;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-deep-db-time-"));
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  previousListeners = new Map(events.map(event => [event, process.rawListeners(event)]));
  for (const key of globals) delete globalThis[key];
  vi.stubEnv("HOME", directory);
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("TZ", "UTC");
  vi.stubEnv("KITSUNE_ROUTER_MIGRATION", "skip");
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T16:30:00.000Z"));
  adapters = new Set();
  diagnostics = captureExpectedDiagnostics();
});

afterEach(async () => {
  try {
    for (const timer of Object.values(globalThis._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(globalThis._statsEmitTimers || {})) clearTimeout(timer);
    if (globalThis._dbAdapter?.instance) adapters.add(globalThis._dbAdapter.instance);
    for (const adapter of adapters) await adapter.close();
    diagnostics.verify();
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const event of events) {
      for (const listener of process.rawListeners(event)) if (!previousListeners.get(event).includes(listener)) process.removeListener(event, listener);
    }
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    vi.unstubAllEnvs();
    vi.resetModules();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const rawOffset = "2026-11-17T23:00:00+07:00";
const rawQuote = '{ "quote": {"timestamp":"2026-11-17T23:00:00+07:00","pricing":{"input":2.5},"totalCost":0.125}, "operatorField":"retained" }';
const examples = [
  { timestamp: rawOffset, model: "retained-model", cost: 0.125, tokens: 10, meta: rawQuote },
  { timestamp: "2026-11-17T11:00:00.500-05:00", model: "retained-null", cost: null, tokens: 10 },
  { timestamp: "2026-11-17T16:XX:00.000Z", model: "unknown-clock", cost: 8, tokens: 100 },
  { timestamp: "2026-11-31T16:00:00.000Z", model: "unknown-calendar", cost: 4, tokens: 100 },
  { timestamp: "", model: "unknown-missing", cost: null, tokens: 10 },
  { timestamp: "2026-11-17T16:00:00.000", model: "unknown-zone", cost: 2, tokens: 10 },
  { timestamp: "2026-11-17T16:15:00.000Z", model: "retained-zero", cost: 0, tokens: 1 },
];

async function previousDatabase(rows = examples) {
  const { TABLES, buildCreateTableSql } = await import("@/lib/db/schema.js");
  fs.mkdirSync(path.join(directory, "db"));
  const file = path.join(directory, "db", "data.sqlite");
  const old = new DatabaseSync(file);
  for (const [name, definition] of Object.entries(TABLES)) {
    const columns = { ...definition.columns };
    if (name === "usageHistory") delete columns.sourceTimestamp;
    old.exec(buildCreateTableSql(name, { ...definition, columns }));
    for (const index of definition.indexes || []) if (!index.includes("idx_pc_provider_auth_name")) old.exec(index);
  }
  old.exec("INSERT INTO _meta(key,value) VALUES('schemaVersion','2'),('backupSchemaVersion','3'),('appVersion','1.0.8')");
  const write = old.prepare("INSERT INTO usageHistory(timestamp,provider,model,promptTokens,completionTokens,tokens,cost,meta) VALUES(?,?,?,?,?,?,?,?)");
  for (const row of rows) write.run(row.timestamp, "openai", row.model, row.tokens || 1, 0, JSON.stringify({ prompt_tokens: row.tokens || 1 }), row.cost ?? null, row.meta || null);
  old.close();
  return file;
}

async function directAdapter(driver, file) {
  let adapter;
  if (driver === "better-sqlite3") adapter = (await import("@/lib/db/adapters/betterSqliteAdapter.js")).createBetterSqliteAdapter(file);
  else if (driver === "node:sqlite") adapter = await (await import("@/lib/db/adapters/nodeSqliteAdapter.js")).createNodeSqliteAdapter(file);
  else adapter = await (await import("@/lib/db/adapters/sqljsAdapter.js")).createSqlJsAdapter(file);
  adapters.add(adapter);
  return adapter;
}

describe.each(["better-sqlite3", "node:sqlite", "sql.js"])("%s historical timestamp upgrade", driver => {
  it("preserves original instants/quotes/amounts and makes real API date windows correct", async () => {
    const file = await previousDatabase();
    const db = await directAdapter(driver, file);
    if (driver === "sql.js") diagnostics.expectWarn(expect.stringMatching(/^\[DB\]\[migrate\] pre-schema backup failed \(continuing\): unable to open database:/));
    const { runMigrationOnce } = await import("@/lib/db/migrate.js");
    await runMigrationOnce(db);
    expect(db.get("SELECT timestamp FROM usageHistory WHERE model='retained-model'").timestamp).toBe("2026-11-17T16:00:00.000Z");
    expect(db.get("SELECT sourceTimestamp,cost,meta FROM usageHistory WHERE model='retained-model'")).toMatchObject({ sourceTimestamp: rawOffset, cost: 0.125, meta: rawQuote });
    for (const original of examples.filter(row => row.model.startsWith("unknown-"))) {
      expect(db.get("SELECT timestamp,cost FROM usageHistory WHERE model=?", [original.model])).toMatchObject({ timestamp: original.timestamp, cost: original.cost });
    }
    await import("@/lib/db/driver.js");
    globalThis._dbAdapter.instance = db;
    const usage = await import("@/lib/db/repos/usageRepo.js");
    const inRange = await usage.getUsageHistory({ startDate: "2026-11-17T15:00:00.000Z", endDate: "2026-11-17T17:00:00.000Z" });
    expect(inRange.map(row => row.model).sort()).toEqual(["retained-model", "retained-null", "retained-zero"]);
    expect(await usage.getUsageHistory({ startDate: "2026-11-30T00:00:00.000Z", endDate: "2026-12-02T00:00:00.000Z" })).toEqual([]);
    expect(await usage.getUsageHistory()).toHaveLength(examples.length);
    const { GET } = await import("@/app/api/usage/stats/route.js");
    const response = await GET(new Request("http://localhost/api/usage/stats?period=today", { headers: { "x-kitsune-router-cli-token": "synthetic-history-token" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ totalRequests: 3, totalPromptTokens: 21, totalCost: null });
    if (driver !== "sql.js") {
      const names = fs.readdirSync(path.join(directory, "db", "backups"));
      expect(names).toHaveLength(1);
      const backup = new DatabaseSync(path.join(directory, "db", "backups", names[0], "data.sqlite"), { readOnly: true });
      try {
        expect(backup.prepare("PRAGMA quick_check").get()).toEqual({ quick_check: "ok" });
        expect(backup.prepare("SELECT timestamp,cost,meta FROM usageHistory WHERE model='retained-model'").get()).toMatchObject({ timestamp: rawOffset, cost: 0.125, meta: rawQuote });
      } finally { backup.close(); }
    }
    const { CANONICAL_USAGE_TIMESTAMP_SQL } = await import("@/lib/db/helpers/usageTimestamp.js");
    const plan = db.all(`EXPLAIN QUERY PLAN SELECT id FROM usageHistory WHERE timestamp >= ? AND timestamp <= ? AND ${CANONICAL_USAGE_TIMESTAMP_SQL}`,
      ["2026-11-17T15:00:00.000Z", "2026-11-17T17:00:00.000Z"]).map(row => row.detail).join(" ");
    expect(plan).toContain("idx_uh_ts");
    expect(plan).toMatch(/timestamp>\? AND timestamp<\?/);
    const beforeReopen = db.all("SELECT * FROM usageHistory ORDER BY id");
    await db.close();
    adapters.delete(db);
    const reopened = await directAdapter(driver, file);
    globalThis._dbAdapter.instance = reopened;
    await runMigrationOnce(reopened);
    expect(reopened.all("SELECT * FROM usageHistory ORDER BY id")).toEqual(beforeReopen);
  });
});

it("retries a rolled-back timestamp migration without changing original amounts or schema stamps", async () => {
  const file = await previousDatabase();
  const original = new DatabaseSync(file);
  original.exec("CREATE TRIGGER synthetic_refuse_time BEFORE UPDATE OF timestamp ON usageHistory WHEN OLD.model='retained-null' BEGIN SELECT RAISE(ABORT, 'synthetic timestamp failure'); END");
  original.close();
  const { getAdapter, closeDb } = await import("@/lib/db/driver.js");
  await expect(getAdapter()).rejects.toThrow("synthetic timestamp failure");
  const retained = new DatabaseSync(file);
  expect(retained.prepare("SELECT timestamp,cost,meta FROM usageHistory WHERE model='retained-model'").get()).toMatchObject({ timestamp: rawOffset, cost: 0.125, meta: rawQuote });
  expect(retained.prepare("SELECT value FROM _meta WHERE key='schemaVersion'").get().value).toBe("2");
  expect(retained.prepare("PRAGMA table_info(usageHistory)").all().map(column => column.name)).not.toContain("sourceTimestamp");
  retained.exec("DROP TRIGGER synthetic_refuse_time");
  retained.close();
  vi.setSystemTime(new Date("2026-11-17T16:30:01.000Z"));
  const repaired = await getAdapter();
  expect(repaired.get("SELECT timestamp FROM usageHistory WHERE model='retained-model'").timestamp).toBe("2026-11-17T16:00:00.000Z");
  const beforeReopen = repaired.all("SELECT * FROM usageHistory ORDER BY id");
  const backups = fs.readdirSync(path.join(directory, "db", "backups"));
  await closeDb();
  const reopened = await getAdapter();
  expect(reopened.all("SELECT * FROM usageHistory ORDER BY id")).toEqual(beforeReopen);
  expect(fs.readdirSync(path.join(directory, "db", "backups"))).toEqual(backups);
});

it("bounds backfill batches on a large history and does not reread all earlier IDs for every batch", async () => {
  const rows = Array.from({ length: 1201 }, (_, index) => ({ timestamp: rawOffset, model: `synthetic-${index}`, tokens: 1, cost: 0 }));
  const file = await previousDatabase(rows);
  const db = await directAdapter("node:sqlite", file);
  const reads = [];
  const all = db.all.bind(db);
  vi.spyOn(db, "all").mockImplementation((sql, parameters = []) => {
    const result = all(sql, parameters);
    if (/FROM usageHistory WHERE id > \?/i.test(sql)) reads.push({ parameters, count: result.length });
    return result;
  });
  await (await import("@/lib/db/migrate.js")).runMigrationOnce(db);
  expect(reads.length).toBeGreaterThanOrEqual(3);
  expect(reads.every(read => read.count <= 500)).toBe(true);
  expect(reads.map(read => read.parameters[0])).toEqual([...reads.map(read => read.parameters[0])].sort((a, b) => a - b));
  expect(db.get("SELECT COUNT(*) AS n FROM usageHistory WHERE timestamp=?", ["2026-11-17T16:00:00.000Z"]).n).toBe(1201);
});

it("normalizes legacy JSON instants while retaining unknown times and distinguishing missing/null costs from explicit zero", async () => {
  const history = [
    { timestamp: rawOffset, provider: "openai", model: "legacy-known", cost: 0.125, quote: { timestamp: rawOffset, pricing: { input: 2.5 }, totalCost: 0.125 }, tokens: { prompt_tokens: 9 } },
    { timestamp: "2026-11-17T16:XX:00.000Z", model: "legacy-invalid", cost: null },
    { timestamp: "2026-11-31T16:00:00.000Z", model: "legacy-invalid-day", cost: 7 },
    { model: "legacy-missing-cost" },
    { timestamp: null, model: "legacy-null-cost", cost: null },
    { timestamp: "2026-11-17T16:00:00.000Z", model: "legacy-free", cost: 0 },
  ];
  fs.writeFileSync(path.join(directory, "usage.json"), JSON.stringify({ history }));
  const { getAdapter } = await import("@/lib/db/driver.js");
  const db = await getAdapter();
  expect(db.get("SELECT timestamp,sourceTimestamp,cost,meta FROM usageHistory WHERE model='legacy-known'")).toMatchObject({ timestamp: "2026-11-17T16:00:00.000Z", sourceTimestamp: rawOffset, cost: 0.125 });
  expect(JSON.parse(db.get("SELECT meta FROM usageHistory WHERE model='legacy-known'").meta).quote).toEqual(history[0].quote);
  expect(db.get("SELECT timestamp,cost FROM usageHistory WHERE model='legacy-invalid'")).toMatchObject({ timestamp: history[1].timestamp, cost: null });
  expect(db.get("SELECT timestamp,cost FROM usageHistory WHERE model='legacy-invalid-day'")).toMatchObject({ timestamp: history[2].timestamp, cost: 7 });
  expect(db.get("SELECT timestamp,cost FROM usageHistory WHERE model='legacy-missing-cost'")).toMatchObject({ timestamp: "", cost: null });
  expect(db.get("SELECT timestamp,cost FROM usageHistory WHERE model='legacy-null-cost'")).toMatchObject({ timestamp: "", cost: null });
  expect(db.get("SELECT cost FROM usageHistory WHERE model='legacy-free'").cost).toBe(0);
  expect(JSON.parse(fs.readFileSync(path.join(directory, "usage.json"), "utf8"))).toEqual({ history });
});

it("normalizes queued pre-upgrade events on projection without rewriting their frozen quotes", async () => {
  vi.useFakeTimers();
  const file = await previousDatabase([]);
  const previous = new DatabaseSync(file);
  const event = { eventId: "queued-before-upgrade", timestamp: rawOffset, dateKey: "2026-11-17", provider: "openai", model: "queued", tokens: { prompt_tokens: 4 }, cost: 0.0125, quote: { timestamp: rawOffset, pricing: { input: 25 }, totalCost: 0.0125 } };
  const payload = JSON.stringify(event);
  previous.prepare("INSERT INTO usageOutbox(eventId,payload,bytes,acceptedAt) VALUES(?,?,?,?)").run(event.eventId, payload, Buffer.byteLength(payload), Date.now());
  previous.close();
  const { getAdapter } = await import("@/lib/db/driver.js");
  const db = await getAdapter();
  const usage = await import("@/lib/db/repos/usageRepo.js");
  expect(await usage.flushUsageQueue()).toMatchObject({ drained: true });
  expect(db.get("SELECT timestamp,sourceTimestamp,cost FROM usageHistory")).toMatchObject({ timestamp: "2026-11-17T16:00:00.000Z", sourceTimestamp: rawOffset, cost: event.cost });
  expect(JSON.parse(db.get("SELECT meta FROM usageHistory").meta).quote).toEqual(event.quote);
});
