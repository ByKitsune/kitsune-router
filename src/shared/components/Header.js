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
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { translate } from "@/i18n/runtime";

const getPageInfo = (pathname) => {
  if (!pathname) return { title: "", description: "", breadcrumbs: [] };

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
    <header className="relative z-20 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-3 border-b border-border-subtle bg-surface/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_6px_24px_-24px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:px-6 lg:px-8 lg:py-5">
      {showMenuButton && <button type="button" onClick={onMenuClick} aria-label="Open navigation" aria-controls={menuControls} aria-expanded={menuExpanded} className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-surface/80 text-text-main shadow-soft transition-[background-color,transform] hover:bg-surface-2 active:scale-95 motion-reduce:transform-none lg:hidden"><Menu size={19} aria-hidden="true" /></button>}

      <div className="min-w-0 flex-1">
        <p className="mb-1 hidden items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle sm:flex"><span>Workspace</span><ChevronRight size={11} aria-hidden="true" /><span className="truncate">{translate(title || "Dashboard")}</span></p>
        {breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
            {breadcrumbs.map((crumb, index) => (
              <div key={`${crumb.label}-${crumb.href || "current"}`} className={`${index < breadcrumbs.length - 1 ? "hidden md:flex" : "flex"} min-w-0 items-center gap-2`}>
                {index > 0 && <ChevronRight aria-hidden="true" size={15} className="hidden shrink-0 text-text-subtle md:block" />}
                {crumb.href ? <Link href={crumb.href} className="truncate rounded text-sm font-medium text-text-muted transition-colors hover:text-primary">{translate(crumb.label)}</Link> : <div className="flex min-w-0 items-center gap-2">{crumb.image && <ProviderIcon src={crumb.image} alt="" size={24} className="size-6 shrink-0 rounded-md object-contain" fallbackText={crumb.label.slice(0, 2).toUpperCase()} />}<h1 className="truncate text-lg font-semibold tracking-[-0.035em] text-text-main sm:text-xl lg:text-[23px]">{translate(crumb.label)}</h1></div>}
              </div>
            ))}
          </nav>
        ) : <h1 className="truncate text-lg font-semibold tracking-[-0.035em] text-text-main sm:text-xl lg:text-[23px]">{translate(title || "Dashboard")}</h1>}
        {description && <p className="mt-1 hidden truncate text-xs text-text-muted xl:block">{translate(description)}</p>}
      </div>

      <div className="ml-auto flex shrink-0 lg:order-last items-center gap-1 rounded-2xl border border-border-subtle bg-surface/75 p-1 shadow-soft sm:gap-1.5">
        {displayName && (loginMethod === "OIDC" || loginMethod === "SAML") && <div className="hidden max-w-[180px] items-center gap-2 border-r border-border-subtle px-2.5 text-xs text-text-muted xl:flex" title={displayName}><UserRound size={15} className="shrink-0 text-primary" aria-hidden="true" /><span className="truncate">{displayName}</span><span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-1 text-[9px] font-semibold uppercase text-primary">{loginMethod}</span></div>}
        <div className="hidden sm:block"><ThemeToggle className="!rounded-xl" /></div>
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
    <div className="relative order-last w-full min-w-0 lg:order-none lg:ml-2 lg:w-[180px] xl:w-[220px]">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        aria-label={placeholder || "Search this page"}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-border-subtle bg-bg-alt/60 pl-9 pr-10 text-sm text-text-main transition-colors placeholder:text-text-subtle hover:border-border focus:border-primary/50 focus:outline-none"
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
