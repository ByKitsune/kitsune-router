import { getAdapter } from "./db/driver.js";
import { getScopedCache } from "./db/helpers/scopedCache.js";
import { CONFIG_SCOPES } from "./db/helpers/cacheRevisions.js";

export async function getCachedModelsResponse(load, { access = "public", params = null, dataset = "v1-models" } = {}) {
  const db = await getAdapter();
  return getScopedCache(db, "modelsResponse", { maxEntries: 16, maxBytes: 16 * 1024 * 1024, ttlMs: 30_000 })
    .get([dataset, access, params], CONFIG_SCOPES, load);
}
