// Cache TTL counters are subsets of the aggregate write count, never extra input.
export function getCacheCreationUsage(raw) {
  const total = raw?.cache_creation_input_tokens ?? raw?.cache_creation_tokens
    ?? raw?.prompt_tokens_details?.cache_creation_tokens ?? raw?.input_tokens_details?.cache_creation_tokens;
  const five = raw?.cache_creation_5m_tokens ?? raw?.prompt_tokens_details?.cache_creation_5m_tokens
    ?? raw?.input_tokens_details?.cache_creation_5m_tokens ?? raw?.cache_creation?.ephemeral_5m_input_tokens;
  const hour = raw?.cache_creation_1h_tokens ?? raw?.prompt_tokens_details?.cache_creation_1h_tokens
    ?? raw?.input_tokens_details?.cache_creation_1h_tokens ?? raw?.cache_creation?.ephemeral_1h_input_tokens;
  if (total == null && five == null && hour == null) return null;
  const count = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  return {
    total: total == null ? count(five) + count(hour) : count(total),
    ...(five == null ? {} : { fiveMinute: count(five) }),
    ...(hour == null ? {} : { oneHour: count(hour) }),
  };
}

/**
 * OpenAI writes are inclusive input subsets, independent of Anthropic creation.
 * Missing TTLs stay missing; an aggregate alone does not prove a 30m lifetime.
 * Invalid supplied counts stay null and carry a marker through JSON round trips.
 * Native split: cache_write_tokens_details.{ttl_30m_tokens, ttl_12h_tokens}.
 * https://developers.openai.com/api/docs/guides/prompt-caching (2026-10-21)
 */
export function getOpenAICacheWriteUsage(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const details = [raw.input_tokens_details, raw.prompt_tokens_details]
    .filter(value => value && typeof value === "object" && !Array.isArray(value));
  let invalid = raw.cache_write_invalid === true;
  let present = invalid;
  const count = (field, nestedField) => {
    const values = [raw[field], ...details.map(detail => nestedField
      ? detail.cache_write_tokens_details?.[nestedField] : detail[field])]
      .filter(value => value !== undefined);
    if (values.length === 0) return undefined;
    present = true;
    if (values.some(value => !Number.isSafeInteger(value) || value < 0 || value !== values[0])) invalid = true;
    return Number.isSafeInteger(values[0]) && values[0] >= 0 ? values[0] : null;
  };
  let total = count("cache_write_tokens");
  const thirtyMinute = count("cache_write_30m_tokens", "ttl_30m_tokens");
  const twelveHour = count("cache_write_12h_tokens", "ttl_12h_tokens");
  for (const detail of details) {
    const split = detail.cache_write_tokens_details;
    if (split === undefined) continue;
    present = true;
    if (!split || typeof split !== "object" || Array.isArray(split) ||
        (split.ttl_30m_tokens === undefined && split.ttl_12h_tokens === undefined)) invalid = true;
  }
  if (!present) return null;

  const hasSplit = thirtyMinute !== undefined || twelveHour !== undefined;
  const splitTotal = (thirtyMinute ?? 0) + (twelveHour ?? 0);
  if (hasSplit && (!Number.isSafeInteger(splitTotal) || thirtyMinute === null || twelveHour === null)) invalid = true;
  if (total === undefined) {
    total = hasSplit && thirtyMinute !== null && twelveHour !== null && Number.isSafeInteger(splitTotal) ? splitTotal : null;
  } else if (hasSplit && total !== splitTotal) {
    // A remainder is unknown, not evidence it was written at the other TTL.
    invalid = true;
  }

  const prompt = raw.prompt_tokens ?? raw.input_tokens;
  if (prompt !== undefined) {
    const cached = raw.cached_tokens ?? raw.input_tokens_details?.cached_tokens
      ?? raw.prompt_tokens_details?.cached_tokens ?? raw.prompt_cache_hit_tokens ?? raw.cache_read_input_tokens ?? 0;
    const legacyCreation = getCacheCreationUsage(raw)?.total ?? 0;
    const accounted = cached + legacyCreation + (total ?? 0);
    if (![prompt, cached, legacyCreation, accounted].every(value => Number.isSafeInteger(value) && value >= 0) || accounted > prompt) {
      invalid = true;
    }
  }
  return {
    total,
    ...(thirtyMinute === undefined ? {} : { thirtyMinute }),
    ...(twelveHour === undefined ? {} : { twelveHour }),
    ...(invalid ? { invalid: true } : {}),
  };
}

// Build OpenAI usage object. Caller computes prompt/completion/total (provider math).
// TTL subsets retain explicit zeroes; other optional details are added when positive.
export function buildUsage({ promptTokens, completionTokens, totalTokens, cachedTokens = 0, cacheCreationTokens = 0, cacheCreation5mTokens, cacheCreation1hTokens, cacheWriteTokens, cacheWrite30mTokens, cacheWrite12hTokens, cacheWriteInvalid, reasoningTokens = 0 }) {
  const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens };
  if (cachedTokens > 0 || cacheCreationTokens > 0 || cacheCreation5mTokens !== undefined || cacheCreation1hTokens !== undefined) {
    usage.prompt_tokens_details = {};
    if (cachedTokens > 0) usage.prompt_tokens_details.cached_tokens = cachedTokens;
    if (cacheCreationTokens > 0) usage.prompt_tokens_details.cache_creation_tokens = cacheCreationTokens;
    if (cacheCreation5mTokens !== undefined) usage.prompt_tokens_details.cache_creation_5m_tokens = cacheCreation5mTokens;
    if (cacheCreation1hTokens !== undefined) usage.prompt_tokens_details.cache_creation_1h_tokens = cacheCreation1hTokens;
  }
  const writes = getOpenAICacheWriteUsage({
    prompt_tokens: promptTokens, cached_tokens: cachedTokens, cache_creation_input_tokens: cacheCreationTokens,
    cache_write_tokens: cacheWriteTokens, cache_write_30m_tokens: cacheWrite30mTokens,
    cache_write_12h_tokens: cacheWrite12hTokens, cache_write_invalid: cacheWriteInvalid,
  });
  if (writes) {
    const details = usage.prompt_tokens_details ||= {};
    details.cache_write_tokens = writes.total;
    if (writes.thirtyMinute !== undefined || writes.twelveHour !== undefined) {
      details.cache_write_tokens_details = {
        ...(writes.thirtyMinute === undefined ? {} : { ttl_30m_tokens: writes.thirtyMinute }),
        ...(writes.twelveHour === undefined ? {} : { ttl_12h_tokens: writes.twelveHour }),
      };
    }
    if (writes.invalid) usage.cache_write_invalid = true;
  }
  if (reasoningTokens > 0) {
    usage.completion_tokens_details = { reasoning_tokens: reasoningTokens };
  }
  return usage;
}

const n = (v) => (typeof v === "number" ? v : 0);

// Per-provider raw token field-map + math. Returns buildUsage() args (NOT the usage object).
// Keeps each provider's exact semantics: claude/gemini fold cache+reasoning, others don't.
const USAGE_EXTRACTORS = {
  claude(raw, creation) {
    const input = n(raw.input_tokens), output = n(raw.output_tokens);
    const cacheRead = n(raw.cache_read_input_tokens), cacheCreate = creation?.total ?? n(raw.cache_creation_input_tokens);
    const prompt = input + cacheRead + cacheCreate;
    return { promptTokens: prompt, completionTokens: output, totalTokens: prompt + output, cachedTokens: cacheRead, cacheCreationTokens: cacheCreate };
  },
  gemini(raw) {
    const cached = n(raw.cachedContentTokenCount);
    const prompt = n(raw.promptTokenCount);
    const thoughts = n(raw.thoughtsTokenCount);
    const total = n(raw.totalTokenCount);
    let candidates = n(raw.candidatesTokenCount);
    // Fallback: derive candidates from total when upstream omits it
    if (candidates === 0 && total > 0) {
      candidates = total - prompt - thoughts;
      if (candidates < 0) candidates = 0;
    }
    return { promptTokens: prompt, completionTokens: candidates + thoughts, totalTokens: typeof raw.totalTokenCount === "number" ? total : prompt + candidates + thoughts, cachedTokens: cached, reasoningTokens: thoughts };
  },
  kiro(raw) {
    const input = n(raw.inputTokens), output = n(raw.outputTokens);
    // ponytail: Amazon Q (Kiro upstream) does not expose cache fields today,
    // but pass through any cache_read/cache_creation/cached_tokens if the
    // event shape grows them later so cost tracking keeps working without
    // a second pass.
    const cached = n(raw.cache_read_input_tokens) || n(raw.cachedTokens) || n(raw.cached_tokens);
    const cacheCreation = n(raw.cache_creation_input_tokens);
    const out = { promptTokens: input, completionTokens: output, totalTokens: input + output };
    if (cached > 0) out.cachedTokens = cached;
    if (cacheCreation > 0) out.cacheCreationTokens = cacheCreation;
    return out;
  },
  ollama(raw) {
    const input = n(raw.prompt_eval_count), output = n(raw.eval_count);
    return { promptTokens: input, completionTokens: output, totalTokens: input + output };
  },
  commandcode(raw) {
    const input = n(raw.inputTokens), output = n(raw.outputTokens);
    const total = typeof raw.totalTokens === "number" ? raw.totalTokens : input + output;
    // CommandCode's `inputTokens` is INCLUSIVE of cache reads (upstream sends
    // inputTokenDetails.noCacheTokens + cacheReadTokens === inputTokens), so
    // promptTokens stays as-is and the cached count is passed through as a
    // detail only. That lets usage tracking + billing charge those tokens at
    // the cached rate instead of the full input rate. Do NOT add it to
    // promptTokens or the cache portion gets billed twice.
    const cached = n(raw.cachedInputTokens) || n(raw.inputTokenDetails?.cacheReadTokens) || n(raw.cacheReadTokens);
    const cacheCreation = n(raw.inputTokenDetails?.cacheWriteTokens);
    const reasoning = n(raw.reasoningTokens) || n(raw.outputTokenDetails?.reasoningTokens);
    const out = { promptTokens: input, completionTokens: output, totalTokens: total };
    if (cached > 0) out.cachedTokens = cached;
    if (cacheCreation > 0) out.cacheCreationTokens = cacheCreation;
    if (reasoning > 0) out.reasoningTokens = reasoning;
    return out;
  },
  openai(raw) {
    const prompt = n(raw.prompt_tokens);
    const completion = n(raw.completion_tokens);
    const total = n(raw.total_tokens) || (prompt + completion);
    const cached = n(raw.prompt_tokens_details?.cached_tokens) || n(raw.prompt_cache_hit_tokens) || n(raw.cached_tokens);
    const cacheCreation = n(raw.prompt_tokens_details?.cache_creation_tokens) || n(raw.cache_creation_input_tokens);
    const reasoning = n(raw.completion_tokens_details?.reasoning_tokens) || n(raw.reasoning_tokens);
    return { promptTokens: prompt, completionTokens: completion, totalTokens: total, cachedTokens: cached, cacheCreationTokens: cacheCreation, reasoningTokens: reasoning };
  },
  responses(raw) {
    const input = n(raw.input_tokens) || n(raw.prompt_tokens);
    const output = n(raw.output_tokens) || n(raw.completion_tokens);
    const total = n(raw.total_tokens) || (input + output);
    const cached = n(raw.input_tokens_details?.cached_tokens) || n(raw.cached_tokens);
    const cacheCreation = n(raw.input_tokens_details?.cache_creation_tokens) || n(raw.cache_creation_input_tokens);
    const reasoning = n(raw.output_tokens_details?.reasoning_tokens) || n(raw.reasoning_tokens);
    return { promptTokens: input, completionTokens: output, totalTokens: total, cachedTokens: cached, cacheCreationTokens: cacheCreation, reasoningTokens: reasoning };
  },
  codex(raw) {
    return USAGE_EXTRACTORS.responses(raw);
  },
};

// Convert provider-native usage object → OpenAI usage. Returns null if no extractor/raw.
export function toOpenAIUsage(raw, kind) {
  const extract = USAGE_EXTRACTORS[kind];
  if (!extract || !raw || typeof raw !== "object") return null;
  const creation = getCacheCreationUsage(raw);
  const args = extract(raw, creation);
  if (creation) {
    args.cacheCreationTokens = creation.total;
    args.cacheCreation5mTokens = creation.fiveMinute;
    args.cacheCreation1hTokens = creation.oneHour;
  }
  const writes = getOpenAICacheWriteUsage(raw);
  if (writes) {
    args.cacheWriteTokens = writes.total;
    args.cacheWrite30mTokens = writes.thirtyMinute;
    args.cacheWrite12hTokens = writes.twelveHour;
    args.cacheWriteInvalid = writes.invalid;
  }
  return buildUsage(args);
}

// Chat/Responses output counts include reasoning; Gemini reports that slice separately.
export function toGeminiUsage(usage) {
  const prompt = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const output = usage.completion_tokens ?? usage.output_tokens ?? 0;
  const thoughts = usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? 0;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? usage.cached_tokens;
  return {
    promptTokenCount: prompt,
    candidatesTokenCount: Math.max(0, output - thoughts),
    totalTokenCount: usage.total_tokens ?? prompt + output,
    ...(thoughts > 0 ? { thoughtsTokenCount: thoughts } : {}),
    ...(cached !== undefined ? { cachedContentTokenCount: cached } : {}),
    ...(usage.estimated ? { estimated: true } : {}),
  };
}
