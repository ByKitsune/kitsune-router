"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";
import PasswordOnboardingModal from "../PasswordOnboardingModal";

function getToastStyle(type) {
  if (type === "success") return { border: "border-green-700 dark:border-green-400", icon: "check_circle", color: "text-green-700 dark:text-green-400" };
  if (type === "error") return { border: "border-red-700 dark:border-red-300", icon: "error", color: "text-red-700 dark:text-red-300" };
  if (type === "warning") return { border: "border-amber-700 dark:border-amber-300", icon: "warning", color: "text-amber-700 dark:text-amber-300" };
  return { border: "border-primary", icon: "info", color: "text-primary" };
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-text-main">
      <a href="#dashboard-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:bg-surface focus:px-5 focus:py-3 focus:font-semibold">Skip to content</a>
      <div aria-label="Notifications" className="fixed right-4 top-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-3">
        {notifications.map((notification) => {
          const style = getToastStyle(notification.type);
          return (
            <div key={notification.id} role={notification.type === "error" ? "alert" : "status"} aria-atomic="true" className={`border-l-4 bg-surface px-4 py-3 text-text-main shadow-elevated ${style.border}`}>
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
            </div>
          );
        })}
      </div>

      <div className="hidden shrink-0 lg:flex"><Sidebar /></div>
      <dialog
        ref={drawer}
        id={drawerId}
        aria-label="Dashboard navigation"
        className="m-0 h-dvh max-h-none w-72 max-w-[calc(100vw-24px)] overflow-visible overscroll-contain border-0 bg-sidebar p-0 text-text-main backdrop:bg-black/50 backdrop:overflow-hidden backdrop:overscroll-contain"
        onClose={() => setSidebarOpen(false)}
      >
        {sidebarOpen && <Sidebar onClose={() => setSidebarOpen(false)} />}
      </dialog>

      <div className="relative flex h-full min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center bg-surface">
          <button type="button" aria-label="Open navigation" aria-controls={drawerId} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)} className="ml-3 flex min-h-11 shrink-0 items-center gap-2 px-2 text-sm font-semibold lg:hidden">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
            <span className="sr-only sm:not-sr-only">Menu</span>
          </button>
          <div className="min-w-0 flex-1"><Header key={pathname} showMenuButton={false} /></div>
        </div>
        <main id="dashboard-content" tabIndex={-1} className={`min-h-0 flex-1 custom-scrollbar ${isChat ? "flex flex-col overflow-hidden" : "overflow-y-auto p-4 sm:p-6 lg:p-8"}`}>
          <div className={isChat ? "flex h-full w-full flex-1 flex-col" : "mx-auto max-w-7xl"}>{children}</div>
        </main>
      </div>
      <PasswordOnboardingModal />
    </div>
  );
}
