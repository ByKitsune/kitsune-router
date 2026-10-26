import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

// Keep the transport real but prohibit all non-loopback sockets, including on RED.
const transport = vi.hoisted(() => ({ nativeFetch: globalThis.fetch }));
vi.hoisted(() => {
  globalThis.fetch = (url, options) => {
    if (new URL(url).hostname !== "127.0.0.1") return Promise.reject(new Error("fixture forbids direct egress"));
    return transport.nativeFetch(url, options);
  };
  vi.stubEnv("FETCH_CONNECT_TIMEOUT_MS", "1000");
});

const state = vi.hoisted(() => ({
  credentials: null, health: [], usage: [], accept: null,
}));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("@/lib/usageDb.js", () => ({
  enqueueRequestUsage: async (entry) => { state.usage.push(entry); return state.accept?.(entry); },
}));
vi.mock("../../src/sse/services/model.js", () => ({
  getModelInfo: async () => ({ provider: "openai-compatible-fixture", model: "embedding-fixture" }),
}));
vi.mock("../../src/sse/services/auth.js", () => ({
  getProviderCredentials: async () => state.credentials,
  markAccountUnavailable: async (...args) => { state.health.push(args); return { shouldFallback: false }; },
  clearAccountError: async (...args) => { state.health.push(args); },
  extractApiKey: () => null, isValidApiKey: async () => true,
}));
vi.mock("../../src/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: async (_provider, credentials) => credentials,
  updateProviderCredentials: async () => {},
}));
// The custom embedding endpoint uses the real generic OAuth grant executor.
vi.mock("../../open-sse/executors/index.js", async () => {
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor: provider => new DefaultExecutor(provider === "openai-compatible-refresh-fixture" ? "claude" : provider) };
});

import { handleEmbeddingsCore } from "../../open-sse/handlers/embeddingsCore.js";
import { handleEmbeddings } from "../../src/sse/handlers/embeddings.js";

const servers = [];
const payload = { object: "list", data: [{ object: "embedding", index: 0, embedding: [0.25, -0.5] }],
  usage: { prompt_tokens: 3, total_tokens: 3 } };
const log = { debug() {}, info() {}, warn() {}, error() {} };
afterAll(() => { globalThis.fetch = transport.nativeFetch; });

async function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function options(providerSpecificData, extra = {}) {
  return { body: { input: "hello", dimensions: 2 },
    modelInfo: { provider: "openai-compatible-fixture", model: "embedding-fixture" },
    credentials: { apiKey: "fixture-key", connectionId: "fixture", providerSpecificData }, log, ...extra };
}

beforeEach(() => {
  state.health = [];
  state.usage = [];
  state.accept = null;
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(name, "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

describe("embeddings transport reconciliation", () => {
  it("sends embeddings through the resolved account relay with dimensions and exact usage intact", async () => {
    const requests = [];
    const relay = await listen(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      requests.push({ target: req.headers["x-relay-target"], path: req.headers["x-relay-path"], body: JSON.parse(body) });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(payload));
    });
    const result = await handleEmbeddingsCore(options({ baseUrl: "https://embedding.invalid/v1", strictProxy: true, vercelRelayUrl: relay }));
    expect(result.success, result.error).toBe(true);
    expect(await result.response.json()).toEqual(payload);
    expect(result.usage).toEqual({ prompt_tokens: 3, total_tokens: 3 });
    expect(requests).toEqual([{ target: "https://embedding.invalid", path: "/v1/embeddings",
      body: { model: "embedding-fixture", input: "hello", encoding_format: "float", dimensions: 2 } }]);
  });

  it("fails closed when a strict account has no usable proxy", async () => {
    let directCalls = 0;
    const direct = await listen((_req, res) => { directCalls++; res.end(JSON.stringify(payload)); });
    const result = await handleEmbeddingsCore(options({ baseUrl: direct, strictProxy: true }));
    expect(result.status).toBe(502);
    expect(directCalls).toBe(0);
    expect(result.error).toContain("strictProxy=true");
  });

  it("treats a plain-Error caller abort after headers as cancellation, not invalid provider JSON", async () => {
    let headersSent;
    const started = new Promise(resolve => { headersSent = resolve; });
    const direct = await listen((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.write('{"data":[');
      headersSent();
    });
    const caller = new AbortController();
    const pending = handleEmbeddingsCore(options({ baseUrl: direct }, { clientSignal: caller.signal }));
    await started;
    caller.abort(new Error("caller left"));
    const result = await pending;
    expect(result.status).toBe(499);
  });

  it("retains the existing response-body deadline when the provider sends headers but stalls JSON", async () => {
    const direct = await listen((_req, res) => {
      const text = JSON.stringify(payload);
      res.setHeader("Content-Type", "application/json");
      res.write(text.slice(0, 10));
      const timer = setTimeout(() => res.end(text.slice(10)), 1500);
      res.on("close", () => clearTimeout(timer));
    });
    const result = await handleEmbeddingsCore(options({ baseUrl: direct }));
    expect(result.status).toBe(502);
  });

  it("does not mutate account health or record success when the embeddings client cancels", async () => {
    let requestSeen;
    const started = new Promise(resolve => { requestSeen = resolve; });
    const direct = await listen((_req, _res) => { requestSeen(); });
    state.credentials = options({ baseUrl: direct }).credentials;
    const caller = new AbortController();
    const pending = handleEmbeddings(new Request("http://localhost/v1/embeddings", {
      method: "POST", signal: caller.signal,
      body: JSON.stringify({ model: "fixture/embedding", input: "hello" }),
    }));
    await started;
    caller.abort(new Error("caller left"));
    const response = await pending;
    expect(response.status).toBe(499);
    expect(state.health).toEqual([]);
    expect(state.usage).toEqual([]);
  });

  it("keeps refresh and retry on the same relay, and bounds the post-refresh connection attempt", async () => {
    const paths = [];
    const relay = await listen(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      paths.push(req.headers["x-relay-path"]);
      res.setHeader("Content-Type", "application/json");
      if (paths.length === 1) {
        res.statusCode = 401;
        res.end('{"error":{"message":"expired"}}');
      } else if (paths.length === 2) {
        res.end('{"access_token":"fresh-fixture","expires_in":3600}');
      } // retry intentionally never sends headers
    });
    const result = await handleEmbeddingsCore({
      ...options({ strictProxy: true, vercelRelayUrl: relay }),
      modelInfo: { provider: "openai-compatible-refresh-fixture", model: "embedding-fixture" },
      credentials: { accessToken: "expired-fixture", refreshToken: "refresh-fixture",
        providerSpecificData: { baseUrl: "https://embedding.invalid/v1", strictProxy: true, vercelRelayUrl: relay } },
    });
    expect(result.status).toBe(502);
    expect(result.error).toMatch(/timeout/i);
    expect(paths).toHaveLength(3);
    expect(paths).toEqual(["/v1/embeddings", "/v1/oauth/token", "/v1/embeddings"]);
  });

  it("waits for durable usage acceptance before returning a successful embedding response", async () => {
    const direct = await listen((_req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(payload)); });
    state.credentials = options({ baseUrl: direct }).credentials;
    let accept;
    state.accept = () => new Promise(resolve => { accept = resolve; });
    let settled = false;
    const pending = handleEmbeddings(new Request("http://localhost/v1/embeddings", {
      method: "POST", body: JSON.stringify({ model: "fixture/embedding", input: "hello" }),
    })).then(response => { settled = true; return response; });
    await vi.waitFor(() => expect(accept).toBeTypeOf("function"));
    expect(settled).toBe(false);
    expect(state.usage).toHaveLength(1);
    expect(state.usage[0]).toMatchObject({ eventId: expect.stringMatching(/^[0-9a-f-]{36}$/), timestamp: expect.any(String),
      tokens: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 } });
    accept({ accepted: true });
    expect(await (await pending).json()).toEqual(payload);
  });

  it("reports local acceptance failure without cooling down or retrying the upstream account", async () => {
    let requests = 0;
    const direct = await listen((_req, res) => { requests++; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(payload)); });
    state.credentials = options({ baseUrl: direct }).credentials;
    state.accept = async () => { throw new Error("private database path"); };
    const response = await handleEmbeddings(new Request("http://localhost/v1/embeddings", {
      method: "POST", body: JSON.stringify({ model: "fixture/embedding", input: "hello" }),
    }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("usage_acceptance_failed");
    expect(requests).toBe(1);
    expect(state.health.filter(args => typeof args[1] === "number")).toEqual([]);
    expect(state.usage).toHaveLength(1);
  });
});
