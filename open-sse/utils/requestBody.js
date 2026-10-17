// Copy mutable JSON containers without serializing or copying base64 strings.
export function cloneRequestBody(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneRequestBody);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const copy = { ...value };
  for (const key of Object.keys(copy)) {
    if (copy[key] && typeof copy[key] === "object") copy[key] = cloneRequestBody(copy[key]);
  }
  return copy;
}
