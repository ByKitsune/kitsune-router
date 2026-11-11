import { beforeEach, describe, expect, it, vi } from "vitest";

const wire = vi.hoisted(() => ({ requests: [] }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {},
  saveRequestDetail: async () => {}, saveRequestUsage: async () => {},
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("../../open-sse/utils/proxyFetch.js", async original => ({ ...await original(), proxyAwareFetch: async (_url, init) => {
  const request = JSON.parse(init.body);
  wire.requests.push(request);
  const declared = new Set(request.tools.map(tool => tool.name));
  const references = request.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .filter(block => block.type === "tool_result" && Array.isArray(block.content))
    .flatMap(block => block.content).filter(block => block.type === "tool_reference");
  if (references.some(block => !declared.has(block.tool_name))) {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: "Tool reference is not declared" } }, { status: 400 });
  }
  return Response.json({ id: "msg_reference_fixture", type: "message", role: "assistant", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
} }));

import { dedupeTools } from "../../open-sse/utils/toolDeduper.js";
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const tool = name => ({ name, description: name, input_schema: { type: "object", properties: {} } });
const tools = () => [tool("mcp__exa__web_search_exa"), tool("WebSearch"), tool("WebFetch")];
const reference = name => ({ type: "tool_reference", tool_name: name });
const result = content => ({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_search", content }] });
const names = value => value.tools.map(item => item.name || item.function.name);
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

beforeEach(() => { wire.requests.length = 0; });

describe("MCP-equivalent dedup preserves replay and explicit selection", () => {
  it.each([
    ["no MCP trigger", [tool("lookup"), tool("WebSearch")]],
    ["no equivalent declaration", [tool("mcp__exa__web_search_exa"), tool("lookup")]],
  ])("does not inspect conversation history with %s", (_name, declarations) => {
    const history = vi.fn(() => [result([reference("WebSearch")])]);
    const out = dedupeTools(declarations, { clientTool: "claude", get messages() { return history(); } });
    expect(out.tools).toBe(declarations);
    expect(history).not.toHaveBeenCalled();
  });

  it("inspects history only once when multiple MCP rules have removable declarations", () => {
    const history = vi.fn(() => [result([reference("WebSearch")])]);
    const out = dedupeTools([...tools(), tool("mcp__tavily__tavily_search")], {
      clientTool: "claude", get messages() { return history(); },
    });
    expect(names(out)).toEqual(["mcp__exa__web_search_exa", "WebSearch", "mcp__tavily__tavily_search"]);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it("retains a deferred tool reference without changing signed or borrowed history", () => {
    const messages = freeze([
      { role: "assistant", content: [
        { type: "thinking", thinking: "", signature: "synthetic-original-signature" },
        { type: "redacted_thinking", data: "synthetic-original-redaction" },
        { type: "tool_use", id: "toolu_search", name: "mcp__exa__web_search_exa", input: {} },
      ] },
      result([reference("WebSearch")]),
    ]);
    const before = structuredClone(messages);
    const declarations = freeze(tools());
    const out = dedupeTools(declarations, { clientTool: "claude", messages });
    expect(names(out)).toEqual(["mcp__exa__web_search_exa", "WebSearch"]);
    expect(out.stripped).toEqual(["WebFetch"]);
    expect(messages).toEqual(before);
    expect(declarations).toHaveLength(3);
  });

  it.each([
    { type: "tool", name: "WebFetch" },
    { type: "function", function: { name: "WebFetch" } },
    { type: "function", name: "WebFetch" },
  ])("retains the explicitly selected tool for $type choice", toolChoice => {
    const out = dedupeTools(tools(), { clientTool: "claude", toolChoice });
    expect(names(out)).toEqual(["mcp__exa__web_search_exa", "WebFetch"]);
    expect(out.stripped).toEqual(["WebSearch"]);
  });

  it("retains references returned by native server tool search", () => {
    const messages = [{ role: "assistant", content: [{
      type: "tool_search_tool_result", tool_use_id: "srvtoolu_search",
      content: { type: "tool_search_tool_search_result", tool_references: [reference("WebFetch")] },
    }] }];
    const before = structuredClone(messages);
    expect(names(dedupeTools(tools(), { clientTool: "claude", messages }))).toEqual(["mcp__exa__web_search_exa", "WebFetch"]);
    expect(messages).toEqual(before);
  });

  it.each([
    { role: "assistant", content: [{ type: "tool_use", id: "toolu_old", name: "WebSearch", input: {} }] },
    { role: "assistant", content: null, tool_calls: [{ type: "function", id: "call_old", function: { name: "WebSearch", arguments: "{}" } }] },
  ])("retains a declaration used by an earlier $role turn", message => {
    expect(names(dedupeTools(tools(), { clientTool: "claude", messages: [message] }))).toEqual(["mcp__exa__web_search_exa", "WebSearch"]);
  });

  it("does not interpret reference-shaped application data as protocol references", () => {
    const messages = [
      { role: "assistant", content: [{ type: "tool_use", name: "mcp__exa__web_search_exa", input: { payload: reference("WebSearch") } }] },
      result([{ type: "text", text: JSON.stringify(reference("WebFetch")), payload: reference("WebSearch") }]),
      { role: "user", content: [reference("WebSearch")] },
    ];
    const out = dedupeTools(tools(), { clientTool: "claude", messages, toolChoice: { type: "auto", name: "WebFetch" } });
    expect(names(out)).toEqual(["mcp__exa__web_search_exa"]);
  });

  it("preserves a referenced regex-matched connector while stripping other equivalent connectors", () => {
    const out = dedupeTools([
      tool("mcp__browsermcp__navigate"), tool("mcp__Claude_in_Chrome__navigate"), tool("mcp__Claude_in_Chrome__click"),
    ], { clientTool: "claude", messages: [result([reference("mcp__Claude_in_Chrome__navigate")])] });
    expect(names(out)).toEqual(["mcp__browsermcp__navigate", "mcp__Claude_in_Chrome__navigate"]);
    expect(out.stripped).toEqual(["mcp__Claude_in_Chrome__click"]);
  });

  it("still removes DeepSeek duplicate definitions when a referenced name survives", () => {
    const out = dedupeTools([...tools(), tool("WebSearch")], {
      clientTool: "claude", model: "deepseek-v4-flash", messages: [result([reference("WebSearch")])],
    });
    expect(names(out)).toEqual(["mcp__exa__web_search_exa", "WebSearch"]);
    expect(out.stripped.sort()).toEqual(["WebFetch", "WebSearch"]);
  });

  it("supplies replay dependencies to dedup before serializing a native Messages request", async () => {
    const body = freeze({ model: "claude-sonnet-4-6", stream: false, max_tokens: 512, tools: tools(), messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "toolu_search", name: "mcp__exa__web_search_exa", input: {} }] },
      result([reference("WebSearch")]),
    ] });
    const before = structuredClone(body);
    const outcome = await handleChatCore({
      body, sourceFormatOverride: FORMATS.CLAUDE,
      modelInfo: { provider: "anthropic-compatible-vendor", model: body.model },
      credentials: { apiKey: "synthetic-vendor-key", providerSpecificData: { baseUrl: "https://vendor.example/v1" } },
      clientRawRequest: { headers: { "user-agent": "claude-cli/fixture" } },
      log: { debug() {}, info() {}, warn() {}, error() {} },
    });
    expect(outcome.success).toBe(true);
    await outcome.response.text();
    expect(wire.requests).toHaveLength(1);
    expect(wire.requests[0].tools.map(item => item.name)).toContain("WebSearch");
    expect(wire.requests[0].messages).toMatchObject(body.messages);
    expect(wire.requests[0].messages[1].content[0].content).toEqual(body.messages[1].content[0].content);
    expect(body).toEqual(before);
  });
});
