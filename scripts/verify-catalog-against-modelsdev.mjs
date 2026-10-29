// Compare registered routes against their literal models.dev product/model facts.
// Primary endpoint evidence and explicit route ceilings are reported as overrides,
// not silently equated with vendor APIs. Token ceilings are exact integer counts.
// Usage: node scripts/verify-catalog-against-modelsdev.mjs snapshot.json [--all] [--json report.json]
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import REGISTRY from "../open-sse/providers/registry/index.js";
import { getCapabilitiesForModel } from "../open-sse/providers/capabilities.js";
import { getModelsDevProviderId } from "../open-sse/providers/catalogProviders.js";
import { getReviewedModelMetadata } from "../open-sse/providers/metadata/reviewed.js";
import { hasPrimaryCapabilityAuthority } from "../open-sse/providers/metadata/modelsDevCapabilityResolution.js";
import { inferModelKind } from "../open-sse/providers/models/schema.js";

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith("--")) {
  console.error("Usage: node scripts/verify-catalog-against-modelsdev.mjs snapshot.json [--all] [--json report.json]");
  process.exit(2);
}
const snapshot = readFileSync(args[0]);
const catalog = JSON.parse(snapshot);
const limitFields = { contextWindow: "context", maxInput: "input", maxOutput: "output" };
const inputFields = { vision: "image", pdf: "pdf", audioInput: "audio", videoInput: "video" };
const outputFields = { imageOutput: "image", audioOutput: "audio" };
const featureFields = { reasoning: "reasoning", tools: "tool_call", structuredOutput: "structured_output", temperature: "temperature" };
const summary = { rows: 0, exactMatchedRows: 0, unmatchedRows: 0, nonChatRows: 0, agreeingFields: 0, primaryOverrides: 0, primaryConflicts: 0, routeOverrides: 0, unknownFields: 0, actionableFields: 0 };
const rows = [];

for (const provider of REGISTRY) {
  for (const model of provider.models || []) {
    const kind = inferModelKind(model) || "llm";
    const sourceProvider = getModelsDevProviderId(provider.id);
    const sourceModel = model.upstreamModelId || model.id;
    const reference = sourceProvider && catalog[sourceProvider]?.models?.[sourceModel];
    const row = { provider: provider.id, model: model.id, kind, sourceProvider, sourceModel, fields: [] };
    summary.rows++;
    if (kind !== "llm" && kind !== "imageToText") {
      summary.nonChatRows++;
      row.status = "non-chat-unit";
      rows.push(row);
      continue;
    }
    const caps = getCapabilitiesForModel(provider.id, model.id);
    row.resolvedCapabilities = Object.fromEntries([
      ...Object.keys(limitFields), ...Object.keys(inputFields), ...Object.keys(outputFields), ...Object.keys(featureFields),
    ].map(field => [field, caps[field] ?? null]));
    if (model.capabilities) row.registryCapabilities = model.capabilities;
    if (Number.isFinite(model.contextLength)) row.registryContextLength = model.contextLength;
    if (Number.isFinite(model.maxOutputTokens)) row.registryMaxOutputTokens = model.maxOutputTokens;
    if (!reference) {
      summary.unmatchedRows++;
      row.status = sourceProvider ? "no-literal-reference" : "no-equivalent-product";
      rows.push(row);
      continue;
    }
    summary.exactMatchedRows++;
    const reviewed = getReviewedModelMetadata(provider.id, model.id);
    const primarySources = (reviewed?.sources || []).filter(url => !/^https:\/\/models\.dev(?:\/|$)/.test(url));
    const compare = (field, expected) => {
      const actual = caps[field];
      if (actual === expected) {
        summary.agreeingFields++;
        return;
      }
      let status;
      if (actual == null) {
        status = "unknown-not-advertised";
        summary.unknownFields++;
      } else if (hasPrimaryCapabilityAuthority(reviewed, field) && reviewed.capabilities[field] === actual) {
        const fieldSource = reviewed.limits?.fieldSources?.[field];
        status = fieldSource ? "primary-source-override" : "primary-reference-conflict";
        if (fieldSource) summary.primaryOverrides++;
        else summary.primaryConflicts++;
      } else if (field === "contextWindow" && model.contextLength === actual) {
        status = "explicit-route-ceiling";
        summary.routeOverrides++;
      } else {
        status = "actionable";
        summary.actionableFields++;
      }
      row.fields.push({ field, actual: actual ?? null, reference: expected, status,
        ...(["primary-source-override", "primary-reference-conflict"].includes(status) ? { sources: primarySources } : {}),
        ...(status === "primary-reference-conflict" ? { note: "Existing primary-reference claim conflicts with this catalog; source URLs alone are not independent field verification in this run." } : {}),
      });
    };
    for (const [field, native] of Object.entries(limitFields)) {
      const expected = reference.limit?.[native];
      if (Number.isSafeInteger(expected) && expected > 0) compare(field, expected);
    }
    if (Array.isArray(reference.modalities?.input)) {
      for (const [field, modality] of Object.entries(inputFields)) compare(field, reference.modalities.input.includes(modality));
    }
    if (Array.isArray(reference.modalities?.output)) {
      for (const [field, modality] of Object.entries(outputFields)) compare(field, reference.modalities.output.includes(modality));
    }
    for (const [field, native] of Object.entries(featureFields)) {
      if (typeof reference[native] === "boolean") compare(field, reference[native]);
    }
    row.status = row.fields.some(field => field.status === "actionable") ? "actionable" : row.fields.length ? "qualified" : "agree";
    rows.push(row);
  }
}

const report = {
  source: "https://models.dev/api.json", snapshot: basename(args[0]),
  snapshotSha256: createHash("sha256").update(snapshot).digest("hex"), generatedAt: new Date().toISOString(),
  scope: "Every active registry model row, preserving provider, kind and literal/declared upstream identity. Static resolver facts are included for every chat-capable row, including unmatched rows, with registry declarations retained separately. Token limits, input/output modalities and documented feature booleans are compared only for chat-capable rows; other service units and auxiliary voice assignments are not fabricated token comparisons. Live and operator overrides are outside this static source audit.",
  limitations: "No account, entitlement or inference verification. Missing references, primary/route overrides and primary-reference conflicts are explicit non-passes, not fabricated agreement. PrimaryOverrides have a previously pinned field-specific source, not a new live validation; primaryConflicts retain older primary-reference claims without a field-specific binding. Context, input and output are independent; no rounding tolerance or widest-vendor leaf fallback.",
  summary, rows,
};
const jsonAt = args.indexOf("--json");
if (jsonAt !== -1) {
  if (!args[jsonAt + 1]) throw new Error("--json requires an output path");
  writeFileSync(args[jsonAt + 1], `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(summary, null, 2));
for (const row of rows) {
  for (const field of row.fields) {
    if (field.status === "actionable" || args.includes("--all")) console.log(`${field.status}: ${row.provider}/${row.model} [${row.kind}] ${field.field}=${field.actual} vs ${row.sourceProvider}/${row.sourceModel}=${field.reference}`);
  }
}
process.exitCode = summary.actionableFields ? 1 : 0;
