import { outputBudgetError, emptyNonfinalCompletionError, openAICompletionToClient, nativeGeminiResponseToClient } from "./jsonCompletionOutcome.js";
import { convertResponsesStreamToJson } from "../../transformer/streamToJsonConverter.js";
import { createErrorResult } from "../../utils/error.js";
import { HTTP_STATUS } from "../../config/runtimeConfig.js";
import { FORMATS } from "../../translator/formats.js";
import { PROVIDERS } from "../../config/providers.js";
import { buildRequestDetail, extractRequestConfig, extractUsageFromResponse, formatDoneLine } from "./requestDetail.js";
import { acceptUsageRecord } from "./streamingHandler.js";
import { RESPONSES_ITEM } from "../../translator/schema/index.js";
import { extractReasoningText, extractResponsesReasoningText } from "../../translator/concerns/reasoning.js";
import { normalizeTypedContent } from "../../translator/concerns/typedContent.js";
import { translateResponse, initState } from "../../translator/index.js";
import { openaiResponsesObjectToCompletion } from "../../translator/response/openai-responses.js";
import { extractResponseError } from "../../translator/concerns/responseError.js";
import { decloakOpenAIChunk } from "../../utils/toolCompressor.js";
import { decloakToolNames } from "../../utils/claudeCloaking.js";
import { getResponseServiceTier, getServiceTierAccounting } from "../../providers/serviceTiers.js";

import { normalizeResponseIdentity } from "../../utils/streamHelpers.js";
import { extractUsage, canonicalizeUsage, mergeUsage } from "../../utils/usageTracking.js";
import { toOpenAIUsage } from "../../translator/concerns/usage.js";
import { createSSEParser, parseSSEEvent, streamEventPayload, consumeSSEStream, isValidStreamIndex, SSE_COMPLETION_GRACE_MS } from "../../utils/sse.js";
import { unsupportedResponseMedia } from "../../translator/concerns/responseMedia.js";
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
    ...initState(FORMATS.OPENAI), model, targetFormat, sourceFormat: FORMATS.OPENAI, clientFormat: sourceFormat,
    collectNativeResponse: (targetFormat === FORMATS.CLAUDE && sourceFormat === FORMATS.CLAUDE) ||
      (gemini.includes(targetFormat) && gemini.includes(sourceFormat)),
  };
}

function createSSEAggregator(fallbackModel, targetFormat, translationState) {
  const state = translationState || createSSEAggregationState(targetFormat, FORMATS.OPENAI, fallbackModel);
  const choices = new Map();
  let first = null;
  let usage = null;
  let incurredUsage = null;
  let actualServiceTier = null;
  let streamError = null;
  let terminal = false;
  let completionDeadline = null;
  let stopped = false;
  const fail = message => { streamError ||= { type: "stream_error", code: "stream_disconnected", message }; };
  const append = chunk => {
    if (chunk == null) return;
    const failure = extractResponseError(chunk);
    if (failure) { streamError ||= failure.error; return; }
    first ||= { id: chunk.id, created: chunk.created, model: chunk.model };
    actualServiceTier = getResponseServiceTier(chunk) ?? actualServiceTier;
    if (chunk.usage) usage = chunk.usage;
    for (const choice of chunk.choices || []) {
      const index = choice.index ?? 0;
      if (!isValidStreamIndex(index)) throw new RangeError("Invalid upstream choice index");
      const entry = choices.get(index) || { content: [], reasoning: [], refusal: [], details: [], images: [], tools: new Map(), finishReason: null };
      choices.set(index, entry);
      const delta = choice.delta || {};
      normalizeTypedContent(delta);
      if (typeof delta.content === "string") entry.content.push(delta.content);
      if (typeof delta.refusal === "string") entry.refusal.push(delta.refusal);
      const reasoning = extractReasoningText(delta);
      if (reasoning) entry.reasoning.push(reasoning);
      const details = delta.reasoning_details ?? delta.provider_specific_fields?.reasoning_details;
      if (Array.isArray(details)) entry.details.push(...details);
      if (Array.isArray(delta.images)) entry.images.push(...delta.images);
      if (choice.finish_reason) entry.finishReason = choice.finish_reason;
      if (["network_error", "error", "server_error", "timeout"].includes(choice.native_finish_reason || choice.finish_reason)) fail("Upstream generation failed");
      for (const call of delta.tool_calls || []) {
        const toolIndex = call.index ?? 0;
        if (!isValidStreamIndex(toolIndex)) throw new RangeError("Invalid upstream tool index");
        const tool = entry.tools.get(toolIndex) || { id: "", names: [], arguments: [] };
        entry.tools.set(toolIndex, tool);
        if (call.id) tool.id = call.id;
        if (call.function?.name) tool.names.push(call.function.name);
        if (call.function?.arguments) tool.arguments.push(call.function.arguments);
      }
    }
  };
  return {
    event(event) {
      if (stopped) return false;
      const chunk = streamEventPayload(event, parseSSEEvent(event));
      if (event.data.trim() === "[DONE]") {
        stopped = true;
        if (!terminal) fail("Upstream stream closed without a terminal event");
        return false;
      }
      const parsed = !chunk.type && event.event && targetFormat !== FORMATS.OPENAI ? { ...chunk, type: event.event } : chunk;
      incurredUsage = mergeUsage(incurredUsage, extractUsage(parsed));
      const failure = extractResponseError(parsed) || unsupportedResponseMedia(targetFormat, state.clientFormat || FORMATS.OPENAI, parsed);
      if (failure) { usage = failure.usage || canonicalizeUsage(incurredUsage) || usage; streamError = failure.error; stopped = true; return false; }
      actualServiceTier = getResponseServiceTier(parsed) ?? actualServiceTier;
      const isChat = Array.isArray(parsed.choices);
      const type = event.event || parsed.type;
      const nativeTerminal = !isChat && (targetFormat === FORMATS.CLAUDE ? type === "message_stop"
        : targetFormat === FORMATS.OLLAMA ? parsed.done === true
          : (parsed.candidates || parsed.response?.candidates)?.some(candidate => Boolean(candidate.finishReason)));
      for (const converted of (targetFormat === FORMATS.OPENAI || isChat ? [parsed] : translateResponse(targetFormat, FORMATS.OPENAI, parsed, state)) || []) append(converted);
      if (isChat) terminal = choices.size > 0 && [...choices.values()].every(choice => choice.finishReason);
      else if (nativeTerminal) terminal = true;
      if (streamError) { stopped = true; return false; }
      if (nativeTerminal) { stopped = true; return false; }
      if (terminal) completionDeadline ??= Date.now() + SSE_COMPLETION_GRACE_MS;
      else completionDeadline = null;
      return true;
    },
    deadline: () => completionDeadline,
    snapshot() {
      const observedUsage = canonicalizeUsage(incurredUsage) || usage;
      return { ...(observedUsage ? { usage: observedUsage } : {}), ...(actualServiceTier ? { service_tier: actualServiceTier } : {}) };
    },
    result() {
      if (!streamError && targetFormat !== FORMATS.OPENAI) for (const chunk of translateResponse(targetFormat, FORMATS.OPENAI, null, state) || []) append(chunk);
      if (!terminal && !streamError) fail("Upstream stream closed without a terminal event");
      if (streamError) return { error: streamError, ...(usage ? { usage } : {}) };
      if (!first) return null;
      return {
        id: first.id || `chatcmpl-${Date.now()}`, object: "chat.completion", created: first.created || Math.floor(Date.now() / 1000), model: first.model || fallbackModel || "unknown",
        choices: [...choices.entries()].sort((a, b) => a[0] - b[0]).map(([index, entry]) => ({ index, finish_reason: entry.finishReason,
          message: { role: "assistant", content: entry.content.join("") || (entry.tools.size ? null : ""),
            ...(entry.refusal.length ? { refusal: entry.refusal.join("") } : {}), ...(entry.reasoning.length ? { reasoning_content: entry.reasoning.join("") } : {}),
            ...(entry.details.length ? { reasoning_details: entry.details } : {}), ...(entry.images.length ? { images: entry.images } : {}),
            ...(entry.tools.size ? { tool_calls: [...entry.tools.entries()].sort((a, b) => a[0] - b[0]).map(([, tool]) => ({ id: tool.id, type: "function", function: { name: tool.names.join(""), arguments: tool.arguments.join("") } })) } : {}),
          },
        })), ...(usage ? { usage } : {}), ...(actualServiceTier ? { service_tier: actualServiceTier } : {}),
      };
    },
  };
}

export function parseSSEToOpenAIResponse(rawSSE, fallbackModel, targetFormat = FORMATS.OPENAI, translationState = null) {
  const aggregate = createSSEAggregator(fallbackModel, targetFormat, translationState);
  const parser = createSSEParser({ mode: targetFormat === FORMATS.OLLAMA ? "ndjson" : "sse" });
  try {
    let stopped = false;
    for (const event of parser.feed(String(rawSSE || ""))) if (aggregate.event(event) === false) { stopped = true; break; }
    if (!stopped) for (const event of parser.end()) if (aggregate.event(event) === false) break;
    return aggregate.result();
  } catch { return { error: { type: "stream_error", code: "invalid_stream", message: "Invalid upstream stream event" } }; }
  finally { parser.reset(); }
}

export async function convertSSEToOpenAIResponse(stream, fallbackModel, targetFormat = FORMATS.OPENAI, translationState = null, { signal, onAbort } = {}) {
  const aggregate = createSSEAggregator(fallbackModel, targetFormat, translationState);
  try {
    await consumeSSEStream(stream, event => aggregate.event(event), { mode: targetFormat === FORMATS.OLLAMA ? "ndjson" : "sse", signal, deadline: aggregate.deadline });
    return aggregate.result();
  } catch (error) {
    if (signal?.aborted) {
      await onAbort?.(aggregate.snapshot());
      throw signal.reason || error;
    }
    return { error: { type: "stream_error", code: "invalid_stream", message: "Invalid upstream stream event" }, ...aggregate.snapshot() };
  }
}

/**
 * Handle case: provider forced streaming but client wants JSON.
 * Supports both Codex/Responses API SSE and standard Chat Completions SSE.
 */
export async function handleForcedSSEToJson({ providerResponse, sourceFormat, targetFormat = FORMATS.OPENAI, provider, model, body, stream, translatedBody, finalBody, requestStartTime, connectionId, apiKey, clientRawRequest, onRequestSuccess, toolNameMap, customToolNames, trackDone, appendLog, reqTag, log, serviceTier, signal, usageEventId = crypto.randomUUID(), usageTimestamp = new Date().toISOString() }) {
  const contentType = (providerResponse.headers.get("content-type") || "").toLowerCase();
  const isSSE = contentType.includes("text/event-stream") || (contentType === "" && isResponsesProvider(provider)) || (targetFormat === FORMATS.OLLAMA && contentType.includes("application/x-ndjson"));
  if (!isSSE) return null; // not handled here

  trackDone();
  customToolNames = new Set(Array.from(customToolNames || [], name => toolNameMap?.get(name) || name));

  const ctx = {
    provider, model, connectionId, serviceTier,
    request: extractRequestConfig(body, stream),
    providerRequest: finalBody || translatedBody || null
  };
  const onAbort = snapshot => acceptUsageRecord({ provider, model, tokens: extractUsageFromResponse(snapshot), connectionId, apiKey, eventId: usageEventId, timestamp: usageTimestamp, endpoint: clientRawRequest?.endpoint, silent: true, serviceTier: getServiceTierAccounting(provider, serviceTier || { requestedServiceTier: body?.service_tier }, snapshot) });

  // Codex/Responses API SSE path
  // Branch on the UPSTREAM format (targetFormat = format we spoke to the provider in),
  // not the client format: a Responses-API client behind a chat-native forced-streaming
  // provider still receives chat SSE chunks, which must go through the standard path.
  const isCodexResponsesApi = isResponsesProvider(provider) || targetFormat === FORMATS.OPENAI_RESPONSES;
  if (isCodexResponsesApi) {
    try {
      const jsonResponse = decloakOpenAIChunk(await convertResponsesStreamToJson(providerResponse.body, { signal, onAbort }), toolNameMap);
      const usage = jsonResponse.usage || {};
      const recordedUsage = extractUsageFromResponse(jsonResponse);
      ctx.serviceTier = getServiceTierAccounting(provider, serviceTier || { requestedServiceTier: body?.service_tier }, jsonResponse);
      await acceptUsageRecord({ provider, model, tokens: recordedUsage, connectionId, apiKey, eventId: usageEventId, timestamp: usageTimestamp, endpoint: clientRawRequest?.endpoint, silent: true, serviceTier: ctx.serviceTier });
      const nativeFailure = extractResponseError(jsonResponse) || unsupportedResponseMedia(targetFormat, sourceFormat, jsonResponse);
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
        normalizeResponseIdentity(jsonResponse, clientRawRequest?.body?.model);
        return { success: true, response: new Response(JSON.stringify(jsonResponse), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }) };
      }

      if (sourceFormat === FORMATS.CLAUDE) {
        const message = responsesJsonToClaudeMessage(jsonResponse);
        normalizeResponseIdentity(message, clientRawRequest?.body?.model);
        return { success: true, response: new Response(JSON.stringify(message), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }) };
      }

      // Responses input totals already include cache reads/writes. Keep their
      // native subsets instead of adding them again or dropping nested details.
      const chatUsage = toOpenAIUsage(usage, "responses");
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
          ...(getResponseServiceTier(jsonResponse) ? { service_tier: jsonResponse.service_tier } : {}),
          choices: [{ index: 0, message, finish_reason: finishReason }],
          ...(chatUsage ? { usage: chatUsage } : {})
        };
      }
      normalizeResponseIdentity(finalResp, clientRawRequest?.body?.model);

      return { success: true, response: new Response(JSON.stringify(finalResp), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }) };
    } catch (err) {
      if (err?.code === "usage_acceptance_failed") return createErrorResult(503, err.message, null, { code: err.code });
      if (signal?.aborted) throw signal.reason || err;
      console.error("[ChatCore] Responses API SSE→JSON failed");
      return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Failed to convert streaming response to JSON");
    }
  }

  // Standard Chat Completions SSE path
  try {
    const aggregationState = createSSEAggregationState(targetFormat, sourceFormat, model);
    aggregationState.toolNameMap = toolNameMap;
    const parsed = decloakOpenAIChunk(await convertSSEToOpenAIResponse(providerResponse.body, model, targetFormat, aggregationState, { signal, onAbort }), toolNameMap);
    if (!parsed) return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Invalid SSE response for non-streaming request");
    const usage = parsed.usage || {};
    ctx.serviceTier = getServiceTierAccounting(provider, serviceTier || { requestedServiceTier: body?.service_tier }, parsed);
    await acceptUsageRecord({ provider, model, tokens: usage, connectionId, apiKey, endpoint: clientRawRequest?.endpoint, eventId: usageEventId, timestamp: usageTimestamp, silent: true, serviceTier: ctx.serviceTier });
    const failure = extractResponseError(parsed);
    if (failure) {
      appendLog({ tokens: usage, status: `FAILED ${failure.status}` });
      return createErrorResult(failure.status, failure.error.message || "Upstream SSE stream failed", null, failure.error);
    }
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
    normalizeResponseIdentity(finalBody, clientRawRequest?.body?.model);

    return { success: true, response: new Response(JSON.stringify(finalBody), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }) };
  } catch (err) {
    if (err?.code === "usage_acceptance_failed") return createErrorResult(503, err.message, null, { code: err.code });
    if (signal?.aborted) throw signal.reason || err;
    console.error("[ChatCore] Chat Completions SSE→JSON failed");
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Failed to convert streaming response to JSON");
  }
}
