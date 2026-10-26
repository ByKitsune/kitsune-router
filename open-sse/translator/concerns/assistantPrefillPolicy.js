import { CLAUDE_BLOCK, ROLE } from "../schema/index.js";

const ASSISTANT_CONTINUATION_PROMPT = "Continue from the assistant response above without repeating it.";
const INCOMPLETE_TOOL_RESULT = "Tool execution was not completed before this request continued.";
const PRESERVE_HEADER = "x-kitsune-router-assistant-prefill";

function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);

  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function hasText(content) {
  if (typeof content === "string") return !!content.trim();
  return Array.isArray(content) && content.some((block) =>
    block?.type === CLAUDE_BLOCK.TEXT && block.text?.trim()
  );
}

export function applyAssistantPrefillPolicy(body, rawHeaders = null) {
  if (!Array.isArray(body?.messages)) return body;
  if (String(getHeader(rawHeaders, PRESERVE_HEADER) || "").toLowerCase() === "preserve") return body;

  const trailingAssistant = body.messages.at(-1);
  if (trailingAssistant?.role !== ROLE.ASSISTANT) return body;

  const isToolUseBlock = (block) =>
    (block?.type === CLAUDE_BLOCK.TOOL_USE ||
     block?.type === CLAUDE_BLOCK.SERVER_TOOL_USE ||
     block?.type === "server_tool_use") && block.id;

  const toolUses = Array.isArray(trailingAssistant.content)
    ? trailingAssistant.content.filter(isToolUseBlock)
    : [];
  if (toolUses.length > 0) {
    body.messages.push({
      role: ROLE.USER,
      content: toolUses.map((toolUse) => ({
        type: toolUse.type === CLAUDE_BLOCK.SERVER_TOOL_USE || toolUse.type === "server_tool_use"
          ? (CLAUDE_BLOCK.WEB_SEARCH_TOOL_RESULT || "web_search_tool_result")
          : CLAUDE_BLOCK.TOOL_RESULT,
        tool_use_id: toolUse.id,
        is_error: true,
        content: INCOMPLETE_TOOL_RESULT,
      })),
    });
    return body;
  }

  if (!hasText(trailingAssistant.content)) {
    body.messages.pop();
    return body;
  }

  body.messages.push({
    role: ROLE.USER,
    content: [{ type: CLAUDE_BLOCK.TEXT, text: ASSISTANT_CONTINUATION_PROMPT }],
  });
  return body;
}
