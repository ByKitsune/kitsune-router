// Format identifiers
export const FORMATS = {
  OPENAI: "openai",
  OPENAI_RESPONSES: "openai-responses",
  OPENAI_RESPONSE: "openai-response",
  CLAUDE: "claude",
  GEMINI: "gemini",
  GEMINI_CLI: "gemini-cli",
  VERTEX: "vertex",
  CODEX: "codex",
  ANTIGRAVITY: "antigravity",
  KIRO: "kiro",
  CURSOR: "cursor",
  OLLAMA: "ollama",
  COMMANDCODE: "commandcode"
};

/**
 * Detect source format from request URL pathname + body.
 * Returns null to fall back to body-based detection.
 */
export function detectFormatByEndpoint(pathname, body) {
  // /v1/responses is always openai-responses
  if (pathname.includes("/v1/responses")) return FORMATS.OPENAI_RESPONSES;

  // /v1/messages is always Claude
  if (pathname.includes("/v1/messages")) return FORMATS.CLAUDE;

  // /v1/chat/completions is always OpenAI format (#4122)
  if (pathname.includes("/v1/chat/completions")) return FORMATS.OPENAI;

  if (/\/v1beta\/models\/.+:(?:streamGenerateContent|generateContent)$/.test(pathname)) return FORMATS.GEMINI;

  return null;
}

