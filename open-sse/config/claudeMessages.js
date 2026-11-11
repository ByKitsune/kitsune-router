// Explicit native Messages feature opt-ins whose history must retain system
// entries, including empty per-message effort updates. Stable unflagged model
// support is separate from this compatibility gate.
// https://platform.claude.com/docs/en/build-with-claude/preserved-thinking
// https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages
export const CLAUDE_SYSTEM_MESSAGE_BETAS = new Set([
  "thinking-binding-controls-2026-08-01",
  "mid-conversation-output-config-2026-07-01",
  "mid-conversation-system-clear-at-2026-08-21",
  "mid-conversation-tool-changes-2026-07-01",
  "inline-tools-2026-09-15",
]);
