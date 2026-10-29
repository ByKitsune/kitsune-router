// Rebuild exact-product capability references from an pinned source
// snapshot. This does not fetch data, change runtime availability or prices.
// Usage: node scripts/generate-modelsdev-capabilities.mjs snapshot.json source.json [--check]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import REGISTRY from "../open-sse/providers/registry/index.js";
import { getModelsDevProviderId } from "../open-sse/providers/catalogProviders.js";
import { inferModelKind } from "../open-sse/providers/models/schema.js";

const [snapshotPath, sourcePath, mode] = process.argv.slice(2);
if (!snapshotPath || !sourcePath || (mode && mode !== "--check")) {
  console.error("Usage: node scripts/generate-modelsdev-capabilities.mjs snapshot.json source.json [--check]");
  process.exit(2);
}
const raw = readFileSync(snapshotPath);
const catalog = JSON.parse(raw);
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const hash = createHash("sha256").update(raw).digest("hex");
if (source.sha256 !== hash) throw new Error("Snapshot hash does not match the source manifest");
if (!/^[a-f0-9]{40}$/.test(source.commit) || !Number.isFinite(Date.parse(source.retrievedAtUtc))) {
  throw new Error("Source manifest requires an exact commit and retrieval time");
}
const rows = [];
const seen = new Map();
for (const provider of REGISTRY) {
  const product = getModelsDevProviderId(provider.id);
  for (const model of provider.models || []) {
    if (!["llm", "imageToText"].includes(inferModelKind(model) || "llm")) continue;
    const sourceModel = model.upstreamModelId || model.id;
    const reference = product && catalog[product]?.models?.[sourceModel];
    if (!reference) continue;
    const caps = {};
    for (const [field, key] of Object.entries({ contextWindow: "context", maxInput: "input", maxOutput: "output" })) {
      const limit = reference.limit?.[key];
      if (Number.isSafeInteger(limit) && limit > 0) caps[field] = limit;
    }
    for (const [direction, fields] of Object.entries({
      input: { vision: "image", pdf: "pdf", audioInput: "audio", videoInput: "video" },
      output: { imageOutput: "image", audioOutput: "audio" },
    })) {
      if (!Array.isArray(reference.modalities?.[direction])) continue;
      for (const [field, modality] of Object.entries(fields)) caps[field] = reference.modalities[direction].includes(modality);
    }
    for (const [field, key] of Object.entries({ reasoning: "reasoning", tools: "tool_call", structuredOutput: "structured_output", temperature: "temperature" })) {
      if (typeof reference[key] === "boolean") caps[field] = reference[key];
    }
    const identity = `${provider.id}\0${model.id}`;
    const row = [provider.id, model.id, product, sourceModel, caps];
    if (seen.has(identity) && JSON.stringify(seen.get(identity)) !== JSON.stringify(row)) {
      throw new Error(`Ambiguous capability reference: ${provider.id}/${model.id}`);
    }
    if (!seen.has(identity)) rows.push(row);
    seen.set(identity, row);
  }
}
if (!rows.length) throw new Error("Snapshot has no exact registered capability references");
rows.sort((a, b) => `${a[0]}/${a[1]}`.localeCompare(`${b[0]}/${b[1]}`, "en"));
const provenance = {
  sourceUrl: source.sourceUrl,
  repository: source.repository,
  commit: source.commit,
  retrievedAtUtc: source.retrievedAtUtc,
  sha256: hash,
  retrieval: source.retrieval,
};
const output = `// Generated exact-product model capabilities. Do not use these as account\n// entitlement or transport acceptance. Rebuild with generate-modelsdev-capabilities.mjs.\nexport const MODELS_DEV_CAPABILITY_SOURCE = Object.freeze(${JSON.stringify(provenance, null, 2)});\n\nexport const MODELS_DEV_CAPABILITY_REFERENCES = [\n${rows.map(row => `  ${JSON.stringify(row)}`).join(",\n")}\n];\n`;
const outputPath = fileURLToPath(new URL("../open-sse/providers/metadata/modelsDevCapabilities.js", import.meta.url));
if (mode === "--check") {
  if (readFileSync(outputPath, "utf8") !== output) throw new Error("Capability references differ from the pinned snapshot; regenerate them");
} else writeFileSync(outputPath, output);
console.log(`Verified ${rows.length} exact product/model capability references (${hash})`);
