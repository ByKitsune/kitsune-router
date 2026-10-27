import assert from "node:assert/strict";
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkReleaseVersion } from "./check-release-version.mjs";
import { command, prepareDocker, verifyDocker, promoteDocker } from "./release-publication-helpers.mjs";
import { GHCR_IMAGE } from "./ghcr-registry.mjs";

const exact = (value, pattern) => typeof value === "string" && pattern.exec(value)?.[0] === value;

export function validateRecoverySource({ env = process.env, command: run = command } = {}) {
  assert.equal(env.GITHUB_REPOSITORY, "ByKitsune/kitsune-router", "Untrusted recovery repository");
  assert.equal(env.GITHUB_REF, "refs/heads/master", "Dispatch recovery tooling from the reviewed default branch");
  assert(exact(env.GITHUB_SHA, /^[a-f0-9]{40}$/), "Invalid recovery tooling SHA");
  assert(exact(env.RECOVERY_SOURCE_SHA, /^[a-f0-9]{40}$/), "Explicit immutable source SHA required");
  assert(exact(env.RECOVERY_TAG, /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/), "Invalid immutable recovery tag");
  assert(env.GITHUB_WORKSPACE && resolve(env.GITHUB_WORKSPACE) === env.GITHUB_WORKSPACE, "Absolute recovery workspace required");
  const source = resolve(env.GITHUB_WORKSPACE, "release-source");
  const tooling = resolve(env.GITHUB_WORKSPACE, "release-tools");
  const git = (cwd, args) => run("git", args, { cwd, env }).trim();
  assert.equal(git(tooling, ["rev-parse", "HEAD"]), env.GITHUB_SHA, "Recovery tooling checkout does not match the dispatch SHA");
  assert.equal(git(source, ["rev-parse", "HEAD"]), env.RECOVERY_SOURCE_SHA, "Recovery source checkout SHA mismatch");
  assert.equal(git(source, ["rev-parse", `refs/tags/${env.RECOVERY_TAG}^{commit}`]), env.RECOVERY_SOURCE_SHA, "Recovery tag SHA mismatch");
  assert.equal(git(tooling, ["status", "--porcelain", "--untracked-files=no"]), "", "Recovery tooling has tracked drift");
  assert.equal(git(source, ["status", "--porcelain", "--untracked-files=no"]), "", "Recovery source has tracked drift");
  const { version } = checkReleaseVersion(source, env.RECOVERY_TAG);
  return { version, source, tooling, toolingSha: env.GITHUB_SHA, sourceSha: env.RECOVERY_SOURCE_SHA, tag: env.RECOVERY_TAG };
}

export function registryVerifiedCommand({ command: run = command, env = process.env, registryScript = resolve(import.meta.dirname, "ghcr-registry.mjs") } = {}) {
  return (executable, args, options = {}) => {
    if (executable !== "docker" || args[0] !== "buildx" || args[1] !== "imagetools" || args[2] !== "inspect") return run(executable, args, options);
    assert.equal(args.length, 6, "Unexpected registry inspection arguments");
    assert.equal(args[4], "--format", "Unexpected registry inspection format");
    const ref = args[3];
    assert(ref.startsWith(GHCR_IMAGE + ":") || ref.startsWith(GHCR_IMAGE + "@"), "Recovery may inspect only the canonical GHCR image");
    const reference = ref.slice(GHCR_IMAGE.length + 1);
    const probe = JSON.parse(run(process.execPath, [registryScript, reference], { env, timeout: 60000 }));
    assert.equal(probe.image, GHCR_IMAGE, "Registry probe image mismatch");
    assert.equal(probe.reference, reference, "Registry probe reference mismatch");
    if (probe.absent === true) {
      assert.equal(probe.status, 404, "Registry probe did not confirm absence");
      assert.deepEqual(probe.codes, ["MANIFEST_UNKNOWN"], "Registry probe did not confirm MANIFEST_UNKNOWN");
      // Feed the existing fail-closed guard an absence classification only after
      // the authenticated registry response, never from Buildx's generic text.
      throw Object.assign(new Error("Authenticated registry confirmed absent manifest"), { stderr: "manifest unknown" });
    }
    assert.equal(probe.absent, false, "Invalid registry probe state");
    assert(exact(probe.digest, /^sha256:[a-f0-9]{64}$/), "Invalid registry probe digest");
    if (args[5] === "{{json .Manifest}}") return JSON.stringify({ ...probe.manifest, digest: probe.digest });
    // Read config/provenance/SBOM from the resolved digest, not a mutable tag.
    try {
      return run(executable, [...args.slice(0, 3), `${GHCR_IMAGE}@${probe.digest}`, ...args.slice(4)], options);
    } catch {
      // The registry already confirmed this manifest exists. A failed config
      // or child-manifest read must never be reclassified by the inherited CLI
      // stderr matcher as an absent `latest` that could be overwritten.
      throw new Error("Existing GHCR manifest evidence could not be inspected");
    }
  };
}

export function recoverContainer(mode, { env = process.env, command: run = command } = {}) {
  const validated = validateRecoverySource({ env, command: run });
  const targetEnv = { ...env, GITHUB_SHA: validated.sourceSha, GITHUB_REF: `refs/tags/${validated.tag}` };
  const verified = registryVerifiedCommand({ command: run, env });
  const options = { env: targetEnv, command: verified };
  if (mode === "validate") return validated;
  if (mode === "prepare") return { ...prepareDocker(validated.version, [GHCR_IMAGE], options), version: validated.version, revision: validated.sourceSha };
  if (mode === "verify") { verifyDocker(validated.version, env.RECOVERY_DIGEST, [GHCR_IMAGE], options); return { verified: true }; }
  if (mode === "promote") return { promoted: promoteDocker(validated.version, env.RECOVERY_DIGEST, [GHCR_IMAGE], options) };
  throw new Error("Unknown container recovery mode");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = recoverContainer(process.argv[2]);
  for (const [key, value] of Object.entries(result)) {
    assert(!/[\r\n]/.test(String(value)), "Unsafe recovery output");
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  if (process.argv[2] === "validate") writeFileSync(resolve(process.env.RUNNER_TEMP, "container-recovery-source.json"), JSON.stringify(result) + "\n");
  console.log(JSON.stringify(result));
}
