import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import * as providers from "../../src/shared/constants/providers.js";
import * as baseUrl from "../../src/shared/utils/connectionBaseUrl.js";
import * as validation from "../../src/shared/utils/connectionValidation.js";
import * as bulkAdd from "../../src/shared/utils/bulkAdd.js";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const files = {
  edit: "../../src/shared/components/EditConnectionModal.js",
  add: "../../src/app/(dashboard)/dashboard/providers/[id]/AddApiKeyModal.js",
};
const compiled = Object.fromEntries(Object.entries(files).map(([name, relative]) => {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const code = babel.transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
    plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
  }).code;
  return [name, { code, filename }];
}));

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

// Execute the actual components, hooks/effect cleanups and event handlers. Only
// host components and the HTTP seam are replaced. Requests intentionally ignore
// abort until responded, proving late completion cannot publish stale results.
function fixture(kind = "edit", overrides = {}) {
  const slots = [], effects = [], cleanups = new Map(), requests = [];
  let cursor = 0, dirty = false, tree;
  let props = {
    isOpen: true,
    connection: { id: "first", name: "Existing", provider: "openai", authType: "apikey", proxyPoolId: "pool-a" },
    provider: "openai", proxyPools: [{ id: "pool-a", name: "Pool A" }],
    onSave: vi.fn(async () => true), onClose: vi.fn(),
    ...overrides,
  };
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], next => {
        const value = typeof next === "function" ? next(slots[slot]) : next;
        if (!Object.is(slots[slot], value)) { slots[slot] = value; dirty = true; }
      }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useLayoutEffect(effect, deps) { return hooks.useEffect(effect, deps); },
    useEffect(effect, deps) {
      const slot = cursor++;
      if (!(slot in slots) || deps.some((dep, index) => !Object.is(dep, slots[slot][index]))) {
        slots[slot] = deps;
        effects.push(() => { cleanups.get(slot)?.(); cleanups.set(slot, effect()); });
      }
    },
  };
  const fetch = vi.fn((url, options) => new Promise((resolve, reject) => {
    requests.push({ url, options, resolve, reject });
  }));
  const jsx = (type, props) => ({ type, props: props || {} });
  const mod = { exports: {} };
  vm.runInNewContext(compiled[kind].code, {
    module: mod, exports: mod.exports, console, fetch, AbortController,
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (id === "@/shared/constants/providers") return providers;
      if (id === "@/shared/utils/connectionBaseUrl") return baseUrl;
      if (id === "@/shared/utils/connectionValidation") return validation;
      if (id === "@/shared/utils/bulkAdd") return bulkAdd;
      if (id === "@/shared/components") return Object.fromEntries(["Button", "Badge", "Input", "Modal", "Select"].map(name => [name, name]));
      if (id.startsWith("@/shared/components/")) return { __esModule: true, default: id.split("/").at(-1) };
      return require(id);
    },
  }, { filename: compiled[kind].filename });
  function render(next) {
    if (next) props = { ...props, ...next };
    let remaining = 15;
    do {
      if (!remaining--) throw Error("Component did not settle");
      dirty = false; cursor = 0;
      tree = mod.exports.default(props);
      effects.splice(0).forEach(effect => effect());
    } while (dirty);
    return tree;
  }
  const find = predicate => nodes(tree).find(predicate);
  function field(label) { return find(node => ["Input", "Select"].includes(node.type) && node.props.label === label); }
  const button = label => find(node => node.type === "Button" && text(node) === label);
  render();
  return {
    fetch, requests, render, field, button,
    onSave: props.onSave, onClose: props.onClose,
    tree: () => tree,
    change(label, value) { field(label).props.onChange({ target: { value } }); return render(); },
    async respond(index, valid, status = 200) {
      requests[index].resolve({ ok: status >= 200 && status < 300, json: async () => ({ valid }) });
      await new Promise(setImmediate); return render();
    },
    body: index => JSON.parse(requests[index].options.body),
    close() { for (const cleanup of cleanups.values()) cleanup?.(); },
  };
}

const hasValidBadge = ui => nodes(ui.tree()).some(node => node.type === "Badge" && text(node) === "Valid");

describe("provider credential checks match the saved connection draft", () => {
  it("revalidates a replacement key instead of reusing the previous key's success", async () => {
    const ui = fixture();
    try {
      ui.change("API Key", "synthetic-key-a");
      const checking = ui.button("Check").props.onClick(); ui.render();
      await ui.respond(0, true); await checking;
      expect(hasValidBadge(ui)).toBe(true);
      ui.change("API Key", "synthetic-key-b");
      expect(hasValidBadge(ui)).toBe(false);
      const saving = ui.button("Save").props.onClick(); ui.render();
      expect(ui.body(1).apiKey).toBe("synthetic-key-b");
      await ui.respond(1, false); await saving; ui.render();
      expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "synthetic-key-b", testStatus: "unknown" }));
    } finally { ui.close(); }
  });

  it("checks and saves identical edited Base URL data without losing connection settings", async () => {
    const existing = { baseUrl: "http://old-host:8080/transcriptions", connectionProxyEnabled: true, connectionProxyUrl: "http://legacy-proxy:8080", customFlag: true };
    const ui = fixture("edit", { connection: { id: "selfhosted", provider: "selfhosted-stt", authType: "apikey", proxyPoolId: "pool-a", providerSpecificData: existing } });
    try {
      ui.change("API Key", "synthetic-local-key");
      ui.change("Base URL", " http://new-host:8080/transcriptions ");
      const checking = ui.button("Check").props.onClick();
      expect(ui.body(0)).toEqual({
        provider: "selfhosted-stt", apiKey: "synthetic-local-key", proxyPoolId: "pool-a",
        providerSpecificData: { ...existing, baseUrl: "http://new-host:8080/transcriptions" },
      });
      await ui.respond(0, true); await checking;
      await ui.button("Save").props.onClick();
      expect(ui.fetch).toHaveBeenCalledOnce();
      expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ providerSpecificData: ui.body(0).providerSpecificData, testStatus: "active" }));
      expect(existing.baseUrl).toBe("http://old-host:8080/transcriptions");
    } finally { ui.close(); }
  });

  it("hides a region-specific success and checks the newly selected region", async () => {
    const regions = providers.AI_PROVIDERS["xiaomi-tokenplan"].regions;
    const ui = fixture("edit", { connection: { id: "regional", provider: "xiaomi-tokenplan", authType: "apikey", providerSpecificData: { region: regions[0].id } } });
    try {
      ui.change("API Key", "synthetic-regional-key");
      const checking = ui.button("Check").props.onClick();
      await ui.respond(0, true); await checking;
      ui.change("Region", regions[1].id);
      expect(hasValidBadge(ui)).toBe(false);
      const saving = ui.button("Save").props.onClick(); ui.render();
      expect(ui.body(1).providerSpecificData.region).toBe(regions[1].id);
      await ui.respond(1, true); await saving;
      expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ providerSpecificData: { region: regions[1].id } }));
    } finally { ui.close(); }
  });

  it("discards late results for an edited credential, even if fetch ignores abort", async () => {
    const ui = fixture();
    try {
      ui.change("API Key", "synthetic-old-key");
      const checking = ui.button("Check").props.onClick(); ui.render();
      expect(ui.button("Save").props.disabled).toBe(true);
      ui.change("API Key", "synthetic-new-key");
      expect(ui.requests[0].options.signal.aborted).toBe(true);
      await ui.respond(0, true); await checking;
      expect(hasValidBadge(ui)).toBe(false);
      expect(ui.button("Save").props.disabled).toBe(false);
    } finally { ui.close(); }
  });

  it.each(["close", "connection"])("does not save a canceled validation after dialog %s", async reason => {
    const ui = fixture();
    try {
      ui.change("API Key", "synthetic-key");
      const saving = ui.button("Save").props.onClick(); ui.render();
      if (reason === "close") ui.render({ isOpen: false });
      else ui.render({ connection: { id: "second", provider: "openai", authType: "apikey" } });
      expect(ui.requests[0].options.signal.aborted).toBe(true);
      await ui.respond(0, true); await saving;
      expect(ui.onSave).not.toHaveBeenCalled();
      expect(hasValidBadge(ui)).toBe(false);
    } finally { ui.close(); }
  });

  it("does not label an HTTP error with a truthy response as successful", async () => {
    const ui = fixture();
    try {
      ui.change("API Key", "synthetic-key");
      const saving = ui.button("Save").props.onClick();
      await ui.respond(0, true, 500); await saving;
      expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ testStatus: "unknown" }));
      expect(hasValidBadge(ui)).toBe(false);
    } finally { ui.close(); }
  });

  it("resets an unsaved credential when the same connection dialog is reopened", () => {
    const ui = fixture();
    try {
      ui.change("API Key", "synthetic-unsaved-key");
      ui.render({ isOpen: false }); ui.render({ isOpen: true });
      expect(ui.field("API Key").props.value).toBe("");
      expect(hasValidBadge(ui)).toBe(false);
    } finally { ui.close(); }
  });

  it("keeps Azure probe and save data aligned and does not borrow a prior account's configuration", async () => {
    const ui = fixture("edit", { connection: {
      id: "azure-first", provider: "azure", authType: "apikey", proxyPoolId: "pool-a",
      providerSpecificData: { azureEndpoint: "https://first.example", deployment: "first", organization: "first-org", connectionProxyEnabled: true },
    } });
    try {
      ui.render({ connection: { id: "azure-next", provider: "azure", authType: "apikey", proxyPoolId: "pool-b" } });
      expect(ui.field("Azure Endpoint").props.value).toBe("");
      expect(ui.field("Deployment Name").props.value).toBe("");
      ui.change("Azure Endpoint", "https://next.example"); ui.change("Deployment Name", "next");
      ui.change("API Key", "synthetic-azure-key");
      const checking = ui.button("Check").props.onClick();
      expect(ui.body(0)).toEqual({
        provider: "azure", apiKey: "synthetic-azure-key", proxyPoolId: "pool-b",
        providerSpecificData: { azureEndpoint: "https://next.example", deployment: "next", organization: "", apiVersion: "2024-10-01-preview" },
      });
      await ui.respond(0, true); await checking;
      await ui.button("Save").props.onClick();
      expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ providerSpecificData: ui.body(0).providerSpecificData }));
    } finally { ui.close(); }
  });

  it("discards late saved-connection test results after choosing another connection", async () => {
    const ui = fixture();
    try {
      const testing = ui.button("Test Connection").props.onClick(); ui.render();
      ui.render({ connection: { id: "next", provider: "openai", authType: "apikey" } });
      expect(ui.requests[0].url).toBe("/api/providers/first/test");
      expect(ui.requests[0].options.signal.aborted).toBe(true);
      await ui.respond(0, true); await testing;
      expect(hasValidBadge(ui)).toBe(false);
    } finally { ui.close(); }
  });

  it("does not display a saved-connection success as validation of a replacement credential", async () => {
    const ui = fixture();
    try {
      const testing = ui.button("Test Connection").props.onClick();
      await ui.respond(0, true); await testing;
      expect(hasValidBadge(ui)).toBe(true);
      ui.change("API Key", "synthetic-replacement-key");
      expect(hasValidBadge(ui)).toBe(false);
      expect(ui.button("Test Connection").props.disabled).toBe(true);
      await ui.button("Test Connection").props.onClick();
      expect(ui.fetch).toHaveBeenCalledOnce();
    } finally { ui.close(); }
  });

  it("marks an endpoint-only edit unknown while retaining the previous error until verified", async () => {
    const ui = fixture("edit", { connection: {
      id: "endpoint-only", provider: "selfhosted-stt", authType: "apikey", testStatus: "active", lastError: "Existing diagnostic",
      providerSpecificData: { baseUrl: "http://old-host/transcriptions", proxyPoolId: "pool-a" },
    } });
    try {
      ui.change("Base URL", "http://new-host/transcriptions");
      await ui.button("Save").props.onClick();
      expect(ui.fetch).not.toHaveBeenCalled();
      expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({
        testStatus: "unknown", providerSpecificData: { baseUrl: "http://new-host/transcriptions", proxyPoolId: "pool-a" },
      }));
      expect(ui.onSave.mock.calls[0][0]).not.toHaveProperty("lastError");
      expect(ui.onSave.mock.calls[0][0]).not.toHaveProperty("lastErrorAt");
    } finally { ui.close(); }
  });

  it("does not invalidate an unchanged stored connection or a name-only edit", async () => {
    const ui = fixture("edit", { connection: {
      id: "unchanged", provider: "selfhosted-stt", authType: "apikey", testStatus: "active",
      providerSpecificData: { baseUrl: "http://same-host/transcriptions" },
    } });
    try {
      ui.change("Name", "Renamed");
      await ui.button("Save").props.onClick();
      expect(ui.onSave.mock.calls[0][0]).not.toHaveProperty("testStatus");
    } finally { ui.close(); }
  });

  it.each(["API Key", "Proxy Pool", "Base URL"])("invalidates an Add success when %s changes", async field => {
    const ui = fixture("add", { provider: "selfhosted-stt" });
    try {
      ui.change("Name", "Synthetic media"); ui.change("API Key", "synthetic-original-key");
      ui.change("Base URL", "http://original-host/transcriptions");
      const checking = ui.button("Check").props.onClick();
      await ui.respond(0, true); await checking;
      expect(hasValidBadge(ui)).toBe(true);
      const value = field === "API Key" ? "synthetic-new-key" : field === "Proxy Pool" ? "pool-a" : "http://new-host/transcriptions";
      ui.change(field, value);
      expect(hasValidBadge(ui)).toBe(false);
    } finally { ui.close(); }
  });

  it("ignores a late Add Check after editing away and back to the same credential", async () => {
    const ui = fixture("add");
    try {
      ui.change("API Key", "synthetic-original-key");
      const checking = ui.button("Check").props.onClick(); ui.render();
      ui.change("API Key", "synthetic-new-key"); ui.change("API Key", "synthetic-original-key");
      expect(ui.requests[0].options.signal.aborted).toBe(true);
      await ui.respond(0, true); await checking;
      expect(hasValidBadge(ui)).toBe(false);
    } finally { ui.close(); }
  });

  it.each(["close", "provider"])("cancels an Add Save and resets its draft across %s", async boundary => {
    const ui = fixture("add");
    try {
      ui.change("Name", "Synthetic connection"); ui.change("API Key", "synthetic-key");
      const saving = ui.button("Save").props.onClick(); ui.render();
      expect(ui.field("API Key").props.disabled).toBe(true);
      if (boundary === "close") { ui.render({ isOpen: false }); ui.render({ isOpen: true }); }
      else ui.render({ provider: "anthropic" });
      expect(ui.requests[0].options.signal.aborted).toBe(true);
      expect(ui.field("API Key").props.value).toBe("");
      await ui.respond(0, true); await saving;
      expect(ui.onSave).not.toHaveBeenCalled();
      expect(hasValidBadge(ui)).toBe(false);
    } finally { ui.close(); }
  });

  it("does not close a new Add draft when an older already-dispatched save completes", async () => {
    let finish;
    const completed = new Promise(resolve => { finish = resolve; });
    const ui = fixture("add", { onSave: vi.fn(() => completed) });
    try {
      ui.change("Name", "First draft"); ui.change("API Key", "synthetic-first-key");
      const saving = ui.button("Save").props.onClick();
      await ui.respond(0, true);
      expect(ui.onSave).toHaveBeenCalledOnce();
      ui.render({ isOpen: false }); ui.render({ isOpen: true });
      ui.change("Name", "New draft"); ui.change("API Key", "synthetic-next-key");
      finish(true); await saving; ui.render();
      expect(ui.onClose).not.toHaveBeenCalled();
      expect(ui.field("API Key").props.value).toBe("synthetic-next-key");
    } finally { finish(false); ui.close(); }
  });

  it("stops a canceled bulk credential probe before persisting it or dispatching another entry", async () => {
    const ui = fixture("add");
    try {
      ui.button("Bulk Add").props.onClick(); ui.render();
      nodes(ui.tree()).find(node => node.type === "textarea").props.onChange({ target: { value: "first|synthetic-first\nsecond|synthetic-second" } }); ui.render();
      const saving = ui.button("Add All Keys").props.onClick(); ui.render();
      ui.render({ isOpen: false });
      expect(ui.requests[0].options.signal.aborted).toBe(true);
      await ui.respond(0, true); await saving;
      expect(ui.fetch).toHaveBeenCalledOnce();
    } finally { ui.close(); }
  });

  it.each(["cancel", "provider switch"])("refreshes acknowledged partial bulk success only for its current provider after %s", async boundary => {
    const onBulkDone = vi.fn();
    const ui = fixture("add", { onBulkDone });
    try {
      ui.button("Bulk Add").props.onClick(); ui.render();
      nodes(ui.tree()).find(node => node.type === "textarea").props.onChange({ target: { value: "first|synthetic-first\nsecond|synthetic-second" } }); ui.render();
      const saving = ui.button("Add All Keys").props.onClick();
      await ui.respond(0, true);
      expect(ui.requests[1].url).toBe("/api/providers");
      await ui.respond(1, true, 201);
      expect(ui.requests[2].url).toBe("/api/providers/validate");
      if (boundary === "cancel") { ui.button("Cancel").props.onClick(); ui.render(); }
      else ui.render({ provider: "anthropic" });
      expect(ui.requests[2].options.signal.aborted).toBe(true);
      await ui.respond(2, true); await saving;
      expect(ui.fetch).toHaveBeenCalledTimes(3);
      expect(ui.requests.filter(request => request.url === "/api/providers")).toHaveLength(1);
      expect(onBulkDone).toHaveBeenCalledTimes(boundary === "cancel" ? 1 : 0);
    } finally { ui.close(); }
  });

  it("passes the selected proxy pool through Add checks and pre-save validation", async () => {
    const ui = fixture("add");
    try {
      ui.change("Name", "Synthetic connection"); ui.change("API Key", "synthetic-key"); ui.change("Proxy Pool", "pool-a");
      const checking = ui.button("Check").props.onClick();
      expect(ui.body(0).proxyPoolId).toBe("pool-a");
      await ui.respond(0, true); await checking;
      const saving = ui.button("Save").props.onClick();
      expect(ui.body(1)).toEqual(ui.body(0));
      await ui.respond(1, true); await saving;
      expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ proxyPoolId: "pool-a", testStatus: "active" }));
    } finally { ui.close(); }
  });

  it("normalizes the explicit no-pool selection consistently for Check and Save", async () => {
    const ui = fixture("add");
    try {
      ui.change("Name", "Synthetic connection"); ui.change("API Key", "synthetic-key");
      const saving = ui.button("Save").props.onClick();
      expect(ui.body(0).proxyPoolId).toBeNull();
      await ui.respond(0, true); await saving;
      expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ proxyPoolId: null }));
    } finally { ui.close(); }
  });

  it("uses the selected pool for every bulk credential probe and persisted connection", async () => {
    const ui = fixture("add");
    try {
      ui.change("Proxy Pool", "pool-a");
      ui.button("Bulk Add").props.onClick(); ui.render();
      nodes(ui.tree()).find(node => node.type === "textarea").props.onChange({ target: { value: "first|synthetic-first\nsecond|synthetic-second" } }); ui.render();
      const saving = ui.button("Add All Keys").props.onClick();
      expect(ui.body(0).proxyPoolId).toBe("pool-a");
      await ui.respond(0, true);
      expect(ui.requests[1].url).toBe("/api/providers"); expect(ui.body(1).proxyPoolId).toBe("pool-a");
      await ui.respond(1, true, 201);
      expect(ui.body(2).proxyPoolId).toBe("pool-a");
      await ui.respond(2, false);
      expect(ui.body(3)).toEqual(expect.objectContaining({ proxyPoolId: "pool-a", testStatus: "unknown" }));
      await ui.respond(3, true, 201); await saving;
      expect(ui.fetch).toHaveBeenCalledTimes(4);
    } finally { ui.close(); }
  });
});
