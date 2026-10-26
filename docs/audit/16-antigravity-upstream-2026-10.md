# Antigravity selective upstream reconciliation — 2026-10-21

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

## Scope and provenance

This is a local source change, not a release, deployment or model-entitlement
claim. Zen baseline: `5e16fa95fa1239b97ed614d38afd58af47314647` (0.9.13).
Upstream baseline: `87a74e1bda3677193c6f71a7e2100c90311f0689` (9router 0.5.104).
The pinned upstream changelog is historical evidence, not proof of current
native Google acceptance.[5]

The source audit enumerated all 1,431 commits reachable at the upstream pin.
Commit text plus 50 path histories produced a 426-commit candidate union.
Bounded public searches collected 153 unique issues/PRs (105 PRs, 48 issues);
detailed discussions and diffs were expanded for selected candidates, not every
historical issue. The original machine matrix contains 20 decisions: nine
already present, five reproducible gaps, three needing native evidence and
three unsafe/inapplicable. Counts, deduplication and 1,084 artifact checksums
were independently checked against the saved inventory.

## Runtime retirement and catalog

The prior authorized gateway audit observed a complete retirement notice,
rather than the challenge answer, on these four exact selections:

- `ag/gemini-3.5-flash-high`
- `ag/gemini-3-flash-agent`
- `ag/gemini-3.5-flash-low`
- `ag/gemini-3.5-flash-extra-low`

The registry retains their mappings for saved configuration resolution but
marks them deprecated so normal discovery does not promote them as active.
An explicit custom catalog declaration can remain visible; it cannot resurrect
a confirmed runtime retirement. The separate runtime allowlist returns HTTP
410 with `invalid_request_error` / `model_retired` after alias resolution and
before account selection, token refresh, project discovery or upstream dispatch.

This guard applies to public Chat, Responses, Messages and native Google chat
routing, regardless of the requested stream mode. It does not inspect generated
prose, clear account errors/Antigravity strikes, create model locks, estimate
usage or commit an HTTP-200 SSE response. Cancellation remains terminal and
authentication still precedes lifecycle diagnostics. Only an already-configured
combo/capacity adapter can select a different model; no replacement is invented.
Direct internal `handleChatCore` embeddings do not implement this app-level
lifecycle policy and should enter through the public routing layer.

`ag/gemini-3-flash` without `-agent` is deliberately retained: it actually served
the audit challenge. Newer 404/quota-restricted routes are not classified as
retired. Claude Sonnet 4.6, Claude Opus 4.6 Thinking and GPT-OSS-120b retain
scheduled-removal metadata for 2026-11-02, as documented on the official models
page captured on 2026-10-20; they are not prematurely hidden or blocked.[4]

A provisional text/absent-telemetry detector was discarded. The saved public
responses do not establish an authenticated Google-native envelope; synthesized
`model:"gemini"`, zero usage or even an exact quoted sentence cannot distinguish
all genuine model output from a service notice. Synthetic fixtures are labeled
as such and are not used as evidence of a native protocol contract.

## Selected upstream ports

| Candidate | Immutable source | Adaptation |
|---|---|---|
| M01: inherited native `requestType` | `5798b308419d3798a706b2756e39d59dda9d8a29` | Remove the legacy field from the outbound chat copy; preserve the caller input, image generation and dedicated search.[1] |
| M02: empty tool enum/const | PR #4973 head `a4394d17056fd8b4917277d9af736d6846db978f` | Filter invalid empty/null members using Zen's existing schema walker; retain zero/false stringification and keyword-named properties.[2] |
| M03: array-valued tuple `items` | PR #4798 head `724972f3f8f5ea134190f59e7e2b60fc902fb35c` | Convert homogeneous tuples to a single Schema object; reject heterogeneous `items`/`prefixItems` before lossy conversion, using local HTTP 400 `unsupported_parameter`, `param:"tools"`, with an `unsupported_schema:` reason.[3] |

The PRs were open/unmerged at the captured heads. These are selective local
adaptations, not claims that the patches were released upstream. No dependency,
wire identity, model tier, client cap, sampling setting or account entitlement
was changed.

### Schema limits

The legacy Google tool sanitizer is not a strict JSON Schema compiler.
Stringification of numeric/boolean enum literals already existed. Filtering
empty/null members narrows mixed enums; dropping an exhausted enum broadens its
constraint. Nonempty whitespace is preserved, not trimmed. Explicit original
types remain unchanged. Callers needing exact enum/const semantics must use a
backend/validator that can represent them.

Homogeneous means structurally equal original schemas, ignoring object-key
order but preserving differences in constraints, annotations and references.
The new check runs before conversions can erase those differences. It does not
preserve every tuple length rule. Explicit `additionalItems` (draft-7) or `items`
tails (with `prefixItems`) must structurally match the homogeneous prefix;
incompatible, boolean or malformed explicit tails are rejected locally. This
also prevents mixed-draft array tails from being normalized before validation.
An omitted tail still uses the legacy approximation and can narrow unconstrained
tail positions. Empty legacy `items:[]` retain the bare-array string fallback
only without an explicit `additionalItems`; empty `prefixItems` leave an ordinary
items schema unchanged. Direct type shorthands are expanded without lossy
conversion before equality checks. Ref stripping, generic composition selection
and Zen's object placeholders remain legacy compatibility behavior.
Production callers clone parameters; direct sanitizer mutation remains its
existing contract.

The throwing tuple guard traverses only actual schema maps, schema slots,
combinators and schema-valued dependencies. Annotation/literal values in
`default`, `examples`, `enum`, `const` or vendor extensions are not interpreted
as schemas because they happen to contain `items`/`prefixItems`. The existing
general-purpose compatibility transformations keep their prior traversal.

## Deferred or rejected changes

- M04 structured-output intent loss is reproducible, but PR #4667 introduces a
  broader compiler/validation surface. Native support across Gemini and
  Claude-on-Antigravity needs separate evidence and regressions.[6]
- M05 structured ErrorInfo/RetryInfo reset metadata remains a reproducible gap.
  The investigator's initial assumption that another task had already fixed it
  was incorrect. This branch does not implement that parser. Preserve existing
  trusted quota windows and generic-hint caps; do not blindly copy an untyped
  timestamp/duration parser or uncap every reset value.[7]
- Do not import insecure-TLS fallback, account penalties/retries for caller
  cancellation, or wholesale retirement of the working non-agent Flash route.
- No evidence justifies a Hub/IDE/CLI version bump, invented Argon/Claude IDs,
  higher client caps, changed effort tiers, or automatic model downgrades.
- No transport change is claimed to fix HTTP 524. Existing pings start after
  upstream headers; JSON/SSE aggregation still waits for the complete body.
  Offline traces demonstrate retry/body deadline gaps, not the deployed cause.
  A separately configured logical-request deadline and phase telemetry require
  a deployment contract; forcing SSE alone is not a demonstrated cure.
- Argon/Claude 5.5 generic resource 404 remains unresolved account/project/
  surface/native acceptance. A source patch cannot grant missing entitlement.

## Verification and reproducibility

Each selected behavioral fix has saved RED/GREEN evidence. The untouched
baseline full run recorded 6,265 passing and 100 skipped tests, zero failed
cases/suites. Focused parent retirement/catalog/protocol tests recorded 83
passes; schema-related verification recorded 639 passes in 46 files;
requestType-related verification recorded 225 passes in 14 files. These runs
overlap and must not be summed as independent coverage. The final combined run
recorded **6,503 passing and 100 skipped/todo tests across 600 result files**, with
zero failed cases or suites: 238 additional passing cases versus the untouched
baseline. Lint, build, compatibility, GitBook and provider/alias/OAuth/identity
gates all returned exit code zero.

An initial independent port review caught the explicit tuple-tail issue despite
the earlier passing suites. The corrective slice added sanitizer/executor/Core
RED/GREEN regressions and recorded 142 passing focused tests (including 101
upstream-schema cases) before the final full rerun and static re-review.
A second review exposed literal-data traversal; its corrective slice recorded
28 expected RED failures and 152 focused GREEN passes, including 150 schema
cases and two existing MCP regressions. The final artifacts supersede both
earlier passing full runs and preserve the blocking review evidence.

The delivery contains the final full-suite JSON, command/exit-code manifest,
source hashes and independent review verdicts. Always inspect those current
artifacts rather than treating the earlier preliminary run as the final result.
Live provider suites remain opt-in; skipped cases do not prove model access.

Re-run with a disposable absolute `HOME` and `DATA_DIR`, no production `.env`,
and `RUN_REAL=0 RUN_E2E=0 RUN_LIVE_TESTS=0 AG_CACHE_TEST=0 MODEL_CATALOG_SYNC=off
DISABLE_BACKGROUND_TOKEN_REFRESH=1 ZENROUTER_DISABLE_MITM=1
NEXT_TELEMETRY_DISABLED=1`:

```sh
npm test -- --maxWorkers=2 --maxConcurrency=4 --reporter=json --outputFile=/absolute/path/final-full.json
node tests/__baseline__/verify-no-regression.mjs /absolute/path/final-full.json
npm run lint -- --max-warnings=0
node tests/__baseline__/verify-providers.mjs
node tests/__baseline__/verify-alias.mjs
node tests/__baseline__/verify-oauth-urls.mjs
node scripts/generate-provider-identity.mjs --check
npm run test:compat
npm --prefix gitbook test
NEXT_DIST_DIR=.next/antigravity-verify npm run build
```

Independent review covers both the lifecycle and selected-port executable diffs.
No real credentials are added to source, fixtures or reports. TLS, SSRF, egress,
quota/account-health boundaries and explicit caller output caps remain intact.
A separate authenticated standalone HTTP smoke test was not executed because
terminal approval expired; it must not be reported as passing. No push, remote
CI, release publication or production deployment is included.

## Sources

[1] https://github.com/decolua/9router/commit/5798b308419d3798a706b2756e39d59dda9d8a29
[2] https://github.com/decolua/9router/pull/4973
[3] https://github.com/decolua/9router/pull/4798
[4] https://antigravity.google/docs/models.md
[5] https://github.com/decolua/9router/blob/87a74e1bda3677193c6f71a7e2100c90311f0689/CHANGELOG.md
[6] https://github.com/decolua/9router/pull/4667
[7] https://github.com/decolua/9router/commit/a07ed95beae8ce295907082220c386e8e7db138b
