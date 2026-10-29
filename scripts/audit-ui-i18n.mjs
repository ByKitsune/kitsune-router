#!/usr/bin/env node
// Inventory source UI literals and measure actual dictionary coverage. Missing
// strings remain explicit; this does not generate or claim verified translations.
import fs from "node:fs";
import path from "node:path";
import { parse } from "espree";
import { LOCALES } from "../src/i18n/config.js";
import { DYNAMIC_UI_MESSAGES } from "../src/i18n/dynamicMessages.js";

const root = path.resolve(import.meta.dirname, "..");
const messages = new Map();
const attributeNames = new Set(["title", "placeholder", "aria-label", "aria-description", "alt", "label", "description", "subtitle", "emptyMessage", "message", "confirmText", "cancelText", "confirmLabel", "helpText"]);
function add(value, file, line) {
  if (typeof value !== "string") return;
  const message = value.replace(/\s+/g, " ").trim();
  if (!/[A-Za-z]{2}/.test(message) || /^https?:|^\/[A-Za-z]|^[A-Z0-9_]+$/.test(message)
    || /^[a-z0-9_.:@/+-]+$/.test(message) || /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(message)
    || /^(?:#|var\(|rgba?\(|[0-9.]+px|width=|bg-|text-|border-|rounded-|flex\s|grid\s|custom:)/.test(message) || ["ArrowDown", "ArrowUp", "Enter", "Escape", "Content-Type"].includes(message)) return;
  const entries = messages.get(message) || [];
  entries.push(`${file}:${line}`);
  messages.set(message, entries);
}
function walk(node, file, skipped = false, uiContext = false) {
  if (!node || typeof node !== "object") return;
  if (node.type === "JSXElement") {
    const element = node.openingElement;
    const name = element.name?.name;
    skipped ||= ["code", "pre", "script", "style", "kbd", "samp"].includes(name)
      || element.attributes.some((attribute) => attribute.name?.name === "data-i18n-skip");
  }
  if (node.type === "JSXAttribute") {
    if (!attributeNames.has(node.name?.name)) return;
    uiContext = true;
  }
  else if (node.type === "JSXExpressionContainer" && !skipped) uiContext = true;
  else if (node.type === "CallExpression" && /^(?:setError|setMessage|showToast|alert|confirm|translate)$/.test(node.callee?.name || "")) uiContext = true;
  if (!skipped) {
    if (uiContext && node.type === "Literal") add(node.value, file, node.loc.start.line);
    if (node.type === "JSXText") add(node.value, file, node.loc.start.line);
    if (node.type === "JSXAttribute" && attributeNames.has(node.name?.name)) {
      add(node.value?.type === "Literal" ? node.value.value : node.value?.expression?.value, file, node.loc.start.line);
    }
    if (node.type === "Property" && attributeNames.has(node.key?.name || node.key?.value)) add(node.value?.value, file, node.loc.start.line);
    if (node.type === "CallExpression" && node.callee?.name === "translate") add(node.arguments[0]?.value, file, node.loc.start.line);
  }
  for (const [key, child] of Object.entries(node)) {
    if (["loc", "range", "tokens", "comments"].includes(key)) continue;
    if (Array.isArray(child)) child.forEach((entry) => walk(entry, file, skipped, uiContext));
    else if (child && typeof child === "object") walk(child, file, skipped, uiContext);
  }
}
function inspect(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "api") inspect(file); }
    else if (/\.(?:js|jsx)$/.test(file)) {
      const ast = parse(fs.readFileSync(path.join(root, file), "utf8"), { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, loc: true });
      walk(ast, file);
    }
  }
}
inspect("src/app");
inspect("src/shared/components");
for (const key of DYNAMIC_UI_MESSAGES) messages.set(key, ["src/i18n/dynamicMessages.js"]);
const coverage = [];
for (const locale of LOCALES.filter((value) => value !== "en")) {
  const dictionary = JSON.parse(fs.readFileSync(path.join(root, `public/i18n/literals/${locale}.json`), "utf8"));
  const missing = [...messages.keys()].filter((message) => !Object.hasOwn(dictionary, message)).sort();
  coverage.push({ locale, dictionaryKeys: Object.keys(dictionary).length, sourceLiterals: messages.size, translated: messages.size - missing.length, missing: missing.length, missingLiterals: missing });
}
const report = {
  scope: "Static text/accessible attributes/component UI labels in src/app (excluding APIs) and src/shared/components; excludes marked identity/code regions. Dynamic/backend strings and linguistic quality require separate review.",
  sourceLiterals: messages.size,
  coverage,
  source: Object.fromEntries([...messages.entries()].sort(([a], [b]) => a.localeCompare(b))),
};
const catalogPath = path.join(root, "public/i18n/literals/en.json");
const sourceCatalog = Object.fromEntries([...messages.keys()].sort().map((message) => [message, message]));
if (process.argv.includes("--write-catalog")) fs.writeFileSync(catalogPath, `${JSON.stringify(sourceCatalog, null, 2)}\n`);
if (process.argv.includes("--check")) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const missingRegistration = Object.keys(sourceCatalog).filter((key) => catalog[key] !== key);
  const missingIndonesian = coverage.find((row) => row.locale === "id").missingLiterals;
  const invalidTemplates = [];
  for (const locale of LOCALES.filter((value) => value !== "en")) {
    const dictionary = JSON.parse(fs.readFileSync(path.join(root, `public/i18n/literals/${locale}.json`), "utf8"));
    for (const [key, value] of Object.entries(dictionary)) {
      const parameters = (text) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort().join(",");
      if (parameters(key) !== parameters(value)) invalidTemplates.push(`${locale}: ${key}`);
    }
  }
  if (missingRegistration.length || missingIndonesian.length || invalidTemplates.length) {
    console.error(JSON.stringify({ missingRegistration, missingIndonesian, invalidTemplates }, null, 2));
    process.exitCode = 1;
  }
}
const outputAt = process.argv.indexOf("--json");
if (outputAt !== -1) {
  if (!process.argv[outputAt + 1]) throw new Error("--json requires a file path");
  fs.writeFileSync(process.argv[outputAt + 1], `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ sourceLiterals: messages.size, coverage: coverage.map(({ missingLiterals: _missing, ...row }) => row) }, null, 2));
