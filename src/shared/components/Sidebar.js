"use client";

import { useState, useEffect, useId, useRef } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
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

  // Note: legacy updater poll removed. New flow: copy install cmd + shutdown server,
  // user runs the command manually in another terminal.


  return (
    <>
      <aside className="flex h-full w-72 max-w-[calc(100vw-24px)] flex-col bg-sidebar text-text-main">
        <div className="flex shrink-0 flex-col gap-4 px-5 pb-4 pt-6">
          <div className="flex items-center justify-between gap-2">
            <Link href="/dashboard" onClick={onClose} className="flex min-w-0 items-center gap-2.5">
              <Image src="/icons/logo.svg" alt="" width={38} height={38} className="shrink-0" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base font-bold tracking-[-0.035em]">{APP_CONFIG.name}</span>
                <span className="text-xs text-text-muted">Your routing workspace</span>
              </div>
            </Link>
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close navigation" className="flex size-10 shrink-0 items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text-main">
                <span aria-hidden="true" className="material-symbols-outlined text-xl">close</span>
              </button>
            )}
          </div>
          {updateInfo && (
            <div className="bg-surface-2 p-3">
              <p className="text-xs font-semibold leading-5">Update available: v{updateInfo.latestVersion}</p>
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(true)}
                  className="min-h-10 text-xs font-bold text-primary underline underline-offset-4"
                >
                  Update options
                </button>
                <button
                  type="button"
                  onClick={copyCommand}
                  className="min-h-10 text-xs font-semibold underline underline-offset-4"
                >
                  Copy command
                </button>
              </div>
              {!isUpdating && <p className="text-xs leading-5 text-text-muted" role="status">{copyFeedback}</p>}
            </div>
          )}
        </div>

        <nav aria-label="Dashboard navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 custom-scrollbar">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "group flex min-h-10 items-center gap-3 rounded-sm px-3 py-2",
                isActive(item.href)
                  ? "bg-surface-3 text-text-main font-semibold"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "material-symbols-outlined text-[19px] transition-colors",
                  isActive(item.href) ? "text-primary" : "group-hover:text-primary"
                )}
              >
                {item.icon}
              </span>
              <span className="text-[13px] leading-5">{item.label}</span>
            </Link>
          ))}

          {/* System section */}
          <div className="pt-3 mt-2 space-y-0.5">
            <p className="mb-2 px-3 text-xs font-semibold text-text-muted">
              Workspace
            </p>

            {/* Media Providers accordion */}
            <button
              type="button"
              aria-expanded={mediaOpen}
              aria-controls={mediaId}
              onClick={() => setMediaOpen((v) => !v)}
              className={cn(
                "group flex min-h-10 w-full items-center gap-3 rounded-sm px-3 py-2",
                pathname.startsWith("/dashboard/media-providers")
                  ? "bg-surface-3 text-text-main font-semibold"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span aria-hidden="true" className={cn("material-symbols-outlined text-[19px]", pathname.startsWith("/dashboard/media-providers") ? "text-primary" : "group-hover:text-primary")}>perm_media</span>
              <span className="text-[13px] flex-1 text-left">Media providers</span>
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]" style={{ transform: mediaOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                expand_more
              </span>
            </button>
            <div id={mediaId} className="pl-4" hidden={!mediaOpen}>
              {MEDIA_PROVIDER_KINDS.filter((k) => VISIBLE_MEDIA_KINDS.includes(k.id)).map((kind) => (
                  <Link
                    key={kind.id}
                    href={`/dashboard/media-providers/${kind.id}`}
                    onClick={onClose}
                    aria-current={pathname.startsWith(`/dashboard/media-providers/${kind.id}`) ? "page" : undefined}
                    className={cn(
                      "group flex min-h-10 items-center gap-3 rounded-sm px-3 py-2",
                      pathname.startsWith(`/dashboard/media-providers/${kind.id}`)
                        ? "bg-surface-3 text-text-main font-semibold"
                        : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                    )}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{kind.icon}</span>
                    <span className="text-[13px]">{kind.label}</span>
                  </Link>
              ))}
              <Link
                  key={COMBINED_WEB_ITEM.id}
                  href={COMBINED_WEB_ITEM.href}
                  onClick={onClose}
                  aria-current={pathname.startsWith(COMBINED_WEB_ITEM.href) ? "page" : undefined}
                  className={cn(
                    "group flex min-h-10 items-center gap-3 rounded-sm px-3 py-2",
                    pathname.startsWith(COMBINED_WEB_ITEM.href)
                      ? "bg-surface-3 text-text-main font-semibold"
                      : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                  )}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{COMBINED_WEB_ITEM.icon}</span>
                  <span className="text-[13px]">{COMBINED_WEB_ITEM.label}</span>
              </Link>
            </div>

            {systemItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "group flex min-h-10 items-center gap-3 rounded-sm px-3 py-2",
                  isActive(item.href)
                    ? "bg-surface-3 text-text-main font-semibold"
                    : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "material-symbols-outlined text-[19px] transition-colors",
                    isActive(item.href) ? "text-primary" : "group-hover:text-primary"
                  )}
                >
                  {item.icon}
                </span>
                <span className="text-[13px]">{item.label}</span>
              </Link>
            ))}

            {/* Debug items (inside System section, before Settings) */}
            {debugItems.map((item) => {
              const show = item.href !== "/dashboard/translator" || enableTranslator;
              return show ? (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "group flex min-h-10 items-center gap-3 rounded-sm px-3 py-2",
                    isActive(item.href)
                      ? "bg-surface-3 text-text-main font-semibold"
                      : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "material-symbols-outlined text-[19px] transition-colors",
                      isActive(item.href) ? "text-primary" : "group-hover:text-primary"
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="text-[13px]">{item.label}</span>
                </Link>
              ) : null;
            })}

            {/* Settings */}
            <Link
              href="/dashboard/profile"
              onClick={onClose}
              aria-current={isActive("/dashboard/profile") ? "page" : undefined}
              className={cn(
                "group flex min-h-10 items-center gap-3 rounded-sm px-3 py-2",
                isActive("/dashboard/profile")
                  ? "bg-surface-3 text-text-main font-semibold"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "material-symbols-outlined text-[19px] transition-colors",
                  isActive("/dashboard/profile") ? "text-primary" : "group-hover:text-primary"
                )}
              >
                settings
              </span>
              <span className="text-[13px]">Settings</span>
            </Link>
          </div>
        </nav>
        <div className="shrink-0 px-6 pb-5 pt-4 text-xs leading-6 text-text-muted">
          <div className="flex items-center justify-between gap-3"><span>v{APP_CONFIG.version}</span><a href={BRAND.docsUrl} className="inline-flex min-h-8 items-center font-semibold hover:underline underline-offset-4">Documentation</a></div>
          <p>Maintained by <a href={BRAND.sponsorUrl} className="font-semibold underline underline-offset-4">{BRAND.organization}</a></p>
        </div>
      </aside>

      <dialog
        ref={updateDialog}
        aria-labelledby={updateTitleId}
        className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg overflow-y-auto overscroll-contain border-0 bg-surface p-6 text-text-main backdrop:bg-black/50 backdrop:overflow-hidden backdrop:overscroll-contain sm:p-8"
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
