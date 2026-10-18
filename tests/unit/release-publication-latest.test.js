import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
async function policy() { return import("../../scripts/release-publication-helpers.mjs"); }
describe("monotonic latest publication", () => {
  it.each([["0.9.7", "0.9.6", true], ["0.9.6", "0.9.7", false], ["0.9.7", "0.9.7", true], ["0.9.10", "0.9.9", true], ["1.0.0", "0.99.99", true]])("compares %s to %s without lexical ordering", async (a, b, result) => {
    expect((await policy()).canPromote(a, b)).toBe(result);
  });
  it.each(["latest", "01.2.3", "0.9.7-beta", "", undefined])("invalid latest %s fails closed", async current => {
    const { canPromote } = await policy();
    expect(() => canPromote("0.9.7", current)).toThrow();
  });
  it("older npm retry does not mutate latest", async () => {
    const calls = [];
    const run = (cmd, args) => { calls.push([cmd, ...args]); return '{"latest":"0.9.8"}'; };
    expect(await (await policy()).promoteNpm("0.9.7", run)).toBe(false);
    expect(calls.some(c => c.includes("add"))).toBe(false);
  });
  it("new npm publication promotes only after querying latest and verifies readback", async () => {
    const calls = [];
    const run = (cmd, args) => { calls.push([cmd, ...args]); return JSON.stringify({ latest: calls.some(c => c.includes("add")) ? "0.9.7" : "0.9.6" }); };
    expect(await (await policy()).promoteNpm("0.9.7", run)).toBe(true);
    expect(calls[1]).toEqual(["npm", "dist-tag", "add", "@joyccn/zenrouter@0.9.7", "latest"]);
    expect(calls).toHaveLength(3);
  });
  it("uses npm view JSON because dist-tag ls ignores --json", async () => {
    const { promoteNpm } = await policy();
    const run = (cmd, args) => {
      expect(args).toEqual(["view", "@joyccn/zenrouter", "dist-tags", "--json", "--prefer-online"]);
      return '{"latest":"0.9.8"}';
    };
    expect(await promoteNpm("0.9.7", run)).toBe(false);
  });
  it("npm auth/network errors never assume an empty latest", async () => {
    const { promoteNpm } = await policy();
    await expect(promoteNpm("0.9.7", () => { throw Error("E401"); })).rejects.toThrow("E401");
  });
  it("older GitHub release is not marked latest", async () => {
    expect((await policy()).githubLatest("0.9.7", "ZenRouter/ZenRouter", () => '{"tag_name":"v0.9.8"}')).toBe(false);
  });
  it("legacy Docker latest label derives version from its verified source revision", async () => {
    const calls = [];
    const run = (cmd, args) => {
      calls.push([cmd, ...args]);
      if (cmd === "docker") return JSON.stringify({ config: { Labels: { "org.opencontainers.image.version": "latest", "org.opencontainers.image.revision": "8efe4406d296df7043975496915afebbff7211a7", "org.opencontainers.image.source": "https://github.com/ZenRouter/ZenRouter" } } });
      return JSON.stringify({ content: Buffer.from('{"version":"0.9.6"}').toString("base64"), encoding: "base64" });
    };
    expect((await policy()).dockerLatest("joyccn/zenrouter", "ZenRouter/ZenRouter", run)).toBe("0.9.6");
    expect(calls[1][2]).toContain("ref=8efe4406d296df7043975496915afebbff7211a7");
  });
  it("older Docker version retains its version tag but cannot overwrite latest", async () => {
    const run = () => JSON.stringify({ config: { Labels: { "org.opencontainers.image.version": "0.9.8" } } });
    const { dockerLatest, canPromote } = await policy();
    expect(canPromote("0.9.7", dockerLatest("joyccn/zenrouter", "ZenRouter/ZenRouter", run))).toBe(false);
  });
  it("legacy Docker label rejects an untrusted source repository", async () => {
    const { dockerLatest } = await policy();
    const run = () => JSON.stringify({ config: { Labels: { "org.opencontainers.image.version": "latest", "org.opencontainers.image.revision": "a".repeat(40), "org.opencontainers.image.source": "https://github.com/untrusted/repo" } } });
    expect(() => dockerLatest("joyccn/zenrouter", "ZenRouter/ZenRouter", run)).toThrow(/source/);
  });
  it("Docker confirmed missing manifest permits an initial latest", async () => {
    const { dockerLatest, canPromote } = await policy();
    const run = () => { const e = Error("missing"); e.stderr = "manifest unknown"; throw e; };
    expect(canPromote("0.9.7", dockerLatest("joyccn/zenrouter", "ZenRouter/ZenRouter", run))).toBe(true);
  });
  it("GitHub auth errors cannot mark a historical release latest", async () => {
    const { githubLatest } = await policy();
    expect(() => githubLatest("0.9.7", "ZenRouter/ZenRouter", () => { throw Error("401 Unauthorized"); })).toThrow("401");
  });
  it("Docker private/auth failure never defaults latest to zero", async () => {
    const { dockerLatest } = await policy();
    expect(() => dockerLatest("ghcr.io/zenrouter/zenrouter", "ZenRouter/ZenRouter", () => { throw Error("401 Unauthorized"); })).toThrow("401");
  });
  it("each workflow serializes latest across all release versions", () => {
    for (const [name, group] of [["release", "npm-release"], ["docker-publish", "docker-release"]]) {
      const text = readFileSync(resolve(root, `.github/workflows/${name}.yml`), "utf8");
      expect(text).toContain(`group: ${group}\n`);
      expect(text).not.toContain(`group: ${group}-`);
    }
    const release = readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8");
    expect(release).toContain("make_latest: ${{ steps.latest.outputs.github }}");
    const docker = readFileSync(resolve(root, ".github/workflows/docker-publish.yml"), "utf8");
    expect(docker).toContain("enable=${{ steps.latest.outputs.promote }}");
  });
});
