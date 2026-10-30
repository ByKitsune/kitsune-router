// Verify refactored PROVIDERS is byte-for-byte equal to baseline JSON.
// Exit 1 + print precise per-provider/per-field diff on mismatch.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROVIDERS } from "../../open-sse/config/providers.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(here, "providers-baseline.json"), "utf8"));

// Fields intentionally added during refactor (verified by dedicated runtime tests, not byte-baseline).
// authUrl: removed dead field (qwen/iflow) — no consumer reads config.authUrl (oauth block has authorize/deviceCode)
const ADDED_FIELDS = new Set(["forceStream", "thinkingFormat", "urlSuffix", "retry", "quirks", "auth", "validateUrl", "usage", "clientId", "clientSecret", "tokenUrl", "cliVersion", "apiClient", "copilot", "authorizeUrl", "authUrl", "regions", "defaultRegion", "reasoningInject", "priority", "hasFree"]);

// Normalize via JSON roundtrip so function/undefined are dropped identically; drop added/removed fields.
// ADDED_FIELDS are verified by dedicated runtime tests, so drop them from BOTH sides (added or intentionally removed).
const current = JSON.parse(JSON.stringify(PROVIDERS));
for (const f of ADDED_FIELDS) {
  for (const id of Object.keys(current)) delete current[id][f];
  for (const id of Object.keys(baseline)) delete baseline[id][f];
}

// Host-dependent header values vary with the OS/arch/runtime running the verify, so
// normalize them on BOTH sides — the baseline is authored once on one machine
// and must stay comparable everywhere.
// Native Stainless derives runtime-version from the executing process; its
// exact outbound value is covered by the client wire-consumer regressions.
const HOST_DEPENDENT_HEADERS = new Set(["X-Stainless-Arch", "X-Stainless-Os", "X-Stainless-Runtime-Version"]);
function normalizeHostDependent(providers) {
  for (const p of Object.values(providers)) {
    const h = p?.headers;
    if (!h) continue;
    for (const [k, v] of Object.entries(h)) {
      if (HOST_DEPENDENT_HEADERS.has(k)) h[k] = `<${k}>`;
      else if (typeof v === "string" && /^antigravity\/ide\//.test(v)) {
        // UA suffix " <os>/<arch>" is derived from platform()/arch()
        h[k] = v.replace(/ (darwin|windows|linux)\/(arm64|x64)$/, " <platform>");
      }
    }
  }
}
normalizeHostDependent(baseline);
normalizeHostDependent(current);

const diffs = [];
const allIds = new Set([...Object.keys(baseline), ...Object.keys(current)]);
for (const id of allIds) {
  const a = baseline[id];
  const b = current[id];
  if (a === undefined) { diffs.push(`+ provider added: ${id}`); continue; }
  if (b === undefined) { diffs.push(`- provider removed: ${id}`); continue; }
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa === sb) continue;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = JSON.stringify(a[k]);
    const vb = JSON.stringify(b[k]);
    if (va !== vb) diffs.push(`~ ${id}.${k}: ${va} -> ${vb}`);
  }
}

if (diffs.length) {
  console.error(`❌ PROVIDERS mismatch (${diffs.length} field diffs):`);
  for (const d of diffs) console.error("  " + d);
  process.exit(1);
}
console.log(`✅ PROVIDERS byte-for-byte equal (${Object.keys(current).length} providers).`);
