import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";

const calls = vi.hoisted(() => ({
  settings: vi.fn(), connections: vi.fn(), updateConnection: vi.fn(),
  cleanup: vi.fn(), updateSettings: vi.fn(), keys: vi.fn(), proxy: vi.fn(), refresh: vi.fn(),
  fetch: vi.fn(), claudeUsage: vi.fn(), codexUsage: vi.fn(), execute: vi.fn(),
  enableTunnel: vi.fn(), enableTailscale: vi.fn(), tunnel: vi.fn(), tailscale: vi.fn(),
  exitCallback: vi.fn(), kill: vi.fn(), cloudflaredRunning: vi.fn(), ensure: vi.fn(),
  tailscaleRunning: vi.fn(), tailscaleStrict: vi.fn(), daemon: vi.fn(), funnel: vi.fn(), internet: vi.fn(),
  mitmStatus: vi.fn(), mitmStart: vi.fn(), password: vi.fn(), dns: vi.fn(), removeDns: vi.fn(),
  aliases: vi.fn(), bridges: vi.fn(), managed: vi.fn(),
  usage: vi.fn(), details: vi.fn(), logs: vi.fn(), pools: vi.fn(), close: vi.fn(), catalog: vi.fn(),
}));

vi.mock("open-sse/index.js", () => ({}));
vi.mock("@/lib/localDb", () => ({
  getSettings: calls.settings, getProviderConnections: calls.connections, updateProviderConnection: calls.updateConnection,
  cleanupProviderConnections: calls.cleanup, updateSettings: calls.updateSettings, getApiKeys: calls.keys,
}));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: calls.proxy }));
vi.mock("@/app/api/usage/[connectionId]/route.js", () => ({ refreshAndUpdateCredentials: calls.refresh }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: calls.fetch }));
vi.mock("open-sse/providers/shared.js", () => ({ CLAUDE_CLI_SPOOF_HEADERS: {} }));
vi.mock("open-sse/services/tokenRefresh.js", () => ({ getRefreshLeadMs: () => 300000 }));
vi.mock("open-sse/services/oauthCredentialManager.js", () => ({
  getCredentialExpiryMs: value => value.expiresAt ? Date.parse(value.expiresAt) : null,
}));
vi.mock("open-sse/services/usage/claude.js", () => ({ getClaudeUsage: calls.claudeUsage }));
vi.mock("open-sse/services/usage/codex.js", () => ({ getCodexUsage: calls.codexUsage }));
vi.mock("open-sse/executors/index.js", () => ({ getExecutor: () => ({ execute: calls.execute }) }));
vi.mock("@/shared/constants/config", () => ({ QUOTA_AUTOPING_CONFIG: {
  tickIntervalMs: 60000, pingLeadMs: 5000, refreshAheadMs: 300000, failureCooldownMs: 900000,
  providers: {
    claude: { settingsKey: "claudeAutoPing", quotaKey: "session (5h)", pingModel: "fake-claude", pingMaxTokens: 1, pingText: "hi" },
    codex: { settingsKey: "codexAutoPing", quotaKey: "session", pingModel: "fake-codex", pingText: "hi", pingWhenResetAtSlides: true, resetAtDriftMs: 30000 },
  },
} }));
vi.mock("@/lib/tunnel", () => ({
  enableTunnel: calls.enableTunnel, enableTailscale: calls.enableTailscale,
  getTunnelService: calls.tunnel, getTailscaleService: calls.tailscale, setTunnelUnexpectedExitCallback: calls.exitCallback,
  killCloudflared: calls.kill, isCloudflaredRunning: calls.cloudflaredRunning, ensureCloudflared: calls.ensure,
  isTailscaleRunning: calls.tailscaleRunning, isTailscaleRunningStrict: calls.tailscaleStrict,
  isDaemonAlive: calls.daemon, startFunnel: calls.funnel, checkInternet: calls.internet,
  RESTART_COOLDOWN_MS: 120000, NETWORK_SETTLE_MS: 2500, WATCHDOG_INTERVAL_MS: 60000, NETWORK_CHECK_INTERVAL_MS: 5000,
  VIRTUAL_IFACE_REGEX: /^(lo|docker|veth)/,
}));
vi.mock("@/mitm/manager", () => ({
  getMitmStatus: calls.mitmStatus, startMitm: calls.mitmStart, loadEncryptedPassword: calls.password,
  initDbHooks: vi.fn(), restoreToolDNS: calls.dns, removeAllDNSEntriesSync: calls.removeDns,
}));
vi.mock("@/lib/mitmAliasCache", () => ({ syncToJson: calls.aliases }));
vi.mock("@/lib/mcp/stdioSseBridge", () => ({ killAllBridges: calls.bridges }));
vi.mock("@/lib/schedulerLifecycle.js", () => ({ shutdownAllManaged: calls.managed }));
vi.mock("../../src/lib/usageDb.js", () => ({ flushUsageQueue: calls.usage, flushRequestDetails: calls.details }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ flushRequestLogs: calls.logs }));
vi.mock("../../open-sse/utils/transportPool.js", () => ({ closeUpstreamPools: calls.pools }));
vi.mock("../../src/lib/db/driver.js", () => ({ closeDb: calls.close }));
vi.mock("../../src/lib/modelCatalog/sync.js", () => ({ stopModelCatalogSync: calls.catalog }));

const NOW = Date.parse("2026-01-01T12:00:00.000Z");
const connection = { id: "one", provider: "claude", authType: "oauth", accessToken: "synthetic-token" };
let quota, app, background, lifecycle, releases, tunnel, tailscale;

function held() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  releases.push(resolve);
  return { promise, resolve };
}

async function microtasks() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

async function startup(settings) {
  calls.settings.mockResolvedValue(settings);
  app = await import("../../src/shared/services/initializeApp.js");
  await app.initializeApp();
  await vi.advanceTimersByTimeAsync(3000);
  await vi.dynamicImportSettled();
  await microtasks();
}

function shutdown() {
  lifecycle.registerShutdownHook("test-database", 60, calls.close);
  return lifecycle.runShutdownHooks({ deadlineMs: 10000 });
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("KITSUNE_ROUTER_MANAGED_SHUTDOWN", "1");
  vi.stubEnv("DISABLE_BACKGROUND_TOKEN_REFRESH", "1");
  vi.stubEnv("KITSUNE_ROUTER_DISABLE_MITM", "");
  vi.stubEnv("MITM_SERVER_PATH", "/synthetic/mitm/server.js");
  delete global.__quotaAutoPing;
  delete global.__appSingleton;
  delete globalThis[Symbol.for("kitsunerouter.runtime.lifecycle")];
  delete globalThis[Symbol.for("kitsunerouter.db.lifecycle")];
  lifecycle = await import("../../src/lib/shutdownLifecycle.js");
  const state = globalThis[Symbol.for("kitsunerouter.shutdown.lifecycle")];
  state.hooks.clear();
  state.draining = false;
  state.pending = null;
  quota = app = background = null;
  releases = [];
  tunnel = { cancelToken: { cancelled: false }, spawnInProgress: false, lastRestartAt: 0, activeLocalPort: null };
  tailscale = { cancelToken: { cancelled: false }, spawnInProgress: false, lastRestartAt: 0, activeLocalPort: null };
  calls.settings.mockResolvedValue({ claudeAutoPing: { connections: { one: true } } });
  calls.connections.mockResolvedValue([connection]);
  calls.proxy.mockResolvedValue({});
  calls.refresh.mockImplementation(async value => ({ connection: value }));
  calls.claudeUsage.mockResolvedValue({ quotas: { "session (5h)": { resetAt: "2026-01-01T11:59:00.000Z" } } });
  calls.codexUsage.mockResolvedValue({ quotas: { session: { resetAt: "2026-01-01T17:01:00.000Z" } } });
  calls.fetch.mockResolvedValue({ ok: true, text: async () => "{}" });
  calls.execute.mockResolvedValue({ response: { ok: true, text: async () => "data: [DONE]\n\n" } });
  calls.updateConnection.mockResolvedValue({});
  calls.cleanup.mockResolvedValue();
  calls.keys.mockResolvedValue([{ key: "synthetic-key", isActive: true }]);
  calls.tunnel.mockReturnValue(tunnel);
  calls.tailscale.mockReturnValue(tailscale);
  calls.cloudflaredRunning.mockReturnValue(false);
  calls.tailscaleRunning.mockReturnValue(false);
  calls.tailscaleStrict.mockResolvedValue(false);
  calls.daemon.mockReturnValue(false);
  calls.internet.mockResolvedValue(true);
  calls.enableTunnel.mockResolvedValue({ success: true });
  calls.enableTailscale.mockResolvedValue({ success: true });
  calls.ensure.mockResolvedValue("/synthetic/cloudflared");
  calls.mitmStatus.mockResolvedValue({ running: false });
  calls.password.mockResolvedValue("synthetic-password");
  calls.mitmStart.mockResolvedValue();
  calls.dns.mockResolvedValue();
  calls.aliases.mockResolvedValue();
  calls.usage.mockResolvedValue({ drained: true });
  calls.details.mockResolvedValue({ drained: true });
  calls.logs.mockResolvedValue({ drained: true });
  calls.pools.mockResolvedValue({ timedOut: false, livePools: 0, active: 0, queued: 0 });
  calls.close.mockResolvedValue();
  calls.catalog.mockResolvedValue();
});

afterEach(async () => {
  for (const release of releases) release();
  if (quota) await quota.stopQuotaAutoPing({ drain: true });
  if (background) await background.stopBackgroundTokenRefresh({ drain: true });
  if (app) await app.stopApplicationStartup();
  if (global.__appSingleton?.exitHandler) process.off("exit", global.__appSingleton.exitHandler);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("quota producer shutdown", () => {
  it.each([
    ["settings", "connections"], ["connections", "proxy"], ["proxy", "refresh"],
    ["refresh", "claudeUsage"], ["claudeUsage", "fetch"], ["fetch", "updateConnection"],
  ])("waits for held %s and does not admit %s after stop", async (stage, next) => {
    const gate = held();
    const value = calls[stage].getMockImplementation();
    calls[stage].mockImplementation(async (...args) => { await gate.promise; return value(...args); });
    quota = await import("../../src/shared/services/quotaAutoPing.js");
    quota.startQuotaAutoPing();
    await microtasks();
    expect(calls[stage]).toHaveBeenCalledTimes(1);
    const active = global.__quotaAutoPing.activeTick;
    let stopped = false;
    const stop = quota.stopQuotaAutoPing({ drain: true }).then(() => { stopped = true; });
    expect(vi.getTimerCount()).toBe(0);
    quota.startQuotaAutoPing();
    await quota.runQuotaAutoPingTick();
    await vi.advanceTimersByTimeAsync(180000);
    expect(calls[stage]).toHaveBeenCalledTimes(1);
    expect(stopped).toBe(false);
    expect(global.__quotaAutoPing.activeTick).toBe(active);
    gate.resolve();
    await stop;
    expect(calls[next]).not.toHaveBeenCalled();
    expect(global.__quotaAutoPing.activeTick).toBeNull();
  });

  it("retains the real credential commit barrier across hot reload without aborting it", async () => {
    const commit = held();
    const events = [];
    calls.refresh.mockImplementation(async value => {
      events.push("token-acquired");
      await commit.promise;
      events.push("token-committed");
      return { connection: value };
    });
    quota = await import("../../src/shared/services/quotaAutoPing.js");
    const active = quota.runQuotaAutoPingTick();
    await microtasks();
    const copy = await import("../../src/shared/services/quotaAutoPing.js?hmr=commit");
    expect(copy.runQuotaAutoPingTick()).toBe(active);
    lifecycle.registerShutdownHook("quota", 10, () => copy.stopQuotaAutoPing({ drain: true }));
    const stop = shutdown();
    await microtasks();
    expect(events).toEqual(["token-acquired"]);
    expect(calls.close).not.toHaveBeenCalled();
    expect(calls.refresh.mock.calls[0]).toHaveLength(3);
    commit.resolve();
    await stop;
    expect(events).toEqual(["token-acquired", "token-committed"]);
    expect(calls.close).toHaveBeenCalledTimes(1);
    expect(calls.claudeUsage).not.toHaveBeenCalled();
  });

  it("lets settings disable then re-enable restart, but not a drained process", async () => {
    quota = await import("../../src/shared/services/quotaAutoPing.js");
    quota.configureQuotaAutoPing({ claudeAutoPing: { connections: { one: true } } });
    await global.__quotaAutoPing.activeTick;
    await quota.configureQuotaAutoPing({});
    expect(vi.getTimerCount()).toBe(0);
    quota.configureQuotaAutoPing({ claudeAutoPing: { connections: { one: true } } });
    await global.__quotaAutoPing.activeTick;
    expect(calls.fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    await quota.stopQuotaAutoPing({ drain: true });
    quota.configureQuotaAutoPing({ claudeAutoPing: { connections: { one: true } } });
    expect(vi.getTimerCount()).toBe(0);
    expect(calls.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not revive an old tick when opt-out and opt-in race its refresh", async () => {
    const gate = held();
    calls.refresh.mockImplementation(async value => { await gate.promise; return { connection: value }; });
    quota = await import("../../src/shared/services/quotaAutoPing.js");
    quota.startQuotaAutoPing();
    await microtasks();
    const stop = quota.stopQuotaAutoPing();
    quota.startQuotaAutoPing();
    gate.resolve();
    await stop;
    expect(calls.claudeUsage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls.claudeUsage).toHaveBeenCalledTimes(1);
  });

  it("drains Claude response bytes before marking a reset and waits for EOF during stop", async () => {
    let body;
    const cancelled = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { body = controller; }, cancel: cancelled }));
    calls.fetch.mockResolvedValue(response);
    quota = await import("../../src/shared/services/quotaAutoPing.js");
    const tick = quota.runQuotaAutoPingTick();
    await microtasks();
    body.enqueue(new TextEncoder().encode("{\"content\":[]}"));
    await microtasks();
    expect(calls.updateConnection).not.toHaveBeenCalled();
    let drained = false;
    const stop = quota.stopQuotaAutoPing({ drain: true }).then(() => { drained = true; });
    await microtasks();
    expect(drained).toBe(false);
    body.close();
    await Promise.all([tick, stop]);
    expect(response.bodyUsed).toBe(true);
    expect(response.body.locked).toBe(false);
    expect(cancelled).not.toHaveBeenCalled();
    expect(calls.updateConnection).not.toHaveBeenCalled();
  });

  it("reads successful Codex streams to EOF instead of cancelling their quota-window request", async () => {
    calls.settings.mockResolvedValue({ codexAutoPing: { connections: { one: true } } });
    calls.connections.mockResolvedValue([{ ...connection, provider: "codex" }]);
    let body;
    const cancelled = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { body = controller; }, cancel: cancelled }));
    calls.execute.mockResolvedValue({ response });
    quota = await import("../../src/shared/services/quotaAutoPing.js");
    global.__quotaAutoPing.resetCache["codex:one"] = "2026-01-01T17:00:00.000Z";
    const tick = quota.runQuotaAutoPingTick();
    await microtasks();
    expect(calls.execute).toHaveBeenCalledTimes(1);
    body.enqueue(new TextEncoder().encode("data: partial\n\n"));
    let drained = false;
    const stop = quota.stopQuotaAutoPing({ drain: true }).then(() => { drained = true; });
    await microtasks();
    expect(drained).toBe(false);
    body.close();
    await Promise.all([tick, stop]);
    expect(cancelled).not.toHaveBeenCalled();
    expect(response.body.locked).toBe(false);
    expect(calls.updateConnection).not.toHaveBeenCalled();
  });

  it("waits for rejected Codex response cancellation to settle", async () => {
    calls.settings.mockResolvedValue({ codexAutoPing: { connections: { one: true } } });
    calls.connections.mockResolvedValue([{ ...connection, provider: "codex" }]);
    const gate = held();
    const cancel = vi.fn(() => gate.promise);
    calls.execute.mockResolvedValue({ response: { ok: false, body: { cancel } } });
    quota = await import("../../src/shared/services/quotaAutoPing.js");
    global.__quotaAutoPing.resetCache["codex:one"] = "2026-01-01T17:00:00.000Z";
    const tick = quota.runQuotaAutoPingTick();
    await microtasks();
    expect(cancel).toHaveBeenCalledTimes(1);
    let drained = false;
    const stop = quota.stopQuotaAutoPing({ drain: true }).then(() => { drained = true; });
    await microtasks();
    expect(drained).toBe(false);
    gate.resolve();
    await Promise.all([tick, stop]);
    expect(calls.updateConnection).not.toHaveBeenCalled();
  });

  it("runtime phase 10 waits for an already admitted metadata write before DB phase 60", async () => {
    const gate = held();
    const events = [];
    calls.updateConnection.mockImplementation(async () => { await gate.promise; events.push("write"); });
    calls.close.mockImplementation(async () => { events.push("database"); });
    quota = await import("../../src/shared/services/quotaAutoPing.js");
    quota.startQuotaAutoPing();
    await microtasks();
    expect(calls.updateConnection).toHaveBeenCalledTimes(1);
    const { installRuntimeLifecycle } = await import("../../src/lib/runtimeLifecycle.js");
    installRuntimeLifecycle();
    const stop = lifecycle.runShutdownHooks({ deadlineMs: 10000 });
    await vi.dynamicImportSettled();
    await microtasks();
    expect(calls.close).not.toHaveBeenCalled();
    expect(global.__quotaAutoPing.interval).toBeNull();
    gate.resolve();
    await stop;
    expect(events).toEqual(["write", "database"]);
    await vi.advanceTimersByTimeAsync(180000);
    expect(events).toEqual(["write", "database"]);
    expect(calls.fetch).toHaveBeenCalledTimes(1);
  });

  it("disposes a real loopback HTTP response before the stop barrier resolves", async () => {
    vi.useRealTimers();
    const headers = held();
    let response;
    const server = http.createServer((_request, res) => {
      response = res;
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
      headers.resolve();
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      calls.claudeUsage.mockResolvedValue({ quotas: { "session (5h)": { resetAt: new Date(Date.now() - 1000).toISOString() } } });
      calls.fetch.mockImplementation((_url, options) => fetch(`http://127.0.0.1:${server.address().port}/ping`, options));
      quota = await import("../../src/shared/services/quotaAutoPing.js");
      const tick = quota.runQuotaAutoPingTick();
      await headers.promise;
      let drained = false;
      const stop = quota.stopQuotaAutoPing({ drain: true }).then(() => { drained = true; });
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(drained).toBe(false);
      response.end("}");
      await Promise.all([tick, stop]);
      expect(drained).toBe(true);
      expect(calls.updateConnection).not.toHaveBeenCalled();
    } finally {
      response?.end();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
});

describe("owned startup and restart shutdown", () => {
  it("keeps the three-second defer and cancels startup that has not begun", async () => {
    app = await import("../../src/shared/services/initializeApp.js");
    await app.initializeApp();
    await app.initializeApp();
    await vi.advanceTimersByTimeAsync(2999);
    expect(calls.cleanup).not.toHaveBeenCalled();
    await shutdown();
    await vi.advanceTimersByTimeAsync(120000);
    expect(calls.cleanup).not.toHaveBeenCalled();
    expect(calls.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("owns a heavy-startup write across hot reload and guards the next DB read", async () => {
    const gate = held();
    calls.cleanup.mockImplementation(() => gate.promise);
    await startup({ tunnelEnabled: true, tailscaleEnabled: true, mitmEnabled: true });
    const state = global.__appSingleton;
    const copy = await import("../../src/shared/services/initializeApp.js?hmr=active");
    await copy.initializeApp();
    expect(global.__appSingleton).toBe(state);
    expect(state.pending.size).toBe(1);
    const stop = shutdown();
    await microtasks();
    expect(calls.close).not.toHaveBeenCalled();
    expect(copy.stopApplicationStartup()).toBe(app.stopApplicationStartup());
    gate.resolve();
    await stop;
    expect(calls.settings).not.toHaveBeenCalled();
    expect(calls.enableTunnel).not.toHaveBeenCalled();
    expect(calls.enableTailscale).not.toHaveBeenCalled();
    expect(calls.mitmStart).not.toHaveBeenCalled();
    expect(state.pending.size).toBe(0);
    expect(calls.cleanup).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["mitmStatus", "password"], ["password", "keys"], ["keys", "mitmStart"], ["mitmStart", "dns"],
  ])("waits for MITM %s and never enters %s after shutdown", async (stage, next) => {
    const gate = held();
    const value = calls[stage].getMockImplementation();
    calls[stage].mockImplementation(async (...args) => { await gate.promise; return value(...args); });
    await startup({ mitmEnabled: true });
    expect(calls[stage]).toHaveBeenCalledTimes(1);
    const stop = shutdown();
    await microtasks();
    expect(calls.close).not.toHaveBeenCalled();
    expect(calls.removeDns).not.toHaveBeenCalled();
    gate.resolve();
    await stop;
    expect(calls[next]).not.toHaveBeenCalled();
    expect(calls.removeDns).toHaveBeenCalledTimes(1);
    expect(calls.close.mock.invocationCallOrder[0]).toBeGreaterThan(calls.removeDns.mock.invocationCallOrder[0]);
  });

  it("waits for DNS restoration already in flight and removes it only after settlement", async () => {
    const gate = held();
    const events = [];
    calls.dns.mockImplementation(async () => { await gate.promise; events.push("restore"); });
    calls.removeDns.mockImplementation(() => { events.push("remove"); });
    calls.close.mockImplementation(async () => { events.push("database"); });
    await startup({ mitmEnabled: true });
    expect(calls.dns).toHaveBeenCalledTimes(1);
    const stop = shutdown();
    await microtasks();
    expect(events).toEqual([]);
    gate.resolve();
    await stop;
    expect(events).toEqual(["restore", "remove", "database"]);
  });

  it("drains tunnel reachability and ignores a captured unexpected-exit callback after shutdown", async () => {
    const gate = held();
    calls.internet.mockImplementation(() => gate.promise);
    await startup({ tunnelEnabled: true });
    const exit = calls.exitCallback.mock.calls.find(([callback]) => typeof callback === "function")[0];
    expect(calls.internet).toHaveBeenCalledTimes(1);
    const stop = shutdown();
    await microtasks();
    expect(calls.close).not.toHaveBeenCalled();
    expect(tunnel.cancelToken.cancelled).toBe(true);
    for (let i = 0; i < 100; i++) exit();
    expect(global.__appSingleton.pending.size).toBe(1);
    gate.resolve(true);
    await stop;
    const reads = calls.settings.mock.calls.length;
    exit();
    await app.initializeApp();
    app.configureTunnelMonitoring({ tunnelEnabled: true });
    await vi.advanceTimersByTimeAsync(180000);
    expect(calls.settings).toHaveBeenCalledTimes(reads);
    expect(calls.enableTunnel).not.toHaveBeenCalled();
    expect(calls.exitCallback).toHaveBeenLastCalledWith(null);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("guards Tailscale funnel/spawn after a held strict startup probe", async () => {
    const gate = held();
    calls.tailscaleStrict.mockImplementation(() => gate.promise);
    calls.daemon.mockReturnValue(true);
    tailscale.activeLocalPort = 20128;
    await startup({ tailscaleEnabled: true });
    expect(calls.tailscaleStrict).toHaveBeenCalledTimes(1);
    const stop = shutdown();
    await microtasks();
    expect(calls.close).not.toHaveBeenCalled();
    gate.resolve(false);
    await stop;
    expect(calls.funnel).not.toHaveBeenCalled();
    expect(calls.enableTailscale).not.toHaveBeenCalled();
    expect(calls.internet).not.toHaveBeenCalled();
  });

  it("does not treat a service cancellation flag as proof an admitted settings write has finished", async () => {
    const gate = held();
    const events = [];
    calls.enableTailscale.mockImplementation(async () => {
      await gate.promise;
      await calls.updateSettings({ tailscaleEnabled: true });
      events.push("settings");
    });
    calls.close.mockImplementation(async () => { events.push("database"); });
    await startup({ tailscaleEnabled: true });
    expect(calls.enableTailscale).toHaveBeenCalledTimes(1);
    const stop = shutdown();
    await microtasks();
    expect(tailscale.cancelToken.cancelled).toBe(true);
    expect(calls.close).not.toHaveBeenCalled();
    gate.resolve();
    await stop;
    expect(events).toEqual(["settings", "database"]);
    await vi.advanceTimersByTimeAsync(120000);
    expect(calls.updateSettings).toHaveBeenCalledTimes(1);
    expect(tailscale.lastRestartAt).toBe(0);
  });

  it("owns cloudflared downloads and alias writes rather than abandoning startup descendants", async () => {
    const download = held();
    const aliases = held();
    calls.ensure.mockImplementation(() => download.promise);
    calls.aliases.mockImplementation(() => aliases.promise);
    calls.cloudflaredRunning.mockReturnValue(true);
    calls.mitmStatus.mockResolvedValue({ running: true });
    await startup({ tunnelEnabled: true, mitmEnabled: true });
    const stop = shutdown();
    await microtasks();
    download.resolve();
    await microtasks();
    expect(calls.close).not.toHaveBeenCalled();
    aliases.resolve();
    await stop;
    expect(calls.close).toHaveBeenCalledTimes(1);
    expect(global.__appSingleton.pending.size).toBe(0);
  });

  it("bounds overlapping network-monitor callbacks and drains their pending reachability probe", async () => {
    calls.cloudflaredRunning.mockReturnValue(true);
    await startup({ tunnelEnabled: true });
    const gate = held();
    calls.internet.mockImplementation(() => gate.promise);
    await vi.advanceTimersByTimeAsync(25000);
    expect(calls.internet).toHaveBeenCalledTimes(1);
    expect(global.__appSingleton.pending.size).toBe(1);
    const stop = shutdown();
    await microtasks();
    expect(calls.close).not.toHaveBeenCalled();
    gate.resolve(true);
    await stop;
    await vi.advanceTimersByTimeAsync(120000);
    expect(calls.internet).toHaveBeenCalledTimes(1);
    expect(calls.enableTunnel).not.toHaveBeenCalled();
    expect(global.__appSingleton.pending.size).toBe(0);
  });

  it("registers a drain barrier when a tunnel API starts monitoring before dashboard bootstrap", async () => {
    const gate = held();
    calls.internet.mockImplementation(() => gate.promise);
    app = await import("../../src/shared/services/initializeApp.js");
    app.configureTunnelMonitoring({ tunnelEnabled: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.cleanup).not.toHaveBeenCalled();
    expect(calls.internet).toHaveBeenCalledTimes(1);
    const stop = shutdown();
    await microtasks();
    expect(calls.close).not.toHaveBeenCalled();
    gate.resolve(true);
    await stop;
    expect(calls.close).toHaveBeenCalledTimes(1);
    expect(global.__appSingleton.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("wakes and drains a cancelled network-settle timeout without restarting services", async () => {
    calls.cloudflaredRunning.mockReturnValue(true);
    await startup({ tunnelEnabled: true });
    global.__appSingleton.lastOnline = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(global.__appSingleton.networkSettleTimeout).not.toBeNull();
    expect(global.__appSingleton.pending.size).toBe(1);
    await shutdown();
    await vi.advanceTimersByTimeAsync(120000);
    expect(calls.enableTunnel).not.toHaveBeenCalled();
    expect(calls.enableTailscale).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves normal watchdog cooldown and restart behavior before shutdown", async () => {
    await startup({ tunnelEnabled: true, tailscaleEnabled: true });
    expect(calls.enableTunnel).toHaveBeenCalledTimes(1);
    expect(calls.enableTailscale).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls.enableTunnel).toHaveBeenCalledTimes(1);
    expect(calls.enableTailscale).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls.enableTunnel).toHaveBeenCalledTimes(2);
    expect(calls.enableTailscale).toHaveBeenCalledTimes(2);
    await shutdown();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("background refresh admission", () => {
  it("waits for an active load but does not start credential refresh after drain begins", async () => {
    const gate = held();
    const refreshConnection = vi.fn();
    background = await import("../../src/sse/services/backgroundTokenRefresh.js");
    const tick = background.runBackgroundTokenRefreshTick({ loadConnections: () => gate.promise, refreshConnection });
    let drained = false;
    const stop = background.stopBackgroundTokenRefresh({ drain: true }).then(() => { drained = true; });
    await microtasks();
    expect(drained).toBe(false);
    gate.resolve([{ ...connection, refreshToken: "synthetic-refresh", expiresAt: new Date(NOW).toISOString() }]);
    await Promise.all([tick, stop]);
    expect(refreshConnection).not.toHaveBeenCalled();
  });

  it("blocks new work as soon as process shutdown starts, before the async runtime stop hook", async () => {
    const gate = held();
    const refreshConnection = vi.fn();
    background = await import("../../src/sse/services/backgroundTokenRefresh.js");
    const loadConnections = vi.fn(() => gate.promise);
    const tick = background.runBackgroundTokenRefreshTick({ loadConnections, refreshConnection });
    lifecycle.registerShutdownHook("refresh", 10, async () => {
      await gate.promise;
      await background.stopBackgroundTokenRefresh({ drain: true });
    });
    const stop = shutdown();
    gate.resolve([{ ...connection, refreshToken: "synthetic-refresh", expiresAt: new Date(NOW).toISOString() }]);
    await Promise.all([tick, stop]);
    await background.runBackgroundTokenRefreshTick({ loadConnections, refreshConnection });
    expect(loadConnections).toHaveBeenCalledTimes(1);
    expect(refreshConnection).not.toHaveBeenCalled();
  });
});
