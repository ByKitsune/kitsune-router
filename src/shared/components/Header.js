"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import PropTypes from "prop-types";
import { ArrowLeft, ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, Search, UserRound, X } from "lucide-react";
import ProviderIcon from "@/shared/components/ProviderIcon";
import HeaderMenu from "@/shared/components/HeaderMenu";
import HeaderLanguage from "@/shared/components/HeaderLanguage";
import ThemeToggle from "@/shared/components/ThemeToggle";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { translate } from "@/i18n/runtime";
import { findNavigationRoute } from "./navigation/dashboardNavigation";
import NavigationPending from "./navigation/NavigationPending";
import "./navigation/header-navigation.css";

function getPageInfo(pathname) {
  const route = findNavigationRoute(pathname);
  const base = { title: route?.label || "Dashboard", groupLabel: route?.groupLabel || "Workspace", breadcrumbs: [] };
  const toolDetail = pathname?.match(/^\/dashboard\/cli-tools\/([^/]+)$/);
  if (toolDetail) {
    const tool = CLI_TOOLS[toolDetail[1]];
    return { ...base, title: tool?.name || "Tool configuration", breadcrumbs: [
      { label: "CLI tools", href: "/dashboard/cli-tools" },
      { label: tool?.name || "Tool configuration", image: tool?.image },
    ] };
  }
  if (pathname === "/dashboard/providers/new") {
    return { ...base, title: "Add provider", breadcrumbs: [
      { label: "Providers", href: "/dashboard/providers" }, { label: "Add provider" },
    ] };
  }
  const providerDetail = pathname?.match(/^\/dashboard\/providers\/([^/]+)$/);
  if (providerDetail) {
    const id = providerDetail[1];
    const provider = AI_PROVIDERS[id];
    const title = provider?.name || "Provider details";
    return { ...base, title, breadcrumbs: [
      { label: "Providers", href: "/dashboard/providers" },
      { label: title, image: provider ? getProviderIconSrc(id) : undefined },
    ] };
  }
  if (pathname?.startsWith("/dashboard/media-providers/combo/")) {
    return { ...base, title: "Media combo", breadcrumbs: [
      { label: "Combos & adapters", href: "/dashboard/combos" }, { label: "Media combo" },
    ] };
  }
  const mediaDetail = pathname?.match(/^\/dashboard\/media-providers\/([^/]+)\/([^/]+)$/);
  if (mediaDetail) {
    const [, kindId, id] = mediaDetail;
    const kind = MEDIA_PROVIDER_KINDS.find(item => item.id === kindId);
    const provider = AI_PROVIDERS[id];
    const title = provider?.name || "Provider details";
    return { ...base, title, breadcrumbs: [
      { label: kind?.label || "Media providers", href: `/dashboard/media-providers/${kindId}` },
      { label: title, image: provider ? getProviderIconSrc(id) : undefined },
    ] };
  }
  if (pathname === "/dashboard/settings/pricing") {
    return { ...base, title: "Pricing", breadcrumbs: [
      { label: "Settings", href: "/dashboard/profile" }, { label: "Pricing" },
    ] };
  }
  if (route?.parent) {
    return { ...base, breadcrumbs: [{ label: route.parent.label }, { label: base.title }] };
  }
  return base;
}

export default function Header({ onMenuClick, showMenuButton = true, menuControls, menuExpanded, onOpenSearch, sidebarCollapsed, onToggleSidebar }) {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState("");
  const [loginMethod, setLoginMethod] = useState("");
  const pageInfo = useMemo(() => getPageInfo(pathname), [pathname]);
  const { title, groupLabel, breadcrumbs } = pageInfo;
  const parent = breadcrumbs.find(crumb => crumb.href);

  useEffect(() => {
    let cancelled = false;
    async function loadAuthStatus() {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setDisplayName(data?.displayName || data?.samlName || data?.samlEmail || data?.oidcName || data?.oidcEmail || "");
          setLoginMethod(data?.loginMethod || "");
        }
      } catch {
        if (!cancelled) { setDisplayName(""); setLoginMethod(""); }
      }
    }
    loadAuthStatus();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        // Discard authenticated RSC caches after clearing the session cookie.
        // eslint-disable-next-line kitsunerouter/no-location-assign-relative-destination
        window.location.assign("/login");
      }
    } catch (err) { console.error("Failed to logout:", err); }
  };

  return (
    <header className="dashboard-header dashboard-context-header relative z-20 flex min-w-0 flex-wrap items-center border-b border-border-subtle bg-surface text-text-main">
      <div className="dashboard-navigation-progress" aria-hidden="true" />
      {showMenuButton && <button type="button" onClick={onMenuClick} aria-label="Open navigation" aria-haspopup="dialog" aria-controls={menuControls} aria-expanded={menuExpanded} className="dashboard-menu-trigger dashboard-header-control lg:hidden"><Menu size={20} aria-hidden="true" /></button>}
      {onToggleSidebar && <button type="button" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} className="dashboard-header-control hidden lg:flex">{sidebarCollapsed ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}</button>}

      <nav aria-label="Breadcrumb" className="dashboard-breadcrumb dashboard-context-breadcrumb">
        {parent && <Link href={parent.href} aria-label={translate("Back to {page}", { page: translate(parent.label) })} className="dashboard-header-control dashboard-parent-link"><ArrowLeft size={18} aria-hidden="true" /><NavigationPending /></Link>}
        <ol className="dashboard-breadcrumb-list">
          <li className="dashboard-breadcrumb-section">{translate(groupLabel)}</li>
          <li className="dashboard-breadcrumb-separator"><ChevronRight size={13} aria-hidden="true" /></li>
          {breadcrumbs.length ? breadcrumbs.map((crumb, index) => (
            <li key={`${crumb.label}-${crumb.href || "current"}`} className={index < breadcrumbs.length - 1 ? "dashboard-breadcrumb-parent" : "dashboard-breadcrumb-current"}>
              {index > 0 && <ChevronRight size={13} aria-hidden="true" className="dashboard-detail-separator" />}
              {crumb.href ? <Link href={crumb.href} className="truncate rounded text-text-muted hover:text-primary">{translate(crumb.label)}</Link> : <span aria-current={index === breadcrumbs.length - 1 ? "page" : undefined} className="dashboard-breadcrumb-label">{crumb.image && <ProviderIcon src={crumb.image} alt="" size={20} className="size-5 shrink-0 rounded object-contain" fallbackText={crumb.label.slice(0, 2).toUpperCase()} />}<span className="truncate">{translate(crumb.label)}</span></span>}
            </li>
          )) : <li className="dashboard-breadcrumb-current" aria-current="page"><span className="truncate">{translate(title)}</span></li>}
        </ol>
      </nav>

      <div className="dashboard-header-actions ml-auto flex shrink-0 items-center gap-0.5 lg:order-last">
        {onOpenSearch && <button type="button" onClick={onOpenSearch} aria-label="Find a page" aria-haspopup="dialog" data-navigation-search-trigger="true" className="dashboard-header-control dashboard-page-finder"><Search size={18} aria-hidden="true" /><span>Find a page</span><kbd aria-hidden="true">Ctrl K</kbd></button>}
        {displayName && (loginMethod === "OIDC" || loginMethod === "SAML") && <div className="dashboard-header-identity" title={displayName}><UserRound size={15} className="shrink-0" aria-hidden="true" /><span className="truncate">{displayName}</span><span className="shrink-0 rounded bg-surface-2 px-1.5 py-1 text-[9px] font-semibold uppercase">{loginMethod}</span></div>}
        <div className="hidden sm:block"><ThemeToggle className="!rounded-lg" /></div>
        <HeaderLanguage />
        <HeaderMenu onLogout={handleLogout} />
      </div>
      <HeaderSearch />
    </header>
  );
}

function HeaderSearch() {
  const visible = useHeaderSearchStore(state => state.visible);
  const query = useHeaderSearchStore(state => state.query);
  const placeholder = useHeaderSearchStore(state => state.placeholder);
  const setQuery = useHeaderSearchStore(state => state.setQuery);
  if (!visible) return null;
  return (
    <div className="dashboard-header-search dashboard-context-search relative order-last w-full min-w-0 lg:order-none lg:ml-auto">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input aria-label={placeholder || "Search this page"} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-[10px] border border-border-subtle bg-bg-alt/50 pl-9 pr-10 text-[13px] text-text-main transition-[border-color,box-shadow] duration-150 placeholder:text-text-subtle hover:border-border focus:border-primary/50 focus:outline-none focus:shadow-focus" />
      {query && <button type="button" onClick={() => setQuery("")} className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main" aria-label="Clear search"><X size={15} aria-hidden="true" /></button>}
    </div>
  );
}

Header.propTypes = {
  onMenuClick: PropTypes.func,
  showMenuButton: PropTypes.bool,
  menuControls: PropTypes.string,
  menuExpanded: PropTypes.bool,
  onOpenSearch: PropTypes.func,
  sidebarCollapsed: PropTypes.bool,
  onToggleSidebar: PropTypes.func,
};
