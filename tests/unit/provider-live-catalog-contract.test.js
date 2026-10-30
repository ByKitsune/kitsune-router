import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));
vi.mock("open-sse/config/modelCatalog.js", async importOriginal => ({
  ...await importOriginal(), MODEL_CATALOG_MAX_CACHE_ENTRIES: 2, MODEL_CATALOG_MAX_CACHE_BYTES: 1024,
}));
import { clearProviderLiveModelsCache, fetchProviderLiveModels } from "@/shared/utils/providerLiveModels.js";

beforeEach(() => { io.fetch.mockReset(); clearProviderLiveModelsCache(); });
afterEach(() => { vi.useRealTimers(); clearProviderLiveModelsCache(); });

const native = (id, extra = {}) => ({ id, type: "model", display_name: `Native ${id}`, ...extra });

describe("provider-owned live catalog contracts", () => {
  it("uses native Anthropic API authentication and typed model facts without claiming an OAuth client", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [native("new-native-model", {
      max_input_tokens: 900000, max_tokens: 64000,
      capabilities: { image_input: { supported: false }, pdf_input: { supported: true },
        thinking: { supported: true }, structured_outputs: { supported: false } },
    })], has_more: false }));
    const models = await fetchProviderLiveModels("anthropic", "synthetic-native-key", { useCache: false });
    const [url, options] = io.fetch.mock.calls[0];
    expect(new URL(url).origin + new URL(url).pathname).toBe("https://api.anthropic.com/v1/models");
    expect(options.headers["x-api-key"]).toBe("synthetic-native-key");
    expect(options.headers["anthropic-version"]).toBe("2023-06-01");
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.redirect).toBe("error");
    expect(Object.keys(options.headers).some(key => key.toLowerCase() === "user-agent")).toBe(false);
    expect(models[0]).toMatchObject({ id: "new-native-model", name: "Native new-native-model",
      capabilities: { maxInput: 900000, maxOutput: 64000, vision: false, pdf: true, reasoning: true, structuredOutput: false } });
    expect(models[0]).not.toHaveProperty("context_length");
    expect(models[0].kind || "llm").toBe("llm");
    expect(models[0]).not.toHaveProperty("type");
  });

  it("collects complete cursor pages under the same authenticated origin and deduplicates overlap", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [native("first")], has_more: true, last_id: "first" }));
    io.fetch.mockResolvedValueOnce(Response.json({ data: [native("first"), native("second")], has_more: false, last_id: "second" }));
    const models = await fetchProviderLiveModels("anthropic", "synthetic-pages");
    expect(models.map(model => model.id)).toEqual(["first", "second"]);
    expect(io.fetch).toHaveBeenCalledTimes(2);
    const next = new URL(io.fetch.mock.calls[1][0]);
    expect(next.origin).toBe("https://api.anthropic.com");
    expect(next.searchParams.get("after_id")).toBe("first");
    expect(io.fetch.mock.calls[1][1].headers["x-api-key"]).toBe("synthetic-pages");
  });

  it("rejects incomplete pagination rather than caching a partial availability list", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [native("first")], has_more: true }));
    expect(await fetchProviderLiveModels("anthropic", "synthetic-incomplete")).toBeNull();
    io.fetch.mockResolvedValueOnce(Response.json({ data: [native("complete")], has_more: false }));
    expect((await fetchProviderLiveModels("anthropic", "synthetic-incomplete"))[0].id).toBe("complete");
    expect(io.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps bearer credentials scoped to an OpenAI-style provider", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "vendor/model", capabilities: { vision: false } }] }));
    expect((await fetchProviderLiveModels("bykitsune", "synthetic-bykitsune"))[0]).toMatchObject({ id: "vendor/model", capabilities: { vision: false } });
    expect(io.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer synthetic-bykitsune");
    expect(io.fetch.mock.calls[0][1].headers["x-api-key"]).toBeUndefined();
  });

  it("separates registry-owned OAuth and API-key catalog authentication and cached results", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [native("oauth-model")], has_more: false }));
    expect((await fetchProviderLiveModels("claude", "synthetic-shared-proof", { authProfile: "oauth" }))[0].id).toBe("oauth-model");
    const oauth = io.fetch.mock.calls[0][1].headers;
    expect(oauth.Authorization).toBe("Bearer synthetic-shared-proof");
    expect(oauth["x-api-key"]).toBeUndefined();
    expect(oauth["anthropic-beta"]).toContain("oauth-2025-04-20");
    expect(oauth["User-Agent"]).toMatch(/^claude-cli\//);
    io.fetch.mockResolvedValueOnce(Response.json({ data: [native("api-key-model")], has_more: false }));
    expect((await fetchProviderLiveModels("claude", "synthetic-shared-proof"))[0].id).toBe("api-key-model");
    const keyed = io.fetch.mock.calls[1][1].headers;
    expect(keyed["x-api-key"]).toBe("synthetic-shared-proof");
    expect(keyed.Authorization).toBeUndefined();
    expect(io.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not accept an unregistered authentication profile or dispatch its credentials", async () => {
    expect(await fetchProviderLiveModels("bykitsune", "synthetic-bad-profile", { authProfile: "unregistered" })).toBeNull();
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it("reads native Gemini API-key pages without using OAuth credentials or treating input as context", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ models: [{ name: "models/gemini-catalog-next", displayName: "Native Gemini",
      inputTokenLimit: 900000, outputTokenLimit: 64000, thinking: false, supportedGenerationMethods: ["generateContent"] }],
      nextPageToken: "opaque-page-token" }));
    io.fetch.mockResolvedValueOnce(Response.json({ models: [{ name: "models/opaque-embedding", inputTokenLimit: 2048,
      supportedGenerationMethods: ["embedContent"] }] }));
    const models = await fetchProviderLiveModels("gemini", "synthetic-gemini-key");
    expect(models.map(model => model.id)).toEqual(["gemini-catalog-next", "opaque-embedding"]);
    expect(models[0]).toMatchObject({ name: "Native Gemini", kind: "llm",
      capabilities: { maxInput: 900000, maxOutput: 64000, reasoning: false } });
    expect(models[0]).not.toHaveProperty("context_length");
    expect(models[1].kind).toBe("embedding");
    const first = new URL(io.fetch.mock.calls[0][0]);
    const next = new URL(io.fetch.mock.calls[1][0]);
    expect(first.origin + first.pathname).toBe("https://generativelanguage.googleapis.com/v1beta/models");
    expect(first.searchParams.has("key")).toBe(false);
    expect(next.origin).toBe(first.origin);
    expect(next.searchParams.get("pageToken")).toBe("opaque-page-token");
    expect(io.fetch.mock.calls[0][1].headers["x-goog-api-key"]).toBe("synthetic-gemini-key");
    expect(io.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("keeps Gemini media kinds and excludes unsupported prediction/interaction-only model surfaces", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ models: [
      { name: "models/gemini-3.1-flash-lite-image", supportedGenerationMethods: ["generateContent"] },
      { name: "models/opaque-embed", supportedGenerationMethods: ["embedContent"] },
      { name: "models/imagen-predict-only", supportedGenerationMethods: ["predict"] },
      { name: "models/veo-long-running", supportedGenerationMethods: ["predictLongRunning"] },
      { name: "models/deep-research-interactions-only", supportedGenerationMethods: ["interact"] },
    ] }));
    const models = await fetchProviderLiveModels("gemini", "synthetic-gemini-kinds");
    expect(models.map(model => [model.id, model.kind])).toEqual([
      ["gemini-3.1-flash-lite-image", "image"], ["opaque-embed", "embedding"],
    ]);
  });

  it("retains Mistral's native context/tool facts while ignoring its object-type discriminator", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "opaque-mistral-native", type: "base", max_context_length: 262144,
      capabilities: { completion_chat: true, function_calling: false, vision: false, reasoning: true } }] }));
    const [model] = await fetchProviderLiveModels("mistral", "synthetic-mistral");
    expect(model).toMatchObject({ id: "opaque-mistral-native", context_length: 262144,
      capabilities: { contextWindow: 262144, tools: false, vision: false, reasoning: true } });
    expect(model).not.toHaveProperty("type");
    expect(model).not.toHaveProperty("max_completion_tokens");
  });

  it("keeps native Mistral embeddings but does not advertise unsupported audio/FIM cards as chat", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [
      { id: "mistral-embed-new", type: "base", capabilities: { completion_chat: false } },
      { id: "opaque-audio-only", type: "base", capabilities: { completion_chat: false, audio_transcription: true } },
      { id: "opaque-fim-only", type: "base", capabilities: { completion_chat: false, completion_fim: true } },
      { id: "opaque-chat", type: "base", capabilities: { completion_chat: true } },
    ] }));
    const models = await fetchProviderLiveModels("mistral", "synthetic-mistral-kinds");
    expect(models.map(model => model.id)).toEqual(["mistral-embed-new", "opaque-chat"]);
    expect(models[0].kind).toBe("embedding");
  });

  it("bounds cached provider catalogs and evicts the least recently used identity", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "old-openai" }] }));
    await fetchProviderLiveModels("openai", "synthetic-lru");
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "bykitsune" }] }));
    await fetchProviderLiveModels("bykitsune", "synthetic-lru");
    io.fetch.mockResolvedValueOnce(Response.json({ data: [native("anthropic")], has_more: false }));
    await fetchProviderLiveModels("anthropic", "synthetic-lru");
    expect((await fetchProviderLiveModels("bykitsune", "synthetic-lru"))[0].id).toBe("bykitsune");
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "fresh-openai" }] }));
    expect((await fetchProviderLiveModels("openai", "synthetic-lru"))[0].id).toBe("fresh-openai");
    expect(io.fetch).toHaveBeenCalledTimes(4);
  });

  it("does not let a returned model list mutate another request's cached facts", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "private-cache-model", capabilities: { vision: false },
      architecture: { input_modalities: ["text"] } }] }));
    const first = await fetchProviderLiveModels("bykitsune", "synthetic-cache-ownership");
    first[0].capabilities.vision = true;
    first[0].architecture.input_modalities.push("image");
    first.push({ id: "injected" });
    const second = await fetchProviderLiveModels("bykitsune", "synthetic-cache-ownership");
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ id: "private-cache-model", capabilities: { vision: false }, architecture: { input_modalities: ["text"] } });
    second[0].id = "changed";
    expect((await fetchProviderLiveModels("bykitsune", "synthetic-cache-ownership"))[0].id).toBe("private-cache-model");
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retain a catalog larger than its serialized cache budget", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "not-cached", name: "x".repeat(1500) }] }));
    expect((await fetchProviderLiveModels("openai", "synthetic-cache-size"))[0].id).toBe("not-cached");
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "fresh" }] }));
    expect((await fetchProviderLiveModels("openai", "synthetic-cache-size"))[0].id).toBe("fresh");
    expect(io.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not include private upstream JSON or invalid UTF-8 in propagated parser errors", async () => {
    io.fetch.mockResolvedValueOnce(new Response("private-upstream-account-token not-json"));
    await expect(fetchProviderLiveModels("openai", "synthetic-parse", { proxyOptions: { strictProxy: true } }))
      .rejects.toThrow(/^Invalid model catalog JSON$/);
    io.fetch.mockResolvedValueOnce(new Response(new Uint8Array([0x7b, 0xff, 0x7d])));
    await expect(fetchProviderLiveModels("openai", "synthetic-utf8", { proxyOptions: { strictProxy: true } }))
      .rejects.toThrow(/^Invalid model catalog UTF-8$/);
  });

  it("keeps the deadline active while catalog response bytes are stalled", async () => {
    vi.useFakeTimers();
    let stream;
    const cancelled = vi.fn();
    io.fetch.mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { stream = controller; }, cancel: cancelled })));
    let value = "pending";
    const pending = fetchProviderLiveModels("openai", "synthetic-stalled").then(result => { value = result; });
    await vi.advanceTimersByTimeAsync(5001);
    try {
      expect(value).toBeNull();
      expect(cancelled).toHaveBeenCalled();
    } finally {
      try { stream.close(); } catch {}
      await pending;
    }
  });

  it("rejects an oversized body before exposing or caching its model rows", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "too-large" }], padding: "x".repeat(8 * 1024 * 1024) }));
    expect(await fetchProviderLiveModels("openai", "synthetic-large")).toBeNull();
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "bounded" }] }));
    expect((await fetchProviderLiveModels("openai", "synthetic-large"))[0].id).toBe("bounded");
    expect(io.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not publish fractional or unsafe token ceilings from live metadata", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "invalid-limits", context_length: 1.5,
      max_input_tokens: Number.MAX_SAFE_INTEGER + 1, max_output_tokens: "100.5", capabilities: { maxOutput: -1 } }] }));
    const [model] = await fetchProviderLiveModels("openai", "synthetic-invalid-limits");
    for (const field of ["context_length", "max_input_tokens", "max_completion_tokens"]) expect(model).not.toHaveProperty(field);
    for (const field of ["contextWindow", "maxInput", "maxOutput"]) expect(model.capabilities || {}).not.toHaveProperty(field);
  });
});
