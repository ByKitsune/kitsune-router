import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}), trackPendingRequest: vi.fn(),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));

import { FORMATS } from "../../open-sse/translator/formats.js";
import { handleNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { handleForcedSSEToJson } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { handleStreamingResponse } from "../../open-sse/handlers/chatCore/streamingHandler.js";
import { createStreamController } from "../../open-sse/utils/streamHandler.js";

const nativeUsage = {
  input_tokens: 2486, output_tokens: 9, total_tokens: 2495,
  input_tokens_details: { cached_tokens: 2304, cache_write_tokens: 100,
    cache_write_tokens_details: { ttl_30m_tokens: 40, ttl_12h_tokens: 60 } },
  output_tokens_details: { reasoning_tokens: 6 },
};
const requested = "cx/gpt-6-astra-review";
const nativeResponse = () => ({
  id: "resp_contract_identity", object: "response", status: "completed", model: "gpt-6-astra",
  service_tier: "priority", usage: structuredClone(nativeUsage),
  output: [
    { id: "rs_contract", type: "reasoning", summary: [{ type: "summary_text", text: "Visible summary." }], encrypted_content: "opaque-not-readable" },
    { id: "msg_contract", type: "message", role: "assistant", content: [{ type: "output_text", text: "Answer" }] },
  ],
});
const frames = (events) => events.map(value => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`).join("");
function responsesStream() {
  const response = nativeResponse();
  return new Response(frames([
    { type: "response.created", response: { id: response.id, object: "response", model: response.model, status: "in_progress" } },
    { type: "response.reasoning_summary_text.delta", item_id: "rs_contract", output_index: 0, summary_index: 0, delta: "Visible summary." },
    { type: "response.output_text.delta", item_id: "msg_contract", output_index: 1, content_index: 0, delta: "Answer" },
    { type: "response.completed", response },
  ]), { headers: { "content-type": "text/event-stream" } });
}
function context(providerResponse, sourceFormat = FORMATS.OPENAI, model = requested) {
  return {
    providerResponse, sourceFormat, targetFormat: FORMATS.OPENAI_RESPONSES,
    provider: "codex", model: "gpt-6-astra", body: { model: "codex/gpt-6-astra", messages: [] },
    stream: false, requestStartTime: Date.now(), clientRawRequest: { endpoint: "/v1/chat/completions", body: { model } },
    trackDone: vi.fn(), appendLog: vi.fn(), reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn() },
    streamController: createStreamController(),
  };
}
function parseData(text) {
  return text.split("\n").filter(line => line.startsWith("data: ") && !line.includes("[DONE]"))
    .map(line => JSON.parse(line.slice(6)));
}

describe("public response identity and measured usage", () => {
  it.each(["native JSON", "forced SSE JSON"])("%s keeps requested review identity and inclusive cache accounting", async mode => {
    const result = mode === "native JSON"
      ? await handleNonStreamingResponse(context(Response.json(nativeResponse())))
      : await handleForcedSSEToJson(context(responsesStream()));
    expect(result.response.status).toBe(200);
    const json = await result.response.json();
    expect(json.model).toBe(requested);
    expect(json.id).toMatch(/^chatcmpl-/);
    expect(json.usage).toEqual({ prompt_tokens: 2486, completion_tokens: 9, total_tokens: 2495,
      prompt_tokens_details: nativeUsage.input_tokens_details, completion_tokens_details: nativeUsage.output_tokens_details });
    expect(json.service_tier).toBe("priority");
    expect(json.choices[0].message).toMatchObject({ content: "Answer", reasoning_content: "Visible summary." });
    expect(JSON.stringify(json)).not.toContain("opaque-not-readable");
  });

  it.each(["droid/1.0", "codex-cli/0.163", "ordinary-client"])("%s gets Chat framing and readable reasoning on the Chat endpoint", async userAgent => {
    const result = await handleStreamingResponse({ ...context(responsesStream()), userAgent });
    const text = await result.response.text();
    const chunks = parseData(text);
    expect(chunks.every(chunk => chunk.object === "chat.completion.chunk" && chunk.model === requested)).toBe(true);
    expect(new Set(chunks.map(chunk => chunk.id)).size).toBe(1);
    expect(chunks[0].id).toMatch(/^chatcmpl-/);
    expect(chunks.flatMap(chunk => chunk.choices).map(choice => choice.delta?.reasoning_content || "").join("")).toBe("Visible summary.");
    expect(chunks.flatMap(chunk => chunk.choices).map(choice => choice.delta?.content || "").join("")).toBe("Answer");
    expect(chunks.find(chunk => chunk.usage)?.usage.prompt_tokens_details).toEqual(nativeUsage.input_tokens_details);
    expect(text).not.toContain("event: response.");
    expect(text).not.toContain("opaque-not-readable");
  });

  it.each(["ag/gemini-3.8-flash-high", "ag/gemini-3.8-flash-low"])("preserves exact %s identity over translated JSON and Chat passthrough", async model => {
    const response = { response: { responseId: "ag_contract", modelVersion: "gemini-3.8-flash-n", candidates: [{ content: { parts: [{ text: "Gemini answer" }] }, finishReason: "STOP" }] } };
    const ctx = { ...context(Response.json(response), FORMATS.OPENAI, model), provider: "antigravity", targetFormat: FORMATS.ANTIGRAVITY };
    const json = await (await handleNonStreamingResponse(ctx)).response.json();
    expect(json.model).toBe(model);
    expect(json.choices[0].message.content).toBe("Gemini answer");
    const upstream = [{ id: "resp_upstream_chat", model: "gemini-3.8-flash-n", choices: [{ index: 0, delta: { content: "Gemini answer" }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }];
    const stream = await handleStreamingResponse({ ...ctx, targetFormat: FORMATS.OPENAI,
      providerResponse: new Response(upstream.map(value => `data: ${JSON.stringify(value)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }) });
    const chunks = parseData(await stream.response.text());
    expect(chunks.every(chunk => chunk.model === model)).toBe(true);
    expect(new Set(chunks.map(chunk => chunk.id))).toEqual(new Set(["chatcmpl-upstream_chat"]));
  });

  it("keeps native Responses framing/IDs while echoing the requested route", async () => {
    const result = await handleStreamingResponse(context(responsesStream(), FORMATS.OPENAI_RESPONSES));
    const text = await result.response.text();
    const events = parseData(text);
    const responses = events.filter(event => event.response).map(event => event.response);
    expect(responses.every(response => response.id === "resp_contract_identity" && response.model === requested)).toBe(true);
    expect(events.find(event => event.type === "response.completed").response.output).toEqual(nativeResponse().output);
    expect(text).toContain("event: response.completed");
  });
});
