# ZenRouter v0.7.0 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.7.0` is a gateway-readiness release: smarter OAuth for hosted dashboards, a full client-fingerprint refresh, deeper provider compatibility fixes, and a dependency tree with zero outstanding advisories.

## Highlights

### 🔐 OAuth That Works Behind Your Own Domain
- **Public dashboard callbacks (#4054)**: Authorization-code providers that accept web callbacks (`claude`, `cline`, `clinepass`, `gitlab`, `iflow`, `kimchi`) now return to `${origin}/callback` when the dashboard is reached through an HTTPS tunnel, reverse proxy, custom domain, or subdomain — no more manual URL rewriting. Installed-app providers keep their registered loopback callbacks so upstreams never see a `redirect_uri_mismatch`.
- **Hardened redirect handling**: Server-side same-origin/loopback validation on both the authorize and exchange endpoints, plus strict URL/hostname and popup-source checks on `postMessage` (no substring trust such as `localhost.attacker.example`).
- **Imported connections refresh again (#4000)**: Numeric epoch `expiresAt` values are parsed and normalized, so imported credentials rejoin proactive and background token-refresh sweeps.

### 🛡️ Security & Dependency Hygiene
- **Zero open advisories**: `next` moved to `^16.3.5` (clearing two critical advisories), with `sharp ^0.35.4` and `js-yaml ^4.3.2` applied through overrides. `npm audit` is clean at every severity across the app, docs, and test workspaces.
- **`REQUIRE_API_KEY` is finally enforced (#2834)**: The documented env var now gates all nine `/v1` enforcement points via a shared `isApiKeyRequired()` helper — one-way by design, so the env var can turn enforcement on but never off.
- **Strict proxy no longer leaks (#4007)**: The `strictProxy` flag is propagated through auth, chat, token refresh, and quota pings, so pools configured to fail closed stop falling back to the operator's real IP.
- **Login hint stops advertising the default**: `/api/auth/status` reports `usesDefaultPassword`, and the `12345678` hint renders only when that is genuinely true (fail-closed on fetch errors).
- **MITM cleanup guarantees (#4014)**: System hosts entries are removed on shutdown, crash, and `EADDRINUSE`, and tool DNS restore is guarded behind a running-server check.

### 🤝 Provider Compatibility
- **Antigravity**: Stable per-connection fallback project IDs instead of a fresh random ID per request, `maxOutputTokens > thinkingBudget` enforcement, telemetry stripping, harness-tag normalization, and preserved `inlineData` so image edits and multi-image inputs survive (#3979, #3986, #3987, #4112).
- **Gemini**: Base64-validated thought signatures with a recovery cache for truncated tool-call IDs, shorthand subschema expansion, isolated schema maps, and every system message preserved in translation (#3999, #3972).
- **Kiro**: `mcp__server__tool` names survive round-trips via a reverse map, and tool-result-only turns get a neutral placeholder instead of a literal `"continue"` the model answers as a new instruction (#4113, #4108).
- **Responses API**: Missing `call_id` values are repaired by pairing pending calls in order, instead of sending a malformed body that 400s across every account in a combo (#4091).
- **Codex / Claude / DeepSeek**: Unicode-property schema patterns stripped for Codex, Claude `cache_control` capped at the 4-marker budget, and the `type: "custom"` tool default scoped to the gateways that actually require it (#3922, #3905).
- **OpenCode (#4101)**: Compliant `opencode/1.18.31` identity headers with canonical session IDs and deterministic per-turn request IDs, so free-tier calls stop failing with 403.

### 🧭 Fingerprints & Observability
- **All 11 client fingerprints re-verified against first-party sources** (Claude Code 2.1.274, Codex 0.154.0, Gemini CLI 0.60.0, Kiro 1.0.437, Antigravity 2.12.2, VSCode 1.137.0, Trae 3.5.91, CodeBuddy 2.151.0, Grok 1.0.34, Kimchi 1.1.23, Zed 1.18.1) — every value is a real public release, driven from one constant so registry, image, test, and billing headers cannot drift.
- **Failed streams are recorded as failed (#4104)**: Terminal `response.failed`/`error` events inside an HTTP-200 stream now write `status: "failed"` with the upstream message, ending phantom "success" rows with billed-looking usage.
- **Accurate usage accounting**: Prompt-cache reads surface to `chat/completions` clients without double counting, and CommandCode reasoning/cached tokens are billed at cache rates (#3984, #4025).
- **Stale locks self-heal (#3830)**: Reactivating a connection clears `modelLock_*`, backoff level, rate-limit windows, and error codes, so recovered accounts rejoin the rotation.
- **Location-gate guidance**: Google's `User location is not supported` 400 now carries actionable remediation without tripping fallback or cooldown classification, documented in `docs/antigravity-location-error.md`.

### ✅ Validation
- Full suite: **2,509 tests passing, 0 failures**.
- Provider, alias, and OAuth baselines green (81 providers, 117 alias tokens).
- ESLint clean; production build verified.
