"use client";

import { useEffect, useId, useState } from "react";
import { DOCS_CONFIG, t } from "@/constants/docsConfig";
import { DEFAULT_LANG } from "@/constants/languages";
import { ExternalLink, Menu, X } from "lucide-react";
import DocsSidebar from "./DocsSidebar";
import LanguageSwitcher from "./LanguageSwitcher";
import DocsBrand from "./DocsBrand";
import DocsDialog from "./DocsDialog";
import DocsSearch from "./DocsSearch";

export default function DocsHeader({ lang = DEFAULT_LANG, searchIndex = [] }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <>
      <header className="docs-header">
        <div className="docs-header-inner">
          <DocsBrand lang={lang} />
          <div className="docs-header-search"><DocsSearch entries={searchIndex} lang={lang} /></div>
          <div className="docs-header-actions">
            <LanguageSwitcher currentLang={lang} />
            <a
              href={DOCS_CONFIG.appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="docs-app-link"
            >
              <span>{t(lang, "goToApp")}</span>
              <ExternalLink size={16} aria-hidden="true" />
              <span className="sr-only"> ({t(lang, "newWindow")})</span>
            </a>
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="docs-icon-button docs-mobile-menu-trigger" aria-label={t(lang, "openMenu")} aria-haspopup="dialog" aria-expanded={mobileMenuOpen} aria-controls={menuId}>
              <Menu size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <DocsDialog open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} id={menuId} labelledBy={`${menuId}-title`} className="docs-menu-dialog">
        <div className="docs-dialog-heading">
          <h2 id={`${menuId}-title`}>{t(lang, "documentation")}</h2>
          <button type="button" onClick={() => setMobileMenuOpen(false)} className="docs-icon-button" aria-label={t(lang, "closeMenu")}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <DocsSidebar isMobile onClose={() => setMobileMenuOpen(false)} lang={lang} />
      </DocsDialog>
    </>
  );
}
