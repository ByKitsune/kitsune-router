// Jina's official crawler-options DTO accepts x-return-format as an alias for
// x-respond-with. Tavily Extract's format enum is markdown/text. These are the
// textual formats this router can normalize, not every native output surface.
export const DEFAULT_WEB_FETCH_FORMAT = "markdown";
export const WEB_FETCH_FORMATS = Object.freeze({
  "jina-reader": Object.freeze(["markdown", "text", "html"]),
  tavily: Object.freeze(["markdown", "text"]),
});

export function getWebFetchFormatError(provider, format) {
  const supported = Object.hasOwn(WEB_FETCH_FORMATS, provider) ? WEB_FETCH_FORMATS[provider] : null;
  if (!supported || format === undefined || (typeof format === "string" && supported.includes(format))) return null;
  return `Unsupported web fetch format for ${provider}. Supported formats: ${supported.join(", ")}`;
}
