// Anthropic signatures are opaque strings, to be replayed exactly as returned.
// https://platform.claude.com/docs/en/build-with-claude/thinking
// This checks the field shape only. Only the destination can verify authenticity,
// account ownership or a signature's binding to the original conversation.
export function isValidClaudeSignature(signature) {
  return typeof signature === "string" && signature.length > 0;
}
