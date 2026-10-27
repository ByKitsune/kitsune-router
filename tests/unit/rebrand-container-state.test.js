import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { ensureRuntimeSecrets } = require("../../cli/hooks/runtimeSecrets.js");
const root = path.resolve(import.meta.dirname, "../..");
const directories = [];
const keys = ["JWT_SECRET", "API_KEY_SECRET", "MACHINE_ID_SALT"];
const stored = {
  JWT_SECRET: "synthetic-persisted-session-secret-0000000000",
  API_KEY_SECRET: "synthetic-persisted-api-key-secret-0000000000",
  MACHINE_ID_SALT: "synthetic-persisted-machine-salt-00000000000",
};
const explicit = "synthetic-explicit-operator-override-0000000000";

function fixture() {
  const directory = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), "rebrand-container-state-"));
  directories.push(directory);
  return {
    directory,
    env: { DATA_DIR: directory },
    json: path.join(directory, "secrets.json"),
    legacy: path.join(directory, "secrets.env"),
  };
}

function writeJson(f, values = stored) {
  const content = JSON.stringify(values, null, 2) + "\n";
  fs.writeFileSync(f.json, content, { mode: 0o600 });
  return content;
}

function writeLegacy(f, values = stored) {
  const content = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  fs.writeFileSync(f.legacy, content, { mode: 0o600 });
  return content;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("shared CLI/container persisted secret resolution", () => {
  it("imports legacy Docker values into durable private JSON without changing legacy bytes", () => {
    const f = fixture();
    const content = writeLegacy(f);
    const sync = vi.spyOn(fs, "fsyncSync");
    expect(ensureRuntimeSecrets(f.env)).toEqual(stored);
    expect(JSON.parse(fs.readFileSync(f.json, "utf8"))).toEqual(stored);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(content);
    expect(ensureRuntimeSecrets(f.env)).toEqual(stored);
    expect(sync.mock.calls.length).toBeGreaterThanOrEqual(process.platform === "win32" ? 1 : 2);
    if (process.platform !== "win32") expect(fs.statSync(f.json).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(f.directory).sort()).toEqual(["secrets.env", "secrets.json"]);
  });

  it("leaves complete matching JSON and env originals byte-for-byte unchanged", () => {
    const f = fixture();
    const json = writeJson(f);
    const legacy = writeLegacy(f);
    const inode = fs.statSync(f.json).ino;
    expect(ensureRuntimeSecrets(f.env)).toEqual(stored);
    expect(fs.readFileSync(f.json, "utf8")).toBe(json);
    expect(fs.statSync(f.json).ino).toBe(inode);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(legacy);
  });

  it("keeps a JSON-only CLI installation's effective keys unchanged in the container resolver", () => {
    const f = fixture();
    const content = writeJson(f);
    expect(ensureRuntimeSecrets(f.env)).toEqual(stored);
    expect(fs.readFileSync(f.json, "utf8")).toBe(content);
    expect(fs.existsSync(f.legacy)).toBe(false);
  });

  it("resolves API and identity keys from legacy persistence even with an explicit JWT", () => {
    const f = fixture();
    const content = writeLegacy(f);
    expect(ensureRuntimeSecrets({ ...f.env, JWT_SECRET: explicit })).toEqual({ ...stored, JWT_SECRET: explicit });
    expect(JSON.parse(fs.readFileSync(f.json, "utf8"))).toEqual(stored);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(content);
    expect(ensureRuntimeSecrets(f.env)).toEqual(stored);
  });

  it("generates and persists only absent keys on a fresh explicit-JWT installation", () => {
    const f = fixture();
    const resolved = ensureRuntimeSecrets({ ...f.env, JWT_SECRET: explicit });
    expect(resolved.JWT_SECRET).toBe(explicit);
    for (const key of keys.slice(1)) expect(resolved[key]).toMatch(/^[a-f0-9]{64}$/);
    expect(ensureRuntimeSecrets(f.env)).toEqual(resolved);
  });

  it("merges complementary stores without replacing any existing key", () => {
    const f = fixture();
    writeJson(f, { JWT_SECRET: stored.JWT_SECRET });
    const legacy = writeLegacy(f, { API_KEY_SECRET: stored.API_KEY_SECRET, MACHINE_ID_SALT: stored.MACHINE_ID_SALT });
    expect(ensureRuntimeSecrets(f.env)).toEqual(stored);
    expect(JSON.parse(fs.readFileSync(f.json, "utf8"))).toEqual(stored);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(legacy);
  });

  it.each(keys)("rejects conflicting %s unless that exact key has a valid explicit override", key => {
    const f = fixture();
    const json = writeJson(f);
    const legacy = writeLegacy(f, { ...stored, [key]: explicit });
    const otherKey = keys.find(value => value !== key);
    expect(() => ensureRuntimeSecrets({ ...f.env, [otherKey]: explicit })).toThrow(/conflicts/);
    expect(() => ensureRuntimeSecrets({ ...f.env, [key]: "short" })).toThrow(/conflicts/);
    expect(ensureRuntimeSecrets({ ...f.env, [key]: explicit })).toEqual({ ...stored, [key]: explicit });
    expect(fs.readFileSync(f.json, "utf8")).toBe(json);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(legacy);
  });

  it.each(keys)("fails closed on a short persisted %s rather than changing historical derivation", key => {
    const f = fixture();
    const json = writeJson(f, { ...stored, [key]: "historical-short-value" });
    const legacy = writeLegacy(f);
    expect(() => ensureRuntimeSecrets(f.env)).toThrow(/invalid/);
    expect(ensureRuntimeSecrets({ ...f.env, [key]: explicit })).toEqual({ ...stored, [key]: explicit });
    expect(fs.readFileSync(f.json, "utf8")).toBe(json);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(legacy);
  });

  it("preserves explicit secret bytes instead of trimming API/identity derivation inputs", () => {
    const f = fixture();
    writeJson(f);
    const value = `  ${explicit}  `;
    expect(ensureRuntimeSecrets({ ...f.env, API_KEY_SECRET: value }).API_KEY_SECRET).toBe(value);
  });

  it("reads only simple literal quoted values, comments and CRLF without shell expansion", () => {
    const f = fixture();
    const content = `# retained Docker values\r\nJWT_SECRET='${stored.JWT_SECRET}'\r\n\r\nAPI_KEY_SECRET="${stored.API_KEY_SECRET}"\r\nMACHINE_ID_SALT=${stored.MACHINE_ID_SALT}\r\n`;
    fs.writeFileSync(f.legacy, content);
    expect(ensureRuntimeSecrets(f.env)).toEqual(stored);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(content);
  });

  it("never executes legacy shell syntax or prints its private value on refusal", () => {
    const f = fixture();
    const marker = path.join(f.directory, "must-not-exist");
    const content = `JWT_SECRET=$(touch '${marker}')\nAPI_KEY_SECRET=${stored.API_KEY_SECRET}\nMACHINE_ID_SALT=${stored.MACHINE_ID_SALT}\n`;
    fs.writeFileSync(f.legacy, content);
    expect(() => ensureRuntimeSecrets(f.env)).toThrow(/Existing JWT_SECRET is invalid/);
    expect(fs.existsSync(marker)).toBe(false);
    expect(fs.existsSync(f.json)).toBe(false);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(content);
    expect(ensureRuntimeSecrets({ ...f.env, JWT_SECRET: explicit })).toEqual({ ...stored, JWT_SECRET: explicit });
    expect(fs.existsSync(marker)).toBe(false);
  });

  it.each([
    `UNRECOGNIZED_SECRET=${explicit}\n`,
    `export JWT_SECRET=${explicit}\n`,
    "not an assignment\n",
  ])("rejects unknown or structurally malformed legacy records without creating replacement JSON", content => {
    const f = fixture();
    fs.writeFileSync(f.legacy, content);
    expect(() => ensureRuntimeSecrets({ ...f.env, ...stored })).toThrow(/Cannot read existing runtime secrets/);
    expect(fs.existsSync(f.json)).toBe(false);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(content);
  });

  it("refuses duplicate legacy assignments unless the operator overrides that key", () => {
    const f = fixture();
    const content = writeLegacy(f) + `API_KEY_SECRET=${stored.API_KEY_SECRET}\n`;
    fs.writeFileSync(f.legacy, content);
    expect(() => ensureRuntimeSecrets(f.env)).toThrow(/Existing API_KEY_SECRET is invalid/);
    expect(ensureRuntimeSecrets({ ...f.env, API_KEY_SECRET: explicit })).toEqual({ ...stored, API_KEY_SECRET: explicit });
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(content);
  });

  it("takes the existing shared lock before importing any legacy key", () => {
    const f = fixture();
    const content = writeLegacy(f);
    fs.writeFileSync(path.join(f.directory, ".runtime-secrets.lock"), "synthetic-other-startup");
    expect(() => ensureRuntimeSecrets(f.env)).toThrow(/locked/);
    expect(fs.existsSync(f.json)).toBe(false);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(content);
  });

  it("does not publish volatile keys or change originals when canonical publication fails", () => {
    const f = fixture();
    const content = writeLegacy(f);
    vi.spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("Synthetic publication refusal"); });
    expect(() => ensureRuntimeSecrets(f.env)).toThrow(/Synthetic publication refusal/);
    expect(fs.existsSync(f.json)).toBe(false);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(content);
    expect(fs.readdirSync(f.directory)).toEqual(["secrets.env"]);
  });

  it.skipIf(process.platform === "win32")("rejects linked legacy stores instead of following outside state", () => {
    const f = fixture();
    const external = path.join(f.directory, "private-original");
    fs.writeFileSync(external, Object.entries(stored).map(([key, value]) => `${key}=${value}`).join("\n"));
    fs.symlinkSync(external, f.legacy);
    expect(() => ensureRuntimeSecrets(f.env)).toThrow(/Cannot read existing runtime secrets/);
    expect(fs.existsSync(f.json)).toBe(false);
  });
});

describe("container preload without wrapper processes or secret output", () => {
  function preload(f, env = {}, code = "console.log(JSON.stringify(Object.fromEntries(['JWT_SECRET', 'API_KEY_SECRET', 'MACHINE_ID_SALT'].map(key => [key, process.env[key] === JSON.parse(process.env.FIXTURE_EXPECTED)[key]]))))") {
    return spawnSync(process.execPath, ["--require", path.join(root, "cli/hooks/containerEntrypoint.js"), "-e", code], {
      encoding: "utf8", timeout: 5000,
      env: { PATH: process.env.PATH || "", HOME: f.directory, DATA_DIR: f.directory, FIXTURE_EXPECTED: JSON.stringify(stored), ...env },
    });
  }

  it("loads existing JSON before application code and leaves stdout free of secret values", () => {
    const f = fixture();
    writeJson(f);
    const result = preload(f);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(Object.fromEntries(keys.map(key => [key, true])));
    expect(result.stderr).toBe("");
    for (const value of Object.values(stored)) expect(result.stdout).not.toContain(value);
  });

  it("keeps non-JWT persisted secrets when only JWT is explicitly supplied", () => {
    const f = fixture();
    writeLegacy(f);
    const result = preload(f, { JWT_SECRET: explicit, FIXTURE_EXPECTED: JSON.stringify({ ...stored, JWT_SECRET: explicit }) });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(Object.fromEntries(keys.map(key => [key, true])));
  });

  it("fails before executing application code and emits only a value-free diagnostic", () => {
    const f = fixture();
    writeJson(f, { ...stored, API_KEY_SECRET: "private-canary-invalid" });
    const result = preload(f, {}, "console.log('application-ran')");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Runtime secrets could not be resolved");
    expect(result.stderr).not.toContain("private-canary-invalid");
    for (const value of Object.values(stored)) expect(result.stderr).not.toContain(value);
  });

  it("does not inject a preload into helper child NODE_OPTIONS", () => {
    const f = fixture();
    writeJson(f);
    const result = preload(f, {}, `
      const fs = require('node:fs');
      fs.writeFileSync(require('node:path').join(process.env.DATA_DIR, '.runtime-secrets.lock'), 'synthetic-held-lock');
      const child = require('node:child_process').spawnSync(process.execPath, ['-e', 'process.exit(process.env.NODE_OPTIONS ? 2 : 0)'], { encoding: 'utf8' });
      console.log(JSON.stringify({ childStatus: child.status, stderrEmpty: child.stderr === '' }));
    `);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ childStatus: 0, stderrEmpty: true });
  });

  it("execs the default preloaded application after dropping privileges", () => {
    const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
    expect(dockerfile).toContain('CMD ["node", "--require", "./cli/hooks/containerEntrypoint.js", "custom-server.js"]');
    expect(dockerfile).toContain('exec su-exec node "$@"');
    expect(dockerfile).toContain("COPY --from=builder /app/cli/hooks/containerEntrypoint.js ./cli/hooks/containerEntrypoint.js");
    expect(dockerfile).not.toContain('. "$SECRETS_FILE"');
    expect(dockerfile).not.toContain("NODE_OPTIONS=");
  });
});

describe.skipIf(process.platform === "win32")("start.sh uses one validated persistent container path", () => {
  function runStart({ content, dataDir, existing = true, noEnvFile = false } = {}) {
    const f = fixture();
    const script = path.join(f.directory, "start.sh");
    const envFile = path.join(f.directory, ".env");
    const log = path.join(f.directory, "docker-calls.jsonl");
    fs.copyFileSync(path.join(root, "start.sh"), script);
    if (!noEnvFile) fs.writeFileSync(envFile, content ?? "INITIAL_PASSWORD=private-test-canary\n");
    const docker = path.join(f.directory, "docker");
    fs.writeFileSync(docker, `#!${process.execPath}
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      fs.appendFileSync(process.env.FIXTURE_DOCKER_LOG, JSON.stringify(args) + '\\n');
      if (args[0] === 'container' && args[1] === 'inspect' && process.env.FIXTURE_EXISTING !== '1') process.exit(1);
    `, { mode: 0o700 });
    const result = spawnSync("bash", [script], {
      encoding: "utf8", timeout: 5000,
      env: {
        PATH: `${f.directory}:${process.env.PATH || ""}`, HOME: f.directory,
        KITSUNE_ROUTER_DATA_VOLUME: "retained-existing-volume", KITSUNE_ROUTER_CONTAINER: "retained-existing-container",
        FIXTURE_DOCKER_LOG: log, FIXTURE_EXISTING: existing ? "1" : "0",
        ...(dataDir === undefined ? {} : { DATA_DIR: dataDir }),
      },
    });
    const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
    if (!noEnvFile) expect(fs.readFileSync(envFile, "utf8")).toBe(content ?? "INITIAL_PASSWORD=private-test-canary\n");
    expect(result.stdout + result.stderr).not.toContain("private-test-canary");
    return { result, calls };
  }

  function expectMount(f, target) {
    expect(f.result.status, f.result.stderr).toBe(0);
    const run = f.calls.find(args => args[0] === "run");
    expect(run[run.indexOf("-e") + 1]).toBe(`DATA_DIR=${target}`);
    expect(run[run.indexOf("-v") + 1]).toBe(`retained-existing-volume:${target}`);
    expect(f.calls.map(args => args[0])).toEqual(["build", "container", "stop", "rm", "run"]);
    expect(f.calls.some(args => args.includes("--volumes") || args.includes("-v") && args[0] === "rm")).toBe(false);
  }

  it("uses /app/data with no env file rather than an unmounted default", () => {
    expectMount(runStart({ noEnvFile: true }), "/app/data");
  });

  it("mounts the absolute DATA_DIR from a source-style env file", () => {
    expectMount(runStart({ content: "INITIAL_PASSWORD=private-test-canary\nDATA_DIR=/var/lib/kitsune-router\n" }), "/var/lib/kitsune-router");
  });

  it("honors exported custom DATA_DIR over the env file, including spaces", () => {
    expectMount(runStart({ content: "DATA_DIR=/file-state\n", dataDir: "/operator state/kitsune-router" }), "/operator state/kitsune-router");
  });

  it("uses Docker's last literal assignment and accepts CRLF, BOM and indentation", () => {
    expectMount(runStart({ content: "\ufeff# private Docker env file\r\nDATA_DIR=/first\r\n  DATA_DIR=/final-state/\r\n" }), "/final-state");
  });

  it("inherits a bare DATA_DIR record and explicitly passes the matching mount", () => {
    expectMount(runStart({ content: "DATA_DIR\n", dataDir: "/inherited-state" }), "/inherited-state");
  });

  it.each(["relative-state", "/app/data/../state", "/app//state", "/", "/app", '"/quoted-state"', "/state:ro", "/state\tbad"])("rejects invalid DATA_DIR %s before any Docker build/stop/remove", dataDir => {
    const f = runStart({ dataDir });
    expect(f.result.status).not.toBe(0);
    expect(f.calls).toEqual([]);
  });

  it("never executes shell syntax in an env file", () => {
    const f = runStart({ content: "DATA_DIR=$(printf private-test-canary)\n" });
    expect(f.result.status).not.toBe(0);
    expect(f.calls).toEqual([]);
    expect(f.result.stderr).toContain("DATA_DIR must be an absolute container path");
  });

  it("refuses invalid Docker env-file keys before stopping the existing container", () => {
    const f = runStart({ content: "export DATA_DIR=/somewhere\n" });
    expect(f.result.status).not.toBe(0);
    expect(f.calls).toEqual([]);
  });
});
