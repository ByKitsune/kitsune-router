import { IFLOW_USER_AGENT } from "../../config/clientVersions.js";

export default {
  id: "iflow",
  hidden: true,
  priority: 110,
  alias: "if",
  display: {
    name: "iFlow AI",
    icon: "water_drop",
    color: "#6366F1",
    website: "https://iflow.cn",
    notice: {
      signupUrl: "https://iflow.cn",
    },
  },
  category: "oauth",
  transport: {
    baseUrl: "https://apis.iflow.cn/v1/chat/completions",
    thinkingFormat: "openai",
    headers: {
      "User-Agent": IFLOW_USER_AGENT,
    },
  },
  // Publisher service shutdown: April 17, 2026 (UTC+8). Preserve explicit routes only.
  models: [
    { deprecated: true, id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
    { deprecated: true, id: "qwen3-max", name: "Qwen3 Max" },
    { deprecated: true, id: "qwen3-vl-plus", name: "Qwen3 VL Plus" },
    { deprecated: true, id: "qwen3-max-preview", name: "Qwen3 Max Preview" },
    { deprecated: true, id: "qwen3-235b", name: "Qwen3 235B A22B" },
    { deprecated: true, id: "qwen3-235b-a22b-instruct", name: "Qwen3 235B A22B Instruct" },
    { deprecated: true, id: "qwen3-235b-a22b-thinking-2507", name: "Qwen3 235B A22B Thinking" },
    { deprecated: true, id: "qwen3-32b", name: "Qwen3 32B" },
    { deprecated: true, id: "kimi-k2", name: "Kimi K2" },
    { deprecated: true, id: "deepseek-v3.2", name: "DeepSeek V3.2 Exp" },
    { deprecated: true, id: "deepseek-v3.1", name: "DeepSeek V3.1 Terminus" },
    { deprecated: true, id: "deepseek-v3", name: "DeepSeek V3 671B" },
    { deprecated: true, id: "deepseek-r1", name: "DeepSeek R1" },
    { deprecated: true, id: "glm-4.7", name: "GLM 4.7" },
    { deprecated: true, id: "iflow-rome-30ba3b", name: "iFlow ROME" },
  ],
  oauth: {
    clientId: "10009311001",
    clientSecret: "4Z3YjXycVsQvyGF1etiNlIBB4RsqSDtW",
    authorizeUrl: "https://iflow.cn/oauth",
    tokenUrl: "https://iflow.cn/oauth/token",
    userInfoUrl: "https://iflow.cn/api/oauth/getUserInfo",
    extraParams: {
      loginMethod: "phone",
      type: "phone",
    },
    refreshLeadMs: 86400000,
  },
};
