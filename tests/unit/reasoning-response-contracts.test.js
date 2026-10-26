import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
  saveRequestDetail: vi.fn(async () => {}),
  appendRequestLog: vi.fn(async () => {}),
  trackPendingRequest: vi.fn(),
}));
vi.mock("@/lib/usageDb.js", () => db);

import { FORMATS } from "../../open-sse/translator/formats.js";
import { handleNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { handleForcedSSEToJson } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { buildOnStreamComplete } from "../../open-sse/handlers/chatCore/streamingHandler.js";
import { createSSEStream } from "../../open-sse/utils/stream.js";

const usage = {
  prompt_tokens: 12, completion_tokens: 9, total_tokens: 21,
  completion_tokens_details: { reasoning_tokens: 6 },
};
const responsesUsage = {
  input_tokens: 12, output_tokens: 9, total_tokens: 21,
  output_tokens_details: { reasoning_tokens: 6 },
};
const geminiUsage = {
  promptTokenCount: 12, candidatesTokenCount: 3, thoughtsTokenCount: 6, totalTokenCount: 21,
};
const tool = { id: "call_contract", type: "function", function: { name: "lookup", arguments: '{"key":"value"}' } };
const frame = (value) => `data: ${JSON.stringify(value)}\n\n`;
const eventFrame = (value) => `event: ${value.type}\n${frame(value)}`;
const network = vi.fn(() => { throw new Error("Reasoning response contracts are offline"); });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

function context(providerResponse, client = FORMATS.OPENAI, target = FORMATS.OPENAI) {
  return {
    providerResponse, sourceFormat: client, targetFormat: target,
    provider: "offline-reasoning-contract", model: "contract-model",
    body: { messages: [], stream: false }, stream: false, requestStartTime: Date.now(),
    trackDone: vi.fn(), appendLog: vi.fn(),
    reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn() },
  };
}

function chatBody(fields) {
  return {
    id: "chatcmpl-reasoning-contract", object: "chat.completion", created: 1, model: "contract-model",
    choices: [{ index: 0, message: { role: "assistant", content: "Answer", ...fields, tool_calls: [tool] }, finish_reason: "tool_calls" }],
    usage,
  };
}

function chatChunk(delta, finish_reason = null) {
  return {
    id: "chatcmpl-reasoning-contract", object: "chat.completion.chunk", created: 1, model: "contract-model",
    choices: [{ index: 0, delta, finish_reason }],
  };
}

function chatWire(reasoningDeltas) {
  return [
    ...reasoningDeltas.map((delta) => chatChunk(delta)),
    chatChunk({ content: "Answer" }),
    chatChunk({ tool_calls: [{ index: 0, id: tool.id, type: "function", function: { name: "lookup", arguments: '{"key":' } }] }),
    chatChunk({ tool_calls: [{ index: 0, function: { arguments: '"value"}' } }] }),
    chatChunk({}, "tool_calls"),
    { choices: [], usage },
  ].map(frame).join("") + "data: [DONE]\n\n";
}

function sseResponse(wire) {
  return new Response(wire, { headers: { "content-type": "text/event-stream" } });
}

async function consumeJson(transport, client, target, payload, wire) {
  const result = transport === "native JSON"
    ? await handleNonStreamingResponse(context(Response.json(payload), client, target))
    : await handleForcedSSEToJson(context(sseResponse(wire), client, target));
  expect(result.success).toBe(true);
  expect(result.response.status).toBe(200);
  return result.response.json();
}

function assertStoredUsage() {
  expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
  expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({
    prompt_tokens: 12, completion_tokens: 9, total_tokens: 21, reasoning_tokens: 6,
  });
}

function assertJsonOutcome(json, client, reasoning = "First.Second.") {
  if (client === FORMATS.OPENAI) {
    expect(json.object).toBe("chat.completion");
    expect(json.choices).toEqual([{
      index: 0, finish_reason: "tool_calls",
      message: expect.objectContaining({ role: "assistant", content: "Answer", reasoning_content: reasoning, tool_calls: [tool] }),
    }]);
    expect(json.usage).toEqual(usage);
  } else if (client === FORMATS.CLAUDE) {
    expect(json).toMatchObject({ type: "message", role: "assistant", stop_reason: "tool_use", stop_sequence: null });
    expect(json.content).toEqual([
      { type: "thinking", thinking: reasoning },
      { type: "text", text: "Answer" },
      { type: "tool_use", id: tool.id, name: "lookup", input: { key: "value" } },
    ]);
    expect(json.usage).toEqual({ input_tokens: 12, output_tokens: 9 });
    expect(json).not.toHaveProperty("choices");
  } else {
    expect(json).toMatchObject({ object: "response", status: "completed", error: null });
    expect(json.output).toEqual([
      expect.objectContaining({ type: "reasoning", summary: [{ type: "summary_text", text: reasoning }] }),
      expect.objectContaining({ type: "message", role: "assistant", content: [expect.objectContaining({ type: "output_text", text: "Answer" })] }),
      expect.objectContaining({ type: "function_call", call_id: tool.id, name: "lookup", arguments: '{"key":"value"}' }),
    ]);
    expect(json.usage).toEqual(responsesUsage);
    expect(json).not.toHaveProperty("choices");
  }
}

async function consumeStream(wire, target, client, mode = "translate", persist = false) {
  const callbacks = persist ? buildOnStreamComplete({
    provider: "offline-reasoning-contract", model: "contract-model", body: { messages: [] },
    stream: true, requestStartTime: Date.now(),
  }) : null;
  const onComplete = vi.fn((...args) => callbacks?.onStreamComplete(...args));
  const transform = createSSEStream({
    mode, targetFormat: target, sourceFormat: client,
    provider: "offline-reasoning-contract", model: "contract-model", onStreamComplete: onComplete,
  });
  const text = await new Response(sseResponse(wire).body.pipeThrough(transform)).text();
  const events = text.split("\n").filter((line) => line.startsWith("data:") && line.slice(5).trim() !== "[DONE]")
    .map((line) => JSON.parse(line.slice(5).trim()));
  return { text, events, onComplete, snapshot: transform.getStreamSnapshot() };
}

function claudeBlocks(events) {
  const blocks = new Map();
  const stopped = new Set();
  for (const event of events) {
    if (event.type === "content_block_start") {
      expect(blocks.has(event.index)).toBe(false);
      blocks.set(event.index, { ...event.content_block });
    } else if (event.type === "content_block_delta") {
      expect(stopped.has(event.index)).toBe(false);
      const block = blocks.get(event.index);
      expect(block).toBeDefined();
      if (event.delta.type === "thinking_delta") block.thinking += event.delta.thinking;
      if (event.delta.type === "text_delta") block.text += event.delta.text;
      if (event.delta.type === "input_json_delta") block.arguments = (block.arguments || "") + event.delta.partial_json;
    } else if (event.type === "content_block_stop") {
      expect(stopped.has(event.index)).toBe(false);
      stopped.add(event.index);
    }
  }
  expect([...stopped].sort()).toEqual([...blocks.keys()].sort());
  return [...blocks.values()].map((block) => {
    if (block.type !== "tool_use") return block;
    return { type: "tool_use", id: block.id, name: block.name, input: JSON.parse(block.arguments || "{}") };
  });
}

function assertStreamOutcome(result, client, fields, reasoning = "First.Second.") {
  const { events, text } = result;
  if (client === FORMATS.OPENAI) {
    const deltas = events.flatMap((event) => event.choices || []).map((choice) => choice.delta);
    expect(deltas).toContainEqual(fields);
    expect(deltas.map((delta) => delta.content || "").join("")).toBe("Answer");
    expect(deltas.flatMap((delta) => delta.tool_calls || [])).toEqual([
      { index: 0, id: tool.id, type: "function", function: { name: "lookup", arguments: '{"key":' } },
      { index: 0, function: { arguments: '"value"}' } },
    ]);
    expect(events.filter((event) => event.choices?.[0]?.finish_reason).map((event) => event.choices[0].finish_reason)).toEqual(["tool_calls"]);
    expect(events.find((event) => event.choices?.length === 0)?.usage).toEqual(usage);
    expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
    expect(result.onComplete).toHaveBeenCalledTimes(1);
    expect(result.onComplete.mock.calls[0][0]).toEqual({
      thinking: reasoning, content: "Answer", toolCalls: [{ id: tool.id, name: "lookup", arguments: '{"key":"value"}' }],
    });
  } else if (client === FORMATS.CLAUDE) {
    expect(claudeBlocks(events)).toEqual([
      { type: "thinking", thinking: reasoning },
      { type: "text", text: "Answer" },
      { type: "tool_use", id: tool.id, name: "lookup", input: { key: "value" } },
    ]);
    expect(events.filter((event) => event.type === "message_stop")).toHaveLength(1);
    expect(events.filter((event) => event.type === "message_delta")).toEqual([
      expect.objectContaining({ delta: { stop_reason: "tool_use" }, usage: expect.objectContaining({ input_tokens: 12, output_tokens: 9 }) }),
    ]);
  } else if (client === FORMATS.OPENAI_RESPONSES) {
    const terminal = events.filter((event) => event.type === "response.completed");
    expect(terminal).toHaveLength(1);
    const output = terminal[0].response.output;
    expect(output.map((item) => item.type)).toEqual(["reasoning", "message", "function_call"]);
    expect(output[0].summary).toEqual([{ type: "summary_text", text: reasoning }]);
    expect(output[1].content).toEqual([expect.objectContaining({ type: "output_text", text: "Answer" })]);
    expect(output[2]).toMatchObject({ call_id: tool.id, name: "lookup", arguments: '{"key":"value"}' });
    expect(output).toEqual(events.filter((event) => event.type === "response.output_item.done").map((event) => event.item));
    expect(terminal[0].response.usage).toEqual(responsesUsage);
  } else {
    expect(events.flatMap((event) => event.response?.candidates?.[0]?.content?.parts || [])).toEqual([
      { thought: true, text: reasoning }, { text: "Answer" },
      { functionCall: { id: tool.id, name: "lookup", args: { key: "value" } } },
    ]);
    const terminal = events.filter((event) => event.response?.candidates?.[0]?.finishReason);
    expect(terminal).toHaveLength(1);
    expect(terminal[0].response.candidates[0].finishReason).toBe("STOP");
    expect(terminal[0].response.usageMetadata).toEqual(geminiUsage);
  }
}

// OpenRouter documents reasoning.summary.summary, not text/content:
// https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#reasoning-detail-types
const summaryFields = { reasoning_details: [
  { type: "reasoning.summary", summary: "First.", id: "rs_summary", index: 0 },
  { type: "reasoning.encrypted", data: "opaque-detail", summary: "must-not-be-readable", text: "must-not-be-readable" },
  { type: "reasoning.text", text: "Second.", signature: "opaque-signature", index: 1 },
] };
const nestedFields = { provider_specific_fields: {
  reasoning_content: "First.Second.",
  reasoning_details: [{ type: "reasoning.encrypted", data: "opaque-nested", text: "must-not-be-readable" }],
} };

for (const transport of ["native JSON", "forced Chat SSE"]) {
  describe(`${transport} documented summary details`, () => {
    it.each([FORMATS.OPENAI, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES])("returns readable summary details to %s separately from answer and tools", async (client) => {
      const json = await consumeJson(transport, client, FORMATS.OPENAI, chatBody(summaryFields), chatWire([summaryFields]));
      assertJsonOutcome(json, client);
      assertStoredUsage();
    });
  });
}

describe("nested provider-specific reasoning at JSON boundaries", () => {
  it.each([
    ["native JSON", FORMATS.OPENAI], ["native JSON", FORMATS.OPENAI_RESPONSES],
    ["forced Chat SSE", FORMATS.OPENAI], ["forced Chat SSE", FORMATS.CLAUDE], ["forced Chat SSE", FORMATS.OPENAI_RESPONSES],
  ])("%s exposes nested readable reasoning to %s without exposing opaque fields", async (transport, client) => {
    const json = await consumeJson(transport, client, FORMATS.OPENAI, chatBody(nestedFields), chatWire([nestedFields]));
    assertJsonOutcome(json, client);
    assertStoredUsage();
  });
});

describe.each([["documented summary", summaryFields], ["nested reasoning", nestedFields]])("%s through registered stream translators", (_name, fields) => {
  it.each([
    [FORMATS.OPENAI, "passthrough"], [FORMATS.CLAUDE, "translate"],
    [FORMATS.OPENAI_RESPONSES, "translate"], [FORMATS.ANTIGRAVITY, "translate"],
  ])("keeps readable reasoning, tools, terminal state and actual usage for %s", async (client, mode) => {
    const result = await consumeStream(chatWire([fields]), FORMATS.OPENAI, client, mode);
    assertStreamOutcome(result, client, fields);
  });
});

function responseBody(reasoningItem) {
  return {
    id: "resp_reasoning_contract", object: "response", status: "completed", model: "contract-model", error: null,
    output: [
      reasoningItem,
      { id: "msg_contract", type: "message", role: "assistant", content: [{ type: "output_text", text: "Answer", annotations: [] }] },
      { id: "fc_contract", type: "function_call", call_id: tool.id, name: "lookup", arguments: '{"key":"value"}' },
    ],
    usage: responsesUsage,
  };
}

function responsesWire(body, summaries = []) {
  return [
    { type: "response.created", response: { id: body.id, status: "in_progress" } },
    ...summaries,
    ...body.output.map((item, output_index) => ({ type: "response.output_item.done", item, output_index })),
    { type: "response.completed", response: body },
  ].map(eventFrame).join("");
}

describe("Responses readable reasoning content arrays", () => {
  it.each([
    ["native JSON", FORMATS.OPENAI], ["native JSON", FORMATS.CLAUDE],
    ["forced Responses SSE", FORMATS.OPENAI], ["forced Responses SSE", FORMATS.CLAUDE],
  ])("%s preserves reasoning_text for %s without decrypting continuity", async (transport, client) => {
    const body = responseBody({
      id: "rs_content", type: "reasoning", summary: [], encrypted_content: "opaque-response-continuity",
      content: [{ type: "reasoning_text", text: "First." }, { type: "reasoning_text", text: "Second." }],
    });
    const json = await consumeJson(transport, client, FORMATS.OPENAI_RESPONSES, body, responsesWire(body));
    assertJsonOutcome(json, client);
    assertStoredUsage();
  });
});

describe("Responses summary snapshots in streaming translation", () => {
  it.each([FORMATS.OPENAI, FORMATS.CLAUDE])("fills missing summary deltas from done items once for %s", async (client) => {
    const first = { id: "rs_first", type: "reasoning", summary: [{ type: "summary_text", text: "First." }], encrypted_content: "opaque-first" };
    const second = { id: "rs_second", type: "reasoning", summary: [{ type: "summary_text", text: "Second." }], encrypted_content: "opaque-second" };
    const body = responseBody(first);
    body.output.splice(1, 0, second);
    const events = [
      { type: "response.created", response: { id: body.id } },
      { type: "response.reasoning_summary_text.delta", item_id: first.id, output_index: 0, summary_index: 0, delta: "First." },
      { type: "response.reasoning_summary_text.done", item_id: first.id, output_index: 0, summary_index: 0, text: "First." },
      { type: "response.output_item.done", item: first, output_index: 0 },
      { type: "response.reasoning_summary_part.done", item_id: second.id, output_index: 1, summary_index: 0, part: { type: "summary_text", text: "Second." } },
      { type: "response.output_item.done", item: second, output_index: 1 },
      { type: "response.output_text.delta", item_id: "msg_contract", output_index: 2, content_index: 0, delta: "Answer" },
      { type: "response.output_item.added", output_index: 3, item: { type: "function_call", call_id: tool.id, name: "lookup" } },
      { type: "response.function_call_arguments.delta", output_index: 3, delta: '{"key":' },
      { type: "response.function_call_arguments.delta", output_index: 3, delta: '"value"}' },
      { type: "response.output_item.done", output_index: 3, item: body.output[3] },
      { type: "response.completed", response: body },
    ];
    const result = await consumeStream(events.map(eventFrame).join(""), FORMATS.OPENAI_RESPONSES, client);
    if (client === FORMATS.OPENAI) {
      const deltas = result.events.flatMap((event) => event.choices || []).map((choice) => choice.delta);
      expect(deltas.map((delta) => delta.reasoning_content || "").join("")).toBe("First.Second.");
      expect(deltas.map((delta) => delta.content || "").join("")).toBe("Answer");
      expect(result.events.filter((event) => event.choices?.[0]?.finish_reason)).toHaveLength(1);
      expect(result.events.find((event) => event.choices?.[0]?.finish_reason)).toMatchObject({
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage,
      });
    } else {
      expect(claudeBlocks(result.events)).toEqual([
        { type: "thinking", thinking: "First.Second." }, { type: "text", text: "Answer" },
        { type: "tool_use", id: tool.id, name: "lookup", input: { key: "value" } },
      ]);
      expect(result.events.filter((event) => event.type === "message_stop")).toHaveLength(1);
    }
    expect(result.text).not.toContain("opaque-first");
    expect(result.text).not.toContain("opaque-second");
  });
});

describe("Responses raw reasoning SSE", () => {
  it.each([FORMATS.OPENAI, FORMATS.CLAUDE])("keeps reasoning_text deltas once and preserves incomplete terminal usage for %s", async (client) => {
    const body = responseBody({
      id: "rs_raw", type: "reasoning", summary: [], encrypted_content: "opaque-raw-continuity",
      content: [{ type: "reasoning_text", text: "First.Second." }],
    });
    body.output = body.output.slice(0, 2);
    body.status = "incomplete";
    body.incomplete_details = { reason: "max_output_tokens" };
    const events = [
      { type: "response.created", response: { id: body.id } },
      { type: "response.reasoning_text.delta", item_id: "rs_raw", output_index: 0, content_index: 0, delta: "First." },
      { type: "response.reasoning_text.delta", item_id: "rs_raw", output_index: 0, content_index: 0, delta: "Second." },
      { type: "response.reasoning_text.done", item_id: "rs_raw", output_index: 0, content_index: 0, text: "First.Second." },
      { type: "response.output_item.done", output_index: 0, item: body.output[0] },
      { type: "response.output_text.delta", item_id: "msg_contract", output_index: 1, content_index: 0, delta: "Answer" },
      { type: "response.output_item.done", output_index: 1, item: body.output[1] },
      { type: "response.incomplete", response: body },
    ];
    const result = await consumeStream(events.map(eventFrame).join(""), FORMATS.OPENAI_RESPONSES, client);
    if (client === FORMATS.OPENAI) {
      const deltas = result.events.flatMap((event) => event.choices || []).map((choice) => choice.delta);
      expect(deltas.map((delta) => delta.reasoning_content || "").join("")).toBe("First.Second.");
      expect(deltas.map((delta) => delta.content || "").join("")).toBe("Answer");
      expect(result.events.filter((event) => event.choices?.[0]?.finish_reason)).toEqual([
        expect.objectContaining({ choices: [{ index: 0, delta: {}, finish_reason: "length" }], usage }),
      ]);
    } else {
      expect(claudeBlocks(result.events)).toEqual([
        { type: "thinking", thinking: "First.Second." }, { type: "text", text: "Answer" },
      ]);
      expect(result.events.filter((event) => event.type === "message_delta")).toEqual([
        expect.objectContaining({ delta: { stop_reason: "max_tokens" }, usage: expect.objectContaining({ input_tokens: 12, output_tokens: 9 }) }),
      ]);
      expect(result.events.filter((event) => event.type === "message_stop")).toHaveLength(1);
    }
    expect(result.text).not.toContain("opaque-raw-continuity");
  });
});

const claudeEvents = [
  { type: "message_start", message: { id: "msg_contract", type: "message", role: "assistant", model: "contract-model", content: [], usage: { input_tokens: 12, output_tokens: 0 } } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "First." } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Second." } },
  { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "opaque-claude-signature" } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "redacted_thinking", data: "opaque-claude-redacted" } },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "Answer" } },
  { type: "content_block_stop", index: 2 },
  { type: "content_block_start", index: 3, content_block: { type: "tool_use", id: tool.id, name: "lookup", input: {} } },
  { type: "content_block_delta", index: 3, delta: { type: "input_json_delta", partial_json: '{"key":"value"}' } },
  { type: "content_block_stop", index: 3 },
  { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } },
  { type: "message_stop" },
];
const geminiEvents = [
  { response: { responseId: "gemini_contract", modelVersion: "contract-model", candidates: [{ content: { role: "model", parts: [{ thought: true, text: "First.", thoughtSignature: "c2lnbmF0dXJl" }] } }] } },
  { response: { candidates: [{ content: { role: "model", parts: [{ thought: true, text: "Second." }, { text: "Answer" }, { functionCall: { name: "lookup", args: { key: "value" } } }] } }] } },
  { response: { candidates: [{ finishReason: "STOP" }], usageMetadata: geminiUsage } },
];

describe("native provider SSE consumed as JSON", () => {
  it.each([
    ["forced handler", FORMATS.CLAUDE, claudeEvents.map(eventFrame).join("")],
    ["native handler", FORMATS.CLAUDE, claudeEvents.map(eventFrame).join("")],
    ["forced handler", FORMATS.GEMINI_CLI, geminiEvents.map(frame).join("")],
    ["native handler", FORMATS.GEMINI_CLI, geminiEvents.map(frame).join("")],
  ])("%s decodes %s thinking and actual usage instead of treating native events as empty Chat deltas", async (handler, target, wire) => {
    const ctx = context(sseResponse(wire), FORMATS.OPENAI, target);
    const result = handler === "forced handler" ? await handleForcedSSEToJson(ctx) : await handleNonStreamingResponse(ctx);
    expect(result.success).toBe(true);
    const json = await result.response.json();
    expect(json.choices).toEqual([{
      index: 0, finish_reason: "tool_calls", message: expect.objectContaining({
        role: "assistant", content: "Answer", reasoning_content: "First.Second.",
        tool_calls: target === FORMATS.CLAUDE ? [tool] : [expect.objectContaining({ type: "function", function: { name: "lookup", arguments: '{"key":"value"}' } })],
      }),
    }]);
    expect(json.usage).toEqual(target === FORMATS.CLAUDE ? { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 } : usage);
    expect(JSON.stringify(json.choices[0].message)).not.toContain("opaque-claude");
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 });
  });
});

describe("Gemini signed tool identity", () => {
  it("preserves the native call id and opaque signature equally in JSON and registered SSE conversion", async () => {
    const signature = "c2lnbmF0dXJl";
    const payload = {
      responseId: "gemini_signed_contract", modelVersion: "contract-model",
      candidates: [{ content: { role: "model", parts: [
        { thought: true, text: "First.Second." }, { text: "Answer" },
        { thoughtSignature: signature, functionCall: { id: "call_native", name: "lookup", args: { key: "value" } } },
      ] }, finishReason: "STOP" }], usageMetadata: geminiUsage,
    };
    const native = await consumeJson("native JSON", FORMATS.OPENAI, FORMATS.GEMINI, payload);
    const streamed = await consumeStream(frame(payload), FORMATS.GEMINI, FORMATS.OPENAI);
    const expectedId = `call_native_TSIG_${Buffer.from(signature, "utf8").toString("base64url")}`;
    expect(native.choices[0].message.tool_calls).toEqual([{ ...tool, id: expectedId }]);
    const calls = streamed.events.flatMap((event) => event.choices?.[0]?.delta?.tool_calls || []);
    expect(calls).toEqual([{ ...tool, id: expectedId, index: 0 }]);
    expect(streamed.events.map((event) => event.choices?.[0]?.delta?.reasoning_content || "").join("")).toBe("First.Second.");
    expect(streamed.events.map((event) => event.choices?.[0]?.delta?.content || "").join("")).toBe("Answer");
    expect(streamed.events.filter((event) => event.choices?.[0]?.finish_reason)).toHaveLength(1);
    expect(streamed.events.at(-1).usage).toEqual(usage);
  });
});

describe("native Gemini client reasoning output", () => {
  const parts = [
    { thought: true, text: "First.Second." }, { text: "Answer" },
    { functionCall: { id: tool.id, name: "lookup", args: { key: "value" } } },
  ];
  it.each(["native JSON", "forced Chat SSE"])("%s returns native thought parts, not Chat choices", async (transport) => {
    const fields = { reasoning_content: "First.Second." };
    const json = await consumeJson(transport, FORMATS.GEMINI, FORMATS.OPENAI, chatBody(fields), chatWire([fields]));
    expect(json).toMatchObject({
      candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }], usageMetadata: geminiUsage,
    });
    expect(json).not.toHaveProperty("choices");
    assertStoredUsage();
  });
  it("registered SSE translation emits native thought parts and counts thought tokens only once", async () => {
    const result = await consumeStream(chatWire([{ reasoning_content: "First.Second." }]), FORMATS.OPENAI, FORMATS.GEMINI);
    expect(result.events.flatMap((event) => event.candidates?.[0]?.content?.parts || [])).toEqual(parts);
    const terminal = result.events.filter((event) => event.candidates?.[0]?.finishReason);
    expect(terminal).toHaveLength(1);
    expect(terminal[0].candidates[0].finishReason).toBe("STOP");
    expect(terminal[0].usageMetadata).toEqual(geminiUsage);
    expect(result.text).not.toContain("[DONE]");
  });
  it("Antigravity bridge usage does not add thought tokens twice when read as native Gemini usage", async () => {
    const wire = [
      chatChunk({ reasoning_content: "First.Second.", content: "Answer" }),
      { ...chatChunk({}, "stop"), usage },
    ].map(frame).join("") + "data: [DONE]\n\n";
    const result = await consumeStream(wire, FORMATS.OPENAI, FORMATS.ANTIGRAVITY);
    const terminal = result.events.find((event) => event.response?.candidates?.[0]?.finishReason);
    expect(terminal.response.usageMetadata).toEqual(geminiUsage);
  });
});

describe("reasoning stream terminal usage trailers", () => {
  it("delivers one Claude terminal with actual late Chat usage instead of zero startup counters", async () => {
    const result = await consumeStream(chatWire([{ reasoning_content: "First.Second." }]), FORMATS.OPENAI, FORMATS.CLAUDE);
    expect(claudeBlocks(result.events)).toEqual([
      { type: "thinking", thinking: "First.Second." }, { type: "text", text: "Answer" },
      { type: "tool_use", id: tool.id, name: "lookup", input: { key: "value" } },
    ]);
    expect(result.events.filter((event) => event.type === "message_delta")).toEqual([
      expect.objectContaining({ delta: { stop_reason: "tool_use" }, usage: { input_tokens: 12, output_tokens: 9, reasoning_tokens: 6 } }),
    ]);
    expect(result.events.filter((event) => event.type === "message_stop")).toHaveLength(1);
  });
});

describe("reasoning snapshots at the real completion/accounting consumer", () => {
  it.each(["Responses", "wrapped Gemini"])("captures %s readable reasoning once without opaque continuity or estimated billing", async (providerShape) => {
    let wire;
    let target;
    if (providerShape === "Responses") {
      const body = responseBody({ id: "rs_snapshot", type: "reasoning", summary: [{ type: "summary_text", text: "First.Second." }], encrypted_content: "opaque-snapshot" });
      body.output = body.output.slice(0, 2);
      wire = responsesWire(body, [
        { type: "response.reasoning_summary_text.delta", item_id: "rs_snapshot", output_index: 0, summary_index: 0, delta: "First." },
        { type: "response.reasoning_summary_text.delta", item_id: "rs_snapshot", output_index: 0, summary_index: 0, delta: "Second." },
        { type: "response.output_text.delta", item_id: "msg_contract", output_index: 1, content_index: 0, delta: "Answer" },
      ]);
      target = FORMATS.OPENAI_RESPONSES;
    } else {
      wire = geminiEvents.map(frame).join("");
      target = FORMATS.GEMINI_CLI;
    }
    const result = await consumeStream(wire, target, FORMATS.OPENAI, "translate", true);
    expect(result.onComplete).toHaveBeenCalledTimes(1);
    expect(result.onComplete.mock.calls[0][0]).toMatchObject({ content: "Answer", thinking: "First.Second." });
    expect(result.snapshot).toMatchObject({ content: "Answer", thinking: "First.Second." });
    expect(result.snapshot.usage).not.toHaveProperty("estimated");
    assertStoredUsage();
    expect(db.saveRequestDetail).toHaveBeenCalledTimes(1);
    expect(db.saveRequestDetail.mock.calls[0][0]).toMatchObject({
      status: "success", response: { content: "Answer", thinking: "First.Second.", type: "streaming" },
    });
  });
});

describe("native SSE JSON continuity fidelity", () => {
  it.each(["forced handler", "native handler"])("%s preserves Claude signed/redacted blocks and native block order", async (handler) => {
    const ctx = context(sseResponse(claudeEvents.map(eventFrame).join("")), FORMATS.CLAUDE, FORMATS.CLAUDE);
    const result = handler === "forced handler" ? await handleForcedSSEToJson(ctx) : await handleNonStreamingResponse(ctx);
    expect(result.success).toBe(true);
    const json = await result.response.json();
    expect(json).toMatchObject({ type: "message", role: "assistant", stop_reason: "tool_use" });
    expect(json.content).toEqual([
      { type: "thinking", thinking: "First.Second.", signature: "opaque-claude-signature" },
      { type: "redacted_thinking", data: "opaque-claude-redacted" },
      { type: "text", text: "Answer" },
      { type: "tool_use", id: tool.id, name: "lookup", input: { key: "value" } },
    ]);
    expect(json.usage).toEqual({ input_tokens: 12, output_tokens: 9 });
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 });
  });

  it.each(["forced handler", "native handler"])("%s preserves wrapped Gemini signed thought parts as native parts", async (handler) => {
    const ctx = context(sseResponse(geminiEvents.map(frame).join("")), FORMATS.GEMINI_CLI, FORMATS.GEMINI_CLI);
    const result = handler === "forced handler" ? await handleForcedSSEToJson(ctx) : await handleNonStreamingResponse(ctx);
    expect(result.success).toBe(true);
    const json = await result.response.json();
    expect(json.response.candidates).toEqual([{
      content: { role: "model", parts: [
        { thought: true, text: "First.", thoughtSignature: "c2lnbmF0dXJl" },
        { thought: true, text: "Second." }, { text: "Answer" },
        { functionCall: { name: "lookup", args: { key: "value" } } },
      ] }, finishReason: "STOP",
    }]);
    expect(json.response.usageMetadata).toEqual(geminiUsage);
    assertStoredUsage();
  });

  it("retains Chat encrypted detail metadata without treating it as readable reasoning", async () => {
    const details = [{ type: "reasoning.encrypted", id: "rs_opaque", data: "opaque-native-detail" }];
    const result = await handleForcedSSEToJson(context(sseResponse(chatWire([{ reasoning_details: details }]))));
    expect(result.success).toBe(true);
    const json = await result.response.json();
    expect(json.choices[0]).toEqual({
      index: 0, finish_reason: "tool_calls",
      message: { role: "assistant", content: "Answer", tool_calls: [tool], reasoning_details: details },
    });
    assertStoredUsage();
  });
});

describe("Claude initial tool input fallback", () => {
  it.each(["forced JSON", "translated SSE"].flatMap((transport) => [
    [transport, "snapshot without deltas", [], '{"key":"snapshot"}'],
    [transport, "snapshot with empty delta metadata", [""], '{"key":"snapshot"}'],
    [transport, "matching incremental deltas", ['{"key":', '"snapshot"}'], '{"key":"snapshot"}'],
    [transport, "different arbitrary incremental deltas", ['{"key":"different",', '"literal":"{}{}"}'], '{"key":"different","literal":"{}{}"}'],
  ]))("%s uses %s exactly once, preserving call identity and name timing", async (transport, _name, deltas, wantedArguments) => {
    const events = [];
    for (const event of claudeEvents) {
      if (event.content_block?.type === "tool_use") {
        events.push({ ...event, content_block: { ...event.content_block, input: { key: "snapshot" } } });
      } else if (event.delta?.type === "input_json_delta") {
        for (const partial_json of deltas) events.push({ ...event, delta: { type: "input_json_delta", partial_json } });
      } else events.push(event);
    }
    const wire = events.map(eventFrame).join("");
    if (transport === "forced JSON") {
      const result = await handleForcedSSEToJson(context(sseResponse(wire), FORMATS.OPENAI, FORMATS.CLAUDE));
      expect(result.success).toBe(true);
      const json = await result.response.json();
      expect(json.choices[0].message.tool_calls).toEqual([{ ...tool, function: { name: "lookup", arguments: wantedArguments } }]);
      expect(json.choices[0].finish_reason).toBe("tool_calls");
      expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
    } else {
      const result = await consumeStream(wire, FORMATS.CLAUDE, FORMATS.OPENAI);
      const calls = result.events.flatMap((event) => event.choices?.[0]?.delta?.tool_calls || []);
      expect(calls[0]).toEqual({ ...tool, index: 0, function: { name: "lookup", arguments: "" } });
      expect(calls.map((call) => call.function?.arguments || "").join("")).toBe(wantedArguments);
      // Chat clients concatenate identity fragments. Continuations keep their
      // owner index but must not repeat the opener's ID.
      expect(calls.every((call) => call.index === 0)).toBe(true);
      expect(calls.filter((call) => call.id !== undefined).map((call) => call.id)).toEqual([tool.id]);
      expect(result.events.filter((event) => event.choices?.[0]?.finish_reason)).toHaveLength(1);
    }
  });

  it.each(["terminal", "EOF"])("flushes a nonempty snapshot once at %s when block-stop is absent", async (boundary) => {
    const events = [
      claudeEvents[0],
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: tool.id, name: "lookup", input: { key: "snapshot" } } },
    ];
    if (boundary === "terminal") events.push(claudeEvents.at(-2), claudeEvents.at(-1));
    const result = await consumeStream(events.map(eventFrame).join(""), FORMATS.CLAUDE, FORMATS.OPENAI);
    const calls = result.events.flatMap((event) => event.choices?.[0]?.delta?.tool_calls || []);
    expect(calls[0]).toEqual({ ...tool, index: 0, function: { name: "lookup", arguments: "" } });
    expect(calls.slice(1)).toEqual([{ index: 0, function: { arguments: '{"key":"snapshot"}' } }]);
    expect(result.events.filter((event) => event.choices?.[0]?.finish_reason).map((event) => event.choices[0].finish_reason))
      .toEqual([boundary === "terminal" ? "tool_calls" : "network_error"]);
    expect(result.text.match(/data: \[DONE\]/g)).toHaveLength(1);
  });
});
