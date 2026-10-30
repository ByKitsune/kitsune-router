"use client";

import { useEffect, useRef, useState, ViewTransition } from "react";
import "./dashboard-transitions.css";

/** Let React's router transition animate snapshots, keeping the live tree intact. */
export default function DashboardPageTransition({ children, pathname, isChat }) {
  const content = useRef(null);
  const [animatedPathname, setAnimatedPathname] = useState(pathname);

  useEffect(() => {
    // React 19.3 coordinates supported browsers with the committed route. The
    // fallback only animates the arriving DOM; it never delays navigation or
    // keeps an outgoing page (and its subscriptions/forms) mounted twice.
    if (typeof document.startViewTransition === "function"
        || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = content.current?.animate?.([
      { opacity: 0, transform: "translateY(12px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 360, easing: "cubic-bezier(.22, 1, .36, 1)" });
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
          : "dashboard-route-content dashboard-page workspace-enter mx-auto w-full min-w-0 max-w-[1600px]"}
      >
        {children}
      </div>
    </ViewTransition>
  );
}
