import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));

const { FORMATS } = await import("../../open-sse/translator/formats.js");
const { handleNonStreamingResponse } = await import("../../open-sse/handlers/chatCore/nonStreamingHandler.js");
const { handleForcedSSEToJson } = await import("../../open-sse/handlers/chatCore/sseToJsonHandler.js");

const clients = [FORMATS.OPENAI, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES];
const usage = { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 };
const toolCall = { id: "call_synthetic", type: "function", function: { name: "lookup", arguments: '{"key":"synthetic"}' } };
const reasoningVariants = [
  ["reasoning_content", { reasoning_content: "First.Second." }, [{ reasoning_content: "First." }, { reasoning_content: "Second." }]],
  ["reasoning", { reasoning: "First.Second." }, [{ reasoning: "First." }, { reasoning: "Second." }]],
  ["reasoning_details", { reasoning_details: [{ text: "First." }, { content: "Second." }] }, [{ reasoning_details: [{ text: "First." }] }, { reasoning_details: [{ content: "Second." }] }]],
  ["preferred field", { reasoning_content: "First.Second.", reasoning: "duplicate", reasoning_details: [{ text: "duplicate" }] }, [{ reasoning_content: "First.", reasoning: "duplicate" }, { reasoning_content: "Second.", reasoning_details: [{ text: "duplicate" }] }]],
  ["typed and opaque details", { reasoning_details: [{ type: "reasoning.text", text: "First." }, { type: "reasoning.encrypted", text: "synthetic-opaque" }, { text: { nested: "not-text" } }, { type: "reasoning.summary", content: "Second." }] }, [{ reasoning_details: [{ type: "reasoning.text", text: "First." }, { type: "reasoning.encrypted", text: "synthetic-opaque" }] }, { reasoning_details: [{ text: 123 }, { type: "reasoning.summary", content: "Second." }] }]],
];

function context(sourceFormat, targetFormat, providerResponse) {
  return {
    providerResponse, sourceFormat, targetFormat,
    provider: "synthetic-chat", model: "synthetic-model",
    body: { messages: [] }, stream: false, requestStartTime: Date.now(),
    trackDone: vi.fn(), appendLog: vi.fn(),
    reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn() },
  };
}

function completion(message, kind) {
  return {
    id: "chatcmpl-synthetic", object: "chat.completion", model: "synthetic-model",
    choices: [{ index: 0, message, finish_reason: kind === "tool" ? "tool_calls" : "stop" }],
    usage,
  };
}

function chatSSE(deltas, kind) {
  const chunks = deltas.map((delta) => ({
    id: "chatcmpl-synthetic", model: "synthetic-model",
    choices: [{ index: 0, delta, finish_reason: null }],
  }));
  chunks.push({ choices: [{ index: 0, delta: {}, finish_reason: kind === "tool" ? "tool_calls" : "stop" }], usage });
  return new Response([...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`), "data: [DONE]", ""].join("\n\n"), {
    headers: { "content-type": "text/event-stream" },
  });
}

function readClientMessage(json, sourceFormat) {
  if (sourceFormat === FORMATS.OPENAI) {
    const choice = json.choices[0];
    return { reasoning: choice.message.reasoning_content, text: choice.message.content || "", tools: choice.message.tool_calls || [], finish: choice.finish_reason };
  }
  if (sourceFormat === FORMATS.CLAUDE) {
    return {
      reasoning: json.content.filter((part) => part.type === "thinking").map((part) => part.thinking).join(""),
      text: json.content.filter((part) => part.type === "text").map((part) => part.text).join(""),
      tools: json.content.filter((part) => part.type === "tool_use").map((part) => ({ id: part.id, type: "function", function: { name: part.name, arguments: JSON.stringify(part.input) } })),
      finish: json.stop_reason,
    };
  }
  return {
    reasoning: json.output.filter((item) => item.type === "reasoning").flatMap((item) => item.summary.map((part) => part.text)).join(""),
    text: json.output.filter((item) => item.type === "message").flatMap((item) => item.content.map((part) => part.text)).join(""),
    tools: json.output.filter((item) => item.type === "function_call").map((item) => ({ id: item.call_id, type: "function", function: { name: item.name, arguments: item.arguments } })),
    finish: json.status,
  };
}

function expectClientMessage(json, sourceFormat, kind, reasoning) {
  const out = readClientMessage(json, sourceFormat);
  expect(out.reasoning).toBe(reasoning);
  expect(out.text).toBe(kind === "only" ? "" : "Answer");
  expect(out.tools).toEqual(kind === "tool" ? [toolCall] : []);
  const finish = sourceFormat === FORMATS.OPENAI_RESPONSES ? "completed"
    : sourceFormat === FORMATS.CLAUDE ? (kind === "tool" ? "tool_use" : "end_turn")
      : kind === "tool" ? "tool_calls" : "stop";
  expect(out.finish).toBe(finish);
  if (sourceFormat === FORMATS.CLAUDE) {
    expect(json.content[0].type).toBe("thinking");
  } else if (sourceFormat === FORMATS.OPENAI_RESPONSES) {
    expect(json.output[0].type).toBe("reasoning");
  }
}

for (const mode of ["native JSON", "forced Chat SSE"]) {
  describe(`${mode} reasoning at the consumer JSON boundary`, () => {
    for (const sourceFormat of clients) {
      for (const [name, fields, reasoningDeltas] of reasoningVariants) {
        it.each(["answer", "only", "tool"])(`${sourceFormat} preserves ${name} with %s output`, async (kind) => {
          let result;
          if (mode === "native JSON") {
            const message = { role: "assistant", content: kind === "only" ? "" : "Answer", ...fields };
            if (kind === "tool") message.tool_calls = [toolCall];
            result = await handleNonStreamingResponse(context(sourceFormat, FORMATS.OPENAI, Response.json(completion(message, kind))));
          } else {
            const deltas = [...reasoningDeltas];
            if (kind !== "only") deltas.push({ content: "Answer" });
            if (kind === "tool") {
              deltas.push({ tool_calls: [{ index: 0, id: toolCall.id, type: "function", function: { name: "lookup", arguments: '{"key":' } }] });
              deltas.push({ tool_calls: [{ index: 0, function: { arguments: '"synthetic"}' } }] });
            }
            result = await handleForcedSSEToJson(context(sourceFormat, FORMATS.OPENAI, chatSSE(deltas, kind)));
          }
          expect(result.success).toBe(true);
          const json = await result.response.json();
          expectClientMessage(json, sourceFormat, kind, "First.Second.");
          if (mode === "forced Chat SSE") {
            expect(json.usage).toEqual(sourceFormat === FORMATS.CLAUDE ? { input_tokens: 12, output_tokens: 7 }
              : sourceFormat === FORMATS.OPENAI_RESPONSES ? { input_tokens: 12, output_tokens: 7, total_tokens: 19 } : usage);
          }
        });
      }
    }
  });
}

function responsesBody(kind) {
  const output = [
    { id: "rs_first", type: "reasoning", summary: [{ type: "summary_text", text: "First." }, { type: "summary_text", text: "Second." }] },
    { id: "rs_second", type: "reasoning", summary: [{ type: "summary_text", text: "Third." }, { type: "summary_text", text: "Fourth." }] },
  ];
  if (kind !== "only") output.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: "Answer" }] });
  if (kind === "tool") output.push({ type: "function_call", call_id: toolCall.id, name: toolCall.function.name, arguments: toolCall.function.arguments });
  return { id: "resp_synthetic", object: "response", status: "completed", output, usage: { input_tokens: 12, output_tokens: 7, total_tokens: 19 } };
}

function responsesSSE(body) {
  const events = [
    ["response.created", { response: { id: body.id } }],
    ...body.output.map((item, output_index) => ["response.output_item.done", { item, output_index }]),
    ["response.completed", { response: { status: "completed", usage: body.usage } }],
  ];
  return new Response(events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

describe("forced Responses JSON reasoning parity with native JSON", () => {
  for (const sourceFormat of clients) {
    it.each(["answer", "only", "tool"])(`${sourceFormat} keeps every summary segment with %s output`, async (kind) => {
      const native = await handleNonStreamingResponse(context(sourceFormat, FORMATS.OPENAI_RESPONSES, Response.json(responsesBody(kind))));
      const forced = await handleForcedSSEToJson(context(sourceFormat, FORMATS.OPENAI_RESPONSES, responsesSSE(responsesBody(kind))));
      expect(native.success).toBe(true);
      expect(forced.success).toBe(true);
      const nativeJson = await native.response.json();
      const forcedJson = await forced.response.json();
      expectClientMessage(nativeJson, sourceFormat, kind, "First.Second.Third.Fourth.");
      expectClientMessage(forcedJson, sourceFormat, kind, "First.Second.Third.Fourth.");
      expect(readClientMessage(forcedJson, sourceFormat)).toEqual(readClientMessage(nativeJson, sourceFormat));
      expect(forcedJson.usage).toEqual(sourceFormat === FORMATS.OPENAI ? usage : { input_tokens: 12, output_tokens: 7, ...(sourceFormat === FORMATS.OPENAI_RESPONSES ? { total_tokens: 19 } : {}) });
    });
  }
});

describe("mapped image-tool names at the nonstream JSON boundary", () => {
  it.each([FORMATS.OPENAI, FORMATS.CLAUDE])("returns the caller's original tool name to %s without failing the completed request", async (sourceFormat) => {
    const mapped = { id: "png_call", type: "function", function: { name: "short_read_png", arguments: '{"path":"capture.png"}' } };
    const result = await handleNonStreamingResponse({
      ...context(sourceFormat, FORMATS.OPENAI, Response.json(completion({
        role: "assistant", content: "Inspecting PNG.", tool_calls: [mapped],
      }, "tool"))),
      toolNameMap: new Map([["short_read_png", "read_png"]]),
    });
    expect(result.success).toBe(true);
    const message = readClientMessage(await result.response.json(), sourceFormat);
    expect(message.tools).toEqual([{ id: "png_call", type: "function", function: { name: "read_png", arguments: '{"path":"capture.png"}' } }]);
    expect(message.text).toBe("Inspecting PNG.");
  });
});
