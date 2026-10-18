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

// Keep whole provider frames until their tool names are resolved. Replaying the
// original opener, rather than moving its name to a continuation, preserves both
// strict SDK initialization and opaque provider metadata.
function drainToolNameFrames(state) {
  const ready = [];
  const pending = [];
  const blocked = new Set();
  for (const frame of state.frames) {
    if (frame.owners.some(entry => !entry.resolved || blocked.has(entry))) {
      pending.push(frame);
      for (const entry of frame.owners) blocked.add(entry);
      continue;
    }
    let choices = frame.chunk.choices;
    for (const { choiceIndex, callIndex, entry, opener, fragment } of frame.calls) {
      const choice = choices[choiceIndex];
      const call = choice.delta.tool_calls[callIndex];
      const name = opener ? entry.name : undefined;
      if (opener ? !name || call.function?.name === name : !fragment) continue;
      const fn = { ...call.function };
      if (opener) fn.name = name;
      else delete fn.name;
      if (choices === frame.chunk.choices) choices = [...choices];
      const tool_calls = [...choice.delta.tool_calls];
      tool_calls[callIndex] = { ...call, function: fn };
      choices[choiceIndex] = { ...choice, delta: { ...choice.delta, tool_calls } };
    }
    ready.push(choices === frame.chunk.choices ? frame.chunk : { ...frame.chunk, choices });
  }
  state.frames = pending;
  return ready;
}

function resolveToolName(entry, toolNameMap) {
  const name = entry.fragments.join("");
  entry.name = toolNameMap.get(name) || name;
  entry.fragments = [];
  entry.resolved = true;
}

// State belongs to one stream. An absent tool index never acquires ownership of
// another call; the malformed upstream frame remains the client's to reject.
// A null chunk finishes pending names at [DONE]/EOF, not on errors or cancellation.
export function restoreOpenAIToolNameDeltas(chunk, toolNameMap, state, wireToolNames) {
  if (!toolNameMap?.size) return chunk ? [decloakOpenAIChunk(chunk, toolNameMap)] : [];
  if (!chunk) {
    for (const entry of state.names.values()) if (!entry.resolved) resolveToolName(entry, toolNameMap);
    return drainToolNameFrames(state);
  }
  if (!Array.isArray(chunk.choices)) return [decloakOpenAIChunk(chunk, toolNameMap)];

  const frame = { chunk, calls: [], owners: [] };
  for (let choiceIndex = 0; choiceIndex < chunk.choices.length; choiceIndex++) {
    const choice = chunk.choices[choiceIndex];
    if (!choice || typeof choice !== "object") continue;
    const choiceId = choice.index ?? 0;
    const calls = choice.delta?.tool_calls;
    if (Array.isArray(calls)) for (let callIndex = 0; callIndex < calls.length; callIndex++) {
      const call = calls[callIndex];
      if (!Number.isInteger(call?.index) || call.index < 0) continue;
      const key = `${choiceId}:${call.index}`;
      let entry = state.names.get(key);
      if (entry) frame.owners.push(entry);
      if (entry?.resolved) continue;
      const fragment = call.function?.name;
      if (!entry) {
        if (typeof fragment !== "string") continue;
        entry = { choiceId, fragments: [], resolved: false, name: "" };
        state.names.set(key, entry);
        frame.owners.push(entry);
        frame.calls.push({ choiceIndex, callIndex, entry, opener: true, fragment });
      } else {
        frame.calls.push({ choiceIndex, callIndex, entry, opener: false, fragment });
      }
      if (typeof fragment === "string" && fragment) entry.fragments.push(fragment);
      const name = entry.fragments.join("");
      if (!name) continue;
      let hasLongerName = false;
      for (const candidate of wireToolNames || toolNameMap.keys()) {
        if (candidate.length > name.length && candidate.startsWith(name)) {
          hasLongerName = true;
          break;
        }
      }
      if (!hasLongerName) resolveToolName(entry, toolNameMap);
    }
    if (choice.finish_reason) {
      for (const entry of state.names.values()) {
        if (entry.choiceId !== choiceId) continue;
        frame.owners.push(entry);
        if (!entry.resolved) resolveToolName(entry, toolNameMap);
      }
    }
  }
  state.frames.push(frame);
  return drainToolNameFrames(state);
}
