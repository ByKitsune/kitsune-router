import { STREAM_STALL_TIMEOUT_MS, STREAM_FIRST_CHUNK_TIMEOUT_MS, SSE_KEEPALIVE_MS } from "../config/runtimeConfig.js";
import { FORMATS } from "../translator/formats.js";
import { dbg } from "./debugLog.js";

const keepaliveEncoder = new TextEncoder();
const CLAUDE_PING_BYTES = keepaliveEncoder.encode("event: ping\ndata: {}\n\n");
const OPENAI_PING_BYTES = keepaliveEncoder.encode(": ping\n\n");

export function createStreamController({ onDisconnect, onError, log, provider, model, reqTag = "" } = {}) {
  const abortController = new AbortController();
  const startTime = Date.now();
  let disconnected = false;
  let streamError = null;
  return {
    signal: abortController.signal, startTime,
    isConnected: () => !disconnected,
    getError: () => streamError,
    handleDisconnect(reason = "client_closed") {
      if (disconnected) { abortController.abort(reason); return; }
      disconnected = true;
      dbg("CTRL", `${provider}/${model} | disconnect | dur=${Date.now() - startTime}ms`);
      abortController.abort(reason instanceof Error ? reason : new Error(String(reason)));
      onDisconnect?.({ reason, duration: Date.now() - startTime });
    },
    handleComplete() { disconnected = true; },
    handleError(error) {
      if (disconnected) return;
      disconnected = true;
      streamError = error;
      abortController.abort(error);
      if (error?.name !== "AbortError") {
        log?.errorLine?.(reqTag, "✗", `ERROR · ${provider}/${model}`);
        onError?.(error);
      }
    },
    abort(error) {
      disconnected = true;
      if (error) streamError = error;
      abortController.abort(error);
    },
  };
}

export function createDisconnectAwareStream(
  transformStream, streamController, onAbortTerminal = null,
  keepaliveMs = SSE_KEEPALIVE_MS, sourceFormat = null, lifecycle = {},
) {
  const reader = transformStream.readable.getReader();
  const writer = transformStream.writable?.getWriter();
  const pingBytes = sourceFormat === FORMATS.CLAUDE ? CLAUDE_PING_BYTES : OPENAI_PING_BYTES;
  let output;
  let ended = false;
  let reading = false;
  let terminalEmitted = false;
  let keepaliveTimer;
  let cleanupPromise;
  let lastActivityAt = Date.now();
  let atEventBoundary = true;
  let suffix = "";
  const boundaryDecoder = new TextDecoder();
  const setDemand = () => lifecycle.onDemand?.(!ended && output.desiredSize > 0);
  const notifyAbort = () => {
    lifecycle.onAbort?.(streamController.signal?.reason);
    if (!streamController.getError?.() || streamController.getError()?.name === "AbortError") streamController.handleDisconnect(streamController.signal?.reason || "aborted");
  };
  const cleanup = reason => {
    if (cleanupPromise) return cleanupPromise;
    clearInterval(keepaliveTimer);
    streamController.signal?.removeEventListener("abort", onSignalAbort);
    const tasks = [
      Promise.resolve().then(() => reader.cancel(reason)),
      Promise.resolve().then(() => writer?.abort(reason)),
      Promise.resolve().then(() => lifecycle.cancel?.(reason)),
    ];
    cleanupPromise = Promise.allSettled(tasks).then(() => {
      try { reader.releaseLock(); } catch {}
      try { writer?.releaseLock?.(); } catch {}
      transformStream.dispose?.(reason);
      lifecycle.onCleanup?.();
    });
    return cleanupPromise;
  };
  const emitTerminal = () => {
    if (terminalEmitted || !onAbortTerminal) return;
    terminalEmitted = true;
    try {
      const bytes = onAbortTerminal();
      if (bytes) output.enqueue(bytes);
    } catch {}
  };
  const closeOnError = (error, wasConnected = streamController.isConnected(), serialize = true) => {
    if (ended) return;
    ended = true;
    clearInterval(keepaliveTimer);
    streamController.signal?.removeEventListener("abort", onSignalAbort);
    const message = error?.message || "";
    const code = error?.code || error?.cause?.code;
    const networkClose = error?.name === "AbortError" || /aborted|socket hang up|ECONNRESET|ETIMEDOUT|EPIPE/.test(message) || code === "UND_ERR_SOCKET";
    try {
      if (onAbortTerminal || !wasConnected || networkClose) { if (serialize) emitTerminal(); output.close(); }
      else output.error(error);
    } finally {
      if (wasConnected) streamController.handleError(error);
      setDemand();
      void cleanup(error);
    }
  };
  const onSignalAbort = () => {
    if (transformStream.isTerminal?.()) return;
    notifyAbort();
    closeOnError(streamController.signal.reason || new Error("aborted"), false, Boolean(streamController.getError?.()));
  };
  return new ReadableStream({
    start(controller) {
      output = controller;
      streamController.signal?.addEventListener("abort", onSignalAbort, { once: true });
      if (streamController.signal?.aborted) { onSignalAbort(); return; }
      setDemand();
      if (keepaliveMs > 0) keepaliveTimer = setInterval(() => {
        if (ended) return;
        if (!streamController.isConnected() && !transformStream.isTerminal?.()) { closeOnError(streamController.getError?.() || new Error("aborted"), false); return; }
        if (!transformStream.isTerminal?.() && output.desiredSize > 0 && atEventBoundary && Date.now() - lastActivityAt >= keepaliveMs) {
          output.enqueue(pingBytes);
          lastActivityAt = Date.now();
          setDemand();
        }
      }, Math.min(keepaliveMs, 1000));
    },
    pull(controller) {
      if (ended) return;
      if (!streamController.isConnected() && !transformStream.isTerminal?.()) { closeOnError(streamController.getError?.() || new Error("aborted"), false); return; }
      setDemand();
      if (reading) return;
      reading = true;
      void (async () => {
        try {
          const { done, value } = await reader.read();
          if (ended) return;
          lastActivityAt = Date.now();
          if (done) {
            ended = true;
            clearInterval(keepaliveTimer);
            streamController.signal?.removeEventListener("abort", onSignalAbort);
            streamController.handleComplete();
            setDemand();
            await cleanup();
            controller.close();
            return;
          }
          const text = boundaryDecoder.decode(value, { stream: true });
          suffix = (suffix + text.slice(-4)).slice(-4);
          atEventBoundary = /(?:\r\n\r\n|\n\n|\r\r)$/.test(suffix);
          reading = false;
          controller.enqueue(value);
          setDemand();
        } catch (error) { reading = false; closeOnError(error); }
      })();
    },
    cancel(reason) {
      if (!ended) {
        ended = true;
        clearInterval(keepaliveTimer);
        streamController.signal?.removeEventListener("abort", onSignalAbort);
        if (transformStream.isTerminal?.()) streamController.handleComplete();
        streamController.handleDisconnect(reason || "cancelled");
      }
      setDemand();
      return cleanup(reason);
    },
  }, { highWaterMark: 1 });
}

export function pipeWithDisconnect(
  providerResponse, transformStream, streamController, onAbortTerminal = null,
  stallTimeoutMs = STREAM_STALL_TIMEOUT_MS, firstChunkTimeoutMs = STREAM_FIRST_CHUNK_TIMEOUT_MS,
  keepaliveMs = SSE_KEEPALIVE_MS, sourceFormat = null,
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
    clearTimeout(stallTimer);
    stallTimer = null;
  };
  const wakeDemand = () => { const waiters = demandWaiters; demandWaiters = []; for (const resolve of waiters) resolve(); };
  const cancelUpstream = reason => cancellation ??= Promise.resolve().then(() => upstream.cancel(reason)).catch(() => {});
  const stop = (reason, terminal = false) => {
    stopped = true;
    clearStall();
    wakeDemand();
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
      streamController.handleError(error);
      stop(error);
    }, stallRemaining);
  };
  streamController.signal?.addEventListener("abort", onSignalAbort, { once: true });
  removeTerminalListener = transformStream.onTerminal?.(() => {
    streamController.handleComplete();
    stop(undefined, true);
  });
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
      stopped = true;
      wakeDemand();
      clearStall();
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
  return createDisconnectAwareStream({
    readable: transformStream.readable, dispose: reason => transformStream.dispose?.(reason),
    isTerminal: () => transformStream.isTerminal?.(),
  }, streamController, message => {
    const terminal = transformStream.abortTerminalBytes || onAbortTerminal;
    return terminal?.(message || abortMessage);
  }, keepaliveMs, sourceFormat, {
    onDemand(value) { demand = value; if (value) wakeDemand(); armStall(); },
    async cancel(reason) { stop(reason, transformStream.isTerminal?.()); await pumping; },
    onCleanup() { clearStall(); },
  });
}
