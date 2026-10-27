# Public gateway contract audit and implementation

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

Date: 2026-10-21; implementation and final local verification: 2026-10-22. Starting source: `677b3ee1e78f93c153fec678f07c5e9372296727`.
This is a customized ZenRouter audit, not a blanket merge of 9Router.

Research remotes: origin is `ZenRouter/ZenRouter`; upstream is
`decolua/9router`, whose fetched default branch is `master` at `87a74e1b`
(v0.5.104, 2026-10-15). Their common ancestor is `699edac3`; the starting
ZenRouter checkout has 566 unique commits versus 338 on that upstream branch.
Issue/PR discussions newer than the upstream tip are proposals/evidence to
evaluate, not automatically released fixes. Existing ZenRouter CI for the
starting SHA was successful; it is not CI proof for these unpushed changes.

## Goal and workflow

Reconcile the owner's 25 reported client-visible problems against current source,
prevent silent request loss, and give clients truthful, stable protocol contracts.
Reproduce → behavioral regression → minimal fix → focused and full verification
plus runtime logs → local commit. **No push or deployment in this task.** A later
authorized push must be followed by exact-SHA GitHub CI verification.

The owner explicitly requested immediate execution after preparation; the plan is
executed inline with bounded parallel investigations rather than waiting for a
separate plan approval. Use the installed systematic-debugging, TDD and parallel
agent skills. No production credentials/state or paid live calls are needed for
local regression checks.

## Architecture map

- `src/proxy.js` / API routes: inbound authorization and public response boundaries.
- `src/sse/handlers/chat.js`: aliases/combos, account selection and final responses.
- `open-sse/handlers/chatCore.js`: capability/parameter admission, owned request
  copies, format translation, executor selection and response dispatch.
- `open-sse/translator/`: source→OpenAI→destination or direct codecs; typed media,
  reasoning, tools, structured output and stream state belong to these boundaries.
- `open-sse/executors/{codex,antigravity}.js`: actual native wire restrictions,
  injected instructions, retry classification and native stream handling.
- `open-sse/providers/` and `src/app/api/v1/models/route.js`: provider-specific
  route/capability facts and client discovery, not proof of account entitlement.
- `open-sse/utils/usageTracking.js`, `translator/concerns/usage.js`, pricing and
  SQLite repositories: measured upstream usage, independently scoped tariffs,
  cache TTLs, unknown totals and recorded billing.

## Review constraints

1. No positive capability claim without a supported destination wire; documents
   must be preserved or rejected before any upstream/billable dispatch.
2. Preserve client output caps. Do not auto-raise token budgets or claim ignored
   caps worked. Give precise actionable local errors for impossible budgets.
3. Preserve safe upstream semantics without returning credentials, private paths,
   untrusted debug payloads or account identifiers in public error/catalog data.
4. Do not fabricate input limits, reasoning text, zero usage, prices, or actual
   delivery. Subscription credits are not USD API tariffs.
5. Real unavailable models and temporary quota restrictions are distinct. A
   transient account failure must not retire a model globally. `/v1/models`
   cannot guarantee every account/request will return 200.
6. Preserve per-route native framing, request-local state and exact tool/media
   bytes. Literal JSON examples are not attachments.

## Implementation tasks

### A. Document admission and PDF data loss (finding 1)

Files: request-media/capability policy, shared chat admission, relevant Codex route
metadata; new document-routing regressions.

- [x] Reproduce current PDF handling for Chat, Responses, Messages and Google
  request containers, including tool results and native passthrough.
- [x] Prove supported Gemini serialization preserves bytes and ordinary JSON.
- [x] Make unsupported/unverified document routes fail explicitly before dispatch
  rather than replace input with prose or return paid empty success.
- [x] Keep unsupported route metadata conservative without disabling a verified
  public OpenAI PDF transport.

Evidence: the pinned official Codex `rust-v0.163.0` `ContentItem` enum in
`codex-rs/protocol/src/models.rs` has text/image/audio/output-text variants and
no input-file/document variant. Captured source SHA-256:
`df9a3da250376d86203a8a1219b2e4b5353a62274d094bb36998560433bd58eb`.
This is not a restriction on the separate public OpenAI Responses API. Initial
document regressions reproduced 18 failures at HEAD; the first focused fix run
passed 87 assertions across the new and related existing suites. Full verification
then passed 8,154 assertions, with 100 opt-in/live skips across 687 files. The
final combined verification and scoped review results are recorded below.

### B. Public errors and quota classification (findings 3, 4, 23)

Files: public error helpers/auth boundaries, account fallback/combo/quota handling;
request-level error regressions.

- [x] Trace 400/401/404/429/503 through direct and combo paths.
- [x] Normalize message/type/string-code/request_id while retaining native framing.
- [x] Preserve actionable safe diagnostics, not raw upstream bodies.
- [x] Classify evidenced quota/reset failures as retryable; preserve actual 404/410.

### C. Output/reasoning/response identity (findings 2, 8, 12–18)

Files: thinking admission/budget helpers, request codecs, JSON/SSE response
handlers, Codex/native adapter contracts; protocol regressions.

- [x] Explain the actual selected thinking budget without increasing client caps.
- [x] Preserve supported intent and reject ignored/conflicting controls explicitly.
- [x] Keep Chat IDs Chat-shaped and echo requested route identity in JSON/SSE.
- [x] Preserve upstream readable reasoning and real measured usage/cache counters.
- [x] Preserve representable structured output or reject it before dispatch.

### D. Discovery and billing truth (findings 5–11, 19–24)

Files: catalog construction, route-specific metadata and client integrations;
metadata/discovery regressions.

- [x] Filter explicitly rejected built-ins, retain saved resolution/custom declarations.
- [x] Reconcile route tools/vision/effort facts and actionable search surfaces.
- [x] Publish known constraints without inventing independent input ceilings.
- [x] Remove private build/evidence provenance from ordinary discovery.
- [x] Separate credit/plan prices, API USD references, cache TTLs and tier boundaries.

### E. Local client configuration and delivery (finding 25)

- [x] Inspect configuration without logging token values. Move credentials to
  environment references only with a persistent, verified runtime environment;
  do not replace a working secret with an unset variable.
- [x] Run strict full regression/discovery gates, compatibility, baselines, lint, builds/audits and isolated runtime scenarios.
- [x] Independently review the combined implementation, record results/limits, and prepare a local commit; no push.

## Baseline evidence

Before source changes: 8,129 passing Vitest assertions, 100 skipped/opt-in cases,
686 files; zero failures. Three additional full Node 24 runs and a full Node 22
run passed. App/docs builds, composed strict lint, compatibility, docs tests,
provider/alias/OAuth/identity checks and dependency audits passed. Disposable
Chromium/Firefox/WebKit login/session/SQLite-health smoke passed. Evidence is
retained on the development host under `/var/log/zenrouter-dev/runs/`.

These are local/synthetic checks, not live-provider or upstream-invoice proof.

## Local client configuration disposition

The active OpenCode config's two provider entries used the same literal key and
`ZEN_API_KEY` was not present in the active environment. Both now reference a
private 0600 credential file via OpenCode's documented `{file:...}` substitution,
preserving comments and unrelated configuration without restarting the service.
The local regeneration script no longer embeds the key. Sensitive backups remain
outside this repository, with private permissions.

The 14 Codex PDF-positive entries in that client config were disabled; the two
GPT Reserve tool rows were enabled according to the owner's reported successful
tool calls. Fourteen API-reference USD cost entries were removed from the
subscription-backed client provider: these were not actual credit debits. The
generator no longer converts null rates to free zero, flattens unequal cache-write
lifetimes, or copies an inclusive/exclusive gateway tier into an unverified
consumer boundary. The original five external generator regressions passed after
those fixes; two additional cache-lifetime/route-effort regressions also pass.
No public OpenCode/models.dev tariff schema was invented.

## Implemented contract decisions

### Documents and request controls

Codex-account and Antigravity-Claude routes advertise PDF/document input as unsupported and reject typed attachments before upstream dispatch. Positive custom PDF declarations cannot create a missing native transport. CLI warmup/title bypasses do not override this admission. Gemini typed PDF bytes survive serialization; this is transport proof, not a live model understanding claim. Ordinary JSON result arrays remain data, even when they contain media-shaped records; one shared explicit-media predicate gates admission, conversion and modality stripping.

The output cap is never increased. An explicit numeric thinking budget is preserved or rejected with `invalid_thinking_budget`, the selected budget, required output allowance and original parameter. Generated provider defaults carry private request-local provenance and may fit inside the caller cap. Claude's numeric minimum is 1024 thinking tokens and the output must exceed the selected budget; 2048 is not a universal minimum. Explicit disabled thinking and the verified `reasoning_effort: "none"` workaround remain usable at 16 output tokens. Truly unset upstream-owned defaults are not assigned a fabricated numeric budget.

Antigravity efforts are not silently accepted: supported Gemini low/medium/high controls map natively, while unsupported or fixed-tier-conflicting values return 400. Claude numeric controls remain distinct from ordinal effort. GPT-6.1 Sol rejects ineffective none/minimal. The initial Luna-only Ultra allowance based on the owner's earlier report is superseded by explicit live native invalid-value rejections on October 22; current Codex routes do not advertise or dispatch Ultra. Public API, pinned CLI and effective route effort sets remain separately labeled. Structured output preserves the bounded non-strict Gemini subset or returns local 400; strict guarantees, unsupported schema constraints and Claude-backed Antigravity JSON mode are not silently replaced with prose.

### Public responses and account availability

Inference errors use `error: {message, type, code: string, request_id}` with matching `x-request-id`. Public diagnostics redact credentials, account identifiers, private paths, raw/debug payloads and hidden routing names while retaining actionable constraints. Engine-side sanitization has pure relative ESM dependencies; standalone executor imports do not require application aliases.

Explicit quota exhaustion is 429, credit/capacity unavailability 503, actual missing model 404, and proven retirement 410. Missing credentials is temporary 503, not a false permanent 404. Known retry deadlines survive direct, alias, combo and cooldown paths; no upstream reset is invented when absent. Local account retry deadlines are not upstream quota promises. Request-validation codes are authoritative over prose; quoted rejected values cannot supply quota or retry evidence. Diagnostics survive through account-health selection so malformed requests cannot lock siblings. Equivalent upstream aliases share locks; review quota families and distinct thinking tiers remain separate.

The response `model` echoes exactly the caller's ID, including review/tier/context-marker/alias/combo identity, without rewriting the upstream model. It is a request-identity echo, not proof of an upstream implementation or account. Chat JSON and SSE use Chat-shaped IDs with one stable ID per stream. Native Responses keeps native framing and IDs. The endpoint, not a Droid/Codex user-agent, selects the response format. Only upstream-provided readable reasoning summaries are exposed; encrypted continuity is not decrypted or replaced with invented thinking.

### Discovery, prices and accounting

Explicitly rejected Codex built-ins and review aliases are omitted from list, single-model and info discovery. Registry resolution for saved configurations and deliberate same-kind operator declarations remains. Reserve tools, Argon vision/effort consistency, conditional thinking constraints and search surfaces are route-specific. Dedicated Antigravity grounding is documented at `/v1/search`, not falsely advertised as an inline chat tool. Unknown independent maxInput stays unknown; unified context is not a guessed input allowance.

Ordinary `/v1/models` retains compatible capability fields and actionable metadata but excludes internal build/evidence paths, bundle details, captures and hashes recursively. Full audit metadata remains on the authenticated `/api/models` dashboard endpoint. Discovery is not a guarantee that every account has quota, entitlement, or accepts every operation.

Codex injects default instructions when absent; measured upstream prompt/cache tokens include that transmitted prefix. Metadata explains the overhead and possible shared/pre-existing cache on a client's first request; no fixed 2486-token offset is subtracted. Nested cache-read/write TTL and reasoning details survive forced-SSE aggregation without double-counting inclusive Responses input. Optional cache counts and delivered service tier remain absent when unreported rather than fabricated zeros/defaults.

API USD references and Codex credit plan tariffs remain separate labeled representations. Antigravity subscription token prices remain unknown; public Google/Anthropic API rates are not evidence of subscription debits. Native OpenAI 30m/12h and Anthropic 5m/1h writes remain distinct, as do inclusive/exclusive price thresholds. The host-local OpenCode generator omits ambiguous cost conversions instead of flattening lifetime/boundary semantics or converting unknown prices to free zero.

## Review and security disposition

Independent functional review identified generated-Claude default provenance and lost schema guidance; both were repaired and scoped re-reviewed clean. Independent security review identified validation-echo quota poisoning, spaced credential labels and literal Struct media misclassification. Repairs and regressions cover parser/classifier/reset/fallback/account-health boundaries, plaintext/JSON redaction and actual outbound literal-record fidelity. Scoped review closed all three reported findings. This is not a vulnerability-free certification.

The local client has no literal apiKey fields; private 0600 file substitutions preserve working credentials without depending on an unset environment variable. Seven host-local generator regressions pass. Production access was read-only SSH diagnostics; no production state, credentials or database were used by automated checks. No release, deployment or push is included. New-SHA GitHub CI remains deferred until a later authorized push; the existing base-SHA CI success is not proof for this branch.

## Final local verification — 2026-10-22

- Node 24 complete gates: `/var/log/zenrouter-dev/runs/20261022T103919Z-all-1f8572/`. 8,285 passing assertions, zero failed cases/suites, 100 optional/live skips, all 691 discovered files. Strict JSON report/inventory, composed zero-warning lint, provider/alias/OAuth/identity baselines, HTTP/2 compatibility, documentation tests, application/documentation builds and all four dependency audits passed. Source remained unchanged during verification.
- Node 22 complete suite: `/var/log/zenrouter-dev/runs/20261022T103701Z-test-c4d76c/`. The same 8,285 passing / 100 skipped assertions across 691 files, zero failures, strict report gate and source stability passed.
- Native HTTP/SQLite proof: `/var/log/zenrouter-dev/runs/contract-runtime-HAEVxY/`; packed artifact proof: `/var/log/zenrouter-dev/runs/contract-runtime-islQ7I/`. All 29 scenarios and all 45 advertised Codex/Antigravity chat routes passed against a synthetic loopback relay. Direct/combo/direct quota produced 429/429/429 with one inference attempt and valid retry headers. Six clients completed 600 health requests. These are transport/accounting checks, not live provider entitlement, PDF understanding or upstream invoice verification.
- Actual CLI build/pack/unpack: `/var/log/zenrouter-dev/runs/cli-contract-20261022T113045Z/`. Tarball SHA-256 `ccaaead9905fb40887ef5af63f93057167ae5f095c9084d3ac9812f3f7580d2c`; extracted runtime exercised by the packed proof above. No publish/install/deploy occurred.
- Real Chromium login/session/dashboard inspection used isolated state and blocked external origins. Screenshot and status are under `/var/log/zenrouter-dev/runs/browser-public-contract-final/`. This is not comprehensive dashboard feature coverage.
- Offline document admission proof: `/var/log/zenrouter-dev/runs/20261022T115334Z-public-contract-smoke-3A2XKD/`. All nine Chat/Responses, streaming/JSON and native Codex document scenarios passed, with zero upstream dispatches, usage rows, token charges or external I/O attempts. Fail-closed guard negative controls passed independently.
- Seven host-local generator regressions passed. Independent functional and security scoped re-reviews closed their reported findings after fixes. Earlier failed/focused/in-flight snapshots remain retained, not counted as final green evidence.

No push or production deployment was performed. GitHub CI for the new local commit must be checked after a future authorized push; the starting SHA CI success is not verification of these changes.

## Restart follow-up — public traceback suffixes

The resumed checkout contained local commit `113fe5ea` with a clean tree. Two
later saved focused reports recorded an uncommitted follow-up: three Python
traceback redaction failures at `20261022T125953Z-test-91926a`, followed by a
focused green candidate at `20261022T130044Z-test-228ff0`. Neither the extra
regressions nor their fix was in that commit. The green candidate therefore was
not evidence for the clean committed checkout.

Fresh regressions reproduced all three failures against `113fe5ea` in
`20261022T164251Z-test-00bd27`. The shared diagnostic sanitizer now removes a
Python `Traceback (most recent call last):` header or complete traceback-frame
line before collapsing whitespace or redacting individual paths. Headerless
syntax-error locations require an accompanying Python syntax exception; flattened
frames require indentation plus a Python filename or virtual frame. Filename
delimiters are handled independently so apostrophes in double-quoted paths do not
bypass redaction. Preceding validation guidance, code, parameter and correlation
remain intact; ordinary quoted file/line/field guidance is not a trace.

Independent review found three defects in the initial narrow fix: quoted
filenames bypassed removal, ordinary location guidance was overmatched, and
headerless syntax errors retained source excerpts. Fresh tests reproduced seven
failures at `20261022T165422Z-test-096246` and two stronger negative-control
failures at `20261022T165640Z-test-3bec7e`. The corrected two HTTP/native-stream
protocol suites passed all 72 assertions at `20261022T165718Z-test-9a8252`,
including the reviewer cases and direct SSE error serialization. Non-Python and
ANSI-decorated debug formats remain outside this narrow follow-up; no universal
upstream-debug sanitization claim is made.

No completed setup or main implementation was repeated. This follow-up uses
synthetic local verification only and does not access, deploy to or retest
production. Existing historical runtime/artifact evidence above remains separate
from verification of this follow-up.

Final follow-up verification (the source stayed unchanged during both full runs):

- Node 24 all gates: `20261022T165839Z-all-e94f11` — 8,299 passed, zero failed
  cases/suites, 100 optional/live skips, 691/691 discovered files; strict report
  and inventory gates passed. Composed zero-warning lint, baselines/identity,
  HTTP/2 compatibility, docs tests, app/docs builds and four dependency audits
  passed. The audits reported zero known vulnerabilities at the time of the run.
- Node 22 full suite: `20261022T170204Z-test-91d317` — the same 8,299 passed,
  100 skips, 691 files, zero failures and strict report/inventory gates passed.
- Real standalone HTTP follow-up: `traceback-runtime-kY8Pco` — all 48
  Chat/Responses × JSON/stream-request cases passed against a synthetic loopback
  upstream, including ordinary filename guidance. Each made exactly one upstream
  attempt; validation stayed HTTP 400 without retry headers. Error parameter,
  code, guidance and body/header correlation survived; trace/debug suffixes did
  not. Reported source/sanitizer hashes matched the frozen candidate.
- All three independent-review findings were reproduced and repaired with
  ordinary failing/passing regressions. Earlier green snapshots were superseded
  rather than counted as final verification. Non-Python/ANSI formats remain an
  explicit evidence limit, not a universal security certification.

## Authorized delivery and live findings — 2026-10-22

The owner subsequently authorized push to `master` before production access,
deployment and bounded live checks. `23c55b3b` was pushed first. Its exact-SHA
CI passed tests/docs but failed the dependency-security job after two Next.js
advisories were indexed. The approved targeted framework update to 16.4.2 became
`9b5a0db8`; CI run `39827222035` passed all three jobs and retained a matching
SHA/ref/report hash for 8,299 passing tests, 100 optional/live skips and 691 files.
Local full Node 22/24, browser and real-artifact synthetic transport checks also
passed. No audit gate was weakened and no npm/Docker publication was dispatched.

Production switched to the source-bound 16.4.2 artifact after private backup and
isolated staging. Database health and configuration counts remained unchanged;
readiness took 1.73 seconds. Four authenticated/unauthenticated public ingress
checks passed. The subsequent concerned-model run retained 53 passing checks,
three failures and five unavailable/timeout outcomes rather than claiming a
complete green provider sweep:

- All 17 advertised `cx` chat IDs returned nonempty 200 responses with exact model
  echoes. Reserve/base-review and Astra-review tools returned correctly correlated
  calls. Gemini read `ZEN-PDF-MARKER-42` from the valid PDF and returned the
  supported JSON schema; unsupported Codex/Claude PDF routes rejected before
  billable dispatch. Claude disabled thinking worked with the explicit 16-token cap.
- Fresh `gpt-6-luna` and `gpt-5.6-luna` Ultra requests reached the native account
  transport and returned HTTP 400 `invalid_value`, explicitly listing accepted
  values through `max`. The old positive metadata was therefore incorrect. New
  discovery/admission/native regressions failed eight cases before removing the
  unsupported allowance, then 104 focused assertions passed. Review aliases and
  model suffixes reject locally; supported Max and summary controls remain intact.
- The configured `gpt-5.6-sol` combo contains only `ort/cx/gpt-5.6-sol`, not the
  working direct Codex route. Its HTTP 523 came from that distinct compatible
  upstream. The operator's stored combo was not silently rewritten.
- Four restricted Antigravity routes returned genuine upstream 404 without typed
  quota/reset evidence. That does not establish quota exhaustion, entitlement or
  global retirement. One Gemini-high streaming request hit the client's 90-second
  timeout; the logged caller abort remains an unresolved availability observation.
- Runtime logs showed no module-load, uncaught, pipe, database or out-of-memory
  failure indicators. That is a bounded log observation, not an all-provider SLA.

Operational records are private on the development host under
`/var/log/zenrouter-dev/runs/production-23c55b3b-20261022/`. Gateway/provider
credentials remained on production; offline verification inherited only synthetic
state. These live observations do not verify subscription invoices or authorize
changes to saved provider/alias/combo configuration.
