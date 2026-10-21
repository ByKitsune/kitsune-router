import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({ dns: vi.fn(), image: vi.fn(), inference: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: (...args) => network.dns(...args) }));
vi.mock("undici", async original => ({ ...await original(), fetch: (...args) => network.image(...args) }));
vi.mock("../../open-sse/utils/proxyFetch.js", async original => ({ ...await original(), proxyAwareFetch: (...args) => network.inference(...args) }));
vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {}, saveRequestUsage: async () => {} }));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const remote = "https://images.example/capture.png";
const image = () => ({ type: "image_url", image_url: { url: remote } });
const dispatch = (body, clientSignal, source = FORMATS.OPENAI) => handleChatCore({
  body: { ...body, stream: false }, sourceFormatOverride: source,
  modelInfo: { provider: "kiro", model: "claude-sonnet-4.5" },
  credentials: { accessToken: "synthetic-kiro-fixture" }, clientSignal,
  log: { debug() {}, info() {}, warn() {} },
});
beforeEach(() => {
  vi.clearAllMocks();
  network.dns.mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  network.image.mockReset().mockImplementation(async () => new Response(Buffer.from(png, "base64"), { headers: { "content-type": "image/png" } }));
  // Keep the real Kiro executor and serialization. The offline transport returns
  // an error after capturing the request, avoiding a fabricated EventStream.
  network.inference.mockReset().mockImplementation(async () => Response.json({ message: "fixture captured" }, { status: 400 }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe("Kiro public image codec", () => {
  it.each([FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, FORMATS.CLAUDE])("fetches %s HTTP images into Kiro's real typed bytes before HTTP serialization", async source => {
    const body = source === FORMATS.CLAUDE
      ? { messages: [{ role: "user", content: [{ type: "image", source: { type: "url", url: remote } }] }] }
      : source === FORMATS.OPENAI_RESPONSES
        ? { input: [{ role: "user", content: [{ type: "input_image", image_url: remote }] }] }
        : { messages: [{ role: "user", content: [{ type: "text", text: "see" }, image()] }] };
    await dispatch(body, undefined, source);
    const wire = JSON.parse(network.inference.mock.calls.at(-1)[1].body);
    const current = wire.conversationState.currentMessage.userInputMessage;
    expect(current.images).toEqual([{ format: "png", source: { bytes: png } }]);
    expect(current.content).not.toContain(remote);
    expect(current.content).not.toContain(png);
    expect(JSON.stringify(wire)).not.toContain("[Image:");
    expect(network.image.mock.calls.map(([url]) => url)).toEqual([remote]);
  });

  it("preserves image ownership across parallel tool results and compacted history", async () => {
    await dispatch({ messages: [
      { role: "user", content: "Compacted context: inspect the screenshot." },
      { role: "assistant", tool_calls: ["a", "b"].map(id => ({ id, type: "function", function: { name: "capture", arguments: "{}" } })) },
      { role: "tool", tool_call_id: "a", content: [{ type: "text", text: "first" }, image()] },
      { role: "tool", tool_call_id: "b", content: "second" },
    ], tools: [{ type: "function", function: { name: "capture", parameters: { type: "object", properties: {} } } }] });
    const wire = JSON.parse(network.inference.mock.calls.at(-1)[1].body);
    const current = wire.conversationState.currentMessage.userInputMessage;
    expect(current.images).toEqual([{ format: "png", source: { bytes: png } }]);
    expect(current.userInputMessageContext.toolResults.map(result => ({ id: result.toolUseId, content: result.content }))).toEqual([
      { id: "a", content: [{ text: "first" }] }, { id: "b", content: [{ text: "second" }] },
    ]);
    expect(JSON.stringify(wire.conversationState.history)).not.toContain(png);
  });

  it.each(["private DNS", "redirect", "non-image body"])("fails explicitly with no generation call after %s retrieval rejection", async failure => {
    if (failure === "private DNS") network.dns.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    if (failure === "redirect") network.image.mockImplementation(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    if (failure === "non-image body") network.image.mockImplementation(async () => new Response("not an image"));
    const result = await dispatch({ messages: [{ role: "user", content: [image()] }] });
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.0.content.0.image_url" });
    expect(network.inference).not.toHaveBeenCalled();
  });

  it("rejects unresolved typed tool media rather than silently dropping it", () => {
    expect(() => translateRequest(FORMATS.CLAUDE, FORMATS.KIRO, "claude-sonnet-4.5", { messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "a", name: "capture", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: [{ type: "image", source: { type: "url", url: remote } }] }] },
    ] }, false, null, "kiro")).toThrow(expect.objectContaining({ code: "unsupported_parameter" }));
  });

  it("keeps cancellation terminal if an image fetch aborts with an ordinary Error", async () => {
    const controller = new AbortController();
    network.image.mockImplementation(async () => {
      controller.abort(new Error("caller stopped image retrieval"));
      throw controller.signal.reason;
    });
    const result = await dispatch({ messages: [{ role: "user", content: [image()] }] }, controller.signal);
    expect(result.response.status).toBe(499);
    expect(network.inference).not.toHaveBeenCalled();
    expect(network.image).toHaveBeenCalledTimes(1);
  });
});
