import { OLLAMA_PHONON_MODELS } from "../../config/ttsModels.js";

export default {
  id: "ollama-local",
  priority: 50,
  hasFree: true,
  alias: "ollama-local",
  display: {
    name: "Ollama Local",
    icon: "cloud",
    color: "#ffffffff",
    textIcon: "OL",
    website: "https://ollama.com",
  },
  category: "apikey",
  transport: {
    baseUrl: "http://localhost:11434/api/chat",
    format: "ollama",
  },
  serviceKinds: ["llm", "tts", "embedding"],
  // Installed embedding tags are server-specific; the endpoint accepts explicit
  // IDs; /v1/models/embedding lists operator-declared IDs and whitelisted IDs
  // that can be identified as embeddings, not an installed-model inventory.
  embeddingConfig: {
    baseUrl: "http://localhost:11434/v1/embeddings",
    path: "/v1/embeddings",
    authType: "optional",
  },
  // An active connection remains required; its API key is optional.
  ttsConfig: {
    baseUrl: "http://localhost:11434/v1/audio/speech",
    path: "/v1/audio/speech",
    defaultModel: "phonon",
    authType: "optional",
    format: "openai",
    // Keep media-only models out of the unfiltered provider chat picker.
    models: OLLAMA_PHONON_MODELS,
  },
};
