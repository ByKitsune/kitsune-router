import { describe, expect, it, vi } from "vitest";
import { cleanJSONSchemaForAntigravity } from "../../open-sse/translator/formats/gemini.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

function combinedSchema(count = 2000) {
  return {
    type: "object",
    allOf: Array.from({ length: 4 }, (_, branch) => {
      const names = Array.from({ length: count / 4 }, (_, index) => `required_work_${branch}_${index}`);
      return { properties: Object.fromEntries(names.map(name => [name, { type: "string" }])), required: names };
    }),
  };
}

describe("Gemini allOf required-field merging", () => {
  it("preserves first appearance, top-level duplicates and later property precedence", () => {
    const schema = {
      type: "object", properties: { outside: { type: "boolean" }, a: { type: "string" } }, required: ["outside", "a", "a"],
      allOf: [
        { properties: { a: { type: "number" }, b: { type: "boolean" } }, required: ["b", "a", "b"] },
        { properties: { a: { type: "integer" }, c: { type: "string" } }, required: ["c", "b"] },
      ],
    };
    const cleaned = cleanJSONSchemaForAntigravity(schema);
    expect(cleaned.required).toEqual(["outside", "a", "a", "b", "a", "c"]);
    expect(cleaned.properties).toEqual({ outside: { type: "boolean" }, a: { type: "integer" }, b: { type: "boolean" }, c: { type: "string" } });
    expect(cleaned).not.toHaveProperty("allOf");
  });

  it("retains the original membership comparison semantics without rewriting retained values", () => {
    const schema = { type: "object", allOf: [
      { properties: { NaN: { type: "number" }, 0: { type: "string" } }, required: [NaN, -0, NaN, 0] },
    ] };
    const cleaned = cleanJSONSchemaForAntigravity(schema);
    expect(cleaned.required).toHaveLength(2);
    expect(Number.isNaN(cleaned.required[0])).toBe(true);
    expect(Object.is(cleaned.required[1], -0)).toBe(true);
  });

  it("does bounded membership work when a large schema merges distinct required fields", () => {
    const count = 2000;
    const schema = combinedSchema(count);
    const originals = { includes: Array.prototype.includes, indexOf: Array.prototype.indexOf };
    let scannedSlots = 0;
    const spies = Object.entries(originals).map(([method, original]) => vi.spyOn(Array.prototype, method).mockImplementation(function (value, ...args) {
      if (typeof value === "string" && value.startsWith("required_work_")) scannedSlots += this.length;
      return original.call(this, value, ...args);
    }));
    let cleaned;
    try { cleaned = cleanJSONSchemaForAntigravity(schema); }
    finally { for (const spy of spies) spy.mockRestore(); }
    expect(cleaned.required).toHaveLength(count);
    expect(cleaned.required[0]).toBe("required_work_0_0");
    expect(cleaned.required.at(-1)).toBe("required_work_3_499");
    expect(scannedSlots).toBeLessThanOrEqual(count * 4);
  });

  it("leaves borrowed request schemas unchanged through the real Gemini CLI translation path", () => {
    const schema = combinedSchema(40);
    const body = { messages: [{ role: "user", content: "Inspect these fields" }], tools: [{ type: "function", function: { name: "inspect", parameters: schema } }] };
    const before = structuredClone(body);
    const wire = translateRequest(FORMATS.OPENAI, FORMATS.GEMINI_CLI, "gemini-2.5-flash", body, false, { projectId: "synthetic-project" }, "gemini-cli");
    const request = wire.request || wire;
    expect(request.tools[0].functionDeclarations[0].parameters.required).toEqual(before.tools[0].function.parameters.allOf.flatMap(branch => branch.required));
    expect(body).toEqual(before);
  });
});
