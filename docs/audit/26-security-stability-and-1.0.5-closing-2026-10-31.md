# October 31 security/stability closing and source 1.0.5

Review date: **2026-10-31, Asia/Jakarta**. Source base:
`52e74934351c5f07efd071c7f76628af971e159a`.
This is the closing source revision, directly from 1.0.2 to **1.0.5** across all
four package/lock pairs. There are no fabricated intermediate release records.
Source changes, local verification, tags, registry artifacts and deployment are
separate evidence boundaries.

[The closing evidence](data/release-105-closing-20261031.json) combines the
source/test reviews, independent checks, historical and current dependency
dispositions, and completed local outcomes. Fresh upstream evidence is inventoried separately below.

## Fresh upstream issue and public-advisory review

[The fresh source inventory](data/9router-release105-review-20261031.json) records
URLs, capture times, byte counts/hashes and per-item dispositions. 9Router master
remains `1fe586bb1cf35e1ed0cb2150a8ef7d1db040b21d`: **zero new commits** since the
previous review. The older 85-subject/selected-diff inventory is linked as earlier
evidence, not relabeled as a new complete diff review.

- Latest-created 25 and latest-updated 25 actual issues produce 38 unique records.
  Additional security/memory/leak searches bring title/date triage to 102 unique
  issue records. PRs are excluded; linked PR implementations were not adopted.
- Four newly changed/resurfaced issues are #2749, #5281, #5300 and #5346.
  Fourteen selected issue bodies and 12 loaded comments were freshly inspected;
  index-only records remain explicitly distinguished.
- All 19 publicly visible repository advisory details across two index pages
  were captured. Their latest publication is July 16. These publisher reports
  are not evidence of a newly reproduced exploit against this fork.
- The fork's public issue index returned zero results at capture. This does not
  establish the absence of private reports or undisclosed vulnerabilities.

[Cloudflare #2749](https://github.com/decolua/9router/issues/2749) reproduced in the
current actual outbound pipeline and was fixed. #5300 concerns DeepSeek Web PoW
packaging; this fork does not ship that executor/provider/worker. #5281's new
comment shows a quota API rejection, not sufficient evidence for changing chat
or refresh authentication. #5346 asks for a Muse provider; a new transport or
permission policy was not inferred from that feature request.

The existing GitLab DNS-pinned/redirect/error-redaction path addresses #4952;
usage aggregation already uses persistent key identity/hash and masked display
values for #2918. Existing disconnect/abort and bounded heap guards address the
reviewed #5188/#4914/#3365 paths. Thought-signature family provenance #4136 is
still unconfirmed for this fork; no speculative stripping/defaulting was added.
Whole-attempt TTFT/retry budgets remain a separate design rather than replaying
paid work or replacing the existing first-chunk guard with a 45-second wait.

A new [security policy](../../SECURITY.md) supplies the existing project support
contact and private coordination guidance. It does not claim a dedicated inbox,
response SLA or that GitHub private reporting was enabled by a settings change.

## Confirmed authentication and credential boundaries

### OIDC login nonce

`jose.jwtVerify` does not validate the OIDC `nonce` extension merely because it
is supplied as an unknown option. A correctly signed, issuer/audience-valid token
with the wrong or missing nonce therefore passed the previous helper. A real
ES256/JWK callback fixture reproduced creation of a dashboard session for a token
bound to another login.

The helper now requires the expected nonempty server-held nonce and compares it
with the signed payload after signature, issuer and audience validation. A
mismatch cannot establish a session. This is a login-binding defect, not evidence
that unsigned tokens or arbitrary unauthenticated login were accepted.

### Headroom compressor forwarding

An already authorized local-only compressor proxy copied internal router proof,
CLI/password headers and, for remote destinations, gateway API-key aliases.
Those headers authenticate the router, not a separate compressor process.

The proxy now removes `x-kitsune-router-*` headers for all destinations. Remote
compressors also exclude caller cookie/Authorization and `x-api-key`, `api-key`
and `x-goog-api-key`. Existing loopback authentication and public request
correlation retain their policy. Header removal iterates a snapshot so deletion
cannot skip adjacent fields. The outer local-only/target controls remain;
this is not a new unauthenticated SSRF claim. Preventing future forwarding does
not erase any earlier copies held by a compressor.

## Provider resource lifetime and catalog isolation

Kiro, Copilot, Cursor and Qoder legacy catalog paths were inspected for cache,
reader, timer, cancellation, refresh and invalidation lifetime. TTL checking only
on a cache hit does not bound a map of never-revisited credentials; clearing a
map also does not stop a stale in-flight operation from publishing afterward.

The follow-up applies bounded response/cache handling and scope fences while
preserving provider-specific wire contracts, proxy policy and existing request
deadlines. Caller aborts remain terminal, including during body consumption or
credential refresh. Returned catalogs/configs must not lend mutable cached
objects to downstream callers. The machine-readable closing evidence records
each provider's exact reproduced cases and final changes; these are local
metadata controls, not a certification of all process memory or live accounts.

Cursor also honors canonical enabled-URL/pool proxy configurations rather than
accidentally taking direct HTTP/2. Native HTTP/2 completion, abort, timeout and
error close the stream/session and release the signal subscription. Qoder
standalone PAT metadata receives a default deadline when no caller signal is
provided. Existing provider deadlines and freshness windows remain distinct.

Dashboard custom resolvers now forward the actual request signal and connection
identity. Abort checks guard dispatch, asynchronous resolver completion and Kiro
credential persistence; canceled work cannot become a successful static-fallback
response. Directional live limits survive the final dashboard response mapping.

Kiro and Qoder catalog facts keep native maximum input/output limits separate
from context. Missing fields no longer become invented 200,000/131,072-token
context windows or zero maximum output. Kiro missing credit multipliers do not
become 1.0x credits. Native labels/IDs, valid explicit zero/fractional credit
multipliers and decoded Qoder native configs remain intact; credits are not cash
prices. Other older Qoder feature-flag semantics were not newly certified.

## Model stream and media correctness

CommandCode can return an error after an earlier text/tool frame has already
committed an HTTP 200 stream. The old translator converted the error into
assistant prose and a successful stop. It now emits terminal structured failure,
retains previously measured partial usage, and suppresses later success frames.
The central parser recognizes native `statusCode`; native error-format mapping
is otherwise retained. Empty/metadata-only usage objects do not invent zero
measurements or overwrite earlier real counts.

A consolidated CommandCode tool snapshot now supplies arguments when an opener
never emitted nonempty argument fragments, without repeating tool IDs/names or
duplicating previously streamed arguments. Parallel tool state stays separate.

Cloudflare final parameter normalization flattens wholly textual arrays only.
Admitted mixed or image-only blocks reach the actual upstream request instead
of silently becoming empty text. Existing text-only joining and capability
filtering remain. A caption does not turn an image block into a text block.

## Dependency advisory and subsequent CI repair

The initial full root audit reproduced eight moderate entries from one advisory,
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The user
then supplied CI #158's exact failing transcript, confirming the same command,
matcher paths and advisory. Other jobs in that run succeeded. Those initial
reports remain dated evidence; they are no longer the final source disposition.

A subsequent tested API migration replaces all installed matcher nodes with
patched 11.0.3. A dev-only loader adapter is scoped to the three actual legacy
lint plugins; modern named-export consumers retain the publisher interface.
Its `makeRe(...).test(...)` compatibility uses the patched match implementation,
with no old regex engine or audit suppression. Existing rules, severity and
mandatory CI commands remain active. Both Node22.19 and24.19 passed the actual
policy/compatibility matrix; all four full audits now exit zero.

The user also requested all npm dependency updates. The resulting direct,
transitive and managed-pin review, changelog limitations, SAML/PKI migrations and
final graph evidence are in the [dependency/CI follow-up](27-dependency-upgrade-and-ci-repair-2026-10-31.md).

## Integrated verification and artifact boundary

The completed local checks are:

- **10,434 tests passed, 100 skipped, zero failed across 830 files** in the full
  Vitest run: 10,534 total assertions. The strict report validator confirmed
  complete collection and matching counts.
- Full composed lint passed with `--max-warnings=0` after the final root-CA ESM
  loader and workspace asset-copy corrections.
- The original full low-threshold npm audits for **root, CLI, tests and docs all
  exited zero**, with zero findings at every reported severity. The initial
  eight moderate minimatch entries are retained under
  `historicalInitialDependencyAudit` and marked superseded by the resolved
  migration; they are not a current unresolved CI blocker.
- The production documentation build exited zero and exported **109 HTML pages**;
  the final closing paragraph was checked in all five exported locales.
- The production Next 16.4.3 Webpack build and CLI pack after the x509 ESM loader
  and workspace asset-copy corrections exited zero. The final tarball has **3,220 entries and zero
  private runtime entries**, SHA-256
  `90ecff41ed37d4e6afa194d88e25105601576583a41d070ee5ea6bc8d2e3e815`.
  Unpacked smoke passed x509 3.1.0 certificate generation/signature, absence of
  legacy selfsigned, CLI version/help, standalone health with database true and
  version 1.0.5, and graceful exit zero. This tests an isolated unpacked candidate,
  not registry installation/postinstall or publication.
- Provider (83), alias (117) and OAuth baselines remained byte-equal. Installed
  direct dependency checks passed for root 48, tests two, CLI five and docs 12;
  the four-package version guard and brand identity passed. The i18n audit covers
  1,892 source literals with zero missing Indonesian translations. The CommonJS
  HTTP/2 compatibility check passed its one case.

The **production browser gate passed all 27 cases** after the workspace postbuild
copy was corrected. Its initial preflight stopped before any case because the
raw generated server directory lacked `custom-server.js`; CLI packaging had
completed its separate output. Postbuild now copies the runtime/static/public
closure beside the actual flat or nested generated server and rejects incomplete
or private-state-containing output. The two added regressions failed before the
fix, then all 26 affected packaging/fixture cases passed. Browser path, symlink and
environment-file protections remain active. Final package build and unpacked
runtime smoke were independently repeated afterward. New remote CI is checked
against the authorized push separately from these local results.

No real provider login, paid inference or customer database is used. No publication
workflow is dispatched, no old tag is moved, and no npm/GHCR/GitHub Release or
production deployment is established. Release workflow defaults target 1.0.5;
the separate 1.0.2 artifact history remains immutable. Existing effective secrets,
certificates and absolute private state must survive upgrades.
