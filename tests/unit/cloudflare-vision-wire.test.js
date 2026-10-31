import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ requests: [] }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { stripUnsupportedParams } from "../../open-sse/translator/concerns/paramSupport.js";

const visionModel = "@cf/moonshotai/kimi-k2.6";
const textModel = "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b";
const imageUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const image = () => ({ type: "image_url", image_url: { url: imageUrl, detail: "high" } });
const log = { info() {}, debug() {}, warn() {} };

beforeEach(() => {
  fixture.requests = [];
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected real network request"); }));
  proxyAwareFetch.mockReset();
  proxyAwareFetch.mockImplementation(async (url, options) => {
    fixture.requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ id: "chatcmpl-fixture", model: visionModel, choices: [{ index: 0, message: { role: "assistant", content: "Synthetic vision answer" }, finish_reason: "stop" }], usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 } });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function dispatch(body, model = visionModel, sourceFormat = FORMATS.OPENAI) {
  const result = await handleChatCore({ body: { ...body, model, stream: false }, modelInfo: { provider: "cloudflare-ai", model },
    sourceFormatOverride: sourceFormat, credentials: { apiKey: "synthetic-cf-token", providerSpecificData: { accountId: "synthetic-account" } },
    connectionId: "cf-vision-fixture", log });
  expect(result.success).toBe(true);
  await result.response.text();
  return fixture.requests.at(-1);
}

describe("Cloudflare vision content survives final endpoint normalization (#2749)", () => {
  it("preserves mixed typed images in the actual admitted vision-model payload", async () => {
    expect(getCapabilitiesForModel("cloudflare-ai", visionModel).vision).toBe(true);
    const body = { messages: [{ role: "user", content: [{ type: "text", text: "What color?" }, image()] }] };
    const before = structuredClone(body);
    const wire = await dispatch(body);
    expect(wire.url).toBe("https://api.cloudflare.com/client/v4/accounts/synthetic-account/ai/v1/chat/completions");
    expect(wire.body.messages[0].content).toEqual(body.messages[0].content);
    expect(JSON.stringify(wire.body).split(imageUrl).length - 1).toBe(1);
    expect(body).toEqual(before);
  });

  it("preserves image-only content through Claude-to-Chat lowering", async () => {
    const data = imageUrl.split(",")[1];
    const wire = await dispatch({ messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data } }] }], max_tokens: 31 }, visionModel, FORMATS.CLAUDE);
    expect(wire.body.messages[0].content).toEqual([{ type: "image_url", image_url: { url: imageUrl } }]);
  });

  it("retains text-only WorkersAI compatibility on the actual executor", async () => {
    const wire = await dispatch({ messages: [{ role: "user", content: [{ type: "text", text: "Hello " }, { type: "text", text: "world" }] }] }, textModel);
    expect(wire.body.messages[0].content).toBe("Hello \nworld");
  });

  it("does not admit images to a text-only model through the new flattening boundary", async () => {
    expect(getCapabilitiesForModel("cloudflare-ai", textModel).vision).toBe(false);
    const wire = await dispatch({ messages: [{ role: "user", content: [{ type: "text", text: "Keep text" }, image()] }] }, textModel);
    expect(typeof wire.body.messages[0].content).toBe("string");
    expect(wire.body.messages[0].content).toContain("Keep text");
    expect(JSON.stringify(wire.body)).not.toContain(imageUrl);
  });

  it("does not classify a media block as text just because it has a text annotation", () => {
    const content = [{ ...image(), text: "A caption is not the image payload" }];
    const body = { messages: [{ role: "user", content }] };
    stripUnsupportedParams("cloudflare-ai", visionModel, body);
    expect(body.messages[0].content).toEqual(content);
  });
});
