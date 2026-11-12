import { describe, expect, it } from "vitest";
import { compressSingleToolName, compressToolNames, decloakOpenAIChunk } from "../../open-sse/utils/toolCompressor.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const name = `mcp__fixture__${"response_tool_".repeat(8)}`;
const candidate = compressSingleToolName(name);
const definition = (type, toolName = name) => ({ type, name: toolName, ...(type === "function"
  ? { parameters: { type: "object", properties: {} } } : { format: { type: "text" } }) });
const call = (type, toolName = name, extra = {}) => ({ type: `${type}_call`, call_id: "call_opaque", name: toolName,
  ...(type === "function" ? { arguments: JSON.stringify({ name }) } : { input: `literal ${name}` }), ...extra });
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

describe("Responses tool-name compression preserves typed history ownership", () => {
  it.each(["function", "custom_tool"])("renames %s calls, optional output names and flat choices with declarations", type => {
    const toolType = type === "function" ? "function" : "custom";
    const reasoning = { type: "reasoning", id: "rs_original", encrypted_content: "opaque+/=", summary: [] };
    const output = { type: `${type}_call_output`, call_id: "call_opaque", name,
      output: { type: `${type}_call`, name, data: "application JSON must remain literal" } };
    const source = freeze({ tools: [definition(toolType)], input: [reasoning, call(type), output], tool_choice: { type: toolType, name } });
    const before = structuredClone(source);
    const result = compressToolNames(FORMATS.OPENAI_RESPONSES, source);
    const alias = result.body.tools[0].name;
    expect(alias.length).toBeLessThanOrEqual(64);
    expect(result.body.input[1]).toEqual({ ...before.input[1], name: alias });
    expect(result.body.input[2]).toEqual({ ...before.input[2], name: alias });
    expect(result.body.tool_choice).toEqual({ type: toolType, name: alias });
    expect(result.body.input[0]).toBe(reasoning);
    expect(result.body.input[2].output).toBe(output.output);
    expect(result.toolNameMap.get(alias)).toBe(name);
    expect(source).toEqual(before);
  });

  it.each(["function", "custom_tool"])("reserves an unchanged historical %s name before allocating an alias", type => {
    const source = freeze({ tools: [definition("function")], input: [call(type, candidate), call("function")] });
    const { body, toolNameMap } = compressToolNames(FORMATS.OPENAI_RESPONSES, source);
    const alias = body.tools[0].name;
    expect(alias).not.toBe(candidate);
    expect(body.input[0]).toBe(source.input[0]);
    expect(body.input[1].name).toBe(alias);
    expect(toolNameMap.has(candidate)).toBe(false);
  });

  it("allocates incremental declarations before preceding calls and reserves their short names", () => {
    const source = freeze({ input: [call("function"), { type: "additional_tools", tools: [definition("function"), definition("custom", candidate)] }], tool_choice: { type: "function", name } });
    const before = structuredClone(source);
    const { body, toolNameMap } = compressToolNames(FORMATS.OPENAI_RESPONSES, source);
    const alias = body.input[1].tools[0].name;
    expect(alias).not.toBe(name);
    expect(alias).not.toBe(candidate);
    expect(body.input[0].name).toBe(alias);
    expect(body.input[1].tools[1]).toBe(source.input[1].tools[1]);
    expect(body.tool_choice.name).toBe(alias);
    expect(body).not.toHaveProperty("tools");
    expect(toolNameMap.get(alias)).toBe(name);
    expect(source).toEqual(before);
  });

  it("does not capture an undeclared forced choice with a generated alias", () => {
    const source = freeze({ tools: [definition("function")], input: [call("function")], tool_choice: { type: "function", name: candidate } });
    const { body, toolNameMap } = compressToolNames(FORMATS.OPENAI_RESPONSES, source);
    expect(body.tools[0].name).not.toBe(candidate);
    expect(body.tool_choice).toBe(source.tool_choice);
    expect(toolNameMap.has(candidate)).toBe(false);
  });

  it("keeps namespace-owned declarations, calls and choices outside the global alias map", () => {
    const namespace = { type: "namespace", name: "functions", tools: [definition("function")] };
    const source = freeze({ tools: [definition("function"), namespace], input: [call("function", name, { namespace: "functions" }), call("function")], tool_choice: { type: "function", name, namespace: "functions" } });
    const { body } = compressToolNames(FORMATS.OPENAI_RESPONSES, source);
    expect(body.tools[1]).toBe(namespace);
    expect(body.input[0]).toBe(source.input[0]);
    expect(body.input[1].name).toBe(body.tools[0].name);
    expect(body.tool_choice).toBe(source.tool_choice);
  });

  it("keeps native namespaced response items unchanged when their local name matches a global alias", () => {
    const owned = freeze(call("function", candidate, { namespace: "functions" }));
    const source = freeze({ output: [owned, call("custom_tool", candidate)] });
    const restored = decloakOpenAIChunk(source, new Map([[candidate, name]]));
    expect(restored.output[0]).toBe(owned);
    expect(restored.output[1].name).toBe(name);
  });

  it("preserves an output's namespace ownership inherited from its matching call_id", () => {
    const localCall = call("function", name, { namespace: "functions", call_id: "call_namespaced" });
    const output = { type: "function_call_output", call_id: "call_namespaced", name, output: "ok" };
    const source = freeze({ tools: [definition("function"), { type: "namespace", name: "functions", tools: [definition("function")] }], input: [localCall, output] });
    const { body } = compressToolNames(FORMATS.OPENAI_RESPONSES, source);
    expect(body.tools[0].name).not.toBe(name);
    expect(body.input[0]).toBe(localCall);
    expect(body.input[1]).toBe(output);
  });

  it("reserves namespace-local declarations even before their first invocation", () => {
    const namespace = { type: "namespace", name: "functions", tools: [definition("custom", candidate)] };
    const source = freeze({ tools: [definition("function"), namespace], input: [] });
    const { body, toolNameMap } = compressToolNames(FORMATS.OPENAI_RESPONSES, source);
    expect(body.tools[0].name).not.toBe(candidate);
    expect(body.tools[1]).toBe(namespace);
    expect(toolNameMap.has(candidate)).toBe(false);
  });

  it("restores global response names while preserving paired namespace-owned output names", () => {
    const localCall = freeze(call("function", candidate, { namespace: "functions", call_id: "call_namespaced" }));
    const localOutput = freeze({ type: "function_call_output", call_id: "call_namespaced", name: candidate, output: "literal" });
    const source = freeze({ output: [localCall, localOutput, call("function", candidate)] });
    const restored = decloakOpenAIChunk(source, new Map([[candidate, name]]));
    expect(restored.output[0]).toBe(localCall);
    expect(restored.output[1]).toBe(localOutput);
    expect(restored.output[2].name).toBe(name);
  });

  it("renames typed allowed_tools entries and reserves unchanged allowlist identities", () => {
    const opaque = { type: "mcp", server_label: "owned-server", name };
    const namespaced = { type: "function", name, namespace: "functions" };
    const source = freeze({ tools: [definition("function")], input: [call("function")], tool_choice: {
      type: "allowed_tools", mode: "required", tools: [{ type: "function", name }, { type: "custom", name: candidate }, opaque, namespaced],
    } });
    const { body, toolNameMap } = compressToolNames(FORMATS.OPENAI_RESPONSES, source);
    const alias = body.tools[0].name;
    expect(alias).not.toBe(candidate);
    expect(body.tool_choice.tools[0]).toEqual({ type: "function", name: alias });
    expect(body.tool_choice.tools.slice(1)).toEqual(source.tool_choice.tools.slice(1));
    expect(body.tool_choice.tools[2]).toBe(opaque);
    expect(body.tool_choice.tools[3]).toBe(namespaced);
    expect(body.tool_choice.mode).toBe("required");
    expect(toolNameMap.has(candidate)).toBe(false);
  });

  it.each([
    [FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES],
    [FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI],
    [FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES],
    [FORMATS.CODEX, FORMATS.CODEX],
  ])("uses one alias through the public %s-to-%s preparation", (sourceFormat, target) => {
    const source = freeze({ model: "gpt-4o", tools: [definition("function")], input: [call("function"), { type: "function_call_output", call_id: "call_opaque", output: "ok" }], tool_choice: { type: "function", name } });
    const before = structuredClone(source);
    const wire = translateRequest(sourceFormat, target, source.model, source, false, { apiKey: "synthetic" }, "openai");
    const alias = target === FORMATS.OPENAI ? wire.tools[0].function.name : wire.tools[0].name;
    if (target === FORMATS.OPENAI) {
      expect(wire.messages.find(message => message.tool_calls)?.tool_calls[0].function.name).toBe(alias);
      expect(wire.tool_choice.function.name).toBe(alias);
    } else {
      expect(wire.input[0].name).toBe(alias);
      expect(wire.tool_choice.name).toBe(alias);
    }
    expect(wire._toolNameMap.get(alias)).toBe(name);
    expect(source).toEqual(before);
  });
});
