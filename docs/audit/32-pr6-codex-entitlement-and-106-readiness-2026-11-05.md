# PR #6 Codex entitlement routing and 1.0.6 readiness — 2026-11-05

This **pre-bump source review** was captured while root, CLI, tests and
documentation manifests and lockfiles identified version **1.0.5**. The closing
record below documents the subsequent green gate and source-version change. PR [#6](https://github.com/ByKitsune/kitsune-router/pull/6),
head `e57480ef43cf0839dcf7b2a414ff2bf711082b6e`, was integrated as
`980d0558bbe684fdd4e39630e8b70ffba2f75044` over
`e03cec826a9c3c09943631e4253872dce1d7bff5`, then strengthened locally.
The pre-bump code/dependency commit is `17be4150ac247624f49bcb1ea49b55b00b29fd95`.
Exact final-source remote CI is required before the planned 1.0.6 bump.
This report does not establish a release, publication or deployment.

The [compact evidence record](data/pr6-codex-106-readiness-20261105.json)
retains source hashes, all 67 dependency declarations, publisher source references,
original reproduction results, compatibility decisions and verification hashes.
Raw logs, temporary databases and generated fixture secrets remain outside the
checkout. Recorded source hashes identify the reviewed worktree; they do not
turn a preliminary local run into immutable commit-level verification.

## Original defects and corrected routing

The original PR avoids repeatedly asking a ChatGPT account for a Codex model that
it recently rejected. It uses a bounded, process-local denial hint rather than
persisting unhealthy account state. Review covered all six original changed
files; none changed workflows, manifests or installation scripts.

An offline probe using the original PR's actual auth/config/cache source
reproduced a stale-hint failure. After account A rejected a model, importing
entitled replacement credentials under A's existing connection ID left the old
hint active. With account B quota exhausted, selection returned a local HTTP 429
without consulting A's quota or trying its replacement credentials. Clearing the
hint immediately restored A selection. Real temporary-SQLite/public-handler
loopback regressions subsequently reproduced direct re-authentication, late
old-credential failure/success, and eligibility-ordering variants.

| Boundary | Original behavior | Corrected behavior |
| --- | --- | --- |
| Account/import ownership | ID/model-only hints survived replacement and import. | SHA-256 keys bind the database, selection import generation, actual credential/account/workspace identity and normalized wire-model family; persistent import revisions are checked. |
| Eligibility | Denied A was removed before discovering that non-denied B was quota blocked. | Apply denial preference after quota, lock, exclusion and activity eligibility. A denied-only eligible pool still probes upstream. |
| Attempt ownership | A late response could publish or clear a hint for replacement credentials. | Capture context around actual refresh/dispatch, retain the original selection generation, and reject cancelled or stale outcomes after awaited reads. Legacy no-context callers do not learn hints. |
| Health cleanup | An old Codex success could clear a replacement's newer health lock. | Guard hint and health cleanup with attempt scope, then use the repository's transactional write fence. Only the expected stale-write error is suppressed. |
| Concurrent hint replacement | An awaited stale-entry lookup could delete a newer entry at the same key. | Invalidation deletes only its captured entry; success deletion also requires the attempt's import revision. |
| Evidence/privacy | A substring could memorize unrelated or differently named model errors. | Learn only canonical matching-model Codex HTTP 400 evidence, including the exact internal `[400]` wrapper. Retain expiry/revision and fixed-length digests, without raw credentials or upstream bodies. |

The cache retains the original **30-minute TTL and 500-entry cap**. Other model
and account scopes remain independent. Parenthesized effort variants share the
reviewed wire-model identity while the review quota family stays separate.
Legacy hyphen effort aliases can safely miss this hint; they are not silently
assigned a new identity. Routine credential rotation may conservatively discard
a hint. A plan change with unchanged credentials can remain unknown until expiry
or a successful probe. An account without a recent denial has unknown entitlement.

The strict HTTP 400 cache does not extend to the existing generic pre-output SSE
failure path synthesized as HTTP 503. No live Codex account acceptance, subscription
eligibility, production speedup or account-ban prevention is asserted. Timing
figures supplied by the PR author are not independent measurements from this work.

## Dependency refresh and compatibility

The November 5 publisher snapshot covers **67 direct declarations / 56 unique
packages** across root, CLI, tests and docs. Seventeen declarations across thirteen
packages were updated; the other fifty declarations already matched that stable
snapshot. All 67 final rows, URLs and capture hashes are in the evidence record.

| Package | Previous locked version | Selected version | Owning projects |
| --- | --- | --- | --- |
| `next`, `@next/third-parties` | 16.4.3 | 16.4.5 | root; docs uses `next` |
| `@xyflow/react` | 12.12.0 | 12.12.1 | root |
| `jose` | 6.2.14 | 6.2.15 | root |
| `lucide-react` | 1.66.0 | 1.69.0 | root, docs |
| `material-symbols` | 0.48.2 | 0.48.3 | root |
| `motion` | 14.9.0 | 14.9.1 | root |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 | 4.3.4 | root, docs |
| `globals` | 17.13.0 | 17.14.0 | root |
| `oxlint` | 1.90.0 | 1.91.0 | root |
| `vite` | 8.3.5 | 8.3.6 | tests |
| `vitest` | 5.0.5 | 5.1.0 | tests |
| Scoped `minimatch` override | 11.0.3 | 11.0.4 | root lint compatibility graph |

The refresh changes **164 of 885 locked locations**: 107 patch, 55 minor and two
major-version locations. The latter are `magic-string` 0.30.21 → 1.4.5 in root/docs,
explicitly accepted by updated Tailwind's `^1.1.0` dependency. This is not a forced
override. Root changes 107 locations, tests 5, docs 52 and CLI 0.

Four matching installs, installed-dependency checks and all four full audits at
the existing `low` threshold passed; audit findings at every severity were zero.
No new lifecycle-script package or new Node 22.19/24.19 engine conflict was found.
Exact esbuild/better-sqlite3 approvals remain scoped to their existing owners;
no global npm policy was changed. The supported runtime floor stays Node
**>=22.19.0**; this local verification used Node **24.19.0** and npm **11.9.0**.
Engine metadata is not execution coverage for every supported platform/runtime.

Reviewed exceptions remain explicit:

- Recharts pins the shared `reselect` location to 5.2.0. An individual Redux edge
  allowing 5.3.0 does not make that a compatible update for the shared location.
- Publisher-bundled WASM internals retain their exact bundled versions. No vendor
  bundle was rewritten to satisfy an outdated report.
- ESLint plugins still publish peer ranges through ESLint 9. Existing scoped
  overrides/compatibility adapters remain, with real policy/matcher tests on
  ESLint 10.14.0; upstream peer support is not claimed.
- npm's optional Sharp WASM reachability leaves the unchanged locked
  `@img/sharp-wasm32` / `@emnapi/runtime` rows marked extraneous in root/docs JSON.
  `npm ls` exits zero without missing/invalid peers; platform entries were retained.
- Runtime pins remain better-sqlite3 13.0.3, retained legacy branch 12.11.1,
  SQL.js 1.15.2, systray2 2.1.4 and esbuild 0.28.2. The legacy branch does not lower
  the supported Node floor. The unversioned docs `npx wrangler` deployment tool
  was inventoried separately; deployment was not run.

## Changelog history coverage

The expanded root `Unreleased` section now covers these five previously omitted
source commits, plus PR #6, its lifecycle corrections and this dependency refresh:

| Commit | Recorded behavior |
| --- | --- |
| `5412f004` | Matching SQL.js JS/WASM in the actual CLI package, fallback persistence and restart. |
| `aad49386` | Verified provider client/signature identity, credential destination consistency and draft-scoped UI checks. |
| `4c5b73c0` | Signed-history ownership, project/OAuth validation, native Responses/search, catalog/deprecation review and structured Usage content. |
| `d598b149` | Reviewed exact-version dependency install-script approvals. |
| `e03cec82` | Translator/SSE hot paths, local npm repair and web-fetch format fidelity. |

The complete `1.0.5` and older changelog suffix remains byte-identical to base
`e03cec82`; its hash is recorded. A historical source-version heading is not proof
of publication. Captured public GitHub reads returned HTTP 404 for the `v1.0.5`
release and tag reference. No 1.0.6 release heading, version bump or publication
is established at this snapshot.

## Local verification and pending exact-source gate

| Evidence | Result and boundary |
| --- | --- |
| Broad local Vitest preflight | **10,973 passed, 99 skipped, 0 failed**, 862 files / 2,417 nested suites; no Vitest `stderr` sections. The run began before/during the final two cache guards. |
| Production dashboard browser preflight | **32 passed**, exit zero. |
| Documentation preflight | **18 passed**; docs production build exit zero. |
| Application build, whole lint, CLI pack | Exit zero; lint uses `--max-warnings=0`. Package remains 1.0.5. |
| Owner routing cluster | **132 passed / 9 files** before the final two guards. The final focused scope suite passes **27 tests**; its two new regressions failed before correction while 25 controls passed. |
| Independent final review | **35 offline assertions passed** against recorded final auth/helper/chat hashes, including import, credential, health and concurrent-entry boundaries. |
| Coordinator's final narrow gate | **107 passed / 8 files**, strict whole lint and v1.0.5 version guard passed; packed SQL.js fallback persistence/restart passed. These results remain separate from remote commit-level proof. |

Final scoped source/test hashes were rechecked when copying the compact evidence.
The helper's reviewed hash `f50767df…` changed to committed `094e73d0…` when one
redundant trailing newline was removed; the evidence preserves both hashes and
does not describe earlier focused results as runs against those changed bytes.
The last two cache guards landed during/after the broad preflight, so that broad
result cannot certify the final source. The next gate must run on the exact
committed pre-bump branch, followed by the authorized version change and required
post-bump checks. Final remote run IDs, source/artifact verification and any later
release actions must be appended with their own evidence.

These synthetic/offline and local-loopback results do not test live provider
accounts, paid services or deployment. They do not claim all upstream issues are
fixed; the earlier [November 4 follow-up](31-translator-performance-and-upstream-followup-2026-11-04.md)
retains its separate scope and limitations.


## Green pre-bump gate and 1.0.6 source synchronization

[CI run 41997372229](https://github.com/ByKitsune/kitsune-router/actions/runs/41997372229)
succeeded on exact pre-bump commit `17be4150ac247624f49bcb1ea49b55b00b29fd95`:
all four jobs (`test`, `dependency-security`, `docs`, `candidate-package`) passed.
The downloaded source/report hashes match; the strict baseline confirms
**10,975 passed tests, 99 explicitly gated skips, zero failures across 862 files**.
Production dashboard browser checks pass **32/32** and docs pass **18/18**.
All four job annotation lists are empty. Actual npm/Node/React warning lines and
Vitest stderr sections are zero; fresh-runner Next build-cache advice is recorded
separately rather than hidden or counted as a code warning.

The unpublished 1.0.5 candidate matches that commit/tree and has SHA-256
`f8a77873c9ef4332d507aec7cbfd9ef84809a77e36a43a2c06b87ddc4bbb3a7c`.
Its matching SQL.js JS/WASM, forced fallback, persistence and restart pass.
The same archive passes isolated Linux x64 runtime checks on actual Node
**22.19.0** and **22.23.4**, using existing exact better-sqlite3 13.0.3 through
normal CLI runtime resolution: health/version, rejected unauthenticated access
and bad passwords, login/dashboard, 1,082 catalog models, preserved session/API
key after restart, and 0600 database/secret permissions. Both runtime logs have
zero warnings/errors. Containers have no network, provider accounts or installs;
this is runtime compatibility, not a live-provider test or a rebuilt image claim.

Only after all four pre-bump jobs succeeded, `node scripts/bump-version.mjs 1.0.6`
synchronized all eight manifests/locks. Their dependency graph is unchanged from
the verified pre-bump commit. Current notes, five localized changelogs and manual
release defaults now use 1.0.6. Historical 1.0.5-and-older root changelog bytes
remain unchanged. Post-bump local release contracts pass **81/81** across five
files; docs **18/18**, branding and the version guard pass.

The [gate and version-sync receipt](data/pr6-prebump-ci-and-version-sync-20261105.json)
records this ordering and runtime limits. Exact post-bump source and tarball
identities belong to the committed revision's
[CI runs](https://github.com/ByKitsune/kitsune-router/actions/workflows/ci.yml),
whose `verification-<sha>` and `candidate-package-<sha>` artifacts retain the
report/source hash and candidate checksum. No npm/GHCR publication, registry tag
promotion, GitHub Release, source tag or production deployment is performed by
this source-version change.
