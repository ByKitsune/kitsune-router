import { afterEach, describe, expect, it, vi } from "vitest";
import { handleImageGenerationCore } from "open-sse/handlers/imageGenerationCore.js";
import * as proxyFetch from "open-sse/utils/proxyFetch.js";

const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQWQAAAAASUVORK5CYII=";
const rawUsage = { input_tokens: 3, output_tokens: 5, total_tokens: 8 };
const payload = (images = [{ b64_json: image }]) => ({ created: 1, data: images, usage: rawUsage });
const invoke = extra => handleImageGenerationCore({
  body: { prompt: "Synthetic image-result audit", n: 1 },
  modelInfo: { provider: "codex", model: "gpt-image-2" },
  credentials: { accessToken: "synthetic-image-result-review-token" },
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

describe("Codex native image result and terminal accounting integrity", () => {
  it("honors explicit binary output even when the caller also accepts SSE", async () => {
    const fetch = vi.spyOn(proxyFetch, "proxyAwareFetch").mockResolvedValue(Response.json(payload()));
    const result = await invoke({ binaryOutput: true, streamToClient: true });
    expect(result.success).toBe(true);
    expect(result.response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await result.response.arrayBuffer())).toEqual(Buffer.from(image, "base64"));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("records unexpected multi-image binary results as errors without premature success accounting", async () => {
    const fetch = vi.spyOn(proxyFetch, "proxyAwareFetch").mockResolvedValue(Response.json(payload([{ b64_json: image }, { b64_json: image }])));
    const onUsage = vi.fn(), onRequestSuccess = vi.fn();
    const result = await invoke({ binaryOutput: true, onUsage, onRequestSuccess });
    expect(result).toMatchObject({ success: false, status: 502, allowAccountFallback: false });
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 }), { status: "error" });
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([false, true])("keeps valid native raster output and exact usage with client streaming=%s", async streamToClient => {
    vi.spyOn(proxyFetch, "proxyAwareFetch").mockResolvedValue(Response.json(payload()));
    const onUsage = vi.fn(), onRequestSuccess = vi.fn();
    const result = await invoke({ streamToClient, onUsage, onRequestSuccess });
    expect(result.success).toBe(true);
    if (streamToClient) {
      expect(onRequestSuccess).not.toHaveBeenCalled();
      const wire = await result.response.text();
      expect(wire.match(/event: done/g)).toHaveLength(1);
      expect(wire).not.toContain("event: error");
      const data = wire.split("\n").find(line => line.startsWith("data: "));
      expect(JSON.parse(data.slice(6))).toEqual(payload());
    } else {
      expect(await result.response.json()).toEqual(payload());
    }
    expect(onRequestSuccess).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 }), { status: "success" });
  });

  const invalid = [
    ["blank", " "],
    ["invalid alphabet", "not base64!"],
    ["empty decoded data", "===="],
    ["noncanonical pad bits despite a PNG prefix", "iVBORx=="],
    ["noncanonical omitted padding", image.replace(/=+$/, "")],
    ["canonical base64 containing text rather than a raster", Buffer.from("synthetic plain text").toString("base64")],
  ];
  for (const streamToClient of [false, true]) {
    it.each(invalid)(`rejects %s before image success (stream=${streamToClient})`, async (_label, b64) => {
      const fetch = vi.spyOn(proxyFetch, "proxyAwareFetch").mockResolvedValue(Response.json(payload([{ b64_json: b64 }])));
      const onUsage = vi.fn(), onRequestSuccess = vi.fn();
      const result = await invoke({ streamToClient, onUsage, onRequestSuccess });
      if (streamToClient) {
        const wire = await result.response.text();
        expect(wire).not.toContain("event: done");
        expect(wire.match(/event: error/g)).toHaveLength(1);
      } else expect(result).toMatchObject({ success: false, status: 502, allowAccountFallback: false });
      expect(onRequestSuccess).not.toHaveBeenCalled();
      expect(onUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 }), { status: "error" });
      expect(fetch).toHaveBeenCalledOnce();
    });
  }
});
