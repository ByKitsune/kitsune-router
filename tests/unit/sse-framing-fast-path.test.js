import { afterEach, describe, expect, it, vi } from "vitest";
import { createSSEParser } from "../../open-sse/utils/sse.js";
import { createDisconnectAwareStream, createStreamController } from "../../open-sse/utils/streamHandler.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
afterEach(() => vi.useRealTimers());

describe("fragmented SSE framing work", () => {
  it("counts the exact event limit across mixed CR/LF fragments before retaining an oversized line", () => {
    const parser = createSSEParser({ maxEventChars: 16 });
    expect([...parser.feed(": x\r")]).toEqual([]);
    expect([...parser.feed("\nunknown: ")]).toEqual([]);
    expect(() => [...parser.feed("y".repeat(1024 * 1024))]).toThrow("exceeds limit");
    // CRLF's LF is a scanned framing byte, not an extra event character.
    expect(parser.getStats()).toEqual({ scannedChars: 18, pendingChars: 17, pendingLineChars: 9 });
    parser.reset();
    expect(parser.getStats().pendingChars).toBe(0);
    expect(parser.getStats().pendingLineChars).toBe(0);
  });

  it("pauses at a CR event boundary without processing the queued LF or payload-less native frames", () => {
    const parser = createSSEParser();
    const first = 'event: message_start\r\ndata: {"type":"message_start","opaque":"original+/="}\r\n\r';
    const ignored = '\nid: 1\revent: ignored\nretry: 20\r\n\r\n';
    const next = 'event: content_block_delta\ndata: {"type":"content_block_delta","text":"世界🌍"}\n\n';
    const iterator = parser.feed(encoder.encode(first + ignored + next.repeat(4096)));
    expect(iterator.next().value).toEqual({ event: "message_start", data: '{"type":"message_start","opaque":"original+/="}' });
    expect(parser.getStats().scannedChars).toBe(first.length);
    expect(iterator.next().value).toEqual({ event: "content_block_delta", data: '{"type":"content_block_delta","text":"世界🌍"}' });
    expect(parser.getStats().scannedChars).toBe(first.length + ignored.length + next.length);
    iterator.return();
    parser.reset();
    expect(parser.getStats().pendingLineChars).toBe(0);
  });
});

describe.each(["\n\n", "\r\r", "\r\n\r\n"])("native byte framing ending %j", ending => {
  it("retains large opaque/UTF-8 bytes, suppresses in-event pings, then resumes keepalive and releases cancellation", async () => {
    vi.useFakeTimers();
    let upstream;
    const cancel = vi.fn();
    const input = new ReadableStream({ start(controller) { upstream = controller; }, cancel }, { highWaterMark: 0 });
    const output = createDisconnectAwareStream({ readable: input }, createStreamController(), null, 10, FORMATS.CLAUDE);
    const reader = output.getReader();
    const prefix = encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "signature_delta", signature: "opaque-original+/=" }, padding: "x".repeat(128 * 1024), text: "世界🌍" })}`);
    const split = prefix.lastIndexOf(0xf0) + 2; // Split inside the emoji's UTF-8 bytes.
    const allocation = new Uint8Array(prefix.length + 16);
    allocation.set(prefix, 8);
    const chunks = [new DataView(allocation.buffer, 8, split), prefix.subarray(split), ...[...encoder.encode(ending)].map(byte => Uint8Array.of(byte))];
    const received = [];
    let pending = reader.read();
    for (let index = 0; index < chunks.length; index++) {
      upstream.enqueue(chunks[index]);
      const next = await pending;
      expect(next.done).toBe(false);
      received.push(Buffer.from(next.value.buffer, next.value.byteOffset, next.value.byteLength));
      expect(received.at(-1)).toEqual(Buffer.from(chunks[index].buffer, chunks[index].byteOffset, chunks[index].byteLength));
      let settled = false;
      pending = reader.read().then(value => { settled = true; return value; });
      await vi.advanceTimersByTimeAsync(25);
      if (index < chunks.length - 1) expect(settled).toBe(false);
    }
    expect(Buffer.concat(received)).toEqual(Buffer.concat([Buffer.from(prefix), Buffer.from(ending)]));
    expect(decoder.decode((await pending).value)).toBe("event: ping\ndata: {}\n\n");
    await reader.cancel("framing consumer finished");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(input.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    reader.releaseLock();
  });
});
