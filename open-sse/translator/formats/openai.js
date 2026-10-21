// OpenAI helper functions for translator
import { ROLE, OPENAI_BLOCK, CLAUDE_BLOCK, TOOL_ERROR_PREFIX, VALID_OPENAI_CONTENT_TYPES, VALID_OPENAI_MESSAGE_TYPES } from "../schema/index.js";
import { extractReasoningText } from "../concerns/reasoning.js";
import { normalizeMediaPart, splitToolResultContent } from "../concerns/multimodal.js";
import { expandToolResultMessages } from "../concerns/toolCall.js";
import { normalizeChatReasoningAliases } from "../concerns/reasoningAliases.js";

// Re-export valid-type lists (moved to schema/blocks.js) to keep existing importers working.
export { VALID_OPENAI_CONTENT_TYPES, VALID_OPENAI_MESSAGE_TYPES };

// Filter messages to OpenAI standard format
// Remove: thinking, redacted_thinking, signature, and other non-OpenAI blocks
// opts.preserveCacheControl: keep cache_control on content blocks (e.g. for DashScope/alicode)
// opts.preserveDeveloperRole: keep developer role for providers like official OpenAI (#4172)
export function filterToOpenAIFormat(body, opts = {}) {
  body = normalizeChatReasoningAliases(body);
  if (!body.messages || !Array.isArray(body.messages)) return body;
  const keepCache = !!opts.preserveCacheControl;
  const keepDev = !!opts.preserveDeveloperRole;

  function stripBlock(block) {
    const normalized = normalizeMediaPart(block) || block;
    const { signature, cache_control: normalizedCache, ...rest } = normalized;
    const cache_control = block.cache_control || normalizedCache;
    if (rest.type === OPENAI_BLOCK.IMAGE_URL) {
      const { mime_type, mimeType, ...imageUrl } = rest.image_url;
      rest.image_url = imageUrl;
    }
    return keepCache && cache_control ? { ...rest, cache_control } : rest;
  }

  // Chat assistant/tool content cannot contain images. Keep assistant text/calls
  // in place and emit media after the consecutive tool-result run.
  const messages = [];
  let toolImages = [];
  const flushToolImages = () => {
    if (toolImages.length) messages.push({ role: ROLE.USER, content: toolImages });
    toolImages = [];
  };
  for (const msg of expandToolResultMessages(body.messages)) {
    if (msg.role === ROLE.ASSISTANT && Array.isArray(msg.content)) {
      const media = [];
      const content = [];
      for (const part of msg.content) {
        const normalized = normalizeMediaPart(part);
        if (normalized) media.push(stripBlock(normalized));
        else content.push(part);
      }
      if (media.length) {
        flushToolImages();
        messages.push({ ...msg, content: content.length ? content : "" });
        toolImages.push(...media);
        continue;
      }
    }
    if (msg.role !== ROLE.TOOL) {
      flushToolImages();
      messages.push(msg);
      continue;
    }
    const { is_error, ...toolMsg } = msg;
    if (Array.isArray(msg.content)) {
      const { text, media } = splitToolResultContent(msg.content);
      toolImages.push(...media.map(stripBlock));
      toolMsg.content = text;
    }
    if (is_error === true && typeof toolMsg.content === "string" && !toolMsg.content.startsWith(TOOL_ERROR_PREFIX)) {
      toolMsg.content = `${TOOL_ERROR_PREFIX}${toolMsg.content}`;
    }
    messages.push(toolMsg);
  }
  flushToolImages();
  body.messages = messages;

  body.messages = body.messages.map(msg => {
    // Normalize developer role to system unless target provider supports developer (#4172)
    if (msg.role === ROLE.DEVELOPER && !keepDev) msg = { ...msg, role: ROLE.SYSTEM };

    // Keep tool messages as-is (OpenAI format)
    if (msg.role === ROLE.TOOL) return msg;

    // Handle string content
    if (typeof msg.content === "string") return msg;

    // Handle array content
    if (Array.isArray(msg.content)) {
      const filteredContent = [];
      const collectThinking = msg.role === ROLE.ASSISTANT && !Object.hasOwn(msg, "reasoning_content");
      const reasoningChunks = [];

      for (const block of msg.content) {
        // Native readable thinking belongs in assistant reasoning, never visible content.
        if (block.type === CLAUDE_BLOCK.THINKING) {
          if (collectThinking && typeof block.thinking === "string") reasoningChunks.push(block.thinking);
          continue;
        }
        if (block.type === CLAUDE_BLOCK.REDACTED_THINKING) continue;

        // Only keep valid OpenAI content types
        if (VALID_OPENAI_CONTENT_TYPES.includes(block.type)) {
          filteredContent.push(stripBlock(block));
        } else if (block.type === CLAUDE_BLOCK.TOOL_USE) {
          // Convert tool_use to tool_calls format (handled separately)
          continue;
        } else if (block.type === CLAUDE_BLOCK.TOOL_RESULT) {
          // Keep tool_result but clean it
          filteredContent.push(stripBlock(block));
        }
      }
      if (reasoningChunks.length > 0) msg = { ...msg, reasoning_content: reasoningChunks.join("") };
      
      // If all content was filtered, add empty text
      if (filteredContent.length === 0) {
        filteredContent.push({ type: OPENAI_BLOCK.TEXT, text: "" });
      }

      // Text-only arrays collapse to a joined string — strict OpenAI-
      // compatible upstreams reject content arrays even when every block
      // is plain text. Blocks carrying cache_control stay structured so
      // prompt-cache breakpoints survive (alicode/DashScope #2069).
      const keepsCacheBlocks = filteredContent.some((b) => b?.cache_control);
      if (!keepsCacheBlocks && filteredContent.every((b) => b?.type === OPENAI_BLOCK.TEXT)) {
        return { ...msg, content: filteredContent.map((b) => b.text ?? "").join("\n") };
      }

      return { ...msg, content: filteredContent };
    }
    
    return msg;
  });
  
  // Filter out messages with only empty text (but NEVER filter tool messages)
  body.messages = body.messages.filter(msg => {
    // Always keep tool messages
    if (msg.role === ROLE.TOOL) return true;
    // Always keep assistant tool calls and readable reasoning, including vendor aliases.
    if (msg.role === ROLE.ASSISTANT && (msg.tool_calls || extractReasoningText(msg))) return true;
    if (typeof msg.content === "string") return msg.content.trim() !== "";
    if (Array.isArray(msg.content)) {
      return msg.content.some(b => 
        (b.type === OPENAI_BLOCK.TEXT && b.text?.trim()) ||
        b.type !== OPENAI_BLOCK.TEXT
      );
    }
    return true;
  });

  // Remove empty tools array (some providers like QWEN reject it)
  if (body.tools && Array.isArray(body.tools) && body.tools.length === 0) {
    delete body.tools;
  }

  // Normalize tools to OpenAI format (from Claude, Gemini, etc.)
  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    body.tools = body.tools.map(tool => {
      // Already OpenAI format
      if (tool.type === OPENAI_BLOCK.FUNCTION && tool.function) return tool;
      
      // Claude format: {name, description, input_schema}
      if (tool.name && (tool.input_schema || tool.description)) {
        return {
          type: OPENAI_BLOCK.FUNCTION,
          function: {
            name: tool.name,
            description: String(tool.description || ""),
            parameters: tool.input_schema || { type: "object", properties: {} }
          }
        };
      }
      
      // Gemini format: {functionDeclarations: [{name, description, parameters}]}
      if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
        return tool.functionDeclarations.map(fn => ({
          type: OPENAI_BLOCK.FUNCTION,
          function: {
            name: fn.name,
            description: String(fn.description || ""),
            parameters: fn.parameters || { type: "object", properties: {} }
          }
        }));
      }
      
      return tool;
    }).flat();
  }

  // Normalize tool_choice to OpenAI format
  if (body.tool_choice && typeof body.tool_choice === "object") {
    const choice = body.tool_choice;
    // Claude format: {type: "auto|any|tool", name?: "..."}
    if (choice.type === "auto") {
      body.tool_choice = "auto";
    } else if (choice.type === "any") {
      body.tool_choice = "required";
    } else if (choice.type === "tool" && choice.name) {
      body.tool_choice = { type: OPENAI_BLOCK.FUNCTION, function: { name: choice.name } };
    }
  }

  return body;
}
