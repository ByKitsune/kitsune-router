import { outputBudgetError, emptyNonfinalCompletionError, openAICompletionToClient, nativeGeminiResponseToClient } from "./jsonCompletionOutcome.js";
export { isTruncatedEmptyCompletion } from "./jsonCompletionOutcome.js";
import { FORMATS } from "../../translator/formats.js";
import { needsTranslation } from "../../translator/index.js";
import { ollamaBodyToOpenAI } from "../../translator/response/ollama-to-openai.js";
import { toOpenAIUsage } from "../../translator/concerns/usage.js";
import { filterUsageForFormat } from "../../utils/usageTracking.js";
import { createErrorResult } from "../../utils/error.js";
import { HTTP_STATUS } from "../../config/runtimeConfig.js";
import { convertSSEToOpenAIResponse, createSSEAggregationState, responsesJsonToClaudeMessage } from "./sseToJsonHandler.js";
import { convertResponsesStreamToJson } from "../../transformer/streamToJsonConverter.js";
import { openaiResponsesObjectToCompletion } from "../../translator/response/openai-responses.js";
import { buildRequestDetail, extractRequestConfig, extractUsageFromResponse, saveUsageStats, formatDoneLine } from "./requestDetail.js";
import { saveRequestDetail } from "@/lib/usageDb.js";
import { decloakToolNames } from "../../utils/claudeCloaking.js";
import { decloakOpenAIChunk } from "../../utils/toolCompressor.js";
import { buildToolCallId } from "../../translator/concerns/thoughtSignature.js";
import { extractReasoningText } from "../../translator/concerns/reasoning.js";
import { normalizeTypedContent } from "../../translator/concerns/typedContent.js";
import { normalizeMediaPart } from "../../translator/concerns/multimodal.js";
import { toOpenAIFinish } from "../../translator/concerns/finishReason.js";
import { extractResponseError } from "../../translator/concerns/responseError.js";
import { getServiceTierAccounting } from "../../providers/serviceTiers.js";

import { normalizeResponseIdentity } from "../../utils/streamHelpers.js";
const DEFAULT_THOUGHT_SIGNATURE = "";

function extractGeminiThoughtSignature(part, pending = DEFAULT_THOUGHT_SIGNATURE) {
  return part?.thoughtSignature || part?.thought_signature || pending;
}

function buildGeminiToolCall(part, index, pendingSignature) {
  const signature = extractGeminiThoughtSignature(part, pendingSignature);
  const id = buildToolCallId(part.functionCall.name, index, signature, part.functionCall.id);
  return {
    id,
    type: "function",
    function: {
      name: part.functionCall.name,
      arguments: JSON.stringify(part.functionCall.args || {}),
    },
  };
}

function appendGeminiToolCalls(parts, toolCalls) {
  let pendingSignature = DEFAULT_THOUGHT_SIGNATURE;
  for (const part of parts || []) {
    const media = part.inlineData || part.inline_data || part.fileData || part.file_data;
    const mimeType = media?.mimeType || media?.mime_type;
    if (typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/")) {
      pendingSignature = DEFAULT_THOUGHT_SIGNATURE;
      continue;
    }
    const signature = extractGeminiThoughtSignature(part);
    if (signature) pendingSignature = signature;
    if (!part.functionCall) continue;
    toolCalls.push(buildGeminiToolCall(part, toolCalls.length, pendingSignature));
    pendingSignature = DEFAULT_THOUGHT_SIGNATURE;
  }
}

function convertGeminiParts(parts) {
  const result = { text: "", reasoning: "", toolCalls: [] };
  for (const part of parts || []) {
    if (part.thought === true && part.text) result.reasoning += part.text;
    else if (part.text !== undefined) result.text += part.text;
  }
  appendGeminiToolCalls(parts, result.toolCalls);
  return result;
}

export const __test__ = { convertGeminiParts };


/**
 * Translate non-streaming response body from provider format → OpenAI format.
 */
export function translateNonStreamingResponse(responseBody, targetFormat, sourceFormat, customToolNames = null) {
  // The actual body shape is authoritative, including gateways which answer
  // Chat JSON after accepting a provider-native request.
  if (Array.isArray(responseBody?.choices)) {
    for (const choice of responseBody.choices) normalizeTypedContent(choice?.message);
    return openAICompletionToClient(responseBody, sourceFormat, customToolNames);
  }
  if ([FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY, FORMATS.VERTEX].includes(sourceFormat) &&
      (responseBody?.candidates || responseBody?.response?.candidates)) {
    return nativeGeminiResponseToClient(responseBody, sourceFormat);
  }
  if (targetFormat === sourceFormat) return responseBody;
  if (targetFormat === FORMATS.OPENAI_RESPONSES && responseBody?.object === "response") {
    if (sourceFormat === FORMATS.CLAUDE) return responsesJsonToClaudeMessage(responseBody);
    return openAICompletionToClient(openaiResponsesObjectToCompletion(responseBody), sourceFormat, customToolNames);
  }
  if (targetFormat === FORMATS.OPENAI) return responseBody;

  // Gemini / Antigravity
  if (targetFormat === FORMATS.GEMINI || targetFormat === FORMATS.ANTIGRAVITY || targetFormat === FORMATS.GEMINI_CLI || targetFormat === FORMATS.VERTEX) {
    const response = responseBody.response || responseBody;
    if (!response?.candidates?.[0]) return responseBody;

    const candidate = response.candidates[0];
    const content = candidate.content;
    const usage = response.usageMetadata || responseBody.usageMetadata;
    const convertedParts = convertGeminiParts(content?.parts);
    const textContent = convertedParts.text;
    const reasoningContent = convertedParts.reasoning;
    const toolCalls = convertedParts.toolCalls;

    const images = [];
    for (const part of content?.parts || []) {
      const image = normalizeMediaPart(part);
      if (image?.image_url) {
        const signature = extractGeminiThoughtSignature(part);
        images.push({ ...image, index: images.length,
          ...(signature ? { extra_content: { google: { thought_signature: signature } } } : {}) });
      }
    }

    const message = { role: "assistant" };
    if (textContent) message.content = textContent;
    if (reasoningContent) message.reasoning_content = reasoningContent;
    if (toolCalls.length > 0) message.tool_calls = toolCalls;
    if (images.length > 0) message.images = images;
    if (!message.content && !message.tool_calls) message.content = "";

    let finishReason = toOpenAIFinish(candidate.finishReason || "STOP", "gemini");
    if (finishReason === "stop" && toolCalls.length > 0) finishReason = "tool_calls";

    const result = {
      id: `chatcmpl-${response.responseId || Date.now()}`,
      object: "chat.completion",
      created: Math.floor(new Date(response.createTime || Date.now()).getTime() / 1000),
      model: response.modelVersion || "gemini",
      choices: [{ index: 0, message, finish_reason: finishReason }]
    };

    if (usage) {
      result.usage = toOpenAIUsage(usage, "gemini");
    }
    return openAICompletionToClient(result, sourceFormat, customToolNames);
  }

  // Claude
  if (targetFormat === FORMATS.CLAUDE) {
    // Always translate a Claude-format body to OpenAI, even if `content` is
    // missing/null (e.g. M3 with max_tokens:1 spends the budget on thinking
    // and returns `content: null`). Returning the raw body would leave the
    // OpenAI client without a `choices` array and surface as a UI test error.
    if (responseBody.content && !Array.isArray(responseBody.content)) return responseBody;

    let textContent = "", thinkingContent = "";
    const toolCalls = [];

    for (const block of (responseBody.content || [])) {
      if (block.type === "text") {
        // Strip markdown code block markers (e.g. kimi wraps JSON in ```json...```)
        const raw = block.text ?? "";
        const text = raw.replace(/^\s*```\s*json\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "");
        textContent += text;
      } else if (block.type === "thinking") thinkingContent += block.thinking || "";
      else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input || {}) } });
      }
    }

    const message = { role: "assistant" };
    if (textContent) message.content = textContent;
    if (thinkingContent) message.reasoning_content = thinkingContent;
    if (toolCalls.length > 0) message.tool_calls = toolCalls;
    if (!message.content && !message.tool_calls) message.content = "";

    const finishReason = toOpenAIFinish(responseBody.stop_reason || "end_turn", "claude");

    const result = {
      id: `chatcmpl-${responseBody.id || Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: responseBody.model || "claude",
      choices: [{ index: 0, message, finish_reason: finishReason }]
    };

    if (responseBody.usage) {
      result.usage = toOpenAIUsage(responseBody.usage, "claude");
    }
    return openAICompletionToClient(result, sourceFormat, customToolNames);
  }

  // Ollama
  if (targetFormat === FORMATS.OLLAMA) {
    const result = ollamaBodyToOpenAI(responseBody);
    return openAICompletionToClient(result, sourceFormat, customToolNames);
  }

  return responseBody;
}

export async function handleNonStreamingResponse({ providerResponse, provider, model, sourceFormat, targetFormat, body, stream, translatedBody, finalBody, requestStartTime, connectionId, apiKey, clientRawRequest, onRequestSuccess, reqLogger, toolNameMap, customToolNames, trackDone, appendLog, pxpipe, reqTag, log, serviceTier, signal }) {
  trackDone();
  const contentType = (providerResponse.headers.get("content-type") || "").toLowerCase();
  let responseBody;

  if (contentType.includes("text/event-stream") || (targetFormat === FORMATS.OLLAMA && contentType.includes("application/x-ndjson"))) {
    if (targetFormat === FORMATS.OPENAI_RESPONSES) {
      responseBody = await convertResponsesStreamToJson(providerResponse.body, { signal });
    } else {
      const aggregationState = createSSEAggregationState(targetFormat, sourceFormat, model);
      const parsed = await convertSSEToOpenAIResponse(providerResponse.body, model, targetFormat, aggregationState, { signal });
      if (!parsed) {
        appendLog({ status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}` });
        return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Invalid SSE response for non-streaming request");
      }
      responseBody = parsed.error ? parsed : aggregationState.nativeResponse || parsed;
    }
  } else {
    try {
      responseBody = await providerResponse.json();
    } catch (err) {
      appendLog({ status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}` });
      console.error(`[ChatCore] Failed to parse JSON from ${provider}:`, err.message);
      return createErrorResult(HTTP_STATUS.BAD_GATEWAY, `Invalid JSON response from ${provider}`);
    }
  }
  if (Array.isArray(responseBody?.choices)) {
    for (const choice of responseBody.choices) normalizeTypedContent(choice?.message);
  }

  reqLogger.logProviderResponse(providerResponse.status, providerResponse.statusText, providerResponse.headers, responseBody);
  // Record incurred tokens before any terminal classification or fallback.
  const usage = extractUsageFromResponse(responseBody);
  const tierAccounting = getServiceTierAccounting(provider, serviceTier || { requestedServiceTier: body?.service_tier }, responseBody);
  saveUsageStats({ provider, model, tokens: usage, connectionId, apiKey, endpoint: clientRawRequest?.endpoint, silent: true, serviceTier: tierAccounting });
  const failure = extractResponseError(responseBody);
  if (failure) {
    appendLog({ tokens: usage, status: `FAILED ${failure.status}` });
    return createErrorResult(failure.status, failure.error.message || "Upstream response failed", null, failure.error);
  }
  // Detect upstream gateway errors masked as HTTP 200 (e.g. OpenRouter
  // sending choices[0].native_finish_reason:"network_error" with empty content).
  const rawChoice = responseBody?.choices?.[0];
  const nativeReason = rawChoice?.native_finish_reason;
  const rawMsg = rawChoice?.message || {};
  const hasContent = (typeof rawMsg.content === "string" && rawMsg.content.length > 0)
    || (Array.isArray(rawMsg.tool_calls) && rawMsg.tool_calls.length > 0);
  if (nativeReason && ["network_error", "error", "server_error", "timeout"].includes(nativeReason) && !hasContent) {
    appendLog({ status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}` });
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, `Upstream provider error: ${nativeReason}`);
  }

  // A request can spend its output budget on reasoning before producing text.
  // This is not an account outage: repeating the same budget cannot repair it,
  // and cooling down the credential would block unrelated healthy requests.
  const budgetError = outputBudgetError(responseBody, sourceFormat, body);
  if (budgetError) {
    appendLog({ tokens: usage, status: `FAILED ${HTTP_STATUS.BAD_REQUEST}` });
    const totalLatency = Date.now() - requestStartTime;
    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId, serviceTier: tierAccounting,
      latency: { ttft: totalLatency, total: totalLatency },
      tokens: usage,
      request: extractRequestConfig(body, stream),
      providerRequest: finalBody || translatedBody || null,
      providerResponse: responseBody,
      response: { error: { code: "output_budget_exhausted", message: budgetError.error } },
      pxpipe, status: "failed"
    }, { endpoint: clientRawRequest?.endpoint || null })).catch(() => {});
    return budgetError;
  }

  const emptyError = emptyNonfinalCompletionError(responseBody, usage);
  if (emptyError) {
    appendLog({ tokens: usage, status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}` });
    return emptyError;
  }

  if (onRequestSuccess) {
    Promise.resolve()
      .then(onRequestSuccess)
      .catch(err => {
        console.error("[ChatCore] onRequestSuccess failed:", err?.message || err);
      });
  }

  // Decloak tool_use names once on raw body, before any translation (INPUT side)
  responseBody = decloakToolNames(responseBody, toolNameMap);
  responseBody = decloakOpenAIChunk(responseBody, toolNameMap);
  customToolNames = new Set(Array.from(customToolNames || [], name => toolNameMap?.get(name) || name));
  for (const choice of responseBody?.choices || []) {
    const reasoning = extractReasoningText(choice?.message);
    if (reasoning) choice.message.reasoning_content = reasoning;
  }

  appendLog({ tokens: usage, status: "200 OK" });
  if (log?.line) log.line(reqTag, "📊", formatDoneLine({ usage, latency: { total: Date.now() - requestStartTime } }));

  let translatedResponse = needsTranslation(targetFormat, sourceFormat) || Array.isArray(responseBody?.choices)
    ? translateNonStreamingResponse(responseBody, targetFormat, sourceFormat, customToolNames)
    : responseBody;
  const isClaudeMessageResponse = sourceFormat === FORMATS.CLAUDE && translatedResponse?.type === "message";
  // Responses-format translation produces a `object:"response"` body with no
  // `choices`; skip the Chat-Completions-specific post-processing below for it.
  const isResponsesResponse = sourceFormat === FORMATS.OPENAI_RESPONSES && translatedResponse?.object === "response";
  const isGeminiResponse = !!(translatedResponse?.candidates || translatedResponse?.response?.candidates);

  // Fix finish_reason for tool_calls: some providers return non-standard values (e.g. "other")
  if (translatedResponse?.choices?.[0]) {
    const choice = translatedResponse.choices[0];
    const msg = choice.message;
    const hasToolCalls = Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0;
    if (hasToolCalls && !["tool_calls", "length", "content_filter", "network_error"].includes(choice.finish_reason)) {
      choice.finish_reason = "tool_calls";
    }
  }

  // Ensure OpenAI-required fields
  if (!isClaudeMessageResponse && !isResponsesResponse && !isGeminiResponse) {
    if (!translatedResponse.object) translatedResponse.object = "chat.completion";
    if (!translatedResponse.created) translatedResponse.created = Math.floor(Date.now() / 1000);
  }

  // Strip Azure-specific fields
  if (!isClaudeMessageResponse && !isResponsesResponse && !isGeminiResponse) {
    delete translatedResponse.prompt_filter_results;
    if (translatedResponse?.choices) {
      for (const choice of translatedResponse.choices) delete choice.content_filter_results;
    }
  }

  if (translatedResponse?.usage && !isResponsesResponse) {
    translatedResponse.usage = filterUsageForFormat(translatedResponse.usage, sourceFormat);
  }

  normalizeResponseIdentity(translatedResponse, clientRawRequest?.body?.model);

  reqLogger.logConvertedResponse(translatedResponse);

  const totalLatency = Date.now() - requestStartTime;
  saveRequestDetail(buildRequestDetail({
    provider, model, connectionId, serviceTier: tierAccounting,
    latency: { ttft: totalLatency, total: totalLatency },
    tokens: usage || { prompt_tokens: 0, completion_tokens: 0 },
    request: extractRequestConfig(body, stream),
    providerRequest: finalBody || translatedBody || null,
    providerResponse: responseBody || null,
    response: {
      content: translatedResponse?.choices?.[0]?.message?.content || translatedResponse?.content || null,
      thinking: translatedResponse?.choices?.[0]?.message?.reasoning_content || translatedResponse?.reasoning_content || null,
      finish_reason: translatedResponse?.choices?.[0]?.finish_reason || "unknown"
    },
    pxpipe,
    status: "success"
  }, { endpoint: clientRawRequest?.endpoint || null })).catch(err => {
    console.error("[RequestDetail] Failed to save:", err.message);
  });

  return {
    success: true,
    response: new Response(JSON.stringify(translatedResponse), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    })
  };
}
