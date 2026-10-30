import { beforeEach, describe, expect, it, vi } from "vitest";
import "../translator/registerAll.js";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: vi.fn(async () => undefined) }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { normalizeClaudePassthrough } from "../../open-sse/translator/formats/claude.js";

beforeEach(() => {
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => Response.json({
    id: "msg_haiku_fixture", type: "message", role: "assistant",
    model: "claude-haiku-5-5", content: [{ type: "text", text: "Fixture answer." }],
    stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
  }));
});

async function dispatch(provider, model) {
  const body = {
    model, stream: false, max_tokens: 4096,
    messages: [{ role: "user", content: "Explain the fixture." }],
    thinking: { type: "adaptive", display: "omitted" },
    output_config: { effort: "high", format: { type: "json_schema", schema: { type: "object" } } },
  };
  const original = structuredClone(body);
  const log = { debug: vi.fn(), info() {}, warn() {}, error() {} };
  const result = await handleChatCore({
    body, modelInfo: { provider, model }, sourceFormatOverride: "claude",
    credentials: { apiKey: "sk-anthropic-fixture", providerSpecificData: { baseUrl: "https://fixture.example" } },
    connectionId: "haiku-native-fixture", log,
    clientRawRequest: { endpoint: "/v1/messages", body, headers: { "user-agent": "claude-cli/fixture" } },
  });
  expect(result.success).toBe(true);
  expect(log.debug.mock.calls.some(([category]) => category === "PASSTHROUGH")).toBe(true);
  expect(body).toEqual(original);
  expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  await result.response.text();
  return JSON.parse(proxyAwareFetch.mock.calls[0][1].body);
}

// Adapted from 9Router 0ad0a722 / #5183. Native API metadata verifies this
// exact provider/model pair; its name does not grant the same wire contract to
// OAuth products, arbitrary resellers, or hypothetical future Haiku versions.
describe("reviewed Haiku adaptive thinking on native Claude client requests", () => {
  it.each(["claude-haiku-5-5", "claude-haiku-5.5"])("preserves adaptive thinking and effort for Anthropic %s", async model => {
    const wire = await dispatch("anthropic", model);
    expect(wire.thinking).toEqual({ type: "adaptive", display: "omitted" });
    expect(wire.output_config).toEqual({ effort: "high", format: { type: "json_schema", schema: { type: "object" } } });
    expect(wire.max_tokens).toBe(4096);
  });

  it("retains the bounded manual downgrade for legacy Haiku", async () => {
    const wire = await dispatch("anthropic", "claude-haiku-4-5");
    expect(wire.thinking).toEqual({ type: "enabled", display: "omitted", budget_tokens: 3072 });
    expect(wire.output_config).toEqual({ format: { type: "json_schema", schema: { type: "object" } } });
    expect(wire.max_tokens).toBe(4096);
  });

  it("does not infer the Anthropic contract for a custom compatible endpoint", async () => {
    const wire = await dispatch("anthropic-compatible-fixture", "claude-haiku-5-5");
    expect(wire.thinking.type).toBe("enabled");
    expect(wire.thinking.budget_tokens).toBeLessThan(wire.max_tokens);
    expect(wire.output_config).not.toHaveProperty("effort");
  });

  it.each(["claude-haiku-6-0", "haiku"])("keeps the previous compatibility behavior for unverified %s", model => {
    const wire = normalizeClaudePassthrough({ thinking: { type: "adaptive" }, output_config: { effort: "high" } }, model, null, "anthropic");
    expect(wire.thinking).toEqual({ type: "enabled", budget_tokens: 10000 });
    expect(wire).not.toHaveProperty("output_config");
  });
});
