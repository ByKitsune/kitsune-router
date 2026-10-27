import { afterEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { X509Certificate, createPrivateKey, createPublicKey } from "node:crypto";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const { authority, x509 } = require("../helpers/mitm-certificates.cjs");
const directories = [];
const rootCAPath = require.resolve("../../src/mitm/cert/rootCA.js");

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsunerouter-mitm-ca-"));
  directories.push(directory);
  return directory;
}

function loadCertificates(dataDir) {
  const modulePaths = [rootCAPath, require.resolve("../../src/mitm/cert/generate.js"), require.resolve("../../src/mitm/paths.js")];
  const cache = modulePaths.map((filename) => require.cache[filename]);
  for (const filename of modulePaths) delete require.cache[filename];
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  try {
    return { rootCA: require(rootCAPath), generate: require("../../src/mitm/cert/generate.js") };
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    modulePaths.forEach((filename, index) => {
      if (cache[index]) require.cache[filename] = cache[index];
      else delete require.cache[filename];
    });
  }
}

function seedCA(directory, fixture, encoding) {
  const mitm = path.join(directory, "mitm");
  fs.mkdirSync(mitm, { recursive: true });
  const key = fixture.privateKey.export({ type: encoding, format: "pem" });
  fs.writeFileSync(path.join(mitm, "rootCA.key"), key, { mode: 0o600 });
  fs.writeFileSync(path.join(mitm, "rootCA.crt"), fixture.cert);
  return { key, cert: fixture.cert };
}

async function connect(port, servername, ca) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: "127.0.0.1", port, servername, ...(ca ? { ca } : {}) });
    socket.once("secureConnect", () => {
      const authorized = socket.authorized;
      socket.end();
      resolve(authorized);
    });
    socket.once("error", (error) => { socket.destroy(); reject(error); });
  });
}

async function withTlsServer(certificate, callback) {
  const sockets = new Set();
  const server = tls.createServer(certificate, (socket) => socket.end());
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("tlsClientError", () => {});
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    await callback(server.address().port);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("MITM Root CA generation", () => {
  it("persists a matching, self-signed RSA CA with the new-install identity and existing extensions", async () => {
    const directory = temporaryDirectory();
    const { rootCA, generate } = loadCertificates(directory);
    const files = await generate.generateCert();
    expect(files).toEqual({ key: path.join(directory, "mitm", "rootCA.key"), cert: path.join(directory, "mitm", "rootCA.crt") });
    const key = createPrivateKey(fs.readFileSync(files.key));
    const cert = new X509Certificate(fs.readFileSync(files.cert));
    expect(cert.checkPrivateKey(key)).toBe(true);
    expect(cert.verify(cert.publicKey)).toBe(true);
    expect(cert.ca).toBe(true);
    expect(cert.publicKey.asymmetricKeyDetails.modulusLength).toBe(2048);
    const parsed = new x509.X509Certificate(fs.readFileSync(files.cert, "utf8"));
    expect(parsed.subjectName.getField("CN")).toEqual(["Kitsune Router MITM Root CA"]);
    expect(parsed.subjectName.getField("O")).toEqual(["Kitsune Router"]);
    expect(parsed.subjectName.getField("C")).toEqual(["US"]);
    expect(Buffer.from(parsed.issuerName.toArrayBuffer())).toEqual(Buffer.from(parsed.subjectName.toArrayBuffer()));
    expect(parsed.notAfter.getFullYear() - parsed.notBefore.getFullYear()).toBe(10);
    expect(parsed.getExtension(x509.BasicConstraintsExtension)).toMatchObject({ critical: true, ca: true });
    expect(parsed.getExtension(x509.KeyUsagesExtension)).toMatchObject({ critical: true, usages: 96 });
    expect(parsed.getExtension(x509.SubjectKeyIdentifierExtension).keyId).toMatch(/^[a-f0-9]{40}$/i);
    expect(rootCA.isCertExpired(files.cert)).toBe(false);
  });

  it.skipIf(process.platform === "win32")("keeps newly written and reused private keys owner-only under umask 022", async () => {
    const directory = temporaryDirectory();
    const script = `process.umask(0o022); Promise.resolve(require(${JSON.stringify(rootCAPath)}).generateRootCA()).catch(error => { console.error(error); process.exitCode = 1; });`;
    const generate = () => execute(process.execPath, ["-e", script], { env: { ...process.env, DATA_DIR: directory }, timeout: 15000 });
    await generate();
    const keyPath = path.join(directory, "mitm", "rootCA.key");
    expect(fs.statSync(keyPath).mode & 0o777).toBe(0o600);
    const original = fs.readFileSync(keyPath);
    fs.chmodSync(keyPath, 0o644);
    await generate();
    expect(fs.statSync(keyPath).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(keyPath)).toEqual(original);
  });

  it("retains a synchronous 30-day renewal predicate, treating missing or invalid PEM as expired", async () => {
    const directory = temporaryDirectory();
    const { rootCA } = loadCertificates(directory);
    const now = Date.UTC(2030, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    for (const [days, expired] of [[29, true], [30, false], [31, false]]) {
      const fixture = await authority({ notAfter: new Date(now + days * 24 * 60 * 60 * 1000) });
      const filename = path.join(directory, `expiry-${days}.crt`);
      fs.writeFileSync(filename, fixture.cert);
      expect(rootCA.isCertExpired(filename)).toBe(expired);
    }
    const invalid = path.join(directory, "invalid.crt");
    fs.writeFileSync(invalid, "not a certificate");
    expect(rootCA.isCertExpired(invalid)).toBe(true);
    expect(rootCA.isCertExpired(path.join(directory, "missing.crt"))).toBe(true);
  });

  for (const encoding of ["pkcs1", "pkcs8"]) {
    it(`reuses trusted ${encoding} CA bytes and exact issuer encoding across reloads and real TLS`, async () => {
      const directory = temporaryDirectory();
      const name = new x509.Name([
        { C: [{ printableString: "US" }] },
        { O: [{ utf8String: "Existing, trusted Root" }], OU: [{ utf8String: "Saved trust" }] },
        // Existing trust must retain the historical issuer, not be regenerated
        // solely to replace its display name after the rebrand.
        { CN: [{ utf8String: "ZenRouter MITM Root CA" }] },
      ]);
      const fixture = await authority({ name });
      const original = seedCA(directory, fixture, encoding);
      const fingerprint = new X509Certificate(original.cert).fingerprint256;
      for (let reload = 0; reload < 2; reload++) {
        const { rootCA, generate } = loadCertificates(directory);
        const files = await rootCA.generateRootCA();
        expect(fs.readFileSync(files.key, "utf8")).toBe(original.key);
        expect(fs.readFileSync(files.cert, "utf8")).toBe(original.cert);
        expect(new X509Certificate(fs.readFileSync(files.cert)).fingerprint256).toBe(fingerprint);
        const leaf = await generate.getCertForDomain("intercept.test");
        expect(leaf).not.toBeNull();
        const issued = new X509Certificate(leaf.cert);
        expect(issued.verify(new X509Certificate(original.cert).publicKey)).toBe(true);
        expect(issued.checkPrivateKey(createPrivateKey(leaf.key))).toBe(true);
        const parsed = new x509.X509Certificate(leaf.cert);
        expect(Buffer.from(parsed.issuerName.toArrayBuffer())).toEqual(Buffer.from(fixture.certificate.subjectName.toArrayBuffer()));
        await withTlsServer(leaf, async (port) => {
          await expect(connect(port, "intercept.test", original.cert)).resolves.toBe(true);
          await expect(connect(port, "child.intercept.test", original.cert)).resolves.toBe(true);
          await expect(connect(port, "unrelated.test", original.cert)).rejects.toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
          await expect(connect(port, "intercept.test")).rejects.toBeDefined();
        });
      }
    });
  }

  it("issues nonzero, unpredictable serials without Math.random and preserves leaf usages and wildcard SANs", async () => {
    const { rootCA } = loadCertificates(temporaryDirectory());
    vi.spyOn(Math, "random").mockReturnValue(0);
    const files = await rootCA.generateRootCA();
    const root = new X509Certificate(fs.readFileSync(files.cert));
    const loaded = await rootCA.loadRootCA();
    const leaves = await Promise.all([rootCA.generateLeafCert("serial.test", loaded), rootCA.generateLeafCert("serial.test", loaded)]);
    const serials = [root, ...leaves.map((leaf) => new X509Certificate(leaf.cert))].map((cert) => cert.serialNumber);
    for (const serial of serials) {
      expect(serial).toMatch(/^[a-f0-9]{30,40}$/i);
      expect(BigInt(`0x${serial}`)).not.toBe(0n);
    }
    expect(new Set(serials).size).toBe(3);
    const cert = new x509.X509Certificate(leaves[0].cert);
    expect(cert.getExtension(x509.BasicConstraintsExtension)).toMatchObject({ critical: false, ca: false });
    expect(cert.getExtension(x509.KeyUsagesExtension)).toMatchObject({ critical: false, usages: 5 });
    expect(cert.getExtension(x509.ExtendedKeyUsageExtension).usages).toEqual(["1.3.6.1.5.5.7.3.1", "1.3.6.1.5.5.7.3.2"]);
    expect(cert.notAfter.getFullYear() - cert.notBefore.getFullYear()).toBe(1);
    const native = new X509Certificate(leaves[0].cert);
    expect(native.checkHost("serial.test")).toBe("serial.test");
    expect(native.checkHost("child.serial.test")).toBe("*.serial.test");
    expect(native.checkHost("grand.child.serial.test")).toBeUndefined();
    expect(createPublicKey(leaves[0].key).export({ type: "spki", format: "pem" })).toBe(native.publicKey.export({ type: "spki", format: "pem" }));
  });
});
