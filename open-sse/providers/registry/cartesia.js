export default {
  id: "cartesia",
  alias: "cartesia",
  display: {
    name: "Cartesia",
    icon: "spatial_audio",
    color: "#FF4F8B",
    textIcon: "CA",
    website: "https://cartesia.ai",
    notice: {
      apiKeyUrl: "https://play.cartesia.ai/keys"
    }
  },
  category: "apikey",
  authType: "apikey",
  models: [
    { id: "sonic-3.6", name: "Sonic 3.6 (Flagship)", kind: "tts" },
    { id: "sonic-3.6-2026-08-27", name: "Sonic 3.6 (2026-08-27)", kind: "tts" },
    { id: "sonic-3.5", name: "Sonic 3.5", kind: "tts" },
    { id: "sonic-3", name: "Sonic 3", kind: "tts" },
    { id: "sonic-2", name: "Sonic 2 (Retired 2026-10-20)", kind: "tts", deprecated: true },
  ],
  serviceKinds: [
    "tts"
  ],
  ttsConfig: {
    baseUrl: "https://api.cartesia.ai/tts/bytes",
    authType: "apikey",
    authHeader: "x-api-key",
    format: "cartesia",
    models: [
      {
        id: "sonic-3.6",
        name: "Sonic 3.6 (Flagship)"
      },
      { id: "sonic-3.6-2026-08-27", name: "Sonic 3.6 (2026-08-27)" },
      {
        id: "sonic-3.5",
        name: "Sonic 3.5"
      },
      {
        id: "sonic-3",
        name: "Sonic 3"
      },
      {
        id: "sonic-2",
        name: "Sonic 2 (Retired 2026-10-20)",
        deprecated: true
      }
    ]
  },
  hidden: true
};
