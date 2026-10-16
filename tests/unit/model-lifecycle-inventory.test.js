import { describe, expect, it } from "vitest";
import {
  buildLifecycleInventory,
  DISPOSITIONS,
  DEFAULT_PROVIDER_MAP,
} from "../../scripts/audit-model-lifecycle.mjs";

const mapped = (id) => ({ id, scope: "fixture-exact-route", evidenceUrls: ["https://example.test/catalog"] });
const fixture = (overrides = {}) => buildLifecycleInventory({
  registry: [{ id: "vendor", alias: "v", models: [] }],
  providerModels: { v: [] },
  providerMap: { vendor: mapped("vendor") },
  officialEvidence: [],
  ...overrides,
});
const everyRow = (report) => [
  ...report.rows,
  ...report.auxiliaryTables.flatMap((table) => table.rows),
  ...report.metadataReferences,
];

describe("whole-catalog lifecycle inventory", () => {
  it("includes active providers with no model rows", () => {
    const report = fixture();
    expect(report.providers).toHaveLength(1);
    expect(report.providers[0]).toMatchObject({ id: "vendor", modelRows: 0 });
    expect(report.summary).toMatchObject({ activeProviders: 1, activeRows: 0, zeroRowProviders: 1, totalRows: 0 });
  });

  it("uses the same modelKind classifier on baseline and final, preserving kinds and literal namespaces", () => {
    const before = {
      registry: [{ id: "vendor", alias: "v", models: [] }],
      providerModels: { v: [{ id: "org/shared", type: "llm" }, { id: "org/shared", kind: "stt" }, { id: "gpt-image-2" }] },
    };
    const report = fixture({ ...before, baseline: before });
    expect(report.rows.map((row) => row.identity)).toEqual([
      { provider: "vendor", kind: "llm", id: "org/shared" },
      { provider: "vendor", kind: "stt", id: "org/shared" },
      { provider: "vendor", kind: "image", id: "gpt-image-2" },
    ]);
    expect(report.comparison).toMatchObject({ added: [], removed: [], changed: [], unchangedRows: 3 });
  });

  it("does not turn provider RISK_NOTICE or provider deprecation into model retirement", () => {
    const report = fixture({
      registry: [{ id: "vendor", alias: "v", display: { deprecated: true, deprecationNotice: "RISK_NOTICE" } }],
      providerModels: { v: [{ id: "live" }] },
    });
    expect(report.providers[0].warning).toMatchObject({ type: "risk-notice", deprecated: true });
    expect(report.rows[0]).toMatchObject({ disposition: "unverified", sourceFlags: { deprecated: false }, shutdownConfirmed: false });
  });

  it("separates compatibility-alias deprecation from shutdown", () => {
    const report = fixture({ providerModels: { v: [{ id: "old", upstreamModelId: "current", deprecated: true, deprecationNotice: "Compatibility alias served by current." }] } });
    expect(report.rows[0]).toMatchObject({
      disposition: "source-flagged-deprecated", lifecycleMeaning: "compatibility-alias", shutdownConfirmed: false,
      upstreamModelId: "current",
    });
  });

  it("does not infer shutdown from a display name or deprecation date", () => {
    const report = fixture({ providerModels: { v: [{ id: "old", name: "Old (Deprecated)", deprecationDate: "2020-01-01" }] } });
    expect(report.rows[0]).toMatchObject({ disposition: "unverified", shutdownConfirmed: false, sourceFlags: { deprecated: false, deprecationDate: "2020-01-01" } });
  });

  it("flags only boolean model deprecation, not string or inherited flags", () => {
    const report = fixture({ providerModels: { v: [{ id: "yes", deprecated: true }, { id: "string", deprecated: "true" }, { id: "no" }] } });
    expect(report.rows.map((row) => row.disposition)).toEqual(["source-flagged-deprecated", "unverified", "unverified"]);
  });

  it("keeps missing matches unknown and never falls back to another provider or a bare ID", () => {
    const report = fixture({
      providerModels: { v: [{ id: "org/model" }, { id: "model" }, { id: "org/model:free" }, { id: "model-1-2" }] },
      modelsDev: {
        vendor: { models: { "another/model": { status: "deprecated" }, "org/model": { status: "active" }, "model-1.2": { status: "deprecated" } } },
        other: { models: { model: { status: "deprecated" }, "org/model:free": { status: "deprecated" } } },
      },
    });
    expect(report.rows.map((row) => row.modelsDev.status)).toEqual(["exact-match", "model-not-found", "model-not-found", "model-not-found"]);
    expect(report.rows.every((row) => row.disposition === "unverified" && !row.shutdownConfirmed)).toBe(true);
  });

  it("requires an explicit provider mapping even when an upstream provider has the same name", () => {
    const report = fixture({ providerMap: {}, providerModels: { v: [{ id: "model" }] }, modelsDev: { vendor: { models: { model: { status: "deprecated" } } } } });
    expect(report.rows[0]).toMatchObject({ disposition: "unverified", modelsDev: { status: "provider-unmapped" } });
  });

  it("distinguishes missing snapshots from absent mapped providers", () => {
    const options = { providerModels: { v: [{ id: "model" }] } };
    expect(fixture(options).rows[0].modelsDev.status).toBe("snapshot-not-provided");
    expect(fixture({ ...options, modelsDev: {} }).rows[0].modelsDev.status).toBe("provider-not-found");
  });

  it("keeps regional and Code Assist routes distinct", () => {
    expect(DEFAULT_PROVIDER_MAP.gemini.id).toBe("google");
    expect(DEFAULT_PROVIDER_MAP["gemini-cli"].id).toBeNull();
    expect(DEFAULT_PROVIDER_MAP["minimax-cn"].id).not.toBe(DEFAULT_PROVIDER_MAP.minimax.id);
    const report = fixture({
      registry: [{ id: "vendor", alias: "v" }, { id: "vendor-cn" }, { id: "code-assist" }],
      providerModels: { v: [{ id: "shared" }], "vendor-cn": [{ id: "shared" }], "code-assist": [{ id: "shared" }] },
      providerMap: { vendor: mapped("vendor"), "vendor-cn": mapped("vendor-cn"), "code-assist": { id: null, scope: "distinct-client-route", evidenceUrls: [] } },
      modelsDev: { vendor: { models: { shared: { deprecated: true } } }, "vendor-cn": { models: { shared: {} } } },
    });
    expect(report.rows.map((row) => row.disposition)).toEqual(["modelsdev-deprecated-candidate", "unverified", "unverified"]);
  });

  it.each([{ status: "deprecated" }, { deprecated: true }])("treats models.dev deprecation as a candidate, not confirmed retirement (%j)", (record) => {
    const report = fixture({ providerModels: { v: [{ id: "model" }] }, modelsDev: { vendor: { models: { model: record } } } });
    expect(report.rows[0]).toMatchObject({ disposition: "modelsdev-deprecated-candidate", needsCorroboration: true, shutdownConfirmed: false });
  });

  it("retains raw numeric differences without rounding them into equivalence", () => {
    const report = fixture({ providerModels: { v: [{ id: "model", contextLength: 1000000 }] }, modelsDev: { vendor: { models: { model: { limit: { context: 1048576 } } } } } });
    expect(report.rows[0].declaredLimits.contextLength).toBe(1000000);
    expect(report.rows[0].modelsDev.limit.context).toBe(1048576);
    expect(report.rows[0].disposition).toBe("unverified");
    expect(report.methodology.numericEquivalenceAssumed).toBe(false);
  });

  it("scopes official eligibility evidence to exact provider, ID and kind and records conflicting source flags", () => {
    const evidence = [{ provider: "vendor", id: "restricted", kinds: ["llm"], status: "eligibility-restricted", url: "https://vendor.test/policy", quote: "Existing users retain access.", observedAt: "2026-10-16" }];
    const report = fixture({
      providerModels: { v: [{ id: "restricted", deprecated: true }, { id: "restricted", kind: "stt" }, { id: "restricted:free" }] },
      officialEvidence: evidence,
    });
    expect(report.rows[0]).toMatchObject({ disposition: "eligibility-restricted", shutdownConfirmed: false, conflicts: ["source-deprecated-vs-official-eligibility"] });
    expect(report.rows[0].evidence).toContainEqual(evidence[0]);
    expect(report.rows.slice(1).every((row) => row.disposition === "unverified")).toBe(true);
  });

  it("separates auxiliary TTS tables and voices without manufacturing provider IDs", () => {
    const report = fixture({
      providerModels: { v: [{ id: "chat" }], "vendor-tts-models": [{ id: "speech", type: "tts" }], "vendor-tts-voices": [{ id: "voice", type: "tts" }] },
      ttsConfig: { vendor: { models: [{ id: "speech", type: "tts" }], allVoices: [{ id: "voice", type: "tts" }], voices: { speech: [{ id: "voice", type: "tts" }] } } },
    });
    expect(report.providers.map((provider) => provider.id)).toEqual(["vendor"]);
    expect(report.rows).toHaveLength(1);
    expect(report.auxiliaryTables.find((table) => table.tableKey === "vendor-tts-voices")).toMatchObject({ ownerProvider: "vendor", role: "voice" });
    expect(report.auxiliaryTables.flatMap((table) => table.rows).every((row) => row.identity.provider === "vendor")).toBe(true);
    expect(report.ttsVoiceAssignments).toEqual([{ provider: "vendor", modelId: "speech", voiceIds: ["voice"] }]);
  });

  it("includes nested service-config models as separate auxiliary declarations", () => {
    const report = fixture({ registry: [{ id: "vendor", alias: "v", ttsConfig: { models: [{ id: "voice-model" }] }, embeddingConfig: { models: [{ id: "vectors" }] } }] });
    expect(report.auxiliaryTables.map((table) => [table.role, table.rows[0].identity.kind])).toEqual([["tts-configuration", "tts"], ["embedding-configuration", "embedding"]]);
    expect(report.summary.auxiliaryRows).toBe(2);
  });

  it("counts per-model voice declarations even when the flat voice table repeats the ID", () => {
    const report = fixture({
      providerModels: { v: [], "vendor-tts-voices": [{ id: "voice", type: "tts" }] },
      ttsConfig: { vendor: { allVoices: [{ id: "voice", type: "tts" }], voices: { speech: [{ id: "voice", type: "tts", deprecated: true }] } } },
    });
    expect(report.summary.auxiliaryRows).toBe(2);
    expect(report.auxiliaryTables.find((table) => table.modelId === "speech").rows[0].disposition).toBe("source-flagged-deprecated");
  });

  it("covers TTS configuration rows even without supplied flattened tables", () => {
    const report = fixture({ ttsConfig: { vendor: { models: [{ id: "speech" }], allVoices: [{ id: "voice" }] } } });
    expect(report.summary.auxiliaryRows).toBe(2);
    expect(report.auxiliaryTables.map((table) => table.role)).toEqual(["model", "voice"]);
  });

  it("records upstream deprecation conflicts without converting documented eligibility into shutdown", () => {
    const report = fixture({
      providerModels: { v: [{ id: "restricted" }] },
      modelsDev: { vendor: { models: { restricted: { status: "deprecated" } } } },
      officialEvidence: [{ provider: "vendor", id: "restricted", kinds: ["llm"], status: "eligibility-restricted", url: "https://vendor.test/policy" }],
    });
    expect(report.rows[0]).toMatchObject({ disposition: "eligibility-restricted", shutdownConfirmed: false, conflicts: ["modelsdev-deprecated-vs-official-eligibility"] });
  });

  it("reports unknown auxiliary owners as null rather than guessing from suffixes", () => {
    const report = fixture({ providerModels: { v: [], "not-a-provider-tts-models": [{ id: "model" }] } });
    expect(report.auxiliaryTables[0]).toMatchObject({ ownerProvider: null, role: "unassigned" });
    expect(report.auxiliaryTables[0].rows[0]).toMatchObject({ identity: { provider: null }, disposition: "unverified" });
  });

  it("keeps metadata-only references and inactive disk files separate from active models", () => {
    const report = fixture({
      providerModels: { v: [{ id: "listed" }] },
      reviewedMetadata: { vendor: { listed: { sources: ["https://vendor.test/listed"] }, history: { sources: ["https://vendor.test/history"], billing: { kind: "api-reference" } } }, inactive: { archive: { sources: ["https://vendor.test/archive"] } } },
      diskDefinitions: [{ file: "open-sse/providers/registry/vendor.js", imported: true }, { file: "open-sse/providers/registry/inactive.js", imported: false }],
    });
    expect(report.rows).toHaveLength(1);
    expect(report.metadataReferences).toHaveLength(2);
    expect(report.metadataReferences.every((row) => row.disposition === "metadata-reference-only")).toBe(true);
    expect(report.diskDefinitions[1]).toMatchObject({ imported: false, disposition: "unverified", modelsEvaluated: false });
    expect(report.providers).toHaveLength(1);
  });

  it("does not silently deduplicate duplicate identities and reconciles all counts", () => {
    const report = fixture({
      providerModels: { v: [{ id: "same" }, { id: "same" }, { id: "old", deprecated: true }], other: [{ id: "extra" }] },
      reviewedMetadata: { vendor: { reference: { sources: [] } } },
    });
    const rows = everyRow(report);
    expect(report.summary.totalRows).toBe(rows.length);
    expect(Object.values(report.summary.byDisposition).reduce((sum, count) => sum + count, 0)).toBe(rows.length);
    expect(Object.keys(report.summary.byDisposition).sort()).toEqual([...DISPOSITIONS].sort());
    expect(report.summary.activeRows + report.summary.auxiliaryRows + report.summary.metadataReferenceRows).toBe(rows.length);
    expect(report.duplicateIdentities).toEqual([{ identity: { provider: "vendor", kind: "llm", id: "same" }, occurrences: 2 }]);
    expect(new Set(rows.map((row) => row.recordKey)).size).toBe(rows.length);
  });

  it("compares lifecycle changes without flattening IDs or changing classifiers", () => {
    const before = { registry: [{ id: "vendor", alias: "v" }], providerModels: { v: [{ id: "org/shared" }, { id: "old" }, { id: "voice", type: "tts" }] } };
    const report = fixture({
      baseline: before,
      providerModels: { v: [{ id: "org/shared", deprecated: true }, { id: "shared" }, { id: "voice", kind: "tts" }] },
    });
    expect(report.comparison.added.map((row) => row.identity.id)).toEqual(["shared"]);
    expect(report.comparison.removed.map((row) => row.identity.id)).toEqual(["old"]);
    expect(report.comparison.changed.map((row) => row.identity.id)).toEqual(["org/shared"]);
    expect(report.comparison.unchangedRows).toBe(1);
  });

  it("compares canonical identities across provider storage-alias changes", () => {
    const report = fixture({
      baseline: { registry: [{ id: "vendor", alias: "old" }], providerModels: { old: [{ id: "same" }] } },
      registry: [{ id: "vendor", alias: "new" }], providerModels: { new: [{ id: "same" }] },
    });
    expect(report.comparison).toMatchObject({ added: [], removed: [], changed: [], unchangedRows: 1 });
  });

  it("does not mutate inputs or claim exact catalog matches verify service availability", () => {
    const input = { registry: [{ id: "vendor", alias: "v" }], providerModels: { v: [{ id: "model" }] }, providerMap: { vendor: mapped("vendor") }, modelsDev: { vendor: { models: { model: {} } } }, officialEvidence: [] };
    const original = JSON.stringify(input);
    const report = buildLifecycleInventory(input);
    expect(JSON.stringify(input)).toBe(original);
    expect(report.rows[0].disposition).toBe("unverified");
    expect(report.methodology.inferencePerformed).toBe(false);
    expect(report.unresolvedProviders.map((provider) => provider.id)).toContain("vendor");
  });
});
