import { getDbImportGeneration } from "./db/helpers/importGeneration.js";

const CACHE_TTL_MS = 30_000;
let state = null;

function currentState() {
  const generation = getDbImportGeneration();
  if (!state || state.generation !== generation) {
    state = { generation, data: null, expiresAt: 0, pending: null };
  }
  return state;
}

export async function getCachedModelsResponse(load) {
  for (;;) {
    const snapshot = currentState();
    if (snapshot.data && Date.now() < snapshot.expiresAt) return snapshot.data;
    const pending = snapshot.pending ||= load();
    let data;
    try {
      data = await pending;
    } catch (error) {
      if (snapshot !== currentState()) continue;
      throw error;
    } finally {
      if (snapshot.pending === pending) snapshot.pending = null;
    }
    // A build may span an import (including a slow upstream catalog request).
    if (snapshot !== currentState()) continue;
    snapshot.data = data;
    snapshot.expiresAt = Date.now() + CACHE_TTL_MS;
    return data;
  }
}
