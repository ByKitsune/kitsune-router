import { getUsageStats, statsEmitter, getActiveRequests } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const encoder = new TextEncoder();
  const state = { closed: false, controller: null, keepalive: null, send: null, sendPending: null, cachedStats: null, refreshing: false, dirty: false };

  // Idempotent: safe to call from request.signal abort, cancel(), or enqueue failure.
  const cleanup = (closeStream = false) => {
    if (state.closed) return;
    state.closed = true;
    if (state.send) statsEmitter.off("update", state.send);
    if (state.sendPending) statsEmitter.off("pending", state.sendPending);
    if (state.keepalive) clearInterval(state.keepalive);
    request?.signal?.removeEventListener("abort", onAbort);
    if (closeStream && state.controller) {
      try { state.controller.close(); } catch {}
    }
  };
  const onAbort = () => cleanup(true);

  // request.signal fires reliably on client disconnect; ReadableStream.cancel()
  // is not always invoked in Next.js, which caused listeners to accumulate on the
  // process-wide statsEmitter. Same pattern as translator/console-logs/stream.
  request?.signal?.addEventListener("abort", onAbort, { once: true });
  if (request?.signal?.aborted) cleanup();

  const stream = new ReadableStream({
    async start(controller) {
      state.controller = controller;
      if (state.closed) { controller.close(); return; }

      const send = (message) => {
        if (state.closed) return false;
        try {
          controller.enqueue(encoder.encode(message));
          return true;
        } catch {
          cleanup(true);
          return false;
        }
      };

      // Preserve the existing full-stat messages for other stream consumers, but
      // coalesce recalculations when several committed updates arrive at once.
      const refreshSnapshot = async () => {
        if (state.closed) return;
        if (state.refreshing) { state.dirty = true; return; }
        state.refreshing = true;
        try {
          do {
            state.dirty = false;
            if (state.cachedStats) {
              const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
              const quickStats = { ...state.cachedStats, activeRequests, recentRequests, errorProvider };
              if (!send(`data: ${JSON.stringify(quickStats)}\n\n`)) return;
            }
            const stats = await getUsageStats();
            if (state.closed) return;
            state.cachedStats = stats;
            if (!send(`data: ${JSON.stringify(stats)}\n\n`)) return;
          } while (state.dirty && !state.closed);
        } catch {
          console.error("[Usage stream] Failed to refresh usage data");
          cleanup(true);
        } finally {
          state.refreshing = false;
        }
      };

      // An update is emitted only after usage is projected. A separate SSE event
      // lets period-filtered clients refresh without treating pending events or
      // all-time snapshots as selected-period totals.
      state.send = () => {
        if (send("event: usage-updated\ndata: {}\n\n")) void refreshSnapshot();
      };

      // Lightweight push: only refresh activeRequests + recentRequests on pending changes
      state.sendPending = async () => {
        if (state.closed || !state.cachedStats) return;
        try {
          const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
          const stats = { ...state.cachedStats, activeRequests, recentRequests, errorProvider };
          send(`data: ${JSON.stringify(stats)}\n\n`);
        } catch {
          console.error("[Usage stream] Failed to refresh live requests");
          cleanup(true);
        }
      };

      // Subscribe before the initial snapshot so a commit during that read is
      // not missed. Aborts and failed reads remove these listeners immediately.
      statsEmitter.on("update", state.send);
      statsEmitter.on("pending", state.sendPending);
      await refreshSnapshot();
      if (state.closed) return;

      state.keepalive = setInterval(() => {
        send(": ping\n\n");
      }, 25000);
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
