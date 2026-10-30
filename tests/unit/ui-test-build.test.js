import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { resolveUiTestServer } from "../../scripts/ui-test-build.mjs";

const directories = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture(dist, nested = false) {
  const root = mkdtempSync(join(tmpdir(), "kitsune-ui-build-"));
  directories.push(root);
  const output = join(root, dist, "standalone", ...(nested ? [basename(root)] : []));
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "custom-server.js"), "// synthetic wrapper");
  writeFileSync(join(output, "server.js"), "// synthetic Next build");
  return { root, server: join(output, "custom-server.js") };
}

describe("isolated browser fixture build selection", () => {
  it.each([[".next", false], [".next-cli-build", false], [".next-cli-build", true]])("uses the selected %s production build (workspace=%s)", (dist, nested) => {
    const { root, server } = fixture(dist, nested);
    expect(resolveUiTestServer(root, dist)).toBe(server);
  });
  it("does not silently use a default build when an isolated build is requested", () => {
    const { root } = fixture(".next");
    expect(() => resolveUiTestServer(root, ".next-cli-build")).toThrow("production build in .next-cli-build");
  });
  it("refuses embedded operator environments in an alternate build", () => {
    const { root, server } = fixture(".next-cli-build", true);
    writeFileSync(join(dirname(server), ".env.local"), "SYNTHETIC=not-a-real-secret");
    expect(() => resolveUiTestServer(root, ".next-cli-build")).toThrow("containing .env files");
  });
  it("refuses an output outside the checkout", () => {
    const { root } = fixture(".next");
    expect(() => resolveUiTestServer(root, "../external-build")).toThrow("inside the project checkout");
  });
  it.skipIf(process.platform === "win32").each(["custom-server.js", "server.js"])("does not follow a %s symlink outside the checkout", filename => {
    const { root, server } = fixture(".next-cli-build");
    const foreign = fixture(".next-cli-build");
    const target = join(dirname(server), filename);
    rmSync(target);
    symlinkSync(join(dirname(foreign.server), filename), target);
    expect(() => resolveUiTestServer(root, ".next-cli-build")).toThrow("remain inside the project checkout");
  });
});
