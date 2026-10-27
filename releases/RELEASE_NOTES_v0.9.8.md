# ZenRouter 0.9.8 release notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

**2026-10-13** · Previous release: **0.9.7** · Requires **Node.js >=22.19.0**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.8) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.8/CHANGELOG.md) · [Technical changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.8/docs/CHANGELOG_v0.9.8.md)

> **Backfilled release.** This batch was prepared on 2026-10-13 but published on
> **2026-10-16**, after 0.9.9. `latest` was deliberately left on 0.9.9 in every registry,
> so `npm i @joyccn/zenrouter` still installs 0.9.9. **0.9.9 is the recommended release and
> already contains everything below.** Install 0.9.8 only if you specifically need the
> dependency-advisory fix without the later changes — it does **not** include the
> external-audit fixes (context-window reporting, the context-overflow 400, revoked-token
> cooldown, inbound rate limiting, log PII redaction, neutral client errors).

0.9.8 clears the critical dependency advisory on the default branch and lands the Tier-1
batch from the 9router upstream sync analysis. Twenty changes, each committed and tested
separately. No breaking API change. [0.9.7 release notes](https://github.com/ZenRouter/ZenRouter/blob/v0.9.8/releases/RELEASE_NOTES_v0.9.7.md) remain historical and unchanged.

## Highlights

- **Critical advisory cleared.** `proxy-addr` (GHSA-jqcg-44mw-7w3h — IP spoofing via an IPv4-mapped IPv6 trust subnet) entered only through `express`, which was declared but imported nowhere. The dependency was removed rather than pinned around; the lockfile loses 40 transitive packages. Two more orphans went with it: `marked` (its consumer was deleted when changelog rendering moved to `react-markdown`) and `selfsigned` (test-only, now a devDependency).
- **Usage you can trust.** Streaming OpenAI-compatible chat calls now request `include_usage`, so cache hits are billed at the cache rate instead of being estimated from character counts. Codex image requests report their real tokens into usage history, and effort-annotated model ids (`gpt-6.1-sol(xhigh)`) price at the base model rate instead of `$0`.
- **Fewer dead-end requests.** A 400 that means "out of credits" advances to the next combo member instead of failing the request. CommandCode caps output at its real 200k schema limit. The GitHub Responses route strips parameters that endpoint rejects. Strict tool declarations survive translation.
- **Account pinning on chat.** `x-connection-id` now works on the chat endpoints, matching image and video: pin an agent to one account, with automatic fallback to the provider's other accounts. The id is only ever matched inside that provider's own active accounts.
- **Catalog brought forward.** Antigravity Claude Sonnet 5.5 / Opus 5.5, CodeBuddy CN `kimi-k2.8-preview` and `deepseek-v4.1-flash`, LongCat 2.5, the MITM map aligned to the 3.8 generation, and ParalonCloud as a new OpenAI-compatible provider.
- **A picker that agrees with the router.** Providers whose connections are all disabled — and registry-hidden no-auth entries — no longer appear as selectable models, so a saved combo can no longer point at an account that will 404 at dispatch.

## Security posture

This is **not** a vulnerability-free release, and it does not claim to be. `node-forge`
GHSA-86w9-cpqp-85rv (high) has **no patched release upstream** — 1.4.0 is the newest
published version. Its only production consumer, `src/mitm/cert/rootCA.js`, parses,
generates, signs and serializes certificates but never calls a signature-verification API,
so the affected RSA PKCS#1 v1.5 verification path is unreachable from this codebase. That
argument is now asserted by a test instead of being a comment, and the advisory stays
documented in the changelog. A dev-graph `braces` advisory (via `eslint-config-next`)
remains and does not ship in the production install.

A new dependency-hygiene test keeps the improvements from silently regressing: no phantom
production dependency, `express`/`proxy-addr` cannot return, no `node-forge` consumer may
call a signature verifier, and the unpatchable advisory must stay documented.

## Verification and caveats

- Isolated Vitest suite on Node 24.19.0: **1,386 files, 4,335 cases — 4,234 passed, 100 skipped, 1 todo, 0 failed**. `npx eslint .` is clean with zero warnings.
- Registry baselines (82 providers, 117 alias tokens, OAuth URLs) are byte-for-byte equal; the no-regression verifier passes.
- Production build succeeds after the dependency removals, and a standalone smoke run on an isolated `DATA_DIR` serves `/login` 200 and `/v1/models` 200 with SQLite migrated. **No production account, live provider inference or billable request was used.**
- Catalog additions are metadata and routing declarations. They **do not** establish account entitlement, upstream availability or live-verified limits.
- Upstream Tier-2/Tier-3 items from the sync analysis remain open; the OpenCode free-tier 403 cluster still needs the unmerged upstream PRs re-verified before porting.

## Upgrade

After publication:

```bash
# Node.js >=22.19.0
npm install -g @joyccn/zenrouter@0.9.8
zenrouter --version
# Or: npx @joyccn/zenrouter@0.9.8
```

The npm package remains **@joyccn/zenrouter** and the binary remains **zenrouter**. App,
CLI, independent tests and docs package versions align to 0.9.8. No configuration change is
required. Back up your persistent data before upgrading.

Container examples pin **joyccn/zenrouter:0.9.8** or **ghcr.io/zenrouter/zenrouter:0.9.8**.
The publication workflow builds **linux/amd64 only**; do not assume native ARM64 or
multi-architecture support. Persist **/app/data**, not `/root/.zenrouter`; see the
[Docker guide](https://github.com/ZenRouter/ZenRouter/blob/v0.9.8/DOCKER_README.md).
Preparing these notes does not publish a package, GitHub release or image, nor certify tag
availability.
