import { CODEX_USER_AGENT } from "../../config/clientVersions.js";

export default {
  id: "codex",
  priority: 30,
  alias: "cx",
  uiAlias: "cx",
  display: {
    name: "OpenAI Codex",
    icon: "code",
    color: "#3B82F6",
    website: "https://chatgpt.com/codex",
    notice: {
      signupUrl: "https://chatgpt.com/codex",
    },
    deprecated: true,
    deprecationNotice: "RISK_NOTICE",
    kindNotice: {
      image: "Requires a ChatGPT Plus (or higher) account. Free accounts are not supported for image generation.",
    },
  },
  category: "oauth",
  thinkingConfig: {
    options: [
      "auto",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ],
    defaultMode: "auto",
  },
  transport: {
    baseUrl: "https://chatgpt.com/backend-api/codex/responses",
    format: "openai-responses",
    forceStream: true,
    headers: {
      originator: "codex_cli_rs",
      "User-Agent": CODEX_USER_AGENT,
    },
    usage: {
      url: "https://chatgpt.com/backend-api/wham/usage",
      resetCreditsUrl: "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
      resetCreditsConsumeUrl: "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume",
    },
    quirks: { preservePromptCacheKey: true },
  },
  models: [
    { id: "gpt-6-astra", name: "GPT 6 Astra" },
    // Gateway review aliases: the model-list endpoint synthesizes these rows.
    // Successful gateway calls do not prove literal native "-review" wire IDs.
    { id: "gpt-6-astra-review", name: "GPT 6 Astra Review", upstreamModelId: "gpt-6-astra", quotaFamily: "review" },
    { id: "gpt-6.1-sol", name: "GPT 6.1 Sol" },
    { id: "gpt-6.1-sol-review", name: "GPT 6.1 Sol Review", upstreamModelId: "gpt-6.1-sol", quotaFamily: "review" },
    { id: "gpt-6-sol", name: "GPT 6 Sol" },
    { id: "gpt-6-sol-review", name: "GPT 6 Sol Review", upstreamModelId: "gpt-6-sol", quotaFamily: "review" },
    { id: "gpt-reserve", name: "GPT Reserve" },
    { id: "gpt-reserve-review", name: "GPT Reserve Review", upstreamModelId: "gpt-reserve", quotaFamily: "review" },
    { id: "gpt-6-luna", name: "GPT 6 Luna" },
    { id: "gpt-6-luna-review", name: "GPT 6 Luna Review", upstreamModelId: "gpt-6-luna", quotaFamily: "review" },
    { id: "gpt-5.6-sol", name: "GPT 5.6 Sol" },
    { id: "gpt-5.6-sol-review", name: "GPT 5.6 Sol Review", upstreamModelId: "gpt-5.6-sol", quotaFamily: "review" },
    { id: "gpt-5.6-terra", name: "GPT 5.6 Terra" },
    { id: "gpt-5.6-terra-review", name: "GPT 5.6 Terra Review", upstreamModelId: "gpt-5.6-terra", quotaFamily: "review" },
    { id: "gpt-5.6-luna", name: "GPT 5.6 Luna" },
    { id: "gpt-5.6-luna-review", name: "GPT 5.6 Luna Review", upstreamModelId: "gpt-5.6-luna", quotaFamily: "review" },
    { id: "gpt-5.5", name: "GPT 5.5" },
    { id: "gpt-5.5-review", name: "GPT 5.5 Review", upstreamModelId: "gpt-5.5", quotaFamily: "review" },
    { id: "gpt-5.4", name: "GPT 5.4" },
    { id: "gpt-5.4-review", name: "GPT 5.4 Review", upstreamModelId: "gpt-5.4", quotaFamily: "review" },
    { id: "gpt-5.4-mini", name: "GPT 5.4 Mini" },
    { id: "gpt-5.4-mini-review", name: "GPT 5.4 Mini Review", upstreamModelId: "gpt-5.4-mini", quotaFamily: "review" },
    { id: "gpt-5.3-codex-spark", name: "GPT 5.3 Codex Spark" },
    { id: "gpt-5.3-codex-spark-review", name: "GPT 5.3 Codex Spark Review", upstreamModelId: "gpt-5.3-codex-spark", quotaFamily: "review" },
    // Codex CLI's auto-review virtual model. Unlike the "-review" variants above it is not derived
    // from a base model, so it is forwarded verbatim instead of having "-review" stripped (#1398, #4135).
    { id: "codex-auto-review", name: "Codex Auto Review", upstreamModelId: "codex-auto-review", quotaFamily: "review" },
    { id: "gpt-image-2", name: "GPT Image 2", capabilities: ["text2img","edit"], params: ["size","quality","background","image_detail","output_format"], kind: "image" },
    { id: "gpt-5.5-image", name: "GPT 5.5 Image", capabilities: ["text2img","edit"], params: ["size","quality","background","image_detail","output_format"], kind: "image" },
    { id: "gpt-5.4-image", name: "GPT 5.4 Image", capabilities: ["text2img","edit"], params: ["size","quality","background","image_detail","output_format"], kind: "image" },
    { id: "gpt-5.3-image", name: "GPT 5.3 Image", capabilities: ["text2img","edit"], params: ["size","quality","background","image_detail","output_format"], kind: "image" },
  ],
  serviceKinds: ["llm","image"],
  oauth: {
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    scope: "openid profile email offline_access",
    codeChallengeMethod: "S256",
    fixedPort: 1455,
    callbackPath: "/auth/callback",
    extraParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    },
    // Access tokens live ~1h; a 5d lead rotated the refresh token on EVERY call —
    // reuse of a rotated token revokes the whole OpenAI session (account logout).
    refreshLeadMs: 600000,
    refresh: {
      encoding: "form",
      scope: "openid profile email offline_access",
    },
    maxRefreshAgeMs: 691200000,
    trackRefreshAt: true,
  },
  features: {
    usage: true,
  },
};
