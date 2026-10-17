import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { adjustMaxTokens, requiresMaxCompletionTokens } from "../formats/maxTokens.js";
import { normalizeMediaPart } from "../concerns/multimodal.js";
import { convertGeminiFunctionResponseContent, copyGeminiRequestControls, geminiSchemaToJSONSchema, collapseGeminiParts } from "../formats/gemini.js";
import { ROLE, GEMINI_ROLE, OPENAI_BLOCK } from "../schema/index.js";

// Convert Gemini request to OpenAI format
export function geminiToOpenAIRequest(model, body, stream) {
  body = body.request || body;
  const result = {
    model: model,
    messages: [],
    stream: stream
  };

  // Generation config
  if (body.generationConfig) {
    const config = body.generationConfig;
    if (config.maxOutputTokens !== undefined) {
      const tempBody = { max_tokens: config.maxOutputTokens, tools: body.tools };
      const tokenParam = requiresMaxCompletionTokens(model) ? "max_completion_tokens" : "max_tokens";
      result[tokenParam] = adjustMaxTokens(tempBody, null, { sourceFormat: "gemini" });
    }
    if (config.temperature !== undefined) {
      result.temperature = config.temperature;
    }
    if (config.topP !== undefined) {
      result.top_p = config.topP;
    }
  }
  copyGeminiRequestControls(result, body);

  // System instruction
  if (body.systemInstruction) {
    const systemText = extractGeminiText(body.systemInstruction);
    if (systemText) {
      result.messages.push({
        role: ROLE.SYSTEM,
        content: systemText
      });
    }
  }

  // Convert contents to messages
  if (body.contents && Array.isArray(body.contents)) {
    for (const content of body.contents) {
      const converted = convertGeminiContent(content);
      if (converted) {
        result.messages.push(...(Array.isArray(converted) ? converted : [converted]));
      }
    }
  }

  // Tools
  if (body.tools && Array.isArray(body.tools)) {
    result.tools = [];
    for (const tool of body.tools) {
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

// Convert Gemini content to OpenAI message
function convertGeminiContent(content) {
  const role = content.role === GEMINI_ROLE.USER ? ROLE.USER : ROLE.ASSISTANT;
  
  if (!content.parts || !Array.isArray(content.parts)) {
    return null;
  }

  const parts = [];
  const toolCalls = [];
  const toolResults = [];
  const reasoningChunks = [];

  for (const part of content.parts) {
    if (part.text !== undefined) {
      if (part.thought === true) {
        if (role === ROLE.ASSISTANT && typeof part.text === "string") reasoningChunks.push(part.text);
      } else {
        const signature = part.thoughtSignature ?? part.thought_signature;
        parts.push({ type: OPENAI_BLOCK.TEXT, text: part.text,
          ...(typeof signature === "string" ? { extra_content: { google: { thought_signature: signature } } } : {}) });
      }
    }

    const media = normalizeMediaPart(part);
    if (media) {
      const signature = part.thoughtSignature ?? part.thought_signature;
      parts.push(typeof signature === "string" ? { ...media, extra_content: { google: { thought_signature: signature } } } : media);
    }

    if (part.functionCall) {
      // Gemini lacks a native call id; derive a deterministic one from the name so the
      // matching functionResponse maps to the same tool_call_id (providers require pairing).
      toolCalls.push({
        id: part.functionCall.id || `call_${part.functionCall.name}`,
        type: OPENAI_BLOCK.FUNCTION,
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {})
        }
      });
    }

    if (part.functionResponse) {
      toolResults.push({
        role: ROLE.TOOL,
        tool_call_id: part.functionResponse.id || `call_${part.functionResponse.name}`,
        content: convertGeminiFunctionResponseContent(part.functionResponse),
        ...(Object.hasOwn(part.functionResponse.response || {}, "error") ? { is_error: part.functionResponse.response.error != null && part.functionResponse.response.error !== false } : {})
      });
    }
  }
  const reasoningContent = reasoningChunks.join("");

  if (toolCalls.length > 0) {
    const result = { role: ROLE.ASSISTANT };
    if (parts.length > 0) {
      result.content = collapseGeminiParts(parts);
    }
    result.tool_calls = toolCalls;
    if (reasoningContent) result.reasoning_content = reasoningContent;
    return toolResults.length ? [...toolResults, result] : result;
  }

  if (parts.length > 0 || reasoningContent) {
    const result = {
      role,
      content: parts.length > 0 ? collapseGeminiParts(parts) : ""
    };
    if (reasoningContent) result.reasoning_content = reasoningContent;
    return toolResults.length ? [...toolResults, result] : result;
  }

  return toolResults.length ? toolResults : null;
}

// Extract text from Gemini content
function extractGeminiText(content) {
  if (typeof content === "string") return content;
  if (content.parts && Array.isArray(content.parts)) {
    return content.parts.map(p => p.text || "").join("");
  }
  return "";
}

// Register
register(FORMATS.GEMINI, FORMATS.OPENAI, geminiToOpenAIRequest, null);
register(FORMATS.GEMINI_CLI, FORMATS.OPENAI, geminiToOpenAIRequest, null);

