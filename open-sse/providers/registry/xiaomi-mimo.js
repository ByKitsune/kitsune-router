import { CLAUDE_API_HEADERS } from "../shared.js";

export default {
  id: "xiaomi-mimo",
  priority: 290,
  alias: "xiaomi-mimo",
  aliases: [
    "mimo",
  ],
  uiAlias: "mimo",
  display: {
    name: "Xiaomi MiMo",
    icon: "smart_toy",
    color: "#FF6900",
    textIcon: "XM",
    website: "https://xiaomimimo.com",
    notice: {
      apiKeyUrl: "https://platform.xiaomimimo.com/console/api-keys",
    },
  },
  category: "apikey",
  serviceKinds: ["llm", "tts"],
  transport: {
    baseUrl: "https://api.xiaomimimo.com/v1/chat/completions",
    validateUrl: "https://api.xiaomimimo.com/v1/models",
  },
  // Multi-endpoint: pick the transport matching client sourceFormat to skip translation.
  transports: [
    {
      format: "openai",
      baseUrl: "https://api.xiaomimimo.com/v1/chat/completions",
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
    },
    {
      format: "claude",
      baseUrl: "https://api.xiaomimimo.com/anthropic/v1/messages",
      headers: { ...CLAUDE_API_HEADERS },
      auth: { combined: true, header: "x-api-key", scheme: "raw" },
    },
  ],
  models: [
    { id: "mimo-v2.6-pro", name: "MiMo V2.6 Pro" },
    { id: "mimo-v2.6-flash", name: "MiMo V2.6 Flash" },
    { id: "mimo-v2.6-pro-ultraspeed", name: "MiMo V2.6 Pro Ultraspeed" },
    // Official model notice confirms these IDs no longer work after October 21.
    // Keep explicit historical identities while excluding them from discovery.
    { id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro", deprecated: true, deprecationDate: "2026-10-21T10:00:00+08:00", deprecationNotice: "Retired October 21, 2026; migrate to MiMo V2.6." },
    { id: "mimo-v2.5", name: "MiMo V2.5", deprecated: true, deprecationDate: "2026-10-21T10:00:00+08:00", deprecationNotice: "Retired October 21, 2026; migrate to MiMo V2.6." },
    { id: "mimo-v2.5-asr", name: "MiMo V2.5 ASR", kind: "stt" },
    { id: "mimo-v2.5-tts", name: "MiMo V2.5 TTS", kind: "tts" },
  ],
  ttsConfig: {
    baseUrl: "https://api.xiaomimimo.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    format: "xiaomi-mimo-tts",
  },
};
