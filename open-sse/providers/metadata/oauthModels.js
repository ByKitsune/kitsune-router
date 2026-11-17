// Exact OAuth/IDE and hosted-route facts. Public evidence does not prove
// authenticated model entitlement. Captures, UTC timestamps, SHA-256 and source
// bundle provenance: /tmp/opencode/zenrouter-client-pricing-refresh-20261021/oauth-catalog.
// Null tariffs/limits deliberately block unrelated vendor and pattern guesses.
const blackboxPricingSource = "https://docs.blackbox.ai/api-reference/models/chat-pricing";
const blackboxPricingCapture = {
  url: `${blackboxPricingSource}.md`,
  verifiedAtUtc: "2026-11-17T22:58:44Z",
  sha256: "9ce91cb8407a1c5d4a98e4beff553f4dd519b3254be893866b038b56fc416f61",
};
const blackboxPublishedQuotes = Object.fromEntries([
  ["anthropic/claude-opus-4.8", 5, 25, 1000000],
  ["anthropic/claude-sonnet-4.6", 3, 15, 1000000],
  ["openai/gpt-5.5", 5, 30, 1000000],
  ["openai/gpt-5.4-pro", 30, 180, 1050000],
  ["openai/gpt-5.4", 2.5, 15, 1050000],
  ["openai/gpt-5.3-codex", 1.75, 14, 400000],
  ["openai/gpt-5.4-nano", 0.2, 1.25, 400000],
  ["deepseek/deepseek-v4-flash", 0.14, 0.28, 1000000],
  ["x-ai/grok-4.3", 1.25, 2.5, 1000000],
].flatMap(([model, input, output, contextWindow]) => {
  const wireModelId = `blackboxai/${model}`;
  const record = {
    sources: [blackboxPricingSource],
    provenance: { pricing: blackboxPricingCapture },
    limits: {
      scope: "public-provider-documentation",
      catalogAsOf: "2026-11-17",
      authenticatedRouteVerified: false,
      unverifiedCapabilityFields: ["maxInput", "maxOutput"],
    },
    capabilities: { contextWindow },
    pricing: { input, output },
    billing: {
      kind: "published-token-quote",
      currency: "USD",
      unit: "per_1000000_tokens",
      wireModelId,
      invoiceVerified: false,
      effectiveFrom: blackboxPricingCapture.verifiedAtUtc,
      note: "Published input/output token quote. Cache and separate context-tier prices are unverified.",
    },
  };
  return [[model.split("/")[1], record], [wireModelId, record]];
}));

const bazaarlinkPricingCapture = {
  url: "https://bazaarlink.ai/api/v1/models",
  verifiedAtUtc: "2026-11-17T22:56:57.199Z",
  sha256: "8245ea4719521bc27b6885eaaa86783c435216528449e69730e16982cde19356",
};
// The live catalog's per-token prices reconcile with each model page's explicit USD/1M prices.
const bazaarlinkTextQuotes = {
  "deepseek-v4.1-flash-1017": { input: 0.21225, output: 0.84825, cached: 0.021 },
  "minimax-m3": { input: 0.3, output: 1.2, cached: 0.06, tier: { threshold: 524288, input: 0.6, output: 2.4, cached: 0.12 } },
  "kimi-k3": { input: 2.827, output: 14.133, cached: 0.283 },
  "gemini-3.1-flash-lite-preview": { input: 0.25, output: 1.5, cached: 0.025, cacheWrite: 0.083333 },
  "gemini-3.1-pro-preview": { input: 1.8, output: 10.8, cached: 0.18, cacheWrite: 0.3375, tier: { threshold: 200000, input: 3.6, output: 16.2, cached: 0.36 } },
  "claude-sonnet-4.6": { input: 3, output: 15, cached: 0.3, cacheWrite: 3.75 },
  "qwen3.6-plus": { input: 0.26, output: 1.56, cached: 0.0224, cacheWrite: 0.325, tier: { threshold: 256000, input: 1.04, output: 3.12 } },
  "gemini-3-flash-preview": { input: 0.45, output: 2.7, cached: 0.045, cacheWrite: 0.075 },
  "gpt-5.4-mini": { input: 0.675, output: 4.05, cached: 0.0675 },
  "claude-haiku-4.5": { input: 1, output: 5, cached: 0.1, cacheWrite: 1.25 },
  "grok-4.3": { input: 1.125, output: 2.25, cached: 0.18, tier: { threshold: 200000, input: 2.25, output: 4.5, cached: 0.36 } },
  "gpt-6.1-sol": { input: 2, output: 10, cached: 0.2, cacheWrite: 2.5, tierCacheWrite: 5, tier: { threshold: 272000, input: 4, output: 15, cached: 0.4 } },
  "claude-sonnet-5.5": { input: 2, output: 10, cached: 0.2, cacheWrite: 2.5 },
  "gpt-5.4": { input: 2.25, output: 13.5, cached: 0.225, tier: { threshold: 272000, input: 4.5, output: 20.25, cached: 0.45 } },
  "claude-opus-5.5": { input: 4, output: 20, cached: 0.2, cacheWrite: 5 },
  "claude-opus-4.7": { input: 5, output: 25, cached: 0.5, cacheWrite: 6.25 },
  "gpt-5.5": { input: 5, output: 30, cached: 0.5, tier: { threshold: 272000, input: 10, output: 45, cached: 1 } },
  "grok-4.20": { input: 1.25, output: 2.5, cached: 0.2 },
};

function withBazaarlinkTextQuotes(modelMetadata) {
  const records = Object.fromEntries(Object.entries(bazaarlinkTextQuotes).map(([model, { cacheWrite, tierCacheWrite, ...pricing }]) => {
    const previous = modelMetadata[model];
    return [model, {
      ...previous,
      sources: [bazaarlinkPricingCapture.url, `https://bazaarlink.ai/en/models/${model}`, "https://bazaarlink.ai/docs/api.md"],
      provenance: { pricing: bazaarlinkPricingCapture },
      pricing,
      billing: {
        kind: "public-catalog-estimate",
        currency: "USD",
        unit: "per_1000000_tokens",
        invoiceVerified: false,
        effectiveFrom: bazaarlinkPricingCapture.verifiedAtUtc,
        ...(cacheWrite !== undefined && { cacheWriteReference: { rate: cacheWrite, lifetime: null } }),
        ...(tierCacheWrite !== undefined && { tierCacheWriteReference: { rate: tierCacheWrite, lifetime: null, threshold: pricing.tier.threshold } }),
        note: "Public text-token estimate, before tax. Host selection, BYOK and add-on charges can change the final charge.",
      },
    }];
  }));
  records["auto:free"] = {
    sources: [bazaarlinkPricingCapture.url, "https://bazaarlink.ai/docs/api.md"],
    provenance: { pricing: bazaarlinkPricingCapture },
    pricing: { input: 0, output: 0 },
    billing: {
      kind: "verified-zero-token-quote",
      currency: "USD",
      unit: "per_1000000_tokens",
      invoiceVerified: false,
      effectiveFrom: bazaarlinkPricingCapture.verifiedAtUtc,
      note: "The public catalog explicitly publishes zero text input and output rates for this rate-limited router.",
    },
  };
  return records;
}

export default {
  cursor: {
    "claude-sonnet-5-5": {
      sources: ["https://cursor.com/docs/models/claude-sonnet-5-5"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"], note: "200K ordinary context; 1M is opt-in Max, not this route's default." },
      capabilities: { contextWindow: 200000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage", note: "Published per-token top-up rates do not establish the account's effective subscription invoice, Fast selection or Cursor Token Rate." },
    },
    "claude-opus-5-5": {
      sources: ["https://cursor.com/docs/models/claude-opus-5-5"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 300000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage" },
    },
    "claude-haiku-5-5": {
      sources: ["https://cursor.com/docs/models/claude-haiku-5-5"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 300000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage" },
    },
    "gemini-4-argon": {
      sources: ["https://cursor.com/docs/models/gemini-4-argon"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 200000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage" },
    },
    "gemini-3.8-flash": {
      sources: ["https://cursor.com/docs/models/gemini-3-8-flash"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 200000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage" },
    },
    "gpt-5.6-sol": {
      sources: ["https://cursor.com/docs/models/gpt-5-6-sol"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 272000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage" },
    },
    "gpt-5.6-terra": {
      sources: ["https://cursor.com/docs/models/gpt-5-6-terra"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 272000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage" },
    },
    "gpt-5.6-luna": {
      sources: ["https://cursor.com/docs/models/gpt-5-6-luna"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 272000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage" },
    },
    "grok-4.7": {
      sources: ["https://cursor.com/docs/models/grok-4-7"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"], note: "256K standard window; 500K long context is not selected by this gateway." },
      capabilities: { contextWindow: 256000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage" },
    },
    "grok-4.6": {
      sources: ["https://cursor.com/docs/models/grok-4-6"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 256000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage" },
    },
    "composer-2.5": {
      sources: ["https://cursor.com/docs/models/cursor-composer-2-5"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 200000, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-or-additional-usage", note: "Base native ID; no unverified Fast parameter or legacy fast slug is selected." },
    },
  },
  kiro: {
    "gpt-5.6-sol": {
      sources: ["https://kiro.dev/docs/models/", "https://kiro.dev/changelog/models/"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"], note: "Experimental 1M rollout; exact live account limits and additionalModelRequestFieldsSchema require ListAvailableModels." },
      capabilities: { contextWindow: 1000000, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits", creditMultiplier: 4.4, longContextCreditMultiplier: 8.8, longContextThreshold: 272000, note: "Credit multipliers are not USD/token tariffs." },
    },
    "gpt-5.6-terra": {
      sources: ["https://kiro.dev/docs/models/", "https://kiro.dev/changelog/models/"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1000000, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits", creditMultiplier: 2.2, longContextCreditMultiplier: 4.4, longContextThreshold: 272000 },
    },
    "gpt-5.6-luna": {
      sources: ["https://kiro.dev/docs/models/", "https://kiro.dev/docs/models/available-models/"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1000000, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits", creditMultiplier: 0.6, longContextCreditMultiplier: 1.2, longContextThreshold: 272000, note: "Current model documentation supersedes the older September changelog's 1.1x Luna quote." },
    },
    auto: {
      sources: ["https://kiro.dev/docs/models/available-models/"],
      limits: { scope: "server-selected-model", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
      capabilities: { audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits" },
    },
  },
  "codebuddy-cn": {
    "kimi-k3-2": {
      sources: ["https://registry.npmjs.org/@tencent-ai/codebuddy-code/2.171.0"],
      limits: { scope: "publisher-bundled-fallback", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, bundleMember: "package/product.internal.json", unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 1000000, maxOutput: 32000, vision: true, tools: true, reasoning: true, thinkingFormat: "openai", pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits", note: "Bundled fallback credits are not a USD API tariff; authenticated /v3/config can override the fallback." },
    },
    "minimax-m3-pay": {
      sources: ["https://registry.npmjs.org/@tencent-ai/codebuddy-code/2.171.0"],
      limits: { scope: "publisher-bundled-fallback", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, bundleMember: "package/product.internal.json", unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 512000, maxOutput: 128000, vision: true, tools: true, reasoning: true, thinkingFormat: "openai", pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits" },
    },
    "glm-5.3-flashx": {
      sources: ["https://registry.npmjs.org/@tencent-ai/codebuddy-code/2.171.0"],
      limits: { scope: "publisher-bundled-fallback", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, bundleMember: "package/product.internal.json", unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 1000000, maxOutput: 131072, vision: true, tools: true, reasoning: true, thinkingFormat: "openai", pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits" },
    },
  },
  "codebuddy-intl": {
    "kimi-k3": {
      sources: ["https://registry.npmjs.org/@tencent-ai/codebuddy-code/2.171.0"],
      limits: { scope: "publisher-bundled-fallback", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, bundleMember: "package/product.json", unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 1000000, maxOutput: 32000, vision: true, tools: true, reasoning: true, thinkingFormat: "openai", pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits" },
    },
    "deepseek-v4.1-flash": {
      sources: ["https://registry.npmjs.org/@tencent-ai/codebuddy-code/2.171.0"],
      limits: { scope: "publisher-bundled-fallback", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, bundleMember: "package/product.json", unverifiedCapabilityFields: ["maxInput"], note: "300000 defaultLength; 1M requires a context-window opt-in not sent by this adapter." },
      capabilities: { contextWindow: 300000, maxOutput: 128000, vision: true, tools: true, reasoning: true, thinkingFormat: "openai", pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits" },
    },
    "deepseek-v4.1-flash-sg": {
      sources: ["https://registry.npmjs.org/@tencent-ai/codebuddy-code/2.171.0"],
      limits: { scope: "publisher-bundled-fallback", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, bundleMember: "package/product.json", unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 300000, maxOutput: 128000, vision: true, tools: true, reasoning: true, thinkingFormat: "openai", pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits" },
    },
    "gpt-6-astra": {
      sources: ["https://registry.npmjs.org/@tencent-ai/codebuddy-code/2.171.0"],
      limits: { scope: "publisher-bundled-fallback", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, bundleMember: "package/product.json", unverifiedCapabilityFields: ["maxInput"], note: "400000 defaultLength, not the optional 1M window or direct OpenAI's 1050000 window." },
      capabilities: { contextWindow: 400000, maxOutput: 128000, vision: true, tools: true, reasoning: true, thinkingFormat: "openai", pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "subscription-credits" },
    },
  },
  commandcode: {
    "deepseek/deepseek-v4.1-flash": {
      sources: ["https://api.commandcode.ai/provider/v1/models?view=client"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"], gatewayMaxOutput: 200000, behaviorProfile: "standard-v1" },
      capabilities: { contextWindow: 1000000, vision: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "public-catalog-reference", note: "Raw inputCost/outputCost/cacheReadCost captured; units and effective account billing not independently established here." },
    },
    "deepseek/deepseek-v4.1-flash-fast": {
      sources: ["https://api.commandcode.ai/provider/v1/models?view=client"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"], gatewayMaxOutput: 200000, behaviorProfile: "standard-v1" },
      capabilities: { contextWindow: 1000000, vision: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "public-catalog-reference" },
    },
    "Qwen/Qwen3.8-Max-Prime": {
      sources: ["https://api.commandcode.ai/provider/v1/models?view=client"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput"], gatewayMaxOutput: 200000, behaviorProfile: "standard-v1" },
      capabilities: { contextWindow: 1000000, maxOutput: 131072, vision: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "public-catalog-reference" },
    },
    "Qwen/Qwen3.8-27B": {
      sources: ["https://api.commandcode.ai/provider/v1/models?view=client"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput"], gatewayMaxOutput: 200000, behaviorProfile: "standard-v1" },
      capabilities: { contextWindow: 262144, maxOutput: 32768, vision: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "public-catalog-reference" },
    },
    "MiniMaxAI/MiniMax-M3": {
      sources: ["https://api.commandcode.ai/provider/v1/models?view=client"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"], gatewayMaxOutput: 200000, behaviorProfile: "standard-v1" },
      capabilities: { contextWindow: 1000000, vision: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "public-catalog-reference" },
    },
    "xiaomi/mimo-v2.6-pro": {
      sources: ["https://api.commandcode.ai/provider/v1/models?view=client"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"], gatewayMaxOutput: 200000, behaviorProfile: "standard-v1" },
      capabilities: { contextWindow: 1048576, vision: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "public-catalog-reference" },
    },
  },
  cline: {
    "anthropic/claude-sonnet-5.5": {
      sources: ["https://api.cline.bot/api/v1/models"],
      limits: { scope: "public-provider-catalog-id-only", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
      capabilities: { audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "unverified-route-tariff", note: "Public Cline catalog only supplies id/object/created/owned_by; OpenRouter rates and Cline Pass entitlements are not a Cline API invoice." },
    },
    "anthropic/claude-opus-5.5": {
      sources: ["https://api.cline.bot/api/v1/models"],
      limits: { scope: "public-provider-catalog-id-only", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
      capabilities: { audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "unverified-route-tariff" },
    },
    "openai/gpt-6.1-sol": {
      sources: ["https://api.cline.bot/api/v1/models"],
      limits: { scope: "public-provider-catalog-id-only", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
      capabilities: { audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "unverified-route-tariff" },
    },
    "deepseek/deepseek-v4.1-flash-1017": {
      sources: ["https://api.cline.bot/api/v1/models"],
      limits: { scope: "public-provider-catalog-id-only", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
      capabilities: { audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: null, output: null },
      billing: { kind: "unverified-route-tariff" },
    },
    "cline-free/minimax-m3.1-flash": {
      sources: ["https://api.cline.bot/api/v1/ai/cline/recommended-models"],
      limits: { scope: "publisher-free-model-feed", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
      capabilities: { audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
      billing: { kind: "publisher-free-model-feed", note: "Cline's first-party free[] feed and native cline-free/ namespace; not a paid OpenRouter twin or Cline Pass entitlement." },
    },
  },
  kilocode: {
    "anthropic/claude-sonnet-5.5": {
      sources: ["https://api.kilo.ai/api/gateway/models"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 1000000, maxOutput: 128000, vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 2, output: 10, cached: 0.1, cache_creation: 2.5 },
      billing: { kind: "public-gateway-token-quote", currency: "USD", unit: "per_1000000_tokens", note: "Catalog per-token strings converted to per-million rates. No independent 1h cache-write quote verified." },
    },
    "anthropic/claude-opus-5.5": {
      sources: ["https://api.kilo.ai/api/gateway/models"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 1000000, maxOutput: 128000, vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 4, output: 20, cached: 0.2, cache_creation: 5 },
      billing: { kind: "public-gateway-token-quote", currency: "USD", unit: "per_1000000_tokens" },
    },
    "openai/gpt-6.1-sol": {
      sources: ["https://api.kilo.ai/api/gateway/models"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 1050000, maxOutput: 128000, vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 2, output: 10, cached: 0.1, cache_creation: 2.5 },
      billing: { kind: "public-gateway-token-quote", currency: "USD", unit: "per_1000000_tokens", note: "No direct OpenAI long-context or native cache-TTL tiers are inferred." },
    },
    "deepseek/deepseek-v4.1-flash-1017": {
      sources: ["https://api.kilo.ai/api/gateway/models"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 1048576, maxOutput: 393216, vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 0.3, output: 1.2, cached: 0.006 },
      billing: { kind: "public-gateway-token-quote", currency: "USD", unit: "per_1000000_tokens" },
    },
    "minimax/minimax-m3.1-flash:free": {
      sources: ["https://api.kilo.ai/api/gateway/models"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 1000000, maxOutput: 524288, vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 0, output: 0 },
      billing: { kind: "verified-zero-token-quote", currency: "USD", unit: "per_1000000_tokens", note: "Catalog explicitly quotes prompt=0/completion=0 and isFree=true. This is not the Auto model's -1 sentinel." },
    },
  },
  blackbox: {
    // Keep exact public-alias quotes too: pricing resolves a literal generic
    // model table before following a registry upstreamModelId alias.
    ...blackboxPublishedQuotes,
    "gemini-3.5-flash": {
      sources: ["https://docs.blackbox.ai/api-reference/models/chat-pricing", "https://docs.blackbox.ai/api-reference/chat"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1000000, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 1.5, output: 9 },
      billing: { kind: "published-token-quote", currency: "USD", unit: "per_1000000_tokens", wireModelId: "blackboxai/google/gemini-3.5-flash" },
    },
    "gemma-4-31b-it": {
      sources: ["https://docs.blackbox.ai/api-reference/models/chat-pricing", "https://docs.blackbox.ai/api-reference/chat"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 262144, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 0.14, output: 0.4 },
      billing: { kind: "published-token-quote", currency: "USD", unit: "per_1000000_tokens", wireModelId: "blackboxai/google/gemma-4-31b-it" },
    },
    "mistral-medium-3.5": {
      sources: ["https://docs.blackbox.ai/api-reference/models/chat-pricing", "https://docs.blackbox.ai/api-reference/chat"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 262144, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 1.5, output: 7.5 },
      billing: { kind: "published-token-quote", currency: "USD", unit: "per_1000000_tokens", wireModelId: "blackboxai/mistral/mistral-medium-3.5" },
    },
    "blackboxai/google/gemini-3.5-flash": {
      sources: ["https://docs.blackbox.ai/api-reference/models/chat-pricing", "https://docs.blackbox.ai/api-reference/chat"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1000000, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 1.5, output: 9 },
      billing: { kind: "published-token-quote", currency: "USD", unit: "per_1000000_tokens", note: "Published table verifies input/output only; missing cache and context-tier tariffs remain unknown." },
    },
    "blackboxai/google/gemma-4-31b-it": {
      sources: ["https://docs.blackbox.ai/api-reference/models/chat-pricing", "https://docs.blackbox.ai/api-reference/chat"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 262144, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 0.14, output: 0.4 },
      billing: { kind: "published-token-quote", currency: "USD", unit: "per_1000000_tokens" },
    },
    "blackboxai/mistral/mistral-medium-3.5": {
      sources: ["https://docs.blackbox.ai/api-reference/models/chat-pricing", "https://docs.blackbox.ai/api-reference/chat"],
      limits: { scope: "public-provider-documentation", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 262144, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 1.5, output: 7.5 },
      billing: { kind: "published-token-quote", currency: "USD", unit: "per_1000000_tokens" },
    },
  },
  bazaarlink: withBazaarlinkTextQuotes({
    "gpt-6.1-sol": {
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1050000, vision: true, reasoning: true, thinkingCanDisable: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
    },
    "claude-sonnet-5.5": {
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1000000, vision: true, reasoning: true, thinkingCanDisable: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
    },
    "claude-opus-5.5": {
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1000000, vision: true, reasoning: true, thinkingCanDisable: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
    },
    "deepseek-v4.1-flash-1017": {
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1048576, vision: true, reasoning: true, thinkingCanDisable: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
    },
    "kimi-k3": {
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1048576, vision: true, reasoning: true, thinkingCanDisable: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
    },
  }),
  "api-airforce": {
    "claude-sonnet-5.5": {
      sources: ["https://api.airforce/v1/models"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 1000000, maxOutput: 128000, vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 0.2, output: 1, cached: 0.02, cache_creation: 0.25, cache_creation_1h: 0.4 },
      billing: { kind: "customer-price-table", currency: "USD", unit: "per_1000000_tokens", note: "customer_price_table.components price_micro_usd / 1e6, not official_pricepermilliontokens or tier/free labels." },
    },
    "claude-opus-5.5": {
      sources: ["https://api.airforce/v1/models"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput"] },
      capabilities: { contextWindow: 1000000, maxOutput: 128000, vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 3.92, output: 19.6, cached: 0.392, cache_creation: 4.9, cache_creation_1h: 7.84 },
      billing: { kind: "customer-price-table", currency: "USD", unit: "per_1000000_tokens" },
    },
  },
  llm7: {
    "DeepSeek-V4.1-Flash": {
      sources: ["https://api.llm7.io/v1/models"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1000000, vision: false, tools: true, reasoning: true, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 0.3, output: 1.2, cached: 0.03 },
      billing: { kind: "usage-based-token-quote", currency: "USD", unit: "per_1000000_tokens", note: "Native catalog explicitly declares currency USD, unit 1M tokens, schema_endpoints openai and text-only input." },
    },
    "gpt-6.1-sol": {
      sources: ["https://api.llm7.io/v1/models"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1000000, vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 0.4, output: 1.5, cached: 0.05, cache_creation: 0.5 },
      billing: { kind: "usage-based-token-quote", currency: "USD", unit: "per_1000000_tokens", note: "LLM7 quote has no direct OpenAI 272K context surcharge or independent cache-TTL quote." },
    },
    "claude-opus-5-5": {
      sources: ["https://api.llm7.io/v1/models"],
      limits: { scope: "public-provider-catalog", catalogAsOf: "2026-10-21", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["maxInput", "maxOutput"] },
      capabilities: { contextWindow: 1000000, vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
      pricing: { input: 2.4, output: 12, cached: 0.12 },
      billing: { kind: "usage-based-token-quote", currency: "USD", unit: "per_1000000_tokens" },
    },
  },
};
