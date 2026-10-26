import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  usage: vi.fn(async () => ({ drained: true })),
  details: vi.fn(async () => ({ drained: true })),
  logs: vi.fn(async () => ({ drained: true })),
  pools: vi.fn(async () => ({ timedOut: false, livePools: 0, active: 0, queued: 0 })),
  close: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
  catalog: vi.fn(async () => {}),
}));
vi.mock("../../src/lib/usageDb.js", () => ({ flushUsageQueue: calls.usage, flushRequestDetails: calls.details }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ flushRequestLogs: calls.logs }));
vi.mock("../../open-sse/utils/transportPool.js", () => ({ closeUpstreamPools: calls.pools }));
vi.mock("../../src/lib/db/driver.js", () => ({ closeDb: calls.close }));
vi.mock("../../src/sse/services/backgroundTokenRefresh.js", () => ({ stopBackgroundTokenRefresh: calls.refresh }));
vi.mock("../../src/lib/modelCatalog/sync.js", () => ({ stopModelCatalogSync: calls.catalog }));
vi.mock("../../src/shared/services/quotaAutoPing.js", () => ({ stopQuotaAutoPing: async () => {} }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete globalThis[Symbol.for("kitsunerouter.runtime.lifecycle")];
  delete globalThis[Symbol.for("kitsunerouter.shutdown.lifecycle")];
  delete globalThis[Symbol.for("kitsunerouter.db.lifecycle")];
  vi.stubEnv("KITSUNE_ROUTER_MANAGED_SHUTDOWN", "1");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("managed runtime integration", () => {
  it("leaves direct adapter ownership unchanged without the managed entry", async () => {
    vi.stubEnv("KITSUNE_ROUTER_MANAGED_SHUTDOWN", "");
    const { installRuntimeLifecycle } = await import("../../src/lib/runtimeLifecycle.js");
    expect(installRuntimeLifecycle()).toBe(false);
    expect(globalThis[Symbol.for("kitsunerouter.db.lifecycle")].managed).toBe(false);
  });

  it("registers once, surrenders adapter exits and drains accounting before pools/database", async () => {
    const { installRuntimeLifecycle } = await import("../../src/lib/runtimeLifecycle.js");
    expect(installRuntimeLifecycle()).toBe(true);
    expect(installRuntimeLifecycle()).toBe(false);
    expect(globalThis[Symbol.for("kitsunerouter.db.lifecycle")].managed).toBe(true);
    const hooks = [...globalThis[Symbol.for("kitsunerouter.shutdown.lifecycle")].hooks.values()].sort((a, b) => a.phase - b.phase);
    expect(hooks.map(hook => hook.phase)).toEqual([10, 30, 40, 50, 60]);
    const deadline = Date.now() + 1000;
    for (const hook of hooks) await hook.callback({ deadline, remainingMs: 900 });
    expect(calls.refresh).toHaveBeenCalledWith({ drain: true });
    expect(calls.usage).toHaveBeenCalledWith({ deadline, stop: true });
    expect(calls.logs).toHaveBeenCalledWith({ deadline, stop: true });
    expect(calls.pools.mock.invocationCallOrder[0]).toBeGreaterThan(calls.usage.mock.invocationCallOrder[0]);
    expect(calls.close.mock.invocationCallOrder[0]).toBeGreaterThan(calls.pools.mock.invocationCallOrder[0]);
  });

  it("rejects an undrained authoritative queue but does not promote log failures to billing failures", async () => {
    const { installRuntimeLifecycle } = await import("../../src/lib/runtimeLifecycle.js");
    installRuntimeLifecycle();
    const hooks = globalThis[Symbol.for("kitsunerouter.shutdown.lifecycle")].hooks;
    calls.usage.mockResolvedValueOnce({ drained: false });
    await expect(hooks.get("durable-usage").callback({ deadline: Date.now() + 500 })).rejects.toThrow("USAGE_SHUTDOWN_NOT_DRAINED");
    calls.details.mockRejectedValueOnce(new Error("log unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try { await expect(hooks.get("request-logs").callback({ deadline: Date.now() + 500 })).resolves.toBeUndefined(); }
    finally { warning.mockRestore(); }
  });
});
