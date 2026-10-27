const path = require("path");
const fs = require("fs");
const { createPrivateKey, webcrypto, X509Certificate } = require("node:crypto");
require("reflect-metadata");
const x509 = require("@peculiar/x509");
const { MITM_DIR } = require("../paths");

const ROOT_CA_KEY_PATH = path.join(MITM_DIR, "rootCA.key");
const ROOT_CA_CERT_PATH = path.join(MITM_DIR, "rootCA.crt");
const SIGNING_ALGORITHM = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
const KEY_ALGORITHM = {
  ...SIGNING_ALGORITHM,
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
};

/**
 * Check if cert file is expired or expiring within 30 days.
 * Keep this synchronous for the manager's renewal decision.
 */
function isCertExpired(certPath) {
  try {
    const cert = new X509Certificate(fs.readFileSync(certPath));
    return new Date(cert.validTo).getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

async function privateKeyPem(key) {
  const encoded = await webcrypto.subtle.exportKey("pkcs8", key);
  return createPrivateKey({ key: Buffer.from(encoded), format: "der", type: "pkcs8" })
    .export({ format: "pem", type: "pkcs8" });
}

function createSerialNumber() {
  const serial = webcrypto.getRandomValues(new Uint8Array(16));
  serial[0] |= 1; // Keep a nonzero 16-byte value; X509 handles positive DER encoding.
  return Buffer.from(serial.buffer).toString("hex");
}

/**
 * Generate the root only when missing or expiring; library upgrades must not
 * rotate an existing trusted certificate or rewrite its private-key bytes.
 */
async function generateRootCA() {
  const exists = fs.existsSync(ROOT_CA_KEY_PATH) && fs.existsSync(ROOT_CA_CERT_PATH);
  if (exists && !isCertExpired(ROOT_CA_CERT_PATH)) {
    if (process.platform !== "win32") fs.chmodSync(ROOT_CA_KEY_PATH, 0o600);
    console.log("✅ Root CA already exists");
    return { key: ROOT_CA_KEY_PATH, cert: ROOT_CA_CERT_PATH };
  }
  if (exists) console.log("🔐 Root CA expired or expiring soon — regenerating...");
  fs.mkdirSync(MITM_DIR, { recursive: true, mode: 0o700 });
  console.log("🔐 Generating Root CA certificate...");

  const keys = await webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ["sign", "verify"]);
  const notBefore = new Date();
  const notAfter = new Date(notBefore);
  notAfter.setFullYear(notBefore.getFullYear() + 10);
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    name: [
      { CN: ["Kitsune Router MITM Root CA"] },
      { O: ["Kitsune Router"] },
      { C: ["US"] },
    ],
    keys,
    serialNumber: createSerialNumber(),
    signingAlgorithm: SIGNING_ALGORITHM,
    notBefore,
    notAfter,
    extensions: [
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey, false, webcrypto),
    ],
  }, webcrypto);
  const keyPem = await privateKeyPem(keys.privateKey);

  // mode only applies when creating a file; protect an existing key before
  // overwriting it as part of the normal expiry-based renewal as well.
  if (process.platform !== "win32" && fs.existsSync(ROOT_CA_KEY_PATH)) fs.chmodSync(ROOT_CA_KEY_PATH, 0o600);
  fs.writeFileSync(ROOT_CA_KEY_PATH, keyPem, { mode: 0o600 });
  fs.writeFileSync(ROOT_CA_CERT_PATH, cert.toString("pem"));
  console.log("✅ Root CA generated successfully");
  return { key: ROOT_CA_KEY_PATH, cert: ROOT_CA_CERT_PATH };
}

/**
 * Load PKCS#1 or PKCS#8 persisted keys through standard WebCrypto import.
 */
async function loadRootCA() {
  if (!fs.existsSync(ROOT_CA_KEY_PATH) || !fs.existsSync(ROOT_CA_CERT_PATH)) {
    throw new Error("Root CA not found. Generate it first.");
  }
  if (process.platform !== "win32") fs.chmodSync(ROOT_CA_KEY_PATH, 0o600);
  const key = createPrivateKey(fs.readFileSync(ROOT_CA_KEY_PATH));
  const cert = new x509.X509Certificate(fs.readFileSync(ROOT_CA_CERT_PATH, "utf8"));
  const signingKey = await webcrypto.subtle.importKey(
    "pkcs8",
    key.export({ format: "der", type: "pkcs8" }),
    SIGNING_ALGORITHM,
    false,
    ["sign"]
  );
  return { key: signingKey, cert };
}

/**
 * Generate a domain and wildcard leaf, preserving the persisted issuer's DER.
 */
async function generateLeafCert(domain, rootCA) {
  const keys = await webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ["sign", "verify"]);
  const notBefore = new Date();
  const notAfter = new Date(notBefore);
  notAfter.setFullYear(notBefore.getFullYear() + 1);
  const cert = await x509.X509CertificateGenerator.create({
    subject: [{ CN: [domain] }],
    issuer: rootCA.cert.subjectName,
    publicKey: keys.publicKey,
    signingKey: rootCA.key,
    serialNumber: createSerialNumber(),
    signingAlgorithm: SIGNING_ALGORITHM,
    notBefore,
    notAfter,
    extensions: [
      new x509.BasicConstraintsExtension(false),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth]),
      new x509.SubjectAlternativeNameExtension([
        { type: "dns", value: domain },
        { type: "dns", value: `*.${domain}` },
      ]),
    ],
  }, webcrypto);
  return { key: await privateKeyPem(keys.privateKey), cert: cert.toString("pem") };
}

module.exports = {
  generateRootCA,
  loadRootCA,
  generateLeafCert,
  isCertExpired,
  ROOT_CA_CERT_PATH,
  ROOT_CA_KEY_PATH,
};
