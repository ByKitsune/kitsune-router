import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ sent: [], declared: undefined }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {},
  saveRequestDetail: async () => {}, saveRequestUsage: async () => {},
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => fixture.declared }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("../../open-sse/executors/index.js", () => ({ getExecutor: () => ({
  execute: async ({ body }) => {
    fixture.sent.push(structuredClone(body));
    return { responseFormat: "openai", response: Response.json({
      id: "chatcmpl-document-fixture", object: "chat.completion", model: "fixture",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }) };
  },
}) }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { getCapabilitiesForModel, setCatalogSource, withDeclaredCapabilities } from "../../open-sse/providers/capabilities.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { handleBypassRequest } from "../../open-sse/utils/bypassHandler.js";

const PDF = Buffer.from("%PDF-1.4\nZEN-PDF-MARKER-42\n%%EOF").toString("base64");
const URI = `data:application/pdf;base64,${PDF}`;
const file = () => ({ type: "file", file: { filename: "marker.pdf", file_data: URI } });
const nativeFile = () => ({ type: "input_file", filename: "marker.pdf", file_data: URI });
const document = () => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: PDF } });

const sources = [
  [FORMATS.OPENAI, () => ({ messages: [{ role: "user", content: [file()] }] }), "messages.0.content.0"],
  [FORMATS.OPENAI_RESPONSES, () => ({ input: [{ role: "user", content: [nativeFile()] }] }), "input.0.content.0"],
  [FORMATS.CLAUDE, () => ({ messages: [{ role: "user", content: [document()] }] }), "messages.0.content.0"],
  [FORMATS.GEMINI, () => ({ contents: [{ role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data: PDF } }] }] }), "contents.0.parts.0"],
];

function dispatch(body, sourceFormatOverride, provider = "codex", model = "gpt-6-astra", headers = {}) {
  return handleChatCore({ body: { ...body, stream: false }, sourceFormatOverride,
    modelInfo: { provider, model }, credentials: { accessToken: "synthetic-only" },
    clientRawRequest: { endpoint: "/v1/chat/completions", body, headers },
    userAgent: headers["user-agent"],
    log: { debug() {}, info() {}, warn() {} },
  });
}

beforeEach(() => { fixture.sent = []; fixture.declared = undefined; setCatalogSource(null); });
afterEach(() => { setCatalogSource(null); });

describe("document admission before billable dispatch", () => {
  it("keeps document warmup requests on the normal app-side admission path", () => {
    const body = { messages: [{ role: "user", content: [{ type: "text", text: "Warmup" }, file()] }] };
    expect(handleBypassRequest(body, "cx/gpt-6-astra", "claude-cli/fixture")).toBeNull();
    expect(handleBypassRequest(body, "ag/gemini-3.8-flash-high", "claude-cli/fixture")).toBeNull();
  });
  it.each(sources)("rejects unsupported Codex PDFs from %s without changing input or dispatching", async (format, create, param) => {
    const body = create();
    const before = structuredClone(body);
    const result = await dispatch(body, format);
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toMatchObject({ type: "invalid_request_error", code: "unsupported_parameter", param });
    expect(fixture.sent).toEqual([]);
    expect(body).toEqual(before);
  });

  it("does not bypass document admission for a native Codex CLI request", async () => {
    const result = await dispatch(sources[1][1](), FORMATS.OPENAI_RESPONSES, "codex", "gpt-6-astra-review", { "user-agent": "codex_cli_rs/0.163.0" });
    expect(result.response.status).toBe(400);
    expect(fixture.sent).toEqual([]);
  });

  it("does not return a synthetic CLI warmup success for a document-bearing request", async () => {
    const result = await dispatch({ messages: [{ role: "user", content: [
      { type: "text", text: "Warmup" }, file(),
    ] }] }, FORMATS.OPENAI, "codex", "gpt-6-astra", { "user-agent": "claude-cli/fixture" });
    expect(result.response.status).toBe(400);
    expect(fixture.sent).toEqual([]);
  });

  it("dispatches a supported document instead of returning a text-only CLI warmup response", async () => {
    const result = await dispatch({ messages: [{ role: "user", content: [
      { type: "text", text: "Warmup" }, file(),
    ] }] }, FORMATS.OPENAI, "antigravity", "gemini-3.8-flash-high", { "user-agent": "claude-cli/fixture" });
    expect(result.success).toBe(true);
    await result.response.text();
    expect(fixture.sent).toHaveLength(1);
    expect(fixture.sent[0].request.contents[0].parts.some(part => part.inlineData?.data === PDF)).toBe(true);
  });

  it("does not interpret an image carried in a file block as an unsupported document", async () => {
    const result = await dispatch({ messages: [{ role: "user", content: [{ type: "file", file: {
      filename: "pixel.png", file_data: "data:image/png;base64,iVBORw0KGgo=",
    } }] }] }, FORMATS.OPENAI);
    expect(result.success).toBe(true);
    await result.response.text();
    expect(fixture.sent).toHaveLength(1);
    expect(fixture.sent[0].input[0].content[0]).toMatchObject({ type: "input_image", image_url: "data:image/png;base64,iVBORw0KGgo=" });
  });

  it.each(sources)("rejects an Antigravity Claude PDF from %s instead of sending omitted-file prose", async (format, create) => {
    const result = await dispatch(create(), format, "antigravity", "claude-sonnet-4-6");
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error.code).toBe("unsupported_parameter");
    expect(fixture.sent).toEqual([]);
  });

  it.each([
    { messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "read", content: [document()] }] }] },
    { input: [{ type: "function_call_output", call_id: "read", output: [nativeFile()] }] },
    { input: [{ type: "custom_tool_call_output", call_id: "read", output: [nativeFile()] }] },
    { contents: [{ role: "user", parts: [{ functionResponse: { name: "read", response: { output: [document()] } } }] }] },
    { request: { contents: [{ role: "user", parts: [{ fileData: { mimeType: "application/pdf", fileUri: "https://files.example.invalid/marker.pdf" } }] }] } },
  ])("rejects typed documents nested in protocol/tool containers", async body => {
    const result = await dispatch(body, body.input ? FORMATS.OPENAI_RESPONSES : body.contents ? FORMATS.GEMINI : body.request ? FORMATS.ANTIGRAVITY : FORMATS.CLAUDE);
    expect(result.response.status).toBe(400);
    expect(fixture.sent).toEqual([]);
  });

  it("does not parse ordinary tool JSON as an attachment", async () => {
    const literal = { example: nativeFile() };
    const result = await dispatch({ messages: [
      { role: "assistant", tool_calls: [{ id: "read", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "read", content: JSON.stringify(literal) },
    ] }, FORMATS.OPENAI);
    expect(result.success).toBe(true);
    await result.response.text();
    expect(fixture.sent).toHaveLength(1);
    expect(fixture.sent[0].input.find(item => item.type === "function_call_output").output).toBe(JSON.stringify(literal));
  });

  it("does not parse a nested example record in a native tool result as an attachment", async () => {
    const result = await dispatch({ contents: [{ role: "user", parts: [{ functionResponse: {
      name: "read", response: { example: { output: [document()] }, result: "ordinary data" },
    } }] }] }, FORMATS.GEMINI);
    expect(result.success).toBe(true);
    await result.response.text();
    expect(fixture.sent).toHaveLength(1);
  });

  it.each(["result", "output", "content", "parts"])("preserves ordinary PDF-shaped records inside Gemini Struct %s arrays", async key => {
    const literal = { inlineData: { mimeType: "application/pdf", data: "metadata" }, description: "An example record, not a protocol Part" };
    const body = { contents: [{ role: "user", parts: [{ functionResponse: { name: "read", response: { [key]: [literal] } } }] }] };
    const before = structuredClone(body);
    const result = await dispatch(body, FORMATS.GEMINI);
    expect(result.success).toBe(true);
    await result.response.text();
    expect(body).toEqual(before);
    expect(JSON.stringify(fixture.sent[0])).toContain("An example record, not a protocol Part");
  });

  it("does not let a custom positive capability enable an unsupported native Codex wire", async () => {
    fixture.declared = { pdf: true };
    const caps = withDeclaredCapabilities(getCapabilitiesForModel("codex", "gpt-6-astra"), fixture.declared, "codex", "gpt-6-astra");
    expect(caps.pdf).toBe(false);
    const result = await dispatch(sources[0][1](), FORMATS.OPENAI);
    expect(result.response.status).toBe(400);
    expect(fixture.sent).toHaveLength(0);
  });
});

describe("document metadata and supported serialization", () => {
  it.each(["gpt-6-astra", "gpt-6-astra-review", "gpt-6.1-sol", "codex-auto-review"])("reports the native Codex document limit for %s", model => {
    expect(getCapabilitiesForModel("codex", model).pdf).toBe(false);
    expect(getCapabilitiesForModel("cx", model).pdf).toBe(false);
  });

  it("retains the separate public OpenAI PDF capability", () => {
    expect(getCapabilitiesForModel("openai", "gpt-6-astra").pdf).toBe(true);
  });

  it.each([FORMATS.GEMINI, FORMATS.ANTIGRAVITY])("preserves PDF bytes on supported %s serialization", target => {
    const translated = translateRequest(FORMATS.OPENAI, target, "gemini-3.8-flash-high", sources[0][1](), false, {}, target === FORMATS.ANTIGRAVITY ? "antigravity" : "gemini");
    const request = translated.request || translated;
    expect(request.contents[0].parts.some(part => part.inlineData?.data === PDF)).toBe(true);
    expect(JSON.stringify(request)).not.toContain("file omitted");
  });
});
