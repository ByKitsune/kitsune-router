import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const IMAGE = "ghcr.io/bykitsune/kitsune-router";
const REPOSITORY = "ByKitsune/kitsune-router";
const SOURCE = `https://github.com/${REPOSITORY}`;
const exact = (value, pattern) => typeof value === "string" && pattern.exec(value)?.[0] === value;

export const RUNTIME_PROBE = String.raw`
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
const base = 'http://127.0.0.1:20128';
const data = process.env.DATA_DIR || '/app/data';
const stateFile = '/tmp/kitsune-published-container-state.json';
const hash = value => createHash('sha256').update(value).digest('hex');
const request = (route, init = {}) => fetch(base + route, { redirect: 'error', signal: AbortSignal.timeout(5000), ...init });
const secrets = () => readFileSync(data + '/secrets.json');
const privateValues = state => [process.env.INITIAL_PASSWORD, state?.cookie, state?.key, ...Object.values(JSON.parse(secrets()))].filter(value => typeof value === 'string' && value.length);
let health;
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  try {
    const response = await request('/api/health', { signal: AbortSignal.timeout(1000) });
    const body = await response.json();
    if (response.status === 200 && body.ok && body.checks?.database) { health = body; break; }
  } catch { /* Read-only startup polling is bounded by the shared deadline. */ }
  await setTimeout(250);
}
assert.ok(health, 'Database-backed health did not become ready');
assert.equal(health.version, process.env.SMOKE_EXPECT_VERSION);
assert.equal(health.checks.accounts, 0, 'The fixture must have no provider accounts');
assert.equal(JSON.parse(readFileSync('/app/package.json', 'utf8')).version, process.env.SMOKE_EXPECT_VERSION);
const [major, minor] = process.versions.node.split('.').map(Number);
assert.ok(major > 22 || (major === 22 && minor >= 19), 'Unsupported image Node runtime');
assert.equal(/^Uid:\s+(\d+)/m.exec(readFileSync('/proc/1/status', 'utf8'))?.[1], '1000', 'Default entrypoint must run the app as node');
assert.equal(process.getuid(), 1000);
assert.equal(statSync(data + '/secrets.json').mode & 0o777, 0o600);
assert.equal(statSync(data + '/db/data.sqlite').mode & 0o777, 0o600);
if (process.argv[2] === 'restart') {
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal(hash(secrets()), state.secretHash, 'Secret-file bytes changed across restart');
  assert.equal((await request('/api/settings', { headers: { Cookie: state.cookie } })).status, 200);
  const listing = await request('/api/keys', { headers: { Cookie: state.cookie } });
  assert.equal(listing.status, 200);
  const stored = (await listing.json()).keys.find(key => key.id === state.id);
  assert.ok(stored?.isActive && stored.key === state.key, 'The original active key bytes must persist');
  const models = await request('/v1/models', { headers: { Authorization: 'Bearer ' + state.key } });
  assert.equal(models.status, 200);
  const catalog = (await models.json()).data;
  assert.ok(Array.isArray(catalog) && catalog.length > 0, 'The model catalog must not be empty');
  assert.equal((await request('/api/keys/' + encodeURIComponent(state.id), { method: 'DELETE', headers: { Cookie: state.cookie } })).status, 200);
  const privateRedactions = privateValues(state);
  unlinkSync(stateFile);
  console.log(JSON.stringify({ version: health.version, node: process.version, database: 'ready', providerAccounts: 0,
    existingSession: 'passed', originalKeyBytes: 'unchanged and active', secretBytes: 'unchanged', keyCleanup: 'passed',
    privateRedactions }));
} else {
  assert.equal((await request('/api/settings')).status, 401);
  const invalid = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'intentionally-invalid-container-smoke-password' }) });
  assert.equal(invalid.status, 401);
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.INITIAL_PASSWORD }) });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).success, true);
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie);
  const dashboard = await request('/dashboard', { headers: { Cookie: cookie } });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /kitsune/i);
  const issued = await request('/api/keys', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'synthetic-published-container-smoke' }) });
  assert.equal(issued.status, 201);
  const key = await issued.json();
  assert.ok(typeof key.key === 'string' && typeof key.id === 'string');
  const state = { cookie, key: key.key, id: key.id, secretHash: hash(secrets()) };
  writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  const models = await request('/v1/models', { headers: { Authorization: 'Bearer ' + key.key } });
  assert.equal(models.status, 200);
  const catalog = (await models.json()).data;
  assert.ok(Array.isArray(catalog) && catalog.length > 0, 'The model catalog must not be empty');
  console.log(JSON.stringify({ version: health.version, node: process.version, database: 'ready', providerAccounts: 0,
    unauthenticatedSettings: 'rejected', invalidPassword: 'rejected', login: 'passed', dashboard: 'passed', modelCount: catalog.length,
    databaseMode: '0600', secretMode: '0600', appUid: 1000, privateRedactions: privateValues(state) }));
}
`;

function dockerCommand(args, { env = process.env, input, timeout = 60000, allowFailure = false } = {}) {
  const dockerEnv = { ...env };
  for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete dockerEnv[key];
  const result = spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env: dockerEnv, input, encoding: "utf8", timeout, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024,
  });
  if (!allowFailure && (result.error || result.status !== 0)) throw new Error(`Docker ${args[0]} did not complete successfully`);
  return result;
}

function jsonOutput(result) {
  try { return JSON.parse(result.stdout); } catch { throw new Error("Docker returned an invalid verification payload"); }
}

// Kept separate so the runtime harness can be checked against an existing local
// image without claiming that local bytes are a published registry artifact.
export function runContainerChecks({ reference, version, outputDir, cases = [] }) {
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const ca = process.env.CODEX_PROXY_CERT;
  if (ca) assert(path.isAbsolute(ca) && !/[,\r\n]/.test(ca) && existsSync(ca) && statSync(ca).isFile(), "Invalid configured CA path");
  for (const [label, dataDir] of [["default-data", "/app/data"], ["custom-data", "/var/lib/kitsune-router"]]) {
    const name = `kitsune-published-${process.pid}-${randomBytes(6).toString("hex")}`;
    const volume = `${name}-data`;
    const password = randomBytes(32).toString("base64url");
    const redactions = [password];
    const item = { label, dataDir, network: "none" };
    let volumeCreated = false;
    let containerCreated = false;
    let failure;
    let safeLog;
    const probe = phase => {
      const value = jsonOutput(dockerCommand(["exec", "--user", "1000:1000", "-i", name, "node", "--input-type=module", "-", phase], { input: RUNTIME_PROBE, timeout: 45000 }));
      const { privateRedactions, ...publicResult } = value;
      assert(Array.isArray(privateRedactions) && privateRedactions.length >= 6 && privateRedactions.every(secret => typeof secret === "string" && secret.length > 0), "Invalid private redaction payload");
      redactions.push(...privateRedactions);
      return publicResult;
    };
    try {
      volumeCreated = true;
      dockerCommand(["volume", "create", volume]);
      const trust = ca ? ["--mount", `type=bind,src=${ca},dst=/run/proxy-ca.pem,readonly`, "-e", "NODE_EXTRA_CA_CERTS=/run/proxy-ca.pem"] : [];
      const customDirectory = label === "custom-data" ? ["-e", `DATA_DIR=${dataDir}`] : [];
      containerCreated = true;
      dockerCommand(["run", "-d", "--name", name, "--network", "none", "--security-opt", "no-new-privileges", "--pids-limit", "128",
        "--mount", `type=volume,src=${volume},dst=${dataDir}`, ...trust, ...customDirectory,
        "-e", "INITIAL_PASSWORD", "-e", "HOME=/app/data-home", "-e", "NEXT_TELEMETRY_DISABLED=1", "-e", "DISABLE_BACKGROUND_TOKEN_REFRESH=1",
        "-e", "MODEL_CATALOG_SYNC=off", "-e", "KITSUNE_ROUTER_DISABLE_MITM=1", "-e", "KITSUNE_ROUTER_MIGRATION=skip",
        "-e", `SMOKE_EXPECT_VERSION=${version}`, reference], { env: { ...process.env, INITIAL_PASSWORD: password } });
      item.initial = probe("initial");
      dockerCommand(["restart", "--time", "15", name], { timeout: 45000 });
      item.restart = probe("restart");
    } catch (error) {
      failure = error;
      item.failure = error.message;
    } finally {
      if (containerCreated) {
        let redactionsComplete = Boolean(item.initial && item.restart);
        if (!redactionsComplete) {
          // This pipe contains only the fixture's own synthetic credentials.
          // Never inherit its stdout/stderr or copy it into proof artifacts.
          const gathered = dockerCommand(["exec", "--user", "1000:1000", "-i", name, "node", "--input-type=module", "-"], {
            allowFailure: true, timeout: 5000, input: String.raw`
import { readFileSync } from 'node:fs';
const state = JSON.parse(readFileSync('/tmp/kitsune-published-container-state.json', 'utf8'));
const secrets = JSON.parse(readFileSync((process.env.DATA_DIR || '/app/data') + '/secrets.json', 'utf8'));
const values = [process.env.INITIAL_PASSWORD, state.cookie, state.key, ...['JWT_SECRET', 'API_KEY_SECRET', 'MACHINE_ID_SALT'].map(key => secrets[key])];
if (values.some(value => typeof value !== 'string' || !value.length)) process.exit(1);
process.stdout.write(JSON.stringify(values));
` });
          if (!gathered.error && gathered.status === 0) {
            try {
              const values = JSON.parse(gathered.stdout);
              if (Array.isArray(values) && values.length >= 6 && values.every(value => typeof value === "string" && value.length > 0)) {
                redactions.push(...values);
                redactionsComplete = true;
              }
            } catch { /* Withhold raw logs when private material is unavailable. */ }
          }
        }
        const stopped = dockerCommand(["stop", "--time", "15", name], { timeout: 45000, allowFailure: true });
        item.gracefulStop = !stopped.error && stopped.status === 0;
        if (item.gracefulStop) {
          const exited = dockerCommand(["inspect", "--format", "{{.State.ExitCode}}", name], { allowFailure: true });
          const code = exited.stdout?.trim();
          item.exitCode = !exited.error && exited.status === 0 && /^\d+$/.test(code || "") ? Number(code) : null;
        }
        const logged = dockerCommand(["logs", name], { allowFailure: true });
        item.logsRead = !logged.error && logged.status === 0;
        let log = (logged.stdout || "") + (logged.stderr || "");
        item.stderrLines = (logged.stderr || "").split(/\r?\n/).filter(line => line.trim()).length;
        item.warnings = (log.match(/^.*(?:\bwarn(?:ing)?\b|⚠).*$/gim) || []).length;
        item.errors = (log.match(/^.*(?:\bError:|\bUnhandled\b|\buncaught\b|❌).*$/gim) || []).length;
        for (const secret of redactions) log = log.split(secret).join("[redacted]");
        item.logsWithheld = !redactionsComplete || !item.logsRead;
        safeLog = item.logsWithheld ? "Raw logs withheld because log capture or complete synthetic redaction material was unavailable.\n" : log;
      }
      if (volumeCreated) {
        const removed = dockerCommand(["rm", "-f", name], { allowFailure: true });
        item.containerRemoved = (!removed.error && removed.status === 0) || (!removed.error && /No such container/i.test(removed.stderr || ""));
        const dropped = dockerCommand(["volume", "rm", volume], { allowFailure: true });
        item.volumeRemoved = !dropped.error && (dropped.status === 0 || /No such volume/i.test(dropped.stderr || ""));
      }
      cases.push(item);
      if (safeLog !== undefined) writeFileSync(path.join(outputDir, `${label}.log`), safeLog, { mode: 0o600 });
    }
    if (failure) throw failure;
    assert(item.gracefulStop && item.exitCode === 0 && item.logsRead && !item.logsWithheld && item.containerRemoved && item.volumeRemoved, "Synthetic container resources or logs were not cleanly verified");
    assert.equal(item.warnings, 0, "Published image emitted warnings");
    assert.equal(item.errors, 0, "Published image emitted errors");
    assert.equal(item.stderrLines, 0, "Published image emitted stderr diagnostics");
  }
  return cases;
}

export function verifyPublishedContainer(args, env = process.env) {
  assert.equal(args.length, 3, "Expected immutable image reference, stable version and source SHA");
  const [reference, version, sourceSha] = args;
  assert(exact(reference, /^ghcr\.io\/bykitsune\/kitsune-router@sha256:[a-f0-9]{64}$/), "Canonical immutable GHCR image reference required");
  assert(exact(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/), "Stable release version required");
  assert(exact(sourceSha, /^[a-f0-9]{40}$/), "Exact source SHA required");
  if (env.GITHUB_SHA) assert.equal(env.GITHUB_SHA, sourceSha, "Workflow source SHA mismatch");
  if (env.GITHUB_REPOSITORY) assert.equal(env.GITHUB_REPOSITORY, REPOSITORY, "Unexpected workflow repository");
  const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
  assert.equal(JSON.parse(readFileSync(packagePath, "utf8")).version, version, "Source package version mismatch");
  const outputDir = path.resolve("verification", sourceSha, "container-runtime");
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const proof = { reference, version, sourceSha, containerNetwork: "none", providerCalls: false, cases: [], status: "pending" };
  try {
    dockerCommand(["pull", reference], { timeout: 180000 });
    const labels = jsonOutput(dockerCommand(["image", "inspect", "--format", "{{json .Config.Labels}}", reference]));
    assert.equal(labels?.["org.opencontainers.image.version"], version, "Published image version label mismatch");
    assert.equal(labels?.["org.opencontainers.image.revision"], sourceSha, "Published image source label mismatch");
    assert.equal(labels?.["org.opencontainers.image.source"], SOURCE, "Published image repository label mismatch");
    proof.imageId = dockerCommand(["image", "inspect", "--format", "{{.Id}}", reference]).stdout.trim();
    assert(exact(proof.imageId, /^sha256:[a-f0-9]{64}$/), "Invalid local image ID");
    runContainerChecks({ reference, version, outputDir, cases: proof.cases });
    proof.status = "passed";
  } catch (error) {
    proof.status = "failed";
    proof.failure = error.message;
    throw error;
  } finally {
    writeFileSync(path.join(outputDir, "proof.json"), JSON.stringify(proof, null, 2) + "\n", { mode: 0o600 });
  }
  return { status: proof.status, reference, version, sourceSha, cases: proof.cases.length, proofPath: path.join(outputDir, "proof.json") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(verifyPublishedContainer(process.argv.slice(2)))); }
  catch (error) { console.error(`[container-runtime] ${error.message}`); process.exitCode = 1; }
}
