import {
  ANTIGRAVITY_ARGON_CONTEXT_WINDOW,
  ANTIGRAVITY_ARGON_MODELS,
  ANTIGRAVITY_MAX_OUTPUT_TOKENS,
} from "../../config/antigravity.js";

const sources = [
  "https://antigravity.google/docs/models",
  "https://antigravity.google/docs/changelog.md",
  "https://antigravity.google/blog/gemini-4-argon-in-google-antigravity",
  "https://ai.google.dev/gemini-api/docs/models/gemini-4-argon",
  "https://github.com/decolua/9router/pull/4934",
];

export default {
  antigravity: {
    ...Object.fromEntries(ANTIGRAVITY_ARGON_MODELS.map(({ id }) => [id, {
    description: "Gemini 4 Argon through the Antigravity native CLI surface. Requires an eligible paid Google AI Pro, Ultra or Enterprise account.",
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
    sources: [...sources],
    billing: {
      currency: "USD",
      unit: "subscription",
      kind: "plan",
      note: "Antigravity account quota is not a published per-token tariff. Public Gemini API and Flash prices do not establish this route's charges; explicit operator overrides remain available.",
      unverifiedPriceFields: ["input", "output", "cached", "reasoning", "cache_creation"],
    },
    limits: {
      scope: "antigravity-native-cli-gateway",
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
    // Announced removal is metadata, not evidence that these routes are gone now.
    ...Object.fromEntries([
      "claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b-medium",
    ].map(id => [id, {
      sources: ["https://antigravity.google/docs/models.md"],
      limits: {
        scope: "antigravity-native-cli-gateway",
        lifecycle: {
          status: "scheduled-retirement",
          retirementDate: "2026-11-02",
          dateMeaning: "scheduled-shutdown",
          source: "https://antigravity.google/docs/models.md",
          asOf: "2026-10-20",
        },
      },
    }])),
  },
};
