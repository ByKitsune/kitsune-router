import lifecycle from "../../shutdown-lifecycle.cjs";

export const { registerShutdownHook, isShuttingDown, runShutdownHooks } = lifecycle;
