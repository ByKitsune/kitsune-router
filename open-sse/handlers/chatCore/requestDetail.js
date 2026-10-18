import { saveRequestUsage } from "@/lib/usageDb.js";
import { COLORS } from "../../utils/stream.js";
import { canonicalizeUsage, extractUsage } from "../../utils/usageTracking.js";
import { getServiceTierAccounting } from "../../providers/serviceTiers.js";

const OPTIONAL_PARAMS = [
  "temperature", "top_p", "top_k",
  "max_tokens", "max_completion_tokens", "max_output_tokens",
  "reasoning_effort", "generationConfig",
  "thinking", "reasoning", "enable_thinking",
  "presence_penalty", "frequency_penalty",
  "seed", "stop", "tools", "tool_choice",
  "response_format", "prediction", "store", "metadata",
  "n", "logprobs", "top_logprobs", "logit_bias",
  "user", "parallel_tool_calls", "service_tier"
];

export function extractRequestConfig(body, stream) {
  const config = { messages: body.messages || [], model: body.model, stream };
  for (const param of OPTIONAL_PARAMS) {
    if (body[param] !== undefined) config[param] = body[param];
  }
  return config;
}

export function extractUsageFromResponse(responseBody) {
  return canonicalizeUsage(extractUsage(responseBody));
}

export function buildRequestDetail(base, overrides = {}) {
  const serviceTier = getServiceTierAccounting(base.provider, base.serviceTier || { requestedServiceTier: base.request?.service_tier }, base.providerResponse);
  const tokens = base.tokens || { prompt_tokens: 0, completion_tokens: 0 };
  return {
    provider: base.provider || "unknown",
    model: base.model || "unknown",
    connectionId: base.connectionId || undefined,
    timestamp: new Date().toISOString(),
    latency: base.latency || { ttft: 0, total: 0 },
    // requestDetails intentionally drops unallowlisted top-level metadata and
    // redacts request/response bodies. Its token JSON retains tier provenance.
    tokens: serviceTier ? { ...tokens, ...serviceTier } : tokens,
    request: base.request,
    providerRequest: base.providerRequest || null,
    providerResponse: base.providerResponse || null,
    response: base.response || {},
    pxpipe: base.pxpipe || undefined,
    ...serviceTier,
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

export function saveUsageStats({ provider, model, tokens, connectionId, apiKey, endpoint, latency = null, label = "USAGE", silent = false, serviceTier = null }) {
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
  // usageHistory persists tokens as JSON, unlike arbitrary top-level fields.
  // Keep the tier provenance there so billing never loses it at the DB boundary.
  Object.assign(normalized, getServiceTierAccounting(provider, serviceTier));

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
