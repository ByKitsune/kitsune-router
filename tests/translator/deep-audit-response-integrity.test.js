import { describe, expect, it } from "vitest";
import { initState, translateResponse } from "../../open-sse/translator/index.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
import { createSSETransformStreamWithLogger } from "../../open-sse/utils/stream.js";
import { canonicalizeUsage } from "../../open-sse/utils/usageTracking.js";
import { calculateCostFromTokens } from "../../open-sse/providers/pricing.js";

function translateAll(format, records, client = F.OPENAI) {
  const state = initState(client);
  const chunks = records.flatMap(record => translateResponse(format, client, record, state));
  chunks.push(...translateResponse(format, client, null, state));
  return { chunks, state };
}

async function streamRecords(format, records) {
  const wire = records.map(record => format === F.OLLAMA ? JSON.stringify(record) + "\n"
    : `event: ${record.type}\ndata: ${JSON.stringify(record)}\n\n`).join("");
  const upstream = new ReadableStream({ start(controller) {
    const bytes = new TextEncoder().encode(wire);
    for (let offset = 0; offset < bytes.length; offset += 13) controller.enqueue(bytes.subarray(offset, offset + 13));
    controller.close();
  } });
  const text = await new Response(upstream.pipeThrough(
    createSSETransformStreamWithLogger(format, F.OPENAI, "deep-audit", null, null, "fixture-model"),
  )).text();
  return text.split("\n").filter(line => line.startsWith("data: ") && line !== "data: [DONE]")
    .map(line => JSON.parse(line.slice(6)));
}

const claudeStart = usage => ({ type: "message_start", message: {
  id: "msg_deep_audit", model: "fixture-claude", role: "assistant", type: "message", content: [],
  usage: usage ?? { input_tokens: 11, output_tokens: 0 },
} });
const claudeFinish = usage => ({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: usage ?? { output_tokens: 3 } });
const toolStart = input => ({ type: "content_block_start", index: 0,
  content_block: { type: "tool_use", id: "toolu_keep_exact", name: "clock", input } });
const toolStop = { type: "content_block_stop", index: 0 };
const toolArgs = chunks => chunks.flatMap(chunk => chunk.choices ?? [])
  .flatMap(choice => choice.delta?.tool_calls ?? []).map(call => call.function?.arguments ?? "").join("");

describe("Claude response tool input integrity on public translation routes", () => {
  it.each(["public translator", "actual SSE pipeline"])("retains an empty argument object through %s", async route => {
    const records = [claudeStart(), toolStart({}), toolStop, claudeFinish(), { type: "message_stop" }];
    const chunks = route === "public translator" ? translateAll(F.CLAUDE, records).chunks : await streamRecords(F.CLAUDE, records);
    expect(toolArgs(chunks)).toBe("{}");
    expect(chunks.flatMap(chunk => chunk.choices ?? []).flatMap(choice => choice.delta?.tool_calls ?? [])
      .filter(call => call.id).map(call => call.id)).toEqual(["toolu_keep_exact"]);
    expect(chunks.some(chunk => chunk.choices?.[0]?.finish_reason === "tool_calls")).toBe(true);
  });

  it("does not prepend the empty snapshot when real input deltas arrive", () => {
    const input = '{ "city": "München", "flags": [false, 0] }';
    const { chunks } = translateAll(F.CLAUDE, [claudeStart(), toolStart({}),
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: input.slice(0, 17) } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: input.slice(17) } },
      toolStop, claudeFinish(), { type: "message_stop" },
    ]);
    expect(toolArgs(chunks)).toBe(input);
  });

  it("emits one complete nonempty input snapshot despite stop, message terminal and EOF", () => {
    const input = { nested: { empty: {}, value: false }, count: 0 };
    const { chunks } = translateAll(F.CLAUDE, [claudeStart(), toolStart(input), toolStop, claudeFinish(), { type: "message_stop" }]);
    expect(toolArgs(chunks)).toBe(JSON.stringify(input));
  });

  it("preserves an empty input object through the Claude to Responses bridge", () => {
    const { chunks } = translateAll(F.CLAUDE, [claudeStart(), toolStart({}), toolStop, claudeFinish(), { type: "message_stop" }], F.OPENAI_RESPONSES);
    const completed = chunks.find(chunk => chunk.event === "response.completed");
    expect(completed?.data.response.output).toContainEqual(expect.objectContaining({
      type: "function_call", call_id: "toolu_keep_exact", name: "clock", arguments: "{}",
    }));
  });
});

describe("Ollama NDJSON response integrity", () => {
  it.each(["public translator", "actual NDJSON pipeline"])("retains terminal record content and reasoning through %s", async route => {
    const records = [{ model: "fixture-ollama", message: { role: "assistant", content: "Final café", thinking: "Retained reasoning" },
      done: true, done_reason: "stop", prompt_eval_count: 11, eval_count: 3 }];
    const chunks = route === "public translator" ? translateAll(F.OLLAMA, records).chunks : await streamRecords(F.OLLAMA, records);
    expect(chunks.map(chunk => chunk.choices?.[0]?.delta?.content ?? "").join("")).toBe("Final café");
    expect(chunks.map(chunk => chunk.choices?.[0]?.delta?.reasoning_content ?? "").join("")).toBe("Retained reasoning");
    expect(chunks.at(-1).choices[0].finish_reason).toBe("stop");
    expect(chunks.at(-1).usage).toEqual({ prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 });
  });

  it("does not turn an explicit empty tool array into a tool-call finish", () => {
    const { chunks } = translateAll(F.OLLAMA, [
      { model: "fixture", message: { role: "assistant", content: "ordinary answer", tool_calls: [] }, done: false },
      { model: "fixture", done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 2 },
    ]);
    expect(chunks.at(-1).choices[0].finish_reason).toBe("stop");
    expect(chunks.flatMap(chunk => chunk.choices ?? []).some(choice => Object.hasOwn(choice.delta ?? {}, "tool_calls"))).toBe(false);
  });

  it("retains complete tool calls in a terminal record", () => {
    const { chunks } = translateAll(F.OLLAMA, [{ model: "fixture", message: { role: "assistant", content: "", tool_calls: [
      { id: "native_exact_id", function: { name: "clock", arguments: {} } },
    ] }, done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 2 }]);
    expect(chunks.flatMap(chunk => chunk.choices ?? []).flatMap(choice => choice.delta?.tool_calls ?? [])).toEqual([
      { id: "native_exact_id", index: 0, type: "function", function: { name: "clock", arguments: "{}" } },
    ]);
    expect(chunks.at(-1).choices[0].finish_reason).toBe("tool_calls");
  });

  it("assigns distinct Chat indices to complete unindexed calls in separate native records", () => {
    const { chunks } = translateAll(F.OLLAMA, [
      { model: "fixture", message: { role: "assistant", tool_calls: [{ function: { name: "first", arguments: { value: 1 } } }] }, done: false },
      { model: "fixture", message: { role: "assistant", tool_calls: [{ function: { name: "second", arguments: { value: 2 } } }] }, done: false },
      { model: "fixture", done: true, done_reason: "stop" },
    ]);
    const calls = chunks.flatMap(chunk => chunk.choices ?? []).flatMap(choice => choice.delta?.tool_calls ?? []);
    expect(calls.map(call => call.index)).toEqual([0, 1]);
    expect(new Set(calls.map(call => call.id)).size).toBe(2);
    expect(calls.map(call => JSON.parse(call.function.arguments))).toEqual([{ value: 1 }, { value: 2 }]);
  });
});

describe("Claude stream usage integrity before accounting", () => {
  const rates = { input: 3, output: 15, cached: 0.3, cache_creation: 3.75 };
  it("retains valid numeric string counters rather than pricing them as zero", () => {
    const { chunks, state } = translateAll(F.CLAUDE, [
      claudeStart({ input_tokens: "11", output_tokens: 0, cache_read_input_tokens: "7", cache_creation_input_tokens: "2" }),
      claudeFinish({ output_tokens: "3" }), { type: "message_stop" },
    ]);
    expect(chunks.at(-1).usage).toEqual({ prompt_tokens: 20, completion_tokens: 3, total_tokens: 23,
      prompt_tokens_details: { cached_tokens: 7, cache_creation_tokens: 2 } });
    expect(canonicalizeUsage(state.usage)).toMatchObject({ prompt_tokens: 20, completion_tokens: 3, cached_tokens: 7 });
    expect(calculateCostFromTokens(canonicalizeUsage(state.usage), rates)).toBeGreaterThan(0);
  });

  it.each([null, true, "bad", [], {}, -1, 0.5])("keeps invalid observed input %j unpriceable", value => {
    const { chunks, state } = translateAll(F.CLAUDE, [claudeStart({ input_tokens: value, output_tokens: 0 }),
      claudeFinish({ output_tokens: 3 }), { type: "message_stop" }]);
    expect(chunks.at(-1).usage.usage_invalid).toBe(true);
    expect(canonicalizeUsage(state.usage).usage_invalid).toBe(true);
    expect(calculateCostFromTokens(canonicalizeUsage(state.usage), rates)).toBeNull();
  });

  it.each([null, true, "bad", {}, -1])("retains invalid cache creation %j instead of reporting a free cache write", value => {
    const { state } = translateAll(F.CLAUDE, [claudeStart({ input_tokens: 11, output_tokens: 0, cache_creation_input_tokens: value }),
      claudeFinish({ output_tokens: 3 }), { type: "message_stop" }]);
    expect(canonicalizeUsage(state.usage).usage_invalid).toBe(true);
    expect(calculateCostFromTokens(canonicalizeUsage(state.usage), rates)).toBeNull();
  });

  it("keeps the last observed output count when a later partial usage update omits it", () => {
    const { chunks } = translateAll(F.CLAUDE, [claudeStart({ input_tokens: 11, output_tokens: 0 }),
      { type: "message_delta", delta: {}, usage: { output_tokens: 3 } },
      claudeFinish({ input_tokens: 12 }), { type: "message_stop" }]);
    expect(chunks.at(-1).usage).toMatchObject({ prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 });
  });
});
