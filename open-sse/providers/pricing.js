import { getProviderIdentityTokens, getDeclaredUpstreamModelId } from "./identity.js";
import { REVIEWED_MODEL_METADATA, getReviewedModelMetadata, getReviewedPricing } from "./metadata/reviewed.js";
import { OPENAI_NATIVE_CACHE_WRITE_PRICING, OPENAI_PROCESSING_SPEED_PRICING } from "../config/processingSpeedPricing.js";
import { LITERAL_ONLY_PRICING_PROVIDERS } from "../config/pricingConfig.js";

// Pricing rates for AI models — all rates in $/1M tokens
//
// Fallback order (first match wins):
//   1. Literal provider override, then literal full-ID model tariff
//   2. FREE_MODEL_NAMESPACES — upstream bills these at $0
//   3. Unambiguous case-insensitive exact / declared upstream alias metadata
//   4. Canonical leaf price, then PATTERN_PRICING (e.g. "codex-*")

/**
 * Namespaces upstream meters at $0. A free model must never inherit a paid
 * rate: the vendor-prefix strip in getPricingForModel() would turn
 * "cline-free/deepseek-v4.1-flash" into "deepseek-v4.1-flash" and match
 * MODEL_PRICING, so the namespace is checked before both fallbacks.
 */
export const FREE_MODEL_NAMESPACES = ["cline-free/", "opencode-free/", "mimo-free/"];

export const ZERO_PRICING = {
  input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0, cache_creation_1h: 0,
  cache_write_30m: 0, cache_write_12h: 0,
};

/** True when the model id sits in a namespace upstream bills at $0. */
export function isFreeModel(model) {
  if (!model) return false;
  const lower = String(model).toLowerCase();
  return FREE_MODEL_NAMESPACES.some((ns) => lower.startsWith(ns));
}

/**
 * Canonical model pricing — provider-agnostic.
 * Cover all known models; deduplicated across providers.
 */
export const MODEL_PRICING = {
  // === Anthropic / Claude ===
  "claude-opus-4-6":              { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 25.00,  cache_creation: 6.25  },
  "claude-opus-4-5-20251101":     { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 25.00,  cache_creation: 6.25  },
  "claude-sonnet-4-6":            { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-sonnet-4-5-20250929":   { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-haiku-4-5-20251001":    { input: 1.00,  output: 5.00,  cached: 0.10,  reasoning: 5.00,   cache_creation: 1.25  },
  "claude-haiku-4.5":             { input: 1.00,  output: 5.00,  cached: 0.10,  reasoning: 5.00,   cache_creation: 1.25  },
  "claude-haiku-4-5":             { input: 1.00,  output: 5.00,  cached: 0.10,  reasoning: 5.00,   cache_creation: 1.25  },
  "claude-sonnet-4-20250514":     { input: 3.00,  output: 15.00, cached: 1.50,  reasoning: 15.00,  cache_creation: 3.00  },
  "claude-opus-4-20250514":       { input: 15.00, output: 25.00, cached: 7.50,  reasoning: 112.50, cache_creation: 15.00 },
  "claude-3-5-sonnet-20241022":   { input: 3.00,  output: 15.00, cached: 1.50,  reasoning: 15.00,  cache_creation: 3.00  },
  "claude-opus-4.1":              { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 37.50,  cache_creation: 5.00  },
  "claude-opus-4.5":              { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 37.50,  cache_creation: 5.00  },
  "claude-opus-4.6":              { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 37.50,  cache_creation: 5.00  },
  "claude-sonnet-4":              { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 22.50,  cache_creation: 3.00  },
  "claude-sonnet-4.5":            { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 22.50,  cache_creation: 3.00  },
  "claude-sonnet-4.6":            { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 22.50,  cache_creation: 3.00  },
  "claude-opus-4-5-thinking":     { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 37.50,  cache_creation: 5.00  },
  "claude-opus-4-6-thinking":     { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 37.50,  cache_creation: 5.00  },
  "claude-fable-5":               { input: 10.00, output: 50.00, cached: 1.00,  reasoning: 50.00,  cache_creation: 12.50 },
  "claude-fable-5-1":             { input: 10.00, output: 50.00, cached: 0.25,  reasoning: 50.00,  cache_creation: 12.50 },
  // Native API references (platform.claude.com/docs/en/about-claude/pricing, 2026-10-17):
  // Opus 5.5 = $4/$20 with $0.20 cache reads; Sonnet 5 / 5.5 = $2/$10 with $0.20 / $0.10 reads.
  // Opus 5 = $5/$25; Fable 5.1 = $10/$50 with $0.25 reads. Route-specific quotes take precedence.
  // Exact entries win over the claude-opus-*/claude-sonnet-* patterns below.
  "claude-opus-5":                { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 25.00,  cache_creation: 6.25  },
  "claude-opus-5-5":              { input: 4.00,  output: 20.00, cached: 0.20,  reasoning: 20.00,  cache_creation: 5.00  },
  "claude-opus-5-5-20260922":     { input: 4.00,  output: 20.00, cached: 0.20,  reasoning: 20.00,  cache_creation: 5.00  },
  "claude-sonnet-5":              { input: 2.00,  output: 10.00, cached: 0.20,  reasoning: 10.00,  cache_creation: 2.50  },
  "claude-sonnet-5-5":            { input: 2.00,  output: 10.00, cached: 0.10,  reasoning: 10.00,  cache_creation: 2.50  },
  "claude-haiku-5-5":             { input: 0.10, output: 0.50, cached: 0.01, reasoning: 0.50, cache_creation: 0.125, cache_creation_1h: 0.20, tier: { threshold: 100000, input: 0.50, output: 2.50, cached: 0.05, cache_creation: 0.625, cache_creation_1h: 1.00 } },
  // Dot-form aliases (pricing lookup is exact-match; the claude-opus-*/claude-sonnet-* patterns would misprice them)
  "claude-opus-5.5":              { input: 4.00,  output: 20.00, cached: 0.20,  reasoning: 20.00,  cache_creation: 5.00  },
  "claude-sonnet-5.5":            { input: 2.00,  output: 10.00, cached: 0.10,  reasoning: 10.00,  cache_creation: 2.50  },
  // Antigravity2 tier-suffixed ids (9router #4600/#4548) — same model, same rates.
  "claude-opus-5-5-high":         { input: 4.00,  output: 20.00, cached: 0.20,  reasoning: 20.00,  cache_creation: 5.00  },
  "claude-opus-5-5-medium":       { input: 4.00,  output: 20.00, cached: 0.20,  reasoning: 20.00,  cache_creation: 5.00  },
  "claude-opus-5-5-low":          { input: 4.00,  output: 20.00, cached: 0.20,  reasoning: 20.00,  cache_creation: 5.00  },
  "claude-sonnet-5-5-high":       { input: 2.00,  output: 10.00, cached: 0.10,  reasoning: 10.00,  cache_creation: 2.50  },
  "claude-sonnet-5-5-medium":     { input: 2.00,  output: 10.00, cached: 0.10,  reasoning: 10.00,  cache_creation: 2.50  },
  "claude-sonnet-5-5-low":        { input: 2.00,  output: 10.00, cached: 0.10,  reasoning: 10.00,  cache_creation: 2.50  },

  // === OpenAI / GPT (developers.openai.com/api/docs/pricing, snapshot 2026-09-23) ===
  // GPT-5+ cache reads = 10% of input; gpt-4.1 family = 25%; o3/o4-mini = 25%.
  "gpt-3.5-turbo":                { input: 0.50,  output: 1.50,  cached: 0.25,  reasoning: 2.25,   cache_creation: 0.50  },
  "gpt-4":                        { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  },
  "gpt-4-turbo":                  { input: 10.00, output: 30.00, cached: 5.00,  reasoning: 45.00,  cache_creation: 10.00 },
  "gpt-4o":                       { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  },
  "gpt-4o-mini":                  { input: 0.15,  output: 0.60,  cached: 0.075, reasoning: 0.90,   cache_creation: 0.15  },
  "gpt-4.1":                      { input: 2.00,  output: 8.00,  cached: 0.50,  reasoning: 8.00,   cache_creation: 2.00  },
  "gpt-4.1-mini":                 { input: 0.40,  output: 1.60,  cached: 0.10,  reasoning: 1.60,   cache_creation: 0.40  },
  "gpt-4.1-nano":                 { input: 0.10,  output: 0.40,  cached: 0.025, reasoning: 0.40,   cache_creation: 0.10  },
  "gpt-5":                        { input: 1.25,  output: 10.00, cached: 0.125, reasoning: 10.00,  cache_creation: 1.25  },
  "gpt-5-mini":                   { input: 0.25,  output: 2.00,  cached: 0.025, reasoning: 2.00,   cache_creation: 0.25  },
  "gpt-5-nano":                   { input: 0.05,  output: 0.40,  cached: 0.005, reasoning: 0.40,   cache_creation: 0.05  },
  "gpt-5-pro":                    { input: 15.00, output: 120.00, cached: 1.50, reasoning: 120.00, cache_creation: 15.00 },
  "gpt-5.1":                      { input: 1.25,  output: 10.00, cached: 0.125, reasoning: 10.00,  cache_creation: 1.25  },
  "gpt-5.2":                      { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  },
  "gpt-5.2-pro":                  { input: 21.00, output: 168.00, cached: 2.10, reasoning: 168.00, cache_creation: 21.00 },
  "gpt-5.4":                      { input: 2.50,  output: 15.00, cached: 0.25,  reasoning: 15.00,  cache_creation: 2.50, tier: { threshold: 272000, input: 5.00, output: 22.50, cached: 0.50 } },
  "gpt-5.4-mini":                 { input: 0.75,  output: 4.50,  cached: 0.075, reasoning: 4.50,   cache_creation: 0.75  },
  "gpt-5.4-nano":                 { input: 0.20,  output: 1.25,  cached: 0.02,  reasoning: 1.25,   cache_creation: 0.20  },
  "gpt-5.4-pro":                  { input: 30.00, output: 180.00, cached: 3.00, reasoning: 180.00, cache_creation: 30.00, tier: { threshold: 272000, input: 60.00, output: 270.00, cached: 6.00 } },
  "gpt-5.5":                      { input: 5.00,  output: 30.00, cached: 0.50,  reasoning: 30.00,  cache_creation: 5.00, tier: { threshold: 272000, input: 10.00, output: 45.00, cached: 1.00 } },
  "gpt-5.5-pro":                  { input: 30.00, output: 180.00, cached: 3.00, reasoning: 180.00, cache_creation: 30.00, tier: { threshold: 272000, input: 60.00, output: 270.00, cached: 6.00 } },
  "gpt-5.3-codex":                { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  },
  "gpt-5.3-codex-spark":         { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  },
  "gpt-5.6":                      { input: 4.00,  output: 20.00, cached: 0.40,  reasoning: 20.00,  cache_creation: 5.00, tier: { threshold: 272000, input: 8.00, output: 30.00, cached: 0.80, cache_creation: 10.00 } },
  "gpt-5.6-luna":                 { input: 0.20,  output: 1.20,  cached: 0.02,  reasoning: 1.20,   cache_creation: 0.25, tier: { threshold: 272000, input: 0.40, output: 1.80, cached: 0.04, cache_creation: 0.50 } },
  "gpt-5.6-terra":                { input: 2.00,  output: 12.00, cached: 0.20,  reasoning: 12.00,  cache_creation: 2.50, tier: { threshold: 272000, input: 4.00, output: 18.00, cached: 0.40, cache_creation: 5.00 } },
  "gpt-5.6-sol":                  { input: 4.00,  output: 20.00, cached: 0.40,  reasoning: 20.00,  cache_creation: 5.00, tier: { threshold: 272000, input: 8.00, output: 30.00, cached: 0.80, cache_creation: 10.00 } },
  "gpt-6-astra":                  { input: 10.00, output: 50.00, cached: 1.00,  reasoning: 50.00,  cache_creation: 12.50, tier: { threshold: 272000, input: 20.00, output: 75.00, cached: 2.00, cache_creation: 25.00 } },
  "gpt-6-sol":                    { input: 2.00,  output: 10.00, cached: 0.20,  reasoning: 10.00,  cache_creation: 2.50, tier: { threshold: 272000, input: 4.00, output: 15.00, cached: 0.20, cache_creation: 5.00 } },
  "gpt-6.1-sol":                  { input: 2.00,  output: 10.00, cached: 0.10,  reasoning: 10.00,  cache_creation: 2.50, tier: { threshold: 272000, input: 4.00, output: 15.00, cached: 0.20, cache_creation: 5.00 } },
  "gpt-6-luna":                   { input: 0.10,  output: 0.50,  cached: 0.01,  reasoning: 0.50,   cache_creation: 0.125, tier: { threshold: 272000, input: 0.20, output: 0.75, cached: 0.02, cache_creation: 0.25 } },
  "o1":                           { input: 15.00, output: 60.00, cached: 7.50,  reasoning: 90.00,  cache_creation: 15.00 },
  "o1-mini":                      { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  },
  "o1-pro":                       { input: 150.00, output: 600.00, cached: 75.00, reasoning: 900.00, cache_creation: 150.00 },
  "o3":                           { input: 2.00,  output: 8.00,  cached: 0.50,  reasoning: 8.00,   cache_creation: 2.00  },
  "o3-mini":                      { input: 1.10,  output: 4.40,  cached: 0.55,  reasoning: 4.40,   cache_creation: 1.10  },
  "o3-pro":                       { input: 20.00, output: 80.00, cached: 10.00, reasoning: 80.00,  cache_creation: 20.00 },
  "o4-mini":                      { input: 1.10,  output: 4.40,  cached: 0.275, reasoning: 4.40,   cache_creation: 1.10  },

  // === Gemini (ai.google.dev/gemini-api/docs/pricing, verified 2026-10-01) ===
  // Gemini 4 Argon: introductory pricing $2/$10 with 95% off cached tokens ($0.10) per official blog 2026-09-30
  "gemini-4-argon":                { input: 2.00,  output: 10.00, cached: 0.10,  reasoning: 10.00,  cache_creation: 2.50 },
  "gemini-4-argon-preview":        { input: 2.00,  output: 10.00, cached: 0.10,  reasoning: 10.00,  cache_creation: 2.50 },
  // 3.6/3.7/3.8-flash promotional pricing is $0.75/$3.75 ($0.075 cache read) active through 31 Dec 2026.
  "gemini-3.5-flash":              { input: 1.50,  output: 9.00,  cached: 0.15,  reasoning: 9.00,   cache_creation: 1.50  },
  "gemini-3.1-flash-lite":         { input: 0.25,  output: 1.50,  cached: 0.025, reasoning: 1.50,   cache_creation: 0.25  },
  "gemini-embedding-001":          { input: 0.15,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },
  "gemini-3.8-flash":              { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.8-flash-high":         { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.8-flash-medium":       { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.8-flash-low":          { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.7-flash":              { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.7-flash-high":         { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.7-flash-medium":       { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.7-flash-low":          { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.6-flash":              { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.6-flash-high":         { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.6-flash-medium":       { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.6-flash-low":          { input: 0.75,  output: 3.75,  cached: 0.075, reasoning: 3.75,   cache_creation: 0.9375 },
  "gemini-3.5-flash-lite":         { input: 0.30,  output: 2.50,  cached: 0.03,  reasoning: 3.75,   cache_creation: 0.375 },
  "gemini-3.5-flash-high":         { input: 0.50,  output: 3.00,  cached: 0.03,  reasoning: 4.50,   cache_creation: 0.50  },
  "gemini-3-flash-preview":        { input: 0.50,  output: 3.00,  cached: 0.05,  reasoning: 3.00 },
  "gemini-3-pro-preview":         { input: 2.00,  output: 12.00, cached: 0.20,  reasoning: 12.00,  cache_creation: 2.00  },
  "gemini-3.1-pro-preview":       { input: 2.00,  output: 12.00, cached: 0.20,  reasoning: 12.00,  cache_creation: 2.00, tier: { threshold: 200000, input: 4.00, output: 18.00, cached: 0.40, cache_creation: 4.00 } },
  "gemini-3.1-pro-low":           { input: 2.00,  output: 12.00, cached: 0.20,  reasoning: 12.00,  cache_creation: 2.00, tier: { threshold: 200000, input: 4.00, output: 18.00, cached: 0.40, cache_creation: 4.00 } },
  "gemini-3.1-pro-high":          { input: 4.00,  output: 18.00, cached: 0.40,  reasoning: 18.00,  cache_creation: 4.00  },
  "gemini-pro-agent":             { input: 4.00,  output: 18.00, cached: 0.40,  reasoning: 18.00,  cache_creation: 4.00  },
  "gemini-3-flash-agent":         { input: 0.50,  output: 3.00,  cached: 0.03,  reasoning: 4.50,   cache_creation: 0.50  },
  "gemini-3.5-flash-low":         { input: 0.50,  output: 3.00,  cached: 0.03,  reasoning: 4.50,   cache_creation: 0.50  },
  "gemini-3.5-flash-extra-low":   { input: 0.50,  output: 3.00,  cached: 0.03,  reasoning: 4.50,   cache_creation: 0.50  },
  "gemini-3-flash":               { input: 0.50,  output: 3.00,  cached: 0.03,  reasoning: 4.50,   cache_creation: 0.50  },
  "gemini-2.5-pro":               { input: 1.25,  output: 10.00, cached: 0.125, reasoning: 10.00,  cache_creation: 1.25  },
  "gemini-2.5-flash":             { input: 0.30,  output: 2.50,  cached: 0.03,  reasoning: 3.75,   cache_creation: 0.30  },
  "gemini-2.5-flash-lite":        { input: 0.10,  output: 0.40,  cached: 0.01,  reasoning: 0.40,   cache_creation: 0.10  },
  "gemini-3.1-flash-image":       { input: 0.50,  output: 3.00,  cached: 0.05,  reasoning: 3.00,   cache_creation: 0.50  },
  "gemini-3-pro-image":           { input: 2.00,  output: 12.00, cached: 0.20,  reasoning: 12.00,  cache_creation: 2.00  },
  "gemini-2.5-flash-image":       { input: 0.30,  output: 2.50,  cached: 0.03,  reasoning: 2.50,   cache_creation: 0.30  },
  "imagen-3.0-generate-002":      { input: 0.03,  output: 0.03,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },
  "imagen-3.0-fast-generate-001": { input: 0.02,  output: 0.02,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },

  // === Qwen (Model Studio International / Singapore USD schedule, verified 2026-10-01) ===
  "qwen3-coder-plus":             { input: 1.00,  output: 5.00,  cached: 0.10,  reasoning: 5.00,   cache_creation: 1.25  },
  "qwen3-coder-flash":            { input: 0.30,  output: 1.50,  cached: 0.03,  reasoning: 1.50,   cache_creation: 0.375 },
  "qwen3.6-flash":                { input: 0.25,  output: 1.50,  cached: 0.025, reasoning: 1.50,   cache_creation: 0.3125 },
  "qwen3.6-plus":                 { input: 0.50,  output: 3.00,  cached: 0.05,  reasoning: 3.00,   cache_creation: 0.625 },
  "qwen3.7-max":                  { input: 2.50,  output: 7.50,  cached: 0.25,  reasoning: 7.50,   cache_creation: 3.125 },
  "qwen3.7-plus":                 { input: 0.40,  output: 1.60,  cached: 0.04,  reasoning: 1.60,   cache_creation: 0.50  },
  "qwen3.7-flash":                { input: 0.03,  output: 0.13,  cached: 0.003, reasoning: 0.13,   cache_creation: 0.0375 },
  "qwen3.8-max":                  { input: 2.00,  output: 6.00,  cached: 0.20,  reasoning: 6.00,   cache_creation: 2.50  },
  "qwen3.8-flash":                { input: 0.15,  output: 0.60,  cached: 0.015, reasoning: 0.60,   cache_creation: 0.20  },
  "qwen3.8-omni-flash":           { input: 0.15,  output: 0.47,  cached: 0.016, reasoning: 0.47,   cache_creation: 0.20  },
  "qwen3.5-flash":                { input: 0.10,  output: 0.40,  cached: 0.01,  reasoning: 0.40,   cache_creation: 0.125 },

  // === Xiaomi MiMo (official pay-as-you-go, verified 2026-10-01) ===
  "mimo-v2.6-flash":              { input: 0.14,  output: 0.28,  cached: 0.0028, reasoning: 0.28,  cache_creation: 0.14  },
  "mimo-v2.6-flash-free":         { input: 0.00,  output: 0.00,  cached: 0.00,   reasoning: 0.00,  cache_creation: 0.00  },
  "mimo-v2.6-pro":                { input: 0.435, output: 0.87,  cached: 0.0036, reasoning: 0.87,  cache_creation: 0.435 },
  "mimo-v2.6-pro-ultraspeed":     { input: 4.35,  output: 8.70,  cached: 0.036,  reasoning: 8.70,  cache_creation: 4.35  },
  "mimo-v2.5-pro":                { input: 0.435, output: 0.87,  cached: 0.0036, reasoning: 0.87,  cache_creation: 0.435 },
  "mimo-v2.5":                    { input: 0.14,  output: 0.28,  cached: 0.0028, reasoning: 0.28,   cache_creation: 0.14  },

  // === Baidu ERNIE (Qianfan billing, snapshot 2026-09-23; ≤32k tier; cached = 10% convention) ===
  "ernie-5.1":                    { input: 0.56,  output: 2.53,  cached: 0.056, reasoning: 2.53,   cache_creation: 0.56  },
  "ernie-5.0":                    { input: 0.84,  output: 3.38,  cached: 0.084, reasoning: 3.38,   cache_creation: 0.84  },
  "ernie-x1-turbo-32k":           { input: 0.15,  output: 0.59,  cached: 0.015, reasoning: 0.59,   cache_creation: 0.15  },

  // === Kimi ===
  // Official platform.kimi.ai: cache-hit / cache-miss / output per 1M tokens
  "kimi-k3":                      { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.00  },
  "k3":                           { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.00  },
  "kimi-k2.7-code":               { input: 0.95,  output: 4.00,  cached: 0.19,  reasoning: 4.00,   cache_creation: 0.95  },
  "kimi-k2.7-code-highspeed":     { input: 1.90,  output: 8.00,  cached: 0.38,  reasoning: 8.00,   cache_creation: 1.90  },
  "kimi-for-coding":              { input: 0.95,  output: 4.00,  cached: 0.19,  reasoning: 4.00,   cache_creation: 0.95  },
  "kimi-for-coding-highspeed":    { input: 1.90,  output: 8.00,  cached: 0.38,  reasoning: 8.00,   cache_creation: 1.90  },
  // codebuddy-cn refresh e014cb537 — hy / kimi-k3 family (Tencent Hy rates: ~0.066/0.26 per TokenRouter)
  "hy3-preview":                  { input: 0.30,  output: 1.20,  cached: 0.06,  reasoning: 1.80,   cache_creation: 0.30  },
  "hy3":                          { input: 0.30,  output: 1.20,  cached: 0.06,  reasoning: 1.80,   cache_creation: 0.30  },
  "hy3-x":                        { input: 0.30,  output: 1.20,  cached: 0.06,  reasoning: 1.80,   cache_creation: 0.30  },
  "hy4-preview":                  { input: 0.40,  output: 2.00,  cached: 0.08,  reasoning: 2.00,   cache_creation: 0.40  },
  "hy4-preview-x":                { input: 0.40,  output: 2.00,  cached: 0.08,  reasoning: 2.00,   cache_creation: 0.40  },
  "kimi-k2.6":                    { input: 0.95,  output: 4.00,  cached: 0.16,  reasoning: 4.00,   cache_creation: 0.95  },

  // === DeepSeek (api-docs.deepseek.com, official Flash schedule: 0.15/0.60/0.003) ===
  "deepseek-flash":                { input: 0.15,  output: 0.60,  cached: 0.003,  reasoning: 0.60,   cache_creation: 0.15  },
  "deepseek-v4.1-flash":           { input: 0.15,  output: 0.60,  cached: 0.003,  reasoning: 0.60,   cache_creation: 0.15  },
  "deepseek-v4-1-flash":           { input: 0.15,  output: 0.60,  cached: 0.003,  reasoning: 0.60,   cache_creation: 0.15  },
  "deepseek-v4-flash":             { input: 0.15,  output: 0.60,  cached: 0.003,  reasoning: 0.60,   cache_creation: 0.15  },
  "deepseek-v4-flash-vision-exp":  { input: 0.15,  output: 0.60,  cached: 0.003,  reasoning: 0.60,   cache_creation: 0.15  },
  "deepseek-v4-pro":               { input: 0.66,  output: 1.98,  cached: 0.022,  reasoning: 1.98,   cache_creation: 0.66  },

  // === xAI Grok (docs.x.ai, verified 2026-10-01; tiered ≥200k ctx = 2x input/output) ===
  "grok-4.7":                      { input: 2.00,  output: 6.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 2.00, tier: { threshold: 200000, input: 4.00, output: 12.00, cached: 1.00 } },
  "grok-4.6":                      { input: 2.00,  output: 6.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 2.00, tier: { threshold: 200000, input: 4.00, output: 12.00, cached: 1.00 } },
  "grok-4.5":                      { input: 2.00,  output: 6.00,  cached: 0.30,  reasoning: 6.00,   cache_creation: 2.00, tier: { threshold: 200000, input: 4.00, output: 12.00, cached: 0.60 } },
  "grok-4.3":                      { input: 1.25,  output: 2.50,  cached: 0.20,  reasoning: 2.50,   cache_creation: 1.25, tier: { threshold: 200000, input: 2.50, output: 5.00, cached: 0.40 } },
  "grok-build-0.1":                { input: 1.00,  output: 2.00,  cached: 0.20,  reasoning: 2.00,   cache_creation: 1.00, tier: { threshold: 200000, input: 2.00, output: 4.00, cached: 0.40 } },

  // === Mistral (docs.mistral.ai/inference/pricing, snapshot 2026-09-23) ===
  "mistral-large-latest":          { input: 0.50,  output: 1.50,  cached: 0.05,  reasoning: 1.50,   cache_creation: 0.50  },
  "mistral-medium-latest":         { input: 1.50,  output: 7.50,  cached: 0.15,  reasoning: 7.50,   cache_creation: 1.50  },
  "mistral-small-latest":          { input: 0.15,  output: 0.60,  cached: 0.015, reasoning: 0.60,   cache_creation: 0.15  },
  "codestral-latest":              { input: 0.30,  output: 0.90,  cached: 0.03,  reasoning: 0.90,   cache_creation: 0.30  },

  // === GLM / Z.ai (docs.z.ai/guides/overview/pricing, snapshot 2026-09-23) ===
  "glm-4.5-air":                 { input: 0.20,  output: 1.10,  cached: 0.04,  reasoning: 1.10,   cache_creation: 0.20  },
  "glm-4.5":                     { input: 0.60,  output: 2.20,  cached: 0.11,  reasoning: 2.20,   cache_creation: 0.60  },
  "glm-4.5v":                    { input: 0.60,  output: 1.80,  cached: 0.11,  reasoning: 1.80,   cache_creation: 0.60  },
  "glm-4.6":                     { input: 0.60,  output: 2.20,  cached: 0.11,  reasoning: 2.20,   cache_creation: 0.60  },
  "glm-4.6v":                    { input: 0.30,  output: 0.90,  cached: 0.06,  reasoning: 0.90,   cache_creation: 0.30  },
  "glm-4.6v-flashx":             { input: 0.04,  output: 0.40,  cached: 0.01,  reasoning: 0.40,   cache_creation: 0.04  },
  "glm-4.7":                     { input: 0.60,  output: 2.20,  cached: 0.11,  reasoning: 2.20,   cache_creation: 0.60  },
  "glm-4.7-flash":               { input: 0.00,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },
  "glm-4.7-flashx":              { input: 0.07,  output: 0.40,  cached: 0.015, reasoning: 0.40,   cache_creation: 0.07  },
  "glm-5":                       { input: 1.00,  output: 3.20,  cached: 0.20,  reasoning: 3.20,   cache_creation: 1.00  },
  "glm-5-turbo":                 { input: 1.20,  output: 4.00,  cached: 0.24,  reasoning: 4.00,   cache_creation: 1.20  },
  "glm-5.1":                     { input: 1.40,  output: 4.40,  cached: 0.26,  reasoning: 4.40,   cache_creation: 1.40  },
  "glm-5.2":                     { input: 1.40,  output: 4.40,  cached: 0.26,  reasoning: 4.40,   cache_creation: 1.40  },
  "glm-5.3":                     { input: 1.40,  output: 4.40,  cached: 0.26,  reasoning: 4.40,   cache_creation: 1.40  },
  "glm-5.3-flash":               { input: 0.15,  output: 0.50,  cached: 0.03,  reasoning: 0.50,   cache_creation: 0.15  },
  "glm-5.3-flashx":              { input: 0.37,  output: 1.25,  cached: 0.07,  reasoning: 1.25,   cache_creation: 0.37  },

  // === MiniMax (platform.minimax.io/docs/guides/pricing-paygo, snapshot 2026-09-23) ===
  // M3 standard tier (≤512k ctx; >512k = 2x). M2.x legacy but available.
  "MiniMax-M3":                   { input: 0.30,  output: 1.20,  cached: 0.06,  reasoning: 1.20,   cache_creation: 0.30  },
  "MiniMax-M2":                   { input: 0.30,  output: 1.20,  cached: 0.03,  reasoning: 1.20,   cache_creation: 0.30  },
  "MiniMax-M2.1":                 { input: 0.30,  output: 1.20,  cached: 0.03,  reasoning: 1.20,   cache_creation: 0.30  },
  "MiniMax-M2.1-highspeed":       { input: 0.60,  output: 2.40,  cached: 0.06,  reasoning: 2.40,   cache_creation: 0.60  },
  "MiniMax-M2.5":                 { input: 0.30,  output: 1.20,  cached: 0.03,  reasoning: 1.20,   cache_creation: 0.30  },
  "MiniMax-M2.5-highspeed":       { input: 0.60,  output: 2.40,  cached: 0.06,  reasoning: 2.40,   cache_creation: 0.60  },
  "MiniMax-M2.7":                 { input: 0.30,  output: 1.20,  cached: 0.06,  reasoning: 1.20,   cache_creation: 0.30  },
  "MiniMax-M2.7-highspeed":       { input: 0.60,  output: 2.40,  cached: 0.06,  reasoning: 2.40,   cache_creation: 0.60  },
  "minimax-m2.1":                 { input: 0.30,  output: 1.20,  cached: 0.03,  reasoning: 1.20,   cache_creation: 0.30  },
  "minimax-m2.5":                 { input: 0.30,  output: 1.20,  cached: 0.03,  reasoning: 1.20,   cache_creation: 0.30  },

  // === OpenRouter fallback ===
  "auto":                         { input: 2.00,  output: 8.00,  cached: 1.00,  reasoning: 12.00,  cache_creation: 2.00  },

  // === Misc ===
  "oswe-vscode-prime":            { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  },
  "gpt-oss-120b-medium":          { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 2.00,   cache_creation: 2.00  },
  "vision-model":                 { input: 1.50,  output: 6.00,  cached: 0.75,  reasoning: 9.00,   cache_creation: 1.50  },
  "coder-model":                  { input: 1.50,  output: 6.00,  cached: 0.75,  reasoning: 9.00,   cache_creation: 1.50  },

  // === Cohere (cohere.com/pricing, snapshot 2026-09-23) ===
  "command-a-03-2025":            { input: 2.50,  output: 10.00, cached: 0.25,  reasoning: 10.00,  cache_creation: 2.50  },
  "command-r-08-2024":            { input: 0.15,  output: 0.60,  cached: 0.015, reasoning: 0.60,   cache_creation: 0.15  },
  "command-r-plus-08-2024":       { input: 2.50,  output: 10.00, cached: 0.25,  reasoning: 10.00,  cache_creation: 2.50  },
  "command-r7b-12-2024":          { input: 0.0375, output: 0.15, cached: 0.004, reasoning: 0.15,   cache_creation: 0.0375 },

  // === Perplexity Sonar (docs.perplexity.ai, snapshot 2026-09-23; +per-request search fees) ===
  "sonar":                        { input: 1.00,  output: 1.00,  cached: 0.10,  reasoning: 1.00,   cache_creation: 1.00  },
  "sonar-pro":                    { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.00  },
  "sonar-reasoning-pro":          { input: 2.00,  output: 8.00,  cached: 0.20,  reasoning: 8.00,   cache_creation: 2.00  },
  "sonar-deep-research":          { input: 2.00,  output: 8.00,  cached: 0.20,  reasoning: 8.00,   cache_creation: 2.00  },

  // === Voyage embeddings (docs.voyageai.com/docs/pricing, $/1M tokens) ===
  "voyage-4-large":               { input: 0.12,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },
  "voyage-4":                     { input: 0.06,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },
  "voyage-4-lite":                { input: 0.02,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },
  "voyage-3-large":               { input: 0.18,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },
  "voyage-3.5":                   { input: 0.06,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },
  "voyage-3.5-lite":              { input: 0.02,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },
  "voyage-code-3":                { input: 0.18,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  },
};

/**
 * Provider-specific pricing overrides.
 * Complete provider-specific quotes, including deliberate unknown component rates.
 * Keyed by provider alias (cc, cx, gc, gh, ...) or provider id (openai, anthropic, ...).
 */
export const PROVIDER_PRICING = {
  // https://tokenharbor.ai/models/{literal-id}, reviewed 2026-10-21:
  // "Free-tier only; uses the free allowance and is never billed."
  // Whole-route zero is not an inferred cache capability or a global :free rule.
  tokenharbor: {
    "mimo-v2.6-flash:free": ZERO_PRICING,
    "deepseek-v4.1-flash:free": ZERO_PRICING,
  },
  // Alibaba Coding Plan (China CNY domestic rates converted to USD base)
  alicode: {
    "qwen3-coder-plus":  { input: 0.574, output: 2.294, cached: 0.057, reasoning: 2.294, cache_creation: 0.574 },
    "qwen3-coder-flash": { input: 0.144, output: 0.574, cached: 0.014, reasoning: 0.574, cache_creation: 0.144 },
  },
  "alicode-intl": {
    "qwen3-coder-plus":  { input: 0.574, output: 2.294, cached: 0.057, reasoning: 2.294, cache_creation: 0.574 },
    "qwen3-coder-flash": { input: 0.144, output: 0.574, cached: 0.014, reasoning: 0.574, cache_creation: 0.144 },
  },
  // GitHub Copilot — canonical key; legacy gh resolves through provider identities.
  github: {
    "gpt-5.3-codex": { input: 1.75, output: 14.00, cached: 0.175, reasoning: 14.00, cache_creation: 1.75 },
  },
  // TokenRouter — exact rates from https://api.tokenrouter.com/api/pricing ($1/1M tokens).
  // Ratio→USD: input = model_ratio×2, output = model_ratio×completion_ratio×2.
  // These override the canonical MODEL_PRICING/PATTERN_PRICING, whose rates often
  // differ from TokenRouter's reseller pricing.
  tokenrouter: {
    "MiniMax-M3": { input: 0.3, output: 1.2, cached: 0.06, reasoning: 1.2 },
    "anthropic/claude-fable-5": { input: 10, output: 50, cached: 1.0, cache_creation: 12.5, reasoning: 50 },
    "anthropic/claude-haiku-4.5": { input: 1.0, output: 5.0, cached: 0.1, cache_creation: 1.25, reasoning: 5.0 },
    "anthropic/claude-opus-4.5": { input: 5.0, output: 25.0, cached: 0.5, cache_creation: 6.25, reasoning: 25.0 },
    "anthropic/claude-opus-4.6": { input: 5.0, output: 25.0, cached: 0.5, cache_creation: 6.25, reasoning: 25.0 },
    "anthropic/claude-opus-4.7": { input: 5.0, output: 25.0, cached: 0.5, cache_creation: 6.25, reasoning: 25.0 },
    "anthropic/claude-opus-4.7-fast": { input: 30, output: 150, cached: 3.0, reasoning: 150 },
    "anthropic/claude-opus-4.8": { input: 5.0, output: 25.0, cached: 0.5, cache_creation: 6.25, reasoning: 25.0 },
    "anthropic/claude-opus-4.8-fast": { input: 10, output: 50, cached: 1.0, cache_creation: 12.5, reasoning: 50 },
    "anthropic/claude-opus-5": { input: 5.0, output: 25.0, cached: 0.5, cache_creation: 6.25, reasoning: 25.0 },
    "anthropic/claude-opus-5-fast": { input: 10, output: 50, cached: 1.0, cache_creation: 12.5, reasoning: 50 },
    "anthropic/claude-opus-5-5": { input: 4.0, output: 20.0, cached: 0.2, cache_creation: 5.0, reasoning: 20.0 },
    "anthropic/claude-opus-5-5-20260922": { input: 4.0, output: 20.0, cached: 0.2, cache_creation: 5.0, reasoning: 20.0 },
    "anthropic/claude-opus-5.5": { input: 4.0, output: 20.0, cached: 0.2, cache_creation: 5.0, reasoning: 20.0 },
    "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0, cached: 0.3, cache_creation: 3.75, reasoning: 15.0 },
    "anthropic/claude-sonnet-4.5": { input: 3.0, output: 15.0, cached: 0.3, cache_creation: 3.75, reasoning: 15.0 },
    "anthropic/claude-sonnet-4.6": { input: 3.0, output: 15.0, cached: 0.3, cache_creation: 3.75, reasoning: 15.0 },
    "anthropic/claude-sonnet-5": { input: 2, output: 10, cached: 0.2, reasoning: 10 },
    "claude-opus-4-8-m-aws": { input: 5.0, output: 25.0, cached: 0.5, cache_creation: 6.25, reasoning: 25.0 },
    "deepseek/deepseek-v3.2": { input: 0.26, output: 0.38, cached: 0.13, reasoning: 0.38 },
    "deepseek/deepseek-v4-flash": { input: 0.14, output: 0.28, cached: 0.0028, reasoning: 0.28 },
    "deepseek/deepseek-v4-flash-0731": { input: 0.14, output: 0.28, cached: 0.0028, reasoning: 0.28 },
    "deepseek/deepseek-v4-pro": { input: 0.435, output: 0.87, cached: 0.003625, reasoning: 0.87 },
    "ex/gpt-5.4": { input: 2.5, output: 15.0, cached: 0.25, reasoning: 15.0 },
    "google/gemini-2.5-flash-image": { input: 0.3, output: 2.5, reasoning: 2.5 },
    "google/gemini-3-flash-preview": { input: 0.5, output: 3.0, cached: 0.05, cache_creation: 0.08333, reasoning: 3.0 },
    "google/gemini-3-pro-image-preview": { input: 2, output: 12, reasoning: 12 },
    "google/gemini-3.1-flash-image-preview": { input: 0.5, output: 3.0, reasoning: 3.0 },
    "google/gemini-3.1-flash-lite-image": { input: 0.25, output: 1.5, reasoning: 1.5 },
    "google/gemini-3.1-pro-preview": { input: 2, output: 12, cached: 0.2, cache_creation: 0.375, reasoning: 12 },
    "google/gemini-3.5-flash": { input: 1.5, output: 9.0, cached: 0.15, cache_creation: 0.08333, reasoning: 9.0 },
    "google/gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cached: 0.03, cache_creation: 0.08333, reasoning: 2.5 },
    "google/gemini-3.6-flash": { input: 1.5, output: 7.5, cached: 0.15, cache_creation: 0.08333, reasoning: 7.5 },
    "google/gemini-embedding-2": { input: 1.0, output: 6.0, cached: 0.1, reasoning: 6.0 },
    "google/gemma-4-26b-a4b-it": { input: 0.06, output: 0.33, reasoning: 0.33 },
    "kling-3.0-turbo": { input: 2.1, output: 2.1, reasoning: 2.1 },
    "microsoft/mai-image-2.5": { input: 5.0, output: 47.0, reasoning: 47.0 },
    "minimax/minimax-m2-her": { input: 0.3, output: 1.2, cached: 0.03, reasoning: 1.2 },
    "minimax/minimax-m2.1": { input: 0.3, output: 1.2, cached: 0.03, reasoning: 1.2 },
    "minimax/minimax-m2.1-highspeed": { input: 0.6, output: 2.4, cached: 0.06, reasoning: 2.4 },
    "minimax/minimax-m2.5": { input: 0.3, output: 1.2, cached: 0.03, reasoning: 1.2 },
    "minimax/minimax-m2.7": { input: 0.3, output: 1.2, cached: 0.06, reasoning: 1.2 },
    "minimax/minimax-m2.7-highspeed": { input: 0.6, output: 2.4, cached: 0.06, reasoning: 2.4 },
    "miromind/mirothinker-1-7-deepresearch": { input: 4, output: 25.0, reasoning: 25.0 },
    "miromind/mirothinker-1-7-deepresearch-mini": { input: 1.25, output: 10.0, reasoning: 10.0 },
    "mistralai/devstral-2512": { input: 0.4, output: 2.0, cached: 0.04, reasoning: 2.0 },
    "mistralai/mistral-medium-3-5": { input: 1.5, output: 7.5, reasoning: 7.5 },
    "mistralai/mistral-small-2603": { input: 0.15, output: 0.6, cached: 0.015, reasoning: 0.6 },
    "mistralai/voxtral-small-24b-2507": { input: 0.1, output: 0.3, cached: 0.01, reasoning: 0.3 },
    "moonshotai/kimi-k2.5": { input: 0.6, output: 3.0, cached: 0.1, reasoning: 3.0 },
    "moonshotai/kimi-k2.6": { input: 0.95, output: 4.0, cached: 0.16, reasoning: 4.0 },
    "moonshotai/kimi-k2.7-code": { input: 0.9286, output: 3.8571, cached: 0.1857, reasoning: 3.8571 },
    "moonshotai/kimi-k3": { input: 3.0, output: 15.0, cached: 0.3, reasoning: 15.0 },
    "nvidia/nemotron-3-super-120b-a12b": { input: 0.3, output: 0.9, cached: 0.1, reasoning: 0.9 },
    "openai/gpt-4o-mini": { input: 0.15, output: 0.6, cached: 0.075, reasoning: 0.6 },
    "openai/gpt-5": { input: 1.25, output: 10.0, cached: 0.125, reasoning: 10.0 },
    "openai/gpt-5-image": { input: 10, output: 40, cached: 2.5, reasoning: 40 },
    "openai/gpt-5-image-mini": { input: 2.5, output: 8.0, cached: 0.25, reasoning: 8.0 },
    "openai/gpt-5-mini": { input: 0.25, output: 2.0, cached: 0.025, reasoning: 2.0 },
    "openai/gpt-5.2": { input: 1.75, output: 14.0, cached: 0.175, reasoning: 14.0 },
    "openai/gpt-5.3-codex": { input: 1.75, output: 14.0, cached: 0.175, reasoning: 14.0 },
    "openai/gpt-5.4": { input: 2.5, output: 15.0, cached: 0.25, reasoning: 15.0 },
    "openai/gpt-5.4-image-2": { input: 8, output: 30.0, cached: 2.0, reasoning: 30.0 },
    "openai/gpt-5.4-mini": { input: 0.75, output: 4.5, cached: 0.075, reasoning: 4.5 },
    "openai/gpt-5.4-nano": { input: 0.2, output: 1.25, cached: 0.02, reasoning: 1.25 },
    "openai/gpt-5.4-pro": { input: 30, output: 180, reasoning: 180 },
    "openai/gpt-5.5": { input: 5.0, output: 30.0, cached: 0.5, reasoning: 30.0 },
    "openai/gpt-5.5-pro": { input: 30, output: 180, reasoning: 180 },
    "openai/gpt-5.6-luna": { input: 0.2, output: 1.2, cached: 0.02, cache_creation: 0.25, reasoning: 1.2 },
    "openai/gpt-5.6-sol": { input: 5.0, output: 30.0, cached: 0.5, cache_creation: 6.25, reasoning: 30.0 },
    "openai/gpt-5.6-terra": { input: 2, output: 12, cached: 0.2, cache_creation: 2.5, reasoning: 12 },
    "openai/gpt-audio": { input: 2.5, output: 10.0, reasoning: 10.0 },
    "openai/gpt-audio-mini": { input: 0.6, output: 2.4, reasoning: 2.4 },
    "openai/gpt-oss-120b": { input: 0.039, output: 0.18, reasoning: 0.18 },
    "qwen/qwen3-coder-next": { input: 0.12, output: 0.75, cached: 0.06, reasoning: 0.75 },
    "qwen/qwen3.5-122b-a10b": { input: 0.26, output: 2.08, reasoning: 2.08 },
    "qwen/qwen3.5-35b-a3b": { input: 0.1625, output: 1.3, reasoning: 1.3 },
    "qwen/qwen3.5-397b-a17b": { input: 0.39, output: 2.34, reasoning: 2.34 },
    "qwen/qwen3.5-9b": { input: 0.1, output: 0.15, reasoning: 0.15 },
    "qwen/qwen3.5-flash": { input: 0.1048, output: 0.4194, reasoning: 0.4194 },
    "qwen/qwen3.5-plus-02-15": { input: 0.26, output: 1.56, reasoning: 1.56 },
    "qwen/qwen3.6-plus": { input: 0.54, output: 3.21, reasoning: 3.21 },
    "qwen/qwen3.7-max": { input: 1.25, output: 3.75, cached: 0.25, reasoning: 3.75 },
    "qwen/qwen3.7-plus": { input: 0.4, output: 1.6, cached: 0.08, reasoning: 1.6 },
    "qwen/qwen3.8-max": { input: 2, output: 6, cached: 0.25, cache_creation: 2.5, reasoning: 6 },
    "qwen3.5-omni-plus": { input: 1.0, output: 5.7143, reasoning: 5.7143 },
    "qwen3.6-flash": { input: 0.171, output: 1.029, cached: 0.017, cache_creation: 0.214, reasoning: 1.029 },
    "sakana/fugu-ultra": { input: 5.0, output: 30.0, cached: 0.5, reasoning: 30.0 },
    "seed-2-0-code-preview-260328": { input: 1.0, output: 6.0, cached: 0.2, cache_creation: 0.008333, reasoning: 6.0 },
    "seed-2-0-lite-260428": { input: 0.5, output: 4.0, cached: 0.1, cache_creation: 0.008333, reasoning: 4.0 },
    "seed-2-0-mini-260428": { input: 0.2, output: 0.8, cached: 0.04, cache_creation: 0.00833, reasoning: 0.8 },
    "seed-2-0-pro-260328": { input: 1.0, output: 6.0, cached: 0.2, cache_creation: 0.008333, reasoning: 6.0 },
    "stepfun/step-3.5-flash": { input: 0.1, output: 0.3, cached: 0.02, reasoning: 0.3 },
    "stepfun/step-3.7-flash": { input: 0.2, output: 1.15, cached: 0.04, reasoning: 1.15 },
    "tencent/hy3-preview": { input: 0.066, output: 0.26, cached: 0.029, reasoning: 0.26 },
    "x-ai/grok-4.1-fast": { input: 0.2, output: 0.5, cached: 0.05, reasoning: 0.5 },
    "x-ai/grok-4.20-beta": { input: 2, output: 6, cached: 0.2, reasoning: 6 },
    "x-ai/grok-4.3": { input: 1.25, output: 2.5, cached: 0.2, reasoning: 2.5 },
    "x-ai/grok-4.5": { input: 2, output: 6, cached: 0.5, reasoning: 6 },
    "x-ai/grok-build-0.1": { input: 1.0, output: 2.0, cached: 0.2, reasoning: 2.0 },
    "xiaomi/mimo-v2-flash": { input: 0.1, output: 0.3, cached: 0.01, reasoning: 0.3 },
    "xiaomi/mimo-v2-omni": { input: 0.4, output: 2.0, cached: 0.08, reasoning: 2.0 },
    "xiaomi/mimo-v2-pro": { input: 1.0, output: 3.0, cached: 0.2, reasoning: 3.0 },
    "xiaomi/mimo-v2.5": { input: 0.4, output: 2.0, cached: 0.08, reasoning: 2.0 },
    "xiaomi/mimo-v2.5-pro": { input: 1.0, output: 3.0, cached: 0.2, reasoning: 3.0 },
    "z-ai/glm-4.5-air": { input: 0.13, output: 0.85, cached: 0.025, reasoning: 0.85 },
    "z-ai/glm-4.6": { input: 0.6, output: 2.2, cached: 0.11, reasoning: 2.2 },
    "z-ai/glm-4.6v": { input: 0.3, output: 0.9, reasoning: 0.9 },
    "z-ai/glm-4.7": { input: 0.6, output: 2.2, cached: 0.11, reasoning: 2.2 },
    "z-ai/glm-5": { input: 1.0, output: 3.2, cached: 0.2, reasoning: 3.2 },
    "z-ai/glm-5-turbo": { input: 1.2, output: 4.0, cached: 0.24, reasoning: 4.0 },
    "z-ai/glm-5.1": { input: 1.05, output: 3.5, cached: 0.525, reasoning: 3.5 },
    "z-ai/glm-5.2": { input: 1.4, output: 4.4, cached: 0.26, reasoning: 4.4 },
    "z-ai/glm-5.3-free": { input: 0, output: 0 },
  },
  // Exact provider + literal model quotes reconciled 2026-10-17 against models.dev/api.json.
  // Compatible USD/1M tokens only. Reviewed primary facts below retain precedence;
  // omissions are unknown, not fabricated zero rates or cache multipliers.
  // Primary: https://www.cerebras.ai/pricing (embedded developer tariff; cache unspecified).
  "cerebras": {
    "gpt-oss-120b": {input: 0.35, output: 0.75, reasoning: 0.75},
    "qwen-3.8-27b": {input: 0.99, output: 1.49, reasoning: 1.49},
  },
  // Literal models.dev chutes tariffs; public PAYG page rounds displayed rates.
  "chutes": {
    "moonshotai/Kimi-K3-TEE": {input: 1.85, output: 9.5, cached: 0.18499999999999997, reasoning: 9.5},
    "moonshotai/Kimi-K2.6-TEE": {input: 0.45, output: 1.95, cached: 0.04499999999999999, reasoning: 1.95},
    "zai-org/GLM-5.2-TEE": {input: 1.25, output: 3.95, cached: 0.12499999999999997, reasoning: 3.95},
    "zai-org/GLM-5.1-TEE": {input: 0.98, output: 3.08, cached: 0.09799999999999998, reasoning: 3.08},
    "deepseek-ai/DeepSeek-V4-Flash-0731-TEE": {input: 0.44, output: 1.32, cached: 0.04399999999999999, reasoning: 1.32},
    "deepseek-ai/DeepSeek-V3.2-TEE": {input: 1, output: 1, cached: 0.09999999999999998, reasoning: 1},
    "Qwen/Qwen3.5-397B-A17B-TEE": {input: 0.45, output: 3, cached: 0.04499999999999999, reasoning: 3},
    "Qwen/Qwen3.8-27B-TEE": {input: 0.039, output: 1.25, cached: 0.003899999999999999, reasoning: 1.25},
    "Qwen/Qwen3.6-27B-TEE": {input: 0.25, output: 2, cached: 0.024999999999999994, reasoning: 2},
    "Qwen/Qwen3-32B-TEE": {input: 0.104, output: 0.416, cached: 0.010399999999999998, reasoning: 0.416},
    "Qwen/Qwen3-235B-A22B-Thinking-2507-TEE": {input: 0.2989, output: 1.1957, cached: 0.029889999999999993, reasoning: 1.1957},
    "unsloth/Mistral-Nemo-Instruct-2407-TEE": {input: 0.0245, output: 0.0978, cached: 0.0024499999999999995, reasoning: 0.0978},
  },
  // Primary: https://developers.cloudflare.com/workers-ai/platform/pricing/; Neurons per million tokens × $0.011/1000. Free daily allocation is not deducted.
  "cloudflare-ai": {
    "@cf/meta/llama-3.2-1b-instruct": {input: 0.027027, output: 0.200772, reasoning: 0.200772},
    "@cf/meta/llama-3.2-3b-instruct": {input: 0.050875, output: 0.335225, reasoning: 0.335225},
    "@cf/mistralai/mistral-small-3.1-24b-instruct": {input: 0.350636, output: 0.555368, reasoning: 0.555368},
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast": {input: 0.293348, output: 2.252855, reasoning: 2.252855},
    "@cf/meta/llama-4-scout-17b-16e-instruct": {input: 0.269995, output: 0.850003, reasoning: 0.850003},
    "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": {input: 0.49687, output: 4.881316, reasoning: 4.881316},
    "@cf/deepseek-ai/deepseek-v4-flash-0731": {input: 0.44, cached: 0.014003, output: 1.32, reasoning: 1.32},
    "@cf/deepseek-ai/deepseek-v4-pro-0813": {input: 1.32, cached: 0.044, output: 3.96, reasoning: 3.96},
    "@cf/moonshotai/kimi-k2.6": {input: 0.950004, cached: 0.159995, output: 3.999996, reasoning: 3.999996},
    "@cf/moonshotai/kimi-k2.7-code": {input: 0.950004, cached: 0.190003, output: 3.999996, reasoning: 3.999996},
    "@cf/zai-org/glm-4.7-flash": {input: 0.0605, output: 0.4004, reasoning: 0.4004},
    "@cf/zai-org/glm-5.2": {input: 1.400003, cached: 0.259996, output: 4.4, reasoning: 4.4},
    "@cf/zai-org/glm-5.3": {input: 1.400003, cached: 0.259996, output: 4.4, reasoning: 4.4},
    "@cf/zai-org/glm-5.3-flash": {input: 0.149996, cached: 0.029997, output: 0.500005, reasoning: 0.500005},
    "@cf/openai/gpt-oss-120b": {input: 0.349998, output: 0.750002, reasoning: 0.750002},
    "@cf/openai/gpt-oss-20b": {input: 0.200002, output: 0.300003, reasoning: 0.300003},
    "@cf/qwen/qwen3.8-27b": {input: 0.449999, output: 3.199999, reasoning: 3.199999},
    "@cf/qwen/qwq-32b": {input: 0.66, output: 0.999999, reasoning: 0.999999},
    "@cf/qwen/qwen2.5-coder-32b-instruct": {input: 0.66, output: 0.999999, reasoning: 0.999999},
  },
  // Primary: https://console.groq.com/docs/models and /docs/prompt-caching (50% hit discount on GPT OSS).
  "groq": {
    "openai/gpt-oss-120b": {input: 0.15, output: 0.6, cached: 0.075, reasoning: 0.6},
    "openai/gpt-oss-20b": {input: 0.075, output: 0.3, cached: 0.0375, reasoning: 0.3},
    "qwen/qwen3.8-27b": {input: 0.8, output: 4, reasoning: 4},
  },
  // Literal models.dev mistral embedding input reference, not a generated-output tariff.
  "mistral": {
    "mistral-embed": {input: 0.1},
  },
  // Literal models.dev nebius references; native API quotes, not vendor leaf prices.
  "nebius": {
    "deepseek-ai/DeepSeek-V4-Flash-0731": {input: 0.14, output: 0.28, cached: 0.14, reasoning: 0.28},
    "MiniMaxAI/MiniMax-M3": {input: 0.3, output: 1.2, reasoning: 1.2},
    "Qwen/Qwen3-Embedding-8B": {input: 0.01},
  },
  // Primary: https://developers.openai.com/api/docs/pricing; standard API only, output includes reasoning. Unpublished cache tariffs stay absent.
  "openai": {
    "gpt-5.5-pro": {input: 30, output: 180, reasoning: 180, tier: {threshold: 272000, input: 60, output: 270}},
    "gpt-5.4-pro": {input: 30, output: 180, reasoning: 180, tier: {threshold: 272000, input: 60, output: 270}},
    "gpt-5.2": {input: 1.75, output: 14, cached: 0.175, reasoning: 14},
    "gpt-5.2-pro": {input: 21, output: 168, reasoning: 168},
    "gpt-5.1": {input: 1.25, output: 10, cached: 0.125, reasoning: 10},
    "gpt-5": {input: 1.25, output: 10, cached: 0.125, reasoning: 10},
    "gpt-5-mini": {input: 0.25, output: 2, cached: 0.025, reasoning: 2},
    "gpt-5-nano": {input: 0.05, output: 0.4, cached: 0.005, reasoning: 0.4},
    "gpt-5-pro": {input: 15, output: 120, reasoning: 120},
    "gpt-4o": {input: 2.5, output: 10, cached: 1.25, reasoning: 10},
    "gpt-4o-mini": {input: 0.15, output: 0.6, cached: 0.075, reasoning: 0.6},
    "gpt-4-turbo": {input: 10, output: 30, reasoning: 30},
    "gpt-4.1": {input: 2, output: 8, cached: 0.5, reasoning: 8},
    "gpt-4.1-mini": {input: 0.4, output: 1.6, cached: 0.1, reasoning: 1.6},
    "gpt-4.1-nano": {input: 0.1, output: 0.4, cached: 0.025, reasoning: 0.4},
    "o3": {input: 2, output: 8, cached: 0.5, reasoning: 8},
    "o3-mini": {input: 1.1, output: 4.4, cached: 0.55, reasoning: 4.4},
    "o3-pro": {input: 20, output: 80, reasoning: 80},
    "o4-mini": {input: 1.1, output: 4.4, cached: 0.275, reasoning: 4.4},
    "o1": {input: 15, output: 60, cached: 7.5, reasoning: 60},
    "o1-pro": {input: 150, output: 600, reasoning: 600},
    "text-embedding-3-large": {input: 0.13},
    "text-embedding-3-small": {input: 0.02},
    "text-embedding-ada-002": {input: 0.1},
  },
  // Literal international SiliconFlow references; https://www.siliconflow.com/pricing corroborates current flagship rates. No inferred cache-write fee.
  "siliconflow": {
    "deepseek-ai/DeepSeek-V4-Pro": {input: 1.50162, output: 3.135, cached: 0.135, reasoning: 3.135},
    "deepseek-ai/DeepSeek-V4-Flash": {input: 0.13, output: 0.28, cached: 0.028, reasoning: 0.28},
    "deepseek-ai/DeepSeek-V3.2": {input: 0.27, output: 0.42, cached: 0.135, reasoning: 0.42},
    "deepseek-ai/DeepSeek-V3.2-Exp": {input: 0.27, output: 0.41, reasoning: 0.41},
    "deepseek-ai/DeepSeek-V3.1": {input: 0.27, output: 1, reasoning: 1},
    "deepseek-ai/DeepSeek-V3.1-Terminus": {input: 0.27, output: 1, reasoning: 1},
    "deepseek-ai/DeepSeek-R1": {input: 0.5, output: 2.18, reasoning: 2.18},
    "Qwen/Qwen3.5-397B-A17B": {input: 0.39, output: 2.34, reasoning: 2.34},
    "Qwen/Qwen3.5-122B-A10B": {input: 0.26, output: 2.08, reasoning: 2.08},
    "zai-org/GLM-5.1": {input: 1.19, output: 3.74, cached: 0.6, reasoning: 3.74},
    "zai-org/GLM-5": {input: 0.95, output: 2.55, cached: 0.2, reasoning: 2.55},
    "zai-org/GLM-5.3": {input: 1.4, output: 4.4, cached: 0.26, reasoning: 4.4},
    "zai-org/GLM-5.3-Flash": {input: 0.15, output: 0.5, cached: 0.03, reasoning: 0.5},
    "moonshotai/Kimi-K3": {input: 2.7, output: 13.5, cached: 0.27, reasoning: 13.5},
    "moonshotai/Kimi-K2.7-Code": {input: 0.85916, output: 3.8, cached: 0.17993, reasoning: 3.8},
    "moonshotai/Kimi-K2.6": {input: 0.77, output: 3.4, cached: 0.14, reasoning: 3.4},
    "moonshotai/Kimi-K2.5": {input: 0.45, output: 2.25, cached: 0.07, reasoning: 2.25},
    "openai/gpt-oss-120b": {input: 0.05, output: 0.45, reasoning: 0.45},
    "MiniMaxAI/MiniMax-M2.5": {input: 0.3, output: 1.2, cached: 0.03, reasoning: 1.2},
    "inclusionAI/Ling-flash-2.0": {input: 0.14, output: 0.57, reasoning: 0.57},
  },
  // Primary: https://www.together.ai/pricing; current Qwen3.7-Max quote supersedes models.dev.
  "together": {
    "meta-llama/Llama-3.3-70B-Instruct-Turbo": {input: 1.04, output: 1.04, reasoning: 1.04},
    "deepseek-ai/DeepSeek-V4-Pro-0813": {input: 1.32, output: 3.96, cached: 0.13, reasoning: 3.96},
    "deepseek-ai/DeepSeek-V4-Flash-0731": {input: 0.14, output: 0.28, cached: 0.03, reasoning: 0.28},
    "deepseek-ai/DeepSeek-V4.1-Flash": {input: 0.3, output: 1.2, cached: 0.006, reasoning: 1.2},
    "moonshotai/Kimi-K3": {input: 3, output: 15, cached: 0.3, reasoning: 15},
    "zai-org/GLM-5.3": {input: 1.4, output: 4.4, cached: 0.26, reasoning: 4.4},
    "zai-org/GLM-5.3-Flash": {input: 0.15, output: 0.5, cached: 0.03, reasoning: 0.5},
    "zai-org/GLM-5.2": {input: 1.4, output: 4.4, cached: 0.26, reasoning: 4.4},
    "openai/gpt-oss-120b": {input: 0.15, output: 0.6, reasoning: 0.6},
    "Qwen/Qwen3.7-Max": {input: 1.5, output: 4.5, cached: 0.3, reasoning: 4.5},
    "Qwen/Qwen3.6-Plus": {input: 0.5, output: 3, reasoning: 3},
    "Qwen/Qwen3.5-9B": {input: 0.17, output: 0.25, reasoning: 0.25},
    "MiniMaxAI/MiniMax-M3": {input: 0.3, output: 1.2, cached: 0.06, reasoning: 1.2},
  },
  // Literal models.dev venice USD token references; not vendor prices or subscription billing.
  "venice": {
    "venice-uncensored-1-2": {input: 0.2, output: 0.9, reasoning: 0.9},
    "zai-org-glm-5": {input: 1, output: 3.2, cached: 0.2, reasoning: 3.2},
    "z-ai-glm-5-3": {input: 1.75, output: 5.5, cached: 0.325, reasoning: 5.5},
    "z-ai-glm-5-3-flash": {input: 0.15, output: 0.5, cached: 0.03, reasoning: 0.5},
    "kimi-k3": {input: 3.75, output: 18.75, cached: 0.375, reasoning: 18.75},
    "deepseek-v4-flash": {input: 0.138, output: 0.275, cached: 0.028, reasoning: 0.275},
    "qwen3-235b-a22b-instruct-2507": {input: 0.15, output: 0.75, reasoning: 0.75},
    "qwen3-coder-480b-a35b-instruct-turbo": {input: 0.35, output: 1.5, cached: 0.04, reasoning: 1.5},
    "qwen3-vl-235b-a22b": {input: 0.21, output: 1.9, cached: 0.1, reasoning: 1.9},
    "deepseek-v4-pro": {input: 1.65, output: 3.301, cached: 0.33, reasoning: 3.301},
    "llama-3.3-70b": {input: 0.7, output: 2.8, reasoning: 2.8},
    "hermes-3-llama-3.1-405b": {input: 1.1, output: 3, reasoning: 3},
    "mistral-small-3-2-24b-instruct": {input: 0.09375, output: 0.25, reasoning: 0.25},
  },
  // Global Vertex reference rates; regional premiums and promotional credits are separate billing qualifiers. Cache storage is not a token-write fee.
  "vertex": {
    "gemini-3.8-flash": {input: 0.75, output: 3.75, cached: 0.075, reasoning: 3.75},
    "gemini-3.7-flash": {input: 0.75, output: 3.75, cached: 0.075, reasoning: 3.75},
    "gemini-3.6-flash": {input: 0.75, output: 3.75, cached: 0.075, reasoning: 3.75},
    "gemini-3.5-flash": {input: 1.5, output: 9, cached: 0.15, reasoning: 9},
    "gemini-3.5-flash-lite": {input: 0.3, output: 2.5, cached: 0.03, reasoning: 2.5},
    "gemini-3.1-pro-preview": {input: 2, output: 12, cached: 0.2, reasoning: 12, tier: {threshold: 200000, input: 4, output: 18, cached: 0.4}},
    "gemini-3.1-flash-lite": {input: 0.25, output: 1.5, cached: 0.025, reasoning: 1.5},
    "gemini-3-flash-preview": {input: 0.5, output: 3, cached: 0.05, reasoning: 3},
    "gemini-2.5-pro": {input: 1.25, output: 10, cached: 0.125, reasoning: 10, tier: {threshold: 200000, input: 2.5, output: 15, cached: 0.25}},
    "gemini-2.5-flash": {input: 0.3, output: 2.5, cached: 0.03, reasoning: 2.5},
    "gemini-2.5-flash-lite": {input: 0.1, output: 0.4, cached: 0.01, reasoning: 0.4},
  },
  // Exact free namespace routes only; auto frontier/balanced choose models dynamically and have no fixed tariff.
  "kilo-gateway": {
    "kilo-auto/free": ZERO_PRICING,
    "nvidia/nemotron-3-super-120b-a12b:free": ZERO_PRICING,
    "nvidia/nemotron-3-ultra-550b-a55b:free": ZERO_PRICING,
  },
  // Literal models.dev sambanova USD token references; authenticated entitlements unverified.
  "sambanova": {
    "MiniMax-M3": {input: 0.6, output: 2.4, cached: 0.06, reasoning: 2.4},
    "DeepSeek-V3.1": {input: 3, output: 4.5, reasoning: 4.5},
    "DeepSeek-V3.2": {input: 3, output: 4.5, reasoning: 4.5},
    "Meta-Llama-3.3-70B-Instruct": {input: 0.6, output: 1.2, reasoning: 1.2},
    "gpt-oss-120b": {input: 0.22, output: 0.59, reasoning: 0.59},
    "gemma-4-31B-it": {input: 0.38, output: 1.15, reasoning: 1.15},
  },
  // Literal models.dev morph USD token references; distinct hosted IDs, not Qwen/MiniMax vendor quotes.
  "morph": {
    "morph-v3-large": {input: 0.9, output: 1.9, reasoning: 1.9},
    "morph-v3-fast": {input: 0.8, output: 1.2, reasoning: 1.2},
  },
};

/**
 * Pattern-based pricing fallback — matched when no exact model entry found.
 * Patterns use simple glob: "*" matches any substring.
 * First match wins — order matters.
 */
export const PATTERN_PRICING = [
  // --- Codex variants ---
  { pattern: "*-codex-xhigh",   pricing: { input: 10.00, output: 40.00, cached: 5.00,  reasoning: 60.00,  cache_creation: 10.00 } },
  { pattern: "*-codex-high",    pricing: { input: 8.00,  output: 32.00, cached: 4.00,  reasoning: 48.00,  cache_creation: 8.00  } },
  { pattern: "*-codex-max",     pricing: { input: 8.00,  output: 32.00, cached: 4.00,  reasoning: 48.00,  cache_creation: 8.00  } },
  { pattern: "*-codex-mini-*",  pricing: { input: 1.50,  output: 6.00,  cached: 0.75,  reasoning: 9.00,   cache_creation: 1.50  } },
  { pattern: "*-codex-mini",    pricing: { input: 1.50,  output: 6.00,  cached: 0.75,  reasoning: 9.00,   cache_creation: 1.50  } },
  { pattern: "*-codex-low",     pricing: { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  } },
  { pattern: "*-codex-none",    pricing: { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  } },
  { pattern: "*-codex-spark",   pricing: { input: 3.00,  output: 12.00, cached: 0.30,  reasoning: 12.00,  cache_creation: 3.00  } },
  { pattern: "codex-*",         pricing: { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  } },
  { pattern: "*-codex",         pricing: { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  } },

  // --- Claude ---
  { pattern: "claude-opus-*",   pricing: { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 25.00,  cache_creation: 6.25  } },
  { pattern: "claude-sonnet-*", pricing: { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  } },
  { pattern: "claude-haiku-*",  pricing: { input: 1.00,  output: 5.00,  cached: 0.10,  reasoning: 5.00,   cache_creation: 1.25  } },
  { pattern: "claude-*",        pricing: { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  } },

  // --- Gemini (specific first, generic last) ---
  { pattern: "gemini-*-flash-lite", pricing: { input: 0.15, output: 1.25, cached: 0.015, reasoning: 1.875, cache_creation: 0.15 } },
  { pattern: "gemini-*-flash",  pricing: { input: 0.30,  output: 2.50,  cached: 0.03,  reasoning: 3.75,   cache_creation: 0.30  } },
  { pattern: "gemini-*-pro",    pricing: { input: 2.00,  output: 12.00, cached: 0.25,  reasoning: 18.00,  cache_creation: 2.00  } },
  { pattern: "gemini-3-*",      pricing: { input: 0.50,  output: 3.00,  cached: 0.03,  reasoning: 4.50,   cache_creation: 0.50  } },
  { pattern: "gemini-2.5-*",    pricing: { input: 0.30,  output: 2.50,  cached: 0.03,  reasoning: 3.75,   cache_creation: 0.30  } },
  { pattern: "gemini-*",        pricing: { input: 0.50,  output: 3.00,  cached: 0.03,  reasoning: 4.50,   cache_creation: 0.50  } },

  // --- GPT (specific first, generic last) ---
  { pattern: "gpt-6-astra*",    pricing: { input: 10.00, output: 50.00, cached: 1.00,  reasoning: 50.00,  cache_creation: 12.50 } },
  { pattern: "gpt-6-sol*",      pricing: { input: 2.00,  output: 10.00, cached: 0.20,  reasoning: 10.00,  cache_creation: 2.00  } },
  { pattern: "gpt-6-luna*",     pricing: { input: 0.10,  output: 0.50,  cached: 0.01,  reasoning: 0.50,   cache_creation: 0.10  } },
  { pattern: "gpt-6*",          pricing: { input: 10.00, output: 50.00, cached: 1.00,  reasoning: 50.00,  cache_creation: 12.50 } },
  { pattern: "gpt-5.6-*",       pricing: { input: 2.50,  output: 15.00, cached: 0.25,  reasoning: 15.00,  cache_creation: 2.50  } },
  { pattern: "gpt-5.3-*",       pricing: { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  } },
  { pattern: "gpt-5.2-*",       pricing: { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  } },
  { pattern: "gpt-5.1-*",       pricing: { input: 1.25,  output: 10.00, cached: 0.625, reasoning: 10.00,  cache_creation: 1.25  } },
  { pattern: "gpt-5-*",         pricing: { input: 1.25,  output: 10.00, cached: 0.625, reasoning: 10.00,  cache_creation: 1.25  } },
  { pattern: "gpt-5*",          pricing: { input: 1.25,  output: 10.00, cached: 0.625, reasoning: 10.00,  cache_creation: 1.25  } },
  { pattern: "gpt-4o-*",        pricing: { input: 0.15,  output: 0.60,  cached: 0.075, reasoning: 0.90,   cache_creation: 0.15  } },
  { pattern: "gpt-4o",          pricing: { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  } },
  { pattern: "gpt-4*",          pricing: { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  } },

  // --- o1 / o-series ---
  { pattern: "o1-*",            pricing: { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  } },
  { pattern: "o1",              pricing: { input: 15.00, output: 60.00, cached: 7.50,  reasoning: 90.00,  cache_creation: 15.00 } },
  { pattern: "o3-*",            pricing: { input: 2.00,  output: 8.00,  cached: 0.50,  reasoning: 8.00,   cache_creation: 2.00  } },
  { pattern: "o4-*",            pricing: { input: 1.10,  output: 4.40,  cached: 0.275, reasoning: 4.40,   cache_creation: 1.10  } },

  // --- Qwen ---
  { pattern: "qwen3.8-max*",    pricing: { input: 2.00,  output: 6.00,  cached: 0.20,  reasoning: 6.00,   cache_creation: 2.00  } },
  { pattern: "qwen3.8-flash*",  pricing: { input: 0.16,  output: 0.47,  cached: 0.016, reasoning: 0.47,   cache_creation: 0.16  } },
  { pattern: "qwen3.7-max*",    pricing: { input: 1.25,  output: 3.75,  cached: 0.25,  reasoning: 3.75,   cache_creation: 1.25  } },
  { pattern: "qwen3.7-plus*",   pricing: { input: 0.574, output: 2.294, cached: 0.057, reasoning: 2.294,  cache_creation: 0.574 } },
  { pattern: "qwen3.6-plus*",   pricing: { input: 0.165, output: 0.99,  cached: 0.017, reasoning: 0.99,   cache_creation: 0.165 } },
  { pattern: "qwen3-coder-*",   pricing: { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  } },
  { pattern: "qwen*-coder-*",   pricing: { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  } },
  { pattern: "qwen*",           pricing: { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  } },

  // --- Kimi ---
  { pattern: "kimi-*-thinking",  pricing: { input: 1.80,  output: 7.20,  cached: 0.90,  reasoning: 10.80,  cache_creation: 1.80  } },
  { pattern: "kimi-k3*",        pricing: { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.00  } },
  { pattern: "kimi-k2*",        pricing: { input: 1.20,  output: 4.80,  cached: 0.60,  reasoning: 7.20,   cache_creation: 1.20  } },
  { pattern: "kimi-*",          pricing: { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  } },

  // --- DeepSeek ---
  { pattern: "deepseek-*reasoner*", pricing: { input: 0.14, output: 0.28, cached: 0.0028, reasoning: 0.28, cache_creation: 0.14 } },
  { pattern: "deepseek-r*",     pricing: { input: 0.14,  output: 0.28,  cached: 0.0028, reasoning: 0.28,   cache_creation: 0.14  } },
  { pattern: "deepseek-v*",     pricing: { input: 0.14,  output: 0.28,  cached: 0.0028, reasoning: 0.28,   cache_creation: 0.14  } },
  { pattern: "deepseek-*",      pricing: { input: 0.14,  output: 0.28,  cached: 0.0028, reasoning: 0.28,   cache_creation: 0.14  } },

  // --- GLM ---
  { pattern: "glm-5.3-flash*",  pricing: { input: 0.15,  output: 0.50,  cached: 0.03,  reasoning: 0.50,   cache_creation: 0.15  } },
  { pattern: "glm-5.3*",        pricing: { input: 1.40,  output: 4.40,  cached: 0.26,  reasoning: 4.40,   cache_creation: 1.40  } },
  { pattern: "glm-5*",          pricing: { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  } },
  { pattern: "glm-4*",          pricing: { input: 0.75,  output: 3.00,  cached: 0.375, reasoning: 4.50,   cache_creation: 0.75  } },
  { pattern: "glm-*",           pricing: { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  } },

  // --- OpenCode / Free models ---
  { pattern: "*space-bunny*",   pricing: { input: 0.00,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  } },
  { pattern: "*omen-alpha*",    pricing: { input: 0.00,  output: 0.00,  cached: 0.00,  reasoning: 0.00,   cache_creation: 0.00  } },

  // --- MiniMax ---
  { pattern: "MiniMax-*",       pricing: { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  } },
  { pattern: "minimax-*",       pricing: { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  } },

  // --- Grok ---
  { pattern: "grok-code-*",     pricing: { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  } },
  { pattern: "grok-*",          pricing: { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  } },
];

/**
 * Match a model ID against a glob pattern (* = wildcard). Case-insensitive:
 * registry ids mix casing (e.g. "MiniMax-M2.5" vs "minimax-m2.5").
 *
 * Compiled patterns are cached on the function itself. getPricingForModel walks
 * the whole PATTERN_PRICING list on every lookup, so building each RegExp from
 * scratch paid compilation once per pattern per resolution — measured ~32x
 * slower than the cached form (9router #4628/#4622).
 *
 * The cache hangs off the function rather than a module-scope const: this file
 * is bundled into the server/CLI chunks, and a module-scope binding read during
 * module init is a TDZ hazard there.
 */
export function matchPattern(pattern, model) {
  const cache = matchPattern._cache || (matchPattern._cache = new Map());
  let regex = cache.get(pattern);
  if (regex === undefined) {
    regex = new RegExp("^" + pattern.split("*").map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i");
    cache.set(pattern, regex);
  }
  return regex.test(model);
}

// Replace researched provider tariffs as complete quotes, not partial merges
// with stale inferred cache-write fees or another route's context tiers.
for (const [provider, models] of Object.entries(REVIEWED_MODEL_METADATA)) {
  for (const model of Object.keys(models)) {
    const pricing = getReviewedPricing(provider, model);
    if (pricing) (PROVIDER_PRICING[provider] ||= {})[model] = pricing;
  }
}

// Keep delivered-speed quotes provider-scoped; MODEL_PRICING is also used for
// subscription/reseller reference estimates that have no matching API invoice.
for (const [model, service_tiers] of Object.entries(OPENAI_PROCESSING_SPEED_PRICING)) {
  const writes = OPENAI_NATIVE_CACHE_WRITE_PRICING[model];
  PROVIDER_PRICING.openai[model] = {
    ...PROVIDER_PRICING.openai[model], ...writes,
    tier: { ...PROVIDER_PRICING.openai[model]?.tier, ...writes.tier }, service_tiers,
  };
}

// Literal keys always win. Case folding is metadata fallback only; never choose
// between multiple spellings, and never inherit Object.prototype entries.
function exactPrice(table, model, allowCaseFold = false) {
  if (!table) return null;
  if (Object.hasOwn(table, model)) return table[model];
  if (!allowCaseFold) return null;
  const matches = Object.keys(table).filter(key => key.toLowerCase() === model.toLowerCase());
  return matches.length === 1 ? table[matches[0]] : null;
}

/** Resolve metadata prices without changing the literal upstream request ID. */
export function getPricingForModel(provider, model) {
  if (!model) return null;
  const providerTables = getProviderIdentityTokens(provider)
    .filter(token => Object.hasOwn(PROVIDER_PRICING, token))
    .map(token => ({ table: PROVIDER_PRICING[token], literalOnly: LITERAL_ONLY_PRICING_PROVIDERS.includes(token) }));
  const seen = new Set();

  function resolve(id) {
    if (seen.has(id)) return null;
    seen.add(id);
    // Explicit provider and full-ID tariffs beat free namespaces and aliases.
    for (const { table } of providerTables) {
      const price = exactPrice(table, id);
      if (price) return price;
    }
    const upstream = getDeclaredUpstreamModelId(provider, id);
    const reviewedPrice = getReviewedPricing(provider, id);
    // Provider-reviewed native spellings beat generic leaf tariffs. Full-ID
    // tariffs and registry-declared aliases retain their literal precedence.
    if (!id.includes("/") && upstream === id && reviewedPrice) return reviewedPrice;
    const literal = exactPrice(MODEL_PRICING, id);
    if (literal) return literal;
    if (isFreeModel(id)) return ZERO_PRICING;
    const reviewed = getReviewedModelMetadata(provider, id);
    if (reviewed?.billing?.unverifiedPriceFields?.includes("input") &&
        reviewed.billing.unverifiedPriceFields.includes("output")) return null;

    for (const { table, literalOnly } of providerTables) {
      if (literalOnly) continue;
      const price = exactPrice(table, id, true);
      if (price) return price;
    }
    const full = exactPrice(MODEL_PRICING, id, true);
    if (full) return full;

    // Only registry-declared aliases: no guessed review/thinking/date stripping.
    if (upstream !== id) {
      const price = resolve(upstream);
      if (price) return price;
    }
    // Reviewed version spellings keep provider/namespace scope and the complete
    // quote (tiers and cache TTLs) before falling back to model-family estimates.
    if (reviewedPrice) return reviewedPrice;
    const base = id.includes("/") ? id.split("/").pop() : id;
    const canonical = exactPrice(MODEL_PRICING, base, true);
    if (canonical) return canonical;
    for (const { pattern, pricing } of PATTERN_PRICING) {
      if (matchPattern(pattern, base) || matchPattern(pattern, id)) return pricing;
    }
    return null;
  }
  return resolve(model);
}

/**
 * Get all provider pricing (for UI / API).
 * Returns PROVIDER_PRICING — consumers should fall back to MODEL_PRICING for unlisted models.
 */
export function getDefaultPricing() {
  return PROVIDER_PRICING;
}

/**
 * Resolve effective pricing rates considering context length tiers.
 * Many flagship models (GPT-6, GPT-5.4+, Grok 4.x, Gemini 3.1 Pro) charge higher
 * rates for long-context requests (>200k or >272k prompt tokens).
 *
 * @param {object} pricing - base pricing object
 * @param {number} inputTokens - total prompt / input tokens
 * @returns {object} pricing with tier rates applied if threshold is met
 */
export function resolveEffectivePricing(pricing, inputTokens) {
  if (!pricing || !pricing.tier) return pricing;
  const threshold = Number(pricing.tier.threshold);
  const reached = pricing.tier.inclusive === true ? inputTokens >= threshold : inputTokens > threshold;
  if (Number.isFinite(threshold) && threshold > 0 && reached) {
    return {
      ...pricing,
      ...pricing.tier,
      // Output-billed reasoning follows the output tier. A genuinely distinct
      // base reasoning tariff, or any explicit tier reasoning (even zero), wins.
      ...(pricing.tier.reasoning === undefined && pricing.tier.output !== undefined &&
          (pricing.reasoning === undefined || pricing.reasoning === pricing.output)
        ? { reasoning: pricing.tier.output } : {}),
      tier: pricing.tier,
    };
  }
  return pricing;
}

/**
 * Format cost for display
 * @param {number} cost
 * @returns {string}
 */
export function formatCost(cost) {
  if (cost === null || cost === undefined || isNaN(cost)) return "$0.00";
  return `$${cost.toFixed(2)}`;
}

/** Calculate the total estimate, or null when a used component has no tariff. */
export function calculateCostFromTokens(tokens, pricing) {
  return calculateCostBreakdown(tokens, pricing).totalCost;
}

function resolveDeliveredTierPricing(tokens, pricing) {
  const actual = tokens?.actualServiceTier;
  if (actual === "default") return pricing;
  if (actual != null) {
    // Auto describes selection policy, not delivered service. Do not infer a
    // Standard invoice from an echoed request or a future upstream tier value.
    if (!["fast", "priority", "ultrafast", "flex", "scale"].includes(actual)) return null;
    const tiers = pricing?.service_tiers;
    if (!tiers || typeof tiers !== "object") return null;
    if (Object.hasOwn(tiers, actual)) return tiers[actual];
    const alias = actual === "priority" ? "fast" : actual === "fast" ? "priority" : null;
    return alias && Object.hasOwn(tiers, alias) ? tiers[alias] : null;
  }
  return tokens?.serviceTierCostStatus === "unpriced" || tokens?.serviceTierCostStatus === "unconfirmed" ? null : pricing;
}

function tokenCost(tokens, rate) {
  if (tokens === 0) return 0;
  return Number.isFinite(rate) && rate >= 0 ? tokens * rate / 1000000 : null;
}

/**
 * Calculate component estimates from canonical cache-inclusive token counts.
 * Missing tariffs affect only used components; unknown is never a free rate.
 * @returns {{ inputCost: number|null, cachedCost: number|null, cacheCreationCost: number|null, outputCost: number|null, reasoningCost: number|null, totalCost: number|null }}
 */
export function calculateCostBreakdown(tokens, pricing) {
  const inputTokens = tokens?.prompt_tokens || tokens?.input_tokens || 0;
  // A premium quote is complete and independent of Standard. Missing premium
  // cache/output rates remain unknown; actual delivery always beats the request.
  pricing = resolveDeliveredTierPricing(tokens, pricing);
  const effectivePricing = resolveEffectivePricing(pricing, inputTokens);
  const cachedTokens = tokens?.cached_tokens || tokens?.cache_read_input_tokens || tokens?.prompt_cache_hit_tokens || 0;
  const cacheCreation1hTokens = tokens?.cache_creation_1h_tokens || 0;
  const cacheCreationTokens = tokens?.cache_creation_input_tokens ?? tokens?.cache_creation_tokens
    ?? ((tokens?.cache_creation_5m_tokens || 0) + cacheCreation1hTokens);
  const validLegacyWrites = [cacheCreationTokens, tokens?.cache_creation_5m_tokens ?? 0, cacheCreation1hTokens]
    .every(value => Number.isSafeInteger(value) && value >= 0)
    && (tokens?.cache_creation_5m_tokens ?? 0) + cacheCreation1hTokens <= cacheCreationTokens;
  const nativeWrite30m = tokens?.cache_write_30m_tokens ?? 0;
  const nativeWrite12h = tokens?.cache_write_12h_tokens ?? 0;
  const nativeWrites = tokens?.cache_write_tokens ?? nativeWrite30m + nativeWrite12h;
  const hasNativeWriteUsage = tokens && ["cache_write_tokens", "cache_write_30m_tokens", "cache_write_12h_tokens", "cache_write_invalid"]
    .some(field => Object.hasOwn(tokens, field));
  const validNativeWrites = !hasNativeWriteUsage || tokens?.cache_write_invalid !== true
    && [nativeWrites, nativeWrite30m, nativeWrite12h].every(value => Number.isSafeInteger(value) && value >= 0)
    && nativeWrite30m + nativeWrite12h === nativeWrites
    && nativeWrites + cacheCreationTokens + cachedTokens <= inputTokens;
  // Cache reads and writes are subsets of canonical input, not extra input.
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens - cacheCreationTokens - (Number.isFinite(nativeWrites) ? nativeWrites : 0));
  const inputCost = tokenCost(nonCachedInput, effectivePricing?.input);
  const cachedCost = tokenCost(cachedTokens, effectivePricing?.cached);
  // TTL counters are subsets of aggregate creation. Legacy aggregate-only
  // usage retains the documented five-minute tariff; one-hour writes never do.
  const cacheCreation5mCost = tokenCost(Math.max(0, cacheCreationTokens - cacheCreation1hTokens), effectivePricing?.cache_creation);
  const cacheCreation1hCost = tokenCost(cacheCreation1hTokens, effectivePricing?.cache_creation_1h);
  const nativeWrite30mCost = tokenCost(nativeWrite30m, effectivePricing?.cache_write_30m);
  const nativeWrite12hCost = tokenCost(nativeWrite12h, effectivePricing?.cache_write_12h);
  const nativeWriteCost = !validNativeWrites || nativeWrite30mCost === null || nativeWrite12hCost === null
    ? null : nativeWrite30mCost + nativeWrite12hCost;
  const cacheCreationCost = !validLegacyWrites || cacheCreation5mCost === null || cacheCreation1hCost === null || nativeWriteCost === null
    ? null : cacheCreation5mCost + cacheCreation1hCost + nativeWriteCost;

  // Completion already includes reasoning; a documented output tariff applies
  // when no distinct reasoning tariff is specified. Explicit null stays unknown.
  const outputTokens = tokens?.completion_tokens || tokens?.output_tokens || 0;
  const reasoningTokens = tokens?.reasoning_tokens || 0;
  const outputCost = tokenCost(Math.max(0, outputTokens - reasoningTokens), effectivePricing?.output);
  const reasoningRate = effectivePricing?.reasoning !== undefined ? effectivePricing.reasoning : effectivePricing?.output;
  const reasoningCost = tokenCost(reasoningTokens, reasoningRate);
  const totalCost = inputCost === null || cachedCost === null || cacheCreationCost === null || outputCost === null || reasoningCost === null
    ? null : inputCost + cachedCost + cacheCreationCost + outputCost + reasoningCost;
  return { inputCost, cachedCost, cacheCreationCost, outputCost, reasoningCost, totalCost };
}
