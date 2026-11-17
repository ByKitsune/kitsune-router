import { getConsoleLogs, getConsoleEmitter, initConsoleLogCapture } from "@/lib/consoleLogBuffer";

export const dynamic = "force-dynamic";

initConsoleLogCapture();

export async function GET(request) {
  const encoder = new TextEncoder();
  const emitter = getConsoleEmitter();
  const state = { closed: false, controller: null, send: null, sendLines: null, sendClear: null, keepalive: null };

  // Idempotent: safe to call from request.signal abort, cancel(), or enqueue failure.
  const cleanup = (close = false) => {
    if (state.closed) return;
    state.closed = true;
    if (state.send) emitter.off("line", state.send);
    if (state.sendLines) emitter.off("lines", state.sendLines);
    if (state.sendClear) emitter.off("clear", state.sendClear);
    if (state.keepalive) clearInterval(state.keepalive);
    request.signal.removeEventListener("abort", onAbort);
    if (close) {
      try { state.controller?.close(); } catch { /* Already closed or cancelled. */ }
    }
  };
  const onAbort = () => cleanup(true);

  const sendFrame = (frame) => {
    if (state.closed) return;
    // A live console is best-effort. Reconnecting provides the bounded current
    // snapshot; a slow reader must not retain an unlimited queue of old lines.
    if (state.controller.desiredSize <= 0) { cleanup(true); return; }
    try { state.controller.enqueue(encoder.encode(frame)); } catch { cleanup(true); }
  };

  const stream = new ReadableStream({
    start(controller) {
      state.controller = controller;
      if (request.signal.aborted) { cleanup(true); return; }
      // Next disconnects can signal abort without cancelling the response body.
      request.signal.addEventListener("abort", onAbort, { once: true });
      // Send all buffered logs immediately on connect
      const buffered = getConsoleLogs();
      if (buffered.length > 0) {
        sendFrame(`data: ${JSON.stringify({ type: "init", logs: buffered })}\n\n`);
      }
      if (state.closed) return;

      // Push new lines as they arrive
      state.send = (line) => {
        sendFrame(`data: ${JSON.stringify({ type: "line", line })}\n\n`);
      };

      state.sendLines = (lines) => {
        if (state.closed || !Array.isArray(lines) || lines.length === 0) return;
        sendFrame(`data: ${JSON.stringify({ type: "lines", lines })}\n\n`);
      };

      // Notify client when cleared
      state.sendClear = () => {
        sendFrame(`data: ${JSON.stringify({ type: "clear" })}\n\n`);
      };

      emitter.on("line", state.send);
      emitter.on("lines", state.sendLines);
      emitter.on("clear", state.sendClear);

      // Keepalive ping every 25s
      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        sendFrame(": ping\n\n");
      }, 25000);
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
