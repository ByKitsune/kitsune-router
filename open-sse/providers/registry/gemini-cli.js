import { GOOGLE_OAUTH_CLIENT } from "../shared.js";
import { GEMINI_CLI_VERSION, GEMINI_CLI_API_CLIENT } from "../../config/clientVersions.js";

export default {
  id: "gemini-cli",
  priority: 20,
  hasFree: true,
  alias: "gc",
  uiAlias: "gc",
  display: {
    name: "Gemini CLI",
    icon: "terminal",
    color: "#4285F4",
    website: "https://github.com/google-gemini/gemini-cli",
    notice: {
      signupUrl: "https://github.com/google-gemini/gemini-cli",
    },
    deprecated: true,
    deprecationNotice: "RISK_NOTICE",
  },
  category: "free",
  transport: {
    baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
    format: "gemini-cli",
    cliVersion: GEMINI_CLI_VERSION,
    apiClient: GEMINI_CLI_API_CLIENT,
    usage: {
      quotaUrl: "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
      loadCodeAssistUrl: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
    },
    clientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
    clientSecret: "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",
  },
  models: [
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
    { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
    { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
    // Literal model IDs in the stable v0.65.0 source; rollout/account gates remain upstream.
    { id: "gemini-3.1-pro-preview-customtools", name: "Gemini 3.1 Pro Preview Custom Tools" },
    { id: "gemini-3-flash", name: "Gemini 3 Flash (Code Assist Route)" },
    { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
    { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview (Deprecated)" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
    { id: "gemma-4-31b-it", name: "Gemma 4 31B IT" },
    { id: "gemma-4-26b-a4b-it", name: "Gemma 4 26B A4B IT" },
  ],
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v1/userinfo",
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    refresh: {
      encoding: "form",
    },
  },
  features: {
    usage: true,
  },
};
