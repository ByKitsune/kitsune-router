import { Buffer } from "node:buffer";
import { OLLAMA_PHONON_MODELS } from "../../config/ttsModels.js";
import { FETCH_CONNECT_TIMEOUT_MS, HTTP_STATUS } from "../../config/runtimeConfig.js";
import { createErrorResult, MAX_UPSTREAM_ERROR_BYTES, parseUpstreamError } from "../../utils/error.js";
import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { isRequestValidationError } from "../../services/accountFallback.js";
import { buildOllamaLocalEndpoint } from "../embeddingProviders/ollamaLocal.js";

const SPEECH_PATH = "/v1/audio/speech";
const DEFAULT_MODEL = "phonon";
const DEFAULT_VOICE = "default";
const MODEL_IDS = OLLAMA_PHONON_MODELS.map(({ id }) => id).sort((a, b) => b.length - a.length);

export const ollamaLocalEndpoint = (credentials) => buildOllamaLocalEndpoint(credentials, SPEECH_PATH);

function modelAndVoice(model, explicitVoice) {
  const modelId = typeof model === "string" && model ? model : DEFAULT_MODEL;
  // A standard body.voice makes the whole model field authoritative, including
  // a namespace which happens to have the same name as a known model.
  if (explicitVoice !== undefined) return { modelId, voice: explicitVoice };
  // Known model/voice routes are supported for the existing dashboard. An
  // unknown name may contain a slash (e.g. an Ollama namespace); never
  // reinterpret it as a voice or silently switch to a different model.
  const known = MODEL_IDS.find((id) => modelId.startsWith(`${id}/`));
  return known
    ? { modelId: known, voice: modelId.slice(known.length + 1) }
    : { modelId, voice: DEFAULT_VOICE };
}

const cancelled = () => createErrorResult(499, "Client closed request");
const localError = (message) => ({ ...createErrorResult(HTTP_STATUS.BAD_REQUEST, message), localFailure: true });

async function readBody(response, signal, maxBytes = Infinity, allowReadFailure = false) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let completed = false;
  let cancelled = false;
  let size = 0;
  const cancel = reason => {
    if (cancelled) return;
    cancelled = true;
    // A source is allowed to leave its cancellation acknowledgment pending.
    // The pending read still closes; never hold the request or reader on it.
    try { void reader.cancel(reason).catch(() => {}); } catch {}
  };
  const onAbort = () => cancel(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) onAbort();
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) { completed = true; break; }
      const remaining = maxBytes - size;
      chunks.push(Buffer.from(value.byteLength > remaining ? value.subarray(0, remaining) : value));
      size += Math.min(value.byteLength, remaining);
      if (size >= maxBytes) break;
    }
  } catch (error) {
    // Match the shared error parser for non-abort read failures: classify the
    // bounded bytes and HTTP headers already received. Audio success bodies
    // must still fail instead of returning incomplete bytes.
    if (!allowReadFailure || signal.aborted) throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (!completed) cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function discardBody(response) {
  try { void response.body?.cancel().catch(() => {}); } catch {}
}

async function readError(response, signal) {
  // Read at most the shared diagnostic limit without awaiting cancellation of
  // a stalled source. Parse a synthetic closed body using the common error
  // classifier so its sanitization, status and retry metadata stay unchanged.
  const body = await readBody(response, signal, MAX_UPSTREAM_ERROR_BYTES, true);
  signal.throwIfAborted();
  const noBodyStatus = [204, 205, 304].includes(response.status);
  const safeResponse = new Response(noBodyStatus ? null : body, {
    status: response.status, statusText: response.statusText, headers: response.headers,
  });
  return parseUpstreamError(safeResponse);
}

export default {
  // Return a full result so ttsCore preserves the upstream status and bytes.
  // The HTTP handler supplies the client signal and standard OpenAI voice.
  async synthesize(text, model, credentials, responseFormat = "wav", options = {}) {
    const clientSignal = options.signal;
    if (clientSignal?.aborted) return cancelled();
    if (typeof text !== "string" || !text.trim()) return localError("Missing required field: input");
    if (!credentials || typeof credentials !== "object") return localError("No active connection configured");
    if (!["wav", "pcm", "json"].includes(responseFormat)) {
      return localError("Unsupported response_format: use wav, pcm or json");
    }
    if (options.voice !== undefined && (typeof options.voice !== "string" || !options.voice.trim())) {
      return localError("voice must be a non-empty string");
    }
    let url;
    try { url = ollamaLocalEndpoint(credentials); } catch (error) { return localError(error.message); }
    const { modelId, voice } = modelAndVoice(model, options.voice);
    if (!voice) return localError("voice must be a non-empty string");
    const format = responseFormat === "json" ? "wav" : responseFormat;
    const body = { model: modelId, input: text, voice, response_format: format };
    // Let the upstream validate these optional OpenAI fields rather than
    // silently discarding an explicit caller request.
    if (options.speed !== undefined) body.speed = options.speed;
    if (options.instructions !== undefined) body.instructions = options.instructions;
    const headers = { "Content-Type": "application/json" };
    if (credentials?.apiKey) headers.Authorization = `Bearer ${credentials.apiKey}`;
    const data = credentials?.providerSpecificData;
    const proxyOptions = {
      connectionProxyEnabled: data?.connectionProxyEnabled === true,
      connectionProxyUrl: data?.connectionProxyUrl || "",
      connectionNoProxy: data?.connectionNoProxy || "",
      vercelRelayUrl: data?.vercelRelayUrl || "",
      strictProxy: data?.strictProxy === true,
    };
    const deadline = AbortSignal.timeout(FETCH_CONNECT_TIMEOUT_MS);
    const signal = clientSignal ? AbortSignal.any([clientSignal, deadline]) : deadline;
    try {
      const res = await proxyAwareFetch(url, {
        method: "POST", headers, body: JSON.stringify(body), signal, redirect: "error",
      }, proxyOptions);
      if (clientSignal?.aborted) {
        discardBody(res);
        return cancelled();
      }
      const contentType = (res.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
      if (!res.ok || contentType === "application/json" || contentType.endsWith("+json") || contentType.startsWith("text/")) {
        const diagnostic = await readError(res, signal);
        if (clientSignal?.aborted) return cancelled();
        let status = res.ok || (res.status >= 300 && res.status < 400) ? HTTP_STATUS.BAD_GATEWAY : diagnostic.statusCode;
        const validation = isRequestValidationError(res.ok ? HTTP_STATUS.BAD_REQUEST : status, diagnostic.message, diagnostic);
        if (res.ok && validation) status = HTTP_STATUS.BAD_REQUEST;
        return {
          ...createErrorResult(status, diagnostic.message, diagnostic.resetsAtMs, diagnostic),
          ...(validation ? { localFailure: true } : {}),
        };
      }
      const acceptedAudioTypes = format === "wav"
        ? ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"]
        : ["audio/pcm", "audio/l16"];
      if (contentType && contentType !== "application/octet-stream" && !acceptedAudioTypes.includes(contentType)) {
        discardBody(res);
        return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Ollama Local returned an unexpected audio format");
      }
      const audio = await readBody(res, signal);
      if (clientSignal?.aborted) return cancelled();
      if (!audio.length) return createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Ollama Local returned empty audio");
      // Raw PCM is arbitrary bytes. In particular, do not sniff it for JSON:
      // valid audio can happen to contain a complete JSON-looking byte sequence.
      if (responseFormat === "json") {
        return { success: true, response: Response.json({ audio: audio.toString("base64"), format }, { headers: { "Access-Control-Allow-Origin": "*" } }) };
      }
      return { success: true, response: new Response(audio, { headers: {
        "Content-Type": `audio/${format}`, "Content-Length": String(audio.length), "Access-Control-Allow-Origin": "*",
      } }) };
    } catch (error) {
      if (clientSignal?.aborted) return cancelled();
      const message = deadline.aborted ? "Ollama Local TTS timed out" : "Ollama Local TTS request failed";
      return createErrorResult(HTTP_STATUS.BAD_GATEWAY, message);
    }
  },
};
