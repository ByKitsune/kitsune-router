import { outputBudgetError, emptyNonfinalCompletionError, openAICompletionToClient, nativeGeminiResponseToClient } from "./jsonCompletionOutcome.js";
import { convertResponsesStreamToJson } from "../../transformer/streamToJsonConverter.js";
import { createErrorResult } from "../../utils/error.js";
import { HTTP_STATUS } from "../../config/runtimeConfig.js";
import { FORMATS } from "../../translator/formats.js";
import { PROVIDERS } from "../../config/providers.js";
import { buildRequestDetail, extractRequestConfig, extractUsageFromResponse, saveUsageStats, formatDoneLine } from "./requestDetail.js";
import { RESPONSES_ITEM } from "../../translator/schema/index.js";
import { extractReasoningText, extractResponsesReasoningText } from "../../translator/concerns/reasoning.js";
import { normalizeTypedContent } from "../../translator/concerns/typedContent.js";
import { translateResponse, initState } from "../../translator/index.js";
import { openaiResponsesObjectToCompletion } from "../../translator/response/openai-responses.js";
import { extractResponseError } from "../../translator/concerns/responseError.js";
import { decloakOpenAIChunk } from "../../utils/toolCompressor.js";
import { decloakToolNames } from "../../utils/claudeCloaking.js";

// Responses-API providers (e.g. codex) may emit SSE without content-type + use Responses output shape
const isResponsesProvider = (p) => PROVIDERS[p]?.format === FORMATS.OPENAI_RESPONSES;
import { saveRequestDetail } from "@/lib/usageDb.js";

function textFromResponsesMessageItem(item) {
  if (!item?.content || !Array.isArray(item.content)) return "";
  const byType = item.content.find((c) => c.type === "output_text");
  if (typeof byType?.text === "string") return byType.text;
  const anyText = item.content.find((c) => typeof c.text === "string");
  if (typeof anyText?.text === "string") return anyText.text;
  return "";
}

/**
 * Codex / Responses API may emit many alternating reasoning + message items.
 * Early message blocks often have empty output_text; the user-visible answer is usually in the last non-empty message.
 */
function pickAssistantMessageForChatCompletion(output) {
  if (!Array.isArray(output)) return { msgItem: null, textContent: null };
  const messages = output.filter((item) => item?.type === "message");
  if (messages.length === 0) return { msgItem: null, textContent: null };
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = textFromResponsesMessageItem(messages[i]);
    if (text.length > 0) return { msgItem: messages[i], textContent: text };
  }
  const last = messages[messages.length - 1];
  return { msgItem: last, textContent: textFromResponsesMessageItem(last) };
}


export function responsesJsonToClaudeMessage(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const content = [];
  for (const item of output) {
    if (item?.type === "reasoning") {
      const text = extractResponsesReasoningText(item);
      if (text) content.push({ type: "thinking", thinking: text });
    } else if (item?.type === "message") {
      const text = textFromResponsesMessageItem(item);
      if (text) content.push({ type: "text", text });
      for (const part of item.content || []) {
        if (typeof part.refusal === "string" && part.refusal) content.push({ type: "text", text: part.refusal });
      }
    } else if (item?.type === "function_call" || item?.type === "custom_tool_call") {
      let input = {};
      try { input = item.type === "custom_tool_call" ? { input: item.input ?? "" } : item.arguments ? JSON.parse(item.arguments) : {}; } catch { /* preserve an empty valid input */ }
      content.push({ type: "tool_use", id: item.call_id || item.id || `toolu_${Date.now()}_${content.length}`, name: item.name || "", input });
    }
  }
  if (content.length === 0) content.push({ type: "text", text: "" });
  return {
    id: String(response.id || `msg_${Date.now()}`).replace(/^resp_/, ""),
    type: "message",
    role: "assistant",
    model: response.model || "unknown",
    content,
    stop_reason: response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens"
      ? "max_tokens" : response.status === "incomplete" && response.incomplete_details?.reason === "content_filter"
        ? "refusal" : content.some((item) => item.type === "tool_use") ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: response.usage?.input_tokens || 0, output_tokens: response.usage?.output_tokens || 0 },
  };
}

export function createSSEAggregationState(targetFormat, sourceFormat, model) {
  const gemini = [FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY, FORMATS.VERTEX];
  return {
    ...initState(FORMATS.OPENAI), model, targetFormat, sourceFormat: FORMATS.OPENAI,
    collectNativeResponse: (targetFormat === FORMATS.CLAUDE && sourceFormat === FORMATS.CLAUDE) ||
      (gemini.includes(targetFormat) && gemini.includes(sourceFormat)),
  };
}

/** Aggregate registered provider response translators into one Chat completion. */
export function parseSSEToOpenAIResponse(rawSSE, fallbackModel, targetFormat = FORMATS.OPENAI, translationState = null) {
  const chunks = [];
  const state = translationState || createSSEAggregationState(targetFormat, FORMATS.OPENAI, fallbackModel);
  const appendChunk = (chunk) => {
    if (chunk?.error) { streamError = chunk.error; return; }
    const translated = targetFormat === FORMATS.OPENAI || Array.isArray(chunk?.choices)
      ? [chunk] : translateResponse(targetFormat, FORMATS.OPENAI, chunk, state);
    if (translated) chunks.push(...translated);
  };
  let streamError = null;

  for (const line of String(rawSSE || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    let chunk;
    try { chunk = JSON.parse(payload); } catch { continue; }
    appendChunk(chunk);
  }
  if (targetFormat !== FORMATS.OPENAI) {
    chunks.push(...translateResponse(targetFormat, FORMATS.OPENAI, null, state));
  }

  if (streamError) return { error: streamError };
  if (chunks.length === 0) return null;

  const first = chunks[0];
  const contentParts = [];
  const reasoningParts = [];
  const refusalParts = [];
  const reasoningDetails = [];
  const images = [];
  const toolCallMap = new Map(); // index -> { id, type, function: { name, arguments } }
  let finishReason = "stop";
  let usage = null;

  for (const chunk of chunks) {
    const choice = chunk?.choices?.[0];
    const delta = choice?.delta || {};
    normalizeTypedContent(delta);
    if (typeof delta.content === "string" && delta.content.length > 0) contentParts.push(delta.content);
    if (typeof delta.refusal === "string") refusalParts.push(delta.refusal);
    if (Array.isArray(delta.images)) images.push(...delta.images);
    const reasoningDelta = extractReasoningText(delta);
    if (typeof reasoningDelta === "string" && reasoningDelta.length > 0) reasoningParts.push(reasoningDelta);
    const details = delta.reasoning_details ?? delta.provider_specific_fields?.reasoning_details;
    if (Array.isArray(details)) reasoningDetails.push(...details);
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk?.usage && typeof chunk.usage === "object") usage = chunk.usage;

    // Accumulate tool_calls from streaming deltas
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallMap.has(idx)) {
          toolCallMap.set(idx, { id: tc.id || "", type: "function", function: { name: "", arguments: "" } });
        }
        const existing = toolCallMap.get(idx);
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.function.name += tc.function.name;
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
      }
    }
  }

  const message = { role: "assistant", content: contentParts.join("") || (toolCallMap.size > 0 ? null : "") };
  if (refusalParts.length > 0) message.refusal = refusalParts.join("");
  if (reasoningParts.length > 0) message.reasoning_content = reasoningParts.join("");
  if (reasoningDetails.length > 0) message.reasoning_details = reasoningDetails;
  if (images.length > 0) message.images = images;
  if (toolCallMap.size > 0) {
    message.tool_calls = [...toolCallMap.entries()].sort((a, b) => a[0] - b[0]).map(([, tc]) => tc);
  }

  const result = {
    id: first.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: first.created || Math.floor(Date.now() / 1000),
    model: first.model || fallbackModel || "unknown",
    choices: [{ index: 0, message, finish_reason: finishReason }]
  };
  if (usage) result.usage = usage;
  return result;
}

/**
 * Handle case: provider forced streaming but client wants JSON.
 * Supports both Codex/Responses API SSE and standard Chat Completions SSE.
 */
export async function handleForcedSSEToJson({ providerResponse, sourceFormat, targetFormat, provider, model, body, stream, translatedBody, finalBody, requestStartTime, connectionId, apiKey, clientRawRequest, onRequestSuccess, toolNameMap, customToolNames, trackDone, appendLog, reqTag, log }) {
  const contentType = providerResponse.headers.get("content-type") || "";
  const isSSE = contentType.includes("text/event-stream") || (contentType === "" && isResponsesProvider(provider));
  if (!isSSE) return null; // not handled here

  trackDone();
  customToolNames = new Set(Array.from(customToolNames || [], name => toolNameMap?.get(name) || name));

  const ctx = {
    provider, model, connectionId,
    request: extractRequestConfig(body, stream),
    providerRequest: finalBody || translatedBody || null
  };

  // Codex/Responses API SSE path
  // Branch on the UPSTREAM format (targetFormat = format we spoke to the provider in),
  // not the client format: a Responses-API client behind a chat-native forced-streaming
  // provider still receives chat SSE chunks, which must go through the standard path.
  const isCodexResponsesApi = isResponsesProvider(provider) || targetFormat === FORMATS.OPENAI_RESPONSES;
  if (isCodexResponsesApi) {
    try {
      const jsonResponse = decloakOpenAIChunk(await convertResponsesStreamToJson(providerResponse.body), toolNameMap);
      const usage = jsonResponse.usage || {};
      const recordedUsage = extractUsageFromResponse(jsonResponse);
      saveUsageStats({ provider, model, tokens: recordedUsage, connectionId, apiKey, endpoint: clientRawRequest?.endpoint, silent: true });
      const nativeFailure = extractResponseError(jsonResponse);
      const failure = outputBudgetError(jsonResponse, sourceFormat, body)
        || (nativeFailure ? createErrorResult(
          nativeFailure.status,
          nativeFailure.error.message || "Upstream Responses stream failed",
          null, nativeFailure.error
        ) : null);
      if (failure) {
        appendLog({ tokens: recordedUsage, status: `FAILED ${failure.response.status}` });
        const totalLatency = Date.now() - requestStartTime;
        saveRequestDetail(buildRequestDetail({
          ...ctx, latency: { ttft: totalLatency, total: totalLatency },
          tokens: recordedUsage, providerResponse: jsonResponse,
          response: { error: failure.error }, status: "failed"
        }, { endpoint: clientRawRequest?.endpoint || null })).catch(() => {});
        return failure;
      }
      if (onRequestSuccess) await onRequestSuccess();
      appendLog({ tokens: recordedUsage, status: "200 OK" });
      if (log?.line) log.line(reqTag, "📊", formatDoneLine({ usage, latency: { total: Date.now() - requestStartTime } }));

      const { textContent } = pickAssistantMessageForChatCompletion(jsonResponse.output);
      const totalLatency = Date.now() - requestStartTime;

      saveRequestDetail(buildRequestDetail({
        ...ctx,
        latency: { ttft: totalLatency, total: totalLatency },
        tokens: recordedUsage,
        response: { content: textContent, thinking: null, finish_reason: jsonResponse.status || "unknown" },
        status: "success"
      }, { endpoint: clientRawRequest?.endpoint || null })).catch(() => {});

      // Client is Responses API → return as-is
      if (sourceFormat === FORMATS.OPENAI_RESPONSES) {
        return { success: true, response: new Response(JSON.stringify(jsonResponse), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }) };
      }

      if (sourceFormat === FORMATS.CLAUDE) {
        return { success: true, response: new Response(JSON.stringify(responsesJsonToClaudeMessage(jsonResponse)), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }) };
      }

      // Build client-format response.
      // input_tokens EXCLUDES cached tokens on cache-capable upstreams, so summing
      // only input+output under-reports prompt_tokens — measured: 2012 reported
      // where the real prompt was ~5344 with 5332 served from cache. Fold the cache
      // counters in, and keep them visible in prompt_tokens_details so a client can
      // tell a cache hit from a small prompt.
      const cacheRead = usage.cache_read_input_tokens || usage.cached_tokens || 0;
      const cacheCreate = usage.cache_creation_input_tokens || 0;
      const inTokens = (usage.input_tokens || 0) + cacheRead + cacheCreate;
      const outTokens = usage.output_tokens || 0;
      const cacheDetails = (cacheRead > 0 || cacheCreate > 0)
        ? { prompt_tokens_details: {
              ...(cacheRead > 0 ? { cached_tokens: cacheRead } : {}),
              ...(cacheCreate > 0 ? { cache_creation_tokens: cacheCreate } : {}) } }
        : {};
      let finalResp;

      const toolCalls = openaiResponsesObjectToCompletion(jsonResponse).choices[0].message.tool_calls || [];
      const hasToolCalls = toolCalls.length > 0;

      if ([FORMATS.ANTIGRAVITY, FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.VERTEX].includes(sourceFormat)) {
        finalResp = openAICompletionToClient(openaiResponsesObjectToCompletion(jsonResponse), sourceFormat, customToolNames);
      } else {
        const message = { role: "assistant", content: textContent || (hasToolCalls ? null : "") };
        const refusal = (jsonResponse.output || []).flatMap(item => item.content || [])
          .filter(part => part.type === "refusal" && typeof part.refusal === "string")
          .map(part => part.refusal).join("");
        if (refusal) message.refusal = refusal;
        const reasoningParts = [];
        for (const item of jsonResponse.output || []) {
          if (item?.type === RESPONSES_ITEM.REASONING) {
            const text = extractResponsesReasoningText(item);
            if (text) reasoningParts.push(text);
          }
        }
        if (reasoningParts.length > 0) message.reasoning_content = reasoningParts.join("");
        if (hasToolCalls) message.tool_calls = toolCalls;
        const responseDone = jsonResponse.status === "completed" || jsonResponse.status === "done";
        const finishReason = jsonResponse.status === "incomplete" && jsonResponse.incomplete_details?.reason === "max_output_tokens"
          ? "length" : jsonResponse.status === "incomplete" && jsonResponse.incomplete_details?.reason === "content_filter"
            ? "content_filter" : hasToolCalls ? "tool_calls" : (responseDone ? "stop" : (jsonResponse.status || "stop"));
        finalResp = {
          id: jsonResponse.id || `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: jsonResponse.created_at || Math.floor(Date.now() / 1000),
          model: jsonResponse.model || model,
          choices: [{ index: 0, message, finish_reason: finishReason }],
          usage: { prompt_tokens: inTokens, completion_tokens: outTokens, total_tokens: inTokens + outTokens, ...cacheDetails,
            ...(usage.output_tokens_details ? { completion_tokens_details: usage.output_tokens_details } : {}) }
        };
      }

      return { success: true, response: new Response(JSON.stringify(finalResp), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }) };
    } catch (err) {
      console.error("[ChatCore] Responses API SSE→JSON failed:", err);
      return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Failed to convert streaming response to JSON");
    }
  }

  // Standard Chat Completions SSE path
  try {
    const sseText = await providerResponse.text();
    const aggregationState = createSSEAggregationState(targetFormat, sourceFormat, model);
    aggregationState.toolNameMap = toolNameMap;
    const parsed = decloakOpenAIChunk(parseSSEToOpenAIResponse(sseText, model, targetFormat, aggregationState), toolNameMap);
    if (!parsed) return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Invalid SSE response for non-streaming request");
    const failure = extractResponseError(parsed);
    if (failure) {
      return createErrorResult(failure.status, failure.error.message || "Upstream SSE stream failed", null, failure.error);
    }

    const usage = parsed.usage || {};
    saveUsageStats({ provider, model, tokens: usage, connectionId, apiKey, endpoint: clientRawRequest?.endpoint, silent: true });
    const budgetError = outputBudgetError(parsed, sourceFormat, body);
    if (budgetError) {
      appendLog({ tokens: usage, status: `FAILED ${HTTP_STATUS.BAD_REQUEST}` });
      const totalLatency = Date.now() - requestStartTime;
      saveRequestDetail(buildRequestDetail({
        ...ctx, latency: { ttft: totalLatency, total: totalLatency },
        tokens: usage, providerResponse: parsed,
        response: { error: { code: "output_budget_exhausted", message: budgetError.error } },
        status: "failed"
      }, { endpoint: clientRawRequest?.endpoint || null })).catch(() => {});
      return budgetError;
    }
    const emptyError = emptyNonfinalCompletionError(parsed, usage);
    if (emptyError) {
      appendLog({ tokens: usage, status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}` });
      return emptyError;
    }
    if (onRequestSuccess) await onRequestSuccess();
    appendLog({ tokens: usage, status: "200 OK" });
    if (log?.line) log.line(reqTag, "📊", formatDoneLine({ usage, latency: { total: Date.now() - requestStartTime } }));

    const totalLatency = Date.now() - requestStartTime;
    saveRequestDetail(buildRequestDetail({
      ...ctx,
      latency: { ttft: totalLatency, total: totalLatency },
      tokens: usage,
      response: {
        content: parsed.choices?.[0]?.message?.content || null,
        thinking: parsed.choices?.[0]?.message?.reasoning_content || null,
        finish_reason: parsed.choices?.[0]?.finish_reason || "unknown"
      },
      status: "success"
    }, { endpoint: clientRawRequest?.endpoint || null })).catch(() => {});

    // Re-attach usage explicitly. This handler already HAS the correct usage — it is
    // the same object written to the usage DB, and for a cached Claude request that DB
    // row reads cache_read_input_tokens: 11022 — yet the client was observed receiving
    // no usage field at all (verified 2026-08-04 with a fingerprinted payload matched
    // on both sides). Whatever drops it between assembly and serialisation, the client
    // must not be left unable to account for its own token spend: a caller cannot tell
    // a 90%-cached request from a cheap one without this.
    if (usage && Object.keys(usage).length > 0) parsed.usage = usage;

    // A Responses-format client (e.g. Codex) forced this provider to stream,
    // but wants JSON back. parseSSEToOpenAIResponse yields a Chat Completions
    // body; share the native JSON conversion so terminal semantics agree.
    const finalBody = aggregationState.nativeResponse
      ? sourceFormat === FORMATS.CLAUDE ? decloakToolNames(aggregationState.nativeResponse, toolNameMap) : nativeGeminiResponseToClient(aggregationState.nativeResponse, sourceFormat)
      : openAICompletionToClient(parsed, sourceFormat, customToolNames);

    return { success: true, response: new Response(JSON.stringify(finalBody), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }) };
  } catch (err) {
    console.error("[ChatCore] Chat Completions SSE→JSON failed:", err);
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Failed to convert streaming response to JSON");
  }
}
