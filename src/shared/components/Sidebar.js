"use client";

import { useState, useEffect, useId, useRef } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, AudioLines, Blocks, ChartNoAxesCombined, ChevronDown, Code2, Database, Gauge, Globe2, ImageIcon, KeyRound, Layers3, Network, Settings2, SlidersHorizontal, Terminal, Video, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, BRAND, UPDATER_CONFIG } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";
import NavigationPending from "./navigation/NavigationPending";

// const VISIBLE_MEDIA_KINDS = ["embedding", "image", "imageToText", "tts", "stt", "webSearch", "webFetch", "video", "music"];
const VISIBLE_MEDIA_KINDS = ["embedding", "image", "video", "tts", "stt"];
// Combined entry: webSearch + webFetch share one page at /dashboard/media-providers/web
const COMBINED_WEB_ITEM = { id: "web", label: "Web fetch & search", icon: "travel_explore", href: "/dashboard/media-providers/web" };

const navItems = [
  { href: "/dashboard/endpoint", label: "Endpoint & key", icon: "vpn_key" },
  { href: "/dashboard/providers", label: "Providers", icon: "deployed_code" },
  { href: "/dashboard/combos", label: "Combos & adapters", icon: "layers" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/quota", label: "Quota tracker", icon: "donut_small" },
  { href: "/dashboard/token-saver", label: "Token saver", icon: "tune" },
  { href: "/dashboard/cli-tools", label: "CLI tools", icon: "code" },
];

const debugItems = [
  { href: "/dashboard/console-log", label: "Console log", icon: "terminal" },
  { href: "/dashboard/translator", label: "Translator", icon: "translate" },
];

const systemItems = [
  { href: "/dashboard/proxy-pools", label: "Proxy pools", icon: "lan" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
];

const NAV_ICONS = {
  vpn_key: KeyRound, deployed_code: Database, layers: Layers3,
  bar_chart: ChartNoAxesCombined, donut_small: Gauge, tune: SlidersHorizontal,
  code: Code2, lan: Network, extension: Blocks, terminal: Terminal,
  translate: Globe2, settings: Settings2, perm_media: ImageIcon,
  image: ImageIcon, movie: Video, video_library: Video,
  graphic_eq: AudioLines, record_voice_over: AudioLines, mic: AudioLines,
  travel_explore: Globe2,
};

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const navigationId = useId();
  const [mediaDisclosure, setMediaDisclosure] = useState(null);
  const mediaOpen = mediaDisclosure?.pathname === pathname
    ? mediaDisclosure.open : pathname.startsWith("/dashboard/media-providers");
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shutdownCountdown, setShutdownCountdown] = useState(0);
  const [enableTranslator, setEnableTranslator] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const mediaId = useId();
  const updateTitleId = useId();
  const updateDialog = useRef(null);
  const shutdownTimer = useRef(null);
  const copyingCommand = useRef(false);

  const INSTALL_CMD = UPDATER_CONFIG.installCmdLatest;

  useEffect(() => () => clearInterval(shutdownTimer.current), []);

  useEffect(() => {
    const dialog = updateDialog.current;
    if (!dialog) return;
    if ((showUpdateModal || isUpdating || isDisconnected) && !dialog.open) dialog.showModal();
    if (!showUpdateModal && !isUpdating && !isDisconnected && dialog.open) dialog.close();
    if (isUpdating && !showUpdateModal) dialog.querySelector("h2")?.focus();
  }, [showUpdateModal, isUpdating, isDisconnected]);

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => { if (data.enableTranslator) setEnableTranslator(true); })
      .catch(() => {});
  }, []);

  // Lazy check for new npm version on mount
  useEffect(() => {
    fetch("/api/version")
      .then(res => res.json())
      .then(data => { if (data.hasUpdate) setUpdateInfo(data); })
      .catch(() => {});
  }, []);

  const isActive = (href) => {
    if (href === "/dashboard/endpoint") {
      return pathname === "/dashboard" || pathname === href || pathname.startsWith(`${href}/`);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

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

  const renderNavLink = (item, nested = false) => {
    // Array.map passes an index as the second argument; only explicit true
    // denotes a nested media link.
    const isNested = nested === true;
    const active = isActive(item.href);
    const Icon = NAV_ICONS[item.icon] || Blocks;
    return (
      <Link key={item.href} href={item.href} onClick={onClose} aria-current={active ? "page" : undefined} className={cn("dashboard-nav-link", isNested && "dashboard-nav-link-nested", active && "is-active")}>
        {active && <motion.span aria-hidden="true" layoutId="navigation-active" className="dashboard-nav-active-surface" transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }} />}
        <Icon size={isNested ? 16 : 18} strokeWidth={active ? 2 : 1.7} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1">{item.label}</span>
        <NavigationPending />
      </Link>
    );
  };

  // Note: legacy updater poll removed. New flow: copy install cmd + shutdown server,
  // user runs the command manually in another terminal.


  return (
    <>
      <aside className={cn("dashboard-sidebar flex h-full min-h-0 flex-col bg-sidebar text-text-main", onClose ? "w-full" : "w-[244px]")}>
        <div className="dashboard-sidebar-brand shrink-0">
          <Link href="/dashboard" onClick={onClose} className="flex min-w-0 items-center gap-2.5 rounded-lg">
            <Image src="/icons/logo.svg" alt="" width={34} height={34} className="size-[34px] shrink-0 object-contain" />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold tracking-[-0.035em]">{APP_CONFIG.name}</span>
              <span className="mt-0.5 block text-[10px] font-medium text-text-muted">Your models. Your routes.</span>
            </span>
          </Link>
          {onClose && <button type="button" onClick={onClose} aria-label="Close navigation" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main"><X size={19} aria-hidden="true" /></button>}
        </div>
        <div className="px-4">
          {updateInfo && (
            <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs font-semibold leading-5">Update available: v{updateInfo.latestVersion}</p>
              <div className="mt-1 flex items-center gap-3">
                <button type="button" onClick={() => setShowUpdateModal(true)} className="min-h-10 text-xs font-bold text-primary underline underline-offset-4">Update options</button>
                <button type="button" onClick={copyCommand} className="min-h-10 text-xs font-semibold underline underline-offset-4">Copy command</button>
              </div>
              {!isUpdating && <p className="text-xs leading-5 text-text-muted" role="status">{copyFeedback}</p>}
            </div>
          )}
        </div>

        <LayoutGroup id={navigationId}>
          <nav aria-label="Dashboard navigation" className="flex min-h-0 flex-1 flex-col">
          <div className="dashboard-sidebar-nav min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
            <div className="dashboard-nav-group">
              <p className="dashboard-nav-group-label">Gateway</p>
              {navItems.slice(0, 3).map(renderNavLink)}
            </div>
            <div className="dashboard-nav-group">
              <p className="dashboard-nav-group-label">Workspace</p>
              {navItems.slice(6).map(renderNavLink)}
              <button type="button" aria-expanded={mediaOpen} aria-controls={mediaId} onClick={() => setMediaDisclosure({ pathname, open: !mediaOpen })} className={cn("dashboard-nav-link w-full text-left", pathname.startsWith("/dashboard/media-providers") && "is-active")}>
                <ImageIcon size={18} strokeWidth={1.7} aria-hidden="true" />
                <span className="min-w-0 flex-1">Media providers</span>
                <ChevronDown size={15} aria-hidden="true" className={cn("shrink-0 transition-transform duration-150 motion-reduce:transition-none", mediaOpen && "rotate-180")} />
              </button>
              <div id={mediaId} hidden={!mediaOpen} className="dashboard-media-navigation">
                {MEDIA_PROVIDER_KINDS.filter(k => VISIBLE_MEDIA_KINDS.includes(k.id)).map(kind => renderNavLink({ href: `/dashboard/media-providers/${kind.id}`, label: kind.label, icon: kind.icon }, true))}
                {renderNavLink(COMBINED_WEB_ITEM, true)}
              </div>
              {systemItems.filter(item => item.href === "/dashboard/skills").map(renderNavLink)}
            </div>
            <div className="dashboard-nav-group">
              <p className="dashboard-nav-group-label">Observe &amp; optimize</p>
              {navItems.slice(3, 6).map(renderNavLink)}
            </div>
            <div className="dashboard-nav-group">
              <p className="dashboard-nav-group-label">Developer</p>
              {systemItems.filter(item => item.href === "/dashboard/proxy-pools").map(renderNavLink)}
              {debugItems.filter(item => item.href !== "/dashboard/translator" || enableTranslator).map(renderNavLink)}
            </div>
          </div>
          <div className="dashboard-sidebar-footer shrink-0">
            {renderNavLink({ href: "/dashboard/profile", label: "Settings", icon: "settings" })}
            <a href={BRAND.docsUrl} className="dashboard-nav-link group"><Blocks size={18} strokeWidth={1.7} aria-hidden="true" /><span className="min-w-0 flex-1">Documentation</span><ArrowUpRight size={15} aria-hidden="true" className="shrink-0 text-text-subtle" /></a>
            <div className="mt-3 flex items-center justify-between gap-2 px-3 text-[10px] text-text-subtle"><a href={BRAND.sponsorUrl} className="rounded underline-offset-4 hover:text-primary hover:underline">By {BRAND.organization}</a><span className="font-mono">v{APP_CONFIG.version}</span></div>
          </div>
          </nav>
        </LayoutGroup>
      </aside>

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
    </>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
};

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
