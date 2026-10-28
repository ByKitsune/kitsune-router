import { describe, expect, it, vi } from "vitest";
import "../translator/registerAll.js";

const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
  appendProviderChunk() {}, appendConvertedChunk() {}, flush() {},
}) }));

import { GithubExecutor } from "../../open-sse/executors/github.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// 9Router f3e1f716: Copilot's dotted Haiku 5.5 uses adaptive thinking, unlike
// the older generic Haiku budget shape. No live GitHub account is exercised.
describe("GitHub Haiku 5.5 thinking", () => {
  const executor = new GithubExecutor();
  const dispatch = async (model, extra) => {
    io.fetch.mockReset();
    io.fetch.mockResolvedValue(Response.json({ ok: true }));
    return executor.execute({
      model, body: { model, messages: [{ role: "user", content: "offline fixture" }], ...extra },
      stream: false, credentials: { accessToken: "offline-token" },
      log: { debug() {}, info() {}, warn() {} },
    });
  };

  it("selects adaptive thinking only for the observed GitHub model", () => {
    expect(getCapabilitiesForModel("github", "claude-haiku-5.5").thinkingFormat).toBe("claude-adaptive");
    expect(getCapabilitiesForModel("github", "claude-haiku-4.5").thinkingFormat).toBe("claude-budget");
    expect(getCapabilitiesForModel("cline", "claude-haiku-5.5").thinkingFormat).toBe("claude-budget");
  });

  it("sends adaptive thinking and effort through the real Copilot executor", async () => {
    const result = await dispatch("claude-haiku-5.5", { reasoning_effort: "high" });
    expect(result.transformedBody.thinking.type).toBe("adaptive");
    expect(result.transformedBody.output_config.effort).toBe("high");
    expect(result.transformedBody.thinking).not.toHaveProperty("budget_tokens");
  });

  it("keeps native display and effort through Core's Copilot route without mutating the caller", async () => {
    const body = {
      model: "claude-haiku-5.5", max_tokens: 4096, stream: true,
      messages: [{ role: "user", content: "offline fixture" }],
      thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "high" },
    };
    const original = structuredClone(body);
    io.fetch.mockReset();
    io.fetch.mockResolvedValue(new Response(
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_fixture","type":"message","role":"assistant","content":[],"model":"claude-haiku-5.5","usage":{"input_tokens":1,"output_tokens":0}}}\n\n' +
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n' +
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"offline answer"}}\n\n' +
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      { headers: { "content-type": "text/event-stream" } }
    ));
    const result = await handleChatCore({
      body, modelInfo: { provider: "github", model: "claude-haiku-5.5" }, credentials: { accessToken: "offline-token" },
      sourceFormatOverride: FORMATS.CLAUDE, connectionId: "offline-connection",
      clientRawRequest: { endpoint: "/v1/messages", body, headers: {} },
      log: { debug() {}, info() {}, warn() {}, error() {} },
    });
    expect(result.success).toBe(true);
    expect(await result.response.text()).toContain("offline answer");
    expect(io.fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(io.fetch.mock.calls[0][1].body);
    expect(sent.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(sent.output_config.effort).toBe("high");
    expect(body).toEqual(original);
  });

  it("keeps thinking disabled when requested and leaves older Haiku on budgets", async () => {
    const disabled = await dispatch("claude-haiku-5.5", { reasoning_effort: "none" });
    expect(disabled.transformedBody.thinking).toEqual({ type: "disabled" });
    const older = await dispatch("claude-haiku-4.5", { reasoning_effort: "high" });
    expect(older.transformedBody.thinking.type).toBe("enabled");
    expect(older.transformedBody.thinking.budget_tokens).toBeGreaterThan(0);
  });

  it("avoids Copilot's rejected forced choice on dotted Opus 5.5 without changing other routes", async () => {
    const result = await dispatch("claude-opus-5.5", {
      tool_choice: "required",
      tools: [{ type: "function", function: { name: "offline_tool", parameters: { type: "object", properties: {} } } }],
    });
    expect(result.transformedBody.tool_choice).toEqual({ type: "auto" });
    expect(getCapabilitiesForModel("github", "claude-opus-5.5").forcedToolChoice).toBe(false);
    expect(getCapabilitiesForModel("cline", "claude-opus-5.5").forcedToolChoice).not.toBe(false);
  });
});
