import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ requests: [] }));
vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {}, saveRequestUsage: async () => {} }));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("../../open-sse/utils/proxyFetch.js", async original => ({ ...await original(), proxyAwareFetch: async (url, init) => {
  transport.requests.push({ url, body: JSON.parse(init.body) });
  return Response.json({ type: "error", error: { type: "invalid_request_error", message: "fixture captured" } }, { status: 400 });
} }));
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const addition = extra => ({ type: "tool_addition", tool: { type: "tool_definition", definition: {
  name: "mcp_capture", input_schema: { type: "object", properties: {} }, ...extra,
} } });
beforeEach(() => { transport.requests = []; });
const dispatch = body => handleChatCore({ body: { ...body, stream: false }, modelInfo: { provider: "kimi", model: "k3" },
  sourceFormatOverride: FORMATS.CLAUDE, credentials: { apiKey: "synthetic-kimi-fixture" }, log: { debug() {}, info() {}, warn() {} },
});

describe("Kimi deferred tools on public Messages dispatch", () => {
  it("sends a real tool declaration instead of a beta-only content block on the selected Messages transport", async () => {
    const body = { max_tokens: 37, messages: [
      { role: "system", content: [addition()] },
      { role: "user", content: [{ type: "text", text: "Capture." }, { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } }] },
    ] };
    const before = structuredClone(body);
    await dispatch(body);
    expect(transport.requests).toHaveLength(1);
    const request = transport.requests[0];
    expect(new URL(request.url).pathname).toContain("/messages");
    expect(request.body.tools.map(tool => tool.name)).toEqual(["mcp_capture"]);
    expect(JSON.stringify(request.body.messages)).not.toContain("tool_addition");
    expect(request.body.messages[0].content.find(block => block.type === "image").source.data).toBe("iVBORw0KGgo=");
    expect(request.body.max_tokens).toBe(37);
    expect(body).toEqual(before);
  });

  it("rejects malformed additions before upstream dispatch without deleting the original definition", async () => {
    const body = { max_tokens: 37, messages: [{ role: "user", content: [addition({ input_schema: [] }), { type: "text", text: "Capture." }] }] };
    const before = structuredClone(body);
    const result = await dispatch(body);
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.0.content.0" });
    expect(transport.requests).toHaveLength(0);
    expect(body).toEqual(before);
  });
});
