import crypto from "node:crypto";
import { FORMATS } from "../translator/formats.js";
import { RESPONSES_ITEM } from "../translator/schema/index.js";

/**
 * Maximum function/tool name length supported across providers (Gemini, Vertex, OpenAI).
 * Names longer than 64 characters are rejected with INVALID_ARGUMENT (#3622).
 */
export const MAX_TOOL_NAME_LENGTH = 64;

/**
 * Compress tool name to <= 64 characters using first 55 characters + "_" + 8-char MD5 hash.
 * Guaranteed deterministic and non-colliding for tools sharing the same prefix.
 */
export function compressSingleToolName(name) {
  if (!name || typeof name !== "string" || name.length <= MAX_TOOL_NAME_LENGTH) {
    return name;
  }
  const hash = crypto.createHash("md5").update(name).digest("hex").slice(0, 8);
  return `${name.slice(0, 55)}_${hash}`;
}

/**
 * Compress tool names > 64 characters across tools, message history, and tool_choice.
 * Returns { body, toolNameMap } where toolNameMap maps shortName -> originalName.
 */
export function compressToolNames(sourceFormat, body) {
  if (!body || typeof body !== "object") return { body, toolNameMap: null };

  const tools = body.tools;
  if (!Array.isArray(tools) || tools.length === 0) return { body, toolNameMap: null };

  const isClaude = sourceFormat === FORMATS.CLAUDE;
  const isOpenAI = sourceFormat === FORMATS.OPENAI || sourceFormat === FORMATS.OPENAI_RESPONSES;

  const shortToOriginal = new Map();
  const originalToShort = new Map();

  const getToolName = (t) => (isClaude ? t.name : t.function?.name || t.name);
  const setToolName = (t, name) => {
    if (isClaude || !t.function) return { ...t, name };
    return { ...t, function: { ...t.function, name } };
  };

  const newTools = tools.map((tool) => {
    const originalName = getToolName(tool);
    if (!originalName || typeof originalName !== "string" || originalName.length <= MAX_TOOL_NAME_LENGTH) {
      return tool;
    }
    const shortName = compressSingleToolName(originalName);
    shortToOriginal.set(shortName, originalName);
    originalToShort.set(originalName, shortName);
    return setToolName(tool, shortName);
  });

  if (shortToOriginal.size === 0) {
    return { body, toolNameMap: null };
  }

  // Update historical turns in messages
  let newMessages = body.messages;
  if (Array.isArray(body.messages)) {
    newMessages = body.messages.map((msg) => {
      let updated = msg;
      // Claude content blocks
      if (Array.isArray(msg.content)) {
        let contentChanged = false;
        const newContent = msg.content.map((block) => {
          if (block && typeof block === "object") {
            // tool_use
            if (block.type === "tool_use" && originalToShort.has(block.name)) {
              contentChanged = true;
              return { ...block, name: originalToShort.get(block.name) };
            }
          }
          return block;
        });
        if (contentChanged) updated = { ...updated, content: newContent };
      }

      // OpenAI tool_calls
      if (Array.isArray(msg.tool_calls)) {
        let callsChanged = false;
        const newCalls = msg.tool_calls.map((tc) => {
          if (tc?.function?.name && originalToShort.has(tc.function.name)) {
            callsChanged = true;
            return { ...tc, function: { ...tc.function, name: originalToShort.get(tc.function.name) } };
          }
          return tc;
        });
        if (callsChanged) updated = { ...updated, tool_calls: newCalls };
      }

      // OpenAI tool response message name
      if (msg.role === "tool" && msg.name && originalToShort.has(msg.name)) {
        updated = { ...updated, name: originalToShort.get(msg.name) };
      }

      return updated;
    });
  }

  // Update tool_choice
  let newToolChoice = body.tool_choice;
  if (body.tool_choice && typeof body.tool_choice === "object") {
    if (isClaude && body.tool_choice.type === "tool" && originalToShort.has(body.tool_choice.name)) {
      newToolChoice = { ...body.tool_choice, name: originalToShort.get(body.tool_choice.name) };
    } else if (body.tool_choice.type === "function" && originalToShort.has(body.tool_choice.function?.name)) {
      newToolChoice = {
        ...body.tool_choice,
        function: { ...body.tool_choice.function, name: originalToShort.get(body.tool_choice.function.name) },
      };
    }
  }

  const newBody = {
    ...body,
    tools: newTools,
    ...(newMessages ? { messages: newMessages } : {}),
    ...(newToolChoice ? { tool_choice: newToolChoice } : {}),
  };

  return { body: newBody, toolNameMap: shortToOriginal };
}

/**
 * Decloak / restore compressed tool names on an OpenAI SSE chunk or JSON response.
 */
export function decloakOpenAIChunk(chunk, toolNameMap) {
  if (!toolNameMap?.size || !chunk || typeof chunk !== "object") {
    return chunk;
  }

  if (!Array.isArray(chunk.choices)) {
    if (chunk.data && chunk.event) {
      const data = decloakOpenAIChunk(chunk.data, toolNameMap);
      return data === chunk.data ? chunk : { ...chunk, data };
    }
    const restoreItem = (item) => {
      if ((item?.type !== RESPONSES_ITEM.FUNCTION_CALL && item?.type !== RESPONSES_ITEM.CUSTOM_TOOL_CALL) || !toolNameMap.has(item.name)) return item;
      return { ...item, name: toolNameMap.get(item.name) };
    };
    let result = chunk;
    if (chunk.item) {
      const item = restoreItem(chunk.item);
      if (item !== chunk.item) result = { ...result, item };
    }
    if (Array.isArray(chunk.output)) {
      const output = chunk.output.map(restoreItem);
      if (output.some((item, index) => item !== chunk.output[index])) result = { ...result, output };
    }
    if (Array.isArray(chunk.candidates)) {
      const candidates = chunk.candidates.map((candidate) => {
        if (!Array.isArray(candidate.content?.parts)) return candidate;
        let changed = false;
        const parts = candidate.content.parts.map((part) => {
          const call = part.functionCall;
          if (!call || !toolNameMap.has(call.name)) return part;
          changed = true;
          return { ...part, functionCall: { ...call, name: toolNameMap.get(call.name) } };
        });
        return changed ? { ...candidate, content: { ...candidate.content, parts } } : candidate;
      });
      if (candidates.some((candidate, index) => candidate !== chunk.candidates[index])) result = { ...result, candidates };
    }
    if (chunk.response) {
      const response = decloakOpenAIChunk(chunk.response, toolNameMap);
      if (response !== chunk.response) result = { ...result, response };
    }
    return result;
  }

  let changed = false;
  const newChoices = chunk.choices.map((choice) => {
    if (!choice || typeof choice !== "object") return choice;

    // Streaming delta
    if (Array.isArray(choice.delta?.tool_calls)) {
      let deltaCallsChanged = false;
      const newCalls = choice.delta.tool_calls.map((tc) => {
        if (tc?.function?.name && toolNameMap.has(tc.function.name)) {
          deltaCallsChanged = true;
          changed = true;
          return { ...tc, function: { ...tc.function, name: toolNameMap.get(tc.function.name) } };
        }
        return tc;
      });
      if (deltaCallsChanged) {
        return { ...choice, delta: { ...choice.delta, tool_calls: newCalls } };
      }
    }

    // Non-streaming message
    if (Array.isArray(choice.message?.tool_calls)) {
      let msgCallsChanged = false;
      const newCalls = choice.message.tool_calls.map((tc) => {
        if (tc?.function?.name && toolNameMap.has(tc.function.name)) {
          msgCallsChanged = true;
          changed = true;
          return { ...tc, function: { ...tc.function, name: toolNameMap.get(tc.function.name) } };
        }
        return tc;
      });
      if (msgCallsChanged) {
        return { ...choice, message: { ...choice.message, tool_calls: newCalls } };
      }
    }

    return choice;
  });

  if (!changed) return chunk;
  return { ...chunk, choices: newChoices };
}

export function isCompleteToolName(name, declarations) {
  if (!name || !declarations?.has(name)) return false;
  for (const candidate of declarations) {
    if (candidate.length > name.length && candidate.startsWith(name)) return false;
  }
  return true;
}

// Names in Chat are deltas; a compressed alias can span several chunks. State is
// owned by one stream and keyed by both choice and tool index, never by provider.
export function restoreOpenAIToolNameDeltas(chunk, toolNameMap, names) {
  if (!toolNameMap?.size || !Array.isArray(chunk?.choices)) return decloakOpenAIChunk(chunk, toolNameMap);
  let changed = false;
  const choices = chunk.choices.map((choice) => {
    if (!Array.isArray(choice?.delta?.tool_calls)) return choice;
    let callsChanged = false;
    const tool_calls = choice.delta.tool_calls.map((call) => {
      const fragment = call?.function?.name;
      if (typeof fragment !== "string" || !fragment) return call;
      const key = `${choice.index ?? 0}:${call.index ?? 0}`;
      let entry = names.get(key);
      if (!entry) { entry = { pending: "", resolved: false }; names.set(key, entry); }
      if (entry.resolved) return call;
      entry.pending += fragment;
      let name = toolNameMap.get(entry.pending);
      if (name) entry.resolved = true;
      else {
        let prefix = false;
        for (const alias of toolNameMap.keys()) if (alias.startsWith(entry.pending)) { prefix = true; break; }
        if (!prefix) { name = entry.pending; entry.resolved = true; }
      }
      if (name === fragment) return call;
      callsChanged = true;
      const fn = { ...call.function };
      if (name) fn.name = name;
      else delete fn.name;
      return { ...call, function: fn };
    });
    if (!callsChanged) return choice;
    changed = true;
    return { ...choice, delta: { ...choice.delta, tool_calls } };
  });
  return changed ? { ...chunk, choices } : chunk;
}
