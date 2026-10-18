import { beforeEach, describe, expect, it, vi } from "vitest";
import "../translator/registerAll.js";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
}));
import { saveRequestDetail, saveRequestUsage } from "@/lib/usageDb.js";
import { handleNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { handleForcedSSEToJson } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { buildOnStreamComplete } from "../../open-sse/handlers/chatCore/streamingHandler.js";
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { calculateCostBreakdown, MODEL_PRICING } from "../../open-sse/providers/pricing.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

beforeEach(() => vi.clearAllMocks());
const logger = { logProviderResponse() {}, logConvertedResponse() {} };
const tokens = { input_tokens: 20, output_tokens: 5, total_tokens: 25 };
const reply = actual => ({
  id: "resp_fixture", object: "response", model: "gpt-6.1-sol", status: "completed",
  ...(actual == null ? {} : { service_tier: actual }), usage: tokens,
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
});
const sse = events => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("");
function context(requested, sourceFormat = "openai") {
  return {
    provider: "openai", model: "gpt-6.1-sol", sourceFormat, targetFormat: "openai-responses",
    body: { model: "gpt-6.1-sol", ...(requested == null ? {} : { service_tier: requested }) },
    serviceTier: { requestedServiceTier: requested ?? null, wireServiceTier: requested ?? null },
    stream: false, requestStartTime: Date.now(), connectionId: "offline-speed",
    trackDone() {}, appendLog() {}, reqLogger: logger,
  };
}

describe("requested versus delivered processing speed", () => {
  it.each([
    ["fast", "default", true], ["fast", "priority", false], ["ultrafast", "ultrafast", false],
    ["fast", null, false], ["auto", null, false], [null, "fast", false],
    [null, null, true], ["default", null, true],
  ])("accounts for request %s / actual %s without assuming Standard", async (requested, actual, standardCost) => {
    const result = await handleNonStreamingResponse({ ...context(requested), providerResponse: Response.json(reply(actual)) });
    expect(result.success).toBe(true);
    const row = saveRequestUsage.mock.calls[0][0];
    expect(row.tokens).toMatchObject({ requestedServiceTier: requested, actualServiceTier: actual });
    expect(saveRequestDetail.mock.calls.at(-1)[0]).toMatchObject({ requestedServiceTier: requested, actualServiceTier: actual });
    const cost = calculateCostBreakdown(row.tokens, MODEL_PRICING["gpt-6.1-sol"]).totalCost;
    if (standardCost) expect(cost).toBeCloseTo(0.00009, 10);
    else expect(cost).toBeNull();
    const body = await result.response.json();
    if (actual == null) expect(body).not.toHaveProperty("service_tier");
    else expect(body.service_tier).toBe(actual);
  });

  it("preserves actual tier in forced Responses-SSE to Chat JSON and usage", async () => {
    const providerResponse = new Response(sse([{ type: "response.completed", response: reply("default") }]), { headers: { "content-type": "text/event-stream" } });
    const result = await handleForcedSSEToJson({ ...context("fast"), providerResponse });
    expect((await result.response.json()).service_tier).toBe("default");
    expect(saveRequestUsage.mock.calls[0][0].tokens).toMatchObject({ requestedServiceTier: "fast", actualServiceTier: "default" });
    expect(saveRequestDetail.mock.calls.at(-1)[0]).toMatchObject({ requestedServiceTier: "fast", actualServiceTier: "default" });
  });

  it.each(["openai", "openai-responses"])("tracks actual tier in streamed %s output independently of requested Fast", async sourceFormat => {
    const { onStreamComplete } = buildOnStreamComplete({ ...context("fast", sourceFormat), stream: true });
    const transform = createSSEStream({ provider: "openai", model: "gpt-6.1-sol", sourceFormat, targetFormat: "openai-responses", onStreamComplete });
    const events = [
      { type: "response.created", response: { id: "resp_fixture", service_tier: "default" } },
      { type: "response.output_text.delta", delta: "ok" },
      { type: "response.completed", response: reply("default") },
    ];
    const wire = await new Response(new Response(sse(events)).body.pipeThrough(transform)).text();
    expect(wire).toContain('"service_tier":"default"');
    expect(saveRequestUsage.mock.calls[0][0].tokens).toMatchObject({ requestedServiceTier: "fast", actualServiceTier: "default" });
    expect(saveRequestDetail.mock.calls.at(-1)[0]).toMatchObject({ requestedServiceTier: "fast", actualServiceTier: "default" });
  });

  it("retains a Chat provider's actual tier on Responses SSE translation", async () => {
    const { onStreamComplete } = buildOnStreamComplete({ ...context("fast", "openai-responses"), targetFormat: "openai", stream: true });
    const transform = createSSEStream({ provider: "openai", model: "gpt-6.1-sol", sourceFormat: "openai-responses", targetFormat: "openai", onStreamComplete });
    const events = [
      { id: "chat_fixture", choices: [{ delta: { content: "ok" }, finish_reason: null }] },
      { id: "chat_fixture", choices: [{ delta: {}, finish_reason: "stop" }] },
      { id: "chat_fixture", service_tier: "priority", choices: [], usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 } },
    ];
    const wire = await new Response(new Response(sse(events)).body.pipeThrough(transform)).text();
    expect(wire).toContain('"service_tier":"priority"');
    expect(saveRequestUsage.mock.calls[0][0].tokens).toMatchObject({ requestedServiceTier: "fast", actualServiceTier: "priority" });
    expect(calculateCostBreakdown(saveRequestUsage.mock.calls[0][0].tokens, MODEL_PRICING["gpt-6.1-sol"]).totalCost).toBeNull();
  });

  it("keeps delivered speed unknown when an Ultrafast stream never confirms it", async () => {
    const { onStreamComplete } = buildOnStreamComplete({ ...context("ultrafast"), stream: true });
    const transform = createSSEStream({ provider: "openai", model: "gpt-6.1-sol", targetFormat: "openai-responses", sourceFormat: "openai", onStreamComplete });
    const wire = await new Response(new Response(sse([{ type: "response.completed", response: reply(null) }])).body.pipeThrough(transform)).text();
    expect(wire).not.toContain('"service_tier":"ultrafast"');
    expect(saveRequestUsage.mock.calls[0][0].tokens).toMatchObject({ requestedServiceTier: "ultrafast", actualServiceTier: null });
    expect(calculateCostBreakdown(saveRequestUsage.mock.calls[0][0].tokens, MODEL_PRICING["gpt-6.1-sol"]).totalCost).toBeNull();
  });

  it("marks implicit Codex premium defaults unconfirmed when the response has no tier", async () => {
    const ctx = context(null);
    ctx.provider = "codex";
    ctx.serviceTier.wireServiceTier = "ultrafast";
    await handleNonStreamingResponse({ ...ctx, providerResponse: Response.json(reply(null)) });
    const row = saveRequestUsage.mock.calls[0][0];
    expect(row.tokens).toMatchObject({ requestedServiceTier: null, actualServiceTier: null });
    expect(calculateCostBreakdown(row.tokens, MODEL_PRICING["gpt-6.1-sol"]).totalCost).toBeNull();
  });

  it("treats explicit native null as unconfirmed Auto rather than a Standard cost guarantee", async () => {
    const ctx = context(null);
    ctx.body.service_tier = null;
    ctx.serviceTier.selection = null;
    await handleNonStreamingResponse({ ...ctx, providerResponse: Response.json(reply(null)) });
    const row = saveRequestUsage.mock.calls[0][0];
    expect(row.tokens).toMatchObject({ requestedServiceTier: null, actualServiceTier: null });
    expect(calculateCostBreakdown(row.tokens, MODEL_PRICING["gpt-6.1-sol"]).totalCost).toBeNull();
  });
});

describe("executor boundary tier validation", () => {
  it("does not permit direct executors to send Ultrafast to Chat Completions", () => {
    const executor = new DefaultExecutor("openai");
    expect(() => executor.transformRequest("gpt-6-astra", { model: "gpt-6-astra", messages: [], service_tier: "ultrafast" }, true, {})).toThrow(/Responses/);
  });
  it("rejects direct executor typos rather than leaking an invalid paid request", () => {
    const executor = new DefaultExecutor("openai");
    expect(() => executor.transformRequest("gpt-6.1-sol", { input: "hi", service_tier: "turbo" }, true, {})).toThrow(/Invalid service_tier/);
  });
});
