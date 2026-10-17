/**
 * Codex executor: verify remote image URLs are fetched and inlined as
 * base64 data URIs BEFORE the request body reaches the upstream API.
 *
 * Covers bug #575:
 *  - prefetchImages must await async image fetches
 *  - execute() must run prefetchImages before super.execute so the body
 *    sent to upstream contains base64 data, not remote URLs
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock DNS so the SSRF guard treats example.com as public.
// Contract note: lookup(host, {all:true}) resolves to an ARRAY of records.
const { imageFetch, lookupMock } = vi.hoisted(() => ({ imageFetch: vi.fn(), lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: (...args) => lookupMock(...args) }));
vi.mock("undici", async (importOriginal) => ({ ...await importOriginal(), fetch: imageFetch }));

import { CodexExecutor } from "../../open-sse/executors/codex.js";
import * as proxyFetchModule from "../../open-sse/utils/proxyFetch.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const IMAGE_1MB_BYTES = 1024 * 1024;
const REMOTE_URL = "https://example.com/big.jpg";
const DATA_URI = "data:image/png;base64,iVBORw0KGgo=";
// JPEG magic bytes (FF D8 FF) so magic-byte verification passes.
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function makeImageBuffer(sizeBytes) {
  const buf = new Uint8Array(sizeBytes);
  for (let i = 0; i < JPEG_MAGIC.length; i++) buf[i] = JPEG_MAGIC[i];
  for (let i = JPEG_MAGIC.length; i < sizeBytes; i++) buf[i] = i & 0xff;
  return buf;
}

// Mock a streaming Response body (getReader) as the hardened fetcher expects.
function mockImageFetch(sizeBytes) {
  const bytes = makeImageBuffer(sizeBytes);
  return {
    ok: true,
    body: {
      getReader() {
        let sent = false;
        return {
          read: async () => sent ? { done: true } : (sent = true, { done: false, value: bytes }),
          cancel: async () => {},
        };
      },
    },
  };
}

describe("CodexExecutor image handling", () => {
  beforeEach(() => {
    imageFetch.mockReset();
    lookupMock.mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });
  afterEach(() => {
    imageFetch.mockReset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fetches 1MB remote image and inlines it as base64 data URI", async () => {
    imageFetch.mockImplementation(async () => mockImageFetch(IMAGE_1MB_BYTES));

    const executor = new CodexExecutor();
    const body = {
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "describe this" },
            { type: "image_url", image_url: { url: REMOTE_URL, detail: "high" } },
          ],
        },
      ],
    };

    await executor.prefetchImages(body);

    const imgBlock = body.input[0].content.find((c) => c.type === "input_image");
    expect(imgBlock, "input_image block must be present after prefetch").toBeDefined();
    expect(imgBlock.image_url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(imgBlock.detail).toBe("high");

    const base64Payload = imgBlock.image_url.split(",")[1];
    expect(Buffer.from(base64Payload, "base64").equals(Buffer.from(makeImageBuffer(IMAGE_1MB_BYTES)))).toBe(true);
  });

  it("passes through existing data URIs without calling fetch", async () => {
    imageFetch.mockRejectedValue(new Error("inline images must not be downloaded"));

    const executor = new CodexExecutor();
    const body = {
      input: [
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: DATA_URI } }],
        },
      ],
    };

    await executor.prefetchImages(body);

    const imgBlock = body.input[0].content.find((c) => c.type === "input_image");
    expect(imgBlock.image_url).toBe(DATA_URI);
    expect(imageFetch).not.toHaveBeenCalled();
  });

  it("falls back to original URL when remote fetch fails", async () => {
    imageFetch.mockRejectedValue(new Error("network down"));

    const executor = new CodexExecutor();
    const body = {
      input: [
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: REMOTE_URL } }],
        },
      ],
    };

    await executor.prefetchImages(body);

    const imgBlock = body.input[0].content.find((c) => c.type === "input_image");
    expect(imgBlock.image_url).toBe(REMOTE_URL);
  });

  it("execute() prefetches images before sending to upstream", async () => {
    imageFetch.mockImplementation(async () => mockImageFetch(IMAGE_1MB_BYTES));

    let capturedBodyString = null;
    vi.spyOn(proxyFetchModule, "proxyAwareFetch").mockImplementation(async (url, init) => {
      capturedBodyString = init.body;
      return { ok: true, status: 200, headers: new Map() };
    });

    const executor = new CodexExecutor();
    const body = {
      input: [
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: REMOTE_URL } }],
        },
      ],
    };

    await executor.execute({
      model: "gpt-5.3-codex",
      body,
      stream: true,
      credentials: { accessToken: "test" },
    });

    expect(capturedBodyString).toBeTypeOf("string");
    expect(capturedBodyString).not.toBe("{}");
    const parsed = JSON.parse(capturedBodyString);
    const imgBlock = parsed.input[0].content.find((c) => c.type === "input_image");
    expect(Buffer.from(imgBlock.image_url.split(",")[1], "base64").equals(Buffer.from(makeImageBuffer(IMAGE_1MB_BYTES)))).toBe(true);
  });

  it.each([FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES])("inlines exact image bytes after %s request translation and before real execute serialization", async (sourceFormat) => {
    const bytes = makeImageBuffer(64);
    imageFetch.mockImplementation(async () => mockImageFetch(bytes.length));
    const sent = [];
    vi.spyOn(proxyFetchModule, "proxyAwareFetch").mockImplementation(async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return Response.json({ output: [] });
    });
    const body = sourceFormat === FORMATS.OPENAI ? { messages: [
      { role: "user", content: [{ type: "image_url", image_url: { url: REMOTE_URL, detail: "high" } }] },
      { role: "assistant", content: null, tool_calls: [{ id: "call_image", type: "function", function: { name: "screenshot", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_image", content: [{ type: "text", text: "captured" }, { type: "image_url", image_url: { url: REMOTE_URL } }] },
    ] } : { input: [
      { role: "user", content: [{ type: "input_image", image_url: REMOTE_URL, detail: "high" }] },
      { type: "function_call", call_id: "call_image", name: "screenshot", arguments: "{}" },
      { type: "function_call_output", call_id: "call_image", output: [{ type: "input_text", text: "captured" }, { type: "input_image", image_url: REMOTE_URL }] },
    ] };
    const translated = translateRequest(sourceFormat, FORMATS.OPENAI_RESPONSES, "gpt-5.5", body, true, null, "codex");
    await new CodexExecutor().execute({ model: "gpt-5.5", body: translated, stream: true, credentials: { accessToken: "offline-fixture" } });
    expect(sent).toHaveLength(1);
    const images = sent[0].input.flatMap(item => [
      ...(Array.isArray(item.content) ? item.content : []),
      ...(Array.isArray(item.output) ? item.output : []),
    ]).filter(part => part.type === "input_image");
    expect(images).toHaveLength(2);
    expect(images[0].detail).toBe("high");
    for (const image of images) {
      expect(image.image_url).toMatch(/^data:image\/jpeg;base64,/);
      expect(Buffer.from(image.image_url.split(",")[1], "base64")).toEqual(Buffer.from(bytes));
    }
    expect(sent[0].input.find(item => item.type === "function_call_output").call_id).toBe("call_image");
  });

  it("aborts an in-flight Codex image download and never sends inference or remaining downloads", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let imageStarted;
    const started = new Promise(resolve => { imageStarted = resolve; });
    const downloaded = [];
    imageFetch.mockImplementation(async (url, { signal }) => {
      downloaded.push(url);
      imageStarted();
      if (signal.aborted) throw signal.reason;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    });
    const upstream = vi.spyOn(proxyFetchModule, "proxyAwareFetch").mockResolvedValue(Response.json({ output: [] }));
    const body = { input: [{ role: "user", content: [
      { type: "image_url", image_url: { url: REMOTE_URL } },
      { type: "image_url", image_url: { url: "https://example.com/second.jpg" } },
    ] }] };
    const reason = new DOMException("client disconnected", "AbortError");
    let outcome;
    const execution = new CodexExecutor().execute({ model: "gpt-5.5", body, stream: true, credentials: { accessToken: "offline-fixture" }, signal: controller.signal })
      .then(value => { outcome = { value }; }, error => { outcome = { error }; });
    try {
      await started;
      controller.abort(reason);
      await vi.advanceTimersByTimeAsync(0);
      expect(outcome?.error).toBe(reason);
      expect(downloaded).toEqual([REMOTE_URL]);
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      await vi.advanceTimersByTimeAsync(15000);
      await execution.catch(() => {});
    }
  });
});
