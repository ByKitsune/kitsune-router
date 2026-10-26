import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({ lookup: vi.fn(), image: vi.fn(), inference: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: (...args) => network.lookup(...args) }));
vi.mock("undici", async (original) => ({ ...await original(), fetch: network.image }));
vi.mock("../../open-sse/utils/proxyFetch.js", async (original) => ({ ...await original(), proxyAwareFetch: network.inference }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("../../open-sse/executors/index.js", async () => {
  const { CodexExecutor } = await import("../../open-sse/executors/codex.js");
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor: provider => provider === "codex" ? new CodexExecutor() : new DefaultExecutor(provider) };
});

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { prefetchRemoteImages } from "../../open-sse/translator/concerns/prefetch.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const publicDns = [{ address: "93.184.216.34", family: 4 }];
const png = Buffer.from("iVBORw0KGgo=", "base64");
const inline = "data:image/png;base64,iVBORw0KGgo=";
const firstUrl = "https://images.example/first.png";
const secondUrl = "https://images.example/second.png";

beforeEach(() => {
  vi.clearAllMocks();
  network.lookup.mockReset().mockResolvedValue(publicDns);
  network.image.mockReset().mockImplementation(async () => new Response(png));
  network.inference.mockReset().mockImplementation(async (_url, init) => {
    init.signal?.throwIfAborted();
    return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: "ok" }] }, finishReason: "STOP" }] });
  });
  vi.stubGlobal("fetch", () => { throw new Error("image lifecycle tests are offline"); });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function dispatch(body, signal) {
  return handleChatCore({
    body: { ...body, model: "gemini-3.8-flash", stream: false },
    modelInfo: { provider: "gemini", model: "gemini-3.8-flash" },
    credentials: { apiKey: "synthetic-image-lifecycle" }, connectionId: "image-lifecycle",
    clientSignal: signal, sourceFormatOverride: FORMATS.OPENAI,
    log: { debug() {}, info() {}, warn() {} },
  });
}

function imageBody() {
  return { messages: [{ role: "user", content: [
    { type: "image_url", image_url: { url: firstUrl } },
    { type: "image_url", image_url: { url: secondUrl } },
  ] }] };
}

describe("image prefetch lifecycle through real entrypoints", () => {
  it("Core passes the client abort into pending DNS and sends no image HTTP or upstream inference", async () => {
    vi.useFakeTimers();
    const dns = deferred();
    const dnsStarted = deferred();
    network.lookup.mockImplementationOnce(() => { dnsStarted.resolve(); return dns.promise; });
    const controller = new AbortController();
    let settled = false;
    const execution = dispatch(imageBody(), controller.signal).then(value => { settled = true; return value; });
    try {
      await dnsStarted.promise;
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(true);
      const result = await execution;
      expect(result.success).toBe(false);
      expect(result.response.status).toBe(499);
      expect(network.image).not.toHaveBeenCalled();
      expect(network.inference.mock.calls.filter(([, init]) => !init.signal.aborted)).toHaveLength(0);
    } finally {
      dns.resolve(publicDns);
      await vi.advanceTimersByTimeAsync(15000);
      await execution;
    }
    expect(network.lookup).toHaveBeenCalledTimes(1);
    expect(network.image).not.toHaveBeenCalled();
  });

  it("stops a sequential prefetch batch when its caller aborts during the first image", async () => {
    const controller = new AbortController();
    const urls = [];
    network.image.mockImplementationOnce(async (url) => {
      urls.push(url);
      controller.abort();
      throw controller.signal.reason;
    });
    network.image.mockImplementation(async (url) => { urls.push(url); return new Response(png); });
    const body = imageBody();
    expect(await prefetchRemoteImages(body, FORMATS.OPENAI, FORMATS.GEMINI, { signal: controller.signal })).toBe(0);
    expect(urls).toEqual([firstUrl]);
    expect(body.messages[0].content.map(part => part.image_url.url)).toEqual([firstUrl, secondUrl]);
    expect(network.lookup).toHaveBeenCalledTimes(1);
  });

  it("Core preserves the exact fetched image bytes when translating Chat images to native Gemini", async () => {
    const result = await dispatch(imageBody());
    expect(result.success).toBe(true);
    const sent = JSON.parse(network.inference.mock.calls.at(-1)[1].body);
    expect(sent.contents.flatMap(item => item.parts).filter(part => part.inlineData).map(part => ({
      mime: part.inlineData.mimeType || part.inlineData.mime_type, data: part.inlineData.data,
    }))).toEqual([{ mime: "image/png", data: "iVBORw0KGgo=" }, { mime: "image/png", data: "iVBORw0KGgo=" }]);
  });

  it("typed Responses output prefetch preserves literal tool JSON while inlining declared images", async () => {
    const ordinary = { image_url: firstUrl, content: [{ type: "input_image", image_url: secondUrl }] };
    const body = { input: [{ type: "function_call_output", call_id: "call_images", output: [
      { type: "input_text", text: JSON.stringify(ordinary) }, { type: "input_image", image_url: firstUrl },
    ] }] };
    expect(await prefetchRemoteImages(body, FORMATS.OPENAI_RESPONSES, FORMATS.GEMINI)).toBe(1);
    expect(body.input[0].output).toEqual([
      { type: "input_text", text: JSON.stringify(ordinary) }, { type: "input_image", image_url: inline },
    ]);
    expect(network.image).toHaveBeenCalledTimes(1);
  });
});
