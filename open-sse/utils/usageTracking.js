/**
 * Token Usage Tracking - Extract, normalize, estimate and log token usage
 */

import { FORMATS } from "../translator/formats.js";
import { getCacheCreationUsage, getOpenAICacheWriteUsage, toOpenAIUsage } from "../translator/concerns/usage.js";
import { OPENAI_BLOCK, CLAUDE_BLOCK, RESPONSES_ITEM } from "../translator/schema/index.js";

// Legacy per-chunk usage console line; off by default (superseded by "📊 done")
const DEBUG_USAGE = process.env.LOG_USAGE_VERBOSE === "1";

// ANSI color codes
export const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

// Buffer tokens to prevent context errors
const BUFFER_TOKENS = 2000;

// Get HH:MM:SS timestamp
function getTimeString() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Add buffer tokens to usage to prevent context errors
 * @param {object} usage - Usage object (any format)
 * @returns {object} Usage with buffer added
 */
export function addBufferToUsage(usage) {
  if (!usage || typeof usage !== "object") return usage;

  const result = { ...usage };

  // Claude format
  if (result.input_tokens !== undefined) {
    result.input_tokens += BUFFER_TOKENS;
  }

  // OpenAI format
  if (result.prompt_tokens !== undefined) {
    result.prompt_tokens += BUFFER_TOKENS;
  }

  // Calculate or update total_tokens
  if (result.total_tokens !== undefined) {
    result.total_tokens += BUFFER_TOKENS;
  } else if (result.prompt_tokens !== undefined && result.completion_tokens !== undefined) {
    // Calculate total_tokens if not exists
    result.total_tokens = result.prompt_tokens + result.completion_tokens;
  }

  return result;
}

export function filterUsageForFormat(usage, targetFormat) {
  if (!usage || typeof usage !== "object") return usage;

  // Helper to pick only defined fields from usage
  const pickFields = (fields) => {
    const filtered = {};
    for (const field of fields) {
      if (usage[field] !== undefined) {
        filtered[field] = usage[field];
      }
    }
    return filtered;
  };

  // Define allowed fields for each format
  const formatFields = {
    [FORMATS.CLAUDE]: [
      'input_tokens', 'output_tokens', 
      'cache_read_input_tokens', 'cache_creation_input_tokens', 'cache_creation',
      'estimated'
    ],
    [FORMATS.GEMINI]: [
      'promptTokenCount', 'candidatesTokenCount', 'totalTokenCount',
      'cachedContentTokenCount', 'thoughtsTokenCount',
      'estimated'
    ],
    [FORMATS.OPENAI_RESPONSES]: [
      'input_tokens', 'output_tokens', 'total_tokens',
      'input_tokens_details', 'output_tokens_details',
      'cache_write_invalid', 'estimated'
    ],
    // OpenAI format (default for OPENAI, CODEX, KIRO, etc.)
    default: [
      'prompt_tokens', 'completion_tokens', 'total_tokens',
      'cached_tokens', 'reasoning_tokens',
      'prompt_tokens_details', 'completion_tokens_details',
      'cache_write_invalid', 'estimated'
    ]
  };

  // Get fields for target format
  let fields = formatFields[targetFormat];
  
  // Use same fields for similar formats
  if (targetFormat === FORMATS.GEMINI_CLI || targetFormat === FORMATS.ANTIGRAVITY) {
    fields = formatFields[FORMATS.GEMINI];
  } else if (targetFormat === FORMATS.OPENAI_RESPONSE) {
    fields = formatFields[FORMATS.OPENAI_RESPONSES];
  } else if (!fields) {
    fields = formatFields.default;
  }

  const filtered = pickFields(fields);
  // Claude's native cache counters are separate from input_tokens. OpenAI
  // clients receive those counters as details, without replacing their own split.
  if (fields === formatFields.default) {
    const cacheRead = usage.cache_read_input_tokens;
    const creation = getCacheCreationUsage(usage);
    const cacheCreation = creation?.total;
    if (cacheRead > 0 || creation) {
      const details = { ...(filtered.prompt_tokens_details || {}) };
      if (cacheRead > 0 && details.cached_tokens === undefined) details.cached_tokens = cacheRead;
      if (cacheCreation > 0 && details.cache_creation_tokens === undefined) details.cache_creation_tokens = cacheCreation;
      if (creation?.fiveMinute !== undefined && details.cache_creation_5m_tokens === undefined) details.cache_creation_5m_tokens = creation.fiveMinute;
      if (creation?.oneHour !== undefined && details.cache_creation_1h_tokens === undefined) details.cache_creation_1h_tokens = creation.oneHour;
      filtered.prompt_tokens_details = details;
    }
  }
  if (fields === formatFields.default || fields === formatFields[FORMATS.OPENAI_RESPONSES]) {
    const writes = getOpenAICacheWriteUsage(usage);
    if (writes) {
      const key = fields === formatFields.default ? "prompt_tokens_details" : "input_tokens_details";
      const details = { ...(filtered[key] || {}) };
      details.cache_write_tokens = writes.total;
      if (writes.thirtyMinute !== undefined || writes.twelveHour !== undefined) {
        details.cache_write_tokens_details = {
          ...(writes.thirtyMinute === undefined ? {} : { ttl_30m_tokens: writes.thirtyMinute }),
          ...(writes.twelveHour === undefined ? {} : { ttl_12h_tokens: writes.twelveHour }),
        };
      }
      filtered[key] = details;
      if (writes.invalid) filtered.cache_write_invalid = true;
    }
  }
  return filtered;
}

function preserveOpenAICacheWrites(result, raw) {
  const writes = getOpenAICacheWriteUsage(raw);
  if (!writes) return null;
  result.cache_write_tokens = writes.total;
  if (writes.thirtyMinute !== undefined) result.cache_write_30m_tokens = writes.thirtyMinute;
  if (writes.twelveHour !== undefined) result.cache_write_12h_tokens = writes.twelveHour;
  if (writes.invalid) result.cache_write_invalid = true;
  return writes;
}

/**
 * Normalize usage object - ensure all values are valid numbers
 */
export function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;

  const normalized = {};
  const assignNumber = (key, value) => {
    if (value === undefined || value === null) return;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) normalized[key] = numeric;
  };

  assignNumber("prompt_tokens", usage?.prompt_tokens ?? usage?.input_tokens);
  assignNumber("completion_tokens", usage?.completion_tokens ?? usage?.output_tokens);
  assignNumber("total_tokens", usage?.total_tokens);
  assignNumber("cache_read_input_tokens", usage?.cache_read_input_tokens);
  assignNumber("cache_creation_input_tokens", usage?.cache_creation_input_tokens);
  const creation = getCacheCreationUsage(usage);
  if (creation) {
    if (usage.cache_creation !== undefined) assignNumber("cache_creation_input_tokens", creation.total);
    assignNumber("cache_creation_5m_tokens", creation.fiveMinute);
    assignNumber("cache_creation_1h_tokens", creation.oneHour);
  }
  assignNumber("cached_tokens", usage?.cached_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? usage?.input_tokens_details?.cached_tokens ?? usage?.prompt_cache_hit_tokens);
  assignNumber("reasoning_tokens", usage?.reasoning_tokens ?? usage?.completion_tokens_details?.reasoning_tokens ?? usage?.output_tokens_details?.reasoning_tokens);
  assignNumber("prompt_cache_hit_tokens", usage?.prompt_cache_hit_tokens);
  assignNumber("prompt_cache_miss_tokens", usage?.prompt_cache_miss_tokens);
  preserveOpenAICacheWrites(normalized, usage);

  // Preserve nested details objects for OpenAI format forwarding
  if (usage?.prompt_tokens_details && typeof usage.prompt_tokens_details === "object") {
    normalized.prompt_tokens_details = usage.prompt_tokens_details;
  } else if (usage?.input_tokens_details && typeof usage.input_tokens_details === "object") {
    normalized.prompt_tokens_details = usage.input_tokens_details;
  }
  if (usage?.completion_tokens_details && typeof usage.completion_tokens_details === "object") {
    normalized.completion_tokens_details = usage.completion_tokens_details;
  } else if (usage?.output_tokens_details?.reasoning_tokens !== undefined) {
    normalized.completion_tokens_details = { reasoning_tokens: Number(usage.output_tokens_details.reasoning_tokens) || 0 };
  }
  if (Object.keys(normalized).length === 0) return null;
  return normalized;
}

/**
 * Canonicalize usage into ONE storage/cost convention so token counts and cost
 * are consistent across providers:
 *   prompt_tokens               = total input INCLUDING cache read + cache creation
 *   cached_tokens               = cache-read portion (subset of prompt_tokens)
 *   cache_creation_input_tokens = legacy/Anthropic writes (subset of prompt_tokens)
 *   cache_write_tokens, cache_write_30m_tokens, cache_write_12h_tokens = OpenAI writes
 *   completion_tokens, reasoning_tokens, total_tokens
 *
 * Discriminator: Claude reports cache_read_input_tokens with a prompt that
 * EXCLUDES cache, so we fold cache into prompt. OpenAI/Gemini report
 * cached_tokens already counted inside prompt, so we pass through. Idempotent:
 * once folded the output carries cached_tokens (not cache_read_input_tokens),
 * so re-running takes the passthrough branch and does not double-add.
 *
 * @param {object} usage - a normalizeUsage()-shaped object
 * @returns {object|null} canonical token object, or null for invalid input
 */
export function canonicalizeUsage(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const completion = num(usage.completion_tokens ?? usage.output_tokens);
  const reasoning = num(
    usage.reasoning_tokens ??
    usage.completion_tokens_details?.reasoning_tokens ??
    usage.output_tokens_details?.reasoning_tokens
  );
  // Fall back to the nested prompt_tokens_details.cache_creation_tokens shape
  // (buildUsage()'s OpenAI-forwarding format) when the top-level field is
  // absent, so callers that pass a buildUsage() object through don't silently
  // drop cache_creation.
  const creation = getCacheCreationUsage(usage);
  const cacheCreation = creation?.total || 0;
  const writes = getOpenAICacheWriteUsage(usage);

  let prompt = num(usage.prompt_tokens ?? usage.input_tokens);
  let cached;

  // Claude path: prompt excludes cache; cache_read_input_tokens and/or
  // cache_creation_input_tokens are separate. A cache-miss "first write" only
  // carries cache_creation_input_tokens (no cache_read_input_tokens yet), so
  // check both fields — otherwise a first-write request falls through to the
  // OpenAI passthrough branch below and cache_creation never gets folded in.
  // Guard on the absence of `cached_tokens`: our own canonical output always
  // sets that key (even to 0), so re-running canonicalizeUsage on an already-
  // folded result takes the passthrough branch instead of folding again.
  if (!writes && usage.cached_tokens === undefined &&
      (usage.cache_read_input_tokens !== undefined || usage.cache_creation_input_tokens !== undefined || usage.cache_creation !== undefined)) {
    cached = num(usage.cache_read_input_tokens);
    prompt = prompt + cached + cacheCreation;
  } else {
    // OpenAI/Gemini path (or already-canonical input): prompt already includes cached_tokens.
    // Mirror the cacheCreation fallback above: buildUsage() only ever emits the
    // nested prompt_tokens_details.cached_tokens shape, so without this the
    // cache-read count is silently dropped on every buildUsage()-derived usage.
    cached = num(
      usage.cached_tokens ??
      usage.prompt_tokens_details?.cached_tokens ??
      usage.input_tokens_details?.cached_tokens ??
      usage.prompt_cache_hit_tokens
    );
  }

  const result = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    // Recompute rather than pass through: when the fold branch ran above,
    // an upstream total_tokens (cache-exclusive) would otherwise be stale.
    total_tokens: prompt + completion,
    cached_tokens: cached,
    cache_creation_input_tokens: cacheCreation,
  };
  if (creation?.fiveMinute !== undefined) result.cache_creation_5m_tokens = creation.fiveMinute;
  if (creation?.oneHour !== undefined) result.cache_creation_1h_tokens = creation.oneHour;
  preserveOpenAICacheWrites(result, usage);
  if (reasoning > 0) result.reasoning_tokens = reasoning;
  return result;
}

/**
 * Check if usage has valid token data
 * Valid = has at least one token field with value > 0
 * Invalid = empty object {}, null, undefined, no token fields, or all zeros
 */
export function hasValidUsage(usage) {
  if (!usage || typeof usage !== "object") return false;

  // Check for any known token field with value > 0
  const tokenFields = [
    "prompt_tokens", "completion_tokens", "total_tokens",  // OpenAI
    "input_tokens", "output_tokens",                        // Claude
    "promptTokenCount", "candidatesTokenCount"              // Gemini
  ];

  for (const field of tokenFields) {
    if (typeof usage[field] === "number" && usage[field] > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Extract usage from any format (Claude, OpenAI, Gemini, Responses API)
 */
export function extractUsage(chunk) {
  if (!chunk || typeof chunk !== "object") return null;

  // Claude format (message_start event): carries input_tokens + cache_read +
  // cache_creation. message_delta later carries only the final output_tokens,
  // so callers must MERGE (mergeUsage), not overwrite, to keep cache counts.
  if (chunk.type === "message_start" && chunk.message?.usage && typeof chunk.message.usage === "object") {
    const u = chunk.message.usage;
    return normalizeUsage({ ...u, prompt_tokens: u.input_tokens || 0, completion_tokens: u.output_tokens || 0 });
  }

  // Claude format (message_delta event)
  if (chunk.type === "message_delta" && chunk.usage && typeof chunk.usage === "object") {
    return normalizeUsage({ ...chunk.usage, prompt_tokens: chunk.usage.input_tokens, completion_tokens: chunk.usage.output_tokens });
  }

  // Usage belongs to the attempt, including incomplete and failed terminals.
  if (chunk.response?.usage && typeof chunk.response.usage === "object") {
    return normalizeUsage(chunk.response.usage);
  }

  // OpenAI format (also covers DeepSeek which uses prompt_cache_hit_tokens)
  if (chunk.usage && typeof chunk.usage === "object" && (chunk.usage.prompt_tokens !== undefined || chunk.usage.input_tokens !== undefined)) {
    const cachedTokens = chunk.usage.cached_tokens
      ?? chunk.usage.prompt_tokens_details?.cached_tokens
      ?? chunk.usage.input_tokens_details?.cached_tokens
      ?? chunk.usage.prompt_cache_hit_tokens;
    const reasoningTokens = chunk.usage.reasoning_tokens
      ?? chunk.usage.completion_tokens_details?.reasoning_tokens
      ?? chunk.usage.output_tokens_details?.reasoning_tokens;

    return normalizeUsage({
      ...chunk.usage,
      prompt_tokens: chunk.usage.prompt_tokens ?? chunk.usage.input_tokens ?? 0,
      completion_tokens: chunk.usage.completion_tokens ?? chunk.usage.output_tokens ?? 0,
      cached_tokens: cachedTokens,
      reasoning_tokens: reasoningTokens,
      prompt_tokens_details: chunk.usage.prompt_tokens_details ?? chunk.usage.input_tokens_details ?? (cachedTokens !== undefined ? { cached_tokens: cachedTokens } : undefined),
      completion_tokens_details: chunk.usage.completion_tokens_details ?? (reasoningTokens !== undefined ? { reasoning_tokens: reasoningTokens } : undefined),
      total_tokens: chunk.usage.total_tokens
    });
  }

  // Gemini format (Antigravity)
  // Antigravity wraps usageMetadata inside response: { response: { usageMetadata: {...} } }
  const usageMeta = chunk.usageMetadata || chunk.response?.usageMetadata;
  if (usageMeta && typeof usageMeta === "object") {
    return normalizeUsage(toOpenAIUsage(usageMeta, "gemini"));
  }

  // Ollama NDJSON format (raw from provider, before translation)
  // Ollama sends: {"model":"...","done":true,"prompt_eval_count":N,"eval_count":M}
  if (chunk.done === true && typeof chunk.prompt_eval_count === "number") {
    return normalizeUsage({
      prompt_tokens: chunk.prompt_eval_count || 0,
      completion_tokens: chunk.eval_count || 0,
      total_tokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0)
    });
  }

  return null;
}

// Field-wise max-merge of two usage objects. Anthropic splits usage across
// events: message_start has real input+cache (output is a placeholder 1),
// message_delta has the real cumulative output (input/cache absent). Max keeps
// the meaningful value from each without clobbering. Idempotent for other
// providers that emit a single complete usage object.
export function mergeUsage(prev, next) {
  if (!prev) return next || null;
  if (!next) return prev;
  const merged = { ...prev };
  for (const [k, v] of Object.entries(next)) {
    if (k === "cache_write_invalid") {
      if (v === true) merged[k] = true;
    } else if (v === null && ["cache_write_tokens", "cache_write_30m_tokens", "cache_write_12h_tokens", "ttl_30m_tokens", "ttl_12h_tokens"].includes(k)) {
      merged[k] = null;
      // Preserve unknown native counts; never coerce them to a real zero.
    } else if (typeof v === "number" && Number.isFinite(v)) {
      // typeof NaN === "number" — guard so a malformed chunk cannot poison max.
      merged[k] = Math.max(typeof merged[k] === "number" ? merged[k] : 0, v);
    } else if (v && typeof v === "object") {
      merged[k] = Array.isArray(v) ? v : mergeUsage(merged[k], v);
    }
  }
  return merged;
}

const ENCODED_MEDIA_TYPES = new Set([
  OPENAI_BLOCK.IMAGE_URL, OPENAI_BLOCK.IMAGE, OPENAI_BLOCK.FILE,
  OPENAI_BLOCK.INPUT_AUDIO, OPENAI_BLOCK.AUDIO_URL, OPENAI_BLOCK.INPUT_VIDEO, OPENAI_BLOCK.VIDEO_URL,
  CLAUDE_BLOCK.DOCUMENT, RESPONSES_ITEM.INPUT_IMAGE, RESPONSES_ITEM.INPUT_FILE,
]);
const LITERAL_JSON_FIELDS = new Set([
  "tools", "parameters", "input_schema", "args", "arguments", "json", "response",
  "schema", "responseSchema", "responseJsonSchema",
]);
const PAYLOAD_FIELDS = ["data", "bytes", "url", "file_data", "fileUri", "file_uri", "image_url", "image"];
const MEDIA_CONTAINERS = [
  "source", "file", "image_url", "audio_url", "video_url", "input_audio", "input_video",
  "inlineData", "inline_data", "fileData", "file_data",
];

function withoutEncodedPayload(object) {
  let result = object;
  for (const key of PAYLOAD_FIELDS) {
    if (typeof object[key] !== "string" || object[key].length === 0) continue;
    if (result === object) result = { ...object };
    result[key] = "";
  }
  return result;
}

function stringifyTextEstimate(body) {
  const literal = new WeakSet();
  return JSON.stringify(body, function (key, value) {
    if (!value || typeof value !== "object") return value;
    const toolInput = key === "input" && (this.type === CLAUDE_BLOCK.TOOL_USE ||
      this.type === CLAUDE_BLOCK.SERVER_TOOL_USE || this.toolUseId !== undefined);
    if (literal.has(this) || LITERAL_JSON_FIELDS.has(key) || toolInput) {
      literal.add(value);
      return value;
    }
    if (value.type === CLAUDE_BLOCK.DOCUMENT && value.source?.type === "text") return value;
    if (!ENCODED_MEDIA_TYPES.has(value.type) && !value.inlineData && !value.inline_data &&
        !value.fileData && !value.file_data && !(value.format && value.source?.bytes)) return value;
    let result = withoutEncodedPayload(value);
    for (const field of MEDIA_CONTAINERS) {
      const nested = value[field];
      if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
      const projected = withoutEncodedPayload(nested);
      if (projected === nested) continue;
      if (result === value) result = { ...value };
      result[field] = projected;
    }
    return result;
  });
}

/**
 * Estimate input tokens from request body
 * Encoded media transport bytes are not text tokens; visual/audio costs remain unmeasured.
 */
export function estimateInputTokens(body) {
  if (!body || typeof body !== "object") return 0;

  try {
    // Keep the existing text/structure approximation, not base64 file length.
    const bodyStr = stringifyTextEstimate(body);
    const totalChars = bodyStr.length;

    // Estimate: ~4 chars per token (rough average across all tokenizers)
    return Math.ceil(totalChars / 4);
  } catch (err) {
    // Fallback if stringify fails
    return 0;
  }
}

/**
 * Estimate output tokens from content length
 */
export function estimateOutputTokens(contentLength) {
  if (!contentLength || contentLength <= 0) return 0;
  return Math.max(1, Math.floor(contentLength / 4));
}

/**
 * Format usage object based on target format
 * @param {number} inputTokens - Input/prompt tokens
 * @param {number} outputTokens - Output/completion tokens
 * @param {string} targetFormat - Target format from FORMATS
 */
export function formatUsage(inputTokens, outputTokens, targetFormat) {
  // Claude format uses input_tokens/output_tokens
  if (targetFormat === FORMATS.CLAUDE) {
    return addBufferToUsage({ 
      input_tokens: inputTokens, 
      output_tokens: outputTokens, 
      estimated: true 
    });
  }

  // Default: OpenAI format (works for openai, gemini, responses, etc.)
  return addBufferToUsage({
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    estimated: true
  });
}

/**
 * Estimate full usage when provider doesn't return it
 * @param {object} body - Request body for input token estimation
 * @param {number} contentLength - Content length for output token estimation
 * @param {string} targetFormat - Target format from FORMATS constant
 */
export function estimateUsage(body, contentLength, targetFormat = FORMATS.OPENAI) {
  return formatUsage(
    estimateInputTokens(body),
    estimateOutputTokens(contentLength),
    targetFormat
  );
}

/**
 * Log usage with cache info (green color)
 */
export function logUsage(provider, usage, model = null, connectionId = null, apiKey = null) {
  if (!usage || typeof usage !== "object") return;

  // Console output moved to the unified "📊 done" line (streamingHandler). Kept as
  // a no-op hook so callers stay unchanged; usage persistence happens via saveUsageStats.
  if (!DEBUG_USAGE) return;

  const p = provider?.toUpperCase() || "UNKNOWN";

  // Support both formats:
  // - OpenAI: prompt_tokens, completion_tokens
  // - Claude: input_tokens, output_tokens
  const inTokens = usage?.prompt_tokens || usage?.input_tokens || 0;
  const outTokens = usage?.completion_tokens || usage?.output_tokens || 0;
  const accountPrefix = connectionId ? connectionId.slice(0, 8) + "..." : "unknown";

  let msg = `[${getTimeString()}] 📊 ${COLORS.green}[USAGE] ${p} | in=${inTokens} | out=${outTokens} | account=${accountPrefix}${COLORS.reset}`;

  // Add estimated flag if present
  if (usage.estimated) {
    msg += ` ${COLORS.yellow}(estimated)${COLORS.reset}`;
  }

  // Add cache info if present (unified from different formats)
  const cacheRead = usage.cache_read_input_tokens || usage.cached_tokens || usage.prompt_tokens_details?.cached_tokens;
  if (cacheRead) msg += ` | cache_read=${cacheRead}`;

  const cacheCreation = usage.cache_creation_input_tokens;
  if (cacheCreation) msg += ` | cache_create=${cacheCreation}`;

  const reasoning = usage.reasoning_tokens;
  if (reasoning) msg += ` | reasoning=${reasoning}`;

  console.log(msg);
}
