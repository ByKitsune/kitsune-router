import { getCapabilitiesForModel } from "../../providers/capabilities.js";
import { PROVIDERS } from "../../providers/index.js";
import { canonicalizeProviderId } from "../../providers/identity.js";
import { isGemini4Model } from "../../config/models.js";
import { FORMATS } from "../formats.js";
import { rejectClaudeAudio } from "./requestMedia.js";
import { antigravityOutputConfig } from "./structuredOutput.js";
import { normalizeChatReasoningAliases } from "./reasoningAliases.js";

// Model-specific request controls. Legacy strip rules retain their behavior;
// verified unsupported intent can be rejected explicitly before translation.

// OpenAI Chat Completions extension params that strict OpenAI-compatible endpoints
// reject as unknown fields — e.g. Groq 400 "property 'prompt_cache_key' is unsupported",
// Cerebras 422 (zed-industries/zed#36215). Default is to drop; a provider opts back in
// by declaring the named quirk in providers/registry/{id}.js (openai, azure, github,
// codex, grok-cli). Applied only on the Responses→Chat hop (see translator/index.js);
// Responses API bodies carry these natively and are never touched.
const CHAT_EXTENSION_PARAMS = [
  { key: "prompt_cache_key", preserveQuirk: "preservePromptCacheKey" },
];

const NATIVE_GOOGLE_FORMATS = new Set([FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.VERTEX, FORMATS.ANTIGRAVITY]);
const GEMINI4_SAMPLING_PATHS = [
  ["temperature"], ["top_p"], ["top_k"],
  ["generationConfig", "temperature"], ["generationConfig", "topP"], ["generationConfig", "topK"],
  ["request", "temperature"], ["request", "top_p"], ["request", "top_k"],
  ["request", "generationConfig", "temperature"], ["request", "generationConfig", "topP"], ["request", "generationConfig", "topK"],
];

// Each rule matches a provider/model and declares stripping or rejection.
// Rejection treats null/undefined as unset; legacy stripping is unchanged.
const STRIP_RULES = [
  // https://ai.google.dev/gemini-api/docs/latest-model: Gemini 4 ignores these
  // controls. Return an error rather than silently discard supplied intent.
  { match: isGemini4Model, checkProvider: provider => NATIVE_GOOGLE_FORMATS.has(provider), checkFormat: format => NATIVE_GOOGLE_FORMATS.has(format), reject: GEMINI4_SAMPLING_PATHS },
  // Legacy Claude models accept sampling controls; newer generations reject
  // them. Keep the restriction on those models rather than all Claude wires.
  { match: /claude-(?:(?:opus|sonnet|haiku)-(?:4[.-][7-9]|[5-9])|(?:fable|mythos)-)/i, drop: ["temperature", "top_p", "top_k"] },
  { provider: "openai", drop: ["top_k"] },
  { provider: "azure", drop: ["top_k"] },
  // GitHub Copilot GPT-5.4+ and GPT-6.x: temperature unsupported. Originally
  // gpt-5.4 only; the Responses route bypassed the chat-path filter entirely,
  // letting temperature through for gpt-6.1-sol and newer (9router #4706).
  // Boundaries: gpt-5.4 .. gpt-5.<any 2+ digits>, gpt-6.<digit>.*; gpt-5.3 and
  // below, gpt-4.x, gpt-7 keep temperature.
  { provider: "github", match: /^gpt-(?:5\.(?:[4-9]|[1-9]\d+)|6\.\d+)(?:-|$)/i, drop: ["temperature"] },
  // GitHub Copilot Claude (opus/sonnet 4.6, 4.7, 4.8, 5, 5.5): allow thinking + reasoning_effort; drop on older. #713
  { provider: "github", match: (m) => /claude/i.test(m) && !/claude.*(opus|sonnet).*(4\.[6-9]|5)/i.test(m), drop: ["thinking", "reasoning_effort"] },
  // Mistral rejects native thinking and replayed reasoning message fields (#4143).
  { provider: "mistral", drop: ["thinking"], dropMessageFields: ["reasoning_content", "reasoning"] },
  // Non-Anthropic stateless endpoints reject Claude's context_management;
  // native Responses has its own supported field of the same name.
  { match: () => true, checkProvider: (p) => p !== "claude", checkBody: body => !Object.hasOwn(body, "input"), drop: ["context_management"] },
  // Cloudflare Workers AI: content must be plain string, rejects OpenAI content-part array (#1926)
  { provider: "cloudflare-ai", flattenContent: true },
  { provider: "volcengine-ark", match: /glm-5/i, clampToModelMaxOutput: true },
  // VolcEngine Ark caps the Kimi family at max_tokens <= 32768, but the model's
  // advertised ceiling is far higher (Kimi-K2.7-Code resolves to maxOutput 262144),
  // so clampToModelMaxOutput alone leaves it uncapped and the request 400s with
  // "integer above maximum value, expected <= 32768". Pin an explicit endpoint cap;
  // min() with the model ceiling still applies if a variant's own limit is lower.
  { provider: "volcengine-ark", match: /kimi/i, maxOutputCap: 32768, clampToModelMaxOutput: true },
  // OpenCode zen /v1/responses endpoint (e.g. muse models) returns HTTP 400
  // when max_tokens is supplied — it derives the cap from reasoning_effort.
  { provider: "opencode", match: /muse/i, drop: ["max_tokens", "max_completion_tokens", "max_output_tokens"] },
  // OpenAI gpt-5.4-mini / newer models: max_tokens is deprecated and rejected with 400.
  // Translate max_tokens -> max_completion_tokens.
  // Must be provider-agnostic: gateways like openrouter/vercel also proxy gpt-5.4-mini (#3587).
  { provider: "openai", match: /gpt-5\.4-mini|gpt-5\.[4-9]|o1|o3/i, translateMaxTokens: true },
  { match: /gpt-5\.4-mini|gpt-5\.[4-9]|o1|o3/i, translateMaxTokens: true },
];

// Test a rule's match (regex or predicate) against the model id.
function matches(rule, model) {
  if (!rule.match) return true;
  return typeof rule.match === "function" ? rule.match(model) : rule.match.test(model);
}

// Check the source body before translation can rename or lose a control. Keep
// the client's original parameter path in the existing request-error contract.
export function validateSupportedParams(provider, model, body, targetFormat = null) {
  if (!model || !body || typeof body !== "object") return;
  const nativeProvider = canonicalizeProviderId(provider || targetFormat);
  const format = targetFormat || PROVIDERS[nativeProvider]?.format;
  // Runs before Core's legacy modality stripping as well as before conversion.
  // A model capability cannot create an audio block in Anthropic's wire schema.
  if (format === FORMATS.CLAUDE) rejectClaudeAudio(body);
  if (format === FORMATS.ANTIGRAVITY) antigravityOutputConfig(body, model);
  for (const rule of STRIP_RULES) {
    if (!rule.reject) continue;
    if (rule.provider && rule.provider !== nativeProvider) continue;
    if (rule.checkProvider && !rule.checkProvider(nativeProvider)) continue;
    if (rule.checkFormat && !rule.checkFormat(format)) continue;
    if (!matches(rule, model)) continue;
    for (const path of rule.reject) {
      let value = body;
      for (const key of path) value = value?.[key];
      if (value == null) continue;
      const param = path.join(".");
      const error = new Error(`This destination does not support ${param}; omit it or select a destination with a verified native mapping.`);
      error.code = "unsupported_parameter";
      error.param = param;
      throw error;
    }
  }
}

function clampNumber(body, key, ceiling) {
  if (typeof body[key] === "number" && Number.isFinite(body[key]) && body[key] > ceiling) {
    body[key] = ceiling;
  }
}

// Drop Chat Completions extension params for providers that do not declare support.
// Mutates body in place; fail-open (never throws); returns body.
export function stripUnsupportedChatExtensions(provider, body) {
  if (!body || typeof body !== "object") return body;
  try {
    const quirks = PROVIDERS[provider]?.quirks;
    for (const { key, preserveQuirk } of CHAT_EXTENSION_PARAMS) {
      if (quirks?.[preserveQuirk]) continue;
      if (body[key] !== undefined) delete body[key];
    }
  } catch {
    // fail-open: leave the body untouched
  }
  return body;
}

// Remove unsupported params from body in place; returns body.
export function stripUnsupportedParams(provider, model, body) {
  if (!model || !body || typeof body !== "object") return body;
  // Final Chat serialization also covers executors invoked without a translator.
  // Keep this mutating helper's contract while never editing caller messages.
  // Primary Claude wires never use this Chat alias contract. Multi-transport
  // Chat requests have already crossed filterToOpenAIFormat's explicit gate.
  const normalized = PROVIDERS[provider]?.format === FORMATS.CLAUDE
    ? body : normalizeChatReasoningAliases(body);
  if (normalized !== body) body.messages = normalized.messages;
  validateSupportedParams(provider, model, body);
  for (const rule of STRIP_RULES) {
    if (rule.provider && rule.provider !== provider) continue;
    if (rule.checkProvider && !rule.checkProvider(provider)) continue;
    if (rule.checkBody && !rule.checkBody(body)) continue;
    if (!matches(rule, model)) continue;
    for (const key of rule.drop || []) {
      if (body[key] !== undefined) delete body[key];
    }
    if (rule.dropMessageFields && Array.isArray(body.messages)) {
      for (const message of body.messages) {
        if (!message || typeof message !== "object") continue;
        for (const key of rule.dropMessageFields) delete message[key];
      }
    }
    if (rule.translateMaxTokens && body.max_tokens !== undefined) {
      const field = Object.hasOwn(body, "input") ? "max_output_tokens" : "max_completion_tokens";
      if (body[field] == null) body[field] = body.max_tokens;
      delete body.max_tokens;
    }
    // CF Workers AI oneOf root schema only accepts content as plain string (#1926, #4180)
    // and strictly requires each message to have both string 'role' and string 'content'.
    if (rule.flattenContent && Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        if (!msg || typeof msg !== "object") continue;
        if (msg.role === "tool") {
          msg.role = "user";
        }
        if (Array.isArray(msg.content)) {
          msg.content = msg.content
            .map((b) => {
              if (typeof b === "string") return b;
              if (typeof b?.text === "string") return b.text;
              if (typeof b?.input_text === "string") return b.input_text;
              if (typeof b?.content === "string") return b.content;
              if (Array.isArray(b?.content)) {
                return b.content.map((c) => (typeof c === "string" ? c : c?.text || "")).join("");
              }
              return "";
            })
            .join("");
        } else if (msg.content == null || typeof msg.content !== "string") {
          msg.content = "";
        }
      }
    }
    if (rule.clampToModelMaxOutput || Number.isFinite(rule.maxOutputCap)) {
      const modelCeiling = getCapabilitiesForModel(provider, model).maxOutput;
      const candidates = [];
      if (rule.clampToModelMaxOutput && Number.isFinite(modelCeiling) && modelCeiling > 0) {
        candidates.push(modelCeiling);
      }
      if (Number.isFinite(rule.maxOutputCap) && rule.maxOutputCap > 0) {
        candidates.push(rule.maxOutputCap);
      }
      if (candidates.length > 0) {
        const ceiling = Math.min(...candidates);
        clampNumber(body, "max_tokens", ceiling);
        clampNumber(body, "max_completion_tokens", ceiling);
        clampNumber(body, "max_output_tokens", ceiling);
      }
    }
  }
  return body;
}
