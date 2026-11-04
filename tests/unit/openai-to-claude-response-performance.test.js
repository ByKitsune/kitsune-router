import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestUsage: async () => {}, enqueueRequestUsage: async () => {} }));
import { initState, translateResponse } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { createSSEParser, parseSSEEvent } from "../../open-sse/utils/sse.js";

const chunk = (delta, finish_reason = null, usage) => ({ id: "chatcmpl-response-perf", model: "synthetic-model",
  choices: [{ index: 0, delta, finish_reason }], ...(usage ? { usage } : {}) });
const terminal = () => chunk({}, "tool_calls", { prompt_tokens: 31, completion_tokens: 19, total_tokens: 50 });
const call = (index, fn, id) => chunk({ tool_calls: [{ index, ...(id ? { id, type: "function" } : {}), function: fn }] });
const translate = (events, state = initState(FORMATS.CLAUDE)) => events.flatMap(event => translateResponse(FORMATS.OPENAI, FORMATS.CLAUDE, event, state));

class CountedTools extends Map {
  visits = 0;
  *[Symbol.iterator]() { for (const entry of super[Symbol.iterator]()) { this.visits++; yield entry; } }
}

function toolOutput(events) {
  const result = new Map();
  for (const event of events) {
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
      expect(result.has(event.index)).toBe(false);
      result.set(event.index, { ...event.content_block, args: [] });
    }
    if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
      expect(result.has(event.index)).toBe(true);
      result.get(event.index).args.push(event.delta.partial_json);
    }
  }
  return result;
}

describe("Claude response lowering work and fidelity", () => {
  it("does not revisit the entire completed opener set for fragmented parallel arguments", () => {
    const count = 128;
    const rounds = 32;
    const state = initState(FORMATS.CLAUDE);
    state.toolCalls = new CountedTools();
    state.declaredToolNames = new Set(["inspect"]);
    const originals = Array.from({ length: count }, (_, index) => JSON.stringify({ index, value: "x".repeat(256) }));
    const events = originals.map((_, index) => call(index, { name: "inspect" }, `call_${index}`));
    for (let round = 0; round < rounds; round++) for (let index = 0; index < count; index++) {
      const size = Math.ceil(originals[index].length / rounds);
      const args = originals[index].slice(round * size, (round + 1) * size);
      if (args) events.push(call(index, { arguments: args }));
    }
    events.push(terminal(), null);
    const output = translate(events, state);
    const tools = toolOutput(output);
    expect(tools.size).toBe(count);
    for (const [index, tool] of tools) {
      expect(tool.id).toBe(`call_${index}`);
      expect(tool.name).toBe("inspect");
      expect(tool.args.join("")).toBe(originals[index]);
    }
    expect(output.filter(event => event.type === "content_block_stop")).toHaveLength(count);
    expect(output.filter(event => event.type === "message_stop")).toHaveLength(1);
    expect(output.at(-2)).toMatchObject({ type: "message_delta", usage: { input_tokens: 31, output_tokens: 19 } });
    expect(state.toolCalls.visits).toBeLessThan(count * (rounds + 4));
    expect(state.toolArgBuffers?.size || 0).toBe(0);
  });

  it("preserves blocked fragmented names, nonnumeric arrival order, opaque IDs, Read sanitation and interleaved text", () => {
    const state = initState(FORMATS.CLAUDE);
    state.declaredToolNames = new Set(["read", "read_file", "inspect", "Read"]);
    const signedId = `call_alpha_TSIG_${Buffer.from("synthetic").toString("base64url")}`;
    const output = [];
    const push = event => { const values = translate([event], state); output.push(...values); return values; };
    expect(push(call(7, { name: "read" }, signedId)).some(event => event.type === "content_block_start")).toBe(false);
    expect(push(call(2, { name: "inspect", arguments: '{"step":' }, "call_beta")).some(event => event.type === "content_block_start")).toBe(false);
    push(chunk({ reasoning_content: "private reasoning" }));
    push(chunk({ content: "visible text" }));
    const released = push(call(7, { name: "_file", arguments: '{"path":' }));
    expect(released.filter(event => event.type === "content_block_start").map(event => event.content_block.id)).toEqual([signedId, "call_beta"]);
    const batch = push(chunk({ tool_calls: [{ index: 2, function: { arguments: "1}" } }, { index: 7, function: { arguments: '"/synthetic"}' } }] }));
    expect(batch.filter(event => event.delta?.type === "input_json_delta").map(event => event.index)).toEqual([0, 1]);
    push(call(10, { name: "Read", arguments: '{"file_path":"/synthetic/a.txt","limit":"9999","offset":"-3","pages":"1-2"}' }, "call_read"));
    expect(output.filter(event => event.delta?.type === "input_json_delta" && event.index === 4)).toHaveLength(0);
    push(terminal()); push(null);
    const tools = [...toolOutput(output).values()];
    expect(tools.map(tool => tool.id)).toEqual([signedId, "call_beta", "call_read"]);
    expect(tools.map(tool => tool.name)).toEqual(["read_file", "inspect", "Read"]);
    expect(tools[0].args.join("")).toBe('{"path":"/synthetic"}');
    expect(tools[1].args.join("")).toBe('{"step":1}');
    expect(JSON.parse(tools[2].args.join(""))).toEqual({ file_path: "/synthetic/a.txt", limit: 2000, offset: 0 });
    expect(output.filter(event => event.delta?.type === "text_delta").map(event => event.delta.text).join("")).toBe("visible text");
    expect(output.filter(event => event.delta?.type === "thinking_delta").map(event => event.delta.thinking).join("")).toBe("private reasoning");
    expect(output.filter(event => event.type === "message_stop")).toHaveLength(1);
    expect(state.toolArgBuffers.size).toBe(0);
  });

  it.each([1, 7, 1024])("keeps native Claude framing and exact arguments across %s-byte upstream chunks", async fragmentSize => {
    const args = JSON.stringify({ path: "/synthetic/\u6d4b\u8bd5", value: "x".repeat(2048) });
    const inputEvents = [call(0, { name: "inspect" }, "call_sse"), call(0, { arguments: args.slice(0, 61) }), call(0, { arguments: args.slice(61) }), terminal()];
    const bytes = new TextEncoder().encode(inputEvents.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n");
    let offset = 0;
    const input = new ReadableStream({ pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.subarray(offset, offset + fragmentSize));
      offset = Math.min(bytes.length, offset + fragmentSize);
    } });
    const reader = input.pipeThrough(createSSEStream({ targetFormat: FORMATS.OPENAI, sourceFormat: FORMATS.CLAUDE,
      body: { tools: [{ type: "function", function: { name: "inspect" } }] } })).getReader();
    const parser = createSSEParser();
    const events = [];
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        for (const event of parser.feed(result.value)) {
          expect(event.data).not.toBe("[DONE]");
          const payload = parseSSEEvent(event);
          expect(event.event).toBe(payload.type);
          events.push(payload);
        }
      }
    } finally { reader.releaseLock(); }
    const tools = [...toolOutput(events).values()];
    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe("call_sse");
    expect(tools[0].args.join("")).toBe(args);
    expect(events[0].type).toBe("message_start");
    expect(events.at(-1).type).toBe("message_stop");
  });
});
