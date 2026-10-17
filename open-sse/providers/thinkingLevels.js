// Resolve valid thinking levels per model — drives UI level picker (suffix "model(level)").
// Reuses capabilities.js (thinkingFormat/canDisable) so this file only maps format→levels (DRY).
import { getCapabilitiesForModel } from "./capabilities.js";
import { canonicalizeProviderId } from "./identity.js";
import { matchPattern } from "./pricing.js";
import { resolveKiroEffortPath } from "../config/kiroConstants.js";

// Shared level sets (deduped) — verified against provider docs + wire in thinkingUnified.applyFormat.
const L = {
  base: ["none", "low", "medium", "high"],                          // qwen, step, hunyuan, gemini-budget
  onOff: ["none", "thinking"],                                      // zai (binary), minimax (adaptive)
  openai: ["none", "minimal", "low", "medium", "high", "xhigh"],    // GPT-5.x / o-series (no "max")
  levelMax: ["none", "low", "medium", "high", "max"],               // kimi
  budgetX: ["none", "low", "medium", "high", "xhigh", "max"],       // claude-budget, claude-adaptive
  gemini: ["minimal", "low", "medium", "high"],                     // gemini-3 thinkingLevel (no disable)
  hiMax: ["none", "high", "max"],                                   // deepseek (low/med→high, xhigh→max)
};

// thinkingFormat → valid selectable levels (source of truth for UI options).
const FORMAT_LEVELS = {
  openai: L.openai,
  openrouter: [...L.openai, "max"],
  "claude-adaptive": L.budgetX,
  "claude-budget": L.budgetX,
  "gemini-level": L.gemini,
  "gemini-budget": L.base,
  zai: L.onOff,
  qwen: L.base,
  kimi: L.levelMax,
  deepseek: L.hiMax,
  minimax: L.onOff,
  hunyuan: L.base,
  step: L.base,
};

const CODEX_GPT_5_6_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

// Opus/Sonnet 4.6 lack xhigh (Anthropic + Kiro docs) — keep the 4-level+max set.
const CLAUDE_NO_XHIGH = ["none", "low", "medium", "high", "max"];

// Model-name pattern overrides (glob, first match wins) — more precise than format default.
const PATTERN_THINKING = [
  // NVIDIA Kimi K3 via NIM only supports low/high/max (no medium) — error 400 otherwise
  { provider: "nvidia", pattern: "*kimi*k3*", levels: ["low", "high", "max"] },
  { provider: "nvidia", pattern: "*kimi-k3*", levels: ["low", "high", "max"] },
  { provider: "poolside", pattern: "*", levels: ["minimal", "low", "medium", "high"] },
  { pattern: "*laguna*", levels: ["minimal", "low", "medium", "high"] },
  { pattern: "*claude*4.6*", levels: CLAUDE_NO_XHIGH },
  { pattern: "*claude*4-6*", levels: CLAUDE_NO_XHIGH },
  { provider: "codex", pattern: "*gpt-6*", levels: CODEX_GPT_5_6_LEVELS },
  { provider: "codex", pattern: "*gpt-5.6-sol*", levels: [...CODEX_GPT_5_6_LEVELS, "ultra"] },
  { provider: "codex", pattern: "*gpt-5.6-terra*", levels: [...CODEX_GPT_5_6_LEVELS, "ultra"] },
  { provider: "codex", pattern: "*gpt-5.6-luna*", levels: CODEX_GPT_5_6_LEVELS },
  { pattern: "*codex*", levels: ["low", "medium", "high", "xhigh"] }, // codex cannot disable thinking
  { pattern: "*mimo*v2.6*", levels: ["none", "low", "medium", "high", "xhigh"] },
  // mimo-v2.5-pro on opencode-go rejects reasoning_effort "max" (probed live); v2.5 accepts it.
  { pattern: "*mimo*v2.5-pro*", levels: ["none", "low", "medium", "high", "xhigh"] },
  // ── codebuddy-cn per-model effort sets (e014cb537, resynced 2026-09-30 in #4614) ──
  // The server's product-config payload publishes reasoning.supportedEfforts per
  // model. The gateway accepts any level you send but silently clamps values
  // outside a model's set, so the declared set stays authoritative for the picker.
  // ⚠️ These exact ids MUST stay ABOVE the unqualified `*deepseek-v4.*` glob:
  // PATTERN_THINKING is first-match-wins, so a provider-qualified entry after the
  // glob would never fire for dotted ids like deepseek-v4.1-flash.
  { provider: "codebuddy-cn", pattern: "deepseek-v4-pro",     levels: ["low", "high", "xhigh"] },
  { provider: "codebuddy-cn", pattern: "deepseek-v4.1-flash", levels: ["low", "high", "max"] },
  // DeepSeek v4.*: effort low|medium|high|xhigh|max
  { pattern: "*deepseek-v4.*", levels: ["none", "low", "medium", "high", "xhigh", "max"] },
  { provider: "codebuddy-cn", pattern: "glm-5.3",      levels: ["low", "high", "max"] },
  { provider: "codebuddy-cn", pattern: "glm-5.3-flash", levels: ["low", "high", "max"] },
  { provider: "codebuddy-cn", pattern: "kimi-k2.8-preview", levels: ["low", "medium", "high"] },
  // Models that publish no supportedEfforts (glm-5.1 / kimi-k3-1 / minimax-m3)
  // fall through to the openai format default.
  { provider: "codebuddy-cn", pattern: "hy3",          levels: ["low", "high"] },
  { provider: "codebuddy-cn", pattern: "hy4-preview",  levels: ["high"] },
];

// Returns valid thinking levels for a model, or null when the model has no reasoning.
export function getThinkingLevels(provider, model) {
  provider = canonicalizeProviderId(provider);
  if (provider === "kiro" && resolveKiroEffortPath(model) === null) return null;
  const caps = getCapabilitiesForModel(provider, model);
  if (!caps.reasoning) return null;
  if (Array.isArray(caps.thinkingEfforts) && caps.thinkingEfforts.length) {
    return caps.thinkingCanDisable === false
      ? caps.thinkingEfforts.filter(level => level !== "none")
      : [...caps.thinkingEfforts];
  }
  const hit = PATTERN_THINKING.find((entry) =>
    (!entry.provider || entry.provider === provider) && matchPattern(entry.pattern, model)
  );
  let levels = hit?.levels || FORMAT_LEVELS[caps.thinkingFormat] || L.base;
  if (caps.thinkingCanDisable === false) levels = levels.filter((l) => l !== "none");
  return levels;
}
