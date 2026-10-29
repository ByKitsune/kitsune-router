#!/usr/bin/env node
// Offline import of an independently retrieved complete models.dev v1 payload.
// Usage: node scripts/import-modelsdev-pricing.mjs SNAPSHOT.json SOURCE.json [--check]
// SOURCE records the actual capture/reconstruction time, not a refreshed date
// pasted onto old bytes. This command does not fetch, touch state, or bill calls.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPricingObservation } from "../open-sse/providers/metadata/modelsDevPricingObservation.js";

const args = process.argv.slice(2);
if (args.length < 2 || args.length > 3 || (args[2] && args[2] !== "--check")) {
  throw new Error("Usage: import-modelsdev-pricing.mjs SNAPSHOT.json SOURCE.json [--check]");
}
const bytes = readFileSync(args[0]);
const evidence = JSON.parse(readFileSync(args[1], "utf8"));
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== evidence.sha256) throw new Error("Full models.dev snapshot SHA-256 differs from supplied source evidence");
if (evidence.sourceUrl !== "https://models.dev/api.json" || !evidence.retrieval) throw new Error("Source URL and retrieval method are required");
if (evidence.commit && !/^[a-f\d]{40}$/.test(evidence.commit)) throw new Error("Invalid source repository commit");
const source = {
  url: evidence.sourceUrl, snapshotDate: evidence.retrievedAtUtc?.slice(0, 10),
  verifiedAtUtc: evidence.retrievedAtUtc, sha256, retrieval: evidence.retrieval,
  ...(evidence.commit ? { repositoryCommit: evidence.commit, repositoryUrl: evidence.repository } : {}),
};
const observation = createPricingObservation(JSON.parse(bytes), source);
const output = `// Generated from a complete, hash-verified models.dev v1 observation.\n// Run scripts/import-modelsdev-pricing.mjs with the recorded source evidence.\n// No entitlement, currency conversion, modality billing, or invoice is inferred.\nexport default ${JSON.stringify(observation, null, 2)};\n`;
const destination = fileURLToPath(new URL("../open-sse/providers/metadata/modelsDevPricingCurrent.js", import.meta.url));
if (args[2] === "--check") {
  if (readFileSync(destination, "utf8") !== output) throw new Error("Generated pricing observation differs from the supplied complete snapshot");
} else writeFileSync(destination, output);
console.log(JSON.stringify({ mode: args[2] === "--check" ? "check" : "import", source,
  products: Object.keys(observation.products).length,
  references: Object.values(observation.references).reduce((count, rows) => count + Object.keys(rows).length, 0),
  eligible: Object.values(observation.estimates).flat().length,
}));
