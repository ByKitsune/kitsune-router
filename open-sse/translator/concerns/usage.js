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

// Build OpenAI usage object. Caller computes prompt/completion/total (provider math).
// TTL subsets retain explicit zeroes; other optional details are added when positive.
export function buildUsage({ promptTokens, completionTokens, totalTokens, cachedTokens = 0, cacheCreationTokens = 0, cacheCreation5mTokens, cacheCreation1hTokens, reasoningTokens = 0 }) {
  const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens };
  if (cachedTokens > 0 || cacheCreationTokens > 0 || cacheCreation5mTokens !== undefined || cacheCreation1hTokens !== undefined) {
    usage.prompt_tokens_details = {};
    if (cachedTokens > 0) usage.prompt_tokens_details.cached_tokens = cachedTokens;
    if (cacheCreationTokens > 0) usage.prompt_tokens_details.cache_creation_tokens = cacheCreationTokens;
    if (cacheCreation5mTokens !== undefined) usage.prompt_tokens_details.cache_creation_5m_tokens = cacheCreation5mTokens;
    if (cacheCreation1hTokens !== undefined) usage.prompt_tokens_details.cache_creation_1h_tokens = cacheCreation1hTokens;
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
