import { createServer } from "node:http";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { Agent, Dispatcher1Wrapper } from "undici";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const nativeFetch = globalThis.fetch;
const servers = new Set();
const sockets = new Set();
let transport;
let patchedFetch;
let BaseExecutor;
let GrokWebExecutor;
let PerplexityWebExecutor;
let TraeExecutor;
let ZedExecutor;
let clearZedCaches;

function track(socket) {
  sockets.add(socket);
  socket.on("error", () => {});
  socket.once("close", () => sockets.delete(socket));
  return socket;
}

async function serve(handler) {
  const server = createServer(handler);
  server.on("connection", track);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.add(server);
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await delay(5);
  expect(predicate()).toBe(true);
}

async function relay(handler) {
  const requests = [];
  const ports = new Set();
  const fixture = await serve(async (req, res) => {
    ports.add(req.socket.remotePort);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    const request = { path: req.headers["x-relay-path"], target: req.headers["x-relay-target"], headers: req.headers, body: text ? JSON.parse(text) : null };
    requests.push(request);
    handler(request, res);
  });
  return { ...fixture, requests, ports, options: { vercelRelayUrl: fixture.url, strictProxy: true } };
}

beforeAll(async () => {
  transport = await import("../../open-sse/utils/proxyFetch.js");
  patchedFetch = globalThis.fetch;
  ({ BaseExecutor } = await import("../../open-sse/executors/base.js"));
  ({ GrokWebExecutor } = await import("../../open-sse/executors/grok-web.js"));
  ({ PerplexityWebExecutor } = await import("../../open-sse/executors/perplexity-web.js"));
  ({ default: TraeExecutor } = await import("../../open-sse/executors/trae.js"));
  ({ default: ZedExecutor } = await import("../../open-sse/executors/zed.js"));
  ({ clearZedCaches } = await import("../../open-sse/shared/zedAuth.js"));
});

beforeEach(() => {
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(key, "");
  vi.stubEnv("DISABLE_MITM_BYPASS", "1");
  clearZedCaches();
  globalThis.fetch = patchedFetch;
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  globalThis.fetch = patchedFetch;
  const closing = [...servers].map(server => new Promise(resolve => server.close(resolve)));
  for (const socket of sockets) socket.destroy();
  await Promise.all(closing);
  servers.clear();
  await until(() => sockets.size === 0 && transport.getUpstreamPoolStats().active === 0);
});

afterAll(async () => {
  await transport?.closeUpstreamPools({ timeoutMs: 500 });
  globalThis.fetch = nativeFetch;
});

const args = () => ({ model: "fixture-model", body: { messages: [{ role: "user", content: "hello transport" }] }, stream: false, credentials: { apiKey: "synthetic-cookie" }, signal: AbortSignal.timeout(2000) });

describe("actual proxyAwareFetch binding and route policy", () => {
  it("survives module/HMR re-evaluation without wrapping fetch recursively or duplicating initialization", async () => {
    const firstFetch = globalThis.fetch;
    const firstAgent = await transport.getDefaultAgent();
    const before = transport.getUpstreamPoolStats().initializations;
    vi.resetModules();
    const second = await import("../../open-sse/utils/proxyFetch.js");
    expect(globalThis.fetch).toBe(firstFetch);
    expect(await second.getDefaultAgent()).toBe(firstAgent);
    const target = await serve((_req, res) => res.end("one-hop"));
    expect(await (await second.proxyAwareFetch(target.url)).text()).toBe("one-hop");
    expect(second.getUpstreamPoolStats().initializations).toBe(before);
    expect(second.getUpstreamPoolStats().requests).toBe(transport.getUpstreamPoolStats().requests);
  });

  it("binds a real managed dispatcher to the selected relay and reuses it instead of the environment route", async () => {
    let trapHits = 0;
    const trap = await serve((_req, res) => { trapHits++; res.writeHead(500).end(); });
    trap.server.on("connect", (_req, socket) => { trapHits++; socket.end("HTTP/1.1 500 Trap\r\n\r\n"); });
    vi.stubEnv("HTTPS_PROXY", trap.url);
    vi.stubEnv("HTTP_PROXY", trap.url);
    const selected = await relay((_req, res) => res.end("{\"ok\":true}"));
    const before = transport.getUpstreamPoolStats().requests;
    for (let i = 0; i < 4; i++) {
      const response = await transport.proxyAwareFetch("https://selected.fixture.invalid/chat?q=1", {
        method: "POST", headers: new Headers({ Authorization: "Bearer synthetic", "Content-Type": "application/json" }), body: "{}",
      }, selected.options);
      expect(await response.json()).toEqual({ ok: true });
    }
    expect(selected.requests).toHaveLength(4);
    expect(selected.requests[0]).toMatchObject({ target: "https://selected.fixture.invalid", path: "/chat?q=1", headers: { authorization: "Bearer synthetic" } });
    expect(selected.ports.size).toBe(1);
    expect(transport.getUpstreamPoolStats().requests - before).toBe(4);
    expect(trapHits).toBe(0);
  });

  it("routes selected account HTTP proxy through CONNECT despite a different environment proxy", async () => {
    let trapHits = 0;
    const trap = await serve((_req, res) => { trapHits++; res.end("trap"); });
    trap.server.on("connect", (_req, socket) => { trapHits++; socket.destroy(); });
    vi.stubEnv("HTTP_PROXY", trap.url);
    const hits = [];
    const target = await serve((req, res) => { hits.push(req.url); res.end("selected"); });
    const connects = [];
    const proxy = await serve((_req, res) => res.writeHead(405).end());
    proxy.server.on("connect", (req, socket, head) => {
      connects.push(req.url);
      if (req.url !== "selected.fixture.invalid:80") { socket.destroy(); return; }
      const upstream = track(createConnection(target.server.address().port, "127.0.0.1"));
      upstream.once("connect", () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      socket.once("close", () => upstream.destroy());
      upstream.once("close", () => socket.destroy());
    });
    for (let i = 0; i < 3; i++) {
      const response = await transport.proxyAwareFetch("http://selected.fixture.invalid/chat", {}, { enabled: true, url: proxy.url });
      expect(await response.text()).toBe("selected");
    }
    expect(connects).toEqual(["selected.fixture.invalid:80"]);
    expect(hits).toEqual(["/chat", "/chat", "/chat"]);
    expect(trapHits).toBe(0);
  });

  it("never retries a failed selected proxy or relay directly, even when non-strict", async () => {
    const trap = await serve((_req, res) => res.end("direct-leak"));
    const direct = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).startsWith(trap.url) || !init.dispatcher) throw new Error("Direct egress trap");
      return nativeFetch(url, init);
    });
    const proxy = await serve((_req, res) => res.writeHead(502).end());
    proxy.server.on("connect", (_req, socket) => socket.end("HTTP/1.1 502 Rejected\r\nConnection: close\r\n\r\n"));
    await expect(transport.proxyAwareFetch("http://no-egress.fixture.invalid/chat", { signal: AbortSignal.timeout(1000) }, {
      enabled: true, url: proxy.url, strictProxy: false,
    })).rejects.toThrow("direct egress is disabled");
    expect(direct).toHaveBeenCalledTimes(1);
    expect(direct.mock.calls[0][1].dispatcher).toBeInstanceOf(Dispatcher1Wrapper);
    const redirect = await serve((_req, res) => res.writeHead(302, { Location: trap.url }).end());
    await expect(transport.proxyAwareFetch(trap.url, {}, { vercelRelayUrl: redirect.url, strictProxy: false }))
      .rejects.toThrow("direct egress is disabled");
    expect(direct).toHaveBeenCalledTimes(2);
    expect(direct.mock.calls[1][0]).toBe(redirect.url);
    expect(direct.mock.calls[1][1]).toMatchObject({ redirect: "error" });
    expect(direct.mock.calls[1][1].dispatcher).toBeInstanceOf(Dispatcher1Wrapper);
  });

  it("preserves account NO_PROXY and automatic loopback exclusions without falling into the environment proxy", async () => {
    let trapHits = 0;
    const trap = await serve((_req, res) => { trapHits++; res.end("trap"); });
    trap.server.on("connect", (_req, socket) => { trapHits++; socket.destroy(); });
    vi.stubEnv("HTTP_PROXY", trap.url);
    const target = await serve((_req, res) => res.end("direct-local"));
    expect(await (await transport.proxyAwareFetch(target.url, {}, { enabled: true, url: trap.url })).text()).toBe("direct-local");
    const external = "http://no-proxy.fixture.invalid/";
    const shim = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      expect(String(url)).toBe(external);
      expect(init.dispatcher).toBeUndefined();
      return nativeFetch(target.url, init);
    });
    expect(await (await transport.proxyAwareFetch(external, {}, { enabled: true, url: trap.url, noProxy: ".fixture.invalid" })).text()).toBe("direct-local");
    await expect(transport.proxyAwareFetch(target.url, {}, { enabled: true, url: trap.url, strictProxy: true })).rejects.toThrow("strictProxy=true");
    expect(shim).toHaveBeenCalledTimes(1);
    expect(trapHits).toBe(0);
  });

  it("does not replace a caller-owned pinned dispatcher with the generic default", async () => {
    const target = await serve((_req, res) => res.end("pinned"));
    const agent = new Agent({ connections: 1 });
    const pinned = new Dispatcher1Wrapper(agent);
    const before = transport.getUpstreamPoolStats().requests;
    try {
      expect(await (await transport.proxyAwareFetch(target.url, { dispatcher: pinned })).text()).toBe("pinned");
      expect(transport.getUpstreamPoolStats().requests).toBe(before);
    } finally { await pinned.close(); }
  });

  it("leaves Cursor's HTTP/2-only path separate and rejects required proxy policy before any native dial", async () => {
    const { CursorExecutor } = await import("../../open-sse/executors/cursor.js");
    const executor = new CursorExecutor();
    executor.buildUrl = () => "https://cursor.fixture.invalid/agent.v1.AgentService/Run";
    const dial = vi.spyOn(executor, "openAgentHttp2Stream").mockImplementation(() => { throw new Error("Direct HTTP/2 egress trap"); });
    const before = transport.getUpstreamPoolStats().requests;
    await expect(executor.executeAgent({
      ...args(), credentials: { accessToken: "synthetic" }, proxyOptions: { enabled: true, url: "http://127.0.0.1:9" },
    })).rejects.toThrow("no direct connection was opened");
    expect(dial).not.toHaveBeenCalled();
    expect(transport.getUpstreamPoolStats().requests).toBe(before);
  });
});

describe("selected account policy reaches owned executor exceptions", () => {
  it.each(["grok", "perplexity"])("forwards %s through the selected relay, keeps auth, and cancels rejected bodies", async kind => {
    let rejectedBody;
    const selected = await relay((request, res) => {
      if (request.headers["x-reject"] || selected.requests.length === 2) {
        rejectedBody = res;
        res.writeHead(403, { "content-type": "text/plain" });
        res.write("rejected-but-not-ended");
      } else if (kind === "grok") {
        res.end(`${JSON.stringify({ result: { response: { token: "relay-ok" } } })}\n`);
      } else res.end(`data: ${JSON.stringify({ text: "relay-ok", final: true })}\n\n`);
    });
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:9");
    const executor = kind === "grok" ? new GrokWebExecutor() : new PerplexityWebExecutor();
    const first = await executor.execute({ ...args(), proxyOptions: selected.options });
    expect((await first.response.json()).choices[0].message.content).toBe("relay-ok");
    const second = await executor.execute({ ...args(), proxyOptions: selected.options });
    expect(second.response.status).toBe(403);
    await until(() => rejectedBody.destroyed);
    expect(selected.requests[0].headers.cookie).toBe(kind === "grok" ? "sso=synthetic-cookie" : "__Secure-next-auth.session-token=synthetic-cookie");
    expect(selected.requests[0].target).toBe(kind === "grok" ? "https://grok.com" : "https://www.perplexity.ai");
  });

  it("forwards both Trae session creation and its event stream through the same selected policy", async () => {
    const selected = await relay((request, res) => {
      if (request.path === "/api/remote/v1/chat_sessions") {
        res.end(JSON.stringify({ code: 0, data: { chat_session_id: "fixture-session", message_id: "fixture-message" } }));
      } else {
        res.end('event: plan_item\ndata: {"id":"one","thought":"trae-relay"}\n\nevent: done\ndata: {}\n\n');
      }
    });
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:9");
    const result = await new TraeExecutor().execute({ ...args(), credentials: { accessToken: "synthetic-trae" }, proxyOptions: selected.options });
    expect((await result.response.json()).choices[0].message.content).toBe("trae-relay");
    expect(selected.requests.map(req => req.path)).toEqual([
      "/api/remote/v1/chat_sessions", "/api/remote/v1/chat_sessions/fixture-session/events?reply_to_message_id=fixture-message",
    ]);
    expect(selected.requests.every(req => req.headers.authorization === "Cloud-IDE-JWT synthetic-trae")).toBe(true);
    expect(selected.ports.size).toBe(1);
  });

  it("forwards Zed catalog, forced catalog refresh, token refresh, and completion through the selected relay", async () => {
    let tokenCount = 0;
    let catalogCount = 0;
    let completionCount = 0;
    const selected = await relay((request, res) => {
      res.setHeader("Content-Type", "application/json");
      if (request.path === "/client/llm_tokens") res.end(JSON.stringify({ token: `llm-token-${++tokenCount}` }));
      else if (request.path === "/models") {
        catalogCount++;
        res.end(JSON.stringify({ models: catalogCount === 1 ? [] : [{ id: "grok-fixture", provider: "xai" }] }));
      } else if (++completionCount === 1) {
        res.writeHead(401);
        res.write("expired-body-never-ends");
      } else res.end(`${JSON.stringify({ event: { choices: [{ index: 0, delta: { content: "zed-relay" }, finish_reason: "stop" }] } })}\n[DONE]\n`);
    });
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:9");
    const executor = new ZedExecutor();
    const credentials = { accessToken: "synthetic-zed", providerSpecificData: { userId: "fixture-user", organizationId: "fixture-org" } };
    const result = await executor.execute({ ...args(), model: "grok-fixture", credentials, proxyOptions: selected.options });
    expect(await result.response.text()).toContain("zed-relay");
    expect(selected.requests.map(req => req.path)).toEqual(["/client/llm_tokens", "/models", "/models", "/completions", "/client/llm_tokens", "/completions"]);
    expect(selected.requests.every(req => req.target === "https://cloud.zed.dev")).toBe(true);
    expect(selected.requests[0].headers.authorization).toBe("fixture-user synthetic-zed");
    expect(selected.requests[3].headers.authorization).toBe("Bearer llm-token-1");
    expect(selected.requests[5].headers.authorization).toBe("Bearer llm-token-2");
  });

  it.each(["base", "grok", "perplexity", "trae", "zed"])("keeps ordinary Error caller cancellation terminal for %s", async kind => {
    let hit;
    const arrived = new Promise(resolve => { hit = resolve; });
    const selected = await relay(() => hit());
    const ctrl = new AbortController();
    const executor = kind === "base" ? new BaseExecutor("fixture", { baseUrl: "https://upstream.fixture.invalid/chat" })
      : kind === "grok" ? new GrokWebExecutor()
        : kind === "perplexity" ? new PerplexityWebExecutor()
          : kind === "trae" ? new TraeExecutor() : new ZedExecutor();
    const reason = new Error("caller stopped provider");
    const pending = executor.execute({ ...args(), credentials: { accessToken: "synthetic", providerSpecificData: { userId: "fixture", organizationId: "fixture" } }, signal: ctrl.signal, proxyOptions: selected.options });
    const failure = expect(pending).rejects.toBe(reason);
    await arrived;
    ctrl.abort(reason);
    await failure;
    expect(selected.requests).toHaveLength(1);
  });

  it("cancels a rejected BaseExecutor body before retry or fallback so a one-connection pool cannot wedge", async () => {
    const held = [];
    const selected = await relay((request, res) => {
      if (request.path === "/retry" && selected.requests.length === 1) { held.push(res); res.writeHead(503); res.write("retry"); }
      else if (request.path === "/fallback") { held.push(res); res.writeHead(429); res.write("fallback"); }
      else res.end("{\"ok\":true}");
    });
    const settings = transport.getUpstreamPoolStats().settings;
    transport.configureUpstreamPools({ connectionsPerOrigin: 1 });
    try {
      const retry = new BaseExecutor("fixture", { baseUrl: "https://upstream.fixture.invalid/retry", retry: { 503: { attempts: 1, delayMs: 1 } } });
      const one = await retry.execute({ ...args(), proxyOptions: selected.options });
      expect(await one.response.json()).toEqual({ ok: true });
      const fallback = new BaseExecutor("fixture", { baseUrls: ["https://upstream.fixture.invalid/fallback", "https://upstream.fixture.invalid/ok"] });
      const two = await fallback.execute({ ...args(), proxyOptions: selected.options });
      expect(await two.response.json()).toEqual({ ok: true });
      await until(() => held.every(res => res.destroyed));
      expect(selected.requests.map(req => req.path)).toEqual(["/retry", "/retry", "/fallback", "/ok"]);
    } finally { transport.configureUpstreamPools(settings); }
  });
});
