// Provider/product-scoped public documentation reviewed 2026-10-21.
// Raw primary pages, UTC retrieval times and SHA-256 hashes are retained in the
// vendor audit evidence. models.dev is a literal-ID comparison, never a source
// of currency conversion, entitlement, cache multipliers or guessed output caps.
// This shard is dependency-free: the same complete quotes feed server and UI.
const asOf = "2026-10-21";
const catalogAsOf = "2026-10-17";
const catalogSource = "https://models.dev/api.json";
const unknownUsd = {
  input: null, output: null, cached: null, reasoning: null,
  cache_creation: null, cache_creation_1h: null,
  cache_write_30m: null, cache_write_12h: null,
};
const textOnly = {
  vision: false, pdf: false, audioInput: false, videoInput: false,
  imageOutput: false, audioOutput: false,
};

function caps(contextWindow, maxOutput, extra = {}) {
  return { ...textOnly, contextWindow, maxInput: null, maxOutput, ...extra };
}

// Defaults are explicit unknowns, not inherited dollar estimates. In particular,
// a subscription credit/point/request coefficient is not a native USD invoice.
function reviewed(rows, common) {
  return Object.fromEntries(Object.entries(rows).map(([id, row]) => {
    const capabilities = { contextWindow: null, maxInput: null, maxOutput: null, ...row.capabilities };
    const pricing = { ...unknownUsd, ...row.pricing };
    if (row.pricing?.reasoning === undefined) pricing.reasoning = pricing.output;
    const billing = {
      ...common.billing, ...row.billing, reviewedAt: asOf,
      authenticatedRouteVerified: false,
      unverifiedPriceFields: Object.keys(unknownUsd).filter(key => pricing[key] === null),
    };
    const limits = {
      ...(common.catalogProvider ? { catalogProvider: common.catalogProvider, catalogModelId: id, catalogAsOf } : {}),
      ...row.limits,
      unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"].filter(key => capabilities[key] === null),
    };
    return [id, {
      ...(row.description ? { description: row.description } : {}),
      capabilities, limits, pricing,
      sources: [...new Set([...(common.sources || []), ...(row.sources || [])])], billing,
    }];
  }));
}

const deepseekPricing = "https://api-docs.deepseek.com/quick_start/pricing";
const deepseekApi = "https://api-docs.deepseek.com/api/create-chat-completion";
const deepseekLimits = {
  maxOutputScope: "Native Chat Completions max_tokens explicitly defines 384K as 393216 tokens.",
  fieldSources: { maxOutput: deepseekApi },
};
const deepseekFlash = {
  description: "DeepSeek V4.1 Flash for visual reasoning, coding and agents",
  capabilities: caps(1000000, 393216, { vision: true, tools: true, reasoning: true, structuredOutput: true, thinkingCanDisable: true }),
  limits: deepseekLimits,
  pricing: { input: 0.15, output: 0.6, cached: 0.003 },
  billing: {
    note: "Off-peak USD/1M token reference: input 0.15, output 0.60, cache-hit 0.003. Peak input 0.30, output 1.20, cache-hit 0.006. Peak Monday-Friday 01:00-04:00 and 06:00-10:00 UTC, excluding Chinese public holidays; Chinese primary specifies Beijing 09:00-12:00 and 14:00-18:00. All weekends and Chinese public holidays are off-peak. Actual estimates require the recorded usage timestamp and a verified holiday-calendar year; this two-argument editor quote is not a universal invoice. No separate cache-creation fee published. Search/Fetch are separately billed; tool pricing is not included.",
  },
};
const deepseekPro = {
  description: "DeepSeek V4 Pro snapshot for long-context reasoning and agents",
  capabilities: caps(1000000, 393216, { tools: true, reasoning: true, structuredOutput: true, thinkingCanDisable: true }),
  limits: deepseekLimits,
  pricing: { input: 0.66, output: 1.98, cached: 0.022 },
  billing: {
    note: "Off-peak USD/1M token reference: input 0.66, output 1.98, cache-hit 0.022. Peak input 1.32, output 3.96, cache-hit 0.044. Peak Monday-Friday 01:00-04:00 and 06:00-10:00 UTC, excluding Chinese public holidays; Chinese primary specifies Beijing 09:00-12:00 and 14:00-18:00. All weekends and Chinese public holidays are off-peak. Actual estimates require the recorded usage timestamp and a verified holiday-calendar year; this two-argument editor quote is not a universal invoice. No separate cache-creation fee published. Search/Fetch are separately billed; tool pricing is not included.",
  },
};

const codingRows = {
  "qwen3.7-plus": { capabilities: caps(1000000, 64000, { vision: true, videoInput: true, reasoning: true, tools: true }) },
  "qwen3.6-plus": { capabilities: caps(1000000, 65536, { vision: true, videoInput: true, reasoning: true, tools: true }) },
  "qwen3.5-plus": { capabilities: caps(1000000, 65536, { vision: true, videoInput: true, reasoning: true, tools: true }) },
  "kimi-k2.5": { capabilities: caps(262144, 32768, { vision: true, reasoning: true, tools: true }) },
  "glm-5": { capabilities: caps(202752, 16384, { reasoning: true, tools: true }) },
  "MiniMax-M2.5": { capabilities: caps(196608, 24576, { reasoning: true, tools: true }) },
};
const codingNote = "Coding Plan's exact allowlist has six models. Dedicated sk-sp keys and coding endpoints consume request quotas, not PAYG tokens: 6000/5h rolling, 45000/week (Monday 00:00 UTC+8), 90000/subscription month. Interactive supported-tool use only; not application backends or batch API traffic. Context/output values retain literal product-catalog comparisons, not authenticated entitlement verification. No API-dollar token or cache tariff is implied by the monthly subscription price.";
const tokenPlanSource = "https://www.alibabacloud.com/help/en/model-studio/token-plan-personal-overview";
const tokenPlanNote = "Personal Token Plan, Singapore Global deployment only. Dynamic Credits depend on model, tokens, thinking and tools; not USD token prices. Monthly quota resets on the subscription cycle; unused Credits do not roll over. Limited-time 22:00-08:00 UTC+8 discounts: Qwen3.8 Max/Flash consume 40%; DeepSeek V4 Pro-0813/Flash-0731/V4.1 Flash/Flash-1017 consume 50%. No promotion expiry published. Interactive coding/agent tools only. Independent maximum input/output remains unverified. Compatibility IDs absent from the current list are preserved, not declared retired.";
const tokenPlanRows = {
  "auto": { capabilities: { reasoning: true } },
  "qwen3.8-max": { capabilities: caps(1000000, null, { vision: true, pdf: true, videoInput: true, tools: true, reasoning: true, structuredOutput: true }) },
  "qwen3.8-flash": { capabilities: caps(1000000, null, { vision: true, videoInput: true, tools: true, reasoning: true, structuredOutput: true }) },
  "qwen3.7-max": { capabilities: caps(1000000, null, { tools: true, reasoning: true, structuredOutput: true }) },
  "qwen3.7-plus": { capabilities: caps(1000000, null, { vision: true, videoInput: true, tools: true, reasoning: true, structuredOutput: true }) },
  "qwen3.7-flash": {},
  "qwen3.6-plus": { capabilities: caps(1000000, null, { vision: true, videoInput: true, tools: true, reasoning: true, structuredOutput: true }) },
  "qwen3.6-flash": { capabilities: caps(1000000, null, { vision: true, videoInput: true, tools: true, reasoning: true, structuredOutput: true }) },
  "qwen3.5-flash": {},
  "glm-5.3": { capabilities: caps(1000000, null, { tools: true, reasoning: true, structuredOutput: true }) },
  "glm-5.2": { capabilities: caps(1000000, null, { tools: true, reasoning: true, structuredOutput: true }) },
  "deepseek-v4-pro": { capabilities: caps(1000000, null, { tools: true, reasoning: true, structuredOutput: true }) },
  "deepseek-v4-pro-0813": { capabilities: caps(1000000, null, { tools: true, reasoning: true, structuredOutput: true }) },
  "deepseek-v4-flash-0731": { capabilities: caps(1000000, null, { tools: true, reasoning: true, structuredOutput: true }) },
  "deepseek-v4.1-flash": { capabilities: caps(1000000, null, { vision: true, tools: true, reasoning: true, structuredOutput: false }) },
    "deepseek-v4.1-flash-1017": {
      capabilities: { vision: true, reasoning: true },
      limits: { catalogAsOf: asOf, unknownLimitNote: "Primary Token Plan allowlist proves this exact ID's visual reasoning; no independent numeric context/input/output cap published for this plan route." },
  },
};
const studioPricing = "https://www.alibabacloud.com/help/en/model-studio/model-pricing";
const studioCache = "https://www.alibabacloud.com/help/en/model-studio/context-cache";
const studioNote = "Singapore International deployment, standard real-time USD/1M tokens; not China/Global/US prices and not Token Plan. All request tokens use the input-length tier. Pricing K=1000, M=1000000. Explicit 5-minute cache and implicit cache have different read rates; undifferentiated cached usage remains unpriced where the mode is unknown. Batch/promotion prices are not applied. Independent route output caps not verified unless explicitly recorded.";

const glmSource = "https://docs.z.ai/devpack/latest-model.md";
const glmCnSource = "https://docs.bigmodel.cn/cn/coding-plan/overview";
const glm53 = {
  capabilities: caps(1000000, 131072, { tools: true, reasoning: true, structuredOutput: true, thinkingCanDisable: false }),
  sources: ["https://docs.z.ai/guides/llm/glm-5.3.md"],
};
const glm53Flash = {
  capabilities: caps(1000000, 131072, { vision: true, pdf: true, videoInput: true, tools: true, reasoning: true, structuredOutput: true, thinkingCanDisable: false }),
  sources: ["https://docs.z.ai/guides/vlm/glm-5.3-flash.md"],
};
const glmRows = {
  "glm-5.3": glm53,
  "glm-5.3-flash": glm53Flash,
  "glm-5.3-flashx": { billing: { note: "Coding Plan points are not PAYG dollars. FlashX entitlement is not established by the current Coding Plan allowlist; compatibility ID retained without a retirement claim." } },
  "glm-5.2": { capabilities: caps(1000000, 131072, { tools: true, reasoning: true, structuredOutput: true }) },
  "glm-5.1": {}, "glm-5": {},
  "glm-5-turbo": { capabilities: caps(200000, 131072, { tools: true, reasoning: true, structuredOutput: true }) },
  "glm-4.7": { capabilities: caps(204800, 131072, { tools: true, reasoning: true }) },
  "glm-4.7-flash": {}, "glm-4.7-flashx": {}, "glm-4.6": {},
  "glm-4.6v": {}, "glm-4.6v-flashx": {}, "glm-4.5": {}, "glm-4.5v": {}, "glm-4.5-air": {},
};
const glmNote = "GLM Coding Plan points/quota subscription, not the separate PAYG API. Current international guide supports GLM-5.3 and GLM-5.3-Flash on Lite/Pro/Max and documents 1M context. Historical IDs remain compatibility entries, not current entitlement proof. No API-dollar input/output/cache invoice rate is verified for this product.";

const minimaxPricing = "https://platform.minimax.io/docs/guides/pricing-paygo.md";
const minimaxCnPricing = "https://platform.minimaxi.com/docs/guides/pricing-paygo.md";
const minimaxApi = "https://platform.minimax.io/docs/api-reference/text-anthropic-api.md";
const minimaxCnApi = "https://platform.minimaxi.com/docs/api-reference/text-anthropic-api.md";
const minimaxLegacy = {
  "MiniMax-M2.7": { capabilities: caps(204800, null, { reasoning: true, tools: true, thinkingCanDisable: false }) },
  "MiniMax-M2.7-highspeed": { capabilities: caps(204800, null, { reasoning: true, tools: true, thinkingCanDisable: false }) },
  "MiniMax-M2.5": { capabilities: caps(204800, null, { reasoning: true, tools: true, thinkingCanDisable: false }) },
  "MiniMax-M2.5-highspeed": { capabilities: caps(204800, null, { reasoning: true, tools: true, thinkingCanDisable: false }) },
  "MiniMax-M2.1": { capabilities: caps(204800, null, { reasoning: true, tools: true, thinkingCanDisable: false }) },
  "MiniMax-M2.1-highspeed": { capabilities: { contextWindow: 204800 } },
  "MiniMax-M2": { capabilities: caps(204800, null, { reasoning: true, tools: true, thinkingCanDisable: false }) },
};
const minimaxM3Caps = caps(1000000, null, { vision: true, videoInput: true, reasoning: true, tools: true, thinkingCanDisable: true });
const minimaxFlashCaps = caps(1000000, null, { vision: true, videoInput: true, reasoning: true, tools: true, thinkingCanDisable: false });
const minimaxNote = "Ordinary Open Platform API key PAYG quote; M Plan/Subscription Keys use separate credits and must not be treated as this invoice. Current price/API pages list M3 and M3.1 Flash; old M2 IDs are retained without invented retirement or current tariff. Native SDK tables explicitly give 1,000,000 context for M3/M3.1. max_tokens counts thinking too, but no exact output ceiling or cache-creation charge is published. M3.1 Flash always thinks; the current gateway drops output_config, so default depth works but custom effort is not newly claimed.";

const kimiSource = "https://www.kimi.com/code/docs/en/kimi-code/models.html";
const kimiNote = "Kimi Code subscription, not Moonshot PAYG. k3 1,048,576 context needs Pro/Allegretto or above; Plus/Moderato is limited to 262,144. k3-256k is fixed 262,144 and image-only. kimi-for-coding is now K2.8 Preview (1,048,576); HighSpeed is K2.7 Code, Pro/Allegretto+, roughly 6x speed and 3x quota consumption. Thinking off on K3/K2.8 routes to non-thinking K2.8 Preview. Switching model/effort can invalidate cache. No independent output ceiling or API-dollar tariff verified.";
const kimiLegacyNote = "ID retained for compatibility, but the current Kimi Code model table lists only k3, k3-256k, kimi-for-coding and kimi-for-coding-highspeed. This is the Code subscription endpoint, not Moonshot PAYG; a PAYG ID or price does not establish Code support. No retirement inferred.";
const mimoModels = "https://mimo.mi.com/docs/en-US/quick-start/summary/model";
const mimoPricing = "https://mimo.mi.com/docs/en-US/price/pay-as-you-go";
const mimoPlan = "https://mimo.mi.com/docs/en-US/price/token-plan";
const mimoCaps = caps(1048576, 131072, { vision: true, audioInput: true, videoInput: true, reasoning: true, tools: true, search: true, structuredOutput: true });
const mimoNote = "Overseas real-time USD/1M tokens with ordinary Open Platform API key; China and Batch prices differ. Cache write is explicitly limited-time free (no expiry given); web search is separate at USD5/1000 calls. Model page prints 1M context/128K output; numeric limits retain the exact literal catalog comparison, not an invented 1M output. Ultraspeed is custom-service availability, not general entitlement.";
const mimoRetired = "Official 2026-10-21 documentation states mimo-v2.5-pro and mimo-v2.5 retired at 2026-10-21 10:00 UTC+8 and their IDs no longer work. IDs are preserved for compatibility/history, not advertised as current native availability. No current API tariff is inferred from V2.6 prices.";
const mimoPlanNote = "MiMo Token Plan uses Credits, not PAYG USD invoices; ordinary API balance and Token Plan quota are not interchangeable. Pro input/cache-hit/output uses 300/2.5/600 Credits per token; Flash 100/2/200. Beijing 00:00-08:00 (UTC16:00-24:00) consumes 0.8x Credits. No conversion of monthly fees or credit coefficients to API dollars. Exhausted quota pauses service rather than charging account balance. Keys are cluster-specific (Singapore, China, Amsterdam).";

const cohereModels = "https://docs.cohere.com/docs/models.md";
const cohereCompatibility = "https://docs.cohere.com/docs/compatibility-api.md";
const cohereUnpublished = "Public model docs distinguish rate-limited evaluation access from paid production/Model Vault. No production per-token USD quote is published for this model; free evaluation is not unlimited free production, and per-instance Vault prices are not token rates. Compatibility API uses /compatibility/v1/chat/completions. Context/output follow the explicit model table's decimal-k convention.";
const baiduModels = "https://cloud.baidu.com/doc/qianfan/s/rmh4stp0j";
const baiduBilling = "https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya";
const baiduNote = "Qianfan native hosted route, CNY per 1000 tokens. No FX conversion or direct-vendor USD fallback. Native max_tokens ranges take precedence over conflicting overview k notation. Independent input/context k/M notation is not silently converted from another host. Native price facts are billing.nativeQuote only; the USD calculator remains explicitly unknown. Search enhancement and other tools are separately billed.";
const mistralPricing = "https://docs.mistral.ai/inference/pricing";
const mistralNote = "Mistral-hosted standard USD per 1M tokens; not the half-price batch figures found in some catalogs. Only explicitly published cached-input prices are accepted. No guessed 10% cache rate, cache-write multiplier or output ceiling copied from the shared context window. Latest aliases retain the mapping explicitly printed in each model page.";
const poolsideSource = "https://docs.poolside.ai/get-started/supported-models.md";
const poolsideNote = "Poolside-hosted S/XS access is advertised free for a limited time, with no permanent paid tariff or promotion expiry published. Do not manufacture a permanent zero quote. Self-managed supported-model specs and architecture positions do not prove account-specific hosted entitlement or an independent output ceiling. Existing IDs retained; no authenticated inference performed.";
const agentSource = "https://docs.perplexity.ai/docs/agent-api/models.md";
const agentQuickstart = "https://docs.perplexity.ai/docs/agent-api/quickstart.md";
const agentNote = "Perplexity Agent default-processing USD/1M-token quote, not the original vendor's invoice. Tools/invocations are separate. Output includes reasoning. /v1/responses is an officially documented alias of /v1/agent. No provider-global input modalities or output caps are inferred for this route. Anthropic models require max_output_tokens. Public documentation is not account entitlement or authenticated acceptance.";
const agentLegacy = { billing: { quoteStatus: "unpublished", kind: "unverified-legacy", note: "Absent from the current Agent model/pricing table. Compatibility ID retained, not declared retired or rejected; no native-vendor or old Agent tariff is fabricated as current billing." } };
function agentGpt(input, output, cached, longInput, longOutput, longCached) {
  const quote = { input, output, cached, tier: { threshold: 272000, input: longInput, output: longOutput, cached: longCached } };
  const scaled = factor => ({
    ...unknownUsd, input: input * factor, output: output * factor, reasoning: output * factor, cached: cached * factor,
    tier: { threshold: 272000, input: longInput * factor, output: longOutput * factor, reasoning: longOutput * factor, cached: longCached * factor },
  });
  return { pricing: { ...quote, service_tiers: { flex: scaled(0.5), priority: scaled(2) } } };
}
const arkSource = "https://ark.volcengine.com/region:cn-beijing/docs/coding-plan-personal-plan-overview.md";
const arkQuickstart = "https://ark.volcengine.com/region:cn-beijing/docs/coding-plan-personal-get-started.md";
const byteplusSource = "https://docs.byteplus.com/en/docs/ModelArk/1925114";

export default {
  deepseek: reviewed({
    "deepseek-flash": deepseekFlash,
    "deepseek-v4-flash": deepseekFlash,
    "deepseek-v4-flash-vision-exp": deepseekFlash,
    "deepseek-v4-pro": deepseekPro,
    "deepseek-v4-pro-max": { ...deepseekPro, limits: { ...deepseekLimits, catalogModelId: "deepseek-v4-pro" } },
    "deepseek-v4-pro-none": { ...deepseekPro, limits: { ...deepseekLimits, catalogModelId: "deepseek-v4-pro" } },
  }, {
    catalogProvider: "deepseek", sources: [deepseekPricing, deepseekApi, "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/", catalogSource],
    billing: { currency: "USD", unit: "per_1000000_tokens", kind: "time-dependent-payg", quoteStatus: "quote-verified" },
  }),
  alicode: reviewed({
    ...codingRows,
    "qwen3.5-plus": { ...codingRows["qwen3.5-plus"], capabilities: { ...codingRows["qwen3.5-plus"].capabilities, videoInput: false } },
  }, {
    catalogProvider: "alibaba-coding-plan-cn", sources: ["https://help.aliyun.com/zh/model-studio/coding-plan", catalogSource],
    billing: { currency: "CNY", unit: "month", kind: "subscription", quoteStatus: "subscription-unknown", region: "China", note: codingNote },
  }),
  "alicode-intl": reviewed({
    ...codingRows,
    "kimi-k2.5": { ...codingRows["kimi-k2.5"], capabilities: { ...codingRows["kimi-k2.5"].capabilities, videoInput: true } },
    "MiniMax-M2.5": { ...codingRows["MiniMax-M2.5"], capabilities: { ...codingRows["MiniMax-M2.5"].capabilities, maxInput: 196601 } },
  }, {
    catalogProvider: "alibaba-coding-plan", sources: ["https://www.alibabacloud.com/help/en/model-studio/coding-plan", catalogSource],
    billing: { currency: "USD", unit: "month", kind: "subscription", quoteStatus: "subscription-unknown", region: "International", note: codingNote },
  }),
  "alitp-intl": reviewed(tokenPlanRows, {
    catalogProvider: "alibaba-token-plan", sources: [tokenPlanSource, catalogSource],
    billing: { unit: "credits", kind: "subscription", quoteStatus: "subscription-unknown", region: "Singapore-Global", note: tokenPlanNote },
  }),
  "alims-intl": reviewed({
    "qwen3.8-max": {
      capabilities: tokenPlanRows["qwen3.8-max"].capabilities,
      pricing: { input: 2, output: 6, cache_creation: 2.5 },
      billing: { note: `${studioNote} Both explicit/implicit read discounts are console-only exceptions; cache reads remain null. Explicit 5-minute creation is documented at 125% of input.` },
    },
    "qwen3.8-flash": { capabilities: tokenPlanRows["qwen3.8-flash"].capabilities, pricing: { input: 0.15, output: 0.47 } },
    "qwen3.7-plus": {
      capabilities: tokenPlanRows["qwen3.7-plus"].capabilities,
      pricing: { input: 0.4, output: 1.6, cache_creation: 0.5, tier: { threshold: 256000, input: 1.2, output: 4.8, cached: null, cache_creation: 1.5 } },
    },
    "qwen3.6-plus": {
      capabilities: tokenPlanRows["qwen3.6-plus"].capabilities,
      pricing: { input: 0.5, output: 3, cache_creation: 0.625, tier: { threshold: 256000, input: 2, output: 6, cached: null, cache_creation: 2.5 } },
    },
    "qwen3.5-plus": {
      capabilities: caps(1000000, 65536, { vision: true, videoInput: true, tools: true, reasoning: true }),
      pricing: { input: 0.4, output: 2.4, cache_creation: 0.5, tier: { threshold: 256000, input: 0.5, output: 3, cached: null, cache_creation: 0.625 } },
    },
    "qwen3-coder-plus": {
      capabilities: caps(1048576, 65536, { tools: true, reasoning: false }),
      billing: { quoteStatus: "unpublished", kind: "payg-tiered", note: `${studioNote} Prior review recorded four USD input/output tiers: <=32K 1/5; >32K through128K 1.8/9; >128K through256K 3/15; >256K through1M 6/60. The fresh captured price page does not independently confirm this exact ID. Scalar rates remain null, not a stale short-context universal price; neither current tariff nor retirement is inferred from absence.` },
    },
    "qwen3-coder-next": { billing: { quoteStatus: "unpublished", note: "Exact existing ID retained; no current Singapore International quote independently verified. Do not import a coding-plan or mainland rate." } },
    "kimi-k2.5": { billing: { quoteStatus: "unpublished", note: "Current price page lists kimi-k2.5 under China/Global scopes, not Singapore International. Existing ID retained; no region/FX price borrowed." } },
    "glm-5": { billing: { quoteStatus: "unpublished", note: "Current glm-5 quote is China scope, not this Singapore International endpoint. Existing ID retained without importing mainland or Coding Plan rates." } },
    "MiniMax-M2.5": { billing: { quoteStatus: "unpublished", note: "Current MiniMax-M2.5 listing is China scope; this Singapore International compatibility ID has no verified quote. Do not use direct MiniMax or Coding Plan pricing." } },
    "glm-4.7": { billing: { quoteStatus: "unpublished", note: "No current Singapore International quote verified for this compatibility ID. No retirement inferred." } },
  }, {
    catalogProvider: "alibaba", sources: [studioPricing, studioCache, catalogSource],
    billing: { currency: "USD", unit: "per_1000000_tokens", kind: "payg-list", quoteStatus: "quote-verified", region: "Singapore-International", note: studioNote },
  }),
  glm: reviewed(glmRows, {
    catalogProvider: "zai-coding-plan", sources: [glmSource, catalogSource],
    billing: { unit: "points", kind: "subscription", quoteStatus: "subscription-unknown", region: "International", note: glmNote },
  }),
  "glm-cn": reviewed({
    ...glmRows,
    "glm-5.2": { ...glm53, billing: { note: "CN Coding Plan automatically routes this historical ID to GLM-5.3. Points are not PAYG dollars; no numeric API invoice quote." } },
    "glm-5.1": { ...glm53, billing: { note: "CN Coding Plan automatically routes this historical ID to GLM-5.3. Points are not PAYG dollars; no numeric API invoice quote." } },
    "glm-5-turbo": { ...glm53Flash, billing: { note: "CN Coding Plan automatically routes this historical ID to GLM-5.3-Flash. Points are not PAYG dollars; no numeric API invoice quote." } },
    "glm-4.7": { ...glm53Flash, billing: { note: "CN Coding Plan automatically routes this historical ID to GLM-5.3-Flash. Points are not PAYG dollars; no numeric API invoice quote." } },
    "glm-4.6v": { capabilities: caps(128000, 32768, { vision: true, videoInput: true, tools: true, reasoning: true }) },
  }, {
    catalogProvider: "zhipuai-coding-plan", sources: [glmCnSource, catalogSource],
    billing: {
      unit: "points", kind: "subscription", quoteStatus: "subscription-unknown", region: "China",
      note: "CN Coding Plan supports GLM-5.3/Flash, not PAYG API-dollar billing. Points: GLM5.3 input/cache/output coefficients6.9/1.7/24; Flash2.3/0.56/8, divided by10000. Peak Mon-Fri14:00-18:00 UTC+8; other times consume50% points. Rolling5h and subscription-anchored7day quotas; no fee-to-token USD conversion. Older IDs retained without assumed entitlement or retirement.",
    },
  }),
  minimax: reviewed({
    ...minimaxLegacy,
    "MiniMax-M3": {
      capabilities: minimaxM3Caps,
      pricing: {
        input: 0.3, output: 1.2, cached: 0.06,
        tier: { threshold: 512000, input: 0.6, output: 2.4, cached: 0.12 },
        service_tiers: { priority: {
          ...unknownUsd, input: 0.45, output: 1.8, reasoning: 1.8, cached: 0.09,
          tier: { threshold: 512000, input: 0.9, output: 3.6, reasoning: 3.6, cached: 0.18 },
        } },
      },
      billing: { quoteStatus: "quote-verified", note: `${minimaxNote} Standard <=512k/>512k input tiers; published permanent50% reduction already applied. Delivered priority is1.5x standard. Do not infer a subscription-key invoice or an unsupported M3.1 service tier.` },
    },
    "MiniMax-M3.1-Flash": {
      capabilities: minimaxFlashCaps, pricing: { input: 0.15, output: 0.6, cached: 0.015 },
      limits: { catalogAsOf: asOf },
      billing: { quoteStatus: "quote-verified", note: `${minimaxNote} M3.1 Flash does not support service_tier. No independent output limit verified (do not copy catalog524288).` },
    },
  }, {
    catalogProvider: "minimax", sources: [minimaxPricing, minimaxApi, "https://platform.minimax.io/docs/api-reference/text-openai-api.md", catalogSource],
    billing: { currency: "USD", unit: "per_1000000_tokens", kind: "payg-or-subscription", quoteStatus: "unpublished", region: "International", note: minimaxNote },
  }),
  "minimax-cn": reviewed({
    ...minimaxLegacy,
    "MiniMax-M3": {
      capabilities: minimaxM3Caps,
      billing: { quoteStatus: "quote-verified", nativeQuote: {
        input: 2.1, output: 8.4, cached: 0.42,
        tier: { threshold: 512000, input: 4.2, output: 16.8, cached: 0.84 },
        priority: { input: 3.15, output: 12.6, cached: 0.63, tier: { threshold: 512000, input: 6.3, output: 25.2, cached: 1.26 } },
      } },
    },
    "MiniMax-M3.1-Flash": {
      capabilities: minimaxFlashCaps,
      limits: { catalogAsOf: asOf },
      billing: { quoteStatus: "quote-verified", nativeQuote: { input: 1, output: 4, cached: 0.1 } },
    },
  }, {
    catalogProvider: "minimax-cn", sources: [minimaxCnPricing, minimaxCnApi, catalogSource],
    billing: { currency: "CNY", unit: "per_1000000_tokens", kind: "payg-or-subscription", quoteStatus: "unpublished", region: "China", note: `${minimaxNote} China prices are CNY, preserved only in nativeQuote; no catalog FX conversion to dollars. Current text API documentation uses api.minimax.cn; subscription-key entitlement still must be established separately.` },
  }),
  kimi: reviewed({
    "k3": { capabilities: caps(1048576, null, { vision: true, videoInput: true, tools: true, reasoning: true, structuredOutput: true, thinkingCanDisable: true, thinkingEffortSupported: true }) },
    "k3-256k": { capabilities: caps(262144, null, { vision: true, tools: true, reasoning: true, structuredOutput: true, thinkingCanDisable: true, thinkingEffortSupported: true }) },
    "kimi-for-coding": { capabilities: caps(1048576, null, { vision: true, videoInput: true, tools: true, reasoning: true, thinkingCanDisable: true, thinkingEffortSupported: true }) },
    "kimi-for-coding-highspeed": { capabilities: caps(262144, null, { vision: true, videoInput: true, tools: true, reasoning: true, structuredOutput: true }) },
    "kimi-k3": { billing: { kind: "unverified-route", note: kimiLegacyNote } },
    "kimi-k2.7-code": { billing: { kind: "unverified-route", note: kimiLegacyNote } },
    "kimi-k2.7-code-highspeed": { billing: { kind: "unverified-route", note: kimiLegacyNote } },
    "kimi-k2.6": { billing: { kind: "unverified-route", note: kimiLegacyNote } },
  }, {
    catalogProvider: "kimi-code-plan-cn", sources: [kimiSource, catalogSource],
    billing: { unit: "quota", kind: "subscription", quoteStatus: "subscription-unknown", region: "China-Code", note: kimiNote },
  }),
  "xiaomi-mimo": reviewed({
    "mimo-v2.6-pro": { capabilities: mimoCaps, pricing: { input: 0.435, output: 0.87, cached: 0.0036, cache_creation: 0 } },
    "mimo-v2.6-flash": { capabilities: mimoCaps, pricing: { input: 0.14, output: 0.28, cached: 0.0028, cache_creation: 0 } },
    "mimo-v2.6-pro-ultraspeed": { capabilities: mimoCaps, limits: { catalogAsOf: asOf }, pricing: { input: 4.35, output: 8.7, cached: 0.036, cache_creation: 0 } },
    "mimo-v2.5-pro": { capabilities: mimoCaps, billing: { quoteStatus: "unpublished", note: mimoRetired } },
    "mimo-v2.5": { capabilities: mimoCaps, billing: { quoteStatus: "unpublished", note: mimoRetired } },
  }, {
    catalogProvider: "xiaomi", sources: [mimoModels, mimoPricing, catalogSource],
    billing: { currency: "USD", unit: "per_1000000_tokens", kind: "payg", quoteStatus: "quote-verified", region: "Overseas", note: mimoNote },
  }),
  "xiaomi-tokenplan": reviewed({
    "mimo-v2.6-pro": { capabilities: mimoCaps }, "mimo-v2.6-flash": { capabilities: mimoCaps },
    "mimo-v2.5-pro": { capabilities: mimoCaps, billing: { note: `${mimoPlanNote} ${mimoRetired}` } },
    "mimo-v2.5": { capabilities: mimoCaps, billing: { note: `${mimoPlanNote} ${mimoRetired}` } },
    "mimo-v2.5-pro-claude": { capabilities: mimoCaps, billing: { note: `${mimoPlanNote} ${mimoRetired}` } },
  }, {
    sources: [mimoModels, mimoPlan],
    billing: { unit: "credits", kind: "subscription", quoteStatus: "subscription-unknown", region: "cluster-specific", note: mimoPlanNote },
  }),
  cohere: reviewed({
    "command-a-03-2025": {
      capabilities: caps(256000, 8000, { reasoning: false, tools: true }),
      sources: ["https://docs.cohere.com/docs/command-a.md"],
      billing: { note: "Current captured Command A model page proves model capabilities but publishes no token prices. Search summaries suggesting USD2.50/USD10 are not a captured primary quote. Trial-key quotas are not a universal free price; native production input/output/cache remain explicitly unknown." },
    },
    "command-a-reasoning-08-2025": { capabilities: caps(256000, 32000, { reasoning: true, tools: true }) },
    "command-a-vision-07-2025": { capabilities: caps(128000, 8000, { vision: true, reasoning: false, tools: false }) },
    "command-a-translate-08-2025": { capabilities: caps(8000, 8000, { reasoning: false, tools: true }) },
    "command-a-plus-05-2026": { capabilities: caps(128000, 64000, { vision: true, reasoning: true, tools: true, structuredOutput: true }), sources: ["https://docs.cohere.com/docs/command-a-plus.md"] },
    "command-r-plus-08-2024": {
      capabilities: caps(128000, 4000, { reasoning: false, tools: true }), pricing: { input: 2.5, output: 10 },
      sources: ["https://cohere.com/pricing"], billing: { quoteStatus: "quote-verified", kind: "payg", note: "Cohere's pricing FAQ explicitly quotes existing-customer Command R+08-2024 USD2.50 input/USD10 output per1M. No cache tariff verified; do not apply04-2024 pricing." },
    },
    "command-r-08-2024": {
      capabilities: caps(128000, 4000, { reasoning: false, tools: true }),
      sources: ["https://docs.cohere.com/v2/docs/command-r.md"], billing: { note: "Current captured Command R model page proves the08-2024 exact ID and128000 context, but no current token tariff. Do not borrow the03-2024 legacy FAQ price or treat search summaries as primary billing evidence." },
    },
    "command-r7b-12-2024": {
      capabilities: caps(128000, 4000, { reasoning: false, tools: true }),
      sources: ["https://docs.cohere.com/docs/command-r7b.md"], billing: { note: "Current captured Command R7B page proves exact ID/capabilities but publishes no current token tariff. No0.0375/0.15 search-summary or catalog rate is promoted to verified production pricing." },
    },
  }, {
    catalogProvider: "cohere", sources: [cohereModels, cohereCompatibility, "https://cohere.com/pricing", catalogSource],
    billing: { currency: "USD", unit: "per_1000000_tokens", kind: "unverified-pricing", quoteStatus: "unpublished", note: cohereUnpublished },
  }),
  baidu: reviewed({
    "ernie-5.1": { capabilities: { maxOutput: 65536 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.004, output: 0.018, inputCondition: "<=32k", tier: { inputCondition: "32k<input<=128k", input: 0.006, output: 0.022 } } } },
    "ernie-5.0": { capabilities: { maxOutput: 65536 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.006, output: 0.024, inputCondition: "<=32k", tier: { inputCondition: "32k<input<=128k", input: 0.01, output: 0.04 } } } },
    "ernie-5.0-thinking-preview": { capabilities: { maxOutput: 65536 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.006, output: 0.024, inputCondition: "<=32k", tier: { inputCondition: "32k<input<=128k", input: 0.01, output: 0.04 } } } },
    "ernie-5.0-thinking-latest": { capabilities: { maxOutput: 65536 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.006, output: 0.024, inputCondition: "<=32k", tier: { inputCondition: "32k<input<=128k", input: 0.01, output: 0.04 } } } },
    "ernie-5.0-thinking-exp": { capabilities: { maxOutput: 65536 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.006, output: 0.024, inputCondition: "<=32k", tier: { inputCondition: "32k<input<=128k", input: 0.01, output: 0.04 } } } },
    "ernie-4.5-turbo-32k": { capabilities: { maxOutput: 12288 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.0008, output: 0.0032, cached: 0.0002 } } },
    "ernie-4.5-turbo-128k": { capabilities: { maxOutput: 12288 } },
    "ernie-4.5-turbo-20260402": { capabilities: { maxOutput: 12288 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.0008, output: 0.0032, cached: 0.0002 } } },
    "ernie-4.5-turbo-vl": { capabilities: { maxOutput: 16384, vision: true }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.003, output: 0.009, cached: 0.00075 } } },
    "ernie-4.5-turbo-vl-32k": { capabilities: { maxOutput: 12288, vision: true }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.003, output: 0.009, cached: 0.00075 } } },
    "ernie-x1.1": {}, "ernie-x1-turbo-32k": {},
    "deepseek-v4.1-flash-1017": { capabilities: { maxOutput: 393216 }, billing: { quoteStatus: "quote-verified", note: `${baiduNote} Native CNY/1000 input/output/cache: peak08:00-22:00 0.002/0.008/0.00004; offpeak22:00-08:00 0.001/0.004/0.00002. This is NOT direct DeepSeek's weekday/holiday schedule.` } },
    "deepseek-v4.1-flash": { capabilities: { maxOutput: 393216 }, billing: { quoteStatus: "quote-verified", note: `${baiduNote} Native CNY/1000 input/output/cache: peak08:00-22:00 0.002/0.008/0.00004; offpeak22:00-08:00 0.001/0.004/0.00002. This is NOT direct DeepSeek's weekday/holiday schedule.` } },
    "deepseek-v4-pro-0813": { capabilities: { maxOutput: 393216 }, billing: { quoteStatus: "quote-verified", note: `${baiduNote} Native CNY/1000 peak08:00-22:00 input/output/cache0.009/0.027/0.0003; offpeak22:00-08:00 0.0045/0.0135/0.00015. Cache promotion09-09 through10-30 only; no post-promotion rate inferred.` } },
    "deepseek-v4-pro": { capabilities: { maxOutput: 393216 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.012, output: 0.024, cached: 0.001 } } },
    "deepseek-v4-flash-0731": { capabilities: { maxOutput: 393216 }, billing: { quoteStatus: "quote-verified", note: `${baiduNote} Native CNY/1000 peak08:00-22:00 input/output/cache0.003/0.009/0.0001; offpeak22:00-08:00 0.0015/0.0045/0.00005. Cache promotion09-09 through10-30 only; no post-promotion rate inferred.` } },
    "deepseek-v4-flash": { capabilities: { maxOutput: 393216 } },
    "glm-5.3": { capabilities: { maxOutput: 131072 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.008, output: 0.028, cached: 0.002 } } },
    "glm-5.3-flash": { capabilities: { maxOutput: 131072 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.0008, output: 0.0028, cached: 0.00023 } } },
    "glm-5.2": { capabilities: { maxOutput: 131072 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.008, output: 0.028, cached: 0.002 } } },
    "glm-5.1": { capabilities: { maxOutput: 131072 }, billing: { quoteStatus: "quote-verified", nativeQuote: { inputCondition: "[0,32k)", input: 0.006, output: 0.024, cached: 0.0013, tier: { inputCondition: "(32k,200k]", input: 0.008, output: 0.028, cached: 0.002 } }, note: `${baiduNote} Published GLM5.1 brackets omit exactly32k ([0,32k) and(32k,200k]); preserve that source ambiguity, do not guess the boundary.` } },
    "kimi-k2.6": { capabilities: { maxOutput: 262144 }, billing: { quoteStatus: "quote-verified", nativeQuote: { input: 0.0065, output: 0.027, cached: 0.0011 }, note: `${baiduNote} Source marks impending offline but gives no verified effective date; compatibility ID preserved.` } },
    "qwen3.5-397b-a17b": { capabilities: { maxOutput: 65536 }, billing: { quoteStatus: "quote-verified", nativeQuote: { inputCondition: "[0,128k]", input: 0.0012, output: 0.0072, tier: { inputCondition: "(128k,256] (source literal)", input: 0.003, output: 0.018 } } } },
    "qwen3.5-122b-a10b": { capabilities: { maxOutput: 65536 }, billing: { quoteStatus: "quote-verified", nativeQuote: { inputCondition: "[0,128k]", input: 0.0008, output: 0.0064, tier: { inputCondition: "(128k,256] (source literal)", input: 0.002, output: 0.016 } } } },
    "qwen3.5-35b-a3b": { capabilities: { maxOutput: 65536 }, billing: { quoteStatus: "quote-verified", nativeQuote: { inputCondition: "[0,128k]", input: 0.0004, output: 0.0032, tier: { inputCondition: "(128k,256] (source literal)", input: 0.0016, output: 0.0128 } } } },
    "qwen3.5-27b": { capabilities: { maxOutput: 65536 }, billing: { quoteStatus: "quote-verified", nativeQuote: { inputCondition: "[0,128k]", input: 0.0006, output: 0.0048, tier: { inputCondition: "(128k,256] (source literal)", input: 0.0018, output: 0.0144 } } } },
  }, {
    sources: [baiduModels, baiduBilling],
    billing: { currency: "CNY", unit: "per_1000_tokens", kind: "payg", quoteStatus: "unpublished", region: "Qianfan", note: baiduNote },
  }),
  mistral: reviewed({
    "mistral-large-4": {
      capabilities: caps(null, null, { vision: true, reasoning: true, tools: true, structuredOutput: true }),
      limits: { catalogAsOf: asOf, contextWindowLiteral: "1M", unknownLimitNote: "Current model page publishes1M context but no independent output maximum; exact context notation conversion not independently verified." },
      pricing: { input: 1.36, output: 4.18, cached: 0.14 }, sources: ["https://docs.mistral.ai/models/mistral-large-4-0.md"],
    },
    "zai-glm-5-3": {
      capabilities: caps(1048576, 131072, { reasoning: true, tools: true, structuredOutput: true }),
      limits: { contextWindowLiteral: "1M", maxOutputLiteral: "128k", maxOutputScope: "Independent output-token limit is published by the Mistral model page; numeric binary-k convention retains the exact route catalog comparison." },
      pricing: { input: 1.4, output: 4.4, cached: 0.14 }, sources: ["https://docs.mistral.ai/models/zai-glm-5-3"],
    },
    "ministral-14b-2512": { capabilities: caps(262144, null, { vision: true, reasoning: false, tools: true, structuredOutput: true }), pricing: { input: 0.2, output: 0.2 }, sources: ["https://docs.mistral.ai/models/ministral-3-14b-25-12"] },
    "ministral-8b-2512": { capabilities: caps(262144, null, { vision: true, reasoning: false, tools: true, structuredOutput: true }), pricing: { input: 0.15, output: 0.15 }, sources: ["https://docs.mistral.ai/models/ministral-3-8b-25-12"] },
    "ministral-3b-2512": {
      capabilities: caps(131072, null, { vision: true, reasoning: false, tools: true, structuredOutput: true }), pricing: { input: 0.1, output: 0.1 },
      limits: { architectureContextWindow: 262144, contextWindowStatus: "The current exact-provider catalog records the native API /v1/models ceiling as131072 while model documentation/weights describe262144. Advertise the smaller API-route reference, not the architecture maximum; no new authenticated API probe was performed.", fieldSources: { contextWindow: "https://models.dev/api.json" } },
      sources: ["https://docs.mistral.ai/models/ministral-3-3b-25-12", "https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512/raw/main/config.json"],
    },
    "mistral-large-latest": { capabilities: caps(262144, null, { vision: true, reasoning: false, tools: true }), pricing: { input: 0.5, output: 1.5 }, sources: ["https://docs.mistral.ai/models/mistral-large-3-25-12.md"] },
    "mistral-medium-latest": { capabilities: caps(262144, null, { vision: true, reasoning: true, tools: true, structuredOutput: true }), pricing: { input: 1.5, output: 7.5 }, sources: ["https://docs.mistral.ai/models/mistral-medium-3-5-26-04.md"] },
    "mistral-small-latest": { capabilities: caps(262144, null, { vision: true, reasoning: true, tools: true }), pricing: { input: 0.15, output: 0.6 }, sources: ["https://docs.mistral.ai/models/mistral-small-4-0-26-03.md"] },
    "codestral-latest": { capabilities: caps(null, null, { reasoning: false, tools: true }), pricing: { input: 0.3, output: 0.9 }, limits: { contextWindowStatus: "The exact native catalog publishes256000 for codestral-latest while its declared Codestral2508 base/documentation reference publishes128000. The changing alias ceiling is unresolved; no new authenticated API probe was performed.", contextWindowConflict: { catalog: 256000, documentedBase: 128000, asOf: "2026-10-29" } }, sources: ["https://docs.mistral.ai/models/codestral-25-08.md"] },
  }, {
    catalogProvider: "mistral", sources: [mistralPricing, catalogSource],
    billing: { currency: "USD", unit: "per_1000000_tokens", kind: "payg", quoteStatus: "quote-verified", region: "Mistral-hosted", note: mistralNote },
  }),
  poolside: reviewed({
    "poolside/laguna-s-2.1": {
      capabilities: caps(1048576, null, { reasoning: true, tools: true, structuredOutput: false }),
      limits: { fieldSources: { contextWindow: "https://huggingface.co/poolside/Laguna-S-2.1/raw/main/config.json" }, contextWindowScope: "Official model positions corroborate the exact hosted catalog window, not authenticated entitlement." },
      sources: ["https://huggingface.co/poolside/Laguna-S-2.1/raw/main/config.json", "https://docs.poolside.ai/api/overview"],
    },
    "poolside/laguna-xs-2.1": { capabilities: caps(null, null, { reasoning: true, tools: true, structuredOutput: false }), limits: { contextWindowLiteral: "256K", unknownLimitNote: "Self-managed supported-model specification is not a verified hosted route maximum." } },
  }, {
    catalogProvider: "poolside", sources: [poolsideSource, "https://poolside.ai/models", catalogSource],
    billing: { kind: "promotional", quoteStatus: "unpublished", note: poolsideNote },
  }),
  perplexity: reviewed({
    "sonar-pro": { capabilities: caps(200000, null, { vision: true, reasoning: false, tools: false }) },
    "sonar": { capabilities: caps(128000, null, { reasoning: false, tools: false }) },
    "sonar-reasoning-pro": { capabilities: caps(128000, null, { vision: true, reasoning: true, tools: false }) },
    "sonar-deep-research": { capabilities: caps(128000, null, { reasoning: true, tools: false }) },
  }, {
    catalogProvider: "perplexity", sources: ["https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar.md", catalogSource],
    billing: { kind: "legacy-migrating", quoteStatus: "unpublished", note: "Standalone Sonar support ended2026-09-27. Synchronous/streaming compatibility requests are gradually reformulated into Agent calls; async is unsupported. Existing IDs retained, but old Sonar token/search fees and output caps do not verify current migrated billing. No current native quote fabricated." },
  }),
  "perplexity-agent": reviewed({
    "anthropic/claude-fable-5": { pricing: { input: 10, output: 50, cached: 1 } },
    "anthropic/claude-fable-5-1": { pricing: { input: 10, output: 50, cached: 0.25 } },
    "anthropic/claude-opus-5-5": { pricing: { input: 4, output: 20, cached: 0.2 } },
    "anthropic/claude-opus-5": { pricing: { input: 5, output: 25, cached: 0.5 } },
    "anthropic/claude-sonnet-5-5": { pricing: { input: 2, output: 10, cached: 0.1 } },
    "anthropic/claude-sonnet-5": { pricing: { input: 2, output: 10, cached: 0.2 } },
    "anthropic/claude-opus-4-8": agentLegacy,
    "anthropic/claude-opus-4-7": agentLegacy,
    "anthropic/claude-opus-4-6": agentLegacy,
    "anthropic/claude-opus-4-5": agentLegacy,
    "anthropic/claude-sonnet-4-6": agentLegacy,
    "anthropic/claude-sonnet-4-5": agentLegacy,
    "anthropic/claude-haiku-4-5": agentLegacy,
    "openai/gpt-6.1-sol": agentGpt(2, 10, 0.1, 4, 15, 0.2),
    "openai/gpt-6-sol": agentGpt(2, 10, 0.2, 4, 15, 0.4),
    "openai/gpt-6-luna": agentGpt(0.1, 0.5, 0.01, 0.2, 0.75, 0.02),
    "openai/gpt-5.6-sol": agentGpt(4, 20, 0.4, 8, 30, 0.8),
    "openai/gpt-5.6-terra": agentGpt(2, 12, 0.2, 4, 18, 0.4),
    "openai/gpt-5.6-luna": agentGpt(0.2, 1.2, 0.02, 0.4, 1.8, 0.04),
    "openai/gpt-5.5": agentGpt(5, 30, 0.5, 10, 45, 1),
    "openai/gpt-5.4": agentLegacy, "openai/gpt-5.4-mini": agentLegacy,
    "google/gemini-3.6-flash": { pricing: { input: 1.5, output: 7.5, cached: 0.15 } },
    "google/gemini-3.7-flash": { pricing: { input: 0.75, output: 3.75, cached: 0.075 } },
    "google/gemini-3.8-flash": { pricing: { input: 0.75, output: 3.75, cached: 0.075 } },
    "google/gemini-3.1-pro-preview": agentLegacy,
    "google/gemini-3.1-flash-lite": agentLegacy,
    "google/gemini-3.5-flash": agentLegacy,
    "google/gemini-3.5-flash-lite": agentLegacy,
    "google/gemini-3-flash-preview": agentLegacy,
    "xai/grok-4.7": { pricing: { input: 2, output: 6, cached: 0.5, tier: { threshold: 200000, inclusive: true, input: 4, output: 12, cached: 1 } } },
    "xai/grok-4.6": { pricing: { input: 2, output: 6, cached: 0.5, tier: { threshold: 200000, inclusive: true, input: 4, output: 12, cached: 1 } } },
    "xai/grok-4.5": { pricing: { input: 2, output: 6, cached: 0.3, tier: { threshold: 200000, inclusive: true, input: 4, output: 12, cached: 0.6 } } },
    "xai/grok-4.3": agentLegacy,
    "xai/grok-4.20-reasoning": agentLegacy,
    "xai/grok-4.20-non-reasoning": agentLegacy,
    "xai/grok-4.20-multi-agent": agentLegacy,
    "perplexity/glm-5.3": { pricing: { input: 1.4, output: 4.4, cached: 0.26 } },
    "perplexity/glm-5.3-flash": { pricing: { input: 0.15, output: 0.5, cached: 0.03 } },
    "perplexity/kimi-k3": { pricing: { input: 3, output: 15, cached: 0.3 } },
    "perplexity/kimi-k2.7-code": agentLegacy,
    "perplexity/nemotron-3-ultra-550b-a55b": agentLegacy,
    "perplexity/nemotron-3.5-super-120b-a12b": { capabilities: caps(1048576, 131072, { reasoning: true }), pricing: { input: 0.2, output: 0.5, cached: 0.04 } },
    "perplexity/sonar": { pricing: { input: 0.25, output: 2.5, cached: 0.0625 } },
  }, {
    sources: [agentSource, agentQuickstart],
    billing: { currency: "USD", unit: "per_1000000_tokens", kind: "payg", quoteStatus: "quote-verified", note: agentNote },
  }),
  tencent: reviewed({
    "hy3-preview": {}, "hunyuan-turbos-latest": {}, "hunyuan-t1-latest": {},
  }, {
    sources: ["https://cloud.tencent.com/document/product/1729/97731", "https://cloud.tencent.com/document/product/1729/111007", "https://cloud.tencent.com/document/product/1729/116755"],
    billing: { currency: "CNY", unit: "per_1000000_tokens", kind: "unverified-route", quoteStatus: "unpublished", region: "Hunyuan-legacy", note: "This is api.hunyuan.cloud.tencent.com, not TokenHub or CodeBuddy. Official migration notice says existing services remain but no new model capabilities/new purchases. Chatbox guide shows Hy3 as a UI label, not proof of exact hy3-preview/Hy4 wire IDs or route prices. Current original-platform pricing table does not quote these registry IDs. Preserve existing aliases without inventing retirement, importing TokenHub prices or FX estimates." },
  }),
  "volcengine-ark": reviewed({
    "Doubao-Seed-2.0-Code": {}, "Doubao-Seed-2.0-pro": {}, "Doubao-Seed-2.0-lite": {}, "Doubao-Seed-Code": {},
    "DeepSeek-V4-Flash": {}, "DeepSeek-V4-Pro": {}, "GLM-5.1": {}, "MiniMax-M2.7": {}, "Kimi-K2.6": {},
  }, {
    sources: [arkSource, arkQuickstart],
    billing: { currency: "CNY", unit: "quota", kind: "subscription", quoteStatus: "subscription-unknown", region: "cn-beijing-Coding-Plan", note: "The configured /api/coding/v3 transport is Ark Coding Plan, not PAYG /api/v3 or the new Agent Plan. Quota only applies to supported AI coding tools; exhaustion does not charge other resources/balance. Five-hour, weekly and subscription-month windows apply. Historical registry model names remain compatibility entries, not a current allowlist or entitlement claim. No USD token rates are inferred from catalog/PAYG prices or plan coefficients." },
  }),
  byteplus: reviewed({
    "seed-2-0-pro-260328": {}, "seed-2-0-code-preview-260328": {}, "seed-2-0-mini-260215": {}, "seed-2-0-lite-260228": {},
    "kimi-k2-thinking-251104": {}, "glm-4-7-251222": {}, "gpt-oss-120b-250805": {},
  }, {
    sources: [byteplusSource],
    billing: { currency: "USD", unit: "quota", kind: "subscription", quoteStatus: "subscription-unknown", region: "ap-southeast-1-Coding-Plan", note: "The configured /api/coding/v3 endpoint is BytePlus Coding Plan, not ordinary ModelArk PAYG. Supported AI coding tools only; region/account model availability is console-specific. Five-hour quota refreshes from first request; week Monday00:00, month subscription-cycle00:00. Excess usage pauses rather than consuming account balance. Existing dated PAYG-style IDs are retained without invented retirement/current plan entitlement. No plan fee or request multiplier is converted into USD/token rates." },
  }),
};
