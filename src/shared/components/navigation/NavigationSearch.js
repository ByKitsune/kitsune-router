"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, CornerDownLeft, Search, X } from "lucide-react";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";
import { flattenNavigationItems, getNavigationGroups, isNavigationRoute } from "./dashboardNavigation";
import NavigationIcon from "./NavigationIcon";
import NavigationPending from "./NavigationPending";
import "./navigation-search.css";

const normalize = (text, locale) => String(text || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase(locale);
const serverLocale = () => DEFAULT_LOCALE;

function focusableControls(dialog) {
  return Array.from(dialog.querySelectorAll("a[href], button, input, [tabindex]"))
    .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[inert], [hidden]") && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
}

/** Search the enabled page directory without executing account or gateway actions. */
export default function NavigationSearch({ isOpen, onClose, enableTranslator = false }) {
  const dialog = useRef(null);
  const invoker = useRef(null);
  const openingPath = useRef(null);
  const pathname = usePathname();
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (isOpen && element && !element.open) {
      invoker.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      openingPath.current = pathname;
      element.showModal();
    } else if (!isOpen && element?.open) element.close();
  }, [isOpen, pathname]);

  useEffect(() => {
    if (isOpen && openingPath.current !== pathname) onClose();
  }, [isOpen, onClose, pathname]);

  const close = () => {
    onClose();
    // Native focus return can target a mobile-drawer opener that was unmounted
    // during handoff. On a route commit, preserve focus in the new content.
    if (document.querySelector("dialog[open]")) return;
    if (openingPath.current !== pathname) {
      document.getElementById("dashboard-content")?.focus({ preventScroll: true });
      return;
    }
    const previous = invoker.current;
    const valid = previous?.isConnected && previous.getClientRects().length && !previous.closest("dialog:not([open]), [inert], [hidden]") && getComputedStyle(previous).visibility !== "hidden";
    (valid ? previous : document.querySelector('[data-navigation-search-trigger="true"]'))?.focus({ preventScroll: true });
  };

  return (
    <dialog
      ref={dialog}
      aria-label="Find a page"
      aria-labelledby={titleId}
      data-navigation-search-dialog="true"
      className="navigation-search-dialog"
      onClose={close}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}
      onKeyDown={event => {
        if (event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229) return;
        if (event.key === "Escape") {
          // Search inputs consume Escape to clear their native value. The page
          // finder consistently dismisses, including a non-empty query.
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const controls = focusableControls(event.currentTarget);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { event.preventDefault(); event.currentTarget.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
      }}
    >
      {isOpen && <SearchContent titleId={titleId} pathname={pathname} onClose={onClose} enableTranslator={enableTranslator} />}
    </dialog>
  );
}

function SearchContent({ titleId, pathname, onClose, enableTranslator }) {
  const [query, setQuery] = useState("");
  const search = useRef(null);
  const results = useRef(null);
  const locale = useSyncExternalStore(onLocaleChange, getCurrentLocale, serverLocale);
  const groups = useMemo(() => {
    const words = normalize(query, locale).trim().split(/\s+/).filter(Boolean);
    return getNavigationGroups({ enableTranslator }).map(group => ({
      ...group,
      results: flattenNavigationItems([group]).filter(item => {
        const labels = [item.label, item.description, group.label, item.parent?.label];
        const text = normalize([...labels, ...labels.map(label => translate(label)), ...(item.keywords || []), item.href].join(" "), locale);
        return words.every(word => text.includes(word));
      }),
    })).filter(group => group.results.length);
  }, [enableTranslator, locale, query]);
  const count = groups.reduce((sum, group) => sum + group.results.length, 0);

  const moveThroughResults = event => {
    // Candidate selection belongs to the input method, including Enter and
    // arrow keys. It must not activate a destination or move focus away.
    if (event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229) return;
    const links = Array.from(results.current?.querySelectorAll("[data-navigation-result]") || []);
    const index = links.indexOf(document.activeElement);
    const inSearch = event.target === search.current;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && (inSearch || index >= 0)) {
      event.preventDefault();
      if (!links.length) return;
      if (inSearch) links[event.key === "ArrowDown" ? 0 : links.length - 1].focus();
      else if ((event.key === "ArrowUp" && index === 0) || (event.key === "ArrowDown" && index === links.length - 1)) search.current?.focus();
      else links[index + (event.key === "ArrowDown" ? 1 : -1)].focus();
    } else if ((event.key === "Home" || event.key === "End") && index >= 0) {
      event.preventDefault();
      links[event.key === "Home" ? 0 : links.length - 1]?.focus();
    } else if (event.key === "Enter" && inSearch && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      links[0]?.click();
    }
  };

  return (
    <div className="navigation-search-panel" onKeyDown={moveThroughResults}>
      <div className="navigation-search-input-row">
        <Search size={20} aria-hidden="true" />
        <input ref={search} autoFocus type="search" aria-label="Search pages" placeholder="Search pages..." autoComplete="off" spellCheck={false} value={query} onChange={event => setQuery(event.target.value)} />
        <button type="button" onClick={onClose} aria-label="Close page search" className="navigation-search-close"><X size={19} aria-hidden="true" /></button>
      </div>
      <div className="navigation-search-summary">
        <h2 id={titleId}>Find a page</h2>
        <span role="status" aria-live="polite" aria-atomic="true">{translate(count === 1 ? "{count} page" : "{count} pages", { count })}</span>
      </div>
      <div ref={results} className="navigation-search-results custom-scrollbar">
        {groups.length ? groups.map(group => <section key={group.id} className="navigation-search-group" aria-label={translate(group.label)}>
          <h3>{translate(group.label)}</h3>
          {group.results.map(item => {
            const active = isNavigationRoute(pathname, item.href);
            return <Link key={item.href} href={item.href} data-navigation-result="true" aria-current={active ? "page" : undefined} onNavigate={onClose} className="navigation-search-result">
              <span className="navigation-search-result-icon"><NavigationIcon name={item.icon} size={19} aria-hidden="true" /></span>
              <span className="navigation-search-result-text"><span className="navigation-search-result-label">{translate(item.label)}{active && <span className="navigation-search-current">Current page</span>}</span><span className="navigation-search-result-description">{translate(item.description || item.parent?.label || group.label)}</span></span>
              <NavigationPending />
              <CornerDownLeft size={15} aria-hidden="true" className="navigation-search-enter" />
            </Link>;
          })}
        </section>) : <div className="navigation-search-empty"><Search size={26} aria-hidden="true" /><h3>No pages found</h3><p>Try another page name or keyword.</p><button type="button" onClick={() => { setQuery(""); search.current?.focus(); }}>Clear search</button></div>}
      </div>
      <div className="navigation-search-footer" aria-hidden="true"><span><ArrowUp size={12} /><ArrowDown size={12} />Navigate</span><span><CornerDownLeft size={13} />Open page</span><span className="navigation-search-escape"><kbd>Esc</kbd>Close</span></div>
    </div>
  );
}
