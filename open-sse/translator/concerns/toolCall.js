// Tool call helper functions for translator

import { FORMATS } from "../formats.js";
import { ROLE, CLAUDE_BLOCK } from "../schema/index.js";
import { splitToolCallId } from "./thoughtSignature.js";

// Hybrid Chat clients also send Claude tool_result blocks. Keep their content
// on tool messages until the destination performs its own media lowering.
export function* expandToolResultMessages(messages) {
  for (const msg of messages) {
    if (msg.role !== ROLE.USER || !Array.isArray(msg.content)) {
      yield msg;
      continue;
    }
    const content = [];
    let hasResults = false;
    for (const part of msg.content) {
      if (part.type === CLAUDE_BLOCK.TOOL_RESULT) {
        hasResults = true;
        yield { role: ROLE.TOOL, tool_call_id: part.tool_use_id, content: part.content, is_error: part.is_error === true };
      } else {
        content.push(part);
      }
    }
    if (!hasResults) yield msg;
    else if (content.length) yield { ...msg, content };
  }
}

// Anthropic tool_use.id must match: ^[a-zA-Z0-9_-]+$
const TOOL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// Fallback streaming tool_call id when provider omits one (index optional)
export function fallbackToolCallId(index) {
  return index === undefined ? `call_${Date.now()}` : `call_${index}_${Date.now()}`;
}

// Generate deterministic tool call ID from position + tool name (cache-friendly)
export function generateToolCallId(msgIndex = 0, tcIndex = 0, toolName = "") {
  const name =
    typeof toolName === "string" && toolName
      ? `_${toolName.replace(/[^a-zA-Z0-9_-]/g, "")}`
      : "";
  return `call_msg${msgIndex}_tc${tcIndex}${name}`;
}

// Sanitize ID to match Anthropic pattern: keep only alphanumeric, underscore, hyphen
function sanitizeToolId(id) {
  if (!id || typeof id !== "string") return null;
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

// Fill missing IDs/arguments; Anthropic's character restriction is target-specific.
export function ensureToolCallIds(body, { sanitizeIds = true } = {}) {
  if (!body.messages || !Array.isArray(body.messages)) return body;

  // Assistant call ids awaiting a result. Missing tool_call_id values must be
  // paired here; otherwise JSON serialization drops the undefined key and
  // strict providers reject the whole request (#4091).
  const pendingToolCallIds = [];
  let mappedIds;
  let usedIds;
  const normalizeId = (id, messageIndex, callIndex, name) => {
    const hasId = typeof id === "string" && id.length > 0;
    if (!sanitizeIds) return hasId ? id : generateToolCallId(messageIndex, callIndex, name);
    if (!mappedIds) { mappedIds = new Map(); usedIds = new Set(); }
    if (hasId && mappedIds.has(id)) return mappedIds.get(id);
    const candidate = (hasId && (TOOL_ID_PATTERN.test(id) ? id : sanitizeToolId(id)))
      || generateToolCallId(messageIndex, callIndex, name);
    let normalized = candidate;
    let suffix = 2;
    while (usedIds.has(normalized)) normalized = `${candidate}_${suffix++}`;
    usedIds.add(normalized);
    if (hasId) mappedIds.set(id, normalized);
    return normalized;
  };

  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    if (msg === null || typeof msg !== "object") continue;
    if (msg.role === "assistant" && msg.tool_calls && Array.isArray(msg.tool_calls)) {
      for (let j = 0; j < msg.tool_calls.length; j++) {
        const tc = msg.tool_calls[j];
        if (tc === null || typeof tc !== "object") continue;
        const id = normalizeId(tc.id, i, j, tc.function?.name);
        if (tc.id !== id) tc.id = id;
        if (!tc.type) {
          tc.type = "function";
        }
        // Ensure arguments is JSON string, not object
        if (tc.function?.arguments && typeof tc.function.arguments !== "string") {
          tc.function.arguments = JSON.stringify(tc.function.arguments);
        }
        pendingToolCallIds.push(tc.id);
      }
    }

    // Validate tool_call_id in tool messages (role: "tool")
    if (msg.role === "tool") {
      if (typeof msg.tool_call_id === "string" && msg.tool_call_id) {
        const id = normalizeId(msg.tool_call_id, i, 0);
        if (msg.tool_call_id !== id) msg.tool_call_id = id;
        const queued = pendingToolCallIds.indexOf(msg.tool_call_id);
        if (queued >= 0) pendingToolCallIds.splice(queued, 1);
      } else {
        msg.tool_call_id = pendingToolCallIds.shift() || normalizeId(null, i, 0);
      }
    }

    // Also validate tool_use blocks in content (Claude format)
    if (Array.isArray(msg.content)) {
      for (let k = 0; k < msg.content.length; k++) {
        const block = msg.content[k];
        if (block === null || typeof block !== "object") continue;
        if (sanitizeIds && block.type === CLAUDE_BLOCK.TOOL_USE && block.id) {
          const id = normalizeId(block.id, i, k, block.name);
          if (block.id !== id) block.id = id;
        }
        if (sanitizeIds && block.type === CLAUDE_BLOCK.TOOL_RESULT && block.tool_use_id) {
          const id = normalizeId(block.tool_use_id, i, k);
          if (block.tool_use_id !== id) block.tool_use_id = id;
        }
      }
    }
  }

  return body;
}

// Get tool_call ids from assistant message (OpenAI format: tool_calls, Claude format: tool_use in content)
export function getToolCallIds(msg) {
  if (msg?.role !== ROLE.ASSISTANT) return [];

  const ids = [];

  // OpenAI format: tool_calls array
  if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      if (tc.id) ids.push(tc.id);
    }
  }

  // Claude format: tool_use blocks in content
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "tool_use" && block.id) {
        ids.push(block.id);
      }
    }
  }

  return ids;
}

// Check if user message has tool_result for given ids (OpenAI format: role=tool, Claude format: tool_result in content)
export function hasToolResults(msg, toolCallIds) {
  if (!msg || !toolCallIds.length) return false;

  // OpenAI format: role = "tool" with tool_call_id
  if (msg.role === "tool" && msg.tool_call_id) {
    if (toolCallIds.includes(msg.tool_call_id)) return true;
    const rawId = splitToolCallId(msg.tool_call_id).rawId;
    return toolCallIds.some(id => splitToolCallId(id).rawId === rawId);
  }

  // Claude format: tool_result blocks in user message content
  if (msg.role === "user" && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "tool_result" && toolCallIds.includes(block.tool_use_id)) {
        return true;
      }
    }
  }

  return false;
}

// Reconcile every call against the contiguous result run, preserving supplied replies.
export function fixMissingToolResponses(body) {
  if (!Array.isArray(body?.messages)) return body;
  const messages = body.messages;
  let repaired;
  let copiedUntil = 0;
  for (let i = 0; i < messages.length; i++) {
    const ids = getToolCallIds(messages[i]);
    if (!ids.length || i + 1 === messages.length) continue;
    const pending = [...ids];
    let end = i + 1;
    for (; end < messages.length; end++) {
      const message = messages[end];
      const results = message?.role === ROLE.TOOL ? [message.tool_call_id]
        : message?.role === ROLE.USER && Array.isArray(message.content)
          ? message.content.filter(block => block?.type === CLAUDE_BLOCK.TOOL_RESULT).map(block => block.tool_use_id) : [];
      if (!results.length) break;
      for (const id of results) {
        const index = pending.findIndex(candidate => candidate === id || splitToolCallId(candidate).rawId === splitToolCallId(id).rawId);
        if (index >= 0) pending.splice(index, 1);
      }
    }
    if (pending.length) {
      repaired ??= [];
      for (let index = copiedUntil; index < end; index++) repaired.push(messages[index]);
      copiedUntil = end;
      if (Array.isArray(messages[i]?.content) && !messages[i].tool_calls) {
        const content = pending.map(id => ({ type: CLAUDE_BLOCK.TOOL_RESULT, tool_use_id: id, content: "" }));
        const last = repaired.at(-1);
        if (end > i + 1 && last?.role === ROLE.USER && Array.isArray(last.content)) {
          const results = last.content.filter(block => block?.type === CLAUDE_BLOCK.TOOL_RESULT);
          const other = last.content.filter(block => block?.type !== CLAUDE_BLOCK.TOOL_RESULT);
          repaired[repaired.length - 1] = { ...last, content: [...results, ...content, ...other] };
        } else repaired.push({ role: ROLE.USER, content });
      } else {
        for (const id of pending) repaired.push({ role: ROLE.TOOL, tool_call_id: id, content: "" });
      }
    }
    i = end - 1;
  }
  if (repaired) {
    for (let index = copiedUntil; index < messages.length; index++) repaired.push(messages[index]);
    body.messages = repaired;
  }
  return body;
}

/**
 * Claude tool schema requires `type` to be explicitly set.
 * Strict gateways (e.g. MiniMax) reject payloads omitting it with HTTP 400.
 * Defaults missing `type` to "custom".
 */
export function defaultClaudeToolType(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (tool && typeof tool === "object" && !tool.type) {
      return { type: "custom", ...tool };
    }
    return tool;
  });
}

// Whether Claude-format tools need explicit `type` defaulting before dispatch.
// Only gateways that declare the `requireClaudeToolType` quirk (MiniMax) reject typeless
// tools. Applying the default globally breaks Claude-format endpoints that only accept the
// legacy typeless tool shape — DeepSeek's Anthropic-compatible endpoint answers HTTP 400
// "unknown variant `custom`" and every Claude Code request routed there fails (#3905).
export function shouldDefaultClaudeToolType(provider, finalFormat, tools, PROVIDERS) {
  return (
    finalFormat === FORMATS.CLAUDE
    && Array.isArray(tools)
    && PROVIDERS?.[provider]?.quirks?.requireClaudeToolType === true
  );
}
