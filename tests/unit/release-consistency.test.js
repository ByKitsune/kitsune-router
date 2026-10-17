import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = path => readFileSync(resolve(root, path), "utf8");
const json = path => JSON.parse(read(path));
const version = json("package.json").version;
const packages = ["", "cli/", "tests/", "gitbook/"];

describe("release version and publication consistency", () => {
  it.each(packages)("aligns %s manifest and both lock metadata versions with the app", prefix => {
    expect(json(prefix + "package.json").version).toBe(version);
    const lock = json(prefix + "package-lock.json");
    expect(lock.version).toBe(version);
    expect(lock.packages[""].version).toBe(version);
  });

  it("records the current release in root notes and technical docs", () => {
    expect(read("CHANGELOG.md")).toContain(`## [${version}]`);
    expect(existsSync(resolve(root, `docs/CHANGELOG_v${version}.md`))).toBe(true);
    expect(existsSync(resolve(root, `releases/RELEASE_NOTES_v${version}.md`))).toBe(true);
  });

  it.each(["en", "vi", "zh-CN", "es", "ja"])("provides the current release changelog and introduction link in %s", lang => {
    const page = `gitbook/content/${lang}/changelog.md`;
    expect(existsSync(resolve(root, page))).toBe(true);
    expect(read(page)).toContain(`0.9.`);
    expect(read(page)).toContain(version);
    expect(read(`gitbook/content/${lang}/index.md`)).toContain(`/${lang}/changelog`);
  });
});
