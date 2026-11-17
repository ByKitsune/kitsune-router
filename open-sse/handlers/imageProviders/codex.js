// Native Codex Images requests. Legacy Responses SSE decoding remains accepted.
import { randomUUID } from "node:crypto";
import { nowSec, reportedImageUsage } from "./_base.js";
import { CODEX_USER_AGENT, CODEX_CLI_VERSION } from "../../config/clientVersions.js";
import { buildCodexImageBody, codexImagesUrl, parseNativeCodexImage } from "./codexNative.js";
import { createSSEParser, parseSSEEvent, SSE_LIMITS } from "../../utils/sse.js";
import { parseUpstreamErrorBody } from "../../utils/error.js";

const CODEX_VERSION = CODEX_CLI_VERSION;
const CODEX_ORIGINATOR = "codex_cli_rs";

function decodeAccountId(idToken) {
  try {
    const parts = String(idToken || "").split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    const payload = JSON.parse(Buffer.from(b64 + "=".repeat(pad), "base64").toString("utf8"));
    return payload?.["https://api.openai.com/auth"]?.chatgpt_account_id || null;
  } catch {
    return null;
  }
}


function normalizeResponsesUsage(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.estimated === true) return null;
  const input = raw.input_tokens ?? raw.prompt_tokens;
  const output = raw.output_tokens ?? raw.completion_tokens;
  if (!Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0 ||
      !Number.isSafeInteger(input + output) || input + output <= 0 ||
      (raw.total_tokens !== undefined && raw.total_tokens !== input + output)) return null;
  const usage = { prompt_tokens: input, completion_tokens: output, total_tokens: input + output };
  const cached = raw.input_tokens_details?.cached_tokens ?? raw.prompt_tokens_details?.cached_tokens;
  const reasoning = raw.output_tokens_details?.reasoning_tokens ?? raw.completion_tokens_details?.reasoning_tokens;
  if (cached !== undefined && (!Number.isSafeInteger(cached) || cached < 0 || cached > input)) return null;
  if (reasoning !== undefined && (!Number.isSafeInteger(reasoning) || reasoning < 0 || reasoning > output)) return null;
  if (cached !== undefined) usage.cached_tokens = cached;
  if (reasoning !== undefined) usage.reasoning_tokens = reasoning;
  const canonical = reportedImageUsage({ usage: raw });
  if (!canonical) return null;
  for (const key of ["cache_write_tokens", "cache_write_30m_tokens", "cache_write_12h_tokens", "actualServiceTier", "service_tier"]) {
    if (canonical[key] !== undefined) usage[key] = structuredClone(canonical[key]);
  }
  return usage;
}

function imageStreamError(response, error) {
  if (error instanceof SyntaxError) return new Error("Codex image stream contains invalid event data.");
  const diagnostic = parseUpstreamErrorBody(response, JSON.stringify({ error: {
    message: error?.message || "Stream failed", code: error?.code, type: error?.type,
  } }));
  const message = diagnostic.message || "Codex image stream failed.";
  return Object.assign(new Error(message), { ...diagnostic, message });
}

function createImageReader(response, { log, clientSignal, onUsage }) {
  if (!response.body) throw new Error("Codex did not return a completed image.");
  const reader = response.body.getReader();
  const parser = createSSEParser();
  let pending = null;
  let eof = false;
  let terminal = false;
  let imageB64 = null;
  let usage = null;
  let failed = false;
  let failure = null;
  let completion;
  let closed = false;
  let abortReason;
  let lastEvent;
  let lastProgress = 0;
  let bytesReceived = 0;
  let eventCount = 0;
  const processEvent = event => {
    if (terminal) return [];
    if (++eventCount > SSE_LIMITS.outputItems) throw new RangeError("Upstream image event count exceeds limit");
    const data = parseSSEEvent(event);
    if (data.done) { terminal = true; return []; }
    const eventName = event.event || data.type;
    const next = normalizeResponsesUsage(data?.response?.usage ?? data?.usage);
    const tier = data?.response?.service_tier ?? data?.service_tier;
    if (next && typeof tier === "string" && tier) next.actualServiceTier = tier;
    if (next && (!usage || next.total_tokens >= usage.total_tokens)) usage = next;
    const responseState = data?.response?.status;
    if (["response.failed", "response.incomplete", "error"].includes(eventName) ||
        ["response.failed", "response.incomplete", "error"].includes(data.type) ||
        ["failed", "incomplete", "cancelled"].includes(responseState) || data.error || data?.response?.error) {
      failed = true;
      const raw = data?.response?.error || data.error || data?.response?.incomplete_details || data;
      const diagnostic = parseUpstreamErrorBody(response, JSON.stringify({ error: raw }));
      const message = `Codex did not return a completed image.${diagnostic.message ? ` ${diagnostic.message}` : ""}`;
      failure ||= Object.assign(new Error(message), { ...diagnostic, message });
      terminal = true;
    }
    const acceptImage = item => {
      if (item?.type === "image_generation_call" && typeof item.result === "string" && item.result) imageB64 = item.result;
    };
    if (eventName === "response.output_item.done") acceptImage(data.item);
    if (["response.completed", "response.done"].includes(eventName) || ["response.completed", "response.done"].includes(data.type)) {
      for (const item of data?.response?.output || data?.output || []) acceptImage(item);
      terminal = true;
    }
    // Stage labels are protocol names, never arbitrary upstream strings.
    let stage = "response.in_progress";
    switch (eventName) {
      case "response.created": case "response.in_progress": case "response.output_item.done":
      case "response.image_generation_call.partial_image": case "response.completed": case "response.done":
      case "response.failed": case "response.incomplete": case "error": stage = eventName;
    }
    if (stage !== lastEvent) { log?.info?.("IMAGE", `codex progress: ${stage}`); lastEvent = stage; }
    const frames = [];
    if (Date.now() - lastProgress > 200) {
      lastProgress = Date.now();
      frames.push(["progress", { stage, bytesReceived }]);
    }
    if (eventName === "response.image_generation_call.partial_image" && typeof data.partial_image_b64 === "string" && data.partial_image_b64) {
      frames.push(["partial_image", { b64_json: data.partial_image_b64, index: data.partial_image_index }]);
    }
    return frames;
  };
  const finish = (status, reason, cancel = false) => {
    if (completion) return completion;
    let resolveCompletion, rejectCompletion;
    completion = new Promise((resolve, reject) => { resolveCompletion = resolve; rejectCompletion = reject; });
    completion.catch(() => {});
    closed = true;
    clientSignal?.removeEventListener("abort", onAbort);
    // Cancellation keeps measured usage already delivered in this network
    // chunk, but never initiates another upstream read or consumes a later turn.
    try {
      while (pending && !terminal) {
        const event = pending.next();
        if (event.done) { pending = null; break; }
        processEvent(event.value);
      }
      if (!terminal) for (const event of parser.end()) { processEvent(event); if (terminal) break; }
    } catch (error) { failed = true; failure ||= imageStreamError(response, error); }
    pending?.return?.();
    pending = null;
    parser.reset();
    if (cancel) {
      try { void Promise.resolve(reader.cancel(reason)).catch(() => {}); } catch { /* Already closed. */ }
    }
    try { reader.releaseLock(); } catch { /* Reader cleanup cannot hide accounting failure. */ }
    // Keep the durable accounting acknowledgment, without coupling it to a
    // potentially unbounded source-cancellation acknowledgment.
    void Promise.resolve().then(async () => {
      if (usage && onUsage) {
        const finalStatus = clientSignal?.aborted || status === "aborted" ? "aborted"
          : failed || !imageB64 ? "error" : status;
        if (finalStatus === "success") await onUsage(structuredClone(usage));
        else await onUsage(structuredClone(usage), { status: finalStatus });
      }
    }).then(resolveCompletion, rejectCompletion);
    return completion;
  };
  const onAbort = () => {
    abortReason = clientSignal.reason || new Error("Client closed request");
    void finish("aborted", abortReason, true);
  };
  const done = async () => {
    await completion;
    if (abortReason) throw abortReason;
    clientSignal?.throwIfAborted();
    return { done: true, imageB64, failed, error: failure };
  };
  clientSignal?.addEventListener("abort", onAbort, { once: true });
  if (clientSignal?.aborted) onAbort();
  return {
    async next() {
      if (closed) return done();
      try {
        while (true) {
          if (terminal || (eof && !pending)) {
            await finish(imageB64 && !failed ? "success" : "error", undefined, !eof);
            return done();
          }
          if (pending) {
            const event = pending.next();
            if (event.done) { pending = null; continue; }
            const frames = processEvent(event.value);
            if (frames.length) return { frames };
            continue;
          }
          const chunk = await reader.read();
          if (closed) return done();
          if (chunk.done) { eof = true; pending = parser.end(); }
          else { bytesReceived += chunk.value.byteLength; pending = parser.feed(chunk.value); }
        }
      } catch (error) {
        await finish(clientSignal?.aborted ? "aborted" : "error", error, true);
        if (clientSignal?.aborted) clientSignal.throwIfAborted();
        throw imageStreamError(response, error);
      }
    },
    cancel: reason => finish("aborted", reason, true),
  };
}

function buildSseResponse(providerResponse, options) {
  const session = createImageReader(providerResponse, options);
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const chunk = await session.next();
        if (cancelled) return;
        if (!chunk.done) {
          for (const [event, data] of chunk.frames) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          return;
        }
        if (chunk.imageB64 && !chunk.failed) {
          if (options.onRequestSuccess) await options.onRequestSuccess();
          options.clientSignal?.throwIfAborted();
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ created: nowSec(), data: [{ b64_json: chunk.imageB64 }] })}\n\n`));
        } else {
          const error = chunk.error || new Error("Codex did not return a completed image.");
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: error.message, ...(error.code ? { code: error.code } : {}) })}\n\n`));
        }
        controller.close();
      } catch (error) {
        if (cancelled) return;
        if (options.clientSignal?.aborted) controller.error(error);
        else {
          const diagnostic = imageStreamError(providerResponse, error);
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: diagnostic.message, ...(diagnostic.code ? { code: diagnostic.code } : {}) })}\n\n`));
          controller.close();
        }
      }
    },
    async cancel(reason) { cancelled = true; await session.cancel(reason); },
  }, { highWaterMark: 0 });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive",
    "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*",
  } });
}

export default {
  stream: true,
  buildUrl: (_model, _credentials, body) => codexImagesUrl(body),
  buildHeaders: (creds) => {
    const accountId = creds?.providerSpecificData?.workspaceId || creds?.providerSpecificData?.chatgptAccountId || creds?.providerSpecificData?.accountId || decodeAccountId(creds?.idToken);
    return {
      "accept": "application/json",
      "authorization": `Bearer ${creds?.accessToken || ""}`,
      "chatgpt-account-id": accountId || "",
      "content-type": "application/json",
      "originator": CODEX_ORIGINATOR,
      "session_id": randomUUID(),
      "user-agent": CODEX_USER_AGENT,
      "version": CODEX_VERSION,
      "x-client-request-id": randomUUID(),
      "x-codex-image-turn-id": randomUUID(),
    };
  },
  buildBody: buildCodexImageBody,
  async parseResponse(response, options = {}) {
    if (!response.headers.get("content-type")?.includes("text/event-stream")) return parseNativeCodexImage(response, options);
    if (options.streamToClient) return { sseResponse: buildSseResponse(response, options) };
    const session = createImageReader(response, options);
    while (true) {
      const result = await session.next();
      if (!result.done) continue;
      if (!result.imageB64 || result.failed) throw result.error || new Error("Codex did not return a completed image.");
      return { created: nowSec(), data: [{ b64_json: result.imageB64 }] };
    }
  },
  normalize: (responseBody) => responseBody,
};
