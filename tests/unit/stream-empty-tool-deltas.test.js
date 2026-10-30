import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
}));

import { createSSEStream } from "../../open-sse/utils/stream.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";

const encoder = new TextEncoder();
const usage = { prompt_tokens: 13, completion_tokens: 5, total_tokens: 18 };
const args = '{ "city": "München", "nested": { "nested": true } }';
const placeholder = { index: 23, id: null, function: { name: null, arguments: null } };
const chat = (delta, finish_reason = null, extra = {}) => ({
  id: "chatcmpl-empty-tool-regression", object: "chat.completion.chunk", model: "wire-model",
  choices: [{ index: 0, delta, finish_reason }], ...extra,
});
const frame = value => `data: ${JSON.stringify(value)}\n\n`;

function frames(wire) {
  return wire.split("\n\n").flatMap(value => {
    const lines = value.split("\n");
    const text = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    return !text || text === "[DONE]" ? [] : [{
      event: lines.find(line => line.startsWith("event:"))?.slice(6).trim(),
      data: JSON.parse(text),
    }];
  });
}

async function consume(chunks, sourceFormat = F.OPENAI, options = {}) {
  const complete = vi.fn();
  const transform = createSSEStream({
    sourceFormat, targetFormat: F.OPENAI,
    body: { tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }] },
    onStreamComplete: complete,
    ...options,
  });
  const bytes = encoder.encode(chunks.map(frame).join("") + "data: [DONE]\n\n");
  const source = new ReadableStream({ start(controller) {
    // Fragment UTF-8 and the enclosing SSE/JSON, not only logical messages.
    for (let cursor = 0; cursor < bytes.length; cursor += 29) controller.enqueue(bytes.subarray(cursor, cursor + 29));
    controller.close();
  } });
  const wire = await new Response(source.pipeThrough(transform)).text();
  return { wire, output: frames(wire), complete };
}

function toolWire(name = "lookup") {
  return [
    chat({ role: "assistant" }),
    chat({ content: null, tool_calls: [placeholder] }),
    chat({ tool_calls: [{ index: 0, id: "call_real", type: "function", function: { name, arguments: "" } }] }),
    chat({ tool_calls: [{ index: 0, function: { arguments: args.slice(0, 17) } }, placeholder] }),
    chat({ tool_calls: [{ index: 0, function: { arguments: args.slice(17) } }] }),
    chat({}, "tool_calls"),
    { id: "chatcmpl-empty-tool-regression", choices: [], usage },
  ];
}

describe("empty upstream Chat tool deltas (9router issue #5345)", () => {
  it("keeps only owned tool content on the same-format Chat stream", async () => {
    const { output, wire, complete } = await consume(toolWire());
    const calls = output.flatMap(({ data }) => data.choices || []).flatMap(choice => choice.delta?.tool_calls || []);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({ index: 0, id: "call_real", type: "function", function: { name: "lookup", arguments: "" } });
    expect(calls.filter(call => call.id)).toHaveLength(1);
    expect(calls.map(call => call.function?.arguments || "").join("")).toBe(args);
    expect(output.filter(({ data }) => data.usage).at(-1).data.usage).toEqual(usage);
    expect(wire.match(/data: \[DONE\]/g)).toHaveLength(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].toolCalls).toEqual([{ id: "call_real", name: "lookup", arguments: args }]);
  });

  it.each([F.CLAUDE, F.OPENAI_RESPONSES, F.GEMINI])("does not allocate phantom native %s tools before a real opener", async source => {
    const { output, wire } = await consume(toolWire(), source);
    if (source === F.CLAUDE) {
      const starts = output.filter(({ data }) => data.type === "content_block_start" && data.content_block.type === "tool_use");
      expect(starts.map(({ data }) => ({ index: data.index, ...data.content_block })))
        .toEqual([{ index: 0, type: "tool_use", id: "call_real", name: "lookup", input: {} }]);
      expect(output.filter(({ data }) => data.delta?.type === "input_json_delta").map(({ data }) => data.delta.partial_json).join("")).toBe(args);
      expect(output.filter(({ data }) => data.type === "message_stop")).toHaveLength(1);
      expect(wire).not.toContain("[DONE]");
    } else if (source === F.OPENAI_RESPONSES) {
      const calls = output.filter(({ data }) => data.type === "response.output_item.done" && data.item.type === "function_call");
      expect(calls.map(({ data }) => ({ call_id: data.item.call_id, name: data.item.name, arguments: data.item.arguments })))
        .toEqual([{ call_id: "call_real", name: "lookup", arguments: args }]);
      expect(output.filter(({ data }) => data.type === "response.completed")).toHaveLength(1);
    } else {
      const calls = output.flatMap(({ data }) => data.candidates || []).flatMap(candidate => candidate.content?.parts || []).filter(part => part.functionCall);
      expect(calls.map(part => part.functionCall)).toEqual([{ id: "call_real", name: "lookup", args: JSON.parse(args) }]);
    }
    expect(output.every(({ event, data }) => !event || event === data.type)).toBe(true);
  });

  it("retains sibling text, refusal, opaque metadata, usage and terminal frames when every tool entry is empty", async () => {
    const mixed = chat({ content: "Kept text", refusal: "Kept refusal", tool_calls: [placeholder], vendor: { opaque: "delta==" } }, null, {
      vendor: { opaque: "chunk==" },
    });
    mixed.choices[0].vendor = { opaque: "choice==" };
    const { output } = await consume([
      mixed,
      chat({ tool_calls: [placeholder] }, "stop", { usage }),
    ]);
    const first = output[0].data;
    expect(first.vendor).toEqual(mixed.vendor);
    expect(first.choices[0].vendor).toEqual(mixed.choices[0].vendor);
    expect(first.choices[0].delta).toEqual({ content: "Kept text", refusal: "Kept refusal", vendor: { opaque: "delta==" } });
    expect(output.flatMap(({ data }) => data.choices || []).filter(choice => choice.finish_reason).map(choice => choice.finish_reason)).toEqual(["stop"]);
    expect(output.filter(({ data }) => data.usage).at(-1).data.usage).toEqual(usage);
    expect(output.flatMap(({ data }) => data.choices || []).some(choice => choice.delta?.tool_calls)).toBe(false);
  });

  it.each([undefined, null, ""])("discards missing/null/empty placeholder fields (%s) without changing valid empty-argument tool starts", async empty => {
    const { output } = await consume([
      chat({ tool_calls: [{ index: 11, id: empty, function: { name: empty, arguments: empty } }] }),
      chat({ tool_calls: [{ index: 0, id: "call_no_args", type: "function", function: { name: "lookup", arguments: "" } }] }),
      chat({}, "tool_calls", { usage }),
    ]);
    const calls = output.flatMap(({ data }) => data.choices || []).flatMap(choice => choice.delta?.tool_calls || []);
    expect(calls).toEqual([{ index: 0, id: "call_no_args", type: "function", function: { name: "lookup", arguments: "" } }]);
  });

  it("retains opaque metadata-only continuations belonging to an existing tool", async () => {
    const continuation = { index: 0, function: { arguments: "" }, extra_content: { google: { thought_signature: "opaque==" } } };
    const { output } = await consume([
      chat({ tool_calls: [{ index: 0, id: "call_opaque", type: "function", function: { name: "lookup", arguments: "" } }] }),
      chat({ tool_calls: [continuation, null, placeholder] }),
      chat({ tool_calls: [{ index: 0, function: { arguments: "{}" } }] }),
      chat({}, "tool_calls", { usage }),
    ]);
    const calls = output.flatMap(({ data }) => data.choices || []).flatMap(choice => choice.delta?.tool_calls || []);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toEqual(continuation);
    expect(calls.map(call => call.function?.arguments || "").join("")).toBe("{}");
  });
});
