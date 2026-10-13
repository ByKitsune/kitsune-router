# Changelog

All notable changes to ZenRouter (fork of 9Router) will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/) and Conventional Commits.

## [Unreleased]

### Fixed
- **perf(pricing): cache compiled glob regexes in `matchPattern`** (`open-sse/providers/pricing.js`, 9router #4628): `getPricingForModel` walks the whole `PATTERN_PRICING` table per lookup and `matchPattern` built a fresh `RegExp` per pattern per call — measured ~32x slower than the cached form. Compiled patterns are now memoized on the function (avoids the module-scope TDZ hazard in bundled chunks) with identical match semantics, locked by a whole-table equivalence test.
- **fix(executors): request `include_usage` on streaming OpenAI-compatible chat calls** (`open-sse/executors/default.js`, 9router #4633): streaming requests to `openai-compatible-*` chat nodes never set `stream_options.include_usage`, so gateways like Alibaba MaaS omit the final usage chunk and the stream path falls back to chars/4 estimation — inflating `prompt_tokens` and dropping `cached_tokens` entirely (cache hits billed at full input rate; verified live on `kimi-k3`: estimated `{prompt 50116, no cache}` became real `{prompt 34349, cached 32256}`). Injection is gated to streaming + chat api-type + `messages[]` present + no caller-provided `stream_options`; providers that reject the field (codex, grok-cli, antigravity) delete it in their own executors.
- **fix(fallback): try the next combo member when credits run out on HTTP 400** (`open-sse/config/errorConfig.js`, 9router #4715): credit exhaustion can ride on a 400 instead of 402. New `insufficient credit` text rule (exponential backoff, account-scoped) lets the combo advance to the next model while the ordinary bad request still stops the request.

## [0.9.7] - 2026-10-06

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.7) · [Technical changelog](docs/CHANGELOG_v0.9.7.md) · [Release notes](releases/RELEASE_NOTES_v0.9.7.md)

### Changed
- Bind manual npm/Docker publication to real stable tag refs and bind npm provenance to the dispatch SHA. Preserve the original tarball for integrity-checked release recovery; serialize publication across versions and prevent historical retries from replacing newer `latest` targets.
- Preserve explicit output caps across the repaired reasoning/tool request paths instead of silently raising them to a universal floor. Keep nullable OpenAI aliases, native provider thinking modes and unsupported OAuth cap semantics distinct; document the contract in `docs/REASONING-BUDGETS.md`.
- Research and reconcile upstream client identities and model metadata. Update Claude Code, Kiro CLI, Kimchi, CodeBuddy CN, and Command Code pins; preserve distinct IDE/CLI and regional profiles. Correct Gemini OAuth and Copilot endpoint-specific API headers without adding beta entitlements.
- Add 120 documented provider/model entries across chat, image, embedding and TTS routes. Attach provider-scoped factual metadata, source URLs, API-versus-CLI limits and billing-unit caveats; preserve compatibility IDs and mark documented retirements. See `docs/CLIENT-MODEL-RECONCILIATION.md` and `docs/model-catalog-coverage.json` for explicit unverified/deferred coverage.
- Upgrade the app, CLI, independent test suite, and documentation app dependency manifests and lockfiles to researched npm stable releases. Align React/React DOM/React Is to `19.3.0`; migrate to ESLint `10.12.0`, Vitest `5.0.3`, Vite `8.3.2`, and Undici `8.11.2` with compatible tooling and runtime changes.
- Require Node.js `>=22.19.0` across all four packages and target Node 22 in the CLI MITM bundle. Update the SQL.js runtime-install pin to `1.14.2`; keep native SQLite optional and preserve the existing driver fallback order.
- Use the installed test-package Vitest runner with repository-anchored discovery for both root and test-package commands. Remove unused `http-proxy-middleware`/`socks-proxy-agent` dependencies and stale overrides whose consumers are no longer present.

### Fixed
- Separate web-search provider/service selectors from explicit grounding models. Preserve provider/model and combo-member ownership, reject malformed selectors before account dispatch, and use defaults for bare provider names or advertised `provider/search` IDs instead of sending `gemini`/`search` as upstream models.
- Align Antigravity dedicated grounded search with its sandbox endpoint and real project/session/request envelope; retain the search-specific Gemini model, resolve explicit model/thinking aliases, preserve Google Search tools and citations, and honor per-account proxy/relay/strict-proxy policy. Keep returned thought parts out of grounded answer text and citation context without disabling reasoning.
- Treat the specific Gemini model-not-found response as request-scoped; bound the ambiguous Antigravity resource-not-found response to three account attempts without writing healthy-credential cooldowns. Preserve other auth/quota fallback behavior and clear only the successful web-search scope. Fix chat-search logger tag/message calls that produced `undefined` diagnostics.
- Retain modern output caps through Gemini/Kiro/Ollama/CommandCode translation and final GitHub/Antigravity serialization. Preserve Responses-native reasoning fields and client reasoning intent before provider defaults; reconcile Claude manual thinking against effective outbound interleaving support, including rejected-beta retries.
- Persist actual usage for exhausted attempts and Gemini reasoning tokens without double counting. Preserve incomplete Responses terminals, partial output and refusals; remove context-reserve inflation from actual usage and prevent terminal-then-cancel callbacks from recording the same attempt twice.
- Keep combo stream-content detection consistent so paid reasoning or valid terminal events are not replayed as empty transports.
- Unify provider aliases and declared upstream pricing aliases; preserve native model namespaces and paid/free catalog identities. Keep coding-plan catalog joins separate from direct API products, and invalidate old normalized model-catalog caches.
- Preserve live and operator-declared capabilities, separate input/context/output limits, intentional cross-kind IDs and no-auth discoverability across dashboard and public listings. Scope runtime custom capabilities to the provider instead of a global model-name cache.
- Correct long-context reasoning rates, inclusive provider thresholds, partial custom pricing merges and unknown-price display. Keep non-token billing units out of the token-rate fields; unsupported or undocumented maxima remain explicitly unknown.
- Select the matching upstream transport for per-model translation targets, including Responses-only API models, while retaining native-format precedence and clearing stale per-request transport state.
- Adapt Undici 8 dispatchers to Node 22 native fetch at the proxy, pinned web-fetch, and remote-image seams. Preserve CONNECT proxy tunneling, DNS pinning, cancellation, and strict-proxy no-direct-fallback behavior. Keep proxy diagnostics on CONNECT for plain-HTTP test targets as well, preventing false failures with CONNECT-only relays.
- Align the official installer with Node `>=22.19.0` before package/build operations. Retain the validated Node/npm or Bun selection through provisioning, sudo, user-prefix/source fallback, and CLI verification; use the published `@joyccn/zenrouter` package and fail clearly when no supported runtime is available. Verify the newly linked source CLI explicitly so an older global CLI cannot shadow it or turn a fresh CLI failure into installation success.
- Load the installed Monaco `0.57.0` ESM release with explicitly bundled same-origin JSON/editor workers instead of the wrapper's stale CDN default. Preserve the existing CSP and verify real editor input and worker message round trips.
- Retain the docs markdown wrapper when migrating to react-markdown 10, and fix the language-switcher runtime crash so the exported docs render and the language modal opens/closes.
- Resolve all nine existing React lint warnings in Codex/Claude CLI settings and OAuthModal without disabling lint rules. Preserve unsaved form drafts and placeholder-key fallback; use a hydration-safe browser-location snapshot for OAuth.
- Declare narrow ESM package boundaries for `open-sse/`, `src/lib/oauth/utils/`, and `src/sse/` to eliminate ambiguous module-type warnings. Leave root, CLI, custom-server, MITM, updater, and MCP CommonJS scopes unchanged.

### Security
- Remove the MITM test fixture's process-wide `NODE_TLS_REJECT_UNAUTHORIZED=0` setting. Limit self-signed certificate opt-outs to explicit fixture requests, with a real HTTPS control confirming default rejection remains enabled.
- Document unresolved upstream `node-forge` and `braces` audit advisories; the dependency refresh does not claim a vulnerability-free graph or apply forced downgrades.

### Verification
- Web-search acceptance exercises real loopback relay/CONNECT transport and the production standalone server with 16 disposable SQLite connections: correct defaults/model aliases, grounding/citation extraction, hidden thought-part exclusion, search-only health clearing, one-attempt Gemini model 404 and at-most-three Antigravity resource 404 attempts without locking the 15-account pool. No production account or live Google inference is used; upstream availability and account entitlement remain unverified.
- Reasoning-budget acceptance additionally checks real loopback HTTP payloads and the production standalone SQLite usage table: explicit/nullable caps, reasoning-only exhaustion, and terminal-then-cancel each preserve actual usage exactly once. No live provider inference or automatic spending retry is used.
- Final 0.9.7 release verification on Node `22.23.2`: the full isolated Vitest suite passes across 494 files with 4,091 passed, 100 skipped, 1 todo, zero failed tests or suites. Release guards cover consistent package/lock versions, literal stable tags, publication inputs and all five localized changelogs. Full ESLint passes with zero errors/warnings and `--max-warnings=0`; deliberate rule-violation controls remain active. Installer runtime tests evaluate real Bash function bodies in mock-only harnesses without running the installer or host package operations.
- App/CLI production builds, docs static export, native SQLite, h2c, Undici SSE/abort/strict-proxy transport, authenticated missing-model API checks, CLI packaging, and real browser form/hydration/editor checks pass without billable provider inference.
- Node 22's genuine `node:sqlite` experimental-status warning remains visible when the suite exercises the fallback driver; no warning suppression or coverage removal is used to hide it.

## [0.9.6] - 2026-10-02

### Fixed
- **fix(sse): short-circuit client abort without locking accounts or triggering fallback** (`src/sse/handlers/chat.js`): When a client disconnects or aborts (`client_aborted`, status 499, `request.signal.aborted`), return immediately without invoking `markAccountUnavailable`. Prevents healthy provider accounts from receiving erroneous 30-second `modelLock_*` locks and stops redundant account/combo failover when the client is no longer listening.
- **fix(proxy): prevent client abort from tripping 15-minute MITM direct-IP bypass cooldown** (`open-sse/utils/proxyFetch.js`): Ignore `AbortError` and aborted signals in `proxyFetch` catch handlers, ensuring direct IP routing to upstream endpoints (`daily-cloudcode-pa.sandbox.googleapis.com`, `cloudcode-pa.googleapis.com`) remains active and is not suppressed for 15 minutes by client-side cancellations.
- **fix(fallback): compound duration parsing and multi-status reset extraction** (`open-sse/services/accountFallback.js`): Added robust parsing for compound duration reset patterns (`1m 51s`, `4m22s`, `99h31m0s`, `41.67s`) and enabled reset extraction across 429, 403, and 503 statuses (e.g. gateway wrappers returning `HTTP 503 [403: reset after 1m 51s]`), accurately respecting upstream reset timing.
- Added regression test suite in `tests/unit/client-abort-and-compound-reset.test.js` (3 cases, passing).
## [0.9.5] - 2026-10-02
### Fixed
- Preserve ordered readable thinking across Claude/Gemini and hybrid Chat histories, streamed vendor reasoning details, native JSON, and forced-SSE JSON. Keep reasoning separate from answer text; retain every Responses summary segment and native Claude encrypted-block/signature replay without exposing opaque continuity on Chat bridges.
- Add an encrypted development-only worker mesh with two-way-safe conflict handling, strict SSH host validation, secret/state exclusions, detached per-node jobs, private isolated test data, and resumable UTF-8-safe stdout/stderr. Measured bidirectional synchronization and disconnect recovery; initial reasoning regression gate passes 268 tests with zero failed tests/suites.
- Reconcile the dependency lock with existing operator-selected `brace-expansion` security overrides so clean worker installs succeed without changing the operator's manifest settings.
- Adapt nonduplicated upstream fixes #4143/#4533/#4481/#4523/#4412: Mistral native reasoning/text chunks and strict wire dialect; explicit OpenAI→Claude output caps with pre-dispatch HTTP 400 for impossible enabled budgets; cache-inclusive Claude usage, CommandCode cache-write details, and Gemini thought/total accounting. Reject insecure-TLS fallback and leave already-fixed fork behavior intact.
- Allocate distinct Responses output-item indexes and retain complete reasoning/text/tool items in terminal output across both live implementations, including reopened transitions and custom-tool arguments.
- Enable upstream TLS certificate/hostname verification in MITM ALPN, HTTP/2, and HTTPS forwarding; certificate failure returns 502 without insecure fallback or forwarding credentials/body. Native loopback smoke covers untrusted, explicitly trusted, wrong-host, and certificate-change cases for both protocols.
- Fix `AntigravityExecutor` tool result role and terminal turn bug: set `functionResponse` role to `"user"` instead of `"model"` to prevent multi-turn tool calling histories from collapsing into a model turn and Google Cloud Code / Gemini API rejecting with `400: Requests ending with a model turn are not supported`. Enforce a guaranteed trailing user turn whenever contents end with a model turn.
- Echo client-requested model names in Claude `message_start` events for routed streams (`open-sse/handlers/chatCore/streamingHandler.js`, `open-sse/utils/stream.js`, `open-sse/translator/response/openai-to-claude.js`), preventing client CLI tools from rejecting mismatched model identifiers (upstream PR #4513).
- Preserve `reasoning_tokens` across format pivots, Responses stream-to-JSON conversion, and canonical usage tracking (`open-sse/transformer/streamToJsonConverter.js`, `open-sse/translator/response/openai-responses.js`, `open-sse/translator/response/openai-to-claude.js`, `open-sse/utils/usageTracking.js`), ensuring accurate reasoning token accounting (upstream PR #4536).
- Enhance multimodal translation and capability routing across all supported formats:
  - **Remote Image URLs to Claude**: Added `FORMATS.CLAUDE` to `TARGETS_NEED_BASE64` in `open-sse/translator/concerns/prefetch.js` so remote HTTP image URLs are automatically prefetched and converted to base64 data URIs before dispatching to Anthropic's `/v1/messages` endpoint (Anthropic strictly requires `source.type: "base64"` and rejects `source.type: "url"` with HTTP 400).
  - **Tool Result Multimodal Preservation**: In `open-sse/translator/request/claude-to-openai.js`, preserved images returned within `tool_result` content arrays, emitting them as structured `OPENAI_BLOCK.IMAGE_URL` blocks alongside text rather than silently discarding them or stringifying into raw JSON text. Preserved `is_error` flag on tool result messages.
  - **Responses API File Preservation**: In `open-sse/translator/request/openai-responses.js`, mapped `OPENAI_BLOCK.FILE` and `RESPONSES_ITEM.INPUT_FILE` to structured `input_file` items with `file_data` and `filename`, preventing document inputs from falling back to raw JSON strings.
  - **Video Input Support**: Added `OPENAI_BLOCK.VIDEO_URL`, `OPENAI_BLOCK.INPUT_VIDEO`, and `CLAUDE_BLOCK.CONTAINER_UPLOAD` to `open-sse/translator/schema/blocks.js`, included in `VALID_OPENAI_CONTENT_TYPES`, mapped video blocks to Gemini `inlineData`/`fileData` in `open-sse/translator/formats/gemini.js`, and added `videoInput` capability stripping in `open-sse/translator/concerns/modality.js`.
  - **Combo Modality History Awareness**: In `open-sse/services/combo.js`, updated `detectRequiredCapabilities` to scan the entire conversation history (including earlier user turns and tool results) for required modalities (`vision`, `pdf`, `audioInput`, `videoInput`), preventing combos from falling back to text-only models on subsequent follow-up turns.
  - **Fusion Judge Multimodal Safety (Upstream #3375)**: In `handleFusionChat`, stripped media blocks from `judgeBody` so text-only judge models (e.g. DeepSeek, Qwen Coder) evaluate clean text answers without crashing on unsupported image/PDF inputs, and filtered panel fan-out by required capabilities.
  - **Model Capabilities Matrix Updates**:
    - Added explicit text-only rule for `*o3-mini*` before `*o3*` in `open-sse/providers/capabilities.js`, preventing `o3-mini` from erroneously inheriting vision and PDF capabilities.
    - Enabled `pdf: true` across all Kimi models (`*kimi*k3*`, `*kimi*k2.7*`, `*kimi*k2.6*`, `*kimi*for-coding*`), preventing document stripping on 200k/2M document models.
    - Enabled `pdf: true` and `videoInput: true` for `*qwen*vl*` models.
    - Added `*gemini-1.5*` pattern declaring native `audioInput: true` and `videoInput: true`.
    - Added `*pixtral*` pattern with `vision: true, pdf: true, contextWindow: 128000`.
    - Aligned context windows with official `models.dev/api.json` specifications:
      - Flagship Claude models (`claude-sonnet-4`, `claude-sonnet-4.5`, `claude-sonnet-4.6`, `claude-sonnet-5`, `claude-sonnet-5.5`, `claude-opus-4.6+`, `claude-opus-5+`, `claude-fable-5+`) natively resolve to 1,000,000 (1M) context window without requiring legacy `[1m]` suffix.
      - Codex and OpenAI GPT-6 models (`gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-*`) resolve to official 1,050,000 (1.05M) context window, with `[1m]` suffix retained as a fallback.
      - DeepSeek (`deepseek-v4*`, `deepseek-flash`) and Qwen (`qwen3*`, `qwen*max*`, `qwen*plus*`) models aligned to 1,000,000 (1M) context window.
      - Added dynamic reasoning budget auto-floor (`REASONING_MIN_OUTPUT_FLOOR = 65536`) in `open-sse/translator/formats/maxTokens.js` and `thinkingUnified.js`: automatically bumps small client `max_tokens` (e.g. 1000, 2000) up to 65,536 tokens when reasoning effort (`medium`, `high`, `max`, `ultra`) or adaptive thinking is active, preventing blank outputs from budget exhaustion while maintaining standard 64k non-reasoning contracts.
- Document the unresolved `node-forge` GHSA-86w9-cpqp-85rv advisory honestly: no official patched release exists; current MITM issuance/parsing uses do not reach the affected signature verifier. Root/CLI dependency audits remain high severity rather than suppressing the finding.
- Bound Codex and Qoder preheader SSE inspection to 1000 ms/256 KiB, preserve pending reads and split UTF-8, and cancel upstream transport on disconnect. Treat Qoder queue code `10605` as 429 with retry timing; retain quota 403s and structured late errors across every client format and Responses JSON collection.
- Pair duplicate Gemini tool-call IDs by occurrence, retain thought signatures, and recognize signed/raw result IDs before synthetic-result repair.
- Retry missing Qoder PAT identity without re-exchanging a valid job token; pass PAT credentials through live model discovery.
- Apply strict account egress policy to every catalog/delegated refresh path and partition model, token, project, and in-flight caches by transport policy.
- Prevent CLI status aggregation from disclosing host credentials or privileged CLI tokens; enforce local-only authorization inside Cowork handlers.
- Require browser-bound, one-use SAML correlation, including the signed confirmation selected by Node-SAML. Preserve legitimate alternative confirmations; document HTTPS and process-affinity requirements.
- Bind stored OIDC test secrets to the configured issuer/client, validate discovery destinations, pin vetted DNS answers to sockets, reject token redirects, and cancel failed discovery response bodies. Protect every remote MCP handshake; keep trusted private MCP access while blocking metadata and unsafe proxy bypass.
- Stop retaining arbitrary invalid API keys in authentication caches; preserve immediate positive-key revocation.
- Load optional native Zed SQLite credentials correctly in ESM and retain fallback coverage when the native binding is unavailable. Initialize Devin ACP with integer protocol version `1` and reject incompatible peers with subprocess cleanup.
- Align native OpenCode session/parent header aliases without accepting foreign-client fingerprint overlays.
- Update verified app releases: Claude Code 2.1.287, Codex 0.160.0, CodeBuddy 2.161.1, Grok 1.0.46, and Kimchi 1.5.0. Correct Antigravity IDE identity to 2.5.5 instead of its Hub release line; retain unverified SDK/runtime pins.
- Restore frontend files to release commit `db70834e` and remove the discarded new dashboard pages/assets and their unused summary endpoint. Backend/security fixes remain intact.
- Isolate remaining cached-token/model-routing fixtures, keep live MiMo tests explicitly opt-in, update the Xquik network fixture at the real transport boundary, and remove incidental version/source-copy assertions.
- Verify the restored release UI with an actual remote standalone production build and browser login/dashboard/provider/CLI/pricing smoke. Full remote regressions pass with zero failed tests/suites; backend/test lint and provider/alias/OAuth baselines pass. The exact restored frontend retains eight existing lint errors and two warnings, and its Analytics requests remain blocked by the existing CSP.
- Keep the alias regression gate focused on alias-to-provider and provider-to-alias behavior. Remove the unrelated model-catalog key snapshot that drifted when an existing provider gained catalog entries; provider and model behavior retain separate coverage.
- Wait for native tray teardown before exiting after a clean server close, avoiding orphaned Windows tray processes. Use a private readiness port in launcher regressions so a running gateway cannot affect fixture behavior.
- Control the clock in provider-priority regression tests so millisecond timestamp ties cannot make the move-to-front assertion driver-speed dependent.
- Retain strict-proxy policy across inactive/empty pools, legacy/no-proxy fallbacks, and lookup errors (`24664f2c`). Apply the configured policy to quota/reset-credit requests, credential probes, and delegated Codex/xAI token refresh; working relay refresh remains supported and TLS verification stays enabled.
- Use active advertised Anthropic models for credential-validation probes instead of retired Claude 3 Haiku, preserving explicitly configured models across validation and retest paths (#4528).
- Select Claude reasoning beta flags using the final outbound body, preserve client beta flags subject to the per-account rejection denylist, and forward OAuth session identity per request without leaking first-party headers to other providers (`90b06934`, `6aea3875`, `dc198dff`).
- Isolate database-mutating regression tests in disposable SQLite directories, remove order-dependent fixtures/destructive writes to the operator database, and close adapters/remove only test-added shutdown listeners before Windows cleanup (#4407 / upstream `57c04f00`).
- Attach server lifecycle listeners before the tray-mode early return so Windows startup can recover a crashed gateway or exit after a clean shutdown (#4509 / PR #4522). Add isolated launcher subprocess regressions.
- Apply Sonnet 5.5 request restrictions across native, translated, and passthrough paths: reduced-thinking `between_tools`, supported effort limits, and non-forced tool selection (`49ba54b2`). Preserve explicitly requested summarized/omitted reasoning display on mandatory-adaptive Claude models.
- Emit exactly one OpenAI `[DONE]` sentinel across translated and passthrough streams, including fragmented bytes and newline-free EOF (#4480/#4461/#4356). Close Responses reasoning items before text or tool items, retaining tool arguments, Unicode text, and late usage (`5d2cfbf3`).
- Use the shared terminal-turn/function-call normalizer on production Gemini, Gemini CLI, and Vertex request paths (#4345). Remove the shadowing merge-only helper; preserve Antigravity's intentional native tool-result roles.
- Preserve multimodal Responses tool outputs through both request bridges and Claude results (#4517 / PR #4518); lower final Chat tool content to text plus user image turns after parallel results. Retain native documents/search results, opaque file references, IDs/error flags, and image/PDF bytes without new fetches.
- Return a request-scoped `output_budget_exhausted` error when reasoning consumes the output budget before text/tool calls, instead of retrying identical payloads and locking healthy accounts for 30 seconds. Preserve structured diagnostics through account/combo exhaustion. Complete Responses output-item lifecycle statuses for validating clients (#4498 / PR #4499), including JSON and forced-SSE conversions.
- Categorize xAI Grok Imagine Image, Image 2.0, and Image Quality under Text to Image, and Imagine Video 1.5 variants under Video. Keep media generators out of the chat model list.
- Preserve model categories and output modalities from live provider catalogs. Correct the displayed category of registered media models previously saved as custom LLM models without changing stored data.
- Expose OpenRouter's declared image models in Text to Image and connect TokenRouter's image generation configuration to its adapter.
- Forward supported xAI image parameters, including aspect ratio and resolution, and restrict quality forwarding to Imagine Image 2.0. Add matching image controls to the dashboard.
- Add video/music model discovery mappings and correct media endpoint metadata.
- Add regression coverage for media classification, model lists, legacy custom rows, and image request dispatch. Relevant tests and lint pass; real-account image generation has not been verified.

## [0.9.0] - 2026-10-01

### Fixed
- **fix(upstream): cherry-pick high-value 9Router fixes (v0.5.95 line)** —
  - **fix(codex): stop refresh-token reuse that logs accounts out on auto-ping (`0bc7f86e`)**: Reduced `refreshLeadMs` from 5 days to 10 minutes and re-read latest connection tokens from DB before refreshing, preventing OpenAI from revoking active sessions due to stale token reuse.
  - **fix(responses): deferred completion usage trailer & 3s watchdog (`7111db35`, `fbcaa282`, `bbe7a0b3`)**: Made OpenAI Responses translation wait for the real usage trailer before emitting `response.completed` while bounding the wait with a 3s watchdog against hung upstreams. Fixed upstream bug where `state.targetFormat` was undefined.
  - **fix(claude): keep trailing user turn and preserve intentional prefill (`75834e96`, `5e9bd464`, `87d3bd5a`)**: Ensured cleanup passes append a user turn only when the turn was emptied, leaving client assistant prefill intact across messages, contents, and input source shapes.
  - **fix(claude): cache tool loop final tool results with 4th breakpoint (`49c761cd`, `87d3bd5a`)**: Added `markFinalToolResults` and `hoistToolResultImages` so screenshot/image tool results are cached for the follow-up step and hoisted into user messages for non-Anthropic endpoints (DeepSeek, OpenCode Go, GLM, MiniMax).
  - **fix(thinking): add xhigh to claude-adaptive thinking levels (`7894f3d3`)**: Enabled `xhigh` for Claude-adaptive models (Opus 4.7+, Sonnet 5, Opus 5/5.5, Fable) and passed it through to Kiro instead of silently clamping to high.
  - **fix(tools): dedupe same-name tools for DeepSeek models (`7f5bd155`)**: Resolved upstream DeepSeek 400 errors when tools with identical names are declared across multiple toolkits.
  - **fix(claude): inject unsigned thinking placeholders for opencode-go DeepSeek (`08b21fea`)**: Injected thinking blocks on tool turns for DeepSeek models routed through OpenCode Go `/messages`.
  - **fix(routing): strip thinking suffixes in `findModel` (`87d3bd5a`)**: Stripped thinking suffixes (`(max)`) during registry lookup so `getModelSupportedFormats` correctly identifies chat-only models.
- **feat(gemini): passive foundation for upcoming Gemini 4 Argon** — mapped pattern `*gemini-4*` to 1,048,576 context window and industry-leading **1,000,000 max output tokens**, full multimodality (vision, PDF, audio, video, reasoning, web search), and official introductory pricing at **$2.00 input / $10.00 output / $0.10 cache read (95% off)** per 1M tokens (verified from Google announcement 2026-09-30). Model is intentionally omitted from the active registry picker until Google begins public API rollout, ensuring zero dead 404 models in UI while guaranteeing immediate lossless routing for early testers.
  - Test: `tests/unit/gemini-4-argon-passive.test.js` (2 cases).
- **feat(antigravity,gemini-cli): add production fallback endpoints, TPU tool slicing, and Gemini CLI model catalog alignment** —
  - **Antigravity Fallback Base URLs**: Added official production endpoints `https://cloudcode-pa.googleapis.com` and `https://daily-cloudcode-pa.sandbox.googleapis.com` to `transport.baseUrls` in `registry/antigravity.js` for seamless failover during `daily-cloudcode-pa` maintenance or 503/429 outages.
  - **Tool Slicing**: Updated `transformRequest` in `open-sse/executors/antigravity.js` to slice declarations into individual `{ functionDeclarations: [decl] }` objects matching the Google TPU prefix-cache format captured in 100% of native packet traces.
  - **`gemini-pro-agent` Capabilities**: Added explicit canonical capabilities in `open-sse/providers/capabilities.js` with reasoning, multimodal inputs (image, audio, video, PDF), and 65,536 max output tokens.
  - **Gemini CLI Registry**: Added official models `gemini-3-pro-preview`, `gemma-4-31b-it`, and `gemma-4-26b-a4b-it` to `registry/gemini-cli.js`.
  - Test: `tests/unit/antigravity-refinements.test.js` (4 cases).
- **fix(claude,copilot): align native Claude billing header cch=00000, Stainless SDK 0.127.0, and preserve Copilot catalog limits** —
  - **Claude billing header**: Aligned `generateBillingHeader` in `open-sse/utils/claudeCloaking.js` to emit `cch=00000;` and `cc_entrypoint=cli;`, matching the exact literal string emitted by official Claude Code 2.1.286 native binary on first-party Anthropic endpoints. Previously generated random SHA256 hashes for `cch` and `sdk-cli`, introducing an anomalous fingerprint on first-party sessions.
  - **Stainless SDK version**: Updated `CLAUDE_STAINLESS.packageVersion` to **`0.127.0`**, matching the bundled `@anthropic-ai/sdk` version in Claude Code 2.1.286 (previously pinned to 0.80.0).
  - **Copilot catalog limits & vision**: Enhanced `expandCatalog` in `open-sse/services/copilotModels.js` to preserve `capabilities.limits` (`max_context_window_tokens`, `max_output_tokens`) and `supports.vision` returned by GitHub Copilot's live `/models` endpoint instead of discarding them.
  - Tests: `tests/unit/claude-billing-header-verified.test.js` (2 cases), `tests/unit/copilot-limits-preservation.test.js` (1 case); all passed.
- **feat(codex): align Codex CLI protocol headers, reasoning levels, flagship GPT-6 presets, and imagegen model** —
  - **Headers**: Updated `buildHeaders` in `open-sse/executors/codex.js` to emit `session-id` (hyphenated), `version: CODEX_CLI_VERSION` (0.159.3), and `originator: "codex_cli_rs"`, matching the wire signature of official Codex CLI 0.159.3.
  - **Models**: Added `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`, and `gpt-image-2` to `open-sse/providers/registry/codex.js` matching official Codex CLI bundled model presets.
  - **Reasoning options**: Expanded `thinkingConfig.options` to support the full set of Codex reasoning levels: `["auto", "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]`.
  - Test: `tests/unit/codex-cli-protocol.test.js` (3 cases).
- **feat(pricing): add native long-context / tiered pricing calculation for flagship models** —
  - Added `resolveEffectivePricing(pricing, inputTokens)` to `open-sse/providers/pricing.js`, incorporated into both `calculateCostFromTokens()` and `calculateCostBreakdown()`.
  - Mapped official long-context tiers:
    - **OpenAI (>272k tokens)**: `gpt-6-astra` ($20/$75/$2 cached/$25 write), `gpt-6-sol`/`gpt-6.1-sol` ($4/$15/$0.20/$5), `gpt-6-luna` ($0.20/$0.75/$0.02/$0.25), `gpt-5.6-sol` ($8/$30/$0.80/$10), `gpt-5.6-terra` ($4/$18/$0.40/$5), `gpt-5.6-luna` ($0.40/$1.80/$0.04/$0.50), `gpt-5.5` ($10/$45/$1), `gpt-5.4` ($5/$22.50/$0.50), `gpt-5.5-pro` ($60/$270/$6), and `gpt-5.4-pro` ($60/$270/$6).
    - **Google Gemini (>200k tokens)**: `gemini-3.1-pro-preview` ($4/$18/$0.40).
    - **xAI Grok (≥200k tokens)**: `grok-4.7` ($4/$12/$1), `grok-4.6` ($4/$12/$1), `grok-4.5` ($4/$12/$0.60), `grok-4.3` ($2.50/$5/$0.40), `grok-build-0.1` ($2/$4/$0.40).
  - Eliminates systematic 50% under-billing in usage logs for long-context agent turns exceeding 200k/272k tokens.
  - Test: `tests/unit/tiered-pricing.test.js` (3 cases); 72 pricing tests green.
- **feat(models): update verified capabilities and pricing for 2026 Asia & EU models (DeepSeek, GLM, Qwen, Kimi, MiniMax, MiMo, Mistral)** —
  - **DeepSeek**: Aligned V4.1 Flash pricing across all canonical and compat aliases (`deepseek-flash`, `deepseek-v4.1-flash`, `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`) to the official schedule of **$0.15 input / $0.60 output / $0.003 cache hit** per 1M tokens. Added case-insensitive lookup in canonical exact capabilities so uppercase registry IDs (`MiniMax-M3`, `Qwen/*`, `Doubao-*`) match their exact declared specifications.
  - **Z.ai GLM**: Upgraded `glm-5.2` context window from 200k to native **1,000,000** tokens. Marked `glm-5.3` and `glm-5.3-flash` as `thinkingCanDisable: false` per official documentation ("forced thinking and cannot be disabled"). Updated GLM 4.6 max output to 131,072 and GLM 4.5 context to 131,072.
  - **Alibaba Qwen (Model Studio Singapore USD schedule)**: Corrected `qwen3.7-max` ($2.50 in / $7.50 out), `qwen3.7-plus` ($0.40 in / $1.60 out), `qwen3.6-plus` ($0.50 in / $3.00 out), `qwen3.5-flash` ($0.10 in / $0.40 out), and `qwen3.8-flash` ($0.15 in / $0.60 out). Added `qwen3.8-omni-flash` (1M context, 131k output, image + audio + video, $0.15 in / $0.47 out / $0.016 cached). Enabled vision, video, and PDF input on `qwen3.8-max` with 131k max output. Isolated domestic CNY rates to `PROVIDER_PRICING.alicode` so international USD and domestic endpoints remain truthful.
  - **Kimi / Moonshot**: Updated `kimi-for-coding` context to 1,048,576 and `thinkingCanDisable: true`. Added `videoInput: true` to `kimi-k2.6`.
  - **MiniMax**: Aligned `MiniMax-M3` context to 1,000,000 and max output to 524,288 with video input support. Updated `MiniMax-M2.5` context to 204,800.
  - **Xiaomi MiMo**: Added `mimo-v2.6-flash` (1M context, 131k output, $0.14 in / $0.28 out) and `mimo-v2.6-pro` ($0.435 in / $0.87 out). Enabled `reasoning: true` across the MiMo V2.5/V2.6 series.
  - **Mistral**: Upgraded `mistral-medium-latest` and `mistral-small-latest` to 256,000 context window, 256,000 max output, vision, and hybrid reasoning support.
  - Test: `tests/unit/asia-eu-models-2026-verified.test.js` (8 cases); 77 pricing/capabilities tests green.
- **feat(models): add verified specs and pricing for flagship 2026 OpenAI, Grok, and Gemini models** —
  - **OpenAI GPT-6.1 & GPT-6 series**: Added `gpt-6.1-sol` (released 2026-09-29) with 1,050,000 context window, 128,000 max output, vision, PDF input, and reasoning, priced at official **$2.00 input / $10.00 output / $0.10 cache read / $2.50 cache write** per 1M tokens. Added `pdf: true` across all GPT-6, GPT-5.x, GPT-4o, and o-series vision models (official OpenAI docs confirm all vision models accept document/PDF attachments). Corrected cache write rates for 5.6/6.x to the official 1.25× formula (Sol $5.00, Terra $2.50, Luna $0.25, GPT-6 Sol $2.50, GPT-6 Luna $0.125).
  - **Codex CLI models**: Added exact capabilities and pricing for `gpt-5.3-codex-spark` (128,000 context, 32,000 output, vision + PDF, priced at $1.75 / $14.00 / $0.175) and `gpt-5.3-codex` (vision + PDF enabled, resolving Codex CLI's full multimodal input support). Corrected `gpt-5.4-mini` and `gpt-5.4-nano` context window to **400,000** (previously mis-patterned to 1.05M).
  - **xAI Grok**: Added `grok-4.7` (500k context, 500k output, vision + PDF, $2.00 / $6.00 / $0.50 cached) and `grok-4.3` (1,000,000 context, 30,000 output, vision + PDF, $1.25 / $2.50 / $0.20 cached). Updated `supportsGrokCliReasoningEffort` to include Grok 4.7. Added `grok-4.7` and `grok-4.6` to `registry/grok-cli.js`.
  - **Google Gemini**: Aligned Gemini 3.8/3.7/3.6 Flash pricing to the active 2026 schedule (**$0.75 input / $3.75 output / $0.075 cache read**, resolving premature 2× overcharge before the 31 Dec 2026 promo expiration). Corrected `gemini-3.1-pro-preview` pricing from $0.50/$3.00 to official **$2.00 input / $12.00 output / $0.20 cache read**.
  - Test: `tests/unit/flagship-models-2026-verified.test.js` (6 cases); 41 focused tests green.
- **fix(antigravity): align native functionResponse role, bypass sentinel, Claude bridge limits, and Gemini maxOutputTokens** —
  - **FunctionResponse role asymmetry**: Google Antigravity wire captures prove that Gemini models require `role: "model"` for `functionResponse` tool responses, while Claude models proxied through Google's bridge require `role: "user"`. Zen previously forced `role = "user"` unconditionally, breaking tool calls on all native Gemini turns.
  - **Thought signature bypass sentinel**: Preserved Google's documented sentinel `"skip_thought_signature_validator"` verbatim instead of replacing it with `DEFAULT_THINKING_AG_SIGNATURE` after failing `isValidBase64`.
  - **Claude on Antigravity limits**: Google's Cloud Code bridge limits Claude models to 250,000 context tokens and 64,000 max output, with `application/pdf: false` (images only), as confirmed by Google's live `official_models.json`. Mapped exact overrides in `PROVIDER_CAPABILITIES.antigravity` so the gateway no longer sends over-budget envelopes or unsupported PDF attachments to Google's Claude bridge.
  - **Max output tokens clamp**: Bumped `MAX_ANTIGRAVITY_OUTPUT_TOKENS` from `64000` to the official limit **`65536`** for native Gemini 3.5/3.6/3.7/3.8 Flash.
  - **`gemini-3-flash` thinking capability**: Removed `thinking: false` from `registry/antigravity.js` (Google's model catalog confirms `supportsThinking: true` with `minThinkingBudget: 32`).
  - Test: `tests/unit/antigravity-native-protocol.test.js` (5 cases); 34 Antigravity tests passing.
- **feat(claude): add verified Claude Sonnet 5.5, fix Fable 5.1 cache read, and drop non-existent beta flag** —
  - Added `claude-sonnet-5-5` (and dot alias `claude-sonnet-5.5`) released 2026-09-28 to `MODEL_CAPABILITIES`, `PATTERN_CAPABILITIES`, `MODEL_PRICING`, and both the `claude` (OAuth) and `anthropic` (API key) registries. Mapped with native 1,000,000 context window, 128,000 max output, adaptive thinking, `thinkingCanDisable: false` (Anthropic returns 400 on `type: "disabled"` for Sonnet 5.5, lowest allowed setting is `between_tools`), and official pricing at **$2.00 input / $10.00 output / $0.20 cache read / $2.50 cache write** per 1M tokens. Previously missing entirely, falling through to the generic `$3/$15` pattern and 200k/64k envelope.
  - Corrected `claude-fable-5-1` cache read pricing from `$1.00` to **`$0.25`** (official rate is 0.025× input). Marked `claude-fable-5` with `thinkingCanDisable: false` matching upstream validation.
  - Dropped non-existent beta flag `token-efficient-tools-2026-03-28` from `CLAUDE_BETA_FLAGS_BASE` in `open-sse/config/clientVersions.js` (binary audit of the official 241MB native Claude Code 2.1.286 executable confirmed 0 occurrences; hallucinated flag risked 400 rejections from Anthropic).
  - Test: `tests/unit/claude-sonnet-55-verified.test.js` (5 cases).
- **fix(clients): sync spoofed client fingerprints and drop fabricated Windsurf version** — bumped all spoofed client fingerprints to their latest first-party releases verified on 2026-10-01: Claude Code 2.1.280 → **2.1.286** (npm @anthropic-ai/claude-code), Codex CLI 0.156.1 → **0.159.3** (npm @openai/codex), Gemini CLI 0.60.0 → **0.62.0** (npm @google/gemini-cli, core still pins @google/genai@1.30.0), VS Code 1.137.0 → **1.140.0** with bundled Copilot Chat 0.65.0 → **0.68.0** (verified from `extensions/copilot/package.json` at tag 1.140.0), Kiro IDE 1.1.0 → **1.2.4** and CLI 2.21.0 → **2.26.0** (kiro.dev/changelog, 2026-09-30 release with Workflows), CodeBuddy CLI 2.151.0 → **2.161.0** (@tencent-ai/codebuddy-code), Grok Build 1.0.34 → **1.0.44** (@xai-official/grok), Kimchi 1.1.23 → **1.3.0** (getkimchi/kimchi GitHub release), Zed 1.18.1 → **1.22.0** (stable release), Cursor 3.17.8 → **3.22.12**, and OpenCode 1.18.31 → **1.18.34**. Corrected `executors/windsurf.js` from the fabricated version **3.14.0** to **3.10.48** (latest stable release per windsurf.com/changelog, 2026-09-29); spoofing a non-existent future release violates the Zen fingerprint policy and risks upstream account flags. Centralized hardcoded `kiro-cli/1.0.0` (in `executors/default.js` and `services/tokenRefresh/providers.js`) to `KIRO_CLI_USER_AGENT` and `qodercli/1.0.0` (in `services/qoderModels.js`) to `QODER_CLI_VERSION` (1.1.65), eliminating version split-brain across executors.
  - Tests: `tests/unit/claude-header-forwarding.test.js`, `tests/unit/claude-cloaking.test.js`, `tests/unit/opencode-zen-identity.test.js`, `tests/translator/golden-url-header.test.js` updated; `providers-baseline.json` synced; 235 focused tests green.
- **fix(capabilities): report `pdf` for Gemini 2.5/3.x models** — every Gemini pattern omitted `pdf`, so the safe floor (`pdf: false`) survived and `stripUnsupportedModalities()` deleted an attached document and replaced it with the `[file omitted: model has no document support]` placeholder before the request reached Google. Gemini 2.5 and 3.x read PDFs natively on the Gemini API, Vertex and the Antigravity transport (the `*gemini*image*` entry also gets `pdf: true`, matching the image models' document input). Gemma stays text-and-image only.
  - Test: `tests/unit/gemini-document-capability.test.js` (3 cases: 2.5/3.x across gemini, gemini-cli, vertex and antigravity; Gemma exclusion; other modalities intact).
- **fix(capabilities): resolve model capabilities independently of dot/dash id spelling** — model ids reach the resolver in two spellings (registry uses dots for versions, `claude-sonnet-4.6`; clients and sibling registries send dashes, `claude-sonnet-4-6`), and the exact tables hold only a partial set of both. A dash-spelled id therefore missed its hand-written entry and fell through to a generic pattern: `claude-sonnet-4-6` on `claude`/`antigravity`/`kimchi` resolved to 200k context / 64k output / `claude-budget` thinking instead of 1M / 128k / `claude-adaptive`, and dash-spelled multimodal ids (`glm-5.3-flash`, `qwen3.8-*`, `glm-4.6v`) lost `vision`/`pdf`, which made the request path strip images and documents before dispatch. Resolution now retries the normalized spelling (digit-digit hyphen → dot) and, for the exact tables only, the id with a presentation-only variant suffix removed (`-thinking`, `-agentic`, which also fixes Kiro `claude-opus-4.7-thinking/-agentic` and Antigravity `claude-opus-4-6-thinking` reporting the generic 200k/64k envelope). Dated ids keep their exact lookups because the as-spelled id is always tried first. Audit count: 233 registered models changed resolved capabilities with spelling before this fix.
  - Test: `tests/unit/capabilities-spelling-stability.test.js` (5 cases: Claude/Antigravity dot-vs-dash parity, Kiro variant suffixes, GLM/Qwen vision retention, Grok/GPT context retention).
## [0.8.8] - 2026-09-29

### Zero-Setup Install (auto-provisioned secrets)

Fresh `npm i -g @joyccn/zenrouter` installs could load the dashboard but **never log in**: `POST /api/auth/login` returned `500 {"error":"JWT_SECRET environment variable is required. Set a strong random secret (min 32 chars) in your .env file."}`.

Root cause — the requirement was unsatisfiable as shipped:
- The dashboard signs its session cookie with `JWT_SECRET`, and `src/lib/auth/dashboardSession.js` deliberately has **no fallback** (a known default would let anyone forge a session).
- The published package ships **no `.env`**, and the spawned standalone server never loaded one — Next reads `.env` only from its own project root, which inside the package is `<pkg>/app/`. A `.env` in the user's CWD was silently ignored (reproduced).

Fixes:
- **feat(cli): generate and persist per-install runtime secrets** — new `cli/hooks/runtimeSecrets.js` creates `JWT_SECRET`, `API_KEY_SECRET` and `MACHINE_ID_SALT` (32 random bytes each) in the user data dir (`~/.zenrouter/secrets.json`, `%APPDATA%\zenrouter\secrets.json` on Windows) and injects them into the spawned server. Written atomically, `0600`, and **reused across restarts** so sessions and machine identity survive. An explicitly exported value always wins.
- **feat(cli): auto-setup at install time** — `hooks/postinstall.js` now creates the data directory and generates the secrets during `npm install`, so the first `zenrouter` run is immediately usable.
- **fix(server): load `.env` beside the server or in CWD** — `custom-server.js` gained a dependency-free loader that runs before anything reads `process.env`, so an operator-placed `.env` is finally honoured. Real environment variables are never overridden. A malformed file cannot block boot.
- **feat(docker): provision secrets in the entrypoint** — the image generates its own into the data volume when `JWT_SECRET` is unset or shorter than 32 chars, and reuses them on restart. `docker-compose.yml` now marks `env_file: .env` as `required: false`, so `docker compose up` works with no `.env` present.

### Docs
- **docs(.env.example): document that no `.env` is needed** — the generated secrets are described, along with the fact that any value set in `.env` overrides them.

### Verification
- New suite `tests/unit/runtime-secrets-autosetup.test.js` — 14 tests (generation, persistence/stability, per-install isolation, explicit-env precedence, corrupt-file recovery, postinstall/CLI/Docker wiring).
- Reproduced the original failure against published `@joyccn/zenrouter@0.8.7`, then confirmed the fix end-to-end on Windows: fresh install → postinstall generates secrets → server starts → login `200` → authenticated `/api/auth/status` → protected API `200` → restart reuses the same secret.
- Docker entrypoint logic exercised for four scenarios (fresh, restart, explicit-secret wins, short-secret replaced).

## [0.8.7] - 2026-09-29

### Claude Provider Auth & Streaming Fixes
- **fix(claude): drop org-gated `timing-2026-09-09` from the `anthropic-beta` header and self-heal future rejections** — every `claude` provider request failed with `400 Unexpected value(s) \`timing-2026-09-09\` for the \`anthropic-beta\` header`. The flag was added in `3137197a` as a "latest stable beta flag", but it is Claude Code's internal per-turn timing telemetry beta, gated per organization: the string ships inside the client binary while the server only accepts it once the account holds the entitlement, so sending it unconditionally broke every turn for unentitled accounts. The flag is removed from `CLAUDE_BETA_FLAGS_BASE`, and `parseRejectedAnthropicBetaFlags` + a per-connection denylist in `DefaultExecutor` now absorb any future rejection (parse the named flags from the 400, retry the same turn once without them, skip them on all later turns) so an entitlement change degrades to one extra round-trip instead of a hard failure.
- **fix(commandcode): restore the `data: [DONE]` sentinel on chat streams (#4461)** — `CommandCodeExecutor.execute()` declares `responseFormat: openai` now that `inspectAndWrapCommandCodeResponse()` has already decoded the upstream NDJSON into OpenAI chunks and appended the sentinel. Without it `handleChatCore` kept the provider format as `commandcode`, ran the body through the SSE translator a second time, and the translator turned `[DONE]` into `{done:true}` and dropped it — so strict OpenAI clients (deepseek-acp, Cline SDK) saw the stream end on the finish chunk and reported truncation.
- **fix(translator): always emit `is_error` on `tool_result` blocks (#4463)** — `openai-to-claude` spread `is_error` only when truthy, but Zed's hosted Anthropic wire type declares it required, so the follow-up tool turn failed with `400 failed to parse Anthropic request: missing field \`is_error\``. Both the OpenAI `role:"tool"` path and the Claude-shaped passthrough now always emit a boolean `is_error` (default `false`), which is harmless for Anthropic's public API and required by strict parsers.

### Upstream Audit (decolua/9router, 2026-09-28/29)

Verified already-fixed in Zen (no change needed): **#4465** (CommandCode first-delta drop — Zen replays raw byte chunks), **#4306** (Gemini schema map key named `properties`), **#4276** (`custom` tool emitted as `function_call`), **#4345** (terminal model turn / unresponded `functionCall`), **#4295** (`killAllAppProcesses` over-match — Zen parses `ps -o pid=,args=` and verifies through `/proc`), **#4326** (NDJSON multi-line packets), **#4311** (O(n) provider insert).

### Known Issue (not yet fixed)
- **GLM-5.3-Flash intermittent `400 code 1210` (#4409)** — Zen routes `glm` over two transports (`/api/coding/paas/v4` OpenAI, `/api/anthropic/v1/messages` Claude) and `resolveFormat` prefers the model's `zai` thinking format over the resolved target format, so a native `/messages` transport can receive OpenAI-dialect thinking fields (`reasoning_effort`). Not patched: the report does not confirm which transport was in use, and Zen already clamps `reasoning_effort` to `low|high|max`. Tracked for the next round.

## [0.8.6] - 2026-09-28

### Core Gateway & Protocol Translation Fixes
- **fix(translator): map Claude thinking blocks to reasoning_content on Claude→OpenAI route** — resolved thinking blocks mistakenly falling through to the default block handler emitting visible `[thinking block omitted: not supported on this route]` notices in assistant content. Now properly maps Claude `thinking` blocks to `reasoning_content` and silently ignores `redacted_thinking` without injecting placeholder text, while keeping assistant messages intact in `filterToOpenAIFormat`.
- **fix(usage): extract cached_tokens and reasoning_tokens from input/output_tokens_details on OpenAI routes (#4444)** — resolved an issue where the Codex provider on `/v1/chat/completions` always recorded `cached_tokens: 0` in `usageHistory` because usage metrics were only parsed from `prompt_tokens_details`. Now robustly reads `input_tokens_details.cached_tokens` and `output_tokens_details.reasoning_tokens` across all OpenAI usage paths.
- **fix(translator/gemini): normalize free-form and untyped schemas and enable combo fallback (#4447)** — enhanced `cleanJSONSchemaForAntigravity` to infer default types for untyped properties and expand boolean schema values into valid schema objects. Added error classification rules for `function_declarations` and `unsupported schema` with 0ms cooldown so combo routing automatically advances to the next model upon encountering provider-specific schema rejections.
- **fix(cli-tools): prevent writing placeholder key and resolve real active dashboard key (#4399)** — fixed CLI Tools (Codex, Cline, Copilot, OpenCode, Kilo, DeepSeek TUI, Grok Build) writing placeholder key `sk_zenrouter` when `~/.codex/config.toml` exists or when empty key was passed, resulting in 401 Unauthorized errors when `requireApiKey` is active. Updated `ApiKeySelect` to propagate the default key, card components to prefer active dashboard keys, and backend routes to automatically resolve active keys from `apiKeysRepo`.
- **fix(codebuddy): preserve user system prompts across CodeBuddy executors (#4401)** — fixed an issue where `CodeBuddyIntlExecutor` unconditionally replaced all incoming `system` and `developer` messages with a fixed `"You are CodeBuddy Code."` string, dropping custom system prompts. Now safely appends user system prompts, and updated `CodeBuddyExecutor` (`codebuddy-cn`) to sanitize agent identity markers via pattern replacement rather than bluntly erasing any system prompt exceeding 2,000 characters.
- **fix(codex): trigger combo fallback on ChatGPT account model restrictions and response.failed (#4369)** — added error matching rules for `"not supported when using codex with a chatgpt account"` and `"response.failed"` with 0ms cooldown, and enhanced Codex SSE peek (`_peekSseTransientError`) to catch `response.failed` events before stream commitment so combos seamlessly fallback to the next member.
- **chore(deps): prune obsolete uninstalled banner dependencies** — removed unreferenced legacy file `src/lib/oauth/utils/banner.js` which required uninstalled packages `figlet`, `gradient-string`, and `chalk-animation`.

## [0.8.5] - 2026-09-27

### Latest 2026 Model Catalog & Web Search Enhancements
- **feat(models): add latest OpenAI GPT-6 (Astra, Sol, Luna) and GPT-5.6 models** — mapped capabilities and pricing for `gpt-6-astra` ($10/$50, 1.05M ctx), `gpt-6-sol` ($2/$10, 1.05M ctx), `gpt-6-luna` ($0.10/$0.50, 1.05M ctx), `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`.
- **feat(models): add Z.ai GLM-5.3 & GLM-5.3-Flash** — registered 1M context capabilities and pricing for `glm-5.3` ($1.40/$4.40) and native multimodal `glm-5.3-flash` ($0.15/$0.50).
- **feat(models): add Qwen 3.8 (Max, Flash) & Qwen 3.7 series** — registered capabilities and pricing for `qwen3.8-max` ($2/$6, 1M ctx), multimodal `qwen3.8-flash` ($0.16/$0.47, 1M ctx), `qwen3.7-max`, and `qwen3.6-plus`.
- **feat(models): add DeepSeek V4.1 Flash** — registered native multimodal capabilities (1M ctx / 384k output) and pricing for `deepseek-v4.1-flash`.
- **fix(search): support provider/model slash syntax and custom search models in Antigravity web search** — enhanced `search.js` and `open-sse/handlers/search/index.js` to parse `provider/model` inputs (e.g. `ag/gemini-3.8-flash`) and forward the custom model to `handleChatSearch`.

### Prompt Caching Detection & Cost Calculation Accuracy (#4191)
- **fix(pricing): eliminate double-counting of reasoning tokens** — subtracted reasoning tokens from total completion tokens before calculating base output cost, charging reasoning only once at its dedicated or output rate.
- **feat(pricing): exact per-component cost calculation and dashboard breakdown (#4191)** — added `calculateCostBreakdown()` calculating exact non-cached input, cached read, cache creation, base output, and reasoning costs. Recorded and aggregated component costs in `usageRepo` and updated `UsageStats` to display exact component costs instead of blended average token shares.
- **feat(cache): enhance prompt cache detection for OpenCode, DeepSeek, and OpenAI** — expanded `normalizeUsage` and `canonicalizeUsage` to detect `prompt_cache_hit_tokens` and preserve cache details across DeepSeek and OpenCode routes.
- **feat(pricing): add MiMo pricing and free namespaces** — added `mimo-v2.6-flash` and `mimo-v2.6-flash-free` to model pricing and registered `opencode-free/` and `mimo-free/` in `FREE_MODEL_NAMESPACES`.

### Antigravity Image Generation Enhancements
- **feat(image/antigravity): enhance image generation and editing pipeline** — support multi-reference images via both `image` and `images[]`, resolve remote HTTP(S) image URLs via `fetchImageAsBase64`, support explicit `aspect_ratio` and size mapping, enforce `responseModalities: ["TEXT", "IMAGE"]` on upstream generation config, add prompt directives to ensure image outputs, robustly parse `inlineData` and `inline_data`, and extract precise quota reset timestamps on upstream rate limits.
- **feat(models/antigravity): add Gemini 3 Pro Image, Gemini 2.5 Flash Image, and Imagen 3 models** — expanded Antigravity image models in the provider registry with `gemini-3-pro-image`, `gemini-2.5-flash-image`, `imagen-3.0-generate-002`, and `imagen-3.0-fast-generate-001`.

### Upstream Fixes & Enhancements (decolua/9router Cherry-Picks)
- **perf(providers): make POST /api/providers O(1) and refuse silent key overwrite (#4311, #4350)** (by @nikan-wystaf) — eliminated full-pool priority renumbering per insert and prevented silent key overwrites on name collisions.
- **fix(capabilities): stop caching catalog source per module copy (#4344, #4351)** (by @Mohammad-Hijjawi) — ensured `setCatalogSource(null)` clears the shared `globalThis` slot across all bundled module chunks.
- **fix(commandcode): replay raw byte chunks to preserve all NDJSON lines (#4326)** (by @Christian-Gennari) — resolved dropped NDJSON events when multiple lines arrive within a single TCP packet.
- **fix(gemini): guard terminal model turns and unresponded functionCalls in normalizeGeminiContents** (by @akmal-safari-pellu) — avoided Gemini 400 errors when conversations end on model turns or have dangling tool calls.
- **fix(claude): decloak tool names when toolNameMap misses (#4342)** (by @dragongesa, @decolua) — added suffix-stripping fallback for tool name decloaking when exact map lookup fails.
- **fix(oauth): stop Zed paste-token crash and add IDE auto-import (#4359)** (by @amh-seify) — added `ZedAuthModal` with local IDE keyring auto-import, browser OAuth flow, and paste-token safeguards.
- **fix(cli-tools): refresh Codex settings after apply and keep existing auth token (#4347)** (by @kalfian, @decolua) — preserved existing `ANTHROPIC_AUTH_TOKEN` on Claude setup and forced non-cached Codex settings revalidation.
- **feat(cline): expose the cline-free/* tier and price it at zero (#4334)** (by @nicknyanjui) — surfaced Cline recommended models' free tier into the catalog and priced at zero.
- **fix(responses): carry streamed output items in response.completed (#4307)** (by @aniruddhaadak80) — ensured completed response event includes the accumulated output items for client consumption.
- **fix(stream): terminate OpenAI SSE with done sentinel (#4356, #4375)** (by @semihisikman) — ensured translated OpenAI-compatible streams always end with `data: [DONE]`, resolving stream termination errors in Cline SDK.
- **fix(responses): report usage on response.completed (#3432)** — properly mapped upstream usage to Responses API shape and attached token usage metrics to the terminal event.
- **fix(catalog): scope synced catalog modalities to provider:model and upgrade to v2** — resolved provider-scoped catalog modalities in capabilities resolution and sync.
- **fix(translator): preserve message when content has unknown block types (#4383)** (by @semihisikman) — prevented dropping user messages when encountering unknown content blocks like `container_upload`.
- **fix(translator): strip errorMessage and non-standard keywords from Gemini tool schemas (#4391)** (by @semihisikman) — removed non-standard error and annotation keywords to prevent 400 INVALID_ARGUMENT from Gemini API.
- **fix(test): add codebuddy-intl to OAUTH_TEST_CONFIG with tokenExists strategy (#4394)** (by @semihisikman) — added missing test config for codebuddy-intl accounts.
- **fix(usage): support codebuddy-intl in parseQuotaData (#4362)** — forwarded recurring flag for both codebuddy-cn and codebuddy-intl so bonus packs correctly display expiration instead of reset cadence.
- **fix(opencode-go): clamp deepseek reasoning_effort "max" to "high" for mimo backends (#4368)** (by @decolua) — prevented HTTP 400 errors when routing deepseek models via OpenCode Go with max reasoning effort.
- **feat(thinking): return Claude thinking text to OpenAI-format clients** (by @MrBeanDev, @decolua) — captured thinking intent from pre-translation bodies and set `thinking.display: "summarized"` so OpenAI clients receive Claude's thinking text.
- **feat(combos): display vision adapter models in an ordered table view** (by @decolua) — upgraded the vision capacity adapter UI to an ordered table view with reorder controls.
- **fix(antigravity): rewrite all Hermes identity variants** (by @decolua) — sanitized modern Hermes Agent system prompts to prevent upstream 429 quota exhaustion flags.
- **fix(cli): filter model selector by active connections and noAuth providers** (by @decolua) — filtered CLI interactive model picker to only show models with active credentials or noAuth providers.
- **test(cross-platform): ensure test suites pass on Windows and Unix** — normalized CRLF/LF line endings, file lock handling, and path separators in test suites.

### Security & Hardening
- **fix(security): restrict PXPIPE process execution routes to localhost** — added `/api/pxpipe/*` (install, start, restart, stop) to `LOCAL_ONLY_PATHS` in `dashboardGuard.js` to prevent remote callers over reverse proxies/tunnels from triggering arbitrary npm package installations or process management on the server host.
- **fix(security): prevent shell injection in DNS hosts config** — eliminated shell string interpolation in `src/mitm/dns/dnsConfig.js` by safely writing hosts content to a temporary file and atomically updating `/etc/hosts` via direct file copying without shell command construction (`sh -c`).
- **fix(security): harden SSRF protections against cloud metadata access** — added `assertNotCloudMetadata` in `src/shared/utils/ssrfGuard.js` and enforced it in `/api/provider-nodes/validate`, blocking loopback requests from reaching link-local and cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`).
- **feat(auth): dedicated change-password endpoint** — introduced `POST /api/auth/change-password` with authenticated session verification, strict password length checks, and bcrypt hashing to isolate password rotation from generic settings updates.
- **fix(security): warn when running in development mode without peer trust** — added warning in `src/lib/auth/trustedPeer.js` when `custom-server.js` peer token is absent to alert developers of non-local request handling.

## [0.8.0] - 2026-09-24

### Base: v0.7.4 stabilization (shipped in this release train)
- **feat(anthropic): Claude Opus 5.5 launch support** — registry, 1M
  capabilities, pricing, and bidirectional dot/dash aliasing across
  claude/kiro/tokenrouter.
- **feat(clients): signature bumps** — Claude Code 2.1.280, Codex 0.156.1,
  Kiro 1.1.0, Gemini CLI 0.60.0, Codebuddy 2.156.0; upstream param fixes.
- **fix(stream): abort upstream on stall timeout** — no more orphaned
  background streams or 0-token spam after timeouts.
- **fix(oauth): standard OAuth routing restored.**

### 9router upstream cross-check (Sep 2026) — fixed in Zen

Research into the latest `decolua/9router` issues/PRs (models, security,
streaming) with per-item outcomes — already-fixed vs newly fixed in Zen:

#### Fixed
- **fix(models): deepseek-v4-1-flash vision (#4293)**
  Upstream maps this model text-only from name patterns while its own upstream
  is multimodal. Zen now carries an exact caps entry with vision:true + 1M/384K.
- **fix(auth): model-scoped permanent 4xx without cooldown (#4271/#4263)**
  Unentitled slug, unknown/retired/EOL model, too-old client (including the
  Claude Code version gate), and bare 410 now fall back + 0ms: combos advance
  to the next member without locking the healthy account, and no DB write
  keeps connection health truthful.
- **fix(routing): disabled-model gate + single 5xx retry (#4249/#4277)**
  Dashboard-disabled models are now rejected (403) at routing time instead of
  merely hidden from listings; one same-account retry for sporadic
  500/502/503/504 precedes the 30s lock/fallback.
- **fix(auth,cli): manual locks + process sweep (#4250/#4295)**
  Activation only clears short-lived cooldowns; manual kill-switches (>24h)
  survive. `killAllAppProcesses` parses pid-first output and re-verifies
  candidates against /proc on Linux; never kills on doubt.

#### Already fixed in Zen (verified, no change)
- **#4301 custom-model vision**: Zen has a declared-caps overlay
  (`getDeclaredModelCaps` + `withDeclaredCapabilities`) honored by both the
  request path and listings — operator declarations win over name patterns.
- **#4289 placeholder credentials**: `change-me*` is treated as unset; remote
  stays 403 until the password is changed.
- **#4259 Claude version gate**: fingerprint is already 2.1.280 (Opus 5.5's
  requirement).
- **#4273 tool-id collision**: openai-to-gemini already disambiguates with a
  hash suffix.
- **#4247 mimo thinking injection**: Zen has no `*mimo*v2.6*` pattern
  (generic one carries no thinkingFormat) — not affected.
- Other #4277 / .env / JWT / OAuth items: per the mapping above.

#### Known limitations (separate follow-ups)
- #4292 codex account-scoped catalog intersection (dashboard lists static
  registry; per-account fetch already sends the Bearer token),
  #4252 Cline App identity (no verifiable UA on record — not invented),
  #4268 pi-settings (Zen has no Pi writer yet), #4264 opencode/go outage
  (upstream "Endpoint is unavailable", not a router bug), #4251 ESM warning
  (cosmetic; `type: module` is wrong for this mixed CJS/ESM repo),
  #4248 NVIDIA 250s hangs (Zen aborts connects at 60s by design),
  Cursor/Windsurf/Trae wire IDs not officially verifiable — left untouched.

### Round 2 — remaining upstream items (same snapshot)

#### Fixed
- **fix(security): rightmost XFF hop (#4286)** — leftmost hop and bare
  X-Real-IP are client-controlled behind a loopback tunnel; rate-limit
  buckets now key on the proxy-appended hop.
- **feat(routing): session-sticky strategy (#4297)** — stable-hash sessions
  onto one account to preserve prompt caches; dashboard toggle included.
- **feat(models): live Zed catalog (#4244)** — provider models route resolves
  Zed's hosted catalog so combos can select current models.
- **fix(translator): custom_tool_call round-trip (#4276)** — declared custom
  tools come back as `custom_tool_call` items instead of `function_call`.
- **fix(stream): truncated-into-nothing fails (#4254)** — Responses
  `incomplete` / `length` with zero usable content returns 503 for fallback
  instead of blank 200s.

#### Already covered (verified, no change)
- **#4270 auto-mode classifier**: safeguards/safeguard_results passthrough
  already tested (#4173); unknown request fields are never stripped.
- **#4239 Ollama usage**: dashboard already reads `/api/usage` session/weekly
  ratios (tested in `ollama-usage.test.js`).
- **SSRF posture (#4286 remainder)**: `fetchPublic` + DNS-pinned image
  prefetch + size/mime caps all present; Dependabot/CodeQL skipped per scope.

### Full ecosystem refresh — snapshot 23 September 2026

10-provider-group research pass (official docs first: platform.openai.com,
ai.google.dev, docs.x.ai, api-docs.deepseek.com, docs.mistral.ai,
platform.kimi.ai, platform.minimax.io, docs.z.ai, Model Studio, Qianfan,
Hunyuan, MiMo, console.groq.com, Cerebras, SambaNova, Together, Fireworks,
Nebius, SiliconFlow, Chutes, Cloudflare, docs.cohere.com, docs.perplexity.ai,
jina.ai, docs.voyageai.com, ElevenLabs, Cartesia, Deepgram, BFL, Recraft,
fal.ai, Runway, Brave/Exa/Tavily/Serper docs, Copilot model table).

#### Added
- New routable models: GPT-6 Astra/Sol/Luna, GPT-5.6 trio, GPT-5.5/5.4-pro,
  o1-pro, gpt-transcribe, gpt-image-2; Gemini 3.5-flash/3.1-flash-lite +
  stable Nano-Banana image IDs; Grok 4.7/4.3/Build; Mistral Small 4;
  MiniMax M2/highspeeds; GLM flashx/turbo/4.5/4.5v variants; Qwen
  3.8/3.7-flash/3.6-plus/3.5-flash/coder-flash; MiMo v2.5-asr; ERNIE
  5.1/5.0/4.5-turbo/X1; Hy3 preview; host seeds (gpt-oss-20b, Qwen3.8,
  V4-dated, Kimi-K3, GLM-5.3, MiniMax-M3, Chutes TEE catalog); Cohere
  Command R7B/A-family; Sonar reasoning-pro/deep-research; Voyage-4
  embeddings; Jina v4; Eleven v3/Flash; Cartesia 3.5/3.6; FLUX.2 family;
  Recraft V4 family; fal flux-2/ideogram-v3; Runway gen4.5/aleph;
  Copilot current IDs; Ollama cloud current pins.

#### Changed
- Repricing to official schedules: OpenAI (GPT-5+ 10% cache, 5.6 promo,
  o-series, 4.1 family), Gemini (2.5-pro/lite cuts, 3.5/3.1-lite, embedding),
  DeepSeek off-peak schedule, Grok per-model, Mistral -latest slugs, Kimi
  k2.6 hit rate, MiniMax M2 tier, full Z.ai GLM table, Qwen base tiers,
  MiMo PAYG, Qianfan ERNIE, Sonar, Cohere, Voyage embeddings.
- Context/caps corrections: GPT-5.4/5.5 1.05M, Gemini image 128K class,
  Gemma-4 256K, DeepSeek 384K out, Codestral 128K, GLM-5.3 128K out,
  qwen3-coder-next 256K, Seed/Doubao 256K/128K, ERNIE classes, Command A
  256K, Sonar Pro 200K.
- Transports/endpoints: Nebius → api.tokenfactory.nebius.com; HuggingFace
  images → Inference Providers router (same path shape).

#### Removed / deprecated
- Retired IDs removed from routable lists: DALL-E 2/3, retired Codex slugs,
  Gemini retired previews + PaLM embedding-001, DeepSeek chat/reasoner,
  Grok 3/fast/code/image-1212, Kimi k2.5/k2/latest, MiMo V2 series,
  Cerebras/Groq/Together/Nebius/Cloudflare retired serverside IDs,
  Copilot retired models (4.5/4.6/5.2/grok-code), Ollama stale pins.
- Flagged deprecated (kept, labelled): PlayHT (discontinued), Google PSE
  (sunsets Jan 2027), Perplexity chat-completions transport (ends 27 Sep
  2026 — migration tracked, not switched), AssemblyAI ID mapping,
  GitLab Duo transport, Cohere/Jina rerank wiring.

#### Tests
- New: pricing-openai/gemini/xdm/ckm/asia/hosts/media-current,
  registry-integrity (catalog-wide structural validation),
  stream-stall-cancels-upstream kill-chain (prior session).

### Fixed

- **fix(auth): treat OAuth org-denial 403 as permanent, skip refresh storm**
  - Classifies `oauth_not_allowed_for_organization` / `oauth_org_not_allowed` / org-disabled 403s as `terminal: true` with 15m cooldown (per Anthropic docs this is server-side org policy — refresh can never heal it).
  - `chatCore` peeks the cloned error body and skips the 3x token-refresh + retry for permanent denials; the account is still locked and fallback proceeds once to the next account instead of N accounts × 4 upstream hits.
  - New shared `isPermanentAuthDenial()` helper + `tests/unit/account-fallback-oauth-denial.test.js`.
- **fix(pricing): exact current Claude prices, correct Haiku alias**
  - Adds `MODEL_PRICING` for `claude-opus-5` (5/25), `claude-opus-5-5` + dated snapshot + dot alias (4/20, cache reads 5%), `claude-sonnet-5` (2/10); previously fell through to the 5/25 and 3/15 patterns.
  - Fixes `claude-haiku-4.5` dot alias (was 0.5/2.5, now 1/5 matching the dated snapshot and official pricing).
- **fix(provider): refresh anthropic API-key registry to current lineup**
  - Adds Opus 5.5 / Opus 5 / Sonnet 5 / Haiku 4.5 / Fable 5.1 / Opus-Sonnet 4.6; keeps legacy dated IDs and plain API-key headers (no CLI fingerprint spoofing on this path).
- **fix(translator): surface Claude mid-stream error events**
  - `claude-to-openai` converts SSE `error` events (e.g. `overloaded_error`) into terminal content + STOP instead of swallowing them; inbound `ping` explicitly ignored.
- **fix(stream): carry abort cause into terminal bytes**
  - `pipeWithDisconnect` tracks `abortMessage` (upstream loss vs TTFT vs stall timeout) into `onAbortTerminal`, porting upstream 9Router diagnostics for undistinguishable terminal failures.
  - New `tests/unit/stream-stall-cancels-upstream.test.js` proves the kill chain: watchdog fires once, AbortSignal aborts, errored body unblocks the hung pull, downstream closes gracefully.

### Known limitations
- Preserved-thinking `signature_delta` is not forwarded across the OpenAI bridge (OpenAI has no signature field); multi-turn thinking replay across providers may 400 on Fable 5.1 / Opus 5.5 for post-2026-08-31 accounts.

## [0.7.3] - 2026-09-20

### Changed / Reverted

#### Standard 9Router OAuth Architecture Alignment
- **revert(oauth): restore standard upstream 9Router OAuth flow and modal behavior**
  - Reverted experimental tunnel/public domain OAuth callback routing in `OAuthModal.js` and `/api/oauth/[provider]/[action]/route.js`.
  - Restored 100% standard upstream 9Router behavior: loopback port callback bindings (`http://localhost:${appPort}/callback`, fixed ports for Codex 1455 and xAI 56121), direct popup/manual paste fallbacks, and upstream route validation.
  - Eliminated callback URI mismatch errors (`Redirect URI is not supported by client`) caused by custom public domain redirections on installed-app clients (Claude Code CLI, Google Antigravity/Gemini).

## [0.7.2] - 2026-09-20

### Added / Fixed

#### Stream & SSE Enhancements
- **fix(stream): synthesize terminal chunk on streams ending without finish_reason and log tool calls (#4079, #4080)**
  - When an upstream SSE stream terminates without a `finish_reason`, synthesizes a terminal chunk (`finish_reason: "network_error"`) followed by `data: [DONE]` so clients like `pi` and agentic harnesses close the turn as a deliberate error instead of crashing.
  - Accumulates streamed tool calls (both OpenAI and Claude shapes) into completion callbacks to eliminate deceptive `[Empty streaming response]` log records.
- **fix(stream): preserve and symmetrically populate `delta.reasoning` and `delta.reasoning_content` (#4082)**
  - Downstream coding agents like Cline and OpenRouter SDK clients read reasoning chunks under `delta.reasoning`, while DeepSeek and newer models stream under `delta.reasoning_content`. Symmetrically populates both fields without stripping either, allowing all clients to render model thinking traces.

#### Gateway & Routing Reliability

- **fix(models): expose token limits and context length on combo entries in `/v1/models` (#3486, #4096)**
  - Derives `context_length` and `max_completion_tokens` from combo members (taking the safe minimum envelope across members) so clients like Claude Code, Codex, and Cline do not prematurely trigger compacting loops. Supports both string and object member references.
- **fix(errors): forward `Retry-After` header and classify terminal billing errors (#4147)**
  - Synthesizes and forwards `Retry-After: <seconds>` headers on 429 rate limit error responses to prevent client hammering.
  - Classifies permanent billing errors (`余额不足`, `请充值`, `insufficient balance`, HTTP 402) as `terminal: true` to halt futile retry loops.
- **fix(combos): preserve explicit Fallback strategy override on combos (#4094)**
  - When explicitly selecting Fallback on a combo, the override is now persisted rather than pruned from `comboStrategies`, preventing combos from silently inheriting the global Round Robin routing strategy.
- **fix(api): default `stream` to `false` when omitted on `/v1/chat/completions` (#4122)**
  - Adheres strictly to OpenAI Chat Completions API specification where `stream` defaults to `false`. Requests without the `stream` parameter now return a standard non-streaming `chat.completion` JSON object rather than unexpected SSE stream chunks, preventing downstream JSON parse failures.

#### Proxy Security & Leak Prevention

- **fix(security): enforce Strict Proxy on `/v1/chat/completions` to prevent IP leakage (#4007)**
  - When `strictProxy: true` is configured, requests will fail immediately if the proxy is unreachable or if no proxy URL is resolved, completely preventing silent fallbacks to the machine's direct public IP.

#### Dependency Stability Upgrades

- **chore(deps): bump dependencies for runtime stability and security**
  - Updated `@xyflow/react` to `^12.11.6`, `jose` to `^6.2.12`, `undici` to `^7.29.1` (connection leak & proxy fixes), `marked` to `^18.0.13`, `material-symbols` to `^0.47.4`, `monaco-editor` to `^0.56.0`, `open` to `^11.0.4`, `uuid` to `^13.0.2`, `postcss` to `^8.5.28`, and `better-sqlite3` to `^12.11.1`.
  - Updated `cli/package.json` with `esbuild` `^0.28.2` and aligned React versions to `19.2.4`.
  - Preserved major API stability bounds (`next` on 16.3.5 line, `chalk` 5, `http-proxy-middleware` 3, `socks-proxy-agent` 8) to prevent runtime breaking changes.

#### OAuth Token Refresh
- **fix(oauth): support numeric epoch timestamps in proactive token refresh (#4000)**
  - When `expiresAt` is stored or imported as a numeric string (epoch ms or seconds), `parseTimeMs` normalizes it safely across `tokenRefresh.js`, `chatCore.js`, and executor providers instead of producing `Invalid Date` / `NaN`, preventing silent refresh failures.

#### Antigravity Fake 429 & Account Strike Prevention
- **fix(antigravity): strip Claude Code billing header from system prompts (#4138, #4139)**
  - Claude Code prepends `x-anthropic-billing-header: ...` to system prompts. When passed through OpenAI-format translation to Antigravity, Google answers with fake `429 RESOURCE_EXHAUSTED`, triggering strike blocks on healthy accounts.
  - Added regex stripper to `ANTIGRAVITY_PROMPT_REWRITES` in `open-sse/config/appConstants.js`.

#### OpenCode Free Tier 403 FreeTierError Prevention
- **fix(opencode): inject cloaked decoy tools on all free tier requests with or without tools (#4101, #4146, #4165)**
  - OpenCode's free tier console validates agentic presence by checking for lowercase `bash` and `read` tools; requests from external coding agents (Claude Code, Cline) with N tools or PascalCase tools were rejected with `403 FreeTierError`.
  - Injects `bash` and `read` decoy tools unconditionally while preserving caller tools and defaulting missing `tool_choice` safely.
- **fix(opencode): clamp `xhigh`/`max`/`ultra` reasoning effort to `high` for muse-spark (#4149)**
  - OpenCode's Responses console rejects `xhigh` with HTTP 500 and `max`/`ultra` with 400. Automatically clamps unsupported high-tier efforts to `high` for muse-spark models.

#### Gemini & Antigravity Tool Schema Sanitization
- **fix(translator): sanitize unsupported schema constraints and normalize empty object properties (#4169, #4170)**
  - Strips `encrypted`, `cache_control`, `strict`, `$id`, and `example` from tool schemas before sending to Google Gemini / Antigravity, preventing 400 `INVALID_ARGUMENT` during agent tool calling.
  - Hardens object schema placeholder checks against non-object or array `properties`.

#### Cloudflare Workers AI Array Content & Schema Fix
- **fix(cloudflare-ai): normalize array message content, enforce string content, and alias `@cf` prefix (#1926, #4180)**
  - Cloudflare Workers AI models (such as `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`) reject array message content with HTTP 400 `Type mismatch of '/messages/N/content', 'array' not in 'string'` and `required properties at '/messages/N' are 'role,content'`.
  - Added `@cf` to aliases in `cloudflare-ai.js` so `@cf/...` model references trigger `flattenContent`.
  - Normalizes array content blocks (including raw strings and `input_text`), ensures `content` is never null or undefined, and rewrites `role: "tool"` to `"user"`.

#### Tool Policy & Role Preservation
- **fix(translator): normalize top-level `anyOf`/`oneOf`/`allOf` in Claude tool `input_schema` (#4075)**
  - Anthropic strictly requires `input_schema.type === "object"`. Automatically merges top-level union schemas into valid object properties and enforces `type: "object"` to prevent HTTP 400 rejection from MCP and external tools.
- **feat(claude): pass through `safeguards` and `safeguard_results` for Claude Code auto-mode (#4173)**
  - Claude Code v2.1.278+ relies on server-side classifier checks to provide free auto-mode execution. Loloskan top-level `safeguards` across request translation and preserve `safeguard_results` on streaming delta responses.
- **fix(translator): preserve tool_choice "none", parallel_tool_calls, tool strict, and developer role (#4171, #4172)**
  - `tool_choice: "none"` now translates correctly to Claude `{ type: "none" }` and vice versa instead of widening to `"auto"`.
  - Maps `parallel_tool_calls: false` to Claude `tool_choice.disable_parallel_tool_use: true` and vice versa.
  - Preserves `strict: true` property on tool definitions when translating OpenAI tools to Claude format.
  - Preserves `role: "developer"` when target provider is OpenAI, only normalizing to `"system"` for providers that reject it.

#### Custom Provider Live Model Discovery in Combos
- **fix(combos): display live-discovered models from local and custom providers in Combo selector (#4177)**
  - Newly configured custom providers (such as Ollama, vLLM, or LM Studio) had live models fetched by the dashboard, but the Combo model selector only inspected manual aliases and registered custom models, omitting live models.
  - Merged `liveModelsByProvider` into custom provider model groups and supported aliases keyed by either `nodePrefix` or raw `providerId`.

#### Upstream Stability & Routing Cherry-Picks
- **fix(auth): don't cool down an account for request-scoped 4xx client errors (upstream #20a43f5)**
  - Client-side payload errors (400, 405, 413, 415, 422) without rate-limit or quota wording no longer trigger transient account cooldowns or lockout cascades, keeping healthy accounts available.
- **fix(antigravity): sanitize Hermes agent identity in system prompts (upstream #f642295)**
  - Rewrites Nous Research Hermes branding in system instructions to avoid triggering Google Cloud Code 429 quota locks.
- **fix(codex): route bare `codex-auto-review` model to Codex provider (upstream #efc80ba, #4135)**
  - Registers `codex-auto-review` in Codex registry and model prefix inference so Codex CLI's auto-review model routes to OAuth Codex instead of falling through to `openai` (which failed with 404).
- **fix(commandcode): retry on transient stream errors and avoid fake stop chunks (upstream #092c84e)**
  - Retries transient 502/503/504 stream responses on CommandCode upstreams and throws real stream errors instead of emitting fake completion stop chunks.

#### Token Saver Modules Synchronization & Upgrades
- **feat(headroom): add Gemini and Antigravity request envelope compression adapter (#4070)**
  - Projects plain text and `functionResponse` execution outputs from `request.contents[].parts[]` into temporary messages for Headroom `/v1/compress` and writes back compressed text in-place, eliminating "unsupported antigravity request shape" skips.
  - Normalizes reported tokens from alternative `/v1/compress` endpoints (e.g. lean-ctx `#4120`) supporting `original_tokens` and nested stats formats.
- **feat(caveman): synchronize rules with official Caveman v2.7.0**
  - Incorporates ASD-STE100 Simplified Technical English standards (one idea per sentence, max 20 words, active voice, present tense, imperative directives).
  - Explicitly forbids dropping essential negations (`not/never/no/only/except`), fake broken grammar insertion, invented abbreviations (`cfg/impl/req/res/fn`), and causal arrow characters (`→`), while firing tool calls directly with zero preamble.
- **feat(ponytail): synchronize rules with official Ponytail v4.10.0**
  - Incorporates the complete 7-rung ladder including codebase pattern reuse as Rung 2 to prevent common helper re-implementation.
  - Adds the root-cause bug fix directive (fixing shared callers once rather than patching symptoms) and mandates comprehensive code reading before picking a ladder rung.
- **feat(rtk): import official TOML output filters (`df`, `du`, `jq`, `ollama`, `gcc`)**
  - Synchronized from upstream `rtk-ai/rtk` to compact CLI outputs and reduce input token consumption across more development tools.





#### Claude Code Auto-Compaction & 1M Context
- **feat(claude-code): drive auto-compact window via `CLAUDE_CODE_AUTO_COMPACT_WINDOW` and add 1M-context toggle**
  - Replaces obsolete `CLAUDE_CODE_MAX_CONTEXT_TOKENS` with `CLAUDE_CODE_AUTO_COMPACT_WINDOW` so Claude Code triggers compaction at the intended threshold instead of ignoring the setting for recognized models.
  - Adds a "1M context" toggle that attaches `[1m]` marker to default models, preventing Claude Code from assuming a 200K window cap during long conversations.



## [0.7.1] - 2026-09-18

### Added / Fixed

#### Antigravity 403 PERMISSION_DENIED Root-Cause Fix
- **fix(antigravity): stop sending `x-goog-user-project` on chat requests**
  - Every Antigravity account was failing with `403 Caller does not have required permission to use project aicode-consumers`, while token refresh, `loadCodeAssist` (200, free-tier), and `onboardUser` (done) all succeeded — the same signature as upstream reports `decolua/9router#1059`, `#2461`, `#2932`.
  - Live A/B against `daily-cloudcode-pa` proved the header is the trigger: the identical envelope 403s with `x-goog-user-project: aicode-consumers` and passes the project gate without it (then resolves by model name). Google treats the header as "bill/attribute to this project" and enforces `serviceusage.services.use`, which the shared free-tier project denies to third-party OAuth callers. The project still travels in the body envelope's `project` field.
  - Verified end-to-end on a live AI Pro connection: `gemini-3.8-flash-high` returns HTTP 200 without the header. Same approach as `opencode-antigravity-auth`, which strips this header to prevent 403 auth/license conflicts.
  - Note: the `(tier)` suffix in registry `upstreamModelId` values (e.g. `gemini-3.8-flash-high(high)`) never reaches the wire — `chatCore.js` strips it via `stripThinkingSuffix` and conveys the tier as `thinkingLevel`, matching the exact model IDs returned by live `fetchAvailableModels`. No registry change needed.

## [0.7.0] - 2026-09-17

### Added / Fixed

#### Dependency Security Patches
- **chore(deps): patch 4 advisories reported against the dependency tree (0 remaining)**
  - `next` `^16.1.6` → `^16.3.5` (with `@next/third-parties` and `eslint-config-next` pinned to the same line), clearing both critical Next.js advisories (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4).
  - Transitive high-severity fixes applied through `overrides`: `sharp` `^0.35.4` and `js-yaml` `^4.3.2` (staying on the 4.x line so no consumer breaks on the 5.x API change).
  - Verified: `npm audit` reports 0 vulnerabilities at every severity; `gitbook/` and `tests/` workspaces already audit clean.
- **chore(ci): refresh pinned GitHub Actions to current majors**
  - `actions/checkout@v7`, `actions/setup-node@v7`, `softprops/action-gh-release@v3`, `docker/setup-buildx-action@v4`, `docker/login-action@v4`, `docker/metadata-action@v6`, `docker/build-push-action@v7`, `peter-evans/dockerhub-description@v5`.
  - The release job now publishes the curated `RELEASE_NOTES_v0.7.0.md` as the release body instead of auto-generating notes from commit subjects.

#### Gemini & Antigravity Resilience
- **fix(translator): harden Gemini thought signatures against truncation and stop cascading account locks on 400**
  - Added `isValidBase64` validation for thought signatures before forwarding to Google Cloud Code / Antigravity.
  - Implemented in-memory signature recovery cache (`signatureCache`) to handle client-side `tool_call_id` truncation (e.g. 60/64 character limits in SDKs/agents).
  - Safe fallback to `DEFAULT_THINKING_AG_SIGNATURE` on truncated or invalid signatures, preventing Google API 400 Base64 decoding errors.
  - Prevented unhandled client payload errors (400, 422) from triggering account fallback and locking out healthy accounts across the pool.
- **fix(gemini): expand shorthand string subschemas and isolate schema maps in tool declarations (#3999)**
  - Expanded shorthand string subschemas (e.g. `{ value: 'object' }`) into proper Schema objects with required placeholders.
  - Protected schema maps (`properties`, `patternProperties`, `$defs`, `definitions`) from recursive mutation when tools declare properties named `properties` or `items`.
- **fix(translator): preserve all system messages in OpenAI -> Gemini request translation (#3972)**
  - Collected multiple system messages as parts under `systemInstruction` instead of silently overwriting with the last one.
- **fix(antigravity): ensure maxOutputTokens > thinkingBudget and inject thinkingConfig (#3979)**
  - Ensured `maxOutputTokens` strictly exceeds `thinkingBudget` and injected `thinkingConfig` into `generationConfig` to prevent Google Cloud Code 400 `INVALID_ARGUMENT`.
- **fix(antigravity): omit requestType=agent, strip telemetry, and normalize harness tags (#3986, #3987)**
  - Omitted `requestType: 'agent'` to prevent Google Cloud Code from triggering separate agent quota bucket and false 429 RESOURCE_EXHAUSTED.
  - Normalized competing harness tags (`<system-conventions>`, `<critical>`, Oh My Pi) in system instructions.
  - Stripped `used_claude` telemetry flags before forwarding upstream.
  - Injected `x-goog-user-project` in headers when projectId is present.
- **fix(translator): support IMAGE and DOCUMENT blocks for Antigravity Claude envelope (#3968)**
  - Converted `CLAUDE_BLOCK.DOCUMENT` to `OPENAI_BLOCK.FILE` in `claudeToOpenAIRequest`.
  - Forwarded `CLAUDE_BLOCK.IMAGE` and `DOCUMENT` as `inlineData` in `wrapInCloudCodeEnvelopeForClaude` to unblock vision and PDF reading on Antigravity Claude models.

#### Proxy & Security Hardening
- **fix(proxy): forward strictProxy flag to prevent direct bypass on chat routes (#4007)**
  - Propagated `strictProxy` through `auth.js`, `chatCore.js`, `chat.js`, `tokenRefresh.js`, and `quotaAutoPing.js` so proxy pools configured with `strictProxy: true` fail closed instead of leaking the operator's real IP to upstreams.
- **fix(providers): surface underlying DNS, timeout, and OAuth error details during test connection (#4015)**
  - Surfaced descriptive error message and OAuth error detail on connection test failure instead of masking with static generic labels.
- **fix(mitm): guarantee hosts cleanup on shutdown/crash and guard tool DNS restore (#4014)**
  - Cleaned all MITM tool hosts from system hosts file on CLI shutdown, process exit, and PID file cleanup.
  - Added hosts file cleanup on uncaughtException, exit, and EADDRINUSE in `mitm/server.js`.
  - Guarded `restoreToolDNS` to verify MITM server is running before attempting restoration, preventing `127.0.0.1:443` connection refused errors in official IDE extensions.

#### Video & Multi-Model Account Isolation
- **fix(video): scope video polling failure lock to __video__ and ignore 404 (#4009)**
  - Scoped `handleVideoGet` failure locks to `__video__` instead of `null` (preventing account-wide `modelLock___all` that takes down chat models like Grok).
  - Ignored 404 client errors on dead or expired video request IDs.

#### Token Refresh & OAuth Lifecycle
- **fix(oauth): parse numeric epoch expiresAt so imported connections still refresh (#4000)**
  - Accepted numeric epoch strings in `parseTimeMs` and normalized them in `normalizeExpiresAt`, preventing imported connections from silently skipping proactive and background token refresh sweeps.

#### Stream Handling & Usage Analytics
- **fix(stream): stop blocking Ollama upstream's NDJSON as a non-SSE body (#3985)**
  - Allowed `application/x-ndjson` for Ollama-format upstreams in `handleStreamingResponse` while continuing to block HTML/text error pages.
- **fix(stream): recognize delta.reasoning in SSE-to-JSON aggregation to prevent non-streaming 500 (#3796)**
  - Accumulated `delta.reasoning` alongside `delta.reasoning_content` in `parseSSEToOpenAIResponse` and `nonStreamingHandler.js`, preventing reasoning-heavy models (e.g. GLM, DeepSeek) from triggering false 500 empty response errors in non-streaming mode.
- **fix(claude): surface prompt-cache reads to chat/completions clients and stop double-counting in usage logs (#3984)**
  - Recorded `state.usage` in canonical OpenAI format (`prompt_tokens` + `cached_tokens` + `prompt_tokens_details`).
  - Fixed `canonicalizeUsage` double-counting cached tokens in usage logs.
- **fix(commandcode): record prompt-cache reads and reasoning tokens in usage extractor (#4025)**
  - Passed `cachedTokens` and `reasoningTokens` through as details in CommandCode `USAGE_EXTRACTORS` without double-counting `inputTokens`.
  - Enables prompt-cache pricing rates for CommandCode models instead of billing cache reads at full input cost.

#### Tool Schema Compatibility
- **fix(codex): strip Unicode-property tool schema patterns Codex rejects (#3922)**
  - Added copy-on-write `stripCodexUnsupportedPatterns` to strip `\p{...}` patterns that Codex's regex validator rejects with 400.
- **fix(kiro): never send top-level systemPrompt to prevent 400 REQUEST_BODY_INVALID (#3641)**
  - Appended repair instructions and RTK system prompts to user turn content instead of writing top-level `systemPrompt`.

#### Model Capabilities & Custom Models
- **fix(deepseek): register canonical deepseek-flash id, vision capabilities, and scope capacity adapter pools (#3994, #3995)**
  - Added `deepseek-flash` and updated `deepseek-v4-flash` in `MODEL_CAPABILITIES` with 1M context, 384k output, vision + reasoning.
  - Registered `deepseek-flash` in `deepseek.js` registry and pointed legacy IDs to upstreamModelId `deepseek-flash`.
  - Scoped `getCapacityAdapterModels` by `requiredCapabilities` to prevent unrelated pools (e.g. empty audio pool) from injecting models into vision requests.
- **fix(capabilities): honour operator-declared caps on custom models (#3974)**
  - Layered operator-declared capabilities (`caps`) over inferred capabilities in `/v1/models` and `chatCore.js` modality stripping.
  - Prevents hand-declared vision-capable custom models from having images stripped before upstream dispatch.

#### Dashboard & UI Integrity
- **fix(oauth): automatically use the public dashboard domain for compatible provider callbacks (#4054)**
  - Authorization-code providers that accept web callbacks (`claude`, `cline`, `clinepass`, `gitlab`, `iflow`, `kimchi`) now return to `${window.location.origin}/callback` when the dashboard is opened through an HTTPS tunnel, reverse proxy, custom domain, or subdomain. The popup then completes through same-origin `postMessage`/BroadcastChannel without manual URL rewriting.
  - Installed-app providers keep their required loopback callbacks (`antigravity`/`gemini-cli` and similar); Codex and xAI keep their fixed ports. These providers retain the manual-paste/proxy fallback because replacing a registered loopback callback with an arbitrary domain would cause upstream `redirect_uri_mismatch`.
  - Added a server-side same-origin/loopback redirect guard for both authorize and exchange endpoints. Hardened callback `postMessage` validation with strict URL/hostname checks plus popup source validation (no substring trust such as `localhost.attacker.example`).
  - Test: `tests/unit/oauth-public-callback.test.js` (12/12: public domains/subdomains/ports, fixed loopback providers, installed-app fallback, strict message origins, server redirect validation).
- **fix(auth): hide the default-password hint once a custom password is set**
  - `/api/auth/status` now reports `usesDefaultPassword` (no stored hash AND no real `INITIAL_PASSWORD` env — shared helper in `dashboardSession.js`). The login page renders the `12345678` hint only when that flag is true, so rotated passwords no longer advertise the default; fetch failures default to hidden (fail-closed).
  - Test: `tests/unit/auth-status.test.js` extended (route flag matrix + real-helper env matrix).
- **fix(dashboard): reset credential modals on close so reopened forms start clean (#4026)**
  - Reset form states and validation results on close in `AddApiKeyModal`, `AddCompatibleModal`, `ConnectionsCard`, `CursorAuthModal`, and `KiroAuthModal`.
  - Fixed Kiro CLI proxy modal not closing on import completion (`import-cli-proxy`).

#### Auth, Providers & Usage Fixes
- **fix(security): honor REQUIRE_API_KEY env on all /v1 enforcement points (#2834)**
  - The variable was documented in README/`.env.example` as enforcing Bearer keys on `/v1/*` for internet-exposed deploys, but no runtime code read it — operators got neither enforcement nor warning on services holding provider OAuth tokens.
  - New `isApiKeyRequired(settings)` helper (`settingsRepo.js`, re-exported via DB barrel + `localDb` shim): dashboard setting OR env `=== "true"`. One-way by design — the env var can only turn enforcement ON, never off. Wired into all 9 enforcement points (chat, fetch, search, embeddings, tts, stt, video, image, v1beta models route) plus a clarifying `.env.example` comment.
  - Test: `tests/unit/require-api-key-env.test.js` (5/5: setting×env matrix, exact-`"true"` matching, barrel exports).
- **fix(observability): record in-stream upstream failures instead of success (#4104)**
  - An upstream can end an HTTP-200 stream with a failure inside the event body (Responses `response.failed` / `error` event). Completion logging never inspected the terminal event, so `requestDetails`/dashboard showed `success` with billed-looking usage for failed requests.
  - `stream.js` now tracks failed terminal events in passthrough and translated Responses streams and passes `{ failed, error }` through `onStreamComplete`; `buildOnStreamComplete` writes `status: "failed"` with the upstream message in `response.error` (abort path and clean-success path unchanged).
  - Test: `tests/unit/stream-failure-status.test.js` (5/5: passthrough failed/completed meta, translated Responses.failed, failed vs success record shape).
  - Audit notes (no action needed): tunnel/operational-endpoint auth is covered by `dashboardGuard` LOCAL_ONLY + dual-auth gates; default-password remote gate is enforced at login; request payloads are hard-redacted so the #2472-class log-bloat OOM cannot occur; pending-request counters self-clean with timeout reset.
- **fix(auth): set 24h maxAge on dashboard session cookie**
  - `setDashboardAuthCookie` now sets `maxAge` via `SESSION_MAX_AGE_SEC` (86400s), matching the JWT `exp` (`createDashboardAuthToken` already used 24h). Previously the cookie was session-scoped while the token expired, causing silent auth drops on browser restore.
- **fix(providers): clear stale locks after validation (#3830)**
  - `resetHealthStateOnActivation` in `connectionsRepo.js` clears `modelLock_*`, `backoffLevel`, `rateLimitedUntil`, and `errorCode` whenever a connection is marked `active` after successful validation or OAuth re-login, so recovered accounts stop being routed around forever.
- **fix(usage): parse Fable weekly limit from limits[] instead of fabricating a row (#3847)**
  - `getClaudeUsage` reads `weekly_scoped` entries in `data.limits[]` (`scope.model.display_name` + `percent`) for model-scoped windows like Fable. No limits entry means no row — never fabricates a 100% quota row.
- **fix(tools): scope Claude tool type defaulting to gateways that need it (#3905)**
  - `type: "custom"` default now runs only when the provider declares the `requireClaudeToolType` quirk (MiniMax, MiniMax-CN). DeepSeek's Anthropic-compatible endpoint rejects `custom` with 400, which previously surfaced as a persistent 503 on every Claude-format request routed there — now restored to the legacy typeless shape.
  - Test: `tests/translator/bugs-3905-deepseek-tool-type.test.js` (3/3 passed).
- **fix(claude): cap re-anchored cache_control at the 4-marker budget and keep single-object content turns**
  - `anchorClaudeCache` normalizes bare-object content, strips `cache_control` from `defer_loading` tools first, pins the 1h head anchors (last system block + last cacheable tool), then trims over-budget bodies to 4 markers. Previously a spent budget produced a 5th marker that 400s non-retryably and the failure path retried the same malformed body across the pool until every account locked.
  - `convertClaudeMessage` (claude-to-openai) normalizes single-block-object content before the role branch so bare-object system turns are no longer dropped.
  - `hasValidContent` keeps single-object content turns.
- **chore(baseline): sync providers snapshot to centralized Claude fingerprint 2.1.258**
  - `providers-baseline.json` still expected `claude-cli/2.1.257` while `open-sse/config/clientVersions.js` already shipped 2.1.258 — one-line sync, `verify-providers.mjs` green again (81 providers). Alias and OAuth baselines verified unchanged.

#### Client Fingerprint Refresh (all versions re-verified 2026-09-17 against first-party sources)
- **chore(versions): bump all client fingerprints to current stable**
  - `open-sse/config/clientVersions.js` (single source — registry UA, image `Version` header, connection-test headers, and billing header all derive from it; audit found no hardcoded versions left in `open-sse/`/`src/`/`cli/`):
  - Claude Code 2.1.258 → **2.1.274** (anthropics/claude-code GitHub release, published Sep 17; stays inside the allowed-range gate — outdated clients get hard 400s on new models).
  - Codex CLI 0.149.1 → **0.154.0** (npm `latest`).
  - Gemini CLI 0.56.0 → **0.60.0** (npm `latest`; core still pins `@google/genai@1.30.0` exact at v0.60.0, so the `apiClient` pair is unchanged).
  - Kiro IDE 1.0.337 → **1.0.437**, CLI 2.19.1 → **2.21.0** (kiro.dev/changelog, Sep 1).
  - Antigravity IDE 2.11.0 → **2.12.2** (antigravity.google/changelog, Sep 3; CLI line now 1.1.25).
  - VSCode 1.134.0 → **1.137.0**, copilot-chat 0.63.0 → **0.65.0** (pair verified from `extensions/copilot/package.json` at vscode tag `1.137.0`, released Sep 9).
  - Trae 3.5.87 → **3.5.91** (trae docs, Aug 19 hotfix range 3.5.89–3.5.91).
  - CodeBuddy 2.138.0 → **2.151.0** (npm `@tencent-ai/codebuddy-code` latest).
  - Grok Build 1.0.5 → **1.0.34** (`https://x.ai/cli/stable` channel pointer; pager/shell UA assumed to track the CLI release train — re-capture HAR if Grok 400s appear).
  - Kimchi 1.0.3 → **1.1.23** (getkimchi/kimchi GitHub latest, Sep 16; note upstream added a real model-deprecation protocol in 1.1.x — watch for server-side model retirements).
  - Zed 1.16.2 → **1.18.1** (stable channel, Sep 4).
  - Fingerprint policy: every spoofed version is a real, currently-supported public release (never fabricate future versions); one constant per client so registry, image, test, and billing headers cannot drift apart.
  - Tests/baselines: `claude-cloaking` + `claude-header-forwarding` expectations bumped; `golden-url-header` snapshots regenerated (version-strings only: claude/codebuddy/grok/kimchi); `providers-baseline.json` synced (codex/gemini/claude/antigravity/copilot/kiro/codebuddy/kimchi/grok UAs); alias + OAuth baselines green.

#### Antigravity Location-Gate Hardening
- **fix(antigravity): stable fallback project id per connection (stop random id per request)**
  - `transformRequest` fell back to `this.generateProjectId()` — a NEW random id on every request — whenever a connection had no stored `projectId`. Google evaluates quota/eligibility per project, so a rotating id looks abusive and breaks project-scoped checks.
  - Now via `resolveAntigravityProjectId`: a provisioned `projectId` always wins; the fallback is ONE stable id per connection identity (bounded in-memory cache, `MAX_STABLE_PROJECTS = 500`).
  - Test: `tests/unit/antigravity-project-stability.test.js` (7/7).
- **fix(error): actionable hint for Google "User location is not supported"**
  - This 400 `FAILED_PRECONDITION` is decided by Google from the server's egress IP region (the Antigravity free tier enforces its own regional allowlist) — retrying or reshaping the payload cannot help. `withLocationGateHint` (`open-sse/utils/error.js`, applied on both `parseUpstreamError` paths) appends remediation steps to the error message delivered to clients.
  - The hint avoids `ERROR_RULES` trigger phrases, so the fail-fast classification holds: no fallback, no cooldown, accounts stay safe. Test: `tests/unit/error-location-hint.test.js` (7/7, including classification guard).
- **docs: `docs/antigravity-location-error.md`** — root cause, evidence (official clients affected; Germany/Slovakia/Vietnam/Indonesia reporters; Gemini-only outage), isolation ladder (run the official CLI on the same machine), workarounds (per-connection proxy egress in SG/US, Claude models, disable TUN/IPv6), and what cannot be fixed client-side.

#### New-Model Fixes
- **fix(thinking): never emit `reasoning_effort:"none"` to upstreams that reject it (#4031, gpt-6-astra)**
  - Root cause: a provider-level thinking default (or an explicit client `"none"`) was written verbatim to the OpenAI wire, but the Astra upstream only accepts low/medium/high — so every tools request failed with 400.
  - `*gpt-6-astra*` now declares `thinkingCanDisable:false` (same pattern as Fable 5.1); the `openai` branch of `thinkingUnified.js` omits the field when `none` meets a model that cannot disable (upstream default applies) — same precedent as the `tokenrouter` branch. Models that can disable (e.g. gpt-5) still receive explicit `"none"`, unchanged.
  - Test: `tests/translator/bugs-4031-astra-reasoning-effort.test.js` (6/6: omit on none/suffix/injected, low-medium-high passthrough, canDisable guard).
  - Note: native `/v1/responses` proxying (#4031 §3) is a separate architectural feature and out of scope — with this fix the chat/completions path goes out clean, without any value the upstream rejects.
- **feat(cline): expose `cline-free/muse-spark-1.3-contributor` (#3946)**
  - The Cline Free catalog model was missing from the `cline` provider list, so it could not be selected or connection-tested — added to `registry/cline.js` with an exact caps entry (vision + reasoning, OpenAI format, 1M context / 131k output, same profile as the OpenCode Free variant).
  - Test: `tests/unit/cline-muse-spark-13.test.js` (3/3: registry listing, caps resolution, profile parity).
  - Note: the 401 "use latest version of Cline" half of the issue is an upstream entitlement gate that cannot be verified without live credentials — the ZenRouter UA is deliberately not spoofed as Cline (fabricated client versions risk account flags, against fingerprint policy).
- **fix(opencode): compliant Zen identity headers for free-tier models (#4101)**
  - The backend gates free-tier calls on client identity: bare `User-Agent: opencode` and non-canonical `x-opencode-session` values fail with 403 FreeTierError. `OPENCODE_UA` is now `opencode/1.18.31` (real release, above the 1.17.0 minimum); sessions are minted as `ses_` + 12 hex timestamp digits + 14 Base62 chars, with real client sessions passed through byte-identical and derived ids mapped once to a stable canonical value (no per-request churn against per-session quota accounting).
  - `x-opencode-request` is deterministic per turn (session + last user message hash, same `msg_` shape) instead of random per request.
  - Test: `tests/unit/opencode-zen-identity.test.js` (7/7: format, passthrough, per-identity stability, downstream preservation).
- **fix(antigravity): keep inlineData on image-model requests; forward all input images (#4112)**
  - The image branch rebuilt contents text-only, silently degrading edits to text-to-image; the image handler forwarded only `images[0]`. Now `inlineData`/`inline_data` parts are preserved (normalized to camelCase) and every entry of `images[]` is forwarded. `gemini-3.1-flash-image` advertises `edit` + `multiImage`.
  - Test: 2 new cases in `tests/translator/bugs-antigravity.test.js` (camelCase + snake_case).
- **fix(kiro): preserve underscores in tool names and restore originals on response (#4113)**
  - `uniqueName` no longer collapses `__` (so `mcp__server__tool` reaches Kiro intact); request translators attach a `_toolNameMap` reverse map when sanitizing/deduping, and response translators restore the client-original name (streaming via state, non-streaming via payload map, plus the existing decloak layer).
  - Test: `tests/translator/kiro-tool-name-roundtrip.test.js` (6/6).
- **fix(kiro): neutral placeholder for tool-result-only turns (#4108)**
  - Empty user turns carrying only tool results were filled with literal `"continue"`, which models answer as a new instruction and drop the in-progress task. Now `kiroEmptyUserContent()` emits `"Tool results provided."` when tool results are present (genuinely empty turns keep `"continue"`, which Kiro requires over empty content).
  - Test: `tests/unit/kiro-tool-result-placeholder.test.js` (5/5); golden `OpenAI → Kiro` snapshot refreshed (1-line placeholder diff).
- **fix(responses): repair missing `call_id` instead of exhausting every strict upstream (#4091)**
  - Responses `function_call_output` / `custom_tool_call_output` items without `call_id` previously serialized as `role:"tool"` without `tool_call_id`; strict providers rejected the entire request with 400 and a combo could fail every member. Both Responses converters now queue pending calls and pair missing outputs in order; calls missing their own id receive deterministic ids; true orphan outputs are dropped; chat-style orphan tool items are downgraded to user context.
  - `ensureToolCallIds` now also repairs an absent tool-message id by pairing the oldest unanswered assistant call (or minting a deterministic fallback).
  - Test: `tests/unit/openai-responses-missing-tool-call-id.test.js` (8/8: missing/both-missing ids, parallel order, true orphan, custom tools, duplicate converter, chat repair/downgrade).
- Verified: focused OAuth/model/translator tests 53/53 passed; full vitest suite 2509 passed / 0 failed, eslint clean on all touched files.

## [0.6.1] - 2026-09-07

### Added / Fixed

#### Security & Stability Hotfixes
- **fix(security): allow cdn.jsdelivr.net in CSP for Monaco Editor on translator page**
  - Added `https://cdn.jsdelivr.net` to `script-src`, `style-src`, `font-src`, and `connect-src` in `next.config.mjs` Content Security Policy, resolving Monaco Editor load blockage and unhandled runtime exceptions on `/dashboard/translator`.
- **fix(ui): defensive string handling in model & combo search filter**
  - Safely handle models and combos with undefined or missing `name` in `ModelSelectModal.js`, preventing `TypeError: can't access property "toLowerCase", t.name is undefined` and `localeCompare` crashes during search and sorting.

#### 9Router critical backports (#3782, #3784, #3764, #3786, #3833)
- **fix(security,translator,dashboard): backport 5 critical 9router fixes**
  - SSRF guard on `POST /api/cli-tools/cowork-mcp-tools` for remote callers (`assertPublicUrl`, local-host self-hosted MCP keeps working).
  - `injectReasoningContent` passes non-array `messages` through for upstream 400 instead of unhandled 500.
  - `ensureToolCallIds` / `generateToolCallId` skip null entries and coerce non-string tool names.
  - `claude-adaptive` maps `auto` effort to `high` instead of writing literal `auto` into `output_config` (400 + account backoff).
  - Concurrent per-model Test buttons via `testingModelIds` Set on `ModelsCard` + `CompatibleModelsSection`.
  - Tests: `tests/unit/cowork-mcp-ssrf-guard.test.js`, `tests/unit/translator-toolcall-null-guards.test.js`, expanded `thinking-unified` + `reasoningContentInjector` suites. Full suite 2352 passed, build clean.

#### GPT-6 Astra official mapping
- **feat(models): add GPT-6 Astra official mapping**
  - `*gpt-6-astra*` / `*gpt-6*` capability pattern: 1050000 ctx, 128000 out, vision+reasoning+search, openai thinking format.
  - Pricing exact + patterns at official 10/50 rates (cached 1, cache_creation 12.5).
  - Test: official limits asserted across codex/openai/luo aliases in `tests/unit/capabilities.test.js`.

#### ESLint zero-errors across the repo
- **fix(lint): zero eslint errors/warnings in shared components, dashboards, and data modules**
  - Async dashboard loaders converted to cancelled-IIFE effects with unmount guards (fixes `set-state-in-effect` cascading-render risk in ~40 components).
  - React-compiler violations fixed: used-before-declared loaders moved up, impure calls memoized, ref reads moved out of render.
  - `<img>` migrated to `next/image`, entities escaped, `exhaustive-deps` completed.
  - `import/no-anonymous-default-export` scoped off for `open-sse/**` + `src/lib/**` (single-descriptor modules by design); cli build output ignored; 3 stale disables removed.
  - Verified: `npx eslint` 0 errors, 2352 tests passed, `npm run build` clean.

#### Database fail-closed on corruption (#3817)
- **fix(db): fail closed before migrating corrupted databases**
  - `PRAGMA quick_check` integrity gate in `runMigrationOnce`; `DatabaseCorruptionError` stops boot before schema mutation or backup pruning, driver chain never falls through.
  - Recovery stays manual with backup candidates under `${DATA_DIR}/db/backups`.
  - Tests: `tests/unit/db-integrity-safety.test.js` 2/2 passed. Docs: integrity gate in `docs/ARCHITECTURE.md`.

#### Combo visibility + cache budget lock
- **fix(dashboard): show combos on every media kind page, lock cache budget**
  - `COMBO_KINDS` enabled for embedding/image/imageToText/tts/stt/video/music so kind-tagged combos stop vanishing (fixes #3787).
  - Test: `anchorClaudeCache` re-anchor counted at max 3 markers, never exceeding the Anthropic 4-marker budget (#3795 verified already-safe).

## [0.6.0] - 2026-09-03

### Added / Fixed

#### Security / Dependabot Vulnerabilities Resolution (51 Vulnerabilities Resolved)
- **fix(security): resolve 51 Dependabot alerts by updating gitbook Next.js and overriding transitive dompurify and qs**
  - Updated `next` to `^16.3.2` in `gitbook/package.json`, resolving 31 vulnerabilities (including all 13 High severity CVEs in older Next.js 16.1.1).
  - Added npm overrides in root `package.json` for `dompurify` (`^3.4.14`) and `qs` (`^6.16.0`), eliminating 18 `dompurify` XSS/bypass vulnerabilities and 2 `qs` DoS/array-limit bypass vulnerabilities.
  - Achieved `0 vulnerabilities` on both root and `gitbook` `npm audit` reports.

#### Dashboard UI/UX, Theme Flash & Indonesian Localization (#925cb4aad, #831001c32, #c24a85427, #a58902e4a)
- **feat(ui): pool theme pre-hydration script, connections scroll container, CLI key presets, and complete Indonesian localization**
  - Added pre-hydration inline script in `<head>` of `src/app/layout.js` to inspect `localStorage.getItem("theme")` and immediately apply `.dark` to `documentElement` before the browser performs first paint, eliminating reload white flash.
  - Constrained provider connection list height with `max-h-[500px] overflow-y-auto pr-1` in `src/app/(dashboard)/dashboard/providers/[id]/page.js` and `ConnectionsCard.js`, preventing unbounded vertical growth when managing dozens of provider accounts.
  - Extended CLI tool endpoint presets store in `cliEndpointPresets.js` to support saving, deleting, and naming custom API key presets across tools; updated `ApiKeySelect.js` to allow saving custom keys directly into named presets and restored keys from tool config.
  - Completed Indonesian localization (`public/i18n/literals/id.json`) to 1,450 translated literals while strictly sanitizing and enforcing ZenRouter branding (`ZenRouter`, `sk_zenrouter`, and clean CLI instructions).
  - Added unit test suite in `tests/unit/cli-endpoint-presets.test.js` covering endpoint and key preset stores.

#### Provider Catalog, Web Fetch & Missing Assets (#44e4b80bb, #e0ffc7e2a, #6efb97904)
- **feat(providers): pool Ollama Cloud web fetch, dead opencode model filter, and missing icons**
  - Added Ollama Cloud as a full `webFetch` provider in `open-sse/handlers/fetch/index.js` and `open-sse/providers/registry/ollama.js`, supporting markdown extraction, page titles, and discovered link harvesting via `https://ollama.com/api/web_fetch`.
  - Scoped web fetch provider failures using `webfetch:<providerId>` lock keys in `src/sse/handlers/fetch.js`, ensuring fetch quota or timeout errors never take account credentials offline for LLM chat requests.
  - Filtered unavailable `deepseek-v4-flash-free` from OpenCode suggested free models in `src/app/api/providers/suggested-models/filters.js` to avoid offering dead model choices to users.
  - Added pricing entry for `z-ai/glm-5.3-free` in `open-sse/providers/pricing.js`.
  - Added missing 128x128 provider icons in `public/providers/` for `alims-intl.png`, `alitp-intl.png`, `fish-audio.png`, and `selfhosted-*` services to eliminate 404 images on the dashboard.
  - Added unit test suites in `tests/unit/ollama-web-fetch-provider.test.js` and `tests/unit/suggested-models-filters.test.js`, and expanded tests in `tests/unit/fetch-success-clears-account.test.js`.

#### Claude & Routing Integrity / Foreign Server Tool Dropping, 1M Context Marker & Adaptive Thinking (#3685, #3690, #3692, #3718)
- **fix(routing): pool Claude foreign tool sanitizing, 1M context marker, and OpenAI-wire thinking (fixes #3685, #3690, #3692, #3718)**
  - Dropped foreign `server_tool_use` blocks with non-Anthropic IDs (e.g. `call_` from GLM/OpenAI) and their paired `tool_result` / `web_search_tool_result` blocks in `open-sse/translator/formats/claude.js`, preventing HTTP 400 session poisoning in multi-provider combos.
  - Stripped empty text blocks and pruned empty messages leftover after foreign tool filtering to adhere to Anthropic Messages API validation rules.
  - Updated `open-sse/translator/concerns/assistantPrefillPolicy.js` to recognize `server_tool_use` blocks so valid trailing server tool calls are not erroneously discarded as empty text prefills.
  - Added `open-sse/utils/modelMarkers.js` with `stripModelContextMarker` to strip the `[1m]` suffix Claude Code appends during 1M context beta before model routing in `src/sse/handlers/chat.js`.
  - Bumped `CLAUDE_CODE_VERSION` to `2.1.258` in `open-sse/config/clientVersions.js` to support the latest Claude Code capabilities and Fable 5.1 model fingerprinting.
  - Declared `claude-fable-5-1` in `open-sse/providers/capabilities.js` with `thinkingCanDisable: false` and adjusted `claude-adaptive` handling in `open-sse/translator/concerns/thinkingUnified.js` to pass `output_config.effort` directly without redundant `thinking` blocks.
  - Introduced `NATIVE_ONLY_FORMATS` in `open-sse/translator/concerns/thinkingUnified.js` to ensure models with native thinking formats (Gemini, Claude) always resolve to `openai` (`reasoning_effort`) when routed over OpenAI-compatible endpoints.
  - Added unit test suites in `tests/unit/claude-foreign-server-tool-use.test.js` and `tests/unit/model-context-marker.test.js`, and expanded tests in `tests/translator/thinking-unified.test.js`, `tests/unit/capabilities.test.js`, and `tests/unit/claude-cloaking.test.js`.

#### Gemini & Antigravity / Function Response Protobuf Struct Wrapping (#3318)
- **fix(translator): wrap JSON array tool responses into Struct object for Gemini (fixes #3318)**
  - Wrapped JSON array tool responses into `{ result: [...] }` in `open-sse/translator/request/openai-to-gemini.js` so `functionResponse.response` is always a `google.protobuf.Struct` object, eliminating `INVALID_ARGUMENT: Proto field is not repeating, cannot start list`.
  - Passed JSON object responses directly without redundant double-wrapping in `{ result: { ... } }`.
  - Preserved empty string tool responses as `{ result: "" }` instead of dropping them during boolean truthiness check.
  - Added unit test suite in `tests/unit/gemini-function-response-struct.test.js`.

#### Tool Calling & Function Limits / Tool Name Length Compression (#3622, PR #3637)
- **fix(translator): compress tool names > 64 chars to prevent Gemini/Vertex/OpenAI rejection (fixes #3622)**
  - Added `open-sse/utils/toolCompressor.js` with `compressToolNames`, compressing tool names longer than 64 characters to a 55-character prefix with an 8-character MD5 hash suffix to guarantee uniqueness without prefix collision.
  - Rewrote tool declarations, message history (`tool_use`, `tool_calls`, `tool` response), and `tool_choice` across Claude and OpenAI request payloads.
  - Added `decloakOpenAIChunk` to restore compressed tool names back to their original full client names on both streaming SSE deltas and non-streaming response completions.
  - Added unit test suite in `tests/unit/tool-name-compression-3622.test.js`.

#### Search & SSRF / SearXNG Docker Internal Routing (#3756)
- **fix(search): allow admin-configured internal SearXNG and Ollama search in Docker (fixes #3756)**
  - Differentiated admin-configured base URLs (`SEARXNG_URL` on Docker network `searxng:8080` or loopback) from untrusted client overrides in `open-sse/handlers/search/index.js`.
  - Bypassed private-IP blocking of `fetchPublic` only when no client-supplied `providerOptions.baseUrl` is present, allowing standard Docker sibling container deployments to function without 502 errors.
  - Retained strict `fetchPublic` SSRF validation on any client-provided baseUrl overrides.
  - Added unit test suite in `tests/unit/search-searxng-ssrf-3756.test.js`.

#### Models API / Single Model Lookup Route (#3588, upstream 5caa72f5f)
- **fix(models): replace single-segment route with catch-all for single model lookup (fixes #3588)**
  - Replaced `src/app/api/v1/models/[kind]` with catch-all `src/app/api/v1/models/[...model]/route.js` to correctly match provider-prefixed IDs containing slashes (e.g. `cc/claude-sonnet-5`, `openai/gpt-4o`).
  - Preserved capability filtering routes (`/v1/models/image`, `/v1/models/web`, etc.) while returning OpenAI-compatible model objects or `404 model_not_found` for individual model queries.
  - Added unit test suite in `tests/unit/v1-model-lookup-3588.test.js`.

#### Server Stability & CLI Crash Recovery (#3755, #3743)
- **fix(cli,server): safely disable MITM in SQLite and JSON on repeated crash (fixes #3755)**
  - Added `disableMitmInDatabase` in `cli/cli.js` supporting both SQLite `data.sqlite` (`node:sqlite` / `better-sqlite3`) and legacy `db.json`, preventing infinite restart crash loops when upgrading from 0.5.55.
  - Set `ZENROUTER_DISABLE_MITM=1` and honored it in `src/shared/services/initializeApp.js` during emergency recovery.
  - Always surfaced `crashLog` to console on maximum restarts to provide immediate diagnostic visibility.
  - Added unit test suite in `tests/unit/cli-restart-mitm-3755.test.js`.
- **fix(gemini): convert `prefixItems` and ensure array items in schema sanitizer (fixes #3743)**
  - Added `convertPrefixItems` to map tuple parameter definitions to `items` before keyword removal in `open-sse/translator/formats/gemini.js`.
  - Added `ensureArrayItems` to guarantee every `type: "array"` schema defines an `items` field, preventing Gemini API rejection (`400 INVALID_ARGUMENT: Cannot find field items`).
  - Added regression test cases in `tests/unit/gemini-mcp-schema-cleaner-2884.test.js`.

#### Dashboard & Models / Custom Capabilities on Custom OAI & Compatible Nodes (#3752, upstream 38f031f4c)
- **feat(models): capability toggles, tune button, and upsert for custom and compatible models (fixes #3752)**
  - Added capability toggles (Vision, Reasoning) to `AddCustomModelModal` with whitelist sanitization in `POST /api/models/custom`.
  - Added retroactive capability configuration (`tune` icon button) to `CompatibleModelRow` and `ModelRow`, allowing capabilities on custom OpenAI-compatible, Anthropic-compatible, and default provider models to be customized in-place without deleting and re-adding.
  - Updated `addCustomModel` in `src/lib/db/repos/aliasRepo.js` to perform atomic upsert, merging capability updates with existing metadata.
  - Included custom models with their explicit capability overrides in `GET /api/models`.
  - Added live cache invalidation via `customModelChanged` event in `src/shared/hooks/useModelCaps.js`.
  - Added unit test suite in `tests/unit/custom-model-capabilities-3752.test.js`.

#### Networking & Billing / Bun Client Disconnect Abort (#3559)
- **fix(stream,server): bridge client TCP socket close into ServerResponse on Bun & Node (fixes #3559)**
  - Bridged incoming socket `close` and `aborted` events in `custom-server.js` directly to `res.emit('close')` and `res.destroy()` when the response is unfinished (`!res.writableFinished && !res.writableEnded`).
  - Enables Bun compatibility where `ServerResponse` never natively emits `close`, resolving the defect where client hangup failed to propagate to Next's `request.signal`.
  - Upstream requests are immediately aborted and partial usage recorded, stopping token waste and continuous billing when clients disconnect mid-stream.
  - Added regression test suite in `tests/unit/custom-server-socket.test.js`.

#### Performance pool — L1 caches, zero-mutation stream, models TTL (upstream PR #3629)
- **perf(stream): accumulate content/thinking in chunk arrays** in `open-sse/utils/stream.js` (`contentChunks`/`thinkingChunks` + single `join("")`), cutting per-chunk string GC pressure; split-packet handling kept index-based.
- **perf(db): L1 caches for API keys and connections** in `src/lib/db/repos/apiKeysRepo.js` (`apiKeyCache` + negative cache) and `connectionsRepo.js` (`connectionCache` per filter) with `invalidate*Cache()` on every mutation. Settings keeps Zen's 2s TTL raw cache (better than upstream's unbounded merged cache); usage keeps Zen's object-identity dedup (no field-equality scan, so no `idx_uh_dedup`/schema bump needed).
- **perf(models): 30s TTL + `Cache-Control: public, max-age=30, stale-while-revalidate=60`** in `src/app/api/v1/models/route.js` for agent `/v1/models` polling storms.
- **test:** new `tests/unit/performance-optimizations.test.js` (14 tests, hardened Zen port of upstream's 11 — TTL semantics, negative cache, per-filter isolation, 50-chunk join, object-identity dedup).
- **docs:** `docs/ARCHITECTURE.md` SQLite paths corrected (`data.sqlite`, `usageHistory`/`usageDaily`); `open-sse/AGENTS.md` perf conventions documented.

## [0.5.63] - 2026-09-03

### Fixed

#### OpenAI Models / Max Completion Tokens & Streaming Reasoning (PR #3657, PR #3601)
- **fix(translator): emit `max_completion_tokens` for gpt-5/o-series in *-to-openai request builders (PR #3657)**
  - Hoisted `requiresMaxCompletionTokens` check (`/gpt-5|o[134]-/i`) in `open-sse/translator/formats/maxTokens.js`.
  - Updated `claudeToOpenAIRequest`, `geminiToOpenAIRequest`, and `antigravityToOpenAIRequest` to emit `max_completion_tokens` instead of `max_tokens`, preventing HTTP 400 rejection from OpenAI Chat Completions.
- **fix(stream): keep `delta.reasoning` in streaming passthrough & accumulate thinking (PR #3601)**
  - Extended `hasValuableContent` in `open-sse/utils/streamHelpers.js` to recognize `delta.reasoning`.
  - Accumulated `delta.reasoning` in `totalContentLength` and `accumulatedThinking` in `open-sse/utils/stream.js` so reasoning tokens from providers like Ollama/DeepSeek are neither dropped nor under-counted.

#### Model Patterns & CommandCode / GLM-5.3-Flash & DeepSeek-V4-Vision (PR #3618, Issue #3753)
- **feat(capabilities): update GLM 5.3 context window and add multimodal vision patterns (PR #3618, Issue #3753)**
  - Updated `*glm-5.3*` context window to 1M with 131k output limit, and added multimodal `*glm-5.3-flash*` (vision, video, pdf, thinking) to `open-sse/providers/capabilities.js`.
  - Added `*deepseek-v4*vision*` pattern to declare vision capability for `deepseek-v4-flash-vision-exp`.
  - Added `z-ai/glm-5.3-flash` and `deepseek/deepseek-v4-flash-vision-exp` to `open-sse/providers/registry/commandcode.js`.

#### Tool Calling & Combo Autoswitch / OpenRouter Schema Sanitizer & Tools Detection (PR #3665)
- **fix(tools): normalize OpenRouter function tool schemas and detect tools in combo auto-switch (PR #3665)**
  - Added `open-sse/utils/toolSchemaCompatibility.js` to strip invalid regex `pattern` constraints from tool parameter schemas before OpenRouter dispatch.
  - Added function tool detection in `open-sse/services/combo.js:detectRequiredCapabilities` so combos float tool-capable models first when requests declare function tools.

#### Gemini & Antigravity / MCP Schema Cleaner (#2884, #3743)
- **fix(translator): preserve parameters named `properties` / `title` and strip `prefixItems` for Gemini API**
  - Differentiated JSON schema definition nodes from property name maps (`schema.properties`) by threading `isSchema` context in `removeUnsupportedKeywords` and `ensureObjectType`.
  - Prevented invalid `type: "object"` injection into `schema.properties.type` when tools declare a parameter literally named `properties` (e.g. official Notion MCP tools), and preserved parameters named `title`, `default`, `format`.
  - Added JSON Schema 2020-12 `prefixItems` to `UNSUPPORTED_SCHEMA_CONSTRAINTS` to prevent Gemini rejection on tuple-formatted tools.

#### Kiro / Thinking Protocol (#3641, #3746, #3749)
- **fix(kiro): strip generic top-level thinking fields before dispatch**
  - Stripped `thinking`, `reasoning`, `reasoning_effort`, `thinkingConfig`, `enable_thinking`, `output_config`, and `think` in `KiroExecutor.transformRequest`.
  - Prevents AWS Bedrock / Kiro `400 REQUEST_BODY_INVALID` when non-Claude clients (Responses API or Gemini) send thinking or reasoning parameters to Kiro models.

#### OpenCode / Muse Spark 1.3 & Vision (#3738, #3739)
- **fix(opencode): route Muse Spark 1.3 to Responses API and declare vision capability**
  - Added `muse-spark-1.3-contributor-free` to `RESPONSES_MODELS` and `providerModels.js`, ensuring requests target `/zen/v1/responses` rather than `/chat/completions`.
  - Marked `muse-spark-1.2-contributor-free` and `muse-spark-1.3-contributor-free` with `vision: true` in `PROVIDER_CAPABILITIES` so inline images are not stripped.

#### Claude / Fable 5.1 & Client Spoofing (#3719)
- **feat(claude): support Claude Fable 5.1 and bump spoofed CLI version**
  - Updated `CLAUDE_CODE_VERSION` in `open-sse/config/clientVersions.js` to `2.1.257`.
  - Added `claude-fable-5-1` to `open-sse/providers/registry/claude.js` and `open-sse/providers/pricing.js`.
  - Configured `*claude*fable*` with `thinkingFormat: "claude-adaptive"`.

#### Networking & Proxy / SOCKS5 Warnings (#3744, PR #3745)
- **fix(proxy): suppress undici SOCKS5 ExperimentalWarning and downgrade ProxyFetch fallback logs**
  - Suppressed Node undici `ExperimentalWarning: SOCKS5 proxy support is experimental and subject to change` in `custom-server.js` and `bootstrap.js`.
  - Downgraded `[ProxyFetch] Proxy failed, falling back to direct` logs from `warn` to `debug` in `open-sse/utils/proxyFetch.js` to eliminate log journal spam when direct fallback succeeds.

#### Kiro / MITM Inline Image Forwarding (PR #3734)
- **fix(kiro): forward inline images as OpenAI `image_url` parts in MITM handler**
  - Extracted attached images from `userInputMessage.images` and converted them into OpenAI-compatible `image_url` data URIs with proper MIME mapping in `src/mitm/handlers/kiro.js`.
  - Supported image-only turns and historical turn image preservation.
  - Added `.kiro/` workspace ignore in `.gitignore`.

#### Docker & Standalone / Rate Limit Status (#3712)
- **fix(docker): bundle `node-machine-id` into standalone Docker image and return 503 for rate-limited providers**
  - Explicitly copied `node_modules/node-machine-id` into standalone image in `Dockerfile`, preventing dynamic require runtime failures.
  - Updated `src/sse/handlers/chat.js` to always return `503 Service Unavailable` instead of echoing stale 500 error codes from the database when all accounts are rate-limited.
  - Added `*.tgz` to `.gitignore`.

#### Context & Quota Optimization / Model Context & Remaining-First Selection (#3740, #3750)
- **feat(quota): remaining-first OAuth account selection for Claude and Codex (PR #3740)**
  - Created `src/sse/services/quotaAwareSelection.js` and wired remaining-first account selection into `src/sse/services/auth.js`.
  - Automatically sorts Claude and Codex OAuth accounts by remaining session quota (highest first) before fill-first / round-robin selection.
  - Skips accounts with exhausted blocking (e.g. weekly) quotas and returns `allRateLimited` when all accounts are blocked.
  - Added `quotaAwareSelection`, `quotaCacheTtlMs`, and `quotaAwareProviders` to settings repository and route whitelists.
- **fix(models): propagate context window and max tokens from live catalog and custom models (#3750)**
  - Updated `src/shared/utils/providerLiveModels.js` to preserve `context_length` / `max_completion_tokens` as `capabilities` from upstream `/models` responses.
  - Updated `src/app/api/v1/models/route.js` to propagate `context_length` and `max_completion_tokens` for live models, custom models, and custom combo limits, allowing downstream agents (e.g. CLI tools) to perform accurate compaction.

#### Dashboard UI/UX / Provider Status Filter & Compact Token Display (PR #3704, PR #3747)
- **feat(providers): add connection status filter to providers dashboard (PR #3704)**
  - Added `STATUS_FILTER_OPTIONS`, `getConnectionStatus`, and `matchesStatusFilter` in `src/app/(dashboard)/dashboard/providers/utils.js`.
  - Added client-side status filter dropdown (All / Active / Inactive / No connection) to `src/app/(dashboard)/dashboard/providers/page.js` across OAuth, Free, Free Tier, API Key, and Custom Compatible providers.
  - Always treats `noAuth` free providers as Active rather than "No connection".
- **feat(usage): compact notation for large token counts (>100k) and observability callouts (PR #3747)**
  - Created reusable formatting utilities in `src/shared/utils/format.js` with `fmtCompact` using en-US compact notation (`100K`, `1.5M`, `2B`) for token counts >= 100k.
  - Applied `fmtCompact` with full-count tooltip hover in `OverviewCards.js`, `RecentRequests` in `UsageStats.js`, and `UsageTable.js`.
  - Updated `/api/settings` GET endpoint with `enableRequestLogsDefined` and `observabilityEnabled`.
  - Fixed loading state `colSpan` (7 → 9) in `RequestDetailsTab.js` and surfaced environment vs database settings precedence.
  - Updated snapshot for Claude 2.1.257 User-Agent header in `golden-url-header.test.js`.

## [0.5.60] - 2026-08-30

### Fixed

#### Antigravity & Gemini-CLI / Proxy Support
- **fix(antigravity): pass connection proxy options to GCP project ID discovery and token refresh**
  - Resolved `400 FAILED_PRECONDITION: User location is not supported for the API use` when using proxies with Antigravity / Gemini-CLI models (e.g. `gemini-3.7-flash-high`).
  - `open-sse/services/projectId.js`, `open-sse/services/tokenRefresh/providers.js`, and `src/sse/services/tokenRefresh.js` now route `loadCodeAssist`, `onboardUser`, and Google OAuth token refresh requests through `proxyAwareFetch` with connection-level `proxyOptions`, preventing domestic IP leakage.
  - `src/sse/handlers/chat.js` and `open-sse/executors/gemini-cli.js` forward connection proxy settings dynamically.

#### Claude Code / Non-Streaming Contract (#3462)
- **fix(translator): enforce Anthropic `type: "message"` response shape on non-streaming `/v1/messages`**
  - `open-sse/handlers/chatCore/nonStreamingHandler.js`: When client source format is Claude (such as Claude Code's non-streaming permission classifier / prompt security requests), responses from OpenAI/Gemini/Ollama upstreams are translated into Anthropic message structures (`type: "message"`, `role: "assistant"`, `content: [...]`) rather than leaking `chat.completion` objects.

#### Kiro / AWS Tool Schema (#3641)
- **fix(kiro): recursively flatten `anyOf`, `oneOf`, `allOf`, and type arrays in tool schemas**
  - `open-sse/translator/concerns/kiroConversation.js`: Added recursive schema normalization that merges `allOf`, picks valid non-null schemas from `anyOf`/`oneOf`, collapses type arrays (`["string", "null"]` → `"string"`), and strips unsupported JSON schema keywords (`$schema`, `title`, `additionalProperties`) to eliminate `400 REQUEST_BODY_INVALID` errors.

#### CommandCode / Error Interception (#3636)
- **fix(commandcode): add retryable error definitions for stream error interception**
  - `open-sse/config/errorConfig.js`: Added `[commandcode error` matching rules to prevent transient stream errors from breaking the retry loop.

#### CLI / Autostart (#3628)
- **fix(cli): respect autostart disable — `hide` no longer force-enables autostart**
  - `cli/cli.js:781` previously called `enableAutoStart()` unconditionally on Hide-to-Tray, recreating `zenrouter.vbs` / `com.zenrouter.autostart.plist` after user deleted it or disabled via tray menu. Now autostart is opt-in via tray menu only (`cli/src/cli/tray/tray.js:98` toggle). Verified that no other launch path recreates the file.

#### Stability / Fallback (#3602)
- **fix(fallback): handle AiHubMix abuse-prevention error as quota exhaustion**
  - `open-sse/config/errorConfig.js:73` added text rules `prevent abuse` and `can only try` → `COOLDOWN.extended` (15m) so `Sorry, to prevent abuse of free resources...` triggers account rotation instead of 30s transient. Verified via `checkFallbackError(403, abuseText)` returns `cooldownMs: 900000`.

#### UI/UX (#3427, #3249)
- **fix(ui): clarify observability disabled state in Usage Details**
  - `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js` now fetches `enableObservability` and shows actionable empty-state with link to `Profile → Observability` and `OBSERVABILITY_ENABLED=true` hint when disabled, instead of silent “No request details found”.
  - Fixed `colSpan` 7→9 to match header count.
  - `src/app/(dashboard)/dashboard/profile/page.js:1618` improved toggle description to explain that Details tab stays empty when disabled.
  - `src/lib/db/repos/requestDetailsRepo.js:181` already has correct `LIMIT/OFFSET` pagination; `src/lib/db/repos/usageRepo.js` ring caps (`RING_CAP=50`) are intentional in-memory window, not the old `LIMIT 100` bug.

#### Security (#3630)
- **fix(security): harden SSRF guard against alt IP encodings & DNS rebinding**
  - `src/shared/utils/ssrfGuard.js`
    - Blocks decimal `2130706433`, hex `0x7f000001`, octal `0177.0.0.1`, mixed `0x7f.0.0.1` via `parseAlternativeIpv4()` / `isBlockedAlternativeIpv4()`
    - Extends IPv6 to cover site-local `fec0::/10`, hex-mapped `::ffff:7f00:1` (in addition to existing `fe80::`, `fc00::/7`, `ff00::/8`)
    - Blocks DNS rebinding hosts `*.nip.io`, `*.sslip.io`, `*.xip.io`, `localtest.me`
  - Verified `assertPublicUrl()` now blocks all 9 test vectors and still allows `http://google.com/`.
  - Existing `assertPublicUrlAsync()` DNS-lookup rebinding protection already present and preserved.

#### Performance (#3629)
- **perf: per-provider mutex, socket leak fix, stream & settings cache**
  - `src/sse/services/auth.js:10` replaced global `selectionMutex` with `providerMutexes: Map<providerId, Promise>` so concurrent Claude + Codex + OpenAI requests no longer serialize.
  - `open-sse/utils/proxyFetch.js:285` destroys evicted `ProxyAgent` on LRU eviction (`oldest.destroy()/close()`) and sets `keepAliveTimeout: 30s` to prevent FD leak.
  - `open-sse/utils/stream.js:133` uses `indexOf("\n")` loop instead of `split("\n")` to avoid intermediate array allocs.
  - `src/lib/db/repos/settingsRepo.js:67` adds 2s L1 cache for `readRaw()` with invalidation on `updateSettings()` to cut 2-3 DB reads per `/v1` request.

#### Kimi K3 / NVIDIA (#kimi-k3)
- **fix(kimi): auto-clamp thinking_effort for NVIDIA Kimi K3**
  - `open-sse/providers/thinkingLevels.js:38` add provider-specific `nvidia/*kimi*k3* → [low,high,max]` (no `medium`), previously `[low,medium,high,max]` caused `400 Unsupported Kimi K3 thinking_effort="medium"`.
  - `open-sse/translator/concerns/thinkingUnified.js:309` kimi case now respects `supportedLevels` and clamps `medium→high`, `minimal→low`, `xhigh→max`; verified `nvidia/kimi-k3 medium→high`, `low→low`, `tokenrouter/kimi-k3 medium→medium`.
  - Live logs at `zen.hlcyn.xyz` showed loop over 19 keys ×20s due to same 400; now first account succeeds via auto-clamp, no fallback loop.

### Verified
- `checkFallbackError` returns 15m for AiHubMix strings ✅
- `assertPublicUrl` blocks 10 SSRF vectors, allows public host ✅
- `node --check` passes for all 4 changed modules ✅
- `vitest run unit/circuit-breaker-balance`, `antigravity-quota-routing`, `commandcode-error-detect`, `aborted-stream-usage-3488` all green ✅
- `eslint` clean on changed files ✅

## [0.5.59] - 2026-08-30 (upstream + fork)
- See `git log upstream/master..HEAD` for 163 commits ahead of `decolua/9router v0.5.55 (699edac3)`. Notable prior fixes in this fork:
  - `714756c1` Gemini MCP tool collision dedup (#3622)
  - `509b7632` Combo payload clone + peek timeout (#3619)
  - `f832e902` Bun disconnect + TTFT watchdog (#3559)
  - `50093fcc` Aborted stream usage + omitted stream JSON (#3488, #3492)
  - `c7adcaec` Empty stream failover + CommandCode 503 (#3463, #3468)
  - `b36deb46` CSP hardening (#3630 partial)
