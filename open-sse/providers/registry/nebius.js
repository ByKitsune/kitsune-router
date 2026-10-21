export default {
  id: "nebius",
  priority: 70,
  alias: "nebius",
  display: {
    name: "Nebius AI",
    icon: "cloud",
    color: "#6C5CE7",
    textIcon: "NB",
    website: "https://nebius.com",
    notice: {
      apiKeyUrl: "https://studio.nebius.com/settings/api-keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    baseUrl: "https://api.tokenfactory.nebius.com/v1/chat/completions",
    validateUrl: "https://api.tokenfactory.nebius.com/v1/models",
  },
  models: [
    { id: "deepseek-ai/DeepSeek-V4-Flash-0731", name: "DeepSeek V4 Flash" },
    // Public Token Factory models_info; account/region entitlement is not verified.
    { id: "deepseek-ai/DeepSeek-V4.1-Flash", name: "DeepSeek V4.1 Flash", supportedFormats: ["openai"] },
    { id: "MiniMaxAI/MiniMax-M3", name: "MiniMax M3" },
    { id: "Qwen/Qwen3-Embedding-8B", name: "Qwen3 Embedding 8B", kind: "embedding" },
  ],
  serviceKinds: ["llm", "embedding"],
  embeddingConfig: { baseUrl: "https://api.tokenfactory.nebius.com/v1/embeddings" },
};
