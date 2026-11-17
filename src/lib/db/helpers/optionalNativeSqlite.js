/* global __non_webpack_require__ */
import { createRequire } from "node:module";

// Webpack must not resolve this optional package while compiling. Its native
// require also retains Node's NODE_PATH lookup, used by the CLI's managed
// runtime directory. Bare ESM import() would not search that directory.
// https://webpack.js.org/api/module-variables/#__non_webpack_require__-webpack-specific
const nativeRequire = typeof __non_webpack_require__ === "function"
  ? __non_webpack_require__ : createRequire(import.meta.url);

// Keep loading lazy: an absent package or unusable native binding must reach
// the caller's existing fallback, rather than prevent route/module startup.
// next.config.mjs explicitly traces the installed package into standalone.
export function loadBetterSqlite() {
  return nativeRequire("better-sqlite3");
}
