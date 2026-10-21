import { CURSOR_VERSION, CURSOR_CONNECT_ES_VERSION } from "../../config/clientVersions.js";

export default {
  id: "cursor",
  priority: 50,
  alias: "cu",
  uiAlias: "cu",
  display: {
    name: "Cursor IDE",
    icon: "edit_note",
    color: "#00D4AA",
    website: "https://cursor.com",
    notice: {
      signupUrl: "https://cursor.com",
    },
  },
  category: "oauth",
  transport: {
    baseUrl: "https://api2.cursor.sh",
    chatPath: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
    format: "cursor",
    headers: {
      "connect-accept-encoding": "gzip",
      "connect-protocol-version": "1",
      "Content-Type": "application/connect+proto",
      "User-Agent": `connect-es/${CURSOR_CONNECT_ES_VERSION}`,
    },
    clientVersion: CURSOR_VERSION,
  },
  models: [
    { id: "default", name: "Auto (Server Picks)" },
    // cursor.com/docs/models/* publishes these exact Model IDs and ordinary
    // context windows (2026-10-21). Max/fast/effort variants require native
    // parameters, not invented legacy slugs. Account entitlement remains live.
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", contextLength: 200000, capabilities: { tools: true, reasoning: true } },
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", contextLength: 300000, capabilities: { tools: true, reasoning: true } },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", contextLength: 300000, capabilities: { tools: true, reasoning: true } },
    { id: "gemini-4-argon", name: "Gemini 4 Argon", contextLength: 200000, capabilities: { tools: true, reasoning: true } },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", contextLength: 200000, capabilities: { tools: true, reasoning: true } },
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", contextLength: 272000, capabilities: { tools: true, reasoning: true } },
    { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", contextLength: 272000, capabilities: { tools: true, reasoning: true } },
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", contextLength: 272000, capabilities: { tools: true, reasoning: true } },
    { id: "grok-4.7", name: "Grok 4.7", contextLength: 256000, capabilities: { tools: true, reasoning: true } },
    { id: "grok-4.6", name: "Grok 4.6", contextLength: 256000, capabilities: { tools: true, reasoning: true } },
    { id: "composer-2.5", name: "Composer 2.5", contextLength: 200000, capabilities: { tools: true, reasoning: true } },
    // Retain legacy IDs: an anonymous documentation page cannot retire them.
    { id: "claude-4.5-opus-high-thinking", name: "Claude 4.5 Opus High Thinking" },
    { id: "claude-4.5-opus-high", name: "Claude 4.5 Opus High" },
    { id: "claude-4.5-sonnet-thinking", name: "Claude 4.5 Sonnet Thinking" },
    { id: "claude-4.5-sonnet", name: "Claude 4.5 Sonnet" },
    { id: "claude-4.5-haiku", name: "Claude 4.5 Haiku" },
    { id: "claude-4.5-opus", name: "Claude 4.5 Opus" },
    { id: "gpt-5.2-codex", name: "GPT 5.2 Codex" },
    { id: "claude-4.6-opus-max", name: "Claude 4.6 Opus Max" },
    { id: "claude-4.6-sonnet-medium-thinking", name: "Claude 4.6 Sonnet Medium Thinking" },
    { id: "kimi-k2.5", name: "Kimi K2.5" },
    { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
    { id: "gpt-5.2", name: "GPT 5.2" },
    { id: "gpt-5.3-codex", name: "GPT 5.3 Codex" },
  ],
  oauth: {
    apiEndpoint: "https://api2.cursor.sh",
    chatEndpoint: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
    modelsEndpoint: "/agent.v1.AgentService/GetUsableModels",
    api3Endpoint: "https://api3.cursor.sh",
    agentEndpoint: "https://agent.api5.cursor.sh",
    agentNonPrivacyEndpoint: "https://agentn.api5.cursor.sh",
    clientVersion: CURSOR_VERSION,
    clientType: "ide",
    dbKeys: {
      accessToken: "cursorAuth/accessToken",
      machineId: "storage.serviceMachineId",
    },
  },
};
