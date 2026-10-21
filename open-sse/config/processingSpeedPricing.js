// USD per million tokens: public OpenAI API pricing.md, captured 2026-10-21.
// SHA-256: 129d6019819379a6f30edc0811d4631ddb085dcd4b3b1d0012a945cd1af1bfbf
// These are not Codex subscription-credit multipliers or reseller quotes.
// Native 30m/12h cache writes use their own counters; never relabel them as
// Anthropic 5m/1h writes or infer a lifetime from aggregate-only usage.
export const OPENAI_NATIVE_CACHE_WRITE_PRICING = {
  "gpt-6-astra": { cache_write_30m: 12.5, cache_write_12h: 25, tier: { cache_write_30m: 25, cache_write_12h: 50 } },
  "gpt-6.1-sol": { cache_write_30m: 2.5, cache_write_12h: 5, tier: { cache_write_30m: 5, cache_write_12h: 10 } },
  "gpt-6-luna": { cache_write_30m: 0.125, cache_write_12h: 0.25, tier: { cache_write_30m: 0.25, cache_write_12h: 0.5 } },
};
export const OPENAI_PROCESSING_SPEED_PRICING = {
  "gpt-6-astra": {
    fast: { input: 20, cached: 2, output: 100, cache_write_30m: 25, cache_write_12h: 50, tier: { threshold: 272000, input: 40, cached: 4, output: 150, cache_write_30m: 50, cache_write_12h: 100 } },
    ultrafast: { input: 60, cached: 6, output: 300, cache_write_30m: 75, cache_write_12h: 150, tier: { threshold: 272000, input: 120, cached: 12, output: 450, cache_write_30m: 150, cache_write_12h: 300 } },
    flex: { input: 5, cached: 0.5, output: 25, cache_write_30m: 6.25, cache_write_12h: 12.5, tier: { threshold: 272000, input: 10, cached: 1, output: 37.5, cache_write_30m: 12.5, cache_write_12h: 25 } },
  },
  "gpt-6.1-sol": {
    fast: { input: 4, cached: 0.2, output: 20, cache_write_30m: 5, cache_write_12h: 10, tier: { threshold: 272000, input: 8, cached: 0.4, output: 30, cache_write_30m: 10, cache_write_12h: 20 } },
    ultrafast: { input: 12, cached: 0.6, output: 60, cache_write_30m: 15, cache_write_12h: 30, tier: { threshold: 272000, input: 24, cached: 1.2, output: 90, cache_write_30m: 30, cache_write_12h: 60 } },
    flex: { input: 1, cached: 0.05, output: 5, cache_write_30m: 1.25, cache_write_12h: 2.5, tier: { threshold: 272000, input: 2, cached: 0.1, output: 7.5, cache_write_30m: 2.5, cache_write_12h: 5 } },
  },
  "gpt-6-luna": {
    fast: { input: 0.2, cached: 0.02, output: 1, cache_write_30m: 0.25, cache_write_12h: 0.5, tier: { threshold: 272000, input: 0.4, cached: 0.04, output: 1.5, cache_write_30m: 0.5, cache_write_12h: 1 } },
    flex: { input: 0.05, cached: 0.005, output: 0.25, cache_write_30m: 0.0625, cache_write_12h: 0.125, tier: { threshold: 272000, input: 0.1, cached: 0.01, output: 0.375, cache_write_30m: 0.125, cache_write_12h: 0.25 } },
  },
};
