/** Convert chat messages to the lossless input consumed by Cursor AgentService. */
import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { ROLE, OPENAI_BLOCK, CLAUDE_BLOCK, RESPONSES_ITEM, VALID_OPENAI_CONTENT_TYPES } from "../schema/index.js";
import { normalizeMediaPart, splitToolResultContent } from "../concerns/multimodal.js";
import { cloneRequestBody } from "../../utils/requestBody.js";
import { validateAgentRequestControls } from "../../utils/cursorProtobuf.js";

function normalizeContent(content, toolResult = false) {
  if (typeof content === "string" || content == null) return content;
  const parts = Array.isArray(content) ? content : [content];
  return parts.flatMap((part) => {
    if (part == null) return [];
    if (typeof part === "string") return [{ type: OPENAI_BLOCK.TEXT, text: part }];
    const media = normalizeMediaPart(part);
    if (media) return [media];
    if (!toolResult || typeof part.text === "string" || VALID_OPENAI_CONTENT_TYPES.includes(part.type) || [CLAUDE_BLOCK.DOCUMENT, RESPONSES_ITEM.INPUT_IMAGE, RESPONSES_ITEM.INPUT_FILE].includes(part.type) || part.inlineData || part.inline_data || part.fileData || part.file_data) return [part];
    const { text } = splitToolResultContent([part]);
    return text ? [{ type: OPENAI_BLOCK.TEXT, text }] : [];
  });
}

function convertMessages(messages) {
  const toolNames = new Map();
  for (const message of messages) {
    if (message.role !== ROLE.ASSISTANT) continue;
    for (const call of message.tool_calls || []) toolNames.set(call.id, call.function?.name);
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type === CLAUDE_BLOCK.TOOL_USE) toolNames.set(part.id, part.name);
      }
    }
  }

  const result = [];
  for (const message of messages) {
    if (message.role === ROLE.TOOL) {
      result.push({ ...message, name: message.name || toolNames.get(message.tool_call_id), content: normalizeContent(message.content, true) });
      continue;
    }
    if (message.role === ROLE.USER && Array.isArray(message.content)) {
      let content = [];
      const flush = () => {
        if (content.length) result.push({ ...message, content });
        content = [];
      };
      for (const part of message.content) {
        if (part?.type === CLAUDE_BLOCK.TOOL_RESULT) {
          flush();
          result.push({
            role: ROLE.TOOL,
            tool_call_id: part.tool_use_id,
            name: toolNames.get(part.tool_use_id),
            content: normalizeContent(part.content, true),
            ...(part.is_error !== undefined ? { is_error: part.is_error } : {}),
          });
        } else {
          content.push(...normalizeContent([part]));
        }
      }
      flush();
      continue;
    }
    if (message.role === ROLE.ASSISTANT && Array.isArray(message.content)) {
      const toolCalls = [...(message.tool_calls || [])];
      const content = [];
      for (const part of message.content) {
        if (part?.type === CLAUDE_BLOCK.TOOL_USE) {
          toolCalls.push({ id: part.id, type: OPENAI_BLOCK.FUNCTION, function: { name: part.name, arguments: JSON.stringify(part.input || {}) } });
        } else {
          content.push(...normalizeContent([part]));
        }
      }
      result.push({ ...message, content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }
    result.push({ ...message, content: normalizeContent(message.content) });
  }
  return result;
}

export function openaiToCursorRequest(model, body, stream, credentials) {
  validateAgentRequestControls(body);
  const copied = cloneRequestBody(body);
  const messages = convertMessages(copied.messages || []);
  if (copied.system) messages.unshift({ role: ROLE.SYSTEM, content: normalizeContent(copied.system) });
  const { user, metadata, stream_options, system, ...rest } = copied;
  return { ...rest, messages };
}

register(FORMATS.OPENAI, FORMATS.CURSOR, openaiToCursorRequest, null);
