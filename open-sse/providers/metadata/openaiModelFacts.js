// Native OpenAI model cards and API guides. A context-window total, an
// independent input allowance, and an output maximum are separate facts.
const docs = "https://developers.openai.com/api/docs";
const catalog = "https://models.dev/api.json";
const cacheGuide = `${docs}/guides/prompt-caching#summary-of-model-differences`;
const reasoningGuide = `${docs}/guides/reasoning`;
const gpt5Launch = "https://openai.com/index/introducing-gpt-5-for-developers/";
const o3Guide = "https://developers.openai.com/cookbook/examples/partners/model_selection_guide/model_selection_guide";

const reasoning = {
  base: ["low", "medium", "high"],
  gpt5: ["minimal", "low", "medium", "high"],
  gpt51: ["none", "low", "medium", "high"],
  gpt52: ["none", "low", "medium", "high", "xhigh"],
  pro: ["medium", "high", "xhigh"],
  codex: ["low", "medium", "high", "xhigh"],
  flagship: ["low", "medium", "high", "xhigh", "max"],
  flagshipsWithNone: ["none", "low", "medium", "high", "xhigh", "max"],
};

const explicitCache = {
  source: cacheGuide,
  keyParameter: "prompt_cache_key",
  optionsParameter: "prompt_cache_options",
  breakpointParameter: "prompt_cache_breakpoint",
  minimumPrefixTokens: 1024,
  modes: ["implicit", "explicit"],
  defaultMode: "implicit",
  responsesTtls: ["30m", "12h"],
  defaultTtl: "30m",
};

const implicitCache = (retentionValues) => ({
  source: cacheGuide,
  keyParameter: "prompt_cache_key",
  explicitBreakpoints: false,
  retentionParameter: "prompt_cache_retention",
  retentionValues,
});
const inMemoryCache = implicitCache(["in_memory"]);
const extendedCache = implicitCache(["in_memory", "24h"]);
const extendedOnlyCache = implicitCache(["24h"]);

const fullContext = { contextWindow: 1050000, maxInput: 922000, maxOutput: 128000 };
const classicContext = { contextWindow: 400000, maxInput: 272000, maxOutput: 128000 };
const gpt41Context = { contextWindow: 1047576, maxInput: null, maxOutput: 32768 };
const gpt4oContext = { contextWindow: 128000, maxInput: null, maxOutput: 16384 };
const oContext = { contextWindow: 200000, maxInput: null, maxOutput: 100000 };

const fullReasoning = { limits: fullContext, efforts: reasoning.flagship, cache: explicitCache };
const disableableFullReasoning = { ...fullReasoning, efforts: reasoning.flagshipsWithNone, defaultEffort: "medium" };
const fixedLegacyReasoning = { limits: classicContext, efforts: reasoning.gpt5, defaultEffort: "medium", reasoningSource: gpt5Launch };
const gpt54 = { limits: fullContext, inputSource: catalog, efforts: reasoning.gpt52, defaultEffort: "none", cache: extendedCache };
const gpt54Compact = { limits: classicContext, efforts: reasoning.gpt52, defaultEffort: "none", cache: inMemoryCache };

const modelFacts = {
  "gpt-6.2-astra": fullReasoning,
  "gpt-6.2-sol": fullReasoning,
  "gpt-6.1-sol": { ...fullReasoning, defaultEffort: "medium" },
  "gpt-6.1-terra": disableableFullReasoning,
  "gpt-6-astra": fullReasoning,
  "gpt-6-sol": disableableFullReasoning,
  "gpt-6-luna": disableableFullReasoning,
  "gpt-5.6-sol": disableableFullReasoning,
  "gpt-5.6-terra": disableableFullReasoning,
  "gpt-5.6-luna": disableableFullReasoning,
  "gpt-5.6-cyber": { limits: classicContext, cache: explicitCache },
  "chat-latest": { limits: classicContext },
  "gpt-5.5": { ...gpt54, defaultEffort: "medium", cache: extendedOnlyCache },
  "gpt-5.5-pro": { limits: fullContext, inputSource: catalog, efforts: reasoning.pro, defaultEffort: "high", cache: extendedOnlyCache },
  "gpt-5.4": gpt54,
  "gpt-5.4-pro": { limits: fullContext, inputSource: catalog, efforts: reasoning.pro, defaultEffort: "medium" },
  "gpt-5.4-mini": gpt54Compact,
  "gpt-5.4-nano": gpt54Compact,
  "gpt-5.3-codex": { limits: classicContext, efforts: reasoning.codex, cache: inMemoryCache },
  "gpt-5.2": { limits: classicContext, inputSource: catalog, efforts: reasoning.gpt52, defaultEffort: "none", cache: extendedCache },
  "gpt-5.2-pro": { limits: classicContext, inputSource: catalog, efforts: reasoning.pro },
  "gpt-5.1": { limits: classicContext, inputSource: catalog, efforts: reasoning.gpt51, defaultEffort: "none", cache: extendedCache },
  "gpt-5": { ...fixedLegacyReasoning, cache: extendedCache },
  "gpt-5-mini": { ...fixedLegacyReasoning, cache: inMemoryCache },
  "gpt-5-nano": { ...fixedLegacyReasoning, cache: inMemoryCache },
  "gpt-5-pro": { limits: { ...classicContext, maxOutput: 272000 }, inputSource: catalog, efforts: ["high"], defaultEffort: "high" },
  "gpt-4.1": { limits: gpt41Context, cache: extendedCache },
  "gpt-4.1-mini": { limits: gpt41Context, cache: inMemoryCache },
  "gpt-4.1-nano": { limits: gpt41Context, cache: inMemoryCache },
  "gpt-4o": { limits: gpt4oContext, cache: inMemoryCache },
  "gpt-4o-mini": { limits: gpt4oContext, cache: inMemoryCache },
  "gpt-4-turbo": { limits: { ...gpt4oContext, maxOutput: 4096 } },
  o3: { limits: oContext, efforts: reasoning.base, reasoningSource: o3Guide, cache: inMemoryCache },
  "o3-mini": { limits: oContext, efforts: reasoning.base, reasoningSource: "https://openai.com/index/openai-o3-mini/", cache: inMemoryCache },
  "o3-pro": { limits: oContext },
  "o4-mini": { limits: oContext, efforts: reasoning.base, reasoningSource: o3Guide, cache: inMemoryCache },
  o1: { limits: oContext, cache: inMemoryCache },
  "o1-pro": { limits: oContext },
};

export function applyOpenAIModelFacts(models) {
  for (const [id, { limits, inputSource, efforts, defaultEffort, reasoningSource, cache }] of Object.entries(modelFacts)) {
    const entry = models[id];
    const modelCard = `${docs}/models/${id}`;
    Object.assign(entry.capabilities, limits);
    const fieldSources = { ...entry.limits.fieldSources, contextWindow: modelCard, maxOutput: modelCard };
    if (limits.maxInput !== null) fieldSources.maxInput = inputSource || modelCard;
    entry.limits.fieldSources = fieldSources;
    if (limits.maxInput === null) {
      entry.limits.unverifiedCapabilityFields = [...new Set([...(entry.limits.unverifiedCapabilityFields || []), "maxInput"])];
    }
    if (efforts) {
      entry.capabilities.thinkingEfforts = efforts;
      entry.capabilities.thinkingEffortSupported = true;
      entry.capabilities.thinkingCanDisable = efforts.includes("none");
      entry.limits.apiReasoningEfforts = efforts;
      entry.limits.apiReasoningEffortSource = reasoningSource || modelCard;
    }
    if (defaultEffort) entry.limits.apiDefaultReasoningEffort = defaultEffort;
    if (cache) entry.limits.apiPromptCaching = cache;
    const source = reasoningSource || (id.startsWith("gpt-6.2-") ? reasoningGuide : modelCard);
    entry.sources = [...new Set([...entry.sources, modelCard, source, ...(cache ? [cacheGuide] : [])])];
  }
  models["gpt-5.4"].limits.apiFastLongContextFallback = {
    inputThreshold: 272000,
    serviceTier: "default",
    source: `${docs}/guides/latest-model?model=gpt-5.4`,
  };
}
