import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ docker: vi.fn(), settings: {}, password: "", operations: [] }));
vi.mock("node:child_process", () => ({ spawnSync: fixture.docker }));
import { runContainerChecks, verifyPublishedContainer } from "../../scripts/verify-published-container.mjs";

const canaries = ["synthetic-cookie-canary-not-for-artifacts", "synthetic-key-canary-not-for-artifacts",
  "synthetic-jwt-canary-not-for-artifacts", "synthetic-api-secret-canary-not-for-artifacts", "synthetic-salt-canary-not-for-artifacts"];
let outputDir;
let cases;

function response(stdout = "", stderr = "", status = 0) { return { stdout, stderr, status, signal: null }; }
function driver(_executable, command, options) {
  const args = command.slice(1); // The verifier pins Docker's local socket.
  fixture.operations.push(args[0]);
  if (args[0] === "run") fixture.password = options.env.INITIAL_PASSWORD;
  if (args[0] === "exec") {
    const phase = args.at(-1);
    const privateRedactions = [fixture.password, ...canaries];
    if (phase === "initial" && fixture.settings.probeFailure) return response("", canaries[1], 1);
    if (phase === "-") return fixture.settings.recoverPrivate
      ? response(JSON.stringify(privateRedactions)) : response("", canaries[2], 1);
    return response(JSON.stringify({ version: "1.0.6", database: "ready", providerAccounts: 0, privateRedactions }));
  }
  if (args[0] === "inspect") return response(String(fixture.settings.exitCode ?? 0));
  if (args[0] === "logs") return response(fixture.settings.stdout || "Ready\n", fixture.settings.stderr || "", fixture.settings.logStatus ?? 0);
  return response("owned-synthetic-resource\n");
}
function run() { return runContainerChecks({ reference: "synthetic-image", version: "1.0.6", outputDir, cases }); }
function assertPrivateAbsent() {
  const log = readFileSync(path.join(outputDir, "default-data.log"), "utf8");
  const artifacts = log + JSON.stringify(cases);
  for (const value of [fixture.password, ...canaries]) expect(artifacts.includes(value)).toBe(false);
  expect(cases[0].containerRemoved && cases[0].volumeRemoved).toBe(true);
  expect(fixture.operations.includes("rm")).toBe(true);
  return log;
}

beforeEach(() => {
  outputDir = mkdtempSync(path.join(tmpdir(), "published-container-guards-"));
  cases = [];
  fixture.settings = {};
  fixture.password = "";
  fixture.operations = [];
  fixture.docker.mockReset().mockImplementation(driver);
});
afterEach(() => { rmSync(outputDir, { recursive: true, force: true }); });

describe("published container verification guards", () => {
  it("rejects invalid or mutable targets before invoking Docker", () => {
    const reference = "ghcr.io/bykitsune/kitsune-router@sha256:" + "a".repeat(64);
    const sha = "b".repeat(40);
    for (const args of [[], ["ghcr.io/bykitsune/kitsune-router:1.0.6", "1.0.6", sha],
      [reference.replace("bykitsune/kitsune-router", "other/repo"), "1.0.6", sha],
      [reference.slice(0, -1), "1.0.6", sha], [reference, "1.0.6-beta", sha], [reference, "1.0.6", sha + "\n"]]) {
      expect(() => verifyPublishedContainer(args, {})).toThrow();
    }
    // A failed assertion must not dump a captured environment object.
    expect(fixture.docker.mock.calls.length === 0).toBe(true);
  });

  it("withholds failed-probe logs when complete private material cannot be recovered", () => {
    fixture.settings = { probeFailure: true, stdout: "Error: fixture failure\n" + canaries.join("\n") };
    expect(run).toThrow(/Docker exec/);
    expect(cases[0].logsWithheld).toBe(true);
    expect(cases[0].errors).toBe(1);
    expect(assertPrivateAbsent()).toMatch(/Raw logs withheld/);
  });

  it("redacts recovered private material while retaining failure diagnostics", () => {
    fixture.settings = { probeFailure: true, recoverPrivate: true, stdout: "Error: fixture failure\n" + canaries.join("\n") };
    expect(run).toThrow(/Docker exec/);
    expect(cases[0].logsWithheld).toBe(false);
    const log = assertPrivateAbsent();
    expect(log).toMatch(/Error: fixture failure/);
    expect(log).toMatch(/\[redacted\]/);
  });

  it("withholds failed or truncated log buffers even after probes supply full secrets", () => {
    const partial = canaries[2].slice(0, -3);
    fixture.settings = { logStatus: 1, stdout: "partial=" + partial };
    expect(run).toThrow(/resources or logs/);
    expect(cases[0].logsRead).toBe(false);
    expect(cases[0].logsWithheld).toBe(true);
    const log = assertPrivateAbsent();
    expect(log.includes(partial)).toBe(false);
    expect(log).toMatch(/Raw logs withheld/);
  });

  it("rejects a SIGKILL exit despite a successful Docker stop command", () => {
    fixture.settings = { exitCode: 137 };
    expect(run).toThrow(/resources or logs/);
    expect(cases[0].gracefulStop).toBe(true);
    expect(cases[0].exitCode).toBe(137);
    assertPrivateAbsent();
  });

  it.each([
    ["warning marker", { stdout: "⚠️ [AUTH] upstream unavailable\n" }, "warnings"],
    ["error marker", { stdout: "❌ [AUTH] upstream unavailable\n" }, "errors"],
    ["ordinary Error diagnostic", { stdout: "Error: upstream unavailable\n" }, "errors"],
    ["unlabeled stderr warning", { stderr: "[DB] better-sqlite3 unavailable: synthetic fallback\n" }, "stderrLines"],
  ])("rejects %s from actual logger channels", (_name, settings, counter) => {
    fixture.settings = settings;
    expect(run).toThrow(/Published image emitted/);
    expect(cases[0][counter]).toBe(1);
    assertPrivateAbsent();
  });

  it("uses a hard subprocess kill deadline without exposing private proof fields", () => {
    expect(run()).toHaveLength(2);
    expect(fixture.docker.mock.calls.every(([, , options]) => options.killSignal === "SIGKILL")).toBe(true);
    assertPrivateAbsent();
    expect(JSON.stringify(cases).includes("privateRedactions")).toBe(false);
  });
});
