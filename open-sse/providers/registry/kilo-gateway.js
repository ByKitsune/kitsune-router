export default {
  id: "kilo-gateway",
  alias: "kgw",
  aliases: [
    "kilo-gateway",
    "kilogateway",
  ],
  uiAlias: "kgw",
  category: "freeTier",
  display: {
    name: "Kilo Gateway",
    icon: "login",
    color: "#8B5CF6",
    textIcon: "KG",
    website: "https://kilo.ai",
    notice: {
      apiKeyUrl: "https://kilo.ai/dashboard?tab=apiKeys",
    },
  },
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.kilo.ai/api/gateway/chat/completions",
    validateUrl: "https://api.kilo.ai/api/gateway/models",
  },
  models: [
    { id: "kilo-auto/free", name: "Kilo Auto Free", contextLength: 256000 },
    // The public catalog's -1 auto price is dynamic/unknown, not negative or free.
    { id: "kilo-auto/efficient", name: "Kilo Auto Efficient", supportedFormats: ["openai"] },
    { id: "minimax/minimax-m3.1-flash:free", name: "MiniMax M3.1 Flash (Free)", supportedFormats: ["openai"] },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super 120B (Free)", contextLength: 262144 },
    { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Nemotron 3 Ultra 550B (Free)", contextLength: 1000000 },
    { id: "kwaipilot/kat-coder-pro-v2.5:free", name: "Kat Coder Pro v2.5 (Free)", contextLength: 256000 },
    { id: "kilo-auto/frontier", name: "Kilo Auto Frontier", contextLength: 1000000 },
    { id: "kilo-auto/balanced", name: "Kilo Auto Balanced", contextLength: 1000000 },
    // Exact publisher catalog IDs reviewed 2026-11-04; account policy remains authoritative.
    {id: "nvidia/nemotron-3.5-super-vl:free", name: "Nemotron 3.5 Super VL (Free)", targetFormat: "openai", supportedFormats: ["openai"]},
    {id: "reflection/beam-free", name: "Beam 1.0 (Free)", targetFormat: "openai", supportedFormats: ["openai"]},
    {id: "openai/gpt-6.1-terra", name: "GPT-6.1 Terra", targetFormat: "openai", supportedFormats: ["openai"]},
    {id: "openai/gpt-6.1-terra-pro", name: "GPT-6.1 Terra Pro", targetFormat: "openai", supportedFormats: ["openai"]},
    {id: "moonshotai/kimi-k3.1-pro", name: "Kimi K3.1 Pro", targetFormat: "openai", supportedFormats: ["openai"]},
    {id: "google/gemini-4-argon", name: "Gemini 4 Argon", targetFormat: "openai", supportedFormats: ["openai"]},
    {id: "openai/gpt-6-astra", name: "GPT-6 Astra", targetFormat: "openai", supportedFormats: ["openai"]},
    {id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", targetFormat: "openai", supportedFormats: ["openai"]},
  ],
};
