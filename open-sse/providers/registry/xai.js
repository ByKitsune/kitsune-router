export default {
  id: "xai",
  priority: 280,
  alias: "xai",
  display: {
    name: "xAI (Grok)",
    icon: "auto_awesome",
    color: "#1DA1F2",
    textIcon: "XA",
    website: "https://x.ai",
    notice: {
      apiKeyUrl: "https://console.x.ai",
    },
  },
  category: "oauth",
  authModes: [
    "oauth",
    "apikey",
  ],
  hasOAuth: true,
  transport: {
    baseUrl: "https://api.x.ai/v1/chat/completions",
    validateUrl: "https://api.x.ai/v1/models",
    responsesUrl: "https://api.x.ai/v1/responses",
    clientId: "b1a00492-073a-47ea-816f-4c329264a828",
    tokenUrl: "https://auth.x.ai/oauth2/token",
    refreshUrl: "https://auth.x.ai/oauth2/token",
  },
  transports: [
    { format: "openai", baseUrl: "https://api.x.ai/v1/chat/completions" },
    { format: "openai-responses", baseUrl: "https://api.x.ai/v1/responses" },
  ],
  models: [
    { id: "grok-4.7", name: "Grok 4.7" },
    { id: "grok-4.6", name: "Grok 4.6" },
    { id: "grok-4.5", name: "Grok 4.5" },
    { id: "grok-4.3", name: "Grok 4.3" },
    { id: "grok-4", name: "Grok 4 (Compatibility ID)" },
    { id: "grok-build-0.1", name: "Grok Build 0.1" },
    // Exact current native IDs and documented aliases, not Grok Build plan models.
    { id: "grok-4.20-0309-reasoning", name: "Grok 4.20 Reasoning (0309)" },
    { id: "grok-4.20-0309-non-reasoning", name: "Grok 4.20 Non-Reasoning (0309)" },
    { id: "grok-4.20-multi-agent-0309", name: "Grok 4.20 Multi-Agent (0309)", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "grok-4.20-reasoning", name: "Grok 4.20 Reasoning (Alias)" },
    { id: "grok-4.20-non-reasoning", name: "Grok 4.20 Non-Reasoning (Alias)" },
    { id: "grok-4.20-multi-agent", name: "Grok 4.20 Multi-Agent (Alias)", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "grok-imagine-image-2.0", name: "Grok Imagine Image 2.0", params: ["n", "response_format", "aspect_ratio", "resolution", "quality"], paramOptions: { quality: ["auto", "low", "medium"] }, kind: "image" },
    { id: "grok-imagine-image", name: "Grok Imagine Image", params: ["n", "response_format", "aspect_ratio", "resolution"], kind: "image" },
    { id: "grok-imagine-image-quality", name: "Grok Imagine Image Quality", params: ["n", "response_format", "aspect_ratio", "resolution"], kind: "image" },
    { id: "grok-imagine-video", name: "Grok Imagine Video", params: ["duration","aspect_ratio","resolution"], kind: "video" },
    { id: "grok-imagine-video-1.5", name: "Grok Imagine Video 1.5", params: ["duration", "aspect_ratio", "resolution"], kind: "video" },
    { id: "grok-imagine-video-1.5-lite", name: "Grok Imagine Video 1.5 Lite", params: ["duration", "aspect_ratio", "resolution"], kind: "video" },
  ],
  serviceKinds: ["llm","imageToText","webSearch","image","video"],
  imageConfig: {
    baseUrl: "https://api.x.ai/v1/images/generations",
    bodyFields: ["model", "prompt", "n", "response_format", "aspect_ratio", "resolution"],
    modelBodyFields: {
      "grok-imagine-image-2.0": ["model", "prompt", "n", "response_format", "aspect_ratio", "resolution", "quality"],
    },
  },
  // Async video jobs (POST returns { request_id }, GET polls until done/failed).
  // Docs: https://docs.x.ai/developers/rest-api-reference/inference/videos
  videoConfig: { baseUrl: "https://api.x.ai/v1/videos" },
  searchViaChat: {
    defaultModel: "grok-4.20-reasoning",
    endpoint: "https://api.x.ai/v1/responses",
    pricingUrl: "https://x.ai/api#pricing",
  },
};
