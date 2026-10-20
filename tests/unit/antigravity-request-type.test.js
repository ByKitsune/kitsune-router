import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real executor and JSON serialization; never contact a provider.
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { openaiToAntigravityRequest } from "../../open-sse/translator/request/openai-to-gemini.js";
import { handleChatSearch } from "../../open-sse/handlers/search/chatSearch.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const model = "gemini-3.8-flash-high";
const credentials = {
  accessToken: "request-type-offline-fixture",
  projectId: "request-type-project",
  connectionId: "request-type-connection",
};

function nativeBody(extra = {}) {
  return {
    model,
    userAgent: "antigravity",
    request: {
      sessionId: "request-type-session",
      contents: [{ role: "user", parts: [{ text: "Reply only OK" }] }],
      generationConfig: { maxOutputTokens: 127 },
    },
    ...extra,
  };
}

async function execute(body, stream = true, upstreamModel = model) {
  const result = await new AntigravityExecutor().execute({
    model: upstreamModel, body, stream, credentials,
  });
  expect(result.response.status).toBe(200);
  expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  const wire = JSON.parse(proxyAwareFetch.mock.calls[0][1].body);
  return { result, wire };
}

beforeEach(() => {
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => Response.json({ response: {
    candidates: [{ content: { role: "model", parts: [{ text: "Offline fixture" }] }, finishReason: "STOP" }],
  } }));
});

describe("Antigravity chat requestType outbound isolation", () => {
  it.each(["agent", "chat"])("omits legacy native requestType=%s without deleting caller intent", async (requestType) => {
    const body = Object.freeze(nativeBody({ requestType }));
    const before = structuredClone(body);

    const { result, wire } = await execute(body);

    expect(result.transformedBody).not.toHaveProperty("requestType");
    expect(wire).not.toHaveProperty("requestType");
    expect(body).toEqual(before);
    expect(body.requestType).toBe(requestType);
  });

  it.each([
    ["agent", false, model],
    ["chat", false, model],
    ["agent", true, "claude-sonnet-4-6"],
    ["chat", true, "claude-sonnet-4-6"],
    ["agent", false, "claude-sonnet-4-6"],
    ["chat", false, "claude-sonnet-4-6"],
  ])("omits native requestType=%s with stream=%s on %s", async (requestType, stream, upstreamModel) => {
    const body = Object.freeze(nativeBody({ model: upstreamModel, requestType }));
    const before = structuredClone(body);

    const { result, wire } = await execute(body, stream, upstreamModel);

    expect(result.transformedBody).not.toHaveProperty("requestType");
    expect(wire).not.toHaveProperty("requestType");
    expect(wire.model).toBe(upstreamModel);
    expect(wire.request.contents).toEqual(before.request.contents);
    expect(wire.request.generationConfig.maxOutputTokens).toBe(127);
    expect(body).toEqual(before);
  });

  it.each([false, true])("keeps unlabelled native passthrough chat intact with stream=%s", async (stream) => {
    const requestId = "agent/fixture-conversation/1700000000000/fixture-trajectory/1";
    const body = Object.freeze(nativeBody({ requestId }));
    const before = structuredClone(body);

    const { result, wire } = await execute(body, stream);

    expect(result.transformedBody).not.toBe(body);
    expect(wire).not.toHaveProperty("requestType");
    expect(wire).toMatchObject({
      project: credentials.projectId, model, userAgent: "antigravity", requestId,
      request: before.request,
    });
    expect(body).toEqual(before);
  });

  it.each([model, "claude-sonnet-4-6"])("keeps translated %s chat free of requestType", async (upstreamModel) => {
    const input = {
      messages: [{ role: "user", content: "Reply only OK" }],
      max_tokens: 4096,
    };
    const inputBefore = structuredClone(input);
    const body = Object.freeze(openaiToAntigravityRequest(upstreamModel, input, false, credentials));
    const before = structuredClone(body);

    const { wire } = await execute(body, false, upstreamModel);

    expect(body).not.toHaveProperty("requestType");
    expect(wire).not.toHaveProperty("requestType");
    expect(wire.model).toBe(upstreamModel);
    expect(wire.request.contents).toEqual(before.request.contents);
    expect(wire.request.generationConfig.maxOutputTokens).toBe(4096);
    expect(input).toEqual(inputBefore);
    expect(body).toEqual(before);
  });

  it.each([undefined, "agent", "chat", "image_gen"])("retains image_gen semantics for incoming requestType=%s", async (requestType) => {
    const upstreamModel = "gemini-3.1-flash-image-16x9";
    const body = Object.freeze(nativeBody({
      model: upstreamModel,
      ...(requestType === undefined ? {} : { requestType }),
      request: {
        sessionId: "request-type-image-session",
        contents: [{ role: "user", parts: [
          { text: "Edit the supplied image" },
          { inline_data: { mime_type: "image/png", data: "aW1hZ2UtZml4dHVyZQ==" } },
        ] }],
        generationConfig: { maxOutputTokens: 127 },
      },
    }));
    const before = structuredClone(body);

    const { result, wire } = await execute(body, true, upstreamModel);

    expect(result.url).toMatch(/\/v1internal:generateContent$/);
    expect(wire.requestType).toBe("image_gen");
    expect(wire.model).toBe("gemini-3.1-flash-image");
    expect(wire.request.contents).toEqual([{ role: "user", parts: [
      { text: "Edit the supplied image" },
      { inlineData: { mimeType: "image/png", data: "aW1hZ2UtZml4dHVyZQ==" } },
    ] }]);
    expect(wire.request.generationConfig).toMatchObject({
      maxOutputTokens: 127, responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "16:9" },
    });
    expect(body).toEqual(before);
  });

  it("preserves a reusable caller envelope across repeated transformations", () => {
    const body = Object.freeze(nativeBody({
      requestType: "agent",
      requestId: "agent/fixture-conversation/1700000000000/fixture-trajectory/1",
    }));
    const before = structuredClone(body);
    const executor = new AntigravityExecutor();

    const first = executor.transformRequest(model, body, true, credentials);
    const second = executor.transformRequest(model, body, true, credentials);

    expect(first).not.toHaveProperty("requestType");
    expect(second).toEqual(first);
    expect(body).toEqual(before);
    expect(body.requestType).toBe("agent");
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it("leaves dedicated grounded search outside the chat executor", async () => {
    const chatTransform = vi.spyOn(AntigravityExecutor.prototype, "transformRequest");
    try {
      const result = await handleChatSearch({
        provider: "antigravity", model: "gemini-2.5-flash", query: "Offline search fixture", credentials,
      });

      expect(result.success).toBe(true);
      expect(chatTransform).not.toHaveBeenCalled();
      expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
      const [url, options] = proxyAwareFetch.mock.calls[0];
      const wire = JSON.parse(options.body);
      expect(url).toBe("https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent");
      expect(wire.model).toBe("gemini-2.5-flash");
      expect(wire.request.tools).toEqual([{ googleSearch: {} }]);
      expect(wire.request.contents).toEqual([{ role: "user", parts: [{ text: "Offline search fixture" }] }]);
      // The existing dedicated search contract omits requestType; do not invent a bucket.
      expect(wire).not.toHaveProperty("requestType");
      expect(wire.request.generationConfig.maxOutputTokens).toBe(8192);
    } finally {
      chatTransform.mockRestore();
    }
  });
});
