import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const dirs = [];
const sha = "a".repeat(40);
const version = "0.9.7";
const integrity = bytes => "sha512-" + createHash("sha512").update(bytes).digest("base64");
const tarball = `bykitsune-router-${version}-${sha}.tgz`;
const artifactName = `npm-release-${version}-${sha}`;
const bytes = Buffer.from("original build with random Next BUILD_ID");
const env = { GITHUB_REPOSITORY: "ByKitsune/kitsune-router", GITHUB_RUN_ID: "12", GITHUB_SHA: sha, GITHUB_REF: "refs/tags/v0.9.7" };
const run = { id: 12, workflow_id: 3, path: ".github/workflows/release.yml", head_sha: sha, head_branch: "v0.9.7", event: "workflow_dispatch" };
function fixture(options = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), "release-recovery-")); dirs.push(dir);
  const calls = [];
  const zip = execFileSync("python3", ["-c", "import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); z.writestr(sys.argv[1],sys.argv[2]); z.close(); sys.stdout.buffer.write(b.getvalue())", options.entry || tarball, bytes.toString()]);
  const command = (cmd, args, execOptions) => {
    calls.push([cmd, ...args]);
    if (cmd === "python3") return execFileSync(cmd, args, { ...execOptions, stdio: ["pipe", "pipe", "pipe"] });
    if (cmd === "npm") {
      if (options.networkError) throw Error("E401 Unauthorized");
      if (options.notPublished) { const e = Error("E404"); e.stderr = '{"error":{"code":"E404"}}'; throw e; }
      return JSON.stringify({ version, "dist.integrity": options.badIntegrity ? integrity(Buffer.from("different BUILD_ID")) : integrity(bytes) });
    }
    const path = args.find(a => a.startsWith("repos/"));
    if (path.endsWith("/actions/runs/12")) return JSON.stringify(run);
    if (path.includes("/workflows/3/runs?")) return JSON.stringify([{ workflow_runs: [options.wrongSHA ? { ...run, id: 11, head_sha: "b".repeat(40) } : { ...run, id: 11 }] }]);
    if (path.endsWith("/actions/runs/11")) return JSON.stringify(options.wrongSHA ? { ...run, id: 11, head_sha: "b".repeat(40) } : { ...run, id: 11 });
    if (path.includes("/artifacts?")) return JSON.stringify([{ artifacts: options.noArtifact ? [] : [{ id: 8, name: artifactName, expired: false }] }]);
    if (path.endsWith("/artifacts/8/zip")) return zip;
    throw Error("Unexpected command " + JSON.stringify([cmd, args]));
  };
  return { dir, calls, command };
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
async function prepare(f) {
  const { prepareTarball } = await import("../../scripts/release-publication-helpers.mjs");
  return prepareTarball(version, { cwd: f.dir, env, command: f.command });
}
describe("immutable original npm tarball recovery", () => {
  it("already published recovers same-run original bytes and skips rebuild", async () => {
    const f = fixture(); const result = await prepare(f);
    expect(result.build).toBe(false);
    expect(result.recovered).toBe(true);
    expect(readFileSync(resolve(f.dir, tarball))).toEqual(bytes);
    expect(f.calls.some(c => c.includes("publish") || c.includes("cli:pack"))).toBe(false);
  });
  it.each(["workflow_id", "head_branch"])("does not recover a previous artifact with mismatching %s", async key => {
    const f = fixture(); const original = f.command;
    f.command = (cmd, args, opts) => {
      if (args.some(a => a.includes("/runs/12/artifacts?"))) return JSON.stringify([{ artifacts: [] }]);
      if (args.some(a => a.includes("/workflows/3/runs?"))) return JSON.stringify([{ workflow_runs: [{ ...run, id: 11, [key]: key === "workflow_id" ? 9 : "master" }] }]);
      return original(cmd, args, opts);
    };
    await expect(prepare(f)).rejects.toThrow(/artifact/i);
  });
  it("already published rejects a different sha512 without rebuilding", async () => {
    const f = fixture({ badIntegrity: true });
    await expect(prepare(f)).rejects.toThrow(/integrity/i);
    expect(f.calls.some(c => c.includes("cli:pack"))).toBe(false);
  });
  it("already published refuses finalization without a trusted artifact", async () => {
    await expect(prepare(fixture({ noArtifact: true }))).rejects.toThrow(/artifact/i);
  });
  it("recovers a previous failed run only for exact workflow, tag and SHA", async () => {
    const f = fixture();
    const original = f.command;
    f.command = (cmd, args, opts) => args.some(a => a.includes("/runs/12/artifacts?")) ? JSON.stringify([{ artifacts: [] }]) : original(cmd, args, opts);
    expect((await prepare(f)).recovered).toBe(true);
    expect(f.calls.some(c => c.includes("repos/ByKitsune/kitsune-router/actions/runs/11"))).toBe(true);
  });
  it("rejects an artifact from a different source SHA", async () => {
    const f = fixture({ wrongSHA: true }); const original = f.command;
    f.command = (cmd, args, opts) => args.some(a => a.includes("/runs/12/artifacts?")) ? JSON.stringify([{ artifacts: [] }]) : original(cmd, args, opts);
    await expect(prepare(f)).rejects.toThrow(/artifact|source/i);
  });
  it("rejects zip traversal rather than extracting unexpected entries", async () => {
    await expect(prepare(fixture({ entry: "../outside.tgz" }))).rejects.toThrow(/archive|tarball|zip/i);
  });
  it("fresh unpublished version builds only when artifact absent", async () => {
    expect((await prepare(fixture({ notPublished: true, noArtifact: true }))).build).toBe(true);
  });
  it("npm auth errors never fall through to a fresh build", async () => {
    await expect(prepare(fixture({ networkError: true }))).rejects.toThrow(/Unauthorized/);
  });
  it("persists the original artifact before npm publish and skips pack when recovered", () => {
    const text = readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8");
    expect(text).toContain("if: steps.tarball.outputs.build == 'true'");
    expect(text.indexOf("uses: actions/upload-artifact@v7")).toBeGreaterThan(-1);
    expect(text.indexOf("uses: actions/upload-artifact@v7")).toBeLessThan(text.indexOf("- name: Publish exact CLI tarball"));
    expect(text).toContain("actions: read");
  });
});
