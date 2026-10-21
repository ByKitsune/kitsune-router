import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { constants, zstdCompressSync } from "node:zlib";
import { Buffer } from "node:buffer";

const fixture = vi.hoisted(() => ({ limits: { maxWireBytes: 4096, maxDecodedBytes: 8192, timeoutMs: 1000 } }));
vi.mock("../../src/shared/constants/requestBodyConfig.js", async importOriginal => ({
  ...await importOriginal(), REQUEST_BODY_LIMITS: fixture.limits,
}));

import { readRequestJson, RequestBodyError } from "../../src/shared/utils/requestJson.js";

function request(body, encoding, headers = {}, signal) {
  return new Request("http://localhost/v1/responses", {
    method: "POST", body, signal, duplex: "half",
    headers: { "content-type": "application/json", ...(encoding ? { "content-encoding": encoding } : {}), ...headers },
  });
}
function fragmented(bytes, size = 1) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset += Math.min(size, bytes.length - offset)));
    },
  }, { highWaterMark: 0 });
}

beforeEach(() => { Object.assign(fixture.limits, { maxWireBytes: 4096, maxDecodedBytes: 8192, timeoutMs: 1000 }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("G07 bounded request JSON reader", () => {
  it("retains UTF-8 split across tiny identity chunks and releases the reader", async () => {
    const stream = fragmented(Buffer.from('{"text":"猫 🦊","max_output_tokens":37}'));
    expect(await readRequestJson(request(stream, "identity"))).toEqual({ text: "猫 🦊", max_output_tokens: 37 });
    expect(stream.locked).toBe(false);
  });

  it("bounds retained segment metadata for tiny-byte input, not just payload bytes", async () => {
    const bytes = Buffer.from(JSON.stringify({ text: "a".repeat(200) }));
    let offset = 0;
    const inbound = request(new ReadableStream({
      async pull(controller) {
        await new Promise(resolve => setImmediate(resolve));
        if (offset === bytes.length) return controller.close();
        controller.enqueue(bytes.subarray(offset, ++offset));
      },
    }, { highWaterMark: 0 }));
    // Observe the real final allocation boundary, without replacing concat or
    // the parser: tiny uploads must not retain one Buffer/array entry per byte.
    const allocations = vi.spyOn(Buffer, "concat");
    expect(await readRequestJson(inbound)).toEqual({ text: "a".repeat(200) });
    expect(allocations.mock.calls.at(-1)[0].length).toBeLessThanOrEqual(8);
  });

  it("decodes a real checksummed frame split at every byte", async () => {
    const bytes = zstdCompressSync('{"text":"猫 🦊","cap":37}', { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
    expect(await readRequestJson(request(fragmented(bytes), "zstd"))).toEqual({ text: "猫 🦊", cap: 37 });
  });

  it("retains a raw-block JSON value followed by a last RLE padding block", async () => {
    // Independent RFC 8878 fixture: 102-byte single-segment frame, a non-last
    // two-byte raw block '{}', then a last 100-byte RLE block of spaces.
    const bytes = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, 102, 0x10, 0, 0, 0x7b, 0x7d, 0x23, 3, 0, 32]);
    expect(await readRequestJson(request(fragmented(bytes), "zstd"))).toEqual({});
  });

  it("reads an explicit 64-bit frame content size without coercing or dropping it", async () => {
    const bytes = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0xe0, 2, 0, 0, 0, 0, 0, 0, 0, 0x11, 0, 0, 0x7b, 0x7d]);
    expect(await readRequestJson(request(fragmented(bytes), "zstd"))).toEqual({});
  });

  it("rejects a damaged checksum even when its frame and JSON are complete", async () => {
    const bytes = zstdCompressSync("{}", { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
    bytes[bytes.length - 1] ^= 1;
    await expect(readRequestJson(request(bytes, "zstd"))).rejects.toMatchObject({ status: 400, code: "invalid_compressed_body" });
  });

  it.each([false, true])("rejects every truncated prefix of a frame (checksum=%s), even if JSON was already emitted", async checksum => {
    const bytes = zstdCompressSync('{"cap":37}', { params: { [constants.ZSTD_c_checksumFlag]: Number(checksum) } });
    for (let length = 0; length < bytes.length; length++) {
      const result = await readRequestJson(request(bytes.subarray(0, length), "zstd")).then(body => ({ body }), error => error);
      expect(result, `truncated at ${length}/${bytes.length}`).toMatchObject({ status: 400, code: "invalid_compressed_body" });
    }
  });

  it.each([1, 2, 1024])("retains bounded concatenated and skippable standard zstd frames (chunk=%s)", async chunkSize => {
    const skip = Buffer.from([0x50, 0x2a, 0x4d, 0x18, 3, 0, 0, 0, 1, 2, 3]);
    const bytes = Buffer.concat([skip, zstdCompressSync('{"ca'), zstdCompressSync('p":37}')]);
    expect(await readRequestJson(request(fragmented(bytes, chunkSize), "zstd"))).toEqual({ cap: 37 });
  });

  it("rejects trailing truncated/skippable framing after valid JSON", async () => {
    const bytes = Buffer.concat([zstdCompressSync("{}"), Buffer.from([0x50, 0x2a, 0x4d, 0x18, 3, 0, 0, 0, 1])]);
    await expect(readRequestJson(request(fragmented(bytes), "zstd"))).rejects.toMatchObject({ status: 400, code: "invalid_compressed_body" });
  });

  it.each([undefined, "2", "not-a-number"])("counts actual compressed wire bytes rather than trusting Content-Length=%s", async length => {
    fixture.limits.maxWireBytes = 16;
    const bytes = zstdCompressSync(JSON.stringify({ text: "a sufficiently long independent value" }));
    const stream = fragmented(bytes, 8);
    await expect(readRequestJson(request(stream, "zstd", length ? { "content-length": length } : {}))).rejects.toMatchObject({ status: 413, code: "request_body_too_large" });
    expect(stream.locked).toBe(false);
  });

  it.each([undefined, "zstd"])("bounds decoded bytes independently for %s", async encoding => {
    fixture.limits.maxDecodedBytes = 32;
    const text = JSON.stringify({ text: "a".repeat(100) });
    const bytes = encoding ? zstdCompressSync(text) : Buffer.from(text);
    expect(bytes.byteLength).toBeLessThan(4096);
    await expect(readRequestJson(request(bytes, encoding))).rejects.toMatchObject({ status: 413, code: "request_body_too_large" });
  });

  it("bounds a streaming frame without declared content size", async () => {
    fixture.limits.maxDecodedBytes = 2048;
    const bytes = zstdCompressSync(JSON.stringify({ text: "a".repeat(4096) }), { params: {
      [constants.ZSTD_c_contentSizeFlag]: 0, [constants.ZSTD_c_windowLog]: 10,
    } });
    await expect(readRequestJson(request(fragmented(bytes, 10), "zstd"))).rejects.toMatchObject({ status: 413, code: "request_body_too_large" });
  });

  it.each([undefined, "zstd"])("cancels a slow %s stream at the total deadline, not an idle timeout", async encoding => {
    fixture.limits.timeoutMs = 50;
    const bytes = encoding ? zstdCompressSync('{"cap":37}') : Buffer.from('{"cap":37}');
    let pulls = 0, cancellations = 0;
    const timers = new Set();
    const stream = new ReadableStream({
      pull(controller) {
        return new Promise(resolve => {
          const timer = setTimeout(() => { timers.delete(timer); controller.enqueue(bytes.subarray(pulls, ++pulls)); resolve(); }, 10);
          timers.add(timer);
        });
      },
      cancel() { cancellations++; for (const timer of timers) clearTimeout(timer); },
    }, { highWaterMark: 0 });
    await expect(readRequestJson(request(stream, encoding))).rejects.toMatchObject({ status: 408, code: "request_body_timeout" });
    expect(pulls).toBeLessThan(bytes.byteLength);
    expect(cancellations).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it("reports caller abort during identity input even when reason is an ordinary Error", async () => {
    const caller = new AbortController();
    let started;
    const reading = new Promise(resolve => { started = resolve; });
    let cancellations = 0;
    const stream = new ReadableStream({ pull() { started(); }, cancel() { cancellations++; } }, { highWaterMark: 0 });
    const pending = readRequestJson(request(stream, undefined, {}, caller.signal)).catch(error => error);
    await reading;
    caller.abort(new Error("caller cancelled"));
    expect(await pending).toMatchObject({ status: 499, code: "client_aborted" });
    expect(cancellations).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it("removes signal listeners and deadline timers after a successful decode", async () => {
    vi.useFakeTimers();
    const inbound = request(zstdCompressSync("{}"), "zstd", {}, new AbortController().signal);
    const add = vi.spyOn(inbound.signal, "addEventListener");
    const remove = vi.spyOn(inbound.signal, "removeEventListener");
    expect(await readRequestJson(inbound)).toEqual({});
    const abort = add.mock.calls.find(([type]) => type === "abort");
    expect(remove).toHaveBeenCalledWith("abort", abort[1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("limits materialized synthetic JSON rather than silently bypassing the identity budget", async () => {
    const inbound = { headers: new Headers(), json: async () => ({ text: "a".repeat(8192) }) };
    await expect(readRequestJson(inbound)).rejects.toMatchObject({ status: 413, code: "request_body_too_large" });
  });

  it("never treats a JSON-only synthetic caller as compressed wire data", async () => {
    let calls = 0;
    await expect(readRequestJson({ headers: new Headers({ "content-encoding": "zstd" }), json: async () => { calls++; return {}; } })).rejects.toBeInstanceOf(RequestBodyError);
    expect(calls).toBe(0);
  });

  it("does not bypass bounds for a real Request with a null/consumed body", async () => {
    const empty = request(undefined);
    const json = vi.spyOn(empty, "json").mockResolvedValue({});
    await expect(readRequestJson(empty)).rejects.toMatchObject({ status: 400, code: "bad_request" });
    expect(json).not.toHaveBeenCalled();
    const consumed = request("{}");
    await consumed.text();
    await expect(readRequestJson(consumed)).rejects.toMatchObject({ status: 400, code: "bad_request" });
  });
});
