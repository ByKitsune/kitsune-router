import { describe, expect, it, vi } from "vitest";
import { createSSEStream } from "../../open-sse/utils/stream.js";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
}));

const usage = { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 };
const chat = (delta, finish_reason = null, extra = {}) => ({
  choices: [{ index: 0, delta, finish_reason }], ...extra,
});

async function consume(chunks) {
  const complete = vi.fn();
  const input = chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  const wire = await new Response(new Response(input).body.pipeThrough(createSSEStream({ onStreamComplete: complete }))).text();
  const events = wire.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  return { events, complete };
}

describe("compatible partial Chat fields", () => {
  it("omits null role and function strings without changing valid content or opaque metadata", async () => {
    const { events, complete } = await consume([
      chat({ role: null, content: "Answer", reasoning_content: null, reasoning: null }),
      chat({ tool_calls: [{ index: 0, id: "call_null", type: "function", function: { name: "lookup", arguments: null }, extra_content: { signature: "opaque" } }] }),
      chat({ tool_calls: [{ index: 0, function: { name: null, arguments: "{}" } }] }),
      chat({}, "tool_calls", { usage }),
    ]);
    const deltas = events.flatMap(event => event.choices || []).map(choice => choice.delta);
    expect(deltas[0]).toEqual({ content: "Answer", reasoning_content: null, reasoning: null });
    const calls = deltas.flatMap(delta => delta.tool_calls || []);
    expect(calls).toEqual([
      { index: 0, id: "call_null", type: "function", function: { name: "lookup" }, extra_content: { signature: "opaque" } },
      { index: 0, function: { arguments: "{}" } },
    ]);
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
  });

  it("normalizes a null terminal delta before releasing its usage frame", async () => {
    const { events, complete } = await consume([
      chat({ content: "Answer" }), chat(null, "stop", { usage }),
    ]);
    expect(events.flatMap(event => event.choices || []).every(choice => choice.delta !== null)).toBe(true);
    expect(events.find(event => event.usage)).toMatchObject({ choices: [{ delta: {} }], usage });
    expect(events.flatMap(event => event.choices || []).filter(choice => choice.finish_reason)).toHaveLength(1);
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
  });

  it("normalizes nullable legacy function strings without dropping argument bytes", async () => {
    const { events } = await consume([
      chat({ function_call: { name: "lookup", arguments: null } }),
      chat({ function_call: { name: null, arguments: '{"q":"x"}' } }),
      chat({}, "function_call"),
    ]);
    expect(events.flatMap(event => event.choices || []).map(choice => choice.delta.function_call).filter(Boolean))
      .toEqual([{ name: "lookup" }, { arguments: '{"q":"x"}' }]);
  });

  it("does not coerce malformed non-null function fields or reasoning details into accepted values", async () => {
    const malformed = { content: "Answer", reasoning_details: ["not a reasoning record"],
      tool_calls: [{ index: 0, id: "call_bad", function: { name: 9, arguments: false } }] };
    const { events } = await consume([chat(malformed), chat({}, "stop")]);
    expect(events[0].choices[0].delta).toEqual(malformed);
  });

  it("omits a null function placeholder while retaining its owned ID", async () => {
    const { events } = await consume([
      chat({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: null }] }),
      chat({ tool_calls: [{ index: 0, function: { name: "lookup", arguments: "{}" } }] }),
      chat({}, "tool_calls"),
    ]);
    expect(events[0].choices[0].delta.tool_calls).toEqual([{ index: 0, id: "call_1", type: "function" }]);
    expect(events[1].choices[0].delta.tool_calls[0].function).toEqual({ name: "lookup", arguments: "{}" });
  });

  it("does not normalize non-streaming message bodies", async () => {
    const message = { role: null, content: "Snapshot", tool_calls: [{ function: { arguments: null } }] };
    const { events } = await consume([{ choices: [{ index: 0, message, finish_reason: "stop" }], usage }]);
    expect(events.find(event => event.choices?.[0]?.message).choices[0].message).toEqual(message);
  });
});
