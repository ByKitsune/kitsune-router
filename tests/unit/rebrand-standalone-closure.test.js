import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { copyStandaloneRuntimeAssets } from "../../scripts/copy-standalone-assets.mjs";

const fixtures = [];
afterEach(() => { for (const directory of fixtures.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

function addReflectFixture(project) {
  const source = path.join(project, "node_modules/reflect-metadata");
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ name: "reflect-metadata", main: "Reflect.js" }));
  fs.writeFileSync(path.join(source, "Reflect.js"), "module.exports = 'standalone reflect fixture';");
}

describe("rebranded standalone boot dependency closure", () => {
  it("retains the external reflect-metadata package needed by dashboard server pages", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-runtime-closure-"));
    fixtures.push(root);
    const project = path.join(root, "project");
    addReflectFixture(project);
    const output = path.join(root, "output");
    fs.mkdirSync(output, { recursive: true });

    copyStandaloneRuntimeAssets({ projectRoot: project, standaloneDir: output });

    const result = spawnSync(process.execPath, ["-e", "if (require('reflect-metadata') !== 'standalone reflect fixture') process.exit(2)"], {
      cwd: output,
      env: { PATH: process.env.PATH, HOME: root, NODE_PATH: "" },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it("refuses to package an incomplete required dependency", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-runtime-closure-"));
    fixtures.push(root);
    expect(() => copyStandaloneRuntimeAssets({ projectRoot: root, standaloneDir: path.join(root, "output") }))
      .toThrow(/reflect-metadata is missing/);
  });

  it("retains missing framework metadata helpers without copying the compiler tree", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-runtime-closure-"));
    fixtures.push(root);
    addReflectFixture(root);
    const metadata = path.join(root, "node_modules/next/dist/lib/metadata");
    fs.mkdirSync(metadata, { recursive: true });
    fs.writeFileSync(path.join(metadata, "get-metadata-route.js"), "module.exports = require('./is-metadata-route');");
    fs.writeFileSync(path.join(metadata, "is-metadata-route.js"), "module.exports = { fixture: true };");
    const compiler = path.join(root, "node_modules/next/dist/build");
    fs.mkdirSync(compiler, { recursive: true });
    fs.writeFileSync(path.join(compiler, "compiler.js"), "build-only code");
    const output = path.join(root, "output");
    copyStandaloneRuntimeAssets({ projectRoot: root, standaloneDir: output });
    const runtime = path.join(output, "node_modules/next/dist/lib/metadata");
    expect(fs.readFileSync(path.join(runtime, "get-metadata-route.js"), "utf8")).toContain("require('./is-metadata-route')");
    expect(fs.existsSync(path.join(runtime, "is-metadata-route.js"))).toBe(true);
    expect(fs.existsSync(path.join(output, "node_modules/next/dist/build/compiler.js"))).toBe(false);
  });
});

describe("native dialog lifecycle after the rebrand", () => {
  it("closes a mounted dialog so the browser can restore focus rather than removing the open element", () => {
    const source = fs.readFileSync(new URL("../../src/shared/components/Modal.js", import.meta.url), "utf8");
    expect(source).toContain("dialog.showModal()");
    expect(source).toContain("dialog.close()");
    expect(source).not.toContain("if (!isOpen) return null");
    expect(source).not.toContain("onCancel=");
  });
});

describe("small-screen endpoint controls", () => {
  it("allows key rows and values to wrap instead of colliding with enable/delete controls", () => {
    const source = fs.readFileSync(new URL("../../src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js", import.meta.url), "utf8");
    expect(source).toContain("flex min-w-0 flex-col gap-3");
    expect(source).toContain("sm:flex-row sm:items-center sm:justify-between");
    expect(source).toContain("min-w-0 max-w-full break-all");
    expect(source).toContain("flex shrink-0 items-center gap-2 self-end sm:self-auto");
  });
});
