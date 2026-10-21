export default {
  id: "anthropic",
  priority: 30,
  alias: "anthropic",
  display: {
    name: "Anthropic",
    icon: "smart_toy",
    color: "#D97757",
    textIcon: "AN",
    website: "https://console.anthropic.com",
    notice: {
      apiKeyUrl: "https://console.anthropic.com/settings/keys",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.anthropic.com/v1/messages",
    format: "claude",
    headers: {
      "anthropic-version": "2023-06-01",
      // Native API-key traffic is not the Claude Code OAuth product.
      "Anthropic-Beta": "interleaved-thinking-2025-05-14",
    },
  },
  models: [
    // Current native API lineup reviewed 2026-10-17; retired snapshots are omitted.
    // API-key path: plain anthropic-version headers, no CLI fingerprint spoofing.
    { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
    { id: "claude-opus-5", name: "Claude Opus 5" },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", description: "Fast Claude for high-volume classification, extraction, routing, and lightweight agents." },
    { id: "claude-fable-5-1", name: "Claude Fable 5.1" },
    { id: "claude-fable-5", name: "Claude Fable 5" },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  ],
  serviceKinds: ["llm","imageToText"],
};
