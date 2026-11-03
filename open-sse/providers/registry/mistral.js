export default {
  id: "mistral",
  priority: 80,
  alias: "mistral",
  display: {
    name: "Mistral",
    icon: "air",
    color: "#FF7000",
    textIcon: "MI",
    website: "https://mistral.ai",
    notice: {
      apiKeyUrl: "https://console.mistral.ai/api-keys",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    validateUrl: "https://api.mistral.ai/v1/models",
    // Native model cards expose max_context_length and capability booleans;
    // their type:"base" discriminator is not a gateway service kind.
    modelsFetcher: { url: "https://api.mistral.ai/v1/models", type: "mistral" },
    // This endpoint accepts reasoning_effort, not the hosted model's native dialect.
    thinkingFormat: "openai",
    quirks: {
      dropClientMetadata: true,
    },
  },
  models: [
    { id: "zai-glm-5-3", name: "Z.ai GLM 5.3" },
    // Exact provider-hosted catalog IDs reviewed 2026-11-04; account entitlement may differ.
    {id: "mistral-large-4-0", name: "Mistral Large 4 (26.10)"},
    {id: "zai-glm-5-3-flash", name: "GLM 5.3 Flash (Mistral)"},
    { id: "mistral-large-4", name: "Mistral Large 4" },
    { id: "ministral-14b-2512", name: "ministral 14b 2512" },
    { id: "ministral-8b-2512", name: "ministral 8b 2512" },
    { id: "ministral-3b-2512", name: "ministral 3b 2512" },
    { id: "mistral-large-latest", name: "Mistral Large 3" },
    { id: "mistral-small-latest", name: "Mistral Small 4" },
    { id: "codestral-latest", name: "Codestral" },
    { id: "mistral-medium-latest", name: "Mistral Medium 3.5" },
    { id: "codestral-embed-2505", name: "Codestral Embed 2505", kind: "embedding" },
    { id: "mistral-embed", name: "Mistral Embed", kind: "embedding" },
  ],
  serviceKinds: ["llm","imageToText","embedding"],
  embeddingConfig: { baseUrl: "https://api.mistral.ai/v1/embeddings", authType: "apikey", authHeader: "bearer" },
};
