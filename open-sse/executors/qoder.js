/**
 * QoderExecutor — sends OpenAI-format chat requests to Qoder's COSY-signed
 * inference endpoint at api3.qoder.sh, then unwraps Qoder's `{statusCodeValue,
 * body}` SSE envelope back into plain OpenAI SSE for the rest of the pipeline.
 *
 * Differences vs the previous placeholder:
 *   - URL is api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation
 *     with `&Encode=1` so we can ship the body through the WAF-bypass
 *     encoder.
 *   - Authentication is COSY (RSA + AES + MD5 + ~17 Cosy-* headers), not
 *     a static HMAC.
 *   - The request shape Qoder expects is non-trivial (chat_context with
 *     mirrored modelConfig, business block with stable IDs, system text
 *     hoisted out of the messages array). All ported from the reference.
 *   - Model identifier is one of the canonical Qoder keys (auto / ultimate /
 *     performance / efficient / lite + frontier "*model" ids); the
 *     translator layer feeds us "qoder/<key>" so we strip the prefix.
 *   - Per-model `model_config` is fetched live from /algo/api/v2/model/list
 *     and cached. Sending the wrong block silently downgrades to a
 *     different model upstream, so a missing entry is a hard error.
 */

import { qoderEncodeBody } from "../shared/qoder/encoding.js";
import { buildCosyHeaders } from "../shared/qoder/cosy.js";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { SSE_DONE } from "../utils/sseConstants.js";
import { FETCH_CONNECT_TIMEOUT_MS, HTTP_STATUS, QODER_SSE_PEEK_TIMEOUT_MS, QODER_SSE_PEEK_MAX_BYTES } from "../config/runtimeConfig.js";
import {
  QODER_CHAT_URL_ENCODED,
  QODER_CHAT_BASE_ALT,
  QODER_CHAT_SIG_PATH,
} from "../shared/qoder/constants.js";
import { getQoderModelConfig, resolveQoderModels, isQoderPat, resolveQoderCredentials } from "../services/qoderModels.js";
import { OPENAI_BLOCK, CLAUDE_BLOCK } from "../translator/schema/blocks.js";
import { encodeDataUri } from "../translator/concerns/image.js";

/**
 * Hoist role:"system" messages out of the messages array (Qoder rejects
 * system in messages) and flatten multipart content arrays — EXCEPT image
 * blocks, which are preserved (see normalizeContent).
 */
function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: [], systemText: "" };
  }
  const systemParts = [];
  const out = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    if (msg.role === "system") {
      const text = extractText(msg.content);
      if (text) systemParts.push(text);
      continue;
    }
    const cloned = { ...msg };
    cloned.content = normalizeContent(msg.content);
    out.push(cloned);
  }
  return { messages: out, systemText: systemParts.join("\n\n") };
}

/**
 * Normalize one message's content for Qoder.
 */
function normalizeContent(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (!Array.isArray(content)) return String(content);

  const blocks = [];
  const textParts = [];
  let hasImage = false;
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    if (item.type === OPENAI_BLOCK.IMAGE_URL && typeof item.image_url?.url === "string" && item.image_url.url) {
      blocks.push({ type: OPENAI_BLOCK.IMAGE_URL, image_url: { url: item.image_url.url } });
      hasImage = true;
    } else if (item.type === CLAUDE_BLOCK.IMAGE && item.source) {
      const src = item.source;
      const url = src.type === "base64" && src.data
        ? encodeDataUri(src.media_type || "image/png", src.data)
        : typeof src.url === "string" && src.url ? src.url : null;
      if (url) {
        blocks.push({ type: OPENAI_BLOCK.IMAGE_URL, image_url: { url } });
        hasImage = true;
      }
    } else if (typeof item.text === "string" && item.text) {
      if (hasImage || blocks.length) {
        blocks.push({ type: OPENAI_BLOCK.TEXT, text: item.text });
      } else {
        textParts.push(item.text);
      }
    }
  }

  if (!hasImage) return textParts.join("\n");
  if (textParts.length) blocks.unshift({ type: OPENAI_BLOCK.TEXT, text: textParts.join("\n") });
  return blocks;
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (item && typeof item === "object") {
        if (item.type === "text" && typeof item.text === "string") {
          parts.push(item.text);
        } else if (typeof item.text === "string") {
          parts.push(item.text);
        }
      }
    }
    return parts.join("\n");
  }
  return String(content);
}

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string") {
      return m.content;
    }
  }
  return "";
}

function stableHash(prefix, ...parts) {
  const h = createHash("sha256");
  h.update(prefix);
  for (const p of parts) {
    h.update("\0");
    h.update(String(p ?? ""));
  }
  return h.digest("hex").slice(0, 16);
}

function stableChatRecordId(model, messages, tools, maxTokens) {
  const h = createHash("sha256");
  h.update("qoder-record\0");
  h.update(String(model));
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    if (m.role) { h.update("\0"); h.update(m.role); }
    if (typeof m.content === "string" && m.content) {
      h.update("\0"); h.update(m.content);
    } else if (Array.isArray(m.content)) {
      h.update("\0");
      try { h.update(JSON.stringify(m.content)); } catch {}
    }
  }
  if (tools) {
    h.update("\0");
    try { h.update(JSON.stringify(tools)); } catch {}
  }
  h.update(`\0mt=${maxTokens}`);
  return h.digest("hex").slice(0, 16);
}

function truncate(s, n) {
  return s && s.length > n ? `${s.slice(0, n)}...` : s || "";
}

/**
 * Map the OpenAI-style request body into the exact shape Qoder expects.
 */
async function buildQoderRequestBody({ model, body, credentials, log, proxyOptions, signal }) {
  const qoderKey = String(model || "").replace(/^qoder\//, "");
  
  // Fetch model config from dynamic API instead of relying on static QODER_MODEL_MAP.
  // This allows support for new Qoder models (e.g., qmodel_latest) without code changes.
  let modelConfig = await getQoderModelConfig(credentials, qoderKey, { log, proxyOptions, signal });
  if (!modelConfig) {
    // Try a forced refresh once before giving up — the cache may simply
    // not be populated yet on first ever call for this credential.
    const refreshed = await resolveQoderModels(credentials, { forceRefresh: true, log, proxyOptions, signal });
    const retried = refreshed?.rawConfigs.get(qoderKey);
    if (!retried) {
      throw new Error(
        `qoder: model_config for "${qoderKey}" not yet known (run a model list fetch or check upstream connectivity)`,
      );
    }
    modelConfig = { ...retried, key: qoderKey };
  }

  const { messages, systemText } = normalizeMessages(body.messages || []);
  const tools = body.tools;
  const isReasoning = !!modelConfig.is_reasoning;
  const maxOutputTokens = Number(modelConfig.max_output_tokens) || 0;

  let maxTokens = 32_768;
  if (maxOutputTokens > 0) maxTokens = maxOutputTokens;
  if (typeof body.max_tokens === "number" && body.max_tokens > 0 && body.max_tokens < maxTokens) {
    maxTokens = body.max_tokens;
  }
  if (typeof body.max_completion_tokens === "number" && body.max_completion_tokens > 0 && body.max_completion_tokens < maxTokens) {
    maxTokens = body.max_completion_tokens;
  }

  const lastUser = lastUserText(messages);
  const psd = credentials.providerSpecificData || {};
  const sessionId = stableHash("qoder-session", psd.userId, qoderKey);
  const recordId = stableChatRecordId(qoderKey, messages, tools, maxTokens);

  return {
    qoderKey,
    payload: {
      request_id: uuidv4(),
      request_set_id: recordId,
      chat_record_id: recordId,
      session_id: sessionId,
      stream: true,
      chat_task: "FREE_INPUT",
      is_reply: true,
      is_retry: false,
      source: 1,
      version: "3",
      session_type: "qodercli",
      agent_id: "agent_common",
      task_id: "common",
      code_language: "",
      chat_prompt: "",
      image_urls: null,
      aliyun_user_type: "",
      system: systemText,
      messages,
      tools: Array.isArray(tools) ? tools : [],
      parameters: { max_tokens: maxTokens },
      chat_context: {
        chatPrompt: "",
        imageUrls: null,
        extra: {
          context: [],
          modelConfig: { key: qoderKey, is_reasoning: isReasoning },
          originalContent: lastUser,
        },
        features: [],
        text: lastUser,
      },
      model_config: modelConfig,
      business: {
        product: "cli",
        version: "1.0.0",
        type: "agent",
        stage: "start",
        id: uuidv4(),
        name: truncate(lastUser, 30),
        begin_at: Date.now(),
      },
    },
    modelConfig,
  };
}

/** Parse complete SSE events, including CRLF and multiline data fields. */
function createQoderEventParser(onData) {
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines = [];
  const line = (value) => {
    if (value === "") {
      if (dataLines.length) {
        const data = dataLines.join("\n");
        dataLines = [];
        return onData(data);
      }
      return false;
    }
    if (value === "data" || value.startsWith("data:")) {
      let data = value === "data" ? "" : value.slice(5);
      if (data.startsWith(" ")) data = data.slice(1);
      dataLines.push(data);
    }
    return false;
  };
  return (bytes, eof = false) => {
    buffer += bytes ? decoder.decode(bytes, { stream: true }) : decoder.decode();
    let offset = 0;
    const endings = /\r\n|\r|\n/g;
    let match;
    while ((match = endings.exec(buffer))) {
      if (!eof && match[0] === "\r" && match.index === buffer.length - 1) break;
      const value = buffer.slice(offset, match.index);
      offset = match.index + match[0].length;
      if (line(value)) {
        buffer = buffer.slice(offset);
        return true;
      }
    }
    buffer = buffer.slice(offset);
    if (eof) {
      if (buffer) line(buffer);
      buffer = "";
      return line("");
    }
    return false;
  };
}

function parseQoderBody(body) {
  if (typeof body !== "string") return body;
  try { return JSON.parse(body); } catch { return body; }
}

/** Queue saturation is retryable, whereas quota/payment blocks keep the 403 policy. */
function classifyQoderError(envelope) {
  if (!envelope || typeof envelope !== "object") return null;
  const body = Object.hasOwn(envelope, "body") ? parseQoderBody(envelope.body) : envelope;
  const detail = body?.error && typeof body.error === "object" ? body.error : body;
  const code = detail?.code;
  const queue = String(code) === "10605";
  const billing = String(code) === "110" || String(code) === "112" || !!detail?.pricingUrl;
  const status = Number(envelope.statusCodeValue);
  if (!queue && !billing && !(status >= 400 && status <= 599) && !body?.error) return null;
  const error = detail && typeof detail === "object" ? { ...detail } : {};
  error.message = typeof error.message === "string" ? error.message
    : typeof body === "string" && body ? body : `qoder upstream error (${status || 502})`;
  if (error.code == null && Number.isFinite(status)) error.code = status;
  const retryAfterSeconds = Number(error.retryAfterSeconds ?? envelope.retryAfterSeconds);
  return {
    status: queue ? HTTP_STATUS.RATE_LIMITED : billing ? HTTP_STATUS.FORBIDDEN
      : status >= 400 && status <= 599 ? status : HTTP_STATUS.BAD_GATEWAY,
    error,
    retryAfterSeconds: queue && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : null,
  };
}

function qoderErrorResponse(failure) {
  const headers = { "Content-Type": "application/json" };
  if (failure.retryAfterSeconds != null) headers["Retry-After"] = String(failure.retryAfterSeconds);
  return new Response(JSON.stringify({ error: failure.error }), { status: failure.status, headers });
}

/** Inspect a bounded byte prefix and retain the pending read for lossless handoff. */
async function peekFirstQoderFrame(reader, signal) {
  const chunks = [];
  let bytes = 0;
  let failure = null;
  let pendingRead = null;
  let timer;
  let onAbort;
  const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(null), QODER_SSE_PEEK_TIMEOUT_MS); });
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  const parse = createQoderEventParser((data) => {
    if (data === "[DONE]") return true;
    let envelope;
    try { envelope = JSON.parse(data); } catch { return true; }
    failure = classifyQoderError(envelope);
    if (failure) return true;
    const inner = Object.hasOwn(envelope || {}, "body") ? envelope.body : envelope;
    return !!inner && (typeof inner === "string" || !!inner.choices);
  });
  try {
    signal?.throwIfAborted();
    while (bytes < QODER_SSE_PEEK_MAX_BYTES) {
      pendingRead = reader.read();
      const result = await Promise.race([pendingRead, deadline, aborted]);
      if (result === null) return { chunks, pendingRead };
      pendingRead = null;
      if (result.done) {
        parse(null, true);
        return { chunks, failure, upstreamDone: true };
      }
      chunks.push(result.value);
      const remaining = QODER_SSE_PEEK_MAX_BYTES - bytes;
      bytes += result.value.byteLength;
      if (parse(result.value.byteLength > remaining ? result.value.subarray(0, remaining) : result.value)) break;
    }
    return { chunks, failure };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Unwrap Qoder events; errors never become assistant text or reissue the request. */
async function wrapQoderSSE(response, _model, signal) {
  if (!response.ok || !response.body) return response;
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.toLowerCase().includes("text/event-stream")) return response;
  const reader = response.body.getReader();
  let cancellation;
  const cancelReader = () => {
    if (!cancellation) cancellation = reader.cancel().catch(() => {});
    return cancellation;
  };
  let peek;
  try {
    peek = await peekFirstQoderFrame(reader, signal);
  } catch (error) {
    await cancelReader();
    reader.releaseLock();
    throw error;
  }
  if (peek.failure) {
    await cancelReader();
    reader.releaseLock();
    return qoderErrorResponse(peek.failure);
  }

  const encoder = new TextEncoder();
  let terminal = false;
  let closed = false;
  let onAbort;
  const stream = new ReadableStream({
    start(controller) {
      const emit = (data) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      const parse = createQoderEventParser((data) => {
        if (closed || terminal) return true;
        if (data === "[DONE]") {
          terminal = true;
          emit("[DONE]");
          return true;
        }
        let envelope;
        try { envelope = JSON.parse(data); } catch { return false; }
        const failure = classifyQoderError(envelope);
        if (failure) {
          emit(JSON.stringify({ error: failure.error }));
          emit("[DONE]");
          terminal = true;
          return true;
        }
        const inner = Object.hasOwn(envelope || {}, "body") ? envelope.body : envelope;
        if (!inner) return false;
        if (inner === "[DONE]") {
          emit("[DONE]");
          terminal = true;
          return true;
        }
        // Re-encode parsed JSON rather than stripping newlines from the message.
        const parsed = parseQoderBody(inner);
        if (parsed && typeof parsed === "object") emit(JSON.stringify(parsed));
        return false;
      });
      onAbort = () => {
        if (closed) return;
        closed = true;
        controller.error(signal.reason);
        void cancelReader();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      void (async () => {
        try {
          signal?.throwIfAborted();
          for (const bytes of peek.chunks) {
            if (parse(bytes)) break;
          }
          if (!terminal && peek.upstreamDone) parse(null, true);
          let pendingRead = peek.pendingRead;
          while (!terminal && !closed && !peek.upstreamDone) {
            const { done, value } = await (pendingRead || reader.read());
            pendingRead = null;
            if (closed) break;
            if (done) {
              parse(null, true);
              break;
            }
            parse(value);
          }
          if (!closed) {
            if (!terminal) controller.enqueue(encoder.encode(SSE_DONE));
            closed = true;
            controller.close();
          }
        } catch (error) {
          if (!closed) {
            closed = true;
            controller.error(error);
          }
        } finally {
          signal?.removeEventListener("abort", onAbort);
          await cancelReader();
          reader.releaseLock();
        }
      })();
    },
    cancel() {
      closed = true;
      signal?.removeEventListener("abort", onAbort);
      return cancelReader();
    },
  });
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

export class QoderExecutor extends BaseExecutor {
  constructor() {
    super("qoder", PROVIDERS.qoder);
  }

  buildUrl(credentials) {
    // Job-token (jt-...) traffic must hit api2.qoder.sh — api3 rejects jt-
    // with "Login expired" (403). Device tokens (dt-...) stay on api3.
    const raw = credentials?.apiKey || credentials?.accessToken;
    if (typeof raw === "string" && !raw.startsWith("pt-") && (raw.startsWith("jt-") || (credentials?.accessToken || "").startsWith("jt-"))) {
      return `${QODER_CHAT_BASE_ALT}/algo${QODER_CHAT_SIG_PATH}?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1`;
    }
    return QODER_CHAT_URL_ENCODED;
  }

  // Override execute entirely — Qoder needs:
  //   - body built from translated chat completion payload
  //   - body encoded with QoderEncodeBody before signing
  //   - COSY headers built from the *encoded* body bytes
  //   - response stream re-wrapped from {statusCodeValue, body} to OpenAI SSE
  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    // PAT (pt-...) → exchange for short-lived job token + resolve userId so
    // downstream COSY signing + catalog fetch work. Device tokens (dt-...) and
    // job tokens (jt-...) skip this and are used directly.
    const rawToken = credentials?.apiKey || credentials?.accessToken;
    if (isQoderPat(rawToken)) {
      try {
        credentials = await resolveQoderCredentials(credentials, proxyOptions, signal);
      } catch (err) {
        log?.error?.("QODER", `PAT exchange failed: ${err.message}`);
        const fakeResp = new Response(
          JSON.stringify({ error: { message: `qoder PAT exchange failed: ${err.message}` } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
        return { response: fakeResp, url: this.buildUrl(credentials), headers: {}, transformedBody: body };
      }
    }

    const url = this.buildUrl(credentials);
    const psd = credentials?.providerSpecificData || {};
    if (!psd.userId) {
      // No user id → no way to sign. Surface a 401 so the dashboard nudges
      // the user back to OAuth.
      const fakeResp = new Response(
        JSON.stringify({ error: { message: "qoder credential is missing userId; reconnect the account" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }
    if (!credentials?.accessToken) {
      // Same shape as the userId guard — clean 401 so chatCore reports
      // "reconnect" rather than bubbling cosy.js's synchronous throw as 500.
      const fakeResp = new Response(
        JSON.stringify({ error: { message: "qoder credential is missing accessToken; reconnect the account" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }

    let qoderKey;
    let payload;
    try {
      ({ qoderKey, payload } = await buildQoderRequestBody({ model, body, credentials, log, proxyOptions, signal }));
    } catch (err) {
      const fakeResp = new Response(
        JSON.stringify({ error: { message: err.message } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }

    const plainBody = Buffer.from(JSON.stringify(payload), "utf8");
    const encodedBodyStr = qoderEncodeBody(plainBody);
    const encodedBodyBuf = Buffer.from(encodedBodyStr, "latin1");

    let cosyHeaders;
    try {
      cosyHeaders = buildCosyHeaders(
        encodedBodyBuf,
        url,
        {
          userId: psd.userId,
          authToken: credentials.accessToken,
          name: credentials.displayName || "",
          email: credentials.email || "",
          machineId: psd.machineId || "",
        },
      );
    } catch (err) {
      // cosy.js throws synchronously on missing userId/authToken — surface
      // as 401 so chatCore prompts re-auth instead of returning a 500.
      const fakeResp = new Response(
        JSON.stringify({ error: { message: `qoder cosy signing failed: ${err.message}` } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }

    const modelSource = (payload.model_config && payload.model_config.source) || "system";
    const headers = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Model-Key": qoderKey,
      "X-Model-Source": modelSource,
      // gzip triggers signature validation on Qoder's CDN; force identity.
      "Accept-Encoding": "identity",
      ...cosyHeaders,
    };

    // Abort if upstream doesn't return response headers within connect timeout.
    const timeoutMs = this.config?.timeoutMs || FETCH_CONNECT_TIMEOUT_MS;
    const connectCtrl = new AbortController();
    const connectTimer = setTimeout(() => connectCtrl.abort(new Error("fetch connect timeout")), timeoutMs);
    const mergedSignal = signal ? AbortSignal.any([signal, connectCtrl.signal]) : connectCtrl.signal;

    let response;
    try {
      response = await proxyAwareFetch(
        url,
        { method: "POST", headers, body: encodedBodyBuf, signal: mergedSignal },
        proxyOptions,
      );
    } finally {
      clearTimeout(connectTimer);
    }

    if (!response.ok) {
      // Pass error response through unchanged so chatCore can capture it.
      return { response, url, headers, transformedBody: payload };
    }

    const wrapped = await wrapQoderSSE(response, `qoder/${qoderKey}`, mergedSignal);
    return { response: wrapped, url, headers, transformedBody: payload };
  }

  parseError(response, bodyText, generic) {
    const parsed = super.parseError(response, bodyText, generic);
    if (response.status !== HTTP_STATUS.RATE_LIMITED) return parsed;
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) return parsed;
    return { ...parsed, resetsAtMs: Date.now() + retryAfterSeconds * 1000 };
  }

  // Qoder device tokens don't refresh through OAuth — the upstream returns
  // 403 for our flow. Surfacing failure via 401-on-chat is enough; the
  // dashboard tells users to re-login when their token expires (~30 days).
  async refreshCredentials() {
    return null;
  }

  needsRefresh() {
    return false;
  }
}

export default QoderExecutor;

// Internals exposed for unit tests. Not part of the public API — callers
// should import QoderExecutor and use its public methods.
export const __test__ = {
  normalizeMessages,
  wrapQoderSSE,
  buildQoderRequestBody,
};
