import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { BRAND } from "../../branding/identity.mjs";

// Compile the actual component with Next's JSX compiler, matching the existing
// component tests without changing the application's JavaScript test pipeline.
const require = createRequire(import.meta.url);
const filename = new URL("../../src/app/(dashboard)/dashboard/providers/components/OfficialProvider.js", import.meta.url);
const code = require("next/dist/compiled/babel/core").transformSync(readFileSync(filename, "utf8"), {
  filename: filename.pathname, babelrc: false, configFile: false,
  presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;
const componentModule = { exports: {} };
vm.runInNewContext(code, {
  module: componentModule, exports: componentModule.exports,
  require(id) {
    if (id === "@/shared/constants/config") return { BRAND };
    return require(id);
  },
});
const OfficialProvider = componentModule.exports.default;

describe("official ByKitsune provider highlight", () => {
  it("names the official provider in an accessible section with existing brand artwork", () => {
    const html = renderToStaticMarkup(createElement(OfficialProvider));
    expect(html).toContain('id="official-provider"');
    expect(html).toContain('aria-labelledby="official-provider-heading"');
    expect(html).toMatch(/<h2[^>]*id="official-provider-heading"[^>]*>ByKitsune<\/h2>/);
    expect(html).toContain("Official provider");
    expect(html).toContain(`team behind ${BRAND.name}`);
    expect(decodeURIComponent(html)).toContain("/brand/bykitsune-favicon-512.png");
    expect(html).toMatch(/<img[^>]*alt=""/);
  });

  it("links to provider setup and the official website with accessible destinations", () => {
    const html = renderToStaticMarkup(createElement(OfficialProvider));
    expect(html).toContain(`href="${BRAND.sponsorUrl}"`);
    expect(html).toContain('aria-label="Visit ByKitsune website (opens in a new tab)"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('href="/dashboard/providers/bykitsune"');
    expect(html).toContain("Connect ByKitsune");
  });
});
