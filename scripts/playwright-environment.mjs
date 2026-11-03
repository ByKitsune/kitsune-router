// Playwright supplies FORCE_COLOR to its worker and web-server children. Use
// that one color control throughout the process tree instead of inheriting a
// contradictory NO_COLOR flag, which Node correctly reports as a warning.
export function normalizePlaywrightColorEnvironment(env) {
  if (env.NO_COLOR === undefined) return env;
  if (env.NO_COLOR !== "" && env.FORCE_COLOR === undefined) {
    env.FORCE_COLOR = "0";
    env.DEBUG_COLORS ??= "0";
  }
  delete env.NO_COLOR;
  return env;
}
