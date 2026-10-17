// Operator-declared model capabilities, read from the kv `customModels` scope.
//
// The dashboard lets an operator tick capabilities (vision, reasoning, ...) on a
// model they added by hand; that declaration is persisted on the model record.
// Both the /v1/models listing and the request-path modality strip need it, and
// the request path runs on every chat completion — so this module caches the
// whole scope in memory and only re-reads when the cache is invalidated or TTLs
// out.
//
// Match the request's provider and full native model ID. The same model name
// on different gateways (or chat/STT rows) must not share operator overrides.

import { getCustomModels } from "../../src/lib/db/repos/aliasRepo.js";
import { canonicalizeProviderId } from "./identity.js";
import { capabilitiesFromServiceKind } from "./capabilities.js";

/** How long a resolved snapshot stays fresh, in ms. */
const TTL_MS = 30_000;

/** @type {Map<string, object>} canonical provider/native model ID -> chat caps */
let cache = new Map();
let cacheAt = 0;
let inflight = null;

function keyFor(provider, model) {
  return JSON.stringify([canonicalizeProviderId(provider), model]);
}

async function load() {
  const models = await getCustomModels();
  const next = new Map();
  const imageModels = new Map();
  for (const record of models) {
    if (!record?.providerAlias || typeof record.id !== "string" || !record.id) continue;
    const kind = record.kind || record.type || "llm";
    if (kind !== "llm" && kind !== "imageToText") continue;
    const key = keyFor(record.providerAlias, record.id);
    const caps = { ...capabilitiesFromServiceKind(kind), ...(record.caps && typeof record.caps === "object" ? record.caps : {}) };
    if (Object.keys(caps).length) (kind === "llm" ? next : imageModels).set(key, caps);
  }
  for (const [key, caps] of imageModels) next.set(key, { ...caps, ...next.get(key) });
  cache = next;
  cacheAt = Date.now();
  return cache;
}

/** Drop the cache so the next read reflects a fresh write. */
export function invalidateDeclaredModelCaps() {
  cache = new Map();
  cacheAt = 0;
}

/**
 * Declared capabilities for one model, or undefined when the operator declared none.
 *
 * @param {string} provider - canonical provider ID or accepted alias
 * @param {string} model - bare model id, or "alias/id"
 * @returns {Promise<object|undefined>} the declared caps block, if any
 */
export async function getDeclaredModelCaps(provider, model) {
  if (!provider || typeof model !== "string" || !model) return undefined;

  const fresh = Date.now() - cacheAt < TTL_MS;
  if (!fresh) {
    // Collapse concurrent misses into one query.
    inflight ||= load().finally(() => { inflight = null; });
    try {
      await inflight;
    } catch {
      // A read failure must not break the request: fall through to the
      // static-table guess rather than surfacing an error here.
      return undefined;
    }
  }

  const exact = cache.get(keyFor(provider, model));
  if (exact) return exact;
  // Decorated routing inputs are a fallback only: "nvidia/nvidia/model"
  // may wrap the native "nvidia/model", whose namespace must stay intact.
  const slash = model.indexOf("/");
  if (slash > 0 && canonicalizeProviderId(model.slice(0, slash)) === canonicalizeProviderId(provider)) {
    return cache.get(keyFor(provider, model.slice(slash + 1)));
  }
  return undefined;
}
