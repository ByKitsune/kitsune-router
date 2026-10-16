import { translateResponse, initState } from "../translator/index.js";
import { FORMATS } from "../translator/formats.js";
import { trackPendingRequest, appendRequestLog } from "@/lib/usageDb.js";
import { extractUsage, mergeUsage, hasValidUsage, estimateUsage, logUsage, COLORS } from "./usageTracking.js";
import { parseSSELine, hasValuableContent, hasSemanticContent, fixInvalidId, formatSSE } from "./streamHelpers.js";
import { getOpenAIResponsesEventName, isOpenAIResponsesTerminalEvent, formatIncompleteOpenAIResponsesStreamFailure } from "./responsesStreamHelpers.js";
import { dbg, isDebugEnabled } from "./debugLog.js";
import { extractReasoningText } from "../translator/concerns/reasoning.js";
import { normalizeTypedContent } from "../translator/concerns/typedContent.js";

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

function isUnusableTail(output) {
  if (!output.startsWith("data:")) return false;
  const payload = output.slice(5).trim();
  if (!payload || payload === "[DONE]") return false;
  try {
    JSON.parse(payload);
    return false;
  } catch {
    return true;
  }
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
    targetFormat,
    sourceFormat,
    provider = null,
    reqLogger = null,
    toolNameMap = null,
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
    ? { ...initState(sourceFormat), provider, toolNameMap, customToolNames: new Set(customToolNames || []), model, targetFormat, sourceFormat, responseModel }
    : null;

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

  const captureFirstToken = (parsed, observedAt = lastChunkAt) => {
    if (firstTokenAt === null && hasSemanticContent(parsed, currentOpenAIResponsesEvent)) firstTokenAt = observedAt;
  };

  // In-stream failure tracking (#4104): an upstream can end an HTTP-200 stream
  // with a failure INSIDE the event body (Responses response.failed / error
  // event). Without tracking, usage/logging records the request as "success".
  let streamFailed = false;
  let streamErrorMessage = null;
  const markStreamFailed = (msg) => {
    if (streamFailed) return;
    streamFailed = true;
    if (typeof msg === "string" && msg.trim()) streamErrorMessage = msg.trim().slice(0, 500);
  };
  // Extract a human message from a failure-shaped chunk ({response.error} or {error}).
  const extractStreamErrorMessage = (parsed, fallback) => {
    const err = parsed?.response?.error ?? parsed?.error;
    const msg = typeof err === "string" ? err : err?.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 500);
    return fallback;
  };

  // Error objects are terminal protocol events, not completion deltas. Handle
  // them before format translators' choices/content guards can discard them.
  const emitUpstreamError = (parsed, controller) => {
    if (!parsed?.error || upstreamErrorTerminated) return false;
    const error = typeof parsed.error === "object" ? parsed.error : { message: String(parsed.error) };
    markStreamFailed(extractStreamErrorMessage(parsed, "upstream stream failed"));
    upstreamErrorTerminated = true;
    let failure;
    if (sourceFormat === FORMATS.OPENAI_RESPONSES) {
      failure = {
        event: "response.failed",
        data: {
          type: "response.failed",
          response: { id: state?.responseId || state?.id || `resp_${Date.now()}`, status: "failed", error },
        },
      };
    } else if (sourceFormat === FORMATS.CLAUDE) {
      failure = { type: "error", error };
    } else {
      failure = { error };
    }
    const output = formatSSE(failure, sourceFormat);
    reqLogger?.appendConvertedChunk?.(output);
    controller.enqueue(sharedEncoder.encode(output));
    sseEmittedCount++;
    if (sourceFormat === FORMATS.OPENAI || sourceFormat === FORMATS.OPENAI_RESPONSES ||
        (mode === STREAM_MODE.PASSTHROUGH && !sourceFormat && !["antigravity", "gemini", "vertex"].includes(provider))) {
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

    if (hasValidUsage(finalUsage)) {
      logUsage(isPassthrough ? provider : (state?.provider || targetFormat), finalUsage, model, connectionId, apiKey);
    } else {
      appendRequestLog({ model, provider, connectionId, tokens: null, status: "200 OK" }).catch(() => { });
    }

    if (onStreamComplete) {
      onStreamComplete({
        content: contentChunks.join(""),
        thinking: thinkingChunks.join(""),
        toolCalls: [...toolCallStore.values()].filter((call) => call.name || call.arguments)
      }, finalUsage, ttftAt, { failed: streamFailed, error: streamErrorMessage }, firstTokenAt);
    }
  };

  // Emit the deferred response.completed now — at [DONE], or when the watchdog
  // below gives up on a usage trailer that never arrives.
  const flushPendingCompletion = (controller) => {
    const completed = translateResponse(targetFormat, sourceFormat, null, state);
    for (const item of completed || []) {
      if (item === null || item === undefined) continue;
      const output = formatSSE(item, sourceFormat);
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

  const sseStream = new TransformStream({
    transform(chunk, controller) {
      lastChunkAt = Date.now();
      if (!ttftAt) ttftAt = lastChunkAt;
      const text = decoder.decode(chunk, { stream: true });
      buffer += text;
      reqLogger?.appendProviderChunk?.(text);

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
        if (mode === STREAM_MODE.TRANSLATE && targetFormat === FORMATS.OPENAI_RESPONSES && trimmed.startsWith("event:")) {
          currentOpenAIResponsesEvent = trimmed.slice(6).trim();
        }

        // Passthrough mode: normalize and forward
        if (mode === STREAM_MODE.PASSTHROUGH) {
          let output;
          let injectedUsage = false;
          let responsesTerminal = false;

          // Dedup terminators: some upstreams (e.g. stealth/ox-alpha) send the
          // finish chunk twice and/or their own [DONE]; clients like AI SDK
          // treat anything after the first finish_reason as a protocol error.
          const isDoneLine = trimmed.startsWith("data:") && trimmed.slice(5).trim() === "[DONE]";
          if (isDoneLine && passthroughDoneSent) continue;

          if (trimmed.startsWith("data:") && trimmed.slice(5).trim() !== "[DONE]") {
            try {
              const parsed = JSON.parse(trimmed.slice(5).trim());
              if (emitUpstreamError(parsed, controller)) continue;

              // In-stream failure forwarded verbatim (e.g. Responses
              // response.failed / error event on an HTTP-200 stream): the
              // status line says 200, only the event body tells us it
              // failed — record it so logs don't claim "success" (#4104).
              if (parsed?.response?.status === "failed" || parsed?.type === "error") {
                markStreamFailed(extractStreamErrorMessage(parsed, "upstream stream failed"));
              }

              const idFixed = fixInvalidId(parsed);

              // Ensure OpenAI-required fields are present on streaming chunks (Letta compat)
              let fieldsInjected = false;
              if (parsed.choices !== undefined) {
                if (!parsed.object) { parsed.object = "chat.completion.chunk"; fieldsInjected = true; }
                if (!parsed.created) { parsed.created = Math.floor(Date.now() / 1000); fieldsInjected = true; }
              }

              // Strip Azure-specific non-standard fields from streaming chunks
              if (parsed.prompt_filter_results !== undefined) {
                delete parsed.prompt_filter_results;
                fieldsInjected = true;
              }
              if (parsed?.choices) {
                for (const choice of parsed.choices) {
                  if (choice.content_filter_results !== undefined) {
                    delete choice.content_filter_results;
                    fieldsInjected = true;
                  }
                }
              }

              // Strip empty tool_calls arrays that break AI SDK reasoning tracking.
              // Some providers (e.g. CodeBuddy CN) include `"tool_calls": []` in
              // every streaming delta. @ai-sdk/openai-compatible checks
              // `delta.tool_calls != null` — an empty array passes this check,
              // causing premature `reasoning-end` on every chunk.
              if (parsed?.choices) {
                for (const choice of parsed.choices) {
                  if (choice.delta?.tool_calls && Array.isArray(choice.delta.tool_calls) && choice.delta.tool_calls.length === 0) {
                    delete choice.delta.tool_calls;
                    fieldsInjected = true;
                  }
                }
              }
              if (Array.isArray(parsed?.choices)) {
                for (const choice of parsed.choices) {
                  if (normalizeTypedContent(choice?.delta)) fieldsInjected = true;
                }
              }


              captureFirstToken(parsed);
              if (!hasValuableContent(parsed, FORMATS.OPENAI)) {
                continue;
              }

              const delta = parsed.choices?.[0]?.delta;
              // Symmetrically populate delta.reasoning and delta.reasoning_content so both
              // DeepSeek-style (reasoning_content) and OpenRouter/Cline-style (reasoning)
              // downstream consumers receive the thinking stream intact (#4082).
              if (delta) {
                if (typeof delta.reasoning === "string" && delta.reasoning_content === undefined) {
                  delta.reasoning_content = delta.reasoning;
                  fieldsInjected = true;
                } else if (typeof delta.reasoning_content === "string" && delta.reasoning === undefined) {
                  delta.reasoning = delta.reasoning_content;
                  fieldsInjected = true;
                }
              }
              accumulateOpenAIContent(parsed);

              accumulateToolCalls(toolCallStore, parsed);

              captureUsage(parsed);

              responsesTerminal = isOpenAIResponsesTerminalEvent(currentOpenAIResponsesEvent, parsed);

              const isFinishChunk = parsed.choices?.[0]?.finish_reason;
              if (isFinishChunk) clientTerminalSeen = true;
              const nativeReason = parsed.choices?.[0]?.native_finish_reason;
              // Detect upstream gateway errors masked as HTTP 200 (e.g. OpenRouter
              // sending finish_reason:"stop" with native_finish_reason:"network_error"
              // and empty content). Error out so the stream aborts and combo fallbacks.
              if (isFinishChunk && nativeReason && ["network_error", "error", "server_error", "timeout"].includes(nativeReason) && totalContentLength === 0) {
                controller.error(new Error(`Upstream stream failed: ${nativeReason}`));
                return;
              }
              if (isFinishChunk && passthroughFinishSeen) {
                // Duplicate finish chunk
                continue;
              }
              if (isFinishChunk) passthroughFinishSeen = true;
              // A usage-only trailer can follow finish_reason. Do not publish or
              // persist a guessed counter before the upstream has drained.
              if (idFixed || fieldsInjected) {
                output = `data: ${JSON.stringify(parsed)}\n`;
                injectedUsage = true;
              }
            } catch {
              // Skip non-JSON data lines silently — don't forward garbage to clients.
              // Upstream providers sometimes return plain-text errors (HTML, rate-limit
              // messages) in the SSE stream that would break downstream JSON decoders.
              continue;
            }
          }

          if (!injectedUsage) {
            if (line.startsWith("data:") && !line.startsWith("data: ")) {
              output = "data: " + line.slice(5) + "\n";
            } else {
              output = line + "\n";
            }
          }

          reqLogger?.appendConvertedChunk?.(output);
          controller.enqueue(sharedEncoder.encode(output));
          if (isDoneLine) passthroughDoneSent = true;
          passthroughAtEventBoundary = output === "\n";
          // Responses clients (codex CLI) close on response.completed instead of [DONE]
          if (responsesTerminal) finalizeStream();
          continue;
        }

        // Translate mode
        if (!trimmed) continue;

        const parsed = parseSSELine(trimmed, targetFormat);
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
          // A direct Chat-to-Responses translation can defer response.completed
          // while waiting for a usage trailer. [DONE] ends that opportunity even
          // if the upstream keeps the HTTP connection open, so finish now.
          if (targetFormat === FORMATS.OPENAI && sourceFormat === FORMATS.OPENAI_RESPONSES &&
              state.completionPending && !state.completedSent) {
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

        // Claude format - content
        if (parsed.delta?.text) {
          totalContentLength += parsed.delta.text.length;
          contentChunks.push(parsed.delta.text);
        }
        // Claude format - thinking
        if (parsed.delta?.thinking) {
          totalContentLength += parsed.delta.thinking.length;
          thinkingChunks.push(parsed.delta.thinking);
        }
        
        accumulateOpenAIContent(parsed);
        
        // Gemini format
        if (parsed.candidates?.[0]?.content?.parts) {
          for (const part of parsed.candidates[0].content.parts) {
            if (part.text && typeof part.text === "string") {
              totalContentLength += part.text.length;
              // Check if this is thinking content
              if (part.thought === true) {
                thinkingChunks.push(part.text);
              } else {
                contentChunks.push(part.text);
              }
            }
          }
        }

        accumulateToolCalls(toolCallStore, parsed);

        // Extract usage
        captureUsage(parsed);
        const extracted = extractUsage(parsed);
        if (extracted) state.usage = mergeUsage(state.usage, extracted);

        // Responses same-format passthrough: re-emit with original event framing
        if (keepsOpenAIResponsesFormat && openAIResponsesEventName) {
          const output = formatSSE({ event: openAIResponsesEventName, data: parsed }, sourceFormat);
          reqLogger?.appendConvertedChunk?.(output);
          controller.enqueue(sharedEncoder.encode(output));
          currentOpenAIResponsesEvent = null;
          sseEmittedCount++;
          // Responses clients (codex) close on response.completed instead of [DONE]
          if (openAIResponsesTerminalSeen) finalizeStream();
          continue;
        }

        currentOpenAIResponsesEvent = null;

        // Translate: targetFormat -> openai -> sourceFormat
        const translated = translateResponse(targetFormat, sourceFormat, parsed, state);

        // Log OpenAI intermediate chunks (if available)
        if (translated?._openaiIntermediate) {
          for (const item of translated._openaiIntermediate) {
            const openaiOutput = formatSSE(item, FORMATS.OPENAI);
            reqLogger?.appendOpenAIChunk?.(openaiOutput);
          }
        }

        if (translated?.length > 0) {
          for (const item of translated) {
            if (item === null || item === undefined) continue;
            // Filter empty chunks
            if (!hasValuableContent(item, sourceFormat)) {
              continue; // Skip this empty chunk
            }

            if (sourceFormat === FORMATS.OPENAI && hasOpenAITerminal(item)) {
              clientTerminalSeen = true;
            }

            // Responses clients close on the terminal event, not transport EOF.
            // The terminal now includes the drained trailer: persist before enqueue.
            if (sourceFormat === FORMATS.OPENAI_RESPONSES &&
                isOpenAIResponsesTerminalEvent(item.event, item.data || item)) finalizeStream();

            const output = formatSSE(item, sourceFormat);
            reqLogger?.appendConvertedChunk?.(output);
            controller.enqueue(sharedEncoder.encode(output));
            sseEmittedCount++;
          }
        }

        // The completion deferral can outlive the upstream: a broken chat upstream
        // may stall after finish_reason with no usage trailer and no [DONE], holding
        // the connection open. Bound the wait so the client still gets a terminal event.
        if (targetFormat === FORMATS.OPENAI && sourceFormat === FORMATS.OPENAI_RESPONSES &&
            state?.completionPending && !state?.completedSent && !completionFlushTimer) {
          completionFlushTimer = setTimeout(() => {
            completionFlushTimer = null;
            if (state?.completedSent) return;
            try { flushPendingCompletion(controller); } catch { /* controller already closed */ }
          }, PENDING_COMPLETION_FLUSH_MS);
        }
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
          const tail = parseSSELine(buffer.trim(), targetFormat);
          if (emitUpstreamError(tail, controller)) return;
          captureFirstToken(tail);
          accumulateOpenAIContent(tail);
          accumulateToolCalls(toolCallStore, tail);
          captureUsage(tail);
          if (isOpenAIResponsesTerminalEvent(currentOpenAIResponsesEvent, tail)) {
            openAIResponsesTerminalSeen = true;
          }
        }

        if (mode === STREAM_MODE.PASSTHROUGH) {
          if (buffer) {
            const trimmed = buffer.trim();
            const isDoneLine = trimmed.startsWith("data:") && trimmed.slice(5).trim() === "[DONE]";
            let output = buffer;
            if (buffer.startsWith("data:") && !buffer.startsWith("data: ")) {
              output = "data: " + buffer.slice(5);
            }
            if (isUnusableTail(output) || (isDoneLine && passthroughDoneSent)) {
              buffer = "";
            } else {
              output += "\n\n";
              reqLogger?.appendConvertedChunk?.(output);
              controller.enqueue(sharedEncoder.encode(output));
              if (isDoneLine) passthroughDoneSent = true;
              passthroughAtEventBoundary = true;
            }
          }

          // IMPORTANT: In passthrough mode we still must terminate the SSE stream.
          // Some clients (e.g. OpenClaw) expect the OpenAI-style sentinel:
          //   data: [DONE]\n\n
          // Without it they can hang until timeout and trigger failover.
          // Gemini-family clients (Antigravity, Vertex, Gemini) reject this sentinel with 400 syntax errors.
          const isGeminiFamily = provider === "antigravity" || provider === "gemini" || provider === "vertex";

          // The upstream ended without a finish_reason (empty response, or cut before terminal).
          // Emit one so an OpenAI client closes the turn cleanly (#4079, #4080).
          if (sourceFormat === FORMATS.OPENAI && !clientTerminalSeen && !isGeminiFamily) {
            const separator = passthroughAtEventBoundary ? "" : "\n";
            const terminal = separator + `data: ${JSON.stringify(buildAbortedOpenAITerminal(model))}\n\n`;
            reqLogger?.appendConvertedChunk?.(terminal);
            controller.enqueue(sharedEncoder.encode(terminal));
            passthroughAtEventBoundary = true;
            clientTerminalSeen = true;
          }

          if (!streamDoneSent && !passthroughDoneSent && !isGeminiFamily) {
            const separator = passthroughAtEventBoundary ? "" : "\n";
            const doneOutput = separator + "data: [DONE]\n\n";
            reqLogger?.appendConvertedChunk?.(doneOutput);
            controller.enqueue(sharedEncoder.encode(doneOutput));
            streamDoneSent = true;
          }

          finalizeStream();
          return;
        }

        if (buffer.trim()) {
          // Same parse as the transform loop: without targetFormat this only
          // accepts "data: " lines, so an NDJSON provider (Ollama) lost whatever
          // arrived without its closing newline.
          const parsed = parseSSELine(buffer.trim(), targetFormat);
          // parseSSELine turns the SSE sentinel "data: [DONE]" into { done: true },
          // which must not be translated. An Ollama chunk also carries done:true,
          // but it is the real final chunk — it holds finish_reason and the token
          // counts — so it has to go through.
          const isDoneSentinel = parsed?.done && targetFormat !== FORMATS.OLLAMA;
          if (parsed && !isDoneSentinel) {
            // Same accumulation the transform loop does, so finalizeStream() can
            // log a tail chunk's tokens instead of falling back to null.
            captureUsage(parsed);
            const extracted = extractUsage(parsed);
            if (extracted) state.usage = mergeUsage(state.usage, extracted);

            const translated = targetFormat === FORMATS.OPENAI_RESPONSES && sourceFormat === FORMATS.OPENAI_RESPONSES
              ? [{ event: getOpenAIResponsesEventName(currentOpenAIResponsesEvent, parsed), data: parsed }]
              : translateResponse(targetFormat, sourceFormat, parsed, state);

            if (translated?._openaiIntermediate) {
              for (const item of translated._openaiIntermediate) {
                const openaiOutput = formatSSE(item, FORMATS.OPENAI);
                reqLogger?.appendOpenAIChunk?.(openaiOutput);
              }
            }

            if (translated?.length > 0) {
              for (const item of translated) {
                if (item === null || item === undefined) continue;
                if (sourceFormat === FORMATS.OPENAI && hasOpenAITerminal(item)) clientTerminalSeen = true;
                const output = formatSSE(item, sourceFormat);
                reqLogger?.appendConvertedChunk?.(output);
                controller.enqueue(sharedEncoder.encode(output));
              }
            }
          }
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
            const output = formatSSE(item, sourceFormat);
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
  });

  sseStream.getStreamSnapshot = getStreamSnapshot;
  sseStream.abortTerminalBytes = sourceFormat === FORMATS.OPENAI
    ? () => (clientTerminalSeen || streamDoneSent ? null : buildAbortedOpenAITerminalBytes(model))
    : null;
  return sseStream;
}

export function createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider = null, reqLogger = null, toolNameMap = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null, customToolNames = null, responseModel = null) {
  return createSSEStream({
    mode: STREAM_MODE.TRANSLATE,
    targetFormat,
    sourceFormat,
    provider,
    reqLogger,
    toolNameMap,
    customToolNames,
    model,
    connectionId,
    body,
    onStreamComplete,
    apiKey,
    responseModel
  });
}

export function createPassthroughStreamWithLogger(provider = null, reqLogger = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null) {
  return createSSEStream({
    mode: STREAM_MODE.PASSTHROUGH,
    provider,
    reqLogger,
    model,
    connectionId,
    body,
    onStreamComplete,
    apiKey
  });
}
