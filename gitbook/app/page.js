import { DEFAULT_LANG } from "@/constants/languages";
import { DOCS_IDENTITY } from "@/constants/identity.mjs";
import { docsHref, withBasePath } from "@/lib/urls.mjs";

const target = withBasePath(docsHref(DEFAULT_LANG));

// Static-friendly redirect to default language (meta refresh + client script)
export const metadata = {
  title: `${DOCS_IDENTITY.name} Documentation`,
};

export default function HomePage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")});`
        }}
      />
      <meta httpEquiv="refresh" content={`0; url=${target}`} />
      <main className="docs-redirect">
        <h1>{DOCS_IDENTITY.name} Documentation</h1>
        <p>Redirecting to the documentation. <a href={target}>Continue in English</a>.</p>
      </main>
    </>
  );
}
