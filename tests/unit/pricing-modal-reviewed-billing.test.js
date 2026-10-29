import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { getProviderIdentityTokens } from "../../open-sse/providers/identity.js";
import * as pricingConfig from "../../open-sse/config/pricingConfig.js";
import { translate } from "../../src/i18n/runtime.js";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const filename = fileURLToPath(new URL("../../src/shared/components/PricingModal.js", import.meta.url));
const code = babel.transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;

// Execute the actual component, including loading effects and rendered event
// callbacks. Only React scheduling, network, and imported catalog data are seams.
function fixture(data, metadata = {}, { fallback = false, overrides = {}, diagnostics = null, failReset = false } = {}) {
  const slots = [];
  const effects = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], (value) => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useEffect(effect, deps) {
      const slot = cursor++;
      if (!slots[slot] || deps.some((dep, index) => !Object.is(dep, slots[slot][index]))) {
        slots[slot] = deps;
        effects.push(effect);
      }
    },
  };
  const fetch = vi.fn(async (url, options) => ({ ok: options?.method === "DELETE" ? !failReset : !!options || !fallback, json: async () => url.includes("view=overrides") ? overrides : url.includes("view=diagnostics") ? diagnostics : data }));
  const props = { isOpen: true, onClose: vi.fn(), onSave: vi.fn() };
  const jsx = (type, props) => ({ type, props: props || {} });
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports, fetch, console,
    confirm: () => true, alert: vi.fn(),
    require(id) {
      if (id === "react") return hooks;
      if (id === "@/i18n/runtime") return { translate };
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "open-sse/providers/pricing.js") return { getDefaultPricing: () => data };
      if (id === "open-sse/providers/metadata/reviewed.js") return { getReviewedModelMetadata: (provider, model) => metadata[provider]?.[model] ?? null };
      if (id === "open-sse/providers/identity.js") return { getProviderIdentityTokens };
      if (id === "open-sse/config/pricingConfig.js") return pricingConfig;
      throw new Error(`Unexpected fixture import: ${id}`);
    },
  }, { filename });
  const render = () => {
    cursor = 0;
    const tree = fixtureModule.exports.default(props);
    effects.splice(0).forEach((effect) => effect());
    return tree;
  };
  return {
    fetch, props, render,
    async mount() { render(); await new Promise(setImmediate); return render(); },
    async save() { await nodes(render()).find((node) => node.type === "button" && text(node) === "Save Changes").props.onClick(); },
    payload() { return JSON.parse(fetch.mock.calls.find(([, options]) => options?.method === "PATCH")[1].body); },
  };
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
function fields(tree, model) {
  const row = nodes(tree).find((node) => node.type === "tr" && text(node).includes(model));
  return nodes(row).filter((node) => node.type === "input");
}

const sample = () => ({ fixture: { "known-model": { input: 1.5, output: 6, cached: 0 } } });

describe("PricingModal reviewed billing behavior", () => {
  it("bounds rendered rate inputs while retaining edits across pages and search", async () => {
    const rows = Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`model-${String(index).padStart(3, "0")}`, { input: 1, output: 2 }]));
    const modal = fixture({ fixture: rows });
    let tree = await modal.mount();
    expect(nodes(tree).filter(node => node.type === "input" && node.props.type === "number")).toHaveLength(40 * pricingConfig.PRICING_RATE_FIELDS.length);
    expect(fields(tree, "model-044")).toHaveLength(0);
    fields(tree, "model-000")[0].props.onChange({ target: { value: "0.000024" } });
    tree = modal.render();
    nodes(tree).find(node => node.props["aria-label"] === "Next page").props.onClick();
    tree = modal.render();
    expect(fields(tree, "model-000")).toHaveLength(0);
    fields(tree, "model-044")[0].props.onChange({ target: { value: "3" } });
    tree = modal.render();
    nodes(tree).find(node => node.type === "input" && node.props.type === "search").props.onChange({ target: { value: "model-000" } });
    tree = modal.render();
    expect(fields(tree, "model-000")[0].props.value).toBe(0.000024);
    await modal.save();
    expect(modal.payload()).toEqual({ fixture: { "model-000": { input: 0.000024 }, "model-044": { input: 3 } } });
  });

  it("explains effective sources and freshness without saving diagnostic metadata", async () => {
    const diagnostics = { summary: { priced: 0, partial: 1, unknown: 0, operatorOverrides: 1 }, providers: {
      fixture: { "known-model": { status: "partial", source: "operator-override", catalog: { status: "expired" } } },
    } };
    const modal = fixture({ fixture: { "known-model": { input: 0, output: null } } }, {}, { overrides: { fixture: { "known-model": { input: 0 } } }, diagnostics });
    let tree = await modal.mount();
    expect(text(tree)).toContain("Saved pricing coverage");
    expect(text(tree)).toContain("Operator override");
    expect(text(tree)).toContain("Catalog estimate expired");
    expect(text(tree)).toContain("Some token components remain unknown.");
    fields(tree, "known-model")[0].props.onChange({ target: { value: "2" } });
    tree = modal.render();
    expect(text(tree)).toContain("Unsaved override");
    await modal.save();
    expect(modal.payload()).toEqual({ fixture: { "known-model": { input: 2 } } });
  });

  it("shows reset failures without discarding the current edits", async () => {
    const modal = fixture(sample(), {}, { failReset: true });
    const tree = await modal.mount();
    fields(tree, "known-model")[0].props.onChange({ target: { value: "4" } });
    await nodes(modal.render()).find(node => node.type === "button" && text(node) === "Reset to Defaults").props.onClick();
    const after = modal.render();
    expect(text(nodes(after).find(node => node.props.role === "alert"))).toBe("Failed to reset pricing");
    expect(fields(after, "known-model")[0].props.value).toBe(4);
    await modal.save();
    expect(modal.payload()).toEqual({ fixture: { "known-model": { input: 4 } } });
  });

  it("refreshes the parent after a persisted reset even when closed without further edits", async () => {
    const modal = fixture(sample());
    const tree = await modal.mount();
    fields(tree, "known-model")[0].props.onChange({ target: { value: "4" } });
    let finishRefresh;
    modal.props.onSave.mockImplementation(() => new Promise(resolve => { finishRefresh = resolve; }));
    const resetting = nodes(modal.render()).find(node => node.type === "button" && text(node) === "Reset to Defaults").props.onClick();
    await new Promise(setImmediate);
    expect(modal.props.onSave).toHaveBeenCalledOnce();
    expect(modal.props.onClose).not.toHaveBeenCalled();
    expect(nodes(modal.render()).find(node => node.type === "button" && text(node) === "Saving...").props.disabled).toBe(true);
    finishRefresh();
    await resetting;
    expect(fields(modal.render(), "known-model")[0].props.value).toBe(1.5);
    await modal.save();
    expect(modal.props.onClose).toHaveBeenCalledOnce();
    expect(modal.fetch.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
  });

  it("accepts sub-cent per-million rates without imposing a cent-sized input step", async () => {
    const modal = fixture(sample());
    const tree = await modal.mount();
    const input = fields(tree, "known-model")[0];
    expect(input.props.step).toBe("any");
    input.props.onChange({ target: { value: "0.000024" } });
    await modal.save();
    expect(modal.payload()).toEqual({ fixture: { "known-model": { input: 0.000024 } } });
  });

  it("edits explicit saved rows and clears an override without fabricating zero", async () => {
    const data = sample();
    const original = structuredClone(data);
    const modal = fixture(data, {}, { overrides: data });
    let tree = await modal.mount();
    fields(tree, "known-model")[0].props.onChange({ target: { value: "2.75" } });
    tree = modal.render();
    expect(fields(tree, "known-model")[0].props.value).toBe(2.75);
    expect(data).toEqual(original);
    fields(tree, "known-model")[4].props.onChange({ target: { value: "0" } });
    tree = modal.render();
    expect(fields(tree, "known-model")[4].props.value).toBe(0);
    fields(tree, "known-model")[0].props.onChange({ target: { value: "" } });
    tree = modal.render();
    expect(fields(tree, "known-model")[0].props.value).toBe("");
    fields(tree, "known-model")[1].props.onChange({ target: { value: "-1" } });
    fields(tree, "known-model")[1].props.onChange({ target: { value: "Infinity" } });
    await modal.save();
    expect(modal.payload()).toEqual({ fixture: { "known-model": { output: 6, cached: 0, cache_creation: 0 } } });
    expect(data).toEqual(original);
  });
  it("edits hourly cache writes, including zero, without changing the default TTL or saved tier", async () => {
    const data = { fixture: { "known-model": {
      input: 1.5, cache_creation: 2.5, cache_creation_1h: 4,
      tier: { threshold: 200000, inclusive: true, input: 3, cache_creation_1h: 8 },
    } } };
    const original = structuredClone(data);
    const modal = fixture(data, {}, { overrides: data });
    let tree = await modal.mount();
    expect(fields(tree, "known-model")[4].props.value).toBe(2.5);
    expect(fields(tree, "known-model")[5].props.value).toBe(4);
    fields(tree, "known-model")[5].props.onChange({ target: { value: "0" } });
    tree = modal.render();
    expect(fields(tree, "known-model")[5].props.value).toBe(0);
    await modal.save();
    expect(modal.payload()).toEqual({ fixture: { "known-model": {
      input: 1.5, cache_creation: 2.5, cache_creation_1h: 0,
      tier: { threshold: 200000, inclusive: true, input: 3, cache_creation_1h: 8 },
    } } });
    expect(data).toEqual(original);
  });
  it("keeps unspecified rates unset when editing a different component", async () => {
    const data = sample();
    const modal = fixture(data);
    const tree = await modal.mount();
    const inputs = fields(tree, "known-model");
    expect(inputs.map((input) => input.props.value)).toEqual([1.5, 6, 0, "", "", "", "", ""]);
    inputs[0].props.onChange({ target: { value: "2" } });
    await modal.save();
    expect(modal.payload()).toEqual({ fixture: { "known-model": { input: 2 } } });
    expect(modal.payload().fixture["known-model"]).not.toHaveProperty("cache_creation");
  });
  it("does not concretize inherited reasoning or tier rates when editing an hourly fee", async () => {
    const data = { anthropic: { "claude-haiku-5-5": {
      input: 0.1, output: 0.5, reasoning: 0.5, cached: null, cache_creation_1h: 0.2,
      tier: { threshold: 100000, input: 0.5, output: 2.5 },
    } } };
    const modal = fixture(data, {}, { overrides: { anthropic: { "claude-haiku-5-5": { cached: null } } } });
    const tree = await modal.mount();
    fields(tree, "claude-haiku-5-5")[5].props.onChange({ target: { value: "1.25" } });
    await modal.save();
    expect(modal.payload()).toEqual({ anthropic: { "claude-haiku-5-5": { cached: null, cache_creation_1h: 1.25 } } });
  });

  it("keeps the editor read-only when either pricing view cannot be loaded", async () => {
    const modal = fixture(sample(), {}, { fallback: true });
    const tree = await modal.mount();
    expect(nodes(tree).find(node => node.props.role === "alert")).toBeDefined();
    expect(nodes(tree).find(node => node.type === "button" && text(node) === "Save Changes").props.disabled).toBe(true);
  });

  it("edits only a delivered-tier tariff without materializing Standard or other-tier overrides", async () => {
    const data = { openai: { "gpt-6.1-sol": {
      input: 2, output: 10, cached: 0.1,
      service_tiers: { fast: { input: 4, output: 20, cached: 0.2 }, ultrafast: { input: 12, output: 60 } },
    } } };
    const modal = fixture(data, {}, { overrides: { openai: { "gpt-6.1-sol": { cached: null } } } });
    const tree = await modal.mount();
    const label = nodes(tree).find(node => node.type === "label" && text(node).includes("fast input"));
    expect(label).toBeDefined();
    nodes(label).find(node => node.type === "input").props.onChange({ target: { value: "0" } });
    await modal.save();
    expect(modal.payload()).toEqual({ openai: { "gpt-6.1-sol": { cached: null, service_tiers: { fast: { input: 0 } } } } });
  });

  it("does not resurrect inherited premium rates when editing a previously all-unknown quote", async () => {
    const data = { openai: { "gpt-6.1-sol": { input: 2, output: 10, service_tiers: { fast: null } } } };
    const modal = fixture(data, {}, { overrides: data });
    const tree = await modal.mount();
    const label = nodes(tree).find(node => node.type === "label" && text(node) === "fast output");
    nodes(label).find(node => node.type === "input").props.onChange({ target: { value: "9" } });
    await modal.save();
    expect(modal.payload().openai["gpt-6.1-sol"].service_tiers.fast).toEqual({
      input: null, output: 9, cached: null, reasoning: null,
      cache_creation: null, cache_creation_1h: null, cache_write_30m: null, cache_write_12h: null, tier: null,
    });
  });

  it("finds newly exposed models by provider or ID without losing edits hidden by filtering", async () => {
    const modal = fixture({ fixture: { "known-model": { input: 1.5 } }, other: { "second-model": { input: 2 } } });
    let tree = await modal.mount();
    fields(tree, "known-model")[0].props.onChange({ target: { value: "0" } });
    const search = () => nodes(modal.render()).find(node => node.type === "input" && node.props.type === "search");
    expect(search()).toBeDefined();
    search().props.onChange({ target: { value: "SECOND-model" } });
    tree = modal.render();
    expect(text(tree)).toContain("second-model");
    expect(text(tree)).not.toContain("known-model");
    search().props.onChange({ target: { value: "FIXTURE" } });
    tree = modal.render();
    expect(fields(tree, "known-model")[0].props.value).toBe(0);
    expect(text(tree)).not.toContain("second-model");
    await modal.save();
    expect(modal.payload()).toEqual({ fixture: { "known-model": { input: 0 } } });
  });
});
