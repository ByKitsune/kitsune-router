import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkReleaseVersion } from "./check-release-version.mjs";
import { GHCR_IMAGE } from "./ghcr-registry.mjs";
import { registryVerifiedCommand } from "./recover-container-release.mjs";
import { canPromote, command, dockerLatest, prepareDocker, promoteDocker, verifyDocker } from "./release-publication-helpers.mjs";

/** Canonical tag publication uses authenticated registry evidence for every read. */
export function publishCanonicalContainer(mode, { env = process.env, cwd = process.cwd(), command: run = command } = {}) {
  assert(["prepare", "latest", "verify", "promote"].includes(mode), "Unknown canonical container publication mode");
  assert.equal(env.GITHUB_REPOSITORY, "ByKitsune/kitsune-router", "Untrusted canonical publication repository");
  assert(typeof env.GITHUB_SHA === "string" && /^[a-f0-9]{40}$/.exec(env.GITHUB_SHA)?.[0] === env.GITHUB_SHA, "Invalid canonical source SHA");
  const { version, tag } = checkReleaseVersion(cwd, `v${env.RELEASE_VERSION}`);
  assert.equal(env.GITHUB_REF, `refs/tags/${tag}`, "Wrong canonical release ref");
  const git = args => run("git", args, { cwd, env }).trim();
  assert.equal(git(["rev-parse", "HEAD"]), env.GITHUB_SHA, "Canonical checkout SHA mismatch");
  assert.equal(git(["rev-parse", `refs/tags/${tag}^{commit}`]), env.GITHUB_SHA, "Canonical release tag SHA mismatch");
  assert.equal(git(["status", "--porcelain", "--untracked-files=no"]), "", "Canonical source has tracked drift");
  const verified = registryVerifiedCommand({ command: run, env });
  const options = { env, command: verified };
  if (mode === "prepare") return prepareDocker(version, [GHCR_IMAGE], options);
  if (mode === "latest") return { promote: canPromote(version, dockerLatest(GHCR_IMAGE, env.GITHUB_REPOSITORY, verified)) };
  if (mode === "verify") {
    verifyDocker(version, env.RELEASE_DIGEST, [GHCR_IMAGE], options);
    return { verified: true };
  }
  return { promote: promoteDocker(version, env.RELEASE_DIGEST, [GHCR_IMAGE], options) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = publishCanonicalContainer(process.argv[2]);
    for (const [key, value] of Object.entries(result)) {
      assert(!/[\r\n]/.test(String(value)), "Unsafe canonical publication output");
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
    console.log(JSON.stringify(result));
  } catch (error) {
    // Registry adapters sanitize errors; never dump child-process state or env.
    console.error(error instanceof assert.AssertionError ? error.message : "Canonical GHCR publication failed");
    process.exitCode = 1;
  }
}
