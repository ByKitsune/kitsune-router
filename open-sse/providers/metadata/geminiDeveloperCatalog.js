import {
  GEMINI_API_DEPRECATIONS_URL, GEMINI_API_PRICED_MODELS, GEMINI_API_PRICING_URL,
  getGeminiApiBillingRedirect, getGeminiApiCacheStorage, getGeminiApiPriceSchedule,
} from "../../config/geminiApiPricing.js";

const docs = "https://aistudio.google.com/docs";

const gemini4 = {
  "gemini-4-carbon": {
    description: "Gemini 4 reasoning model for long-horizon coding, science, and agentic work.",
    output: 32768, defaultEffort: "medium", efforts: ["low", "medium", "high"],
  },
  "gemini-4-hydrogen": {
    description: "Gemini 4 workhorse for everyday coding, multimodal reasoning, and agentic workflows.",
    output: 65536, defaultEffort: "high", efforts: ["low", "medium", "high", "xhigh"],
  },
};

export function applyGeminiDeveloperCatalog(metadata) {
  const gemini = metadata.gemini;
  for (const [id, model] of Object.entries(gemini4)) {
    gemini[id] = {
      description: model.description,
      capabilities: {
        contextWindow: 1048576, maxOutput: model.output,
        vision: true, pdf: true, audioInput: true, videoInput: true, imageOutput: false, audioOutput: false,
        reasoning: true, tools: true, search: true, structuredOutput: true,
        thinkingFormat: "gemini-level", thinkingCanDisable: false,
        thinkingEffortSupported: true, thinkingEfforts: model.efforts,
      },
      sources: [`${docs}/models/${id}`, `${docs}/thinking#thinking-levels`, `${docs}/long-decode?generate-content=true`],
      limits: {
        scope: "public-generate-content-rest-api", authenticatedRouteVerified: false,
        contextWindowStatus: "Shared input, thinking, and output window. No independent input allowance is published.",
        maxOutputScope: "Direct REST GenerateContent per request without continuation.",
        nonStreamMaxOutput: model.output, streamMaxOutput: 65536,
        longDecodeMaxOutput: 1048576, continuationImplemented: false,
        apiDefaultThinkingLevel: model.defaultEffort, explicitCachingSupported: false,
        unverifiedCapabilityFields: ["maxInput"],
      },
    };
  }

  for (const id of GEMINI_API_PRICED_MODELS) {
    const record = gemini[id];
    const schedule = getGeminiApiPriceSchedule(id);
    const { nextRates: _genericTransition, ...billing } = record.billing || {};
    const targetId = schedule.redirectTo || id;
    const sources = [...(record.sources || []), `${GEMINI_API_PRICING_URL}#${targetId}`];
    if (schedule.redirectTo) sources.push(GEMINI_API_DEPRECATIONS_URL);
    record.sources = [...new Set(sources)];
    record.pricing = schedule.initial || record.pricing;
    record.billing = {
      ...billing, kind: "api", currency: "USD", unit: "1M tokens", reviewedAt: "2026-11-17", invoiceVerified: false,
      ...(schedule.effectiveFrom && { effectiveFrom: schedule.effectiveFrom }),
      ...(schedule.through && { validThrough: schedule.through }),
      ...(schedule.next && { publishedNextRates: { from: schedule.nextOn, ...schedule.next } }),
      ...(schedule.storage && { cacheStorage: getGeminiApiCacheStorage(id, { timestamp: schedule.effectiveFrom }) }),
      ...(schedule.nextStorage && { nextCacheStorage: { from: schedule.nextOn, currency: "USD", unit: "1M token-hours", price: schedule.nextStorage.default, service_tiers: schedule.nextStorage } }),
      ...(id.startsWith("gemini-4-") && { note: "Published paid Gemini Developer API rates. Context caching is implicit only. Output pricing includes thinking." }),
    };
    if (schedule.redirectTo) {
      record.limits = {
        ...record.limits,
        documentedBillingRedirect: getGeminiApiBillingRedirect(id),
      };
    }
  }
}
