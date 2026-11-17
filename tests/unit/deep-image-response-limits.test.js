import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fetch: vi.fn(), refreshCredentials: vi.fn() }));
vi.mock("open-sse/config/mediaConfig.js", async importOriginal => ({
  ...await importOriginal(),
  MAX_IMAGE_RESPONSE_BYTES: 512,
}));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: state.fetch }));
vi.mock("open-sse/executors/index.js", () => ({ getExecutor: () => ({ noAuth: true, refreshCredentials: state.refreshCredentials }) }));

import { readImageProviderJson } from "open-sse/handlers/imageProviders/_base.js";
import { handleImageGenerationCore } from "open-sse/handlers/imageGenerationCore.js";

const encoder = new TextEncoder();
const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQWQAAAAASUVORK5CYII=";

beforeEach(() => {
  state.fetch.mockReset();
  state.refreshCredentials.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function responseChunks(chunks, { headers = {}, leaveOpen = false, cancel = vi.fn(), readError = null } = {}) {
  let offset = 0;
  const pull = vi.fn(controller => {
    if (offset < chunks.length) controller.enqueue(chunks[offset++]);
    else if (readError) controller.error(readError);
    else if (!leaveOpen) controller.close();
  });
  const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), {
    headers: { "content-type": "application/json", ...headers },
  });
  return { response, pull, cancel };
}

async function promptly(pending) {
  let timer;
  try {
    return await Promise.race([
      pending,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Image body cleanup waited for an unacknowledged cancellation")), 300); }),
    ]);
  } finally { clearTimeout(timer); }
}

function nativeImageOfBytes(bytes) {
  const payload = { created: 1, data: [{ b64_json: image, generation_id: "" }] };
  const overhead = encoder.encode(JSON.stringify(payload)).byteLength;
  payload.data[0].generation_id = "g".repeat(bytes - overhead);
  const wire = encoder.encode(JSON.stringify(payload));
  expect(wire.byteLength).toBe(bytes);
  return { payload, wire };
}

describe("bounded provider JSON owns its WebStream reader", () => {
  it("decodes split multibyte UTF-8 at the exact byte limit", async () => {
    const payload = { caption: "猫🚀é", value: 0 };
    const bytes = encoder.encode(JSON.stringify(payload));
    const chunks = Array.from(bytes, byte => Uint8Array.of(byte));
    const fixture = responseChunks(chunks);
    expect(await readImageProviderJson(fixture.response, null, bytes.byteLength)).toEqual(payload);
    expect(fixture.response.body.locked).toBe(false);
    expect(fixture.cancel).not.toHaveBeenCalled();
  });

  it("counts encoded bytes rather than UTF-16 string length for streamed overflow", async () => {
    const text = JSON.stringify({ caption: "猫🚀é" });
    const bytes = encoder.encode(text);
    expect(bytes.byteLength).toBeGreaterThan(text.length);
    const fixture = responseChunks([bytes.subarray(0, text.length), bytes.subarray(text.length)], { leaveOpen: true });
    await expect(readImageProviderJson(fixture.response, null, bytes.byteLength - 1)).rejects.toThrow("exceeds size limit");
    expect(fixture.cancel).toHaveBeenCalledOnce();
    expect(fixture.response.body.locked).toBe(false);
  });

  it("rejects declared overflow before pulling bytes and cancels its owned body", async () => {
    const fixture = responseChunks([encoder.encode('{"ok":true}')], { headers: { "content-length": "513" }, leaveOpen: true });
    await expect(readImageProviderJson(fixture.response)).rejects.toThrow("exceeds size limit");
    expect(fixture.pull).not.toHaveBeenCalled();
    expect(fixture.cancel).toHaveBeenCalledOnce();
    expect(fixture.response.body.locked).toBe(false);
  });

  it.each([undefined, "1"])("rejects streamed overflow even with content-length %s", async declared => {
    const { wire } = nativeImageOfBytes(513);
    const fixture = responseChunks([wire.subarray(0, 512), wire.subarray(512)], {
      headers: declared ? { "content-length": declared } : {}, leaveOpen: true,
    });
    await expect(readImageProviderJson(fixture.response)).rejects.toThrow("exceeds size limit");
    expect(fixture.cancel).toHaveBeenCalledOnce();
    expect(fixture.response.body.locked).toBe(false);
  });

  it("preserves an ordinary Error abort reason without awaiting source cancellation acknowledgment", async () => {
    const reason = new Error("Synthetic caller abort reason");
    const caller = new AbortController();
    let dispatched;
    const started = new Promise(resolve => { dispatched = resolve; });
    const cancel = vi.fn(() => new Promise(() => {}));
    const response = new Response(new ReadableStream({
      pull() { dispatched(); },
      cancel,
    }, { highWaterMark: 0 }));
    const pending = readImageProviderJson(response, caller.signal);
    await started;
    caller.abort(reason);
    await expect(promptly(pending)).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason);
    expect(response.body.locked).toBe(false);
  });

  it("times out a stalled body without awaiting an unresolved cancellation acknowledgment", async () => {
    let dispatched;
    const started = new Promise(resolve => { dispatched = resolve; });
    const cancel = vi.fn(() => new Promise(() => {}));
    const response = new Response(new ReadableStream({ pull() { dispatched(); }, cancel }, { highWaterMark: 0 }));
    const pending = readImageProviderJson(response, null, 512, 10);
    await started;
    const error = await promptly(pending).catch(value => value);
    expect(error).toMatchObject({ name: "TimeoutError", message: "Image provider response timed out" });
    expect(cancel).toHaveBeenCalledExactlyOnceWith(error);
    expect(response.body.locked).toBe(false);
  });

  it("preserves many one-byte UTF-8 chunks and clears its body timer after success", async () => {
    vi.useFakeTimers();
    const payload = { caption: "猫🚀é".repeat(80), value: 0 };
    const bytes = encoder.encode(JSON.stringify(payload));
    expect(bytes.byteLength).toBeGreaterThan(512);
    const fixture = responseChunks(Array.from(bytes, byte => Uint8Array.of(byte)));
    expect(await readImageProviderJson(fixture.response, null, bytes.byteLength, 50)).toEqual(payload);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(fixture.cancel).not.toHaveBeenCalled();
    expect(fixture.response.body.locked).toBe(false);
  });

  it("disposes a body passed with an already-aborted signal and keeps its exact reason", async () => {
    const reason = new Error("Synthetic abort before JSON reading");
    const caller = new AbortController();
    caller.abort(reason);
    const fixture = responseChunks([encoder.encode('{"ok":true}')], { leaveOpen: true });
    await expect(readImageProviderJson(fixture.response, caller.signal)).rejects.toBe(reason);
    expect(fixture.cancel).toHaveBeenCalledExactlyOnceWith(reason);
    expect(fixture.pull).not.toHaveBeenCalled();
    expect(fixture.response.body.locked).toBe(false);
  });

  it("does not retain an abort listener after a successful complete read", async () => {
    const caller = new AbortController();
    const fixture = responseChunks([encoder.encode('{"ok":true}')]);
    expect(await readImageProviderJson(fixture.response, caller.signal)).toEqual({ ok: true });
    caller.abort(new Error("Synthetic later caller departure"));
    await Promise.resolve();
    expect(fixture.cancel).not.toHaveBeenCalled();
    expect(fixture.response.body.locked).toBe(false);
  });

  it("redacts malformed JSON diagnostics instead of exposing the provider body canary", async () => {
    const canary = "SYNTHETIC_PRIVATE_IMAGE_JSON_CANARY";
    const fixture = responseChunks([encoder.encode(`{"private":"${canary}",invalid}`)]);
    const error = await readImageProviderJson(fixture.response).catch(value => value);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Invalid image provider JSON response");
    expect(error.message).not.toContain(canary);
    expect(fixture.response.body.locked).toBe(false);
  });

  it("does not accept a clean EOF halfway through an otherwise valid JSON document", async () => {
    const { wire } = nativeImageOfBytes(256);
    const fixture = responseChunks([wire.subarray(0, wire.byteLength - 2)]);
    await expect(readImageProviderJson(fixture.response)).rejects.toThrow("Invalid image provider JSON response");
    expect(fixture.response.body.locked).toBe(false);
  });

  it("does not convert a truncated UTF-8 sequence into replacement text and successful JSON", async () => {
    const prefix = encoder.encode('{"caption":"');
    const fixture = responseChunks([prefix, Uint8Array.of(0xf0, 0x9f)]);
    await expect(readImageProviderJson(fixture.response)).rejects.toThrow();
    expect(fixture.response.body.locked).toBe(false);
  });

  it("rejects a transport error after partial body bytes and releases its reader", async () => {
    const error = new Error("Synthetic image connection closed prematurely");
    const fixture = responseChunks([encoder.encode('{"created":1,"data":[')], { readError: error });
    await expect(readImageProviderJson(fixture.response)).rejects.toBe(error);
    expect(fixture.response.body.locked).toBe(false);
  });

  it.each(["null", "[]", '"synthetic secret string"', "1"])("rejects a non-object root %s", async json => {
    const fixture = responseChunks([encoder.encode(json)]);
    await expect(readImageProviderJson(fixture.response)).rejects.toThrow("Invalid image provider response");
    expect(fixture.response.body.locked).toBe(false);
  });
});

describe.each(["openai", "codex"])("%s public image core enforces the configured native JSON limit", provider => {
  const invoke = (extra = {}) => handleImageGenerationCore({
    body: { prompt: "Synthetic limit fixture", n: 1, output_format: "png" },
    modelInfo: { provider, model: "gpt-image-2" },
    credentials: { apiKey: "synthetic-image-limit-key", accessToken: "synthetic-image-limit-token", providerSpecificData: { chatgptAccountId: "synthetic-limit-account" } },
    ...extra,
  });

  it("accepts a valid native image JSON response at exactly 512 bytes", async () => {
    const { payload, wire } = nativeImageOfBytes(512);
    const fixture = responseChunks([wire.subarray(0, 255), wire.subarray(255)], { headers: { "content-length": "512" } });
    state.fetch.mockResolvedValueOnce(fixture.response);
    const onRequestSuccess = vi.fn();
    const onUsage = vi.fn();
    const result = await invoke({ onRequestSuccess, onUsage });
    expect(result.success).toBe(true);
    expect(await result.response.json()).toEqual(payload);
    expect(onRequestSuccess).toHaveBeenCalledOnce();
    expect(onUsage).not.toHaveBeenCalled();
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(fixture.response.body.locked).toBe(false);
  });

  it.each(["declared", "streamed"])("rejects a valid native response of 513 bytes through the %s guard without replay or a success callback", async mode => {
    const { wire } = nativeImageOfBytes(513);
    const fixture = responseChunks([wire.subarray(0, 512), wire.subarray(512)], {
      headers: mode === "declared" ? { "content-length": "513" } : {}, leaveOpen: true,
    });
    state.fetch.mockResolvedValueOnce(fixture.response);
    const onRequestSuccess = vi.fn();
    const onUsage = vi.fn();
    const result = await invoke({ onRequestSuccess, onUsage });
    expect(result).toMatchObject({ success: false, status: 502, allowAccountFallback: false });
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(onUsage).not.toHaveBeenCalled();
    expect(state.refreshCredentials).not.toHaveBeenCalled();
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(String(state.fetch.mock.calls[0][0])).toBe(provider === "codex"
      ? "https://chatgpt.com/backend-api/codex/images/generations"
      : "https://api.openai.com/v1/images/generations");
    expect(fixture.response.body.locked).toBe(false);
    expect(fixture.cancel).toHaveBeenCalledOnce();
    if (mode === "declared") expect(fixture.pull).not.toHaveBeenCalled();
  });

  it("does not expose invalid JSON body fragments in the public error response", async () => {
    const canary = "SYNTHETIC_PROVIDER_JSON_RESPONSE_CANARY";
    const fixture = responseChunks([encoder.encode(`{"private":"${canary}",malformed}`)]);
    state.fetch.mockResolvedValueOnce(fixture.response);
    const onRequestSuccess = vi.fn();
    const result = await invoke({ onRequestSuccess });
    expect(result).toMatchObject({ success: false, status: 502, allowAccountFallback: false });
    expect(await result.response.text()).not.toContain(canary);
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(fixture.response.body.locked).toBe(false);
  });
});
