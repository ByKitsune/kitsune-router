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
  wire.requests.push(JSON.parse(init.body));
  return Response.json({ id: "msg_vendor_fixture", type: "message", role: "assistant", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
} }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { normalizeClaudePassthrough } from "../../open-sse/translator/formats/claude.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const model = "claude-sonnet-4-6";
const signedThinking = [
  { type: "thinking", thinking: "original vendor reasoning", signature: "vendor:v2/opaque-signature+=" },
  { type: "redacted_thinking", data: "original vendor redaction/+=" },
];
const unsignedThinking = [{ type: "thinking", thinking: "original unsigned vendor reasoning" }];

function history(thinking) {
  return {
    model, stream: false, max_tokens: 2048, thinking: { type: "enabled", budget_tokens: 1024 },
    metadata: { user_id: "caller-owned-attribution" },
    messages: [
      { role: "assistant", content: [...structuredClone(thinking), { type: "tool_use", id: "toolu_vendor", name: "lookup", input: { query: "fixture" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_vendor", content: "fixture-result" }] },
    ],
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

beforeEach(() => { wire.requests.length = 0; });

describe("Claude-native vendor thinking ownership", () => {
  it.each(["anthropic-compatible-vendor", "deepseek", "opencode-go"])("preserves %s opaque thinking and redaction without applying Anthropic signature syntax", provider => {
    const sent = normalizeClaudePassthrough(history(signedThinking), model, null, provider);
    expect(sent.messages[0].content.slice(0, signedThinking.length)).toEqual(signedThinking);
  });

  it("preserves DeepSeek unsigned reasoning instead of replacing it with a placeholder", () => {
    const sent = normalizeClaudePassthrough(history(unsignedThinking), "deepseek-v4-pro", null, "deepseek");
    expect(sent.messages[0].content[0]).toEqual(unsignedThinking[0]);
  });

  it.each([{ thinking: signedThinking }, { thinking: unsignedThinking }])("keeps the same vendor thinking on native and generic Messages dispatch without mutating borrowed history: $thinking", async ({ thinking }) => {
    const source = deepFreeze(history(thinking));
    const before = structuredClone(source);
    for (const headers of [{ "user-agent": "claude-cli/fixture" }, {}]) {
      const outcome = await handleChatCore({
        body: source, sourceFormatOverride: FORMATS.CLAUDE,
        modelInfo: { provider: "anthropic-compatible-vendor", model },
        credentials: { apiKey: "synthetic-vendor-key", providerSpecificData: { baseUrl: "https://vendor.example/v1" } },
        clientRawRequest: { headers }, log: { debug() {}, info() {}, warn() {} },
      });
      expect(outcome.success).toBe(true);
      await outcome.response.text();
      expect(wire.requests.at(-1).messages[0].content.slice(0, thinking.length)).toEqual(thinking);
      expect(wire.requests.at(-1).metadata).toEqual(source.metadata);
      expect(source).toEqual(before);
    }
    expect(wire.requests).toHaveLength(2);
  });
});
