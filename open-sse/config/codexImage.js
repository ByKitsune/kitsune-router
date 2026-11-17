import { MAX_OPENAI_IMAGE_COUNT } from "./mediaConfig.js";

// Native Images contract reviewed against openai/codex 9537934ed6d5a6658fc77032b3290650765466a1.
export const CODEX_IMAGES_BASE_URL = "https://chatgpt.com/backend-api/codex/images";
export const CODEX_IMAGE_DEFAULT_MODEL = "gpt-image-2";
// Historical gateway aliases selected a text model and injected an image tool.
// Keep stored routes usable through the current native image model instead.
export const CODEX_IMAGE_LEGACY_MODEL = /^gpt-\d+(?:\.\d+)?(?:-[a-z\d]+)*-image$/;
export const CODEX_IMAGE_NATIVE_MODEL = /^gpt-image-\d+(?:\.\d+)?(?:-[a-z\d]+)*$/;
export const CODEX_IMAGE_MAX_COUNT = MAX_OPENAI_IMAGE_COUNT;
export const CODEX_IMAGE_MAX_REFERENCES = 16;
export const CODEX_IMAGE_PARAM_OPTIONS = {
  quality: ["auto", "low", "medium", "high"],
  background: ["auto", "opaque", "transparent"],
  output_format: ["png", "jpeg", "webp", "gif"],
};
export const CODEX_IMAGE_FORMATS = new Set(CODEX_IMAGE_PARAM_OPTIONS.output_format);
export const CODEX_IMAGE_QUALITIES = new Set(CODEX_IMAGE_PARAM_OPTIONS.quality);
export const CODEX_IMAGE_BACKGROUNDS = new Set(CODEX_IMAGE_PARAM_OPTIONS.background);
export const IMAGE_MODEL_REJECTION_CODES = new Set([
  "model_not_supported", "unsupported_model", "model_not_found", "model_access_denied", "not_entitled", "insufficient_scope",
]);
