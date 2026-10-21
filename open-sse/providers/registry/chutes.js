export default {
  id: "chutes",
  priority: 70,
  alias: "chutes",
  aliases: [
    "ch",
  ],
  uiAlias: "ch",
  display: {
    name: "Chutes AI",
    icon: "water_drop",
    color: "#ffffffff",
    textIcon: "CH",
    website: "https://chutes.ai",
    notice: {
      apiKeyUrl: "https://chutes.ai/app/api",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://llm.chutes.ai/v1/chat/completions",
    validateUrl: "https://llm.chutes.ai/v1/models",
  },
  // Curated confidential-compute (-TEE) seeds (chutes.ai/app catalog, 2026-08-20).
  // Passthrough covers the rest.
  models: [
    { id: "moonshotai/Kimi-K3-TEE", name: "Kimi K3 (TEE)" },
    // Public /v1/models, 2026-10-21; absence never retires an existing alias.
    { id: "google/gemma-4-31B-turbo-TEE", name: "Gemma 4 31B Turbo (TEE)", supportedFormats: ["openai"] },
    { id: "Nemotron-3-Nano-Omni-30B-TEE", name: "Nemotron 3 Nano Omni 30B (TEE)", supportedFormats: ["openai"] },
    { id: "moonshotai/Kimi-K2.6-TEE", name: "Kimi K2.6 (TEE)" },
    { id: "zai-org/GLM-5.2-TEE", name: "GLM 5.2 (TEE)" },
    { id: "zai-org/GLM-5.1-TEE", name: "GLM 5.1 (TEE)" },
    { id: "deepseek-ai/DeepSeek-V4-Flash-0731-TEE", name: "DeepSeek V4 Flash (TEE)" },
    { id: "deepseek-ai/DeepSeek-V3.2-TEE", name: "DeepSeek V3.2 (TEE)" },
    { id: "Qwen/Qwen3.5-397B-A17B-TEE", name: "Qwen3.5 397B (TEE)" },
    { id: "Qwen/Qwen3.8-27B-TEE", name: "Qwen3.8 27B (TEE)" },
    { id: "Qwen/Qwen3.6-27B-TEE", name: "Qwen3.6 27B (TEE)" },
    { id: "Qwen/Qwen3-32B-TEE", name: "Qwen3 32B (TEE)" },
    { id: "Qwen/Qwen3-235B-A22B-Thinking-2507-TEE", name: "Qwen3 235B Thinking (TEE)" },
    { id: "unsloth/Mistral-Nemo-Instruct-2407-TEE", name: "Mistral Nemo (TEE)" },
  ],
};
