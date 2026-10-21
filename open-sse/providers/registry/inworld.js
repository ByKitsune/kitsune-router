export default {
  id: "inworld",
  alias: "inworld",
  display: {
    name: "Inworld TTS",
    icon: "record_voice_over",
    color: "#FF6B6B",
    textIcon: "IW",
    website: "https://inworld.ai",
    notice: {
      text: "On-demand TTS-2 $25/1M characters; TTS-2 Flash $15/1M characters. Paid-plan rates and included balances differ. TTS-1.5 models are deprecated; character prices are not per-minute or token tariffs.",
      apiKeyUrl: "https://platform.inworld.ai/api-keys"
    }
  },
  category: "apikey",
  authType: "apikey",
  models: [
    { id: "inworld-tts-2", name: "Inworld TTS 2", kind: "tts" },
    { id: "inworld-tts-2-flash", name: "Inworld TTS 2 Flash", kind: "tts" },
  ],
  serviceKinds: [
    "tts"
  ],
  ttsConfig: {
    baseUrl: "https://api.inworld.ai/tts/v1/voice",
    authType: "apikey",
    authHeader: "basic",
    format: "inworld",
    models: [
      { id: "inworld-tts-2", name: "Inworld TTS 2" },
      { id: "inworld-tts-2-flash", name: "Inworld TTS 2 Flash" },
      {
        id: "inworld-tts-1.5-mini",
        name: "Inworld TTS 1.5 Mini (Deprecated)"
      },
      {
        id: "inworld-tts-1.5-max",
        name: "Inworld TTS 1.5 Max (Deprecated)"
      }
    ]
  }
};
