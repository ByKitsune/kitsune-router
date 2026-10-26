import { FORMATS } from "../../translator/formats.js";
import { needsTranslation } from "../../translator/index.js";
import { createSSETransformStreamWithLogger, createPassthroughStreamWithLogger } from "../../utils/stream.js";
import { pipeWithDisconnect } from "../../utils/streamHandler.js";
import { PROVIDERS } from "../../config/providers.js";
import { STREAM_STALL_TIMEOUT_MS, STREAM_FIRST_CHUNK_TIMEOUT_MS } from "../../config/runtimeConfig.js";
import { buildRequestDetail, extractRequestConfig, saveUsageStats, formatDoneLine } from "./requestDetail.js";
import { saveRequestDetail } from "@/lib/usageDb.js";
import { SSE_HEADERS_CORS as SSE_HEADERS } from "../../utils/sseConstants.js";
import { getServiceTierAccounting } from "../../providers/serviceTiers.js";
import { createErrorResult } from "../../utils/error.js";

// Codex returns Responses API SSE → which client format to translate INTO, by request sourceFormat.
// Preserve each client's native envelope; unknown sources fall back to OpenAI.
const CODEX_SOURCE_TO_TARGET = {
  [FORMATS.OPENAI_RESPONSES]: FORMATS.OPENAI_RESPONSES,
  [FORMATS.CLAUDE]: FORMATS.CLAUDE,
  [FORMATS.ANTIGRAVITY]: FORMATS.ANTIGRAVITY,
  [FORMATS.GEMINI]: FORMATS.GEMINI,
  [FORMATS.GEMINI_CLI]: FORMATS.GEMINI_CLI,
  [FORMATS.VERTEX]: FORMATS.VERTEX,
};

/**
 * Determine which SSE transform stream to use based on provider/format.
 */
function buildTransformStream({ provider, sourceFormat, targetFormat, reqLogger, toolNameMap, wireToolNames, customToolNames, model, connectionId, body, onStreamComplete, apiKey, responseModel }) {
  // The requested endpoint, not the caller's user-agent, owns response framing.
  const isResponsesProvider = PROVIDERS[provider]?.format === FORMATS.OPENAI_RESPONSES;
  const needsCodexTranslation = isResponsesProvider && targetFormat === FORMATS.OPENAI_RESPONSES;

  if (needsCodexTranslation) {
    const codexTarget = CODEX_SOURCE_TO_TARGET[sourceFormat] || FORMATS.OPENAI;
    return createSSETransformStreamWithLogger(FORMATS.OPENAI_RESPONSES, codexTarget, provider, reqLogger, toolNameMap, model, connectionId, body, onStreamComplete, apiKey, customToolNames, responseModel, wireToolNames);
  }

  if (needsTranslation(targetFormat, sourceFormat)) {
    return createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider, reqLogger, toolNameMap, model, connectionId, body, onStreamComplete, apiKey, customToolNames, responseModel, wireToolNames);
  }

  return createPassthroughStreamWithLogger(provider, reqLogger, model, connectionId, body, onStreamComplete, apiKey, toolNameMap, targetFormat, wireToolNames, responseModel);
}

function withAbortRecording(streamController, record) {
  let recorded = false;
  const fire = (reason) => {
    if (recorded) return;
    recorded = true;
    try {
      record(reason);
    } catch (error) {
      console.error("[Stream] Failed to record aborted stream:", error?.message || error);
    }
  };

  return {
    ...streamController,
    handleComplete: () => {
      recorded = true;
      streamController.handleComplete();
    },
    handleDisconnect: (reason) => {
      fire(reason || "client_closed");
      streamController.handleDisconnect(reason);
    },
    handleError: (error) => {
      if (error?.name === "AbortError") fire("aborted");
      streamController.handleError(error);
    },
  };
}

// Content types an upstream may legitimately stream, beyond SSE and JSON, keyed by the format the
// provider declares. Ollama-format providers dial the native /api/chat (see
// providers/registry/ollama-local.js) which answers application/x-ndjson on success, and
// translator/response/ollama-to-openai.js exists to convert exactly that stream, so the
// error-page guard below must not treat it as a non-SSE body (issue #3985).
const UPSTREAM_STREAM_CONTENT_TYPES = {
  [FORMATS.OLLAMA]: ["application/x-ndjson"],
};

function isStreamableUpstreamContentType(contentType, targetFormat) {
  if (contentType.includes("text/event-stream") || contentType.includes("application/json")) return true;
  return (UPSTREAM_STREAM_CONTENT_TYPES[targetFormat] || []).some(type => contentType.includes(type));
}

async function inspectJsonStream(response, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let prefix = "";
  let timer;
  const onAbort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Upstream stream prefix timeout")), STREAM_FIRST_CHUNK_TIMEOUT_MS); });
    while (prefix.length < 65536) {
      if (signal?.aborted) throw signal.reason || new Error("aborted");
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      if (signal?.aborted) throw signal.reason || new Error("aborted");
      chunks.push(value);
      prefix += decoder.decode(value.subarray(0, 65536 - prefix.length), { stream: true });
      const text = prefix.trimStart();
      if (/^(?:data:|event:|:)/.test(text)) {
        let index = 0;
        return new ReadableStream({
          async pull(controller) {
            try {
              if (index < chunks.length) {
                const chunk = chunks[index];
                chunks[index++] = null;
                controller.enqueue(chunk);
                return;
              }
              const result = await reader.read();
              if (result.done) { reader.releaseLock(); controller.close(); }
              else controller.enqueue(result.value);
            } catch (error) { try { reader.releaseLock(); } catch {} controller.error(error); }
          },
          async cancel(reason) { try { await reader.cancel(reason); } finally { reader.releaseLock(); } },
        });
      }
      if (text && !["data:", "event:"].some(field => field.startsWith(text))) break;
    }
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    return null;
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    reader.releaseLock();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Handle streaming response — pipe provider SSE through transform stream to client.
 */
export async function handleStreamingResponse({ providerResponse, provider, model, sourceFormat, targetFormat, userAgent, body, stream, translatedBody, finalBody, requestStartTime, connectionId, apiKey, clientRawRequest, onRequestSuccess, reqLogger, toolNameMap, customToolNames, streamController, onStreamComplete, onStreamAborted, streamDetailId, pxpipe, reqTag, log }) {
  const upstreamContentType = (providerResponse.headers.get("content-type") || "").toLowerCase();
  if (upstreamContentType && !isStreamableUpstreamContentType(upstreamContentType, targetFormat)) {
    await providerResponse.body?.cancel().catch(() => {});
    const status = providerResponse.status >= 400 ? providerResponse.status : 502;
    streamController?.handleError?.(new Error("Upstream returned a non-streaming response"));
    return createErrorResult(status, "Upstream returned an unsupported streaming content type");
  }
  if (upstreamContentType.includes("application/json")) {
    let streamBody;
    try { streamBody = await inspectJsonStream(providerResponse, streamController?.signal); }
    catch {
      streamController?.handleError?.(new Error("Invalid upstream streaming response"));
      return createErrorResult(502, "Invalid upstream streaming response");
    }
    if (!streamBody) {
      streamController?.handleError?.(new Error("Upstream returned JSON for a streaming request"));
      return createErrorResult(502, "Upstream returned JSON instead of a streaming response");
    }
    providerResponse = new Response(streamBody, { status: providerResponse.status, headers: providerResponse.headers });
  }
  if (onRequestSuccess) Promise.resolve().then(onRequestSuccess).catch(() => {
    console.error("[ChatCore] onRequestSuccess failed");
  });

  const wireBody = finalBody || translatedBody || body;
  const wireToolNames = toolNameMap?.size > 0
    ? new Set((wireBody?.tools || []).flatMap(tool => tool.functionDeclarations?.map(fn => fn.name) || [tool.function?.name || tool.name]).filter(Boolean))
    : null;
  const transformStream = buildTransformStream({ provider, sourceFormat, targetFormat, reqLogger, toolNameMap, wireToolNames, customToolNames, model, connectionId, body, onStreamComplete, apiKey, responseModel: clientRawRequest?.body?.model });

  const onAbortTerminal = transformStream.abortTerminalBytes;
  const stallTimeoutMs = PROVIDERS[provider]?.stallTimeoutMs || STREAM_STALL_TIMEOUT_MS;
  const recordingController = onStreamAborted
    ? withAbortRecording(streamController, (reason) => onStreamAborted(transformStream.getStreamSnapshot?.() || null, reason))
    : streamController;
  const transformedBody = pipeWithDisconnect(
    providerResponse,
    transformStream,
    recordingController,
    onAbortTerminal,
    stallTimeoutMs,
    undefined,
    undefined,
    sourceFormat
  );

  saveRequestDetail(buildRequestDetail({
    provider, model, connectionId,
    latency: { ttft: 0, total: Date.now() - requestStartTime },
    tokens: { prompt_tokens: 0, completion_tokens: 0 },
    request: extractRequestConfig(body, stream),
    providerRequest: finalBody || translatedBody || null,
    providerResponse: "[Streaming - raw response not captured]",
    response: { content: "[Streaming in progress...]", thinking: null, type: "streaming" },
    pxpipe,
    status: "success"
  }, { id: streamDetailId })).catch(err => {
    console.error("[RequestDetail] Failed to save streaming request:", err.message);
  });

  return {
    success: true,
    response: new Response(transformedBody, { headers: SSE_HEADERS })
  };
}

/**
 * Build onStreamComplete callback for streaming usage tracking.
 */
export function buildOnStreamComplete({ provider, model, connectionId, apiKey, requestStartTime, body, stream, finalBody, translatedBody, clientRawRequest, pxpipe, reqTag, log, onStreamFailed, serviceTier }) {
  const streamDetailId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  // Terminal accounting may precede transport EOF; completion and abort share one claim.
  let persistenceClaimed = false;

  const onStreamComplete = (contentObj, usage, ttftAt, streamMeta, firstTokenAt) => {
    if (persistenceClaimed) return;
    persistenceClaimed = true;
    const latency = {
      ttft: ttftAt ? ttftAt - requestStartTime : Date.now() - requestStartTime,
      total: Date.now() - requestStartTime
    };
    const safeContent = contentObj?.content || "[Empty streaming response]";
    const safeThinking = contentObj?.thinking || null;
    const tierAccounting = getServiceTierAccounting(provider, { ...(serviceTier || { requestedServiceTier: body?.service_tier }), actualServiceTier: streamMeta?.actualServiceTier });
    // In-stream upstream failure (e.g. Responses response.failed on an
    // HTTP-200 stream) must not be logged as success (#4104).
    const failed = streamMeta?.failed === true;
    const streamError = failed
      ? (typeof streamMeta?.error === "string" && streamMeta.error.trim() ? streamMeta.error.trim() : "upstream stream failed")
      : null;

    // Mark the account unhealthy for a mid-stream failure.
    //
    // markAccountUnavailable() was only ever called on the pre-stream error
    // path, so an account that consistently failed AFTER the 200 header (Codex
    // response.failed, quota exhausted mid-generation) kept being selected:
    // every request returned 200 with truncated content and no failover ever
    // happened. Operators could not see it either, because every monitor
    // observed 200.
    //
    // A client disconnect cannot reach this branch: onStreamAborted() claims
    // persistenceClaimed first and this callback returns early, so an abort is
    // never recorded as an account fault.
    // Request-scoped failures are recorded without altering account health.
    if (failed && streamMeta?.status !== 400 && typeof onStreamFailed === "function") {
      try {
        onStreamFailed({ error: streamError, status: streamMeta?.status || 502 });
      } catch (err) {
        // Accounting must never break the response path.
        console.error("[ChatCore] onStreamFailed failed:", err?.message || err);
      }
    }

    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId, serviceTier: tierAccounting,
      latency,
      tokens: usage || { prompt_tokens: 0, completion_tokens: 0 },
      request: extractRequestConfig(body, stream),
      providerRequest: finalBody || translatedBody || null,
      providerResponse: safeContent,
      response: {
        content: safeContent,
        thinking: safeThinking,
        type: "streaming",
        ...(failed ? { error: streamError } : {}),
      },
      pxpipe,
      status: failed ? "failed" : "success"
    }, { id: streamDetailId })).catch(err => {
      console.error("[RequestDetail] Failed to update streaming content:", err.message);
    });

    // Keep first-byte detail/log timings separate from measured semantic TTFT.
    const usageLatency = {
      ...latency,
      ttft: Number.isFinite(firstTokenAt) ? firstTokenAt - requestStartTime : null,
    };
    // Persist measured usage before the terminal summary.
    saveUsageStats({ provider, model, tokens: usage, connectionId, apiKey, endpoint: clientRawRequest?.endpoint, latency: usageLatency, label: "STREAM USAGE", silent: true, serviceTier: tierAccounting });
    if (log?.line) {
      const summary = formatDoneLine({ usage, latency });
      log.line(reqTag, failed ? "!" : "📊", failed ? summary.replace(/^DONE/, `FAILED ${streamMeta?.status || 502}`) : summary);
    }
  };

  const onStreamAborted = (snapshot, reason) => {
    if (persistenceClaimed) return;
    persistenceClaimed = true;
    const latency = {
      ttft: snapshot?.ttftAt ? snapshot.ttftAt - requestStartTime : Date.now() - requestStartTime,
      total: Date.now() - requestStartTime
    };
    const usage = snapshot?.usage || null;
    const safeContent = snapshot?.content || "[No content before disconnect]";
    const tierAccounting = getServiceTierAccounting(provider, { ...(serviceTier || { requestedServiceTier: body?.service_tier }), actualServiceTier: snapshot?.actualServiceTier });

    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId, serviceTier: tierAccounting,
      latency,
      tokens: usage || { prompt_tokens: 0, completion_tokens: 0 },
      request: extractRequestConfig(body, stream),
      providerRequest: finalBody || translatedBody || null,
      providerResponse: safeContent,
      response: {
        content: safeContent,
        thinking: snapshot?.thinking || null,
        type: "streaming",
        finish_reason: `aborted: ${reason}`
      },
      pxpipe,
      status: "aborted"
    }, { id: streamDetailId })).catch(err => {
      console.error("[RequestDetail] Failed to update aborted stream:", err.message);
    });

    saveUsageStats({ provider, model, tokens: usage, connectionId, apiKey, endpoint: clientRawRequest?.endpoint, label: "STREAM USAGE (aborted)", silent: true, serviceTier: tierAccounting });
    if (log?.line) log.line(reqTag, "📊", formatDoneLine({ usage, latency }));
  };

  return { onStreamComplete, onStreamAborted, streamDetailId };
}
