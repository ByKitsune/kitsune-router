import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ credentials: null, health: [], coreCalls: [], proxyOptions: [], combo: null }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (url, options, proxy) => { state.proxyOptions.push(proxy); return globalThis.fetch(url, options); },
}));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("@/lib/rateLimit/inferenceLimit.js", () => ({ withInferenceLimit: async (_req, _key, run) => run() }));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: () => null,
  isValidApiKey: async () => true,
  getProviderCredentials: async (_provider, excluded) => excluded.size ? null : state.credentials,
  markAccountUnavailable: async (...args) => { state.health.push(args); return { shouldFallback: false }; },
}));
vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: async (value) => {
    const i = value.indexOf("/");
    return { provider: value.slice(0, i), model: value.slice(i + 1) };
  },
  getComboModels: async () => state.combo,
}));
vi.mock("open-sse/handlers/ttsCore.js", () => ({
  handleTtsCore: async (options) => {
    state.coreCalls.push(options);
    return { success: true, response: new Response("other-adapter") };
  },
}));

import ollamaTts, { ollamaLocalEndpoint } from "../../open-sse/handlers/ttsProviders/ollamaLocal.js";
import { getTtsAdapter } from "../../open-sse/handlers/ttsProviders/index.js";
import registry from "../../open-sse/providers/registry/ollama-local.js";
import { getTtsVoicesForModel } from "../../open-sse/config/ttsModels.js";
import { handleTts } from "../../src/sse/handlers/tts.js";
import { POST as speechRoute } from "../../src/app/api/v1/audio/speech/route.js";

const realFetch = globalThis.fetch;
const bytes = Uint8Array.from([0, 255, 1, 2, 3, 128]);
const audio = (type = "audio/wav") => new Response(bytes, { headers: { "Content-Type": type } });
const credentials = (baseUrl = "http://127.0.0.1:11434") => ({
  connectionId: "fixture", apiKey: "synthetic-key", providerSpecificData: { baseUrl },
});
const request = (body, { signal, query = "" } = {}) => new Request(`http://localhost/v1/audio/speech${query}`, {
  method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const readError = async (response) => (await response.json()).error.message;

beforeEach(() => {
  state.credentials = credentials();
  state.health = [];
  state.coreCalls = [];
  state.proxyOptions = [];
  state.combo = null;
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("Ollama Local TTS", () => {
  it("registers the modality without changing the chat transport or pricing", () => {
    expect(registry.serviceKinds).toEqual(["llm", "tts", "embedding"]);
    expect(registry.transport.baseUrl).toBe("http://localhost:11434/api/chat");
    expect(registry.ttsConfig.authType).toBe("optional");
    expect(registry).not.toHaveProperty("models");
    expect(registry.ttsConfig.models.find((m) => m.id === "phonon")).toMatchObject({ type: "tts" });
    expect(getTtsVoicesForModel("ollama-local", "phonon").map((v) => v.id)).toContain("Zoey");
    expect(getTtsAdapter("ollama-local")).toBe(ollamaTts);
    expect(getTtsAdapter("openai")).not.toBe(ollamaTts);
    expect(registry).not.toHaveProperty("pricing");
  });

  it.each([
    ["http://127.0.0.1:11434", "http://127.0.0.1:11434/v1/audio/speech"],
    ["http://127.0.0.1:11434/v1/", "http://127.0.0.1:11434/v1/audio/speech"],
    ["https://ollama.example/proxy/v1/embeddings", "https://ollama.example/proxy/v1/audio/speech"],
    ["https://ollama.example/proxy/api/chat", "https://ollama.example/proxy/v1/audio/speech"],
    ["https://ollama.example/proxy/v1/audio/speech", "https://ollama.example/proxy/v1/audio/speech"],
  ])("resolves configured endpoint %s", (host, expected) => {
    expect(ollamaLocalEndpoint(credentials(host))).toBe(expected);
  });

  it.each([
    "file:///etc/passwd", "http://u:p@127.0.0.1:11434", "http://127.0.0.1:11434/?secret=x",
    "http://127.0.0.1:11434/#fragment", "http://safe.example\\@evil.example", "not a url",
  ])("rejects unsafe or ambiguous endpoint %s without fetching", async (host) => {
    const result = await ollamaTts.synthesize("hello", "phonon", credentials(host), "wav");
    expect(result.status).toBe(400);
    expect(result.localFailure).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("routes with the stored endpoint, standard voice, caller format and exact audio bytes", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audio("application/octet-stream"));
    const response = await handleTts(request({
      model: "ollama-local/phonon:en", input: "  Hello.  ", voice: "Zoey", response_format: "pcm", speed: 1.2,
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/pcm");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://127.0.0.1:11434/v1/audio/speech");
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toBe("Bearer synthetic-key");
    expect(JSON.parse(init.body)).toEqual({ model: "phonon:en", input: "  Hello.  ", voice: "Zoey", response_format: "pcm", speed: 1.2 });
  });

  it("preserves slash-containing unknown model IDs and honors explicit voices", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audio());
    const response = await handleTts(request({ model: "ollama-local/my-team/custom:tag", voice: "Custom", input: "hello" }));
    expect(response.status).toBe(200);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1].body)).toMatchObject({ model: "my-team/custom:tag", voice: "Custom", response_format: "wav" });
  });

  it("does not confuse a known model name used as a namespace with a legacy voice route", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audio());
    const response = await handleTts(request({ model: "ollama-local/phonon/custom:tag", voice: "Zoey", input: "hello" }));
    expect(response.status).toBe(200);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1].body)).toMatchObject({ model: "phonon/custom:tag", voice: "Zoey" });
  });

  it("supports dashboard model/voice routes and JSON audio without changing bytes", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audio());
    const response = await handleTts(request({ model: "ollama-local/phonon/Easton", input: "hello" }, { query: "?response_format=json" }));
    const data = await response.json();
    expect(data.format).toBe("wav");
    expect(Buffer.from(data.audio, "base64")).toEqual(Buffer.from(bytes));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1].body)).toMatchObject({ model: "phonon", voice: "Easton", response_format: "wav" });
  });

  it.each(["wav", "pcm", "json"])("serves %s from the public speech route", async (format) => {
    vi.mocked(fetch).mockResolvedValueOnce(audio(format === "pcm" ? "audio/pcm" : "audio/wav"));
    const response = await speechRoute(request({ model: "ollama-local/phonon", input: "hello" }, { query: `?response_format=${format}` }));
    expect(response.status).toBe(200);
    if (format === "json") {
      const result = await response.json();
      expect(result.format).toBe("wav");
      expect(Buffer.from(result.audio, "base64")).toEqual(Buffer.from(bytes));
    } else {
      expect(response.headers.get("content-type")).toBe(`audio/${format}`);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    }
  });

  it("passes configured proxy policy through to the shared transport", async () => {
    Object.assign(state.credentials.providerSpecificData, {
      connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.invalid:9000",
      connectionNoProxy: "127.0.0.1", strictProxy: true,
    });
    vi.mocked(fetch).mockResolvedValueOnce(audio());
    const response = await handleTts(request({ model: "ollama-local/phonon", input: "hello" }));
    expect(response.status).toBe(200);
    expect(state.proxyOptions[0]).toMatchObject({
      connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.invalid:9000",
      connectionNoProxy: "127.0.0.1", strictProxy: true,
    });
  });

  it("refuses relay configurations that cannot enforce upstream redirect policy", async () => {
    state.credentials.providerSpecificData.vercelRelayUrl = "http://127.0.0.1:12345/relay";
    const response = await speechRoute(request({ model: "ollama-local/phonon", input: "hello" }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(state.health).toEqual([]);
  });

  it("requires an active connection and never silently dials localhost", async () => {
    state.credentials = null;
    const response = await handleTts(request({ model: "ollama-local/phonon", input: "hello" }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    const direct = await ollamaTts.synthesize("hello", "phonon", null, "wav");
    expect(direct.localFailure).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an unsupported explicit format without dialing or changing account health", async () => {
    const response = await speechRoute(request({ model: "ollama-local/phonon", input: "hello", response_format: "mp3" }));
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatch(/unsupported response_format.*wav, pcm or json/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(state.health).toEqual([]);
  });

  it.each([
    [404, { error: "model 'phonon' not found" }, "model 'phonon' not found"],
    [400, { error: { message: "voice not found" } }, "voice not found"],
  ])("preserves upstream %s JSON errors without model or voice retries", async (status, error, message) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(error, { status }));
    const response = await handleTts(request({ model: "ollama-local/phonon", voice: "Zoey", input: "hello" }));
    expect(response.status).toBe(status);
    expect(await readError(response)).toContain(message);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not present a successful HTTP JSON error as audio", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "model missing" }));
    const response = await handleTts(request({ model: "ollama-local/phonon", input: "hello" }));
    expect(response.status).toBe(502);
    expect(await readError(response)).toContain("model missing");
  });

  it.each([200, 400])("preserves a typed voice validation error from HTTP %s without changing account health", async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: {
      message: "Voice must be specified", code: "invalid_parameter", type: "invalid_request_error", param: "voice",
    } }, { status }));
    const response = await speechRoute(request({ model: "ollama-local/phonon", input: "hello" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ message: "Voice must be specified", code: "invalid_parameter", param: "voice" });
    expect(state.health).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not mistake JSON-looking PCM bytes for an error", async () => {
    const pcm = Buffer.from('{"error":"not found"}');
    vi.mocked(fetch).mockResolvedValueOnce(new Response(pcm, { headers: { "Content-Type": "application/octet-stream" } }));
    const response = await handleTts(request({ model: "ollama-local/phonon", input: "hello", response_format: "pcm" }));
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pcm);
  });

  it("honors query format precedence when the body also specifies a format", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audio("audio/pcm"));
    const response = await handleTts(request({ model: "ollama-local/phonon", input: "hello", response_format: "wav" }, { query: "?response_format=pcm" }));
    expect(response.headers.get("content-type")).toBe("audio/pcm");
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1].body).response_format).toBe("pcm");
  });

  it("does not relabel audio from a different format", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audio("audio/mpeg"));
    const response = await handleTts(request({ model: "ollama-local/phonon", input: "hello", response_format: "wav" }));
    expect(response.status).toBe(502);
  });

  it("stops an in-flight request on caller abort even with an ordinary Error reason", async () => {
    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      started();
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    }));
    const controller = new AbortController();
    const pending = handleTts(request({ model: "ollama-local/phonon", input: "hello" }, { signal: controller.signal }));
    await ready;
    controller.abort(new Error("caller left"));
    expect((await pending).status).toBe(499);
    expect(fetch).toHaveBeenCalledOnce();
    expect(state.health).toEqual([]);
  });

  it("does not start another combo model after caller cancellation", async () => {
    state.combo = ["ollama-local/phonon", "openai/tts-1/alloy"];
    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      started();
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    }));
    const controller = new AbortController();
    const pending = handleTts(request({ model: "combo-name", input: "hello" }, { signal: controller.signal }));
    await ready;
    controller.abort(new Error("caller left"));
    expect((await pending).status).toBe(499);
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetch).toHaveBeenCalledOnce();
    expect(state.coreCalls).toEqual([]);
    expect(state.health).toEqual([]);
  });

  it("cancels a stalled audio body on caller abort", async () => {
    let reading;
    let cancelled = false;
    const ready = new Promise((resolve) => { reading = resolve; });
    const stream = new ReadableStream({ pull() { reading(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "audio/wav" } }));
    const controller = new AbortController();
    const pending = handleTts(request({ model: "ollama-local/phonon", input: "hello" }, { signal: controller.signal }));
    await ready;
    controller.abort(new Error("caller left"));
    expect((await pending).status).toBe(499);
    expect(cancelled).toBe(true);
    expect(state.health).toEqual([]);
  });

  it.each(["audio/wav", "application/json"])("returns promptly on caller abort when %s cancellation never acknowledges", async (contentType) => {
    let reading, releaseCancel;
    const ready = new Promise(resolve => { reading = resolve; });
    const cancel = vi.fn(() => new Promise(resolve => { releaseCancel = resolve; }));
    const stream = new ReadableStream({ pull() { reading(); }, cancel }, { highWaterMark: 0 });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": contentType } }));
    const controller = new AbortController();
    const pending = handleTts(request({ model: "ollama-local/phonon", input: "hello" }, { signal: controller.signal }));
    await ready;
    controller.abort(new Error("caller left"));
    try {
      const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 500))]);
      expect(result?.status).toBe(499);
      expect(cancel).toHaveBeenCalledOnce();
      expect(stream.locked).toBe(false);
      expect(state.health).toEqual([]);
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      releaseCancel?.();
      await pending;
    }
  });

  it("rejects an unexpected audio format without waiting for body cancellation acknowledgment", async () => {
    let releaseCancel;
    const cancel = vi.fn(() => new Promise(resolve => { releaseCancel = resolve; }));
    const stream = new ReadableStream({ cancel });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "audio/mpeg" } }));
    const pending = ollamaTts.synthesize("hello", "phonon", state.credentials, "wav");
    try {
      const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 500))]);
      expect(result?.status).toBe(502);
      expect(cancel).toHaveBeenCalledOnce();
      expect(stream.locked).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      releaseCancel?.();
      await pending;
    }
  });

  it("returns cancellation when the caller aborts before a response with a stalled body arrives", async () => {
    let resolveFetch, releaseCancel;
    const started = new Promise(resolve => {
      vi.mocked(fetch).mockImplementationOnce(() => new Promise(done => { resolveFetch = done; resolve(); }));
    });
    const controller = new AbortController();
    const pending = handleTts(request({ model: "ollama-local/phonon", input: "hello" }, { signal: controller.signal }));
    await started;
    const cancel = vi.fn(() => new Promise(resolve => { releaseCancel = resolve; }));
    const stream = new ReadableStream({ cancel });
    controller.abort(new Error("caller left"));
    resolveFetch(new Response(stream, { headers: { "Content-Type": "audio/wav" } }));
    try {
      const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 500))]);
      expect(result?.status).toBe(499);
      expect(cancel).toHaveBeenCalledOnce();
      expect(stream.locked).toBe(false);
      expect(state.health).toEqual([]);
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      releaseCancel?.();
      await pending;
    }
  });

  it("returns the upstream timeout when error-body cancellation never acknowledges", async () => {
    let reading, releaseCancel;
    const ready = new Promise(resolve => { reading = resolve; });
    const cancel = vi.fn(() => new Promise(resolve => { releaseCancel = resolve; }));
    const stream = new ReadableStream({ pull() { reading(); }, cancel }, { highWaterMark: 0 });
    const deadline = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(deadline.signal);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 503, headers: { "Content-Type": "application/json" } }));
    const pending = ollamaTts.synthesize("hello", "phonon", state.credentials, "wav");
    await ready;
    deadline.abort(new Error("deadline"));
    try {
      const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 500))]);
      expect(result?.status).toBe(502);
      expect(result?.error).toContain("timed out");
      expect(cancel).toHaveBeenCalledOnce();
      expect(stream.locked).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      releaseCancel?.();
      timeoutSpy.mockRestore();
      await pending;
    }
  });

  it("caps error diagnostics without waiting for upstream cancellation acknowledgment", async () => {
    let releaseCancel;
    const cancel = vi.fn(() => new Promise(resolve => { releaseCancel = resolve; }));
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(10_000).fill(120)); }, cancel });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 502, headers: { "Content-Type": "text/plain" } }));
    const pending = ollamaTts.synthesize("hello", "phonon", state.credentials, "wav");
    try {
      const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 500))]);
      expect(result?.status).toBe(502);
      expect(cancel).toHaveBeenCalledOnce();
      expect(stream.locked).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      releaseCancel?.();
      await pending;
    }
  });

  it("preserves typed voice validation and account health when an error body fails after its diagnostic", async () => {
    let sent = false;
    const bytes = new TextEncoder().encode(JSON.stringify({ error: {
      message: "Voice must be specified", code: "invalid_parameter", type: "invalid_request_error", param: "voice",
    } }));
    const stream = new ReadableStream({
      pull(controller) {
        if (!sent) { sent = true; controller.enqueue(bytes); }
        else controller.error(new Error("synthetic stream failure"));
      },
    }, { highWaterMark: 0 });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 400, headers: { "Content-Type": "application/json" } }));
    const response = await speechRoute(request({ model: "ollama-local/phonon", input: "hello" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ message: "Voice must be specified", code: "invalid_parameter", param: "voice" });
    expect(state.health).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([400, 429])("preserves HTTP %s and retry metadata when an error body fails before its first byte", async (status) => {
    const stream = new ReadableStream({ pull(controller) { controller.error(new Error("synthetic stream failure")); } }, { highWaterMark: 0 });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status, headers: {
      "Content-Type": "application/json", "Retry-After": "120", "X-Request-Id": "synthetic-request-id",
    } }));
    const result = await ollamaTts.synthesize("hello", "phonon", state.credentials, "wav");
    expect(result.status).toBe(status);
    expect(result.diagnostics.request_id).toBe("synthetic-request-id");
    if (status === 429) {
      expect(Number(result.response.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(result.resetsAtMs).toBeGreaterThan(Date.now());
    }
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["wav", "pcm", "json"])("never returns interrupted %s audio as a successful partial response", async (format) => {
    let sent = false;
    const stream = new ReadableStream({
      pull(controller) {
        if (!sent) { sent = true; controller.enqueue(Uint8Array.from([1, 2, 3])); }
        else controller.error(new Error("synthetic audio interruption"));
      },
    }, { highWaterMark: 0 });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { headers: {
      "Content-Type": format === "pcm" ? "audio/pcm" : "audio/wav",
    } }));
    const result = await ollamaTts.synthesize("hello", "phonon", state.credentials, format);
    expect(result.status).toBe(502);
    expect(result.success).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("leaves other adapter dispatch and format defaults unchanged", async () => {
    const response = await handleTts(request({ model: "openai/tts-1/alloy", input: "hello", response_format: "wav" }));
    expect(response.status).toBe(200);
    expect(state.coreCalls).toHaveLength(1);
    expect(state.coreCalls[0]).toMatchObject({ provider: "openai", model: "tts-1/alloy", responseFormat: "mp3" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("works through the existing TTS core result contract for explicit wav requests", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audio());
    const { handleTtsCore } = await vi.importActual("../../open-sse/handlers/ttsCore.js");
    const result = await handleTtsCore({ provider: "ollama-local", model: "phonon", input: "hello", credentials: state.credentials, responseFormat: "wav" });
    expect(result.success).toBe(true);
    expect(new Uint8Array(await result.response.arrayBuffer())).toEqual(bytes);
  });
});

it("refuses a real loopback 307 redirect rather than forwarding text or credentials", async () => {
  let forwarded = 0;
  const sink = createServer((_req, res) => { forwarded++; res.end(); });
  const redirect = createServer((_req, res) => {
    res.writeHead(307, { Location: `http://127.0.0.1:${sink.address().port}/receive` });
    res.end();
  });
  await new Promise((resolve) => sink.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => redirect.listen(0, "127.0.0.1", resolve));
  try {
    vi.stubGlobal("fetch", realFetch);
    const result = await ollamaTts.synthesize("private fixture", "phonon", credentials(`http://127.0.0.1:${redirect.address().port}`), "wav");
    expect(result.status).toBe(502);
    expect(forwarded).toBe(0);
  } finally {
    redirect.closeAllConnections();
    sink.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => redirect.close(resolve)),
      new Promise((resolve) => sink.close(resolve)),
    ]);
  }
});
