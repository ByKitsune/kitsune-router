import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const fixtureRoot = tmpdir();
const fixtureGlobals = [
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts",
];
const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const provider = "synthetic-identity-provider";
const model = "synthetic-model-a";
let directory;
let previousGlobals;
let previousListeners;
let originalEmit;
let usage;
let pricing;

beforeEach(async () => {
  directory = await mkdtemp(join(fixtureRoot, "usage-identity-"));
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
  await getAdapter();
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
    if (dirname(resolved) !== await realpath(fixtureRoot) || !resolved.includes("usage-identity-")) {
      throw new Error(`Refusing to remove unexpected fixture directory: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

async function record({ model: rawModel = model, connectionId = "shared-connection", apiKey = "sk-synthetic-identity-key", provider: destination = provider } = {}) {
  await pricing.updatePricing({ [destination]: { [rawModel]: { input: 2, output: 8 } } });
  const entry = {
    provider: destination, model: rawModel, connectionId, apiKey,
    endpoint: "/v1/chat/completions", timestamp: new Date().toISOString(),
    tokens: { prompt_tokens: rawModel === model ? 1000 : 2000, completion_tokens: 100 },
  };
  await usage.saveRequestUsage(entry);
  return entry;
}

function identities(stats, axis) {
  return Object.values(stats[axis]).map(row => ({
    model: row.rawModel, provider: row.provider, connectionId: row.connectionId,
    requests: row.requests, promptTokens: row.promptTokens, completionTokens: row.completionTokens,
    cost: row.cost, costCoverage: row.costCoverage,
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

describe("usage identity survives live and durable daily aggregation", () => {
  it("keeps two models on one account separate in every period and after reopening SQLite", async () => {
    const first = await record();
    await record({ model: "synthetic-model-b" });
    // A repeated serialized event is still exactly one paid attempt.
    await usage.saveRequestUsage(structuredClone({ ...first, eventId: first.eventId }));
    const live = await usage.getUsageStats("today");
    expect(Object.values(live.byAccount)).toHaveLength(2);
    for (const period of ["24h", "7d", "30d", "60d", "all"]) {
      const stats = await usage.getUsageStats(period);
      expect(stats.totalRequests, period).toBe(2);
      expect(identities(stats, "byAccount"), period).toEqual(identities(live, "byAccount"));
    }
    await global._dbAdapter.instance.close();
    delete global._dbAdapter;
    vi.resetModules();
    usage = await import("@/lib/db/repos/usageRepo.js");
    expect(identities(await usage.getUsageStats("all"), "byAccount")).toEqual(identities(live, "byAccount"));
  });

  it("labels retained collapsed account allocations unknown without rewriting their money or history", async () => {
    await record();
    await record({ model: "synthetic-model-b" });
    const db = await (await import("@/lib/db/driver.js")).getAdapter();
    const stored = db.get("SELECT dateKey, data FROM usageDaily");
    const day = JSON.parse(stored.data);
    // Reproduce the pre-fix shape: all models absorbed into the account's
    // one bucket, while only the latest model name survived in metadata.
    day.byAccount = { "shared-connection": {
      requests: 2, promptTokens: 3000, completionTokens: 200, cachedTokens: 0,
      cost: 0.0076, inputCost: 0.006, cachedCost: 0, outputCost: 0.0016,
      rawModel: "synthetic-model-b", provider,
    } };
    const original = JSON.stringify(day);
    db.run("UPDATE usageDaily SET data = ? WHERE dateKey = ?", [original, stored.dateKey]);
    db.run("DELETE FROM usageHistory");
    for (const period of ["7d", "30d", "60d", "all"]) {
      const stats = await usage.getUsageStats(period);
      expect(stats).toMatchObject({ totalRequests: 2, totalPromptTokens: 3000, totalCompletionTokens: 200 });
      expect(Object.values(stats.byModel)).toHaveLength(2);
      expect(Object.values(stats.byAccount)).toEqual([expect.objectContaining({
        rawModel: "", modelAllocationUnknown: true, connectionId: "shared-connection", requests: 2,
        promptTokens: 3000, completionTokens: 200, cost: 0.0076,
      })]);
    }
    expect(db.get("SELECT data FROM usageDaily").data).toBe(original);
    await record();
    const stats = await usage.getUsageStats("all");
    expect(stats.totalRequests).toBe(3);
    expect(Object.values(stats.byAccount)).toHaveLength(2);
    expect(Object.values(stats.byAccount).find(row => row.modelAllocationUnknown))
      .toMatchObject({ rawModel: "", requests: 2, cost: 0.0076 });
    expect(Object.values(stats.byAccount).find(row => !row.modelAllocationUnknown))
      .toMatchObject({ rawModel: model, requests: 1, promptTokens: 1000 });
    expect(JSON.parse(db.get("SELECT data FROM usageDaily").data).byAccount["shared-connection"])
      .toEqual(day.byAccount["shared-connection"]);
  });

  it("never merges separate account connections that happen to share a display name", async () => {
    const { createProviderConnection } = await import("@/lib/db/repos/connectionsRepo.js");
    const first = await createProviderConnection({ provider, name: "Same friendly name", authType: "access_token", apiKey: "synthetic-first-key" });
    const second = await createProviderConnection({ provider, name: "Same friendly name", authType: "access_token", apiKey: "synthetic-second-key" });
    await record({ connectionId: first.id });
    await record({ connectionId: second.id });
    for (const period of ["today", "24h", "7d", "all"]) {
      const rows = Object.values((await usage.getUsageStats(period)).byAccount);
      expect(rows, period).toHaveLength(2);
      expect(new Set(rows.map(row => row.connectionId)).size, period).toBe(2);
      expect(rows.every(row => row.requests === 1 && row.promptTokens === 1000), period).toBe(true);
    }
  });

  it("keeps no-key usage separated by actual provider and model in live and daily views", async () => {
    await record({ apiKey: null });
    await record({ apiKey: null, model: "synthetic-model-b" });
    await record({ apiKey: null, provider: "another-synthetic-provider" });
    const daily = await usage.getUsageStats("all");
    expect(Object.values(daily.byApiKey)).toHaveLength(3);
    for (const period of ["today", "24h"]) {
      const stats = await usage.getUsageStats(period);
      expect(Object.values(stats.byApiKey), period).toHaveLength(3);
      expect(identities(stats, "byApiKey"), period).toEqual(identities(daily, "byApiKey"));
    }
  });
});
