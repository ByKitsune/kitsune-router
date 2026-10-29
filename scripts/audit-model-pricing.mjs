#!/usr/bin/env node
// Inventory every configured registry row, including unknown/subscription/media
// cases. A missing dollar estimate is reported with its cause, never changed to0.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import registry from "../open-sse/providers/registry/index.js";
import { getPricingForModel } from "../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../open-sse/providers/metadata/reviewed.js";
import { getModelsDevPricingStatus } from "../open-sse/providers/metadata/modelsDevPricing.js";
import current from "../open-sse/providers/metadata/modelsDevPricingCurrent.js";
import { parsePricingTimestamp, getTimeOfUsePricing } from "../open-sse/config/timeOfUsePricing.js";
import { getDeclaredUpstreamModelId } from "../open-sse/providers/identity.js";

const args = process.argv.slice(2);
const values = Object.create(null);
for (let index = 0; index < args.length; index += 2) {
  if (!["--snapshot", "--timestamp", "--json"].includes(args[index]) || !args[index + 1]) throw new Error("Usage: audit-model-pricing.mjs --snapshot SNAPSHOT.json [--timestamp ISO_INSTANT] [--json REPORT.json]");
  values[args[index]] = args[index + 1];
}
if (!values["--snapshot"]) throw new Error("Pass --snapshot with the complete current source payload");
const bytes = readFileSync(values["--snapshot"]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== current.source.sha256) throw new Error("Audit snapshot differs from the imported current observation");
const catalog = JSON.parse(bytes);
const timestamp = values["--timestamp"] || current.source.verifiedAtUtc;
if (!parsePricingTimestamp(timestamp)) throw new Error("Pass an explicit valid timestamp with timezone");
const fields = ["input", "output", "cached", "reasoning", "cache_creation", "cache_creation_1h", "cache_write_30m", "cache_write_12h"];
const rows = [];
for (const provider of registry) for (const model of provider.models || []) {
  const price = getPricingForModel(provider.id, model.id, { timestamp });
  const reviewed = getReviewedModelMetadata(provider.id, model.id);
  const scheduled = getTimeOfUsePricing(provider.id, getDeclaredUpstreamModelId(provider.id, model.id), timestamp);
  const catalogStatus = getModelsDevPricingStatus(provider.id, model.id, { timestamp });
  const knownFields = fields.filter(field => Number.isFinite(price?.[field]));
  const complete = Number.isFinite(price?.input) && Number.isFinite(price?.output);
  const status = complete ? "known-token-reference" : knownFields.length ? "partial-token-reference" : "unknown-token-reference";
  const kind = reviewed?.billing?.kind || null;
  let reason = price?.provenance?.kind === "models-dev-catalog-estimate" ? "dated-exact-product-catalog-estimate"
    : knownFields.length ? "provider-or-reviewed-reference"
      : /subscription|credits|plan|point/.test(kind || "") ? "subscription-or-credit-product"
        : /enterprise|quote|vault/.test(kind || "") ? "quote-required"
          : reviewed && !["llm", "imageToText"].includes(model.kind || "llm") ? "non-chat-billing-unit"
            : reviewed ? "reviewed-unknown-or-conditional" : catalogStatus.status === "expired" ? "catalog-observation-expired"
              : catalogStatus.reference ? "catalog-reference-not-token-eligible" : "no-exact-product-reference";
  const sourceModel = catalogStatus.reference && catalog[catalogStatus.reference.product]?.models?.[model.id];
  const differences = [];
  if (sourceModel?.cost) for (const [field, key] of [["input", "input"], ["output", "output"], ["cached", "cache_read"]]) {
    if (Number.isFinite(sourceModel.cost[key]) && Number.isFinite(price?.[field]) && price[field] !== sourceModel.cost[key]) {
      const delta = Math.abs(sourceModel.cost[key] - price[field]);
      const noise = Number.EPSILON * Math.max(1, Math.abs(sourceModel.cost[key]), Math.abs(price[field])) * 8;
      const status = delta <= noise ? "numeric-representation-only"
        : scheduled ? "time-of-use-schedule"
          : reviewed?.billing?.kind === "neuron-derived-token-quote" ? "native-unit-conversion"
            : reviewed ? "unverified-current-source-conflict" : "review-provider-quote";
      differences.push({ field, reference: sourceModel.cost[key], effective: price[field], status });
    }
  }
  rows.push({ provider: provider.id, model: model.id, kind: model.kind || "llm", status, reason,
    billingKind: kind, billingUnit: reviewed?.billing?.unit || null,
    billingReviewedAt: reviewed?.billing?.reviewedAt || null,
    reviewedSources: reviewed?.sources || [],
    knownFields, unknownFields: fields.filter(field => !knownFields.includes(field)),
    catalogStatus: catalogStatus.status, catalogProduct: catalogStatus.reference?.product || null,
    ...(catalogStatus.reference ? { catalogCost: catalogStatus.reference.cost } : {}),
    ...(price ? { effectivePrice: price } : {}), ...(differences.length ? { differences } : {}),
  });
}
const counts = (key) => Object.fromEntries([...new Set(rows.map(row => row[key]))].map(value => [value, rows.filter(row => row[key] === value).length]));
const report = { source: current.source, auditedAt: timestamp,
  scope: "Every active registry row; dynamic provider catalogs remain separately discoverable. Duplicate model IDs in different capability rows are counted as rows.",
  limitations: "No provider call, plan entitlement, invoice or FX validation. Catalog token estimates remain separate from operator overrides and non-token/subscription billing. Differences against reviewed primary/route quotes are not automatically errors.",
  summary: { rows: rows.length, uniquePairs: new Set(rows.map(row => JSON.stringify([row.provider, row.model]))).size,
    referenceRows: rows.filter(row => row.catalogProduct).length, statuses: counts("status"), reasons: counts("reason"), catalogStatuses: counts("catalogStatus"),
    differingRows: rows.filter(row => row.differences?.length).length }, rows };
if (values["--json"]) writeFileSync(values["--json"], `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
