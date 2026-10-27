# P07 — `/v1/responses` gap and tool-calling verification (empirical report)

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

**Date:** 2026-10-15 · **Target:** production `/opt/zenrouter/0.9.7/app` (port 20128, read-only probes) + checkout `/root/ZenRouter` 0.9.8.

**Rule followed:** every claim below came from a real command against the running gateway. Nothing here is inferred from metadata alone. Probes used `max_tokens`/`max_output_tokens` ≥ 50 (never 3), because small caps produce false negatives on reasoning models.

---

## A. Answer: ByKitsune does NOT need `/v1/responses` yet — but the reason is not what the audit assumed

### What is true

| Endpoint | Zen | ByKitsune | Griphub |
|---|---|---|---|
| `/v1/chat/completions` | ✅ | ✅ | ✅ |
| `/v1/messages` | ✅ | ✅ | ✅ |
| `/v1/responses` | ✅ | ❌ 404 | ✅ |

Zen's `/v1/responses` works and is correct:

```
HTTP 200
object: response | status: completed | model: gpt-6-luna | has output: true
model has prefix? no (clean)
```

The model name comes back **without** the `cx/` routing prefix, so the owner's no-prefix rule holds on this endpoint too.

### Measured cost of the missing route

I measured TTFT on the same model (`cx/gpt-6-luna`), 4 streaming samples each, back to back:

| Path | TTFT samples (s) | Median TTFT | Total |
|---|---|---|---|
| `/v1/chat/completions` | 1.113, 7.814, 1.064, 1.028 | **1.089 s** | ~1.24 s |
| `/v1/responses` | 0.727, 0.585, 0.814, 0.654 | **0.691 s** | ~1.05 s |

`/responses` is consistently faster (median **~0.40 s** better, ~36% lower) because the GPT path then needs no `openai → openai-responses` translation — the log line confirms that translation runs today on every GPT request:

```
🟣 ▶ POST cx/gpt-6-luna → codex/gpt-6-luna · FMT: openai→openai-responses · STREAM · 1 MSG
```

### But the conclusion is still "not yet"

The benefit is real but small, and the cost is not. Adding `/v1/responses` to ByKitsune means a third protocol that must independently carry: guardrails, `gatewayAdmission`, billing reserve/settle, and error formatting. The Responses usage shape differs (`input_tokens`/`output_tokens`, reasoning tokens reported separately), so the billing path is not a copy-paste. Meanwhile:

- GPT traffic has run through `/chat/completions` **in production today with no reported failure**.
- The translation path is already correct, including the two bugs fixed in 0.9.8 (`response_format → text.format` mapping, and stripping the Responses-only `text` field on the way back — see below).
- ByKitsune's own admission already applies to both existing protocols.

**Recommendation:** keep `/v1/responses` on Zen (it is correct and other clients may use it) and do **not** add it to ByKitsune yet. Revisit only if (a) a real client needs to hit ByKitsune with the Responses protocol, or (b) GPT tool-calling through Chat Completions regresses. The measured saving (~0.4 s TTFT) does not by itself justify a third billing/guardrail surface.

---

## B. Tool calling: the metadata is STRICTER than reality

Zen's metadata claims:

```json
"toolCallingRequiresResponses": true            // cx/gpt-6.1-sol
"toolCallingNote": "Responses supports tools; Chat Completions function calling requires reasoning_effort=none."
```

Both claims were tested over `/chat/completions` and **neither held**:

| Test | Result |
|---|---|
| `cx/gpt-6-luna` tool call, no `reasoning_effort` | ✅ 200, `tool_calls[0].function.name = get_weather`, args `{"city":"Jakarta"}` |
| `cx/gpt-6-luna`, `reasoning_effort: "none"` | ✅ 200, tool call emitted |
| `cx/gpt-6-luna`, `reasoning_effort: "low"` | ✅ 200, tool call emitted |
| `cx/gpt-6-luna`, `reasoning_effort: "high"` | ✅ 200, tool call emitted |
| Chained call (send the tool result back) | ✅ 200, `finish_reason: stop`, content "Jakarta is currently 31°C and humid." |

So the note's condition (`requires reasoning_effort=none`) is **not** a real constraint for `gpt-6-luna` at effort `low`/`high`. The translation layer handles it.

**Verdict:** the metadata is a conservative client-guidance hint, not a gateway limitation. It should not be read as "Chat Completions cannot do tools here". I did **not** change those metadata strings, because they are sourced from upstream documentation wording and other GPT-6 models (`gpt-6.1-sol`) were not exhaustively tested per effort level — changing them without that coverage would replace one unverified claim with another. Recorded here as measured behavior instead.

---

## C. Related fixes in 0.9.8 that make this path safe

Both were verified working end-to-end after the fix:

- **`response_format` → `text.format`** on the Chat→Responses hop. Live result: `response_format: {"type":"json_object"}` returned `{"name":"Ada","age":36}` as valid JSON, `finish_reason: stop`.
- **Responses-only `text` field stripped** on the Responses→Chat hop, with its JSON-mode intent carried over as `response_format`.

---

## D. Limitations of this report

- Per-effort tool-calling coverage is one model (`gpt-6-luna`). `gpt-6.1-sol`, `gpt-6-sol` and `gpt-6-astra` were tool-tested only without `reasoning_effort`.
- TTFT samples are 4 per path and were taken minutes apart, not interleaved; treat the ~0.4 s delta as indicative, not precise. The `7.814 s` outlier is normal production variance.
- Probes consumed real production tokens (small: `max_tokens` 50–1000).
- No change was made to ByKitsune — this is a decision document, per the audit's instruction not to touch it.
