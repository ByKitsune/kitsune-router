import { describe, expect, it } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { normalizeGeminiToolResultMedia } from "../../open-sse/translator/formats/gemini.js";

const RED_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
const BLUE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAEElEQVR4nGNgYPj/nwFEAAAP+gP9jN1qlAAAAABJRU5ErkJggg==";
const SUMMARY = "Compacted summary: compare the retained tool screenshots with the native attachment.";
const image = data => ({ type: "image", source: { type: "base64", media_type: "image/png", data } });
const nativeImage = { inlineData: { mimeType: "image/png", data: BLUE_PNG, displayName: "native-capture" } };
const serialized = value => JSON.parse(JSON.stringify(value));
const wire = (source, target, body) => serialized(translateRequest(
  source, target, target === FORMATS.GEMINI ? "gemini-2.5-flash" : target === FORMATS.CLAUDE ? "claude-sonnet-4-6" : "gpt-4o",
  body, false, null, target === FORMATS.CLAUDE ? "claude" : null,
));

function history(response, parts = []) {
  return { generationConfig: { maxOutputTokens: 4096 }, contents: [
    { role: "user", parts: [{ text: SUMMARY }] },
    { role: "model", parts: [{ functionCall: { id: "read_png", name: "read_file", args: { path: "capture.png" } } }] },
    { role: "user", parts: [
      { functionResponse: { id: "read_png", name: "read_file", response, ...(parts.length ? { parts } : {}) } },
      { text: "Compare all retained captures." },
    ] },
  ] };
}

const contentParts = body => body.contents.flatMap(turn => turn.parts);
const responses = body => contentParts(body).filter(part => part.functionResponse).map(part => part.functionResponse);
const nativeMedia = body => contentParts(body).flatMap(part => [part, ...(part.functionResponse?.parts || [])])
  .filter(part => part.inlineData || part.inline_data).map(part => (part.inlineData || part.inline_data).data);

describe.each(["result", "output"])("Gemini response.%s media arrays", field => {
  const typedResponse = () => ({
    [field]: [
      { type: "text", text: "PNG ready" }, image(RED_PNG),
      { type: "image_url", image_url: { url: `data:image/png;base64,${RED_PNG}` } },
    ],
    error: { code: "partial_capture" }, page: 0, metadata: { retained: true, empty: null },
  });
  const expectedResponse = () => ({ [field]: "PNG ready", error: { code: "partial_capture" }, page: 0, metadata: { retained: true, empty: null } });

  it.each([FORMATS.OPENAI, FORMATS.CLAUDE])("keeps typed images out of %s prose and stable over serialized round trips", target => {
    const body = history(typedResponse(), [nativeImage]);
    const before = structuredClone(body);
    let native = body;
    for (let pass = 0; pass < 3; pass++) {
      const translated = wire(FORMATS.GEMINI, target, native);
      const toolText = target === FORMATS.OPENAI
        ? translated.messages.filter(msg => msg.role === "tool").map(msg => msg.content).join("\n")
        : translated.messages.flatMap(msg => msg.content).filter(part => part.type === "tool_result")
          .map(part => typeof part.content === "string" ? part.content : part.content.filter(block => block.type === "text").map(block => block.text).join("\n")).join("\n");
      expect(toolText).not.toContain(RED_PNG);
      expect(toolText).not.toContain(BLUE_PNG);
      native = wire(target, FORMATS.GEMINI, translated);
      expect(responses(native)).toEqual([{ id: "read_png", name: "read_file", response: expectedResponse() }]);
      expect(nativeMedia(native)).toEqual([RED_PNG, RED_PNG, BLUE_PNG]);
      expect(JSON.stringify(native).split(RED_PNG).length - 1).toBe(2);
      expect(JSON.stringify(native).split(BLUE_PNG).length - 1).toBe(1);
      expect(JSON.stringify(native).split(SUMMARY).length - 1).toBe(1);
      expect(native.generationConfig.maxOutputTokens).toBe(4096);
    }
    expect(body).toEqual(before);
  });

  it("normalizes native passthrough once while preserving existing FunctionResponse.parts", () => {
    const body = history(typedResponse(), [structuredClone(nativeImage)]);
    expect(normalizeGeminiToolResultMedia(body)).toBe(2);
    expect(responses(body)).toEqual([{ id: "read_png", name: "read_file", response: expectedResponse(), parts: [nativeImage] }]);
    expect(nativeMedia(body)).toEqual([BLUE_PNG, RED_PNG, RED_PNG]);
    const first = serialized(body);
    for (let pass = 0; pass < 3; pass++) {
      expect(normalizeGeminiToolResultMedia(body)).toBe(0);
      expect(serialized(body)).toEqual(first);
    }
  });

  it("extracts explicit media without flattening ordinary records beside it", () => {
    const record = { type: "record", text: "Keep this field as JSON", values: [0, false, null], example: image("literal-example") };
    const response = { [field]: [{ type: "text", text: "PNG ready" }, record, image(RED_PNG)], metadata: { retained: true } };
    const expected = { [field]: [{ type: "text", text: "PNG ready" }, record], metadata: { retained: true } };
    const body = history(response);
    const before = structuredClone(body);
    const chat = wire(FORMATS.GEMINI, FORMATS.OPENAI, body);
    expect(JSON.parse(chat.messages.find(msg => msg.role === "tool").content)).toEqual(expected);
    const roundtrip = wire(FORMATS.OPENAI, FORMATS.GEMINI, chat);
    expect(responses(roundtrip)[0].response).toEqual(expected);
    expect(nativeMedia(roundtrip)).toEqual([RED_PNG]);
    expect(body).toEqual(before);
    normalizeGeminiToolResultMedia(body);
    expect(responses(body)[0].response).toEqual(expected);
  });

  it("does not reinterpret ordinary JSON records, nested examples or literal data URLs as media", () => {
    const rows = [
      { type: "record", data: RED_PNG, mimeType: "image/png" },
      { type: "record", inlineData: { mimeType: "image/png", data: BLUE_PNG } },
      { id: "database-row", inlineData: { mimeType: "image/png", data: BLUE_PNG } },
      { example: image(RED_PNG) },
      `data:image/png;base64,${RED_PNG}`, false, 0, null,
    ];
    const response = { [field]: rows, metadata: { preview: image(RED_PNG) } };
    const body = history(response);
    const before = structuredClone(body);
    expect(normalizeGeminiToolResultMedia(body)).toBe(0);
    expect(body).toEqual(before);
    const chat = wire(FORMATS.GEMINI, FORMATS.OPENAI, body);
    expect(chat.messages.filter(msg => msg.role === "user").every(msg => typeof msg.content === "string")).toBe(true);
    expect(JSON.parse(chat.messages.find(msg => msg.role === "tool").content)).toEqual(response);
    const roundtrip = wire(FORMATS.OPENAI, FORMATS.GEMINI, chat);
    expect(responses(roundtrip)[0].response).toEqual(response);
    expect(nativeMedia(roundtrip)).toEqual([]);
  });
});

it("extracts both result and output media while leaving other response fields and native parts intact", () => {
  const body = history({
    result: [{ inline_data: { mime_type: "image/png", data: RED_PNG } }],
    output: [{ type: "image", mimeType: "image/png", data: BLUE_PNG }],
    metadata: { result: [image("metadata-example")] },
  }, [structuredClone(nativeImage)]);
  expect(normalizeGeminiToolResultMedia(body)).toBe(2);
  expect(responses(body)).toEqual([{ id: "read_png", name: "read_file", response: {
    result: "", output: "", metadata: { result: [image("metadata-example")] },
  }, parts: [nativeImage] }]);
  expect(nativeMedia(body)).toEqual([BLUE_PNG, RED_PNG, BLUE_PNG]);
  expect(normalizeGeminiToolResultMedia(body)).toBe(0);
});
