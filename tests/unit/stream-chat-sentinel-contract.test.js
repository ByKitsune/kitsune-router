import { describe, expect, it, vi } from "vitest";
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
import { createSSEParser } from "../../open-sse/utils/sse.js";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
}));

const usage = { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 };
const chat = (delta, index = 0) => ({
  id: "chatcmpl-sentinel-contract", model: "wire-model",
  choices: [{ index, delta, finish_reason: null }],
});

async function consume(chunks, sourceFormat = F.OPENAI, { sentinel = true, body = {} } = {}) {
  const complete = vi.fn();
  const input = chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    (sentinel ? "data: [DONE]\n\n" : "");
  const stream = createSSEStream({ targetFormat: F.OPENAI, sourceFormat, body, onStreamComplete: complete });
  const wire = await new Response(new Response(input).body.pipeThrough(stream)).text();
  const parser = createSSEParser();
  const events = [...parser.feed(wire), ...parser.end()].filter(event => event.data !== "[DONE]").map(event => JSON.parse(event.data));
  return { wire, events, complete };
}

describe("Chat sentinel completion evidence", () => {
  it.each([F.OPENAI, F.CLAUDE, F.OPENAI_RESPONSES])("accepts generated output followed by DONE for %s", async format => {
    const { wire, events, complete } = await consume([
      chat({ reasoning: "Plan" }), chat({ content: "Answer" }), { choices: [], usage },
    ], format);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
    expect(complete.mock.calls[0][1]).toMatchObject(usage);
    expect(wire).not.toContain("network_error");
    expect(wire).not.toContain("stream_disconnected");
    if (format === F.OPENAI) {
      expect(events.flatMap(event => event.choices || []).filter(choice => choice.finish_reason).map(choice => choice.finish_reason)).toEqual(["stop"]);
      expect(wire.match(/data: \[DONE\]/g)).toHaveLength(1);
    } else if (format === F.CLAUDE) {
      expect(events.filter(event => event.type === "message_stop")).toHaveLength(1);
      expect(events.find(event => event.type === "message_delta")).toMatchObject({ delta: { stop_reason: "end_turn" }, usage: { input_tokens: 7, output_tokens: 3 } });
      expect(wire).not.toContain("[DONE]");
    } else {
      expect(events.filter(event => event.type === "response.completed")).toHaveLength(1);
      expect(events.find(event => event.type === "response.completed").response).toMatchObject({ usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } });
    }
  });

  it.each([
    ["refusal", { refusal: "Cannot comply" }, "stop"],
    ["tool", { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup", arguments: "{}" } }] }, "tool_calls"],
    ["reasoning", { reasoning_content: "Plan" }, "stop"],
  ])("uses generated %s as completion evidence", async (_name, delta, finish) => {
    const { events, complete } = await consume([chat(delta)]);
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
    expect(events.flatMap(event => event.choices || []).filter(choice => choice.finish_reason).map(choice => choice.finish_reason)).toEqual([finish]);
  });

  it.each([
    [], [chat({ role: "assistant" })], [chat({ content: "" })],
    [chat({ tool_calls: [{ index: 0, id: "placeholder" }] })], [{ choices: [], usage }],
  ].map(chunks => ({ chunks })))("rejects a bare or metadata-only DONE after $chunks", async ({ chunks }) => {
    const { wire, complete } = await consume(chunks);
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: true });
    expect(wire).toContain("network_error");
  });

  it("still rejects EOF without either a finish reason or DONE", async () => {
    const { complete } = await consume([chat({ content: "Partial" }), { choices: [], usage }], F.OPENAI, { sentinel: false });
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: true });
  });

  it("does not invent completion for an unobserved requested choice", async () => {
    const { complete } = await consume([chat({ content: "Only first" })], F.OPENAI, { body: { n: 2 } });
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: true });
  });

  it("finishes each generated choice once", async () => {
    const { events, complete } = await consume([chat({ content: "First" }), chat({ content: "Second" }, 1)], F.OPENAI, { body: { n: 2 } });
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
    expect(events.flatMap(event => event.choices || []).filter(choice => choice.finish_reason).map(choice => [choice.index, choice.finish_reason]))
      .toEqual([[0, "stop"], [1, "stop"]]);
  });

  it("never lets a later DONE override an explicit upstream error", async () => {
    const { events, complete } = await consume([
      chat({ content: "Partial" }), { error: { type: "server_error", message: "failed generation" } },
    ]);
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: true });
    expect(events.some(event => event.error?.message === "failed generation")).toBe(true);
    expect(events.flatMap(event => event.choices || []).some(choice => choice.finish_reason === "stop")).toBe(false);
  });

  it.each([F.OPENAI, F.CLAUDE, F.OPENAI_RESPONSES])("rejects orphan tool arguments rather than inventing success for %s", async format => {
    const { complete } = await consume([
      chat({ content: "Checking" }),
      chat({ tool_calls: [{ index: 0, function: { arguments: "{}" } }] }),
    ], format);
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: true });
  });

  it("accepts a complete tool identity assembled across deltas", async () => {
    const { events, complete } = await consume([
      chat({ tool_calls: [{ index: 0, id: "call_", function: { name: "look" } }] }),
      chat({ tool_calls: [{ index: 0, id: "one", function: { name: "up", arguments: "{}" } }] }),
    ]);
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
    expect(events.flatMap(event => event.choices || []).filter(choice => choice.finish_reason).map(choice => choice.finish_reason)).toEqual(["tool_calls"]);
  });

  it("fails explicitly on legacy function fragments without an upstream finish reason", async () => {
    const { events, complete } = await consume([
      chat({ content: "Checking" }), chat({ function_call: { name: "lookup", arguments: "{}" } }),
    ]);
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: true });
    expect(events.flatMap(event => event.choices || []).some(choice => choice.finish_reason === "stop")).toBe(false);
  });
});
