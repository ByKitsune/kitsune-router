import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real catalog, alias resolver, chat handler, translator and
// executor. Only persistence/logging and the outbound HTTP call are faked.
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: vi.fn(async () => undefined) }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: async () => ({
    logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
    logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
  }),
}));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async () => [{ id: "fixture-ocg", provider: "opencode-go", isActive: true }]),
  getCombos: vi.fn(async () => []), getCustomModels: vi.fn(async () => []),
  getModelAliases: vi.fn(async () => ({})), getProviderNodes: vi.fn(async () => []),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: vi.fn(async () => ({})) }));

import { getDefaultModel, getModelSupportedFormats, getModelTargetFormat, getModelUpstreamId, getModelsByProviderId, isValidModel } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { parseModel } from "../../open-sse/services/model.js";
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { buildModelsList } from "../../src/app/api/v1/models/route.js";

const MODEL = "glm-5.3";
const KIMI = "kimi-k3.1-pro";
const CHAT_URL = "https://opencode.ai/zen/go/v1/chat/completions";

beforeEach(() => {
  vi.clearAllMocks();
  setCatalogSource(null);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected non-fixture network request"); }));
  proxyAwareFetch.mockImplementation(async () => new Response(JSON.stringify({
    id: "chatcmpl-fixture", object: "chat.completion", model: MODEL,
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }), { status: 200, headers: { "content-type": "application/json" } }));
});

afterEach(() => { setCatalogSource(null); vi.unstubAllGlobals(); });

describe("OpenCode Go upstream catalog refresh", () => {
  it.each([[MODEL, "GLM 5.3"], [KIMI, "Kimi K3.1 Pro"]])("resolves the public ocg alias to the exact hosted %s ID", (model, name) => {
    const selected = parseModel(`ocg/${model}`);
    expect(selected).toMatchObject({ provider: "opencode-go", providerAlias: "ocg", model });
    expect(isValidModel(selected.provider, selected.model)).toBe(true);
    expect(getModelsByProviderId(selected.provider).filter(row => row.id === model)).toEqual([
      expect.objectContaining({ id: model, name }),
    ]);
    expect(getModelUpstreamId(selected.provider, selected.model)).toBe(model);
    expect(getModelTargetFormat(selected.provider, selected.model)).toBe("openai");
    expect(getModelSupportedFormats(selected.provider, `${model}(high)`)).toEqual(["openai"]);
  });

  it.each([
    [MODEL, { input: 1.4, output: 4.4, cached: 0.26 }, 1000000, false, false, "openai"],
    [KIMI, { input: 2, output: 10, cached: 0.2, cache_creation: 2 }, 1048576, true, true, "kimi"],
  ])("keeps %s quota references distinct from unknown cash costs", (model, reference, context, vision, videoInput, thinkingFormat) => {
    const record = getReviewedModelMetadata("ocg", model);
    expect(record.billing).toMatchObject({
      kind: "subscription-reference", referenceUnit: "USD_quota_reference_per_1000000_tokens",
      invoiceVerified: false, referencePricing: reference,
    });
    expect(record.limits).toMatchObject({ catalogProvider: "opencode-go", catalogModelId: model, authenticatedRouteVerified: false });
    expect(record.provenance.modelsDevSnapshot.sha256).toBe("a0af14e6709252ef4da167c43df2de1926e6116b0204859fe3c9e865dea5a38a");
    expect(getCapabilitiesForModel("opencode-go", model)).toMatchObject({
      contextWindow: context, maxInput: null, maxOutput: 131072,
      vision, videoInput, pdf: false, audioInput: false, reasoning: true, tools: true,
      thinkingFormat, thinkingCanDisable: false, thinkingEfforts: ["low", "high", "max"],
    });
    expect(getThinkingLevels("ocg", model)).toEqual(["low", "high", "max"]);
    for (const provider of ["ocg", "opencode-go"]) {
      const price = getPricingForModel(provider, model);
      expect(price).toMatchObject({ input: null, output: null, cached: null, cache_creation: null });
      expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 }, price)).toBeNull();
    }
  });

  it("does not inherit stale catalog limits, including for suffixed requests", () => {
    setCatalogSource({
      getModalities: () => ({ vision: false, videoInput: false }),
      getLimits: () => ({ contextWindow: 17, maxInput: 18, maxOutput: 19 }),
    });
    for (const [model, context, vision, videoInput] of [[MODEL, 1000000, false, false], [KIMI, 1048576, true, true]]) {
      for (const id of [model, `${model}(high)`]) {
        expect(getCapabilitiesForModel("opencode-go", id)).toMatchObject({
          contextWindow: context, maxInput: null, maxOutput: 131072, vision, videoInput,
        });
      }
    }
  });

  it("leaves the default and previously declared Kimi route unchanged", () => {
    expect(getDefaultModel("opencode-go")).toBe("glm-5.3-flash");
    expect(getModelUpstreamId("opencode-go", "kimi-k3")).toBe("kimi-k3");
    expect(getModelSupportedFormats("opencode-go", "kimi-k3")).toEqual(["openai"]);
    expect(getModelTargetFormat("opencode-go", "kimi-k3")).toBe("openai");
  });

  it("resolves the accepted dashed Kimi version spelling to the literal hosted ID", () => {
    const selected = parseModel("ocg/kimi-k3-1-pro");
    expect(isValidModel(selected.provider, selected.model)).toBe(true);
    expect(getModelUpstreamId(selected.provider, selected.model)).toBe(KIMI);
    expect(getCapabilitiesForModel(selected.provider, selected.model)).toMatchObject({ contextWindow: 1048576, maxInput: null, maxOutput: 131072 });
    expect(getPricingForModel(selected.provider, selected.model)).toMatchObject({ input: null, output: null });
  });

  it.each([
    [MODEL, 1000000, { input: 1.4, output: 4.4, cached: 0.26 }],
    [KIMI, 1048576, { input: 2, output: 10, cached: 0.2, cache_creation: 2 }],
  ])("publishes %s with its Go limits and unknown independent input", async (model, context, reference) => {
    const rows = await buildModelsList(["llm"]);
    const matches = rows.filter(row => row.id === `ocg/${model}`);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      owned_by: "ocg", context_length: context, max_completion_tokens: 131072,
      capabilities: { contextWindow: context, maxInput: null, maxOutput: 131072 },
      metadata: {
        billing: { kind: "subscription-reference", invoiceVerified: false, referencePricing: reference },
        pricing: { input: null, output: null, cached: null, cache_creation: null },
      },
    });
    expect(matches[0]).not.toHaveProperty("max_input_tokens");
  });

  it.each([
    ...[MODEL, KIMI].flatMap(model => [
      [model, "openai", "", { messages: [{ role: "user", content: "fixture" }], max_tokens: 37 }],
      [model, "claude", "", { messages: [{ role: "user", content: "fixture" }], max_tokens: 37 }],
      [model, "openai-responses", "", { input: [{ role: "user", content: "fixture" }], max_output_tokens: 37 }],
      [model, "claude", "(high)", { messages: [{ role: "user", content: "fixture" }], max_tokens: 37 }],
      [model, "openai", "(max)", { messages: [{ role: "user", content: "fixture" }], max_tokens: 37 }],
    ]),
  ])("routes %s %s requests with suffix %s through Chat Completions", async (model, sourceFormat, suffix, request) => {
    const modelInfo = parseModel(`ocg/${model}${suffix}`);
    const result = await handleChatCore({
      body: { model: `ocg/${model}${suffix}`, stream: false, ...request },
      modelInfo,
      credentials: { apiKey: "fixture-token", providerSpecificData: {} },
      connectionId: "fixture-ocg",
      sourceFormatOverride: sourceFormat,
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    });
    expect(result.success).toBe(true);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    const [url, options] = proxyAwareFetch.mock.calls[0];
    expect(url).toBe(CHAT_URL);
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer fixture-token");
    const sent = JSON.parse(options.body);
    expect(sent).toMatchObject({
      model,
      messages: [{ role: "user", content: "fixture" }],
      max_tokens: 37,
    });
    if (suffix) expect(sent.reasoning_effort).toBe(suffix.slice(1, -1));
    expect(sent).not.toHaveProperty("thinking");
  });

  it("preserves Kimi images from compacted history and tool results on the actual outbound wire", async () => {
    const base64 = "iVBORw0KGgo=";
    const image = { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } };
    const result = await handleChatCore({
      body: {
        model: `ocg/${KIMI}`, stream: false, max_tokens: 37,
        tools: [{ name: "lookup", description: "fixture", input_schema: { type: "object", properties: {} } }],
        messages: [
          { role: "user", content: [{ type: "text", text: "Earlier compacted context" }, image] },
          { role: "assistant", content: [{ type: "tool_use", id: "call_fixture", name: "lookup", input: {} }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "call_fixture", content: [{ type: "text", text: "Found it" }, image] }] },
          { role: "user", content: "Continue" },
        ],
      },
      modelInfo: parseModel(`ocg/${KIMI}`),
      credentials: { apiKey: "fixture-token", providerSpecificData: {} },
      connectionId: "fixture-ocg-vision", sourceFormatOverride: "claude",
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    });
    expect(result.success).toBe(true);
    const [url, options] = proxyAwareFetch.mock.calls[0];
    expect(url).toBe(CHAT_URL);
    const sent = JSON.parse(options.body);
    expect(sent.model).toBe(KIMI);
    expect(sent.max_tokens).toBe(37);
    expect(sent.tools).toEqual([expect.objectContaining({ type: "function", function: expect.objectContaining({ name: "lookup" }) })]);
    expect(sent.messages.some(message => message.role === "assistant" && message.tool_calls?.[0]?.id === "call_fixture")).toBe(true);
    expect(sent.messages.some(message => message.role === "tool" && message.tool_call_id === "call_fixture" && message.content === "Found it")).toBe(true);
    const images = sent.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
      .filter(part => part.type === "image_url");
    expect(images).toEqual([
      { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
      { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
    ]);
  });

  it("keeps a typed Kimi video block rather than turning it into prose", async () => {
    const video = { type: "video_url", video_url: { url: "https://example.invalid/fixture.mp4" } };
    const result = await handleChatCore({
      body: { model: `ocg/${KIMI}`, stream: false, max_tokens: 37, messages: [{ role: "user", content: [video] }] },
      modelInfo: parseModel(`ocg/${KIMI}`), credentials: { apiKey: "fixture-token", providerSpecificData: {} },
      connectionId: "fixture-ocg-video", sourceFormatOverride: "openai",
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    });
    expect(result.success).toBe(true);
    const [url, options] = proxyAwareFetch.mock.calls[0];
    expect(url).toBe(CHAT_URL);
    expect(JSON.parse(options.body).messages[0].content).toEqual([video]);
  });

  it("rejects unsupported Kimi PDF input before dispatch", async () => {
    const result = await handleChatCore({
      body: {
        model: `ocg/${KIMI}`, stream: false, max_tokens: 37,
        messages: [{ role: "user", content: [{ type: "file", file: { file_data: "data:application/pdf;base64,JVBERi0xLjE=", filename: "fixture.pdf" } }] }],
      },
      modelInfo: parseModel(`ocg/${KIMI}`), credentials: { apiKey: "fixture-token", providerSpecificData: {} },
      connectionId: "fixture-ocg-pdf", sourceFormatOverride: "openai",
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    });
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error.code).toBe("unsupported_parameter");
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });
});
