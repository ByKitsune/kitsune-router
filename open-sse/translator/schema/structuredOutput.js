// Deliberately smaller than the legacy tool sanitizer: output constraints must
// not be approximated, stringified or replaced with tool placeholders.
export const CLOUD_CODE_OUTPUT_SCHEMA = {
  types: new Set(["object", "array", "string", "number", "integer", "boolean"]),
  keys: new Set(["type", "title", "description", "nullable", "properties", "required", "propertyOrdering", "items", "enum", "minimum", "maximum", "minItems", "maxItems"]),
  formatKeys: new Set(["type", "name", "description", "schema", "strict"]),
  schemaKeys: new Set(["name", "description", "schema", "strict"]),
  maxDepth: 64,
  maxNodes: 10000,
  maxBytes: 256 * 1024,
};
