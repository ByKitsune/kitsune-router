import os from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { cleanupProviderConnections, getSettings, updateSettings, getApiKeys } from "@/lib/localDb";
import {
  enableTunnel, enableTailscale,
  isTunnelManuallyDisabled, isTunnelReconnecting, isTailscaleReconnecting,
  getTunnelService, getTailscaleService, setTunnelUnexpectedExitCallback,
  killCloudflared, isCloudflaredRunning, ensureCloudflared,
  isTailscaleRunning, isTailscaleRunningStrict, isDaemonAlive, startFunnel,
  checkInternet,
  RESTART_COOLDOWN_MS, NETWORK_SETTLE_MS,
  WATCHDOG_INTERVAL_MS, NETWORK_CHECK_INTERVAL_MS, VIRTUAL_IFACE_REGEX,
} from "@/lib/tunnel";
import { getMitmStatus, startMitm, loadEncryptedPassword, initDbHooks, restoreToolDNS, removeAllDNSEntriesSync } from "@/mitm/manager";
import { syncToJson as syncMitmAliasCache } from "@/lib/mitmAliasCache";
import { killAllBridges } from "@/lib/mcp/stdioSseBridge";
import { registerShutdownHook, isShuttingDown } from "@/lib/shutdownLifecycle.js";
import { shutdownAllManaged } from "@/lib/schedulerLifecycle.js";

// Inject correct paths and DB hooks into manager.js (CJS) from ESM context
(function bootstrapMitm() {
  if (!process.env.MITM_SERVER_PATH) {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      const appSrc = dirname(dirname(thisFile));
      const candidate = join(appSrc, "mitm", "server.js");
      if (existsSync(candidate)) process.env.MITM_SERVER_PATH = candidate;
    } catch { /* ignore */ }
  }
  try { initDbHooks(getSettings, updateSettings); } catch { /* ignore */ }
})();

process.setMaxListeners(20);

// Defer heavy startup work so the first HTTP request (login → dashboard) isn't
// starved by DB cleanup, cloudflared download, lsof/DNS probes and OAuth pings.
const STARTUP_DEFER_MS = 3000;

// Survive Next.js hot reload
const g = global.__appSingleton ??= {
  signalHandlersRegistered: false,
  watchdogInterval: null,
  networkMonitorInterval: null,
  lastNetworkFingerprint: null,
  lastWatchdogTick: Date.now(),
  lastOnline: null,
  mitmStartInProgress: false,
  tunnelAutoResumed: false,
  tailscaleAutoResumed: false,
};
g.pending ??= new Map();

function canStartWork() {
  return !g.draining && !isShuttingDown();
}

function runOwnedTask(name, run) {
  if (!canStartWork()) return Promise.resolve();
  if (g.pending.has(name)) return g.pending.get(name);
  const task = Promise.resolve().then(() => {
    if (canStartWork()) return run();
  });
  g.pending.set(name, task);
  task.finally(() => {
    if (g.pending.get(name) === task) g.pending.delete(name);
  }).catch(() => {});
  return task;
}

export function stopApplicationStartup() {
  if (g.stopPromise) return g.stopPromise;
  g.draining = true;
  clearTimeout(g.startupTimeout);
  g.startupTimeout = null;
  stopWatchdog();
  stopNetworkMonitor();
  setTunnelUnexpectedExitCallback(null);
  for (const service of [getTunnelService(), getTailscaleService()]) {
    if (service.cancelToken) service.cancelToken.cancelled = true;
  }
  shutdownAllManaged();
  killCloudflared();
  const helperDrain = globalThis[Symbol.for("zenrouter.helper.lifecycle")]?.stop();
  g.stopPromise = (async () => {
    while (g.pending.size) await Promise.allSettled([...g.pending.values()]);
    await helperDrain;
  })();
  return g.stopPromise;
}

async function cleanupApplication() {
  await stopApplicationStartup();
  try { removeAllDNSEntriesSync(); } catch { /* best effort */ }
  try { killAllBridges(); } catch { /* best effort */ }
  killCloudflared();
}

function registerApplicationCleanup() {
  if (g.signalHandlersRegistered) return;
  if (process.env.ZENROUTER_MANAGED_SHUTDOWN === "1") {
    registerShutdownHook("application-schedulers", 10, cleanupApplication);
  } else {
    const exit = () => {
      cleanupApplication().then(() => process.exit(), (error) => {
        console.error("[InitApp] cleanup failed:", error);
        process.exit(1);
      });
    };
    process.on("SIGINT", exit);
    process.on("SIGTERM", exit);
  }
  g.exitHandler = () => { try { removeAllDNSEntriesSync(); } catch { /* ignore */ } };
  process.on("exit", g.exitHandler);
  g.signalHandlersRegistered = true;
}

export async function initializeApp() {
  try {
    registerApplicationCleanup();
    if (!canStartWork()) return;
    setTunnelUnexpectedExitCallback(() => safeRestartTunnel("unexpected-exit"));

    if (g.startupScheduled) return;
    g.startupScheduled = true;
    g.startupTimeout = setTimeout(() => {
      g.startupTimeout = null;
      runOwnedTask("startup", runHeavyStartup)
        .catch((e) => console.error("[InitApp] deferred startup failed:", e.message));
    }, STARTUP_DEFER_MS);
  } catch (error) {
    console.error("[InitApp] Error:", error);
  }
}

async function runHeavyStartup() {
  if (!canStartWork()) return;
  await cleanupProviderConnections();
  if (!canStartWork()) return;
  const settings = await getSettings();
  if (!canStartWork()) return;

  // Auto-resume tunnel (once per process)
  if (settings.tunnelEnabled && !g.tunnelAutoResumed) {
    g.tunnelAutoResumed = true;
    console.log("[InitApp] Tunnel was enabled, auto-resuming...");
    safeRestartTunnel("startup").catch((e) => console.log("[InitApp] Tunnel resume failed:", e.message));
  }

  // Auto-resume tailscale (once per process)
  if (settings.tailscaleEnabled && !g.tailscaleAutoResumed) {
    g.tailscaleAutoResumed = true;
    console.log("[InitApp] Tailscale was enabled, auto-resuming...");
    safeRestartTailscale("startup").catch((e) => console.log("[InitApp] Tailscale resume failed:", e.message));
  }

  if (settings.tunnelEnabled) runOwnedTask("cloudflared", ensureCloudflared).catch(() => {});

  if (settings.mitmEnabled && process.env.ZENROUTER_DISABLE_MITM !== "1") {
    // Sync mitmAlias DB → JSON cache so standalone MITM server can read it.
    runOwnedTask("mitm-aliases", syncMitmAliasCache).catch(() => {});
    runOwnedTask("mitm", () => autoStartMitm(settings)).catch(() => {});
  }

  configureTunnelMonitoring(settings);

  if (hasQuotaAutoPingEnabled(settings)) {
    runOwnedTask("quota-start", async () => {
      const { startQuotaAutoPing } = await import("@/shared/services/quotaAutoPing");
      if (canStartWork()) startQuotaAutoPing();
    }).catch((e) => console.log("[AutoPing] scheduler start failed:", e.message));
  }

  // Proactive OAuth token refresh (e.g. grok-cli ~6h TTL). Module is idempotent
  // and also started from custom-server.js when that entry is used.
  runOwnedTask("refresh-start", async () => {
    const { startBackgroundTokenRefresh } = await import("@/sse/services/backgroundTokenRefresh.js");
    if (canStartWork()) startBackgroundTokenRefresh();
  }).catch((e) => console.log("[BackgroundTokenRefresh] scheduler start failed:", e.message));
}

function hasQuotaAutoPingEnabled(settings) {
  return [settings?.claudeAutoPing, settings?.codexAutoPing]
    .some((config) => Object.values(config?.connections || {}).some(Boolean));
}

async function autoStartMitm(settings) {
  if (g.mitmStartInProgress || !canStartWork()) return;
  g.mitmStartInProgress = true;
  try {
    if (!settings.mitmEnabled) return;
    const mitmStatus = await getMitmStatus();
    if (!canStartWork() || mitmStatus.running) return;

    const password = await loadEncryptedPassword();
    if (!canStartWork()) return;
    if (!password && process.platform !== "win32") {
      console.log("[InitApp] MITM was enabled but no saved password found, skipping auto-start");
      return;
    }

    const keys = await getApiKeys();
    if (!canStartWork()) return;
    const activeKey = keys.find(k => k.isActive !== false);

    console.log("[InitApp] MITM was enabled, auto-starting...");
    await startMitm(activeKey?.key || "sk_zenrouter", password);
    if (!canStartWork()) return;
    console.log("[InitApp] MITM auto-started");
    try {
      await restoreToolDNS(password);
      console.log("[InitApp] DNS restored from saved state");
    } catch (e) {
      console.log("[InitApp] DNS restore failed:", e.message);
    }
  } catch (err) {
    console.log("[InitApp] MITM auto-start failed:", err.message);
  } finally {
    g.mitmStartInProgress = false;
  }
}

// Cooldown only applies to repeating watchdog ticks (anti hammer-loop).
// Network/exit events are one-shot transitions → bypass to recover fast.
const FORCE_RESTART_REASONS = /^(startup|netchange|sleep|sleep\+netchange|online|unexpected-exit)$/;

// ─── Safe restart (4 guards: spawn / cooldown / alive / internet) ────────────

function safeRestartTunnel(reason) {
  return runOwnedTask("tunnel", () => restartTunnel(reason));
}

async function restartTunnel(reason) {
  if (!canStartWork()) return;
  const svc = getTunnelService();
  const settings = await getSettings();
  if (!canStartWork() || !settings.tunnelEnabled) return;
  if (svc.cancelToken.cancelled) return;
  if (svc.spawnInProgress) return;

  const force = FORCE_RESTART_REASONS.test(reason);

  // Process alive = trust cloudflared (self-reconnects via --retries 99, keeps same URL).
  // Killing a live process on network change drops the tunnel and rotates the quick-tunnel URL.
  if (isCloudflaredRunning()) return;

  if (!force && Date.now() - svc.lastRestartAt < RESTART_COOLDOWN_MS) {
    console.log(`[Tunnel] degraded but cooldown active, skip (${reason})`);
    return;
  }
  if (!await checkInternet() || !canStartWork() || svc.cancelToken.cancelled) return;

  console.log(`[Tunnel] safeRestart (${reason}) — tunnel unreachable${force ? " [force]" : ""}`);
  try {
    await enableTunnel();
    if (!canStartWork()) return;
    svc.lastRestartAt = Date.now();
    console.log("[Tunnel] restart success");
  } catch (err) {
    if (!/cloudflared killed|tunnel cancelled/.test(err.message)) {
      console.log("[Tunnel] restart failed:", err.message);
    }
  }
}

function safeRestartTailscale(reason) {
  return runOwnedTask("tailscale", () => restartTailscale(reason));
}

async function restartTailscale(reason) {
  if (!canStartWork()) return;
  const svc = getTailscaleService();
  const settings = await getSettings();
  if (!canStartWork() || !settings.tailscaleEnabled) return;
  if (svc.cancelToken.cancelled) return;
  if (svc.spawnInProgress) return;

  // Tailscale daemon is OS-level with built-in reconnect; trust it when running (even on netchange).
  // Startup uses strict probe — cached state is cold after process/dev reload.
  const running = reason === "startup" ? await isTailscaleRunningStrict() : isTailscaleRunning();
  if (running || !canStartWork() || svc.cancelToken.cancelled) return;

  // Daemon alive but funnel dropped → recover funnel only; never full-restart (preserves login/daemon).
  if (isDaemonAlive() && svc.activeLocalPort) {
    try {
      await startFunnel(svc.activeLocalPort);
      if (!canStartWork()) return;
      svc.lastRestartAt = Date.now();
      console.log("[Tailscale] funnel re-established (daemon alive)");
    } catch (err) {
      console.log("[Tailscale] funnel recovery failed:", err.message);
    }
    return;
  }

  const force = FORCE_RESTART_REASONS.test(reason);
  if (!force && Date.now() - svc.lastRestartAt < RESTART_COOLDOWN_MS) {
    console.log(`[Tailscale] degraded but cooldown active, skip (${reason})`);
    return;
  }
  if (!await checkInternet() || !canStartWork() || svc.cancelToken.cancelled) return;

  console.log(`[Tailscale] safeRestart (${reason}) — daemon not running${force ? " [force]" : ""}`);
  try {
    await enableTailscale();
    if (!canStartWork()) return;
    svc.lastRestartAt = Date.now();
    console.log("[Tailscale] restart success");
  } catch (err) {
    console.log("[Tailscale] restart failed:", err.message);
  }
}

// ─── Watchdog: 60s tick check both services ──────────────────────────────────

function startWatchdog() {
  if (g.watchdogInterval || !canStartWork()) return;
  g.watchdogInterval = setInterval(() => {
    safeRestartTunnel("watchdog").catch(() => {});
    safeRestartTailscale("watchdog").catch(() => {});
  }, WATCHDOG_INTERVAL_MS);
  if (g.watchdogInterval.unref) g.watchdogInterval.unref();
}

function stopWatchdog() {
  if (!g.watchdogInterval) return;
  clearInterval(g.watchdogInterval);
  g.watchdogInterval = null;
}

// ─── Network monitor: detect IPv4 fingerprint change + sleep/wake ────────────

function getNetworkFingerprint() {
  const interfaces = os.networkInterfaces();
  const active = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    if (VIRTUAL_IFACE_REGEX.test(name)) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.family === "IPv4") {
        active.push(`${name}:${addr.address}`);
      }
    }
  }
  return active.sort().join("|");
}

function startNetworkMonitor() {
  if (g.networkMonitorInterval || !canStartWork()) return;

  g.lastNetworkFingerprint = getNetworkFingerprint();
  g.lastWatchdogTick = Date.now();
  g.lastOnline = null;
  const generation = g.networkGeneration || 0;

  g.networkMonitorInterval = setInterval(() => {
    runOwnedTask("network-monitor", () => checkNetwork(generation))
      .catch((err) => console.log("[NetworkMonitor] error:", err.message));
  }, NETWORK_CHECK_INTERVAL_MS);

  if (g.networkMonitorInterval.unref) g.networkMonitorInterval.unref();
}

async function checkNetwork(generation) {
  const canContinue = () => canStartWork() && (g.networkGeneration || 0) === generation;
  if (!canContinue()) return;
  const now = Date.now();
  const elapsed = now - g.lastWatchdogTick;
  g.lastWatchdogTick = now;

  const currentFingerprint = getNetworkFingerprint();
  const networkChanged = currentFingerprint !== g.lastNetworkFingerprint;
  const wasSleep = elapsed > NETWORK_CHECK_INTERVAL_MS * 6;
  if (networkChanged) g.lastNetworkFingerprint = currentFingerprint;

  // Real reachability check (TCP 1.1.1.1:443) — not just interface presence
  const online = await checkInternet();
  if (!canContinue()) return;
  const wasOffline = g.lastOnline === false;
  g.lastOnline = online;

  if (!online) return; // no internet → idle, don't restart

  const onlineEdge = wasOffline; // offline → online transition
  if (!networkChanged && !wasSleep && !onlineEdge) return;

  // Wait for DHCP/DNS to settle before probing.
  await new Promise((resolve) => {
    g.networkSettleResolve = resolve;
    g.networkSettleTimeout = setTimeout(resolve, NETWORK_SETTLE_MS);
  });
  g.networkSettleTimeout = null;
  g.networkSettleResolve = null;
  if (!canContinue()) return;

  const reason = onlineEdge ? "online"
    : wasSleep && networkChanged ? "sleep+netchange"
    : wasSleep ? "sleep" : "netchange";
  safeRestartTunnel(reason).catch(() => {});
  safeRestartTailscale(reason).catch(() => {});
}

function stopNetworkMonitor() {
  clearInterval(g.networkMonitorInterval);
  g.networkMonitorInterval = null;
  g.networkGeneration = (g.networkGeneration || 0) + 1;
  clearTimeout(g.networkSettleTimeout);
  g.networkSettleTimeout = null;
  g.networkSettleResolve?.();
  g.networkSettleResolve = null;
  g.lastNetworkFingerprint = null;
  g.lastOnline = null;
}

export function configureTunnelMonitoring(settings) {
  if (canStartWork() && (settings?.tunnelEnabled || settings?.tailscaleEnabled)) {
    registerApplicationCleanup();
    startWatchdog();
    startNetworkMonitor();
    return;
  }
  stopWatchdog();
  stopNetworkMonitor();
}

export default initializeApp;
