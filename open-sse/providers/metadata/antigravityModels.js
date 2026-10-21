import {
  ANTIGRAVITY_ARGON_CONTEXT_WINDOW,
  ANTIGRAVITY_ARGON_MODELS,
  ANTIGRAVITY_MAX_OUTPUT_TOKENS,
} from "../../config/antigravity.js";

// Public product eligibility is not an authenticated catalog or an account policy.
// Keep explicit unknowns: neither positive quota nor a 404 establishes a plan.
const asOf = "2026-10-21";
const modelsSource = "https://antigravity.google/docs/models.md";
const plansSource = "https://antigravity.google/docs/plans.md";
const enterpriseSource = "https://antigravity.google/docs/enterprise.md";
const sourceEvidence = [
  {
    url: modelsSource,
    finalUrl: modelsSource,
    status: 200,
    sha256: "e99908d9be1aeff50e5ad9fa37ce01633e147adad8b56fbbb83632de5f8bcf3a",
    bytes: 2718,
    retrievedAt: "2026-10-21T10:48:03.178598+00:00",
  },
  {
    url: plansSource,
    finalUrl: plansSource,
    status: 200,
    sha256: "b3962a073ffe885bfb11639013c6f11c339b247b105ebeff1f72ad2bf6ae8a2c",
    bytes: 2829,
    retrievedAt: "2026-10-21T10:48:03.404421+00:00",
  },
  {
    url: enterpriseSource,
    finalUrl: enterpriseSource,
    status: 200,
    sha256: "4f1c3bafe8d8e2ed842ab5a02a3aef00fdb7a2672653da649803d7b6e9ac5b41",
    bytes: 22568,
    retrievedAt: "2026-10-21T10:48:03.444071+00:00",
  },
];
const unknownPlans = {
  free: "unknown", googleAiPlus: "unknown", googleAiProTrial: "unknown",
  googleAiProNonTrial: "unknown", googleAiUltra: "unknown", enterprise: "unknown",
};
const paidNonTrialPlans = {
  free: "unavailable", googleAiPlus: "unavailable", googleAiProTrial: "unavailable",
  googleAiProNonTrial: "available", googleAiUltra: "available", enterprise: "available",
};
const enterpriseOnlyPlans = {
  free: "unavailable", googleAiPlus: "unavailable", googleAiProTrial: "unavailable",
  googleAiProNonTrial: "unavailable", googleAiUltra: "unavailable", enterprise: "available",
};
const productSurfaces = {
  app: "available", cli: "available", ideExtensions: "available", standaloneIde: "unknown",
};
const appCliExtensionsOnly = { ...productSurfaces, standaloneIde: "unavailable" };
const unknownSurfaces = {
  app: "unknown", cli: "unknown", ideExtensions: "unknown", standaloneIde: "unknown",
};
const enterpriseAccess = {
  accessModes: ["gemini-enterprise-standard-seat", "gemini-enterprise-plus-seat", "cloud-project-api"],
  seatLicenseRequiresAssignment: true,
  cloudProjectApiRequiresBilling: true,
  requiresCloudProject: true,
  requiredIamRole: "roles/discoveryengine.agentspaceUser",
  aiDeveloperToolsAdminEnablement: "may-be-required",
  adminEnablementScope: "project-and-region",
  surfaces: appCliExtensionsOnly,
  gatewayImplemented: false,
  note: "Official Enterprise provisioning and CLI/API identifiers are reference facts, not wire mappings for this gateway's consumer OAuth Cloud Code bridge. Enterprise authentication, license/project/region discovery and inference are not implemented here.",
};
const firstPartyEnterprise = {
  ...enterpriseAccess, apiModelIdKind: "literal", requiresThirdPartyModelOptIn: false,
};
const partnerEnterprise = {
  ...enterpriseAccess,
  apiModelIdKind: "thinking-level-template",
  requiresThirdPartyModelOptIn: true,
  thinkingLevels: ["low", "medium", "high", "max"],
  defaultThinkingLevel: "medium",
};
// Supplied production evidence, not a new probe. All 28 advertised chat IDs
// were exercised on this revision: 8 HTTP 200, 20 HTTP 404; sampled plans unknown.
// Do not publish connection identities, credentials or deployment URLs.
const gatewaySample = {
  asOf,
  scope: "sampled-gateway-route-and-account-selection",
  sourceRevision: "04c0bf77c3d0b287a438566e504d72b81e6e081b",
  evidenceFile: "model-acceptance-summary.json",
  evidenceSha256: "3fed9fed9601550b7ff0b1628e4c698d0d06b4b4ebf1bb0637346661bb87b154",
  accountPlan: "unknown",
  provesRetirement: false,
};
const rejectedSample = { ...gatewaySample, httpStatus: 404, cause: "unresolved" };
const workingSample = { ...gatewaySample, httpStatus: 200 };
const availabilityBase = {
  asOf,
  scope: "official-antigravity-product-plan-matrix",
  enforcement: "metadata-only",
  accountEligibility: "unknown",
  missingPlan: "unknown",
  inferPlanFromQuota: false,
  role: "core-reasoning",
  coreChatSelectable: true,
  surfaces: productSurfaces,
  sourceEvidence,
};
const listedLifecycle = { status: "listed", asOf, source: modelsSource };
const scheduledLifecycle = {
  status: "scheduled-retirement", retirementDate: "2026-11-02",
  dateMeaning: "scheduled-shutdown", asOf, source: modelsSource,
};
const families = [
  {
    ids: ANTIGRAVITY_ARGON_MODELS.map(({ id }) => id),
    availability: {
      displayName: "Gemini 4 Argon", plans: paidNonTrialPlans, surfaces: appCliExtensionsOnly,
      enterprise: { ...firstPartyEnterprise, apiModelId: "gemini-4-argon" }, gatewayObservation: rejectedSample,
    },
  },
  {
    ids: ["gemini-3.8-flash-high", "gemini-3.8-flash-medium", "gemini-3.8-flash-low", "gemini-3.8-flash"],
    availability: {
      displayName: "Gemini 3.8 Flash",
      plans: {
        free: "available", googleAiPlus: "available", googleAiProTrial: "available",
        googleAiProNonTrial: "available", googleAiUltra: "available", enterprise: "available",
      },
      enterprise: { ...firstPartyEnterprise, apiModelId: "gemini-3.8-flash" }, gatewayObservation: workingSample,
    },
  },
  {
    ids: ["gemini-3.7-flash-high", "gemini-3.7-flash-medium", "gemini-3.7-flash-low"],
    availability: {
      displayName: "Gemini 3.7 Flash", plans: enterpriseOnlyPlans, surfaces: appCliExtensionsOnly,
      enterprise: { ...firstPartyEnterprise, apiModelId: "gemini-3.7-flash" }, gatewayObservation: rejectedSample,
    },
  },
  {
    ids: ["gemini-3.6-flash-high", "gemini-3.6-flash-medium", "gemini-3.6-flash-low"],
    availability: {
      displayName: "Gemini 3.6 Flash", plans: enterpriseOnlyPlans, surfaces: appCliExtensionsOnly,
      enterprise: { ...firstPartyEnterprise, apiModelId: "gemini-3.6-flash" }, gatewayObservation: rejectedSample,
    },
  },
  {
    ids: ["gemini-pro-agent", "gemini-3.1-pro-low"],
    availability: {
      displayName: "Gemini 3.1 Pro", plans: enterpriseOnlyPlans, surfaces: appCliExtensionsOnly,
      enterprise: { ...firstPartyEnterprise, apiModelId: "gemini-3.1-pro-preview" }, gatewayObservation: rejectedSample,
    },
  },
  ...["sonnet", "opus"].map(family => ({
    ids: [`claude-${family}-5-5-high`, `claude-${family}-5-5-medium`, `claude-${family}-5-5-low`, `claude-${family}-5-5`],
    availability: {
      displayName: `Claude ${family === "sonnet" ? "Sonnet" : "Opus"} 5.5 (thinking)`, plans: paidNonTrialPlans,
      enterprise: { ...partnerEnterprise, apiModelId: `claude-${family}-5-5-<level>` }, gatewayObservation: rejectedSample,
    },
  })),
  {
    ids: ["claude-sonnet-4-6", "claude-opus-4-6-thinking"],
    lifecycle: scheduledLifecycle,
    availability: {
      plans: {
        free: "available", googleAiPlus: "available", googleAiProTrial: "available",
        googleAiProNonTrial: "available", googleAiUltra: "unavailable", enterprise: "unavailable",
      },
      gatewayObservation: workingSample,
    },
  },
  {
    ids: ["gpt-oss-120b-medium"],
    lifecycle: scheduledLifecycle,
    availability: {
      displayName: "GPT-OSS-120b",
      plans: {
        free: "available", googleAiPlus: "available", googleAiProTrial: "available",
        googleAiProNonTrial: "available", googleAiUltra: "available", enterprise: "unavailable",
      },
      gatewayObservation: workingSample,
    },
  },
  {
    ids: ["gemini-3-flash"],
    lifecycle: { status: "unknown", asOf, note: "Omission from the current public plan table is not evidence of retirement; this legacy gateway ID returned inference in the supplied sample." },
    availability: {
      displayName: "Gemini 3 Flash", plans: unknownPlans, surfaces: unknownSurfaces,
      role: "legacy-chat", coreChatSelectable: null, gatewayObservation: workingSample,
    },
  },
];
const availabilityModels = Object.fromEntries(families.flatMap(({ ids, availability, lifecycle }) => ids.map(id => [id, {
  sources: [modelsSource, plansSource, enterpriseSource],
  limits: {
    scope: "antigravity-cloud-code-gateway",
    lifecycle: lifecycle || listedLifecycle,
    availability: { ...availabilityBase, ...availability },
  },
}])));

const argonSources = [
  modelsSource,
  plansSource,
  enterpriseSource,
  "https://antigravity.google/docs/models",
  "https://antigravity.google/docs/changelog.md",
  "https://antigravity.google/blog/gemini-4-argon-in-google-antigravity",
  "https://ai.google.dev/gemini-api/docs/models/gemini-4-argon",
  "https://github.com/decolua/9router/pull/4934",
];

export default {
  antigravity: {
    ...availabilityModels,
    ...Object.fromEntries(ANTIGRAVITY_ARGON_MODELS.map(({ id }) => [id, {
      ...availabilityModels[id],
      description: "Gemini 4 Argon in Antigravity App, CLI and IDE extensions, not the standalone IDE. Eligible plans are non-trial Google AI Pro, Ultra and Gemini Enterprise; product eligibility does not verify this gateway's route or account entitlement.",
      capabilities: {
        contextWindow: ANTIGRAVITY_ARGON_CONTEXT_WINDOW,
        maxInput: null,
        maxOutput: ANTIGRAVITY_MAX_OUTPUT_TOKENS,
        vision: true,
        reasoning: true,
        tools: true,
        thinkingFormat: "gemini-level",
        thinkingCanDisable: false,
        thinkingEfforts: ["low", "medium", "high"],
      },
      pricing: { input: null, output: null, cached: null, reasoning: null, cache_creation: null },
      sources: [...argonSources],
      billing: {
        currency: "USD",
        unit: "subscription",
        kind: "plan",
        note: "Antigravity account quota is not a published per-token tariff. Public Gemini API and Flash prices do not establish this route's charges; explicit operator overrides remain available.",
        unverifiedPriceFields: ["input", "output", "cached", "reasoning", "cache_creation"],
      },
      limits: {
        ...availabilityModels[id].limits,
        authenticatedRouteVerified: false,
        gatewayMaxOutput: ANTIGRAVITY_MAX_OUTPUT_TOKENS,
        contextWindowStatus: "Published unified Argon input, thinking and output window; not an independently documented input ceiling.",
        maxOutputScope: "Effective gateway transport ceiling, not proof of an account's native output allowance.",
        continuationImplemented: false,
        apiDefaultThinkingLevel: "medium",
        unverifiedCapabilityFields: ["maxInput"],
        note: "App, CLI and IDE extensions are separate from Antigravity IDE. Client identity does not establish model entitlement; native tier availability remains account-specific.",
      },
    }])),
    "gemini-3.1-flash-image": {
      description: "Nano Banana 2 is used by Antigravity's generative image tool, not as a selectable core reasoning model. The reasoning-model plan table does not establish image-tool plan eligibility.",
      sources: [modelsSource, "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image"],
      capabilities: { imageOutput: true },
      limits: {
        kind: "image",
        scope: "antigravity-cloud-code-gateway",
        availability: {
          ...availabilityBase,
          role: "generative-image-tool",
          coreChatSelectable: false,
          customizable: false,
          displayName: "Nano Banana 2",
          plans: unknownPlans,
          surfaces: unknownSurfaces,
          sourceEvidence: [sourceEvidence[0], {
            url: "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image",
            finalUrl: "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image",
            status: 200,
            sha256: "fa9fc4110ea04cadeb75d29bad31436d2a6b4da2ad2766fb2e9df812735e949e",
            bytes: 107824,
            retrievedAt: "2026-10-21T10:53:59.182262+00:00",
          }],
        },
      },
    },
  },
};
