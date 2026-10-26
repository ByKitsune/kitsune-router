import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/translator/concerns/image.js", async original => ({
  ...await original(), fetchImageAsBase64: vi.fn(),
}));
import { fetchImageAsBase64 } from "../../open-sse/translator/concerns/image.js";
import { prefetchRemoteImages } from "../../open-sse/translator/concerns/prefetch.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const url = "https://images.example/repeated.png";
const inline = "data:image/png;base64,iVBORw0KGgo=";
const image = () => ({ type: "image_url", image_url: { url, detail: "high" } });
beforeEach(() => fetchImageAsBase64.mockReset().mockResolvedValue({ url: inline, mimeType: "image/png" }));

describe("request-local image occurrence deduplication", () => {
  it("fetches once for repeated references, preserves all occurrences and does not cache another request", async () => {
    const request = () => ({ messages: [
      { role: "user", content: [image(), image()] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: [image()] }] },
    ] });
    const body = request();
    expect(await prefetchRemoteImages(body, FORMATS.OPENAI, FORMATS.GEMINI)).toBe(3);
    expect(fetchImageAsBase64).toHaveBeenCalledTimes(1);
    expect(body.messages[0].content.map(part => part.image_url)).toEqual([{ url: inline, detail: "high" }, { url: inline, detail: "high" }]);
    expect(body.messages[1].content[0].content[0].image_url.url).toBe(inline);
    await prefetchRemoteImages(request(), FORMATS.OPENAI, FORMATS.GEMINI);
    expect(fetchImageAsBase64).toHaveBeenCalledTimes(2);
  });

  it("visits explicit legacy Gemini result/output media but leaves ordinary Struct records alone", async () => {
    const ordinary = { name: "literal", inlineData: { mimeType: "image/png", data: "not-a-media-part" }, example: image() };
    const body = { contents: [{ role: "user", parts: [{ functionResponse: { name: "capture", response: {
      result: [ordinary, { fileData: { mimeType: "image/png", fileUri: url } }], output: [image()],
    } } }] }] };
    expect(await prefetchRemoteImages(body, FORMATS.GEMINI, FORMATS.GEMINI)).toBe(2);
    const response = body.contents[0].parts[0].functionResponse.response;
    expect(response.result[0]).toBe(ordinary);
    expect(response.result[1]).toEqual({ inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } });
    expect(response.output[0].image_url.url).toBe(inline);
    expect(fetchImageAsBase64).toHaveBeenCalledTimes(1);
  });

  it("keeps serial cancellation and never writes a cached result after caller cancellation", async () => {
    const controller = new AbortController();
    fetchImageAsBase64.mockImplementationOnce(async (_url, options) => {
      expect(options.signal).toBe(controller.signal);
      controller.abort(new Error("caller cancelled"));
      return { url: inline, mimeType: "image/png" };
    });
    const body = { messages: [{ role: "user", content: [image(), image(), { type: "image_url", image_url: { url: "https://images.example/other.png" } }] }] };
    expect(await prefetchRemoteImages(body, FORMATS.OPENAI, FORMATS.GEMINI, { signal: controller.signal })).toBe(0);
    expect(fetchImageAsBase64).toHaveBeenCalledTimes(1);
    expect(body.messages[0].content.map(part => part.image_url.url)).toEqual([url, url, "https://images.example/other.png"]);
  });

  it("deduplicates failed fetches only within the current request", async () => {
    fetchImageAsBase64.mockResolvedValue(null);
    const body = { messages: [{ role: "user", content: [image(), image()] }] };
    expect(await prefetchRemoteImages(body, FORMATS.OPENAI, FORMATS.CLAUDE)).toBe(0);
    expect(fetchImageAsBase64).toHaveBeenCalledTimes(1);
    expect(body.messages[0].content.map(part => part.image_url.url)).toEqual([url, url]);
  });
});
