/**
 * Tool normalization before dispatch:
 * - MCP-equivalent built-in tool dedup (Claude clients only, reduces token bloat).
 * - Exact same-name tool dedup for DeepSeek models — the DeepSeek upstream rejects
 *   duplicate tool names with 400 "Tool names must be unique" on every endpoint
 *   (verified live 2026-08-15 against api.deepseek.com, opencode.go and a LiteLLM
 *   gateway; GLM/MiniMax/Kimi upstreams accept duplicates). First definition wins,
 *   tool_choice and message-history references are by name/id so nothing breaks.
 * MCP equivalents remain declared when replayed history or explicit tool choice
 * depends on them. Never rewrite signed history just to deduplicate declarations.
 */
import { isDeepSeekModel } from "../providers/models/helpers.js";
import { CLAUDE_BLOCK, OPENAI_BLOCK } from "../translator/schema/blocks.js";
import { ROLE } from "../translator/schema/roles.js";
import { getClaudeToolReferenceNames } from "./claudeToolReferences.js";

const DEDUP_RULES = [
  {
    // Exa MCP present → drop built-in web tools (Exa is preferred).
    triggers: ["mcp__exa__web_search_exa", "mcp__exa__web_fetch_exa"],
    strip: ["WebSearch", "WebFetch", "mcp__workspace__web_fetch"],
  },
  {
    // Tavily MCP present → drop built-in web tools.
    triggers: ["mcp__tavily__tavily_search", "mcp__tavily__tavily_extract"],
    strip: ["WebSearch", "WebFetch", "mcp__workspace__web_fetch"],
  },
  {
    // Browser MCP present → drop Cowork's duplicate Claude_in_Chrome connector.
    triggers: [/^mcp__browsermcp__/],
    strip: [/^mcp__Claude_in_Chrome__/],
  },
];

function getToolName(t) {
  return t?.name || t?.function?.name || "";
}

function matches(name, pattern) {
  if (typeof pattern === "string") return name === pattern;
  return pattern instanceof RegExp ? pattern.test(name) : false;
}

function replayToolNames(messages, toolChoice) {
  const needed = new Set();
  if (toolChoice?.type === ROLE.TOOL && typeof toolChoice.name === "string") needed.add(toolChoice.name);
  if (toolChoice?.type === OPENAI_BLOCK.FUNCTION) {
    const name = toolChoice.function?.name || toolChoice.name;
    if (typeof name === "string") needed.add(name);
  }
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role === ROLE.ASSISTANT && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        if (call?.type === OPENAI_BLOCK.FUNCTION && typeof call.function?.name === "string") needed.add(call.function.name);
      }
    }
    if (!Array.isArray(message?.content)) continue;
    for (const block of message.content) {
      for (const name of getClaudeToolReferenceNames(block)) needed.add(name);
      if (message.role === ROLE.ASSISTANT && block?.type === CLAUDE_BLOCK.TOOL_USE && typeof block.name === "string") needed.add(block.name);
    }
  }
  return needed;
}

/**
 * @param {Array} tools - translated tools array
 * @param {Object} [opts]
 * @param {string|null} [opts.clientTool] - detected client ("claude" | "codex" | ...)
 * @param {string|null} [opts.model] - model id, may carry a (level) thinking suffix
 * @param {Array|null} [opts.messages] - final translated history, read-only
 * @param {Object|null} [opts.toolChoice] - final explicit tool selection
 * @returns {{ tools: Array, stripped: Array<string> }}
 */
function dedupeTools(tools, opts = {}) {
  if (!Array.isArray(tools) || tools.length === 0) return { tools, stripped: [] };
  const names = tools.map(getToolName);
  const toStrip = new Set();
  const toDrop = new Set(); // indices of duplicate same-name tools

  // MCP-based built-in dedup: Claude clients only (existing behavior).
  if (opts.clientTool === "claude") {
    let needed;
    for (const rule of DEDUP_RULES) {
      const hasTrigger = names.some((n) => rule.triggers.some((p) => matches(n, p)));
      if (!hasTrigger) continue;
      const candidates = names.filter((n) => rule.strip.some((p) => matches(n, p)));
      if (!candidates.length) continue;
      needed ??= replayToolNames(opts.messages, opts.toolChoice);
      for (const n of candidates) {
        if (!needed.has(n)) toStrip.add(n);
      }
    }
  }

  // Exact-name dedup: DeepSeek upstream rejects duplicate tool names. Applies to
  // every client × provider that serves a deepseek-* model (official API, Console Go,
  // LiteLLM gateways); non-DeepSeek models are untouched.
  if (isDeepSeekModel(opts.model)) {
    const seen = new Set();
    for (let i = 0; i < tools.length; i++) {
      const n = getToolName(tools[i]);
      if (!n) continue;
      if (seen.has(n)) toDrop.add(i);
      else seen.add(n);
    }
  }

  if (toStrip.size === 0 && toDrop.size === 0) return { tools, stripped: [] };
  const out = tools.filter((t, i) => !toDrop.has(i) && !toStrip.has(getToolName(t)));
  const stripped = Array.from(toDrop).map((i) => getToolName(tools[i])).concat(Array.from(toStrip));
  return { tools: out, stripped };
}

export { dedupeTools };
