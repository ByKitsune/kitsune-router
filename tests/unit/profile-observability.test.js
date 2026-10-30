import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const state = vi.hoisted(() => ({ settings: {}, authorized: true, cli: false }));
vi.mock("next/server", () => ({ NextResponse: { json: (body, init) => Response.json(body, init) } }));
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => state.settings,
  updateSettings: vi.fn(async updates => (state.settings = { ...state.settings, ...updates })),
}));
vi.mock("@/lib/db/index.js", () => ({ updateSettings: (...args) => updateSettings(...args) }));
vi.mock("@/lib/auth/dashboardSession", () => ({ usesDefaultPassword: () => false }));
vi.mock("@/lib/network/outboundProxy", () => ({ applyOutboundProxyEnv: vi.fn() }));
vi.mock("open-sse/services/combo.js", () => ({ resetComboRotation: vi.fn() }));
vi.mock("@/dashboardGuard", () => ({ hasValidToken: async () => state.authorized, hasValidCliToken: async () => state.cli }));

import { GET, PATCH as patchSettings } from "../../src/app/api/settings/route.js";
import { updateSettings } from "@/lib/localDb";
import { PATCH as patchObservability } from "../../src/app/api/settings/observability/route.js";

// Render the actual Profile page and Toggle. Only unrelated settings controls
// and the initial HTTP-loaded state are replaced; no browser or live account is needed.
const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const profilePath = new URL("../../src/app/(dashboard)/dashboard/profile/page.js", import.meta.url);
const togglePath = new URL("../../src/shared/components/Toggle.js", import.meta.url);
let initialSettings;
const cn = (...classes) => classes.filter(Boolean).join(" ");
const hidden = () => null;
function compile(filename) {
  const code = babel.transformSync(readFileSync(filename, "utf8"), {
    filename: filename.pathname, babelrc: false, configFile: false,
    presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
    plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
  }).code;
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, { module: fixtureModule, exports: fixtureModule.exports, require(id) {
    if (id === "react") return { ...React, useState(value) {
      const original = React.useState(value);
      if (value?.fallbackStrategy === "fill-first") return [initialSettings, () => {}];
      if (value === true) return [false, () => {}];
      return original;
    } };
    if (id === "@/shared/components") return {
      Card: ({ children, id }) => React.createElement("section", { id }, children),
      Button: ({ children }) => React.createElement("button", {}, children),
      Toggle: compile(togglePath).default, Input: hidden,
    };
    if (id === "@/shared/components/Modal") return { __esModule: true, default: hidden, ConfirmModal: hidden };
    if (id === "@/shared/components/LanguageSwitcher" || id === "@/shared/components/LocaleBadge") return { __esModule: true, default: hidden };
    if (id === "@/shared/hooks/useTheme") return { useTheme: () => ({ theme: "light", isDark: false, setTheme() {} }) };
    if (id === "@/shared/utils/cn") return { cn };
    if (id === "@/shared/constants/config") return { APP_CONFIG: { name: "Kitsune Router", version: "fixture" } };
    if (id === "@/i18n/runtime") return { onLocaleChange() {}, translate: text => text };
    if (id === "@/shared/constants/locales") return { readDisplayLocale: () => "en" };
    if (id.startsWith("./")) return compile(new URL(id.endsWith(".js") ? id : `${id}.js`, filename));
    return require(id);
  } });
  return fixtureModule.exports;
}
const ProfilePage = compile(profilePath).default;
function renderProfile(settings) {
  initialSettings = settings;
  const html = renderToStaticMarkup(React.createElement(ProfilePage));
  return html.match(/<section id="settings-observability">([\s\S]*?)<\/section>/)?.[1] || "";
}

beforeEach(() => {
  state.settings = { enableObservability: true };
  state.authorized = true;
  state.cli = false;
  vi.stubEnv("OBSERVABILITY_ENABLED", "");
  vi.stubEnv("ENABLE_REQUEST_LOGS", "");
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe("Profile shows the effective observability setting (#5285)", () => {
  it("does not display enabled recording when ENABLE_REQUEST_LOGS disables it", async () => {
    vi.stubEnv("ENABLE_REQUEST_LOGS", "false");
    const settings = await (await GET()).json();
    const html = renderProfile(settings);
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(html).toMatch(/role="switch"[^>]*disabled=""/);
    expect(html).toContain("ENABLE_REQUEST_LOGS");
    expect(settings.observabilitySource).toBe("ENABLE_REQUEST_LOGS");
    expect(settings.enableObservability).toBe(true);
  });

  it("shows the higher-priority feature flag and leaves the saved preference intact", async () => {
    state.settings.enableObservability = false;
    vi.stubEnv("OBSERVABILITY_ENABLED", "true");
    vi.stubEnv("ENABLE_REQUEST_LOGS", "false");
    const settings = await (await GET()).json();
    const html = renderProfile(settings);
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(html).toContain("OBSERVABILITY_ENABLED");
    expect(settings.observabilitySource).toBe("OBSERVABILITY_ENABLED");
    expect(settings.enableObservability).toBe(false);
  });

  it("keeps an editable, accessible switch when neither environment flag is set", async () => {
    const settings = await (await GET()).json();
    const html = renderProfile(settings);
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(html).not.toMatch(/role="switch"[^>]*disabled=""/);
    expect(html).toContain('aria-labelledby="observability-control-heading"');
    expect(settings.observabilitySource).toBe("settings");
  });

  it("does not permit generic mass assignment of the saved preference or effective metadata", async () => {
    const response = await patchSettings(new Request("http://gateway.example/api/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enableObservability: false, observabilityEnabled: false, observabilitySource: "settings" }),
    }));
    expect(response.status).toBe(200);
    expect(updateSettings).toHaveBeenCalledWith({});
    expect(state.settings.enableObservability).toBe(true);
  });
});

function mutation(body, contentType = "application/json") {
  return new Request("http://gateway.example/api/settings/observability", {
    method: "PATCH", headers: { "Content-Type": contentType }, body: JSON.stringify(body),
  });
}

describe("observability writes use a dedicated authenticated boundary", () => {
  it("requires an actual session or CLI proof even when dashboard login is disabled", async () => {
    state.settings.requireLogin = false;
    state.authorized = false;
    expect((await patchObservability(mutation({ enableObservability: false }))).status).toBe(401);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("persists the preference for a valid session and returns effective metadata without credentials", async () => {
    state.settings.oidcClientSecret = "must-not-leak";
    const response = await patchObservability(mutation({ enableObservability: false }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ enableObservability: false, observabilityEnabled: false, observabilitySource: "settings" });
    expect(updateSettings).toHaveBeenCalledWith({ enableObservability: false });
  });

  it("accepts CLI proof but never overrides the effective environment flag", async () => {
    state.authorized = false;
    state.cli = true;
    vi.stubEnv("OBSERVABILITY_ENABLED", "false");
    vi.stubEnv("ENABLE_REQUEST_LOGS", "true");
    const response = await patchObservability(mutation({ enableObservability: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enableObservability: true, observabilityEnabled: false, observabilitySource: "OBSERVABILITY_ENABLED" });
    expect(state.settings.enableObservability).toBe(true);
  });

  it.each([null, [], {}, { enableObservability: "false" }, { enableObservability: 0 },
    { enableObservability: true, requireLogin: false }, { enableObservability: true, observabilitySource: "settings" }])(
    "rejects non-Boolean or extra settings: %j", async payload => {
      expect((await patchObservability(mutation(payload))).status).toBe(400);
      expect(updateSettings).not.toHaveBeenCalled();
    },
  );

  it("rejects simple form media types before changing sensitive recording preferences", async () => {
    expect((await patchObservability(mutation({ enableObservability: false }, "text/plain"))).status).toBe(415);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without writing anything", async () => {
    expect((await patchObservability(new Request("http://gateway.example/api/settings/observability", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{",
    }))).status).toBe(400);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("does not reflect persistence errors or report a failed write as saved", async () => {
    updateSettings.mockRejectedValueOnce(new Error("secret-bearing storage detail"));
    const response = await patchObservability(mutation({ enableObservability: false }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to update observability settings" });
    expect(state.settings.enableObservability).toBe(true);
  });
});
