import {
  VSCODE_VERSION,
  COPILOT_CHAT_VERSION,
  COPILOT_USER_AGENT,
  COPILOT_API_VERSION,
} from "../../config/clientVersions.js";

export default {
  id: "github",
  priority: 40,
  alias: "gh",
  uiAlias: "gh",
  display: {
    name: "GitHub Copilot",
    icon: "code",
    color: "#333333",
    website: "https://github.com/features/copilot",
    notice: {
      signupUrl: "https://github.com/features/copilot",
    },
    deprecated: true,
    deprecationNotice: "RISK_NOTICE",
  },
  category: "oauth",
  transport: {
    baseUrl: "https://api.githubcopilot.com/chat/completions",
    responsesUrl: "https://api.githubcopilot.com/responses",
    messagesUrl: "https://api.githubcopilot.com/v1/messages",
    headers: {
      "copilot-integration-id": "vscode-chat",
      "editor-version": `vscode/${VSCODE_VERSION}`,
      "editor-plugin-version": `copilot-chat/${COPILOT_CHAT_VERSION}`,
      "user-agent": COPILOT_USER_AGENT,
      "openai-intent": "conversation-panel",
      "x-github-api-version": COPILOT_API_VERSION,
      "x-vscode-user-agent-library-version": "electron-fetch",
      "X-Initiator": "user",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    copilot: {
      vscodeVersion: VSCODE_VERSION,
      chatVersion: COPILOT_CHAT_VERSION,
      userAgent: COPILOT_USER_AGENT,
      apiVersion: COPILOT_API_VERSION,
    },
    usage: {
      url: "https://api.github.com/copilot_internal/user",
    },
    quirks: { preservePromptCacheKey: true },
  },
  models: [
    { id: "gpt-5.5", name: "GPT-5.5" },
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
    { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
    { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
    { id: "gpt-5.4", name: "GPT-5.4" },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini" },
    { id: "gpt-5-mini", name: "GPT-5 Mini" },
    // Note: routing to Copilot's Anthropic-native /v1/messages shim (see
    // executors/github.js) is decided by model-NAME pattern at request time, not by
    // a static targetFormat field here — Copilot's live model catalog (see
    // services/copilotModels.js) regularly exposes claude-* models this static list
    // hasn't caught up with yet (e.g. claude-opus-4.8), and a static per-entry
    // targetFormat would silently miss those while also double-translating requests
    // for models that ARE listed here (chatCore.js would pre-translate to Claude
    // shape, then the executor would translate again). Keep these as plain entries.
    { id: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
    { id: "claude-opus-4.7", name: "Claude Opus 4.7" },
    { id: "claude-opus-4.8", name: "Claude Opus 4.8" },
    { id: "claude-opus-5", name: "Claude Opus 5" },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
    { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash" },
    { id: "kimi-k3", name: "Kimi K3" },
    { id: "oswe-vscode-prime", name: "Raptor Mini" },
    { id: "goldeneye-free-auto", name: "GoldenEye" },
    { id: "text-embedding-3-small", name: "Text Embedding 3 Small (GitHub)", kind: "embedding" },
    { id: "text-embedding-3-large", name: "Text Embedding 3 Large (GitHub)", kind: "embedding" },
  ],
  serviceKinds: ["llm","embedding"],
  embeddingConfig: { baseUrl: "https://api.githubcopilot.com/embeddings", authType: "apikey", authHeader: "bearer" },
  oauth: {
    clientId: "Iv1.b507a08c87ecfe98",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    deviceCodeUrl: "https://github.com/login/device/code",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: "read:user",
    apiVersion: "2022-11-28",
    copilotTokenUrl: "https://api.github.com/copilot_internal/v2/token",
    userAgent: COPILOT_USER_AGENT,
    editorVersion: `vscode/${VSCODE_VERSION}`,
    editorPluginVersion: `copilot-chat/${COPILOT_CHAT_VERSION}`,
  },
  features: {
    usage: true,
  },
};
