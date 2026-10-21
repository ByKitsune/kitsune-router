import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const envKeys = ["DATA_DIR", "TMPDIR", "JWT_SECRET", "API_KEY_SECRET", "MACHINE_ID_SALT", "OBSERVABILITY_ENABLED", "OBSERVABILITY_BATCH_SIZE"];
const globalKeys = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers"];
const signals = ["beforeExit", "SIGINT", "SIGTERM", "exit"];
let directory, oldEnv, oldGlobals, oldListeners, db, details, usage, buildRequestDetail, saveUsageStats;

beforeAll(async () => {
  oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  oldGlobals = Object.fromEntries(globalKeys.map(key => [key, global[key]]));
  oldListeners = new Map(signals.map(event => [event, new Set(process.listeners(event))]));
  directory = await mkdtemp("/tmp/opencode/backend-speed-db-");
  Object.assign(process.env, {
    DATA_DIR: join(directory, "data"), TMPDIR: directory,
    JWT_SECRET: "offline-speed-jwt-secret-at-least-32-characters",
    API_KEY_SECRET: "offline-speed-api-key-secret", MACHINE_ID_SALT: "offline-speed-machine-salt",
    OBSERVABILITY_ENABLED: "true", OBSERVABILITY_BATCH_SIZE: "1",
  });
  for (const key of globalKeys) delete global[key];
  vi.resetModules();
  ({ buildRequestDetail, saveUsageStats } = await import("../../open-sse/handlers/chatCore/requestDetail.js"));
  details = await import("../../src/lib/db/repos/requestDetailsRepo.js");
  usage = await import("../../src/lib/db/repos/usageRepo.js");
  db = await (await import("../../src/lib/db/driver.js")).getAdapter();
  await (await import("../../src/lib/db/repos/settingsRepo.js")).updateSettings({ enableObservability: true, observabilityBatchSize: 1 });
});

afterAll(async () => {
  await global._dbAdapter?.instance?.close();
  for (const key of ["_pendingTimers", "_statsEmitTimers"]) {
    for (const timer of Object.values(global[key] || {})) clearTimeout(timer);
  }
  for (const event of signals) {
    for (const listener of process.listeners(event)) {
      if (!oldListeners.get(event).has(listener)) process.removeListener(event, listener);
    }
  }
  for (const key of globalKeys) {
    if (oldGlobals[key] === undefined) delete global[key];
    else global[key] = oldGlobals[key];
  }
  for (const key of envKeys) {
    if (oldEnv[key] === undefined) delete process.env[key];
    else process.env[key] = oldEnv[key];
  }
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("service tier persistence through the real SQLite repository", () => {
  it("keeps requested/actual tiers after the request-details privacy allowlist", async () => {
    const detail = buildRequestDetail({
      provider: "openai", model: "gpt-6.1-sol", tokens: { prompt_tokens: 20, completion_tokens: 5 },
      serviceTier: { requestedServiceTier: "fast", actualServiceTier: "default" },
      request: { service_tier: "fast" }, providerResponse: { service_tier: "default" },
    }, { id: "offline-speed-detail" });
    await details.saveRequestDetail(detail);
    await vi.waitFor(() => expect(db.get("SELECT data FROM requestDetails WHERE id = ?", [detail.id])).toBeTruthy());
    const persisted = JSON.parse(db.get("SELECT data FROM requestDetails WHERE id = ?", [detail.id]).data);
    expect(persisted.request).toEqual({ redacted: true });
    expect(persisted.tokens).toMatchObject({ requestedServiceTier: "fast", actualServiceTier: "default" });
  });

  it.each([["default", 0.00009], ["priority", 0.00018]])("uses actual %s rather than requested Fast for persisted cost", async (actualServiceTier, expectedCost) => {
    const connectionId = `offline-${actualServiceTier}`;
    saveUsageStats({
      provider: "openai", model: "gpt-6.1-sol", tokens: { prompt_tokens: 20, completion_tokens: 5 },
      connectionId, silent: true, serviceTier: { requestedServiceTier: "fast", actualServiceTier },
    });
    await vi.waitFor(() => expect(db.get("SELECT cost FROM usageHistory WHERE connectionId = ?", [connectionId])).toBeTruthy());
    const row = (await usage.getUsageHistory()).find(entry => entry.connectionId === connectionId);
    expect(row.tokens).toMatchObject({ requestedServiceTier: "fast", actualServiceTier });
    expect(row.cost).toBeCloseTo(expectedCost, 10);
  });
});
