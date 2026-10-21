import { describe, expect, it } from "vitest";
import { canonicalizeUsage, extractUsage, filterUsageForFormat, mergeUsage, normalizeUsage } from "../../open-sse/utils/usageTracking.js";
import { buildUsage, getCacheCreationUsage, toGeminiUsage, toOpenAIUsage } from "../../open-sse/translator/concerns/usage.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const malformed = [
  ["negative reasoning", { reasoning_tokens: -1 }],
  ["overflowing input string", { prompt_tokens: "1e999" }],
  ["overflowing cache string", { cached_tokens: "1e999" }],
  ["negative legacy creation", { cache_creation_input_tokens: -1 }],
  ["negative five-minute creation", { cache_creation: { ephemeral_5m_input_tokens: -1 } }],
  ["explicit null cache count", { cached_tokens: null }],
  ["explicit null reasoning count", { reasoning_tokens: null }],
];

describe("malformed supplied usage cannot disappear before accounting validation", () => {
  it.each(malformed)("retains a JSON-safe invalid marker for %s", (_name, counter) => {
    const raw = { prompt_tokens: 100, completion_tokens: 10, cached_tokens: 0, ...counter };
    const original = structuredClone(raw);
    const normalized = extractUsage({ usage: raw });
    expect(normalized).toMatchObject({ usage_invalid: true });
    const canonical = canonicalizeUsage(normalized);
    expect(canonical).toMatchObject({ usage_invalid: true, completion_tokens: 10 });
    expect(canonicalizeUsage(normalizeUsage(JSON.parse(JSON.stringify(canonical))))).toEqual(canonical);
    expect(raw).toEqual(original);
  });

  it("keeps an existing marker even when no valid counter remains", () => {
    expect(normalizeUsage({ usage_invalid: true })).toEqual({ usage_invalid: true });
    expect(canonicalizeUsage({ usage_invalid: true })).toMatchObject({ usage_invalid: true });
    expect(extractUsage({ usage: { usage_invalid: true } })).toMatchObject({ usage_invalid: true });
  });

  it("does not clamp invalid legacy creation into a real zero", () => {
    expect(getCacheCreationUsage({ cache_creation_input_tokens: -1 })).toMatchObject({ total: null, invalid: true });
    expect(getCacheCreationUsage({ cache_creation: { ephemeral_5m_input_tokens: "1e999", ephemeral_1h_input_tokens: 20 } }))
      .toMatchObject({ total: null, fiveMinute: null, oneHour: 20, invalid: true });
  });

  it("does not refold inclusive Chat creation details when no cache-read detail exists", () => {
    const chat = buildUsage({ promptTokens: 330, completionTokens: 50, totalTokens: 380, cacheCreationTokens: 30 });
    const canonical = canonicalizeUsage(extractUsage({ usage: chat }));
    expect(canonical).toMatchObject({ prompt_tokens: 330, completion_tokens: 50, total_tokens: 380,
      cached_tokens: 0, cache_creation_input_tokens: 30 });
    expect(canonical).not.toHaveProperty("usage_invalid");
  });

  it("retains the marker while folding valid Claude cache exactly once", () => {
    let usage = canonicalizeUsage(extractUsage({ type: "message_start", message: { usage: {
      input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 200,
      cache_creation_input_tokens: 30, reasoning_tokens: -1,
    } } }));
    for (let round = 0; round < 3; round++) {
      expect(usage).toMatchObject({ prompt_tokens: 330, completion_tokens: 10, cached_tokens: 200,
        cache_creation_input_tokens: 30, usage_invalid: true });
      usage = canonicalizeUsage(extractUsage({ usage: JSON.parse(JSON.stringify(toOpenAIUsage(usage, "openai"))) }));
    }
  });

  it("preserves invalid markers across streaming max-merges in either order", () => {
    const bad = extractUsage({ usage: { prompt_tokens: "1e999", completion_tokens: 0 } });
    const good = { prompt_tokens: 100, completion_tokens: 10 };
    expect(mergeUsage(good, bad)).toMatchObject({ usage_invalid: true, completion_tokens: 10 });
    expect(mergeUsage(bad, good)).toMatchObject({ usage_invalid: true, completion_tokens: 10 });
  });

  it("does not traverse arbitrary response payloads looking for counters", () => {
    const usage = canonicalizeUsage(extractUsage({ usage: { prompt_tokens: 100, completion_tokens: 10,
      payload: { prompt_tokens: "1e999", reasoning_tokens: -1 },
      tools: [{ input_tokens: -1 }],
    }, output: [{ usage: { prompt_tokens: -1 } }] }));
    expect(usage).toMatchObject({ prompt_tokens: 100, completion_tokens: 10 });
    expect(usage).not.toHaveProperty("usage_invalid");
  });
});

describe("native usage bridges preserve invalid accounting evidence", () => {
  it.each([
    ["openai", { prompt_tokens: 100, completion_tokens: 10, reasoning_tokens: -1 }],
    ["responses", { input_tokens: "1e999", output_tokens: 10 }],
    ["codex", { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: "1e999" } }],
    ["claude", { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: -1 }],
    ["gemini", { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: -1 }],
    ["kiro", { inputTokens: 100, outputTokens: 10, cachedTokens: -1 }],
    ["ollama", { prompt_eval_count: "1e999", eval_count: 10 }],
    ["commandcode", { inputTokens: 100, outputTokens: 10, outputTokenDetails: { reasoningTokens: -1 } }],
  ])("retains malformed native %s counters through its real adapter", (kind, raw) => {
    const wire = toOpenAIUsage(raw, kind);
    expect(wire).toMatchObject({ usage_invalid: true });
    expect(canonicalizeUsage(extractUsage({ usage: JSON.parse(JSON.stringify(wire)) })))
      .toMatchObject({ usage_invalid: true });
  });

  it.each([
    { cachedTokens: -1 }, { reasoningTokens: -1 }, { cacheCreationTokens: -1 },
    { promptTokens: Infinity },
  ])("marks malformed builder counters before optional details are omitted: %j", counters => {
    expect(buildUsage({ promptTokens: 100, completionTokens: 10, totalTokens: 110, ...counters }))
      .toMatchObject({ usage_invalid: true });
  });

  it.each([FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, FORMATS.CLAUDE, FORMATS.GEMINI])
    ("does not drop an existing invalid marker while filtering %s usage", format => {
      expect(filterUsageForFormat({ prompt_tokens: 100, completion_tokens: 10, usage_invalid: true }, format))
        .toHaveProperty("usage_invalid", true);
    });

  it("preserves an invalid marker through the Gemini bridge in both directions", () => {
    const gemini = toGeminiUsage({ prompt_tokens: 100, completion_tokens: 10, usage_invalid: true });
    expect(gemini).toMatchObject({ usage_invalid: true });
    expect(extractUsage({ usageMetadata: gemini })).toMatchObject({ usage_invalid: true });
  });
});
