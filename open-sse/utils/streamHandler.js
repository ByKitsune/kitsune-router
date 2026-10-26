import { STREAM_STALL_TIMEOUT_MS, STREAM_FIRST_CHUNK_TIMEOUT_MS, SSE_KEEPALIVE_MS } from "../config/runtimeConfig.js";
import { FORMATS } from "../translator/formats.js";
import { dbg } from "./debugLog.js";

// Shared text encoder for keepalive payloads
const keepaliveEncoder = new TextEncoder();

// Pre-encoded ping payloads
const CLAUDE_PING_BYTES = keepaliveEncoder.encode("event: ping\ndata: {}\n\n");
const OPENAI_PING_BYTES = keepaliveEncoder.encode(": ping\n\n");

function getKeepaliveBytes(sourceFormat) {
  if (sourceFormat === FORMATS.CLAUDE) {
    return CLAUDE_PING_BYTES;
  }
  return OPENAI_PING_BYTES;
}

// Get HH:MM:SS timestamp
function getTimeString() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Create stream controller with abort and disconnect detection
 * @param {object} options
 * @param {function} options.onDisconnect - Callback when client disconnects
 * @param {object} options.log - Logger instance
 * @param {string} options.provider - Provider name
 * @param {string} options.model - Model name
 */
export function createStreamController({ onDisconnect, onError, log, provider, model, reqTag = "" } = {}) {
  const abortController = new AbortController();
  const startTime = Date.now();
  let disconnected = false;
  let abortTimeout = null;
  let streamError = null;

  // Only abnormal terminations are logged; normal completion is covered by "📊 done".
  // isError uses errorLine (always shown, ignores LOG_LEVEL) so failures survive quiet levels.
  const logStream = (symbol, status, isError = false) => {
    const duration = Date.now() - startTime;
    const emit = isError ? log?.errorLine : log?.line;
    if (emit) emit(reqTag, symbol, `${status} · ${provider}/${model} · ${duration}ms`);
    else console.log(`[${getTimeString()}] ${symbol} ${provider}/${model} · ${status} · ${duration}ms`);
  };

  return {
    signal: abortController.signal,
    startTime,

    isConnected: () => !disconnected,
    getError: () => streamError,

    // Call when client disconnects
    handleDisconnect: (reason = "client_closed") => {
      if (disconnected) { abortController.abort(reason); return; }
      disconnected = true;

      // Debug-only: Responses API has no [DONE] sentinel, so codex/droid close the
      // socket on every completed request. "📊 done" is the authoritative outcome line.
      dbg("CTRL", `${provider}/${model} | disconnect=${reason} | dur=${Date.now() - startTime}ms`);

      if (abortTimeout) {
        clearTimeout(abortTimeout);
        abortTimeout = null;
      }

      // Immediately abort upstream to prevent orphan billing / background hangs
      abortController.abort(new Error(reason));

      onDisconnect?.({ reason, duration: Date.now() - startTime });
    },

    // Call when stream completes normally (no line here — "📊 done" is authoritative)
    handleComplete: () => {
      if (disconnected) return;
      disconnected = true;

      if (abortTimeout) {
        clearTimeout(abortTimeout);
        abortTimeout = null;
      }
    },

    // Call on error
    handleError: (error) => {
      if (disconnected) return;
      disconnected = true;
      streamError = error;

      if (abortTimeout) {
        clearTimeout(abortTimeout);
        abortTimeout = null;
      }

      abortController.abort(error);

      if (error?.name === "AbortError") {
        logStream("⚡", "ABORTED");
        return;
      }

      logStream("✗", `ERROR: ${error?.message || error}${error?.stack ? `\n    ${error.stack}` : ""}`, true);
      onError?.(error);
    },

    abort: (err) => {
      disconnected = true;
      if (err) streamError = err;
      abortController.abort(err);
    }
  };
}

/**
 * Create transform stream with disconnect detection and keepalive heartbeat
 * Wraps existing transform stream and adds abort & ping capability.
 *
 * Stall detection lives in pipeWithDisconnect (tied to upstream byte
 * activity). When the upstream model is silent for long stretches
 * (e.g. reasoning thinking, prompt prefill), an optional keepalive timer
 * emits periodic SSE pings (`event: ping` for Claude, `: ping` for OpenAI)
 * to prevent proxy timeouts and client stall warnings.
 */
export function createDisconnectAwareStream(
  transformStream, streamController, onAbortTerminal = null,
  keepaliveMs = SSE_KEEPALIVE_MS, sourceFormat = null, lifecycle = {},
) {
  const reader = transformStream.readable.getReader();
  const writer = transformStream.writable?.getWriter();
  const pingBytes = getKeepaliveBytes(sourceFormat);
  let output;
  let ended = false;
  let reading = false;
  let terminalEmitted = false;
  let keepaliveTimer;
  let cleanupPromise;
  let terminationPromise;
  let lastActivityAt = Date.now();
  let atEventBoundary = true;
  let suffix = "";
  const boundaryDecoder = new TextDecoder();
  const setDemand = () => lifecycle.onDemand?.(!ended && output.desiredSize > 0);
  const cleanup = reason => {
    if (cleanupPromise) return cleanupPromise;
    clearInterval(keepaliveTimer);
    streamController.signal?.removeEventListener("abort", onSignalAbort);
    cleanupPromise = Promise.allSettled([
      Promise.resolve().then(() => reader.cancel(reason)),
      Promise.resolve().then(() => writer?.abort(reason)),
      Promise.resolve().then(() => lifecycle.cancel?.(reason)),
    ]).then(() => {
      try { reader.releaseLock(); } catch {}
      try { writer?.releaseLock?.(); } catch {}
      transformStream.dispose?.(reason);
      lifecycle.onCleanup?.();
    });
    return cleanupPromise;
  };
  const closeOnError = (error, wasConnected = streamController.isConnected(), serialize = true) => {
    if (terminationPromise) return terminationPromise;
    if (ended) return Promise.resolve();
    ended = true;
    clearInterval(keepaliveTimer);
    streamController.signal?.removeEventListener("abort", onSignalAbort);
    setDemand();
    const accounting = serialize ? null : streamController.settleAbort?.(error);
    if (wasConnected) streamController.handleError(error);
    terminationPromise = (async () => {
      try {
        const terminal = serialize && !terminalEmitted && onAbortTerminal ? onAbortTerminal() : null;
        const accepted = Promise.all([accounting, terminal]).then(value => ({ value }), failure => ({ failure }));
        terminalEmitted = true;
        await cleanup(error);
        const outcome = await accepted;
        if (outcome.failure) throw outcome.failure;
        const bytes = outcome.value[1];
        if (error?.code === "usage_acceptance_failed") { output.error(error); return; }
        if (bytes) output.enqueue(bytes);
        const message = error?.message || "";
        const networkClose = error?.name === "AbortError" || /aborted|socket hang up|ECONNRESET|ETIMEDOUT|EPIPE/.test(message) || error?.cause?.code === "UND_ERR_SOCKET";
        if (onAbortTerminal || !wasConnected || networkClose) output.close();
        else output.error(error);
      } catch (acceptanceError) {
        await cleanup(error);
        output.error(acceptanceError);
      }
    })();
    return terminationPromise;
  };
  const onSignalAbort = () => {
    if (transformStream.isTerminal?.()) return;
    const reason = streamController.signal.reason || new Error("aborted");
    void closeOnError(reason, false, Boolean(streamController.getError?.()) && reason.name !== "AbortError");
  };
  return new ReadableStream({
    start(controller) {
      output = controller;
      streamController.signal?.addEventListener("abort", onSignalAbort, { once: true });
      if (streamController.signal?.aborted) { onSignalAbort(); return; }
      setDemand();
      if (keepaliveMs > 0) keepaliveTimer = setInterval(() => {
        if (ended) return;
        if (!streamController.isConnected() && !transformStream.isTerminal?.()) { void closeOnError(streamController.getError?.() || new Error("aborted"), false); return; }
        if (!transformStream.isTerminal?.() && output.desiredSize > 0 && atEventBoundary && Date.now() - lastActivityAt >= keepaliveMs) {
          output.enqueue(pingBytes); lastActivityAt = Date.now(); setDemand();
        }
      }, Math.min(keepaliveMs, 1000));
    },
    pull(controller) {
      if (ended) return;
      if (!streamController.isConnected() && !transformStream.isTerminal?.()) { void closeOnError(streamController.getError?.() || new Error("aborted"), false); return; }
      setDemand();
      if (reading) return;
      reading = true;
      void (async () => {
        try {
          const { done, value } = await reader.read();
          if (ended) return;
          lastActivityAt = Date.now();
          if (done) {
            ended = true; clearInterval(keepaliveTimer);
            streamController.signal?.removeEventListener("abort", onSignalAbort);
            streamController.handleComplete(); setDemand();
            await cleanup(); controller.close(); return;
          }
          const text = boundaryDecoder.decode(value, { stream: true });
          suffix = (suffix + text.slice(-4)).slice(-4);
          atEventBoundary = /(?:\r\n\r\n|\n\n|\r\r)$/.test(suffix);
          reading = false; controller.enqueue(value); setDemand();
        } catch (error) { reading = false; await closeOnError(error); }
      })();
    },
    async cancel(reason) {
      let accounting;
      if (!ended) {
        ended = true; clearInterval(keepaliveTimer);
        streamController.signal?.removeEventListener("abort", onSignalAbort);
        if (transformStream.isTerminal?.()) streamController.handleComplete();
        accounting = streamController.settleAbort?.(reason || "cancelled");
        streamController.handleDisconnect(reason || "cancelled");
      }
      setDemand();
      const accepted = Promise.resolve(accounting).then(() => null, error => error);
      await cleanup(reason);
      const failure = await accepted;
      if (failure) throw failure;
      if (terminationPromise) await terminationPromise;
    },
  }, { highWaterMark: 1 });
}

/**
 * Pipe provider response through transform with disconnect detection and keepalive.
 *
 * Stall watchdog tracks raw upstream byte activity, not transform output.
 * Reasoning models (Claude thinking via Kiro, etc.) can produce zero SSE
 * output for long stretches while partial EventStream frames keep arriving.
 * Measuring stall on the transform output caused false stalls and the
 * "failed to pipe response" error in Next.
 *
 * Any upstream chunk resets the timer. If no bytes arrive for
 * STREAM_STALL_TIMEOUT_MS, abort the underlying fetch via the controller.
 *
 * @param {Response} providerResponse - Response from provider
 * @param {{readable: ReadableStream, writable: WritableStream}} transformStream - SSE stream pair
 * @param {object} streamController - Stream controller from createStreamController
 * @param {function|null} onAbortTerminal - Optional abort terminal serializer
 * @param {number} stallTimeoutMs - Stall timeout in ms
 * @param {number} firstChunkTimeoutMs - TTFT timeout in ms
 * @param {number} keepaliveMs - Keepalive ping interval in ms (0 = disabled)
 * @param {string} sourceFormat - Client source format (e.g. "claude", "openai")
 */
export function pipeWithDisconnect(
  providerResponse,
  transformStream,
  streamController,
  onAbortTerminal = null,
  stallTimeoutMs = STREAM_STALL_TIMEOUT_MS,
  firstChunkTimeoutMs = STREAM_FIRST_CHUNK_TIMEOUT_MS,
  keepaliveMs = SSE_KEEPALIVE_MS,
  sourceFormat = null
) {
  const upstream = providerResponse.body.getReader();
  const writer = transformStream.writable.getWriter();
  let stallTimer;
  let stallRemaining = 0;
  let stallArmedAt = 0;
  let stopped = false;
  let upstreamReading = false;
  let demand = true;
  let demandWaiters = [];
  let chunkCount = 0;
  let abortMessage = "upstream connection lost";
  let cancellation;
  let writerAbort;
  let upstreamEOF = false;
  let removeTerminalListener;
  const clearStall = () => {
    if (stallTimer) stallRemaining = Math.max(0, stallRemaining - (Date.now() - stallArmedAt));
    clearTimeout(stallTimer); stallTimer = null;
  };
  const wakeDemand = () => { const waiters = demandWaiters; demandWaiters = []; for (const resolve of waiters) resolve(); };
  const cancelUpstream = reason => cancellation ??= Promise.resolve().then(() => upstream.cancel(reason)).catch(() => {}).finally(() => { try { upstream.releaseLock(); } catch {} });
  const stop = (reason, terminal = false) => {
    stopped = true; clearStall(); wakeDemand();
    void cancelUpstream(reason);
    if (!terminal) writerAbort ??= writer.abort(reason).catch(() => {});
  };
  const onSignalAbort = () => {
    const reason = streamController.signal.reason || new Error("aborted");
    abortMessage = reason?.message || "upstream connection lost";
    stop(reason);
  };
  const armStall = () => {
    if (stopped || !upstreamReading || !demand) { clearStall(); return; }
    if (stallTimer) return;
    const timeout = chunkCount === 0 ? firstChunkTimeoutMs : stallTimeoutMs;
    if (!(timeout > 0)) return;
    stallArmedAt = Date.now();
    stallTimer = setTimeout(() => {
      abortMessage = chunkCount === 0 ? `TTFT timeout (${firstChunkTimeoutMs}ms)` : `stream stall timeout (${stallTimeoutMs}ms)`;
      const error = new Error(abortMessage);
      streamController.handleError(error); stop(error);
    }, stallRemaining);
  };
  streamController.signal?.addEventListener("abort", onSignalAbort, { once: true });
  removeTerminalListener = transformStream.onTerminal?.(() => { streamController.handleComplete(); stop(undefined, true); });
  const pump = async () => {
    try {
      if (streamController.signal?.aborted) { onSignalAbort(); return; }
      while (!stopped) {
        while (!demand && !stopped) await new Promise(resolve => demandWaiters.push(resolve));
        if (stopped) break;
        await writer.ready;
        if (stopped) break;
        upstreamReading = true;
        stallRemaining = chunkCount === 0 ? firstChunkTimeoutMs : stallTimeoutMs;
        armStall();
        let result;
        try { result = await upstream.read(); }
        finally { upstreamReading = false; clearStall(); }
        if (stopped) break;
        if (result.done) { upstreamEOF = true; await writer.close(); break; }
        chunkCount++;
        await writer.write(result.value);
      }
    } catch (error) {
      if (!stopped) {
        abortMessage = error?.message || "upstream connection lost";
        writerAbort ??= writer.abort(error).catch(() => {});
      }
    } finally {
      stopped = true; wakeDemand(); clearStall();
      streamController.signal?.removeEventListener("abort", onSignalAbort);
      removeTerminalListener?.();
      if (!upstreamEOF) await cancelUpstream();
      if (writerAbort) await writerAbort;
      else if (!upstreamEOF && transformStream.isTerminal?.()) await writer.close().catch(() => {});
      try { upstream.releaseLock(); } catch {}
      try { writer.releaseLock(); } catch {}
    }
  };
  const pumping = pump();
  return createDisconnectAwareStream({ readable: transformStream.readable,
    dispose: reason => transformStream.dispose?.(reason), isTerminal: () => transformStream.isTerminal?.(),
  }, streamController, message => (transformStream.abortTerminalBytes || onAbortTerminal)?.(message || abortMessage), keepaliveMs, sourceFormat, {
    onDemand(value) { demand = value; if (value) wakeDemand(); armStall(); },
    async cancel(reason) { stop(reason, transformStream.isTerminal?.()); await pumping; },
    onCleanup() { clearStall(); },
  });
}

