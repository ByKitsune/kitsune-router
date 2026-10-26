import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns/promises";
import http from "node:http";
import net from "node:net";
import { Agent, Dispatcher1Wrapper } from "undici";

// Pool reads are the only application boundary replaced: no production DB,
// account mutations, external DNS or upstream credentials are used here.
vi.mock("@/models", () => ({ getProxyPoolById: vi.fn() }));
import { getProxyPoolById } from "@/models";
import { resolveConnectionProxyConfig } from "../../src/lib/network/connectionProxy.js";

const nativeFetch = globalThis.fetch;
const authorization = "Bearer offline-egress-fixture";
const body = JSON.stringify({ refresh_token: "offline-refresh-fixture" });
const proxyEnvKeys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"];
let proxyAwareFetch, patchedFetch;
let servers = [], sockets = new Set(), dispatchers = [];

beforeAll(async () => {
  ({ proxyAwareFetch, default: patchedFetch } = await import("../../open-sse/utils/proxyFetch.js"));
});

beforeEach(() => {
  for (const key of proxyEnvKeys) vi.stubEnv(key, "");
  vi.stubEnv("DISABLE_MITM_BYPASS", "0");
  globalThis.fetch = patchedFetch;
  getProxyPoolById.mockReset();
});

afterEach(async () => {
  globalThis.fetch = patchedFetch;
  for (const socket of sockets) socket.destroy();
  await Promise.all([
    ...servers.map(server => new Promise(resolve => server.close(resolve))),
    ...dispatchers.map(dispatcher => dispatcher.destroy()),
  ]);
  servers = [];
  sockets = new Set();
  dispatchers = [];
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(() => { globalThis.fetch = nativeFetch; });

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

async function origin(reply) {
  const requests = [];
  const url = await listen(http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({ authorization: request.headers.authorization, body: Buffer.concat(chunks).toString(),
      target: request.headers["x-relay-target"], path: request.headers["x-relay-path"] });
    response.end(reply);
  }));
  return { url, requests };
}

async function proxy(upstreamUrl = null, onConnect = null) {
  const connects = [];
  const server = http.createServer((_request, response) => { response.writeHead(405); response.end(); });
  server.on("connect", (request, socket, head) => {
    connects.push(request.url);
    onConnect?.();
    if (!upstreamUrl) {
      socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = track(net.connect(Number(new URL(upstreamUrl).port), "127.0.0.1"));
    socket.once("close", () => upstream.destroy());
    upstream.once("close", () => socket.destroy());
    upstream.once("connect", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
  });
  return { url: await listen(server), connects };
}

function requestOptions(signal = AbortSignal.timeout(2000)) {
  // Any accidental direct retry reaches the real trap instead of failing DNS.
  const dispatcher = new Dispatcher1Wrapper(new Agent({ connect: {
    lookup: (_host, options, callback) => callback(null, options.all
      ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4),
  } }));
  dispatchers.push(dispatcher);
  return { method: "POST", headers: { authorization }, body, dispatcher, signal };
}

function upstreamUrl(trap, hostname = "egress-upstream.invalid") {
  const target = new URL(`${trap.url}/credential?fixture=1`);
  target.hostname = hostname;
  return target.toString();
}

async function outcome(promise) {
  return promise.then(async response => ({ response: await response.text() }), error => ({ error }));
}

// These are the fields copied by auth/usage/probe callers today. A new marker
// alone must not be the only thing preventing direct credential egress.
function forwardedPolicy(config) {
  return {
    connectionProxyEnabled: config.connectionProxyEnabled === true,
    connectionProxyUrl: config.connectionProxyUrl || "",
    connectionNoProxy: config.connectionNoProxy || "",
    vercelRelayUrl: config.vercelRelayUrl || "",
    strictProxy: config.strictProxy === true,
  };
}

describe("configured egress uses real proxy transport without implicit direct retry", () => {
  it.each([false, true])("does not send credentials directly after a CONNECT failure (strict=%s)", async strictProxy => {
    const trap = await origin("DIRECT EGRESS");
    const broken = await proxy();
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(), {
      connectionProxyEnabled: true, connectionProxyUrl: broken.url, strictProxy,
    }));
    expect(trap.requests).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
    expect(broken.connects).toHaveLength(1);
    if (strictProxy) expect(result.error.message).toContain("strictProxy=true");
  });

  it("keeps a failed selected proxy out of the MITM direct-IP path", async () => {
    const trap = await origin("DIRECT EGRESS");
    const broken = await proxy();
    const dnsLookup = vi.spyOn(dns.Resolver.prototype, "resolve4").mockRejectedValue(new Error("offline DNS failure"));
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap, "cloudcode-pa.googleapis.com"), requestOptions(), {
      enabled: true, url: broken.url, strictProxy: false,
    }));
    expect(trap.requests).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
    expect(dnsLookup).not.toHaveBeenCalled();
    expect(broken.connects).toHaveLength(1);
  });

  it.each([false, true])("sends credentials only through a healthy selected proxy (strict=%s)", async strictProxy => {
    const trap = await origin("DIRECT EGRESS");
    const upstream = await origin("proxied fixture");
    const selected = await proxy(upstream.url);
    const response = await proxyAwareFetch(upstreamUrl(trap), requestOptions(), {
      connectionProxyEnabled: true, connectionProxyUrl: selected.url, strictProxy,
    });
    expect(await response.text()).toBe("proxied fixture");
    expect(upstream.requests).toEqual([{ authorization, body, target: undefined, path: undefined }]);
    expect(trap.requests).toEqual([]);
    expect(selected.connects).toEqual([new URL(trap.url).host.replace("127.0.0.1", "egress-upstream.invalid")]);
  });

  it("does not treat an environment proxy failure as permission for direct egress", async () => {
    const trap = await origin("DIRECT EGRESS");
    const broken = await proxy();
    vi.stubEnv("HTTP_PROXY", broken.url);
    const result = await outcome(patchedFetch(upstreamUrl(trap), requestOptions()));
    expect(trap.requests).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
    expect(broken.connects).toHaveLength(1);
  });

  it("retains working environment proxy routing", async () => {
    const trap = await origin("DIRECT EGRESS");
    const upstream = await origin("environment proxy fixture");
    const selected = await proxy(upstream.url);
    vi.stubEnv("HTTP_PROXY", selected.url);
    const response = await patchedFetch(upstreamUrl(trap), requestOptions());
    expect(await response.text()).toBe("environment proxy fixture");
    expect(upstream.requests).toHaveLength(1);
    expect(trap.requests).toEqual([]);
  });

  it("routes a selected relay to the relay and never the direct-egress trap", async () => {
    const trap = await origin("DIRECT EGRESS");
    const relay = await origin("relay fixture");
    const target = upstreamUrl(trap);
    const response = await proxyAwareFetch(target, requestOptions(), { vercelRelayUrl: relay.url, strictProxy: false });
    expect(await response.text()).toBe("relay fixture");
    expect(relay.requests).toEqual([{ authorization, body, target: new URL(target).origin, path: "/credential?fixture=1" }]);
    expect(trap.requests).toEqual([]);
  });

  it("does not send credentials directly after a relay transport failure", async () => {
    const trap = await origin("DIRECT EGRESS");
    const relay = await listen(http.createServer(request => request.socket.destroy()));
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(), { vercelRelayUrl: relay }));
    expect(result.error).toBeInstanceOf(Error);
    expect(trap.requests).toEqual([]);
  });

  it.each([false, true])("retains explicit relay routing even for a loopback target (strict=%s)", async strictProxy => {
    const trap = await origin("DIRECT EGRESS");
    const relay = await origin("loopback-target relay fixture");
    const response = await proxyAwareFetch(`${trap.url}/credential`, requestOptions(), { vercelRelayUrl: relay.url, strictProxy });
    expect(await response.text()).toBe("loopback-target relay fixture");
    expect(relay.requests).toEqual([{ authorization, body, target: trap.url, path: "/credential" }]);
    expect(trap.requests).toEqual([]);
  });
});

describe("unusable configured pools retain non-strict fail-closed intent", () => {
  it.each([
    ["missing", null],
    ["inactive", { isActive: false, proxyUrl: "http://127.0.0.1:9", strictProxy: false }],
    ["blank", { isActive: true, proxyUrl: "  ", strictProxy: false }],
    ["inactive relay", { type: "vercel", isActive: false, proxyUrl: "http://127.0.0.1:9", strictProxy: false }],
  ])("blocks direct credentials after resolving a %s pool, including projected callers", async (_name, pool) => {
    const trap = await origin("DIRECT EGRESS");
    getProxyPoolById.mockResolvedValue(pool);
    const config = await resolveConnectionProxyConfig({ proxyPoolId: "selected-pool" });
    expect(config).toMatchObject({ source: "none", strictProxy: false, proxyPoolId: "selected-pool" });
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(), forwardedPolicy(config)));
    expect(trap.requests).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("blocks direct credentials after a pool lookup failure without promoting strictProxy", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const trap = await origin("DIRECT EGRESS");
    getProxyPoolById.mockRejectedValue(new Error("offline lookup failure"));
    const config = await resolveConnectionProxyConfig({ proxyPoolId: "selected-pool" });
    expect(config).toMatchObject({ source: "error", strictProxy: false });
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(), forwardedPolicy(config)));
    expect(trap.requests).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("rejects an enabled but empty legacy proxy before direct dispatch", async () => {
    const trap = await origin("DIRECT EGRESS");
    const config = await resolveConnectionProxyConfig({ connectionProxyEnabled: true, connectionProxyUrl: " " });
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(), forwardedPolicy(config)));
    expect(trap.requests).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
    expect(config.strictProxy).toBe(false);
  });

  it("does not activate a stale disabled legacy URL when the selected pool is unusable", async () => {
    const trap = await origin("DIRECT EGRESS");
    const staleOrigin = await origin("disabled legacy proxy");
    const staleProxy = await proxy(staleOrigin.url);
    getProxyPoolById.mockResolvedValue(null);
    const config = await resolveConnectionProxyConfig({ proxyPoolId: "missing-pool", connectionProxyEnabled: false,
      connectionProxyUrl: staleProxy.url });
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(), forwardedPolicy(config)));
    expect(result.error).toBeInstanceOf(Error);
    expect(staleProxy.connects).toEqual([]);
    expect(staleOrigin.requests).toEqual([]);
    expect(trap.requests).toEqual([]);
  });

  it("does not activate stale disabled legacy exclusions for an unusable pool", async () => {
    const trap = await origin("DIRECT EGRESS");
    getProxyPoolById.mockResolvedValue(null);
    const config = await resolveConnectionProxyConfig({ proxyPoolId: "missing-pool", connectionProxyEnabled: false,
      connectionNoProxy: "*" });
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(), forwardedPolicy(config)));
    expect(trap.requests).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("permits a configured legacy proxy fallback, not a direct fallback", async () => {
    const trap = await origin("DIRECT EGRESS");
    const upstream = await origin("legacy proxy fixture");
    const selected = await proxy(upstream.url);
    getProxyPoolById.mockResolvedValue({ isActive: false, strictProxy: false });
    const config = await resolveConnectionProxyConfig({ proxyPoolId: "inactive", connectionProxyEnabled: true,
      connectionProxyUrl: selected.url });
    expect(config).toMatchObject({ source: "legacy", strictProxy: false });
    const response = await proxyAwareFetch(upstreamUrl(trap), requestOptions(), forwardedPolicy(config));
    expect(await response.text()).toBe("legacy proxy fixture");
    expect(trap.requests).toEqual([]);
    expect(upstream.requests).toHaveLength(1);
  });
});

describe("intentional direct and explicit exclusions stay available", () => {
  it.each([{}, { proxyPoolId: "__none__" }, { connectionProxyEnabled: false, connectionProxyUrl: "http://127.0.0.1:9" }])(
    "retains direct egress for an intentionally unconfigured route: %j", async input => {
      const direct = await origin("intentional direct fixture");
      const config = await resolveConnectionProxyConfig(input);
      const response = await proxyAwareFetch(upstreamUrl(direct), requestOptions(), forwardedPolicy(config));
      expect(await response.text()).toBe("intentional direct fixture");
      expect(direct.requests).toHaveLength(1);
      expect(config).toMatchObject({ source: "none", strictProxy: false, proxyPoolId: null });
    });

  it("preserves loopback exclusions for a non-strict connection proxy", async () => {
    const direct = await origin("loopback fixture");
    const broken = await proxy();
    const response = await proxyAwareFetch(direct.url, requestOptions(), { connectionProxyEnabled: true, connectionProxyUrl: broken.url });
    expect(await response.text()).toBe("loopback fixture");
    expect(broken.connects).toEqual([]);
  });

  it.each(["NO_PROXY", "no_proxy"])("preserves an explicit environment %s exclusion", async key => {
    const direct = await origin("environment exclusion fixture");
    const broken = await proxy();
    vi.stubEnv("HTTP_PROXY", broken.url);
    vi.stubEnv(key, "egress-upstream.invalid");
    const response = await patchedFetch(upstreamUrl(direct), requestOptions());
    expect(await response.text()).toBe("environment exclusion fixture");
    expect(broken.connects).toEqual([]);
  });

  it("honors an account no_proxy exclusion without substituting an environment proxy", async () => {
    const direct = await origin("account exclusion fixture");
    const broken = await proxy();
    vi.stubEnv("HTTP_PROXY", broken.url);
    const response = await proxyAwareFetch(upstreamUrl(direct), requestOptions(), {
      connectionProxyEnabled: true, connectionProxyUrl: broken.url, connectionNoProxy: ".egress-upstream.invalid",
    });
    expect(await response.text()).toBe("account exclusion fixture");
    expect(broken.connects).toEqual([]);
  });

  it("keeps strict missing-proxy enforcement even for an explicit exclusion", async () => {
    const trap = await origin("DIRECT EGRESS");
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(), {
      connectionProxyEnabled: true, connectionProxyUrl: "http://127.0.0.1:9", connectionNoProxy: "*", strictProxy: true,
    }));
    expect(result.error?.message).toContain("strictProxy=true");
    expect(trap.requests).toEqual([]);
  });
});

describe("guard, cancellation and diagnostic boundaries", () => {
  it.each(["strict missing", "non-strict missing", "non-strict broken"])("keeps guards after global fetch replacement: %s", async mode => {
    const trap = await origin("DIRECT EGRESS");
    const broken = await proxy();
    globalThis.fetch = (url, options) => nativeFetch(url, options);
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(), {
      connectionProxyEnabled: true, connectionProxyUrl: mode.endsWith("broken") ? broken.url : "", strictProxy: mode === "strict missing",
    }));
    expect(trap.requests).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("preserves a replaced global-fetch seam after applying relay routing", async () => {
    const trap = await origin("DIRECT EGRESS");
    const relay = await origin("replaced fetch relay fixture");
    globalThis.fetch = (url, options) => nativeFetch(url, options);
    const response = await proxyAwareFetch(upstreamUrl(trap), requestOptions(), { vercelRelayUrl: relay.url });
    expect(await response.text()).toBe("replaced fetch relay fixture");
    expect(relay.requests).toHaveLength(1);
    expect(trap.requests).toEqual([]);
  });

  it("retains the ordinary direct global-fetch mock seam", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ fixture: true }));
    const response = await proxyAwareFetch("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist");
    expect(await response.json()).toEqual({ fixture: true });
  });

  it("treats a caller's ordinary Error cancellation as terminal without fallback logs", async () => {
    const trap = await origin("DIRECT EGRESS");
    const controller = new AbortController();
    const reason = new Error("ordinary fixture cancellation");
    const broken = await proxy(null, () => controller.abort(reason));
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(2000)]);
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(signal), {
      connectionProxyEnabled: true, connectionProxyUrl: broken.url,
    }));
    expect(result.error).toBe(reason);
    expect(trap.requests).toEqual([]);
    expect(broken.connects).toHaveLength(1);
    expect(debug).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not dispatch an already-cancelled request through a replaced fetch seam", async () => {
    let dispatches = 0;
    const reason = new Error("cancelled before dispatch");
    globalThis.fetch = async () => { dispatches++; return new Response("unexpected dispatch"); };
    const result = await outcome(proxyAwareFetch("https://upstream.invalid", { signal: AbortSignal.abort(reason) }));
    expect(result.error).toBe(reason);
    expect(dispatches).toBe(0);
  });

  it("does not expose raw pool lookup errors in diagnostics", async () => {
    const diagnostic = "http://fixture-user:fixture-password@proxy.invalid token=fixture-secret";
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    getProxyPoolById.mockRejectedValue(new Error(diagnostic));
    await resolveConnectionProxyConfig({ proxyPoolId: "unavailable" });
    const logged = logs.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain(diagnostic);
    expect(logged).not.toContain("fixture-password");
  });

  it.each([false, true])("redacts proxy failure errors and logs (strict=%s)", async strictProxy => {
    const trap = await origin("DIRECT EGRESS");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await outcome(proxyAwareFetch(upstreamUrl(trap), requestOptions(), {
      connectionProxyEnabled: true, connectionProxyUrl: "bad-protocol://fixture-user:fixture-password@proxy.invalid", strictProxy,
    }));
    expect(trap.requests).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
    expect(`${result.error?.message} ${JSON.stringify(debug.mock.calls)} ${JSON.stringify(warn.mock.calls)}`)
      .not.toMatch(/fixture-user|fixture-password|bad-protocol/);
  });

  it.each(["proxy", "relay"])("redacts raw %s transport exceptions", async transport => {
    const rawError = "http://fixture-user:fixture-password@proxy.invalid Authorization: Bearer fixture-secret";
    globalThis.fetch = async () => { throw new Error(rawError); };
    const policy = transport === "relay" ? { vercelRelayUrl: "http://relay.invalid" }
      : { connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.invalid" };
    const result = await outcome(proxyAwareFetch("https://upstream.invalid", {}, policy));
    expect(result.error).toBeInstanceOf(Error);
    expect(String(result.error)).not.toMatch(/fixture-user|fixture-password|fixture-secret/);
  });

  it("matches MITM bypass hosts exactly, not hostname substrings", async () => {
    const direct = await origin("non-MITM fixture");
    const dnsLookup = vi.spyOn(dns.Resolver.prototype, "resolve4").mockRejectedValue(new Error("offline DNS failure"));
    const response = await proxyAwareFetch(upstreamUrl(direct, "cloudcode-pa.googleapis.com.attacker.invalid"), requestOptions());
    expect(await response.text()).toBe("non-MITM fixture");
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("retains DNS bypass consideration for an exact intentional-direct MITM host", async () => {
    const direct = await origin("exact MITM fixture");
    globalThis.__mitmBypassCooldown?.delete("api2.cursor.sh");
    const dnsLookup = vi.spyOn(dns.Resolver.prototype, "resolve4").mockRejectedValue(new Error("offline DNS failure"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const target = upstreamUrl(direct, "api2.cursor.sh");
    const fetchState = globalThis[Symbol.for("zenrouter.proxy-fetch.v1")];
    const dispatch = vi.spyOn(fetchState, "original").mockImplementation((url, options) => {
      expect(url).toBe(target);
      expect(options.dispatcher).toBeInstanceOf(Dispatcher1Wrapper);
      return nativeFetch(direct.url, options);
    });
    const response = await proxyAwareFetch(target, {
      method: "POST", headers: { authorization }, body, signal: AbortSignal.timeout(2000),
    });
    expect(await response.text()).toBe("exact MITM fixture");
    expect(dnsLookup).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(direct.requests).toEqual([{ authorization, body, target: undefined, path: undefined }]);
    globalThis.__mitmBypassCooldown?.delete("api2.cursor.sh");
  });
});
