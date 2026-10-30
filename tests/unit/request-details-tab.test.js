// Backend logic behind /dashboard/usage?tab=details.
// Covers crash-risk edge cases in getRequestDetails() used by
// /api/usage/request-details and /api/usage/providers.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getTokenCount, formatTokens, formatMilliseconds, hasInvalidTokens } from "../../src/app/(dashboard)/dashboard/usage/components/requestDetailUsage.js";

const fixtureEnv = ["DATA_DIR", "OBSERVABILITY_ENABLED", "ENABLE_REQUEST_LOGS"];
const shutdownEvents = ["beforeExit", "SIGINT", "SIGTERM", "exit"];
const usageGlobals = ["_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers"];
let originalEnv;
let originalDbAdapter;
let originalListeners;
let originalUsageGlobals;
let tempDir;
let db;
let adapter;

async function saveDetail(detail) {
  await db.saveRequestDetail(detail);
  await new Promise((r) => setTimeout(r, 120));
}

beforeAll(async () => {
  originalEnv = Object.fromEntries(fixtureEnv.map((key) => [key, process.env[key]]));
  originalDbAdapter = global._dbAdapter;
  originalUsageGlobals = Object.fromEntries(usageGlobals.map((key) => [key, global[key]]));
  for (const key of usageGlobals) delete global[key];
  originalListeners = new Map(shutdownEvents.map((event) => [event, new Set(process.listeners(event))]));
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kitsunerouter-details-tab-"));
  process.env.DATA_DIR = tempDir;
  // Exercise persisted settings rather than inherited observability overrides.
  delete process.env.OBSERVABILITY_ENABLED;
  delete process.env.ENABLE_REQUEST_LOGS;
  delete global._dbAdapter;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  await db.updateSettings({ enableObservability: true, observabilityBatchSize: 1 });
  const { getAdapter } = await import("@/lib/db/driver.js");
  adapter = await getAdapter();
});

afterAll(async () => {
  try {
    const state = global._dbAdapter;
    if (state?.initPromise) await state.initPromise;
    await state?.instance?.close();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  } finally {
    for (const event of shutdownEvents) {
      for (const listener of process.listeners(event)) {
        if (!originalListeners.get(event).has(listener)) process.removeListener(event, listener);
      }
    }
    for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
    for (const key of usageGlobals) {
      if (originalUsageGlobals[key] === undefined) delete global[key];
      else global[key] = originalUsageGlobals[key];
    }
    if (originalDbAdapter === undefined) delete global._dbAdapter;
    else global._dbAdapter = originalDbAdapter;
    for (const key of fixtureEnv) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    vi.resetModules();
  }
});

describe("request details — tab crash-risk cases", () => {
  it("corrupt data column → parseJson fallback {}, no throw", async () => {
    // Inject a row with invalid JSON directly, bypassing save path
    adapter.run(
      `INSERT INTO requestDetails(id, timestamp, provider, model, connectionId, status, data) VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ["corrupt-1", new Date().toISOString(), "openai", "gpt-4", null, "ok", "{not-valid-json"]
    );

    const res = await db.getRequestDetails({ provider: "openai" });
    expect(Array.isArray(res.details)).toBe(true);
    const corrupt = res.details.find((d) => Object.keys(d).length === 0);
    expect(corrupt).toEqual({});
  });

  it("pagination beyond last page → empty details, valid meta", async () => {
    const res = await db.getRequestDetails({ page: 9999, pageSize: 20 });
    expect(res.details).toEqual([]);
    expect(res.pagination.page).toBe(9999);
    expect(res.pagination.hasNext).toBe(false);
    expect(res.pagination.totalItems).toBeGreaterThanOrEqual(0);
  });

  it("invalid startDate → Invalid Date ISO throws inside getRequestDetails is caught upstream", async () => {
    // new Date("bad").toISOString() throws RangeError; verify it surfaces
    // so the API route's try/catch returns 500 rather than silent corruption.
    await expect(db.getRequestDetails({ startDate: "not-a-date" })).rejects.toThrow();
  });

  it("valid date filter range → no throw", async () => {
    const res = await db.getRequestDetails({
      startDate: "2020-01-01T00:00:00",
      endDate: "2999-01-01T00:00:00",
    });
    expect(Array.isArray(res.details)).toBe(true);
  });

  it("large pageSize (providers route uses 9999) → returns all, no crash", async () => {
    await saveDetail({
      id: "big-1", provider: "anthropic", model: "claude-3",
      status: "ok", tokens: { input_tokens: 5 },
      request: { method: "POST" }, response: { content: "hi" },
    });

    const res = await db.getRequestDetails({ pageSize: 9999 });
    expect(res.details.length).toBeGreaterThanOrEqual(1);
    expect(res.pagination.pageSize).toBe(9999);
  });

  it("oversized field → stored redacted + reparseable (no circular)", async () => {
    const huge = "x".repeat(20 * 1024);
    await saveDetail({
      id: "trunc-1", provider: "openai", model: "gpt-4",
      status: "ok", tokens: {},
      request: { blob: huge }, response: { content: "ok" },
    });

    const got = await db.getRequestDetailById("trunc-1");
    expect(got).toBeDefined();
    // Redacted field is a plain object safe for JSON.stringify in the drawer
    expect(() => JSON.stringify(got)).not.toThrow();
    expect(got.request.redacted).toBe(true);
  });

  it("missing tokens/timestamp on row → getInputTokens-style access safe", async () => {
    adapter.run(
      `INSERT INTO requestDetails(id, timestamp, provider, model, connectionId, status, data) VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ["sparse-1", new Date().toISOString(), "openai", null, null, null, JSON.stringify({ id: "sparse-1" })]
    );
    const got = await db.getRequestDetailById("sparse-1");
    expect(got.tokens).toBeUndefined();
    // Drawer reads tokens?.prompt_tokens — optional chaining tolerates undefined
    expect(got.tokens?.prompt_tokens || 0).toBe(0);
  });
});

describe("backupDbLite — excludes requestDetails, keeps critical data", () => {
  it("backup file omits requestDetails rows but keeps other tables", async () => {
    const { backupDbLite } = await import("@/lib/db/backup.js");
    await saveDetail({ id: "bk-1", provider: "openai", model: "m", status: "ok", tokens: {}, request: {}, response: {} });

    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "kitsunerouter-bklite-"));
    const dest = backupDbLite(adapter, backupDir);
    expect(fs.existsSync(dest)).toBe(true);

    // Open backup and assert requestDetails is empty, settings present.
    // node:sqlite is used instead of better-sqlite3 so verification works on
    // machines where the optional native build is unavailable (the driver
    // chain falls back to node:sqlite there anyway).
    const { DatabaseSync } = await import("node:sqlite");
    const bak = new DatabaseSync(dest);
    try {
      // requestDetails is fully excluded — table must not exist in the backup
      const rdTable = bak.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='requestDetails'").get();
      expect(rdTable).toBeUndefined();
      // Critical data preserved
      const st = bak.prepare("SELECT COUNT(*) c FROM settings").get();
      expect(Number(st.c)).toBeGreaterThanOrEqual(1);
    } finally {
      bak.close();
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
  });
});

describe("getDistinctProviders — providers route (no full-row parse)", () => {
  it("returns unique provider list without parsing data blobs", async () => {
    await saveDetail({ id: "dp-1", provider: "openai", model: "m", status: "ok", tokens: {}, request: {}, response: {} });
    await saveDetail({ id: "dp-2", provider: "anthropic", model: "m", status: "ok", tokens: {}, request: {}, response: {} });
    await saveDetail({ id: "dp-3", provider: "openai", model: "m", status: "ok", tokens: {}, request: {}, response: {} });

    const list = await db.getDistinctProviders();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toContain("openai");
    expect(list).toContain("anthropic");
    // No duplicates
    expect(new Set(list).size).toBe(list.length);
  });

  it("skips null providers, returns sorted", async () => {
    const list = await db.getDistinctProviders();
    expect(list.every((p) => p !== null)).toBe(true);
    const sorted = [...list].sort();
    expect(list).toEqual(sorted);
  });
});

describe("actual request-detail display counters", () => {
  it("undefined/null tokens stay unknown without throwing", () => {
    expect(getTokenCount(undefined, "input")).toBeNull();
    expect(getTokenCount(null, "input")).toBeNull();
    expect(getTokenCount(undefined, "cached")).toBeNull();
    expect(getTokenCount(null, "creation")).toBeNull();
  });

  it("empty object never invents a measured zero", () => {
    expect(getTokenCount({}, "input")).toBeNull();
    expect(getTokenCount({}, "cached")).toBeNull();
    expect(getTokenCount({}, "creation")).toBeNull();
  });

  it("prompt_tokens preferred, falls back to input_tokens", () => {
    expect(getTokenCount({ prompt_tokens: 100 }, "input")).toBe(100);
    expect(getTokenCount({ input_tokens: 50 }, "input")).toBe(50);
  });

  it("does not manufacture input from an inconsistent legacy cache count", () => {
    expect(getTokenCount({ prompt_tokens: 10, cached_tokens: 200 }, "input")).toBe(10);
  });

  it("cached via cache_read_input_tokens alias", () => {
    expect(getTokenCount({ cache_read_input_tokens: 42 }, "cached")).toBe(42);
  });

  it("formats unknown counters safely and distinguishes measured latency zero", () => {
    expect(formatTokens(undefined, "input")).toBe("—");
    expect(formatMilliseconds(0)).toBe("0ms");
    expect(formatMilliseconds(null)).toBe("—");
    expect(formatMilliseconds(-1)).toBe("—");
  });

  it("preserves explicit zero and null instead of falling through conflicting aliases", () => {
    expect(getTokenCount({ prompt_tokens: 0, input_tokens: 50 }, "input")).toBe(0);
    expect(getTokenCount({ cached_tokens: 0, cache_read_input_tokens: 42 }, "cached")).toBe(0);
    expect(getTokenCount({ prompt_tokens: null, input_tokens: 50 }, "input")).toBeNull();
  });

  it("recognizes native output aliases and preserves malformed usage as unknown", () => {
    expect(getTokenCount({ output_tokens: 17 }, "output")).toBe(17);
    expect(getTokenCount({ candidatesTokenCount: 0 }, "output")).toBe(0);
    expect(formatTokens({ completion_tokens: "17" }, "output")).toBe("17");
    expect(hasInvalidTokens({ completion_tokens: "17" })).toBe(false);
    expect(formatTokens({ completion_tokens: "8.5" }, "output")).toBe("—");
    expect(hasInvalidTokens({ completion_tokens: "8.5" })).toBe(true);
    expect(getTokenCount({ prompt_tokens: "0", input_tokens: 50 }, "input")).toBe(0);
    expect(getTokenCount({ prompt_tokens: " ", input_tokens: 50 }, "input")).toBeNull();
    expect(hasInvalidTokens({ cached_tokens: -1 })).toBe(true);
    expect(hasInvalidTokens({ usage_invalid: true })).toBe(true);
    expect(hasInvalidTokens({ cache_write_invalid: true })).toBe(true);
    expect(hasInvalidTokens({ prompt_tokens: 0, completion_tokens: 0 })).toBe(false);
  });
});

describe("API route contract — validation boundary", () => {
  let GET;
  beforeAll(async () => {
    ({ GET } = await import("@/app/api/usage/request-details/route.js"));
  });

  function makeReq(query) {
    return new Request(`http://localhost/api/usage/request-details?${query}`);
  }

  it("page=0 → 400 (guard now reachable after NaN-check fix)", async () => {
    const res = await GET(makeReq("page=0"));
    expect(res.status).toBe(400);
  });

  it("page=-5 → 400", async () => {
    const res = await GET(makeReq("page=-5"));
    expect(res.status).toBe(400);
  });

  it("pageSize=101 → 400", async () => {
    const res = await GET(makeReq("pageSize=101"));
    expect(res.status).toBe(400);
  });

  it("pageSize=abc (NaN) → defaults to 20, returns 200", async () => {
    const res = await GET(makeReq("pageSize=abc"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.pageSize).toBe(20);
  });

  it("invalid startDate → route catches, returns 500 (not thrown)", async () => {
    const res = await GET(makeReq("startDate=not-a-date"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("valid request → 200 with details + pagination shape", async () => {
    const res = await GET(makeReq("page=1&pageSize=20"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 20 });
  });
});
