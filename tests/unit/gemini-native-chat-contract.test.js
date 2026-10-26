import http from "node:http";
import { setImmediate } from "node:timers/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ base: "", requests: [], clientKey: null }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("@/sse/services/auth.js", () => ({
  clearAccountError: vi.fn(), getProviderCredentials: vi.fn(),
  isValidApiKey: vi.fn(), markAccountUnavailable: vi.fn(),
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
    executor.buildUrl = (_model, stream) => `${fixture.base}/${provider}?stream=${stream}`;
    return executor;
  } };
});
// Account selection is isolated; the real API-key parser, Core, converters,
// executor HTTP serialization and response framing remain real.
vi.mock("@/sse/handlers/chat.js", () => ({ handleChat: async (request) => {
  const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");
  const { detectFormatByEndpoint } = await import("../../open-sse/translator/formats.js");
  const { extractApiKey } = await vi.importActual("@/sse/services/auth.js");
  const apiKey = extractApiKey(request);
  if (fixture.clientKey && apiKey !== fixture.clientKey) return Response.json({ error: { message: "Missing API key" } }, { status: 401 });
  const body = await request.json();
  const [provider, ...model] = body.model.split("/");
  const result = await handleChatCore({
    body, modelInfo: { provider, model: model.join("/") },
    sourceFormatOverride: detectFormatByEndpoint(new URL(request.url).pathname, body),
    credentials: { apiKey: "synthetic-native-route-key" }, connectionId: "native-route-fixture",
    apiKey,
    clientSignal: request.signal, log: { debug() {}, info() {}, warn() {} },
  });
  return result.response;
} }));

import { POST } from "../../src/app/api/v1beta/models/[...path]/route.js";

const pngA = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const pngB = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const signatures = ["image-occurrence-A", "image-occurrence-B"];
const usage = { prompt_tokens: 32, completion_tokens: 7, total_tokens: 39, completion_tokens_details: { reasoning_tokens: 3 } };
const images = signatures.map((signature, index) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${pngB}` }, index, extra_content: { google: { thought_signature: signature } } }));
const nativeParts = [
  { thought: true, text: "Inspecting", thoughtSignature: "reasoning-signature" }, { text: "東京" },
  ...signatures.map((thoughtSignature) => ({ inlineData: { mimeType: "image/png", data: pngB }, thoughtSignature })),
  { functionCall: { id: "call_next", name: "read_page", args: { page: 2 } } },
];
let server;
beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    fixture.requests.push(body);
    const url = new URL(request.url, fixture.base);
    const native = url.pathname === "/gemini";
    const streaming = url.searchParams.get("stream") === "true";
    const googleResponse = { candidates: [{ index: 0, content: { role: "model", parts: nativeParts }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 32, candidatesTokenCount: 4, totalTokenCount: 39, thoughtsTokenCount: 3 } };
    const chatResponse = { id: "chatcmpl-local", object: "chat.completion", model: body.model, choices: [{ index: 0, message: { role: "assistant", content: "東京", reasoning_content: "Inspecting", images, tool_calls: [{ id: "call_next", type: "function", function: { name: "read_page", arguments: '{"page":2}' } }] }, finish_reason: "tool_calls" }], usage };
    if (!streaming) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(native ? googleResponse : chatResponse));
      return;
    }
    response.setHeader("content-type", "text/event-stream");
    const events = native ? [googleResponse] : [
      { id: "chatcmpl-local", model: body.model, choices: [{ index: 0, delta: { content: "東京", reasoning_content: "Inspecting", images: [images[0]] } }] },
      { choices: [{ index: 0, delta: { images: [images[1]], tool_calls: [{ index: 0, id: "call_next", type: "function", function: { name: "read_page", arguments: '{"pa' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'ge":2}' } }] }, finish_reason: "tool_calls" }] },
      { choices: [], usage },
    ];
    const bytes = Buffer.from(events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("") + (native ? "" : "data: [DONE]\r\n\r\n"));
    for (let offset = 0; offset < bytes.length; offset += 17) {
      response.write(bytes.subarray(offset, offset + 17));
      await setImmediate();
    }
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  fixture.base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
beforeEach(() => { fixture.requests = []; fixture.clientKey = null; });

function media(value, found = []) {
  if (!value || typeof value !== "object") return found;
  const inline = value.inlineData || value.inline_data;
  if (inline?.data) found.push(inline.data);
  if (value.type === "image_url" && value.image_url?.url?.startsWith("data:image/")) found.push(value.image_url.url.split(",")[1]);
  for (const child of Object.values(value)) media(child, found);
  return found;
}
function requestBody() {
  return {
    contents: [
      { role: "user", parts: [{ text: "Compacted history: compare these screenshots." }, { inlineData: { mimeType: "image/png", data: pngA } }] },
      { role: "model", parts: [1, 2].map((page) => ({ functionCall: { id: `call_${page}`, name: "read_page", args: { page } } })) },
      { role: "user", parts: [pngA, pngB].map((data, index) => ({ functionResponse: { id: `call_${index + 1}`, name: "read_page", response: { result: [{ type: "text", text: `Page ${index + 1}` }, { type: "image", mimeType: "image/png", data }] } } })) },
    ],
    generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "low", includeThoughts: true } },
    tools: [{ functionDeclarations: [{ name: "read_page", parameters: { type: "object", properties: { page: { type: "integer" } }, required: ["page"] } }] }],
  };
}

describe.each([
  { provider: "gemini", model: "gemini-3.8-flash" },
  { provider: "openrouter", model: "openai/gpt-5.5" },
])("native Gemini endpoint → $provider", ({ provider, model }) => {
  it.each([false, true])("preserves tool-result media, reasoning and signed responses (stream=%s)", async (stream) => {
    const action = stream ? "streamGenerateContent" : "generateContent";
    const path = `${provider}/${model}:${action}`;
    const response = await POST(new Request(`http://router.test/v1beta/models/${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody()),
    }), { params: Promise.resolve({ path: path.split("/") }) });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    const wire = fixture.requests.at(-1);
    expect(wire.model).toBe(model);
    expect(media(wire)).toEqual([pngA, pngA, pngB]);
    expect(JSON.stringify(wire).split(pngA).length - 1).toBe(2);
    if (provider === "gemini") expect(wire.generationConfig.thinkingConfig).toMatchObject({ thinkingLevel: "low", includeThoughts: true });
    else expect(wire.reasoning).toMatchObject({ effort: "low" });
    const frames = stream ? text.split(/\r?\n\r?\n/).filter((frame) => frame.trim()).map((frame) => JSON.parse(frame.replace(/^data:\s*/, ""))) : [JSON.parse(text)];
    expect(text).not.toContain("[DONE]");
    const parts = frames.flatMap((frame) => frame.candidates?.flatMap((candidate) => candidate.content?.parts || []) || []);
    expect(parts.filter((part) => part.thought).map((part) => part.text).join("")).toBe("Inspecting");
    expect(parts.filter((part) => !part.thought).map((part) => part.text || "").join("")).toBe("東京");
    expect(parts.filter((part) => part.inlineData).map((part) => [part.inlineData.data, part.thoughtSignature])).toEqual(signatures.map((signature) => [pngB, signature]));
    expect(parts.find((part) => part.functionCall)?.functionCall).toEqual({ id: "call_next", name: "read_page", args: { page: 2 } });
    expect(frames.at(-1).usageMetadata).toMatchObject({ promptTokenCount: 32, candidatesTokenCount: 4, totalTokenCount: 39, thoughtsTokenCount: 3 });
  });
});

describe("Google SDK credentials on native Gemini chat", () => {
  it.each([
    { headers: { "x-goog-api-key": "synthetic-google-client" }, query: "", key: "synthetic-google-client" },
    { headers: {}, query: "?key=synthetic-query-client", key: "synthetic-query-client" },
    { headers: { Authorization: "Bearer synthetic-bearer-client", "x-goog-api-key": "ignored-google-key" }, query: "?key=ignored-query-key", key: "synthetic-bearer-client" },
  ])("authenticates $key using the shared key parser without losing native response data", async ({ headers, query, key }) => {
    fixture.clientKey = key;
    const path = "gemini/gemini-3.8-flash:generateContent";
    const response = await POST(new Request(`http://router.test/v1beta/models/${path}${query}`, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(requestBody()),
    }), { params: Promise.resolve({ path: path.split("/") }) });
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.candidates[0].content.parts.find((part) => part.functionCall)?.functionCall).toEqual({ id: "call_next", name: "read_page", args: { page: 2 } });
  });
});
