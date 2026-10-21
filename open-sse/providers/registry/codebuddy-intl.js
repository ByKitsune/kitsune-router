// CodeBuddy international (codebuddy.ai) — mirrors codebuddy-cn registry shape,
// swapping the Tencent CN domain for the .ai endpoint set. All OAuth/plugin URLs
// use the /v2/plugin prefix with platform=ide (CN uses platform=CLI).
import { CODEBUDDY_INTL_TRANSPORT_UA, CODEBUDDY_INTL_OAUTH_UA } from "../../config/clientVersions.js";

export default {
  id: "codebuddy-intl",
  alias: "cbai",
  uiAlias: "cbai",
  hidden: false,
  priority: 90,
  display: {
    name: "CodeBuddy",
    icon: "smart_toy",
    color: "#006EFF",
    website: "https://www.codebuddy.ai",
    notice: {
      signupUrl: "https://www.codebuddy.ai",
    },
  },
  category: "oauth",
  authModes: ["oauth", "apikey"],
  hasOAuth: true,
  transport: {
    // Chat gateway is OpenAI-compatible SSE (same /v2/chat/completions path as CN).
    baseUrl: "https://www.codebuddy.ai/v2/chat/completions",
    forceStream: true,
    // CodeBuddy intl speaks the same unified OpenAI reasoning_effort shape as CN.
    thinkingFormat: "openai",
    headers: {
      "User-Agent": CODEBUDDY_INTL_TRANSPORT_UA,
      "X-Product": "SaaS",
      "X-IDE-Type": "IDE",
      "X-IDE-Name": "IDE",
      "x-requested-with": "XMLHttpRequest",
      "x-codebuddy-request": "1",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
    // Intl billing endpoint mirrors CN shape (data.Response.Data.Accounts[]).
    usage: {
      url: "https://www.codebuddy.ai/v2/billing/meter/get-user-resource",
    },
  },
  // Regions have distinct catalogs. New fallback rows below are from the intl
  // endpoint in @tencent-ai/codebuddy-code@2.171.0/product.json (2026-10-21),
  // not copied from CN. The authenticated /v3/config may differ per account.
  models: [
    { id: "glm-5.2", name: "GLM-5.2" },
    { id: "kimi-k3", name: "Kimi-K3", contextLength: 1000000, maxOutputTokens: 32000, capabilities: { vision: true, tools: true, reasoning: true } },
    // The client must opt in to 1M; the existing gateway uses defaultLength.
    { id: "deepseek-v4.1-flash", name: "DeepSeek-V4.1-Flash", contextLength: 300000, maxOutputTokens: 128000, capabilities: { vision: true, tools: true, reasoning: true } },
    { id: "deepseek-v4.1-flash-sg", name: "DeepSeek-V4.1-Flash (SG)", contextLength: 300000, maxOutputTokens: 128000, capabilities: { vision: true, tools: true, reasoning: true } },
    { id: "gpt-6-astra", name: "GPT-6 Astra", contextLength: 400000, maxOutputTokens: 128000, capabilities: { vision: true, tools: true, reasoning: true } },
    { id: "glm-5.1", name: "GLM-5.1" },
    { id: "glm-5.0", name: "GLM-5.0" },
    { id: "glm-5.0-turbo", name: "GLM-5.0-Turbo" },
    { id: "glm-5v-turbo", name: "GLM-5v-Turbo" },
    { id: "glm-4.7", name: "GLM-4.7" },
    { id: "minimax-m3", name: "MiniMax-M3" },
    { id: "minimax-m2.7", name: "MiniMax-M2.7" },
    { id: "kimi-k2.7", name: "Kimi-K2.7-Code" },
    { id: "kimi-k2.6", name: "Kimi-K2.6" },
    { id: "kimi-k2.5", name: "Kimi-K2.5" },
    { id: "hy3-preview", name: "Hy3 Preview" },
    { id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro" },
    { id: "deepseek-v4-flash", name: "DeepSeek-V4-Flash" },
    { id: "deepseek-v3-2-volc", name: "DeepSeek-V3.2" },
  ],
  oauth: {
    baseUrl: "https://www.codebuddy.ai",
    stateUrl: "https://www.codebuddy.ai/v2/plugin/auth/state",
    tokenUrl: "https://www.codebuddy.ai/v2/plugin/auth/token",
    refreshUrl: "https://www.codebuddy.ai/v2/plugin/auth/token/refresh",
    userAgent: CODEBUDDY_INTL_OAUTH_UA,
    platform: "ide",
    pollInterval: 5000,
  },
  features: {
    usage: true,
    usageApikey: true,
  },
};
