import { createServer } from "node:http";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { Agent, Dispatcher1Wrapper } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpstreamTransportPool } from "../../open-sse/utils/transportPool.js";

const nativeFetch = globalThis.fetch;
const servers = new Set();
const sockets = new Set();
const managers = new Set();

function track(socket) {
  sockets.add(socket);
  socket.on("error", () => {});
  socket.once("close", () => sockets.delete(socket));
  return socket;
}

async function serve(handler = (_req, res) => res.end("ok")) {
  const server = createServer(handler);
  server.on("connection", track);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.add(server);
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function manager(config = {}) {
  const result = createUpstreamTransportPool({ connectionsPerOrigin: 1, ...config });
  managers.add(result);
  return result;
}

async function request(pool, url, options = {}, route = {}) {
  return nativeFetch(url, {
    signal: AbortSignal.timeout(2000),
    ...options,
    dispatcher: await pool.getDispatcher(route),
  });
}

async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await delay(5);
  expect(predicate()).toBe(true);
}

async function connectProxy(target) {
  const connects = [];
  const forwarded = [];
  const fixture = await serve((req, res) => {
    forwarded.push(req.url);
    res.writeHead(405).end();
  });
  fixture.server.on("connect", (req, socket, head) => {
    connects.push({ authority: req.url, auth: req.headers["proxy-authorization"] });
    if (req.url !== "upstream.fixture.invalid:80") {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
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
  return { ...fixture, connects, forwarded };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const pool of managers) await pool.close({ timeoutMs: 200 });
  managers.clear();
  const closing = [...servers].map(server => new Promise(resolve => server.close(resolve)));
  for (const socket of sockets) socket.destroy();
  await Promise.all(closing);
  servers.clear();
  await until(() => sockets.size === 0);
});

describe("managed upstream pools on real Node native fetch", () => {
  it("single-flights the default wrapper and reuses the actual sequential HTTP connection", async () => {
    const ports = [];
    const fixture = await serve((req, res) => { ports.push(req.socket.remotePort); res.end("reused"); });
    const pool = manager();
    const dispatchers = await Promise.all(Array.from({ length: 20 }, () => pool.getDispatcher()));
    expect(new Set(dispatchers).size).toBe(1);
    expect(dispatchers[0]).toBeInstanceOf(Dispatcher1Wrapper);
    for (let i = 0; i < 5; i++) expect(await (await request(pool, fixture.url)).text()).toBe("reused");
    expect(new Set(ports).size).toBe(1);
    expect(pool.stats()).toMatchObject({ initializations: 1, created: 1, requests: 5, poolHits: 4, active: 0, queued: 0, connectionsCreated: 1 });
  });

  it("concurrent first requests create only one origin pool and obey the connection bound", async () => {
    const ports = new Set();
    const fixture = await serve(async (req, res) => {
      ports.add(req.socket.remotePort);
      await delay(10);
      res.end("concurrent");
    });
    const pool = manager({ connectionsPerOrigin: 2 });
    const responses = await Promise.all(Array.from({ length: 12 }, () => request(pool, fixture.url).then(res => res.text())));
    expect(responses).toEqual(Array(12).fill("concurrent"));
    expect(ports.size).toBeLessThanOrEqual(2);
    expect(pool.stats()).toMatchObject({ initializations: 1, created: 1, completed: 12, active: 0, queued: 0 });
    expect(pool.stats().queuedPeak).toBeGreaterThan(0);
  });

  it("single-flights a real CONNECT dispatcher, tunnels HTTP, and isolates proxy credentials", async () => {
    const hosts = [];
    const target = await serve((req, res) => { hosts.push(req.headers.host); res.end("tunneled"); });
    const proxy = await connectProxy(target);
    const pool = manager();
    const route = { proxyUrl: proxy.url.replace("http://", "http://one:secret@") };
    const dispatchers = await Promise.all(Array.from({ length: 12 }, () => pool.getDispatcher(route)));
    expect(new Set(dispatchers).size).toBe(1);
    for (let i = 0; i < 3; i++) {
      expect(await (await request(pool, "http://upstream.fixture.invalid/path", {}, route)).text()).toBe("tunneled");
    }
    const other = { proxyUrl: proxy.url.replace("http://", "http://two:secret@") };
    expect(await pool.getDispatcher(other)).not.toBe(dispatchers[0]);
    expect(await (await request(pool, "http://upstream.fixture.invalid/path", {}, other)).text()).toBe("tunneled");
    expect(proxy.connects).toEqual([
      { authority: "upstream.fixture.invalid:80", auth: `Basic ${Buffer.from("one:secret").toString("base64")}` },
      { authority: "upstream.fixture.invalid:80", auth: `Basic ${Buffer.from("two:secret").toString("base64")}` },
    ]);
    expect(proxy.forwarded).toEqual([]);
    expect(hosts).toEqual(Array(4).fill("upstream.fixture.invalid"));
    expect(pool.stats()).toMatchObject({ created: 2, initializations: 1, active: 0, connectionsCreated: 2 });
    expect(JSON.stringify(pool.stats())).not.toMatch(/secret|one:|two:/);
  });

  it("bounds proxy maps even with concurrent initialization for many distinct keys", async () => {
    const pool = manager({ maxProxyRoutes: 2 });
    await Promise.all(Array.from({ length: 30 }, (_, index) => pool.getDispatcher({ proxyUrl: `http://user${index}:synthetic@127.0.0.1:9` })));
    expect(pool.stats()).toMatchObject({ proxyRoutes: 2, livePools: 0, initializations: 1 });
  });

  it("retires an evicted origin without cutting its active stream or applying idle timeouts to it", async () => {
    let held;
    const first = await serve((_req, res) => { held = res; res.writeHead(200); res.write("first"); });
    const second = await serve();
    const pool = manager({ maxOriginsPerRoute: 1, maxLivePools: 3, poolIdleTimeoutMs: 20, keepAliveTimeoutMs: 10, keepAliveMaxTimeoutMs: 10 });
    const stream = await request(pool, first.url);
    const reader = stream.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
    expect(await (await request(pool, second.url)).text()).toBe("ok");
    expect(pool.stats().pools).toEqual(expect.arrayContaining([expect.objectContaining({ retired: true, active: 1 })]));
    await delay(80);
    expect(held.destroyed).toBe(false);
    held.end("last");
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    expect(text).toBe("last");
    reader.releaseLock();
    await until(() => pool.stats().active === 0 && pool.stats().drainingPools === 0);
  });

  it("retire-and-drains an evicted proxy while binding the new proxy to a different live pool", async () => {
    let held;
    const target = await serve((req, res) => {
      if (req.url === "/held") { held = res; res.write("held"); }
      else res.end("new-route");
    });
    const proxy = await connectProxy(target);
    const pool = manager({ maxProxyRoutes: 1, maxLivePools: 3 });
    const oldRoute = { proxyUrl: proxy.url };
    const nextRoute = { proxyUrl: proxy.url.replace("http://", "http://next:fixture@") };
    const stream = await request(pool, "http://upstream.fixture.invalid/held", {}, oldRoute);
    expect(await (await request(pool, "http://upstream.fixture.invalid/new", {}, nextRoute)).text()).toBe("new-route");
    expect(pool.stats()).toMatchObject({ proxyRoutes: 1, drainingPools: 1, active: 1 });
    expect(held.destroyed).toBe(false);
    held.end("-finished");
    expect(await stream.text()).toBe("held-finished");
    await until(() => pool.stats().drainingPools === 0);
    expect(proxy.connects).toHaveLength(2);
  });

  it("releases queued cancellation immediately, rejects overflow, and never sends cancelled work", async () => {
    let held;
    const paths = [];
    const fixture = await serve((req, res) => {
      paths.push(req.url);
      if (req.url === "/held") { held = res; res.write("held"); }
      else res.end(req.url);
    });
    const pool = manager({ maxQueuedPerOrigin: 1, maxQueuedTotal: 1 });
    const first = await request(pool, `${fixture.url}/held`);
    const ctrl = new AbortController();
    const reason = new Error("caller cancelled queue");
    const cancelled = request(pool, `${fixture.url}/cancelled`, { signal: ctrl.signal });
    const rejection = expect(cancelled).rejects.toBe(reason);
    await until(() => pool.stats().queued === 1);
    ctrl.abort(reason);
    await rejection;
    expect(pool.stats()).toMatchObject({ queued: 0, active: 1, cancelled: 1 });
    const next = request(pool, `${fixture.url}/next`);
    await until(() => pool.stats().queued === 1);
    await expect(request(pool, `${fixture.url}/overflow`)).rejects.toMatchObject({ cause: { code: "UPSTREAM_QUEUE_LIMIT" } });
    held.end("-done");
    expect(await first.text()).toBe("held-done");
    expect(await (await next).text()).toBe("/next");
    expect(paths).toEqual(["/held", "/next"]);
    expect(pool.stats()).toMatchObject({ queued: 0, active: 0, rejected: 1 });
  });

  it("keeps active cancellation attached after response headers", async () => {
    const fixture = await serve((_req, res) => res.write("start"));
    const pool = manager();
    const ctrl = new AbortController();
    const response = await request(pool, fixture.url, { signal: ctrl.signal });
    const reader = response.body.getReader();
    await reader.read();
    const pending = expect(reader.read()).rejects.toThrow();
    ctrl.abort(new Error("caller stopped streaming"));
    await pending;
    await until(() => pool.stats().active === 0);
    expect(pool.stats().cancelled).toBe(1);
  });

  it("rejects a new origin at the live-pool bound without destroying a held stream", async () => {
    let held;
    const first = await serve((_req, res) => { held = res; res.write("held"); });
    const second = await serve();
    const pool = manager({ maxOriginsPerRoute: 1, maxLivePools: 1 });
    const stream = await request(pool, first.url);
    await expect(request(pool, second.url)).rejects.toMatchObject({ cause: { code: "UPSTREAM_POOL_LIMIT" } });
    expect(pool.stats().livePools).toBe(1);
    expect(held.destroyed).toBe(false);
    held.end();
    await stream.text();
    await until(() => pool.stats().livePools === 0);
    expect(await (await request(pool, second.url)).text()).toBe("ok");
  });

  it("expires idle pools and applies a runtime reuse-cap change only to new pools", async () => {
    let held;
    const fixture = await serve((req, res) => {
      if (req.url === "/held") { held = res; res.write("held"); }
      else res.end("ok");
    });
    const pool = manager({ poolIdleTimeoutMs: 25 });
    await (await request(pool, fixture.url)).text();
    await until(() => pool.stats().livePools === 0);
    const stream = await request(pool, `${fixture.url}/held`);
    expect(pool.configure({ keepAliveMaxTimeoutMs: 15, poolIdleTimeoutMs: 10 }).keepAliveMaxTimeoutMs).toBe(15);
    await delay(60);
    expect(held.destroyed).toBe(false);
    held.end();
    await stream.text();
    await until(() => pool.stats().livePools === 0);
  });

  it("enforces response-header deadlines at dispatch without turning them into active-stream idle deadlines", async () => {
    const hanging = await serve(() => {});
    const pool = manager({ headersTimeoutMs: 40 });
    const start = Date.now();
    await expect(request(pool, hanging.url)).rejects.toMatchObject({ cause: { code: "UND_ERR_HEADERS_TIMEOUT" } });
    expect(Date.now() - start).toBeLessThan(1000);
    await until(() => pool.stats().active === 0);
  });

  it("clears the dispatch header deadline once headers arrive and leaves a silent body alive", async () => {
    let held;
    const fixture = await serve((_req, res) => { held = res; res.write("headers-arrived"); });
    const pool = manager({ headersTimeoutMs: 40 });
    const response = await request(pool, fixture.url);
    await delay(120);
    expect(held.destroyed).toBe(false);
    expect(pool.stats().active).toBe(1);
    held.end("-finished");
    expect(await response.text()).toBe("headers-arrived-finished");
    expect(pool.stats().active).toBe(0);
  });

  it("awaits graceful close, rejects new work, and is idempotent", async () => {
    let held;
    const fixture = await serve((_req, res) => { held = res; res.write("held"); });
    const pool = manager();
    const stream = await request(pool, fixture.url);
    const body = stream.text();
    const closing = pool.close({ timeoutMs: 500 });
    expect(pool.close()).toBe(closing);
    await expect(pool.getDispatcher()).rejects.toMatchObject({ code: "UPSTREAM_POOL_CLOSED" });
    held.end("-end");
    expect(await body).toBe("held-end");
    expect(await closing).toMatchObject({ timedOut: false, active: 0, queued: 0, livePools: 0, closing: true });
  });

  it("cancels shutdown's queued work, destroys a hung body within the close deadline, and releases sockets", async () => {
    const fixture = await serve((_req, res) => res.write("hung"));
    const pool = manager();
    const stream = await request(pool, fixture.url);
    const reader = stream.body.getReader();
    await reader.read();
    const bodyFailure = expect(reader.read()).rejects.toThrow();
    const queued = request(pool, fixture.url);
    const queueFailure = expect(queued).rejects.toThrow();
    await until(() => pool.stats().queued === 1);
    const start = Date.now();
    const result = await pool.close({ timeoutMs: 100 });
    expect(Date.now() - start).toBeLessThan(400);
    await Promise.all([bodyFailure, queueFailure]);
    expect(result).toMatchObject({ timedOut: true, closing: true, queued: 0, forced: 1 });
    await until(() => pool.stats().livePools === 0 && pool.stats().active === 0);
  });

  it("catches asynchronous close rejection and awaits real destroy instead of leaking an unhandled promise", async () => {
    const fixture = await serve();
    const pool = manager();
    await (await request(pool, fixture.url)).text();
    const close = vi.spyOn(Agent.prototype, "close").mockRejectedValueOnce(new Error("synthetic async close rejection"));
    const result = await pool.close({ timeoutMs: 500 });
    close.mockRestore();
    expect(result).toMatchObject({ disposalErrors: 1, livePools: 0, active: 0 });
  });

  it("observes an asynchronous destroy failure, retries it at the deadline, and does not report a leaked pool as closed", async () => {
    const fixture = await serve();
    const pool = manager();
    await (await request(pool, fixture.url)).text();
    vi.spyOn(Agent.prototype, "close").mockRejectedValueOnce(new Error("synthetic close failure"));
    const destroy = vi.spyOn(Agent.prototype, "destroy").mockRejectedValueOnce(new Error("synthetic destroy failure"));
    const result = await pool.close({ timeoutMs: 200 });
    expect(destroy.mock.calls.filter(call => call.length === 1).map(([error]) => error?.code)).toEqual([
      "UPSTREAM_CLOSE_FAILED", "UPSTREAM_POOL_CLOSED",
    ]);
    expect(result).toMatchObject({ timedOut: true, disposalErrors: 2, livePools: 0, active: 0 });
  });
});
