import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { copyStandaloneAssets } from "../../scripts/copy-standalone-assets.mjs";
import { resolveUiTestServer } from "../../scripts/ui-test-build.mjs";

const fixtures = [];

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function createBuildFixture(distDir, nested = false) {
  const projectRoot = mkdtempSync(join(tmpdir(), "kitsunerouter-standalone-assets-"));
  const buildRoot = join(projectRoot, distDir);
  fixtures.push(projectRoot);
  const output = join(buildRoot, "standalone", ...(nested ? [basename(projectRoot)] : []));
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "server.js"), "generated Next server");
  mkdirSync(join(buildRoot, "static", "chunks"), { recursive: true });
  mkdirSync(join(projectRoot, "public"), { recursive: true });
  mkdirSync(join(projectRoot, "node_modules", "reflect-metadata"), { recursive: true });
  writeFileSync(join(projectRoot, "node_modules", "reflect-metadata", "package.json"), '{"name":"reflect-metadata","main":"Reflect.js"}');
  writeFileSync(join(projectRoot, "node_modules", "reflect-metadata", "Reflect.js"), "module.exports = {};");
  writeFileSync(join(buildRoot, "static", "chunks", "app.js"), "static asset");
  writeFileSync(join(projectRoot, "public", "favicon.svg"), "public asset");
  return projectRoot;
}

describe("standalone build assets", () => {
  it("copies static and public assets into the default standalone layout", () => {
    const projectRoot = createBuildFixture(".next");

    copyStandaloneAssets({ projectRoot, distDir: ".next" });

    expect(readFileSync(join(projectRoot, ".next", "standalone", ".next", "static", "chunks", "app.js"), "utf8"))
      .toBe("static asset");
    expect(readFileSync(join(projectRoot, ".next", "standalone", "public", "favicon.svg"), "utf8"))
      .toBe("public asset");
  });

  it("uses a custom Next dist directory", () => {
    const projectRoot = createBuildFixture(".next-cli-build");

    copyStandaloneAssets({ projectRoot, distDir: ".next-cli-build" });

    expect(readFileSync(join(projectRoot, ".next-cli-build", "standalone", ".next-cli-build", "static", "chunks", "app.js"), "utf8"))
      .toBe("static asset");
  });

  it("copies the request-sanitizing wrapper and shared shutdown lifecycle into standalone output", () => {
    const projectRoot = createBuildFixture(".next");
    writeFileSync(join(projectRoot, "custom-server.js"), "wrapper");
    writeFileSync(join(projectRoot, "shutdown-lifecycle.cjs"), "lifecycle");

    copyStandaloneAssets({ projectRoot, distDir: ".next" });

    expect(readFileSync(join(projectRoot, ".next", "standalone", "custom-server.js"), "utf8"))
      .toBe("wrapper");
    expect(readFileSync(join(projectRoot, ".next", "standalone", "shutdown-lifecycle.cjs"), "utf8"))
      .toBe("lifecycle");
  });

  it("starts background refresh from Next instrumentation rather than an untraced raw import", () => {
    const wrapper = readFileSync(new URL("../../custom-server.js", import.meta.url), "utf8");
    const instrumentation = readFileSync(new URL("../../src/instrumentation.js", import.meta.url), "utf8");
    expect(wrapper).not.toContain("startBackgroundTokenRefreshFromCustomServer");
    expect(wrapper).not.toContain('"backgroundTokenRefresh.js"');
    expect(instrumentation).toContain('import("@/sse/services/backgroundTokenRefresh.js")');
    expect(instrumentation).toContain("startBackgroundTokenRefresh()");
  });

  it("preserves the raw MITM child's relative certificate and handler modules in standalone output", () => {
    const projectRoot = createBuildFixture(".next");
    mkdirSync(join(projectRoot, "src", "mitm", "cert"), { recursive: true });
    mkdirSync(join(projectRoot, "src", "mitm", "handlers"), { recursive: true });
    writeFileSync(join(projectRoot, "src", "mitm", "server.js"), "raw child entry");
    writeFileSync(join(projectRoot, "src", "mitm", "cert", "rootCA.js"), "certificate signer");
    writeFileSync(join(projectRoot, "src", "mitm", "handlers", "cursor.js"), "child handler");

    copyStandaloneAssets({ projectRoot, distDir: ".next" });

    const mitm = join(projectRoot, ".next", "standalone", "src", "mitm");
    expect(readFileSync(join(mitm, "server.js"), "utf8")).toBe("raw child entry");
    expect(readFileSync(join(mitm, "cert", "rootCA.js"), "utf8")).toBe("certificate signer");
    expect(readFileSync(join(mitm, "handlers", "cursor.js"), "utf8")).toBe("child handler");
  });

  it("completes nested workspace output beside its generated server for the browser fixture", () => {
    const projectRoot = createBuildFixture(".next-cli-build", true);
    const standaloneRoot = join(projectRoot, ".next-cli-build", "standalone");
    const output = join(standaloneRoot, basename(projectRoot));
    writeFileSync(join(projectRoot, "custom-server.js"), "wrapper");
    writeFileSync(join(projectRoot, "shutdown-lifecycle.cjs"), "lifecycle");
    const sharedModule = join(standaloneRoot, "node_modules", "shared-dependency");
    mkdirSync(sharedModule, { recursive: true });
    writeFileSync(join(sharedModule, "index.js"), "hoisted dependency");
    expect(() => resolveUiTestServer(projectRoot, ".next-cli-build")).toThrow("production build");
    const previousMode = process.env.NEXT_TRACING_ROOT_MODE;
    process.env.NEXT_TRACING_ROOT_MODE = "workspace";
    try {
      copyStandaloneAssets({ projectRoot, distDir: ".next-cli-build" });
      copyStandaloneAssets({ projectRoot, distDir: ".next-cli-build" });
    } finally {
      if (previousMode === undefined) delete process.env.NEXT_TRACING_ROOT_MODE;
      else process.env.NEXT_TRACING_ROOT_MODE = previousMode;
    }
    expect(resolveUiTestServer(projectRoot, ".next-cli-build")).toBe(join(output, "custom-server.js"));
    expect(readFileSync(join(output, "server.js"), "utf8")).toBe("generated Next server");
    expect(readFileSync(join(output, "shutdown-lifecycle.cjs"), "utf8")).toBe("lifecycle");
    expect(readFileSync(join(output, ".next-cli-build", "static", "chunks", "app.js"), "utf8")).toBe("static asset");
    expect(readFileSync(join(output, "public", "favicon.svg"), "utf8")).toBe("public asset");
    expect(readFileSync(join(sharedModule, "index.js"), "utf8")).toBe("hoisted dependency");
    expect(existsSync(join(output, "node_modules", "reflect-metadata", "Reflect.js"))).toBe(true);
    expect(existsSync(join(standaloneRoot, "custom-server.js"))).toBe(false);
  });

  it("rejects private state already traced beside a nested workspace build", () => {
    const projectRoot = createBuildFixture(".next-cli-build", true);
    const output = join(projectRoot, ".next-cli-build", "standalone", basename(projectRoot));
    writeFileSync(join(output, ".env.local"), "SYNTHETIC=fixture-only");
    expect(() => copyStandaloneAssets({ projectRoot, distDir: ".next-cli-build" })).toThrow("Refusing runtime state");
    expect(() => resolveUiTestServer(projectRoot, ".next-cli-build")).toThrow();
  });

  it("does not manufacture runtime assets in an output without a generated server", () => {
    const projectRoot = createBuildFixture(".next-cli-build");
    rmSync(join(projectRoot, ".next-cli-build", "standalone", "server.js"));
    expect(() => copyStandaloneAssets({ projectRoot, distDir: ".next-cli-build" }))
      .toThrow("Generated standalone server.js is missing");
  });
});
