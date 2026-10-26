# P09 — Model coverage report (empirical)

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

**Date:** 2026-10-16 · **Target:** production gateway 0.9.7 on `127.0.0.1:20128` (read-only probes)
**Rule followed:** every row below comes from a real request with `max_tokens: 1000`. No model was called with a small cap, per the audit's explicit warning that small values produce false negatives on reasoning models.

---

## A. Every `cx/` route, tested live

| model | HTTP | cause | works? |
|---|---|---|---|
| `cx/gpt-6-astra` | 200 | — | ✅ |
| `cx/gpt-6.1-sol` | 200 | — | ✅ |
| `cx/gpt-6-sol` | 200 | — | ✅ |
| `cx/gpt-6-luna` | 200 | — | ✅ |
| `cx/gpt-5.6-sol` | 200 | — | ✅ |
| `cx/gpt-5.6-terra` | 200 | — | ✅ |
| `cx/gpt-5.6-luna` | 200 | — | ✅ |
| `cx/codex-auto-review` | 200 | — | ✅ |
| `cx/gpt-5.5` | 503→400 | **unsupported route** — "not supported when using Codex with a ChatGPT account" | ❌ |
| `cx/gpt-5.4` | 503→400 | same | ❌ |
| `cx/gpt-5.4-mini` | 503→400 | same | ❌ |
| `cx/gpt-5.3-codex-spark` | 503→400 | same | ❌ |

**8 work, 4 do not.** The four are rejected by the ChatGPT-account route itself, not by a missing credential, a quota, or a bad parameter — category **(b) account not entitled** in the audit's taxonomy. They are now flagged `routeAvailable: false` with a machine-readable reason, and their context window is deliberately left unset (advertising a window for an unservable route would promise what cannot be delivered). The ids stay listed so a stored combo resolves into a clear "not available" rather than a 404.

### Distinguishing failure causes (the audit asked for this explicitly)

| cause | evidence | action |
|---|---|---|
| (a) model does not exist | `morph/morph-dsv4flash` → 404 `model_not_found` | leave unverified |
| (b) account not entitled | `cx/gpt-5.4` → 400 "not supported when using Codex with a ChatGPT account" | flag `routeAvailable: false` |
| (c) transient / quota | `gemini/gemini-3.1-pro-preview` → 429 "exceeded your current quota" | **do not flag** |
| (d) retired upstream | `gemini/gemini-2.5-pro` → 404 "is no longer available to new users" | flag `deprecated` |

**(c) and (d) are the trap.** Both arrive as a failure, and flagging a quota-exhausted model would hide a working one. `gemini-3.1-pro-preview` is the clearest case: it returned 429 on first contact and looked broken, but it is in fact the model Google's own retirement message recommends as the replacement.

---

## B. `context_length` null — cause and resolution

**Reported by the audit:** 3 models. **Actually found:** 17 of 334 in production.

| model | was | now | why |
|---|---|---|---|
| `gemini/gemini-2.5-flash` | absent | **1,048,576** | was withheld, not unknown |
| `gemini/gemini-2.5-flash-lite` | absent | *hidden* (retired) | 404 "no longer available to new users" |
| `gemini/gemini-2.5-pro` | absent | *hidden* (retired) | 404, reproduced 5/5 |
| `gemini/gemini-3.x-flash` (6 ids) | absent | **1,048,576** | was withheld |
| `gemini/gemini-3.1-pro-preview` | absent | **1,048,576** | was withheld; alive (429 = quota) |
| `cx/gpt-5.4`, `cx/gpt-5.4-mini`, `cx/gpt-5.3-codex-spark` | null | **still null** | genuinely unservable — correct |
| `gcli/grok-build`, `morph/*` (6 ids) | null | **still null** | genuinely unverified — correct |

**Root cause of the "null" cluster.** Eleven Gemini metadata records declared `unverifiedCapabilityFields: ["contextWindow"]`, and `applyReviewedCapabilities()` nulls any field listed there. Because `/v1/models` only writes `context_length` when the value is finite, those models reached clients with **no window at all** — not a wrong number, an absent one.

The original reasoning was "Google does not document a combined input+output window". That is true, but withholding was the wrong call:

1. **models.dev's official google entries publish 1,048,576** for all of these ids.
2. **The routes are served** — verified live, HTTP 200.
3. **The owner's principle:** raising the number is correct, lowering it harms ByKitsune. A null removes it entirely, which is the worst of the three.

Result: models without a numeric `context_length` drop **17 → 12**, and every remaining one is either genuinely unservable or genuinely unverified. No number was invented.

---

## C. Models worth adding to ByKitsune

ByKitsune currently offers 12 models (`src/data/production-models-v2.ts`). Zen serves 334. These were each tested live and are **not** in ByKitsune:

| model | works? | context | max out | capability | worth adding? |
|---|---|---|---|---|---|
| `cx/gpt-6.1-sol` | ✅ 200 | 1,050,000 | 128,000 | reasoning, tools, vision | **Yes** — newer GPT-6 line, same account |
| `cx/gpt-5.6-luna` | ✅ 200 | 1,050,000 | 128,000 | reasoning, tools | **Yes** — cheap fast tier |
| `cx/gpt-5.6-terra` | ✅ 200 | 1,050,000 | 128,000 | reasoning, tools | **Yes** — mid tier |
| `cx/gpt-5.6-sol` | ✅ 200 | 1,050,000 | 128,000 | reasoning, tools | **Yes** |
| `cx/codex-auto-review` | ✅ 200 | 200,000 | 64,000 | review virtual model | Maybe — niche, review-only |
| `ag/claude-sonnet-4-6` | ✅ 200 | 250,000 | 64,000 | reasoning, tools | **Yes** — Claude via Antigravity |
| `gcli/grok-4.7` | ✅ 200 | — | — | reasoning | Maybe — ByKitsune already lists grok-4.7 from another channel |
| `gemini/gemini-2.5-flash` | ✅ 200 | 1,048,576 | 65,536 | vision, tools, 1M window | **Yes** — cheapest 1M-window option |

**Do not add:** `cx/gpt-5.4`, `cx/gpt-5.4-mini`, `cx/gpt-5.3-codex-spark` (rejected upstream), `gemini/gemini-2.5-pro` and `gemini-2.5-flash-lite` (retired), `ag/claude-opus-5-5` (404 in this environment).

**No change was made to ByKitsune.** This is a decision document, per the audit's instruction.

---

## D. Deprecation audit across all providers (added request)

Fifteen model-level `deprecated: true` entries exist, and the flag was **not enforced on the API path at all** — it was consumed only by the dashboard UI.

| provider | entries | reason recorded |
|---|---|---|
| clinepass | 4 | "no longer available on ClinePass" |
| codebuddy-cn | 5 | (EOL entries kept for stored combos) |
| deepseek | 2 | "Compatibility alias served by DeepSeek V4.1 Flash" |
| perplexity | 4 | "Standalone Sonar ended September 27, 2026" |

Reproduced with one active `deepseek` connection: `/v1/models` returned `deepseek/deepseek-v4-flash` and `deepseek-v4-flash-vision-exp`, both retired aliases. Now filtered — **but only a model's own flag**. A **provider-level** `deprecated: true` means `RISK_NOTICE` (a subscription/OAuth ToS warning) for claude, codex, antigravity, gemini-cli, github and kiro; treating that as retirement would have hidden all 19 `cx/` models. Verified after the fix: cx/ still lists 19.

---

## E. Cannot be verified

- `morph/*` (6 ids) — 404 with no credential; the cap is genuinely unknown, so it stays unset rather than guessed.
- `gcli/grok-build` — 402 spending-limit. The registry and the generic family pattern disagree (500,000 vs 256,000) and nothing settles it.
- `ag/claude-opus-5-5` — 404 in this environment; unclear whether unentitled or misnamed.
- Per-effort tool-calling coverage exists for one model only (`gpt-6-luna`).
- Probes consumed real production tokens with small caps (1,000). No entitlement is implied by a 200: a working call today does not guarantee quota tomorrow.
