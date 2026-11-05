import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { GHCR_IMAGE } from "../../scripts/ghcr-registry.mjs";
import { publishCanonicalContainer } from "../../scripts/publish-canonical-container.mjs";

const version = "1.0.6";
const digest = "sha256:" + "c".repeat(64);
const olderDigest = "sha256:" + "d".repeat(64);
let directory, sourceSha;
const git = args => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
beforeAll(() => {
  directory = mkdtempSync(resolve(tmpdir(), "canonical-container-"));
  for (const [prefix, name] of Object.entries({ "": "kitsune-router-app", "cli/": "@bykitsune/router", "tests/": "kitsune-router-tests", "gitbook/": "kitsune-router-docs" })) {
    mkdirSync(resolve(directory, prefix), { recursive: true });
    const bin = prefix === "cli/" ? { "kitsune-router": "cli.js" } : undefined;
    writeFileSync(resolve(directory, prefix + "package.json"), JSON.stringify({ name, version, bin }));
    writeFileSync(resolve(directory, prefix + "package-lock.json"), JSON.stringify({ name, version, packages: { "": { name, version, bin } } }));
  }
  git(["init", "--quiet", "--initial-branch=master"]);
  git(["add", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"]);
  git(["tag", `v${version}`]);
  sourceSha = git(["rev-parse", "HEAD"]);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function fixture({ exists = true, latest = "1.0.5", failure, configFailure, missingEvidence, wrongRevision = false, latestConflict = false } = {}) {
  const env = {
    GITHUB_REPOSITORY: "ByKitsune/kitsune-router", GITHUB_SHA: sourceSha, GITHUB_REF: `refs/tags/v${version}`,
    RELEASE_VERSION: version, RELEASE_DIGEST: digest, GHCR_USERNAME: "fixture-user", GHCR_TOKEN: "synthetic-token",
  };
  const state = { latest, tagged: false };
  const command = vi.fn((executable, args, options) => {
    if (executable === "git") {
      expect(options.cwd).toBe(directory);
      return git(args);
    }
    if (executable === process.execPath) {
      expect(args[0]).toBe(resolve(import.meta.dirname, "../../scripts/ghcr-registry.mjs"));
      expect(options.env).toBe(env);
      if (failure instanceof Error) throw failure;
      if (typeof failure === "string") return failure;
      const reference = args[1];
      const absent = reference === version ? !exists : reference === "latest" ? state.latest === null : false;
      if (absent) return JSON.stringify({ image: GHCR_IMAGE, reference, absent: true, status: 404, codes: ["MANIFEST_UNKNOWN"] });
      const resolved = reference === "latest" && (!state.tagged && state.latest !== version || latestConflict) ? olderDigest : reference.startsWith("sha256:") ? reference : digest;
      return JSON.stringify({ image: GHCR_IMAGE, reference, absent: false, digest: resolved, manifest: { schemaVersion: 2 } });
    }
    expect(executable).toBe("docker");
    expect(args.slice(0, 2)).toEqual(["buildx", "imagetools"]);
    if (args[2] === "create") {
      expect(args).toEqual(["buildx", "imagetools", "create", "--prefer-index=false", "--tag", `${GHCR_IMAGE}:latest`, `${GHCR_IMAGE}@${digest}`]);
      state.latest = version;
      state.tagged = true;
      return "";
    }
    // Simulate the observed Buildx error on any mutable-tag inspect. Successful
    // entrypoint paths must resolve authenticated JSON first and pin this read.
    if (!args[3].startsWith(GHCR_IMAGE + "@")) throw Object.assign(new Error("Buildx missing"), { stderr: `ERROR: ${args[3]}: not found` });
    expect(args[2]).toBe("inspect");
    if (configFailure) throw configFailure;
    const field = args.at(-1);
    if (field === "{{json .Image}}") return JSON.stringify({ config: { Labels: {
      "org.opencontainers.image.version": args[3].endsWith(olderDigest) ? state.latest : version,
      "org.opencontainers.image.revision": wrongRevision ? "f".repeat(40) : sourceSha,
      "org.opencontainers.image.source": "https://github.com/ByKitsune/kitsune-router",
    } } });
    if (field === "{{json .Provenance}}") return JSON.stringify(missingEvidence === "SLSA" ? null : { SLSA: { buildType: "https://mobyproject.org/buildkit@v1" } });
    if (field === "{{json .SBOM}}") return JSON.stringify(missingEvidence === "SPDX" ? null : { SPDX: { spdxVersion: "SPDX-2.3" } });
    throw new Error("Unexpected Docker inspection");
  });
  return { env, command, state, cwd: directory };
}
const writes = f => f.command.mock.calls.filter(([cmd, args]) => cmd === "docker" && args[2] === "create");
const probes = f => f.command.mock.calls.filter(([cmd]) => cmd === process.execPath).map(([, args]) => args[1]);

describe("canonical publication resolves authenticated registry evidence", () => {
  it("plans absent versions despite the observed Buildx 'not found' wording without invoking that CLI path", () => {
    const f = fixture({ exists: false });
    expect(publishCanonicalContainer("prepare", f)).toEqual({ build: true, context: `https://github.com/ByKitsune/kitsune-router.git#${sourceSha}` });
    expect(probes(f)).toEqual([version]);
    expect(f.command.mock.calls.some(([cmd]) => cmd === "docker")).toBe(false);
    expect(JSON.stringify(publishCanonicalContainer("prepare", f))).not.toContain(f.env.GHCR_TOKEN);
  });

  it("uses the same authenticated absence boundary for a missing latest tag", () => {
    const f = fixture({ latest: null });
    expect(publishCanonicalContainer("latest", f)).toEqual({ promote: true });
    expect(probes(f)).toEqual(["latest"]);
    expect(writes(f)).toEqual([]);
  });

  it.each(["prepare", "latest"])("fails closed for %s on authorization, network, malformed JSON and unproven absence", mode => {
    for (const failure of [
      Object.assign(new Error("Authorization failed"), { stderr: "403 denied: manifest unknown" }),
      Object.assign(new Error("Network unavailable"), { code: "ENETUNREACH", stderr: "connection unavailable" }),
      "not JSON",
      JSON.stringify({ image: GHCR_IMAGE, reference: mode === "prepare" ? version : "latest", absent: true, status: 404, codes: ["NAME_UNKNOWN"] }),
    ]) {
      const f = fixture({ failure });
      expect(() => publishCanonicalContainer(mode, f)).toThrow();
      expect(writes(f)).toEqual([]);
    }
  });

  it("reuses an existing version only after checking its digest-pinned source labels", () => {
    const f = fixture();
    expect(publishCanonicalContainer("prepare", f)).toEqual({ build: false, digest });
    expect(probes(f)).toEqual([version, digest]);
    expect(writes(f)).toEqual([]);
    expect(() => publishCanonicalContainer("prepare", fixture({ wrongRevision: true }))).toThrow(/source SHA mismatch/);
  });

  it("does not reinterpret an existing manifest's failed child read as absent latest", () => {
    const f = fixture({ configFailure: Object.assign(new Error("Missing child"), { stderr: "manifest unknown" }) });
    expect(() => publishCanonicalContainer("latest", f)).toThrow(/Existing GHCR manifest evidence could not be inspected/);
    expect(writes(f)).toEqual([]);
  });

  it("rejects a different built digest and missing provenance or SBOM before promotion", () => {
    const f = fixture();
    f.env.RELEASE_DIGEST = olderDigest;
    expect(() => publishCanonicalContainer("verify", f)).toThrow(/digest does not match/);
    expect(writes(f)).toEqual([]);
    for (const missingEvidence of ["SLSA", "SPDX"]) {
      const bad = fixture({ missingEvidence });
      expect(() => publishCanonicalContainer("promote", bad)).toThrow(/Missing Docker/);
      expect(writes(bad)).toEqual([]);
    }
  });

  it("never rolls newer latest back and rejects same-version digest conflicts", () => {
    const newer = fixture({ latest: "1.0.7" });
    expect(publishCanonicalContainer("latest", newer)).toEqual({ promote: false });
    expect(publishCanonicalContainer("promote", newer)).toEqual({ promote: false });
    expect(writes(newer)).toEqual([]);
    const conflict = fixture({ latest: version, latestConflict: true });
    expect(() => publishCanonicalContainer("promote", conflict)).toThrow(/Conflicting latest Docker version digest/);
    expect(writes(conflict)).toEqual([]);
  });

  it("promotes by verified digest only, rechecks latest and authenticates readback", () => {
    const f = fixture();
    expect(publishCanonicalContainer("verify", f)).toEqual({ verified: true });
    expect(publishCanonicalContainer("promote", f)).toEqual({ promote: true });
    expect(writes(f)).toHaveLength(1);
    expect(probes(f).filter(ref => ref === "latest")).toHaveLength(3);
    expect(probes(f).at(-1)).toBe("latest");
  });
});

describe("canonical source and workflow boundaries", () => {
  it.each([
    { GITHUB_REPOSITORY: "untrusted/repository" }, { GITHUB_REF: "refs/heads/master" },
    { GITHUB_SHA: "f".repeat(40) }, { GITHUB_SHA: "a".repeat(40) + "\n" },
    { RELEASE_VERSION: "1.0.7" }, { RELEASE_VERSION: "1.0.6\n" },
  ])("rejects invalid source context before registry reads: %j", overrides => {
    const f = fixture();Object.assign(f.env, overrides);
    expect(() => publishCanonicalContainer("prepare", f)).toThrow();
    expect(probes(f)).toEqual([]);
  });

  it("rejects tag drift and tracked changes before registry access", () => {
    for (const drift of ["tag", "worktree"]) {
      const f = fixture();
      const original = f.command;
      f.command = (cmd, args, options) => cmd === "git" && (drift === "tag" ? args[1]?.startsWith("refs/tags/") : args[0] === "status") ? "unexpected drift" : original(cmd, args, options);
      expect(() => publishCanonicalContainer("prepare", f)).toThrow(/mismatch|drift/);
      expect(probes({ command: original })).toEqual([]);
    }
  });

  it("wires all four publication modes with step-scoped credentials and preserves immutable build policy", () => {
    const workflow = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/docker-publish.yml"), "utf8");
    const blocks = workflow.split(/(?=      - name: )/);
    for (const mode of ["prepare", "latest", "verify", "promote"]) {
      const block = blocks.find(block => block.includes(`run: node scripts/publish-canonical-container.mjs ${mode}\n`));
      expect(block, mode).toBeTruthy();
      expect(block).toContain("GHCR_USERNAME: ${{ github.actor }}");
      expect(block).toContain("GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
      if (mode === "latest" || mode === "promote") expect(block).toContain("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
    }
    expect(workflow).not.toMatch(/release-publication-helpers\.mjs docker-/);
    expect(workflow).toContain("group: docker-release\n");
    expect(workflow).toContain("context: ${{ steps.immutable.outputs.context }}");
    expect(workflow).toContain("provenance: mode=min");
    expect(workflow).toContain("sbom: true");
    const verify = blocks.find(block => block.includes("run: node scripts/publish-canonical-container.mjs verify\n"));
    const smoke = blocks.find(block => block.includes("run: node scripts/verify-published-container.mjs "));
    expect(verify).not.toContain("        if:");
    expect(smoke).not.toContain("        if:");
    for (const block of [verify, smoke]) expect(block).toContain("RELEASE_DIGEST: ${{ steps.immutable.outputs.digest || steps.build.outputs.digest }}");
    expect(smoke).not.toMatch(/GHCR_TOKEN|GHCR_USERNAME|GH_TOKEN/);
    expect(smoke).toContain('"$GHCR_IMAGE@$RELEASE_DIGEST" "$RELEASE_VERSION" "$GITHUB_SHA"');
    expect(workflow.indexOf("publish-canonical-container.mjs verify")).toBeLessThan(workflow.indexOf("verify-published-container.mjs"));
    expect(workflow.indexOf("verify-published-container.mjs")).toBeLessThan(workflow.indexOf("publish-canonical-container.mjs promote"));
    expect(workflow).toContain("if: always()\n        uses: actions/upload-artifact");
  });
});
