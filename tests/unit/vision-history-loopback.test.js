import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import "../translator/registerAll.js";

const fixture = vi.hoisted(() => ({ base: "", requests: [] }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("../../open-sse/executors/index.js", async () => {
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor(provider) {
    const executor = new DefaultExecutor(provider);
    executor.buildUrl = () => `${fixture.base}/${provider}`;
    return executor;
  } };
});
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";

let server;
const imageData = "iVBORw0KGgoAAAANSUhEUgAACHwAAALU" + "QUJD".repeat(32768);
const log = { debug() {}, info() {}, warn() {} };
beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    fixture.requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(request.url === "/gemini"
      ? { candidates: [{ content: { parts: [{ text: "The two PNGs have different labels." }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 35, candidatesTokenCount: 10, totalTokenCount: 45 } }
      : { id: "vision-loopback", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "The supplied text is readable." }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  fixture.base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
beforeEach(() => { fixture.requests = []; });

const dispatch = (body, provider, model, sourceFormatOverride = "openai") => handleChatCore({
  body, modelInfo: { provider, model }, sourceFormatOverride,
  credentials: { apiKey: "synthetic-vision-fixture" }, connectionId: "vision-loopback", log,
});

function googleMedia(body) {
  const parts = body.contents.flatMap(turn => turn.parts);
  return {
    images: parts.filter(part => part.inlineData?.mime_type === "image/png" || part.inlineData?.mimeType === "image/png"),
    text: parts.map(part => part.text || JSON.stringify(part.functionResponse?.response || "")).join("\n"),
  };
}

describe("multimodal history over the real translator/executor/fetch stack", () => {
  it("does not let a text-only attempt erase images from a subsequent vision attempt", async () => {
    const body = { stream: false, messages: [
      { role: "system", content: "Compacted context: 133592 tokens were summarized." },
      { role: "user", content: [{ type: "text", text: "Read PNG 2172x724" }, { type: "image_url", image_url: { url: `data:image/png;base64,${imageData}` } }] },
    ] };
    const original = structuredClone(body);
    const textResult = await dispatch(body, "openai", "gpt-3.5-turbo");
    expect(textResult.success).toBe(true);
    const visionResult = await dispatch(body, "gemini", "gemini-3.8-flash");
    expect(visionResult.success).toBe(true);
    const wire = googleMedia(fixture.requests[1]);
    expect(wire.images.map(part => part.inlineData.data === imageData)).toEqual([true]);
    expect(wire.text.includes(imageData)).toBe(false);
    expect(body).toEqual(original);
  });

  it("keeps image-heavy Responses tool results out of Gemini text after a compaction summary", async () => {
    const body = { stream: false, input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "Compacted context: compare the next PNG captures." }] },
      { type: "function_call", call_id: "read_png", name: "read_file", arguments: "{}" },
      { type: "function_call_output", call_id: "read_png", output: [
        { type: "input_text", text: "PNG 2172x724 and its variant" },
        { type: "input_image", image_url: `data:image/png;base64,${imageData}` },
        { type: "input_image", image_url: `data:image/png;base64,${imageData}QUJD` },
      ] },
      { type: "message", role: "user", content: [{ type: "input_text", text: "What changed?" }] },
    ] };
    const result = await dispatch(body, "gemini", "gemini-3.8-flash", "openai-responses");
    expect(result.success).toBe(true);
    const wire = googleMedia(fixture.requests[0]);
    expect(wire.images.map(part => part.inlineData.data === imageData || part.inlineData.data === `${imageData}QUJD`)).toEqual([true, true]);
    expect(wire.text.length).toBeLessThan(1000);
    expect(wire.text.includes(imageData)).toBe(false);
    expect((await result.response.json()).output.some(item => item.type === "message")).toBe(true);
  });
});
