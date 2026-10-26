import { describe, expect, it } from "vitest";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { initState, translateRequest, translateResponse } from "../../open-sse/translator/index.js";
import { buildToolCallId, cacheSignature, getCachedSignature, splitToolCallId } from "../../open-sse/translator/concerns/thoughtSignature.js";

const chat = (delta, finish_reason = null, usage) => ({ id: "chatcmpl-modernize-contract", model: "contract-model", choices: [{ index: 0, delta, finish_reason }], ...(usage ? { usage } : {}) });
const stateFor = (source, target) => ({ ...initState(source), sourceFormat: source, targetFormat: target });
const input = events => events.filter(event => event.delta?.type === "input_json_delta").map(event => event.delta.partial_json);
const signature = Buffer.from("request-local signed Gemini invocation").toString("base64");

describe("stream responsiveness and usage composition", () => {
  it("emits ordinary arguments immediately after a usable immutable opener, before finish", () => {
    const state = stateFor(FORMATS.CLAUDE, FORMATS.OPENAI);
    const send = chunk => translateResponse(FORMATS.OPENAI, FORMATS.CLAUDE, chunk, state);
    expect(send(chat({ tool_calls: [{ index: 0, id: "a", function: { name: "look" } }] })).some(event => event.content_block?.type === "tool_use")).toBe(false);
    const first = send(chat({ tool_calls: [{ index: 0, function: { name: "up", arguments: '{"key":' } }] }));
    expect(first.map(event => event.type)).toEqual(["content_block_start", "content_block_delta"]);
    expect(first[0].content_block).toEqual({ type: "tool_use", id: "a", name: "lookup", input: {} });
    expect(input(first)).toEqual(['{"key":']);
    expect(input(send(chat({ tool_calls: [{ index: 0, function: { arguments: '"value"}' } }] })))).toEqual(['"value"}']);
    expect(input(send(chat({}, "tool_calls")))).toEqual([]);
    expect(send({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } }).map(event => event.type)).toEqual(["message_delta", "message_stop"]);
    expect(send(null)).toEqual([]);
  });

  it("retains Read sanitizer buffering while other interleaved calls stream literally", () => {
    const state = stateFor(FORMATS.CLAUDE, FORMATS.OPENAI);
    const send = chunk => translateResponse(FORMATS.OPENAI, FORMATS.CLAUDE, chunk, state);
    const first = send(chat({ tool_calls: [
      { index: 0, id: "read", function: { name: "Read", arguments: '{"file_path":"note.txt","pages":"",' } },
      { index: 1, id: "search", function: { name: "search", arguments: '{"q":' } },
    ] }));
    expect(input(first)).toEqual(['{"q":']);
    expect(input(send(chat({ tool_calls: [
      { index: 0, function: { arguments: '"limit":"9000","offset":-1}' } },
      { index: 1, function: { arguments: '"a"}' } },
    ] })))).toEqual(['"a"}']);
    const last = send(chat({}, "tool_calls", { prompt_tokens: 1, completion_tokens: 2 }));
    expect(input(last)).toEqual(['{"file_path":"note.txt","limit":2000,"offset":0}']);
    expect(input(send(chat({}, "tool_calls", { prompt_tokens: 1, completion_tokens: 2 })))).toEqual([]);
  });

  it.each([FORMATS.OPENAI, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES])("retains a separate Gemini usage trailer for %s", source => {
    const state = stateFor(source, FORMATS.GEMINI);
    const send = chunk => translateResponse(FORMATS.GEMINI, source, chunk, state);
    const events = send({ responseId: "gemini-contract", modelVersion: "gemini-2.5-flash", candidates: [{ content: { role: "model", parts: [{ thought: true, text: "plan" }, { text: "answer" }] }, finishReason: "STOP" }] });
    if (source === FORMATS.OPENAI_RESPONSES) expect(events.some(event => event.event === "response.completed")).toBe(false);
    if (source === FORMATS.CLAUDE) expect(events.some(event => event.type === "message_stop")).toBe(false);
    events.push(...send({ usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, thoughtsTokenCount: 6, totalTokenCount: 21, cachedContentTokenCount: 4 } }));
    events.push(...send(null));
    expect(source === FORMATS.CLAUDE ? state.claudeUsage.output_tokens : state.usage.prompt_tokens).toBe(source === FORMATS.CLAUDE ? 9 : 12);
    if (source === FORMATS.OPENAI) {
      expect(events.at(-1).choices).toEqual([]);
      expect(events.at(-1).usage).toMatchObject({ prompt_tokens: 12, completion_tokens: 9, total_tokens: 21, prompt_tokens_details: { cached_tokens: 4 }, completion_tokens_details: { reasoning_tokens: 6 } });
    } else if (source === FORMATS.OPENAI_RESPONSES) {
      const completed = events.filter(event => event.event === "response.completed");
      expect(completed).toHaveLength(1);
      expect(completed[0].data.response.usage).toMatchObject({ input_tokens: 12, output_tokens: 9, total_tokens: 21, output_tokens_details: { reasoning_tokens: 6 } });
      expect(completed[0].data.response.output.map(item => item.type)).toEqual(["reasoning", "message"]);
      expect(completed[0].data.response.output[0].summary[0].text).toBe("plan");
      expect(completed[0].data.response.output[1].content[0].text).toBe("answer");
    } else {
      expect(events.filter(event => event.type === "message_stop")).toHaveLength(1);
      expect(events.find(event => event.type === "message_delta").usage).toMatchObject({ input_tokens: 8, output_tokens: 9, cache_read_input_tokens: 4, reasoning_tokens: 6 });
    }
  });

  it.each([FORMATS.GEMINI, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES])("EOF without native terminal never fabricates Responses success from %s", target => {
    const state = stateFor(FORMATS.OPENAI_RESPONSES, target);
    const chunk = target === FORMATS.GEMINI ? { candidates: [{ content: { role: "model", parts: [{ text: "partial" }] } }] }
      : target === FORMATS.CLAUDE ? { type: "message_start", message: { id: "msg_partial", model: "contract", usage: { input_tokens: 1 } } }
        : { type: "response.output_text.delta", delta: "partial" };
    translateResponse(target, FORMATS.OPENAI_RESPONSES, chunk, state);
    const flushed = translateResponse(target, FORMATS.OPENAI_RESPONSES, null, state).filter(Boolean);
    expect(flushed.some(event => event.event === "response.completed" || event.type === "response.completed")).toBe(false);
  });
});

describe("Gemini ingress identity, native names and signature isolation", () => {
  it.each([FORMATS.GEMINI, FORMATS.ANTIGRAVITY])("retains signed and repeated-name native %s calls and FIFO replies", source => {
    const request = { contents: [
      { role: "model", parts: [
        { thoughtSignature: signature, functionCall: { id: "call_native", name: "lookup", args: { key: "signed" } } },
        { functionCall: { name: "lookup", args: { key: "first" } } },
        { functionCall: { name: "lookup", args: { key: "second" } } },
      ] },
      { role: "user", parts: [
        { functionResponse: { id: "call_native", name: "lookup", response: { value: "signed" } } },
        { functionResponse: { name: "lookup", response: { value: "first" } } },
        { functionResponse: { name: "lookup", response: { value: "second" } } },
      ] },
    ] };
    const body = source === FORMATS.ANTIGRAVITY ? { request } : request;
    const before = structuredClone(body);
    const out = translateRequest(source, FORMATS.OPENAI, "gemini-2.5-flash", body, false);
    const calls = out.messages.find(message => message.tool_calls).tool_calls;
    expect(new Set(calls.map(call => call.id)).size).toBe(3);
    expect(splitToolCallId(calls[0].id)).toEqual({ rawId: "call_native", thoughtSignature: signature });
    expect(out.messages.filter(message => message.role === "tool").map(message => message.tool_call_id)).toEqual(calls.map(call => call.id));
    const replay = translateRequest(FORMATS.OPENAI, FORMATS.GEMINI, "gemini-2.5-flash", out, false);
    const nativeCalls = replay.contents.flatMap(content => content.parts).filter(part => part.functionCall);
    expect(nativeCalls[0].thoughtSignature).toBe(signature);
    expect(nativeCalls.map(part => part.functionCall.args)).toEqual([{ key: "signed" }, { key: "first" }, { key: "second" }]);
    expect(body).toEqual(before);
  });

  it("compresses and restores native Gemini names without changing opaque fields or functionResponse ownership", () => {
    const name = `mcp_${"long_name_".repeat(12)}`;
    const body = { model: "gemini-2.5-flash", tools: [{ functionDeclarations: [{ name, parametersJsonSchema: { type: "object", properties: {} } }] }],
      contents: [{ role: "model", parts: [{ thoughtSignature: signature, functionCall: { id: "a", name, args: {} } }] },
        { role: "user", parts: [{ functionResponse: { id: "a", name, response: { result: "ok" } } }] }],
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [name] } } };
    const out = translateRequest(FORMATS.GEMINI, FORMATS.GEMINI, body.model, body, true);
    const wire = out.tools[0].functionDeclarations[0].name;
    expect(wire.length).toBeLessThanOrEqual(64);
    expect(out.contents.map(content => content.parts[0].functionCall?.name || content.parts[0].functionResponse.name)).toEqual([wire, wire]);
    expect(out.toolConfig.functionCallingConfig.allowedFunctionNames).toEqual([wire]);
    const chunk = { candidates: [{ content: { parts: [{ thoughtSignature: signature, functionCall: { id: "b", name: wire, args: {} }, opaque: { tool: "native" } }] }, finishReason: "STOP", opaque: { candidate: "native" } }], opaque: { response: "native" } };
    const restored = translateResponse(FORMATS.GEMINI, FORMATS.GEMINI, chunk, { toolNameMap: out._toolNameMap })[0];
    expect(restored.candidates[0].content.parts[0]).toEqual({ ...chunk.candidates[0].content.parts[0], functionCall: { id: "b", name, args: {} } });
    expect(restored.opaque).toBe(chunk.opaque);
    expect(chunk.candidates[0].content.parts[0].functionCall.name).toBe(wire);
  });

  it("does not turn gateway fallback signatures into opaque native identity during replay", () => {
    const source = { messages: [
      { role: "assistant", content: null, tool_calls: [{ id: "call_original", type: "function", function: { name: "lookup", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_original", content: "ok" },
    ] };
    const native = translateRequest(FORMATS.OPENAI, FORMATS.GEMINI, "gemini-2.5-flash", source, false);
    expect(native.contents.flatMap(turn => turn.parts).find(part => part.functionCall).thoughtSignature).toBeTruthy();
    const replay = translateRequest(FORMATS.GEMINI, FORMATS.CLAUDE, "claude-sonnet-4.5", native, false);
    const parts = replay.messages.flatMap(turn => turn.content);
    expect(parts.find(part => part.type === "tool_use").id).toBe("call_original");
    expect(parts.find(part => part.type === "tool_result").tool_use_id).toBe("call_original");
  });

  it("never recovers a signature by raw ID from another request", () => {
    buildToolCallId("lookup", 0, signature, "call_1");
    cacheSignature("call_1", signature);
    expect(getCachedSignature("call_1")).toBeNull();
    expect(splitToolCallId("call_1").thoughtSignature).toBe("");
    const first = new Map();
    const second = new Map();
    const signed = buildToolCallId("lookup", 0, signature, "call_1", first);
    expect(splitToolCallId(signed).thoughtSignature).toBe(signature);
    expect(splitToolCallId("call_1_TS", first).thoughtSignature).toBe(signature);
    expect(splitToolCallId("call_1_TS", second).thoughtSignature).toBe("");
  });
});
