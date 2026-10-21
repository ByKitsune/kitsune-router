import { CODEBUDDY_CN_TRANSPORT_UA, CODEBUDDY_CN_OAUTH_UA } from "../../config/clientVersions.js";

export default {
  id: "codebuddy-cn",
  // Short model prefix (cbcn/glm-5.2). "cbcn" = CodeBuddy CN; reserve "cbai"
  // for a future codebuddy-ai (intl) provider. The full id still resolves.
  alias: "cbcn",
  uiAlias: "cbcn",
  hidden: false,
  priority: 90,
  display: {
    name: "CodeBuddy CN",
    icon: "smart_toy",
    color: "#006EFF",
    website: "https://copilot.tencent.com",
    notice: {
      signupUrl: "https://copilot.tencent.com",
    },
  },
  category: "oauth",
  authModes: ["oauth", "apikey"],
  hasOAuth: true,
  transport: {
    baseUrl: "https://copilot.tencent.com/v2/chat/completions",
    forceStream: true,
    // CodeBuddy is a unified OpenAI-compatible gateway: every model (GLM, Kimi,
    // MiniMax, DeepSeek, Hunyuan) takes reasoning via OpenAI-style reasoning_effort,
    // not its vendor-native thinking shape. Force the openai thinking format.
    thinkingFormat: "openai",
    headers: {
      "User-Agent": CODEBUDDY_CN_TRANSPORT_UA,
      "X-Product": "SaaS",
      "X-IDE-Type": "CLI",
      "X-IDE-Name": "CLI",
      "x-requested-with": "XMLHttpRequest",
      "x-codebuddy-request": "1",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
    // Quota endpoint differs from the chat gateway: POST returns nested Tencent
    // billing payload (data.Response.Data.Accounts[]). See services/usage/codebuddy-cn.js.
    usage: {
      url: "https://copilot.tencent.com/v2/billing/meter/get-user-resource",
    },
  },
  models: [
    { id: "glm-5.2", name: "GLM-5.2" },
    // Region-specific fallback in @tencent-ai/codebuddy-code@2.171.0
    // product.internal.json (2026-10-21). These are not the intl wire IDs.
    { id: "kimi-k3-2", name: "Kimi-K3", contextLength: 1000000, maxOutputTokens: 32000, capabilities: { vision: true, tools: true, reasoning: true } },
    { id: "minimax-m3-pay", name: "MiniMax-M3 (Paid)", contextLength: 512000, maxOutputTokens: 128000, capabilities: { vision: true, tools: true, reasoning: true } },
    { id: "glm-5.3-flashx", name: "GLM-5.3-FlashX", contextLength: 1000000, maxOutputTokens: 131072, capabilities: { vision: true, tools: true, reasoning: true } },
    { id: "glm-5.1", name: "GLM-5.1" },
    // EOL models — API 11102 dead (removed from upstream catalog 2026-09-03, e014cb537).
    // Kept as deprecated entries so old stored connections / combos that still reference
    // glm-5.0 / glm-4.7 continue to resolve via getCapabilitiesForModel() and don't
    // 404 on model lookup. UI filters deprecated:true out of the picker.
    { id: "glm-5.0", name: "GLM-5.0 (EOL)", deprecated: true },
    { id: "glm-4.7", name: "GLM-4.7 (EOL)", deprecated: true },
    { id: "glm-5.0-turbo", name: "GLM-5.0-Turbo" },
    // Absent from the server's product-config list since the 2026-09-30 snapshot
    // (9router #4614). Kept as deprecated entries so old stored connections and
    // combos still resolve via getCapabilitiesForModel() instead of 404ing on
    // model lookup. UI filters deprecated:true out of the picker.
    { id: "glm-5v-turbo", name: "GLM-5v-Turbo (EOL)", deprecated: true },
    { id: "minimax-m3", name: "MiniMax-M3" },
    { id: "minimax-m2.7", name: "MiniMax-M2.7" },
    { id: "kimi-k2.7", name: "Kimi-K2.7-Code (EOL)", deprecated: true },
    { id: "kimi-k2.6", name: "Kimi-K2.6 (EOL)", deprecated: true },
    { id: "kimi-k2.5", name: "Kimi-K2.5" },
    // "-x" suffix = paid tier of the same model (free id rides promo quota:
    // hy3 free until 2026-08-31, hy4-preview until 2026-09-10). Server model table
    // seen in client logs 2026-08-30; glm-5.0 / glm-4.7 removed (API 11102 dead).
    { id: "hy3-preview", name: "Hy3 Preview" },
    { id: "hy3", name: "Hy3" },
    { id: "hy3-x", name: "Hy3 (Paid)" },
    { id: "hy4-preview", name: "Hy4-Preview" },
    { id: "hy4-preview-x", name: "Hy4-Preview (Paid)" },
    { id: "glm-5.3", name: "GLM-5.3" },
    { id: "glm-5.3-flash", name: "GLM-5.3-Flash" },
    { id: "kimi-k3-1", name: "Kimi-K3" },
    { id: "kimi-k2.8-preview", name: "Kimi-K2.8-Preview" },
    { id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro" },
    { id: "deepseek-v4-flash", name: "DeepSeek-V4-Flash" },
    { id: "deepseek-v4.1-flash", name: "DeepSeek-V4.1-Flash" },
    { id: "deepseek-v3-2-volc", name: "DeepSeek-V3.2" },
  ],
  oauth: {
    baseUrl: "https://copilot.tencent.com",
    stateUrl: "https://copilot.tencent.com/v2/plugin/auth/state",
    tokenUrl: "https://copilot.tencent.com/v2/plugin/auth/token",
    refreshUrl: "https://copilot.tencent.com/v2/plugin/auth/token/refresh",
    userAgent: CODEBUDDY_CN_OAUTH_UA,
    platform: "CLI",
    pollInterval: 5000,
  },
  features: {
    usage: true,
    usageApikey: true,
  },
};
