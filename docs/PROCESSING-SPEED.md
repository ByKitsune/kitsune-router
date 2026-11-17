# Processing speed: Standard, Fast and Ultrafast

Reviewed against OpenAI and OpenCode sources on **2026-11-18 WIB**. Processing speed
is independent of reasoning effort: `reasoning.effort: "high"` can be used with
Standard, Fast or Ultrafast. An effort named `ultra` is not Ultrafast service.

## Select a speed

The OpenAI and Codex provider pages expose a **Processing speed** control beside
the thinking control. It stores a provider default. An explicit request's
`service_tier` takes precedence, including an explicit Auto or Standard choice.

| Selection | Public OpenAI API | Codex / ChatGPT OAuth |
| --- | --- | --- |
| Auto | Inherit upstream/project defaults; may use paid Fast | Inherit an advertised model default, if available |
| Standard | `service_tier: "default"` | Explicitly select Standard, omitting the upstream field |
| Fast | `service_tier: "fast"`; `priority` is an accepted alias | `service_tier: "priority"` |
| Ultrafast | `service_tier: "ultrafast"`, Responses endpoint only | `service_tier: "ultrafast"`, subject to account/model permission |

Omitting `service_tier` first allows the saved Kitsune Router provider default to apply.
Auto is not a guarantee of Standard billing. Choose **Standard** to opt out of a
paid default. Speed does not create a new model ID, lower reasoning effort or
grant permission to exceed model limits.

With several active Codex accounts, one account's missing tier is not proof
that every account lacks it. Provider-wide model rows keep account eligibility
unverified unless they have an applicable account-specific declaration. Testing
one selection also does not validate a later, different selection.

### Request examples

Use an issued Kitsune Router API key, not the upstream account's OAuth token. `KITSUNE_ROUTER_API_KEY` is a client-side environment variable containing that key:

```bash
curl http://localhost:20128/v1/responses \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openai/gpt-6.2-sol",
    "input": "Explain this function",
    "reasoning": {"effort": "high"},
    "max_output_tokens": 128000,
    "prompt_cache_options": {"ttl": "30m"},
    "service_tier": "ultrafast"
  }'
```

For Fast, set `service_tier` to `fast`. For Standard, use `default`. OpenAI API
Ultrafast uses `/v1/responses`. Read `service_tier` from the upstream response
to confirm the delivered speed. Use `codex/gpt-6.2-sol` for Codex OAuth and its
account-specific settings. [Fast mode](https://developers.openai.com/api/docs/guides/fast-mode),
[Ultrafast mode](https://developers.openai.com/api/docs/guides/ultrafast-mode).

### Model limits and published quotes

OpenAI's published model limits and tier quotes appear under
`metadata.processingTiers` in `/v1/models` and `/v1/models/info`. The `default`,
`fast`, and `ultrafast` entries carry the model's context, input, and output
limits and the published rate for that speed. OpenAI publishes a 1,050,000-token
window for GPT-6.2 Sol and Astra, with up to 922,000 input and 128,000 output
tokens. Older GPT models use their own documented ceilings. `metadata.limits`
includes documented prompt-cache controls and default reasoning effort. Above
272,000 input tokens, the applicable long-context rate covers the full request.
GPT-5.4 requests above that boundary are processed at Standard rates when Fast
is requested. [GPT-6.2 model guide](https://developers.openai.com/api/docs/guides/latest-model),
[GPT-5.4 model guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.4),
[OpenAI API pricing](https://developers.openai.com/api/docs/pricing).

## Eligibility and cost

- Public API Ultrafast is documented for **GPT-6.2 Sol**, **GPT-6.2 Astra**,
  **GPT-6 Astra**, and **GPT-6.1 Sol** using Responses. API access depends on
  the account, region, and rate limits. GPT-6.2 supports US and EU data
  residency with Fast and US data residency with Ultrafast. [OpenAI Fast mode](https://developers.openai.com/api/docs/guides/fast-mode),
  [OpenAI Ultrafast mode](https://developers.openai.com/api/docs/guides/ultrafast-mode).
- Codex Ultrafast for GPT-6.2 Sol is available to Pro $200, Pro $500, and
  eligible Enterprise/Edu accounts. GPT-6.2 Astra requires Pro $500 or eligible
  Enterprise/Edu access. Workspace permission and regional availability also
  apply. The connected account's advertised eligibility controls routing.
- Fast and Ultrafast can cost substantially more. For public GPT-6.1 Sol at
  short context, documented input/output rates are $2/$10 Standard, $4/$20 Fast
  and $12/$60 Ultrafast per million tokens. Other models, long context, caching
  and residency have separate rates; do not apply a universal multiplier.
- GPT-6.2 Codex Fast uses 2× subscription credits. Ultrafast uses 6× included
  usage. For eligible purchased credits, the introductory Ultrafast rate is
  3× through February 28, 2027 Pacific Time, then 6×. Older models and legacy
  billing have separate multipliers.
- Preserve the upstream's actual `service_tier` separately from the requested
  tier. Fast may be downgraded to Standard upstream. Missing actual-tier data
  must not be presented as confirmed premium delivery or used to invent an
  invoice. Operator pricing overrides remain separate from upstream charges.

Kitsune Router records the requested and delivered tiers separately. `priority`
uses the Fast quote. The delivered tier determines input, output, cache-read,
and native 30-minute and 12-hour cache-write rates. Each used component needs
its own published rate or operator override for a complete estimate.

Actual `auto` is a selection-policy echo, not confirmed delivery. Missing or
unconfirmed premium delivery therefore remains **unknown (`null`)**, never zero
or assumed Standard. A group's known recorded subtotal can be shown separately
with its unpriced count. Recovery of a missing historical cost requires a
verified rate for the request timestamp. Native OpenAI and Anthropic cache
writes have separate lifetime schedules. A missing lifetime split leaves the
cache-write cost unknown.

Public API premium prices are **not** automatically applied to Codex subscription
or arbitrary reseller routes. An operator can supply a local tier-specific
estimate; subscription credit/usage multipliers do not become USD invoices.
Existing Standard/default estimates remain estimates; use the upstream billing
dashboard for actual charges. See the [October reconciliation](audit/17-october-reconciliation-2026-10.md).

### GPT-6.2 Sol and Astra

For both models, the public API prices Fast at 2× Standard and Batch at half
the Standard rate. Ultrafast costs 3× through February 28, 2027 Pacific Time
and 6× afterward. Each tier has its own short-context, long-context, and cache
tariffs. [GPT-6.2 routes and Standard rates](GPT-6.2.md),
[OpenAI API pricing](https://developers.openai.com/api/docs/pricing).

### GPT-6.1 Terra public API reference

The 2026-10-29 source follow-up records separate public OpenAI API quotes for
`gpt-6.1-terra`. Values below are USD per million tokens, excluding regional
processing uplift. Cached input is a subset of input, not an additional charge.

| Delivered tier | Input / cached input / output, up to 272,000 input tokens | Input / cached input / output, above 272,000 input tokens |
| --- | --- | --- |
| Standard | $1 / $0.05 / $5 | $2 / $0.10 / $7.50 |
| Fast | $2 / $0.10 / $10 | $4 / $0.20 / $15 |
| Flex | $0.50 / $0.025 / $2.50 | $1 / $0.05 / $3.75 |

Exactly 272,000 input tokens uses the first column; above that boundary, the
higher rates apply to the entire request. Native 30-minute and 12-hour cache-write
rates remain separate from cached reads. Fast and Flex depend on actual delivery;
unsupported or unconfirmed tiers do not acquire a Standard quote. The Terra speed
selector offers Auto, Standard and Fast; Flex can be requested with
`service_tier: "flex"`. Public API Ultrafast is unsupported for this model. The
estimator does **not** automatically apply the documented 10% regional processing
uplift, so its global-rate estimate can differ from an eligible regional endpoint's
bill. Account eligibility and the upstream invoice remain separate. These public
API quotes do not establish Codex subscription charges.

The gateway selects Responses for the OpenAI Terra route, including tool-bearing
Chat requests. The public API specification lists 1,050,000 total context,
922,000 maximum input and 128,000 maximum output tokens; those numbers are not
verified Codex backend limits. See the [source follow-up](audit/21-upstream-9router-2026-10-29.md#2026-10-29-source-follow-up).

## OpenCode V2

Use a Responses-compatible custom provider for the gateway. This example keeps
reasoning high while exposing independent speed variants:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "kitsunerouter": {
      "name": "Kitsune Router",
      "env": ["KITSUNE_ROUTER_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible/responses",
      "settings": {
        "baseURL": "http://localhost:20128/v1",
        "transport": "http",
      },
      "models": {
        "sol": {
          "modelID": "codex/gpt-6.2-sol",
          "body": { "reasoning": { "effort": "high" } },
          "variants": [
            { "id": "standard", "body": { "service_tier": "default" } },
            { "id": "fast", "body": { "service_tier": "fast" } },
            { "id": "ultrafast", "body": { "service_tier": "ultrafast" } },
          ],
        },
      },
    },
  },
}
```

Select a variant for the session or run:

```bash
opencode run --model kitsunerouter/sol#ultrafast "Explain this function"
```

The V2 root model default does not retain a variant. Its native Responses
serializer also supports semantic `settings.serviceTier`; the raw
`body.service_tier` example avoids assuming that a Chat serializer lowers that
semantic option. A variant merely named `fast` with low reasoning is not Fast
service. Preserve unrelated configuration and never put upstream OAuth secrets
in this file.

## Sources

These dated protocol/pricing references do not establish live-provider verification or package/production status. See [release status](CHANGELOG_v1.0.2.md) and [migration](MIGRATION.md).

- [OpenAI Fast](https://developers.openai.com/api/docs/guides/fast-mode),
  [Ultrafast](https://developers.openai.com/api/docs/guides/ultrafast-mode),
  [pricing](https://developers.openai.com/api/docs/pricing) and
  [dated changelog](https://developers.openai.com/api/docs/changelog).
- [GPT-6.1 Terra model reference](https://developers.openai.com/api/docs/models/gpt-6.1-terra.md)
  and [regional processing](https://developers.openai.com/api/docs/guides/your-data.md),
  captured separately from the October 19 speed review.
- [Codex speed](https://developers.openai.com/codex/agent-configuration/speed).
- [OpenCode V2 providers](https://opencode.ai/v2/docs/providers) and
  [models/variants](https://opencode.ai/v2/docs/models).
- Source pins: OpenCode `501b15af26915ba52682e20e220e7e137e89e92f`, Codex
  `8c076942cb70fba8e5c4732c23f1faabc4aed484`, OpenAI Node
  `3a3b8521a9278d68120c9256a0de4075acb82d80` (all October 18).
