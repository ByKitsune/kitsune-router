import { translateResponse, initState } from "../translator/index.js";
import { FORMATS } from "../translator/formats.js";
import { trackPendingRequest, appendRequestLog } from "@/lib/usageDb.js";
import { extractUsage, mergeUsage, hasValidUsage, estimateUsage, logUsage, COLORS } from "./usageTracking.js";
import { parseSSELine, hasValuableContent, hasSemanticContent, fixInvalidId, formatSSE } from "./streamHelpers.js";
import { getOpenAIResponsesEventName, isOpenAIResponsesTerminalEvent, formatIncompleteOpenAIResponsesStreamFailure } from "./responsesStreamHelpers.js";
import { dbg, isDebugEnabled } from "./debugLog.js";
import { extractReasoningText, captureResponsesReasoning } from "../translator/concerns/reasoning.js";
import { normalizeTypedContent } from "../translator/concerns/typedContent.js";
import { CLAUDE_BLOCK } from "../translator/schema/index.js";
import { decloakStreamChunk } from "./claudeCloaking.js";
import { restoreOpenAIToolNameDeltas } from "./toolCompressor.js";
import { sanitizeClientError } from "@/shared/utils/clientErrors.js";
import { extractResponseError, responseErrorToClient } from "../translator/concerns/responseError.js";

import { SSE_DONE, SSE_HEADERS, SSE_HEADERS_NO_BUFFER } from "./sseConstants.js";

export { COLORS, formatSSE };
export { SSE_DONE, SSE_HEADERS, SSE_HEADERS_NO_BUFFER };

// sharedEncoder is stateless — safe to share across streams
const sharedEncoder = new TextEncoder();

// A truthy finish_reason tells an OpenAI client the turn is over.
const hasOpenAITerminal = (chunk) => !!chunk?.choices?.[0]?.finish_reason;

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
  const calls = parsed?.choices?.[0]?.delta?.tool_calls;
  if (Array.isArray(calls)) {
    for (const call of calls) {
      const index = call.index ?? 0;
      const entry = store.get(index) || { id: null, name: "", arguments: "" };
      if (call.id) entry.id = call.id;
      if (call.function?.name) entry.name += call.function.name;
      if (call.function?.arguments) entry.arguments += call.function.arguments;
      store.set(index, entry);
    }
    return;
  }

  const block = parsed?.content_block;
  if (block?.type === "tool_use") {
    const index = parsed.index ?? 0;
    const entry = store.get(index) || { id: null, name: "", arguments: "" };
    entry.id = block.id || entry.id;
    entry.name += block.name || "";
    store.set(index, entry);
    return;
  }

  const delta = parsed?.delta;
  if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
    const index = parsed.index ?? 0;
    const entry = store.get(index) || { id: null, name: "", arguments: "" };
    entry.arguments += delta.partial_json;
    store.set(index, entry);
  }
}

/**
 * Stream modes
 */
const STREAM_MODE = {
  TRANSLATE: "translate",    // Full translation between formats
  PASSTHROUGH: "passthrough" // No translation, normalize output, extract usage
};

// Upper bound on the deferred response.completed wait: a chat->responses stream
// that saw finish_reason without usage must not hold the client's terminal event
// forever when the upstream stalls with no usage trailer and no [DONE].
const PENDING_COMPLETION_FLUSH_MS = 3000;

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

  let buffer = "";
  let usage = null;
  // Keep raw accounting separate from translator state (which may be normalized
  // for a client). Complete provider snapshots replace older counters, even zero;
  // Anthropic's split/cumulative events still merge field by field.
  const captureUsage = (chunk) => {
    const extracted = extractUsage(chunk);
    if (!extracted) return;
    const raw = chunk?.response?.usage || chunk?.usage;
    const complete = chunk?.usageMetadata || chunk?.response?.usageMetadata ||
      (raw && (raw.prompt_tokens !== undefined || raw.input_tokens !== undefined) &&
        (raw.completion_tokens !== undefined || raw.output_tokens !== undefined));
    usage = complete ? extracted
      : chunk?.type === "message_delta" && chunk.delta?.stop_reason
        ? { ...usage, ...extracted }
        : mergeUsage(usage, extracted);
  };

  // Per-stream decoder with stream:true to correctly handle multi-byte chars split across chunks
  const decoder = new TextDecoder("utf-8", { fatal: false });

  const state = mode === STREAM_MODE.TRANSLATE
    ? { ...initState(sourceFormat), provider, toolNameMap, customToolNames: new Set(Array.from(customToolNames || [], name => toolNameMap?.get(name) || name)), model, targetFormat, sourceFormat, responseModel }
    : null;
  if (state) state.declaredToolNames = new Set((body?.tools || []).flatMap(tool => tool.functionDeclarations?.map(fn => fn.name) || [tool.function?.name || tool.name]).filter(Boolean));
  const toolNameDeltas = { names: new Map(), frames: [] };
  const declaredWireNames = toolNameMap?.size > 0 ? new Set([...(toolNameMap.keys()), ...(wireToolNames || [])]) : null;
  const discardPendingToolNames = () => {
    toolNameDeltas.names.clear();
    toolNameDeltas.frames = [];
  };
  const restoreToolNames = (chunk) => {
    if (Array.isArray(chunk?.choices) && chunk.choices.some(choice => choice?.finish_reason &&
        ["network_error", "error", "server_error", "timeout"].includes(choice.native_finish_reason || choice.finish_reason))) {
      discardPendingToolNames();
    }
    return restoreOpenAIToolNameDeltas(chunk, toolNameMap, toolNameDeltas, declaredWireNames)
      .map(item => decloakStreamChunk(item, toolNameMap));
  };
  const publicChunk = (chunk) => {
    const data = chunk?.data && typeof chunk.data === "object" ? chunk.data : chunk;
    const flat = data?.type === "error" && !data.error;
    if (!data?.error && !data?.response?.error && !flat) return chunk;
    const safe = flat ? {
      ...sanitizeClientError(extractResponseError(data).error, { providerIds: [provider] }), type: "error",
      ...(Number.isSafeInteger(data.sequence_number) ? { sequence_number: data.sequence_number } : {}),
    } : { ...data };
    if (data.error) safe.error = sanitizeClientError(data.error, { providerIds: [provider] });
    if (data.response?.error) safe.response = { ...data.response, error: sanitizeClientError(data.response.error, { providerIds: [provider] }) };
    return data === chunk ? safe : { ...chunk, data: safe };
  };
  const formatClientSSE = (chunk) => formatSSE(publicChunk(chunk), sourceFormat);

  let totalContentLength = 0;
  const contentChunks = [];
  const thinkingChunks = [];
  const toolCallStore = new Map();
  let ttftAt = null;
  let firstTokenAt = null;
  let lastChunkAt = null;
  let sseLineCount = 0;
  let sseEmittedCount = 0;
  const eventTypeCounts = {};

  // Track Responses API event framing for same-format passthrough (codex)
  let currentOpenAIResponsesEvent = null;
  let openAIResponsesTerminalSeen = false;
  let openAIResponsesDoneSent = false;
  let streamDoneSent = false;  // track duplicate [DONE] across transform + flush
  let passthroughFinishSeen = false;  // passthrough: duplicate finish chunks from upstream
  let passthroughDoneSent = false;    // passthrough: upstream already sent [DONE]
  let passthroughAtEventBoundary = true;
  let clientTerminalSeen = false;
  let finalized = false;
  let completionFlushTimer = null;
  let upstreamErrorTerminated = false;

  const accumulateOpenAIContent = (parsed) => {
    const delta = parsed?.choices?.[0]?.delta;
    if (!delta) return;
    if (typeof delta.content === "string" && delta.content) {
      totalContentLength += delta.content.length;
      contentChunks.push(delta.content);
    }
    const reasoning = extractReasoningText(delta);
    if (reasoning) {
      totalContentLength += reasoning.length;
      thinkingChunks.push(reasoning);
    }
  };

  let responsesReasoningState;
  const accumulateProviderContent = (parsed) => {
    if (!parsed) return;
    accumulateOpenAIContent(parsed);
    if (typeof parsed.delta?.text === "string" && parsed.delta.text) {
      totalContentLength += parsed.delta.text.length;
      contentChunks.push(parsed.delta.text);
    }
    if (typeof parsed.delta?.thinking === "string" && parsed.delta.thinking) {
      totalContentLength += parsed.delta.thinking.length;
      thinkingChunks.push(parsed.delta.thinking);
    }
    const block = parsed.content_block;
    if (block?.type === CLAUDE_BLOCK.THINKING && typeof block.thinking === "string" && block.thinking) {
      totalContentLength += block.thinking.length;
      thinkingChunks.push(block.thinking);
    } else if (block?.type === CLAUDE_BLOCK.TEXT && typeof block.text === "string" && block.text) {
      totalContentLength += block.text.length;
      contentChunks.push(block.text);
    }
    const parts = (parsed.candidates || parsed.response?.candidates)?.[0]?.content?.parts;
    for (const part of parts || []) {
      if (typeof part?.text !== "string" || !part.text) continue;
      totalContentLength += part.text.length;
      (part.thought === true ? thinkingChunks : contentChunks).push(part.text);
    }
    const type = parsed.type || currentOpenAIResponsesEvent;
    if (type?.startsWith("response.")) {
      const event = parsed.type ? parsed : { event: type, data: parsed };
      const reasoning = captureResponsesReasoning(event, responsesReasoningState ??= {});
      if (reasoning) {
        totalContentLength += reasoning.length;
        thinkingChunks.push(reasoning);
      }
      if (type === "response.output_text.delta" && typeof parsed.delta === "string" && parsed.delta) {
        totalContentLength += parsed.delta.length;
        contentChunks.push(parsed.delta);
      }
    }
  };

  const captureFirstToken = (parsed, observedAt = lastChunkAt) => {
    if (firstTokenAt === null && hasSemanticContent(parsed, currentOpenAIResponsesEvent)) firstTokenAt = observedAt;
  };

  // In-stream failure tracking (#4104): an upstream can end an HTTP-200 stream
  // with a failure INSIDE the event body (Responses response.failed / error
  // event). Without tracking, usage/logging records the request as "success".
  let streamFailed = false;
  let streamErrorMessage = null;
  let streamErrorStatus = 502;
  const markStreamFailed = (msg, status = 502) => {
    if (streamFailed) return;
    streamErrorStatus = status;
    streamFailed = true;
    if (typeof msg === "string" && msg.trim()) streamErrorMessage = msg.trim().slice(0, 500);
  };
  // Extract a human message from a failure-shaped chunk ({response.error} or {error}).
  const extractStreamErrorMessage = (parsed, fallback) => {
    const err = extractResponseError(parsed)?.error;
    const msg = typeof err === "string" ? err : err?.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 500);
    return fallback;
  };

  // Error objects are terminal protocol events, not completion deltas. Handle
  // them before format translators' choices/content guards can discard them.
  const emitUpstreamError = (parsed, controller) => {
    const failure = extractResponseError(parsed);
    if (!failure || upstreamErrorTerminated) return false;
    markStreamFailed(extractStreamErrorMessage(parsed, "upstream stream failed"), failure.status);
    captureUsage(parsed);
    const nativeResponses = (sourceFormat === FORMATS.OPENAI_RESPONSES || sourceFormat === FORMATS.CODEX)
      && (targetFormat === FORMATS.OPENAI_RESPONSES || targetFormat === FORMATS.CODEX);
    if (nativeResponses && (failure.response || failure.flat)) return false;
    discardPendingToolNames();
    upstreamErrorTerminated = true;
    const output = formatClientSSE(responseErrorToClient(sourceFormat, failure, state));
    reqLogger?.appendConvertedChunk?.(output);
    controller.enqueue(sharedEncoder.encode(output));
    sseEmittedCount++;
    if (sourceFormat === FORMATS.OPENAI || sourceFormat === FORMATS.OPENAI_RESPONSES) {
      reqLogger?.appendConvertedChunk?.(SSE_DONE);
      controller.enqueue(sharedEncoder.encode(SSE_DONE));
      streamDoneSent = true;
    }
    finalizeStream();
    trackPendingRequest(model, provider, connectionId, false);
    controller.terminate();
    return true;
  };

  // Usage/logging tail, callable from transform() as well as flush(): a client that
  // closes right after the terminal event cancels the reader, and flush() never runs.
  const finalizeStream = () => {
    if (completionFlushTimer) { clearTimeout(completionFlushTimer); completionFlushTimer = null; }
    if (finalized) return;
    finalized = true;

    const isPassthrough = mode === STREAM_MODE.PASSTHROUGH;
    let finalUsage = usage || state?.usage;

    if (!finalUsage && totalContentLength > 0) {
      finalUsage = estimateUsage(body, totalContentLength, isPassthrough ? FORMATS.OPENAI : sourceFormat);
      if (isPassthrough) usage = finalUsage; else state.usage = finalUsage;
    }

    if (streamFailed) {
      appendRequestLog({ model, provider, connectionId, tokens: finalUsage, status: `FAILED ${streamErrorStatus}` }).catch(() => {});
    } else if (hasValidUsage(finalUsage)) {
      logUsage(isPassthrough ? provider : (state?.provider || targetFormat), finalUsage, model, connectionId, apiKey);
    } else {
      appendRequestLog({ model, provider, connectionId, tokens: null, status: "200 OK" }).catch(() => { });
    }

    if (onStreamComplete) {
      onStreamComplete({
        content: contentChunks.join(""),
        thinking: thinkingChunks.join(""),
        toolCalls: [...toolCallStore.values()].filter((call) => call.name || call.arguments)
      }, finalUsage, ttftAt, { failed: streamFailed, error: streamErrorMessage, ...(streamFailed ? { status: streamErrorStatus } : {}) }, firstTokenAt);
    }
  };

  // Emit the deferred response.completed now — at [DONE], or when the watchdog
  // below gives up on a usage trailer that never arrives.
  const flushPendingCompletion = (controller) => {
    const completed = translateResponse(targetFormat, sourceFormat, null, state);
    for (const item of completed || []) {
      if (item === null || item === undefined) continue;
      const output = formatClientSSE(item);
      reqLogger?.appendConvertedChunk?.(output);
      controller.enqueue(sharedEncoder.encode(output));
      sseEmittedCount++;
    }
    finalizeStream();
  };

  // Snapshot partial output even when cancellation prevents TransformStream.flush.
  const getStreamSnapshot = () => {
    const seenUsage = usage || state?.usage;
    const resolvedUsage = seenUsage
      ? seenUsage
      : (totalContentLength > 0
          ? estimateUsage(body, totalContentLength, mode === STREAM_MODE.PASSTHROUGH ? FORMATS.OPENAI : sourceFormat)
          : null);
    return {
      content: contentChunks.join(""),
      thinking: thinkingChunks.join(""),
      usage: resolvedUsage,
      ttftAt,
    };
  };

  const emitPassthroughChunk = (parsed, controller, bufferedTail = false, originalLine = null, accounted = false, rewritten = false) => {
    let fieldsInjected = originalLine === null || rewritten;
    // HTTP 200 does not make a native in-band failure successful.
    if (parsed?.response?.status === "failed" || parsed?.type === "error") {
      markStreamFailed(extractStreamErrorMessage(parsed, "upstream stream failed"));
    }
    const sanitized = publicChunk(parsed);
    if (sanitized !== parsed) { parsed = sanitized; fieldsInjected = true; }
    const idFixed = sourceFormat === FORMATS.OPENAI && fixInvalidId(parsed);

    // Queued frames retain the normal compatibility handling when released.
    if (parsed.choices !== undefined) {
      if (!parsed.object) { parsed.object = "chat.completion.chunk"; fieldsInjected = true; }
      if (!parsed.created) { parsed.created = Math.floor(Date.now() / 1000); fieldsInjected = true; }
    }
    if (parsed.prompt_filter_results !== undefined) {
      delete parsed.prompt_filter_results;
      fieldsInjected = true;
    }
    if (Array.isArray(parsed.choices)) for (const choice of parsed.choices) {
      if (choice.content_filter_results !== undefined) {
        delete choice.content_filter_results;
        fieldsInjected = true;
      }
      // Empty arrays prematurely end AI SDK reasoning tracking.
      if (Array.isArray(choice.delta?.tool_calls) && choice.delta.tool_calls.length === 0) {
        delete choice.delta.tool_calls;
        fieldsInjected = true;
      }
      if (normalizeTypedContent(choice.delta)) fieldsInjected = true;
    }
    if (!hasValuableContent(parsed, sourceFormat)) return;

    const delta = parsed.choices?.[0]?.delta;
    if (delta && !bufferedTail) {
      if (typeof delta.reasoning === "string" && delta.reasoning_content === undefined) {
        delta.reasoning_content = delta.reasoning;
        fieldsInjected = true;
      } else if (typeof delta.reasoning_content === "string" && delta.reasoning === undefined) {
        delta.reasoning = delta.reasoning_content;
        fieldsInjected = true;
      }
    }
    if (!accounted) {
      accumulateProviderContent(parsed);
      captureUsage(parsed);
    }
    accumulateToolCalls(toolCallStore, parsed);

    const responsesTerminal = isOpenAIResponsesTerminalEvent(currentOpenAIResponsesEvent, parsed);
    if (responsesTerminal) openAIResponsesTerminalSeen = true;
    const isFinishChunk = parsed.choices?.[0]?.finish_reason;
    if (isFinishChunk) clientTerminalSeen = true;
    const nativeReason = parsed.choices?.[0]?.native_finish_reason;
    if (isFinishChunk && nativeReason && ["network_error", "error", "server_error", "timeout"].includes(nativeReason) && totalContentLength === 0) {
      controller.error(new Error(`Upstream stream failed: ${nativeReason}`));
      return false;
    }
    if (isFinishChunk && passthroughFinishSeen) return;
    if (isFinishChunk) passthroughFinishSeen = true;

    // A buffered data line's original blank separator may already have passed.
    // Replayed frames therefore carry complete SSE event boundaries.
    const output = originalLine === null
      ? `${passthroughAtEventBoundary ? "" : "\n"}data: ${JSON.stringify(parsed)}\n\n`
      : idFixed || fieldsInjected ? `data: ${JSON.stringify(parsed)}\n`
        : (originalLine.startsWith("data:") && !originalLine.startsWith("data: ") ? "data: " + originalLine.slice(5) : originalLine) + "\n";
    reqLogger?.appendConvertedChunk?.(output);
    controller.enqueue(sharedEncoder.encode(output));
    passthroughAtEventBoundary = output.endsWith("\n\n");
    if (responsesTerminal) finalizeStream();
  };

  const emitTranslatedChunk = (parsed, controller, openAIResponsesEventName = null) => {
    accumulateToolCalls(toolCallStore, parsed);
    if (targetFormat === FORMATS.OPENAI_RESPONSES && sourceFormat === FORMATS.OPENAI_RESPONSES && openAIResponsesEventName) {
      const output = formatClientSSE({ event: openAIResponsesEventName, data: parsed });
      reqLogger?.appendConvertedChunk?.(output);
      controller.enqueue(sharedEncoder.encode(output));
      currentOpenAIResponsesEvent = null;
      sseEmittedCount++;
      if (openAIResponsesTerminalSeen) finalizeStream();
      return;
    }
    currentOpenAIResponsesEvent = null;
    const translated = translateResponse(targetFormat, sourceFormat, parsed, state);
    if (translated?._openaiIntermediate) for (const item of translated._openaiIntermediate) {
      reqLogger?.appendOpenAIChunk?.(formatSSE(item, FORMATS.OPENAI));
    }
    for (const item of translated || []) {
      if (item === null || item === undefined || !hasValuableContent(item, sourceFormat)) continue;
      if (sourceFormat === FORMATS.OPENAI && hasOpenAITerminal(item)) clientTerminalSeen = true;
      // Responses consumers close at the terminal event, not transport EOF.
      if (sourceFormat === FORMATS.OPENAI_RESPONSES && isOpenAIResponsesTerminalEvent(item.event, item.data || item)) finalizeStream();
      const output = formatClientSSE(item);
      reqLogger?.appendConvertedChunk?.(output);
      controller.enqueue(sharedEncoder.encode(output));
      sseEmittedCount++;
    }
    // Retain the bounded wait for Chat providers with no usage trailer/[DONE].
    if (targetFormat === FORMATS.OPENAI && sourceFormat === FORMATS.OPENAI_RESPONSES &&
        state?.completionPending && !state?.completedSent && !completionFlushTimer) {
      completionFlushTimer = setTimeout(() => {
        completionFlushTimer = null;
        if (state?.completedSent) return;
        try { flushPendingCompletion(controller); } catch { /* controller already closed */ }
      }, PENDING_COMPLETION_FLUSH_MS);
    }
  };

  const transformer = {
    transform(chunk, controller, bufferedTail = false) {
      if (!bufferedTail) {
        lastChunkAt = Date.now();
        if (!ttftAt) ttftAt = lastChunkAt;
        const text = decoder.decode(chunk, { stream: true });
        buffer += text;
        reqLogger?.appendProviderChunk?.(text);
      }

      // Index-based extraction avoids intermediate split array (#3629)
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (upstreamErrorTerminated) continue;
        const trimmed = line.trim();
        if (isDebugEnabled && trimmed) {
          sseLineCount++;
          if (trimmed.startsWith("event:")) {
            const evt = trimmed.slice(6).trim();
            eventTypeCounts[evt] = (eventTypeCounts[evt] || 0) + 1;
          }
        }

        // Capture Responses API event name to preserve framing in same-format passthrough
        if (targetFormat === FORMATS.OPENAI_RESPONSES && trimmed.startsWith("event:")) {
          currentOpenAIResponsesEvent = trimmed.slice(6).trim();
        }

        // Passthrough keeps native framing; restored Chat frames can arrive in
        // batches after their complete openers become safe for strict clients.
        if (mode === STREAM_MODE.PASSTHROUGH) {
          const isDoneLine = trimmed.startsWith("data:") && trimmed.slice(5).trim() === "[DONE]";
          if (isDoneLine && passthroughDoneSent) continue;
          if (isDoneLine) {
            for (const parsed of restoreToolNames(null)) {
              if (emitPassthroughChunk(parsed, controller, false, null, true) === false) return;
            }
          } else if (trimmed.startsWith("data:")) {
            try {
              const parsed = JSON.parse(trimmed.slice(5).trim());
              if (emitUpstreamError(parsed, controller)) continue;
              captureFirstToken(parsed);
              const bufferedNames = targetFormat === FORMATS.OPENAI && toolNameMap?.size > 0;
              if (bufferedNames) {
                for (const choice of parsed.choices || []) normalizeTypedContent(choice?.delta);
                accumulateProviderContent(parsed);
                captureUsage(parsed);
              }
              for (const restored of restoreToolNames(parsed)) {
                const originalLine = !bufferedNames ? line : null;
                if (emitPassthroughChunk(restored, controller, bufferedTail, originalLine, bufferedNames, restored !== parsed) === false) return;
              }
            } catch {
              // Do not forward non-JSON provider errors/HTML as SSE payloads.
            }
            continue;
          }
          const output = line.startsWith("data:") && !line.startsWith("data: ")
            ? "data: " + line.slice(5) + "\n" : line + "\n";
          reqLogger?.appendConvertedChunk?.(output);
          controller.enqueue(sharedEncoder.encode(output));
          if (isDoneLine) passthroughDoneSent = true;
          passthroughAtEventBoundary = output === "\n";
          continue;
        }

        // Translate mode
        if (!trimmed) continue;

        let parsed = parseSSELine(trimmed, targetFormat);
        if (!parsed) continue;
        if (emitUpstreamError(parsed, controller)) continue;

        // Responses API same-format passthrough: preserve event framing + track terminal state
        const isOpenAIResponsesStream = targetFormat === FORMATS.OPENAI_RESPONSES;
        const keepsOpenAIResponsesFormat = isOpenAIResponsesStream && sourceFormat === FORMATS.OPENAI_RESPONSES;
        const openAIResponsesEventName = isOpenAIResponsesStream
          ? getOpenAIResponsesEventName(currentOpenAIResponsesEvent, parsed)
          : null;

        if (isOpenAIResponsesStream && isOpenAIResponsesTerminalEvent(openAIResponsesEventName, parsed)) {
          openAIResponsesTerminalSeen = true;
        }

        // In-stream failure on a translated Responses stream (#4104): a
        // response.failed / error terminal event must not be logged as success.
        if (isOpenAIResponsesStream && (openAIResponsesEventName === "response.failed" || openAIResponsesEventName === "error")) {
          markStreamFailed(extractStreamErrorMessage(parsed, `upstream ${openAIResponsesEventName}`));
        }

        // For Ollama: done=true is the final chunk with finish_reason/usage, must translate
        // For other formats: done=true is the [DONE] sentinel, skip
        if (parsed && parsed.done && targetFormat !== FORMATS.OLLAMA) {
          for (const restored of restoreToolNames(null)) emitTranslatedChunk(restored, controller);
          // A direct Chat-to-Responses translation can defer response.completed
          // while waiting for a usage trailer. [DONE] ends that opportunity even
          // if the upstream keeps the HTTP connection open, so finish now.
          if (targetFormat === FORMATS.OPENAI &&
              ((sourceFormat === FORMATS.OPENAI_RESPONSES && state.completionPending && !state.completedSent) ||
                state.claudeFinishPending || state._geminiFinishPending)) {
            flushPendingCompletion(controller);
          }

          // Synthesize response.failed if the Responses stream never sent a terminal event
          if (keepsOpenAIResponsesFormat && !openAIResponsesTerminalSeen) {
            const failedOutput = formatIncompleteOpenAIResponsesStreamFailure();
            reqLogger?.appendConvertedChunk?.(failedOutput);
            controller.enqueue(sharedEncoder.encode(failedOutput));
            openAIResponsesTerminalSeen = true;
            sseEmittedCount++;
          }

          if (keepsOpenAIResponsesFormat && !streamDoneSent) {
            const doneOutput = "data: [DONE]\n\n";
            reqLogger?.appendConvertedChunk?.(doneOutput);
            controller.enqueue(sharedEncoder.encode(doneOutput));
            streamDoneSent = true;
            openAIResponsesDoneSent = true;
          }
          continue;
        }
        if (Array.isArray(parsed?.choices)) {
          for (const choice of parsed.choices) normalizeTypedContent(choice?.delta);
        }


        captureFirstToken(parsed);
        accumulateProviderContent(parsed);
        captureUsage(parsed);
        const extracted = extractUsage(parsed);
        if (extracted) state.usage = mergeUsage(state.usage, extracted);
        for (const restored of restoreToolNames(parsed)) emitTranslatedChunk(restored, controller, openAIResponsesEventName);
      }
    },

    flush(controller) {
      const evtSummary = Object.entries(eventTypeCounts).map(([k, v]) => `${k}=${v}`).join(",") || "none";
      dbg("SSE", `flush | provider=${provider} | model=${model} | recvLines=${sseLineCount} | emitted=${sseEmittedCount} | events=[${evtSummary}]`);
      trackPendingRequest(model, provider, connectionId, false);
      try {
        const remaining = decoder.decode();
        if (remaining) buffer += remaining;
        if (upstreamErrorTerminated) { finalizeStream(); return; }
        if (buffer.trim()) {
          buffer += "\n";
          transformer.transform(null, controller, true);
          if (upstreamErrorTerminated) { finalizeStream(); return; }
        }

        for (const parsed of restoreToolNames(null)) {
          if (mode === STREAM_MODE.PASSTHROUGH) emitPassthroughChunk(parsed, controller, false, null, true);
          else emitTranslatedChunk(parsed, controller);
        }

        if (mode === STREAM_MODE.PASSTHROUGH) {
          if (!passthroughAtEventBoundary) {
            reqLogger?.appendConvertedChunk?.("\n");
            controller.enqueue(sharedEncoder.encode("\n"));
            passthroughAtEventBoundary = true;
          }

          // Chat and Responses use [DONE]; native Messages/Google streams do not.
          const needsDone = sourceFormat === FORMATS.OPENAI || sourceFormat === FORMATS.OPENAI_RESPONSES;
          if (sourceFormat === FORMATS.OPENAI && !clientTerminalSeen) {
            const separator = passthroughAtEventBoundary ? "" : "\n";
            const terminal = separator + `data: ${JSON.stringify(buildAbortedOpenAITerminal(model))}\n\n`;
            reqLogger?.appendConvertedChunk?.(terminal);
            controller.enqueue(sharedEncoder.encode(terminal));
            passthroughAtEventBoundary = true;
            clientTerminalSeen = true;
          }

          if (sourceFormat === FORMATS.OPENAI_RESPONSES && !openAIResponsesTerminalSeen) {
            const failedOutput = formatIncompleteOpenAIResponsesStreamFailure();
            reqLogger?.appendConvertedChunk?.(failedOutput);
            controller.enqueue(sharedEncoder.encode(failedOutput));
            openAIResponsesTerminalSeen = true;
          }
          if (!streamDoneSent && !passthroughDoneSent && needsDone) {
            const separator = passthroughAtEventBoundary ? "" : "\n";
            const doneOutput = separator + "data: [DONE]\n\n";
            reqLogger?.appendConvertedChunk?.(doneOutput);
            controller.enqueue(sharedEncoder.encode(doneOutput));
            streamDoneSent = true;
          }

          finalizeStream();
          return;
        }


        const flushed = translateResponse(targetFormat, sourceFormat, null, state);

        if (flushed?._openaiIntermediate) {
          for (const item of flushed._openaiIntermediate) {
            const openaiOutput = formatSSE(item, FORMATS.OPENAI);
            reqLogger?.appendOpenAIChunk?.(openaiOutput);
          }
        }

        if (flushed?.length > 0) {
          for (const item of flushed) {
            if (item === null || item === undefined) continue;
            if (sourceFormat === FORMATS.OPENAI && hasOpenAITerminal(item)) clientTerminalSeen = true;
            const output = formatClientSSE(item);
            reqLogger?.appendConvertedChunk?.(output);
            controller.enqueue(sharedEncoder.encode(output));
          }
        }

        // A translator's flush is a no-op when the upstream never sent its terminal
        // event. Emit one, plus the sentinel the client expects (#4079).
        if (sourceFormat === FORMATS.OPENAI && !clientTerminalSeen) {
          const terminal = formatSSE(buildAbortedOpenAITerminal(model), FORMATS.OPENAI);
          reqLogger?.appendConvertedChunk?.(terminal);
          controller.enqueue(sharedEncoder.encode(terminal));
          if (!streamDoneSent) {
            reqLogger?.appendConvertedChunk?.(SSE_DONE);
            controller.enqueue(sharedEncoder.encode(SSE_DONE));
            streamDoneSent = true;
          }
          clientTerminalSeen = true;
        }

        // Synthesize response.failed if a Responses passthrough stream never reached a terminal event
        const keepsOpenAIResponsesFormat = targetFormat === FORMATS.OPENAI_RESPONSES && sourceFormat === FORMATS.OPENAI_RESPONSES;
        if (keepsOpenAIResponsesFormat && !openAIResponsesTerminalSeen) {
          const failedOutput = formatIncompleteOpenAIResponsesStreamFailure();
          reqLogger?.appendConvertedChunk?.(failedOutput);
          controller.enqueue(sharedEncoder.encode(failedOutput));
          openAIResponsesTerminalSeen = true;
        }

        const needsOpenAIDone = sourceFormat === FORMATS.OPENAI || keepsOpenAIResponsesFormat;
        if (needsOpenAIDone && !openAIResponsesDoneSent && !streamDoneSent) {
          const doneOutput = "data: [DONE]\n\n";
          reqLogger?.appendConvertedChunk?.(doneOutput);
          controller.enqueue(sharedEncoder.encode(doneOutput));
          openAIResponsesDoneSent = true;
          streamDoneSent = true;
        }

        finalizeStream();
      } catch (error) {
        console.log("Error in flush:", error);
        finalizeStream();
      }
    }
  };
  const sseStream = new TransformStream(transformer);

  sseStream.getStreamSnapshot = getStreamSnapshot;
  sseStream.abortTerminalBytes = sourceFormat === FORMATS.OPENAI
    ? () => (clientTerminalSeen || streamDoneSent ? null : buildAbortedOpenAITerminalBytes(model))
    : null;
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

export function createPassthroughStreamWithLogger(provider = null, reqLogger = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null, toolNameMap = null, format = FORMATS.OPENAI, wireToolNames = null) {
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
    apiKey
  });
}
