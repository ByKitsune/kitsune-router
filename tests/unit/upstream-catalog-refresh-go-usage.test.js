import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
let directory, previousGlobals, listeners, pricing, usage, db;

beforeEach(async () => {
  directory = await mkdtemp(join(process.env.TMPDIR || "/tmp/opencode", "go-catalog-usage-"));
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

describe("Go quota references at the usage ledger boundary", () => {
  it.each(["glm-5.3", "kimi-k3.1-pro", "kimi-k3.1-pro(high)"])("does not persist a cash charge for %s from its plan reference", async model => {
    const timestamp = "2026-10-29T12:00:00Z";
    const quote = await pricing.getPricingForModel("ocg", model, { timestamp });
    expect(quote).toMatchObject({ input: null, output: null, cached: null, cache_creation: null });
    await usage.saveRequestUsage({
      eventId: `synthetic-go-${model}`, provider: "opencode-go", model, timestamp,
      tokens: { prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 },
    });
    expect(db.get("SELECT cost FROM usageHistory WHERE eventId = ?", [`synthetic-go-${model}`]).cost).toBeNull();
  }, 30000);

  it("still honors an explicit operator cash-pricing override", async () => {
    const model = "kimi-k3.1-pro";
    await pricing.updatePricing({ "opencode-go": { [model]: { input: 0, output: 3 } } });
    expect(await pricing.getPricingForModel("ocg", model)).toMatchObject({ input: 0, output: 3, cached: null });
    await usage.saveRequestUsage({
      eventId: "synthetic-go-operator-override", provider: "opencode-go", model,
      timestamp: "2026-10-29T12:00:00Z", tokens: { prompt_tokens: 1000000, completion_tokens: 100000 },
    });
    expect(db.get("SELECT cost FROM usageHistory WHERE eventId = ?", ["synthetic-go-operator-override"]).cost).toBeCloseTo(0.3, 12);
  }, 30000);
});
