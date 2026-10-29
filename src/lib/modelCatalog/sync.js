// Periodic refresh of model capabilities and dated price observations.
//
// Downloads the catalog, keeps only what differs from the hand-written tables,
// and writes it next to the database. Failures are swallowed on purpose: a
// stale or missing file just means those tables keep deciding on their own.

import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DATA_DIR } from "@/lib/dataDir.js";
import { CATALOG_FILE, CATALOG_RAW_FILE, CATALOG_VERSION, invalidateCatalog, installCatalogSource } from "open-sse/providers/catalogOverride.js";
import { getModelsDevProviderId } from "open-sse/providers/catalogProviders.js";
import { installPricingObservationStore, parseModelsDevCatalog, readModelsDevResponse } from "./pricingObservations.js";

const CATALOG_URL = "https://models.dev/api.json";
const FETCH_TIMEOUT_MS = 60000;

// Refresh before the 24h price validity window expires, without extending an
// old capture's timestamp or using a 304 as evidence for unvalidated rows.
export const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60 * 1000;   // let the server boot and serve first requests
const RETRY_DELAY_MS = 30 * 60 * 1000;

const MODALITY_BY_INPUT = { image: "vision", pdf: "pdf", audio: "audioInput", video: "videoInput" };
const MODALITY_BY_OUTPUT = { image: "imageOutput", audio: "audioOutput" };
const FEATURE_FIELDS = { reasoning: "reasoning", tool_call: "tools", structured_output: "structuredOutput", temperature: "temperature" };

let state = { running: false, lastSync: null, lastError: null, lastResult: null, etag: null, fileVersion: null };
let timer = null;
let activeSync = null;
let syncController = null;
let stopped = false;
let pricingStore;

function getPricingStore() {
  return pricingStore ||= installPricingObservationStore(path.join(DATA_DIR, "model-pricing-observations"));
}

export function getSyncState() {
  return { ...state, file: CATALOG_FILE, url: CATALOG_URL, intervalMs: SYNC_INTERVAL_MS };
}


function writeAtomic(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

// Trimmed copy of the upstream catalog, kept for the add-models skill: same
// models, ~470KB instead of 4.3MB.
function slim(catalog) {
  const out = {};
  for (const [providerId, provider] of Object.entries(catalog)) {
    const models = {};
    for (const [modelId, model] of Object.entries(provider?.models || {})) {
      models[modelId] = {
        i: (model?.modalities?.input || []).filter((x) => x !== "text"),
        c: model?.limit?.context,
        mi: model?.limit?.input,
        o: model?.limit?.output,
        r: typeof model?.reasoning === "boolean" ? model.reasoning : undefined,
        t: typeof model?.tool_call === "boolean" ? model.tool_call : undefined,
      };
    }
    out[providerId] = models;
  }
  return out;
}

export function build(catalog, entries) {
  // Map each local route to its actual catalog product, not a vendor family.
  const localIds = new Map();
  for (const { provider } of entries) {
    const upstreamId = getModelsDevProviderId(provider);
    if (!upstreamId) continue;
    let locals = localIds.get(upstreamId);
    if (!locals) localIds.set(upstreamId, (locals = []));
    if (!locals.includes(provider)) locals.push(provider);
  }

  // Index once: the raw upstream record per provider+model for limits, and the
  // modalities each gateway declares for it.
  const byProvider = {};
  // Modalities are recorded per gateway upstream and gateways disagree about the
  // same weights — some do not proxy images at all — so the key is provider +
  // model. Keying by model id alone let short ids collide across vendors: "auto",
  // "free" and "efficient" are router modes in one catalog and model names in
  // another, so a router mode inherited a stranger's vision.
  const models = {};
  for (const [providerId, provider] of Object.entries(catalog)) {
    const locals = [...new Set([...(localIds.get(providerId) || []), providerId])]
      .filter(local => getModelsDevProviderId(local) === providerId);
    const modelsById = new Map(Object.entries(provider?.models || {}));
    for (const [id, model] of modelsById) {
      const declared = {};
      for (const [direction, mapping] of [["input", MODALITY_BY_INPUT], ["output", MODALITY_BY_OUTPUT]]) {
        const modalities = model?.modalities?.[direction];
        if (!Array.isArray(modalities)) continue;
        for (const [modality, key] of Object.entries(mapping)) declared[key] = modalities.includes(modality);
      }
      for (const [field, key] of Object.entries(FEATURE_FIELDS)) {
        if (typeof model?.[field] === "boolean") declared[key] = model[field];
      }
      if (Object.keys(declared).length) {
        for (const local of locals) models[`${local}:${id}`] = declared;
      }
    }
    byProvider[providerId] = modelsById;
  }

  // Limits belong to the gateway — each truncates differently — so only the
  // matching provider's own numbers are used, keyed by provider + model.
  const providers = {};
  for (const { provider, model, upstreamModelId = model, contextLength, current = {} } of entries) {
    const upstream = getModelsDevProviderId(provider);
    if (!upstream) continue;
    const entry = byProvider[upstream]?.get(upstreamModelId);
    if (!entry) continue;
    if (upstreamModelId !== model && models[`${upstream}:${upstreamModelId}`]) {
      models[`${provider}:${model}`] = models[`${upstream}:${upstreamModelId}`];
    }

    const delta = {};
    for (const [field, key] of [["context", "contextWindow"], ["input", "maxInput"], ["output", "maxOutput"]]) {
      const value = entry.limit?.[field];
      if (!Number.isSafeInteger(value) || value <= 0 || value === current[key]) continue;
      if (key === "contextWindow" && contextLength > 0) continue;
      delta[key] = value;
    }
    if (Object.keys(delta).length) (providers[provider] || (providers[provider] = {}))[model] = delta;
  }

  return { models, providers };
}

// Snapshot every registered model with the capabilities the hand-written tables
// resolve on their own, so build() can tell which upstream values are a change.
//
// The previous catalog MUST be detached first. Leaving it installed makes each
// delta relative to the last one, so a value that still agrees with upstream
// looks like "no change" and is dropped — the file erases itself over two runs.
async function collectEntries() {
  const [{ default: registry }, { getCapabilitiesForModel, setCatalogSource }] = await Promise.all([
    import("open-sse/providers/registry/index.js"),
    import("open-sse/providers/capabilities.js"),
  ]);
  setCatalogSource(null);

  const entries = [];
  for (const provider of registry) {
    for (const model of provider.models || []) {
      entries.push({
        provider: provider.id,
        model: model.id,
        upstreamModelId: model.upstreamModelId || model.id,
        contextLength: model.contextLength,
        current: getCapabilitiesForModel(provider.id, model.id),
      });
    }
  }
  return entries;
}

// Run one sync. Returns a summary, or null when it could not complete.
export function syncModelCatalog() {
  if (state.running || stopped) return Promise.resolve(null);
  state.running = true;
  const controller = new AbortController();
  syncController = controller;
  const task = runSync(controller.signal);
  activeSync = task;
  task.finally(() => {
    if (activeSync === task) { activeSync = null; syncController = null; }
  }).catch(() => {});
  return task;
}

async function runSync(signal) {
  try {
    const headers = { accept: "application/json" };
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]);
    const response = await fetch(CATALOG_URL, { headers, signal: requestSignal });

    let result;
    if (response.status === 304) {
      throw new Error("Pricing refresh requires a complete catalog response");
    } else if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    } else {
      // ~23ms to parse, once a day, on a server that is otherwise idle at this
      // point — not worth a worker thread.
      const bytes = await readModelsDevResponse(response, requestSignal);
      const catalog = parseModelsDevCatalog(bytes);
      const etag = response.headers.get("etag") || null;
      const entries = await collectEntries();
      signal.throwIfAborted();
      const { models, providers } = build(catalog, entries);
      const serialized = JSON.stringify({ v: CATALOG_VERSION, etag, syncedAt: Date.now(), models, providers });

      const pricing = getPricingStore().publish(catalog, {
        url: CATALOG_URL, verifiedAtUtc: new Date().toISOString(),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        retrieval: "validated-https-response",
      });

      writeAtomic(CATALOG_FILE, serialized);
      writeAtomic(CATALOG_RAW_FILE, JSON.stringify(slim(catalog)));

      state.etag = etag;
      state.fileVersion = CATALOG_VERSION;
      invalidateCatalog();
      result = {
        status: "updated",
        etag,
        bytes: Buffer.byteLength(serialized),
        models: Object.keys(models).length,
        providers: Object.keys(providers).length,
        pricingReferences: Object.values(pricing.references).reduce((count, rows) => count + Object.keys(rows).length, 0),
      };
      console.log(`[modelCatalog] ${result.models} models, ${result.providers} providers, ${(result.bytes / 1024).toFixed(1)}KB`);
    }

    state.lastSync = Date.now();
    state.lastError = null;
    state.lastResult = result;
    return result;
  } catch (error) {
    state.lastError = error?.message || String(error);
    console.log(`[modelCatalog] sync failed: ${state.lastError}`);
    return null;
  } finally {
    // collectEntries() detaches the reader; put it back whatever happened.
    await installCatalogSource().catch(() => {});
    state.running = false;
  }
}

// The etag lives in the file we wrote, so a restart can resume from it instead
// of re-downloading 4.3MB to be told nothing changed.
function restoreEtag() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
    state.etag = parsed.etag || null;
    state.fileVersion = parsed.v || 1;
    state.lastSync = fs.statSync(CATALOG_FILE).mtimeMs;
  } catch {
    state.etag = null;
    state.fileVersion = null;
  }
}

// Schedule the recurring sync. Disable entirely with MODEL_CATALOG_SYNC=off.
export function startModelCatalogSync() {
  // Restored observations must remain readable even when outbound sync is off.
  getPricingStore();
  if (timer || stopped) return;
  if (String(process.env.MODEL_CATALOG_SYNC || "").toLowerCase() === "off") return;
  restoreEtag();

  const schedule = (delay) => {
    if (stopped) return;
    timer = setTimeout(async () => {
      timer = null;
      const result = await syncModelCatalog();
      schedule(result ? SYNC_INTERVAL_MS : RETRY_DELAY_MS);
    }, delay);
    timer.unref?.();
  };
  schedule(STARTUP_DELAY_MS);
}

export async function stopModelCatalogSync() {
  stopped = true;
  clearTimeout(timer);
  timer = null;
  syncController?.abort();
  await activeSync;
}
