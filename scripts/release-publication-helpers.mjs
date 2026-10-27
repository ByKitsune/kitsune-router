import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const PACKAGE = "@bykitsune/router";
// JavaScript's `$` also matches before a trailing newline. Publication IDs must
// match the complete string, never a prefix that can inject paths or outputs.
const exactMatch = (value, pattern) => typeof value === "string" && pattern.exec(value)?.[0] === value;
export function command(cmd, args, options = {}) {
  const timeout = options.timeout ?? Number(process.env.RELEASE_COMMAND_TIMEOUT_MS ?? 120000);
  assert(Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 1800000, "Invalid release command timeout (1–1800000 ms required)");
  // SIGKILL bounds even a subprocess that traps/ignores SIGTERM. A timed-out
  // registry write is ambiguous and must be reconciled by readback on a rerun.
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...options, timeout, killSignal: "SIGKILL" });
}
const stable = version => assert(exactMatch(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/), "Invalid stable version");

export function isolateVerification(env = process.env) {
  assert(env.RUNNER_TEMP && resolve(env.RUNNER_TEMP) === env.RUNNER_TEMP, "Absolute RUNNER_TEMP required for state isolation");
  const home = resolve(env.RUNNER_TEMP, "kitsune-router-home");
  const isolated = {
    HOME: home, DATA_DIR: resolve(env.RUNNER_TEMP, "kitsune-router-data"),
    XDG_CONFIG_HOME: resolve(home, ".config"), XDG_DATA_HOME: resolve(home, ".local/share"),
    XDG_CACHE_HOME: resolve(home, ".cache"), XDG_STATE_HOME: resolve(home, ".local/state"),
    RUN_REAL: "0", RUN_E2E: "0", RUN_LIVE_TESTS: "0", AG_CACHE_TEST: "0", MODEL_CATALOG_SYNC: "off",
    DISABLE_BACKGROUND_TOKEN_REFRESH: "1", KITSUNE_ROUTER_DISABLE_MITM: "1", NEXT_TELEMETRY_DISABLED: "1",
    KITSUNE_ROUTER_MIGRATION: "skip",
  };
  for (const path of [home, isolated.DATA_DIR, isolated.XDG_CONFIG_HOME, isolated.XDG_DATA_HOME, isolated.XDG_CACHE_HOME, isolated.XDG_STATE_HOME]) mkdirSync(path, { recursive: true });
  for (const [key, value] of Object.entries(isolated)) {
    assert(!/[\r\n]/.test(value), "Unsafe isolated environment path");
    appendFileSync(env.GITHUB_ENV, `${key}=${value}\n`);
  }
}

export function verifySource({ cwd = process.cwd(), env = process.env, command: run = command } = {}) {
  assert(exactMatch(env.GITHUB_SHA, /^[a-f0-9]{40}$/), "Invalid verification source SHA");
  assert(typeof env.GITHUB_REF === "string" && env.GITHUB_REF.startsWith("refs/"), "Missing verification source ref");
  const directory = resolve(cwd, "verification", env.GITHUB_SHA);
  mkdirSync(directory, { recursive: true });
  const report = resolve(directory, "vitest.json");
  const evidence = resolve(directory, "source.json");
  rmSync(evidence, { force: true });
  rmSync(report, { force: true });
  const execute = (cmd, args, extra = {}) => run(cmd, args, { cwd, env: { ...env, NODE_ENV: "test" }, timeout: 1800000, stdio: "inherit", ...extra });
  assert.equal(run("git", ["rev-parse", "HEAD"], { cwd, env }).trim(), env.GITHUB_SHA, "Verification checkout SHA mismatch");
  execute("npm", ["run", "check:brand"]);
  execute("npm", ["run", "lint", "--", "--max-warnings=0"]);
  execute("npm", ["test", "--", "--maxWorkers=2", "--reporter=default", "--reporter=json", `--outputFile=${report}`]);
  execute("node", ["tests/__baseline__/verify-no-regression.mjs", report]);
  const reportSha256 = createHash("sha256").update(readFileSync(report)).digest("hex");
  execute("npm", ["run", "test:compat"]);
  for (const args of [
    ["scripts/generate-provider-identity.mjs", "--check"],
    ["tests/__baseline__/verify-providers.mjs"],
    ["tests/__baseline__/verify-alias.mjs"],
    ["tests/__baseline__/verify-oauth-urls.mjs"],
  ]) execute("node", args);
  execute("npm", ["run", "build"], { env: { ...env, NODE_ENV: "production", NEXT_PHASE: "phase-production-build" } });
  assert.equal(createHash("sha256").update(readFileSync(report)).digest("hex"), reportSha256, "Verified report changed during source verification");
  writeFileSync(evidence, JSON.stringify({ sha: env.GITHUB_SHA, ref: env.GITHUB_REF, reportSha256 }) + "\n");
  return directory;
}
export function npmArtifact(version, run = command) {
  stable(version);
  try {
    const value = JSON.parse(run("npm", ["view", `${PACKAGE}@${version}`, "version", "dist.integrity", "--json", "--prefer-online"]));
    assert.equal(value.version, version, "Registry version mismatch");
    assert(exactMatch(value["dist.integrity"], /^sha512-[A-Za-z0-9+/]+={0,2}$/), "Missing registry integrity");
    return value;
  } catch (error) {
    // Only an explicit registry E404 means unpublished. Auth/network/parse errors abort.
    if (error.code === "ETIMEDOUT" || error.signal) throw error;
    for (const text of [error.stdout, error.stderr]) {
      try { if (JSON.parse(String(text)).error?.code === "E404") return null; } catch { /* not a registry JSON error */ }
    }
    throw error;
  }
}
export function verifyIntegrity(path, published) {
  assert(published && typeof published === "object", "npm registry has not confirmed the published version; cannot verify its integrity yet");
  const actual = "sha512-" + createHash("sha512").update(readFileSync(path)).digest("base64");
  assert.equal(actual, published["dist.integrity"], "Immutable npm tarball integrity mismatch");
}
export async function prepareTarball(version, { cwd = process.cwd(), env = process.env, command: run = command } = {}) {
  stable(version);
  assert(exactMatch(env.GITHUB_SHA, /^[a-f0-9]{40}$/), "Invalid source SHA");
  assert.equal(env.GITHUB_REF, `refs/tags/v${version}`, "Wrong release ref");
  const repo = env.GITHUB_REPOSITORY;
  assert(exactMatch(repo, /^[\w.-]+\/[\w.-]+$/), "Invalid repository");
  const file = `bykitsune-router-${version}-${env.GITHUB_SHA}.tgz`;
  const name = `npm-release-${version}-${env.GITHUB_SHA}`;
  const api = path => JSON.parse(run("gh", ["api", path]));
  const pages = path => JSON.parse(run("gh", ["api", "--paginate", "--slurp", path]));
  const published = npmArtifact(version, run);
  const current = api(`repos/${repo}/actions/runs/${env.GITHUB_RUN_ID}`);
  const trusted = r => r.workflow_id === current.workflow_id && r.path === ".github/workflows/release.yml" && r.head_sha === env.GITHUB_SHA && r.head_branch === `v${version}` && r.event === "workflow_dispatch";
  assert(trusted(current), "Current workflow source does not match release");
  const previous = pages(`repos/${repo}/actions/workflows/${current.workflow_id}/runs?head_sha=${env.GITHUB_SHA}&event=workflow_dispatch&per_page=100`).flatMap(p => p.workflow_runs);
  for (const candidate of [current, ...previous.filter(r => r.id !== current.id)]) {
    if (!trusted(candidate)) continue;
    const metadata = api(`repos/${repo}/actions/runs/${candidate.id}`);
    if (!trusted(metadata)) continue;
    const artifacts = pages(`repos/${repo}/actions/runs/${candidate.id}/artifacts?per_page=100`).flatMap(p => p.artifacts);
    const artifact = artifacts.find(a => a.name === name && !a.expired);
    if (!artifact) continue;
    const zip = run("gh", ["api", `repos/${repo}/actions/artifacts/${artifact.id}/zip`], { encoding: "buffer" });
    // Read a single expected regular-file entry; never extract archive paths to disk.
    const bytes = run("python3", ["-c", "import io,sys,zipfile,stat; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); es=z.infolist(); assert len(es)==1 and es[0].filename==sys.argv[1] and not es[0].is_dir() and not stat.S_ISLNK(es[0].external_attr>>16), 'Unsafe tarball archive'; sys.stdout.buffer.write(z.read(es[0]))", file], { input: zip, encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
    writeFileSync(resolve(cwd, file), bytes);
    if (published) verifyIntegrity(resolve(cwd, file), published);
    return { file, name, build: false, recovered: true };
  }
  assert(!published, "Published version requires its trusted original workflow artifact; refusing rebuild");
  return { file, name, build: true, recovered: false };
}

export function canPromote(version, current) {
  stable(version);
  if (current === null) return true; // confirmed absent, never an error fallback
  stable(current);
  const a = version.split(".").map(BigInt), b = current.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}
async function waitForNpmReadback(read, confirmed, { attempts = 12, wait = sleep } = {}) {
  assert(Number.isInteger(attempts) && attempts > 0, "Invalid npm readback attempt limit");
  for (let attempt = 0; attempt < attempts; attempt++) {
    const value = read(); // Auth, network and malformed-response errors remain terminal.
    if (confirmed(value)) return value;
    if (attempt + 1 < attempts) await wait(Math.min(1000 * 2 ** attempt, 30000));
  }
  throw new Error(`npm registry readback was not confirmed after ${attempts} attempts; retain the original CI tarball and retry verification without rebuilding it`);
}

export async function publishNpm(version, file, { command: run = command, ...readback } = {}) {
  const published = npmArtifact(version, run);
  if (published) {
    verifyIntegrity(file, published);
    return published;
  }
  // An accepted publish is never repeated just because registry reads lag.
  // Avoid a multi-thousand-file notice dump hiding the terminal registry error
  // when Node formats a failed execFileSync result. Do not suppress warnings,
  // retry writes, or weaken provenance/authorization checks.
  run("npm", ["publish", file, "--ignore-scripts", "--access", "public", "--provenance", "--loglevel", "warn", "--tag", `release-${version}`]);
  const confirmed = await waitForNpmReadback(() => npmArtifact(version, run), value => value !== null, readback);
  verifyIntegrity(file, confirmed);
  return confirmed;
}

export async function promoteNpm(version, run = command, readback = {}) {
  const latest = () => {
    const tags = JSON.parse(run("npm", ["view", PACKAGE, "dist-tags", "--json", "--prefer-online"]));
    assert(tags && typeof tags === "object" && !Array.isArray(tags), "Invalid npm dist-tags");
    return Object.hasOwn(tags, "latest") ? tags.latest : null;
  };
  if (!canPromote(version, latest())) return false;
  run("npm", ["dist-tag", "add", `${PACKAGE}@${version}`, "latest"]);
  const observed = await waitForNpmReadback(latest, current => current === version || !canPromote(version, current), readback);
  return observed === version;
}
export function githubLatest(version, repo, run = command) {
  let current;
  try { current = JSON.parse(run("gh", ["api", `repos/${repo}/releases/latest`])).tag_name; }
  catch (error) {
    if (error.code === "ETIMEDOUT" || error.signal) throw error;
    if (!String(error.stderr).includes("HTTP 404")) throw error;
    // Confirm repository access and absence of stable releases; a private-repo 404 is not absence.
    const releases = JSON.parse(run("gh", ["api", "--paginate", "--slurp", `repos/${repo}/releases?per_page=100`])).flat();
    assert(!releases.some(r => !r.draft && !r.prerelease), "Cannot resolve GitHub latest");
    return canPromote(version, null);
  }
  assert(typeof current === "string" && current.startsWith("v"), "Invalid GitHub latest tag");
  return canPromote(version, current.slice(1));
}
export function dockerLatest(image, repo, run = command) {
  let config;
  try { config = JSON.parse(run("docker", ["buildx", "imagetools", "inspect", `${image}:latest`, "--format", "{{json .Image}}"])); }
  catch (error) {
    // Only a registry's explicit missing manifest permits an initial latest tag.
    if (missingManifest(error)) return null;
    throw error;
  }
  const versions = dockerConfigs(config).map(value => {
    const labels = value.config?.Labels;
    assert(labels, "Missing Docker latest labels");
    let version = labels["org.opencontainers.image.version"];
    if (version === "latest") {
      const revision = labels["org.opencontainers.image.revision"];
      assert.equal(labels["org.opencontainers.image.source"], `https://github.com/${repo}`, "Untrusted legacy image source");
      assert(exactMatch(revision, /^[a-f0-9]{40}$/), "Invalid legacy image source revision");
      const source = JSON.parse(run("gh", ["api", `repos/${repo}/contents/package.json?ref=${revision}`]));
      assert.equal(source.encoding, "base64", "Invalid source package encoding");
      version = JSON.parse(Buffer.from(source.content, "base64").toString("utf8")).version;
    }
    stable(version);
    return version;
  });
  assert(versions.every(version => version === versions[0]), "Inconsistent Docker latest platform versions");
  return versions[0];
}

function dockerConfigs(value) {
  assert(value && typeof value === "object", "Missing Docker image configuration");
  const configs = value.config ? [value] : Object.values(value);
  assert(configs.length && configs.every(config => config?.config), "Invalid Docker platform configuration");
  return configs;
}
const validDigest = digest => assert(exactMatch(digest, /^sha256:[a-f0-9]{64}$/), "Invalid Docker immutable digest");
const missingManifest = error => error.code !== "ETIMEDOUT" && !error.signal && /manifest unknown/i.test(String(error.stderr)) && !/unauthorized|denied|401|403/i.test(String(error.stderr));
function dockerManifest(ref, run) {
  const value = JSON.parse(run("docker", ["buildx", "imagetools", "inspect", ref, "--format", "{{json .Manifest}}"]));
  validDigest(value.digest);
  return value;
}
function dockerSource(version, images, env) {
  stable(version);
  assert(exactMatch(env.GITHUB_SHA, /^[a-f0-9]{40}$/), "Invalid Docker source SHA");
  assert.equal(env.GITHUB_REF, `refs/tags/v${version}`, "Wrong Docker release ref");
  assert(exactMatch(env.GITHUB_REPOSITORY, /^[\w.-]+\/[\w.-]+$/), "Invalid Docker source repository");
  assert(images.length && new Set(images).size === images.length && images.every(image => exactMatch(image, /^[a-z0-9][a-z0-9./_-]*$/)), "Invalid Docker image repositories");
}
function verifyDockerConfig(image, digest, version, env, run) {
  const config = JSON.parse(run("docker", ["buildx", "imagetools", "inspect", `${image}@${digest}`, "--format", "{{json .Image}}"]));
  for (const value of dockerConfigs(config)) {
    const labels = value.config.Labels;
    assert.equal(labels?.["org.opencontainers.image.version"], version, "Immutable Docker version mismatch");
    assert.equal(labels?.["org.opencontainers.image.revision"], env.GITHUB_SHA, "Immutable Docker source SHA mismatch");
    assert.equal(labels?.["org.opencontainers.image.source"], `https://github.com/${env.GITHUB_REPOSITORY}`, "Immutable Docker source repository mismatch");
  }
}

export function prepareDocker(version, images, { env = process.env, command: run = command } = {}) {
  dockerSource(version, images, env);
  const digests = images.map(image => {
    let manifest;
    try { manifest = dockerManifest(`${image}:${version}`, run); }
    catch (error) { if (missingManifest(error)) return null; throw error; }
    verifyDockerConfig(image, manifest.digest, version, env, run);
    return manifest.digest;
  });
  if (digests.every(digest => digest === null)) return { build: true, context: `https://github.com/${env.GITHUB_REPOSITORY}.git#${env.GITHUB_SHA}` };
  // Cross-registry copying can rewrite indexes or omit referrers. Partial
  // publication requires deliberate recovery of the original digest, not a rebuild.
  assert(digests.every(digest => digest !== null), "Partial immutable Docker publication; recover the original digest to the missing registry without rebuilding");
  assert(digests.every(digest => digest === digests[0]), "Conflicting immutable Docker version digests; refusing overwrite or rebuild");
  return { build: false, digest: digests[0] };
}

export function verifyDocker(version, digest, images, { env = process.env, command: run = command } = {}) {
  validDigest(digest);
  const existing = prepareDocker(version, images, { env, command: run });
  assert(!existing.build && existing.digest === digest, "Published Docker digest does not match the verified immutable build");
  for (const image of images) {
    for (const [field, predicate] of [["Provenance", "SLSA"], ["SBOM", "SPDX"]]) {
      const value = JSON.parse(run("docker", ["buildx", "imagetools", "inspect", `${image}@${digest}`, "--format", `{{json .${field}}}`]));
      const predicates = value?.[predicate] ? [value] : Object.values(value || {});
      assert(predicates.length && predicates.every(value => value?.[predicate] && Object.keys(value[predicate]).length), `Missing Docker ${field} evidence`);
    }
  }
}

export function promoteDocker(version, digest, images, { env = process.env, command: run = command } = {}) {
  // Reruns must not bypass evidence verification just because the version now
  // exists: the first attempt may have stopped at a failed attestation check.
  verifyDocker(version, digest, images, { env, command: run });
  const canTag = image => {
    const current = dockerLatest(image, env.GITHUB_REPOSITORY, run);
    if (current === version) assert.equal(dockerManifest(`${image}:latest`, run).digest, digest, "Conflicting latest Docker version digest; refusing overwrite");
    return canPromote(version, current);
  };
  if (!images.every(canTag)) return false;
  for (const image of images) {
    // Recheck after the build, immediately before each mutable latest write.
    if (!canTag(image)) return false;
    run("docker", ["buildx", "imagetools", "create", "--prefer-index=false", "--tag", `${image}:latest`, `${image}@${digest}`]);
    assert.equal(dockerManifest(`${image}:latest`, run).digest, digest, "Docker latest digest readback mismatch; retry promotion without rebuilding");
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, version] = process.argv.slice(2);
  if (mode === "isolate") {
    isolateVerification();
  } else if (mode === "verify-source") {
    verifySource();
  } else if (mode === "docker-prepare") {
    const result = prepareDocker(version, process.argv.slice(4));
    for (const [key, value] of Object.entries(result)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  } else if (mode === "docker-verify") {
    verifyDocker(version, process.argv[4], process.argv.slice(5));
  } else if (mode === "docker-promote") {
    const promote = promoteDocker(version, process.argv[4], process.argv.slice(5));
    appendFileSync(process.env.GITHUB_OUTPUT, `promote=${promote}\n`);
  } else if (mode === "prepare") {
    const result = await prepareTarball(version);
    for (const [key, value] of Object.entries(result)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  } else if (mode === "publish") {
    const file = process.argv[4];
    await publishNpm(version, file);
  } else if (mode === "latest") {
    await promoteNpm(version);
    appendFileSync(process.env.GITHUB_OUTPUT, `github=${githubLatest(version, process.env.GITHUB_REPOSITORY)}\n`);
  } else if (mode === "docker-latest") {
    const versions = process.argv.slice(4).map(image => dockerLatest(image, process.env.GITHUB_REPOSITORY));
    const promote = versions.every(current => canPromote(version, current));
    appendFileSync(process.env.GITHUB_OUTPUT, `promote=${promote}\n`);
  } else throw Error("Unknown release publication command");
}
