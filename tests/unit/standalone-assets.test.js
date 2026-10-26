import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { copyStandaloneAssets } from "../../scripts/copy-standalone-assets.mjs";

const fixtures = [];

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function createBuildFixture(distDir) {
  const projectRoot = mkdtempSync(join(tmpdir(), "kitsunerouter-standalone-assets-"));
  const buildRoot = join(projectRoot, distDir);
  fixtures.push(projectRoot);
  mkdirSync(join(buildRoot, "standalone"), { recursive: true });
  mkdirSync(join(buildRoot, "static", "chunks"), { recursive: true });
  mkdirSync(join(projectRoot, "public"), { recursive: true });
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

  it("does not modify workspace-traced CLI builds", () => {
    const projectRoot = createBuildFixture(".next-cli-build");
    const previousMode = process.env.NEXT_TRACING_ROOT_MODE;
    process.env.NEXT_TRACING_ROOT_MODE = "workspace";

    try {
      copyStandaloneAssets({ projectRoot, distDir: ".next-cli-build" });
    } finally {
      if (previousMode === undefined) delete process.env.NEXT_TRACING_ROOT_MODE;
      else process.env.NEXT_TRACING_ROOT_MODE = previousMode;
    }

    expect(() => readFileSync(join(projectRoot, ".next-cli-build", "standalone", ".next-cli-build", "static", "chunks", "app.js")))
      .toThrow();
  });
});
