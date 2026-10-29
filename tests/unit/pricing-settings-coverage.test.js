import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { translate } from "../../src/i18n/runtime.js";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const filename = fileURLToPath(new URL("../../src/app/dashboard/settings/pricing/page.js", import.meta.url));
const code = babel.transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;

function fixture(reply) {
  const slots = [], effects = [], cleanups = [];
  let cursor = 0;
  const writes = vi.fn();
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { writes(); slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useRef(initial) { const slot = cursor++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot]; },
    useCallback(callback, deps) {
      const slot = cursor++;
      if (!slots[slot] || deps.some((value, index) => !Object.is(value, slots[slot].deps[index]))) slots[slot] = { callback, deps };
      return slots[slot].callback;
    },
    useEffect(effect, deps) {
      const slot = cursor++;
      if (!slots[slot] || deps.some((value, index) => !Object.is(value, slots[slot][index]))) { slots[slot] = deps; effects.push(effect); }
    },
  };
  const fetch = vi.fn((...args) => reply(...args));
  const Card = () => null;
  const jsx = (type, props) => ({ type, props: props || {} });
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports, fetch, AbortController, queueMicrotask,
    console: { error: vi.fn() },
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "@/i18n/runtime") return { translate };
      if (id === "@/shared/components/Card") return { __esModule: true, default: Card };
      if (id === "@/shared/components/PricingModal") return { __esModule: true, default: () => null };
      throw new Error(`Unexpected import: ${id}`);
    },
  }, { filename });
  const render = () => {
    cursor = 0;
    const tree = fixtureModule.exports.default();
    effects.splice(0).forEach(effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
    return tree;
  };
  return { fetch, writes, render, Card, unmount: () => cleanups.forEach(cleanup => cleanup()), async mount() { render(); await new Promise(setImmediate); return render(); } };
}
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
const rows = { fixture: { free: { input: 0, output: 0 }, partial: { input: 2 }, unknown: {} } };
const response = (data, ok = true) => ({ ok, json: async () => data });

describe("pricing settings show measured coverage rather than assumed readiness", () => {
  it("counts genuine zero rates as known and separates partial and missing quotes", async () => {
    const page = fixture(url => Promise.resolve(response(url.includes("diagnostics") ? null : rows)));
    const tree = await page.mount();
    const cards = nodes(tree).filter(node => node.type === page.Card);
    const priced = cards.find(card => text(card).includes("Models with input and output rates"));
    const unpriced = cards.find(card => text(card).includes("Unknown or partial rates"));
    expect(nodes(priced).some(node => node.type === "div" && text(node) === "1")).toBe(true);
    expect(nodes(unpriced).some(node => node.type === "div" && text(node) === "2")).toBe(true);
    expect(text(tree)).not.toContain("Active");
    expect(text(tree)).toContain("not available accounts or provider entitlement");
    page.unmount();
  });

  it("shows failed loads honestly and permits retry without exposing an active status", async () => {
    let failed = true;
    const page = fixture(url => Promise.resolve(response(url.includes("diagnostics") ? null : rows, !failed)));
    let tree = await page.mount();
    expect(text(nodes(tree).find(node => node.props.role === "alert"))).toContain("Pricing could not be loaded");
    expect(nodes(tree).find(node => node.type === "button" && text(node) === "Edit Pricing").props.disabled).toBe(true);
    expect(text(tree)).not.toContain("Active");
    failed = false;
    nodes(tree).find(node => node.type === "button" && text(node) === "Retry").props.onClick();
    await new Promise(setImmediate);
    tree = page.render();
    expect(nodes(tree).find(node => node.props.role === "alert")).toBeUndefined();
    expect(nodes(tree).find(node => node.type === "button" && text(node) === "Edit Pricing").props.disabled).toBe(false);
    page.unmount();
  });

  it("aborts its requests on unmount and ignores even a late successful response", async () => {
    const resolve = [];
    const page = fixture(() => new Promise(done => resolve.push(done)));
    page.render();
    await new Promise(setImmediate);
    expect(page.fetch).toHaveBeenCalledTimes(2);
    const signals = page.fetch.mock.calls.map(([, options]) => options.signal);
    page.writes.mockClear();
    page.unmount();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    resolve.forEach(done => done(response(rows)));
    await new Promise(setImmediate);
    expect(page.writes).not.toHaveBeenCalled();
  });
});
