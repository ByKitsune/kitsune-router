// OpenAI helper functions for translator
import { ROLE, OPENAI_BLOCK, CLAUDE_BLOCK, TOOL_ERROR_PREFIX, VALID_OPENAI_CONTENT_TYPES, VALID_OPENAI_MESSAGE_TYPES } from "../schema/index.js";
import { extractReasoningText } from "../concerns/reasoning.js";
import { normalizeMediaPart, splitToolResultContent } from "../concerns/multimodal.js";
import { expandToolResultMessages } from "../concerns/toolCall.js";
import { normalizeChatReasoningAliases } from "../concerns/reasoningAliases.js";

// Re-export valid-type lists (moved to schema/blocks.js) to keep existing importers working.
export { VALID_OPENAI_CONTENT_TYPES, VALID_OPENAI_MESSAGE_TYPES };

// Normalize hybrid Chat input without replacing canonical message/tool arrays.
export function filterToOpenAIFormat(body, opts = {}) {
  body = normalizeChatReasoningAliases(body);
  if (!Array.isArray(body.messages)) return body;
  const keepCache = !!opts.preserveCacheControl;
  const keepDev = !!opts.preserveDeveloperRole;

  function stripBlock(block) {
    let result = normalizeMediaPart(block) || block;
    if (Object.hasOwn(result, "signature") || (!keepCache && Object.hasOwn(result, "cache_control"))) {
      result = { ...result };
      delete result.signature;
      if (!keepCache) delete result.cache_control;
    }
    if (result.type === OPENAI_BLOCK.IMAGE_URL && (Object.hasOwn(result.image_url, "mime_type") || Object.hasOwn(result.image_url, "mimeType"))) {
      const { mime_type, mimeType, ...image_url } = result.image_url;
      result = { ...result, image_url };
    }
    return result;
  }

  function normalizeMessage(message) {
    let msg = message;
    if (msg.role === ROLE.DEVELOPER && !keepDev) msg = { ...msg, role: ROLE.SYSTEM };
    if (msg.role === ROLE.TOOL) return msg;
    if (Array.isArray(msg.content)) {
      const content = [];
      const reasoning = [];
      const collectThinking = msg.role === ROLE.ASSISTANT && !Object.hasOwn(msg, "reasoning_content");
      for (const block of msg.content) {
        if (block.type === CLAUDE_BLOCK.THINKING) {
          if (collectThinking && typeof block.thinking === "string") reasoning.push(block.thinking);
        } else if (VALID_OPENAI_CONTENT_TYPES.includes(block.type) || block.type === CLAUDE_BLOCK.TOOL_RESULT || normalizeMediaPart(block)) {
          content.push(stripBlock(block));
        }
      }
      if (reasoning.length) msg = { ...msg, reasoning_content: reasoning.join("") };
      const plainText = content.every(block => block.type === OPENAI_BLOCK.TEXT && Object.keys(block).every(key => key === "type" || key === "text"));
      if (plainText) msg = { ...msg, content: content.map(block => block.text ?? "").join("\n") };
      else if (content.length !== msg.content.length || content.some((block, index) => block !== msg.content[index])) msg = { ...msg, content };
    }
    if (msg.role === ROLE.ASSISTANT && (msg.tool_calls || extractReasoningText(msg))) return msg;
    if (typeof msg.content === "string" && !msg.content.trim()) return null;
    if (Array.isArray(msg.content) && !msg.content.some(block => block.type !== OPENAI_BLOCK.TEXT || block.text?.trim())) return null;
    return msg;
  }

  let messages;
  let count = 0;
  const append = message => {
    const normalized = normalizeMessage(message);
    if (!normalized) {
      messages ??= body.messages.slice(0, count);
      return;
    }
    if (!messages && normalized !== body.messages[count]) messages = body.messages.slice(0, count);
    if (messages) messages.push(normalized);
    count++;
  };
  let toolImages = [];
  const flushToolImages = () => {
    if (!toolImages.length) return;
    append({ role: ROLE.USER, content: toolImages });
    toolImages = [];
  };
  for (let msg of expandToolResultMessages(body.messages)) {
    if (msg.role === ROLE.ASSISTANT && Array.isArray(msg.content)) {
      const content = [];
      const media = [];
      for (const part of msg.content) {
        const normalized = normalizeMediaPart(part);
        if (normalized) media.push(stripBlock(normalized));
        else content.push(part);
      }
      if (media.length) {
        flushToolImages();
        append({ ...msg, content: content.length ? content : "" });
        toolImages.push(...media);
        continue;
      }
    }
    if (msg.role !== ROLE.TOOL) flushToolImages();
    else {
      const isError = msg.is_error === true;
      if (Object.hasOwn(msg, "is_error")) {
        const { is_error, ...rest } = msg;
        msg = rest;
      }
      if (Array.isArray(msg.content)) {
        const { text, media } = splitToolResultContent(msg.content);
        toolImages.push(...media.map(stripBlock));
        msg = { ...msg, content: text };
      }
      if (isError && typeof msg.content === "string" && !msg.content.startsWith(TOOL_ERROR_PREFIX)) msg = { ...msg, content: `${TOOL_ERROR_PREFIX}${msg.content}` };
    }
    append(msg);
  }
  flushToolImages();
  if (messages) body.messages = messages;
  else if (count !== body.messages.length) body.messages = body.messages.slice(0, count);

  if (Array.isArray(body.tools)) {
    if (!body.tools.length) delete body.tools;
    else {
      let tools;
      for (let index = 0; index < body.tools.length; index++) {
        const tool = body.tools[index];
        let converted = tool;
        if (tool.type === OPENAI_BLOCK.FUNCTION && tool.function) {
          if (tools) tools.push(tool);
          continue;
        }
        if (tool.name && (tool.input_schema || tool.description)) converted = {
          type: OPENAI_BLOCK.FUNCTION,
          function: { name: tool.name, description: String(tool.description || ""), parameters: tool.input_schema || { type: "object", properties: {} } },
        };
        if (Array.isArray(tool.functionDeclarations)) {
          tools ??= body.tools.slice(0, index);
          for (const fn of tool.functionDeclarations) tools.push({ type: OPENAI_BLOCK.FUNCTION,
            function: { name: fn.name, description: String(fn.description || ""), parameters: fn.parametersJsonSchema || fn.parameters || { type: "object", properties: {} } } });
        } else {
          if (converted !== tool) tools ??= body.tools.slice(0, index);
          if (tools) tools.push(converted);
        }
      }
      if (tools) body.tools = tools;
    }
  }

  const choice = body.tool_choice;
  if (choice && typeof choice === "object") {
    if (choice.type === "auto") body.tool_choice = "auto";
    else if (choice.type === "any") body.tool_choice = "required";
    else if (choice.type === "tool" && choice.name) body.tool_choice = { type: OPENAI_BLOCK.FUNCTION, function: { name: choice.name } };
  }
  return body;
}
