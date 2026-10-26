"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Globe, X } from "lucide-react";
import { LANGUAGES, getLanguage, DEFAULT_LANG } from "@/constants/languages";
import { t } from "@/constants/docsConfig";
import { docsHref } from "@/lib/urls.mjs";
import DocsDialog from "./DocsDialog";

export default function LanguageSwitcher({ currentLang = DEFAULT_LANG }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = getLanguage(currentLang);
  const id = useId();
  const slug = (pathname || "").split("/").filter(Boolean).slice(1).join("/");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="docs-language-trigger" aria-label={`${t(currentLang, "selectLanguage")}: ${current.native}`} aria-haspopup="dialog" aria-controls={`${id}-dialog`} aria-expanded={open}>
        <Globe size={18} aria-hidden="true" />
        <span className="docs-language-code" aria-hidden="true">{current.code}</span>
      </button>

      <DocsDialog open={open} onClose={() => setOpen(false)} id={`${id}-dialog`} labelledBy={`${id}-title`} className="docs-language-dialog">
        <div className="docs-dialog-heading">
          <h2 id={`${id}-title`}>{t(currentLang, "selectLanguage")}</h2>
          <button type="button" onClick={() => setOpen(false)} className="docs-icon-button" aria-label={t(currentLang, "close")}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <ul className="docs-language-list">
          {LANGUAGES.map(language => (
            <li key={language.code}>
              <Link href={docsHref(language.code, slug)} hrefLang={language.code} className="docs-language-option" aria-current={language.code === currentLang ? "true" : undefined} onClick={() => setOpen(false)}>
                <span className="docs-language-option-copy">
                  <span lang={language.code}>{language.native}</span>
                  <span className="docs-language-name" lang="en">{language.name}</span>
                </span>
                {language.code === currentLang && <Check size={18} aria-hidden="true" />}
              </Link>
            </li>
          ))}
        </ul>
      </DocsDialog>
    </>
  );
}
