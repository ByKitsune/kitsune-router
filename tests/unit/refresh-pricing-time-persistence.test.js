import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousGlobals, listeners, db, pricing, usage;

beforeEach(async () => {
  directory = await mkdtemp("/tmp/opencode/refresh-time-pricing-");
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  vi.stubEnv("DATA_DIR", join(directory, "data"));
  vi.stubEnv("TMPDIR", directory);
  for (const key of globals) delete global[key];
  vi.resetModules();
  pricing = await import("../../src/lib/db/repos/pricingRepo.js");
  usage = await import("../../src/lib/db/repos/usageRepo.js");
  db = await (await import("../../src/lib/db/driver.js")).getAdapter();
});

afterEach(async () => {
  for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
  await global._dbAdapter?.instance?.close();
  for (const event of events) for (const listener of process.listeners(event)) {
    if (!listeners.get(event).has(listener)) process.removeListener(event, listener);
  }
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(global, key, descriptor);
    else delete global[key];
  }
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

const tokens = { prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 10000, reasoning_tokens: 6000 };

describe("DeepSeek native time-of-use estimates use recorded request time", () => {
  it.each([
    ["2026-10-21T00:59:59Z", 0.01806],
    ["2026-10-21T01:00:00Z", 0.03612],
    ["2026-10-21T03:59:59Z", 0.03612],
    ["2026-10-21T04:00:00Z", 0.01806],
    ["2026-10-21T06:00:00Z", 0.03612],
    ["2026-10-21T10:00:00Z", 0.01806],
    ["2026-10-24T06:30:00Z", 0.01806],
    ["2026-10-01T02:00:00Z", 0.01806],
    ["2026-10-07T06:30:00Z", 0.01806],
    ["2026-10-10T02:00:00Z", 0.01806],
    ["2026-10-21T09:00:00+08:00", 0.03612],
    ["2027-02-06T02:00:00Z", 0.01806],
    ["2027-02-08T12:00:00Z", 0.01806],
  ])("records the whole %s request at its applicable native tariff", async (timestamp, cost) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    await usage.saveRequestUsage({ provider: "deepseek", model: "deepseek-flash", timestamp, tokens });
    expect(db.get("SELECT cost FROM usageHistory").cost).toBeCloseTo(cost, 12);
  });

  it("keeps a saved input null and zero output above the published peak price", async () => {
    await pricing.updatePricing({ ds: { "deepseek-flash": { input: null, output: 0 } } });
    await usage.saveRequestUsage({ provider: "deepseek", model: "deepseek-flash", timestamp: "2026-10-21T02:00:00Z", tokens });
    const row = db.get("SELECT cost, meta FROM usageHistory");
    expect(row.cost).toBeNull();
    expect(JSON.parse(row.meta)).toMatchObject({ inputCost: null, cachedCost: 0.00012, outputCost: 0 });
  });

  it("applies native peak Pro pricing through an explicitly declared model alias", async () => {
    await usage.saveRequestUsage({ provider: "ds", model: "deepseek-v4-pro-max", timestamp: "2026-10-21T06:30:00Z", tokens });
    expect(db.get("SELECT cost FROM usageHistory").cost).toBeCloseTo(0.14608, 12);
  });

  it("does not apply a native DeepSeek schedule to a reseller's literal quote", async () => {
    await pricing.updatePricing({ tokenrouter: { "deepseek/deepseek-v4-pro": { input: 1, cached: 0.5, output: 2 } } });
    await usage.saveRequestUsage({ provider: "tokenrouter", model: "deepseek/deepseek-v4-pro", timestamp: "2026-10-21T06:30:00Z", tokens });
    expect(db.get("SELECT cost FROM usageHistory").cost).toBeCloseTo(0.11, 12);
  });

  it("leaves a request outside the dated schedule evidence unknown instead of extending it forever", async () => {
    await usage.saveRequestUsage({ provider: "deepseek", model: "deepseek-flash", timestamp: "2027-02-08T02:00:00Z", tokens });
    expect(db.get("SELECT cost FROM usageHistory").cost).toBeNull();
  });

  it("does not guess the timezone of an ambiguous local timestamp", async () => {
    await usage.saveRequestUsage({ provider: "deepseek", model: "deepseek-flash", timestamp: "2026-10-21T02:00:00", tokens });
    expect(db.get("SELECT cost FROM usageHistory").cost).toBeNull();
  });

  it.each(["2026-02-30T02:00:00Z", "2026-04-31T02:00:00Z"])("rejects a nonexistent calendar timestamp %s instead of billing its rolled-over date", async timestamp => {
    const quote = await pricing.getPricingForModel("deepseek", "deepseek-flash", { timestamp });
    const { calculateCostFromTokens } = await import("../../open-sse/providers/pricing.js");
    expect(calculateCostFromTokens(tokens, quote)).toBeNull();
  });

  it("never rewrites an already recorded entry when saving it after the wall clock or quote changes", async () => {
    const entry = { provider: "deepseek", model: "deepseek-flash", timestamp: "2026-10-21T02:00:00Z", tokens };
    await usage.saveRequestUsage(entry);
    await pricing.updatePricing({ deepseek: { "deepseek-flash": { input: 99, output: 99 } } });
    await usage.saveRequestUsage(entry);
    expect(db.all("SELECT cost FROM usageHistory")).toHaveLength(1);
    expect(db.get("SELECT cost FROM usageHistory").cost).toBeCloseTo(0.03612, 12);
  });
});

describe("Ollama Cloud time-of-use estimates in durable usage", () => {
  const sample = { prompt_tokens: 100, cached_tokens: 80, completion_tokens: 20, reasoning_tokens: 0 };
  it.each([
    ["2026-10-29T11:59:59Z", 0.00005456],
    ["2026-10-29T12:00:00Z", 0.00010912],
    ["2026-10-29T18:00:00Z", 0.00005456],
    ["2026-10-31T14:00:00Z", 0.00005456],
  ])("freezes the cloud credit estimate at request time %s", async (timestamp, expected) => {
    await usage.saveRequestUsage({ provider: "ollama", model: "deepseek-v4-pro", timestamp, tokens: sample });
    expect(db.get("SELECT cost FROM usageHistory").cost).toBeCloseTo(expected, 12);
  });
  it("keeps an operator's explicit rates above the scheduled defaults", async () => {
    await pricing.updatePricing({ ollama: { "deepseek-v4-pro": { input: 7, output: 0 } } });
    await usage.saveRequestUsage({ provider: "ollama", model: "deepseek-v4-pro", timestamp: "2026-10-29T06:00:00Z", tokens: sample });
    expect(db.get("SELECT cost FROM usageHistory").cost).toBeCloseTo(0.00014176, 12);
  });
});
