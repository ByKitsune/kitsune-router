import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const directories = [];
const runtime = require.resolve("../../src/mitm/cert/rootCA.js");
const fixtures = require.resolve("../helpers/mitm-certificates.cjs");
const root = path.dirname(path.dirname(path.dirname(fixtures)));
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

describe("one PKI generation for runtime and security fixtures", () => {
  it.each(["runtime-first", "fixture-first"])("creates signed SAML fixtures and verified TLS in one process: %s", async order => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-pki-generation-"));
    directories.push(directory);
    const script = `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const tls = require('node:tls');
      const { SAML } = require('@node-saml/node-saml');
      const { SignedXml } = require('xml-crypto');
      let runtime, fixtures;
      if (${JSON.stringify(order)} === 'runtime-first') {
        runtime = require(${JSON.stringify(runtime)});
        fixtures = require(${JSON.stringify(fixtures)});
      } else {
        fixtures = require(${JSON.stringify(fixtures)});
        runtime = require(${JSON.stringify(runtime)});
      }
      (async () => {
        const idp = await fixtures.authority({ name: 'CN=idp.example.com' });
        const privateKey = idp.privateKey.export({ type: 'pkcs8', format: 'pem' });
        const signature = new SignedXml({ privateKey, publicCert: idp.cert,
          signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
          canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#' });
        signature.addReference({ xpath: "/*[local-name()='Assertion']",
          transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature','http://www.w3.org/2001/10/xml-exc-c14n#'],
          digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' });
        signature.computeSignature('<Assertion ID="_fixture"><NameID>synthetic@example.invalid</NameID></Assertion>');
        const verifier = new SignedXml({ publicCert: idp.cert });
        verifier.loadSignature(signature.getSignatureXml());
        assert.equal(verifier.checkSignature(signature.getSignedXml()), true);
        let tamperRejected = false;
        try { tamperRejected = !verifier.checkSignature(signature.getSignedXml().replace('synthetic@example.invalid','tampered@example.invalid')); }
        catch { tamperRejected = true; }
        assert.equal(tamperRejected, true);
        const sp = new SAML({ issuer: 'urn:synthetic:sp', idpCert: idp.cert,
          callbackUrl: 'https://sp.example.invalid/acs', wantAssertionsSigned: true,
          wantAuthnResponseSigned: true, validateInResponseTo: 'always' });
        assert.match(sp.generateServiceProviderMetadata(), /urn:synthetic:sp/);
        const files = await runtime.generateRootCA();
        const loaded = await runtime.loadRootCA();
        assert.equal(loaded.cert instanceof fixtures.x509.X509Certificate, true);
        const leaf = await runtime.generateLeafCert('pki.fixture.invalid', loaded);
        const ca = fs.readFileSync(files.cert, 'utf8');
        const sockets = new Set();
        const server = tls.createServer(leaf, socket => socket.end());
        server.on('tlsClientError', () => {});
        server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const connect = (servername, trust) => new Promise((resolve, reject) => {
          const socket = tls.connect({ host: '127.0.0.1', port: server.address().port, servername, ...(trust ? { ca: trust } : {}) });
          socket.once('secureConnect', () => { const authorized = socket.authorized; socket.end(); resolve(authorized); });
          socket.once('error', error => { socket.destroy(); reject(error); });
        });
        try {
          assert.equal(await connect('pki.fixture.invalid', ca), true);
          await assert.rejects(connect('wrong.fixture.invalid', ca), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
          await assert.rejects(connect('pki.fixture.invalid'));
        } finally {
          for (const socket of sockets) socket.destroy();
          await new Promise(resolve => server.close(resolve));
        }
        console.log('PKI_RESULT=' + JSON.stringify({ signature: true, tamperRejected, tls: true, wrongHostRejected: true, untrustedRejected: true }));
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const result = await execute(process.execPath, ["-e", script], {
      cwd: root, env: { ...process.env, DATA_DIR: directory }, timeout: 15000,
    });
    const marker = result.stdout.split("\n").find(line => line.startsWith("PKI_RESULT="));
    expect(JSON.parse(marker.slice("PKI_RESULT=".length))).toEqual({ signature: true, tamperRejected: true, tls: true, wrongHostRejected: true, untrustedRejected: true });
  }, 20000);
});
