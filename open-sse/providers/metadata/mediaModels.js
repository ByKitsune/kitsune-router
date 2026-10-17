/**
 * Reviewed media facts and kind-aware catalog comparisons as of 2026-10-17.
 * Factual shard only; parent resolver integration is separate. Never interpret an
 * empty pricing object as free. Explicit route capability restrictions describe
 * this gateway's tested text-only/basic JSON adapters, not every native feature.
 * Dimensions, characters and UTF-16 code units are not generated token limits.
 * Billing retains native units and qualifiers; no live inference was performed.
 */
export default {
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
          "Existing Zen adapter is prompt-only; no image edit inputs.",
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
          "Existing Zen adapter is prompt-only; no image edit inputs.",
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
          "Only text/string-array inputs are supported by Zen adapter; structured inputs are String(object).",
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
          "Zen image adapter only forwards text prompt and responseModalities; no edit image, resolution, aspect ratio controls."
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
          "Zen sends dimensions, not Voyage output_dimension; configurable dimensions/input_type need adapter mapping.",
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
          "Zen only passes input/encoding_format/dimensions, not task or multimodal options.",
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
          "Zen only passes input/encoding_format/dimensions, not task or multimodal options.",
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
          "Use default JSON/url output; multipart preview/streaming not supported by generic Zen adapter.",
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
          "Use default JSON/url output; multipart preview/streaming not supported by generic Zen adapter.",
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
          "Use default JSON/url output; multipart preview/streaming not supported by generic Zen adapter.",
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
          "Use default JSON/url output; multipart preview/streaming not supported by generic Zen adapter.",
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
          "Use default JSON/url output; multipart preview/streaming not supported by generic Zen adapter.",
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
