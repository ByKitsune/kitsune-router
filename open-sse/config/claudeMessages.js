// Canonical native Messages support is model-specific. Ordinary system entries
// are stable on this exact documented set; per-message output_config, clear_at,
// tool changes and binding still have their independent explicit beta contracts.
// https://platform.claude.com/docs/en/build-with-claude/preserved-thinking
// https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages
export const CLAUDE_SYSTEM_MESSAGE_BETAS = new Set([
  "thinking-binding-controls-2026-08-01",
  "mid-conversation-output-config-2026-07-01",
  "mid-conversation-system-clear-at-2026-08-21",
  "mid-conversation-tool-changes-2026-07-01",
  "inline-tools-2026-09-15",
]);

// Reviewed official narrative on 2026-11-12; excludes ambiguous Mythos Preview
// frontmatter and expressly unsupported Sonnet 5. Do not infer reseller support
// or future model aliases from a family prefix.
export const CLAUDE_STABLE_SYSTEM_MESSAGE_MODELS = new Set([
  "claude-fable-5-2", "claude-mythos-5-2",
  "claude-fable-5-1", "claude-mythos-5-1",
  "claude-fable-5", "claude-mythos-5",
  "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5",
  "claude-haiku-5-5", "claude-opus-4-8",
]);
