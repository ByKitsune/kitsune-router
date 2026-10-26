import { describe, it, expect, vi } from "vitest";
import "./registerAll.js";
import { initState, translateResponse } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { handleForcedSSEToJson } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));

const cases = [
  ["reasoning", { reasoning_content: "Check carefully" }, { summary: [{ type: "summary_text", text: "Check carefully" }] }],
  ["message", { content: "Hello" }, { role: "assistant", content: [{ type: "output_text", text: "Hello", annotations: [], logprobs: [] }] }],
  ["function_call", { tool_calls: [{ index: 0, id: "call_read", type: "function", function: { name: "read", arguments: '{"path":"a"}' } }] }, { id: "fc_call_read", call_id: "call_read", name: "read", arguments: '{"path":"a"}' }],
  ["custom_tool_call", { tool_calls: [{ index: 0, id: "call_exec", type: "function", function: { name: "exec", arguments: '{"input":"echo hello"}' } }] }, { id: "ctc_call_exec", call_id: "call_exec", name: "exec", input: "echo hello" }],
];

// Model the status checks performed by Responses API validating consumers.
function acceptItem(item, status) {
  expect(item.status).toBe(status);
  expect(["reasoning", "message", "function_call", "custom_tool_call"]).toContain(item.type);
}

describe("Responses output item lifecycle contract (#4498)", () => {
  it.each(cases)("streams %s with valid added, done and terminal statuses", (type, delta, fields) => {
    const state = initState(FORMATS.OPENAI_RESPONSES);
    state.created = 123;
    state.targetFormat = FORMATS.OPENAI;
    state.customToolNames = new Set(["exec"]);
    const convert = (chunk) => translateResponse(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, chunk, state);
    const events = [
      ...convert({ id: "chatcmpl-status", choices: [{ index: 0, delta }] }),
      ...convert({ choices: [{ index: 0, delta: {}, finish_reason: delta.tool_calls ? "tool_calls" : "stop" }] }),
      ...convert({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 3 } }),
      ...convert(null),
    ];
    const added = events.filter((event) => event.event === "response.output_item.added");
    const done = events.filter((event) => event.event === "response.output_item.done");
    expect(added).toHaveLength(1);
    expect(done).toHaveLength(1);
    acceptItem(added[0].data.item, "in_progress");
    acceptItem(done[0].data.item, "completed");
    expect(done[0].data.item).toMatchObject({ type, ...fields });
    expect(done[0].data.item.id).toBe(added[0].data.item.id);
    const completed = events.filter((event) => event.event === "response.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0].data.response.output).toEqual([done[0].data.item]);
    acceptItem(completed[0].data.response.output[0], "completed");
    expect(completed[0].data.response.usage).toEqual({ input_tokens: 7, output_tokens: 3, total_tokens: 10 });
  });

  it("converts complete JSON with completed statuses and intact text, reasoning and both tool kinds", () => {
    const response = translateNonStreamingResponse({
      id: "chatcmpl-status", created: 123, model: "test-model",
      choices: [{ finish_reason: "tool_calls", message: {
        role: "assistant", reasoning_content: "Check carefully", content: "Hello",
        tool_calls: [cases[2][1].tool_calls[0], cases[3][1].tool_calls[0]],
      } }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    }, FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, new Set(["exec"]));
    expect(response.output.map((item) => item.type)).toEqual(cases.map(([type]) => type));
    for (const item of response.output) acceptItem(item, "completed");
    expect(response.output[0].summary).toEqual(cases[0][2].summary);
    expect(response.output[1].content).toEqual([{ type: "output_text", text: "Hello", annotations: [] }]);
    expect(response.output[2]).toMatchObject(cases[2][2]);
    expect(response.output[3]).toMatchObject(cases[3][2]);
    expect(response.usage).toEqual({ input_tokens: 7, output_tokens: 3, total_tokens: 10 });
  });

  it.each(cases)("returns completed %s when a chat upstream forces SSE for a JSON client", async (type, delta, fields) => {
    const chunks = [{ id: "chatcmpl-status", created: 123, choices: [{ index: 0, delta }] }];
    chunks.push({ choices: [{ delta: {}, finish_reason: delta.tool_calls ? "tool_calls" : "stop" }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } });
    const raw = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
    const result = await handleForcedSSEToJson({
      providerResponse: new Response(raw, { headers: { "content-type": "text/event-stream" } }),
      sourceFormat: FORMATS.OPENAI_RESPONSES, targetFormat: FORMATS.OPENAI,
      provider: "op-test-chat", model: "test-model", body: { messages: [] }, stream: false,
      requestStartTime: Date.now(), trackDone: vi.fn(), appendLog: vi.fn(),
      customToolNames: new Set(["exec"]), clientRawRequest: { endpoint: "/v1/responses" },
    });
    expect(result.success).toBe(true);
    const response = await result.response.json();
    expect(response.output.map((item) => item.type)).toEqual([type]);
    acceptItem(response.output[0], "completed");
    if (type === "message") {
      expect(response.output[0].content).toEqual([{ type: "output_text", text: "Hello", annotations: [] }]);
    } else {
      expect(response.output[0]).toMatchObject(fields);
    }
    expect(response.usage).toEqual({ input_tokens: 7, output_tokens: 3, total_tokens: 10 });
  });
});
