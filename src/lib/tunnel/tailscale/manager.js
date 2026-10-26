import { loadState, generateShortId } from "../shared/state.js";
import { startFunnel, stopFunnel, cancelTailscaleCommands, isTailscaleRunning, isTailscaleRunningStrict, isTailscaleLoggedIn, isTailscaleLoggedInStrict, startLogin, startDaemonWithPassword, provisionCert } from "./tailscale.js";
import { HEALTH_CHECK } from "./config.js";
import { getSettings, updateSettings } from "@/lib/localDb";
import { getCachedPassword, loadEncryptedPassword, initDbHooks, getHelperLifecycle } from "@/mitm/manager";

initDbHooks(getSettings, updateSettings);

const lifecycle = getHelperLifecycle();
const scope = lifecycle.scope("tailscale-manager");
const svc = scope.data.service ??= {
  cancelToken: { cancelled: false },
  spawnInProgress: false,
  lastRestartAt: 0,
  activeLocalPort: null,
};

export function getTailscaleService() { return svc; }
export function isTailscaleReconnecting() { return svc.spawnInProgress; }

scope.stop = () => { svc.cancelToken.cancelled = true; };

export function enableTailscale(localPort = 20128) {
  if (lifecycle.isStopping()) return lifecycle.run(scope, "enable", () => {});
  if (scope.pending.has("disable")) return scope.pending.get("disable").then(() => enableTailscale(localPort));
  if (scope.pending.has("enable")) return scope.pending.get("enable");
  lifecycle.invalidate(scope);
  svc.cancelToken.cancelled = true;
  const token = svc.cancelToken = { cancelled: false };
  svc.activeLocalPort = localPort;
  svc.spawnInProgress = true;
  return lifecycle.run(scope, "enable", async assert => {
    const check = () => { assert(); if (token.cancelled) throw new Error("tailscale cancelled"); };
    try {
      const sudoPass = getCachedPassword() || await loadEncryptedPassword() || "";
      check();
      await startDaemonWithPassword(sudoPass, check);
      check();
      const existing = loadState();
      const tsHostname = existing?.shortId || generateShortId();
      const loggedIn = await isTailscaleLoggedInStrict();
      check();
      if (!loggedIn) {
        const loginResult = await startLogin(tsHostname, check);
        check();
        if (loginResult.authUrl) return { success: false, needsLogin: true, authUrl: loginResult.authUrl };
      }
      check();
      stopFunnel();
      let result;
      try {
        result = await startFunnel(localPort, check);
      } catch (error) {
        check();
        if (/NoState|unexpected state|not logged in|Logged ?out|NeedsLogin/i.test(error.message || "")) {
          const loginResult = await startLogin(tsHostname, check);
          check();
          if (loginResult.authUrl) return { success: false, needsLogin: true, authUrl: loginResult.authUrl };
        }
        throw error;
      }
      check();
      if (result.funnelNotEnabled) return { success: false, funnelNotEnabled: true, enableUrl: result.enableUrl };
      const stillLoggedIn = await isTailscaleLoggedInStrict();
      check();
      const running = stillLoggedIn && await isTailscaleRunningStrict();
      check();
      if (!running) {
        stopFunnel();
        return { success: false, error: "Tailscale not connected. Device may have been removed. Please re-login." };
      }
      await updateSettings({ tailscaleEnabled: true, tailscaleUrl: result.tunnelUrl });
      check();
      await provisionCert(new URL(result.tunnelUrl).hostname);
      check();
      try {
        await lifecycle.health(scope, result.tunnelUrl, HEALTH_CHECK, check);
      } catch (error) {
        check();
        if (!error.message.startsWith("Health check timeout")) throw error;
      }
      check();
      return { success: true, tunnelUrl: result.tunnelUrl };
    } finally {
      if (svc.cancelToken === token) svc.spawnInProgress = false;
    }
  });
}

export function disableTailscale() {
  if (scope.pending.has("disable")) return scope.pending.get("disable");
  if (lifecycle.isStopping()) return lifecycle.run(scope, "disable", () => {});
  lifecycle.invalidate(scope);
  svc.cancelToken.cancelled = true;
  const closed = cancelTailscaleCommands();
  const previous = [...scope.pending.values()];
  return lifecycle.run(scope, "disable", async check => {
    await Promise.allSettled(previous);
    await closed;
    check();
    stopFunnel();
    await updateSettings({ tailscaleEnabled: false, tailscaleUrl: "" });
    check();
    return { success: true };
  });
}

export async function getTailscaleStatus() {
  const settings = await getSettings();
  const settingsEnabled = settings.tailscaleEnabled === true;
  const tunnelUrl = settings.tailscaleUrl || "";
  // Skip probes entirely when disabled; check login before running (device removed = not logged in)
  const loggedIn = settingsEnabled ? isTailscaleLoggedIn() : false;
  const running = loggedIn ? isTailscaleRunning() : false;
  return {
    enabled: settingsEnabled && running,
    settingsEnabled,
    tunnelUrl,
    running,
    loggedIn
  };
}
