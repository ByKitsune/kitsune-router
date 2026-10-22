import { describe, expect, it } from "vitest";
import { cleanJSONSchemaForAntigravity } from "../../open-sse/translator/formats/gemini.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";

describe("Gemini tool schema normalization & fallback (#4447)", () => {
  it("normalizes free-form object schemas with additionalProperties: true", () => {
    const schema = {
      type: "object",
      properties: {
        example: {
          type: "object",
          additionalProperties: true,
        },
      },
    };

    const cleaned = cleanJSONSchemaForAntigravity(structuredClone(schema));
    expect(cleaned.properties.example.type).toBe("object");
    expect(cleaned.properties.example.additionalProperties).toBeUndefined();
    expect(cleaned.properties.example.properties).toBeDefined();
    expect(cleaned.properties.example.properties.reason).toBeDefined();
  });

  it("infers type for typeless object property schemas", () => {
    const schema = {
      type: "object",
      properties: {
        rawInput: {
          description: "Any unstructured input",
        },
        subObject: {
          properties: {
            name: { type: "string" },
          },
        },
      },
    };

    const cleaned = cleanJSONSchemaForAntigravity(structuredClone(schema));
    expect(cleaned.properties.rawInput.type).toBe("string");
    expect(cleaned.properties.subObject.type).toBe("object");
  });

  it("expands boolean property schemas into valid object schemas", () => {
    const schema = {
      type: "object",
      properties: {
        anything: true,
      },
    };

    const cleaned = cleanJSONSchemaForAntigravity(structuredClone(schema));
    expect(typeof cleaned.properties.anything).toBe("object");
    expect(cleaned.properties.anything.type).toBe("string");
  });

  it("allows combo fallback when upstream returns schema INVALID_ARGUMENT", () => {
    const errorMessage = "[400] INVALID_ARGUMENT: Invalid value at 'tools[0].function_declarations[23].parameters.properties[6].value' (type.googleapis.com/google.ai.generativelanguage.v1beta.Schema), 'object'";
    const res = checkFallbackError(400, { message: errorMessage, code: "unsupported_parameter", param: "tools" }, 0, null, "combo");
    expect(res.shouldFallback).toBe(true);
    expect(checkFallbackError(400, { message: errorMessage, code: "unsupported_parameter", param: "tools" }).shouldFallback).toBe(false);
    expect(res.cooldownMs).toBe(0);
  });
});
