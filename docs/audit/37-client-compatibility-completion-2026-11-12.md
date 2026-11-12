# Client compatibility and pending-contract completion — 2026-11-12

Base source: `cf3e96de` on top of the signature and complete dashboard/navigation
work. Working branch: `fix/client-compatibility-completion`. Source application
version remains 1.0.8; upstream client versions are independent release lines.
This review is source work, not an npm/GHCR release or production deployment.

## Client release and companion review

The review checked every product/version surface in
`open-sse/config/clientVersions.js` against official publisher metadata, immutable
source and statically inspected artifacts. Eighteen explicit client release pins
changed. OAuth, credential validation, model discovery, quota and execution keep
using centralized values; independently verified SDK and API versions do not
inherit an application's version number.

| Surface | Previous | Reviewed current value |
| --- | --- | --- |
| Claude Code latest non-prerelease channel | 2.1.317 | 2.1.322; delayed stable remains 2.1.311. |
| Codex CLI | 0.166.0 | 0.167.2, including its catalog query. |
| VS Code / bundled Copilot Chat | 1.144.0 / 0.72.0 | 1.146.0 / 0.74.0, paired from the editor's immutable source. |
| Cursor | 3.24.18 | 3.29.15. |
| Antigravity IDE / CLI | 2.5.5 / 1.4.0 | 2.6.0 / 1.5.6; distinct publisher surfaces. |
| Gemini CLI | 0.66.0 | 0.68.0. |
| Kiro IDE / CLI | 1.4.13 / 2.33.0 | 1.4.154 / 3.2.1. |
| Trae | 3.6.4 | 3.6.13; existing inactive status retained. |
| CodeBuddy CN CLI | 2.179.3 | 2.183.0. |
| Grok CLI / Build | 1.0.62 | 1.0.77. |
| Kimchi | 1.28.0 | 1.34.2. |
| Command Code | 1.88.2 | 1.88.5. |
| Zed | 1.26.2 | 1.28.1. |
| Windsurf / Devin Desktop | 3.10.67 | 3.12.43; metadata extension stays 1.48.2. |
| Qoder unsigned CLI surface | 1.1.81 | 1.1.87; legacy signed COSY profile is separate. |
| OpenCode | 1.19.5 | 1.19.5, freshly rechecked and unchanged. |
| CodeBuddy INTL IDE wire profile | 2.161.1 | Retained; official download returned 503, so a newer value was not invented. |
| iFlow | Static `iFlow-Cli` identity | Official shutdown remains in effect; no availability or activation claim. |

Claude's bundled SDK remains 0.128.0 and native `anthropic-version` remains
2023-06-01. The newer 2026-10-21 API contract removes existing request fields;
changing that header without a separate format migration would break callers.
Copilot's independently verified SDK is 0.5.2, CAPI is 2026-08-01 and token/user
information requests retain 2025-04-01. Cursor Connect remains 1.6.1. Gemini's
auth library remains 10.9.0 and its separate GenAI library remains 1.30.0.
Kiro's 3.0.0 SDK text remains an explicitly unverified legacy wire profile;
the newer IDE/agent extension number does not establish a replacement SDK pin.

Primary evidence, release selection, source snippets, artifact integrity checks
and specific verification limits are split into five receipts:

- [Claude](data/client-refresh-20261112-claude.json)
- [Codex and Copilot](data/client-refresh-20261112-codex-copilot.json)
- [Cursor, Windsurf, Trae and Zed](data/client-refresh-20261112-ide.json)
- [Google and Kiro](data/client-refresh-20261112-google-kiro.json)
- [Other CLI clients](data/client-refresh-20261112-other.json)

Published binaries/install scripts were not executed. The receipts distinguish
publisher checksum/signature verification from locally observed hashes and the
weaker CDN Content-MD5 evidence available for Trae.

## Companion defects repaired

Gemini terminal onboarding, project lookup and quota metadata previously used
Antigravity's numeric IDE/host profile. A separate canonical Gemini metadata
helper now emits the verified terminal enums, while Antigravity keeps its own
profile. The unsupported Gemini `Client-Metadata` header was removed. Five of
seven new metadata regressions failed before the repair; all now pass.

Kiro discovery no longer overrides the central helper with captured Windows and
Node values. Default runtime metadata uses the gateway's actual platform, kernel
release and Node runtime while preserving explicit caller-owned configuration.
Grok's Rust-style OS/architecture tokens now derive from the actual gateway host
instead of always claiming Linux/x86_64. Cross-platform cases cover Linux,
Apple Silicon and Windows without using actual operator credentials.

Claude OAuth retry recovery now distinguishes optional defaults from explicit
caller capabilities and body-dependent feature flags. A rejected required pair
retains its original upstream response, without an altered retry or denylist
write. An old optional rejection cannot erase a later explicit request. Optional
default recovery remains account-local; lookalike endpoints cannot poison the
first-party rejection state. The first new eight-case reproduction failed seven
cases before this fix.

Two legacy budget tests initially still requested an explicit beta while
expecting it to be removed. Their optional-default scenarios now omit that
explicit request and retain the original exact budget/fallback assertions; two
additional cases verify unchanged budgets and original upstream rejections for
explicit opt-ins. This is a contract migration, without another production
source change or weakened budget checks. The initial full report is retained
separately from the complete final run.

Ordinary canonical Claude system messages now retain their positions on the
exact eleven models documented as stable. Unknown aliases, Sonnet 5 and reseller
endpoints do not inherit that capability from a name prefix. Per-message
`output_config`, `clear_at`, tool changes and binding retain their independent
explicit capability contracts. No opt-in or account entitlement is fabricated.
Eleven new stable-model cases failed before the repair; negative/provider
boundaries continue to exercise legacy behavior.

## Responses replay and tool identity

Long-name compression previously renamed declarations but left Responses
`input` calls and flat forced choices unchanged. It also failed to reserve
historical and incremental names against alias collisions. The original ten
regressions failed before the repair; an additional native-input-through-Chat
case independently exposed the compatibility path that also needed recognition.
Five further namespace/choice cases reproduced scope ownership, the internal
CODEX alias and typed `allowed_tools` mismatches before their corresponding fix.

Allocation now considers initial and `additional_tools` declarations before
rewriting exact typed calls, optional output names and forced choices. Short
historical names remain reserved. Namespaced declarations/calls/choices retain
their separate ownership, including outputs whose namespace is inherited from
their `call_id`. Typed allowed-tool choices follow the same alias; MCP and other
opaque choice entries remain unchanged. Ordinary JSON, arguments, opaque reasoning, call IDs
and frozen caller input remain unchanged. Response restoration respects the
same namespace boundary. Public native and translated preparation paths use one
request-local alias map; there is no cross-request signature recovery.

## Hydration follow-up

The single #418 observation in audit36 is now causally reproduced: the runtime
translated English server text while a completed React Suspense region was still
waiting to hydrate. React then regenerated that subtree after finding Indonesian
DOM where it expected English. The deterministic fixture retains the exact React
diff and separately covers labels rendered through `translate()`.

Public hydration boundaries now mark independently hydrated page/layout and
explicit nested Suspense regions. Translation activation waits for document
parsing and those regions' actual hydration snapshots. Client-only mounts remain
ready. Wrappers use `display: contents`; server-rendered children remain on the
server. The fix uses no private React fields, warning suppression, arbitrary
delays or SSR disabling. Delayed-region, late-parsing and original-node identity
regressions pass alongside existing dynamic counts, attributes and code/identity
preservation checks. See
[hydration-followup-20261112.json](data/hydration-followup-20261112.json).

## Verification and completion boundaries

The final integrated results, built-source hashes, precise test totals and local
production browser evidence are recorded in
[client-completion-20261112.json](data/client-completion-20261112.json).

| Final local gate | Result |
| --- | --- |
| Complete Vitest run and strict report verification | 11,324 passed; 99 explicit skips; 887 files; zero failed assertions or suites. |
| Production dashboard Playwright | 45 passed; no failures or retries. |
| Independent production UI checks | 13 workflows and 50 geometry checks passed; 20 screenshots; zero JavaScript, console, HTTP or non-abort request errors. |
| Documentation | 18 tests passed and static production export built. |
| Dependency security | Application, CLI, tests and docs each reported zero npm audit vulnerabilities. |
| Build, strict composed lint, brand, i18n, HTTP/2, provider/alias/OAuth baselines, identity generation and source CLI bundle | Passed. |

Final app build: `RdXaWkmGYhEh6LQn-3XWh`, verified on Node 24.22.1. All 51 changed
production source hashes and 25 test-input hashes stayed unchanged across their
final verification. The existing CI workflow independently uses Node 24.19.0;
local results do not assert its outcome. Builds/browser jobs were stopped before
the complete regression run. The retained first run and budget-test migration
are separately identified in the receipt.

Literal wire expectations and 21 provider-baseline metadata values were updated
from the reviewed source; unrelated baseline fields/order were retained. Alias
and OAuth URL baselines are unchanged. Native/provider wire assertions remain
independent of the constants they verify.

The upstream tip was rechecked at
`54a88d0498ffea4e52576950235562ea420dc761`, unchanged from audit34. Its latest
twenty commit subjects were reconciled for the requested compatibility scope;
there was no broad merge, unrelated dependency downgrade or blind cherry-pick.
Historical audit files, source tags and publication receipts remain historical.

This completes the bounded client/companion refresh and the identified pending
OAuth, stable-system, Responses replay and hydration repairs. It does not claim
every upstream issue or every provider catalog was audited, cryptographic
signature authenticity was established, accounts gained entitlement, or a
gateway became undetectable. Signed-prefix integrity still depends on original
history and account/session ownership; unsupported or rejected contracts remain
explicit rather than being fabricated or silently rewritten.

Authentication, credentials, SSRF/proxy policy, quota/accounting, paid-tier intent
and destructive-action confirmation remain in force. Tests use isolated state,
synthetic keys and local transports; public publisher downloads are separate
from live-provider account/inference validation. Source push does not establish
an npm/container release or deployment.
