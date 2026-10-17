import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { adjustMaxTokens, requiresMaxCompletionTokens } from "../formats/maxTokens.js";
import { normalizeMediaPart } from "../concerns/multimodal.js";
import { convertGeminiFunctionResponseContent, copyGeminiRequestControls, geminiSchemaToJSONSchema, collapseGeminiParts } from "../formats/gemini.js";
import { ROLE, GEMINI_ROLE, OPENAI_BLOCK } from "../schema/index.js";
import { budgetToEffort } from "../concerns/thinking.js";

// Convert Antigravity request to OpenAI format
// Antigravity body: { project, model, userAgent, requestType, requestId, request: { contents, systemInstruction, tools, toolConfig, generationConfig, sessionId } }
export function antigravityToOpenAIRequest(model, body, stream) {
  const req = body.request || body;
  const result = {
    model: model,
    messages: [],
    stream: stream
  };

  // Generation config
  if (req.generationConfig) {
    const config = req.generationConfig;
    if (config.maxOutputTokens !== undefined) {
      const tempBody = { max_tokens: config.maxOutputTokens, tools: req.tools };
      const tokenParam = requiresMaxCompletionTokens(model) ? "max_completion_tokens" : "max_tokens";
      result[tokenParam] = adjustMaxTokens(tempBody, null, { sourceFormat: "gemini" });
    }
    if (config.temperature !== undefined) {
      result.temperature = config.temperature;
    }
    if (config.topP !== undefined) {
      result.top_p = config.topP;
    }

    // Thinking config → reasoning_effort
    if (config.thinkingConfig) {
      const effort = budgetToEffort(config.thinkingConfig.thinkingBudget || 0);
      if (effort) result.reasoning_effort = effort;
    }
  }
  copyGeminiRequestControls(result, req);

  // System instruction
  if (req.systemInstruction) {
    const systemText = extractText(req.systemInstruction);
    if (systemText) {
      result.messages.push({ role: ROLE.SYSTEM, content: systemText });
    }
  }

  // Convert contents to messages
  if (req.contents && Array.isArray(req.contents)) {
    for (const content of req.contents) {
      const converted = convertContent(content);
      if (converted) {
        if (Array.isArray(converted)) {
          result.messages.push(...converted);
        } else {
          result.messages.push(converted);
        }
      }
    }
  }

  // Tools
  if (req.tools && Array.isArray(req.tools)) {
    result.tools = [];
    for (const tool of req.tools) {
      if (tool.functionDeclarations) {
        for (const func of tool.functionDeclarations) {
          result.tools.push({
            type: OPENAI_BLOCK.FUNCTION,
            function: {
              name: func.name,
              description: func.description || "",
              parameters: func.parametersJsonSchema ?? geminiSchemaToJSONSchema(func.parameters) ?? { type: "object", properties: {} }
            }
          });
        }
      }
    }
  }

  return result;
}


// Convert Antigravity content to OpenAI message
// Handles: text, thought, thoughtSignature, functionCall, functionResponse, inlineData
function convertContent(content) {
  const role = content.role === GEMINI_ROLE.MODEL ? ROLE.ASSISTANT : content.role === GEMINI_ROLE.USER ? ROLE.USER : content.role;

  if (!content.parts || !Array.isArray(content.parts)) {
    return null;
  }

  const textParts = [];
  const toolCalls = [];
  const toolResults = [];
  let reasoningContent = "";

  for (const part of content.parts) {
    // Thinking content (thought: true)
    if (part.thought === true && part.text) {
      reasoningContent += part.text;
      continue;
    }

    // Text with thoughtSignature = regular text after thinking
    const textSignature = part.thoughtSignature ?? part.thought_signature;
    if (typeof textSignature === "string" && part.text !== undefined) {
      if (part.text) {
        textParts.push({ type: OPENAI_BLOCK.TEXT, text: part.text, extra_content: { google: { thought_signature: textSignature } } });
      }
      continue;
    }

    // Regular text
    if (part.text !== undefined && part.text !== "") {
      textParts.push({ type: OPENAI_BLOCK.TEXT, text: part.text });
    }

    const media = normalizeMediaPart(part);
    if (media) {
      const signature = part.thoughtSignature ?? part.thought_signature;
      textParts.push(typeof signature === "string" ? { ...media, extra_content: { google: { thought_signature: signature } } } : media);
    }

    // Function call
    if (part.functionCall) {
      toolCalls.push({
        // Deterministic id from name so the matching functionResponse pairs correctly.
        id: part.functionCall.id || `call_${part.functionCall.name}`,
        type: OPENAI_BLOCK.FUNCTION,
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {})
        }
      });
    }

    // Function response → collect all, each becomes a separate tool message
    if (part.functionResponse) {
      toolResults.push({
        role: ROLE.TOOL,
        tool_call_id: part.functionResponse.id || `call_${part.functionResponse.name}`,
        content: convertGeminiFunctionResponseContent(part.functionResponse),
        ...(Object.hasOwn(part.functionResponse.response || {}, "error") ? { is_error: part.functionResponse.response.error != null && part.functionResponse.response.error !== false } : {})
      });
    }
  }

  // Content with functionResponses — return array of tool result messages,
  // plus a source-role message for any co-located tool calls / text.
  if (toolResults.length > 0) {
    if (toolCalls.length > 0 || textParts.length > 0 || reasoningContent) {
      const assistantMsg = { role: toolCalls.length ? ROLE.ASSISTANT : role };
      if (textParts.length > 0) {
        assistantMsg.content = collapseGeminiParts(textParts);
      }
      if (reasoningContent) {
        assistantMsg.reasoning_content = reasoningContent;
      }
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      return [...toolResults, assistantMsg];
    }
    return toolResults;
  }

  // Assistant with tool calls
  if (toolCalls.length > 0) {
    const msg = { role: ROLE.ASSISTANT };
    if (textParts.length > 0) {
      msg.content = collapseGeminiParts(textParts);
    }
    if (reasoningContent) {
      msg.reasoning_content = reasoningContent;
    }
    msg.tool_calls = toolCalls;
    return msg;
  }

  // Regular message
  if (textParts.length > 0 || reasoningContent) {
    const msg = { role };
    if (textParts.length > 0) {
      msg.content = collapseGeminiParts(textParts);
    }
    if (reasoningContent) {
      msg.reasoning_content = reasoningContent;
    }
    return msg;
  }

  return null;
}

// Extract text from systemInstruction
function extractText(instruction) {
  if (typeof instruction === "string") return instruction;
  if (instruction.parts && Array.isArray(instruction.parts)) {
    return instruction.parts.map(p => p.text || "").join("");
  }
  return "";
}

// Register
register(FORMATS.ANTIGRAVITY, FORMATS.OPENAI, antigravityToOpenAIRequest, null);
