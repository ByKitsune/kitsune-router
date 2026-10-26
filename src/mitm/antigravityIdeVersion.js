"use strict";

// Rewrite Antigravity IDE markers so upstream AG 2.x backend accepts the request.
// Default: do NOT override — trust the client UA/body. Forcing a stale version
// (1.x on a 2.x client) silently breaks production IDE users because the
// upstream Cloud Code Assist gateway fingerprints both the User-Agent and
// body.metadata.ideVersion and rejects mismatched fingerprints.
//
// To opt into a forced version for compatibility tests, set
//   MITM_ANTIGRAVITY_VERSION_OVERRIDE=true
// The version used in that case is single-sourced from
// open-sse/config/clientVersions.js (ANTIGRAVITY_IDE_VERSION).

// Node >=22.19 supports synchronously requiring this no-top-level-await ESM
// constants module. Keep this raw MITM entry CommonJS for standalone require().
const { ANTIGRAVITY_IDE_VERSION } = require("../../open-sse/config/clientVersions.js");

const ANTIGRAVITY_MITM_VERSION_OVERRIDE_ENABLED =
  process.env.MITM_ANTIGRAVITY_VERSION_OVERRIDE === "true";

function shouldRewriteMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  if (String(metadata.ideName || "").toLowerCase() === "antigravity") return true;
  if (String(metadata.ideType || "").toUpperCase() === "ANTIGRAVITY") return true;
  return Object.prototype.hasOwnProperty.call(metadata, "ideVersion");
}

function rewriteAntigravityUserAgent(userAgent, version) {
  if (typeof userAgent !== "string" || !userAgent.includes("antigravity/")) return userAgent;
  return userAgent.replace(/antigravity\/[^\s]+/, `antigravity/${version}`);
}

function applyAntigravityIdeVersionOverride(bodyBuffer, headers) {
  if (!ANTIGRAVITY_MITM_VERSION_OVERRIDE_ENABLED) {
    return { bodyBuffer, headers, applied: false, version: ANTIGRAVITY_IDE_VERSION };
  }

  const version = ANTIGRAVITY_IDE_VERSION;
  const nextHeaders = { ...headers };
  const nextUserAgent = rewriteAntigravityUserAgent(nextHeaders["user-agent"], version);
  const userAgentChanged = nextUserAgent !== nextHeaders["user-agent"];
  if (userAgentChanged) nextHeaders["user-agent"] = nextUserAgent;

  try {
    const parsed = JSON.parse(bodyBuffer.toString());
    if (!shouldRewriteMetadata(parsed?.metadata)) {
      return { bodyBuffer, headers: nextHeaders, applied: userAgentChanged, version };
    }

    parsed.metadata.ideVersion = version;
    const nextBodyBuffer = Buffer.from(JSON.stringify(parsed));
    return { bodyBuffer: nextBodyBuffer, headers: nextHeaders, applied: true, version };
  } catch {
    return { bodyBuffer, headers: nextHeaders, applied: userAgentChanged, version };
  }
}

module.exports = {
  ANTIGRAVITY_IDE_VERSION,
  ANTIGRAVITY_MITM_VERSION_OVERRIDE_ENABLED,
  applyAntigravityIdeVersionOverride,
  rewriteAntigravityUserAgent,
};
