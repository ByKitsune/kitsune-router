import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Exercise actual component render/event code with deterministic hook storage.
// External UI widgets and network effects are seams; React hydration is also
// verified separately in a real browser.
const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const prefix = "../../src/app/(dashboard)/dashboard/cli-tools/components/";
const codexConfig = require("../../src/app/(dashboard)/dashboard/cli-tools/components/codexConfig.js");

function fixture(relative) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const code = babel.transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
    plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
  }).code;
  const state = [];
  let cursor = 0;
  let dirty = false;
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
      return [state[slot], (next) => {
        const value = typeof next === "function" ? next(state[slot]) : next;
        if (!Object.is(state[slot], value)) { state[slot] = value; dirty = true; }
      }];
    },
    useRef(initial) { const slot = cursor++; if (!(slot in state)) state[slot] = { current: initial }; return state[slot]; },
    useEffect() {},
    useCallback(callback) { return callback; },
    useSyncExternalStore(_subscribe, _client, server) { return server(); },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const ui = Object.fromEntries(["Card", "Button", "ModelSelectModal", "ManualConfigModal", "Tooltip", "Modal", "Input"].map((name) => [name, name]));
  const fixtureModule = { exports: {} };
  const sandbox = {
    module: fixtureModule, exports: fixtureModule.exports, process: { env: {} }, URL, console,
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (id === "@/shared/components") return ui;
      if (id === "next/image") return { __esModule: true, default: "Image" };
      if (id === "./codexConfig") return codexConfig;
      if (["./BaseUrlSelect", "./ApiKeySelect"].includes(id)) return { __esModule: true, default: id.slice(2) };
      if (id === "./cliEndpointMatch") return { matchKnownEndpoint: () => null };
      if (id === "./cliEndpointPresets") return { rememberEndpoint() {} };
      if (id === "open-sse/utils/modelMarkers.js") return { stripModelContextMarker: (value) => ({ model: value.replace(/\[1m\]/g, "") }) };
      if (id === "@/shared/hooks/useCopyToClipboard") return { useCopyToClipboard: () => ({ copied: false, copy() {} }) };
      if (id === "prop-types") return require(id);
      throw new Error(`Unexpected fixture import ${id}`);
    },
  };
  vm.runInNewContext(code, sandbox, { filename });
  const component = fixtureModule.exports.default;
  return {
    render(props) {
      let tree;
      for (let attempt = 0; attempt < 15; attempt++) {
        dirty = false; cursor = 0; tree = component(props);
        if (!dirty) return tree;
      }
      throw new Error("Render state adjustment did not converge");
    },
  };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function widget(tree, type) { return nodes(tree).find((node) => node.type === type); }
function inputs(tree) { return nodes(tree).filter((node) => node.type === "input"); }
const tool = { name: "fixture", defaultModels: [{ alias: "main", envKey: "ANTHROPIC_MODEL", defaultValue: "fixture/model" }] };
const baseProps = { tool, isExpanded: true, onToggle() {}, baseUrl: "http://127.0.0.1:20128", apiKeys: [], activeProviders: [], modelMappings: {}, hasActiveProviders: true, onModelMappingChange() {} };

function config(model, token = "fixture-key") {
  return `model = "${model}"\nmodel_provider = "kitsunerouter"\n[model_providers.kitsunerouter]\nbase_url = "http://127.0.0.1:20128/v1"\n[model_providers.kitsunerouter.http_headers]\nAuthorization = "Bearer ${token}"\n[agents]\ndefault_subagent_model = "fixture/subagent"\n`;
}

describe("React warning cleanup behavior", () => {
  it("renders saved Codex config on first render without effect-state mirroring", () => {
    const card = fixture(prefix + "CodexToolCard.js");
    const tree = card.render({ ...baseProps, initialStatus: { installed: true, config: config("fixture/saved") } });
    expect(inputs(tree).some((input) => input.props.value === "fixture/saved")).toBe(true);
    expect(widget(tree, "ApiKeySelect").props.value).toBe("fixture-key");
  });

  it("preserves Codex drafts across unrelated props/key-list updates and accepts new config", () => {
    const card = fixture(prefix + "CodexToolCard.js");
    let props = { ...baseProps, initialStatus: { installed: true, config: config("fixture/saved") } };
    let tree = card.render(props);
    const model = inputs(tree).find((input) => input.props.value === "fixture/saved");
    model.props.onChange({ target: { value: "fixture/draft" } });
    widget(tree, "ApiKeySelect").props.onChange("fixture-custom-key");
    tree = card.render({ ...props, apiKeys: [{ key: "fixture-new-key" }] });
    expect(inputs(tree).some((input) => input.props.value === "fixture/draft")).toBe(true);
    expect(widget(tree, "ApiKeySelect").props.value).toBe("fixture-custom-key");
    props = { ...props, initialStatus: { installed: true, config: config("fixture/refreshed", "fixture-refreshed-key") } };
    tree = card.render(props);
    expect(inputs(tree).some((input) => input.props.value === "fixture/refreshed")).toBe(true);
    expect(widget(tree, "ApiKeySelect").props.value).toBe("fixture-refreshed-key");
  });

  it("uses the first dashboard key when Codex config contains a placeholder", () => {
    const card = fixture(prefix + "CodexToolCard.js");
    const tree = card.render({ ...baseProps, apiKeys: [{ key: "fixture-dashboard-key" }], initialStatus: { installed: true, config: config("fixture/saved", "sk_kitsunerouter") } });
    expect(widget(tree, "ApiKeySelect").props.value).toBe("fixture-dashboard-key");
  });

  it("derives Claude 1M setting immediately while preserving a local toggle draft", () => {
    const card = fixture(prefix + "ClaudeToolCard.js");
    const props = { ...baseProps, initialStatus: { installed: true, settings: { env: { ANTHROPIC_MODEL: "fixture/model[1m]" } } }, modelMappings: { main: "fixture/model[1m]" } };
    let tree = card.render(props);
    const toggle = inputs(tree).find((input) => input.props.type === "checkbox");
    expect(toggle.props.checked).toBe(true);
    toggle.props.onChange({ target: { checked: false } });
    tree = card.render({ ...props, apiKeys: [{ key: "fixture-new-key" }] });
    expect(inputs(tree).find((input) => input.props.type === "checkbox").props.checked).toBe(false);
  });

  it("renders OAuth with a stable server callback placeholder before browser hydration", () => {
    const modal = fixture("../../src/shared/components/OAuthModal.js");
    const tree = modal.render({ isOpen: true, provider: "github", providerInfo: { name: "fixture" }, onSuccess() {}, onClose() {} });
    expect(nodes(tree).find((node) => node.type === "Input" && node.props.placeholder === "/callback?code=...")).toBeTruthy();
  });
});
