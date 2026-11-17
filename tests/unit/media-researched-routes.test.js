import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_MODELS, PROVIDER_MEDIA } from "../../open-sse/providers/index.js";
import { TTS_MODELS_CONFIG, getTtsVoicesForModel } from "../../open-sse/config/ttsModels.js";
import { handleImageGenerationCore } from "../../open-sse/handlers/imageGenerationCore.js";
import { handleEmbeddingsCore } from "../../open-sse/handlers/embeddingsCore.js";
import { getTtsAdapter, synthesizeViaConfig } from "../../open-sse/handlers/ttsProviders/index.js";

vi.mock("../../open-sse/executors/index.js", () => ({ getExecutor: () => ({ noAuth: true }) }));
vi.mock("../../open-sse/services/tokenRefresh.js", () => ({ refreshWithRetry: vi.fn() }));
const credentials = { apiKey: "offline-fixture" };
const aliases = { "jina-ai": "jina", elevenlabs: "el" };
function listed(provider, model, kind) {
  const rows = PROVIDER_MODELS[aliases[provider] || provider] || [];
  expect(rows.filter(m => m.id === model && (m.kind || m.type) === kind)).toHaveLength(1);
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); })));
afterEach(() => vi.unstubAllGlobals());
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

const embeddings = [
  ["voyage-ai", "voyage-code-4", "https://api.voyageai.com/v1/embeddings"],
  ["mistral", "codestral-embed-2505", "https://api.mistral.ai/v1/embeddings"],
  ["fireworks", "fireworks/qwen3-embedding-8b", "https://api.fireworks.ai/inference/v1/embeddings"],
  ["jina-ai", "jina-embeddings-v5-text-small", "https://api.jina.ai/v1/embeddings"],
  ["jina-ai", "jina-embeddings-v5-text-nano", "https://api.jina.ai/v1/embeddings"],
];
describe("researched media: exact IDs through existing text embedding routes", () => {
  it.each(embeddings)("%s/%s is listed once and sends the literal wire model", async (provider, model, url) => {
    listed(provider, model, "embedding");
    const upstream = { object: "list", model, data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 2, total_tokens: 2 } };
    fetch.mockResolvedValueOnce(jsonResponse(upstream));
    const result = await handleEmbeddingsCore({ modelInfo: { provider, model }, credentials, body: { input: ["sample"] } });
    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [sentUrl, init] = fetch.mock.calls[0];
    expect(sentUrl).toBe(url);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer offline-fixture");
    expect(JSON.parse(init.body)).toEqual({ model, input: ["sample"], encoding_format: "float" });
    expect(await result.response.json()).toEqual(upstream);
  });
  it.each(["sample", ["sample"]])("Gemini Embedding 2 handles scalar/batch input %j", async input => {
    const model = "gemini-embedding-2";
    listed("gemini", model, "embedding");
    const batch = Array.isArray(input);
    fetch.mockResolvedValueOnce(jsonResponse(batch ? { embeddings: [{ values: [0.1] }] } : { embedding: { values: [0.1] } }));
    const result = await handleEmbeddingsCore({ modelInfo: { provider: "gemini", model }, credentials, body: { input, dimensions: 768 } });
    expect(result.success).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${batch ? "batchEmbedContents" : "embedContent"}?key=offline-fixture`);
    const request = { model: `models/${model}`, content: { parts: [{ text: "sample" }] }, outputDimensionality: 768 };
    expect(JSON.parse(init.body)).toEqual(batch ? { requests: [request] } : request);
    expect((await result.response.json()).data).toEqual([{ object: "embedding", index: 0, embedding: [0.1] }]);
  });
});
const images = [
  ["openai", "gpt-image-2.5-flare", "https://api.openai.com/v1/images/generations"],
  ["openai", "gpt-image-2.5-sunburst", "https://api.openai.com/v1/images/generations"],
  ...["recraftv4_1_flash", "recraftv4_1", "recraftv4_1_vector", "recraftv4_1_pro", "recraftv4_1_pro_vector"].map(id => ["recraft", id, "https://external.api.recraft.ai/v1/images/generations"]),
];
describe("researched media: basic image JSON generation", () => {
  it.each(images)("%s/%s uses its proven JSON route", async (provider, model, url) => {
    listed(provider, model, "image");
    const upstream = { created: 1, data: [provider === "openai" ? { b64_json: "AAECAw==" } : { url: "https://example.invalid/offline-image.png" }] };
    fetch.mockResolvedValueOnce(jsonResponse(upstream));
    const result = await handleImageGenerationCore({ modelInfo: { provider, model }, credentials, body: { prompt: "sample" } });
    expect(result.success).toBe(true);
    const [sentUrl, init] = fetch.mock.calls[0];
    expect(sentUrl).toBe(url);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer offline-fixture");
    expect(JSON.parse(init.body)).toEqual({ model, prompt: "sample", n: 1, size: provider === "openai" ? "auto" : "1024x1024" });
    expect(await result.response.json()).toEqual(upstream);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("Gemini Flash Lite Image forwards text only and normalizes inline image data", async () => {
    const model = "gemini-3.1-flash-lite-image";
    listed("gemini", model, "image");
    fetch.mockResolvedValueOnce(jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "fixture" } }] } }] }));
    const result = await handleImageGenerationCore({ modelInfo: { provider: "gemini", model }, credentials, body: { prompt: "sample" } });
    expect(result.success).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=offline-fixture`);
    expect(JSON.parse(init.body)).toEqual({ contents: [{ parts: [{ text: "sample" }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } });
    expect((await result.response.json()).data).toEqual([{ b64_json: "fixture" }]);
  });
});
describe("researched media: TTS IDs, known-model parsing and voice tables", () => {
  it.each(["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"])("Gemini %s supports bare and model/voice invocation", async model => {
    listed("gemini", model, "tts");
    expect(TTS_MODELS_CONFIG.gemini.models.some(m => m.id === model)).toBe(true);
    expect(getTtsVoicesForModel("gemini", model).some(v => v.id === "Kore")).toBe(true);
    for (const suffix of ["", "/Puck"]) {
      fetch.mockResolvedValueOnce(jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { data: "AAECAw==" } }] } }] }));
      const audio = await getTtsAdapter("gemini").synthesize("sample", model + suffix, credentials);
      const [url, init] = fetch.mock.calls.at(-1);
      expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=offline-fixture`);
      expect(JSON.parse(init.body)).toEqual({ contents: [{ parts: [{ text: "Say: sample" }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: suffix ? "Puck" : "Kore" } } } } });
      expect(audio.format).toBe("wav");
      expect(Buffer.from(audio.base64, "base64").subarray(0, 4).toString()).toBe("RIFF");
    }
  });
  it.each(["eleven_v4", "eleven_v4_turbo"])("ElevenLabs %s requires model/voice and sends model_id", async model => {
    listed("elevenlabs", model, "tts");
    expect(PROVIDER_MEDIA.elevenlabs.ttsConfig.models.some(m => m.id === model)).toBe(true);
    expect(TTS_MODELS_CONFIG.elevenlabs.models.some(m => m.id === model)).toBe(true);
    const binary = Buffer.alloc(1024, 1);
    fetch.mockResolvedValueOnce(new Response(binary));
    const result = await getTtsAdapter("elevenlabs").synthesize("sample", `${model}/fixture-voice`, credentials);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/fixture-voice");
    expect(init.headers["xi-api-key"]).toBe("offline-fixture");
    expect(JSON.parse(init.body)).toEqual({ text: "sample", model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } });
    expect(result).toEqual({ base64: binary.toString("base64"), format: "mp3" });
  });
  it.each(["inworld-tts-2", "inworld-tts-2-flash"])("Inworld %s recognizes bare models instead of treating them as voices", async model => {
    listed("inworld", model, "tts");
    expect(PROVIDER_MEDIA.inworld.ttsConfig.models.some(m => m.id === model)).toBe(true);
    expect(TTS_MODELS_CONFIG.inworld.models.some(m => m.id === model)).toBe(true);
    for (const suffix of ["", "/Ashley"]) {
      fetch.mockResolvedValueOnce(jsonResponse({ audioContent: "offline-audio" }));
      const result = await synthesizeViaConfig("inworld", "sample", model + suffix, credentials);
      const [url, init] = fetch.mock.calls.at(-1);
      expect(url).toBe("https://api.inworld.ai/tts/v1/voice");
      expect(init.headers.Authorization).toBe("Basic offline-fixture");
      expect(JSON.parse(init.body)).toEqual({ text: "sample", modelId: model, voiceId: suffix ? "Ashley" : "Alex", audioConfig: { audioEncoding: "MP3" } });
      expect(result).toEqual({ base64: "offline-audio", format: "mp3" });
    }
  });
});
