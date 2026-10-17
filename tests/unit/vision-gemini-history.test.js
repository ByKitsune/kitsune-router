import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { geminiToOpenAIRequest } from "../../open-sse/translator/request/gemini-to-openai.js";
import { antigravityToOpenAIRequest } from "../../open-sse/translator/request/antigravity-to-openai.js";
import { normalizeGeminiContents } from "../../open-sse/translator/formats/gemini.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";

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

// Valid 1x1 PNGs with large, checksummed tEXt sentinels keep fixtures synthetic
// while making textified screenshots visible in serialized occurrence counts.
function sentinelPng(label) {
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", Buffer.from("00000001000000010806000000", "hex")),
    pngChunk("tEXt", Buffer.from(`vision-fixture\0${`${label}:`.repeat(4096)}`)),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0, 255]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

const PNG_A = sentinelPng("initial-capture");
const PNG_B = sentinelPng("first-tool-capture");
const PNG_C = sentinelPng("after-compaction-capture");
const REMOTE_IMAGE = "https://vision.invalid/captures/reference.png?revision=2";
const SUMMARY = "Compacted summary: the initial capture and the first tool result were inspected; compare the next capture without recreating old attachments.";
const digest = (data) => createHash("sha256").update(data).digest("hex");
const inlineIdentity = (data, mimeType = "image/png") => ({ mimeType, sha256: digest(data), length: data.length });
const remoteIdentity = { mimeType: "image/png", url: REMOTE_IMAGE };
const text = (value) => ({ type: "text", text: value });
const image = (data) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${data}` } });
const remoteImage = () => ({ type: "image_url", image_url: { url: REMOTE_IMAGE, mime_type: "image/png" } });
const call = (id, name, step = 1) => ({ id, type: "function", function: { name, arguments: JSON.stringify({ step }) } });
const assistant = (...calls) => ({ role: "assistant", content: null, tool_calls: calls });
const tool = (id, content) => ({ role: "tool", tool_call_id: id, content });
const serialized = (value) => JSON.parse(JSON.stringify(value));

const targets = [
  { name: "Gemini API", format: FORMATS.GEMINI, model: "gemini-2.5-flash" },
  { name: "Gemini CLI", format: FORMATS.GEMINI_CLI, model: "gemini-2.5-flash" },
  { name: "Antigravity Gemini", format: FORMATS.ANTIGRAVITY, model: "gemini-2.5-flash" },
  { name: "Antigravity Claude", format: FORMATS.ANTIGRAVITY, model: "claude-sonnet-4-6" },
  { name: "Gemini 4 API", format: FORMATS.GEMINI, model: "gemini-4-argon", functionResponsesLast: true },
  { name: "Gemini 4 CLI", format: FORMATS.GEMINI_CLI, model: "gemini-4-argon", functionResponsesLast: true },
  { name: "Antigravity Gemini 4", format: FORMATS.ANTIGRAVITY, model: "gemini-4-argon-high", functionResponsesLast: true },
];
const sources = [
  { name: "Gemini", convert: geminiToOpenAIRequest, wrap: (request) => request },
  { name: "Antigravity", convert: antigravityToOpenAIRequest, wrap: (request) => ({ project: "vision-fixture", userAgent: "antigravity", model: "gemini-2.5-flash", request }) },
];

function wire(target, body, source = FORMATS.OPENAI) {
  const credentials = { projectId: "vision-fixture-project", connectionId: "vision-fixture-session" };
  const translated = translateRequest(source, target.format, target.model, body, false, credentials, target.format);
  const output = target.format === FORMATS.ANTIGRAVITY
    ? new AntigravityExecutor().transformRequest(target.model, translated, false, credentials)
    : translated;
  return serialized(output.request || output);
}

function parts(request) {
  return request.contents.flatMap((content) => content.parts);
}

function exchanges(request) {
  const all = parts(request);
  return {
    calls: all.filter((part) => part.functionCall).map((part) => part.functionCall),
    responses: all.filter((part) => part.functionResponse).map((part) => part.functionResponse),
  };
}

function mediaIdentities(request) {
  const identities = [];
  for (const part of parts(request)) {
    for (const candidate of [part, ...(part.functionResponse?.parts || [])]) {
      const inline = candidate.inlineData || candidate.inline_data;
      const file = candidate.fileData || candidate.file_data;
      if (inline) identities.push(inlineIdentity(inline.data, inline.mimeType || inline.mime_type || null));
      if (file) identities.push({ mimeType: file.mimeType || file.mime_type, url: file.fileUri || file.file_uri });
    }
  }
  return identities;
}

function expectNoTextifiedMedia(request) {
  const toolJson = JSON.stringify(exchanges(request).responses.map((response) => response.response));
  const visibleText = parts(request).filter((part) => typeof part.text === "string").map((part) => part.text).join("\n");
  for (const [label, data] of [["initial", PNG_A], ["first tool", PNG_B], ["compacted tool", PNG_C]]) {
    expect(toolJson.includes(data), `${label} bytes in functionResponse.response`).toBe(false);
    expect(visibleText.includes(data), `${label} bytes in visible text`).toBe(false);
  }
}

function expectOccurrences(request, expected = [1, 2, 1]) {
  const json = JSON.stringify(request);
  for (const [index, data] of [PNG_A, PNG_B, PNG_C].entries()) {
    expect(json.split(data).length - 1, `image ${index + 1} serialized occurrence count`).toBe(expected[index]);
  }
}

function openAIHistory() {
  return { messages: [
    { role: "user", content: [text("Inspect the initial capture"), image(PNG_A)] },
    assistant(call("call_reused", "capture_first"), call("call_parallel", "inspect_reference")),
    tool("call_reused", [image(PNG_B)]),
    tool("call_parallel", [text("reference says ready"), remoteImage()]),
    { role: "assistant", content: "Both captures were inspected." },
    { role: "user", content: SUMMARY },
    assistant(call("call_reused", "capture_after_compaction", 2)),
    tool("call_reused", [text("second screenshot"), image(PNG_C), image(PNG_B)]),
    { role: "user", content: "Compare the retained captures." },
  ] };
}

function nativeHistory() {
  return { contents: [
    { role: "user", parts: [{ text: "Inspect the initial capture" }, { inline_data: { mime_type: "image/png", data: PNG_A } }] },
    { role: "model", parts: [
      { functionCall: { id: "call_reused", name: "capture_first", args: { step: 1 } } },
      { functionCall: { id: "call_parallel", name: "inspect_reference", args: { step: 1 } } },
    ] },
    { role: "user", parts: [
      { functionResponse: { id: "call_reused", name: "capture_first", response: { result: [{ inlineData: { mimeType: "image/png", data: PNG_B } }] } } },
      { functionResponse: { id: "call_parallel", name: "inspect_reference", response: { result: [text("reference says ready"), { fileData: { fileUri: REMOTE_IMAGE, mimeType: "image/png" } }] } } },
      { text: "Keep this user text beside both results." },
    ] },
    { role: "model", parts: [{ text: "Both captures were inspected." }] },
    { role: "user", parts: [{ text: SUMMARY }] },
    { role: "model", parts: [{ functionCall: { id: "call_reused", name: "capture_after_compaction", args: { step: 2 } } }] },
    { role: "user", parts: [
      { functionResponse: { id: "call_reused", name: "capture_after_compaction", response: { result: [text("second screenshot"), { inline_data: { mime_type: "image/png", data: PNG_C } }, image(PNG_B)] } } },
      { text: "Compare the retained captures." },
    ] },
  ] };
}

const expectedHistoryMedia = [inlineIdentity(PNG_A), inlineIdentity(PNG_B), remoteIdentity, inlineIdentity(PNG_C), inlineIdentity(PNG_B)];

function expectHistory(request) {
  expect(mediaIdentities(request)).toEqual(expectedHistoryMedia);
  expectNoTextifiedMedia(request);
  expectOccurrences(request);
  const { calls, responses } = exchanges(request);
  expect(calls.map((value) => value.name)).toEqual(["capture_first", "inspect_reference", "capture_after_compaction"]);
  expect(calls.map((value) => value.args)).toEqual([{ step: 1 }, { step: 1 }, { step: 2 }]);
  expect(new Set(calls.map((value) => value.id)).size).toBe(3);
  expect(responses.map((value) => ({ id: value.id, name: value.name }))).toEqual(calls.map((value) => ({ id: value.id, name: value.name })));
  expect(responses.map((value) => value.response)).toEqual([{ result: "" }, { result: "reference says ready" }, { result: "second screenshot" }]);
  expect(parts(request).filter((part) => part.text === SUMMARY)).toHaveLength(1);
  for (const content of request.contents.filter((value) => value.parts.some((part) => part.functionResponse))) {
    expect(content.role).toBe("user");
  }
}

describe.each(targets)("$name typed tool-result history", (target) => {
  it("serializes each image occurrence as vision data, preserving parallel/reused tool linkage and a compacted summary", () => {
    const body = openAIHistory();
    const before = structuredClone(body);
    const first = wire(target, body);
    expectHistory(first);
    if (target.functionResponsesLast) {
      for (const turn of first.contents.filter((content) => content.parts.some((part) => part.functionResponse))) {
        const firstResponse = turn.parts.findIndex((part) => part.functionResponse);
        expect(turn.parts.slice(firstResponse).every((part) => part.functionResponse), "responses follow every text/media Part").toBe(true);
      }
    }
    expect(JSON.stringify(body) === JSON.stringify(before), "caller-owned history remains unchanged").toBe(true);
    expect(JSON.stringify(wire(target, body).contents) === JSON.stringify(first.contents), "retries serialize identical history").toBe(true);
  });

  it("preserves Claude error-result text and its typed screenshot through the OpenAI bridge", () => {
    const body = { messages: [
      { role: "user", content: "Capture the error dialog" },
      { role: "assistant", content: [{ type: "tool_use", id: "call_error", name: "capture_dialog", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_error", is_error: true, content: [
        text("Permission denied"),
        { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_C } },
      ] }] },
    ] };
    const before = structuredClone(body);
    const output = wire(target, body, FORMATS.CLAUDE);
    expect(mediaIdentities(output)).toEqual([inlineIdentity(PNG_C)]);
    expectNoTextifiedMedia(output);
    expectOccurrences(output, [0, 0, 1]);
    const { calls, responses } = exchanges(output);
    expect(responses).toHaveLength(1);
    expect(responses[0].id).toBe(calls[0].id);
    expect(responses[0].name).toBe("capture_dialog");
    expect(JSON.stringify(responses[0].response)).toContain("[tool_error] Permission denied");
    expect(JSON.stringify(body) === JSON.stringify(before), "caller-owned Claude history remains unchanged").toBe(true);
  });
});

describe.each(sources)("$name native multimodal history", (source) => {
  it("keeps every functionResponse and co-located user text, with typed media on its own tool occurrence", () => {
    const body = source.wrap(nativeHistory());
    const before = structuredClone(body);
    const intermediate = serialized(source.convert("gemini-2.5-flash", body, false));
    const outputs = intermediate.messages.filter((message) => message.role === "tool");
    expect(outputs.map((message) => message.tool_call_id)).toEqual(["call_reused", "call_parallel", "call_reused"]);
    expect(outputs.map((message) => Array.isArray(message.content))).toEqual([true, true, true]);
    expect(outputs.map((message) => message.content.filter((part) => part.type === "image_url").map((part) => part.image_url.url.startsWith("data:") ? digest(part.image_url.url.slice(part.image_url.url.indexOf(",") + 1)) : part.image_url.url)))
      .toEqual([[digest(PNG_B)], [REMOTE_IMAGE], [digest(PNG_C), digest(PNG_B)]]);
    const userText = intermediate.messages.filter((message) => message.role === "user").flatMap((message) => typeof message.content === "string" ? [message.content] : message.content.filter((part) => part.type === "text").map((part) => part.text));
    expect(userText).toContain("Keep this user text beside both results.");
    expect(userText).toContain(SUMMARY);
    expect(userText).toContain("Compare the retained captures.");
    expect(JSON.stringify(body) === JSON.stringify(before), "caller-owned native history remains unchanged").toBe(true);
  });

  it("round-trips serialized history repeatedly without expanding, dropping or duplicating media", () => {
    const body = source.wrap(nativeHistory());
    const before = structuredClone(body);
    let intermediate = source.convert("gemini-2.5-flash", body, false);
    for (let pass = 0; pass < 3; pass++) {
      const output = wire(targets[0], intermediate);
      expectHistory(output);
      expect(parts(output).some((part) => part.text === "Keep this user text beside both results.")).toBe(true);
      intermediate = geminiToOpenAIRequest("gemini-2.5-flash", output, false);
    }
    expect(JSON.stringify(body) === JSON.stringify(before), "round-tripping leaves native input unchanged").toBe(true);
  });

  it("extracts native functionResponse.parts images while retaining the complete structured response metadata", () => {
    const response = { result: "capture saved", width: 1, metadata: { source: "synthetic-tool", retained: true } };
    const body = source.wrap({ contents: [
      { role: "user", parts: [{ text: "Capture both states" }] },
      { role: "model", parts: [{ functionCall: { id: "call_parts", name: "capture_states", args: {} } }] },
      { role: "user", parts: [{ functionResponse: { id: "call_parts", name: "capture_states", response, parts: [
        { inlineData: { mimeType: "image/png", data: PNG_B } },
        { inline_data: { mime_type: "image/png", data: PNG_C } },
      ] } }] },
    ] });
    const before = structuredClone(body);
    const intermediate = source.convert("gemini-2.5-flash", body, false);
    const output = wire(targets[0], intermediate);
    expect(mediaIdentities(output)).toEqual([inlineIdentity(PNG_B), inlineIdentity(PNG_C)]);
    expectOccurrences(output, [0, 1, 1]);
    expectNoTextifiedMedia(output);
    expect(exchanges(output).responses).toEqual([{ id: "call_parts", name: "capture_states", response }]);
    expect(JSON.stringify(body) === JSON.stringify(before), "native tool response remains unchanged").toBe(true);
  });

  it.each([
    ["camel case", (data) => ({ inlineData: { mimeType: "image/png", data } })],
    ["existing mixed-case MIME", (data) => ({ inlineData: { mime_type: "image/png", data } })],
    ["snake case", (data) => ({ inline_data: { mime_type: "image/png", data } })],
  ])("retains top-level %s image bytes and MIME through both directions", (_name, inlinePart) => {
    const body = source.wrap({ contents: [{ role: "user", parts: [inlinePart(PNG_A)] }] });
    const before = structuredClone(body);
    const intermediate = serialized(source.convert("gemini-2.5-flash", body, false));
    const content = intermediate.messages[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]?.type).toBe("image_url");
    expect(content[0]?.image_url?.url === `data:image/png;base64,${PNG_A}`, "typed data URL preserves MIME and exact bytes").toBe(true);
    expect(mediaIdentities(wire(targets[0], intermediate))).toEqual([inlineIdentity(PNG_A)]);
    expect(JSON.stringify(body) === JSON.stringify(before), "native image remains unchanged").toBe(true);
  });

  it("keeps image-only model history as typed media rather than dropping the assistant content", () => {
    const body = source.wrap({ contents: [
      { role: "user", parts: [{ text: "Show a sample capture" }] },
      { role: "model", parts: [{ inlineData: { mimeType: "image/png", data: PNG_A } }] },
      { role: "user", parts: [{ text: "Compare this with the next capture" }] },
    ] });
    const intermediate = source.convert("gemini-2.5-flash", body, false);
    const output = wire(targets[0], intermediate);
    expect(mediaIdentities(output)).toEqual([inlineIdentity(PNG_A)]);
    expectOccurrences(output, [1, 0, 0]);
    expect(output.contents.find((turn) => turn.parts.some((part) => part.inlineData))?.role).toBe("model");
  });

  it.each([{ result: "" }, { result: "done" }, { result: '{"status":"literal JSON-looking text"}' }, { result: false }, { result: 0 }, { result: null }, { result: ["plain", 2] }])("preserves a native result value $result and its sibling metadata across repeated hops", ({ result }) => {
    const response = { result, metadata: { retained: true } };
    const body = source.wrap({ contents: [
      { role: "user", parts: [{ text: "Return the value without changing its meaning" }] },
      { role: "model", parts: [{ functionCall: { id: "call_value", name: "read_value", args: {} } }] },
      { role: "user", parts: [{ functionResponse: { id: "call_value", name: "read_value", response } }] },
    ] });
    let intermediate = source.convert("gemini-2.5-flash", body, false);
    for (let pass = 0; pass < 3; pass++) {
      const output = wire(targets[0], intermediate);
      expect(exchanges(output).responses).toEqual([{ id: "call_value", name: "read_value", response }]);
      expect(mediaIdentities(output)).toEqual([]);
      intermediate = geminiToOpenAIRequest("gemini-2.5-flash", output, false);
    }
  });

  it("does not mistake ordinary structured results or literal JSON/base64 prose for attachments", () => {
    const literal = 'Literal example, not an attachment: {"inlineData":{"mimeType":"image/png","data":"aW1hZ2U="}}';
    const response = { result: [{ type: "record", data: "aW1hZ2U=", mimeType: "image/png" }], metadata: { keep: "ordinary tool metadata" } };
    const body = source.wrap({ contents: [
      { role: "user", parts: [{ text: literal }] },
      { role: "model", parts: [{ functionCall: { id: "call_json", name: "read_records", args: {} } }] },
      { role: "user", parts: [{ functionResponse: { id: "call_json", name: "read_records", response } }] },
    ] });
    const intermediate = source.convert("gemini-2.5-flash", body, false);
    const output = wire(targets[0], intermediate);
    expect(mediaIdentities(output)).toEqual([]);
    expect(parts(output).filter((part) => part.text === literal)).toHaveLength(1);
    expect(exchanges(output).responses).toEqual([{ id: "call_json", name: "read_records", response }]);
  });
});

it("keeps adjacent user-turn media occurrence counts stable across repeated Gemini normalization", () => {
  const contents = [
    { role: "user", parts: [{ inlineData: { mimeType: "image/png", data: PNG_A } }] },
    { role: "user", parts: [{ text: SUMMARY }, { inlineData: { mimeType: "image/png", data: PNG_B } }] },
    { role: "user", parts: [{ inline_data: { mime_type: "image/png", data: PNG_A } }] },
  ];
  const before = structuredClone(contents);
  const first = serialized({ contents: normalizeGeminiContents(contents) });
  const second = serialized({ contents: normalizeGeminiContents(first.contents) });
  expect(mediaIdentities(first)).toEqual([inlineIdentity(PNG_A), inlineIdentity(PNG_B), inlineIdentity(PNG_A)]);
  expect(JSON.stringify(second) === JSON.stringify(first), "normalization is idempotent").toBe(true);
  expectOccurrences(second, [2, 1, 0]);
  expect(JSON.stringify(contents) === JSON.stringify(before), "normalization leaves source parts unchanged").toBe(true);
});
