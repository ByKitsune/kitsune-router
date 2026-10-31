import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  saveRequestDetail: vi.fn(async () => {}), trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { CommandCodeExecutor } from "../../open-sse/executors/commandcode.js";
import { commandCodeToOpenAIResponse } from "../../open-sse/translator/response/commandcode-to-openai.js";
import { createSSETransformStreamWithLogger } from "../../open-sse/utils/stream.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const model = "deepseek/deepseek-v4-pro";
const failure = { type: "server_error", message: "Synthetic late model failure", statusCode: 503, code: "upstream_unavailable" };
const raw = events => events.map(event => JSON.stringify(event)).join("\n") + "\n";
const totalUsage = { inputTokens: 11, outputTokens: 2, totalTokens: 13 };

beforeEach(() => {
  proxyAwareFetch.mockReset();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected real network request"); }));
});
afterEach(() => vi.unstubAllGlobals());

async function execute(events) {
  proxyAwareFetch.mockResolvedValueOnce(new Response(raw(events), { headers: { "content-type": "application/x-ndjson" } }));
  const result = await new CommandCodeExecutor().execute({ model, body: { params: { messages: [] } }, stream: true, credentials: { apiKey: "synthetic-commandcode" } });
  expect(result.responseFormat).toBe(FORMATS.OPENAI);
  return result.response;
}

describe("late CommandCode failures remain failures after NDJSON decoding", () => {
  it.each([FORMATS.OPENAI, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES, FORMATS.GEMINI, FORMATS.ANTIGRAVITY])("preserves partial content and measured usage, and fails the actual %s consumer", async format => {
    const response = await execute([
      { type: "text-delta", text: "Partial answer" },
      { type: "finish-step", usage: totalUsage, finishReason: "stop" },
      { type: "error", error: failure },
      { type: "text-delta", text: "must not appear after failure" },
      { type: "finish", finishReason: "stop", totalUsage: { inputTokens: 999, outputTokens: 999, totalTokens: 1998 } },
    ]);
    const complete = vi.fn();
    const transform = createSSETransformStreamWithLogger(FORMATS.OPENAI, format, "commandcode", null, null, model, null, { messages: [] }, complete);
    const text = await new Response(response.body.pipeThrough(transform)).text();
    expect(text).toContain("Partial answer");
    expect(text).toContain(failure.message);
    expect(text).not.toContain("[CommandCode error:");
    expect(text).not.toContain("must not appear after failure");
    expect(text).not.toContain('"finish_reason":"stop"');
    expect(text).not.toContain('"finishReason":"STOP"');
    expect(text).not.toContain("response.completed");
    expect(text).not.toContain("event: message_stop");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].content).toBe("Partial answer");
    expect(complete.mock.calls[0][1]).toMatchObject({ prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 });
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: true, error: failure.message, status: 503 });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("emits a single structured error without inventing measured usage or a successful terminal", async () => {
    const response = await execute([
      { type: "text-delta", text: "Partial" }, { type: "error", error: failure },
      { type: "error", error: { message: "duplicate failure" } }, { type: "finish" },
    ]);
    const text = await response.text();
    const records = text.split("\n\n").filter(record => record.startsWith("data:") && record !== "data: [DONE]").map(record => JSON.parse(record.slice(5)));
    const errors = records.filter(record => record.error);
    expect(errors).toEqual([{ error: failure }]);
    expect(records.some(record => record.usage)).toBe(false);
    expect(records.some(record => record.choices?.some(choice => choice.finish_reason))).toBe(false);
    expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it("keeps a string error readable and terminal in the direct adapter", () => {
    const state = {};
    commandCodeToOpenAIResponse({ type: "text-delta", text: "partial" }, state);
    expect(commandCodeToOpenAIResponse({ type: "error", error: "Synthetic string failure" }, state)).toEqual([{ error: { message: "Synthetic string failure" } }]);
    expect(commandCodeToOpenAIResponse({ type: "finish" }, state)).toBeNull();
  });

  it.each([{}, { remainingQuota: 100 }, []])("ignores counter-free error usage %j rather than inventing zeroes or erasing measured usage", async emptyUsage => {
    for (const measured of [false, true]) {
      const response = await execute([
        { type: "text-delta", text: "Partial" },
        ...(measured ? [{ type: "finish-step", usage: totalUsage }] : []),
        { type: "error", error: failure, totalUsage: emptyUsage, usage: emptyUsage },
      ]);
      const text = await response.text();
      const errorFrame = text.split("\n\n").filter(record => record.startsWith("data:") && record !== "data: [DONE]").map(record => JSON.parse(record.slice(5))).find(record => record.error);
      expect(errorFrame.error).toEqual(failure);
      if (measured) expect(errorFrame.usage).toEqual({ prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 });
      else expect(errorFrame).not.toHaveProperty("usage");
    }
  });

  it.each([
    { inputTokens: null, outputTokens: null, totalTokens: null },
    { inputTokens: false, outputTokens: true, totalTokens: false },
    { inputTokens: "", outputTokens: "  ", totalTokens: "invalid" },
    { inputTokens: -1, outputTokens: -2, totalTokens: -3 },
    { inputTokens: 1.5, outputTokens: 2.5, totalTokens: 4 },
    { inputTokens: 9007199254740992, outputTokens: 1, totalTokens: 9007199254740992 },
    { inputTokens: 11, outputTokens: null, totalTokens: 13 },
  ])("does not let invalid error counters %j replace measured usage or manufacture zeroes", async invalidUsage => {
    for (const measured of [false, true]) {
      const response = await execute([
        { type: "text-delta", text: "Partial" },
        ...(measured ? [{ type: "finish-step", usage: totalUsage }] : []),
        { type: "error", error: failure, totalUsage: invalidUsage, usage: invalidUsage },
      ]);
      const text = await response.text();
      const errorFrame = text.split("\n\n").filter(record => record.startsWith("data:") && record !== "data: [DONE]").map(record => JSON.parse(record.slice(5))).find(record => record.error);
      expect(errorFrame.error).toEqual(failure);
      if (measured) expect(errorFrame.usage).toEqual({ prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 });
      else expect(errorFrame).not.toHaveProperty("usage");
    }
  });

  it("accepts nonblank numeric-string measured counters on the error", async () => {
    const response = await execute([
      { type: "text-delta", text: "Partial" },
      { type: "error", error: failure, usage: { inputTokens: "11", outputTokens: "2", totalTokens: "13" } },
    ]);
    expect(await response.text()).toContain('"usage":{"prompt_tokens":11,"completion_tokens":2,"total_tokens":13}');
  });

  it("retains explicit measured zeroes reported on the error", async () => {
    const response = await execute([
      { type: "text-delta", text: "Partial" }, { type: "finish-step", usage: totalUsage },
      { type: "error", error: failure, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } },
    ]);
    expect(await response.text()).toContain('"usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}');
  });

  it("uses measured error usage when a counter-free totalUsage object is also present", async () => {
    const response = await execute([
      { type: "text-delta", text: "Partial" }, { type: "error", error: failure, totalUsage: {}, usage: totalUsage },
    ]);
    expect(await response.text()).toContain('"usage":{"prompt_tokens":11,"completion_tokens":2,"total_tokens":13}');
  });

  it("completes a tool-input opener from its consolidated snapshot without repeating its identity", async () => {
    const response = await execute([
      { type: "tool-input-start", id: "call_snapshot", toolName: "read_file" },
      { type: "tool-call", toolCallId: "call_snapshot", toolName: "read_file", input: { path: "fixture.txt" } },
      { type: "finish-step", finishReason: "tool-calls" }, { type: "finish" },
    ]);
    const complete = vi.fn();
    const transform = createSSETransformStreamWithLogger(FORMATS.OPENAI, FORMATS.OPENAI, "commandcode", null, null, model, null, { messages: [] }, complete);
    const text = await new Response(response.body.pipeThrough(transform)).text();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].toolCalls).toEqual([{ id: "call_snapshot", name: "read_file", arguments: '{"path":"fixture.txt"}' }]);
    expect(text.match(/"id":"call_snapshot"/g)).toHaveLength(1);
    expect(text.match(/"name":"read_file"/g)).toHaveLength(1);
    expect(text).toContain('"finish_reason":"tool_calls"');
  });

  it("keeps parallel tool snapshots and streamed arguments isolated by native tool ID", () => {
    const state = {};
    const events = [
      { type: "tool-input-start", id: "call_stream", toolName: "streamed" },
      { type: "tool-input-start", id: "call_empty", toolName: "empty" },
      { type: "tool-input-start", id: "call_snapshot", toolName: "snapshot" },
      { type: "tool-input-delta", id: "call_stream", delta: '{"path":' },
      { type: "tool-input-delta", id: "call_empty", delta: "" },
      { type: "tool-call", toolCallId: "call_snapshot", input: { path: "snapshot.txt" } },
      { type: "tool-input-delta", id: "call_stream", delta: '"stream.txt"}' },
      { type: "tool-call", toolCallId: "call_empty", input: {} },
      { type: "tool-call", toolCallId: "call_stream", input: { path: "stream.txt" } },
      { type: "tool-call", toolCallId: "call_snapshot", input: { path: "snapshot.txt" } },
    ];
    const calls = events.flatMap(event => commandCodeToOpenAIResponse(event, state) || []).flatMap(chunk => chunk.choices?.[0]?.delta?.tool_calls || []);
    const argumentsByIndex = [0, 1, 2].map(index => calls.filter(call => call.index === index).map(call => call.function.arguments).join(""));
    expect(argumentsByIndex).toEqual(['{"path":"stream.txt"}', '{}', '{"path":"snapshot.txt"}']);
    expect(calls.filter(call => call.id).map(call => call.id)).toEqual(["call_stream", "call_empty", "call_snapshot"]);
    expect(calls.filter(call => call.function.name).map(call => call.function.name)).toEqual(["streamed", "empty", "snapshot"]);
  });
});
