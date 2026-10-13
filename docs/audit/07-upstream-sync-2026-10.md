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
