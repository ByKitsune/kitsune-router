import { describe, expect, it } from "vitest";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";

// M04: PR #4667 at db67d97bcc799adf5cf3e358a0ea96e6d99feb40 exposes
// the loss. These synthetic fixtures exercise a narrower, fail-closed subset,
// not the PR's broad compiler or a claim of authenticated Google acceptance.
const schema = { type: "object", properties: {
  answer: { type: "string", enum: ["yes", "no"] },
  scores: { type: "array", items: { type: "integer", minimum: 0, maximum: 5 } },
  note: { type: ["string", "null"] },
}, required: ["answer", "scores"] };
const lower = { type: "object", properties: {
  answer: { type: "string", enum: ["yes", "no"] },
  scores: { type: "array", items: { type: "integer", minimum: 0, maximum: 5 } },
  note: { type: "string", nullable: true },
}, required: ["answer", "scores"] };
const translate = (extra, source = FORMATS.OPENAI, model = "gemini-3.8-flash") => translateRequest(source, FORMATS.ANTIGRAVITY, model, {
  ...(source === FORMATS.CLAUDE
    ? { system: "Retain my instructions.", messages: [{ role: "user", content: "Respond." }] }
    : { messages: [{ role: "system", content: "Retain my instructions." }, { role: "user", content: "Respond." }] }), ...extra,
}, false, { projectId: "synthetic-output-project" }, "antigravity");

describe("Antigravity structured output intent", () => {
  it.each([
    [FORMATS.OPENAI, { response_format: { type: "json_schema", json_schema: { name: "answer", schema } } }],
    [FORMATS.OPENAI_RESPONSES, { input: "Respond.", instructions: "Retain my instructions.", text: { format: { type: "json_schema", name: "answer", schema } } }],
  ])("lowers supported %s schemas to the legacy responseSchema wire with no prompt substitution", (source, extra) => {
    const out = translate(extra, source);
    expect(out.request.generationConfig).toMatchObject({ responseMimeType: "application/json", responseSchema: lower });
    expect(out.request.generationConfig.responseJsonSchema).toBeUndefined();
    expect(out.request.systemInstruction.parts.map(part => part.text).join("\n")).toContain("Retain my instructions.");
    expect(JSON.stringify(out.request.systemInstruction)).not.toContain("```json");
    const wire = new AntigravityExecutor().transformRequest("gemini-3.8-flash", out, false, { projectId: "synthetic-output-project" });
    expect(wire.request.generationConfig.responseSchema).toEqual(lower);
  });

  it("preserves JSON mode without inventing a schema", () => {
    const out = translate({ response_format: { type: "json_object" } });
    expect(out.request.generationConfig.responseMimeType).toBe("application/json");
    expect(out.request.generationConfig.responseSchema).toBeUndefined();
    expect(out.request.systemInstruction.parts.map(part => part.text)).toEqual(["Retain my instructions."]);
  });

  it.each([
    { type: "object", additionalProperties: false },
    { type: "object", $ref: "https://example.test/schema" },
    { type: "integer", enum: [0, 1, 3] },
    { type: "object", allOf: [{ type: "object" }] },
    { type: "array", items: [{ type: "string" }, { type: "number" }] },
    { type: "array", prefixItems: [{ type: "string" }] },
    { type: "object", properties: { x: { type: "string", pattern: "^a" } } },
    { type: "string", enum: ["", "yes"] },
    { type: "string", enum: [false] },
    {}, false, "not a schema",
  ])("rejects unrepresentable output constraints without invoking the lossy tool sanitizer: %j", unsupported => {
    expect(() => translate({ response_format: { type: "json_schema", json_schema: { name: "bad", schema: unsupported } } }))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "response_format" }));
  });

  it.each([
    { type: "json_schema" }, { type: "json_schema", json_schema: {} },
    { type: "json_schema", json_schema: { schema, strict: "true" } },
    { type: "json_schema", json_schema: { schema, strict: true } },
    { type: "xml" }, "json_object",
  ])("rejects malformed output intent rather than degrading to generic text or JSON: %j", response_format => {
    expect(() => translate({ response_format })).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "response_format" }));
  });

  it.each([
    { response_format: { type: "json_object" } },
    { response_format: { type: "json_schema", json_schema: { schema } } },
    { text: { format: { type: "json_schema", schema } } },
    { output_config: { format: { type: "json_schema", schema } } },
  ])("explicitly rejects structured output on the unverified Claude-on-Antigravity backend: %j", extra => {
    expect(() => translate(extra, FORMATS.OPENAI, "claude-sonnet-4-6")).toThrow(expect.objectContaining({ code: "unsupported_parameter" }));
  });

  it("rejects unsupported strict guarantees with safe caller-facing guidance", () => {
    for (const source of [FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES]) {
      const extra = source === FORMATS.OPENAI
        ? { response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema } } }
        : { input: "Respond.", text: { format: { type: "json_schema", name: "answer", strict: true, schema } } };
      expect(() => translate(extra, source)).toThrow(expect.objectContaining({ code: "unsupported_parameter" }));
      try { translate(extra, source); } catch (error) {
        expect(error.message).not.toMatch(/Cloud Code|protobuf|responseSchema|responseJsonSchema|wire/i);
      }
    }
  });

  it("rejects native structured output on Claude-backed same-format requests", () => {
    expect(() => translate({ request: { contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: {
      responseMimeType: "application/json", responseSchema: { type: "object" },
    } } }, FORMATS.ANTIGRAVITY, "claude-sonnet-4-6"))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "request.generationConfig.responseSchema" }));
  });

  it("does not claim responseJsonSchema support on the private Cloud Code wire", () => {
    expect(() => translate({ request: { contents: [], generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema } } }, FORMATS.ANTIGRAVITY))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "request.generationConfig.responseJsonSchema" }));
  });

  it("treats keyword-named properties as properties and never inserts the tool-only reason placeholder", () => {
    const original = { type: "object", properties: { items: { type: "string" }, enum: { type: "boolean" }, empty: { type: "object" } } };
    const before = structuredClone(original);
    const out = translate({ response_format: { type: "json_schema", json_schema: { schema: original } } });
    expect(out.request.generationConfig.responseSchema).toEqual(before);
    expect(original).toEqual(before);
    out.request.generationConfig.responseSchema.properties.items.type = "number";
    expect(original).toEqual(before);
  });

  it("bounds output-schema traversal before recursion or serialization can exhaust the process", () => {
    let nested = { type: "string" };
    for (let index = 0; index < 80; index++) nested = { type: "array", items: nested };
    for (const oversized of [nested, { type: "string", description: "x".repeat(262145) }]) {
      expect(() => translate({ response_format: { type: "json_schema", json_schema: { schema: oversized } } }))
        .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "response_format" }));
    }
  });

  it("rejects ambiguous or malformed JSON mode constraints instead of ignoring their extra fields", () => {
    for (const format of [
      { type: "json_object", schema },
      { type: "text", schema },
      { type: "json_schema", json_schema: { name: 123, schema } },
      { type: "json_schema", json_schema: { schema }, unsupported_constraint: true },
    ]) {
      expect(() => translate({ response_format: format }))
        .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "response_format" }));
    }
  });

  it("does not validate a native JSON Schema union and then forward it unchanged as a protobuf Schema", () => {
    expect(() => translate({ request: { contents: [], generationConfig: {
      responseMimeType: "application/json", responseSchema: { type: "object", properties: { x: { type: ["string", "null"] } } },
    } } }, FORMATS.ANTIGRAVITY))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "request.generationConfig.responseSchema" }));
  });

  it("preserves caller-authored identity-looking instructions on the Claude backend", () => {
    const out = translate({ messages: [
      { role: "system", content: "Explain the literal string 'You are Claude Code'." },
      { role: "user", content: "hi" },
    ] }, FORMATS.OPENAI, "claude-sonnet-4-6");
    expect(out.request.systemInstruction.parts.map(part => part.text)).toEqual(["Explain the literal string 'You are Claude Code'."]);
  });

  it("preserves native response-schema property ordering across the Google-to-Antigravity bridge", () => {
    const ordered = { type: "OBJECT", properties: { a: { type: "STRING" }, b: { type: "BOOLEAN" } }, propertyOrdering: ["b", "a"] };
    const out = translate({ contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { responseMimeType: "application/json", responseSchema: ordered } }, FORMATS.GEMINI);
    expect(out.request.generationConfig.responseSchema).toEqual({ type: "object", properties: { a: { type: "string" }, b: { type: "boolean" } }, propertyOrdering: ["b", "a"] });
  });

  it("does not claim a structured-output mapping for a non-Gemini Cloud Code backend", () => {
    expect(() => translate({ response_format: { type: "json_object" } }, FORMATS.OPENAI, "gpt-oss-120b-medium"))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "response_format" }));
  });
});
