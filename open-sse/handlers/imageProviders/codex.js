// Codex (ChatGPT Plus/Pro) image generation via Responses API + SSE
import { randomUUID } from "node:crypto";
import { nowSec, reportedImageUsage } from "./_base.js";
import { PROVIDERS } from "../../config/providers.js";
import { CODEX_USER_AGENT, CODEX_CLI_VERSION } from "../../config/clientVersions.js";

const CODEX_RESPONSES_URL = PROVIDERS["codex"].baseUrl;
const CODEX_VERSION = CODEX_CLI_VERSION;
const CODEX_ORIGINATOR = "codex_cli_rs";
const CODEX_MODEL_SUFFIX = "-image";
const CODEX_REF_DETAIL = "high";

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

function stripImageSuffix(model) {
  return model.endsWith(CODEX_MODEL_SUFFIX) ? model.slice(0, -CODEX_MODEL_SUFFIX.length) : model;
}

function toDataUrl(input) {
  if (!input || typeof input !== "string") return null;
  if (/^data:image\//i.test(input) || /^https?:\/\//i.test(input)) return input;
  return `data:image/png;base64,${input}`;
}

function buildContent(prompt, refs, detail = CODEX_REF_DETAIL) {
  const content = [];
  refs.forEach((url, index) => {
    content.push({ type: "input_text", text: `<image name=image${index + 1}>` });
    content.push({ type: "input_image", image_url: url, detail });
    content.push({ type: "input_text", text: "</image>" });
  });
  content.push({ type: "input_text", text: prompt });
  return content;
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

function createImageReader(response, { log, clientSignal, onUsage }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let imageB64 = null;
  let usage = null;
  let failed = false;
  let completion;
  let closed = false;
  let abortReason;
  let lastEvent;
  let lastProgress = 0;
  let bytesReceived = 0;
  const processBlock = block => {
    let eventName;
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!eventName) return [];
    let data;
    try { data = JSON.parse(dataLines.join("\n")); } catch { return []; }
    const next = normalizeResponsesUsage(data?.response?.usage ?? data?.usage);
    const tier = data?.response?.service_tier ?? data?.service_tier;
    if (next && typeof tier === "string" && tier) next.actualServiceTier = tier;
    if (next && (!usage || next.total_tokens >= usage.total_tokens)) usage = next;
    if (["response.failed", "response.incomplete", "error"].includes(eventName) || data?.error || data?.response?.error) failed = true;
    if (eventName === "response.output_item.done" && data?.item?.type === "image_generation_call" && data.item.result) imageB64 = data.item.result;
    if (eventName !== lastEvent) { log?.info?.("IMAGE", `codex progress: ${eventName}`); lastEvent = eventName; }
    const frames = [];
    if (Date.now() - lastProgress > 200) {
      lastProgress = Date.now();
      frames.push(["progress", { stage: eventName, bytesReceived }]);
    }
    if (eventName === "response.image_generation_call.partial_image" && data?.partial_image_b64) {
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
    buffer += decoder.decode();
    for (const block of buffer.split(/\r?\n\r?\n/)) if (block.trim()) processBlock(block);
    buffer = "";
    const release = (async () => {
      try { if (cancel) await reader.cancel(reason); }
      catch {}
      finally { reader.releaseLock(); }
    })();
    release.catch(() => {});
    void (async () => {
      try {
        if (usage && onUsage) {
          if (status === "success") await onUsage(structuredClone(usage));
          else await onUsage(structuredClone(usage), { status });
        }
      } finally { await release; }
    })().then(resolveCompletion, rejectCompletion);
    return completion;
  };
  const onAbort = () => {
    abortReason = clientSignal.reason || new Error("Client closed request");
    void finish("aborted", abortReason, true);
  };
  clientSignal?.addEventListener("abort", onAbort, { once: true });
  if (clientSignal?.aborted) onAbort();
  return {
    async next() {
      if (closed) { await completion; if (abortReason) throw abortReason; return { done: true, imageB64, failed }; }
      try {
        while (true) {
          const separator = /\r?\n\r?\n/.exec(buffer);
          if (separator) {
            const block = buffer.slice(0, separator.index);
            buffer = buffer.slice(separator.index + separator[0].length);
            const frames = processBlock(block);
            if (frames.length) return { frames };
            continue;
          }
          const chunk = await reader.read();
          if (closed) { await completion; if (abortReason) throw abortReason; return { done: true, imageB64, failed }; }
          if (chunk.done) {
            buffer += decoder.decode();
            if (buffer.trim()) processBlock(buffer);
            buffer = "";
            const success = !!imageB64 && !failed;
            await finish(success ? "success" : "error");
            return { done: true, imageB64, failed };
          }
          bytesReceived += chunk.value.byteLength;
          buffer += decoder.decode(chunk.value, { stream: true });
        }
      } catch (error) {
        await finish(clientSignal?.aborted ? "aborted" : "error", error, true);
        throw error;
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
        } else controller.enqueue(encoder.encode('event: error\ndata: {"message":"Codex did not return a completed image."}\n\n'));
        controller.close();
      } catch (error) {
        if (cancelled) return;
        if (options.clientSignal?.aborted) controller.error(error);
        else {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: error?.message || "Stream failed" })}\n\n`));
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
  buildUrl: () => CODEX_RESPONSES_URL,
  buildHeaders: (creds) => {
    const accountId = creds?.providerSpecificData?.chatgptAccountId || decodeAccountId(creds?.idToken);
    return {
      "accept": "text/event-stream, application/json",
      "authorization": `Bearer ${creds?.accessToken || ""}`,
      "chatgpt-account-id": accountId || "",
      "content-type": "application/json",
      "originator": CODEX_ORIGINATOR,
      "session_id": randomUUID(),
      "user-agent": CODEX_USER_AGENT,
      "version": CODEX_VERSION,
      "x-client-request-id": randomUUID(),
    };
  },
  buildBody: (model, body) => {
    const refs = [];
    if (Array.isArray(body.images)) body.images.forEach((i) => { const u = toDataUrl(i); if (u) refs.push(u); });
    const single = toDataUrl(body.image);
    if (single) refs.push(single);
    const detail = body.image_detail || CODEX_REF_DETAIL;
    const imgTool = { type: "image_generation", output_format: (body.output_format || "png").toLowerCase() };
    if (body.size && body.size !== "") imgTool.size = body.size;
    if (body.quality && body.quality !== "") imgTool.quality = body.quality;
    if (body.background && body.background !== "") imgTool.background = body.background;
    return {
      model: stripImageSuffix(model),
      instructions: "",
      input: [{ type: "message", role: "user", content: buildContent(body.prompt, refs, detail) }],
      tools: [imgTool],
      tool_choice: "auto",
      parallel_tool_calls: false,
      prompt_cache_key: randomUUID(),
      stream: true,
      store: false,
      reasoning: null,
    };
  },
  async parseResponse(response, options = {}) {
    if (options.streamToClient) return { sseResponse: buildSseResponse(response, options) };
    const session = createImageReader(response, options);
    while (true) {
      const result = await session.next();
      if (!result.done) continue;
      if (!result.imageB64 || result.failed) throw new Error("Codex did not return a completed image. Account may not be entitled (Plus/Pro required).");
      return { created: nowSec(), data: [{ b64_json: result.imageB64 }] };
    }
  },
  normalize: (responseBody) => responseBody,
};
