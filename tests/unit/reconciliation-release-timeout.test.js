import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { command } from "../../scripts/release-publication-helpers.mjs";

const directories = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const helper = pathToFileURL(resolve(import.meta.dirname, "../../scripts/release-publication-helpers.mjs")).href;

describe("publication subprocess wall-clock bounds", () => {
  it.each(["npm", "gh", "docker"])("terminates an unresponsive %s even if it ignores SIGTERM", executable => {
    const dir = mkdtempSync(resolve(process.env.RUNNER_TEMP || tmpdir(), "reconciliation-timeout-"));
    directories.push(dir);
    const path = resolve(dir, executable);
    writeFileSync(path, `#!${process.execPath}\nprocess.on('SIGTERM', () => {}); setInterval(() => {}, 1000); setTimeout(() => process.exit(0), 2500);\n`);
    chmodSync(path, 0o755);
    const code = `import { command } from ${JSON.stringify(helper)}; try { command(${JSON.stringify(executable)}, ['offline-fixture']); process.exit(2); } catch (e) { console.log(JSON.stringify({ code: e.code, signal: e.signal })); }`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      encoding: "utf8", timeout: 1500, killSignal: "SIGKILL",
      env: { PATH: `${dir}:${process.env.PATH}`, HOME: dir, RELEASE_COMMAND_TIMEOUT_MS: "100" },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ code: "ETIMEDOUT", signal: "SIGKILL" });
  });

  it.each([0, -1, Infinity, NaN, 1800001])("rejects an unbounded or excessive timeout %s before starting a command", timeout => {
    expect(() => command(process.execPath, ["-e", "process.exit(0)"], { timeout })).toThrow(/timeout/i);
  });

  it.each([
    ["npm", "npmArtifact('0.9.7')", "process.stderr.write('{\"error\":{\"code\":\"E404\"}}');"],
    ["docker", "dockerLatest('joyccn/zenrouter', 'ZenRouter/ZenRouter')", "process.stderr.write('manifest unknown');"],
    ["gh", "githubLatest('0.9.7', 'ZenRouter/ZenRouter')", "if (!process.argv.at(-1).endsWith('/latest')) { console.log('[]'); process.exit(0); } process.stderr.write('HTTP 404');"],
  ])("never treats partial missing-artifact output from a timed-out %s as confirmed absence", (executable, expression, output) => {
    const dir = mkdtempSync(resolve(process.env.RUNNER_TEMP || tmpdir(), "reconciliation-timeout-"));
    directories.push(dir);
    const path = resolve(dir, executable);
    writeFileSync(path, `#!${process.execPath}\n${output} setInterval(() => {},1000);\n`);
    chmodSync(path, 0o755);
    const code = `import { npmArtifact, dockerLatest, githubLatest } from ${JSON.stringify(helper)}; try { ${expression}; console.log('incorrectly confirmed absence'); process.exit(2); } catch (e) { console.log(e.code); }`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 2000, env: { PATH: `${dir}:${process.env.PATH}`, HOME: dir, RELEASE_COMMAND_TIMEOUT_MS: "200" } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("ETIMEDOUT");
  });

});
