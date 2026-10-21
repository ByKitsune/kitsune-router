// Native pricing keys, independent from reasoning effort and model aliases.
export const PRICING_SERVICE_TIERS = ["fast", "ultrafast", "flex", "scale"];
export const PRICING_RATE_FIELDS = ["input", "output", "cached", "reasoning", "cache_creation", "cache_creation_1h", "cache_write_30m", "cache_write_12h"];
export const LITERAL_ONLY_PRICING_PROVIDERS = ["tokenharbor"];

// Primary public quotes can identify a custom-compatible node without relying
// on its mutable display name, operator prefix, or installation-specific UUID.
export const CUSTOM_PRICING_ORIGINS = {
  "https://tokenharbor.ai": "tokenharbor",
};

export function getCustomPricingProvider(baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (url.username || url.password || url.search || url.hash) return null;
    return Object.hasOwn(CUSTOM_PRICING_ORIGINS, url.origin) ? CUSTOM_PRICING_ORIGINS[url.origin] : null;
  } catch {
    return null;
  }
}
