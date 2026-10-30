import { existsSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export function resolveUiTestServer(root, distDir = ".next") {
  root = realpathSync(root);
  const build = resolve(root, distDir);
  const within = relative(root, build);
  if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new Error("UI test build directory must be inside the project checkout.");
  }
  // Workspace tracing may retain the project directory under standalone.
  const candidate = [join(build, "standalone/custom-server.js"), join(build, "standalone", basename(root), "custom-server.js")]
    .find(candidate => existsSync(candidate) && existsSync(join(dirname(candidate), "server.js")));
  if (!candidate) throw new Error(`UI tests require a production build in ${within}. Build with the same NEXT_DIST_DIR before testing.`);
  const server = realpathSync(candidate);
  const actual = relative(root, server);
  if (actual === ".." || actual.startsWith(`..${sep}`) || isAbsolute(actual)) throw new Error("UI test server must remain inside the project checkout.");
  const generated = relative(root, realpathSync(join(dirname(server), "server.js")));
  if (generated === ".." || generated.startsWith(`..${sep}`) || isAbsolute(generated)) throw new Error("UI test server must remain inside the project checkout.");
  // Next and the custom server load .env beside their generated server.
  const embeddedEnvironment = readdirSync(dirname(server)).some(name => name === ".env" || name.startsWith(".env."));
  if (embeddedEnvironment) throw new Error("UI tests refuse a standalone build containing .env files. Build from an isolated source configuration first.");
  return server;
}
