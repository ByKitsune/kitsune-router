import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { X509Certificate } from "node:crypto";

const require = createRequire(import.meta.url);
const { authority } = require("../helpers/mitm-certificates.cjs");
const source = fs.readFileSync(new URL("../../src/mitm/cert/install.js", import.meta.url), "utf8");
const directories = [];

afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

async function fixture(name = "ZenRouter MITM Root CA") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-ca-migration-"));
  directories.push(directory);
  const ca = await authority({ name: `CN=${name}, O=Synthetic migration fixture` });
  // Quotes, dollar signs and spaces in a user-controlled data-dir path must
  // never reach a shell as syntax or environment expansion.
  const file = path.join(directory, "root ' $(do-not-execute) CA.crt");
  fs.writeFileSync(file, ca.cert);
  const fingerprint = new X509Certificate(ca.cert).fingerprint;
  return { directory, file, ca, fingerprint };
}

function loadInstaller(f, { platform = "linux", trusted = new Map(), nss = null, findOutput = "", verifyFails = false, windowsFingerprint = "", sudo = true } = {}) {
  const fixtureModule = { exports: {} };
  const calls = [];
  const unix = [];
  const elevated = [];
  const trustDirectories = new Set(["/usr/local/share/ca-certificates", "/etc/ca-certificates/trust-source/anchors", "/etc/pki/ca-trust/source/anchors", "/etc/pki/trust/anchors"]);
  const isTrustPath = file => [...trustDirectories].some(directory => file.startsWith(`${directory}/`));
  const absent = () => { throw Object.assign(new Error("Synthetic trust anchor absent"), { code: "ENOENT" }); };
  const profile = path.join(f.directory, ".mozilla", "firefox", "synthetic profile");
  const nssDirectory = path.join(f.directory, ".pki", "nssdb");
  const fakeFs = {
    ...fs,
    existsSync(file) { return trustDirectories.has(file) || trusted.has(file) || (!isTrustPath(file) && fs.existsSync(file)); },
    readFileSync(file, ...args) { return trusted.has(file) ? trusted.get(file) : isTrustPath(file) ? absent() : fs.readFileSync(file, ...args); },
    lstatSync(file) {
      if (trusted.has(file)) return { isFile: () => true };
      if (isTrustPath(file)) return absent();
      return fs.lstatSync(file);
    },
    statSync(file) {
      if (nss && [profile, nssDirectory].includes(file)) return { isDirectory: () => true };
      return fs.statSync(file);
    },
    readdirSync(file) {
      if (nss && file === path.dirname(profile)) return [path.basename(profile)];
      return fs.readdirSync(file);
    },
  };
  vm.runInNewContext(source, {
    module: fixtureModule, exports: fixtureModule.exports, Buffer, process: { platform },
    require(name) {
      if (name === "fs") return fakeFs;
      if (name === "os") return { homedir: () => f.directory };
      if (["path", "crypto"].includes(name)) return require(name);
      if (name === "../logger") return { log() {} };
      if (name === "../dns/dnsConfig.js") return { isSudoAvailable: () => sudo, async execWithPassword(command) { unix.push(command); } };
      if (name === "../winElevated.js") return { quotePs: value => `'${String(value).replaceAll("'", "''")}'`, async runElevatedPowerShell(script) { elevated.push(script); } };
      if (name === "child_process") return { execFile(command, args, options, callback) {
        calls.push({ command, args, options });
        if (command === "security") {
          if (args[0] === "find-certificate") return callback(null, findOutput);
          if (args[0] === "verify-cert") return callback(verifyFails ? new Error("Synthetic untrusted certificate") : null, "");
        }
        if (command === "powershell.exe") return callback(null, windowsFingerprint);
        if (command === "certutil" && nss && args.includes("-L")) return callback(null, nss);
        if (command === "certutil" && nss) return callback(null, "");
        callback(new Error("Synthetic optional trust utility absent"));
      } };
      throw new Error(`Unexpected certificate dependency: ${name}`);
    },
  });
  return { api: fixtureModule.exports, calls, unix, elevated, profile, nssDirectory };
}

describe("certificate identity across state migration", () => {
  it.each(["ZenRouter MITM Root CA", "9Router MITM Root CA", "Kitsune Router MITM Root CA"])("keeps an already trusted %s without issuing install or removal commands", async name => {
    const f = await fixture(name);
    const trusted = new Map([["/etc/pki/ca-trust/source/anchors/zenrouter-root-ca.crt", f.ca.cert]]);
    const loaded = loadInstaller(f, { trusted });
    expect(await loaded.api.checkCertInstalled(f.file)).toBe(true);
    await loaded.api.installCert("synthetic-not-a-password", f.file);
    expect(loaded.unix).toEqual([]);
    expect(loaded.elevated).toEqual([]);
    expect(loaded.calls).toEqual([]);
  });

  it("removes only Linux anchors with the exact migrated fingerprint, across trust-store layouts", async () => {
    const f = await fixture();
    const other = await fixture();
    const trusted = new Map([
      ["/usr/local/share/ca-certificates/zenrouter-root-ca.crt", f.ca.cert],
      ["/usr/local/share/ca-certificates/kitsune-router-root-ca.crt", other.ca.cert],
      ["/etc/pki/ca-trust/source/anchors/9router-root-ca.crt", f.ca.cert],
    ]);
    const loaded = loadInstaller(f, { trusted });
    await loaded.api.uninstallCert("synthetic-not-a-password", f.file);
    expect(loaded.unix).toHaveLength(1);
    expect(loaded.unix[0]).toContain("rm -f -- '/usr/local/share/ca-certificates/zenrouter-root-ca.crt'");
    expect(loaded.unix[0]).toContain("rm -f -- '/etc/pki/ca-trust/source/anchors/9router-root-ca.crt'");
    expect(loaded.unix[0]).not.toContain("kitsune-router-root-ca.crt");
    expect(loaded.unix[0]).toContain("update-ca-certificates");
    expect(loaded.unix[0]).toContain("update-ca-trust");
  });

  it("never runs an empty Linux removal or overwrites a different working root", async () => {
    const f = await fixture();
    const other = await fixture();
    const loaded = loadInstaller(f, { trusted: new Map([["/usr/local/share/ca-certificates/kitsune-router-root-ca.crt", other.ca.cert]]) });
    await loaded.api.uninstallCert("synthetic-not-a-password", f.file);
    expect(loaded.unix).toEqual([]);
    await expect(loaded.api.installCert("synthetic-not-a-password", f.file)).rejects.toThrow(/different trust anchor/);
    expect(loaded.unix).toEqual([]);
  });

  it("checks NSS certificate bytes before deleting a nickname and passes profile paths as arguments", async () => {
    const f = await fixture();
    const other = await fixture();
    const stale = loadInstaller(f, { nss: other.ca.cert, sudo: false });
    await stale.api.uninstallCert("synthetic-not-a-password", f.file);
    expect(stale.calls.some(call => call.args.includes("-D"))).toBe(false);
    const same = loadInstaller(f, { nss: f.ca.cert, sudo: false });
    await same.api.uninstallCert("synthetic-not-a-password", f.file);
    expect(same.calls.filter(call => call.args.includes("-D"))).toHaveLength(2);
    expect(same.calls.some(call => call.args.includes(`sql:${same.profile}`))).toBe(true);
    expect(same.calls.every(call => call.options.shell === undefined)).toBe(true);
  });

  it("matches a full macOS fingerprint and uses argument-array verification, never interpolating a certificate path", async () => {
    const f = await fixture();
    const compact = f.fingerprint.replaceAll(":", "");
    const loaded = loadInstaller(f, { platform: "darwin", findOutput: `SHA-1 hash: ${compact}\n` });
    expect(await loaded.api.checkCertInstalled(f.file)).toBe(true);
    const verify = loaded.calls.find(call => call.args[0] === "verify-cert");
    expect(verify.args).toContain(f.file);
    expect(verify.options.shell).toBeUndefined();
    await loaded.api.uninstallCert("synthetic-not-a-password", f.file);
    expect(loaded.unix[0]).toContain(`delete-certificate -Z "${compact}"`);
    expect(loaded.unix[0]).not.toContain("delete-certificate -c");
    const prefixOnly = loadInstaller(f, { platform: "darwin", findOutput: `SHA-1 hash: ${compact}123\n` });
    expect(await prefixOnly.api.checkCertInstalled(f.file)).toBe(false);
  });

  it("adds macOS trust without deleting other roots sharing its subject and shell-quotes operator paths", async () => {
    const f = await fixture();
    const loaded = loadInstaller(f, { platform: "darwin" });
    await loaded.api.installCert("synthetic-not-a-password", f.file);
    expect(loaded.unix).toHaveLength(1);
    expect(loaded.unix[0]).toContain("add-trusted-cert");
    expect(loaded.unix[0]).not.toContain("delete-certificate");
    expect(loaded.unix[0]).toContain(`'${f.file.replaceAll("'", "'\\''")}'`);
  });

  it("checks and removes Windows trust only by exact thumbprint and never deletes by shared CN", async () => {
    const f = await fixture();
    const compact = f.fingerprint.replaceAll(":", "");
    const loaded = loadInstaller(f, { platform: "win32", windowsFingerprint: compact });
    expect(await loaded.api.checkCertInstalled(f.file)).toBe(true);
    const call = loaded.calls[0];
    const script = Buffer.from(call.args.at(-1), "base64").toString("utf16le");
    expect(script).toContain(`Cert:\\LocalMachine\\Root\\${compact}`);
    expect(call.options.shell).toBeUndefined();
    await loaded.api.uninstallCert("synthetic-not-a-password", f.file);
    expect(loaded.elevated[0]).toContain(`-delstore Root '${compact}'`);
    expect(loaded.elevated[0]).not.toContain("ZenRouter MITM Root CA");
    const install = loadInstaller(f, { platform: "win32" });
    await install.api.installCert("synthetic-not-a-password", f.file);
    expect(install.elevated[0]).toContain("-addstore Root");
    expect(install.elevated[0]).not.toContain("-delstore");
  });

  it("requires an actual recognized root before any system command", async () => {
    const f = await fixture("Unrelated organization root CA");
    const loaded = loadInstaller(f);
    await expect(loaded.api.uninstallCert("synthetic-not-a-password")).rejects.toThrow(/required/);
    await expect(loaded.api.uninstallCert("synthetic-not-a-password", f.file)).rejects.toThrow(/Unrecognized/);
    await expect(loaded.api.installCert("synthetic-not-a-password", f.file)).rejects.toThrow(/Unrecognized/);
    expect(loaded.calls).toEqual([]);
    expect(loaded.unix).toEqual([]);
    expect(loaded.elevated).toEqual([]);
  });
});
