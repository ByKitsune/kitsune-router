// Native public OpenAI API quotes only, USD per million tokens. These are not
// Codex subscription credits, reseller estimates, or account entitlement.
// Every numeric rate is a literal table cell, never a speed multiplier.
export const OPENAI_TOKEN_PRICING_SOURCE = {
  url: "https://developers.openai.com/api/docs/pricing.md",
  capturedAtUtc: "2026-10-21T10:47:37.142421Z",
  sha256: "129d6019819379a6f30edc0811d4631ddb085dcd4b3b1d0012a945cd1af1bfbf",
  currency: "USD",
  unit: "1M tokens",
};

// A dash/unpublished component is unknown, not free or a Standard fallback.
// Output includes reasoning. Native 30m/12h writes replace ordinary input for
// those tokens; they are not Anthropic 5m/1h cache_creation fees.
const unknownComponents = {
  input: null, output: null, cached: null, reasoning: null,
  cache_creation: null, cache_creation_1h: null,
  cache_write_30m: null, cache_write_12h: null,
};
const tokenQuote = rates => ({
  ...unknownComponents,
  reasoning: rates.output ?? null,
  ...rates,
  ...(rates.tier ? { tier: { ...unknownComponents, reasoning: rates.tier.output ?? null, ...rates.tier } } : {}),
});
const tokenQuotes = rows => Object.fromEntries(Object.entries(rows).map(([model, rates]) => [model, tokenQuote(rates)]));

// All literal Standard text-token rows: flagship/legacy, Cyber, Rosalind, and
// specialized text/embedding/moderation tables. Audio/image modality tariffs,
// per-character/minute prices, tools, and fine-tuned rates are separate units.
// Restricted IDs here are factual quotes, not registry recommendations.
export const OPENAI_STANDARD_TOKEN_PRICING = tokenQuotes({
  "gpt-6-astra": { input: 10, output: 50, cached: 1, cache_write_30m: 12.5, cache_write_12h: 25, tier: { threshold: 272000, inclusive: false, input: 20, output: 75, cached: 2, cache_write_30m: 25, cache_write_12h: 50 } },
  "gpt-6.1-sol": { input: 2, output: 10, cached: 0.1, cache_write_30m: 2.5, cache_write_12h: 5, tier: { threshold: 272000, inclusive: false, input: 4, output: 15, cached: 0.2, cache_write_30m: 5, cache_write_12h: 10 } },
  "gpt-6-luna": { input: 0.1, output: 0.5, cached: 0.01, cache_write_30m: 0.125, cache_write_12h: 0.25, tier: { threshold: 272000, inclusive: false, input: 0.2, output: 0.75, cached: 0.02, cache_write_30m: 0.25, cache_write_12h: 0.5 } },
  "gpt-6-sol": { input: 2, output: 10, cached: 0.2, cache_write_30m: 2.5, cache_write_12h: 5, tier: { threshold: 272000, inclusive: false, input: 4, output: 15, cached: 0.4, cache_write_30m: 5, cache_write_12h: 10 } },
  "gpt-5.6-sol": { input: 4, output: 20, cached: 0.4, cache_write_30m: 5, cache_write_12h: 10, tier: { threshold: 272000, inclusive: false, input: 8, output: 30, cached: 0.8, cache_write_30m: 10, cache_write_12h: 20 } },
  "gpt-5.6-terra": { input: 2, output: 12, cached: 0.2, cache_write_30m: 2.5, cache_write_12h: 5, tier: { threshold: 272000, inclusive: false, input: 4, output: 18, cached: 0.4, cache_write_30m: 5, cache_write_12h: 10 } },
  "gpt-5.6-luna": { input: 0.2, output: 1.2, cached: 0.02, cache_write_30m: 0.25, cache_write_12h: 0.5, tier: { threshold: 272000, inclusive: false, input: 0.4, output: 1.8, cached: 0.04, cache_write_30m: 0.5, cache_write_12h: 1 } },
  "gpt-5.5": { input: 5, output: 30, cached: 0.5, tier: { threshold: 272000, inclusive: false, input: 10, output: 45, cached: 1 } },
  "gpt-5.5-pro": { input: 30, output: 180, tier: { threshold: 272000, inclusive: false, input: 60, output: 270 } },
  "gpt-5.4": { input: 2.5, output: 15, cached: 0.25, tier: { threshold: 272000, inclusive: false, input: 5, output: 22.5, cached: 0.5 } },
  "gpt-5.4-pro": { input: 30, output: 180, tier: { threshold: 272000, inclusive: false, input: 60, output: 270 } },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cached: 0.075 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25, cached: 0.02 },
  "gpt-5.2": { input: 1.75, output: 14, cached: 0.175 },
  "gpt-5.2-pro": { input: 21, output: 168 },
  "gpt-5.1": { input: 1.25, output: 10, cached: 0.125 },
  "gpt-5": { input: 1.25, output: 10, cached: 0.125 },
  "gpt-5-mini": { input: 0.25, output: 2, cached: 0.025 },
  "gpt-5-nano": { input: 0.05, output: 0.4, cached: 0.005 },
  "gpt-5-pro": { input: 15, output: 120 },
  "gpt-4.1": { input: 2, output: 8, cached: 0.5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cached: 0.1 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4, cached: 0.025 },
  "gpt-4o": { input: 2.5, output: 10, cached: 1.25 },
  "gpt-4o-2024-05-13": { input: 5, output: 15 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cached: 0.075 },
  "o1": { input: 15, output: 60, cached: 7.5 },
  "o1-pro": { input: 150, output: 600 },
  "o3-pro": { input: 20, output: 80 },
  "o3": { input: 2, output: 8, cached: 0.5 },
  "o4-mini": { input: 1.1, output: 4.4, cached: 0.275 },
  "o3-mini": { input: 1.1, output: 4.4, cached: 0.55 },
  "gpt-4-turbo-2024-04-09": { input: 10, output: 30 },
  "gpt-4-0613": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "gpt-3.5-turbo-0125": { input: 0.5, output: 1.5 },
  "gpt-5.6-cyber": { input: 12.5, output: 75, cached: 1.25, cache_write_30m: 15.625, cache_write_12h: 31.25, tier: { threshold: 272000, inclusive: false, input: null, output: null, cached: null } },
  "gpt-5.5-cyber": { input: 12.5, output: 75, cached: 1.25, tier: { threshold: 272000, inclusive: false, input: null, output: null, cached: null } },
  "gpt-rosalind-research": { input: 5, output: 25, cached: 0.5 },
  "gpt-rosalind-discovery": { input: 5, output: 25, cached: 0.5 },
  "chat-latest": { input: 5, output: 30, cached: 0.5 },
  "gpt-5.3-codex": { input: 1.75, output: 14, cached: 0.175 },
  "gpt-5-search-api": { input: 1.25, output: 10, cached: 0.125 },
  "text-embedding-3-small": { input: 0.02 },
  "text-embedding-3-large": { input: 0.13 },
  "text-embedding-ada-002": { input: 0.1 },
  "omni-moderation-latest": { input: 0 },
});

// Complete, independent mode quotes. A missing mode (including Scale) is not
// priced. Explicit-null >272K cells prevent extrapolating short Fast prices.
export const OPENAI_PROCESSING_SPEED_PRICING = Object.fromEntries(Object.entries({
  "gpt-6-astra": {
    fast: { input: 20, cached: 2, output: 100, cache_write_30m: 25, cache_write_12h: 50, tier: { threshold: 272000, inclusive: false, input: 40, cached: 4, output: 150, cache_write_30m: 50, cache_write_12h: 100 } },
    ultrafast: { input: 60, cached: 6, output: 300, cache_write_30m: 75, cache_write_12h: 150, tier: { threshold: 272000, inclusive: false, input: 120, cached: 12, output: 450, cache_write_30m: 150, cache_write_12h: 300 } },
    flex: { input: 5, cached: 0.5, output: 25, cache_write_30m: 6.25, cache_write_12h: 12.5, tier: { threshold: 272000, inclusive: false, input: 10, cached: 1, output: 37.5, cache_write_30m: 12.5, cache_write_12h: 25 } },
  },
  "gpt-6.1-sol": {
    fast: { input: 4, cached: 0.2, output: 20, cache_write_30m: 5, cache_write_12h: 10, tier: { threshold: 272000, inclusive: false, input: 8, cached: 0.4, output: 30, cache_write_30m: 10, cache_write_12h: 20 } },
    ultrafast: { input: 12, cached: 0.6, output: 60, cache_write_30m: 15, cache_write_12h: 30, tier: { threshold: 272000, inclusive: false, input: 24, cached: 1.2, output: 90, cache_write_30m: 30, cache_write_12h: 60 } },
    flex: { input: 1, cached: 0.05, output: 5, cache_write_30m: 1.25, cache_write_12h: 2.5, tier: { threshold: 272000, inclusive: false, input: 2, cached: 0.1, output: 7.5, cache_write_30m: 2.5, cache_write_12h: 5 } },
  },
  "gpt-6-luna": {
    fast: { input: 0.2, cached: 0.02, output: 1, cache_write_30m: 0.25, cache_write_12h: 0.5, tier: { threshold: 272000, inclusive: false, input: 0.4, cached: 0.04, output: 1.5, cache_write_30m: 0.5, cache_write_12h: 1 } },
    flex: { input: 0.05, cached: 0.005, output: 0.25, cache_write_30m: 0.0625, cache_write_12h: 0.125, tier: { threshold: 272000, inclusive: false, input: 0.1, cached: 0.01, output: 0.375, cache_write_30m: 0.125, cache_write_12h: 0.25 } },
  },
  "gpt-6-sol": {
    fast: { input: 4, output: 20, cached: 0.4, cache_write_30m: 5, cache_write_12h: 10, tier: { threshold: 272000, inclusive: false, input: 8, output: 30, cached: 0.8, cache_write_30m: 10, cache_write_12h: 20 } },
    flex: { input: 1, output: 5, cached: 0.1, cache_write_30m: 1.25, cache_write_12h: 2.5, tier: { threshold: 272000, inclusive: false, input: 2, output: 7.5, cached: 0.2, cache_write_30m: 2.5, cache_write_12h: 5 } },
  },
  "gpt-5.6-sol": {
    fast: { input: 8, output: 40, cached: 0.8, cache_write_30m: 10, cache_write_12h: 20, tier: { threshold: 272000, inclusive: false, input: 16, output: 60, cached: 1.6, cache_write_30m: 20, cache_write_12h: 40 } },
    flex: { input: 2, output: 10, cached: 0.2, cache_write_30m: 2.5, cache_write_12h: 5, tier: { threshold: 272000, inclusive: false, input: 4, output: 15, cached: 0.4, cache_write_30m: 5, cache_write_12h: 10 } },
  },
  "gpt-5.6-terra": {
    fast: { input: 4, output: 24, cached: 0.4, cache_write_30m: 5, cache_write_12h: 10, tier: { threshold: 272000, inclusive: false, input: 8, output: 36, cached: 0.8, cache_write_30m: 10, cache_write_12h: 20 } },
    flex: { input: 1, output: 6, cached: 0.1, cache_write_30m: 1.25, cache_write_12h: 2.5, tier: { threshold: 272000, inclusive: false, input: 2, output: 9, cached: 0.2, cache_write_30m: 2.5, cache_write_12h: 5 } },
  },
  "gpt-5.6-luna": {
    fast: { input: 0.4, output: 2.4, cached: 0.04, cache_write_30m: 0.5, cache_write_12h: 1, tier: { threshold: 272000, inclusive: false, input: 0.8, output: 3.6, cached: 0.08, cache_write_30m: 1, cache_write_12h: 2 } },
    flex: { input: 0.1, output: 0.6, cached: 0.01, cache_write_30m: 0.125, cache_write_12h: 0.25, tier: { threshold: 272000, inclusive: false, input: 0.2, output: 0.9, cached: 0.02, cache_write_30m: 0.25, cache_write_12h: 0.5 } },
  },
  "gpt-5.5": {
    fast: { input: 12.5, output: 75, cached: 1.25, tier: { threshold: 272000, inclusive: false, input: null, output: null, cached: null } },
    flex: { input: 2.5, output: 15, cached: 0.25, tier: { threshold: 272000, inclusive: false, input: 5, output: 22.5, cached: 0.5 } },
  },
  "gpt-5.5-pro": {
    flex: { input: 15, output: 90, tier: { threshold: 272000, inclusive: false, input: null, output: null, cached: null } },
  },
  "gpt-5.4": {
    fast: { input: 5, output: 30, cached: 0.5, tier: { threshold: 272000, inclusive: false, input: null, output: null, cached: null } },
    flex: { input: 1.25, output: 7.5, cached: 0.13, tier: { threshold: 272000, inclusive: false, input: 2.5, output: 11.25, cached: 0.25 } },
  },
  "gpt-5.4-pro": {
    flex: { input: 15, output: 90, tier: { threshold: 272000, inclusive: false, input: 30, output: 135 } },
  },
  "gpt-5.4-mini": {
    fast: { input: 1.5, output: 9, cached: 0.15 },
    flex: { input: 0.375, output: 2.25, cached: 0.0375 },
  },
  "gpt-5.4-nano": { flex: { input: 0.1, output: 0.625, cached: 0.01 } },
  "gpt-5.2": {
    fast: { input: 3.5, output: 28, cached: 0.35 },
    flex: { input: 0.875, output: 7, cached: 0.0875 },
  },
  "gpt-5.1": {
    fast: { input: 2.5, output: 20, cached: 0.25 },
    flex: { input: 0.625, output: 5, cached: 0.0625 },
  },
  "gpt-5": {
    fast: { input: 2.5, output: 20, cached: 0.25 },
    flex: { input: 0.625, output: 5, cached: 0.0625 },
  },
  "gpt-5-mini": {
    fast: { input: 0.45, output: 3.6, cached: 0.045 },
    flex: { input: 0.125, output: 1, cached: 0.0125 },
  },
  "gpt-5-nano": { flex: { input: 0.025, output: 0.2, cached: 0.0025 } },
  "gpt-4.1": { fast: { input: 3.5, output: 14, cached: 0.875 } },
  "gpt-4.1-mini": { fast: { input: 0.7, output: 2.8, cached: 0.175 } },
  "gpt-4.1-nano": { fast: { input: 0.2, output: 0.8, cached: 0.05 } },
  "gpt-4o": { fast: { input: 4.25, output: 17, cached: 2.125 } },
  "gpt-4o-2024-05-13": { fast: { input: 8.75, output: 26.25 } },
  "gpt-4o-mini": { fast: { input: 0.25, output: 1, cached: 0.125 } },
  "o3": {
    fast: { input: 3.5, output: 14, cached: 0.875 },
    flex: { input: 1, output: 4, cached: 0.25 },
  },
  "o4-mini": {
    fast: { input: 2, output: 8, cached: 0.5 },
    flex: { input: 0.55, output: 2.2, cached: 0.138 },
  },
  "gpt-5.3-codex": { fast: { input: 3.5, output: 28, cached: 0.35 } },
}).map(([model, modes]) => [model, tokenQuotes(modes)]));

// Compatibility projection for existing native cache-write consumers. Every
// Standard key is present (including unknown writes) so the old integration
// loop can import this safely. This is NOT a replacement for integrating the
// complete Standard quotes: write fields alone cannot supply missing input,
// cached-input or output prices, especially dated GPT-4o.
export const OPENAI_NATIVE_CACHE_WRITE_PRICING = Object.fromEntries(
  Object.entries(OPENAI_STANDARD_TOKEN_PRICING).map(([model, quote]) => [model, {
    cache_creation: null,
    cache_creation_1h: null,
    cache_write_30m: quote.cache_write_30m,
    cache_write_12h: quote.cache_write_12h,
    ...(quote.tier ? { tier: {
      cache_creation: null,
      cache_creation_1h: null,
      cache_write_30m: quote.tier.cache_write_30m,
      cache_write_12h: quote.tier.cache_write_12h,
    } } : {}),
  }]),
);
