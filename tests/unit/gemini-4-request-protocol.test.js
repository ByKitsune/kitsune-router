import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ requests: [] }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {},
  saveRequestDetail: async () => {}, saveRequestUsage: async () => {},
  enqueueRequestUsage: async entry => ({ accepted: true, eventId: entry.eventId }),
}));
vi.mock("../../src/lib/db/repos/aliasRepo.js", () => ({ getCustomModels: async () => [] }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("../../open-sse/utils/proxyFetch.js", async original => ({ ...await original(), proxyAwareFetch: async (url, init) => {
  const body = JSON.parse(init.body);
  fixture.requests.push({ url, body });
  const response = {
    candidates: [{ content: { role: "model", parts: [{ text: "Synthetic reply" }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
  };
  if (body.request) return Response.json({ response });
  if (body.contents) return Response.json(response);
  return Response.json({
    id: "chatcmpl-synthetic-protocol", object: "chat.completion", model: body.model,
    choices: [{ index: 0, message: { role: "assistant", content: "Synthetic reply" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  });
} }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const MODEL = "gemini-4-argon";
const PNG_A = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_B = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const CALL_SIGNATURE = "c3ludGhldGljLWNhbGw=";
const MEDIA_SIGNATURE = "c3ludGhldGljLW1lZGlh";
const log = { debug() {}, info() {}, warn() {} };
const credentials = () => ({ apiKey: "synthetic-protocol-key", accessToken: "synthetic-protocol-token", projectId: "synthetic-protocol-project", connectionId: "synthetic-protocol-session", providerSpecificData: { projectId: "synthetic-protocol-project", location: "global" } });
const targets = [
  { name: "Gemini", provider: "gemini", format: FORMATS.GEMINI },
  { name: "Gemini CLI", provider: "gemini-cli", format: FORMATS.GEMINI_CLI, envelope: true },
  { name: "Antigravity", provider: "antigravity", format: FORMATS.ANTIGRAVITY, envelope: true },
  { name: "Vertex", provider: "vertex", format: FORMATS.VERTEX },
];
const nativeRoutes = [
  ...targets,
  { ...targets[1], name: "Gemini CLI passthrough", native: true },
  { ...targets[2], name: "Antigravity passthrough", native: true },
];
const requestOf = (body) => body.request || body;
const kind = (part) => Object.keys(part).find((key) => key !== "thoughtSignature");
const wrap = (target, request, model = MODEL) => target.envelope
  ? { model, project: "synthetic-protocol-project", userAgent: target.native ? target.provider : "protocol-fixture", request, stream: false }
  : { ...request, model, stream: false };

beforeEach(() => { fixture.requests = []; });

async function dispatch(target, body, sourceFormat = target.format, model = MODEL) {
  return handleChatCore({
    body, modelInfo: { provider: target.provider, model }, sourceFormatOverride: sourceFormat,
    credentials: credentials(), connectionId: "synthetic-protocol-session", log,
    clientRawRequest: { endpoint: "/v1/chat/completions", body, headers: target.native ? { "user-agent": `${target.provider}/protocol-fixture` } : {} },
  });
}

function chatHistory() {
  return { stream: false, messages: [
    { role: "user", content: "Inspect the tool result" },
    { role: "assistant", content: null, tool_calls: [{ id: `call_read_TSIG_${Buffer.from(CALL_SIGNATURE).toString("base64url")}`, type: "function", function: { name: "read", arguments: '{"page":1}' } }] },
    { role: "tool", tool_call_id: `call_read_TSIG_${Buffer.from(CALL_SIGNATURE).toString("base64url")}`, content: "result" },
    { role: "user", content: "Now explain the result" },
  ] };
}

function nativeHistory(merge) {
  const firstResponse = { functionResponse: { id: "call_a", name: "read", response: { result: "Permission denied", error: { code: "denied" }, metadata: { attempt: 0 } } } };
  const secondResponse = { functionResponse: { id: "call_b", name: "read", response: { result: false }, parts: [{ inlineData: { mimeType: "image/png", data: PNG_B }, thoughtSignature: MEDIA_SIGNATURE }] } };
  const parts = [
    firstResponse,
    { text: "Compare the captures", thoughtSignature: MEDIA_SIGNATURE },
    { inline_data: { mime_type: "image/png", data: PNG_A }, thoughtSignature: MEDIA_SIGNATURE },
    secondResponse,
    { executableCode: { language: "PYTHON", code: "print(1)" } },
    { fileData: { mimeType: "application/pdf", fileUri: "gs://synthetic-protocol/document.pdf" } },
    { text: "The repeated capture is intentional" },
    { inlineData: { mimeType: "image/png", data: PNG_A }, thoughtSignature: MEDIA_SIGNATURE },
  ];
  return {
    generationConfig: { maxOutputTokens: 8192, seed: 7, stopSequences: ["END"] },
    contents: [
      { role: "user", parts: [{ text: "Inspect both captures" }] },
      { role: "model", parts: [
        { functionCall: { id: "call_a", name: "read", args: { page: 1 } }, thoughtSignature: CALL_SIGNATURE },
        { functionCall: { id: "call_b", name: "read", args: { page: 2 } }, thoughtSignature: CALL_SIGNATURE },
      ] },
      ...(merge ? [{ role: "user", parts: parts.slice(0, 3) }, { role: "user", parts: parts.slice(3) }] : [{ role: "user", parts }]),
    ],
  };
}

// Only I/O is replaced: actual Core routing, registered translators and all
// provider executors prepare and serialize every observed request.
describe.each(targets)("$name Gemini 4 translated execution", (target) => {
  it("places a merged tool result after the user's follow-up text", async () => {
    const body = chatHistory();
    const before = structuredClone(body);
    const translated = translateRequest(FORMATS.OPENAI, target.format, MODEL, body, false, credentials(), target.provider);
    expect(requestOf(translated).contents.at(-1).parts.map(kind)).toEqual(["text", "functionResponse"]);
    const result = await dispatch(target, body, FORMATS.OPENAI);
    expect(result.success).toBe(true);
    const wire = requestOf(fixture.requests.at(-1).body);
    expect(wire.contents.at(-1).parts.map(kind)).toEqual(["text", "functionResponse"]);
    const call = wire.contents[1].parts.find((part) => part.functionCall).functionCall;
    const response = wire.contents.at(-1).parts.at(-1).functionResponse;
    expect(call).toMatchObject({ name: "read", args: { page: 1 } });
    expect(response).toMatchObject({ name: "read", response: { result: "result" } });
    if (target.provider !== "vertex") expect(response.id).toBe(call.id);
    expect(wire.contents[1].parts.find((part) => part.functionCall).thoughtSignature).toBe(CALL_SIGNATURE);
    expect(body).toEqual(before);
  });
});

describe.each(nativeRoutes)("$name Gemini 4 native preparation", (target) => {
  it.each([false, true])("stable-partitions responses while retaining signed media, opaque parts and ownership (merge=%s)", async (merge) => {
    const request = nativeHistory(merge);
    const originalParts = request.contents.slice(2).flatMap((turn) => turn.parts);
    const body = wrap(target, request);
    const before = structuredClone(body);
    const result = await dispatch(target, body);
    expect(result.success).toBe(true);
    const wire = requestOf(fixture.requests.at(-1).body);
    expect(wire.contents).toHaveLength(3);
    expect(wire.contents[1].parts).toEqual(request.contents[1].parts);
    const parts = wire.contents[2].parts;
    expect(parts.map(kind)).toEqual(["text", "inline_data", "executableCode", "fileData", "text", "inlineData", "functionResponse", "functionResponse"]);
    expect(parts.slice(0, 6)).toEqual([originalParts[1], originalParts[2], originalParts[4], originalParts[5], originalParts[6], originalParts[7]]);
    expect(parts.slice(6)).toEqual([originalParts[0], originalParts[3]]);
    expect(parts.slice(6).map((part) => part.functionResponse.id)).toEqual(["call_a", "call_b"]);
    expect(parts.filter((part) => part.text).map((part) => part.text).join("\n")).not.toContain(PNG_A);
    expect(JSON.stringify(wire).split(PNG_A).length - 1).toBe(2);
    expect(JSON.stringify(wire).split(PNG_B).length - 1).toBe(1);
    expect(wire.generationConfig).toMatchObject({ maxOutputTokens: 8192, seed: 7, stopSequences: ["END"] });
    expect(body).toEqual(before);
    const replay = await dispatch(target, wrap(target, wire));
    expect(replay.success).toBe(true);
    expect(requestOf(fixture.requests.at(-1).body).contents).toEqual(wire.contents);
  });
});

it.each([false, true])("normalizes direct Antigravity preparation without depending on Core (merge=%s)", (merge) => {
  const request = nativeHistory(merge);
  const body = wrap(targets[2], request);
  const before = structuredClone(body);
  const wire = new AntigravityExecutor().transformRequest(MODEL, body, false, credentials()).request;
  expect(wire.contents.at(-1).parts.map(kind)).toEqual(["text", "inline_data", "executableCode", "fileData", "text", "inlineData", "functionResponse", "functionResponse"]);
  expect(wire.contents[1].parts).toEqual(request.contents[1].parts);
  expect(body).toEqual(before);
});

it.each([
  { ...targets[0], model: "gemini-2.5-flash" },
  { ...targets[0], model: "gemini-3.8-flash" },
  { ...targets[2], model: "claude-sonnet-4-6" },
])("preserves existing native result/text order for $provider/$model", async (target) => {
  const request = {
    contents: [
      { role: "user", parts: [{ text: "Inspect" }] },
      { role: "model", parts: [{ functionCall: { id: "call_read", name: "read", args: {} }, thoughtSignature: CALL_SIGNATURE }] },
      { role: "user", parts: [{ functionResponse: { id: "call_read", name: "read", response: { result: "result" } } }, { text: "Now explain" }] },
    ],
  };
  const result = await dispatch(target, wrap(target, request, target.model), target.format, target.model);
  expect(result.success).toBe(true);
  expect(requestOf(fixture.requests.at(-1).body).contents.at(-1).parts.map(kind)).toEqual(["functionResponse", "text"]);
});

const samplingControls = [
  { chat: "temperature", native: "temperature", value: 0 },
  { chat: "top_p", native: "topP", value: 0 },
  { chat: "top_k", native: "topK", value: 20 },
];

it.each(nativeRoutes)("does not manufacture native tool results on $name while fixing response ordering", async (target) => {
  const request = nativeHistory(false);
  request.contents = request.contents.slice(0, 2);
  const result = await dispatch(target, wrap(target, request));
  expect(result.success).toBe(true);
  const contents = requestOf(fixture.requests.at(-1).body).contents;
  expect(contents).toEqual(request.contents);
  expect(contents.flatMap((turn) => turn.parts).filter((part) => part.functionResponse)).toEqual([]);
});

it.each(targets)("does not fabricate pending client-tool success during $name translation", async target => {
  const body = chatHistory();
  body.messages = body.messages.slice(0, 2);
  const translated = translateRequest(FORMATS.OPENAI, target.format, MODEL, body, false, credentials(), target.provider);
  expect(requestOf(translated).contents.at(-1).role).toBe("model");
  expect(requestOf(translated).contents.flatMap(turn => turn.parts).filter(part => part.functionResponse)).toEqual([]);
  const result = await dispatch(target, body, FORMATS.OPENAI);
  expect(result.success).toBe(true);
  const contents = requestOf(fixture.requests.at(-1).body).contents;
  expect(contents.at(-1).parts.some(part => part.functionCall)).toBe(true);
  expect(contents.flatMap(turn => turn.parts).filter(part => part.functionResponse)).toEqual([]);
});

async function expectUnsupported(target, body, sourceFormat, param) {
  const before = structuredClone(body);
  expect(() => translateRequest(sourceFormat, target.format, MODEL, body, false, credentials(), target.provider))
    .toThrowError(expect.objectContaining({ code: "unsupported_parameter", param }));
  expect(body).toEqual(before);
  const result = await dispatch(target, body, sourceFormat);
  expect(result.response.status).toBe(400);
  expect((await result.response.json()).error).toMatchObject({ type: "invalid_request_error", code: "unsupported_parameter", param });
  expect(fixture.requests).toEqual([]);
  expect(body).toEqual(before);
}

// Google documents Gemini 4 sampling as ignored; Zen reports unsupported intent
// instead of silently deleting it or promising that the requested control worked.
describe.each(nativeRoutes)("$name Gemini 4 unsupported sampling intent", (target) => {
  it.each(samplingControls)("returns an explicit error for translated $chat instead of dropping intent", async ({ chat, value }) => {
    await expectUnsupported(target, { ...chatHistory(), [chat]: value }, FORMATS.OPENAI, chat);
  });

  it.each(samplingControls)("returns the native $native parameter path before dispatch", async ({ native, value }) => {
    const body = wrap(target, { ...nativeHistory(false), generationConfig: { [native]: value } });
    await expectUnsupported(target, body, target.format, `${target.envelope ? "request." : ""}generationConfig.${native}`);
  });

  it.each(samplingControls)("does not lose a root compatibility $chat control on an envelope", async ({ chat, value }) => {
    await expectUnsupported(target, { ...wrap(target, nativeHistory(false)), [chat]: value }, target.format, chat);
  });

  it.each(samplingControls)("does not discard a root generationConfig.$native beside an envelope", async ({ native, value }) => {
    await expectUnsupported(target, { ...wrap(target, nativeHistory(false)), generationConfig: { [native]: value } }, target.format, `generationConfig.${native}`);
  });

  it("keeps unrelated explicit generation controls when sampling is unset", async () => {
    const body = wrap(target, { ...nativeHistory(false), generationConfig: {
      temperature: null, topP: undefined, topK: null, maxOutputTokens: 8192, seed: 7, stopSequences: ["END"], thinkingConfig: { thinkingLevel: "low", includeThoughts: true },
    } });
    const result = await dispatch(target, body);
    expect(result.success).toBe(true);
    expect(requestOf(fixture.requests.at(-1).body).generationConfig).toMatchObject({
      maxOutputTokens: 8192, seed: 7, stopSequences: ["END"], thinkingConfig: { thinkingLevel: "low", includeThoughts: true },
    });
  });
});

it.each(targets)("preserves supported Gemini 3 sampling on $name", async (target) => {
  const body = { ...chatHistory(), temperature: 0, top_p: 0.25, top_k: 17 };
  const result = await dispatch(target, body, FORMATS.OPENAI, "gemini-3.8-flash");
  expect(result.success).toBe(true);
  expect(requestOf(fixture.requests.at(-1).body).generationConfig).toMatchObject({ temperature: 0, topP: 0.25, topK: 17 });
});

it("does not impose Google's native sampling restrictions on an OpenAI-compatible reseller", async () => {
  const target = { provider: "openrouter", format: FORMATS.OPENAI };
  const result = await dispatch(target, { ...chatHistory(), temperature: 0, top_p: 0.25, top_k: 17 }, FORMATS.OPENAI);
  expect(result.success).toBe(true);
  expect(fixture.requests.at(-1).body).toMatchObject({ temperature: 0, top_p: 0.25, top_k: 17 });
});
