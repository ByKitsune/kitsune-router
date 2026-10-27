import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const GHCR_IMAGE = "ghcr.io/bykitsune/kitsune-router";
const repository = "bykitsune/kitsune-router";
const mediaTypes = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
];
const exact = (value, pattern) => typeof value === "string" && pattern.exec(value)?.[0] === value;

async function jsonBody(response) {
  assert(/(?:^|[+/])json(?:;|$)/i.test(response.headers.get("content-type") || ""), "Registry response is not JSON");
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert(size <= 2 * 1024 * 1024, "Registry response exceeds the size bound");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("Registry response is malformed JSON"); }
  assert(value && typeof value === "object" && !Array.isArray(value), "Invalid registry response");
  return { value, bytes };
}

// A successful authenticated registry grant followed by a structured
// MANIFEST_UNKNOWN is evidence of absence. Bare 404s, NAME_UNKNOWN, denied
// grants, malformed bodies and CLI error strings are not that evidence.
export async function inspectGhcrManifest(reference, { env = process.env, fetch: request = globalThis.fetch } = {}) {
  assert(exact(reference, /^(?:latest|(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)|sha256:[a-f0-9]{64})$/), "Invalid registry reference");
  const username = env.GHCR_USERNAME;
  const token = env.GHCR_TOKEN;
  assert(exact(username, /^[A-Za-z0-9-]+$/) && typeof token === "string" && token.length > 0 && !/[\r\n]/.test(token), "Authenticated GHCR credentials required");
  const options = () => ({ redirect: "error", signal: AbortSignal.timeout(20000) });
  const grantResponse = await request(`https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`, {
    ...options(), headers: { Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`, Accept: "application/json" },
  });
  assert.equal(grantResponse.status, 200, "GHCR authentication grant was not accepted");
  const { value: grant } = await jsonBody(grantResponse);
  assert(typeof grant.token === "string" && grant.token.length > 0 && !/[\r\n]/.test(grant.token), "Missing GHCR registry grant");
  const response = await request(`https://ghcr.io/v2/${repository}/manifests/${reference}`, {
    ...options(), headers: { Authorization: `Bearer ${grant.token}`, Accept: mediaTypes.join(", "), "Cache-Control": "no-cache" },
  });
  const { value, bytes } = await jsonBody(response);
  if (response.status === 404) {
    assert(Array.isArray(value.errors) && value.errors.length > 0 && value.errors.every(error => error?.code === "MANIFEST_UNKNOWN"), "Registry 404 did not confirm an absent manifest");
    return { image: GHCR_IMAGE, reference, absent: true, status: 404, codes: ["MANIFEST_UNKNOWN"] };
  }
  assert.equal(response.status, 200, "GHCR manifest read was not accepted");
  assert.equal(value.schemaVersion, 2, "Invalid registry manifest schema");
  assert(mediaTypes.includes(value.mediaType), "Unsupported registry manifest type");
  assert(!Object.hasOwn(value, "errors"), "Unexpected registry manifest errors");
  const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  assert.equal(response.headers.get("docker-content-digest"), digest, "Registry manifest digest mismatch");
  if (reference.startsWith("sha256:")) assert.equal(reference, digest, "Registry immutable reference mismatch");
  if (mediaTypes.slice(0, 2).includes(value.mediaType)) {
    assert(Array.isArray(value.manifests) && value.manifests.length > 0, "Empty registry manifest index");
    for (const manifest of value.manifests) assert(exact(manifest.digest, /^sha256:[a-f0-9]{64}$/), "Invalid platform manifest digest");
  } else {
    assert(exact(value.config?.digest, /^sha256:[a-f0-9]{64}$/) && Array.isArray(value.layers), "Invalid image manifest");
  }
  return { image: GHCR_IMAGE, reference, absent: false, digest, manifest: value };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await inspectGhcrManifest(process.argv[2]))); }
  catch (error) {
    // Do not print a fetch Request, headers, response body or credential-bearing cause.
    console.error(error instanceof assert.AssertionError ? error.message : "Authenticated GHCR manifest read failed");
    process.exitCode = 1;
  }
}
