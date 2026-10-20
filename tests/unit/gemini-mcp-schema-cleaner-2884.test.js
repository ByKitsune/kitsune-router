import { describe, it, expect } from "vitest";
import { cleanJSONSchemaForAntigravity } from "../../open-sse/translator/formats/gemini.js";

describe("cleanJSONSchemaForAntigravity (#2884, #3743)", () => {
  it("preserves parameter named 'properties' and does not inject bogus type into name-map", () => {
    const schema = {
      type: "object",
      properties: {
        page_id: { type: "string" },
        properties: {
          type: "object",
          description: "Page property values",
          additionalProperties: true,
        },
        title: { type: "string" },
      },
      required: ["page_id"],
    };

    cleanJSONSchemaForAntigravity(schema);

    // properties name-map should keep its keys
    expect(schema.properties.page_id).toBeDefined();
    expect(schema.properties.properties).toBeDefined();
    expect(schema.properties.properties.type).toBe("object");
    // Bogus type="object" must NOT be injected into properties map itself
    expect(schema.properties.type).toBeUndefined();
    // Parameter named 'title' should not be deleted
    expect(schema.properties.title).toBeDefined();
    expect(schema.properties.title.type).toBe("string");
    // unsupported additionalProperties inside the parameter should be removed
    expect(schema.properties.properties.additionalProperties).toBeUndefined();
  });

  it("converts homogeneous prefixItems to items when items is omitted (#3743)", () => {
    const schema = {
      type: "object",
      properties: {
        single_tuple: {
          type: "array",
          prefixItems: [{ type: "string" }],
        },
        multi_tuple: {
          type: "array",
          prefixItems: [{ type: "string" }, { type: "string" }],
        },
        bare_array: {
          type: "array",
        },
      },
    };

    cleanJSONSchemaForAntigravity(schema);

    expect(schema.properties.single_tuple.prefixItems).toBeUndefined();
    expect(schema.properties.single_tuple.items).toEqual({ type: "string" });

    expect(schema.properties.multi_tuple.prefixItems).toBeUndefined();
    expect(schema.properties.multi_tuple.items).toEqual({ type: "string" });

    expect(schema.properties.bare_array.items).toEqual({ type: "string" });
  });
});
