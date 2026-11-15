import { describe, expect, it, vi } from "vitest";
import { FORMATS } from "open-sse/translator/formats.js";
import { createDisconnectAwareStream, createStreamController } from "open-sse/utils/streamHandler.js";
import { createSSEParser } from "open-sse/utils/sse.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("SSE keepalive heartbeat (#3409)", () => {
  it("emits a typed Claude ping during upstream silence", async () => {
    let timer1, timer2;
    const transformStream = new TransformStream({
      start(controller) {
        timer1 = setTimeout(() => {
          controller.enqueue(encoder.encode('event: message_start\ndata: {"type":"message_start","message":{"type":"message","role":"assistant","content":[]}}\n\n'));
        }, 120);
        timer2 = setTimeout(() => {
          controller.enqueue(encoder.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));
          controller.terminate();
        }, 240);
      }
    });

    const streamController = createStreamController({ provider: "claude", model: "claude-sonnet-4-6" });
    const disconnectAwareStream = createDisconnectAwareStream(
      transformStream,
      streamController,
      null,
      40, // 40ms keepalive
      FORMATS.CLAUDE
    );

    const reader = disconnectAwareStream.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }

    clearTimeout(timer1);
    clearTimeout(timer2);

    const parser = createSSEParser();
    const events = [...parser.feed(chunks.join("")), ...parser.end()];
    expect(events.filter(event => event.event === "ping").length).toBeGreaterThan(0);
    for (const event of events) {
      expect(JSON.parse(event.data).type).toBe(event.event);
    }
    expect(chunks.some(chunk => chunk.includes('event: ping\ndata: {"type":"ping"}\n\n'))).toBe(true);
    expect(chunks.some(chunk => chunk.includes("event: message_start"))).toBe(true);
    expect(chunks.some(chunk => chunk.includes("event: message_stop"))).toBe(true);
  });

  it("emits OpenAI format : ping\\n\\n comment during upstream silence", async () => {
    let timer1, timer2;
    const transformStream = new TransformStream({
      start(controller) {
        timer1 = setTimeout(() => {
          controller.enqueue(encoder.encode("data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n"));
        }, 120);
        timer2 = setTimeout(() => {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.terminate();
        }, 240);
      }
    });

    const streamController = createStreamController({ provider: "openai", model: "gpt-5.4" });
    const disconnectAwareStream = createDisconnectAwareStream(
      transformStream,
      streamController,
      null,
      40, // 40ms keepalive
      FORMATS.OPENAI
    );

    const reader = disconnectAwareStream.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }

    clearTimeout(timer1);
    clearTimeout(timer2);

    expect(chunks.some(chunk => chunk === ": ping\n\n")).toBe(true);
    expect(chunks.some(chunk => chunk.includes("choices"))).toBe(true);
    expect(chunks.some(chunk => chunk.includes("[DONE]"))).toBe(true);
  });

  it("clears keepalive timer immediately when stream completes or is cancelled", async () => {
    const transformStream = new TransformStream({
      start(controller) {
        controller.enqueue(encoder.encode("data: 1\n\n"));
        controller.terminate();
      }
    });

    const streamController = createStreamController({ provider: "test", model: "test" });
    const stream = createDisconnectAwareStream(
      transformStream,
      streamController,
      null,
      30,
      FORMATS.OPENAI
    );

    const reader = stream.getReader();
    const { done } = await reader.read();
    expect(done).toBe(false);
    const end = await reader.read();
    expect(end.done).toBe(true);
  });
});
