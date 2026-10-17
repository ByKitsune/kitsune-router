import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ rows: [], aliases: {}, nodes: [], combos: {}, settings: {}, sent: [], remoteImages: new Map() }));

vi.mock("../../src/lib/db/repos/aliasRepo.js", () => ({ getCustomModels: async () => fixture.rows }));
vi.mock("@/lib/localDb", () => ({
  getModelAliases: async () => fixture.aliases,
  getComboByName: async (name) => fixture.combos[name] || null,
  getProviderNodes: async ({ type } = {}) => fixture.nodes.filter((node) => !type || node.type === type),
  getSettings: async () => fixture.settings,
  isApiKeyRequired: () => false,
}));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
}));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: async () => ({
    logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
    logOpenAIRequest: vi.fn(), logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
  }),
}));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("../../open-sse/executors/index.js", async () => {
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor: (provider) => new DefaultExecutor(provider) };
});
vi.mock("../../open-sse/translator/concerns/image.js", async (original) => ({
  ...await original(),
  fetchImageAsBase64: async (url) => fixture.remoteImages.get(url) ?? null,
}));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: async (provider) => ({
    connectionId: `fixture-${provider}`, apiKey: "offline-vision-fixture",
    providerSpecificData: { baseUrl: "https://gateway.example.invalid/v1" },
  }),
  markAccountUnavailable: vi.fn(), clearAccountError: vi.fn(), extractApiKey: () => null, isValidApiKey: async () => true,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: async (_provider, credentials) => credentials, updateProviderCredentials: vi.fn(),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("@/sse/services/antigravityQuota.js", () => ({ handleAntigravityQuotaError: vi.fn(), clearAntigravityStrikes: vi.fn() }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), maskKey: () => "fixture",
  tagForSession: () => "fixture", nextTag: () => "fixture", line: vi.fn(), errorLine: vi.fn(), fmtThink: () => null,
}));
vi.mock("@/lib/headroom/detect", () => ({ DEFAULT_HEADROOM_URL: "http://localhost:1" }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent: vi.fn() }));
vi.mock("@/lib/rateLimit/v1Limiter.js", () => ({
  consume: () => ({ allowed: true }), rateLimitKey: () => "fixture", rateLimitHeaders: () => ({}), rateLimitedResponse: vi.fn(),
}));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { handleResponsesCore } from "../../open-sse/handlers/responsesHandler.js";
import { handleChat } from "../../src/sse/handlers/chat.js";
import { getModelInfo } from "../../src/sse/services/model.js";
import { MODEL_CAPABILITIES, PROVIDER_CAPABILITIES, setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { invalidateDeclaredModelCaps } from "../../open-sse/providers/declaredCaps.js";
import { handleComboChat, stripMultimodalContent } from "../../open-sse/services/combo.js";
import { stripUnsupportedModalities } from "../../open-sse/translator/concerns/modality.js";
import { prefetchRemoteImages } from "../../open-sse/translator/concerns/prefetch.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const PROVIDER = "openai-compatible-vision-fixture";
const IMAGE_DATA = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const IMAGE_URL = `data:image/png;base64,${IMAGE_DATA}`;
const REMOTE_URL = "https://images.example.invalid/screenshot.png";
const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
const noVision = { vision: false, pdf: true, audioInput: true, videoInput: true };
const openAIImage = () => ({ type: "image_url", image_url: { url: IMAGE_URL, detail: "high" } });
const claudeImage = () => ({ type: "image", source: { type: "base64", media_type: "image/png", data: IMAGE_DATA } });
const geminiImage = () => ({ inlineData: { mimeType: "image/png", data: IMAGE_DATA } });
const imageBody = () => ({ messages: [{ role: "user", content: [{ type: "text", text: "Read the screenshot." }, openAIImage()] }] });
const wire = (value) => JSON.parse(JSON.stringify(value));

async function dispatch(body, { provider = PROVIDER, model = "opaque", modelStr, sourceFormat = FORMATS.OPENAI, headers = {} } = {}) {
  const modelInfo = modelStr ? await getModelInfo(modelStr) : { provider, model };
  const result = await handleChatCore({
    body: { stream: false, ...body }, modelInfo, sourceFormatOverride: sourceFormat,
    credentials: { apiKey: "offline-vision-fixture", providerSpecificData: { baseUrl: "https://gateway.example.invalid/v1" } },
    clientRawRequest: { endpoint: "/v1/chat/completions", body, headers },
    connectionId: "vision-routing-fixture", log,
  });
  expect(result.success).toBe(true);
  return { result, ...fixture.sent.at(-1) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.rows = [];
  fixture.aliases = {};
  fixture.nodes = [];
  fixture.combos = {};
  fixture.settings = {};
  fixture.sent = [];
  fixture.remoteImages.clear();
  invalidateDeclaredModelCaps();
  setCatalogSource(null);
  proxyAwareFetch.mockImplementation(async (url, init) => {
    fixture.sent.push({ url, body: JSON.parse(init.body) });
    if (url.endsWith("/messages")) return Response.json({
      id: "msg_vision_fixture", type: "message", role: "assistant", model: "fixture",
      content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
    });
    if (url.includes(":generateContent")) return Response.json({
      candidates: [{ content: { role: "model", parts: [{ text: "ok" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    });
    return Response.json({
      id: "chatcmpl-vision-fixture", object: "chat.completion", model: "fixture",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  });
});

afterEach(() => {
  setCatalogSource(null);
  invalidateDeclaredModelCaps();
  delete PROVIDER_CAPABILITIES[PROVIDER];
  delete MODEL_CAPABILITIES["fixture-native-model"];
  delete MODEL_CAPABILITIES["vendor/fixture-native-model"];
});

describe("vision capability resolution at the serialized upstream boundary", () => {
  it.each([undefined, { reasoning: true }])("honors custom imageToText kind without requiring a duplicate vision checkbox (%j)", async (caps) => {
    fixture.rows = [{ providerAlias: PROVIDER, id: "opaque", type: "imageToText", ...(caps ? { caps } : {}) }];
    const { body } = await dispatch(imageBody());
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Read the screenshot." },
      { type: "image_url", image_url: { url: IMAGE_URL, detail: "high" } },
    ]);
  });

  it("keeps an explicit custom false above the imageToText kind floor", async () => {
    fixture.rows = [{ providerAlias: PROVIDER, id: "opaque", type: "imageToText", caps: { vision: false } }];
    const { body } = await dispatch(imageBody());
    expect(JSON.stringify(body)).not.toContain(IMAGE_DATA);
    expect(JSON.stringify(body.messages[0].content)).toContain("Read the screenshot.");
  });

  it("resolves an alias while preserving the full native model namespace and provider-scoped declaration", async () => {
    fixture.aliases = { screenshot: "nvidia/vendor/shared" };
    fixture.rows = [
      { providerAlias: "nvidia", id: "vendor/shared", caps: { vision: true } },
      { providerAlias: "nvidia", id: "other/shared", caps: { vision: false } },
      { providerAlias: PROVIDER, id: "vendor/shared", caps: { vision: false } },
    ];
    const { body } = await dispatch(imageBody(), { modelStr: "screenshot" });
    expect(body.model).toBe("vendor/shared");
    expect(body.messages[0].content[1]).toEqual(openAIImage());
  });

  it("matches custom-node prefixes without leaking another provider's same-name override", async () => {
    fixture.nodes = [{ id: PROVIDER, prefix: "localvision", type: "openai-compatible" }];
    fixture.rows = [{ providerAlias: "nvidia", id: "vendor/shared", caps: { vision: true } }];
    const { body } = await dispatch(imageBody(), { modelStr: "localvision/vendor/shared" });
    expect(body.model).toBe("vendor/shared");
    expect(JSON.stringify(body)).not.toContain(IMAGE_DATA);
  });

  it("uses route-scoped catalog support to fill a missing exact-alias vision fact", async () => {
    setCatalogSource({
      getModalities: (provider, model) => provider === PROVIDER && model === "coder-model" ? { vision: true } : null,
      getLimits: () => null,
    });
    const { body } = await dispatch(imageBody(), { model: "coder-model" });
    expect(body.messages[0].content[1]).toEqual(openAIImage());
  });

  it("fills a missing provider-table vision fact only from that exact route's catalog metadata", async () => {
    PROVIDER_CAPABILITIES[PROVIDER] = { opaque: { tools: true } };
    setCatalogSource({
      getModalities: (provider, model) => provider === PROVIDER && model === "opaque" ? { vision: true } : null,
      getLimits: () => null,
    });
    const { body } = await dispatch(imageBody());
    expect(body.messages[0].content[1]).toEqual(openAIImage());
  });

  it("keeps an explicit provider-table false above positive catalog metadata", async () => {
    PROVIDER_CAPABILITIES[PROVIDER] = { opaque: { vision: false } };
    setCatalogSource({ getModalities: () => ({ vision: true }), getLimits: () => null });
    const { body } = await dispatch(imageBody());
    expect(JSON.stringify(body)).not.toContain(IMAGE_DATA);
  });

  it("keeps an explicit handwritten exact false above positive catalog metadata", async () => {
    MODEL_CAPABILITIES["fixture-native-model"] = { vision: false };
    setCatalogSource({ getModalities: () => ({ vision: true }), getLimits: () => null });
    const { body } = await dispatch(imageBody(), { model: "fixture-native-model" });
    expect(JSON.stringify(body)).not.toContain(IMAGE_DATA);
  });

  it("prefers a full literal exact model entry over a same-basename capability entry", async () => {
    MODEL_CAPABILITIES["fixture-native-model"] = { vision: false };
    MODEL_CAPABILITIES["vendor/fixture-native-model"] = { vision: true };
    const { body } = await dispatch(imageBody(), { model: "vendor/fixture-native-model" });
    expect(body.model).toBe("vendor/fixture-native-model");
    expect(body.messages[0].content[1]).toEqual(openAIImage());
  });

  it("does not turn a provider catalog's explicit false back on from a vision-looking name", async () => {
    setCatalogSource({
      getModalities: (provider, model) => provider === PROVIDER && model === "opaque-vision-model" ? { vision: false } : null,
      getLimits: () => null,
    });
    const { body } = await dispatch(imageBody(), { model: "opaque-vision-model" });
    expect(JSON.stringify(body)).not.toContain(IMAGE_DATA);
  });

  it("does not treat missing catalog metadata as an explicit negative", async () => {
    setCatalogSource({ getModalities: () => ({}), getLimits: () => null });
    const { body } = await dispatch(imageBody(), { model: "opaque-vision-model" });
    expect(body.messages[0].content[1]).toEqual(openAIImage());
  });

  it("does not apply positive catalog metadata to a different provider", async () => {
    setCatalogSource({
      getModalities: (provider) => provider === "another-gateway" ? { vision: true } : null,
      getLimits: () => null,
    });
    const { body } = await dispatch(imageBody());
    expect(JSON.stringify(body)).not.toContain(IMAGE_DATA);
  });

  it("keeps images on a native Claude passthrough even when the model name is unknown", async () => {
    const { body } = await dispatch({
      max_tokens: 32, messages: [{ role: "user", content: [{ type: "text", text: "Read the screenshot." }, claudeImage()] }],
    }, { provider: "anthropic-compatible-vision-fixture", sourceFormat: FORMATS.CLAUDE, headers: { "user-agent": "claude-cli/fixture" } });
    expect(body.messages[0].content.find((block) => block.type === "image")).toMatchObject(claudeImage());
  });

  it("preserves historical and current typed images once each on a capable route after a summary", async () => {
    const source = { messages: [
      { role: "system", content: "Earlier conversation summary: the user is inspecting a page." },
      { role: "user", content: [{ type: "text", text: "Old screenshot." }, openAIImage()] },
      { role: "assistant", content: "I see the page." },
      { role: "user", content: [{ type: "text", text: "Compare with the new screenshot." }, openAIImage()] },
    ] };
    const { body } = await dispatch(source, { model: "gpt-4o" });
    expect(body.messages[1].content).toEqual([{ type: "text", text: "Old screenshot." }, openAIImage()]);
    expect(body.messages[3].content).toEqual([{ type: "text", text: "Compare with the new screenshot." }, openAIImage()]);
    expect(JSON.stringify(body).split(IMAGE_DATA)).toHaveLength(3);
  });
});

describe("capability stripping descends into typed tool-result payloads", () => {
  it("removes nested Claude images without losing error text, tool identity or sibling order", () => {
    const source = { messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "capture_1", name: "capture", input: {} }] },
      { role: "user", content: [
        { type: "text", text: "Keep this explanation." },
        { type: "tool_result", tool_use_id: "capture_1", is_error: true, content: [{ type: "text", text: "Capture partially failed." }, claudeImage()] },
        { type: "text", text: "Keep the next instruction." },
      ] },
    ] };
    stripUnsupportedModalities(source, FORMATS.CLAUDE, noVision);
    const sent = wire(source);
    expect(JSON.stringify(sent)).not.toContain(IMAGE_DATA);
    expect(sent.messages[1].content.map((block) => block.type)).toEqual(["text", "tool_result", "text"]);
    expect(sent.messages[1].content[1]).toMatchObject({ tool_use_id: "capture_1", is_error: true });
    expect(sent.messages[1].content[1].content[0]).toEqual({ type: "text", text: "Capture partially failed." });
  });

  it("strips typed Responses function_call_output images rather than forwarding unsupported binary data", () => {
    const source = { input: [
      { type: "function_call", call_id: "capture_1", name: "capture", arguments: "{}" },
      { type: "function_call_output", call_id: "capture_1", output: [{ type: "input_text", text: "Capture failed after producing a preview." }, { type: "input_image", image_url: IMAGE_URL }] },
      { role: "user", content: [{ type: "input_text", text: "Explain the failure." }] },
    ] };
    stripUnsupportedModalities(source, FORMATS.OPENAI_RESPONSES, noVision);
    const sent = wire(source);
    expect(JSON.stringify(sent)).not.toContain(IMAGE_DATA);
    expect(sent.input[1]).toMatchObject({ type: "function_call_output", call_id: "capture_1" });
    expect(sent.input[1].output[0]).toEqual({ type: "input_text", text: "Capture failed after producing a preview." });
    expect(sent.input[2].content).toEqual([{ type: "input_text", text: "Explain the failure." }]);
  });

  it.each(["parts", "response.parts"])("strips Gemini tool image parts at %s while preserving response JSON", (location) => {
    const response = { result: "captured", error: "preview unavailable" };
    const functionResponse = { id: "capture_1", name: "capture", response };
    if (location === "parts") functionResponse.parts = [geminiImage()];
    else response.parts = [geminiImage()];
    const source = { contents: [{ role: "user", parts: [{ functionResponse }, { text: "Keep the error explanation." }] }] };
    stripUnsupportedModalities(source, FORMATS.GEMINI, noVision);
    const sent = wire(source);
    expect(JSON.stringify(sent)).not.toContain(IMAGE_DATA);
    expect(sent.contents[0].parts[0].functionResponse).toMatchObject({ id: "capture_1", name: "capture", response: { result: "captured", error: "preview unavailable" } });
    expect(sent.contents[0].parts[1]).toEqual({ text: "Keep the error explanation." });
  });

  it("retains structured images when vision is unknown instead of treating absence as false", () => {
    const source = { messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "capture_1", content: [claudeImage()] }] }] };
    const snapshot = structuredClone(source);
    stripUnsupportedModalities(source, FORMATS.CLAUDE, { pdf: false });
    expect(wire(source)).toEqual(snapshot);
  });
});

describe("remote tool images are inlined before a base64-only target receives them", () => {
  beforeEach(() => { fixture.remoteImages.set(REMOTE_URL, { url: IMAGE_URL, mimeType: "image/png" }); });

  it("prefetches Claude tool_result image URLs without serializing the image as result text", async () => {
    const source = { messages: [{ role: "user", content: [{
      type: "tool_result", tool_use_id: "capture_1", is_error: true,
      content: [{ type: "text", text: "Capture warning." }, { type: "image", source: { type: "url", url: REMOTE_URL } }],
    }] }] };
    await prefetchRemoteImages(source, FORMATS.CLAUDE, FORMATS.KIRO);
    const sent = wire(source);
    expect(sent.messages[0].content[0]).toMatchObject({ tool_use_id: "capture_1", is_error: true });
    expect(sent.messages[0].content[0].content).toEqual([{ type: "text", text: "Capture warning." }, claudeImage()]);
  });

  it.each([FORMATS.OPENAI_RESPONSES, FORMATS.CODEX])("prefetches %s message and function output image URLs", async (sourceFormat) => {
    const source = { input: [
      { role: "user", content: [{ type: "input_image", image_url: REMOTE_URL, detail: "high" }] },
      { type: "function_call_output", call_id: "capture_1", output: [{ type: "input_image", image_url: REMOTE_URL }] },
    ] };
    await prefetchRemoteImages(source, sourceFormat, FORMATS.GEMINI);
    const sent = wire(source);
    expect(sent.input[0].content).toEqual([{ type: "input_image", image_url: IMAGE_URL, detail: "high" }]);
    expect(sent.input[1].output).toEqual([{ type: "input_image", image_url: IMAGE_URL }]);
  });

  it("prefetches Gemini functionResponse image parts without changing ordinary response URLs", async () => {
    const source = { contents: [{ role: "user", parts: [{ functionResponse: {
      id: "capture_1", name: "capture", response: { thumbnailUrl: REMOTE_URL },
      parts: [{ fileData: { mimeType: "image/png", fileUri: REMOTE_URL } }],
    } }] }] };
    await prefetchRemoteImages(source, FORMATS.GEMINI, FORMATS.KIRO);
    const sent = wire(source);
    expect(sent.contents[0].parts[0].functionResponse).toEqual({
      id: "capture_1", name: "capture", response: { thumbnailUrl: REMOTE_URL }, parts: [geminiImage()],
    });
  });
});

describe("history capability routing and text-only judge payloads", () => {
  it("keeps an operator-declared capable single route instead of replacing it with the vision adapter", async () => {
    fixture.rows = [{ providerAlias: PROVIDER, id: "opaque", caps: { vision: true } }];
    fixture.settings = { capacityAdapter: { vision: { enabled: true, models: ["openai/gpt-4o"] } } };
    const response = await handleChat(new Request("http://localhost/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...imageBody(), model: `${PROVIDER}/opaque` }),
    }));
    expect(response.ok, response.ok ? "" : await response.clone().text()).toBe(true);
    expect(fixture.sent[0].body.model).toBe("opaque");
    expect(fixture.sent[0].body.messages[0].content[1]).toEqual(openAIImage());
  });

  it("selects a declared vision-capable combo member before a static text-only member", async () => {
    fixture.combos["screenshot-combo"] = { models: ["openai/text-only-fixture", `${PROVIDER}/opaque`] };
    fixture.rows = [{ providerAlias: PROVIDER, id: "opaque", caps: { vision: true } }];
    const response = await handleChat(new Request("http://localhost/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...imageBody(), model: "screenshot-combo" }),
    }));
    expect(response.ok, response.ok ? "" : await response.clone().text()).toBe(true);
    expect(fixture.sent[0].body.model).toBe("opaque");
    expect(fixture.sent[0].body.messages[0].content[1]).toEqual(openAIImage());
  });

  it("does not route through a combo member whose operator explicitly disabled vision", async () => {
    fixture.combos["screenshot-combo"] = { models: ["openai/gpt-4o", `${PROVIDER}/opaque`] };
    fixture.rows = [
      { providerAlias: "openai", id: "gpt-4o", caps: { vision: false } },
      { providerAlias: PROVIDER, id: "opaque", caps: { vision: true } },
    ];
    const response = await handleChat(new Request("http://localhost/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...imageBody(), model: "screenshot-combo" }),
    }));
    expect(response.ok, response.ok ? "" : await response.clone().text()).toBe(true);
    expect(fixture.sent[0].body.model).toBe("opaque");
    expect(fixture.sent[0].body.messages[0].content[1]).toEqual(openAIImage());
  });

  it("routes retained Gemini functionResponse.parts images to a capable combo model after summary compaction", async () => {
    const source = { contents: [
      { role: "user", parts: [{ text: "Conversation summary: inspect the captured page." }] },
      { role: "model", parts: [{ functionCall: { id: "capture_1", name: "capture", args: {} } }] },
      { role: "user", parts: [{ functionResponse: { id: "capture_1", name: "capture", response: { result: "captured" }, parts: [geminiImage()] } }] },
      { role: "model", parts: [{ text: "Captured." }] },
      { role: "user", parts: [{ text: "Is the title centered?" }] },
    ] };
    const snapshot = structuredClone(source);
    const response = await handleComboChat({
      body: source, models: ["gemini/text-only-fixture", "gemini/gemini-2.5-flash"],
      comboName: "vision-history-fixture", comboStrategy: "fallback", log,
      handleSingleModel: async (body, modelStr) => (await dispatch(body, { modelStr, sourceFormat: FORMATS.GEMINI })).result.response,
    });
    expect(response.ok, response.ok ? "" : await response.clone().text()).toBe(true);
    expect(fixture.sent[0].url).toContain("/gemini-2.5-flash:generateContent");
    expect(fixture.sent[0].body.contents[2].parts[0].functionResponse.parts).toEqual([geminiImage()]);
    expect(source).toEqual(snapshot);
  });

  it("removes Responses tool-output image bytes from a text-only judge request without losing the output identity", () => {
    const source = { input: [{
      type: "function_call_output", call_id: "capture_1",
      output: [{ type: "input_text", text: "Capture warning." }, { type: "input_image", image_url: IMAGE_URL }],
    }] };
    const snapshot = structuredClone(source);
    const sent = wire(stripMultimodalContent(source));
    expect(JSON.stringify(sent)).not.toContain(IMAGE_DATA);
    expect(sent.input[0]).toMatchObject({ type: "function_call_output", call_id: "capture_1" });
    expect(sent.input[0].output[0]).toEqual({ type: "input_text", text: "Capture warning." });
    expect(source).toEqual(snapshot);
  });

  it("removes Gemini tool image parts from a text-only judge request without stripping ordinary response data", () => {
    const source = { contents: [{ role: "user", parts: [{ functionResponse: {
      id: "capture_1", name: "capture", response: { error: "Capture warning." }, parts: [geminiImage()],
    } }] }] };
    const snapshot = structuredClone(source);
    const sent = wire(stripMultimodalContent(source));
    expect(JSON.stringify(sent)).not.toContain(IMAGE_DATA);
    expect(sent.contents[0].parts[0].functionResponse).toMatchObject({ id: "capture_1", name: "capture", response: { error: "Capture warning." } });
    expect(source).toEqual(snapshot);
  });
});

describe("operator-declared reasoning at the serialized upstream boundary", () => {
  it.each([[true, "opaque"], [false, "deepseek-r1"]])("honors reasoning=%s for %s instead of a name-only guess", async (reasoning, model) => {
    fixture.rows = [{ providerAlias: PROVIDER, id: model, type: "llm", caps: { reasoning } }];
    const { body } = await dispatch({
      messages: [{ role: "user", content: "Explain the result." }], reasoning_effort: "high",
    }, { model });
    if (reasoning) expect(body.reasoning_effort).toBe("high");
    else {
      expect(body).not.toHaveProperty("reasoning_effort");
      expect(body).not.toHaveProperty("thinking");
    }
  });
});

describe("structured output is independent of reasoning capability", () => {
  it("keeps native Claude output format while removing unsupported effort", async () => {
    fixture.rows = [{ providerAlias: "claude", id: "claude-sonnet-4.6", caps: { reasoning: false } }];
    const format = { type: "json_schema", schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } };
    const { body } = await dispatch({
      messages: [{ role: "user", content: "Return structured output." }],
      max_tokens: 8192, output_config: { effort: "high", format },
    }, { provider: "claude", model: "claude-sonnet-4.6", sourceFormat: FORMATS.CLAUDE });
    expect(body.output_config).toEqual({ format });
    expect(body).not.toHaveProperty("thinking");
  });
});

describe("native source continuity at the gateway boundary", () => {
  it("rejects inherited Responses context before a stateless destination receives an incomplete conversation", async () => {
    const body = { model: "opaque", input: "Continue the previous answer.", previous_response_id: "resp_private_fixture", stream: false };
    const snapshot = structuredClone(body);
    const result = await handleResponsesCore({
      body, modelInfo: { provider: PROVIDER, model: "opaque" },
      credentials: { apiKey: "offline-fixture", providerSpecificData: { baseUrl: "https://gateway.example.invalid/v1" } }, log,
    });
    expect(result.status).toBe(400);
    const data = await result.response.json();
    expect(data.error).toMatchObject({ type: "invalid_request_error", code: "unsupported_parameter", param: "previous_response_id" });
    expect(data.error.message).not.toContain("resp_private_fixture");
    expect(fixture.sent).toEqual([]);
    expect(body).toEqual(snapshot);
  });

  it.each([
    { previous_response_id: "resp_previous_fixture" },
    { conversation: "conv_fixture" },
    { conversation: { id: "conv_fixture" } },
  ])("preserves native Responses input and supported continuity through the worker entry (%j)", async (context) => {
    proxyAwareFetch.mockImplementationOnce(async (url, init) => {
      fixture.sent.push({ url, body: JSON.parse(init.body) });
      return Response.json({
        id: "resp_native_fixture", object: "response", status: "completed", model: "gpt-5.6",
        output: [{ type: "message", id: "msg_native_fixture", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Native continuation.", annotations: [] }] }],
        usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
      });
    });
    const body = {
      model: "gpt-5.6", input: [{ role: "user", content: [{ type: "input_text", text: "Continue." }] }],
      instructions: "Answer tersely.", stream: false, store: true, ...context,
    };
    const snapshot = structuredClone(body);
    const result = await handleResponsesCore({
      body, modelInfo: { provider: "openai", model: "gpt-5.6" },
      credentials: { apiKey: "offline-fixture" }, log,
    });
    expect(result.success).toBe(true);
    expect(fixture.sent[0].url).toContain("/responses");
    expect(fixture.sent[0].body).toMatchObject(snapshot);
    expect(fixture.sent[0].body).not.toHaveProperty("messages");
    expect((await result.response.json()).output).toContainEqual(expect.objectContaining({
      type: "message", content: [{ type: "output_text", text: "Native continuation.", annotations: [] }],
    }));
    expect(body).toEqual(snapshot);
  });

  it("does not mistake a Claude user-agent for Claude wire content on a Chat endpoint", async () => {
    const { body } = await dispatch({ ...imageBody(), max_tokens: 64 }, {
      provider: "anthropic-compatible-vision-fixture", model: "claude-sonnet-4.6",
      sourceFormat: FORMATS.OPENAI, headers: { "user-agent": "claude-cli/fixture" },
    });
    expect(body.messages[0].content).toContainEqual(expect.objectContaining(claudeImage()));
    expect(body.messages[0].content.some(part => part.type === "image_url")).toBe(false);
  });
});

describe("legacy Gemini tool-result media before core normalization", () => {
  it("routes retained result-array images to a capable combo member after compaction", async () => {
    const body = { contents: [
      { role: "user", parts: [{ text: "Summary: a screenshot was captured." }] },
      { role: "model", parts: [{ functionCall: { id: "capture_1", name: "capture", args: {} } }] },
      { role: "user", parts: [{ functionResponse: {
        id: "capture_1", name: "capture", response: { result: [{ type: "text", text: "Captured." }, claudeImage()], trace: "keep" },
      } }] },
      { role: "model", parts: [{ text: "The screenshot is available." }] },
      { role: "user", parts: [{ text: "Is the title centered?" }] },
    ] };
    const snapshot = structuredClone(body);
    const response = await handleComboChat({
      body, models: ["gemini/text-only-fixture", "gemini/gemini-2.5-flash"],
      comboName: "vision-history-fixture", comboStrategy: "fallback", log,
      handleSingleModel: async (source, modelStr) => (await dispatch(source, { modelStr, sourceFormat: FORMATS.GEMINI })).result.response,
    });
    expect(response.ok, response.ok ? "" : await response.clone().text()).toBe(true);
    expect(fixture.sent[0].url).toContain("/gemini-2.5-flash:generateContent");
    const result = fixture.sent[0].body.contents[2].parts[0].functionResponse;
    const images = fixture.sent[0].body.contents[2].parts.filter(part => part.inlineData);
    expect(images).toHaveLength(1);
    expect(images[0].inlineData.data).toBe(IMAGE_DATA);
    expect(images[0].inlineData.mimeType || images[0].inlineData.mime_type).toBe("image/png");
    expect(result.response).toEqual({ result: "Captured.", trace: "keep" });
    expect(body).toEqual(snapshot);
  });

  it.each([false, true])("removes legacy result-array media from the text-only judge without losing siblings (wrapped=%s)", (wrapped) => {
    const request = { contents: [{ role: "user", parts: [{ functionResponse: {
      id: "capture_1", name: "capture", response: { result: [{ type: "text", text: "Capture warning." }, claudeImage()], error: true, trace: "keep" },
    } }] }] };
    const body = wrapped ? { request } : request;
    const snapshot = structuredClone(body);
    const clean = stripMultimodalContent(body);
    const result = (wrapped ? clean.request : clean).contents[0].parts[0].functionResponse;
    expect(JSON.stringify(clean)).not.toContain(IMAGE_DATA);
    expect(result).toMatchObject({
      id: "capture_1", name: "capture",
      response: { result: [{ type: "text", text: "Capture warning." }], error: true, trace: "keep" },
    });
    expect(body).toEqual(snapshot);
  });
});

describe("thinking suffixes retain native model constraints", () => {
  it.each([["none", null], ["32768", 32768]])("keeps Gemini Pro budget constraints for suffix %s", async (suffix, expectedBudget) => {
    const { body } = await dispatch({
      contents: [{ role: "user", parts: [{ text: "Explain the result." }] }],
      generationConfig: { maxOutputTokens: 40000 },
    }, { provider: "gemini", model: `gemini-2.5-pro(${suffix})`, sourceFormat: FORMATS.GEMINI });
    const budget = body.generationConfig.thinkingConfig.thinkingBudget;
    if (expectedBudget === null) expect(budget).toBeGreaterThan(0);
    else expect(budget).toBe(expectedBudget);
  });

  it("keeps an operator's explicit reasoning disable on the suffix-free native identity", async () => {
    fixture.rows = [{ providerAlias: PROVIDER, id: "deepseek-r1", caps: { reasoning: false } }];
    const { body } = await dispatch({
      messages: [{ role: "user", content: "Explain the result." }],
    }, { model: "deepseek-r1(high)" });
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("thinking");
  });
});
