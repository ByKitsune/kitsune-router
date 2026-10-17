import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtureEnv = ["DATA_DIR", "TMPDIR", "JWT_SECRET", "API_KEY_SECRET", "MACHINE_ID_SALT"];
const usageGlobals = ["_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers"];
const shutdownEvents = ["beforeExit", "SIGINT", "SIGTERM", "exit"];
const provider = "usage-null-cost-fixture";
const model = "synthetic-metered-model";
const fullTariff = { input: 2, output: 8, cached: 0.5, cache_creation: 3, reasoning: 10 };
const defaultTokens = { prompt_tokens: 1000, completion_tokens: 500 };
let originalEnv;
let originalGlobals;
let originalAdapter;
let originalEmit;
let originalListeners;
let dataDir;
let usage;
let pricing;
let db;

function request(overrides = {}) {
  return {
    timestamp: new Date().toISOString(),
    provider,
    model,
    connectionId: "synthetic-connection",
    apiKey: "sk-synthetic-usage-key-not-a-secret",
    endpoint: "/v1/chat/completions",
    tokens: { ...defaultTokens },
    ...overrides,
  };
}

async function saveWithTariff(tariff, overrides = {}) {
  await pricing.updatePricing({ [provider]: { [model]: tariff } });
  const entry = request(overrides);
  await usage.saveRequestUsage(entry);
  return entry;
}

function expectGroupCosts(stats, expected, count) {
  for (const axis of ["byProvider", "byModel", "byAccount", "byApiKey", "byEndpoint"]) {
    const groups = Object.values(stats[axis]);
    expect(groups, axis).toHaveLength(1);
    expect(groups[0], axis).toMatchObject({ requests: count, cost: expected });
  }
}

beforeEach(async () => {
  originalEnv = Object.fromEntries(fixtureEnv.map((key) => [key, process.env[key]]));
  originalGlobals = Object.fromEntries(usageGlobals.map((key) => [key, global[key]]));
  originalAdapter = global._dbAdapter;
  originalEmit = process.emit;
  originalListeners = new Map(shutdownEvents.map((event) => [event, new Set(process.listeners(event))]));
  dataDir = await mkdtemp(join(tmpdir(), "zenrouter-usage-null-cost-"));
  process.env.DATA_DIR = join(dataDir, "data");
  process.env.TMPDIR = dataDir;
  process.env.JWT_SECRET = "synthetic-null-cost-jwt-secret-32-bytes-minimum";
  process.env.API_KEY_SECRET = "synthetic-null-cost-api-key-secret";
  process.env.MACHINE_ID_SALT = "synthetic-null-cost-machine-salt";
  for (const key of usageGlobals) delete global[key];
  delete global._dbAdapter;
  vi.resetModules();
  usage = await import("../../src/lib/db/repos/usageRepo.js");
  pricing = await import("../../src/lib/db/repos/pricingRepo.js");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-17T12:34:45.000Z"));
  const { getAdapter } = await import("../../src/lib/db/driver.js");
  db = await getAdapter();
});

afterEach(async () => {
  try {
    await global._dbAdapter?.instance?.close();
  } finally {
    vi.restoreAllMocks();
    for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
    vi.useRealTimers();
    process.emit = originalEmit;
    for (const event of shutdownEvents) {
      for (const listener of process.listeners(event)) {
        if (!originalListeners.get(event).has(listener)) process.removeListener(event, listener);
      }
    }
    for (const key of usageGlobals) {
      if (originalGlobals[key] === undefined) delete global[key];
      else global[key] = originalGlobals[key];
    }
    if (originalAdapter === undefined) delete global._dbAdapter;
    else global._dbAdapter = originalAdapter;
    for (const key of fixtureEnv) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    vi.resetModules();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  }
});

describe("SQLite usage consumers preserve unknown cost", () => {
  it("persists an unpriced request as NULL and retains unused zero components after history and ring reload", async () => {
    const entry = request();
    await usage.saveRequestUsage(entry);

    expect(db.get("SELECT cost, promptTokens, completionTokens FROM usageHistory"))
      .toMatchObject({ cost: null, promptTokens: 1000, completionTokens: 500 });
    expect(entry).toMatchObject({ cost: null, inputCost: null, cachedCost: 0, outputCost: null });
    expect((await usage.getUsageHistory())[0])
      .toMatchObject({ cost: null, inputCost: null, cachedCost: 0, outputCost: null });

    global._recentRing.items = [];
    global._recentRing.initialized = false;
    const active = await usage.getActiveRequests();
    expect(active.recentRequests).toHaveLength(1);
    expect(active.recentRequests[0]).toMatchObject({ cost: null, inputCost: null, cachedCost: 0, outputCost: null });
    expect(global._recentRing.items[0]).toMatchObject({ cost: null, inputCost: null, cachedCost: 0, outputCost: null });
  });

  it("keeps a known input subtotal when a used output tariff is unknown", async () => {
    const entry = await saveWithTariff({ input: 2 });
    expect(entry).toMatchObject({ cost: null, cachedCost: 0, outputCost: null });
    expect(entry.inputCost).toBeCloseTo(0.002, 12);
    const history = await usage.getUsageHistory();
    expect(history[0]).toMatchObject({ cost: null, cachedCost: 0, outputCost: null });
    expect(history[0].inputCost).toBeCloseTo(0.002, 12);

    const day = JSON.parse(db.get("SELECT data FROM usageDaily").data);
    expect(day).toMatchObject({ requests: 1, cost: null, cachedCost: 0, outputCost: null });
    expect(day.inputCost).toBeCloseTo(0.002, 12);
  });

  it.each([
    { label: "cache reads", tariff: { input: 2, output: 8 }, tokens: { prompt_tokens: 100, cached_tokens: 100 }, expected: { inputCost: 0, cachedCost: null, outputCost: 0 } },
    { label: "cache writes", tariff: { input: 2, output: 8 }, tokens: { prompt_tokens: 100, cache_creation_input_tokens: 100 }, expected: { inputCost: null, cachedCost: 0, outputCost: 0 } },
    { label: "non-reasoning output", tariff: { input: 2, output: null, reasoning: 10 }, tokens: { completion_tokens: 500, reasoning_tokens: 100 }, expected: { inputCost: 0, cachedCost: 0, outputCost: null } },
  ])("does not coerce an unknown used $label component when collapsing the breakdown", async ({ tariff, tokens, expected }) => {
    const entry = await saveWithTariff(tariff, { tokens });
    expect(entry).toMatchObject({ cost: null, ...expected });
    expect((await usage.getUsageHistory())[0]).toMatchObject({ cost: null, ...expected });
  });

  it.each([
    ["known", "unknown"],
    ["unknown", "known"],
  ])("propagates mixed request costs through every live/daily group and chart in %s then %s order", async (first, second) => {
    for (const kind of [first, second]) {
      await saveWithTariff(kind === "known" ? fullTariff : { input: 2 });
    }

    for (const period of ["today", "24h", "7d", "30d", "60d", "all"]) {
      const stats = await usage.getUsageStats(period);
      expect(stats, period).toMatchObject({ totalRequests: 2, totalPromptTokens: 2000, totalCompletionTokens: 1000, totalCost: null });
      expect(stats, period).toMatchObject({ inputCost: 0.004, cachedCost: 0, outputCost: null });
      expectGroupCosts(stats, null, 2);
      for (const axis of ["byProvider", "byModel", "byAccount", "byApiKey", "byEndpoint"]) {
        const group = Object.values(stats[axis])[0];
        expect(group, `${period}:${axis}`).toMatchObject({ inputCost: 0.004, cachedCost: 0, outputCost: null });
      }
      expect(stats.last10Minutes.filter((bucket) => bucket.requests > 0)).toEqual([
        { requests: 2, promptTokens: 2000, completionTokens: 1000, cost: null },
      ]);
    }
    for (const period of ["today", "24h", "7d", "30d", "60d"]) {
      const buckets = await usage.getChartData(period);
      const used = buckets.filter((bucket) => bucket.tokens > 0);
      expect(used, period).toHaveLength(1);
      expect(used[0], period).toMatchObject({ tokens: 3000, cost: null });
      expect(buckets.filter((bucket) => bucket.tokens === 0).every((bucket) => bucket.cost === 0)).toBe(true);
    }
  });

  it.each([
    ["known", "unknown"],
    ["unknown", "known"],
  ])("does not lose unknown costs while merging separate days in %s then %s order", async (first, second) => {
    const dates = [1, 2].map((daysAgo) => {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      date.setHours(12, 0, 0, 0);
      return date.toISOString();
    });
    for (const [index, kind] of [first, second].entries()) {
      await saveWithTariff(kind === "known" ? fullTariff : { input: 2 }, { timestamp: dates[index] });
    }
    for (const period of ["7d", "30d", "60d", "all"]) {
      const stats = await usage.getUsageStats(period);
      expect(stats).toMatchObject({ totalRequests: 2, totalCost: null });
      expectGroupCosts(stats, null, 2);
      expect(stats).toMatchObject({ inputCost: 0.004, cachedCost: 0, outputCost: null });
    }
    const usedBuckets = (await usage.getChartData("7d")).filter((bucket) => bucket.tokens > 0);
    expect(usedBuckets).toHaveLength(2);
    expect(usedBuckets.map((bucket) => bucket.cost)).toContain(null);
    expect(usedBuckets.find((bucket) => bucket.cost !== null).cost).toBeCloseTo(0.006, 12);
  });

  it("retains honest zeroes for both actual free tariffs and zero-token unpriced requests", async () => {
    await saveWithTariff({ input: 0, output: 0, cached: 0, cache_creation: 0, reasoning: 0 });
    await usage.saveRequestUsage(request({ model: "synthetic-unpriced-zero-usage", tokens: { prompt_tokens: 0, completion_tokens: 0 } }));
    expect((await usage.getUsageHistory()).map((row) => row.cost)).toEqual([0, 0]);
    for (const period of ["today", "24h", "7d", "all"]) {
      const stats = await usage.getUsageStats(period);
      expect(stats).toMatchObject({ totalRequests: 2, totalPromptTokens: 1000, totalCompletionTokens: 500, totalCost: 0 });
      expect(Object.values(stats.byModel).every((row) => row.cost === 0)).toBe(true);
      expect(stats.last10Minutes.every((row) => row.cost === 0)).toBe(true);
    }
    expect((await usage.getChartData("7d")).every((bucket) => bucket.cost === 0)).toBe(true);
  });

  it("keeps recorded known tariffs and custom overrides unchanged after later tariff edits", async () => {
    const entry = await saveWithTariff(fullTariff, {
      tokens: { prompt_tokens: 1000, cached_tokens: 200, cache_creation_input_tokens: 100, completion_tokens: 500, reasoning_tokens: 100 },
    });
    expect(entry.cost).toBeCloseTo(0.006, 12);
    expect(entry.inputCost).toBeCloseTo(0.0017, 12);
    expect(entry.cachedCost).toBeCloseTo(0.0001, 12);
    expect(entry.outputCost).toBeCloseTo(0.0042, 12);
    await pricing.updatePricing({ [provider]: { [model]: { input: 100, output: 100 } } });
    const row = (await usage.getUsageHistory())[0];
    expect(row.cost).toBeCloseTo(0.006, 12);
    expect(row.inputCost).toBeCloseTo(0.0017, 12);
    expect(row.outputCost).toBeCloseTo(0.0042, 12);
    for (const period of ["today", "7d", "all"]) {
      const stats = await usage.getUsageStats(period);
      expect(stats.totalCost).toBeCloseTo(0.006, 12);
      expect(Object.values(stats.byModel)[0].cost).toBeCloseTo(0.006, 12);
    }
  });

  it("preserves an existing published tariff and a partial custom override through an inherited context tier", async () => {
    const published = request({ provider: "openai", model: "gpt-4.1" });
    await usage.saveRequestUsage(published);
    expect((await usage.getUsageHistory({ provider: "openai" }))[0].cost).toBeCloseTo(0.006, 12);

    await pricing.updatePricing({ openai: { "gpt-5.4": { input: 0 } } });
    const overridden = request({ provider: "openai", model: "gpt-5.4", tokens: { prompt_tokens: 300000, completion_tokens: 1000 } });
    await usage.saveRequestUsage(overridden);
    expect(overridden.inputCost).toBe(0);
    expect(overridden.cost).toBeCloseTo(0.0225, 12);
    const stats = await usage.getUsageStats("today");
    expect(stats.totalRequests).toBe(2);
    expect(stats.totalCost).toBeCloseTo(0.0285, 12);
  });

  it("does not reprice a saved request object during a later endpoint backfill", async () => {
    const entry = await saveWithTariff(fullTariff, { endpoint: undefined });
    await pricing.updatePricing({ [provider]: { [model]: { input: 100, output: 100 } } });
    entry.endpoint = "/v1/chat/completions";
    await usage.saveRequestUsage(entry);
    expect(entry.cost).toBeCloseTo(0.006, 12);
    expect(global._recentRing.items).toHaveLength(1);
    expect(global._recentRing.items[0].cost).toBeCloseTo(0.006, 12);
    expect((await usage.getUsageHistory())[0]).toMatchObject({ endpoint: "/v1/chat/completions" });
    expect((await usage.getUsageHistory())[0].cost).toBeCloseTo(0.006, 12);
    expect((await usage.getUsageStats("all")).totalRequests).toBe(1);
  });

  it("does not reprice historical zero rows or mark absent legacy component fields unknown", async () => {
    const timestamp = new Date().toISOString();
    const date = new Date(timestamp);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    db.run("INSERT INTO usageHistory(timestamp, provider, model, promptTokens, completionTokens, cost, tokens, meta) VALUES(?, ?, ?, ?, ?, ?, ?, ?)", [timestamp, provider, model, 1000, 500, 0, JSON.stringify(defaultTokens), "{}"]);
    db.run("INSERT INTO usageDaily(dateKey, data) VALUES(?, ?)", [dateKey, JSON.stringify({
      requests: 1, promptTokens: 1000, completionTokens: 500, cost: 0,
      byProvider: { [provider]: { requests: 1, promptTokens: 1000, completionTokens: 500, cost: 0 } },
      byModel: { [`${model}|${provider}`]: { requests: 1, cost: 0, rawModel: model, provider } },
    })]);
    const history = await usage.getUsageHistory();
    expect(history[0].cost).toBe(0);
    expect(history[0].inputCost).toBeUndefined();
    for (const period of ["today", "24h", "7d", "all"]) {
      const stats = await usage.getUsageStats(period);
      expect(stats).toMatchObject({ totalRequests: 1, totalCost: 0 });
      expect(Object.values(stats.byModel)[0].cost).toBe(0);
      expect(Object.values(stats.byModel)[0].inputCost).toBeUndefined();
    }
    expect(db.get("SELECT cost, meta FROM usageHistory")).toMatchObject({ cost: 0, meta: "{}" });
  });

  it.each([
    { label: "positive input/output", tokens: defaultTokens, expected: { cost: null, inputCost: null, cachedCost: 0, outputCost: null } },
    { label: "cache-only input", tokens: { prompt_tokens: 100, cached_tokens: 100 }, expected: { cost: null, inputCost: 0, cachedCost: null, outputCost: 0 } },
    { label: "zero usage", tokens: { prompt_tokens: 0, completion_tokens: 0 }, expected: { cost: 0, inputCost: 0, cachedCost: 0, outputCost: 0 } },
  ])("saves $label with honest component costs when the calculator fails", async ({ tokens, expected }) => {
    await pricing.updatePricing({ [provider]: { [model]: fullTariff } });
    const calculator = await import("../../open-sse/providers/pricing.js");
    vi.spyOn(calculator, "calculateCostBreakdown").mockImplementation(() => {
      throw new Error("synthetic calculator failure");
    });
    const entry = request({ tokens });
    await usage.saveRequestUsage(entry);
    expect((await usage.getUsageHistory())[0]).toMatchObject(expected);
    expect(db.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(1);
  });

  it("serializes null through real chart and history API consumers without dropping usage", async () => {
    await saveWithTariff({ input: 2 });
    const { GET: chartGET } = await import("../../src/app/api/usage/chart/route.js");
    const { GET: historyGET } = await import("../../src/app/api/usage/history/route.js");
    const chartResponse = await chartGET(new Request("http://localhost/api/usage/chart?period=today"));
    expect(chartResponse.status).toBe(200);
    expect((await chartResponse.json()).filter((bucket) => bucket.tokens > 0)[0])
      .toMatchObject({ tokens: 1500, cost: null });
    const historyResponse = await historyGET();
    expect(historyResponse.status).toBe(200);
    const stats = await historyResponse.json();
    expect(stats).toMatchObject({ totalRequests: 1, totalPromptTokens: 1000, totalCompletionTokens: 500, totalCost: null });
    expectGroupCosts(stats, null, 1);
  });

  it("preserves explicit null while importing legacy JSON and leaves missing historical cost at zero", async () => {
    await db.close();
    const legacyDir = join(dataDir, "legacy-import");
    await mkdir(legacyDir);
    await writeFile(join(legacyDir, "usage.json"), JSON.stringify({ history: [
      request({ model: "legacy-null", cost: null, inputCost: null, cachedCost: 0, outputCost: null }),
      request({ model: "legacy-free", cost: 0 }),
      request({ model: "legacy-missing" }),
    ] }));
    process.env.DATA_DIR = legacyDir;
    for (const key of usageGlobals) delete global[key];
    delete global._dbAdapter;
    vi.resetModules();
    usage = await import("../../src/lib/db/repos/usageRepo.js");
    const history = await usage.getUsageHistory();
    expect(history.map((row) => row.cost)).toEqual([null, 0, 0]);
    expect(history[0]).toMatchObject({ inputCost: null, cachedCost: 0, outputCost: null });
    const stats = await usage.getUsageStats("24h");
    expect(stats).toMatchObject({ totalRequests: 3, totalPromptTokens: 3000, totalCompletionTokens: 1500, totalCost: null });
  });

  it.each([
    { label: "unknown", tariff: { input: 2 }, cost: null },
    { label: "known-free", tariff: { input: 0, output: 0 }, cost: 0 },
    { label: "known-paid", tariff: fullTariff, cost: 0.006 },
  ])("does not publish a false-zero Prometheus cost for $label pricing", async ({ tariff, cost }) => {
    await saveWithTariff(tariff);
    const { createDashboardAuthToken } = await import("../../src/lib/auth/dashboardSession.js");
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../../src/app/api/metrics/route.js");
    expect((await GET(new NextRequest("http://localhost/api/metrics"))).status).toBe(401);
    const token = await createDashboardAuthToken();
    const response = await GET(new NextRequest("http://localhost/api/metrics", {
      headers: { cookie: `auth_token=${token}` },
    }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toMatch(/^zenrouter_requests_total 1$/m);
    expect(text).toMatch(/^zenrouter_prompt_tokens_total 1000$/m);
    expect(text).toMatch(/^zenrouter_completion_tokens_total 500$/m);
    if (cost === null) expect(text).not.toMatch(/^zenrouter_cost_usd_total /m);
    else expect(text).toContain(`zenrouter_cost_usd_total ${cost}\n`);
  });
});
