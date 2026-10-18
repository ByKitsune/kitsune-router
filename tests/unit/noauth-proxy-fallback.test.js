import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, Dispatcher1Wrapper } from "undici";

// Real SQLite repositories, selector, classifier, chat loop and proxy transport.
// Only randomness is controlled; every HTTP response comes from a loopback fixture.
const provider = "opencode";
const model = "noauth-fixture";
const globalKeys = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers"];
const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let db, adapter, auth, tokens, handleChat, proxyAwareFetch, root;
let previousGlobals, previousListeners, previousFetch;
let servers = [], sockets = new Set(), dispatchers = [];

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "zen-noauth-"));
  await mkdir(join(root, "home"));
  vi.stubEnv("HOME", join(root, "home"));
  vi.stubEnv("DATA_DIR", join(root, "data"));
  vi.stubEnv("ENABLE_REQUEST_LOGS", "false");
  vi.stubEnv("OBSERVABILITY_ENABLED", "false");
  vi.stubEnv("REQUIRE_API_KEY", "false");
  vi.stubEnv("LOG_LEVEL", "ERROR");
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(key, "");
  previousGlobals = Object.fromEntries(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  previousListeners = new Map(shutdownEvents.map(event => [event, process.rawListeners(event)]));
  previousFetch = globalThis.fetch;
  for (const key of globalKeys) delete globalThis[key];
  vi.resetModules();
  db = await import("@/lib/localDb.js");
  adapter = await (await import("@/lib/db/driver.js")).getAdapter();
  auth = await import("@/sse/services/auth.js");
  tokens = await import("@/sse/services/tokenRefresh.js");
  ({ handleChat } = await import("@/sse/handlers/chat.js"));
  ({ proxyAwareFetch } = await import("open-sse/utils/proxyFetch.js"));
});

beforeEach(async () => {
  for (const pool of await db.getProxyPools()) await db.deleteProxyPool(pool.id);
  await db.updateSettings({ providerStrategies: {}, requireApiKey: false, rtkEnabled: false, enableObservability: false });
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(async () => {
  const closing = servers.map(server => new Promise(resolve => server.close(resolve)));
  for (const socket of sockets) socket.destroy();
  await Promise.all([...closing, ...dispatchers.map(dispatcher => dispatcher.close())]);
  servers = [];
  sockets = new Set();
  dispatchers = [];
  vi.restoreAllMocks();
});

afterAll(async () => {
  for (const timer of Object.values(globalThis._pendingTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(globalThis._statsEmitTimers || {})) clearTimeout(timer);
  await adapter?.close();
  for (const event of shutdownEvents) {
    const existing = previousListeners.get(event);
    for (const listener of process.rawListeners(event)) if (!existing.includes(listener)) process.removeListener(event, listener);
  }
  for (const key of globalKeys) {
    if (previousGlobals[key]) Object.defineProperty(globalThis, key, previousGlobals[key]);
    else delete globalThis[key];
  }
  globalThis.fetch = previousFetch;
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

function track(socket) {
  sockets.add(socket);
  socket.on("error", () => {});
  socket.once("close", () => sockets.delete(socket));
  return socket;
}

async function listen(server) {
  servers.push(server);
  server.on("connection", track);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function pool(id, patch = {}) {
  return db.createProxyPool({ id, name: id, proxyUrl: "http://127.0.0.1:9", ...patch });
}

async function configure(override) {
  await db.updateSettings({ providerStrategies: { [provider]: override } });
}

function request(signal) {
  return new Request("http://localhost/v1/chat/completions", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: `${provider}/${model}`, stream: false, messages: [{ role: "user", content: "offline fixture" }] }),
  });
}

async function relayPools(respond) {
  for (const id of ["alpha", "beta"]) {
    const proxyUrl = await listen(createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      respond(id, req, res, JSON.parse(Buffer.concat(chunks).toString()));
    }));
    await pool(id, { type: "vercel", proxyUrl });
  }
  await configure({ rotateStrategy: "random" });
}

describe("no-auth request-local proxy selection", () => {
  it.each(["round-robin", "random"])("exhausts each active usable pool once with %s, even with repeated random picks", async (rotateStrategy) => {
    await pool("alpha");
    await pool("beta");
    await pool("disabled", { isActive: false });
    await pool("blank", { proxyUrl: "  " });
    await configure({ rotateStrategy });
    const excluded = new Set();
    const selected = [];
    for (let i = 0; i < 2; i++) {
      const credentials = await auth.getProviderCredentials(provider, excluded, model);
      expect(credentials.connectionId).toEqual(expect.any(String));
      expect(excluded.has(credentials.connectionId)).toBe(false);
      expect(credentials.providerSpecificData.strictProxy).toBe(true);
      selected.push(credentials.providerSpecificData.connectionProxyPoolId);
      excluded.add(credentials.connectionId);
    }
    expect(selected.sort()).toEqual(["alpha", "beta"]);
    expect(await auth.getProviderCredentials(provider, excluded, model)).toBeNull();
    expect(await auth.getProviderCredentials(provider, excluded, model)).toBeNull();
    expect(await auth.getProviderCredentials(provider, new Set(), model)).not.toBeNull();
  });

  it("accepts a string exclusion and keeps virtual identities provider-scoped across aliases", async () => {
    await pool("alpha");
    await configure({ proxyPoolId: "alpha" });
    await db.updateSettings({ providerStrategies: { [provider]: { proxyPoolId: "alpha" }, "mimo-free": { proxyPoolId: "alpha" } } });
    const first = await auth.getProviderCredentials(provider);
    const alias = await auth.getProviderCredentials("oc");
    const other = await auth.getProviderCredentials("mmf");
    expect(first.connectionId).toEqual(expect.any(String));
    expect(alias.connectionId).toBe(first.connectionId);
    expect(other.connectionId).not.toBe(first.connectionId);
    expect(await auth.getProviderCredentials(provider, first.connectionId)).toBeNull();
  });

  it("does not expand a fixed pool into other configured pools", async () => {
    await pool("alpha");
    await pool("beta");
    await configure({ proxyPoolId: "alpha" });
    const credentials = await auth.getProviderCredentials(provider);
    expect(credentials.providerSpecificData.connectionProxyPoolId).toBe("alpha");
    expect(await auth.getProviderCredentials(provider, new Set([credentials.connectionId]))).toBeNull();
  });

  it.each([
    [{ proxyPoolId: "missing" }, {}],
    [{ proxyPoolId: "alpha" }, { isActive: false }],
    [{ proxyPoolId: "alpha" }, { proxyUrl: "" }],
    [{ proxyPoolId: "alpha" }, { proxyUrl: "  " }],
    [{ rotateStrategy: "random" }, { isActive: false }],
    [{ rotateStrategy: "round-robin" }, { proxyUrl: "" }],
    [{ rotateStrategy: "typo" }, {}],
  ])("fails closed for unusable or invalid configured proxy intent: %j", async (override, patch) => {
    await pool("alpha", patch);
    await configure(override);
    expect(await auth.getProviderCredentials(provider)).toBeNull();
  });

  it.each([{}, { proxyPoolId: "__none__" }])("retains intentional direct routing: %j", async (override) => {
    await pool("unused");
    await configure(override);
    let hits = 0;
    const url = await listen(createServer((_req, res) => { hits++; res.end("direct fixture"); }));
    const credentials = await auth.getProviderCredentials(provider);
    expect(credentials.providerSpecificData).toMatchObject({ connectionProxyEnabled: false, connectionProxyPoolId: null, strictProxy: false });
    const response = await proxyAwareFetch(url, {}, credentials.providerSpecificData);
    expect(await response.text()).toBe("direct fixture");
    expect(hits).toBe(1);
    expect(await auth.markAccountUnavailable(credentials.connectionId, 502, "fetch failed", provider, model)).toEqual({ shouldFallback: false, cooldownMs: 0 });
  });

  it("keeps a request's initial pool budget when configuration changes and never downgrades to direct", async () => {
    await pool("alpha");
    await configure({ rotateStrategy: "random" });
    const excluded = new Set();
    const first = await auth.getProviderCredentials(provider, excluded);
    excluded.add(first.connectionId);
    await pool("added-later");
    expect(await auth.getProviderCredentials(provider, excluded)).toBeNull();
    await configure({});
    expect(await auth.getProviderCredentials(provider, excluded)).toBeNull();
    const nextRequest = await auth.getProviderCredentials(provider, new Set());
    expect(nextRequest.providerSpecificData.connectionProxyPoolId).toBeNull();
  });

  it("honors a pool being disabled during fallback", async () => {
    await pool("alpha");
    await pool("beta");
    await configure({ rotateStrategy: "random" });
    const excluded = new Set();
    const first = await auth.getProviderCredentials(provider, excluded);
    excluded.add(first.connectionId);
    const otherId = first.providerSpecificData.connectionProxyPoolId === "alpha" ? "beta" : "alpha";
    await db.updateProxyPool(otherId, { isActive: false });
    expect(await auth.getProviderCredentials(provider, excluded)).toBeNull();
  });
});

describe("no-auth failure classification and persistence", () => {
  beforeEach(async () => {
    await pool("alpha");
    await configure({ proxyPoolId: "alpha" });
  });

  it.each([500, 502, 503, 504])("permits request-local fallback for a transient %s without storing a cooldown", async (status) => {
    const credentials = await auth.getProviderCredentials(provider);
    expect(await auth.markAccountUnavailable(credentials.connectionId, status, "upstream temporarily unavailable", provider, model))
      .toEqual({ shouldFallback: true, cooldownMs: 0 });
    expect(await db.getProviderConnections()).toEqual([]);
  });

  it.each([
    [400, "invalid body"], [401, "unauthorized"], [402, "payment required"], [403, "IP blocked"],
    [404, "model_not_found"], [429, "rate limit"], [499, "client closed request"],
    [502, "client_aborted"], [502, new DOMException("Cancelled by caller", "AbortError")],
    [503, "quota exceeded"], [500, "prevent abuse"], [500, "oauth_not_allowed"],
    [503, "retry in 60 seconds"], [500, "unsupported model"],
  ])("does not rotate proxies around cancellation, client errors or denials (%s / %s)", async (status, error) => {
    const credentials = await auth.getProviderCredentials(provider);
    expect(await auth.markAccountUnavailable(credentials.connectionId, status, error, provider, model))
      .toEqual({ shouldFallback: false, cooldownMs: 0 });
    expect(await db.getProviderConnections()).toEqual([]);
  });

  it("honors an explicit upstream reset instead of changing proxy identity", async () => {
    const credentials = await auth.getProviderCredentials(provider);
    expect(await auth.markAccountUnavailable(credentials.connectionId, 503, "unavailable", provider, model, Date.now() + 60000))
      .toEqual({ shouldFallback: false, cooldownMs: 0 });
  });

  it("success cleanup and credential refresh cannot create a persistent virtual account", async () => {
    const credentials = await auth.getProviderCredentials(provider);
    expect(credentials.connectionId).toEqual(expect.any(String));
    const refreshed = await tokens.checkAndRefreshToken(provider, credentials);
    expect(refreshed.providerSpecificData).toEqual(credentials.providerSpecificData);
    await auth.markAccountUnavailable(credentials.connectionId, 502, "fetch failed", provider, model);
    await auth.clearAccountError(credentials.connectionId, { ...credentials, testStatus: "unavailable", lastError: "fixture", modelLock_mimo: "2099-01-01T00:00:00Z" }, model);
    expect(await tokens.updateProviderCredentials(credentials.connectionId, { accessToken: "synthetic-token", providerSpecificData: credentials.providerSpecificData })).toBe(false);
    expect(await db.getProviderConnections()).toEqual([]);
    expect(await db.getProxyPoolById("alpha")).toMatchObject({ testStatus: "unknown", lastError: null });
  });
});

describe("real no-auth proxy transport", () => {
  it("fails over from a broken CONNECT proxy without silently dialing the direct-egress trap", async () => {
    let directHits = 0, originHits = 0;
    const trapUrl = await listen(createServer((_req, res) => { directHits++; res.writeHead(418); res.end("direct egress"); }));
    const originUrl = await listen(createServer((_req, res) => { originHits++; res.end("proxied fixture"); }));
    const target = new URL(trapUrl);
    target.hostname = "noauth-upstream.invalid";
    const dispatcher = new Dispatcher1Wrapper(new Agent({ connect: { lookup: (_host, options, callback) => callback(null, options.all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4) } }));
    dispatchers.push(dispatcher);
    const connects = [];
    let brokenId;
    for (const id of ["alpha", "beta"]) {
      const server = createServer((_req, res) => { res.writeHead(405); res.end(); });
      server.on("connect", (req, socket, head) => {
        connects.push(id);
        if (req.url !== target.host || id === brokenId) {
          socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
          return;
        }
        const upstream = track(createConnection({ host: "127.0.0.1", port: Number(new URL(originUrl).port) }));
        socket.once("close", () => upstream.destroy());
        upstream.once("close", () => socket.destroy());
        upstream.once("connect", () => {
          socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length) upstream.write(head);
          socket.pipe(upstream).pipe(socket);
        });
      });
      await pool(id, { proxyUrl: await listen(server), strictProxy: false });
    }
    brokenId = (await db.getProxyPools())[0].id;
    await configure({ rotateStrategy: "random" });
    const excluded = new Set();
    const first = await auth.getProviderCredentials(provider, excluded);
    const failure = await proxyAwareFetch(target, { dispatcher, signal: AbortSignal.timeout(2000) }, first.providerSpecificData)
      .then(async response => ({ response: await response.text() }), error => ({ error }));
    expect(directHits).toBe(0);
    expect(failure.error).toBeInstanceOf(Error);
    expect(await auth.markAccountUnavailable(first.connectionId, 502, failure.error.message, provider, model))
      .toEqual({ shouldFallback: true, cooldownMs: 0 });
    excluded.add(first.connectionId);
    const second = await auth.getProviderCredentials(provider, excluded);
    const response = await proxyAwareFetch(target, { dispatcher, signal: AbortSignal.timeout(2000) }, second.providerSpecificData);
    expect(await response.text()).toBe("proxied fixture");
    expect(connects).toHaveLength(2);
    expect(new Set(connects)).toEqual(new Set(["alpha", "beta"]));
    expect({ directHits, originHits }).toEqual({ directHits: 0, originHits: 1 });
  });

  it("bounds the real chat loop by its pool count and leaves account storage empty", async () => {
    const hits = [];
    await relayPools((id, _req, res) => {
      hits.push(id);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "temporary upstream failure" } }));
    });
    const response = await handleChat(request(AbortSignal.timeout(2000)));
    expect(response.status).toBe(500);
    expect(hits.sort()).toEqual(["alpha", "beta"]);
    expect(await db.getProviderConnections()).toEqual([]);
  });

  it.each([[403, "IP blocked"], [429, "rate limit"], [500, "quota exceeded"]])("does not contact another relay after an upstream denial (%s)", async (status, message) => {
    const hits = [];
    await relayPools((id, _req, res) => {
      hits.push(id);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message } }));
    });
    const response = await handleChat(request(AbortSignal.timeout(2000)));
    expect(response.status).toBe(status);
    expect(hits).toHaveLength(1);
    expect(await db.getProviderConnections()).toEqual([]);
  });

  it("preserves cancellation during a live relay request", async () => {
    const controller = new AbortController();
    const hits = [];
    await relayPools((id, _req, _res) => {
      hits.push(id);
      controller.abort();
    });
    const credentials = await auth.getProviderCredentials(provider);
    const error = await proxyAwareFetch("https://upstream.invalid/chat", {
      method: "POST", body: "{}", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2000)]),
    }, credentials.providerSpecificData).then(() => null, error => error);
    expect(error?.name).toBe("AbortError");
    expect(await auth.markAccountUnavailable(credentials.connectionId, 502, error, provider, model))
      .toEqual({ shouldFallback: false, cooldownMs: 0 });
    expect(hits).toHaveLength(1);
    expect(await db.getProviderConnections()).toEqual([]);
  });

  it("does not dispatch an already-cancelled chat request", async () => {
    const hits = [];
    await relayPools(id => hits.push(id));
    const response = await handleChat(request(AbortSignal.abort()));
    expect(response.status).toBe(499);
    expect(hits).toHaveLength(0);
    expect(await db.getProviderConnections()).toEqual([]);
  });

  it("runs the real onRequestSuccess callback without creating a fake account", async () => {
    const hits = [];
    await relayPools((id, req, res, body) => {
      hits.push({ id, target: req.headers["x-relay-target"], body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "offline", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "relay fixture" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }));
    });
    const response = await handleChat(request(AbortSignal.timeout(2000)));
    expect(response.status).toBe(200);
    expect((await response.json()).choices[0].message.content).toBe("relay fixture");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ target: "https://opencode.ai", body: { model, messages: [{ role: "user", content: "offline fixture" }] } });
    expect(await db.getProviderConnections()).toEqual([]);
  });
});
