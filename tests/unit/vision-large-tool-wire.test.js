import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { deflateSync } from "node:zlib";

const fixture = vi.hoisted(() => ({ url: "", request: null, response: null }));
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
// Change only the upstream address: real serializers, translators, HTTP sockets
// and response handling remain in the production path.
vi.mock("../../open-sse/executors/index.js", async () => {
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor(provider) {
    const executor = new DefaultExecutor(provider);
    executor.buildUrl = () => fixture.url;
    return executor;
  } };
});

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { estimateUsage } from "../../open-sse/utils/usageTracking.js";

const width = 2172;
const height = 724;
const summary = "Compacted summary: retain the banner screenshot and compare the new tool capture.";
let image;
let server;

function pngChunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of typeAndData) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, typeAndData, checksum]);
}

beforeAll(async () => {
  // Valid RGB PNG, matching the reported dimensions. Deterministic noisy pixels
  // prevent compression from hiding the multi-megabyte binary/text distinction.
  const pixels = Buffer.alloc(height * (1 + width * 3));
  let seed = 0x12345678;
  for (let row = 0; row < height; row++) {
    for (let column = 1; column <= width * 3; column++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      pixels[row * (1 + width * 3) + column] = seed & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  image = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"), pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(pixels)), pngChunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    fixture.request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(fixture.response));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  fixture.url = `http://127.0.0.1:${server.address().port}/vision-fixture`;
});

beforeEach(() => { fixture.request = null; vi.clearAllMocks(); });
afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

const destinations = [
  ["openai", "gpt-4o", { id: "chatcmpl-vision", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "Synthetic vision reply" }, finish_reason: "stop" }] }],
  ["gemini", "gemini-2.5-flash", { candidates: [{ content: { role: "model", parts: [{ text: "Synthetic vision reply" }] }, finishReason: "STOP" }] }],
  ["anthropic", "claude-sonnet-4-6", { id: "msg-vision", type: "message", role: "assistant", content: [{ type: "text", text: "Synthetic vision reply" }], stop_reason: "end_turn" }],
  ["openai", "gpt-6.1-sol", { id: "resp-vision", object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Synthetic vision reply" }] }] }],
];

describe.each(["claude", "openai"])("large %s screenshot across serialized provider boundaries", sourceFormat => {
  it.each(destinations)("keeps the 2172x724 PNG typed on %s without charging base64 as text", async (provider, model, response) => {
    expect(image.length).toBeGreaterThan(4 * 1048576);
    fixture.response = response;
    const body = { model, stream: false, max_tokens: 4096, messages: [
      { role: "user", content: summary },
      { role: "assistant", content: [{ type: "tool_use", id: "capture", name: "read_image", input: { path: "banner.png" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "capture", content: [
        { type: "text", text: "PNG RGB 2172x724" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: image } },
      ] }] },
      { role: "user", content: "Compare the banner layout." },
    ] };
    if (sourceFormat === "openai") {
      body.messages[1] = { role: "assistant", content: null, tool_calls: [{
        id: "capture", type: "function", function: { name: "read_image", arguments: '{"path":"banner.png"}' },
      }] };
    }
    const result = await handleChatCore({ body, sourceFormatOverride: sourceFormat, modelInfo: { provider, model },
      credentials: { apiKey: "synthetic-key" }, connectionId: "synthetic-vision",
      log: { debug() {}, info() {}, warn() {}, error() {} }, rtkEnabled: false });
    expect(result.success).toBe(true);
    await result.response.text();
    expect(fixture.request).not.toBeNull();
    const serialized = JSON.stringify(fixture.request);
    expect(serialized.split(image).length - 1).toBe(1);
    expect(serialized.split(summary).length - 1).toBe(1);
    const text = [];
    function collect(value, key = "") {
      if (typeof value === "string" && ["text", "content", "output", "result"].includes(key)) text.push(value);
      if (Array.isArray(value)) value.forEach(item => collect(item));
      else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) collect(item, key);
    }
    collect(fixture.request);
    expect(text.join("\n")).not.toContain(image);
    expect(estimateUsage(fixture.request, 8).prompt_tokens).toBeLessThan(10000);
    const cap = fixture.request.max_tokens ?? fixture.request.max_completion_tokens ?? fixture.request.max_output_tokens ?? fixture.request.generationConfig?.maxOutputTokens;
    expect(cap).toBe(4096);
    expect(body.messages[2].content[0].content[1].source.data).toBe(image);
  }, 15000);
});
