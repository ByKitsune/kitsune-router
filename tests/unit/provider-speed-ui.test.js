import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as providers from "../../src/shared/constants/providers.js";
import * as providerIcon from "../../src/shared/utils/providerIcon.js";
import * as providerCustomModels from "../../src/shared/utils/providerCustomModels.js";
import * as thinkingLevels from "../../open-sse/providers/thinkingLevels.js";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const directory = "../../src/app/(dashboard)/dashboard/providers/[id]/";
const compiled = new Map();

function componentSource(name) {
  if (!compiled.has(name)) {
    const filename = fileURLToPath(new URL(`${directory}${name}.js`, import.meta.url));
    compiled.set(name, {
      filename,
      code: babel.transformSync(readFileSync(filename, "utf8"), {
        filename, babelrc: false, configFile: false,
        presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
        plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
      }).code,
    });
  }
  return compiled.get(name);
}

// This repo has no DOM test dependency. As in the existing component behavior
// tests, run the real page, ModelRow, effects, and event handlers with deterministic
// hook scheduling. Only network, unrelated widgets, and browser APIs are seams.
// This does not replace the isolated browser/keyboard check after the Next build.
function fixture({ provider = "openai", settings = {}, customModels = [], catalog = null, accounts = null, accountCatalogs = {} } = {}) {
  const slots = [];
  const effects = [];
  const requests = [];
  const copies = [];
  const gates = [];
  let cursor = 0;
  let dirty = false;
  let tree;
  let currentProvider = provider;
  let savedSettings = structuredClone(settings);
  let readFailure = false;
  let writeFailure = false;
  const models = [
    { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
    { id: "gpt-6-luna", name: "GPT-6 Luna" },
  ];
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (next) => {
        const value = typeof next === "function" ? next(slots[slot]) : next;
        if (!Object.is(value, slots[slot])) { slots[slot] = value; dirty = true; }
      }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useCallback(callback, deps) {
      const slot = cursor++;
      if (!slots[slot] || deps.some((dep, index) => !Object.is(dep, slots[slot].deps[index]))) {
        slots[slot] = { callback, deps };
      }
      return slots[slot].callback;
    },
    useMemo(factory, deps) {
      const slot = cursor++;
      if (!slots[slot] || deps.some((dep, index) => !Object.is(dep, slots[slot].deps[index]))) {
        slots[slot] = { value: factory(), deps };
      }
      return slots[slot].value;
    },
    useEffect(effect, deps) {
      const slot = cursor++;
      if (!slots[slot] || deps.some((dep, index) => !Object.is(dep, slots[slot].deps[index]))) {
        slots[slot]?.cleanup?.();
        slots[slot] = { deps };
        effects.push(() => { slots[slot].cleanup = effect(); });
      }
    },
  };
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
  const dispatch = async (url, options = {}) => {
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ url, method, body });
    if (url === "/api/settings") {
      if (method === "GET" && readFailure === "network") throw new Error("Offline");
      if (method === "GET") return response(savedSettings, readFailure ? 503 : 200);
      if (writeFailure === "network") throw new Error("Offline");
      if (writeFailure) return response({ error: "Settings are read-only" }, 403);
      savedSettings = { ...savedSettings, ...body };
      return response(savedSettings);
    }
    if (url === "/api/providers") return response({ connections: accounts || [{ id: "fixture-account", provider: currentProvider, name: "Fixture account", isActive: true }] });
    if (url === "/api/provider-nodes") return response({ nodes: [] });
    if (url === "/api/proxy-pools?isActive=true") return response({ proxyPools: [] });
    if (url === "/api/models/alias") return response({ aliases: {} });
    if (url === "/api/models/custom") return response({ models: customModels });
    if (url.startsWith("/api/models/disabled?")) return response({ ids: [] });
    if (url === "/api/providers/fixture-account/models") return response({ models: catalog || models });
    if (url.startsWith("/api/providers/") && method === "PUT") return response({});
    if (url.startsWith("/api/providers/") && url.endsWith("/models")) return response({ models: await accountCatalogs[url.split("/")[3]] });
    if (url === "/api/models/test") return response({ ok: true });
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  const fetch = async (url, options = {}) => {
    // Capture response data when the request begins, not when the gate opens.
    // A delayed pre-save GET must keep its old snapshot even after a PATCH.
    const pending = dispatch(url, options).then((value) => ({ value }), (error) => ({ error }));
    const gate = gates.find((entry) => !entry.used && entry.method === (options.method || "GET") && entry.url === url);
    if (gate) {
      gate.used = true;
      await gate.wait;
      if (gate.error) throw gate.error;
      if (gate.response) return gate.response;
    }
    const result = await pending;
    if (result.error) throw result.error;
    return result.value;
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const ui = Object.fromEntries([
    "Card", "Button", "Badge", "Input", "Modal", "CardSkeleton", "OAuthModal", "KiroOAuthWrapper", "CursorAuthModal", "ZedAuthModal", "IFlowCookieModal", "GitLabAuthModal", "Toggle", "Select", "EditConnectionModal", "NoAuthProxyCard", "ConfirmModal", "CapacityBadges",
  ].map((name) => [name, name]));
  const loaded = new Map();
  const load = (name) => {
    if (loaded.has(name)) return loaded.get(name);
    const { filename, code } = componentSource(name);
    const target = { exports: {} };
    vm.runInNewContext(code, {
      module: target, exports: target.exports, fetch, console: { ...console, log() {} }, setTimeout, clearTimeout, URLSearchParams,
      require(id) {
        if (id === "react") return hooks;
        if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
        if (id === "next/navigation") return { useParams: () => ({ id: currentProvider }), useRouter: () => ({ push() {} }) };
        if (id === "next/link") return { __esModule: true, default: "a" };
        if (id === "next/image") return { __esModule: true, default: "img" };
        if (id === "@/shared/components") return ui;
        if (id === "@/shared/hooks/useCopyToClipboard") return { useCopyToClipboard: () => ({ copied: null, copy: (value) => copies.push(value) }) };
        if (id === "@/shared/hooks/useModelCaps") return { useModelCaps: () => ({ getCaps: () => null }) };
        if (id === "@/shared/constants/models") return { getModelsByProviderId: () => models, getModelKind: () => "llm" };
        if (id === "@/shared/constants/providers") return providers;
        if (id === "@/shared/utils/providerIcon") return providerIcon;
        if (id === "@/shared/utils/providerCustomModels") return providerCustomModels;
        if (id === "@/shared/utils/providerModelsFetcher") return { fetchSuggestedModels: async () => [] };
        if (id === "@/i18n/runtime") return { translate: (value) => value };
        if (id === "open-sse/providers/thinkingLevels.js") return thinkingLevels;
        if (id.startsWith("@/")) return require(`../../src/${id.slice(2)}`);
        if (id.startsWith("open-sse/")) return require(`../../${id}`);
        if (id === "./ModelRow") return load("ModelRow");
        if (id.startsWith("./")) return { __esModule: true, default: id.slice(2) };
        return require(id);
      },
    }, { filename });
    loaded.set(name, target.exports);
    return target.exports;
  };
  const Page = load("page").default;
  const render = () => {
    dirty = false;
    cursor = 0;
    tree = Page();
    effects.splice(0).forEach((effect) => effect());
    return tree;
  };
  const flush = async () => {
    for (let count = 0; count < 20; count += 1) {
      await new Promise(setImmediate);
      if (!dirty) return tree;
      render();
    }
    throw new Error("Page effects did not settle");
  };
  return {
    requests, copies,
    async mount() { render(); return flush(); },
    render, flush,
    async change(node, value) { await node.props.onChange({ target: { value } }); return flush(); },
    async navigate(providerId) { currentProvider = providerId; render(); return flush(); },
    failRead(value = true) { readFailure = value; },
    failWrite(value = true) { writeFailure = value; },
    settings() { return structuredClone(savedSettings); },
    replaceSettings(value) { savedSettings = structuredClone(value); },
    refresh() { nodes(tree).find((node) => node.type === "OAuthModal").props.onSuccess(); },
    hold(method, url) {
      const gate = { method, url, used: false };
      gate.wait = new Promise((resolve) => { gate.release = resolve; });
      gates.push(gate);
      return {
        get used() { return gate.used; },
        release() { gate.release(); },
        respond(data, status = 200) { gate.response = response(data, status); gate.release(); },
        reject() { gate.error = new Error("Delayed network error"); gate.release(); },
      };
    },
  };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  const rendered = typeof tree.type === "function" ? tree.type(tree.props) : tree.props?.children;
  return [tree, ...nodes(rendered)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return text(typeof tree.type === "function" ? tree.type(tree.props) : tree.props?.children);
}
const speedSelect = (tree) => nodes(tree).find((node) => node.type === "select" && node.props["aria-label"] === "Processing speed");
const thinkingSelect = (tree) => nodes(tree).find((node) => node.type === "select" && text(node).includes("Thinking:"));
const row = (tree, id = "gpt-6.1-sol") => nodes(tree).find((node) => node.type?.name === "ModelRow" && node.props.model.id === id);
const testButton = (tree, id) => {
  const model = row(tree, id);
  return nodes(model).find((node) => node.type === "button" && node.props.onClick === model.props.onTest);
};
const patches = (page) => page.requests.filter((request) => request.url === "/api/settings" && request.method === "PATCH");
const tests = (page) => page.requests.filter((request) => request.url === "/api/models/test");

describe("Provider processing speed UI", () => {
  it.each(["openai", "codex"])("loads %s speed separately from thinking and labels its limits", async (provider) => {
    const page = fixture({ provider, settings: {
      providerThinking: { [provider]: { mode: "high" } },
      providerServiceTier: { [provider]: { mode: "ultrafast" } },
    } });
    const tree = await page.mount();
    expect(speedSelect(tree)).toBeDefined();
    expect(speedSelect(tree).props.value).toBe("ultrafast");
    expect(thinkingSelect(tree).props.value).toBe("high");
    expect(nodes(speedSelect(tree)).filter((node) => node.type === "option").map((node) => node.props.value)).toEqual(["auto", "default", "fast", "ultrafast"]);
    expect(text(tree)).toMatch(/Auto.*inherit/i);
    expect(text(tree)).toMatch(/Standard/);
    expect(text(tree)).toMatch(/cost|quota/i);
    expect(text(tree)).toMatch(/model.*permission|permission.*model/i);
    if (provider === "codex") expect(text(tree)).toMatch(/entitlement.*unverified|unverified.*entitlement/i);
  });

  it("stores canonical tiers, preserves other providers, and removes only its Auto override", async () => {
    const page = fixture({ settings: {
      providerThinking: { openai: { mode: "high" } },
      providerServiceTier: { codex: { mode: "ultrafast" } },
    } });
    let tree = await page.mount();
    expect(speedSelect(tree)).toBeDefined();
    for (const mode of ["fast", "ultrafast", "default", "auto"]) {
      tree = await page.change(speedSelect(tree), mode);
      expect(patches(page).at(-1).body).toEqual({ providerServiceTier: {
        codex: { mode: "ultrafast" },
        ...(mode === "auto" ? {} : { openai: { mode } }),
      } });
      expect(speedSelect(tree).props.value).toBe(mode);
      expect(thinkingSelect(tree).props.value).toBe("high");
    }
  });

  it.each([true, "network"])("keeps the previous speed and shows failed save (%s)", async (failure) => {
    const page = fixture({ settings: { providerServiceTier: { openai: { mode: "default" } } } });
    let tree = await page.mount();
    expect(speedSelect(tree)).toBeDefined();
    page.failWrite(failure);
    tree = await page.change(speedSelect(tree), "fast");
    expect(speedSelect(tree).props.value).toBe("default");
    expect(nodes(tree).some((node) => node.props.role === "alert" && /not saved|could not save|failed to save/i.test(text(node)))).toBe(true);
  });

  it("does not overwrite another provider when the settings pre-read fails", async () => {
    const page = fixture();
    let tree = await page.mount();
    expect(speedSelect(tree)).toBeDefined();
    page.failRead();
    tree = await page.change(speedSelect(tree), "fast");
    expect(patches(page)).toEqual([]);
    expect(speedSelect(tree).props.value).toBe("auto");
    expect(nodes(tree).some((node) => node.props.role === "alert")).toBe(true);
  });

  it.each(["auto", "default", "fast", "ultrafast"])("tests the selected thinking and native %s tier without changing copied model IDs", async (mode) => {
    const page = fixture({ settings: {
      providerThinking: { openai: { mode: "high" } },
      providerServiceTier: { openai: { mode } },
    } });
    const tree = await page.mount();
    await testButton(tree).props.onClick();
    expect(tests(page).at(-1).body).toEqual({ model: "openai/gpt-6.1-sol(high)", kind: "llm", service_tier: mode });
    const copyButton = nodes(row(tree)).find((node) => node.type === "button" && text(node).includes("content_copy"));
    copyButton.props.onClick();
    expect(page.copies).toEqual(["openai/gpt-6.1-sol(high)"]);
  });

  it("uses the same test payload for a custom model", async () => {
    const page = fixture({ customModels: [{ providerAlias: "openai", id: "gpt-6-astra", type: "llm" }], settings: {
      providerThinking: { openai: { mode: "high" } },
      providerServiceTier: { openai: { mode: "ultrafast" } },
    } });
    const tree = await page.mount();
    await testButton(tree, "gpt-6-astra").props.onClick();
    expect(tests(page).at(-1).body).toEqual({ model: "openai/gpt-6-astra(high)", kind: "llm", service_tier: "ultrafast" });
  });

  it("marks an incompatible model unsupported without downgrading the chosen tier", async () => {
    const page = fixture({ settings: { providerServiceTier: { openai: { mode: "ultrafast" } } } });
    const tree = await page.mount();
    expect(testButton(tree, "gpt-6-luna").props.disabled).toBe(true);
    expect(text(row(tree, "gpt-6-luna"))).toMatch(/Ultrafast.*not supported/i);
    expect(speedSelect(tree).props.value).toBe("ultrafast");
    expect(testButton(tree).props.disabled).toBe(false);
  });

  it("respects a Codex live catalog that does not advertise the requested tier", async () => {
    const page = fixture({ provider: "codex", settings: { providerServiceTier: { codex: { mode: "ultrafast" } } }, catalog: [
      { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", service_tiers: [{ id: "priority", name: "Fast" }] },
    ] });
    const tree = await page.mount();
    expect(testButton(tree).props.disabled).toBe(true);
    expect(text(row(tree))).toMatch(/Ultrafast.*not supported/i);
    expect(speedSelect(tree).props.value).toBe("ultrafast");
  });

  it("does not treat the first of multiple active accounts as global entitlement proof", async () => {
    const page = fixture({ provider: "codex", settings: { providerServiceTier: { codex: { mode: "ultrafast" } } },
      accounts: [
        { id: "fixture-account", provider: "codex", name: "First", isActive: true },
        { id: "next-account", provider: "codex", name: "Next", isActive: true },
      ],
      catalog: [{ id: "gpt-6.1-sol", service_tiers: [] }],
      accountCatalogs: { "next-account": [{ id: "gpt-6.1-sol", service_tiers: [{ id: "ultrafast" }] }] },
    });
    const tree = await page.mount();
    expect(testButton(tree).props.disabled).toBe(false);
    expect(text(row(tree))).not.toMatch(/not supported/i);
    expect(text(tree)).toMatch(/entitlement.*unverified/i);
    expect(testButton(tree, "gpt-6-luna").props.disabled).toBe(true);
    expect(page.requests.filter((request) => request.url.endsWith("/models")).map((request) => request.url)).toEqual(["/api/providers/fixture-account/models"]);
    await testButton(tree).props.onClick();
    expect(tests(page).at(-1).body.service_tier).toBe("ultrafast");
  });

  it("does not reuse the previous account's speed catalog while the next account is loading", async () => {
    let resolveCatalog;
    const nextCatalog = new Promise((resolve) => { resolveCatalog = resolve; });
    const page = fixture({ provider: "codex", settings: { providerServiceTier: { codex: { mode: "ultrafast" } } },
      accounts: [
        { id: "fixture-account", provider: "codex", name: "First", isActive: true },
        { id: "next-account", provider: "codex", name: "Next", isActive: false },
      ],
      catalog: [{ id: "gpt-6.1-sol", service_tiers: [] }],
      accountCatalogs: { "next-account": nextCatalog },
    });
    let tree = await page.mount();
    expect(text(row(tree))).toMatch(/not supported/i);
    const nextAccount = nodes(tree).find((node) => node.type === "ConnectionRow" && node.props.connection.id === "next-account");
    await nextAccount.props.onToggleActive(true);
    tree = await page.flush();
    const firstAccount = nodes(tree).find((node) => node.type === "ConnectionRow" && node.props.connection.id === "fixture-account");
    await firstAccount.props.onToggleActive(false);
    tree = await page.flush();
    expect(text(row(tree))).not.toMatch(/not supported/i);
    expect(text(tree)).toMatch(/entitlement.*unverified/i);
    resolveCatalog([{ id: "gpt-6.1-sol", service_tiers: [{ id: "ultrafast" }] }]);
    tree = await page.flush();
    expect(testButton(tree).props.disabled).toBe(false);
  });

  it.each([true, "network"])("shows an initial settings read failure instead of presenting Auto as loaded (%s)", async (failure) => {
    const page = fixture();
    page.failRead(failure);
    const tree = await page.mount();
    expect(speedSelect(tree).props.disabled).toBe(true);
    expect(nodes(tree).some((node) => node.props.role === "alert" && /load.*settings/i.test(text(node)))).toBe(true);
    // A network failure also prevents the account list from loading, so Test
    // can be absent entirely; it must never remain actionable.
    expect(testButton(tree)?.props.disabled).not.toBe(false);
  });

  it("omits speed controls and the native tier for unrelated providers", async () => {
    const page = fixture({ provider: "anthropic" });
    const tree = await page.mount();
    expect(speedSelect(tree)).toBeUndefined();
    await testButton(tree).props.onClick();
    expect(tests(page).at(-1).body).not.toHaveProperty("service_tier");
  });

  it("reloads the next provider's selection without carrying the prior speed", async () => {
    const page = fixture({ settings: { providerServiceTier: { openai: { mode: "ultrafast" }, codex: { mode: "default" } } } });
    let tree = await page.mount();
    expect(speedSelect(tree)).toBeDefined();
    tree = await page.navigate("codex");
    expect(speedSelect(tree).props.value).toBe("default");
    await testButton(tree).props.onClick();
    expect(tests(page).at(-1).body).toEqual({ model: "cx/gpt-6.1-sol", kind: "llm", service_tier: "default" });
  });

  it.each(["success", "http-error", "network-error"])("ignores a pre-save refresh's delayed %s after speed was saved", async (result) => {
    const page = fixture({ settings: { providerServiceTier: { openai: { mode: "default" } } } });
    let tree = await page.mount();
    const refresh = page.hold("GET", "/api/settings");
    page.refresh();
    expect(refresh.used).toBe(true);
    tree = await page.change(speedSelect(tree), "fast");
    expect(page.settings().providerServiceTier.openai.mode).toBe("fast");
    if (result === "http-error") refresh.respond({ error: "Old refresh failed" }, 503);
    else if (result === "network-error") refresh.reject();
    else refresh.release();
    tree = await page.flush();
    expect(speedSelect(tree).props.value).toBe("fast");
    expect(speedSelect(tree).props.disabled).toBe(false);
    expect(nodes(tree).some((node) => node.props.role === "alert")).toBe(false);
    await testButton(tree).props.onClick();
    expect(tests(page).at(-1).body.service_tier).toBe("fast");
  });

  it("ignores a refresh begun during a speed save even when its response arrives afterward", async () => {
    const page = fixture({ settings: { providerServiceTier: { openai: { mode: "default" } } } });
    let tree = await page.mount();
    const save = page.hold("PATCH", "/api/settings");
    const saving = speedSelect(tree).props.onChange({ target: { value: "ultrafast" } });
    await page.flush();
    expect(save.used).toBe(true);
    const refresh = page.hold("GET", "/api/settings");
    page.refresh();
    expect(refresh.used).toBe(true);
    save.release();
    await saving;
    tree = await page.flush();
    expect(speedSelect(tree).props.value).toBe("ultrafast");
    refresh.respond({ providerServiceTier: { openai: { mode: "default" } } });
    tree = await page.flush();
    expect(speedSelect(tree).props.value).toBe("ultrafast");
    expect(speedSelect(tree).props.disabled).toBe(false);
  });

  it("does not apply an older settings refresh after a newer refresh", async () => {
    const page = fixture({ settings: { providerServiceTier: { openai: { mode: "default" } } } });
    await page.mount();
    const older = page.hold("GET", "/api/settings");
    page.refresh();
    expect(older.used).toBe(true);
    page.replaceSettings({ providerServiceTier: { openai: { mode: "fast" } } });
    page.refresh();
    let tree = await page.flush();
    expect(speedSelect(tree).props.value).toBe("fast");
    older.release();
    tree = await page.flush();
    expect(speedSelect(tree).props.value).toBe("fast");
  });

  it("does not hydrate a departed provider when its delayed refresh returns", async () => {
    const page = fixture({ settings: { providerServiceTier: { openai: { mode: "default" }, codex: { mode: "ultrafast" } } } });
    await page.mount();
    const oldProvider = page.hold("GET", "/api/settings");
    page.refresh();
    expect(oldProvider.used).toBe(true);
    let tree = await page.navigate("codex");
    expect(speedSelect(tree).props.value).toBe("ultrafast");
    oldProvider.release();
    tree = await page.flush();
    expect(speedSelect(tree).props.value).toBe("ultrafast");
    expect(speedSelect(tree).props.disabled).toBe(false);
    await testButton(tree).props.onClick();
    expect(tests(page).at(-1).body).toEqual({ model: "cx/gpt-6.1-sol", kind: "llm", service_tier: "ultrafast" });
  });

  it.each(["success", "http-error", "network-error"])("discards a prior tier's delayed test %s", async (result) => {
    const page = fixture({ settings: { providerServiceTier: { openai: { mode: "default" } } } });
    let tree = await page.mount();
    const response = page.hold("POST", "/api/models/test");
    const testing = testButton(tree).props.onClick();
    expect(response.used).toBe(true);
    tree = await page.change(speedSelect(tree), "ultrafast");
    if (result === "http-error") response.respond({ ok: false, error: "Old model test failed" }, 400);
    else if (result === "network-error") response.reject();
    else response.release();
    await testing;
    tree = await page.flush();
    expect(row(tree).props.testStatus).toBeUndefined();
    expect(row(tree).props.isTesting).toBe(false);
    expect(nodes(tree).some((node) => node.props.role === "alert")).toBe(false);
  });

  it("invalidates a model test when speed selection starts, before the save finishes", async () => {
    const page = fixture();
    let tree = await page.mount();
    const response = page.hold("POST", "/api/models/test");
    const testing = testButton(tree).props.onClick();
    const save = page.hold("PATCH", "/api/settings");
    const saving = speedSelect(tree).props.onChange({ target: { value: "ultrafast" } });
    await page.flush();
    expect(save.used).toBe(true);
    response.release();
    await testing;
    tree = await page.flush();
    expect(row(tree).props.testStatus).toBeUndefined();
    expect(row(tree).props.isTesting).toBe(false);
    save.release();
    await saving;
  });

  it("does not let old test cleanup clear a newer request's loading state", async () => {
    const page = fixture();
    let tree = await page.mount();
    const oldResponse = page.hold("POST", "/api/models/test");
    const oldTest = testButton(tree).props.onClick();
    tree = await page.change(speedSelect(tree), "ultrafast");
    const newResponse = page.hold("POST", "/api/models/test");
    const newTest = testButton(tree).props.onClick();
    expect(newResponse.used).toBe(true);
    oldResponse.respond({ ok: false, error: "Old failure" }, 400);
    await oldTest;
    tree = await page.flush();
    expect(row(tree).props.isTesting).toBe(true);
    expect(row(tree).props.testStatus).toBeUndefined();
    expect(nodes(tree).some((node) => node.props.role === "alert")).toBe(false);
    newResponse.release();
    await newTest;
    tree = await page.flush();
    expect(row(tree).props.isTesting).toBe(false);
    expect(row(tree).props.testStatus).toBe("ok");
  });

  it("does not dispatch a retained Test callback for an outdated selection", async () => {
    const page = fixture();
    let tree = await page.mount();
    const oldTest = testButton(tree).props.onClick;
    tree = await page.change(speedSelect(tree), "ultrafast");
    await oldTest();
    expect(tests(page)).toHaveLength(0);
    await testButton(tree).props.onClick();
    expect(tests(page).at(-1).body.service_tier).toBe("ultrafast");
  });

  it("discards pending results when the selected thinking changes", async () => {
    const page = fixture();
    let tree = await page.mount();
    const response = page.hold("POST", "/api/models/test");
    const testing = testButton(tree).props.onClick();
    tree = await page.change(thinkingSelect(tree), "high");
    response.release();
    await testing;
    tree = await page.flush();
    expect(row(tree).props.testStatus).toBeUndefined();
    expect(row(tree).props.isTesting).toBe(false);
  });

  it.each(["speed", "thinking"])("invalidates pending tests when persisted %s defaults change on refresh", async (setting) => {
    const page = fixture();
    let tree = await page.mount();
    const response = page.hold("POST", "/api/models/test");
    const testing = testButton(tree).props.onClick();
    page.replaceSettings(setting === "speed"
      ? { providerServiceTier: { openai: { mode: "ultrafast" } } }
      : { providerThinking: { openai: { mode: "high" } } });
    page.refresh();
    tree = await page.flush();
    expect(setting === "speed" ? speedSelect(tree).props.value : thinkingSelect(tree).props.value).toBe(setting === "speed" ? "ultrafast" : "high");
    response.respond({ ok: false, error: "Old test result" }, 400);
    await testing;
    tree = await page.flush();
    expect(row(tree).props.testStatus).toBeUndefined();
    expect(row(tree).props.isTesting).toBe(false);
    expect(nodes(tree).some((node) => node.props.role === "alert")).toBe(false);
  });

  it("isolates test results and cleanup across provider navigation", async () => {
    const page = fixture();
    const tree = await page.mount();
    const oldResponse = page.hold("POST", "/api/models/test");
    const oldTest = testButton(tree).props.onClick();
    let nextTree = await page.navigate("codex");
    const newResponse = page.hold("POST", "/api/models/test");
    const newTest = testButton(nextTree).props.onClick();
    expect(newResponse.used).toBe(true);
    oldResponse.respond({ ok: false, error: "Old provider failed" }, 400);
    await oldTest;
    nextTree = await page.flush();
    expect(row(nextTree).props.isTesting).toBe(true);
    expect(row(nextTree).props.testStatus).toBeUndefined();
    expect(nodes(nextTree).some((node) => node.props.role === "alert")).toBe(false);
    newResponse.release();
    await newTest;
    nextTree = await page.flush();
    expect(row(nextTree).props.testStatus).toBe("ok");
  });
});
