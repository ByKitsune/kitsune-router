"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { flattenNavigationItems, getNavigationGroups, isNavigationRoute } from "./dashboardNavigation";
import NavigationIcon from "./NavigationIcon";
import NavigationPending from "./NavigationPending";
import "./mobile-navigation.css";

const allDestinations = flattenNavigationItems(getNavigationGroups());
const shortcuts = ["endpoint", "providers", "chat", "usage"].map(id => allDestinations.find(item => item.id === id));

export { isNavigationRoute } from "./dashboardNavigation";

/** A dock in the layout flow: its safe-area padding never covers page content. */
export default function MobileNavigation({ pathname, menuOpen, menuControls, onOpenMenu }) {
  const moreActive = !shortcuts.some(({ href }) => isNavigationRoute(pathname, href));
  return (
    <nav aria-label="Mobile quick navigation" className="dashboard-mobile-navigation dashboard-mobile-dock">
      <div className="dashboard-mobile-dock-items">
        {shortcuts.map(({ id, href, label, icon }) => {
          const active = isNavigationRoute(pathname, href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("dashboard-mobile-destination", active && !menuOpen && "is-active")}>
              <span className="dashboard-mobile-destination-icon" aria-hidden="true">
                <NavigationIcon name={icon} size={20} strokeWidth={active ? 2 : 1.7} />
                <NavigationPending />
              </span>
              <span className="dashboard-mobile-destination-label">{id === "endpoint" ? "Gateway" : label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={onOpenMenu} aria-label="More navigation" aria-haspopup="dialog" aria-controls={menuControls} aria-expanded={menuOpen} className={cn("dashboard-mobile-destination", (menuOpen || moreActive) && "is-active")}>
          <span className="dashboard-mobile-destination-icon" aria-hidden="true"><LayoutGrid size={20} strokeWidth={menuOpen || moreActive ? 2 : 1.7} /></span>
          <span className="dashboard-mobile-destination-label">More</span>
        </button>
      </div>
    </nav>
  );
}
