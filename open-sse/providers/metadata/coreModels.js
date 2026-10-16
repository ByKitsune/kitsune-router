/**
 * Reviewed core TEXT metadata from primary evidence captured 2026-10-06.
 * Standalone factual shard: no resolver imports and no implied integration.
 * API specifications are not proof of OAuth account entitlement or route limits.
 * Missing values are UNKNOWN, not zero/free/unlimited. When integrating, honor
 * limits.unverifiedCapabilityFields and billing.unverifiedPriceFields instead of
 * resurrecting guessed fallback values (notably Grok output and cache writes).
 * Gemini publishes input limits, not a separately documented total context.
 */

const openai = {
  "gpt-5.3-codex": {
    "capabilities": {
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
      "https://developers.openai.com/api/docs/models/gpt-5.3-codex.md"
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
    "capabilities": {
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
      "https://developers.openai.com/api/docs/models/gpt-5.4.md"
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
    "capabilities": {
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
      "https://developers.openai.com/api/docs/models/gpt-5.4-mini.md"
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
    "capabilities": {
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
      "https://developers.openai.com/api/docs/models/gpt-5.4-nano.md"
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
    "capabilities": {
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
      "https://developers.openai.com/api/docs/models/gpt-5.5.md"
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
      "cache_creation": 15.625,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 25.0,
        "output": 112.5,
        "cached": 2.5,
        "cache_creation": 31.25
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.6-cyber.md"
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
    "capabilities": {
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
      "cache_creation": 0.25,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 0.4,
        "output": 1.8,
        "cached": 0.04,
        "cache_creation": 0.5
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.6-luna.md"
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
    "capabilities": {
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
      "cache_creation": 5.0,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 8.0,
        "output": 30.0,
        "cached": 0.8,
        "cache_creation": 10.0
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.6-sol.md"
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
    "capabilities": {
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
      "cache_creation": 2.5,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 4.0,
        "output": 18.0,
        "cached": 0.4,
        "cache_creation": 5.0
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-5.6-terra.md"
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
    "capabilities": {
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
      "cache_creation": 12.5,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 20.0,
        "output": 75.0,
        "cached": 2.0,
        "cache_creation": 25.0
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-6-astra.md"
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
    "capabilities": {
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
        "none"
      ]
    },
    "pricing": {
      "input": 0.1,
      "output": 0.5,
      "cached": 0.01,
      "cache_creation": 0.125,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 0.2,
        "output": 0.75,
        "cached": 0.02,
        "cache_creation": 0.25
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-6-luna.md"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none"
      ],
      "toolCallingNote": "Responses supports tools; Chat Completions function calling requires reasoning_effort=none."
    }
  },
  "gpt-6-sol": {
    "capabilities": {
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
        "none"
      ]
    },
    "pricing": {
      "input": 2.0,
      "output": 10.0,
      "cached": 0.2,
      "cache_creation": 2.5,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 4.0,
        "output": 15.0,
        "cached": 0.4,
        "cache_creation": 5.0
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-6-sol.md"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "apiReasoningEfforts": [
        "none"
      ],
      "toolCallingNote": "Responses supports tools; Chat Completions function calling requires reasoning_effort=none."
    }
  },
  "gpt-6.1-sol": {
    "capabilities": {
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
      "cache_creation": 2.5,
      "tier": {
        "threshold": 272000,
        "inclusive": false,
        "input": 4.0,
        "output": 15.0,
        "cached": 0.2,
        "cache_creation": 5.0
      }
    },
    "sources": [
      "https://developers.openai.com/api/docs/models/gpt-6.1-sol.md"
    ],
    "billing": {
      "currency": "USD",
      "unit": "1M tokens",
      "kind": "api",
      "note": "Published standard API rates; account availability and authenticated route limits were not checked.",
      "qualifiers": [
        "GPT-6.1 Sol supports US and EU data residency. Fast mode is unavailable with EU",
        "- Cached input tokens are priced at 5% of the uncached input token rate.",
        "- Cache writes are billed at 1.25x the uncached input token rate.",
        "- Prompts with more than 272K input tokens are priced at 2x input and cache rates and 1.5x output for the full request.",
        "- Fast mode prices are 2x Standard. Batch and Flex prices are 50% lower than Standard.",
        "- Regional processing adds a 10% premium where available."
      ]
    },
    "limits": {
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
  "claude-fable-5": {
    "capabilities": {
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive",
      "thinkingCanDisable": false
    },
    "pricing": {
      "input": 10.0,
      "output": 50.0,
      "cached": 1.0,
      "cache_creation": 12.5
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/fable-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context."
    }
  },
  "claude-fable-5-1": {
    "capabilities": {
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive",
      "thinkingCanDisable": false
    },
    "pricing": {
      "input": 10.0,
      "output": 50.0,
      "cached": 0.25,
      "cache_creation": 12.5
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/fable-5-1/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context."
    }
  },
  "claude-haiku-4-5-20251001": {
    "capabilities": {
      "contextWindow": 200000,
      "maxOutput": 64000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-budget"
    },
    "pricing": {
      "input": 1.0,
      "output": 5.0,
      "cached": 0.1,
      "cache_creation": 1.25
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/haiku-4-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context."
    }
  },
  "claude-opus-4-6": {
    "capabilities": {
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive"
    },
    "pricing": {
      "input": 5.0,
      "output": 25.0,
      "cached": 0.5,
      "cache_creation": 6.25
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/opus-4-6/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24"
    }
  },
  "claude-opus-5": {
    "capabilities": {
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive"
    },
    "pricing": {
      "input": 5.0,
      "output": 25.0,
      "cached": 0.5,
      "cache_creation": 6.25
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/opus-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24"
    }
  },
  "claude-opus-5-5": {
    "capabilities": {
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive",
      "thinkingCanDisable": false
    },
    "pricing": {
      "input": 4.0,
      "output": 20.0,
      "cached": 0.2,
      "cache_creation": 5.0
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/opus-5-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24"
    }
  },
  "claude-sonnet-4-6": {
    "capabilities": {
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive"
    },
    "pricing": {
      "input": 3.0,
      "output": 15.0,
      "cached": 0.3,
      "cache_creation": 3.75
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/sonnet-4-6/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24"
    }
  },
  "claude-sonnet-5": {
    "capabilities": {
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive"
    },
    "pricing": {
      "input": 2.0,
      "output": 10.0,
      "cached": 0.2,
      "cache_creation": 2.5
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/sonnet-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputScope": "Synchronous Messages API",
      "maxInputStatus": "Not independently documented; do not subtract output from context.",
      "batchMaxOutput": 300000,
      "batchOutputBeta": "output-300k-2026-03-24"
    }
  },
  "claude-sonnet-5-5": {
    "capabilities": {
      "contextWindow": 1000000,
      "maxOutput": 128000,
      "vision": true,
      "reasoning": true,
      "thinkingFormat": "claude-adaptive"
    },
    "pricing": {
      "input": 2.0,
      "output": 10.0,
      "cached": 0.2,
      "cache_creation": 2.5
    },
    "sources": [
      "https://platform.claude.com/docs/en/models/sonnet-5-5/overview.md",
      "https://platform.claude.com/docs/en/about-claude/pricing.md"
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
  "gemini-2.5-flash": {
    "capabilities": {
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
      "https://ai.google.dev/gemini-api/docs/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-2.5-flash-lite": {
    "capabilities": {
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
      "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite",
      "https://ai.google.dev/gemini-api/docs/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": [],
      "routeAvailable": false,
      "routeUnavailableReason": "retired-by-google",
      "note": "Retired upstream. The API answers 404 \"This model models/gemini-2.5-flash-lite is no longer available to new users\", reproduced 2/2 and confirmed by 30 days of production logs. The reference figures above are kept for provenance; the id is no longer advertised."
    }
  },
  "gemini-2.5-pro": {
    "capabilities": {
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
      "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro",
      "https://ai.google.dev/gemini-api/docs/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": [],
      "routeAvailable": false,
      "routeUnavailableReason": "retired-by-google",
      "note": "Retired upstream. The API answers 404 \"This model models/gemini-2.5-pro is no longer available\" on BOTH the chat and transcription routes, reproduced 5/5. The reference figures above are kept for provenance; the id is no longer advertised."
    }
  },
  "gemini-3.1-flash-lite": {
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
      "https://ai.google.dev/gemini-api/docs/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.1-pro-preview": {
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
      "https://ai.google.dev/gemini-api/docs/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.5-flash": {
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
      "https://ai.google.dev/gemini-api/docs/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.5-flash-lite": {
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
      "https://ai.google.dev/gemini-api/docs/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.6-flash": {
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
      "https://ai.google.dev/gemini-api/docs/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.7-flash": {
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
      "https://ai.google.dev/gemini-api/docs/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.8-flash": {
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
      "https://ai.google.dev/gemini-api/docs/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "contextWindowStatus": "Combined input-plus-output context is not separately documented.",
      "unverifiedCapabilityFields": []
    }
  },
  "gemini-3.1-pro-preview-customtools": {
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
      "https://ai.google.dev/gemini-api/docs/pricing"
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
    "capabilities": {
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
      "https://docs.x.ai/developers/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputStatus": "Not separately established from current exact-model page",
      "unverifiedCapabilityFields": [
        "maxOutput"
      ]
    }
  },
  "grok-4.5": {
    "capabilities": {
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
      "https://docs.x.ai/developers/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputStatus": "Not separately established from current exact-model page",
      "unverifiedCapabilityFields": [
        "maxOutput"
      ]
    }
  },
  "grok-4.6": {
    "capabilities": {
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
      "https://docs.x.ai/developers/pricing"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputStatus": "Not separately established from current exact-model page",
      "unverifiedCapabilityFields": [
        "maxOutput"
      ]
    }
  },
  "grok-4.7": {
    "capabilities": {
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
      "https://docs.x.ai/developers/grok-4-7"
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
      "scope": "public-api-specification",
      "authenticatedRouteVerified": false,
      "maxOutputStatus": "No text output limit",
      "unverifiedCapabilityFields": [
        "maxOutput"
      ]
    }
  },
  "grok-build-0.1": {
    "capabilities": {
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
      "https://docs.x.ai/developers/pricing"
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
const reference = (entry, note) => {
  const result = copy(entry);
  result.billing.kind = "api-reference";
  result.billing.note = `${note} API rates are reference costs, not subscription debits. ${entry.billing.note}`;
  result.limits.scope = "api-reference-for-client-route";
  result.limits.routeContextWindow = null;
  result.limits.routeMaxOutput = null;
  return result;
};
const codex = {};
const codexSources = [
  "https://raw.githubusercontent.com/openai/codex/rust-v0.160.0/codex-rs/models-manager/models.json",
  "https://raw.githubusercontent.com/openai/codex/rust-v0.160.0/codex-rs/protocol/src/openai_models.rs",
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
  }
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
  entry.capabilities.thinkingEfforts = [...config.cliReasoningEfforts];
  entry.capabilities.thinkingCanDisable = config.cliReasoningEfforts.includes("none");
  entry.capabilities.thinkingEffortSupported = true;
  entry.sources.push(...codexSources);
  Object.assign(entry.limits, config, {
    scope: "public-api-specification",
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
    note: "Omitted from pinned rust-v0.160.0 bundle; retain compatibility ID without treating models.dev vision claims as official.",
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
  billing: { currency: "USD", unit: "subscription", kind: "plan", note: "CLI virtual review model, not a separately priced API model." },
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
const claude = {};
for (const [id, api] of Object.entries(anthropic)) {
  const entry = reference(api, "Claude Code compaction/configuration does not change the public API model specification.");
  entry.sources.push("https://code.claude.com/docs/en/model-config.md");
  if (["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-sonnet-5", "claude-fable-5-1", "claude-fable-5"].includes(id)) {
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
  if (id.endsWith("-customtools")) continue;
  geminiCli[id] = reference(api, "Google API model facts do not establish Code Assist / Gemini CLI availability or limits.");
}
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
  billing: { currency: "USD", unit: "subscription", kind: "plan", note: "Grok Build subscription route, NOT public grok-build-0.1. No verified per-token debit price." },
  limits: { idKind: "cli-route-alias", routeContextWindow: null, routeMaxOutput: null, authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxOutput"], note: "Existing registry 500000/64000 and generic family 256000 disagree; no independently verified route cap." },
};
export default { openai, codex, anthropic, claude, gemini, "gemini-cli": geminiCli, xai, "grok-cli": grokCli };
