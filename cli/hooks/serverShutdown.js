const { spawnSync } = require("node:child_process");

const pending = new WeakMap();

function shutdownGraceMs(env = process.env) {
  const value = Number(env.KITSUNE_ROUTER_SHUTDOWN_DEADLINE_MS || 15000);
  // Let custom-server publish its own failure exit after its deadline first.
  return (Number.isSafeInteger(value) && value > 0 ? value : 15000) + 1000;
}

// Only accepts the ChildProcess returned by this launcher's spawn. Never discover
// processes by name/port or retain an old pid after the child's exit event.
function stopOwnedServer(child, { graceMs = shutdownGraceMs(), forceWaitMs = 2000, platform = process.platform } = {}) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid < 2) return Promise.resolve({ code: 1, forced: false });
  if (pending.has(child)) return pending.get(child);
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode ?? 1, forced: false });
  }
  const promise = new Promise(resolve => {
    let timer, forceTimer, forced = false, done = false;
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      child.removeListener("exit", onExit);
      resolve({ code, forced });
    };
    const onExit = (code, signal) => {
      // If managed shutdown failed, its root may exit before our deadline while
      // an unresponsive helper remains. Its detached group is still ours.
      if (platform !== "win32" && code !== 0) {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
      finish(forced ? 1 : code ?? (signal === "SIGTERM" ? 0 : 1));
    };
    child.once("exit", onExit);
    timer = setTimeout(() => {
      forced = true;
      if (platform === "win32") {
        // /T is scoped to this still-live child, including its helper tree.
        try { spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: forceWaitMs }); } catch {}
      } else {
        // The launcher spawns a detached group; escalation must include owned
        // descendants so a non-cooperative server cannot orphan helpers.
        try { process.kill(-child.pid, "SIGKILL"); }
        catch { try { child.kill("SIGKILL"); } catch {} }
      }
      forceTimer = setTimeout(() => finish(1), forceWaitMs);
    }, graceMs);
    if (platform === "win32" && child.connected) {
      // Windows cannot deliver a catchable SIGTERM to Node. A private parent
      // IPC channel reaches the same managed shutdown without a public API.
      try { child.send({ type: "kitsune-router:shutdown" }, () => {}); } catch {}
    } else {
      try { child.kill("SIGTERM"); } catch { /* deadline still bounds teardown */ }
    }
  });
  pending.set(child, promise);
  return promise;
}

module.exports = { shutdownGraceMs, stopOwnedServer };
