// Hosted-route primary facts and exact models.dev comparisons reviewed 2026-10-17.
// Dependency-free literal shard; resolver integration is owned by the parent.
export default {
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
