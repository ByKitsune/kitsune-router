import { beforeEach, describe, expect, it, vi } from "vitest";

const saved = { details: [], usage: [] };

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async (detail) => { saved.details.push(detail); }),
  enqueueRequestUsage: vi.fn(async (row) => { saved.usage.push(row); return { accepted: true, eventId: row.eventId }; }),
  trackPendingRequest: vi.fn(),
}));

const { handleStreamingResponse, buildOnStreamComplete } = await import(
  "../../open-sse/handlers/chatCore/streamingHandler.js"
);
const { createStreamController } = await import("../../open-sse/utils/streamHandler.js");

const encoder = new TextEncoder();

function upstreamResponse(chunks, { close = false } = {}) {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const body = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (close) {
        controller.close();
        return;
      }
      await held;
      controller.close();
    },
  });
  return {
    response: { body, headers: new Headers({ "content-type": "text/event-stream" }), status: 200 },
    release,
  };
}

const CHUNKS = [
  'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Counting "}}]}\n\n',
  'data: {"id":"1","choices":[{"index":0,"delta":{"content":"one two three"}}]}\n\n',
];

function baseCtx(overrides = {}) {
  return {
    provider: "opencode",
    model: "hy3-free",
    sourceFormat: "openai",
    targetFormat: "openai",
    body: { model: "hy3-free", stream: true, messages: [{ role: "user", content: "Count slowly" }] },
    stream: true,
    requestStartTime: Date.now(),
    connectionId: "conn-1",
    apiKey: "sk-test",
    clientRawRequest: { endpoint: "/v1/chat/completions" },
    ...overrides,
  };
}

describe("aborted streaming usage (#3488)", () => {
  beforeEach(() => {
    saved.details.length = 0;
    saved.usage.length = 0;
  });

  it("records partial content and estimated usage on client cancel", async () => {
    const calls = [];
    const ctx = baseCtx();
    const callbacks = buildOnStreamComplete(ctx);
    const streamController = createStreamController({ provider: ctx.provider, model: ctx.model });
    const upstream = upstreamResponse(CHUNKS);

    const result = await handleStreamingResponse({
      ...ctx,
      providerResponse: upstream.response,
      streamController,
      ...callbacks,
      onStreamAborted: (snapshot, reason) => {
        calls.push({ snapshot, reason });
        return callbacks.onStreamAborted(snapshot, reason);
      },
    });
    const reader = result.response.body.getReader();
    await reader.read();
    await reader.cancel("test disconnect");
    await new Promise((resolve) => setTimeout(resolve, 20));
    upstream.release();

    expect(calls).toHaveLength(1);
    expect(calls[0].snapshot.content).toContain("Counting");
    expect(saved.details.map((detail) => detail.status)).toEqual(["success", "aborted"]);
    expect(saved.details[0].id).toBe(callbacks.streamDetailId);
    expect(saved.details[1].id).toBe(callbacks.streamDetailId);
    expect(saved.usage).toHaveLength(1);
    expect(saved.usage[0].tokens.completion_tokens).toBeGreaterThan(0);
  });

  it("does not record abort after a normal completion", async () => {
    const calls = [];
    const ctx = baseCtx();
    const callbacks = buildOnStreamComplete(ctx);
    const streamController = createStreamController({ provider: ctx.provider, model: ctx.model });
    const upstream = upstreamResponse([...CHUNKS, "data: [DONE]\n\n"], { close: true });

    const result = await handleStreamingResponse({
      ...ctx,
      providerResponse: upstream.response,
      streamController,
      ...callbacks,
      onStreamAborted: (snapshot, reason) => {
        calls.push({ snapshot, reason });
        return callbacks.onStreamAborted(snapshot, reason);
      },
    });
    const reader = result.response.body.getReader();
    while (!(await reader.read()).done) { /* drain */ }
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls).toEqual([]);
    expect(saved.details.some((detail) => detail.status === "aborted")).toBe(false);
  });
});
