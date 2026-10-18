const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const { createRequire } = require("node:module");

// The entry point really clears dumps/hosts and kills port 443. Isolate every
// such boundary; keep its startup, SNI callback and native TLS server real.
function evaluateServer({ directory, generateCert, getCertForDomain }) {
  const sourcePath = path.resolve(__dirname, "../../src/mitm/server.js");
  const nativeRequire = createRequire(sourcePath);
  const reads = [];
  const exits = [];
  const logs = [];
  const callbacks = [];
  const sockets = new Set();
  let server;
  let options;
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  ready.catch(() => {});
  const processStub = new EventEmitter();
  Object.assign(processStub, {
    platform: process.platform,
    pid: process.pid,
    exit(code) {
      exits.push(code);
      readyReject(new Error(`MITM exited ${code}`));
    },
  });
  const isolatedRequire = (name) => {
    if (name === "./logger") return { log: (message) => logs.push(message), err: (message) => logs.push(message), clearDumpDir() {} };
    if (name === "./paths") return { DATA_DIR: directory, MITM_DIR: directory };
    if (name === "./cert/generate") return { generateCert, getCertForDomain };
    if (name === "./dbReader") return { getMitmAlias() { return null; } };
    if (name === "./antigravityIdeVersion") return { applyAntigravityIdeVersionOverride() { throw new Error("Unexpected IDE request"); } };
    if (name.startsWith("./handlers/")) return { intercept() { throw new Error("Unexpected intercepted request"); } };
    if (name === "./dns/dnsConfig") return { removeAllDNSEntriesSync() {} };
    if (name === "child_process") return { execSync() { return ""; } };
    if (name === "./config") return { ...nativeRequire(name), IS_DEV: false };
    if (name === "fs") return {
      ...fs,
      readFileSync(filename, ...args) {
        if (/rootCA\.(key|crt)$/.test(String(filename))) reads.push(String(filename));
        return fs.readFileSync(filename, ...args);
      },
    };
    if (name === "https") return {
      ...https,
      createServer(sslOptions, listener) {
        options = sslOptions;
        server = https.createServer(sslOptions, listener);
        server.on("connection", (socket) => {
          sockets.add(socket);
          socket.once("close", () => sockets.delete(socket));
        });
        server.on("tlsClientError", () => {});
        const listen = server.listen.bind(server);
        server.listen = (_port, callback) => listen(0, "127.0.0.1", callback);
        server.once("listening", () => readyResolve(server));
        server.once("error", readyReject);
        return server;
      },
    };
    return nativeRequire(name);
  };
  try {
    const result = vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), {
      require: isolatedRequire, process: processStub, console: { log() {}, error: (message) => logs.push(message) },
      Buffer, setTimeout, clearTimeout,
    }, { filename: sourcePath });
    Promise.resolve(result).catch(readyReject);
  } catch (error) {
    readyReject(error);
  }
  return {
    reads, exits, logs, ready, callbacks,
    get server() { return server; },
    sni(host) {
      return new Promise((resolve) => {
        let count = 0;
        const result = { host, get count() { return count; } };
        callbacks.push(result);
        options.SNICallback(host, (error, context) => {
          count++;
          resolve({ error, context });
        });
      });
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      if (server?.listening) await new Promise((resolve) => server.close(resolve));
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  // Old code does not consume async issuance. Keep its expected RED from
  // becoming an unrelated unhandled-rejection failure in the runner.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

module.exports = { evaluateServer, deferred };
