import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {},
  appendRequestLog: async () => {}, saveRequestDetail: async () => {},
  saveRequestUsage: async () => {}, enqueueRequestUsage: async () => ({ accepted: true }),
}));

import { createSSEStream } from "../../open-sse/utils/stream.js";
import { createSSEAggregationState, convertSSEToOpenAIResponse } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { prepareClaudeRequest } from "../../open-sse/translator/formats/claude.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const model = "claude-opus-4-6";
const signature = " opaque:v2/#原文/+==\n";
const redacted = { type: "redacted_thinking", data: "native-opaque/+==" };
const tool = { type: "tool_use", id: "toolu_replay", name: "lookup", input: { city: "München" } };
const transformations = [{ type: "thinking", reason: "prefix_binding_mismatch", path: "messages.0.content.0" }];
const events = [
  { type: "message_start", message: { id: "msg_replay", type: "message", role: "assistant", model, content: [],
    input_transformations: transformations, usage: { input_tokens: 7, output_tokens: 0 } } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: signature.slice(0, 9) } },
  { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: signature.slice(9) } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: redacted },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_start", index: 2, content_block: { ...tool, input: {} } },
  { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } },
  { type: "content_block_stop", index: 2 },
  { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 5 } },
  { type: "message_stop" },
];
const wire = events.map(event => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join("");
function byteStream() {
  const bytes = new TextEncoder().encode(wire);
  let index = 0;
  return new ReadableStream({ pull(controller) {
    if (index === bytes.length) controller.close();
    else controller.enqueue(bytes.slice(index, ++index));
  } });
}

describe("native Claude signature streaming and replay", () => {
  it("keeps fragmented signature deltas, named terminal events and transformations without a Chat sentinel", async () => {
    const transform = createSSEStream({ mode: "passthrough", sourceFormat: FORMATS.CLAUDE, targetFormat: FORMATS.CLAUDE, provider: "claude" });
    const text = await new Response(byteStream().pipeThrough(transform)).text();
    const actual = text.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
    expect(actual.filter(event => event.delta?.type === "signature_delta").map(event => event.delta.signature).join("")).toBe(signature);
    expect(actual[0].message.input_transformations).toEqual(transformations);
    expect(actual.at(-1)).toEqual({ type: "message_stop" });
    expect(text).not.toContain("[DONE]");
  });

  it("aggregates opaque native blocks and replays them unchanged on the next tool-result request", async () => {
    const state = createSSEAggregationState(FORMATS.CLAUDE, FORMATS.CLAUDE, model);
    const completion = await convertSSEToOpenAIResponse(byteStream(), model, FORMATS.CLAUDE, state);
    expect(completion.error).toBeUndefined();
    const expected = [{ type: "thinking", thinking: "", signature }, redacted, tool];
    expect(state.nativeResponse.content).toEqual(expected);
    expect(state.nativeResponse.input_transformations).toEqual(transformations);
    const sent = prepareClaudeRequest({ model, max_tokens: 2048, thinking: { type: "enabled", budget_tokens: 1024 },
      messages: [{ role: "assistant", content: structuredClone(state.nativeResponse.content) },
        { role: "user", content: [{ type: "tool_result", tool_use_id: tool.id, content: "found" }] }],
    }, "claude");
    expect(sent.messages[0].content.slice(0, 2)).toEqual(expected.slice(0, 2));
  });
});
