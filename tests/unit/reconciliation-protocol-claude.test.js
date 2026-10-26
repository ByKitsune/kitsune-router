import { describe, expect, it, vi } from "vitest";

const wire = vi.hoisted(() => ({ requests: [] }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {},
  saveRequestDetail: async () => {}, saveRequestUsage: async () => {},
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("../../open-sse/utils/proxyFetch.js", async original => ({ ...await original(), proxyAwareFetch: async (_url, init) => {
  wire.requests.push(JSON.parse(init.body));
  return Response.json({ id: "msg_fixture", type: "message", role: "assistant", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
} }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest } from "../../open-sse/translator/index.js";

const audio = () => ({ type: "input_audio", input_audio: { data: "UklGRiQAAABXQVZF", format: "wav" } });
const dispatch = (body, source = FORMATS.OPENAI) => handleChatCore({
  body: { ...body, stream: false }, sourceFormatOverride: source,
  modelInfo: { provider: "anthropic-compatible-reconciliation", model: "claude-sonnet-4.6" },
  credentials: { apiKey: "synthetic-reconciliation", providerSpecificData: { baseUrl: "https://upstream.example/v1" } },
  log: { debug() {}, info() {}, warn() {} },
});

describe("Claude public request codecs", () => {
  it("sends only caller instructions to a compatible Messages endpoint", async () => {
    const result = await dispatch({ messages: [{ role: "system", content: "Stay concise." }, { role: "user", content: "hi" }] });
    expect(result.success).toBe(true);
    await result.response.text();
    expect(wire.requests.at(-1).system.map(block => block.text)).toEqual(["Stay concise."]);
  });

  it.each([FORMATS.OPENAI, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES])("returns HTTP 400 before %s audio can be stripped or dispatched", async source => {
    const before = wire.requests.length;
    const body = source === FORMATS.OPENAI_RESPONSES
      ? { input: [{ role: "user", content: [audio()] }] }
      : { messages: [{ role: "user", content: [audio()] }] };
    const result = await dispatch(body, source);
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toMatchObject({ code: "unsupported_parameter" });
    expect(wire.requests).toHaveLength(before);
  });

  it("does not interpret audio-looking tool JSON as an attachment", () => {
    const json = JSON.stringify({ type: "input_audio", input_audio: { data: "literal-data" } });
    const out = translateRequest(FORMATS.OPENAI, FORMATS.CLAUDE, "m", { messages: [
      { role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: json },
    ] }, false, null, "anthropic-compatible-reconciliation");
    expect(out.messages.find(message => message.role === "user").content[0].content).toBe(json);
  });

  it("rejects typed audio in a native Google tool result before a bridge can erase it", () => {
    const request = { contents: [{ role: "user", parts: [{ functionResponse: {
      name: "record", response: { result: [{ type: "input_audio", input_audio: { data: "AUDIO", format: "wav" } }] },
    } }] }] };
    expect(() => translateRequest(FORMATS.GEMINI, FORMATS.CLAUDE, "m", request, false, null, "anthropic-compatible-reconciliation"))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter" }));
  });
});
