const TOKEN_FIELDS = {
  input: ["prompt_tokens", "input_tokens", "promptTokenCount"],
  cached: ["cached_tokens", "cache_read_input_tokens", "cachedContentTokenCount"],
  creation: ["cache_creation_input_tokens"],
  output: ["completion_tokens", "output_tokens", "candidatesTokenCount"],
};
const validCount = value => (typeof value === "number" || typeof value === "string" && value.trim() !== "")
  && Number.isSafeInteger(Number(value)) && Number(value) >= 0;

export function getTokenCount(tokens, kind) {
  const fields = TOKEN_FIELDS[kind];
  // Presence determines alias priority: explicit zero/null must not fall
  // through to a conflicting legacy alias. Canonical input is cache-inclusive;
  // this view must not manufacture an input count from a cache counter.
  const value = fields.map(field => tokens?.[field]).find(item => item !== undefined);
  return validCount(value) ? Number(value) : null;
}

export function formatTokens(tokens, kind) {
  return getTokenCount(tokens, kind)?.toLocaleString() ?? "—";
}

export function formatMilliseconds(value) {
  return Number.isFinite(value) && value >= 0 ? `${value.toLocaleString()}ms` : "—";
}

export function hasInvalidTokens(tokens) {
  return tokens?.usage_invalid === true || tokens?.cache_write_invalid === true
    || Object.values(TOKEN_FIELDS).flat().some(field => tokens?.[field] != null
      && !validCount(tokens[field]));
}
