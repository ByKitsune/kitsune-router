"use client";

import Link from "next/link";
import { ChartNoAxesCombined, Database, KeyRound, Menu } from "lucide-react";
import { cn } from "@/shared/utils/cn";

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
    <nav aria-label="Mobile quick navigation" className="relative z-20 shrink-0 border-t border-border-subtle bg-surface/85 px-3 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-12px_32px_-24px_rgba(0,0,0,0.4)] backdrop-blur-2xl lg:hidden">
      <div className="mx-auto grid w-full max-w-lg grid-cols-4 gap-1 pb-1.5">
        {shortcuts.map(({ href, label, icon: Icon }) => {
          const active = isNavigationRoute(pathname, href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("group flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.96] motion-reduce:transform-none", active ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text-main")}><Icon size={19} strokeWidth={active ? 2 : 1.7} aria-hidden="true" /><span className="max-w-full truncate">{label}</span></Link>;
        })}
        <button type="button" onClick={onOpenMenu} aria-label="More navigation" aria-haspopup="dialog" aria-controls={menuControls} aria-expanded={menuOpen} className={cn("flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.96] motion-reduce:transform-none", menuOpen || moreActive ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text-main")}><Menu size={19} strokeWidth={1.7} aria-hidden="true" /><span>More</span></button>
      </div>
    </nav>
  );
}
