import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ requests: [] }));
vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {}, saveRequestUsage: async () => {},
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("../../open-sse/utils/proxyFetch.js", async original => ({ ...await original(), proxyAwareFetch: async (_url, init) => {
  const body = JSON.parse(init.body);
  transport.requests.push(body);
  // Synthetic serde-alias endpoint: two different JSON keys designate the
  // same semantic field. This is not a duplicate-literal-JSON-key test.
  if (body.messages.some(message => Object.hasOwn(message, "reasoning") && Object.hasOwn(message, "reasoning_content"))) {
    return Response.json({ error: { message: "duplicate field reasoning_content" } }, { status: 400 });
  }
  return Response.json({ id: "chat_fixture", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
} }));
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { injectReasoningContent } from "../../open-sse/utils/reasoningContentInjector.js";
import { stripUnsupportedParams } from "../../open-sse/translator/concerns/paramSupport.js";

const message = extra => ({ role: "assistant", content: "answer", ...extra });
const body = extra => ({ max_tokens: 37, messages: [{ role: "user", content: "q" }, message(extra), { role: "user", content: "next" }] });
const dispatch = request => handleChatCore({ body: { ...request, stream: false }, modelInfo: { provider: "deepseek", model: "deepseek-chat" },
  sourceFormatOverride: FORMATS.OPENAI, credentials: { apiKey: "synthetic-alias-fixture" }, log: { debug() {}, info() {}, warn() {} },
});
beforeEach(() => { transport.requests = []; });

describe("Chat readable reasoning alias reconciliation (#4870/#4881)", () => {
  it.each([
    { reasoning: "real reasoning" }, { reasoning_content: "real reasoning" },
    { reasoning: "real reasoning", reasoning_content: "real reasoning" },
    { reasoning: "real reasoning", reasoning_content: null },
    { reasoning: "real reasoning", reasoning_content: "" },
    { reasoning: "", reasoning_content: "real reasoning" },
    { reasoning: null, reasoning_content: "real reasoning" },
  ])("sends one readable carrier to the actual Chat endpoint for %j", async extra => {
    const request = body(extra);
    const before = structuredClone(request);
    const result = await dispatch(request);
    expect(result.success).toBe(true);
    await result.response.text();
    expect(transport.requests.at(-1).messages[1]).toMatchObject({ reasoning_content: "real reasoning" });
    expect(transport.requests.at(-1).messages[1]).not.toHaveProperty("reasoning");
    expect(transport.requests.at(-1).max_tokens).toBe(37);
    expect(request).toEqual(before);
  });

  it("does not add a second placeholder when only the readable alias is present", () => {
    const request = body({ reasoning: "real reasoning" });
    const out = injectReasoningContent({ provider: "deepseek", model: "deepseek-chat", body: request });
    expect(out.messages[1].reasoning).toBe("real reasoning");
    expect(out.messages[1].reasoning_content).toBeUndefined();
    expect(request.messages[1]).not.toHaveProperty("reasoning_content");
  });

  it.each([
    { reasoning: "different", reasoning_content: "canonical" },
    { reasoning: { effort: "high" }, reasoning_content: "canonical" },
    { reasoning: [{ type: "reasoning.text", text: "structured" }] },
    { reasoning_content: { text: "structured" } },
    { reasoning: 1 }, { reasoning_content: false },
  ])("returns an explicit local diagnostic for conflicting/structured carriers %j", async extra => {
    const request = body(extra);
    const before = structuredClone(request);
    const result = await dispatch(request);
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toMatchObject({ code: "unsupported_parameter", param: expect.stringMatching(/^messages\.1\.reasoning/) });
    expect(transport.requests).toHaveLength(0);
    expect(request).toEqual(before);
  });

  it("is idempotent across translation, injection and repeated final Chat normalization", () => {
    const request = body({ reasoning: "real reasoning", reasoning_content: "real reasoning" });
    const out = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "deepseek-chat", request, false, null, "deepseek");
    const first = stripUnsupportedParams("deepseek", "deepseek-chat", injectReasoningContent({ provider: "deepseek", model: "deepseek-chat", body: out }));
    const second = stripUnsupportedParams("deepseek", "deepseek-chat", injectReasoningContent({ provider: "deepseek", model: "deepseek-chat", body: first }));
    expect(second).toEqual(first);
    expect(second.messages[1]).toMatchObject({ reasoning_content: "real reasoning" });
    expect(second.messages[1]).not.toHaveProperty("reasoning");
    expect(request.messages[1].reasoning).toBe("real reasoning");
  });

  it("does not treat Responses reasoning configuration or native typed items as Chat aliases", () => {
    const request = { input: [{ type: "reasoning", id: "rs1", encrypted_content: "opaque", summary: [] }], reasoning: { effort: "high", summary: "detailed" }, max_output_tokens: 37 };
    const out = stripUnsupportedParams("codex", "gpt-6.1-sol", injectReasoningContent({ provider: "codex", model: "gpt-6.1-sol", body: structuredClone(request) }));
    expect(out).toEqual(request);
  });

  it("does not apply a Chat alias policy to native Claude-wire history at the shared final hook", () => {
    const request = { system: "Native instructions", messages: [{ role: "assistant", content: [{ type: "thinking", thinking: "native", signature: "opaque" }, { type: "text", text: "answer" }], reasoning: { native_extension: true } }], max_tokens: 37 };
    const out = stripUnsupportedParams("anthropic", "claude-sonnet-4-6", structuredClone(request));
    expect(out).toEqual(request);
  });

  it("keeps caller tools and typed media owned by the source across alias normalization", async () => {
    const request = { max_tokens: 37, messages: [
      { role: "user", content: [{ type: "text", text: "inspect" }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } }] },
      { role: "assistant", content: "", reasoning: "real reasoning", reasoning_content: "real reasoning", tool_calls: [{ id: "a", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "a", content: "done" },
    ], tools: [{ type: "function", function: { name: "read", parameters: { type: "object", properties: {} } } }] };
    const before = structuredClone(request);
    const result = await handleChatCore({ body: { ...request, stream: false }, modelInfo: { provider: "openai-compatible-alias-fixture", model: "gpt-4o" },
      sourceFormatOverride: FORMATS.OPENAI, credentials: { apiKey: "synthetic-alias-fixture" }, log: { debug() {}, info() {}, warn() {} } });
    expect(result.success).toBe(true);
    await result.response.text();
    const wire = transport.requests.at(-1);
    expect(wire.messages[0].content[1]).toEqual(before.messages[0].content[1]);
    expect(wire.messages[1].tool_calls).toEqual(before.messages[1].tool_calls);
    expect(wire.tools).toEqual(before.tools);
    expect(wire.messages[1].reasoning_content).toBe("real reasoning");
    expect(wire.messages[1]).not.toHaveProperty("reasoning");
    expect(request).toEqual(before);
  });
});
