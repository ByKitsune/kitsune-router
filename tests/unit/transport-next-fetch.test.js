import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { Agent, Dispatcher1Wrapper } from "undici";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { patchFetch } = createRequire(import.meta.url)("next/dist/server/lib/patch-fetch.js");
const nativeFetch = globalThis.fetch;
const nextPatchKey = Symbol.for("next-patch");
const originalNextPatch = globalThis[nextPatchKey];
const servers = new Set();
const sockets = new Set();
let transport;
let patchedFetch;

async function serve(handler = (_req, res) => res.end("one-hop")) {
  const server = createServer(handler);
  server.on("connection", socket => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.add(server);
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function installNextFetch(workAsyncStorage = new AsyncLocalStorage()) {
  // Exercise Next's real dedupe/tracing wrapper, installed AFTER our patch as
  // in production. Bound re-entry so the broken code fails without flooding
  // the runner with thousands of PromiseRejectCallback stack overflows.
  const downstream = vi.fn((url, options) => {
    if (downstream.mock.calls.length > 3) throw new Error("Next fetch re-entered Kitsune Router transport");
    return patchedFetch(url, options);
  });
  globalThis.fetch = downstream;
  delete globalThis[nextPatchKey];
  patchFetch({ workAsyncStorage, workUnitAsyncStorage: new AsyncLocalStorage() });
  expect(globalThis.fetch.__nextPatched).toBe(true);
  return downstream;
}

async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await delay(5);
  expect(predicate()).toBe(true);
}

beforeAll(async () => {
  transport = await import("../../open-sse/utils/proxyFetch.js");
  patchedFetch = transport.default;
  transport.configureUpstreamPools({ connectionsPerOrigin: 1 });
});

beforeEach(() => {
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(key, "");
  vi.stubEnv("DISABLE_MITM_BYPASS", "1");
  globalThis.fetch = patchedFetch;
});

afterEach(async () => {
  globalThis.fetch = patchedFetch;
  if (originalNextPatch === undefined) delete globalThis[nextPatchKey];
  else globalThis[nextPatchKey] = originalNextPatch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

describe("Next.js fetch wrapping the process-wide Kitsune Router transport", () => {
  it("sends background global fetch through each wrapper once and keeps connection pooling", async () => {
    const target = await serve();
    const downstream = installNextFetch();
    const before = transport.getUpstreamPoolStats().requests;
    expect(await (await fetch(target.url, { signal: AbortSignal.timeout(2000) })).text()).toBe("one-hop");
    expect(downstream).toHaveBeenCalledTimes(1);
    expect(transport.getUpstreamPoolStats().requests - before).toBe(1);
  });

  it("does not delegate an explicit upstream fetch back into the enclosing Next wrapper", async () => {
    const target = await serve();
    const downstream = installNextFetch();
    const before = transport.getUpstreamPoolStats().requests;
    expect(await (await transport.proxyAwareFetch(target.url)).text()).toBe("one-hop");
    expect(downstream).not.toHaveBeenCalled();
    expect(transport.getUpstreamPoolStats().requests - before).toBe(1);
  });

  it("preserves POST body and headers inside an actual Next request work store", async () => {
    const requests = [];
    const target = await serve(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      requests.push({ method: req.method, auth: req.headers.authorization, body: Buffer.concat(chunks).toString() });
      res.end("route-ok");
    });
    const work = new AsyncLocalStorage();
    const downstream = installNextFetch(work);
    const body = JSON.stringify({ messages: [{ role: "user", content: "fixture" }] });
    const response = await work.run({ route: "/api/v1/chat/completions", forceDynamic: true }, () => fetch(target.url, {
      method: "POST", headers: { Authorization: "Bearer synthetic" }, body, signal: AbortSignal.timeout(2000),
    }));
    expect(await response.text()).toBe("route-ok");
    expect(requests).toEqual([{ method: "POST", auth: "Bearer synthetic", body }]);
    expect(downstream).toHaveBeenCalledTimes(1);
  });

  it("survives module re-evaluation underneath Next without recapturing or replacing its wrapper", async () => {
    const ports = new Set();
    const target = await serve((req, res) => { ports.add(req.socket.remotePort); res.end("reused"); });
    const downstream = installNextFetch();
    const nextFetch = globalThis.fetch;
    const agent = await transport.getDefaultAgent();
    vi.resetModules();
    const reloaded = await import("../../open-sse/utils/proxyFetch.js");
    expect(globalThis.fetch).toBe(nextFetch);
    expect(reloaded.default).toBe(patchedFetch);
    expect(await reloaded.getDefaultAgent()).toBe(agent);
    for (let i = 0; i < 3; i++) expect(await (await fetch(target.url)).text()).toBe("reused");
    expect(downstream).toHaveBeenCalledTimes(3);
    expect(ports.size).toBe(1);
  });

  it("keeps selected relay policy, authorization and managed dispatcher ahead of an environment proxy", async () => {
    const received = [];
    const relay = await serve((req, res) => { received.push(req.headers); res.end("relay-ok"); });
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:9");
    const downstream = installNextFetch();
    const response = await transport.proxyAwareFetch("https://upstream.fixture.invalid/chat?q=1", {
      method: "POST", headers: { Authorization: "Bearer synthetic" }, body: "{}", signal: AbortSignal.timeout(2000),
    }, { vercelRelayUrl: relay.url, strictProxy: true });
    expect(await response.text()).toBe("relay-ok");
    expect(received).toEqual([expect.objectContaining({
      authorization: "Bearer synthetic", "x-relay-target": "https://upstream.fixture.invalid", "x-relay-path": "/chat?q=1",
    })]);
    expect(downstream).not.toHaveBeenCalled();
  });

  it("preserves a caller-owned dispatcher through Next without routing through the default pool", async () => {
    const target = await serve();
    const downstream = installNextFetch();
    const pinned = new Dispatcher1Wrapper(new Agent({ connections: 1 }));
    const before = transport.getUpstreamPoolStats().requests;
    try {
      expect(await (await fetch(target.url, { dispatcher: pinned })).text()).toBe("one-hop");
      expect(downstream).toHaveBeenCalledTimes(1);
      expect(transport.getUpstreamPoolStats().requests).toBe(before);
    } finally { await pinned.close(); }
  });

  it("keeps caller cancellation attached to a streaming body after Next receives the headers", async () => {
    const target = await serve((_req, res) => res.write("first"));
    const downstream = installNextFetch();
    const controller = new AbortController();
    const response = await fetch(target.url, { signal: controller.signal });
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
    const failure = expect(reader.read()).rejects.toThrow();
    controller.abort(new Error("caller stopped"));
    await failure;
    reader.releaseLock();
    expect(downstream).toHaveBeenCalledTimes(1);
    await until(() => transport.getUpstreamPoolStats().active === 0);
  });
});
