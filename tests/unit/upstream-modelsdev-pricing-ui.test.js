import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { getProviderIdentityTokens } from "../../open-sse/providers/identity.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { getModelsDevPricingReference } from "../../open-sse/providers/metadata/modelsDevPricing.js";
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

function fixture(data, overrides = {}) {
  const slots = [], effects = [];
  let cursor = 0;
  const hooks = {
    useState(initial) { const slot = cursor++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], value => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }]; },
    useRef(initial) { const slot = cursor++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot]; },
    useEffect(effect, deps) { const slot = cursor++; if (!slots[slot] || deps.some((dep, index) => !Object.is(dep, slots[slot][index]))) { slots[slot] = deps; effects.push(effect); } },
  };
  const fetch = vi.fn(async (url, options) => ({ ok: true, json: async () => options?.method ? {} : url.includes("view=overrides") ? overrides : data }));
  const jsx = (type, props) => ({ type, props: props || {} });
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, fetch, console, confirm: () => true, alert: vi.fn(),
    require(id) {
      if (id === "react") return hooks;
      if (id === "@/i18n/runtime") return { translate };
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "open-sse/providers/pricing.js") return { getModelsDevPricingReference };
      if (id === "open-sse/providers/metadata/reviewed.js") return { getReviewedModelMetadata };
      if (id === "open-sse/providers/identity.js") return { getProviderIdentityTokens };
      if (id === "open-sse/config/pricingConfig.js") return pricingConfig;
      throw new Error(`Unexpected import: ${id}`);
    },
  }, { filename });
  const render = () => { cursor = 0; const tree = mod.exports.default({ isOpen: true, onClose() {}, onSave() {} }); effects.splice(0).forEach(effect => effect()); return tree; };
  return {
    fetch, render,
    async mount() { render(); await new Promise(setImmediate); return render(); },
    async save() { await nodes(render()).find(node => node.type === "button" && text(node) === "Save Changes").props.onClick(); },
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
function row(tree, id) { return nodes(tree).find(node => node.type === "tr" && text(node).includes(id)); }

describe("models.dev reference attribution in the pricing editor", () => {
  it("shows a labeled reference alongside deliberately unknown enterprise rates", async () => {
    const modal = fixture({ groq: { "llama-3.3-70b-versatile": { input: null, output: null } } });
    const target = row(await modal.mount(), "llama-3.3-70b-versatile");
    const inputs = nodes(target).filter(node => node.type === "input");
    expect(inputs[0].props.value).toBe("");
    expect(inputs[1].props.placeholder).toBe("Not specified");
    expect(text(target)).toContain("models.dev catalog reference · 2026-10-29");
    expect(text(target)).toContain("Reference only, not an invoice");
    expect(text(target)).toContain('"input":0.59');
    expect(text(target)).toContain("d1f9cdad590fc031c5633132107d0818efec98f2ba8d27e4ba9cf952f473fc4b");
    await modal.save();
    expect(modal.fetch.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
  });

  it("saves an edited zero without persisting the public reference or unknown fields", async () => {
    const id = "nvidia/nemotron-3-super-120b-a12b";
    const modal = fixture({ openrouter: { [id]: { input: 0.3, output: 2.4, cached: null, reasoning: null } } });
    let tree = await modal.mount();
    const target = row(tree, id);
    expect(text(target)).toContain('"input":0.3');
    nodes(target).filter(node => node.type === "input")[0].props.onChange({ target: { value: "0" } });
    tree = modal.render();
    expect(nodes(row(tree, id)).filter(node => node.type === "input")[0].props.value).toBe(0);
    await modal.save();
    const call = modal.fetch.mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(JSON.parse(call[1].body)).toEqual({ openrouter: { [id]: { input: 0 } } });
  });

  it("shows catalog zero as a raw reference rather than a free effective price", async () => {
    const modal = fixture({ glm: { "glm-5.3": { input: null, output: null } } });
    const target = row(await modal.mount(), "glm-5.3");
    expect(text(target)).toContain('"input":0');
    expect(text(target)).toContain("Catalog zero can describe a plan or a different unit");
    expect(nodes(target).filter(node => node.type === "input")[0].props.value).toBe("");
  });

  it("labels a newly extracted TTS output as a reference while the token field remains unknown", async () => {
    const id = "gemini-2.5-flash-preview-tts";
    const modal = fixture({ gemini: { [id]: { input: 0.5, output: null } } });
    const target = row(await modal.mount(), id);
    expect(text(target)).toContain(`Catalog product/model: google / ${id}`);
    expect(text(target)).toContain('"output":10');
    expect(text(target)).toContain("Reference only, not an invoice");
    expect(nodes(target).filter(node => node.type === "input")[1].props.value).toBe("");
    await modal.save();
    expect(modal.fetch.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
  });
});
