import { BaseExecutor } from "./base.js";
import { CODEX_DEFAULT_INSTRUCTIONS } from "../config/codexInstructions.js";
import { PROVIDERS } from "../config/providers.js";
import { CODEX_CLI_VERSION } from "../config/clientVersions.js";
import {
  refreshProviderCredentials,
  shouldRefreshCredentials,
} from "../services/oauthCredentialManager.js";
import { normalizeResponsesInput } from "../translator/formats/responsesApi.js";
import { FORMATS } from "../translator/formats.js";
import { applyThinking, captureThinking } from "../translator/concerns/thinkingUnified.js";
import { prefetchRemoteImages } from "../translator/concerns/prefetch.js";
import { normalizeMediaPart } from "../translator/concerns/multimodal.js";
import { OPENAI_BLOCK, RESPONSES_ITEM } from "../translator/schema/index.js";
import { getModelUpstreamId } from "../config/providerModels.js";
import { getThinkingLevels } from "../providers/thinkingLevels.js";
import { CODEX_SSE_PEEK_TIMEOUT_MS, DEFAULT_RETRY_CONFIG, HTTP_STATUS, resolveRetryEntry } from "../config/runtimeConfig.js";
import { dbg } from "../utils/debugLog.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { stripCodexUnsupportedPatterns } from "../utils/codexToolSchema.js";
import { getOpenAIResponsesEventName } from "../utils/responsesStreamHelpers.js";

// SSE error patterns inside 200-OK bodies. Some retry same account first; capacity rotates accounts.
const CODEX_SSE_RETRY_PATTERNS = ["server_is_overloaded", "service_unavailable_error"];
const CODEX_SSE_ACCOUNT_FALLBACK_PATTERNS = [
  "selected model is at capacity",
  "model_at_capacity",
  "response.failed",
  "not supported when using codex with a chatgpt account",
];
const CODEX_SSE_USER_OUTPUT_EVENTS = new Set([
  "response.output_text.delta",
  "response.function_call_arguments.delta",
  "response.custom_tool_call_input.delta",
]);
// Request-scoped failures that ride inside a 200-OK SSE body. These describe the
// REQUEST, not upstream health, so they must surface as 400 (the client can fix
// the prompt) and must never cool the account down. Observed live: an over-long
// prompt produced `context_length_exceeded` inside the stream; the generic
// `response.failed` branch turned it into 503, the client saw 502 (which it
// treats as retryable), and every healthy account was locked for 30s in turn
// while the request could never succeed.
const CODEX_SSE_CLIENT_ERROR_PATTERNS = [
  "context_length_exceeded",
  "exceeds the context window",
  "maximum context length",
  "context length exceeded",
];
const CODEX_SSE_PEEK_BYTES = 256 * 1024;
const CODEX_MODEL_CAPACITY_MESSAGE = "Selected model is at capacity. Please try a different model.";

// Server-generated item id prefixes that Codex /responses cannot resolve when store=false
const SERVER_ID_PATTERN = /^(rs|fc|resp|msg)_/;

// Hosted tool types that Codex/OpenAI Responses executes server-side
const CODEX_HOSTED_TOOL_TYPES = new Set([
  "image_generation", "web_search", "web_search_preview", "file_search",
  "computer", "computer_use_preview", "code_interpreter", "mcp", "local_shell",
  "tool_search"
]);

// Responses-native freeform tools carry a name plus format payload and must pass through intact.
const CODEX_PASSTHROUGH_TOOL_TYPES = new Set(["custom"]);

// Allowlist of fields accepted by Codex Responses API — anything else is stripped
const RESPONSES_API_ALLOWLIST = new Set([
  "model", "input", "instructions", "tools", "tool_choice", "stream", "store",
  "reasoning", "service_tier", "include", "prompt_cache_key", "client_metadata",
  "text"
]);

// Convert role=system → role=developer in body.input (keeps content in cacheable prefix)
function convertSystemToDeveloperRole(body) {
  if (!Array.isArray(body.input)) return;
  for (const item of body.input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const isSystemMsg = item.role === "system" && (!item.type || item.type === "message");
    if (isSystemMsg) item.role = "developer";
  }
}

// Strip server-generated item IDs (rs_/fc_/resp_/msg_) from input — avoids 404 with store=false
function stripStoredItemReferences(body) {
  if (!Array.isArray(body.input)) return;
  body.input = body.input.filter((item) => {
    if (typeof item === "string" && SERVER_ID_PATTERN.test(item)) return false;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      if (item.type === "item_reference") return false;
      if (typeof item.id === "string" && SERVER_ID_PATTERN.test(item.id)) delete item.id;
    }
    return true;
  });
}

// Flatten Chat-Completions tool shape into Responses flat format + filter unsupported tools
function normalizeCodexTools(body) {
  if (!Array.isArray(body.tools)) return;
  const validNames = new Set();
  // Codex's schema validator has no Unicode property escapes; a `pattern`
  // carrying `\p{...}` 400s the whole request on every account (#3922).
  const patternStats = { removed: 0 };
  body.tools = body.tools.filter((tool) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return false;
    const type = typeof tool.type === "string" ? tool.type : "";
    if (type === "namespace") {
      if (Array.isArray(tool.tools)) {
        for (const st of tool.tools) {
          const n = typeof st?.name === "string" ? st.name.trim().slice(0, 128) : "";
          if (n) validNames.add(n);
          if (st?.parameters && typeof st.parameters === "object") {
            st.parameters = stripCodexUnsupportedPatterns(st.parameters, patternStats);
          }
        }
      }
      return true;
    }
    if (type !== "function") {
      if (CODEX_PASSTHROUGH_TOOL_TYPES.has(type)) return true;
      if (!type || tool.function || typeof tool.name === "string") return false;
      return CODEX_HOSTED_TOOL_TYPES.has(type);
    }
    const fn = tool.function && typeof tool.function === "object" && !Array.isArray(tool.function) ? tool.function : null;
    const rawName = typeof tool.name === "string" ? tool.name : (typeof fn?.name === "string" ? fn.name : "");
    const name = rawName.trim();
    if (!name) return false;
    const description = typeof tool.description === "string" ? tool.description : (typeof fn?.description === "string" ? fn.description : "");
    const parameters = (tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters))
      ? tool.parameters
      : (fn?.parameters && typeof fn.parameters === "object" && !Array.isArray(fn.parameters) ? fn.parameters : { type: "object", properties: {} });
    // Capture strict before the delete loop clears it: rebuilding the flat
    // declaration without it silently lost both false and true (9router #4543,
    // fixes #4542 — losing strict:false let upstream defaults change
    // optional-argument behavior).
    const strict = typeof tool.strict === "boolean" ? tool.strict : fn?.strict;
    for (const k of Object.keys(tool)) delete tool[k];
    tool.type = "function";
    tool.name = name.slice(0, 128);
    if (description) tool.description = description;
    tool.parameters = stripCodexUnsupportedPatterns(parameters, patternStats);
    if (typeof strict === "boolean") tool.strict = strict;
    validNames.add(name);
    return true;
  });
  if (patternStats.removed > 0) {
    dbg("CODEX", `stripped ${patternStats.removed} unsupported tool schema pattern(s)`);
  }
  // Drop tool_choice if it references an unknown function name
  if (body.tool_choice && typeof body.tool_choice === "object" && !Array.isArray(body.tool_choice)) {
    if (body.tool_choice.type === "function") {
      const n = typeof body.tool_choice.name === "string" ? body.tool_choice.name.trim() : "";
      if (!n || !validNames.has(n)) delete body.tool_choice;
    }
  }
}

// Resolve prompt-cache session id: client session → assistant-text-hash → workspaceId → connection
function resolveCacheSessionId(body, credentials) {
  return resolveSessionId({
    headers: credentials?.rawHeaders,
    body,
    connectionId: credentials?.connectionId,
    workspaceId: credentials?.providerSpecificData?.workspaceId,
    scope: "codex"
  });
}

function normalizeReasoningEffort(model, value) {
  const supportedLevels = getThinkingLevels("codex", model);
  if (supportedLevels?.includes(value)) return value;
  if (value === "ultra" && supportedLevels?.includes("max")) return "max";
  if (value === "max" || value === "ultra") return "xhigh";
  return value;
}

function findNestedMessage(value, depth = 0) {
  if (!value || depth > 6 || typeof value === "string") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedMessage(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  if (typeof value.message === "string" && value.message.trim()) return value.message;
  if (typeof value.error?.message === "string" && value.error.message.trim()) return value.error.message;
  if (typeof value.response?.error?.message === "string" && value.response.error.message.trim()) return value.response.error.message;
  for (const child of Object.values(value)) {
    const found = findNestedMessage(child, depth + 1);
    if (found) return found;
  }
  return null;
}


function codexSseErrorResponse(status, message, clientError = false) {
  // Keep the error `code` meaningful so callers can branch on it. The previous
  // single "upstream_error" value made a context overflow indistinguishable
  // from a genuine gateway fault.
  const code = clientError
    ? "invalid_request_error"
    : status === HTTP_STATUS.SERVICE_UNAVAILABLE
      ? "service_unavailable"
      : "upstream_error";
  return new Response(JSON.stringify({
    error: {
      message,
      type: status >= 500 ? "server_error" : "invalid_request_error",
      code,
    }
  }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function waitForCodexRetry(delayMs, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Codex Executor - handles OpenAI Codex API (Responses API format)
 * Automatically injects default instructions if missing
 */
export class CodexExecutor extends BaseExecutor {
  constructor() {
    super("codex", PROVIDERS.codex);
    this._currentSessionId = null;
  }

  /**
   * Override headers to add codex-specific identity headers.
   * transformRequest runs BEFORE buildHeaders, sets this._currentSessionId.
   */
  buildHeaders(credentials, stream = true) {
    const headers = super.buildHeaders(credentials, stream);
    const sid = this._currentSessionId || credentials?.connectionId || "default";
    headers["session_id"] = sid;
    headers["session-id"] = sid;
    headers["version"] = CODEX_CLI_VERSION;
    // Identify client type to Codex backend (matches official codex CLI)
    if (!headers["originator"]) headers["originator"] = "codex_cli_rs";
    // Account/workspace binding header — required when multiple Codex accounts
    // are configured. OAuth import stores ChatGPT account ID as chatgptAccountId;
    // older/custom rows may use workspaceId/accountId. Prefer explicit workspaceId
    // but fall back to chatgptAccountId so requests don't cross-bind to the wrong
    // OpenAI account and surface as token_invalid after adding another account.
    const accountId =
      credentials?.providerSpecificData?.workspaceId ||
      credentials?.providerSpecificData?.chatgptAccountId ||
      credentials?.providerSpecificData?.accountId;
    if (typeof accountId === "string" && accountId && !headers["ChatGPT-Account-ID"]) {
      headers["ChatGPT-Account-ID"] = accountId;
    }
    return headers;
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    const base = super.buildUrl(model, stream, urlIndex, credentials);
    return this._isCompact ? `${base}/compact` : base;
  }

  async refreshCredentials(credentials, log) {
    if (!credentials?.refreshToken) return null;
    return refreshProviderCredentials("codex", credentials, log);
  }

  needsRefresh(credentials) {
    return shouldRefreshCredentials("codex", credentials);
  }

  /**
   * Prefetch remote image URLs and inline them as base64 data URIs.
   * Runs before execute() because Codex backend cannot fetch remote images.
   * Mutates body.input in place.
   */
  async prefetchImages(body, options = {}) {
    if (!Array.isArray(body?.input) || options.signal?.aborted) return;
    for (const item of body.input) {
      const parts = item?.type === RESPONSES_ITEM.FUNCTION_CALL_OUTPUT || item?.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL_OUTPUT
        ? item.output : item?.content;
      if (!Array.isArray(parts)) continue;
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        if (part?.type !== OPENAI_BLOCK.IMAGE_URL && part?.type !== RESPONSES_ITEM.INPUT_IMAGE) continue;
        const image = normalizeMediaPart(part);
        if (!image) continue;
        parts[index] = { ...part, type: RESPONSES_ITEM.INPUT_IMAGE,
          image_url: image.image_url.url, detail: image.image_url.detail || "auto" };
      }
    }
    await prefetchRemoteImages(body, FORMATS.CODEX, FORMATS.CODEX, { timeoutMs: 15000, ...options });
  }

  async execute(args) {
    args.signal?.throwIfAborted();
    const imgCount = Array.isArray(args.body?.input) ? args.body.input.reduce((n, it) => n + (Array.isArray(it.content) ? it.content.filter(c => c.type === "image_url").length : 0), 0) : 0;
    const inputLen = Array.isArray(args.body?.input) ? args.body.input.length : 0;
    dbg("CODEX", `execute start | inputItems=${inputLen} | images=${imgCount} | sessionId=${this._currentSessionId || "pending"}`);
    if (imgCount > 0) {
      const t0 = Date.now();
      await this.prefetchImages(args.body, { signal: args.signal });
      dbg("CODEX", `prefetchImages done | ${Date.now() - t0}ms`);
    } else {
      await this.prefetchImages(args.body, { signal: args.signal });
    }

    // Retry loop for SSE-level overloaded errors (200 OK body contains event: error)
    // Reuses 503 retry config — same semantic: upstream temporarily unavailable
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...this.config.retry };
    const { attempts, delayMs } = resolveRetryEntry(retryConfig[503]);
    let attempt = 0;
    while (true) {
      args.signal?.throwIfAborted();
      const result = await super.execute(args);
      const peek = await this._peekSseTransientError(result.response, args.signal);
      if (!peek.matched) {
        // Replace body with re-assembled stream (prefix bytes already read + rest)
        if (peek.replacementBody) {
          result.response = new Response(peek.replacementBody, {
            status: result.response.status,
            statusText: result.response.statusText,
            headers: result.response.headers,
          });
        }
        return result;
      }
      // Request-scoped failure (context overflow, bad schema): surface it as a
      // 400 so the client can fix the request, and do NOT rotate accounts — the
      // credential is healthy and the identical request would fail on every one.
      if (peek.clientError) {
        args.log?.warn?.("RETRY", `CODEX | SSE client error "${peek.message}" — not an account fault`);
        result.response = codexSseErrorResponse(HTTP_STATUS.BAD_REQUEST, peek.message || peek.matched, true);
        return result;
      }
      if (peek.accountFallback) {
        args.log?.warn?.("RETRY", `CODEX | SSE account fallback "${peek.message}"`);
        result.response = codexSseErrorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, peek.message || CODEX_MODEL_CAPACITY_MESSAGE);
        return result;
      }
      if (attempt >= attempts) {
        args.log?.warn?.("RETRY", `CODEX | SSE overloaded "${peek.matched}" — retries exhausted (${attempt}/${attempts})`);
        result.response = codexSseErrorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, peek.message || peek.matched);
        return result;
      }
      attempt++;
      args.log?.debug?.("RETRY", `CODEX | SSE "${peek.matched}" retry ${attempt}/${attempts} after ${delayMs / 1000}s`);
      dbg("CODEX", `SSE overloaded "${peek.matched}" → retry ${attempt}/${attempts} in ${delayMs}ms`);
      await waitForCodexRetry(delayMs, args.signal);
    }
  }

  // Bound preheader inspection, then replay the exact prefix and any outstanding read.
  // Only complete SSE payloads can establish real output or a pre-output failure.
  async _peekSseTransientError(response, signal) {
    if (!response || !response.ok || !response.body
      || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "text/event-stream") {
      return { matched: null, message: null, accountFallback: false, clientError: false, replacementBody: null };
    }
    signal?.throwIfAborted();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    let buffer = "";
    let dataLines = [];
    let eventName = null;
    let inspectedBytes = 0;
    let pendingRead = null;
    let ended = false;
    let readError = null;
    let matched = null;
    let message = null;
    let accountFallback = false;
    let clientError = false;

    const inspectFrame = () => {
      const payload = dataLines.join("\n");
      dataLines = [];
      const name = eventName;
      eventName = null;
      if (!payload.trim() || payload.trim() === "[DONE]") return false;
      let data;
      try { data = JSON.parse(payload); } catch { return false; }
      const type = getOpenAIResponsesEventName(name, data);
      if (CODEX_SSE_USER_OUTPUT_EVENTS.has(type)
        && typeof data?.delta === "string" && data.delta.length > 0) return true;

      const error = data?.error || data?.response?.error;
      if (!error && type !== "error" && type !== "response.failed") return false;
      const lowerError = JSON.stringify(error || data).toLowerCase();
      // Request-scoped failures are checked FIRST: upstream reports context
      // overflow as `response.failed` too, and matching that generic pattern
      // first is what converted a client error into a retryable 503/502.
      const clientHit = CODEX_SSE_CLIENT_ERROR_PATTERNS.find(pattern => lowerError.includes(pattern));
      if (clientHit) {
        matched = clientHit;
        clientError = true;
        accountFallback = false;
        message = findNestedMessage(error || data) || clientHit;
        return true;
      }
      const accountHit = CODEX_SSE_ACCOUNT_FALLBACK_PATTERNS.find(pattern => lowerError.includes(pattern));
      matched = accountHit || (type === "response.failed" ? "response.failed" : null);
      accountFallback = !!matched;
      if (!matched) matched = CODEX_SSE_RETRY_PATTERNS.find(pattern => lowerError.includes(pattern)) || null;
      if (!matched) return false;
      message = findNestedMessage(error || data) || matched;
      return true;
    };

    const inspectLine = line => {
      if (line === "") return inspectFrame();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      else if (line.startsWith("event:")) eventName = line.slice(6).trim();
      return false;
    };

    const inspectBuffer = (eof = false) => {
      while (true) {
        const index = buffer.search(/[\r\n]/);
        if (index < 0 || (!eof && buffer[index] === "\r" && index === buffer.length - 1)) break;
        const line = buffer.slice(0, index);
        const delimiterLength = buffer[index] === "\r" && buffer[index + 1] === "\n" ? 2 : 1;
        buffer = buffer.slice(index + delimiterLength);
        if (inspectLine(line)) return true;
      }
      if (eof) {
        if (buffer && inspectLine(buffer)) return true;
        buffer = "";
        return inspectFrame();
      }
      return false;
    };

    const deadline = Symbol("peek deadline");
    let timer;
    let onAbort;
    const deadlinePromise = new Promise(resolve => {
      timer = setTimeout(() => resolve(deadline), CODEX_SSE_PEEK_TIMEOUT_MS);
    });
    const abortPromise = new Promise((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    const cancelReader = async reason => {
      try { await reader.cancel(reason); } catch { /* Cancellation may race an upstream error. */ }
      finally { try { reader.releaseLock(); } catch { /* Already released. */ } }
    };

    try {
      while (inspectedBytes < CODEX_SSE_PEEK_BYTES) {
        signal?.throwIfAborted();
        pendingRead = reader.read();
        const result = await Promise.race([pendingRead, deadlinePromise, abortPromise]);
        if (result === deadline) break;
        pendingRead = null;
        if (result.done) {
          ended = true;
          buffer += decoder.decode();
          inspectBuffer(true);
          break;
        }
        chunks.push(result.value);
        const remaining = CODEX_SSE_PEEK_BYTES - inspectedBytes;
        const prefix = result.value.subarray(0, remaining);
        inspectedBytes += prefix.byteLength;
        buffer += decoder.decode(prefix, { stream: true });
        if (inspectBuffer()) break;
      }
    } catch (error) {
      if (signal?.aborted) {
        await cancelReader(signal.reason);
        throw signal.reason;
      }
      readError = error;
      dbg("CODEX", `peek read error: ${error.message}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }

    if (matched) {
      await cancelReader();
      return { matched, message, accountFallback, clientError, replacementBody: null };
    }

    let finished = false;
    let onReplayAbort;
    const finish = () => {
      finished = true;
      signal?.removeEventListener("abort", onReplayAbort);
      try { reader.releaseLock(); } catch { /* Cancellation may still own a pending read. */ }
    };
    const replacementBody = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        if (ended) {
          finish();
          controller.close();
          return;
        }
        onReplayAbort = () => {
          if (finished) return;
          finished = true;
          signal.removeEventListener("abort", onReplayAbort);
          controller.error(signal.reason);
          void cancelReader(signal.reason);
        };
        signal?.addEventListener("abort", onReplayAbort, { once: true });
        if (signal?.aborted) onReplayAbort();
      },
      async pull(controller) {
        try {
          if (readError) throw readError;
          const read = pendingRead || reader.read();
          pendingRead = null;
          const { done, value } = await read;
          if (finished) return;
          if (done) {
            finish();
            controller.close();
          } else controller.enqueue(value);
        } catch (error) {
          if (finished) return;
          finish();
          controller.error(error);
        }
      },
      async cancel(reason) {
        finished = true;
        signal?.removeEventListener("abort", onReplayAbort);
        await cancelReader(reason);
      },
    });
    return { matched: null, message: null, accountFallback: false, clientError: false, replacementBody };
  }

  // Parse Codex usage_limit_reached to extract precise resetsAtMs; fallback to default otherwise
  parseError(response, bodyText, generic) {
    if (response.status === 429 && bodyText) {
      try {
        const json = JSON.parse(bodyText);
        const err = json?.error;
        if (err?.type === "usage_limit_reached") {
          const now = Date.now();
          let resetsAtMs = null;
          if (typeof err.resets_at === "number" && err.resets_at > 0) {
            const ms = err.resets_at * 1000;
            if (ms > now) resetsAtMs = ms;
          }
          if (!resetsAtMs && typeof err.resets_in_seconds === "number" && err.resets_in_seconds > 0) {
            resetsAtMs = now + err.resets_in_seconds * 1000;
          }
          if (resetsAtMs) {
            return { status: 429, message: err.message || bodyText, resetsAtMs };
          }
        }
      } catch { /* fall through to default */ }
    }
    return super.parseError(response, bodyText, generic);
  }

  /**
   * Transform request before sending - inject default instructions if missing.
   * Image fetching is handled separately in prefetchImages() so this stays sync.
   */
  transformRequest(model, body, stream, credentials) {
    this._isCompact = !!body._compact;
    delete body._compact;
    // Resolve conversation-stable session_id (priority: body → assistant-text → workspace → machine)
    this._currentSessionId = resolveCacheSessionId(body, credentials);
    // Convert string input to array format (Codex API requires input as array)
    const normalized = normalizeResponsesInput(body.input);
    if (normalized) body.input = normalized;

    // Ensure input is present and non-empty (Codex API rejects empty input)
    if (!body.input || (Array.isArray(body.input) && body.input.length === 0)) {
      body.input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
    }

    // Keep system prompts in body.input as role=developer so they stay in the cacheable prefix
    convertSystemToDeveloperRole(body);
    // Strip server-generated item IDs (rs_/fc_/resp_/msg_) — Codex /responses can't resolve when store=false
    stripStoredItemReferences(body);
    // Flatten function tools + drop unsupported types
    normalizeCodexTools(body);

    // Ensure streaming is enabled (Codex API requires it)
    body.stream = true;

    // If no instructions provided, inject default Codex instructions
    if (!body.instructions || body.instructions.trim() === "") {
      body.instructions = CODEX_DEFAULT_INSTRUCTIONS;
    }

    // Ensure store is false (Codex requirement)
    body.store = false;

    // Inject prompt_cache_key for stable Codex prompt caching
    if (!body.prompt_cache_key && this._currentSessionId) {
      body.prompt_cache_key = this._currentSessionId;
    }

    // Map virtual Codex review models to the upstream Codex model before suffix parsing.
    body.model = getModelUpstreamId("cx", body.model || model);

    // Consume legacy effort suffixes such as gpt-5.3-codex-high.
    const effortLevels = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
    let modelEffort = null;
    for (const level of effortLevels) {
      if (body.model.endsWith(`-${level}`)) {
        modelEffort = level;
        // Strip suffix from model name for actual API call
        body.model = body.model.replace(`-${level}`, '');
        break;
      }
    }

    const thinkingIntent = captureThinking(body);
    if (thinkingIntent) applyThinking(FORMATS.OPENAI_RESPONSES, body.model, body, this.provider, thinkingIntent);

    // Native reasoning options do not imply an effort; resolve it independently.
    if (!body.reasoning || typeof body.reasoning !== "object" || Array.isArray(body.reasoning)) {
      body.reasoning = {};
    }
    if (body.reasoning.effort === undefined) {
      body.reasoning.effort = body.reasoning_effort || modelEffort || "low";
    }
    body.reasoning.effort = normalizeReasoningEffort(body.model, body.reasoning.effort);
    if (body.reasoning.summary === undefined) body.reasoning.summary = "auto";
    delete body.reasoning_effort;

    // Include reasoning encrypted content (required by Codex backend for reasoning models)
    if (body.reasoning && body.reasoning.effort && body.reasoning.effort !== 'none') {
      body.include = ["reasoning.encrypted_content"];
    }

    // Remove unsupported parameters for Codex API
    delete body.temperature;
    delete body.top_p;
    delete body.frequency_penalty;
    delete body.presence_penalty;
    delete body.logprobs;
    delete body.top_logprobs;
    delete body.n;
    delete body.seed;
    delete body.max_tokens;
    delete body.max_completion_tokens;
    delete body.max_output_tokens; // Responses API clients send this but Codex rejects it
    delete body.user; // Cursor sends this but Codex doesn't support it
    delete body.prompt_cache_retention; // Cursor sends this but Codex doesn't support it
    delete body.metadata; // Cursor sends this but Codex doesn't support it
    delete body.stream_options; // Cursor sends this but Codex doesn't support it
    delete body.safety_identifier; // Droid CLI sends this but Codex doesn't support it
    delete body.previous_response_id; // store=false → backend can't resolve previous resp; avoid 404

    if (body.service_tier === "fast") body.service_tier = "priority";
    if (body.service_tier && body.service_tier !== "priority") delete body.service_tier;

    // Final allowlist filter — strip any unknown field that could trigger upstream "routing_unsupported"
    for (const k of Object.keys(body)) {
      if (!RESPONSES_API_ALLOWLIST.has(k)) delete body[k];
    }

    return body;
  }
}
