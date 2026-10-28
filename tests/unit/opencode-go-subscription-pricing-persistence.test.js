import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

// The database and every saved price/history row in this suite are synthetic.
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
let directory, previousGlobals, listeners, pricing, usage, db;
const timestamp = "2026-10-29T12:00:00Z";
const tokens = { prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 };

beforeEach(async () => {
  directory = await mkdtemp(join(process.env.TMPDIR || "/tmp/opencode", "go-cash-pricing-"));
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  vi.stubEnv("DATA_DIR", join(directory, "data"));
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected network request"); }));
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
  for (const event of events) for (const listener of process.listeners(event)) if (!listeners.get(event).has(listener)) process.removeListener(event, listener);
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(global, key, descriptor);
    else delete global[key];
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("Go cash pricing at the persistence boundary", () => {
  it("records unknown cash cost for older and new subscription models, including suffixed IDs", async () => {
    for (const model of ["kimi-k3", "kimi-k3(high)", "glm-5.2", "glm-5.3-flash", "deepseek-v4-pro", "deepseek-v4.1-flash", "glm-5.3", "kimi-k3.1-pro", "kimi-k3.1-pro(max)"]) {
      const quote = await pricing.getPricingForModel("ocg", model, { timestamp });
      expect(quote, model).toMatchObject({ input: null, output: null, cached: null, reasoning: null, cache_creation: null });
      await usage.saveRequestUsage({ eventId: `new-${model}`, provider: "opencode-go", model, timestamp, tokens });
      expect(db.get("SELECT cost FROM usageHistory WHERE eventId = ?", [`new-${model}`]).cost, model).toBeNull();
    }
  }, 30000);

  it("preserves old nonzero, zero and unknown history and honors explicit operator overrides", async () => {
    for (const [eventId, cost] of [["old-nonzero", 4.25], ["old-zero", 0], ["old-unknown", null]]) {
      db.run("INSERT INTO usageHistory(eventId, timestamp, provider, model, promptTokens, completionTokens, cost, tokens, meta) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [eventId, timestamp, "opencode-go", "kimi-k3", 1000000, 100000, cost, JSON.stringify(tokens), "{}"]);
    }
    const selectHistory = () => db.all("SELECT eventId, timestamp, provider, model, promptTokens, completionTokens, cost, tokens, meta FROM usageHistory WHERE eventId LIKE 'old-%' ORDER BY eventId");
    const previous = selectHistory();
    expect(previous.map(row => row.cost)).toEqual([4.25, null, 0]);

    await pricing.updatePricing({ ocg: { "kimi-k3": { input: 0, output: 3, cached: 0 }, "glm-5.2": { input: 0, output: 0, cached: 0 } } });
    const saved = await pricing.getSavedPricing();
    expect(saved.ocg["kimi-k3"]).toEqual({ input: 0, output: 3, cached: 0 });
    expect(await pricing.getPricingForModel("opencode-go", "kimi-k3(high)", { timestamp })).toMatchObject({ input: 0, output: 3, cached: 0 });
    await usage.saveRequestUsage({ eventId: "override-paid", provider: "opencode-go", model: "kimi-k3", timestamp, tokens });
    await usage.saveRequestUsage({ eventId: "override-zero", provider: "opencode-go", model: "glm-5.2", timestamp, tokens });
    expect(db.get("SELECT cost FROM usageHistory WHERE eventId = ?", ["override-paid"]).cost).toBeCloseTo(0.3, 12);
    expect(db.get("SELECT cost FROM usageHistory WHERE eventId = ?", ["override-zero"]).cost).toBe(0);
    expect(selectHistory()).toEqual(previous);

    await pricing.resetPricing("ocg", "kimi-k3");
    expect((await pricing.getSavedPricing()).ocg["glm-5.2"]).toEqual({ input: 0, output: 0, cached: 0 });
    await usage.saveRequestUsage({ eventId: "unknown-after-reset", provider: "opencode-go", model: "kimi-k3", timestamp, tokens });
    expect(db.get("SELECT cost FROM usageHistory WHERE eventId = ?", ["unknown-after-reset"]).cost).toBeNull();
    expect(selectHistory()).toEqual(previous);
  }, 30000);
});
