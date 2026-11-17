import { describe, expect, it } from "vitest";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";

// 9router issue #5573: the nonstandard annotation is not a field in Google's
// Schema protobuf. Literal property names remain user-defined JSON keys.
function parameters() {
  return {
    type: "object", "~optional": true,
    properties: {
      "~optional": { type: "string", "~optional": true },
      nested: { type: "object", "~optional": true, properties: {
        value: { type: "string", "~optional": true },
      } },
      list: { type: "array", "~optional": true, items: { type: "string", "~optional": true } },
    },
    required: ["~optional", "nested"],
  };
}

describe.each([F.GEMINI, F.GEMINI_CLI, F.VERTEX, F.ANTIGRAVITY])("~optional annotations on the public %s request route", target => {
  it.each([F.OPENAI, F.CLAUDE])("removes schema annotations while preserving caller properties from %s", source => {
    const schema = parameters();
    const body = source === F.CLAUDE ? {
      model: "fixture", max_tokens: 128,
      messages: [{ role: "user", content: "Use the declared tool" }],
      tools: [{ name: "lookup", description: "fixture", input_schema: schema }],
    } : {
      model: "fixture", max_tokens: 128,
      messages: [{ role: "user", content: "Use the declared tool" }],
      tools: [{ type: "function", function: { name: "lookup", description: "fixture", parameters: schema } }],
    };
    const original = structuredClone(body);
    const output = translateRequest(source, target, "gemini-3.8-flash", body, true,
      { providerSpecificData: { projectId: "fixture-project" } }, target);
    const request = output.request || output;
    const declaration = request.tools[0].functionDeclarations[0];
    // Direct Gemini/Vertex routes use full JSON Schema, so their annotation
    // keys are data. The legacy CLI/Antigravity Schema protobuf rejects them.
    if (target === F.GEMINI || target === F.VERTEX) {
      expect(declaration.parametersJsonSchema).toEqual(schema);
      expect(body).toEqual(original);
      return;
    }
    const params = declaration.parameters;
    expect(params).not.toHaveProperty("~optional");
    expect(params.properties).toHaveProperty("~optional");
    expect(params.properties["~optional"]).toEqual({ type: "string" });
    expect(params.properties.nested).not.toHaveProperty("~optional");
    expect(params.properties.nested.properties.value).toEqual({ type: "string" });
    expect(params.properties.list).not.toHaveProperty("~optional");
    expect(params.properties.list.items).toEqual({ type: "string" });
    expect(params.required).toContain("~optional");
    expect(body).toEqual(original);
  });
});
