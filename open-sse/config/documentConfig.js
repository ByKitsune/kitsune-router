// Transport limits, not public model-family capabilities. The Codex account
// backend uses a different wire from the public OpenAI Responses API.
// Pinned native ContentItem enum: InputText, InputImage, InputAudio, OutputText;
// no InputFile/document variant. Keep PDFs disabled until a supported wire is
// implemented and verified; an operator checkbox cannot add a native wire type.
// https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/protocol/src/models.rs
export const DOCUMENT_UNSUPPORTED_PROVIDERS = new Set(["codex"]);

// Antigravity's Claude bridge uses image/text Gemini parts, not the public
// Claude Messages document wire. Keep this transport restriction in one place
// so catalog overlays cannot make request admission promise unsupported input.
export function isDocumentUnsupportedRoute(provider, model) {
  return DOCUMENT_UNSUPPORTED_PROVIDERS.has(provider)
    || provider === "antigravity" && typeof model === "string" && /(?:^|\/)claude-/i.test(model);
}
