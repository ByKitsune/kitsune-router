export const SSE_LIMITS = Object.freeze({ eventChars: 64 * 1024 * 1024, outputItems: 65536 });
export const SSE_COMPLETION_GRACE_MS = 3000;

export function createSSEParser({ mode = "sse", maxEventChars = SSE_LIMITS.eventChars } = {}) {
  if (mode !== "sse" && mode !== "ndjson") throw new TypeError("Unsupported stream framing");
  const decoder = new TextDecoder();
  let lineParts = [];
  let lineBlocks = [];
  let lineLength = 0;
  let eventLength = 0;
  let dataParts = [];
  let dataBlocks = [];
  let hasData = false;
  let eventName = null;
  let skipLF = false;
  let ended = false;
  let scannedChars = 0;

  const resetEvent = () => { dataParts = []; dataBlocks = []; hasData = false; eventName = null; eventLength = 0; };
  const dispatch = () => {
    let event = null;
    if (hasData) {
      if (dataParts.length) dataBlocks.push(dataParts.join("\n"));
      event = { event: eventName, data: dataBlocks.join("\n") };
    }
    resetEvent();
    return event;
  };
  const appendLine = part => {
    lineParts.push(part);
    lineLength += part.length;
    if (lineParts.length === 1024) { lineBlocks.push(lineParts.join("")); lineParts = []; }
  };
  const takeLine = part => {
    if (part) appendLine(part);
    lineBlocks.push(lineParts.join(""));
    const value = lineBlocks.join("");
    lineParts = []; lineBlocks = []; lineLength = 0;
    return value;
  };
  const line = (value) => {
    if (mode === "ndjson") return value.trim() ? { event: null, data: value } : null;
    if (value === "") return dispatch();
    if (value[0] === ":") return null;
    const colon = value.indexOf(":");
    const field = colon < 0 ? value : value.slice(0, colon);
    let content = colon < 0 ? "" : value.slice(colon + 1);
    if (content[0] === " ") content = content.slice(1);
    if (field === "data") {
      hasData = true;
      dataParts.push(content);
      if (dataParts.length === 1024) { dataBlocks.push(dataParts.join("\n")); dataParts = []; }
    } else if (field === "event") eventName = content || null;
    return null;
  };
  function* scan(text) {
    let start = 0;
    for (let cursor = 0; cursor < text.length; cursor++) {
      scannedChars++;
      const code = text.charCodeAt(cursor);
      if (skipLF) {
        skipLF = false;
        if (code === 10) { start = cursor + 1; continue; }
      }
      if (++eventLength > maxEventChars) throw new RangeError("Upstream stream event exceeds limit");
      if (code !== 10 && code !== 13) continue;
      const part = text.slice(start, cursor);
      const value = lineLength ? takeLine(part) : part;
      start = cursor + 1;
      skipLF = code === 13;
      const event = line(value);
      if (mode === "ndjson") eventLength = 0;
      if (event) yield event;
    }
    if (start < text.length) appendLine(text.slice(start));
  }
  return {
    *feed(chunk) {
      if (ended) return;
      yield* scan(typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }));
    },
    *end() {
      if (ended) return;
      ended = true;
      yield* scan(decoder.decode());
      if (lineLength) {
        const event = line(takeLine(""));
        if (event) yield event;
      }
      if (mode === "sse") {
        const event = dispatch();
        if (event) yield event;
      }
      eventLength = 0;
    },
    reset() { ended = true; lineParts = []; lineBlocks = []; lineLength = 0; resetEvent(); },
    getStats: () => ({ scannedChars, pendingChars: eventLength, pendingLineChars: lineLength }),
  };
}

export function parseSSEEvent(event) {
  if (event.data.trim() === "[DONE]") return { done: true };
  const value = JSON.parse(event.data);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid upstream stream event");
  for (const field of ["output_index", "content_index", "summary_index", "index"]) {
    if (value[field] !== undefined && !isValidStreamIndex(value[field])) throw new RangeError("Invalid upstream stream index");
  }
  if (Array.isArray(value.choices)) for (const choice of value.choices) {
    if (choice?.index !== undefined && !isValidStreamIndex(choice.index)) throw new RangeError("Invalid upstream choice index");
    if (Array.isArray(choice?.delta?.tool_calls)) for (const call of choice.delta.tool_calls) {
      if (call?.index !== undefined && !isValidStreamIndex(call.index)) throw new RangeError("Invalid upstream tool index");
    }
  }
  for (const output of [value.response?.output, value.output]) {
    if (Array.isArray(output) && output.length > SSE_LIMITS.outputItems) throw new RangeError("Upstream Responses output exceeds limit");
    if (Array.isArray(output)) for (const item of output) {
      if ((Array.isArray(item?.content) && item.content.length > SSE_LIMITS.outputItems) ||
          (Array.isArray(item?.summary) && item.summary.length > SSE_LIMITS.outputItems)) throw new RangeError("Upstream Responses content exceeds limit");
    }
  }
  return value;
}

export function streamEventPayload(event, value) {
  return event.event === "error" && !value.error && value.type !== "error"
    ? { ...value, type: "error" } : value;
}

export function isValidStreamIndex(index) {
  return Number.isSafeInteger(index) && index >= 0 && index < SSE_LIMITS.outputItems;
}

export async function consumeSSEStream(stream, onEvent, { mode = "sse", signal, deadline } = {}) {
  const parser = createSSEParser({ mode });
  const reader = stream.getReader();
  let eof = false;
  let cancelled = null;
  const cancel = (reason) => cancelled ??= Promise.resolve().then(() => reader.cancel(reason)).catch(() => {});
  const onAbort = () => { void cancel(signal.reason); };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) throw signal.reason || new Error("aborted");
    for (;;) {
      let timer;
      const until = deadline?.();
      let result;
      try {
        result = await (until == null ? reader.read() : Promise.race([
          reader.read(),
          new Promise(resolve => { timer = setTimeout(() => resolve({ expired: true }), Math.max(0, until - Date.now())); }),
        ]));
      } finally { clearTimeout(timer); }
      if (signal?.aborted) throw signal.reason || new Error("aborted");
      if (result.expired) break;
      if (result.done) {
        eof = true;
        for (const event of parser.end()) if (onEvent(event) === false) break;
        break;
      }
      let stop = false;
      for (const event of parser.feed(result.value)) {
        if (onEvent(event) === false) { stop = true; break; }
      }
      if (stop) break;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    parser.reset();
    if (!eof) await cancel(signal?.reason);
    if (cancelled) await cancelled;
    reader.releaseLock();
  }
}

export function createEventTransform(transformer) {
  let output;
  let input;
  let closed = false;
  let stopped = false;
  let pending = [];
  let waiters = [];
  let failure = null;
  const wake = () => { const current = waiters; waiters = []; for (const resolve of current) resolve(); };
  const drain = () => {
    while (!closed && pending.length && output.desiredSize > 0) output.enqueue(pending.shift());
    if (!closed && stopped && !pending.length) { closed = true; output.close(); }
    wake();
  };
  const controller = {
    enqueue(value) { if (closed || stopped) return; pending.push(value); drain(); },
    error(error) { failure = error; pending = []; if (!closed) { closed = true; output.error(error); } input?.error(error); wake(); },
    terminate() { stopped = true; drain(); },
    async ready() {
      while (!closed && (pending.length || output.desiredSize <= 0)) await new Promise(resolve => waiters.push(resolve));
      if (failure) throw failure;
    },
    get desiredSize() { return output.desiredSize; },
  };
  const readable = new ReadableStream({
    start(value) { output = value; },
    pull() { drain(); },
    cancel(reason) {
      closed = true; stopped = true; pending = [];
      input?.error(reason || new Error("Stream cancelled"));
      wake();
      return transformer.cancel?.(reason);
    },
  }, { highWaterMark: 1 });
  const writable = new WritableStream({
    start(value) { input = value; transformer.start?.(controller); },
    async write(chunk) {
      if (stopped) return;
      try { await transformer.transform(chunk, controller); } catch (error) { controller.error(error); throw error; }
    },
    async close() {
      if (stopped) return;
      try { await transformer.flush?.(controller); controller.terminate(); } catch (error) { controller.error(error); throw error; }
    },
    abort(reason) { controller.error(reason); return transformer.cancel?.(reason); },
  }, { highWaterMark: 1 });
  return {
    readable, writable,
    whenClosed: new Promise(resolve => {
      const check = () => { if (closed) resolve(); else waiters.push(check); };
      check();
    }),
  };
}

export function sseChunk(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// Build OpenAI chat.completion.chunk SSE frame. Key order: id, object, created, model, choices.
export function chatChunkSse({ id, created, model, delta, finishReason = null }) {
  return sseChunk({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
}
