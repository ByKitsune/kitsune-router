import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, renameSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";

// Uploaded outside the synchronized tree. Only fixed, worker-local tasks run here.
const ROOT = "/root/kitsune-router-worker-mesh";
const [id, task, encoded = "W10="] = process.argv.slice(2);
if (!/^[a-z0-9-]{1,80}$/.test(id || "")) throw new Error("Invalid job id");
const args = JSON.parse(Buffer.from(encoded, "base64").toString());
if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string" || /[\r\n\0]/.test(arg))) throw new Error("Invalid task arguments");
const dir = `${ROOT}/jobs/${id}`;
mkdirSync(dir, { recursive: true, mode: 0o700 });
for (const name of ["home", "data", "cache"]) mkdirSync(`${dir}/${name}`, { mode: 0o700 });
// A minimal environment prevents unknown provider variables from leaking in.
const env = { PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", HOME: `${dir}/home`, DATA_DIR: `${dir}/data`, npm_config_cache: `${dir}/cache`,
  NEXT_TELEMETRY_DISABLED: "1", JWT_SECRET: "worker-mesh-synthetic-jwt-not-production", API_KEY_SECRET: "worker-mesh-synthetic-api-not-production",
  INITIAL_PASSWORD: "worker-mesh-synthetic-password", MACHINE_ID_SALT: "worker-mesh-synthetic-machine", RUN_LIVE_TESTS: "0" };
const workspace = `${ROOT}/workspace`;
const tasks = {
  deps: [["npm", ["ci", "--no-audit", "--no-fund"], workspace], ["npm", ["ci", "--no-audit", "--no-fund"], `${workspace}/tests`]],
  build: [["npm", ["run", "build"], workspace]],
  test: [["node", ["node_modules/vitest/vitest.mjs", "run", "--maxWorkers=3", "--reporter=default", "--reporter=json", `--outputFile=${dir}/results.json`, ...args], `${workspace}/tests`]],
  lint: [["node", ["node_modules/eslint/bin/eslint.js", "."], workspace]],
  audit: [["npm", ["audit", "--json"], workspace], ["npm", ["audit", "--json"], `${workspace}/tests`], ["npm", ["audit", "--json"], `${workspace}/cli`]],
  smoke: [["node", ["-e", "console.log('worker smoke stdout'); console.error('worker smoke stderr'); setTimeout(() => { console.log('worker smoke recovered'); process.exit(7); }, 2200)"], workspace]],
};
if (!tasks[task] || (task !== "test" && args.length)) throw new Error("Unknown task or unexpected arguments");
// Prevent passing options that load custom code, change output paths, or enable live tests.
if (task === "test" && args.some((arg) => arg.startsWith("-") || !/^[\w./-]+\.test\.[cm]?js$/.test(arg) || arg.includes("..") || !resolve(`${workspace}/tests`, arg).startsWith(`${workspace}/tests/`))) throw new Error("Test arguments must be relative test file paths");
const state = { id, task, pid: process.pid, startedAt: new Date().toISOString(), status: "running", exitCode: null };
function save() { writeFileSync(`${dir}/status.tmp`, `${JSON.stringify(state)}\n`, { mode: 0o600 }); renameSync(`${dir}/status.tmp`, `${dir}/status.json`); }
function redact(line) {
  if (/(?:request|response)[_-]?(?:body|headers)|authorization\s*:|cookie\s*:|(?:prompt|messages)\s*[=:]/i.test(line)) return "[sensitive diagnostic line omitted]\n";
  return line.replace(/\b(?:sk-[a-zA-Z0-9_-]+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g, "[REDACTED]")
    .replace(/(bearer\s+)[^\s"',;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)\s*[=:]\s*["']?)[^\s"',;}]+/gi, "$1[REDACTED]");
}
function capture(stream, name) {
  let buffer = "";
  stream.setEncoding("utf8");
  const persist = (text) => appendFileSync(`${dir}/${name}.log`, redact(text), { mode: 0o600 });
  stream.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) { persist(buffer.slice(0, index + 1)); buffer = buffer.slice(index + 1); }
    // Never retain or emit an unbounded, possibly sensitive unterminated line.
    if (buffer.length > 65536) { persist("[oversized diagnostic line omitted]\n"); buffer = ""; }
  });
  stream.on("end", () => { if (buffer) persist(buffer + "\n"); });
}
for (const name of ["stdout", "stderr"]) writeFileSync(`${dir}/${name}.log`, "", { mode: 0o600 });
save();
let code = 0;
let failedCode = 0;
try {
  for (const [command, argv, cwd] of tasks[task]) {
    appendFileSync(`${dir}/stdout.log`, `[worker-mesh] ${task} step started\n`);
    const child = spawn(command, argv, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    if (task === "audit") child.stdout.pipe(createWriteStream(`${dir}/audit-${cwd.split("/").pop()}.json`, { mode: 0o600 }));
    capture(child.stdout, "stdout"); capture(child.stderr, "stderr");
    code = await new Promise((accept, reject) => { child.once("error", reject); child.once("close", (exit, signal) => accept(exit ?? (signal ? 128 : 1))); });
    if (code !== 0 && failedCode === 0) failedCode = code;
    if (code !== 0 && task !== "audit") break;
  }
} catch (error) {
  appendFileSync(`${dir}/stderr.log`, redact(`[worker-mesh] ${error.message}\n`)); code = 1;
}
code = failedCode || code;
state.exitCode = code; state.status = "exited"; state.finishedAt = new Date().toISOString(); save();
writeFileSync(`${dir}/exit-code`, `${code}\n`, { mode: 0o600 });
process.exitCode = code;
