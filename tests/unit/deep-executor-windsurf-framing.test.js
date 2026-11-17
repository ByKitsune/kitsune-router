import { describe, expect, it } from "vitest";
import WindsurfExecutor, { grpcWebFrame } from "../../open-sse/executors/windsurf.js";

function varint(value) {
  const bytes = [];
  while (value > 127) { bytes.push((value & 127) | 128); value >>>= 7; }
  return [...bytes, value];
}
function field(number, value) {
  return new Uint8Array([...varint((number << 3) | 2), ...varint(value.length), ...value]);
}
function content(text) {
  return grpcWebFrame(field(1, field(1, new TextEncoder().encode(text))));
}
function trailer() {
  const frame = grpcWebFrame(new TextEncoder().encode("grpc-status: 0\r\n"));
  frame[0] = 0x80;
  return frame;
}
async function translated(chunks) {
  const source = new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); },
  }));
  const text = await new WindsurfExecutor().transformToSSE(source, "synthetic-windsurf-model").text();
  return { text, events: text.split("\n").filter(line => line.startsWith("data: ") && line !== "data: [DONE]")
    .map(line => JSON.parse(line.slice(6))) };
}
function successfulFinishes(events) {
  return events.flatMap(event => event.choices || []).filter(choice => choice.finish_reason === "stop");
}

describe("Windsurf gRPC-web transport EOF integrity", () => {
  it.each([
    { name: "one-byte header", bytes: [0] },
    { name: "four-byte header", bytes: [0, 0, 0, 0] },
    { name: "truncated payload", bytes: [0, 0, 0, 0, 4, 10, 2] },
    { name: "oversized signed-length header", bytes: [0, 128, 0, 0, 0] },
  ])("does not label a $name as a successful completion", async ({ bytes }) => {
    const { text, events } = await translated([new Uint8Array(bytes)]);
    expect(events.some(event => event.error?.message.includes("Incomplete gRPC-web frame"))).toBe(true);
    expect(successfulFinishes(events)).toEqual([]);
    expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it("preserves already-emitted text but reports a truncated later frame instead of success", async () => {
    const { events } = await translated([content("Partial result 🌸"), new Uint8Array([128, 0, 0])]);
    expect(events.flatMap(event => event.choices || []).map(choice => choice.delta?.content || "").join(""))
      .toBe("Partial result 🌸");
    expect(events.some(event => event.error)).toBe(true);
    expect(successfulFinishes(events)).toEqual([]);
  });

  it("does not manufacture success for an empty HTTP200 body without a native frame", async () => {
    const { events } = await translated([]);
    expect(events.some(event => event.error?.message.includes("no gRPC-web frames"))).toBe(true);
    expect(successfulFinishes(events)).toEqual([]);
  });

  it("retains valid Unicode content and exactly one terminal finish across every byte boundary", async () => {
    const bytes = new Uint8Array([...content("Valid 🌸 result"), ...trailer()]);
    const { text, events } = await translated(Array.from(bytes, byte => new Uint8Array([byte])));
    expect(events.flatMap(event => event.choices || []).map(choice => choice.delta?.content || "").join(""))
      .toBe("Valid 🌸 result");
    expect(events.some(event => event.error)).toBe(false);
    expect(successfulFinishes(events)).toHaveLength(1);
    expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it("streams many native text frames without dropping or replaying fragments", async () => {
    const fragments = Array.from({ length: 200 }, (_, index) => `piece-${index};`);
    const { events } = await translated([...fragments.map(content), trailer()]);
    expect(events.flatMap(event => event.choices || []).map(choice => choice.delta?.content || "").join(""))
      .toBe(fragments.join(""));
    expect(successfulFinishes(events)).toHaveLength(1);
  });
});
