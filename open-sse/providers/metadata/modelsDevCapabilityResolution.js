import { canonicalizeProviderId, getDeclaredUpstreamModelId } from "../identity.js";
import { MODELS_DEV_CAPABILITY_REFERENCES, MODELS_DEV_CAPABILITY_SOURCE } from "./modelsDevCapabilities.js";

const key = (provider, model) => `${provider}\0${model}`;
const references = new Map();
for (const [provider, model, product, sourceModel, capabilities] of MODELS_DEV_CAPABILITY_REFERENCES) {
  const identity = key(provider, model);
  if (references.has(identity)) throw new Error(`Duplicate capability reference: ${provider}/${model}`);
  references.set(identity, { provider, model, product, sourceModel, capabilities });
}

export function getModelsDevCapabilityReference(provider, model) {
  if (!provider || typeof model !== "string") return null;
  const canonical = canonicalizeProviderId(provider);
  const exact = references.get(key(canonical, model));
  if (exact) return exact;
  // Only declared registry aliases may share a catalog identity. In particular,
  // never strip a namespace, free suffix, product qualifier or regional suffix.
  const upstream = getDeclaredUpstreamModelId(canonical, model);
  return upstream !== model ? references.get(key(canonical, upstream)) || null : null;
}

/** Fill family guesses from an exact product while respecting stronger facts. */
export function hasPrimaryCapabilityAuthority(reviewed, field) {
  if (!Object.hasOwn(reviewed?.capabilities || {}, field)) return false;
  const fieldSource = reviewed?.limits?.fieldSources?.[field];
  if (typeof fieldSource === "string" && !/^https:\/\/models\.dev(?:\/|$)/.test(fieldSource)) return true;
  // Billing reviews append their URLs to the shared sources list. That does
  // not turn previously imported catalog capabilities into primary evidence.
  if (reviewed?.limits?.scope === "exact-route-modelsdev-catalog") return false;
  return Boolean(reviewed?.sources?.some(url => !/^https:\/\/models\.dev(?:\/|$)/.test(url)));
}

export function applyExactCatalogCapabilities(base, provider, model, reviewed, providerOverride) {
  const reference = getModelsDevCapabilityReference(provider, model);
  if (!reference) return base;
  const unknown = new Set(reviewed?.limits?.unverifiedCapabilityFields || []);
  const result = { ...base };
  for (const [field, value] of Object.entries(reference.capabilities)) {
    if (unknown.has(field) || Object.hasOwn(providerOverride || {}, field)) continue;
    if (hasPrimaryCapabilityAuthority(reviewed, field)) continue;
    result[field] = value;
  }
  return result;
}

export function getPublicCapabilityCatalogReference(provider, model) {
  const reference = getModelsDevCapabilityReference(provider, model);
  return reference ? {
    source: MODELS_DEV_CAPABILITY_SOURCE.sourceUrl,
    repository: MODELS_DEV_CAPABILITY_SOURCE.repository,
    asOf: MODELS_DEV_CAPABILITY_SOURCE.retrievedAtUtc.slice(0, 10),
    product: reference.product,
    model: reference.sourceModel,
    kind: "exact-product-catalog-reference",
    authenticatedRouteVerified: false,
    note: "Catalog model facts do not establish account access or live transport acceptance. Primary-source facts and explicit route restrictions remain authoritative.",
  } : null;
}

// Presentation provenance is separate from admission booleans. Keeping legacy
// tool compatibility must not make an assumed/default flag look independently
// established in model discovery or the dashboard.
export function getCapabilityVerification(provider, model, capabilities, reviewed, declared) {
  const reference = getModelsDevCapabilityReference(provider, model);
  const result = {};
  for (const field of ["vision", "pdf", "audioInput", "videoInput", "imageOutput", "audioOutput", "tools", "reasoning", "search", "contextWindow", "maxInput", "maxOutput", "structuredOutput", "temperature"]) {
    const value = capabilities?.[field];
    let kind = "unknown";
    if (value !== null && value !== undefined) {
      if (Object.hasOwn(declared || {}, field) && declared[field] === value) kind = "operator-declared";
      else if (hasPrimaryCapabilityAuthority(reviewed, field) && reviewed.capabilities[field] === value) {
        kind = reviewed.limits?.fieldSources?.[field] ? "primary-field-reference" : "primary-reference";
      } else if (reference?.capabilities[field] === value) kind = "catalog-reference";
      else kind = "inferred";
    }
    result[field] = { kind, authenticatedRouteVerified: false };
  }
  return result;
}
