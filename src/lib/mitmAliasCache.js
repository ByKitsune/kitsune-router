// JSON cache for mitmAlias — read by standalone MITM server (no SQLite native binding).
// Source of truth = SQLite kv['mitmAlias']. JSON is a read-replica synced on app start
// and after every UI write.
import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { getDbImportGeneration } from "./db/helpers/importGeneration.js";
import { DATA_DIR } from "./dataDir.js";

const CACHE_FILE = path.join(DATA_DIR, "mitm", "aliases.json");

function writeAtomic(data) {
  const dir = path.dirname(CACHE_FILE);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${CACHE_FILE}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { flag: "wx", mode: 0o600 });
  try { fs.renameSync(tmp, CACHE_FILE); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}

// Sync entire mitmAlias map from DB → JSON file
export async function syncToJson({ strict = false } = {}) {
  try {
    const { getMitmAlias } = await import("@/lib/db/repos/aliasRepo.js");
    for (;;) {
      const generation = getDbImportGeneration();
      const all = await getMitmAlias();
      // An older startup/UI sync must not overwrite the imported replica.
      if (generation !== getDbImportGeneration()) continue;
      writeAtomic(all || {});
      return;
    }
  } catch (e) {
    if (strict) throw e;
    console.log("[mitmAliasCache] sync failed:", e.message);
  }
}

// Update cache for a single tool after UI saves to DB
export function writeAliasForTool(tool, mappings) {
  try {
    let current = {};
    if (fs.existsSync(CACHE_FILE)) {
      try { current = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch { /* corrupted → reset */ }
    }
    current[tool] = mappings || {};
    writeAtomic(current);
  } catch (e) {
    console.log("[mitmAliasCache] write failed:", e.message);
  }
}
