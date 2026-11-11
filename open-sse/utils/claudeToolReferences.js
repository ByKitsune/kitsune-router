import { CLAUDE_BLOCK } from "../translator/schema/blocks.js";

// These are the two Messages protocol containers for deferred-tool references.
// Other objects (tool inputs, application JSON, web-fetch url_sources) can use
// similar discriminators without identifying a callable tool in this request.
function referenceContent(block) {
  if (block?.type === CLAUDE_BLOCK.TOOL_RESULT && Array.isArray(block.content)) return block.content;
  if (block?.type === CLAUDE_BLOCK.TOOL_SEARCH_TOOL_RESULT &&
      block.content?.type === CLAUDE_BLOCK.TOOL_SEARCH_TOOL_SEARCH_RESULT &&
      Array.isArray(block.content.tool_references)) return block.content.tool_references;
  return null;
}

export function getClaudeToolReferenceNames(block) {
  return (referenceContent(block) || [])
    .filter(part => part?.type === CLAUDE_BLOCK.TOOL_REFERENCE && typeof part.tool_name === "string")
    .map(part => part.tool_name);
}

// Copy only containers whose protocol references changed. The same helper works
// in either direction with the request-local forward or restoration name map.
export function renameClaudeToolReferences(block, toolNameMap) {
  if (!toolNameMap?.size) return block;
  const content = referenceContent(block);
  if (!content) return block;
  let changed = false;
  const renamed = content.map(part => {
    if (part?.type !== CLAUDE_BLOCK.TOOL_REFERENCE || !toolNameMap.has(part.tool_name)) return part;
    const name = toolNameMap.get(part.tool_name);
    if (name === part.tool_name) return part;
    changed = true;
    return { ...part, tool_name: name };
  });
  if (!changed) return block;
  return { ...block, content: Array.isArray(block.content)
    ? renamed : { ...block.content, tool_references: renamed } };
}
