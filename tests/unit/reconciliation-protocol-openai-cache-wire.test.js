import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {}, saveRequestUsage: async () => {} }));
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { normalizeUsage, canonicalizeUsage } from "../../open-sse/utils/usageTracking.js";
import { calculateCostBreakdown, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const details = { cached_tokens: 20000, cache_write_tokens: 30000, cache_write_tokens_details: { ttl_30m_tokens: 10000, ttl_12h_tokens: 20000 } };
const nativeUsage = () => ({ input_tokens: 100000, output_tokens: 1000, total_tokens: 101000, input_tokens_details: structuredClone(details) });
const chatUsage = () => ({ prompt_tokens: 100000, completion_tokens: 1000, total_tokens: 101000, prompt_tokens_details: structuredClone(details) });
const expected = { prompt_tokens: 100000, completion_tokens: 1000, total_tokens: 101000, cached_tokens: 20000, cache_write_tokens: 30000, cache_write_30m_tokens: 10000, cache_write_12h_tokens: 20000 };

async function stream(upstream, client, usage) {
  const events = upstream === FORMATS.OPENAI_RESPONSES ? [
    { type: "response.output_text.delta", item_id: "msg1", output_index: 0, content_index: 0, delta: "Measured output" },
    { type: "response.completed", response: { id: "resp_fixture", object: "response", status: "completed", output: [], usage } },
  ] : [
    { id: "chat_fixture", choices: [{ index: 0, delta: { role: "assistant", content: "Measured output" }, finish_reason: null }] },
    { id: "chat_fixture", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    { id: "chat_fixture", choices: [], usage },
  ];
  const input = events.map(event => `${event.type ? `event: ${event.type}\n` : ""}data: ${JSON.stringify(event)}\n\n`).join("");
  let captured;
  const bytes = await new Response(new Response(input).body.pipeThrough(createSSEStream({
    mode: "translate", provider: "openai", model: "gpt-6.1-sol", targetFormat: upstream, sourceFormat: client,
    onStreamComplete(_content, tokens) { captured = tokens; },
  }))).text();
  const frames = bytes.split(/\r?\n/).filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  const delivered = client === FORMATS.OPENAI ? frames.findLast(frame => frame.usage)?.usage
    : frames.find(frame => frame.type === "response.completed")?.response.usage;
  return { frames, delivered, captured, bytes };
}

describe("native OpenAI cache-write counters on cross-format streaming wire", () => {
  it.each([
    [FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI],
    [FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES],
  ])("preserves disjoint native TTL counts and canonical accounting from %s to %s", async (upstream, client) => {
    const result = await stream(upstream, client, upstream === FORMATS.OPENAI ? chatUsage() : nativeUsage());
    const key = client === FORMATS.OPENAI ? "prompt_tokens_details" : "input_tokens_details";
    expect(result.delivered[key]).toEqual(details);
    for (const raw of [result.delivered, result.captured]) {
      const tokens = canonicalizeUsage(normalizeUsage(raw));
      expect(tokens).toMatchObject(expected);
      expect(tokens.cache_creation_input_tokens || 0).toBe(0);
      expect(tokens).not.toHaveProperty("cache_creation_1h_tokens");
      expect(tokens).not.toHaveProperty("cache_creation_5m_tokens");
      const cost = calculateCostBreakdown(tokens, getPricingForModel("openai", "gpt-6.1-sol"));
      expect(cost.inputCost).toBeCloseTo(0.1, 12);
      expect(cost.cachedCost).toBeCloseTo(0.002, 12);
      expect(cost.cacheCreationCost).toBeCloseTo(0.125, 12);
      expect(cost.totalCost).toBeCloseTo(0.237, 12);
    }
    if (client === FORMATS.OPENAI_RESPONSES) {
      expect(result.frames.filter(frame => frame.type === "response.completed")).toHaveLength(1);
      expect(result.bytes).toContain("event: response.completed");
    } else {
      expect(result.frames.filter(frame => frame.choices?.[0]?.finish_reason === "stop")).toHaveLength(1);
      expect(result.bytes.split("data: [DONE]").length - 1).toBe(1);
    }
  });

  it.each([FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES])("retains explicit native zero writes on %s delivery instead of fabricating Anthropic TTLs", async client => {
    const usage = client === FORMATS.OPENAI ? nativeUsage() : chatUsage();
    const key = client === FORMATS.OPENAI ? "input_tokens_details" : "prompt_tokens_details";
    usage[key] = { cache_write_tokens: 0, cache_write_tokens_details: { ttl_30m_tokens: 0, ttl_12h_tokens: 0 } };
    const upstream = client === FORMATS.OPENAI ? FORMATS.OPENAI_RESPONSES : FORMATS.OPENAI;
    const result = await stream(upstream, client, usage);
    const deliveredKey = client === FORMATS.OPENAI ? "prompt_tokens_details" : "input_tokens_details";
    expect(result.delivered[deliveredKey]).toEqual(usage[key]);
  });

  it.each([FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES])("does not invent a missing TTL split for aggregate-only writes delivered as %s", async client => {
    const usage = client === FORMATS.OPENAI ? nativeUsage() : chatUsage();
    const key = client === FORMATS.OPENAI ? "input_tokens_details" : "prompt_tokens_details";
    usage[key] = { cache_write_tokens: 30000 };
    const upstream = client === FORMATS.OPENAI ? FORMATS.OPENAI_RESPONSES : FORMATS.OPENAI;
    const result = await stream(upstream, client, usage);
    const deliveredKey = client === FORMATS.OPENAI ? "prompt_tokens_details" : "input_tokens_details";
    expect(result.delivered[deliveredKey]).toEqual({ cache_write_tokens: 30000 });
    const tokens = canonicalizeUsage(normalizeUsage(result.delivered));
    expect(calculateCostBreakdown(tokens, getPricingForModel("openai", "gpt-6.1-sol")).totalCost).toBeNull();
  });

  it("retains the existing Responses legacy cache-read fallback without adding it to inclusive input", async () => {
    const result = await stream(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, {
      input_tokens: 100000, output_tokens: 1000, total_tokens: 101000, cache_read_input_tokens: 20000,
    });
    expect(result.delivered).toMatchObject({ prompt_tokens: 100000, completion_tokens: 1000, total_tokens: 101000,
      prompt_tokens_details: { cached_tokens: 20000 } });
  });
});
