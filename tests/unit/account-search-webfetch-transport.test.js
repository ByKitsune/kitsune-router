import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const io = vi.hoisted(() => {
  const nativeFetch = globalThis.fetch;
  const state = {
    direct: [], nativeFetch, pinnedFetch: vi.fn(), account: null,
    credentials: vi.fn(), mark: vi.fn(), clear: vi.fn(), refresh: vi.fn(),
    settings: vi.fn(), combos: vi.fn(),
  };
  state.trap = (url, init) => {
    const target = new URL(String(url));
    state.direct.push({ url: String(url), init });
    if (target.hostname === "127.0.0.1") return nativeFetch(url, init);
    throw new Error("Unexpected direct web transport egress");
  };
  globalThis.fetch = state.trap;
  return state;
});

vi.mock("undici/index.js", async original => ({
  ...await original(), fetch: (...args) => io.pinnedFetch(...args),
}));
vi.mock("node:dns", async original => {
  const actual = await original();
  const lookup = vi.fn((host, options) => {
    if (host.endsWith(".example.test") || ["r.jina.ai", "google.serper.dev"].includes(host)) {
      return Promise.resolve([{ address: "93.184.216.34", family: 4 }]);
    }
    return actual.default.promises.lookup(host, options);
  });
  return { ...actual, default: { ...actual.default, promises: { ...actual.default.promises, lookup } } };
});
vi.mock("@/lib/localDb", () => ({
  getSettings: io.settings, getCombos: io.combos, isApiKeyRequired: () => false,
}));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: io.credentials, markAccountUnavailable: io.mark,
  clearAccountError: io.clear, extractApiKey: () => null, isValidApiKey: vi.fn(),
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: io.refresh, updateProviderCredentials: vi.fn(),
}));
vi.mock("@/sse/utils/logger.js", () => ({
  request: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), maskKey: vi.fn(),
}));

import { handleSearchCore } from "open-sse/handlers/search/index.js";
import { handleChatSearch } from "open-sse/handlers/search/chatSearch.js";
import { handleFetchCore } from "open-sse/handlers/fetch/index.js";
import { handleSearch } from "@/sse/handlers/search.js";
import { handleFetch } from "@/sse/handlers/fetch.js";
import { resetRateLimiter } from "@/lib/rateLimit/v1Limiter.js";

const account = policy => ({
  connectionId: "web-routing-account", connectionName: "Synthetic fixture",
  apiKey: "synthetic-web-routing-key", providerSpecificData: policy,
});
const target = "https://public-target.example.test/article";
const policies = [{ strictProxy: true }, { proxyPoolId: "missing-pool" },
  { connectionProxyEnabled: true, connectionProxyUrl: "http://127.0.0.1:9" },
  { vercelRelayUrl: "http://127.0.0.1:9" }];

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
  io.direct.length = 0;
  io.pinnedFetch.mockReset().mockImplementation(() => { throw new Error("Unexpected pinned provider dispatch"); });
  io.account = account({ strictProxy: true });
  io.settings.mockResolvedValue({ requireApiKey: false });
  io.combos.mockResolvedValue([]);
  io.credentials.mockImplementation(async () => io.account);
  io.mark.mockResolvedValue({ shouldFallback: false });
  io.refresh.mockImplementation(async (_provider, credentials) => credentials);
  vi.stubGlobal("fetch", io.trap);
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(name, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetRateLimiter();
});

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

describe("guarded web transports fail closed for explicit account routing", () => {
  it.each(policies)("does not send dedicated-search credentials to a direct local trap: %j", async policy => {
    const requests = [];
    await withServer((request, response) => {
      requests.push(request.headers.authorization);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ results: [] }));
    }, async origin => {
      const result = await handleSearchCore({ body: { query: "fixture" },
        provider: { id: "ollama-search" }, providerConfig: { baseUrl: `${origin}/search` },
        credentials: account(policy),
      });
      expect(result.success).toBe(false);
      expect(result.localFailure).toBe(true);
      expect(result.error).toContain("[ProxyFetch]");
      expect(requests).toEqual([]);
      expect(io.direct).toEqual([]);
    });
  });

  it.each(policies)("does not dispatch guarded WebFetch with account policy: %j", async policy => {
    const result = await handleFetchCore({ url: target, provider: "jina-reader", credentials: account(policy) });
    expect(result.localFailure).toBe(true);
    expect(result.error).toContain("[ProxyFetch]");
    expect(io.pinnedFetch).not.toHaveBeenCalled();
    expect(io.direct).toEqual([]);
  });

  it.each(["search", "fetch"])("rejects %s routing before token refresh without account-health writes", async kind => {
    const body = kind === "search" ? { provider: "serper", query: "fixture" } : { provider: "jina-reader", url: target };
    const request = new Request(`http://localhost/v1/${kind}`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const response = await (kind === "search" ? handleSearch(request) : handleFetch(request));
    expect(response.status).toBe(502);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(io.credentials).toHaveBeenCalledOnce();
    expect(io.refresh).not.toHaveBeenCalled();
    expect(io.mark).not.toHaveBeenCalled();
    expect(io.clear).not.toHaveBeenCalled();
    expect(io.pinnedFetch).not.toHaveBeenCalled();
    expect(io.direct).toEqual([]);
  });
});

describe("web safety and caller cancellation", () => {
  it.each(["search", "fetch"])("does no %s work when caller cancellation already happened", async kind => {
    const controller = new AbortController();
    controller.abort(new Error("caller already left"));
    const request = new Request(`http://localhost/v1/${kind}`, { method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "search"
        ? { provider: "serper", query: "fixture" } : { provider: "jina-reader", url: target }) });
    const response = await (kind === "search" ? handleSearch(request) : handleFetch(request));
    expect(response.status).toBe(499);
    expect(io.credentials).not.toHaveBeenCalled();
    expect(io.refresh).not.toHaveBeenCalled();
    expect(io.mark).not.toHaveBeenCalled();
    expect(io.direct).toEqual([]);
  });

  it.each(["search", "fetch"])("stops a %s combo after the first local account-routing refusal", async kind => {
    io.combos.mockResolvedValue([{ name: "strict-web-combo", models: kind === "search" ? ["serper", "tavily"] : ["jina-reader", "tavily"] }]);
    const request = new Request(`http://localhost/v1/${kind}`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "search"
        ? { provider: "strict-web-combo", query: "fixture" } : { provider: "strict-web-combo", url: target }) });
    const response = await (kind === "search" ? handleSearch(request) : handleFetch(request));
    expect(response.status).toBe(502);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(io.credentials).toHaveBeenCalledOnce();
    expect(io.refresh).not.toHaveBeenCalled();
    expect(io.mark).not.toHaveBeenCalled();
    expect(io.clear).not.toHaveBeenCalled();
    expect(io.direct).toEqual([]);
    expect(io.pinnedFetch).not.toHaveBeenCalled();
  });

  it.each(["search", "fetch"])("cancels public %s response-body reading without account-health writes", async kind => {
    io.account = account({});
    let headersReady;
    const received = new Promise(resolve => { headersReady = resolve; });
    let upstream;
    await withServer((request, response) => {
      expect(request.headers.authorization || request.headers["x-api-key"]).toContain("synthetic-web-routing-key");
      upstream = response;
      response.writeHead(200, { "Content-Type": kind === "fetch" ? "text/plain" : "application/json" });
      response.write(kind === "fetch" ? "Partial content" : '{"organic":[');
      headersReady();
    }, async origin => {
      // Exercise real HTTP headers/body cancellation at the guarded Undici boundary;
      // every fixture connection is confined to this loopback trap.
      io.pinnedFetch.mockImplementation((_url, init) => io.nativeFetch(origin, { ...init, dispatcher: undefined }));
      const controller = new AbortController();
      const request = new Request(`http://localhost/v1/${kind}`, { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "search"
          ? { provider: "serper", query: "fixture" } : { provider: "jina-reader", url: target }) });
      const pending = kind === "search" ? handleSearch(request) : handleFetch(request);
      await received;
      controller.abort(new Error("caller left while reading"));
      setTimeout(() => upstream.end(kind === "fetch" ? " finish" : ']}'), 30);
      const response = await pending;
      expect(response.status).toBe(499);
      expect(response.headers.get("x-should-retry")).toBe("false");
      expect(io.credentials).toHaveBeenCalledOnce();
      expect(io.refresh).toHaveBeenCalledWith(expect.any(String), io.account, { signal: request.signal });
      expect(io.mark).not.toHaveBeenCalled();
      expect(io.clear).not.toHaveBeenCalled();
      expect(io.pinnedFetch).toHaveBeenCalledOnce();
    });
  });

  it("preserves the configured trusted SearXNG local contract without an account proxy", async () => {
    await withServer((_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ results: [{ title: "Fixture", url: "https://example.test/source", content: "Local result" }] }));
    }, async origin => {
      const result = await handleSearchCore({ body: { query: "fixture" }, provider: { id: "searxng" },
        providerConfig: { authType: "none", baseUrl: `${origin}/search` }, credentials: null });
      expect(result.success).toBe(true);
      expect(result.data.results[0]).toMatchObject({ title: "Fixture", snippet: "Local result" });
    });
  });

  it.each(["http://127.0.0.1/private", "http://169.254.169.254/latest/meta-data", "http://[::ffff:7f00:1]/private"])("retains private/metadata denial for %s", async url => {
    const result = await handleFetchCore({ url: target, provider: "ollama", providerConfig: { baseUrl: url }, credentials: account({}) });
    expect(result.success).toBe(false);
    expect(io.pinnedFetch).not.toHaveBeenCalled();
    expect(io.direct).toEqual([]);
  });

  it("keeps WebFetch native output while refusing a public-to-private redirect", async () => {
    io.pinnedFetch.mockResolvedValueOnce(new Response("Native markdown", { headers: { "Content-Type": "text/plain" } }));
    const result = await handleFetchCore({ url: target, format: "markdown", provider: "jina-reader", credentials: account({}) });
    expect(result.success).toBe(true);
    expect(result.data.content).toMatchObject({ format: "markdown", text: "Native markdown" });
    io.pinnedFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/private" } }));
    const redirected = await handleFetchCore({ url: target, provider: "jina-reader", credentials: account({}) });
    expect(redirected.success).toBe(false);
    expect(io.pinnedFetch).toHaveBeenCalledTimes(2);
    expect(io.direct).toEqual([]);
  });

  it("cancels chat-search body reading through a real account relay after headers", async () => {
    let headersReady;
    const received = new Promise(resolve => { headersReady = resolve; });
    let upstream;
    await withServer((_request, response) => {
      upstream = response;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write('{"candidates":[');
      headersReady();
    }, async origin => {
      const controller = new AbortController();
      const pending = handleChatSearch({ provider: "gemini", query: "fixture", signal: controller.signal,
        credentials: account({ strictProxy: true, vercelRelayUrl: origin }) });
      await received;
      controller.abort(new Error("caller left after headers"));
      // Let the old implementation finish too: a regression must fail promptly,
      // without relying on an indefinitely stalled test or a live provider.
      setTimeout(() => upstream.end(']}'), 30);
      expect((await pending).status).toBe(499);
    });
  });
});
