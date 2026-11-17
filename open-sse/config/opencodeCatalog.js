export const OPENCODE_CATALOG_URLS = Object.freeze({
  zen: "https://opencode.ai/zen/v1/models",
  go: "https://opencode.ai/zen/go/v1/models",
});

const formats = {
  "chat-completions": { format: "openai", path: "openai/v1", suffix: "/chat/completions", auth: "Authorization", scheme: "bearer" },
  responses: { format: "openai-responses", path: "openai/v1", suffix: "/responses", auth: "Authorization", scheme: "bearer" },
  messages: { format: "claude", path: "anthropic/v1", suffix: "/messages", auth: "x-api-key", scheme: "raw", anthropicVersion: true },
  "generate-content": { format: "gemini", path: "google/v1beta", suffix: "/models", auth: "x-goog-api-key", scheme: "raw" },
};

function apiBase(product, path) {
  return `https://opencode.ai/inference/${product === "go" ? "go/" : ""}${path}`;
}

export function openCodeTransports(product, headers) {
  return Object.values(formats).map(({ format, path, suffix, auth, scheme, anthropicVersion }) => ({
    format, baseUrl: apiBase(product, path) + suffix, headers,
    auth: { combined: true, header: auth, scheme, ...(anthropicVersion && { anthropicVersion }) },
  }));
}

const rate = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const limit = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const modalities = (values, mime) => Array.isArray(values) ? values.some(value => value === mime || value?.startsWith?.(`${mime}/`)) : null;

function priceFields(input, output) {
  return {
    input: rate(input?.price), output: rate(output?.price), cached: rate(input?.cache?.read),
    cache_creation: rate(input?.cache?.write) ?? rate(input?.cache?.write?.["5m"]),
    cache_creation_1h: rate(input?.cache?.write?.["1h"]),
    cache_write_30m: rate(input?.cache?.write?.["30m"]),
    cache_write_12h: rate(input?.cache?.write?.["12h"]),
  };
}

function textPricing({ input, output } = {}) {
  const quote = priceFields(input, output);
  const overrides = [...(input?.overrides || []), ...(output?.overrides || [])];
  if (!overrides.length) return quote;
  const threshold = limit(overrides[0].when?.context?.gt);
  // A calculator quote can represent one shared, strict long-context boundary.
  // Preserve unknown pricing rather than filling a rule we cannot execute.
  if (!threshold || input?.overrides?.length !== 1 || output?.overrides?.length !== 1
    || overrides.some(row => row.when?.context?.gt !== threshold)) return null;
  return { ...quote, tier: { threshold, inclusive: false, ...priceFields(input.overrides[0], output.overrides[0]) } };
}

const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
const boolean = value => typeof value === "boolean" ? value : null;

export function normalizeOpenCodeModel(row, product) {
  if (!row || row.type !== "chat" || !/^[a-z0-9][a-z0-9._-]*$/i.test(row.id || "")) return null;
  const supportedFormats = Object.entries(formats)
    .filter(([key, { path }]) => row.api?.[key]?.base_url === apiBase(product, path))
    .map(([, { format }]) => format);
  if (!supportedFormats.length) return null;
  const input = row.modalities?.input;
  const output = row.modalities?.output;
  const reasoning = row.capabilities?.reasoning;
  const efforts = Array.isArray(reasoning?.effort) ? reasoning.effort.filter(effort => EFFORTS.has(effort)) : [];
  const pricing = textPricing(row.cost?.text);
  return {
    id: row.id, name: typeof row.name === "string" && row.name ? row.name : row.id,
    targetFormat: supportedFormats[0], supportedFormats,
    ...(typeof row.canonical_id === "string" && { canonicalId: row.canonical_id }),
    ...(typeof row.description === "string" && { description: row.description }),
    capabilities: {
      contextWindow: limit(row.limit?.context), maxInput: limit(row.limit?.input), maxOutput: limit(row.limit?.output),
      vision: modalities(input, "image"), pdf: modalities(input, "application/pdf"),
      audioInput: modalities(input, "audio"), videoInput: modalities(input, "video"),
      imageOutput: modalities(output, "image"), audioOutput: modalities(output, "audio"),
      tools: boolean(row.capabilities?.tools?.supported), reasoning: boolean(reasoning?.supported),
      temperature: boolean(row.capabilities?.temperature), structuredOutput: boolean(row.capabilities?.structured_output),
      ...(efforts.length && { thinkingEffortSupported: true, thinkingEfforts: efforts }),
      ...(typeof reasoning?.toggle === "boolean" ? { thinkingCanDisable: reasoning.toggle }
        : efforts.length ? { thinkingCanDisable: efforts.includes("none") } : {}),
    },
    pricing,
    ...(row.cost?.audio && { audioPricing: row.cost.audio }),
  };
}

export function isFreeOpenCodeModel(model) {
  if (model.pricing?.input !== 0 || model.pricing.output !== 0) return false;
  return [model.pricing, model.pricing.tier].filter(Boolean).every(quote =>
    Object.entries(quote).every(([key, value]) => key === "threshold" || key === "tier" || value === null || value === false || value === 0),
  );
}

export function getOpenCodeRegistryModel({ id, name, targetFormat, supportedFormats }) {
  return { id, name, targetFormat, supportedFormats };
}
