import { canonicalizeProviderId } from "./identity.js";

// Catalog products, not interchangeable vendor families or account entitlements.
export const MODELS_DEV_PROVIDER_IDS = Object.freeze({
  glm: "zai-coding-plan",
  "glm-cn": "zhipuai-coding-plan",
  claude: null,
  commandcode: null, // Public /v1 metadata does not establish the native /alpha route.
  gemini: "google",
  vertex: "google-vertex",
  "vertex-partner": "google-vertex",
  kimi: "kimi-code-plan-cn",
  "kimi-cn": "moonshotai-cn",
  qwen: "alibaba",
  "qwen-cn": "alibaba-cn",
  zhipu: "zhipuai",
  hunyuan: "tencent",
  doubao: "volcengine",
  "cloudflare-ai": "cloudflare-workers-ai",
  "jina-ai": "jina",
  alicode: "alibaba-coding-plan-cn",
  "alicode-intl": "alibaba-coding-plan",
  "alims-intl": "alibaba",
  "alitp-intl": "alibaba-token-plan",
  together: "togetherai",
  fireworks: "fireworks-ai",
  "volcengine-ark": "volcengine",
  "vercel-ai-gateway": "vercel",
  "kilo-gateway": "kilo",
  iflow: "iflowcn",
  ollama: "ollama-cloud",
  github: "github-copilot",
  clinepass: "cline-pass",
  "xiaomi-mimo": "xiaomi",
});

export function getModelsDevProviderId(provider) {
  if (Object.hasOwn(MODELS_DEV_PROVIDER_IDS, provider)) return MODELS_DEV_PROVIDER_IDS[provider];
  const id = canonicalizeProviderId(provider);
  return Object.hasOwn(MODELS_DEV_PROVIDER_IDS, id) ? MODELS_DEV_PROVIDER_IDS[id] : id;
}
