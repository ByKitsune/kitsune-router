import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { readOutputTokenCap } from "../formats/maxTokens.js";
import { DEFAULT_THINKING_AG_SIGNATURE, DEFAULT_THINKING_GEMINI_CLI_SIGNATURE } from "../../config/defaultThinkingSignature.js";
import { openaiToClaudeRequestForAntigravity } from "./openai-to-claude.js";
function generateUUID() {
  return crypto.randomUUID();
}

function shortHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

import {
  DEFAULT_SAFETY_SETTINGS,
  convertOpenAIContentToParts,
  convertToolResultToGemini,
  normalizeGeminiContents,
  extractTextContent,
  tryParseJSON,
  generateRequestId,
  generateSessionId,
  generateProjectId,
  cleanJSONSchemaForAntigravity
} from "../formats/gemini.js";
import { deriveSessionId, toNumericSessionId } from "../../utils/sessionManager.js";
import { ROLE, GEMINI_ROLE, OPENAI_BLOCK, CLAUDE_BLOCK } from "../schema/index.js";
import { splitToolCallId, isValidBase64 } from "../concerns/thoughtSignature.js";
import { expandToolResultMessages } from "../concerns/toolCall.js";

// Sanitize function names for Gemini API.
// Gemini requires: starts with [a-zA-Z_], followed by [a-zA-Z0-9_.:\-], max 64 chars.
// Replace any invalid character with '_' and disambiguate with hash suffix on collision or truncation.
function sanitizeGeminiFunctionName(name, existingNames = new Set(), toolNameMap = null) {
  if (!name) return "_unknown";
  if (toolNameMap && toolNameMap.has(name)) {
    return toolNameMap.get(name);
  }

  // Replace any char not in [a-zA-Z0-9_.:\-] with '_'
  let sanitized = name.replace(/[^a-zA-Z0-9_.:\-]/g, "_");
  // First char must be letter or underscore
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }
  // Truncate to 64 chars max
  if (sanitized.length <= 64 && !existingNames.has(sanitized)) {
    existingNames.add(sanitized);
    if (toolNameMap) toolNameMap.set(name, sanitized);
    return sanitized;
  }

  // Disambiguate with deterministic hash suffix on collision or truncation
  const hash = shortHash(name);
  const base = sanitized.substring(0, 55);
  let finalName = `${base}_${hash}`;
  let counter = 1;
  while (existingNames.has(finalName)) {
    finalName = `${sanitized.substring(0, 50)}_${hash}_${counter++}`;
  }
  existingNames.add(finalName);
  if (toolNameMap) toolNameMap.set(name, finalName);
  return finalName;
}

export function sanitizeAntigravitySystemPrompt(text) {
  if (typeof text !== "string") return text;
  return text.replace(
    "You are Hermes Agent, an intelligent AI assistant created by Nous Research.",
    "You are Hermes Agent. You are an intelligent AI assistant created by Nous Research."
  );
}

// Google call IDs are unique across the entire history, but OpenAI clients may
// reuse them. Keep wire IDs and results on call occurrences, never on the source
// messages: the same body can be retried against another provider.
function normalizeGeminiToolCalls(messages) {
  const reservedIds = new Set();
  for (const msg of messages) {
    if (msg.role !== ROLE.ASSISTANT || !Array.isArray(msg.tool_calls)) continue;
    for (const tc of msg.tool_calls) {
      if (tc.type === OPENAI_BLOCK.FUNCTION) reservedIds.add(splitToolCallId(tc.id).rawId);
    }
  }

  const callsByMessage = new Map();
  const usedIds = new Set();
  const pendingById = new Map();
  const nextSuffixById = new Map();
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === ROLE.ASSISTANT && Array.isArray(msg.tool_calls)) {
      const calls = [];
      const turnPending = new Map();
      for (const tc of msg.tool_calls) {
        if (tc.type !== OPENAI_BLOCK.FUNCTION) continue;
        const { rawId, thoughtSignature } = splitToolCallId(tc.id);
        let wireId = rawId;
        if (usedIds.has(wireId)) {
          let suffix = nextSuffixById.get(rawId) || 2;
          do {
            wireId = `${rawId}_d${suffix++}`;
          } while (reservedIds.has(wireId) || usedIds.has(wireId));
          nextSuffixById.set(rawId, suffix);
        }
        usedIds.add(wireId);
        const call = { toolCall: tc, wireId, thoughtSignature, response: undefined };
        calls.push(call);
        if (!turnPending.has(rawId)) turnPending.set(rawId, []);
        turnPending.get(rawId).push(call);
      }
      callsByMessage.set(i, calls);
      // A later turn reusing an ID owns subsequent results. Within one turn,
      // duplicate IDs pair FIFO, just like parallel call/result occurrences.
      for (const [rawId, calls] of turnPending) pendingById.set(rawId, { calls, next: 0 });
    } else if (msg.role === ROLE.TOOL && msg.tool_call_id) {
      const pending = pendingById.get(splitToolCallId(msg.tool_call_id).rawId);
      if (pending && pending.next < pending.calls.length) {
        const call = pending.calls[pending.next++];
        call.response = msg.content;
        call.responseIndex = i;
        call.isError = msg.is_error === true;
      }
    }
  }
  return callsByMessage;
}

// Normalize before the Claude bridge so its global name map sees unique IDs,
// and retain original tool content for MIME metadata that Claude cannot carry.
function normalizeAntigravityClaudeHistory(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const callsByMessage = normalizeGeminiToolCalls(messages);
  const responseIds = new Map();
  const toolResponses = new Map();
  for (const calls of callsByMessage.values()) {
    for (const call of calls) {
      if (call.responseIndex !== undefined) {
        responseIds.set(call.responseIndex, call.wireId);
        toolResponses.set(call.wireId, messages[call.responseIndex]);
      }
    }
  }
  const normalized = messages.map((message, index) => {
    const calls = callsByMessage.get(index);
    if (calls) {
      let callIndex = 0;
      return { ...message, tool_calls: message.tool_calls.map(call => call.type === OPENAI_BLOCK.FUNCTION ? { ...call, id: calls[callIndex++].wireId } : call) };
    }
    if (responseIds.has(index)) return { ...message, tool_call_id: responseIds.get(index) };
    return message;
  });
  return { body: { ...body, messages: normalized }, toolResponses };
}

function geminiToolChoice(choice, rename) {
  if (choice === "none" || choice?.type === "none") return { mode: "NONE" };
  if (choice === "auto" || choice?.type === "auto") return { mode: "AUTO" };
  if (choice === "required" || choice?.type === "any") return { mode: "ANY" };
  const name = choice?.function?.name || ((choice?.type === OPENAI_BLOCK.FUNCTION || choice?.type === "tool") && choice.name);
  if (name) return { mode: "ANY", allowedFunctionNames: [rename(name)] };
  if (choice?.type === "allowed_tools" && choice.allowed_tools) {
    return {
      mode: choice.allowed_tools.mode === "required" ? "ANY" : "VALIDATED",
      allowedFunctionNames: choice.allowed_tools.tools.map(tool => rename(tool.function?.name || tool.name)),
    };
  }
  return undefined;
}

// Core: Convert OpenAI request to Gemini format (base for all variants)
function openaiToGeminiBase(model, body, stream, signature = DEFAULT_THINKING_AG_SIGNATURE, useJSONSchema = false) {
  const result = {
    model: model,
    contents: [],
    generationConfig: {},
    safetySettings: DEFAULT_SAFETY_SETTINGS
  };

  const existingToolNames = new Set();
  const toolNameMap = new Map();

  // Generation config
  if (body.temperature !== undefined) {
    result.generationConfig.temperature = body.temperature;
  }
  if (body.top_p !== undefined) {
    result.generationConfig.topP = body.top_p;
  }
  if (body.top_k !== undefined) {
    result.generationConfig.topK = body.top_k;
  }
  // OpenAI `stop` (string or array) ⇄ Gemini `stopSequences` (array, max 5).
  // Previously dropped, so a client asking for deterministic truncation got
  // untruncated output whenever the request was served by a Gemini upstream.
  if (body.stop !== undefined) {
    const stops = (Array.isArray(body.stop) ? body.stop : [body.stop])
      .filter((s) => typeof s === "string" && s.length > 0)
      .slice(0, 5);
    if (stops.length > 0) result.generationConfig.stopSequences = stops;
  }
  // `seed` maps to Gemini's deterministic-sampling seed. Carried over so a
  // reproducibility request is not silently ignored.
  if (Number.isFinite(body.seed)) {
    result.generationConfig.seed = body.seed;
  }
  const outputCap = readOutputTokenCap(body);
  if (outputCap !== undefined) {
    result.generationConfig.maxOutputTokens = outputCap;
  }
  if (useJSONSchema && body.response_format) {
    if (body.response_format.type === "json_schema" && body.response_format.json_schema?.schema) {
      result.generationConfig.responseMimeType = "application/json";
      result.generationConfig.responseJsonSchema = body.response_format.json_schema.schema;
    } else if (body.response_format.type === "json_object") {
      result.generationConfig.responseMimeType = "application/json";
    } else if (body.response_format.type === "text") {
      result.generationConfig.responseMimeType = "text/plain";
    }
  }

  const messages = Array.isArray(body.messages) ? [...expandToolResultMessages(body.messages)] : [];
  const callsByMessage = normalizeGeminiToolCalls(messages);

  // Convert messages
  if (messages.length) {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const role = msg.role;
      const content = msg.content;

      if (role === ROLE.SYSTEM || role === ROLE.DEVELOPER) {
        const text = sanitizeAntigravitySystemPrompt(typeof content === "string" ? content : extractTextContent(content));
        if (text) {
          if (!result.systemInstruction) {
            result.systemInstruction = {
              role: GEMINI_ROLE.USER,
              parts: [{ text }]
            };
          } else {
            result.systemInstruction.parts.push({ text });
          }
        }
      } else if (role === ROLE.USER) {
        const parts = convertOpenAIContentToParts(content);
        if (parts.length > 0) {
          result.contents.push({ role: GEMINI_ROLE.USER, parts });
        }
      } else if (role === ROLE.ASSISTANT) {
        const parts = [];

        // Thinking/reasoning → thought part with signature
        if (msg.reasoning_content) {
          parts.push({
            thought: true,
            text: msg.reasoning_content
          });
          parts.push({
            thoughtSignature: signature,
            text: ""
          });
        }

        if (content) {
          parts.push(...convertOpenAIContentToParts(content));
        }

        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
          const toolCalls = callsByMessage.get(i);
          for (const call of toolCalls) {
            const tc = call.toolCall;
            const args = tryParseJSON(tc.function?.arguments || "{}");
            const validSig = isValidBase64(call.thoughtSignature) ? call.thoughtSignature : signature;
            parts.push({
              thoughtSignature: validSig,
              functionCall: {
                id: call.wireId,
                name: sanitizeGeminiFunctionName(tc.function.name, existingToolNames, toolNameMap),
                args: args
              }
            });
          }

          if (parts.length > 0) {
            result.contents.push({ role: GEMINI_ROLE.MODEL, parts });
          }

          // Emit each result next to its own call, in the original call order.
          if (toolCalls.some(call => call.response !== undefined)) {
            const toolParts = [];
            for (const call of toolCalls) {
              if (call.response === undefined) continue;
              const name = call.toolCall.function.name;
              const converted = convertToolResultToGemini(call.response, call.isError);

              toolParts.push({
                functionResponse: {
                  id: call.wireId,
                  name: sanitizeGeminiFunctionName(name, existingToolNames, toolNameMap),
                  response: converted.response
                }
              });
              toolParts.push(...converted.parts);
            }
            if (toolParts.length > 0) {
              result.contents.push({ role: GEMINI_ROLE.USER, parts: toolParts });
            }
          }
        } else if (parts.length > 0) {
          result.contents.push({ role: GEMINI_ROLE.MODEL, parts });
        }
      }
    }
  }

  // Convert tools
  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    const functionDeclarations = [];
    for (const t of body.tools) {
      // Check if already in Anthropic/Claude format (no type field, direct name/description/input_schema)
      if (t.name && t.input_schema) {
        const schema = t.input_schema || { type: "object", properties: {} };
        functionDeclarations.push({
          name: sanitizeGeminiFunctionName(t.name, existingToolNames, toolNameMap),
          description: t.description || "",
          ...(useJSONSchema ? { parametersJsonSchema: schema } : { parameters: cleanJSONSchemaForAntigravity(structuredClone(schema)) })
        });
      }
      // OpenAI format
      else if (t.type === OPENAI_BLOCK.FUNCTION && t.function) {
        const fn = t.function;
        const schema = fn.parameters || { type: "object", properties: {} };
        functionDeclarations.push({
          name: sanitizeGeminiFunctionName(fn.name, existingToolNames, toolNameMap),
          description: fn.description || "",
          ...(useJSONSchema ? { parametersJsonSchema: schema } : { parameters: cleanJSONSchemaForAntigravity(structuredClone(schema)) })
        });
      }
    }

    if (functionDeclarations.length > 0) {
      result.tools = [{ functionDeclarations }];
    }
  }
  const choice = geminiToolChoice(body.tool_choice, name => sanitizeGeminiFunctionName(name, existingToolNames, toolNameMap));
  if (choice) result.toolConfig = { functionCallingConfig: choice };

  result.contents = normalizeGeminiContents(result.contents, model);

  // Expose toolNameMap (sanitizedName -> originalName) for response decloaking
  if (toolNameMap.size > 0) {
    const reverseMap = new Map();
    for (const [orig, sanitized] of toolNameMap.entries()) {
      reverseMap.set(sanitized, orig);
    }
    result._toolNameMap = reverseMap;
  }

  return result;
}

// OpenAI -> Gemini (standard API)
export function openaiToGeminiRequest(model, body, stream) {
  return openaiToGeminiBase(model, body, stream, DEFAULT_THINKING_AG_SIGNATURE, true);
}

// OpenAI -> Gemini CLI (Cloud Code Assist)
export function openaiToGeminiCLIRequest(model, body, stream) {
  return openaiToGeminiBase(model, body, stream, DEFAULT_THINKING_GEMINI_CLI_SIGNATURE);
}

// Wrap Gemini CLI format in Cloud Code wrapper
function wrapInCloudCodeEnvelope(model, geminiCLI, credentials = null, isAntigravity = false) {
  const projectId = credentials?.projectId || generateProjectId();

  const envelope = {
    project: projectId,
    model: model,
    userAgent: isAntigravity ? "antigravity" : "gemini-cli",
    requestId: isAntigravity ? `agent-${generateUUID()}` : generateRequestId(),
    request: {
      sessionId: toNumericSessionId(credentials?._clientSessionId) || (isAntigravity ? deriveSessionId(credentials?.email || credentials?.connectionId) : generateSessionId()),
      contents: geminiCLI.contents,
      systemInstruction: geminiCLI.systemInstruction,
      generationConfig: geminiCLI.generationConfig,
      tools: geminiCLI.tools,
    }
  };

  // Antigravity specific fields: omit requestType="agent" to prevent false upstream 429 quota exhaustion (#3986)
  if (!isAntigravity) {
    // Keep safetySettings for Gemini CLI
    envelope.request.safetySettings = geminiCLI.safetySettings;
  }

  if (geminiCLI.toolConfig) {
    envelope.request.toolConfig = geminiCLI.toolConfig;
  } else if (geminiCLI.tools?.length > 0) {
    envelope.request.toolConfig = { functionCallingConfig: { mode: "VALIDATED" } };
  }

  if (geminiCLI._toolNameMap) {
    envelope._toolNameMap = geminiCLI._toolNameMap;
  }

  return envelope;
}

// Wrap Claude format in Cloud Code envelope for Antigravity
function wrapInCloudCodeEnvelopeForClaude(model, claudeRequest, credentials = null, signature = DEFAULT_THINKING_AG_SIGNATURE, toolResponses = new Map()) {
  const projectId = credentials?.projectId || generateProjectId();
  const existingToolNames = new Set();
  const toolNameMap = new Map();

  const envelope = {
    project: projectId,
    model: model,
    userAgent: "antigravity",
    requestId: `agent-${generateUUID()}`,
    request: {
      sessionId: toNumericSessionId(credentials?._clientSessionId) || deriveSessionId(credentials?.email || credentials?.connectionId),
      contents: [],
      generationConfig: {
        temperature: claudeRequest.temperature ?? 1,
        maxOutputTokens: claudeRequest.max_tokens ?? 4096
      }
    }
  };
  if (claudeRequest.top_p !== undefined) envelope.request.generationConfig.topP = claudeRequest.top_p;
  if (claudeRequest.top_k !== undefined) envelope.request.generationConfig.topK = claudeRequest.top_k;
  if (claudeRequest.stop_sequences !== undefined) envelope.request.generationConfig.stopSequences = [...claudeRequest.stop_sequences];

  // Build tool_use id -> name map so functionResponse can use the correct name
  const toolUseIdToName = {};
  if (claudeRequest.messages && Array.isArray(claudeRequest.messages)) {
    for (const msg of claudeRequest.messages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === CLAUDE_BLOCK.TOOL_USE && block.id && block.name) {
            toolUseIdToName[block.id] = block.name;
          }
        }
      }
    }
  }

  // Convert Claude messages to Gemini contents
  if (claudeRequest.messages && Array.isArray(claudeRequest.messages)) {
    for (const msg of claudeRequest.messages) {
      const parts = [];

      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === CLAUDE_BLOCK.TEXT) {
            parts.push({ text: block.text });
          } else if (block.type === CLAUDE_BLOCK.IMAGE) {
            if (block.source?.type === "base64" && block.source.data) {
              parts.push({
                inlineData: {
                  mimeType: block.source.media_type,
                  data: block.source.data
                }
              });
            } else if (block.source?.type === "url" && block.source.url) {
              parts.push({
                fileData: {
                  fileUri: block.source.url,
                  mimeType: "image/*"
                }
              });
            }
          } else if (block.type === CLAUDE_BLOCK.DOCUMENT) {
            if (block.source?.type === "base64" && block.source.data) {
              parts.push({
                inlineData: {
                  mimeType: block.source.media_type,
                  data: block.source.data
                }
              });
            }
          } else if (block.type === CLAUDE_BLOCK.TOOL_USE) {
            parts.push({
              thoughtSignature: signature,
              functionCall: {
                id: block.id,
                name: sanitizeGeminiFunctionName(block.name, existingToolNames, toolNameMap),
                args: block.input || {}
              }
            });
          } else if (block.type === CLAUDE_BLOCK.TOOL_RESULT) {
            const original = toolResponses.get(block.tool_use_id);
            const converted = convertToolResultToGemini(original ? original.content : block.content, block.is_error === true);
            // Resolve the original tool name from the id — Gemini requires it to match the functionCall name
            const resolvedName = toolUseIdToName[block.tool_use_id]
              ? sanitizeGeminiFunctionName(toolUseIdToName[block.tool_use_id], existingToolNames, toolNameMap)
              : "tool";
            parts.push({
              functionResponse: {
                id: block.tool_use_id,
                name: resolvedName,
                response: converted.response
              }
            });
            parts.push(...converted.parts);
          }
        }
      } else if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      }

      if (parts.length > 0) {
        envelope.request.contents.push({
          role: msg.role === ROLE.ASSISTANT ? GEMINI_ROLE.MODEL : GEMINI_ROLE.USER,
          parts
        });
      }
    }
  }

  // Convert Claude tools to Gemini functionDeclarations
  if (claudeRequest.tools && Array.isArray(claudeRequest.tools)) {
    const functionDeclarations = [];
    for (const tool of claudeRequest.tools) {
      if (tool.name && tool.input_schema) {
        const cleanedSchema = cleanJSONSchemaForAntigravity(structuredClone(tool.input_schema));
        functionDeclarations.push({
          name: sanitizeGeminiFunctionName(tool.name, existingToolNames, toolNameMap),
          description: tool.description || "",
          parameters: cleanedSchema
        });
      }
    }
    if (functionDeclarations.length > 0) {
      envelope.request.tools = [{ functionDeclarations }];
      envelope.request.toolConfig = {
        functionCallingConfig: { mode: "VALIDATED" }
      };
    }
  }
  const choice = geminiToolChoice(claudeRequest.tool_choice, name => sanitizeGeminiFunctionName(name, existingToolNames, toolNameMap));
  if (choice) envelope.request.toolConfig = { functionCallingConfig: choice };

  const systemParts = [];
  // Merge user system prompt from claudeRequest
  if (claudeRequest.system) {
    if (Array.isArray(claudeRequest.system)) {
      for (const block of claudeRequest.system) {
        if (block.text) systemParts.push({ text: block.text });
      }
    } else if (typeof claudeRequest.system === "string") {
      systemParts.push({ text: claudeRequest.system });
    }
  }

  if (systemParts.length > 0) {
    envelope.request.systemInstruction = { role: GEMINI_ROLE.USER, parts: systemParts };
  }

  envelope.request.contents = normalizeGeminiContents(envelope.request.contents, model);

  if (toolNameMap.size > 0) {
    const reverseMap = new Map();
    for (const [orig, sanitized] of toolNameMap.entries()) {
      reverseMap.set(sanitized, orig);
    }
    envelope._toolNameMap = reverseMap;
  }

  return envelope;
}

// Detect if model should use Claude backend in Antigravity
// Claude models have specific ID patterns — more reliable than caps at routing level
function isClaudeModel(model) {
  return model.toLowerCase().includes("claude");
}

// OpenAI -> Antigravity (Sandbox Cloud Code with wrapper)
export function openaiToAntigravityRequest(model, body, stream, credentials = null) {
  if (isClaudeModel(model)) {
    // Validate before the Claude bridge can coerce an invalid cap or replace zero.
    readOutputTokenCap(body);
    const normalized = normalizeAntigravityClaudeHistory(body);
    const claudeRequest = openaiToClaudeRequestForAntigravity(model, normalized.body, stream);
    return wrapInCloudCodeEnvelopeForClaude(model, claudeRequest, credentials, DEFAULT_THINKING_AG_SIGNATURE, normalized.toolResponses);
  }

  const geminiCLI = openaiToGeminiCLIRequest(model, body, stream);
  return wrapInCloudCodeEnvelope(model, geminiCLI, credentials, true);
}

// Register
register(FORMATS.OPENAI, FORMATS.GEMINI, openaiToGeminiRequest, null);
register(FORMATS.OPENAI, FORMATS.GEMINI_CLI, (model, body, stream, credentials) => wrapInCloudCodeEnvelope(model, openaiToGeminiCLIRequest(model, body, stream), credentials), null);
register(FORMATS.OPENAI, FORMATS.ANTIGRAVITY, openaiToAntigravityRequest, null);
