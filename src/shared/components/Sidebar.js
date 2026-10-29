"use client";

import { useState, useEffect, useId, useRef } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, AudioLines, Blocks, ChartNoAxesCombined, ChevronDown, Code2, Database, Gauge, Globe2, ImageIcon, KeyRound, Layers3, Network, Settings2, SlidersHorizontal, Terminal, Video, Waypoints, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, BRAND, UPDATER_CONFIG } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";

// const VISIBLE_MEDIA_KINDS = ["embedding", "image", "imageToText", "tts", "stt", "webSearch", "webFetch", "video", "music"];
const VISIBLE_MEDIA_KINDS = ["embedding", "image", "video", "tts", "stt"];
// Combined entry: webSearch + webFetch share one page at /dashboard/media-providers/web
const COMBINED_WEB_ITEM = { id: "web", label: "Web fetch & search", icon: "travel_explore", href: "/dashboard/media-providers/web" };

const navItems = [
  { href: "/dashboard/endpoint", label: "Endpoint & key", icon: "vpn_key" },
  { href: "/dashboard/providers", label: "Providers", icon: "deployed_code" },
  // { href: "/dashboard/basic-chat", label: "Basic Chat", icon: "chat" }, // Hidden
  { href: "/dashboard/combos", label: "Combos & adapters", icon: "layers" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/quota", label: "Quota tracker", icon: "donut_small" },
  { href: "/dashboard/token-saver", label: "Token saver", icon: "tune" },
  // { href: "/dashboard/pxpipe", label: "PXPIPE", icon: "image" },
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
  const [mediaOpen, setMediaOpen] = useState(() => pathname.startsWith("/dashboard/media-providers"));
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
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/endpoint");
    }
    return pathname.startsWith(href);
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
      <Link key={item.href} href={item.href} onClick={onClose} aria-current={active ? "page" : undefined} className={cn("group relative isolate flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-colors duration-200", isNested && "min-h-10 text-xs", active ? "font-semibold text-primary" : "font-medium text-text-muted hover:bg-surface-2 hover:text-text-main")}>
        {active && <motion.span aria-hidden="true" layoutId="navigation-active" className="absolute inset-0 -z-10 rounded-xl border border-primary/10 bg-primary/10" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 35 }} />}
        <Icon size={isNested ? 16 : 18} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1">{item.label}</span>
        {active && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />}
      </Link>
    );
  };

  // Note: legacy updater poll removed. New flow: copy install cmd + shutdown server,
  // user runs the command manually in another terminal.


  return (
    <>
      <aside className={cn("flex h-full min-h-0 max-w-[calc(100vw-24px)] flex-col bg-sidebar text-text-main", onClose ? "w-full" : "w-[264px]")}>
        <div className="shrink-0 px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-2">
            <Link href="/dashboard" onClick={onClose} className="flex min-w-0 items-center gap-3 rounded-xl">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-surface shadow-soft">
                <Image src="/icons/logo.svg" alt="" width={30} height={30} className="size-[30px] object-contain" />
              </div>
              <div className="min-w-0">
                <span className="block text-[15px] font-bold tracking-[-0.035em]">{APP_CONFIG.name}</span>
                <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">ByKitsune workspace</span>
              </div>
            </Link>
            {onClose && <button type="button" onClick={onClose} aria-label="Close navigation" className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-surface/80 text-text-muted shadow-soft transition-[background-color,transform] hover:bg-surface-2 hover:text-text-main active:scale-95 motion-reduce:transform-none"><X size={19} aria-hidden="true" /></button>}
          </div>
          <div className={cn("mt-5 items-center gap-2.5 rounded-2xl border border-border-subtle bg-surface/70 px-3 py-3 shadow-soft", onClose ? "hidden min-[480px]:flex" : "flex")}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Waypoints size={16} aria-hidden="true" /></div>
            <div className="min-w-0"><p className="text-xs font-semibold">Your routing workspace</p><p className="mt-0.5 text-[11px] text-text-muted">Your models. Your routes.</p></div>
          </div>
          {updateInfo && (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
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
          <nav aria-label="Dashboard navigation" className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 pb-5 custom-scrollbar">
            <div className="space-y-1">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Gateway</p>
              {navItems.slice(0, 3).map(renderNavLink)}
            </div>
            <div className="space-y-1">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Observe & optimize</p>
              {navItems.slice(3, 6).map(renderNavLink)}
            </div>
            <div className="space-y-1">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Workspace</p>
              {navItems.slice(6).map(renderNavLink)}
              <button type="button" aria-expanded={mediaOpen} aria-controls={mediaId} onClick={() => setMediaOpen(v => !v)} className={cn("group relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors", pathname.startsWith("/dashboard/media-providers") ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text-main")}>
                <ImageIcon size={18} strokeWidth={1.8} aria-hidden="true" />
                <span className="min-w-0 flex-1">Media providers</span>
                <ChevronDown size={15} aria-hidden="true" className={cn("transition-transform duration-300", mediaOpen && "rotate-180")} />
              </button>
              <div id={mediaId} hidden={!mediaOpen} className="ml-5 space-y-1 border-l border-border-subtle pl-2">
                {MEDIA_PROVIDER_KINDS.filter(k => VISIBLE_MEDIA_KINDS.includes(k.id)).map(kind => renderNavLink({ href: `/dashboard/media-providers/${kind.id}`, label: kind.label, icon: kind.icon }, true))}
                {renderNavLink(COMBINED_WEB_ITEM, true)}
              </div>
              {systemItems.map(renderNavLink)}
            </div>
            <div className="space-y-1">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Developer</p>
              {debugItems.filter(item => item.href !== "/dashboard/translator" || enableTranslator).map(renderNavLink)}
              {renderNavLink({ href: "/dashboard/profile", label: "Settings", icon: "settings" })}
            </div>
          </nav>
        </LayoutGroup>
        <div className="shrink-0 border-t border-border-subtle px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <a href={BRAND.docsUrl} className="group flex min-h-10 items-center justify-between gap-2 rounded-xl text-xs font-semibold text-text-muted transition-colors hover:text-primary"><span>Documentation</span><ArrowUpRight size={16} aria-hidden="true" className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></a>
          <div className="mt-2 flex items-center justify-between text-[11px] text-text-subtle"><a href={BRAND.sponsorUrl} className="rounded underline-offset-4 hover:text-primary hover:underline">By {BRAND.organization}</a><span className="rounded-md border border-border-subtle px-1.5 py-0.5 font-mono">v{APP_CONFIG.version}</span></div>
        </div>
      </aside>

      <dialog
        ref={updateDialog}
        aria-labelledby={updateTitleId}
        className="m-auto rounded-3xl border border-border-subtle shadow-elevated max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg overflow-y-auto overscroll-contain bg-surface p-6 text-text-main backdrop:bg-black/50 backdrop:overflow-hidden backdrop:overscroll-contain sm:p-8"
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
