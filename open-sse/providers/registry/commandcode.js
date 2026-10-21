import { COMMAND_CODE_VERSION, COMMAND_CODE_USER_AGENT } from "../../config/clientVersions.js";

export default {
  id: "commandcode",
  priority: 100,
  alias: "commandcode",
  aliases: [
    "cmc",
  ],
  uiAlias: "cmc",
  display: {
    name: "Command Code",
    icon: "smart_toy",
    color: "#000000",
    textIcon: "CC",
    website: "https://commandcode.ai",
    notice: {
      text: "Use your CommandCode CLI API key (starts with user_...) from ~/.commandcode/auth.json or commandcode.ai/studio.",
      apiKeyUrl: "https://commandcode.ai/studio",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.commandcode.ai/alpha/generate",
    format: "commandcode",
    forceStream: true,
    headers: {
      "x-command-code-version": COMMAND_CODE_VERSION,
      "User-Agent": COMMAND_CODE_USER_AGENT,
      // Installed 1.86.3 bundle normalizes its default "prod" to "production".
      "x-cli-environment": "production",
    },
  },
  models: [
    { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro" },
    // Publisher /provider/v1/models?view=client, 2026-10-21. Only standard-v1
    // additions: prefix-bound/private-reasoning/no-deferred-tools profiles are
    // not implied compatible with this existing /alpha/generate adapter.
    { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", contextLength: 1000000, capabilities: { vision: true } },
    { id: "deepseek/deepseek-v4.1-flash-fast", name: "DeepSeek V4.1 Flash Fast", contextLength: 1000000, capabilities: { vision: true } },
    { id: "Qwen/Qwen3.8-Max-Prime", name: "Qwen 3.8 Max Prime", contextLength: 1000000, maxOutputTokens: 131072, capabilities: { vision: true } },
    { id: "Qwen/Qwen3.8-27B", name: "Qwen 3.8 27B", contextLength: 262144, maxOutputTokens: 32768, capabilities: { vision: true } },
    { id: "MiniMaxAI/MiniMax-M3", name: "MiniMax M3", contextLength: 1000000, capabilities: { vision: true } },
    { id: "xiaomi/mimo-v2.6-pro", name: "MiMo V2.6 Pro", contextLength: 1048576, capabilities: { vision: true } },
    { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
    { id: "deepseek/deepseek-v4-flash-vision-exp", name: "DeepSeek V4 Flash Vision (exp)" },
    { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash" },
    { id: "moonshotai/Kimi-K2.6", name: "Kimi K2.6" },
    { id: "moonshotai/Kimi-K2.5", name: "Kimi K2.5" },
    { id: "zai-org/GLM-5.1", name: "GLM 5.1" },
    { id: "zai-org/GLM-5", name: "GLM 5" },
    { id: "MiniMaxAI/MiniMax-M2.7", name: "MiniMax M2.7" },
    { id: "MiniMaxAI/MiniMax-M2.5", name: "MiniMax M2.5" },
    { id: "Qwen/Qwen3.6-Max-Preview", name: "Qwen 3.6 Max Preview" },
    { id: "Qwen/Qwen3.6-Plus", name: "Qwen 3.6 Plus" },
    { id: "stepfun/Step-3.5-Flash", name: "Step 3.5 Flash" },
  ],
};
