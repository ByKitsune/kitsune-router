// Unified thinking normalization: extract client intent → apply provider-native format.
// Config-driven: thinking format/limits come from capabilities.js + registry transport,
// never hardcoded per-model here. See .docs/thinking/plan.md MATRIX VI-A.

import { getCapabilitiesForModel } from "../../providers/capabilities.js";
import { getThinkingLevels } from "../../providers/thinkingLevels.js";
import { PROVIDERS } from "../../providers/index.js";
import { LEVEL_TO_BUDGET, budgetToLevel, effortToBudget, effortToThinkingLevel } from "./thinking.js";

// Map a target wire-format to its native thinking format (when capability has none).
const FORMAT_TO_NATIVE = {
  openai: "openai",
  "openai-responses": "openai",
  "openai-response": "openai",
  codex: "openai",
  claude: "claude-budget",
  gemini: "gemini-budget",
  "gemini-cli": "gemini-budget",
  vertex: "gemini-budget",
  antigravity: "gemini-budget",
  kiro: "kiro",
};

// Strip a trailing thinking suffix "model(value)" → "model" (no-op when absent).
export function stripThinkingSuffix(model) {
  if (typeof model !== "string") return model;
  const m = model.match(/^(.*)\([^()]+\)\s*$/);
  return m ? m[1].trim() : model;
}

// Parse model-name suffix "model(value)" → { cleanModel, override }.
// value: level name (high) | number (8192) | auto | none. null override when absent.
export function parseSuffix(model) {
  if (typeof model !== "string") return { cleanModel: model, override: null };
  const m = model.match(/^(.*)\(([^()]+)\)\s*$/);
  if (!m) return { cleanModel: model, override: null };
  const cleanModel = m[1].trim();
  const raw = m[2].trim().toLowerCase();
  if (raw === "none" || raw === "off") return { cleanModel, override: { mode: "none" } };
  if (raw === "auto") return { cleanModel, override: { mode: "auto" } };
  if (raw === "ultra") return { cleanModel, override: { mode: "level", level: raw } };
  if (/^\d+$/.test(raw)) return { cleanModel, override: { mode: "budget", budget: Number(raw) } };
  if (LEVEL_TO_BUDGET[raw] !== undefined) return { cleanModel, override: { mode: "level", level: raw } };
  return { cleanModel, override: null };
}

// Extract unified thinking intent from a request body (post-translation, mixed shapes).
// Returns { mode, budget?, level? } or null when no thinking intent present.
export function extractThinking(body) {
  if (!body || typeof body !== "object") return null;

  // Claude output_config.effort (explicit) — priority over adaptive thinking
  const oc = body.output_config?.effort;
  if (typeof oc === "string" && oc) {
    const e = oc.toLowerCase();
    if (e === "none" || e === "off") return { mode: "none" };
    if (e === "auto") return { mode: "auto" };
    return { mode: "level", level: e };
  }

  // OpenAI chat / Responses shape — check effort first (zai sends both thinking object and reasoning.effort)
  const effort = body.reasoning_effort ?? (typeof body.reasoning === "object" ? body.reasoning?.effort : null);
  if (typeof effort === "string" && effort) {
    const e = effort.toLowerCase();
    if (e === "none" || e === "off") return { mode: "none" };
    if (e === "auto") return { mode: "auto" };
    return { mode: "level", level: e };
  }

  // Claude shape
  const t = body.thinking;
  if (t && typeof t === "object") {
    if (t.type === "disabled") return { mode: "none" };
    if (t.type === "adaptive" || t.type === "enabled") {
      const budget = Number(t.budget_tokens);
      if (Number.isFinite(budget) && budget > 0) return { mode: "budget", budget };
      return { mode: "auto" };
    }
  }

  // Gemini shape (top-level, generationConfig, or request envelope)
  const tc = body.thinkingConfig || body.generationConfig?.thinkingConfig || body.request?.generationConfig?.thinkingConfig;
  if (tc && typeof tc === "object") {
    if (typeof tc.thinkingLevel === "string") return { mode: "level", level: tc.thinkingLevel.toLowerCase() };
    const tb = Number(tc.thinkingBudget);
    if (Number.isFinite(tb)) {
      if (tb === 0) return { mode: "none" };
      if (tb < 0) return { mode: "auto" };
      return { mode: "budget", budget: tb };
    }
  }

  // Qwen shape
  if (body.enable_thinking === false) return { mode: "none" };
  if (body.enable_thinking === true) {
    const tb = Number(body.thinking_budget);
    if (Number.isFinite(tb) && tb > 0) return { mode: "budget", budget: tb };
    return { mode: "auto" };
  }

  return null;
}

// Capture thinking intent from a body before format translation strips it.
// Besides the effort, records whether an OpenAI-shaped client wants the thinking
// text itself: Claude returns it only with thinking.display "summarized", a field
// OpenAI has no equivalent for, so the intent cannot survive translation on its own.
export function captureThinking(body) {
  const cfg = extractThinking(body);
  if (!cfg) return cfg;
  const display = cfg.mode === "none" ? undefined : openAIThinkingDisplay(body);
  const responsesReasoning = body.reasoning && typeof body.reasoning === "object"
    ? { ...body.reasoning } : undefined;
  return { ...cfg, ...(display ? { display } : {}), ...(responsesReasoning ? { responsesReasoning } : {}) };
}

function openAIThinkingDisplay(body) {
  // Responses API: reasoning.summary is the explicit request for reasoning text.
  if (body.reasoning && typeof body.reasoning === "object") {
    const summary = body.reasoning.summary;
    return typeof summary === "string" && summary && summary !== "none" ? "summarized" : undefined;
  }
  // Chat Completions has no summary knob. A client setting reasoning_effort is
  // asking for reasoning, and reasoning_content is how it would receive it.
  if (typeof body.reasoning_effort === "string") return "summarized";
  return undefined;
}

// Resolve thinking format: provider override > capability > derive(targetFormat).
const NATIVE_ONLY_FORMATS = new Set(["gemini-level", "gemini-budget", "claude-budget", "claude-adaptive", "kiro"]);

function resolveFormat(targetFormat, model, provider) {
  const providerFmt = provider ? PROVIDERS[provider]?.thinkingFormat : null;
  if (providerFmt) return providerFmt;
  const caps = getCapabilitiesForModel(provider, model);
  const isOpenAIWire = targetFormat === "openai" || targetFormat === "openai-responses";
  if (caps.thinkingFormat && !(isOpenAIWire && NATIVE_ONLY_FORMATS.has(caps.thinkingFormat))) {
    return caps.thinkingFormat;
  }
  return FORMAT_TO_NATIVE[targetFormat] || "openai";
}

// Convert unified config to a budget number (for budget-based formats).
function toBudget(cfg, range) {
  let budget;
  if (cfg.mode === "budget") budget = cfg.budget;
  else if (cfg.mode === "level") budget = effortToBudget(cfg.level);
  else if (cfg.mode === "auto") return -1;
  if (!Number.isFinite(budget)) return undefined;
  if (range) {
    if (range.min != null && budget < range.min) budget = range.min;
    if (range.max != null && budget > range.max) budget = range.max;
  }
  return budget;
}

// Convert unified config to a discrete level string.
function toLevel(cfg) {
  if (cfg.mode === "level") return cfg.level;
  if (cfg.mode === "budget") return budgetToLevel(cfg.budget) || "medium";
  if (cfg.mode === "auto") return "auto";
  return null;
}

function normalizeOpenAILevel(level, supportedLevels) {
  if (supportedLevels && !supportedLevels.includes(level)) {
    if (level === "xhigh" || level === "max" || level === "ultra") {
      if (supportedLevels.includes("max")) return "max";
      if (supportedLevels.includes("xhigh")) return "xhigh";
      if (supportedLevels.includes("high")) return "high";
    }
  }
  if (level !== "max" && level !== "ultra") return level;
  if (supportedLevels?.includes(level)) return level;
  if (level === "ultra" && supportedLevels?.includes("max")) return "max";
  return "xhigh";
}

function toGeminiThinkingLevel(cfg, supportedLevels) {
  const raw = cfg.mode === "auto" ? "high" : (toLevel(cfg) || "high");
  const level = effortToThinkingLevel(raw);
  const ordered = ["minimal", "low", "medium", "high"];
  const allowed = ordered.filter(value => !supportedLevels || supportedLevels.includes(value));
  if (allowed.includes(level)) return level;
  // Use the nearest supported level; never forward an unknown Gemini enum.
  const rank = ordered.indexOf(level);
  return allowed.find(value => ordered.indexOf(value) >= rank) || allowed.at(-1) || "high";
}

function toKimiReasoningEffort(cfg) {
  const level = toLevel(cfg);
  if (level === "auto") return "high";
  if (level === "minimal") return "low";
  if (level === "xhigh") return "max";
  if (["low", "medium", "high", "max"].includes(level)) return level;
  return null;
}

const GEMINI_LEVEL_OUTPUT_FLOOR = {
  minimal: 4096,
  low: 8192,
  medium: 16384,
  high: 65535,
};

function geminiBudgetOutputFloor(budget) {
  if (budget === -1) return 32768;
  if (!Number.isFinite(budget)) return 32768;
  if (budget <= 1024) return 8192;
  if (budget <= 8192) return 16384;
  if (budget <= 24576) return 32768;
  return 65535;
}
function geminiLevelOutputFloor(level) {
  return GEMINI_LEVEL_OUTPUT_FLOOR[level] || GEMINI_LEVEL_OUTPUT_FLOOR.high;
}

// Gemini nests thinkingConfig under generationConfig. gemini-cli / antigravity wrap
// the whole request in a { request: { generationConfig } } envelope — target the
// envelope's generationConfig when present, else the top-level one.
function getGeminiGenerationConfig(body) {
  if (body.request && typeof body.request === "object") {
    if (!body.request.generationConfig || typeof body.request.generationConfig !== "object") {
      body.request.generationConfig = {};
    }
    return body.request.generationConfig;
  }
  if (!body.generationConfig || typeof body.generationConfig !== "object") {
    body.generationConfig = {};
  }
  return body.generationConfig;
}

function setGeminiThinking(body, tc) {
  const gc = getGeminiGenerationConfig(body);
  gc.thinkingConfig = tc;
}

function ensureGeminiOutputFloor(body, floor, caps) {
  const cap = Number.isFinite(caps?.maxOutput) && caps.maxOutput > 0 ? caps.maxOutput : undefined;
  const gc = getGeminiGenerationConfig(body);
  // These are gateway defaults, not required model minima. Never spend beyond
  // an explicit caller cap (including zero/null: leave validation to the caller).
  if (gc.maxOutputTokens === undefined) {
    gc.maxOutputTokens = cap === undefined ? floor : Math.min(floor, cap);
  } else if (Number.isFinite(gc.maxOutputTokens) && cap !== undefined && gc.maxOutputTokens > cap) {
    gc.maxOutputTokens = cap;
  }
}

// Strip every known thinking field from a body (used before re-applying / when unsupported).
function stripAll(body) {
  delete body.thinking;
  delete body.reasoning_effort;
  delete body.reasoning;
  delete body.thinkingConfig;
  delete body.enable_thinking;
  delete body.thinking_budget;
  delete body.output_config;
  if (body.generationConfig) delete body.generationConfig.thinkingConfig;
  if (body.request?.generationConfig) delete body.request.generationConfig.thinkingConfig;
}

// Apply unified thinking config to body in the resolved provider-native format.
function applyFormat(fmt, body, cfg, caps, supportedLevels, display, provider) {
  const none = cfg.mode === "none";
  const canDisable = caps.thinkingCanDisable !== false;
  // Model cannot disable thinking → clamp "none" to minimal effort instead.
  const eff = none && !canDisable ? { mode: "level", level: "minimal" } : cfg;

  switch (fmt) {
    case "openai": {
      if (none && canDisable) { body.reasoning_effort = "none"; break; }
      // Upstreams that reject "none" (e.g. gpt-6-astra accepts only
      // low/medium/high, #4031) must never receive it — omit the field so the
      // upstream default applies. Same precedent as the tokenrouter branch.
      if (none) break;
      const level = toLevel(eff);
      if (level) body.reasoning_effort = normalizeOpenAILevel(level, supportedLevels);
      break;
    }
    case "claude-adaptive": {
      // A mandatory-thinking model may expose a reduced-thinking wire mode
      // without accepting disabled. Keep thinkingCanDisable semantics elsewhere.
      if (none && caps.thinkingOffType) { body.thinking = { type: caps.thinkingOffType }; break; }
      if (none && canDisable) { body.thinking = { type: "disabled" }; break; }
      // Permanently adaptive models accept effort directly, but an explicit
      // display intent still needs the adaptive object to control returned text.
      if (canDisable || display) body.thinking = { type: "adaptive", ...(display ? { display } : {}) };
      else delete body.thinking;
      const level = toLevel(eff);
      // xhigh is model-gated (Opus/Sonnet 4.6 reject it) — clamp when not advertised.
      // Claude effort has no "minimal" (always-on models clamp "none" to it), so
      // an always-on model must send "low" instead of an invalid level (#4600).
      body.output_config = { effort: level === "auto" ? "high"
        : level === "minimal" ? "low"
        : level === "xhigh" && !supportedLevels?.includes("xhigh") ? "high" : level };
      break;
    }
    case "claude-budget": {
      if (none && canDisable) { body.thinking = { type: "disabled" }; break; }
      const budget = toBudget(eff, caps.thinkingRange);
      body.thinking = { type: "enabled", budget_tokens: Number.isFinite(budget) && budget > 0 ? Math.max(1024, Math.floor(budget)) : 8192, ...(display ? { display } : {}) };
      break;
    }
    case "gemini-level": {
      const level = toGeminiThinkingLevel(none ? { mode: "level", level: "minimal" } : eff, supportedLevels);
      setGeminiThinking(body, { thinkingLevel: level, includeThoughts: level !== "minimal" });
      ensureGeminiOutputFloor(body, geminiLevelOutputFloor(level), caps);
      break;
    }
    case "gemini-budget": {
      if (none && canDisable) { setGeminiThinking(body, { thinkingBudget: 0, includeThoughts: false }); break; }
      const budget = toBudget(eff, caps.thinkingRange);
      setGeminiThinking(body, { thinkingBudget: budget ?? -1, includeThoughts: true });
      ensureGeminiOutputFloor(body, geminiBudgetOutputFloor(budget ?? -1), caps);
      break;
    }
    case "zai": {
      // Z.ai ignores thinking.disabled → must use enable_thinking:false to turn off.
      if (none && canDisable) { body.enable_thinking = false; delete body.thinking; break; }
      body.thinking = { type: "enabled" };
      // reasoning_effort is only read by z.ai from GLM-5.2 onward — older GLM ignores it
      // (see thinkingEffortSupported in capabilities.js). Skip on unsupported models so we
      // don't send a field the API doesn't recognize.
      if (caps.thinkingEffortSupported) {
        const zaiLvl = toLevel(eff);
        // GLM-5.3 only accepts exactly low|high|max (anything else errors); GLM-5.2 accepts
        // a wider set but z.ai maps low/medium->high and xhigh->max server-side anyway, so
        // this 3-value mapping matches both.
        body.reasoning_effort = (zaiLvl === "low" || zaiLvl === "minimal") ? "low"
          : (zaiLvl === "high" || zaiLvl === "medium") ? "high"
          : "max";
      }
      break;
    }
    case "qwen": {
      if (none && canDisable) { body.enable_thinking = false; break; }
      body.enable_thinking = true;
      const budget = toBudget(eff, caps.thinkingRange);
      if (Number.isFinite(budget) && budget > 0) body.thinking_budget = budget;
      break;
    }
    case "deepseek": {
      if (none && canDisable) { body.thinking = { type: "disabled" }; break; }
      body.thinking = { type: "enabled" };
      // DeepSeek: low/medium→high, xhigh/max→max. Some backends (mimo v2.5-pro/v2.6
      // on opencode-go, probed live) 400 on "max" — clamp to high when the declared
      // levels exclude it.
      const level = toLevel(eff);
      // Native API mapping differs from MiMo and reseller deepseek-format
      // contracts. Do not change those routes based on DeepSeek's own docs.
      const want = provider === "deepseek"
        ? (["minimal", "low"].includes(level) ? "low" : ["max", "ultra"].includes(level) ? "max" : "high")
        : level === "xhigh" || level === "max" ? "max" : "high";
      body.reasoning_effort = want === "max" && supportedLevels && !supportedLevels.includes("max") ? "high" : want;
      break;
    }
    case "kimi": {
      if (none && canDisable) { body.thinking = { type: "disabled" }; break; }
      let effort = toKimiReasoningEffort(eff);
      // Auto-clamp unsupported levels (e.g. NVIDIA Kimi K3 rejects medium)
      if (effort && supportedLevels && !supportedLevels.includes(effort)) {
        const clampMap = { minimal: "low", low: "low", medium: "high", high: "high", xhigh: "max", max: "max" };
        const mapped = clampMap[effort];
        if (mapped && supportedLevels.includes(mapped)) effort = mapped;
        else {
          // Fallback: prefer high > max > low for kimi
          for (const pref of ["high", "max", "low"]) if (supportedLevels.includes(pref)) { effort = pref; break; }
          if (!supportedLevels.includes(effort)) effort = supportedLevels[0];
        }
      }
      if (effort) body.reasoning_effort = effort;
      break;
    }
    case "minimax": {
      // M3 adaptive; M2.x cannot disable (handled via canDisable clamp).
      body.thinking = { type: none && canDisable ? "disabled" : "adaptive" };
      break;
    }
    case "hunyuan": {
      if (none && canDisable) { body.thinking = { type: "disabled" }; break; }
      const budget = toBudget(eff, caps.thinkingRange);
      body.thinking = budget === -1 ? { type: "enabled" } : { type: "enabled", budget_tokens: budget || 8192 };
      break;
    }
    case "step": {
      if (none && canDisable) break;
      const level = toLevel(eff);
      if (level) body.reasoning_effort = level === "xhigh" || level === "max" ? "high" : level;
      break;
    }
    case "tokenrouter": {
      // TokenRouter's reasoning_effort enum is low/medium/high/xhigh/max — it rejects
      // "none"/"auto" with a 400 and supports "max" natively (no clamp like openai).
      // "none" → omit the field so the upstream default applies; pass levels through.
      if (none || eff.mode === "auto") break;
      const level = toLevel(eff);
      if (level) body.reasoning_effort = level;
      break;
    }
    case "kiro":
      // Kiro thinking handled via system-tag injection in openai-to-kiro.js; no body field here.
      break;
    default:
      break;
  }
}

// Public entry: normalize thinking for the resolved target format.
// Mutates and returns body. No-op when model has no reasoning capability.
// `intent` is a pre-captured config (from captureThinking on the original body);
// falls back to extracting from the current body when omitted.
export function applyThinking(targetFormat, model, body, provider = null, intent = undefined) {
  if (!body || typeof body !== "object") return body;

  const { cleanModel, override } = parseSuffix(model);
  const cfg = override || intent || extractThinking(body);
  const caps = getCapabilitiesForModel(provider, cleanModel);

  // Model cannot reason → strip any stray thinking fields.
  if (!caps.reasoning) {
    stripAll(body);
    return body;
  }
  if (!cfg) return body;

  const fmt = resolveFormat(targetFormat, cleanModel, provider);
  // Native reduced-thinking requests carry an independent effort. Do not let
  // effort capture turn disabled/between_tools into unrestricted adaptive
  // thinking, or drop output_config's other fields. Explicit model suffixes
  // still take precedence over the body's thinking mode.
  if (!override && fmt === "claude-adaptive" && caps.thinkingOffType &&
      (body.thinking?.type === "disabled" || body.thinking?.type === caps.thinkingOffType)) {
    const outputConfig = body.output_config;
    stripAll(body);
    body.thinking = { type: caps.thinkingOffType };
    if (outputConfig) body.output_config = outputConfig;
    return body;
  }
  // 4.6 still accepts explicit manual mode even though adaptive is preferred.
  // Preserve its numeric budget for final preparation, which knows beta headers.
  // Do not force this legacy mode onto 4.7+ or unknown reseller specifications.
  if (!override && targetFormat === "claude" && provider === "claude" && body.thinking?.type === "enabled" &&
      /^claude-(?:sonnet|opus)-4[.-]6(?:-\d{8})?$/.test(cleanModel)) return body;
  const supportedLevels = getThinkingLevels(provider, cleanModel);
  // Anthropic's `display` (summarized | omitted) decides whether thinking text
  // comes back at all; keep what the client asked for instead of resetting it.
  // An OpenAI-shaped client's ask arrives via the captured intent instead.
  const display = typeof body.thinking?.display === "string" ? body.thinking.display : intent?.display;
  const isResponses = targetFormat === "openai-responses" || targetFormat === "openai-response";
  const responsesReasoning = isResponses
    ? { ...body.reasoning, ...intent?.responsesReasoning } : null;
  stripAll(body);
  applyFormat(fmt, body, cfg, caps, supportedLevels, display, provider);
  if (isResponses) {
    const effort = body.reasoning_effort;
    delete body.reasoning_effort;
    delete responsesReasoning.effort;
    if (effort !== undefined) responsesReasoning.effort = effort;
    if (Object.keys(responsesReasoning).length) body.reasoning = responsesReasoning;
  }
  return body;
}
