import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const fixture = vi.hoisted(() => ({
  nativeFetch: globalThis.fetch, baseUrl: "", credentials: null,
  refresh: vi.fn(), getCredentials: vi.fn(), markUnavailable: vi.fn(), clearError: vi.fn(),
}));
vi.mock("open-sse/providers/index.js", async importOriginal => {
  const original = await importOriginal();
  return { ...original, PROVIDER_MEDIA: { ...original.PROVIDER_MEDIA, xai: {
    ...original.PROVIDER_MEDIA.xai, videoConfig: { get baseUrl() { return fixture.baseUrl; } },
  } } };
});
vi.mock("open-sse/services/tokenRefresh.js", () => ({ refreshTokenByProvider: fixture.refresh }));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: fixture.getCredentials, markAccountUnavailable: fixture.markUnavailable,
  clearAccountError: fixture.clearError, extractApiKey: () => null, isValidApiKey: async () => true,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: async (_provider, credentials) => credentials, updateProviderCredentials: async () => true,
}));
vi.mock("@/sse/services/model.js", () => ({ getModelInfo: async () => ({ provider: "xai", model: "grok-imagine-video" }) }));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("@/lib/rateLimit/inferenceLimit.js", () => ({ withInferenceLimit: async (_request, _key, run) => run() }));
vi.mock("@/sse/utils/logger.js", () => ({ info() {}, warn() {}, error() {}, debug() {} }));

import { handleVideoProxyCore } from "open-sse/handlers/videoCore.js";
import { handleVideoCreate, handleVideoGet } from "@/sse/handlers/videoGeneration.js";

const servers = [];
const rawBody = '{ "prompt": "synthetic private video", "model": "grok-imagine-video" }';
let fetchCalls;

async function server(handler) {
  const requests = [];
  const instance = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const entry = { method: request.method, path: request.url, authorization: request.headers.authorization, body: Buffer.concat(chunks).toString() };
    requests.push(entry);
    handler(entry, response, requests);
  });
  servers.push(instance);
  await new Promise(resolve => instance.listen(0, "127.0.0.1", resolve));
  return { requests, origin: `http://127.0.0.1:${instance.address().port}` };
}

const invoke = (method = "POST", options = {}) => handleVideoProxyCore({
  provider: "xai", ...(method === "POST" ? { action: "generations", rawBody, contentType: "application/json" } : { requestId: "synthetic-job" }),
  credentials: fixture.credentials, ...options,
});

beforeEach(() => {
  vi.clearAllMocks();
  fixture.refresh.mockReset();
  fixture.credentials = { connectionId: "synthetic-video-account", accessToken: "synthetic-video-token", refreshToken: "synthetic-refresh-token", providerSpecificData: {} };
  fixture.getCredentials.mockReset().mockImplementation(async () => fixture.credentials);
  fixture.markUnavailable.mockReset().mockResolvedValue({ shouldFallback: true });
  fetchCalls = [];
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(name, "");
  vi.stubEnv("DISABLE_MITM_BYPASS", "1");
  vi.stubGlobal("fetch", (url, init) => {
    fetchCalls.push({ url: String(url), init });
    if (new URL(String(url)).hostname !== "127.0.0.1") throw new Error("Unexpected external video request");
    return fixture.nativeFetch(url, init);
  });
});
afterEach(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  for (const instance of servers.splice(0)) {
    instance.closeAllConnections();
    await new Promise(resolve => instance.close(resolve));
  }
});

describe.each(["POST", "GET"])("video %s rejects redirected requests", method => {
  it.each([
    [307, "same-origin"], [308, "same-origin"], [307, "cross-origin"], [308, "cross-origin"],
  ])("refuses HTTP %s %s redirects without forwarding credentials or submission bytes", async (status, originKind) => {
    const trap = await server((_entry, response) => response.end('{"request_id":"unexpected-trap-job"}'));
    const source = await server((entry, response) => {
      if (entry.path === "/credential-trap") { response.end('{"request_id":"unexpected-same-origin-job"}'); return; }
      response.writeHead(status, { location: originKind === "same-origin" ? "/credential-trap" : `${trap.origin}/credential-trap` });
      response.end("synthetic redirect");
    });
    fixture.baseUrl = `${source.origin}/v1/videos`;
    expect(await invoke(method)).toMatchObject({ success: false, status: 502, localFailure: true });
    expect(source.requests).toHaveLength(1);
    expect(source.requests[0]).toMatchObject({ method, authorization: "Bearer synthetic-video-token", body: method === "POST" ? rawBody : "" });
    expect(trap.requests).toEqual([]);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].init.redirect).toBe("manual");
    expect(fixture.refresh).not.toHaveBeenCalled();
  });

  it("keeps a redirect local without changing account health or selecting another account", async () => {
    const source = await server((_entry, response) => { response.writeHead(307, { location: "/credential-trap" }); response.end(); });
    fixture.baseUrl = `${source.origin}/v1/videos`;
    const request = new Request(`http://localhost/v1/videos/${method === "POST" ? "generations" : "synthetic-job"}`, method === "POST"
      ? { method, body: rawBody, headers: { "content-type": "application/json" } } : {});
    const response = method === "POST" ? await handleVideoCreate(request, "generations") : await handleVideoGet(request, "synthetic-job");
    expect(response.status).toBe(502);
    expect(source.requests).toHaveLength(1);
    expect(fixture.getCredentials).toHaveBeenCalledOnce();
    expect(fixture.markUnavailable).not.toHaveBeenCalled();
    expect(fixture.clearError).not.toHaveBeenCalled();
    expect(fixture.refresh).not.toHaveBeenCalled();
  });

  it("discards late real response headers after ordinary caller cancellation", async () => {
    const caller = new AbortController();
    let closed;
    const disconnected = new Promise(resolve => { closed = resolve; });
    const source = await server((_entry, response) => {
      response.on("close", closed);
      response.flushHeaders();
    });
    fixture.baseUrl = `${source.origin}/v1/videos`;
    const guardedFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (...args) => {
      const response = await guardedFetch(...args);
      caller.abort(new Error("synthetic caller closed before video response delivery"));
      return response;
    });
    expect(await invoke(method, { signal: caller.signal })).toMatchObject({ success: false, status: 499 });
    let timer;
    try { await Promise.race([disconnected, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Video response socket stayed open")), 1000); })]); }
    finally { clearTimeout(timer); }
    expect(source.requests).toHaveLength(1);
    expect(fixture.refresh).not.toHaveBeenCalled();
  });
});

describe("video auth-retry redirect boundary", () => {
  it("allows one explicit 401 resend but refuses its redirect without replaying the POST elsewhere", async () => {
    const trap = await server((_entry, response) => response.end('{"request_id":"unexpected-trap-job"}'));
    const source = await server((_entry, response, requests) => {
      if (requests.length === 1) { response.writeHead(401, { "content-type": "application/json" }); response.end('{"error":"expired"}'); }
      else { response.writeHead(308, { location: `${trap.origin}/credential-trap` }); response.end(); }
    });
    fixture.baseUrl = `${source.origin}/v1/videos`;
    const policy = Object.freeze({ strictProxy: false, connectionProxyEnabled: false });
    fixture.refresh.mockImplementation(async (_provider, _credentials, _log, snapshot, signal) => {
      expect(snapshot).toBe(policy);
      expect(signal.aborted).toBe(false);
      return { accessToken: "synthetic-refreshed-video-token" };
    });
    const commit = vi.fn();
    expect(await invoke("POST", { proxyOptions: policy, onCredentialsRefreshed: commit })).toMatchObject({ success: false, status: 502, localFailure: true });
    expect(source.requests.map(({ authorization }) => authorization)).toEqual(["Bearer synthetic-video-token", "Bearer synthetic-refreshed-video-token"]);
    expect(source.requests.map(({ body }) => body)).toEqual([rawBody, rawBody]);
    expect(trap.requests).toEqual([]);
    expect(fixture.refresh).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(fetchCalls.every(({ init }) => init.redirect === "manual")).toBe(true);
  });

  it("persists a rotated credential but never resends after caller cancellation during commit", async () => {
    const source = await server((_entry, response) => { response.writeHead(401, { "content-type": "application/json" }); response.end('{"error":"expired"}'); });
    fixture.baseUrl = `${source.origin}/v1/videos`;
    fixture.refresh.mockResolvedValue({ accessToken: "synthetic-refreshed-video-token" });
    const caller = new AbortController();
    const commit = vi.fn(async () => { caller.abort(new Error("synthetic caller closed after rotation")); });
    expect(await invoke("POST", { signal: caller.signal, onCredentialsRefreshed: commit })).toMatchObject({ success: false, status: 499 });
    expect(source.requests).toHaveLength(1);
    expect(commit).toHaveBeenCalledOnce();
    expect(fixture.refresh).toHaveBeenCalledOnce();
  });
});
