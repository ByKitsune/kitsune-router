import { describe, expect, it } from "vitest";
import { geminiSchemaToJSONSchema } from "../../open-sse/translator/formats/gemini.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const sources = [
  { format: FORMATS.GEMINI, wrap: request => request },
  { format: FORMATS.GEMINI_CLI, wrap: request => ({ request }) },
  { format: FORMATS.ANTIGRAVITY, wrap: request => ({ userAgent: "antigravity", request }) },
];
const contents = [{ role: "user", parts: [{ text: "Use the schema." }] }];
const legacy = parameters => ({ tools: [{ functionDeclarations: [{ name: "inspect", parameters }] }], contents });
const translate = (source, body) => translateRequest(source, FORMATS.OPENAI_RESPONSES, "gpt-5.4", body, false, null, "codex");

describe("legacy Google Schema array bounds", () => {
  it("converts only actual schema nodes, not schema maps or literal data", () => {
    const literal = { type: "ARRAY", minItems: "invalid", maxItems: "-1", items: { minItems: "not a bound" } };
    const schema = {
      type: "OBJECT", minItems: "0",
      properties: {
        minItems: { type: "ARRAY", minItems: "2", maxItems: "4", items: { type: "STRING" } },
        maxItems: { type: "ARRAY", minItems: 1, maxItems: "9007199254740991", items: { type: "ARRAY", minItems: "0", items: { type: "STRING" } } },
        properties: { type: "OBJECT", properties: { items: { type: "ARRAY", maxItems: "3", items: { type: "INTEGER" } } } },
        literals: { type: "OBJECT", default: literal, enum: [literal], examples: [literal], example: literal, const: literal, "x-literal": literal },
      },
      $defs: { minItems: { type: "ARRAY", minItems: "1" } },
      definitions: { maxItems: { type: "ARRAY", maxItems: "2" } },
      patternProperties: { minItems: { type: "ARRAY", minItems: "2" } },
      dependentSchemas: { maxItems: { type: "ARRAY", maxItems: "3" } },
      dependencies: { minItems: { type: "ARRAY", minItems: "4" }, requiredNames: ["minItems", "maxItems"] },
      allOf: [{ type: "ARRAY", minItems: "5" }],
      anyOf: [{ type: "ARRAY", maxItems: "6" }],
      oneOf: [{ type: "ARRAY", minItems: "1" }],
      prefixItems: [{ type: "ARRAY", maxItems: "2" }],
      additionalProperties: { type: "ARRAY", minItems: "1" },
      contains: { type: "ARRAY", maxItems: "3" },
      not: { type: "ARRAY", minItems: "1" },
      if: { type: "ARRAY", minItems: "1" },
      then: { type: "ARRAY", maxItems: "2" },
      else: { type: "ARRAY", minItems: "0" },
    };
    const before = structuredClone(schema);
    const out = geminiSchemaToJSONSchema(schema);
    expect(out.minItems).toBe(0);
    expect(out.properties.minItems).toEqual({ type: "array", minItems: 2, maxItems: 4, items: { type: "string" } });
    expect(out.properties.maxItems).toEqual({ type: "array", minItems: 1, maxItems: Number.MAX_SAFE_INTEGER, items: { type: "array", minItems: 0, items: { type: "string" } } });
    expect(out.properties.properties.properties.items).toEqual({ type: "array", maxItems: 3, items: { type: "integer" } });
    for (const key of ["default", "example", "const", "x-literal"]) expect(out.properties.literals[key]).toEqual(literal);
    for (const key of ["enum", "examples"]) expect(out.properties.literals[key]).toEqual([literal]);
    expect(out.$defs.minItems.minItems).toBe(1);
    expect(out.definitions.maxItems.maxItems).toBe(2);
    expect(out.patternProperties.minItems.minItems).toBe(2);
    expect(out.dependentSchemas.maxItems.maxItems).toBe(3);
    expect(out.dependencies.minItems.minItems).toBe(4);
    expect(out.dependencies.requiredNames).toEqual(["minItems", "maxItems"]);
    expect(out.allOf[0].minItems).toBe(5);
    expect(out.anyOf[0].maxItems).toBe(6);
    expect(out.oneOf[0].minItems).toBe(1);
    expect(out.prefixItems[0].maxItems).toBe(2);
    expect(out.additionalProperties.minItems).toBe(1);
    expect(out.contains.maxItems).toBe(3);
    expect(out.not.minItems).toBe(1);
    expect(out.if.minItems).toBe(1);
    expect(out.then.maxItems).toBe(2);
    expect(out.else.minItems).toBe(0);
    expect(schema).toEqual(before);
  });

  it.each([
    ["0", 0], ["2", 2], ["9007199254740991", Number.MAX_SAFE_INTEGER],
    ["1e2", 100], ["1e+2", 100], ["2.0", 2], ["0.01e2", 1],
    ["90071992547409910e-1", Number.MAX_SAFE_INTEGER], ["-0", 0], [0, 0], [42, 42],
  ])("converts exact protobuf integer %j to %j", (value, expected) => {
    expect(geminiSchemaToJSONSchema({ type: "ARRAY", minItems: value }).minItems).toBe(expected);
  });

  it.each([
    "", " ", " 2", "2\n", "2\r\n", "+1", "01", "0x10", "-1", "1.5", "1e-999", "1e309",
    "9007199254740992", "9007199254740991.1", "90071992547409911e-1", "1.00000000000000001", -1, 1.5,
    Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, null, true, {}, [],
  ].map(value => [value]))("rejects an invalid, fractional or unsafe bound %j", value => {
    const schema = { type: "ARRAY", minItems: value };
    const before = structuredClone(schema);
    expect(() => geminiSchemaToJSONSchema(schema)).toThrow(expect.objectContaining({
      code: "unsupported_parameter", type: "invalid_request_error", status: 400, param: "tools",
    }));
    expect(schema).toEqual(before);
  });

  it("rejects a minItems greater than maxItems without weakening either", () => {
    const schema = { type: "OBJECT", properties: { rows: { type: "ARRAY", minItems: "4", maxItems: "3" } } };
    const before = structuredClone(schema);
    expect(() => geminiSchemaToJSONSchema(schema)).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "tools" }));
    expect(schema).toEqual(before);
  });

  it("handles array-form items and does not confuse dependency arrays with schema nodes", () => {
    const out = geminiSchemaToJSONSchema({ items: [{ type: "ARRAY", minItems: "2" }], dependencies: { x: ["minItems"] } });
    expect(out.items).toEqual([{ type: "array", minItems: 2 }]);
    expect(out.dependencies.x).toEqual(["minItems"]);
  });

  it.each([
    { properties: { minItems: { maxItems: "1.5" } } },
    { $defs: { maxItems: { minItems: "1.5" } } },
    { dependentSchemas: { properties: { minItems: "1.5" } } },
    { dependencies: { items: { minItems: "1.5" } } },
    { anyOf: [{ minItems: "1.5" }] },
    { prefixItems: [{ minItems: "1.5" }] },
    { items: [{ minItems: "1.5" }] },
    { additionalProperties: { minItems: "1.5" } },
    { contains: { minItems: "1.5" } },
    { if: { minItems: "1.5" } },
    { propertyNames: { minItems: "1.5" } },
  ])("rejects invalid bounds in a child schema: %j", schema => {
    const before = structuredClone(schema);
    expect(() => geminiSchemaToJSONSchema(schema)).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "tools" }));
    expect(schema).toEqual(before);
  });
});

describe.each(sources)("$format source boundaries", source => {
  it("converts both legacy tool parameters and legacy structured output", () => {
    const body = source.wrap({ ...legacy({ type: "OBJECT", properties: { tags: { type: "ARRAY", minItems: "2", maxItems: "4", items: { type: "STRING" } } } }),
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", minItems: "0", maxItems: "3", items: { type: "STRING" }, propertyOrdering: ["kept"] } },
    });
    const before = structuredClone(body);
    const wire = translate(source.format, body);
    expect(wire.tools[0].parameters.properties.tags).toEqual({ type: "array", minItems: 2, maxItems: 4, items: { type: "string" } });
    expect(wire.text.format.schema).toEqual({ type: "array", minItems: 0, maxItems: 3, items: { type: "string" }, propertyOrdering: ["kept"] });
    expect(body).toEqual(before);
  });

  it("does not reinterpret distinct JSON Schema fields or a shadowed legacy schema", () => {
    const jsonSchema = { type: "object", properties: { items: { type: "array", minItems: "literal-string", default: { maxItems: "literal" } } } };
    const body = source.wrap({ contents, tools: [{ functionDeclarations: [{ name: "inspect", parameters: { minItems: "invalid" }, parametersJsonSchema: jsonSchema }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: { maxItems: "invalid" }, responseJsonSchema: jsonSchema },
    });
    const before = structuredClone(body);
    const wire = translate(source.format, body);
    expect(wire.tools[0].parameters).toEqual(jsonSchema);
    expect(wire.text.format.schema).toEqual(jsonSchema);
    expect(body).toEqual(before);
  });

  it("reports an invalid legacy response schema as a request error", () => {
    const body = source.wrap({ contents, generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", maxItems: "1.5" } } });
    const before = structuredClone(body);
    expect(() => translate(source.format, body)).toThrow(expect.objectContaining({
      code: "unsupported_parameter", type: "invalid_request_error", status: 400, param: "generationConfig.responseSchema",
    }));
    expect(body).toEqual(before);
  });
});
