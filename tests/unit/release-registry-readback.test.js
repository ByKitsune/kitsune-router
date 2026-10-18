import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { npmArtifact, promoteNpm, publishNpm, verifyIntegrity } from "../../scripts/release-publication-helpers.mjs";

const directories = [];
const root = resolve(import.meta.dirname, "../..");
const version = "0.9.7";
const bytes = Buffer.from("immutable original CI tarball fixture");
const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function cliFixture(mode) {
  const directory = mkdtempSync(resolve(tmpdir(), "release-readback-"));
  directories.push(directory);
  const state = resolve(directory, "state.json");
  const artifact = resolve(directory, "original.tgz");
  const output = resolve(directory, "output");
  writeFileSync(state, JSON.stringify({ views: 0, publishes: 0, tags: 0 }));
  writeFileSync(artifact, bytes);
  writeFileSync(output, "");
  const npm = resolve(directory, "npm");
  writeFileSync(npm, `#!/usr/bin/env node
const fs = require("node:fs");
const state = JSON.parse(fs.readFileSync(process.env.FIXTURE_STATE, "utf8"));
const args = process.argv.slice(2);
if (args[0] === "view") {
  state.views++;
  fs.writeFileSync(process.env.FIXTURE_STATE, JSON.stringify(state));
  if (args[2] === "dist-tags") {
    console.log(JSON.stringify({ latest: state.views < 3 ? "0.9.6" : "0.9.7" }));
  } else if (state.views < 3) {
    console.error(JSON.stringify({ error: { code: "E404" } }));
    process.exit(1);
  } else {
    console.log(JSON.stringify({ version: "0.9.7", "dist.integrity": process.env.FIXTURE_INTEGRITY }));
  }
} else if (args[0] === "publish") {
  state.publishes++;
  fs.writeFileSync(process.env.FIXTURE_STATE, JSON.stringify(state));
} else if (args[0] === "dist-tag" && args[1] === "add") {
  state.tags++;
  fs.writeFileSync(process.env.FIXTURE_STATE, JSON.stringify(state));
} else {
  throw Error("Unexpected npm command");
}
`);
  chmodSync(npm, 0o755);
  const gh = resolve(directory, "gh");
  writeFileSync(gh, '#!/usr/bin/env node\nconsole.log(JSON.stringify({ tag_name: "v0.9.6" }));\n');
  chmodSync(gh, 0o755);
  const result = spawnSync(process.execPath, [resolve(root, "scripts/release-publication-helpers.mjs"), mode, version, ...(mode === "publish" ? [artifact] : [])], {
    cwd: directory, encoding: "utf8", timeout: 10000,
    env: { PATH: `${directory}:${process.env.PATH}`, HOME: directory, GITHUB_OUTPUT: output,
      GITHUB_REPOSITORY: "ZenRouter/ZenRouter", FIXTURE_STATE: state, FIXTURE_INTEGRITY: integrity },
  });
  return { result, state: JSON.parse(readFileSync(state, "utf8")), artifact: readFileSync(artifact), output: readFileSync(output, "utf8") };
}

describe("release CLI tolerates delayed registry readback", () => {
  it("confirms a successful publish after one stale E404 without publishing or rebuilding twice", () => {
    const fixture = cliFixture("publish");
    expect(fixture.result.status, fixture.result.stderr).toBe(0);
    expect(fixture.state).toEqual({ views: 3, publishes: 1, tags: 0 });
    expect(fixture.artifact).toEqual(bytes);
  });

  it("waits for a stale latest read after one tag write before finalizing the GitHub release", () => {
    const fixture = cliFixture("latest");
    expect(fixture.result.status, fixture.result.stderr).toBe(0);
    expect(fixture.state).toEqual({ views: 3, publishes: 0, tags: 1 });
    expect(fixture.output).toContain("github=true");
  });
});

const published = { version, "dist.integrity": integrity };
const missing = () => Object.assign(new Error("Not yet visible"), { stderr: '{"error":{"code":"E404"}}' });

function publication(reads) {
  const directory = mkdtempSync(resolve(tmpdir(), "release-readback-policy-"));
  directories.push(directory);
  const artifact = resolve(directory, "original.tgz");
  writeFileSync(artifact, bytes);
  const calls = [];
  const waits = [];
  const command = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args[0] === "publish" || args[0] === "dist-tag") return "";
    const value = reads.shift();
    if (value instanceof Error) throw value;
    return JSON.stringify(value);
  };
  return { artifact, calls, waits, command, wait: async delay => { waits.push(delay); } };
}

describe("bounded npm publication readback", () => {
  it("revalidates package metadata rather than trusting a stale npm cache", () => {
    npmArtifact(version, (command, args) => {
      expect(command).toBe("npm");
      expect(args).toContain("--prefer-online");
      return JSON.stringify(published);
    });
  });

  it("backs off only registry reads while keeping the original upload and bytes", async () => {
    const fixture = publication([missing(), missing(), missing(), published]);
    expect(await publishNpm(version, fixture.artifact, fixture)).toEqual(published);
    expect(fixture.calls.filter(call => call[1] === "publish")).toHaveLength(1);
    expect(fixture.waits).toEqual([1000, 2000]);
    expect(readFileSync(fixture.artifact)).toEqual(bytes);
  });

  it("stops with a meaningful timeout instead of dereferencing null", async () => {
    const fixture = publication([missing(), missing(), missing()]);
    await expect(publishNpm(version, fixture.artifact, { ...fixture, attempts: 2 })).rejects.toThrow(/not confirmed after 2 attempts.*original CI tarball/);
    expect(fixture.waits).toEqual([1000]);
    expect(fixture.calls.filter(call => call[1] === "publish")).toHaveLength(1);
  });

  it("never republishes an already visible immutable version", async () => {
    const fixture = publication([published]);
    expect(await publishNpm(version, fixture.artifact, fixture)).toEqual(published);
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.waits).toEqual([]);
  });

  it("rejects a different immutable artifact without retrying or publishing", async () => {
    const fixture = publication([{ version, "dist.integrity": "sha512-" + Buffer.from("different").toString("base64") }]);
    await expect(publishNpm(version, fixture.artifact, fixture)).rejects.toThrow(/integrity mismatch/);
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.waits).toEqual([]);
  });

  it("does not retry authentication errors returned after an accepted publish", async () => {
    const denied = Object.assign(new Error("E401 Unauthorized"), { stderr: '{"error":{"code":"E401"}}' });
    const fixture = publication([missing(), denied]);
    await expect(publishNpm(version, fixture.artifact, fixture)).rejects.toThrow(/Unauthorized/);
    expect(fixture.calls.filter(call => call[1] === "publish")).toHaveLength(1);
    expect(fixture.waits).toEqual([]);
  });

  it("propagates publish failure without pretending to wait for a successful upload", async () => {
    const fixture = publication([missing()]);
    const command = (cmd, args) => {
      if (args[0] === "publish") throw new Error("Publication denied");
      return fixture.command(cmd, args);
    };
    await expect(publishNpm(version, fixture.artifact, { ...fixture, command })).rejects.toThrow("Publication denied");
    expect(fixture.waits).toEqual([]);
  });

  it("caps readback delays rather than growing them without bound", async () => {
    const fixture = publication(Array.from({ length: 9 }, missing));
    await expect(publishNpm(version, fixture.artifact, { ...fixture, attempts: 8 })).rejects.toThrow(/after 8 attempts/);
    expect(fixture.waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(fixture.calls.filter(call => call[1] === "publish")).toHaveLength(1);
  });

  it("reports missing registry metadata before any integrity dereference", () => {
    expect(() => verifyIntegrity("unused-path", null)).toThrow(/registry has not confirmed/);
  });
});

describe("bounded latest-tag readback", () => {
  it("waits for propagation without writing latest repeatedly", async () => {
    const fixture = publication([{ latest: "0.9.6" }, { latest: "0.9.6" }, { latest: version }]);
    expect(await promoteNpm(version, fixture.command, fixture)).toBe(true);
    expect(fixture.calls.filter(call => call[1] === "dist-tag")).toHaveLength(1);
    expect(fixture.waits).toEqual([1000]);
  });

  it("does not roll back a newer release that becomes visible during readback", async () => {
    const fixture = publication([{ latest: "0.9.6" }, { latest: "0.9.8" }]);
    expect(await promoteNpm(version, fixture.command, fixture)).toBe(false);
    expect(fixture.calls.filter(call => call[1] === "dist-tag")).toHaveLength(1);
    expect(fixture.waits).toEqual([]);
  });

  it("fails explicitly when latest never confirms the requested version", async () => {
    const fixture = publication(Array.from({ length: 3 }, () => ({ latest: "0.9.6" })));
    await expect(promoteNpm(version, fixture.command, { ...fixture, attempts: 2 })).rejects.toThrow(/not confirmed after 2 attempts/);
    expect(fixture.calls.filter(call => call[1] === "dist-tag")).toHaveLength(1);
    expect(fixture.waits).toEqual([1000]);
  });
});
