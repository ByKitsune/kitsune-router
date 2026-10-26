const lifecycle = globalThis[Symbol.for("zenrouter.db.lifecycle")] ||= { managed: false, releases: new Set() };

export function configureDbLifecycle({ managed = true } = {}) {
  lifecycle.managed = managed;
  if (managed) for (const release of [...lifecycle.releases]) release();
}

export function isDbLifecycleManaged() {
  return lifecycle.managed;
}

export function registerAdapterShutdown(close) {
  if (lifecycle.managed) return () => {};
  const beforeExit = () => close();
  const signal = () => { close(); process.exit(0); };
  const release = () => {
    process.off("beforeExit", beforeExit);
    process.off("SIGINT", signal);
    process.off("SIGTERM", signal);
    lifecycle.releases.delete(release);
  };
  lifecycle.releases.add(release);
  process.once("beforeExit", beforeExit);
  process.once("SIGINT", signal);
  process.once("SIGTERM", signal);
  return release;
}
