import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { authority, keyPair, leaf } = require("../helpers/mitm-certificates.cjs");
const execute = promisify(execFile);
const runner = fileURLToPath(new URL("../helpers/mitm-upstream-tls.cjs", import.meta.url));
let directory;

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsunerouter-upstream-tls-"));
  const ca = await authority();
  const pair = await keyPair();
  const certificate = await leaf(ca, "upstream.test", { pair, serialNumber: "02" });
  // setSecureContext below swaps only the certificate, so the wrong-host
  // certificate must have the same public/private key as the original leaf.
  const wrong = await leaf(ca, "other.test", { pair, serialNumber: "03" });
  fs.writeFileSync(path.join(directory, "ca.crt"), ca.cert);
  fs.writeFileSync(path.join(directory, "leaf.key"), certificate.key, { mode: 0o600 });
  fs.writeFileSync(path.join(directory, "leaf.crt"), certificate.cert);
  fs.writeFileSync(path.join(directory, "wrong.crt"), wrong.cert);
  // Loading this interception CA must not add it to outbound TLS trust.
  fs.writeFileSync(path.join(directory, "rootCA.key"), ca.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(path.join(directory, "rootCA.crt"), ca.cert);
});

afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

async function forward(protocol, scenario, trust) {
  const env = {};
  for (const name of ["SystemRoot", "TEMP", "TMP"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  if (trust) env.NODE_EXTRA_CA_CERTS = path.join(directory, "ca.crt");
  const { stdout } = await execute(process.execPath, [runner, directory, protocol, scenario], { env, timeout: 15000 });
  return JSON.parse(stdout);
}

for (const protocol of ["http/1.1", "h2"]) {
  describe(`MITM native ${protocol} upstream trust`, () => {
    it("rejects an untrusted upstream before forwarding credentials or body, without protocol retry", async () => {
      const result = await forward(protocol, "untrusted", false);
      expect(result.first).toMatchObject({ status: 502, body: "Bad Gateway" });
      expect(result.received).toEqual([]);
      expect(result.destinationConnections).toBe(1);
      expect(result.logs.join("\n")).not.toContain("synthetic-query-secret");
      expect(result.logs.join("\n")).not.toContain("synthetic-credential");
    });

    it("accepts operator NODE_EXTRA_CA_CERTS trust while preserving SNI, credentials, body and negotiated protocol", async () => {
      const result = await forward(protocol, "trusted", true);
      expect(result.first).toMatchObject({ status: 201, body: "upstream response", headers: { "x-upstream": "verified" } });
      expect(result.received).toEqual([expect.objectContaining({
        protocol: protocol === "h2" ? "2.0" : "1.1",
        servername: "upstream.test", body: "synthetic-private-body",
        path: "/forward?token=synthetic-query-secret",
        headers: expect.objectContaining({ authorization: "Bearer synthetic-credential" }),
      })]);
    });

    it("rejects a trusted CA certificate for the wrong hostname before forwarding", async () => {
      const result = await forward(protocol, "hostname-mismatch", true);
      expect(result.first).toMatchObject({ status: 502, body: "Bad Gateway" });
      expect(result.received).toEqual([]);
      expect(result.destinationConnections).toBe(1);
    });

    it("validates the actual forwarding connection even after successful ALPN is cached", async () => {
      const result = await forward(protocol, "changed-certificate", true);
      expect(result.first.status).toBe(201);
      expect(result.second.status).toBe(502);
      expect(result.received).toEqual([expect.objectContaining({ body: "synthetic-private-body" })]);
      expect(result.logs.join("\n")).not.toContain("synthetic-query-secret");
    });
  });
}
