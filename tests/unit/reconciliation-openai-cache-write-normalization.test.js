import { describe, expect, it } from "vitest";
import * as usageConcern from "../../open-sse/translator/concerns/usage.js";
import {
  canonicalizeUsage, extractUsage, filterUsageForFormat, mergeUsage, normalizeUsage,
} from "../../open-sse/utils/usageTracking.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// Public Responses prompt-caching example captured 2026-10-21: writes are
// disjoint input subsets, not additional input or Anthropic 5m/1h writes.
const nativeUsage = () => ({
  input_tokens: 12000,
  output_tokens: 500,
  total_tokens: 12500,
  input_tokens_details: {
    cached_tokens: 4000,
    cache_write_tokens: 7000,
    cache_write_tokens_details: { ttl_30m_tokens: 3000, ttl_12h_tokens: 4000 },
  },
});
const canonicalWrites = {
  cache_write_tokens: 7000, cache_write_30m_tokens: 3000, cache_write_12h_tokens: 4000,
};
const nativeWriteDetails = {
  cache_write_tokens: 7000,
  cache_write_tokens_details: { ttl_30m_tokens: 3000, ttl_12h_tokens: 4000 },
};

describe("OpenAI cache-write extraction", () => {
  it("exposes validated native write counters without borrowing Anthropic TTL fields", () => {
    expect(usageConcern.getOpenAICacheWriteUsage).toBeTypeOf("function");
    expect(usageConcern.getOpenAICacheWriteUsage(nativeUsage())).toEqual({
      total: 7000, thirtyMinute: 3000, twelveHour: 4000,
    });
    expect(usageConcern.getOpenAICacheWriteUsage({
      cache_creation_input_tokens: 7000,
      cache_creation: { ephemeral_5m_input_tokens: 3000, ephemeral_1h_input_tokens: 4000 },
    })).toBeNull();
  });

  it.each(["input_tokens_details", "prompt_tokens_details"])("reads the %s native split", field => {
    expect(usageConcern.getOpenAICacheWriteUsage?.({ [field]: nativeUsage().input_tokens_details })).toEqual({
      total: 7000, thirtyMinute: 3000, twelveHour: 4000,
    });
  });

  it("derives a missing aggregate from explicit subsets without inventing the absent TTL", () => {
    expect(usageConcern.getOpenAICacheWriteUsage?.({
      input_tokens_details: { cache_write_tokens_details: { ttl_30m_tokens: 3000 } },
    })).toEqual({ total: 3000, thirtyMinute: 3000 });
    expect(usageConcern.getOpenAICacheWriteUsage?.({
      input_tokens_details: { cache_write_tokens_details: { ttl_30m_tokens: 3000, ttl_12h_tokens: 4000 } },
    })).toEqual({ total: 7000, thirtyMinute: 3000, twelveHour: 4000 });
  });

  it("retains aggregate-only writes without assuming the default request TTL was used", () => {
    expect(usageConcern.getOpenAICacheWriteUsage?.({
      input_tokens_details: { cache_write_tokens: 7000 },
    })).toEqual({ total: 7000 });
    expect(canonicalizeUsage(normalizeUsage({
      input_tokens: 12000, output_tokens: 500, input_tokens_details: { cache_write_tokens: 7000 },
    }))).toMatchObject({ prompt_tokens: 12000, cache_write_tokens: 7000 });
  });

  it("retains explicit all-zero aggregate and TTL counters", () => {
    const zero = { cache_write_tokens: 0, cache_write_30m_tokens: 0, cache_write_12h_tokens: 0 };
    const result = canonicalizeUsage(normalizeUsage({ prompt_tokens: 12000, ...zero }));
    expect(result).toMatchObject(zero);
    expect(usageConcern.getOpenAICacheWriteUsage?.(zero)).toEqual({ total: 0, thirtyMinute: 0, twelveHour: 0 });
  });

  it.each([
    ["negative", -1], ["fractional", 0.5], ["numeric string", "3000"],
    ["empty string", ""], ["boolean", false], ["explicit null", null],
    ["NaN", Number.NaN], ["infinity", Number.POSITIVE_INFINITY],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
  ])("marks a %s TTL counter unknown instead of silently turning it into zero", (_name, value) => {
    const raw = nativeUsage();
    raw.input_tokens_details.cache_write_tokens_details.ttl_30m_tokens = value;
    const canonical = canonicalizeUsage(normalizeUsage(raw));
    expect(canonical).toMatchObject({
      prompt_tokens: 12000,
      cache_write_tokens: 7000,
      cache_write_30m_tokens: null,
      cache_write_12h_tokens: 4000,
      cache_write_invalid: true,
    });
    expect(canonicalizeUsage(normalizeUsage(canonical))).toMatchObject({
      cache_write_30m_tokens: null, cache_write_invalid: true,
    });
  });

  it.each([
    ["unexplained remainder", 7000, 3000, 2000],
    ["overlapping subsets", 7000, 5000, 4000],
    ["explicit zero aggregate", 0, 3000, 4000],
  ])("marks %s invalid while retaining the reported counts", (_name, total, thirty, twelve) => {
    expect(canonicalizeUsage(normalizeUsage({
      prompt_tokens: 12000, cache_write_tokens: total,
      cache_write_30m_tokens: thirty, cache_write_12h_tokens: twelve,
    }))).toMatchObject({
      cache_write_tokens: total, cache_write_30m_tokens: thirty,
      cache_write_12h_tokens: twelve, cache_write_invalid: true,
    });
  });

  it("does not invent a twelve-hour remainder when only the thirty-minute subset is supplied", () => {
    const result = canonicalizeUsage(normalizeUsage({
      input_tokens: 12000,
      input_tokens_details: { cache_write_tokens: 7000, cache_write_tokens_details: { ttl_30m_tokens: 3000 } },
    }));
    expect(result).toMatchObject({ cache_write_tokens: 7000, cache_write_30m_tokens: 3000, cache_write_invalid: true });
    expect(result).not.toHaveProperty("cache_write_12h_tokens");
  });

  it("marks a malformed split container unknown even when no usable TTL count survives", () => {
    expect(canonicalizeUsage(normalizeUsage({
      input_tokens: 12000,
      input_tokens_details: { cache_write_tokens: 7000, cache_write_tokens_details: "invalid" },
    }))).toMatchObject({ cache_write_tokens: 7000, cache_write_invalid: true });
  });

  it("marks a malformed aggregate unknown rather than deriving a contradictory known total", () => {
    const raw = nativeUsage();
    raw.input_tokens_details.cache_write_tokens = "7000";
    expect(canonicalizeUsage(normalizeUsage(raw))).toMatchObject({
      cache_write_tokens: null, cache_write_30m_tokens: 3000,
      cache_write_12h_tokens: 4000, cache_write_invalid: true,
    });
  });

  it.each([
    ["native writes exceed input", { input_tokens: 6000 }],
    ["reads plus native writes exceed input", { input_tokens_details: { cached_tokens: 6000 } }],
    ["legacy and native writes exceed input", { cache_creation_input_tokens: 2000 }],
  ])("marks usage invalid when %s", (_name, overrides) => {
    const raw = nativeUsage();
    const details = { ...raw.input_tokens_details, ...overrides.input_tokens_details };
    const canonical = canonicalizeUsage(normalizeUsage({ ...raw, ...overrides, input_tokens_details: details }));
    expect(canonical).toMatchObject({ cache_write_invalid: true, ...canonicalWrites });
  });

  it("preserves a preexisting invalid marker even without readable counters", () => {
    const canonical = canonicalizeUsage(normalizeUsage({ input_tokens: 12000, cache_write_invalid: true }));
    expect(canonical).toMatchObject({ prompt_tokens: 12000, cache_write_invalid: true });
    expect(canonicalizeUsage(normalizeUsage(canonical))).toMatchObject({ cache_write_invalid: true });
  });
});

describe("OpenAI writes survive usage normalization and forwarding", () => {
  it.each(["response.completed", "response.incomplete", "response.failed"])("captures %s native usage with cache-inclusive input unchanged", type => {
    const canonical = canonicalizeUsage(extractUsage({ type, response: { usage: nativeUsage() } }));
    expect(canonical).toMatchObject({
      prompt_tokens: 12000, completion_tokens: 500, total_tokens: 12500,
      cached_tokens: 4000, cache_creation_input_tokens: 0, ...canonicalWrites,
    });
    expect(canonical).not.toHaveProperty("cache_creation_5m_tokens");
    expect(canonical).not.toHaveProperty("cache_creation_1h_tokens");
  });

  it("does not shadow native input details with a fabricated cached-only prompt detail object", () => {
    const extracted = extractUsage({ usage: nativeUsage() });
    expect(extracted.prompt_tokens_details).toMatchObject({ cached_tokens: 4000, ...nativeWriteDetails });
    expect(extracted).toMatchObject(canonicalWrites);
  });

  it("is idempotent across repeated extraction, normalization, canonicalization and wire round trips", () => {
    let usage = nativeUsage();
    for (let i = 0; i < 4; i++) {
      usage = canonicalizeUsage(normalizeUsage(usage));
      expect(usage).toMatchObject({ prompt_tokens: 12000, total_tokens: 12500, ...canonicalWrites });
      usage = usageConcern.toOpenAIUsage(usage, "openai");
      expect(usage.prompt_tokens_details).toMatchObject(nativeWriteDetails);
    }
  });

  it.each(["responses", "codex", "openai"])("preserves the native split through the %s usage adapter", kind => {
    const raw = kind === "openai"
      ? { prompt_tokens: 12000, completion_tokens: 500, prompt_tokens_details: nativeUsage().input_tokens_details }
      : nativeUsage();
    const wire = usageConcern.toOpenAIUsage(raw, kind);
    expect(wire).toMatchObject({ prompt_tokens: 12000, completion_tokens: 500, total_tokens: 12500,
      prompt_tokens_details: { cached_tokens: 4000, ...nativeWriteDetails } });
    expect(canonicalizeUsage(normalizeUsage(wire))).toMatchObject(canonicalWrites);
  });

  it("builds explicit zero native write details without manufacturing Anthropic counters", () => {
    const wire = usageConcern.buildUsage({
      promptTokens: 12000, completionTokens: 500, totalTokens: 12500,
      cacheWriteTokens: 0, cacheWrite30mTokens: 0, cacheWrite12hTokens: 0,
    });
    expect(wire.prompt_tokens_details).toEqual({
      cache_write_tokens: 0, cache_write_tokens_details: { ttl_30m_tokens: 0, ttl_12h_tokens: 0 },
    });
  });

  it("forwards canonical writes as Chat details and preserves native Responses details", () => {
    const canonical = { prompt_tokens: 12000, completion_tokens: 500, total_tokens: 12500, ...canonicalWrites };
    expect(filterUsageForFormat(canonical, FORMATS.OPENAI)).toMatchObject({
      prompt_tokens: 12000, prompt_tokens_details: nativeWriteDetails,
    });
    expect(filterUsageForFormat(nativeUsage(), FORMATS.OPENAI_RESPONSES)).toEqual(nativeUsage());
    expect(filterUsageForFormat(canonical, FORMATS.CLAUDE)).not.toHaveProperty("cache_creation");
  });

  it("preserves an invalid-split marker through forwarding and usage merging", () => {
    const invalid = normalizeUsage({
      input_tokens: 12000, input_tokens_details: { cache_write_tokens: 7000,
        cache_write_tokens_details: { ttl_30m_tokens: 3000 } },
    });
    const merged = mergeUsage({ completion_tokens: 500 }, invalid);
    expect(merged).toMatchObject({ cache_write_tokens: 7000, cache_write_invalid: true });
    const wire = filterUsageForFormat(merged, FORMATS.OPENAI);
    expect(wire).toMatchObject({ cache_write_invalid: true,
      prompt_tokens_details: { cache_write_tokens: 7000, cache_write_tokens_details: { ttl_30m_tokens: 3000 } } });
    expect(canonicalizeUsage(normalizeUsage(wire))).toMatchObject({ cache_write_invalid: true });
  });

  it("keeps OpenAI and Anthropic write families independent when both are explicitly present", () => {
    const canonical = canonicalizeUsage(normalizeUsage({
      ...nativeUsage(), cache_creation_input_tokens: 0,
      cache_creation_5m_tokens: 0, cache_creation_1h_tokens: 0,
    }));
    expect(canonical).toMatchObject({
      prompt_tokens: 12000, cached_tokens: 4000, ...canonicalWrites,
      cache_creation_input_tokens: 0, cache_creation_5m_tokens: 0, cache_creation_1h_tokens: 0,
    });
    expect(canonicalizeUsage(normalizeUsage(canonical))).toEqual(canonical);
  });
});
