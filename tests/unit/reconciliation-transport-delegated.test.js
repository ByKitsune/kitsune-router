import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const state = vi.hoisted(() => ({ seam: null, transports: new Set(), row: null, writes: [] }));
vi.mock("open-sse/utils/proxyFetch.js", async original => {
  const transport = await original();
  return { ...transport, proxyAwareFetch(url, options, policy) {
    const pending = Promise.resolve().then(() => state.seam
      ? state.seam(url, options, policy) : transport.proxyAwareFetch(url, options, policy));
    state.transports.add(pending);
    pending.then(() => state.transports.delete(pending), () => state.transports.delete(pending));
    return pending;
  } };
});
// Only the app credential repository is a seam. OAuth/profile/project HTTP and
// the operation/credential/refresh caches stay real and offline.
vi.mock("../../src/lib/localDb.js", () => ({
  getSettings: async () => ({}), isApiKeyRequired: () => false,
  getProviderConnectionById: async () => state.row,
  updateProviderConnection: async (_id, patch) => {
    state.writes.push(patch);
    state.row = { ...state.row, ...patch };
    return state.row;
  },
}));
vi.mock("@/models", () => ({ getProxyPoolById: async () => null }));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: async () => state.row, clearAccountError: async () => {},
  markAccountUnavailable: async () => { throw new Error("Cancellation must not mutate account health"); },
  extractApiKey: () => null, isValidApiKey: async () => true,
}));
vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: async () => ({ provider: "gemini-cli", model: "gemini-3.8-flash" }),
  getComboModels: async () => null, resolveModelCapabilities: async () => new Map(),
}));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {}, saveRequestUsage: async () => {},
}));

const nativeFetch = globalThis.fetch;
const servers = [];
let xai, profiles, projects, tokens, appTokens;
let identity = 0;
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
function outcome(promise) { return promise.then(value => value, error => error); }
function promptly(promise, timeout = 250) {
  return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve("still waiting"), timeout))]);
}
const discovery = suffix => ({ authorization_endpoint: `https://auth.x.ai/authorize-${suffix}`, token_endpoint: `https://auth.x.ai/token-${suffix}` });
async function relay(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { strictProxy: true, vercelRelayUrl: `http://127.0.0.1:${server.address().port}` };
}
beforeEach(async () => {
  state.seam = null;
  state.transports.clear();
  state.row = null;
  state.writes = [];
  vi.stubEnv("FETCH_CONNECT_TIMEOUT_MS", "500");
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(key, "");
  globalThis.fetch = (url, options) => new URL(url).hostname === "127.0.0.1"
    ? nativeFetch(url, options) : Promise.reject(new Error("fixture forbids direct egress"));
  vi.resetModules();
  xai = await import("../../src/lib/oauth/services/xai.js");
  profiles = await import("../../src/lib/oauth/providerHelpers.js");
  projects = await import("../../open-sse/services/projectId.js");
  tokens = await import("../../open-sse/services/tokenRefresh.js");
  appTokens = await import("../../src/sse/services/tokenRefresh.js");
});
afterEach(async () => {
  projects.stopCacheCleanup();
  for (let i = 1; i <= identity; i++) projects.removeConnection(`delegated-${i}`);
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  while (state.transports.size) await Promise.allSettled([...state.transports]);
  await new Promise(resolve => setImmediate(resolve));
  globalThis.fetch = nativeFetch;
  vi.unstubAllEnvs();
});

describe("delegated xAI discovery and refresh", () => {
  it("does not dispatch discovery for a pre-aborted caller", async () => {
    let requests = 0;
    const policy = await relay((_req, res) => { requests++; res.end(JSON.stringify(discovery("fixture"))); });
    const caller = new AbortController();
    const reason = new Error("left before discovery");
    caller.abort(reason);
    expect(await outcome(xai.discoverEndpoints(policy, caller.signal))).toBe(reason);
    expect(requests).toBe(0);
  });

  it("does not turn discovery cancellation into a static-fallback token request", async () => {
    const entered = deferred();
    const closed = deferred();
    const paths = [];
    const policy = await relay(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      paths.push(req.headers["x-relay-path"]);
      res.on("close", closed.resolve);
      entered.resolve();
    });
    const caller = new AbortController();
    const pending = outcome(new xai.XaiService().refreshAccessToken("synthetic-refresh", policy, caller.signal));
    await entered.promise;
    const reason = new Error("left during discovery");
    caller.abort(reason);
    const result = await promptly(pending);
    const disconnected = await promptly(closed.promise.then(() => true));
    expect(result).toBe(reason);
    expect(disconnected).toBe(true);
    expect(paths).toHaveLength(1);
  });

  it("checks the signal again between discovery body completion and the token grant", async () => {
    const caller = new AbortController();
    const reason = new Error("left at discovery boundary");
    const paths = [];
    state.seam = async url => {
      paths.push(url);
      if (paths.length > 1) return Response.json({ access_token: "must-not-dispatch" });
      const response = Response.json(discovery("seam"));
      const json = response.json.bind(response);
      response.json = async () => { const value = await json(); caller.abort(reason); return value; };
      return response;
    };
    expect(await outcome(new xai.XaiService().refreshAccessToken("synthetic-refresh", { strictProxy: true }, caller.signal))).toBe(reason);
    expect(paths).toHaveLength(1);
  });

  it.each([0, 1])("shares discovery without letting waiter %s cancel the other, and isolates cached egress policies", async cancelled => {
    const entered = deferred();
    const finishes = [];
    let requests = 0;
    const policy = await relay((_req, res) => {
      requests++;
      finishes.push(() => res.end(JSON.stringify(discovery("first-policy"))));
      entered.resolve();
    });
    const callers = [new AbortController(), new AbortController()];
    const pending = callers.map(caller => outcome(xai.discoverEndpoints(policy, caller.signal)));
    await entered.promise;
    const reason = new Error("one discovery waiter left");
    callers[cancelled].abort(reason);
    const left = await promptly(pending[cancelled]);
    for (const finish of finishes) finish();
    const results = await Promise.all(pending);
    expect(left).toBe(reason);
    expect(results[1 - cancelled].tokenUrl).toBe("https://auth.x.ai/token-first-policy");
    expect(requests).toBe(1);
    expect((await xai.discoverEndpoints(policy)).tokenUrl).toBe("https://auth.x.ai/token-first-policy");
    expect(requests).toBe(1);
    expect(await outcome(xai.discoverEndpoints(policy, callers[cancelled].signal))).toBe(reason);
    const other = await relay((_req, res) => res.end(JSON.stringify(discovery("other-policy"))));
    expect((await xai.discoverEndpoints(other)).tokenUrl).toBe("https://auth.x.ai/token-other-policy");
  });

  it("keeps an unrelated refresh waiter alive and returns its acquired rotating grant", async () => {
    const entered = deferred();
    let finish;
    const paths = [];
    const policy = await relay(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      const path = req.headers["x-relay-path"];
      paths.push(path);
      if (path.includes("well-known")) res.end(JSON.stringify(discovery("rotating")));
      else { finish = () => res.end('{"access_token":"fresh","refresh_token":"rotated","expires_in":3600}'); entered.resolve(); }
    });
    const credentials = { connectionId: "delegated-xai", refreshToken: "synthetic-refresh" };
    const caller = new AbortController();
    const first = outcome(tokens.refreshTokenByProvider("xai", credentials, null, policy, caller.signal));
    const second = tokens.refreshTokenByProvider("xai", credentials, null, policy);
    await entered.promise;
    const reason = new Error("first grant waiter left");
    caller.abort(reason);
    expect(await promptly(first)).toBe(reason);
    finish();
    expect(await second).toMatchObject({ accessToken: "fresh", refreshToken: "rotated" });
    expect(paths).toHaveLength(2);
  });

  it("closes a token grant when its last caller cancels after discovery completed", async () => {
    const entered = deferred();
    const closed = deferred();
    const paths = [];
    const policy = await relay(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      const path = req.headers["x-relay-path"];
      paths.push(path);
      if (path.includes("well-known")) res.end(JSON.stringify(discovery("cancel-grant")));
      else { res.on("close", closed.resolve); entered.resolve(); }
    });
    const caller = new AbortController();
    const pending = outcome(new xai.XaiService().refreshAccessToken("synthetic-refresh", policy, caller.signal));
    await entered.promise;
    const reason = new Error("left during token grant");
    caller.abort(reason);
    expect(await promptly(pending)).toBe(reason);
    expect(await promptly(closed.promise.then(() => true))).toBe(true);
    expect(paths).toHaveLength(2);
  });

  it("bounds a token response stalled after successful headers", async () => {
    const closed = deferred();
    const policy = await relay((req, res) => {
      if (req.headers["x-relay-path"].includes("well-known")) res.end(JSON.stringify(discovery("deadline-grant")));
      else { res.on("close", closed.resolve); res.write('{"access_token":"'); }
    });
    const result = await promptly(outcome(new xai.XaiService().refreshAccessToken("synthetic-refresh", policy)), 1500);
    expect(result).toBeInstanceOf(Error);
    expect(await promptly(closed.promise.then(() => true))).toBe(true);
  });
});

describe("delegated Kiro profile lookup", () => {
  it("does not dispatch a pre-aborted profile lookup", async () => {
    const caller = new AbortController();
    const reason = new Error("left before profile lookup");
    caller.abort(reason);
    let requests = 0;
    const policy = await relay((_req, res) => { requests++; res.end('{"profiles":[{"arn":"fixture-profile"}]}'); });
    expect(await outcome(profiles.fetchKiroProfileArn("synthetic-access", policy, caller.signal))).toBe(reason);
    expect(requests).toBe(0);
  });

  it("isolates profile waiters without sharing another access token or egress policy", async () => {
    const entered = deferred();
    let finish;
    let requests = 0;
    const policy = await relay((req, res) => {
      requests++;
      if (requests === 1) { finish = () => res.end('{"profiles":[{"arn":"fixture-profile"}]}'); entered.resolve(); }
      else res.end(JSON.stringify({ profiles: [{ arn: req.headers.authorization === "Bearer another-access" ? "other-token" : "fresh-profile" }] }));
    });
    const caller = new AbortController();
    const first = outcome(profiles.fetchKiroProfileArn("synthetic-access", policy, caller.signal));
    const second = profiles.fetchKiroProfileArn("synthetic-access", policy);
    await entered.promise;
    const reason = new Error("one profile waiter left");
    caller.abort(reason);
    const left = await promptly(first);
    finish();
    expect(await second).toBe("fixture-profile");
    expect(left).toBe(reason);
    expect(requests).toBe(1);
    expect(await profiles.fetchKiroProfileArn("another-access", policy)).toBe("other-token");
    const other = await relay((_req, res) => res.end('{"profiles":[{"arn":"other-policy"}]}'));
    expect(await profiles.fetchKiroProfileArn("synthetic-access", other)).toBe("other-policy");
  });

  it("aborts abandoned profile I/O without throwing away the rotating grant already acquired", async () => {
    const entered = deferred();
    const closed = deferred();
    let finish;
    const paths = [];
    const policy = await relay(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      const path = req.headers["x-relay-path"];
      paths.push(path);
      if (path.includes("ListAvailableProfiles")) {
        finish = () => res.end('{"profiles":[]}');
        res.on("close", closed.resolve);
        entered.resolve();
      } else res.end('{"accessToken":"acquired-access","refreshToken":"acquired-rotation","expiresIn":3600}');
    });
    const caller = new AbortController();
    const pending = outcome(tokens.refreshKiroToken("synthetic-refresh", {}, null, policy, caller.signal));
    await entered.promise;
    const reason = new Error("left after grant before profile");
    caller.abort(reason);
    const result = await promptly(pending);
    const disconnected = await promptly(closed.promise.then(() => true));
    finish();
    await new Promise(resolve => setImmediate(resolve));
    const recovered = await tokens.refreshKiroToken("synthetic-refresh", {}, null, policy);
    expect(result).toBe(reason);
    expect(disconnected).toBe(true);
    expect(recovered).toMatchObject({ accessToken: "acquired-access", refreshToken: "acquired-rotation" });
    expect(paths).toHaveLength(2);
  });

  it("commits a Kiro rotation already acquired before the last proactive caller cancels its profile enrichment", async () => {
    const entered = deferred();
    const closed = deferred();
    const paths = [];
    const policy = await relay(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      const path = req.headers["x-relay-path"];
      paths.push(path);
      if (path.includes("ListAvailableProfiles")) { res.on("close", closed.resolve); entered.resolve(); }
      else res.end('{"accessToken":"acquired-access","refreshToken":"acquired-rotation","expiresIn":3600}');
    });
    state.row = { id: "delegated-kiro-commit", connectionId: "delegated-kiro-commit", provider: "kiro",
      accessToken: "old-access", refreshToken: "synthetic-refresh", expiresAt: "2000-01-01T00:00:00Z", providerSpecificData: {} };
    const caller = new AbortController();
    const pending = outcome(appTokens.checkAndRefreshToken("kiro", state.row, { proxyOptions: policy, signal: caller.signal }));
    await entered.promise;
    const reason = new Error("last caller left optional Kiro profile lookup");
    caller.abort(reason);
    expect(await promptly(pending)).toBe(reason);
    expect(await promptly(closed.promise.then(() => true))).toBe(true);
    await vi.waitFor(() => expect(state.writes).toHaveLength(1), { timeout: 1000 });
    expect(state.row).toMatchObject({ accessToken: "acquired-access", refreshToken: "acquired-rotation" });
    expect(paths).toHaveLength(2);
  });

  it("bounds a profile response stalled after successful headers", async () => {
    const closed = deferred();
    const policy = await relay((_req, res) => {
      res.on("close", closed.resolve);
      res.write('{"profiles":[');
    });
    expect(await promptly(profiles.fetchKiroProfileArn("synthetic-access", policy), 1500)).toBeNull();
    expect(await promptly(closed.promise.then(() => true))).toBe(true);
  });
});

describe("delegated project discovery and onboarding", () => {
  it("rejects a pre-aborted caller before reading a cached project or dispatching", async () => {
    const connection = `delegated-${++identity}`;
    let requests = 0;
    const policy = await relay((_req, res) => { requests++; res.end('{"cloudaicompanionProject":"fixture-project"}'); });
    const caller = new AbortController();
    const reason = new Error("left before project lookup");
    caller.abort(reason);
    expect(await outcome(projects.getProjectIdForConnection(connection, "synthetic-access", "gemini-cli", policy, caller.signal))).toBe(reason);
    expect(requests).toBe(0);
    expect(await projects.getProjectIdForConnection(connection, "synthetic-access", "gemini-cli", policy)).toBe("fixture-project");
    expect(await outcome(projects.getProjectIdForConnection(connection, "synthetic-access", "gemini-cli", policy, caller.signal))).toBe(reason);
    expect(requests).toBe(1);
  });

  it("isolates project waiters, credential snapshots, and egress caches", async () => {
    const connection = `delegated-${++identity}`;
    const entered = deferred();
    let finish;
    let requests = 0;
    const policy = await relay((req, res) => {
      requests++;
      if (requests === 1) { finish = () => res.end('{"cloudaicompanionProject":"fixture-project"}'); entered.resolve(); }
      else res.end(JSON.stringify({ cloudaicompanionProject: req.headers.authorization === "Bearer another-access" ? "other-token" : "unexpected-refresh" }));
    });
    const caller = new AbortController();
    const first = outcome(projects.getProjectIdForConnection(connection, "synthetic-access", "gemini-cli", policy, caller.signal));
    const second = projects.getProjectIdForConnection(connection, "synthetic-access", "gemini-cli", policy);
    await entered.promise;
    const reason = new Error("one project waiter left");
    caller.abort(reason);
    const left = await promptly(first);
    finish();
    expect(await second).toBe("fixture-project");
    expect(left).toBe(reason);
    expect(requests).toBe(1);
    expect(await projects.getProjectIdForConnection(connection, "another-access", "gemini-cli", policy)).toBe("other-token");
    const other = await relay((_req, res) => res.end('{"cloudaicompanionProject":"other-policy"}'));
    expect(await projects.getProjectIdForConnection(connection, "synthetic-access", "gemini-cli", other)).toBe("other-policy");
  });

  it("checks cancellation between loadCodeAssist JSON and onboarding", async () => {
    const connection = `delegated-${++identity}`;
    const caller = new AbortController();
    const reason = new Error("left at onboarding boundary");
    const paths = [];
    state.seam = async url => {
      paths.push(url);
      if (paths.length > 1) return Response.json({ done: true, response: { cloudaicompanionProject: "must-not-dispatch" } });
      const response = Response.json({ allowedTiers: [{ id: "fixture-tier", isDefault: true }] });
      const json = response.json.bind(response);
      response.json = async () => { const value = await json(); caller.abort(reason); return value; };
      return response;
    };
    expect(await outcome(projects.getProjectIdForConnection(connection, "synthetic-access", "gemini-cli", { strictProxy: true }, caller.signal))).toBe(reason);
    expect(paths).toHaveLength(1);
  });

  it("closes a loadCodeAssist body stalled after headers rather than waiting for the cleanup sweep", async () => {
    const connection = `delegated-${++identity}`;
    const closed = deferred();
    const policy = await relay((_req, res) => {
      res.on("close", closed.resolve);
      res.setHeader("Content-Type", "application/json");
      res.write('{"cloudaicompanionProject":');
    });
    const pending = projects.getProjectIdForConnection(connection, "synthetic-access", "gemini-cli", policy);
    expect(await promptly(pending, 1500)).toBeNull();
    expect(await promptly(closed.promise.then(() => true))).toBe(true);
  });

  it("bounds each onboard response body and stops after the existing retry cap", async () => {
    const connection = `delegated-${++identity}`;
    let requests = 0;
    const policy = await relay((req, res) => {
      requests++;
      res.setHeader("Content-Type", "application/json");
      if (req.headers["x-relay-path"].includes("loadCodeAssist")) res.end('{"allowedTiers":[{"id":"fixture-tier","isDefault":true}]}');
      else res.write('{"done":');
    });
    expect(await promptly(projects.getProjectIdForConnection(connection, "synthetic-access", "gemini-cli", policy), 3800)).toBeNull();
    expect(requests).toBe(6);
  });

  it("interrupts onboarding backoff with no later request after caller cancellation", async () => {
    const connection = `delegated-${++identity}`;
    const entered = deferred();
    let requests = 0;
    const policy = await relay((req, res) => {
      requests++;
      if (req.headers["x-relay-path"].includes("loadCodeAssist")) res.end('{"allowedTiers":[{"id":"fixture-tier","isDefault":true}]}');
      else { res.end('{"done":false}'); setTimeout(entered.resolve, 20); }
    });
    const caller = new AbortController();
    const pending = outcome(projects.getProjectIdForConnection(connection, "synthetic-access", "gemini-cli", policy, caller.signal));
    await entered.promise;
    const reason = new Error("left during project backoff");
    caller.abort(reason);
    const result = await promptly(pending);
    await new Promise(resolve => setTimeout(resolve, 2100));
    expect(result).toBe(reason);
    expect(requests).toBe(2);
  });

  it("keeps post-refresh project I/O attached to the HTTP caller after the rotating grant commits", async () => {
    const connection = `delegated-${++identity}`;
    const entered = deferred();
    const closed = deferred();
    const policy = await relay(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      if (req.headers["x-relay-path"] === "/token") res.end('{"access_token":"fresh-access","refresh_token":"rotated-refresh","expires_in":3600}');
      else { res.on("close", closed.resolve); entered.resolve(); }
    });
    state.row = { id: connection, connectionId: connection, provider: "gemini-cli", accessToken: "old-access", refreshToken: "synthetic-refresh",
      expiresAt: "2000-01-01T00:00:00Z", lastRefreshAt: "2000-01-01T00:00:00Z", providerSpecificData: policy };
    const caller = new AbortController();
    const result = await appTokens.checkAndRefreshToken("gemini-cli", state.row, { proxyOptions: policy, signal: caller.signal });
    await entered.promise;
    expect(result.refreshToken).toBe("rotated-refresh");
    caller.abort(new Error("HTTP caller left after credential commit"));
    expect(await promptly(closed.promise.then(() => true))).toBe(true);
    expect(state.writes).toHaveLength(1);
    expect(state.row.refreshToken).toBe("rotated-refresh");
    expect(state.row.projectId).toBeUndefined();
  });

  it("passes HTTP cancellation through the public chat cold-project call without a generation request", async () => {
    const connection = `delegated-${++identity}`;
    const entered = deferred();
    const closed = deferred();
    const paths = [];
    const policy = await relay(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      paths.push(req.headers["x-relay-path"]);
      res.on("close", closed.resolve);
      entered.resolve();
    });
    state.row = { id: connection, connectionId: connection, accessToken: "synthetic-access",
      expiresAt: "2099-01-01T00:00:00Z", providerSpecificData: policy };
    const { handleChat } = await import("@/sse/handlers/chat.js");
    const caller = new AbortController();
    const pending = handleChat(new Request("http://localhost/v1/chat/completions", {
      method: "POST", signal: caller.signal,
      body: JSON.stringify({ model: "gemini-cli/gemini-3.8-flash", messages: [{ role: "user", content: "fixture" }], stream: false }),
    }));
    await entered.promise;
    caller.abort(new Error("HTTP caller left cold project lookup"));
    const result = await promptly(pending);
    expect(result.status).toBe(499);
    expect(await promptly(closed.promise.then(() => true))).toBe(true);
    expect(paths).toHaveLength(1);
    expect(state.writes).toEqual([]);
  });
});
