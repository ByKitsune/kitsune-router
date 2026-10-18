import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { authority, leaf } = require("../helpers/mitm-certificates.cjs");
const { evaluateServer, deferred } = require("../helpers/mitm-server-harness.cjs");
const directories = [];
const harnesses = [];
let fixture;
let certificate;

beforeAll(async () => {
  fixture = await authority();
  certificate = await leaf(fixture, "intercept.test");
});

function directory() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), "zenrouter-mitm-startup-"));
  directories.push(value);
  return value;
}

function persistRoot(value) {
  fs.writeFileSync(path.join(value, "rootCA.key"), fixture.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(path.join(value, "rootCA.crt"), fixture.cert);
}

function evaluate(options) {
  const harness = evaluateServer(options);
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.close();
  for (const value of directories.splice(0)) fs.rmSync(value, { recursive: true, force: true });
});

describe("MITM async certificate startup and SNI", () => {
  it("waits for root issuance before reading its files or creating/listening on a server", async () => {
    const value = directory();
    const pending = deferred();
    const harness = evaluate({
      directory: value,
      async generateCert() { await pending.promise; persistRoot(value); },
      async getCertForDomain() { return certificate; },
    });
    try {
      await setImmediate();
      expect(harness.reads).toEqual([]);
      expect(harness.server).toBeUndefined();
      expect(harness.exits).toEqual([]);
    } finally {
      pending.resolve();
      await harness.ready.catch(() => {});
    }
    expect(harness.server.listening).toBe(true);
    expect(harness.reads.map((filename) => path.basename(filename))).toEqual(["rootCA.key", "rootCA.crt"]);
  });

  it("fails closed without reading keys or listening when asynchronous root issuance rejects", async () => {
    const pending = deferred();
    const harness = evaluate({
      directory: directory(),
      generateCert() { return pending.promise; },
      async getCertForDomain() { return certificate; },
    });
    pending.reject(new Error("Synthetic root issuance failed"));
    await expect(harness.ready).rejects.toThrow("MITM exited 1");
    await setImmediate();
    expect(harness.server).toBeUndefined();
    expect(harness.reads).toEqual([]);
    expect(harness.exits).toEqual([1]);
    expect(harness.logs.join("\n")).toContain("Synthetic root issuance failed");
  });

  it("shares pending same-host issuance and returns one identical native SecureContext to each SNI callback", async () => {
    const value = directory();
    persistRoot(value);
    const pending = deferred();
    const issued = [];
    const harness = evaluate({
      directory: value,
      async generateCert() { throw new Error("Unexpected root rotation"); },
      getCertForDomain(host) { issued.push(host); return pending.promise; },
    });
    await harness.ready;
    const first = harness.sni("intercept.test");
    const second = harness.sni("intercept.test");
    try {
      await setImmediate();
      expect(harness.callbacks.map(({ count }) => count)).toEqual([0, 0]);
      expect(issued).toEqual(["intercept.test"]);
    } finally {
      pending.resolve(certificate);
    }
    const [left, right] = await Promise.all([first, second]);
    expect(left.error).toBeNull();
    expect(right.error).toBeNull();
    expect(left.context).toBe(right.context);
    expect(left.context.context).toBeDefined();
    expect((await harness.sni("intercept.test")).context).toBe(left.context);
    await setImmediate();
    expect(issued).toEqual(["intercept.test"]);
    expect(harness.callbacks.map(({ count }) => count)).toEqual([1, 1, 1]);
  });

  it("delivers rejected issuance once per callback and removes the failed in-flight cache entry", async () => {
    const value = directory();
    persistRoot(value);
    const pending = deferred();
    const issued = [];
    const harness = evaluate({
      directory: value,
      async generateCert() { throw new Error("Unexpected root rotation"); },
      getCertForDomain(host) {
        issued.push(host);
        return issued.length === 1 ? pending.promise : Promise.resolve(certificate);
      },
    });
    await harness.ready;
    const first = harness.sni("intercept.test");
    const second = harness.sni("intercept.test");
    pending.reject(new Error("Synthetic leaf issuance failed"));
    const failures = await Promise.all([first, second]);
    for (const result of failures) {
      expect(result.error.message).toContain("Synthetic leaf issuance failed");
      expect(result.context).toBeUndefined();
    }
    expect(harness.callbacks.map(({ count }) => count)).toEqual([1, 1]);
    const retry = await harness.sni("intercept.test");
    expect(retry.error).toBeNull();
    expect(retry.context.context).toBeDefined();
    await setImmediate();
    expect(issued).toEqual(["intercept.test", "intercept.test"]);
    expect(harness.callbacks.map(({ count }) => count)).toEqual([1, 1, 1]);
  });
});
