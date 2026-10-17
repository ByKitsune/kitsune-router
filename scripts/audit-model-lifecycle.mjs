#!/usr/bin/env node
// Offline lifecycle inventory, not an inference/entitlement check.
// Usage: node scripts/audit-model-lifecycle.mjs [modelsdev-api.json] [--baseline SHA]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as vm from "node:vm";
import { platform, arch } from "node:os";
import { modelKind } from "../open-sse/providers/models/schema.js";
import { getModelsDevProviderId } from "../open-sse/providers/catalogProviders.js";

const BASELINE_SHA = "4e89e102e339dcaef4511ea43af19cabc2cb9c4a";
const MODELS_DEV_URL = "https://models.dev/api.json";
export const DISPOSITIONS = Object.freeze([
  "source-flagged-deprecated", "eligibility-restricted",
  "modelsdev-deprecated-candidate", "metadata-reference-only", "unverified",
]);
const mapping = (provider, scope = "direct-api") => ({
  id: provider === null ? null : getModelsDevProviderId(provider),
  scope, evidenceUrls: [MODELS_DEV_URL],
});

// Explicit route mappings only. A missing provider or literal ID stays unknown.
// A native-vendor catalog must never stand in for a regional or subscription route.
export const DEFAULT_PROVIDER_MAP = Object.freeze({
  openai: mapping("openai"), anthropic: mapping("anthropic"),
  gemini: mapping("gemini"), vertex: mapping("vertex", "vertex-api"),
  "vertex-partner": mapping("vertex-partner", "vertex-maas-not-anthropic-partner-api"),
  deepseek: mapping("deepseek"), xai: mapping("xai"), mistral: mapping("mistral"),
  cohere: mapping("cohere"), groq: mapping("groq"), cerebras: mapping("cerebras"),
  nvidia: mapping("nvidia"), together: mapping("together"),
  fireworks: mapping("fireworks"), hyperbolic: mapping("hyperbolic"),
  nebius: mapping("nebius"), siliconflow: mapping("siliconflow"),
  chutes: mapping("chutes"), featherless: mapping("featherless"),
  huggingface: mapping("huggingface"), venice: mapping("venice"),
  openrouter: mapping("openrouter", "aggregator-api"),
  perplexity: mapping("perplexity"), minimax: mapping("minimax", "global-api"),
  "minimax-cn": mapping("minimax-cn", "china-api"),
  glm: mapping("glm", "global-coding-plan"),
  "glm-cn": mapping("glm-cn", "china-coding-plan"),
  kimi: mapping("kimi", "china-kimi-code-plan-not-global-code-or-moonshot-api"),
  "cloudflare-ai": mapping("cloudflare-ai"),
  byteplus: mapping("byteplus", "global-api"),
  "volcengine-ark": mapping("volcengine-ark", "china-api"),
  tencent: mapping("tencent", "china-api"), baidu: mapping("baidu", "china-api"),
  "alicode-intl": mapping("alicode-intl", "global-coding-plan"),
  alicode: mapping("alicode", "china-coding-plan"),
  "alitp-intl": mapping("alitp-intl", "global-token-plan"),
  clinepass: mapping("clinepass", "cline-pass-subscription"),
  "perplexity-agent": mapping("perplexity-agent", "agent-api-not-sonar-api"),
  sambanova: mapping("sambanova"), morph: mapping("morph"), poolside: mapping("poolside"),
  tokenrouter: mapping("tokenrouter", "aggregator-api"),
  "vercel-ai-gateway": mapping("vercel-ai-gateway", "gateway-api"),
  "xiaomi-mimo": mapping("xiaomi-mimo", "direct-api-not-token-plan"),
  "xiaomi-tokenplan": { ...mapping(null, "region-selectable-token-plan; account region not inventoried"),
    regions: { sgp: "xiaomi-token-plan-sgp", cn: "xiaomi-token-plan-cn", ams: "xiaomi-token-plan-ams" } },
  "gemini-cli": mapping(null, "code-assist-not-google-api"),
  claude: mapping("claude", "claude-code-not-anthropic-api"),
  codex: mapping(null, "chatgpt-codex-not-openai-api"),
  github: mapping("github", "copilot-not-github-models-api"),
  "grok-cli": mapping(null, "grok-build-not-xai-api"),
  "alims-intl": mapping("alims-intl", "standard-global-api"),
  iflow: mapping("iflow", "iflow-api"),
  "kilo-gateway": mapping("kilo-gateway", "gateway-api"),
  opencode: mapping("opencode", "hosted-free-api-catalog-reference-not-account-entitlement"),
  "opencode-go": mapping("opencode-go", "hosted-plan-api-catalog-reference-not-account-entitlement"),
  ollama: mapping("ollama", "cloud-api-native-chat-protocol"),
  commandcode: mapping("commandcode", "native-alpha-route-not-public-v1-catalog"),
});

const GOOGLE_ELIGIBILITY_QUOTE = "To ensure reliable performance for everyone, we are limiting access to the 2.5 models to users who have actively used them in the past. These models are not deprecated and will continue to be served until further notice through the API.";
export const OFFICIAL_LIFECYCLE_EVIDENCE = Object.freeze(
  ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"].map((id) => ({
    provider: "gemini", id, kinds: ["llm", "stt", "imageToText"],
    status: "eligibility-restricted", url: "https://ai.google.dev/gemini-api/docs/deprecations",
    modelUrl: `https://ai.google.dev/gemini-api/docs/models/${id}`,
    quote: GOOGLE_ELIGIBILITY_QUOTE, observedAt: "2026-10-16",
    scope: "Google Gemini API; not proof of an individual account's entitlement or Code Assist availability",
  })),
);

const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
const counts = (rows) => {
  const result = Object.fromEntries(DISPOSITIONS.map((name) => [name, 0]));
  for (const row of rows) result[row.disposition]++;
  return result;
};
const identityKey = (identity) => JSON.stringify([identity.provider, identity.kind, identity.id]);
const rawModel = (value) => typeof value === "string" ? { id: value } : { ...value };
const own = (object, key) => object != null && Object.hasOwn(object, key);
const metadataSummary = (metadata) => metadata ? {
  sources: clone(metadata.sources || []), billingKind: metadata.billing?.kind || null,
  scope: metadata.limits?.scope || null,
  routeAvailable: metadata.limits?.routeAvailable ?? null,
  routeUnavailableReason: metadata.limits?.routeUnavailableReason || null,
  note: metadata.limits?.note || null,
} : null;

function registryIdentities(registry) {
  const ids = new Set();
  for (const entry of registry) {
    if (!entry?.id || ids.has(entry.id)) throw new Error(`Invalid or duplicate registry provider: ${entry?.id}`);
    ids.add(entry.id);
  }
  const tokens = new Map([...ids].map((id) => [id, id]));
  for (const entry of registry) {
    for (const token of [entry.alias, entry.uiAlias, ...(entry.aliases || [])].filter(Boolean)) {
      if (ids.has(token)) continue;
      if (tokens.has(token) && tokens.get(token) !== entry.id) throw new Error(`Ambiguous registry alias: ${token}`);
      tokens.set(token, entry.id);
    }
  }
  return { ids, canonical: (token) => tokens.get(token) || token };
}

function matchModelsDev(provider, id, modelsDev, providerMap) {
  const route = providerMap[provider];
  const result = { provider: route?.id || null, id, status: "provider-unmapped" };
  if (!route?.id) return result;
  if (modelsDev == null) return { ...result, status: "snapshot-not-provided" };
  if (!own(modelsDev, route.id)) return { ...result, status: "provider-not-found" };
  const models = modelsDev[route.id]?.models;
  if (!own(models, id)) return { ...result, status: "model-not-found" };
  const model = models[id];
  return {
    ...result, status: "exact-match", lifecycleStatus: model.status ?? null,
    deprecated: model.deprecated === true || model.status === "deprecated",
    deprecationDate: model.deprecationDate ?? null, limit: clone(model.limit || null),
    sourceUrl: MODELS_DEV_URL,
  };
}

function compareRows(before, after, byTable = false) {
  const group = (rows) => {
    const result = new Map();
    for (const row of rows) {
      const key = byTable ? JSON.stringify([row.tableKey, row.key]) : row.key;
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(row);
    }
    return result;
  };
  const previous = group(before), current = group(after);
  const result = { added: [], removed: [], changed: [], unchangedRows: 0 };
  const signature = (row) => JSON.stringify([row.disposition, row.sourceFlags, row.upstreamModelId, row.metadata]);
  for (const key of new Set([...previous.keys(), ...current.keys()])) {
    const oldRows = previous.get(key) || [], newRows = current.get(key) || [];
    for (let i = 0; i < Math.max(oldRows.length, newRows.length); i++) {
      const oldRow = oldRows[i], newRow = newRows[i];
      if (!oldRow) result.added.push(newRow);
      else if (!newRow) result.removed.push(oldRow);
      else if (signature(oldRow) !== signature(newRow)) result.changed.push({ identity: newRow.identity, before: oldRow, after: newRow });
      else result.unchangedRows++;
    }
  }
  return result;
}

/** Pure fixture-friendly builder; callers supply inert snapshots, never accounts or a DB. */
export function buildLifecycleInventory({
  registry, providerModels = {}, ttsConfig = {}, reviewedMetadata = {}, diskDefinitions = [],
  modelsDev = null, providerMap = DEFAULT_PROVIDER_MAP, officialEvidence = OFFICIAL_LIFECYCLE_EVIDENCE,
  baseline = null, provenance = {}, generatedAt = null,
}) {
  if (!Array.isArray(registry)) throw new Error("registry must be an array");
  const { ids, canonical } = registryIdentities(registry);
  const metadata = new Map();
  for (const [token, records] of Object.entries(reviewedMetadata)) {
    for (const [id, record] of Object.entries(records)) metadata.set(JSON.stringify([canonical(token), id]), record);
  }
  function rowFor(raw, provider, tableKey, index, surface, contextualKind = null) {
    const model = rawModel(raw);
    const identity = { provider, kind: modelKind(contextualKind && !model.kind && !model.type ? { ...model, kind: contextualKind } : model), id: model.id ?? null };
    const sourceFlags = {
      deprecated: model.deprecated === true, rawDeprecated: model.deprecated ?? null,
      deprecationNotice: model.deprecationNotice ?? null, deprecationDate: model.deprecationDate ?? null,
    };
    const evidence = officialEvidence.filter((entry) => entry.provider === provider && entry.id === model.id
      && entry.kinds.includes(identity.kind) && entry.status === "eligibility-restricted");
    const match = matchModelsDev(provider, model.id, modelsDev, providerMap);
    const isReference = surface === "metadata-reference";
    const isVoice = surface === "voice";
    let disposition = "unverified";
    if (isReference) disposition = "metadata-reference-only";
    else if (!isVoice && evidence.length) disposition = "eligibility-restricted";
    else if (sourceFlags.deprecated) disposition = "source-flagged-deprecated";
    else if (!isVoice && match.deprecated) disposition = "modelsdev-deprecated-candidate";
    const record = metadata.get(JSON.stringify([provider, model.id]));
    return {
      identity, key: identityKey(identity), recordKey: JSON.stringify([surface, tableKey, index, identityKey(identity)]),
      surface, tableKey, name: model.name ?? null, upstreamModelId: model.upstreamModelId ?? null,
      sourceFlags, disposition, shutdownConfirmed: false,
      lifecycleMeaning: disposition === "eligibility-restricted" ? "account-eligibility"
        : sourceFlags.deprecated && model.upstreamModelId && model.upstreamModelId !== model.id ? "compatibility-alias"
          : sourceFlags.deprecated ? "unspecified-deprecation" : "unknown",
      needsCorroboration: disposition === "modelsdev-deprecated-candidate" || disposition === "source-flagged-deprecated",
      conflicts: [
        ...(evidence.length && sourceFlags.deprecated ? ["source-deprecated-vs-official-eligibility"] : []),
        ...(evidence.length && match.deprecated ? ["modelsdev-deprecated-vs-official-eligibility"] : []),
      ],
      modelsDev: isVoice ? { provider: null, id: model.id ?? null, status: "not-applicable-voice" } : match,
      evidence: clone(evidence), metadata: metadataSummary(record),
      declaredLimits: Object.fromEntries(["contextLength", "contextWindow", "maxInput", "maxOutput", "maxOutputTokens"].filter((key) => own(model, key)).map((key) => [key, clone(model[key])])),
      validationErrors: typeof model.id === "string" && model.id ? [] : ["missing-literal-model-id"],
    };
  }
  function tableRows(values, provider, tableKey, surface, kind = null) {
    if (!Array.isArray(values)) throw new Error(`Model table is not an array: ${tableKey}`);
    return values.map((raw, index) => rowFor(raw, provider, tableKey, index, surface, kind));
  }
  const providers = [], rows = [], auxiliaryTables = [], ttsVoiceAssignments = [];
  const activeTableKeys = new Set();
  for (const entry of registry) {
    const tableKey = entry.alias || entry.id;
    activeTableKeys.add(tableKey);
    const models = tableRows(providerModels[tableKey] ?? entry.models ?? [], entry.id, tableKey, "active-model");
    rows.push(...models);
    const display = entry.display || {};
    providers.push({
      id: entry.id, alias: tableKey, hidden: entry.hidden === true, serviceKinds: clone(entry.serviceKinds || ["llm"]),
      modelRows: models.length, sourceDeclaredRows: entry.models?.length || 0,
      warning: { deprecated: display.deprecated === true, notice: display.deprecationNotice || null,
        type: display.deprecationNotice === "RISK_NOTICE" ? "risk-notice" : display.deprecated ? "provider-lifecycle-unverified" : "none" },
      modelsDevMapping: clone(providerMap[entry.id] || { id: null, scope: "unmapped", evidenceUrls: [] }),
      byDisposition: counts(models),
    });
    for (const kind of ["tts", "stt", "embedding", "image", "imageToText", "video", "music"]) {
      const configs = [entry[`${kind}Config`], entry.media?.[`${kind}Config`]];
      for (const [index, config] of configs.entries()) {
        if (!Array.isArray(config?.models)) continue;
        const key = `registry:${entry.id}.${index ? "media." : ""}${kind}Config.models`;
        auxiliaryTables.push({ tableKey: key, ownerProvider: entry.id, role: `${kind}-configuration`, rows: tableRows(config.models, entry.id, key, "auxiliary-model", kind) });
      }
    }
  }
  const ttsOwners = new Map();
  for (const [token, config] of Object.entries(ttsConfig)) {
    const owner = ids.has(canonical(token)) ? canonical(token) : null;
    if (config.models) ttsOwners.set(`${token}-tts-models`, { owner, role: "model" });
    if (config.allVoices) ttsOwners.set(`${token}-tts-voices`, { owner, role: "voice" });
    if (config.defaults) ttsOwners.set(token, { owner, role: "default-voice" });
    for (const [field, role] of [["models", "model"], ["allVoices", "voice"], ["defaults", "default-voice"]]) {
      if (!Array.isArray(config[field])) continue;
      const flatKey = field === "models" ? `${token}-tts-models` : field === "allVoices" ? `${token}-tts-voices` : token;
      if (own(providerModels, flatKey)) continue;
      const key = `tts-config:${token}.${field}`;
      auxiliaryTables.push({ tableKey: key, ownerProvider: owner, role,
        rows: tableRows(config[field], owner, key, role.includes("voice") ? "voice" : "auxiliary-model", "tts") });
    }
    for (const [modelId, voices] of Object.entries(config.voices || {})) {
      ttsVoiceAssignments.push({ provider: owner, modelId, voiceIds: voices.map((voice) => rawModel(voice).id) });
      // Keep each model's voice assignment even when the flat table repeats it.
      const key = `tts-config:${token}.voices[${JSON.stringify(modelId)}]`;
      auxiliaryTables.push({ tableKey: key, ownerProvider: owner, role: "voice", modelId,
        rows: tableRows(voices, owner, key, "voice", "tts") });
    }
  }
  for (const [tableKey, values] of Object.entries(providerModels)) {
    if (activeTableKeys.has(tableKey)) continue;
    const { owner = null, role = "unassigned" } = ttsOwners.get(tableKey) || {};
    auxiliaryTables.push({ tableKey, ownerProvider: owner, role, rows: tableRows(values, owner, tableKey, role.includes("voice") ? "voice" : "auxiliary-model") });
  }
  const listed = new Set(rows.map((row) => JSON.stringify([row.identity.provider, row.identity.id])));
  const metadataReferences = [];
  for (const [key, record] of metadata) {
    if (listed.has(key)) continue;
    const [provider, id] = JSON.parse(key);
    metadataReferences.push(rowFor({ id, kind: record.limits?.kind }, provider, `metadata:${provider}`, metadataReferences.length, "metadata-reference"));
  }
  const allRows = [...rows, ...auxiliaryTables.flatMap((table) => table.rows), ...metadataReferences];
  const occurrences = new Map();
  for (const row of rows) {
    if (!occurrences.has(row.key)) occurrences.set(row.key, { identity: row.identity, occurrences: 0 });
    occurrences.get(row.key).occurrences++;
  }
  const unresolvedProviders = providers.map((provider) => {
    const owned = rows.filter((row) => row.identity.provider === provider.id);
    return { id: provider.id, modelRows: owned.length, byDisposition: counts(owned),
      reasons: [...new Set(owned.length ? owned.flatMap((row) => [
        ...(row.disposition === "eligibility-restricted" ? ["individual-account-eligibility-unverified"] : ["no-corroborated-global-lifecycle-decision"]),
        ...(row.modelsDev.status !== "exact-match" ? [row.modelsDev.status] : []),
      ]) : ["no-static-catalog-rows"])] };
  });
  const report = {
    schemaVersion: 1, generatedAt, provenance: clone(provenance),
    methodology: {
      classifier: "open-sse/providers/models/schema.js:modelKind; same current classifier for baseline and final",
      identity: ["canonical registry provider", "service kind", "literal model ID"],
      join: "explicit mapped provider + literal model ID only; no upstream/leaf/punctuation fallback",
      inferencePerformed: false, numericEquivalenceAssumed: false,
      sourceFlagIsShutdownProof: false, missingMatchMeans: "unknown, not retired",
      voiceRowsAreModelIds: false, diskOnlyModulesEvaluated: false,
      counting: "Counts are source-row occurrences, not unique models. Per-model voice assignments and flat voice lists remain separate. Zero-row providers have no rows in their main PROVIDER_MODELS table, even if auxiliary config models exist.",
      baselineEvidence: "The same supplied upstream snapshot and reviewed official evidence are applied to both inventories; baseline source flags are preserved, not treated as historical lifecycle verification.",
      availabilityWarning: "Inventory coverage is not service-availability verification. models.dev flags need independent corroboration; matching rows without flags remain unverified.",
    },
    summary: {
      activeProviders: providers.length, zeroRowProviders: providers.filter((provider) => provider.modelRows === 0).length,
      activeRows: rows.length, auxiliaryTables: auxiliaryTables.length,
      auxiliaryRows: auxiliaryTables.reduce((sum, table) => sum + table.rows.length, 0),
      metadataReferenceRows: metadataReferences.length, totalRows: allRows.length,
      byDisposition: counts(allRows), sourceFlaggedRows: allRows.filter((row) => row.sourceFlags.deprecated).length,
      bySurface: Object.fromEntries([...new Set(allRows.map((row) => row.surface))].sort().map((surface) => {
        const owned = allRows.filter((row) => row.surface === surface);
        return [surface, { rows: owned.length, byDisposition: counts(owned) }];
      })),
      diskDefinitions: diskDefinitions.length, unimportedDefinitions: diskDefinitions.filter((file) => !file.imported).length,
      unresolvedProviders: unresolvedProviders.length,
    },
    providers, rows, auxiliaryTables, ttsVoiceAssignments, metadataReferences,
    diskDefinitions: diskDefinitions.map((file) => ({ ...clone(file), disposition: "unverified", modelsEvaluated: file.imported === true })),
    duplicateIdentities: [...occurrences.values()].filter((entry) => entry.occurrences > 1),
    unresolvedProviders,
    sourceEvidenceUrls: [...new Set([...(modelsDev ? [MODELS_DEV_URL] : []),
      ...officialEvidence.flatMap((entry) => [entry.url, entry.modelUrl].filter(Boolean)),
      ...[...metadata.values()].flatMap((record) => record.sources || []),
    ])].sort(),
    baseline: null, comparison: null,
  };
  if (baseline) {
    report.baseline = buildLifecycleInventory({ ...baseline, modelsDev, providerMap, officialEvidence, generatedAt });
    report.comparison = compareRows(report.baseline.rows, rows);
    report.comparison.auxiliary = compareRows(report.baseline.auxiliaryTables.flatMap((table) => table.rows), auxiliaryTables.flatMap((table) => table.rows), true);
    report.comparison.metadataReferences = compareRows(report.baseline.metadataReferences, metadataReferences);
    report.comparison.providersAdded = providers.filter((provider) => !report.baseline.providers.some((old) => old.id === provider.id)).map((provider) => provider.id);
    report.comparison.providersRemoved = report.baseline.providers.filter((provider) => !ids.has(provider.id)).map((provider) => provider.id);
  }
  return report;
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trimEnd();

// The loader only executes inert registry/config/schema/metadata modules in a
// context without fetch, filesystem access, real environment values or DB imports.
async function loadSnapshot(root, ref) {
  const sources = new Map(), modules = new Map();
  const context = vm.createContext({ process: { env: {}, version: process.version }, console: { log: console.error, warn: console.error, error: console.error } });
  const allowed = (file) => file === "open-sse/translator/formats.js"
    || /^(?:open-sse\/(?:config\/|providers\/(?:registry\/|models\/|metadata\/))[^\0]*\.js|open-sse\/providers\/(?:index|schema|shared|identity)\.js)$/.test(file);
  function source(file) {
    if (!sources.has(file)) sources.set(file, ref ? execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }) : readFileSync(path.join(root, file), "utf8"));
    return sources.get(file);
  }
  function load(file) {
    if (!allowed(file)) throw new Error(`Refusing non-inert snapshot import: ${file}`);
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(source(file), { context, identifier: file }));
    return modules.get(file);
  }
  const entry = new vm.SourceTextModule(`
    import registry from "./providers/registry/index.js";
    import { PROVIDER_MODELS } from "./providers/index.js";
    import { TTS_MODELS_CONFIG } from "./config/ttsModels.js";
    import { REVIEWED_MODEL_METADATA } from "./providers/metadata/reviewed.js";
    export { registry, PROVIDER_MODELS, TTS_MODELS_CONFIG, REVIEWED_MODEL_METADATA };
  `, { context, identifier: "open-sse/lifecycle-entry.js" });
  const os = new vm.SyntheticModule(["platform", "arch"], function() { this.setExport("platform", platform); this.setExport("arch", arch); }, { context });
  await entry.link((specifier, parent) => {
    if (specifier === "os" || specifier === "node:os") return os;
    if (!specifier.startsWith(".")) throw new Error(`Refusing external snapshot import: ${specifier}`);
    return load(path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier)));
  });
  await entry.evaluate();
  const directory = "open-sse/providers/registry";
  const diskFiles = ref ? git(root, "ls-tree", "--name-only", ref, `${directory}/`).split("\n")
    : readdirSync(path.join(root, directory)).filter((file) => file.endsWith(".js")).map((file) => `${directory}/${file}`);
  const imported = new Set([...modules.keys()].filter((file) => file.startsWith(`${directory}/`)));
  const diskDefinitions = diskFiles.filter((file) => file.endsWith(".js") && file !== `${directory}/index.js`).sort().map((file) => {
    source(file);
    return { file, imported: imported.has(file), providerId: imported.has(file) ? modules.get(file).namespace.default?.id || null : null, sourceSha256: sha256(source(file)) };
  });
  const files = [...sources.keys()].sort();
  return {
    registry: entry.namespace.registry, providerModels: entry.namespace.PROVIDER_MODELS,
    ttsConfig: entry.namespace.TTS_MODELS_CONFIG, reviewedMetadata: entry.namespace.REVIEWED_MODEL_METADATA,
    diskDefinitions,
    provenance: { kind: ref ? "git-commit" : "working-tree", commit: ref || git(root, "rev-parse", "HEAD"),
      sourceSha256: sha256(files.map((file) => `${file}\0${sources.get(file)}\0`).join("")), sourceFiles: files,
      environment: "empty process.env; no network or account state", },
  };
}

async function main(args) {
  let modelsDevPath = null, baselineRef = BASELINE_SHA;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help") {
      console.log("Usage: node scripts/audit-model-lifecycle.mjs [modelsdev-api.json] [--models-dev PATH] [--baseline SHA]\nNetwork-free JSON report to stdout. Missing upstream matches stay unknown. Default baseline: " + BASELINE_SHA);
      return;
    }
    if (args[i] === "--baseline" || args[i] === "--models-dev") {
      const option = args[i], value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${option}`);
      if (option === "--baseline") baselineRef = value;
      else modelsDevPath = value;
    } else if (!args[i].startsWith("-") && !modelsDevPath) modelsDevPath = args[i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (typeof vm.SourceTextModule !== "function") {
    const child = spawnSync(process.execPath, ["--experimental-vm-modules", fileURLToPath(import.meta.url), ...args], { stdio: "inherit" });
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1;
    return;
  }
  const root = fileURLToPath(new URL("..", import.meta.url));
  if (!/^[0-9a-f]{7,40}$/i.test(baselineRef)) throw new Error("Baseline must be an immutable commit SHA, not a moving branch/tag");
  const baselineSha = git(root, "rev-parse", "--verify", `${baselineRef}^{commit}`);
  const baseline = await loadSnapshot(root, baselineSha);
  const current = await loadSnapshot(root, null);
  let modelsDev = null, modelsDevSnapshot = { url: MODELS_DEV_URL, supplied: false, retrievedAt: null };
  if (modelsDevPath) {
    const file = path.resolve(modelsDevPath), bytes = readFileSync(file);
    modelsDev = JSON.parse(bytes.toString("utf8"));
    if (!modelsDev || Array.isArray(modelsDev) || typeof modelsDev !== "object") throw new Error("models.dev snapshot must be a provider-keyed JSON object");
    modelsDevSnapshot = { url: MODELS_DEV_URL, supplied: true, file, sha256: sha256(bytes),
      fileModifiedAt: statSync(file).mtime.toISOString(), retrievedAt: null,
      note: "File modification time is not an authenticated retrieval timestamp.", };
  }
  const report = buildLifecycleInventory({ ...current, baseline, modelsDev, generatedAt: new Date().toISOString(),
    provenance: { ...current.provenance, baselineSha, classifierSha256: sha256(readFileSync(new URL("../open-sse/providers/models/schema.js", import.meta.url))),
      catalogProviderMapSha256: sha256(readFileSync(new URL("../open-sse/providers/catalogProviders.js", import.meta.url))),
      auditScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), modelsDevSnapshot },
  });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(`Lifecycle inventory failed: ${error.message}`); process.exitCode = 1; });
}
