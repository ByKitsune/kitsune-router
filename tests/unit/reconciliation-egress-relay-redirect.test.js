import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";

const nativeFetch = globalThis.fetch;
const target = "https://gemini-upstream.invalid/v1beta/models/fixture:generateContent";
const apiKey = "offline-relay-google-key";
const body = JSON.stringify({ contents: [{ parts: [{ text: "offline relay credential body" }] }] });
const proxyEnvKeys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"];
let proxyAwareFetch, patchedFetch;
let servers = [], sockets = new Set();

beforeAll(async () => {
  // Keep native HTTP sockets real, but forbid accidental live-provider access.
  globalThis.fetch = (url, options) => {
    if (new URL(url).hostname !== "127.0.0.1") throw new Error("Offline relay fixture forbids external transport");
    return nativeFetch(url, options);
  };
  ({ proxyAwareFetch, default: patchedFetch } = await import("../../open-sse/utils/proxyFetch.js"));
});

beforeEach(() => {
  for (const key of proxyEnvKeys) vi.stubEnv(key, "");
  globalThis.fetch = patchedFetch;
});

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  servers = [];
  sockets = new Set();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(() => { globalThis.fetch = nativeFetch; });

async function listen(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  server.on("connection", socket => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function record(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return { method: request.method, key: request.headers["x-goog-api-key"], body: Buffer.concat(chunks).toString(),
    target: request.headers["x-relay-target"], path: request.headers["x-relay-path"] };
}

function options(extra = {}) {
  return { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body, signal: AbortSignal.timeout(2000), ...extra };
}

async function outcome(promise) {
  return promise.then(async response => ({ text: await response.text() }), error => ({ error }));
}

async function promptly(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve("still pending"), 500); })]);
  } finally {
    clearTimeout(timer);
  }
}

describe.each([303, 307])("selected relay HTTP %s redirects cannot escape egress", status => {
  it.each([
    [false, undefined], [true, undefined], [false, "follow"], [true, "follow"],
  ])("rejects before any destination request (strict=%s, caller redirect=%s)", async (strictProxy, redirect) => {
    const destinationRequests = [];
    const relayRequests = [];
    const privateBytes = "offline local resource must not reach the caller";
    const destination = await listen(async (request, response) => {
      destinationRequests.push(await record(request));
      response.end(privateBytes);
    });
    const relay = await listen(async (request, response) => {
      relayRequests.push(await record(request));
      response.writeHead(status, { location: `${destination}/private-resource?key=offline-location-secret` });
      response.end();
    });
    const logs = ["warn", "error", "debug"].map(level => vi.spyOn(console, level).mockImplementation(() => {}));
    const result = await outcome(proxyAwareFetch(target, options(redirect ? { redirect } : {}), {
      vercelRelayUrl: relay, strictProxy,
    }));
    expect(destinationRequests, "a relay Location must never receive a direct request or provider key").toEqual([]);
    expect(relayRequests).toEqual([{ method: "POST", key: apiKey, body, target: "https://gemini-upstream.invalid",
      path: "/v1beta/models/fixture:generateContent" }]);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.text).toBeUndefined();
    expect(result.error.cause).toBeUndefined();
    const diagnostic = [String(result.error), ...logs.flatMap(log => log.mock.calls.flat().map(String))].join(" ");
    expect(diagnostic).not.toMatch(/offline-relay-google-key|offline-location-secret|offline relay credential body|private-resource/);
    if (strictProxy) expect(result.error.message).toContain("strictProxy=true");
  });
});

describe("relay redirect refusal preserves transport behavior", () => {
  it("retains successful non-redirecting relay requests and native credential headers", async () => {
    const requests = [];
    const relay = await listen(async (request, response) => {
      requests.push(await record(request));
      response.end("healthy relay fixture");
    });
    const response = await proxyAwareFetch(target, options({ redirect: "follow" }), { vercelRelayUrl: relay, strictProxy: true });
    expect(await response.text()).toBe("healthy relay fixture");
    expect(requests).toEqual([{ method: "POST", key: apiKey, body, target: "https://gemini-upstream.invalid",
      path: "/v1beta/models/fixture:generateContent" }]);
  });

  it("keeps caller cancellation attached after relay response headers", async () => {
    let closed;
    const upstreamClosed = new Promise(resolve => { closed = resolve; });
    const relay = await listen(async (request, response) => {
      await record(request);
      response.once("close", () => closed(true));
      response.writeHead(200, { "content-type": "text/plain" });
      response.write("offline unfinished response");
    });
    const caller = new AbortController();
    const reason = new Error("ordinary relay caller cancellation");
    const response = await proxyAwareFetch(target, options({ signal: AbortSignal.any([caller.signal, AbortSignal.timeout(2000)]) }), {
      vercelRelayUrl: relay, strictProxy: true,
    });
    expect(response.status).toBe(200);
    const reading = response.text().then(text => ({ text }), error => ({ error }));
    caller.abort(reason);
    const result = await promptly(reading);
    expect(result.error).toBeInstanceOf(Error);
    expect(await promptly(upstreamClosed)).toBe(true);
  });

  it.each([false, true])("keeps explicit relay no_proxy semantics (strict=%s)", async strictProxy => {
    const destinationRequests = [];
    let relayRequests = 0;
    const destination = await listen(async (request, response) => {
      destinationRequests.push(await record(request));
      response.end("explicit exclusion fixture");
    });
    const relay = await listen((_request, response) => { relayRequests++; response.end("unexpected relay request"); });
    const result = await outcome(proxyAwareFetch(`${destination}/excluded`, options(), {
      vercelRelayUrl: relay, connectionNoProxy: "127.0.0.1", strictProxy,
    }));
    expect(relayRequests).toBe(0);
    if (strictProxy) {
      expect(result.error?.message).toContain("strictProxy=true");
      expect(destinationRequests).toEqual([]);
    } else {
      expect(result.text).toBe("explicit exclusion fixture");
      expect(destinationRequests).toEqual([{ method: "POST", key: apiKey, body, target: undefined, path: undefined }]);
    }
  });
});
