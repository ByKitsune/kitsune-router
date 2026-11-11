"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";
import PasswordOnboardingModal from "../PasswordOnboardingModal";
import MobileNavigation from "../navigation/MobileNavigation";
import NavigationSearch from "../navigation/NavigationSearch";
import useSidebarPreference from "../navigation/sidebarPreference";
import DashboardPageTransition from "./DashboardPageTransition";
import "./dashboard-shell.css";

function getToastStyle(type) {
  if (type === "success") return { border: "border-green-700 dark:border-green-400", icon: "check_circle", color: "text-green-700 dark:text-green-400" };
  if (type === "error") return { border: "border-red-700 dark:border-red-300", icon: "error", color: "text-red-700 dark:text-red-300" };
  if (type === "warning") return { border: "border-amber-700 dark:border-amber-300", icon: "warning", color: "text-amber-700 dark:text-amber-300" };
  return { border: "border-primary", icon: "info", color: "text-primary" };
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pageSearchOpen, setPageSearchOpen] = useState(false);
  const [enableTranslator, setEnableTranslator] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarPreference();
  const reduceMotion = useReducedMotion();
  const drawer = useRef(null);
  const drawerId = useId();
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const isChat = pathname === "/dashboard/basic-chat";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/settings", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(settings => { if (settings) setEnableTranslator(settings.enableTranslator === true); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const openPageSearch = event => {
      if (event.isComposing || event.repeat || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      // Do not open a second modal over credentials, confirmations or language
      // selection. The navigation drawer may hand off to the page finder.
      const modal = document.activeElement?.closest("dialog[open]")
        || Array.from(document.querySelectorAll("dialog[open]")).at(-1);
      if (modal?.dataset.navigationSearchDialog === "true") {
        event.preventDefault();
        modal.querySelector("input")?.focus();
        return;
      }
      if (modal && modal !== drawer.current) return;
      event.preventDefault();
      setSidebarOpen(false);
      setPageSearchOpen(true);
    };
    window.addEventListener("keydown", openPageSearch);
    return () => window.removeEventListener("keydown", openPageSearch);
  }, []);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      setSidebarOpen(false);
      setPageSearchOpen(false);
    }
  }, [pathname]);

  const openPageSearch = () => {
    setSidebarOpen(false);
    setPageSearchOpen(true);
  };

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
    <div className="dashboard-shell flex h-dvh min-h-0 w-full overflow-hidden bg-bg text-text-main">
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

      <div className="dashboard-sidebar-rail hidden h-full shrink-0 border-r border-border-subtle lg:block" data-collapsed={sidebarCollapsed}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)} onOpenSearch={openPageSearch} enableTranslator={enableTranslator} />
      </div>
      <dialog
        ref={drawer}
        id={drawerId}
        aria-label="Dashboard navigation"
        className="dashboard-navigation-drawer m-0 h-dvh max-h-none overflow-hidden overscroll-contain border-0 border-r border-border-subtle bg-sidebar p-0 text-text-main shadow-elevated backdrop:bg-black/35 backdrop:overflow-hidden backdrop:overscroll-contain"
        onClose={() => setSidebarOpen(false)}
        onKeyDown={event => {
          if (event.key !== "Tab" || event.target.closest("dialog") !== event.currentTarget) return;
          const controls = Array.from(event.currentTarget.querySelectorAll("a[href], button, input, select, textarea, [tabindex]"))
            .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[hidden], [inert]") && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first?.focus(); }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX > rect.right || event.clientY > rect.bottom || event.clientX < rect.left || event.clientY < rect.top) setSidebarOpen(false);
        }}
      >
        {sidebarOpen && <motion.div initial={{ x: reduceMotion ? 0 : -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }} className="h-full"><Sidebar onClose={() => setSidebarOpen(false)} onOpenSearch={openPageSearch} enableTranslator={enableTranslator} /></motion.div>}
      </dialog>

      <div className="dashboard-stage relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Header onMenuClick={() => setSidebarOpen(true)} menuControls={drawerId} menuExpanded={sidebarOpen} onOpenSearch={openPageSearch} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />
          <main id="dashboard-content" tabIndex={-1} className={`dashboard-main min-h-0 min-w-0 flex-1 overscroll-contain custom-scrollbar ${isChat ? "flex flex-col overflow-hidden" : "overflow-y-auto overflow-x-hidden p-4 sm:p-6 xl:p-8"}`}>
            <DashboardPageTransition pathname={pathname} isChat={isChat}>{children}</DashboardPageTransition>
          </main>
          <MobileNavigation pathname={pathname} menuOpen={sidebarOpen} menuControls={drawerId} onOpenMenu={() => setSidebarOpen(true)} />
      </div>
      <NavigationSearch isOpen={pageSearchOpen} onClose={() => setPageSearchOpen(false)} enableTranslator={enableTranslator} />
      <PasswordOnboardingModal />
    </div>
    </MotionConfig>
  );
}
