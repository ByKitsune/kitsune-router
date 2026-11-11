"use client";

import { useState, useEffect, useId, useRef } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowUpCircle, ArrowUpRight, ChevronDown, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, BRAND, UPDATER_CONFIG } from "@/shared/constants/config";
import NavigationPending from "./navigation/NavigationPending";
import NavigationIcon from "./navigation/NavigationIcon";
import { findNavigationRoute, getNavigationGroups, isNavigationRoute } from "./navigation/dashboardNavigation";
import "./navigation/sidebar.css";

export default function Sidebar({ onClose, collapsed = false, onToggleCollapsed, onOpenSearch, enableTranslator = false }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const navigationId = useId();
  const compact = collapsed && !onClose;
  const groups = getNavigationGroups({ enableTranslator });
  const activeItem = findNavigationRoute(pathname);
  const media = groups.find(group => group.id === "workspace").items.find(item => item.id === "media");
  const mediaActive = activeItem?.parent?.id === "media";
  const [mediaDisclosure, setMediaDisclosure] = useState(null);
  const mediaOpen = mediaDisclosure?.pathname === pathname
    ? mediaDisclosure.open : mediaActive;
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shutdownCountdown, setShutdownCountdown] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState("");
  const mediaId = useId();
  const mediaDialogId = useId();
  const mediaTitleId = useId();
  const mediaDialog = useRef(null);
  const navigationScroll = useRef(null);
  const updateTitleId = useId();
  const updateDialog = useRef(null);
  const shutdownTimer = useRef(null);
  const copyingCommand = useRef(false);

  const INSTALL_CMD = UPDATER_CONFIG.installCmdLatest;

  useEffect(() => () => clearInterval(shutdownTimer.current), []);

  useEffect(() => {
    let frame;
    const revealCurrentDestination = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewport = navigationScroll.current;
        if (!viewport?.getClientRects().length) return;
        const active = Array.from(viewport.querySelectorAll(".dashboard-nav-link.is-active"))
          .find(element => element.getClientRects().length);
        if (!active) return;
        const bounds = viewport.getBoundingClientRect();
        const item = active.getBoundingClientRect();
        const delta = item.top < bounds.top ? item.top - bounds.top - 8
          : item.bottom > bounds.bottom ? item.bottom - bounds.bottom + 8 : 0;
        if (delta) viewport.scrollBy({ top: delta, behavior: "instant" });
      });
    };
    // The drawer is opened by its parent's effect; the next frame sees its
    // actual scroll viewport. Only the menu scrolls, without taking focus.
    revealCurrentDestination();
    window.addEventListener("resize", revealCurrentDestination);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", revealCurrentDestination);
    };
  }, [pathname, compact, enableTranslator]);

  useEffect(() => {
    const dialog = updateDialog.current;
    if (!dialog) return;
    if ((showUpdateModal || isUpdating || isDisconnected) && !dialog.open) dialog.showModal();
    if (!showUpdateModal && !isUpdating && !isDisconnected && dialog.open) dialog.close();
    if (isUpdating && !showUpdateModal) dialog.querySelector("h2")?.focus();
  }, [showUpdateModal, isUpdating, isDisconnected]);

  useEffect(() => { mediaDialog.current?.close(); }, [compact, pathname]);

  useEffect(() => {
    const closeMedia = () => mediaDialog.current?.close();
    window.addEventListener("resize", closeMedia);
    return () => window.removeEventListener("resize", closeMedia);
  }, []);

  // Lazy check for new npm version on mount
  useEffect(() => {
    fetch("/api/version")
      .then(res => res.json())
      .then(data => { if (data.hasUpdate) setUpdateInfo(data); })
      .catch(() => {});
  }, []);

  // Open manual update panel (no countdown yet — user must click Copy to trigger shutdown)
  const handleUpdate = () => {
    setShowUpdateModal(false);
    setCopyFeedback("");
    setIsUpdating(true);
  };

  const copyCommand = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopyFeedback("Install command copied.");
      return true;
    } catch {
      setCopyFeedback("Could not copy. Select the install command and copy it manually. The server is still running.");
      return false;
    }
  };

  // Do not stop the server if the command could not actually be copied.
  const handleCopyAndShutdown = async () => {
    if (shutdownTimer.current || copyingCommand.current) return;
    copyingCommand.current = true;
    const didCopy = await copyCommand();
    copyingCommand.current = false;
    if (!didCopy) return;
    let remaining = UPDATER_CONFIG.shutdownCountdownSec;
    setShutdownCountdown(remaining);
    shutdownTimer.current = setInterval(() => {
      remaining -= 1;
      setShutdownCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(shutdownTimer.current);
        shutdownTimer.current = null;
        fetch("/api/version/shutdown", { method: "POST" }).catch(() => {});
        setIsDisconnected(true);
      }
    }, 1000);
  };

  const handleCancelUpdate = () => {
    if (shutdownCountdown > 0) return;
    setShowUpdateModal(false);
    setIsUpdating(false);
    setShutdownCountdown(0);
  };

  const renderNavLink = (item, nested = false, inMediaDialog = false) => {
    const isNested = nested === true;
    const active = isNavigationRoute(pathname, item.href);
    const iconOnly = compact && !inMediaDialog;
    return (
      <NavigationHint key={item.id} text={item.label} enabled={iconOnly}>
        <Link href={item.href} onNavigate={() => { mediaDialog.current?.close(); onClose?.(); }} aria-label={iconOnly ? item.label : undefined} aria-current={active ? "page" : undefined} className={cn("dashboard-nav-link", isNested && "dashboard-nav-link-nested", active && "is-active")}>
          {active && !inMediaDialog && <motion.span aria-hidden="true" layoutId="navigation-active" className="dashboard-nav-active-surface" transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }} />}
          <NavigationIcon name={item.icon} size={isNested ? 17 : 19} strokeWidth={active ? 2 : 1.7} className="shrink-0" />
          <span className="dashboard-nav-label">{item.label}</span>
          <NavigationPending />
        </Link>
      </NavigationHint>
    );
  };

  const openMedia = (event) => {
    if (!compact) {
      setMediaDisclosure({ pathname, open: !mediaOpen });
      return;
    }
    const dialog = mediaDialog.current;
    if (!dialog || dialog.open) return;
    const box = event.currentTarget.getBoundingClientRect();
    dialog.style.left = `${Math.max(12, Math.min(box.right + 12, window.innerWidth - 272))}px`;
    dialog.style.top = `${Math.max(12, Math.min(box.top - 12, window.innerHeight - 380))}px`;
    dialog.showModal();
  };

  // Note: legacy updater poll removed. New flow: copy install cmd + shutdown server,
  // user runs the command manually in another terminal.


  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={100}>
      <aside data-collapsed={compact ? "true" : "false"} className={cn("dashboard-sidebar flex h-full min-h-0 flex-col bg-sidebar text-text-main", onClose && "dashboard-sidebar-mobile")}>
        <div className="dashboard-sidebar-brand shrink-0">
          <Link href="/dashboard" onNavigate={onClose} aria-label={APP_CONFIG.name} className="dashboard-sidebar-home flex min-w-0 items-center gap-2.5 rounded-lg">
            <Image src="/icons/logo.svg" alt="" width={34} height={34} className="size-[34px] shrink-0 object-contain" />
            <span className="dashboard-sidebar-brand-copy min-w-0">
              <span className="block truncate text-[14px] font-bold tracking-[-0.035em]">{APP_CONFIG.name}</span>
              <span className="mt-0.5 block text-[10px] font-medium text-text-muted">Your models. Your routes.</span>
            </span>
          </Link>
          {onClose ? <button type="button" onClick={onClose} aria-label="Close navigation" className="dashboard-sidebar-icon-button"><X size={19} aria-hidden="true" /></button> : !compact && onToggleCollapsed && <button type="button" onClick={onToggleCollapsed} aria-label="Collapse navigation" title="Collapse navigation" className="dashboard-sidebar-icon-button"><PanelLeftClose size={18} aria-hidden="true" /></button>}
        </div>
        {onOpenSearch && <div className="dashboard-sidebar-search-slot"><NavigationHint enabled={compact} text="Find a page"><button type="button" onClick={onOpenSearch} aria-label="Find a page" aria-haspopup="dialog" aria-keyshortcuts="Control+k Meta+k" className="dashboard-sidebar-search"><Search size={17} aria-hidden="true" /><span className="dashboard-nav-label">Find a page</span><kbd aria-hidden="true">K</kbd></button></NavigationHint></div>}

        <LayoutGroup id={navigationId}>
          <nav aria-label="Dashboard navigation" className="flex min-h-0 flex-1 flex-col">
          <div ref={navigationScroll} className="dashboard-sidebar-nav min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
            {groups.filter(group => group.id !== "preferences").map(group => (
              <section key={group.id} aria-labelledby={`${navigationId}-${group.id}`} className="dashboard-nav-group" data-active-group={activeItem?.groupId === group.id ? "true" : undefined}>
                <p id={`${navigationId}-${group.id}`} className="dashboard-nav-group-label">{group.label}</p>
                {group.items.map(item => item.children ? <div key={item.id}>
                  <NavigationHint enabled={compact} text={item.label}><button type="button" aria-label={compact ? item.label : undefined} aria-expanded={compact ? undefined : mediaOpen} aria-haspopup={compact ? "dialog" : undefined} aria-controls={compact ? mediaDialogId : mediaId} onClick={openMedia} className={cn("dashboard-nav-link dashboard-media-trigger w-full text-left", mediaActive && "is-active")}>
                    <NavigationIcon name={item.icon} size={19} strokeWidth={mediaActive ? 2 : 1.7} />
                    <span className="dashboard-nav-label">{item.label}</span>
                    <ChevronDown size={15} aria-hidden="true" className={cn("dashboard-media-chevron shrink-0 transition-transform duration-150 motion-reduce:transition-none", mediaOpen && "rotate-180")} />
                  </button></NavigationHint>
                  <div id={mediaId} hidden={compact || !mediaOpen} className="dashboard-media-navigation">{item.children.map(child => renderNavLink(child, true))}</div>
                </div> : renderNavLink(item))}
              </section>
            ))}
          </div>
          <div className="dashboard-sidebar-footer shrink-0">
            {updateInfo && <div className="dashboard-sidebar-update"><NavigationHint enabled={compact} text="Update options"><button type="button" aria-label="Update options" onClick={() => setShowUpdateModal(true)} className="dashboard-nav-link w-full text-left"><ArrowUpCircle size={19} aria-hidden="true" /><span className="dashboard-nav-label">Update available <span className="block text-[10px] font-normal">v{updateInfo.latestVersion}</span></span><span aria-hidden="true" className="dashboard-update-dot" /></button></NavigationHint>{!compact && <><button type="button" onClick={copyCommand} className="dashboard-sidebar-copy-command">Copy command</button>{!isUpdating && copyFeedback && <p className="px-3 pb-2 text-xs leading-5 text-text-muted" role="status">{copyFeedback}</p>}</>}</div>}
            {groups.find(group => group.id === "preferences").items.map(item => renderNavLink(item))}
            <NavigationHint enabled={compact} text="Documentation"><a href={BRAND.docsUrl} aria-label={compact ? "Documentation" : undefined} className="dashboard-nav-link"><NavigationIcon name="book" size={19} strokeWidth={1.7} /><span className="dashboard-nav-label">Documentation</span><ArrowUpRight size={14} aria-hidden="true" className="dashboard-nav-external shrink-0 text-text-subtle" /></a></NavigationHint>
            {compact && onToggleCollapsed && <NavigationHint enabled text="Expand navigation"><button type="button" onClick={onToggleCollapsed} aria-label="Expand navigation" className="dashboard-nav-link dashboard-sidebar-expand"><PanelLeftOpen size={19} aria-hidden="true" /></button></NavigationHint>}
            <div className="dashboard-sidebar-meta"><a href={BRAND.sponsorUrl} className="dashboard-sidebar-sponsor rounded underline-offset-4 hover:text-primary hover:underline">By {BRAND.organization}</a><span className="font-mono">v{APP_CONFIG.version}</span></div>
          </div>
          </nav>
        </LayoutGroup>
      </aside>

      <dialog ref={mediaDialog} id={mediaDialogId} aria-labelledby={mediaTitleId} className="dashboard-compact-media-dialog" onKeyDown={containDialogFocus} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.currentTarget.close();
      }}>
        <div className="dashboard-compact-media-heading"><h2 id={mediaTitleId}>Media providers</h2><button type="button" aria-label="Close media navigation" onClick={() => mediaDialog.current?.close()} className="dashboard-sidebar-icon-button"><X size={18} aria-hidden="true" /></button></div>
        <nav aria-label="Media provider navigation">{media.children.map(child => renderNavLink(child, false, true))}</nav>
      </dialog>

      <dialog
        ref={updateDialog}
        aria-labelledby={updateTitleId}
        className="dashboard-update-dialog m-auto rounded-2xl border border-border-subtle shadow-elevated max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg overflow-y-auto overscroll-contain bg-surface p-6 text-text-main backdrop:bg-black/50 backdrop:overflow-hidden backdrop:overscroll-contain sm:p-8"
        onCancel={(event) => { if (shutdownCountdown > 0) event.preventDefault(); }}
        onClose={() => { setShowUpdateModal(false); setIsUpdating(false); }}
      >
        {showUpdateModal ? (
          <div>
            <h2 id={updateTitleId} className="text-2xl font-semibold tracking-tight">Update {BRAND.name}</h2>
            <p className="mt-4 text-sm leading-7">Show the install command for v{updateInfo?.latestVersion}? The next panel lets you copy the command and stop the server before installing it manually.</p>
            <p className="mt-3 text-sm leading-7 text-text-muted">Updating interrupts active connections. Finish your work first.</p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" autoFocus onClick={handleCancelUpdate} className="min-h-11 bg-surface-2 px-5 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={handleUpdate} className="min-h-11 bg-brand-500 px-5 text-sm font-semibold text-white dark:text-bg">Show command</button>
            </div>
          </div>
        ) : (
          <ManualUpdatePanel
            titleId={updateTitleId}
            latestVersion={updateInfo?.latestVersion}
            installCmd={INSTALL_CMD}
            copyFeedback={copyFeedback}
            onCopyAndShutdown={handleCopyAndShutdown}
            onCancel={handleCancelUpdate}
            countdown={shutdownCountdown}
            isDisconnected={isDisconnected}
          />
        )}
      </dialog>
    </Tooltip.Provider>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
  collapsed: PropTypes.bool,
  onToggleCollapsed: PropTypes.func,
  onOpenSearch: PropTypes.func,
  enableTranslator: PropTypes.bool,
};

function NavigationHint({ text, enabled, children }) {
  if (!enabled) return children;
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content side="right" sideOffset={10} collisionPadding={12} className="dashboard-navigation-hint">{text}<Tooltip.Arrow className="fill-text-main" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}

function containDialogFocus(event) {
  if (event.key !== "Tab" || event.target.closest("dialog") !== event.currentTarget) return;
  const controls = Array.from(event.currentTarget.querySelectorAll("a[href], button, [tabindex]"))
    .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length);
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

function ManualUpdatePanel({ titleId, latestVersion, installCmd, copyFeedback, onCopyAndShutdown, onCancel, countdown, isDisconnected }) {
  const isCountingDown = countdown > 0;
  return (
    <div className="w-full">
      <h2 id={titleId} tabIndex={-1} className="text-2xl font-semibold tracking-tight">Update {BRAND.name}{latestVersion ? ` to v${latestVersion}` : ""}</h2>
      <p className="mt-4 text-sm leading-6 text-text-muted" role="status">
        {isDisconnected
          ? "Shutdown requested. If the gateway is still running, stop it before installing."
          : isCountingDown
            ? `Command copied. Server will stop in ${countdown}s...`
            : "Copy the install command before stopping the server."}
      </p>

      <p className="mb-3 mt-6 text-sm font-semibold">Install command</p>
      <div className="mb-4 w-full bg-surface-2 px-4 py-4">
        <code className="break-all font-mono text-sm">{installCmd}</code>
      </div>
      <p className="mb-4 text-sm leading-6 text-text-muted" role="status">{copyFeedback}</p>

      <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm leading-6">
        <li>Choose <strong>Copy &amp; shut down</strong> below.</li>
        <li>Paste the command into your terminal and press Enter.</li>
        <li>Run <code className="font-mono">{BRAND.binary}</code> again after installation.</li>
      </ol>

      {isDisconnected ? (
        <button type="button" className="min-h-11 w-full bg-surface-2 px-5 text-sm font-semibold" onClick={() => globalThis.location.reload()}>Reload page</button>
      ) : (
        <div className="flex gap-2">
          <button type="button" className="min-h-11 bg-surface-2 px-5 text-sm font-semibold disabled:opacity-60" onClick={onCancel} disabled={isCountingDown}>
            Cancel
          </button>
          <button type="button" className="min-h-11 flex-1 bg-brand-500 px-5 text-sm font-semibold text-white dark:text-bg disabled:opacity-60" onClick={onCopyAndShutdown} disabled={isCountingDown}>
            {isCountingDown ? `Stopping in ${countdown}s` : "Copy & shut down"}
          </button>
        </div>
      )}
    </div>
  );
}

ManualUpdatePanel.propTypes = {
  titleId: PropTypes.string.isRequired,
  latestVersion: PropTypes.string,
  installCmd: PropTypes.string.isRequired,
  copyFeedback: PropTypes.string,
  onCopyAndShutdown: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  countdown: PropTypes.number,
  isDisconnected: PropTypes.bool,
};
