import { beforeEach, describe, expect, it, vi } from "vitest";
import "../translator/registerAll.js";

// Keep core, translators and final executor serialization real; stop at HTTP.
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: vi.fn(async () => undefined) }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
  logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
}) }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const reply = { candidates: [{ content: { role: "model", parts: [{ text: "Synthetic reply." }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } };

beforeEach(() => {
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async url => Response.json(String(url).includes("anthropic.com")
    ? { id: "msg_fixture", type: "message", role: "assistant", model: "claude-opus-4-7", content: [{ type: "text", text: "Synthetic reply." }],
      stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }
    : { response: reply }));
});

async function dispatch(provider, model, body, userAgent, providerThinking) {
  const input = { model, stream: false, ...body };
  const before = structuredClone(input);
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const result = await handleChatCore({
    body: input, modelInfo: { provider, model }, sourceFormatOverride: provider,
    credentials: { accessToken: "synthetic-thinking-token", projectId: "synthetic-thinking-project" },
    connectionId: "synthetic-thinking-connection", log, providerThinking,
    clientRawRequest: { headers: { "user-agent": userAgent }, body: input, endpoint: "/fixture" },
  });
  expect(result.success).toBe(true);
  expect(log.debug.mock.calls.some(([category]) => category === "PASSTHROUGH")).toBe(true);
  expect(input).toEqual(before);
  expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  return JSON.parse(proxyAwareFetch.mock.calls[0][1].body);
}

describe("native passthrough suffix choices reach the provider payload", () => {
  it("delivers an injected provider effort default in native Claude fields", async () => {
    const wire = await dispatch("claude", "claude-opus-4.7", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 4096,
    }, "claude-cli/fixture", { mode: "high" });
    expect(wire.output_config?.effort).toBe("high");
    expect(wire.thinking?.type).toBe("adaptive");
    expect(wire).not.toHaveProperty("reasoning_effort");
    expect(wire.max_tokens).toBe(4096);
  });

  it("fits a generated provider-on budget inside a native Claude client's cap", async () => {
    const wire = await dispatch("claude", "claude-sonnet-4.5", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 4096,
    }, "claude-cli/fixture", { mode: "on" });
    expect(wire.max_tokens).toBe(4096);
    expect(wire.thinking.type).toBe("enabled");
    expect(wire.thinking.budget_tokens).toBeGreaterThanOrEqual(1024);
    expect(wire.thinking.budget_tokens).toBeLessThan(4096);
    expect(wire).not.toHaveProperty("reasoning_effort");
  });

  it("does not treat an explicit numeric budget as a provider-on default", async () => {
    const body = { model: "claude-sonnet-4.5", stream: false,
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 4096,
      thinking: { type: "enabled", budget_tokens: 10000 } };
    const before = structuredClone(body);
    const result = await handleChatCore({
      body, modelInfo: { provider: "claude", model: "claude-sonnet-4.5" }, sourceFormatOverride: "claude",
      credentials: { accessToken: "synthetic-thinking-token" }, providerThinking: { mode: "on" },
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
      clientRawRequest: { headers: { "user-agent": "claude-cli/fixture" }, body, endpoint: "/v1/messages" },
    });
    expect(result.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ error: { code: "invalid_thinking_budget", param: "max_tokens" } });
    expect(proxyAwareFetch).not.toHaveBeenCalled();
    expect(body).toEqual(before);
  });

  it("keeps a native off switch above the configured provider effort default", async () => {
    const wire = await dispatch("claude", "claude-opus-4.7", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 4096,
      thinking: { type: "disabled" },
    }, "claude-cli/fixture", { mode: "high" });
    expect(wire.thinking).toEqual({ type: "disabled" });
    expect(wire).not.toHaveProperty("reasoning_effort");
    expect(wire.max_tokens).toBe(4096);
  });

  it.each([["low", "low"], ["ultra", "max"]])("applies Claude %s over native high effort while retaining display and format", async (suffix, effort) => {
    const format = { type: "json_schema", schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } };
    const wire = await dispatch("claude", `claude-opus-4.7(${suffix})`, {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 4096,
      thinking: { type: "adaptive", display: "omitted" }, output_config: { effort: "high", format },
    }, "claude-cli/fixture");
    // Dot spelling is an accepted client compatibility input. The registry now
    // knows the documented native API ID and must serialize its dash spelling.
    expect(wire.model).toBe("claude-opus-4-7");
    expect(wire.output_config).toEqual({ effort, format });
    expect(wire.thinking).toEqual({ type: "adaptive", display: "omitted" });
    expect(wire.max_tokens).toBe(4096);
  });

  it("applies a zero-budget suffix to native Claude thinking", async () => {
    const wire = await dispatch("claude", "claude-opus-4.7(0)", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 4096,
      thinking: { type: "adaptive" },
    }, "claude-cli/fixture");
    expect(wire.thinking).toEqual({ type: "disabled" });
    expect(wire.max_tokens).toBe(4096);
  });

  it("applies a Gemini CLI suffix over an existing native thinking level", async () => {
    const wire = await dispatch("gemini-cli", "gemini-3.8-flash(low)", {
      request: { contents: [{ role: "user", parts: [{ text: "Explain the result." }] }],
        generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "high", includeThoughts: false } } },
    }, "gemini-cli/fixture");
    expect(wire.model).toBe("gemini-3.8-flash");
    expect(wire.request.generationConfig).toEqual({ maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "low", includeThoughts: false } });
  });

  it("preserves a declared Antigravity tier with a matching native thinking level", async () => {
    const wire = await dispatch("antigravity", "gemini-3.8-flash-high", {
      userAgent: "antigravity",
      request: { contents: [{ role: "user", parts: [{ text: "Explain the result." }] }],
        generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "high", includeThoughts: false } } },
    }, "antigravity/fixture");
    expect(wire.model).toBe("gemini-3.8-flash-high");
    expect(wire.request.generationConfig).toEqual({ maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "high", includeThoughts: false } });
  });

  it("preserves native Claude manual mode and independent effort when no suffix was requested", async () => {
    const wire = await dispatch("claude", "claude-sonnet-4.6", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 4096,
      thinking: { type: "enabled", budget_tokens: 2048, display: "omitted" }, output_config: { effort: "low" },
    }, "claude-cli/fixture");
    expect(wire.thinking).toEqual({ type: "enabled", budget_tokens: 2048, display: "omitted" });
    expect(wire.output_config.effort).toBe("low");
    expect(wire.max_tokens).toBe(4096);
  });
});
