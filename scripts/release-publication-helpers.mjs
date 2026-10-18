import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const PACKAGE = "@joyccn/zenrouter";
export const command = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...options });
const stable = version => assert(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version), "Invalid stable version");
export function npmArtifact(version, run = command) {
  stable(version);
  try {
    const value = JSON.parse(run("npm", ["view", `${PACKAGE}@${version}`, "version", "dist.integrity", "--json", "--prefer-online"]));
    assert.equal(value.version, version, "Registry version mismatch");
    assert(/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(value["dist.integrity"]), "Missing registry integrity");
    return value;
  } catch (error) {
    // Only an explicit registry E404 means unpublished. Auth/network/parse errors abort.
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
  assert(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA), "Invalid source SHA");
  assert.equal(env.GITHUB_REF, `refs/tags/v${version}`, "Wrong release ref");
  const repo = env.GITHUB_REPOSITORY;
  assert(/^[\w.-]+\/[\w.-]+$/.test(repo), "Invalid repository");
  const file = `joyccn-zenrouter-${version}-${env.GITHUB_SHA}.tgz`;
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
  run("npm", ["publish", file, "--ignore-scripts", "--access", "public", "--provenance", "--tag", `release-${version}`]);
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
    if (/manifest unknown/i.test(String(error.stderr)) && !/unauthorized|denied|401|403/i.test(String(error.stderr))) return null;
    throw error;
  }
  const labels = config.config?.Labels;
  assert(labels, "Missing Docker latest labels");
  let version = labels["org.opencontainers.image.version"];
  if (version === "latest") {
    const revision = labels["org.opencontainers.image.revision"];
    assert.equal(labels["org.opencontainers.image.source"], `https://github.com/${repo}`, "Untrusted legacy image source");
    assert(/^[a-f0-9]{40}$/.test(revision), "Invalid legacy image source revision");
    const source = JSON.parse(run("gh", ["api", `repos/${repo}/contents/package.json?ref=${revision}`]));
    assert.equal(source.encoding, "base64", "Invalid source package encoding");
    version = JSON.parse(Buffer.from(source.content, "base64").toString("utf8")).version;
  }
  stable(version);
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, version] = process.argv.slice(2);
  if (mode === "prepare") {
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
