import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const lifecycle = fileURLToPath(new URL("../../shutdown-lifecycle.cjs", import.meta.url));
const wrapper = fileURLToPath(new URL("../../custom-server.js", import.meta.url));

function run(code, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", code], { env: { ...process.env, LIFECYCLE: lifecycle, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("shutdown fixture hung")); }, 5000);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", status => { clearTimeout(timer); resolve({ stdout, stderr, status }); });
  });
}

describe("shutdown phase lifecycle", () => {
  it("stops admission first, drains durable work before database closure, and runs once", async () => {
    const result = await run(`
const { registerShutdownHook, runShutdownHooks, isShuttingDown } = require(process.env.LIFECYCLE);
const order = [];
registerShutdownHook('database', 60, () => order.push('database'));
registerShutdownHook('usage', 30, async () => { await new Promise(r => setTimeout(r, 10)); order.push('usage'); });
registerShutdownHook('admission', 10, () => order.push('admission'));
const first = runShutdownHooks({ deadlineMs: 1000 });
if (!isShuttingDown() || first !== runShutdownHooks()) process.exit(2);
first.then(() => console.log(JSON.stringify(order))).catch(() => process.exit(3));
`);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(["admission", "usage", "database"]);
  });

  it("does not close the database beneath failed or timed out workers", async () => {
    for (const worker of ["return Promise.reject(new Error('worker failed'))", "return new Promise(() => {})"]) {
      const result = await run(`
const { registerShutdownHook, runShutdownHooks } = require(process.env.LIFECYCLE);
registerShutdownHook('usage', 30, () => { ${worker}; });
registerShutdownHook('database', 60, () => console.log('closed'));
runShutdownHooks({ deadlineMs: 30 }).then(() => process.exit(2)).catch(() => console.log('refused'));
`);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe("refused");
    }
  });

  it("unregistering an old hook cannot remove its replacement", async () => {
    const result = await run(`
const { registerShutdownHook, runShutdownHooks } = require(process.env.LIFECYCLE);
const unregister = registerShutdownHook('database', 60, () => console.log('old'));
registerShutdownHook('database', 60, () => console.log('new'));
unregister();
runShutdownHooks().catch(() => process.exit(2));
`);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("new");
  });

  it("the real HTTP wrapper drains an active request before durable work and database shutdown", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "zen-shutdown-http-"));
    try {
      cpSync(lifecycle, join(fixture, "shutdown-lifecycle.cjs"));
      cpSync(wrapper, join(fixture, "custom-server.js"));
      writeFileSync(join(fixture, "server.js"), `
const http = require('node:http');
const { registerShutdownHook } = require('./shutdown-lifecycle.cjs');
registerShutdownHook('usage', 30, () => console.log('usage-drained'));
registerShutdownHook('db', 60, () => console.log('database-closed'));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.write('first');
  setTimeout(() => res.end('-last'), 100);
});
server.listen(0, '127.0.0.1', () => console.log('PORT=' + server.address().port));
`);
      const result = await run(`
const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(process.execPath, [path.join(process.env.FIXTURE, 'custom-server.js')], {
  env: { ...process.env, NODE_ENV: 'production', DISABLE_BACKGROUND_TOKEN_REFRESH: '1', ZENROUTER_SHUTDOWN_DEADLINE_MS: '2000' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '', errors = '', started = false, bodyPromise;
child.stderr.on('data', data => { errors += data; });
child.stdout.on('data', data => {
  output += data;
  const match = output.match(/PORT=(\\d+)/);
  if (!match || started) return;
  started = true;
  bodyPromise = fetch('http://127.0.0.1:' + match[1]).then(response => {
    child.kill('SIGTERM');
    return response.text();
  });
});
child.on('exit', async code => {
  try {
    const body = await bodyPromise;
    console.log(JSON.stringify({ code, body, output, errors }));
  } catch (error) { console.error(error); process.exitCode = 2; }
});
`, { FIXTURE: fixture });
      expect(result.status, result.stderr).toBe(0);
      const evidence = JSON.parse(result.stdout);
      expect(evidence.code, evidence.errors).toBe(0);
      expect(evidence.body).toBe("first-last");
      expect(evidence.output.indexOf("usage-drained")).toBeGreaterThan(-1);
      expect(evidence.output.indexOf("database-closed")).toBeGreaterThan(evidence.output.indexOf("usage-drained"));
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });
});
