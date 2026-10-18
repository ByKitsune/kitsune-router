# ZenRouter 0.9.12 release notes

**2026-10-19** · Previous release: **0.9.11** · Requires **Node.js >=22.19.0**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.12) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.12/CHANGELOG.md) · [Technical details](https://github.com/ZenRouter/ZenRouter/blob/v0.9.12/docs/CHANGELOG_v0.9.12.md)

This patch collects the security, native Argon and gateway corrections merged
since 0.9.11. It preserves ZenRouter's custom routing and provider distinctions;
earlier npm/Docker artifacts remain unchanged.

## Highlights

- **Preserve tool screenshots.** Parallel and nested tool results keep typed
  media across Chat, Responses, Claude, Gemini, Ollama and CommandCode. Avoid
  duplicate tool replies, missing image-only results and base64 encoded as prose.
- **Keep thinking intent.** Native passthrough honors explicit suffixes/defaults;
  zero-budget means off. Effort mapping uses the resolved endpoint's supported
  levels, and disabled Claude thinking stays independent of native effort.
- **Protect local state.** OpenCode JSONC edits retain comments and unrelated
  settings. Committed database imports refresh key, settings, pricing, catalog,
  observability and quota caches instead of retaining stale credentials.
- **Harden transport and dependencies.** Replace node-forge certificate handling
  with WebCrypto/X.509, tighten proxy attribution and DNS-pinned probes, preserve
  native error/tool framing, and stop retries when the caller cancels. Configured
  no-auth proxy failover stays bounded and never silently uses direct egress.
- **Refine native integrations.** Include Antigravity Argon CLI transport/quota
  support, per-connection credential refresh, Copilot embeddings, conservative
  combo limits and native usage accounting.
- **Reconcile model facts.** Audit 120 providers and 1,165 registry rows against
  a pinned October 17 models.dev snapshot plus provider sources. Fix Claude alias
  pricing and Perplexity's inclusive 200K Grok tier; annotate dated promotions
  and shutdown schedules without hiding models on unsupported assumptions.

## Upgrade

```bash
npm install -g @joyccn/zenrouter@0.9.12
zenrouter
```

Docker publication targets **linux/amd64** at `joyccn/zenrouter:0.9.12` and
`ghcr.io/zenrouter/zenrouter:0.9.12`; GHCR retains its existing access policy.
Back up the configured data directory before upgrading and retain the existing
volume at `/app/data`. Examples require successful registry publication.

Existing unexpired MITM roots remain usable; this change does not replace system
trust-store entries. If both `opencode.json` and `opencode.jsonc` exist, resolve
that ambiguity before editing through the dashboard. Database-import cache
invalidation is process-local; coordinate reloads if running multiple workers.

## Verification and limits

Before the release-only metadata bump, commit `6ef3fce3` passed **6,052 tests**
across **586 files** on both Node 22 and 24, with **100 optional tests skipped**
and zero failures. The count includes three intentional expected-failure cases,
not three fixed behaviors. Lint, compatibility, identity/baselines, documentation
and application builds, packaging and isolated artifact HTTP checks passed.
All four npm lockfile audits reported zero advisories; this is not a security
guarantee or an OS-container scan. Release-tag CI and registry publication are
separate checks, not implied by those local results.

Synthetic checks include a valid 2172×724 PNG through real HTTP serializers and
persisted usage. They do not establish live provider entitlement, image quality
or the precise cause of the unavailable original overflow request. Argon keeps
its 1,048,576-token context and Opus 5.5 its 1,000,000-token context; input and
endpoint-specific output limits stay separate. No hidden history trimming or
invented capacity is used to conceal overflow.
