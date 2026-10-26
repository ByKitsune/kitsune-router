import { handleChat } from "@/sse/handlers/chat.js";
import {
  clearAccountError,
  getProviderCredentials,
  isValidApiKey,
  markAccountUnavailable,
} from "@/sse/services/auth.js";
import { getSettings, isApiKeyRequired } from "@/lib/localDb";
import { PROVIDER_MODELS } from "@/shared/constants/models";
import { GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS } from "open-sse/config/runtimeConfig.js";
import { initTranslators } from "open-sse/translator/index.js";
import { publicMessage, sanitizeClientError } from "open-sse/utils/clientErrors.js";
import { API_CORS_HEADERS } from "@/shared/utils/cors.js";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { MAX_UPSTREAM_ERROR_BYTES, parseUpstreamError } from "open-sse/utils/error.js";
import { withInferenceLimit } from "@/lib/rateLimit/inferenceLimit.js";
import { randomUUID } from "node:crypto";
import { enqueueRequestUsage } from "@/lib/usageDb.js";
import { canonicalizeUsage, extractUsage } from "open-sse/utils/usageTracking.js";

let initialized = false;
const GEMINI_NATIVE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
// Gemini model id charset (matches sanitizeGeminiFunctionName); blocks path traversal in upstream URL.
const GEMINI_NATIVE_MODEL_PATTERN = /^[a-zA-Z0-9_.:-]+$/;
const GEMINI_NATIVE_ERROR_STATUSES = new Set([
  "CANCELLED", "UNKNOWN", "INVALID_ARGUMENT", "DEADLINE_EXCEEDED", "NOT_FOUND",
  "ALREADY_EXISTS", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "FAILED_PRECONDITION",
  "ABORTED", "OUT_OF_RANGE", "UNIMPLEMENTED", "INTERNAL", "UNAVAILABLE", "DATA_LOSS", "UNAUTHENTICATED",
]);

/**
 * Initialize translators once
 */
async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": API_CORS_HEADERS["Access-Control-Allow-Headers"]
    }
  });
}

/**
 * POST /v1beta/models/{model}:generateContent        — non-streaming
 * POST /v1beta/models/{model}:streamGenerateContent  — streaming (SSE)
 *
 * Streaming intent is determined by the URL action suffix (canonical Gemini API
 * convention), NOT by a body field. generationConfig.stream is not a real
 * Gemini API field and Gemini CLI never sets it.
 *
 * Preserve the native Gemini wire. The shared pipeline owns request conversion,
 * response framing, tool calls, multimodal parts and reasoning continuity.
 */
export async function POST(request, { params }) {
  await ensureInitialized();

  try {
    const { path } = await params;
    // path = ["provider", "model:action"] or ["model:action"]

    let model;
    let action; // ":generateContent" | ":streamGenerateContent"

    if (path.length >= 2) {
      // Preserve provider-specific model namespaces as well as the action.
      const provider = path[0];
      const modelAction = path.slice(1).join("/");
      action = modelAction.includes(":streamGenerateContent")
        ? ":streamGenerateContent"
        : ":generateContent";
      const modelName = modelAction
        .replace(":streamGenerateContent", "")
        .replace(":generateContent", "");
      model = provider + "/" + modelName;
    } else {
      // Format: /v1beta/models/model:generateContent
      const modelAction = path[0];
      action = modelAction.includes(":streamGenerateContent")
        ? ":streamGenerateContent"
        : ":generateContent";
      model = modelAction
        .replace(":streamGenerateContent", "")
        .replace(":generateContent", "");
    }

    const body = await request.json();

    if (isGeminiNativeTtsRequest(model, body)) {
      return await forwardGeminiNativeRequest(request, body, model, action);
    }

    // Streaming is determined by URL action suffix:
    //   :streamGenerateContent => stream: true  (SSE)
    //   :generateContent       => stream: false (plain JSON)
    const stream = action === ":streamGenerateContent";
    const headers = new Headers(request.headers);
    const clientKey = extractGeminiClientApiKey(request);
    if (clientKey) headers.set("Authorization", `Bearer ${clientKey}`);

    return await handleChat(new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, model, stream }),
      signal: request.signal,
    }));
  } catch (error) {
    if (request.signal?.aborted) {
      return Response.json({ error: { message: "Client closed request" } }, { status: 499 });
    }
    console.log("Error handling Gemini request:", error);
    return Response.json(
      { error: sanitizeClientError({ message: error.message, code: 500 }, { providerIds: ["gemini"] }) },
      { status: 500 }
    );
  }
}

function extractGeminiClientApiKey(request) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

  const googleApiKey = request.headers.get("x-goog-api-key");
  if (googleApiKey) return googleApiKey;

  const url = new URL(request.url);
  return url.searchParams.get("key");
}

function normalizeGeminiNativeModel(model) {
  return String(model || "")
    .replace(/^models\//, "")
    .replace(/^gemini\//, "");
}

function getGeminiTtsModelIds() {
  return new Set([
    ...(PROVIDER_MODELS.gemini || [])
      .filter((model) => (model.kind || model.type) === "tts")
      .map((model) => model.id),
    ...(PROVIDER_MODELS["gemini-tts-models"] || []).map((model) => model.id),
  ]);
}

function hasAudioResponseModality(body) {
  const modalities = body?.generationConfig?.responseModalities;
  return Array.isArray(modalities)
    && modalities.some((modality) => String(modality).toUpperCase() === "AUDIO");
}

function isGeminiNativeTtsRequest(model, body) {
  const rawModel = String(model || "");
  if (rawModel.includes("/") && !rawModel.startsWith("gemini/") && !rawModel.startsWith("models/")) {
    return false;
  }

  const modelId = normalizeGeminiNativeModel(model);
  return hasAudioResponseModality(body) || getGeminiTtsModelIds().has(modelId);
}

function buildGeminiNativeUrl(requestUrl, model, action) {
  const sourceUrl = new URL(requestUrl);
  const upstreamUrl = new URL(`${GEMINI_NATIVE_BASE_URL}/${normalizeGeminiNativeModel(model)}${action}`);

  for (const [key, value] of sourceUrl.searchParams.entries()) {
    if (key === "key") continue;
    upstreamUrl.searchParams.append(key, value);
  }

  return upstreamUrl.toString();
}

async function validateGeminiNativeClientKey(request) {
  const settings = await getSettings();
  if (!isApiKeyRequired(settings)) return null;

  const apiKey = extractGeminiClientApiKey(request);
  if (!apiKey) {
    return Response.json({ error: { message: "Missing API key" } }, { status: 401 });
  }

  const valid = await isValidApiKey(apiKey);
  if (!valid) {
    return Response.json({ error: { message: "Invalid API key" } }, { status: 401 });
  }

  return null;
}

function buildGeminiNativeAuthHeaders(credentials) {
  if (credentials?.apiKey) return { "x-goog-api-key": credentials.apiKey };
  if (credentials?.accessToken) return { Authorization: `Bearer ${credentials.accessToken}` };
  return null;
}

function corsHeadersFrom(response) {
  const headers = new Headers(response.headers);
  // Node fetch may expose a decoded body while preserving upstream compression
  // headers. Forwarding those headers makes clients decompress plain bytes again.
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.set("Access-Control-Allow-Origin", "*");
  return headers;
}

function getSafeGeminiConnectionLabel(credentials) {
  const connectionId = String(credentials?.connectionId || "unknown");
  const shortId = connectionId.slice(0, 8);
  const connectionName = String(credentials?.connectionName || "");
  if (!connectionName || connectionName.includes("@")) return shortId;
  return `${connectionName}:${shortId}`;
}

function getGeminiNativeErrorCode(error) {
  return error?.cause?.code || error?.code || error?.cause?.name || error?.name || "UNKNOWN";
}

function isGeminiNativeTimeoutError(error, timedOut) {
  if (timedOut) return true;
  const code = getGeminiNativeErrorCode(error);
  return code === "UND_ERR_HEADERS_TIMEOUT" || code === "HeadersTimeoutError";
}

function getSafeGeminiNativeErrorText(error) {
  const message = error?.message || String(error);
  const code = getGeminiNativeErrorCode(error);
  return `${message} (${code})`;
}

function exactGeminiNativeUsage(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.estimated === true) return null;
  for (const key of ["promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "totalTokenCount", "cachedContentTokenCount"]) {
    if (raw[key] !== undefined && (!Number.isSafeInteger(raw[key]) || raw[key] < 0)) return null;
  }
  if (raw.promptTokenCount === undefined || (raw.candidatesTokenCount === undefined && raw.totalTokenCount === undefined)) return null;
  const thoughts = raw.thoughtsTokenCount ?? 0;
  const output = raw.candidatesTokenCount ?? raw.totalTokenCount - raw.promptTokenCount - thoughts;
  const total = raw.promptTokenCount + output + thoughts;
  if (output < 0 || !Number.isSafeInteger(total) || total <= 0 ||
      (raw.totalTokenCount !== undefined && raw.totalTokenCount !== total) ||
      (raw.cachedContentTokenCount ?? 0) > raw.promptTokenCount) return null;
  return canonicalizeUsage(extractUsage({ usageMetadata: raw }));
}

function createGeminiNativeUsageRecorder(request, credentials, model) {
  const eventId = randomUUID();
  const timestamp = new Date().toISOString();
  let tokens = null;
  let persisted = null;
  let failed = false;
  return {
    observe(value) {
      if (value?.error) failed = true;
      const usage = exactGeminiNativeUsage(value?.usageMetadata);
      // Gemini stream counters are cumulative, not per-audio-chunk increments.
      if (usage && (!tokens || usage.total_tokens >= tokens.total_tokens)) tokens = usage;
    },
    persist(status = "success") {
      if (!tokens) return Promise.resolve();
      if (!persisted) {
        const entry = {
          eventId, timestamp, provider: "gemini", model, connectionId: credentials.connectionId,
          apiKey: extractGeminiClientApiKey(request), endpoint: new URL(request.url).pathname,
          tokens: structuredClone(tokens), status: status === "success" && failed ? "error" : status,
        };
        persisted = enqueueRequestUsage(entry).catch(() => {
          console.error("[GEMINI_NATIVE] Durable usage acceptance failed");
          throw Object.assign(new Error("Usage accounting could not be accepted"), { code: "usage_acceptance_failed" });
        });
      }
      return persisted;
    },
  };
}

// Select only root usageMetadata, skipping strings/objects such as large base64
// audio without retaining them. The metadata object itself is bounded by the
// shared diagnostic limit. No regex search through model prose or typed media.
function createGeminiNativeJsonObserver(recorder) {
  let depth = 0;
  let rootArray = false;
  let keyDepth = 1;
  let inString = false;
  let escaped = false;
  let readingKey = false;
  let keyText = "";
  let key = null;
  let expectKey = false;
  let expectValue = false;
  let captured = null;
  let capturedDepth = 0;
  let oversized = false;
  return text => {
    for (const char of text) {
      if (captured !== null && !oversized) {
        captured += char;
        if (captured.length > MAX_UPSTREAM_ERROR_BYTES) { captured = ""; oversized = true; }
      }
      if (inString) {
        if (readingKey && keyText.length <= 128) keyText += char;
        if (escaped) { escaped = false; continue; }
        if (char === "\\") { escaped = true; continue; }
        if (char === '"') {
          inString = false;
          if (readingKey) {
            try { key = JSON.parse(keyText); } catch { key = null; }
            readingKey = false;
          }
        }
        continue;
      }
      if (expectValue && depth === keyDepth && !/\s/.test(char)) {
        expectValue = false;
        if (key === "usageMetadata" && char === "{") {
          captured = "{";
          capturedDepth = depth;
          oversized = false;
        }
        if (key === "error" && char !== "n") recorder.observe({ error: true });
      }
      if (char === '"') {
        inString = true;
        readingKey = depth === keyDepth && expectKey;
        if (readingKey) { keyText = '"'; expectKey = false; }
      } else if (char === "{" || char === "[") {
        if (depth === 0 && char === "[") rootArray = true;
        if (char === "{" && (depth === 0 || (rootArray && depth === 1))) {
          keyDepth = depth + 1;
          expectKey = true;
          key = null;
        }
        depth++;
      } else if (char === "}" || char === "]") {
        depth--;
        if (captured !== null && depth === capturedDepth) {
          if (!oversized) {
            try { recorder.observe({ usageMetadata: JSON.parse(captured) }); } catch { /* Invalid counters are not usage. */ }
          }
          captured = null;
        }
        if (!depth) { rootArray = false; expectKey = false; expectValue = false; }
      } else if (depth === keyDepth && char === ":") {
        expectValue = true;
      } else if (depth === keyDepth && char === ",") {
        expectKey = true;
        expectValue = false;
        key = null;
      }
    }
  };
}

function observeGeminiNativeBody(response, recorder, request, attemptController, isSse) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const observeJson = createGeminiNativeJsonObserver(recorder);
  let prefix = "";
  let dataLine = false;
  let ignoredLine = false;
  let finished = false;
  let streamController;
  const cleanup = () => request.signal?.removeEventListener("abort", onAbort);
  const observe = isSse ? (text) => {
    for (const char of text) {
      if (char === "\n") {
        if (dataLine) observeJson("\n");
        prefix = "";
        dataLine = false;
        ignoredLine = false;
      } else if (dataLine) {
        observeJson(char);
      } else if (!ignoredLine) {
        prefix += char;
        if (prefix === "data:") dataLine = true;
        else if (!"data:".startsWith(prefix)) ignoredLine = true;
      }
    }
  } : observeJson;
  const flush = () => observe(decoder.decode());
  let completion;
  const finish = (status, reason, cancelUpstream = false) => {
    if (completion) return completion;
    finished = true;
    cleanup();
    flush();
    if (cancelUpstream) attemptController.abort(reason);
    const release = (async () => {
      try { if (cancelUpstream) await reader.cancel(reason); }
      catch { /* A failed upstream read still needs its reader lock released. */ }
      finally { reader.releaseLock(); }
    })();
    completion = (async () => {
      try { await recorder.persist(status); }
      finally { await release; }
    })();
    release.catch(() => {});
    return completion;
  };
  const onAbort = () => {
    if (finished) return;
    const reason = request.signal.reason || new Error("Client closed request");
    void finish("aborted", reason, true).then(
      () => streamController.error(reason),
      error => streamController.error(error),
    ).catch(() => {});
  };
  return new ReadableStream({
    start(controller) {
      streamController = controller;
      request.signal?.addEventListener("abort", onAbort, { once: true });
      if (request.signal?.aborted) onAbort();
    },
    async pull(controller) {
      let chunk;
      try { chunk = await reader.read(); }
      catch (error) {
        if (finished) return;
        try { await finish(request.signal?.aborted ? "aborted" : "error", error, true); }
        catch (acceptanceError) { controller.error(acceptanceError); return; }
        controller.error(error);
        return;
      }
      if (finished) return;
      if (chunk.done) {
        try { await finish("success"); controller.close(); }
        catch (error) { controller.error(error); }
      } else {
        observe(decoder.decode(chunk.value, { stream: true }));
        controller.enqueue(chunk.value);
      }
    },
    async cancel(reason) {
      await finish("aborted", reason, true);
    },
  });
}

async function forwardGeminiNativeRequest(request, body, model, action) {
  const authError = await validateGeminiNativeClientKey(request);
  if (authError) return authError;

  return withInferenceLimit(request, extractGeminiClientApiKey(request), () =>
    forwardAdmittedGeminiNativeRequest(request, body, model, action));
}

async function forwardAdmittedGeminiNativeRequest(request, body, model, action) {
  const modelId = normalizeGeminiNativeModel(model);
  if (!GEMINI_NATIVE_MODEL_PATTERN.test(modelId)) {
    return Response.json({ error: { message: "Invalid model" } }, { status: 400 });
  }
  const excludeConnectionIds = new Set();
  const bodyText = JSON.stringify(body);
  let lastError = null;
  let lastStatus = null;

  while (true) {
    if (request.signal?.aborted) {
      return Response.json({ error: { message: "Client closed request" } }, { status: 499 });
    }
    const credentials = await getProviderCredentials("gemini", excludeConnectionIds, modelId);
    if (request.signal?.aborted) {
      return Response.json({ error: { message: "Client closed request" } }, { status: 499 });
    }
    if (!credentials || credentials.allRateLimited) {
      // Operator log keeps the full reason; the client only learns that the
      // model is unavailable (never which provider/account is involved).
      console.log(`[GEMINI_NATIVE] exhausted model=${modelId} status=${lastStatus || Number(credentials?.lastErrorCode) || 503} error=${lastError || credentials?.lastError || "no active credentials"}`);
      return Response.json(
        { error: { message: publicMessage("no_credentials") } },
        { status: lastStatus || Number(credentials?.lastErrorCode) || 503 }
      );
    }

    const authHeaders = buildGeminiNativeAuthHeaders(credentials);
    if (!authHeaders) {
      return Response.json(
        { error: { message: "No Gemini API key configured" } },
        { status: 404 }
      );
    }

    const safeConnection = getSafeGeminiConnectionLabel(credentials);
    const startedAt = Date.now();
    const usageRecorder = createGeminiNativeUsageRecorder(request, credentials, modelId);
    const upstreamUrl = buildGeminiNativeUrl(request.url, modelId, action);
    const attemptController = new AbortController();
    // Fetch's signal remains attached to the body after headers. Only the
    // connect deadline is cleared then; caller cancellation still closes the
    // local transport (it is not proof of the provider's billing outcome).
    const signal = request.signal
      ? AbortSignal.any([request.signal, attemptController.signal])
      : attemptController.signal;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      attemptController.abort();
    }, GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS);
    console.log(`[GEMINI_NATIVE] start model=${modelId} action=${action} conn=${safeConnection} body=${Buffer.byteLength(bodyText)}B timeout=${GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS}`);

    let upstreamResponse;
    try {
      upstreamResponse = await proxyAwareFetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": request.headers.get("Content-Type") || "application/json",
          ...authHeaders,
        },
        body: bodyText,
        signal,
      }, {
        connectionProxyEnabled: credentials.providerSpecificData?.connectionProxyEnabled === true,
        connectionProxyUrl: credentials.providerSpecificData?.connectionProxyUrl || "",
        connectionNoProxy: credentials.providerSpecificData?.connectionNoProxy || "",
        vercelRelayUrl: credentials.providerSpecificData?.vercelRelayUrl || "",
        strictProxy: credentials.providerSpecificData?.strictProxy === true,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if (request.signal?.aborted) {
        console.log(`[GEMINI_NATIVE] client aborted model=${modelId} ms=${durationMs} conn=${safeConnection}`);
        return Response.json({ error: { message: "Client closed request" } }, { status: 499 });
      }

      const status = isGeminiNativeTimeoutError(error, timedOut) ? 504 : 502;
      const errorText = getSafeGeminiNativeErrorText(error);
      console.log(`[GEMINI_NATIVE] fetch failed model=${modelId} status=${status} ms=${durationMs} conn=${safeConnection} error=${errorText}`);

      const { shouldFallback } = await markAccountUnavailable(
        credentials.connectionId,
        status,
        errorText,
        "gemini",
        modelId
      );

      if (shouldFallback) {
        excludeConnectionIds.add(credentials.connectionId);
        lastError = errorText;
        lastStatus = status;
        console.log(`[GEMINI_NATIVE] fallback model=${modelId} status=${status} conn=${safeConnection} exclude=${excludeConnectionIds.size}`);
        continue;
      }

      return Response.json({ error: sanitizeClientError({ message: errorText, code: status }, { providerIds: ["gemini"] }) }, { status });
    } finally {
      clearTimeout(timeout);
    }

    if (request.signal?.aborted) {
      void upstreamResponse.body?.cancel().catch(() => {});
      return Response.json({ error: { message: "Client closed request" } }, { status: 499 });
    }

    console.log(`[GEMINI_NATIVE] upstream model=${modelId} status=${upstreamResponse.status} ms=${Date.now() - startedAt} conn=${safeConnection} ct=${upstreamResponse.headers.get("content-type") || "?"} cl=${upstreamResponse.headers.get("content-length") || "?"}`);

    if (upstreamResponse.ok) {
      const isSse = (upstreamResponse.headers.get("content-type") || "").includes("text/event-stream");
      // Forward both native JSON/audio and SSE one chunk per downstream pull.
      // Accounting observes bounded metadata only; it must not retain/reassemble
      // the audio body or delay response headers until upstream EOF.
      const responseBody = upstreamResponse.body
        ? observeGeminiNativeBody(upstreamResponse, usageRecorder, request, attemptController, isSse)
        : null;
      if (request.signal?.aborted) {
        void responseBody?.cancel?.().catch(() => {});
        return Response.json({ error: { message: "Client closed request" } }, { status: 499 });
      }
      await clearAccountError(credentials.connectionId, credentials, modelId);
      return new Response(responseBody, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: corsHeadersFrom(upstreamResponse),
      });
    }

    let nativeErrorStatus;
    const diagnostics = await parseUpstreamError(upstreamResponse, {
      parseError(_response, text) {
        // Reuse the shared bounded/sanitized parser; retain only Google's
        // canonical status enum, never arbitrary upstream details or metadata.
        try {
          const status = JSON.parse(text)?.error?.status;
          if (GEMINI_NATIVE_ERROR_STATUSES.has(status)) nativeErrorStatus = status;
          usageRecorder.observe(JSON.parse(text));
        } catch { /* Non-JSON errors use the shared generic diagnostic. */ }
        // Do not override shared status/reset handling (403/503 can carry quota
        // Retry-After too). This hook only observes the already-bounded body.
        return null;
      },
    });
    try { await usageRecorder.persist("error"); }
    catch {
      return Response.json({ error: { code: "usage_acceptance_failed", message: "Usage accounting could not be accepted" } }, { status: 503, headers: { "Access-Control-Allow-Origin": "*" } });
    }
    if (request.signal?.aborted) {
      return Response.json({ error: { message: "Client closed request" } }, { status: 499 });
    }
    const errorText = diagnostics.message;
    const { shouldFallback } = await markAccountUnavailable(
      credentials.connectionId,
      upstreamResponse.status,
      errorText,
      "gemini",
      modelId,
      diagnostics.resetsAtMs,
    );

    if (shouldFallback) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = errorText;
      lastStatus = upstreamResponse.status;
      continue;
    }

    const headers = corsHeadersFrom(upstreamResponse);
    headers.set("Content-Type", "application/json");
    const error = {
      ...sanitizeClientError({ message: errorText, code: diagnostics.code ?? upstreamResponse.status,
        ...(diagnostics.param ? { param: diagnostics.param } : {}),
      }, { providerIds: ["gemini"], status: upstreamResponse.status }),
      ...(nativeErrorStatus ? { status: nativeErrorStatus } : {}),
    };
    headers.set("x-request-id", error.request_id);
    return Response.json({ error }, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  }
}
