import { describe, expect, it, vi } from "vitest";
const persisted = vi.hoisted(() => []);
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async (record) => { persisted.push(record); return { accepted: true, eventId: record.eventId }; }),
}));
import { canonicalizeUsage, filterUsageForFormat, normalizeUsage } from "../../open-sse/utils/usageTracking.js";
import { toOpenAIUsage } from "../../open-sse/translator/concerns/usage.js";
import { claudeToOpenAIResponse } from "../../open-sse/translator/response/claude-to-openai.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { handleNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";

const nativeUsage = () => ({
  input_tokens: 100, output_tokens: 5, cache_read_input_tokens: 200,
  cache_creation_input_tokens: 50,
  cache_creation: { ephemeral_5m_input_tokens: 30, ephemeral_1h_input_tokens: 20 },
});
const expected = {
  prompt_tokens: 350, completion_tokens: 5, total_tokens: 355, cached_tokens: 200,
  cache_creation_input_tokens: 50, cache_creation_5m_tokens: 30, cache_creation_1h_tokens: 20,
};

describe("cache-write TTLs survive real usage normalization paths", () => {
  it("bills a native JSON completion using inclusive input and both TTLs, like its streaming counterpart", async () => {
    const model = "claude-sonnet-5-5";
    const result = await handleNonStreamingResponse({
      providerResponse: Response.json({ id: "msg_ttl", type: "message", role: "assistant", model,
        content: [{ type: "text", text: "Measured result" }], stop_reason: "end_turn", usage: nativeUsage() }),
      provider: "anthropic", model, sourceFormat: FORMATS.OPENAI, targetFormat: FORMATS.CLAUDE,
      body: { model, messages: [{ role: "user", content: "Measure this completion" }] }, stream: false,
      translatedBody: {}, finalBody: {}, requestStartTime: Date.now(), connectionId: "ttl-fixture",
      apiKey: "synthetic-ttl-key", clientRawRequest: { endpoint: "/v1/chat/completions" },
      reqLogger: { logProviderResponse() {}, logConvertedResponse() {} }, trackDone() {}, appendLog() {},
    });
    expect(result.success).toBe(true);
    expect((await result.response.json()).usage).toMatchObject({ prompt_tokens: 350, completion_tokens: 5 });
    expect(persisted[0].tokens).toMatchObject(expected);
    expect(calculateCostFromTokens(persisted[0].tokens, getPricingForModel("anthropic", model))).toBeCloseTo(0.000425, 12);
  });

  it("folds native exclusive input once while retaining both TTL subsets", () => {
    const canonical = canonicalizeUsage(normalizeUsage(nativeUsage()));
    expect(canonical).toMatchObject(expected);
    expect(canonicalizeUsage(canonical)).toMatchObject(expected);
  });

  it("derives missing aggregate creation from the two native TTL counters", () => {
    const raw = nativeUsage();
    delete raw.cache_creation_input_tokens;
    expect(canonicalizeUsage(normalizeUsage(raw))).toMatchObject(expected);
  });

  it("preserves TTLs through the Claude-to-Chat usage bridge without refolding inclusive input", () => {
    const chat = toOpenAIUsage(nativeUsage(), "claude");
    expect(chat).toMatchObject({ prompt_tokens: 350, completion_tokens: 5, prompt_tokens_details: {
      cached_tokens: 200, cache_creation_tokens: 50, cache_creation_5m_tokens: 30, cache_creation_1h_tokens: 20,
    } });
    expect(canonicalizeUsage(normalizeUsage(chat))).toMatchObject(expected);
  });

  it("keeps provider-native TTL usage readable by a native Messages client", () => {
    expect(filterUsageForFormat(nativeUsage(), FORMATS.CLAUDE)).toMatchObject(nativeUsage());
  });

  it("keeps the TTL split when a stream ends with output-only usage", () => {
    const state = {};
    claudeToOpenAIResponse({ type: "message_start", message: { id: "ttl_fixture", model: "claude-sonnet-5-5", usage: { ...nativeUsage(), output_tokens: 0 } } }, state);
    const chunks = claudeToOpenAIResponse({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }, state);
    expect(chunks.at(-1).usage.prompt_tokens_details).toMatchObject({ cache_creation_tokens: 50, cache_creation_5m_tokens: 30, cache_creation_1h_tokens: 20 });
    expect(canonicalizeUsage(state.usage)).toMatchObject(expected);
  });

  it("does not erase one-hour history when a later native usage delta only repeats the other TTL", () => {
    const state = {};
    claudeToOpenAIResponse({ type: "message_start", message: { id: "ttl_fixture", model: "claude-sonnet-5-5", usage: { ...nativeUsage(), output_tokens: 0 } } }, state);
    const chunks = claudeToOpenAIResponse({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: 30 } } }, state);
    expect(chunks.at(-1).usage.prompt_tokens_details).toMatchObject({ cache_creation_5m_tokens: 30, cache_creation_1h_tokens: 20 });
    expect(canonicalizeUsage(state.usage)).toMatchObject(expected);
  });
});
