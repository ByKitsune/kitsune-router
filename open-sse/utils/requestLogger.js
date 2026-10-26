const isNode = typeof process !== "undefined" && process.versions?.node && typeof window === "undefined";
const LOGGING_ENABLED = typeof process !== "undefined" && process.env?.ENABLE_REQUEST_LOGS === "true";
const MAX_ITEMS = 1000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_RECORD_BYTES = 16 * 1024;
const state = globalThis[Symbol.for("zenrouter.requestLogQueue")] ||= {
  items: [], bytes: 0, pending: null, modules: null, scheduled: false, stopped: false,
  accepted: 0, written: 0, dropped: 0, errors: 0, sequence: 0,
};

async function modules() {
  return state.modules ||= Promise.all([import("node:fs/promises"), import("node:path")]);
}

function safeSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}

function safeUrl(value) {
  try { const url = new URL(value); return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 512); }
  catch { return "[REDACTED]"; }
}

export function maskSensitiveHeaders(headers) {
  if (!headers) return {};
  const masked = {};
  const entries = typeof headers.entries === "function" ? headers.entries() : Object.entries(headers);
  let count = 0;
  for (const [key, value] of entries) {
    if (count++ >= 40) break;
    const name = String(key).slice(0, 100);
    masked[name] = /authorization|api.?key|cookie|token|credential|secret/i.test(String(key)) ? "[REDACTED]" : String(value).slice(0, 256);
  }
  return masked;
}

export function safePayloadMetadata(value) {
  if (value === null || value === undefined) return { present: false };
  if (typeof value === "string" || value instanceof Uint8Array) return { present: true, type: "bytes", size: value.length };
  return { present: true, type: Array.isArray(value) ? "array" : typeof value };
}

function enqueue(session, filename, data, append = false) {
  if (!isNode || !LOGGING_ENABLED || state.stopped) return false;
  const body = typeof data === "string" ? data : JSON.stringify({ timestamp: new Date().toISOString(), ...data }, null, 2);
  const bytes = Buffer.byteLength(body);
  if (bytes > MAX_RECORD_BYTES || state.items.length >= MAX_ITEMS || state.bytes + bytes > MAX_BYTES) { state.dropped++; return false; }
  state.items.push({ session, filename, body, append, bytes });
  state.bytes += bytes;
  state.accepted++;
  if (!state.scheduled && !state.pending) {
    state.scheduled = true;
    setImmediate(() => { state.scheduled = false; drainBatch().catch(() => {}); });
  }
  return true;
}

async function drainBatch() {
  if (state.pending) return state.pending;
  state.pending = (async () => {
    const [fs, path] = await modules();
    const batch = state.items.slice(0, 50);
    for (const item of batch) {
      try {
        const directory = path.join(process.cwd(), "logs", item.session);
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        await fs.writeFile(path.join(directory, item.filename), item.body, { flag: item.append ? "a" : "w", mode: 0o600 });
        state.written++;
      } catch { state.errors++; state.dropped++; }
      state.items.shift();
      state.bytes -= item.bytes;
    }
  })();
  try { await state.pending; }
  catch {
    state.errors++;
    state.dropped += state.items.length;
    state.items = [];
    state.bytes = 0;
    state.modules = null;
  } finally {
    state.pending = null;
    if (state.items.length) {
      state.scheduled = true;
      setImmediate(() => { state.scheduled = false; drainBatch().catch(() => {}); });
    }
  }
}

export function getRequestLogQueueMetrics() {
  return { depth: state.items.length, bytes: state.bytes, accepted: state.accepted, written: state.written, dropped: state.dropped, errors: state.errors };
}

export async function flushRequestLogs({ deadline = Date.now() + 5000, stop = false } = {}) {
  if (stop) state.stopped = true;
  while (state.items.length && Date.now() < deadline) {
    const wait = Math.max(0, deadline - Date.now());
    let timer;
    await Promise.race([drainBatch(), new Promise(resolve => { timer = setTimeout(resolve, wait); })]);
    clearTimeout(timer);
  }
  return { ...getRequestLogQueueMetrics(), drained: state.items.length === 0 };
}

function noOpLogger() {
  return {
    sessionPath: null, logClientRawRequest() {}, logRawRequest() {}, logOpenAIRequest() {}, logTargetRequest() {},
    logProviderResponse() {}, appendProviderChunk() {}, appendOpenAIChunk() {}, logConvertedResponse() {}, appendConvertedChunk() {}, logError() {},
  };
}

export async function createRequestLogger(sourceFormat, targetFormat, model) {
  if (!isNode || !LOGGING_ENABLED) return noOpLogger();
  const session = `${safeSegment(sourceFormat)}_${safeSegment(targetFormat)}_${safeSegment(model)}_${Date.now()}_${process.pid}_${state.sequence++}`;
  const json = (file, data) => enqueue(session, file, data);
  const chunk = (file, value) => enqueue(session, file, JSON.stringify({ size: typeof value === "string" || value instanceof Uint8Array ? value.length : 0 }) + "\n", true);
  return {
    sessionPath: `${process.cwd()}/logs/${session}`,
    logClientRawRequest(endpoint, body, headers = {}) { json("1_req_client.json", { endpoint: String(endpoint || "").split("?")[0].slice(0, 256), headers: maskSensitiveHeaders(headers), body: safePayloadMetadata(body) }); },
    logRawRequest(body, headers = {}) { json("2_req_source.json", { headers: maskSensitiveHeaders(headers), body: safePayloadMetadata(body) }); },
    logOpenAIRequest(body) { json("3_req_openai.json", { body: safePayloadMetadata(body) }); },
    logTargetRequest(url, headers, body) { json("4_req_target.json", { url: safeUrl(url), headers: maskSensitiveHeaders(headers), body: safePayloadMetadata(body) }); },
    logProviderResponse(status, statusText, headers, body) { json("5_res_provider.json", { status, statusText: typeof statusText === "string" ? statusText.slice(0, 80) : "", headers: maskSensitiveHeaders(headers), body: safePayloadMetadata(body) }); },
    appendProviderChunk(value) { chunk("5_res_provider.txt", value); },
    appendOpenAIChunk(value) { chunk("6_res_openai.txt", value); },
    logConvertedResponse(body) { json("7_res_client.json", { body: safePayloadMetadata(body) }); },
    appendConvertedChunk(value) { chunk("7_res_client.txt", value); },
    logError(error) { json("6_error.json", { errorType: safeSegment(error?.name || "Error") }); },
  };
}

export function logRequest() {}
export function logResponse() {}
export function logError(provider, { error, url, model } = {}) {
  enqueue("errors", `${safeSegment(provider)}-${new Date().toISOString().slice(0, 10)}.log`, JSON.stringify({ timestamp: new Date().toISOString(), type: "error", provider: safeSegment(provider), model: safeSegment(model), url: safeUrl(url), errorType: safeSegment(error?.name || "Error") }) + "\n", true);
}
