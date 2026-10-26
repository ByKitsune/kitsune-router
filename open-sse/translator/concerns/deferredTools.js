import { CLAUDE_BLOCK, CLAUDE_TOOL_DEFINITION, OPENAI_BLOCK } from "../schema/index.js";
import { ownRequestBody } from "./requestOwnership.js";

const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
// Kimi-specific adaptation of PR #4612, d41355f573372e9814451e51685252c80b023def.
// Run before ordinary tool-name compression and final Claude preparation. A
// beta block is removed only after its actual definition is validated/owned.
export function lowerKimiDeferredTools(body, context = null) {
  if (!Array.isArray(body?.messages)) return body;
  const definitions = [];
  for (const [messageIndex, message] of body.messages.entries()) {
    const content = Array.isArray(message?.content) ? message.content : record(message?.content) ? [message.content] : [];
    for (const [blockIndex, block] of content.entries()) {
      if (block?.type !== CLAUDE_BLOCK.TOOL_ADDITION) continue;
      const definition = block.tool?.definition;
      if (block.tool?.type !== CLAUDE_TOOL_DEFINITION || !record(definition) ||
          typeof definition.name !== "string" || !definition.name.trim() ||
          (definition.type != null && definition.type !== OPENAI_BLOCK.FUNCTION) ||
          !record(definition.input_schema) || definition.input_schema.type !== "object" ||
          (definition.description !== undefined && typeof definition.description !== "string")) {
        const error = new Error("unsupported_parameter: This destination requires a tool_addition with a named tool_definition and an object input_schema; the unsupported block has not been discarded.");
        error.code = "unsupported_parameter";
        error.param = `messages.${messageIndex}.content.${blockIndex}`;
        throw error;
      }
      definitions.push(definition);
    }
  }
  if (!definitions.length) return body;
  if (body.tools != null && !Array.isArray(body.tools)) {
    const error = new Error("unsupported_parameter: Existing tools must be an array before deferred tool definitions can be added.");
    error.code = "unsupported_parameter";
    error.param = "tools";
    throw error;
  }
  const result = ownRequestBody(body, context);
  const tools = Array.isArray(result.tools) ? result.tools : [];
  const names = new Set(tools.map(tool => tool?.name || tool?.function?.name));
  for (const definition of definitions) {
    if (names.has(definition.name)) continue;
    tools.push(ownRequestBody(definition));
    names.add(definition.name);
  }
  result.tools = tools;
  result.messages = result.messages.flatMap(message => {
    if (!Array.isArray(message?.content) && !record(message?.content)) return [message];
    const content = (Array.isArray(message.content) ? message.content : [message.content])
      .filter(block => block?.type !== CLAUDE_BLOCK.TOOL_ADDITION);
    return content.length ? [{ ...message, content }] : [];
  });
  return result;
}
