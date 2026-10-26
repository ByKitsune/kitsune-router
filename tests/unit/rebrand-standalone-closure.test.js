import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyStandaloneRuntimeAssets } from "../../scripts/copy-standalone-assets.mjs";

const fixtures = [];
afterEach(() => { for (const directory of fixtures.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

describe("rebranded standalone boot dependency closure", () => {
  it("retains missing framework metadata helpers without copying the compiler tree", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-runtime-closure-"));
    fixtures.push(root);
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
