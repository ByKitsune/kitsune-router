import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const fixtureRoot = "/tmp/opencode";
const fixtureGlobals = [
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts",
];
const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const provider = "synthetic-coverage-provider";
const model = "synthetic-coverage-model";
const axes = ["byProvider", "byModel", "byAccount", "byApiKey", "byEndpoint"];
const periods = ["today", "24h", "7d", "30d", "60d", "all"];
const mixedCoverage = {
  totalCost: { knownCost: 0.006, unknownRequests: 1 },
  inputCost: { knownCost: 0.004, unknownRequests: 0 },
  cachedCost: { knownCost: 0, unknownRequests: 0 },
  outputCost: { knownCost: 0.004, unknownRequests: 1 },
};
const indeterminate = { knownCost: null, unknownRequests: null };
let directory;
let previousGlobals;
let previousListeners;
let originalEmit;
let usage;
let pricing;
let db;

beforeEach(async () => {
  directory = await mkdtemp(join(fixtureRoot, "reconciliation-coverage-"));
  previousGlobals = new Map(fixtureGlobals.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
  previousListeners = new Map(shutdownEvents.map((event) => [event, process.rawListeners(event)]));
  originalEmit = process.emit;
  for (const [key, value] of Object.entries({
    DATA_DIR: join(directory, "data"), HOME: directory, TMPDIR: directory, TZ: "UTC",
    RUN_REAL: "0", RUN_E2E: "0", RUN_LIVE_TESTS: "0", AG_CACHE_TEST: "0",
    MODEL_CATALOG_SYNC: "off", DISABLE_BACKGROUND_TOKEN_REFRESH: "1",
    KITSUNE_ROUTER_DISABLE_MITM: "1", NEXT_TELEMETRY_DISABLED: "1",
    ENABLE_REQUEST_LOGS: "false", OBSERVABILITY_ENABLED: "false",
  })) vi.stubEnv(key, value);
  for (const key of fixtureGlobals) delete global[key];
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  usage = await import("@/lib/db/repos/usageRepo.js");
  pricing = await import("@/lib/db/repos/pricingRepo.js");
  const { getAdapter } = await import("@/lib/db/driver.js");
  db = await getAdapter();
});

afterEach(async () => {
  try {
    for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
    global._statsEmitter?.removeAllListeners();
    await global._dbAdapter?.instance?.close();
  } finally {
    process.emit = originalEmit;
    for (const event of shutdownEvents) {
      const existing = [...previousListeners.get(event)];
      for (const listener of process.rawListeners(event)) {
        const index = existing.indexOf(listener);
        if (index === -1) process.removeListener(event, listener);
        else existing.splice(index, 1);
      }
    }
    for (const key of fixtureGlobals) {
      const descriptor = previousGlobals.get(key);
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
    const resolved = await realpath(directory);
    if (dirname(resolved) !== await realpath(fixtureRoot) || !resolved.includes("reconciliation-coverage-")) {
      throw new Error(`Refusing to remove unexpected fixture directory: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

async function record(tariff, overrides = {}) {
  await pricing.updatePricing({ [provider]: { [model]: tariff } });
  const entry = {
    provider, model, connectionId: "synthetic-coverage-connection", apiKey: "sk-synthetic-coverage-key",
    endpoint: "/v1/chat/completions", timestamp: new Date().toISOString(),
    tokens: { prompt_tokens: 1000, completion_tokens: 500 }, ...overrides,
  };
  await usage.saveRequestUsage(entry);
  return entry;
}

function expectCoverage(stats, coverage, accountCoverage = [coverage]) {
  expect(stats.costCoverage).toEqual(coverage);
  for (const axis of axes) {
    if (axis === "byAccount") {
      expect(Object.values(stats[axis]), axis).toHaveLength(accountCoverage.length);
      expect(Object.values(stats[axis]).map(row => row.costCoverage), axis).toEqual(expect.arrayContaining(accountCoverage));
    } else {
      expect(Object.values(stats[axis]), axis).toHaveLength(1);
      expect(Object.values(stats[axis])[0].costCoverage, axis).toEqual(coverage);
    }
  }
}

const pricedAttemptCoverage = {
  totalCost: { knownCost: expect.closeTo(0.006, 12), unknownRequests: 0 },
  inputCost: { knownCost: expect.closeTo(0.002, 12), unknownRequests: 0 },
  cachedCost: { knownCost: 0, unknownRequests: 0 },
  outputCost: { knownCost: expect.closeTo(0.004, 12), unknownRequests: 0 },
};
function legacyCoverage(cost) {
  return {
    totalCost: cost === null ? indeterminate : { knownCost: cost, unknownRequests: 0 },
    inputCost: indeterminate, cachedCost: indeterminate, outputCost: indeterminate,
  };
}

function legacyDay(dateKey, cost) {
  const bucket = {
    requests: 1, promptTokens: 1000, completionTokens: 500, cost,
    rawModel: model, model, provider, connectionId: "synthetic-coverage-connection",
    apiKey: "sk-synthetic-coverage-key", endpoint: "/v1/chat/completions",
  };
  const day = {
    requests: 1, promptTokens: 1000, completionTokens: 500, cost,
    byProvider: { [provider]: { ...bucket } },
    byModel: { [`${model}|${provider}`]: { ...bucket } },
    byAccount: { "synthetic-coverage-connection": { ...bucket } },
    byApiKey: { [`sk-synthetic-coverage-key|${model}|${provider}`]: { ...bucket } },
    byEndpoint: { [`/v1/chat/completions|${model}|${provider}`]: { ...bucket } },
  };
  db.run("INSERT INTO usageDaily(dateKey, data) VALUES(?, ?)", [dateKey, JSON.stringify(day)]);
  return day;
}

describe("recorded cost coverage without repricing historical usage", () => {
  it.each([["known", "unknown"], ["unknown", "known"]])(
    "retains the known subtotal and unpriced count in all live/daily groups in %s then %s order",
    async (first, second) => {
      for (const kind of [first, second]) await record(kind === "known" ? { input: 2, output: 8 } : { input: 2 });
      for (const period of periods) {
        const stats = await usage.getUsageStats(period);
        expect(stats).toMatchObject({ totalRequests: 2, totalCost: null, inputCost: 0.004, cachedCost: 0, outputCost: null });
        expectCoverage(stats, mixedCoverage);
        for (const axis of axes) expect(Object.values(stats[axis])[0].cost).toBeNull();
      }
      const day = JSON.parse(db.get("SELECT data FROM usageDaily").data);
      expect(day.costCoverage).toEqual(mixedCoverage);
      for (const axis of axes) expect(Object.values(day[axis])[0].costCoverage, axis).toEqual(mixedCoverage);
      expect((await usage.getUsageHistory()).map((row) => row.cost)).toEqual(first === "known" ? [0.006, null] : [null, 0.006]);
    },
  );

  it("reports wholly unpriced usage as zero known subtotal plus measured unknown counts", async () => {
    await record({});
    const coverage = {
      totalCost: { knownCost: 0, unknownRequests: 1 },
      inputCost: { knownCost: 0, unknownRequests: 1 },
      cachedCost: { knownCost: 0, unknownRequests: 0 },
      outputCost: { knownCost: 0, unknownRequests: 1 },
    };
    for (const period of periods) expectCoverage(await usage.getUsageStats(period), coverage);
  });

  it("does not mistake free or zero-token rows for unpriced rows", async () => {
    await record({ input: 0, output: 0 });
    await record({}, { tokens: { prompt_tokens: 0, completion_tokens: 0 } });
    const coverage = {
      totalCost: { knownCost: 0, unknownRequests: 0 }, inputCost: { knownCost: 0, unknownRequests: 0 },
      cachedCost: { knownCost: 0, unknownRequests: 0 }, outputCost: { knownCost: 0, unknownRequests: 0 },
    };
    for (const period of periods) {
      const stats = await usage.getUsageStats(period);
      expect(stats).toMatchObject({ totalRequests: 2, totalCost: 0 });
      expectCoverage(stats, coverage);
    }
  });

  it("marks absent legacy row component coverage indeterminate without changing its recorded total", async () => {
    await record({ input: 2, output: 8 });
    db.run("UPDATE usageHistory SET meta = ?", ["{}"]);
    for (const period of ["today", "24h"]) {
      const stats = await usage.getUsageStats(period);
      expect(stats.totalCost).toBe(0.006);
      expectCoverage(stats, {
        totalCost: { knownCost: 0.006, unknownRequests: 0 },
        inputCost: indeterminate, cachedCost: indeterminate, outputCost: indeterminate,
      });
    }
    expect(db.get("SELECT cost, meta FROM usageHistory")).toMatchObject({ cost: 0.006, meta: "{}" });
  });

  it.each([0.012, null])("preserves legacy daily uncertainty for a snapshot cost of %j", async (cost) => {
    legacyDay("2026-10-20", cost);
    for (const period of ["7d", "30d", "60d", "all"]) {
      const stats = await usage.getUsageStats(period);
      expect(stats.totalCost).toBe(cost);
      expectCoverage(stats, {
        totalCost: cost === null ? indeterminate : { knownCost: 0.012, unknownRequests: 0 },
        inputCost: indeterminate, cachedCost: indeterminate, outputCost: indeterminate,
      });
    }
    expect(JSON.parse(db.get("SELECT data FROM usageDaily").data).costCoverage).toBeUndefined();
  });

  it.each([["2026-10-20", "2026-10-21"], ["2026-10-21", "2026-10-20"]])(
    "does not claim a complete subtotal when merging a null legacy snapshot from %s with new coverage on %s",
    async (oldDate, newDate) => {
      legacyDay(oldDate, null);
      await record({ input: 2, output: 8 }, { timestamp: `${newDate}T12:00:00.000Z` });
      for (const period of ["7d", "30d", "60d", "all"]) {
        const stats = await usage.getUsageStats(period);
        expect(stats.totalCost).toBeNull();
        expectCoverage(stats, { totalCost: indeterminate, inputCost: indeterminate, cachedCost: indeterminate, outputCost: indeterminate },
          [legacyCoverage(null), pricedAttemptCoverage]);
      }
    },
  );

  it.each([0.012, null])("preserves legacy coverage when appending to an existing day with recorded cost %j", async (cost) => {
    legacyDay("2026-10-21", cost);
    await record({ input: 2, output: 8 });
    const expected = {
      totalCost: cost === null ? indeterminate : { knownCost: expect.closeTo(0.018, 12), unknownRequests: 0 },
      inputCost: indeterminate, cachedCost: indeterminate, outputCost: indeterminate,
    };
    const day = JSON.parse(db.get("SELECT data FROM usageDaily").data);
    expect(day.costCoverage).toEqual(expected);
    for (const axis of axes.filter(axis => axis !== "byAccount")) {
      expect(Object.values(day[axis])[0].costCoverage, axis).toEqual(expected);
    }
    // New account/model identities coexist with the retained legacy aggregate;
    // do not move or reinterpret its cost when adding a precise new attempt.
    const retained = day.byAccount["synthetic-coverage-connection"];
    expect(retained).toMatchObject({ requests: 1, cost });
    expect(retained.costCoverage).toBeUndefined();
    const appended = Object.values(day.byAccount).find(row => row !== retained);
    expect(appended).toMatchObject({ requests: 1, rawModel: model, connectionId: "synthetic-coverage-connection" });
    expect(appended.costCoverage.totalCost).toEqual({ knownCost: expect.closeTo(0.006, 12), unknownRequests: 0 });
    expectCoverage(await usage.getUsageStats("all"), expected, [legacyCoverage(cost), pricedAttemptCoverage]);
  });

  it("combines exact coverage across days and repository reload without changing historical costs", async () => {
    await record({ input: 2, output: 8 }, { timestamp: "2026-10-20T12:00:00.000Z" });
    await record({ input: 2 });
    await pricing.updatePricing({ [provider]: { [model]: { input: 900, output: 900 } } });
    vi.resetModules();
    usage = await import("@/lib/db/repos/usageRepo.js");
    for (const period of ["7d", "30d", "60d", "all"]) expectCoverage(await usage.getUsageStats(period), mixedCoverage);
    expect((await usage.getUsageHistory()).map((row) => row.cost)).toEqual([0.006, null]);
    expect(db.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(2);
  });

  it("retains recorded legacy daily subtotals even when its optional request counts are absent", async () => {
    const day = legacyDay("2026-10-21", 0.012);
    delete day.requests;
    for (const axis of axes) for (const group of Object.values(day[axis])) delete group.requests;
    db.run("UPDATE usageDaily SET data = ?", [JSON.stringify(day)]);
    await record({ input: 2, output: 8 });
    const stats = await usage.getUsageStats("all");
    expect(stats.totalCost).toBeCloseTo(0.018, 12);
    expectCoverage(stats, {
      totalCost: { knownCost: expect.closeTo(0.018, 12), unknownRequests: 0 },
      inputCost: indeterminate, cachedCost: indeterminate, outputCost: indeterminate,
    }, [legacyCoverage(0.012), pricedAttemptCoverage]);
  });
});
