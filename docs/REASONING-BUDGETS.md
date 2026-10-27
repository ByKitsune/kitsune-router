# Reasoning budgets, terminal states and actual usage

Research snapshot: 2026-10-06. Source baseline: `ae4102b5effdb5bcb35c797c8aff35bf396a65cf`.

## Why there is no universal 65,536-token minimum

The failure mode is real: a reasoning model may spend its combined output allowance before producing final text. OpenAI includes reasoning in `max_completion_tokens`, and its initial sizing guidance recommends reserving at least 25,000 tokens while learning a workload; it does not establish 65,536 as a universal minimum.[1][2]

Gemini generateContent likewise describes its maximum-output control as a hard cap including thoughts. Its thinking allocation is separate, and exhausting output while thinking can return truncated or empty output while still billing the generated thoughts.[5]

These rules cannot be copied to every OpenAI-compatible provider: current native xAI documentation says its `max_completion_tokens` applies to visible output, excluding reasoning and function calls.[6] A larger visible-output cap does not reserve or cap reasoning spend there.

Anthropic manual `budget_tokens`, adaptive effort and total `max_tokens` are distinct. Manual thinking has a documented minimum and ordinary budget/output relationship, with a model- and beta-dependent interleaved exception; it is not a universal formula for other providers.[3] Full thinking can be billable even when only a summary is displayed.[4]

**A larger cap can reduce some truncation risk; no fixed floor guarantees a nonempty answer.** A gateway must not describe a cap as a hard caller maximum while silently raising it.

## Kitsune Router's request policy

The baseline already contained a 65,536 reasoning-floor constant, but the real request paths applied it inconsistently. The corrections do not add another blanket floor.

- Preserve explicit positive output caps through the repaired converters and final serializers. Tools or high effort do not authorize raising them. Known model/endpoint ceilings may still clamp a larger request downward.
- Treat nullable OpenAI cap aliases as unset, retaining a finite fallback alias. `max_completion_tokens` takes precedence over legacy `max_tokens` when it carries a value. Invalid numeric values are rejected by the corrected validation seams.
- Forward modern caps through Gemini envelopes, Kiro, Ollama and CommandCode rather than replacing them with a hardcoded default. Keep provider-specific parameter names and semantics distinct.
- Apply existing gateway defaults only where a cap is omitted; those defaults and qualitative-effort-to-budget conversions are compatibility heuristics, not vendor-required numbers or answer guarantees.
- Preserve explicit client reasoning intent before provider defaults. Responses requests use `reasoning.effort` and retain native summary/continuity options; Chat requests retain their separate dialect.
- Keep numeric manual thinking, adaptive thinking, disabled thinking and dynamic thinking separate. A generated Claude manual budget must be valid without increasing the output cap. Impossible combinations return a request-scoped `400`, not a provider-outage `502`.
- Determine Claude manual interleaving from the supported model and **effective outbound** beta headers at the official endpoint. Incoming beta headers alone cannot grant a reseller feature. Rejected-beta retries reevaluate the budget; they must not resend an impossible configuration.
- Native Gemini soft thinking budgets may exceed a small output cap. Do not apply Anthropic's ordinary inequality to them. Native model-specific ranges and effort enums remain separate from unverified OAuth/reseller behavior.

### Routes that do not enforce the public API cap

Codex OAuth, OpenCode Muse and Cursor retain their existing unsupported-cap behavior. This change does **not** make an upstream spending-limit promise for those routes and does not blindly forward rejected fields. Cutting the client stream is not proof that upstream generation or billing stopped.

Native passthrough validation is not universal: some historical paths still delegate negative/oversized values to upstream validation. Unknown model limits remain unknown. A token cap is not an aggregate monetary budget, particularly across tool loops or configured fallback attempts.

## Dashboard model probes

The model Test button is a gateway-generated request, not a caller's output
budget. A fixed 1,024-token test cap cannot contain Antigravity's Claude minimum
thinking budget plus a visible response, and caused false HTTP 400 results.
Those probes now use the model/bridge's bounded output ceiling while retaining
the selected reasoning preset. Other probes keep their short cap. This does
not relax validation for a real client explicitly requesting an impossible cap.

Provider thinking choices must survive both settings allowlists (HTTP and
SQLite). They are independent of [processing speed](PROCESSING-SPEED.md), whose
native request field is `service_tier`, not a reasoning effort.

## Response and accounting policy

- Record actual usage for each paid attempt before classifying a budget-exhausted response. An empty final answer is not evidence of zero reasoning usage.
- Keep output totals inclusive according to the provider: Gemini candidate plus thought tokens are folded once; OpenAI/Claude inclusive totals do not add their reasoning breakdown a second time.
- Remove the artificial 2,000-token context reserve from actual client usage. Later authoritative usage trailers replace estimates, including explicit zero totals. If no actual usage is available, existing estimates remain estimates, not provider measurements.
- Recognize `response.incomplete` as a terminal event with its real usage and `incomplete_details`; do not invent a disconnect failure at normal terminal completion.
- Translate Chat `finish_reason: length` into Responses `status: incomplete` and `incomplete_details.reason: max_output_tokens`, preserving partial output. Keep refusals, valid tool calls and other usable output distinct from reasoning-only exhaustion.
- Native and forced-JSON reasoning-only exhaustion use structured `output_budget_exhausted` errors after accounting. Live streams retain their protocol's terminal status instead of attempting to change already-sent HTTP headers.
- Claim persistence once per request across completion and abort callbacks. A client that closes after reading a terminal event must not be billed twice or overwrite a completed request detail as aborted. Genuine preterminal cancellation still records available usage and cancels upstream.
- Use consistent combo stream predicates so a paid reasoning/refusal/terminal stream is not misclassified as an empty transport and replayed unnecessarily.

No larger-budget automatic retry was added. Existing configured model/account fallback remains in place, including its credential-health behavior; each incurred attempt must remain accounted for. This is not a promise that fallback or tool-loop cost is bounded by one request's token cap.

## Verification and limits

Regression tests cover translator and executor final payloads, nullable aliases, effective outbound beta/rejected-beta retries, JSON and SSE truncation, reasoning-inclusive usage, terminal-triggered cancellation, and duplicate/reentrant callbacks.

A real loopback HTTP test exercises the normal translator, executor serialization and fetch stack. A production standalone smoke creates isolated local credentials/provider nodes through the dashboard API, reads them back, routes only to a loopback fixture, and reads the actual SQLite usage table. It checks preserved caps, exact usage, paid empty-output accounting and exactly-once terminal-then-cancel persistence.

The recorded validation used an isolated HOME/DATA_DIR, fresh test-only secrets and no live provider inference. Offline fixtures establish the gateway's behavior at that snapshot, not upstream acceptance, current account entitlement, invoice parity or current rebrand verification. Source snapshots, exact commands, RED/GREEN evidence and final gate counts are recorded in the external task handoff. See [1.0.2 status](CHANGELOG_v1.0.2.md) and [migration](MIGRATION.md).

## Sources

[1] https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
[2] https://developers.openai.com/api/docs/guides/reasoning.md
[3] https://platform.claude.com/docs/en/build-with-claude/extended-thinking.md
[4] https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost.md
[5] https://ai.google.dev/gemini-api/docs/generate-content/thinking
[6] https://docs.x.ai/developers/rest-api-reference/inference/chat-completions.md
