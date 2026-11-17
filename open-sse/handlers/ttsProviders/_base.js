// Shared TTS helpers
import { Buffer } from "node:buffer";
import { createAccountTransport } from "../../utils/accountTransport.js";
import { FETCH_CONNECT_TIMEOUT_MS } from "../../config/runtimeConfig.js";

export function discardTtsBody(response, reason) {
  try { void response?.body?.cancel(reason).catch(() => {}); } catch {}
}

// Keep a finite header deadline without cutting off a long, active audio body.
// Each request keeps the caller's signal after its header timer is cleared.
export function getTtsTransport(credentials, options = {}) {
  if (typeof options.fetch === "function") return options;
  const account = createAccountTransport(credentials, options);
  return Object.freeze({
    ...account,
    async fetch(url, init = {}) {
      const deadline = new AbortController();
      const signal = AbortSignal.any([deadline.signal, ...[account.signal, init.signal].filter(Boolean)]);
      let onAbort;
      const timer = setTimeout(() => deadline.abort(new DOMException("TTS response headers timed out", "TimeoutError")), FETCH_CONNECT_TIMEOUT_MS);
      timer.unref?.();
      try {
        signal.throwIfAborted();
        const aborted = new Promise((_, reject) => {
          onAbort = () => reject(signal.reason);
          signal.addEventListener("abort", onAbort, { once: true });
          if (signal.aborted) onAbort();
        });
        const pending = Promise.resolve().then(() => account.fetch(url, { ...init, signal })).then(response => {
          if (signal.aborted) { discardTtsBody(response, signal.reason); signal.throwIfAborted(); }
          return response;
        });
        return await Promise.race([pending, aborted]);
      } catch (error) {
        if (deadline.signal.aborted && !account.signal?.aborted) {
          throw Object.assign(new Error("TTS response headers timed out"), { code: "TTS_HEADER_TIMEOUT" });
        }
        throw error;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      }
    },
  });
}

export async function* ttsBodyChunks(response, signal) {
  signal?.throwIfAborted();
  const reader = response.body?.getReader?.();
  if (!reader) { yield new Uint8Array(await response.arrayBuffer()); signal?.throwIfAborted(); return; }
  let completed = false, cancelled = false;
  const cancel = reason => {
    if (cancelled) return;
    cancelled = true;
    try { void reader.cancel(reason).catch(() => {}); } catch {}
  };
  const onAbort = () => cancel(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) onAbort();
    signal?.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) { completed = true; break; }
      yield value;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!completed) cancel();
    reader.releaseLock();
  }
}

export async function readTtsBuffer(response, signal) {
  const chunks = [];
  for await (const chunk of ttsBodyChunks(response, signal)) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function readTtsText(response, signal) {
  if (!response.body?.getReader && typeof response.text === "function") {
    const text = await response.text(); signal?.throwIfAborted(); return text;
  }
  return (await readTtsBuffer(response, signal)).toString("utf8");
}

export async function readTtsJson(response, signal) {
  if (!response.body?.getReader && typeof response.json === "function") {
    const json = await response.json(); signal?.throwIfAborted(); return json;
  }
  return JSON.parse(await readTtsText(response, signal));
}

export async function streamingTtsAudio(response, format, signal, minBytes = 0) {
  if (!response.body?.getReader) return null;
  const reader = response.body.getReader();
  let finished = false, output;
  const prefix = [];
  const finish = (cancel = false, reason) => {
    if (finished) return;
    finished = true;
    signal?.removeEventListener("abort", onAbort);
    if (cancel) { try { void reader.cancel(reason).catch(() => {}); } catch {} }
    reader.releaseLock();
  };
  const onAbort = () => {
    finish(true, signal.reason);
    output?.error(signal.reason);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    signal?.throwIfAborted();
    let bytes = 0;
    while (bytes < minBytes) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) throw new Error("Upstream returned empty audio");
      prefix.push(value);
      bytes += value.byteLength;
    }
  } catch (error) { finish(true, error); throw error; }
  const body = new ReadableStream({
    start(controller) {
      output = controller;
      if (signal?.aborted) onAbort();
    },
    async pull(controller) {
      try {
        if (prefix.length) { controller.enqueue(prefix.shift()); return; }
        const { done, value } = await reader.read();
        if (finished) return;
        signal?.throwIfAborted();
        if (done) { finish(); controller.close(); }
        else controller.enqueue(value);
      } catch (error) {
        if (finished) return;
        finish(true, error);
        controller.error(error);
      }
    },
    cancel(reason) { finish(true, reason); },
  }, { highWaterMark: 0 });
  const headers = { "Content-Type": `audio/${format}`, "Access-Control-Allow-Origin": "*" };
  const length = response.headers.get("content-length");
  if (length && !response.headers.get("content-encoding")) headers["Content-Length"] = length;
  return { success: true, response: new Response(body, { headers }) };
}

export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

// Convert upstream Response (binary audio) to { base64, format }
export async function responseToBase64(res, defaultFormat = "mp3", signal, responseFormat) {
  const ctype = res.headers.get("content-type") || "";
  let format = defaultFormat;
  if (ctype.includes("wav")) format = "wav";
  else if (ctype.includes("mpeg") || ctype.includes("mp3")) format = "mp3";
  else if (ctype.includes("ogg")) format = "ogg";
  if (responseFormat && responseFormat !== "json") {
    const streaming = await streamingTtsAudio(res, format, signal, 100);
    if (streaming) return streaming;
  }
  const buf = await readTtsBuffer(res, signal);
  if (buf.byteLength < 100) throw new Error("Upstream returned empty audio");
  return { base64: Buffer.from(buf).toString("base64"), format };
}

export async function throwUpstreamError(res, signal) {
  const text = await readTtsText(res, signal).catch(() => { signal?.throwIfAborted(); return ""; });
  let msg = `Upstream error (${res.status})`;
  try {
    const parsed = JSON.parse(text);
    msg = parsed?.error?.message || parsed?.message || parsed?.detail?.message || (typeof parsed?.detail === "string" ? parsed.detail : null) || text || msg;
  } catch { msg = text || msg; }
  throw new Error(msg);
}

// Parse `model` string as "modelId/voiceId" — match against known model list (longest prefix wins)
export function parseModelVoice(model, defaultModel = "", defaultVoice = "", knownModels = []) {
  if (!model) return { modelId: defaultModel, voiceId: defaultVoice };
  const known = knownModels.map((m) => m.id || m).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const id of known) {
    if (model === id) return { modelId: id, voiceId: defaultVoice };
    if (model.startsWith(`${id}/`)) return { modelId: id, voiceId: model.slice(id.length + 1) };
  }
  const idx = model.lastIndexOf("/");
  if (idx > 0) return { modelId: model.slice(0, idx), voiceId: model.slice(idx + 1) };
  return { modelId: defaultModel || model, voiceId: defaultVoice || model };
}
