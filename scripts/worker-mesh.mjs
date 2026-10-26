import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REMOTE = "/root/kitsune-router-worker-mesh";
const STATE = join(homedir(), ".local", "share", "kitsune-router-worker-mesh");
const BINARY = process.env.WORKER_MESH_MUTAGEN || join(STATE, "tools", process.platform === "win32" ? "mutagen.exe" : "mutagen");
const NODES = { node1: { alias: "zen-mesh-node1", address: "159.223.88.62" }, node2: { alias: "zen-mesh-node2", address: "157.230.34.190" } };
const SSH_OPTIONS = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ForwardAgent=no", "-o", "ConnectTimeout=12", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"];
// Never synchronize credentials, local state, dependencies, build products, or logs.
// .env.example is deliberately excluded too: examples can acquire real values.
const IGNORES = [".git", "node_modules", ".next*", ".env*", ".npmrc", ".yarnrc*", ".pnp*", ".yarn", ".ssh", ".aws", ".azure", ".kube", ".config", ".mutagen*", ".claude", ".docs", ".repo", ".script", ".codegraph", ".PR", ".zcode", ".kiro", ".cursor", ".bin", ".build-home", "open-sse.old", "graphify-out", "data", ".data", "/logs", "/history", "/sessions", "secrets", "credentials", "coverage", "build", "dist", "out", "product", ".vercel", ".cache", "tmp", "temp", "*.db*", "*.sqlite*", "*.log*", "*.jsonl", "*.ndjson", "log.txt", "usage.json", "db.json", "credentials.json", "secrets.json", "tokens.json", "*.pem", "*.key", "*.p12", "*.pfx", "id_rsa*", "id_ed25519*", "*.tgz", "*.zip", "*.tar*", "*.tsbuildinfo", "next-env.d.ts", "*.swp"];
const env = { ...process.env, MUTAGEN_DATA_DIRECTORY: join(STATE, "mutagen"), MUTAGEN_SSH_CONNECT_TIMEOUT: "12" };
if (process.platform === "win32") env.MUTAGEN_SSH_PATH = join(process.env.WINDIR || "C:\\Windows", "System32", "OpenSSH");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}: ${result.stderr || result.stdout}`);
  return result.stdout;
}
function node(name) { if (!NODES[name]) throw new Error("Select node1 or node2; production is not an allowed target"); return NODES[name]; }
function trusted(name) {
  const target = node(name);
  const config = run("ssh", ["-G", target.alias]);
  const values = Object.fromEntries(config.split(/\r?\n/).map((line) => { const i = line.indexOf(" "); return [line.slice(0, i), line.slice(i + 1)]; }));
  if (values.hostname !== target.address || values.user !== "root" || values.stricthostkeychecking !== "true" || values.batchmode !== "yes" || values.forwardagent !== "no" || Number(values.serveraliveinterval) < 1 || Number(values.serveralivecountmax) < 1 || Number(values.connecttimeout) < 1) {
    throw new Error(`SSH alias ${target.alias} must specify HostName ${target.address}, User root, BatchMode yes, StrictHostKeyChecking yes, ForwardAgent no, ConnectTimeout 12, ServerAliveInterval 15, ServerAliveCountMax 3. Establish trusted known_hosts out-of-band; this tool never accepts new keys.`);
  }
  return target;
}
function ssh(name, command, options = {}) { const target = trusted(name); return run("ssh", [...SSH_OPTIONS, target.alias, command], options); }
function mutagen(args) { if (!existsSync(BINARY)) throw new Error(`Install Mutagen 0.18.1 with agents archive alongside it at ${BINARY}, or set WORKER_MESH_MUTAGEN. Verify official SHA256SUMS before extraction.`); mkdirSync(STATE, { recursive: true }); return run(BINARY, args, { env }); }
function sessions() { return JSON.parse(mutagen(["sync", "list", "--template", "{{ json . }}"])); }
function session(name) {
  const matches = sessions().filter((entry) => entry.name === `kitsunerouter-${name}`);
  if (matches.length > 1) throw new Error(`Duplicate session name for ${name}`);
  const entry = matches[0];
  if (entry && (entry.alpha.protocol !== "local" || resolve(entry.alpha.path) !== ROOT || entry.beta.protocol !== "ssh" || entry.beta.host !== trusted(name).alias || entry.beta.path !== `${REMOTE}/workspace` || entry.mode !== "two-way-safe" || entry.hash !== "sha256" || entry.symlink?.mode !== "ignore" || entry.ignore?.vcs !== true || ![undefined, "mutagen"].includes(entry.ignore?.syntax) || JSON.stringify(entry.ignore?.paths) !== JSON.stringify(IGNORES) || entry.beta.permissions?.defaultFileMode !== "0600" || entry.beta.permissions?.defaultDirectoryMode !== "0700")) {
    throw new Error(`Session ${entry.name} differs from the exact safe configuration. Inspect and manually terminate/recreate; no automatic overwrite.`);
  }
  return entry;
}
function assertSafe(states) {
  for (const entry of states) {
    if (entry.conflicts?.length || entry.alpha?.scanProblems?.length || entry.beta?.scanProblems?.length || entry.alpha?.transitionProblems?.length || entry.beta?.transitionProblems?.length || entry.lastError) throw new Error(`Sync ${entry.name} has unresolved conflicts/errors; inspect conflicts, resolve manually, then flush`);
  }
}
function flush() {
  for (const name of Object.keys(NODES)) { if (!session(name)) throw new Error(`Missing session for ${name}; run create`); }
  // Star only: no worker-to-worker session. Two passes carry remote edits through
  // the local hub without adding a cycle. Divergent edits remain conflicts.
  for (let pass = 0; pass < 2; pass++) for (const name of Object.keys(NODES)) mutagen(["sync", "flush", `kitsunerouter-${name}`]);
  assertSafe(sessions());
}
function uploadRunner(name) {
  for (const [source, destination] of [["worker-mesh-runner.mjs", "runner.mjs"], ["worker-mesh-reader.mjs", "reader.mjs"]]) {
    ssh(name, `umask 077; mkdir -p ${REMOTE}/jobs ${REMOTE}/runtime ${REMOTE}/workspace; chmod 700 ${REMOTE} ${REMOTE}/jobs ${REMOTE}/runtime ${REMOTE}/workspace; cat > ${REMOTE}/runtime/${destination}`, { input: readFileSync(join(ROOT, "scripts", source), "utf8") });
  }
}
function validateId(id) { if (!/^[a-z0-9-]{1,80}$/.test(id || "")) throw new Error("Invalid job id"); }
const [command = "help", name, task, ...args] = process.argv.slice(2);
try {
  switch (command) {
    case "create":
      for (const key of Object.keys(NODES)) {
        uploadRunner(key);
        if (session(key)) { mutagen(["sync", "resume", `kitsunerouter-${key}`]); continue; }
        console.log(mutagen(["sync", "create", ROOT, `${trusted(key).alias}:${REMOTE}/workspace`, "--name", `kitsunerouter-${key}`, "--no-global-configuration", "--mode", "two-way-safe", "--hash", "sha256", "--symlink-mode", "ignore", "--ignore-syntax", "mutagen", "--ignore-vcs", "--watch-polling-interval", "2", "--default-file-mode-beta", "0600", "--default-directory-mode-beta", "0700", ...IGNORES.flatMap((pattern) => ["--ignore", pattern])]));
      }
      flush(); console.log("Mesh created and flushed; no public network listener."); break;
    case "status": console.log(mutagen(["sync", "list", "--long"])); break;
    case "conflicts": console.log(JSON.stringify(sessions().map((entry) => ({ name: entry.name, conflicts: entry.conflicts || [], lastError: entry.lastError, alpha: entry.alpha?.scanProblems, beta: entry.beta?.scanProblems })), null, 2)); break;
    case "flush": flush(); console.log("Both star sessions flushed twice without reported conflicts/errors."); break;
    case "stop": for (const key of Object.keys(NODES)) if (session(key)) mutagen(["sync", "pause", `kitsunerouter-${key}`]); console.log("Paused; archives retained. create resumes safely."); break;
    case "resources": for (const key of Object.keys(NODES)) console.log(key, ssh(key, "printf 'cpus='; getconf _NPROCESSORS_ONLN; free -m; df -h /root; node --version; npm --version; uname -sm")); break;
    case "job": {
      node(name);
      if (!["deps", "build", "test", "lint", "audit", "smoke"].includes(task)) throw new Error("Task must be deps, build, test, lint, audit, or smoke");
      if (task === "build" && name !== "node2") throw new Error("Build runs only on node2; reserve node1 for test CPU/RAM");
      if (task !== "test" && args.length) throw new Error("Only test accepts relative test file paths");
      if (task === "test" && args.some((arg) => arg.startsWith("-") || !/^[\w./-]+\.test\.[cm]?js$/.test(arg) || arg.includes(".."))) throw new Error("Test arguments must be relative test file paths");
      flush(); uploadRunner(name);
      const id = `${task}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const encoded = Buffer.from(JSON.stringify(args)).toString("base64");
      ssh(name, `umask 077; mkdir ${REMOTE}/jobs/${id}; cp ${REMOTE}/runtime/runner.mjs ${REMOTE}/jobs/${id}/runner.mjs; nohup sh -c 'flock -n -E 75 ${REMOTE}/runtime/job.lock node ${REMOTE}/jobs/${id}/runner.mjs ${id} ${task} ${encoded} 2>>${REMOTE}/jobs/${id}/launcher.log; code=$?; if ! test -f ${REMOTE}/jobs/${id}/exit-code; then status=abnormal-exit; test "$code" -ne 75 || status=rejected-busy; test "$code" -ne 0 || code=1; printf "[worker-mesh] launcher terminated status=%s exit=%s\\n" "$status" "$code" >> ${REMOTE}/jobs/${id}/stderr.log; printf "{\\"status\\":\\"%s\\",\\"exitCode\\":%s}\\n" "$status" "$code" > ${REMOTE}/jobs/${id}/status.tmp; mv ${REMOTE}/jobs/${id}/status.tmp ${REMOTE}/jobs/${id}/status.json; printf "%s\\n" "$code" > ${REMOTE}/jobs/${id}/exit-code; fi' </dev/null >/dev/null 2>>${REMOTE}/jobs/${id}/launcher.log &`);
      console.log(JSON.stringify({ node: name, id, directory: `${REMOTE}/jobs/${id}`, status: "submitted", follow: `node scripts/worker-mesh.mjs follow ${name} ${id}` })); break;
    }
    case "job-status": validateId(task); console.log(ssh(name, `cat ${REMOTE}/jobs/${task}/status.json; if test -f ${REMOTE}/jobs/${task}/exit-code; then printf 'exit-code='; cat ${REMOTE}/jobs/${task}/exit-code; fi`)); break;
    case "output": case "follow": {
      validateId(task);
      const [stdoutOffset = "0", stderrOffset = "0"] = args;
      if (!/^\d+$/.test(stdoutOffset) || !/^\d+$/.test(stderrOffset)) throw new Error("Offsets must be non-negative byte counts");
      // Frames carry persisted byte offsets. Reconnect with the last offsets to
      // avoid missing/duplicating output; logs and exit remain after disconnect.
      const child = spawn("ssh", [...SSH_OPTIONS, trusted(name).alias, `node ${REMOTE}/runtime/reader.mjs ${task} ${command} ${stdoutOffset} ${stderrOffset}`], { stdio: "inherit" });
      process.exitCode = await new Promise((accept, reject) => { child.once("error", reject); child.once("exit", (code) => accept(code ?? 1)); }); break;
    }
    default: console.log(`Usage: node scripts/worker-mesh.mjs <command>
  create                 Create/resume two-way-safe star sessions and flush
  status | conflicts     Inspect sessions/conflicts without overwriting
  flush                  Two-pass cross-node barrier; rejects reported problems
  stop                   Pause sessions, retain recoverable state
  resources              Strict authenticated SSH resource/runtime checks
  job node1 deps|test|lint|audit|smoke [relative.test.js ...]
  job node2 deps|build|test|lint|audit|smoke [relative.test.js ...]
  job-status node1|node2 JOB_ID
  output node1|node2 JOB_ID [STDOUT_BYTES STDERR_BYTES]
  follow node1|node2 JOB_ID [STDOUT_BYTES STDERR_BYTES]
Jobs survive SSH disconnect. Logs are redacted and private outside sync.
No production target, remote services/firewall changes, or public listener.
Mutagen installation: ${BINARY}
SSH aliases zen-mesh-node1/2 must already have verified known_hosts entries.
Do not edit source during heavy verification: flush is a barrier, not a lock.`);
  }
} catch (error) { console.error(`[worker-mesh] ${error.message}`); process.exitCode = 1; }
