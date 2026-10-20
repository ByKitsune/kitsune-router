import { describe, expect, it, vi } from "vitest";
import { cleanJSONSchemaForAntigravity } from "../../open-sse/translator/formats/gemini.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { openaiToAntigravityRequest } from "../../open-sse/translator/request/openai-to-gemini.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// Only I/O is replaced. Core, translator registration, the executor and all
// schema passes stay real; unexpected provider dispatch fails instead of dialing.
const io = vi.hoisted(() => ({ fetch: vi.fn(async () => { throw new Error("Unexpected provider dispatch"); }) }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {},
  saveRequestDetail: async () => {}, saveRequestUsage: async () => {},
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));

// The sanitizer intentionally mutates its private working schema; production
// callers clone parameters first. Assert nonmutation at that public boundary.
const clean = schema => cleanJSONSchemaForAntigravity(structuredClone(schema));
const credentials = { projectId: "schema-test-project", connectionId: "schema-test-connection" };
const model = "gemini-2.5-pro";

function nativeRequest(parameters) {
  return {
    request: {
      contents: [{ role: "user", parts: [{ text: "Use the tool." }] }],
      tools: [{ functionDeclarations: [{ name: "schema_probe", parameters }] }],
    },
  };
}

function nativeParameters(body, requestedModel = model) {
  const outbound = new AntigravityExecutor().transformRequest(requestedModel, body, false, credentials);
  // Inspect the JSON wire representation, not only the intermediate JS object.
  return JSON.parse(JSON.stringify(outbound)).request.tools[0].functionDeclarations[0].parameters;
}

describe("selected Antigravity upstream tool-schema fixes", () => {
  it("omits unrepresentable empty enum values on the final native wire (#4973)", () => {
    const schema = {
      type: "object",
      properties: {
        calendarId: { type: "string", enum: ["", "primary", "secondary"] },
        emptyEnum: { type: "string", enum: [] },
        emptyConst: { type: "string", const: "" },
        nullConst: { type: "string", const: null },
        noValues: { type: "string", enum: ["", null, undefined] },
      },
    };
    const expected = {
      type: "object",
      properties: {
        calendarId: { type: "string", enum: ["primary", "secondary"] },
        emptyEnum: { type: "string" },
        emptyConst: { type: "string" },
        nullConst: { type: "string" },
        noValues: { type: "string" },
      },
    };
    expect(clean(schema)).toEqual(expected);
    const body = nativeRequest(schema);
    const original = structuredClone(body);
    expect(nativeParameters(body)).toEqual(expected);
    expect(body).toEqual(original);
  });

  it("normalizes homogeneous draft-4/7 tuple items to one native Schema (#4798)", () => {
    const schema = {
      type: "object",
      properties: {
        coordinates: {
          type: "array",
          items: [
            { type: "number", minimum: 0 },
            { minimum: 0, type: "number" },
          ],
        },
        matrix: {
          type: "array",
          items: {
            type: "array",
            items: [{ type: "string" }, { type: "string" }],
          },
        },
      },
    };
    const expected = {
      type: "object",
      properties: {
        coordinates: { type: "array", items: { type: "number", minimum: 0 } },
        matrix: { type: "array", items: { type: "array", items: { type: "string" } } },
      },
    };
    expect(clean(schema)).toEqual(expected);
    const body = nativeRequest(schema);
    const original = structuredClone(body);
    expect(nativeParameters(body)).toEqual(expected);
    expect(body).toEqual(original);
  });

  it.each([
    [{ type: "string" }, { type: "number" }],
    [{ type: "string", enum: ["read"] }, { type: "string", enum: ["write"] }],
    [{ type: "string", minLength: 1 }, { type: "string", minLength: 2 }],
    [{ const: 0 }, { const: "0" }],
    [{ type: "null" }, { type: "string" }],
    [{ $ref: "#/$defs/First" }, { $ref: "#/$defs/Second" }],
  ])("rejects heterogeneous tuple items locally without dropping a variant: %j / %j", (first, second) => {
    const schema = { type: "object", properties: { pair: { type: "array", items: [first, second] } } };
    const diagnostic = expect.objectContaining({
      code: "unsupported_parameter", param: "tools", message: expect.stringContaining("unsupported_schema"),
    });
    expect(() => clean(schema)).toThrowError(diagnostic);
    const body = nativeRequest(schema);
    const original = structuredClone(body);
    expect(() => nativeParameters(body)).toThrowError(diagnostic);
    expect(body).toEqual(original);
  });

  it("rejects heterogeneous prefixItems instead of falling through selectBest", () => {
    const schema = { type: "array", prefixItems: [{ type: "string" }, { type: "number" }] };
    const diagnostic = expect.objectContaining({
      code: "unsupported_parameter", param: "tools", message: expect.stringContaining("unsupported_schema"),
    });
    expect(() => clean(schema)).toThrowError(diagnostic);
    expect(() => nativeParameters(nativeRequest(schema))).toThrowError(diagnostic);
  });

  describe.each([
    { draft: "draft-7", tuple: { items: [{ type: "string" }], additionalItems: { type: "number" } } },
    { draft: "2020-12", tuple: { prefixItems: [{ type: "string" }], items: { type: "number" } } },
    { draft: "2020-12 empty-array-tail", tuple: { prefixItems: [{ type: "string" }], items: [] } },
    { draft: "2020-12 homogeneous-array-tail", tuple: { prefixItems: [{ type: "string" }], items: [{ type: "string" }] } },
  ])("incompatible explicit $draft tuple tails", ({ tuple }) => {
    const schema = { type: "object", properties: { values: { type: "array", ...tuple } } };
    const diagnostic = expect.objectContaining({
      code: "unsupported_parameter", type: "invalid_request_error", status: 400, param: "tools",
      message: expect.stringContaining("unsupported_schema"),
    });

    it("sanitizer rejects positional tail differences before lossy normalization", () => {
      expect(() => clean(schema)).toThrowError(diagnostic);
    });

    it("native wire rejects positional tail differences without mutating the source", () => {
      const body = nativeRequest(schema);
      const original = structuredClone(body);
      expect(() => nativeParameters(body)).toThrowError(diagnostic);
      expect(body).toEqual(original);
    });

    it("executor rejects positional tail differences before credentials or dispatch", async () => {
      const executor = new AntigravityExecutor();
      const headers = vi.spyOn(executor, "buildHeaders").mockImplementation(() => {
        throw new Error("Unexpected dispatch");
      });
      const body = nativeRequest(schema);
      const original = structuredClone(body);
      io.fetch.mockClear();
      await expect(executor.execute({ model, body, stream: false, credentials })).rejects.toMatchObject({
        code: "unsupported_parameter", type: "invalid_request_error", status: 400, param: "tools",
      });
      expect(headers).not.toHaveBeenCalled();
      expect(io.fetch).not.toHaveBeenCalled();
      expect(body).toEqual(original);
    });

    it.each(["translated Chat", "native passthrough"])("Core rejects %s positional tail differences with local HTTP 400", async route => {
      const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");
      const native = route === "native passthrough";
      const body = native ? { ...nativeRequest(schema), userAgent: "antigravity", stream: false } : {
        messages: [{ role: "user", content: "Use the tool." }], stream: false,
        tools: [{ type: "function", function: { name: "schema_probe", parameters: schema } }],
      };
      const original = structuredClone(body);
      const debug = vi.fn();
      // Guard the I/O boundary even during RED. Core and executor stay real.
      const headers = vi.spyOn(AntigravityExecutor.prototype, "buildHeaders").mockImplementation(() => {
        throw new Error("Unexpected dispatch");
      });
      io.fetch.mockClear();
      try {
        const result = await handleChatCore({
          body, modelInfo: { provider: "antigravity", model }, credentials: { ...credentials },
          sourceFormatOverride: native ? FORMATS.ANTIGRAVITY : FORMATS.OPENAI,
          clientRawRequest: { endpoint: "/v1/chat/completions", body, headers: native ? { "user-agent": "antigravity/schema-fixture" } : {} },
          connectionId: credentials.connectionId, log: { debug, info() {}, warn() {} },
        });
        expect(debug.mock.calls.some(([tag]) => tag === "PASSTHROUGH")).toBe(native);
        expect(result.success).toBe(false);
        expect(result.response.status).toBe(400);
        expect((await result.response.json()).error).toMatchObject({
          type: "invalid_request_error", code: "unsupported_parameter", param: "tools",
          message: expect.stringContaining("unsupported_schema"),
        });
        expect(headers).not.toHaveBeenCalled();
        expect(io.fetch).not.toHaveBeenCalled();
        expect(body).toEqual(original);
      } finally {
        headers.mockRestore();
      }
    });
  });

  it.each([
    { draft: "draft-7", keyword: "items", tailKeyword: "additionalItems" },
    { draft: "2020-12", keyword: "prefixItems", tailKeyword: "items" },
  ])("retains matching $draft tuple tails and unrelated schema fields on the wire", ({ keyword, tailKeyword }) => {
    const item = { type: "number", minimum: 0, description: "Nonnegative coordinate" };
    const reordered = { description: "Nonnegative coordinate", minimum: 0, type: "number" };
    const schema = {
      type: "object", description: "Preserve the surrounding schema",
      properties: {
        values: { type: "array", description: "Coordinates", [keyword]: [item, reordered], [tailKeyword]: reordered },
        count: { type: "integer", minimum: 0, maximum: 9 },
      },
      required: ["values", "count"],
    };
    const expected = {
      type: "object", description: "Preserve the surrounding schema",
      properties: {
        values: { type: "array", description: "Coordinates", items: item },
        count: { type: "integer", minimum: 0, maximum: 9 },
      },
      required: ["values", "count"],
    };
    expect(clean(schema)).toEqual(expected);
    const body = nativeRequest(schema);
    const original = structuredClone(body);
    expect(nativeParameters(body)).toEqual(expected);
    expect(body).toEqual(original);
    const source = {
      messages: [{ role: "user", content: "Use the tool." }],
      tools: [{ type: "function", function: { name: "schema_probe", parameters: schema } }],
    };
    const originalSource = structuredClone(source);
    const translated = openaiToAntigravityRequest(model, source, false, credentials);
    expect(nativeParameters(translated)).toEqual(expected);
    expect(source).toEqual(originalSource);
  });

  it.each([
    { draft: "draft-7 omitted-tail", tuple: { items: ["string", "string"] } },
    { draft: "draft-7 matching-tail", tuple: { items: ["string", { type: "string" }], additionalItems: "string" } },
    { draft: "2020-12 omitted-tail", tuple: { prefixItems: ["string", "string"] } },
    { draft: "2020-12 matching-tail", tuple: { prefixItems: ["string", { type: "string" }], items: "string" } },
  ])("applies existing string-schema shorthand expansion to homogeneous $draft tuple members", ({ tuple }) => {
    const schema = { type: "array", ...tuple };
    const expected = { type: "array", items: { type: "string" } };
    expect(clean(schema)).toEqual(expected);
    const body = nativeRequest(schema);
    const original = structuredClone(body);
    expect(nativeParameters(body)).toEqual(expected);
    expect(body).toEqual(original);
  });

  it("preserves an ordinary items schema when prefixItems has no positions", () => {
    const schema = { type: "array", prefixItems: [], items: { type: "number", minimum: 0 } };
    const expected = { type: "array", items: { type: "number", minimum: 0 } };
    expect(clean(schema)).toEqual(expected);
    const body = nativeRequest(schema);
    const original = structuredClone(body);
    expect(nativeParameters(body)).toEqual(expected);
    expect(body).toEqual(original);
  });

  describe.each([
    { draft: "draft-7", keyword: "items", tailKeyword: "additionalItems" },
    { draft: "2020-12", keyword: "prefixItems", tailKeyword: "items" },
  ])("tuple compatibility controls for $draft", ({ keyword, tailKeyword }) => {
    it.each([true, false, {}, null, 7, [], "number"].map(tail => [tail]))(
      "rejects an explicit tail that cannot share the string prefix schema: %j", tail => {
        const schema = { type: "array", [keyword]: [{ type: "string" }], [tailKeyword]: tail };
        const diagnostic = expect.objectContaining({
          code: "unsupported_parameter", type: "invalid_request_error", status: 400, param: "tools",
        });
        expect(() => clean(schema)).toThrowError(diagnostic);
        const body = nativeRequest(schema);
        const original = structuredClone(body);
        expect(() => nativeParameters(body)).toThrowError(diagnostic);
        expect(body).toEqual(original);
      },
    );

    it.each([
      [{ type: "string", enum: ["read"] }, { type: "string", enum: ["write"] }],
      [{ type: "string", minLength: 1 }, { type: "string", minLength: 2 }],
      [{ const: 0 }, { const: "0" }],
      [{ type: "object", properties: { flag: true } }, { type: "object", properties: { flag: false } }],
    ])("compares the explicit tail before lossy conversions: %j / %j", (prefix, tail) => {
      const schema = { type: "array", [keyword]: [prefix], [tailKeyword]: tail };
      const diagnostic = expect.objectContaining({ code: "unsupported_parameter", param: "tools" });
      expect(() => clean(schema)).toThrowError(diagnostic);
      expect(() => nativeParameters(nativeRequest(schema))).toThrowError(diagnostic);
    });

    it.each([null, true, false, 0, 42, []].map(member => [member]))("rejects malformed tuple members with the typed diagnostic: %j", member => {
      const schema = { type: "array", [keyword]: [member, member] };
      const diagnostic = expect.objectContaining({
        code: "unsupported_parameter", type: "invalid_request_error", status: 400, param: "tools",
      });
      expect(() => clean(schema)).toThrowError(diagnostic);
      expect(() => nativeParameters(nativeRequest(schema))).toThrowError(diagnostic);
    });

    it("retains the legacy placeholder approximation when both prefix and tail are empty schemas", () => {
      const schema = { type: "array", [keyword]: [{}, {}], [tailKeyword]: {} };
      const expected = { type: "array", items: {
        type: "object",
        properties: { reason: { type: "string", description: "Brief explanation of why you are calling this tool" } },
        required: ["reason"],
      } };
      expect(clean(schema)).toEqual(expected);
      const body = nativeRequest(schema);
      const original = structuredClone(body);
      expect(nativeParameters(body)).toEqual(expected);
      expect(body).toEqual(original);
    });
  });

  it.each(["read", null, false, 7, { read: true }])("keeps existing non-array enum cleanup without changing explicit types: %j", invalidEnum => {
    const schema = { type: "object", properties: {
      inferred: { enum: invalidEnum }, explicit: { type: "integer", enum: invalidEnum },
    } };
    const expected = { type: "object", properties: { inferred: { type: "string" }, explicit: { type: "integer" } } };
    expect(clean(schema)).toEqual(expected);
    const body = nativeRequest(schema);
    const original = structuredClone(body);
    expect(nativeParameters(body)).toEqual(expected);
    expect(body).toEqual(original);
  });

  it("uses the existing bare-array fallback for empty tuple items", () => {
    const schema = { type: "object", properties: { values: { type: "array", items: [] } } };
    const expected = { type: "object", properties: { values: { type: "array", items: { type: "string" } } } };
    expect(clean(schema)).toEqual(expected);
    expect(nativeParameters(nativeRequest(schema))).toEqual(expected);
  });

  it.each(["enum", "const", "type", "properties", "items", "additionalItems", "required", "$defs", "definitions", "anyOf", "oneOf", "allOf", "prefixItems", "title", "default", "x-custom"])(
    "preserves a property named %s while sanitizing its enum", name => {
      const schema = {
        type: "object",
        properties: { [name]: { type: "string", enum: ["", null, 0, false, " ", "value"] } },
        required: [name, "missing"],
      };
      const expected = {
        type: "object",
        properties: { [name]: { type: "string", enum: ["0", "false", " ", "value"] } },
        required: [name],
      };
      expect(clean(schema)).toEqual(expected);
      const body = nativeRequest(schema);
      const original = structuredClone(body);
      expect(nativeParameters(body)).toEqual(expected);
      expect(body).toEqual(original);
    },
  );

  it("retains explicit zero/false types and cleans nested anyOf/allOf schemas", () => {
    const schema = {
      type: "object",
      $defs: { Choice: { type: "string", enum: ["", "choice"] } },
      properties: {
        zero: { type: "integer", const: 0 },
        disabled: { type: "boolean", const: false },
        reference: { $ref: "#/$defs/Choice" },
        composed: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              allOf: [
                { properties: { const: { const: "" } }, required: ["const"] },
                { properties: { items: { type: "array", items: { enum: ["", "keep"] } } } },
              ],
            },
          ],
        },
      },
    };
    const original = structuredClone(schema);
    const out = clean(schema);
    expect(out.properties.zero).toEqual({ type: "integer", enum: ["0"] });
    expect(out.properties.disabled).toEqual({ type: "boolean", enum: ["false"] });
    expect(out.properties.composed).toEqual({
      type: "object",
      properties: { const: { type: "string" }, items: { type: "array", items: { type: "string", enum: ["keep"] } } },
      required: ["const"],
    });
    // Preserve existing ref stripping, not a claim that this legacy sanitizer
    // resolves refs or enforces their constraints. The source must keep them.
    expect(out).not.toHaveProperty("$defs");
    expect(out.properties.reference).toEqual({ type: "string" });
    expect(schema).toEqual(original);
    const body = nativeRequest(schema);
    const source = structuredClone(body);
    expect(nativeParameters(body)).toEqual(out);
    expect(body).toEqual(source);
  });

  it("retains existing object placeholders for metadata-only and ref-only array items", () => {
    for (const item of [{}, { title: "Legacy item", default: [] }, { $ref: "#/$defs/Legacy" }]) {
      const schema = { type: "array", items: { type: "array", items: item } };
      const out = clean(schema);
      expect(out.items.items).toEqual({
        type: "object",
        properties: { reason: { type: "string", description: "Brief explanation of why you are calling this tool" } },
        required: ["reason"],
      });
      expect(nativeParameters(nativeRequest(schema))).toEqual(out);
    }
  });

  it.each(["gemini-2.5-pro", "claude-sonnet-4-6"])(
    "preserves source input through the real Chat translator and final %s envelope", requestedModel => {
      const source = {
        messages: [{ role: "user", content: "Use the tool." }],
        tools: [{
          type: "function",
          function: {
            name: "schema_probe",
            parameters: {
              type: "object",
              properties: {
                enum: { type: "string", enum: ["", "ready"] },
                const: { const: false },
                coordinates: { type: "array", items: [{ type: "number" }, { type: "number" }] },
              },
            },
          },
        }],
      };
      const original = structuredClone(source);
      const translated = openaiToAntigravityRequest(requestedModel, source, false, credentials);
      const beforeExecutor = structuredClone(translated);
      const wire = nativeParameters(translated, requestedModel);
      expect(wire.properties).toEqual({
        enum: { type: "string", enum: ["ready"] },
        const: { type: "string", enum: ["false"] },
        coordinates: { type: "array", items: { type: "number" } },
      });
      expect(source).toEqual(original);
      expect(translated).toEqual(beforeExecutor);
    },
  );

  it.each(["translated Chat", "native passthrough"])("Core returns typed local HTTP 400 for %s tuple rejection", async route => {
    const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");
    const schema = { type: "object", properties: { pair: { type: "array", items: [{ type: "string" }, { type: "number" }] } } };
    const native = route === "native passthrough";
    const body = native ? { ...nativeRequest(schema), userAgent: "antigravity", stream: false } : {
      messages: [{ role: "user", content: "Use the tool." }], stream: false,
      tools: [{ type: "function", function: { name: "schema_probe", parameters: schema } }],
    };
    const original = structuredClone(body);
    const debug = vi.fn();
    io.fetch.mockClear();
    const result = await handleChatCore({
      body, modelInfo: { provider: "antigravity", model }, credentials: { ...credentials },
      sourceFormatOverride: native ? FORMATS.ANTIGRAVITY : FORMATS.OPENAI,
      clientRawRequest: { endpoint: "/v1/chat/completions", body, headers: native ? { "user-agent": "antigravity/schema-fixture" } : {} },
      connectionId: credentials.connectionId, log: { debug, info() {}, warn() {} },
    });
    expect(debug.mock.calls.some(([tag]) => tag === "PASSTHROUGH")).toBe(native);
    expect(result.success).toBe(false);
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toMatchObject({
      type: "invalid_request_error", code: "unsupported_parameter", param: "tools",
      message: expect.stringContaining("unsupported_schema"),
    });
    expect(io.fetch).not.toHaveBeenCalled();
    expect(body).toEqual(original);
  });

  describe("schema-only tuple traversal", () => {
    const base = { type: "object", properties: { items: { type: "array", items: { type: "integer" } } } };
    const literal = { items: [1, 2], prefixItems: [1, 2] };
    const cases = [
      { name: "default", schema: { ...base, default: { items: [1, 2] } }, expected: base },
      { name: "examples", schema: { ...base, examples: [{ prefixItems: [1, 2] }] }, expected: base },
      { name: "example", schema: { ...base, example: literal }, expected: base },
      { name: "object enum", schema: { ...base, enum: [literal] }, expected: { ...base, enum: ["[object Object]"] } },
      { name: "object const", schema: { ...base, const: literal }, expected: { ...base, enum: ["[object Object]"] } },
      { name: "vendor extension", schema: { ...base, "x-custom": { nested: [literal] } }, expected: base },
      { name: "property dependencies", schema: { ...base, dependencies: { items: ["items", "prefixItems"] } }, expected: base },
    ];

    function mockResponse() {
      io.fetch.mockReset();
      io.fetch.mockImplementation(async () => Response.json({ response: {
        candidates: [{ content: { role: "model", parts: [{ text: "Offline schema fixture" }] }, finishReason: "STOP" }],
      } }));
    }

    describe.each(cases)("$name literal data", ({ schema, expected }) => {
      it("sanitizer and native wire keep the existing compatibility output without tuple rejection", () => {
        expect(clean(schema)).toEqual(expected);
        const body = nativeRequest(schema);
        const original = structuredClone(body);
        expect(nativeParameters(body)).toEqual(expected);
        expect(body).toEqual(original);
      });

      it("real executor accepts literal data and serializes the expected schema without source mutation", async () => {
        const body = nativeRequest(schema);
        const original = structuredClone(body);
        mockResponse();
        try {
          const result = await new AntigravityExecutor().execute({ model, body, stream: false, credentials });
          expect(result.response.status).toBe(200);
          expect(io.fetch).toHaveBeenCalledTimes(1);
          const wire = JSON.parse(io.fetch.mock.calls[0][1].body);
          expect(wire.request.tools[0].functionDeclarations[0].parameters).toEqual(expected);
          expect(body).toEqual(original);
        } finally {
          io.fetch.mockReset();
        }
      });

      it.each(["translated Chat", "native passthrough"])("Core accepts %s literal data with the expected outbound schema", async route => {
        const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");
        const native = route === "native passthrough";
        const body = native ? { ...nativeRequest(schema), userAgent: "antigravity", stream: false } : {
          messages: [{ role: "user", content: "Use the tool." }], stream: false,
          tools: [{ type: "function", function: { name: "schema_probe", parameters: schema } }],
        };
        const original = structuredClone(body);
        const debug = vi.fn();
        mockResponse();
        try {
          const result = await handleChatCore({
            body, modelInfo: { provider: "antigravity", model }, credentials: { ...credentials },
            sourceFormatOverride: native ? FORMATS.ANTIGRAVITY : FORMATS.OPENAI,
            clientRawRequest: { endpoint: "/v1/chat/completions", body, headers: native ? { "user-agent": "antigravity/schema-fixture" } : {} },
            connectionId: credentials.connectionId, log: { debug, info() {}, warn() {} },
          });
          expect(debug.mock.calls.some(([tag]) => tag === "PASSTHROUGH")).toBe(native);
          expect(result.response.status).toBe(200);
          expect(result.success).toBe(true);
          await result.response.json();
          expect(io.fetch).toHaveBeenCalledTimes(1);
          const wire = JSON.parse(io.fetch.mock.calls[0][1].body);
          expect(wire.request.tools[0].functionDeclarations[0].parameters).toEqual(expected);
          expect(body).toEqual(original);
        } finally {
          io.fetch.mockReset();
        }
      });
    });

    it.each([
      ...["properties", "patternProperties", "$defs", "definitions", "dependentSchemas", "dependencies"].map(key =>
        [key, tuple => ({ [key]: { items: tuple } })]),
      ...["anyOf", "oneOf", "allOf"].map(key =>
        [key, tuple => ({ [key]: [{ type: "object" }, { properties: { prefixItems: tuple } }] })]),
      ...["items", "additionalItems", "contains", "if", "then", "else", "not", "propertyNames", "unevaluatedItems", "contentSchema", "additionalProperties", "unevaluatedProperties"].map(key =>
        [key, tuple => ({ [key]: { properties: { prefixItems: tuple } } })]),
    ])("still rejects heterogeneous real schemas under %s before lossy passes", (_name, wrap) => {
      for (const keyword of ["items", "prefixItems"]) {
        const schema = { ...base, ...wrap({ type: "array", [keyword]: [{ type: "string" }, { type: "number" }] }) };
        const diagnostic = expect.objectContaining({
          code: "unsupported_parameter", type: "invalid_request_error", status: 400, param: "tools",
          message: expect.stringContaining("unsupported_schema"),
        });
        expect(() => clean(schema)).toThrowError(diagnostic);
        const body = nativeRequest(schema);
        const original = structuredClone(body);
        expect(() => nativeParameters(body)).toThrowError(diagnostic);
        expect(body).toEqual(original);
      }
    });
  });

  it("rejects unsupported tuples before credentials or network dispatch", async () => {
    const executor = new AntigravityExecutor();
    // A fail-fast dispatch guard keeps the RED-capable test offline even if
    // tuple rejection regresses; the real sanitizer/execute path still runs.
    const headers = vi.spyOn(executor, "buildHeaders").mockImplementation(() => {
      throw new Error("Unexpected dispatch");
    });
    const body = nativeRequest({ type: "array", items: [{ type: "string" }, { type: "number" }] });
    const original = structuredClone(body);
    await expect(executor.execute({ model, body, stream: false, credentials })).rejects.toMatchObject({
      code: "unsupported_parameter", type: "invalid_request_error", status: 400, param: "tools",
    });
    expect(headers).not.toHaveBeenCalled();
    expect(body).toEqual(original);
  });
});
