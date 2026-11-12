// These request fields and typed blocks must never survive a retry that silently
// removes their matching beta. This does not enable a feature or infer account
// entitlement; explicit client betas remain authoritative, including future ones.
export const CLAUDE_FEATURE_BETAS = Object.freeze({
  thinkingBinding: "thinking-binding-controls-2026-08-01",
  turnScopedSystem: "mid-conversation-system-clear-at-2026-08-21",
  perMessageOutput: "mid-conversation-output-config-2026-07-01",
  inlineTools: "inline-tools-2026-09-15",
  referencedToolChanges: "mid-conversation-tool-changes-2026-07-01",
  toolSearch: "tool-search-tool-2025-10-19",
  advancedTools: "advanced-tool-use-2025-11-20",
  contextManagement: "context-management-2025-06-27",
  structuredOutputs: "structured-outputs-2025-12-15",
  effort: "effort-2025-11-24",
  fastMode: "fast-mode-2026-02-01",
});

export const CLAUDE_TOOL_CHANGE_BLOCKS = new Set(["tool_addition", "tool_removal"]);
export const CLAUDE_TOOL_SEARCH_TYPE_PREFIX = "tool_search_tool_";
