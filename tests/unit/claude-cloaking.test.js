/**
 * Unit tests for open-sse/utils/claudeCloaking.js
 *
 * Tests cover:
 *  - cloakClaudeTools() - tool renaming and forced tool_choice suffixing
 *  - decloakStreamChunk() - restoring tool names in streamed Claude SSE events
 */

import { describe, it, expect } from "vitest";
import { cloakClaudeTools, decloakStreamChunk, decloakToolNames } from "../../open-sse/utils/claudeCloaking.js";
import { CLAUDE_TOOL_SUFFIX } from "../../open-sse/config/appConstants.js";
import { MAX_TOOL_NAME_LENGTH } from "../../open-sse/utils/toolCompressor.js";

describe("cloakClaudeTools", () => {
  const baseBody = {
    tools: [{ name: "todo_write", description: "write todos", input_schema: { type: "object", properties: {} } }],
    messages: [{ role: "user", content: [{ type: "text", text: "add a todo" }] }]
  };

  it("advertises only caller tools and leaves unrelated historical/server tool names unchanged", () => {
    const source = {
      tools: [...baseBody.tools, { type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "assistant", content: [
        { type: "tool_use", id: "client", name: "todo_write", input: {} },
        { type: "tool_use", id: "historical", name: "old_tool", input: {} },
        { type: "tool_use", id: "builtin", name: "web_search", input: {} },
        { type: "server_tool_use", id: "server", name: "web_search", input: {} },
      ] }],
    };
    const original = structuredClone(source);
    const { body, toolNameMap } = cloakClaudeTools(source);
    expect(body.tools).toHaveLength(2);
    expect(body.tools.map(tool => tool.name)).toEqual([`todo_write${CLAUDE_TOOL_SUFFIX}`, "web_search"]);
    expect(body.messages[0].content.map(block => block.name)).toEqual([`todo_write${CLAUDE_TOOL_SUFFIX}`, "old_tool", "web_search", "web_search"]);
    expect([...toolNameMap]).toEqual([[`todo_write${CLAUDE_TOOL_SUFFIX}`, "todo_write"]]);
    expect(source).toEqual(original);
  });

  it("keeps aliases within the wire limit and distinct from caller and built-in declarations", () => {
    const longName = "x".repeat(MAX_TOOL_NAME_LENGTH);
    const input = {
      tools: [{ name: longName }, { name: "lookup" }, { type: "server_tool", name: `lookup${CLAUDE_TOOL_SUFFIX}` }],
      tool_choice: { type: "tool", name: longName },
      messages: [{ role: "assistant", content: [{ type: "tool_use", id: "long", name: longName, input: {} }] }],
    };
    const { body, toolNameMap } = cloakClaudeTools(input);
    expect(new Set(body.tools.map(tool => tool.name)).size).toBe(3);
    expect(body.tools.every(tool => tool.name.length <= MAX_TOOL_NAME_LENGTH)).toBe(true);
    expect(body.tools[2]).toEqual(input.tools[2]);
    expect(body.tool_choice.name).toBe(body.tools[0].name);
    expect(body.messages[0].content[0].name).toBe(body.tools[0].name);
    expect(toolNameMap.get(body.tools[0].name)).toBe(longName);
    expect(toolNameMap.get(body.tools[1].name)).toBe("lookup");
    expect(decloakStreamChunk({ type: "content_block_start", content_block: { type: "tool_use", name: body.tools[0].name } }, toolNameMap).content_block.name).toBe(longName);
  });

  it("reserves an unchanged historical tool name before allocating a current tool alias", () => {
    const nativeName = `lookup${CLAUDE_TOOL_SUFFIX}`;
    const input = {
      tools: [{ name: "lookup", input_schema: { type: "object", properties: {} } }],
      tool_choice: { type: "tool", name: "lookup" },
      messages: [{ role: "assistant", content: [
        { type: "tool_use", id: "current", name: "lookup", input: {} },
        { type: "tool_use", id: "historical", name: nativeName, input: {} },
      ] }],
    };
    const original = structuredClone(input);
    const { body, toolNameMap } = cloakClaudeTools(input);
    const alias = body.tools[0].name;
    expect(alias).not.toBe(nativeName);
    expect(body.tool_choice.name).toBe(alias);
    expect(body.messages[0].content.map(block => block.name)).toEqual([alias, nativeName]);
    expect([...toolNameMap]).toEqual([[alias, "lookup"]]);
    const response = { content: body.messages[0].content };
    expect(decloakToolNames(response, toolNameMap).content.map(block => block.name)).toEqual(["lookup", nativeName]);
    for (const [wireName, restoredName] of [[alias, "lookup"], [nativeName, nativeName]]) {
      expect(decloakStreamChunk({ type: "content_block_start", content_block: { type: "tool_use", name: wireName } }, toolNameMap).content_block.name).toBe(restoredName);
    }
    expect(input).toEqual(original);
  });

  it("suffixes client tool names and maps them back", () => {
    const { body, toolNameMap } = cloakClaudeTools(baseBody);
    const suffixed = `todo_write${CLAUDE_TOOL_SUFFIX}`;
    expect(body.tools.find(t => t.name === suffixed)).toBeDefined();
    expect(toolNameMap.get(suffixed)).toBe("todo_write");
  });

  it("suffixes a forced tool_choice to match the renamed tool", () => {
    const { body } = cloakClaudeTools({
      ...baseBody,
      tool_choice: { type: "tool", name: "todo_write" }
    });
    // Without this, Claude rejects: "Tool 'todo_write' not found in provided tools".
    expect(body.tool_choice).toEqual({ type: "tool", name: `todo_write${CLAUDE_TOOL_SUFFIX}` });
  });

  it("suffixes only the chosen tool when several are present", () => {
    const { body } = cloakClaudeTools({
      tools: [
        { name: "search", input_schema: { type: "object", properties: {} } },
        { name: "todo_write", input_schema: { type: "object", properties: {} } }
      ],
      tool_choice: { type: "tool", name: "todo_write" }
    });
    expect(body.tool_choice).toEqual({ type: "tool", name: `todo_write${CLAUDE_TOOL_SUFFIX}` });
  });

  it("leaves non-forced tool_choice untouched", () => {
    const auto = cloakClaudeTools({ ...baseBody, tool_choice: { type: "auto" } });
    expect(auto.body.tool_choice).toEqual({ type: "auto" });

    const none = cloakClaudeTools({ ...baseBody });
    expect(none.body.tool_choice).toBeUndefined();
  });

  it("does not suffix a forced choice that targets an undeclared or built-in tool", () => {
    // A declaration outside the request-local client map cannot be renamed.
    const { body } = cloakClaudeTools({ ...baseBody, tool_choice: { type: "tool", name: "Bash" } });
    expect(body.tool_choice).toEqual({ type: "tool", name: "Bash" });
  });

  it("renames tool_use names in message history", () => {
    const { body } = cloakClaudeTools({
      ...baseBody,
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "todo_write", input: {} }] }
      ]
    });
    const block = body.messages[0].content[0];
    expect(block.name).toBe(`todo_write${CLAUDE_TOOL_SUFFIX}`);
  });

  it("returns the body unchanged when there are no tools", () => {
    const input = { messages: [{ role: "user", content: "hi" }], tool_choice: { type: "tool", name: "x" } };
    const { body, toolNameMap } = cloakClaudeTools(input);
    expect(body).toBe(input);
    expect(toolNameMap).toBeNull();
  });
});

describe("decloakStreamChunk", () => {
  // Cloaked exactly as cloakClaudeTools() does on the request side
  const toolNameMap = new Map([["run_code" + CLAUDE_TOOL_SUFFIX, "run_code"]]);

  const toolUseStart = (name) => ({
    type: "content_block_start",
    index: 1,
    content_block: { type: "tool_use", id: "toolu_01abc", name, input: {} }
  });

  it("restores the original name on a tool_use content_block_start", () => {
    const out = decloakStreamChunk(toolUseStart("run_code" + CLAUDE_TOOL_SUFFIX), toolNameMap);
    expect(out.content_block.name).toBe("run_code");
  });

  it("does not mutate the input chunk", () => {
    const chunk = toolUseStart("run_code" + CLAUDE_TOOL_SUFFIX);
    decloakStreamChunk(chunk, toolNameMap);
    expect(chunk.content_block.name).toBe("run_code" + CLAUDE_TOOL_SUFFIX);
  });

  it("passes through names the map does not know", () => {
    const chunk = toolUseStart("Bash");
    expect(decloakStreamChunk(chunk, toolNameMap)).toBe(chunk);
  });

  it("passes through non-tool_use events unchanged", () => {
    const textStart = { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
    expect(decloakStreamChunk(textStart, toolNameMap)).toBe(textStart);

    const delta = { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{}" } };
    expect(decloakStreamChunk(delta, toolNameMap)).toBe(delta);
  });

  it("tolerates null chunks and missing maps (stream flush path)", () => {
    expect(decloakStreamChunk(null, toolNameMap)).toBeNull();
    expect(decloakStreamChunk(toolUseStart("uncloaked_tool"), null).content_block.name).toBe("uncloaked_tool");
  });
});
