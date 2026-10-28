# open-sse

Part of **Kitsune Router**, maintained by **ByKitsune**. Project identity is
defined in `branding/identity.mjs`; preserve upstream protocol identities,
historical evidence paths, and migration-only cryptographic inputs.

Provider-agnostic SSE engine: a supported client request → provider execution (LLM chat, image, embedding, tts, stt, search), returned in the client's format. Some modules depend on the app's persistence/logging aliases; this is not an independently installable package.

## Request lifecycle (chat)

The app first resolves aliases/combos and selects an account in `src/sse/`. `handlers/chatCore.js` → `executors/index.js` `getExecutor(provider)` → native preparation or `translator/index.js` `translateRequest` (client format → provider format) → **final-provider-body hooks** (`rtk/` tool_result compress, `rtk/headroom.js` proxy compress, `rtk/caveman.js` system inject — all fail-open) → `executor.execute()` (streams upstream) → native response handling or `translateResponse` (provider chunks → client format) → SSE/JSON out. `services/model.js` supplies shared model parsing; it is not a second app-level account-selection loop.

## Directory map

- `config/` — ALL constants/config (no hardcode elsewhere). `providers.js` (provider exports), `providerModels.js` (derived alias→models view), `runtimeConfig.js` (timeouts, token limits), `*Constants.js`. Provider definitions and registry model rows live under `providers/registry/`; special TTS model/voice tables also come from `config/ttsModels.js`.
- `translator/` — format conversion. `request/<from>-to-<to>.js`, `response/<from>-to-<to>.js`, `schema/` (enums: ROLE, CLAUDE_BLOCK…), `concerns/` (shared logic), `formats.js`+`formats/` (per-format). `index.js` is the registry/entry.
- `executors/` — per-provider upstream call. `base.js` (BaseExecutor), one file per special provider, `index.js` map.
- `providers/` — registry build + `capabilities.js` + `pricing.js`. Entry: `index.js` (PROVIDERS).
- `handlers/` — per-modality cores (chat/image/embedding/tts/stt/search) + sub-provider folders. `chatCore/` has the streaming/non-streaming/sse-to-json handlers.
- `rtk/` — request token-killer. `index.js` compresses `tool_result` content in-place (OpenAI/Claude/Kiro shapes); `filters/` per-tool compressors + `autodetect.js`; `headroom.js` external compress proxy; `caveman.js` system-prompt injector.
- `transformer/` — `responsesTransformer.js` (Chat Completions SSE → Codex Responses API SSE), `streamToJsonConverter.js`.
- `shared/` — cross-provider auth/identity: `clineAuth.js`, `machineId.js`, `qoder/`.
- `services/` — `model.js`, `provider.js`, `accountFallback.js`, `combo.js`, `compact.js`, `tokenRefresh/`+`tokenRefresh.js`, `oauthCredentialManager.js`, `usage/`, `projectId.js`, `kiroModels.js`/`qoderModels.js`.
- `utils/` — streamHandler, stream, sse, error, sessionManager, claudeCloaking, clientDetector, proxyFetch (patches global fetch), cursorProtobuf/cursorChecksum, ollamaTransform.

## Conventions

- Config-driven, DRY, camelCase. NEVER hardcode values, models, or block/role strings — use `config/` + `schema/` constants.
- Translator pipeline pivots through OpenAI as the intermediate format. A translator registered on the exact `source:target` pair (e.g. `claude:kiro`) runs as a **direct route**, skipping the lossy double-hop.
- Translators self-register via `register(from, to, reqFn, resFn)` as an import side-effect — new files MUST be imported in `translator/index.js`.
- Perf: accumulate streamed text in chunk arrays + `join("")` once (never `+=` per chunk); per-provider mutexes (never a global lock); bounded per-adapter L1 caches use persisted scope revisions and transactional invalidation across native SQLite workers. Settings retains a 2s TTL for out-of-band raw SQL. `/v1/models` retains its 30s TTL and public cache policy. Usage acceptance freezes tokens, timestamp and pricing into a durable outbox; explicit per-attempt event IDs deduplicate projection transactionally. `saveRequestUsage` preserves await-then-query visibility; `enqueueRequestUsage` acknowledges durable acceptance only. Object identity is a legacy fallback, never a serialized-job identity.
- `translateRequest` defaults to borrowed ownership and isolates mutable containers. Only pass `{ ownership: "owned" }` for an attempt-local snapshot, never shared history or cached credentials. Thinking provenance stays private across copies. Tool-signature recovery requires an explicit request-local map; never recover from another request. Unsupported media mappings and overlong signed Responses call IDs fail explicitly rather than silently becoming prose.
- Stream tool identity is request-local. Emit each Chat tool ID once, buffer incomplete names until the opener is usable, and retain native Messages/Responses event framing when restoring names. Do not change native terminal events into Chat `[DONE]` markers.
- Remote image retrieval uses direct Undici, one DNS snapshot pinned to the socket, a shared DNS/HTTP deadline, and a bounded magic-byte-validated body. Maintain the numerical public-address policy in `config/mediaConfig.js`, including IPv6/mapped-address checks and literal-IP handling; never use a later unpinned global fetch.
- Model facts are provider/endpoint-specific. Keep context window, maximum input and maximum output separate; preserve explicit unknowns, negative capabilities and real zero prices. Pin models.dev snapshot dates/hashes and retain source provenance for overrides. Never assign a blanket 1M limit or infer retirement/availability from a missing catalog entry.
- Validate vision on actual outbound payloads, including tool results and compacted multi-turn history. Base64 belongs in typed media fields, not generated prose or JSON text; text token estimates must not count encoded image bytes. Do not silently trim messages to hide an upstream input-limit error.
- Thinking suffixes and provider defaults must also reach native passthrough in that endpoint's wire format. `(0)` disables budgeted thinking. Keep Claude's disabled-thinking switch independent from its effort control, and map ordinal effort levels only against the resolved model/provider's declared set. Preserve explicit output caps and include/display controls.
- Caller aborts are terminal even when `AbortSignal.reason` is an ordinary Error. Retry backoff must observe the caller signal; never keep retrying/dial another URL after cancellation. Provider connection timeouts remain distinct from caller aborts.
- Processing speed (`service_tier`) is independent of reasoning effort. Preserve Standard/Auto and explicit paid-tier intent through translation, native passthrough and account fallback; never implement Fast by lowering reasoning or silently drop Ultrafast. Public OpenAI API and Codex subscription transports have different supported wire values and account restrictions. See `docs/PROCESSING-SPEED.md`.
- Every destination serializer must lower retained internal tool media. In particular, Ollama uses user `images[]` and CommandCode uses typed image blocks after the corresponding contiguous tool replies. Do not flatten these arrays into text or discard image-only content.
- Public error normalization lives in `utils/clientErrors.js` with pure ESM imports. Keep exact request-validation diagnostics through account fallback; quoted rejected values cannot supply quota/reset evidence or cause account-health writes.
- Echo the caller's route identity only on the client response, never on the upstream request. Chat JSON/SSE IDs are Chat-shaped; native Responses keeps native IDs/events. User-agent branding cannot override the requested endpoint's format.
- Explicit numeric thinking budgets are caller intent, not soft defaults. Generated/injected budgets carry private request-local provenance so they may fit the unchanged output cap; preserve that context across native copies and retries without serializing it.
- Reuse the explicit tool-media predicate for Gemini Struct result arrays in admission, conversion and modality stripping. Ordinary application records must not be rejected as documents or replaced with omitted-file prose.

## How to add

- **Provider**: copy `providers/REGISTRY_TEMPLATE.js` → `providers/registry/{id}.js`, declare its models in that entry, and add its import and array entry to `providers/registry/index.js`. Preserve intentionally hidden entries. Generic providers need no executor (DefaultExecutor handles OpenAI-compatible APIs).
- **Model**: add a static model to the provider's registry `models` list and update provider-scoped reviewed metadata, capabilities and pricing as appropriate. `providers/index.js` builds `PROVIDER_MODELS` from the registry plus special TTS tables; `config/providerModels.js` re-exports it. Add behavioral coverage, including `tests/unit/capabilities.test.js` where applicable.
- **Identity metadata**: after changing provider identities, aliases or declared upstream model IDs, run `node scripts/generate-provider-identity.mjs` from the repository root and verify with `--check`. It generates `providers/identity.js` from the registered providers; it does not generate the registry index. Run the relevant provider/alias baselines after registry changes.
- **Executor** (only for non-standard upstream): subclass `BaseExecutor` (override `getBaseUrls`/`buildHeaders`/`buildUrl`/`execute`), register in `executors/index.js` map. `getExecutor` falls back to `DefaultExecutor` when absent.
- **Translator**: add `request|response/<from>-to-<to>.js` calling `register(...)`, then import it in `translator/index.js`. Reuse `schema/` + `concerns/` — don't re-implement parsing.

## Pitfalls

- OpenAI bridge is lossy (thinking, non-base64 images, tool ids, is_error) — prefer a direct route for fragile pairs.
- `registry/index.js` is a checked-in static import list and array; keep both in sync when adding a provider. No checked-in index generator has been identified; the migration and display-injection scripts do not generate it. `REGISTRY_TEMPLATE` is outside the index by design.
- Kiro EventStream and Cursor protobuf require executor-level coverage. CommandCode requests use the OpenAI-to-CommandCode translator; its executor decodes NDJSON into OpenAI SSE using the response translator, so test both boundaries.
- `rtk/` + `headroom.js` mutate the request body in-place and are **fail-open**: any error returns null and leaves the body untouched — never throw out of them. RTK skips `is_error`/`status:"error"` tool results to preserve traces.
