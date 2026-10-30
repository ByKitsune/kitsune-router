import { CODEX_MODELS_CLIENT_VERSION } from "./clientVersions.js";

// The native account catalog gates entries by the same release as execution.
export const CODEX_MODELS_URL = `https://chatgpt.com/backend-api/codex/models?client_version=${CODEX_MODELS_CLIENT_VERSION}`;

// Native ModelVisibility serializes these exact values. Only List is shown in
// the official picker; missing visibility remains compatible with older lists.
export const CODEX_CATALOG_VISIBILITIES = new Set(["list", "hide", "none"]);
export const CODEX_CATALOG_HIDDEN_VISIBILITIES = new Set(["hide", "none"]);
export const CODEX_CATALOG_LIMIT_FIELDS = [
  "context_window", "contextWindow", "contextLength", "context_length", "max_context_window",
  "max_input_tokens", "maxInputTokens", "maxInput",
  "max_output_tokens", "maxOutputTokens", "maxOutput", "max_completion_tokens",
];
export const CODEX_CATALOG_KINDS = new Set(["llm", "imageToText", "image", "video", "embedding", "tts", "stt", "search", "webSearch", "webFetch"]);
