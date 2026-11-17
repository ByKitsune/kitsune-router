import { REQUEST_LOG_STREAM_MAX_BYTES } from "../config/logging.js";
import { formatLogValue, isSensitiveLogKey } from "./logSanitizer.js";

const isNode = typeof process !== "undefined" && process.versions?.node && typeof window === "undefined";
const LOGGING_ENABLED = typeof process !== "undefined" && process.env?.ENABLE_REQUEST_LOGS === "true";
const MAX_ITEMS = 1000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_RECORD_BYTES = 16 * 1024;
const state = globalThis[Symbol.for("kitsunerouter.requestLogQueue")] ||= {
  items: [], bytes: 0, pending: null, modules: null, scheduled: false, stopped: false,
  accepted: 0, written: 0, dropped: 0, errors: 0, sequence: 0,
};

async function modules() {
  return state.modules ||= Promise.all([import("node:fs/promises"), import("node:path"), import("../../cli/hooks/dataDirectory.js")]);
}

async function logRoot() {
  if (state.directory) return state.directory;
  const [, path, dataDirectory] = await modules();
  return state.directory = path.join(dataDirectory.default.resolveDataDirectory(), "logs");
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
  try {
    let method;
    for (let owner = headers, depth = 0; owner && depth < 3; owner = Object.getPrototypeOf(owner), depth++) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, "entries");
      if (descriptor && "value" in descriptor && typeof descriptor.value === "function") { method = descriptor.value; break; }
    }
    const entries = method ? method.call(headers) : (function* () {
      for (const key in headers) {
        const descriptor = Object.getOwnPropertyDescriptor(headers, key);
        if (descriptor?.enumerable) yield [key, "value" in descriptor ? descriptor.value : "[Accessor]"];
      }
    })();
    let count = 0;
    for (const [key, value] of entries) {
      if (count++ >= 40) break;
      const name = formatLogValue(key, 100);
      masked[name] = isSensitiveLogKey(String(key)) ? "[REDACTED]" : formatLogValue(value, 256);
    }
  } catch { /* Headers are optional diagnostic metadata. */ }
  return masked;
}

export function safePayloadMetadata(value) {
  if (value === null || value === undefined) return { present: false };
  if (typeof value === "string" || value instanceof Uint8Array) return { present: true, type: "bytes", size: typeof value === "string" ? Buffer.byteLength(value) : value.byteLength };
  return { present: true, type: Array.isArray(value) ? "array" : typeof value };
}

function enqueue(session, filename, data, append = false) {
  if (!isNode || !LOGGING_ENABLED || state.stopped) return false;
  let body;
  try { body = typeof data === "string" ? data : JSON.stringify({ timestamp: new Date().toISOString(), ...data }, null, 2); }
  catch { state.errors++; state.dropped++; return false; }
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
    const root = await logRoot();
    const batch = state.items.slice(0, 50);
    const groups = [];
    const appendGroups = new Map();
    for (const item of batch) {
      const key = `${item.session}/${item.filename}`;
      if (item.append && appendGroups.has(key)) appendGroups.get(key).push(item);
      else {
        const group = [item];
        groups.push(group);
        if (item.append) appendGroups.set(key, group);
      }
    }
    const readyDirectories = new Set();
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    if (!(await fs.lstat(root)).isDirectory()) throw new Error("Refusing non-directory log root");
    for (const group of groups) {
      const item = group[0];
      try {
        const directory = path.join(root, item.session);
        if (!readyDirectories.has(directory)) {
          await fs.mkdir(directory, { recursive: true, mode: 0o700 });
          if (!(await fs.lstat(directory)).isDirectory()) throw new Error("Refusing non-directory log session");
          readyDirectories.add(directory);
        }
        const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0)
          | (item.append ? fs.constants.O_APPEND : 0);
        const file = path.join(directory, item.filename);
        // O_NOFOLLOW is not available on every supported platform.
        try {
          const existing = await fs.lstat(file);
          if (!existing.isFile() || existing.nlink > 1) throw new Error("Refusing non-regular log file");
        } catch (error) { if (error.code !== "ENOENT") throw error; }
        const handle = await fs.open(file, flags, 0o600);
        let writableCount = group.length;
        try {
          const info = await handle.stat();
          if (!info.isFile() || info.nlink > 1) throw new Error("Refusing non-regular log file");
          if (item.append) {
            let available = REQUEST_LOG_STREAM_MAX_BYTES - info.size;
            writableCount = 0;
            for (const part of group) {
              if (part.bytes > available) break;
              writableCount++;
              available -= part.bytes;
            }
          }
          if (writableCount) {
            if (process.platform !== "win32" && (info.mode & 0o777) !== 0o600) await handle.chmod(0o600);
            if (!item.append) await handle.truncate(0);
            await handle.writeFile(group.slice(0, writableCount).map(part => part.body).join(""));
          }
        } finally { await handle.close(); }
        state.dropped += group.length - writableCount;
        state.written += writableCount;
      } catch { state.errors++; state.dropped += group.length; }
    }
    state.items.splice(0, batch.length);
    state.bytes -= batch.reduce((sum, item) => sum + item.bytes, 0);
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
  if (!isNode || !LOGGING_ENABLED || state.stopped) return noOpLogger();
  let directory;
  try { directory = await logRoot(); } catch { state.errors++; return noOpLogger(); }
  const session = `${safeSegment(sourceFormat)}_${safeSegment(targetFormat)}_${safeSegment(model)}_${Date.now()}_${process.pid}_${state.sequence++}`;
  const json = (file, data) => enqueue(session, file, data);
  const streamBytes = new Map();
  const chunk = (file, value) => {
    const body = JSON.stringify({ size: typeof value === "string" ? Buffer.byteLength(value) : value instanceof Uint8Array ? value.byteLength : 0 }) + "\n";
    const bytes = Buffer.byteLength(body);
    const accepted = streamBytes.get(file) || 0;
    if (accepted + bytes > REQUEST_LOG_STREAM_MAX_BYTES) { state.dropped++; return; }
    if (enqueue(session, file, body, true)) streamBytes.set(file, accepted + bytes);
  };
  return {
    sessionPath: `${directory}/${session}`,
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
