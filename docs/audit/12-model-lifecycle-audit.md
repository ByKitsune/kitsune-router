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
