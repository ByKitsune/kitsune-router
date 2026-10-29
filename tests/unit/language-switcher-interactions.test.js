import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as localeHelpers from "../../src/shared/constants/locales.js";
import * as localeConfig from "../../src/i18n/config.js";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const filename = fileURLToPath(new URL("../../src/shared/components/LanguageSwitcher.js", import.meta.url));
const code = babel.transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}

// Real component callbacks/effects with native dialog and network seams. Fetch
// remains pending until each test supplies an HTTP outcome; no browser globals
// or production locale cookies are used.
function fixture({ cookie = "locale=en", initiallyOpen = true } = {}) {
  const state = [];
  const effects = [];
  const pendingRequests = [];
  let cursor = 0;
  let dirty = false;
  let tree;
  let props = { isOpen: initiallyOpen, onClose: vi.fn(), hideTrigger: true };
  let activeElement = null;
  const dialog = { open: false, showModal: vi.fn(() => { dialog.open = true; }), close: vi.fn(() => { dialog.open = false; }) };
  const search = { focus: vi.fn(() => { activeElement = "search"; }) };
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
      return [state[slot], (next) => {
        const value = typeof next === "function" ? next(state[slot]) : next;
        if (!Object.is(state[slot], value)) { state[slot] = value; dirty = true; }
      }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = { current: initial };
      return state[slot];
    },
    useId() { cursor++; return `language-${cursor}`; },
    useCallback: (callback) => callback,
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useEffect(effect, deps) {
      const slot = cursor++;
      if (!(slot in state) || deps.some((dep, index) => !Object.is(dep, state[slot][index]))) {
        state[slot] = deps;
        effects.push(effect);
      }
    },
  };
  const fetch = vi.fn((url, options) => new Promise((resolve, reject) => {
    pendingRequests.push({
      url, options,
      respond(status = 200) {
        if (status === 200) cookie = `locale=${JSON.parse(options.body).locale}`;
        resolve({ ok: status >= 200 && status < 300, status });
      },
      reject() { reject(new Error("Synthetic offline failure")); },
    });
  }));
  const reloadTranslations = vi.fn(async () => {});
  const jsx = (type, props) => ({ type, props: props || {} });
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports, fetch,
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "lucide-react") return Object.fromEntries(["Languages", "Search", "X", "Check", "ChevronRight", "LoaderCircle"].map((name) => [name, name]));
      if (id === "@/i18n/config") return localeConfig;
      if (id === "@/i18n/runtime") return { onLocaleChange: () => () => {}, reloadTranslations, translate: (value) => value };
      if (id === "@/shared/constants/locales") return { ...localeHelpers, readDisplayLocale: () => localeHelpers.readDisplayLocale(cookie) };
      if (id === "./LocaleBadge") return { __esModule: true, default: "LocaleBadge" };
      if (id.endsWith(".css")) return {};
      throw new Error(`Unexpected import: ${id}`);
    },
  }, { filename });
  function render() {
    cursor = 0;
    dirty = false;
    tree = fixtureModule.exports.default(props);
    for (const node of nodes(tree)) {
      if (node.type === "dialog") node.props.ref.current = dialog;
      if (node.type === "input") node.props.ref.current = search;
      if (node.type === "button" && typeof node.props.ref === "function") {
        node.props.ref({ focus() { activeElement = node.props["aria-label"]; } });
      }
    }
    effects.splice(0).forEach((effect) => effect());
    return tree;
  }
  async function flush() {
    for (let n = 0; n < 10; n++) {
      await new Promise(setImmediate);
      if (!dirty) return tree;
      render();
    }
    throw new Error("Language effects did not settle");
  }
  const find = (predicate) => nodes(tree).find(predicate);
  const option = (locale) => find((node) => node.type === "button" && node.props.lang === locale);
  render();
  return {
    dialog, search, fetch, reloadTranslations, pendingRequests, onClose: props.onClose,
    tree: () => tree,
    option,
    active: () => activeElement,
    async searchFor(value) { find((node) => node.type === "input").props.onChange({ target: { value } }); return flush(); },
    async choose(locale) { option(locale).props.onClick(); return flush(); },
    async respond(status) { pendingRequests.at(-1).respond(status); return flush(); },
    async reject() { pendingRequests.at(-1).reject(); return flush(); },
    searchKey(key) { const event = { key, preventDefault: vi.fn() }; find((node) => node.type === "input").props.onKeyDown(event); return event; },
    optionKey(locale, key) { const event = { key, preventDefault: vi.fn() }; option(locale).props.onKeyDown(event); return event; },
    escape() { const event = { preventDefault: vi.fn() }; find((node) => node.type === "dialog").props.onCancel(event); return event; },
    async setOpen(isOpen) { props = { ...props, isOpen }; render(); return flush(); },
  };
}

describe("language selection and discovery", () => {
  it("keeps every supported language discoverable by native name, English name, and locale code", () => {
    expect(localeHelpers.LANGUAGE_OPTIONS.map((option) => option.locale)).toEqual(localeConfig.LOCALES);
    expect(localeHelpers.searchLanguages("bahasa indonesia").map((option) => option.locale)).toEqual(["id"]);
    expect(localeHelpers.searchLanguages("tieng viet").map((option) => option.locale)).toEqual(["vi"]);
    expect(localeHelpers.searchLanguages("繁體").map((option) => option.locale)).toEqual(["zh-TW"]);
    expect(localeHelpers.searchLanguages("PT-BR").map((option) => option.locale)).toEqual(["pt-BR"]);
    expect(localeHelpers.searchLanguages("farsi").map((option) => option.locale)).toEqual(["fa"]);
  });

  it("reads encoded locale cookies and safely falls back for malformed or unsupported values", () => {
    expect(localeHelpers.readDisplayLocale("session=synthetic; locale=pt%2DBR")).toBe("pt-BR");
    expect(localeHelpers.readDisplayLocale("locale=%E0%A4%A")).toBe("en");
    expect(localeHelpers.readDisplayLocale("locale=unknown")).toBe("en");
  });

  it("opens a native modal, focuses search, and keeps Escape/controlled close available", async () => {
    const picker = fixture();
    expect(picker.dialog.showModal).toHaveBeenCalledOnce();
    expect(picker.active()).toBe("search");
    expect(picker.escape().preventDefault).toHaveBeenCalledOnce();
    expect(picker.onClose).toHaveBeenCalledWith("en");
    await picker.setOpen(false);
    expect(picker.dialog.close).toHaveBeenCalledOnce();
  });

  it("supports filtering, an honest no-match state, and arrow/Home/End keyboard navigation", async () => {
    const picker = fixture();
    await picker.searchFor("portuguese");
    picker.searchKey("ArrowDown");
    expect(picker.active()).toContain("Brasil");
    picker.optionKey("pt-BR", "End");
    expect(picker.active()).toContain("Portugal");
    picker.optionKey("pt-PT", "ArrowDown");
    expect(picker.active()).toContain("Brasil");
    picker.optionKey("pt-BR", "ArrowUp");
    expect(picker.active()).toContain("Portugal");
    picker.optionKey("pt-PT", "Home");
    expect(picker.active()).toContain("Brasil");
    await picker.searchFor("no-such-language");
    expect(text(picker.tree())).toContain("No matching languages");
  });

  it("applies a selection once, broadcasts translations after success, and closes with the new locale", async () => {
    const picker = fixture();
    await picker.choose("id");
    await picker.choose("fr");
    expect(picker.fetch).toHaveBeenCalledTimes(1);
    expect(picker.pendingRequests[0].url).toBe("/api/locale");
    expect(JSON.parse(picker.pendingRequests[0].options.body)).toEqual({ locale: "id" });
    expect(picker.option("id").props.disabled).toBe(true);
    await picker.respond(200);
    expect(picker.reloadTranslations).toHaveBeenCalledOnce();
    expect(picker.onClose).toHaveBeenCalledWith("id");
    expect(picker.option("id").props["aria-pressed"]).toBe(true);
  });

  it.each(["http", "network"])("keeps the dialog and current selection when a %s failure prevents an update", async (failure) => {
    const picker = fixture();
    await picker.choose("ja");
    if (failure === "http") await picker.respond(500);
    else await picker.reject();
    expect(picker.reloadTranslations).not.toHaveBeenCalled();
    expect(picker.onClose).not.toHaveBeenCalled();
    expect(text(picker.tree())).toContain("Could not change language");
    expect(picker.option("en").props["aria-pressed"]).toBe(true);
    expect(picker.option("ja").props.disabled).toBe(false);
    await picker.choose("ja");
    await picker.respond(200);
    expect(picker.onClose).toHaveBeenCalledWith("ja");
  });

  it("marks RTL labels explicitly and closes the current choice without issuing another request", async () => {
    const picker = fixture({ cookie: "locale=ar" });
    const arabicLabel = nodes(picker.option("ar")).find((node) => node.props.dir === "rtl");
    expect(text(arabicLabel)).toBe("العربية");
    await picker.choose("ar");
    expect(picker.fetch).not.toHaveBeenCalled();
    expect(picker.onClose).toHaveBeenCalledWith("ar");
  });
});
