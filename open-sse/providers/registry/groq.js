export default {
  id: "groq",
  priority: 60,
  hasFree: true,
  alias: "groq",
  display: {
    name: "Groq",
    icon: "speed",
    color: "#F55036",
    textIcon: "GQ",
    website: "https://groq.com",
    notice: {
      apiKeyUrl: "https://console.groq.com/keys",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    validateUrl: "https://api.groq.com/openai/v1/models",
    // No dedicated quota endpoint; rate-limit info rides on x-ratelimit-*
    // response headers, always included. Reuse the models list (already
    // used as validateUrl) so reading usage never costs tokens.
    usage: {
      url: "https://api.groq.com/openai/v1/models",
    },
  },
  models: [
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B" },
    // The August 16 sunset excludes committed-spend enterprise accounts.
    // These remain explicit routes; the general default uses GPT-OSS above.
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B (Enterprise eligibility required)" },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant (Enterprise eligibility required)" },
    { id: "qwen/qwen3.8-27b", name: "Qwen3.8 27B (Preview)" },
    { id: "minimaxai/minimax-m2.7", name: "MiniMax M2.7 (Preview)" },
    { id: "whisper-large-v3", name: "Whisper Large v3", params: ["language","response_format","temperature","prompt"], kind: "stt" },
    { id: "whisper-large-v3-turbo", name: "Whisper Large v3 Turbo", params: ["language","response_format","temperature","prompt"], kind: "stt" },
    { id: "distil-whisper-large-v3-en", name: "Distil Whisper Large v3 EN", deprecated: true, deprecationDate: "2025-08-23", deprecationNotice: "Shut down August 23, 2025; use whisper-large-v3-turbo.", params: ["language","response_format","temperature","prompt"], kind: "stt" },
  ],
  serviceKinds: ["llm","imageToText","stt"],
  sttConfig: {
    baseUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
    authType: "apikey",
    authHeader: "bearer",
    format: "openai",
  },
  features: {
    usage: true,
    usageApikey: true,
  },
};
