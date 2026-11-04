import { afterEach, describe, expect, it, vi } from "vitest";
import { safeParseJSON } from "../../open-sse/translator/concerns/json.js";
import { convertToolResultToGemini } from "../../open-sse/translator/formats/gemini.js";
import { TOOL_ERROR_PREFIX } from "../../open-sse/translator/schema/index.js";

const fallback = { marker: "caller-owned fallback" };
function reference(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

afterEach(() => vi.restoreAllMocks());

describe("safe JSON parser fast path", () => {
  it("retains every JSON value type, legal whitespace and exact numeric/string semantics", () => {
    const values = ["{}", "[]", "null", "true", "false", "0", "-0", "1e+30", "-2.5E-4", '""', '"\\ud800"', '"line\\n\\tend"', '{"__proto__":{"owned":true}}', '{"result":[null,false,0,"",{"items":[1,2]}]}'];
    const whitespace = ["", " ", "\t", "\r", "\n", " \t\r\n"];
    for (const value of values) for (const prefix of whitespace) for (const suffix of whitespace) {
      expect(safeParseJSON(prefix + value + suffix, fallback)).toEqual(reference(prefix + value + suffix));
    }
    expect(Object.is(safeParseJSON(" -0\r", fallback), -0)).toBe(true);
  });

  it("does not turn Unicode or other non-JSON whitespace into accepted JSON", () => {
    for (const prefix of ["\u00a0", "\ufeff", "\u2028", "\u2029", "\v", "\f", "\u0085", "\u0000"]) {
      for (const value of ["{}", "[]", "null", "true", "42", '"text"']) {
        expect(safeParseJSON(prefix + value, fallback)).toBe(fallback);
        expect(safeParseJSON(value + prefix, fallback)).toBe(fallback);
      }
    }
  });

  it("matches native parsing for malformed input and a deterministic range of text prefixes", () => {
    const malformed = ["", " ", "\t\r\n", "undefined", "NaN", "Infinity", "-Infinity", "01", "+1", "1.", "1e", "truex", "nul", "false false", "[tool_error] trace", "{broken", "[1,]", '"unterminated', "record: 1", "output: file.txt"];
    for (let code = 0; code < 256; code++) {
      const prefix = String.fromCharCode(code);
      malformed.push(prefix + "{}", prefix + "123", prefix + '"value"', prefix + "trace");
    }
    for (const value of malformed) expect(safeParseJSON(value, fallback)).toEqual(reference(value));
  });

  it("returns non-string input and failure fallbacks with their original identity", () => {
    for (const value of [undefined, null, false, true, 0, -0, NaN, 1n, {}, [], new String("{}")]) {
      expect(Object.is(safeParseJSON(value, fallback), value)).toBe(true);
    }
    expect(safeParseJSON("plain trace", fallback)).toBe(fallback);
    expect(safeParseJSON("{malformed}", fallback)).toBe(fallback);
  });

  it("avoids parse attempts for thousands of ordinary tool traces while still using the native parser for JSON", () => {
    const parse = vi.spyOn(JSON, "parse");
    for (let index = 0; index < 2000; index++) {
      expect(safeParseJSON(`record:${index}: file inspection complete`, fallback)).toBe(fallback);
      expect(safeParseJSON(` \t\r\nOutput ${index}: compiler trace`, fallback)).toBe(fallback);
    }
    expect(parse).not.toHaveBeenCalled();
    for (const value of ["{}", "[]", "42", "-0", "true", "false", "null", '"text"']) safeParseJSON(value, fallback);
    expect(parse).toHaveBeenCalledTimes(8);
  });

  it("keeps Google tool-result Structs, plain text, falsy JSON and error wrappers unchanged", () => {
    for (const value of ["plain output", " null ", "false", "0", '"quoted text"', "\ufeff{}", "{not-json}"]) {
      const parsed = reference(value);
      const response = parsed !== fallback && parsed !== null && typeof parsed === "object" ? parsed : { result: value };
      expect(convertToolResultToGemini(value)).toEqual({ response, parts: [] });
    }
    const object = { result: { items: [0, false, ""] }, metadata: { complete: true } };
    expect(convertToolResultToGemini(JSON.stringify(object))).toEqual({ response: object, parts: [] });
    const error = { error: { message: "original tool error" }, retry: false };
    expect(convertToolResultToGemini(TOOL_ERROR_PREFIX + JSON.stringify(error))).toEqual({ response: error, parts: [] });
  });
});
