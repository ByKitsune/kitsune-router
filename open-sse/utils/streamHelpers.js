import { FORMATS } from "../translator/formats.js";
import { extractReasoningText } from "../translator/concerns/reasoning.js";
import { CLAUDE_BLOCK, RESPONSES_ITEM } from "../translator/schema/index.js";

export function parseSSELine(line, format = null) {
  if (!line) return null;
  const raw = line.trim();
  const ndjson = (format === null || format === FORMATS.OLLAMA) && raw.startsWith("{");
  if (!ndjson && line !== "data" && !line.startsWith("data:")) return null;
  const data = ndjson ? raw : line === "data" ? "" : line.slice(5).replace(/^ /, "");
  if (data.trim() === "[DONE]") return { done: true };
  try { return JSON.parse(data); } catch { return null; }
}

// Check if chunk has valuable content (not empty)
export function hasValuableContent(chunk, format) {
  if (!chunk) return false;
  if (chunk.usage || chunk.error || chunk.response?.usage) return true;
  if (format === FORMATS.OPENAI && Array.isArray(chunk.choices)) {
    return chunk.choices.some(choice => {
      const delta = choice?.delta || {};
      return Boolean(
        delta.content || delta.refusal || extractReasoningText(delta) ||
        delta.tool_calls?.length || delta.images?.length || delta.audio ||
        choice?.finish_reason || delta.role ||
        Object.keys(delta).some(key => !["reasoning_details", "provider_specific_fields", "content", "reasoning", "reasoning_content", "tool_calls", "images"].includes(key))
      );
    });
  }

  // Claude format
  if (format === FORMATS.CLAUDE) {
    const isContentBlockDelta = chunk.type === "content_block_delta";
    const hasText = chunk.delta?.text && chunk.delta.text !== "";
    const hasThinking = chunk.delta?.thinking && chunk.delta.thinking !== "";
    const hasInputJson = chunk.delta?.partial_json && chunk.delta.partial_json !== "";
    const hasSignature = typeof chunk.delta?.signature === "string" && chunk.delta.signature !== "";
    
    if (isContentBlockDelta && !hasText && !hasThinking && !hasInputJson && !hasSignature &&
        !Object.keys(chunk.delta || {}).some(key => !["type", "text", "thinking", "partial_json", "signature"].includes(key))) {
      return false;
    }
    return true;
  }

  return true; // Other formats: keep all chunks
}

// Only generated deltas count as TTFT, unlike role/finish/usage protocol frames.
const RESPONSES_TOKEN_DELTAS = new Set([
  "response.output_text.delta",
  "response.reasoning_summary_text.delta",
  "response.reasoning_text.delta",
  "response.function_call_arguments.delta",
  "response.custom_tool_call_input.delta",
]);

const nonEmptyText = (value) => typeof value === "string" && value.length > 0;

export function hasSemanticContent(chunk, eventName = null) {
  if (!chunk || chunk.error || chunk.response?.error) return false;
  if (Array.isArray(chunk.choices) && chunk.choices.some((choice) => {
    const delta = choice?.delta;
    return nonEmptyText(delta?.content) || Boolean(extractReasoningText(delta)) ||
      (Array.isArray(delta?.tool_calls) && delta.tool_calls.some((call) => nonEmptyText(call?.function?.name) || nonEmptyText(call?.function?.arguments)));
  })) return true;

  if (chunk.type === "content_block_delta" &&
      (nonEmptyText(chunk.delta?.text) || nonEmptyText(chunk.delta?.thinking) || nonEmptyText(chunk.delta?.partial_json))) return true;
  if (chunk.content_block?.type === CLAUDE_BLOCK.TOOL_USE && nonEmptyText(chunk.content_block.name)) return true;

  const parts = (chunk.candidates || chunk.response?.candidates)?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.some((part) => nonEmptyText(part?.text) || nonEmptyText(part?.functionCall?.name))) return true;
  if (nonEmptyText(chunk.message?.content) || nonEmptyText(chunk.message?.thinking)) return true;

  const type = eventName || chunk.type || chunk.event;
  if (type === "response.output_item.added" &&
      (chunk.item?.type === RESPONSES_ITEM.FUNCTION_CALL || chunk.item?.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL) &&
      nonEmptyText(chunk.item.name)) return true;
  return RESPONSES_TOKEN_DELTAS.has(type) && nonEmptyText(chunk.delta);
}

// Client route identity is independent of the model/version sent upstream.
// A stream owns one Chat ID, including usage trailers and synthesized terminals.
export function normalizeResponseIdentity(value, requestedModel = null, state = {}) {
  if (!value || typeof value !== "object") return false;
  const payload = value.data && typeof value.data === "object" ? value.data : value;
  if (payload.error && !payload.response) return false;
  let changed = false;
  const set = (target, field, content) => {
    if (target[field] === content) return;
    target[field] = content;
    changed = true;
  };
  if (Array.isArray(payload.choices)) {
    if (!state.chatId) {
      const id = typeof payload.id === "string" ? payload.id : "";
      const usable = id.length >= 8 && !["chat", "completion"].includes(id);
      state.chatId = usable && id.startsWith("chatcmpl-") ? id
        : `chatcmpl-${usable ? id.replace(/^resp_/, "") : crypto.randomUUID()}`;
    }
    set(payload, "id", state.chatId);
    if (typeof requestedModel === "string" && requestedModel) set(payload, "model", requestedModel);
  } else if (typeof requestedModel === "string" && requestedModel) {
    const response = payload.response || payload.message || payload;
    if (response.object === "response" || response.type === "message" || (payload.response && typeof payload.type === "string" && payload.type.startsWith("response.")) || payload.type === "message_start") {
      set(response, "model", requestedModel);
    }
  }
  return changed;
}

function cleanUsagePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  let cleaned = payload;

  if ("usage" in cleaned) {
    if (cleaned.usage === null) {
      const { usage, ...payloadWithoutUsage } = cleaned;
      cleaned = payloadWithoutUsage;
    } else if (typeof cleaned.usage === "object" && cleaned.usage.perf_metrics === null) {
      const { perf_metrics, ...usageWithoutPerf } = cleaned.usage;
      cleaned = { ...cleaned, usage: usageWithoutPerf };
    }
  }

  if (cleaned.response && typeof cleaned.response === "object" && !Array.isArray(cleaned.response)) {
    const cleanedResponse = cleanUsagePayload(cleaned.response);
    if (cleanedResponse !== cleaned.response) {
      cleaned = { ...cleaned, response: cleanedResponse };
    }
  }

  return cleaned;
}

// Format output as SSE
export function formatSSE(data, sourceFormat) {
  if (data === null || data === undefined) return "data: null\n\n";
  if (data?.done === true && Object.keys(data).length === 1) return "data: [DONE]\n\n";

  // OpenAI Responses API format
  if (data && data.event && data.data) {
    const cleanedEventData = cleanUsagePayload(data.data);
    return `event: ${data.event}\ndata: ${JSON.stringify(cleanedEventData)}\n\n`;
  }

  data = cleanUsagePayload(data);

  // Claude format
  if (sourceFormat === FORMATS.CLAUDE && data && data.type) {
    return `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  return `data: ${JSON.stringify(data)}\n\n`;
}
