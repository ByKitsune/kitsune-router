# Claude signature integrity and selective upstream review — 2026-11-11

## Scope and evidence

Base Kitsune source: `7f33c4db098e4e84d07314465293fdcd80ac44d6` (1.0.8).
Upstream reviewed: `decolua/9router` at
`54a88d0498ffea4e52576950235562ea420dc761`. Local remote `upstream` now
fetches that repository; `origin` remains `ByKitsune/kitsune-router`. The working
branch is `fix/claude-signature-integrity`. This is source work, not a release,
production deployment, or a change to historical tags.

The review team read all **239 existing repository Markdown/MDX files** in full,
including localized guides, historical audits/releases, the two ignored archived
plans, `.agents/product-marketing.md`, and both engine/test `AGENTS.md` files.
Installed dependencies and `.git` are excluded. Per-file paths, read attribution,
line/byte counts and SHA-256 receipts are in
[data/claude-contract-review-20261111.json](data/claude-contract-review-20261111.json).
Markdown coverage does not mean every executable source file received a complete
security audit. Source review here follows the Claude request, native/translated
history, tool alias/compression/deduplication, JSON/SSE and attribution paths.

The public [Claude Code repository](https://github.com/anthropics/claude-code)
was inspected at `e379c8eca0af5b02a49bf8e784aeefdd1308de6f`. It provides public
extensions/examples, scripts, documentation and changelog, but does not expose
the complete proprietary core request implementation. Neither its repository
nor the official API docs provide a way to guarantee an invisible gateway or
mint authentic provider signatures. No such guarantee is made here.

## Official contracts used

Official documents were retrieved on November 11; exact URLs, capture times,
byte counts and hashes are recorded in the JSON receipt above.

- [Thinking encryption](https://platform.claude.com/docs/en/build-with-claude/thinking#thinking-encryption):
  `signature` is opaque; do not interpret or parse it. Replay the original block
  unchanged. Streaming delivers it through `signature_delta` events.
- [Messages create schema](https://platform.claude.com/docs/en/api/messages/create):
  `signature` is a string, exactly as returned. Thinking blocks retain their
  original content and order. No E/R envelope, protobuf marker, canonical
  base64, or 32 MiB per-signature constraint is specified by that field schema.
- [Preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking):
  signatures can bind thinking to the preceding conversation, including tools
  and system instructions. Some current models also bind it to the producing
  account or linked accounts. Replaying the bytes on an unrelated account is
  not proof of valid ownership. Prefix errors and `input_transformations` belong
  to the client-visible protocol; gateways must not silently fabricate a repair.
- [Claude Code gateway protocol](https://code.claude.com/docs/en/llm-gateway-protocol)
  and [connection guide](https://code.claude.com/docs/en/llm-gateway-connect):
  preserve native request/response features and distinguish gateway credentials
  from upstream credentials. Provider/gateway compatibility is a documented
  deployment option, not evidence of provider endorsement or entitlement.
- [Mid-conversation system messages](https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages):
  system entries can retain per-message `output_config` and `clear_at`. Empty
  system entries can carry meaningful effort changes. A system message with
  `clear_at: "next_user_message"` cannot carry a prompt-cache breakpoint.
- [Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming):
  retain named Messages events, opaque content and native termination. Messages
  does not use a Chat Completions `[DONE]` sentinel.

## Confirmed defects and repairs

### 1. Undocumented signature decoding rejected opaque upstream data

`utils/claudeSignature.js` used to decode E/R base64 layers, check a protobuf
marker and inspect a cache-prefix convention. These observations were recorded
as structural checks in audit 29, but were never an authenticity guarantee or an
official invariant. The active tool-turn continuity check rejected nonempty
opaque values before dispatch; historical filtering could silently remove them.

The predicate now checks only the required nonempty string shape. It never
trims, decodes, re-encodes, strips `#`, invents or replaces a signature. The
upstream remains responsible for cryptographic authenticity, prefix and account
ownership. Routes already enforcing local continuity still reject missing or
wrong-type signatures in an active required thinking sequence explicitly.

The new opaque replay regressions failed **5/5 before the repair**. Tests now
exercise both native preparation and public same-format translation, caller
metadata, independent credential inputs and unchanged borrowed history. Old
base64-only tests were changed to genuine missing/type failures rather than
continuing to assert an undocumented wire format. Synthetic signature fixtures
prove byte fidelity, not live-provider authenticity.

### 2. Native normalization applied Anthropic signature rules to other vendors

`normalizeClaudePassthrough` filtered thinking from every Messages-compatible
provider, while generic preparation already allowed vendor-owned signatures and
unsigned DeepSeek reasoning. A request could therefore lose its reasoning only
when the Claude-client native shortcut was selected.

Filtering is now scoped to the native Claude/default contract. Other vendors'
original history thinking blocks and redacted data stay intact. All **6 new regressions failed
before the repair**, including real dispatch preparation with frozen borrowed
history and preserved caller attribution.

### 3. Deferred references disagreed with aliased or compressed declarations

Client tools were renamed, but `tool_reference.tool_name` remained unchanged.
Long-name compression had the same gap. Native server-search results also needed
response-side restoration or their aliases would reappear as foreign history
on the next request.

A shared helper handles only the two official typed containers:

- `tool_result.content[]` containing `tool_reference` blocks;
- `tool_search_tool_result.content.tool_references[]`, under the typed
  `tool_search_tool_search_result` object.

Both compression and existing request-local OAuth aliasing now map these names,
reserve unchanged historical reference names against collisions, and restore
response names in native JSON and SSE. Compressed aliases also avoid already
owned declaration/call/reference names. Ordinary application JSON, tool inputs,
text, web-fetch reference filters, signatures and redacted content are not
recursively rewritten. All **12 new regressions failed before the repair**.

### 4. Tool deduplication removed declarations still required by replay

MCP-equivalent deduplication could remove `WebSearch` while history still
contained a deferred reference or invocation of it. Upstream's fix deleted the
historical references. This review instead keeps declarations needed by typed
references, historical calls or explicit forced tool choice. It leaves history
unchanged, which is safer for signed replay. DeepSeek exact-name deduplication
still keeps one definition independently. The final request history and tool
choice are passed into this decision at dispatch.

### 5. Native system entries and mixed tool turns lost replay data

Legacy normalization folded all system entries into user content, losing their
position, `clear_at`, and per-message effort; empty entries disappeared. For the
canonical native Anthropic routes, explicit recognized system/prefix feature
beta tokens now preserve these entries and prevent system-message merging.
Turn-scoped system messages do not acquire an invalid cache breakpoint.

Separately, `fixToolUseOrdering` claimed text after `tool_use` was forbidden and
deleted all later non-thinking/non-tool blocks. It now retains assistant blocks
in their original order and content. Tool-result preparation must not truncate
an original signed assistant response. Existing user-result grouping remains.

The canonical Anthropic API-key executor now forwards explicit capability beta
tokens together with the body fields requiring them. It retains the API-key
header profile, excludes incoming OAuth/Claude Code identity flags, and checks
the exact official destination host. Canonical API beta rejections remain the
original upstream error and are not retried with a capability header removed
while its body fields remain. Existing Claude OAuth rejected-beta behavior stays
separate.

### 6. Thinking normalization dropped prefix-binding controls

The generic same-format route rebuilt `thinking` from mode/effort and removed
`block_binding`, including the caller's explicit `prefix_mismatch_behavior`.
Mandatory-adaptive normalization could delete the whole configuration when no
display preference was given. Native extension fields now remain with canonical
Claude thinking normalization, without capturing them into foreign formats or
inventing a capability opt-in. Incompatible off/binding combinations fail
explicitly rather than silently changing the requested policy. The canonical
Anthropic 4.6 manual-budget path also retains the existing native numeric budget.

## Selective 9Router reconciliation

Commits were inspected against Kitsune behavior; absence from Git ancestry alone
does not show that a fix is missing. No broad merge or blind cherry-pick occurred.

| Upstream commit / issue | Kitsune disposition |
| --- | --- |
| [`f4f5f183`](https://github.com/decolua/9router/commit/f4f5f18379b01218ca7742b8d0e4edce902b7161) deferred references | Adapted and extended to collision-safe compression and native response restoration; retained Kitsune's no-decoy and ownership protections. |
| [`a3039ab1`](https://github.com/decolua/9router/commit/a3039ab141c4dfc71aab434cdd2c94579bceaa42) stripped-tool references | Adapted by retaining replay-required declarations, instead of deleting historical reference blocks. |
| [`9ae6e147`](https://github.com/decolua/9router/commit/9ae6e14783f639b7ff0524fc16889647346ddb84), [#5592](https://github.com/decolua/9router/issues/5592) duplicate `[DONE]` | Already covered by Kitsune's rewritten parser/terminal handling and `stream-done-boundaries.test.js`; did not replace that implementation with upstream's older line-buffer patch. |
| [`7372d38d`](https://github.com/decolua/9router/commit/7372d38d7f7dda206b8168da32b730abff325bb6), [#4463](https://github.com/decolua/9router/issues/4463) `is_error` | Already handled in OpenAI-to-Claude tool serialization for ordinary and hybrid tool results. |
| [#5236](https://github.com/decolua/9router/issues/5236), adaptive thinking display | Already repaired by Kitsune thinking normalization and model-specific regressions; retained. |
| [#5184](https://github.com/decolua/9router/issues/5184), empty-text signed/redacted thinking | Relevant to the opaque replay repair; tests retain signatures even with empty thinking text and keep native redacted bytes. |
| [#4136](https://github.com/decolua/9router/issues/4136), global signature-cache poisoning | Reported process-global store is absent in Kitsune. Existing recovery requires an explicit request-local map; no global recovery added. |
| [#3685](https://github.com/decolua/9router/issues/3685), foreign server-tool IDs | Existing native/foreign ownership regressions retained; not imported as a new fix. |
| [#3646](https://github.com/decolua/9router/issues/3646), Google signatures over an OpenAI bridge | Existing owned-signature transport/quarantine retained; Google signature rules were not replaced by Anthropic's opaque-string predicate. |
| Runtime compression compatibility / client pins | No unrelated dependency downgrade or automatic client-identity bump imported. Kitsune's Node minimum and separately verified client pins differ from upstream. |

The stale generated-project fallback paragraph in
[Antigravity location diagnosis](../antigravity-location-error.md) was also
corrected against the existing executor: dispatch requires an account-provisioned
project and does not substitute a fabricated one.

## Validation

Final verification used Node 24.22.1 and the locked root/tests installations.
The full suite used `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`
because the default Playwright browser download was absent. The existing
19-case browser suite passed with that installed executable.

| Final check | Result |
| --- | --- |
| Full Vitest suite, `--maxWorkers=4` | **11,261 passed; 99 skipped; 0 failed**, across **880 test files**. |
| `verify-no-regression.mjs` on the final JSON report | Passed; report counts consistent, no failed suite collection. |
| Composed Oxlint + ESLint, `--max-warnings=0` | Passed. |
| HTTP/2 compatibility, `npm run test:compat` | 1 passed; 0 failed. |
| Source identity | All 23 changed JavaScript file hashes matched before/after final tests; hashes and report digest are in the JSON receipt. |
| `git diff --check` and audit relative links | Passed. |

The earlier in-progress full run loaded unfinished patch/test combinations and
reported a missing default browser executable; it was not treated as final green
evidence. After source stabilization and browser selection, the entire suite was
run again successfully. Focused reproduction counts above are not additive to
the final full-suite total.

New regressions cover opaque signatures; signed/redacted/omitted thinking;
UTF-8 and byte-fragmented signature deltas; SSE-to-JSON-to-request replay;
`input_transformations`; caller metadata; frozen borrowed input; vendor-native
routing; deferred references, aliases and collisions; deduplication; and system
and tool-turn replay.

## Remaining audit work and evidence limits

**November 12 follow-up:** the OAuth capability/header pairing, documented
stable canonical system-message policy and Responses long-name replay follow-ups
listed below are now implemented and verified in
[audit37](37-client-compatibility-completion-2026-11-12.md). The original November
11 scope and results remain historical; cryptographic/account ownership,
live-provider acceptance and whole-tracker evidence limits still apply.

- Existing Claude OAuth rejected-beta self-healing can remove a mandatory
  feature beta while retaining its dependent fields. This patch preserves that
  established retry policy; a follow-up should distinguish optional defaults
  from required caller capabilities. The canonical Anthropic API-key route
  returns its original rejection without inheriting this behavior.
- Unflagged stable mid-conversation system support still needs an explicitly
  reviewed capability policy per model/provider; this patch uses documented
  explicit feature opt-ins and preserves legacy folding elsewhere.
- Prefix integrity requires stable tools, system text and earlier messages for
  the whole session. Dynamic tool/config changes, compression policies and
  broader translated/native route differences require further session-level
  review. Preserving a signature string alone does not establish that its
  signed prefix is unchanged.
- Long-name compression of historical Responses `input` items needs a separate
  audit: this task's new collision scan follows Chat/Claude `messages` history.
  It does not establish collision safety for every Responses custom/function
  call or incremental tool-change representation.
- Account-bound thinking requires appropriate account/session affinity.
  Opaque data does not let the gateway infer producing-account ownership;
  arbitrary account fallback must not be advertised as signature repair.
- The large upstream issue tracker and provider catalog remain ongoing audit
  work. This first task reviews the selected Claude contracts and commits above,
  rather than claiming every upstream issue has been fixed.
- No live Anthropic account credentials were configured. Tests use isolated
  synthetic input, mocked provider responses and local HTTP fixtures. They do
  not prove live entitlement, cryptographic acceptance, invisibility, release
  publication or deployment.
- Security: previous removals of captured fallback signatures, token-derived
  account/device IDs, fabricated billing metadata, application-identity prompts,
  synthetic tools and global signature recovery remain intact. Authentication,
  quota/abuse enforcement, TLS and proxy boundaries were not relaxed.
