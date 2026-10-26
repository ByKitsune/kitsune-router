import { describe, expect, it } from "vitest";
import { createSSEParser, parseSSEEvent, SSE_LIMITS } from "../../open-sse/utils/sse.js";
import { parseSSELine } from "../../open-sse/utils/streamHelpers.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const encoder = new TextEncoder();
function parse(parts, options) {
  const parser = createSSEParser(options);
  const events = [];
  for (const part of parts) events.push(...parser.feed(part));
  events.push(...parser.end());
  return events;
}

describe("shared incremental SSE parser", () => {
  it.each(["\n", "\r\n", "\r"])("handles every byte split with %j framing, multiline data and UTF-8", newline => {
    const wire = encoder.encode([
      ": private heartbeat", "event: sample", 'data: {"text":', 'data: "世界 🌍"}', "", "event: discarded", "",
      'data: {"next":true}', "", "data: [DONE]", "",
    ].join(newline));
    const expected = [
      { event: "sample", data: '{"text":\n"世界 🌍"}' },
      { event: null, data: '{"next":true}' }, { event: null, data: "[DONE]" },
    ];
    for (let split = 0; split <= wire.length; split++) expect(parse([wire.subarray(0, split), wire.subarray(split)]), `split=${split}`).toEqual(expected);
    expect(parse([...wire].map(byte => Uint8Array.of(byte)))).toEqual(expected);
  });
  it("dispatches only exact data fields, strips one space, and resets event names at blank lines", () => {
    const parser = createSSEParser();
    expect([...parser.feed("event: forgotten\ndatax: wrong\ndata : wrong\n data: wrong\n\n")]).toEqual([]);
    expect([...parser.feed("event: kept\ndata:  first\ndata\ndata:\n")]).toEqual([]);
    expect([...parser.feed("\ndata: second\n\n")]).toEqual([
      { event: "kept", data: " first\n\n" }, { event: null, data: "second" },
    ]);
    expect([...parser.end()]).toEqual([]);
  });
  it("does not dispatch comment-only events or leak their event name", () => {
    expect(parse(["event: error\n: private debug\n\n", 'data: {"ok":true}\n\n'])).toEqual([{ event: null, data: '{"ok":true}' }]);
  });
  it.each(["", "\n", "\r", "\r\n"])("accepts a valid EOF tail ending with %j", ending => {
    expect(parse([`event: final\ndata: {"ok":true}${ending}`])).toEqual([{ event: "final", data: '{"ok":true}' }]);
  });
  it("flushes the persistent decoder at EOF", () => {
    const prefix = encoder.encode('data: {"text":"');
    const suffix = Uint8Array.of(0xf0, 0x9f);
    expect(parse([prefix, suffix])).toEqual([{ event: null, data: '{"text":"�' }]);
    expect(() => parseSSEEvent(parse([prefix, suffix])[0])).toThrow();
  });
  it("keeps NDJSON an explicit framing mode", () => {
    const raw = '{"message":{"content":"世界"},"done":false}\r\n{"done":true}';
    expect(parse([raw])).toEqual([]);
    expect(parse([raw], { mode: "ndjson" }).map(parseSSEEvent)).toEqual([{ message: { content: "世界" }, done: false }, { done: true }]);
    expect(parseSSELine('database: {"not":"data"}')).toBeNull();
    expect(parseSSELine('{"done":true}', FORMATS.OPENAI)).toBeNull();
    expect(parseSSELine('{"done":true}', FORMATS.OLLAMA)).toEqual({ done: true });
    expect(parseSSELine('{"done":true}')).toEqual({ done: true });
  });
  it.each([1023, 1024, 1025, 2048])("preserves every multiline separator across %s data fields", count => {
    const expected = Array.from({ length: count }, (_, index) => index % 2 ? "" : String(index));
    expect(parse([expected.map(value => `data: ${value}\n`).join("") + "\n"])).toEqual([{ event: null, data: expected.join("\n") }]);
  });
  it("bounds unterminated data, comments and unknown fields without a media-sized tiny default", () => {
    expect(SSE_LIMITS.eventChars).toBeGreaterThanOrEqual(32 * 1024 * 1024);
    for (const prefix of ["data:", ":", "unknown:"]) {
      const parser = createSSEParser({ maxEventChars: 32 });
      expect(() => [...parser.feed(prefix + "x".repeat(33))]).toThrow("exceeds limit");
      parser.reset();
      expect(parser.getStats().pendingChars).toBe(0);
    }
  });
});
