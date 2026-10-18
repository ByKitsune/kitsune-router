import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../..", import.meta.url));
const configPath = join(root, ".oxlintrc.json");
const component = (jsx) => `export default function Example() { return (${jsx}); }`;
let fixtureRoot;
let oxlint;

function writeFixture(file, source) {
  const path = join(fixtureRoot, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  return path;
}

function lint(source, file = "components/Example.jsx") {
  const path = writeFixture(file, source);
  const result = spawnSync(process.execPath, [oxlint, "--config", configPath, "--format", "json", path], {
    cwd: fixtureRoot,
    encoding: "utf8",
    timeout: 20000,
  });
  if (result.error) throw result.error;
  expect(result.signal).toBeNull();
  expect([0, 1]).toContain(result.status);
  const report = JSON.parse(result.stdout);
  expect(report.number_of_files).toBe(1);
  expect(report.diagnostics.every((finding) => finding.code?.startsWith("next("))).toBe(true);
  return report.diagnostics;
}

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "zenrouter-next-lint-"));
  const packagePath = require.resolve("oxlint/package.json");
  const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
  oxlint = join(dirname(packagePath), metadata.bin.oxlint);
  writeFixture("pages/about.jsx", "export default function About() { return null; }");
  writeFixture("app/dashboard/page.jsx", "export default function Dashboard() { return null; }");
});

afterAll(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("native Next policy preservation", () => {
  it.each([
    ["google-font-display", "warning", component('<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />')],
    ["google-font-preconnect", "warning", component('<link href="https://fonts.gstatic.com" rel="preload" />')],
    ["next-script-for-ga", "warning", component('<script async src="https://www.googletagmanager.com/gtag/js?id=fixture" />')],
    ["no-async-client-component", "warning", '"use client"; export default async function Example() { return <div />; }'],
    ["no-before-interactive-script-outside-document", "warning", 'import Script from "next/script"; ' + component('<Script src="/fixture.js" strategy="beforeInteractive" />')],
    ["no-css-tags", "warning", component('<link href="/fixture.css" rel="stylesheet" />')],
    ["no-head-element", "warning", component("<head><meta charSet=\"utf-8\" /></head>")],
    ["no-html-link-for-pages", "error", component('<a href="/about">About</a>')],
    ["no-img-element", "warning", component('<img src="/fixture.png" alt="fixture" />')],
    ["no-page-custom-font", "warning", 'import Head from "next/head"; ' + component('<Head><link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" /></Head>'), "pages/index.jsx"],
    ["no-styled-jsx-in-document", "warning", 'import Document from "next/document"; export default class Example extends Document { render() { return <style jsx>{`body { color: red; }`}</style>; } }', "pages/_document.jsx"],
    ["no-sync-scripts", "error", component('<script src="/fixture.js" />')],
    ["no-title-in-document-head", "warning", 'import { Head } from "next/document"; ' + component("<Head><title>Fixture</title></Head>"), "pages/_document.jsx"],
    ["no-typos", "warning", 'export default function Page() { return null; } export async function getStaticpaths() { return {}; }', "pages/typo.jsx"],
    ["no-unwanted-polyfillio", "warning", component('<script async src="https://polyfill.io/v3/polyfill.min.js?features=Promise" />')],
    ["inline-script-id", "error", 'import Script from "next/script"; ' + component('<Script>{`console.log("fixture");`}</Script>')],
    ["no-assign-module-variable", "error", 'const module = "fixture"; export { module };'],
    ["no-document-import-in-page", "error", 'import Document from "next/document"; export default Document;', "pages/invalid-document.jsx"],
    ["no-duplicate-head", "error", 'import Document, { Head, Html } from "next/document"; export default class Example extends Document { render() { return <Html><Head /><Head /></Html>; } }', "pages/_document.jsx"],
    ["no-head-import-in-document", "error", 'import Head from "next/head"; ' + component("<Head />"), "pages/_document.jsx"],
    ["no-script-component-in-head", "error", 'import Head from "next/head"; import Script from "next/script"; ' + component('<Head><Script src="/fixture.js" /></Head>')],
  ])("keeps %s at its existing %s severity", (rule, severity, source, file) => {
    expect(lint(source, file)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: `next(${rule})`, severity }),
    ]));
  });

  it("checks app-router internal links too", () => {
    expect(lint(component('<a href="/dashboard">Dashboard</a>'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "next(no-html-link-for-pages)", severity: "error" }),
    ]));
  });

  it("does not enable Oxlint's unrelated default correctness rules", () => {
    expect(lint("const unused = 1; debugger; const duplicate = { key: 1, key: 2 };", "default-rules.js")).toEqual([]);
  });

  it("allows optimized scripts and framework navigation", () => {
    const source = 'import Link from "next/link"; import Script from "next/script"; import Image from "next/image"; ' + component('<><Link href="/about">About</Link><a href="https://example.com">External</a><Script src="/fixture.js" /><Script id="fixture">{`console.log("fixture");`}</Script><Image src="/fixture.png" alt="fixture" width={1} height={1} /></>');
    expect(lint(source)).toEqual([]);
  });

  it("honors focused native exceptions", () => {
    expect(lint('// oxlint-disable-next-line nextjs/no-img-element\n' + component('<img src="/fixture.png" alt="fixture" />'))).toEqual([]);
  });
});

describe("composed lint command", () => {
  let commandFixtures;

  beforeAll(() => {
    commandFixtures = mkdtempSync(join(root, "tests", "lint command fixtures "));
    writeFileSync(join(commandFixtures, "native warning.jsx"), component('<img src="/fixture.png" alt="fixture" />'));
    writeFileSync(join(commandFixtures, "eslint warning.js"), "export default {};");
    writeFileSync(join(commandFixtures, "both warnings.jsx"), component('<img src="/fixture.png" />'));
    writeFileSync(join(commandFixtures, "clean.jsx"), component("<p>Fixture</p>"));
  });

  afterAll(() => {
    if (commandFixtures) rmSync(commandFixtures, { recursive: true, force: true });
  });

  function run(file, args = []) {
    const result = spawnSync(process.execPath, [join(root, "scripts", "lint.mjs"), join(commandFixtures, file), ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    if (result.error) throw result.error;
    expect(result.signal).toBeNull();
    return { status: result.status, output: result.stdout + result.stderr };
  }

  it.each(["native warning.jsx", "eslint warning.js"])("preserves warning-only success for %s", (file) => {
    expect(run(file).status).toBe(0);
  });

  it.each([
    ["native warning.jsx", ["--max-warnings=0"], "no-img-element"],
    ["eslint warning.js", ["--max-warnings=0"], "import/no-anonymous-default-export"],
    ["native warning.jsx", ["--max-warnings", "0"], "no-img-element"],
    ["eslint warning.js", ["--max-warnings", "0"], "import/no-anonymous-default-export"],
  ])("enforces zero-warning policy for %s (%j)", (file, args, rule) => {
    const result = run(file, args);
    expect(result.status).toBe(1);
    expect(result.output).toContain(rule);
  });

  it("reports both linters even when the native stage fails zero-warning policy", () => {
    const result = run("both warnings.jsx", ["--max-warnings=0"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("no-img-element");
    expect(result.output).toContain("jsx-a11y/alt-text");
  });

  it("handles literal paths containing spaces without a shell", () => {
    expect(run("clean.jsx", ["--max-warnings=0"]).status).toBe(0);
  });
});
