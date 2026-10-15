import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { adjustMaxTokens, requiresMaxCompletionTokens } from "../formats/maxTokens.js";
import { encodeDataUri } from "../concerns/image.js";
import { ROLE, OPENAI_BLOCK, CLAUDE_BLOCK } from "../schema/index.js";
import { collapseTextParts } from "../concerns/message.js";

// Marker prepended to a tool result that the client reported as an error.
// OpenAI-format tool messages have no error flag, so the signal must live in
// the text the model reads. Kept short and unambiguous so it cannot be
// confused with real tool output.
export const TOOL_ERROR_PREFIX = "[tool_error] ";

function stripAnthropicBillingHeader(text) {
  if (typeof text !== "string") return "";
  return text.replace(/^x-anthropic-billing-header:[^\n]*(?:\r?\n)?/i, "");
}

// Convert Claude request to OpenAI format
export function claudeToOpenAIRequest(model, body, stream) {
  const result = {
    model: model,
    messages: [],
    stream: stream
  };

  // Max tokens (gpt-5/o-series Chat Completions only accept max_completion_tokens)
  if (body.max_tokens !== undefined || body.max_completion_tokens !== undefined) {
    const tokenParam = requiresMaxCompletionTokens(model) ? "max_completion_tokens" : "max_tokens";
    result[tokenParam] = adjustMaxTokens(body, null, { sourceFormat: "claude" });
  }

  // Temperature
  if (body.temperature !== undefined) {
    result.temperature = body.temperature;
  }

  // Sampling / stop / attribution parameters.
  //
  // `stop_sequences` had no `stop` counterpart, so a Claude client that asked
  // for deterministic truncation silently received untruncated output when the
  // request was served through an OpenAI-format upstream. `top_p` and
  // `metadata.user_id` were dropped the same way.
  if (body.top_p !== undefined) {
    result.top_p = body.top_p;
  }
  // Anthropic `stop_sequences` (array) ⇄ OpenAI `stop` (string or array).
  if (Array.isArray(body.stop_sequences)) {
    const cleaned = body.stop_sequences.filter((s) => typeof s === "string" && s.length > 0);
    if (cleaned.length > 0) result.stop = cleaned;
  } else if (typeof body.stop_sequences === "string" && body.stop_sequences) {
    result.stop = body.stop_sequences;
  }
  // Anthropic metadata.user_id is an abuse-tracking/attribution field. OpenAI
  // Chat Completions has `user` for the same purpose, so it is carried over
  // rather than dropped.
  const userId = body.metadata && typeof body.metadata.user_id === "string" ? body.metadata.user_id.trim() : "";
  if (userId) result.user = userId;

  // System message
  if (body.system) {
    const systemContent = Array.isArray(body.system)
      ? body.system.map(s => stripAnthropicBillingHeader(s.text || "")).filter(Boolean).join("\n")
      : stripAnthropicBillingHeader(body.system);
    
    if (systemContent) {
      result.messages.push({
        role: ROLE.SYSTEM,
        content: systemContent
      });
    }
  }

  // Convert messages
  if (body.messages && Array.isArray(body.messages)) {
    for (let i = 0; i < body.messages.length; i++) {
      const msg = body.messages[i];
      const converted = convertClaudeMessage(msg);
      if (converted) {
        // Handle array of messages (multiple tool results)
        if (Array.isArray(converted)) {
          result.messages.push(...converted);
        } else {
          result.messages.push(converted);
        }
      }
    }
  }

  // Fix missing tool responses - OpenAI requires every tool_call to have a response.
  // Local variant: scans contiguous tool replies + inserts "[No response received]"
  // (distinct from the global immediate-next check in concerns/toolCall, runs on the openai leg).
  fixMissingToolResponsesOpenAI(result.messages);

  // Tools
  if (body.tools && Array.isArray(body.tools)) {
    result.tools = body.tools.map(tool => ({
      type: OPENAI_BLOCK.FUNCTION,
      function: {
        name: tool.name,
        description: String(tool.description || ""),
        parameters: tool.input_schema || { type: "object", properties: {} },
        // Preserve the caller's schema-enforcement choice; omitted stays omitted
        // (9router #4607).
        ...(typeof tool.strict === "boolean" ? { strict: tool.strict } : {})
      }
    }));
  }

  // Tool choice & parallel tool calls
  if (body.tool_choice) {
    result.tool_choice = convertToolChoice(body.tool_choice);
    if (body.tool_choice.disable_parallel_tool_use === true) {
      result.parallel_tool_calls = false;
    }
  }

  if (body.reasoning_effort !== undefined) {
    result.reasoning_effort = body.reasoning_effort;
  } else if (body.reasoning?.effort !== undefined) {
    result.reasoning_effort = body.reasoning.effort;
  }

  if (body.reasoning !== undefined) {
    result.reasoning = body.reasoning;
  }

  // Claude Code auto-mode safeguards passthrough (#4173)
  if (body.safeguards !== undefined) {
    result.safeguards = body.safeguards;
  }

  return result;
}

// Fix missing tool responses - add empty responses for tool_calls without responses
function fixMissingToolResponsesOpenAI(messages) {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === ROLE.ASSISTANT && msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCallIds = msg.tool_calls.map(tc => tc.id);
      
      // Collect all tool response IDs that IMMEDIATELY follow this assistant message
      const respondedIds = new Set();
      let insertPosition = i + 1;
      for (let j = i + 1; j < messages.length; j++) {
        const nextMsg = messages[j];
        if (nextMsg.role === ROLE.TOOL && nextMsg.tool_call_id) {
          respondedIds.add(nextMsg.tool_call_id);
          insertPosition = j + 1;
        } else {
          break;
        }
      }
      
      // Find missing responses and insert them
      const missingIds = toolCallIds.filter(id => !respondedIds.has(id));
      
      if (missingIds.length > 0) {
        const missingResponses = missingIds.map(id => ({
          role: ROLE.TOOL,
          tool_call_id: id,
          content: "[No response received]"
        }));
        messages.splice(insertPosition, 0, ...missingResponses);
        i = insertPosition + missingResponses.length - 1;
      }
    }
  }
}

// Wrap mid-conversation system text so it ends as a user turn (avoids Anthropic prefill 400).
// Uses <instructions> tags that Claude models treat as authoritative directives.
function systemReminderText(content) {
  const parts = Array.isArray(content)
    ? content.filter(c => c?.type === CLAUDE_BLOCK.TEXT).map(c => c.text || "")
    : [typeof content === "string" ? content : ""];
  const text = parts.filter(Boolean).join("\n");
  if (!text.trim()) return "";
  return `<instructions>\n${text}\n</instructions>`;
}

// Convert single Claude message - returns single message or array of messages
function convertClaudeMessage(msg) {
  // Some clients send content as a single block object; normalize to the
  // one-element array every branch below (the system-reminder fold included)
  // expects. Must run BEFORE the role branch: systemReminderText only reads
  // arrays and strings, so a bare-object system turn was dropped outright.
  if (msg.content && typeof msg.content === "object" && !Array.isArray(msg.content)) {
    msg.content = [msg.content];
  }
  // Mid-conversation system message -> user (per Anthropic placement rules)
  if (msg.role === ROLE.SYSTEM) {
    const text = systemReminderText(msg.content);
    return text ? { role: ROLE.USER, content: text } : null;
  }

  const role = msg.role === ROLE.USER || msg.role === ROLE.TOOL ? ROLE.USER : ROLE.ASSISTANT;
  
  // Simple string content
  if (typeof msg.content === "string") {
    return { role, content: msg.content };
  }

  // Array content
  if (Array.isArray(msg.content)) {
    const parts = [];
    const toolCalls = [];
    const toolResults = [];
    const reasoningChunks = [];

    for (const block of msg.content) {
      switch (block.type) {
        case CLAUDE_BLOCK.TEXT:
          parts.push({ type: OPENAI_BLOCK.TEXT, text: block.text });
          break;

        case CLAUDE_BLOCK.IMAGE:
          if (block.source?.type === "base64" && block.source.data) {
            parts.push({
              type: OPENAI_BLOCK.IMAGE_URL,
              image_url: {
                url: encodeDataUri(block.source.media_type, block.source.data)
              }
            });
          } else if (block.source?.type === "url" && block.source.url) {
            parts.push({
              type: OPENAI_BLOCK.IMAGE_URL,
              image_url: {
                url: block.source.url
              }
            });
          }
          break;

        case CLAUDE_BLOCK.DOCUMENT:
          if (block.source?.type === "base64") {
            parts.push({
              type: OPENAI_BLOCK.FILE,
              file: {
                file_data: encodeDataUri(block.source.media_type, block.source.data)
              }
            });
          }
          break;

        case CLAUDE_BLOCK.TOOL_USE:
        case CLAUDE_BLOCK.SERVER_TOOL_USE:
          toolCalls.push({
            id: block.id,
            type: OPENAI_BLOCK.FUNCTION,
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {})
            }
          });
          break;

        case CLAUDE_BLOCK.TOOL_RESULT:
        case CLAUDE_BLOCK.WEB_SEARCH_TOOL_RESULT:
          let resultContent = "";
          const toolImages = [];
          if (typeof block.content === "string") {
            resultContent = block.content;
          } else if (Array.isArray(block.content)) {
            const textParts = [];
            for (const c of block.content) {
              if (c.type === CLAUDE_BLOCK.TEXT && c.text) {
                textParts.push(c.text);
              } else if (c.type === CLAUDE_BLOCK.IMAGE) {
                if (c.source?.type === "base64" && c.source.data) {
                  toolImages.push({
                    type: OPENAI_BLOCK.IMAGE_URL,
                    image_url: {
                      url: encodeDataUri(c.source.media_type, c.source.data)
                    }
                  });
                } else if (c.source?.type === "url" && c.source.url) {
                  toolImages.push({
                    type: OPENAI_BLOCK.IMAGE_URL,
                    image_url: { url: c.source.url }
                  });
                }
              }
            }
            resultContent = textParts.join("\n") || (toolImages.length === 0 ? JSON.stringify(block.content) : "");
          } else if (block.content) {
            resultContent = JSON.stringify(block.content);
          }
          
          toolResults.push({
            role: ROLE.TOOL,
            tool_call_id: block.tool_use_id,
            // OpenAI Chat Completions has no `is_error` field on tool messages:
            // unknown fields are ignored or rejected by strict upstreams, and the
            // receiving model then cannot tell that the tool FAILED — it may
            // conclude the opposite and continue from a false premise. The flag
            // is therefore carried as an explicit marker in the content instead.
            content: block.is_error === true ? `${TOOL_ERROR_PREFIX}${resultContent}` : resultContent,
          });
          if (toolImages.length > 0) {
            parts.push(...toolImages);
          }
          break;

        case CLAUDE_BLOCK.THINKING:
          if (block.thinking && typeof block.thinking === "string") {
            reasoningChunks.push(block.thinking);
          }
          break;

        case CLAUDE_BLOCK.REDACTED_THINKING:
          // Redacted thinking is encrypted reasoning; omit without injecting placeholder notice into visible text
          break;

        default:
          // Block types not handled by this translator (e.g. container_upload, file).
          // OpenAI Chat Completions has no equivalent, so we cannot forward the block.
          // However, silently dropping the entire user message (returning null) is worse:
          // it sends messages:[] to the provider with no indication to the caller.
          // Instead, keep the message alive with a text notice so the turn is preserved
          // and the provider can still respond meaningfully.
          if (block.type) {
            parts.push({
              type: OPENAI_BLOCK.TEXT,
              text: `[${block.type} block omitted: not supported on this route]`
            });
          }
          break;
      }
    }
    const reasoningContent = reasoningChunks.join("");

    // If has tool results, return array of tool messages
    if (toolResults.length > 0) {
      if (parts.length > 0) {
        return [...toolResults, { role: ROLE.USER, content: collapseTextParts(parts) }];
      }
      return toolResults;
    }

    // If has tool calls, return assistant message with tool_calls
    if (toolCalls.length > 0) {
      const result = { role: ROLE.ASSISTANT };
      if (parts.length > 0) {
        result.content = collapseTextParts(parts);
      }
      result.tool_calls = toolCalls;
      if (reasoningContent) {
        result.reasoning_content = reasoningContent;
      }
      return result;
    }

    // Return content
    if (parts.length > 0) {
      const result = {
        role,
        content: collapseTextParts(parts)
      };
      if (reasoningContent && role === ROLE.ASSISTANT) {
        result.reasoning_content = reasoningContent;
      }
      return result;
    }
    
    // Empty content array or thinking-only assistant message
    if (msg.content.length === 0 || (reasoningContent && role === ROLE.ASSISTANT)) {
      const result = { role, content: "" };
      if (reasoningContent && role === ROLE.ASSISTANT) {
        result.reasoning_content = reasoningContent;
      }
      return result;
    }
  }

  return null;
}

// Convert tool choice
function convertToolChoice(choice) {
  if (!choice) return "auto";
  if (typeof choice === "string") return choice;
  
  switch (choice.type) {
    case "auto": return "auto";
    case "any": return "required";
    case "none": return "none";
    case "tool": return { type: OPENAI_BLOCK.FUNCTION, function: { name: choice.name } };
    default: return "auto";
  }
}

// Register
register(FORMATS.CLAUDE, FORMATS.OPENAI, claudeToOpenAIRequest, null);
