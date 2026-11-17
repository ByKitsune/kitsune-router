# GPT‑6.2 Sol and Astra

Kitsune Router accepts the exact model IDs `gpt-6.2-sol` and `gpt-6.2-astra` on three routes. Select the provider explicitly when you configure a client.

| Route prefix | Connection | Upstream inference |
| --- | --- | --- |
| `openai/` | OpenAI project API key | `api.openai.com/v1/responses` |
| `cx/` or `codex/` | OpenAI Codex OAuth | `chatgpt.com/backend-api/codex/responses` |
| `opencode-zen/` | OpenCode Zen API key | `opencode.ai/inference/openai/v1/responses` |

Send `reasoning.effort` on `/v1/responses`. Kitsune translates Chat Completions clients to Responses, since GPT‑6.2 tool calls use that protocol. The wire accepts `low`, `medium`, `high`, `xhigh`, and `max`. The OpenAI API defaults to `medium`. The Codex CLI defaults to `low`. Its `ultra` option invokes Codex's multi-agent orchestration and maps ordinary inference to `xhigh`. Processing speed is controlled separately by `service_tier`. [OpenAI Responses reference](https://developers.openai.com/api/reference/resources/responses/methods/create), [Codex CLI model catalog](https://github.com/openai/codex/blob/8fca6ffb92a602875a0b97e3e535eb48375bdd8c/codex-rs/models-manager/models.json)

The Responses route carries parallel function calls and preserves native prompt cache options. Codex requests support mid-turn `configuration_update` items and encrypted reasoning continuity. A caller can request a reasoning summary explicitly. [OpenAI API guide](https://developers.openai.com/api/docs/guides/latest-model), [Codex request builder](https://github.com/openai/codex/blob/8fca6ffb92a602875a0b97e3e535eb48375bdd8c/codex-rs/core/src/client.rs#L1166)

The router publishes 1,050,000 context, 922,000 maximum input, and 128,000 maximum output tokens for both models on the OpenAI and Codex routes. On Codex routes, these fields are OpenAI model-specification references. Account-specific limits remain unverified. The Codex guide describes support for up to 1 million context tokens on both models. The CLI defaults to 500,000 on Sol and 272,000 on Astra, and allows overrides up to 872,000. Discovery retains these CLI values under `metadata.limits`. [models.dev catalog](https://models.dev/api.json), [OpenAI API guide](https://developers.openai.com/api/docs/guides/latest-model), [Codex model guide](https://learn.chatgpt.com/docs/models), [Codex CLI bundled model catalog](https://github.com/openai/codex/blob/7066a55a7b94345757758385a538c72fda571b84/codex-rs/models-manager/models.json)

The Codex route accepts text and image input and returns text. The Codex catalog lists web search, parallel tool calls, and opt-in reasoning summaries for both models, with `low` as the default reasoning effort. The OpenAI model cards also document PDF input and Pro reasoning on Responses. [Codex CLI bundled model catalog](https://github.com/openai/codex/blob/7066a55a7b94345757758385a538c72fda571b84/codex-rs/models-manager/models.json), [Sol model card](https://developers.openai.com/api/docs/models/gpt-6.2-sol), [Astra model card](https://developers.openai.com/api/docs/models/gpt-6.2-astra)

OpenAI lists knowledge cutoffs of June 1, 2026 for Sol and May 18, 2026 for Astra. [Sol model card](https://developers.openai.com/api/docs/models/gpt-6.2-sol), [Astra model card](https://developers.openai.com/api/docs/models/gpt-6.2-astra)

## Pro reasoning on the OpenAI API

Set `reasoning.mode` to `pro` on `/v1/responses` with `openai/gpt-6.2-astra` or `openai/gpt-6.2-sol`. Both model IDs default to `standard`. Choose `reasoning.effort` separately, and use `service_tier` to request a processing speed. Chat Completions has no `reasoning.mode` field. The public OpenAI API documents these modes for its Responses transport. [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning#reasoning-mode), [Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create)

```json
{
  "model": "openai/gpt-6.2-astra",
  "input": "Review this migration plan and identify failure modes.",
  "reasoning": { "mode": "pro", "effort": "medium" }
}
```

Pro execution combines model work for the final answer. OpenAI bills the resulting tokens at the model's published rates, so increased token usage can increase the cost and latency. Use the returned usage counters to estimate the request cost. [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning#reasoning-mode), [OpenAI token pricing](https://developers.openai.com/api/docs/pricing)

## Recorded costs

OpenAI Standard and the captured Zen text prices are in USD per million tokens. Cached input and cache writes each have their own rates.

| Model | Input | Cached input | Output | 30-minute write | 12-hour write |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sol, up to 272,000 input tokens | $2 | $0.10 | $10 | $2.50 | $5 |
| Sol, above 272,000 input tokens | $4 | $0.20 | $15 | $5 | $10 |
| Astra, up to 272,000 input tokens | $8 | $0.40 | $40 | $10 | $20 |
| Astra, above 272,000 input tokens | $16 | $0.80 | $60 | $20 | $40 |

The long-context rate applies to the full request. For Fast and Ultrafast, use the rate for the delivered tier. [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), [Processing speed](PROCESSING-SPEED.md), [Zen model catalog](https://opencode.ai/zen/v1/models)

OpenAI's public background Responses beta offers 30% below Standard token rates with `background_options.completion_window: "2h"` and 40% below Standard with `"8h"`. These windows require an eligible Standard background request and an application that retrieves the stored response. Use the direct OpenAI API to submit and retrieve these jobs. [Background Responses guide](https://developers.openai.com/api/docs/guides/background#use-discounted-completion-windows), [Completion window pricing](https://developers.openai.com/api/docs/pricing#background-completion-windows)

The Codex credit rate card for Business, Enterprise and Edu publishes 50 input, 2.5 cached-input and 250 output credits per million tokens on Sol, and 200, 10 and 1,000 on Astra. Subscription usage, purchased credits, and account eligibility can have different terms. The dashboard keeps the route's USD cost unknown when no monetary tariff is established. [ChatGPT credit rate card](https://help.openai.com/en/articles/11481834-chatgpt-rate-card-business-enterpriseedu-credit-based-pricing)

## OpenCode catalog refresh

The bundled OpenCode catalogs were captured on November 18, 2026 Jakarta time. They cover 76 paid Zen routes, 12 listed Zen Free routes and 32 Go routes. Go token rates describe plan allowance. Saved routes can resolve their previously configured model IDs. To refresh both bundled catalogs from OpenCode's public APIs, run `bun scripts/refresh-opencode-catalog.mjs`. The generator records the source digest and retains the prior catalog if either response fails validation. [Go model catalog](https://opencode.ai/zen/go/v1/models), [Go plan](https://opencode.ai/v2/docs/console/go/)
