# 9Router upstream review — 2026-10-29

This is a source review, not a deployment or a claim that the production
service contains these changes. Upstream `master` was fetched without tags at
`1fe586bb` (9Router v0.5.112, 2026-10-28). Kitsune and 9Router have diverged;
408 upstream commits were absent from Kitsune's ancestry at the start of this
review. That count does not mean 408 behaviors are missing. The table covers
the newest 2026-10-28 commits, not the entire divergent history.

## Newest commits

| Upstream | Disposition |
| --- | --- |
| `1fe586bb` v0.5.112 | Release marker only; do not replace Kitsune's version or branding. |
| `85d73bd6` MiniMax desktop lease | Not ported: new OS-specific broker/auth feature; needs a separate compatibility and security review. |
| `d7bb71ce` DeepSeek PoW | Not ported: the affected PoW module is absent from this checkout. The direct DeepSeek API is a different path. |
| `3b7acf72` Docker lazy dependencies | Not ported: Kitsune has no upstream `lazyRuntime.js`; its OpenCode transport and packaging differ. Assess together with the OpenCode changes below. |
| `56dbf466` non-stream SSE errors | Kitsune already classifies response errors and accounts for incurred usage. Added coverage and numeric-string HTTP status handling in `21a5148f`; do not replace the usage accounting with upstream's earlier return. |
| `8db1f4ae` Gemini schema predicates | Adapted in `f84c5eff` using Kitsune's schema-map-aware traversal. The existing lossy union/placeholder compatibility behavior is not strict JSON Schema enforcement. |
| `f7f6f5ed` Nace Drex | Not ported: new provider/feature, not a confirmed fix for an existing Kitsune provider. |
| `ced0cf6e` NVIDIA reasoning aliases | Kitsune already normalizes readable Chat aliases and rejects contradictory values instead of silently discarding one; the two behaviors are intentionally not identical. |
| `a199d777` opaque LLM tokens | Adapted in `fcc4ccb4`; two-part named keys and Cloudflare syntax remain supported. |
| `b1effa03` CommandCode CLI headers | Not ported yet: request/session handling differs and must be reconciled with Kitsune's serializer and existing transport contracts. |
| `f3e1f716` Copilot Claude 5.5 | Partially covered: Kitsune already handles Sonnet's `between_tools` and explicit display; the upstream GitHub Haiku 5.5 and forced-choice details require route-specific validation. |
| `3fd925ab` CodeBuddy channel headers | Adapted in `8949ca17` for both existing CodeBuddy executors. No live account was used. |
| `acb3c080` GPT-6.1 Terra | Not ported yet: new Codex model and pricing need route-specific provenance and metadata validation; do not copy a global price/limit blindly. |
| `e70ea24d` OpenCode lazy runtime | Not ported: the affected module is absent. New upstream OpenCode TLS/fingerprint changes are a candidate for a separate end-to-end compatibility review. |

Also reviewed selected 2026-10-26 fixes: the Claude tool-image and Headroom
document-preservation paths already have Kitsune implementations and tests.
`2924e055` exposed one missing legacy DeepSeek V4.1 Flash identifier; it is now
an alias to the canonical `deepseek-flash` in `d7bc86f0`, scoped to DeepSeek.
Other 2026-10-26 and older commits have not all been reviewed or integrated.

## Open issue to verify

[9Router #5296](https://github.com/decolua/9router/issues/5296) reports Codex
Chat streaming being buffered until upstream EOF. `7769db72` adds an offline
test showing that Kitsune's Core emits a synthetic Codex text delta before the
synthetic upstream finishes. It does **not** exercise Next.js, the custom server,
the reverse proxy, or a live provider, and therefore does not establish whether
the deployed service is affected. Test those layers during planned maintenance.

## Validation and boundaries

- Selected packaging/branding tests: 20 passed; documentation tests: 16 passed.
- Bulk-add and CodeBuddy focused suites: 28 passed.
- Gemini schema and related translator suites: 226 passed.
- SSE error and transport suites: 66 passed.
- DeepSeek identity and model-contract suites: 82 passed.
- The offline Codex Core streaming regression passed; no real account was used.
- Targeted lint passed. A full build and complete repository test suite were not
  run. Changes have not been pushed, deployed, or activated by a service restart.
