import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousGlobals, listeners, db, usage, tracking, saveUsageStats;
const provider = "usage-integrity-fixture";
const model = "measured-model";

beforeEach(async () => {
  directory = await mkdtemp("/tmp/opencode/refresh-usage-integrity-");
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  vi.stubEnv("DATA_DIR", join(directory, "data"));
  vi.stubEnv("TMPDIR", directory);
  for (const key of globals) delete global[key];
  vi.resetModules();
  const pricing = await import("../../src/lib/db/repos/pricingRepo.js");
  usage = await import("../../src/lib/db/repos/usageRepo.js");
  tracking = await import("../../open-sse/utils/usageTracking.js");
  ({ saveUsageStats } = await import("../../open-sse/handlers/chatCore/requestDetail.js"));
  db = await (await import("../../src/lib/db/driver.js")).getAdapter();
  await pricing.updatePricing({ [provider]: { [model]: { input: 2, output: 10, cached: 0.1, cache_creation: 2.5, reasoning: 10 } } });
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
  vi.unstubAllEnvs(); vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("malformed real usage remains unknown through SQLite persistence", () => {
  it.each([
    ["negative reasoning", { reasoning_tokens: -1 }, { inputCost: 0.0002, cachedCost: 0 }],
    ["overflowing input string", { prompt_tokens: "1e999" }, { outputCost: 0.0001, cachedCost: 0 }],
    ["overflowing cache string", { cached_tokens: "1e999" }, { outputCost: 0.0001 }],
    ["negative legacy creation", { cache_creation_input_tokens: -1 }, { outputCost: 0.0001, cachedCost: 0 }],
  ])("does not record a complete price for %s after extraction and canonicalization", async (_name, counter, known) => {
    const raw = { prompt_tokens: 100, completion_tokens: 10, cached_tokens: 0, ...counter };
    const tokens = tracking.canonicalizeUsage(tracking.extractUsage({ usage: raw }));
    await usage.saveRequestUsage({ provider, model, tokens });
    const row = db.get("SELECT cost, tokens, meta FROM usageHistory");
    expect(row.cost).toBeNull();
    expect(JSON.parse(row.tokens)).toMatchObject({ usage_invalid: true });
    expect(JSON.parse(row.meta)).toMatchObject(known);
    const day = JSON.parse(db.get("SELECT data FROM usageDaily").data);
    expect(day.cost).toBeNull();
    expect(day.costCoverage.totalCost).toEqual({ knownCost: 0, unknownRequests: 1 });
  });

  it("persists marker-only real usage as unknown rather than silently skipping or fabricating a free charge", async () => {
    const tokens = tracking.canonicalizeUsage(tracking.extractUsage({ usage: { prompt_tokens: "1e999", completion_tokens: 0 } }));
    saveUsageStats({ provider, model, tokens, silent: true });
    await vi.waitFor(() => expect(db.get("SELECT cost, tokens FROM usageHistory")).toBeTruthy());
    const row = db.get("SELECT cost, tokens FROM usageHistory");
    expect(row.cost).toBeNull();
    expect(JSON.parse(row.tokens)).toMatchObject({ usage_invalid: true, completion_tokens: 0 });
  });

  it("does not fabricate billable token usage when actual usage is zero or absent", async () => {
    saveUsageStats({ provider, model, tokens: null, silent: true });
    saveUsageStats({ provider, model, tokens: tracking.canonicalizeUsage(tracking.extractUsage({ usage: {
      prompt_tokens: 0, input_tokens: 100, completion_tokens: 0, output_tokens: 10,
    } })), silent: true });
    await usage.saveRequestUsage({ provider, model: "flush-boundary", tokens: { prompt_tokens: 1, completion_tokens: 0 } });
    expect(db.all("SELECT model FROM usageHistory")).toEqual([{ model: "flush-boundary" }]);
  });
});

describe("canonical zero precedence is shared by cost, history, daily and recent usage", () => {
  it.each([
    ["input", { prompt_tokens: 0, input_tokens: 100, completion_tokens: 5 }, 0, 5, 0.00005],
    ["output", { prompt_tokens: 100, completion_tokens: 0, output_tokens: 10 }, 100, 0, 0.0002],
    ["both", { prompt_tokens: 0, input_tokens: 100, completion_tokens: 0, output_tokens: 10 }, 0, 0, 0],
  ])("keeps explicit %s zeroes above stale secondary counters", async (_name, tokens, promptTokens, completionTokens, cost) => {
    await usage.saveRequestUsage({ provider, model, tokens });
    const row = db.get("SELECT promptTokens, completionTokens, cost, tokens FROM usageHistory");
    expect(row).toMatchObject({ promptTokens, completionTokens, cost });
    expect(JSON.parse(row.tokens)).toEqual(tokens);
    const day = JSON.parse(db.get("SELECT data FROM usageDaily").data);
    expect(day).toMatchObject({ requests: 1, promptTokens, completionTokens, cost });
    expect(day.byProvider[provider]).toMatchObject({ promptTokens, completionTokens });
    const active = await usage.getActiveRequests();
    const stats = await usage.getUsageStats("all");
    expect(stats).toMatchObject({ totalPromptTokens: promptTokens, totalCompletionTokens: completionTokens, totalCost: cost });
    for (const recent of [active.recentRequests, stats.recentRequests]) {
      if (promptTokens === 0 && completionTokens === 0) expect(recent).toEqual([]);
      else expect(recent).toMatchObject([{ promptTokens, completionTokens }]);
    }
  });

  it("does not resurrect a stale cache-read count above canonical cached zero", async () => {
    const tokens = { prompt_tokens: 100, completion_tokens: 5, cached_tokens: 0, cache_read_input_tokens: 50, prompt_cache_hit_tokens: 60 };
    await usage.saveRequestUsage({ provider, model, tokens });
    expect(JSON.parse(db.get("SELECT data FROM usageDaily").data).cachedTokens).toBe(0);
    for (const period of ["all", "today", "24h"]) {
      const stats = await usage.getUsageStats(period);
      expect(stats.totalCachedTokens).toBe(0);
      expect(stats.recentRequests[0].cachedTokens).toBe(0);
    }
  });
});
