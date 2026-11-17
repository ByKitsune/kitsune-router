import { afterEach, describe, expect, it, vi } from "vitest";
import { handleImageGenerationCore } from "../../open-sse/handlers/imageGenerationCore.js";
import * as proxyFetch from "../../open-sse/utils/proxyFetch.js";

const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQWQAAAAASUVORK5CYII=";
const invoke = extra => handleImageGenerationCore({
  body: { prompt: "Draw a square" }, modelInfo: { provider: "openai", model: "gpt-image-2" },
  credentials: { apiKey: "synthetic-image-provider-key" }, ...extra,
});
afterEach(() => vi.restoreAllMocks());

describe("image output request and result integrity", () => {
  it("forwards native GPT image controls instead of silently dropping them", async () => {
    const fetch = vi.spyOn(proxyFetch, "proxyAwareFetch").mockResolvedValue(Response.json({ created: 1, data: [{ b64_json: image }] }));
    const result = await invoke({ body: { prompt: "Draw a square", n: 2, size: "auto", quality: "high", background: "transparent", output_format: "webp", output_compression: 75, moderation: "auto" } });
    expect(result.success).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ model: "gpt-image-2", prompt: "Draw a square", n: 2, size: "auto", quality: "high", background: "transparent", output_format: "webp", output_compression: 75, moderation: "auto" });
  });

  it("refuses a multi-image binary request before spending upstream usage", async () => {
    const fetch = vi.spyOn(proxyFetch, "proxyAwareFetch").mockResolvedValue(Response.json({ created: 1, data: [{ b64_json: image }, { b64_json: image }] }));
    const result = await invoke({ body: { prompt: "Two squares", n: 2 }, binaryOutput: true });
    expect(result).toMatchObject({ success: false, status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains nullable optional count compatibility as one image", async () => {
    const fetch = vi.spyOn(proxyFetch, "proxyAwareFetch").mockResolvedValue(Response.json({ created: 1, data: [{ b64_json: image }] }));
    expect((await invoke({ body: { prompt: "One square", n: null, size: null }, binaryOutput: true })).success).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ n: 1, size: "auto" });
  });

  it("rejects unimplemented progressive image streaming explicitly before dispatch", async () => {
    const fetch = vi.spyOn(proxyFetch, "proxyAwareFetch").mockResolvedValue(Response.json({ created: 1, data: [{ b64_json: image }] }));
    expect(await invoke({ body: { prompt: "A square", stream: true, partial_images: 1 } })).toMatchObject({ success: false, status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([null, [], { prompt: { text: "not a string" } }, { prompt: "  " }, { prompt: "Draw", n: 0 }, { prompt: "Draw", n: -1 }, { prompt: "Draw", n: 1.5 }, { prompt: "Draw", n: "2" }])("rejects malformed image input before provider dispatch: %j", async body => {
    const fetch = vi.spyOn(proxyFetch, "proxyAwareFetch").mockResolvedValue(Response.json({ created: 1, data: [{ b64_json: image }] }));
    expect(await invoke({ body })).toMatchObject({ success: false, status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{ created: 1, data: [] }, { created: 1, data: [{}] }, { success: false, error: "empty result" }])("does not count an empty or malformed successful envelope as an image: %j", async value => {
    const fetch = vi.spyOn(proxyFetch, "proxyAwareFetch").mockResolvedValue(Response.json({ ...value, usage: { input_tokens: 3, output_tokens: 5 } }));
    const onRequestSuccess = vi.fn(), onUsage = vi.fn();
    const result = await invoke({ onRequestSuccess, onUsage });
    expect(result).toMatchObject({ success: false, status: 502, allowAccountFallback: false });
    expect(fetch).toHaveBeenCalledOnce();
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ prompt_tokens: 3, completion_tokens: 5 }), { status: "error" });
  });
});
