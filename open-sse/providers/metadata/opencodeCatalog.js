import { isFreeOpenCodeModel } from "../../config/opencodeCatalog.js";
import { openCodeGoCatalog, openCodeZenCatalog } from "./opencodeCatalogData.js";

const catalogDocs = "https://opencode.ai/docs/console/models";
const goDocs = "https://opencode.ai/v2/docs/console/go/";
const unknownCashRates = { input: null, output: null, cached: null, reasoning: null, cache_creation: null, cache_creation_1h: null, cache_write_30m: null, cache_write_12h: null };

// The last known public catalog adds live rows without erasing historical
// metadata. Go allowance rates are separate from the monetary usage ledger.
export function applyOpenCodeCatalog(metadata) {
  for (const [product, snapshot] of [["zen", openCodeZenCatalog], ["go", openCodeGoCatalog]]) {
    for (const model of snapshot.models) {
      const free = isFreeOpenCodeModel(model);
      const provider = product === "go" ? "opencode-go" : free ? "opencode" : "opencode-zen";
      const table = metadata[provider] ||= {};
      const previous = table[model.id] || {};
      const quote = model.pricing;
      const goPlan = product === "go";
      const keepVerifiedQuote = goPlan && previous.billing?.invoiceVerified === true;
      const pricing = keepVerifiedQuote ? previous.pricing : goPlan ? unknownCashRates : quote;
      // The old routes still use the legacy Zen transport. Retain the reviewed
      // limits on those routes when the new endpoint publishes different bounds.
      const legacyRoute = provider !== "opencode-zen" && previous.capabilities;
      table[model.id] = {
        ...previous,
        description: model.description || previous.description,
        capabilities: legacyRoute ? previous.capabilities : { ...previous.capabilities, ...model.capabilities },
        pricing,
        sources: [...new Set([snapshot.source.url, goPlan ? goDocs : catalogDocs, ...(previous.sources || [])])],
        billing: {
          ...previous.billing,
          kind: goPlan ? "subscription-reference" : free ? previous.billing?.kind || "free" : "api",
          currency: "USD", unit: previous.billing?.unit || (goPlan ? "per_1000000_tokens" : "1M tokens"),
          ...(goPlan && {
            invoiceVerified: keepVerifiedQuote,
            referencePricing: previous.billing?.referencePricing || quote,
            catalogReferencePricing: quote,
            referenceUnit: "USD_quota_reference_per_1000000_tokens",
            ...(!keepVerifiedQuote && { unverifiedPriceFields: Object.keys(unknownCashRates) }),
          }),
          ...(model.audioPricing && { audioReferencePricing: model.audioPricing }),
          note: goPlan ? "Published Go rates measure plan allowance. Extra Usage and cash charges depend on the account."
            : free ? "The provider lists zero input and output rates for this limited-availability free model."
              : "Published Zen API text token rates. A connected account determines access and applicable charges.",
        },
        limits: {
          ...previous.limits,
          ...(!legacyRoute && {
            scope: "publisher-hosted-catalog", catalogProvider: product === "go" ? "opencode-go" : "opencode",
            catalogModelId: model.id, catalogAsOf: snapshot.source.verifiedAtUtc.slice(0, 10), unverifiedCapabilityFields: [],
          }),
          authenticatedRouteVerified: false,
          publisherCatalogCapabilities: model.capabilities,
          ...(model.canonicalId && { canonicalModelId: model.canonicalId }),
        },
        provenance: { ...previous.provenance, catalog: snapshot.source },
      };
    }
  }
}
