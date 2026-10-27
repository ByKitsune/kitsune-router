import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { GHCR_IMAGE, inspectGhcrManifest } from "../../scripts/ghcr-registry.mjs";
import { recoverContainer, registryVerifiedCommand, validateRecoverySource, verifyRecoverySource } from "../../scripts/recover-container-release.mjs";
import { dockerLatest } from "../../scripts/release-publication-helpers.mjs";

const env = { GHCR_USERNAME: "fixture-user", GHCR_TOKEN: "synthetic-not-a-real-registry-token" };
const sha = "a".repeat(40), toolingSha = "b".repeat(40), digest = "sha256:" + "c".repeat(64);
const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const response = (body, status = 200, headers = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
function registry(result) {
  const fetch = vi.fn().mockResolvedValueOnce(response({ token: "synthetic-ephemeral-grant" })).mockResolvedValueOnce(result);
  return { env, fetch };
}

describe("authenticated GHCR manifest absence classification", () => {
  it("requires explicit credentials before any registry request", async () => {
    const fetch = vi.fn();
    await expect(inspectGhcrManifest("1.0.2", { env: {}, fetch })).rejects.toThrow(/credentials/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("accepts only a successful grant followed by a structured MANIFEST_UNKNOWN 404", async () => {
    const options = registry(response({ errors: [{ code: "MANIFEST_UNKNOWN", message: "manifest unknown" }] }, 404));
    expect(await inspectGhcrManifest("1.0.2", options)).toEqual({ image: GHCR_IMAGE, reference: "1.0.2", absent: true, status: 404, codes: ["MANIFEST_UNKNOWN"] });
    expect(options.fetch).toHaveBeenCalledTimes(2);
    const [url, request] = options.fetch.mock.calls[0];
    expect(url).toBe("https://ghcr.io/token?service=ghcr.io&scope=repository:bykitsune/kitsune-router:pull");
    expect(request.redirect).toBe("error");
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(options.fetch.mock.calls[1][0]).toBe("https://ghcr.io/v2/bykitsune/kitsune-router/manifests/1.0.2");
    expect(options.fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer synthetic-ephemeral-grant");
  });

  it.each([
    [401, { errors: [{ code: "UNAUTHORIZED" }] }],
    [403, { errors: [{ code: "DENIED" }] }],
    [404, { errors: [{ code: "NAME_UNKNOWN" }] }],
    [404, { errors: [{ code: "MANIFEST_UNKNOWN" }, { code: "UNAUTHORIZED" }] }],
    [404, { errors: [] }],
    [404, { message: "not found" }],
    [429, { errors: [{ code: "TOOMANYREQUESTS" }] }],
    [500, { errors: [{ code: "UNKNOWN" }] }],
  ])("does not mistake HTTP %s / %j for an absent artifact", async (status, body) => {
    await expect(inspectGhcrManifest("1.0.2", registry(response(body, status)))).rejects.toThrow();
  });

  it.each([401, 403, 404, 429, 500])("rejects an unsuccessful HTTP %s grant before any manifest read", async status => {
    const fetch = vi.fn().mockResolvedValue(response({ errors: [{ code: "DENIED" }] }, status));
    await expect(inspectGhcrManifest("1.0.2", { env, fetch })).rejects.toThrow(/grant/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed/HTML response bodies, missing grants and oversized JSON", async () => {
    await expect(inspectGhcrManifest("1.0.2", registry(response("not JSON", 404)))).rejects.toThrow(/malformed/);
    await expect(inspectGhcrManifest("1.0.2", registry(response("<h1>not found</h1>", 404, { "content-type": "text/html" })))).rejects.toThrow(/not JSON/);
    await expect(inspectGhcrManifest("1.0.2", { env, fetch: vi.fn().mockResolvedValue(response({})) })).rejects.toThrow(/grant/);
    await expect(inspectGhcrManifest("1.0.2", registry(response({ errors: [{ code: "MANIFEST_UNKNOWN", message: "x".repeat(2 * 1024 * 1024) }] }, 404)))).rejects.toThrow(/size bound/);
  });

  it("propagates a network error rather than assuming absence", async () => {
    await expect(inspectGhcrManifest("1.0.2", { env, fetch: vi.fn().mockRejectedValue(new Error("offline")) })).rejects.toThrow("offline");
  });

  it.each(["../latest", "1.0.2\n", "01.0.2", "1.0.2-beta", "latest/other", "sha256:short"]) ("rejects unsafe reference %j before using credentials", async reference => {
    const fetch = vi.fn();
    await expect(inspectGhcrManifest(reference, { env, fetch })).rejects.toThrow(/reference/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("validates successful manifest bytes against the registry digest", async () => {
    const manifest = { schemaVersion: 2, mediaType: "application/vnd.oci.image.index.v1+json", manifests: [{ digest }] };
    const bytes = JSON.stringify(manifest), expected = "sha256:" + createHash("sha256").update(bytes).digest("hex");
    expect(await inspectGhcrManifest("latest", registry(response(bytes, 200, { "docker-content-digest": expected })))).toMatchObject({ absent: false, digest: expected, manifest });
    await expect(inspectGhcrManifest("1.0.2", registry(response(bytes, 200, { "docker-content-digest": digest })))).rejects.toThrow(/digest mismatch/);
    await expect(inspectGhcrManifest(digest, registry(response(bytes, 200, { "docker-content-digest": expected })))).rejects.toThrow(/reference mismatch/);
  });
});

describe("recovery adapts only authenticated structured registry evidence", () => {
  const inspect = ["buildx", "imagetools", "inspect", GHCR_IMAGE + ":1.0.2", "--format", "{{json .Manifest}}"];
  it("reuses the original fail-closed helper only after authenticated manifest absence", () => {
    const command = vi.fn(() => JSON.stringify({ image: GHCR_IMAGE, reference: "1.0.2", absent: true, status: 404, codes: ["MANIFEST_UNKNOWN"] }));
    const run = registryVerifiedCommand({ env, command });
    expect(() => run("docker", inspect)).toThrow(/Authenticated registry confirmed/);
    expect(command).toHaveBeenCalledTimes(1);
    expect(command.mock.calls[0][0]).toBe(process.execPath);
  });
  it.each([
    { absent: true, status: 403, codes: ["MANIFEST_UNKNOWN"] },
    { absent: true, status: 404, codes: ["NAME_UNKNOWN"] },
    { absent: false, digest: "invalid" },
    { absent: "true", status: 404, codes: ["MANIFEST_UNKNOWN"] },
  ])("fails closed on invalid probe result %j", probe => {
    const run = registryVerifiedCommand({ env, command: () => JSON.stringify({ image: GHCR_IMAGE, reference: "1.0.2", ...probe }) });
    expect(() => run("docker", inspect)).toThrow();
  });
  it("pins config/evidence inspection to the resolved digest", () => {
    const command = vi.fn((executable) => executable === process.execPath ? JSON.stringify({ image: GHCR_IMAGE, reference: "1.0.2", absent: false, digest, manifest: { schemaVersion: 2 } }) : '{"config":{}}');
    const run = registryVerifiedCommand({ env, command });
    expect(JSON.parse(run("docker", inspect))).toMatchObject({ digest });
    run("docker", [...inspect.slice(0, 5), "{{json .Image}}"]);
    expect(command.mock.calls.at(-1)[1][3]).toBe(GHCR_IMAGE + "@" + digest);
    expect(() => run("docker", ["buildx", "imagetools", "inspect", "ghcr.io/untrusted/image:1.0.2", "--format", "{{json .Manifest}}"])).toThrow(/canonical/);
  });
  it("never reclassifies a downstream Buildx manifest/config failure as absent latest", () => {
    const command = vi.fn(executable => {
      if (executable === process.execPath) return JSON.stringify({ image: GHCR_IMAGE, reference: "latest", absent: false, digest, manifest: { schemaVersion: 2 } });
      throw Object.assign(new Error("Child config unavailable"), { stderr: "manifest unknown" });
    });
    const run = registryVerifiedCommand({ env, command });
    expect(() => dockerLatest(GHCR_IMAGE, "ByKitsune/kitsune-router", run)).toThrow(/Existing GHCR manifest evidence could not be inspected/);
    expect(command.mock.calls.some(([, args]) => args[2] === "create")).toBe(false);
  });
});

function sourceFixture(overrides = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), "ghcr-source-boundary-"));
  directories.push(directory);
  const source = resolve(directory, "release-source");
  mkdirSync(source);
  for (const [prefix, name] of Object.entries({ "": "kitsune-router-app", "cli/": "@bykitsune/router", "tests/": "kitsune-router-tests", "gitbook/": "kitsune-router-docs" })) {
    mkdirSync(resolve(source, prefix), { recursive: true });
    const bin = prefix === "cli/" ? { "kitsune-router": "cli.js" } : undefined;
    writeFileSync(resolve(source, prefix + "package.json"), JSON.stringify({ name, version: "1.0.2", bin }));
    writeFileSync(resolve(source, prefix + "package-lock.json"), JSON.stringify({ name, version: "1.0.2", packages: { "": { name, version: "1.0.2", bin } } }));
  }
  const env = { GITHUB_REPOSITORY: "ByKitsune/kitsune-router", GITHUB_REF: "refs/heads/master", GITHUB_SHA: toolingSha, GITHUB_WORKSPACE: directory, RECOVERY_SOURCE_SHA: sha, RECOVERY_TAG: "v1.0.2", ...overrides };
  const command = (_cmd, args, options) => args.includes("status") ? "" : options.cwd.endsWith("release-tools") ? toolingSha : sha;
  return { env, command, source };
}

describe("separate immutable source and reviewed tooling boundaries", () => {
  it("validates both exact SHAs and all source package versions", () => {
    expect(validateRecoverySource(sourceFixture())).toMatchObject({ version: "1.0.2", sourceSha: sha, toolingSha, tag: "v1.0.2" });
  });
  it("passes source context directly to the immutable gate without overwriting tooling GITHUB values", async () => {
    const fixture = sourceFixture();
    const verifySource = vi.fn(() => "source-evidence-directory");
    const load = vi.fn(async () => ({ verifySource }));
    expect(await verifyRecoverySource({ ...fixture, load })).toBe("source-evidence-directory");
    expect(load.mock.calls[0][0]).toBe(new URL("scripts/release-publication-helpers.mjs", "file://" + fixture.source + "/").href);
    const options = verifySource.mock.calls[0][0];
    expect(options.cwd).toBe(fixture.source);
    expect(options.env).toMatchObject({ GITHUB_SHA: sha, GITHUB_REF: "refs/tags/v1.0.2" });
    expect(fixture.env.GITHUB_SHA).toBe(toolingSha);
    expect(fixture.env.GITHUB_REF).toBe("refs/heads/master");
    expect(options.command).toBe(fixture.command);
  });
  it.each([
    { GITHUB_REPOSITORY: "untrusted/repo" }, { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_SHA: "short" }, { RECOVERY_SOURCE_SHA: "short" }, { RECOVERY_TAG: "v1.0.2\n" },
  ])("rejects unsafe dispatch boundary %j", overrides => {
    expect(() => validateRecoverySource(sourceFixture(overrides))).toThrow();
  });
  it("rejects source tag drift and tracked changes before any registry request", () => {
    const fixture = sourceFixture();
    expect(() => validateRecoverySource({ ...fixture, command: (_cmd, args, options) => args.some(a => a.includes("refs/tags")) ? "f".repeat(40) : fixture.command(_cmd, args, options) })).toThrow(/tag SHA/);
    expect(() => validateRecoverySource({ ...fixture, command: (_cmd, args, options) => args.includes("status") ? " M package.json" : fixture.command(_cmd, args, options) })).toThrow(/drift/);
  });
  it("rechecks the immutable source's versions rather than the tooling version", () => {
    const fixture = sourceFixture();
    const file = resolve(fixture.source, "cli/package.json");
    const value = JSON.parse(readFileSync(file, "utf8"));value.version = "1.0.3";writeFileSync(file, JSON.stringify(value));
    expect(() => validateRecoverySource(fixture)).toThrow(/Version mismatch/);
  });
  it("plans only the exact validated runtime commit, not the newer tooling tree", () => {
    const fixture = sourceFixture();
    const command = vi.fn((executable, args, options) => {
      if (executable === "git") return fixture.command(executable, args, options);
      expect(executable).toBe(process.execPath);
      return JSON.stringify({ image: GHCR_IMAGE, reference: "1.0.2", absent: true, status: 404, codes: ["MANIFEST_UNKNOWN"] });
    });
    expect(recoverContainer("prepare", { env: fixture.env, command })).toEqual({ build: true, context: `https://github.com/ByKitsune/kitsune-router.git#${sha}`, version: "1.0.2", revision: sha });
    expect(command.mock.calls.every(([executable]) => executable !== "docker")).toBe(true);
  });
  it("propagates authenticated registry failure without a build or mutable write", () => {
    const fixture = sourceFixture();
    const calls = [];
    const command = (executable, args, options) => {
      calls.push([executable, ...args]);
      if (executable === "git") return fixture.command(executable, args, options);
      throw new Error("Registry authorization failed");
    };
    expect(() => recoverContainer("prepare", { env: fixture.env, command })).toThrow(/authorization failed/);
    expect(calls.some(([executable]) => executable === "docker")).toBe(false);
  });
  it("uses the canonical serialized recovery workflow with exact source build context", () => {
    const workflow = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/container-recovery.yml"), "utf8");
    expect(workflow).toContain("group: docker-release\n");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("ref: refs/tags/${{ inputs.tag }}");
    expect(workflow).toContain("context: ${{ steps.immutable.outputs.context }}");
    expect(workflow).toContain("run: node release-tools/scripts/recover-container-release.mjs source-gate");
    expect(workflow).not.toContain("GITHUB_SHA: ${{ inputs.source_sha }}");
    expect(workflow).toContain("provenance: mode=min");
    expect(workflow).toContain("sbom: true");
    expect(workflow).not.toContain("verification/${{ inputs.source_sha }}");
    expect(workflow).not.toContain("--skip");
  });
  it("executes source validation from the actual recovery workflow against real Git refs", () => {
    const fixture = sourceFixture();
    const tooling = resolve(fixture.env.GITHUB_WORKSPACE, "release-tools");
    mkdirSync(resolve(tooling, "scripts"), { recursive: true });
    for (const file of ["ghcr-registry.mjs", "recover-container-release.mjs", "release-publication-helpers.mjs", "check-release-version.mjs"]) {
      copyFileSync(resolve(import.meta.dirname, "../../scripts", file), resolve(tooling, "scripts", file));
    }
    const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const initialize = directory => {
      git(directory, "init", "--quiet");
      git(directory, "add", ".");
      git(directory, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
      return git(directory, "rev-parse", "HEAD");
    };
    const sourceSha = initialize(fixture.source);
    git(fixture.source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "tag", "-a", "v1.0.2", "-m", "immutable fixture");
    const toolingSha = initialize(tooling);
    const workflow = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/container-recovery.yml"), "utf8");
    const script = workflow.split("      - name: Validate separate tooling and release source boundaries\n")[1].split("\n\n")[0].replace(/^        run: /, "");
    const env = { PATH: process.env.PATH, HOME: fixture.env.GITHUB_WORKSPACE, GITHUB_REPOSITORY: "ByKitsune/kitsune-router", GITHUB_WORKSPACE: fixture.env.GITHUB_WORKSPACE, GITHUB_REF: "refs/heads/master", GITHUB_SHA: toolingSha, RECOVERY_SOURCE_SHA: sourceSha, RECOVERY_TAG: "v1.0.2", RUNNER_TEMP: fixture.env.GITHUB_WORKSPACE, GITHUB_OUTPUT: resolve(fixture.env.GITHUB_WORKSPACE, "outputs") };
    const run = overrides => spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], { cwd: fixture.env.GITHUB_WORKSPACE, env: { ...env, ...overrides }, encoding: "utf8", timeout: 8000 });
    const valid = run({});
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
    expect(JSON.parse(valid.stdout)).toMatchObject({ sourceSha, toolingSha, tag: "v1.0.2" });
    expect(run({ RECOVERY_SOURCE_SHA: "f".repeat(40) }).status).not.toBe(0);
    expect(run({ GITHUB_REF: "refs/heads/unreviewed" }).status).not.toBe(0);
    writeFileSync(resolve(fixture.source, "package.json"), "{}");
    expect(run({}).status).not.toBe(0);
  });
  it("executes the actual source-gate workflow command while GitHub defaults still identify tooling", () => {
    const fixture = sourceFixture();
    const tooling = resolve(fixture.env.GITHUB_WORKSPACE, "release-tools");
    mkdirSync(resolve(tooling, "scripts"), { recursive: true });
    mkdirSync(resolve(fixture.source, "scripts"));
    for (const file of ["ghcr-registry.mjs", "recover-container-release.mjs", "release-publication-helpers.mjs", "check-release-version.mjs"]) copyFileSync(resolve(import.meta.dirname, "../../scripts", file), resolve(tooling, "scripts", file));
    writeFileSync(resolve(fixture.source, "scripts/release-publication-helpers.mjs"), `
      import assert from "node:assert/strict";
      import { execFileSync } from "node:child_process";
      export function verifySource({ cwd, env }) {
        assert.equal(env.GITHUB_SHA, execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim());
        assert.equal(env.GITHUB_REF, "refs/tags/v1.0.2");
        assert.notEqual(process.env.GITHUB_SHA, env.GITHUB_SHA);
        assert.equal(process.env.GITHUB_REF, "refs/heads/master");
        return cwd + "/verification/" + env.GITHUB_SHA;
      }
    `);
    const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const initialize = directory => {
      git(directory, "init", "--quiet");git(directory, "add", ".");
      git(directory, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
      return git(directory, "rev-parse", "HEAD");
    };
    const sourceSha = initialize(fixture.source);git(fixture.source, "tag", "v1.0.2");
    const toolingSha = initialize(tooling);
    const workflow = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/container-recovery.yml"), "utf8");
    const script = workflow.split("      - name: Verify exact immutable release source with its original gates\n")[1].split("\n\n")[0].replace(/^        run: /, "");
    const env = { PATH: process.env.PATH, HOME: fixture.env.GITHUB_WORKSPACE, GITHUB_REPOSITORY: "ByKitsune/kitsune-router", GITHUB_WORKSPACE: fixture.env.GITHUB_WORKSPACE, GITHUB_REF: "refs/heads/master", GITHUB_SHA: toolingSha, RECOVERY_SOURCE_SHA: sourceSha, RECOVERY_TAG: "v1.0.2", RUNNER_TEMP: fixture.env.GITHUB_WORKSPACE };
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], { cwd: fixture.env.GITHUB_WORKSPACE, env, encoding: "utf8", timeout: 8000 });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ verificationDirectory: resolve(fixture.source, "verification", sourceSha) });
  });
});
