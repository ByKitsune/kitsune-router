import { translateResponse, initState } from "../translator/index.js";
import { FORMATS } from "../translator/formats.js";
import { trackPendingRequest, appendRequestLog } from "@/lib/usageDb.js";
import { extractUsage, mergeUsage, hasValidUsage, estimateUsage, logUsage, COLORS } from "./usageTracking.js";
import { hasValuableContent, hasSemanticContent, normalizeResponseIdentity, formatSSE } from "./streamHelpers.js";
import { isOpenAIResponsesTerminalEvent } from "./responsesStreamHelpers.js";
import { createSSEParser, parseSSEEvent, streamEventPayload, createEventTransform, SSE_COMPLETION_GRACE_MS } from "./sse.js";
import { extractReasoningText, captureResponsesReasoning } from "../translator/concerns/reasoning.js";
import { normalizeTypedContent } from "../translator/concerns/typedContent.js";
import { CLAUDE_BLOCK } from "../translator/schema/index.js";
import { decloakStreamChunk } from "./claudeCloaking.js";
import { restoreOpenAIToolNameDeltas } from "./toolCompressor.js";
import { sanitizeClientError } from "./clientErrors.js";
import { extractResponseError, responseErrorToClient } from "../translator/concerns/responseError.js";
import { unsupportedResponseMedia } from "../translator/concerns/responseMedia.js";
import { getResponseServiceTier } from "../providers/serviceTiers.js";

import { SSE_DONE, SSE_HEADERS, SSE_HEADERS_NO_BUFFER } from "./sseConstants.js";

export { COLORS, formatSSE };
export { SSE_DONE, SSE_HEADERS, SSE_HEADERS_NO_BUFFER };

// sharedEncoder is stateless — safe to share across streams
const sharedEncoder = new TextEncoder();

const responsesFormat = format => format === FORMATS.OPENAI_RESPONSES || format === FORMATS.CODEX;
const failedReasons = new Set(["network_error", "error", "server_error", "timeout"]);
const googleFormats = new Set([FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY, FORMATS.VERTEX]);

function isTerminalPayload(chunk, format, event = null) {
  if (format === FORMATS.OPENAI) return chunk?.choices?.some(choice => Boolean(choice?.finish_reason));
  if (responsesFormat(format)) return isOpenAIResponsesTerminalEvent(event, chunk);
  if (format === FORMATS.CLAUDE) return (event || chunk?.type) === "message_stop";
  if (googleFormats.has(format)) return (chunk?.candidates || chunk?.response?.candidates)?.some(candidate => Boolean(candidate?.finishReason));
  return format === FORMATS.OLLAMA && chunk?.done === true;
}

// Terminal chunk for a stream whose upstream ended without one (#4079, #4080).
// "network_error" maps to a deliberate client-side error instead of presenting a truncated reply.
function buildAbortedOpenAITerminal(model) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    ...(model ? { model } : {}),
    choices: [{ index: 0, delta: {}, finish_reason: "network_error" }]
  };
}

export function buildAbortedOpenAITerminalBytes(model) {
  return sharedEncoder.encode(`data: ${JSON.stringify(buildAbortedOpenAITerminal(model))}\n\n${SSE_DONE}`);
}


function accumulateToolCalls(store, parsed) {
  if (Array.isArray(parsed?.choices)) {
    for (const choice of parsed.choices) for (const call of choice.delta?.tool_calls || []) {
      const key = `chat:${choice.index ?? 0}:${call.index ?? 0}`;
      const entry = store.get(key) || { id: null, names: [], arguments: [] };
      if (call.id) entry.id = call.id;
      if (call.function?.name) entry.names.push(call.function.name);
      if (call.function?.arguments) entry.arguments.push(call.function.arguments);
      store.set(key, entry);
    }
    return;
  }
  const key = `native:${parsed?.index ?? 0}`;
  const block = parsed?.content_block;
  if (block?.type === CLAUDE_BLOCK.TOOL_USE) {
    const entry = store.get(key) || { id: null, names: [], arguments: [] };
    entry.id = block.id || entry.id;
    if (block.name) entry.names.push(block.name);
    store.set(key, entry);
  } else if (typeof parsed?.delta?.partial_json === "string") {
    const entry = store.get(key) || { id: null, names: [], arguments: [] };
    entry.arguments.push(parsed.delta.partial_json);
    store.set(key, entry);
  }
}

/**
 * Stream modes
 */
const STREAM_MODE = {
  TRANSLATE: "translate",    // Full translation between formats
  PASSTHROUGH: "passthrough" // No translation, normalize output, extract usage
};

/**
 * Create unified SSE transform stream
 * @param {object} options
 * @param {string} options.mode - Stream mode: translate, passthrough
 * @param {string} options.targetFormat - Provider format (for translate mode)
 * @param {string} options.sourceFormat - Client format (for translate mode)
 * @param {string} options.provider - Provider name
 * @param {object} options.reqLogger - Request logger instance
 * @param {string} options.model - Model name
 * @param {string} options.connectionId - Connection ID for usage tracking
 * @param {object} options.body - Request body (for input token estimation)
 * @param {function} options.onStreamComplete - Callback when stream completes (content, usage)
 * @param {string} options.apiKey - API key for usage tracking
 */
export function createSSEStream(options = {}) {
  const {
    mode = STREAM_MODE.TRANSLATE,
    sourceFormat = FORMATS.OPENAI,
    targetFormat = sourceFormat,
    provider = null,
    reqLogger = null,
    toolNameMap = null,
    wireToolNames = null,
    customToolNames = null,
    model = null,
    connectionId = null,
    body = null,
    onStreamComplete = null,
    apiKey = null,
    responseModel = null
  } = options;

  const passthrough = mode === STREAM_MODE.PASSTHROUGH || sourceFormat === targetFormat;
  const state = mode === STREAM_MODE.TRANSLATE ? {
    ...initState(sourceFormat), provider, toolNameMap,
    customToolNames: new Set(Array.from(customToolNames || [], name => toolNameMap?.get(name) || name)),
    model, targetFormat, sourceFormat, responseModel,
  } : null;
  if (state) state.declaredToolNames = new Set((body?.tools || []).flatMap(tool => tool.functionDeclarations?.map(fn => fn.name) || [tool.function?.name || tool.name]).filter(Boolean));
  const parser = createSSEParser({ mode: targetFormat === FORMATS.OLLAMA ? "ndjson" : "sse" });
  const responseIdentity = {};
  const toolNameDeltas = { names: new Map(), frames: [] };
  const declaredWireNames = toolNameMap?.size > 0 ? new Set([...toolNameMap.keys(), ...(wireToolNames || [])]) : null;
  const contentChunks = [];
  const thinkingChunks = [];
  const toolCallStore = new Map();
  const terminalListeners = new Set();
  let usage = null;
  let actualServiceTier = null;
  let totalContentLength = 0;
  let ttftAt = null;
  let firstTokenAt = null;
  let lastChunkAt = null;
  let responsesReasoningState;
  let inputTerminalSeen = false;
  let chatInputSeen = false;
  let clientTerminalSeen = false;
  let streamDoneSent = false;
  let finalized = false;
  let disposed = false;
  let finished = false;
  let streamFailed = false;
  let streamErrorMessage = null;
  let streamErrorStatus = 502;
  let completionTimer = null;
  let completionDeadline = null;
  let processing = false;
  let atEOFTail = false;
  let deferredNative = null;
  const deferredClientTerminals = new Map();
  const finishedChoices = new Set();
  const upstreamFinishedChoices = new Set();
  const allChatChoicesFinished = () => upstreamFinishedChoices.size >= (Number.isSafeInteger(body?.n) && body.n > 0 ? body.n : 1);

  const discardPendingTools = () => { toolNameDeltas.names.clear(); toolNameDeltas.frames = []; };
  const clearCompletionTimer = () => { clearTimeout(completionTimer); completionTimer = null; };
  const captureUsage = chunk => {
    actualServiceTier = getResponseServiceTier(chunk) ?? actualServiceTier;
    const extracted = extractUsage(chunk);
    if (!extracted) return;
    const raw = chunk?.response?.usage || chunk?.usage;
    const complete = chunk?.usageMetadata || chunk?.response?.usageMetadata ||
      (raw && (raw.prompt_tokens !== undefined || raw.input_tokens !== undefined) &&
        (raw.completion_tokens !== undefined || raw.output_tokens !== undefined));
    usage = complete ? extracted : chunk?.type === "message_delta" && chunk.delta?.stop_reason
      ? { ...usage, ...extracted } : mergeUsage(usage, extracted);
  };
  const accumulateContent = (parsed, eventName) => {
    const append = (text, thinking = false) => {
      if (typeof text !== "string" || !text) return;
      totalContentLength += text.length;
      (thinking ? thinkingChunks : contentChunks).push(text);
    };
    for (const choice of parsed.choices || []) {
      append(choice.delta?.content);
      append(extractReasoningText(choice.delta), true);
    }
    append(parsed.delta?.text);
    append(parsed.delta?.thinking, true);
    const block = parsed.content_block;
    if (block?.type === CLAUDE_BLOCK.THINKING) append(block.thinking, true);
    else if (block?.type === CLAUDE_BLOCK.TEXT) append(block.text);
    for (const part of (parsed.candidates || parsed.response?.candidates)?.[0]?.content?.parts || []) append(part.text, part.thought === true);
    append(parsed.message?.content);
    append(parsed.message?.thinking, true);
    const type = eventName || parsed.type;
    if (type?.startsWith("response.")) {
      append(captureResponsesReasoning({ event: type, data: parsed }, responsesReasoningState ??= {}), true);
      if (type === "response.output_text.delta") append(parsed.delta);
    }
  };
  const markFailed = (message, status = 502) => {
    if (streamFailed) return;
    streamFailed = true;
    streamErrorStatus = status;
    streamErrorMessage = sanitizeClientError({ message: message || "Upstream stream failed" }, { providerIds: [provider] }).message;
  };
  const publicChunk = (chunk, eventName = null) => {
    const data = chunk?.data && typeof chunk.data === "object" ? chunk.data : chunk;
    const failure = extractResponseError(streamEventPayload({ event: eventName }, data));
    if (!failure) return chunk;
    let safe;
    if (failure.flat) {
      safe = { ...sanitizeClientError(failure.error, { providerIds: [provider] }), type: "error",
        ...(Number.isSafeInteger(data.sequence_number) ? { sequence_number: data.sequence_number } : {}) };
    } else {
      safe = { ...data };
      if (data.error) safe.error = sanitizeClientError(data.error, { providerIds: [provider] });
      if (data.response?.error) safe.response = { ...data.response, error: sanitizeClientError(data.response.error, { providerIds: [provider] }) };
    }
    return data === chunk ? safe : { ...chunk, data: safe };
  };
  const formatClientSSE = (chunk, eventName = null) => {
    normalizeResponseIdentity(chunk, responseModel, responseIdentity);
    const safe = publicChunk(chunk, eventName);
    return formatSSE(eventName ? { event: eventName, data: safe } : safe, sourceFormat);
  };
  let eventIterator = null;
  let pendingEvent = null;
  const captureEventUsage = event => {
    const parsed = streamEventPayload(event, parseSSEEvent(event));
    captureUsage(!parsed.type && event.event && targetFormat !== FORMATS.OPENAI ? { ...parsed, type: event.event } : parsed);
  };
  const getStreamSnapshot = ({ includeBufferedUsage = false } = {}) => {
    if (includeBufferedUsage) {
      try {
        if (pendingEvent) captureEventUsage(pendingEvent);
        for (const event of eventIterator || []) captureEventUsage(event);
      } catch {}
      pendingEvent = null;
    }
    return {
      content: contentChunks.join(""), thinking: thinkingChunks.join(""),
      usage: usage || state?.usage || (totalContentLength > 0 ? estimateUsage(body, totalContentLength, passthrough ? FORMATS.OPENAI : sourceFormat) : null),
      ...(actualServiceTier ? { actualServiceTier } : {}), ttftAt,
    };
  };
  let completionAcceptance = null;
  const finalizeStream = () => {
    clearCompletionTimer();
    if (finalized) return completionAcceptance;
    finalized = true;
    const snapshot = getStreamSnapshot();
    const finalUsage = snapshot.usage;
    if (streamFailed) appendRequestLog({ model, provider, connectionId, tokens: finalUsage, status: `FAILED ${streamErrorStatus}` }).catch(() => {});
    else if (hasValidUsage(finalUsage)) logUsage(passthrough ? provider : (state?.provider || targetFormat), finalUsage, model, connectionId, apiKey);
    else appendRequestLog({ model, provider, connectionId, tokens: null, status: "200 OK" }).catch(() => {});
    completionAcceptance = onStreamComplete?.({ content: snapshot.content, thinking: snapshot.thinking,
      toolCalls: [...toolCallStore.values()].map(call => ({ id: call.id, name: call.names.join(""), arguments: call.arguments.join("") })).filter(call => call.name || call.arguments),
    }, finalUsage, ttftAt, { failed: streamFailed, error: streamErrorMessage,
      ...(actualServiceTier ? { actualServiceTier } : {}), ...(streamFailed ? { status: streamErrorStatus } : {}),
    }, firstTokenAt);
    trackPendingRequest(model, provider, connectionId, false);
    return completionAcceptance;
  };
  const emit = (controller, text) => {
    reqLogger?.appendConvertedChunk?.(text);
    controller.enqueue(sharedEncoder.encode(text));
  };
  const emitDone = controller => {
    if (streamDoneSent || !(sourceFormat === FORMATS.OPENAI || responsesFormat(sourceFormat))) return;
    streamDoneSent = true;
    emit(controller, SSE_DONE);
  };
  const finish = async controller => {
    if (finished || disposed) return;
    await finalizeStream();
    if (disposed) return;
    emitDone(controller);
    finished = true;
    clearCompletionTimer();
    parser.reset();
    discardPendingTools();
    controller.terminate();
    for (const listener of terminalListeners) { try { listener(); } catch {} }
    terminalListeners.clear();
  };
  const emitClientChunk = async (item, controller, eventName = null, truncated = false, releaseTerminal = false) => {
    if (item == null || (item.done === true && Object.keys(item).length === 1) || !hasValuableContent(item.data || item, sourceFormat)) return;
    let data = item.data || item;
    if (chatInputSeen && sourceFormat === FORMATS.OPENAI && !releaseTerminal && !extractResponseError(data) && data.choices?.some(choice => choice.finish_reason)) {
      for (const choice of data.choices) {
        if (!choice.finish_reason || finishedChoices.has(choice.index ?? 0)) continue;
        const key = `choice:${choice.index ?? 0}`;
        if (deferredClientTerminals.has(key)) continue;
        const terminalData = { ...data, choices: [{ ...choice, delta: {} }] };
        delete terminalData.usage;
        deferredClientTerminals.set(key, { item: item.data ? { ...item, data: terminalData } : terminalData, eventName });
      }
      data = { ...data, choices: data.choices.map(choice => choice.finish_reason ? { ...choice, finish_reason: null } : choice) };
      item = item.data ? { ...item, data } : data;
      armCompletion(controller);
      if (!hasValuableContent(data, sourceFormat)) return;
    }
    const terminal = isTerminalPayload(data, sourceFormat, item.event || eventName);
    if (truncated && terminal && !extractResponseError(data)) return;
    const deferredMessageDelta = chatInputSeen && sourceFormat === FORMATS.CLAUDE && data.type === "message_delta" && data.delta?.stop_reason;
    if ((terminal || deferredMessageDelta) && chatInputSeen && sourceFormat !== FORMATS.OPENAI && !releaseTerminal && !extractResponseError(data)) {
      deferredClientTerminals.set(deferredMessageDelta ? "message_delta" : "terminal", { item, eventName });
      armCompletion(controller);
      return;
    }
    if (Array.isArray(data.choices)) {
      for (const choice of data.choices) {
        if (choice.finish_reason === "") choice.finish_reason = null;
        if (choice.finish_reason) {
          const key = choice.index ?? 0;
          if (finishedChoices.has(key)) choice.finish_reason = null;
          else finishedChoices.add(key);
        }
        delete choice.content_filter_results;
        if (Array.isArray(choice.delta?.tool_calls) && choice.delta.tool_calls.length === 0) delete choice.delta.tool_calls;
        normalizeTypedContent(choice.delta);
        const delta = choice.delta;
        if (!atEOFTail && typeof delta?.reasoning === "string" && delta.reasoning_content === undefined) delta.reasoning_content = delta.reasoning;
        else if (!atEOFTail && typeof delta?.reasoning_content === "string" && delta.reasoning === undefined) delta.reasoning = delta.reasoning_content;
      }
      data.object ||= "chat.completion.chunk";
      data.created ||= Math.floor(Date.now() / 1000);
    }
    delete data.prompt_filter_results;
    accumulateToolCalls(toolCallStore, data);
    if (terminal) {
      await finalizeStream();
      clientTerminalSeen = true;
    }
    if (!disposed) emit(controller, formatClientSSE(item, eventName));
  };
  const translate = async (parsed, controller, eventName = null, truncated = false) => {
    if (passthrough) { await emitClientChunk(parsed, controller, eventName, truncated); return; }
    const translated = translateResponse(targetFormat, sourceFormat, parsed, state);
    if (translated?._openaiIntermediate) for (const item of translated._openaiIntermediate) reqLogger?.appendOpenAIChunk?.(formatSSE(item, FORMATS.OPENAI));
    for (const item of translated || []) {
      await controller.ready();
      if (disposed || finished) return;
      await emitClientChunk(item, controller, null, truncated);
    }
  };
  const restoreTools = parsed => restoreOpenAIToolNameDeltas(parsed, toolNameMap, toolNameDeltas, declaredWireNames)
    .map(item => decloakStreamChunk(item, toolNameMap));
  const flushTranslation = async (controller, truncated = false) => {
    for (const parsed of restoreTools(null)) {
      await controller.ready();
      if (disposed || finished) return;
      await translate(parsed, controller, null, truncated);
    }
    if (!passthrough) await translate(null, controller, null, truncated);
  };
  const fail = async (message, controller, failure = null) => {
    if (finished || disposed) return;
    clearCompletionTimer();
    deferredNative = null;
    deferredClientTerminals.clear();
    markFailed(message, failure?.status);
    discardPendingTools();
    await finalizeStream();
    if (disposed) return;
    if (sourceFormat === FORMATS.OPENAI && !failure) {
      clientTerminalSeen = true;
      emit(controller, formatClientSSE(buildAbortedOpenAITerminal(model)));
    } else {
      const info = failure || { error: { type: "stream_error", code: "stream_disconnected", message }, status: 502 };
      emit(controller, formatClientSSE(responseErrorToClient(sourceFormat, info, state)));
      clientTerminalSeen = true;
    }
    await finish(controller);
  };
  let completionWork = null;
  const flushDeferred = controller => {
    if (completionWork) return completionWork;
    clearCompletionTimer();
    completionWork = (async () => {
      if (deferredNative) {
        const { parsed, eventName, trailer } = deferredNative;
        deferredNative = null;
        let terminalChunk = !passthrough && !parsed.type && eventName ? { ...parsed, type: eventName } : parsed;
        if (!passthrough && trailer && googleFormats.has(targetFormat)) {
          const usageMetadata = trailer.parsed.response?.usageMetadata || trailer.parsed.usageMetadata;
          terminalChunk = parsed.response ? { ...terminalChunk, response: { ...terminalChunk.response, usageMetadata } } : { ...terminalChunk, usageMetadata };
        }
        await controller.ready();
        if (disposed || finished) return;
        await translate(terminalChunk, controller, eventName);
        if (!clientTerminalSeen) await flushTranslation(controller);
        if (passthrough && trailer) {
          await controller.ready();
          if (disposed || finished) return;
          await translate(trailer.parsed, controller, trailer.eventName);
        }
      } else await flushTranslation(controller);
      if (disposed || finished) return;
      const terminals = [...deferredClientTerminals.values()];
      deferredClientTerminals.clear();
      for (const { item, eventName } of terminals) {
        const data = item.data || item;
        const actualUsage = usage || state?.usage;
        if (actualUsage && responsesFormat(sourceFormat) && data.response) {
          data.response.usage = { input_tokens: actualUsage.prompt_tokens ?? actualUsage.input_tokens ?? 0,
            output_tokens: actualUsage.completion_tokens ?? actualUsage.output_tokens ?? 0,
            total_tokens: (actualUsage.prompt_tokens ?? actualUsage.input_tokens ?? 0) + (actualUsage.completion_tokens ?? actualUsage.output_tokens ?? 0),
            ...(actualUsage.prompt_tokens_details ? { input_tokens_details: actualUsage.prompt_tokens_details } : {}),
            ...(actualUsage.completion_tokens_details ? { output_tokens_details: actualUsage.completion_tokens_details } : {}),
            ...(actualUsage.cache_write_invalid ? { cache_write_invalid: true } : {}),
            ...(actualUsage.usage_invalid ? { usage_invalid: true } : {}),
          };
        } else if (actualUsage && sourceFormat === FORMATS.CLAUDE && data.type === "message_delta") data.usage = state?.claudeUsage || state?.usage || data.usage;
        await controller.ready();
        if (disposed || finished) return;
        await emitClientChunk(item, controller, eventName, false, true);
      }
      if (!clientTerminalSeen) return fail("Upstream stream closed without a finish reason", controller);
      await finish(controller);
    })();
    return completionWork;
  };
  const armCompletion = controller => {
    if (chatInputSeen && !allChatChoicesFinished()) return;
    completionDeadline ??= Date.now() + SSE_COMPLETION_GRACE_MS;
    if (processing || completionTimer || completionWork || disposed || finished) return;
    completionTimer = setTimeout(() => {
      completionTimer = null;
      if (!processing && !finished && !disposed) void flushDeferred(controller).catch(error => controller.error(error));
    }, Math.max(0, completionDeadline - Date.now()));
  };
  const handleEvent = async (event, controller) => {
    if (finished || disposed) return;
    let parsed;
    try { parsed = streamEventPayload(event, parseSSEEvent(event)); }
    catch { await fail("Invalid upstream stream event", controller); return; }
    if (event.data.trim() === "[DONE]") {
      if (!inputTerminalSeen) {
        await flushTranslation(controller, true);
        await fail("Upstream stream closed without a terminal event", controller);
      } else await flushDeferred(controller);
      return;
    }
    const eventName = event.event || parsed.type || null;
    const accountingChunk = !parsed.type && event.event && targetFormat !== FORMATS.OPENAI ? { ...parsed, type: event.event } : parsed;
    captureUsage(accountingChunk);
    if (state) {
      const extracted = extractUsage(accountingChunk);
      if (extracted) state.usage = mergeUsage(state.usage, extracted);
    }
    const failure = extractResponseError(parsed) || unsupportedResponseMedia(targetFormat, sourceFormat, parsed);
    if (failure) {
      if (responsesFormat(sourceFormat) && responsesFormat(targetFormat)) {
        markFailed(failure.error.message, failure.status);
        await finalizeStream();
        if (disposed) return;
        emit(controller, formatClientSSE(parsed, event.event));
        clientTerminalSeen = true;
        await finish(controller);
      } else await fail(failure.error.message || "Upstream stream failed", controller, failure);
      return;
    }
    if (parsed.choices?.some(choice => failedReasons.has(choice?.native_finish_reason || choice?.finish_reason))) { await fail("Upstream stream failed", controller); return; }
    if (firstTokenAt === null && hasSemanticContent(accountingChunk, eventName)) firstTokenAt = lastChunkAt;
    accumulateContent(accountingChunk, eventName);
    for (const choice of parsed.choices || []) normalizeTypedContent(choice.delta);
    const chatInput = Array.isArray(parsed.choices);
    chatInputSeen ||= chatInput;
    for (const choice of parsed.choices || []) {
      const index = choice.index ?? 0;
      if (choice.finish_reason) upstreamFinishedChoices.add(index);
    }
    const nativeTerminal = chatInput ? allChatChoicesFinished() : isTerminalPayload(parsed, targetFormat, eventName);
    if (chatInput || nativeTerminal) inputTerminalSeen = Boolean(nativeTerminal);
    if (chatInput && !nativeTerminal) completionDeadline = null;
    const googleUsage = parsed.response?.usageMetadata || parsed.usageMetadata;
    if (nativeTerminal && !chatInput && ((responsesFormat(targetFormat) && !parsed.response?.usage) || (googleFormats.has(targetFormat) && !googleUsage))) {
      deferredNative = { parsed, eventName: event.event }; armCompletion(controller); return;
    }
    if (deferredNative && googleFormats.has(targetFormat) && googleUsage && !(parsed.candidates || parsed.response?.candidates)?.length) {
      deferredNative.trailer = { parsed, eventName: event.event };
      await flushDeferred(controller);
      return;
    }
    const translatorChunk = !passthrough && !parsed.type && event.event ? { ...parsed, type: event.event } : parsed;
    for (const restored of restoreTools(translatorChunk)) {
      await controller.ready();
      if (disposed || finished) return;
      await translate(restored, controller, passthrough ? event.event : null);
    }
    if (deferredNative && (parsed.usage || parsed.response?.usage)) { await flushDeferred(controller); return; }
    if (nativeTerminal && !chatInput) {
      if (!clientTerminalSeen) await flushTranslation(controller);
      await finish(controller);
    } else if (inputTerminalSeen) {
      const trailer = Array.isArray(parsed.choices) && parsed.choices.length === 0 && parsed.usage;
      if (trailer && deferredClientTerminals.size) await flushDeferred(controller);
      else armCompletion(controller);
    }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearCompletionTimer();
    deferredNative = null;
    deferredClientTerminals.clear();
    discardPendingTools();
    parser.reset();
    terminalListeners.clear();
  };
  const sseStream = createEventTransform({
    async transform(chunk, controller) {
      if (finished || disposed) return;
      lastChunkAt = Date.now();
      ttftAt ??= lastChunkAt;
      reqLogger?.appendProviderChunk?.(chunk);
      processing = true;
      clearCompletionTimer();
      eventIterator = parser.feed(chunk);
      try {
        for (const event of eventIterator) {
          pendingEvent = event;
          await controller.ready();
          if (finished || disposed) break;
          pendingEvent = null;
          await handleEvent(event, controller);
          if (finished || disposed) break;
        }
      } catch (error) {
        if (error?.code === "usage_acceptance_failed") throw error;
        await fail(error instanceof RangeError ? "Upstream stream event exceeds limit" : "Invalid upstream stream event", controller);
      } finally {
        eventIterator = null;
        pendingEvent = null;
        processing = false;
        if (inputTerminalSeen && !finished && !disposed) armCompletion(controller);
      }
    },
    async flush(controller) {
      if (finished || disposed) return;
      processing = true;
      atEOFTail = true;
      clearCompletionTimer();
      try {
        for (const event of parser.end()) {
          await controller.ready();
          if (finished || disposed) return;
          await handleEvent(event, controller);
          if (finished || disposed) break;
        }
        if (finished || disposed) return;
        if (!inputTerminalSeen) { await flushTranslation(controller, true); await fail("Upstream stream closed without a terminal event", controller); }
        else await flushDeferred(controller);
      } finally { processing = false; }
    },
    cancel: dispose,
  });
  void sseStream.whenClosed.then(dispose);
  sseStream.getStreamSnapshot = getStreamSnapshot;
  sseStream.isTerminal = () => finished;
  sseStream.onTerminal = listener => { if (finished) listener(); else terminalListeners.add(listener); return () => terminalListeners.delete(listener); };
  sseStream.dispose = dispose;
  sseStream.abortTerminalBytes = message => {
    if (finished || streamDoneSent) return null;
    const deliver = bytes => completionAcceptance && typeof completionAcceptance.then === "function" ? completionAcceptance.then(() => bytes) : bytes;
    if (clientTerminalSeen && sourceFormat === FORMATS.OPENAI) { finalizeStream(); streamDoneSent = true; return deliver(sharedEncoder.encode(SSE_DONE)); }
    if (clientTerminalSeen) return null;
    markFailed(message || "Upstream connection lost");
    finalizeStream();
    clientTerminalSeen = true;
    const item = sourceFormat === FORMATS.OPENAI ? buildAbortedOpenAITerminal(model)
      : responseErrorToClient(sourceFormat, { error: { type: "stream_error", code: "stream_disconnected", message: message || "stream closed before response.completed" } }, state);
    const needsDone = sourceFormat === FORMATS.OPENAI || responsesFormat(sourceFormat);
    streamDoneSent = needsDone;
    return deliver(sharedEncoder.encode(formatClientSSE(item) + (needsDone ? SSE_DONE : "")));
  };
  return sseStream;
}

export function createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider = null, reqLogger = null, toolNameMap = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null, customToolNames = null, responseModel = null, wireToolNames = null) {
  return createSSEStream({
    mode: STREAM_MODE.TRANSLATE,
    targetFormat,
    sourceFormat,
    provider,
    reqLogger,
    toolNameMap,
    wireToolNames,
    customToolNames,
    model,
    connectionId,
    body,
    onStreamComplete,
    apiKey,
    responseModel
  });
}

export function createPassthroughStreamWithLogger(provider = null, reqLogger = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null, toolNameMap = null, format = FORMATS.OPENAI, wireToolNames = null, responseModel = null) {
  return createSSEStream({
    mode: STREAM_MODE.PASSTHROUGH,
    sourceFormat: format,
    targetFormat: format,
    toolNameMap,
    wireToolNames,
    provider,
    reqLogger,
    model,
    connectionId,
    body,
    onStreamComplete,
    apiKey,
    responseModel
  });
}
