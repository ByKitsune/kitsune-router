// Antigravity's Cloud Code transport is distinct from public GenerateContent.
// This gateway does not implement background/continuation decode hops.
export const ANTIGRAVITY_MAX_OUTPUT_TOKENS = 65536;
export const ANTIGRAVITY_ARGON_CONTEXT_WINDOW = 1048576;
export const ANTIGRAVITY_ARGON_MODEL_ID = "gemini-4-argon";

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
