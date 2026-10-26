import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { GEMINI_ROLE } from "../schema/index.js";
import { extractReasoningText } from "../concerns/reasoning.js";
import { toGeminiUsage } from "../concerns/usage.js";
import { fromOpenAIFinish } from "../concerns/finishReason.js";
import { splitToolCallId } from "../concerns/thoughtSignature.js";
import { normalizeMediaPart } from "../concerns/multimodal.js";
import { parseDataUri } from "../concerns/image.js";

export function openAIImagesToGeminiParts(images) {
  const parts = [];
  for (const image of images || []) {
    const normalized = normalizeMediaPart(image);
    const url = normalized?.image_url?.url;
    if (!url) continue;
    const thoughtSignature = image.extra_content?.google?.thought_signature;
    const signature = typeof thoughtSignature === "string" && thoughtSignature ? { thoughtSignature } : {};
    const parsed = parseDataUri(url);
    if (parsed?.mimeType.toLowerCase().startsWith("image/")) {
      parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 }, ...signature });
    } else if (/^https?:\/\//i.test(url)) {
      const mimeType = normalized.image_url.mime_type || normalized.image_url.mimeType;
      parts.push({ fileData: { fileUri: url, ...(mimeType ? { mimeType } : {}) }, ...signature });
    }
  }
  return parts;
}

export function openAIToolCallToGeminiPart(call, toolNameMap = null) {
  const fn = call.function || {};
  let args = fn.arguments || {};
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch { args = {}; }
  }
  const { rawId, thoughtSignature } = splitToolCallId(call.id);
  const id = thoughtSignature ? rawId : call.id;
  return { functionCall: { ...(id ? { id } : {}),
    name: toolNameMap?.get(fn.name) || fn.name || call.name || "", args },
    ...(thoughtSignature ? { thoughtSignature } : {}) };
}

// Convert OpenAI SSE chunk to Antigravity SSE format
// Real Antigravity format:
//   data: {"response":{"candidates":[{"content":{"role":"model","parts":[...]}, "finishReason":"STOP"}], "usageMetadata":{...}, "modelVersion":"...", "responseId":"..."}}
// Tool calls: OpenAI sends incremental args across chunks → accumulate and emit ONCE at finish
export function openaiToAntigravityResponse(chunk, state) {
  const flushing = !chunk;
  if (!chunk) {
    if (!state._geminiFinishPending || state._geminiTerminalEmitted) return null;
    chunk = { choices: [{ delta: {}, finish_reason: state._geminiFinishPending }], usage: state._usage };
  }
  if (chunk.usage) state._usage = chunk.usage;
  const choice = chunk.choices?.[0];
  if (!choice) return state._geminiFinishPending ? openaiToAntigravityResponse(null, state) : null;
  if (state._geminiTerminalEmitted) return null;

  const delta = choice.delta || {};
  let finishReason = choice.finish_reason;
  const completeUsage = typeof chunk.usage?.prompt_tokens === "number" && typeof chunk.usage?.completion_tokens === "number";
  if (finishReason && !flushing && !completeUsage) {
    state._geminiFinishPending = finishReason;
    finishReason = null;
  }

  // Init state
  if (!state._toolCallAccum) state._toolCallAccum = {};
  if (!state._responseId) state._responseId = chunk.id || `resp_${Date.now()}`;
  if (!state._modelVersion) state._modelVersion = chunk.model || "";

  const parts = [];

  // Thinking/reasoning → thought part
  const reasoning = extractReasoningText(delta);
  if (reasoning) {
    parts.push({ thought: true, text: reasoning });
  }

  // Text content
  if (delta.content) {
    parts.push({ text: delta.content });
  }
  if (typeof delta.refusal === "string" && delta.refusal) parts.push({ text: delta.refusal });
  parts.push(...openAIImagesToGeminiParts(delta.images));

  // Accumulate tool calls silently (no emit until finish)
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      if (!state._toolCallAccum[idx]) {
        state._toolCallAccum[idx] = { id: "", name: "", arguments: [] };
      }
      const accum = state._toolCallAccum[idx];
      if (tc.id) accum.id = tc.id;
      if (tc.function?.name) accum.name += tc.function.name;
      if (tc.function?.arguments) accum.arguments.push(tc.function.arguments);
    }
    // Skip emit — wait for finish_reason
    if (parts.length === 0 && !finishReason) return null;
  }

  // On finish, emit accumulated tool calls as complete functionCall parts
  if (finishReason) {
    state._geminiTerminalEmitted = true;
    state._geminiFinishPending = null;
    state.finishReason = finishReason;
    const indices = Object.keys(state._toolCallAccum);
    for (const idx of indices) {
      const accum = state._toolCallAccum[idx];
      parts.push(openAIToolCallToGeminiPart({ id: accum.id,
        function: { name: accum.name, arguments: accum.arguments.join("") } }, state.toolNameMap));
    }
  }

  // Skip empty non-finish chunks
  if (parts.length === 0 && !finishReason) return null;

  // Ensure at least empty text part on finish with no content
  if (parts.length === 0 && finishReason) {
    parts.push({ text: "" });
  }

  // Build candidate
  const candidate = { content: { role: GEMINI_ROLE.MODEL, parts } };

  // Finish reason mapping
  if (finishReason) {
    candidate.finishReason = fromOpenAIFinish(finishReason, FORMATS.GEMINI);
  }

  // Build response
  const response = {
    candidates: [candidate],
    modelVersion: state._modelVersion,
    responseId: state._responseId
  };

  const usage = chunk.usage || state._usage;
  if (usage) response.usageMetadata = toGeminiUsage(usage);

  return state.sourceFormat === FORMATS.GEMINI || state.sourceFormat === FORMATS.VERTEX ? response : { response };
}

// Register
register(FORMATS.OPENAI, FORMATS.ANTIGRAVITY, null, openaiToAntigravityResponse);
register(FORMATS.OPENAI, FORMATS.GEMINI, null, openaiToAntigravityResponse);
register(FORMATS.OPENAI, FORMATS.GEMINI_CLI, null, openaiToAntigravityResponse);
register(FORMATS.OPENAI, FORMATS.VERTEX, null, openaiToAntigravityResponse);
