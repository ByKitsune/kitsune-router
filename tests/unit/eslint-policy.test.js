import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import config from "../../eslint.config.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: config });

async function messages(source, file = "src/lint-policy-fixture.jsx") {
  const results = await eslint.lintText(source, { filePath: file });
  return results.flatMap((result) => result.messages);
}

const component = (body) => `export default function Example() { return (${body}); }`;
const navigationMessages = (findings) => findings.filter((finding) =>
  finding.ruleId?.endsWith("/no-location-assign-relative-destination"));

describe("ESLint application policy", () => {
  it.each([
    ["react/jsx-key", "export default function Example() { return [1, 2].map((value) => <span>{value}</span>); }"],
    ["react/jsx-no-undef", component("<MissingComponent />")],
    ["react/jsx-no-duplicate-props", component('<div id="first" id="second" />')],
    ["react/no-unescaped-entities", component("<p>don't</p>")],
  ])("keeps %s as an error", async (ruleId, source) => {
    const findings = await messages(source);
    expect(findings.some((message) => message.fatal)).toBe(false);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId, severity: 2 }),
    ]));
  });

  it.each([
    ["jsx-a11y/alt-text", '<img src="/fixture.png" />'],
    ["jsx-a11y/alt-text", '<Image src="/fixture.png" />'],
    ["jsx-a11y/aria-props", '<div aria-labl="fixture" />'],
    ["jsx-a11y/aria-proptypes", '<div aria-hidden="maybe" />'],
    ["jsx-a11y/aria-unsupported-elements", '<meta aria-hidden="true" />'],
    ["jsx-a11y/role-has-required-aria-props", '<div role="checkbox" />'],
    ["jsx-a11y/role-supports-aria-props", '<div role="heading" aria-checked="true" />'],
  ])("keeps %s as a warning", async (ruleId, jsx) => {
    const findings = await messages(`import Image from "next/image"; ${component(jsx)}`);
    expect(findings.some((message) => message.fatal)).toBe(false);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId, severity: 1 }),
    ]));
  });

  it("keeps conditional hooks as errors", async () => {
    const findings = await messages('import { useState } from "react"; export default function Example({ enabled }) { if (enabled) useState(0); return null; }');
    expect(findings.some((message) => message.fatal)).toBe(false);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "react-hooks/rules-of-hooks", severity: 2 }),
    ]));
  });

  it.each([
    ["react-hooks/exhaustive-deps", 'import { useEffect } from "react"; export default function Example({ value }) { useEffect(() => { console.log(value); }, []); return null; }'],
    ["react-hooks/immutability", 'export default function Example(props) { props.value = 1; return <p>{props.value}</p>; }'],
    ["react-hooks/set-state-in-effect", 'import { useEffect, useState } from "react"; export default function Example() { const [value, setValue] = useState(0); useEffect(() => { setValue(1); }, []); return <p>{value}</p>; }'],
  ])("keeps the existing %s warning severity", async (ruleId, source) => {
    const findings = await messages(source);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId, severity: 1 }),
    ]));
  });

  it("does not enable unrelated React, core, or accessibility policies", async () => {
    const findings = await messages('const unused = 1; debugger; export default function Example({ label }) { return <a target="_blank" href="https://example.com" unknown="value">{label}</a>; }');
    expect(findings).toEqual([]);
  });

  it("keeps anonymous exports as warnings outside the existing data-module exemptions", async () => {
    const findings = await messages("export default {};", "src/shared/lint-policy-fixture.js");
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "import/no-anonymous-default-export", severity: 1 }),
    ]));
    for (const file of ["open-sse/lint-policy-fixture.js", "src/lib/lint-policy-fixture.js"]) {
      expect(await messages("export default {};", file)).toEqual([]);
    }
  });

  it.each(["src/shared/lint-policy-fixture.js", "open-sse/lint-policy-fixture.js"])("catches undefined identifiers in %s", async (file) => {
    const findings = await messages("export function example() { return missingRuntimeBinding; }", file);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "no-undef", severity: 2 }),
    ]));
  });

  it("does not broaden no-undef to standalone scripts", async () => {
    expect(await messages("externalScriptGlobal();", "scripts/lint-policy-fixture.mjs")).toEqual([]);
  });

  it("retains browser, Node, and modern ESM globals", async () => {
    const findings = await messages('export const globals = [window, document, self, location, process, console, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, AbortSignal, Response, Request, Headers, fetch, setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, queueMicrotask, structuredClone, crypto, globalThis]; await Promise.resolve();');
    expect(findings).toEqual([]);
  });

  it("accepts the CLI's CommonJS top-level return without weakening ESM parsing", async () => {
    const cli = await messages("const fs = require('node:fs'); if (!fs) return; module.exports = fs;", "cli/cli.js");
    expect(cli).toEqual([]);
    const esm = await messages("return; export default {};", "src/shared/lint-policy-fixture.js");
    expect(esm.some((message) => message.fatal)).toBe(true);
  });

  it.each([".next", ".next-cli-build", "out", "build"])("ignores nested %s build output", async (directory) => {
    const findings = await messages("not valid JavaScript", `gitbook/${directory}/lint-policy-fixture.js`);
    expect(findings.some((message) => message.fatal)).toBe(false);
    expect(findings.every((message) => message.ruleId === null && /ignored/i.test(message.message))).toBe(true);
  });
});

describe("internal navigation policy", () => {
  it.each([
    ['location.assign("/dashboard");'],
    ['location["assign"]("../dashboard");'],
    ['location.href = "dashboard";'],
    ['location["href"] = "?tab=providers";'],
    ['window.location.assign("/dashboard");'],
    ['globalThis.location.assign("/dashboard");'],
    ['document.location.assign("/dashboard");'],
    ['self.location.assign("/dashboard");'],
    ['window["location"]["assign"]("/dashboard");'],
    ['globalThis["location"].href = "/dashboard";'],
    ['document.location["href"] = "#providers";'],
    ['self["location"]["href"] = "";'],
    ['const target = "/dashboard"; location.assign(target);'],
    ['const prefix = "/dashboard/"; const target = prefix + "providers"; location.href = target;'],
    ['export function navigate(value) { location.assign(`/dashboard/${value}`); }'],
    ['export function navigate(value) { location.href = "/dashboard/" + value; }'],
    ['export function navigate(value) { const target = `/dashboard/${value}`; location.assign(target); }'],
    ['export function navigate(value) { let target = "https://example.com"; target = "/dashboard/" + value; location.assign(target); }'],
  ])("warns for relative navigation: %s", async (source) => {
    const findings = await messages(source);
    expect(findings.some((message) => message.fatal)).toBe(false);
    expect(navigationMessages(findings)).toEqual([
      expect.objectContaining({ severity: 1 }),
    ]);
  });

  it.each([
    ['location.assign("https://example.com/dashboard");'],
    ['window.location.href = "HTTPS://example.com/dashboard";'],
    ['globalThis.location.assign("//example.com/dashboard");'],
    ['document.location.href = "mailto:support@example.com";'],
    ['self.location.assign("custom+scheme:destination");'],
    ['export function navigate(value) { location.assign(`https://example.com/${value}`); }'],
    ['export function navigate(value) { location.href = "https://example.com/" + value; }'],
    ['export function navigate(value) { const target = "https://example.com/" + value; location.assign(target); }'],
    ['export function navigate(value) { let target = "/dashboard"; target = "https://example.com/" + value; location.assign(target); }'],
    ['export function navigate(location) { location.assign("/dashboard"); location.href = "/dashboard"; }'],
    ['export function navigate(window) { window.location.assign("/dashboard"); }'],
    ['export function navigate(globalThis) { globalThis.location.href = "/dashboard"; }'],
    ['export function navigate(document) { document["location"]["assign"]("/dashboard"); }'],
    ['export function navigate(self) { self.location.href = "/dashboard"; }'],
    ['{ const location = { assign() {} }; location.assign("/dashboard"); }'],
    ['const client = { location: { assign() {} } }; client.location.assign("/dashboard");'],
    ['const method = "assign"; location[method]("/dashboard");'],
    ['export function navigate(target) { location.assign(target); }'],
    ['export function navigate(args) { location.assign(...args); }'],
    ['location.assign();'],
  ])("allows external, shadowed, or unproven navigation: %s", async (source) => {
    const findings = await messages(source);
    expect(findings.some((message) => message.fatal)).toBe(false);
    expect(navigationMessages(findings)).toEqual([]);
  });

  it("supports explicit project-rule exceptions without pretending to be the Next plugin", async () => {
    const findings = await messages('// eslint-disable-next-line kitsunerouter/no-location-assign-relative-destination\nwindow.location.assign("/login");');
    expect(findings).toEqual([]);
  });

  it("does not crash on cyclic destination assignments", async () => {
    const findings = await messages('let target; target = target; location.assign(target);');
    expect(findings).toEqual([]);
  });
});
