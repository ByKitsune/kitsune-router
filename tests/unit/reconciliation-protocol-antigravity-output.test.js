import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ requests: [] }));
vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {}, saveRequestUsage: async () => {} }));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("../../open-sse/utils/proxyFetch.js", async original => ({ ...await original(), proxyAwareFetch: async (_url, init) => {
  transport.requests.push(JSON.parse(init.body));
  return Response.json({ error: { code: 400, message: "fixture captured", status: "INVALID_ARGUMENT" } }, { status: 400 });
} }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

beforeEach(() => { transport.requests = []; });
const dispatch = (body, source = FORMATS.OPENAI, model = "gemini-3.8-flash", native = false) => handleChatCore({
  body: { ...body, stream: false }, modelInfo: { provider: "antigravity", model },
  credentials: { accessToken: "synthetic-output-fixture", projectId: "synthetic-output-project" },
  sourceFormatOverride: source, clientRawRequest: { headers: native ? { "user-agent": "antigravity/fixture" } : {} },
  log: { debug() {}, info() {}, warn() {} },
});
const schema = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] };

describe("Antigravity structured output on public dispatch", () => {
  it("serializes supported constraints in typed generationConfig rather than prompt prose", async () => {
    await dispatch({ messages: [{ role: "system", content: "Answer honestly." }, { role: "user", content: "hi" }], response_format: { type: "json_schema", json_schema: { name: "answer", schema } } });
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0].request.generationConfig).toMatchObject({ responseMimeType: "application/json", responseSchema: schema });
    expect(transport.requests[0].request.systemInstruction.parts.map(part => part.text)).toEqual(["Answer honestly."]);
  });

  it.each([FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, FORMATS.CLAUDE])("rejects unsupported %s output constraints with diagnostics and no generation call", async source => {
    const unsupported = { ...schema, additionalProperties: false };
    const body = source === FORMATS.CLAUDE
      ? { messages: [{ role: "user", content: "hi" }], output_config: { format: { type: "json_schema", schema: unsupported } } }
      : source === FORMATS.OPENAI_RESPONSES
        ? { input: "hi", text: { format: { type: "json_schema", name: "answer", schema: unsupported } } }
        : { messages: [{ role: "user", content: "hi" }], response_format: { type: "json_schema", json_schema: { name: "answer", schema: unsupported } } };
    const result = await dispatch(body, source);
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toMatchObject({ code: "unsupported_parameter", param: source === FORMATS.CLAUDE ? "output_config.format" : source === FORMATS.OPENAI_RESPONSES ? "text.format" : "response_format" });
    expect(transport.requests).toHaveLength(0);
  });

  it.each([false, true])("rejects native Claude-backend output intent even when passthrough=%s", async native => {
    const result = await dispatch({ request: { contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } } }, FORMATS.ANTIGRAVITY, "claude-sonnet-4-6", native);
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "request.generationConfig.responseSchema" });
    expect(transport.requests).toHaveLength(0);
  });

  it("rejects a Chat-only output field on native passthrough instead of validating it and then dropping it", async () => {
    const result = await dispatch({ request: { contents: [{ role: "user", parts: [{ text: "hi" }] }] }, response_format: { type: "json_schema", json_schema: { schema } } }, FORMATS.ANTIGRAVITY, "gemini-3.8-flash", true);
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "response_format" });
    expect(transport.requests).toHaveLength(0);
  });
});
