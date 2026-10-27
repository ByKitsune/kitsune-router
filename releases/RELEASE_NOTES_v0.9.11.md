# ZenRouter 0.9.11 release notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

**2026-10-17** · Previous release: **0.9.10** · Requires **Node.js >=22.19.0**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.11) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/CHANGELOG.md) · [Technical details](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/docs/CHANGELOG_v0.9.11.md)

Upgrade to fix image payloads becoming text, lost reasoning controls, inconsistent cross-provider failures and cache-aware cost estimates. This release also includes the corrections accumulated after 0.9.10. It preserves ZenRouter’s customized routing architecture rather than replacing it with upstream 9Router code.

## Multimodal history and reasoning

The gateway keeps recognized images as typed media across Chat Completions, Responses, Messages and Google formats. Tool results and compacted histories retain image occurrences, tool ownership and opaque signatures without serializing image bytes into prose. Text compression does not send encoded images to the text proxy.

Request reasoning aliases, suffix/request/provider precedence, native thinking settings and output budgets now follow the selected destination’s capabilities. Streaming and non-streaming responses retain readable reasoning and measured usage.

Basic Chat renders generated image replies, replays them as typed assistant content, reconciles identified snapshots and restores history after hydration. Invalid response protocols and unsafe image URLs produce visible failures.

## Cross-provider protocol corrections

The converters preserve instructions, supported sampling controls, native structured-output schemas, function choice and parallel tool identity. Native Gemini chat uses the shared codecs and accepts Google SDK client keys in headers or query parameters.

Native Cursor requests use the reviewed AgentService image/history/tool schema. Cancellation stops image preparation and pending native runs. A configured proxy or relay that the native transport cannot honor fails closed.

These request contracts now fail explicitly:

- Unsupported native controls return `unsupported_parameter` instead of being silently ignored; Cursor no longer applies the unused 32,000-token floor.
- Stateful Responses references cannot be forwarded to a stateless destination without losing their meaning.
- A native failure after partial output remains a structured error, not successful assistant text. Invalid-request failures retain HTTP 400 without cooling down healthy accounts.

## Model limits, lifecycle and billing

The audit uses the complete 2026-10-17 [models.dev API](https://models.dev/api.json) snapshot: 232 providers and 8,987 model records. Exact provider products and model IDs take precedence over family guesses. Endpoint-specific primary sources can override catalog facts; unmatched or undocumented fields remain explicit unknowns.

Frontier context windows do not imply the same output allowance:

| Native route | Context window | Single-request output allowance | Separate input ceiling |
| --- | ---: | --- | --- |
| Gemini 4 Argon, GenerateContent REST | 1,048,576 | 32,768 non-streaming; 65,536 streaming | Not independently documented |
| Anthropic Claude Opus 5.5, synchronous Messages | 1,000,000 | 128,000 | Not independently documented |

Argon’s longer decode allowance requires continuation, which this gateway does not implement. Model metadata does not claim that allowance as an ordinary single-request output limit.

The registry distinguishes confirmed retirement, a future retirement date, compatibility aliases and account eligibility. Gemini 2.5 Pro and Flash-Lite remain listed for previously eligible API projects; the 0.9.10 global retirement conclusion was incorrect.

Cost estimates preserve exact provider tariffs, saved overrides, context tiers and distinct five-minute/one-hour cache writes. Unknown used charges remain `null`; genuinely free rates remain numeric zero. The pricing editor saves only edited overrides, so changing one fee cannot materialize inherited reasoning rates or tiers.

## Upgrade and artifact scope

Use the versioned package after publication:

```bash
npx @joyccn/zenrouter@0.9.11
```

Docker publication targets **linux/amd64** at `joyccn/zenrouter:0.9.11` and `ghcr.io/zenrouter/zenrouter:0.9.11`. It does not publish an ARM64 or multi-architecture image. Back up your configured data directory before upgrading. SQLite upgrades remain additive, and the pre-upgrade backup version now advances before latency-column changes.

The release workflow binds npm provenance, the retained CLI tarball and GitHub assets to the exact release tag. Older versioned npm packages, image tags and releases are not overwritten. Publication does not deploy or restart an existing gateway.

The existing GHCR package remains private and requires authorized registry credentials. Use the public Docker Hub mirror for anonymous pulls; this release does not change package visibility.

Generated CLI build HOME state, including machine IDs, SQLite databases and telemetry settings, is excluded from copied standalone files.

## Verification before publication

Local verification of the corrected source completed with:

- 5,240 Vitest cases passed across 559 files, zero failed cases or suites, with 100 credentialed/live opt-in cases skipped; executable tag/ref/SHA guard tests and the build-state packaging regression remain after removing four text-only workflow assertions
- Two documentation tests and one HTTP/2 compatibility test passed
- Lint, documentation build, CLI pack, no-regression checks and provider/alias/OAuth baselines passed
- Twenty-four multimodal JSON/SSE combinations preserved two high-entropy PNGs by SHA-256 through synthetic native upstreams
- Ten HTTP/SSE error paths retained diagnostics and failure framing without exposing routing/debug payloads
- Real SQLite and browser checks covered cache-write TTL accounting, unknown/free costs, image replay and override-only pricing edits
- Local archive inspection, first-run CLI runtime provisioning and packed HTTP health/authentication/discovery checks passed with fresh isolated data

The publication workflows independently rerun their configured checks on the release tag.

## Security and verification limits

**An unresolved high-severity dependency advisory remains:** [GHSA-86w9-cpqp-85rv / CVE-2026-85393](https://github.com/advisories/GHSA-86w9-cpqp-85rv) affects `node-forge <=1.4.0`. GitHub reports it in the root and CLI lockfiles and lists no patched release. This is not a vulnerability-free release.

This release hardens pinned-DNS image downloads, IPv6 private/unspecified address rejection, shared DNS/HTTP deadlines, native cancellation and public error boundaries. These fixes do not resolve the upstream node-forge advisory.

Verification used isolated data directories, synthetic credentials and loopback providers/sidecars. It did not access production data, perform paid inference, verify live-provider entitlement or establish upstream invoices. Catalog metadata and successful CI do not prove those properties.
