import crypto from "crypto";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import {
  OAUTH_ENDPOINTS,
  ANTIGRAVITY_HEADERS,
  AG_DEFAULT_TOOLS,
  AG_TOOL_SUFFIX,
  ANTIGRAVITY_PROMPT_REWRITES,
  ANTIGRAVITY_TELEMETRY_KEYS,
} from "../config/appConstants.js";
import { CLAUDE_MIN_THINKING_BUDGET, HTTP_STATUS } from "../config/runtimeConfig.js";
import { ANTIGRAVITY_MAX_OUTPUT_TOKENS } from "../config/antigravity.js";
import { isGemini4Model } from "../config/models.js";
import { readOutputTokenCap } from "../translator/formats/maxTokens.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { cleanJSONSchemaForAntigravity, normalizeGeminiContents } from "../translator/formats/gemini.js";
import { FORMATS } from "../translator/formats.js";
import { applyThinking, captureThinking } from "../translator/concerns/thinkingUnified.js";
import { getThinkingContext, setThinkingContext, thinkingBudgetError } from "../translator/concerns/thinking.js";
import { validateSupportedParams } from "../translator/concerns/paramSupport.js";
import { sanitizeAntigravitySystemPrompt } from "../translator/request/openai-to-gemini.js";
import { DEFAULT_THINKING_AG_SIGNATURE } from "../config/defaultThinkingSignature.js";
import { isValidBase64 } from "../translator/concerns/thoughtSignature.js";

// Sanitize function name: Gemini requires [a-zA-Z_][a-zA-Z0-9_.:\-]{0,63}
function sanitizeFunctionName(name) {
  if (!name) return "_unknown";
  let s = name.replace(/[^a-zA-Z0-9_.:\-]/g, "_");
  if (!/^[a-zA-Z_]/.test(s)) s = "_" + s;
  return s.substring(0, 64);
}

const MAX_RETRY_AFTER_MS = 10000;
const ANTIGRAVITY_TRANSIENT_RETRY_MAX_MS = 15000;
const ANTIGRAVITY_IDE_REQUEST_ID_RE = /^agent\/[^/]+\/\d+\/[^/]+\/\d+$/;

const ANTIGRAVITY_TRANSIENT_ERROR_PATTERNS = [
  /high\s+traffic/i,
  /agent\s+(execution\s+)?terminated\s+due\s+to\s+error/i,
  /capacity/i,
  /temporarily\s+unavailable/i,
  /timeout/i,
  /stream\s+(ended|closed|terminated|interrupted)/i,
  /empty\s+response/i,
];

const ANTIGRAVITY_TRANSIENT_STATUSES = new Set([
  HTTP_STATUS.SERVER_ERROR,
  HTTP_STATUS.BAD_GATEWAY,
  HTTP_STATUS.SERVICE_UNAVAILABLE,
  HTTP_STATUS.GATEWAY_TIMEOUT,
]);

// Fields Google generateContent rejects (Claude/OpenAI/Qwen thinking fields set at body root by thinkingUnified.js)
const ANTIGRAVITY_REQUEST_BLACKLIST = [
  "output_config",
  "thinking",
  "reasoning_effort",
  "reasoning",
  "enable_thinking",
  "thinking_budget",
  "thinkingConfig",
  "budget_tokens",
];

// Strip blacklisted fields from an object (used for both body.request and top-level body)
const stripBlacklisted = obj => {
  for (const key of ANTIGRAVITY_REQUEST_BLACKLIST) delete obj[key];
};

function stripHarnessTelemetry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  let changed = false;
  const cleaned = { ...value };
  for (const key of ANTIGRAVITY_TELEMETRY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(cleaned, key)) {
      delete cleaned[key];
      changed = true;
    }
  }

  const labels = cleaned.labels;
  if (labels && typeof labels === "object" && !Array.isArray(labels)) {
    let labelsChanged = false;
    const cleanedLabels = { ...labels };
    for (const key of ANTIGRAVITY_TELEMETRY_KEYS) {
      if (Object.prototype.hasOwnProperty.call(cleanedLabels, key)) {
        delete cleanedLabels[key];
        labelsChanged = true;
      }
    }
    if (labelsChanged) {
      cleaned.labels = cleanedLabels;
      changed = true;
    }
  }

  return changed ? cleaned : value;
}

// Image generation model name patterns
const IMAGE_MODEL_PATTERNS = [
  /image/i,
  /imagen/i,
  /image-generation/i,
];

// Stable per-connection fallback project id.
//
// Google evaluates quota/eligibility per project. When the connection has no
// stored projectId (e.g. loadCodeAssist provisioning failed — which is exactly
// what happens behind Google's "User location is not supported" geo-gate),
// minting a FRESH RANDOM id on every request looks abusive, breaks any
// project-scoped check, and makes logs undebuggable. So generate once per
// connection identity and reuse for process lifetime. A real stored
// projectId (provisioned via loadCodeAssist and persisted to the connection)
// always wins — this cache is strictly a last-resort fallback.
const stableProjectCache = new Map(); // connectionKey -> projectId
const MAX_STABLE_PROJECTS = 500;

function connectionProjectKey(credentials) {
  return credentials?.connectionId || credentials?.email || "anonymous";
}

export function resolveAntigravityProjectId(credentials, generate) {
  if (credentials?.projectId) return credentials.projectId;
  const key = connectionProjectKey(credentials);
  let id = stableProjectCache.get(key);
  if (!id) {
    id = generate();
    if (stableProjectCache.size >= MAX_STABLE_PROJECTS) {
      stableProjectCache.delete(stableProjectCache.keys().next().value);
    }
    stableProjectCache.set(key, id);
  }
  return id;
}

// Test-only: reset the fallback cache between cases.
export function _resetAntigravityProjectCache() {
  stableProjectCache.clear();
}

// Detect if a model is an image generation model
function isImageModel(model) {
  if (!model) return false;
  return IMAGE_MODEL_PATTERNS.some(p => p.test(model));
}

// Parse aspect ratio / resolution from model name suffixes
// e.g. "gemini-3.1-flash-image-16x9" -> { aspectRatio: "16:9" }
// e.g. "gemini-3.1-flash-image-1024x768" -> { aspectRatio: "4:3" }
function parseImageConfig(model) {
  const config = { aspectRatio: "1:1" };
  const resMatch = model.match(/(\d+)x(\d+)$/);
  if (resMatch) {
    const w = parseInt(resMatch[1]);
    const h = parseInt(resMatch[2]);
    if (w <= 16 && h <= 16) {
      config.aspectRatio = `${w}:${h}`;
    } else {
      // Resolution like 1024x768 — derive aspect ratio
      const gcd = (a, b) => b ? gcd(b, a % b) : a;
      const d = gcd(w, h);
      config.aspectRatio = `${w/d}:${h/d}`;
    }
  }
  return config;
}

function uuidFromSeed(seed) {
  const bytes = crypto.createHash("sha256").update(String(seed || "antigravity")).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildIdeRequestId({ body, request, credentials, model, requestType }) {
  if (ANTIGRAVITY_IDE_REQUEST_ID_RE.test(body?.requestId || "")) {
    return body.requestId;
  }

  const sessionId = request?.sessionId || body?.request?.sessionId || credentials?._clientSessionId || credentials?.connectionId || credentials?.email || "anonymous";
  const conversationId = uuidFromSeed(`antigravity:conversation:${sessionId}`);
  const trajectoryId = uuidFromSeed(`antigravity:trajectory:${sessionId}:${model}:${requestType}`);
  const contentCount = Array.isArray(request?.contents) ? request.contents.length : 1;
  const step = Math.max(1, contentCount * 2 - 1);
  return `agent/${conversationId}/${Date.now()}/${trajectoryId}/${step}`;
}

export class AntigravityExecutor extends BaseExecutor {
  constructor() {
    super("antigravity", PROVIDERS.antigravity);
  }

  buildUrl(model, stream, urlIndex = 0) {
    const baseUrls = this.getBaseUrls();
    const baseUrl = baseUrls[urlIndex] || baseUrls[0];
    // Image generation MUST use non-streaming generateContent
    const forceNonStream = isImageModel(model);
    const action = (stream && !forceNonStream) ? "streamGenerateContent?alt=sse" : "generateContent";
    return `${baseUrl}/v1internal:${action}`;
  }

  // sessionId comes from transformRequest output; base.execute runs transformRequest before
  // buildHeaders, so we read it from instance state cached there (fallback: explicit arg).
  buildHeaders(credentials, stream = true, sessionId = null) {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${credentials.accessToken}`,
      "User-Agent": this.config.headers?.["User-Agent"] || ANTIGRAVITY_HEADERS["User-Agent"],
    };
    // NEVER send x-goog-user-project on chat requests. Google interprets its
    // presence as "bill/attribute to this project" and enforces
    // serviceusage.services.use on it — the shared free-tier project
    // (aicode-consumers) rejects third-party OAuth callers with 403
    // PERMISSION_DENIED. Without the header Google attributes the request to
    // the user's own onboarded binding and the call succeeds (verified live:
    // same envelope 403s with the header, 200s without). The project still
    // travels in the body envelope (`project` field). Mirrors
    // opencode-antigravity-auth, which strips this header for the same reason.
    return headers;
  }

  transformRequest(model, body, stream, credentials) {
    if (!Object.isExtensible(body)) {
      const context = getThinkingContext(body);
      body = { ...body };
      if (context) setThinkingContext(body, context);
    }
    // Prefer the real provisioned projectId (chat.js resolves + persists it via
    // loadCodeAssist before dispatch). Fall back to ONE stable id per connection
    // — never a fresh random id per request (see resolveAntigravityProjectId).
    const projectId = resolveAntigravityProjectId(credentials, () => this.generateProjectId());
    const cleanModel = String(model || "").replace(/-(\d+)x(\d+)$/, "");
    validateSupportedParams(this.provider, cleanModel, body, FORMATS.ANTIGRAVITY);

    // OpenAI clients may include stream_options even for non-streaming calls.
    // Google generateContent rejects that combination before processing the request.
    if (stream !== true) delete body.stream_options;

    // ─── Image generation: completely different request structure ───
    if (isImageModel(model)) {
      const imageConfig = parseImageConfig(model);

      // Build simplified contents — text + inline images (image models accept
      // inlineData for edit/img2img; dropping them silently degrades to text2img)
      const contents = [];
      const srcContents = body.request?.contents || body.contents || [];
      for (const c of srcContents) {
        const parts = (c.parts || [])
          .filter(p => p.text !== undefined || p.inlineData?.data || p.inline_data?.data)
          .map(p => {
            if (p.text !== undefined) return { text: p.text };
            const d = p.inlineData || p.inline_data;
            return { inlineData: { mimeType: d.mimeType || d.mime_type || "image/png", data: d.data } };
          });
        if (parts.length > 0) {
          contents.push({ role: c.role || "user", parts });
        }
      }

      const sessionId = resolveSessionId({
        headers: credentials?.rawHeaders,
        body,
        connectionId: credentials?.email || credentials?.connectionId,
        scope: "antigravity",
      });

      this._lastSessionId = sessionId;
      const request = {
        contents,
        generationConfig: {
          temperature: 1.0,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: Math.min(readOutputTokenCap(body.request?.generationConfig || body.generationConfig, ["maxOutputTokens"]) ?? 8192, ANTIGRAVITY_MAX_OUTPUT_TOKENS),
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig,
        },
        sessionId,
        // No tools, no systemInstruction, no safetySettings for image gen
      };

      return {
        project: projectId,
        model: cleanModel,
        userAgent: "antigravity",
        requestType: "image_gen",
        requestId: buildIdeRequestId({ body, request, credentials, model: cleanModel, requestType: "image_gen" }),
        request,
      };
    }

    // ─── Standard (non-image) request ───
    const rawContents = body.request?.contents || [];
    const cleanedContents = [];
    const isClaudeOnAg = typeof cleanModel === "string" && cleanModel.startsWith("claude");

    // Google Antigravity wire protocol:
    //   - In Google Gemini API, tool results (functionResponse) are provided by the client/user.
    //   - functionResponse turns MUST use role: "user". Setting role: "model" collapses
    //     multi-turn tool histories and causes Google to reject with:
    //     "Requests ending with a model turn are not supported." (INVALID_ARGUMENT 400).
    const functionResponseRole = "user";
    // Official documented bypass sentinel (Google Cloud Code / Antigravity):
    // "skip_thought_signature_validator" is accepted verbatim by the server.
    const isAcceptedSignature = (sig) =>
      typeof sig === "string" && (sig === "skip_thought_signature_validator" || isValidBase64(sig));

    for (const c of rawContents) {
      let role = c.role;
      if (c.parts?.some(p => p.functionResponse)) {
        role = functionResponseRole;
      }

      const validParts = (c.parts || [])
        .filter(p => {
          if (p.thought && !p.functionCall) return false;
          if (p.thoughtSignature && !p.functionCall && !p.text &&
              Object.keys(p).every(key => key === "thoughtSignature" || key === "thought" || key === "text")) return false;
          if (p.text === "") return false;
          return true;
        })
        .map(p => {
          if (p.functionCall) {
            const hasValidSig = isAcceptedSignature(p.thoughtSignature);
            return {
              ...p,
              thoughtSignature: hasValidSig ? p.thoughtSignature : DEFAULT_THINKING_AG_SIGNATURE
            };
          }
          if (p.thoughtSignature && !isAcceptedSignature(p.thoughtSignature)) {
            return { ...p, thoughtSignature: DEFAULT_THINKING_AG_SIGNATURE };
          }
          return p;
        });

      if (validParts.length > 0) {
        cleanedContents.push({ role, parts: validParts });
      }
    }

    const mergedContents = normalizeGeminiContents(cleanedContents, cleanModel, { ensureUserTurns: false });
    if (mergedContents.length === 0) {
      mergedContents.push({ role: "user", parts: [{ text: "..." }] });
    }

    // Legacy routes keep their terminal-user compatibility guard. Gemini 4
    // retains the caller's pending tool handoff instead of inventing success.
    if (!isGemini4Model(cleanModel) && mergedContents.length > 0 && mergedContents.at(-1).role === "model") {
      const fnCalls = (mergedContents.at(-1).parts || []).filter(p => p && p.functionCall);
      if (fnCalls.length > 0) {
        const responses = fnCalls.map(p => {
          const call = p.functionCall || {};
          const fr = {
            name: call.name || "tool",
            response: { result: "Continue." }
          };
          if (call.id) fr.id = call.id;
          return { functionResponse: fr };
        });
        mergedContents.push({ role: "user", parts: responses });
      } else {
        mergedContents.push({ role: "user", parts: [{ text: "Continue." }] });
      }
    }

    const contents = mergedContents;

    // Sanitize tool schemas and function names before sending to Antigravity.
    let tools = body.request?.tools;

    if (tools && tools.length > 0) {
      // Merge all groups into a single functionDeclarations group (Gemini expects 1 group)
      const seenToolNames = new Set();
      const allDeclarations = [];
      for (const group of tools) {
        for (const fn of group.functionDeclarations || []) {
          const name = sanitizeFunctionName(fn.name);
          if (seenToolNames.has(name)) continue;
          seenToolNames.add(name);
          allDeclarations.push({
            ...fn,
            name,
            parameters: fn.parameters
              ? cleanJSONSchemaForAntigravity(structuredClone(fn.parameters))
              : { type: "object", properties: { reason: { type: "string", description: "Brief explanation" } }, required: ["reason"] }
          });
        }
      }
      // Google Antigravity TPU prefix cache: slices into individual { functionDeclarations: [decl] }
      // objects rather than merging all declarations into one array (HAR_NATIVE_PROTOCOL_ALIGNMENT: 100%).
      tools = allDeclarations.length > 0
        ? allDeclarations.map((decl) => ({ functionDeclarations: [decl] }))
        : [];
    }

    // Strip tools/toolConfig (handled separately) and blacklisted fields that Google rejects
    const { tools: _originalTools, toolConfig: _originalToolConfig, ...requestWithoutTools } = body.request || {};
    stripBlacklisted(requestWithoutTools);
    
    // Rewrite competing-client branding in system prompts (e.g. Zed's Claude prompt,
    // OpenCode naming) so Antigravity doesn't flag the request with a 429 Quota Exhausted.
    if (requestWithoutTools.systemInstruction?.parts) {
      for (const part of requestWithoutTools.systemInstruction.parts) {
        if (typeof part.text !== "string") continue;
        for (const { from, to } of ANTIGRAVITY_PROMPT_REWRITES) {
          part.text = part.text.replaceAll(from, to);
        }
        if (typeof part.text === "string") {
          part.text = sanitizeAntigravitySystemPrompt(part.text);
        }
      }
    }

    const generationConfig = { ...(requestWithoutTools.generationConfig || {}) };
    const outputCap = readOutputTokenCap(generationConfig, ["maxOutputTokens"]);
    if (outputCap !== undefined) {
      generationConfig.maxOutputTokens = Math.min(outputCap, ANTIGRAVITY_MAX_OUTPUT_TOKENS);
    }

    const nativeThinking = generationConfig.thinkingConfig;
    if (nativeThinking?.thinkingBudget === undefined && nativeThinking?.thinkingLevel === undefined) {
      const thinkingIntent = captureThinking(body) || captureThinking(body.request);
      if (thinkingIntent) {
        const thinkingBody = { generationConfig: { ...generationConfig } };
        const context = getThinkingContext(body);
        if (context) thinkingIntent.requestedModel = context.requestedModel;
        applyThinking(FORMATS.ANTIGRAVITY, cleanModel, thinkingBody, this.provider, thinkingIntent);
        const appliedContext = getThinkingContext(thinkingBody);
        if (appliedContext) setThinkingContext(body, appliedContext);
        // Keep this executor's output defaults and final budget/cap reconciliation.
        if (thinkingBody.generationConfig.thinkingConfig) {
          generationConfig.thinkingConfig = thinkingBody.generationConfig.thinkingConfig;
        }
      }
    }

    // A normalized native config wins over compatibility effort fields. Levels
    // are qualitative; dynamic (-1) and disabled (0) are not positive budgets.
    const thinkingConfig = generationConfig.thinkingConfig;
    let thinkingBudget = thinkingConfig?.thinkingBudget ?? body?.thinking?.budget_tokens ?? body?.thinking_budget;
    const thinkingContext = getThinkingContext(body);
    const explicitBudget = thinkingContext?.explicitBudget ?? (thinkingBudget !== undefined);
    const capParam = thinkingContext?.outputParam || "request.generationConfig.maxOutputTokens";

    if (thinkingConfig?.thinkingLevel === undefined && thinkingBudget !== undefined) {
      if (!Number.isSafeInteger(thinkingBudget) || thinkingBudget < -1) {
        const error = new Error("thinkingBudget must be an integer at least -1");
        error.code = "invalid_thinking_budget";
        error.param = "request.generationConfig.thinkingConfig.thinkingBudget";
        throw error;
      }
      if (thinkingBudget > 0) {
        // Headroom is an omitted-cap default, never permission to raise a cap.
        if (outputCap === undefined) {
          generationConfig.maxOutputTokens = Math.min(ANTIGRAVITY_MAX_OUTPUT_TOKENS, thinkingBudget + 8192);
        }
        const minimumBudget = /(^|\/)claude/.test(cleanModel) ? CLAUDE_MIN_THINKING_BUDGET : 1;
        if (thinkingBudget < minimumBudget) {
          const error = new Error(`The selected thinking budget must be at least ${minimumBudget} tokens; increase it or set thinkingBudget to 0 to disable thinking.`);
          error.code = "invalid_thinking_budget";
          error.param = "request.generationConfig.thinkingConfig.thinkingBudget";
          throw error;
        }
        const selectedMinimum = explicitBudget ? thinkingBudget : minimumBudget;
        if (generationConfig.maxOutputTokens <= selectedMinimum) {
          throw thinkingBudgetError(selectedMinimum, generationConfig.maxOutputTokens, capParam, "set thinkingBudget to 0 to disable thinking");
        }
        if (!explicitBudget) thinkingBudget = Math.min(thinkingBudget, generationConfig.maxOutputTokens - 1);
      }
      generationConfig.thinkingConfig = {
        ...thinkingConfig,
        thinkingBudget,
        includeThoughts: thinkingConfig?.includeThoughts ?? true,
      };
    }

    const transformedRequest = {
      ...requestWithoutTools,
      generationConfig,
      ...(contents && { contents }),
      ...(tools && { tools }),
      sessionId: body.request?.sessionId || resolveSessionId({ headers: credentials?.rawHeaders, body, connectionId: credentials?.email || credentials?.connectionId, scope: "antigravity" }),
      safetySettings: undefined,
      ...(tools?.length > 0 && { toolConfig: { functionCallingConfig: { mode: "VALIDATED" } } })
    };

    // Strip outbound-only fields without erasing intent reused on retries/refresh.
    const outboundBody = { ...body };
    // Native chat envelopes may carry a legacy bucket; image/search use separate paths.
    delete outboundBody.requestType;
    stripBlacklisted(outboundBody);

    const cleanedBody = stripHarnessTelemetry(outboundBody);
    const cleanedRequest = stripHarnessTelemetry(transformedRequest);

    this._lastSessionId = cleanedRequest.sessionId; // cached for buildHeaders (base.execute order)

    // Omit top-level requestType="agent" to prevent false upstream 429 quota exhaustion (#3986)
    const result = {
      ...cleanedBody,
      project: projectId,
      model: cleanedBody.model || model,
      userAgent: "antigravity",
      requestId: buildIdeRequestId({ body: cleanedBody, request: cleanedRequest, credentials, model, requestType: "agent" }),
      request: cleanedRequest
    };
    if (thinkingContext) setThinkingContext(result, thinkingContext);
    return result;
  }

  async refreshCredentials(credentials, log, proxyOptions = null, signal = null) {
    signal?.throwIfAborted();
    if (!credentials.refreshToken) return null;

    try {
      const response = await proxyAwareFetch(OAUTH_ENDPOINTS.google.token, {
        signal,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: credentials.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        })
      }, proxyOptions);

      if (!response.ok) return null;

      const tokens = await response.json();
      log?.info?.("TOKEN", "Antigravity refreshed");

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || credentials.refreshToken,
        expiresIn: tokens.expires_in,
        projectId: credentials.projectId
      };
    } catch (error) {
      signal?.throwIfAborted();
      log?.error?.("TOKEN", `Antigravity refresh error: ${error.message}`);
      return null;
    }
  }

  generateProjectId() {
    const adj = ["useful", "bright", "swift", "calm", "bold"][Math.floor(Math.random() * 5)];
    const noun = ["fuze", "wave", "spark", "flow", "core"][Math.floor(Math.random() * 5)];
    return `${adj}-${noun}-${crypto.randomUUID().slice(0, 5)}`;
  }

  generateSessionId() {
    return crypto.randomUUID() + Date.now().toString();
  }

  parseRetryHeaders(headers) {
    if (!headers?.get) return null;

    const retryAfter = headers.get('retry-after');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds) && seconds > 0) return seconds * 1000;

      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        const diff = date.getTime() - Date.now();
        return diff > 0 ? diff : null;
      }
    }

    const resetAfter = headers.get('x-ratelimit-reset-after');
    if (resetAfter) {
      const seconds = parseInt(resetAfter, 10);
      if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
    }

    const resetTimestamp = headers.get('x-ratelimit-reset');
    if (resetTimestamp) {
      const ts = parseInt(resetTimestamp, 10) * 1000;
      const diff = ts - Date.now();
      return diff > 0 ? diff : null;
    }

    return null;
  }

  // Parse retry time from Antigravity error message body
  // Format: "Your quota will reset after 2h7m23s" or "1h30m" or "45m" or "30s"
  parseRetryFromErrorMessage(errorMessage) {
    if (!errorMessage || typeof errorMessage !== "string") return null;

    const match = errorMessage.match(/reset after (\d+h)?(\d+m)?(\d+s)?/i);
    if (!match) return null;

    let totalMs = 0;
    if (match[1]) totalMs += parseInt(match[1]) * 3600 * 1000; // hours
    if (match[2]) totalMs += parseInt(match[2]) * 60 * 1000; // minutes
    if (match[3]) totalMs += parseInt(match[3]) * 1000; // seconds

    return totalMs > 0 ? totalMs : null;
  }

  extractErrorMessage(errorJson, bodyText = "") {
    return [
      errorJson?.error?.message,
      errorJson?.message,
      errorJson?.error,
      bodyText,
    ].filter(Boolean).map(v => typeof v === "string" ? v : JSON.stringify(v)).join("\n");
  }

  isTransientAntigravityError(status, message) {
    if (status === HTTP_STATUS.RATE_LIMITED) return true;
    if (ANTIGRAVITY_TRANSIENT_STATUSES.has(status)) return true;
    return ANTIGRAVITY_TRANSIENT_ERROR_PATTERNS.some(pattern => pattern.test(message || ""));
  }

  // Parse Antigravity 429/409/403 errors to extract precise resetsAtMs for quota-aware routing
  parseError(response, bodyText, generic) {
    if ((response.status === HTTP_STATUS.RATE_LIMITED || response.status === HTTP_STATUS.CONFLICT || response.status === HTTP_STATUS.FORBIDDEN) && bodyText) {
      try {
        let errorJson = null;
        try {
          errorJson = JSON.parse(bodyText);
        } catch {}

        const errorMessage = this.extractErrorMessage(errorJson, bodyText);
        let retryMs = this.parseRetryHeaders(response.headers);
        if (!retryMs) {
          retryMs = this.parseRetryFromErrorMessage(errorMessage);
        }

        if (retryMs && retryMs > 0) {
          const resetsAtMs = Date.now() + retryMs;
          return { status: response.status, message: errorMessage || bodyText, resetsAtMs };
        }
      } catch { /* fall through to super */ }
    }
    return super.parseError(response, bodyText, generic);
  }

  // Hook called by BaseExecutor.tryRetry: derive delay from Retry-After (header → body),
  // cap at MAX_RETRY_AFTER_MS, else retry transient Antigravity failures with backoff.
  // Return false to veto (fallback URL / final error).
  async computeRetryDelay(response, attempt) {
    let bodyText = "";
    let errorJson = null;
    let retryMs = this.parseRetryHeaders(response.headers);

    try {
      bodyText = await response.clone().text();
      errorJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      // ignore parse errors → fall through to status/message based retry
    }

    const errorMessage = this.extractErrorMessage(errorJson, bodyText);

    if (!retryMs) {
      retryMs = this.parseRetryFromErrorMessage(errorMessage);
    }
    if (retryMs) return retryMs <= MAX_RETRY_AFTER_MS ? retryMs : false;

    if (!this.isTransientAntigravityError(response.status, errorMessage)) return false;

    const cap = response.status === HTTP_STATUS.RATE_LIMITED
      ? MAX_RETRY_AFTER_MS
      : ANTIGRAVITY_TRANSIENT_RETRY_MAX_MS;
    return Math.min(1000 * (2 ** attempt), cap); // exponential backoff
  }

  /**
   * Cloak tools before sending to Antigravity provider (anti-ban):
   * - Rename client tools with _ide suffix
   * - Inject AG default decoy tools after client tools
   * Returns { cloakedBody, toolNameMap } where toolNameMap maps suffixed → original
   */
  static cloakTools(body, clientTool = null) {
    const tools = body.request?.tools;
    if (!tools || tools.length === 0) {
      return { cloakedBody: body, toolNameMap: null };
    }

    const isCopilot = clientTool === "github-copilot";
    const toolNameMap = new Map();
    const clientDeclarations = [];
    const decoyNames = new Set(AG_DECOY_TOOLS.map(tool => tool.name));

    // First: collect renamed client tools
    for (const toolGroup of tools) {
      if (!toolGroup.functionDeclarations) continue;

      for (const func of toolGroup.functionDeclarations) {
        // For GitHub Copilot, avoid emitting duplicate native Antigravity tool names.
        // Keep the decoys only once in the final declaration list.
        if (isCopilot && AG_DEFAULT_TOOLS.has(func.name)) {
          continue;
        }

        // Skip if already covered by decoys for Copilot
        if (isCopilot && decoyNames.has(func.name)) {
          continue;
        }

        // Preserve native AG names for non-Copilot clients
        if (AG_DEFAULT_TOOLS.has(func.name)) {
          clientDeclarations.push(func);
          continue;
        }

        const suffixed = `${func.name}${AG_TOOL_SUFFIX}`;
        toolNameMap.set(suffixed, func.name);
        clientDeclarations.push({ ...func, name: suffixed });
      }
    }

    // Client tools first, then AG decoy tools
    const allDeclarations = [];
    const seenNames = new Set();
    for (const decl of [...clientDeclarations, ...AG_DECOY_TOOLS]) {
      if (!decl?.name || seenNames.has(decl.name)) continue;
      seenNames.add(decl.name);
      allDeclarations.push(decl);
    }

    // Rename tool names in conversation history (contents)
    const cloakedContents = body.request?.contents?.map(msg => {
      if (!msg.parts) return msg;
      
      const cloakedParts = msg.parts.map(part => {
        // Rename functionCall.name
        if (part.functionCall && !AG_DEFAULT_TOOLS.has(part.functionCall.name)) {
          return {
            ...part,
            functionCall: {
              ...part.functionCall,
              name: `${part.functionCall.name}${AG_TOOL_SUFFIX}`
            }
          };
        }
        
        // Rename functionResponse.name
        if (part.functionResponse && !AG_DEFAULT_TOOLS.has(part.functionResponse.name)) {
          return {
            ...part,
            functionResponse: {
              ...part.functionResponse,
              name: `${part.functionResponse.name}${AG_TOOL_SUFFIX}`
            }
          };
        }
        
        return part;
      });
      
      return { ...msg, parts: cloakedParts };
    });

    // Single functionDeclarations group: client tools first, then decoys
    return {
      cloakedBody: {
        ...body,
        request: {
          ...body.request,
          tools: [{ functionDeclarations: allDeclarations }],
          contents: cloakedContents || body.request.contents
        }
      },
      toolNameMap
    };
  }
}

// AG decoy tools — same names as AG native defaults, redirect to _ide suffixed tools
const AG_DECOY_TOOLS = [
  {
    name: "browser_subagent",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "command_status",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "find_by_name",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "generate_image",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "grep_search",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "list_dir",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "list_resources",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "mcp_sequential-thinking_sequentialthinking",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "multi_replace_file_content",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "notify_user",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "read_resource",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "read_terminal",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "read_url_content",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "replace_file_content",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "run_command",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "search_web",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "send_command_input",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "task_boundary",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "view_content_chunk",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "view_file",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "write_to_file",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  }
];

export default AntigravityExecutor;
