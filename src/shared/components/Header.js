"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import PropTypes from "prop-types";
import { ChevronRight, Menu, Search, UserRound, X } from "lucide-react";
import ProviderIcon from "@/shared/components/ProviderIcon";
import HeaderMenu from "@/shared/components/HeaderMenu";
import HeaderLanguage from "@/shared/components/HeaderLanguage";
import ThemeToggle from "@/shared/components/ThemeToggle";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { translate } from "@/i18n/runtime";

const getPageInfo = (pathname) => {
  if (!pathname) return { title: "", description: "", breadcrumbs: [] };

  const toolDetail = pathname.match(/^\/dashboard\/cli-tools\/([^/]+)$/);
  if (toolDetail && CLI_TOOLS[toolDetail[1]]) {
    const tool = CLI_TOOLS[toolDetail[1]];
    return { title: tool.name, description: "Configure CLI tools", breadcrumbs: [
      { label: "CLI Tools", href: "/dashboard/cli-tools" },
      { label: tool.name, image: tool.image },
    ] };
  }

  // Media combos have their own workspace; "combo" is not a provider kind.
  if (pathname.startsWith("/dashboard/media-providers/combo/")) {
    return { title: "Combos", description: "Model combos with fallback", breadcrumbs: [
      { label: "Combos & adapters", href: "/dashboard/combos" }, { label: "Media providers" },
    ] };
  }

  // Media provider detail: /dashboard/media-providers/[kind]/[id]
  const mediaDetailMatch = pathname.match(/\/media-providers\/([^/]+)\/([^/]+)$/);
  if (mediaDetailMatch) {
    const kindId = mediaDetailMatch[1];
    const providerId = mediaDetailMatch[2];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    const provider = AI_PROVIDERS[providerId];
    return {
      title: provider?.name || providerId,
      description: "",
      breadcrumbs: [
        { label: "Media Providers", href: `/dashboard/media-providers/${kindId}` },
        { label: kindConfig?.label || kindId, href: `/dashboard/media-providers/${kindId}` },
        { label: provider?.name || providerId, image: getProviderIconSrc(providerId) },
      ],
    };
  }

  // Media provider kind: /dashboard/media-providers/[kind]
  const mediaKindMatch = pathname.match(/\/media-providers\/([^/]+)$/);
  if (mediaKindMatch) {
    const kindId = mediaKindMatch[1];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    return {
      title: kindConfig?.label || kindId,
      description: `Manage your ${kindConfig?.label || kindId} providers`,
      icon: kindConfig?.icon || "perm_media",
      breadcrumbs: [],
    };
  }

  // Provider detail page: /dashboard/providers/[id]
  const providerMatch = pathname.match(/\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = providerMatch[1];
    const providerInfo =
      OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId];
    if (providerInfo) {
      return {
        title: providerInfo.name,
        description: "",
        breadcrumbs: [
          { label: "Providers", href: "/dashboard/providers" },
          {
            label: providerInfo.name,
            image: getProviderIconSrc(providerInfo.id),
          },
        ],
      };
    }
  }

  if (pathname.includes("/providers") && !pathname.includes("/media-providers"))
    return {
      title: "Providers",
      description: "Manage your AI provider connections",
      icon: "deployed_code",
      breadcrumbs: [],
    };
  if (pathname.includes("/combos"))
    return {
      title: "Combos",
      description: "Model combos with fallback",
      icon: "layers",
      breadcrumbs: [],
    };
  if (pathname.includes("/usage"))
    return {
      title: "Usage & Analytics",
      description:
        "Monitor your API usage, token consumption, and request logs",
      icon: "bar_chart",
      breadcrumbs: [],
    };
  if (pathname.includes("/auth-files"))
    return {
      title: "Auth Files",
      description: "Map provider credentials stored in the local database",
      icon: "vpn_key",
      breadcrumbs: [],
    };
  if (pathname.includes("/quota"))
    return {
      title: "Quota Tracker",
      description: "Track and manage your API quota limits",
      icon: "donut_small",
      breadcrumbs: [],
    };
  if (pathname.includes("/mitm"))
    return {
      title: "MITM Proxy",
      description: "Intercept CLI tool traffic and route through Kitsune Router",
      icon: "security",
      breadcrumbs: [],
    };
  if (pathname.includes("/token-saver"))
    return {
      title: "Token Saver",
      description: "Compress prompts and outputs to save tokens",
      icon: "tune",
      breadcrumbs: [],
    };
  if (pathname.includes("/cli-tools"))
    return {
      title: "CLI Tools",
      description: "Configure CLI tools",
      icon: "code",
      breadcrumbs: [],
    };
  if (pathname.includes("/proxy-pools"))
    return {
      title: "Proxy Pools",
      description: "Manage your proxy pool configurations",
      icon: "lan",
      breadcrumbs: [],
    };
  if (pathname.includes("/skills"))
    return {
      title: "Agent Skills",
      description: "Copy a link and paste to your AI to use Kitsune Router — no install needed",
      icon: "extension",
      breadcrumbs: [],
    };
  if (pathname.includes("/endpoint"))
    return {
      title: "Endpoint",
      description: "API endpoint configuration",
      icon: "vpn_key",
      breadcrumbs: [],
    };
  if (pathname.includes("/profile"))
    return {
      title: "Settings",
      description: "Manage your preferences",
      icon: "settings",
      breadcrumbs: [],
    };
  if (pathname.includes("/translator"))
    return {
      title: "Translator",
      description: "Debug translation flow between formats",
      icon: "translate",
      breadcrumbs: [],
    };
  if (pathname.includes("/console-log"))
    return {
      title: "Console Log",
      description: "Live server console output",
      icon: "terminal",
      breadcrumbs: [],
    };
  if (pathname.includes("/settings/pricing"))
    return { title: "Pricing", description: "", breadcrumbs: [{ label: "Settings", href: "/dashboard/profile" }, { label: "Pricing" }] };
  if (pathname.includes("/basic-chat"))
    return { title: "Chat", description: "", breadcrumbs: [] };
  if (pathname.includes("/pxpipe"))
    return { title: "PXPIPE", description: "", breadcrumbs: [] };
  if (pathname === "/dashboard")
    return {
      title: "Endpoint",
      description: "API endpoint configuration",
      icon: "vpn_key",
      breadcrumbs: [],
    };
  return { title: "", description: "", breadcrumbs: [] };
};

export default function Header({ onMenuClick, showMenuButton = true, menuControls, menuExpanded }) {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState("");
  const [loginMethod, setLoginMethod] = useState("");

  // Memoize page info to prevent unnecessary recalculations
  const pageInfo = useMemo(() => getPageInfo(pathname), [pathname]);
  const { title, description, breadcrumbs } = pageInfo;

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
        if (!cancelled) {
          setDisplayName("");
          setLoginMethod("");
        }
      }
    }

    loadAuthStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        // Full reload on purpose: the session cookie was cleared, so every
        // cached RSC payload for the authenticated tree must be discarded.
        // eslint-disable-next-line kitsunerouter/no-location-assign-relative-destination
        window.location.assign("/login");
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  return (
    <header className="dashboard-header relative z-20 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-3 border-b border-border-subtle bg-surface text-text-main">
      <div className="dashboard-navigation-progress" aria-hidden="true" />
      {showMenuButton && <button type="button" onClick={onMenuClick} aria-label="Open navigation" aria-controls={menuControls} aria-expanded={menuExpanded} className="dashboard-menu-trigger flex size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main lg:hidden"><Menu size={19} aria-hidden="true" /></button>}

      <nav aria-label="Breadcrumb" className="dashboard-breadcrumb flex min-w-0 flex-1 items-center gap-2">
        <Link href="/dashboard/endpoint" className="hidden shrink-0 rounded text-xs font-medium text-text-subtle transition-colors hover:text-primary sm:block">Workspace</Link>
        <ChevronRight size={13} aria-hidden="true" className="hidden shrink-0 text-text-subtle sm:block" />
        {breadcrumbs.length > 0 ? breadcrumbs.map((crumb, index) => (
          <div key={`${crumb.label}-${crumb.href || "current"}`} className={`${index < breadcrumbs.length - 1 ? "hidden md:flex" : "flex"} min-w-0 items-center gap-2`}>
            {index > 0 && <ChevronRight aria-hidden="true" size={13} className="hidden shrink-0 text-text-subtle md:block" />}
            {crumb.href ? <Link href={crumb.href} className="truncate rounded text-xs font-medium text-text-muted transition-colors hover:text-primary">{translate(crumb.label)}</Link> : <div className="flex min-w-0 items-center gap-2">{crumb.image && <ProviderIcon src={crumb.image} alt="" size={20} className="size-5 shrink-0 rounded object-contain" fallbackText={crumb.label.slice(0, 2).toUpperCase()} />}<h1 className="truncate text-sm font-semibold tracking-[-0.02em]">{translate(crumb.label)}</h1></div>}
          </div>
        )) : <h1 className="truncate text-sm font-semibold tracking-[-0.02em]">{translate(title || "Dashboard")}</h1>}
        {description && <span className="sr-only">{translate(description)}</span>}
      </nav>

      <div className="dashboard-header-actions ml-auto flex shrink-0 items-center gap-0.5 lg:order-last">
        {displayName && (loginMethod === "OIDC" || loginMethod === "SAML") && <div className="mr-2 hidden max-w-[180px] items-center gap-2 border-r border-border-subtle pr-3 text-xs text-text-muted xl:flex" title={displayName}><UserRound size={15} className="shrink-0 text-text-muted" aria-hidden="true" /><span className="truncate">{displayName}</span><span className="shrink-0 rounded bg-surface-2 px-1.5 py-1 text-[9px] font-semibold uppercase">{loginMethod}</span></div>}
        <div className="hidden sm:block"><ThemeToggle className="!rounded-lg" /></div>
        <HeaderLanguage />
        <HeaderMenu onLogout={handleLogout} />
      </div>
      <HeaderSearch />
    </header>
  );
}

function HeaderSearch() {
  const visible = useHeaderSearchStore((s) => s.visible);
  const query = useHeaderSearchStore((s) => s.query);
  const placeholder = useHeaderSearchStore((s) => s.placeholder);
  const setQuery = useHeaderSearchStore((s) => s.setQuery);

  if (!visible) return null;

  return (
    <div className="dashboard-header-search relative order-last w-full min-w-0 lg:order-none lg:ml-auto lg:w-[220px] xl:w-[280px]">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        aria-label={placeholder || "Search this page"}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border-subtle bg-bg-alt/50 pl-9 pr-10 text-[13px] text-text-main transition-[border-color,box-shadow] duration-150 placeholder:text-text-subtle hover:border-border focus:border-primary/50 focus:outline-none focus:shadow-focus"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main"
          aria-label="Clear search"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

Header.propTypes = {
  onMenuClick: PropTypes.func,
  showMenuButton: PropTypes.bool,
  menuControls: PropTypes.string,
  menuExpanded: PropTypes.bool,
};
