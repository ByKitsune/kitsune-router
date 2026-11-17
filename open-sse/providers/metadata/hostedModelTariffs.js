// Exact model tariff observations from the provider's own hosted product.
// These records are independent of subscription quotas and upstream vendor rates.
const captures = [
  {
    provider: "chutes",
    source: {
      url: "https://llm.chutes.ai/v1/models", verifiedAtUtc: "2026-11-17T22:55:16.632Z",
      sha256: "9a26553b5c963652ba155a3eeb9be40a607e12e1e25db6f14f571ec02aeda717",
    },
    documentation: "https://www.chutes.ai/docs/help/faq",
    note: "Published prices for the Chutes hosted API. Subscription allowance and invoice amounts depend on the account.",
    models: {
      "deepseek-ai/DeepSeek-V4.1-Flash-1017": { input: 0.3, output: 1.2, cached: 0.03 },
      "deepseek-ai/DeepSeek-V4-Pro-0813": { input: 0.85, output: 2.65, cached: 0.15 },
      "zai-org/GLM-5.3": { input: 1.225, output: 3.85, cached: 0.245 },
      "zai-org/GLM-5.2-Fast": { input: 2.45, output: 7.7, cached: 0.49 },
      "moonshotai/Kimi-K2.7-Code": { input: 0.832, output: 3.5, cached: 0.167 },
      "Qwen/Qwen3.8-Max-0902": { input: 2, output: 6, cached: 0.25 },
      "Qwen/Qwen3.8-2.4T-A95B": { input: 2, output: 6, cached: 0.25 },
      "moonshotai/Kimi-K2.6-TEE": { input: 0.39, output: 1.8, cached: 0.039 },
      "zai-org/GLM-5.1-TEE": { input: 0.9, output: 2.9, cached: 0.09 },
    },
  },
  {
    provider: "kilo-gateway",
    source: {
      url: "https://api.kilo.ai/api/gateway/models", verifiedAtUtc: "2026-11-17T22:55:16.953Z",
      sha256: "49d5b9801fb91540a97f3a65e1f5ff714aec2c6488ab229e1317a78076a31e42",
    },
    documentation: "https://kilo.ai/docs/gateway/usage-and-billing",
    note: "Public Kilo Gateway text rates converted from USD per token. BYOK and account allowances can change the amount charged by Kilo.",
    cacheWriteReferences: {
      "openai/gpt-6.1-terra": 2.5,
      "openai/gpt-6.1-terra-pro": 2.5,
      "moonshotai/kimi-k3.1-pro": 5,
      "google/gemini-4-argon": 0.1875,
      "openai/gpt-6-astra": 25,
      "anthropic/claude-opus-5.5": 5,
    },
    models: {
      "nvidia/nemotron-3.5-super-vl:free": { input: 0, output: 0 },
      "reflection/beam-free": { input: 0, output: 0 },
      "openai/gpt-6.1-terra": { input: 2, output: 7.5, cached: 0.1 },
      "openai/gpt-6.1-terra-pro": { input: 2, output: 7.5, cached: 0.1 },
      "moonshotai/kimi-k3.1-pro": { input: 4, output: 20, cached: 0.2 },
      "google/gemini-4-argon": { input: 2, output: 10, cached: 0.1, reasoning: 10 },
      "openai/gpt-6-astra": { input: 20, output: 75, cached: 2 },
      "anthropic/claude-opus-5.5": { input: 4, output: 20, cached: 0.2 },
    },
  },
  {
    provider: "morph",
    source: {
      url: "https://www.morphllm.com/api/models/json", verifiedAtUtc: "2026-11-17T22:59:13.316Z",
      sha256: "e2c40f90fcf31bdec960cadfb5e4a5a510c3796c39bbff7e4df6c612d6e13c40",
    },
    documentation: "https://docs.morphllm.com/sdk/components/fast-models",
    note: "Current published USD-per-token pricing for exact Morph catalog rows marked ready. The account determines actual charges.",
    models: {
      "morph-glm52-744b": { input: 0.643, output: 1.978, cached: 0.217, cache_creation: 0, cache_creation_1h: null },
      "morph-dsv41flash-1017": { input: 0.059, output: 0.52, cached: 0.005, cache_creation: 0 },
      "morph-glm53-744b": { input: 0.976, output: 4.555, cached: 0.197, cache_creation: 0 },
      "morph-glm53flash": { input: 0.119, output: 0.342, cached: 0.059, cache_creation: 0 },
    },
  },
  {
    provider: "paraloncloud",
    source: {
      url: "https://paraloncloud.com/resources/pay-as-you-go-inference-api", verifiedAtUtc: "2026-11-17T22:55:16.911Z",
      sha256: "b1a6c312cebc24c759ba7a175872c71f887e04a9a2a7f4ce83bd271667bf4988",
    },
    documentation: "https://paraloncloud.com/docs/inference-api",
    note: "Published cash rates for the ParalonCloud inference API. Trial allowance is managed on the provider account.",
    models: {
      "qwen3.8-27b": { input: 0.12, output: 1.7 },
      "qwen3-3b": { input: 0.05, output: 0.2 },
    },
  },
];

export function applyHostedModelTariffs(metadata) {
  for (const { provider, source, documentation, note, models, cacheWriteReferences } of captures) {
    const records = metadata[provider] ||= {};
    for (const [model, pricing] of Object.entries(models)) {
      const previous = records[model] || {};
      const free = pricing.input === 0 && pricing.output === 0;
      records[model] = {
        ...previous,
        pricing,
        sources: [...new Set([...(previous.sources || []), source.url, documentation])],
        billing: {
          ...previous.billing,
          kind: free ? "free-promotion" : "metered",
          currency: "USD", unit: "1M tokens", effectiveFrom: source.verifiedAtUtc, invoiceVerified: false,
          ...(cacheWriteReferences?.[model] !== undefined && {
            cacheWriteReference: { rate: cacheWriteReferences[model], lifetime: null },
          }),
          note: free ? "The current public Kilo catalog lists zero text input and output rates. Availability can change." : note,
        },
        provenance: { ...previous.provenance, catalog: source },
      };
    }
  }
}
