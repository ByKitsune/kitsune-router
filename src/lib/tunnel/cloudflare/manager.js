import { loadState, saveState, generateShortId } from "../shared/state.js";
import { spawnQuickTunnel, killCloudflared, isCloudflaredRunning, setUnexpectedExitHandler } from "./cloudflared.js";
import { clearPid } from "./pid.js";
import { WORKER_URL, HEALTH_CHECK } from "./config.js";
import { getSettings, updateSettings } from "@/lib/localDb";
import { getHelperLifecycle } from "@/mitm/manager";

const lifecycle = getHelperLifecycle();
const scope = lifecycle.scope("cloudflare-manager");
const svc = scope.data.service ??= {
  cancelToken: { cancelled: false },
  spawnInProgress: false,
  lastRestartAt: 0,
  activeLocalPort: null,
};

export function getTunnelService() { return svc; }
export function isTunnelManuallyDisabled() { return svc.cancelToken.cancelled; }
export function isTunnelReconnecting() { return svc.spawnInProgress; }

export function setTunnelUnexpectedExitCallback(cb) { scope.data.onUnexpectedExit = cb; }

scope.stop = () => {
  svc.cancelToken.cancelled = true;
  scope.data.onUnexpectedExit = null;
  setUnexpectedExitHandler(null);
  killCloudflared();
};

async function registerTunnelUrl(shortId, tunnelUrl) {
  const response = await fetch(`${WORKER_URL}/api/tunnel/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shortId, tunnelUrl })
  });
  await response?.body?.cancel?.();
}

export function enableTunnel(localPort = 20128) {
  if (lifecycle.isStopping()) return lifecycle.run(scope, "enable", () => {});
  if (scope.pending.has("disable")) return scope.pending.get("disable").then(() => enableTunnel(localPort));
  if (scope.pending.has("enable")) return scope.pending.get("enable");
  const token = svc.cancelToken.cancelled ? svc.cancelToken = { cancelled: false } : svc.cancelToken;
  svc.activeLocalPort = localPort;
  svc.spawnInProgress = true;
  return lifecycle.run(scope, "enable", async (assert, generation) => {
    const check = () => { assert(); if (token.cancelled) throw new Error("tunnel cancelled"); };
    try {
      if (isCloudflaredRunning()) {
        const existing = loadState();
        if (existing?.tunnelUrl && existing?.shortId) {
          const publicUrl = `https://r${existing.shortId}.abc-tunnel.us`;
          const alive = await Promise.allSettled([
            lifecycle.probe(existing.tunnelUrl, HEALTH_CHECK, check),
            lifecycle.probe(publicUrl, HEALTH_CHECK, check),
          ]);
          check();
          if (alive.every(result => result.status === "fulfilled" && result.value)) {
            return { success: true, tunnelUrl: existing.tunnelUrl, shortId: existing.shortId, publicUrl, alreadyRunning: true };
          }
        }
      }
      check();
      await killCloudflared(localPort);
      check();
      const existing = loadState();
      const shortId = existing?.shortId || generateShortId();
      const onUrlUpdate = (url) => {
        if (!lifecycle.active(scope, generation) || token.cancelled) return Promise.resolve();
        return lifecycle.run(scope, "url-update", async () => {
          check();
          await registerTunnelUrl(shortId, url);
          check();
          saveState({ shortId, tunnelUrl: url });
          await updateSettings({ tunnelEnabled: true, tunnelUrl: url });
        });
      };
      setUnexpectedExitHandler(() => {
        if (!lifecycle.active(scope, generation) || token.cancelled) return Promise.resolve();
        return lifecycle.run(scope, "unexpected-exit", () => scope.data.onUnexpectedExit?.());
      });
      const { tunnelUrl } = await spawnQuickTunnel(localPort, onUrlUpdate, check);
      check();
      const publicUrl = `https://r${shortId}.abc-tunnel.us`;
      await registerTunnelUrl(shortId, tunnelUrl);
      check();
      saveState({ shortId, tunnelUrl });
      await updateSettings({ tunnelEnabled: true, tunnelUrl });
      check();
      await lifecycle.health(scope, [publicUrl, tunnelUrl], HEALTH_CHECK, check);
      check();
      return { success: true, tunnelUrl, shortId, publicUrl };
    } finally {
      if (svc.cancelToken === token) svc.spawnInProgress = false;
    }
  });
}

export function disableTunnel() {
  if (scope.pending.has("disable")) return scope.pending.get("disable");
  if (lifecycle.isStopping()) return lifecycle.run(scope, "disable", () => {});
  lifecycle.invalidate(scope);
  svc.cancelToken.cancelled = true;
  setUnexpectedExitHandler(null);
  const closed = killCloudflared(svc.activeLocalPort);
  const previous = [...scope.pending.values()];
  return lifecycle.run(scope, "disable", async check => {
    await Promise.allSettled(previous);
    await closed;
    check();
    clearPid();
    const state = loadState();
    if (state) saveState({ shortId: state.shortId, tunnelUrl: null });
    await updateSettings({ tunnelEnabled: false, tunnelUrl: "" });
    check();
    svc.spawnInProgress = false;
    svc.activeLocalPort = null;
    return { success: true };
  });
}

export async function getTunnelStatus() {
  const settings = await getSettings();
  const settingsEnabled = settings.tunnelEnabled === true;
  const state = loadState();
  const shortId = state?.shortId || "";
  const publicUrl = shortId ? `https://r${shortId}.abc-tunnel.us` : "";
  const tunnelUrl = state?.tunnelUrl || "";

  // Lazy: skip PID probe entirely when user disabled tunnel
  const running = settingsEnabled ? isCloudflaredRunning() : false;

  return {
    enabled: settingsEnabled && running,
    settingsEnabled,
    tunnelUrl,
    shortId,
    publicUrl,
    running
  };
}
