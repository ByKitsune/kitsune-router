// Generated from a complete, hash-verified models.dev v1 observation.
// Run scripts/import-modelsdev-pricing.mjs with the recorded source evidence.
// No entitlement, currency conversion, modality billing, or invoice is inferred.
export default {
  "format": "kitsune-modelsdev-pricing-observation-v1",
  "source": {
    "url": "https://models.dev/api.json",
    "snapshotDate": "2026-10-30",
    "verifiedAtUtc": "2026-10-30T19:22:30.959Z",
    "sha256": "d8efcc4d8abe4748b0739826df309d7af8de15f3026d71cac6db8dc459f66b9c",
    "retrieval": "Reconstructed published v1 default view with official generateCatalog + filterProvidersByModelType(default), not an HTTP API response capture",
    "repositoryCommit": "971a07c53cdb688185015776b76151d514b7bde5",
    "repositoryUrl": "https://github.com/anomalyco/models.dev"
  },
  "products": {
    "openai": "openai",
    "anthropic": "anthropic",
    "gemini": "google",
    "deepseek": "deepseek",
    "xai": "xai",
    "mistral": "mistral",
    "groq": "groq",
    "cohere": "cohere",
    "openrouter": "openrouter",
    "vercel-ai-gateway": "vercel",
    "chutes": "chutes",
    "cloudflare-ai": "cloudflare-workers-ai",
    "together": "togetherai",
    "fireworks": "fireworks-ai",
    "nebius": "nebius",
    "cerebras": "cerebras",
    "siliconflow": "siliconflow",
    "xiaomi-mimo": "xiaomi",
    "venice": "venice",
    "github": "github-copilot",
    "glm": "zai-coding-plan",
    "glm-cn": "zhipuai-coding-plan",
    "nvidia": "nvidia",
    "codex": "openai",
    "gemini-cli": "google",
    "ollama": "ollama-cloud",
    "alicode-intl": "alibaba-coding-plan",
    "alicode": "alibaba-coding-plan-cn",
    "alitp-intl": "alibaba-token-plan",
    "kimi": "kimi-code-plan-cn"
  },
  "references": {
    "openai": {
      "text-embedding-ada-002": {
        "cost": {
          "input": 0.1,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "text-embedding-3-small": {
        "cost": {
          "input": 0.02,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "text-embedding-3-large": {
        "cost": {
          "input": 0.13,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "o4-mini": {
        "cost": {
          "input": 1.1,
          "output": 4.4,
          "cache_read": 0.275
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "o3": {
        "cost": {
          "input": 2,
          "output": 8,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "o3-pro": {
        "cost": {
          "input": 20,
          "output": 80
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "o3-mini": {
        "cost": {
          "input": 1.1,
          "output": 4.4,
          "cache_read": 0.55
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "o1": {
        "cost": {
          "input": 15,
          "output": 60,
          "cache_read": 7.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "o1-pro": {
        "cost": {
          "input": 150,
          "output": 600
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-realtime-2.1": {
        "cost": {
          "input": 4,
          "output": 24,
          "cache_read": 0.4,
          "input_audio": 32,
          "output_audio": 64
        },
        "input": [
          "text",
          "audio",
          "image"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "gpt-image-2": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "gpt-daybreak-red-latest": {
        "cost": {
          "input": 12.5,
          "output": 75,
          "cache_read": 1.25,
          "cache_write": 15.625
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-daybreak-blue-latest": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6.1-terra": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.05,
          "cache_write": 1.25,
          "tiers": [
            {
              "input": 2,
              "output": 7.5,
              "cache_read": 0.1,
              "cache_write": 2.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 7.5,
            "cache_read": 0.1,
            "cache_write": 2.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6.1-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.2,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.2,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6-luna": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.2,
              "output": 0.75,
              "cache_read": 0.02,
              "cache_write": 0.25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.2,
            "output": 0.75,
            "cache_read": 0.02,
            "cache_write": 0.25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6-astra": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5,
          "tiers": [
            {
              "input": 20,
              "output": 75,
              "cache_read": 2,
              "cache_write": 25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 20,
            "output": 75,
            "cache_read": 2,
            "cache_write": 25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6-terra": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6-sol": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6-luna": {
        "cost": {
          "input": 0.2,
          "output": 1.2,
          "cache_read": 0.02,
          "cache_write": 0.25,
          "tiers": [
            {
              "input": 0.4,
              "output": 1.8,
              "cache_read": 0.04,
              "cache_write": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.4,
            "output": 1.8,
            "cache_read": 0.04,
            "cache_write": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.5": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 10,
              "output": 45,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 45,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.5-pro": {
        "cost": {
          "input": 30,
          "output": 180,
          "tiers": [
            {
              "input": 60,
              "output": 270,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 60,
            "output": 270
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4": {
        "cost": {
          "input": 2.5,
          "output": 15,
          "cache_read": 0.25,
          "tiers": [
            {
              "input": 5,
              "output": 22.5,
              "cache_read": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 5,
            "output": 22.5,
            "cache_read": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4-pro": {
        "cost": {
          "input": 30,
          "output": 180,
          "tiers": [
            {
              "input": 60,
              "output": 270,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 60,
            "output": 270
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4-nano": {
        "cost": {
          "input": 0.2,
          "output": 1.25,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4-mini": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.3-codex": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.3-codex-spark": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.2": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.2-pro": {
        "cost": {
          "input": 21,
          "output": 168
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.1": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5-pro": {
        "cost": {
          "input": 15,
          "output": 120
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5-nano": {
        "cost": {
          "input": 0.05,
          "output": 0.4,
          "cache_read": 0.005
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5-mini": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "cache_read": 0.025
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4o": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4o-mini": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4o-2024-11-20": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4o-2024-08-06": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4o-2024-05-13": {
        "cost": {
          "input": 5,
          "output": 15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4": {
        "cost": {
          "input": 30,
          "output": 60
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4.1": {
        "cost": {
          "input": 2,
          "output": 8,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4.1-nano": {
        "cost": {
          "input": 0.1,
          "output": 0.4,
          "cache_read": 0.025
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4.1-mini": {
        "cost": {
          "input": 0.4,
          "output": 1.6,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4-turbo": {
        "cost": {
          "input": 10,
          "output": 30
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-3.5-turbo": {
        "cost": {
          "input": 0.5,
          "output": 1.5,
          "cache_read": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "anthropic": {
      "claude-sonnet-5": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-sonnet-5-5": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-sonnet-4-6": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3,
          "cache_write": 3.75
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-sonnet-4-5": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3,
          "cache_write": 3.75
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-sonnet-4-5-20250929": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3,
          "cache_write": 3.75
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-5": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-5-5": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.2,
          "cache_write": 5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4-8": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4-7": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4-6": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4-5": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4-5-20251101": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-haiku-5-5": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.5,
              "output": 2.5,
              "cache_read": 0.05,
              "cache_write": 0.625,
              "tier": {
                "type": "context",
                "size": 100000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-haiku-4-5": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.1,
          "cache_write": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-haiku-4-5-20251001": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.1,
          "cache_write": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-fable-5": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-fable-5-1": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 0.25,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      }
    },
    "gemini": {
      "lyria-3-pro-preview": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "lyria-3-clip-preview": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "gemini-pro-latest": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-omni-flash-preview": {
        "cost": {
          "input": 1.5,
          "output": 17.5
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "video"
        ]
      },
      "gemini-flash-lite-latest": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-flash-latest": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-embedding-2": {
        "cost": {
          "input": 0.2,
          "output": 0,
          "input_audio": 6.5
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-embedding-001": {
        "cost": {
          "input": 0.15,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-4-argon": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "input_audio": 2
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.8-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.7-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.6-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.5-live-translate-preview": {
        "cost": {
          "input": 3.5,
          "output": 21,
          "input_audio": 3.5,
          "output_audio": 21
        },
        "input": [
          "audio"
        ],
        "output": [
          "audio",
          "text"
        ]
      },
      "gemini-3.5-flash": {
        "cost": {
          "input": 1.5,
          "output": 9,
          "cache_read": 0.15,
          "input_audio": 1.5
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.5-flash-lite": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.1-pro-preview": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.1-pro-preview-customtools": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.1-flash-tts-preview": {
        "cost": {
          "input": 1,
          "output": 20
        },
        "input": [
          "text"
        ],
        "output": [
          "audio"
        ]
      },
      "gemini-3.1-flash-live-preview": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "input_audio": 3,
          "output_audio": 12
        },
        "input": [
          "text",
          "image",
          "video",
          "audio"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "gemini-3.1-flash-lite": {
        "cost": {
          "input": 0.25,
          "output": 1.5,
          "cache_read": 0.025,
          "input_audio": 0.5
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.1-flash-lite-preview": {
        "cost": {
          "input": 0.25,
          "output": 1.5,
          "cache_read": 0.025,
          "input_audio": 0.5
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.1-flash-lite-image": {
        "cost": {
          "input": 0.25,
          "output": 30
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "gemini-3.1-flash-image": {
        "cost": {
          "input": 0.5,
          "output": 60
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "gemini-3-pro-image": {
        "cost": {
          "input": 2,
          "output": 120
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "gemini-3-flash-preview": {
        "cost": {
          "input": 0.5,
          "output": 3,
          "cache_read": 0.05,
          "input_audio": 1
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-2.5-pro": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125,
          "tiers": [
            {
              "input": 2.5,
              "output": 15,
              "cache_read": 0.25,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 15,
            "cache_read": 0.25
          }
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-2.5-pro-preview-tts": {
        "cost": {
          "input": 1,
          "output": 20
        },
        "input": [
          "text"
        ],
        "output": [
          "audio"
        ]
      },
      "gemini-2.5-flash": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "cache_read": 0.03,
          "input_audio": 1
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-2.5-flash-preview-tts": {
        "cost": {
          "input": 0.5,
          "output": 10
        },
        "input": [
          "text"
        ],
        "output": [
          "audio"
        ]
      },
      "gemini-2.5-flash-lite": {
        "cost": {
          "input": 0.1,
          "output": 0.4,
          "cache_read": 0.01,
          "input_audio": 0.3
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-2.5-flash-image": {
        "cost": {
          "input": 0.3,
          "output": 30,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "gemini-2.5-computer-use-preview-10-2025": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "tiers": [
            {
              "input": 2.5,
              "output": 15,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 15
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deep-research-preview-04-2026": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "deep-research-max-preview-04-2026": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text",
          "image"
        ]
      }
    },
    "deepseek": {
      "deepseek-v4-pro": {
        "cost": {
          "input": 0.66,
          "output": 1.98,
          "reasoning": 1.98,
          "cache_read": 0.022
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "reasoning": 0.6,
          "cache_read": 0.003
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-flash-vision-exp": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "reasoning": 0.6,
          "cache_read": 0.003
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "reasoning": 0.6,
          "cache_read": 0.003
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      }
    },
    "xai": {
      "grok-build-0.1": {
        "cost": {
          "input": 1,
          "output": 2,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2,
              "output": 4,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 4,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4.7": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4.6": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4.5": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.3,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 0.6,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 0.6
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4.3": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4.20-multi-agent-0309": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4.20-0309-reasoning": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4.20-0309-non-reasoning": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      }
    },
    "mistral": {
      "zai-glm-5-3": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.14
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-glm-5-3-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "zai-glm-5-2": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.14
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "voxtral-small-latest": {
        "cost": {
          "input": 0.1,
          "output": 0.4
        },
        "input": [
          "text",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "voxtral-small-2507": {
        "cost": {
          "input": 0.1,
          "output": 0.4
        },
        "input": [
          "text",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "pixtral-12b": {
        "cost": {
          "input": 0.15,
          "output": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "open-mistral-nemo": {
        "cost": {
          "input": 0.15,
          "output": 0.15
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-small-latest": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-small-2603": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-small-2506": {
        "cost": {
          "input": 0.1,
          "output": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-medium-latest": {
        "cost": {
          "input": 1.5,
          "output": 7.5,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-medium-2604": {
        "cost": {
          "input": 1.5,
          "output": 7.5,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-medium-2508": {
        "cost": {
          "input": 0.4,
          "output": 2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-medium-2505": {
        "cost": {
          "input": 0.4,
          "output": 2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-large-latest": {
        "cost": {
          "input": 0.5,
          "output": 1.5,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-large-4": {
        "cost": {
          "input": 0.7,
          "output": 2.1,
          "cache_read": 0.07
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-large-4-0-8": {
        "cost": {
          "input": 0.7,
          "output": 2.1,
          "cache_read": 0.07
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-large-2512": {
        "cost": {
          "input": 0.5,
          "output": 1.5,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-embed": {
        "cost": {
          "input": 0.1,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "ministral-8b-latest": {
        "cost": {
          "input": 0.15,
          "output": 0.15,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "ministral-8b-2512": {
        "cost": {
          "input": 0.15,
          "output": 0.15,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "ministral-3b-latest": {
        "cost": {
          "input": 0.1,
          "output": 0.1,
          "cache_read": 0.01
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "ministral-3b-2512": {
        "cost": {
          "input": 0.1,
          "output": 0.1,
          "cache_read": 0.01
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "ministral-14b-2512": {
        "cost": {
          "input": 0.2,
          "output": 0.2,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "magistral-medium-latest": {
        "cost": {
          "input": 2,
          "output": 5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "labs-leanstral-1-5-1": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "labs-devstral-small-2512": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5-2": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.14
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "devstral-medium-latest": {
        "cost": {
          "input": 0.4,
          "output": 2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "devstral-latest": {
        "cost": {
          "input": 0.4,
          "output": 2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "devstral-2512": {
        "cost": {
          "input": 0.4,
          "output": 2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-1-flash-1017": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.007
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "codestral-latest": {
        "cost": {
          "input": 0.3,
          "output": 0.9,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "codestral-2508": {
        "cost": {
          "input": 0.3,
          "output": 0.9,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      }
    },
    "groq": {
      "llama-3.3-70b-versatile": {
        "cost": {
          "input": 0.59,
          "output": 0.79
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "llama-3.1-8b-instant": {
        "cost": {
          "input": 0.05,
          "output": 0.08
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "allam-2-7b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/llama-prompt-guard-2-86m": {
        "cost": {
          "input": 0.04,
          "output": 0.04
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/llama-prompt-guard-2-22m": {
        "cost": {
          "input": 0.03,
          "output": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-safeguard-20b": {
        "cost": {
          "input": 0.075,
          "output": 0.3,
          "cache_read": 0.0375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-20b": {
        "cost": {
          "input": 0.075,
          "output": 0.3,
          "cache_read": 0.0375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-120b": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.075
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.8-27b": {
        "cost": {
          "input": 0.8,
          "output": 4
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.6-27b": {
        "cost": {
          "input": 0.6,
          "output": 3,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      }
    },
    "cohere": {
      "north-small-translate-09-2026": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "north-mini-code-1-0": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "command-r7b-arabic-02-2025": {
        "cost": {
          "input": 0.0375,
          "output": 0.15
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "command-r7b-12-2024": {
        "cost": {
          "input": 0.0375,
          "output": 0.15
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "command-r-plus-08-2024": {
        "cost": {
          "input": 2.5,
          "output": 10
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "command-r-08-2024": {
        "cost": {
          "input": 0.15,
          "output": 0.6
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "command-a-vision-07-2025": {
        "cost": {
          "input": 2.5,
          "output": 10
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "command-a-translate-08-2025": {
        "cost": {
          "input": 2.5,
          "output": 10
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "command-a-reasoning-08-2025": {
        "cost": {
          "input": 2.5,
          "output": 10
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "command-a-plus-05-2026": {
        "cost": {
          "input": 2.5,
          "output": 10
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "command-a-03-2025": {
        "cost": {
          "input": 2.5,
          "output": 10
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "c4ai-aya-expanse-32b": {
        "cost": {
          "input": 0.5,
          "output": 1.5
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "openrouter": {
      "aion-labs/aion-rp-llama-3.1-8b": {
        "cost": {
          "input": 0.8,
          "output": 1.6
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "aion-labs/aion-3.5": {
        "cost": {
          "input": 3,
          "output": 6,
          "cache_read": 0.75
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "aion-labs/aion-3.5-mini": {
        "cost": {
          "input": 0.7,
          "output": 1.4,
          "cache_read": 0.18
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "aion-labs/aion-3.0": {
        "cost": {
          "input": 3,
          "output": 6,
          "cache_read": 0.75
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "aion-labs/aion-3.0-mini": {
        "cost": {
          "input": 0.7,
          "output": 1.4,
          "cache_read": 0.18
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "aion-labs/aion-2.0": {
        "cost": {
          "input": 0.8,
          "output": 1.6,
          "cache_read": 0.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "amazon/nova-pro-v1": {
        "cost": {
          "input": 0.8,
          "output": 3.2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "amazon/nova-premier-v1": {
        "cost": {
          "input": 2.5,
          "output": 12.5,
          "cache_read": 0.625
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "amazon/nova-micro-v1": {
        "cost": {
          "input": 0.035,
          "output": 0.14
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "amazon/nova-lite-v1": {
        "cost": {
          "input": 0.06,
          "output": 0.24
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "amazon/nova-2-lite-v1": {
        "cost": {
          "input": 0.3,
          "output": 2.5
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthracite-org/magnum-v4-72b": {
        "cost": {
          "input": 2.5,
          "output": 5
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-sonnet-5": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-sonnet-5.5": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-sonnet-4.6": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3,
          "cache_write": 3.75,
          "tiers": [
            {
              "input": 6,
              "output": 22.5,
              "cache_read": 0.6,
              "cache_write": 7.5,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 6,
            "output": 22.5,
            "cache_read": 0.6,
            "cache_write": 7.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-sonnet-4.5": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3,
          "cache_write": 3.75,
          "tiers": [
            {
              "input": 6,
              "output": 22.5,
              "cache_read": 0.6,
              "cache_write": 7.5,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 6,
            "output": 22.5,
            "cache_read": 0.6,
            "cache_write": 7.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-5": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-5.5": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.2,
          "cache_write": 5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-4.8": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-4.7": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25,
          "tiers": [
            {
              "input": 10,
              "output": 37.5,
              "cache_read": 1,
              "cache_write": 12.5,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 37.5,
            "cache_read": 1,
            "cache_write": 12.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-4.6": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25,
          "tiers": [
            {
              "input": 10,
              "output": 37.5,
              "cache_read": 1,
              "cache_write": 12.5,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 37.5,
            "cache_read": 1,
            "cache_write": 12.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-4.5": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-4.1": {
        "cost": {
          "input": 15,
          "output": 75,
          "cache_read": 1.5,
          "cache_write": 18.75
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-haiku-5.5": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.5,
              "output": 2.5,
              "cache_read": 0.05,
              "cache_write": 0.625,
              "tier": {
                "type": "context",
                "size": 100000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-haiku-4.5": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.1,
          "cache_write": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-fable-5": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-fable-5.1": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 0.25,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "bytedance-seed/seed-2.0-mini": {
        "cost": {
          "input": 0.1,
          "output": 0.4,
          "tiers": [
            {
              "input": 0.2,
              "output": 0.8,
              "tier": {
                "type": "context",
                "size": 128000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "bytedance-seed/seed-2.0-lite": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "tiers": [
            {
              "input": 0.5,
              "output": 4,
              "tier": {
                "type": "context",
                "size": 128000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "bytedance-seed/seed-2.0-code": {
        "cost": {
          "input": 0.5,
          "output": 3,
          "tiers": [
            {
              "input": 1,
              "output": 6,
              "tier": {
                "type": "context",
                "size": 128000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "bytedance-seed/seed-2-1-turbo": {
        "cost": {
          "input": 0.5,
          "output": 2.5
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "bytedance-seed/seed-1.6": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "tiers": [
            {
              "input": 0.5,
              "output": 4,
              "tier": {
                "type": "context",
                "size": 128000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "bytedance-seed/seed-1.6-flash": {
        "cost": {
          "input": 0.075,
          "output": 0.3,
          "tiers": [
            {
              "input": 0.1,
              "output": 0.8,
              "tier": {
                "type": "context",
                "size": 128000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "bytedance/ui-tars-1.5-7b": {
        "cost": {
          "input": 0.1,
          "output": 0.2,
          "cache_read": 0.1
        },
        "input": [
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "cognitivecomputations/dolphin-mistral-24b-venice-edition": {
        "cost": {
          "input": 0.2,
          "output": 0.9
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "cohere/north-mini-code:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "cohere/command-r7b-12-2024": {
        "cost": {
          "input": 0.0375,
          "output": 0.15
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "cohere/command-r-plus-08-2024": {
        "cost": {
          "input": 2.5,
          "output": 10
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "cohere/command-r-08-2024": {
        "cost": {
          "input": 0.15,
          "output": 0.6
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "cohere/command-a": {
        "cost": {
          "input": 2.5,
          "output": 10
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "cohere/command-a-plus": {
        "cost": {
          "input": 0.3,
          "output": 1.5,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4.1-flash": {
        "cost": {
          "input": 0.045,
          "output": 0.5,
          "cache_read": 0.006
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4.1-flash-1017": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.003
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4-pro": {
        "cost": {
          "input": 0.9483,
          "output": 1.8966,
          "cache_read": 0.079025
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4-pro-0813": {
        "cost": {
          "input": 0.66,
          "output": 1.98,
          "cache_read": 0.022
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4-flash": {
        "cost": {
          "input": 0.091,
          "output": 0.182,
          "cache_read": 0.0182
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4-flash-vision-exp": {
        "cost": {
          "input": 0.2156,
          "output": 0.6468,
          "cache_read": 0.00686
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4-flash-0731": {
        "cost": {
          "input": 0.119,
          "output": 0.238,
          "cache_read": 0.0238
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v3.2": {
        "cost": {
          "input": 0.26,
          "output": 0.38,
          "cache_read": 0.13
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v3.2-exp": {
        "cost": {
          "input": 0.27,
          "output": 0.41
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v3.1-terminus": {
        "cost": {
          "input": 0.27,
          "output": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-r1-0528": {
        "cost": {
          "input": 0.5,
          "output": 2.15,
          "cache_read": 0.35
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-chat": {
        "cost": {
          "input": 0.2574,
          "output": 1.0287
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-chat-v3.1": {
        "cost": {
          "input": 0.25,
          "output": 0.95,
          "cache_read": 0.13
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-chat-v3-0324": {
        "cost": {
          "input": 0.29,
          "output": 1.14,
          "cache_read": 0.11
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "dots-studio/dots-3-note-preview:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "elorian/glimpse": {
        "cost": {
          "input": 0.6,
          "output": 3,
          "cache_read": 0.06
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "fireworks/ember-1": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/lyria-3-pro-preview": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "google/lyria-3-clip-preview": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "google/gemma-4-31b-it:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "image",
          "text",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-4-31b-it": {
        "cost": {
          "input": 0.2,
          "output": 0.4
        },
        "input": [
          "image",
          "text",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-4-26b-a4b-it:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "image",
          "text",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-4-26b-a4b-it": {
        "cost": {
          "input": 0.09,
          "output": 0.3,
          "cache_read": 0.05
        },
        "input": [
          "image",
          "text",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-3-4b-it": {
        "cost": {
          "input": 0.05,
          "output": 0.1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-3-27b-it": {
        "cost": {
          "input": 0.08,
          "output": 0.35,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-3-12b-it": {
        "cost": {
          "input": 0.05,
          "output": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-2-27b-it": {
        "cost": {
          "input": 0.65,
          "output": 0.65
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-nano-banana-2.1": {
        "cost": {
          "input": 1.5,
          "output": 7.5
        },
        "input": [
          "image",
          "text"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-4-argon": {
        "cost": {
          "input": 2,
          "output": 10,
          "reasoning": 10,
          "cache_read": 0.1,
          "cache_write": 0.1875,
          "input_audio": 2
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.8-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "reasoning": 3.75,
          "cache_read": 0.075,
          "cache_write": 0.041667,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.7-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "reasoning": 3.75,
          "cache_read": 0.075,
          "cache_write": 0.041667,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.6-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "reasoning": 3.75,
          "cache_read": 0.075,
          "cache_write": 0.041667,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.5-flash": {
        "cost": {
          "input": 1.5,
          "output": 9,
          "reasoning": 9,
          "cache_read": 0.15,
          "cache_write": 0.083333,
          "input_audio": 3
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.5-flash-lite": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "reasoning": 2.5,
          "cache_read": 0.03,
          "cache_write": 0.083333,
          "input_audio": 0.3
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.1-pro-preview": {
        "cost": {
          "input": 2,
          "output": 12,
          "reasoning": 12,
          "cache_read": 0.2,
          "cache_write": 0.375,
          "input_audio": 2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.1-pro-preview-customtools": {
        "cost": {
          "input": 2,
          "output": 12,
          "reasoning": 12,
          "cache_read": 0.2,
          "cache_write": 0.375,
          "input_audio": 2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.1-flash-lite": {
        "cost": {
          "input": 0.25,
          "output": 1.5,
          "reasoning": 1.5,
          "cache_read": 0.025,
          "cache_write": 0.083333,
          "input_audio": 0.5
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.1-flash-lite-preview": {
        "cost": {
          "input": 0.25,
          "output": 1.5,
          "reasoning": 1.5,
          "cache_read": 0.025,
          "cache_write": 0.083333,
          "input_audio": 0.5
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.1-flash-lite-image": {
        "cost": {
          "input": 0.25,
          "output": 1.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-3.1-flash-image": {
        "cost": {
          "input": 0.5,
          "output": 3
        },
        "input": [
          "image",
          "text"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-3.1-flash-image-preview": {
        "cost": {
          "input": 0.5,
          "output": 3
        },
        "input": [
          "image",
          "text"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-3-pro-image": {
        "cost": {
          "input": 2,
          "output": 12,
          "reasoning": 12,
          "cache_read": 0.2,
          "cache_write": 0.375,
          "input_audio": 2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-3-pro-image-preview": {
        "cost": {
          "input": 2,
          "output": 12,
          "reasoning": 12,
          "cache_read": 0.2,
          "cache_write": 0.375,
          "input_audio": 2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-3-flash-preview": {
        "cost": {
          "input": 0.5,
          "output": 3,
          "reasoning": 3,
          "cache_read": 0.05,
          "cache_write": 0.083333,
          "input_audio": 1
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-2.5-pro": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "reasoning": 10,
          "cache_read": 0.125,
          "cache_write": 0.375,
          "input_audio": 1.25,
          "tiers": [
            {
              "input": 2.5,
              "output": 15,
              "cache_read": 0.25,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 15,
            "cache_read": 0.25
          }
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-2.5-pro-preview": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "reasoning": 10,
          "cache_read": 0.125,
          "cache_write": 0.375,
          "input_audio": 1.25,
          "tiers": [
            {
              "input": 2.5,
              "output": 15,
              "cache_read": 0.25,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 15,
            "cache_read": 0.25
          }
        },
        "input": [
          "pdf",
          "image",
          "text",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-2.5-flash": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "reasoning": 2.5,
          "cache_read": 0.03,
          "cache_write": 0.083333,
          "input_audio": 1
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-2.5-flash-lite": {
        "cost": {
          "input": 0.1,
          "output": 0.4,
          "reasoning": 0.4,
          "cache_read": 0.01,
          "cache_write": 0.083333,
          "input_audio": 0.3
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-2.5-flash-image": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "cache_read": 0.03,
          "cache_write": 0.083333,
          "input_audio": 1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "gryphe/mythomax-l2-13b": {
        "cost": {
          "input": 0.08,
          "output": 0.11
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "ibm-granite/granite-4.2-8b": {
        "cost": {
          "input": 0.06,
          "output": 0.15,
          "cache_read": 0.015
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inception/mercury-3": {
        "cost": {
          "input": 0.1,
          "output": 0.35,
          "cache_read": 0.01
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inception/mercury-2": {
        "cost": {
          "input": 0.25,
          "output": 0.75,
          "cache_read": 0.025
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inception/mercury-2.5": {
        "cost": {
          "input": 0.04,
          "output": 0.15,
          "cache_read": 0.004
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inclusionai/ling-3.1-flash": {
        "cost": {
          "input": 0.075,
          "output": 0.225,
          "cache_read": 0.015
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inclusionai/ling-3.0-flash": {
        "cost": {
          "input": 0.021,
          "output": 0.063,
          "cache_read": 0.0042
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inclusionai/ling-3.0-flash-vl": {
        "cost": {
          "input": 0.06,
          "output": 0.18,
          "cache_read": 0.012
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "inference-net/schematron-v2-turbo": {
        "cost": {
          "input": 0.03,
          "output": 0.15,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inference-net/schematron-v2-small": {
        "cost": {
          "input": 0.05,
          "output": 0.23,
          "cache_read": 0.05
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "liquid/lfm-2.5-24b-a2b": {
        "cost": {
          "input": 0.05,
          "output": 0.7,
          "cache_read": 0.025
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "liquid/lfm-2.5-2.6b:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "liquid/lfm-2.5-2.6b": {
        "cost": {
          "input": 0.35,
          "output": 0.5,
          "cache_read": 0.04
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mancer/weaver": {
        "cost": {
          "input": 0.4,
          "output": 0.75
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meituan/longcat-2.0": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.006
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/llama-guard-4-12b": {
        "cost": {
          "input": 0.18,
          "output": 0.18
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/llama-4-scout": {
        "cost": {
          "input": 0.1,
          "output": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/llama-4-maverick": {
        "cost": {
          "input": 0.1875,
          "output": 0.6525,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/llama-3.3-70b-instruct": {
        "cost": {
          "input": 0.1,
          "output": 0.32
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/llama-3.2-3b-instruct": {
        "cost": {
          "input": 0.05,
          "output": 0.33
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/llama-3.2-1b-instruct": {
        "cost": {
          "input": 0.027,
          "output": 0.201
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/llama-3.1-8b-instruct": {
        "cost": {
          "input": 0.05,
          "output": 0.08,
          "cache_read": 0.025
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/llama-3.1-70b-instruct": {
        "cost": {
          "input": 0.4,
          "output": 0.4
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-wonder": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.2
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-open": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-1.3": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-1.3-contributor": {
        "cost": {
          "input": 0.1,
          "output": 0.2,
          "cache_read": 0.002
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-1.2": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-1.2-contributor": {
        "cost": {
          "input": 0.1,
          "output": 0.2,
          "cache_read": 0.002
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-1.1": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "pdf",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-glimmer-30b": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "microsoft/phi-4": {
        "cost": {
          "input": 0.07,
          "output": 0.14
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m3": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m3.1-flash": {
        "cost": {
          "input": 0.075,
          "output": 0.3,
          "cache_read": 0.0075
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2": {
        "cost": {
          "input": 0.255,
          "output": 1.02
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2.7": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2.5": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2.1": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2-her": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m1": {
        "cost": {
          "input": 0.55,
          "output": 2.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-01": {
        "cost": {
          "input": 0.2,
          "output": 1.1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/voxtral-small-24b-2507": {
        "cost": {
          "input": 0.1,
          "output": 0.3,
          "cache_read": 0.01
        },
        "input": [
          "text",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mixtral-8x22b-instruct": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.2
        },
        "input": [
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-small-3.2-24b-instruct": {
        "cost": {
          "input": 0.075,
          "output": 0.2
        },
        "input": [
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-small-3.1-24b-instruct": {
        "cost": {
          "input": 0.351,
          "output": 0.555
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-small-2603": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-small-24b-instruct-2501": {
        "cost": {
          "input": 0.05,
          "output": 0.08
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-saba": {
        "cost": {
          "input": 0.2,
          "output": 0.6,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-nemo": {
        "cost": {
          "input": 0.029,
          "output": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-medium-3": {
        "cost": {
          "input": 0.4,
          "output": 2,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-medium-3.1": {
        "cost": {
          "input": 0.4,
          "output": 2,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-medium-3-5": {
        "cost": {
          "input": 1.5,
          "output": 7.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-large": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.2
        },
        "input": [
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-large-4-0": {
        "cost": {
          "input": 0.7,
          "output": 2.1,
          "cache_read": 0.07
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-large-2512": {
        "cost": {
          "input": 0.5,
          "output": 1.5,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-large-2407": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.2
        },
        "input": [
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/ministral-8b-2512": {
        "cost": {
          "input": 0.15,
          "output": 0.15,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/ministral-3b-2512": {
        "cost": {
          "input": 0.1,
          "output": 0.1,
          "cache_read": 0.01
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/ministral-14b-2512": {
        "cost": {
          "input": 0.2,
          "output": 0.2,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/devstral-2512": {
        "cost": {
          "input": 0.4,
          "output": 2,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/codestral-2508": {
        "cost": {
          "input": 0.3,
          "output": 0.9,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "moondream/moondream3.1-9b-a2b": {
        "cost": {
          "input": 0.3,
          "output": 2.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moondream/moondream3-preview": {
        "cost": {
          "input": 0.3,
          "output": 2.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k3": {
        "cost": {
          "input": 0.192,
          "output": 15,
          "cache_read": 0.182
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k3.1-pro": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2": {
        "cost": {
          "input": 0.57,
          "output": 2.3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2.7-code": {
        "cost": {
          "input": 0.6,
          "output": 3.5,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2.6": {
        "cost": {
          "input": 0.65,
          "output": 3.41,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2.5": {
        "cost": {
          "input": 0.5,
          "output": 2.5,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2-thinking": {
        "cost": {
          "input": 0.6,
          "output": 2.5,
          "cache_read": 0.15
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2-0905": {
        "cost": {
          "input": 0.6,
          "output": 2.5
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "morph/morph-v3-large": {
        "cost": {
          "input": 0.9,
          "output": 1.9
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "morph/morph-v3-fast": {
        "cost": {
          "input": 0.8,
          "output": 1.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nex-agi/nex-n2.5-pro": {
        "cost": {
          "input": 0.075,
          "output": 0.25,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nex-agi/nex-n2.5-mini": {
        "cost": {
          "input": 0.025,
          "output": 0.1,
          "cache_read": 0.0025
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nousresearch/hermes-4-405b": {
        "cost": {
          "input": 1,
          "output": 3,
          "cache_read": 0.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nousresearch/hermes-3-llama-3.1-70b": {
        "cost": {
          "input": 0.7,
          "output": 0.7
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nousresearch/hermes-3-llama-3.1-405b": {
        "cost": {
          "input": 1,
          "output": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-super-vl:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-super-vl": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-lightning:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-lightning": {
        "cost": {
          "input": 0.07,
          "output": 0.2,
          "cache_read": 0.04
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-content-safety:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-content-safety": {
        "cost": {
          "input": 0.2,
          "output": 0.2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-ultra-550b-a55b:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-ultra-550b-a55b": {
        "cost": {
          "input": 0.6,
          "output": 2.4,
          "cache_read": 0.12
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-super-120b-a12b": {
        "cost": {
          "input": 0.3,
          "output": 2.4,
          "cache_read": 0.15
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-nano-30b-a3b": {
        "cost": {
          "input": 0.06,
          "output": 0.24,
          "cache_read": 0.012
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/o3": {
        "cost": {
          "input": 2,
          "output": 8,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/o3-pro": {
        "cost": {
          "input": 20,
          "output": 80
        },
        "input": [
          "text",
          "pdf",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-safeguard-20b": {
        "cost": {
          "input": 0.075,
          "output": 0.3,
          "cache_read": 0.0375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-20b": {
        "cost": {
          "input": 0.018,
          "output": 0.09,
          "cache_read": 0.009
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-120b": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.075
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-chat-latest": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-audio": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "input_audio": 32,
          "output_audio": 64
        },
        "input": [
          "text",
          "audio"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "openai/gpt-audio-mini": {
        "cost": {
          "input": 0.6,
          "output": 2.4,
          "input_audio": 0.6,
          "output_audio": 2.4
        },
        "input": [
          "text",
          "audio"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "openai/gpt-6.1-terra": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.05,
          "cache_write": 1.25,
          "tiers": [
            {
              "input": 2,
              "output": 7.5,
              "cache_read": 0.1,
              "cache_write": 2.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 7.5,
            "cache_read": 0.1,
            "cache_write": 2.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6.1-terra-pro": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.05,
          "cache_write": 1.25,
          "tiers": [
            {
              "input": 2,
              "output": 7.5,
              "cache_read": 0.1,
              "cache_write": 2.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 7.5,
            "cache_read": 0.1,
            "cache_write": 2.5
          }
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6.1-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.2,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.2,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6.1-sol-pro": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.2,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.2,
            "cache_write": 5
          }
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-sol-pro": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-luna": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.2,
              "output": 0.75,
              "cache_read": 0.02,
              "cache_write": 0.25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.2,
            "output": 0.75,
            "cache_read": 0.02,
            "cache_write": 0.25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-luna-pro": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.2,
              "output": 0.75,
              "cache_read": 0.02,
              "cache_write": 0.25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.2,
            "output": 0.75,
            "cache_read": 0.02,
            "cache_write": 0.25
          }
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-astra": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5,
          "tiers": [
            {
              "input": 20,
              "output": 75,
              "cache_read": 2,
              "cache_write": 25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 20,
            "output": 75,
            "cache_read": 2,
            "cache_write": 25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-astra-pro": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5,
          "tiers": [
            {
              "input": 20,
              "output": 75,
              "cache_read": 2,
              "cache_write": 25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 20,
            "output": 75,
            "cache_read": 2,
            "cache_write": 25
          }
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-terra": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-terra-pro": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-sol": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-sol-pro": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-luna": {
        "cost": {
          "input": 0.2,
          "output": 1.2,
          "cache_read": 0.02,
          "cache_write": 0.25,
          "tiers": [
            {
              "input": 0.4,
              "output": 1.8,
              "cache_read": 0.04,
              "cache_write": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.4,
            "output": 1.8,
            "cache_read": 0.04,
            "cache_write": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-luna-pro": {
        "cost": {
          "input": 0.2,
          "output": 1.2,
          "cache_read": 0.02,
          "cache_write": 0.25,
          "tiers": [
            {
              "input": 0.4,
              "output": 1.8,
              "cache_read": 0.04,
              "cache_write": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.4,
            "output": 1.8,
            "cache_read": 0.04,
            "cache_write": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.5": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 10,
              "output": 45,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 45,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.5-pro": {
        "cost": {
          "input": 30,
          "output": 180,
          "tiers": [
            {
              "input": 60,
              "output": 270,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 60,
            "output": 270
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4": {
        "cost": {
          "input": 2.5,
          "output": 15,
          "cache_read": 0.25,
          "tiers": [
            {
              "input": 5,
              "output": 22.5,
              "cache_read": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 5,
            "output": 22.5,
            "cache_read": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4-pro": {
        "cost": {
          "input": 30,
          "output": 180,
          "tiers": [
            {
              "input": 60,
              "output": 270,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 60,
            "output": 270
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4-nano": {
        "cost": {
          "input": 0.2,
          "output": 1.25,
          "cache_read": 0.02
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4-mini": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "cache_read": 0.075
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4-image-2": {
        "cost": {
          "input": 8,
          "output": 15,
          "cache_read": 2
        },
        "input": [
          "image",
          "text",
          "pdf"
        ],
        "output": [
          "image",
          "text"
        ]
      },
      "openai/gpt-5.3-codex": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.2": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.2-pro": {
        "cost": {
          "input": 21,
          "output": 168
        },
        "input": [
          "image",
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.2-codex": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.1": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125
        },
        "input": [
          "image",
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.1-codex": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.13
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.1-codex-mini": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.1-codex-max": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5-pro": {
        "cost": {
          "input": 15,
          "output": 120
        },
        "input": [
          "image",
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5-nano": {
        "cost": {
          "input": 0.05,
          "output": 0.4,
          "cache_read": 0.005
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5-mini": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "cache_read": 0.025
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5-image": {
        "cost": {
          "input": 10,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "image",
          "text",
          "pdf"
        ],
        "output": [
          "image",
          "text"
        ]
      },
      "openai/gpt-5-image-mini": {
        "cost": {
          "input": 2.5,
          "output": 2,
          "cache_read": 0.25
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "image",
          "text"
        ]
      },
      "openai/gpt-4o": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o-mini": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o-mini-2024-07-18": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o-2024-11-20": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o-2024-08-06": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o-2024-05-13": {
        "cost": {
          "input": 5,
          "output": 15
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4": {
        "cost": {
          "input": 30,
          "output": 60
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4.1": {
        "cost": {
          "input": 2,
          "output": 8,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4.1-nano": {
        "cost": {
          "input": 0.1,
          "output": 0.4,
          "cache_read": 0.03
        },
        "input": [
          "image",
          "text",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4.1-mini": {
        "cost": {
          "input": 0.4,
          "output": 1.6,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-3.5-turbo-16k": {
        "cost": {
          "input": 3,
          "output": 4
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-3.5-turbo-0613": {
        "cost": {
          "input": 1,
          "output": 2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openrouter/free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "particle-ai/particle-1": {
        "cost": {
          "input": 0.05,
          "output": 0.5,
          "cache_read": 0.003
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "perceptron/perceptron-mk1": {
        "cost": {
          "input": 0.15,
          "output": 1.5
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "perceptron/perceptron-mk1.5": {
        "cost": {
          "input": 0.15,
          "output": 1.5
        },
        "input": [
          "text",
          "image",
          "video",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "perplexity/sonar": {
        "cost": {
          "input": 1,
          "output": 1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "perplexity/sonar-reasoning-pro": {
        "cost": {
          "input": 2,
          "output": 8
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "perplexity/sonar-pro": {
        "cost": {
          "input": 3,
          "output": 15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "perplexity/sonar-pro-search": {
        "cost": {
          "input": 3,
          "output": 15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "perplexity/sonar-deep-research": {
        "cost": {
          "input": 2,
          "output": 8,
          "reasoning": 3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "poolside/laguna-xs-2.1:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "poolside/laguna-xs-2.1": {
        "cost": {
          "input": 0.06,
          "output": 0.12,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "poolside/laguna-s-2.1:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "poolside/laguna-s-2.1": {
        "cost": {
          "input": 0.09,
          "output": 0.18,
          "cache_read": 0.009
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "prism-ml/ternary-bonsai-2-9b": {
        "cost": {
          "input": 0.08,
          "output": 0.13,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "prism-ml/ternary-bonsai-2-27b": {
        "cost": {
          "input": 0.075,
          "output": 0.5,
          "cache_read": 0.0375
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.8-omni-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.47,
          "cache_read": 0.016
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.8-max-prime": {
        "cost": {
          "input": 4,
          "output": 12,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.8-max-0902": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.8-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.47,
          "cache_read": 0.016
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.8-27b": {
        "cost": {
          "input": 0.15,
          "output": 1.875,
          "cache_read": 0.0375
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.8-2.4t-a95b": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.7-plus": {
        "cost": {
          "input": 0.32,
          "output": 1.28,
          "cache_read": 0.064,
          "cache_write": 0.4,
          "tiers": [
            {
              "input": 0.96,
              "output": 3.84,
              "cache_read": 0.192,
              "cache_write": 1.2,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.96,
            "output": 3.84,
            "cache_read": 0.192,
            "cache_write": 1.2
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.7-max": {
        "cost": {
          "input": 1.475,
          "output": 4.425,
          "cache_read": 0.295,
          "cache_write": 1.84375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.7-flash": {
        "cost": {
          "input": 0.03,
          "output": 0.13,
          "cache_read": 0.006,
          "cache_write": 0.038,
          "tiers": [
            {
              "input": 0.1,
              "output": 0.4,
              "cache_read": 0.02,
              "cache_write": 0.125,
              "tier": {
                "type": "context",
                "size": 32000
              }
            },
            {
              "input": 0.2,
              "output": 0.8,
              "cache_read": 0.04,
              "cache_write": 0.25,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.6-plus": {
        "cost": {
          "input": 0.325,
          "output": 1.95,
          "cache_write": 0.40625,
          "tiers": [
            {
              "input": 1.3,
              "output": 3.9,
              "cache_write": 1.625,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ],
          "context_over_200k": {
            "input": 1.3,
            "output": 3.9,
            "cache_write": 1.625
          }
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.6-flash": {
        "cost": {
          "input": 0.1875,
          "output": 1.125,
          "cache_write": 0.234375,
          "tiers": [
            {
              "input": 0.75,
              "output": 3,
              "cache_write": 0.9375,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.75,
            "output": 3,
            "cache_write": 0.9375
          }
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.6-35b-a3b": {
        "cost": {
          "input": 0.1,
          "output": 0.9,
          "cache_read": 0.025
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.6-27b": {
        "cost": {
          "input": 0.32,
          "output": 3.2
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.5-plus-20260420": {
        "cost": {
          "input": 0.3,
          "output": 1.8,
          "cache_write": 0.375,
          "tiers": [
            {
              "input": 0.375,
              "output": 2.25,
              "cache_write": 0.46875,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.375,
            "output": 2.25,
            "cache_write": 0.46875
          }
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.5-plus-02-15": {
        "cost": {
          "input": 0.26,
          "output": 1.56,
          "tiers": [
            {
              "input": 0.325,
              "output": 1.95,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.325,
            "output": 1.95
          }
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.5-flash-02-23": {
        "cost": {
          "input": 0.065,
          "output": 0.26
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.5-9b": {
        "cost": {
          "input": 0.17,
          "output": 0.25
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.5-397b-a17b": {
        "cost": {
          "input": 0.5,
          "output": 3.6,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.5-35b-a3b": {
        "cost": {
          "input": 0.14,
          "output": 1,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.5-27b": {
        "cost": {
          "input": 0.26,
          "output": 2.6
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3.5-122b-a10b": {
        "cost": {
          "input": 0.26,
          "output": 2.08
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-vl-8b-instruct": {
        "cost": {
          "input": 0.25,
          "output": 0.75,
          "cache_read": 0.12
        },
        "input": [
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-vl-30b-a3b-thinking": {
        "cost": {
          "input": 0.29,
          "output": 1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-vl-30b-a3b-instruct": {
        "cost": {
          "input": 0.15,
          "output": 0.6
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-vl-235b-a22b-instruct": {
        "cost": {
          "input": 0.21,
          "output": 1.9,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-next-80b-a3b-instruct": {
        "cost": {
          "input": 0.09,
          "output": 1.1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-coder": {
        "cost": {
          "input": 0.3,
          "output": 1,
          "cache_read": 0.1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-coder-next": {
        "cost": {
          "input": 0.12,
          "output": 0.8,
          "cache_read": 0.07
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-coder-flash": {
        "cost": {
          "input": 0.195,
          "output": 0.975,
          "cache_read": 0.039,
          "cache_write": 0.24375,
          "tiers": [
            {
              "input": 0.325,
              "output": 1.625,
              "cache_read": 0.065,
              "cache_write": 0.40625,
              "tier": {
                "type": "context",
                "size": 32000
              }
            },
            {
              "input": 0.52,
              "output": 2.6,
              "cache_read": 0.104,
              "cache_write": 0.65,
              "tier": {
                "type": "context",
                "size": 128000
              }
            }
          ]
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-coder-30b-a3b-instruct": {
        "cost": {
          "input": 0.07,
          "output": 0.28
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-32b": {
        "cost": {
          "input": 0.08,
          "output": 0.28
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-30b-a3b": {
        "cost": {
          "input": 0.12,
          "output": 0.5
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-30b-a3b-instruct-2507": {
        "cost": {
          "input": 0.1,
          "output": 0.3,
          "cache_read": 0.1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-235b-a22b-thinking-2507": {
        "cost": {
          "input": 0.45,
          "output": 3.5
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-235b-a22b-2507": {
        "cost": {
          "input": 0.09,
          "output": 0.55
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen3-14b": {
        "cost": {
          "input": 0.12,
          "output": 0.24
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen2.5-vl-72b-instruct": {
        "cost": {
          "input": 0.8,
          "output": 1,
          "cache_read": 0.4
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen-plus": {
        "cost": {
          "input": 0.26,
          "output": 0.78,
          "cache_read": 0.052,
          "cache_write": 0.325,
          "tiers": [
            {
              "input": 0.78,
              "output": 2.34,
              "cache_read": 0.156,
              "cache_write": 0.975,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.78,
            "output": 2.34,
            "cache_read": 0.156,
            "cache_write": 0.975
          }
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen-2.5-coder-32b-instruct": {
        "cost": {
          "input": 0.66,
          "output": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen-2.5-7b-instruct": {
        "cost": {
          "input": 0.1,
          "output": 0.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen-2.5-72b-instruct": {
        "cost": {
          "input": 0.36,
          "output": 0.4
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "recursive/flint-v1.0:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "reflection/beam-1.0-501b-a23b": {
        "cost": {
          "input": 0.25,
          "output": 1,
          "cache_read": 0.05
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "rekaai/reka-flash-3": {
        "cost": {
          "input": 0.1,
          "output": 0.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "rekaai/reka-edge": {
        "cost": {
          "input": 0.1,
          "output": 0.1
        },
        "input": [
          "image",
          "text",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "relace/relace-search": {
        "cost": {
          "input": 1,
          "output": 3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "relace/relace-apply-3": {
        "cost": {
          "input": 0.85,
          "output": 1.25
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "sakana/sakana-namazu": {
        "cost": {
          "input": 0.95,
          "output": 4,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "sakana/fugu-ultra": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 10,
              "output": 45,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 45,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "sakana/fugu-ultra-v2": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 10,
              "output": 45,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 45,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "sakana/fugu-max": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "sao10k/l3.1-euryale-70b": {
        "cost": {
          "input": 0.85,
          "output": 0.85
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "sao10k/l3-lunaris-8b": {
        "cost": {
          "input": 0.04,
          "output": 0.05
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "scaledown/summarize": {
        "cost": {
          "input": 0.04,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "scaledown/extract": {
        "cost": {
          "input": 0.04,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "stepfun/step-5-preview": {
        "cost": {
          "input": 1,
          "output": 2.7,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "stepfun/step-3.7-flash": {
        "cost": {
          "input": 0.2,
          "output": 1.15,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "stepfun/step-3.5-flash": {
        "cost": {
          "input": 0.1,
          "output": 0.3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy4-preview": {
        "cost": {
          "input": 0.7506,
          "output": 2.2509,
          "cache_read": 0.0378
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy3": {
        "cost": {
          "input": 0.0825,
          "output": 0.33,
          "cache_read": 0.020625
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy3-preview": {
        "cost": {
          "input": 0.18,
          "output": 0.6,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy-mt2-7b": {
        "cost": {
          "input": 0.074,
          "output": 0.295
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy-mt2-30b-a3b": {
        "cost": {
          "input": 0.074,
          "output": 0.295
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy-mt2-1.8b": {
        "cost": {
          "input": 0.044,
          "output": 0.177
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hunyuan-a13b-instruct": {
        "cost": {
          "input": 0.14,
          "output": 0.57
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "thedrummer/unslopnemo-12b": {
        "cost": {
          "input": 0.4,
          "output": 0.4
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "thedrummer/skyfall-36b-v2": {
        "cost": {
          "input": 0.55,
          "output": 0.8,
          "cache_read": 0.25
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "thedrummer/cydonia-24b-v4.1": {
        "cost": {
          "input": 0.3,
          "output": 0.5,
          "cache_read": 0.15
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "thinkingmachines/inkling:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "thinkingmachines/inkling": {
        "cost": {
          "input": 1,
          "output": 4.05,
          "cache_read": 0.17
        },
        "input": [
          "text",
          "image",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "thinkingmachines/inkling-small:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "thinkingmachines/inkling-small": {
        "cost": {
          "input": 0.45,
          "output": 1.2,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "unbiased/pareto-26.9": {
        "cost": {
          "input": 2.5,
          "output": 7.5,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "unbiased/pareto-26.10": {
        "cost": {
          "input": 0.8,
          "output": 3.2,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "undi95/remm-slerp-l2-13b": {
        "cost": {
          "input": 0.35,
          "output": 0.65
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "upstage/solar-pro4": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "upstage/solar-mini4": {
        "cost": {
          "input": 0.05,
          "output": 0.2,
          "cache_read": 0.005
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "writer/palmyra-x5": {
        "cost": {
          "input": 0.6,
          "output": 6
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "x-ai/grok-build-0.1": {
        "cost": {
          "input": 1,
          "output": 2,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2,
              "output": 4,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 4,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "x-ai/grok-4.7": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "x-ai/grok-4.6": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "x-ai/grok-4.5": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.3,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 0.6,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 0.6
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "x-ai/grok-4.3": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "x-ai/grok-4.20": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "x-ai/grok-4.20-multi-agent": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi/mimo-v2.6-pro": {
        "cost": {
          "input": 0.435,
          "output": 0.87,
          "cache_read": 0.0036
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi/mimo-v2.6-pro-ultraspeed": {
        "cost": {
          "input": 4.35,
          "output": 8.7,
          "cache_read": 0.036
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi/mimo-v2.6-flash": {
        "cost": {
          "input": 0.14,
          "output": 0.28,
          "cache_read": 0.0028
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi/mimo-v2.5": {
        "cost": {
          "input": 0.4,
          "output": 2,
          "cache_read": 0.08
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi/mimo-v2.5-pro": {
        "cost": {
          "input": 0.48,
          "output": 1.8,
          "cache_read": 0.096
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "xingchen-agi/xing4.0-29b-a4b:free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5v-turbo": {
        "cost": {
          "input": 1.2,
          "output": 4,
          "cache_read": 0.24
        },
        "input": [
          "image",
          "text",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5": {
        "cost": {
          "input": 1,
          "output": 3.2,
          "cache_read": 0.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5.3": {
        "cost": {
          "input": 0.08,
          "output": 3.6,
          "cache_read": 0.076
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5.3-prime": {
        "cost": {
          "input": 2.8,
          "output": 8.8,
          "cache_read": 0.56
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5.3-flashx": {
        "cost": {
          "input": 0.37,
          "output": 1.25,
          "cache_read": 0.09
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5.3-flash": {
        "cost": {
          "input": 0.018,
          "output": 0.1402,
          "cache_read": 0.018
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5.2": {
        "cost": {
          "input": 0.006,
          "output": 7,
          "cache_read": 0.005
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5.1": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5-turbo": {
        "cost": {
          "input": 1.2,
          "output": 4,
          "cache_read": 0.24
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-4.7": {
        "cost": {
          "input": 0.54,
          "output": 1.98,
          "cache_read": 0.099
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-4.7-flash": {
        "cost": {
          "input": 0.0605,
          "output": 0.4
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-4.6v": {
        "cost": {
          "input": 0.3,
          "output": 0.9,
          "cache_read": 0.055
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-4.6": {
        "cost": {
          "input": 0.5,
          "output": 2,
          "cache_read": 0.1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-4.5v": {
        "cost": {
          "input": 0.6,
          "output": 1.8,
          "cache_read": 0.11
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-4.5": {
        "cost": {
          "input": 0.6,
          "output": 2.2,
          "cache_read": 0.11
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-4.5-air": {
        "cost": {
          "input": 0.13,
          "output": 0.85,
          "cache_read": 0.025
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "~anthropic/claude-sonnet-latest": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "~anthropic/claude-opus-latest": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.2,
          "cache_write": 5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "~anthropic/claude-haiku-latest": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.5,
              "output": 2.5,
              "cache_read": 0.05,
              "cache_write": 0.625,
              "tier": {
                "type": "context",
                "size": 100000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "~anthropic/claude-fable-latest": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 0.25,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "~deepseek/deepseek-v4-flash-latest": {
        "cost": {
          "input": 0.0388,
          "output": 0.3,
          "cache_read": 0.0378
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "~deepseek/deepseek-pro-latest": {
        "cost": {
          "input": 0.1035,
          "output": 4,
          "cache_read": 0.1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "~deepseek/deepseek-flash-latest": {
        "cost": {
          "input": 0.022,
          "output": 0.192,
          "cache_read": 0.004
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "~google/gemini-pro-latest": {
        "cost": {
          "input": 2,
          "output": 10,
          "reasoning": 10,
          "cache_read": 0.1,
          "cache_write": 0.1875,
          "input_audio": 2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "audio",
          "pdf",
          "image",
          "text",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "~google/gemini-flash-latest": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "reasoning": 3.75,
          "cache_read": 0.075,
          "cache_write": 0.041667,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "~moonshotai/kimi-latest": {
        "cost": {
          "input": 0.1529,
          "output": 9.75,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "~openai/gpt-terra-latest": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.05,
          "cache_write": 1.25,
          "tiers": [
            {
              "input": 2,
              "output": 7.5,
              "cache_read": 0.1,
              "cache_write": 2.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 7.5,
            "cache_read": 0.1,
            "cache_write": 2.5
          }
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "~openai/gpt-sol-latest": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.2,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.2,
            "cache_write": 5
          }
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "~openai/gpt-mini-latest": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "cache_read": 0.075
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "~openai/gpt-luna-latest": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.2,
              "output": 0.75,
              "cache_read": 0.02,
              "cache_write": 0.25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.2,
            "output": 0.75,
            "cache_read": 0.02,
            "cache_write": 0.25
          }
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "~openai/gpt-astra-latest": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5,
          "tiers": [
            {
              "input": 20,
              "output": 75,
              "cache_read": 2,
              "cache_write": 25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 20,
            "output": 75,
            "cache_read": 2,
            "cache_write": 25
          }
        },
        "input": [
          "pdf",
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "~unbiased/pareto-latest": {
        "cost": {
          "input": 0.8,
          "output": 3.2,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "~x-ai/grok-latest": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "~z-ai/glm-latest": {
        "cost": {
          "input": 0.0699,
          "output": 1.4,
          "cache_read": 0.0689
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "~z-ai/glm-flash-latest": {
        "cost": {
          "input": 0.018,
          "output": 0.1402,
          "cache_read": 0.018
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      }
    },
    "vercel-ai-gateway": {
      "alibaba/qwen3.8-omni-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.47,
          "cache_read": 0.016
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.8-max": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.8-max-prime": {
        "cost": {
          "input": 4,
          "output": 12,
          "cache_read": 0.5,
          "cache_write": 5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.8-max-0902": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.8-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.47,
          "cache_read": 0.016,
          "cache_write": 0.2
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.8-27b": {
        "cost": {
          "input": 0.5,
          "output": 3,
          "cache_read": 0.1,
          "cache_write": 0.625
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.8-2.4t-a95b": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.7-plus": {
        "cost": {
          "input": 0.4,
          "output": 1.6,
          "cache_read": 0.08,
          "cache_write": 0.5,
          "tiers": [
            {
              "input": 1.2,
              "output": 4.8,
              "cache_read": 0.24,
              "cache_write": 1.5,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ],
          "context_over_200k": {
            "input": 1.2,
            "output": 4.8,
            "cache_read": 0.24,
            "cache_write": 1.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.7-max": {
        "cost": {
          "input": 2.5,
          "output": 7.5,
          "cache_read": 0.5,
          "cache_write": 3.125
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.7-flash": {
        "cost": {
          "input": 0.03,
          "output": 0.13,
          "cache_read": 0.006,
          "cache_write": 0.038,
          "tiers": [
            {
              "input": 0.1,
              "output": 0.4,
              "cache_read": 0.02,
              "cache_write": 0.125,
              "tier": {
                "type": "context",
                "size": 32000
              }
            },
            {
              "input": 0.2,
              "output": 0.8,
              "cache_read": 0.04,
              "cache_write": 0.25,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.6-plus": {
        "cost": {
          "input": 0.5,
          "output": 3,
          "cache_read": 0.05,
          "cache_write": 0.625,
          "tiers": [
            {
              "input": 2,
              "output": 6,
              "cache_read": 0.2,
              "cache_write": 2.5,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 6,
            "cache_read": 0.2,
            "cache_write": 2.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.6-27b": {
        "cost": {
          "input": 0.6,
          "output": 3.6
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.5-plus": {
        "cost": {
          "input": 0.4,
          "output": 2.4,
          "cache_read": 0.04,
          "cache_write": 0.5,
          "tiers": [
            {
              "input": 0.5,
              "output": 3,
              "cache_read": 0.05,
              "cache_write": 0.625,
              "tier": {
                "type": "context",
                "size": 256001
              }
            }
          ],
          "context_over_200k": {
            "input": 0.5,
            "output": 3,
            "cache_read": 0.05,
            "cache_write": 0.625
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3.5-flash": {
        "cost": {
          "input": 0.1,
          "output": 0.4,
          "cache_read": 0.01,
          "cache_write": 0.125
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3-vl-instruct": {
        "cost": {
          "input": 0.2,
          "output": 0.88,
          "cache_read": 0.11
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3-next-80b-a3b-thinking": {
        "cost": {
          "input": 0.15,
          "output": 1.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3-next-80b-a3b-instruct": {
        "cost": {
          "input": 0.15,
          "output": 1.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3-max-thinking": {
        "cost": {
          "input": 1.2,
          "output": 6,
          "cache_read": 0.24,
          "tiers": [
            {
              "input": 2.4,
              "output": 12,
              "cache_read": 0.48,
              "tier": {
                "type": "context",
                "size": 32001
              }
            },
            {
              "input": 3,
              "output": 15,
              "cache_read": 0.6,
              "tier": {
                "type": "context",
                "size": 128001
              }
            }
          ]
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3-coder": {
        "cost": {
          "input": 0.22,
          "output": 1.8,
          "cache_read": 0.022,
          "tiers": [
            {
              "input": 2.7,
              "output": 13.5,
              "cache_read": 0.54,
              "tier": {
                "type": "context",
                "size": 32001
              }
            },
            {
              "input": 4.5,
              "output": 22.5,
              "cache_read": 0.9,
              "tier": {
                "type": "context",
                "size": 128001
              }
            }
          ]
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3-coder-next": {
        "cost": {
          "input": 0.5,
          "output": 1.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen3-coder-30b-a3b": {
        "cost": {
          "input": 0.15,
          "output": 0.6
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen-3-32b": {
        "cost": {
          "input": 0.15,
          "output": 0.6
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen-3-30b": {
        "cost": {
          "input": 0.12,
          "output": 0.5
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen-3-235b": {
        "cost": {
          "input": 0.22,
          "output": 0.88
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "alibaba/qwen-3-14b": {
        "cost": {
          "input": 0.12,
          "output": 0.24
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "amazon/nova-2-lite": {
        "cost": {
          "input": 0.33,
          "output": 2.75,
          "cache_read": 0.0825
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "amazon/nova-lite": {
        "cost": {
          "input": 0.06,
          "output": 0.24,
          "cache_read": 0.015,
          "cache_write": 0.06
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "amazon/nova-micro": {
        "cost": {
          "input": 0.035,
          "output": 0.14,
          "cache_read": 0.00875,
          "cache_write": 0.035
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "amazon/nova-pro": {
        "cost": {
          "input": 0.8,
          "output": 3.2,
          "cache_read": 0.2,
          "cache_write": 0.8
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-sonnet-5": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-sonnet-5.5": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-sonnet-4.6": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3,
          "cache_write": 3.75,
          "tiers": [
            {
              "input": 6,
              "output": 22.5,
              "cache_read": 0.6,
              "cache_write": 7.5,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 6,
            "output": 22.5,
            "cache_read": 0.6,
            "cache_write": 7.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-sonnet-4.5": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3,
          "cache_write": 3.75,
          "tiers": [
            {
              "input": 6,
              "output": 22.5,
              "cache_read": 0.6,
              "cache_write": 7.5,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 6,
            "output": 22.5,
            "cache_read": 0.6,
            "cache_write": 7.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-5": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-5.5": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.2,
          "cache_write": 5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-5.5-fast": {
        "cost": {
          "input": 8,
          "output": 40,
          "cache_read": 0.4,
          "cache_write": 10
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-5-fast": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-4.8": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-4.8-fast": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-4.7": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-4.6": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-opus-4.5": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-haiku-5.5": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.5,
              "output": 2.5,
              "cache_read": 0.05,
              "cache_write": 0.625,
              "tier": {
                "type": "context",
                "size": 100001
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-haiku-4.5": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.1,
          "cache_write": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-fable-5": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "anthropic/claude-fable-5.1": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 0.25,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "bytedance/seed-2.1-turbo": {
        "cost": {
          "input": 0.5,
          "output": 2.5,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "bytedance/seed-1.8": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "cache_read": 0.05,
          "tiers": [
            {
              "input": 0.5,
              "output": 4,
              "cache_read": 0.05,
              "tier": {
                "type": "context",
                "size": 128001
              }
            }
          ]
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "bytedance/seed-1.6": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "cache_read": 0.05,
          "tiers": [
            {
              "input": 0.5,
              "output": 4,
              "cache_read": 0.05,
              "tier": {
                "type": "context",
                "size": 128001
              }
            }
          ]
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "callstack/apex": {
        "cost": {
          "input": 0.5,
          "output": 3,
          "cache_read": 0.2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "cohere/command-a": {
        "cost": {
          "input": 2.5,
          "output": 10
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4.1-flash": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.007
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4.1-flash-fast": {
        "cost": {
          "input": 0.6,
          "output": 2.4,
          "cache_read": 0.014
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4.1-flash-1017": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.007
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4.1-flash-1017-fast": {
        "cost": {
          "input": 0.6,
          "output": 2.4,
          "cache_read": 0.014
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4-pro": {
        "cost": {
          "input": 0.66,
          "output": 1.98,
          "cache_read": 0.022
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4-pro-0813": {
        "cost": {
          "input": 0.66,
          "output": 1.98,
          "cache_read": 0.066
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4-flash": {
        "cost": {
          "input": 0.13,
          "output": 0.26,
          "cache_read": 0.028
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4-flash-vision-exp": {
        "cost": {
          "input": 0.2156,
          "output": 0.6468,
          "cache_read": 0.0068
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v4-flash-0731": {
        "cost": {
          "input": 0.076,
          "output": 0.153,
          "cache_read": 0.014
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v3.2": {
        "cost": {
          "input": 0.62,
          "output": 1.85
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v3.2-thinking": {
        "cost": {
          "input": 0.62,
          "output": 1.85
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-v3.1": {
        "cost": {
          "input": 0.25,
          "output": 0.95,
          "cache_read": 0.13
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek/deepseek-r1": {
        "cost": {
          "input": 1.35,
          "output": 5.4
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "elorian/glimpse": {
        "cost": {
          "input": 0.6,
          "output": 3,
          "cache_read": 0.06
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "fireworks/ember-1": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-4-31b-it": {
        "cost": {
          "input": 0.14,
          "output": 0.4
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-4-26b-a4b-it": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-omni-flash-preview": {
        "cost": {
          "input": 1.5,
          "output": 9
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "video"
        ]
      },
      "google/gemini-nano-banana-2.1": {
        "cost": {
          "input": 1.5,
          "output": 7.5,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-4-argon": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.8-live": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "input_audio": 3,
          "output_audio": 12
        },
        "input": [
          "text",
          "audio"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "google/gemini-3.8-live-extended-thinking": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "input_audio": 3,
          "output_audio": 12
        },
        "input": [
          "text",
          "audio"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "google/gemini-3.8-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.8-flash-tts": {
        "cost": {
          "input": 0.5,
          "output": 9,
          "output_audio": 9
        },
        "input": [
          "text"
        ],
        "output": [
          "audio"
        ]
      },
      "google/gemini-3.8-flash-lite-tts": {
        "cost": {
          "input": 0.5,
          "output": 6,
          "output_audio": 6
        },
        "input": [
          "text"
        ],
        "output": [
          "audio"
        ]
      },
      "google/gemini-3.7-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.6-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.5-transcribe": {
        "cost": {
          "input": 2,
          "output": 12,
          "input_audio": 2
        },
        "input": [
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.5-flash": {
        "cost": {
          "input": 1.5,
          "output": 9,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.5-flash-lite": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.1-pro-preview": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.1-flash-lite": {
        "cost": {
          "input": 0.25,
          "output": 1.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-3.1-flash-lite-image": {
        "cost": {
          "input": 0.25,
          "output": 1.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-3.1-flash-image": {
        "cost": {
          "input": 0.5,
          "output": 3,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-3.1-flash-image-preview": {
        "cost": {
          "input": 0.5,
          "output": 3,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-3-pro-image": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "google/gemini-3-flash": {
        "cost": {
          "input": 0.5,
          "output": 3,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-2.5-pro": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125,
          "tiers": [
            {
              "input": 2.5,
              "output": 15,
              "cache_read": 0.25,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 15,
            "cache_read": 0.25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-2.5-flash": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-2.5-flash-lite": {
        "cost": {
          "input": 0.1,
          "output": 0.4,
          "cache_read": 0.01
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemini-2.5-flash-image": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "inception/mercury-coder-small": {
        "cost": {
          "input": 0.25,
          "output": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inception/mercury-3": {
        "cost": {
          "input": 0.1,
          "output": 0.35,
          "cache_read": 0.01
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inception/mercury-2": {
        "cost": {
          "input": 0.25,
          "output": 0.75,
          "cache_read": 0.025
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inception/mercury-2.5": {
        "cost": {
          "input": 0.04,
          "output": 0.15,
          "cache_read": 0.004
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inclusionai/ling-3.1-flash": {
        "cost": {
          "input": 0.3,
          "output": 0.9,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inclusionai/ling-3.1-flash-1019": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inclusionai/ling-3.0-flash": {
        "cost": {
          "input": 0.021,
          "output": 0.063,
          "cache_read": 0.0042
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inclusionai/ling-3.0-flash-vl": {
        "cost": {
          "input": 0.075,
          "output": 0.22,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "inclusionai/ling-3.0-flash-sante": {
        "cost": {
          "input": 0.075,
          "output": 0.22,
          "cache_read": 0.015
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inclusionai/ling-3.0-flash-fin": {
        "cost": {
          "input": 0.075,
          "output": 0.22,
          "cache_read": 0.015
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inference-net/schematron-v2-turbo": {
        "cost": {
          "input": 0.03,
          "output": 0.15,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "inference-net/schematron-v2-small": {
        "cost": {
          "input": 0.05,
          "output": 0.23,
          "cache_read": 0.05
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "interfaze/interfaze-beta": {
        "cost": {
          "input": 1.5,
          "output": 3.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "liquid/lfm2.5-24b-a2b": {
        "cost": {
          "input": 0.05,
          "output": 0.7,
          "cache_read": 0.025
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meituan/longcat-2.5-preview": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.006
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-wonder-1.0": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.2
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-open": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-1.3": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-1.3-contributor": {
        "cost": {
          "input": 0.1,
          "output": 0.2,
          "cache_read": 0.002
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-1.2": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-1.2-contributor": {
        "cost": {
          "input": 0.1,
          "output": 0.2,
          "cache_read": 0.002
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-spark-1.1": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-glimmer-30b": {
        "cost": {
          "input": 0.35,
          "output": 1.5,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta/llama-4-scout": {
        "cost": {
          "input": 0.17,
          "output": 0.66
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta/llama-4-maverick": {
        "cost": {
          "input": 0.24,
          "output": 0.97
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta/llama-3.3-70b": {
        "cost": {
          "input": 0.72,
          "output": 0.72
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta/llama-3.1-8b": {
        "cost": {
          "input": 0.22,
          "output": 0.22
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta/llama-3.1-70b": {
        "cost": {
          "input": 0.72,
          "output": 0.72
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "microsoft/mai-image-2.6": {
        "cost": {
          "input": 5,
          "output": 38
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "microsoft/mai-image-2.6-flash": {
        "cost": {
          "input": 1.75,
          "output": 19
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "minimax/minimax-m3": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m3.1-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.03,
          "cache_write": 0.375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2.7": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06,
          "cache_write": 0.375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2.7-highspeed": {
        "cost": {
          "input": 0.6,
          "output": 2.4,
          "cache_read": 0.06,
          "cache_write": 0.375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2.5": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.03,
          "cache_write": 0.375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2.5-highspeed": {
        "cost": {
          "input": 0.6,
          "output": 2.4,
          "cache_read": 0.03,
          "cache_write": 0.375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2.1": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.03,
          "cache_write": 0.375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax/minimax-m2.1-lightning": {
        "cost": {
          "input": 0.3,
          "output": 2.4,
          "cache_read": 0.03,
          "cache_write": 0.375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mistral/mistral-small": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral/mistral-nemo": {
        "cost": {
          "input": 0.029,
          "output": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mistral/mistral-medium-3.5": {
        "cost": {
          "input": 1.5,
          "output": 7.5,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral/mistral-large-4": {
        "cost": {
          "input": 0.7,
          "output": 2.1,
          "cache_read": 0.07
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral/mistral-large-3": {
        "cost": {
          "input": 0.5,
          "output": 1.5,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral/ministral-8b": {
        "cost": {
          "input": 0.15,
          "output": 0.15,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral/ministral-3b": {
        "cost": {
          "input": 0.1,
          "output": 0.1,
          "cache_read": 0.01
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral/ministral-14b": {
        "cost": {
          "input": 0.2,
          "output": 0.2,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "mistral/codestral": {
        "cost": {
          "input": 0.3,
          "output": 0.9,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mixedbread/toast-1": {
        "cost": {
          "input": 0.3,
          "output": 0.72,
          "cache_read": 0.036
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k3": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k3.1-pro": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k3.1-pro-highspeed": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.2,
          "cache_write": 4
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k3-fast": {
        "cost": {
          "input": 4.5,
          "output": 22.5,
          "cache_read": 0.45
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2": {
        "cost": {
          "input": 0.57,
          "output": 2.3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2.7-code": {
        "cost": {
          "input": 0.95,
          "output": 4,
          "cache_read": 0.19
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2.7-code-highspeed": {
        "cost": {
          "input": 1.9,
          "output": 8,
          "cache_read": 0.38
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2.6": {
        "cost": {
          "input": 0.95,
          "output": 4,
          "cache_read": 0.16
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2.5": {
        "cost": {
          "input": 0.6,
          "output": 3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "morph/morph-v3-fast": {
        "cost": {
          "input": 0.8,
          "output": 1.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "morph/morph-v3-large": {
        "cost": {
          "input": 0.9,
          "output": 1.9
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-nano-9b-v2": {
        "cost": {
          "input": 0.06,
          "output": 0.23
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-nano-12b-v2-vl": {
        "cost": {
          "input": 0.2,
          "output": 0.6
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-super-vl": {
        "cost": {
          "input": 0.2,
          "output": 0.5,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-lightning": {
        "cost": {
          "input": 0.05,
          "output": 0.2,
          "cache_read": 0.01
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-lightning-free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-ultra-550b-a55b": {
        "cost": {
          "input": 0.6,
          "output": 2.4,
          "cache_read": 0.12
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-super-120b-a12b": {
        "cost": {
          "input": 0.15,
          "output": 0.65
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-nano-30b-a3b": {
        "cost": {
          "input": 0.05,
          "output": 0.2,
          "cache_read": 0.025
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/o4-mini": {
        "cost": {
          "input": 1.1,
          "output": 4.4,
          "cache_read": 0.275
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/o3": {
        "cost": {
          "input": 2,
          "output": 8,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/o3-pro": {
        "cost": {
          "input": 20,
          "output": 80
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/o3-mini": {
        "cost": {
          "input": 1.1,
          "output": 4.4,
          "cache_read": 0.55
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/o3-fast": {
        "cost": {
          "input": 3.5,
          "output": 14,
          "cache_read": 0.875
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/o1": {
        "cost": {
          "input": 15,
          "output": 60,
          "cache_read": 7.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-realtime-mini": {
        "cost": {
          "input": 0.6,
          "output": 2.4,
          "cache_read": 0.06,
          "input_audio": 10,
          "output_audio": 20
        },
        "input": [
          "text",
          "audio"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "openai/gpt-realtime-2": {
        "cost": {
          "input": 4,
          "output": 24,
          "cache_read": 0.4,
          "input_audio": 32,
          "output_audio": 64
        },
        "input": [
          "text",
          "audio"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "openai/gpt-realtime-2.1": {
        "cost": {
          "input": 4,
          "output": 24,
          "cache_read": 0.4,
          "input_audio": 32,
          "output_audio": 64
        },
        "input": [
          "text",
          "audio"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "openai/gpt-realtime-1.5": {
        "cost": {
          "input": 4,
          "output": 16,
          "cache_read": 0.4,
          "input_audio": 32,
          "output_audio": 64
        },
        "input": [
          "text",
          "audio"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "openai/gpt-oss-safeguard-20b": {
        "cost": {
          "input": 0.07,
          "output": 0.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-safeguard-120b": {
        "cost": {
          "input": 0.15,
          "output": 0.6
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-20b": {
        "cost": {
          "input": 0.03,
          "output": 0.14
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-120b": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-image-2": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "openai/gpt-image-2.5-sunburst": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "openai/gpt-image-2.5-flare": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "openai/gpt-image-1.5": {
        "cost": {
          "input": 5,
          "output": 32,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "openai/gpt-image-1-mini": {
        "cost": {
          "input": 2,
          "output": 8,
          "cache_read": 0.2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "openai/gpt-6.1-terra": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.05,
          "cache_write": 1.25,
          "tiers": [
            {
              "input": 2,
              "output": 7.5,
              "cache_read": 0.1,
              "cache_write": 2.5,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 7.5,
            "cache_read": 0.1,
            "cache_write": 2.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6.1-terra-fast": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.2,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.2,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6.1-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.2,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.2,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6.1-sol-fast": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.2,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.4,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.4,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-sol-fast": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-luna": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.2,
              "output": 0.75,
              "cache_read": 0.02,
              "cache_write": 0.25,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 0.2,
            "output": 0.75,
            "cache_read": 0.02,
            "cache_write": 0.25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-luna-fast": {
        "cost": {
          "input": 0.2,
          "output": 1,
          "cache_read": 0.02,
          "cache_write": 0.25,
          "tiers": [
            {
              "input": 0.4,
              "output": 1.5,
              "cache_read": 0.04,
              "cache_write": 0.5,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 0.4,
            "output": 1.5,
            "cache_read": 0.04,
            "cache_write": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-astra": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5,
          "tiers": [
            {
              "input": 20,
              "output": 75,
              "cache_read": 2,
              "cache_write": 25,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 20,
            "output": 75,
            "cache_read": 2,
            "cache_write": 25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-6-astra-fast": {
        "cost": {
          "input": 20,
          "output": 100,
          "cache_read": 2,
          "cache_write": 25,
          "tiers": [
            {
              "input": 40,
              "output": 150,
              "cache_read": 4,
              "cache_write": 50,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 40,
            "output": 150,
            "cache_read": 4,
            "cache_write": 50
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-terra": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-terra-fast": {
        "cost": {
          "input": 4,
          "output": 24,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 36,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 36,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-sol": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-sol-fast": {
        "cost": {
          "input": 8,
          "output": 40,
          "cache_read": 0.8,
          "cache_write": 10,
          "tiers": [
            {
              "input": 16,
              "output": 60,
              "cache_read": 1.6,
              "cache_write": 20,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 16,
            "output": 60,
            "cache_read": 1.6,
            "cache_write": 20
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-luna": {
        "cost": {
          "input": 0.2,
          "output": 1.2,
          "cache_read": 0.02,
          "cache_write": 0.25,
          "tiers": [
            {
              "input": 0.4,
              "output": 1.8,
              "cache_read": 0.04,
              "cache_write": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.4,
            "output": 1.8,
            "cache_read": 0.04,
            "cache_write": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.6-luna-fast": {
        "cost": {
          "input": 0.4,
          "output": 2.4,
          "cache_read": 0.04,
          "cache_write": 0.5,
          "tiers": [
            {
              "input": 0.8,
              "output": 3.6,
              "cache_read": 0.08,
              "cache_write": 1,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.8,
            "output": 3.6,
            "cache_read": 0.08,
            "cache_write": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.5": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 10,
              "output": 45,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 45,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.5-pro": {
        "cost": {
          "input": 30,
          "output": 180,
          "tiers": [
            {
              "input": 60,
              "output": 270,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 60,
            "output": 270
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.5-fast": {
        "cost": {
          "input": 12.5,
          "output": 75,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4": {
        "cost": {
          "input": 2.5,
          "output": 15,
          "cache_read": 0.25,
          "tiers": [
            {
              "input": 5,
              "output": 22.5,
              "cache_read": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 5,
            "output": 22.5,
            "cache_read": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4-pro": {
        "cost": {
          "input": 30,
          "output": 180,
          "tiers": [
            {
              "input": 60,
              "output": 270,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 60,
            "output": 270
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4-nano": {
        "cost": {
          "input": 0.2,
          "output": 1.25,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4-mini": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4-mini-fast": {
        "cost": {
          "input": 1.5,
          "output": 9,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.4-fast": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.3-codex": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.3-codex-fast": {
        "cost": {
          "input": 3.5,
          "output": 28,
          "cache_read": 0.35
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.2": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.2-pro": {
        "cost": {
          "input": 21,
          "output": 168
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.2-fast": {
        "cost": {
          "input": 3.5,
          "output": 28,
          "cache_read": 0.35
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.2-codex": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.1-thinking": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.1-thinking-fast": {
        "cost": {
          "input": 2.5,
          "output": 20,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.1-codex": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.13
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.1-codex-mini": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5.1-codex-max": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5-pro": {
        "cost": {
          "input": 15,
          "output": 120
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5-nano": {
        "cost": {
          "input": 0.05,
          "output": 0.4,
          "cache_read": 0.005
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5-mini": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "cache_read": 0.025
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5-mini-fast": {
        "cost": {
          "input": 0.45,
          "output": 3.6,
          "cache_read": 0.045
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5-fast": {
        "cost": {
          "input": 2.5,
          "output": 20,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-5-codex": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.13
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o-transcribe": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "input_audio": 2.5
        },
        "input": [
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o-mini": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o-mini-transcribe": {
        "cost": {
          "input": 1.25,
          "output": 5,
          "input_audio": 1.25
        },
        "input": [
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o-mini-fast": {
        "cost": {
          "input": 0.25,
          "output": 1,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4o-fast": {
        "cost": {
          "input": 4.25,
          "output": 17,
          "cache_read": 2.125
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4.1": {
        "cost": {
          "input": 2,
          "output": 8,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4.1-nano": {
        "cost": {
          "input": 0.1,
          "output": 0.4,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4.1-mini": {
        "cost": {
          "input": 0.4,
          "output": 1.6,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4.1-mini-fast": {
        "cost": {
          "input": 0.7,
          "output": 2.8,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-4.1-fast": {
        "cost": {
          "input": 3.5,
          "output": 14,
          "cache_read": 0.875
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "particle/particle-1": {
        "cost": {
          "input": 0.125,
          "output": 0.5,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "perplexity/sonar": {
        "cost": {
          "input": 0.25,
          "output": 2.5,
          "cache_write": 0.0625
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "poolside/laguna-s-2.1": {
        "cost": {
          "input": 0.09,
          "output": 0.18,
          "cache_read": 0.009
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "poolside/laguna-s-2.1-free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "quiverai/arrow-2": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "quiverai/arrow-2-telos": {
        "cost": {
          "input": 6,
          "output": 30,
          "cache_read": 0.6,
          "cache_write": 7.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "reflection/beam": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "reflection/beam-free": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "sakana/namazu": {
        "cost": {
          "input": 0.95,
          "output": 4,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "sakana/fugu-ultra": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 10,
              "output": 45,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 45,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "sakana/fugu-ultra-v2": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 10,
              "output": 45,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 272001
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 45,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "sakana/fugu-max": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "scaledown/scaledown-summarize-1": {
        "cost": {
          "input": 0.05,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "scaledown/scaledown-extract-1": {
        "cost": {
          "input": 0.05,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-build-0.1": {
        "cost": {
          "input": 1,
          "output": 2,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2,
              "output": 4,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 4,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-4.7": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-4.6": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-4.5": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.3,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 0.6,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 0.6
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-4.3": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-4.20-reasoning": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-4.20-reasoning-beta": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-4.20-non-reasoning": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-4.20-non-reasoning-beta": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.4,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-4.20-multi-agent": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "spacexai/grok-4.20-multi-agent-beta": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2.5,
              "output": 5,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200001
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 5,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "stealth/glyph-cluster": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "stepfun/step-5-preview": {
        "cost": {
          "input": 1,
          "output": 2.7,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "stepfun/step-3.7-flash": {
        "cost": {
          "input": 0.2,
          "output": 1.15,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy4-preview": {
        "cost": {
          "input": 0.834,
          "output": 2.501,
          "cache_read": 0.042
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy3": {
        "cost": {
          "input": 0.14,
          "output": 0.58,
          "cache_read": 0.035
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy-mt2-pro": {
        "cost": {
          "input": 0.074,
          "output": 0.295
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy-mt2-plus": {
        "cost": {
          "input": 0.074,
          "output": 0.295
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/hy-mt2-lite": {
        "cost": {
          "input": 0.044,
          "output": 0.177
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "thinkingmachines/inkling": {
        "cost": {
          "input": 1,
          "output": 4.05,
          "cache_read": 0.17
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "thinkingmachines/inkling-small": {
        "cost": {
          "input": 0.45,
          "output": 1.2,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi/mimo-v2.6-pro": {
        "cost": {
          "input": 0.435,
          "output": 0.87,
          "cache_read": 0.0036
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi/mimo-v2.6-pro-ultraspeed": {
        "cost": {
          "input": 4.35,
          "output": 8.7,
          "cache_read": 0.036
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi/mimo-v2.6-flash": {
        "cost": {
          "input": 0.14,
          "output": 0.28,
          "cache_read": 0.0028
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi/mimo-v2.5": {
        "cost": {
          "input": 0.119,
          "output": 0.238,
          "cache_read": 0.0025
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi/mimo-v2.5-pro": {
        "cost": {
          "input": 0.3045,
          "output": 0.609,
          "cache_read": 0.0028
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-5v-turbo": {
        "cost": {
          "input": 1.2,
          "output": 4,
          "cache_read": 0.24
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-5": {
        "cost": {
          "input": 1,
          "output": 3.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-5.3": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.14
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-5.3-flashx": {
        "cost": {
          "input": 0.37,
          "output": 1.25,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-5.3-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-5.3-fast": {
        "cost": {
          "input": 2.1,
          "output": 6.6,
          "cache_read": 0.21
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-5.2": {
        "cost": {
          "input": 0.8,
          "output": 2.55,
          "cache_read": 0.16
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-5.2-fast": {
        "cost": {
          "input": 2.8,
          "output": 8.8,
          "cache_read": 0.56
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-5.1": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-5-turbo": {
        "cost": {
          "input": 1.2,
          "output": 4,
          "cache_read": 0.24
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-4.7": {
        "cost": {
          "input": 0.6,
          "output": 2.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-4.7-flashx": {
        "cost": {
          "input": 0.06,
          "output": 0.4,
          "cache_read": 0.01
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-4.7-flash": {
        "cost": {
          "input": 0.07,
          "output": 0.4
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-4.6": {
        "cost": {
          "input": 0.6,
          "output": 2.2,
          "cache_read": 0.11
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-4.5v": {
        "cost": {
          "input": 0.6,
          "output": 1.8,
          "cache_read": 0.11
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-4.5": {
        "cost": {
          "input": 0.6,
          "output": 2.2,
          "cache_read": 0.11
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai/glm-4.5-air": {
        "cost": {
          "input": 0.2,
          "output": 1.1,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "chutes": {
      "Qwen/Qwen3.8-27B-TEE": {
        "cost": {
          "input": 0.039,
          "output": 1.25,
          "cache_read": 0.003899999999999999
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.6-27B-TEE": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "cache_read": 0.024999999999999994
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.5-397B-A17B-TEE": {
        "cost": {
          "input": 0.45,
          "output": 3,
          "cache_read": 0.04499999999999999
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Flash-0731-TEE": {
        "cost": {
          "input": 0.44,
          "output": 1.32,
          "cache_read": 0.04399999999999999
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V3.2-TEE": {
        "cost": {
          "input": 1,
          "output": 1,
          "cache_read": 0.09999999999999998
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-4-31B-turbo-TEE": {
        "cost": {
          "input": 0.12,
          "output": 0.37,
          "cache_read": 0.011999999999999997
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/Kimi-K3-TEE": {
        "cost": {
          "input": 1.85,
          "output": 9.5,
          "cache_read": 0.18499999999999997
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/Kimi-K2.6-TEE": {
        "cost": {
          "input": 0.39,
          "output": 1.8,
          "cache_read": 0.03899999999999999
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.2-TEE": {
        "cost": {
          "input": 1.25,
          "output": 3.95,
          "cache_read": 0.12499999999999997
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.1-TEE": {
        "cost": {
          "input": 0.9,
          "output": 2.9,
          "cache_read": 0.08999999999999998
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "cloudflare-ai": {
      "@cf/aisingapore/gemma-sea-lion-v4-27b-it": {
        "cost": {
          "input": 0.351,
          "output": 0.555
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/deepseek-ai/deepseek-v4.1-flash-1017": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.006
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/deepseek-ai/deepseek-v4-pro-0813": {
        "cost": {
          "input": 1.32,
          "output": 3.96,
          "cache_read": 0.044
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/deepseek-ai/deepseek-v4-flash-0731": {
        "cost": {
          "input": 0.44,
          "output": 1.32,
          "cache_read": 0.014
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": {
        "cost": {
          "input": 0.497,
          "output": 4.881
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/google/gemma-4-26b-a4b-it": {
        "cost": {
          "input": 0.1,
          "output": 0.3,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/ibm-granite/granite-4.0-h-micro": {
        "cost": {
          "input": 0.017,
          "output": 0.112
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/meta/llama-guard-3-8b": {
        "cost": {
          "input": 0.484,
          "output": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/meta/llama-4-scout-17b-16e-instruct": {
        "cost": {
          "input": 0.27,
          "output": 0.85
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast": {
        "cost": {
          "input": 0.293,
          "output": 2.253
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/meta/llama-3.2-3b-instruct": {
        "cost": {
          "input": 0.0509,
          "output": 0.335
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/meta/llama-3.2-1b-instruct": {
        "cost": {
          "input": 0.027,
          "output": 0.201
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/meta/llama-3.2-11b-vision-instruct": {
        "cost": {
          "input": 0.0485,
          "output": 0.676
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/meta/llama-3.1-8b-instruct-fp8": {
        "cost": {
          "input": 0.152,
          "output": 0.287
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/mistralai/mistral-small-3.1-24b-instruct": {
        "cost": {
          "input": 0.351,
          "output": 0.555
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/moonshotai/kimi-k2.7-code": {
        "cost": {
          "input": 0.95,
          "output": 4,
          "cache_read": 0.19
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/moonshotai/kimi-k2.6": {
        "cost": {
          "input": 0.95,
          "output": 4,
          "cache_read": 0.16
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/nvidia/nemotron-3-120b-a12b": {
        "cost": {
          "input": 0.5,
          "output": 1.5
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/openai/gpt-oss-20b": {
        "cost": {
          "input": 0.2,
          "output": 0.3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/openai/gpt-oss-120b": {
        "cost": {
          "input": 0.35,
          "output": 0.75
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/qwen/qwq-32b": {
        "cost": {
          "input": 0.66,
          "output": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/qwen/qwen3.8-27b": {
        "cost": {
          "input": 0.45,
          "output": 3.2,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/qwen/qwen3-30b-a3b-fp8": {
        "cost": {
          "input": 0.0509,
          "output": 0.335
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/qwen/qwen2.5-coder-32b-instruct": {
        "cost": {
          "input": 0.66,
          "output": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/zai-org/glm-5.3": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/zai-org/glm-5.3-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/zai-org/glm-5.2": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "@cf/zai-org/glm-4.7-flash": {
        "cost": {
          "input": 0.0605,
          "output": 0.4
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "together": {
      "LiquidAI/LFM2-24B-A2B": {
        "cost": {
          "input": 0.03,
          "output": 0.12
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "MiniMaxAI/MiniMax-M3": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "MiniMaxAI/MiniMax-M2.7": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "MiniMaxAI/MiniMax-M2.5": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.7-Max": {
        "cost": {
          "input": 2.5,
          "output": 7.5,
          "cache_read": 0.5
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.6-Plus": {
        "cost": {
          "input": 0.5,
          "output": 3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.5-9B": {
        "cost": {
          "input": 0.17,
          "output": 0.25
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.5-397B-A17B": {
        "cost": {
          "input": 0.6,
          "output": 3.6,
          "cache_read": 0.35
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-Coder-Next-FP8": {
        "cost": {
          "input": 0.5,
          "output": 1.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8": {
        "cost": {
          "input": 2,
          "output": 2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-235B-A22B-Instruct-2507-tput": {
        "cost": {
          "input": 0.2,
          "output": 0.6
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen2.5-7B-Instruct-Turbo": {
        "cost": {
          "input": 0.3,
          "output": 0.3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4.1-Flash": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.006
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Pro-0813": {
        "cost": {
          "input": 1.32,
          "output": 3.96,
          "cache_read": 0.13
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Flash-0731": {
        "cost": {
          "input": 0.14,
          "output": 0.28,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V3": {
        "cost": {
          "input": 1.25,
          "output": 1.25
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V3-1": {
        "cost": {
          "input": 0.6,
          "output": 1.7
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-R1": {
        "cost": {
          "input": 3,
          "output": 7
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "essentialai/Rnj-1-Instruct": {
        "cost": {
          "input": 0.15,
          "output": 0.15
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta-llama/Llama-3.3-70B-Instruct-Turbo": {
        "cost": {
          "input": 1.04,
          "output": 1.04
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meta-models/Muse-Spark-Open-816B-A42B": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/Kimi-K3": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-ultra-550b-a55b": {
        "cost": {
          "input": 0.6,
          "output": 3.6,
          "cache_read": 0.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/NVIDIA-Nemotron-3.5-Super-VL": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-120b": {
        "cost": {
          "input": 0.15,
          "output": 0.6
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "reflection/Beam-1.0-501B-A23B": {
        "cost": {
          "input": 0.4,
          "output": 1.2,
          "cache_read": 0.04
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "thinkingmachines/Inkling": {
        "cost": {
          "input": 1,
          "output": 4.05,
          "cache_read": 0.17
        },
        "input": [
          "text",
          "image",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5": {
        "cost": {
          "input": 1,
          "output": 3.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.3": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.3-Flash": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.2": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.1": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "fireworks": {
      "accounts/fireworks/models/qwen3p8-max": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/qwen3p8-2p4t-a95b": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b": {
        "cost": {
          "input": 0.05,
          "output": 0.2,
          "cache_read": 0.01
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/nemotron-3-ultra-nvfp4": {
        "cost": {
          "input": 0.6,
          "output": 2.4,
          "cache_read": 0.12
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/muse-spark-open": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/minimax-m3p1-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/minimax-m3": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/kimi-k3": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/inkling": {
        "cost": {
          "input": 1,
          "output": 4.05,
          "cache_read": 0.17
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/gpt-oss-120b": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/glm-5p3": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/glm-5p3-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/ember-1": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/deepseek-v4p1-flash": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.006
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/models/deepseek-v4p1-flash-1017": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.006
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/qwen-max-latest": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/minimax-latest": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/kimi-latest": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/kimi-k3-spot": {
        "cost": {
          "input": 2.1,
          "output": 10.5,
          "cache_read": 0.21
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/kimi-k3-fast": {
        "cost": {
          "input": 4.5,
          "output": 22.5,
          "cache_read": 0.45
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/kimi-fast-latest": {
        "cost": {
          "input": 4.5,
          "output": 22.5,
          "cache_read": 0.45
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/glm-latest": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/glm-flash-latest": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/glm-fast-latest": {
        "cost": {
          "input": 2.1,
          "output": 6.6,
          "cache_read": 0.39
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/glm-5p3-spot": {
        "cost": {
          "input": 0.98,
          "output": 3.08,
          "cache_read": 0.182
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/glm-5p3-fast": {
        "cost": {
          "input": 2.1,
          "output": 6.6,
          "cache_read": 0.39
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/deepseek-v4p1-flash-spot": {
        "cost": {
          "input": 0.21,
          "output": 0.84,
          "cache_read": 0.0042
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/deepseek-v4p1-flash-1017-spot": {
        "cost": {
          "input": 0.21,
          "output": 0.84,
          "cache_read": 0.0042
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "accounts/fireworks/routers/deepseek-flash-latest": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.006
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      }
    },
    "nebius": {
      "MiniMaxAI/MiniMax-M3": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "MiniMaxAI/MiniMax-M3.1-Flash": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "NousResearch/Hermes-4-405B": {
        "cost": {
          "input": 1,
          "output": 3,
          "reasoning": 3,
          "cache_read": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.8-27B": {
        "cost": {
          "input": 0.45,
          "output": 3,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.5-397B-A17B": {
        "cost": {
          "input": 0.6,
          "output": 3.6,
          "cache_read": 0.12
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-Embedding-8B": {
        "cost": {
          "input": 0.01,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-30B-A3B-Instruct-2507": {
        "cost": {
          "input": 0.1,
          "output": 0.3,
          "cache_read": 0.1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-235B-A22B-Instruct-2507": {
        "cost": {
          "input": 0.2,
          "output": 0.6,
          "cache_read": 0.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4.1-Flash": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.01
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4.1-Flash-1017": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.006
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Pro": {
        "cost": {
          "input": 1.75,
          "output": 3.5,
          "cache_read": 1.75
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Pro-0813": {
        "cost": {
          "input": 1.32,
          "output": 3.96,
          "cache_read": 0.04
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Flash-0731": {
        "cost": {
          "input": 0.14,
          "output": 0.28,
          "cache_read": 0.01
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-3-27b-it": {
        "cost": {
          "input": 0.1,
          "output": 0.3,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta-models/muse-spark-open": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/Kimi-K3": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/Kimi-K2.7-Code": {
        "cost": {
          "input": 0.95,
          "output": 4,
          "cache_read": 0.15
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-super-120b-a12b": {
        "cost": {
          "input": 0.3,
          "output": 0.9,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/Nemotron-3_5-Lightning": {
        "cost": {
          "input": 0.06,
          "output": 0.24,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/Nemotron-3.5-Super-VL": {
        "cost": {
          "input": 0.3,
          "output": 0.9,
          "cache_read": 0.06
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/Nemotron-3-Ultra-550b-a55b": {
        "cost": {
          "input": 1,
          "output": 3,
          "cache_read": 0.12
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-120b": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "reasoning": 0.6,
          "cache_read": 0.15
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "reflection/beam": {
        "cost": {
          "input": 0.25,
          "output": 1,
          "cache_read": 0.05
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.3": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.3-Flash": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.2": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.14
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "cerebras": {
      "qwen-3.8-27b": {
        "cost": {
          "input": 0.99,
          "output": 1.49,
          "cache_read": 0.99
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-oss-120b": {
        "cost": {
          "input": 0.35,
          "output": 0.75,
          "cache_read": 0.35
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "siliconflow": {
      "ByteDance-Seed/Seed-OSS-36B-Instruct": {
        "cost": {
          "input": 0.21,
          "output": 0.57
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "MiniMaxAI/MiniMax-M3": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "MiniMaxAI/MiniMax-M2.5": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.8-2.4T-A95B": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.25
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.6-35B-A3B": {
        "cost": {
          "input": 0.24,
          "output": 1.8,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.6-27B": {
        "cost": {
          "input": 0.3,
          "output": 3.2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.5-9B": {
        "cost": {
          "input": 0.1,
          "output": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.5-397B-A17B": {
        "cost": {
          "input": 0.39,
          "output": 2.34
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.5-35B-A3B": {
        "cost": {
          "input": 0.24,
          "output": 1.8,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.5-27B": {
        "cost": {
          "input": 0.25,
          "output": 2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3.5-122B-A10B": {
        "cost": {
          "input": 0.26,
          "output": 2.08
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-VL-8B-Instruct": {
        "cost": {
          "input": 0.18,
          "output": 0.68
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-VL-32B-Thinking": {
        "cost": {
          "input": 0.2,
          "output": 1.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-VL-32B-Instruct": {
        "cost": {
          "input": 0.2,
          "output": 0.6
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-VL-30B-A3B-Thinking": {
        "cost": {
          "input": 0.29,
          "output": 1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-VL-30B-A3B-Instruct": {
        "cost": {
          "input": 0.29,
          "output": 1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-Coder-480B-A35B-Instruct": {
        "cost": {
          "input": 0.25,
          "output": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-Coder-30B-A3B-Instruct": {
        "cost": {
          "input": 0.07,
          "output": 0.28
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-8B": {
        "cost": {
          "input": 0.06,
          "output": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-32B": {
        "cost": {
          "input": 0.14,
          "output": 0.57
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-30B-A3B-Instruct-2507": {
        "cost": {
          "input": 0.09,
          "output": 0.3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen3-14B": {
        "cost": {
          "input": 0.07,
          "output": 0.28
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen2.5-7B-Instruct": {
        "cost": {
          "input": 0.05,
          "output": 0.05
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "Qwen/Qwen2.5-72B-Instruct": {
        "cost": {
          "input": 0.59,
          "output": 0.59
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Pro": {
        "cost": {
          "input": 1.50162,
          "output": 3.135,
          "cache_read": 0.135
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Pro-0813": {
        "cost": {
          "input": 1.32,
          "output": 3.96,
          "cache_read": 0.044
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Flash": {
        "cost": {
          "input": 0.13,
          "output": 0.28,
          "cache_read": 0.028
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Flash-Vision-Exp": {
        "cost": {
          "input": 0.44,
          "output": 1.32,
          "cache_read": 0.028
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V4-Flash-0731": {
        "cost": {
          "input": 0.22,
          "output": 0.66,
          "cache_read": 0.014
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V3": {
        "cost": {
          "input": 0.25,
          "output": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V3.2": {
        "cost": {
          "input": 0.27,
          "output": 0.42,
          "cache_read": 0.135
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V3.2-Exp": {
        "cost": {
          "input": 0.27,
          "output": 0.41
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V3.1": {
        "cost": {
          "input": 0.27,
          "output": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-V3.1-Terminus": {
        "cost": {
          "input": 0.27,
          "output": 1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-ai/DeepSeek-R1": {
        "cost": {
          "input": 0.5,
          "output": 2.18
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-4-31B-it": {
        "cost": {
          "input": 0.75,
          "output": 1,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-4-26B-A4B-it": {
        "cost": {
          "input": 0.14,
          "output": 0.4,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-4-12B-it": {
        "cost": {
          "input": 0.1,
          "output": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "inclusionAI/Ling-flash-2.0": {
        "cost": {
          "input": 0.14,
          "output": 0.57
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "meituan-longcat/LongCat-2.0": {
        "cost": {
          "input": 0.75,
          "output": 2.95,
          "cache_read": 0.015
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/Kimi-K3": {
        "cost": {
          "input": 2.7,
          "output": 13.5,
          "cache_read": 0.27
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/Kimi-K2.7-Code": {
        "cost": {
          "input": 0.85916,
          "output": 3.8,
          "cache_read": 0.17993
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/Kimi-K2.6": {
        "cost": {
          "input": 0.77,
          "output": 3.4,
          "cache_read": 0.14
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/Kimi-K2.5": {
        "cost": {
          "input": 0.45,
          "output": 2.25,
          "cache_read": 0.07
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nex-agi/Nex-N2-Pro": {
        "cost": {
          "input": 0.5,
          "output": 2.5,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-20b": {
        "cost": {
          "input": 0.04,
          "output": 0.18
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-120b": {
        "cost": {
          "input": 0.05,
          "output": 0.45
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "stepfun-ai/Step-3.5-Flash": {
        "cost": {
          "input": 0.1,
          "output": 0.3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/Hy3": {
        "cost": {
          "input": 0.132,
          "output": 0.528,
          "cache_read": 0.033
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "tencent/Hunyuan-A13B-Instruct": {
        "cost": {
          "input": 0.14,
          "output": 0.57
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5V-Turbo": {
        "cost": {
          "input": 1.2,
          "output": 4,
          "cache_read": 0.24,
          "cache_write": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5": {
        "cost": {
          "input": 0.95,
          "output": 2.55,
          "cache_read": 0.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.3": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.3-Flash": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.03,
          "cache_write": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.2": {
        "cost": {
          "input": 1.302,
          "output": 4.092,
          "cache_read": 0.26,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-5.1": {
        "cost": {
          "input": 1.19,
          "output": 3.74,
          "cache_read": 0.6,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org/GLM-4.5-Air": {
        "cost": {
          "input": 0.14,
          "output": 0.86
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "xiaomi-mimo": {
      "mimo-v2.6-pro": {
        "cost": {
          "input": 0.435,
          "output": 0.87,
          "cache_read": 0.0036
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "mimo-v2.6-pro-ultraspeed": {
        "cost": {
          "input": 4.35,
          "output": 8.7,
          "cache_read": 0.036
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "mimo-v2.6-flash": {
        "cost": {
          "input": 0.14,
          "output": 0.28,
          "cache_read": 0.0028
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "mimo-v2.5": {
        "cost": {
          "input": 0.14,
          "output": 0.28,
          "cache_read": 0.0028
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "mimo-v2.5-pro": {
        "cost": {
          "input": 0.435,
          "output": 0.87,
          "cache_read": 0.0036
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mimo-v2.5-pro-ultraspeed": {
        "cost": {
          "input": 1.305,
          "output": 2.61,
          "cache_read": 0.0108
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "venice": {
      "zai-org-glm-5": {
        "cost": {
          "input": 1,
          "output": 3.2,
          "cache_read": 0.2
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org-glm-5-2": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org-glm-5-1": {
        "cost": {
          "input": 1.54,
          "output": 4.84,
          "cache_read": 0.286
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org-glm-4.7": {
        "cost": {
          "input": 0.55,
          "output": 2.65,
          "cache_read": 0.11
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "zai-org-glm-4.6": {
        "cost": {
          "input": 0.43,
          "output": 1.75,
          "cache_read": 0.08
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai-glm-5v-turbo": {
        "cost": {
          "input": 1.5,
          "output": 5,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai-glm-5-turbo": {
        "cost": {
          "input": 1.2,
          "output": 4,
          "cache_read": 0.24
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai-glm-5-3": {
        "cost": {
          "input": 1.75,
          "output": 5.5,
          "cache_read": 0.325
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai-glm-5-3-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi-mimo-v2-6-flash": {
        "cost": {
          "input": 0.175,
          "output": 0.35,
          "cache_read": 0.00375
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "xiaomi-mimo-v2-5": {
        "cost": {
          "input": 0.4,
          "output": 2,
          "cache_read": 0.08
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "venice-uncensored-role-play": {
        "cost": {
          "input": 0.5,
          "output": 2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "venice-uncensored-1-2": {
        "cost": {
          "input": 0.2,
          "output": 0.9
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "seed-2-1-turbo": {
        "cost": {
          "input": 0.625,
          "output": 3.125,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-vl-235b-a22b": {
        "cost": {
          "input": 0.21,
          "output": 1.9,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-next-80b": {
        "cost": {
          "input": 0.35,
          "output": 1.9
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-coder-480b-a35b-instruct-turbo": {
        "cost": {
          "input": 0.35,
          "output": 1.5,
          "cache_read": 0.04
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-6-35b-a3b": {
        "cost": {
          "input": 0.1,
          "output": 1
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-6-27b": {
        "cost": {
          "input": 0.325,
          "output": 3.25
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-5-397b-a17b": {
        "cost": {
          "input": 0.75,
          "output": 4.5
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-5-35b-a3b": {
        "cost": {
          "input": 0.15,
          "output": 1,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-235b-a22b-thinking-2507": {
        "cost": {
          "input": 0.45,
          "output": 3.5
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-235b-a22b-instruct-2507": {
        "cost": {
          "input": 0.15,
          "output": 0.75
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen-3-8-max": {
        "cost": {
          "input": 2.5,
          "output": 7.5,
          "cache_read": 0.3125,
          "cache_write": 3.125
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen-3-8-flash": {
        "cost": {
          "input": 0.14,
          "output": 0.49,
          "cache_read": 0.014
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen-3-8-27b": {
        "cost": {
          "input": 0.45,
          "output": 3.2
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen-3-8-2-4t-a95b": {
        "cost": {
          "input": 2.5,
          "output": 7.5,
          "cache_read": 0.3125
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen-3-7-plus": {
        "cost": {
          "input": 0.5,
          "output": 2,
          "cache_read": 0.05,
          "cache_write": 0.625,
          "tiers": [
            {
              "input": 1.5,
              "output": 6,
              "cache_read": 0.15,
              "cache_write": 1.875,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ],
          "context_over_200k": {
            "input": 1.5,
            "output": 6,
            "cache_read": 0.15,
            "cache_write": 1.875
          }
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen-3-7-max": {
        "cost": {
          "input": 2.7,
          "output": 8.05,
          "cache_read": 0.27,
          "cache_write": 3.35
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen-3-6-plus": {
        "cost": {
          "input": 0.625,
          "output": 3.75,
          "cache_read": 0.0625,
          "cache_write": 0.78,
          "tiers": [
            {
              "input": 2.5,
              "output": 7.5,
              "cache_read": 0.0625,
              "cache_write": 0.78,
              "tier": {
                "type": "context",
                "size": 256000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 7.5,
            "cache_read": 0.0625,
            "cache_write": 0.78
          }
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-oss-120b": {
        "cost": {
          "input": 0.07,
          "output": 0.3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-61-terra": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.05,
          "cache_write": 1.25,
          "tiers": [
            {
              "input": 2,
              "output": 7.5,
              "cache_read": 0.1,
              "cache_write": 2.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 7.5,
            "cache_read": 0.1,
            "cache_write": 2.5
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-61-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.2,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.2,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-61-sol-ultrafast": {
        "cost": {
          "input": 12,
          "output": 60,
          "cache_read": 0.6,
          "cache_write": 15,
          "tiers": [
            {
              "input": 24,
              "output": 90,
              "cache_read": 1.2,
              "cache_write": 30,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 24,
            "output": 90,
            "cache_read": 1.2,
            "cache_write": 30
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-6-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-6-luna": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.2,
              "output": 0.75,
              "cache_read": 0.02,
              "cache_write": 0.25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.2,
            "output": 0.75,
            "cache_read": 0.02,
            "cache_write": 0.25
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-6-astra": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5,
          "tiers": [
            {
              "input": 20,
              "output": 75,
              "cache_read": 2,
              "cache_write": 25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 20,
            "output": 75,
            "cache_read": 2,
            "cache_write": 25
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-6-astra-pro": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5,
          "tiers": [
            {
              "input": 20,
              "output": 75,
              "cache_read": 2,
              "cache_write": 25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 20,
            "output": 75,
            "cache_read": 2,
            "cache_write": 25
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-56-terra": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-56-terra-pro": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-56-sol": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-56-sol-pro": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-56-luna": {
        "cost": {
          "input": 0.2,
          "output": 1.2,
          "cache_read": 0.02,
          "cache_write": 0.25,
          "tiers": [
            {
              "input": 0.4,
              "output": 1.8,
              "cache_read": 0.04,
              "cache_write": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.4,
            "output": 1.8,
            "cache_read": 0.04,
            "cache_write": 0.5
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-56-luna-pro": {
        "cost": {
          "input": 0.2,
          "output": 1.2,
          "cache_read": 0.02,
          "cache_write": 0.25,
          "tiers": [
            {
              "input": 0.4,
              "output": 1.8,
              "cache_read": 0.04,
              "cache_write": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.4,
            "output": 1.8,
            "cache_read": 0.04,
            "cache_write": 0.5
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-55": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 10,
              "output": 45,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 45,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-55-pro": {
        "cost": {
          "input": 30,
          "output": 180,
          "tiers": [
            {
              "input": 60,
              "output": 270,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 60,
            "output": 270
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-54": {
        "cost": {
          "input": 2.5,
          "output": 15,
          "cache_read": 0.25,
          "tiers": [
            {
              "input": 5,
              "output": 22.5,
              "cache_read": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 5,
            "output": 22.5,
            "cache_read": 0.5
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-54-pro": {
        "cost": {
          "input": 30,
          "output": 180,
          "tiers": [
            {
              "input": 60,
              "output": 270,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 60,
            "output": 270
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-54-mini": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-53-codex": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-52": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-4o-mini-2024-07-18": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "openai-gpt-4o-2024-11-20": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "olafangensan-glm-4.7-flash-heretic": {
        "cost": {
          "input": 0.07,
          "output": 0.4,
          "cache_read": 0.035
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia-nemotron-3-ultra-550b-a55b": {
        "cost": {
          "input": 0.625,
          "output": 3.125,
          "cache_read": 0.1875
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia-nemotron-3-nano-30b-a3b": {
        "cost": {
          "input": 0.075,
          "output": 0.3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia-nemotron-3-5-super-vl-120b-a12b": {
        "cost": {
          "input": 0.2,
          "output": 0.5,
          "cache_read": 0.04
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "muse-wonder": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.25
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "muse-spark-open": {
        "cost": {
          "input": 1.5625,
          "output": 5.3125,
          "cache_read": 0.1875
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-small-3-2-24b-instruct": {
        "cost": {
          "input": 0.09375,
          "output": 0.25
        },
        "input": [
          "image",
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax-m3-preview": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "minimax-m3-1-flash": {
        "cost": {
          "input": 0.1875,
          "output": 0.75,
          "cache_read": 0.01875
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "minimax-m27": {
        "cost": {
          "input": 0.375,
          "output": 1.5,
          "cache_read": 0.06875
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "minimax-m25": {
        "cost": {
          "input": 0.27,
          "output": 0.95,
          "cache_read": 0.03
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mercury-3": {
        "cost": {
          "input": 0.1,
          "output": 0.35,
          "cache_read": 0.01
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mercury-2": {
        "cost": {
          "input": 0.3125,
          "output": 0.9375,
          "cache_read": 0.03125
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mercury-2-5": {
        "cost": {
          "input": 0.25,
          "output": 0.9375,
          "cache_read": 0.025
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "llama-3.3-70b": {
        "cost": {
          "input": 0.7,
          "output": 2.8
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "llama-3.2-3b": {
        "cost": {
          "input": 0.15,
          "output": 0.6
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k3": {
        "cost": {
          "input": 3.75,
          "output": 18.75,
          "cache_read": 0.375
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k3-fast-api": {
        "cost": {
          "input": 4.5,
          "output": 22.5,
          "cache_read": 0.45
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k3-1-pro": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.30000000000000004
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k3-1-pro-highspeed": {
        "cost": {
          "input": 6,
          "output": 30,
          "cache_read": 0.6000000000000001
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k2-7-code": {
        "cost": {
          "input": 0.75,
          "output": 3.5,
          "cache_read": 0.16
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k2-6": {
        "cost": {
          "input": 0.75,
          "output": 3.5,
          "cache_read": 0.16
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k2-5": {
        "cost": {
          "input": 0.56,
          "output": 3.5,
          "cache_read": 0.22
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "hy4-preview": {
        "cost": {
          "input": 1.0425,
          "output": 3.12625,
          "cache_read": 0.0525
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "hermes-3-llama-3.1-405b": {
        "cost": {
          "input": 1.1,
          "output": 3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "grok-build-0-1": {
        "cost": {
          "input": 1,
          "output": 2,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 2,
              "output": 4,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 4,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4-7": {
        "cost": {
          "input": 2.27,
          "output": 6.8,
          "cache_read": 0.57,
          "tiers": [
            {
              "input": 4.53,
              "output": 13.6,
              "cache_read": 1.13,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4.53,
            "output": 13.6,
            "cache_read": 1.13
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4-6": {
        "cost": {
          "input": 2.27,
          "output": 6.8,
          "cache_read": 0.57,
          "tiers": [
            {
              "input": 4.53,
              "output": 13.6,
              "cache_read": 1.13,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4.53,
            "output": 13.6,
            "cache_read": 1.13
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4-5": {
        "cost": {
          "input": 2.27,
          "output": 6.8,
          "cache_read": 0.34,
          "tiers": [
            {
              "input": 4.53,
              "output": 13.6,
              "cache_read": 0.68,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4.53,
            "output": 13.6,
            "cache_read": 0.68
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4-3": {
        "cost": {
          "input": 1.42,
          "output": 2.83,
          "cache_read": 0.23,
          "tiers": [
            {
              "input": 2.83,
              "output": 5.67,
              "cache_read": 0.45,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.83,
            "output": 5.67,
            "cache_read": 0.45
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4-20": {
        "cost": {
          "input": 1.42,
          "output": 2.83,
          "cache_read": 0.23,
          "tiers": [
            {
              "input": 2.83,
              "output": 5.67,
              "cache_read": 0.45,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.83,
            "output": 5.67,
            "cache_read": 0.45
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4-20-multi-agent": {
        "cost": {
          "input": 1.42,
          "output": 2.83,
          "cache_read": 0.23,
          "tiers": [
            {
              "input": 2.83,
              "output": 5.67,
              "cache_read": 0.45,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.83,
            "output": 5.67,
            "cache_read": 0.45
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google-gemma-4-31b-it": {
        "cost": {
          "input": 0.12,
          "output": 0.36,
          "cache_read": 0.09
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "google-gemma-4-26b-a4b-it": {
        "cost": {
          "input": 0.13,
          "output": 0.4,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "google-gemma-3-27b-it": {
        "cost": {
          "input": 0.12,
          "output": 0.2
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gemma-4-uncensored": {
        "cost": {
          "input": 0.1625,
          "output": 0.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-4-argon": {
        "cost": {
          "input": 2.5,
          "output": 12.5,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3-flash-preview": {
        "cost": {
          "input": 0.7,
          "output": 3.75,
          "cache_read": 0.07
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3-8-flash": {
        "cost": {
          "input": 0.9375,
          "output": 4.6875,
          "cache_read": 0.09375
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3-7-flash": {
        "cost": {
          "input": 0.9375,
          "output": 4.6875,
          "cache_read": 0.09375
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3-6-flash": {
        "cost": {
          "input": 0.9375,
          "output": 4.6875,
          "cache_read": 0.09375
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3-5-flash": {
        "cost": {
          "input": 1.55,
          "output": 9.45,
          "cache_read": 0.155,
          "cache_write": 0.086
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3-5-flash-lite": {
        "cost": {
          "input": 0.375,
          "output": 3.125,
          "cache_read": 0.0375
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3-1-pro-preview": {
        "cost": {
          "input": 2.5,
          "output": 15,
          "cache_read": 0.5,
          "cache_write": 0.5,
          "tiers": [
            {
              "input": 5,
              "output": 22.5,
              "cache_read": 0.5,
              "cache_write": 0.5,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 5,
            "output": 22.5,
            "cache_read": 0.5,
            "cache_write": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "audio",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-pro": {
        "cost": {
          "input": 1.65,
          "output": 3.301,
          "cache_read": 0.33
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-pro-0813": {
        "cost": {
          "input": 1.65,
          "output": 4.95,
          "cache_read": 0.165
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-flash": {
        "cost": {
          "input": 0.138,
          "output": 0.275,
          "cache_read": 0.028
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-flash-0731": {
        "cost": {
          "input": 0.13,
          "output": 0.26,
          "cache_read": 0.028
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-flash-0731-fast": {
        "cost": {
          "input": 0.35,
          "output": 0.7,
          "cache_read": 0.0875
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-1-flash": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.0075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-1-flash-uncensored": {
        "cost": {
          "input": 0.33,
          "output": 1.32,
          "cache_read": 0.00825
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-1-flash-1017": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.0075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-1-flash-1017-uncensored": {
        "cost": {
          "input": 0.33,
          "output": 1.32,
          "cache_read": 0.00825
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v3.2": {
        "cost": {
          "input": 0.33,
          "output": 0.48,
          "cache_read": 0.16
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "claude-sonnet-5": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-sonnet-5-5": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-sonnet-4-6": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3,
          "cache_write": 3.75
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-5": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-5-fast": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-5-5": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.2,
          "cache_write": 5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-5-5-fast": {
        "cost": {
          "input": 8,
          "output": 40,
          "cache_read": 0.4,
          "cache_write": 10
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4-8": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4-8-fast": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4-7": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4-6": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4-5": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-haiku-5-5": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.5,
              "output": 2.5,
              "cache_read": 0.05,
              "cache_write": 0.625,
              "tier": {
                "type": "context",
                "size": 100000
              }
            }
          ]
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-fable-5": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "claude-fable-5-1": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 0.25,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "aion-labs-aion-3-5": {
        "cost": {
          "input": 3.75,
          "output": 7.5,
          "cache_read": 0.9375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "aion-labs-aion-3-5-mini": {
        "cost": {
          "input": 0.875,
          "output": 1.75,
          "cache_read": 0.225
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "aion-labs-aion-3-0": {
        "cost": {
          "input": 3.75,
          "output": 7.5,
          "cache_read": 0.9375
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "aion-labs-aion-3-0-mini": {
        "cost": {
          "input": 0.875,
          "output": 1.75,
          "cache_read": 0.225
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "abliteration-abliterated-model-large-v2": {
        "cost": {
          "input": 3,
          "output": 5,
          "cache_read": 0.3
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "abliteration-abliterated-model-large-flash": {
        "cost": {
          "input": 1.25,
          "output": 2.5,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      }
    },
    "github": {
      "mai-code-1.1-flash": {
        "cost": {
          "input": 0.2,
          "output": 1.2,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k3": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k2.7-code": {
        "cost": {
          "input": 0.95,
          "output": 4,
          "cache_read": 0.19
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4.7": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4.6": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "grok-4.5": {
        "cost": {
          "input": 2,
          "output": 6,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 4,
              "output": 12,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 12,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6.1-terra": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.05,
          "cache_write": 1.25,
          "tiers": [
            {
              "input": 2,
              "output": 7.5,
              "cache_read": 0.1,
              "cache_write": 2.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 7.5,
            "cache_read": 0.1,
            "cache_write": 2.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6.1-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.2,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.2,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6-luna": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.2,
              "output": 0.75,
              "cache_read": 0.02,
              "cache_write": 0.25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.2,
            "output": 0.75,
            "cache_read": 0.02,
            "cache_write": 0.25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6-astra": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5,
          "tiers": [
            {
              "input": 20,
              "output": 75,
              "cache_read": 2,
              "cache_write": 25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 20,
            "output": 75,
            "cache_read": 2,
            "cache_write": 25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6-terra": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6-sol": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6-luna": {
        "cost": {
          "input": 0.2,
          "output": 1.2,
          "cache_read": 0.02,
          "cache_write": 0.25,
          "tiers": [
            {
              "input": 0.4,
              "output": 1.8,
              "cache_read": 0.04,
              "cache_write": 0.5,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.4,
            "output": 1.8,
            "cache_read": 0.04,
            "cache_write": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.5": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 10,
              "output": 45,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 45,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4": {
        "cost": {
          "input": 2.5,
          "output": 15,
          "cache_read": 0.25,
          "tiers": [
            {
              "input": 5,
              "output": 22.5,
              "cache_read": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 5,
            "output": 22.5,
            "cache_read": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4-nano": {
        "cost": {
          "input": 0.2,
          "output": 1.25,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4-mini": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.3-codex": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5-mini": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "cache_read": 0.025
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-4-argon": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.8-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.7-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.6-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.5-flash": {
        "cost": {
          "input": 1.5,
          "output": 9,
          "cache_read": 0.15,
          "input_audio": 1.5
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-sonnet-5": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-sonnet-5.5": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-sonnet-4.6": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3,
          "cache_write": 3.75
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-5": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-5.5": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.2,
          "cache_write": 5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4.8": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-opus-4.7": {
        "cost": {
          "input": 5,
          "output": 25,
          "cache_read": 0.5,
          "cache_write": 6.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-haiku-5.5": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.5,
              "output": 2.5,
              "cache_read": 0.05,
              "cache_write": 0.625,
              "tier": {
                "type": "context",
                "size": 100000
              }
            }
          ]
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-haiku-4.5": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.1,
          "cache_write": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-fable-5": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "claude-fable-5.1": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 0.25,
          "cache_write": 12.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      }
    },
    "glm": {
      "glm-5.3": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.3-highspeed": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.3-flash": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.2": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.2-highspeed": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5-turbo": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-4.7": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "glm-cn": {
      "glm-5.3": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.3-highspeed": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.3-flash": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "glm-4.6v": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      }
    },
    "nvidia": {
      "black-forest-labs/flux_2-klein-4b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "black-forest-labs/flux_1-schnell": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "image"
        ]
      },
      "black-forest-labs/flux_1-kontext-dev": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "black-forest-labs/flux.1-dev": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "image"
        ]
      },
      "deepseek-ai/deepseek-v4.1-flash": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/google-paligemma": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-4-31b-it": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-3-4b-it": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/gemma-3-12b-it": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "google/diffusiongemma-26b-a4b-it": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "meta/muse-glimmer-30b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta/llama-guard-4-12b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta/llama-3.2-90b-vision-instruct": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "meta/llama-3.2-11b-vision-instruct": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "minimaxai/minimax-m3.1-flash": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-medium-3-instruct": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/mistral-7b-instruct-v0.3": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "mistralai/magistral-small-2506": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k3": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "moonshotai/kimi-k2.6": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/usdvalidate": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/usdcode": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/synthetic-video-detector": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/studiovoice": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "audio"
        ],
        "output": [
          "audio"
        ]
      },
      "nvidia/streampetr": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/sparsedrive": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/riva-translate-4b-instruct-v1.1": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/rerank-qa-mistral-4b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-voicechat": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-super-vl-120b-a12b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-lightning-30b-a3b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3.5-content-safety": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-ultra-550b-a55b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video",
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/magpie-tts-zeroshot": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "audio"
        ],
        "output": [
          "audio"
        ]
      },
      "nvidia/llama-nemotron-rerank-vl-1b-v2": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/llama-nemotron-embed-vl-1b-v2": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/llama-3.1-nemotron-ultra-253b-v1": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/llama-3.1-nemotron-safety-guard-8b-v3": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/llama-3.1-nemotron-70b-instruct": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/cosmos-transfer2_5-2b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "video"
        ]
      },
      "nvidia/cosmos-reason2-8b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/bevformer": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "nvidia/active-speaker-detection": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "openai/whisper-large-v3": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "audio"
        ],
        "output": [
          "text"
        ]
      },
      "openai/gpt-oss-20b": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "poolside/laguna-xs-2.1": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen/qwen-image": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "image"
        ]
      },
      "qwen/qwen-image-edit": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "stepfun-ai/step-5-preview": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5.3": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "z-ai/glm-5.3-flash": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      }
    },
    "codex": {
      "text-embedding-ada-002": {
        "cost": {
          "input": 0.1,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "text-embedding-3-small": {
        "cost": {
          "input": 0.02,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "text-embedding-3-large": {
        "cost": {
          "input": 0.13,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "o4-mini": {
        "cost": {
          "input": 1.1,
          "output": 4.4,
          "cache_read": 0.275
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "o3": {
        "cost": {
          "input": 2,
          "output": 8,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "o3-pro": {
        "cost": {
          "input": 20,
          "output": 80
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "o3-mini": {
        "cost": {
          "input": 1.1,
          "output": 4.4,
          "cache_read": 0.55
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "o1": {
        "cost": {
          "input": 15,
          "output": 60,
          "cache_read": 7.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "o1-pro": {
        "cost": {
          "input": 150,
          "output": 600
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-realtime-2.1": {
        "cost": {
          "input": 4,
          "output": 24,
          "cache_read": 0.4,
          "input_audio": 32,
          "output_audio": 64
        },
        "input": [
          "text",
          "audio",
          "image"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "gpt-image-2": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "image"
        ]
      },
      "gpt-daybreak-red-latest": {
        "cost": {
          "input": 12.5,
          "output": 75,
          "cache_read": 1.25,
          "cache_write": 15.625
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-daybreak-blue-latest": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6.1-terra": {
        "cost": {
          "input": 1,
          "output": 5,
          "cache_read": 0.05,
          "cache_write": 1.25,
          "tiers": [
            {
              "input": 2,
              "output": 7.5,
              "cache_read": 0.1,
              "cache_write": 2.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 2,
            "output": 7.5,
            "cache_read": 0.1,
            "cache_write": 2.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6.1-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.2,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.2,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6-sol": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 15,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 15,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6-luna": {
        "cost": {
          "input": 0.1,
          "output": 0.5,
          "cache_read": 0.01,
          "cache_write": 0.125,
          "tiers": [
            {
              "input": 0.2,
              "output": 0.75,
              "cache_read": 0.02,
              "cache_write": 0.25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.2,
            "output": 0.75,
            "cache_read": 0.02,
            "cache_write": 0.25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-6-astra": {
        "cost": {
          "input": 10,
          "output": 50,
          "cache_read": 1,
          "cache_write": 12.5,
          "tiers": [
            {
              "input": 20,
              "output": 75,
              "cache_read": 2,
              "cache_write": 25,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 20,
            "output": 75,
            "cache_read": 2,
            "cache_write": 25
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6-terra": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "cache_write": 2.5,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "cache_write": 5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4,
            "cache_write": 5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6-sol": {
        "cost": {
          "input": 4,
          "output": 20,
          "cache_read": 0.4,
          "cache_write": 5,
          "tiers": [
            {
              "input": 8,
              "output": 30,
              "cache_read": 0.8,
              "cache_write": 10,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 8,
            "output": 30,
            "cache_read": 0.8,
            "cache_write": 10
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.6-luna": {
        "cost": {
          "input": 0.2,
          "output": 1.2,
          "cache_read": 0.02,
          "cache_write": 0.25,
          "tiers": [
            {
              "input": 0.4,
              "output": 1.8,
              "cache_read": 0.04,
              "cache_write": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 0.4,
            "output": 1.8,
            "cache_read": 0.04,
            "cache_write": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.5": {
        "cost": {
          "input": 5,
          "output": 30,
          "cache_read": 0.5,
          "tiers": [
            {
              "input": 10,
              "output": 45,
              "cache_read": 1,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 10,
            "output": 45,
            "cache_read": 1
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.5-pro": {
        "cost": {
          "input": 30,
          "output": 180,
          "tiers": [
            {
              "input": 60,
              "output": 270,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 60,
            "output": 270
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4": {
        "cost": {
          "input": 2.5,
          "output": 15,
          "cache_read": 0.25,
          "tiers": [
            {
              "input": 5,
              "output": 22.5,
              "cache_read": 0.5,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 5,
            "output": 22.5,
            "cache_read": 0.5
          }
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4-pro": {
        "cost": {
          "input": 30,
          "output": 180,
          "tiers": [
            {
              "input": 60,
              "output": 270,
              "tier": {
                "type": "context",
                "size": 272000
              }
            }
          ],
          "context_over_200k": {
            "input": 60,
            "output": 270
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4-nano": {
        "cost": {
          "input": 0.2,
          "output": 1.25,
          "cache_read": 0.02
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.4-mini": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.3-codex": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.3-codex-spark": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.2": {
        "cost": {
          "input": 1.75,
          "output": 14,
          "cache_read": 0.175
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.2-pro": {
        "cost": {
          "input": 21,
          "output": 168
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5.1": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5-pro": {
        "cost": {
          "input": 15,
          "output": 120
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5-nano": {
        "cost": {
          "input": 0.05,
          "output": 0.4,
          "cache_read": 0.005
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-5-mini": {
        "cost": {
          "input": 0.25,
          "output": 2,
          "cache_read": 0.025
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4o": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4o-mini": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4o-2024-11-20": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4o-2024-08-06": {
        "cost": {
          "input": 2.5,
          "output": 10,
          "cache_read": 1.25
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4o-2024-05-13": {
        "cost": {
          "input": 5,
          "output": 15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4": {
        "cost": {
          "input": 30,
          "output": 60
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4.1": {
        "cost": {
          "input": 2,
          "output": 8,
          "cache_read": 0.5
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4.1-nano": {
        "cost": {
          "input": 0.1,
          "output": 0.4,
          "cache_read": 0.025
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4.1-mini": {
        "cost": {
          "input": 0.4,
          "output": 1.6,
          "cache_read": 0.1
        },
        "input": [
          "text",
          "image",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-4-turbo": {
        "cost": {
          "input": 10,
          "output": 30
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-3.5-turbo": {
        "cost": {
          "input": 0.5,
          "output": 1.5,
          "cache_read": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "gemini-cli": {
      "lyria-3-pro-preview": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "lyria-3-clip-preview": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "gemini-pro-latest": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-omni-flash-preview": {
        "cost": {
          "input": 1.5,
          "output": 17.5
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "video"
        ]
      },
      "gemini-flash-lite-latest": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-flash-latest": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-embedding-2": {
        "cost": {
          "input": 0.2,
          "output": 0,
          "input_audio": 6.5
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-embedding-001": {
        "cost": {
          "input": 0.15,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-4-argon": {
        "cost": {
          "input": 2,
          "output": 10,
          "cache_read": 0.1,
          "input_audio": 2
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.8-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.7-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.6-flash": {
        "cost": {
          "input": 0.75,
          "output": 3.75,
          "cache_read": 0.075,
          "input_audio": 0.75
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.5-live-translate-preview": {
        "cost": {
          "input": 3.5,
          "output": 21,
          "input_audio": 3.5,
          "output_audio": 21
        },
        "input": [
          "audio"
        ],
        "output": [
          "audio",
          "text"
        ]
      },
      "gemini-3.5-flash": {
        "cost": {
          "input": 1.5,
          "output": 9,
          "cache_read": 0.15,
          "input_audio": 1.5
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.5-flash-lite": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.1-pro-preview": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.1-pro-preview-customtools": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.1-flash-tts-preview": {
        "cost": {
          "input": 1,
          "output": 20
        },
        "input": [
          "text"
        ],
        "output": [
          "audio"
        ]
      },
      "gemini-3.1-flash-live-preview": {
        "cost": {
          "input": 0.75,
          "output": 4.5,
          "input_audio": 3,
          "output_audio": 12
        },
        "input": [
          "text",
          "image",
          "video",
          "audio"
        ],
        "output": [
          "text",
          "audio"
        ]
      },
      "gemini-3.1-flash-lite": {
        "cost": {
          "input": 0.25,
          "output": 1.5,
          "cache_read": 0.025,
          "input_audio": 0.5
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.1-flash-lite-preview": {
        "cost": {
          "input": 0.25,
          "output": 1.5,
          "cache_read": 0.025,
          "input_audio": 0.5
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-3.1-flash-lite-image": {
        "cost": {
          "input": 0.25,
          "output": 30
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "gemini-3.1-flash-image": {
        "cost": {
          "input": 0.5,
          "output": 60
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "gemini-3-pro-image": {
        "cost": {
          "input": 2,
          "output": 120
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "gemini-3-flash-preview": {
        "cost": {
          "input": 0.5,
          "output": 3,
          "cache_read": 0.05,
          "input_audio": 1
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-2.5-pro": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "cache_read": 0.125,
          "tiers": [
            {
              "input": 2.5,
              "output": 15,
              "cache_read": 0.25,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 15,
            "cache_read": 0.25
          }
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-2.5-pro-preview-tts": {
        "cost": {
          "input": 1,
          "output": 20
        },
        "input": [
          "text"
        ],
        "output": [
          "audio"
        ]
      },
      "gemini-2.5-flash": {
        "cost": {
          "input": 0.3,
          "output": 2.5,
          "cache_read": 0.03,
          "input_audio": 1
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-2.5-flash-preview-tts": {
        "cost": {
          "input": 0.5,
          "output": 10
        },
        "input": [
          "text"
        ],
        "output": [
          "audio"
        ]
      },
      "gemini-2.5-flash-lite": {
        "cost": {
          "input": 0.1,
          "output": 0.4,
          "cache_read": 0.01,
          "input_audio": 0.3
        },
        "input": [
          "text",
          "image",
          "audio",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "gemini-2.5-flash-image": {
        "cost": {
          "input": 0.3,
          "output": 30,
          "cache_read": 0.075
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "gemini-2.5-computer-use-preview-10-2025": {
        "cost": {
          "input": 1.25,
          "output": 10,
          "tiers": [
            {
              "input": 2.5,
              "output": 15,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 2.5,
            "output": 15
          }
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deep-research-preview-04-2026": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text",
          "image"
        ]
      },
      "deep-research-max-preview-04-2026": {
        "cost": {
          "input": 2,
          "output": 12,
          "cache_read": 0.2,
          "tiers": [
            {
              "input": 4,
              "output": 18,
              "cache_read": 0.4,
              "tier": {
                "type": "context",
                "size": 200000
              }
            }
          ],
          "context_over_200k": {
            "input": 4,
            "output": 18,
            "cache_read": 0.4
          }
        },
        "input": [
          "text",
          "image",
          "video",
          "audio",
          "pdf"
        ],
        "output": [
          "text",
          "image"
        ]
      }
    },
    "ollama": {
      "nemotron-3-ultra": {
        "cost": {
          "input": 0.1,
          "output": 3,
          "cache_read": 0.1
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nemotron-3-super": {
        "cost": {
          "input": 0.015,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "nemotron-3-nano:30b": {
        "cost": {
          "input": 0.06,
          "output": 0.24
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "muse-spark-open": {
        "cost": {
          "input": 1.25,
          "output": 4.25,
          "cache_read": 0.15
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-large-4": {
        "cost": {
          "input": 0.68,
          "output": 2.09,
          "cache_read": 0.07
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "mistral-large-3:675b": {
        "cost": {
          "input": 0.5,
          "output": 1.5
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "minimax-m3": {
        "cost": {
          "input": 0.6,
          "output": 2.4,
          "cache_read": 0.12
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "minimax-m3.1-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.015
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "minimax-m2.7": {
        "cost": {
          "input": 0.3,
          "output": 1.2,
          "cache_read": 0.06
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k3": {
        "cost": {
          "input": 3,
          "output": 15,
          "cache_read": 0.3
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k2.7-code": {
        "cost": {
          "input": 0.95,
          "output": 4,
          "cache_read": 0.19
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k2.6": {
        "cost": {
          "input": 0.95,
          "output": 4,
          "cache_read": 0.16
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-oss:20b": {
        "cost": {
          "input": 0.07,
          "output": 0.3,
          "cache_read": 0.035
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "gpt-oss:120b": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.014
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.3": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.3-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.5,
          "cache_read": 0.03
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.2": {
        "cost": {
          "input": 1.4,
          "output": 4.4,
          "cache_read": 0.26
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "gemma4:31b": {
        "cost": {
          "input": 0.14,
          "output": 0.4,
          "cache_read": 0.05
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4.1-flash:1017": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.003
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4.1-flash": {
        "cost": {
          "input": 0.15,
          "output": 0.6,
          "cache_read": 0.003
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-pro:0813": {
        "cost": {
          "input": 0.66,
          "output": 1.98,
          "cache_read": 0.022
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-pro": {
        "cost": {
          "input": 0.66,
          "output": 1.98,
          "cache_read": 0.022
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "alicode-intl": {
      "qwen3.7-plus": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3.6-plus": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3.5-plus": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-max-2026-01-23": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-coder-plus": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-coder-next": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k2.5": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-4.7": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "MiniMax-M2.5": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "alicode": {
      "qwen3.7-plus": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3.6-plus": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3.5-plus": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-max-2026-01-23": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-coder-plus": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3-coder-next": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k2.5": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-4.7": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "MiniMax-M2.5": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "alitp-intl": {
      "wan2.7-image": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "image"
        ]
      },
      "wan2.7-image-pro": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "image"
        ]
      },
      "qwen3.8-max": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video",
          "pdf"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3.8-max-preview": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3.8-flash": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3.7-plus": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3.7-max": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3.6-plus": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen3.6-flash": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "qwen-image-2.0": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "image"
        ]
      },
      "qwen-image-2.0-pro": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "image"
        ]
      },
      "kimi-k2.7-code": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k2.6": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-k2.5": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "happyhorse-1.1-t2v": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "video"
        ]
      },
      "happyhorse-1.1-r2v": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "image",
          "text"
        ],
        "output": [
          "video"
        ]
      },
      "happyhorse-1.1-i2v": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "image",
          "text"
        ],
        "output": [
          "video"
        ]
      },
      "glm-5": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.3": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.2": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "glm-5.1": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4.1-flash": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4.1-flash-1017": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-pro": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-pro-0813": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-flash": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v4-flash-0731": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "deepseek-v3.2": {
        "cost": {
          "input": 0,
          "output": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      },
      "MiniMax-M2.5": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text"
        ],
        "output": [
          "text"
        ]
      }
    },
    "kimi": {
      "kimi-for-coding": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "kimi-for-coding-highspeed": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "k3": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "k3.1-pro": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "k3.1-pro-highspeed": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image",
          "video"
        ],
        "output": [
          "text"
        ]
      },
      "k3-256k": {
        "cost": {
          "input": 0,
          "output": 0,
          "cache_read": 0,
          "cache_write": 0
        },
        "input": [
          "text",
          "image"
        ],
        "output": [
          "text"
        ]
      }
    }
  },
  "estimates": {
    "openai": [
      "gpt-3.5-turbo",
      "gpt-4",
      "o3-mini"
    ],
    "mistral": [
      "deepseek-v4-1-flash-1017",
      "devstral-2512",
      "devstral-latest",
      "devstral-medium-latest",
      "glm-5-2",
      "open-mistral-nemo",
      "zai-glm-5-2",
      "zai-glm-5-3"
    ],
    "groq": [
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "meta-llama/llama-prompt-guard-2-22m",
      "meta-llama/llama-prompt-guard-2-86m",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "openai/gpt-oss-safeguard-20b"
    ],
    "cohere": [
      "c4ai-aya-expanse-32b",
      "command-a-03-2025",
      "command-a-reasoning-08-2025",
      "command-a-translate-08-2025",
      "command-r-08-2024",
      "command-r-plus-08-2024",
      "command-r7b-12-2024",
      "command-r7b-arabic-02-2025"
    ],
    "openrouter": [
      "aion-labs/aion-2.0",
      "aion-labs/aion-3.0",
      "aion-labs/aion-3.0-mini",
      "aion-labs/aion-3.5",
      "aion-labs/aion-3.5-mini",
      "aion-labs/aion-rp-llama-3.1-8b",
      "amazon/nova-micro-v1",
      "anthracite-org/magnum-v4-72b",
      "cognitivecomputations/dolphin-mistral-24b-venice-edition",
      "cohere/command-a",
      "cohere/command-r-08-2024",
      "cohere/command-r-plus-08-2024",
      "cohere/command-r7b-12-2024",
      "deepseek/deepseek-chat",
      "deepseek/deepseek-chat-v3-0324",
      "deepseek/deepseek-chat-v3.1",
      "deepseek/deepseek-r1-0528",
      "deepseek/deepseek-v3.1-terminus",
      "deepseek/deepseek-v3.2",
      "deepseek/deepseek-v3.2-exp",
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4-flash-0731",
      "deepseek/deepseek-v4-pro",
      "deepseek/deepseek-v4-pro-0813",
      "google/gemma-2-27b-it",
      "gryphe/mythomax-l2-13b",
      "ibm-granite/granite-4.2-8b",
      "inception/mercury-2",
      "inception/mercury-2.5",
      "inception/mercury-3",
      "inclusionai/ling-3.0-flash",
      "inclusionai/ling-3.1-flash",
      "inference-net/schematron-v2-small",
      "inference-net/schematron-v2-turbo",
      "liquid/lfm-2.5-2.6b",
      "liquid/lfm-2.5-24b-a2b",
      "mancer/weaver",
      "meituan/longcat-2.0",
      "meta-llama/llama-3.1-70b-instruct",
      "meta-llama/llama-3.1-8b-instruct",
      "meta-llama/llama-3.2-1b-instruct",
      "meta-llama/llama-3.2-3b-instruct",
      "meta-llama/llama-3.3-70b-instruct",
      "microsoft/phi-4",
      "minimax/minimax-m1",
      "minimax/minimax-m2",
      "minimax/minimax-m2-her",
      "minimax/minimax-m2.1",
      "minimax/minimax-m2.5",
      "minimax/minimax-m2.7",
      "mistralai/mistral-nemo",
      "mistralai/mistral-small-24b-instruct-2501",
      "moonshotai/kimi-k2",
      "moonshotai/kimi-k2-0905",
      "moonshotai/kimi-k2-thinking",
      "morph/morph-v3-fast",
      "morph/morph-v3-large",
      "nousresearch/hermes-3-llama-3.1-405b",
      "nousresearch/hermes-3-llama-3.1-70b",
      "nousresearch/hermes-4-405b",
      "nvidia/nemotron-3-nano-30b-a3b",
      "nvidia/nemotron-3-super-120b-a12b",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/nemotron-3.5-lightning",
      "openai/gpt-3.5-turbo-0613",
      "openai/gpt-3.5-turbo-16k",
      "openai/gpt-4",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "openai/gpt-oss-safeguard-20b",
      "poolside/laguna-s-2.1",
      "poolside/laguna-xs-2.1",
      "qwen/qwen-2.5-72b-instruct",
      "qwen/qwen-2.5-7b-instruct",
      "qwen/qwen-2.5-coder-32b-instruct",
      "qwen/qwen3-14b",
      "qwen/qwen3-235b-a22b-2507",
      "qwen/qwen3-235b-a22b-thinking-2507",
      "qwen/qwen3-30b-a3b",
      "qwen/qwen3-30b-a3b-instruct-2507",
      "qwen/qwen3-32b",
      "qwen/qwen3-coder",
      "qwen/qwen3-coder-30b-a3b-instruct",
      "qwen/qwen3-coder-next",
      "qwen/qwen3-next-80b-a3b-instruct",
      "qwen/qwen3.8-2.4t-a95b",
      "reflection/beam-1.0-501b-a23b",
      "rekaai/reka-flash-3",
      "relace/relace-apply-3",
      "relace/relace-search",
      "sao10k/l3-lunaris-8b",
      "sao10k/l3.1-euryale-70b",
      "stepfun/step-3.5-flash",
      "tencent/hunyuan-a13b-instruct",
      "tencent/hy-mt2-1.8b",
      "tencent/hy-mt2-30b-a3b",
      "tencent/hy-mt2-7b",
      "tencent/hy3",
      "tencent/hy3-preview",
      "tencent/hy4-preview",
      "thedrummer/cydonia-24b-v4.1",
      "thedrummer/skyfall-36b-v2",
      "thedrummer/unslopnemo-12b",
      "undi95/remm-slerp-l2-13b",
      "upstage/solar-mini4",
      "upstage/solar-pro4",
      "writer/palmyra-x5",
      "xiaomi/mimo-v2.5-pro",
      "z-ai/glm-4.5",
      "z-ai/glm-4.5-air",
      "z-ai/glm-4.6",
      "z-ai/glm-4.7",
      "z-ai/glm-4.7-flash",
      "z-ai/glm-5",
      "z-ai/glm-5-turbo",
      "z-ai/glm-5.1",
      "z-ai/glm-5.2",
      "z-ai/glm-5.3",
      "z-ai/glm-5.3-prime",
      "~deepseek/deepseek-pro-latest",
      "~deepseek/deepseek-v4-flash-latest",
      "~z-ai/glm-latest"
    ],
    "vercel-ai-gateway": [
      "alibaba/qwen-3-14b",
      "alibaba/qwen-3-235b",
      "alibaba/qwen-3-30b",
      "alibaba/qwen-3-32b",
      "alibaba/qwen3-coder-30b-a3b",
      "alibaba/qwen3-coder-next",
      "alibaba/qwen3-next-80b-a3b-instruct",
      "alibaba/qwen3-next-80b-a3b-thinking",
      "cohere/command-a",
      "deepseek/deepseek-r1",
      "deepseek/deepseek-v3.1",
      "deepseek/deepseek-v3.2",
      "deepseek/deepseek-v3.2-thinking",
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4-flash-0731",
      "deepseek/deepseek-v4-pro",
      "deepseek/deepseek-v4-pro-0813",
      "inception/mercury-2",
      "inception/mercury-2.5",
      "inception/mercury-3",
      "inception/mercury-coder-small",
      "inclusionai/ling-3.0-flash",
      "inclusionai/ling-3.0-flash-fin",
      "inclusionai/ling-3.0-flash-sante",
      "inclusionai/ling-3.1-flash",
      "inference-net/schematron-v2-small",
      "inference-net/schematron-v2-turbo",
      "liquid/lfm2.5-24b-a2b",
      "meta/llama-3.1-70b",
      "meta/llama-3.1-8b",
      "meta/llama-3.3-70b",
      "mistral/codestral",
      "mistral/mistral-nemo",
      "mixedbread/toast-1",
      "moonshotai/kimi-k2",
      "morph/morph-v3-fast",
      "morph/morph-v3-large",
      "nvidia/nemotron-3-nano-30b-a3b",
      "nvidia/nemotron-3-super-120b-a12b",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/nemotron-3.5-lightning",
      "nvidia/nemotron-nano-9b-v2",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "openai/gpt-oss-safeguard-120b",
      "openai/gpt-oss-safeguard-20b",
      "openai/o3-mini",
      "poolside/laguna-s-2.1",
      "tencent/hy-mt2-lite",
      "tencent/hy-mt2-plus",
      "tencent/hy-mt2-pro",
      "tencent/hy3",
      "tencent/hy4-preview",
      "xiaomi/mimo-v2.5-pro",
      "zai/glm-4.5",
      "zai/glm-4.5-air",
      "zai/glm-4.6",
      "zai/glm-4.7",
      "zai/glm-4.7-flash",
      "zai/glm-4.7-flashx",
      "zai/glm-5",
      "zai/glm-5-turbo",
      "zai/glm-5.1",
      "zai/glm-5.2",
      "zai/glm-5.2-fast",
      "zai/glm-5.3",
      "zai/glm-5.3-fast"
    ],
    "chutes": [
      "deepseek-ai/DeepSeek-V3.2-TEE",
      "deepseek-ai/DeepSeek-V4-Flash-0731-TEE",
      "zai-org/GLM-5.1-TEE",
      "zai-org/GLM-5.2-TEE"
    ],
    "cloudflare-ai": [
      "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
      "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
      "@cf/deepseek-ai/deepseek-v4-flash-0731",
      "@cf/deepseek-ai/deepseek-v4-pro-0813",
      "@cf/ibm-granite/granite-4.0-h-micro",
      "@cf/meta/llama-3.1-8b-instruct-fp8",
      "@cf/meta/llama-3.2-1b-instruct",
      "@cf/meta/llama-3.2-3b-instruct",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/meta/llama-guard-3-8b",
      "@cf/nvidia/nemotron-3-120b-a12b",
      "@cf/openai/gpt-oss-120b",
      "@cf/openai/gpt-oss-20b",
      "@cf/qwen/qwen2.5-coder-32b-instruct",
      "@cf/qwen/qwen3-30b-a3b-fp8",
      "@cf/qwen/qwq-32b",
      "@cf/zai-org/glm-4.7-flash",
      "@cf/zai-org/glm-5.2",
      "@cf/zai-org/glm-5.3"
    ],
    "together": [
      "LiquidAI/LFM2-24B-A2B",
      "MiniMaxAI/MiniMax-M2.5",
      "MiniMaxAI/MiniMax-M2.7",
      "Qwen/Qwen2.5-7B-Instruct-Turbo",
      "Qwen/Qwen3-235B-A22B-Instruct-2507-tput",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
      "Qwen/Qwen3-Coder-Next-FP8",
      "Qwen/Qwen3.6-Plus",
      "Qwen/Qwen3.7-Max",
      "deepseek-ai/DeepSeek-R1",
      "deepseek-ai/DeepSeek-V3",
      "deepseek-ai/DeepSeek-V3-1",
      "deepseek-ai/DeepSeek-V4-Flash-0731",
      "deepseek-ai/DeepSeek-V4-Pro-0813",
      "essentialai/Rnj-1-Instruct",
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "openai/gpt-oss-120b",
      "reflection/Beam-1.0-501B-A23B",
      "zai-org/GLM-5",
      "zai-org/GLM-5.1",
      "zai-org/GLM-5.2",
      "zai-org/GLM-5.3"
    ],
    "fireworks": [
      "accounts/fireworks/models/glm-5p3",
      "accounts/fireworks/models/gpt-oss-120b",
      "accounts/fireworks/models/minimax-m3",
      "accounts/fireworks/models/nemotron-3-ultra-nvfp4",
      "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
      "accounts/fireworks/models/qwen3p8-2p4t-a95b",
      "accounts/fireworks/routers/glm-5p3-fast",
      "accounts/fireworks/routers/glm-5p3-spot",
      "accounts/fireworks/routers/glm-fast-latest",
      "accounts/fireworks/routers/glm-latest",
      "accounts/fireworks/routers/minimax-latest"
    ],
    "nebius": [
      "MiniMaxAI/MiniMax-M3",
      "Qwen/Qwen3-235B-A22B-Instruct-2507",
      "Qwen/Qwen3-30B-A3B-Instruct-2507",
      "Qwen/Qwen3.5-397B-A17B",
      "deepseek-ai/DeepSeek-V4-Flash-0731",
      "deepseek-ai/DeepSeek-V4-Pro",
      "deepseek-ai/DeepSeek-V4-Pro-0813",
      "moonshotai/Kimi-K2.7-Code",
      "nvidia/Nemotron-3-Ultra-550b-a55b",
      "nvidia/Nemotron-3_5-Lightning",
      "nvidia/nemotron-3-super-120b-a12b",
      "reflection/beam",
      "zai-org/GLM-5.2",
      "zai-org/GLM-5.3"
    ],
    "cerebras": [
      "gpt-oss-120b"
    ],
    "siliconflow": [
      "ByteDance-Seed/Seed-OSS-36B-Instruct",
      "MiniMaxAI/MiniMax-M2.5",
      "Qwen/Qwen2.5-72B-Instruct",
      "Qwen/Qwen2.5-7B-Instruct",
      "Qwen/Qwen3-14B",
      "Qwen/Qwen3-30B-A3B-Instruct-2507",
      "Qwen/Qwen3-32B",
      "Qwen/Qwen3-8B",
      "Qwen/Qwen3-Coder-30B-A3B-Instruct",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct",
      "Qwen/Qwen3.5-397B-A17B",
      "Qwen/Qwen3.8-2.4T-A95B",
      "deepseek-ai/DeepSeek-R1",
      "deepseek-ai/DeepSeek-V3",
      "deepseek-ai/DeepSeek-V3.1",
      "deepseek-ai/DeepSeek-V3.1-Terminus",
      "deepseek-ai/DeepSeek-V3.2",
      "deepseek-ai/DeepSeek-V3.2-Exp",
      "deepseek-ai/DeepSeek-V4-Flash",
      "deepseek-ai/DeepSeek-V4-Flash-0731",
      "deepseek-ai/DeepSeek-V4-Pro",
      "deepseek-ai/DeepSeek-V4-Pro-0813",
      "inclusionAI/Ling-flash-2.0",
      "meituan-longcat/LongCat-2.0",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "stepfun-ai/Step-3.5-Flash",
      "tencent/Hunyuan-A13B-Instruct",
      "tencent/Hy3",
      "zai-org/GLM-4.5-Air",
      "zai-org/GLM-5"
    ],
    "xiaomi-mimo": [
      "mimo-v2.5-pro",
      "mimo-v2.5-pro-ultraspeed"
    ],
    "venice": [
      "abliteration-abliterated-model-large-v2",
      "aion-labs-aion-3-0",
      "aion-labs-aion-3-0-mini",
      "aion-labs-aion-3-5",
      "aion-labs-aion-3-5-mini",
      "deepseek-v3.2",
      "deepseek-v4-flash",
      "deepseek-v4-flash-0731",
      "deepseek-v4-flash-0731-fast",
      "deepseek-v4-pro",
      "deepseek-v4-pro-0813",
      "hermes-3-llama-3.1-405b",
      "hy4-preview",
      "llama-3.2-3b",
      "llama-3.3-70b",
      "mercury-2",
      "mercury-2-5",
      "mercury-3",
      "minimax-m25",
      "minimax-m27",
      "nvidia-nemotron-3-nano-30b-a3b",
      "nvidia-nemotron-3-ultra-550b-a55b",
      "olafangensan-glm-4.7-flash-heretic",
      "openai-gpt-52",
      "openai-gpt-oss-120b",
      "qwen-3-8-2-4t-a95b",
      "qwen3-235b-a22b-instruct-2507",
      "qwen3-235b-a22b-thinking-2507",
      "qwen3-coder-480b-a35b-instruct-turbo",
      "qwen3-next-80b",
      "z-ai-glm-5-3",
      "z-ai-glm-5-turbo",
      "zai-org-glm-4.6",
      "zai-org-glm-4.7",
      "zai-org-glm-5",
      "zai-org-glm-5-1",
      "zai-org-glm-5-2"
    ]
  }
};
