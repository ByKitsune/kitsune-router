const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const https = require("node:https");
const http2 = require("node:http2");
const tls = require("node:tls");
const { EventEmitter } = require("node:events");
const { createRequire } = require("node:module");

// Execute the real MITM request listener with only OS side effects isolated.
// Native TLS validation and HTTP framing are never mocked. Only destination
// address/port are calibrated to ephemeral loopback fixtures.
async function run(directory, protocol, scenario) {
  const key = fs.readFileSync(path.join(directory, "leaf.key"));
  const cert = fs.readFileSync(path.join(directory, "leaf.crt"));
  const ca = fs.readFileSync(path.join(directory, "ca.crt"));
  const received = [];
  const sockets = new Set();
  let connections = 0;
  const upstream = protocol === "h2"
    ? http2.createSecureServer({ key, cert })
    : https.createServer({ key, cert });
  upstream.on("connection", (socket) => {
    connections++;
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  upstream.on("tlsClientError", () => {});
  upstream.on("request", async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({ headers: req.headers, body: Buffer.concat(chunks).toString(), path: req.url, protocol: req.httpVersion, servername: req.socket.servername });
    res.writeHead(201, { "content-type": "text/plain", "x-upstream": "verified" });
    res.end("upstream response");
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = upstream.address().port;
  let server;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  let destinationConnections = 0;
  const remap = (options) => {
    destinationConnections++;
    return { ...options, host: "127.0.0.1", hostname: "127.0.0.1", port: upstreamPort };
  };
  const sourcePath = path.resolve(__dirname, "../../src/mitm/server.js");
  const nativeRequire = createRequire(sourcePath);
  const logs = [];
  const processStub = new EventEmitter();
  Object.assign(processStub, { platform: process.platform, pid: process.pid, exit: (code) => { rejectReady(new Error(`Unexpected server exit ${code}`)); } });
  const isolatedRequire = (name) => {
    if (name === "./logger") return { log: (value) => logs.push(value), err: (value) => logs.push(value), clearDumpDir() {} };
    if (name === "./paths") return { DATA_DIR: directory, MITM_DIR: directory };
    if (name === "./cert/generate") return { async generateCert() { throw new Error("Unexpected certificate generation"); }, async getCertForDomain() { return { key, cert }; } };
    if (name === "./dbReader") return { getMitmAlias() { return null; } };
    // This optional IDE-only hook is outside the unknown-host passthrough seam.
    if (name === "./antigravityIdeVersion") return { applyAntigravityIdeVersionOverride() { throw new Error("Unexpected IDE override"); } };
    if (name.startsWith("./handlers/")) return { intercept() { throw new Error("Unexpected mapped interception"); } };
    if (name === "./dns/dnsConfig") return { removeAllDNSEntriesSync() {} };
    if (name === "child_process") return { execSync() { return ""; } };
    if (name === "dns") return { Resolver: class { setServers() {} resolve4(host, callback) { callback(null, ["127.0.0.1"]); } } };
    if (name === "./config") return { ...nativeRequire(name), IS_DEV: false };
    if (name === "tls") return { ...tls, connect: (options, callback) => tls.connect(remap(options), callback) };
    if (name === "https") return {
      ...https,
      request: (options, callback) => https.request(remap(options), callback),
      createServer(options, listener) {
        server = https.createServer(options, listener);
        server.once("listening", resolveReady);
        server.once("error", rejectReady);
        const listen = server.listen.bind(server);
        server.listen = (_port, callback) => listen(0, "127.0.0.1", callback);
        return server;
      },
    };
    return nativeRequire(name);
  };
  try {
    const startup = vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), {
      require: isolatedRequire, process: processStub, console,
      Buffer, setTimeout, clearTimeout,
    }, { filename: sourcePath });
    Promise.resolve(startup).catch(rejectReady);
    await ready;
  } catch (error) {
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
    throw error;
  }
  const host = scenario === "hostname-mismatch" ? "wrong.test" : "upstream.test";
  const post = () => new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "127.0.0.1", port: server.address().port,
      servername: "upstream.test", ca, method: "POST", path: "/forward?token=synthetic-query-secret",
      headers: { host, authorization: "Bearer synthetic-credential", "content-type": "text/plain", connection: "close" },
      agent: false,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    request.once("error", reject);
    request.end("synthetic-private-body");
  });
  try {
    const first = await post();
    let second;
    if (scenario === "changed-certificate") {
      upstream.setSecureContext({ key, cert: fs.readFileSync(path.join(directory, "wrong.crt")) });
      second = await post();
    }
    return { first, second, received, connections, destinationConnections, logs };
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => upstream.close(resolve));
  }
}

if (require.main === module) {
  run(...process.argv.slice(2)).then((result) => process.stdout.write(JSON.stringify(result)), (error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
