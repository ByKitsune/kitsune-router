import { DOCS_IDENTITY } from "../constants/identity.mjs";
import { getDocsOrigin, withBasePath } from "./urls.mjs";

export function createDocsMetadata({ title, description = DOCS_IDENTITY.summary, lang = "en", pathname, origin = getDocsOrigin(), basePath } = {}) {
  const pageTitle = title || `${DOCS_IDENTITY.name} Documentation`;
  const metadata = {
    title: title || {
      default: pageTitle,
      template: `%s | ${DOCS_IDENTITY.name} Docs`,
    },
    description,
    applicationName: `${DOCS_IDENTITY.name} Docs`,
    creator: DOCS_IDENTITY.organization,
    publisher: DOCS_IDENTITY.organization,
    openGraph: {
      title: `${pageTitle} | ${DOCS_IDENTITY.organization}`,
      description,
      siteName: `${DOCS_IDENTITY.name} Docs`,
      type: "website",
      locale: { en: "en_US", vi: "vi_VN", "zh-CN": "zh_CN", es: "es_ES", ja: "ja_JP" }[lang] || "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
    },
    icons: { icon: { url: withBasePath("/icons/logo.svg", basePath), type: "image/svg+xml" } },
  };

  if (origin) {
    metadata.metadataBase = new URL(origin);
    if (pathname) {
      const canonical = new URL(withBasePath(pathname, basePath), origin).href;
      metadata.alternates = { canonical };
      metadata.openGraph.url = canonical;
    }
  }

  // Images are emitted as literal head tags in the root layout. Otherwise Next
  // resolves a relative image against localhost when no public host is known.
  return metadata;
}
