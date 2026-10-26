import Link from "next/link";
import { ArrowLeft, ArrowRight, Code2 } from "lucide-react";
import { MarkdownRenderer } from "@/utils/markdown";
import { DOCS_CONFIG, getNavigation, t } from "@/constants/docsConfig";
import { DEFAULT_LANG } from "@/constants/languages";
import { docsHref } from "@/lib/urls.mjs";

export default function DocsContent({ content, lang = DEFAULT_LANG, slug = "" }) {
  const pages = getNavigation(lang).flatMap(section => section.items);
  const index = pages.findIndex(page => page.slug === slug);
  const previous = index > 0 ? pages[index - 1] : null;
  const next = index >= 0 ? pages[index + 1] : null;

  return (
    <main id="docs-content" tabIndex={-1} className="docs-main">
      <article className="docs-article">
        <MarkdownRenderer content={content} />
        {(previous || next) && (
          <nav className="docs-page-navigation" aria-label={`${t(lang, "previousPage")} / ${t(lang, "nextPage")}`}>
            {previous ? (
              <Link href={docsHref(lang, previous.slug)} className="docs-page-link">
                <ArrowLeft size={18} aria-hidden="true" />
                <span><span className="docs-page-direction">{t(lang, "previousPage")}</span><span>{previous.title}</span></span>
              </Link>
            ) : <span />}
            {next && (
              <Link href={docsHref(lang, next.slug)} className="docs-page-link docs-page-link-next">
                <span><span className="docs-page-direction">{t(lang, "nextPage")}</span><span>{next.title}</span></span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
          </nav>
        )}
        <footer className="docs-article-footer">
          <span>{DOCS_CONFIG.logo} <span className="docs-version">v{DOCS_CONFIG.version}</span></span>
          <a href={DOCS_CONFIG.githubUrl}><Code2 size={15} aria-hidden="true" />{DOCS_CONFIG.organization} / kitsune-router</a>
        </footer>
      </article>
    </main>
  );
}
