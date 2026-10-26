import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readExistingConfig } from "@/lib/cliTools/readExistingConfig.js";

let dir;

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "kitsunerouter-clitools-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("readExistingConfig", () => {
  it("returns null when the file does not exist", async () => {
    await expect(readExistingConfig(path.join(dir, "absent.json"), JSON.parse)).resolves.toBeNull();
  });

  it("returns the parsed contents when the file is valid", async () => {
    const file = path.join(dir, "auth.json");
    await fsp.writeFile(file, JSON.stringify({ tokens: { access: "keep-me" } }));

    await expect(readExistingConfig(file, JSON.parse)).resolves.toEqual({
      tokens: { access: "keep-me" },
    });
  });

  it("throws instead of reporting an empty config when the file is malformed", async () => {
    const file = path.join(dir, "auth.json");
    await fsp.writeFile(file, '{"tokens": {"access": "keep-me"');

    await expect(readExistingConfig(file, JSON.parse)).rejects.toThrow(/refusing to overwrite it/);
    // The point of throwing: the file is still there, untouched.
    expect(fs.readFileSync(file, "utf-8")).toBe('{"tokens": {"access": "keep-me"');
  });

  it("names the file in the error so the user can fix it", async () => {
    const file = path.join(dir, "config.toml");
    await fsp.writeFile(file, "not = = toml");

    await expect(
      readExistingConfig(file, (raw) => { throw new SyntaxError(`bad TOML near ${raw.length}`); })
    ).rejects.toThrow(new RegExp(`${path.basename(file)}.*bad TOML`));
  });

  it("propagates a read failure that is not ENOENT", async () => {
    const asDirectory = path.join(dir, "auth.json");
    fs.mkdirSync(asDirectory);

    await expect(readExistingConfig(asDirectory, JSON.parse)).rejects.toThrow();
  });

  it("does not swallow a parser that returns undefined", async () => {
    const file = path.join(dir, "empty.json");
    await fsp.writeFile(file, "");

    await expect(readExistingConfig(file, () => undefined)).resolves.toBeUndefined();
  });
});

describe("codex-settings and copilot-settings safety", () => {
  it("codex-settings no longer treats an unreadable config or auth file as empty", () => {
    const src = fs.readFileSync(
      new URL("../../src/app/api/cli-tools/codex-settings/route.js", import.meta.url),
      "utf8"
    );

    expect(src).toContain("readExistingConfig(configPath");
    expect(src).toContain("readExistingConfig(authPath, JSON.parse)");
    expect(src).not.toContain("catch { /* No existing config */ }");
    expect(src).not.toContain("catch { /* No existing auth */ }");
  });

  it("copilot-settings no longer treats an unreadable provider file as empty", () => {
    const src = fs.readFileSync(
      new URL("../../src/app/api/cli-tools/copilot-settings/route.js", import.meta.url),
      "utf8"
    );

    expect(src).toContain("readExistingConfig(configPath, JSON.parse)");
    expect(src).not.toContain("catch { /* No existing config */ }");
  });
});
