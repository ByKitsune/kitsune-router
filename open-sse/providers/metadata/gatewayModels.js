// Hosted-route facts: capability catalog dates remain independently scoped.
// The additive 2026-10-21 tariff review below replaces complete quotes, not
// vendor-leaf estimates. This shard has no network, registry or resolver imports.
const gatewayModels = {
  "cerebras": {
    "gpt-oss-120b": {
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
        "catalogProvider": "cerebras",
        "catalogModelId": "gpt-oss-120b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 40960,
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
      "description": "Open GPT reasoning model for self-hosted agents and controllable deployments"
    },
    "qwen-3.8-27b": {
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
        "catalogProvider": "cerebras",
        "catalogModelId": "qwen-3.8-27b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 40960,
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
      "description": "Dense 27B vision-language model for coding, agent tasks, and image and video understanding"
    }
  },
  "chutes": {
    "moonshotai/Kimi-K3-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "moonshotai/Kimi-K3-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 65535,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Kimi multimodal agent model for visual understanding, coding, and planning"
    },
    "moonshotai/Kimi-K2.6-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "moonshotai/Kimi-K2.6-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 65535,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Multimodal Kimi workhorse for agent loops, coding tasks, and visual context"
    },
    "zai-org/GLM-5.2-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "zai-org/GLM-5.2-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 65535,
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
      "description": "Open flagship GLM for long-horizon coding agents and million-token context work"
    },
    "zai-org/GLM-5.1-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "zai-org/GLM-5.1-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 202752,
        "maxOutput": 65535,
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
      "description": "Strong GLM coding model for agentic engineering, terminals, and repository generation"
    },
    "deepseek-ai/DeepSeek-V4-Flash-0731-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "deepseek-ai/DeepSeek-V4-Flash-0731-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
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
      "description": "Official DeepSeek V4 Flash release with enhanced agentic capabilities and integrated DSpark speculative decoding"
    },
    "deepseek-ai/DeepSeek-V3.2-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "deepseek-ai/DeepSeek-V3.2-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 65536,
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
      "description": "DeepSeek chat model for instruction following, coding, and analysis"
    },
    "Qwen/Qwen3.5-397B-A17B-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "Qwen/Qwen3.5-397B-A17B-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 65536,
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
      "description": "Large open Qwen multimodal MoE for visual agents and long technical tasks"
    },
    "Qwen/Qwen3.8-27B-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "Qwen/Qwen3.8-27B-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 65536,
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
      "description": "Qwen instruction model for multilingual chat, reasoning, and tool use"
    },
    "Qwen/Qwen3.6-27B-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "Qwen/Qwen3.6-27B-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 65536,
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
      "description": "Qwen vision-language model for visual reasoning, documents, and agent tasks"
    },
    "Qwen/Qwen3-32B-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "Qwen/Qwen3-32B-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 40960,
        "maxOutput": 40960,
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
      "description": "Dense open Qwen model for self-hosted chat, reasoning, and coding"
    },
    "Qwen/Qwen3-235B-A22B-Thinking-2507-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "Qwen/Qwen3-235B-A22B-Thinking-2507-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
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
      "description": "Qwen reasoning model for deliberate problem solving, math, and coding"
    },
    "unsloth/Mistral-Nemo-Instruct-2407-TEE": {
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
        "catalogProvider": "chutes",
        "catalogModelId": "unsloth/Mistral-Nemo-Instruct-2407-TEE",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 131072,
        "reasoning": false,
        "tools": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Efficient Mistral-NVIDIA open model for multilingual chat and local deployment"
    }
  },
  "cloudflare-ai": {
    "@cf/meta/llama-3.2-1b-instruct": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/meta/llama-3.2-1b-instruct",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 60000,
        "maxOutput": 60000,
        "reasoning": false,
        "tools": false,
        "structuredOutput": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Open Llama instruction model for multilingual chat, reasoning, and coding"
    },
    "@cf/meta/llama-3.2-3b-instruct": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/meta/llama-3.2-3b-instruct",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 80000,
        "maxOutput": 80000,
        "reasoning": false,
        "tools": false,
        "structuredOutput": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Open Llama instruction model for multilingual chat, reasoning, and coding"
    },
    "@cf/mistralai/mistral-small-3.1-24b-instruct": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/mistralai/mistral-small-3.1-24b-instruct",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 128000,
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
      "description": "Efficient Mistral model for fast chat, extraction, and production assistants"
    },
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 24000,
        "maxOutput": 24000,
        "reasoning": false,
        "tools": true,
        "structuredOutput": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Popular open Llama workhorse for multilingual chat, coding, and self-hosting"
    },
    "@cf/meta/llama-4-scout-17b-16e-instruct": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/meta/llama-4-scout-17b-16e-instruct",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131000,
        "maxOutput": 16384,
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
      "description": "Open Llama with long-context vision for efficient multimodal agents"
    },
    "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 80000,
        "maxOutput": 80000,
        "reasoning": true,
        "tools": false,
        "structuredOutput": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Classic open reasoning model for transparent math, coding, and deliberate problem solving"
    },
    "@cf/deepseek-ai/deepseek-v4-flash-0731": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/deepseek-ai/deepseek-v4-flash-0731",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 1048576,
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
      "description": "Official DeepSeek V4 Flash release with enhanced agentic capabilities and integrated DSpark speculative decoding"
    },
    "@cf/deepseek-ai/deepseek-v4-pro-0813": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/deepseek-ai/deepseek-v4-pro-0813",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 1048576,
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
      "description": "DeepSeek V4 Pro snapshot with million-token context and support for thinking and non-thinking modes"
    },
    "@cf/moonshotai/kimi-k2.6": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/moonshotai/kimi-k2.6",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 256000,
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
      "description": "Multimodal Kimi workhorse for agent loops, coding tasks, and visual context"
    },
    "@cf/moonshotai/kimi-k2.7-code": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/moonshotai/kimi-k2.7-code",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
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
      "description": "Coding-focused Kimi model, stronger on long-horizon repo work with less overthinking"
    },
    "@cf/zai-org/glm-4.7-flash": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/zai-org/glm-4.7-flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 131072,
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
      "description": "Efficient GLM model for fast reasoning, coding, and agent workflows"
    },
    "@cf/zai-org/glm-5.2": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/zai-org/glm-5.2",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 256000,
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
      "description": "Open flagship GLM for long-horizon coding agents and million-token context work"
    },
    "@cf/zai-org/glm-5.3": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/zai-org/glm-5.3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 1048576,
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
      "description": "Flagship GLM model for hybrid reasoning, coding, and agentic engineering"
    },
    "@cf/zai-org/glm-5.3-flash": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/zai-org/glm-5.3-flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 1048576,
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
      "description": "GLM vision model for visual reasoning, documents, and multimodal agents"
    },
    "@cf/openai/gpt-oss-120b": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/openai/gpt-oss-120b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 16384,
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
      "description": "Open GPT reasoning model for self-hosted agents and controllable deployments"
    },
    "@cf/openai/gpt-oss-20b": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/openai/gpt-oss-20b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 16384,
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
      "description": "Open-weight GPT model for self-hosted reasoning and instruction-following workloads"
    },
    "@cf/qwen/qwen3.8-27b": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/qwen/qwen3.8-27b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
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
      "description": "Qwen vision-language model for visual reasoning, documents, and agent tasks"
    },
    "@cf/qwen/qwq-32b": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/qwen/qwq-32b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 24000,
        "maxOutput": 24000,
        "reasoning": true,
        "tools": false,
        "structuredOutput": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen reasoning model for deliberate problem solving, math, and coding"
    },
    "@cf/qwen/qwen2.5-coder-32b-instruct": {
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
        "catalogProvider": "cloudflare-workers-ai",
        "catalogModelId": "@cf/qwen/qwen2.5-coder-32b-instruct",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 32768,
        "maxOutput": 32768,
        "reasoning": false,
        "tools": false,
        "structuredOutput": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen coding model for software agents, repository edits, and code reasoning"
    }
  },
  "github": {
    "gpt-5.5": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "gpt-5.5",
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
      "description": "Default frontier GPT for coding, computer use, research, and knowledge work"
    },
    "gpt-5.6-luna": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "gpt-5.6-luna",
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
      "description": "Cost-efficient GPT-5.6 model for fast, high-volume workloads"
    },
    "gpt-5.6-sol": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "gpt-5.6-sol",
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
      "description": "Frontier GPT-5.6 model for complex professional work, coding, and agentic workflows"
    },
    "gpt-5.6-terra": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "gpt-5.6-terra",
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
      "description": "Balanced GPT-5.6 model for capable, cost-efficient everyday work"
    },
    "gpt-5.3-codex": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "gpt-5.3-codex",
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
        "pdf": true,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Coding-optimized GPT model for repository edits, reviews, and agentic software work"
    },
    "gpt-5.4": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "gpt-5.4",
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
      "description": "Agent-ready GPT for coding and computer-use workflows at a lower cost"
    },
    "gpt-5.4-mini": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "gpt-5.4-mini",
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
      "description": "Strong small GPT for coding subagents, quick tool use, and high-volume work"
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "gpt-5-mini",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 264000,
        "maxInput": 128000,
        "maxOutput": 64000,
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
    "claude-haiku-4.5": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "claude-haiku-4.5",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 200000,
        "maxInput": 136000,
        "maxOutput": 64000,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": true,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Fast Claude lane for lightweight agents, office tasks, and responsive chat"
    },
    "claude-opus-4.7": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "claude-opus-4.7",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 200000,
        "maxInput": 168000,
        "maxOutput": 32000,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": true,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Stronger Opus tier for advanced software work and high-stakes reasoning"
    },
    "claude-opus-4.8": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "claude-opus-4.8",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 200000,
        "maxInput": 168000,
        "maxOutput": 64000,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": true,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Top Claude Opus tier for the hardest reasoning, coding, and long-horizon agents"
    },
    "claude-opus-5": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "claude-opus-5",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxInput": 936000,
        "maxOutput": 64000,
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
      "description": "Strongest Claude Opus model for coding, agents, and professional work"
    },
    "claude-sonnet-5": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "claude-sonnet-5",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 128000,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": true,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Everyday Claude agent model for coding, planning, browsing, and general work"
    },
    "gemini-3.6-flash": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "gemini-3.6-flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxInput": 936000,
        "maxOutput": 64000,
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
      "description": "Fast Gemini model balancing multimodal reasoning, tool use, and cost"
    },
    "gemini-3.7-flash": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "gemini-3.7-flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxInput": 936000,
        "maxOutput": 64000,
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
      "description": "High-efficiency Gemini model for agentic workflows, coding, and multimodal reasoning"
    },
    "kimi-k3": {
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
        "catalogProvider": "github-copilot",
        "catalogModelId": "kimi-k3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
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
      "description": "Multimodal Kimi model with 1M context and toggleable max-effort thinking for long-horizon agent work"
    }
  },
  "groq": {
    "llama-3.3-70b-versatile": {
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
        "catalogProvider": "groq",
        "catalogModelId": "llama-3.3-70b-versatile",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 32768,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Open Llama instruction model for multilingual chat, reasoning, and coding"
    },
    "llama-3.1-8b-instant": {
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
        "catalogProvider": "groq",
        "catalogModelId": "llama-3.1-8b-instant",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 131072,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Compact Llama instruction model for fast chat and local deployment"
    },
    "openai/gpt-oss-120b": {
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
        "catalogProvider": "groq",
        "catalogModelId": "openai/gpt-oss-120b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 65536,
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
      "description": "Open GPT reasoning model for self-hosted agents and controllable deployments"
    },
    "openai/gpt-oss-20b": {
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
        "catalogProvider": "groq",
        "catalogModelId": "openai/gpt-oss-20b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 65536,
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
      "description": "Open-weight GPT model for self-hosted reasoning and instruction-following workloads"
    },
    "qwen/qwen3.8-27b": {
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
        "catalogProvider": "groq",
        "catalogModelId": "qwen/qwen3.8-27b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131042,
        "maxOutput": 16384,
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
      "description": "Dense 27B vision-language model for coding, agent tasks, and image and video understanding"
    }
  },
  "iflow": {
    "qwen3-coder-plus": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "qwen3-coder-plus",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 256000,
        "maxOutput": 64000,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen coding model for software agents, repository edits, and code reasoning"
    },
    "qwen3-max": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "qwen3-max",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 256000,
        "maxOutput": 32000,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Flagship Qwen model for complex reasoning, coding, and agentic workflows"
    },
    "qwen3-vl-plus": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "qwen3-vl-plus",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 256000,
        "maxOutput": 32000,
        "reasoning": false,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen vision-language model for visual reasoning, documents, and agent tasks"
    },
    "qwen3-max-preview": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "qwen3-max-preview",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 256000,
        "maxOutput": 32000,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Flagship Qwen model for complex reasoning, coding, and agentic workflows"
    },
    "qwen3-235b": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "qwen3-235b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 32000,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen instruction model for multilingual chat, reasoning, and tool use"
    },
    "qwen3-235b-a22b-instruct": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "qwen3-235b-a22b-instruct",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 256000,
        "maxOutput": 64000,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen instruction model for multilingual chat, reasoning, and tool use"
    },
    "qwen3-235b-a22b-thinking-2507": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "qwen3-235b-a22b-thinking-2507",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 256000,
        "maxOutput": 64000,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen reasoning model for deliberate problem solving, math, and coding"
    },
    "qwen3-32b": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "qwen3-32b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 32000,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen instruction model for multilingual chat, reasoning, and tool use"
    },
    "kimi-k2": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "kimi-k2",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 64000,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Kimi model for long-context chat, coding, and agentic reasoning"
    },
    "deepseek-v3.2": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "deepseek-v3.2",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 64000,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "DeepSeek chat model for instruction following, coding, and analysis"
    },
    "deepseek-v3": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "deepseek-v3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 32000,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "DeepSeek chat model for instruction following, coding, and analysis"
    },
    "deepseek-r1": {
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
        "catalogProvider": "iflowcn",
        "catalogModelId": "deepseek-r1",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 32000,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "DeepSeek reasoning model for multi-step analysis, math, coding, and tools"
    }
  },
  "nebius": {
    "deepseek-ai/DeepSeek-V4-Flash-0731": {
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
        "catalogProvider": "nebius",
        "catalogModelId": "deepseek-ai/DeepSeek-V4-Flash-0731",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1024000,
        "maxOutput": 1024000,
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
      "description": "Official DeepSeek V4 Flash release with enhanced agentic capabilities and integrated DSpark speculative decoding"
    },
    "MiniMaxAI/MiniMax-M3": {
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
        "catalogProvider": "nebius",
        "catalogModelId": "MiniMaxAI/MiniMax-M3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 1048576,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiniMax multimodal model for long-context coding, perception, and agent planning"
    }
  },
  "nvidia": {
    "minimaxai/minimax-m2.7": {
      "sources": [
        "https://models.dev/api.json",
        "https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m2.7"
      ],
      "billing": {
        "kind": "catalog-metadata-only",
        "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
      },
      "limits": {
        "scope": "exact-route-modelsdev-catalog",
        "authenticatedRouteVerified": false,
        "catalogProvider": "nvidia",
        "catalogModelId": "minimaxai/minimax-m2.7",
        "catalogAsOf": "2026-10-17",
        "fieldSources": {
          "contextWindow": "https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m2.7",
          "maxOutput": "https://models.dev/api.json"
        },
        "note": "NVIDIA model card specifies 204,800 input-context tokens, corroborating this exact route catalog. The catalog supplies 131,072 output tokens; no separate primary hosted output ceiling or account entitlement verified."
      },
      "capabilities": {
        "contextWindow": 204800,
        "maxOutput": 131072,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiniMax model for chat, coding, office work, and agentic tasks"
    },
    "minimaxai/minimax-m3": {
      "sources": [
        "https://models.dev/api.json",
        "https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m3",
        "https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m3-infer"
      ],
      "billing": {
        "kind": "catalog-metadata-only",
        "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
      },
      "limits": {
        "scope": "exact-route-modelsdev-catalog",
        "authenticatedRouteVerified": false,
        "catalogProvider": "nvidia",
        "catalogModelId": "minimaxai/minimax-m3",
        "catalogAsOf": "2026-10-17",
        "fieldSources": {
          "contextWindow": "https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m3",
          "maxOutput": "https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m3-infer"
        },
        "note": "NVIDIA model card states a 1-million-token window; the exact integrate.api.nvidia.com ChatRequest schema caps max_tokens at 16,384. This is a hosted API ceiling, not the vendor's output capacity. Availability is unverified."
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 16384,
        "tools": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiniMax multimodal model for long-context coding, perception, and agent planning"
    },
    "z-ai/glm-5.2": {
      "sources": [
        "https://models.dev/api.json",
        "https://docs.api.nvidia.com/nim/reference/z-ai-glm-5.2",
        "https://docs.api.nvidia.com/nim/reference/z-ai-glm-5.2-infer"
      ],
      "billing": {
        "kind": "catalog-metadata-only",
        "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
      },
      "limits": {
        "scope": "exact-route-modelsdev-catalog",
        "authenticatedRouteVerified": false,
        "catalogProvider": "nvidia",
        "catalogModelId": "z-ai/glm-5.2",
        "catalogAsOf": "2026-10-17",
        "fieldSources": {
          "contextWindow": "https://docs.api.nvidia.com/nim/reference/z-ai-glm-5.2",
          "maxOutput": "https://docs.api.nvidia.com/nim/reference/z-ai-glm-5.2-infer"
        },
        "note": "NVIDIA model card specifies 1,000,000 context tokens. The exact integrate.api.nvidia.com ChatRequest schema caps max_tokens at 32,768, not the vendor or catalog output capacity. Availability is unverified."
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 32768,
        "tools": true,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Open flagship GLM for long-horizon coding agents and million-token context work"
    },
    "deepseek-ai/deepseek-v4-pro": {
      "sources": [
        "https://models.dev/api.json",
        "https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-pro-infer"
      ],
      "billing": {
        "kind": "catalog-metadata-only",
        "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
      },
      "limits": {
        "scope": "exact-route-modelsdev-catalog",
        "authenticatedRouteVerified": false,
        "catalogProvider": "nvidia",
        "catalogModelId": "deepseek-ai/deepseek-v4-pro",
        "catalogAsOf": "2026-10-17",
        "fieldSources": {
          "contextWindow": "https://models.dev/api.json",
          "maxOutput": "https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-pro-infer"
        },
        "note": "Exact route catalog context retained without converting the primary's abbreviated 1M notation. NVIDIA's ChatRequest schema caps max_tokens at 16,384; native DeepSeek output limits do not apply. Availability is unverified."
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 16384,
        "tools": true,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Open MoE flagship with million-token context for coding and long agent runs"
    },
    "deepseek-ai/deepseek-v4-pro-0813": {
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
        "catalogProvider": "nvidia",
        "catalogModelId": "deepseek-ai/deepseek-v4-pro-0813",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 384000,
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
      "description": "DeepSeek V4 Pro snapshot with million-token context and support for thinking and non-thinking modes"
    },
    "deepseek-ai/deepseek-v4-flash": {
      "sources": [
        "https://models.dev/api.json",
        "https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-flash-infer"
      ],
      "billing": {
        "kind": "catalog-metadata-only",
        "note": "Exact provider and literal model catalog comparison; pricing, live availability and account entitlement are not established."
      },
      "limits": {
        "scope": "exact-route-modelsdev-catalog",
        "authenticatedRouteVerified": false,
        "catalogProvider": "nvidia",
        "catalogModelId": "deepseek-ai/deepseek-v4-flash",
        "catalogAsOf": "2026-10-17",
        "fieldSources": {
          "contextWindow": "https://models.dev/api.json",
          "maxOutput": "https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-flash-infer"
        },
        "note": "Exact route catalog context retained without converting the primary's abbreviated 1M notation. NVIDIA's ChatRequest schema caps max_tokens at 16,384; native DeepSeek output limits do not apply. Availability is unverified."
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 16384,
        "tools": true,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Fast DeepSeek V4 lane for economical reasoning, coding, and long-context work"
    },
    "moonshotai/kimi-k2.6": {
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
        "catalogProvider": "nvidia",
        "catalogModelId": "moonshotai/kimi-k2.6",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Kimi multimodal agent model for visual understanding, coding, and planning"
    },
    "nvidia/nemotron-3-ultra-550b-a55b": {
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
        "catalogProvider": "nvidia",
        "catalogModelId": "nvidia/nemotron-3-ultra-550b-a55b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 65536,
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
      "description": "Largest Nemotron 3 model for maximum open-weight reasoning and agent accuracy"
    }
  },
  "ollama": {
    "gpt-oss:120b": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "gpt-oss:120b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 32768,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Open-weight GPT model for self-hosted reasoning and instruction-following workloads"
    },
    "kimi-k3": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "kimi-k3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
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
      "description": "Multimodal Kimi model with 1M context and toggleable max-effort thinking for long-horizon agent work"
    },
    "kimi-k2.7-code": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "kimi-k2.7-code",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
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
      "description": "Coding-focused Kimi model, stronger on long-horizon repo work with less overthinking"
    },
    "kimi-k2.6": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "kimi-k2.6",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Kimi multimodal agent model for visual understanding, coding, and planning"
    },
    "glm-5.3": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "glm-5.3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
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
      "description": "Flagship GLM model for long-horizon coding, agents, and complex project delivery"
    },
    "glm-5.3-flash": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "glm-5.3-flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": true,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Native multimodal GLM model for efficient coding and long-horizon agent tasks"
    },
    "glm-5.2": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "glm-5.2",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 976000,
        "maxOutput": 131072,
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
      "description": "Open flagship GLM for long-horizon coding agents and million-token context work"
    },
    "minimax-m2.7": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "minimax-m2.7",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 196608,
        "maxOutput": 196608,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiniMax model for chat, coding, office work, and agentic tasks"
    },
    "minimax-m3": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "minimax-m3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 512000,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiniMax multimodal coding model for long-context reasoning and agent tasks"
    },
    "deepseek-v4-flash": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "deepseek-v4-flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 1048576,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Fast DeepSeek model for efficient chat, coding help, and agent loops"
    },
    "deepseek-v4-pro": {
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
        "catalogProvider": "ollama-cloud",
        "catalogModelId": "deepseek-v4-pro",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 1048576,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Flagship DeepSeek model for coding, reasoning, and agentic work"
    }
  },
  "siliconflow": {
    "deepseek-ai/DeepSeek-V4-Pro": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "deepseek-ai/DeepSeek-V4-Pro",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 384000,
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
      "description": "Open MoE flagship with million-token context for coding and long agent runs"
    },
    "deepseek-ai/DeepSeek-V4-Flash": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "deepseek-ai/DeepSeek-V4-Flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 384000,
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
      "description": "Fast DeepSeek V4 lane for economical reasoning, coding, and long-context work"
    },
    "deepseek-ai/DeepSeek-V3.2": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "deepseek-ai/DeepSeek-V3.2",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 164000,
        "maxOutput": 164000,
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
      "description": "DeepSeek chat model for instruction following, coding, and analysis"
    },
    "deepseek-ai/DeepSeek-V3.2-Exp": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "deepseek-ai/DeepSeek-V3.2-Exp",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 164000,
        "maxOutput": 164000,
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
      "description": "DeepSeek chat model for instruction following, coding, and analysis"
    },
    "deepseek-ai/DeepSeek-V3.1": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "deepseek-ai/DeepSeek-V3.1",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 164000,
        "maxOutput": 164000,
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
      "description": "DeepSeek chat model for instruction following, coding, and analysis"
    },
    "deepseek-ai/DeepSeek-V3.1-Terminus": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "deepseek-ai/DeepSeek-V3.1-Terminus",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 164000,
        "maxOutput": 164000,
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
      "description": "DeepSeek chat model for instruction following, coding, and analysis"
    },
    "deepseek-ai/DeepSeek-R1": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "deepseek-ai/DeepSeek-R1",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 164000,
        "maxOutput": 164000,
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
      "description": "DeepSeek reasoning model for multi-step analysis, math, coding, and tools"
    },
    "Qwen/Qwen3.5-397B-A17B": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "Qwen/Qwen3.5-397B-A17B",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
        "reasoning": false,
        "tools": true,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Large open Qwen multimodal MoE for visual agents and long technical tasks"
    },
    "Qwen/Qwen3.5-122B-A10B": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "Qwen/Qwen3.5-122B-A10B",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
        "reasoning": false,
        "tools": true,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen vision-language model for visual reasoning, documents, and agent tasks"
    },
    "zai-org/GLM-5.1": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "zai-org/GLM-5.1",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 205000,
        "maxOutput": 131000,
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
      "description": "Flagship GLM model for hybrid reasoning, coding, and agentic engineering"
    },
    "zai-org/GLM-5": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "zai-org/GLM-5",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 205000,
        "maxOutput": 205000,
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
      "description": "Flagship GLM model for hybrid reasoning, coding, and agentic engineering"
    },
    "zai-org/GLM-5.3": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "zai-org/GLM-5.3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1049000,
        "maxOutput": 262000,
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
      "description": "Flagship GLM model for long-horizon coding, agents, and complex project delivery"
    },
    "zai-org/GLM-5.3-Flash": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "zai-org/GLM-5.3-Flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1049000,
        "maxOutput": 262000,
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
      "description": "Native multimodal GLM model for efficient coding and long-horizon agent tasks"
    },
    "moonshotai/Kimi-K3": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "moonshotai/Kimi-K3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 262000,
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
      "description": "Multimodal Kimi model with 1M context and toggleable max-effort thinking for long-horizon agent work"
    },
    "moonshotai/Kimi-K2.7-Code": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "moonshotai/Kimi-K2.7-Code",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
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
      "description": "Coding-focused Kimi model, stronger on long-horizon repo work with less overthinking"
    },
    "moonshotai/Kimi-K2.6": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "moonshotai/Kimi-K2.6",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262000,
        "maxOutput": 262000,
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
      "description": "Kimi multimodal agent model for visual understanding, coding, and planning"
    },
    "moonshotai/Kimi-K2.5": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "moonshotai/Kimi-K2.5",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262000,
        "maxOutput": 262000,
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
      "description": "Kimi multimodal agent model for visual understanding, coding, and planning"
    },
    "openai/gpt-oss-120b": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "openai/gpt-oss-120b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131000,
        "maxOutput": 8000,
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
      "description": "Open-weight GPT model for self-hosted reasoning and instruction-following workloads"
    },
    "MiniMaxAI/MiniMax-M2.5": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "MiniMaxAI/MiniMax-M2.5",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 197000,
        "maxOutput": 131000,
        "reasoning": false,
        "tools": true,
        "structuredOutput": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiniMax model for chat, coding, office work, and agentic tasks"
    },
    "inclusionAI/Ling-flash-2.0": {
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
        "catalogProvider": "siliconflow",
        "catalogModelId": "inclusionAI/Ling-flash-2.0",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131000,
        "maxOutput": 131000,
        "reasoning": false,
        "tools": true,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Efficient model for low-latency assistance, extraction, and routine automation"
    }
  },
  "together": {
    "meta-llama/Llama-3.3-70B-Instruct-Turbo": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 131072,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Compact Llama instruction model for fast chat and local deployment"
    },
    "deepseek-ai/DeepSeek-V4-Pro-0813": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "deepseek-ai/DeepSeek-V4-Pro-0813",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 384000,
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
      "description": "DeepSeek V4 Pro snapshot with million-token context and support for thinking and non-thinking modes"
    },
    "deepseek-ai/DeepSeek-V4-Flash-0731": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "deepseek-ai/DeepSeek-V4-Flash-0731",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 384000,
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
      "description": "Official DeepSeek V4 Flash release with enhanced agentic capabilities and integrated DSpark speculative decoding"
    },
    "deepseek-ai/DeepSeek-V4.1-Flash": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "deepseek-ai/DeepSeek-V4.1-Flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 384000,
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
      "description": "DeepSeek V4.1 Flash model for reasoning and agentic coding"
    },
    "moonshotai/Kimi-K3": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "moonshotai/Kimi-K3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Multimodal Kimi model with 1M context and toggleable max-effort thinking for long-horizon agent work"
    },
    "zai-org/GLM-5.3": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "zai-org/GLM-5.3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 262144,
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
      "description": "Flagship GLM model for long-horizon coding, agents, and complex project delivery"
    },
    "zai-org/GLM-5.3-Flash": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "zai-org/GLM-5.3-Flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048575,
        "maxOutput": 400000,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Native multimodal GLM model for efficient coding and long-horizon agent tasks"
    },
    "zai-org/GLM-5.2": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "zai-org/GLM-5.2",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048575,
        "maxOutput": 164000,
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
      "description": "Open flagship GLM for long-horizon coding agents and million-token context work"
    },
    "openai/gpt-oss-120b": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "openai/gpt-oss-120b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Open-weight GPT model for self-hosted reasoning and instruction-following workloads"
    },
    "Qwen/Qwen3.7-Max": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "Qwen/Qwen3.7-Max",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 500000,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Flagship Qwen model for complex reasoning, coding, and agentic workflows"
    },
    "Qwen/Qwen3.6-Plus": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "Qwen/Qwen3.6-Plus",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 500000,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen instruction model for multilingual chat, reasoning, and tool use"
    },
    "Qwen/Qwen3.5-9B": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "Qwen/Qwen3.5-9B",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 65536,
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
      "description": "Qwen vision-language model for visual reasoning, documents, and agent tasks"
    },
    "MiniMaxAI/MiniMax-M3": {
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
        "catalogProvider": "togetherai",
        "catalogModelId": "MiniMaxAI/MiniMax-M3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 524288,
        "maxOutput": 250000,
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
      "description": "MiniMax multimodal coding model for long-context reasoning and agent tasks"
    }
  },
  "venice": {
    "venice-uncensored-1-2": {
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
        "catalogProvider": "venice",
        "catalogModelId": "venice-uncensored-1-2",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 8192,
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
      "description": "Multimodal model for analyzing text, images, documents, and rich media"
    },
    "zai-org-glm-5": {
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
        "catalogProvider": "venice",
        "catalogModelId": "zai-org-glm-5",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 198000,
        "maxOutput": 32000,
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
      "description": "General GLM flagship for coding, analysis, and tool-heavy engineering workflows"
    },
    "z-ai-glm-5-3": {
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
        "catalogProvider": "venice",
        "catalogModelId": "z-ai-glm-5-3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
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
      "description": "Flagship GLM model for hybrid reasoning, coding, and agentic engineering"
    },
    "z-ai-glm-5-3-flash": {
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
        "catalogProvider": "venice",
        "catalogModelId": "z-ai-glm-5-3-flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "GLM vision model for visual reasoning, documents, and multimodal agents"
    },
    "kimi-k3": {
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
        "catalogProvider": "venice",
        "catalogModelId": "kimi-k3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
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
      "description": "Kimi multimodal agent model for visual understanding, coding, and planning"
    },
    "deepseek-v4-flash": {
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
        "catalogProvider": "venice",
        "catalogModelId": "deepseek-v4-flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 32768,
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
      "description": "Fast DeepSeek V4 lane for economical reasoning, coding, and long-context work"
    },
    "qwen3-235b-a22b-instruct-2507": {
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
        "catalogProvider": "venice",
        "catalogModelId": "qwen3-235b-a22b-instruct-2507",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 16384,
        "reasoning": false,
        "tools": true,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen instruction model for multilingual chat, reasoning, and tool use"
    },
    "qwen3-coder-480b-a35b-instruct-turbo": {
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
        "catalogProvider": "venice",
        "catalogModelId": "qwen3-coder-480b-a35b-instruct-turbo",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 256000,
        "maxOutput": 65536,
        "reasoning": false,
        "tools": true,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen coding model for software agents, repository edits, and code reasoning"
    },
    "qwen3-vl-235b-a22b": {
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
        "catalogProvider": "venice",
        "catalogModelId": "qwen3-vl-235b-a22b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 16384,
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
      "description": "Multimodal model for analyzing text, images, documents, and rich media"
    },
    "deepseek-v4-pro": {
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
        "catalogProvider": "venice",
        "catalogModelId": "deepseek-v4-pro",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 32768,
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
      "description": "Open MoE flagship with million-token context for coding and long agent runs"
    },
    "llama-3.3-70b": {
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
        "catalogProvider": "venice",
        "catalogModelId": "llama-3.3-70b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 4096,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Open Llama instruction model for multilingual chat, reasoning, and coding"
    },
    "hermes-3-llama-3.1-405b": {
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
        "catalogProvider": "venice",
        "catalogModelId": "hermes-3-llama-3.1-405b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 128000,
        "maxOutput": 16384,
        "reasoning": false,
        "tools": false,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Open Llama instruction model for multilingual chat, reasoning, and coding"
    },
    "mistral-small-3-2-24b-instruct": {
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
        "catalogProvider": "venice",
        "catalogModelId": "mistral-small-3-2-24b-instruct",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 256000,
        "maxOutput": 16384,
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
      "description": "Efficient Mistral model for fast chat, extraction, and production assistants"
    }
  },
  "vertex": {
    "gemini-3.8-flash": {
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
        "catalogProvider": "google-vertex",
        "catalogModelId": "gemini-3.8-flash",
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
      "description": "Google's most intelligent Flash model, engineered for long-horizon software engineering, autonomous agents, and complex enterprise workflows"
    },
    "gemini-3.7-flash": {
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
        "catalogProvider": "google-vertex",
        "catalogModelId": "gemini-3.7-flash",
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
      "description": "High-efficiency Gemini model for agentic workflows, coding, and multimodal reasoning"
    },
    "gemini-3.6-flash": {
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
        "catalogProvider": "google-vertex",
        "catalogModelId": "gemini-3.6-flash",
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
      "description": "Fast Gemini model balancing multimodal reasoning, tool use, and cost"
    },
    "gemini-3.5-flash": {
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
        "catalogProvider": "google-vertex",
        "catalogModelId": "gemini-3.5-flash",
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
      "description": "Fast Gemini model balancing multimodal reasoning, tool use, and cost"
    },
    "gemini-3.5-flash-lite": {
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
        "catalogProvider": "google-vertex",
        "catalogModelId": "gemini-3.5-flash-lite",
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
      "description": "Fast Gemini model balancing multimodal reasoning, tool use, and cost"
    },
    "gemini-3.1-pro-preview": {
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
        "catalogProvider": "google-vertex",
        "catalogModelId": "gemini-3.1-pro-preview",
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
      "description": "Reasoning-first Gemini preview for agentic coding and complex problem solving"
    },
    "gemini-3.1-flash-lite": {
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
        "catalogProvider": "google-vertex",
        "catalogModelId": "gemini-3.1-flash-lite",
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
      "description": "Low-latency Gemini model for high-volume multimodal and agent workloads"
    },
    "gemini-3-flash-preview": {
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
        "catalogProvider": "google-vertex",
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
      "description": "New Gemini flash lane bringing frontier-style multimodal reasoning to cheaper runs"
    },
    "gemini-2.5-pro": {
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
        "catalogProvider": "google-vertex",
        "catalogModelId": "gemini-2.5-pro",
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
      "description": "Google's proven reasoning model for coding, math, and multimodal analysis"
    },
    "gemini-2.5-flash": {
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
        "catalogProvider": "google-vertex",
        "catalogModelId": "gemini-2.5-flash",
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
      "description": "Fast Gemini model balancing multimodal reasoning, tool use, and cost"
    },
    "gemini-2.5-flash-lite": {
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
        "catalogProvider": "google-vertex",
        "catalogModelId": "gemini-2.5-flash-lite",
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
      "description": "Lean Gemini 2.5 lane for cheap multimodal traffic and quick agents"
    }
  },
  "kilo-gateway": {
    "kilo-auto/free": {
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
        "catalogProvider": "kilo",
        "catalogModelId": "kilo-auto/free",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 256000,
        "maxOutput": 32768,
        "reasoning": true,
        "tools": true,
        "structuredOutput": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Automatic model router for matching prompts to suitable backends and budgets"
    },
    "nvidia/nemotron-3-super-120b-a12b:free": {
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
        "catalogProvider": "kilo",
        "catalogModelId": "nvidia/nemotron-3-super-120b-a12b:free",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 235929,
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
      "description": "Nemotron middle tier for collaborative agents and high-volume reasoning workloads"
    },
    "nvidia/nemotron-3-ultra-550b-a55b:free": {
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
        "catalogProvider": "kilo",
        "catalogModelId": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 65536,
        "reasoning": true,
        "tools": true,
        "structuredOutput": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "NVIDIA Nemotron 3 Ultra is an open frontier-reasoning and orchestration model from NVIDIA, with 55B active parameters out of 550B total (MoE). Built on a hybrid Transformer-Mamba mixture-of-experts architecture, it... **Terms of service** For NVIDIA free endpoints (Super/Ultra/etc): Trial use only - do not submit personal or confidential data. Your use is logged for security purposes and to improve NVIDIA products and services. The logged session data for improvement purposes is not linked to your identity or any persistent identifier. For more information about our data processing practices, see our [Privacy Policy](https://www.nvidia.com/en-us/about-nvidia/privacy-policy/). By interacting with this endpoint, you consent to our collection, recording, and use of such information and the [NVIDIA API Trial Terms of Service](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf)."
    },
    "kilo-auto/frontier": {
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
        "catalogProvider": "kilo",
        "catalogModelId": "kilo-auto/frontier",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 128000,
        "reasoning": true,
        "tools": true,
        "structuredOutput": false,
        "vision": true,
        "pdf": true,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Automatic model router for matching prompts to suitable backends and budgets"
    },
    "kilo-auto/balanced": {
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
        "catalogProvider": "kilo",
        "catalogModelId": "kilo-auto/balanced",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 65536,
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
      "description": "Automatic model router for matching prompts to suitable backends and budgets"
    }
  },
  "sambanova": {
    "MiniMax-M3": {
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
        "catalogProvider": "sambanova",
        "catalogModelId": "MiniMax-M3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 1048576,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiniMax multimodal model for long-context coding, perception, and agent planning"
    },
    "DeepSeek-V3.1": {
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
        "catalogProvider": "sambanova",
        "catalogModelId": "DeepSeek-V3.1",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 7168,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Hybrid-reasoning DeepSeek model with thinking and non-thinking modes"
    },
    "DeepSeek-V3.2": {
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
        "catalogProvider": "sambanova",
        "catalogModelId": "DeepSeek-V3.2",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 32768,
        "maxOutput": 7168,
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
      "description": "Hybrid-reasoning DeepSeek model with thinking and non-thinking modes, sparse attention, and tool-use"
    },
    "Meta-Llama-3.3-70B-Instruct": {
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
        "catalogProvider": "sambanova",
        "catalogModelId": "Meta-Llama-3.3-70B-Instruct",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 3072,
        "reasoning": false,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Popular open Llama workhorse for multilingual chat, coding, and self-hosting"
    },
    "gpt-oss-120b": {
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
        "catalogProvider": "sambanova",
        "catalogModelId": "gpt-oss-120b",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 131072,
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
      "description": "Open GPT reasoning model for self-hosted agents and controllable deployments"
    },
    "gemma-4-31B-it": {
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
        "catalogProvider": "sambanova",
        "catalogModelId": "gemma-4-31B-it",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 131072,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Largest Gemma 4 instruction model for open, self-hosted chat and reasoning"
    }
  },
  "opencode": {
    "glm-5.3-flash-free": {
      "capabilities": { "thinkingFormat": "openai" },
      "sources": [
        "https://github.com/anomalyco/opencode/blob/802f2d8e75098ae0b45ad839ce98a31589ea8102/services/www/src/docs/content/console/models.mdx#L113",
        "https://github.com/decolua/9router/pull/5003/commits/6e0d65725e7934980f67cfd3a90759281f7c57f8"
      ],
      "limits": {
        "scope": "exact-hosted-thinking-dialect",
        "authenticatedRouteVerified": false
      },
      "description": "Hosted Chat Completions route using OpenAI reasoning effort rather than native z.ai thinking. Accepted effort enums and account availability are not independently verified."
    },
    "muse-spark-1.2-contributor-free": {
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
        "catalogProvider": "opencode",
        "catalogModelId": "muse-spark-1.2-contributor-free",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
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
      "description": "Muse Spark 1.2 is a coding-focused update to Muse Spark 1.1 with improvements in code generation, complex debugging, codebase understanding, and end-to-end developer workflows."
    },
    "muse-spark-1.3-contributor-free": {
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
        "catalogProvider": "opencode",
        "catalogModelId": "muse-spark-1.3-contributor-free",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
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
      "description": "Muse Spark 1.3 is a multimodal reasoning model from Meta for coding and agentic workflows."
    },
    "fledge-alpha-free": {
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Free-tier preview reasoning model with text and image input and tool use",
      "limits": {
        "catalogProvider": "opencode",
        "catalogModelId": "fledge-alpha-free",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://opencode.ai/docs/zen/",
        "https://models.dev/api.json"
      ],
      "pricing": {
        "input": 0,
        "output": 0,
        "cached": 0
      },
      "billing": {
        "currency": "USD",
        "unit": "per_1000000_tokens",
        "kind": "free-promotion",
        "note": "Limited-time free promotion; no duration or continued serving guarantee. Cache write price unverified."
      }
    },
    "ling-3.1-flash-free": {
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 32768,
        "reasoning": true,
        "tools": true,
        "structuredOutput": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Efficient model for low-latency assistance, extraction, and routine automation",
      "limits": {
        "catalogProvider": "opencode",
        "catalogModelId": "ling-3.1-flash-free",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://opencode.ai/docs/zen/",
        "https://models.dev/api.json"
      ],
      "pricing": {
        "input": 0,
        "output": 0,
        "cached": 0
      },
      "billing": {
        "currency": "USD",
        "unit": "per_1000000_tokens",
        "kind": "free-promotion",
        "note": "Limited-time free promotion; no duration or continued serving guarantee. Cache write price unverified."
      }
    },
    "longcat-2.5-preview-free": {
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Meituan's multimodal reasoning model for coding and agent tasks, with image understanding and a 1M-token context window",
      "limits": {
        "catalogProvider": "opencode",
        "catalogModelId": "longcat-2.5-preview-free",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://opencode.ai/docs/zen/",
        "https://models.dev/api.json"
      ],
      "pricing": {
        "input": 0,
        "output": 0,
        "cached": 0
      },
      "billing": {
        "currency": "USD",
        "unit": "per_1000000_tokens",
        "kind": "free-promotion",
        "note": "Limited-time free promotion; no duration or continued serving guarantee. Cache write price unverified."
      }
    },
    "space-bunny-free": {
      "capabilities": {
        "contextWindow": 1048576,
        "maxInput": 524288,
        "maxOutput": 524288,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Anonymous preview reasoning model for coding, agentic tasks, tool use, and multimodal input",
      "limits": {
        "catalogProvider": "opencode",
        "catalogModelId": "space-bunny-free",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://opencode.ai/docs/zen/",
        "https://models.dev/api.json"
      ],
      "pricing": {
        "input": 0,
        "output": 0,
        "cached": 0
      },
      "billing": {
        "currency": "USD",
        "unit": "per_1000000_tokens",
        "kind": "free-promotion",
        "note": "Limited-time free promotion; no duration or continued serving guarantee. Cache write price unverified."
      }
    },
    "mimo-v2.6-flash-free": {
      "capabilities": {
        "contextWindow": 200000,
        "maxOutput": 32000,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": true,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiMo Flash model for multimodal coding agents and long-context automation",
      "limits": {
        "catalogProvider": "opencode",
        "catalogModelId": "mimo-v2.6-flash-free",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://opencode.ai/docs/zen/",
        "https://models.dev/api.json"
      ],
      "pricing": {
        "input": 0,
        "output": 0,
        "cached": 0
      },
      "billing": {
        "currency": "USD",
        "unit": "per_1000000_tokens",
        "kind": "free-promotion",
        "note": "Limited-time free promotion; no duration or continued serving guarantee. Cache write price unverified."
      }
    }
  },
  "opencode-go": {
    "glm-5.3-flash": {
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
        "catalogProvider": "opencode-go",
        "catalogModelId": "glm-5.3-flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": true,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Native multimodal GLM model for efficient coding and long-horizon agent tasks"
    },
    "glm-5.2": {
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
        "catalogProvider": "opencode-go",
        "catalogModelId": "glm-5.2",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
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
      "description": "Open flagship GLM for long-horizon coding agents and million-token context work"
    },
    "kimi-k2.7-code": {
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
        "catalogProvider": "opencode-go",
        "catalogModelId": "kimi-k2.7-code",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Coding-focused Kimi model, stronger on long-horizon repo work with less overthinking"
    },
    "deepseek-v4-pro": {
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
        "catalogProvider": "opencode-go",
        "catalogModelId": "deepseek-v4-pro",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 384000,
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
      "description": "Flagship DeepSeek model for coding, reasoning, and agentic work"
    },
    "mimo-v2.5": {
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
        "catalogProvider": "opencode-go",
        "catalogModelId": "mimo-v2.5",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 128000,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": true,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiMo omni model for text, image, video, audio, and agents"
    },
    "mimo-v2.5-pro": {
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
        "catalogProvider": "opencode-go",
        "catalogModelId": "mimo-v2.5-pro",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 128000,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiMo pro model for strong multimodal reasoning and agent execution"
    },
    "minimax-m3": {
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
        "catalogProvider": "opencode-go",
        "catalogModelId": "minimax-m3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiniMax multimodal coding model for long-context reasoning and agent tasks"
    },
    "minimax-m2.7": {
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
        "catalogProvider": "opencode-go",
        "catalogModelId": "minimax-m2.7",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 204800,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiniMax model for chat, coding, office work, and agentic tasks"
    },
    "qwen3.7-plus": {
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
        "catalogProvider": "opencode-go",
        "catalogModelId": "qwen3.7-plus",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 65536,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Multimodal reasoning model for visual analysis, planning, and tool use"
    },
    "grok-4.7": {
                 "capabilities": {
                   "contextWindow": 500000,
                   "maxOutput": 500000,
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
                 "description": "xAI's frontier model for long-running agents, coding, knowledge work, and visual projects",
               "sources": [
                   "https://opencode.ai/docs/go/",
                   "https://models.dev/api.json"
                 ], "billing": {"currency": "USD", "unit": "month", "kind": "subscription-quota-reference", "note": "Go $10/month; Go Plus $40/month. Hosted model availability is plan-dependent. Token reference rates measure subscription quota, not standalone cash tariffs."}, "limits": {
                                                                                                                                                                                                                                                                                                                                          "catalogProvider": "opencode-go",
                                                                                                                                                                                                                                                                                                                                          "catalogModelId": "grok-4.7",
                                                                                                                                                                                                                                                                                                                                          "catalogAsOf": "2026-10-17",
                                                                                                                                                                                                                                                                                                                                        "supportedFormats": ["openai-responses"], "authenticatedRouteVerified": false}},
    "gpt-6-luna": {
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
                   "description": "OpenAI's most efficient model for focused, high-volume tasks",
                 "sources": [
                     "https://opencode.ai/docs/go/",
                     "https://models.dev/api.json"
                   ], "billing": {"currency": "USD", "unit": "month", "kind": "subscription-quota-reference", "note": "Go $10/month; Go Plus $40/month. Hosted model availability is plan-dependent. Token reference rates measure subscription quota, not standalone cash tariffs."}, "limits": {
                                                                                                                                                                                                                                                                                                                                            "catalogProvider": "opencode-go",
                                                                                                                                                                                                                                                                                                                                            "catalogModelId": "gpt-6-luna",
                                                                                                                                                                                                                                                                                                                                            "catalogAsOf": "2026-10-17",
                                                                                                                                                                                                                                                                                                                                          "supportedFormats": ["openai-responses"], "authenticatedRouteVerified": false}},
    "qwen3.8-max": {
                    "capabilities": {
                      "contextWindow": 1000000,
                      "maxOutput": 131072,
                      "reasoning": true,
                      "tools": true,
                      "structuredOutput": true,
                      "vision": true,
                      "pdf": false,
                      "audioInput": false,
                      "videoInput": true,
                      "imageOutput": false,
                      "audioOutput": false
                    },
                    "description": "2.4-trillion-parameter multimodal flagship for coding, professional work, and long-horizon agentic workflows",
                  "sources": [
                      "https://opencode.ai/docs/go/",
                      "https://models.dev/api.json"
                    ], "billing": {"currency": "USD", "unit": "month", "kind": "subscription-quota-reference", "note": "Go $10/month; Go Plus $40/month. Hosted model availability is plan-dependent. Token reference rates measure subscription quota, not standalone cash tariffs."}, "limits": {
                                                                                                                                                                                                                                                                                                                                             "catalogProvider": "opencode-go",
                                                                                                                                                                                                                                                                                                                                             "catalogModelId": "qwen3.8-max",
                                                                                                                                                                                                                                                                                                                                             "catalogAsOf": "2026-10-17",
                                                                                                                                                                                                                                                                                                                                           "supportedFormats": ["claude"], "authenticatedRouteVerified": false}},
    "qwen3.8-flash": {
                      "capabilities": {
                        "contextWindow": 1000000,
                        "maxOutput": 131072,
                        "reasoning": true,
                        "tools": true,
                        "structuredOutput": true,
                        "vision": true,
                        "pdf": false,
                        "audioInput": false,
                        "videoInput": true,
                        "imageOutput": false,
                        "audioOutput": false
                      },
                      "description": "Qwen vision-language model for visual reasoning, documents, and agent tasks",
                    "sources": [
                        "https://opencode.ai/docs/go/",
                        "https://models.dev/api.json"
                      ], "billing": {"currency": "USD", "unit": "month", "kind": "subscription-quota-reference", "note": "Go $10/month; Go Plus $40/month. Hosted model availability is plan-dependent. Token reference rates measure subscription quota, not standalone cash tariffs."}, "limits": {
                                                                                                                                                                                                                                                                                                                                               "catalogProvider": "opencode-go",
                                                                                                                                                                                                                                                                                                                                               "catalogModelId": "qwen3.8-flash",
                                                                                                                                                                                                                                                                                                                                               "catalogAsOf": "2026-10-17",
                                                                                                                                                                                                                                                                                                                                             "supportedFormats": ["claude"], "authenticatedRouteVerified": false}},
    "mimo-v2.6-pro": {
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": true,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Stronger MiMo Pro tier for multimodal reasoning and coding-agent execution",
      "limits": {
        "catalogProvider": "opencode-go",
        "catalogModelId": "mimo-v2.6-pro",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://opencode.ai/docs/go/",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "Go $10/month; Go Plus $40/month. Model reference token rates measure subscription quota, not standalone cash tariffs."
      }
    },
    "mimo-v2.6-flash": {
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": true,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiMo Flash model for multimodal coding agents and long-context automation",
      "limits": {
        "catalogProvider": "opencode-go",
        "catalogModelId": "mimo-v2.6-flash",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://opencode.ai/docs/go/",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "Go $10/month; Go Plus $40/month. Model reference token rates measure subscription quota, not standalone cash tariffs."
      }
    },
    "longcat-2.5-preview-free": {
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Meituan's multimodal reasoning model for coding and agent tasks, with image understanding and a 1M-token context window",
      "limits": {
        "catalogProvider": "opencode-go",
        "catalogModelId": "longcat-2.5-preview-free",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://opencode.ai/docs/go/",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "Go $10/month; Go Plus $40/month. Model reference token rates measure subscription quota, not standalone cash tariffs."
      }
    },
    "space-bunny-free": {
      "sources": [
        "https://opencode.ai/docs/go/"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "Go $10/month; Go Plus $40/month. Model reference token rates measure subscription quota, not standalone cash tariffs."
      }
    },
    "kimi-k3": {
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Multimodal Kimi model with 1M context and toggleable max-effort thinking for long-horizon agent work",
      "limits": {
        "catalogProvider": "opencode-go",
        "catalogModelId": "kimi-k3",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://opencode.ai/docs/go/",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "Go $10/month; Go Plus $40/month. Model reference token rates measure subscription quota, not standalone cash tariffs."
      }
    },
    "deepseek-v4.1-flash": {
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 384000,
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
      "description": "DeepSeek V4.1 Flash model for reasoning and agentic coding",
      "limits": {
        "catalogProvider": "opencode-go",
        "catalogModelId": "deepseek-v4.1-flash",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://opencode.ai/docs/go/",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "Go $10/month; Go Plus $40/month. Model reference token rates measure subscription quota, not standalone cash tariffs."
      }
    }
  },
  "clinepass": {
    "cline-pass/glm-5.2": {
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
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/glm-5.2",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
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
      "description": "Open flagship GLM for long-horizon coding agents and million-token context work"
    },
    "cline-pass/kimi-k2.7-code": {
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
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/kimi-k2.7-code",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Coding-focused Kimi model, stronger on long-horizon repo work with less overthinking"
    },
    "cline-pass/kimi-k2.6": {
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
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/kimi-k2.6",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 262144,
        "maxOutput": 262144,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Multimodal Kimi workhorse for agent loops, coding tasks, and visual context"
    },
    "cline-pass/deepseek-v4-pro": {
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
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/deepseek-v4-pro",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 384000,
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
      "description": "Open MoE flagship with million-token context for coding and long agent runs"
    },
    "cline-pass/deepseek-v4-flash": {
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
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/deepseek-v4-flash",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 384000,
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
      "description": "Fast DeepSeek V4 lane for economical reasoning, coding, and long-context work"
    },
    "cline-pass/mimo-v2.5": {
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
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/mimo-v2.5",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": true,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Open MiMo model for multimodal coding agents and long-context automation"
    },
    "cline-pass/mimo-v2.5-pro": {
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
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/mimo-v2.5-pro",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Stronger MiMo Pro tier for multimodal reasoning and coding-agent execution"
    },
    "cline-pass/minimax-m3": {
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
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/minimax-m3",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 512000,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "MiniMax multimodal model for long-context coding, perception, and agent planning"
    },
    "cline-pass/qwen3.7-max": {
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
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/qwen3.7-max",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 65536,
        "reasoning": true,
        "tools": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Qwen frontier model tuned for agent frameworks, coding assistants, and long tasks"
    },
    "cline-pass/qwen3.7-plus": {
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
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/qwen3.7-plus",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 64000,
        "reasoning": true,
        "tools": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Multimodal Qwen workhorse for long-context agents, visual inputs, and coding"
    },
    "cline-pass/glm-5.3": {
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
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
      "description": "Flagship GLM model for long-horizon coding, agents, and complex project delivery",
      "limits": {
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/glm-5.3",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://docs.cline.bot/getting-started/clinepass",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "ClinePass $9.99/month. Reference token prices measure subscription quota; subscribers are not charged those individual API rates."
      }
    },
    "cline-pass/glm-5.3-flash": {
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": true,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Latest natively multimodal model in the GLM-5 series",
      "limits": {
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/glm-5.3-flash",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://docs.cline.bot/getting-started/clinepass",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "ClinePass $9.99/month. Reference token prices measure subscription quota; subscribers are not charged those individual API rates."
      }
    },
    "cline-pass/kimi-k3": {
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": false,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Multimodal Kimi model with 1M context and toggleable max-effort thinking for long-horizon agent work",
      "limits": {
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/kimi-k3",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://docs.cline.bot/getting-started/clinepass",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "ClinePass $9.99/month. Reference token prices measure subscription quota; subscribers are not charged those individual API rates."
      }
    },
    "cline-pass/deepseek-v4.1-flash": {
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 384000,
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
      "description": "DeepSeek V4.1 Flash model for reasoning and agentic coding",
      "limits": {
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/deepseek-v4.1-flash",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://docs.cline.bot/getting-started/clinepass",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "ClinePass $9.99/month. Reference token prices measure subscription quota; subscribers are not charged those individual API rates."
      }
    },
    "cline-pass/qwen3.8-max": {
      "capabilities": {
        "contextWindow": 1000000,
        "maxOutput": 131072,
        "reasoning": true,
        "tools": true,
        "structuredOutput": true,
        "vision": true,
        "pdf": true,
        "audioInput": false,
        "videoInput": true,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "2.4-trillion-parameter MoE flagship for coding, professional work, multimodal understanding, and long-horizon agentic workflows",
      "limits": {
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/qwen3.8-max",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://docs.cline.bot/getting-started/clinepass",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "ClinePass $9.99/month. Reference token prices measure subscription quota; subscribers are not charged those individual API rates."
      }
    },
    "cline-pass/muse-spark-1.3-contributor": {
      "capabilities": {
        "contextWindow": 1048576,
        "maxOutput": 131072,
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
      "description": "Muse Spark 1.3 is a multimodal reasoning model from Meta for long-running agentic, multi-agent, and coding workflows. It improves long-horizon agent collaboration, instruction following, and coding efficiency relative to Muse Spark 1.2.",
      "limits": {
        "catalogProvider": "cline-pass",
        "catalogModelId": "cline-pass/muse-spark-1.3-contributor",
        "catalogAsOf": "2026-10-17"
      },
      "sources": [
        "https://docs.cline.bot/getting-started/clinepass",
        "https://models.dev/api.json"
      ],
      "billing": {
        "currency": "USD",
        "unit": "month",
        "kind": "subscription-quota-reference",
        "note": "ClinePass $9.99/month. Reference token prices measure subscription quota; subscribers are not charged those individual API rates."
      }
    }
  },
  "morph": {
    "morph-v3-large": {
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
        "catalogProvider": "morph",
        "catalogModelId": "morph-v3-large",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 32000,
        "maxOutput": 32000,
        "reasoning": false,
        "tools": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Flagship model for demanding analysis, coding, and production agent workflows"
    },
    "morph-v3-fast": {
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
        "catalogProvider": "morph",
        "catalogModelId": "morph-v3-fast",
        "catalogAsOf": "2026-10-17"
      },
      "capabilities": {
        "contextWindow": 16000,
        "maxOutput": 16000,
        "reasoning": false,
        "tools": false,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "description": "Efficient model for low-latency assistance, extraction, and routine automation"
    },
    "morph-kimik3": {
      "sources": [
        "https://docs.morphllm.com/llms.txt",
        "https://docs.morphllm.com/sdk/components/fast-models"
      ],
      "capabilities": {
        "tools": true,
        "reasoning": true,
        "structuredOutput": true
      },
      "pricing": {
        "input": 2.5,
        "output": 14,
        "cached": 0.29
      },
      "billing": {
        "currency": "USD",
        "unit": "per_1000000_tokens",
        "kind": "metered",
        "note": "Morph shared inference standard processing rates; reasoning tokens bill as output. No cache creation rate verified."
      },
      "limits": {
        "contextWindowText": "1M",
        "scope": "Morph shared inference; exact token count and maximum output unverified",
        "unverifiedCapabilityFields": ["contextWindow", "maxOutput"]
      }
    },
    "morph-glm53-744b": {
      "sources": [
        "https://docs.morphllm.com/llms.txt",
        "https://docs.morphllm.com/sdk/components/fast-models"
      ],
      "capabilities": {
        "tools": true,
        "reasoning": true,
        "structuredOutput": true
      },
      "pricing": {
        "input": 1.19,
        "output": 3.74,
        "cached": 0.1955
      },
      "billing": {
        "currency": "USD",
        "unit": "per_1000000_tokens",
        "kind": "metered",
        "note": "Morph shared inference standard processing rates; reasoning tokens bill as output. No cache creation rate verified. Optional standby service tier bills at 50% of standard; not the default tariff."
      },
      "limits": {
        "contextWindowText": "1M",
        "scope": "Morph shared inference; exact token count and maximum output unverified",
        "unverifiedCapabilityFields": ["contextWindow", "maxOutput"]
      }
    },
    "morph-glm53flash": {
      "sources": [
        "https://docs.morphllm.com/llms.txt",
        "https://docs.morphllm.com/sdk/components/fast-models"
      ],
      "capabilities": {
        "tools": true,
        "reasoning": true,
        "structuredOutput": true,
        "vision": true
      },
      "pricing": {
        "input": 0.2,
        "output": 0.7,
        "cached": 0.04
      },
      "billing": {
        "currency": "USD",
        "unit": "per_1000000_tokens",
        "kind": "metered",
        "note": "Morph shared inference standard processing rates; reasoning tokens bill as output. No cache creation rate verified."
      },
      "limits": {
        "contextWindowText": "1M",
        "scope": "Morph shared inference; exact token count and maximum output unverified",
        "unverifiedCapabilityFields": ["contextWindow", "maxOutput"]
      }
    },
    "morph-dsv41flash": {
      "sources": [
        "https://docs.morphllm.com/llms.txt",
        "https://docs.morphllm.com/sdk/components/fast-models"
      ],
      "capabilities": {
        "tools": true,
        "reasoning": true,
        "structuredOutput": true,
        "vision": true,
        "videoInput": false
      },
      "pricing": {
        "input": 0.15,
        "output": 0.6
      },
      "billing": {
        "currency": "USD",
        "unit": "per_1000000_tokens",
        "kind": "metered",
        "note": "Morph shared inference standard processing rates; reasoning tokens bill as output. No cache creation rate verified."
      },
      "limits": {
        "contextWindowText": "1M",
        "scope": "Morph shared inference; exact token count and maximum output unverified",
        "unverifiedCapabilityFields": ["contextWindow", "maxOutput"]
      }
    },
    "morph-dsv4flash": {
      "sources": [
        "https://docs.morphllm.com/llms.txt",
        "https://docs.morphllm.com/sdk/components/fast-models"
      ],
      "capabilities": {
        "tools": true,
        "reasoning": true,
        "structuredOutput": true
      },
      "pricing": {
        "input": 0.141953125,
        "output": 0.399625,
        "cached": 0.0359375
      },
      "billing": {
        "currency": "USD",
        "unit": "per_1000000_tokens",
        "kind": "metered",
        "note": "Morph shared inference standard processing rates; reasoning tokens bill as output. No cache creation rate verified."
      },
      "limits": {
        "contextWindowText": "1M",
        "scope": "Morph shared inference; exact token count and maximum output unverified",
        "unverifiedCapabilityFields": ["contextWindow", "maxOutput"]
      }
    }
  },
  "vertex-partner": {
    "deepseek-ai/deepseek-v3.2-maas": {
      "description": "Managed DeepSeek V3.2 for efficient agent workflows on Google's global MaaS endpoint.",
      "capabilities": {
        "contextWindow": 163840,
        "maxOutput": 65536,
        "reasoning": false,
        "tools": true,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "sources": [
        "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/deepseek/deepseek-v32",
        "https://models.dev/api.json"
      ],
      "limits": {
        "scope": "Google managed API global MaaS endpoint, not native DeepSeek or Vertex Anthropic",
        "authenticatedRouteVerified": false,
        "catalogProvider": "google-vertex",
        "catalogModelId": "deepseek-ai/deepseek-v3.2-maas",
        "catalogAsOf": "2026-10-17",
        "unverifiedCapabilityFields": ["maxInput"],
        "fieldSources": {
          "contextWindow": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/deepseek/deepseek-v32",
          "maxOutput": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/deepseek/deepseek-v32",
          "reasoning": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/deepseek/deepseek-v32"
        },
        "note": "Oct 16 primary quotas: 163,840 context and 65,536 output. Function calling and structured output supported; Thinking explicitly not supported."
      },
      "billing": {
        "kind": "unverified-pricing",
        "unverifiedPriceFields": ["input", "output", "cached", "cache_creation", "cache_creation_1h"],
        "note": "No exact global MaaS tariff verified in this review; native-vendor token prices are not a substitute."
      }
    },
    "zai-org/glm-5-maas": {
      "description": "Managed GLM 5 for systems engineering and agent workflows on Google's global MaaS endpoint.",
      "capabilities": {
        "contextWindow": 200000,
        "maxOutput": 128000,
        "reasoning": false,
        "tools": true,
        "structuredOutput": true,
        "vision": false,
        "pdf": false,
        "audioInput": false,
        "videoInput": false,
        "imageOutput": false,
        "audioOutput": false
      },
      "sources": [
        "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/zaiorg/glm-5",
        "https://models.dev/api.json"
      ],
      "limits": {
        "scope": "Google managed API global MaaS endpoint, not native Z.ai or Vertex Anthropic",
        "authenticatedRouteVerified": false,
        "catalogProvider": "google-vertex",
        "catalogModelId": "zai-org/glm-5-maas",
        "catalogAsOf": "2026-10-17",
        "unverifiedCapabilityFields": ["maxInput"],
        "fieldSources": {
          "contextWindow": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/zaiorg/glm-5",
          "maxOutput": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/zaiorg/glm-5",
          "reasoning": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/zaiorg/glm-5"
        },
        "note": "Oct 16 primary quotas: 200,000 context and 128,000 output. Function calling and structured output supported; Thinking explicitly not supported. A scheduled retirement is not proof of shutdown on this audit date."
      },
      "billing": {
        "kind": "unverified-pricing",
        "unverifiedPriceFields": ["input", "output", "cached", "cache_creation", "cache_creation_1h"],
        "note": "No exact global MaaS tariff verified in this review; native-vendor token prices are not a substitute."
      }
    }
  }
};

// Primary response hashes and the full public catalogs are retained under
// /tmp/opencode/zenrouter-client-pricing-refresh-20261021/gateway. The captured
// models.dev API is a cross-check, not proof of a native route's bill or access.
const gatewayCatalogSnapshot = {
  url: "https://models.dev/api.json",
  capturedAt: "2026-10-21T10:47:38.332470+00:00",
  sha256: "079175d89430bbf5ee2a0e271ced1ad4b4d1cf529fdbd0a5db50bb2e857e90a8",
  repositoryCommit: "020f86d1b0970fe421c5dd7baec94478879d9756",
  note: "API capture and repository commit are independently pinned; the API is not reconstructed from the commit.",
};
const unknownGatewayPrice = { input: null, output: null, cached: null, reasoning: null, cache_creation: null, cache_creation_1h: null };
const textAdapterOnly = { audioInput: false, videoInput: false, imageOutput: false, audioOutput: false };

const gatewayTariffReview = {
  cerebras: {
    sources: ["https://www.cerebras.ai/pricing"],
    note: "Developer PAYG table embedded in the primary pricing page. Cache tariffs are unpublished; promotional credits are not deducted. Anonymous model discovery returned 403, not proof of retirement.",
    rates: {
      "gpt-oss-120b": { input: 0.35, output: 0.75 },
      "qwen-3.8-27b": { input: 0.99, output: 1.49 },
    },
  },
  chutes: {
    sources: ["https://llm.chutes.ai/v1/models", "https://chutes.ai/pricing"],
    note: "Public inference PAYG USD per million tokens, not TAO or dedicated-GPU pricing. Cache-read quotes come from the exact model's public price.usd fields; cache-write tariffs remain unknown.",
    rates: {
      "google/gemma-4-31B-turbo-TEE": { input: 0.12, output: 0.37, cached: 0.012 },
      "Nemotron-3-Nano-Omni-30B-TEE": { input: 0.0245, output: 0.0978, cached: 0.00245 },
      "moonshotai/Kimi-K3-TEE": { input: 1.85, output: 9.5, cached: 0.185 },
      "moonshotai/Kimi-K2.6-TEE": { input: 0.45, output: 1.95, cached: 0.045 },
      "zai-org/GLM-5.2-TEE": { input: 1.25, output: 3.95, cached: 0.125 },
      "zai-org/GLM-5.1-TEE": { input: 0.98, output: 3.08, cached: 0.098 },
      "deepseek-ai/DeepSeek-V4-Flash-0731-TEE": { input: 0.44, output: 1.32, cached: 0.044 },
      "deepseek-ai/DeepSeek-V3.2-TEE": { input: 1, output: 1, cached: 0.1 },
      "Qwen/Qwen3.5-397B-A17B-TEE": { input: 0.45, output: 3, cached: 0.045 },
      "Qwen/Qwen3.8-27B-TEE": { input: 0.039, output: 1.25, cached: 0.0039 },
      "Qwen/Qwen3.6-27B-TEE": { input: 0.25, output: 2, cached: 0.025 },
      "Qwen/Qwen3-32B-TEE": { input: 0.104, output: 0.416, cached: 0.0104 },
      "Qwen/Qwen3-235B-A22B-Thinking-2507-TEE": { input: 0.2989, output: 1.1957, cached: 0.02989 },
      "unsloth/Mistral-Nemo-Instruct-2407-TEE": { input: 0.0245, output: 0.0978, cached: 0.00245 },
    },
  },
  "cloudflare-ai": {
    sources: ["https://developers.cloudflare.com/workers-ai/platform/pricing/"],
    kind: "neuron-derived-token-quote",
    note: "Exact neurons per million tokens multiplied by USD 0.011/1000 neurons. Free 10,000-neuron daily allocation and prepaid credit funding are not deducted. Qwen cache tariffs remain unknown.",
    rates: {
      "@cf/meta/llama-3.2-1b-instruct": { input: 0.027027, output: 0.200772 },
      "@cf/meta/llama-3.2-3b-instruct": { input: 0.050875, output: 0.335225 },
      "@cf/meta/llama-3.1-8b-instruct-fp8-fast": { input: 0.045309, output: 0.383548 },
      "@cf/mistralai/mistral-small-3.1-24b-instruct": { input: 0.350636, output: 0.555368 },
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast": { input: 0.293348, output: 2.252855 },
      "@cf/meta/llama-4-scout-17b-16e-instruct": { input: 0.269995, output: 0.850003 },
      "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": { input: 0.49687, output: 4.881316 },
      "@cf/deepseek-ai/deepseek-v4-flash-0731": { input: 0.44, output: 1.32, cached: 0.014003 },
      "@cf/deepseek-ai/deepseek-v4.1-flash-1017": { input: 0.300003, output: 1.200001, cached: 0.005995 },
      "@cf/deepseek-ai/deepseek-v4-pro-0813": { input: 1.32, output: 3.96, cached: 0.044 },
      "@cf/moonshotai/kimi-k2.5": { input: 0.599995, output: 2.999997, cached: 0.100001 },
      "@cf/moonshotai/kimi-k2.6": { input: 0.950004, output: 3.999996, cached: 0.159995 },
      "@cf/moonshotai/kimi-k2.7-code": { input: 0.950004, output: 3.999996, cached: 0.190003 },
      "@cf/zai-org/glm-4.7-flash": { input: 0.0605, output: 0.4004 },
      "@cf/zai-org/glm-5.2": { input: 1.400003, output: 4.4, cached: 0.259996 },
      "@cf/zai-org/glm-5.3": { input: 1.400003, output: 4.4, cached: 0.259996 },
      "@cf/zai-org/glm-5.3-flash": { input: 0.149996, output: 0.500005, cached: 0.029997 },
      "@cf/openai/gpt-oss-120b": { input: 0.349998, output: 0.750002 },
      "@cf/openai/gpt-oss-20b": { input: 0.200002, output: 0.300003 },
      "@cf/qwen/qwen3.8-27b": { input: 0.449999, output: 3.199999 },
      "@cf/qwen/qwq-32b": { input: 0.66, output: 0.999999 },
      "@cf/qwen/qwen2.5-coder-32b-instruct": { input: 0.66, output: 0.999999 },
    },
  },
  groq: {
    sources: ["https://console.groq.com/docs/models", "https://console.groq.com/docs/prompt-caching"],
    note: "Primary standard text quotes; only GPT OSS has a documented 50% cache-hit discount. Llama and MiniMax Enterprise prices require a sales quote. Anonymous /models returned 401; existing models remain advertised.",
    rates: {
      "openai/gpt-oss-120b": { input: 0.15, output: 0.6, cached: 0.075 },
      "openai/gpt-oss-20b": { input: 0.075, output: 0.3, cached: 0.0375 },
      "qwen/qwen3.8-27b": { input: 0.8, output: 4 },
    },
    unknownKind: "enterprise-quote",
    unknown: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "minimaxai/minimax-m2.7"],
  },
  nebius: {
    sources: ["https://tokenfactory.nebius.com/api/public/models_info", "https://tokenfactory.nebius.com/model-catalog.md"],
    note: "Token Factory's primary public per-million model tariff. V4 Flash 0731 cache-read is USD 0.01, not the stale 0.14 catalog reference. Public regional flavors are not verified account entitlement.",
    rates: {
      "deepseek-ai/DeepSeek-V4-Flash-0731": { input: 0.14, output: 0.28, cached: 0.01 },
      "deepseek-ai/DeepSeek-V4.1-Flash": { input: 0.3, output: 1.2, cached: 0.01 },
      "MiniMaxAI/MiniMax-M3": { input: 0.3, output: 1.2, cached: 0.06 },
    },
  },
  siliconflow: {
    sources: ["https://www.siliconflow.com/pricing"],
    note: "International SiliconFlow USD per million text tokens, not the CN/CNY product or native vendor price. Exact routed model names are retained; no cache-write price is inferred.",
    rates: {
      "deepseek-ai/DeepSeek-V4-Pro": { input: 1.50162, output: 3.135, cached: 0.135 },
      "deepseek-ai/DeepSeek-V4-Pro-0813": { input: 1.32, output: 3.96, cached: 0.044 },
      "deepseek-ai/DeepSeek-V4.1-Flash": { input: 0.15, output: 0.6, cached: 0.003 },
      "Qwen/Qwen3.5-122B-A10B": { input: 0.26, output: 2.08 },
      "zai-org/GLM-5.3": { input: 1.4, output: 4.4, cached: 0.26 },
      "zai-org/GLM-5.3-Flash": { input: 0.15, output: 0.5, cached: 0.03 },
      "zai-org/GLM-5.1": { input: 1.19, output: 3.74, cached: 0.6 },
      "zai-org/GLM-5": { input: 0.95, output: 2.55, cached: 0.2 },
      "moonshotai/Kimi-K3": { input: 2.7, output: 13.5, cached: 0.27 },
      "moonshotai/Kimi-K2.7-Code": { input: 0.85916, output: 3.8, cached: 0.17993 },
      "moonshotai/Kimi-K2.6": { input: 0.77, output: 3.4, cached: 0.14 },
      "moonshotai/Kimi-K2.5": { input: 0.45, output: 2.25, cached: 0.07 },
      "openai/gpt-oss-120b": { input: 0.05, output: 0.45, cached: 0.075 },
    },
  },
  together: {
    sources: ["https://docs.together.ai/docs/serverless-models", "https://www.together.ai/pricing"],
    note: "Serverless Chat API IDs and USD per million token quotes. The primary pricing page's Qwen3.7-Max 1.50/4.50/0.30 and Qwen3.8-2.4T-A95B 2/6/0.25 quotes take precedence over conflicting catalog/documentation references. Missing catalog rows are not retirements.",
    rates: {
      "deepseek-ai/DeepSeek-V4-Pro-0813": { input: 1.32, output: 3.96, cached: 0.13 },
      "deepseek-ai/DeepSeek-V4.1-Flash": { input: 0.3, output: 1.2, cached: 0.006 },
      "deepseek-ai/DeepSeek-V4.1-Flash-1017": { input: 0.3, output: 1.2, cached: 0.006 },
      "meta-models/Muse-Spark-Open-816B-A42B": { input: 1.25, output: 4.25, cached: 0.15 },
      "moonshotai/Kimi-K3": { input: 3, output: 15, cached: 0.3 },
      "zai-org/GLM-5.3": { input: 1.4, output: 4.4, cached: 0.26 },
      "zai-org/GLM-5.3-Flash": { input: 0.15, output: 0.5, cached: 0.03 },
      "zai-org/GLM-5.2": { input: 1.4, output: 4.4, cached: 0.26 },
      "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
      "Qwen/Qwen3.8-Flash": { input: 0.15, output: 0.47 },
      "Qwen/Qwen3.8-2.4T-A95B": { input: 2, output: 6, cached: 0.25 },
      "Qwen/Qwen3.7-Plus": { input: 0.32, output: 1.28 },
      "Qwen/Qwen3.7-Max": { input: 1.5, output: 4.5, cached: 0.3 },
      "Qwen/Qwen3.6-Plus": { input: 0.5, output: 3 },
      "Qwen/Qwen3.5-9B": { input: 0.17, output: 0.25 },
      "MiniMaxAI/MiniMax-M3": { input: 0.3, output: 1.2, cached: 0.06 },
    },
  },
  venice: {
    sources: ["https://api.venice.ai/api/v1/models", "https://docs.venice.ai/overview/pricing"],
    note: "Exact Venice text-route model_spec.pricing.*.usd quotes, per million tokens. DIEM/staked funding and account discounts are separate; no media or unreported cache-write tariff is inferred.",
    rates: {
      "venice-uncensored-1-2": { input: 0.2, output: 0.9 },
      "zai-org-glm-5": { input: 1, output: 3.2, cached: 0.2 },
      "z-ai-glm-5-3": { input: 1.75, output: 5.5, cached: 0.325 },
      "z-ai-glm-5-3-flash": { input: 0.15, output: 0.5, cached: 0.03 },
      "kimi-k3": { input: 3.75, output: 18.75, cached: 0.375 },
      "deepseek-v4-flash": { input: 0.138, output: 0.275, cached: 0.028 },
      "deepseek-v4-1-flash-1017": { input: 0.3, output: 1.2, cached: 0.0075 },
      "qwen3-235b-a22b-instruct-2507": { input: 0.15, output: 0.75 },
      "qwen3-coder-480b-a35b-instruct-turbo": { input: 0.35, output: 1.5, cached: 0.04 },
      "qwen3-vl-235b-a22b": { input: 0.21, output: 1.9, cached: 0.1 },
      "deepseek-v4-pro": { input: 1.65, output: 3.301, cached: 0.33 },
      "llama-3.3-70b": { input: 0.7, output: 2.8 },
      "hermes-3-llama-3.1-405b": { input: 1.1, output: 3 },
      "mistral-small-3-2-24b-instruct": { input: 0.09375, output: 0.25 },
    },
  },
  sambanova: {
    sources: ["https://api.sambanova.ai/v1/models"],
    note: "Public native catalog prices are per token and converted to USD per million. MiniMax M3 explicitly quotes a zero cache-write tariff. Absent cache fields and account entitlement remain unknown.",
    rates: {
      "DeepSeek-V3.1": { input: 3, output: 4.5 },
      "DeepSeek-V3.2": { input: 3, output: 4.5 },
      "Meta-Llama-3.3-70B-Instruct": { input: 0.6, output: 1.2 },
      "MiniMax-M3": { input: 0.6, output: 2.4, cached: 0.06, cache_creation: 0 },
      "gemma-4-31B-it": { input: 0.38, output: 1.15 },
      "gpt-oss-120b": { input: 0.22, output: 0.59 },
    },
    unknown: ["MiniMax-M2.7"],
  },
  morph: {
    sources: ["https://www.morphllm.com/api/models/json", "https://docs.morphllm.com/sdk/components/fast-models"],
    note: "Primary machine-readable schema explicitly prices cost_usd per token; values below are per million. Standard shared-inference quotes, not native model-vendor or 50%-standby estimates. Explicit zero implicit cache writes are retained.",
    rates: {
      "morph-v3-large": { input: 0.9, output: 1.9 },
      "morph-v3-fast": { input: 0.8, output: 1.2 },
      "morph-kimik3": { input: 0.814, output: 14.9, cached: 0.389, cache_creation: 0 },
      "morph-glm53-744b": { input: 0.217, output: 4.4, cached: 0.055, cache_creation: 0 },
      "morph-glm53flash": { input: 0.667, output: 0.65, cached: 0.185, cache_creation: 0 },
      "morph-dsv41flash": { input: 0.206, output: 0.6, cached: 0.018, cache_creation: 0 },
      "morph-dsv41flash-1017": { input: 0.206, output: 0.6, cached: 0.018, cache_creation: 0 },
      "morph-dsv4flash": { input: 0.086, output: 0.241, cached: 0.036, cache_creation: 0 },
    },
    unknown: ["morph-qwen35-397b", "morph-minimax27-230b", "morph-qwen36-27b"],
  },
  featherless: {
    sources: ["https://api.featherless.ai/v1/models", "https://featherless.ai/pricing"],
    kind: "developer-plan-metered",
    note: "Developer/API plan per-model USD per million token quotes; not the unlimited human-driven Chat subscription. The catalog's per-token prompt/completion strings agree with its per-million input/output fields. Cache tariffs are not published.",
    rates: {
      "deepseek-ai/DeepSeek-V4-Pro": { input: 1.6, output: 3.2 },
      "deepseek-ai/DeepSeek-V4-Flash": { input: 0.14, output: 0.28 },
      "zai-org/GLM-5.2": { input: 1.4, output: 4.4 },
      "zai-org/GLM-5.1": { input: 1.3, output: 4.3 },
      "moonshotai/Kimi-K2.7-Code": { input: 0.8, output: 3.4 },
      "moonshotai/Kimi-K3": { input: 3, output: 15 },
      "zai-org/GLM-5.3": { input: 1.4, output: 4.4 },
      "zai-org/GLM-5.3-Flash": { input: 0.15, output: 0.5 },
      "deepseek-ai/DeepSeek-V4.1-Flash": { input: 0.3, output: 1.2 },
      "moonshotai/Kimi-K2.6": { input: 0.8, output: 3.4 },
      "moonshotai/Kimi-K2.5": { input: 0.8, output: 3.4 },
    },
  },
  hyperbolic: {
    sources: ["https://api.hyperbolic.xyz/v1/models", "https://docs.hyperbolic.xyz/docs/pricing", "https://www.hyperbolic.ai/"],
    note: "Anonymous catalog requires authentication; public pricing URLs redirect or return 404 and the current site quotes GPU capacity, not this token route. No exact text token tariff verified. Existing IDs remain enabled.",
    unknown: ["Qwen/QwQ-32B", "Qwen/Qwen3-Next-80B-A3B-Thinking", "Qwen/Qwen3-Next-80B-A3B-Instruct", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "deepseek-ai/DeepSeek-R1", "deepseek-ai/DeepSeek-V3", "meta-llama/Llama-3.3-70B-Instruct", "meta-llama/Llama-3.2-3B-Instruct", "meta-llama/Meta-Llama-3.1-405B", "Qwen/Qwen2.5-72B-Instruct", "Qwen/Qwen2.5-Coder-32B-Instruct", "NousResearch/Hermes-3-Llama-3.1-70B"],
  },
  nvidia: {
    sources: ["https://integrate.api.nvidia.com/v1/models", "https://build.nvidia.com/explore/discover"],
    unknownKind: "trial-or-enterprise",
    note: "Public catalog and free serverless development trial are not an unlimited paid API tariff. Trial allowance, enterprise entitlement and marginal paid prices are account-specific and unverified. No vendor-leaf dollars are substituted.",
    unknown: ["minimaxai/minimax-m2.7", "minimaxai/minimax-m3", "z-ai/glm-5.2", "deepseek-ai/deepseek-v4-pro", "deepseek-ai/deepseek-v4-pro-0813", "deepseek-ai/deepseek-v4-flash", "moonshotai/kimi-k2.6", "nvidia/nemotron-3-ultra-550b-a55b", "deepseek-ai/deepseek-v4.1-flash", "nvidia/nemotron-3.5-super-vl-120b-a12b"],
  },
  tokenrouter: {
    sources: ["https://api.tokenrouter.com/api/pricing", "https://api.tokenrouter.com/api/status", "https://www.tokenrouter.com/assets/index-DfpUj4Db.js"],
    kind: "reseller-ratio-quote",
    note: "Primary public tariff catalog: 156 literal rows. USD/1M = model_ratio × 2 × default-group ratio 1; output/cache/write ratios multiply that base. /api/status confirms USD and 500000 quota units per USD. This is the public default quote, not verified account billing, serving or a custom-origin tariff. Gemini/Seed storage-duration cache values are not treated as token writes. Raw tier ranges are retained separately; ambiguous boundary and conflicting rounded tiers are not guessed.",
    rates: {
      "minimax/minimax-m3.1-flash": { input: 0, output: 0 },
      "z-ai/glm-5.3": { input: 0.56, output: 1.76, cached: 0.104 },
      "moonshotai/kimi-k3": { input: 1.8, output: 9, cached: 0.18 },
      "deepseek/deepseek-v4.1-flash": { input: 0.18, output: 0.72, cached: 0.0036 },
      "deepseek/deepseek-v4-flash-0731": { input: 0.264, output: 0.792, cached: 0.0084 },
      "deepseek/deepseek-v4.1-flash-1017": { input: 0.18, output: 0.72, cached: 0.0036 },
      "google/gemini-4-argon": { input: 2, output: 10, cached: 0.1 },
      "anthropic/claude-haiku-5.5": { input: 0.5, output: 2.5, cached: 0.05, cache_creation: 0.625 },
      "openai/gpt-6.1-sol": { input: 2, output: 10, cached: 0.1, cache_creation: 2.5 },
      "anthropic/claude-sonnet-5.5": { input: 2, output: 10, cached: 0.2, cache_creation: 2.5 },
      "openai/gpt-6-luna": { input: 0.1, output: 0.5, cached: 0.01, cache_creation: 0.125 },
      "openai/gpt-6-sol": { input: 2, output: 10, cached: 0.2, cache_creation: 2.5 },
      "anthropic/claude-opus-5.5": { input: 4, output: 20, cached: 0.2, cache_creation: 5 },
      "x-ai/grok-4.7": { input: 2, output: 6, cached: 0.5 },
      "xiaomi/mimo-v2.6-pro-ultraspeed": { input: 4.35, output: 8.7, cached: 0.036 },
      "xiaomi/mimo-v2.6-pro": { input: 0.435, output: 0.87, cached: 0.0036 },
      "xiaomi/mimo-v2.6-flash": { input: 0.14, output: 0.28, cached: 0.0028 },
      "z-ai/glm-5.3-flashx": { input: 0.37, output: 1.25, cached: 0.075 },
      "stealth/union-alpha": { input: 0, output: 0 },
      "openai/gpt-6-astra": { input: 10, output: 50, cached: 1, cache_creation: 12.5 },
      "tencent/hy4-preview": { input: 0.834, output: 2.501, cached: 0.042 },
      "google/gemini-3.8-flash": { input: 0.75, output: 3.75, cached: 0.075 },
      "anthropic/claude-fable-5.1": { input: 10, output: 50, cached: 0.25, cache_creation: 12.5 },
      "qwen/qwen3.8-max": { input: 2, output: 6, cached: 0.25, cache_creation: 2.5 },
      "qwen/qwen3.8-flash": { input: 0.1177, output: 0.3971, cached: 0.0148, cache_creation: 0.1838 },
      "z-ai/glm-5.3-flash": { input: 0.15, output: 0.5, cached: 0.03 },
      "deepseek/deepseek-v4-flash-vision-exp": { input: 0.44, output: 1.32, cached: 0.014 },
      "google/gemini-3.7-flash": { input: 0.75, output: 3.75, cached: 0.075 },
      "deepseek/deepseek-v4-pro-0813": { input: 1.32, output: 3.96, cached: 0.044 },
      "nvidia/nemotron-3.5-lightning": { input: 0.1, output: 0.25, cached: 0.05 },
      "x-ai/grok-4.6": { input: 2, output: 6, cached: 0.5 },
      "anthropic/claude-opus-5": { input: 5, output: 25, cached: 0.5, cache_creation: 6.25 },
      "google/gemini-3.6-flash": { input: 1.5, output: 7.5, cached: 0.15 },
      "google/gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cached: 0.03 },
      "z-ai/glm-5.2": { input: 1.4, output: 4.4, cached: 0.26 },
      "openai/gpt-5.6-luna": { input: 0.2, output: 1.2, cached: 0.02, cache_creation: 0.25 },
      "openai/gpt-5.6-terra": { input: 2, output: 12, cached: 0.2, cache_creation: 2.5 },
      "openai/gpt-5.6-sol": { input: 5, output: 30, cached: 0.5, cache_creation: 6.25 },
      "x-ai/grok-4.5": { input: 2, output: 6, cached: 0.5 },
      "anthropic/claude-fable-5": { input: 10, output: 50, cached: 1, cache_creation: 12.5 },
      "anthropic/claude-sonnet-5": { input: 2, output: 10, cached: 0.2, cache_creation: 2.5 },
      "sakana/fugu-ultra": { input: 5, output: 30, cached: 0.5 },
      "moonshotai/kimi-k2.7-code": { input: 0.9286, output: 3.8571, cached: 0.1857 },
      "x-ai/grok-build-0.1": { input: 1, output: 2, cached: 0.2 },
      "openai/gpt-5.5-pro": { input: 30, output: 180 },
      "openai/gpt-5.4-pro": { input: 30, output: 180 },
      "openai/gpt-5": { input: 1.25, output: 10, cached: 0.125 },
      "ex/gpt-5.4": { input: 2.5, output: 15, cached: 0.25 },
      "anthropic/claude-opus-5-5-advance-ai": { input: 4, output: 20, cached: 0.2, cache_creation: 8 },
      "stealth/ox-alpha": { input: 0, output: 0 },
      "mistralai/mistral-small-2603": { input: 0.15, output: 0.6, cached: 0.015 },
      "mistralai/mistral-medium-3-5": { input: 1.5, output: 7.5 },
      "stepfun/step-3.7-flash": { input: 0.2, output: 1.15, cached: 0.04 },
      "mistralai/voxtral-small-24b-2507": { input: 0.1, output: 0.3, cached: 0.01 },
      "qwen/qwen3.7-plus": { input: 0.4, output: 1.6, cached: 0.08 },
      "MiniMax-M3": { input: 0.3, output: 1.2, cached: 0.06 },
      "anthropic/claude-opus-4.8": { input: 5, output: 25, cached: 0.5, cache_creation: 6.25 },
      "seed-2-0-pro-260328": { input: 1, output: 6, cached: 0.2 },
      "seed-2-0-mini-260428": { input: 0.2, output: 0.8, cached: 0.04 },
      "seed-2-0-code-preview-260328": { input: 1, output: 6, cached: 0.2 },
      "seed-2-0-lite-260428": { input: 0.5, output: 4, cached: 0.1 },
      "openai/gpt-5.4-mini": { input: 0.75, output: 4.5, cached: 0.075 },
      "openai/gpt-5.4-nano": { input: 0.2, output: 1.25, cached: 0.02 },
      "qwen/qwen3.7-max": { input: 1.25, output: 3.75, cached: 0.25 },
      "openai/gpt-oss-120b": { input: 0.039, output: 0.18 },
      "google/gemini-3.5-flash": { input: 1.5, output: 9, cached: 0.15 },
      "tencent/hy3-preview": { input: 0.066, output: 0.260000004, cached: 0.029000004 },
      "x-ai/grok-4.3": { input: 1.25, output: 2.5, cached: 0.2 },
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": { input: 0, output: 0 },
      "openai/gpt-5.5": { input: 5, output: 30, cached: 0.5 },
      "xiaomi/mimo-v2.5-pro": { input: 1, output: 3, cached: 0.2 },
      "z-ai/glm-5.1": { input: 1.05, output: 3.49999965, cached: 0.525 },
      "xiaomi/mimo-v2.5": { input: 0.4, output: 2, cached: 0.08 },
      "deepseek/deepseek-v4-pro": { input: 1.32, output: 3.96, cached: 0.044 },
      "anthropic/claude-opus-4.7": { input: 5, output: 25, cached: 0.5, cache_creation: 6.25 },
      "anthropic/claude-haiku-4.5": { input: 1, output: 5, cached: 0.1, cache_creation: 1.25 },
      "anthropic/claude-opus-4.5": { input: 5, output: 25, cached: 0.5, cache_creation: 6.25 },
      "anthropic/claude-opus-4.6": { input: 5, output: 25, cached: 0.5, cache_creation: 6.25 },
      "anthropic/claude-sonnet-4": { input: 3, output: 15, cached: 0.3, cache_creation: 3.75 },
      "anthropic/claude-sonnet-4.5": { input: 3, output: 15, cached: 0.3, cache_creation: 3.75 },
      "anthropic/claude-sonnet-4.6": { input: 3, output: 15, cached: 0.3, cache_creation: 3.75 },
      "moonshotai/kimi-k2.6": { input: 0.95, output: 4, cached: 0.16 },
      "openai/gpt-5.2": { input: 1.75, output: 14, cached: 0.175 },
      "openai/gpt-5.3-codex": { input: 1.75, output: 14, cached: 0.175 },
      "qwen/qwen3.5-flash": { input: 0.1048, output: 0.4194 },
      "z-ai/glm-4.6": { input: 0.6, output: 2.2, cached: 0.11 },
      "z-ai/glm-4.7": { input: 0.6, output: 2.2, cached: 0.11 },
      "minimax/minimax-m2-her": { input: 0.3, output: 1.2, cached: 0.03 },
      "minimax/minimax-m2.7": { input: 0.3, output: 1.2, cached: 0.06 },
      "stepfun/step-3.5-flash": { input: 0.1, output: 0.3, cached: 0.02 },
      "xiaomi/mimo-v2-pro": { input: 1, output: 3, cached: 0.2 },
      "xiaomi/mimo-v2-omni": { input: 0.4, output: 2, cached: 0.08 },
      "xiaomi/mimo-v2-flash": { input: 0.1, output: 0.3, cached: 0.01 },
      "qwen/qwen3.5-9b": { input: 0.1, output: 0.15 },
      "x-ai/grok-4.20-beta": { input: 2, output: 6, cached: 0.2 },
      "z-ai/glm-5": { input: 1, output: 3.2, cached: 0.2 },
      "z-ai/glm-4.5-air": { input: 0.13, output: 0.85000006, cached: 0.02500004 },
      "x-ai/grok-4.1-fast": { input: 0.2, output: 0.5, cached: 0.05 },
      "qwen/qwen3.5-plus-02-15": { input: 0.26, output: 1.56 },
      "qwen/qwen3.5-397b-a17b": { input: 0.39, output: 2.34 },
      "qwen/qwen3.5-35b-a3b": { input: 0.1625, output: 1.3 },
      "qwen/qwen3.5-122b-a10b": { input: 0.26, output: 2.08 },
      "qwen/qwen3-coder-next": { input: 0.12, output: 0.75, cached: 0.06 },
      "z-ai/glm-4.6v": { input: 0.3, output: 0.9 },
      "openai/gpt-5.4": { input: 2.5, output: 15, cached: 0.25 },
      "openai/gpt-5-mini": { input: 0.25, output: 2, cached: 0.025 },
      "openai/gpt-4o-mini": { input: 0.15, output: 0.6, cached: 0.075 },
      "moonshotai/kimi-k2.5": { input: 0.6, output: 3, cached: 0.1 },
      "minimax/minimax-m2.7-highspeed": { input: 0.6, output: 2.4, cached: 0.06 },
      "mistralai/devstral-2512": { input: 0.4, output: 2, cached: 0.04 },
      "z-ai/glm-5-turbo": { input: 1.2, output: 4, cached: 0.24 },
      "minimax/minimax-m2.1-highspeed": { input: 0.6, output: 2.4, cached: 0.06 },
      "minimax/minimax-m2.5": { input: 0.3, output: 1.2, cached: 0.03 },
      "minimax/minimax-m2.1": { input: 0.3, output: 1.2, cached: 0.03 },
      "google/gemini-3.1-pro-preview": { input: 2, output: 12, cached: 0.2 },
      "google/gemini-3-flash-preview": { input: 0.5, output: 3, cached: 0.05 },
      "deepseek/deepseek-v3.2": { input: 0.26, output: 0.37999988, cached: 0.13 },
      "nvidia/nemotron-3-super-120b-a12b": { input: 0.3, output: 0.9, cached: 0.1 },
    },
    unknown: ["qwen3.6-flash", "qwen/qwen3.6-plus", "typesafe/jev-1.13", "anthropic/claude-opus-4.7-fast", "anthropic/claude-opus-4.8-fast", "anthropic/claude-opus-5-fast", "anthropic/claude-opus-5-5", "claude-haiku-4-5", "claude-opus-4-8-m-aws", "deepseek/deepseek-v4-flash", "google/gemma-4-26b-a4b-it", "miromind/mirothinker-1-7-deepresearch", "miromind/mirothinker-1-7-deepresearch-mini", "moonshotai/kimi-k3-free"],
  },
  vertex: {
    sources: ["https://cloud.google.com/vertex-ai/generative-ai/pricing"],
    kind: "global-endpoint-reference",
    note: "Global standard online text-token quote, not native Gemini Developer API, non-global premiums, batch/flex, grounding or cache storage. Google Cloud credits and project billing are not deducted; the delivered region and invoice are unverified. Context cache storage is not a token-write charge.",
    rates: {
      "gemini-3.8-flash": { input: 0.75, output: 3.75, cached: 0.075 },
      "gemini-3.7-flash": { input: 0.75, output: 3.75, cached: 0.075 },
      "gemini-3.6-flash": { input: 0.75, output: 3.75, cached: 0.075 },
      "gemini-3.5-flash": { input: 1.5, output: 9, cached: 0.15 },
      "gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cached: 0.03 },
      "gemini-3.1-pro-preview": { input: 2, output: 12, cached: 0.2, tier: { threshold: 200000, input: 4, output: 18, cached: 0.4 } },
      "gemini-3.1-flash-lite": { input: 0.25, output: 1.5, cached: 0.025 },
      "gemini-3-flash-preview": { input: 0.5, output: 3, cached: 0.05 },
      "gemini-2.5-pro": { input: 1.25, output: 10, cached: 0.125, tier: { threshold: 200000, input: 2.5, output: 15, cached: 0.25 } },
      "gemini-2.5-flash": { input: 0.3, output: 2.5, cached: 0.03 },
      "gemini-2.5-flash-lite": { input: 0.1, output: 0.4, cached: 0.01 },
    },
  },
  "vertex-partner": {
    sources: ["https://cloud.google.com/vertex-ai/generative-ai/pricing", "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/deepseek/deepseek-v32"],
    note: "Global managed MaaS standard online quote, not native-vendor pricing or Vertex Anthropic. The public tariff and primary managed model page identify DeepSeek V3.2. Project/region entitlement and any credits or discounts remain unverified.",
    rates: {
      "deepseek-ai/deepseek-v3.2-maas": { input: 0.56, output: 1.68, cached: 0.056 },
      "qwen/qwen3-next-80b-a3b-thinking-maas": { input: 0.15, output: 1.2 },
      "qwen/qwen3-next-80b-a3b-instruct-maas": { input: 0.15, output: 1.2 },
      "zai-org/glm-5-maas": { input: 1, output: 3.2, cached: 0.1 },
    },
  },
};

// Each literal quote is complete: absence of a cache/TTL field stays unknown.
// A null quote intentionally blocks native leaf/family price substitution.
for (const [provider, review] of Object.entries(gatewayTariffReview)) {
  const table = gatewayModels[provider] ||= {};
  const prices = { ...Object.fromEntries((review.unknown || []).map(id => [id, unknownGatewayPrice])), ...review.rates };
  for (const [model, pricing] of Object.entries(prices)) {
    const previous = table[model] || {};
    const unknown = pricing === unknownGatewayPrice;
    table[model] = {
      ...previous,
      sources: [...new Set([...(previous.sources || []), ...review.sources])],
      pricing: { ...pricing },
      billing: {
        currency: "USD", unit: "per_1000000_tokens",
        kind: unknown ? review.unknownKind || "unverified-pricing" : review.kind || "metered",
        reviewedAt: "2026-10-21", authenticatedRouteVerified: false,
        invoiceVerified: false, catalogSnapshot: gatewayCatalogSnapshot,
        ...(unknown ? { unverifiedPriceFields: Object.keys(unknownGatewayPrice) } : {}),
        note: review.note,
      },
      ...(!previous.capabilities ? {
        capabilities: { ...textAdapterOnly },
        limits: { ...previous.limits, authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
      } : {}),
    };
  }
}

// Preserve the host's high-context quotes, not native-vendor tiers. The static
// calculator uses its established strict > threshold convention. Overlapping
// public min/max endpoints do not prove the charge exactly at the threshold;
// that qualification is retained separately rather than dropping known tiers.
const tokenRouterContextTiers = {
  "MiniMax-M3": { threshold: 512000, input: 0.6, output: 2.4, cached: 0.12 },
  "anthropic/claude-sonnet-4": { threshold: 200000, input: 6, output: 22.5, cached: 0.6, cache_creation: 7.5 },
  "anthropic/claude-sonnet-4.5": { threshold: 200000, input: 6, output: 22.5, cached: 0.6, cache_creation: 7.5 },
  "google/gemini-3.1-pro-preview": { threshold: 200000, input: 4, output: 18, cached: 0.4 },
  "openai/gpt-5.4": { threshold: 272000, input: 5, output: 22.5, cached: 0.5 },
  "openai/gpt-5.4-pro": { threshold: 272000, input: 60, output: 270 },
  "openai/gpt-5.5": { threshold: 272000, input: 10, output: 45, cached: 1 },
  "openai/gpt-5.5-pro": { threshold: 272000, input: 60, output: 270 },
  "openai/gpt-5.6-luna": { threshold: 272000, input: 0.4, output: 1.8, cached: 0.04, cache_creation: 0.5 },
  "openai/gpt-5.6-sol": { threshold: 272000, input: 10, output: 45, cached: 1, cache_creation: 12.5 },
  "openai/gpt-5.6-terra": { threshold: 272000, input: 4, output: 18, cached: 0.4, cache_creation: 5 },
  "openai/gpt-6-astra": { threshold: 272000, input: 20, output: 75, cached: 2, cache_creation: 25 },
  "openai/gpt-6-luna": { threshold: 272000, input: 0.2, output: 0.75, cached: 0.02, cache_creation: 0.25 },
  "openai/gpt-6-sol": { threshold: 272000, input: 4, output: 15, cached: 0.4, cache_creation: 5 },
  "openai/gpt-6.1-sol": { threshold: 272000, input: 4, output: 15, cached: 0.2, cache_creation: 5 },
  "qwen/qwen3.5-plus-02-15": { threshold: 256000, input: 0.325, output: 1.95 },
  "qwen/qwen3.7-plus": { threshold: 256000, input: 1.2, output: 4.8, cached: 0.24, cache_creation: 1.5 },
  "sakana/fugu-ultra": { threshold: 272000, input: 10, output: 45, cached: 1 },
  "x-ai/grok-4.20-beta": { threshold: 200000, input: 4, output: 12, cached: 0.4 },
  "x-ai/grok-4.3": { threshold: 200000, input: 2.5, output: 5, cached: 0.4 },
  "x-ai/grok-4.5": { threshold: 200000, input: 4, output: 12, cached: 1 },
  "x-ai/grok-4.6": { threshold: 200000, input: 4, output: 12, cached: 1 },
  "x-ai/grok-build-0.1": { threshold: 200000, input: 2, output: 4, cached: 0.4 },
  "xiaomi/mimo-v2-pro": { threshold: 256000, input: 2, output: 6, cached: 0.4 },
};
for (const [model, tier] of Object.entries(tokenRouterContextTiers)) {
  const record = gatewayModels.tokenrouter[model];
  if (!record) continue;
  record.pricing.tier = tier;
  record.billing.tierBoundaryVerified = false;
  record.billing.publishedThreshold = tier.threshold;
}
gatewayModels.tokenrouter["qwen/qwen3.7-plus"].pricing.cache_creation = 0.5;
gatewayModels.tokenrouter["openai/gpt-6.1-sol"].billing.publishedTiers = {
  input: [
    { minTokens: 272000, maxTokens: null, pricePerUnit: 4, ratio: 2 },
    { minTokens: 0, maxTokens: 272000, pricePerUnit: 2, ratio: 1 },
  ],
  output: [
    { minTokens: 272000, maxTokens: null, pricePerUnit: 15, ratio: 7.5 },
    { minTokens: 0, maxTokens: 272000, pricePerUnit: 10, ratio: 5 },
  ],
  cache_read: [
    { minTokens: 272000, maxTokens: null, pricePerUnit: 0.2, ratio: 0.1 },
    { minTokens: 0, maxTokens: 272000, pricePerUnit: 0.1, ratio: 0.05 },
  ],
  cache_write: [
    { minTokens: 272000, maxTokens: null, pricePerUnit: 5, ratio: 2.5 },
    { minTokens: 0, maxTokens: 272000, pricePerUnit: 2.5, ratio: 1.25 },
  ],
};
for (const model of ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]) {
  gatewayModels.vertex[model].billing.promotion = {
    validThrough: "2026-12-31",
    nextRates: { from: "2027-01-01", input: 1.5, output: 7.5, cached: 0.15 },
  };
}

// Exact product token/credit references are usable USD-denominated estimates,
// not marginal cash invoices. Included allowances alone do not erase a known
// token quote. Models lacking a primary quote remain explicitly unknown.
const gatewayQuotaReview = {
  github: {
    kind: "subscription-credits",
    sources: ["https://docs.github.com/en/copilot/concepts/billing/billing-for-individuals", "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing"],
    referenceUnit: "USD_AI_credit_reference_per_1000000_tokens",
    note: "Current Copilot measures tokens in GitHub AI Credits (1 credit = USD 0.01). Published exact-product quotes below are standard fixed-model token-reference estimates before included plan allowances and conditional auto-selection discounts, not marginal cash invoices. Legacy annual premium-request plans use a different unit. Account plan, allowance and entitlement are unverified; unknown model tariffs are not borrowed from native vendors.",
    models: ["gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.3-codex", "gpt-5.4", "gpt-5.4-mini", "gpt-5-mini", "claude-haiku-4.5", "claude-opus-4.7", "claude-opus-4.8", "claude-opus-5", "claude-sonnet-5", "gemini-3.6-flash", "gemini-3.7-flash", "kimi-k3", "oswe-vscode-prime", "goldeneye-free-auto"],
    references: {
      "gpt-5.6-sol": { input: 4, output: 20, cached: 0.4, cache_creation: 5, tier: { threshold: 272000, input: 8, output: 30, cached: 0.8, cache_creation: 10 } },
      "gpt-5.6-luna": { input: 0.2, output: 1.2, cached: 0.02, cache_creation: 0.25, tier: { threshold: 200000, input: 0.4, output: 1.8, cached: 0.04, cache_creation: 0.5 } },
      "gpt-5.6-terra": { input: 2, output: 12, cached: 0.2, cache_creation: 2.5, tier: { threshold: 272000, input: 4, output: 18, cached: 0.4, cache_creation: 5 } },
      "gpt-5.3-codex": { input: 1.75, output: 14, cached: 0.175 },
      "claude-haiku-4.5": { input: 1, output: 5, cached: 0.1, cache_creation: 1.25 },
      "claude-opus-4.8": { input: 5, output: 25, cached: 0.5, cache_creation: 6.25 },
      "claude-opus-5": { input: 5, output: 25, cached: 0.5, cache_creation: 6.25 },
      "claude-sonnet-5": { input: 2, output: 10, cached: 0.2, cache_creation: 2.5 },
      "kimi-k3": { input: 3, output: 15, cached: 0.3 },
    },
  },
  ollama: {
    kind: "usage-credit",
    sources: ["https://ollama.com/pricing", "https://ollama.com/api/tags"],
    referenceUnit: "USD_usage_credits_per_1000000_tokens",
    note: "Cloud PAYG token rates debit USD-denominated usage credits. Published exact-model reference rates can estimate normalized prompt/eval token usage; included Free/Pro/Max/Team credits are consumed before purchased balance, so estimates are not marginal cash invoices. Standard peak reference only; DeepSeek off-peak prices apply outside weekday 12:00-18:00 UTC. Local Ollama is a different product. Account funding, balance and entitlement are unverified.",
    models: ["gpt-oss:120b", "kimi-k3", "kimi-k2.7-code", "kimi-k2.6", "glm-5.3", "glm-5.3-flash", "glm-5.2", "minimax-m2.7", "minimax-m3", "qwen3.5", "deepseek-v4-flash", "deepseek-v4-pro", "minimax-m3.1-flash", "deepseek-v4.1-flash", "deepseek-v4.1-flash:1017"],
    references: {
      "gpt-oss:120b": { input: 0.15, output: 0.6, cached: 0.014 },
      "kimi-k3": { input: 3, output: 15, cached: 0.3 },
      "kimi-k2.7-code": { input: 0.95, output: 4, cached: 0.19 },
      "kimi-k2.6": { input: 0.95, output: 4, cached: 0.16 },
      "glm-5.3": { input: 1.4, output: 4.4, cached: 0.26 },
      "glm-5.3-flash": { input: 0.15, output: 0.5, cached: 0.03 },
      "glm-5.2": { input: 1.4, output: 4.4, cached: 0.26 },
      "minimax-m2.7": { input: 0.3, output: 1.2, cached: 0.06 },
      "minimax-m3": { input: 0.6, output: 2.4, cached: 0.12 },
      "deepseek-v4-pro": { input: 1.32, output: 3.96, cached: 0.044 },
      "minimax-m3.1-flash": { input: 0.15, output: 0.6, cached: 0.015 },
      "deepseek-v4.1-flash": { input: 0.3, output: 1.2, cached: 0.006 },
    },
  },
  clinepass: {
    kind: "subscription-reference",
    sources: ["https://docs.cline.bot/getting-started/clinepass"],
    referenceUnit: "USD_quota_reference_per_1000000_tokens",
    note: "ClinePass is USD 9.99/month and explicitly does not charge individual API prices. Exact published per-million token reference prices estimate 5-hour/weekly/monthly quota consumption, not a marginal cash invoice or PAYG bill. Unknown references remain null rather than inferred from monthly fees or vendor models. Cline usage-billing and generic /api/v1/models listings are distinct from the literal cline-pass namespace; account entitlement and remaining allowance are unverified.",
    references: {
      "cline-pass/glm-5.3": { input: 1.4, output: 4.4, cached: 0.26 },
      "cline-pass/glm-5.3-flash": { input: 0.15, output: 0.5, cached: 0.03 },
      "cline-pass/kimi-k3": { input: 3, output: 15, cached: 0.3 },
      "cline-pass/deepseek-v4-pro": { input: 1.32, output: 3.96, cached: 0.044 },
      "cline-pass/deepseek-v4.1-flash": { input: 0.3, output: 1.2, cached: 0.006 },
      "cline-pass/mimo-v2.5": { input: 0.14, output: 0.28, cached: 0.0028 },
      "cline-pass/mimo-v2.5-pro": { input: 1.74, output: 3.48, cached: 0.0145 },
      "cline-pass/minimax-m3": { input: 0.3, output: 1.2, cached: 0.06 },
      "cline-pass/muse-spark-1.3-contributor": { input: 0.1, output: 0.2, cached: 0.002 },
      "cline-pass/qwen3.8-max": { input: 2, output: 6, cached: 0.25, cache_creation: 2.5 },
      "cline-pass/qwen3.7-max": { input: 2.5, output: 7.5, cached: 0.5, cache_creation: 3.125 },
      "cline-pass/qwen3.7-plus": { input: 0.4, output: 1.6, cached: 0.04, cache_creation: 0.5, tier: { threshold: 256000, input: 1.2, output: 4.8, cached: 0.12, cache_creation: 1.5 } },
    },
  },
  "opencode-go": {
    kind: "subscription-reference",
    sources: ["https://opencode.ai/docs/go/", "https://opencode.ai/zen/go/v1/models"],
    referenceUnit: "USD_quota_reference_per_1000000_tokens",
    note: "Go USD 10/month and Go Plus USD 40/month publish model-specific USD-per-million token reference prices that can estimate 5-hour/weekly/monthly quota consumption. They are not marginal cash invoices or separate per-token API charges. Unknown references remain null; an anonymous model listing is not entitlement. Account tier, remaining allowance and client eligibility are unverified. Free model exceptions require a primary quote, not a name or models.dev zero.",
    models: ["glm-5.3-flash", "glm-5.2", "glm-5.1", "kimi-k2.7-code", "kimi-k2.6", "deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp", "mimo-v2.5", "mimo-v2.5-pro", "minimax-m3", "minimax-m2.7", "minimax-m2.5", "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus", "grok-4.7", "gpt-6-luna", "qwen3.8-max", "qwen3.8-flash", "mimo-v2.6-pro", "mimo-v2.6-flash", "longcat-2.5-preview-free", "space-bunny-free", "kimi-k3", "deepseek-v4.1-flash"],
    references: {
      "glm-5.3-flash": { input: 0.15, output: 0.5, cached: 0.03 },
      "glm-5.3": { input: 1.4, output: 4.4, cached: 0.26 },
      "glm-5.2": { input: 1.4, output: 4.4, cached: 0.26 },
      "kimi-k3": { input: 3, output: 15, cached: 0.3 },
      "kimi-k2.7-code": { input: 0.95, output: 4, cached: 0.19 },
      "mimo-v2.6-pro": { input: 0.435, output: 0.87, cached: 0.003625 },
      "mimo-v2.6-flash": { input: 0.14, output: 0.28, cached: 0.0028 },
      "mimo-v2.5-pro": { input: 0.435, output: 0.87, cached: 0.003625 },
      "mimo-v2.5": { input: 0.14, output: 0.28, cached: 0.0028 },
      "minimax-m3": { input: 0.3, output: 1.2, cached: 0.06 },
      "qwen3.8-max": { input: 2, output: 6, cached: 0.25, cache_creation: 2.5 },
      "qwen3.8-flash": { input: 0.15, output: 0.47, cached: 0.016, cache_creation: 0.2 },
      "qwen3.7-plus": { input: 0.4, output: 1.6, cached: 0.04, cache_creation: 0.5, tier: { threshold: 256000, input: 1.2, output: 4.8, cached: 0.12, cache_creation: 1.5 } },
      "deepseek-v4.1-flash": { input: 0.3, output: 1.2, cached: 0.006 },
      "deepseek-v4-pro": { input: 1.32, output: 3.96, cached: 0.044 },
      "grok-4.7": { input: 2, output: 6, cached: 0.5, tier: { threshold: 200000, input: 4, output: 12, cached: 1 } },
      "gpt-6-luna": { input: 0.1, output: 0.5, cached: 0.01, cache_creation: 0.125, tier: { threshold: 272000, input: 0.2, output: 0.75, cached: 0.02, cache_creation: 0.25 } },
    },
  },
};
for (const [provider, review] of Object.entries(gatewayQuotaReview)) {
  const table = gatewayModels[provider] ||= {};
  const ids = new Set([...(review.models || Object.keys(table)), ...Object.keys(review.references)]);
  for (const model of ids) {
    const previous = table[model] || {};
    table[model] = {
      ...previous,
      sources: [...new Set([...(previous.sources || []), ...review.sources])],
      pricing: { ...(review.references[model] || unknownGatewayPrice) },
      billing: {
        kind: review.kind, reviewedAt: "2026-10-21", invoiceVerified: false,
        currency: "USD", unit: "per_1000000_tokens", referenceUnit: review.referenceUnit,
        estimateBasis: review.references[model] ? "primary-product-token-reference" : "unknown-product-token-reference",
        ...(review.references[model] ? { referencePricing: review.references[model] } : {}),
        ...(!review.references[model] ? { unverifiedPriceFields: Object.keys(unknownGatewayPrice) } : {}),
        catalogSnapshot: gatewayCatalogSnapshot, note: review.note,
      },
      ...(!previous.capabilities ? {
        capabilities: { ...textAdapterOnly },
        limits: { ...previous.limits, authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
      } : {}),
    };
  }
}

// Exact promotions and dynamic auto prices; never infer provider-global freedom
// from a suffix, a trial allocation, or another installation's custom origin.
const gatewayFreeReview = {
  opencode: {
    sources: ["https://opencode.ai/docs/zen/", "https://opencode.ai/zen/v1/models"],
    free: ["longcat-2.5-preview-free", "mimo-v2.6-flash-free", "deepseek-v4.1-flash-free", "minimax-m3.1-flash-free"],
    unknown: ["muse-spark-1.2-contributor-free", "muse-spark-1.3-contributor-free"],
  },
  "kilo-gateway": {
    sources: ["https://api.kilo.ai/api/gateway/models"],
    free: ["kilo-auto/free", "nvidia/nemotron-3-super-120b-a12b:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "minimax/minimax-m3.1-flash:free"],
    unknown: ["kilo-auto/efficient", "kilo-auto/frontier", "kilo-auto/balanced", "kwaipilot/kat-coder-pro-v2.5:free"],
  },
  openrouter: {
    sources: ["https://openrouter.ai/api/v1/models"],
    free: ["minimax/minimax-m3.1-flash:free"],
  },
};
for (const [provider, review] of Object.entries(gatewayFreeReview)) {
  const table = gatewayModels[provider] ||= {};
  for (const model of [...review.free, ...(review.unknown || [])]) {
    const previous = table[model] || {};
    const free = review.free.includes(model);
    table[model] = {
      ...previous,
      sources: [...new Set([...(previous.sources || []), ...review.sources])],
      pricing: free ? { input: 0, output: 0, cached: 0 } : { ...unknownGatewayPrice },
      billing: {
        kind: free ? "free-promotion" : model.startsWith("kilo-auto/") ? "dynamic-route" : "unverified-pricing",
        currency: "USD", unit: "per_1000000_tokens", reviewedAt: "2026-10-21", invoiceVerified: false,
        note: free ? "Exact hosted free quote/promotion; no duration, availability or remaining allowance guarantee. No global free namespace rule is implied." : "Dynamic -1 auto tariff, or no current primary quote for this literal ID. Missing does not mean retired or free.",
      },
      ...(!previous.capabilities ? {
        capabilities: { ...textAdapterOnly },
        limits: { ...previous.limits, authenticatedRouteVerified: false, unverifiedCapabilityFields: ["contextWindow", "maxInput", "maxOutput"] },
      } : {}),
    };
  }
}

// Existing TokenRouter media rows: block untyped chat-token estimates without
// expanding adapter modalities. kling-3.0-turbo is owned by the media shard.
const tokenRouterNativeUnits = {
  "MiniMax-Hailuo-2.3": { unit: "video", rates: { "1080p:6s": 0.49, "768p:10s": 0.56, "768p:6s": 0.28 } },
  "bytedance-seed/seedream-4.5": { unit: "image", rates: { rate: 0.04 } },
  "bytedance-seed/seedream-5.0-lite": { unit: "image", rates: { rate: 0.035 } },
  "bytedance-seed/seedream-5.0-pro": { unit: "image", rates: { inputMoreThanOneImage: 0.003, outputUpTo236W: 0.045, outputAbove236W: 0.09 } },
  "happyhorse-1.0-t2v": { unit: "second", rates: { "1080p": 0.24, "720p": 0.14 } },
  "kling-v2-6": { unit: "video", rates: { pro10sAudio: 1.4, pro10sNoAudio: 0.7, pro5sAudio: 0.7, pro5sNoAudio: 0.35, std10sNoAudio: 0.42, std5sNoAudio: 0.21 } },
  "kling-v3": { unit: "second", rates: { "4k": 0.42, proAudio: 0.168, proNoAudio: 0.112, stdAudio: 0.126, stdNoAudio: 0.084 } },
  "kling-v3-omni": { unit: "second", rates: { "4k": 0.42, proAudioNoVideo: 0.14, proNoAudioNoVideo: 0.112, proNoAudioVideo: 0.168, stdAudioNoVideo: 0.112, stdNoAudioNoVideo: 0.084, stdNoAudioVideo: 0.126 } },
  "google/gemini-2.5-flash-image": { unit: "modality_specific_tokens", rates: {} },
  "google/gemini-3-pro-image-preview": { unit: "modality_specific_tokens", rates: {} },
  "google/gemini-3.1-flash-image-preview": { unit: "modality_specific_tokens", rates: {} },
  "google/gemini-3.1-flash-lite-image": { unit: "modality_specific_tokens", rates: {} },
  "microsoft/mai-image-2.5": { unit: "modality_specific_tokens", rates: {} },
  "openai/gpt-5-image": { unit: "modality_specific_tokens", rates: {} },
  "openai/gpt-5-image-mini": { unit: "modality_specific_tokens", rates: {} },
  "openai/gpt-5.4-image-2": { unit: "modality_specific_tokens", rates: {} },
  "qwen3.5-omni-plus": { unit: "modality_specific_tokens", rates: {} },
  "openai/gpt-audio": { unit: "modality_specific_tokens", rates: {} },
  "openai/gpt-audio-mini": { unit: "modality_specific_tokens", rates: {} },
};
for (const [model, quote] of Object.entries(tokenRouterNativeUnits)) {
  gatewayModels.tokenrouter[model] = {
    sources: ["https://api.tokenrouter.com/api/pricing"],
    pricing: { ...unknownGatewayPrice },
    billing: {
      kind: "native-unit", currency: "USD", unit: quote.unit, rates: quote.rates,
      tokenPricingSupported: false, invoiceVerified: false, reviewedAt: "2026-10-21",
      note: "Exact TokenRouter native-unit catalog reference. Resolution, duration, voice/video input, native modality counters and account-group qualifiers are required; generic prompt/completion totals cannot establish this charge. Full raw schedule is retained in the capture; no modality or serving support is implied.",
    },
  };
}

export default gatewayModels;
