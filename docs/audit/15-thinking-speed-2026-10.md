# Thinking probe and processing-speed follow-up

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

Base: `41074b570c9e2c8d769aecdd9e9167af59678450` (0.9.12).
Research date: **2026-10-19**. Evidence directory:
`/tmp/opencode/zen-thinking-speed-20261019/`.

## Reported thinking error

`Thinking budget cannot fit inside maxOutputTokens` originates in the final
Antigravity serializer when enabled Claude thinking cannot fit its minimum
within the request's output cap. That validation is correct for an explicit
impossible client budget and remains in place.

The dashboard model probe, however, generated `max_tokens: 1024` for every chat
model. This is already no larger than Claude's minimum thinking budget, leaving
no allowance for visible output. The new real-loopback regression reproduces
the false HTTP 400 for Claude 4.6/5.5 and verifies the corrected probe reaches
the synthetic upstream with its selected thinking preset intact. Only this
gateway-owned Antigravity Claude probe uses the bounded model output ceiling;
other probes keep their shorter cap. No provider limit is raised and no client
request is silently enlarged.

The provided `client_aborted` log is distinct: the client/probe closed before a
response completed. The Codex `refresh_token_invalidated` message also has a
different cause and still requires reauthorization of that specific account.
Neither is evidence that the thinking validator should be bypassed.

## Settings persistence

The UI already sent `providerThinking`, but both the generic settings endpoint
and SQLite settings repository omitted it from their allowed-key sets. A save
could therefore return success without preserving the choice. Both boundaries
now admit the intended configuration. The HTTP boundary validates mode maps and
rejects malformed/prototype-key inputs. Authentication, SSO and outbound proxy
settings remain protected against generic mass assignment.

Processing speed uses its own `providerServiceTier` map, never the reasoning
mode map. Native explicit request controls take precedence over provider defaults.

Dashboard reads and test results are scoped to the provider and selected
thinking/speed generation. A delayed refresh cannot overwrite a successful
save; an old Standard test cannot mark a new Ultrafast selection verified.
One active account's negative catalog does not establish that every account in
a multi-account route lacks the tier. Six independent React/Chromium checks
exercise these races in normal rendering and StrictMode.

At execution time, a known account-local tier denial excludes only that
account for the current request, without health writes, cooldowns, lowering the
tier, or treating the account as broken for Standard requests. Invalid/global
model requests remain terminal. This internal marker is never inferred from an
upstream 403; exhausting ineligible accounts returns an actionable 400.
An OpenAI account's unsupported residency is likewise account-scoped: only
other already-configured active accounts can be selected; no account's region
is rewritten and globally unsupported models remain terminal.

## Verified external protocol

Fast and Ultrafast are real OpenAI service tiers. The native JSON field is
`service_tier`; OpenCode's semantic `settings.serviceTier` is a separate client
configuration representation. Public API Fast accepts `fast` and the older
`priority` alias. Codex's client still lowers Fast to `priority`. Ultrafast is
`ultrafast`, not `ultra`, a model suffix, or a lower reasoning effort.

Current public API Ultrafast documentation names GPT-6 Astra and GPT-6.1 Sol on
Responses (HTTP or WebSocket), with model/region/rate restrictions. Codex
subscription access additionally depends on account, plan and workspace
permission. Unknown entitlement is not verified support. The UI must not imply
that generic Pro membership or buying credits guarantees access.

Source pins captured with hashes:

- OpenCode `501b15af26915ba52682e20e220e7e137e89e92f`: independent reasoning and
  service-tier options, Responses serialization and matching tests.
- Codex `8c076942cb70fba8e5c4732c23f1faabc4aed484`: Fast→Priority, Standard
  sentinel, account/model tier metadata and independent feature gates.
- OpenAI Node `3a3b8521a9278d68120c9256a0de4075acb82d80`: Responses and Chat
  enums, with Ultrafast absent from the Chat enum.

The generated API reference's older preview-availability text conflicts with
current guides and the October 8 changelog. The dated guide/model evidence is
used for availability, and SDK source for wire-field spelling. Full citations,
configuration examples and billing cautions are in
[PROCESSING-SPEED.md](../PROCESSING-SPEED.md).

Requested and actual tiers survive streaming/non-streaming translation and
SQLite token metadata even when request-detail bodies are redacted. Tier-aware
tariffs are not implemented here: nonstandard/unconfirmed cost estimates are
`null`, not Standard charges. This is an explicit estimator limitation, not a
claim of free premium usage or a provider invoice.

## Verification scope

- `tests/unit/model-test-thinking-budget.test.js`: real probe → loopback gateway
  → actual translator/executor → loopback upstream; explicit invalid client cap
  still fails before dispatch. Assert the internal serialized cap itself is a
  finite integer (64,000 for these 4.6 fixtures, 65,536 for the 5.5 bridge), not
  merely a downstream default that could hide a missing constant import.
- `tests/unit/provider-inference-settings.test.js`: real SQLite and settings
  route persistence, malformed mode rejection and protected-field preservation.
- `tests/unit/model-test-service-tier.test.js`: selected tier and model suffix
  survive the internal probe; invalid/non-chat controls fail before HTTP dispatch.
- `tests/unit/backend-speed-account-routing.test.js`: real account selection and
  loopback transport verify request-local ineligibility, soft pinning, bounded
  exhaustion, unchanged tiers, caller cancellation, and no account-health writes.
- `tests/unit/backend-speed-transport.test.js`: actual Responses endpoint/body
  selection, native controls, and preservation of uploaded `file_id` and inline
  `file_data`, including files attached to tool results.
- Backend and browser checks cover native tier serialization separately from
  the UI setting. Offline tests do not establish live subscription entitlement
  or actual throughput, and no production provider inference is used for testing.
