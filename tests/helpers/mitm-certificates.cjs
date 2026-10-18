require("reflect-metadata");
const { createPrivateKey, webcrypto } = require("node:crypto");
const x509 = require("@peculiar/x509");

const algorithm = {
  name: "RSASSA-PKCS1-v1_5",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

async function keyPair() {
  const keys = await webcrypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
  const encoded = await webcrypto.subtle.exportKey("pkcs8", keys.privateKey);
  return { keys, privateKey: createPrivateKey({ key: Buffer.from(encoded), format: "der", type: "pkcs8" }) };
}

async function authority({ name = "CN=Synthetic upstream test CA", notAfter = new Date("2040-01-01T00:00:00Z") } = {}) {
  const { keys, privateKey } = await keyPair();
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    name,
    keys,
    serialNumber: "1234567890abcdef1234567890abcdef",
    notBefore: new Date("2020-01-01T00:00:00Z"),
    notAfter,
    extensions: [
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey, false, webcrypto),
    ],
  }, webcrypto);
  return { keys, privateKey, certificate, cert: certificate.toString("pem") };
}

async function leaf(ca, host, { pair, serialNumber = "abcdef1234567890abcdef1234567890" } = {}) {
  const { keys, privateKey } = pair || await keyPair();
  const certificate = await x509.X509CertificateGenerator.create({
    subject: [{ CN: [host] }],
    issuer: ca.certificate.subjectName,
    publicKey: keys.publicKey,
    signingKey: ca.keys.privateKey,
    serialNumber,
    notBefore: new Date("2020-01-01T00:00:00Z"),
    notAfter: new Date("2040-01-01T00:00:00Z"),
    extensions: [
      new x509.BasicConstraintsExtension(false),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([{ type: "dns", value: host }]),
    ],
  }, webcrypto);
  return { key: privateKey.export({ type: "pkcs8", format: "pem" }), cert: certificate.toString("pem") };
}

module.exports = { authority, keyPair, leaf, x509 };
