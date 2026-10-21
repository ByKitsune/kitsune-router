export default {
  id: "api-airforce",
  alias: "af",
  aliases: [
    "airforce",
  ],
  uiAlias: "af",
  display: {
    name: "API.airforce",
    icon: "flight",
    color: "#0EA5E9",
    textIcon: "AF",
    website: "https://api.airforce",
    notice: {
      apiKeyUrl: "https://api.airforce",
    },
  },
  category: "freeTier",
  authType: "apikey",
  authModes: [
    "apikey",
  ],
  transport: {
    baseUrl: "https://api.airforce/v1/chat/completions",
    validateUrl: "https://api.airforce/v1/models",
    headers: {
      "HTTP-Referer": "https://endpoint-proxy.local",
      "X-Title": "Endpoint Proxy",
    },
  },
  models: [
    { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet (Free)", contextLength: 200000 },
    // Public /v1/models, 2026-10-21: id is the native chat name;
    // catalog_id is a distinct identity and tier is not a zero-dollar tariff.
    { id: "claude-sonnet-5.5", name: "Claude Sonnet 5.5", contextLength: 1000000, maxOutputTokens: 128000, capabilities: { vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false } },
    { id: "claude-opus-5.5", name: "Claude Opus 5.5", contextLength: 1000000, maxOutputTokens: 128000, capabilities: { vision: true, tools: true, reasoning: true, audioInput: false, videoInput: false } },
    { id: "moonshot/kimi-k2.6", name: "Kimi K2.6 (Free)", contextLength: 262144 },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (Free)", contextLength: 1048576 },
  ],
};
