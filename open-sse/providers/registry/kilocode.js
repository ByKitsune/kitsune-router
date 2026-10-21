export default {
  id: "kilocode",
  priority: 70,
  alias: "kc",
  uiAlias: "kc",
  display: {
    name: "Kilo Code",
    icon: "code",
    color: "#FF6B35",
    textIcon: "KC",
    website: "https://kilocode.ai",
    notice: {
      signupUrl: "https://kilocode.ai",
    },
  },
  category: "oauth",
  transport: {
    baseUrl: "https://api.kilo.ai/api/openrouter/chat/completions",
    headers: {},
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
      hooks: [
        "kilocodeOrg",
      ],
    },
  },
  models: [
    { id: "anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    // Public api.kilo.ai/api/gateway/models, 2026-10-21; paid and free
    // literal IDs share the existing Kilo OpenRouter-compatible transport.
    { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", contextLength: 1000000, maxOutputTokens: 128000 },
    { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", contextLength: 1000000, maxOutputTokens: 128000 },
    { id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol", contextLength: 1050000, maxOutputTokens: 128000 },
    { id: "deepseek/deepseek-v4.1-flash-1017", name: "DeepSeek V4.1 Flash 1017", contextLength: 1048576, maxOutputTokens: 393216 },
    { id: "minimax/minimax-m3.1-flash:free", name: "MiniMax M3.1 Flash (Free)", contextLength: 1000000, maxOutputTokens: 524288 },
    { id: "anthropic/claude-opus-4-20250514", name: "Claude Opus 4" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "openai/gpt-4.1", name: "GPT-4.1" },
    { id: "openai/o3", name: "o3" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat" },
    { id: "deepseek/deepseek-reasoner", name: "DeepSeek Reasoner" },
  ],
  // Kilo Code exposes its own OpenRouter-compatible gateway catalog,
  // so the hardcoded list above is only a fallback. Surfacing the full catalog
  // requires a fetcher + passthroughModels, matching how openrouter.js is set up.
  // Without these, only the hardcoded fallback models appear in the combo model picker,
  // hiding dynamic models like cohere/north-mini-code:free and poolside/laguna-m.1:free.
  modelsFetcher: { url: "https://api.kilo.ai/api/gateway/models", type: "openrouter-free" },
  passthroughModels: true,
  oauth: {
    apiBaseUrl: "https://api.kilo.ai",
    initiateUrl: "https://api.kilo.ai/api/device-auth/codes",
    pollUrlBase: "https://api.kilo.ai/api/device-auth/codes",
  },
};
