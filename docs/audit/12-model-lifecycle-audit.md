# Whole-catalog model lifecycle audit — 2026-10-16

## Scope and publication state

This report inventories every active source provider and model/voice declaration, not just
connected production accounts. Its identity is the literal `(provider, service kind, model ID)`;
the same classifier is used for the immutable v0.9.10 baseline and the corrected working tree.

The npm, Docker Hub, GHCR and GitHub v0.9.10 artifacts are published. Docker publication was
completed by workflow run 38906776305 from commit `4e89e102`. No existing release tag, tarball,
image version, production configuration or credential was overwritten by this audit.

The lifecycle and TTFT corrections on master are **not yet published**. Read-only production
checks now report 0.9.10; the old reports claiming production remains on 0.9.7 are stale.
This session did not deploy or restart production.

## Reproducible inventory

Run the network-free inventory with a downloaded public snapshot:

```bash
node scripts/audit-model-lifecycle.mjs /absolute/path/models-dev.json \
  --baseline 4e89e102e339dcaef4511ea43af19cabc2cb9c4a > lifecycle-report.json
```

Complete per-row data, provider dispositions, inactive definitions, exact matches, source
hashes and baseline/final differences are in [the JSON ledger](model-lifecycle-2026-10-16.json).


| Surface | Count |
|---|---:|
| Active providers | 120 |
| Active model rows | 1245 |
| Auxiliary model declarations | 52 |
| Voice declarations/assignments (not unique model IDs) | 277 |
| Metadata-only references | 8 |
| Total inventoried rows | 1582 |
| Active providers with no main-table model row | 25 |
| Disk-only, unimported definitions | 3 |

All row dispositions reconcile exactly. None is silently dropped because the provider is
inactive, lacks a connection, has no exact models.dev match, or is a media/voice table.

| Disposition | Count |
|---|---:|
| `source-flagged-deprecated` | 15 |
| `eligibility-restricted` | 6 |
| `modelsdev-deprecated-candidate` | 20 |
| `metadata-reference-only` | 8 |
| `unverified` | 1533 |

**Unverified is an explicit result, not a pass.** The inventory covers all 120 active
providers, but it does not establish live availability or entitlement for every account.
The 20 models.dev flags below are candidates, not confirmed shutdowns. Source flags may
mean an old compatibility alias or a plan-specific removal rather than a globally dead model.

## Correction: Gemini prior-use eligibility is not shutdown

Google's [official lifecycle notice](https://ai.google.dev/gemini-api/docs/deprecations?hl=en)
says: “These models are not deprecated and will continue to be served until further notice
through the API.” Access to the 2.5 family is restricted to prior active users, with no
announced shutdown date. The earlier repeated 404s for new users did **not** justify globally
hiding `gemini-2.5-pro` or `gemini-2.5-flash-lite`.

The correction restores those identities for existing eligible accounts, preserves the
restriction as account-scoped metadata, and prevents Google API project eligibility from
being asserted as Gemini CLI route entitlement. Behavior tests exercise actual chat,
STT and vision discovery. No paid inference is needed to establish this source distinction.

## Existing source-level flags

| Provider | Kind | Literal model ID | Meaning |
|---|---|---|---|
| `clinepass` | `llm` | `cline-pass/glm-5.2` | unspecified-deprecation |
| `clinepass` | `llm` | `cline-pass/kimi-k2.7-code` | unspecified-deprecation |
| `clinepass` | `llm` | `cline-pass/kimi-k2.6` | unspecified-deprecation |
| `clinepass` | `llm` | `cline-pass/deepseek-v4-flash` | unspecified-deprecation |
| `codebuddy-cn` | `llm` | `glm-5.0` | unspecified-deprecation |
| `codebuddy-cn` | `llm` | `glm-4.7` | unspecified-deprecation |
| `codebuddy-cn` | `llm` | `glm-5v-turbo` | unspecified-deprecation |
| `codebuddy-cn` | `llm` | `kimi-k2.7` | unspecified-deprecation |
| `codebuddy-cn` | `llm` | `kimi-k2.6` | unspecified-deprecation |
| `deepseek` | `llm` | `deepseek-v4-flash` | compatibility-alias |
| `deepseek` | `llm` | `deepseek-v4-flash-vision-exp` | compatibility-alias |
| `perplexity` | `llm` | `sonar-pro` | unspecified-deprecation |
| `perplexity` | `llm` | `sonar` | unspecified-deprecation |
| `perplexity` | `llm` | `sonar-reasoning-pro` | unspecified-deprecation |
| `perplexity` | `llm` | `sonar-deep-research` | unspecified-deprecation |

Provider display `RISK_NOTICE` is recorded separately and never treated as model retirement.
An absent live listing or a 401/402/403/429 alone is not shutdown evidence.

## Exact models.dev candidates requiring provider evidence

No namespace is stripped to manufacture a match; OAuth/code-assist and regional-plan routes
are not equated with direct vendor APIs. The snapshot has 231 provider objects and SHA256
`dbd25d4e6b96c6513e2bae57a86df2598ec1e7f28560cccf2af59bbe4a2ab1e7`.

| Provider | Kind | Literal model ID | Disposition |
|---|---|---|---|
| `nvidia` | `llm` | `minimaxai/minimax-m2.7` | Needs provider lifecycle corroboration |
| `nvidia` | `llm` | `minimaxai/minimax-m3` | Needs provider lifecycle corroboration |
| `nvidia` | `llm` | `z-ai/glm-5.2` | Needs provider lifecycle corroboration |
| `nvidia` | `llm` | `deepseek-ai/deepseek-v4-pro` | Needs provider lifecycle corroboration |
| `nvidia` | `llm` | `deepseek-ai/deepseek-v4-pro-0813` | Needs provider lifecycle corroboration |
| `nvidia` | `llm` | `deepseek-ai/deepseek-v4-flash` | Needs provider lifecycle corroboration |
| `nvidia` | `llm` | `moonshotai/kimi-k2.6` | Needs provider lifecycle corroboration |
| `openai` | `llm` | `gpt-4-turbo` | Scheduled shutdown 2026-10-23; not yet shut down |
| `openai` | `llm` | `gpt-4.1-nano` | Scheduled shutdown 2026-10-23; not yet shut down |
| `openai` | `llm` | `o3-mini` | Scheduled shutdown 2026-10-23; not yet shut down |
| `openai` | `llm` | `o4-mini` | Scheduled shutdown 2026-10-23; not yet shut down |
| `openai` | `llm` | `o1` | Scheduled shutdown 2026-10-23; not yet shut down |
| `openai` | `llm` | `o1-pro` | Scheduled shutdown 2026-10-23; not yet shut down |
| `openai` | `image` | `gpt-image-1` | Scheduled shutdown 2026-10-23; not yet shut down |
| `vertex` | `llm` | `gemini-3.6-flash` | Needs provider lifecycle corroboration |
| `vertex` | `llm` | `gemini-2.5-pro` | Needs provider lifecycle corroboration |
| `vertex` | `llm` | `gemini-2.5-flash` | Needs provider lifecycle corroboration |
| `vertex` | `llm` | `gemini-2.5-flash-lite` | Needs provider lifecycle corroboration |
| `xiaomi-mimo` | `llm` | `mimo-v2.5-pro` | Needs provider lifecycle corroboration |
| `xiaomi-mimo` | `llm` | `mimo-v2.5` | Needs provider lifecycle corroboration |

The [OpenAI primary notice](https://developers.openai.com/api/docs/deprecations.md)
confirms the seven OpenAI candidates above are deprecated with shutdown scheduled for
2026-10-23. On this audit date they must **not** be represented as already shut down.
API-only dates do not establish Codex or reseller entitlement. NVIDIA, Vertex and Xiaomi
candidates still require their own route-specific corroboration; no blind catalog purge was performed.

## Remaining verification

- Three unimported definitions (`devin-cli`, `trae`, `windsurf`) are listed but not executed or enabled.
- Voice assignments are inventoried separately and are not counted as LLM model additions/removals.
- Most providers have no reviewed exact-route upstream mapping; their unknown rows remain visible in the ledger.
- models.dev is a catalog cross-check, not a blanket authority for retirement or user entitlement.
- First-byte versus semantic-token timing and legacy rolling metrics/counter semantics are tracked separately from model lifecycle.
- Published 0.9.10 remains immutable; corrections require a future explicit release, not retagging 0.9.10.

## 2026-10-17 metadata, limits and tariff reconciliation

This continuation reconciles the full source inventory against a complete public models.dev snapshot. It does not verify provider availability, account entitlement or paid inference. The October 16 section above remains a historical record.

### Snapshot and reproducible inventory

The October 17 snapshot contains 232 providers and 8,987 models in 5,753,484 bytes. Its SHA256 is `60f5bc3e74aa0d883eea10839f599cb92e0f0dfbd010e182234318999439be99`. The capture used the public [models.dev API](https://models.dev/api.json) with truncation disabled; the earlier truncated response was not used.

The complete local execution ledger is `.next/zenrouter-qa-20261017/registry-metadata-final-inventory.json`. It records every active, auxiliary, voice and metadata-reference row, source hashes, exact matches, unknowns, removed identities and retained limitations. The comparison baseline is `b35bcab045bc29ec4f908b9067570e10c8a869c5`, before this interrupted execution's uncommitted changes, not a reissued release.

To regenerate the network-free source inventory with the same snapshot and baseline:

```bash
node scripts/audit-model-lifecycle.mjs \
  .next/zenrouter-qa-20261017/models-dev-2026-10-17.json \
  --baseline b35bcab045bc29ec4f908b9067570e10c8a869c5
```

The lifecycle tool now obtains verified product IDs from the shared catalog-provider mapping. Caller-supplied provider mappings and route scopes remain supported. Kimi Code uses the China product; Vertex MaaS uses `google-vertex`, not the Anthropic partner product. Claude Code and CommandCode's native `/alpha` route are not equated with native Anthropic or public `/v1` catalogs.

| Surface | October 17 count | Change from execution baseline |
|---|---:|---:|
| Active providers | 120 | 0 |
| Active model rows | 1,233 | −12 |
| Auxiliary model declarations | 52 | 0 |
| Voice declarations/assignments | 277 | 0 |
| Metadata-only references | 8 | 0 |
| Total inventoried rows | 1,570 | −12 |
| Active providers without a main-table model row | 25 | 0 |
| Disk-only, unimported definitions | 3 | 0 |
| Reviewed metadata records across four shards | 560 | Not a model-addition count |

The source comparison finds 388 active and 3 auxiliary model-row occurrences with an exact product and literal or explicitly declared upstream ID. The other 902 non-voice occurrences remain unmatched: 518 have no reviewed equivalent product, 60 map to an absent catalog product, and 324 lack that literal model. Voice assignments remain separate; no leaf-ID, cross-vendor or punctuation matching manufactures agreement.

| Lifecycle disposition | Row occurrences |
|---|---:|
| `source-flagged-deprecated` | 15 |
| `eligibility-restricted` | 6 |
| `modelsdev-deprecated-candidate` | 27 |
| `metadata-reference-only` | 8 |
| `unverified` | 1,514 |

These counts describe coverage, not successful provider checks. The 27 catalog candidates comprise NVIDIA (7), OpenAI (7), OpenCode Go (1), OpenCode (4), Vertex MaaS (2), Vertex Gemini (4), and Xiaomi (2). A source flag or missing page alone does not confirm shutdown.

### Native additions and route-scoped removals

Two native models are added without asserting OAuth or reseller entitlement:

- `gemini/gemini-4-argon`: unified 1,048,576-token input, thinking and output window; native multimodal input and reasoning
- `anthropic/claude-haiku-5-5`: 1,000,000-token context, 128,000 synchronous output, adaptive thinking; independent input ceiling remains unspecified

The native Anthropic table removes three [confirmed retired API snapshots](https://platform.claude.com/docs/en/about-claude/model-deprecations.md): `claude-sonnet-4-20250514`, `claude-opus-4-20250514` and `claude-3-5-sonnet-20241022`. The native OpenAI table removes `o1-mini`, whose [shutdown date was October 27, 2025](https://developers.openai.com/api/docs/deprecations.md). These removals do not imply retirement on Claude Code or resellers.

The two Alibaba Coding Plan routes retain the six versions in their exhaustive provider allowlists: `qwen3.7-plus`, `qwen3.6-plus`, `kimi-k2.5`, `glm-5`, `MiniMax-M2.5` and `qwen3.5-plus`. Ten unsupported route-row occurrences are removed, rather than importing the broader pay-as-you-go catalog. The [international Coding Plan documentation](https://www.alibabacloud.com/help/en/model-studio/coding-plan) distinguishes subscription keys, endpoints, quotas and permitted interactive use.

The seven OpenAI rows scheduled for October 23 remain advertised on October 17. Gemini 2.5's prior-use eligibility restriction remains account-scoped, not a shutdown declaration. No default model ordering changes.

### Exact endpoint ceilings and documented unknowns

Independent context, input and output fields are never obtained by subtraction or rounding. Missing fields can be filled from the exact route catalog; explicit primary unknowns, adapter restrictions and operator overrides remain authoritative. GPT-6.1 Sol retains 1,050,000 context, 922,000 input and 128,000 output, plus its sourced description.

Argon's sources describe different APIs, not interchangeable limits. The [October 14 model page](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon) summarizes a 65,536 synchronous default and links the [Interactions long-decode guide](https://ai.google.dev/gemini-api/docs/long-decode). The [GenerateContent-specific guide](https://ai.google.dev/gemini-api/docs/generate-content/long-decode) explicitly limits direct non-streaming REST to 32,768 and streaming to 65,536 per hop. This gateway calls `v1beta` GenerateContent directly, so discovery retains the 32,768 common ceiling and separately records the 65,536 stream and Interactions defaults. Long decode up to 1,048,576 requires continuation that this gateway does not implement. The existing regression's 32,768 expectation therefore does not change.

The final primary review resolves the remaining route differences without relaxing exact comparisons:

| Route | Context | Output | Evidence or qualification |
|---|---:|---:|---|
| Native DeepSeek Flash/Pro and declared aliases | 1,000,000 | 393,216 | [Chat Completions schema](https://api-docs.deepseek.com/api/create-chat-completion) defines 384K as exactly 393,216 |
| NVIDIA MiniMax M2.7 | 204,800 | 131,072 | [NVIDIA model card](https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m2.7) specifies context; exact NVIDIA catalog supplies output, without independent primary output verification |
| NVIDIA MiniMax M3 | 1,000,000 | 16,384 | [Exact NVIDIA inference schema](https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m3-infer), not the native MiniMax output limit |
| NVIDIA GLM 5.2 | 1,000,000 | 32,768 | [Exact NVIDIA inference schema](https://docs.api.nvidia.com/nim/reference/z-ai-glm-5.2-infer) overrides the catalog's higher output value |
| NVIDIA DeepSeek V4 Pro/Flash | 1,048,576 | 16,384 | Exact route catalog context; [Pro](https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-pro-infer) and [Flash](https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-flash-infer) schemas cap hosted output |
| Vertex MaaS DeepSeek V3.2 | 163,840 | 65,536 | [October 16 global quotas](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/deepseek/deepseek-v32); structured output supported, thinking unsupported |
| Vertex MaaS GLM 5 | 200,000 | 128,000 | [October 16 global quotas](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/zaiorg/glm-5); structured output supported, thinking unsupported |
| Poolside Laguna S 2.1 | 1,048,576 | Not specified | [Official weights configuration](https://huggingface.co/poolside/Laguna-S-2.1/raw/main/config.json) corroborates the catalog window; hosted output remains unverified |

The stale NVIDIA M3 regression changes from 512,000/131,072 to primary-documented 1,000,000/16,384. Route-specific thinking formats remain unchanged. Unknown output limits for native MiniMax, Kimi Code and selected Alibaba routes remain null. Poolside XS's hosted ceilings remain unspecified. Ministral 3B retains primary-documented vision and 262,144 context rather than the stale catalog value. Embedding dimensions remain metadata, not context or completion tokens.

The native [GPT-5 Pro declaration](https://developers.openai.com/api/docs/models/gpt-5-pro.md) now requires Responses, without changing provider transport order. The offline consumer regression exercises the actual routing core and executor URL builder, not a fabricated upstream response.

### Reviewed tariffs and native billing units

The reviewed shards retain all nine confirmed text/media pricing proposals, while the shared pricing table owns 132 exact quotes across 14 providers. Operator tariffs remain higher priority. Unknown used components produce unknown costs; explicit zero remains free. No historical usage is repriced by this catalog update.

Anthropic's [published standard API pricing](https://platform.claude.com/docs/en/about-claude/pricing.md) distinguishes cache-read, five-minute-write and one-hour-write rates. All rates below are USD per million tokens; Haiku's strict greater-than-100,000 threshold applies the high rates to the whole request:

| Model/prompt tier | Input | Output | Cache read | 5-minute write | 1-hour write |
|---|---:|---:|---:|---:|---:|
| Haiku 5.5, ≤100,000 prompt tokens | $0.10 | $0.50 | $0.01 | $0.125 | $0.20 |
| Haiku 5.5, >100,000 prompt tokens | $0.50 | $2.50 | $0.05 | $0.625 | $1.00 |
| Sonnet 5.5 | $2.00 | $10.00 | $0.10 | $2.50 | $4.00 |

Gemini 3 Flash Preview retains exact [paid standard prices](https://ai.google.dev/gemini-api/docs/pricing): $0.50 text/image/video input, $3 output including thinking, and $0.05 cache reads per million tokens. Audio input and time-based cache storage remain separate. Cache storage is not a per-token cache-write fee.

Native image and speech rows retain modality-specific tariffs and units. Their generic output, cache-read and cache-write prices remain unspecified when no single applicable tariff exists. Embedding vectors, audio duration, characters, subscription credits and currencies are not converted into generic chat-token fees.

### Retained limitations and security boundary

The ledger deliberately retains unmatched models, voices, metadata references and the three inactive definitions. It does not turn catalog coverage, public schema access or a deprecation banner into an authenticated availability claim. DeepSeek peak/off-peak schedules, Vertex regional premiums, promotional credits and subscription quotas remain billing qualifiers, not invoice settlement.

This work reads public sources and inert registry/config metadata only. It does not read production credentials or private databases, invoke paid inference, restart port 20128, publish, deploy or modify the generated registry index. The root and CLI versions remain 0.9.10; publishing requires a separate authorized release. Parent-owned tests, lint, build and runtime verification remain separate from this offline inventory generation.
