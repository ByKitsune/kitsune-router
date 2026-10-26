import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";

const fixture = vi.hoisted(() => ({ base: "", requests: [], reply: null, sse: false }));
const db = vi.hoisted(() => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("@/lib/usageDb.js", () => db);
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: vi.fn(async () => undefined) }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
  logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
}) }));
// Redirect only endpoint selection. Real translator, executor serialization,
// proxy-aware fetch, socket transport and response handling remain in the path.
vi.mock("../../open-sse/executors/index.js", async () => {
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor(provider) {
    const executor = new DefaultExecutor(provider);
    executor.buildUrl = () => fixture.base;
    return executor;
  } };
});
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";

let server;
const usage = { prompt_tokens: 12, completion_tokens: 16, total_tokens: 28, completion_tokens_details: { reasoning_tokens: 13 } };
const chatReply = { id: "loopback", object: "chat.completion", model: "fixture", choices: [{ index: 0, message: { role: "assistant", content: "answer" }, finish_reason: "stop" }], usage };
const responseReply = { id: "resp_loopback", object: "response", model: "fixture", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "answer" }] }], usage: { input_tokens: 12, output_tokens: 16, total_tokens: 28, output_tokens_details: { reasoning_tokens: 13 } } };
const message = [{ role: "user", content: "Reply briefly." }];
const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    fixture.requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.writeHead(200, { "content-type": fixture.sse ? "text/event-stream" : "application/json" });
    response.end(fixture.sse ? fixture.reply : JSON.stringify(fixture.reply));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  fixture.base = `http://127.0.0.1:${server.address().port}/budget-fixture`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
beforeEach(() => {
  vi.clearAllMocks();
  fixture.requests = [];
  fixture.reply = chatReply;
  fixture.sse = false;
});
async function dispatch(provider, model, sourceFormat, body) {
  return handleChatCore({
    body: { model, stream: false, ...body }, modelInfo: { provider, model },
    sourceFormatOverride: sourceFormat, credentials: { apiKey: "offline-fixture" },
    connectionId: "loopback-budget", log,
  });
}

describe("reasoning caps and usage over real loopback HTTP", () => {
  it("keeps a small Claude cap after translation and reports actual upstream usage", async () => {
    const result = await dispatch("openai", "gpt-5.4", "claude", { messages: message, max_tokens: 2000, thinking: { type: "enabled", budget_tokens: 1024 } });
    expect(result.success).toBe(true);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0].max_completion_tokens).toBe(2000);
    expect(fixture.requests[0].max_tokens).toBeUndefined();
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 16, reasoning_tokens: 13 });
    expect((await result.response.json()).usage.input_tokens).toBe(12);
  });

  it("retains modern cap through the Gemini wire without adding reasoning headroom", async () => {
    fixture.reply = { candidates: [{ content: { parts: [{ text: "answer" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, thoughtsTokenCount: 13, totalTokenCount: 28 } };
    const result = await dispatch("gemini", "gemini-2.5-pro", "openai", { messages: message, max_completion_tokens: 1000, reasoning_effort: "high" });
    expect(result.success).toBe(true);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0].generationConfig.maxOutputTokens).toBe(1000);
    expect(fixture.requests[0].generationConfig.thinkingConfig.thinkingBudget).toBeGreaterThan(0);
    expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 16, reasoning_tokens: 13 });
    expect((await result.response.json()).usage.completion_tokens).toBe(16);
  });

  it("sends Responses-native effort and cap with summary metadata intact", async () => {
    fixture.reply = responseReply;
    const result = await dispatch("openai", "gpt-6.1-sol", "openai-responses", {
      input: "Reply briefly.", max_output_tokens: 1000,
      reasoning: { effort: "high", summary: "detailed" }, include: ["reasoning.encrypted_content"],
    });
    expect(result.success).toBe(true);
    expect(fixture.requests[0]).toMatchObject({ max_output_tokens: 1000, reasoning: { effort: "high", summary: "detailed" }, include: ["reasoning.encrypted_content"] });
    expect(fixture.requests[0].reasoning_effort).toBeUndefined();
  });

  it("keeps a finite legacy cap when a nullable modern cap reaches final Chat serialization", async () => {
    const result = await dispatch("openai", "gpt-5.4", "openai", {
      messages: message, max_completion_tokens: null, max_tokens: 2000, reasoning_effort: "high",
    });
    expect(result.success).toBe(true);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0].max_completion_tokens).toBe(2000);
    expect(fixture.requests[0]).not.toHaveProperty("max_tokens");
  });

  it("persists reasoning charges even when no answer survives the cap", async () => {
    fixture.reply = { ...chatReply, choices: [{ index: 0, message: { role: "assistant", content: "", reasoning_content: "still thinking" }, finish_reason: "length" }] };
    const result = await dispatch("openai", "gpt-5.4", "openai", { messages: message, max_completion_tokens: 16, reasoning_effort: "high" });
    expect(result.status).toBe(400);
    expect((await result.response.json()).error.code).toBe("output_budget_exhausted");
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0].max_completion_tokens).toBe(16);
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 16, reasoning_tokens: 13 });
  });

  it("preserves an incomplete live Responses terminal without inventing disconnect failure", async () => {
    fixture.sse = true;
    const terminal = { ...responseReply, status: "incomplete", incomplete_details: { reason: "max_output_tokens" } };
    fixture.reply = `event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { id: terminal.id, status: "in_progress" } })}\n\nevent: response.incomplete\ndata: ${JSON.stringify({ type: "response.incomplete", response: terminal })}\n\n`;
    const result = await dispatch("openai", "gpt-6.1-sol", "openai-responses", { input: "Reply briefly.", max_output_tokens: 16, reasoning: { effort: "high" }, stream: true });
    const wire = await result.response.text();
    expect(wire).toContain("response.incomplete");
    expect(wire).not.toContain("stream_disconnected");
    expect(wire).not.toContain("response.failed");
    expect(fixture.requests).toHaveLength(1);
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 16, reasoning_tokens: 13 });
  });
  it("returns unwrapped native Gemini reasoning SSE through a Responses provider", async () => {
    fixture.sse = true;
    const terminal = {
      ...responseReply,
      output: [{ id: "rs_native", type: "reasoning", summary: [{ type: "summary_text", text: "Thought." }] }, ...responseReply.output],
    };
    fixture.reply = [
      { type: "response.created", response: { id: terminal.id, status: "in_progress" } },
      { type: "response.reasoning_summary_text.delta", item_id: "rs_native", summary_index: 0, delta: "Thought." },
      { type: "response.output_text.delta", item_id: "msg_native", content_index: 0, delta: "answer" },
      { type: "response.completed", response: terminal },
    ].map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
    const result = await dispatch("codex", "gpt-5.6-sol", "gemini", {
      contents: [{ role: "user", parts: [{ text: "Explain the result." }] }],
      generationConfig: { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 4096, includeThoughts: true } },
      stream: true,
    });
    expect(result.success).toBe(true);
    const frames = (await result.response.text()).split("\n")
      .filter(line => line.startsWith("data:") && line.slice(5).trim() !== "[DONE]")
      .map(line => JSON.parse(line.slice(5).trim()));
    expect(frames.some(frame => frame.response !== undefined)).toBe(false);
    const parts = frames.flatMap(frame => frame.candidates?.[0]?.content?.parts || []);
    expect(parts.filter(part => part.thought === true).map(part => part.text || "").join("")).toBe("Thought.");
    expect(parts.filter(part => part.thought !== true).map(part => part.text || "").join("")).toBe("answer");
    expect(frames.filter(frame => frame.usageMetadata).at(-1).usageMetadata).toEqual({
      promptTokenCount: 12, candidatesTokenCount: 3, thoughtsTokenCount: 13, totalTokenCount: 28,
    });
  });
});
