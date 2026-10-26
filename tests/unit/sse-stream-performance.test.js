import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}) }));
import { createSSEParser } from "../../open-sse/utils/sse.js";
import { createSSEStream } from "../../open-sse/utils/stream.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const chat = (text, finish_reason = null) => `data: ${JSON.stringify({ id: "chatcmpl-perf", choices: [{ index: 0, delta: { content: text }, finish_reason }] })}\n\n`;

describe("incremental parser work and retention bounds", () => {
  it.each([1, 7, 1024, 65536])("scans a fragmented large argument once at %s-byte chunks", fragmentSize => {
    const measurements = [1, 2, 4].map(scale => {
      const payload = "x".repeat(64 * 1024 * scale);
      const text = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: payload } }] } }] })}\n\n`;
      const bytes = encoder.encode(text);
      const parser = createSSEParser();
      let count = 0;
      let event;
      for (let cursor = 0; cursor < bytes.length; cursor += fragmentSize) {
        for (const value of parser.feed(bytes.subarray(cursor, cursor + fragmentSize))) { count++; event = value; }
      }
      expect(count).toBe(1);
      expect(JSON.parse(event.data).choices[0].delta.tool_calls[0].function.arguments).toBe(payload);
      const stats = parser.getStats();
      expect(stats.scannedChars).toBe(text.length);
      expect(stats.pendingChars).toBe(0);
      expect(stats.pendingLineChars).toBe(0);
      return stats.scannedChars;
    });
    expect(measurements[1]).toBeLessThan(measurements[0] * 2);
    expect(measurements[2]).toBeLessThan(measurements[0] * 4);
  });

  it("does not build an event array for the unused suffix of a huge network chunk", () => {
    const parser = createSSEParser();
    const first = chat("first");
    const iterator = parser.feed(encoder.encode(first + chat("later").repeat(20000)));
    expect(JSON.parse(iterator.next().value.data).choices[0].delta.content).toBe("first");
    expect(parser.getStats().scannedChars).toBe(first.length);
    iterator.return();
    parser.reset();
    expect(parser.getStats().pendingChars).toBe(0);
  });

  it("releases each dispatch rather than retaining prior event buffers", () => {
    const parser = createSSEParser();
    const wire = encoder.encode(chat("x".repeat(8192)));
    for (let index = 0; index < 1024; index++) {
      for (const event of parser.feed(wire)) expect(event.data.length).toBeGreaterThan(8192);
      expect(parser.getStats().pendingChars).toBe(0);
      expect(parser.getStats().pendingLineChars).toBe(0);
    }
    expect(parser.getStats().scannedChars).toBe(wire.length * 1024);
  });
});

it("delivers the first semantic event before EOF and before parsing a large batch", async () => {
  let upstream;
  let emitted = 0;
  const input = new ReadableStream({ start(controller) { upstream = controller; } });
  const transform = createSSEStream({ reqLogger: { appendConvertedChunk() { emitted++; } } });
  const reader = input.pipeThrough(transform).getReader();
  upstream.enqueue(encoder.encode(chat("first semantic token") + chat("later").repeat(20000)));
  const first = await reader.read();
  expect(first.done).toBe(false);
  expect(decoder.decode(first.value)).toContain("first semantic token");
  expect(emitted).toBeLessThanOrEqual(3);
  await reader.cancel("performance consumer finished");
  reader.releaseLock();
});
