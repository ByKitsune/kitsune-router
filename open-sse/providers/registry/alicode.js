export default {
  id: "alicode",
  priority: 20,
  alias: "alicode",
  display: {
    name: "Alibaba",
    icon: "cloud",
    color: "#FF6A00",
    textIcon: "ALi",
    website: "https://bailian.console.aliyun.com",
    notice: {
      apiKeyUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
    headers: {},
    quirks: { preserveCacheControl: true },
  },
  models: [
    { id: "qwen3.7-plus", name: "Qwen3.7 plus" },
    { id: "qwen3.6-plus", name: "Qwen3.6 plus" },
    { id: "kimi-k2.5", name: "Kimi k2.5" },
    { id: "qwen3.5-plus", name: "Qwen3.5 Plus" },
    { id: "glm-5", name: "GLM 5" },
    { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
  ],
};
