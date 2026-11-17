import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));

import {
  convertSSEToOpenAIResponse,
  handleForcedSSEToJson,
  parseSSEToOpenAIResponse,
} from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { handleNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";

const encoder = new TextEncoder();
const usage = { prompt_tokens: 13, completion_tokens: 5, total_tokens: 18 };
const args = '{ "city": "München", "nested": true }';
const placeholder = { index: 23, id: null, function: { name: null, arguments: null } };
const chat = (delta, finish_reason = null, extra = {}) => ({
  id: "chatcmpl-aggregation-audit", object: "chat.completion.chunk", model: "wire-model",
  choices: [{ index: 0, delta, finish_reason }], ...extra,
});
const wire = chunks => chunks.map(chunk => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join("") + "data: [DONE]\r\n\r\n";

function source(text) {
  return new ReadableStream({ start(controller) {
    const bytes = encoder.encode(text);
    for (let cursor = 0; cursor < bytes.length; cursor += 7) controller.enqueue(bytes.subarray(cursor, cursor + 7));
    controller.close();
  } });
}

function toolChunks() {
  return [
    chat({ role: null, content: null, tool_calls: [null, placeholder] }),
    chat({ tool_calls: [{ index: 0, id: "call_real", type: "function", function: { name: "lookup", arguments: "" } }] }),
    chat({ tool_calls: [{ index: 0, function: { arguments: args.slice(0, 17) } }, null, placeholder] }),
    chat({ tool_calls: [{ index: 0, function: { arguments: args.slice(17) } }] }),
    chat({}, "tool_calls"),
    { choices: [], usage },
  ];
}

const expectedTool = { id: "call_real", type: "function", function: { name: "lookup", arguments: args } };

describe("Chat placeholder handling while aggregating SSE to JSON", () => {
  it.each([undefined, null, ""])("does not invent tools from empty placeholder fields (%s)", empty => {
    const result = parseSSEToOpenAIResponse(wire([
      chat({ content: "Kept text", refusal: "Kept refusal", tool_calls: [null, { index: 23, id: empty, function: { name: empty, arguments: empty } }] }),
      chat({ tool_calls: [placeholder] }, "stop", { usage }),
    ]), "fallback");

    expect(result).not.toHaveProperty("error");
    expect(result.choices).toEqual([{ index: 0, finish_reason: "stop", message: {
      role: "assistant", content: "Kept text", refusal: "Kept refusal",
    } }]);
    expect(result.usage).toEqual(usage);
  });

  it("keeps real tools and their exact arguments when placeholders arrive between fragments", async () => {
    const result = await convertSSEToOpenAIResponse(source(wire(toolChunks())), "fallback");

    expect(result).not.toHaveProperty("error");
    expect(result.choices).toEqual([{ index: 0, finish_reason: "tool_calls", message: {
      role: "assistant", content: null, tool_calls: [expectedTool],
    } }]);
    expect(result.usage).toEqual(usage);
  });

  it("retains distinct opaque signatures on interleaved tool calls without sharing them with another request", async () => {
    const signatures = ["first/opaque+signature==", "second/opaque+signature=="];
    const result = await convertSSEToOpenAIResponse(source(wire([
      chat({ tool_calls: [
        { index: 0, id: "call_first", type: "function", function: { name: "first", arguments: "{" }, extra_content: { google: { thought_signature: signatures[0] }, vendor: { retained: "first==" } } },
        { index: 1, id: "call_second", type: "function", function: { name: "second", arguments: "{" } },
      ] }),
      chat({ tool_calls: [
        { index: 1, function: { arguments: '"second":true}' }, extra_content: { google: { thought_signature: signatures[1] } } },
        null, placeholder,
        { index: 0, function: { arguments: '"first":true}' }, extra_content: { vendor: { continuation: "more==" }, google: { continuation: "keep==" } } },
      ] }),
      chat({}, "tool_calls", { usage }),
    ])), "fallback");

    expect(result.choices[0].message.tool_calls).toEqual([
      { id: "call_first", type: "function", function: { name: "first", arguments: '{"first":true}' }, extra_content: {
        google: { thought_signature: signatures[0], continuation: "keep==" }, vendor: { retained: "first==", continuation: "more==" },
      } },
      { id: "call_second", type: "function", function: { name: "second", arguments: '{"second":true}' }, extra_content: {
        google: { thought_signature: signatures[1] },
      } },
    ]);

    const next = parseSSEToOpenAIResponse(wire([
      chat({ tool_calls: [{ index: 0, id: "call_first", type: "function", function: { name: "first", arguments: "{}" } }] }),
      chat({}, "tool_calls", { usage }),
    ]), "fallback");
    expect(next.choices[0].message.tool_calls[0]).not.toHaveProperty("extra_content");
  });

  it.each(["forced", "nonstream"])("handles placeholders on the actual %s JSON response path", async handler => {
    const context = {
      providerResponse: new Response(source(wire(toolChunks())), { headers: { "content-type": "text/event-stream" } }),
      provider: "offline", model: "wire-model", targetFormat: F.OPENAI, sourceFormat: F.OPENAI,
      body: { model: "wire-model", messages: [] }, stream: false,
      requestStartTime: Date.now(), trackDone: vi.fn(), appendLog: vi.fn(),
      reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn() },
    };
    const result = await (handler === "forced" ? handleForcedSSEToJson(context) : handleNonStreamingResponse(context));

    expect(result.success).toBe(true);
    expect(result.response.status).toBe(200);
    const body = await result.response.json();
    expect(body.choices[0].message.tool_calls).toEqual([expectedTool]);
    expect(body.choices[0].finish_reason).toBe("tool_calls");
    expect(body.usage).toMatchObject(usage);
  });
});
