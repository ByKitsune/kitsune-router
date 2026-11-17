import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VIDEO_MAX_RESPONSE_BYTES } from "open-sse/config/runtimeConfig.js";
import { MAX_UPSTREAM_ERROR_BYTES } from "open-sse/utils/error.js";
import { createServer } from "node:http";

const fixture = vi.hoisted(() => ({
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(),
  clearAccountError: vi.fn(),
  checkAndRefreshToken: vi.fn(),
  updateProviderCredentials: vi.fn(),
  refreshTokenByProvider: vi.fn(),
  getProxyPoolById: vi.fn(),
  nativeFetch: globalThis.fetch,
}));
vi.mock("@/models", () => ({ getProxyPoolById: fixture.getProxyPoolById }));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: fixture.getProviderCredentials,
  markAccountUnavailable: fixture.markAccountUnavailable,
  clearAccountError: fixture.clearAccountError,
  extractApiKey: () => null,
  isValidApiKey: async () => true,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: fixture.checkAndRefreshToken,
  updateProviderCredentials: fixture.updateProviderCredentials,
}));
vi.mock("open-sse/services/tokenRefresh.js", () => ({ refreshTokenByProvider: fixture.refreshTokenByProvider }));
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => ({ requireApiKey: false }),
  isApiKeyRequired: () => false,
  getComboByName: async () => null,
  getModelAliases: async () => ({}),
  getProviderNodes: async () => [],
}));
vi.mock("@/sse/utils/logger.js", () => ({ info() {}, warn() {}, error() {}, debug() {} }));

import { handleVideoProxyCore } from "open-sse/handlers/videoCore.js";
import { handleVideoCreate, handleVideoGet } from "@/sse/handlers/videoGeneration.js";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";

const originalFetch = global.fetch;
const encoder = new TextEncoder();
const account = () => ({ connectionId: "video-audit-account", apiKey: "synthetic-video-api-key" });
const invokeCore = options => handleVideoProxyCore({
  provider: "xai", action: "generations", rawBody: "{}", credentials: account(), ...options,
});
const cancelled = new Error("synthetic caller disconnected");

async function promptly(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Video operation did not settle promptly")), 1000);
    })]);
  } finally { clearTimeout(timer); }
}

function stalledBody() {
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const cancel = vi.fn(() => new Promise(() => {}));
  const stream = new ReadableStream({ pull() { entered(); }, cancel }, { highWaterMark: 0 });
  return { stream, ready, cancel };
}

beforeEach(() => {
  global.fetch = vi.fn();
  for (const mock of Object.values(fixture)) if (vi.isMockFunction(mock)) mock.mockReset();
  fixture.getProviderCredentials.mockImplementation(async () => account());
  fixture.checkAndRefreshToken.mockImplementation(async (_provider, credentials) => credentials);
  fixture.markAccountUnavailable.mockResolvedValue({ shouldFallback: true });
});
afterEach(() => { global.fetch = originalFetch; vi.unstubAllEnvs(); });

describe("bounded complete video metadata", () => {
  it("preserves successful UTF-8 metadata bytes and upstream status", async () => {
    const bytes = encoder.encode(' { "request_id": "video-猫", "video": { "url": "https://example.com/a?sig=x%2Fy" } }\n');
    global.fetch.mockResolvedValueOnce(new Response(bytes, { status: 202, headers: { "content-type": "application/json" } }));
    const result = await invokeCore();
    expect(result.success).toBe(true);
    expect(result.response.status).toBe(202);
    expect(new Uint8Array(await result.response.arrayBuffer())).toEqual(bytes);
  });

  it("fails a body transport error instead of accepting an empty successful creation", async () => {
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode('{"request_id":')); },
      pull(controller) { controller.error(new Error("synthetic response socket failure")); },
    });
    global.fetch.mockResolvedValueOnce(new Response(stream));
    const result = await invokeCore();
    expect(result).toMatchObject({ success: false, status: 502 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['{"request_id":', "", "[]", "null"])("rejects incomplete or invalid JSON envelopes: %j", async body => {
    global.fetch.mockResolvedValueOnce(new Response(body));
    expect(await invokeCore()).toMatchObject({ success: false, status: 502 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized successful metadata without waiting for cancellation cleanup", async () => {
    const cancel = vi.fn(() => new Promise(() => {}));
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(VIDEO_MAX_RESPONSE_BYTES + 1)); }, cancel,
    }, { highWaterMark: 0 });
    global.fetch.mockResolvedValueOnce(new Response(stream));
    expect(await promptly(invokeCore())).toMatchObject({ success: false, status: 502 });
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("caps rejected diagnostics while retaining the original error status", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode("quota " + "x".repeat(MAX_UPSTREAM_ERROR_BYTES * 2))); }, cancel,
    }, { highWaterMark: 0 });
    global.fetch.mockResolvedValueOnce(new Response(stream, { status: 429 }));
    const result = await invokeCore();
    expect(result).toMatchObject({ success: false, status: 429 });
    expect(result.error.length).toBeLessThanOrEqual(2100);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it("keeps the request deadline active during a stalled body read", async () => {
    const body = stalledBody();
    global.fetch.mockResolvedValueOnce(new Response(body.stream));
    const pending = invokeCore({ timeoutMs: 25 });
    await body.ready;
    expect(await promptly(pending)).toMatchObject({ success: false, status: 408 });
    expect(body.cancel).toHaveBeenCalledOnce();
    expect(body.stream.locked).toBe(false);
  });
});

describe("video cancellation is terminal", () => {
  it("does not dispatch an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort(cancelled);
    expect(await invokeCore({ signal: controller.signal })).toMatchObject({ success: false, status: 499 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("recognizes ordinary Error abort reasons during fetch", async () => {
    const controller = new AbortController();
    global.fetch.mockImplementation(async () => { controller.abort(cancelled); throw cancelled; });
    expect(await invokeCore({ signal: controller.signal })).toMatchObject({ success: false, status: 499 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("settles an aborted body read without waiting for upstream cleanup", async () => {
    const controller = new AbortController();
    const body = stalledBody();
    global.fetch.mockResolvedValueOnce(new Response(body.stream));
    const pending = invokeCore({ signal: controller.signal });
    await body.ready;
    controller.abort(cancelled);
    expect(await promptly(pending)).toMatchObject({ success: false, status: 499 });
    expect(body.cancel).toHaveBeenCalledExactlyOnceWith(cancelled);
    expect(body.stream.locked).toBe(false);
  });

  it("forwards cancellation into a refresh and never retries the creation", async () => {
    const controller = new AbortController();
    global.fetch.mockResolvedValueOnce(Response.json({ error: "expired" }, { status: 401 }));
    fixture.refreshTokenByProvider.mockImplementation(async (_provider, _credentials, _log, _proxy, signal) => {
      expect(signal.aborted).toBe(false);
      controller.abort(cancelled);
      signal.throwIfAborted();
    });
    const onCredentialsRefreshed = vi.fn();
    expect(await invokeCore({ signal: controller.signal, credentials: { ...account(), refreshToken: "synthetic-refresh-token" }, onCredentialsRefreshed }))
      .toMatchObject({ success: false, status: 499 });
    expect(fixture.refreshTokenByProvider).toHaveBeenCalledOnce();
    expect(onCredentialsRefreshed).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("finishes an acquired rotated-token commit but does not submit again after cancellation", async () => {
    const controller = new AbortController();
    global.fetch.mockResolvedValueOnce(Response.json({ error: "expired" }, { status: 401 }));
    fixture.refreshTokenByProvider.mockResolvedValueOnce({ accessToken: "synthetic-rotated-token" });
    const onCredentialsRefreshed = vi.fn(async () => { controller.abort(cancelled); });
    expect(await invokeCore({ signal: controller.signal, credentials: { ...account(), refreshToken: "synthetic-refresh-token" }, onCredentialsRefreshed }))
      .toMatchObject({ success: false, status: 499 });
    expect(onCredentialsRefreshed).toHaveBeenCalledExactlyOnceWith({ accessToken: "synthetic-rotated-token" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe.each(["create", "poll"])("video %s account health", operation => {
  const invoke = signal => operation === "create"
    ? handleVideoCreate(new Request("http://localhost/v1/videos/generations", { method: "POST", body: '{"prompt":"synthetic"}', headers: { "content-type": "application/json" }, signal }), "generations")
    : handleVideoGet(new Request("http://localhost/v1/videos/job", { signal }), "job");

  it("does not select or mutate an account after caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort(cancelled);
    expect((await invoke(controller.signal)).status).toBe(499);
    expect(fixture.getProviderCredentials).not.toHaveBeenCalled();
    expect(fixture.checkAndRefreshToken).not.toHaveBeenCalled();
    expect(fixture.markAccountUnavailable).not.toHaveBeenCalled();
    expect(fixture.clearAccountError).not.toHaveBeenCalled();
  });

  it("stops after cancellation during credential selection", async () => {
    const controller = new AbortController();
    fixture.getProviderCredentials.mockImplementationOnce(async () => { controller.abort(cancelled); return account(); });
    expect((await invoke(controller.signal)).status).toBe(499);
    expect(fixture.checkAndRefreshToken).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(fixture.markAccountUnavailable).not.toHaveBeenCalled();
    expect(fixture.clearAccountError).not.toHaveBeenCalled();
  });

  it("passes cancellation to proactive refresh without marking the account unavailable", async () => {
    const controller = new AbortController();
    fixture.checkAndRefreshToken.mockImplementationOnce(async (_provider, _credentials, { signal }) => {
      expect(signal.aborted).toBe(false);
      controller.abort(cancelled);
      signal.throwIfAborted();
    });
    expect((await invoke(controller.signal)).status).toBe(499);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(fixture.markAccountUnavailable).not.toHaveBeenCalled();
    expect(fixture.clearAccountError).not.toHaveBeenCalled();
  });

  it("does not rotate or change account health when the response body is cancelled", async () => {
    const controller = new AbortController();
    const body = stalledBody();
    global.fetch.mockResolvedValueOnce(new Response(body.stream));
    const pending = invoke(controller.signal);
    await body.ready;
    controller.abort(cancelled);
    expect((await promptly(pending)).status).toBe(499);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(fixture.getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(fixture.markAccountUnavailable).not.toHaveBeenCalled();
    expect(fixture.clearAccountError).not.toHaveBeenCalled();
  });

  it("does not mark a truncated success healthy or retry a potentially billable job", async () => {
    global.fetch.mockResolvedValueOnce(new Response('{"request_id":'));
    expect((await invoke(new AbortController().signal)).status).toBe(502);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(fixture.getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(fixture.markAccountUnavailable).toHaveBeenCalledTimes(1);
    expect(fixture.clearAccountError).not.toHaveBeenCalled();
  });
});

describe("video account egress policy", () => {
  let directRequests;
  const invoke = (operation = "create") => operation === "create"
    ? handleVideoCreate(new Request("http://localhost/v1/videos/generations", {
      method: "POST", body: '{"prompt":"synthetic relay fixture"}',
      headers: { "content-type": "application/json", "idempotency-key": "synthetic-video-idempotency" },
    }), "generations")
    : handleVideoGet(new Request("http://localhost/v1/videos/synthetic-job"), "synthetic-job");

  beforeEach(() => {
    directRequests = [];
    for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(name, "");
    vi.stubEnv("DISABLE_MITM_BYPASS", "1");
    // Real HTTP is allowed only to our fixture. A broken routing regression
    // cannot send even these synthetic credentials to the public provider.
    global.fetch = (url, options) => {
      const target = new URL(String(url));
      if (target.hostname !== "127.0.0.1") {
        directRequests.push(String(url));
        throw new Error("Unexpected direct video egress");
      }
      return fixture.nativeFetch(url, options);
    };
  });

  async function withRelay(handler, run) {
    const requests = [];
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const entry = {
        target: request.headers["x-relay-target"], path: request.headers["x-relay-path"],
        authorization: request.headers.authorization, idempotency: request.headers["idempotency-key"],
        body: Buffer.concat(chunks).toString(),
      };
      requests.push(entry);
      response.setHeader("content-type", "application/json");
      handler(entry, response);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const relay = `http://127.0.0.1:${server.address().port}`;
      fixture.getProxyPoolById.mockResolvedValue({ id: "video-relay", isActive: true, strictProxy: true, type: "vercel", proxyUrl: relay });
      fixture.getProviderCredentials.mockImplementation(async () => ({ ...account(), providerSpecificData: { proxyPoolId: "video-relay" } }));
      await run(requests, relay);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }

  it.each(["create", "poll"])("does not dispatch %s credentials when a strict pool is missing", async operation => {
    fixture.getProviderCredentials.mockImplementation(async () => ({ ...account(), providerSpecificData: { proxyPoolId: "missing", strictProxy: true } }));
    fixture.getProxyPoolById.mockResolvedValue(null);
    expect((await invoke(operation)).status).toBe(502);
    expect(directRequests).toEqual([]);
    expect(fixture.getProxyPoolById).toHaveBeenCalledExactlyOnceWith("missing");
    expect(fixture.getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(fixture.markAccountUnavailable).not.toHaveBeenCalled();
    expect(fixture.clearAccountError).not.toHaveBeenCalled();
    const policy = fixture.checkAndRefreshToken.mock.calls[0][2].proxyOptions;
    expect(Object.isFrozen(policy)).toBe(true);
    expect(policy).toMatchObject({ connectionProxyEnabled: true, strictProxy: true });
  });

  it("retains strict policy from an inactive pool without rotating accounts", async () => {
    fixture.getProviderCredentials.mockImplementation(async () => ({ ...account(), providerSpecificData: { proxyPoolId: "inactive" } }));
    fixture.getProxyPoolById.mockResolvedValue({ isActive: false, strictProxy: true, proxyUrl: "http://127.0.0.1:1" });
    expect((await invoke()).status).toBe(502);
    expect(directRequests).toEqual([]);
    expect(fixture.getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(fixture.markAccountUnavailable).not.toHaveBeenCalled();
  });

  it.each(["create", "poll"])("carries %s credentials and metadata through the selected real relay", async operation => {
    await withRelay((_request, response) => response.end('{"request_id":"synthetic-job","status":"pending"}'), async requests => {
      const result = await invoke(operation);
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ request_id: "synthetic-job", status: "pending" });
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        target: "https://api.x.ai", path: operation === "create" ? "/v1/videos/generations" : "/v1/videos/synthetic-job",
        authorization: "Bearer synthetic-video-api-key",
      });
      if (operation === "create") {
        expect(requests[0].idempotency).toBe("synthetic-video-idempotency");
        expect(requests[0].body).toBe('{"prompt":"synthetic relay fixture"}');
      }
      expect(fixture.getProxyPoolById).toHaveBeenCalledTimes(1);
      expect(directRequests).toEqual([]);
    });
  });

  it("uses the same immutable resolved policy for proactive refresh, 401 refresh and the single resend", async () => {
    let videos = 0;
    await withRelay((entry, response) => {
      if (entry.path === "/synthetic-token") response.end('{"access_token":"synthetic-refreshed-access","refresh_token":"synthetic-rotated-refresh"}');
      else if (++videos === 1) { response.statusCode = 401; response.end('{"error":"expired"}'); }
      else response.end('{"request_id":"synthetic-after-refresh"}');
    }, async requests => {
      fixture.getProviderCredentials.mockImplementation(async () => ({
        ...account(), accessToken: "synthetic-old-access", refreshToken: "synthetic-old-refresh",
        providerSpecificData: { proxyPoolId: "video-relay" },
      }));
      let proactivePolicy;
      fixture.checkAndRefreshToken.mockImplementationOnce(async (_provider, credentials, options) => {
        proactivePolicy = options.proxyOptions;
        return { ...credentials, providerSpecificData: { strictProxy: true, proxyPoolId: "changed-mid-request" } };
      });
      fixture.refreshTokenByProvider.mockImplementationOnce(async (_provider, credentials, _log, policy, signal) => {
        expect(policy).toBe(proactivePolicy);
        const response = await proxyAwareFetch("https://auth-video.example/synthetic-token", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: credentials.refreshToken }), signal,
        }, policy);
        const result = await response.json();
        return { accessToken: result.access_token, refreshToken: result.refresh_token };
      });
      expect((await invoke()).status).toBe(200);
      expect(requests.map(({ target, path }) => ({ target, path }))).toEqual([
        { target: "https://api.x.ai", path: "/v1/videos/generations" },
        { target: "https://auth-video.example", path: "/synthetic-token" },
        { target: "https://api.x.ai", path: "/v1/videos/generations" },
      ]);
      expect(JSON.parse(requests[1].body)).toEqual({ refresh_token: "synthetic-old-refresh" });
      expect(requests[2].authorization).toBe("Bearer synthetic-refreshed-access");
      expect(fixture.updateProviderCredentials).toHaveBeenCalledExactlyOnceWith("video-audit-account", expect.objectContaining({ accessToken: "synthetic-refreshed-access" }));
      expect(fixture.getProxyPoolById).toHaveBeenCalledTimes(1);
      expect(directRequests).toEqual([]);
    });
  });

  it("never falls back to direct egress when the configured relay closes the socket", async () => {
    await withRelay((_entry, response) => response.destroy(), async requests => {
      expect((await invoke()).status).toBe(502);
      expect(requests).toHaveLength(1);
      expect(directRequests).toEqual([]);
      expect(fixture.getProviderCredentials).toHaveBeenCalledTimes(1);
      expect(fixture.markAccountUnavailable).not.toHaveBeenCalled();
      expect(fixture.clearAccountError).not.toHaveBeenCalled();
    });
  });

  it("retains the shared environment-proxy route when an account has no explicit policy", async () => {
    // Real proxy routing is covered by transport tests; this boundary must keep
    // the environment policy available rather than setting a false pool marker.
    global.fetch = vi.fn(async (_url, options) => {
      expect(options.dispatcher).toBeDefined();
      return Response.json({ request_id: "synthetic-environment-proxy" });
    });
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:43210");
    expect((await invoke()).status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(fixture.getProxyPoolById).not.toHaveBeenCalled();
  });
});
