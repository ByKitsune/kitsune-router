import { FORMATS } from "../../translator/formats.js";
import { ROLE, GEMINI_ROLE, CLAUDE_BLOCK, RESPONSES_ITEM } from "../../translator/schema/index.js";
import { extractReasoningText } from "../../translator/concerns/reasoning.js";
import { fromOpenAIFinish } from "../../translator/concerns/finishReason.js";
import { toGeminiUsage } from "../../translator/concerns/usage.js";
import { createErrorResult } from "../../utils/error.js";
import { HTTP_STATUS } from "../../config/runtimeConfig.js";
import { NONFINAL_CHAT_FINISH_REASONS } from "../../config/errorConfig.js";
import { openAIImagesToGeminiParts, openAIToolCallToGeminiPart } from "../../translator/response/openai-to-antigravity.js";

// Reasoning alone is not a usable answer; genuine partial output must survive.
export function isTruncatedEmptyCompletion(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return false;

  let truncated = false;
  let usable = false;

  // OpenAI Chat shape
  const choice = responseBody?.choices?.[0];
  if (choice) {
    if (choice.finish_reason === "length") truncated = true;
    const msg = choice.message || {};
    if (typeof msg.content === "string" && msg.content.length > 0) usable = true;
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) usable = true;
    if (typeof msg.refusal === "string" && msg.refusal.length > 0) usable = true;
    if (Array.isArray(msg.images) && msg.images.length > 0) usable = true;
  }

  // OpenAI Responses shape
  if (responseBody?.object === "response") {
    if (responseBody.status === "incomplete" &&
        (!responseBody.incomplete_details?.reason || responseBody.incomplete_details.reason === "max_output_tokens")) {
      truncated = true;
    }
    for (const item of responseBody.output || []) {
      if (item?.type === "function_call" || item?.type === "custom_tool_call") { usable = true; break; }
      for (const part of item?.content || []) {
        if ((part?.type === "output_text" && typeof part.text === "string" && part.text.length > 0) || (part?.type === RESPONSES_ITEM.REFUSAL && typeof part.refusal === "string" && part.refusal.length > 0)) { usable = true; break; }
      }
      if (usable) break;
    }
  }

  // Claude Messages shape
  if (responseBody?.type === "message" && Array.isArray(responseBody?.content)) {
    if (responseBody.stop_reason === "max_tokens") truncated = true;
    for (const block of responseBody.content) {
      if ((block?.type === "text" && block?.text) || block?.type === "tool_use") { usable = true; break; }
    }
  }

  // Gemini OAuth endpoints wrap the native generation response.
  const gemini = responseBody.response || responseBody;
  const candidate = gemini.candidates?.[0];
  if (candidate) {
    if (candidate.finishReason === "MAX_TOKENS") truncated = true;
    for (const part of candidate.content?.parts || []) {
      if (part.thought === true) continue;
      if (part.text || part.functionCall || part.inlineData || part.inline_data) { usable = true; break; }
    }
  }
  return truncated && !usable;
}

// Never replay generated content or known incurred usage as an empty transport.
export function emptyNonfinalCompletionError(responseBody, usage) {
  const choices = responseBody?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  for (const key in usage) {
    if (typeof usage[key] === "number" && usage[key] > 0) return null;
  }
  for (const choice of choices) {
    if (!NONFINAL_CHAT_FINISH_REASONS.has(choice?.finish_reason)) return null;
    const message = choice?.message || {};
    if ((typeof message.content === "string" && message.content.length > 0)
        || (Array.isArray(message.content) && message.content.length > 0)
        || extractReasoningText(message)
        || message.thinking?.length
        || message.reasoning_details?.length
        || message.provider_specific_fields?.reasoning_details?.length
        || message.tool_calls?.length || message.function_call
        || message.refusal || message.images?.length
        || message.audio?.id || message.audio?.data || message.audio?.transcript) return null;
  }
  return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Empty nonterminal completion from upstream",
    undefined, { code: "empty_response" });
}

function parseToolArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function openAICompletionToClaudeMessage(responseBody) {
  if (!responseBody?.choices?.[0]) return responseBody;
  const choice = responseBody.choices[0];
  const message = choice.message || {};
  const content = [];

  const reasoning = extractReasoningText(message);
  if (reasoning) {
    content.push({ type: CLAUDE_BLOCK.THINKING, thinking: reasoning });
  }
  if (typeof message.content === "string" && message.content.length > 0) {
    content.push({ type: CLAUDE_BLOCK.TEXT, text: message.content });
  }
  if (typeof message.refusal === "string" && message.refusal) content.push({ type: CLAUDE_BLOCK.TEXT, text: message.refusal });
  for (const toolCall of message.tool_calls || []) {
    const fn = toolCall.function || {};
    content.push({
      type: CLAUDE_BLOCK.TOOL_USE,
      id: toolCall.id || `toolu_${Date.now()}_${content.length}`,
      name: fn.name || toolCall.name || "",
      input: parseToolArguments(fn.arguments || toolCall.arguments),
    });
  }
  if (content.length === 0) content.push({ type: CLAUDE_BLOCK.TEXT, text: "" });

  const usage = responseBody.usage || {};
  return {
    id: String(responseBody.id || `msg_${Date.now()}`).replace(/^chatcmpl-/, ""),
    type: "message",
    role: ROLE.ASSISTANT,
    model: responseBody.model || "unknown",
    content,
    stop_reason: fromOpenAIFinish(choice.finish_reason, FORMATS.CLAUDE),
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
    },
  };
}

export function nativeGeminiResponseToClient(responseBody, sourceFormat = FORMATS.GEMINI) {
  const response = responseBody.response || responseBody;
  if (sourceFormat === FORMATS.ANTIGRAVITY || sourceFormat === FORMATS.GEMINI_CLI) {
    return responseBody.response ? responseBody : { response };
  }
  return !response.usageMetadata && responseBody.usageMetadata
    ? { ...response, usageMetadata: responseBody.usageMetadata } : response;
}

export function openAICompletionToGemini(responseBody, sourceFormat = FORMATS.GEMINI) {
  const choice = responseBody?.choices?.[0];
  if (!choice) return responseBody;
  const message = choice.message || {};
  const parts = [];
  const reasoning = extractReasoningText(message);
  if (reasoning) parts.push({ thought: true, text: reasoning });
  if (typeof message.content === "string" && message.content) parts.push({ text: message.content });
  if (typeof message.refusal === "string" && message.refusal) parts.push({ text: message.refusal });
  parts.push(...openAIImagesToGeminiParts(message.images));
  for (const toolCall of message.tool_calls || []) parts.push(openAIToolCallToGeminiPart(toolCall));
  if (parts.length === 0) parts.push({ text: "" });
  const response = {
    candidates: [{ content: { role: GEMINI_ROLE.MODEL, parts }, finishReason: fromOpenAIFinish(choice.finish_reason, FORMATS.GEMINI), index: 0 }],
    modelVersion: responseBody.model || "unknown",
    responseId: responseBody.id || `resp_${Date.now()}`,
    ...(responseBody.usage ? { usageMetadata: toGeminiUsage(responseBody.usage) } : {}),
  };
  return nativeGeminiResponseToClient(response, sourceFormat);
}

export function openAICompletionToClient(responseBody, sourceFormat, customToolNames = null) {
  if (sourceFormat === FORMATS.CLAUDE) return openAICompletionToClaudeMessage(responseBody);
  if (sourceFormat === FORMATS.OPENAI_RESPONSES) return openAICompletionToResponses(responseBody, customToolNames);
  if ([FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY, FORMATS.VERTEX].includes(sourceFormat)) {
    return openAICompletionToGemini(responseBody, sourceFormat);
  }
  return responseBody;
}


function extractCustomToolInput(argumentsValue) {
  const argumentsText = typeof argumentsValue === "string" ? argumentsValue : JSON.stringify(argumentsValue || {});
  try {
    const parsed = JSON.parse(argumentsText);
    if (parsed && typeof parsed === "object" && typeof parsed.input === "string") return parsed.input;
  } catch { /* raw freeform input */ }
  return argumentsText;
}

export function openAICompletionToResponses(responseBody, customToolNames = null) {
  const choice = responseBody?.choices?.[0];
  if (!choice) return responseBody;
  const customNames = customToolNames instanceof Set ? customToolNames : new Set(customToolNames || []);

  const message = choice.message || {};
  const output = [];

  // Reasoning → a reasoning item (summary text), mirroring the streaming path.
  const reasoning = extractReasoningText(message);
  if (typeof reasoning === "string" && reasoning.length > 0) {
    output.push({
      type: RESPONSES_ITEM.REASONING,
      status: "completed",
      summary: [{ type: RESPONSES_ITEM.SUMMARY_TEXT, text: reasoning }],
    });
  }

  // Assistant text → a message item with output_text content.
  const text = typeof message.content === "string" ? message.content : "";
  if (text.length > 0) {
    output.push({
      type: RESPONSES_ITEM.MESSAGE,
      status: "completed",
      role: ROLE.ASSISTANT,
      content: [{ type: RESPONSES_ITEM.OUTPUT_TEXT, text, annotations: [] }],
    });
  }

  if (typeof message.refusal === "string" && message.refusal.length > 0) {
    output.push({ type: RESPONSES_ITEM.MESSAGE, status: "completed", role: ROLE.ASSISTANT,
      content: [{ type: RESPONSES_ITEM.REFUSAL, refusal: message.refusal }] });
  }

  // tool_calls → function_call/custom_tool_call items (Responses-native tool shape).
  for (const tc of message.tool_calls || []) {
    const fn = tc.function || {};
    const custom = customNames.has(fn.name);
    output.push({
      type: custom ? RESPONSES_ITEM.CUSTOM_TOOL_CALL : RESPONSES_ITEM.FUNCTION_CALL,
      status: "completed",
      id: `${custom ? "ctc" : "fc"}_${tc.id || ""}`,
      call_id: tc.id || "",
      name: fn.name || "",
      ...(custom
        ? { input: extractCustomToolInput(fn.arguments) }
        : { arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments || {}) }),
    });
  }

  const usage = responseBody.usage || {};
  const truncated = ["length", "max_tokens"].includes(choice.finish_reason);
  const status = truncated ? "incomplete" : "completed";

  return {
    id: `resp_${responseBody.id || ""}`.replace(/^resp_chatcmpl-/, "resp_"),
    object: "response",
    created_at: responseBody.created || Math.floor(Date.now() / 1000),
    model: responseBody.model || "unknown",
    status,
    ...(typeof responseBody.service_tier === "string" ? { service_tier: responseBody.service_tier } : {}),
    ...(truncated ? { incomplete_details: { reason: "max_output_tokens" } } : {}),
    background: false,
    error: null,
    output,
    usage: {
      input_tokens: usage.prompt_tokens || usage.input_tokens || 0,
      output_tokens: usage.completion_tokens || usage.output_tokens || 0,
      total_tokens: usage.total_tokens ?? (usage.prompt_tokens ?? usage.input_tokens ?? 0) + (usage.completion_tokens ?? usage.output_tokens ?? 0),
      ...(usage.prompt_tokens_details ? { input_tokens_details: usage.prompt_tokens_details } : {}),
      ...(usage.completion_tokens_details ? { output_tokens_details: usage.completion_tokens_details } : {}),
      ...(usage.estimated ? { estimated: true } : {}),
    },
  };
}

export function outputBudgetError(responseBody, sourceFormat, body = {}) {
  if (!isTruncatedEmptyCompletion(responseBody)) return null;
  const gemini = [FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY, FORMATS.VERTEX].includes(sourceFormat);
  const param = sourceFormat === FORMATS.OPENAI_RESPONSES ? "max_output_tokens"
    : gemini ? "generationConfig.maxOutputTokens"
      : body.max_completion_tokens !== undefined ? "max_completion_tokens" : "max_tokens";
  return createErrorResult(HTTP_STATUS.BAD_REQUEST,
    `Output budget exhausted before any text or tool calls; increase ${param} or reduce reasoning effort`,
    undefined, { type: "invalid_request_error", code: "output_budget_exhausted", param });
}
