import { describe, expect, it, vi } from "vitest";
import "../translator/registerAll.js";

const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
  appendProviderChunk() {}, appendConvertedChunk() {}, flush() {},
}) }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// 9Router #5296: this tests Core's streaming boundary, not the Next.js server
// or a real provider. The upstream deliberately stays open until after the read.
it("emits Codex Chat text before the synthetic upstream finishes", async () => {
  const encoder = new TextEncoder();
  const event = data => `data: ${JSON.stringify(data)}\n\n`;
  let upstream;
  let upstreamEnded = false;
  const bodyStream = new ReadableStream({
    start(controller) {
      upstream = controller;
      controller.enqueue(encoder.encode(event({ type: "response.created", response: { id: "resp_fixture", status: "in_progress" } })));
      controller.enqueue(encoder.encode(event({ type: "response.output_text.delta", item_id: "msg_fixture", output_index: 0, content_index: 0, delta: "early fixture text" })));
    },
    cancel() { upstreamEnded = true; },
  });
  io.fetch.mockReset();
  io.fetch.mockResolvedValue(new Response(bodyStream, { headers: { "content-type": "text/event-stream" } }));
  const body = { model: "gpt-6.1-sol", messages: [{ role: "user", content: "offline fixture" }], stream: true, stream_options: { include_usage: true } };
  const abort = new AbortController();
  let timer;
  const deadline = promise => Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("stream did not deliver before upstream EOF")), 2000); }),
  ]).finally(() => clearTimeout(timer));
  let reader;
  try {
    const result = await deadline(handleChatCore({
      body, modelInfo: { provider: "codex", model: "gpt-6.1-sol" }, credentials: { accessToken: "offline-token" },
      sourceFormatOverride: FORMATS.OPENAI, connectionId: "offline-connection", clientSignal: abort.signal,
      clientRawRequest: { endpoint: "/v1/chat/completions", body, headers: {} },
      log: { debug() {}, info() {}, warn() {}, error() {} },
    }));
    expect(result.success).toBe(true);
    reader = result.response.body.getReader();
    let text = "";
    for (let count = 0; count < 12 && !text.includes("early fixture text"); count++) {
      const chunk = await deadline(reader.read());
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    expect(text).toContain("early fixture text");
    expect(upstreamEnded).toBe(false);
  } finally {
    abort.abort(new Error("offline test finished"));
    if (!upstreamEnded) { try { upstream.close(); } catch {} }
    if (reader) await reader.cancel().catch(() => {});
  }
});
