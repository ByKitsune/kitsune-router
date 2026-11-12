import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const filename = new URL("../../src/i18n/withRuntimeI18nPage.js", import.meta.url);
const code = babel.transformSync(readFileSync(filename, "utf8"), {
  filename: filename.pathname, babelrc: false, configFile: false,
  presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;

// Execute the real page HOC. DOM hydration itself has a genuine renderToString /
// hydrateRoot browser regression; these hook/network fixtures start hydrated.
export function compileHydratedPageWrapper(jsx) {
  const componentModule = { exports: {} };
  vm.runInNewContext(code, { module: componentModule, exports: componentModule.exports, require(id) {
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (id === "./RuntimeI18nBoundary") return { __esModule: true, default: ({ children }) => children };
    throw new Error(`Unexpected page-wrapper import: ${id}`);
  } }, { filename: filename.pathname });
  return componentModule.exports;
}

export function renderHydratedPage(Page) {
  let tree = Page({});
  while (tree && typeof tree.type === "function") tree = tree.type(tree.props);
  return tree;
}
