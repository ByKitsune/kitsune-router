// Read-only authentication check already used by saved Fal connections.
// Keep separate from the image queue so validation cannot incur generation.
export const FAL_MODEL_CATALOG = "https://api.fal.ai/v1/models?limit=1";
export const FAL_VALIDATION_TIMEOUT_MS = 8000;
