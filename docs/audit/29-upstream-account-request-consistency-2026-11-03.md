# Upstream review: account request and connection consistency — 2026-11-03

Review date uses Asia/Jakarta; Kitsune source base is
`5412f00462855fcefc38cd7c5ac4a48ecdeaf6b8`. This follow-up fixes verified local
request/validation gaps while retaining the fork's prior protocol and security
work. It is source verification, not publication, deployment, live account
acceptance or a guarantee against provider account restrictions.

## Coverage and selection

The fresh paginated GitHub capture contains **5,231 records: 2,327 actual issues
and 2,904 pull requests**. All actual issue titles, states and dates are indexed;
23 selected issue bodies and their relevant local source paths were reviewed
in depth. Six issue comment endpoints were fetched completely, yielding two
comments. Screenshots/attachments and all PR diffs were not exhaustively read.
Indexing an issue does not establish a reproduced defect or completed fix.

- [Complete actual-issue index](data/9router-issue-index-20261103.json)
- [Selected dispositions, evidence and limits](data/9router-account-request-review-20261103.json)
- [Official client artifact and wire evidence](data/client-wire-refresh-20261103.json)

The issue capture's SHA-256 is
`e2b1d6f780e72c7d232503f96ba6b348ba95633ce94c3356c6c11f3b7886d97b`.
Its 2,327 issue numbers are unique; 1,520 are open and 807 closed. The index is
a dated snapshot, not a continuously updated issue tracker.

9Router master remains `1fe586bb1cf35e1ed0cb2150a8ef7d1db040b21d`, the same
October 28 source reviewed in the October 31 audits. There are **zero new master
commits** to cherry-pick. The 150-subject inventory and freshly inspected
CodeBuddy `3fd925a` / Command Code `b1effa0` diffs confirm that these header
changes are already represented or superseded by Kitsune. Re-importing them
would not add a new repair.

## Repairs implemented

| Area | Verified gap and resulting behavior |
| --- | --- |
| Client releases | Verified official source/artifacts advance Claude Code **2.1.314→2.1.317**, CodeBuddy CN **2.179.0→2.179.3**, and Kimchi **1.25.0→1.26.0**. Claude's SDK remains **0.128.0**; its API/OAuth/beta policy and CodeBuddy INTL identity remain separate. Codex, Gemini CLI, OpenCode, Command Code and Qoder already match official latest. |
| Gemini metadata | Quota retrieval and `loadCodeAssist` now send the shared reviewed auth-library user agent and executing Node runtime metadata, preserving the account's existing proxy configuration. |
| Claude signatures | Non-string values and malformed/noncanonical base64 in either E/R layer are rejected. Valid opaque signatures and redacted content are preserved. This checks structure, not cryptographic authenticity or account ownership. |
| Credential egress | Add/edit key probes resolve the same selected pool or relay as the saved connection. Missing/inactive selections fail closed; credential-bearing redirects are rejected. Caller cancellation and bounded deadlines cover fallback probes too. Qoder exchange/catalog share the selected route. |
| Connection destinations | Check and Save share base URL, region, Azure/Cloudflare data and proxy policy. Self-hosted STT/TTS probes use their configured runtime endpoint, including supported TTS root/full-URL forms. Fixed cloud endpoints cannot be redirected by an unrelated `providerSpecificData.baseUrl`. |
| UI state | Add/Edit Check results belong to the exact credential/configuration snapshot. Editing a key or endpoint clears its validity; late/aborted responses cannot certify another draft. Reopening/switching connections resets fields, and stored-connection tests cannot certify unsaved changes. Endpoint/region-only changes with a redacted existing key save as `unknown` until retested, preserving prior errors. Bulk validation preserves the selected pool; canceling a partial import refreshes acknowledged saved entries without continuing the import or updating another provider page. |

The UI/validation findings were independently reproduced locally. Related
upstream discussions include [#3303](https://github.com/decolua/9router/issues/3303)
and [#3810](https://github.com/decolua/9router/issues/3810), but their historical
reports are not identical to these repairs. [#4898](https://github.com/decolua/9router/issues/4898)
is a batch proposal closed by a maintainer, not evidence that a specific
upstream defect was reproduced or fixed. Signature discussions
[#885](https://github.com/decolua/9router/issues/885) and
[#2227](https://github.com/decolua/9router/issues/2227) motivate inspection;
structural hardening does not establish resolution of those live account reports.

## Important dispositions retained

| Issue | Result of current-source review |
| --- | --- |
| [#5385](https://github.com/decolua/9router/issues/5385), Antigravity tools | Not reproduced in the real translator plus executor transform: declarations/schema survive both stream modes. Native Gemini key aliases also have existing contract coverage. No live-provider claim. |
| [#5366](https://github.com/decolua/9router/issues/5366), omitted stream | Already covered by the current explicit client streaming decision and existing OpenAI/headroom regressions. |
| [#5371](https://github.com/decolua/9router/issues/5371), Kiro profile ARN | Body plus confirmation comment omit auth method and endpoint. Existing account-specific profile discovery must be preserved; inventing a shared ARN would be incorrect. Needs the actual credential-type/endpoint reproduction. |
| [#5367](https://github.com/decolua/9router/issues/5367), Zed schema | Representative real Antigravity→OpenAI→Claude translation normalizes type/nullable/array-bound forms. The offending schema is absent from the issue and comments; blanket tool removal is unsupported. |
| [#5421](https://github.com/decolua/9router/issues/5421), custom-provider limits | Registry-only catalog sync remains a design gap for arbitrary custom nodes. It requires explicit product identity or operator caps; punctuation matching cannot safely transfer another product's context/price/capability facts. |
| [#4136](https://github.com/decolua/9router/issues/4136), signature cache | The historical process-global store is absent. Keep request-local recovery and provenance; do not add a global signature fallback. |
| [#5275](https://github.com/decolua/9router/issues/5275), native TLS transport | Retain prior deferral of an unverified native transport dependency; an issue assertion alone is insufficient artifact/protocol evidence. |

Claude's verified changelog also announces Opus 4.8 fast-mode removal on
November 30, 2026. At this November 3 review it is not removed early and an
explicit paid-speed request is not silently downgraded. The release evidence
records this dated future action separately from the current wire contract.

## Verification

The final verification passed:

- **10,508 tests passed, 100 skipped, zero failures** across 834 Vitest files;
  the complete-report regression gate also passed.
- **31 production Chromium browser tests passed**, including four new Add/Edit
  credential/destination/status regressions.
- Production build and standalone state-exclusion guard passed.
- Changed-file composed lint passed with zero warnings; the 83-provider
  baseline and existing h2c compatibility check passed.
- The restored local server passed database health, bad-password rejection,
  login/session, dashboard HTML and temporary-key/model-catalog checks.

The [review JSON](data/9router-account-request-review-20261103.json) records
the initial failures, their diagnosis, corrections and final source hashes.
New network tests use synthetic data or local relays. The two pre-existing strict-proxy tests were
also isolated from inherited runner settings and live networking, with a new
positive environment-proxy case; production proxy settings remain unchanged.
No upstream account login, paid inference, publication or deployment is part
of this review.
