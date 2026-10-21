import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const nativeFetch = globalThis.fetch;
const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousGlobals, previousListeners, localDb, service;
const servers = [];
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
function outcome(promise) { return promise.then(value => value, error => error); }
function promptly(promise) {
  return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve("still waiting"), 200))]);
}
async function relay(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { strictProxy: true, vercelRelayUrl: `http://127.0.0.1:${server.address().port}` };
}
async function seed() {
  const row = await localDb.createProviderConnection({
    provider: "codex", authType: "oauth", name: "synthetic-refresh-cancellation",
    accessToken: "expired-fixture", refreshToken: "refresh-fixture", expiresAt: "2000-01-01T00:00:00Z",
    lastRefreshAt: "2000-01-01T00:00:00Z", testStatus: "active", providerSpecificData: { fixture: true },
  });
  return { ...row, connectionId: row.id };
}
beforeEach(async () => {
  directory = await mkdtemp("/tmp/opencode/refresh-cancellation-");
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  previousListeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  for (const key of globals) delete globalThis[key];
  vi.stubEnv("DATA_DIR", join(directory, "data"));
  vi.stubEnv("TMPDIR", directory);
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(key, "");
  globalThis.fetch = (url, options) => new URL(url).hostname === "127.0.0.1"
    ? nativeFetch(url, options) : Promise.reject(new Error("fixture forbids direct egress"));
  vi.resetModules();
  localDb = await import("../../src/lib/localDb.js");
  service = await import("../../src/sse/services/tokenRefresh.js");
});
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  vi.restoreAllMocks();
  for (const timer of Object.values(globalThis._statsEmitTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(globalThis._pendingTimers || {})) clearTimeout(timer);
  await globalThis._dbAdapter?.instance?.close();
  for (const event of events) for (const listener of process.listeners(event)) {
    if (!previousListeners.get(event).has(listener)) process.removeListener(event, listener);
  }
  for (const key of globals) {
    const descriptor = previousGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  globalThis.fetch = nativeFetch;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("proactive refresh cancellation through real SQLite commits", () => {
  it("propagates pre-abort through every app refresh wrapper without starting transport", async () => {
    const caller = new AbortController();
    const reason = new Error("cancel app wrapper");
    caller.abort(reason);
    const signal = caller.signal;
    const policy = { strictProxy: true, vercelRelayUrl: "http://127.0.0.1:1" };
    const credentials = { refreshToken: "fixture", accessToken: "fixture", providerSpecificData: {} };
    const calls = [
      () => service.refreshAccessToken("codex", "fixture", credentials, policy, signal),
      () => service.refreshClaudeOAuthToken("fixture", policy, signal),
      () => service.refreshGoogleToken("fixture", "client", "secret", policy, signal),
      () => service.refreshCodexToken("fixture", policy, signal),
      () => service.refreshIflowToken("fixture", policy, signal),
      () => service.refreshGitHubToken("fixture", policy, signal),
      () => service.refreshCopilotToken("fixture", policy, signal),
      () => service.refreshKiroToken("fixture", {}, policy, signal),
      () => service.getAccessToken("codex", credentials, policy, signal),
      () => service.refreshTokenByProvider("codex", credentials, policy, signal),
      () => service.refreshGitHubAndCopilotTokens(credentials, policy, signal),
      () => service.getAllAccessTokens({ connections: [{ ...credentials, provider: "codex", isActive: true }] }, signal),
    ];
    for (const invoke of calls) expect(await outcome(Promise.resolve().then(invoke))).toBe(reason);
  });

  it("does not refresh or mutate account state for a pre-aborted caller", async () => {
    const row = await seed();
    let requests = 0;
    const policy = await relay((_req, res) => { requests++; res.end('{"access_token":"unexpected"}'); });
    const caller = new AbortController();
    const reason = new Error("cancel before proactive work");
    caller.abort(reason);
    const result = await outcome(service.checkAndRefreshToken("codex", row, { signal: caller.signal, proxyOptions: policy }));
    expect(result).toBe(reason);
    expect(requests).toBe(0);
    expect((await localDb.getProviderConnectionById(row.id)).refreshToken).toBe("refresh-fixture");
  });

  it("retains shared refresh for a queued live caller and commits the rotation before that caller resumes", async () => {
    const row = await seed();
    const entered = deferred();
    let finish;
    let requests = 0;
    const policy = await relay(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      requests++;
      finish = () => res.end('{"access_token":"fresh-fixture","refresh_token":"rotated-fixture","expires_in":3600}');
      entered.resolve();
    });
    const caller = new AbortController();
    const first = outcome(service.checkAndRefreshToken("codex", { ...row, context: "first" }, { signal: caller.signal, proxyOptions: policy }));
    await entered.promise;
    const second = service.checkAndRefreshToken("codex", { ...row, context: "second" }, { proxyOptions: policy });
    const reason = new Error("first caller left");
    caller.abort(reason);
    const cancelled = await promptly(first);
    finish();
    const result = await second;
    expect(cancelled).toBe(reason);
    expect(result).toMatchObject({ accessToken: "fresh-fixture", refreshToken: "rotated-fixture", context: "second" });
    expect(requests).toBe(1);
    expect(await localDb.getProviderConnectionById(row.id)).toMatchObject({ refreshToken: "rotated-fixture", testStatus: "active", isActive: true });
  });

  it("cancels all abandoned queued callers without starting a later refresh or faulting the account", async () => {
    const row = await seed();
    const entered = deferred();
    const disconnected = deferred();
    let requests = 0;
    const policy = await relay(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      requests++;
      res.on("close", disconnected.resolve);
      entered.resolve();
    });
    const callers = [new AbortController(), new AbortController()];
    const first = outcome(service.checkAndRefreshToken("codex", row, { signal: callers[0].signal, proxyOptions: policy }));
    await entered.promise;
    const second = outcome(service.checkAndRefreshToken("codex", row, { signal: callers[1].signal, proxyOptions: policy }));
    const reasons = [new Error("first left"), new Error("second left")];
    callers.forEach((caller, i) => caller.abort(reasons[i]));
    const results = await Promise.all([promptly(first), promptly(second)]);
    const closed = await promptly(disconnected.promise.then(() => true));
    expect(results).toEqual(reasons);
    expect(closed).toBe(true);
    expect(requests).toBe(1);
    expect(await localDb.getProviderConnectionById(row.id)).toMatchObject({ accessToken: "expired-fixture", refreshToken: "refresh-fixture", testStatus: "active", isActive: true });
  });

  it("finishes an acquired rotating-token commit after cancellation and does not let followers reread stale state", async () => {
    const row = await seed();
    const entered = deferred();
    const release = deferred();
    const realUpdate = localDb.updateProviderConnection;
    vi.spyOn(localDb, "updateProviderConnection").mockImplementation(async (...args) => {
      entered.resolve();
      await release.promise;
      return realUpdate(...args);
    });
    let requests = 0;
    const policy = await relay((_req, res) => {
      requests++;
      res.end('{"access_token":"fresh-fixture","refresh_token":"rotated-fixture","expires_in":3600}');
    });
    const caller = new AbortController();
    const first = outcome(service.checkAndRefreshToken("codex", row, { signal: caller.signal, proxyOptions: policy }));
    await entered.promise;
    const reason = new Error("caller left during credential commit");
    caller.abort(reason);
    const cancelled = await promptly(first);
    let secondSettled = false;
    const second = service.checkAndRefreshToken("codex", row, { proxyOptions: policy }).then(result => { secondSettled = true; return result; });
    await new Promise(resolve => setImmediate(resolve));
    expect(secondSettled).toBe(false);
    release.resolve();
    const result = await second;
    expect(cancelled).toBe(reason);
    expect(result.refreshToken).toBe("rotated-fixture");
    expect(requests).toBe(1);
    expect((await localDb.getProviderConnectionById(row.id)).refreshToken).toBe("rotated-fixture");
  });

  it("retains the acquired-token commit barrier even when every queued HTTP caller cancels", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    const row = await seed();
    const entered = deferred();
    const release = deferred();
    const realUpdate = localDb.updateProviderConnection;
    vi.spyOn(localDb, "updateProviderConnection").mockImplementation(async (...args) => {
      entered.resolve();
      await release.promise;
      return realUpdate(...args);
    });
    let requests = 0;
    const policy = await relay((_req, res) => {
      requests++;
      res.end('{"access_token":"fresh-fixture","refresh_token":"rotated-fixture","expires_in":3600}');
    });
    const callers = [new AbortController(), new AbortController()];
    const first = outcome(service.checkAndRefreshToken("codex", row, { signal: callers[0].signal, proxyOptions: policy }));
    await entered.promise;
    const second = outcome(service.checkAndRefreshToken("codex", row, { signal: callers[1].signal, proxyOptions: policy }));
    callers.forEach(caller => caller.abort(new Error("queued caller left")));
    await Promise.all([first, second]);
    await new Promise(resolve => setImmediate(resolve));
    vi.setSystemTime(new Date("2026-10-21T12:00:11.001Z"));
    let settled = false;
    const third = service.checkAndRefreshToken("codex", row, { proxyOptions: policy }).then(value => { settled = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 40));
    const beforeCommit = { settled, requests };
    release.resolve();
    expect((await third).refreshToken).toBe("rotated-fixture");
    expect(beforeCommit).toEqual({ settled: false, requests: 1 });
    expect(requests).toBe(1);
  });
});
