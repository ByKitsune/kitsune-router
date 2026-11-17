import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousGlobals, previousListeners, usage;

beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-deep-db-usage-"));
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  previousListeners = new Map(events.map(event => [event, process.rawListeners(event)]));
  for (const key of globals) delete globalThis[key];
  vi.stubEnv("HOME", directory);
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("KITSUNE_ROUTER_MIGRATION", "skip");
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T12:00:00.000Z"));
  usage = await import("@/lib/db/repos/usageRepo.js");
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

describe("pending counters remain accurate for concurrent routed attempts", () => {
  it("retains expiry for an unfinished request when a sibling on the same account completes", async () => {
    usage.trackPendingRequest("model", "openai", "account", true);
    usage.trackPendingRequest("model", "openai", "account", true);
    usage.trackPendingRequest("model", "openai", "account", false);
    expect(globalThis._pendingRequests.byModel["model (openai)"]).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(globalThis._pendingRequests.byModel).toEqual({});
    expect(globalThis._pendingRequests.byAccount).toEqual({});
    expect(Object.keys(globalThis._pendingTimers)).toEqual([]);
  });

  it("expires only the matching account's share of a model total", async () => {
    usage.trackPendingRequest("model", "openai", "account-a", true);
    await vi.advanceTimersByTimeAsync(10_000);
    usage.trackPendingRequest("model", "openai", "account-b", true);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(globalThis._pendingRequests.byModel["model (openai)"]).toBe(1);
    expect(globalThis._pendingRequests.byAccount).toEqual({ "account-b": { "model (openai)": 1 } });
    usage.trackPendingRequest("model", "openai", "account-b", false);
    expect(globalThis._pendingRequests.byModel).toEqual({});
  });

  it("does not let an unmatched completion hide another account's pending request", () => {
    usage.trackPendingRequest("model", "openai", "account-b", true);
    usage.trackPendingRequest("model", "openai", "account-a", false);
    expect(globalThis._pendingRequests.byModel["model (openai)"]).toBe(1);
    expect(globalThis._pendingRequests.byAccount).toEqual({ "account-b": { "model (openai)": 1 } });
  });

  it("does not collide account/model tuple keys containing a separator", async () => {
    usage.trackPendingRequest("c", "", "a|b", true);
    await vi.advanceTimersByTimeAsync(10_000);
    usage.trackPendingRequest("b|c", "", "a", true);
    usage.trackPendingRequest("c", "", "a|b", false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(globalThis._pendingRequests.byModel).toEqual({});
    expect(globalThis._pendingRequests.byAccount).toEqual({});
  });

  it("handles imported prototype-like account/model IDs without changing object prototypes", () => {
    const prototype = Object.getPrototypeOf(globalThis._pendingRequests.byAccount);
    usage.trackPendingRequest("synthetic-model", "", "__proto__", true);
    expect(Object.hasOwn(globalThis._pendingRequests.byAccount, "__proto__")).toBe(true);
    expect(Object.hasOwn(Object.prototype, "synthetic-model")).toBe(false);
    expect(Object.getPrototypeOf(globalThis._pendingRequests.byAccount)).toBe(prototype);
    usage.trackPendingRequest("synthetic-model", "", "__proto__", false);
    expect(globalThis._pendingRequests.byAccount).toEqual({});
    usage.trackPendingRequest("constructor", "", "account", true);
    expect(globalThis._pendingRequests.byModel.constructor).toBe(1);
    usage.trackPendingRequest("constructor", "", "account", false);
    expect(globalThis._pendingRequests.byModel).toEqual({});
  });

  it("keeps tuple tracking private when pending gauges are serialized", () => {
    usage.trackPendingRequest("model", "openai", "account", true);
    expect(JSON.parse(JSON.stringify(globalThis._pendingRequests))).toEqual({ byModel: { "model (openai)": 1 }, byAccount: { account: { "model (openai)": 1 } } });
  });
});

describe("durable usage timestamps preserve indexed instants and unknown civil times", () => {
  it.each(["2026-11-17T19:00:00.123+07:00", "2026-11-17T07:00:00.123-05:00", "2026-11-17T12:00:00.123Z"])("records %s at the same instant without losing millisecond precision", async timestamp => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    await usage.saveRequestUsage({ eventId: "synthetic-timestamp", timestamp, provider: "synthetic", model: "synthetic", tokens: { prompt_tokens: 7, completion_tokens: 2 } });
    const db = await getAdapter();
    expect(db.get("SELECT timestamp FROM usageHistory").timestamp).toBe("2026-11-17T12:00:00.123Z");
    const rows = await usage.getUsageHistory({ startDate: "2026-11-17T12:00:00.000Z", endDate: "2026-11-17T12:00:00.999Z" });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokens).toMatchObject({ prompt_tokens: 7, completion_tokens: 2 });
    const meta = JSON.parse(db.get("SELECT meta FROM usageHistory").meta);
    expect(meta.quote.timestamp).toBe(timestamp);
    expect(new Date(meta.quote.timestamp).toISOString()).toBe("2026-11-17T12:00:00.123Z");
  });

  it.each(["UTC", "Asia/Jakarta", "America/New_York"])("retains zone-less usage without borrowing a known date bucket in %s", async timezone => {
    vi.stubEnv("TZ", timezone);
    const { getAdapter } = await import("@/lib/db/driver.js");
    const db = await getAdapter();
    const tokens = { prompt_tokens: 7, completion_tokens: 2 };
    await usage.saveRequestUsage({ eventId: "synthetic-known-instant", timestamp: "2026-11-17T12:00:00.123Z", provider: "deepseek", model: "deepseek-flash", tokens });
    const knownDaily = db.all("SELECT * FROM usageDaily");
    const entry = { eventId: "synthetic-unknown-zone", timestamp: "2026-11-17T12:00:00.123", provider: "deepseek", model: "deepseek-flash", tokens };
    await usage.saveRequestUsage(entry);
    const row = db.get("SELECT timestamp,sourceTimestamp,cost,meta FROM usageHistory WHERE eventId=?", [entry.eventId]);
    expect(row).toMatchObject({ timestamp: entry.timestamp, sourceTimestamp: null, cost: null });
    expect(JSON.parse(row.meta)).toMatchObject({ dateKey: null, quote: { timestamp: entry.timestamp, breakdown: { totalCost: null } } });
    expect(db.all("SELECT * FROM usageDaily")).toEqual(knownDaily);
    expect(await usage.getUsageHistory()).toHaveLength(2);
    const indexed = await usage.getUsageHistory({ startDate: "2026-11-16T00:00:00.000Z", endDate: "2026-11-18T00:00:00.000Z" });
    expect(indexed).toHaveLength(1);
    expect(indexed[0].timestamp).toBe("2026-11-17T12:00:00.123Z");
    expect(db.get("SELECT value FROM _meta WHERE key='totalRequestsLifetime'").value).toBe("2");
    // Later endpoint enrichment must not take the known request out of its
    // original Unknown endpoint aggregate just because its civil date matches.
    entry.endpoint = "/v1/chat/completions";
    await usage.saveRequestUsage(entry);
    expect(db.get("SELECT endpoint FROM usageHistory WHERE eventId=?", [entry.eventId]).endpoint).toBe(entry.endpoint);
    expect(db.all("SELECT * FROM usageDaily")).toEqual(knownDaily);
  });

  it.each(["2026-11-17T16:XX:00.000", "2026-02-30T02:00:00", "2026-04-31T02:00:00Z"])("rejects malformed or nonexistent new timestamps %s before durable admission", async timestamp => {
    await expect(usage.enqueueRequestUsage({ timestamp, provider: "deepseek", model: "deepseek-flash", tokens: { prompt_tokens: 7 } })).rejects.toThrow("Invalid usage timestamp");
    const db = await (await import("@/lib/db/driver.js")).getAdapter();
    expect(db.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(0);
    expect(db.get("SELECT COUNT(*) AS n FROM usageOutbox").n).toBe(0);
    expect(db.get("SELECT COUNT(*) AS n FROM usageDaily").n).toBe(0);
  });
});
