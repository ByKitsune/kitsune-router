import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "vite";
import { createRequire } from "node:module";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
const babel = require("next/dist/compiled/babel/core");
const React = require("react");
const { renderToString } = require("react-dom/server");
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright"); }
catch { /* Optional in lightweight installations. */ }
if (process.env.KITSUNE_REQUIRE_BROWSER_TESTS === "1" && !playwright) {
  throw new Error("The required hydration browser tests need Playwright");
}
const browserDescribe = playwright ? describe : describe.skip;

// Compile the actual client boundaries for genuine React server output. Effects
// do not run during renderToString; no browser runtime is installed on the server.
function serverComponent(name) {
  const path = join(root, "src/i18n", name + ".js");
  const code = babel.transformSync(readFileSync(path, "utf8"), {
    filename: path, babelrc: false, configFile: false,
    presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
    plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
  }).code;
  const componentModule = { exports: {} };
  vm.runInNewContext(code, {
    module: componentModule, exports: componentModule.exports,
    require(id) {
      if (id === "./runtime") return {};
      if (id === "./RuntimeI18nBoundary") return serverComponent("RuntimeI18nBoundary");
      if (id === "next/navigation") return { usePathname: () => "/dashboard/providers" };
      return require(id);
    },
  }, { filename: path });
  return componentModule.exports;
}
const ServerBoundary = serverComponent("RuntimeI18nBoundary").default;
const ServerProvider = serverComponent("RuntimeI18nProvider").RuntimeI18nProvider;
const h = React.createElement;
const panel = id => h("section", { id: "panel-" + id },
  h("h2", null, "Providers"), h("p", { id: "count-" + id }, "2 requests"),
  h("button", { id: "increment-" + id }, "Increment"), h("code", null, "Providers"));
const markup = renderToString(h(ServerProvider, null, h("main", null,
  h(ServerBoundary, null, h("header", null, "Workspace")),
  ...["a", "b"].map(id => h(React.Suspense, { key: id, fallback: h("p", null, "Loading") }, h(ServerBoundary, null, panel(id)))))));

const entry = `import React,{Suspense,useState,useSyncExternalStore} from "react";
  import {hydrateRoot} from "react-dom/client";
  import {RuntimeI18nProvider} from "${root}/src/i18n/RuntimeI18nProvider.js";
  import RuntimeI18nBoundary from "${root}/src/i18n/RuntimeI18nBoundary.js";
  import {translate,reloadTranslations,onLocaleChange,getCurrentLocale} from "${root}/src/i18n/runtime.js";
  const helper=new URLSearchParams(location.search).has("helper");
  window.recoverable=[];window.localeLoads=0;window.ready={};window.release={};
  window.originalPanels=["a","b"].map(id=>document.getElementById("panel-"+id));
  onLocaleChange(()=>window.localeLoads++);
  window.effectiveLocale=getCurrentLocale;
  window.changeLocale=async locale=>{document.cookie="locale="+locale+"; path=/";await reloadTranslations();};
  const gates=Object.fromEntries(["a","b"].map(id=>[id,new Promise(resolve=>window.release[id]=()=>{window.ready[id]=true;resolve();})]));
  function DelayedPanel({id}) {
    if(!window.ready[id])throw gates[id];
    useSyncExternalStore(onLocaleChange,getCurrentLocale,()=>"en");
    const[count,setCount]=useState(2);
    return React.createElement("section",{id:"panel-"+id},
      React.createElement("h2",null,helper?translate("Providers"):"Providers"),
      React.createElement("p",{id:"count-"+id},helper?translate("{count} requests",{count}):count+" requests"),
      React.createElement("button",{id:"increment-"+id,onClick:()=>setCount(value=>value+1)},"Increment"),
      React.createElement("code",null,"Providers"));
  }
  function Header(){return React.createElement("header",null,helper?translate("Workspace"):"Workspace");}
  hydrateRoot(document.getElementById("root"),React.createElement(RuntimeI18nProvider,null,
    React.createElement("main",null,
      React.createElement(RuntimeI18nBoundary,null,React.createElement(Header)),
      ...["a","b"].map(id=>React.createElement(Suspense,{key:id,fallback:React.createElement("p",null,"Loading")},
        React.createElement(RuntimeI18nBoundary,null,React.createElement(DelayedPanel,{id})))))),
    {onRecoverableError:(error,info)=>window.recoverable.push({message:error.message,componentStack:info.componentStack})});`;

browserDescribe("runtime localization with independently hydrated server regions", () => {
  let directory;
  let server;
  let browser;

  beforeAll(async () => {
    directory = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), "i18n-hydration-browser-"));
    await symlink(realpathSync(join(root, "node_modules")), join(directory, "node_modules"), "dir");
    const virtual = "\0i18n-hydration-test:";
    server = await createServer({
      root: directory, configFile: false, cacheDir: join(directory, "vite-cache"), logLevel: "error",
      resolve: { dedupe: ["react", "react-dom"] },
      server: { host: "127.0.0.1", port: 0, fs: { allow: [root, directory, realpathSync(join(root, "node_modules"))] } },
      optimizeDeps: { noDiscovery: true, include: ["react", "react/jsx-runtime", "react-dom/client"] },
      plugins: [{
        name: "i18n-hydration-browser-fixture", enforce: "pre",
        resolveId(id) {
          if (id === "/entry.js") return virtual + "entry";
          if (id === "next/navigation") return virtual + "navigation";
        },
        load(id) {
          if (id === virtual + "entry") return entry;
          if (id === virtual + "navigation") return 'export const usePathname=()=>"/dashboard/providers";';
        },
        transform(code, id) {
          if (!id.startsWith(join(root, "src") + "/") || !id.endsWith(".js")) return;
          return babel.transformSync(code, {
            filename: id, babelrc: false, configFile: false,
            presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
          }).code;
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            const url = new URL(request.url, "http://127.0.0.1");
            if (url.pathname === "/") {
              response.setHeader("Content-Type", "text/html");
              response.end('<!doctype html><html lang="en"><body><div id="root">' + markup + '</div><script type="module" src="/entry.js"></script></body></html>');
              return;
            }
            if (/^\/i18n\/literals\/(id|ja)\.json$/.test(url.pathname)) {
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify(url.pathname.includes("/id.")
                ? { Providers: "Penyedia", Workspace: "Ruang kerja", "{count} requests": "{count} permintaan" }
                : { Providers: "プロバイダー", Workspace: "ワークスペース", "{count} requests": "{count} リクエスト" }));
              return;
            }
            next();
          });
        },
      }],
    });
    await server.listen();
    browser = await playwright.chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      headless: true, args: ["--no-sandbox"],
    });
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (directory && existsSync(directory)) await rm(directory, { recursive: true, force: true });
  });

  it.each([false, true])("preserves delayed server nodes, locale changes and live values (render helper: %s)", async helper => {
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const context = await browser.newContext();
    await context.addCookies([{ name: "locale", value: "id", url: origin }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(origin + (helper ? "/?helper" : "/"));
      await page.waitForFunction(() => window.localeLoads > 0);
      expect(await page.evaluate(() => window.effectiveLocale())).toBe("en");
      await expect.poll(() => page.locator("#panel-a h2").innerText(), { timeout: 5000 }).toBe("Providers");
      await page.evaluate(() => window.changeLocale("en"));
      await page.evaluate(() => window.changeLocale("ja"));
      await page.evaluate(() => window.release.a());
      await page.waitForFunction(() => !document.getElementById("panel-a").parentElement.hasAttribute("data-i18n-hydration-pending"));
      expect(await page.locator("#panel-a h2").innerText()).toBe("Providers");
      await page.evaluate(() => window.release.b());
      await expect.poll(() => page.locator("#panel-a h2").innerText(), { timeout: 5000 }).toBe("プロバイダー");
      expect(await page.locator("#panel-b h2").innerText()).toBe("プロバイダー");
      expect(await page.locator("#panel-a code").innerText()).toBe("Providers");
      await page.locator("#increment-a").click();
      await expect.poll(() => page.locator("#count-a").innerText(), { timeout: 5000 }).toBe("3 リクエスト");
      await page.evaluate(() => window.changeLocale("id"));
      await expect.poll(() => page.locator("#count-a").innerText(), { timeout: 5000 }).toBe("3 permintaan");
      await page.evaluate(() => window.changeLocale("en"));
      await expect.poll(() => page.locator("#count-a").innerText(), { timeout: 5000 }).toBe("3 requests");
      expect(await page.evaluate(() => window.originalPanels.every((element, index) => element === document.getElementById("panel-" + ["a", "b"][index])))).toBe(true);
      expect(await page.evaluate(() => window.recoverable)).toEqual([]);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, 20000);
});
