// Next Link adds basePath itself. Use this helper only for static assets,
// ordinary anchors, and the static-export redirect.
export function withBasePath(path = "", basePath = process.env.NEXT_PUBLIC_BASE_PATH || "") {
  const base = basePath.replace(/^\/+|\/+$/g, "");
  const suffix = path.replace(/^\/+/, "");
  return `${base ? `/${base}` : ""}/${suffix}`;
}

export function docsHref(lang, slug = "") {
  return `/${lang}/${slug ? `${slug.replace(/^\/+|\/+$/g, "")}/` : ""}`;
}

// No public docs host has been assigned. Only emit absolute share/canonical
// URLs when the operator explicitly supplies a public deployment origin.
export function getDocsOrigin(value = process.env.NEXT_PUBLIC_DOCS_ORIGIN) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "0.0.0.0" || hostname.startsWith("127.") || hostname === "[::1]") return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function socialImageUrl(origin = getDocsOrigin(), basePath) {
  const path = withBasePath("/brand/social-card.png", basePath);
  return origin ? new URL(path, origin).href : path;
}
