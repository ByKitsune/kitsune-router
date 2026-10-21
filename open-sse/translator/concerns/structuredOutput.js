import { CLOUD_CODE_OUTPUT_SCHEMA as policy } from "../schema/structuredOutput.js";

const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
function unsupported(param) {
  const error = new Error(`unsupported_parameter: This destination cannot preserve ${param} using its supported structured-output wire; use a supported schema or a different destination.`);
  error.code = "unsupported_parameter";
  error.param = param;
  throw error;
}

// Separate from cleanJSONSchemaForAntigravity: that compatibility walker is
// intentionally lossy for tools. Never reuse it for explicit output intent.
function outputSchema(schema, param, native = false) {
  let nodes = 0;
  let bytes = 0;
  const charge = value => {
    bytes += typeof value === "string" ? Buffer.byteLength(value, "utf8") + 4 : 8;
    if (bytes > policy.maxBytes) unsupported(param);
  };
  const walk = (node, depth) => {
    if (++nodes > policy.maxNodes || depth > policy.maxDepth || !record(node)) unsupported(param);
    for (const key of Object.keys(node)) {
      charge(key);
      if (!policy.keys.has(key)) unsupported(param);
    }
    let type = node.type;
    let nullable = node.nullable;
    if (nullable !== undefined && typeof nullable !== "boolean") unsupported(param);
    if (Array.isArray(type)) {
      if (native || node.enum !== undefined || type.length !== 2 || !type.includes("null") || new Set(type).size !== 2 || nullable === false) unsupported(param);
      type = type.find(value => value !== "null");
      nullable = true;
    }
    if (typeof type !== "string" || !policy.types.has(type.toLowerCase())) unsupported(param);
    const out = { type: type.toLowerCase() };
    if (nullable !== undefined) out.nullable = nullable;
    for (const key of ["title", "description"]) {
      if (node[key] === undefined) continue;
      if (typeof node[key] !== "string") unsupported(param);
      charge(node[key]);
      out[key] = node[key];
    }
    if (node.properties !== undefined) {
      if (out.type !== "object" || !record(node.properties)) unsupported(param);
      out.properties = Object.fromEntries(Object.entries(node.properties).map(([key, child]) => {
        charge(key);
        return [key, walk(child, depth + 1)];
      }));
    }
    for (const key of ["required", "propertyOrdering"]) {
      if (node[key] === undefined) continue;
      const values = node[key];
      if (out.type !== "object" || !Array.isArray(values) || new Set(values).size !== values.length ||
          values.some(name => typeof name !== "string" || !Object.hasOwn(out.properties || {}, name))) unsupported(param);
      out[key] = values.map(name => { charge(name); return name; });
    }
    if (node.items !== undefined) {
      if (out.type !== "array") unsupported(param);
      out.items = walk(node.items, depth + 1);
    } else if (out.type === "array") unsupported(param);
    if (node.enum !== undefined) {
      if (out.type !== "string" || !Array.isArray(node.enum) || !node.enum.length ||
          node.enum.some(value => typeof value !== "string" || !value.length)) unsupported(param);
      out.enum = node.enum.map(value => { charge(value); return value; });
    }
    for (const key of ["minimum", "maximum", "minItems", "maxItems"]) {
      if (node[key] === undefined) continue;
      const value = node[key];
      const length = key === "minItems" || key === "maxItems";
      if (!Number.isFinite(value) || (length ? out.type !== "array" || !Number.isSafeInteger(value) || value < 0 : !["number", "integer"].includes(out.type))) unsupported(param);
      charge(value);
      out[key] = value;
    }
    if (out.minimum > out.maximum || out.minItems > out.maxItems) unsupported(param);
    return out;
  };
  return walk(schema, 0);
}

// Candidate: upstream PR #4667 at db67d97bcc799adf5cf3e358a0ea96e6d99feb40.
// Only the legacy responseSchema transport is selected here; this is not
// evidence that Cloud Code accepts the public API's responseJsonSchema field,
// or that its Claude backend supports structured generation at all.
export function antigravityOutputConfig(body, model) {
  const request = body?.request || body;
  const config = request?.generationConfig;
  const prefix = body?.request ? "request.generationConfig" : "generationConfig";
  if (config?.responseJsonSchema != null) unsupported(`${prefix}.responseJsonSchema`);
  const formats = [
    ["response_format", body?.response_format, true],
    ["text.format", body?.text?.format, false],
    ["output_config.format", body?.output_config?.format, false],
  ].filter(([, format]) => format != null);
  const native = config?.responseSchema != null || config?.responseMimeType != null;
  if (formats.length > 1 || (formats.length && native)) unsupported(formats[0][0]);
  // Native passthrough does not run a Chat codec. Reject foreign control fields
  // there rather than validate a mapping that dispatch will never apply.
  if (formats.length && (body?.request || Array.isArray(body?.contents))) unsupported(formats[0][0]);
  if (!formats.length && !native) return null;

  let schema;
  let param;
  let mime;
  if (native) {
    param = config.responseSchema != null ? `${prefix}.responseSchema` : `${prefix}.responseMimeType`;
    mime = config.responseMimeType;
    schema = config.responseSchema;
    if (schema != null && mime !== "application/json") unsupported(param);
  } else {
    const [location, format, nested] = formats[0];
    param = location;
    if (!record(format)) unsupported(param);
    if (format.type === "text" || format.type === "json_object") {
      if (Object.keys(format).some(key => key !== "type")) unsupported(param);
    }
    if (format.type === "text") return { responseMimeType: "text/plain" };
    if (format.type !== "json_object" && format.type !== "json_schema") unsupported(param);
    mime = "application/json";
    if (format.type === "json_schema") {
      const details = nested ? format.json_schema : format;
      if (!record(details) || (details.strict !== undefined && typeof details.strict !== "boolean") || details.schema == null) unsupported(param);
      if ((nested && Object.keys(format).some(key => key !== "type" && key !== "json_schema")) ||
          Object.keys(details).some(key => !(nested ? policy.schemaKeys : policy.formatKeys).has(key)) ||
          (details.name !== undefined && (typeof details.name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(details.name))) ||
          (details.description !== undefined && typeof details.description !== "string")) unsupported(param);
      schema = details.schema;
    }
  }
  if (mime !== "application/json" && mime !== "text/plain") unsupported(param);
  if (mime === "application/json" && !/^gemini(?:-|$)/i.test(model || "")) unsupported(param);
  return { responseMimeType: mime, ...(schema != null ? { responseSchema: outputSchema(schema, param, native) } : {}) };
}
