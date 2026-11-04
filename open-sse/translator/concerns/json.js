// Safe JSON.parse: non-string passthrough; on parse error return caller-chosen `fallback`.
export function safeParseJSON(str, fallback) {
  if (typeof str !== "string") return str;
  // Tool results are commonly plain text. Avoid constructing a SyntaxError for
  // every such result, but leave all plausible JSON to the native parser. Only
  // JSON's four whitespace bytes may precede a value; Unicode trim is broader.
  let offset = 0;
  let first = str.charCodeAt(offset);
  while (first === 0x20 || first === 0x09 || first === 0x0a || first === 0x0d) {
    first = str.charCodeAt(++offset);
  }
  if (!(first === 0x7b || first === 0x5b || first === 0x22 || first === 0x2d ||
      (first >= 0x30 && first <= 0x39) || first === 0x74 || first === 0x66 || first === 0x6e)) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}
