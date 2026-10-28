/**
 * Reviewed core text metadata: primary facts plus exact models.dev cross-checks
 * originally reviewed 2026-10-17 and refreshed from primary sources 2026-10-21.
 * Standalone factual shard without resolver or network imports. Captured source
 * bodies, UTC timestamps and SHA-256: /tmp/opencode/zenrouter-client-pricing-refresh-20261021/core.
 * API specifications are not proof of OAuth account entitlement or route limits.
 * Missing values are UNKNOWN, not zero/free/unlimited. When integrating, honor
 * limits.unverifiedCapabilityFields and billing.unverifiedPriceFields instead of
 * resurrecting guessed fallback values (notably Grok output and cache writes).
 * Most Gemini pages publish input allowances; Argon documents a unified window.
 */

const openai = {
  "gpt-5.5-pro": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.5-pro",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Highest-accuracy GPT-5.5 tier for slower, precision-heavy reasoning and coding"
  },
  "gpt-5.4-pro": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.4-pro",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": false,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "More exact GPT-5.4 tier for demanding professional reasoning and agent tasks"
  },
  "gpt-5.2": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.2",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 128000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Reliable GPT generation for broad coding, writing, and tool-assisted product work"
  },
  "gpt-5.2-pro": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.2-pro",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 128000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": false,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Higher-accuracy GPT-5.2 variant for tougher reasoning and review workflows"
  },
  "gpt-5.1": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.1",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 128000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Sharper GPT-5 generation for coding, product work, and tool-assisted tasks"
  },
  "gpt-5": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 128000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Original GPT-5 workhorse for reasoning, coding, writing, and tool workflows"
  },
  "gpt-5-mini": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5-mini",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 128000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Small GPT-5 for responsive agents, coding help, and everyday automation"
  },
  "gpt-5-nano": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5-nano",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 128000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Tiny GPT-5 lane for routing, extraction, classification, and bulk jobs"
  },
  "gpt-5-pro": {
    "sources": [
      "https://models.dev/api.json",
      "https://developers.openai.com/api/docs/models/gpt-5-pro.md"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5-pro",
      "catalogAsOf": "2026-10-17",
      "supportedApiFormats": ["openai-responses"],
      "transportScope": "Native OpenAI API; GPT-5 Pro supports Responses, not Chat Completions."
    },
    "capabilities": {
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 272000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Higher-accuracy GPT-5 tier for tough analysis, coding reviews, and planning"
  },
  "gpt-4o": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-4o",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 128000,
      "maxOutput": 16384,
      "reasoning": false,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Omni-era GPT for multimodal chat, practical coding, and general assistants"
  },
  "gpt-4o-mini": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-4o-mini",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 128000,
      "maxOutput": 16384,
      "reasoning": false,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Small omni GPT for cheap multimodal assistance and production-scale traffic"
  },
  "gpt-4-turbo": {
    "sources": [
      "https://models.dev/api.json",
      "https://developers.openai.com/api/docs/models/gpt-4-turbo.md"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-4-turbo",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 128000,
      "maxOutput": 4096,
      "reasoning": false,
      "tools": true,
      "structuredOutput": false,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Older high-intelligence GPT-4 model with text and image input for general-purpose chat and analysis"
  },
  "gpt-4.1": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-4.1",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 1047576,
      "maxOutput": 32768,
      "reasoning": false,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Long-lived GPT workhorse for coding, instruction following, and production apps"
  },
  "gpt-4.1-mini": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-4.1-mini",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 1047576,
      "maxOutput": 32768,
      "reasoning": false,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Affordable GPT-4.1 lane for fast coding help and structured extraction"
  },
  "gpt-4.1-nano": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "gpt-4.1-nano",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 1047576,
      "maxOutput": 32768,
      "reasoning": false,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Tiny GPT-4.1 option for classification, routing, and very high-volume tasks"
  },
  "o3": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "o3",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 200000,
      "maxOutput": 100000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Deliberate o-series reasoner for hard math, coding, and multi-step analysis"
  },
  "o3-mini": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "o3-mini",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 200000,
      "maxOutput": 100000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": false,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Smaller o-series reasoner for economical coding, math, and planning tasks"
  },
  "o3-pro": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "o3-pro",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 200000,
      "maxOutput": 100000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "High-effort o3 tier for difficult technical reasoning and careful answers"
  },
  "o4-mini": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "o4-mini",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 200000,
      "maxOutput": 100000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Fast o-series model for compact reasoning, coding, and tool use"
  },
  "o1": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "o1",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 200000,
      "maxOutput": 100000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "O-series reasoning model for hard analysis, math, coding, and planning"
  },
  "o1-pro": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "openai",
      "catalogModelId": "o1-pro",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 200000,
      "maxOutput": 100000,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "O-series reasoning model for hard analysis, math, coding, and planning"
  },
  "gpt-5.3-codex": {
    "description": "Coding-optimized GPT model for repository edits, reviews, and agentic software work",
    "capabilities": {
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": false,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "low",
        "medium",
        "high",
        "xhigh"
      ]
    },
    "pricing": {
      "input": 1.75,
      "output": 14.0,
      "cached": 0.175
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.3-codex.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [],
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.3-codex",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "low",
        "medium",
        "high",
        "xhigh"
      ],
      "supportedApiFormats": [
        "openai-responses"
      ]
    }
  },
  "gpt-5.4": {
    "description": "Agent-ready GPT for coding and computer-use workflows at a lower cost",
    "capabilities": {
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": true,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh"
      ]
    },
    "pricing": {
      "input": 2.5,
      "output": 15.0,
      "cached": 0.25,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 5.0,
        "output": 22.5,
        "cached": 0.5
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.4.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "- For models with a 1.05M context window (GPT-5.4 and GPT-5.4 Pro), prompts with >272K input tokens are priced at 2x input and 1.5x output for the full session for standard, batch, and flex.",
        "- Regional processing (data residency) endpoints are charged a 10% uplift for GPT-5.4 and GPT-5.4 Pro.",
        "> 272K input tokens"
      ],
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.4",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh"
      ]
    }
  },
  "gpt-5.4-mini": {
    "description": "Strong small GPT for coding subagents, quick tool use, and high-volume work",
    "capabilities": {
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": true,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh"
      ]
    },
    "pricing": {
      "input": 0.75,
      "output": 4.5,
      "cached": 0.075
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.4-mini.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "- Regional processing (data residency) endpoints are charged a 10% uplift for GPT-5.4 Mini."
      ],
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.4-mini",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh"
      ]
    }
  },
  "gpt-5.4-nano": {
    "description": "Cheapest GPT-5.4 lane for simple routing, extraction, and bulk automation",
    "capabilities": {
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": true,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh"
      ]
    },
    "pricing": {
      "input": 0.2,
      "output": 1.25,
      "cached": 0.02
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.4-nano.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "- Regional processing (data residency) endpoints are charged a 10% uplift for GPT-5.4 nano."
      ],
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.4-nano",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh"
      ]
    }
  },
  "gpt-5.5": {
    "description": "Default frontier GPT for coding, computer use, research, and knowledge work",
    "capabilities": {
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": true,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh"
      ]
    },
    "pricing": {
      "input": 5.0,
      "output": 30.0,
      "cached": 0.5,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 10.0,
        "output": 45.0,
        "cached": 1.0
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.5.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "- For GPT-5.5, prompts with >272K input tokens are priced at 2x input and 1.5x output for the full session for standard, batch, and flex.",
        "- Regional processing (data residency) endpoints are charged a 10% uplift for GPT-5.5.",
        "> 272K input tokens"
      ],
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.5",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh"
      ]
    }
  },
  "gpt-5.6-cyber": {
    "capabilities": {
      "contextWindow": 400000,
      "maxInput": 272000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai"
    },
    "pricing": {
      "input": 12.5,
      "output": 75.0,
      "cached": 1.25,
      "cache_write_30m": 15.625,
      "cache_write_12h": 31.25,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": null,
        "output": null,
        "cached": null,
        "reasoning": null,
        "cache_write_30m": null,
        "cache_write_12h": null
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.6-cyber.md",
      "https://developers.openai.com/api/docs/pricing.md"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "The current price table publishes separate 30m/12h writes, and no long-context tariff. The model page mentions long-context multipliers despite a maximum input of 272K; do not extrapolate a usable long-context tier."
      ]
    },
    "limits": {
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "supportedApiFormats": [
        "openai-responses"
      ],
      "idKind": "approved-program-alias",
      "availability": "Requires separate Daybreak approval and provisioning."
    }
  },
  "gpt-5.6-luna": {
    "description": "Cost-efficient GPT-5.6 model for fast, high-volume workloads",
    "capabilities": {
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": true,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ]
    },
    "pricing": {
      "input": 0.2,
      "output": 1.2,
      "cached": 0.02,
      "cache_write_30m": 0.25,
      "cache_write_12h": 0.5,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 0.4,
        "output": 1.8,
        "cached": 0.04,
        "cache_write_30m": 0.5,
        "cache_write_12h": 1
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.6-luna.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "- Prompts with >272K input tokens are priced at 2x input and 1.5x output for the full request.",
        "- Cache writes are billed at 1.25x the uncached input token rate."
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.6-luna",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ]
    }
  },
  "gpt-5.6-sol": {
    "description": "Frontier GPT-5.6 model for complex professional work, coding, and agentic workflows",
    "capabilities": {
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": true,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ]
    },
    "pricing": {
      "input": 4.0,
      "output": 20.0,
      "cached": 0.4,
      "cache_write_30m": 5,
      "cache_write_12h": 10,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 8.0,
        "output": 30.0,
        "cached": 0.8,
        "cache_write_30m": 10,
        "cache_write_12h": 20
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.6-sol.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "- GPT-5.6 Sol costs $4 per million input tokens and $20 per million output tokens, a 20% reduction in input pricing and a 33% reduction in output pricing. GPT-5.6 Sol’s promotional pricing is available at least through November 21, 2026.",
        "- Prompts with >272K input tokens are priced at 2x input and 1.5x output for the full request.",
        "- Cache writes are billed at 1.25x the uncached input token rate."
      ],
      "promotionGuaranteedThrough": "2026-11-21"
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.6-sol",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ]
    }
  },
  "gpt-5.6-terra": {
    "description": "Balanced GPT-5.6 model for capable, cost-efficient everyday work",
    "capabilities": {
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": true,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ]
    },
    "pricing": {
      "input": 2.0,
      "output": 12.0,
      "cached": 0.2,
      "cache_write_30m": 2.5,
      "cache_write_12h": 5,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 4.0,
        "output": 18.0,
        "cached": 0.4,
        "cache_write_30m": 5,
        "cache_write_12h": 10
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.6-terra.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "- Prompts with >272K input tokens are priced at 2x input and 1.5x output for the full request.",
        "- Cache writes are billed at 1.25x the uncached input token rate."
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-5.6-terra",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ]
    }
  },
  "gpt-6-astra": {
    "description": "GPT-6 Astra is OpenAI's most capable model for complex reasoning, coding, computer use, research, and document creation.",
    "capabilities": {
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": false,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ]
    },
    "pricing": {
      "input": 10.0,
      "output": 50.0,
      "cached": 1.0,
      "cache_write_30m": 12.5,
      "cache_write_12h": 25,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 20.0,
        "output": 75.0,
        "cached": 2.0,
        "cache_write_30m": 25,
        "cache_write_12h": 50
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-6-astra.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "- Prompts with more than 272K input tokens are priced at 2x input and cache rates and 1.5x output for the full request.",
        "- Cache writes are billed at 1.25x the uncached input token rate.",
        "- Batch and Flex are priced at 50% of Standard rates. Fast mode is priced at 2x the applicable rates."
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-6-astra",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ]
    }
  },
  "gpt-6-luna": {
    "description": "OpenAI's most efficient model for focused, high-volume tasks",
    "capabilities": {
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": true,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "none", "low", "medium", "high", "xhigh", "max"
      ]
    },
    "pricing": {
      "input": 0.1,
      "output": 0.5,
      "cached": 0.01,
      "cache_write_30m": 0.125,
      "cache_write_12h": 0.25,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 0.2,
        "output": 0.75,
        "cached": 0.02,
        "cache_write_30m": 0.25,
        "cache_write_12h": 0.5
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-6-luna.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "- Cached input tokens are priced at 10% of the uncached input token rate.",
        "- Cache writes are billed at 1.25x the uncached input token rate.",
        "- Prompts with more than 272K input tokens are priced at 2x input and cache rates and 1.5x output for the full request.",
        "- Regional processing adds a 10% premium where available. EU data residency is available with Standard, Flex, and Batch processing.",
        "- Batch and Flex are priced at 50% of Standard rates. Fast mode is priced at 2x the applicable rates."
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-6-luna",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none", "low", "medium", "high", "xhigh", "max"
      ]
    }
  },
  "gpt-6-sol": {
    "description": "OpenAI model for complex coding and agentic workflows",
    "capabilities": {
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": true,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "none", "low", "medium", "high", "xhigh", "max"
      ]
    },
    "pricing": {
      "input": 2.0,
      "output": 10.0,
      "cached": 0.2,
      "cache_write_30m": 2.5,
      "cache_write_12h": 5,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 4.0,
        "output": 15.0,
        "cached": 0.4,
        "cache_write_30m": 5,
        "cache_write_12h": 10
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-6-sol.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "- Cached input tokens are priced at 10% of the uncached input token rate.",
        "- Cache writes are billed at 1.25x the uncached input token rate.",
        "- Prompts with more than 272K input tokens are priced at 2x input and cache rates and 1.5x output for the full request.",
        "- Regional processing adds a 10% premium where available. EU data residency is available with Standard, Flex, and Batch processing.",
        "- Batch and Flex are priced at 50% of Standard rates. Fast mode is priced at 2x the applicable rates."
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-6-sol",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none", "low", "medium", "high", "xhigh", "max"
      ]
    }
  },
  "gpt-6.1-sol": {
    "description": "Near-Astra performance for complex coding, computer use, and professional work at a lower cost.",
    "capabilities": {
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1050000,
      "maxInput": 922000,
      "maxOutput": 128000,
      "vision": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "thinkingFormat": "openai",
      "thinkingCanDisable": false,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ]
    },
    "pricing": {
      "input": 2.0,
      "output": 10.0,
      "cached": 0.1,
      "cache_write_30m": 2.5,
      "cache_write_12h": 5,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 4.0,
        "output": 15.0,
        "cached": 0.2,
        "cache_write_30m": 5,
        "cache_write_12h": 10
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-6.1-sol.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "GPT-6.1 Sol supports US and EU data residency, including Fast and Ultrafast modes.",
        "- Cached input tokens are priced at 5% of the uncached input token rate.",
        "- Cache writes are billed at 1.25x the uncached input token rate.",
        "- Prompts with more than 272K input tokens are priced at 2x input and cache rates and 1.5x output for the full request.",
        "- Fast mode prices are 2x Standard. Batch and Flex prices are 50% lower than Standard.",
        "- Regional processing adds a 10% premium where available."
      ]
    },
    "limits": {
      "catalogProvider": "openai",
      "catalogModelId": "gpt-6.1-sol",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ],
      "toolCallingRequiresResponses": true,
      "apiDefaultReasoningEffort": "medium",
      "unsupportedReasoningEfforts": [
        "none",
        "minimal"
      ]
    }
  }
};

const anthropic = {
  "claude-haiku-5-5": {
    "capabilities": {
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "pdf": true,
      "reasoning": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "thinkingFormat": "claude-adaptive",
      "thinkingCanDisable": true,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ]
    },
    "description": "Fast Claude model for high-volume, latency-sensitive classification, extraction, routing, and lightweight agents.",
    "sources": [
      "https://platform.claude.com/docs/en/models/haiku-5-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md"
    ],
    "limits": {
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24",
      "apiDefaultEffort": "medium",
      "unverifiedCapabilityFields": [
        "maxInput"
      ]
    },
    "pricing": {
      "input": 0.1,
      "output": 0.5,
      "cached": 0.01,
      "cache_creation": 0.125,
      "tier": {
        "threshold": 100000,
        "inclusive": false,
        "input": 0.5,
        "output": 2.5,
        "cached": 0.05,
        "cache_creation": 0.625,
        "cache_creation_1h": 1
      },
      "cache_creation_1h": 0.2
    },
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "cacheWriteTtl": "5m",
      "cacheWrite1h": 0.2,
      "cacheWrite1hTier": {
        "threshold": 100000,
        "inclusive": false,
        "price": 1
      },
      "note": "Standard API prices. Prompt length includes all input including cache reads/writes; >100000 prompt tokens applies the high rates to the full request. 5m cache writes in pricing; 1h writes retained separately. No account entitlement or inference verified."
    }
  },
  "claude-fable-5": {
    "description": "Claude model for creative writing, analysis, and controlled agent workflows",
    "capabilities": {
      "tools": true,
      "structuredOutput": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive",
      "thinkingCanDisable": false
    },
    "pricing": {
      "cache_creation_1h": 20,
      "input": 10.0,
      "output": 50.0,
      "cached": 1.0,
      "cache_creation": 12.5
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/fable-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "cacheWriteTtl": "5m",
      "cacheWrite1h": 20.0,
      "longContextPremium": "none for Claude4.6 and later",
      "batchDiscount": "50% on input/output"
    },
    "limits": {
      "catalogProvider": "anthropic",
      "catalogModelId": "claude-fable-5",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context."
    }
  },
  "claude-fable-5-1": {
    "description": "Claude model for demanding reasoning and long-horizon agentic work",
    "capabilities": {
      "tools": true,
      "structuredOutput": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive",
      "thinkingCanDisable": false
    },
    "pricing": {
      "cache_creation_1h": 20,
      "input": 10.0,
      "output": 50.0,
      "cached": 0.25,
      "cache_creation": 12.5
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/fable-5-1/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "cacheWriteTtl": "5m",
      "cacheWrite1h": 20.0,
      "longContextPremium": "none for Claude4.6 and later",
      "batchDiscount": "50% on input/output"
    },
    "limits": {
      "catalogProvider": "anthropic",
      "catalogModelId": "claude-fable-5-1",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context."
    }
  },
  "claude-haiku-4-5-20251001": {
    "description": "Fast Claude model for responsive assistance, classification, and lightweight agents",
    "capabilities": {
      "tools": true,
      "structuredOutput": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 200000,
      "maxOutput": 64000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-budget"
    },
    "pricing": {
      "cache_creation_1h": 2,
      "input": 1.0,
      "output": 5.0,
      "cached": 0.1,
      "cache_creation": 1.25
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/haiku-4-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "cacheWriteTtl": "5m",
      "cacheWrite1h": 2.0,
      "longContextPremium": "not applicable to200k context",
      "batchDiscount": "50% on input/output"
    },
    "limits": {
      "catalogProvider": "anthropic",
      "catalogModelId": "claude-haiku-4-5-20251001",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context."
    }
  },
  "claude-opus-4-6": {
    "description": "High-end Claude for difficult coding, planning, and slower expert reasoning",
    "capabilities": {
      "tools": true,
      "structuredOutput": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive"
    },
    "pricing": {
      "cache_creation_1h": 10,
      "input": 5.0,
      "output": 25.0,
      "cached": 0.5,
      "cache_creation": 6.25
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/opus-4-6/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "cacheWriteTtl": "5m",
      "cacheWrite1h": 10.0,
      "longContextPremium": "none for Claude4.6 and later",
      "batchDiscount": "50% on input/output"
    },
    "limits": {
      "catalogProvider": "anthropic",
      "catalogModelId": "claude-opus-4-6",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24"
    }
  },
  "claude-opus-5": {
    "description": "Strongest Claude Opus model for coding, agents, and professional work",
    "capabilities": {
      "tools": true,
      "structuredOutput": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive"
    },
    "pricing": {
      "cache_creation_1h": 10,
      "input": 5.0,
      "output": 25.0,
      "cached": 0.5,
      "cache_creation": 6.25
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/opus-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "cacheWriteTtl": "5m",
      "cacheWrite1h": 10.0,
      "longContextPremium": "none for Claude4.6 and later",
      "batchDiscount": "50% on input/output"
    },
    "limits": {
      "catalogProvider": "anthropic",
      "catalogModelId": "claude-opus-5",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24"
    }
  },
  "claude-opus-5-5": {
    "description": "Claude model for long-running agentic coding and knowledge work",
    "capabilities": {
      "tools": true,
      "structuredOutput": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive",
      "thinkingCanDisable": false
    },
    "pricing": {
      "cache_creation_1h": 8,
      "input": 4.0,
      "output": 20.0,
      "cached": 0.2,
      "cache_creation": 5.0
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/opus-5-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "cacheWriteTtl": "5m",
      "cacheWrite1h": 8.0,
      "longContextPremium": "none for Claude4.6 and later",
      "batchDiscount": "50% on input/output"
    },
    "limits": {
      "catalogProvider": "anthropic",
      "catalogModelId": "claude-opus-5-5",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24"
    }
  },
  "claude-sonnet-4-6": {
    "description": "Claude workhorse for coding agents, careful analysis, and production cost control",
    "capabilities": {
      "tools": true,
      "structuredOutput": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive"
    },
    "pricing": {
      "cache_creation_1h": 6,
      "input": 3.0,
      "output": 15.0,
      "cached": 0.3,
      "cache_creation": 3.75
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/sonnet-4-6/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "cacheWriteTtl": "5m",
      "cacheWrite1h": 6.0,
      "longContextPremium": "none for Claude4.6 and later",
      "batchDiscount": "50% on input/output"
    },
    "limits": {
      "catalogProvider": "anthropic",
      "catalogModelId": "claude-sonnet-4-6",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24"
    }
  },
  "claude-sonnet-5": {
    "description": "Everyday Claude agent model for coding, planning, browsing, and general work",
    "capabilities": {
      "tools": true,
      "structuredOutput": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive"
    },
    "pricing": {
      "cache_creation_1h": 4,
      "input": 2.0,
      "output": 10.0,
      "cached": 0.2,
      "cache_creation": 2.5
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/sonnet-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "cacheWriteTtl": "5m",
      "cacheWrite1h": 4.0,
      "longContextPremium": "none for Claude4.6 and later",
      "batchDiscount": "50% on input/output"
    },
    "limits": {
      "catalogProvider": "anthropic",
      "catalogModelId": "claude-sonnet-5",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24"
    }
  },
  "claude-sonnet-5-5": {
    "description": "Fast Claude model for everyday coding, agents, and knowledge work",
    "capabilities": {
      "tools": true,
      "structuredOutput": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive"
    },
    "pricing": {
      "cache_creation_1h": 4,
      "input": 2.0,
      "output": 10.0,
      "cached": 0.1,
      "cache_creation": 2.5
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/sonnet-5-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "cacheWriteTtl": "5m",
      "cacheWrite1h": 4.0,
      "longContextPremium": "none for Claude4.6 and later",
      "batchDiscount": "50% on input/output"
    },
    "limits": {
      "catalogProvider": "anthropic",
      "catalogModelId": "claude-sonnet-5-5",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24",
      "apiDefaultEffort": "high",
      "thinkingOffMode": "between_tools",
      "thinkingOffNote": "Turns off up-front thinking only; do not equate with disabled thinking."
    }
  }
};

const gemini = {
  "gemini-3-flash-preview": {
    "sources": [
      "https://models.dev/api.json",
      "https://ai.google.dev/gemini-api/docs/pricing"
    ],
    "billing": {
      "kind": "api",
      "note": "Paid standard text/image/video input and text output including thinking. Separate audio input is $1/cache $0.10 per1M. Time-based cache storage is not a per-token cache-write charge. No account entitlement verified.",
      "currency": "USD",
      "unit": "1M tokens",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 1
      },
      "audioInputRates": {
        "input": 1,
        "cached": 0.1
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "google",
      "catalogModelId": "gemini-3-flash-preview",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": true,
      "audioInput": true,
      "videoInput": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "New Gemini flash lane bringing frontier-style multimodal reasoning to cheaper runs",
    "pricing": {
      "input": 0.5,
      "output": 3,
      "cached": 0.05,
      "reasoning": 3
    }
  },
  "gemma-4-31b-it": {
    "sources": [
      "https://models.dev/api.json"
    ],
    "billing": {
      "kind": "catalog-metadata-only",
      "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
    },
    "limits": {
      "scope": "exact-route-modelsdev-catalog",
      "authenticatedRouteVerified": false,
      "catalogProvider": "google",
      "catalogModelId": "gemma-4-31b-it",
      "catalogAsOf": "2026-10-17"
    },
    "capabilities": {
      "contextWindow": 262144,
      "maxOutput": 32768,
      "reasoning": true,
      "tools": true,
      "structuredOutput": true,
      "vision": true,
      "pdf": false,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false
    },
    "description": "Largest Gemma 4 instruction model for open, self-hosted chat and reasoning"
  },
  "gemini-4-argon": {
    "capabilities": {
      "contextWindow": 1048576,
      "maxOutput": 32768,
      "vision": true,
      "pdf": true,
      "audioInput": true,
      "videoInput": true,
      "imageOutput": false,
      "audioOutput": false,
      "reasoning": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "thinkingFormat": "gemini-level",
      "thinkingCanDisable": false,
      "thinkingEffortSupported": true,
      "thinkingEfforts": [
        "low",
        "medium",
        "high"
      ]
    },
    "description": "Google flagship reasoning model for complex software engineering, deep mathematical and scientific problem solving, and multi-step agents.",
    "pricing": {
      "input": 2,
      "output": 10,
      "reasoning": 10,
      "cached": 0.1
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/models/gemini-4-argon",
      "https://ai.google.dev/gemini-api/docs/generate-content/long-decode",
      "https://ai.google.dev/gemini-api/docs/long-decode",
      "https://ai.google.dev/gemini-api/docs/generate-content/thinking",
      "https://ai.google.dev/gemini-api/docs/pricing"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published introductory standard paid rates; implicit caching only. Native long decode requires continuation hops not implemented by this gateway. No account entitlement or inference verified.",
      "validThrough": "2026-11-30",
      "nextRates": {
        "from": "2026-12-01",
        "input": 4,
        "output": 20,
        "reasoning": 20,
        "cached": 0.2
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "scope": "public-generate-content-rest-api",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Unified shared input, thinking and output limit; not a separate maximum input allowance.",
      "maxOutputScope": "Direct v1beta REST generateContent single request without continuation; shared discovery uses the non-streaming ceiling.",
      "nonStreamMaxOutput": 32768,
      "modelPageDefaultSynchronousMaxOutput": 65536,
      "interactionsSynchronousMaxOutput": 65536,
      "outputLimitNote": "The Oct 14 model page summarizes a 65,536 synchronous default and links the Interactions guide. The API-specific GenerateContent guide explicitly retains 32,768 for direct non-streaming REST and 65,536 for streaming/SDK calls. This gateway calls REST GenerateContent, not Interactions or the auto-continuing GenAI SDK. Long decode up to the unified window requires continuation; it is not a single-request gateway output allowance.",
      "streamMaxOutput": 65536,
      "longDecodeMaxOutput": 1048576,
      "continuationImplemented": false,
      "apiDefaultThinkingLevel": "medium",
      "explicitCachingSupported": false,
      "unverifiedCapabilityFields": [
        "maxInput"
      ]
    }
  },
  "gemini-2.5-flash": {
    "description": "Fast Gemini workhorse for multimodal apps where latency and price matter",
    "capabilities": {
      "vision": true,
      "pdf": true,
      "audioInput": true,
      "videoInput": true,
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 0.3,
      "output": 2.5,
      "cached": 0.03,
      "reasoning": 2.5
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 1
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ],
      "audioInputRates": {
        "input": 1,
        "cached": 0.1,
        "unit": "1M tokens",
        "currency": "USD"
      }
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-2.5-flash",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-2.5-flash-lite": {
    "description": "Lean Gemini 2.5 lane for cheap multimodal traffic and quick agents",
    "capabilities": {
      "vision": true,
      "audioInput": true,
      "videoInput": true,
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "pdf": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 0.1,
      "output": 0.4,
      "cached": 0.01,
      "reasoning": 0.4
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/deprecations?hl=en",
      "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 1
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ],
      "audioInputRates": {
        "input": 0.3,
        "cached": 0.03,
        "unit": "1M tokens",
        "currency": "USD"
      }
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-2.5-flash-lite",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": [],
      "lifecycleStatus": "active-restricted",
      "accountEligibility": "prior-use-required",
      "availabilityScope": "google-public-api-project",
      "shutdownDate": null,
      "note": "Google limits these models to users with prior active use and explicitly says they are not deprecated. A project-specific 404 for new users does not establish global retirement. See the official deprecations page."
    }
  },
  "gemini-2.5-pro": {
    "description": "Google's proven reasoning model for coding, math, and multimodal analysis",
    "capabilities": {
      "vision": true,
      "videoInput": true,
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "audioInput": true,
      "pdf": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 1.25,
      "output": 10,
      "cached": 0.125,
      "reasoning": 10,
      "tier": {
        "threshold": 200000,
        "inclusive": false,
        "input": 2.5,
        "output": 15,
        "reasoning": 15,
        "cached": 0.25
      }
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/deprecations?hl=en",
      "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 4.5
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-2.5-pro",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": [],
      "lifecycleStatus": "active-restricted",
      "accountEligibility": "prior-use-required",
      "availabilityScope": "google-public-api-project",
      "shutdownDate": null,
      "note": "Google limits these models to users with prior active use and explicitly says they are not deprecated. A project-specific 404 for new users does not establish global retirement. See the official deprecations page."
    }
  },
  "gemini-3.1-flash-lite": {
    "description": "Low-latency Gemini model for high-volume multimodal and agent workloads",
    "capabilities": {
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "vision": true,
      "videoInput": true,
      "audioInput": true,
      "pdf": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 0.25,
      "output": 1.5,
      "cached": 0.025,
      "reasoning": 1.5
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 1
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ],
      "audioInputRates": {
        "input": 0.5,
        "cached": 0.05,
        "unit": "1M tokens",
        "currency": "USD"
      }
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-3.1-flash-lite",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.1-pro-preview": {
    "description": "Reasoning-first Gemini preview for agentic coding and complex problem solving",
    "capabilities": {
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "vision": true,
      "videoInput": true,
      "audioInput": true,
      "pdf": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 2,
      "output": 12,
      "reasoning": 12,
      "cached": 0.2,
      "tier": {
        "threshold": 200000,
        "inclusive": false,
        "input": 4,
        "output": 18,
        "reasoning": 18,
        "cached": 0.4
      }
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 4.5
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-3.1-pro-preview",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.5-flash": {
    "description": "Fast Gemini model balancing multimodal reasoning, tool use, and cost",
    "capabilities": {
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "vision": true,
      "videoInput": true,
      "audioInput": true,
      "pdf": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 1.5,
      "output": 9,
      "reasoning": 9,
      "cached": 0.15
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 1
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-3.5-flash",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.5-flash-lite": {
    "description": "Fast Gemini model balancing multimodal reasoning, tool use, and cost",
    "capabilities": {
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "vision": true,
      "videoInput": true,
      "audioInput": true,
      "pdf": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 0.3,
      "output": 2.5,
      "reasoning": 2.5,
      "cached": 0.03
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 1
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-3.5-flash-lite",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.6-flash": {
    "description": "Fast Gemini model balancing multimodal reasoning, tool use, and cost",
    "capabilities": {
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "vision": true,
      "videoInput": true,
      "audioInput": true,
      "pdf": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 0.75,
      "output": 3.75,
      "reasoning": 3.75,
      "cached": 0.075
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 0.5
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ],
      "validThrough": "2026-12-31",
      "nextRates": {
        "from": "2027-01-01",
        "input": 1.5,
        "output": 7.5,
        "reasoning": 7.5,
        "cached": 0.15,
        "cacheStoragePer1MTokenHours": 1
      }
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-3.6-flash",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.7-flash": {
    "description": "High-efficiency Gemini model for agentic workflows, coding, and multimodal reasoning",
    "capabilities": {
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "vision": true,
      "videoInput": true,
      "audioInput": true,
      "pdf": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 0.75,
      "output": 3.75,
      "reasoning": 3.75,
      "cached": 0.075
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 0.5
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ],
      "validThrough": "2026-12-31",
      "nextRates": {
        "from": "2027-01-01",
        "input": 1.5,
        "output": 7.5,
        "reasoning": 7.5,
        "cached": 0.15,
        "cacheStoragePer1MTokenHours": 1
      }
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-3.7-flash",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.8-flash": {
    "description": "Google's most intelligent Flash model, engineered for long-horizon software engineering, autonomous agents, and complex enterprise workflows",
    "capabilities": {
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "vision": true,
      "videoInput": true,
      "audioInput": true,
      "pdf": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 0.75,
      "output": 3.75,
      "reasoning": 3.75,
      "cached": 0.075
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 0.5
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ],
      "validThrough": "2026-12-31",
      "nextRates": {
        "from": "2027-01-01",
        "input": 1.5,
        "output": 7.5,
        "reasoning": 7.5,
        "cached": 0.15,
        "cacheStoragePer1MTokenHours": 1
      }
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-3.8-flash",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.1-pro-preview-customtools": {
    "description": "Advanced Gemini model for complex reasoning, coding, and multimodal analysis",
    "capabilities": {
      "maxInput": 1048576,
      "contextWindow": 1048576,
      "maxOutput": 65536,
      "vision": true,
      "videoInput": true,
      "audioInput": true,
      "pdf": true,
      "tools": true,
      "search": true,
      "structuredOutput": true,
      "reasoning": true,
      "imageOutput": false,
      "audioOutput": false
    },
    "pricing": {
      "input": 2,
      "output": 12,
      "reasoning": 12,
      "cached": 0.2,
      "tier": {
        "threshold": 200000,
        "inclusive": false,
        "input": 4,
        "output": 18,
        "reasoning": 18,
        "cached": 0.4
      }
    },
    "sources": [
      "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Paid-tier API text rates; output includes thinking. Cache storage is time-based, not a token cache-write tariff. Account limits unverified.",
      "cacheStorage": {
        "currency": "USD",
        "unit": "1M token-hours",
        "price": 4.5
      },
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "google",
      "catalogModelId": "gemini-3.1-pro-preview-customtools",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": [],
      "variant": "Documented custom-tools-prioritizing API endpoint, not proven Gemini CLI entitlement."
    }
  }
};

const xai = {
  "grok-4.3": {
    "description": "xAI's Grok for chat, coding, agentic tools, and lower hallucination risk",
    "capabilities": {
      "reasoning": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 1000000,
      "vision": true,
      "tools": true,
      "structuredOutput": true
    },
    "pricing": {
      "input": 1.25,
      "output": 2.5,
      "cached": 0.2,
      "tier": {
        "threshold": 200000,
        "inclusive": true,
        "input": 2.5,
        "output": 5.0,
        "cached": 0.4
      }
    },
    "sources": [
      "https://docs.x.ai/developers/models/grok-4.3",
      "https://docs.x.ai/developers/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Standard API token rates. Long-context pricing applies to all request tokens at >=200000 prompt tokens. No independent cache-write tariff or numeric text output maximum established.",
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "xai",
      "catalogModelId": "grok-4.3",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputStatus": "Not separately established from current exact-model page",
      "unverifiedCapabilityFields": [
        "maxOutput"
      ]
    }
  },
  "grok-4.5": {
    "description": "xAI's Grok model for chat, coding, agentic tools, and lower hallucination risk",
    "capabilities": {
      "reasoning": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 500000,
      "vision": true,
      "tools": true,
      "structuredOutput": true
    },
    "pricing": {
      "input": 2,
      "output": 6,
      "cached": 0.3,
      "tier": {
        "threshold": 200000,
        "inclusive": true,
        "input": 4,
        "output": 12,
        "cached": 0.6
      }
    },
    "sources": [
      "https://docs.x.ai/developers/models/grok-4.5",
      "https://docs.x.ai/developers/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Standard API token rates. Long-context pricing applies to all request tokens at >=200000 prompt tokens. No independent cache-write tariff or numeric text output maximum established.",
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "xai",
      "catalogModelId": "grok-4.5",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputStatus": "Not separately established from current exact-model page",
      "unverifiedCapabilityFields": [
        "maxOutput"
      ]
    }
  },
  "grok-4.6": {
    "description": "xAI's frontier model for long-running agents, coding, knowledge work, and visual projects",
    "capabilities": {
      "reasoning": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 500000,
      "vision": true,
      "tools": true,
      "structuredOutput": true
    },
    "pricing": {
      "input": 2,
      "output": 6,
      "cached": 0.5,
      "tier": {
        "threshold": 200000,
        "inclusive": true,
        "input": 4,
        "output": 12,
        "cached": 1.0
      }
    },
    "sources": [
      "https://docs.x.ai/developers/models/grok-4.6",
      "https://docs.x.ai/developers/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Standard API token rates. Long-context pricing applies to all request tokens at >=200000 prompt tokens. No independent cache-write tariff or numeric text output maximum established.",
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "xai",
      "catalogModelId": "grok-4.6",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputStatus": "Not separately established from current exact-model page",
      "unverifiedCapabilityFields": [
        "maxOutput"
      ]
    }
  },
  "grok-4.7": {
    "description": "xAI's frontier model for long-running agents, coding, knowledge work, and visual projects",
    "capabilities": {
      "reasoning": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 500000,
      "vision": true,
      "tools": true,
      "structuredOutput": true
    },
    "pricing": {
      "input": 2,
      "output": 6,
      "cached": 0.5,
      "tier": {
        "threshold": 200000,
        "inclusive": true,
        "input": 4,
        "output": 12,
        "cached": 1.0
      }
    },
    "sources": [
      "https://docs.x.ai/developers/models/grok-4.7",
      "https://docs.x.ai/developers/pricing",
      "https://docs.x.ai/developers/grok-4-7",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Standard API token rates. Long-context pricing applies to all request tokens at >=200000 prompt tokens. No independent cache-write tariff or numeric text output maximum established.",
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "xai",
      "catalogModelId": "grok-4.7",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputStatus": "No text output limit",
      "unverifiedCapabilityFields": [
        "maxOutput"
      ]
    }
  },
  "grok-build-0.1": {
    "description": "Fast Grok coding model tuned for agentic engineering and iterative edits",
    "capabilities": {
      "reasoning": true,
      "pdf": true,
      "audioInput": false,
      "videoInput": false,
      "imageOutput": false,
      "audioOutput": false,
      "contextWindow": 256000,
      "vision": true,
      "tools": true,
      "structuredOutput": true
    },
    "pricing": {
      "input": 1,
      "output": 2,
      "cached": 0.2,
      "tier": {
        "threshold": 200000,
        "inclusive": true,
        "input": 2,
        "output": 4,
        "cached": 0.4
      }
    },
    "sources": [
      "https://docs.x.ai/developers/models/grok-build-0.1",
      "https://docs.x.ai/developers/pricing",
      "https://models.dev/api.json"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Standard API token rates. Long-context pricing applies to all request tokens at >=200000 prompt tokens. No independent cache-write tariff or numeric text output maximum established.",
      "unverifiedPriceFields": [
        "cache_creation"
      ]
    },
    "limits": {
      "catalogProvider": "xai",
      "catalogModelId": "grok-build-0.1",
      "catalogAsOf": "2026-10-17",
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputStatus": "Not separately established from current exact-model page",
      "unverifiedCapabilityFields": [
        "maxOutput"
      ]
    }
  }
};


// The same model may be reachable via a plan-billed route; reference rates are
// explicitly NOT subscription debit prices. Clones keep provider scope separate.
const copy = value => JSON.parse(JSON.stringify(value));

// Standard quotes, independent of paid processing-speed configuration. A dash
// in a vendor table is an unknown/unsupported tariff, never a zero-dollar fee.
const primaryPricing = {
  openai: {
    url: "https://developers.openai.com/api/docs/pricing.md",
    capturedAtUtc: "2026-10-21T10:47:37.142421Z",
    sha256: "129d6019819379a6f30edc0811d4631ddb085dcd4b3b1d0012a945cd1af1bfbf",
  },
  anthropic: {
    url: "https://platform.claude.com/docs/en/about-claude/pricing.md",
    capturedAtUtc: "2026-10-21T10:47:37.742728Z",
    sha256: "d0dc6009ff1bae0023eec432d7c21d4a3b71a71e542ac350dbfd13dc85a8b862",
  },
  gemini: {
    url: "https://ai.google.dev/gemini-api/docs/pricing",
    capturedAtUtc: "2026-10-21T10:47:37.798071Z",
    sha256: "8e0ce5ac10eafbf19db7c1d289467f639ad28ec9e7aede9053c8d2e3bbf1e380",
  },
  xai: {
    url: "https://docs.x.ai/developers/pricing",
    capturedAtUtc: "2026-10-21T10:47:38.125284Z",
    sha256: "849eacc7b8c5b7c5df3677234457372392eacf400a4240e8995a8aaa74b3d688",
  },
};
const catalogCrosscheck = {
  url: "https://models.dev/api.json",
  capturedAtUtc: "2026-10-21T10:47:38.332470Z",
  sha256: "079175d89430bbf5ee2a0e271ced1ad4b4d1cf529fdbd0a5db50bb2e857e90a8",
  commit: "020f86d1b0970fe421c5dd7baec94478879d9756",
  scope: "Exact provider/model cross-check only; not proof of currency, entitlement, retirement, or a subscription invoice.",
};

// Previously these entries had catalog facts but depended on a separate static
// tariff table. Keep the exact native Standard quote here with its provenance.
for (const [id, pricing] of Object.entries({
  "gpt-5.5-pro": { input: 30, output: 180, tier: { threshold: 272000, inclusive: false, input: 60, output: 270 } },
  "gpt-5.4-pro": { input: 30, output: 180, tier: { threshold: 272000, inclusive: false, input: 60, output: 270 } },
  "gpt-5.2": { input: 1.75, output: 14, cached: 0.175 },
  "gpt-5.2-pro": { input: 21, output: 168 },
  "gpt-5.1": { input: 1.25, output: 10, cached: 0.125 },
  "gpt-5": { input: 1.25, output: 10, cached: 0.125 },
  "gpt-5-mini": { input: 0.25, output: 2, cached: 0.025 },
  "gpt-5-nano": { input: 0.05, output: 0.4, cached: 0.005 },
  "gpt-5-pro": { input: 15, output: 120 },
  "gpt-4o": { input: 2.5, output: 10, cached: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cached: 0.075 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4.1": { input: 2, output: 8, cached: 0.5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cached: 0.1 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4, cached: 0.025 },
  "o3": { input: 2, output: 8, cached: 0.5 },
  "o3-mini": { input: 1.1, output: 4.4, cached: 0.55 },
  "o3-pro": { input: 20, output: 80 },
  "o4-mini": { input: 1.1, output: 4.4, cached: 0.275 },
  "o1": { input: 15, output: 60, cached: 7.5 },
  "o1-pro": { input: 150, output: 600 },
})) {
  const entry = openai[id];
  entry.pricing = pricing;
  entry.sources.push(primaryPricing.openai.url);
  entry.billing = {
    currency: "USD", unit: "1M tokens", kind: "api",
    note: "Published native Standard API token rates; cache writes are not established for this model. No authenticated availability checked.",
    unverifiedPriceFields: ["cache_creation", "cache_write_30m", "cache_write_12h", ...("cached" in pricing ? [] : ["cached"])],
  };
}
for (const id of ["gpt-5.5-pro", "gpt-5.4-pro", "gpt-5.2-pro", "gpt-5-pro", "o3-pro", "o1-pro"]) {
  openai[id].limits.supportedApiFormats = ["openai-responses"];
  openai[id].sources.push(`https://developers.openai.com/api/docs/models/${id}.md`);
}

for (const [id, underlying] of [["gpt-daybreak-blue-latest", "gpt-5.6-sol"], ["gpt-daybreak-red-latest", "gpt-5.6-cyber"]]) {
  const entry = copy(openai[underlying]);
  entry.description = "Deprecated Daybreak program alias; separate approval and provisioning required.";
  entry.sources.push(`https://developers.openai.com/api/docs/models/${id}.md`, primaryPricing.openai.url);
  Object.assign(entry.limits, {
    idKind: "documented-api-alias", documentedSnapshot: underlying,
    supportedApiFormats: ["openai-responses"], lifecycleStatus: "deprecated-alias",
    availability: "Daybreak approval and model provisioning required; deprecation does not establish a shutdown date.",
  });
  delete entry.limits.catalogModelId;
  delete entry.limits.catalogProvider;
  openai[id] = entry;
}
openai["chat-latest"] = {
  description: "Changing alias for the latest Instant model used in ChatGPT, sold separately through the API.",
  capabilities: {
    contextWindow: 400000, maxInput: 272000, maxOutput: 128000,
    vision: true, pdf: false, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, reasoning: false, tools: true, search: true, structuredOutput: true,
  },
  pricing: { input: 5, output: 30, cached: 0.5 },
  sources: ["https://developers.openai.com/api/docs/models/chat-latest.md", primaryPricing.openai.url],
  billing: { currency: "USD", unit: "1M tokens", kind: "api", unverifiedPriceFields: ["cache_creation", "cache_write_30m", "cache_write_12h"], note: "Native Standard API quote, not a ChatGPT subscription charge." },
  limits: { scope: "public-api-specification", idKind: "changing-api-alias", authenticatedRouteVerified: false, supportedApiFormats: ["openai", "openai-responses"] },
};

for (const id of ["claude-opus-4-8", "claude-opus-4-7"]) {
  const entry = copy(anthropic["claude-opus-5"]);
  entry.description = "Legacy Claude Opus still available on the native API; adaptive thinking and a native 1M context window.";
  entry.sources = [`https://platform.claude.com/docs/en/models/${id.slice(7)}/overview.md`, primaryPricing.anthropic.url, catalogCrosscheck.url];
  Object.assign(entry.capabilities, { thinkingCanDisable: true, thinkingEffortSupported: true, thinkingEfforts: ["low", "medium", "high", "xhigh", "max"] });
  Object.assign(entry.limits, { catalogModelId: id, lifecycleStatus: "active-legacy", apiDefaultEffort: id === "claude-opus-4-7" ? "xhigh" : "high", unverifiedCapabilityFields: ["maxInput"] });
  anthropic[id] = entry;
}
anthropic["claude-opus-4-5-20251101"] = {
  description: "Legacy Claude Opus 4.5 pinned snapshot; the dateless 4.5 API ID is a documented alias.",
  capabilities: { ...copy(anthropic["claude-haiku-4-5-20251001"].capabilities), thinkingCanDisable: true },
  pricing: { input: 5, output: 25, cached: 0.5, cache_creation: 6.25, cache_creation_1h: 10 },
  sources: ["https://platform.claude.com/docs/en/models/opus-4-5/overview.md", primaryPricing.anthropic.url, catalogCrosscheck.url],
  billing: { currency: "USD", unit: "1M tokens", kind: "api", cacheWriteTtl: "5m", cacheWrite1h: 10, note: "Native Standard API price; distinct 5m/1h writes. Not a Claude Code subscription invoice." },
  limits: { scope: "public-api-specification", authenticatedRouteVerified: false, catalogProvider: "anthropic", catalogModelId: "claude-opus-4-5-20251101", lifecycleStatus: "active-legacy", unverifiedCapabilityFields: ["maxInput"] },
};
for (const [alias, snapshot] of [["claude-opus-4-5", "claude-opus-4-5-20251101"], ["claude-haiku-4-5", "claude-haiku-4-5-20251001"]]) {
  const entry = copy(anthropic[snapshot]);
  Object.assign(entry.limits, { catalogModelId: alias, idKind: "documented-api-alias", documentedSnapshot: snapshot });
  anthropic[alias] = entry;
}
for (const [id, equivalent] of [["claude-mythos-5-1", "claude-fable-5-1"], ["claude-mythos-5", "claude-fable-5"]]) {
  const entry = copy(anthropic[equivalent]);
  entry.description = "Verification-required native Claude model with the same documented specifications and prices as " + equivalent + ".";
  entry.sources = [`https://platform.claude.com/docs/en/models/${id.slice(7)}/overview.md`, primaryPricing.anthropic.url];
  delete entry.limits.catalogModelId;
  delete entry.limits.catalogProvider;
  Object.assign(entry.limits, { accountEligibility: "verified-organization-required", availabilityScope: "native-anthropic-api", documentedEquivalentModel: equivalent, unverifiedCapabilityFields: ["maxInput"] });
  anthropic[id] = entry;
}
// Native Sonnet accepts between_tools, not thinking.type=disabled. Claude Code
// also refuses to turn thinking off on Haiku 5.5; that is a separate contract.
Object.assign(anthropic["claude-sonnet-5-5"].capabilities, { thinkingCanDisable: false, thinkingOffType: "between_tools", forcedToolChoice: false });

Object.assign(gemini["gemini-2.5-flash"].limits, {
  lifecycleStatus: "active-restricted", accountEligibility: "prior-use-required",
  availabilityScope: "google-public-api-project", shutdownDate: null,
  note: "The current Google models page includes Flash in the prior-active-use restriction and explicitly says these endpoints are not deprecated.",
});
gemini["gemini-2.5-flash"].sources.push("https://ai.google.dev/gemini-api/docs/models");
gemini["gemma-4-26b-a4b-it"] = copy(gemini["gemma-4-31b-it"]);
gemini["gemma-4-26b-a4b-it"].description = "Gemma 4 mixture-of-experts instruction model; native Gemini API free-tier availability is separate from the Code Assist product.";
gemini["gemma-4-26b-a4b-it"].limits.catalogModelId = "gemma-4-26b-a4b-it";
for (const id of ["gemma-4-31b-it", "gemma-4-26b-a4b-it"]) {
  const entry = gemini[id];
  entry.pricing = { input: 0, output: 0, cached: 0 };
  entry.sources.push("https://ai.google.dev/gemma/docs/core/model_card_4", primaryPricing.gemini.url);
  entry.billing = { kind: "api", currency: "USD", unit: "1M tokens", tier: "free", unverifiedPriceFields: ["cache_creation"], note: "Published Gemma 4 free-tier input/output/cache prices are genuine zero. The paid native API tier is not available; no Code Assist or self-hosted inference cost is implied." };
  entry.limits.maxOutputScope = "Exact google/models.dev catalog, not an independently documented model-card output ceiling.";
  entry.limits.unverifiedCapabilityFields = ["maxInput"];
}
for (const [alias, destination] of [["gemini-3.5-flash", "gemini-3.6-flash"], ["gemini-3.7-flash", "gemini-3.8-flash"]]) {
  // Google explicitly preserves these endpoints and redirects native API calls.
  // Its current price page has no literal tariff for either retained alias.
  // Routing alone is not proof that destination billing/promotion applies.
  const entry = gemini[alias];
  entry.billing = {
    kind: "unverified", currency: "USD", unit: "1M tokens",
    unverifiedPriceFields: ["input", "output", "cached", "cache_creation"],
    legacyCatalogQuote: copy(entry.pricing),
    redirectReference: { model: destination, rates: copy(gemini[destination].pricing), nextRates: copy(gemini[destination].billing.nextRates), cacheStorage: copy(gemini[destination].billing.cacheStorage), source: primaryPricing.gemini.url },
    note: `The native API endpoint routes to ${destination}, but the current price page has no literal ${alias} row. Destination prices and future promotions remain reference-only, not an established alias invoice. Code Assist rollout mappings are independent.`,
  };
  entry.pricing = { input: null, output: null, cached: null, reasoning: null };
  Object.assign(entry.limits, { idKind: "documented-api-redirect", lifecycleStatus: "active-redirect", documentedSnapshot: destination, shutdownDate: null });
  entry.sources.push("https://ai.google.dev/gemini-api/docs/deprecations?hl=en", `https://ai.google.dev/gemini-api/docs/models/${destination}`);
}
gemini["gemini-nano-banana-2.1"] = {
  description: "Nano Banana 2.1 native image generation, exposed through the gateway's prompt-only image adapter.",
  capabilities: { imageOutput: true, audioOutput: false, tools: false, search: false, reasoning: false, structuredOutput: false, vision: false, pdf: false, audioInput: false, videoInput: false, maxInput: 131072, maxOutput: 32768 },
  pricing: { input: 1.5 },
  sources: ["https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1", primaryPricing.gemini.url],
  billing: {
    currency: "USD", unit: "million_tokens_by_modality", kind: "api",
    rates: { text_image_video_input: 1.5, text_thinking_output: 7.5, image_output: 30 },
    imageOutputTokens: { "1K": 1120, "2K": 1680, "4K": 3780 },
    unverifiedPriceFields: ["output", "cached", "cache_creation"],
    note: "Standard paid API rates. No single generic output quote: text/thinking and image output differ. Native references, video/PDF inputs, grounding and controls are not forwarded by the prompt-only adapter.",
  },
  limits: { kind: "image", scope: "gateway-media-adapter", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow"], nativeInputModalities: ["text", "image", "video", "pdf"], nativeOutputModalities: ["image", "text"] },
};

for (const [id, reasoning] of [["grok-4.20-0309-reasoning", true], ["grok-4.20-0309-non-reasoning", false], ["grok-4.20-multi-agent-0309", true]]) {
  const entry = copy(xai["grok-4.3"]);
  entry.description = "Native Grok 4.20 API model, not the Grok Build subscription product.";
  entry.capabilities.reasoning = reasoning;
  entry.sources = [`https://docs.x.ai/developers/models/${id}`, primaryPricing.xai.url, catalogCrosscheck.url];
  Object.assign(entry.limits, { catalogModelId: id, unverifiedCapabilityFields: ["maxInput", "maxOutput"] });
  xai[id] = entry;
}
for (const id of ["grok-4.7", "grok-4.6", "grok-4.5"]) {
  const entry = xai[id];
  Object.assign(entry.capabilities, { thinkingCanDisable: false, thinkingEffortSupported: true, thinkingEfforts: id === "grok-4.5" ? ["low", "medium", "high"] : ["low", "medium", "high", "xhigh"] });
  entry.sources.push("https://docs.x.ai/developers/model-capabilities/text/reasoning.md");
  entry.limits.apiDefaultReasoningEffort = "high";
}
for (const [alias, id] of [["grok-4.20-reasoning", "grok-4.20-0309-reasoning"], ["grok-4.20-non-reasoning", "grok-4.20-0309-non-reasoning"], ["grok-4.20-multi-agent", "grok-4.20-multi-agent-0309"]]) {
  const entry = copy(xai[id]);
  delete entry.limits.catalogModelId;
  delete entry.limits.catalogProvider;
  Object.assign(entry.limits, { idKind: "documented-api-alias", documentedSnapshot: id });
  xai[alias] = entry;
}
xai["grok-4"] = {
  description: "Existing compatibility ID; the current documentation redirect does not verify a specific priced backend.",
  capabilities: { imageOutput: false, audioOutput: false },
  pricing: { input: null, output: null, cached: null },
  sources: ["https://docs.x.ai/developers/models/grok-4", "https://docs.x.ai/developers/migration/may-15-retirement.md"],
  billing: { currency: "unknown", unit: "1M tokens", kind: "unverified", unverifiedPriceFields: ["input", "output", "cached", "cache_creation"], note: "Do not price this bare compatibility ID as the retired grok-4-0709 snapshot or assume the current Grok 4.3 redirect without an exact native mapping." },
  limits: { authenticatedRouteVerified: false, idKind: "compatibility-id", unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
};

const nativeSearchSurfaces = {
  openai: { endpoint: "/v1/responses", apiFormat: "openai-responses", toolType: "web_search" },
  anthropic: { endpoint: "/v1/messages", apiFormat: "claude", toolType: "web_search_20250305" },
  gemini: { endpoint: "/v1beta/models/{model}:generateContent", apiFormat: "gemini", toolField: "google_search" },
  xai: { endpoint: "/v1/responses", apiFormat: "openai-responses", toolType: "web_search" },
};
for (const [provider, models] of Object.entries({ openai, anthropic, gemini, xai })) {
  for (const entry of Object.values(models)) {
    entry.provenance = { reviewedAt: "2026-10-21", primaryPricing: copy(primaryPricing[provider]), catalogCrosscheck: copy(catalogCrosscheck) };
    if (entry.capabilities?.search === true) entry.limits.search = {
      native: { ...nativeSearchSurfaces[provider] },
      note: "Search requires an explicit provider-native hosted search tool on the named API surface. The capability does not imply every chat format can carry grounding or that function-tool calling automatically searches the web. Account availability and search charges are separate.",
    };
    if (entry.limits.catalogModelId) {
      entry.limits.catalogAsOf = "2026-10-21";
      entry.limits.catalogCommit = catalogCrosscheck.commit;
    }
    if (entry.pricing && entry.billing.kind === "api" && !entry.sources.includes(primaryPricing[provider].url)) entry.sources.push(primaryPricing[provider].url);
    if (provider === "openai" && entry.pricing?.cache_write_30m !== undefined) {
      entry.billing.cacheWriteLifetimes = ["30m", "12h"];
      entry.billing.unverifiedPriceFields = ["cache_creation"];
    }
  }
}

// Terra was released after the 2026-10-21 review above. Keep its later
// exact-model cross-check and current primary evidence separate from that bundle.
openai["gpt-6.1-terra"] = {
  description: "Fast, efficient model for visual reasoning, computer use, and writing.",
  capabilities: {
    contextWindow: 1050000, maxInput: 922000, maxOutput: 128000,
    vision: true, pdf: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, tools: true, search: true,
    structuredOutput: true, reasoning: true, thinkingFormat: "openai",
    thinkingCanDisable: true, thinkingEffortSupported: true,
    thinkingEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  pricing: {
    input: 1, output: 5, cached: 0.05, cache_write_30m: 1.25, cache_write_12h: 2.5,
    tier: { threshold: 272000, inclusive: false, input: 2, output: 7.5, cached: 0.1, cache_write_30m: 2.5, cache_write_12h: 5 },
  },
  sources: [
    "https://developers.openai.com/api/docs/models/gpt-6.1-terra.md",
    "https://developers.openai.com/api/docs/pricing.md",
    "https://models.dev/api.json",
  ],
  billing: {
    currency: "USD", unit: "1M tokens", kind: "api",
    cacheWriteLifetimes: ["30m", "12h"], unverifiedPriceFields: ["cache_creation"],
    note: "Published native Standard API prices; account entitlement is not established.",
    qualifiers: [
      "Prompts with more than 272K input tokens use 2x input and cache rates and 1.5x output for the full request.",
      "Batch and Flex are 50% of Standard; Fast is 2x Standard. Regional processing adds a 10% premium where available.",
    ],
  },
  limits: {
    scope: "public-api-specification", authenticatedRouteVerified: false,
    catalogProvider: "openai", catalogModelId: "gpt-6.1-terra", catalogAsOf: "2026-10-29",
    supportedApiFormats: ["openai", "openai-responses"], toolCallingRequiresResponses: true,
    apiDefaultReasoningEffort: "medium", apiReasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    search: { native: { endpoint: "/v1/responses", apiFormat: "openai-responses", toolType: "web_search" },
      note: "Search requires an explicit hosted tool on Responses; account availability and tool charges are separate." },
  },
  provenance: {
    reviewedAt: "2026-10-29",
    modelPage: { url: "https://developers.openai.com/api/docs/models/gpt-6.1-terra.md", capturedAtUtc: "2026-10-28T18:02:00Z", sha256: "cd34faa8904d85961ab5fe270f079b8be45a9c876af6c809b38b2c069f687a7a" },
    primaryPricing: { url: "https://developers.openai.com/api/docs/pricing.md", capturedAtUtc: "2026-10-28T18:02:28Z", sha256: "93d302a9b7a384877533bc3ab5bb48eebf4b56bd6add0f194095054b2a13f952" },
    catalogCrosscheck: { url: "https://models.dev/api.json", snapshotDate: "2026-10-29", sha256: "bb81b8bddd68fe7cba6504ce9a8cb217fdafb8cf1fd29b56232138b0860bb82f", scope: "Exact openai/gpt-6.1-terra entry only; no OAuth entitlement or route limit implied." },
  },
};

const reference = (entry, note) => {
  const result = copy(entry);
  result.billing.kind = "api-reference";
  result.billing.note = `${note} API rates are reference costs, not subscription debits. ${entry.billing.note}`;
  result.limits.scope = "api-reference-for-client-route";
  result.limits.routeContextWindow = null;
  result.limits.routeMaxOutput = null;
  // API project eligibility does not establish entitlement on an OAuth bridge.
  if (result.limits.accountEligibility) {
    result.limits.apiAccountEligibility = result.limits.accountEligibility;
    result.limits.apiAvailabilityScope = result.limits.availabilityScope;
    delete result.limits.accountEligibility;
    delete result.limits.availabilityScope;
  }
  return result;
};
const codex = {};
const codexSources = [
  "https://raw.githubusercontent.com/openai/codex/rust-v0.163.0/codex-rs/models-manager/models.json",
  "https://raw.githubusercontent.com/openai/codex/rust-v0.163.0/codex-rs/protocol/src/openai_models.rs",
];

const codexConfig = {
  "gpt-6-astra": {
    "cliDefaultContext": 272000,
    "cliMaxContext": 872000,
    "cliDefaultReasoningEffort": "low",
    "cliReasoningEfforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  "gpt-6.1-sol": {
    "cliDefaultContext": 272000,
    "cliMaxContext": 872000,
    "cliDefaultReasoningEffort": "low",
    "cliReasoningEfforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  "gpt-6-sol": {
    "cliDefaultContext": 272000,
    "cliMaxContext": 872000,
    "cliDefaultReasoningEffort": "medium",
    "cliReasoningEfforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  "gpt-6-luna": {
    "cliDefaultContext": 272000,
    "cliMaxContext": 872000,
    "cliDefaultReasoningEffort": "medium",
    "cliReasoningEfforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ]
  },
  "gpt-5.6-sol": {
    "cliDefaultContext": 272000,
    "cliMaxContext": 872000,
    "cliDefaultReasoningEffort": "low",
    "cliReasoningEfforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  "gpt-5.6-terra": {
    "cliDefaultContext": 272000,
    "cliMaxContext": 872000,
    "cliDefaultReasoningEffort": "medium",
    "cliReasoningEfforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  "gpt-5.6-luna": {
    "cliDefaultContext": 272000,
    "cliMaxContext": 872000,
    "cliDefaultReasoningEffort": "medium",
    "cliReasoningEfforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ]
  },
  "gpt-5.5": {
    "cliDefaultContext": 272000,
    "cliMaxContext": 272000,
    "cliDefaultReasoningEffort": "medium",
    "cliReasoningEfforts": [
      "low",
      "medium",
      "high",
      "xhigh"
    ]
  },
  "gpt-daybreak-blue-latest": {
    "cliDefaultContext": 272000,
    "cliMaxContext": 872000,
    "cliDefaultReasoningEffort": "low",
    "cliReasoningEfforts": ["low", "medium", "high", "xhigh", "max", "ultra"]
  },
  "gpt-daybreak-red-latest": {
    "cliDefaultContext": 372000,
    "cliMaxContext": 372000,
    "cliDefaultReasoningEffort": "medium",
    "cliReasoningEfforts": ["low", "medium", "high", "xhigh", "max", "ultra"]
  }
};
// Effective route observations override the CLI reference only where observed.
// None remains requestable on disable-capable families; Sol 6.1 ignores it.
// Live Luna requests on 2026-10-22 explicitly rejected Ultra with invalid_value;
// the pinned CLI enum is not evidence that the account transport accepts it.

const codexCredits = {
  "gpt-6-astra": { input: 250, cached: 25, output: 1250 },
  "gpt-6.1-sol": { input: 50, cached: 2.5, output: 250 },
  "gpt-6-sol": { input: 50, cached: 5, output: 250 },
  "gpt-6-luna": { input: 2.5, cached: 0.25, output: 12.5 },
  "gpt-5.6-sol": { input: 100, cached: 10, output: 500 },
  "gpt-5.6-terra": { input: 50, cached: 5, output: 300 },
  "gpt-5.6-luna": { input: 5, cached: 0.5, output: 30 },
  "gpt-daybreak-blue-latest": { input: 100, cached: 10, output: 500 },
  "gpt-daybreak-red-latest": { input: 312.5, cached: 31.25, output: 1875 },
};
for (const [id, config] of Object.entries(codexConfig)) {
  const entry = reference(openai[id], "Codex OAuth account limits unverified.");
  // Report the API model maximum, not the Codex CLI configuration ceiling.
  //
  // This used to publish the CLI numbers (cliMaxContext for GPT-6, the 272k CLI
  // default for GPT-5.6) as `context_length`. That under-reported the real
  // capability by 178k-778k tokens and was measured to be wrong: the gateway
  // served 402,486 input tokens for a model advertised at 272,000 and 902,486
  // for one advertised at 872,000, with the true ceiling at apiMaxInput
  // (922,000) — a 957k prompt is the one that gets rejected with
  // context_length_exceeded. Clients (ByKitsune) read this field, so the
  // under-report made them advertise a smaller window than they could serve.
  //
  // Cross-checked against models.dev's official OpenAI entries, Griphub's live
  // /v1/models (context_window 1050000 / max_prompt_tokens 922000 /
  // max_output_tokens 128000) and 9router's `*gpt-6*` / `*gpt-5.6*` patterns,
  // which all agree on 1050000. The CLI ceilings stay recorded under
  // limits.cliDefaultContext / limits.cliMaxContext for client-configuration
  // use — they are a client compaction bound, not a backend cap.
  entry.capabilities.contextWindow = openai[id].capabilities.contextWindow;
  if (Number.isFinite(openai[id].capabilities.maxInput)) entry.capabilities.maxInput = openai[id].capabilities.maxInput;
  if (Number.isFinite(openai[id].capabilities.maxOutput)) entry.capabilities.maxOutput = openai[id].capabilities.maxOutput;
  const routeEfforts = config.cliReasoningEfforts.filter(effort => effort !== "ultra");
  if (id !== "gpt-6.1-sol" && openai[id].capabilities.thinkingCanDisable === true && !routeEfforts.includes("none")) routeEfforts.unshift("none");
  entry.capabilities.thinkingEfforts = routeEfforts;
  entry.capabilities.thinkingCanDisable = routeEfforts.includes("none");
  entry.capabilities.thinkingEffortSupported = true;
  entry.sources.push(...codexSources);
  entry.sources.push("https://developers.openai.com/codex/pricing.md");
  entry.limits.cliBundle = {
    tag: "rust-v0.163.0", capturedAtUtc: "2026-10-21T10:47:37.158315Z",
    sha256: "943ca7fe1d19ed019054158303f0dbbd80b3bef43b3aa425a71aa7cb3fb52c2b",
  };
  if (codexCredits[id]) entry.billing.planPricing = {
    ...codexCredits[id], currency: "credits", unit: "1M tokens", speed: "standard",
    separateCacheWriteCharge: false,
    source: "https://developers.openai.com/codex/pricing.md",
    note: "Credit rates are not USD, included subscription usage multipliers, or a verified account invoice. Legacy Enterprise agreements may differ; credit purchase prices depend on the plan.",
  };
  Object.assign(entry.limits, config, {
    scope: "public-api-specification",
    routeReasoningEfforts: [...routeEfforts],
    routeReasoningEffortScope: "Native CLI effort choices with route-specific corrections: GPT-6.1 Sol none/minimal are ineffective; Ultra is not supported by the current account transport, including Luna routes. Disabled thinking remains requestable on other disable-capable families.",
    apiContextWindow: openai[id].capabilities.contextWindow,
    apiMaxInput: openai[id].capabilities.maxInput ?? null,
    apiMaxOutput: openai[id].capabilities.maxOutput,
    // Input/output limits are now sourced (models.dev + live gateway) rather
    // than assumed, so they are no longer listed as unverified. The CLI fields
    // remain a separate, client-scoped concept.
    unverifiedCapabilityFields: [],
    effectiveContextPercent: 95,
    autoCompactionFraction: 0.9,
    cliMaxContextSemantics: "Maximum context window allowed for config overrides; not a backend hard cap or compaction threshold.",
  });
  codex[id] = entry;
  if (config.cliMaxContext > config.cliDefaultContext) {
    const extended = copy(entry);
    // `[1m]` means "1M-context beta toggled on", so it must never report a
    // SMALLER window than the base id it extends. The API maximum is now the
    // base value, so the marker keeps the same window and only records the
    // client-configuration ceiling under limits.
    extended.capabilities.contextWindow = entry.capabilities.contextWindow;
    extended.limits.idKind = "gateway-context-variant";
    extended.limits.upstreamModelId = id;
    codex[`${id}[1m]`] = extended;
  }
}
// The CLI's context and effort choices are client configuration, not proof of
// ChatGPT-account limits or USD subscription charges. Ultra appears in the CLI
// catalog but is not established on this account transport.
codex["gpt-6.1-terra"] = {
  description: "GPT-6.1 Terra in the OpenAI Codex CLI catalog; account access and backend limits are unverified.",
  capabilities: {
    vision: true, pdf: false, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, reasoning: true, tools: true,
    search: true, thinkingFormat: "openai", thinkingCanDisable: false,
    thinkingEffortSupported: true, thinkingEfforts: ["low", "medium", "high", "xhigh", "max"],
  },
  pricing: { input: null, output: null, cached: null, reasoning: null, cache_creation: null, cache_write_30m: null, cache_write_12h: null },
  sources: ["https://raw.githubusercontent.com/openai/codex/126a0ee92ed2c5e73cd8a8f7e37563e8527552d7/codex-rs/models-manager/models.json"],
  billing: {
    kind: "plan", currency: "unknown", unit: "subscription",
    unverifiedPriceFields: ["input", "output", "cached", "cache_creation", "cache_write_30m", "cache_write_12h"],
    note: "Codex CLI catalog presence does not establish an account invoice or subscription debit. Native API prices are separate.",
  },
  limits: {
    scope: "codex-cli-catalog", authenticatedRouteVerified: false,
    cliDefaultContext: 500000, cliMaxContext: 872000, cliDefaultReasoningEffort: "low",
    cliReasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
    routeReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    routeReasoningEffortScope: "CLI-advertised choices excluding Ultra; account route acceptance is unverified.",
    routeContextWindow: null, routeMaxInput: null, routeMaxOutput: null,
    unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"],
    note: "CLI context values are client configuration; they do not establish a backend ceiling. This gateway's Codex wire does not support PDF; actual account access is unverified.",
  },
  provenance: {
    reviewedAt: "2026-10-29",
    cliBundle: { commit: "126a0ee92ed2c5e73cd8a8f7e37563e8527552d7", capturedAtUtc: "2026-10-28T18:02:00Z", sha256: "1384625c0b6b3e67d3c60da29becea2b017f2c283fc1e2d05b8edafb4698eb10" },
  },
};
// Existing legacy routes: the pinned Codex bundle omits them AND the live
// ChatGPT-account route rejects them outright ("The 'gpt-5.4' model is not
// supported when using Codex with a ChatGPT account" — reproduced against the
// running gateway). Publishing the public API window here would advertise a
// capability this route cannot serve, so the reference facts are kept for
// display while the route limits stay explicitly unverified/null.
for (const id of ["gpt-5.4", "gpt-5.4-mini"]) {
  const entry = reference(openai[id], "Not present in the pinned current Codex bundle; historical route retained.");
  entry.limits.apiContextWindow = openai[id].capabilities.contextWindow;
  entry.limits.apiMaxOutput = openai[id].capabilities.maxOutput;
  entry.limits.apiMaxInput = openai[id].capabilities.maxInput ?? null;
  for (const field of ["contextWindow", "maxInput", "maxOutput"]) delete entry.capabilities[field];
  entry.limits.unverifiedCapabilityFields = ["contextWindow", "maxInput", "maxOutput"];
  // Reproduced against the running gateway: the ChatGPT-account Codex route
  // rejects this model outright ("not supported when using Codex with a
  // ChatGPT account"). The id is retained so stored combos still resolve
  // instead of 404ing, but it is flagged as not servable so a consumer like
  // ByKitsune can hide it rather than advertise an unusable model.
  entry.limits.routeAvailable = false;
  entry.limits.routeUnavailableReason = "rejected-by-codex-chatgpt-route";
  codex[id] = entry;
}
// The owner also observed the retained 5.5 route rejected by ChatGPT accounts.
// A pinned CLI catalog entry is not proof that this account transport serves it.
Object.assign(codex["gpt-5.5"].limits, {
  routeAvailable: false,
  routeUnavailableReason: "rejected-by-codex-chatgpt-route",
  unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"],
});
codex["gpt-5.3-codex-spark"] = {
  capabilities: { vision: false, pdf: false }, pricing: {},
  sources: ["https://developers.openai.com/codex/models"],
  billing: { currency: "USD", unit: "subscription", kind: "plan", note: "Text-only research preview; no verified per-token price or current route entitlement." },
  limits: {
    scope: "cli-preview",
    authenticatedRouteVerified: false,
    routeContextWindow: null,
    routeMaxOutput: null,
    // Reference window from models.dev's official OpenAI entry, kept separate
    // from the route limits: the ChatGPT-account Codex route rejects this model
    // outright ("The 'gpt-5.3-codex-spark' model is not supported when using
    // Codex with a ChatGPT account" — reproduced against the running gateway),
    // so publishing it as context_length would advertise an unusable model.
    apiContextWindow: 128000,
    apiMaxInput: 100000,
    apiMaxOutput: 32000,
    unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"],
    note: "Omitted from pinned rust-v0.163.0 bundle; retain compatibility ID without treating models.dev vision claims as official.",
    // Reproduced against the running gateway: the ChatGPT-account Codex route
    // rejects this model outright ("not supported when using Codex with a
    // ChatGPT account"). The id is retained so stored combos still resolve
    // instead of 404ing, but it is flagged as not servable so a consumer like
    // ByKitsune can hide it rather than advertise an unusable model.
    routeAvailable: false,
    routeUnavailableReason: "rejected-by-codex-chatgpt-route",
  },
};
codex["codex-auto-review"] = {
  capabilities: { contextWindow: 200000, maxOutput: 64000 }, pricing: {}, sources: [...codexSources],
  billing: { currency: "USD", unit: "subscription", kind: "plan", unverifiedPriceFields: ["input", "output", "cached"], note: "CLI virtual review model, not a separately priced API model." },
  limits: {
    idKind: "cli-virtual-model",
    upstreamModelId: "codex-auto-review",
    cliDefaultContext: 272000,
    cliMaxContext: 872000,
    // The live gateway advertises 200,000 / 64,000 for this virtual review
    // route; it has no public API page of its own, so the values are reported
    // as observed rather than specification-verified.
    routeContextWindow: 200000,
    routeMaxOutput: 64000,
    authenticatedRouteVerified: false,
    unverifiedCapabilityFields: [],
  },
};
for (const id of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark"]) {
  const entry = copy(codex[id]);
  Object.assign(entry.limits, { idKind: "gateway-review-alias", upstreamModelId: id, quotaFamily: "review" });
  codex[`${id}-review`] = entry;
}
// The gateway provider-model endpoint appends synthetic review aliases. Its
// response is not a raw native catalog and cannot establish "-review" wire IDs.
const codexGatewayObservation = {
  source: "/tmp/opencode/zenrouter-production-20261021-04c0bf77/native-codex-catalog.json",
  sha256: "ebbea6b5ad5e72417dfa964a909871bd4ad50f6122c784768d473f177b57e871",
  inferenceEvidence: "/tmp/opencode/zenrouter-production-20261021-04c0bf77/models-extra.json",
  inferenceSha256: "4ce0c200235b48924b6f2a5b5f0cef82c5f4b6fe39bb082c3273059180c0719e",
  observedAtUtc: "2026-10-21T10:16:56Z",
  note: "Existing credential-redacted gateway provider-model responses and successful short gateway text calls. The model-list route appends synthetic review aliases; this is not raw native-wire evidence. This audit did not call production; observations do not establish token ceilings, multimodal support or tariffs.",
};
codex["gpt-reserve"] = {
    description: "Observed Codex gateway base ID retained verbatim; no documented priced-model equivalence or route limits.",
    capabilities: { vision: false, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, tools: true, search: false, reasoning: false, structuredOutput: false },
    pricing: {}, sources: ["https://developers.openai.com/codex/models.md"],
    billing: { kind: "plan", currency: "unknown", unit: "subscription", unverifiedPriceFields: ["input", "output", "cached", "cache_creation"], note: "Owner-verified gateway text and function-tool routing does not establish a separately priced API model or a USD subscription invoice." },
    limits: { scope: "observed-codex-gateway-route", idKind: "observed-base-route-id", upstreamModelId: "gpt-reserve", authenticatedRouteVerified: false, gatewayRouteVerified: true, routeAvailable: true, routeContextWindow: null, routeMaxOutput: null, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
    provenance: { reviewedAt: "2026-10-21", observation: copy(codexGatewayObservation) },
};
for (const id of ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "gpt-reserve"]) {
  const entry = copy(codex[id]);
  Object.assign(entry.limits, { idKind: "gateway-review-alias", upstreamModelId: id, quotaFamily: "review", nativeReviewWireIdVerified: false });
  entry.provenance ||= { reviewedAt: "2026-10-21" };
  entry.provenance.gatewayObservation = copy(codexGatewayObservation);
  codex[`${id}-review`] = entry;
}
for (const entry of Object.values(codex)) {
  if (entry.capabilities?.search === true) entry.limits.search = {
    inlineChat: true,
    native: { endpoint: "/v1/responses", apiFormat: "openai-responses", toolType: "web_search" },
    note: "Send an explicit Responses web_search hosted tool. Chat function tools are not web search; only a supported request translation preserves the native declaration. Codex account tool availability remains separate from API-model support.",
  };
  entry.limits.promptAccounting = {
    defaultInstructions: "injected-when-absent-or-empty",
    upstreamInputIncludesInstructions: true,
    cachedInputMayIncludeSharedPrefix: true,
    firstRequestCacheHitPossible: true,
    note: "Codex injects default instructions when none are supplied. Upstream input and cache counters include the actual transmitted prefix; cache can be shared or pre-existing even on the client's first request. No fixed instruction-token offset is subtracted.",
  };
}
const claude = {};
for (const [id, api] of Object.entries(anthropic)) {
  // Claude Code documents model selection for several backends, including the
  // native API. That does not prove Haiku 5.5 entitlement on this OAuth route.
  if (id.startsWith("claude-mythos-") || id === "claude-haiku-5-5") continue;
  const entry = reference(api, "Claude Code compaction/configuration does not change the public API model specification.");
  entry.sources.push("https://code.claude.com/docs/en/model-config.md");
  if (["claude-opus-5-5", "claude-opus-5", "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-5-5", "claude-sonnet-5", "claude-haiku-5-5", "claude-fable-5-1", "claude-fable-5"].includes(id)) {
    entry.limits.cliCompactionApproxTokens = 967000;
    entry.limits.cliContextNote = "Native 1M window; configuration, gateways, or third-party deployments can instead compact at 200K.";
  } else {
    entry.limits.cliContextNote = "API model maximum is not proof of CLI account configuration; Opus/Sonnet 4.6 need extended context to exceed the 200K compaction boundary.";
  }
  if (id === "claude-sonnet-5-5") {
    entry.limits.cliDefaultEffort = "medium";
    entry.capabilities.thinkingCanDisable = false;
  }
  claude[id] = entry;
}
claude["claude-opus-5-5-20260922"] = {
  capabilities: {}, pricing: {},
  sources: ["https://platform.claude.com/docs/en/about-claude/models/overview.md"],
  billing: { currency: "USD", unit: "unknown", kind: "unverified", note: "Existing compatibility ID only: dated native ID is not documented; do not infer a mapping or price." },
  limits: { nativeIdVerified: false, documentedNativeId: "claude-opus-5-5", authenticatedRouteVerified: false },
};
const geminiCli = {};
for (const [id, api] of Object.entries(gemini)) {
  if (id === "gemini-4-argon" || api.limits.kind === "image") continue;
  geminiCli[id] = reference(api, "Google API model facts do not establish Code Assist / Gemini CLI availability or limits.");
  geminiCli[id].sources.push("https://raw.githubusercontent.com/google-gemini/gemini-cli/v0.65.0/packages/core/src/config/models.ts");
  if (id.startsWith("gemma-4-")) {
    geminiCli[id].pricing = { input: null, output: null, cached: null };
    geminiCli[id].billing = { kind: "plan", currency: "unknown", unit: "subscription", unverifiedPriceFields: ["input", "output", "cached"], note: "Model ID appears in the stable Gemini CLI bundle. Native Gemini API free-tier zero is NOT an established Code Assist plan tariff." };
  }
}
geminiCli["gemini-3-flash"] = {
  capabilities: { vision: false, pdf: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false },
  pricing: { input: null, output: null, cached: null },
  sources: ["https://raw.githubusercontent.com/google-gemini/gemini-cli/v0.65.0/packages/core/src/config/models.ts"],
  billing: { kind: "plan", currency: "unknown", unit: "subscription", unverifiedPriceFields: ["input", "output", "cached"], note: "Code Assist backend routing identity. Rollout flags map Flash IDs dynamically; do not equate this ID to a paid native API model." },
  limits: { idKind: "code-assist-backend-id", authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
};
const grokCli = {};
for (const id of ["grok-4.7", "grok-4.6", "grok-4.5"]) {
  grokCli[id] = reference(xai[id], "Grok Build is plan-billed; CLI account availability and limits unverified.");
}
for (const effort of ["high", "medium", "low"]) {
  const entry = copy(grokCli["grok-4.5"]);
  Object.assign(entry.limits, { idKind: "gateway-effort-alias", upstreamModelId: "grok-4.5", reasoningEffort: effort });
  grokCli[`grok-4.5-${effort}`] = entry;
}
grokCli["grok-build"] = {
  capabilities: {}, pricing: {}, sources: ["https://docs.x.ai/build/overview"],
  billing: { currency: "unknown", unit: "subscription", kind: "plan", unverifiedPriceFields: ["input", "output", "cached"], note: "Grok Build subscription route, NOT public grok-build-0.1. No verified per-token debit price." },
  limits: { idKind: "cli-route-alias", routeContextWindow: null, routeMaxOutput: null, authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxOutput"], note: "Existing registry 500000/64000 and generic family 256000 disagree; no independently verified route cap." },
};
export default { openai, codex, anthropic, claude, gemini, "gemini-cli": geminiCli, xai, "grok-cli": grokCli };
