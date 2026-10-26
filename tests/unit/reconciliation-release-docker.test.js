import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "../..");
const directories = [];
const sha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const images = ["ghcr.io/bykitsune/kitsune-router", "bykitsune/kitsune-router"];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(mode, scenario = "existing") {
  const dir = mkdtempSync(resolve(process.env.RUNNER_TEMP || tmpdir(), "reconciliation-docker-"));
  directories.push(dir);
  const output = resolve(dir, "output");
  const log = resolve(dir, "calls.jsonl");
  const state = resolve(dir, "state.json");
  writeFileSync(output, "");
  writeFileSync(log, "");
  writeFileSync(state, JSON.stringify({ tagged: [] }));
  const docker = resolve(dir, "docker");
  writeFileSync(docker, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(args)+'\\n');
const state = JSON.parse(fs.readFileSync(process.env.FIXTURE_STATE, 'utf8'));
const scenario = process.env.SCENARIO;
const digest = 'sha256:' + 'b'.repeat(64);
if (args[0] !== 'buildx' || args[1] !== 'imagetools') throw Error('Unexpected Docker command');
if (args[2] === 'create') {
  if (!args.includes('--prefer-index=false')) throw Error('Would rewrite the immutable manifest');
  const tag = args[args.indexOf('--tag')+1];
  if (!tag.endsWith(':latest')) throw Error('Attempted immutable version write');
  state.tagged.push(tag); fs.writeFileSync(process.env.FIXTURE_STATE, JSON.stringify(state));
  process.exit(0);
}
if (args[2] !== 'inspect') throw Error('Unexpected Docker mutation');
const ref = args[3];
const latest = ref.endsWith(':latest');
if (scenario === 'auth') { console.error('401 Unauthorized: manifest unknown'); process.exit(1); }
if (!latest && !ref.includes('@') && (scenario === 'missing' || (scenario === 'partial' && ref.startsWith('bykitsune/')))) { console.error('manifest unknown'); process.exit(1); }
const observed = (scenario === 'conflict' && ref.startsWith('bykitsune/')) || (scenario === 'latest-conflict' && latest) ? 'sha256:'+'c'.repeat(64) : digest;
if (args.at(-1) === '{{json .Manifest}}') {
  console.log(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', digest: observed, manifests: [{digest: 'sha256:'+'d'.repeat(64), platform: {os:'linux',architecture:'amd64'}}, {digest: 'sha256:'+'e'.repeat(64), platform: {os:'unknown',architecture:'unknown'}, annotations: {'vnd.docker.reference.type':'attestation-manifest'}}] }));
} else if (args.at(-1) === '{{json .Image}}') {
  const version = latest && scenario === 'newer' ? '0.9.8' : latest && scenario === 'latest-conflict' ? '0.9.7' : latest && !state.tagged.includes(ref) ? '0.9.6' : '0.9.7';
  const config = { architecture:'amd64', os:'linux', config:{Labels:{'org.opencontainers.image.version':version, 'org.opencontainers.image.revision': scenario === 'wrong-sha' ? 'f'.repeat(40) : 'a'.repeat(40), 'org.opencontainers.image.source': scenario === 'wrong-source' ? 'https://github.com/untrusted/repo' : 'https://github.com/ByKitsune/kitsune-router'}}};
  console.log(JSON.stringify(scenario === 'multiplatform' ? {'linux/amd64':config} : config));
} else if (args.at(-1) === '{{json .Provenance}}') {
  console.log(JSON.stringify(scenario === 'no-provenance' ? null : {SLSA:{buildType:'https://mobyproject.org/buildkit@v1'}}));
} else if (args.at(-1) === '{{json .SBOM}}') {
  console.log(JSON.stringify(scenario === 'no-sbom' ? null : {SPDX:{spdxVersion:'SPDX-2.3'}}));
} else throw Error('Unexpected Docker format');
`);
  chmodSync(docker, 0o755);
  const args = [resolve(root, "scripts/release-publication-helpers.mjs"), mode, "0.9.7", ...(mode === "docker-prepare" ? [] : [digest]), ...images];
  const result = spawnSync(process.execPath, args, {
    cwd: dir, encoding: "utf8", timeout: 5000,
    env: { PATH: `${dir}:${process.env.PATH}`, HOME: dir, GITHUB_OUTPUT: output, GITHUB_REPOSITORY: "ByKitsune/kitsune-router", GITHUB_SHA: sha, GITHUB_REF: "refs/tags/v0.9.7", FIXTURE_LOG: log, FIXTURE_STATE: state, SCENARIO: scenario },
  });
  return { result, output: readFileSync(output, "utf8"), calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)), state: JSON.parse(readFileSync(state, "utf8")) };
}

describe("Docker immutable version reconciliation through the real CLI", () => {
  it("plans a build only after both registries explicitly confirm absence", () => {
    const f = fixture("docker-prepare", "missing");
    expect(f.result.status, f.result.stderr).toBe(0);
    expect(f.output).toContain("build=true\n");
    expect(f.calls).toHaveLength(2);
  });

  it("plans new Docker builds from the exact Git commit, not a mutable tag or post-test workspace", () => {
    const f = fixture("docker-prepare", "missing");
    expect(f.result.status, f.result.stderr).toBe(0);
    const outputs = Object.fromEntries(f.output.trim().split("\n").map(line => line.split("=")));
    expect(outputs.context).toBe("https://github.com/ByKitsune/kitsune-router.git#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it.each(["existing", "multiplatform"])("reuses the original %s digest without a build or tag write", scenario => {
    const f = fixture("docker-prepare", scenario);
    expect(f.result.status, f.result.stderr).toBe(0);
    expect(f.output).toContain("build=false\n");
    expect(f.output).toContain(`digest=${digest}\n`);
    expect(f.state.tagged).toEqual([]);
    expect(f.calls.filter(c => c.at(-1) === "{{json .Image}}").every(c => c[3].endsWith(`@${digest}`))).toBe(true);
  });

  it.each([
    ["partial", /Partial immutable Docker publication/],
    ["conflict", /Conflicting immutable Docker version digests/],
    ["wrong-sha", /Immutable Docker source SHA mismatch/],
    ["wrong-source", /Immutable Docker source repository mismatch/],
    ["auth", /401 Unauthorized/],
  ])("fails closed on %s rather than overwriting or rebuilding a version", (scenario, reason) => {
    const f = fixture("docker-prepare", scenario);
    expect(f.result.status).not.toBe(0);
    expect(f.result.stderr).toMatch(reason);
    expect(f.output).toBe("");
    expect(f.state.tagged).toEqual([]);
  });

  it("verifies the build digest and both attached evidence types before promotion", () => {
    const f = fixture("docker-verify");
    expect(f.result.status, f.result.stderr).toBe(0);
    expect(f.calls.filter(c => c.at(-1) === "{{json .SBOM}}")).toHaveLength(2);
    expect(f.calls.filter(c => c.at(-1) === "{{json .Provenance}}")).toHaveLength(2);
  });

  it.each(["conflict", "no-provenance", "no-sbom"])("rejects newly published %s evidence without mutating latest", scenario => {
    const f = fixture("docker-verify", scenario);
    expect(f.result.status).not.toBe(0);
    expect(f.result.stderr).not.toContain("Unknown release publication command");
    expect(f.state.tagged).toEqual([]);
  });

  it("promotes only the verified immutable digest, preserving the index and attestations", () => {
    const f = fixture("docker-promote");
    expect(f.result.status, f.result.stderr).toBe(0);
    expect(f.state.tagged).toEqual(images.map(image => `${image}:latest`));
    expect(f.calls.filter(c => c[2] === "create")).toEqual(images.map(image => ["buildx", "imagetools", "create", "--prefer-index=false", "--tag", `${image}:latest`, `${image}@${digest}`]));
  });

  it("never rolls a newer latest back when retrying an older immutable version", () => {
    const f = fixture("docker-promote", "newer");
    expect(f.result.status, f.result.stderr).toBe(0);
    expect(f.state.tagged).toEqual([]);
  });

  it.each(["no-provenance", "no-sbom"])("does not bypass %s verification by retrying promotion after a failed build verification", scenario => {
    const f = fixture("docker-promote", scenario);
    expect(f.result.status).not.toBe(0);
    expect(f.state.tagged).toEqual([]);
  });

  it("rejects the same latest version pointing at a different immutable digest", () => {
    const f = fixture("docker-promote", "latest-conflict");
    expect(f.result.status).not.toBe(0);
    expect(f.state.tagged).toEqual([]);
  });
});
