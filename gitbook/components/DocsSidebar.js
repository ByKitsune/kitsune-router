"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown, Code2, ExternalLink, HelpCircle, Layers, Plug, Rocket, Server, Zap } from "lucide-react";
import { DOCS_CONFIG, getNavigation, t } from "@/constants/docsConfig";
import { DEFAULT_LANG } from "@/constants/languages";
import { docsHref } from "@/lib/urls.mjs";

const SECTION_ICONS = {
  gettingStarted: Rocket,
  providers: Layers,
  features: Zap,
  integration: Plug,
  deployment: Server,
  help: HelpCircle,
};

export default function DocsSidebar({ isMobile = false, onClose, lang = DEFAULT_LANG }) {
  const pathname = usePathname();
  const navigation = getNavigation(lang);
  const [collapsedSections, setCollapsedSections] = useState([]);
  const id = useId();
  const currentPath = (pathname || "").replace(/\/$/, "");

  const toggleSection = (key) => {
    setCollapsedSections(previous => previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key]);
  };

  return (
    <aside className={`docs-sidebar${isMobile ? " docs-sidebar-mobile" : ""}`}>
      <div className="docs-sidebar-context">
        <span>{t(lang, "documentation")}</span>
        <span className="docs-version"><span className="sr-only">{t(lang, "version")} </span>v{DOCS_CONFIG.version}</span>
      </div>
      <nav className="docs-sidebar-nav" aria-label={t(lang, "documentation")}>
        {navigation.map(section => {
          const SectionIcon = SECTION_ICONS[section.key] || BookOpen;
          const expanded = !collapsedSections.includes(section.key);
          const sectionId = `${id}-${section.key}`;

          return (
            <div key={section.key} className="docs-sidebar-section">
              <h2>
                <button type="button" onClick={() => toggleSection(section.key)} className="docs-section-toggle" aria-expanded={expanded} aria-controls={sectionId}>
                  <SectionIcon size={16} aria-hidden="true" />
                  <span>{section.title}</span>
                  <ChevronDown size={15} className="docs-section-chevron" aria-hidden="true" />
                </button>
              </h2>
              <ul id={sectionId} hidden={!expanded}>
                {section.items.map(item => {
                  const href = docsHref(lang, item.slug);
                  const active = currentPath === href.replace(/\/$/, "");
                  return (
                    <li key={item.key}>
                      <Link href={href} onClick={isMobile ? onClose : undefined} className="docs-sidebar-link" aria-current={active ? "page" : undefined}>
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="docs-sidebar-footer">
        <p className="docs-sidebar-tagline" lang="en">{DOCS_CONFIG.tagline}</p>
        <a href={DOCS_CONFIG.githubUrl} className="docs-sidebar-external">
          <Code2 size={16} aria-hidden="true" />GitHub<ExternalLink size={14} aria-hidden="true" />
        </a>
        <p>{t(lang, "maintainedBy")} <a href={DOCS_CONFIG.sponsorUrl}>{DOCS_CONFIG.organization}</a>.</p>
        <p className="docs-sponsor-note">{t(lang, "sponsorNote")}</p>
        {isMobile && (
          <a href={DOCS_CONFIG.appUrl} target="_blank" rel="noopener noreferrer" className="docs-mobile-app-link">
            <span>{t(lang, "goToApp")}</span>
            <ExternalLink size={16} aria-hidden="true" />
            <span className="sr-only"> ({t(lang, "newWindow")})</span>
          </a>
        )}
      </div>
    </aside>
  );
}
