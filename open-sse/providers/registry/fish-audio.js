// Fish Audio TTS — the model id travels in an HTTP `model` header rather than the
// JSON body, and the voice is a reference_id (a cloned or preset voice model).
export default {
  id: "fish-audio",
  alias: "fish",
  display: {
    name: "Fish Audio",
    icon: "record_voice_over",
    color: "#1E9BF0",
    textIcon: "FA",
    website: "https://fish.audio",
    notice: {
      apiKeyUrl: "https://fish.audio/app/api-keys/",
    },
  },
  category: "apikey",
  authType: "apikey",
  models: [
    { id: "s2.1-pro-free", name: "S2.1 Pro Free (Development/Fair Use)", kind: "tts" },
    { id: "s2.1-pro", name: "S2.1 Pro", kind: "tts" },
    { id: "s2-pro", name: "S2 Pro", kind: "tts" },
    { id: "s1", name: "S1 (Retires 2026-12-31)", kind: "tts" },
  ],
  serviceKinds: ["tts"],
  ttsConfig: {
    baseUrl: "https://api.fish.audio/v1/tts",
    authType: "apikey",
    authHeader: "bearer",
    format: "fish-audio",
    models: [
      { id: "s2.1-pro-free", name: "S2.1 Pro Free (Development/Fair Use)" },
      { id: "s2.1-pro", name: "S2.1 Pro" },
      { id: "s2-pro", name: "S2 Pro" },
      { id: "s1", name: "S1 (Retires 2026-12-31)" },
    ],
  },
};
