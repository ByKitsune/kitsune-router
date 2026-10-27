const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { execWithPassword, isSudoAvailable } = require("../dns/dnsConfig.js");
const { runElevatedPowerShell, quotePs } = require("../winElevated.js");
const { log } = require("../logger");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const LINUX_CERT_PATHS = [
  // Debian / Ubuntu
  { dir: "/usr/local/share/ca-certificates", cmd: "update-ca-certificates" },
  // Arch Linux / CachyOS / Manjaro
  { dir: "/etc/ca-certificates/trust-source/anchors", cmd: "update-ca-trust" },
  // Fedora / RHEL / CentOS
  { dir: "/etc/pki/ca-trust/source/anchors", cmd: "update-ca-trust" },
  // openSUSE
  { dir: "/etc/pki/trust/anchors", cmd: "update-ca-certificates" }
];

function getLinuxCertConfig() {
  for (const config of LINUX_CERT_PATHS) {
    if (fs.existsSync(config.dir)) {
      return config;
    }
  }
  // Fallback to Debian default if none exist
  return LINUX_CERT_PATHS[0];
}
const ROOT_CA_CN = "Kitsune Router MITM Root CA";
const LINUX_CERT_NAMES = ["kitsune-router-root-ca.crt", "zenrouter-root-ca.crt", "9router-root-ca.crt"];
const quoteSh = value => `'${String(value).replace(/'/g, "'\\''")}'`;

function runFile(command, args) {
  return new Promise((resolve, reject) => execFile(command, args, { windowsHide: true, timeout: 10000 }, (error, stdout) => {
    if (error) reject(error);
    else resolve(stdout);
  }));
}
// Existing trusted roots are identities, not UI labels. Preserve their actual
// subject and fingerprint after data migration instead of requiring new trust.
function certificateName(certPath) {
  if (!certPath) throw new Error("A root certificate file is required");
  const certificate = new crypto.X509Certificate(fs.readFileSync(certPath));
  const commonName = certificate.subject.split("\n").find((part) => part.startsWith("CN="))?.slice(3);
  if (![ROOT_CA_CN, "ZenRouter MITM Root CA", "9Router MITM Root CA"].includes(commonName) || !certificate.ca) {
    throw new Error("Unrecognized application root certificate subject");
  }
  return commonName;
}

// Get SHA1 fingerprint from cert file using Node.js crypto
function getCertFingerprint(certPath) {
  return new crypto.X509Certificate(fs.readFileSync(certPath)).fingerprint;
}

/**
 * Check if certificate is already installed in system store
 */
async function checkCertInstalled(certPath) {
  if (IS_WIN) return checkCertInstalledWindows(certPath);
  if (IS_MAC) return checkCertInstalledMac(certPath);
  return checkCertInstalledLinux(certPath);
}

async function checkCertInstalledMac(certPath) {
  try {
    const fingerprint = getCertFingerprint(certPath).replace(/:/g, "");
    const output = await runFile("security", ["find-certificate", "-a", "-Z", "/Library/Keychains/System.keychain"]);
    if (!new RegExp(`^\\s*SHA-1 hash:\\s*${fingerprint}\\s*$`, "im").test(output)) return false;
    await runFile("security", ["verify-cert", "-c", certPath, "-p", "ssl", "-k", "/Library/Keychains/System.keychain"]);
    return true;
  } catch { return false; }
}

async function checkCertInstalledWindows(certPath) {
  try {
    const fingerprint = getCertFingerprint(certPath).replace(/:/g, "");
    const script = `$ErrorActionPreference='Stop'; (Get-Item -LiteralPath 'Cert:\\LocalMachine\\Root\\${fingerprint}').Thumbprint`;
    const output = await runFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")]);
    return output.trim().toUpperCase() === fingerprint;
  } catch { return false; }
}

/**
 * Install SSL certificate to system trust store
 */
async function installCert(sudoPassword, certPath, { check = () => {} } = {}) {
  check();
  if (!fs.existsSync(certPath)) {
    throw new Error(`Certificate file not found: ${certPath}`);
  }
  certificateName(certPath);

  const isInstalled = await checkCertInstalled(certPath);
  check();
  if (isInstalled) {
    log("🔐 Cert: already trusted ✅");
    return;
  }

  if (IS_WIN) {
    await installCertWindows(certPath, check);
  } else if (IS_MAC) {
    await installCertMac(sudoPassword, certPath, check);
  } else {
    await installCertLinux(sudoPassword, certPath, check);
  }
  check();
}

async function installCertMac(sudoPassword, certPath, check) {
  // A shared subject is not an identity. Never delete somebody else's root or
  // an older installation's still-working CA while installing this exact one.
  const install = `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${quoteSh(certPath)}`;
  check();
  try {
    await execWithPassword(install, sudoPassword);
    check();
    log("🔐 Cert: ✅ installed to system keychain");
  } catch (error) {
    check();
    const msg = error.message?.includes("canceled") ? "User canceled authorization" : "Certificate install failed";
    throw new Error(msg);
  }
}

async function installCertWindows(certPath, check) {
  // Auto-elevate via UAC popup if not admin (zero popup if already admin).
  const script = `
    $exit = & certutil -addstore Root ${quotePs(certPath)} 2>&1
    if ($LASTEXITCODE -ne 0) { throw "certutil exit $LASTEXITCODE" }
  `;
  check();
  try {
    await runElevatedPowerShell(script);
    check();
    log("🔐 Cert: ✅ installed to Windows Root store");
  } catch (e) {
    check();
    throw new Error(`Failed to install certificate: ${e.message}`);
  }
}

/**
 * Uninstall SSL certificate from system store
 */
async function uninstallCert(sudoPassword, certPath) {
  // Missing/invalid paths must fail before any name-based removal or command.
  certificateName(certPath);
  if (!IS_WIN && !IS_MAC) return uninstallCertLinux(sudoPassword, certPath);
  const isInstalled = await checkCertInstalled(certPath);
  if (!isInstalled) {
    log("🔐 Cert: not found in system store");
    return;
  }

  if (IS_WIN) {
    await uninstallCertWindows(certPath);
  } else if (IS_MAC) {
    await uninstallCertMac(sudoPassword, certPath);
  }
}

async function uninstallCertMac(sudoPassword, certPath) {
  const fingerprint = getCertFingerprint(certPath).replace(/:/g, "");
  const command = `security delete-certificate -Z "${fingerprint}" /Library/Keychains/System.keychain`;
  try {
    await execWithPassword(command, sudoPassword);
    log("🔐 Cert: ✅ uninstalled from system keychain");
  } catch (err) {
    throw new Error("Failed to uninstall certificate");
  }
}

async function uninstallCertWindows(certPath) {
  // Auto-elevate via UAC popup if not admin
  const script = `& certutil -delstore Root ${quotePs(getCertFingerprint(certPath).replace(/:/g, ""))}; if ($LASTEXITCODE -ne 0) { throw "certutil exit $LASTEXITCODE" }`;
  try {
    await runElevatedPowerShell(script);
    log("🔐 Cert: ✅ uninstalled from Windows Root store");
  } catch (e) {
    throw new Error(`Failed to uninstall certificate: ${e.message}`);
  }
}

function checkCertInstalledLinux(certPath) {
  let fingerprint;
  try { fingerprint = getCertFingerprint(certPath); } catch { return Promise.resolve(false); }
  return Promise.resolve(matchingLinuxCertificates(fingerprint).length > 0);
}

function matchingLinuxCertificates(fingerprint) {
  return LINUX_CERT_PATHS.flatMap(config => LINUX_CERT_NAMES.map(name => ({ ...config, file: path.join(config.dir, name) }))).filter(config => {
    try { return fs.lstatSync(config.file).isFile() && getCertFingerprint(config.file) === fingerprint; } catch { return false; }
  });
}

async function updateNssDatabases(certPath, action = "add") {
  const certName = certificateName(certPath);
  const fingerprint = getCertFingerprint(certPath);
  const home = os.homedir();
  const directories = [path.join(home, ".pki", "nssdb"), path.join(home, "snap", "chromium", "current", ".pki", "nssdb")];
  for (const profiles of [path.join(home, ".mozilla", "firefox"), path.join(home, "snap", "firefox", "common", ".mozilla", "firefox")]) {
    try {
      for (const name of fs.readdirSync(profiles)) directories.push(path.join(profiles, name));
    } catch { /* optional browser installation */ }
  }
  for (const directory of directories) {
    try { if (!fs.statSync(directory).isDirectory()) continue; } catch { continue; }
    for (const database of [`sql:${directory}`, directory]) {
      let existing;
      try { existing = await runFile("certutil", ["-d", database, "-L", "-n", certName, "-a"]); }
      catch { /* nickname absent, utility unavailable or other NSS format */ }
      if (existing) {
        try { if (new crypto.X509Certificate(existing).fingerprint !== fingerprint) break; }
        catch { break; } // ambiguous output is never authority to delete a root
      }
      if (action === "delete" && !existing) continue;
      try {
        await runFile("certutil", action === "add"
          ? ["-d", database, "-A", "-t", "C,,", "-n", certName, "-i", certPath]
          : ["-d", database, "-D", "-n", certName]);
        break;
      } catch { /* best effort; try the other NSS database format */ }
    }
  }
}

async function installCertLinux(sudoPassword, certPath, check) {
  check();
  if (!isSudoAvailable()) {
    log(`🔐 Cert: cannot install to system store without sudo — trust this file on clients: ${certPath}`);
    // Still try to update user NSS DBs even if no sudo!
    await updateNssDatabases(certPath, 'add');
    check();
    return;
  }
  
  const config = getLinuxCertConfig();
  const destFile = `${config.dir}/kitsune-router-root-ca.crt`;
  try {
    const stat = fs.lstatSync(destFile);
    if (!stat.isFile() || getCertFingerprint(destFile) !== getCertFingerprint(certPath)) throw new Error("A different trust anchor already exists; review it before replacing the working CA");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  
  // Copy to the discovered directory and execute the specific update command
  const cmd = `cp -n -- ${quoteSh(certPath)} ${quoteSh(destFile)} && ${config.cmd}`;
  
  try {
    await execWithPassword(cmd, sudoPassword);
    check();
    if (getCertFingerprint(destFile) !== getCertFingerprint(certPath)) throw new Error("Trust anchor changed during installation; existing root retained for review");
    await updateNssDatabases(certPath, 'add');
    check();
    log(`🔐 Cert: ✅ installed to Linux trust store (${config.dir}) and user browser databases`);
  } catch (error) {
    check();
    throw new Error(`Certificate install failed: ${error.message}`);
  }
}

async function uninstallCertLinux(sudoPassword, certPath) {
  // Always try to uninstall from user DBs even without sudo
  await updateNssDatabases(certPath, 'delete');

  if (!isSudoAvailable()) {
    return;
  }
  
  const fingerprint = getCertFingerprint(certPath);
  const matches = matchingLinuxCertificates(fingerprint);
  if (!matches.length) return; // never execute an empty removal command
  const commands = [...new Set(matches.map(config => config.cmd))];
  const cmd = [...matches.map(config => `rm -f -- ${quoteSh(config.file)}`), ...commands].join(" && ");
  
  try {
    await execWithPassword(cmd, sudoPassword);
    log("🔐 Cert: ✅ uninstalled from Linux trust store and user browser databases");
  } catch (error) {
    throw new Error("Failed to uninstall certificate");
  }
}

module.exports = { installCert, uninstallCert, checkCertInstalled };
