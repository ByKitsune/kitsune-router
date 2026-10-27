/**
 * Reviewed media facts and kind-aware catalog comparisons. Native billing
 * refresh: 2026-10-21; older catalog comparison dates remain independently scoped.
 * Factual shard only; parent resolver integration is separate. Never interpret an
 * empty pricing object as free. Explicit route capability restrictions describe
 * this gateway's tested text-only/basic JSON adapters, not every native feature.
 * Dimensions, characters and UTF-16 code units are not generated token limits.
 * Billing retains native units and qualifiers; no live inference was performed.
 */
const mediaModels = {
  "nebius": {
    "Qwen/Qwen3-Embedding-8B": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false,
        "maxInput": 40960
      },
      "description": "Embedding model for semantic search, retrieval, clustering, and ranking pipelines",
      "sources": [
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "1M input tokens",
        "kind": "catalog-reference",
        "note": "Input-only embedding quote; vector dimensions and absent output rates are not completion tokens or free chat output.",
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation",
          "cache_creation_1h"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput"
        ],
        "catalogProvider": "nebius",
        "catalogModelId": "Qwen/Qwen3-Embedding-8B",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 40960,
          "input": 40960,
          "output": 0
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits."
      },
      "pricing": {
        "input": 0.01
      }
    }
  },
  "xai": {
    "grok-imagine-image": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true,
        "audioOutput": false
      },
      "description": "Image model for prompt-driven generation, editing, and visual design workflows",
      "sources": [
        "https://models.dev/api.json"
      ],
      "billing": {
        "kind": "unverified-pricing",
        "note": "Native billing units and rates require exact route evidence; no generic text-token tariff inferred from media or embedding dimensions."
      },
      "limits": {
        "kind": "image",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxInput",
          "maxOutput"
        ],
        "catalogProvider": "xai",
        "catalogModelId": "grok-imagine-image",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 16000,
          "output": 0
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits."
      }
    },
    "grok-imagine-image-quality": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true,
        "audioOutput": false
      },
      "description": "Higher-fidelity Grok Imagine image model for prompt-driven generation, editing, and visual design workflows",
      "sources": [
        "https://models.dev/api.json"
      ],
      "billing": {
        "kind": "unverified-pricing",
        "note": "Native billing units and rates require exact route evidence; no generic text-token tariff inferred from media or embedding dimensions."
      },
      "limits": {
        "kind": "image",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxInput",
          "maxOutput"
        ],
        "catalogProvider": "xai",
        "catalogModelId": "grok-imagine-image-quality",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 16000,
          "output": 0
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits."
      }
    },
    "grok-imagine-video": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Image model for prompt-driven generation, editing, and visual design workflows",
      "sources": [
        "https://models.dev/api.json"
      ],
      "billing": {
        "kind": "unverified-pricing",
        "note": "Native billing units and rates require exact route evidence; no generic text-token tariff inferred from media or embedding dimensions."
      },
      "limits": {
        "kind": "video",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxInput",
          "maxOutput"
        ],
        "catalogProvider": "xai",
        "catalogModelId": "grok-imagine-video",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 1024,
          "output": 0
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits."
      }
    },
    "grok-imagine-video-1.5": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Video model for image-to-video generation, editing, and extension workflows",
      "sources": [
        "https://models.dev/api.json"
      ],
      "billing": {
        "kind": "unverified-pricing",
        "note": "Native billing units and rates require exact route evidence; no generic text-token tariff inferred from media or embedding dimensions."
      },
      "limits": {
        "kind": "video",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxInput",
          "maxOutput"
        ],
        "catalogProvider": "xai",
        "catalogModelId": "grok-imagine-video-1.5",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 1024,
          "output": 0
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits."
      }
    },
    "grok-imagine-video-1.5-lite": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Cost-efficient video model for text-to-video and image-to-video generation",
      "sources": [
        "https://models.dev/api.json"
      ],
      "billing": {
        "kind": "unverified-pricing",
        "note": "Native billing units and rates require exact route evidence; no generic text-token tariff inferred from media or embedding dimensions."
      },
      "limits": {
        "kind": "video",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxInput",
          "maxOutput"
        ],
        "catalogProvider": "xai",
        "catalogModelId": "grok-imagine-video-1.5-lite",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 1024,
          "output": 0
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits."
      }
    }
  },
  "groq": {
    "whisper-large-v3": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": true,
        "videoInput": false
      },
      "description": "Speech transcription model for accurate audio-to-text and captioning workflows",
      "sources": [
        "https://models.dev/api.json"
      ],
      "billing": {
        "kind": "unverified-pricing",
        "note": "Native transcription duration units are not text-token prices."
      },
      "limits": {
        "kind": "stt",
        "scope": "exact-route-modelsdev-catalog",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxInput",
          "maxOutput"
        ],
        "catalogProvider": "groq",
        "catalogModelId": "whisper-large-v3",
        "catalogAsOf": "2026-10-17"
      }
    },
    "whisper-large-v3-turbo": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": true,
        "videoInput": false
      },
      "description": "Speech transcription model for accurate audio-to-text and captioning workflows",
      "sources": [
        "https://models.dev/api.json"
      ],
      "billing": {
        "kind": "unverified-pricing",
        "note": "Native transcription duration units are not text-token prices."
      },
      "limits": {
        "kind": "stt",
        "scope": "exact-route-modelsdev-catalog",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxInput",
          "maxOutput"
        ],
        "catalogProvider": "groq",
        "catalogModelId": "whisper-large-v3-turbo",
        "catalogAsOf": "2026-10-17"
      }
    }
  },
  "openai": {
    "text-embedding-3-large": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false,
        "maxInput": 8192
      },
      "description": "Embedding model for semantic search, retrieval, clustering, and ranking pipelines",
      "sources": [
        "https://developers.openai.com/api/docs/guides/embeddings.md",
        "https://models.dev/api.json",
        "https://developers.openai.com/api/docs/pricing.md"
      ],
      "billing": {
        "currency": "USD",
        "unit": "1M input tokens",
        "kind": "api",
        "note": "Input-only embedding quote; vector dimensions and absent output rates are not completion tokens or free chat output.",
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation",
          "cache_creation_1h"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput"
        ],
        "catalogProvider": "openai",
        "catalogModelId": "text-embedding-3-large",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 8191,
          "output": 3072
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits.",
        "outputDimensions": {
          "default": 3072
        }
      },
      "pricing": {
        "input": 0.13
      }
    },
    "text-embedding-3-small": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false,
        "maxInput": 8192
      },
      "description": "Embedding model for semantic search, retrieval, clustering, and ranking pipelines",
      "sources": [
        "https://developers.openai.com/api/docs/guides/embeddings.md",
        "https://models.dev/api.json",
        "https://developers.openai.com/api/docs/pricing.md"
      ],
      "billing": {
        "currency": "USD",
        "unit": "1M input tokens",
        "kind": "api",
        "note": "Input-only embedding quote; vector dimensions and absent output rates are not completion tokens or free chat output.",
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation",
          "cache_creation_1h"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput"
        ],
        "catalogProvider": "openai",
        "catalogModelId": "text-embedding-3-small",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 8191,
          "output": 1536
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits.",
        "outputDimensions": {
          "default": 1536
        }
      },
      "pricing": {
        "input": 0.02
      }
    },
    "text-embedding-ada-002": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false,
        "maxInput": 8192
      },
      "description": "Embedding model for semantic search, retrieval, clustering, and ranking pipelines",
      "sources": [
        "https://developers.openai.com/api/docs/guides/embeddings.md",
        "https://models.dev/api.json",
        "https://developers.openai.com/api/docs/pricing.md"
      ],
      "billing": {
        "currency": "USD",
        "unit": "1M input tokens",
        "kind": "api",
        "note": "Input-only embedding quote; vector dimensions and absent output rates are not completion tokens or free chat output.",
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation",
          "cache_creation_1h"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput"
        ],
        "catalogProvider": "openai",
        "catalogModelId": "text-embedding-ada-002",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 8192,
          "output": 1536
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits.",
        "outputDimensions": {
          "default": 1536
        }
      },
      "pricing": {
        "input": 0.1
      }
    },
    "gpt-image-1": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true,
        "audioOutput": false
      },
      "description": "OpenAI image model for production generation, edits, and brand-safe visual workflows",
      "sources": [
        "https://models.dev/api.json"
      ],
      "billing": {
        "kind": "unverified-pricing",
        "note": "Native billing units and rates require exact route evidence; no generic text-token tariff inferred from media or embedding dimensions."
      },
      "limits": {
        "kind": "image",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxInput",
          "maxOutput"
        ],
        "catalogProvider": "openai",
        "catalogModelId": "gpt-image-1",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 0,
          "input": 0,
          "output": 0
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits."
      }
    },
    "gpt-image-2": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true,
        "audioOutput": false
      },
      "description": "Image model for prompt-driven generation, editing, and visual design workflows",
      "sources": [
        "https://models.dev/api.json"
      ],
      "billing": {
        "kind": "unverified-pricing",
        "note": "Native billing units and rates require exact route evidence; no generic text-token tariff inferred from media or embedding dimensions."
      },
      "limits": {
        "kind": "image",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxInput",
          "maxOutput"
        ],
        "catalogProvider": "openai",
        "catalogModelId": "gpt-image-2",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 0,
          "input": 0,
          "output": 0
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits."
      }
    },
    "gpt-image-2.5-flare": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true
      },
      "pricing": {},
      "sources": [
        "https://developers.openai.com/api/docs/models/gpt-image-2.5-flare.md",
        "https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst.md",
        "https://developers.openai.com/api/docs/pricing.md"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_tokens_by_modality",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "text_input": 5,
          "cached_text_input": 1.25,
          "image_input": 8,
          "cached_image_input": 2,
          "image_output": 30
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "image",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.openai.com/v1/images/generations",
        "routeLimitations": [
          "Do not reuse API image IDs as Codex chat aliases.",
          "Existing Kitsune Router adapter is prompt-only; no image edit inputs.",
          "No documented context/output token ceiling on model pages; leave unspecified.",
          "Flat input/output schema cannot represent both text and image input rates."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ]
      }
    },
    "gpt-image-2.5-sunburst": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true
      },
      "pricing": {},
      "sources": [
        "https://developers.openai.com/api/docs/models/gpt-image-2.5-flare.md",
        "https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst.md",
        "https://developers.openai.com/api/docs/pricing.md"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_tokens_by_modality",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "text_input": 5,
          "cached_text_input": 1.25,
          "image_input": 8,
          "cached_image_input": 2,
          "image_output": 30
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "image",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.openai.com/v1/images/generations",
        "routeLimitations": [
          "Do not reuse API image IDs as Codex chat aliases.",
          "Existing Kitsune Router adapter is prompt-only; no image edit inputs.",
          "No documented context/output token ceiling on model pages; leave unspecified.",
          "Flat input/output schema cannot represent both text and image input rates."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ]
      }
    }
  },
  "gemini": {
    "gemini-embedding-001": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false,
        "maxInput": 2048
      },
      "description": "Embedding model for semantic search, retrieval, clustering, and ranking pipelines",
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-embedding-001",
        "https://models.dev/api.json",
        "https://ai.google.dev/gemini-api/docs/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "1M input tokens",
        "kind": "api",
        "note": "Input-only embedding quote; vector dimensions and absent output rates are not completion tokens or free chat output.",
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation",
          "cache_creation_1h"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput"
        ],
        "catalogProvider": "google",
        "catalogModelId": "gemini-embedding-001",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {},
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits.",
        "outputDimensions": {
          "min": 128,
          "max": 3072,
          "recommended": [
            768,
            1536,
            3072
          ]
        }
      },
      "pricing": {
        "input": 0.15
      }
    },
    "gemini-3.1-flash-image": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true,
        "audioOutput": false,
        "maxInput": 131072,
        "maxOutput": 32768
      },
      "description": "Image model for prompt-driven generation, editing, and visual design workflows",
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image",
        "https://models.dev/api.json",
        "https://ai.google.dev/gemini-api/docs/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_tokens_by_modality",
        "kind": "api",
        "rates": {
          "text_image_input": 0.5,
          "text_output": 3,
          "image_output": 60
        },
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation"
        ],
        "note": "Published Gemini paid standard native modality rates; text/thinking output and image output have different prices, so no single generic output tariff. Cache read/write charges unverified. No account entitlement or inference verified."
      },
      "limits": {
        "kind": "image",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow"
        ],
        "catalogProvider": "google",
        "catalogModelId": "gemini-3.1-flash-image",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 131072,
          "output": 32768
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits.",
        "routeLimitations": [
          "Prompt-only image-generation adapter; native edit images, video/PDF inputs, grounding and generation controls are not forwarded."
        ]
      },
      "pricing": {
        "input": 0.5
      }
    },
    "gemini-3-pro-image": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true,
        "audioOutput": false,
        "maxInput": 65536,
        "maxOutput": 32768
      },
      "description": "Nano Banana Pro for higher-fidelity image generation and design-heavy edits",
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image",
        "https://models.dev/api.json",
        "https://ai.google.dev/gemini-api/docs/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_tokens_by_modality",
        "kind": "api",
        "rates": {
          "text_image_input": 2,
          "text_output": 12,
          "image_output": 120
        },
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation"
        ],
        "note": "Published Gemini paid standard native modality rates; text/thinking output and image output have different prices, so no single generic output tariff. Cache read/write charges unverified. No account entitlement or inference verified."
      },
      "limits": {
        "kind": "image",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow"
        ],
        "catalogProvider": "google",
        "catalogModelId": "gemini-3-pro-image",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 65536,
          "output": 32768
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits.",
        "routeLimitations": [
          "Prompt-only image-generation adapter; native edit images, video/PDF inputs, grounding and generation controls are not forwarded."
        ]
      },
      "pricing": {
        "input": 2
      }
    },
    "gemini-2.5-flash-image": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true,
        "audioOutput": false,
        "maxInput": 32768,
        "maxOutput": 32768
      },
      "description": "Nano Banana image model for fast generation, edits, and character-consistent assets",
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-image",
        "https://models.dev/api.json",
        "https://ai.google.dev/gemini-api/docs/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_tokens_by_modality",
        "kind": "api",
        "rates": {
          "text_image_input": 0.3,
          "text_output": 2.5,
          "image_output": 30
        },
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation"
        ],
        "note": "Published Gemini paid standard native modality rates; text/thinking output and image output have different prices, so no single generic output tariff. Cache read/write charges unverified. No account entitlement or inference verified."
      },
      "limits": {
        "kind": "image",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow"
        ],
        "catalogProvider": "google",
        "catalogModelId": "gemini-2.5-flash-image",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 32768,
          "output": 32768
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits.",
        "routeLimitations": [
          "Prompt-only image-generation adapter; native edit images, video/PDF inputs, grounding and generation controls are not forwarded."
        ]
      },
      "pricing": {
        "input": 0.3
      }
    },
    "gemini-3.1-flash-tts-preview": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": true,
        "maxInput": 8192,
        "maxOutput": 16384
      },
      "description": "Low-latency speech generation with steerable prompts and expressive audio tags",
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-tts-preview",
        "https://models.dev/api.json",
        "https://ai.google.dev/gemini-api/docs/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_text_input_audio_output_tokens",
        "kind": "api",
        "rates": {
          "text_input": 1,
          "audio_output": 20,
          "audio_tokens_per_second": 25
        },
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation"
        ],
        "note": "Native TTS text-input/audio-output token rates; generic chat completion counters must not be inferred from duration or characters. Audio generation charges require native audio counters, so no generic output tariff."
      },
      "limits": {
        "kind": "tts",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow"
        ],
        "catalogProvider": "google",
        "catalogModelId": "gemini-3.1-flash-tts-preview",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 8192,
          "output": 16384
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits.",
        "outputUnit": "audio tokens",
        "lifecycle": {
          "status": "scheduled-retirement",
          "retirementDate": "2026-11-17",
          "dateMeaning": "earliest-possible-shutdown",
          "source": "https://ai.google.dev/gemini-api/docs/deprecations",
          "asOf": "2026-10-17"
        }
      },
      "pricing": {
        "input": 1
      }
    },
    "gemini-2.5-flash-preview-tts": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": true,
        "maxInput": 8192,
        "maxOutput": 16384
      },
      "description": "Speech generation model for controllable voice, narration, and audio delivery",
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts",
        "https://models.dev/api.json",
        "https://ai.google.dev/gemini-api/docs/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_text_input_audio_output_tokens",
        "kind": "api",
        "rates": {
          "text_input": 0.5,
          "audio_output": 10,
          "audio_tokens_per_second": 25
        },
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation"
        ],
        "note": "Native TTS text-input/audio-output token rates; generic chat completion counters must not be inferred from duration or characters. Audio generation charges require native audio counters, so no generic output tariff."
      },
      "limits": {
        "kind": "tts",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow"
        ],
        "catalogProvider": "google",
        "catalogModelId": "gemini-2.5-flash-preview-tts",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 8192,
          "output": 16384
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits.",
        "outputUnit": "audio tokens",
        "lifecycle": {
          "status": "scheduled-retirement",
          "retirementDate": "2026-11-17",
          "dateMeaning": "earliest-possible-shutdown",
          "source": "https://ai.google.dev/gemini-api/docs/deprecations",
          "asOf": "2026-10-17"
        }
      },
      "pricing": {
        "input": 0.5
      }
    },
    "gemini-2.5-pro-preview-tts": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": true,
        "maxInput": 8192,
        "maxOutput": 16384
      },
      "description": "Speech generation model for controllable voice, narration, and audio delivery",
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro-preview-tts",
        "https://models.dev/api.json",
        "https://ai.google.dev/gemini-api/docs/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_text_input_audio_output_tokens",
        "kind": "api",
        "rates": {
          "text_input": 1,
          "audio_output": 20,
          "audio_tokens_per_second": 25
        },
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation"
        ],
        "note": "Native TTS text-input/audio-output token rates; generic chat completion counters must not be inferred from duration or characters. Audio generation charges require native audio counters, so no generic output tariff."
      },
      "limits": {
        "kind": "tts",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow"
        ],
        "catalogProvider": "google",
        "catalogModelId": "gemini-2.5-pro-preview-tts",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 8192,
          "output": 16384
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits.",
        "outputUnit": "audio tokens",
        "lifecycle": {
          "status": "scheduled-retirement",
          "retirementDate": "2026-11-17",
          "dateMeaning": "earliest-possible-shutdown",
          "source": "https://ai.google.dev/gemini-api/docs/deprecations",
          "asOf": "2026-10-17"
        }
      },
      "pricing": {
        "input": 1
      }
    },
    "gemini-embedding-2": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "maxInput": 8192
      },
      "pricing": {
        "input": 0.2
      },
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2",
        "https://ai.google.dev/gemini-api/docs/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_input_text_tokens",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "input": 0.2,
          "output": 0
        },
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent (array input: batchEmbedContents)",
        "routeLimitations": [
          "Only text/string-array inputs are supported by Kitsune Router adapter; structured inputs are String(object).",
          "Do not transfer multimodal capabilities from provider to this route.",
          "Preview ID deprecation page literally says embedding-2-preview; do not silently normalize that into gemini-embedding-2-preview."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput"
        ],
        "maxInput": 8192,
        "dimensions": {
          "min": 128,
          "max": 3072,
          "recommended": [
            768,
            1536,
            3072
          ]
        }
      }
    },
    "gemini-3.1-flash-lite-image": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true,
        "maxInput": 65536,
        "maxOutput": 4096
      },
      "pricing": {},
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image",
        "https://ai.google.dev/gemini-api/docs/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_tokens_by_modality",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "input": 0.25,
          "text_and_thinking_output": 1.5,
          "image_output": 30
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "image",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent",
        "routeLimitations": [
          "Kitsune Router image adapter only forwards text prompt and responseModalities; no edit image, resolution, aspect ratio controls."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow"
        ],
        "maxInput": 65536,
        "maxOutput": 4096
      }
    },
    "gemini-3.8-flash-tts": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "audioOutput": true,
        "maxInput": 8192,
        "maxOutput": 16384
      },
      "pricing": {},
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts",
        "https://ai.google.dev/gemini-api/docs/speech-generation",
        "https://ai.google.dev/gemini-api/docs/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_tokens_by_modality",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "text_input": 0.5,
          "audio_output": 9,
          "cached_input": 0.125,
          "valid_through": "2026-12-31",
          "from_2027_01_01": {
            "text_input": 1,
            "audio_output": 18,
            "cached_input": 0.25
          }
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "tts",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
        "routeLimitations": [
          "Cache storage is a token-hour rate, not a one-time cache-creation rate.",
          "No new-voice list verified.",
          "Known-model and existing Gemini voice tables synchronized; new voices not verified."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow"
        ],
        "maxInput": 8192,
        "maxOutput": 16384
      }
    },
    "gemini-3.8-flash-lite-tts": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "audioOutput": true,
        "maxInput": 8192,
        "maxOutput": 16384
      },
      "pricing": {},
      "sources": [
        "https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-lite-tts",
        "https://ai.google.dev/gemini-api/docs/deprecations"
      ],
      "billing": {
        "currency": "USD",
        "unit": "unverified",
        "kind": "api",
        "note": "Price or unit not independently verified; unknown is not free and must not inherit a chat-model fallback.",
        "rates": {},
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "tts",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent",
        "routeLimitations": [
          "Current specific price not located in fetched pricing body; leave price unknown.",
          "Known-model and existing Gemini voice tables synchronized; new voices not verified."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow"
        ],
        "maxInput": 8192,
        "maxOutput": 16384
      }
    }
  },
  "voyage-ai": {
    "voyage-code-4": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "maxInput": 32000
      },
      "pricing": {
        "input": 0.12
      },
      "sources": [
        "https://docs.voyageai.com/docs/embeddings.md",
        "https://docs.voyageai.com/docs/pricing.md"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_input_tokens",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "input": 0.12,
          "output": 0
        },
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.voyageai.com/v1/embeddings",
        "routeLimitations": [
          "Kitsune Router sends dimensions, not Voyage output_dimension; configurable dimensions/input_type need adapter mapping.",
          "Do not add voyage-context-4 or multimodal/rerank siblings through ordinary /embeddings without endpoint-specific support."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput"
        ],
        "maxInput": 32000,
        "dimensions": {
          "default": 1024,
          "choices": [
            256,
            512,
            1024,
            2048
          ]
        }
      }
    }
  },
  "mistral": {
    "mistral-embed": {
      "capabilities": {
        "tools": false,
        "reasoning": false,
        "search": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false,
        "maxInput": 8000
      },
      "description": "Embedding model for semantic search, retrieval, clustering, and ranking pipelines",
      "sources": [
        "https://docs.mistral.ai/models/mistral-embed-23-12.md",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "1M input tokens",
        "kind": "catalog-reference",
        "note": "Input-only embedding quote; vector dimensions and absent output rates are not completion tokens or free chat output.",
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation",
          "cache_creation_1h"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "gateway-media-adapter; exact route catalog comparison",
        "authenticatedRouteVerified": false,
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput"
        ],
        "catalogProvider": "mistral",
        "catalogModelId": "mistral-embed",
        "catalogAsOf": "2026-10-17",
        "catalogLimits": {
          "context": 8000,
          "output": 3072
        },
        "note": "Native modality support is not proof that this gateway adapter accepts reference images or other media. Embedding vector dimensions are not completion-token limits."
      },
      "pricing": {
        "input": 0.1
      }
    },
    "codestral-embed-2505": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false
      },
      "pricing": {
        "input": 0.15
      },
      "sources": [
        "https://docs.mistral.ai/models/codestral-embed-25-05"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_input_tokens",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "input": 0.15,
          "output": 0
        },
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.mistral.ai/v1/embeddings",
        "routeLimitations": [
          "Official retrieved page gives 8k; do not round it to an exact unverified integer.",
          "Alias codestral-embed may exist but this report verifies snapshot literal codestral-embed-2505."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ],
        "providerContextLabel": "8k"
      }
    }
  },
  "fireworks": {
    "fireworks/qwen3-embedding-8b": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false
      },
      "pricing": {
        "input": 0.1
      },
      "sources": [
        "https://docs.fireworks.ai/guides/querying-embeddings-models.md",
        "https://docs.fireworks.ai/serverless/pricing.md"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_input_tokens",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "input": 0.1,
          "output": 0
        },
        "unverifiedPriceFields": [
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.fireworks.ai/inference/v1/embeddings",
        "routeLimitations": [
          "Exact route is fireworks/qwen3-embedding-8b, not automatically accounts/fireworks/models/...",
          "4B and 0.6B are dedicated-only per docs, not serverless static additions.",
          "Existing nomic-ai/nomic-embed-text-v1.5 remains explicitly supported legacy; do not remove it for lacking library page."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ],
        "providerContextLabel": "40k"
      }
    }
  },
  "jina-ai": {
    "jina-embeddings-v5-text-small": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "maxInput": 32768
      },
      "pricing": {},
      "sources": [
        "https://jina.ai/embeddings",
        "https://docs.jina.ai",
        "https://api.jina.ai/v1/models"
      ],
      "billing": {
        "currency": "USD",
        "unit": "unverified",
        "kind": "api",
        "note": "Price or unit not independently verified; unknown is not free and must not inherit a chat-model fallback.",
        "rates": {},
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.jina.ai/v1/embeddings",
        "routeLimitations": [
          "Docs use unprefixed model ID; public /v1/models uses jina-ai/ prefix. Preserve this distinction.",
          "Raw public pricing.prompt is 0.00000005 small / 0.00000002 nano; do not assert USD/M mapping without unit provenance.",
          "Kitsune Router only passes input/encoding_format/dimensions, not task or multimodal options.",
          "New v5 entries explicitly declared in registry.models and embeddingConfig.models; no general nested model merge."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput"
        ],
        "maxInput": 32768,
        "dimensions": 1024
      }
    },
    "jina-embeddings-v5-text-nano": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "maxInput": 8192
      },
      "pricing": {},
      "sources": [
        "https://jina.ai/embeddings",
        "https://docs.jina.ai",
        "https://api.jina.ai/v1/models"
      ],
      "billing": {
        "currency": "USD",
        "unit": "unverified",
        "kind": "api",
        "note": "Price or unit not independently verified; unknown is not free and must not inherit a chat-model fallback.",
        "rates": {},
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "embedding",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.jina.ai/v1/embeddings",
        "routeLimitations": [
          "Docs use unprefixed model ID; public /v1/models uses jina-ai/ prefix. Preserve this distinction.",
          "Raw public pricing.prompt is 0.00000005 small / 0.00000002 nano; do not assert USD/M mapping without unit provenance.",
          "Kitsune Router only passes input/encoding_format/dimensions, not task or multimodal options.",
          "New v5 entries explicitly declared in registry.models and embeddingConfig.models; no general nested model merge."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput"
        ],
        "maxInput": 8192,
        "dimensions": 768
      }
    }
  },
  "elevenlabs": {
    "eleven_v4": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "audioOutput": true
      },
      "pricing": {},
      "sources": [
        "https://elevenlabs.io/docs/overview/models.md",
        "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
        "https://elevenlabs.io/pricing/api"
      ],
      "billing": {
        "currency": "USD",
        "unit": "subscription_credits_per_character",
        "kind": "subscription",
        "note": "Subscription credits and promotional character multipliers; no flat USD/token or stable USD/character rate verified.",
        "rates": {},
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "tts",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}; body.model_id exact",
        "routeLimitations": [
          "Public ID invocation needs <model>/<voice_id>; bare model is treated as a voice by current adapter.",
          "Subscription credits/character multipliers and promotion through Oct 12: not a flat USD/token rate.",
          "New IDs synchronized in registry.models, ttsConfig.models and selector; model/voice invocation remains required."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ],
        "characters": 10000
      }
    },
    "eleven_v4_turbo": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "audioOutput": true
      },
      "pricing": {},
      "sources": [
        "https://elevenlabs.io/docs/overview/models.md",
        "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
        "https://elevenlabs.io/pricing/api"
      ],
      "billing": {
        "currency": "USD",
        "unit": "subscription_credits_per_character",
        "kind": "subscription",
        "note": "Subscription credits and promotional character multipliers; no flat USD/token or stable USD/character rate verified.",
        "rates": {},
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "tts",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}; body.model_id exact",
        "routeLimitations": [
          "Public ID invocation needs <model>/<voice_id>; bare model is treated as a voice by current adapter.",
          "Subscription credits/character multipliers and promotion through Oct 12: not a flat USD/token rate.",
          "New IDs synchronized in registry.models, ttsConfig.models and selector; model/voice invocation remains required."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ]
      }
    }
  },
  "inworld": {
    "inworld-tts-2": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "audioOutput": true
      },
      "pricing": {},
      "sources": [
        "https://docs.inworld.ai/tts/tts-models",
        "https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech",
        "https://docs.inworld.ai/portal/billing",
        "https://inworld.ai/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_characters",
        "kind": "api-on-demand",
        "note": "On-demand USD per million characters; paid-plan prices differ. Request limit is UTF-16 code units, not billing tokens.",
        "rates": {
          "rate": 25
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "tts",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.inworld.ai/tts/v1/voice; body.modelId exact",
        "routeLimitations": [
          "Source 1.5-mini/max are deprecated; display names embed old per-minute estimates.",
          "On-demand TTS-2 is $25/M characters and Flash $15/M characters; paid tiers differ.",
          "Explicit registry and selector entries now supply known model IDs; explicit voice is recommended."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ],
        "utf16CodeUnits": 2000
      }
    },
    "inworld-tts-2-flash": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "audioOutput": true
      },
      "pricing": {},
      "sources": [
        "https://docs.inworld.ai/tts/tts-models",
        "https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech",
        "https://docs.inworld.ai/portal/billing",
        "https://inworld.ai/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "million_characters",
        "kind": "api-on-demand",
        "note": "On-demand USD per million characters; paid-plan prices differ. Request limit is UTF-16 code units, not billing tokens.",
        "rates": {
          "rate": 15
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "tts",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://api.inworld.ai/tts/v1/voice; body.modelId exact",
        "routeLimitations": [
          "Source 1.5-mini/max are deprecated; display names embed old per-minute estimates.",
          "On-demand TTS-2 is $25/M characters and Flash $15/M characters; paid tiers differ.",
          "Explicit registry and selector entries now supply known model IDs; explicit voice is recommended."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ],
        "utf16CodeUnits": 2000
      }
    }
  },
  "recraft": {
    "recraftv4_1_flash": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true
      },
      "pricing": {},
      "sources": [
        "https://www.recraft.ai/docs/api-reference/models/recraft-v4-1-flash",
        "https://www.recraft.ai/docs/api-reference/models/recraft-v4-1",
        "https://www.recraft.ai/docs/api-reference/endpoints",
        "https://www.recraft.ai/docs/api-reference/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "image",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "rate": 0.007
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "image",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://external.api.recraft.ai/v1/images/generations",
        "routeLimitations": [
          "Use default JSON/url output; multipart preview/streaming not supported by generic Kitsune Router adapter.",
          "No token context/output limit should be invented."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ]
      }
    },
    "recraftv4_1": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true
      },
      "pricing": {},
      "sources": [
        "https://www.recraft.ai/docs/api-reference/models/recraft-v4-1-flash",
        "https://www.recraft.ai/docs/api-reference/models/recraft-v4-1",
        "https://www.recraft.ai/docs/api-reference/endpoints",
        "https://www.recraft.ai/docs/api-reference/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "image",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "rate": 0.035
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "image",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://external.api.recraft.ai/v1/images/generations",
        "routeLimitations": [
          "Use default JSON/url output; multipart preview/streaming not supported by generic Kitsune Router adapter.",
          "No token context/output limit should be invented."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ]
      }
    },
    "recraftv4_1_vector": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true
      },
      "pricing": {},
      "sources": [
        "https://www.recraft.ai/docs/api-reference/models/recraft-v4-1-flash",
        "https://www.recraft.ai/docs/api-reference/models/recraft-v4-1",
        "https://www.recraft.ai/docs/api-reference/endpoints",
        "https://www.recraft.ai/docs/api-reference/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "image",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "rate": 0.08
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "image",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://external.api.recraft.ai/v1/images/generations",
        "routeLimitations": [
          "Use default JSON/url output; multipart preview/streaming not supported by generic Kitsune Router adapter.",
          "No token context/output limit should be invented."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ]
      }
    },
    "recraftv4_1_pro": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true
      },
      "pricing": {},
      "sources": [
        "https://www.recraft.ai/docs/api-reference/models/recraft-v4-1-flash",
        "https://www.recraft.ai/docs/api-reference/models/recraft-v4-1",
        "https://www.recraft.ai/docs/api-reference/endpoints",
        "https://www.recraft.ai/docs/api-reference/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "image",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "rate": 0.21
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "image",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://external.api.recraft.ai/v1/images/generations",
        "routeLimitations": [
          "Use default JSON/url output; multipart preview/streaming not supported by generic Kitsune Router adapter.",
          "No token context/output limit should be invented."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ]
      }
    },
    "recraftv4_1_pro_vector": {
      "capabilities": {
        "tools": false,
        "vision": false,
        "search": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": true
      },
      "pricing": {},
      "sources": [
        "https://www.recraft.ai/docs/api-reference/models/recraft-v4-1-flash",
        "https://www.recraft.ai/docs/api-reference/models/recraft-v4-1",
        "https://www.recraft.ai/docs/api-reference/endpoints",
        "https://www.recraft.ai/docs/api-reference/pricing"
      ],
      "billing": {
        "currency": "USD",
        "unit": "image",
        "kind": "api",
        "note": "Published native API metadata only; no account entitlement or live inference verified. Non-token and modality-specific rates are not generic token prices.",
        "rates": {
          "rate": 0.3
        },
        "unverifiedPriceFields": [
          "input",
          "output",
          "cached",
          "cache_creation"
        ]
      },
      "limits": {
        "kind": "image",
        "scope": "documented-native-api; gateway route restricted to tested request shape",
        "contextScope": "maxInput is an input allowance, not a total context window; dimensions are not generated tokens",
        "authenticatedRouteVerified": false,
        "route": "POST https://external.api.recraft.ai/v1/images/generations",
        "routeLimitations": [
          "Use default JSON/url output; multipart preview/streaming not supported by generic Kitsune Router adapter.",
          "No token context/output limit should be invented."
        ],
        "unverifiedCapabilityFields": [
          "contextWindow",
          "maxOutput",
          "maxInput"
        ]
      }
    }
  }
};

// Native rate cards captured 2026-10-21. These are billing facts, not an
// extension of the token calculator or proof of authenticated route support.
// Raw bodies, UTC timestamps and SHA-256s: pricing refresh's media/sources.json.
const refreshDate = "2026-10-21";
const unknownTokenRates = ["input", "output", "cached", "reasoning", "cache_creation", "cache_creation_1h", "cache_write_30m", "cache_write_12h"];
const unknownTokenQuote = Object.fromEntries(unknownTokenRates.map(field => [field, null]));

function mediaFact(provider, id, kind, sources, billing, limits = {}, pricing = {}) {
  const previous = mediaModels[provider]?.[id];
  const maxInput = limits.maxInput;
  (mediaModels[provider] ||= {})[id] = {
    ...previous,
    capabilities: {
      tools: false, reasoning: false, search: false, vision: false, pdf: false,
      audioInput: kind === "stt", videoInput: false,
      imageOutput: kind === "image", audioOutput: kind === "tts",
      ...(maxInput !== undefined ? { maxInput } : {}),
    },
    pricing: { ...unknownTokenQuote, ...pricing },
    sources: [...new Set([...(previous?.sources || []), ...sources])],
    billing: {
      currency: null, unit: "unverified", kind: "unverified-pricing", rates: {},
      asOf: refreshDate, tokenPricingSupported: false,
      unverifiedPriceFields: [...unknownTokenRates],
      ...billing,
    },
    limits: {
      ...previous?.limits,
      kind, scope: "documented-native-billing; gateway adapter restrictions apply",
      authenticatedRouteVerified: false,
      unverifiedCapabilityFields: ["contextWindow", "maxOutput", ...(maxInput === undefined ? ["maxInput"] : [])],
      ...limits,
    },
  };
}

const voyageSources = ["https://docs.voyageai.com/docs/pricing.md", "https://docs.voyageai.com/docs/embeddings.md"];
for (const [id, input, maxInput, flexible] of [
  ["voyage-4-large", 0.12, 32000, true], ["voyage-4", 0.06, 32000, true], ["voyage-4-lite", 0.02, 32000, true],
  ["voyage-3-large", 0.18, 32000, true], ["voyage-3.5", 0.06, 32000, true], ["voyage-3.5-lite", 0.02, 32000, true],
  ["voyage-code-4", 0.12, 32000, true], ["voyage-code-3", 0.18, 32000, true],
  ["voyage-finance-2", 0.12, 32000, false], ["voyage-law-2", 0.12, 16000, false], ["voyage-multilingual-2", 0.12, 32000, false],
]) {
  mediaFact("voyage-ai", id, "embedding", voyageSources, {
    currency: "USD", unit: "million_input_tokens", kind: "api", rates: { input }, tokenPricingSupported: true,
    unverifiedPriceFields: unknownTokenRates.filter(field => field !== "input"),
    note: "Input-only standard API tariff. Output dimensions and catalog completion zeros are not free completion/cache rates. Account free balances and Batch discounts are not applied to ordinary requests.",
    qualifiers: {
      batchDiscountPercent: 33, batchFreeTokensApply: false,
      freeAllowance: id.startsWith("voyage-4") || id === "voyage-code-4" ? { inputTokens: 200000000, scope: "per_account" }
        : id === "voyage-finance-2" || id === "voyage-law-2" ? { inputTokens: 50000000, scope: "per_account" }
          : { note: "Older-model table says no free tokens; introductory paragraph conflicts for code-3 and multilingual-2. Do not assume eligibility." },
    },
  }, {
    maxInput, dimensions: flexible ? { default: 1024, choices: [256, 512, 1024, 2048] } : { default: 1024 },
    route: "POST https://api.voyageai.com/v1/embeddings",
    routeLimitations: ["Text/string-array inputs only. Gateway dimensions is not mapped to Voyage output_dimension; input_type and truncation are not forwarded. Contextual, multimodal and rerank endpoints are separate adapters."],
  }, { input });
}

const assemblySources = ["https://www.assemblyai.com/pricing", "https://www.assemblyai.com/llms/models.md"];
for (const [id, rate] of [["universal-3-5-pro", 0.21], ["universal-2", 0.15], ["best", 0.21], ["nano", 0.15], ["universal-3-pro", null]]) {
  mediaFact("assemblyai", id, "stt", assemblySources, {
    currency: "USD", unit: "audio_hour", kind: rate === null ? "unverified-pricing" : "api", rates: rate === null ? {} : { rate },
    note: "Pre-recorded submitted audio, not streaming session duration. Channels multiply duration; add-ons stack. US and EU base prices match. No token rate or free-credit balance inferred.",
    qualifiers: { endpoint: "pre_recorded", billingPerChannel: true, addonsIncluded: false, streamingRateApplies: false },
  }, {
    route: "POST /v2/upload then /v2/transcript; speech_models array; poll transcript id",
    routeLimitations: ["Current adapter returns text only and drops audio_duration and speech_model_used. No realtime WebSocket support. Authorization header construction needs review before claiming route verification."],
    ...(id === "best" || id === "nano" ? { lifecycle: { status: "deprecated-alias", replacement: id === "best" ? "universal-3-5-pro" : "universal-2" } } : {}),
    ...(rate === null ? { note: "No exact universal-3-pro tariff in the current primary rate card; do not transfer the universal-3-5-pro quote or infer retirement from absence." } : {}),
  });
}

const deepgramSources = ["https://deepgram.com/pricing", "https://developers.deepgram.com/docs/models-languages-overview.md"];
for (const [id, rates] of [["nova-3", { monolingual: 0.0043, multilingual: 0.0052 }], ["whisper-large", { rate: 0.0048 }], ["nova-2", {}], ["nova", {}]]) {
  mediaFact("deepgram", id, "stt", deepgramSources, {
    currency: "USD", unit: "audio_minute", kind: Object.keys(rates).length ? "api-pay-as-you-go" : "unverified-pricing", rates,
    qualifiers: {
      endpoint: "pre_recorded", billingPerChannel: true, rounding: "per_second", addonsIncluded: false,
      ...(id === "nova-3" ? { growthRates: { monolingual: 0.0036, multilingual: 0.0043 }, languageSelectionRequired: true } : {}),
    },
    note: "REST pre-recorded rate, not the streaming promotion. The monolingual/multilingual selection and processed channels matter. Growth commitments/overages and free-credit balances are account-specific. Older-model streaming quotes do not establish REST prices.",
  }, {
    route: "POST https://api.deepgram.com/v1/listen?model={model}",
    routeLimitations: ["Gateway sets language or detect_language, not arbitrary multilingual options; native metadata.duration/channels are discarded when normalizing to text. Do not select the monolingual rate solely from a transcript's language."],
  });
}

const fishSources = ["https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits.md", "https://docs.fish.audio/developer-guide/models-pricing/models-overview.md", "https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md"];
for (const id of ["s2.1-pro-free", "s2.1-pro", "s2-pro", "s1"]) {
  const free = id === "s2.1-pro-free";
  mediaFact("fish-audio", id, "tts", fishSources, {
    currency: "USD", unit: "million_utf8_bytes", kind: free ? "free-development" : "api-pay-as-you-go", rates: { rate: free ? 0 : 15 },
    qualifiers: { ...(free ? { fairUse: true, productionGuarantees: false } : { productionGuarantees: null }), encoding: "UTF-8" },
    note: "Native input UTF-8 bytes, not characters, UTF-16 code units or model tokens. The free development model is a specific fair-use tariff, not a free voice namespace; account entitlement was not verified.",
  }, {
    route: "POST https://api.fish.audio/v1/tts; model header and optional reference_id",
    routeLimitations: ["Current binary-audio normalization does not retain native billing counters. Voice reference IDs are not priced model IDs. Generic parser requires an explicit model/voice pair until bare-model selection is verified."],
    ...(id === "s1" ? { lifecycle: { status: "scheduled-retirement", retirementDate: "2026-12-31", replacement: "s2.1-pro", afterRetirement: "requests are served and billed as s2.1-pro" } } : {}),
  });
}

const cartesiaSources = ["https://docs.cartesia.ai/pricing.md", "https://cartesia.ai/pricing", "https://docs.cartesia.ai/build-with-cartesia/tts-models/api-changes.md", "https://docs.cartesia.ai/build-with-cartesia/tts-models/latest.md"];
for (const id of ["sonic-3.6", "sonic-3.6-2026-08-27", "sonic-3.5", "sonic-3", "sonic-2"]) {
  mediaFact("cartesia", id, "tts", cartesiaSources, {
    currency: null, unit: "subscription_credits_per_character", kind: "subscription", rates: { approximate_credits_per_character: 1 },
    note: "Transcript preprocessing affects credit counts. Included subscription credits are not a cash-per-token tariff; overages are separate USD per million credits and vary by plan.",
    qualifiers: { approximate: true, overage: { currency: "USD", unit: "million_credits", rates: { pro: 65, startup: 45, scale: 38 } } },
  }, {
    route: "POST https://api.cartesia.ai/tts/bytes",
    routeLimitations: ["Gateway pins Cartesia-Version 2024-06-10 and emits voice mode/id, not the newer documented voice string. No latest-version feature or voice entitlement is implied. Binary normalization drops native credit usage."],
    ...(id === "sonic-2" ? { lifecycle: { status: "retired", retirementDate: "2026-10-20", source: cartesiaSources[2] } } : {}),
  });
}

const elevenSources = ["https://elevenlabs.io/pricing/api", "https://elevenlabs.io/docs/overview/models.md", "https://elevenlabs.io/docs/api-reference/text-to-speech/convert.md"];
for (const [id, rate, characters] of [
  ["eleven_v4", 0.08, 10000], ["eleven_v4_turbo", 0.04, null], ["eleven_v3", 0.08, 5000],
  ["eleven_multilingual_v2", 0.08, 10000], ["eleven_flash_v2_5", 0.04, 40000], ["eleven_turbo_v2_5", 0.04, null],
]) {
  mediaFact("elevenlabs", id, "tts", elevenSources, {
    currency: "USD", unit: "subscription_credits_per_character", kind: "subscription", rates: {},
    apiReference: { currency: "USD", unit: "thousand_characters", rates: { rate }, asOf: refreshDate, scope: "published ElevenAPI reference; plan allowance/credits are independent" },
    note: "Keep subscription-credit accounting separate from the published ElevenAPI character quote. Approximate minutes on the price page are not duration billing, and old promotional multipliers are not a current token tariff.",
  }, {
    ...(characters ? { characters } : {}),
    route: "POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}; body.model_id exact",
    routeLimitations: [
      "Current adapter requires model/voice; a bare ID is treated as a voice. It returns only audio and drops character-cost headers.",
      ...(id.startsWith("eleven_v4") ? ["Model overview points v4 to Text to Dialogue and v4 Turbo to its WebSocket. Compatibility with this gateway's legacy TTS endpoint is unverified; no dialogue/WebSocket adapter was added."] : []),
    ],
  });
}

for (const [id, rate, paidPlanRates] of [
  ["inworld-tts-2", 25, { Creator: 20, Builder: 17.5, Developer: 15, Growth: 12.5 }],
  ["inworld-tts-2-flash", 15, { Creator: 10, Builder: 9, Developer: 8, Growth: 7 }],
  ["inworld-tts-1.5-mini", null, null], ["inworld-tts-1.5-max", null, null],
]) {
  mediaFact("inworld", id, "tts", ["https://inworld.ai/pricing", "https://docs.inworld.ai/tts/tts-models", "https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech.md"], {
    currency: "USD", unit: "million_characters", kind: rate === null ? "unverified-pricing" : "api-on-demand", rates: rate === null ? {} : { rate },
    qualifiers: {
      ...(paidPlanRates ? { paidPlanRates, overage: "same_as_plan_rate" } : {}), credits: "USD_denominated", enterprise: "custom_not_a_fixed_tariff",
      billingCharacterUnit: "utf16_code_units", nativeUsageFields: { characters: "usage.processedCharactersCount", model: "usage.modelId" }, streamingCharacterCount: "sum_messages",
    },
    note: "On-demand USD/character quote is separate from paid-plan rates and included balances. Approximate characters/minute are examples, not duration billing. Request limits are UTF-16 code units, not token ceilings. Old 1.5 models are deprecated and have no verified current quote.",
  }, {
    ...(rate !== null ? { utf16CodeUnits: 2000 } : { lifecycle: { status: "deprecated", replacement: "inworld-tts-2" } }),
    routeLimitations: ["Gateway forwards text, voiceId, modelId and fixed MP3 configuration only; no new steering, timestamps, cloning or STT adapter was added."],
  });
}

for (const [id, maxInput, dimensions, rawPrompt] of [
  ["jina-embeddings-v5-text-small", 32768, 1024, "0.00000005"], ["jina-embeddings-v5-text-nano", 8192, 768, "0.00000002"],
  ["jina-embeddings-v4", 32768, 2048, "0.00000005"], ["jina-embeddings-v3", 8192, 1024, "0.00000005"],
  ["jina-embeddings-v2-base-en", 8192, 768, "0.00000005"], ["jina-embeddings-v2-base-code", 8192, 768, "0.00000005"],
]) {
  mediaFact("jina-ai", id, "embedding", ["https://jina.ai/embeddings", "https://docs.jina.ai/api.md", "https://api.jina.ai/v1/models"], {
    currency: null, unit: "unverified", kind: "api", rates: {},
    catalogReference: { modelId: `jina-ai/${id}`, prompt: rawPrompt, currency: null, unit: "unverified" },
    note: "Public model catalog exposes raw prompt prices but no independent currency/unit provenance. Checkout currencies vary (USD/EUR/others), purchased-token plans and grandfathered recharge prices differ. Neither catalog completion/cache zeros nor vector dimensions establish free tokens; no USD conversion is applied.",
  }, {
    maxInput, dimensions, route: "POST https://api.jina.ai/v1/embeddings",
    routeLimitations: ["Registry nested models are not automatically public model registrations. Gateway passes ordinary input/encoding_format/dimensions only, not task, typed multimodal inputs or late chunking. No new omni/reranker IDs or native input fields are advertised."],
  });
}

const pollySources = ["https://aws.amazon.com/polly/pricing/", "https://docs.aws.amazon.com/polly/latest/dg/limits.html"];
for (const [id, rate, govCloud] of [["standard", 4, 4.8], ["neural", 16, 19.2], ["long-form", 100, null], ["generative", 30, null]]) {
  mediaFact("aws-polly", id, "tts", pollySources, {
    currency: "USD", unit: "million_characters", kind: "api-reference", rates: { rate },
    note: "Standard regional price outside account free allowances; SSML tags are not billed characters. Speech and Speech Marks are separate requests. Do not apply AWS GovCloud prices to ordinary regions or infer a free token rate from signup credits.",
    qualifiers: { region: "standard AWS regional reference", ssmlTagsBilled: false, ...(govCloud !== null ? { govCloud: { currency: "USD", rate: govCloud } } : {}) },
  }, {
    routeSupported: false, billedCharacters: 3000, totalCharacters: 6000,
    routeLimitations: ["Registry declares aws-polly but no TTS format handler or SigV4 signer exists. Engine names are not voice IDs. Async SynthesizeSpeechTask's larger limits are not synchronous /v1/speech limits."],
  });
}

const bflSources = ["https://bfl.ai/pricing", "https://docs.bfl.ai/quick_start/pricing.md"];
for (const [id, first, additional, reference] of [
  ["flux-2-pro", 0.03, 0.015, 0.015], ["flux-2-max", 0.07, 0.03, 0.03],
  ["flux-2-flex", 0.05, 0.05, 0.05], ["flux-2-klein-9b", 0.015, 0.002, 0.002], ["flux-2-klein-4b", 0.014, 0.001, 0.001],
]) {
  mediaFact("black-forest-labs", id, "image", bflSources, {
    currency: "USD", unit: "megapixel", kind: "api", rates: { first_output_megapixel: first, additional_output_megapixel: additional, reference_megapixel: reference },
    qualifiers: { pixelsPerMegapixel: 1048576, rounding: "ceil_per_image", referenceImageCapMegapixels: 4, multipleReferencesMegapixelsEach: 1, usdPerCredit: 0.01 },
    note: "BFL defines a billing MP as 1024x1024 pixels. Round each generated/reference image separately; the first output MP is a base charge. Reference images over 4 MP are resized; with multiple references each is counted as 1 MP. This is not fal's endpoint pricing.",
  }, {
    route: `POST https://api.bfl.ai/v1/${id}`,
    routeLimitations: ["Gateway forwards prompt/width/height and legacy image_prompt, not native FLUX.2 input_image fields, grounding, multiple references or output quality. Submission cost is not retained after polling/normalization."],
  });
}
for (const [id, rate] of [["flux-pro-1.1", 0.04], ["flux-pro-1.1-ultra", 0.06], ["flux-pro", 0.05], ["flux-dev", 0.025], ["flux-kontext-pro", 0.04], ["flux-kontext-max", 0.08]]) {
  mediaFact("black-forest-labs", id, "image", bflSources, {
    currency: "USD", unit: "image", kind: "api", rates: { rate }, qualifiers: { usdPerCredit: 0.01 },
    note: "Native BFL FLUX.1 per-image quote, not model token pricing or another host's rate.",
  }, { routeLimitations: ["No native edit/control/quality support beyond the existing legacy adapter's prompt, size and image_prompt fields is claimed."] });
}

const falFacts = [
  ["fal-ai/flux/schnell", "output_megapixel", { rate: 0.003 }, "ceil_per_image"],
  ["fal-ai/flux/dev", "output_megapixel", { rate: 0.025 }, "ceil_per_image"],
  ["fal-ai/flux-2", "output_megapixel", { rate: 0.012 }, "unverified"],
  ["fal-ai/flux-pro/v1.1", "output_megapixel", { rate: 0.04 }, "ceil_per_image"],
  ["fal-ai/flux-pro/v1.1-ultra", "image", { rate: 0.06 }, "not_applicable"],
  ["fal-ai/recraft-v3", "image_by_style", { raster: 0.04, vector: 0.08 }, "not_applicable"],
  ["fal-ai/ideogram/v2", "image", { rate: 0.08 }, "not_applicable"],
  ["fal-ai/ideogram/v3", "image_by_quality", { TURBO: 0.03, BALANCED: 0.06, QUALITY: 0.09 }, "not_applicable"],
  ["fal-ai/stable-diffusion-v35-large", "output_megapixel", { rate: 0.065 }, "unverified"],
];
for (const [id, unit, rates, rounding] of falFacts) {
  mediaFact("fal-ai", id, "image", [`https://fal.ai/models/${id}`], {
    currency: "USD", unit, kind: "api", rates, qualifiers: { rounding },
    note: "Exact fal-hosted endpoint quote, not the model vendor's API tariff. Resolution, output count and endpoint-native quality/style controls may change the cost. Undocumented MP rounding is deliberately unknown.",
  }, { routeLimitations: ["Gateway only maps prompt/image_size/num_images and legacy image_url; style and native rendering_speed (Ideogram V3), safety and edit controls are not forwarded. The recraft-v3 public page redirects to recraft/v3/text-to-image; legacy endpoint alias availability is unverified."] });
}

const recraftSources = ["https://www.recraft.ai/docs/api-reference/pricing"];
for (const [id, rate, output] of [
  ["recraftv4_1_flash", 0.007, "raster"], ["recraftv4_1", 0.035, "raster"], ["recraftv4_1_vector", 0.08, "vector"],
  ["recraftv4_1_pro", 0.21, "pro_raster_2K"], ["recraftv4_1_pro_vector", 0.3, "pro_vector"],
  ["recraftv4", 0.04, "raster"], ["recraftv4_pro", 0.25, "pro_raster"], ["recraftv4_vector", 0.08, "vector"],
  ["recraftv4_pro_vector", 0.3, "pro_vector"], ["recraftv3", 0.04, "raster"], ["recraftv2", 0.022, "raster"],
]) {
  mediaFact("recraft", id, "image", recraftSources, {
    currency: "USD", unit: "image", kind: "api", rates: { rate },
    qualifiers: { output, unitsPerUsd: 1000, styleReferenceCreationUsdPerRequest: 0.005 },
    note: "Native image tariff. Style-reference generation separately creates a style for $0.005/request; gateway does not forward style references. Response credits are API units, not language-model tokens.",
  }, { routeLimitations: ["Existing JSON image-generation request only; no multipart previews, streaming, style-reference creation or editing adapter was added."] });
}

const stabilitySources = ["https://platform.stability.ai/pricing", "https://docs.stability.ai/api-reference/generate/stable-diffusion-35.md"];
for (const [id, rate] of [["stable-image-ultra", 0.08], ["stable-image-core", 0.03], ["sd3.5-large", 0.065], ["sd3.5-large-turbo", 0.04], ["sd3.5-medium", 0.035]]) {
  mediaFact("stability-ai", id, "image", stabilitySources, {
    currency: "USD", unit: "image", kind: "api", rates: { rate }, qualifiers: { usdPerCredit: 0.01 },
    note: "Per-generation credits converted using Stability's explicit $0.01/credit, not a fabricated token rate. Signup credits do not make the model free.",
  }, {
    characters: 10000, routeSupported: false,
    routeLimitations: ["Primary API requires multipart/form-data but current Kitsune Router adapter sends application/json. Published prices are reference facts, not proof this route executes. Native sd3.5-flash exists but must not be advertised before fixing that adapter."],
  });
}

const runwaySources = ["https://docs.dev.runwayml.com/guides/pricing.md", "https://docs.dev.runwayml.com/api.md"];
for (const [id, unit, rates, kind] of [
  ["gen4_image", "image_by_resolution", { "720p": 0.05, "1080p": 0.08 }, "image"],
  ["gen4_image_turbo", "image", { rate: 0.02 }, "image"],
  ["gen4.5", "output_second", { rate: 0.12 }, "video"], ["gen4_turbo", "output_second", { rate: 0.05 }, "video"],
  ["gen4_aleph", "unverified", {}, "video"], ["gen3a_turbo", "unverified", {}, "video"],
]) {
  mediaFact("runwayml", id, kind, runwaySources, {
    currency: "USD", unit, kind: Object.keys(rates).length ? "api-reference" : "unverified-pricing", rates,
    qualifiers: { usdPerCredit: 0.01, taxIncluded: false, ...(id === "gen4.5" ? { professionalOutputSurchargeUsdPerSecond: 0.05, hdrSurchargeUsdPerSecond: 0.2, hdrAbove4MegapixelsSurchargeUsdPerSecond: 0.4 } : {}) },
    note: "Runway Dev credits have an explicit $0.01 conversion and are not the consumer subscription allowance. Resolution and optional professional/HDR output add-ons matter. Missing old-model rows do not establish retirement.",
  }, {
    ...(kind === "video" ? { routeSupported: false } : {}),
    routeLimitations: ["Registry only enables image service; video entries do not have videoConfig or a native /videos adapter. Existing image adapter emits aspect labels where Runway requires model-specific pixel ratios; native resolution/outputFormat controls are not forwarded."],
  });
}

const nanobananaSources = ["https://nanobananaapi.ai/", "https://docs.nanobananaapi.ai/nanobanana-api/generate-or-edit-image.md", "https://docs.nanobananaapi.ai/nanobanana-api/generate-image-pro.md"];
for (const [id, unit, rates, routeSupported] of [
  ["nanobanana-flash", "image", { rate: 0.02 }, true],
  ["nanobanana-pro", "image_by_resolution", { "1K": 0.09, "2K": 0.09, "4K": 0.12 }, false],
]) {
  mediaFact("nanobanana", id, "image", nanobananaSources, {
    currency: "USD", unit, kind: "reseller-api-reference", rates,
    note: "NanoBananaAPI.ai reseller's quote, not Google Gemini billing. The Flash gateway alias selects the legacy generate endpoint; Pro uses generate-pro natively and is not selected by this adapter.",
  }, { routeSupported, routeLimitations: ["Adapter ignores the model ID and always posts /nanobanana/generate, then normalizes one result URL. Pro/Generate-2 endpoints and resolution selectors need adapter work; do not inherit Google model token pricing."] });
}

// Local deployments have operator compute/licensing costs, not a universal $0
// API tariff. No-auth public services likewise are not published free token APIs.
for (const [provider, ids, kind, source] of [
  ["comfyui", ["flux-dev", "sdxl"], "image", "https://github.com/comfyanonymous/ComfyUI"],
  ["sdwebui", ["stable-diffusion-v1-5", "sdxl-base-1.0"], "image", "https://github.com/AUTOMATIC1111/stable-diffusion-webui"],
  ["coqui", ["tts_models/en/ljspeech/tacotron2-DDC"], "tts", "https://github.com/coqui-ai/TTS"],
  ["tortoise", ["tortoise-v2"], "tts", "https://github.com/neonbjb/tortoise-tts"],
  ["selfhosted-stt", ["whisper-1"], "stt", "https://github.com/mudler/LocalAI"],
  ["selfhosted-tts", ["kokoro"], "tts", "https://github.com/remsky/Kokoro-FastAPI"],
  ["selfhosted-embedding", ["embedding"], "embedding", "https://github.com/huggingface/text-embeddings-inference"],
]) {
  for (const id of ids) mediaFact(provider, id, kind, [source], {
    kind: "operator-managed", unit: "operator_defined", note: "Operator-managed deployment and model selection. Compute, licensing and any private tariff are unknown, not free; preserve explicit operator null/zero quotes instead of imposing vendor API prices.",
  }, { routeLimitations: ["Configured backend chooses the actual model and limits. No vendor context/output-token ceiling or multimodal option is inferred from this deployment label."] });
}
for (const [provider, billingKind, source, ids] of [
  ["google-tts", "unofficial-service", "https://github.com/zlargon/google-tts", [
    "af", "ar", "bg", "bn", "bs", "ca", "cs", "cy", "da", "de", "el", "en", "eo", "es", "et", "fi", "fr", "gu", "hi", "hr",
    "hu", "hy", "id", "is", "it", "ja", "jw", "km", "kn", "ko", "la", "lv", "mk", "ml", "mr", "my", "ne", "nl", "no", "pl", "pt", "ro", "ru",
    "si", "sk", "sq", "sr", "su", "sv", "sw", "ta", "te", "th", "tl", "tr", "uk", "ur", "vi", "zh-CN", "zh-TW",
  ]],
  ["edge-tts", "unofficial-service", "https://github.com/rany2/edge-tts", [
    "en-US-AriaNeural", "en-US-GuyNeural", "en-GB-SoniaNeural", "vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural", "zh-CN-XiaoxiaoNeural",
    "zh-CN-YunxiNeural", "fr-FR-DeniseNeural", "de-DE-KatjaNeural", "ja-JP-NanamiNeural", "ko-KR-SunHiNeural",
  ]],
  ["local-device", "device-managed", "https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis", ["default"]],
]) {
  for (const id of ids) mediaFact(provider, id, "tts", [source], {
    kind: billingKind, unit: provider === "local-device" ? "device_defined" : "unpublished_service_usage",
    note: "Voice/language selector, not a metered foundation-model ID. No authenticated API tariff or guaranteed unlimited service is verified. Do not substitute Google Cloud TTS or Azure API prices for this endpoint, or infer free USD tokens from no-auth access.",
  });
}
for (const [id, kind] of [["black-forest-labs/FLUX.1-schnell", "image"], ["stabilityai/stable-diffusion-xl-base-1.0", "image"], ["openai/whisper-large-v3", "stt"], ["openai/whisper-small", "stt"]]) {
  mediaFact("huggingface", id, kind, ["https://huggingface.co/docs/inference-providers/pricing"], {
    currency: "USD", unit: "hardware_second", kind: "compute-reference", rates: {},
    note: "hf-inference bills compute time multiplied by underlying hardware price after applicable account credits. The docs' example GPU price is not this model's tariff. Other HF providers pass through their own prices without markup; neither is a flat universal per-image/token quote.",
  }, { routeLimitations: ["The static route uses hf-inference, not automatic provider selection. Current registry has no sttConfig for its STT IDs; binary normalization loses native compute billing data. Listed identity does not prove current backend availability."] });
}
for (const id of ["PlayDialog", "Play3.0-mini"]) mediaFact("playht", id, "tts", ["https://play.ht/", "https://docs.play.ht/reference/api-getting-started"], {
  kind: "unverified-pricing", note: "Legacy discontinued provider entry retained for existing operators. Current primary USD rate card could not be verified; no old subscription or token rate is fabricated.",
}, { routeLimitations: ["Legacy endpoint/auth/voice_engine request retained; current service availability and subscription credits were not verified."] });

// Shared media shard also owns native billing for the API providers whose
// registry entries are maintained separately. Do not infer native adapter fields.
const openaiPricingSource = "https://developers.openai.com/api/docs/pricing.md";
for (const [id, rates] of [
  ["gpt-image-1", { text_input: 5, cached_text_input: 1.25, image_input: 10, cached_image_input: 2.5, image_output: 40 }],
  ["gpt-image-2", { text_input: 5, cached_text_input: 1.25, image_input: 8, cached_image_input: 2, image_output: 30 }],
  ["gpt-image-2.5-flare", { text_input: 5, cached_text_input: 1.25, image_input: 8, cached_image_input: 2, image_output: 30 }],
  ["gpt-image-2.5-sunburst", { text_input: 5, cached_text_input: 1.25, image_input: 8, cached_image_input: 2, image_output: 30 }],
]) {
  const responsesOnlyCache = id !== "gpt-image-1";
  mediaFact("openai", id, "image", [openaiPricingSource], {
    currency: "USD", unit: "million_tokens_by_modality", kind: "api", rates,
    qualifiers: {
      ...(responsesOnlyCache ? { cachedInputScope: "Responses API only", cachedInputAppliesToGatewayRoute: false } : {}),
      resolutionQualityAffectOutputTokens: true, batch: "separate_50_percent_tariff_not_used_by_this_route",
    },
    note: "Text/image input and image output are different native token meters. Size/quality per-image examples are not fixed token rates. GPT Image 2/2.5 cache discounts apply only to Responses API, not this gateway's images/generations endpoint; do not charge a generic cache quote.",
  }, { route: "POST https://api.openai.com/v1/images/generations", routeLimitations: ["Existing prompt/size/quality JSON generation adapter only. No image editing or native token-usage preservation was added; no generic combined input/output token tariff can represent all modalities."] });
}
for (const [id, rate] of [["tts-1", 15], ["tts-1-hd", 30]]) mediaFact("openai", id, "tts", [openaiPricingSource], {
  currency: "USD", unit: "million_characters", kind: "api", rates: { rate },
  note: "Billed text characters, not input tokens or output audio duration. Voices are selectors, not separately priced models.",
}, { route: "POST https://api.openai.com/v1/audio/speech", routeLimitations: ["Current adapter returns binary audio; no native usage counter is retained. Realtime replacements require a different adapter."] });
mediaFact("openai", "gpt-4o-mini-tts", "tts", [openaiPricingSource], {
  currency: "USD", unit: "million_text_input_audio_output_tokens", kind: "api", rates: { text_input: 0.6, audio_output: 12 },
  unverifiedPriceFields: unknownTokenRates.filter(field => field !== "input"),
  note: "Verified text-input token price; output is native audio tokens, not chat completion tokens. Approximate audio-minute estimates are not the billing meter. Binary speech responses currently do not retain native usage.",
}, { route: "POST https://api.openai.com/v1/audio/speech" }, { input: 0.6 });
for (const [id, rate] of [["whisper-1", 0.006], ["gpt-transcribe", 0.0045]]) mediaFact("openai", id, "stt", [openaiPricingSource], {
  currency: "USD", unit: "audio_minute", kind: "api", rates: { rate },
  note: "Native transcription duration quote. No text-token tariff or rounding rule inferred from the rate card. Use actual native billed duration; tokenizer estimates and media-file byte size do not establish duration.",
}, { route: "POST https://api.openai.com/v1/audio/transcriptions" });
for (const [id, input, output, approximateMinute] of [["gpt-4o-transcribe", 2.5, 10, 0.006], ["gpt-4o-mini-transcribe", 1.25, 5, 0.003]]) mediaFact("openai", id, "stt", [openaiPricingSource], {
  currency: "USD", unit: "million_native_transcription_tokens", kind: "api", rates: { input, output },
  qualifiers: { approximateUsdPerAudioMinute: approximateMinute, audioAndTextTokenCountersRequired: true },
  note: "Published transcription input/output token rates. Approximate per-minute figures do not replace the native token meters; ordinary chat counters cannot identify audio/text components reliably.",
}, { route: "POST https://api.openai.com/v1/audio/transcriptions" });

const xaiPricingSource = "https://docs.x.ai/developers/pricing";
for (const [id, rate, kind] of [
  ["grok-imagine-image", 0.02, "image"], ["grok-imagine-image-quality", 0.05, "image"], ["grok-imagine-image-2.0", 0.04, "image"],
  ["grok-imagine-video", 0.05, "video"], ["grok-imagine-video-1.5", 0.08, "video"], ["grok-imagine-video-1.5-lite", 0.02, "video"],
]) {
  mediaFact("xai", id, kind, [xaiPricingSource, `https://docs.x.ai/developers/models/${id}`, `https://docs.x.ai/developers/model-capabilities/${kind === "image" ? "images" : "video"}/generation`], {
    currency: "USD", unit: kind === "image" ? "image" : "output_second", kind: "api-reference", rates: { rate },
    qualifiers: { batchDiscountApplies: false, priorityProcessingSupported: false, ...(id === "grok-imagine-image-2.0" ? { qualityBilledAsServed: true, autoGenerationQuality: "low", autoEditingQuality: "medium", completeQualityResolutionTariffVerified: false } : {}) },
    note: "Exact xAI public base output quote, not subscription or reseller pricing. Native served quality/resolution and any separately metered inputs must be retained before claiming a full invoice. Image/video Batch uses standard rates, not text-model discounts; priority processing is unavailable.",
  }, {
    ...(kind === "video" ? { durationSeconds: { min: 1, max: 15, default: 8 }, resolutions: id === "grok-imagine-video" ? ["480p", "720p"] : ["480p", "720p", "1080p"] } : {}),
    routeLimitations: ["Only the existing image JSON and xAI-compatible video job shapes are supported. No realtime voice, native speech, reference-to-video or additional billing usage preservation is implied. Video editing has separate duration/resolution restrictions."],
  });
}

for (const [id, rate] of [["whisper-large-v3", 0.111], ["whisper-large-v3-turbo", 0.04]]) mediaFact("groq", id, "stt", ["https://console.groq.com/docs/speech-to-text"], {
  currency: "USD", unit: "audio_hour", kind: "api", rates: { rate }, qualifiers: { minimumBilledSeconds: 10, rounding: "unverified" },
  note: "Audio-hour quote with a documented 10-second minimum per request; rounding of fractional seconds was not independently verified. Native duration, not transcript length or model-context zeros, determines the charge.",
}, { route: "POST https://api.groq.com/openai/v1/audio/transcriptions" });
mediaFact("groq", "distil-whisper-large-v3-en", "stt", ["https://console.groq.com/docs/speech-to-text"], {
  note: "No current exact duration rate independently verified for this legacy static ID; absence is not proof of free usage or retirement.",
});

for (const [id, rate] of [["speech-2.8-hd", 100], ["speech-2.8-turbo", 60], ["speech-2.6-hd", 100], ["speech-2.6-turbo", 60], ["speech-02-hd", 100], ["speech-02-turbo", 60], ["speech-01-hd", null], ["speech-01-turbo", null]]) mediaFact("minimax", id, "tts", ["https://platform.minimax.io/docs/guides/pricing-paygo", "https://platform.minimax.io/docs/api-reference/speech-t2a-http"], {
  currency: "USD", unit: "million_characters", kind: rate === null ? "unverified-pricing" : "api-pay-as-you-go", rates: rate === null ? {} : { rate },
  qualifiers: {
    subscription: "audio_points_separate_from_PAYG", voiceDesignUsdOnFirstSynthesis: 3, clonedVoiceUsdOnFirstSynthesis: 1.5,
    nativeUsageFields: { characters: "extra_info.usage_characters", firstUseVoices: "extra_info.usage_voice_count" }, audioDurationFieldIsBillingMeter: false,
  },
  note: "Native text characters, not generic model tokens. Voice design/cloning may add a one-time charge on first synthesis. Subscription audio points remain separate from the PAYG quote; old speech-01 prices are unverified.",
}, { routeLimitations: ["Existing synchronous T2A adapter only; no async long-form, voice management, ASR or music adapter was added."] });
mediaFact("minimax", "minimax-image-01", "image", ["https://platform.minimax.io/docs/guides/pricing-paygo"], {
  currency: "USD", unit: "image", kind: "api-reference", rates: { rate: 0.0035 },
  note: "Provider's image-01 quote; gateway's minimax-image-01 registry label is not proven as a native wire alias by this price page.",
}, { routeSupported: false, routeLimitations: ["Gateway retains an OpenAI-compatible image body/model label; native endpoint/model mapping must be verified before treating this quote as the route's invoice."] });

// Preserve known dated promotion metadata rather than making a time-dependent
// price silently permanent in the token-only resolver.
for (const [id, audio] of [["gemini-3.8-flash-tts", 9], ["gemini-3.8-flash-lite-tts", 6]]) {
  const record = mediaModels.gemini[id];
  record.billing = {
    ...record.billing, asOf: refreshDate, tokenPricingSupported: false,
    currency: "USD", unit: "million_tokens_by_modality",
    rates: {
      ...record.billing.rates, text_input: 0.5, audio_output: audio, valid_through: "2026-12-31",
      from_2027_01_01: { ...record.billing.rates.from_2027_01_01, text_input: 1, audio_output: audio * 2 },
    },
    qualifiers: { paidStandard: true, audioTokensPerSecond: 25, freeTierIsAccountSpecific: true, batchAndFlexDiscountPercent: 50, priorityMultiplier: 1.8 },
    note: "Native text-input/audio-output token rates; promotion through December 31 is not permanent. No duration/character-to-chat-token conversion. Batch/Flex/Priority and free-tier entitlements are separate from paid Standard. Cache tariffs were not independently refreshed.",
  };
  record.sources = [...new Set([...record.sources, "https://ai.google.dev/gemini-api/docs/pricing"])];
}
mediaModels.gemini["gemini-embedding-2"].billing.rates = { text_input: 0.2, image_input: 0.45, audio_input: 6.5, video_input: 12 };
mediaModels.gemini["gemini-embedding-2"].billing.note = "Paid Standard native modality-specific input-token rates; the gateway supports text-only embeddings, so only the legitimate $0.20/M text input rate reaches flat pricing. Images/audio/video require separate native adapters and counters. Batch is 50% lower, not applied to ordinary calls; account free tier is not a permanent zero tariff.";

for (const [id, input, source] of [
  ["mistral-embed", 0.1, "https://docs.mistral.ai/models/mistral-embed-23-12.md"],
  ["codestral-embed-2505", 0.15, "https://docs.mistral.ai/models/codestral-embed-25-05.md"],
]) mediaFact("mistral", id, "embedding", [source], {
  currency: "USD", unit: "million_input_tokens", kind: "api", rates: { input }, tokenPricingSupported: true,
  unverifiedPriceFields: unknownTokenRates.filter(field => field !== "input"),
  note: "Primary native model-page input-only embedding quote. Output/cache zeros in aggregate catalogs are not completion tariffs. The provider's 8k context label does not establish an exact input-token ceiling.",
}, {
  providerContextLabel: "8k", route: "POST https://api.mistral.ai/v1/embeddings",
  routeLimitations: ["Only ordinary text embeddings are supported. No audio transcription adapter, vector-output token allowance or inferred exact 8k integer was added."],
}, { input });

mediaFact("tokenrouter", "kling-3.0-turbo", "video", ["https://api.tokenrouter.com/api/pricing"], {
  currency: "USD", unit: "output_second_by_resolution", kind: "reseller-api-reference", rates: { "720p": 0.112, "1080p": 0.14 },
  qualifiers: { sourceField: "video_generation_pricing", groupRatio: { default: 1, vip: 1 }, otherGroups: "unverified" },
  note: "Exact host video-generation pricing, not the data[].model_ratio text-token conversion. The stale literal 2.1/2.1 token tariff is explicitly unsupported. Actual video duration/resolution, group and delivered endpoint must be retained before estimating native usage.",
}, { routeSupported: false, routeLimitations: ["Registry/media service is not a native video-generation adapter. No video job/usage persistence implementation was added; do not bill chat-token counters as seconds."] });

// Complete provider-scoped unknown quotes take precedence over legacy global
// literals. An empty object alone does not block exact global/provider tariffs.
// Preserve every legitimate component (including explicit zero) while making
// unknown used cache writes/output remain null; unused counters still cost zero.
for (const models of Object.values(mediaModels)) {
  for (const record of Object.values(models)) {
    record.pricing = { ...unknownTokenQuote, ...record.pricing };
    const unknown = unknownTokenRates.filter(field => record.pricing[field] == null);
    record.billing.unverifiedPriceFields = [...new Set([...(record.billing.unverifiedPriceFields || []), ...unknown])];
  }
}

export default mediaModels;
