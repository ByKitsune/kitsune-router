import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as providers from "../../src/shared/constants/providers.js";
import * as models from "../../src/shared/constants/models.js";
import * as filtering from "../../src/shared/utils/modelPickerFilter.js";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const filename = fileURLToPath(new URL("../../src/shared/components/ModelSelectModal.js", import.meta.url));
const code = babel.transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;

// Exercise the real picker and its effects. Only host rendering/capability
// fetching is replaced; provider identity, model kinds and filtering are real.
function picker(connections, catalogs = {}, custom = []) {
  const slots = [], effects = [], cleanups = new Map();
  let cursor = 0, activeProviders = connections;
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useMemo(factory, deps) {
      const slot = cursor++;
      if (!slots[slot] || deps.some((dep, index) => !Object.is(dep, slots[slot].deps[index]))) slots[slot] = { deps, value: factory() };
      return slots[slot].value;
    },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const slot = cursor++;
      if (!slots[slot] || deps.some((dep, index) => !Object.is(dep, slots[slot][index]))) {
        slots[slot] = deps;
        effects.push(() => { cleanups.get(slot)?.(); cleanups.set(slot, effect()); });
      }
    },
  };
  const fetch = vi.fn(async (url) => {
    const match = url.match(/^\/api\/providers\/([^/]+)\/models$/);
    const data = match ? catalogs[match[1]] : url === "/api/models/custom" ? { models: custom }
      : url === "/api/provider-nodes" ? { nodes: [] } : url === "/api/models/disabled" ? { disabled: {} } : { combos: [] };
    if (data instanceof Error) throw data;
    return { ok: true, json: async () => await data || { models: [] } };
  });
  const jsx = (type, props) => ({ type, props: props || {} });
  const getCaps = () => null;
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, fetch, console,
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "@/shared/constants/providers") return providers;
      if (id === "@/shared/constants/models") return models;
      if (id === "@/shared/utils/modelPickerFilter") return filtering;
      if (id === "@/shared/hooks/useModelCaps") return { useModelCaps: () => ({ getCaps }) };
      if (["./Modal", "./ProviderIcon", "./CapacityBadges"].includes(id)) return { __esModule: true, default: id };
      return require(id);
    },
  }, { filename });
  const onSelect = vi.fn();
  function render(extra = {}) {
    cursor = 0;
    const tree = mod.exports.default({ isOpen: true, activeProviders, onClose() {}, onSelect, ...extra });
    effects.splice(0).forEach(effect => effect());
    return tree;
  }
  return {
    fetch, onSelect, render,
    setConnections(next) { activeProviders = next; return render(); },
    async flush(extra) { await new Promise(setImmediate); return render(extra); },
    close() { for (const cleanup of cleanups.values()) cleanup?.(); },
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
const button = (tree, name) => nodes(tree).find(node => node.type === "button" && text(node).includes(name));
const connection = (id, provider, isActive = true) => ({ id, provider, isActive });

describe("model picker live catalogs use enabled connection scope", () => {
  it("offers authenticated passthrough models without requiring a manual alias", async () => {
    const ui = picker([connection("enabled", "bykitsune"), connection("disabled", "bykitsune", false)], {
      enabled: { models: [{ id: "synthetic-live-model", name: "Observed model" }] },
      disabled: { models: [{ id: "synthetic-disabled-model", name: "Disabled-only model" }] },
    });
    try {
      ui.render();
      const tree = await ui.flush();
      expect(button(tree, "Observed model")).toBeDefined();
      expect(button(tree, "Disabled-only model")).toBeUndefined();
      expect(ui.fetch.mock.calls.map(([url]) => url)).not.toContain("/api/providers/disabled/models");
      button(tree, "Observed model").props.onClick();
      expect(ui.onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: "bykitsune/synthetic-live-model" }));
    } finally { ui.close(); }
  });

  it("does not fetch or merge disabled Cursor account models", async () => {
    const ui = picker([connection("disabled", "cursor", false), connection("enabled", "cursor")], {
      enabled: { models: [{ id: "synthetic-enabled-cursor", name: "Enabled Cursor model" }] },
      disabled: { models: [{ id: "synthetic-disabled-cursor", name: "Disabled Cursor model" }] },
    });
    try {
      ui.render();
      const tree = await ui.flush();
      expect(button(tree, "Enabled Cursor model")).toBeDefined();
      expect(button(tree, "Disabled Cursor model")).toBeUndefined();
      expect(ui.fetch.mock.calls.map(([url]) => url)).not.toContain("/api/providers/disabled/models");
    } finally { ui.close(); }
  });

  it("drops stale live models immediately when the enabled account scope changes", async () => {
    let resolveNext;
    const next = new Promise(resolve => { resolveNext = resolve; });
    const ui = picker([connection("first", "nvidia")], {
      first: { models: [{ id: "synthetic-old-model", name: "Old account only" }] }, next,
    });
    try {
      ui.render();
      expect(button(await ui.flush(), "Old account only")).toBeDefined();
      expect(button(ui.setConnections([connection("first", "nvidia", false), connection("next", "nvidia")]), "Old account only")).toBeUndefined();
      resolveNext({ models: [{ id: "synthetic-new-model", name: "New account only" }] });
      const tree = await ui.flush();
      expect(button(tree, "New account only")).toBeDefined();
      expect(button(tree, "Old account only")).toBeUndefined();
    } finally { resolveNext({ models: [] }); ui.close(); }
  });

  it("uses the enabled compatible connection's prefix for a selected model", async () => {
    const provider = "openai-compatible-synthetic";
    const ui = picker([
      { ...connection("disabled", provider, false), providerSpecificData: { prefix: "disabled-prefix" } },
      { ...connection("enabled", provider), providerSpecificData: { prefix: "enabled-prefix" } },
    ]);
    const options = { modelAliases: { "Synthetic alias": "enabled-prefix/synthetic-model" } };
    try {
      ui.render(options);
      const tree = await ui.flush(options);
      expect(button(tree, "Synthetic alias")).toBeDefined();
      button(tree, "Synthetic alias").props.onClick();
      expect(ui.onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: "enabled-prefix/synthetic-model" }));
    } finally { ui.close(); }
  });

  it("retains a successful Cursor catalog when another enabled account fails discovery", async () => {
    const ui = picker([connection("failed", "cursor"), connection("enabled", "cursor")], {
      failed: new Error("Synthetic catalog unavailable"),
      enabled: { models: [{ id: "synthetic-enabled-cursor", name: "Available account model" }] },
    });
    try {
      ui.render();
      expect(button(await ui.flush(), "Available account model")).toBeDefined();
    } finally { ui.close(); }
  });

  it("preserves a registered name and filters discovered media out of the chat picker", async () => {
    const ui = picker([connection("enabled", "bykitsune")], {
      enabled: { models: [
        { id: "synthetic-overlap", name: "Observed duplicate" },
        { id: "synthetic-image", name: "Image model", kind: "image" },
      ] },
    }, [{ providerAlias: "bykitsune", id: "synthetic-overlap", name: "Operator chosen name" }]);
    try {
      ui.render();
      const tree = await ui.flush();
      expect(button(tree, "Operator chosen name")).toBeDefined();
      expect(button(tree, "Observed duplicate")).toBeUndefined();
      expect(button(tree, "Image model")).toBeUndefined();
      button(tree, "Operator chosen name").props.onClick();
      expect(ui.onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: "bykitsune/synthetic-overlap", isCustom: true }));
    } finally { ui.close(); }
  });

  it("offers discovered typed models only in their matching passthrough media picker", async () => {
    const ui = picker([connection("enabled", "openrouter")], {
      enabled: { models: [
        { id: "synthetic-image", name: "Observed image", kind: "image" },
        { id: "synthetic-chat", name: "Observed chat", kind: "llm" },
      ] },
    });
    const options = { kindFilter: "image" };
    try {
      ui.render(options);
      const tree = await ui.flush(options);
      expect(button(tree, "Observed image")).toBeDefined();
      expect(button(tree, "Observed chat")).toBeUndefined();
    } finally { ui.close(); }
  });
});
