import { afterEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ adapter: null, executor: { noAuth: true } }));
vi.mock("../../open-sse/handlers/embeddingProviders/index.js", () => ({ getEmbeddingAdapter: () => core.adapter }));
vi.mock("../../open-sse/executors/index.js", () => ({ getExecutor: () => core.executor }));
vi.mock("../../open-sse/services/tokenRefresh.js", () => ({ refreshWithRetry: (work) => work() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: (url, options) => globalThis.fetch(url, options) }));

import adapter from "../../open-sse/handlers/embeddingProviders/ollamaLocal.js";
import { handleEmbeddingsCore } from "../../open-sse/handlers/embeddingsCore.js";

const creds = (baseUrl, apiKey) => ({ providerSpecificData: { baseUrl }, apiKey });

describe("Ollama Local embedding adapter", () => {
  it("declares redirect refusal as a prerequisite for registration", () => {
    expect(adapter.requestOptions).toEqual({ redirect: "error" });
  });

  it.each([
    ["http://127.0.0.1:11434", "http://127.0.0.1:11434/v1/embeddings"],
    ["http://127.0.0.1:11434/v1/", "http://127.0.0.1:11434/v1/embeddings"],
    ["https://ollama.example/prefix/v1/audio/speech", "https://ollama.example/prefix/v1/embeddings"],
    ["https://ollama.example/prefix/api/chat", "https://ollama.example/prefix/v1/embeddings"],
  ])("resolves operator-configured endpoint %s", (host, expected) => {
    expect(adapter.buildUrl("model", creds(host))).toBe(expected);
  });

  it("requires a connection and rejects ambiguous URLs", () => {
    expect(() => adapter.buildUrl("model", null)).toThrow(/connection/i);
    for (const url of ["http://user:pass@localhost/", "http://localhost/?token=secret", "file:///tmp/file", "http://localhost/#fragment"]) {
      expect(() => adapter.buildUrl("model", creds(url))).toThrow();
    }
  });

  it("only adds authorization when configured", () => {
    expect(adapter.buildHeaders(creds("http://localhost"))).toEqual({ "Content-Type": "application/json" });
    expect(adapter.buildHeaders(creds("http://localhost", "synthetic-key"))).toEqual({
      "Content-Type": "application/json", Authorization: "Bearer synthetic-key",
    });
  });

  it("preserves caller input and dimensions rather than coercing or dropping them", () => {
    const input = ["first", "second"];
    expect(adapter.buildBody("team/custom:tag", { input, encoding_format: "base64", dimensions: 0 })).toEqual({
      model: "team/custom:tag", input, encoding_format: "base64", dimensions: 0,
    });
    expect(adapter.buildBody("model", { input: "hello" })).toEqual({ model: "model", input: "hello" });
  });

  it("passes through valid data but rejects HTTP-200 JSON errors", () => {
    const result = { object: "list", model: "nomic-embed-text", data: [{ index: 0, embedding: [0.1] }], usage: { prompt_tokens: 1, total_tokens: 1 } };
    expect(adapter.normalize(result)).toBe(result);
    expect(() => adapter.normalize({ error: "model not found" })).toThrow("model not found");
    expect(() => adapter.normalize({ error: { message: "invalid dimensions" } })).toThrow("invalid dimensions");
    expect(() => adapter.normalize({})).toThrow(/invalid/i);
  });
});

describe("embedding core adapter safety", () => {
  afterEach(() => { core.executor = { noAuth: true }; vi.unstubAllGlobals(); });
  const options = (extra = {}) => ({
    body: { input: "fixture" }, modelInfo: { provider: "ollama-local", model: "nomic-embed-text" },
    credentials: creds("http://127.0.0.1:11434"), ...extra,
  });

  it("returns a 502 for a 200 JSON error without calling the success callback", async () => {
    core.adapter = adapter;
    const onRequestSuccess = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "invalid dimensions" } })));
    const result = await handleEmbeddingsCore(options({ onRequestSuccess }));
    expect(result.status).toBe(502);
    expect((await result.response.json()).error.message).toContain("invalid dimensions");
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
  });

  it("fails closed if a custom transport returns a redirect", async () => {
    core.adapter = adapter;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 307, headers: { location: "http://127.0.0.1:1/" } })));
    const result = await handleEmbeddingsCore(options());
    expect(result.status).toBe(502);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("refuses a redirect without waiting for a stalled body cancellation acknowledgment", async () => {
    core.adapter = adapter;
    let releaseCancel;
    const cancel = vi.fn(() => new Promise(resolve => { releaseCancel = resolve; }));
    const stream = new ReadableStream({ cancel });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 307, headers: { location: "http://127.0.0.1:1/" } })));
    let settled = false;
    const pending = handleEmbeddingsCore(options()).then(result => { settled = true; return result; });
    try {
      await vi.waitFor(() => expect(settled).toBe(true), { timeout: 500 });
      expect((await pending).status).toBe(502);
      expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false); expect(fetch).toHaveBeenCalledOnce();
    } finally { releaseCancel?.(); await pending; }
  });

  it("also refuses redirects after a credential refresh", async () => {
    core.adapter = adapter;
    core.executor = { noAuth: false, refreshCredentials: async () => ({ apiKey: "new-synthetic-key" }) };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "unauthorized" }, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 308, headers: { location: "http://127.0.0.1:1/" } })));
    const result = await handleEmbeddingsCore(options());
    expect(result.status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map((call) => call[1].redirect)).toEqual(["error", "error"]);
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer new-synthetic-key");
  });

  it("cancels a stalled success body after a caller abort", async () => {
    core.adapter = adapter;
    let reading;
    let cancelled = false;
    const ready = new Promise((resolve) => { reading = resolve; });
    const body = new ReadableStream({ pull() { reading(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { headers: { "Content-Type": "application/json" } })));
    const controller = new AbortController();
    const onRequestSuccess = vi.fn();
    const pending = handleEmbeddingsCore(options({ clientSignal: controller.signal, onRequestSuccess }));
    await ready;
    controller.abort(new Error("caller left"));
    expect((await pending).status).toBe(499);
    expect(cancelled).toBe(true);
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not change request options or normalize behavior for an existing adapter", async () => {
    core.adapter = { ...adapter, requestOptions: undefined, normalize: (value) => value };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ embeddings: [[0.1]] })));
    const result = await handleEmbeddingsCore(options());
    expect(result.success).toBe(true);
    expect(await result.response.json()).toEqual({ embeddings: [[0.1]] });
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("redirect");
  });

  it("does not clear account health if cancellation occurs during normalization", async () => {
    const caller = new AbortController();
    core.adapter = { ...adapter, normalize: value => { caller.abort(new Error("client left")); return value; } };
    const onRequestSuccess = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [], usage: { prompt_tokens: 3, total_tokens: 3 } })));
    const result = await handleEmbeddingsCore(options({ clientSignal: caller.signal, onRequestSuccess }));
    expect(result.status).toBe(499);
    expect(result.usage).toEqual({ prompt_tokens: 3, total_tokens: 3 });
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
