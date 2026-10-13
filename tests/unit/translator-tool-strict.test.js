// 9router #4607 / #4543: explicit `strict` flags on function tools must
// survive translation. Three code paths rebuilt tool declarations without
// copying strict: claude→openai (request), and the Codex flattener for both
// flat Responses and nested Chat Completions declarations. openai→claude and
// openai↔responses already preserved it.
import { describe, expect, it } from "vitest";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.js";
import { claudeToOpenAIRequest } from "../../open-sse/translator/request/claude-to-openai.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";

describe("tool strict translation (#4607/#4543)", () => {
  it.each([true, false, undefined])("preserves OpenAI strict:%s on Claude tools", (strict) => {
    const functionTool = { name: "probe", parameters: { type: "object", properties: {} } };
    if (strict !== undefined) functionTool.strict = strict;
    const result = openaiToClaudeRequest("claude-sonnet-4-6", {
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: functionTool }],
    }, false);
    expect(result.tools[0].strict).toBe(strict);
    if (strict === undefined) expect(result.tools[0]).not.toHaveProperty("strict");
  });

  it.each([true, false, undefined])("preserves Claude strict:%s on OpenAI tools", (strict) => {
    const tool = { name: "probe", input_schema: { type: "object", properties: {} } };
    if (strict !== undefined) tool.strict = strict;
    const result = claudeToOpenAIRequest("gpt-5.5", {
      messages: [{ role: "user", content: "hi" }], tools: [tool],
    }, false);
    expect(result.tools[0].function.strict).toBe(strict);
    if (strict === undefined) expect(result.tools[0].function).not.toHaveProperty("strict");
  });

  it.each([true, false, undefined])("preserves nested Chat-Completions strict:%s through the Codex flattener", (strict) => {
    const executor = new CodexExecutor();
    const functionTool = { name: "probe", parameters: { type: "object", properties: { sessionID: { type: "string" } } } };
    if (strict !== undefined) functionTool.strict = strict;
    const body = {
      model: "gpt-6-sol",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
      tools: [{ type: "function", function: functionTool }],
    };
    executor.transformRequest("gpt-6-sol", body, true, { providerSpecificData: {} });
    const flattened = body.tools[0];
    expect(flattened.name).toBe("probe");
    if (strict === undefined) {
      expect(flattened).not.toHaveProperty("strict");
    } else {
      expect(flattened.strict).toBe(strict);
    }
  });

  it.each([true, false, undefined])("preserves flat Responses strict:%s through the Codex flattener", (strict) => {
    const executor = new CodexExecutor();
    const tool = { type: "function", name: "probe", parameters: { type: "object", properties: {} } };
    if (strict !== undefined) tool.strict = strict;
    const body = {
      model: "gpt-6-sol",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
      tools: [tool],
    };
    executor.transformRequest("gpt-6-sol", body, true, { providerSpecificData: {} });
    const flattened = body.tools[0];
    expect(flattened.name).toBe("probe");
    if (strict === undefined) {
      expect(flattened).not.toHaveProperty("strict");
    } else {
      expect(flattened.strict).toBe(strict);
    }
  });
});
