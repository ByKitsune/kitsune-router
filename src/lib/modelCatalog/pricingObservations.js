// Server-only, append-only publication of validated public pricing observations.
// Each worker writes an independent immutable file; another worker cannot lose
// its observation through a read/modify/write race on a shared manifest.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parsePricingTimestamp } from "../../../open-sse/config/timeOfUsePricing.js";
import {
  createModelsDevPricingObservation, validateModelsDevPricingObservation,
  setModelsDevPricingObservationSource,
} from "../../../open-sse/providers/metadata/modelsDevPricing.js";

const FILE_NAME = /^\d{1,16}-[a-f\d]{64}\.json$/;
const MAX_OBSERVATION_BYTES = 8 * 1024 * 1024;
const MAX_LOADED_OBSERVATIONS = 64;
const MAX_CATALOG_BYTES = 32 * 1024 * 1024;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function createPricingObservationStore(directory) {
  const folder = path.resolve(directory);
  let cachedStamp = null;
  let history = [];
  let loaded = new Map();
  let names = [];
  let cachedSelection = null;

  function directoryStat() {
    const stat = fs.lstatSync(folder, { bigint: true });
    if (!stat.isDirectory()) throw new Error("Pricing observations must use a real directory");
    return stat;
  }

  function prepare() {
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    directoryStat();
    if (process.platform !== "win32") fs.chmodSync(folder, 0o700);
  }

  function read(options = {}) {
    let stat;
    try { stat = directoryStat(); }
    catch (error) {
      cachedStamp = null; history = []; loaded = new Map();
      if (error.code === "ENOENT") return history;
      throw error;
    }
    const stamp = `${stat.dev}:${stat.ino}:${stat.mtimeNs}:${stat.ctimeNs}`;
    if (stamp !== cachedStamp) {
      names = fs.readdirSync(folder).filter(name => FILE_NAME.test(name))
        .sort((a, b) => Number(b.split("-")[0]) - Number(a.split("-")[0]) || a.localeCompare(b));
    }
    let selected = names.slice(0, MAX_LOADED_OBSERVATIONS);
    if (options.timestamp != null) {
      const at = parsePricingTimestamp(options.timestamp)?.getTime();
      if (!Number.isFinite(at)) throw new Error("Invalid observation lookup timestamp");
      // Index all retained observations, then load the actual predecessor for
      // this request. A memory bound must never revive an older bundled rate.
      const match = names.find(name => Number(name.split("-")[0]) <= at);
      const instant = match?.split("-")[0];
      selected = instant ? names.filter(name => name.split("-")[0] === instant) : [];
    }
    const selection = selected.join(";");
    if (stamp === cachedStamp && selection === cachedSelection) return history;
    const next = new Map();
    for (const name of selected) {
      if (loaded.has(name)) { next.set(name, loaded.get(name)); continue; }
      const filename = path.join(folder, name);
      // NOFOLLOW plus the link count check also protects against a substituted
      // symlink/hardlink between directory listing and opening the file.
      const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      try {
        const file = fs.fstatSync(fd);
        if (!file.isFile() || file.nlink !== 1 || file.size > MAX_OBSERVATION_BYTES) throw new Error("Invalid pricing observation file");
        const bytes = fs.readFileSync(fd);
        const hash = name.slice(name.indexOf("-") + 1, -5);
        if (digest(bytes) !== hash) throw new Error("Pricing observation file checksum mismatch");
        const observation = validateModelsDevPricingObservation(JSON.parse(bytes.toString("utf8")));
        if (Date.parse(observation.source.verifiedAtUtc) !== Number(name.split("-")[0])) throw new Error("Pricing observation timestamp mismatch");
        next.set(name, observation);
      } finally { fs.closeSync(fd); }
    }
    history = Object.freeze([...next.values()]);
    loaded = next;
    cachedStamp = stamp;
    cachedSelection = selection;
    return history;
  }

  function publish(catalog, source) {
    const observation = validateModelsDevPricingObservation(createModelsDevPricingObservation(catalog, source));
    const bytes = Buffer.from(JSON.stringify(observation));
    if (bytes.byteLength > MAX_OBSERVATION_BYTES) throw new Error("Pricing observation is too large");
    prepare();
    const name = `${Date.parse(observation.source.verifiedAtUtc)}-${digest(bytes)}.json`;
    const destination = path.join(folder, name);
    const temporary = path.join(folder, `.${randomUUID()}.tmp`);
    let fd;
    try {
      fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      // An identical publication is idempotent. Unique content-addressed names
      // preserve other workers' complete observations rather than merging rows.
      fs.renameSync(temporary, destination);
      cachedStamp = null;
      return observation;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }

  return { read, publish, directory: folder };
}

/** Reject empty/truncated/wrong-shaped responses before replacing any prices. */
export function parseModelsDevCatalog(bytes) {
  const catalog = JSON.parse(bytes.toString("utf8"));
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) throw new Error("Invalid models.dev catalog");
  let models = 0;
  for (const [provider, row] of Object.entries(catalog)) {
    if (!row || typeof row !== "object" || !row.models || typeof row.models !== "object" || Array.isArray(row.models)
      || (row.id !== undefined && row.id !== provider)) throw new Error("Invalid models.dev provider record");
    for (const [id, model] of Object.entries(row.models)) {
      if (!model || typeof model !== "object" || Array.isArray(model) || (model.id !== undefined && model.id !== id)) throw new Error("Invalid models.dev model record");
      if (model.modalities !== undefined) {
        if (!model.modalities || typeof model.modalities !== "object" || Array.isArray(model.modalities)) throw new Error("Invalid models.dev modalities");
        for (const direction of ["input", "output"]) {
          const values = model.modalities[direction];
          if (values !== undefined && (!Array.isArray(values) || values.some(value => typeof value !== "string"))) throw new Error("Invalid models.dev modalities");
        }
      }
      models++;
    }
  }
  if (!models) throw new Error("Empty models.dev catalog");
  return catalog;
}

/** Read the full HTTPS response with an explicit size cap before hashing it. */
export async function readModelsDevResponse(response, signal) {
  const announced = Number(response.headers.get("content-length"));
  if (announced > MAX_CATALOG_BYTES) throw new Error("models.dev response is too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("models.dev response has no catalog body");
  const chunks = [];
  let size = 0;
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(signal.reason ?? new DOMException("Aborted", "AbortError"));
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CATALOG_BYTES) throw new Error("models.dev response is too large");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    // Cancellation of a custom transport is allowed to stall too; do not make
    // caller abort or shutdown wait for its cleanup promise.
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

export function installPricingObservationStore(directory) {
  const store = createPricingObservationStore(directory);
  setModelsDevPricingObservationSource(store.read);
  return store;
}
