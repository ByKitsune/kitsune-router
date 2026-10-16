import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  saveRequestUsage: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  appendRequestLog: vi.fn(async () => {}),
  trackPendingRequest: vi.fn(),
}));
vi.mock("@/lib/usageDb.js", () => db);

import "../translator/registerAll.js";
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { buildOnStreamComplete } from "../../open-sse/handlers/chatCore/streamingHandler.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { hasSemanticContent } from "../../open-sse/utils/streamHelpers.js";

const startTime = Date.parse("2026-10-16T12:00:00.000Z");
const encoder = new TextEncoder();
const usage = { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 };
const frame = (data) => `data: ${JSON.stringify(data)}\n\n`;
const chunk = (delta, finish_reason = null) => ({
  id: "chatcmpl-semantic-ttft-fixture",
  object: "chat.completion.chunk",
  created: 1,
  choices: [{ index: 0, delta, finish_reason }],
});
const network = vi.fn(() => { throw new Error("offline stream fixture only"); });
const payloads = (text) => text.split("\n")
  .filter((line) => line.startsWith("data:") && line.slice(5).trim() !== "[DONE]")
  .map((line) => JSON.parse(line.slice(5).trim()));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(startTime);
  vi.stubGlobal("fetch", network);
});

afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function streamFixture(options = {}) {
  const log = { line: vi.fn() };
  const callbacks = buildOnStreamComplete({
    provider: "offline", model: "offline-model", body: { messages: [] }, stream: true,
    requestStartTime: startTime, log, clientRawRequest: { endpoint: "/v1/chat/completions" },
  });
  const onStreamComplete = vi.fn((...args) => callbacks.onStreamComplete(...args));
  const stream = createSSEStream({
    mode: "passthrough", targetFormat: FORMATS.OPENAI, sourceFormat: FORMATS.OPENAI,
    provider: "offline", model: "offline-model", onStreamComplete, ...options,
  });
  const output = new Response(stream.readable).text();
  const writer = stream.writable.getWriter();
  return {
    stream, output, callbacks, onStreamComplete, log,
    async write(at, text) {
      vi.setSystemTime(startTime + at);
      await writer.write(typeof text === "string" ? encoder.encode(text) : text);
    },
    async close(at = 6000) {
      vi.setSystemTime(startTime + at);
      await writer.close();
      return output;
    },
  };
}

describe("semantic content predicate", () => {
  it.each([
    ["Gemini text", { candidates: [{ content: { parts: [{ text: "Hello" }] } }] }],
    ["wrapped Gemini thought", { response: { candidates: [{ content: { parts: [{ thought: true, text: "Think" }] } }] } }],
    ["Gemini tool name", { candidates: [{ content: { parts: [{ functionCall: { name: "lookup", args: {} } }] } }] }],
    ["Ollama content", { message: { role: "assistant", content: "Hello" } }],
    ["Ollama thinking", { message: { role: "assistant", thinking: "Think" } }],
    ["Responses tool name", { type: "response.output_item.added", item: { type: "function_call", name: "lookup", arguments: "" } }],
  ])("recognizes %s", (_name, data) => {
    expect(hasSemanticContent(data)).toBe(true);
  });

  it.each([
    ["OpenAI text", chunk({ content: "Hello" })],
    ["whitespace output", chunk({ content: " " })],
    ["reasoning alias", chunk({ reasoning: "Think" })],
    ["readable reasoning details", chunk({ reasoning_details: [{ type: "reasoning.text", text: "Think" }] })],
    ["tool name", chunk({ tool_calls: [{ function: { name: "lookup" } }] })],
    ["tool arguments", chunk({ tool_calls: [{ function: { arguments: "{}" } }] })],
    ["custom tool arguments", { type: "response.custom_tool_call_input.delta", delta: "command" }],
  ])("recognizes %s without requiring answer text", (_name, data) => {
    expect(hasSemanticContent(data)).toBe(true);
  });

  it.each([
    null, {}, { done: true },
    chunk({ role: "assistant" }), chunk({ content: "", reasoning_content: "" }), chunk({}, "stop"),
    { choices: [], usage },
    chunk({ tool_calls: [{ id: "call_fixture", function: { name: "", arguments: "" } }] }),
    chunk({ reasoning_details: [{ type: "reasoning.encrypted", data: "opaque", text: "not-readable" }] }),
    { type: "content_block_delta", delta: { type: "signature_delta", signature: "opaque" } },
    { type: "content_block_start", content_block: { type: "redacted_thinking", data: "opaque" } },
    { type: "response.created", response: { status: "in_progress" } },
    { type: "response.output_item.added", item: { type: "message", role: "assistant", content: [] } },
    { type: "response.output_text.delta", delta: "" },
    { type: "response.unknown.delta", delta: "metadata" },
    { type: "response.completed", response: { status: "completed", usage } },
    { error: { message: "provider failure" }, choices: [{ delta: { content: "error metadata" } }] },
  ])("excludes non-semantic frames %j", (data) => {
    expect(hasSemanticContent(data)).toBe(false);
  });

  it.each([
    { choices: {} }, { choices: "metadata" },
    chunk({ tool_calls: { id: "metadata" } }),
  ])("does not throw for malformed metadata %j", (data) => {
    expect(() => hasSemanticContent(data)).not.toThrow();
    expect(hasSemanticContent(data)).toBe(false);
  });
});

describe("semantic streaming TTFT", () => {
  it.each([
    ["passthrough", FORMATS.OPENAI_RESPONSES],
    ["translate", FORMATS.OPENAI],
    ["translate", FORMATS.OPENAI_RESPONSES],
  ].flatMap(([mode, sourceFormat]) => [
    "response.output_text.delta", "response.reasoning_summary_text.delta", "response.function_call_arguments.delta",
  ].map((type) => [mode, sourceFormat, type])))("observes Responses semantic deltas in %s to %s: %s", async (mode, sourceFormat, type) => {
    const fixture = streamFixture({ mode, targetFormat: FORMATS.OPENAI_RESPONSES, sourceFormat });
    await fixture.write(100, ": keepalive\n\n");
    await fixture.write(200, frame({ type: "response.created", response: { id: "resp_fixture", status: "in_progress" } }));
    await fixture.write(300, frame({
      type: "response.output_item.added", output_index: 0,
      item: { type: "function_call", id: "tool_fixture", call_id: "call_fixture", name: "", arguments: "" },
    }));
    await fixture.write(5000, frame({ type, delta: '{"q":"weather"}' }));
    await fixture.write(6000, frame({
      type: "response.completed",
      response: { id: "resp_fixture", status: "completed", usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } },
    }));
    const output = await fixture.close();

    expect(output).toContain("weather");
    if (sourceFormat === FORMATS.OPENAI) {
      const deltas = payloads(output).flatMap((value) => value.choices?.map((choice) => choice.delta) || []);
      if (type === "response.output_text.delta") expect(deltas.some((delta) => delta.content === '{"q":"weather"}')).toBe(true);
      if (type === "response.reasoning_summary_text.delta") expect(deltas.some((delta) => delta.reasoning_content === '{"q":"weather"}')).toBe(true);
      if (type === "response.function_call_arguments.delta") {
        expect(deltas.flatMap((delta) => delta.tool_calls || []).some((call) => call.function?.arguments === '{"q":"weather"}')).toBe(true);
      }
      expect(payloads(output).some((value) => value.choices?.[0]?.finish_reason === "tool_calls")).toBe(true);
      expect(output).not.toContain('"type":"response.');
      expect(output.match(/data: \[DONE\]/g)).toHaveLength(1);
    } else {
      expect(payloads(output).some((value) => value.type === "response.completed")).toBe(true);
      expect(payloads(output).some((value) => value.choices)).toBe(false);
    }
    expect(db.saveRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.saveRequestUsage.mock.calls[0][0].latency).toEqual({ ttft: 5000, total: 6000 });
  });

  it.each(["passthrough", "translate"].flatMap((mode) => [
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Think" } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"q":"weather"}' } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool_fixture", name: "lookup", input: {} } },
  ].map((data) => [mode, data])))("observes native Claude semantic output in %s: %j", async (mode, data) => {
    const fixture = streamFixture({ mode, targetFormat: FORMATS.CLAUDE, sourceFormat: mode === "passthrough" ? FORMATS.CLAUDE : FORMATS.OPENAI });
    await fixture.write(100, ": keepalive\n\n");
    await fixture.write(200, frame({ type: "message_start", message: { id: "msg_fixture", model: "offline-model", usage: { input_tokens: 10, output_tokens: 0 } } }));
    if (data.type === "content_block_delta") {
      const block = data.delta.partial_json !== undefined
        ? { type: "tool_use", id: "tool_fixture", name: "", input: {} }
        : data.delta.thinking !== undefined ? { type: "thinking", thinking: "" } : { type: "text", text: "" };
      await fixture.write(250, frame({ type: "content_block_start", index: 0, content_block: block }));
    }
    await fixture.write(300, frame({ type: "ping" }));
    await fixture.write(5000, frame(data));
    await fixture.write(5500, frame({ type: "content_block_stop", index: 0 }));
    const stopReason = data.delta?.partial_json !== undefined || data.content_block?.type === "tool_use" ? "tool_use" : "end_turn";
    await fixture.write(6000, frame({ type: "message_delta", delta: { stop_reason: stopReason }, usage: { output_tokens: 2 } }));
    await fixture.write(6000, frame({ type: "message_stop" }));
    const output = await fixture.close();

    if (mode === "translate") {
      const deltas = payloads(output).flatMap((value) => value.choices?.map((choice) => choice.delta) || []);
      if (data.delta?.text) expect(deltas.some((delta) => delta.content === "Hello")).toBe(true);
      if (data.delta?.thinking) expect(deltas.some((delta) => delta.reasoning_content === "Think")).toBe(true);
      if (data.delta?.partial_json) expect(deltas.flatMap((delta) => delta.tool_calls || []).some((call) => call.function?.arguments === '{"q":"weather"}')).toBe(true);
      if (data.content_block) expect(deltas.flatMap((delta) => delta.tool_calls || []).some((call) => call.function?.name === "lookup")).toBe(true);
      expect(payloads(output).some((value) => value.choices?.[0]?.finish_reason === (stopReason === "tool_use" ? "tool_calls" : "stop"))).toBe(true);
      expect(output).not.toContain('"type":"content_block');
      expect(output.match(/data: \[DONE\]/g)).toHaveLength(1);
    } else {
      expect(payloads(output).some((value) => value.type === data.type)).toBe(true);
      expect(payloads(output).some((value) => value.type === "message_stop")).toBe(true);
    }
    expect(db.saveRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.saveRequestUsage.mock.calls[0][0].latency).toEqual({ ttft: 5000, total: 6000 });
  });

  it.each(["passthrough", "translate"])("times an EOF tail from its arrival rather than delayed flush in %s", async (mode) => {
    const fixture = streamFixture({ mode });
    await fixture.write(100, ": keepalive\n\n");
    await fixture.write(200, frame({ choices: [], usage }));
    await fixture.write(5000, frame(chunk({ content: "Hello" })).trimEnd());
    const output = await fixture.close(6000);

    expect(output).toContain("Hello");
    expect(db.saveRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.saveRequestUsage.mock.calls[0][0].latency).toEqual({ ttft: 5000, total: 6000 });
  });

  it.each(["passthrough", "translate"])("keeps metadata/usage-only TTFT unknown in %s", async (mode) => {
    const fixture = streamFixture({ mode });
    await fixture.write(100, ": keepalive\n\n");
    await fixture.write(200, frame(chunk({ role: "assistant" })));
    await fixture.write(300, frame(chunk({ reasoning_details: [{ type: "reasoning.encrypted", data: "opaque" }] })));
    await fixture.write(6000, frame(chunk({}, "stop")) + frame({ choices: [], usage }));
    await fixture.close();

    expect(db.saveRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.saveRequestUsage.mock.calls[0][0]).toMatchObject({ tokens: usage, latency: { ttft: null, total: 6000 } });
  });

  it.each(["passthrough", "translate"])("waits for a complete split UTF-8 semantic frame in %s", async (mode) => {
    const fixture = streamFixture({ mode });
    const bytes = encoder.encode(frame(chunk({ content: "Hello \u{1f600}" })));
    const split = bytes.indexOf(0xf0) + 2;
    await fixture.write(100, ": keepalive\n\n");
    await fixture.write(1000, bytes.subarray(0, split));
    await fixture.write(5000, bytes.subarray(split));
    await fixture.write(6000, frame(chunk({}, "stop")) + frame({ choices: [], usage }));
    const output = await fixture.close();

    expect(output).toContain("Hello \u{1f600}");
    expect(db.saveRequestUsage.mock.calls[0][0].latency).toEqual({ ttft: 5000, total: 6000 });
  });

  it.each([false, true])("preserves failure accounting with semantic output=%s", async (withContent) => {
    const fixture = streamFixture();
    await fixture.write(100, ": keepalive\n\n");
    await fixture.write(200, frame({ choices: [], usage }));
    if (withContent) await fixture.write(5000, frame(chunk({ content: "Partial" })));
    await fixture.write(6000, frame({ error: { message: "upstream failure" } }));
    await fixture.output;

    expect(db.saveRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.saveRequestUsage.mock.calls[0][0]).toMatchObject({ tokens: usage, latency: { ttft: withContent ? 5000 : null, total: 6000 } });
    expect(db.saveRequestDetail.mock.calls[0][0].status).toBe("failed");
    expect(fixture.onStreamComplete.mock.calls[0][3]).toMatchObject({ failed: true, error: "upstream failure" });
  });

  it("does not change abort usage or let a later completion double-account", async () => {
    const fixture = streamFixture();
    await fixture.write(100, ": keepalive\n\n");
    await fixture.write(200, frame({ choices: [], usage }));
    await fixture.write(5000, frame(chunk({ content: "Partial" })));
    fixture.callbacks.onStreamAborted(fixture.stream.getStreamSnapshot(), "client_closed");
    await fixture.close(6000);

    expect(db.saveRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.saveRequestUsage.mock.calls[0][0].tokens).toMatchObject(usage);
    expect(db.saveRequestUsage.mock.calls[0][0].latency).toBeUndefined();
    expect(db.saveRequestDetail.mock.calls[0][0]).toMatchObject({ status: "aborted", latency: { ttft: 100, total: 5000 } });
  });

  it("persists the 5000ms first text token rather than the 100ms heartbeat", async () => {
    const fixture = streamFixture();
    await fixture.write(100, ": keepalive\n\n");
    await fixture.write(5000, frame(chunk({ content: "Hello" })));
    await fixture.write(6000, frame(chunk({}, "stop")) + frame({ choices: [], usage }));
    const output = await fixture.close();

    expect(output).toContain('"content":"Hello"');
    expect(db.saveRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.saveRequestUsage.mock.calls[0][0]).toMatchObject({
      tokens: usage, latency: { ttft: 5000, total: 6000 },
    });
    expect(fixture.onStreamComplete.mock.calls[0][2]).toBe(startTime + 100);
    expect(fixture.onStreamComplete.mock.calls[0][3]).toEqual({ failed: false, error: null });
    expect(fixture.onStreamComplete.mock.calls[0][4]).toBe(startTime + 5000);
    expect(fixture.stream.getStreamSnapshot().ttftAt).toBe(startTime + 100);
  });
});
