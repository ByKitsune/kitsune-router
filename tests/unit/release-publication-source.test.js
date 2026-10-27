import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const fixtures = [];
const skillNames = [
  "kitsune-router", "kitsune-router-chat", "kitsune-router-image", "kitsune-router-video",
  "kitsune-router-tts", "kitsune-router-stt", "kitsune-router-embeddings",
  "kitsune-router-web-search", "kitsune-router-web-fetch",
];
const workflow = name => readFileSync(resolve(root, `.github/workflows/${name}.yml`), "utf8");
const validation = name => workflow(name).split(/      - name: Validate release[^\n]*\n/)[1].split(/        run: \|\n/)[1].split(/\n\n/)[0].replace(/^          /gm, "");
function fixture() {
  const dir = mkdtempSync(resolve(tmpdir(), "release-publication-"));
  fixtures.push(dir);
  for (const [prefix, name] of Object.entries({
    "": "kitsune-router-app", "cli/": "@bykitsune/router",
    "tests/": "kitsune-router-tests", "gitbook/": "kitsune-router-docs",
  })) {
    mkdirSync(resolve(dir, prefix), { recursive: true });
    const bin = prefix === "cli/" ? { "kitsune-router": "./cli.js" } : undefined;
    const metadata = prefix === "cli/"
      ? { repository: { type: "git", url: "https://github.com/ByKitsune/kitsune-router.git" }, publishConfig: { access: "public" } }
      : { private: true };
    writeFileSync(resolve(dir, prefix, "package.json"), JSON.stringify({ name, version: "0.9.7", bin, ...metadata }));
    writeFileSync(resolve(dir, prefix, "package-lock.json"), JSON.stringify({ name, version: "0.9.7", packages: { "": { name, version: "0.9.7", bin } } }));
  }
  mkdirSync(resolve(dir, "scripts"));
  copyFileSync(resolve(root, "scripts/check-release-version.mjs"), resolve(dir, "scripts/check-release-version.mjs"));
  // The workflow's later source-verification phase invokes the real identity
  // gate. Keep this source fixture complete for that dependency closure too,
  // rather than stubbing the gate or relying on files outside the checkout.
  copyFileSync(resolve(root, "scripts/rebrand-identity.mjs"), resolve(dir, "scripts/rebrand-identity.mjs"));
  mkdirSync(resolve(dir, "branding"));
  copyFileSync(resolve(root, "branding/identity.mjs"), resolve(dir, "branding/identity.mjs"));
  for (const name of skillNames) {
    mkdirSync(resolve(dir, "skills", name), { recursive: true });
    copyFileSync(resolve(root, "skills", name, "SKILL.md"), resolve(dir, "skills", name, "SKILL.md"));
  }
  mkdirSync(resolve(dir, "public/icons"), { recursive: true });
  for (const name of readdirSync(resolve(root, "public/icons"))) {
    if (!name.endsWith(".svg")) continue;
    copyFileSync(resolve(root, "public/icons", name), resolve(dir, "public/icons", name));
  }
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
    cwd: f.dir, encoding: "utf8", env: {
      PATH: process.env.PATH, HOME: f.dir, DATA_DIR: resolve(f.dir, "data"), NODE_ENV: "test",
      RUN_REAL: "0", RUN_E2E: "0", RUN_LIVE_TESTS: "0", AG_CACHE_TEST: "0", MODEL_CATALOG_SYNC: "off",
      DISABLE_BACKGROUND_TOKEN_REFRESH: "1", KITSUNE_ROUTER_DISABLE_MITM: "1", KITSUNE_ROUTER_MIGRATION: "skip",
      NPM_TOKEN: "offline-fixture", RELEASE_TAG: "v0.9.7", GITHUB_REF: "refs/tags/v0.9.7",
      GITHUB_SHA: f.sha, GITHUB_REPOSITORY: "ByKitsune/kitsune-router",
      GITHUB_OUTPUT: resolve(f.dir, "outputs"), ...env,
    },
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
    const identity = spawnSync(process.execPath, [resolve(f.dir, "scripts/rebrand-identity.mjs")], {
      cwd: f.dir, encoding: "utf8", timeout: 5000,
      env: { PATH: process.env.PATH, HOME: f.dir, DATA_DIR: resolve(f.dir, "data"), NODE_ENV: "test", KITSUNE_ROUTER_MIGRATION: "skip" },
    });
    expect(identity.status, identity.stdout + identity.stderr).toBe(0);
    const result = validate(name, f);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it.each(["release", "docker-publish"])("%s rejects a foreign source repository even with an exact release tag and SHA", name => {
    const f = fixture(); f.git("tag", "v0.9.7");
    const result = validate(name, f, { GITHUB_REPOSITORY: "untrusted/kitsune-router" });
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
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
