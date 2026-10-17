// Compare registered routes against their literal models.dev product/model facts.
// Primary endpoint evidence and explicit route ceilings are reported as overrides,
// not silently equated with vendor APIs. Token ceilings are exact integer counts.
// Usage: node scripts/verify-catalog-against-modelsdev.mjs snapshot.json [--all] [--json report.json]
import { readFileSync, writeFileSync } from "node:fs";
import REGISTRY from "../open-sse/providers/registry/index.js";
import { getCapabilitiesForModel } from "../open-sse/providers/capabilities.js";
import { getModelsDevProviderId } from "../open-sse/providers/catalogProviders.js";
import { getReviewedModelMetadata } from "../open-sse/providers/metadata/reviewed.js";
import { inferModelKind } from "../open-sse/providers/models/schema.js";

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith("--")) {
  console.error("Usage: node scripts/verify-catalog-against-modelsdev.mjs snapshot.json [--all] [--json report.json]");
  process.exit(2);
}
const catalog = JSON.parse(readFileSync(args[0], "utf8"));
const limitFields = { contextWindow: "context", maxInput: "input", maxOutput: "output" };
const inputFields = { vision: "image", pdf: "pdf", audioInput: "audio", videoInput: "video" };
const featureFields = { reasoning: "reasoning", tools: "tool_call", structuredOutput: "structured_output" };
const summary = { rows: 0, exactMatchedRows: 0, unmatchedRows: 0, nonChatRows: 0, agreeingFields: 0, primaryOverrides: 0, routeOverrides: 0, unknownFields: 0, actionableFields: 0 };
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
    if (!reference) {
      summary.unmatchedRows++;
      row.status = sourceProvider ? "no-literal-reference" : "no-equivalent-product";
      rows.push(row);
      continue;
    }
    summary.exactMatchedRows++;
    const caps = getCapabilitiesForModel(provider.id, model.id);
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
      } else if (primarySources.length && Object.hasOwn(reviewed?.capabilities || {}, field) && reviewed.capabilities[field] === actual) {
        status = "primary-source-override";
        summary.primaryOverrides++;
      } else if (field === "contextWindow" && model.contextLength === actual) {
        status = "explicit-route-ceiling";
        summary.routeOverrides++;
      } else {
        status = "actionable";
        summary.actionableFields++;
      }
      row.fields.push({ field, actual: actual ?? null, reference: expected, status, ...(status === "primary-source-override" ? { sources: primarySources } : {}) });
    };
    for (const [field, native] of Object.entries(limitFields)) {
      const expected = reference.limit?.[native];
      if (Number.isSafeInteger(expected) && expected > 0) compare(field, expected);
    }
    if (Array.isArray(reference.modalities?.input)) {
      for (const [field, modality] of Object.entries(inputFields)) compare(field, reference.modalities.input.includes(modality));
    }
    for (const [field, native] of Object.entries(featureFields)) {
      if (typeof reference[native] === "boolean") compare(field, reference[native]);
    }
    row.status = row.fields.some(field => field.status === "actionable") ? "actionable" : row.fields.length ? "qualified" : "agree";
    rows.push(row);
  }
}

const report = {
  source: "https://models.dev/api.json", snapshot: args[0], generatedAt: new Date().toISOString(),
  scope: "Every active registry model row, preserving provider, kind and literal/declared upstream identity. Auxiliary voice assignments are covered by the lifecycle inventory, not chat token comparisons.",
  limitations: "No account, entitlement or inference verification. Missing references and primary/route overrides are explicit non-passes, not fabricated agreement. Context, input and output are independent; no rounding tolerance or widest-vendor leaf fallback.",
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
