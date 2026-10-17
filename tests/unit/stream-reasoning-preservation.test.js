import { describe, expect, it, vi } from "vitest";
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
}));

const encoder = new TextEncoder();
const frame = (value) => `data: ${JSON.stringify(value)}\n\n`;
const chunk = (delta, extra = {}) => ({
  id: "chatcmpl-reasoning-preservation",
  object: "chat.completion.chunk",
  created: 1,
  choices: [{ index: 0, delta, ...extra }],
});
const usage = { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 };
const finish = chunk({}, { finish_reason: "stop" });
const trailer = { choices: [], usage };

async function collect(input, options, splitBytes = false) {
  const bytes = encoder.encode(input);
  const source = new ReadableStream({
    start(controller) {
      if (splitBytes) {
        for (let index = 0; index < bytes.length; index++) {
          controller.enqueue(bytes.subarray(index, index + 1));
        }
      } else {
        controller.enqueue(bytes);
      }
      controller.close();
    },
  });
  let completion;
  const text = await new Response(source.pipeThrough(createSSEStream({
    targetFormat: FORMATS.OPENAI,
    sourceFormat: FORMATS.OPENAI,
    ...options,
    onStreamComplete(value, finalUsage, _ttft, status) {
      completion = { value, usage: finalUsage, status };
    },
  }))).text();
  const payloads = text.split("\n").filter((line) => line.startsWith("data:") && line.slice(5).trim() !== "[DONE]")
    .map((line) => JSON.parse(line.slice(5).trim()));
  return { text, payloads, completion };
}

const reasoningShapes = [
  ["reasoning_content", { reasoning_content: "Think 😀" }],
  ["reasoning alias", { reasoning: "Think 😀" }],
  ["textual details", { reasoning_details: [
    { type: "reasoning.text", text: "Think " }, { content: "😀" },
  ] }],
];

describe.each(["passthrough", "translate"])("%s OpenAI reasoning preservation", (mode) => {
  it.each(reasoningShapes)("preserves %s through reasoning, tools, answer and late usage", async (_name, reasoning) => {
    const calls = [
      { index: 0, id: "call_reasoning", type: "function", function: { name: "lookup", arguments: '{"q":' } },
      { index: 0, function: { arguments: '"weather"}' } },
    ];
    const upstream = [chunk(reasoning), chunk({ tool_calls: [calls[0]] }), chunk({ tool_calls: [calls[1]] }),
      chunk({ content: "Answer 🌤" }), finish, trailer];
    const result = await collect(upstream.map(frame).join("") + "data: [DONE]\n\n", { mode }, true);
    const deltas = result.payloads.flatMap((value) => value.choices?.map((choice) => choice.delta) || []);
    expect(deltas[0]).toMatchObject(reasoning);
    expect(deltas.flatMap((delta) => delta.tool_calls || [])).toEqual(calls);
    expect(deltas.map((delta) => delta.content || "").join("")).toBe("Answer 🌤");
    expect(result.completion.value).toEqual({
      thinking: "Think 😀", content: "Answer 🌤",
      toolCalls: [{ id: "call_reasoning", name: "lookup", arguments: '{"q":"weather"}' }],
    });
    expect(result.payloads.filter((value) => value.choices?.[0]?.finish_reason)).toHaveLength(1);
    expect(result.payloads.find((value) => value.choices?.[0]?.finish_reason)?.choices[0].finish_reason).toBe("stop");
    expect(result.payloads.find((value) => value.choices?.length === 0)?.usage).toEqual(usage);
    expect(result.text.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it("keeps original detail metadata while taking only genuine readable text once", async () => {
    const reasoning_details = [
      { type: "reasoning.encrypted", data: "opaque-encrypted", text: "not-readable" },
      { type: "redacted_thinking", data: "opaque-redacted", content: "not-readable-either" },
      { text: { secret: "not-text" } },
      { content: 42 },
      { type: "reasoning.summary", text: "Summary" },
    ];
    const result = await collect(frame(chunk({ reasoning_details, content: "Answer" })) + frame(finish), { mode });
    expect(result.payloads[0].choices[0].delta).toEqual({ reasoning_details, content: "Answer" });
    expect(result.completion.value.thinking).toBe("Summary");
    expect(result.completion.value.content).toBe("Answer");
  });

  it("does not reinterpret opaque-only details as a textual reasoning chunk", async () => {
    const result = await collect(frame(chunk({ reasoning_details: [
      { type: "reasoning.encrypted", data: "opaque", text: "not-readable" },
    ] })) + frame(chunk({ content: "Answer" })) + frame(finish), { mode });
    expect(result.payloads.flatMap((value) => value.choices || []).map((choice) => choice.delta))
      .toEqual([{ content: "Answer" }, {}]);
    expect(result.completion.value).toEqual({ thinking: "", content: "Answer", toolCalls: [] });
  });

  it("honors canonical reasoning precedence without duplicating alias or details", async () => {
    const delta = { reasoning_content: "Canonical", reasoning: "Alias", reasoning_details: [{ text: "Details" }], content: "Answer" };
    const result = await collect(frame(chunk(delta)) + frame(finish), { mode });
    expect(result.payloads[0].choices[0].delta).toEqual(delta);
    expect(result.completion.value).toEqual({ thinking: "Canonical", content: "Answer", toolCalls: [] });
  });

  it.each(reasoningShapes)("preserves %s in a split UTF-8 EOF tail without a newline", async (_name, reasoning) => {
    const result = await collect(frame(chunk({ content: "Answer" })) + `data: ${JSON.stringify(chunk(reasoning))}`, { mode }, true);
    expect(result.payloads[1].choices[0].delta).toEqual(reasoning);
    expect(result.completion.value).toEqual({ thinking: "Think 😀", content: "Answer", toolCalls: [] });
    expect(result.payloads.filter((value) => value.choices?.[0]?.finish_reason).map((value) => value.choices[0].finish_reason))
      .toEqual(["network_error"]);
    expect(result.text.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it("retains reasoning then reports an upstream error without a synthetic success", async () => {
    const error = { type: "upstream_error", message: "synthetic failure" };
    const result = await collect(frame(chunk({ reasoning_details: [{ text: "Partial" }] })) + frame({ error }), { mode });
    expect(result.payloads[0].choices[0].delta.reasoning_details).toEqual([{ text: "Partial" }]);
    expect(result.payloads[1]).toEqual({ error });
    expect(result.payloads.some((value) => value.choices?.[0]?.finish_reason)).toBe(false);
    expect(result.completion.value.thinking).toBe("Partial");
    expect(result.completion.status).toMatchObject({ failed: true, error: "synthetic failure" });
    expect(result.text.match(/data: \[DONE\]/g)).toHaveLength(1);
  });
});

describe.each(["passthrough", "translate"])("%s native Claude fidelity", (mode) => {
  it("preserves signature-only deltas and native redacted blocks in order", async () => {
    const events = [
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Thought" } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "synthetic-opaque-signature" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "redacted_thinking", data: "synthetic-opaque-data" } },
      { type: "content_block_stop", index: 1 },
      { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "Answer" } },
      { type: "content_block_stop", index: 2 },
      { type: "message_stop" },
    ];
    const input = events.map((event) => `event: ${event.type}\n${frame(event)}`).join("");
    const result = await collect(input, { mode, sourceFormat: FORMATS.CLAUDE, targetFormat: FORMATS.CLAUDE }, true);
    expect(result.payloads).toEqual(events);
    expect(result.text).toContain(`event: content_block_delta\n${frame(events[2])}`);
    expect(result.completion.value.thinking).not.toContain("synthetic-opaque");
    expect(result.completion.value.content).not.toContain("synthetic-opaque");
  });
});

describe("translated stream reasoning separation", () => {
  it.each(reasoningShapes)("keeps %s in Antigravity thought parts, separate from text and tools", async (_name, reasoning) => {
    const result = await collect([
      chunk(reasoning),
      chunk({ content: "Answer" }),
      chunk({ tool_calls: [{ index: 0, id: "call_ag", function: { name: "lookup", arguments: '{"q":"weather"}' } }] }),
      { ...chunk({}, { finish_reason: "tool_calls" }), usage },
    ].map(frame).join("") + "data: [DONE]\n\n", { mode: "translate", sourceFormat: FORMATS.ANTIGRAVITY });
    const responses = result.payloads.map((value) => value.response);
    const parts = responses.flatMap((value) => value.candidates[0].content.parts);
    expect(parts).toEqual([
      { thought: true, text: "Think 😀" },
      { text: "Answer" },
      { functionCall: { id: "call_ag", name: "lookup", args: { q: "weather" } } },
    ]);
    expect(responses.at(-1).candidates[0].finishReason).toBe("STOP");
    expect(responses.at(-1).usageMetadata).toEqual({ promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 });
    expect(result.text).not.toContain("[DONE]");
  });

  it("does not turn encrypted Antigravity bridge metadata into a thought or answer", async () => {
    const result = await collect([
      chunk({ reasoning_details: [{ type: "reasoning.encrypted", data: "opaque", text: "not-readable" }], content: "Answer" }),
      finish,
    ].map(frame).join(""), { mode: "translate", sourceFormat: FORMATS.ANTIGRAVITY });
    expect(result.payloads[0].response.candidates[0].content.parts).toEqual([{ text: "Answer" }]);
    expect(result.text).not.toContain("opaque");
    expect(result.text).not.toContain("not-readable");
  });
});
