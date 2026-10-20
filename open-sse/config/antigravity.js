// Antigravity's Cloud Code transport is distinct from public GenerateContent.
// This gateway does not implement background/continuation decode hops.
export const ANTIGRAVITY_MAX_OUTPUT_TOKENS = 65536;
export const ANTIGRAVITY_ARGON_CONTEXT_WINDOW = 1048576;
export const ANTIGRAVITY_ARGON_MODEL_ID = "gemini-4-argon";

// Runtime retirements confirmed by service notices on 2026-10-20. This is
// separate from catalog deprecation and future scheduled removals. In particular,
// gemini-3-flash (without -agent) is still working and must not be blocked.
export const ANTIGRAVITY_RETIRED_FLASH_IDS = new Set([
  "gemini-3.5-flash-high", "gemini-3-flash-agent",
  "gemini-3.5-flash-low", "gemini-3.5-flash-extra-low",
]);
export const ANTIGRAVITY_RETIRED_MODEL_ERROR = {
  status: 410,
  error: {
    type: "invalid_request_error",
    code: "model_retired",
    message: "The requested model is no longer available. Select another available model.",
  },
};

export const ANTIGRAVITY_ARGON_MODELS = [
  // Keep the native base ID: a registry thinking suffix would override explicit
  // request intent. Upstream's default is medium when no level is supplied.
  { id: ANTIGRAVITY_ARGON_MODEL_ID, name: "Gemini 4 Argon" },
  ...["high", "medium", "low"].map(level => ({
    id: `${ANTIGRAVITY_ARGON_MODEL_ID}-${level}`,
    name: `Gemini 4 Argon (${level[0].toUpperCase()}${level.slice(1)})`,
    upstreamModelId: `${ANTIGRAVITY_ARGON_MODEL_ID}-${level}(${level})`,
  })),
];
