import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Compile the actual JSX component; the repository runner intentionally does not
// install a Vite React plugin for application .js files.
const require = createRequire(import.meta.url);
const filename = new URL("../../src/shared/components/navigation/MobileNavigation.js", import.meta.url);
const babel = require("next/dist/compiled/babel/core");
let pending = false;
function loadComponent(url) {
  const code = babel.transformSync(readFileSync(url, "utf8"), {
    filename: url.pathname, babelrc: false, configFile: false,
    presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
    plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
  }).code;
  const componentModule = { exports: {} };
  vm.runInNewContext(code, {
    module: componentModule, exports: componentModule.exports,
    require(id) {
      if (id === "next/link") return { __esModule: true, default: ({ children, ...props }) => createElement("a", props, children), useLinkStatus: () => ({ pending }) };
      if (id === "./NavigationPending") return loadComponent(new URL("../../src/shared/components/navigation/NavigationPending.js", import.meta.url));
      if (id === "@/shared/utils/cn") return { cn: (...classes) => classes.filter(Boolean).join(" ") };
      return require(id);
    },
  });
  return componentModule.exports;
}
const componentModule = { exports: loadComponent(filename) };
const { default: MobileNavigation, isNavigationRoute } = componentModule.exports;

function render(pathname, menuOpen = false) {
  return renderToStaticMarkup(createElement(MobileNavigation, { pathname, menuOpen, menuControls: "mobile-drawer", onOpenMenu: vi.fn() }));
}

describe("mobile quick navigation", () => {
  it("keeps the default dashboard and nested provider details on the correct shortcut", () => {
    expect(isNavigationRoute("/dashboard", "/dashboard/endpoint")).toBe(true);
    expect(isNavigationRoute("/dashboard/providers/openai", "/dashboard/providers")).toBe(true);
    expect(isNavigationRoute("/dashboard/providers-archive", "/dashboard/providers")).toBe(false);
    expect(isNavigationRoute("/dashboard/usage", "/dashboard/providers")).toBe(false);
    const html = render("/dashboard/providers/openai");
    expect(html).toMatch(/href="\/dashboard\/providers"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/dashboard\/providers"/);
    expect((html.match(/aria-current="page"/g) || []).length).toBe(1);
  });

  it("exposes all three direct destinations and an accessible drawer trigger", () => {
    const html = render("/dashboard/profile", true);
    expect(html).toContain('aria-label="Mobile quick navigation"');
    for (const route of ["endpoint", "providers", "usage"]) expect(html).toContain(`href="/dashboard/${route}"`);
    expect(html).toContain('aria-label="More navigation"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-controls="mobile-drawer"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('aria-current="page"');
  });

  it("does not report a closed drawer as expanded after returning to a direct route", () => {
    const html = render("/dashboard/usage");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/href="\/dashboard\/usage"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/dashboard\/usage"/);
  });
});


describe("router-owned pending feedback", () => {
  it("reserves a feedback slot on every route link and reflects pending without changing destinations", () => {
    const settled = render("/dashboard/providers");
    expect((settled.match(/data-navigation-pending="false"/g) || [])).toHaveLength(3);
    try {
      pending = true;
      const inFlight = render("/dashboard/providers");
      expect((inFlight.match(/data-navigation-pending="true"/g) || [])).toHaveLength(3);
      expect(inFlight.match(/href="[^"]+"/g)).toEqual(settled.match(/href="[^"]+"/g));
    } finally { pending = false; }
  });
});
