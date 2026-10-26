import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const wrapper = fileURLToPath(new URL("../../custom-server.js", import.meta.url));
function probe(connection, rawHeaders = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", `
require(process.env.WRAPPER);
const http = require('node:http');
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
let sockets = 0;
const server = http.createServer((req, res) => {
  const headers = process.env.RAW_HEADERS === '1'
    ? ['Content-Type', 'text/event-stream', 'cOnNeCtIoN', 'keep-alive']
    : { 'Content-Type': 'text/event-stream', CONNECTION: 'keep-alive' };
  res.writeHead(200, headers);
  res.write('data: first\\n\\n');
  setTimeout(() => res.end('data: last\\n\\n'), 5);
});
server.on('connection', () => sockets++);
server.listen(0, '127.0.0.1', async () => {
  const call = () => new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: server.address().port, path: '/', agent,
      headers: { Connection: process.env.CONNECTION } }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, connection: res.headers.connection, text }));
    });
    req.on('error', reject);
  });
  try { console.log(JSON.stringify({ results: await Promise.all([call(), call()]), sockets })); }
  catch (error) { console.error(error); process.exitCode = 2; }
  finally { agent.destroy(); server.closeAllConnections(); server.close(); }
});
`], { env: { ...process.env, WRAPPER: wrapper, CONNECTION: connection, RAW_HEADERS: rawHeaders ? "1" : "0", DISABLE_BACKGROUND_TOKEN_REFRESH: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("HTTP close probe hung")); }, 5000);
    child.stdout.on("data", data => { stdout += data; });
    child.stderr.on("data", data => { stderr += data; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(stderr || `probe failed ${code}`));
      else { try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); } }
    });
  });
}

describe("client HTTP close intent", () => {
  for (const [connection, rawHeaders] of [["close", false], ["Keep-Alive, ClOsE", false], ["close", true]]) {
    it(`does not reopen an SSE response for ${connection}, raw headers ${rawHeaders}`, async () => {
      const evidence = await probe(connection, rawHeaders);
      expect(evidence.sockets).toBe(2);
      expect(evidence.results).toEqual([0, 1].map(() => ({ status: 200, connection: "close", text: "data: first\n\ndata: last\n\n" })));
    });
  }
  it("retains persistent connections for ordinary queued SSE requests", async () => {
    const evidence = await probe("keep-alive");
    expect(evidence.sockets).toBe(1);
    expect(evidence.results).toEqual([0, 1].map(() => ({ status: 200, connection: "keep-alive", text: "data: first\n\ndata: last\n\n" })));
  });
});
