# 07 — Upstream sync analysis: decolua/9router (1–13 Oct 2026) → Zen

Analysis date: 2026-10-13 · Zen base: v0.9.7 (2026-10-06) · commit `2c61f4f1`
Upstream state in window: **273 issues+PRs created**, 46 commits on master
(`v0.5.95` 1 Oct → `v0.5.99` 8 Oct; master quiet 9–13 Oct, PR flow continues to 13 Oct).
Zen's last documented upstream sync: v0.5.95 line + selective ports (#4143/#4533/#4481/
#4523/#4412/#4513/#4536/#4532, see CHANGELOG.md) → **everything in v0.5.99 and ~150
post-99 PRs is unverified territory**.

Method: full issue/PR list via GitHub search API (3 pages, merged), commit list via
commits API, release notes for v0.5.95/v0.5.99 fetched from the bump commits, then
~100 highest-signal items verified item-by-item against Zen code + CHANGELOG by four
parallel auditors. Every PARTIAL/MISSING verdict below cites a file:line port target.
Raw issue dump: 273 items (92 pure issues, 181 PRs).

**Verdict totals (100 items scored): 33 ALREADY-IN-ZEN · 31 PARTIAL · 30 MISSING ·
4 NOT-APPLICABLE · 2 overlaps/n-a.** Zen is *not* badly behind: its 0.9.7 release
(6 Oct) independently landed the client-identity/catalog sweep, and several pins are
*fresher* than upstream (Grok CLI 1.0.46 vs upstream's 1.0.44; Codex 0.160.0). The real
gap concentrates in (a) v0.5.99 features, (b) the OpenCode free-tier 403 cluster
(11–13 Oct), (c) a handful of tiny mechanical fixes.

---

## 1. Tier 1 — Quick wins (S difficulty, port these first)

All verified against Zen code; each is hours, not days.

| Upstream | What | Where it lands in Zen | Effort |
|---|---|---|---|
| #4628 | `matchPattern` compiles `new RegExp` per pattern per call (15–25× slower) | `open-sse/providers/pricing.js:517-519` — module-level `Map` memo, ~8 lines | S |
| #4633 | `stream_options:{include_usage:true}` never injected for generic OpenAI-compatible streaming → **silent missing usage stats** | `open-sse/executors/default.js` request transform (only `iflow.js:102` does it today) | S |
| #4715 | Combo stops on "insufficient credits" / `DEPLOYMENT_DISABLED` carried on HTTP 400 (402 already falls through via `errorConfig.js:133`) | 2 entries in `open-sse/config/errorConfig.js` ERROR_RULES (`{ text: "insufficient credits", cooldownMs: 0 }`, `deployment_disabled`) | S |
| #4718 | `x-connection-id` account pinning works for image/video but **chat path never reads it** | `src/sse/handlers/chat.js` → pass `preferredConnectionId` to `getProviderCredentials` (support exists: `auth.js:85,265-269`). **Security note: verify the pinned connection belongs to the resolved provider before honoring.** | S |
| #4584 | `body.model` used raw — no trim/normalization at API boundary | `src/sse/handlers/chat.js:73` — `String(body.model ?? "").trim()` | S |
| #4643 | Exact Codex image token usage dropped | `open-sse/translator/response/openai-responses.js:640-647` + `streamToJsonConverter.js` — read `input_tokens_details.image_tokens`, ~15 lines | S |
| #4691 | commandcode upstream rejects max_tokens > 200k; Zen defaults 64000 with no ceiling | Mechanism exists: add `{ provider: "commandcode", maxOutputCap: 200000, clampToModelMaxOutput: true }` to `paramSupport.js` STRIP_RULES | S |
| #4607 | **Zen's own** Codex flattener drops `strict`: `executors/codex.js:108-114` `delete tool[k]` then rebuild without copying `strict` | Copy `strict` before delete (translators already preserve it both directions) | S |
| #4547 | Chat `response_format` dropped on Chat→Responses (json_schema fallback is OpenAI-wire only) | `open-sse/translator/request/openai-responses.js` field-passthrough block (~:451) | S |
| #4637 | Responses-only top-level `text` field leaks to glm-5.3-flash → 400 | `delete result.text` in `openaiResponsesToOpenAIRequest` (`openai-responses.js:256-267`) | S |
| #4706 | github Responses path forwards unsupported `temperature` | `open-sse/executors/github.js:99-110` transformRequest — delete it (paramSupport already handles the chat path for gpt-5.4) | S |
| #4735 | `safeguard_results` forwarded in claude→openai response but **dropped in openai→claude SSE** (the direction Claude Code consumes) | 2-line guard in `open-sse/translator/response/openai-to-claude.js` (mirror `claude-to-openai.js:178-180`) | S |
| #4635 | Effort-annotated ids (`model-xhigh`) mis-price via generic pattern when no exact entry | `getPricingForModel` (`pricing.js:536-584`): strip trailing `-xhigh/-high/-medium/-low/-minimal` and re-resolve after declared-alias miss | S |
| #4681 | Model picker offers providers whose only connection is disabled/errored → 404 at dispatch | `ModelSelectModal.js:225-235` filter by `isActive && testStatus !== "error"` (or server-side in `/api/providers` GET) | S |
| #4507 | `gemini-4-argon` caps: zero hits | `capabilities.js` MODEL/PATTERN entry | S |
| #4514 | `longcat-2.5*` has no capability entry (metadata only) → DEFAULT caps | One PATTERN_CAPABILITIES line (`capabilities.js`) | S |
| #4524-kin | codebuddy-cn missing `kimi-k2.8-preview` row (newest is k2.7, `registry/codebuddy-cn.js:62`) | registry row + caps — data-only | S |
| #4548-kin | Antigravity registry stops at claude-4-6; upstream added Sonnet/Opus 5.5 rows | `registry/antigravity.js` model rows — data-only | S |
| 24034f69 | MITM default still maps `gemini-default` → **3.5-flash-low** (`src/mitm/config.js:53`) while catalog is 3.8 | One-line synonym change | S |
| #4740/#4785/#4731 | New OpenAI-compatible providers (ParalonCloud, v1m System One, clef-flash) | Pure registry files + metadata (Zen custom-provider infra is generic) | S |

## 2. Tier 2 — User-visible bug clusters (M, prioritize by pain)

**OpenCode free-tier 403 cluster (#4777/#4778/#4780/#4781, PRs #4782/#4784/#4786) — the
hottest upstream thread (11–13 Oct).** Root cause per upstream diffs (fetched):
free-tier models are gated on an *attested* identity — the keyed lane must switch to
`Bearer public` + a **stable per-credential** `ses_` session id (hash-translated sessions
403), and session/request ids must use the **inverted-timestamp encoding**
(`~(BigInt(ts)*0x1000n + counter)`), not plain `Date.now()`/sha256. Zen's
`open-sse/executors/opencode.js:24-44,71-77` mints canonical sessions with
`Date.now().toString(16)` and derives `msg_` from sha256 — i.e. the same bug shape
upstream just fixed. Complexity: upstream now has a **separate
`open-sse/executors/opencode-zen.js` (12 KB) keyed lane** that Zen lacks; port = adapt
attestation + timestamp encoding into Zen's single executor (or adopt the split). **M.**

| Upstream | What | Port target in Zen | Effort |
|---|---|---|---|
| #4774/#4771 | `zai` thinking on **Anthropic wire** emits `thinking:{type:"enabled"}` with no `budget_tokens` → z.ai's `/api/anthropic/v1/messages` 400s | `thinkingUnified.js:316-332` — add budget mapping / always-on omission when destination is claude wire (Zen's multi-endpoint glm transport mitigates most traffic) | S/M |
| #4612/#4557 | Claude Code deferred MCP tools (`tool_addition`) forwarded raw to Kimi → 400 | `formats/claude.js` (handles deferred only for cache anchoring today) — add dispatchable conversion | M |
| #4750 | Non-streaming HTTP 200 with empty content returned as combo success (streaming empties already guarded twice: `rejectFastEmptyStream` + `peekStreamForContent`) | `combo.js:589` — JSON emptiness check before returning non-SSE 200 | M |
| #4732/#4786 | ClinePass auth fails after upstream update — identity/session validation (`ses_`/`msg_`) layer absent in Zen OAuth path | `src/lib/oauth/providers/clinepass.js:9-44` + route — needs upstream #4786 diff replication | M |
| #4688/#4669 | Ollama Cloud quota invisible (no `/api/balance` usage fetcher; only `/api/usage` in `usage/misc.js:34`) | `open-sse/services/usage/` new fetcher + ProviderLimits rendering | M |
| #4618 | models.dev sync never emits context limits for user-defined nodes | `src/lib/modelCatalog/sync.js:161-186` — include nodesRepo/customModels in `collectEntries()` | M |
| #4627/#4682 | Combo context_length/min-tokens computed across **inactive** seats ("weakest seat wins") | `src/app/api/v1/models/route.js:252-289` — skip members without active connection | M |
| #4683 | One seat's request-scoped 4xx (400/406/413) aborts the whole combo | Thread a `requestScoped` flag from `checkFallbackError` → `combo.js:630` honors with `continue`. **Keep Zen's intentional account-level no-cooldown** (audit doc 03 §2.5) | M |
| #4656 | GLM-5.3 `thinkingCanDisable:false` pinned while upstream made disable work on zai wire | flip + verify `thinkingUnified.js` zai off-switch + test; also fix zai/openai thinkingFormat inconsistency (`capabilities.js:142` vs `:257`) | S/M |

## 3. Tier 3 — Feature gaps (bigger; schedule deliberately)

| Upstream | Feature | Zen status | Effort |
|---|---|---|---|
| #4756/#4541/#4538/#4560 | Per-API-key access control (restrict key → combos/models/providers) + request-logs page | `apiKeys` schema is `isActive`-only (`schema.js:78-87`); no per-key usage linkage. Full migration + validation hook + logs page | **L** |
| #4708 | API-key expiration (presets + custom date) | No `expiresAt` column; `validateApiKey` checks isActive only. Build on the ACL migration | M |
| #4755 | Live per-key metrics on key cards | Depends on per-key usage linkage (above) | M |
| a9d0ad26 / #4157 | AWS Bedrock provider (SigV4 signer + EventStream + AWS SSO creds) | Only a Kiro error note exists; real executor work | **L** |
| Cursor line #4699/#4719/#4690/#4596/#4598/#4692/#4550/#4689 | AgentService completion: tool protocol on h2 path, retained sessions, checkpoints, lineage, DashboardService quota | Zen has the basic Run path + reasoning-effort forwarding (`cursor.js:46`, `cursorProtobuf.js:533-536`) but ~70% of the upstream line is absent (comment `cursor.js:77-79` defers tool protocol) | **L** |
| 31704db / 8a90d3c | CLI `connect` (remote servers) + Pi/Oh My Pi tools | Zen CLI client is strictly localhost with file-based trust — **remote tokens need a security design pass first** (audit doc 04 §6: CLI token is a host-local bearer) | **L** |
| 068ce87 | GLM Coding Z.ai OAuth (dual-auth) | `registry/glm.js` API-key only; no `src/lib/oauth/providers/glm.js` | M |
| 28809807 | Meta Muse provider (OAuth + catalog) | Missing; transport behavior (Responses-only routing, effort nesting) already generic in Zen | M |
| #4641-adj | ElevenLabs Scribe STT branch | `elevenlabs.js` is TTS-only; `sttCore.js` has no scribe transcriber | S |
| #4676 | Parallel search+fetch provider | Add to `handlers/search` callers/normalizers + registry | S |
| 4fa46034 / #4606 | Netlify relay proxy pool | Zen has vercel/cloudflare/deno only (`proxy-pools/page.js`) | M |
| #4654/#4597 | Codex v1 multi-agent tools / native subagents (`spawn_agent`) | Zen passes `custom` tool types + custom_tool_call items end-to-end; no explicit spawn_agent handling — needs a live trace to confirm drop | M |
| #4762 | Claude auto-mode classifier + context-model alias | Concept absent entirely | **L** |
| #4767/#4769 | Quota visibility/ignore per account on quota page | Per-account auto-ping opt-in exists; page-level visibility/ignore does not | M |
| #4593 | Proxy-pool failure cooldown | Rotation exists (`connectionProxy.js:18-34`); no failure tracking — dead pools re-enter | S |
| #4709 | earliest-quota-reset routing strategy | Quota-aware reorder exists by remaining-fraction; reset-time not a sort key (`quotaAwareSelection.js:80-104`) | M |
| #4594/#4619 | Provider connection pagination; codex catalog envelope on /v1/models | Absent; nice-to-haves | S/M |

## 4. Verified ALREADY-IN-ZEN (don't re-port)

- **Client identity/catalog**: Codex 0.160.0 + GPT-6.1 Sol @872k (`clientVersions.js:92`, `capabilities.js:223`), Sonnet 5.5 adaptive semantics (incl. `49ba54b2`/`49c761cd` cited verbatim in Zen CHANGELOG), xhigh level, GPT-6/5.4 real context windows, Grok Build subscription limits (`registry/grok-cli.js:60-64`), per-provider registry header overrides (`REGISTRY_TEMPLATE.js:49` + executor merge — note: static-only, no per-connection UI).
- **Usage**: #4772 cache double-count guard (`usageTracking.js:113-121` + pricing subtraction), #4744 quota-card spinner (try/finally resets), #4665 estimates-only-as-fallback (`stream.js:252-257`), #4536/#4574/#4551 Codex cache+reasoning retention, #4632 incomplete→length, #4617 declared caps.
- **Translator**: #4711 orphan tool pairing, #4620 properties-map, #4636 GLM effort clamp (OpenAI wire), #4610 reasoning.effort↔Responses, #4608 developer role, #4586 cloudflare string content, #4585 Cline reasoning deltas, #4577 tool_choice none, #4532 Gemini duplicate ids, #4700/#4518 multimodal tool outputs, #4545 64-char clamp (superseded by #3622 machinery), #4559 unsigned-thinking-to-AG, #4714 combo UUID saves, #4576 comboStrategy persistence, #4663 allRateLimited 503+Retry-After (`chat.js:297-303`).
- **Audio caps** #4638 (SERVICE_KIND_CAPABILITIES), **GLM 1M** #4544 (residual: `*glm-5*` pattern 204800 at `capabilities.js:453`, nvidia `z-ai/glm-5.2` 200000 at `:215` — verify before touching), **pdf:true** #4670.

## 5. NOT-APPLICABLE / intentional divergences (maintain, don't port)

1. **Upstream v0.5.95 "auto-fallback to insecure TLS on self-signed cert errors" — Zen rejects this by policy** (ARCHITECTURE.md:173: certificate failures return 502, never unauthenticated TLS). Keep rejecting; if upstream keeps hardening that path, do not follow.
2. #4662 (lookahead regex rejection) — upstream's own zod validator; Zen has no schema validator on `/v1/chat/completions`, rejection can't occur here.
3. #4527 (Azure pool display-only) — Zen has no per-connection pool UI; bug can't occur.
4. Freshdock auto-update infra — ops-specific.
5. #4744 overlap — already covered in §4 (Zen's wrapper resets loading in `finally`).

## 6. Security notes for porting (per CLAUDE.md: security first)

- **Key-auth changes (#4756/#4708/#4755)**: keep the invariant that attacker-controlled invalid keys are never cached (`apiKeysRepo.js:87-88`); expiry checks server-side only; extend `usageHistory` linkage without persisting raw keys (they're already plaintext — see audit doc 02 §5; don't make it worse).
- **#4718 pinning**: honor `x-connection-id` only after verifying the connection belongs to the resolved provider — otherwise a header selects cross-provider accounts.
- **CLI `connect`**: conflicts with Zen's file-based local trust; any port must pass the audit doc 04 §6 threat model (local-only bearer, no remote token file).
- **OpenCode attestation (#4784)**: the keyed-lane→`Bearer public` switch changes which credentials hit upstream; make sure per-connection proxy policy and strictProxy still apply to the attested lane.
- Re-verify PRs #4782/#4784/#4786 diffs against upstream HEAD at port time — the thread was still open on 13 Oct (both PRs unmerged).

## 7. Caveats

- Static analysis; nothing was executed. Node modules not installed in this checkout.
- Verdicts rest on Zen's exhaustive CHANGELOG convention for ports (zero hits for all scored IDs except the documented set) plus direct code inspection; upstream PR diffs were spot-fetched (#4784/#4786) where the cluster was hot.
- Upstream master paused after v0.5.99 (8 Oct); unmerged PR flow through 13 Oct means Tier-1/Tier-2 items tied to open PRs may evolve — re-check the PR before porting.

## 8. Implementation status (updated 2026-10-13, same day)

Every Tier-1 item was ported, each as its own commit with tests, a CHANGELOG entry
and a green lint/test gate. Two report rows turned out to be mis-scoped and were
re-verified against the actual upstream diffs before porting:

| Report row | Outcome |
|---|---|
| #4628, #4633, #4715, #4718, #4691, #4706, #4635, #4643, #4637, #4735 | Ported as described. |
| #4584 | The upstream PR normalizes combo model **IDs** at the API boundary, not `body.model`. Ported the real change (`combos/modelIds.js`); no `body.model` trim was added. |
| #4607 | Upstream fixes the **request translators** (`claude-to-openai`), plus a separate PR (#4543) fixes the Codex tool flattener. Both ported. |
| #4691 | Upstream clamps in the **translator + executor** and lowers the advertised `maxOutput`; ported that shape (`COMMANDCODE_MAX_OUTPUT_TOKENS`), not the report's `paramSupport` sketch. |
| #4643 | Upstream persists Codex **image** usage through an `onUsage` callback (not `input_tokens_details.image_tokens`). Ported the real change. |
| #4507 | Already in Zen (`*gemini-4*` pattern + `gemini-4-argon` pricing with the documented intro rates). Not re-ported. |
| #4524 (codex 872k) | Already in Zen (`capabilities.js` codex block). Not re-ported. |
| #4514 | Only the LongCat half was missing; the qwen3.8 half already existed. LongCat ported. |
| #4548 | Landed as the full #4600 port (registry + caps + pricing + usage + MITM + `thinkingUnified` minimal→low). |
| #4524-kin / #4614 | Ported as the real PR #4614 (catalog sync + thinking-level glob shadowing fix), with Zen's `deprecated` convention instead of upstream's row deletion. |
| #4681 | Implemented from the issue (no upstream PR): pure filter module + modal wiring. |
| 24034f69 | Ported in full (the commit also moved the 3.5 synonyms and flash patterns to 3.8). |
| #4740 | Ported; the upstream icon PNG is not on master, so an equivalent 128×128 icon was generated locally. |
| #4785 / #4731 | **Deferred.** v1m/System One needs a native decision-pass-through handler (`/v1/systemone`), which Zen does not have — it is not a plain OpenAI-compatible registry entry as the report assumed. |

Tier-2/Tier-3 items remain open; the OpenCode free-tier 403 cluster still requires
re-verifying PRs #4782/#4784/#4786 against upstream HEAD before porting.

## 9. Selective re-audit and implementation, 2026-10-18

This section supersedes the earlier static applicability labels for the candidates below. The reviewed Zen base is `ccfb5cfaafe12579ec731027bda9dee249a17b61`. Upstream master resolves to [`87a74e1`](https://github.com/decolua/9router/commit/87a74e1bda3677193c6f71a7e2100c90311f0689), version 0.5.104. An open PR or author-reported HTTP 200 is a reference, not Zen verification.

| Upstream reference | Pinned revision | Zen adaptation |
|---|---|---|
| [PAT SSRF #4953](https://github.com/decolua/9router/pull/4953), [issue #4952](https://github.com/decolua/9router/issues/4952) | `df23e9847a771eacca9ecfd16b88f1417851cf98` | Use Zen's pinned public/private transports, actual peer trust, metadata exclusions, zero redirects and bounded body reads. Keep authenticated self-hosted access and safe errors. |
| [Proactive refresh #4948](https://github.com/decolua/9router/pull/4948), [issue #4910](https://github.com/decolua/9router/issues/4910) | `4e69193622db5ae38ae4928b1bbb809d0aca2ee6` | Queue each connection through persistence; adopt newer access credentials without requiring rotation. Retain the real ten-second lower cache. Do not claim an immediate destructive refresh herd from a mocked dispatcher. |
| [Context overflow #4879](https://github.com/decolua/9router/pull/4879), [seat errors #4886](https://github.com/decolua/9router/pull/4886) | `bb303332ad859bfc49bd9d8d1d44f0121847a507`, `51ec6f91b9e54bfe88871ca58b12646596054d7e` | Add a separate combo classifier scope. Recognize configured context and unsupported-parameter failures without changing account health or replaying malformed/cancelled requests. |
| [Empty completion #4750](https://github.com/decolua/9router/pull/4750) | Published change [`8f4e3800`](https://github.com/decolua/9router/commit/8f4e380073151d2626e5104afbee2d95738eaf26) | Reject genuinely empty, nonfinal Chat JSON and aggregated SSE. Preserve paid usage, generated reasoning/tools/media/refusals and terminal no-ops. Never turn an exhausted chain into HTTP 200. |
| [Copilot endpoint #4793](https://github.com/decolua/9router/commit/51a1827e2d1e5170eb5e13e421dcca3409245d78), [scalar input #4951](https://github.com/decolua/9router/pull/4951) | `51a1827e2d1e5170eb5e13e421dcca3409245d78`, `91af28faa8a63e3add5a947bd275b1df5c9e6730` | Separate Copilot from the GitHub Models product. Select the service token and IDE profile, normalize scalar input, and preserve batch boundaries. Do not infer global model retirement from this endpoint fix. |
| [Usage statistics correction](https://github.com/decolua/9router/commit/813a0121b09c4181712a902e47e1ed418a88c473) | `813a0121b09c4181712a902e47e1ed418a88c473` | Read native counters and legacy columns in live windows. Include native cache hits. Keep Zen's non-secret key identities and nullable costs rather than upstream's raw-key buckets. |

The Copilot snapshot follow-up is Zen-specific: service expiry determines adoption independently from OAuth age. Only token/expiry fields change; newer caller credentials and caller proxy configuration remain authoritative.

### Decisions not to import

- [Reset uncapping #4935](https://github.com/decolua/9router/pull/4935), head `1f89a843b83341068024dbfafe123f9f284b8925`: Zen already allows six hours, covering the PR's one-/three-hour examples. Generic retry text also produces reset hints, so removing the cap would trust unauthenticated wording. Longer authoritative resets need provenance, not blanket uncapping.
- Per-key quotas/model patterns were [reverted upstream](https://github.com/decolua/9router/commit/6ed886857da125f4908a8a3c3e64f7f1d8ff8366). No new access-control schema or raw-key metric grouping is imported.
- Inactive-member combo metadata remains a separate candidate. This batch does not replace conservative minima with maxima or silently trim history.
- OpenCode's changing free-tier attestation requires current native evidence. No captured host identity or unrelated proxy bypass is added.

### Argon source and live-acceptance boundary

[Google's model documentation](https://antigravity.google/docs/models.md) distinguishes supported App/CLI/extensions from standalone IDE availability. The [official CLI changelog](https://github.com/google-antigravity/antigravity-cli/blob/86a5bdda81a063d707ac4ab87fb72f7dfe30ab67/CHANGELOG.md) describes base-model selection using server defaults, then medium, then the lowest available tier.

The [CLI updater manifest](https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json) reports 1.4.2 on October 18; the website still displays 1.4.0. A publisher version does not verify a native wire profile, so the gateway's pinned CLI identity is not bumped speculatively.

Public Gemini API IDs do not establish the authenticated Cloud Code IDs or raw quota-summary schema. Native acceptance still requires an entitled account's redacted `fetchAvailableModels`/`retrieveUserQuotaSummary` output and successful generation for the advertised base/tiers. Local fixtures do not establish entitlement, billing or inference quality.

### Exercised verification

Regressions failed before the corresponding fixes, then passed through real handlers, disposable SQLite and calibrated HTTP transports. A source smoke adopted persisted same-refresh-token credentials without OAuth traffic and served 20 concurrent refresh callers through one synthetic HTTP exchange.

The actual locally packed runtime passed 23 HTTP scenarios through 46 fixture requests. Coverage includes Messages/Responses and SSE, account health, concurrent OAuth/Copilot refresh, embedding scalar/batch input, authenticated PAT rejection, redirect/error confidentiality, local MCP and live usage windows. Denied native quota lookups remain recorded by the egress guard; no real provider or production state is used. See [the updated test workflow](05-cli-tests-and-tooling.md#6-current-verification-workflow-2026-10-18) for the complete suite and baseline commands.

