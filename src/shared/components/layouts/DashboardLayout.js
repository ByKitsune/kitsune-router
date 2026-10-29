"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";
import PasswordOnboardingModal from "../PasswordOnboardingModal";
import MobileNavigation from "../navigation/MobileNavigation";

function getToastStyle(type) {
  if (type === "success") return { border: "border-green-700 dark:border-green-400", icon: "check_circle", color: "text-green-700 dark:text-green-400" };
  if (type === "error") return { border: "border-red-700 dark:border-red-300", icon: "error", color: "text-red-700 dark:text-red-300" };
  if (type === "warning") return { border: "border-amber-700 dark:border-amber-300", icon: "warning", color: "text-amber-700 dark:text-amber-300" };
  return { border: "border-primary", icon: "info", color: "text-primary" };
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const drawer = useRef(null);
  const drawerId = useId();
  const pathname = usePathname();
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const isChat = pathname === "/dashboard/basic-chat";

  useEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    if (sidebarOpen && !dialog.open) dialog.showModal();
    if (!sidebarOpen && dialog.open) dialog.close();
  }, [sidebarOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = (event) => { if (event.matches) setSidebarOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
    <div className="dashboard-shell flex h-dvh min-h-0 w-full overflow-hidden bg-bg-alt text-text-main">
      <a href="#dashboard-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:bg-surface focus:px-5 focus:py-3 focus:font-semibold">Skip to content</a>
      <div aria-label="Notifications" className="pointer-events-none fixed right-3 top-3 z-[80] flex w-[min(calc(100vw-24px),380px)] flex-col gap-3 sm:right-5 sm:top-5">
        <AnimatePresence initial={false}>
        {notifications.map((notification) => {
          const style = getToastStyle(notification.type);
          return (
            <motion.div layout initial={{ opacity: 0, y: reduceMotion ? 0 : -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : 20 }} transition={{ duration: reduceMotion ? 0 : 0.22 }} key={notification.id} role={notification.type === "error" ? "alert" : "status"} aria-atomic="true" className={`pointer-events-auto rounded-2xl border border-border-subtle border-l-4 bg-surface px-4 py-3 text-text-main shadow-elevated ${style.border}`}>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className={`material-symbols-outlined text-xl leading-6 ${style.color}`}>{style.icon}</span>
                <div className="min-w-0 flex-1">
                  {notification.title ? <p className="mb-1 text-sm font-semibold">{notification.title}</p> : null}
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{notification.message}</p>
                </div>
                {notification.dismissible ? (
                  <button type="button" onClick={() => removeNotification(notification.id)} className="-mr-2 -mt-1 flex size-9 shrink-0 items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text-main" aria-label="Dismiss notification">
                    <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
                  </button>
                ) : null}
              </div>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>

      <div className="hidden shrink-0 py-3 pl-3 lg:flex"><div className="overflow-hidden rounded-[22px] border border-border-subtle shadow-soft"><Sidebar /></div></div>
      <dialog
        ref={drawer}
        id={drawerId}
        aria-label="Dashboard navigation"
        className="m-0 h-dvh max-h-none w-[min(320px,calc(100vw-24px))] max-w-[calc(100vw-24px)] overflow-hidden overscroll-contain rounded-r-[28px] border-0 border-r border-border-subtle bg-sidebar/95 p-0 text-text-main shadow-[24px_0_80px_-24px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop:bg-black/40 backdrop:backdrop-blur-md backdrop:overflow-hidden backdrop:overscroll-contain"
        onClose={() => setSidebarOpen(false)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX > rect.right || event.clientY > rect.bottom || event.clientX < rect.left || event.clientY < rect.top) setSidebarOpen(false);
        }}
      >
        {sidebarOpen && <motion.div initial={{ x: reduceMotion ? 0 : -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }} className="h-full"><Sidebar onClose={() => setSidebarOpen(false)} /></motion.div>}
      </dialog>

      <div className="relative flex h-full min-w-0 flex-1 flex-col lg:p-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg lg:rounded-[24px] lg:border lg:border-border-subtle lg:shadow-soft">
          <Header key={pathname} onMenuClick={() => setSidebarOpen(true)} menuControls={drawerId} menuExpanded={sidebarOpen} />
          <main id="dashboard-content" tabIndex={-1} className={`dashboard-main min-h-0 min-w-0 flex-1 overscroll-contain custom-scrollbar ${isChat ? "flex flex-col overflow-hidden" : "overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 xl:px-10"}`}>
            <div key={pathname} className={isChat ? "flex h-full w-full min-w-0 flex-1 flex-col" : "dashboard-page workspace-enter mx-auto w-full min-w-0 max-w-[1600px]"}>{children}</div>
          </main>
          <MobileNavigation pathname={pathname} menuOpen={sidebarOpen} menuControls={drawerId} onOpenMenu={() => setSidebarOpen(true)} />
        </div>
      </div>
      <PasswordOnboardingModal />
    </div>
    </MotionConfig>
  );
}
