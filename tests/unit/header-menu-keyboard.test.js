import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const filename = new URL("../../src/shared/components/HeaderMenu.js", import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const code = babel.transformSync(readFileSync(filename, "utf8"), {
  filename: filename.pathname, babelrc: false, configFile: false,
  presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;

// Exercise actual menu event handlers and effects, with only React scheduling,
// DOM focus and the theme store supplied by this deterministic fixture.
function fixture() {
  const slots = [];
  const pendingEffects = [];
  const cleanups = new Map();
  const listeners = new Map();
  let cursor;
  let tree;
  const document = { activeElement: null, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  const trigger = { focus: vi.fn(() => { document.activeElement = trigger; }) };
  const items = Array.from({ length: 3 }, () => ({ focus() { document.activeElement = this; } }));
  const hooks = {
    useState(initial) { const key = cursor++; if (!(key in slots)) slots[key] = initial; return [slots[key], value => { slots[key] = typeof value === "function" ? value(slots[key]) : value; }]; },
    useRef(initial) { const key = cursor++; return slots[key] ??= { current: initial }; },
    useId() { cursor++; return "menu-fixture"; },
    useEffect(effect, deps) {
      const key = cursor++;
      if (!slots[key] || deps.some((dep, index) => !Object.is(dep, slots[key][index]))) {
        slots[key] = deps;
        pendingEffects.push(() => { cleanups.get(key)?.(); cleanups.set(key, effect()); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports, document,
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "motion/react") return { motion: { div: "motion.div" }, AnimatePresence: "AnimatePresence", useReducedMotion: () => true };
      if (id === "@/shared/hooks/useTheme") return { useTheme: () => ({ isDark: false, toggleTheme: vi.fn() }) };
      if (id === "./Modal") return { ConfirmModal: "ConfirmModal" };
      return require(id);
    },
  });
  function find(predicate, node) {
    if (arguments.length === 1) node = tree;
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const match = find(predicate, child); if (match) return match; }
    return null;
  }
  function render() {
    cursor = 0;
    tree = fixtureModule.exports.default({ onLogout: vi.fn() });
    const wrapper = find(node => node.props?.className === "relative");
    wrapper.props.ref.current = { contains: target => target === trigger || items.includes(target) };
    find(node => node.props?.["aria-label"] === "Account and application menu").props.ref.current = trigger;
    const panel = find(node => node.props?.role === "menu");
    if (panel) panel.props.ref.current = { querySelectorAll: () => items };
    pendingEffects.splice(0).forEach(effect => effect());
  }
  render();
  return {
    trigger, items, document, listeners, render,
    open(key = "ArrowDown") { find(node => node.props?.["aria-label"] === "Account and application menu").props.onKeyDown({ key, preventDefault: vi.fn() }); render(); },
    key(key) { find(node => node.props?.role === "menu").props.onKeyDown({ key, preventDefault: vi.fn() }); },
    isOpen() { return !!find(node => node.props?.role === "menu"); },
  };
}

describe("account menu keyboard focus", () => {
  it("opens at either edge and wraps Arrow keys between actions", () => {
    const f = fixture();
    f.open("ArrowDown");
    expect(f.document.activeElement).toBe(f.items[0]);
    f.key("ArrowUp"); expect(f.document.activeElement).toBe(f.items[2]);
    f.key("ArrowDown"); expect(f.document.activeElement).toBe(f.items[0]);
    f.key("End"); expect(f.document.activeElement).toBe(f.items[2]);
    f.key("Home"); expect(f.document.activeElement).toBe(f.items[0]);
  });

  it("opens at the last action with ArrowUp and restores the invoker on Escape", () => {
    const f = fixture();
    f.open("ArrowUp");
    expect(f.document.activeElement).toBe(f.items[2]);
    f.key("Escape"); f.render();
    expect(f.isOpen()).toBe(false);
    expect(f.document.activeElement).toBe(f.trigger);
    expect(f.listeners.has("pointerdown")).toBe(false);
  });

  it("dismisses for an outside pointer without stealing its focus", () => {
    const f = fixture(); f.open();
    f.listeners.get("pointerdown")({ target: {} }); f.render();
    expect(f.isOpen()).toBe(false);
    expect(f.trigger.focus).not.toHaveBeenCalled();
  });

  it("closes on Tab and puts the invoker back into the document tab sequence", () => {
    const f = fixture(); f.open();
    f.key("Tab"); f.render();
    expect(f.isOpen()).toBe(false);
    expect(f.document.activeElement).toBe(f.trigger);
  });
});
