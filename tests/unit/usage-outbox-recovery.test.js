import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
let directory, previous, db, adapter, usage;
const provider = "outbox-fixture", model = "measured";
const request = overrides => ({ eventId: "event-one", timestamp: "2026-10-26T12:00:00Z", provider, model, tokens: { prompt_tokens: 1000, completion_tokens: 500, cached_tokens: 100 }, ...overrides });

beforeEach(async () => {
  previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) delete globalThis[key];
  directory = await mkdtemp(join(tmpdir(), "zen-usage-outbox-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  db = await import("@/lib/db/index.js");
  usage = await import("@/lib/db/repos/usageRepo.js");
  adapter = await (await import("@/lib/db/driver.js")).getAdapter();
  await db.updatePricing({ [provider]: { [model]: { input: 2, output: 4, cached: 1 } } });
});

afterEach(async () => {
  await adapter?.close();
  vi.clearAllTimers(); vi.useRealTimers();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

async function crashAfterAccept({ project = false } = {}) {
  const driver = pathToFileURL(join(process.cwd(), "src/lib/db/driver.js")).href;
  const repo = pathToFileURL(join(process.cwd(), "src/lib/db/repos/usageRepo.js")).href;
  const outbox = pathToFileURL(join(process.cwd(), "src/lib/db/helpers/usageOutbox.js")).href;
  const payload = {
    ...request({ eventId: project ? "crash-projected" : "crash-accepted" }), dateKey: "2026-10-26",
    connectionId: null, apiKey: null, endpoint: null, status: "ok", cost: 0.0039, inputCost: 0.0018, cachedCost: 0.0001, outputCost: 0.002,
    quote: { timestamp: "2026-10-26T12:00:00Z", pricing: { input: 2, output: 4, cached: 1 } },
  };
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    const { getAdapter } = await import(${JSON.stringify(driver)});
    const { initializeUsagePersistence } = await import(${JSON.stringify(repo)});
    const { acceptOutbox, projectOutboxBatch } = await import(${JSON.stringify(outbox)});
    const db = await getAdapter();
    const state = initializeUsagePersistence(db); state.stopped = true; clearTimeout(state.timer);
    acceptOutbox(db, ${JSON.stringify(payload)});
    ${project ? "projectOutboxBatch(db, { force: true });" : ""}
    process.stdout.write("READY\\n"); setInterval(() => {}, 1000);
  `], { env: { PATH: process.env.PATH, HOME: directory, DATA_DIR: directory }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  const exited = new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", (code, signal) => resolve({ code, signal })); });
  await new Promise((resolve, reject) => {
    let text = "";
    child.stdout.on("data", chunk => { text += chunk; if (text.includes("READY\n")) resolve(); });
    child.on("error", reject);
    child.on("exit", code => { if (!text.includes("READY\n")) reject(new Error(stderr || `child exited ${code}`)); });
  });
  child.kill("SIGKILL");
  expect((await exited).signal).toBe("SIGKILL");
  return payload;
}

describe("durable usage acceptance and exactly-once projection", () => {
  it("accepts durably without query visibility, then projects frozen tokens, costs and delivered tier", async () => {
    const entry = request({ tokens: { prompt_tokens: 1000, completion_tokens: 500, cached_tokens: 100, cache_creation_5m_tokens: 10, cache_creation_1h_tokens: 20, actualServiceTier: "priority" } });
    await usage.enqueueRequestUsage(entry);
    expect(await usage.getUsageHistory()).toEqual([]);
    const accepted = JSON.parse(adapter.get("SELECT payload FROM usageOutbox").payload);
    expect(accepted.tokens).toEqual(entry.tokens);
    expect(accepted.quote).toMatchObject({ timestamp: entry.timestamp, pricing: { input: 2, output: 4, cached: 1 } });
    entry.tokens.prompt_tokens = 9_999_999;
    await db.updatePricing({ [provider]: { [model]: { input: 100, output: 100 } } });
    await usage.flushUsageQueue();
    const row = (await usage.getUsageHistory())[0];
    expect(row.tokens.prompt_tokens).toBe(1000);
    expect(row.tokens.actualServiceTier).toBe("priority");
    expect(row.cost).toBe(accepted.cost);
    expect(adapter.get("SELECT value FROM _meta WHERE key = 'totalRequestsLifetime'").value).toBe("1");
  });

  it("never field-deduplicates distinct requests but replays a serialized event once", async () => {
    await usage.saveRequestUsage(request({ eventId: "one" }));
    await usage.saveRequestUsage(request({ eventId: "two" }));
    await usage.saveRequestUsage(JSON.parse(JSON.stringify(request({ eventId: "one" }))));
    expect(await usage.getUsageHistory()).toHaveLength(2);
    expect((await usage.getUsageStats("all")).totalRequests).toBe(2);
    expect(adapter.get("SELECT value FROM _meta WHERE key = 'totalRequestsLifetime'").value).toBe("2");
  });

  it("rolls history/daily/lifetime back together and retries without premature JS markers or repricing", async () => {
    const entry = request();
    const run = adapter.run.bind(adapter);
    const fault = vi.spyOn(adapter, "run").mockImplementation((sql, params) => {
      if (sql.startsWith("INSERT INTO usageDaily")) throw Object.assign(new Error("simulated full"), { code: "SQLITE_FULL" });
      return run(sql, params);
    });
    await expect(usage.saveRequestUsage(entry)).rejects.toMatchObject({ code: "SQLITE_FULL" });
    expect(entry._persistedUsageId).toBeUndefined();
    expect(adapter.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(0);
    expect(adapter.get("SELECT COUNT(*) AS n FROM usageOutbox").n).toBe(1);
    expect(adapter.get("SELECT value FROM _meta WHERE key = 'totalRequestsLifetime'")).toBeUndefined();
    const snapshot = JSON.parse(adapter.get("SELECT payload FROM usageOutbox").payload);
    fault.mockRestore();
    await db.updatePricing({ [provider]: { [model]: { input: 200, output: 200 } } });
    await usage.saveRequestUsage(entry);
    expect(entry._persistedUsageId).toBeGreaterThan(0);
    expect(entry.cost).toBe(snapshot.cost);
    expect(adapter.get("SELECT COUNT(*) AS n FROM usageOutbox").n).toBe(0);
    expect((await usage.getUsageStats("all")).totalRequests).toBe(1);
  });

  it("surfaces failed acceptance and leaves no accepted marker", async () => {
    const entry = request();
    const run = adapter.run.bind(adapter);
    const fault = vi.spyOn(adapter, "run").mockImplementation((sql, params) => {
      if (sql.startsWith("INSERT INTO usageOutbox")) throw Object.assign(new Error("simulated busy"), { code: "SQLITE_BUSY" });
      return run(sql, params);
    });
    await expect(usage.enqueueRequestUsage(entry)).rejects.toMatchObject({ code: "SQLITE_BUSY" });
    expect(entry._persistedUsageId).toBeUndefined();
    expect(adapter.get("SELECT COUNT(*) AS n FROM usageOutbox").n).toBe(0);
    fault.mockRestore();
    await db.updatePricing({ [provider]: { [model]: { input: 200, output: 200 } } });
    await usage.saveRequestUsage(entry);
    expect(entry.cost).toBeCloseTo(0.0039, 10);
    expect(await usage.getUsageHistory()).toHaveLength(1);
  });

  it("recovers after SIGKILL following durable acceptance and does not duplicate a commit before acknowledgement", async () => {
    expect(adapter.driver).not.toBe("sql.js");
    await crashAfterAccept();
    expect(adapter.get("SELECT COUNT(*) AS n FROM usageOutbox").n).toBe(1);
    adapter.close();
    delete global._dbAdapter;
    vi.resetModules();
    usage = await import("@/lib/db/repos/usageRepo.js");
    adapter = await (await import("@/lib/db/driver.js")).getAdapter();
    await usage.flushUsageQueue();
    expect(await usage.getUsageHistory()).toHaveLength(1);
    const projected = await crashAfterAccept({ project: true });
    expect(await usage.getUsageHistory()).toHaveLength(2);
    await usage.saveRequestUsage(projected);
    expect(await usage.getUsageHistory()).toHaveLength(2);
    expect(adapter.get("SELECT value FROM _meta WHERE key = 'totalRequestsLifetime'").value).toBe("2");
  });

  it("retains incurred pending events over configuration import and keeps unknown costs distinct from free zeroes", async () => {
    await usage.enqueueRequestUsage(request({ eventId: "unknown", provider: "not-priced" }));
    await db.importDb({});
    await db.updatePricing({ free: { [model]: { input: 0, output: 0, cached: 0 } } });
    await usage.enqueueRequestUsage(request({ eventId: "free", provider: "free" }));
    await usage.flushUsageQueue();
    expect((await usage.getUsageHistory()).map(row => row.cost)).toEqual([null, 0]);
    expect((await usage.getUsageStats("all")).totalCost).toBeNull();
  });

  it("moves a late endpoint bucket atomically without repricing", async () => {
    const entry = request();
    await usage.saveRequestUsage(entry);
    entry.endpoint = "/v1/responses";
    await usage.saveRequestUsage(entry);
    const day = JSON.parse(adapter.get("SELECT data FROM usageDaily").data);
    expect(day.requests).toBe(1);
    expect(day.byEndpoint[`Unknown|${model}|${provider}`]).toBeUndefined();
    expect(day.byEndpoint[`/v1/responses|${model}|${provider}`].requests).toBe(1);
  });

  it("reclaims expired worker leases and reports bounded-outbox backpressure without dropping accepted events", async () => {
    const entry = request({ eventId: "leased" });
    await usage.enqueueRequestUsage(entry);
    adapter.run("UPDATE usageOutbox SET leaseOwner = ?, leaseUntil = ? WHERE eventId = ?", ["dead-worker", Date.now() - 1, entry.eventId]);
    await usage.flushUsageQueue();
    expect(await usage.getUsageHistory()).toHaveLength(1);
    adapter.run("UPDATE _meta SET value = '100000' WHERE key = 'usageOutboxDepth'");
    await expect(usage.enqueueRequestUsage(request({ eventId: "full" }))).rejects.toMatchObject({ code: "USAGE_OUTBOX_FULL" });
    expect(await usage.getUsageHistory()).toHaveLength(1);
    adapter.run("UPDATE _meta SET value = '0' WHERE key = 'usageOutboxDepth'");
    await usage.saveRequestUsage(request({ eventId: "full" }));
    expect(await usage.getUsageHistory()).toHaveLength(2);
  });

  it("enforces the event index on upgrades without deduplicating equal legacy rows", async () => {
    const { TABLES, buildCreateTableSql } = await import("@/lib/db/schema.js");
    const columns = Object.fromEntries(Object.entries(TABLES.usageHistory.columns).filter(([name]) => name !== "eventId"));
    adapter.exec("DROP TABLE usageHistory");
    adapter.exec(buildCreateTableSql("usageHistory", { ...TABLES.usageHistory, columns }));
    adapter.run("INSERT INTO usageHistory(timestamp, model) VALUES(?, ?)", [request().timestamp, "legacy"]);
    adapter.run("INSERT INTO usageHistory(timestamp, model) VALUES(?, ?)", [request().timestamp, "legacy"]);
    const migration = (await import("@/lib/db/migrations/002-durable-usage.js")).default;
    adapter.transaction(() => migration.up(adapter));
    expect(adapter.all("PRAGMA index_list(usageHistory)").find(row => row.name === "idx_uh_event").unique).toBe(1);
    await usage.saveRequestUsage(request());
    expect(() => adapter.run("INSERT INTO usageHistory(eventId, timestamp) VALUES(?, ?)", [request().eventId, request().timestamp])).toThrow();
    expect(adapter.get("SELECT COUNT(*) AS n FROM usageHistory WHERE model = 'legacy'").n).toBe(2);
  });
});
