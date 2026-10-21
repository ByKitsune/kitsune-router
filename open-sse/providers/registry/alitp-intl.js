// Token Plan — credit subscription keys on token-plan.<region>.maas.aliyuncs.com.
// Fourth Alibaba key type: Coding Plan (alicode/alicode-intl) and Model Studio
// (alims-intl) both reject these keys, and they reject Model Studio keys back.
// Singapore is the only region that serves the plan; eu-central-1 answers
// IllegalEndpoint. The Anthropic surface (/apps/anthropic/v1/messages) is not
// authorized for this plan, so OpenAI-compatible mode is the only transport.
export default {
  id: "alitp-intl",
  priority: 11,
  alias: "alitp-intl",
  display: {
    name: "Alibaba Token Plan",
    icon: "cloud",
    color: "#FF6A00",
    textIcon: "ATP",
    website: "https://www.alibabacloud.com/campaign/ai-landing-page-token",
    notice: {
      apiKeyUrl: "https://modelstudio.console.alibabacloud.com/?apiKey=1",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
    headers: {},
    quirks: { preserveCacheControl: true },
  },
  models: [
    { id: "auto", name: "Auto" },
    { id: "deepseek-v4.1-flash-1017", name: "DeepSeek V4.1 Flash 1017" },
    { id: "deepseek-v4.1-flash", name: "DeepSeek v4.1 flash" },
    { id: "deepseek-v4-pro-0813", name: "DeepSeek v4 pro 0813" },
    { id: "deepseek-v4-flash-0731", name: "DeepSeek v4 flash 0731" },
    { id: "glm-5.3", name: "GLM 5.3" },
    { id: "qwen3.8-max", name: "Qwen3.8 Max" },
    { id: "qwen3.8-flash", name: "Qwen3.8 Flash" },
    { id: "qwen3.7-max", name: "Qwen3.7 Max" },
    { id: "qwen3.7-plus", name: "Qwen3.7 Plus" },
    { id: "qwen3.7-flash", name: "Qwen3.7 Flash" },
    { id: "qwen3.6-plus", name: "Qwen3.6 Plus" },
    { id: "qwen3.6-flash", name: "Qwen3.6 Flash" },
    { id: "qwen3.5-flash", name: "Qwen3.5 Flash" },
    { id: "glm-5.2", name: "GLM 5.2" },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
  ],
};
