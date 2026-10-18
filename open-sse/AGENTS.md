# open-sse

Provider-agnostic SSE engine: a supported client request → provider execution (LLM chat, image, embedding, tts, stt, search), returned in the client's format. Some modules depend on the app's persistence/logging aliases; this is not an independently installable package.

## Request lifecycle (chat)

`handlers/chatCore.js` → `services/model.js` `parseModel` (resolve `provider/model`) → **pre-translate hooks** (`rtk/` tool_result compress, `rtk/headroom.js` proxy compress, `rtk/caveman.js` system inject — all fail-open) → `executors/index.js` `getExecutor(provider)` → `translator/index.js` `translateRequest` (client format → provider format) → `executor.execute()` (streams upstream) → `translateResponse` (provider chunks → client format) → SSE out.

## Directory map

- `config/` — ALL constants/config (no hardcode elsewhere). `providers.js`/`registry/` (provider defs), `providerModels.js` (alias→models matrix), `runtimeConfig.js` (timeouts, token limits), `*Constants.js`.
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
- Perf: accumulate streamed text in chunk arrays + `join("")` once (never `+=` per chunk); per-provider mutexes (never a global lock); L1 repo caches with explicit `invalidate*Cache()` on every mutation; `/v1/models` 30s TTL with `Cache-Control: public, max-age=30, stale-while-revalidate=60`. Zen diverges from upstream #3629 on purpose: settings uses a 2s TTL raw cache and usage uses object-identity dedup (no field-equality scan, no extra index).
- Stream tool identity is request-local. Emit each Chat tool ID once, buffer incomplete names until the opener is usable, and retain native Messages/Responses event framing when restoring names. Do not change native terminal events into Chat `[DONE]` markers.
- Remote image retrieval uses direct Undici, one DNS snapshot pinned to the socket, a shared DNS/HTTP deadline, and a bounded magic-byte-validated body. Maintain the numerical public-address policy in `config/mediaConfig.js`, including IPv6/mapped-address checks and literal-IP handling; never use a later unpinned global fetch.
- Model facts are provider/endpoint-specific. Keep context window, maximum input and maximum output separate; preserve explicit unknowns, negative capabilities and real zero prices. Pin models.dev snapshot dates/hashes and retain source provenance for overrides. Never assign a blanket 1M limit or infer retirement/availability from a missing catalog entry.
- Validate vision on actual outbound payloads, including tool results and compacted multi-turn history. Base64 belongs in typed media fields, not generated prose or JSON text; text token estimates must not count encoded image bytes. Do not silently trim messages to hide an upstream input-limit error.

## How to add

- **Provider**: copy `providers/REGISTRY_TEMPLATE.js` → `providers/registry/{id}.js`; add models to `config/providerModels.js`. Generic providers need no executor (DefaultExecutor handles OpenAI-compatible APIs).
- **Model**: add an ordered `PATTERN_CAPABILITIES` entry in `providers/capabilities.js` (specific before generic) + exact/pattern pricing in `providers/pricing.js`, then lock it with a case in `tests/unit/capabilities.test.js` (e.g. GPT-6 Astra: 1050000 ctx / 128000 out).
- **Executor** (only for non-standard upstream): subclass `BaseExecutor` (override `getBaseUrls`/`buildHeaders`/`buildUrl`/`execute`), register in `executors/index.js` map. `getExecutor` falls back to `DefaultExecutor` when absent.
- **Translator**: add `request|response/<from>-to-<to>.js` calling `register(...)`, then import it in `translator/index.js`. Reuse `schema/` + `concerns/` — don't re-implement parsing.

## Pitfalls

- OpenAI bridge is lossy (thinking, non-base64 images, tool ids, is_error) — prefer a direct route for fragile pairs.
- `registry/index.js` is an auto-generated static import list; regenerate it (don't hand-edit) after adding a `registry/{id}.js`. REGISTRY_TEMPLATE is excluded by design.
- Special binary/protobuf formats (kiro EventStream, cursor protobuf, commandcode NDJSON) don't round-trip through OpenAI — handle in their executor.
- `rtk/` + `headroom.js` mutate the request body in-place and are **fail-open**: any error returns null and leaves the body untouched — never throw out of them. RTK skips `is_error`/`status:"error"` tool results to preserve traces.
