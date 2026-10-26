"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import { DEFAULT_LANG } from "@/constants/languages";
import { t } from "@/constants/docsConfig";
import { searchDocuments } from "@/lib/search.mjs";
import { docsHref } from "@/lib/urls.mjs";
import DocsDialog from "./DocsDialog";

export default function DocsSearch({ entries = [], lang = DEFAULT_LANG }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const id = useId();
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const results = useMemo(() => searchDocuments(entries, query), [entries, query]);

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        // Do not open another modal on top of the mobile or language menu.
        if (document.querySelector("dialog[open]")) return;
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  const focusResult = (event) => {
    if (event.key !== "ArrowDown" || event.nativeEvent.isComposing) return;
    const firstResult = resultsRef.current?.querySelector("a");
    if (firstResult) {
      event.preventDefault();
      firstResult.focus();
    }
  };

  const navigateResults = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || event.nativeEvent.isComposing) return;
    const links = [...(resultsRef.current?.querySelectorAll("a") || [])];
    const current = links.indexOf(document.activeElement);
    if (current === -1) return;
    event.preventDefault();
    if (event.key === "Home") links[0]?.focus();
    else if (event.key === "End") links.at(-1)?.focus();
    else if (event.key === "ArrowUp" && current === 0) inputRef.current?.focus();
    else links[Math.min(links.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))]?.focus();
  };

  return (
    <>
      <button type="button" className="docs-search-trigger" aria-haspopup="dialog" aria-controls={`${id}-dialog`} aria-expanded={open} onClick={() => setOpen(true)}>
        <Search size={18} aria-hidden="true" />
        <span>{t(lang, "searchDocs")}</span>
        <kbd aria-hidden="true">Ctrl / ⌘ K</kbd>
      </button>

      <DocsDialog open={open} onClose={() => setOpen(false)} id={`${id}-dialog`} labelledBy={`${id}-title`} describedBy={`${id}-hint`} className="docs-search-dialog">
        <div className="docs-dialog-heading">
          <h2 id={`${id}-title`}>{t(lang, "searchDocs")}</h2>
          <button type="button" className="docs-icon-button" onClick={() => setOpen(false)} aria-label={t(lang, "close")}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p id={`${id}-hint`} className="docs-search-hint">{t(lang, "searchHint")}</p>
        <div className="docs-search-field">
          <Search size={20} aria-hidden="true" />
          <label className="sr-only" htmlFor={`${id}-input`}>{t(lang, "searchDocs")}</label>
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="search"
            placeholder={t(lang, "searchPlaceholder")}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={focusResult}
            aria-controls={`${id}-results`}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          {query && (
            <button type="button" className="docs-icon-button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label={t(lang, "clearSearch")}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="docs-search-summary" role="status" aria-live="polite" aria-atomic="true">
          {query.trim() ? `${t(lang, "searchResults")}: ${new Intl.NumberFormat(lang).format(results.length)}` : t(lang, "searchSuggestions")}
        </div>
        <div ref={resultsRef} id={`${id}-results`} className="docs-search-results" onKeyDown={navigateResults}>
          {results.length ? (
            <ul>
              {results.map(result => (
                <li key={result.slug}>
                  <Link href={docsHref(lang, result.slug)} className="docs-search-result" onClick={() => setOpen(false)}>
                    <span className="docs-search-result-copy">
                      {result.section && <span className="docs-search-result-section">{result.section}</span>}
                      <span className="docs-search-result-title">{result.title}</span>
                      {result.description && <span className="docs-search-result-description">{result.description}</span>}
                    </span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="docs-search-empty">{t(lang, "searchEmpty")}</p>}
        </div>
      </DocsDialog>
    </>
  );
}
