import { registerHooks, createRequire } from "node:module";
import { dirname, sep } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const adapterUrl = new URL("./minimatch-legacy.cjs", import.meta.url).href;
// These are the only installed legacy packages that require a callable matcher.
// ESLint/config-array use modern named exports and must not receive the adapter.
const legacyRoots = ["eslint-plugin-react", "eslint-plugin-import", "eslint-plugin-jsx-a11y"]
  .map(name => pathToFileURL(`${dirname(require.resolve(`${name}/package.json`))}${sep}`).href);
const registrationKey = Symbol.for("kitsune-router.eslint.minimatchCompatibility");

export function isLegacyMinimatchImport(specifier, parentUrl) {
  return specifier === "minimatch" && typeof parentUrl === "string"
    && legacyRoots.some(root => parentUrl.startsWith(root));
}

// Node >=22.19 supports this synchronous public loader API. Install once per
// lint process, including when a test/config reload evaluates this module again.
export function installLegacyMinimatchCompatibility() {
  if (!globalThis[registrationKey]) {
    globalThis[registrationKey] = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (isLegacyMinimatchImport(specifier, context.parentURL)) {
          return { url: adapterUrl, format: "commonjs", shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
    });
  }
  return globalThis[registrationKey];
}
