import { canonicalizeProviderId } from "./identity.js";

// Model capabilities — what each model can read/do beyond plain text.
//
// Fallback order (first match wins), result merged over DEFAULT_CAPABILITIES:
//   1. PROVIDER_CAPABILITIES[provider][model]  — provider-specific override
//   2. MODEL_CAPABILITIES[model]               — canonical exact id (handles exceptions)
//   3. PATTERN_CAPABILITIES                     — glob match, ordered specific -> generic
//   4. DEFAULT_CAPABILITIES                     — safe floor (always returned)
//
// Exact/provider facts remain authoritative. The synced catalog can fill missing
// modality facts for the same provider + literal model; explicit false is not
// absence. Pattern/default results also accept catalog limits and modality flags.
// The server installs that reader via setCatalogSource(), keeping this module
// browser-safe. Name-based vision detection remains a last resort only when
// neither a table nor the route catalog declares the vision flag.
//
// ── HOW TO ADD / UPDATE A MODEL ──────────────────────────────────────
// Authoritative data source: https://models.dev/api.json (145 providers, 4000+
// models, MIT). Each model exposes the exact fields we map below:
//   modalities.input  ["text","image","pdf","audio","video"] -> vision / pdf / audioInput / videoInput
//   modalities.output ["text","image","audio"]               -> imageOutput / audioOutput
//   reasoning   -> reasoning      tool_call    -> tools
//   limit.context -> contextWindow   limit.output -> maxOutput
// Look up the model id, then:
//   • If a PATTERN below already covers it correctly -> nothing to do.
//   • If it is an exception (pattern would mis-match) -> add an exact entry to
//     MODEL_CAPABILITIES (only the fields that differ from DEFAULT).
//   • If a whole new family -> add an ordered PATTERN (specific before generic).
// NOTE: models.dev has NO "search" flag (web search is a runtime tool, not a
// model spec); set `search` from vendor docs (Claude 4.x+, GPT-5.x/4o, Gemini
// 2.0+, Grok, Perplexity). Verify with: curl -s https://models.dev/api.json

import { matchPattern } from "./pricing.js";
import { applyReviewedCapabilities, getReviewedModelMetadata } from "./metadata/reviewed.js";
import { normalizeModelId } from "./models/schema.js";
import { looksLikeVisionModel } from "./visionPatterns.js";
import { isDocumentUnsupportedRoute } from "../config/documentConfig.js";

/**
 * Safe floor — every resolved result is merged over this so consumers
 * never need null-checks. Most modern LLMs meet these limits.
 */
export const DEFAULT_CAPABILITIES = {
  // input modalities
  vision: false,        // read images
  pdf: false,           // read PDF / documents
  audioInput: false,    // read audio
  videoInput: false,    // read video
  // output modalities
  imageOutput: false,   // generate images
  audioOutput: false,   // generate audio
  // features
  search: false,        // built-in web search tool / grounding
  tools: true,          // function / tool calling
  reasoning: false,     // thinking / reasoning
  // thinking wire format (only meaningful when reasoning:true). null → derive from transport.format.
  // enum: openai|claude-adaptive|claude-budget|gemini-level|gemini-budget|zai|qwen|deepseek|kimi|minimax|hunyuan|step
  thinkingFormat: null,
  thinkingCanDisable: true,  // false → model cannot turn thinking off (clamp to min instead of disable)
  thinkingRange: null,       // { min, max } for budget formats; null = no clamp
  thinkingEffortSupported: false, // explicit ordinal effort control; numeric thinking budgets are separate
  thinkingEfforts: null,    // exact supported ordinal values; null = not independently declared
  fixedThinkingEffort: null, // named tier cannot be overridden by a conflicting effort
  // limits (tokens)
  contextWindow: 200000,
  maxInput: null,       // unknown unless the provider documents a separate input ceiling
  maxOutput: 64000,
};

// User-added model metadata can carry dashboard service kinds instead of the
// runtime capability names used here. Map those typed model kinds into input /
// output capabilities so custom vision models are not treated as text-only.
const SERVICE_KIND_CAPABILITIES = {
  imageToText: { vision: true },
  image: { imageOutput: true },
  stt: { audioInput: true },
  tts: { audioOutput: true },
  embedding: { tools: false },
};

export function capabilitiesFromServiceKind(kind) {
  return SERVICE_KIND_CAPABILITIES[kind] || null;
}

/**
 * Canonical exact-id overrides — used for exceptions that patterns would
 * otherwise mis-match. Only declare deltas vs DEFAULT.
 */
export const MODEL_CAPABILITIES = {
  // Claude Fable 5.1, Opus 5.5, Opus 5, 4.6/4.7/4.8, Sonnet 5.5, and Kiro Sonnet 5 have 1M context + adaptive thinking (override generic claude pattern)
  "claude-fable-5-1": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-fable-5":   { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-5": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 },
  // Antigravity2 catalog ids (9router #4600/#4548): the (high|medium|low)
  // suffix is part of the upstream model id, not a thinking annotation.
  // Opus 5.5 rejects thinking.type "disabled" and forced tool_choice.
  "claude-opus-5-5-high": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-5-medium": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-5-low": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5-5-high": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5-5-medium": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5-5-low": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5.5": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-5-20260922": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-5-thinking": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-5-agentic": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-5-thinking-agentic": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 },
  // Sonnet 5.5 cannot fully disable thinking, but supports between-tools thinking;
  // its Messages API also rejects forced any/tool choices.
  "claude-sonnet-5-5": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5.5": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5-5-thinking": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5-5-agentic": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5-5-thinking-agentic": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5":     { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-thinking": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-agentic": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-thinking-agentic": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-4-5-20251101": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 200000, maxOutput: 64000 },
  "claude-opus-4-5": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 200000, maxOutput: 64000 },
  "claude-opus-4.5": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 200000, maxOutput: 64000 },
  "claude-opus-4.6":   { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-4-6":   { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-4.7":   { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-4-7":   { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-4.8":   { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-4-8":   { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-4.8-thinking": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-4-8-thinking": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-4.6": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-4-6": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-4.5": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 1000000, maxOutput: 64000 },
  "claude-sonnet-4-5": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 1000000, maxOutput: 64000 },
  "claude-sonnet-4":   { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 64000 },
  "claude-sonnet-5": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5-thinking": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5-agentic": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5-thinking-agentic": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-3-7-sonnet":          { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", thinkingRange: { min: 1024, max: 128000 }, contextWindow: 200000, maxOutput: 64000 },
  "claude-3-7-sonnet-thinking": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", thinkingRange: { min: 1024, max: 128000 }, contextWindow: 200000, maxOutput: 64000 },
  "claude-3.7-sonnet":          { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", thinkingRange: { min: 1024, max: 128000 }, contextWindow: 200000, maxOutput: 64000 },
  "claude-3.7-sonnet-thinking": { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", thinkingRange: { min: 1024, max: 128000 }, contextWindow: 200000, maxOutput: 64000 },
  "claude-3-7-sonnet[1m]":      { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", thinkingRange: { min: 1024, max: 128000 }, contextWindow: 1000000, maxOutput: 128000 },
  "claude-3.7-sonnet[1m]":      { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", thinkingRange: { min: 1024, max: 128000 }, contextWindow: 1000000, maxOutput: 128000 },
  // Gemini image-gen / OpenAI image / xai image variants
  "gpt-image-1":       { imageOutput: true, tools: false },

  // GLM vision variants (text GLM has no vision) — 5.3-Flash and 5V-Turbo are
  // natively multimodal per z.ai, and 5.3-Flash carries the full 1M window.
  "glm-5.3-flash":     { vision: true, videoInput: true, pdf: true, reasoning: true, thinkingFormat: "zai", contextWindow: 1000000, maxOutput: 131072 },
  "glm-4.6v":          { vision: true, videoInput: true, reasoning: true, thinkingFormat: "zai", contextWindow: 128000, maxOutput: 32768 },
  "glm-4.5v":          { vision: true, videoInput: true, reasoning: true, thinkingFormat: "zai", contextWindow: 64000, maxOutput: 16384 },

  // DeepSeek V4.1 Flash (official docs: context 1M, maxOutput 384K tokens, image input)
  "deepseek-flash": { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 },
  "deepseek-v4-flash": { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 },
  "deepseek-v4-flash-vision-exp": { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 },
  "deepseek-v4-1-flash": { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 },
  "deepseek-v4.1-flash": { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 },

  // Qwen plain coder/text (no vision) — registry "vision-model" / "coder-model" aliases
  "vision-model":      { vision: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000 },
  "coder-model":       { reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000 },
  "qwen3.8-max":       { vision: true, videoInput: true, pdf: true, reasoning: true, thinkingFormat: "qwen", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 },
  "qwen3.8-omni-flash": { vision: true, audioInput: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 131072 },

  // Google Antigravity agentic model alias (official: Gemini 3.1 Pro High)
  "gemini-pro-agent":  { vision: true, audioInput: true, videoInput: true, pdf: true, reasoning: true, search: true, thinkingFormat: "gemini-level", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 65536 },

  // MiniMax flagship (official: M3 context 1,000,000, maxOutput 524288, image + video input)
  "minimax-m3":        { vision: true, videoInput: true, reasoning: true, thinkingFormat: "minimax", contextWindow: 1000000, maxOutput: 524288 },
  "minimax-m2.5":      { reasoning: true, thinkingFormat: "minimax", thinkingCanDisable: false, contextWindow: 204800, maxOutput: 131072 },

  // Kimi flagship + coding (platform + Kimi Code ids) — vision/video native
  "kimi-k3":           { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 1048576 },
  "k3":                { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 1048576 },
  "kimi-for-coding":   { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: true, contextWindow: 1048576, maxOutput: 65536 },
  "kimi-for-coding-highspeed": { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: true, contextWindow: 1048576, maxOutput: 65536 },
  "kimi-k2.7-code":    { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 262144, maxOutput: 65536 },
  "kimi-k2.7-code-highspeed": { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 262144, maxOutput: 65536 },
  "kimi-k2.6":         { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", contextWindow: 262144, maxOutput: 262144 },
  // OpenCode Free Muse Spark — OpenAI Responses reasoning supports up to xhigh.
  "muse-spark-1.2-contributor-free": { vision: true, reasoning: true, thinkingFormat: "openai", contextWindow: 1048576, maxOutput: 131072 },
  "muse-spark-1.3-contributor-free": { vision: true, reasoning: true, thinkingFormat: "openai", contextWindow: 1048576, maxOutput: 131072 },
  // Cline Free Muse Spark 1.3 — cline provider ids carry the cline-free/ prefix (#3946).
  "cline-free/muse-spark-1.3-contributor": { vision: true, reasoning: true, thinkingFormat: "openai", contextWindow: 1048576, maxOutput: 131072 },

  // OpenAI Codex CLI models (official model info: 128k ctx / 32k output, multimodal image + document input)
  "gpt-5.3-codex-spark": { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 128000, maxOutput: 32000 },
  "gpt-5.3-codex-spark-review": { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 128000, maxOutput: 32000 },
  "gpt-5.3-codex": { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 400000, maxOutput: 128000 },
  "gpt-5.4-mini": { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 400000, maxOutput: 128000 },
  "gpt-5.4-nano": { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 400000, maxOutput: 128000 },
};

const KIRO_GPT_5_6_CAPABILITIES = { vision: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 272000, maxOutput: 128000 };

// Codex OAuth (ChatGPT backend) gateway policy.
//
// These numbers are the Codex CLI configuration ceilings (cliDefaultContext /
// cliMaxContext), NOT the backend model maximum. They are kept only as the
// *floor* for routes that cannot be verified, because the authoritative
// per-model facts now come from open-sse/providers/metadata/coreModels.js,
// which reports the API specification (1,050,000 ctx / 922,000 in / 128,000 out
// for the GPT-6 and GPT-5.6 families — cross-checked against models.dev's
// official OpenAI entries, Griphub's live /v1/models and 9router's patterns).
//
// Publishing the CLI ceiling as `context_length` under-reported the real window
// by 178k-778k tokens; a live probe served 902,486 tokens for a model advertised
// at 872,000 and 402,486 for one advertised at 272,000.
const CODEX_GPT_56_SOL_CAPS  = { vision: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 372000, maxOutput: 128000 };
const CODEX_GPT_56_DEFAULT_CAPS = { vision: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 272000, maxOutput: 128000 };
// The `[1m]` marker means "1M-context beta toggled on", so it must never report
// a SMALLER window than the base id it extends. It now mirrors the API maximum.
const CODEX_EXTENDED_CAPS = { ...CODEX_GPT_56_DEFAULT_CAPS, contextWindow: 1050000 };

/**
 * Provider-specific capability overrides. Keyed by provider alias/id.
 */
export const PROVIDER_CAPABILITIES = {
  // Antigravity (Google Cloud Code v1internal): Google's bridge limits Claude models
  // to 250,000 context tokens and 64,000 max output (verified via official_models.json
  // from fetchAvailableModels: maxTokens=250000, maxOutputTokens=64000). The bridge
  // also does not support PDF documents for Claude (application/pdf:false, images only).
  "antigravity": {
    "claude-sonnet-4-6":        { vision: true, pdf: false, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 250000, maxOutput: 64000 },
    "claude-sonnet-4.6":        { vision: true, pdf: false, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 250000, maxOutput: 64000 },
    "claude-opus-4-6-thinking": { vision: true, pdf: false, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 250000, maxOutput: 64000 },
    "claude-opus-4.6-thinking": { vision: true, pdf: false, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 250000, maxOutput: 64000 },
  },
  // NVIDIA NIM is OpenAI-compatible → rejects MiniMax/GLM native `thinking` field.
  // Force openai reasoning_effort format for its reasoning models. #issue
  "nvidia": {
    "minimaxai/minimax-m2.7": { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false },
    "minimaxai/minimax-m3": { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false },
    "z-ai/glm-5.2": { reasoning: true, thinkingFormat: "openai" },
    "deepseek-ai/deepseek-v4-pro": { reasoning: true, thinkingFormat: "openai" },
    "deepseek-ai/deepseek-v4-flash": { reasoning: true, thinkingFormat: "openai" },
  },
  // Codex deliberately has NO numeric entry here.
  //
  // This table is consulted BEFORE reviewed metadata, and an entry is merged
  // over DEFAULT_CAPABILITIES — so a partial entry (flags without numbers)
  // would silently publish the 200k default window instead of the real one,
  // while a stale numeric entry would override the corrected facts. The
  // authoritative limits for this provider live in
  // providers/metadata/coreModels.js (apiContextWindow 1,050,000 /
  // apiMaxInput 922,000 / apiMaxOutput 128,000 for the GPT-6 and GPT-5.6
  // families, cross-checked against models.dev, Griphub and 9router), and
  // PATTERN_CAPABILITIES covers ids that have no exact metadata record.
  "kiro": {
    "gpt-5.6-sol": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-terra": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-luna": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-sol-thinking": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-terra-thinking": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-luna-thinking": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-sol-agentic": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-terra-agentic": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-luna-agentic": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-sol-thinking-agentic": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-terra-thinking-agentic": KIRO_GPT_5_6_CAPABILITIES,
    "gpt-5.6-luna-thinking-agentic": KIRO_GPT_5_6_CAPABILITIES,
  },
  // CodeBuddy.cn — authoritative per-model metadata from the gateway's model
  // config (contextWindow=maxInputTokens, maxOutput=maxOutputTokens, vision=
  // supportsImages). Every model reasons via OpenAI-style reasoning_effort
  // (see registry thinkingFormat). `onlyReasoning` models can't turn thinking
  // off → thinkingCanDisable:false (clamped to minimal instead of disabled).
  // ── 2026-09-30 server product-config snapshot (9router #4614): maxOutput
  // values below are the server's maxOutputTokens, and thinking gating follows
  // its reasoning.canDisableThinking flag. ──
  "codebuddy-cn": {
    "glm-5.2":            { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 },
    "glm-5.1":            { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 48000 },
    // EOL — kept for backward-compat alias resolution; UI filters via deprecated flag in registry.
    // Capabilities remain so old combos still route (will 11102 at upstream, then fallback).
    "glm-5.0":            { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 48000 },
    "glm-5.0-turbo":      { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 48000 },
    // Absent from the server list since 2026-09-30; 64000 per the plugin-baked
    // fallback and the live server table (the old 38000 had no source and
    // truncated output). Deprecated in the registry, still resolvable here.
    "glm-5v-turbo":       { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 64000 },
    "glm-4.7":            { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 48000 },
    "minimax-m3":         { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 512000, maxOutput: 524288 },
    "minimax-m2.7":       { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 48000 },
    "kimi-k2.7":          { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 256000, maxOutput: 32000 },
    "kimi-k2.6":          { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 256000, maxOutput: 32000 },
    "kimi-k2.5":          { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 164000, maxOutput: 32000 },
    // kimi-k2.8-preview: the gateway only grants the 1M window when the request
    // opts in (this executor never does), so contextWindow is the server's
    // defaultLength (300000), not maxInputTokens (9router #4614).
    "kimi-k2.8-preview":  { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true, contextWindow: 300000, maxOutput: 131072 },
    "hy3-preview":        { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 192000, maxOutput: 64000 },
    // ── e014cb537 refresh: hy3 / hy4-preview / glm-5.3 / kimi-k3 family (CodeBuddy 2026-08-30 catalog) ──
    // hy3/hy3-x: 256K official (192K conservative, matches hy3-preview); hy4-preview: 1M official.
    // glm-5.3: 1M ctx / 131K out; glm-5.3-flash: 1M multimodal (docs.z.ai).
    // kimi-k3-1 maps to upstream "Kimi-K3" (same caps as kimi-k3 pattern, explicit for exact match).
    "hy3":                { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 192000, maxOutput: 64000 },
    "hy3-x":              { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 192000, maxOutput: 64000 },
    "hy4-preview":        { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 64000 },
    "hy4-preview-x":      { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 64000 },
    "glm-5.3":            { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 },
    "glm-5.3-flash":      { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 },
    "kimi-k3-1":          { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 256000, maxOutput: 1048576 },
    "deepseek-v4-pro":    { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 393216 },
    "deepseek-v4-flash":  { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 384000 },
    // deepseek-v4.1-flash replaced v4-flash on the 2026-09-30 list: maxOutput
    // 393216 (matching v4-pro) and published efforts low/high/max.
    "deepseek-v4.1-flash": { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 393216 },
    "deepseek-v3-2-volc": { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 96000, maxOutput: 32000 },
  },
  // Poolside Laguna — OpenAI-compatible, all reasoning-capable (32K max output).
  "poolside": {
    "laguna-s-2.1":  { reasoning: true, thinkingFormat: "openai", contextWindow: 1000000, maxOutput: 32000 },
    "laguna-xs-2.1": { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 32000 },
  },
  // Qoder — capability mapping for opaque internal IDs
  "qoder": {
    "ultimate":       { vision: true, reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 }, // Claude Opus 5
    "performance":    { vision: true, reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 }, // Claude Sonnet 5
    "dmodel":         { reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 65536 },  // DeepSeek-V4-Pro
    "dfmodel":        { reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 65536 },  // DeepSeek-V4-Flash
    "gmodel":         { reasoning: true, thinkingFormat: "zai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 },      // GLM-5.3
    "kmodel_latest":  { vision: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 65536 },      // Kimi-K3
    "kmodel":         { vision: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 256000, maxOutput: 65536 },  // Kimi-K2.7-Code
    "mmodel":         { reasoning: true, thinkingFormat: "minimax", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 512000 }, // MiniMax-M3
    "qmodel_latest":  { vision: true, reasoning: true, thinkingFormat: "qwen", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 65536 },  // Qwen3.7-Max
    "qmodel":         { vision: true, reasoning: true, thinkingFormat: "qwen", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 65536 },  // Qwen3.7-Plus
    "qmodel_38max":   { vision: true, reasoning: true, thinkingFormat: "qwen", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 65536 },      // Qwen3.8-Max
  },
};

PROVIDER_CAPABILITIES.cx = PROVIDER_CAPABILITIES.codex;

/**
 * Pattern fallback — glob (* = wildcard), matched case-insensitively and
 * anchored (^...$) so a pattern must match the full model id. ORDER MATTERS:
 * vision/specific variants first, text-only/generic families last, to avoid
 * a broad family pattern swallowing an exception (e.g. glm-4.6v vs glm-5).
 */
export const PATTERN_CAPABILITIES = [
  // ── OpenRouter stealth / OC preview (reasoning mandatory, no disable) (#3472)
  { pattern: "*ox-alpha*",         caps: { reasoning: true, tools: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*stealth/ox-alpha*", caps: { reasoning: true, tools: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*x-preview-f-free*", caps: { reasoning: true, tools: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*muse*spark*",       caps: { vision: true, reasoning: true, thinkingFormat: "openai", contextWindow: 1048576, maxOutput: 131072 } },

  // ── Claude (4.6+ = adaptive thinking; older/haiku = budget) ──────
  { pattern: "*claude*sonnet-5-5*", caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*sonnet-5.5*", caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-5-5*",   caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-5.5*",   caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-5*",     caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*sonnet-5*",   caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-4.8*",   caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-4-8*",   caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-4.7*",   caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-4-7*",   caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-4.6*",   caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-4-6*",   caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*sonnet-4.7*", caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*sonnet-4-7*", caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*sonnet-4.6*", caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*sonnet-4-6*", caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*sonnet-4*",   caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 1000000, maxOutput: 64000 } },
  { pattern: "*claude*opus-4*",     caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 200000, maxOutput: 64000 } },
  { pattern: "*claude*haiku*",      caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 200000, maxOutput: 64000 } },
  { pattern: "*claude*opus*",       caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*sonnet*",     caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 1000000, maxOutput: 64000 } },
  { pattern: "*claude*fable*",      caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*mythos*",     caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude-3*",          caps: { vision: true, pdf: true, tools: true, contextWindow: 200000 } },
  { pattern: "*claude*",            caps: { vision: true, pdf: true, tools: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 1000000, maxOutput: 64000 } },
  { pattern: "*[1m]*",              caps: { contextWindow: 1000000 } },
  { pattern: "*-1m*",               caps: { contextWindow: 1000000 } },

  // ── Gemini 4 Argon & generations (2.0+ multimodal + google_search grounding, 1M ctx) ─
  // Gemini 4 Argon sets an industry-leading 1M max output token headroom (blog.google 2026-09-30).
  { pattern: "*gemini-4*",      caps: { vision: true, pdf: true, audioInput: true, videoInput: true, reasoning: true, search: true, thinkingFormat: "gemini-level", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 1000000 } },
  { pattern: "*gemini*image*",  caps: { vision: true, pdf: true, imageOutput: true, contextWindow: 131072, maxOutput: 32768 } },
  { pattern: "*gemini-3.8*",    caps: { vision: true, pdf: true, audioInput: true, videoInput: true, reasoning: true, search: true, thinkingFormat: "gemini-level", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-3.7*",    caps: { vision: true, pdf: true, audioInput: true, videoInput: true, reasoning: true, search: true, thinkingFormat: "gemini-level", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-3*pro*",  caps: { vision: true, pdf: true, audioInput: true, videoInput: true, reasoning: true, search: true, thinkingFormat: "gemini-level", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-3*",      caps: { vision: true, pdf: true, audioInput: true, videoInput: true, reasoning: true, search: true, thinkingFormat: "gemini-level", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-2.5*",    caps: { vision: true, pdf: true, audioInput: true, videoInput: true, reasoning: true, search: true, thinkingFormat: "gemini-budget", thinkingRange: { min: 0, max: 24576 }, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-2*",      caps: { vision: true, pdf: true, audioInput: true, videoInput: true, search: true, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-1.5*",    caps: { vision: true, pdf: true, audioInput: true, videoInput: true, search: true, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-1-5*",    caps: { vision: true, pdf: true, audioInput: true, videoInput: true, search: true, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini*",        caps: { vision: true, pdf: true, search: true, contextWindow: 1048576 } },
  // Gemma 4 12B/26B/31B = 256K ctx (E2B/E4B edge models stay 128K via the generic pattern).
  { pattern: "*gemma-4-31b*",    caps: { vision: true, contextWindow: 256000 } },
  { pattern: "*gemma-4-26b*",    caps: { vision: true, contextWindow: 256000 } },
  { pattern: "*gemma-4-12b*",    caps: { vision: true, contextWindow: 256000 } },
  { pattern: "*gemma*",         caps: { vision: true, contextWindow: 128000 } },
  { pattern: "*nanobanana*",    caps: { vision: true, imageOutput: true } },

  // ── OpenAI GPT-6 Astra & Sol/Luna (flagship 2026, 1.05M ctx, 128k out, native image + document input) ─
  // thinkingCanDisable:false — upstream rejects reasoning_effort:"none"
  // (low/medium/high only, #4031); "none" is omitted so the default applies.
  { pattern: "*gpt-6-astra*",   caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1050000, maxOutput: 128000 } },
  { pattern: "*gpt-6.1*",       caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 1050000, maxOutput: 128000 } },
  { pattern: "*gpt-6-sol*",     caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 1050000, maxOutput: 128000 } },
  { pattern: "*gpt-6-luna*",    caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 1050000, maxOutput: 128000 } },
  { pattern: "*gpt-6*",         caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 1050000, maxOutput: 128000 } },
  { pattern: "*gpt-5.6*",       caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 1050000, maxOutput: 128000 } },
  { pattern: "*gpt-5.5*",       caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 1050000, maxOutput: 128000 } },
  { pattern: "*gpt-5.4-mini*",  caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 400000, maxOutput: 128000 } },
  { pattern: "*gpt-5.4-nano*",  caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 400000, maxOutput: 128000 } },
  { pattern: "*gpt-5.4*",       caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 1050000, maxOutput: 128000 } },

  // ── OpenAI GPT-5.x (vision + thinking + web search) ──────────────
  { pattern: "*gpt-5*image*",   caps: { imageOutput: true } },
  { pattern: "*gpt-5*codex*",   caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 400000, maxOutput: 128000 } },
  { pattern: "*gpt-5*",         caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 400000, maxOutput: 128000 } },
  { pattern: "*gpt-4o*",        caps: { vision: true, pdf: true, search: true, contextWindow: 128000, maxOutput: 16384 } },
  // models.dev's official OpenAI entry reports 1,047,576 for the GPT-4.1 family
  // (the vendor's exact figure), not a rounded 1,000,000. Under-reporting by
  // ~47k tokens is small but wrong, and this number is published to clients.
  { pattern: "*gpt-4.1*",       caps: { vision: true, pdf: true, contextWindow: 1047576, maxOutput: 32768 } },
  { pattern: "*gpt-4-turbo*",   caps: { vision: true, contextWindow: 128000 } },
  { pattern: "*gpt-4*",         caps: { contextWindow: 128000 } },
  { pattern: "*gpt-3.5*",       caps: { contextWindow: 16385, maxOutput: 4096 } },
  { pattern: "*gpt-oss*",       caps: { reasoning: true, thinkingFormat: "openai", contextWindow: 128000 } },

  // ── OpenAI o-series (reasoning, vision, pdf) ─────────────────────
  { pattern: "*o1-mini*",       caps: { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 100000 } },
  { pattern: "*o1*",            caps: { vision: true, pdf: true, reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 100000 } },
  { pattern: "*o3-mini*",       caps: { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 100000 } },
  { pattern: "*o3*",            caps: { vision: true, pdf: true, reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 100000 } },
  { pattern: "*o4*",            caps: { vision: true, pdf: true, reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 100000 } },

  // ── Grok (vision + Live Search + PDF) ────────────────────────────
  { pattern: "*grok*image*",    caps: { imageOutput: true } },
  { pattern: "*grok-code*",     caps: { reasoning: true, thinkingFormat: "openai", contextWindow: 256000 } },
  // Grok 4.7: 500k context, 500k max output (docs.x.ai)
  { pattern: "*grok-4.7*",      caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 500000, maxOutput: 500000 } },
  // Grok 4.6: 500k context, no documented text output limit (docs.x.ai/developers/grok-4-6)
  { pattern: "*grok-4.6*",      caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 500000 } },
  // Grok 4.5: 500k context, 500k max output
  { pattern: "*grok-4.5*",      caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 500000, maxOutput: 500000 } },
  // Grok 4.3: 1,000,000 context, 30,000 output (docs.x.ai)
  { pattern: "*grok-4.3*",      caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 1000000, maxOutput: 30000 } },
  { pattern: "*grok-4.20*",     caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 1000000, maxOutput: 30000 } },
  { pattern: "*grok-build-0.1*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 256000, maxOutput: 256000 } },
  { pattern: "*grok-4*",        caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 256000 } },
  { pattern: "*grok-3*",        caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 131072 } },
  { pattern: "*grok*",          caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 256000 } },

  // ── Qwen (3.5+ = native vision/video; coder & max = text-only; QwQ = thinking-only) ─
  { pattern: "*qwen3.8-omni*",  caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 131072 } },
  { pattern: "*qwen*vl*",       caps: { vision: true, pdf: true, videoInput: true, tools: true, reasoning: true, thinkingFormat: "qwen" } },
  { pattern: "*qwen*omni*",     caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 262144, maxOutput: 65536 } },
  // qwen3-coder-next is a 256K model, not 1M (Model Studio) — specific first.
  { pattern: "*qwen3-coder-next*", caps: { reasoning: true, thinkingFormat: "qwen", contextWindow: 262144 } },
  { pattern: "*qwen*coder*",    caps: { reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000 } },
  { pattern: "*qwen*max*",      caps: { reasoning: true, thinkingFormat: "qwen", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 } },
  { pattern: "*qwen3.5*",       caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 65536 } },
  { pattern: "*qwen3.6*",       caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 65536 } },
  { pattern: "*qwen3.7*",       caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 } },
  { pattern: "*qwen3.8-max*",   caps: { vision: true, videoInput: true, pdf: true, reasoning: true, thinkingFormat: "qwen", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 } },
  { pattern: "*qwen3.8*",       caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 131072 } },
  { pattern: "*qwen*plus*",     caps: { vision: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 131072 } },
  { pattern: "*qwen*235b*",     caps: { reasoning: true, thinkingFormat: "qwen", contextWindow: 262144 } },
  { pattern: "*qwq*",           caps: { reasoning: true, thinkingFormat: "qwen", thinkingCanDisable: false, contextWindow: 131072 } },
  { pattern: "*qwen*",          caps: { reasoning: true, thinkingFormat: "qwen", contextWindow: 262144 } },

  // ── LongCat (Meituan; seen via OpenCode free tier) ───────────────
  // Reasons but previously matched nothing, landing on DEFAULT_CAPABILITIES
  // (~32k ctx). ~650k context verified live (9router #4514).
  { pattern: "*longcat-2.5*",   caps: { reasoning: true, contextWindow: 650000 } },

  // ── Kimi (enabled→reasoning_effort; K2.7-code cannot disable) ─────
  { pattern: "*kimi*k3*",       caps: { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 1048576 } },
  { pattern: "*kimi*for-coding*", caps: { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: true, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*kimi*k2.7*",     caps: { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 262144, maxOutput: 65536 } },
  { pattern: "*kimi*k2.6*",     caps: { vision: true, pdf: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", contextWindow: 262144, maxOutput: 262144 } },
  { pattern: "*kimi*k2*",       caps: { vision: true, reasoning: true, thinkingFormat: "kimi", contextWindow: 262144, maxOutput: 262144 } },
  { pattern: "*kimi*",          caps: { reasoning: true, thinkingFormat: "kimi", contextWindow: 262144 } },

  // ── GLM / Z.ai (thinking.enabled; disable via enable_thinking:false) ─
  // reasoning_effort is only read by z.ai from GLM-5.2 onward (docs.z.ai/guides/capabilities/thinking) —
  // older GLM (4.x, 5.0, 5.1, 5-turbo, 5v-turbo) ignore it, so gate it per exact version, not the "*glm-5*" catch-all.
  // GLM-5.3-Flash (multimodal) on top so it overrides text-only GLM-5.3
  { pattern: "*glm-5.3-flash*", caps: { vision: true, videoInput: true, pdf: true, reasoning: true, thinkingFormat: "zai", thinkingEffortSupported: true, thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 } },
  { pattern: "*glm-5.3*",       caps: { reasoning: true, thinkingFormat: "zai", thinkingEffortSupported: true, thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 } },
  { pattern: "*glm-5.2*",       caps: { reasoning: true, thinkingFormat: "zai", thinkingEffortSupported: true, contextWindow: 1000000, maxOutput: 131072 } },
  { pattern: "*glm-5*",         caps: { reasoning: true, thinkingFormat: "zai", contextWindow: 204800, maxOutput: 131072 } },
  { pattern: "*glm-4.7*",       caps: { reasoning: true, thinkingFormat: "zai", contextWindow: 204800, maxOutput: 131072 } },
  { pattern: "*glm-4.6*",       caps: { reasoning: true, thinkingFormat: "zai", contextWindow: 204800, maxOutput: 131072 } },
  { pattern: "*glm-4.5*",       caps: { reasoning: true, thinkingFormat: "zai", contextWindow: 131072, maxOutput: 98304 } },
  { pattern: "*glm-4*",         caps: { reasoning: true, thinkingFormat: "zai", contextWindow: 200000 } },
  { pattern: "*glm*",           caps: { reasoning: true, thinkingFormat: "zai", contextWindow: 200000 } },

  // ── DeepSeek (thinking.enabled + reasoning_effort; r1 = thinking-only) ─
  // DeepSeek V4.1 Flash has native multimodal/vision (1M context / 384k output)
  { pattern: "*deepseek-v4.1*", caps: { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 } },
  { pattern: "*deepseek-v4-1*", caps: { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 } },
  { pattern: "*deepseek-v4*vision*", caps: { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 } },
  { pattern: "*deepseek-v4*",   caps: { reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 } },
  { pattern: "*reasoner*",      caps: { reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 128000, maxOutput: 65536 } },
  { pattern: "*deepseek-r*",    caps: { reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 128000, maxOutput: 65536 } },
  { pattern: "*deepseek-chat*", caps: { contextWindow: 128000, maxOutput: 65536 } },
  { pattern: "*deepseek*",      caps: { reasoning: true, thinkingFormat: "deepseek", contextWindow: 128000, maxOutput: 65536 } },

  // ── MiniMax (M3 = adaptive; M2.x cannot disable) ─────────────────
  { pattern: "*minimax*image*", caps: { imageOutput: true } },
  { pattern: "*minimax-m3*",    caps: { vision: true, reasoning: true, thinkingFormat: "minimax", contextWindow: 1048576, maxOutput: 512000 } },
  { pattern: "*minimax-m2.7*",  caps: { reasoning: true, thinkingFormat: "minimax", thinkingCanDisable: false, contextWindow: 204800, maxOutput: 131072 } },
  { pattern: "*minimax*",       caps: { reasoning: true, thinkingFormat: "minimax", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 131072 } },

  // ── Xiaomi MiMo (vision, 1M / 262K ctx, deep thinking supported) ─
  { pattern: "*mimo*v2.6*",     caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*mimo*v2.5*",     caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*mimo*omni*",     caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, contextWindow: 262144, maxOutput: 131072 } },
  { pattern: "*mimo*",          caps: { vision: true, reasoning: true, contextWindow: 262144, maxOutput: 131072 } },

  // ── Llama (4 = vision/1M; 3.x = text-only/128K) ──────────────────
  { pattern: "*llama-4*",       caps: { vision: true, contextWindow: 1000000 } },
  { pattern: "*llama*",         caps: { contextWindow: 128000 } },

  // ── Mistral (Large 3 = vision/256K; Medium & Small latest = 256K + reasoning) ──
  // Ministral 3B is 131,072 while 8B/14B are 262,144 (models.dev mistral entries);
  // the generic `*mistral*` glob below would otherwise give all three 128,000.
  { pattern: "*ministral-3b*",  caps: { contextWindow: 131072 } },
  { pattern: "*ministral-8b*",  caps: { contextWindow: 262144 } },
  { pattern: "*ministral-14b*", caps: { contextWindow: 262144 } },
  { pattern: "*ministral*",     caps: { contextWindow: 262144 } },
  // Codestral latest is 256,000; the older codestral-2405 was 32,000. Use the
  // current published figure for the unversioned id.
  { pattern: "*codestral-latest*", caps: { contextWindow: 256000 } },
  { pattern: "*codestral*",     caps: { contextWindow: 128000 } },
  { pattern: "*pixtral*",       caps: { vision: true, pdf: true, contextWindow: 128000 } },
  { pattern: "*mistral-large*", caps: { vision: true, contextWindow: 256000 } },
  { pattern: "*mistral-medium*", caps: { vision: true, reasoning: true, contextWindow: 256000, maxOutput: 256000 } },
  { pattern: "*mistral-small*",  caps: { reasoning: true, contextWindow: 256000, maxOutput: 256000 } },
  { pattern: "*mistral*",       caps: { contextWindow: 128000 } },

  // ── Cohere (Command A Vision = vision; others text) ──────────────
  // Command A (Mar 2025) and A Reasoning are 256K, not 128K (docs.cohere.com/docs/models).
  { pattern: "*command-a-03-2025*", caps: { contextWindow: 256000 } },
  { pattern: "*command-a-reasoning*", caps: { reasoning: true, contextWindow: 256000 } },
  { pattern: "*command-a-vision*", caps: { vision: true, contextWindow: 128000 } },
  // The translate variant is a SMALL model: models.dev's official Cohere entry
  // reports 8,000, and it must be matched before the generic `*command-a*`
  // family glob below (which would give it 128,000 and over-promise ~16x).
  { pattern: "*command-a-translate*", caps: { contextWindow: 8000, maxOutput: 8000 } },
  { pattern: "*command*",       caps: { contextWindow: 128000 } },

  // ── Perplexity (web search native) ───────────────────────────────
  // Sonar Pro is 200K ctx (docs.perplexity.ai); base/reasoning/deep-research are 128K.
  { pattern: "*sonar-pro*",     caps: { search: true, contextWindow: 200000 } },
  { pattern: "*sonar*",         caps: { search: true, contextWindow: 128000 } },
  { pattern: "*pplx*",          caps: { search: true, contextWindow: 128000 } },
  { pattern: "*perplexity*",    caps: { search: true, contextWindow: 128000 } },

  // ── Poolside Laguna (resellers: openrouter/nvidia/kilocode/vercel/...) ──
  // Free tiers cap S 2.1 well below the paid 1M window → match the free suffix
  // (":free" or "-free", depending on reseller) before the plain id.
  { pattern: "*laguna-s-2.1*free*", caps: { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 32000 } },
  { pattern: "*laguna-s-2.1*",  caps: { reasoning: true, thinkingFormat: "openai", contextWindow: 1000000, maxOutput: 32000 } },
  { pattern: "*laguna*",        caps: { reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 32000 } },

  // ── Others ───────────────────────────────────────────────────────
  { pattern: "*hunyuan*",       caps: { reasoning: true, thinkingFormat: "hunyuan", contextWindow: 262144, maxOutput: 262144 } },
  { pattern: "hy3*",            caps: { reasoning: true, thinkingFormat: "hunyuan", contextWindow: 262144, maxOutput: 262144 } },
  // ByteDance Doubao-Seed 2.x: 256K in / 128K out (Volcengine Ark / BytePlus).
  { pattern: "*doubao-seed*",   caps: { vision: true, reasoning: true, search: true, contextWindow: 262144, maxOutput: 131072 } },
  { pattern: "*seed-2*",        caps: { vision: true, reasoning: true, search: true, contextWindow: 262144, maxOutput: 131072 } },
  // Baidu ERNIE (Qianfan): 5.x 128K/64K class; X1 smaller.
  { pattern: "*ernie-5*",       caps: { vision: true, reasoning: true, search: true, contextWindow: 131072, maxOutput: 65536 } },
  { pattern: "*ernie-4*",       caps: { vision: true, reasoning: true, search: true, contextWindow: 131072, maxOutput: 65536 } },
  { pattern: "*ernie-x1*",      caps: { reasoning: true, contextWindow: 65536, maxOutput: 65536 } },
  { pattern: "*ernie*",         caps: { reasoning: true, contextWindow: 131072, maxOutput: 65536 } },
  { pattern: "*step-3.7*",      caps: { vision: true, reasoning: true, thinkingFormat: "step", contextWindow: 128000 } },
  { pattern: "*step-*",         caps: { reasoning: true, thinkingFormat: "step", contextWindow: 128000 } },
  { pattern: "*nemotron*",      caps: { reasoning: true, contextWindow: 128000 } },
  { pattern: "*ling-*",         caps: { reasoning: true, contextWindow: 128000 } },
];

/**
 * Aggregate capabilities for a combo from its constituent model IDs.
 * Each entry in comboModels is a fully-qualified "provider/model" string.
 *
 * Union:        vision, pdf, audioInput, videoInput, imageOutput, audioOutput, search
 * Intersection: tools
 * Primary:      reasoning fields from the first (primary) model
 * Conservative: contextWindow = min; maxOutput = max
 *
 * @param {string[]} comboModels
 * @param {Object|null} [comboLookup] optional map of combo name → models array for nested resolution
 * @param {Function|null} [resolveCaps] optional (fullId) → caps override. The synced model
 *   catalog is server-only (it reads a file), so a browser-side resolution cannot see the
 *   limits it supplies and silently falls back to the generic patterns below. Callers that
 *   have the server's answer (/api/models, via useModelCaps) pass it here; it is merged over
 *   the local tables, so fields it does not carry (tools, pdf, audio/video, thinking*) survive.
 * @param {number} [_depth] internal recursion depth guard
 * @returns {object|null} full capabilities object, or null for empty input
 */
export function aggregateComboCapabilities(comboModels, comboLookup = null, resolveCaps = null, _depth = 0) {
  if (!comboModels?.length || _depth > 6) return null;
  const allCaps = comboModels.map((fullId) => {
    // Nested combo: bare name (no slash) that exists in the lookup — recurse
    if (!fullId.includes("/") && comboLookup?.[fullId]) {
      return aggregateComboCapabilities(comboLookup[fullId], comboLookup, resolveCaps, _depth + 1)
          ?? resolveCaps?.(fullId)
          ?? getCapabilitiesForModel(null, fullId);
    }
    const slash = fullId.indexOf("/");
    const provider = slash === -1 ? null : fullId.slice(0, slash);
    const model = slash === -1 ? fullId : fullId.slice(slash + 1);
    const local = getCapabilitiesForModel(provider, model);
    const override = resolveCaps?.(fullId);
    return override ? { ...local, ...override } : local;
  });
  const first = allCaps[0];
  return {
    vision:      allCaps.some((c) => c.vision),
    pdf:         allCaps.some((c) => c.pdf),
    audioInput:  allCaps.some((c) => c.audioInput),
    videoInput:  allCaps.some((c) => c.videoInput),
    imageOutput: allCaps.some((c) => c.imageOutput),
    audioOutput: allCaps.some((c) => c.audioOutput),
    search:      allCaps.some((c) => c.search),
    tools:       allCaps.every((c) => c.tools),
    reasoning:          first.reasoning,
    thinkingFormat:     first.thinkingFormat,
    thinkingCanDisable: first.thinkingCanDisable,
    thinkingRange:      first.thinkingRange,
    contextWindow: allCaps.every((c) => Number.isFinite(c.contextWindow) && c.contextWindow > 0)
      ? Math.min(...allCaps.map((c) => c.contextWindow)) : null,
    maxOutput: allCaps.every((c) => Number.isFinite(c.maxOutput) && c.maxOutput > 0)
      ? Math.max(...allCaps.map((c) => c.maxOutput)) : null,
  };
}

/**
 * Resolve capabilities for a model using the 4-step fallback chain,
 * merged over DEFAULT_CAPABILITIES so the result is always complete.
 *
 * @param {string} provider
 * @param {string} model
 * @returns {object} full capabilities object
 */
const CATALOG_CAPABILITY_KEYS = ["vision", "pdf", "audioInput", "videoInput", "imageOutput", "audioOutput", "reasoning", "tools", "structuredOutput", "temperature"];
const CATALOG_LIMIT_KEYS = ["contextWindow", "maxInput", "maxOutput"];

// Presentation-only suffixes that name a variant of the *same* weights. A
// registry or client may append them to an id the tables know without the
// suffix ("claude-opus-4.7-thinking"), so the exact lookup retries with the
// suffix removed instead of falling through to a pattern that carries no
// limits (which silently reported 200k/64k for a 1M model).
const VARIANT_SUFFIXES = ["-thinking-agentic", "-thinking", "-agentic"];

function stripVariantSuffix(model) {
  for (const suffix of VARIANT_SUFFIXES) {
    if (model.length > suffix.length && model.endsWith(suffix)) {
      return model.slice(0, -suffix.length);
    }
  }
  return null;
}

// Catalog lookups, installed by the server at startup. Left as no-ops in the
// browser bundle, where there is no file to read.
//
// The server bundles this module into every route chunk that needs it, and each
// copy carries its own module state, so an install landing in the copy the
// startup hook imported stays invisible to the copy resolving requests. The slot
// lives on globalThis instead, and every read goes through it: caching it locally
// would keep a reader alive in other copies after setCatalogSource(null).
/**
 * Install the synced catalog reader (server only).
 * @param {{ getModalities: Function, getLimits: Function } | null} source
 */
export function setCatalogSource(source) {
  globalThis.__kitsuneRouterCatalogSource = source;
}

function getCatalogSource() {
  return globalThis.__kitsuneRouterCatalogSource ?? null;
}

// Fill missing exact facts; explicit table flags and ceilings remain authoritative.
// Patterns are fallback guesses; route-scoped catalog facts take precedence.
function refine(base, provider, model, exact = false) {
  const result = { ...DEFAULT_CAPABILITIES, ...base };
  const source = getCatalogSource();

  let visionDeclared = Object.hasOwn(base || {}, "vision");
  if (source) {
    const modalities = source.getModalities(provider, model);
    if (modalities) {
      for (const key of CATALOG_CAPABILITY_KEYS) {
        if (typeof modalities[key] === "boolean" && (!exact || !Object.hasOwn(base || {}, key))) {
          result[key] = modalities[key];
          if (key === "vision") visionDeclared = true;
        }
      }
    }

    const limits = source.getLimits(provider, model);
    if (limits) {
      for (const key of CATALOG_LIMIT_KEYS) {
        if (Number.isSafeInteger(limits[key]) && limits[key] > 0 && (!exact || !Object.hasOwn(base || {}, key))) {
          result[key] = limits[key];
        }
      }
    }
  }

  if (!exact && !visionDeclared && looksLikeVisionModel(model)) result.vision = true;

  return result;
}

// Native generateContent controls, not reseller/OAuth guarantees. Sources:
// ai.google.dev/gemini-api/docs/generate-content/thinking and
// cloud.google.com/vertex-ai/generative-ai/docs/thinking (2.5 budget ranges).
// Exact IDs avoid accidentally applying text-model controls to audio/image IDs.
const NATIVE_GEMINI_BUDGETS = {
  "gemini-2.5-pro": { thinkingRange: { min: 128, max: 32768 }, thinkingCanDisable: false },
  "gemini-2.5-flash-lite": { thinkingRange: { min: 512, max: 24576 }, thinkingCanDisable: true },
};
const NATIVE_GEMINI_LEVELS = {
  "gemini-3.1-pro-preview": ["low", "medium", "high"],
  "gemini-3.1-pro-preview-customtools": ["low", "medium", "high"],
  "gemini-3.7-flash": ["low", "medium", "high"],
  "gemini-3.8-flash": ["low", "medium", "high"],
};

// Copilot's Messages shim rejects budgeted thinking for this dotted ID
// (9Router f3e1f716). Keep all other route-specific facts from the catalog.
const GITHUB_ADAPTIVE_THINKING_MODELS = new Set(["claude-haiku-5.5"]);
const GITHUB_NO_FORCED_TOOL_CHOICE_MODELS = new Set(["claude-opus-5.5"]);

export function getCapabilitiesForModel(provider, model) {
  const baseline = resolveBaselineCapabilities(provider, model);
  const nativeProvider = canonicalizeProviderId(provider);
  const reviewed = applyReviewedCapabilities(baseline, provider, model);
  let caps = isDocumentUnsupportedRoute(nativeProvider, model) ? { ...reviewed, pdf: false } : reviewed;
  const modelId = typeof model === "string" ? model.split("/").pop().replace(/\([^()]+\)\s*$/, "").trim().toLowerCase() : "";
  if (nativeProvider === "github") {
    if (GITHUB_ADAPTIVE_THINKING_MODELS.has(modelId)) caps = { ...caps, thinkingFormat: "claude-adaptive" };
    if (GITHUB_NO_FORCED_TOOL_CHOICE_MODELS.has(modelId)) caps = { ...caps, forcedToolChoice: false };
  }
  if (nativeProvider !== "gemini" && nativeProvider !== "vertex") return caps;
  const budget = NATIVE_GEMINI_BUDGETS[model];
  const efforts = nativeProvider === "gemini" ? NATIVE_GEMINI_LEVELS[model] : undefined;
  return { ...caps, ...budget, ...(efforts ? { thinkingEfforts: efforts } : {}) };
}

function resolveBaselineCapabilities(provider, model) {
  if (!model) return { ...DEFAULT_CAPABILITIES };
  provider = canonicalizeProviderId(provider);

  // Canonical exact lookup strips vendor prefix: "anthropic/claude-opus-4.7" -> "claude-opus-4.7".
  const baseModel = model.includes("/") ? model.split("/").pop() : model;

  // Registry ids use dots for versions ("claude-sonnet-4.6") while clients and
  // sibling registries mix in dashes ("claude-sonnet-4-6"). The tables below
  // hold both spellings only partially, which made the resolved capability set
  // depend on spelling (a dash-spelled Sonnet 4.6 lost its 1M window and
  // adaptive thinking). Look the as-spelled id up first so dated ids keep their
  // exact table keys, then fall back to the normalized spelling.
  const normalizedModel = normalizeModelId(baseModel);
  // "-thinking"/"-agentic" base, for the exact lookups only. Provider tables
  // keep their own variant keys, so this is a fallback and never an override.
  const variantBase = stripVariantSuffix(baseModel);
  const variantNormalized = variantBase ? normalizeModelId(variantBase) : null;

  // 1. Provider-specific override
  if (provider) {
    const providerCaps = PROVIDER_CAPABILITIES[provider];
    for (const id of [model, baseModel, normalizedModel, variantBase, variantNormalized]) {
      if (id && providerCaps?.[id]) return refine(providerCaps[id], provider, model, true);
    }
  }

  // 2. Canonical exact
  for (const id of [model, baseModel, normalizedModel, variantBase, variantNormalized]) {
    if (id && MODEL_CAPABILITIES[id]) return refine(MODEL_CAPABILITIES[id], provider, model, true);
    const lower = id ? id.toLowerCase() : null;
    if (lower && lower !== id && MODEL_CAPABILITIES[lower]) {
      return refine(MODEL_CAPABILITIES[lower], provider, model, true);
    }
  }

  // 3. Pattern match (first match wins), refined by catalog + name heuristic
  for (const { pattern, caps } of PATTERN_CAPABILITIES) {
    if (matchPattern(pattern, baseModel) || matchPattern(pattern, model) || matchPattern(pattern, normalizedModel)) {
      return refine(caps, provider, model);
    }
  }

  // 4. Floor
  return refine(null, provider, model);
}

/**
 * Overlay operator-declared capabilities on top of a resolved base.
 *
 * A user who adds a model by hand in the dashboard can tick "vision" (or any
 * other capability) on the model card. That declaration lives in the kv
 * `customModels` record as a `caps` object. It is an explicit statement about a
 * model the operator knows first-hand, so it must beat the pattern-matched
 * guess in {@link getCapabilitiesForModel} — which only sees the model *name*
 * and therefore guesses from family patterns.
 *
 * Only known capability keys are honoured, so a stale or hand-edited kv row
 * cannot inject arbitrary fields into the API response.
 *
 * @param {object|null|undefined} base - capabilities from the static chain
 * @param {object|null|undefined} declared - operator-declared `caps` from kv
 * @param {string} provider - provider identity when the gateway has a native hard ceiling
 * @param {string} model - literal model identity for route-specific limits
 * @returns {object|null} merged capabilities with gateway output ceilings applied
 */
export function withDeclaredCapabilities(base, declared, provider, model) {
  let result = base ?? null;
  if (declared && typeof declared === "object") {
    const overlay = {};
    for (const key of Object.keys(DEFAULT_CAPABILITIES)) {
      if (Object.prototype.hasOwnProperty.call(declared, key) && declared[key] !== undefined) {
        overlay[key] = declared[key];
      }
    }
    if (Object.keys(overlay).length) result = { ...DEFAULT_CAPABILITIES, ...(base ?? {}), ...overlay };
  }
  if (isDocumentUnsupportedRoute(canonicalizeProviderId(provider), model) && result?.pdf !== false) {
    result = { ...result, pdf: false };
  }
  const ceiling = getReviewedModelMetadata(provider, model)?.limits?.gatewayMaxOutput;
  if (Number.isFinite(ceiling) && ceiling > 0 && Number.isFinite(result?.maxOutput) && result.maxOutput > ceiling) {
    return { ...result, maxOutput: ceiling };
  }
  return result;
}
