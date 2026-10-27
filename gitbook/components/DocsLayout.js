import DocsHeader from "./DocsHeader";
import DocsSidebar from "./DocsSidebar";
import DocsToc from "./DocsToc";
import { DEFAULT_LANG } from "@/constants/languages";
import { t } from "@/constants/docsConfig";
import { getSearchIndex } from "@/lib/content";

export default function DocsLayout({ children, headings = [], lang = DEFAULT_LANG }) {
  return (
    <div className="docs-shell" lang={lang}>
      <a className="docs-skip-link" href="#docs-content">{t(lang, "skipToContent")}</a>
      <DocsHeader lang={lang} searchIndex={getSearchIndex(lang)} />
      <div className="docs-frame">
        <div className="docs-desktop-sidebar">
          <DocsSidebar lang={lang} />
        </div>
        <div className="docs-reading-layout">
          {children}
          <div className="docs-desktop-toc">
            <DocsToc headings={headings} lang={lang} />
          </div>
        </div>
      </div>
    </div>
  );
}
