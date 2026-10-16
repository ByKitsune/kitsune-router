import { saveRequestUsage } from "@/lib/usageDb.js";
import { COLORS } from "../../utils/stream.js";
import { canonicalizeUsage } from "../../utils/usageTracking.js";
import { toOpenAIUsage } from "../../translator/concerns/usage.js";

const OPTIONAL_PARAMS = [
  "temperature", "top_p", "top_k",
  "max_tokens", "max_completion_tokens", "max_output_tokens",
  "reasoning_effort", "generationConfig",
  "thinking", "reasoning", "enable_thinking",
  "presence_penalty", "frequency_penalty",
  "seed", "stop", "tools", "tool_choice",
  "response_format", "prediction", "store", "metadata",
  "n", "logprobs", "top_logprobs", "logit_bias",
  "user", "parallel_tool_calls"
];

export function extractRequestConfig(body, stream) {
  const config = { messages: body.messages || [], model: body.model, stream };
  for (const param of OPTIONAL_PARAMS) {
    if (body[param] !== undefined) config[param] = body[param];
  }
  return config;
}

export function extractUsageFromResponse(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return null;

  // ── Claude / Responses shape (input_tokens discriminator) ──────────────
  // Note: OpenAI Responses API usage ({ input_tokens, input_tokens_details:{cached_tokens},
  // output_tokens }) ALSO matches this branch because it uses input_tokens, not prompt_tokens.
  // Its prompt is cache-INCLUSIVE (prompt already contains the cached slice) and its
  // cache count rides in input_tokens_details.cached_tokens OR top-level cached_tokens
  // depending on gateway (codex / sse-to-json shim). We must surface it as cached_tokens —
  // the convention canonicalizeUsage() passes through WITHOUT folding. If we ignored the
  // nested detail, non-streaming codex traffic would record cached_tokens:0 even though
  // upstream did 90%+ cache hits. See e7dd72a8d, #3567-related usage gap.
  //
  // Fallback chain (most specific first, ?? preserves 0):
  //   1) usage.cached_tokens — flat top-level (SSE shim that flattens Responses)
  //   2) usage.input_tokens_details.cached_tokens — native Responses (codex live)
  //   3) usage.prompt_tokens_details.cached_tokens — gateway that re-uses OpenAI nest
  //   4) usage.cache_read_input_tokens — native Claude exclusive cache (separate)
  //   5) usage.prompt_cache_hit_tokens — DeepSeek / compat alias
  // cache_* fields are preserved verbatim for Claude discriminators; cached_tokens
  // is unified for cost calc.
  if (responseBody.usage?.input_tokens !== undefined) {
    const u = responseBody.usage;
    const cached = u.cached_tokens
      ?? u.input_tokens_details?.cached_tokens
      ?? u.prompt_tokens_details?.cached_tokens
      ?? u.cache_read_input_tokens
      ?? u.prompt_cache_hit_tokens;
    return {
      prompt_tokens: u.input_tokens || 0,
      completion_tokens: u.output_tokens || 0,
      // Unified cache-read for downstream canonicalize + pricing (inclusive prompt path)
      cached_tokens: cached,
      // Preserve Claude exclusive fields for canonicalize's exclusive→inclusive fold branch
      cache_read_input_tokens: u.cache_read_input_tokens ?? u.input_tokens_details?.cache_read_input_tokens,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? u.input_tokens_details?.cache_creation_input_tokens,
      reasoning_tokens: u.output_tokens_details?.reasoning_tokens ?? u.reasoning_tokens ?? u.completion_tokens_details?.reasoning_tokens
    };
  }

  // ── OpenAI Chat shape (prompt_tokens discriminator) ───────────────────
  // Chat completions use prompt_tokens / completion_tokens. Cache may arrive as:
  //   - prompt_tokens_details.cached_tokens (canonical OpenAI)
  //   - cached_tokens flat (SSE-to-JSON shim, some gateways)
  //   - prompt_cache_hit_tokens (DeepSeek compat)
  //   - cache_read_input_tokens / input_tokens_details.cached_tokens (Responses-shaped leak)
  // We normalize all into cached_tokens so canonicalize + pricing can rely on one key.
  if (responseBody.usage?.prompt_tokens !== undefined) {
    const u = responseBody.usage;
    return {
      prompt_tokens: u.prompt_tokens || 0,
      completion_tokens: u.completion_tokens || 0,
      cached_tokens: u.cached_tokens
        ?? u.prompt_tokens_details?.cached_tokens
        ?? u.input_tokens_details?.cached_tokens
        ?? u.prompt_cache_hit_tokens
        ?? u.cache_read_input_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens ?? u.input_tokens_details?.cache_read_input_tokens,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? u.input_tokens_details?.cache_creation_input_tokens,
      reasoning_tokens: u.completion_tokens_details?.reasoning_tokens ?? u.output_tokens_details?.reasoning_tokens ?? u.reasoning_tokens
    };
  }

  // Gemini format. Antigravity / gemini-cli wrap the payload in { response: {...} }.
  const usageMetadata = responseBody.usageMetadata || responseBody.response?.usageMetadata;
  if (usageMetadata) {
    return canonicalizeUsage(toOpenAIUsage(usageMetadata, "gemini"));
  }

  return null;
}

export function buildRequestDetail(base, overrides = {}) {
  return {
    provider: base.provider || "unknown",
    model: base.model || "unknown",
    connectionId: base.connectionId || undefined,
    timestamp: new Date().toISOString(),
    latency: base.latency || { ttft: 0, total: 0 },
    tokens: base.tokens || { prompt_tokens: 0, completion_tokens: 0 },
    request: base.request,
    providerRequest: base.providerRequest || null,
    providerResponse: base.providerResponse || null,
    response: base.response || {},
    pxpipe: base.pxpipe || undefined,
    status: base.status || "success",
    ...overrides
  };
}

// Build the "done" summary: duration, ttft, in/out tokens with cache breakdown
export function formatDoneLine({ usage, latency }) {
  const u = usage || {};
  const inTok = u.prompt_tokens ?? u.input_tokens ?? 0;
  const outTok = u.completion_tokens ?? u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? u.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheCreate = u.cache_creation_input_tokens ?? 0;
  let inStr = `IN ${inTok}`;
  if (cacheRead || cacheCreate) {
    const parts = [];
    if (cacheRead) parts.push(`↻${cacheRead}`);
    if (cacheCreate) parts.push(`+${cacheCreate}`);
    inStr += ` (CACHE ${parts.join(" ")})`;
  }
  const ttftStr = latency?.ttft ? ` · TTFT ${latency.ttft}ms` : "";
  return `DONE ${latency?.total ?? 0}ms${ttftStr} · ${inStr} · OUT ${outTok}`;
}

export function saveUsageStats({ provider, model, tokens, connectionId, apiKey, endpoint, latency = null, label = "USAGE", silent = false }) {
  if (!tokens || typeof tokens !== "object") return;

  const inTokens = tokens.input_tokens ?? tokens.prompt_tokens ?? 0;
  const outTokens = tokens.output_tokens ?? tokens.completion_tokens ?? 0;

  if (inTokens === 0 && outTokens === 0) return;

  if (!silent) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const accountSuffix = connectionId ? ` | account=${connectionId.slice(0, 8)}...` : "";
    console.log(`${COLORS.green}[${time}] 📊 [${label}] ${provider.toUpperCase()} | in=${inTokens} | out=${outTokens}${accountSuffix}${COLORS.reset}`);
  }

  // Canonicalize to one storage convention (prompt_tokens cache-inclusive) so
  // cached/cache-creation tokens survive to cost calc + stats. See canonicalizeUsage.
  const normalized = canonicalizeUsage(tokens) || {
    prompt_tokens: tokens.prompt_tokens ?? tokens.input_tokens ?? 0,
    completion_tokens: tokens.completion_tokens ?? tokens.output_tokens ?? 0
  };

  saveRequestUsage({
    provider: provider || "unknown",
    model: model || "unknown",
    tokens: normalized,
    timestamp: new Date().toISOString(),
    connectionId: connectionId || undefined,
    apiKey: apiKey || undefined,
    endpoint: endpoint || null,
    // Optional. Persisted as ttftMs/totalMs so latency becomes queryable instead
    // of existing only as a log line. Omitted callers leave both columns NULL.
    ...(latency ? { latency } : {}),
  }).catch(() => {});
}
