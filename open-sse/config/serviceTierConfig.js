// First-party evidence captured 2026-10-21. Speed is not a reasoning level or a
// different model. Keep exact capabilities separate from account entitlement.
// https://developers.openai.com/api/docs/pricing (Fast table)
export const OPENAI_FAST_MODELS = [
  "gpt-6-astra", "gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna",
  "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4",
  "gpt-5.4-mini", "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini",
  "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-2024-05-13",
  "gpt-4o-mini", "o3", "o4-mini", "gpt-5.3-codex",
];
// https://developers.openai.com/api/docs/guides/ultrafast-mode
// https://developers.openai.com/api/docs/changelog (2026-10-08 Sol 6.1)
export const OPENAI_ULTRAFAST_MODELS = ["gpt-6-astra", "gpt-6.1-sol"];
// A newer account-specific catalog may override these documented model limits.
export const CODEX_NO_ULTRAFAST_MODELS = [
  "gpt-6-sol", "gpt-6-luna", "gpt-5.6-terra", "gpt-5.6-luna",
  "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.3-codex-spark",
];
// https://developers.openai.com/codex/agent-configuration/speed
// Generic `pro`/`enterprise`/`edu` are deliberately NOT enough to decide access.
export const CODEX_NO_ULTRAFAST_PLANS = ["free", "go", "plus", "team", "business", "pro_100", "pro_200", "enterprise_legacy"];
export const OPENAI_ULTRAFAST_REGIONS = {
  "gpt-6-astra": ["global", "us"],
  "gpt-6.1-sol": ["global", "us", "eu"],
};
export const SERVICE_TIER_MODES = ["auto", "default", "fast", "ultrafast"];
export const SERVICE_TIER_WIRE_VALUES = [...SERVICE_TIER_MODES, "priority", "flex", "scale"];
