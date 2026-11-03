import { CLAUDE_TOOL_SUFFIX } from "../config/appConstants.js";
import { compressSingleToolName } from "./toolCompressor.js";

/**
 * Apply request-local client tool aliases before sending to Claude:
 * - Rename client tools with the CLAUDE_TOOL_SUFFIX ("_ide") in tools[] and messages[]
 * - Skip tools that carry a `type` (server-side built-ins) — sent as-is
 * Returns { body, toolNameMap } where toolNameMap maps suffixed → original
 * @param {object} body - Claude API request body
 * @returns {{ body: object, toolNameMap: Map|null }}
 */
export function cloakClaudeTools(body) {
  const tools = body.tools;
  if (!tools || tools.length === 0) return { body, toolNameMap: null };

  const toolNameMap = new Map();
  const clientAliases = new Map();
  const usedNames = new Set(tools.map(tool => tool.name));
  const declaredClientNames = new Set(tools.filter(tool => !tool.type).map(tool => tool.name));
  // Unchanged historical calls are native identities too. An alias must not
  // capture their names and later restore them as a different current tool.
  for (const message of body.messages || []) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === "tool_use" && !declaredClientNames.has(block.name)) usedNames.add(block.name);
    }
  }
  const clientDeclarations = [];

  // All client tools get renamed with suffix.
  // Built-in server tools (web_search_20250305, etc.) carry a `type` and require
  // an exact reserved `name` — never suffix those or Claude rejects the request.
  for (const tool of tools) {
    if (tool.type) { clientDeclarations.push(tool); continue; }
    if (typeof tool.name !== "string" || !tool.name) { clientDeclarations.push(tool); continue; }
    let suffixed = clientAliases.get(tool.name);
    if (!suffixed) {
      let attempt = 0;
      do {
        suffixed = compressSingleToolName(`${tool.name}${CLAUDE_TOOL_SUFFIX}${attempt ? `_${attempt}` : ""}`);
        attempt++;
      } while (usedNames.has(suffixed));
      usedNames.add(suffixed);
      clientAliases.set(tool.name, suffixed);
    }
    toolNameMap.set(suffixed, tool.name);
    clientDeclarations.push({ ...tool, name: suffixed });
  }

  // Only advertise tools the caller actually supplied. Synthetic tools change
  // model behavior and can produce calls the caller cannot execute.
  const allTools = clientDeclarations;

  // Historical and server-owned tools outside this request's map stay exact.
  const renamedMessages = body.messages?.map(msg => {
    if (!Array.isArray(msg.content)) return msg;
    const renamedContent = msg.content.map(block =>
      block.type === "tool_use" && clientAliases.has(block.name) ? { ...block, name: clientAliases.get(block.name) } : block
    );
    return { ...msg, content: renamedContent };
  });

  const cloakedBody = { ...body, tools: allTools, messages: renamedMessages || body.messages };

  // A forced tool_choice ({ type: "tool", name }) must point at the suffixed
  // tool name, otherwise Claude rejects it: "Tool '<name>' not found in provided tools".
  // Only rewrite when the choice targets one of the client tools we actually
  // renamed. Server-owned and undeclared historical tools keep their names.
  if (
    body.tool_choice?.type === "tool" &&
    clientAliases.has(body.tool_choice.name)
  ) {
    cloakedBody.tool_choice = { ...body.tool_choice, name: clientAliases.get(body.tool_choice.name) };
  }

  return {
    body: cloakedBody,
    toolNameMap: toolNameMap.size > 0 ? toolNameMap : null
  };
}

// Decloak tool_use names in non-streaming Claude response body (INPUT side)
export function decloakToolNames(body, toolNameMap) {
  if (!toolNameMap?.size || !Array.isArray(body?.content)) return body;
  let changed = false;
  const content = body.content.map(block => {
    if (block?.type !== "tool_use" || !toolNameMap.has(block.name)) return block;
    changed = true;
    return { ...block, name: toolNameMap.get(block.name) };
  });
  return changed ? { ...body, content } : body;
}

/**
 * Decloak the tool name inside a single streamed Claude SSE event.
 *
 * Streaming counterpart of decloakToolNames(). Required for claude→claude
 * proxying: translateResponse() returns same-format chunks untouched, so
 * without this the client receives the cloaked ("_ide"-suffixed) tool name
 * and rejects the call as an unknown tool. In a Claude SSE stream a tool
 * name appears exactly once per call — on the content_block_start event of
 * a tool_use block; argument deltas carry no name.
 *
 * Only names present in the request-local map are changed. A literal suffix is
 * not evidence of cloaking; unrecognized native tool names remain exact.
 *
 * @param {object|null} chunk - Parsed SSE event (may be null on stream flush)
 * @param {Map|null} toolNameMap - Suffixed → original name map from cloakClaudeTools()
 * @returns {object|null} The chunk, with the tool_use name restored when cloaked
 */
export function decloakStreamChunk(chunk, toolNameMap) {
  if (!chunk || typeof chunk !== "object") return chunk;
  if (chunk.type !== "content_block_start") return chunk;
  const block = chunk.content_block;
  if (block?.type !== "tool_use" || typeof block.name !== "string") return chunk;
  const original = toolNameMap?.get(block.name);
  if (!original) return chunk;
  return { ...chunk, content_block: { ...block, name: original } };
}
