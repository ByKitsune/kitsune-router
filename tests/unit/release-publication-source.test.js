import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const fixtures = [];
const workflow = name => readFileSync(resolve(root, `.github/workflows/${name}.yml`), "utf8");
const validation = name => workflow(name).split(/      - name: Validate release[^\n]*\n/)[1].split(/        run: \|\n/)[1].split(/\n\n/)[0].replace(/^          /gm, "");
function fixture() {
  const dir = mkdtempSync(resolve(tmpdir(), "release-publication-"));
  fixtures.push(dir);
  for (const prefix of ["", "cli/", "tests/", "gitbook/"]) {
    mkdirSync(resolve(dir, prefix), { recursive: true });
    writeFileSync(resolve(dir, prefix, "package.json"), JSON.stringify({ name: "@joyccn/zenrouter", version: "0.9.7" }));
    writeFileSync(resolve(dir, prefix, "package-lock.json"), JSON.stringify({ version: "0.9.7", packages: { "": { version: "0.9.7" } } }));
  }
  mkdirSync(resolve(dir, "scripts"));
  copyFileSync(resolve(root, "scripts/check-release-version.mjs"), resolve(dir, "scripts/check-release-version.mjs"));
  mkdirSync(resolve(dir, "releases"));
  writeFileSync(resolve(dir, "releases/RELEASE_NOTES_v0.9.7.md"), "fixture notes");
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
  git("branch", "v0.9.7");
  return { dir, git, sha: git("rev-parse", "HEAD") };
}
function validate(name, f, env = {}) {
  return spawnSync("bash", ["-e", "-o", "pipefail", "-c", validation(name)], {
    cwd: f.dir, encoding: "utf8", env: { ...process.env, NPM_TOKEN: "offline-fixture", RELEASE_TAG: "v0.9.7", GITHUB_REF: "refs/tags/v0.9.7", GITHUB_SHA: f.sha, GITHUB_OUTPUT: resolve(f.dir, "outputs"), ...env },
  });
}
afterEach(() => { for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("release source validation through actual workflow shell", () => {
  it.each(["release", "docker-publish"])("%s rejects a branch named v0.9.7 without a tag", name => {
    expect(validate(name, fixture()).status).not.toBe(0);
  });
  it.each(["release", "docker-publish"])("%s accepts the exact annotated release tag", name => {
    const f = fixture();
    f.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "tag", "-a", "v0.9.7", "-m", "release");
    expect(validate(name, f).status).toBe(0);
  });
  it.each(["GITHUB_REF", "GITHUB_SHA"])("npm provenance rejects mismatching dispatch %s despite correct checkout", key => {
    const f = fixture(); f.git("tag", "v0.9.7");
    expect(validate("release", f, { [key]: key === "GITHUB_REF" ? "refs/heads/master" : "0".repeat(40) }).status).not.toBe(0);
  });
  it("rejects HEAD different from the actual release tag", () => {
    const f = fixture(); f.git("tag", "v0.9.7");
    f.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "other");
    expect(validate("release", f, { GITHUB_SHA: f.git("rev-parse", "HEAD") }).status).not.toBe(0);
  });
});
