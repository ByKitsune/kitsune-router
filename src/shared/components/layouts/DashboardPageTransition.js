"use client";

import { useEffect, useLayoutEffect, useRef, useState, ViewTransition } from "react";
import "./dashboard-transitions.css";

/** Let React's router transition animate snapshots, keeping the live tree intact. */
export default function DashboardPageTransition({ children, pathname, isChat }) {
  const content = useRef(null);
  const [animatedPathname, setAnimatedPathname] = useState(pathname);
  const previousPath = useRef(pathname);
  const positions = useRef(new Map());
  const restoring = useRef(false);

  useEffect(() => {
    const markHistoryNavigation = () => { restoring.current = true; };
    window.addEventListener("popstate", markHistoryNavigation);
    return () => window.removeEventListener("popstate", markHistoryNavigation);
  }, []);

  useLayoutEffect(() => {
    const main = content.current?.closest("main");
    if (!main) return;
    const changed = previousPath.current !== pathname;
    if (changed) {
      // Preserve deep links into a different page; a blanket reset would undo
      // the router's anchor scroll (for example /dashboard/pxpipe#logs).
      let anchorId = window.location.hash.slice(1);
      try { anchorId = decodeURIComponent(anchorId); } catch { /* An invalid fragment is not a route error. */ }
      const anchor = anchorId ? document.getElementById(anchorId) : null;
      if (anchor && main.contains(anchor)) anchor.scrollIntoView({ block: "start", behavior: "instant" });
      else main.scrollTo({ top: restoring.current ? positions.current.get(pathname) || 0 : 0, behavior: "instant" });
      // Route commits move keyboard focus to the new content, never on a filter,
      // query-string update or a live data refresh within the same route.
      main.focus({ preventScroll: true });
    }
    previousPath.current = pathname;
    restoring.current = false;
    const recordScroll = () => positions.current.set(pathname, main.scrollTop);
    main.addEventListener("scroll", recordScroll, { passive: true });
    return () => main.removeEventListener("scroll", recordScroll);
  }, [pathname]);

  useEffect(() => {
    // React 19.3 coordinates supported browsers with the committed route. The
    // fallback only animates the arriving DOM; it never delays navigation or
    // keeps an outgoing page (and its subscriptions/forms) mounted twice.
    if (typeof document.startViewTransition === "function"
        || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = content.current?.animate?.([
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 220, easing: "cubic-bezier(.22, 1, .36, 1)" });
    return () => animation?.cancel();
  }, [pathname]);

  // Once this route's snapshot is ready, later Suspense/data/filter updates
  // must stay local instead of starting another full-content animation.
  return (
    <ViewTransition
      name="dashboard-page-content"
      default="none"
      update={animatedPathname === pathname ? "none" : "dashboard-route"}
      onUpdate={() => setAnimatedPathname(pathname)}
    >
      <div
        ref={content}
        data-dashboard-page={pathname}
        className={isChat
          ? "dashboard-route-content flex h-full w-full min-w-0 flex-1 flex-col"
          : "dashboard-route-content dashboard-page workspace-enter mx-auto w-full min-w-0 max-w-[1440px]"}
      >
        {children}
      </div>
    </ViewTransition>
  );
}
