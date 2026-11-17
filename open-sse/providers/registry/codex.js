import { CODEX_USER_AGENT } from "../../config/clientVersions.js";
import { CODEX_IMAGE_DEFAULT_MODEL, CODEX_IMAGE_PARAM_OPTIONS } from "../../config/codexImage.js";

const imageOptions = { capabilities: ["text2img", "edit"], params: ["n", "size", "quality", "background", "output_format"], paramOptions: CODEX_IMAGE_PARAM_OPTIONS, kind: "image" };

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
      image: "Uses the native Codex Images API. Availability and limits depend on the connected ChatGPT account. Legacy image aliases use GPT Image 2.",
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
    // Listing the public Codex IDs does not establish a connected account's entitlement.
    { id: "gpt-6.2-sol", name: "GPT-6.2 Sol" },
    { id: "gpt-6.2-astra", name: "GPT-6.2 Astra" },
    // Gateway review aliases: the model-list endpoint synthesizes these rows.
    // Successful gateway calls do not prove literal native "-review" wire IDs.
    { id: "gpt-6-astra-review", name: "GPT 6 Astra Review", upstreamModelId: "gpt-6-astra", quotaFamily: "review" },
    { id: "gpt-6.1-sol", name: "GPT 6.1 Sol" },
    { id: "gpt-6.1-sol-review", name: "GPT 6.1 Sol Review", upstreamModelId: "gpt-6.1-sol", quotaFamily: "review" },
    // Present in OpenAI's pinned Codex CLI catalog; account entitlement is separate.
    { id: "gpt-6.1-terra", name: "GPT 6.1 Terra" },
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
    { ...imageOptions, id: CODEX_IMAGE_DEFAULT_MODEL, name: "GPT Image 2" },
    { ...imageOptions, id: "gpt-5.5-image", name: "GPT Image 2 (legacy GPT 5.5 alias)", upstreamModelId: CODEX_IMAGE_DEFAULT_MODEL },
    { ...imageOptions, id: "gpt-5.4-image", name: "GPT Image 2 (legacy GPT 5.4 alias)", upstreamModelId: CODEX_IMAGE_DEFAULT_MODEL },
    { ...imageOptions, id: "gpt-5.3-image", name: "GPT Image 2 (legacy GPT 5.3 alias)", upstreamModelId: CODEX_IMAGE_DEFAULT_MODEL },
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
