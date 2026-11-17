import { describe, expect, it } from "vitest";
import { initState, translateResponse } from "../../open-sse/translator/index.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { canonicalizeUsage } from "../../open-sse/utils/usageTracking.js";
import { calculateCostFromTokens } from "../../open-sse/providers/pricing.js";

function records(usage) {
  return [
    { id: "chatcmpl_cache_trailer", choices: [{ index: 0, delta: { role: "assistant", content: "Retained answer" }, finish_reason: null }] },
    { id: "chatcmpl_cache_trailer", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    { id: "chatcmpl_cache_trailer", choices: [], usage },
  ];
}

function translate(usage) {
  const state = initState(F.CLAUDE);
  const events = records(usage).flatMap(record => translateResponse(F.OPENAI, F.CLAUDE, record, state));
  events.push(...translateResponse(F.OPENAI, F.CLAUDE, null, state));
  return { events, state, usage: events.find(event => event.type === "message_delta")?.usage };
}

describe("OpenAI cache trailers delivered to Messages clients (#5596)", () => {
  it.each([
    ["nested cache", { prompt_tokens_details: { cached_tokens: 80 } }],
    ["canonical top-level cache", { cached_tokens: 80 }],
    ["native compatibility cache alias", { prompt_cache_hit_tokens: 80 }],
  ])("maps %s without inflating uncached input", (label, fields) => {
    const result = translate({ prompt_tokens: 100, completion_tokens: 3, total_tokens: 103, ...fields });
    expect(result.usage).toEqual({ input_tokens: 20, output_tokens: 3, cache_read_input_tokens: 80 });
    expect(result.events.filter(event => event.type === "message_delta")).toHaveLength(1);
    expect(result.events.filter(event => event.type === "message_stop")).toHaveLength(1);
    expect(canonicalizeUsage(result.state.usage)).toMatchObject({ prompt_tokens: 100, completion_tokens: 3, cached_tokens: 80 });
  });

  it("retains top-level legacy cache creation without conflating native OpenAI writes", () => {
    expect(translate({ prompt_tokens: 100, completion_tokens: 3, cached_tokens: 70, cache_creation_input_tokens: 10 }).usage)
      .toEqual({ input_tokens: 20, output_tokens: 3, cache_read_input_tokens: 70, cache_creation_input_tokens: 10 });
  });

  it("retains the supplied legacy TTL split on the Messages wire", () => {
    expect(translate({ prompt_tokens: 100, completion_tokens: 3,
      prompt_tokens_details: { cached_tokens: 50, cache_creation_tokens: 30, cache_creation_5m_tokens: 10, cache_creation_1h_tokens: 20 },
    }).usage).toEqual({ input_tokens: 20, output_tokens: 3, cache_read_input_tokens: 50, cache_creation_input_tokens: 30,
      cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 } });
  });

  it("accepts the shared finite integer string counters", () => {
    expect(translate({ prompt_tokens: "100", completion_tokens: "3", cached_tokens: "80" }).usage)
      .toEqual({ input_tokens: 20, output_tokens: 3, cache_read_input_tokens: 80 });
  });

  it.each([null, true, "bad", -1, 0.5])("keeps malformed input %j unpriceable after converting the trailer", value => {
    const result = translate({ prompt_tokens: value, completion_tokens: 3 });
    expect(result.usage.usage_invalid).toBe(true);
    expect(result.usage.input_tokens).toBe(0);
    expect(calculateCostFromTokens(canonicalizeUsage(result.state.usage), { input: 3, output: 15, cached: 0.3 })).toBeNull();
  });

  it("does not emit a negative Messages input count for an impossible cache subset", () => {
    const result = translate({ prompt_tokens: 5, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 8 } });
    expect(result.usage).toMatchObject({ input_tokens: 0, output_tokens: 3, usage_invalid: true });
    expect(calculateCostFromTokens(canonicalizeUsage(result.state.usage), { input: 3, output: 15, cached: 0.3 })).toBeNull();
  });

  it.each([
    { cached_tokens: 0.5 },
    { cache_creation_tokens: 10, cache_creation_5m_tokens: null },
    { cache_creation_tokens: 10, cache_creation_1h_tokens: 0.5 },
  ])("never emits malformed native counters while retaining invalid evidence (%j)", details => {
    const result = translate({ prompt_tokens: 100, completion_tokens: 3, prompt_tokens_details: details });
    expect(result.usage.usage_invalid).toBe(true);
    const counters = [result.usage.input_tokens, result.usage.output_tokens, result.usage.cache_read_input_tokens,
      result.usage.cache_creation_input_tokens, ...Object.values(result.usage.cache_creation || {})];
    expect(counters.filter(value => value !== undefined).every(value => Number.isSafeInteger(value) && value >= 0)).toBe(true);
    expect(calculateCostFromTokens(canonicalizeUsage(result.state.usage), { input: 3, output: 15, cached: 0.3 })).toBeNull();
  });

  it("preserves explicit primary zeroes over stale cache aliases", () => {
    expect(translate({ prompt_tokens: 100, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 0 }, cached_tokens: 80 }).usage)
      .toEqual({ input_tokens: 100, output_tokens: 3 });
  });

  it("does not relabel native 30m/12h writes as Anthropic 5m/1h creations", () => {
    expect(translate({ prompt_tokens: 100, completion_tokens: 3, prompt_tokens_details: {
      cached_tokens: 20, cache_write_tokens: 30, cache_write_tokens_details: { ttl_30m_tokens: 10, ttl_12h_tokens: 20 },
    } }).usage).toEqual({ input_tokens: 80, output_tokens: 3, cache_read_input_tokens: 20 });
  });

  it("delivers the final alias-aware cache usage through the actual SSE pipeline", async () => {
    const wire = records({ prompt_tokens: 100, completion_tokens: 3, cached_tokens: 80 })
      .map(record => `data: ${JSON.stringify(record)}\n\n`).join("") + "data: [DONE]\n\n";
    const response = new Response(new Response(wire).body.pipeThrough(createSSEStream({
      mode: "translate", targetFormat: F.OPENAI, sourceFormat: F.CLAUDE, provider: "fixture", model: "fixture", body: {},
    })));
    const events = (await response.text()).split("\n").filter(line => line.startsWith("data: {"))
      .map(line => JSON.parse(line.slice(6)));
    expect(events.filter(event => event.type === "message_delta").at(-1).usage)
      .toEqual({ input_tokens: 20, output_tokens: 3, cache_read_input_tokens: 80 });
    expect(events.filter(event => event.type === "message_stop")).toHaveLength(1);
  });
});
