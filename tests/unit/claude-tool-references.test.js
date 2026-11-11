import { describe, expect, it } from "vitest";
import { cloakClaudeTools, decloakStreamChunk, decloakToolNames } from "../../open-sse/utils/claudeCloaking.js";
import { compressSingleToolName, compressToolNames, MAX_TOOL_NAME_LENGTH } from "../../open-sse/utils/toolCompressor.js";
import { CLAUDE_TOOL_SUFFIX } from "../../open-sse/config/appConstants.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest } from "../../open-sse/translator/index.js";

const reference = name => ({ type: "tool_reference", tool_name: name });
const clientResult = names => ({ type: "tool_result", tool_use_id: "toolu_search", content: names.map(reference) });
const nativeResult = names => ({ type: "tool_search_tool_result", tool_use_id: "srvtoolu_search", content: { type: "tool_search_tool_search_result", tool_references: names.map(reference) } });
const references = block => Array.isArray(block.content) ? block.content : block.content.tool_references;
const definition = name => ({ name, defer_loading: true, input_schema: { type: "object", properties: {} } });

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe("Claude deferred tool references follow request-local aliases", () => {
  it.each([clientResult, nativeResult])("renames references in %s without changing unrelated data or frozen input", makeResult => {
    const result = makeResult(["lookup", "web_search", "historical"]);
    const arbitrary = { type: "tool_reference", tool_name: "lookup" };
    const untouched = [
      { type: "tool_use", id: "toolu_opaque", name: "historical", input: { result: result, reference: arbitrary } },
      { type: "web_fetch_tool_result", content: { url_sources: [{ type: "tool_reference", name: "lookup" }], reference: arbitrary } },
      { type: "tool_result", tool_use_id: "toolu_application", content: { result, reference: arbitrary } },
      { type: "text", text: JSON.stringify(result) },
      { type: "thinking", thinking: "original", signature: "opaque-provider-signature" },
      { type: "redacted_thinking", data: "opaque-redaction" },
    ];
    const source = deepFreeze({ tools: [definition("lookup"), { type: "web_search_20250305", name: "web_search" }], messages: [{ role: "user", content: [result, ...untouched] }] });
    const before = structuredClone(source);
    const { body, toolNameMap } = cloakClaudeTools(source);
    const alias = body.tools[0].name;
    expect(references(body.messages[0].content[0])).toEqual([reference(alias), reference("web_search"), reference("historical")]);
    expect(body.messages[0].content.slice(1)).toEqual(untouched);
    expect(toolNameMap.get(alias)).toBe("lookup");
    expect(source).toEqual(before);
  });

  it.each([clientResult, nativeResult])("reserves undeclared historical references in %s before choosing OAuth aliases", makeResult => {
    const reserved = `lookup${CLAUDE_TOOL_SUFFIX}`;
    const source = deepFreeze({ tools: [definition("lookup")], messages: [{ role: "user", content: [makeResult(["lookup", reserved])] }] });
    const { body, toolNameMap } = cloakClaudeTools(source);
    const alias = body.tools[0].name;
    expect(alias).not.toBe(reserved);
    expect(references(body.messages[0].content[0])).toEqual([reference(alias), reference(reserved)]);
    expect(toolNameMap.has(reserved)).toBe(false);
  });

  it.each([clientResult, nativeResult])("restores references in %s on JSON and native stream responses using only the request map", makeResult => {
    const map = new Map([["lookup_ide", "lookup"]]);
    const result = makeResult(["lookup_ide", "unknown_ide"]);
    const source = deepFreeze({ type: "message", content: [result, { type: "thinking", thinking: "", signature: "opaque" }] });
    const original = structuredClone(source);
    const restored = decloakToolNames(source, map);
    expect(references(restored.content[0])).toEqual([reference("lookup"), reference("unknown_ide")]);
    expect(restored.content[1]).toBe(source.content[1]);
    const event = deepFreeze({ type: "content_block_start", index: 1, content_block: result });
    expect(references(decloakStreamChunk(event, map).content_block)).toEqual([reference("lookup"), reference("unknown_ide")]);
    expect(source).toEqual(original);
    expect(decloakToolNames(source, null)).toBe(source);
    expect(decloakStreamChunk(event, null)).toBe(event);
  });
});

describe("Claude deferred references follow long-name compression", () => {
  const longName = `mcp__fixture__${"long_tool_name_".repeat(7)}`;

  it.each([clientResult, nativeResult])("compresses declared names and exact references together in %s", makeResult => {
    const source = deepFreeze({ tools: [definition(longName)], messages: [{ role: "user", content: [makeResult([longName, "historical"])] }] });
    const before = structuredClone(source);
    const { body, toolNameMap } = compressToolNames(FORMATS.CLAUDE, source);
    const short = body.tools[0].name;
    expect(short.length).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH);
    expect(references(body.messages[0].content[0])).toEqual([reference(short), reference("historical")]);
    expect(toolNameMap.get(short)).toBe(longName);
    expect(source).toEqual(before);
  });

  it.each(["declaration", "historical reference", "historical call"])("avoids a generated short name already owned by a %s", owner => {
    const reserved = compressSingleToolName(longName);
    const source = deepFreeze({
      tools: [definition(longName), ...(owner === "declaration" ? [definition(reserved)] : [])],
      messages: [{ role: "assistant", content: [
        clientResult([longName, ...(owner === "historical reference" ? [reserved] : [])]),
        ...(owner === "historical call" ? [{ type: "tool_use", id: "toolu_old", name: reserved, input: {} }] : []),
      ] }],
    });
    const { body, toolNameMap } = compressToolNames(FORMATS.CLAUDE, source);
    const short = body.tools[0].name;
    expect(short).not.toBe(reserved);
    expect(toolNameMap.get(short)).toBe(longName);
    expect(toolNameMap.has(reserved)).toBe(false);
    expect(references(body.messages[0].content[0])[0]).toEqual(reference(short));
    if (owner === "declaration") expect(body.tools[1].name).toBe(reserved);
    if (owner === "historical reference") expect(references(body.messages[0].content[0])[1]).toEqual(reference(reserved));
    if (owner === "historical call") expect(body.messages[0].content[1].name).toBe(reserved);
  });

  it("uses one final wire name after compression and OAuth aliasing while preserving borrowed signed history", () => {
    const thinking = { type: "thinking", thinking: "original signed thought", signature: "original-opaque-signature" };
    const source = deepFreeze({
      model: "claude-sonnet-4-6", max_tokens: 2048, thinking: { type: "adaptive" },
      tools: [definition(longName)], tool_choice: { type: "tool", name: longName },
      messages: [
        { role: "assistant", content: [thinking, { type: "tool_use", id: "toolu_search", name: longName, input: {} }] },
        { role: "user", content: [clientResult([longName]), nativeResult([longName])] },
      ],
    });
    const before = structuredClone(source);
    const sent = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, source.model, source, false, { accessToken: "sk-ant-oat-fixture" }, "claude");
    const alias = sent.tools[0].name;
    expect(alias).not.toBe(longName);
    expect(alias.length).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH);
    expect(sent.tool_choice.name).toBe(alias);
    expect(sent.messages[0].content[0]).toEqual(thinking);
    expect(sent.messages[0].content[1].name).toBe(alias);
    for (const block of sent.messages[1].content) expect(references(block)).toEqual([reference(alias)]);
    expect(sent._toolNameMap.get(alias)).toBe(longName);
    expect(source).toEqual(before);
  });
});
