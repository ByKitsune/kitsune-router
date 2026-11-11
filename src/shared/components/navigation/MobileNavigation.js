"use client";

import Link from "next/link";
import { ChartNoAxesCombined, Database, KeyRound, Menu } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import NavigationPending from "./NavigationPending";

const shortcuts = [
  { href: "/dashboard/endpoint", label: "Gateway", icon: KeyRound },
  { href: "/dashboard/providers", label: "Providers", icon: Database },
  { href: "/dashboard/usage", label: "Usage", icon: ChartNoAxesCombined },
];

export function isNavigationRoute(pathname, href) {
  return (href === "/dashboard/endpoint" && pathname === "/dashboard")
    || pathname === href || pathname.startsWith(`${href}/`);
}

/** A dock in the layout flow: its safe-area padding never covers page content. */
export default function MobileNavigation({ pathname, menuOpen, menuControls, onOpenMenu }) {
  const moreActive = !shortcuts.some(({ href }) => isNavigationRoute(pathname, href));
  return (
    <nav aria-label="Mobile quick navigation" className="dashboard-mobile-navigation relative z-20 shrink-0 border-t border-border-subtle bg-surface px-3 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto grid w-full max-w-lg grid-cols-4 gap-1">
        {shortcuts.map(({ href, label, icon: Icon }) => {
          const active = isNavigationRoute(pathname, href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("dashboard-mobile-destination group relative flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors duration-150", active ? "is-active text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text-main")}><Icon size={19} strokeWidth={active ? 2 : 1.7} aria-hidden="true" /><span className="max-w-full truncate">{label}</span><NavigationPending /></Link>;
        })}
        <button type="button" onClick={onOpenMenu} aria-label="More navigation" aria-haspopup="dialog" aria-controls={menuControls} aria-expanded={menuOpen} className={cn("dashboard-mobile-destination relative flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors duration-150", menuOpen || moreActive ? "is-active text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text-main")}><Menu size={19} strokeWidth={1.7} aria-hidden="true" /><span>More</span></button>
      </div>
    </nav>
  );
}
