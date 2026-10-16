import { FORMATS } from "../../translator/formats.js";
import { needsTranslation } from "../../translator/index.js";
import { createSSETransformStreamWithLogger, createPassthroughStreamWithLogger } from "../../utils/stream.js";
import { pipeWithDisconnect } from "../../utils/streamHandler.js";
import { PROVIDERS } from "../../config/providers.js";
import { STREAM_STALL_TIMEOUT_MS } from "../../config/runtimeConfig.js";
import { buildAbortedResponsesTerminalBytes } from "../../utils/responsesStreamHelpers.js";
import { buildRequestDetail, extractRequestConfig, saveUsageStats, formatDoneLine } from "./requestDetail.js";
import { saveRequestDetail } from "@/lib/usageDb.js";
import { SSE_HEADERS_CORS as SSE_HEADERS } from "../../utils/sseConstants.js";

// Codex returns Responses API SSE → which client format to translate INTO, by request sourceFormat.
// Gemini-family all map to ANTIGRAVITY decoder; unknown sources fall back to OPENAI.
const CODEX_SOURCE_TO_TARGET = {
  [FORMATS.OPENAI_RESPONSES]: FORMATS.OPENAI_RESPONSES,
  [FORMATS.CLAUDE]: FORMATS.CLAUDE,
  [FORMATS.ANTIGRAVITY]: FORMATS.ANTIGRAVITY,
  [FORMATS.GEMINI]: FORMATS.ANTIGRAVITY,
  [FORMATS.GEMINI_CLI]: FORMATS.ANTIGRAVITY,
};

/**
 * Determine which SSE transform stream to use based on provider/format.
 */
function buildTransformStream({ provider, sourceFormat, targetFormat, userAgent, reqLogger, toolNameMap, customToolNames, model, connectionId, body, onStreamComplete, apiKey, responseModel }) {
  const isDroidCLI = userAgent?.toLowerCase().includes("droid") || userAgent?.toLowerCase().includes("codex-cli");
  // Responses-API providers (e.g. codex) emit Responses SSE → translate into client format
  const isResponsesProvider = PROVIDERS[provider]?.format === FORMATS.OPENAI_RESPONSES;
  const needsCodexTranslation = isResponsesProvider && targetFormat === FORMATS.OPENAI_RESPONSES && !isDroidCLI;

  if (needsCodexTranslation) {
    const codexTarget = CODEX_SOURCE_TO_TARGET[sourceFormat] || FORMATS.OPENAI;
    return createSSETransformStreamWithLogger(FORMATS.OPENAI_RESPONSES, codexTarget, provider, reqLogger, toolNameMap, model, connectionId, body, onStreamComplete, apiKey, customToolNames, responseModel);
  }

  if (needsTranslation(targetFormat, sourceFormat)) {
    return createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider, reqLogger, toolNameMap, model, connectionId, body, onStreamComplete, apiKey, customToolNames, responseModel);
  }

  return createPassthroughStreamWithLogger(provider, reqLogger, model, connectionId, body, onStreamComplete, apiKey);
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
      fire(error?.name === "AbortError" ? "aborted" : (error?.message || "error"));
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

/**
 * Handle streaming response — pipe provider SSE through transform stream to client.
 */
export async function handleStreamingResponse({ providerResponse, provider, model, sourceFormat, targetFormat, userAgent, body, stream, translatedBody, finalBody, requestStartTime, connectionId, apiKey, clientRawRequest, onRequestSuccess, reqLogger, toolNameMap, customToolNames, streamController, onStreamComplete, onStreamAborted, streamDetailId, pxpipe, reqTag, log }) {
  if (onRequestSuccess) {
    Promise.resolve()
      .then(onRequestSuccess)
      .catch(err => {
        console.error("[ChatCore] onRequestSuccess failed:", err?.message || err);
      });
  }

  // When upstream returns HTML/text instead of SSE (e.g. Cloudflare 5xx error
  // page), piping it through the SSE transform stream causes Next.js
  // "failed to pipe response" and crashes the chat router. Read the body,
  // pull a short human-readable message from the <title>, sanitize it, and
  // return a clean JSON error instead. The message is stripped of HTML tags
  // and clamped so untrusted upstream text never reaches the client verbatim
  // (the UI may render error.message as HTML).
  const upstreamContentType = (providerResponse.headers.get('content-type') || '').toLowerCase();
  if (upstreamContentType && !isStreamableUpstreamContentType(upstreamContentType, targetFormat)) {
    const bodyText = await providerResponse.text().catch(() => '');
    const titleMatch = bodyText.match(/<title>([^<]+)<\/title>/i);
    const sanitizedTitle = (titleMatch?.[1] || '').replace(/<[^>]*>/g, '').replace(/[\r\n]+/g, ' ').trim().slice(0, 160);
    const shortMsg = sanitizedTitle
      || (bodyText.length < 200 ? bodyText.replace(/<[^>]*>/g, '').trim().slice(0, 160) : `Upstream returned non-SSE response (${upstreamContentType})`);
    const status = providerResponse.status || 502;
    if (log?.errorLine) log.errorLine(reqTag, "✗", `BLOCKED ${status} · ${provider}/${model} · non-SSE (${upstreamContentType})\n    ${shortMsg}`);
    else console.warn(`[STREAM] ${provider} | ${model} | blocked pipe: ${shortMsg} [${status}]`);
    streamController?.handleError?.(new Error(`upstream non-SSE: ${status}`));
    return {
      success: false,
      response: new Response(JSON.stringify({ error: { message: `[${status}]: ${shortMsg}` } }), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }),
    };
  }

  const transformStream = buildTransformStream({ provider, sourceFormat, targetFormat, userAgent, reqLogger, toolNameMap, customToolNames, model, connectionId, body, onStreamComplete, apiKey, responseModel: clientRawRequest?.body?.model });

  // Responses passthrough: synthesize response.failed + [DONE] if the stream aborts/stalls before a terminal event
  const isResponsesPassthrough = sourceFormat === FORMATS.OPENAI_RESPONSES && targetFormat === FORMATS.OPENAI_RESPONSES;
  const onAbortTerminal = isResponsesPassthrough ? buildAbortedResponsesTerminalBytes : null;
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
export function buildOnStreamComplete({ provider, model, connectionId, apiKey, requestStartTime, body, stream, finalBody, translatedBody, clientRawRequest, pxpipe, reqTag, log, onStreamFailed }) {
  const streamDetailId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  // Terminal accounting may precede transport EOF; completion and abort share one claim.
  let persistenceClaimed = false;

  const onStreamComplete = (contentObj, usage, ttftAt, streamMeta) => {
    if (persistenceClaimed) return;
    persistenceClaimed = true;
    const latency = {
      ttft: ttftAt ? ttftAt - requestStartTime : Date.now() - requestStartTime,
      total: Date.now() - requestStartTime
    };
    const safeContent = contentObj?.content || "[Empty streaming response]";
    const safeThinking = contentObj?.thinking || null;
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
    if (failed && typeof onStreamFailed === "function") {
      try {
        onStreamFailed({ error: streamError, status: streamMeta?.status || 502 });
      } catch (err) {
        // Accounting must never break the response path.
        console.error("[ChatCore] onStreamFailed failed:", err?.message || err);
      }
    }

    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId,
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

    // Persist stream usage to DB (no console line; the "📊 done" line below is authoritative)
    saveUsageStats({ provider, model, tokens: usage, connectionId, apiKey, endpoint: clientRawRequest?.endpoint, latency, label: "STREAM USAGE", silent: true });
    if (log?.line) log.line(reqTag, "📊", formatDoneLine({ usage, latency }));
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

    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId,
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

    saveUsageStats({ provider, model, tokens: usage, connectionId, apiKey, endpoint: clientRawRequest?.endpoint, label: "STREAM USAGE (aborted)", silent: true });
    if (log?.line) log.line(reqTag, "📊", formatDoneLine({ usage, latency }));
  };

  return { onStreamComplete, onStreamAborted, streamDetailId };
}
