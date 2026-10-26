import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ base: "", requests: [] }));
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
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor(provider) {
    const executor = new DefaultExecutor(provider);
    executor.buildUrl = () => `${fixture.base}/${provider}`;
    return executor;
  } };
});

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const pngA = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const pngB = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const model = "gemini-3.8-flash";
const log = { debug() {}, info() {}, warn() {} };
const routes = [
  { name: "Gemini same-format", provider: "gemini", format: FORMATS.GEMINI, envelope: false },
  { name: "Gemini CLI same-format", provider: "gemini-cli", format: FORMATS.GEMINI_CLI, envelope: true },
  { name: "Gemini CLI native passthrough", provider: "gemini-cli", format: FORMATS.GEMINI_CLI, envelope: true, native: true },
  { name: "Antigravity same-format", provider: "antigravity", format: FORMATS.ANTIGRAVITY, envelope: true },
  { name: "Antigravity native passthrough", provider: "antigravity", format: FORMATS.ANTIGRAVITY, envelope: true, native: true },
];
const mediaShapes = [
  { name: "MCP image", block: () => ({ type: "image", mimeType: "image/png", data: pngA }) },
  { name: "Claude image", block: () => ({ type: "image", source: { type: "base64", media_type: "image/png", data: pngA } }) },
  { name: "OpenAI image", block: () => ({ type: "image_url", image_url: { url: `data:image/png;base64,${pngA}` } }) },
  { name: "native Gemini image", block: () => ({ inline_data: { mime_type: "image/png", data: pngA } }) },
];

let server;
beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    fixture.requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const nativeResponse = {
      candidates: [{ content: { role: "model", parts: [{ text: "The supplied screenshot is readable." }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 5, totalTokenCount: 12 },
    };
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(request.url === "/gemini" ? nativeResponse : { response: nativeResponse }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  fixture.base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(() => { fixture.requests = []; });

function wrap(route, request) {
  return route.envelope
    ? { model, project: "native-media-project", userAgent: route.native ? route.provider : "request-contract-fixture", request, stream: false }
    : { ...request, model, stream: false };
}

async function dispatch(route, body) {
  const headers = route.native ? { "user-agent": `${route.provider}/request-contract-fixture` } : {};
  const result = await handleChatCore({
    body, modelInfo: { provider: route.provider, model }, sourceFormatOverride: route.format,
    credentials: { apiKey: "synthetic-native-media-fixture", projectId: "native-media-project" },
    connectionId: "native-media-contract", clientRawRequest: { endpoint: "/v1beta/models/generateContent", headers, body }, log,
  });
  expect(result.success).toBe(true);
  await result.response.text();
  return fixture.requests.at(-1);
}

function history(response, { parts } = {}) {
  return {
    sessionId: "native-media-session",
    generationConfig: { maxOutputTokens: 31 },
    contents: [
      { role: "user", parts: [{ text: "Compacted context: inspect the returned screenshot." }] },
      { role: "model", parts: [{ functionCall: { id: "call_capture", name: "capture", args: {} } }] },
      { role: "user", parts: [{ functionResponse: { id: "call_capture", name: "capture", response, ...(parts ? { parts } : {}) } }] },
      { role: "user", parts: [{ text: "What does the screenshot show?" }] },
    ],
  };
}
const requestOf = (body) => body.request || body;
const partsOf = (body) => requestOf(body).contents.flatMap((turn) => turn.parts);
const responsesOf = (body) => partsOf(body).filter((part) => part.functionResponse).map((part) => part.functionResponse);
function mediaOf(body) {
  return partsOf(body).flatMap((part) => [part, ...(part.functionResponse?.parts || [])]).filter((part) => part.inlineData || part.inline_data);
}
const mediaBytes = (body) => mediaOf(body).map((part) => (part.inlineData || part.inline_data).data);

// Only persistence/logging and the network destination are substituted: Core,
// registered format routing, the default executor and HTTP serialization are real.
describe.each(routes)("$name legacy typed result media", (route) => {
  it.each(mediaShapes)("lifts recognized $name out of the free response Struct before serialization", async (shape) => {
    const body = wrap(route, history({ result: [{ type: "text", text: "PNG ready" }, shape.block()], error: { code: "permission_denied" }, page: 0 }));
    const before = structuredClone(body);
    const wire = await dispatch(route, body);
    expect(mediaBytes(wire)).toEqual([pngA]);
    expect(responsesOf(wire)).toHaveLength(1);
    expect(responsesOf(wire)[0]).toMatchObject({ id: "call_capture", name: "capture", response: { result: "PNG ready", error: { code: "permission_denied" }, page: 0 } });
    expect(JSON.stringify(responsesOf(wire)[0].response)).not.toContain(pngA);
    expect(partsOf(wire).filter((part) => part.text).map((part) => part.text).join("\n")).not.toContain(pngA);
    expect(JSON.stringify(wire).split(pngA).length - 1).toBe(1);
    expect(body).toEqual(before);
  });

  it("keeps repeated image occurrences, existing native parts and parallel result ownership stable across normalization passes", async () => {
    const existingPart = { inlineData: { mimeType: "image/png", data: pngB, displayName: "already-native" } };
    const request = history({ result: [{ type: "text", text: "PNG A" }, mediaShapes[0].block(), mediaShapes[0].block()], error: { code: "denied" }, metadata: { attempt: 0, cached: false } }, { parts: [existingPart] });
    request.contents[1].parts.push({ functionCall: { id: "call_second", name: "capture", args: { page: 2 } } });
    request.contents[2].parts.push({ functionResponse: {
      id: "call_second", name: "capture", response: { result: [{ type: "image", mimeType: "image/png", data: pngB }, { type: "text", text: "PNG B" }], token: null },
    } });
    const body = wrap(route, request);
    const before = structuredClone(body);
    const first = await dispatch(route, body);
    const second = await dispatch(route, first);
    for (const wire of [first, second]) {
      expect(responsesOf(wire).map((result) => result.id)).toEqual(["call_capture", "call_second"]);
      expect(responsesOf(wire).map((result) => result.response)).toEqual([
        { result: "PNG A", error: { code: "denied" }, metadata: { attempt: 0, cached: false } },
        { result: "PNG B", token: null },
      ]);
      expect(responsesOf(wire)[0].parts[0]).toEqual(existingPart);
      expect(mediaBytes(wire).filter((data) => data === pngA)).toHaveLength(2);
      expect(mediaBytes(wire).filter((data) => data === pngB)).toHaveLength(2);
      expect(JSON.stringify(responsesOf(wire).map((result) => result.response))).not.toContain(pngA);
      expect(JSON.stringify(responsesOf(wire).map((result) => result.response))).not.toContain(pngB);
      expect(requestOf(wire).sessionId).toBe("native-media-session");
    }
    expect(requestOf(second).contents).toEqual(requestOf(first).contents);
    expect(body).toEqual(before);
  });

  it("does not reinterpret ordinary Structs, literal JSON/base64 prose, falsy results or already-native media", async () => {
    const nativePart = { inlineData: { mimeType: "image/png", data: pngB, displayName: "native-only" } };
    const literalJson = JSON.stringify({ type: "image", mimeType: "image/png", data: pngA });
    const request = history({ result: { example: { type: "image", mimeType: "image/png", data: pngA }, literalJson, prose: `The encoded value is ${pngA}`, count: 0, enabled: false, missing: null }, metadata: { ordinary: true } }, { parts: [nativePart] });
    request.contents[2].parts.push(
      { functionResponse: { id: "call_rows", name: "rows", response: { result: [{ code: 0, enabled: false }] } } },
      { functionResponse: { id: "call_empty", name: "empty", response: { result: "" } } },
      { functionResponse: { id: "call_false", name: "false_result", response: { result: false } } },
      { functionResponse: { id: "call_null", name: "null_result", response: { result: null } } },
    );
    request.contents[1].parts.push(
      { functionCall: { id: "call_rows", name: "rows", args: {} } },
      { functionCall: { id: "call_empty", name: "empty", args: {} } },
      { functionCall: { id: "call_false", name: "false_result", args: {} } },
      { functionCall: { id: "call_null", name: "null_result", args: {} } },
    );
    const body = wrap(route, request);
    const before = structuredClone(body);
    const wire = await dispatch(route, body);
    expect(responsesOf(wire)).toEqual(request.contents[2].parts.map((part) => part.functionResponse));
    expect(mediaBytes(wire)).toEqual([pngB]);
    expect(body).toEqual(before);
  });
});
