import { describe, expect, it } from "vitest";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { convertResponsesApiFormat } from "../../open-sse/translator/formats/responsesApi.js";
import { getModelTargetFormat } from "../../open-sse/config/providerModels.js";
import { getTargetFormat } from "../../open-sse/services/provider.js";

const answerSchema = {
  type: "object",
  properties: { enabled: { type: "boolean" }, count: { type: "integer", minimum: 0 } },
  required: ["enabled", "count"],
  additionalProperties: false,
};
const toolSchema = {
  type: "object",
  properties: { query: { type: "string" } },
  required: ["query"],
  additionalProperties: false,
};
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const imageUrl = `data:image/png;base64,${png}`;
const chatTools = () => [{ type: "function", function: { name: "lookup", description: "Find a record", parameters: structuredClone(toolSchema), strict: false } }];
const claudeTools = () => [{ name: "lookup", description: "Find a record", input_schema: structuredClone(toolSchema), strict: false }];
const geminiTools = () => [{ functionDeclarations: [{ name: "lookup", description: "Find a record", parametersJsonSchema: structuredClone(toolSchema) }] }];
const chat = (extra = {}) => ({ messages: [{ role: "user", content: "Return the result as JSON." }], ...extra });
const claude = (extra = {}) => ({ max_tokens: 31, messages: [{ role: "user", content: [{ type: "text", text: "Return the result as JSON." }] }], ...extra });
const gemini = (extra = {}) => ({ contents: [{ role: "user", parts: [{ text: "Return the result as JSON." }] }], ...extra });
const responses = (extra = {}) => ({ input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Return the result as JSON." }] }], ...extra });

function translate(source, target, body, { model, provider } = {}) {
  const targetModel = model || (target === FORMATS.CLAUDE ? "claude-sonnet-4-6"
    : [FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY, FORMATS.VERTEX].includes(target) ? "gemini-2.5-flash" : "gpt-4.1");
  const targetProvider = provider || (target === FORMATS.CLAUDE ? "claude" : target === FORMATS.OPENAI_RESPONSES ? "openai" : target);
  return translateRequest(source, target, targetModel, body, false,
    { projectId: "request-contract-project", connectionId: "request-contract-session" }, targetProvider);
}

const googleSources = [
  { name: "Gemini", format: FORMATS.GEMINI, wrap: (request) => request },
  { name: "Antigravity", format: FORMATS.ANTIGRAVITY, wrap: (request) => ({ project: "request-contract-project", userAgent: "antigravity", request }) },
  { name: "Gemini CLI envelope", format: FORMATS.GEMINI_CLI, wrap: (request) => ({ project: "request-contract-project", userAgent: "gemini-cli", request }) },
];
const googleTargets = [
  { name: "Gemini", format: FORMATS.GEMINI, model: "gemini-2.5-flash" },
  { name: "Gemini CLI", format: FORMATS.GEMINI_CLI, model: "gemini-2.5-flash" },
  { name: "Antigravity Gemini", format: FORMATS.ANTIGRAVITY, model: "gemini-2.5-flash" },
  { name: "Antigravity Claude", format: FORMATS.ANTIGRAVITY, model: "claude-sonnet-4-6" },
  { name: "Vertex", format: FORMATS.VERTEX, model: "gemini-2.5-flash" },
];
const googleRequest = (body) => body.request || body;
const claudeText = (body) => (Array.isArray(body.system) ? body.system.map((part) => part.text).join("\n") : body.system || "");
const contentText = (content) => typeof content === "string" ? [content] : (content || []).filter((part) => ["text", "input_text", "output_text"].includes(part.type)).map((part) => part.text);
const instructionTexts = (body) => [
  ...(body.instructions === undefined ? [] : [body.instructions]),
  ...(body.input || []).filter((item) => item.role === "system" || item.role === "developer").flatMap((item) => contentText(item.content)),
].filter((value) => value !== "");

// Expectations are native wire contracts, not equivalence claims for vendor-only
// controls: e.g. Gemini has no disable_parallel_tool_use or tool-level strict.
describe.each(googleSources)("$name -> OpenAI request contracts", (source) => {
  it("preserves zero sampling/seed, stop sequences and the explicit output ceiling", () => {
    const body = source.wrap(gemini({
      generationConfig: { temperature: 0, topP: 0, seed: 0, stopSequences: ["END", "STOP"], maxOutputTokens: 31 },
      systemInstruction: { parts: [{ text: "First policy." }, { text: "Second policy." }] },
    }));
    const before = structuredClone(body);
    const wire = translate(source.format, FORMATS.OPENAI, body);
    expect(wire).toMatchObject({ temperature: 0, top_p: 0, seed: 0, stop: ["END", "STOP"], max_tokens: 31 });
    expect(wire.messages).toEqual([
      { role: "system", content: "First policy.Second policy." },
      { role: "user", content: "Return the result as JSON." },
    ]);
    expect(body).toEqual(before);
  });

  it("preserves native JSON Schema output and function input schemas without substituting empty objects", () => {
    const body = source.wrap(gemini({
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: structuredClone(answerSchema) },
      tools: geminiTools(),
    }));
    const wire = translate(source.format, FORMATS.OPENAI, body);
    expect(wire.response_format?.type).toBe("json_schema");
    expect(wire.response_format?.json_schema?.schema).toEqual(answerSchema);
    expect(wire.tools?.[0]?.function).toMatchObject({ name: "lookup", description: "Find a record", parameters: toolSchema });
  });

  it("maps native JSON MIME mode without inventing a schema", () => {
    const wire = translate(source.format, FORMATS.OPENAI, source.wrap(gemini({ generationConfig: { responseMimeType: "application/json" } })));
    expect(wire.response_format).toEqual({ type: "json_object" });
  });

  it("converts the legacy uppercase Schema dialect to JSON Schema rather than forwarding proto-only nullable", () => {
    const wire = translate(source.format, FORMATS.OPENAI, source.wrap(gemini({
      generationConfig: { responseMimeType: "application/json", responseSchema: {
        type: "OBJECT", properties: { value: { type: "STRING", nullable: true } }, required: ["value"],
      } },
      tools: [{ functionDeclarations: [{ name: "lookup", description: "Find a record", parameters: {
        type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"],
      } }] }],
    })));
    expect(wire.response_format?.json_schema?.schema).toEqual({
      type: "object", properties: { value: { type: ["string", "null"] } }, required: ["value"],
    });
    expect(wire.tools?.[0]?.function?.parameters).toEqual({ type: "object", properties: { query: { type: "string" } }, required: ["query"] });
  });

  it.each([
    ["NONE", undefined, "none"],
    ["AUTO", undefined, "auto"],
    ["ANY", undefined, "required"],
    ["ANY", ["lookup"], { type: "function", function: { name: "lookup" } }],
    ["VALIDATED", undefined, "auto"],
  ])("maps native %s (%j) without forcing an explicitly disabled/optional tool", (mode, allowedFunctionNames, expected) => {
    const config = { mode, ...(allowedFunctionNames ? { allowedFunctionNames } : {}) };
    const wire = translate(source.format, FORMATS.OPENAI, source.wrap(gemini({ tools: geminiTools(), toolConfig: { functionCallingConfig: config } })));
    expect(wire.tool_choice).toEqual(expected);
  });
});

describe.each(googleTargets)("OpenAI -> $name request contracts", (target) => {
  it.each([
    ["none", { mode: "NONE" }],
    ["auto", { mode: "AUTO" }],
    ["required", { mode: "ANY" }],
    [{ type: "function", function: { name: "lookup" } }, { mode: "ANY", allowedFunctionNames: ["lookup"] }],
  ])("honors explicit tool_choice %j across the final envelope", (toolChoice, expected) => {
    const body = chat({ tools: chatTools(), tool_choice: toolChoice });
    const before = structuredClone(body);
    const wire = googleRequest(translate(FORMATS.OPENAI, target.format, body, target));
    expect(wire.toolConfig?.functionCallingConfig).toEqual(expected);
    expect(body).toEqual(before);
  });

  it("retains developer instructions as instructions, never as assistant text or a discarded role", () => {
    const wire = googleRequest(translate(FORMATS.OPENAI, target.format, chat({ messages: [
      { role: "system", content: "Policy one." },
      { role: "developer", content: [{ type: "text", text: "Policy two." }] },
      { role: "user", content: "Question." },
    ] }), target));
    expect(wire.systemInstruction?.parts.map((part) => part.text).join("\n")).toContain("Policy one.");
    expect(wire.systemInstruction?.parts.map((part) => part.text).join("\n")).toContain("Policy two.");
    expect(wire.contents.flatMap((item) => item.parts).some((part) => part.text === "Policy two.")).toBe(false);
  });

  it("does not replace a valid zero temperature with an envelope default", () => {
    const wire = googleRequest(translate(FORMATS.OPENAI, target.format, chat({ temperature: 0, max_completion_tokens: null, max_tokens: 31 }), target));
    expect(wire.generationConfig.temperature).toBe(0);
    expect(wire.generationConfig.maxOutputTokens).toBe(31);
  });
});

describe("OpenAI -> native Gemini structured output", () => {
  it("uses the native JSON Schema field without applying the lossy Cloud Code proto cleaner", () => {
    const schema = {
      type: "object", properties: { payload: { $ref: "#/$defs/payload" } },
      $defs: { payload: { type: "object", properties: { count: { type: "integer", minimum: 0 } }, required: ["count"], additionalProperties: false } },
      required: ["payload"], additionalProperties: false,
    };
    const body = chat({ response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema } },
      tools: [{ type: "function", function: { name: "lookup", description: "Find a record", parameters: structuredClone(schema), strict: true } }] });
    const before = structuredClone(body);
    const wire = translate(FORMATS.OPENAI, FORMATS.GEMINI, body, { model: "gemini-3.1-pro-preview" });
    expect(wire.generationConfig.responseMimeType).toBe("application/json");
    expect(wire.generationConfig.responseJsonSchema).toEqual(schema);
    expect(wire.generationConfig).not.toHaveProperty("responseSchema");
    expect(wire.tools[0].functionDeclarations[0].parametersJsonSchema).toEqual(schema);
    expect(wire.tools[0].functionDeclarations[0]).not.toHaveProperty("parameters");
    expect(wire.tools[0].functionDeclarations[0]).not.toHaveProperty("strict");
    expect(body).toEqual(before);
  });

  it("maps JSON object mode without fabricating a schema or a tool requirement", () => {
    const wire = translate(FORMATS.OPENAI, FORMATS.GEMINI, chat({ response_format: { type: "json_object" } }));
    expect(wire.generationConfig.responseMimeType).toBe("application/json");
    expect(wire.generationConfig).not.toHaveProperty("responseJsonSchema");
    expect(wire).not.toHaveProperty("toolConfig");
  });

  it.each([null, []])("does not fabricate stop sequences from %j", (stop) => {
    const wire = translate(FORMATS.OPENAI, FORMATS.GEMINI, chat({ stop, seed: 0 }));
    expect(wire.generationConfig.seed).toBe(0);
    expect(wire.generationConfig.stopSequences || []).toEqual([]);
  });
});

describe("Claude <-> OpenAI non-reasoning fields", () => {
  it("uses Anthropic's native structured-output contract rather than a schema prompt", () => {
    const body = chat({
      messages: [{ role: "system", content: "Policy one." }, { role: "developer", content: [{ type: "text", text: "Policy two." }] }, { role: "user", content: "Return JSON." }],
      response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: structuredClone(answerSchema) } },
      top_p: 0, temperature: 0, stop: ["END"], user: "opaque-user", max_tokens: 31,
    });
    const before = structuredClone(body);
    const wire = translate(FORMATS.OPENAI, FORMATS.CLAUDE, body);
    expect(wire.output_config?.format).toEqual({ type: "json_schema", schema: answerSchema });
    expect(claudeText(wire)).toContain("Policy one.");
    expect(claudeText(wire)).toContain("Policy two.");
    expect(claudeText(wire)).not.toContain("You must respond with valid JSON that strictly follows this JSON schema");
    expect(wire.messages.flatMap((message) => message.content).some((part) => part.text === "Policy two.")).toBe(false);
    expect(wire).toMatchObject({ temperature: 0, top_p: 0, max_tokens: 31, stop_sequences: ["END"], metadata: { user_id: "opaque-user" } });
    expect(body).toEqual(before);
  });

  it("restores native Anthropic JSON output into a Chat response_format", () => {
    const wire = translate(FORMATS.CLAUDE, FORMATS.OPENAI, claude({
      output_config: { format: { type: "json_schema", schema: structuredClone(answerSchema) } },
      temperature: 0, top_p: 0, stop_sequences: ["END"], metadata: { user_id: "opaque-user" },
    }));
    expect(wire.response_format?.type).toBe("json_schema");
    expect(wire.response_format?.json_schema?.schema).toEqual(answerSchema);
    expect(wire.response_format?.json_schema?.strict).toBe(true);
    expect(wire).toMatchObject({ temperature: 0, top_p: 0, max_tokens: 31, stop: ["END"], user: "opaque-user" });
  });

  it.each([
    ["none", { type: "none" }],
    ["auto", { type: "auto" }],
    ["required", { type: "any" }],
    [{ type: "function", function: { name: "lookup" } }, { type: "tool", name: "lookup" }],
  ])("round-trips supported tool choice %j without changing strict:false", (choice, expected) => {
    const native = translate(FORMATS.OPENAI, FORMATS.CLAUDE, chat({ tools: chatTools(), tool_choice: choice }));
    expect(native.tool_choice).toEqual(expected);
    expect(native.tools[0].strict).toBe(false);
    expect(native.tools[0].input_schema).toEqual(toolSchema);
    const roundTrip = translate(FORMATS.CLAUDE, FORMATS.OPENAI, native);
    expect(roundTrip.tool_choice).toEqual(choice);
    expect(roundTrip.tools[0].function.strict).toBe(false);
    expect(roundTrip.tools[0].function.parameters).toEqual(toolSchema);
  });

  it.each([true, false])("preserves explicit parallel_tool_calls:%s across the inverse native control", (parallel) => {
    const wire = translate(FORMATS.OPENAI, FORMATS.CLAUDE, chat({ tools: chatTools(), tool_choice: "auto", parallel_tool_calls: parallel }));
    expect(wire.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: !parallel });
    const roundTrip = translate(FORMATS.CLAUDE, FORMATS.OPENAI, wire);
    expect(roundTrip.parallel_tool_calls).toBe(parallel);
  });

  it("does not attach a parallel-only option to Anthropic's none tool-choice variant", () => {
    const wire = translate(FORMATS.OPENAI, FORMATS.CLAUDE, chat({ tools: chatTools(), tool_choice: "none", parallel_tool_calls: false }));
    expect(wire.tool_choice).toEqual({ type: "none" });
  });

  it.each([" opaque-user ", "", null])("preserves explicit opaque attribution %j rather than trimming or defaulting it", (user) => {
    const native = translate(FORMATS.OPENAI, FORMATS.CLAUDE, chat({ user }));
    expect(native.metadata).toEqual({ user_id: user });
    const restored = translate(FORMATS.CLAUDE, FORMATS.OPENAI, native);
    expect(restored.user).toBe(user);
  });

  it("keeps omitted parallel and strict controls omitted instead of strengthening them", () => {
    const body = claude({ tools: [{ name: "lookup", input_schema: structuredClone(toolSchema) }], tool_choice: { type: "auto" } });
    const wire = translate(FORMATS.CLAUDE, FORMATS.OPENAI, body);
    expect(wire).not.toHaveProperty("parallel_tool_calls");
    expect(wire.tools[0].function).not.toHaveProperty("strict");
  });
});

describe("Gemini <-> Claude supported pivot fields", () => {
  it("keeps top-k and native JSON constraints on Gemini -> Claude rather than losing them at the OpenAI pivot", () => {
    const wire = translate(FORMATS.GEMINI, FORMATS.CLAUDE, gemini({
      generationConfig: { topK: 19, topP: 0, temperature: 0, maxOutputTokens: 31, stopSequences: ["END"], responseMimeType: "application/json", responseJsonSchema: structuredClone(answerSchema) },
      tools: geminiTools(), toolConfig: { functionCallingConfig: { mode: "NONE" } },
    }));
    expect(wire).toMatchObject({ top_k: 19, top_p: 0, temperature: 0, max_tokens: 31, stop_sequences: ["END"], tool_choice: { type: "none" } });
    expect(wire.output_config?.format).toEqual({ type: "json_schema", schema: answerSchema });
    expect(wire.tools[0].input_schema).toEqual(toolSchema);
  });

  it("keeps top-k, structured output and explicit tool disable on Claude -> Gemini", () => {
    const wire = translate(FORMATS.CLAUDE, FORMATS.GEMINI, claude({
      top_k: 19, top_p: 0, temperature: 0, stop_sequences: ["END"],
      output_config: { format: { type: "json_schema", schema: structuredClone(answerSchema) } },
      tools: claudeTools(), tool_choice: { type: "none" },
    }), { model: "gemini-3.1-pro-preview" });
    expect(wire.generationConfig).toMatchObject({ topK: 19, topP: 0, temperature: 0, maxOutputTokens: 31, stopSequences: ["END"], responseMimeType: "application/json", responseJsonSchema: answerSchema });
    expect(wire.toolConfig?.functionCallingConfig).toEqual({ mode: "NONE" });
    expect(wire.tools[0].functionDeclarations[0].parametersJsonSchema).toEqual(toolSchema);
  });

  it("preserves error meaning, original IDs and image occurrence ownership on repeated Claude/Gemini conversions", () => {
    const body = claude({ tools: claudeTools(), messages: [
      { role: "user", content: "Look up the failure." },
      { role: "assistant", content: [{ type: "tool_use", id: "call_error", name: "lookup", input: { query: "failure" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_error", is_error: true, content: [
        { type: "text", text: "Permission denied" }, { type: "image", source: { type: "base64", media_type: "image/png", data: png } },
      ] }] },
      { role: "user", content: "Keep the original failure and screenshot." },
    ] });
    const before = structuredClone(body);
    let current = body;
    for (let pass = 0; pass < 3; pass++) {
      const native = translate(FORMATS.CLAUDE, FORMATS.GEMINI, current);
      const parts = native.contents.flatMap((turn) => turn.parts);
      expect(parts.filter((part) => part.functionCall).map((part) => part.functionCall.id)).toEqual(["call_error"]);
      expect(parts.filter((part) => part.functionResponse).map((part) => part.functionResponse.id)).toEqual(["call_error"]);
      expect(parts.find((part) => part.functionResponse)?.functionResponse.response.error).toBeDefined();
      expect(JSON.stringify(parts.filter((part) => part.functionResponse).map((part) => part.functionResponse.response))).not.toContain(png);
      expect(JSON.stringify(native).split(png).length - 1).toBe(1);
      current = translate(FORMATS.GEMINI, FORMATS.CLAUDE, native);
      const result = current.messages.flatMap((message) => message.content).find((part) => part.type === "tool_result");
      expect(result.tool_use_id).toBe("call_error");
      expect(result.is_error).toBe(true);
      expect(JSON.stringify(current).split(png).length - 1).toBe(1);
    }
    expect(body).toEqual(before);
  });
});

describe("Chat <-> Responses supported request controls", () => {
  it("preserves every system/developer instruction including structured text and later policy updates", () => {
    const body = chat({ messages: [
      { role: "system", content: "Policy one." },
      { role: "developer", content: [{ type: "text", text: "Policy two." }, { type: "text", text: "Format rule." }] },
      { role: "user", content: "Question." },
      { role: "system", content: "Later policy." },
      { role: "assistant", content: "Acknowledged." },
      { role: "user", content: "Continue." },
    ] });
    const before = structuredClone(body);
    const wire = translate(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, body);
    expect(instructionTexts(wire)).toEqual(["Policy one.", "Policy two.", "Format rule.", "Later policy."]);
    expect(wire.input.some((item) => item.role === "developer")).toBe(true);
    expect(body).toEqual(before);
    const roundTrip = translate(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, wire, { provider: "openai" });
    expect(roundTrip.messages.filter((message) => message.role === "system" || message.role === "developer").flatMap((message) => contentText(message.content))).toEqual(["Policy one.", "Policy two.\nFormat rule.", "Later policy."]);
  });

  it.each([
    ["none", "none"], ["auto", "auto"], ["required", "required"],
    [{ type: "function", function: { name: "lookup" } }, { type: "function", name: "lookup" }],
  ])("round-trips tool choice %j using each API's actual shape", (chatChoice, responsesChoice) => {
    const wire = translate(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, chat({ tools: chatTools(), tool_choice: chatChoice, parallel_tool_calls: false }));
    expect(wire.tool_choice).toEqual(responsesChoice);
    expect(wire.parallel_tool_calls).toBe(false);
    expect(wire.tools[0]).toMatchObject({ type: "function", name: "lookup", strict: false, parameters: toolSchema });
    const restored = translate(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, responses({ tools: [{ type: "function", name: "lookup", parameters: structuredClone(toolSchema), strict: false }], tool_choice: responsesChoice, parallel_tool_calls: false }));
    expect(restored.tool_choice).toEqual(chatChoice);
    expect(restored.parallel_tool_calls).toBe(false);
  });

  it.each([true, false, null, undefined])("does not change optional structured-output strict:%s or discard its description", (strict) => {
    const rf = { name: "answer", description: "Validated answer", schema: structuredClone(answerSchema), ...(strict === undefined ? {} : { strict }) };
    const wire = translate(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, chat({ response_format: { type: "json_schema", json_schema: rf } }));
    const expected = { type: "json_schema", name: "answer", description: "Validated answer", schema: answerSchema, ...(strict === undefined ? {} : { strict }) };
    expect(wire.text?.format).toEqual(expected);
    const restored = translate(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, responses({ text: { format: expected } }));
    expect(restored.response_format).toEqual({ type: "json_schema", json_schema: { name: "answer", description: "Validated answer", schema: answerSchema, ...(strict === undefined ? {} : { strict }) } });
  });

  it.each(["text", "json_object"])("maps explicit %s output mode in both directions", (type) => {
    const wire = translate(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, chat({ response_format: { type } }));
    expect(wire.text?.format).toEqual({ type });
    const restored = translate(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, responses({ text: { format: { type } } }));
    expect(restored.response_format).toEqual({ type });
    expect(restored).not.toHaveProperty("text");
  });

  it("preserves metadata, opaque user attribution and explicitly disabled storage/parallel controls", () => {
    const wire = translate(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, chat({
      metadata: { ticket: "T-17" }, user: "opaque-user", safety_identifier: "opaque-safety", store: false,
      parallel_tool_calls: false, temperature: 0, top_p: 0, max_tokens: 31,
    }));
    expect(wire).toMatchObject({ metadata: { ticket: "T-17" }, user: "opaque-user", safety_identifier: "opaque-safety", store: false, parallel_tool_calls: false, temperature: 0, top_p: 0, max_output_tokens: 31 });
    const restored = translate(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, wire);
    expect(restored).toMatchObject({ metadata: { ticket: "T-17" }, user: "opaque-user", safety_identifier: "opaque-safety", parallel_tool_calls: false });
  });

  it("does not make an empty metadata map disappear", () => {
    const wire = translate(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, chat({ metadata: {} }));
    expect(wire.metadata).toEqual({});
  });

  it("selects the legacy cap when the modern OpenAI cap is explicitly null", () => {
    const wire = translate(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, chat({ max_completion_tokens: null, max_tokens: 31 }));
    expect(wire.max_output_tokens).toBe(31);
    expect(wire).not.toHaveProperty("max_tokens");
    expect(wire).not.toHaveProperty("max_completion_tokens");
  });

  it("uses max_completion_tokens on a supported modern Chat target rather than leaking max_output_tokens/max_tokens", () => {
    const wire = translate(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, responses({ max_output_tokens: 31 }), { model: "gpt-5.5", provider: "openai" });
    expect(wire.max_completion_tokens).toBe(31);
    expect(wire).not.toHaveProperty("max_tokens");
    expect(wire).not.toHaveProperty("max_output_tokens");
  });

  it("normalizes a valid empty input string instead of leaking a Responses body to Chat", () => {
    const wire = translate(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, { input: "", instructions: "Reply briefly.", text: { format: { type: "json_object" } } });
    expect(wire).not.toHaveProperty("input");
    expect(wire.messages[0]).toEqual({ role: "system", content: "Reply briefly." });
    expect(wire.messages.some((message) => message.role === "user" && typeof message.content === "string" && message.content.length > 0)).toBe(true);
    expect(wire.response_format).toEqual({ type: "json_object" });
  });
});

describe("supported exact target transport request shapes", () => {
  it("retains field contracts when the exact GPT model selects Responses", () => {
    const model = "gpt-6.1-sol";
    const target = getModelTargetFormat("openai", model) || getTargetFormat("openai");
    const wire = translate(FORMATS.CLAUDE, target, claude({
      tools: claudeTools(), tool_choice: { type: "none" }, metadata: { user_id: "opaque-user" },
      output_config: { format: { type: "json_schema", schema: structuredClone(answerSchema) } },
    }), { provider: "openai", model });
    expect(wire.model).toBe(model);
    expect(wire).not.toHaveProperty("messages");
    expect(wire.tool_choice).toBe("none");
    expect(wire.user).toBe("opaque-user");
    expect(wire.max_output_tokens).toBe(31);
    expect(wire.text?.format?.schema).toEqual(answerSchema);
  });

  it("retains field contracts when the exact Claude model selects Messages", () => {
    const model = "claude-sonnet-4-6";
    const target = getModelTargetFormat("cc", model) || getTargetFormat("claude");
    const wire = translate(FORMATS.OPENAI_RESPONSES, target, responses({
      max_output_tokens: 31, text: { format: { type: "json_schema", name: "answer", schema: structuredClone(answerSchema), strict: true } },
      tools: [{ type: "function", name: "lookup", parameters: structuredClone(toolSchema), strict: false }],
      tool_choice: { type: "function", name: "lookup" }, parallel_tool_calls: false,
    }), { provider: "claude", model });
    expect(wire.model).toBe(model);
    expect(wire).not.toHaveProperty("input");
    expect(wire.output_config?.format).toEqual({ type: "json_schema", schema: answerSchema });
    expect(wire.tool_choice).toEqual({ type: "tool", name: "lookup", disable_parallel_tool_use: true });
    expect(wire.tools[0].strict).toBe(false);
  });

  it.each([
    [FORMATS.OPENAI, "response_format", () => chat({ response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: structuredClone(answerSchema) } } })],
    [FORMATS.OPENAI_RESPONSES, "text.format", () => responses({ text: { format: { type: "json_schema", name: "answer", strict: true, schema: structuredClone(answerSchema) } } })],
    [FORMATS.CLAUDE, "output_config.format", () => claude({ output_config: { effort: "medium", format: { type: "json_schema", schema: structuredClone(answerSchema) } } })],
  ])("rejects explicit %s schema intent before a known incompatible endpoint can drop it", (source, param, makeBody) => {
    const body = makeBody();
    const before = structuredClone(body);
    expect(() => translate(source, FORMATS.CLAUDE, body, { provider: "minimax", model: "MiniMax-M2.7" }))
      .toThrowError(expect.objectContaining({ code: "unsupported_parameter", param }));
    expect(body).toEqual(before);
  });

  it("keeps existing effort-only removal on known incompatible Claude endpoints", () => {
    const wire = translate(FORMATS.CLAUDE, FORMATS.CLAUDE, claude({ output_config: { effort: "medium" } }), { provider: "minimax", model: "MiniMax-M2.7" });
    expect(wire).not.toHaveProperty("output_config");
  });

  it("cleans Responses-only controls when an exact chat-only CN target selects Chat", () => {
    const model = "glm-5.3-flash";
    const target = getModelTargetFormat("opencode-go", model) || getTargetFormat("opencode-go");
    const wire = translate(FORMATS.OPENAI_RESPONSES, target, responses({
      instructions: "Reply in JSON.", max_output_tokens: 31,
      text: { format: { type: "json_schema", name: "answer", strict: false, schema: structuredClone(answerSchema) } },
      background: false,
      truncation: "disabled", max_tool_calls: 2, include: [], store: false,
    }), { provider: "opencode-go", model });
    expect(wire).toMatchObject({ model, max_tokens: 31, response_format: { type: "json_schema", json_schema: { name: "answer", strict: false, schema: answerSchema } } });
    for (const key of ["input", "instructions", "text", "max_output_tokens", "conversation", "previous_response_id", "background", "truncation", "max_tool_calls", "include", "store"]) expect(wire).not.toHaveProperty(key);
  });

  it.each([FORMATS.OPENAI, FORMATS.CLAUDE, FORMATS.GEMINI])("rejects stateful Responses context on unsupported %s targets instead of silently losing inherited history", (target) => {
    for (const [param, value] of [["previous_response_id", "resp_native_only"], ["conversation", { id: "conv_native_only" }], ["conversation", "conv_native_only"]]) {
      const body = responses({ [param]: value });
      const before = structuredClone(body);
      expect(() => translate(FORMATS.OPENAI_RESPONSES, target, body)).toThrowError(expect.objectContaining({ code: "unsupported_parameter", param }));
      expect(body).toEqual(before);
    }
  });

  it.each(["previous_response_id", "conversation"])("treats nullable native %s as unset on a stateless target", (param) => {
    const wire = translate(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, responses({ [param]: null }));
    expect(wire).not.toHaveProperty(param);
    expect(wire.messages).toEqual([{ role: "user", content: "Return the result as JSON." }]);
  });

  it.each([
    { previous_response_id: "resp_native_only" },
    { conversation: { id: "conv_native_only" } },
  ])("preserves supported native Responses inherited context %j", (context) => {
    const body = responses(context);
    const before = structuredClone(body);
    const wire = translate(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES, body);
    expect(wire).toMatchObject(context);
    expect(wire.input).toEqual(before.input);
    expect(body).toEqual(before);
  });

  it("keeps every namespace segment in the resolved model ID on a cross-format request", () => {
    const model = "org/team/model-with-tools";
    const wire = translate(FORMATS.CLAUDE, FORMATS.OPENAI, claude({ tools: claudeTools(), tool_choice: { type: "none" } }), { model, provider: "openrouter" });
    expect(wire.model).toBe("org/team/model-with-tools");
    expect(wire.tool_choice).toBe("none");
    expect(wire.tools[0].function.parameters).toEqual(toolSchema);
  });
});

describe("Responses worker ingress field contracts", () => {
  it("does not lose native tools, structured format or output cap before the registered Gemini conversion", () => {
    const original = responses({ max_output_tokens: 31,
      tools: [{ type: "function", name: "lookup", parameters: structuredClone(toolSchema), strict: false }],
      tool_choice: "none", text: { format: { type: "json_schema", name: "answer", schema: structuredClone(answerSchema), strict: true } },
    });
    const before = structuredClone(original);
    const wire = translate(FORMATS.OPENAI_RESPONSES, FORMATS.GEMINI, convertResponsesApiFormat(original), { model: "gemini-3.1-pro-preview" });
    expect(wire.generationConfig).toMatchObject({ maxOutputTokens: 31, responseMimeType: "application/json", responseJsonSchema: answerSchema });
    expect(wire.tools[0].functionDeclarations[0].parametersJsonSchema).toEqual(toolSchema);
    expect(wire.toolConfig?.functionCallingConfig).toEqual({ mode: "NONE" });
    expect(original).toEqual(before);
  });
});

describe("tool declaration and forced-choice name coupling", () => {
  it.each([FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY, FORMATS.VERTEX])("forces the actual sanitized declaration name on %s", (target) => {
    const body = chat({
      tools: [{ type: "function", function: { name: "3_lookup", parameters: structuredClone(toolSchema) } }],
      tool_choice: { type: "function", function: { name: "3_lookup" } },
    });
    const wire = googleRequest(translate(FORMATS.OPENAI, target, body));
    expect(wire.tools[0].functionDeclarations[0].name).toBe("_3_lookup");
    expect(wire.toolConfig?.functionCallingConfig).toEqual({ mode: "ANY", allowedFunctionNames: ["_3_lookup"] });
  });

});

describe("typed assistant image replay from generated-output attachments", () => {
  const targets = [
    { name: "Chat", format: FORMATS.OPENAI, model: "gpt-4.1" },
    { name: "Responses", format: FORMATS.OPENAI_RESPONSES, model: "gpt-4.1" },
    { name: "Messages", format: FORMATS.CLAUDE, model: "claude-sonnet-4-6" },
    ...googleTargets,
  ];
  it.each(targets)("keeps the generated image typed exactly once on $name without changing parallel tool linkage", (target) => {
    const body = chat({ tools: chatTools(), messages: [
      { role: "user", content: "Create the diagram, then look up both records." },
      { role: "assistant", content: [{ type: "text", text: "Generated diagram." }, { type: "image_url", image_url: { url: imageUrl, detail: "high" } }], tool_calls: [
        { id: "call_first", type: "function", function: { name: "lookup", arguments: '{"query":"first"}' } },
        { id: "call_second", type: "function", function: { name: "lookup", arguments: '{"query":"second"}' } },
      ] },
      { role: "tool", tool_call_id: "call_first", content: "First result" },
      { role: "tool", tool_call_id: "call_second", content: "Second result" },
      { role: "user", content: "Compare the generated diagram with both records." },
    ] });
    const before = structuredClone(body);
    const wire = translate(FORMATS.OPENAI, target.format, body, target);
    expect(JSON.stringify(wire).split(png).length - 1).toBe(1);
    const request = googleRequest(wire);
    const blocks = request.contents ? request.contents.flatMap((turn) => turn.parts)
      : wire.input ? wire.input.flatMap((item) => Array.isArray(item.content) ? item.content : [])
        : wire.messages.flatMap((message) => Array.isArray(message.content) ? message.content : []);
    const media = blocks.filter((part) => part.inlineData || part.type === "image_url" || part.type === "input_image" || part.type === "image");
    expect(media).toHaveLength(1);
    expect(blocks.filter((part) => typeof part.text === "string").map((part) => part.text).join("\n")).not.toContain(png);
    if (target.format === FORMATS.OPENAI) {
      const assistantIndex = wire.messages.findIndex((message) => message.tool_calls?.length === 2);
      expect(wire.messages.slice(assistantIndex + 1, assistantIndex + 3).map((message) => ({ role: message.role, id: message.tool_call_id }))).toEqual([
        { role: "tool", id: "call_first" }, { role: "tool", id: "call_second" },
      ]);
      const imageMessageIndex = wire.messages.findIndex((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image_url"));
      expect(imageMessageIndex).toBeGreaterThan(assistantIndex + 2);
      expect(wire.messages[imageMessageIndex].role).toBe("user");
      expect(wire.messages[assistantIndex].content).toBe("Generated diagram.");
    }
    if (target.format === FORMATS.CLAUDE) {
      const imageMessage = wire.messages.find((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image"));
      expect(imageMessage.role).toBe("assistant");
      expect(imageMessage.content.filter((part) => part.type === "text").map((part) => part.text)).toEqual(["Generated diagram."]);
    }
    if (target.format === FORMATS.OPENAI_RESPONSES) {
      const imageMessage = wire.input.find((item) => Array.isArray(item.content) && item.content.some((part) => part.type === "input_image"));
      expect(imageMessage.role).toBe("assistant");
      expect(imageMessage.content.filter((part) => part.type === "input_text").map((part) => part.text)).toEqual(["Generated diagram."]);
    }
    if (request.contents) {
      expect(blocks.filter((part) => part.functionCall).map((part) => part.functionCall.name)).toEqual(["lookup", "lookup"]);
      expect(blocks.filter((part) => part.functionResponse).map((part) => part.functionResponse.name)).toEqual(["lookup", "lookup"]);
      const imageTurn = request.contents.find((turn) => turn.parts.some((part) => part.inlineData));
      expect(imageTurn.role).toBe("model");
    }
    expect(body).toEqual(before);
  });

  it.each([FORMATS.GEMINI, FORMATS.CLAUDE])("lifts native %s assistant images into a following Chat user vision turn rather than sending invalid assistant image content", (source) => {
    const body = source === FORMATS.GEMINI ? gemini({ contents: [
      { role: "user", parts: [{ text: "Create a diagram." }] },
      { role: "model", parts: [{ text: "Generated diagram." }, { inlineData: { mimeType: "image/png", data: png } }] },
      { role: "user", parts: [{ text: "Explain the diagram." }] },
    ] }) : claude({ messages: [
      { role: "user", content: "Create a diagram." },
      { role: "assistant", content: [{ type: "text", text: "Generated diagram." }, { type: "image", source: { type: "base64", media_type: "image/png", data: png } }] },
      { role: "user", content: "Explain the diagram." },
    ] });
    const before = structuredClone(body);
    const wire = translate(source, FORMATS.OPENAI, body);
    const assistantIndex = wire.messages.findIndex((message) => message.role === "assistant");
    expect(wire.messages[assistantIndex].content).toBe("Generated diagram.");
    const imageMessage = wire.messages.find((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image_url"));
    expect(imageMessage.role).toBe("user");
    expect(imageMessage.content.find((part) => part.type === "image_url").image_url.url).toBe(imageUrl);
    expect(JSON.stringify(wire).split(png).length - 1).toBe(1);
    expect(body).toEqual(before);
  });
});

describe("signed generated-image replay", () => {
  const signature = "b3BhcXVlLWdlbWluaS1pbWFnZS1zaWduYXR1cmU=";
  const targets = googleTargets.filter(target => target.model === "gemini-2.5-flash");
  it.each(targets)("replays a canonical OpenAI image signature on the same native image Part for $name", (target) => {
    const body = chat({ messages: [
      { role: "user", content: "Create a diagram." },
      { role: "assistant", content: [
        { type: "text", text: "Generated diagram." },
        { type: "image_url", image_url: { url: imageUrl }, extra_content: { google: { thought_signature: signature } } },
      ] },
      { role: "user", content: "Edit the diagram." },
    ] });
    const before = structuredClone(body);
    const wire = googleRequest(translate(FORMATS.OPENAI, target.format, body, target));
    const imageParts = wire.contents.flatMap(turn => turn.parts).filter(part => part.inlineData);
    expect(imageParts).toHaveLength(1);
    expect(imageParts[0].inlineData.data).toBe(png);
    expect(imageParts[0].thoughtSignature).toBe(signature);
    expect(wire.contents.flatMap(turn => turn.parts).filter(part => part.text).map(part => part.text).join("\n")).not.toContain(signature);
    expect(body).toEqual(before);
  });

  it.each([FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY])("preserves native signed image bytes and ownership across the real Gemini -> %s pivot", (target) => {
    const body = gemini({ contents: [
      { role: "user", parts: [{ text: "Create a diagram." }] },
      { role: "model", parts: [{ text: "Generated diagram." }, { inlineData: { mimeType: "image/png", data: png }, thoughtSignature: signature }] },
      { role: "user", parts: [{ text: "Edit the diagram." }] },
    ] });
    const before = structuredClone(body);
    const wire = googleRequest(translate(FORMATS.GEMINI, target, body));
    const imageParts = wire.contents.flatMap(turn => turn.parts).filter(part => part.inlineData);
    expect(imageParts.map(part => ({ data: part.inlineData.data, signature: part.thoughtSignature }))).toEqual([{ data: png, signature }]);
    expect(wire.contents.find(turn => turn.parts.some(part => part.inlineData)).role).toBe("model");
    expect(body).toEqual(before);
  });

  it.each([FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY])("keeps signed text and image signatures on their own Parts during a native Google -> %s pivot", (target) => {
    const textSignature = "b3BhcXVlLWdlbWluaS10ZXh0LXNpZ25hdHVyZQ==";
    const body = gemini({ contents: [
      { role: "user", parts: [{ text: "Create a diagram." }] },
      { role: "model", parts: [
        { text: "Generated diagram.", thoughtSignature: textSignature },
        { inlineData: { mimeType: "image/png", data: png }, thoughtSignature: signature },
        { text: "Unsigned caption." },
      ] },
      { role: "user", parts: [{ text: "Edit the diagram." }] },
    ] });
    const before = structuredClone(body);
    const wire = googleRequest(translate(FORMATS.GEMINI, target, body));
    const modelParts = wire.contents.find(turn => turn.role === "model").parts;
    expect(modelParts).toHaveLength(3);
    expect(modelParts[0]).toEqual({ text: "Generated diagram.", thoughtSignature: textSignature });
    expect(modelParts[1].inlineData.data).toBe(png);
    expect(modelParts[1].thoughtSignature).toBe(signature);
    expect(modelParts[2]).toEqual({ text: "Unsigned caption." });
    expect(body).toEqual(before);
  });
});
