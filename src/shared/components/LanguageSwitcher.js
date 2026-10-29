"use client";

import { useState, useEffect, useRef, useCallback, useId, useSyncExternalStore } from "react";
import { Languages, Search, X, Check, ChevronRight, LoaderCircle } from "lucide-react";
import { LOCALE_NAMES } from "@/i18n/config";
import { onLocaleChange, reloadTranslations, translate } from "@/i18n/runtime";
import { LANGUAGE_OPTIONS, readDisplayLocale, searchLanguages } from "@/shared/constants/locales";
import LocaleBadge from "./LocaleBadge";
import "./language-switcher.css";

const serverLocale = () => "en";

export default function LanguageSwitcher({ className = "", isOpen: controlledOpen, onClose, hideTrigger = false }) {
  const locale = useSyncExternalStore(onLocaleChange, readDisplayLocale, serverLocale);
  const [isPending, setIsPending] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const choicesRef = useRef([]);
  const selecting = useRef(false);
  const titleId = useId();
  const helpId = useId();
  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const options = searchLanguages(query);

  const close = useCallback((nextLocale = locale) => {
    setQuery("");
    setError("");
    if (isControlled) onClose?.(nextLocale);
    else setInternalOpen(false);
  }, [isControlled, onClose, locale]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      searchRef.current?.focus({ preventScroll: true });
    }
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const open = () => {
    setQuery("");
    setError("");
    setInternalOpen(true);
  };

  const handleSetLocale = async (nextLocale) => {
    if (selecting.current) return;
    if (nextLocale === locale) { close(); return; }
    selecting.current = true;
    setIsPending(true);
    setError("");
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      if (!response.ok) throw new Error("Locale update failed");
      // The endpoint sets the cookie; the runtime broadcasts its new value to
      // every trigger, including preferences changed from Settings.
      await reloadTranslations();
      close(nextLocale);
    } catch {
      setError("Could not change language. Check your connection and try again.");
    } finally {
      selecting.current = false;
      setIsPending(false);
    }
  };

  const navigateChoices = (event, index) => {
    const deltas = { ArrowDown: 1, ArrowUp: -1, Home: -index, End: options.length - 1 - index };
    if (!(event.key in deltas) || !options.length) return;
    event.preventDefault();
    const next = (index + deltas[event.key] + options.length) % options.length;
    choicesRef.current[next]?.focus();
  };

  return (
    <div className={className}>
      {!hideTrigger && (
        <button type="button" onClick={open} disabled={isPending} className="inline-flex min-h-11 max-w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-text-main shadow-soft transition-colors hover:bg-surface-2 motion-reduce:transition-none" aria-haspopup="dialog" aria-expanded={isOpen}>
          <LocaleBadge locale={locale} compact />
          <span className="truncate text-sm font-medium" data-i18n-skip="true">{LOCALE_NAMES[locale]}</span>
          <ChevronRight size={15} className="text-text-muted" aria-hidden="true" />
        </button>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={helpId}
        onCancel={(event) => { event.preventDefault(); close(); }}
        onClose={() => { if (isOpen) close(); }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
        }}
        className="language-picker fixed inset-x-0 bottom-0 top-auto m-0 max-h-[min(90dvh,760px)] w-full max-w-none overflow-hidden rounded-t-[28px] border border-border-subtle bg-surface p-0 text-text-main shadow-elevated backdrop:bg-black/40 backdrop:backdrop-blur-md sm:inset-0 sm:m-auto sm:w-[calc(100%_-_2rem)] sm:max-w-[620px] sm:rounded-[28px]"
      >
        {isOpen && (
          <div className="language-picker-content flex max-h-[min(90dvh,760px)] min-w-0 flex-col">
            <div className="mx-auto mb-1 mt-3 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" aria-hidden="true" />
            <div className="language-picker-header flex shrink-0 items-start gap-3 px-5 pb-4 pt-4 sm:px-7 sm:pt-6">
              <div className="language-picker-header-icon flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/10 bg-primary/8 text-primary"><Languages size={22} strokeWidth={1.6} aria-hidden="true" /></div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id={titleId} className="text-xl font-semibold tracking-[-0.035em]">Your workspace, your language.</h2>
                <p id={helpId} className="language-picker-description mt-1 text-xs leading-5 text-text-muted">Choose the language that feels right for your workspace.</p>
              </div>
              <button type="button" onClick={() => close()} aria-label="Close language selector" className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main motion-reduce:transition-none"><X size={19} aria-hidden="true" /></button>
            </div>
            <div className="language-picker-search shrink-0 border-b border-border-subtle px-5 pb-5 sm:px-7">
              <div className="relative">
                <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-subtle" aria-hidden="true" />
                <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown" && options.length) { event.preventDefault(); choicesRef.current[0]?.focus(); } }} aria-label="Search languages" placeholder="Search languages or locale codes…" className="h-12 w-full min-w-0 rounded-2xl border border-border-subtle bg-bg-alt/70 pl-10 pr-4 text-base text-text-main outline-none transition-shadow placeholder:text-text-subtle focus:border-primary/40 focus:ring-4 focus:ring-primary/8 sm:text-sm" />
              </div>
              <div className="language-picker-preference mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted"><span>Current: <span className="font-semibold text-text-main" data-i18n-skip="true" lang={locale} dir="auto">{LOCALE_NAMES[locale]}</span></span><span>{LANGUAGE_OPTIONS.length} languages</span></div>
            </div>
            {error && <p role="alert" className="mx-5 mt-4 rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm leading-6 text-danger sm:mx-7">{error}</p>}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 custom-scrollbar sm:px-5" aria-busy={isPending}>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2" aria-label={translate("Available languages")} data-i18n-skip="true">
                {options.map((option, index) => {
                  const active = locale === option.locale;
                  return (
                    <li key={option.locale} className="min-w-0">
                      <button
                        ref={(node) => { choicesRef.current[index] = node; }}
                        type="button"
                        onClick={() => handleSetLocale(option.locale)}
                        onKeyDown={(event) => navigateChoices(event, index)}
                        disabled={isPending}
                        aria-pressed={active}
                        lang={option.locale}
                        aria-label={`${option.name}, ${option.englishName}`}
                        className={`group flex min-h-[68px] w-full min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200 disabled:cursor-wait motion-reduce:transition-none ${active ? "border-primary/20 bg-primary/7" : "border-transparent hover:border-border-subtle hover:bg-surface-2"}`}
                      >
                        <span dir="ltr" className={`flex h-9 min-w-11 shrink-0 items-center justify-center rounded-xl border px-1.5 text-[10px] font-semibold tracking-wide ${active ? "border-primary/10 bg-primary/10 text-primary" : "border-border-subtle bg-bg-alt text-text-muted"}`}>{option.code}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold" dir={option.direction}>{option.name}</span><span className="mt-1 block truncate text-[10px] text-text-muted" lang="en" dir="ltr">{option.englishName}</span></span>
                        {active && <Check size={16} strokeWidth={2} className="shrink-0 text-primary" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {options.length === 0 && <div className="px-3 py-10 text-center" role="status"><Search size={23} strokeWidth={1.5} className="mx-auto mb-3 text-text-subtle" aria-hidden="true" /><p className="text-sm font-medium">No matching languages</p><p className="mt-2 text-xs leading-5 text-text-muted">Try a native name, English name, or code such as “ID”.</p><button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} className="mt-4 min-h-11 rounded-xl px-4 text-xs font-semibold text-primary hover:bg-primary/5">Clear search</button></div>}
            </div>
            <div className="language-picker-footer flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle bg-bg-alt/40 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-[11px] text-text-muted sm:px-7">
              <p role="status" className="flex items-center gap-2">{isPending ? <><LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Applying your language…</> : "Your preference stays with this browser."}</p>
              <span className="hidden rounded-md border border-border-subtle bg-surface px-1.5 py-1 font-mono text-[10px] sm:inline" aria-hidden="true">esc</span>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
