import { configureDbLifecycle } from "./db/helpers/adapterLifecycle.js";
import { registerShutdownHook } from "./shutdownLifecycle.js";

const state = globalThis[Symbol.for("zenrouter.runtime.lifecycle")] ??= { installed: false };

export function installRuntimeLifecycle() {
  if (process.env.ZENROUTER_MANAGED_SHUTDOWN !== "1" || state.installed) return false;
  configureDbLifecycle({ managed: true });
  state.installed = true;
  registerShutdownHook("runtime-schedulers", 10, async () => {
    const helpers = globalThis[Symbol.for("zenrouter.helper.lifecycle")];
    const helperDrain = helpers?.stop();
    helperDrain?.catch(() => {});
    const [{ stopBackgroundTokenRefresh }, { stopModelCatalogSync }, { stopQuotaAutoPing }] = await Promise.all([
      import("../sse/services/backgroundTokenRefresh.js"),
      import("./modelCatalog/sync.js"),
      import("../shared/services/quotaAutoPing.js"),
    ]);
    await Promise.all([
      helperDrain,
      stopBackgroundTokenRefresh({ drain: true }),
      stopModelCatalogSync(),
      stopQuotaAutoPing({ drain: true }),
    ]);
  });
  registerShutdownHook("durable-usage", 30, async ({ deadline }) => {
    const { flushUsageQueue } = await import("./usageDb.js");
    const result = await flushUsageQueue({ deadline, stop: true });
    if (!result.drained) throw new Error("USAGE_SHUTDOWN_NOT_DRAINED");
  });
  registerShutdownHook("request-logs", 40, async ({ deadline }) => {
    const [{ flushRequestDetails }, { flushRequestLogs }] = await Promise.all([
      import("./usageDb.js"), import("../../open-sse/utils/requestLogger.js"),
    ]);
    const results = await Promise.allSettled([
      flushRequestDetails({ deadline }), flushRequestLogs({ deadline, stop: true }),
    ]);
    if (results.some(result => result.status === "rejected" || result.value?.drained === false)) {
      console.warn("[Shutdown] best-effort request logs not fully drained");
    }
  });
  registerShutdownHook("upstream-pools", 50, async ({ remainingMs }) => {
    const { closeUpstreamPools } = await import("../../open-sse/utils/transportPool.js");
    const result = await closeUpstreamPools({ timeoutMs: remainingMs });
    if (result.timedOut || result.livePools || result.active || result.queued || result.excluded?.mitmBypass?.active) throw new Error("UPSTREAM_SHUTDOWN_NOT_DRAINED");
  });
  registerShutdownHook("database", 60, async () => {
    const { closeDb } = await import("./db/driver.js");
    await closeDb();
  });
  return true;
}
