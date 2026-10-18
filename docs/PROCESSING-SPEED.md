# Processing speed: Standard, Fast and Ultrafast

Reviewed against OpenAI and OpenCode sources on **2026-10-19**. Processing speed
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

Omitting `service_tier` first allows the saved Zen provider default to apply.
Auto is not a guarantee of Standard billing. Choose **Standard** to opt out of a
paid default. Speed does not create a new model ID, lower reasoning effort or
grant permission to exceed model limits.

With several active Codex accounts, one account's missing tier is not proof
that every account lacks it. Provider-wide model rows keep account eligibility
unverified unless they have an applicable account-specific declaration. Testing
one selection also does not validate a later, different selection.

### Request examples

Use a Zen API key, not the upstream account's OAuth token:

```bash
curl http://localhost:20128/v1/responses \
  -H "Authorization: Bearer $ZENROUTER_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "codex/gpt-6.1-sol",
    "input": "Explain this function",
    "reasoning": {"effort": "high"},
    "service_tier": "ultrafast"
  }'
```

Use `openai/gpt-6.1-sol` to route through the public API instead of a Codex
subscription. For Fast, set `service_tier` to `fast`; for Standard, use `default`.
Prefer `/v1/responses` when selecting Ultrafast. A successful request does not by
itself prove that the upstream delivered the requested speed tier.

## Eligibility and cost

- Public API Ultrafast is currently documented for **GPT-6 Astra** and **GPT-6.1
  Sol** using Responses. API model access, region and rate limits still apply.
- Codex Ultrafast requires a supported model and an eligible **Pro $500** or
  Enterprise/Edu arrangement. Enterprise workspace permission is separate and
  disabled by default. Generic `pro` membership or buying credits is not proof
  of access. Unknown eligibility is unverified, not a promise of support.
- Fast and Ultrafast can cost substantially more. For public GPT-6.1 Sol at
  short context, documented input/output rates are $2/$10 Standard, $4/$20 Fast
  and $12/$60 Ultrafast per million tokens. Other models, long context, caching
  and residency have separate rates; do not apply a universal multiplier.
- Subscription Fast uses 2.5× included usage or 2× purchased credits/PAYG;
  Ultrafast uses 8× included usage or 6× purchased credits/PAYG. These are not
  throughput guarantees and are not public API prices.
- Preserve the upstream's actual `service_tier` separately from the requested
  tier. Fast may be downgraded to Standard upstream. Missing actual-tier data
  must not be presented as confirmed premium delivery or used to invent an
  invoice. Operator pricing overrides remain separate from upstream charges.

**Estimator limitation:** Zen records requested and actual tiers, but its
pricing repository does not yet offer tier-specific tariffs. Nonstandard or
unconfirmed delivery therefore has an **unknown (`null`) estimated cost**, not
zero and not the Standard price. Existing Standard/default estimates remain
estimates, not authoritative invoices; use the upstream billing dashboard.

## OpenCode V2

Use a Responses-compatible custom provider for the gateway. This example keeps
reasoning high while exposing independent speed variants:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "zen": {
      "name": "ZenRouter",
      "env": ["ZENROUTER_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible/responses",
      "settings": {
        "baseURL": "http://localhost:20128/v1",
        "transport": "http",
      },
      "models": {
        "sol": {
          "modelID": "codex/gpt-6.1-sol",
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
opencode run --model zen/sol#ultrafast "Explain this function"
```

The V2 root model default does not retain a variant. Its native Responses
serializer also supports semantic `settings.serviceTier`; the raw
`body.service_tier` example avoids assuming that a Chat serializer lowers that
semantic option. A variant merely named `fast` with low reasoning is not Fast
service. Preserve unrelated configuration and never put upstream OAuth secrets
in this file.

## Sources

- [OpenAI Fast](https://developers.openai.com/api/docs/guides/fast-mode),
  [Ultrafast](https://developers.openai.com/api/docs/guides/ultrafast-mode),
  [pricing](https://developers.openai.com/api/docs/pricing) and
  [dated changelog](https://developers.openai.com/api/docs/changelog).
- [Codex speed](https://developers.openai.com/codex/agent-configuration/speed).
- [OpenCode V2 providers](https://opencode.ai/v2/docs/providers) and
  [models/variants](https://opencode.ai/v2/docs/models).
- Source pins: OpenCode `501b15af26915ba52682e20e220e7e137e89e92f`, Codex
  `8c076942cb70fba8e5c4732c23f1faabc4aed484`, OpenAI Node
  `3a3b8521a9278d68120c9256a0de4075acb82d80` (all October 18).
