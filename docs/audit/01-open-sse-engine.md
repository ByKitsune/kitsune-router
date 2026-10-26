# Audit 01 — `open-sse/` engine map

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

Read-only structural audit of `/root/ZenRouter/open-sse` — the provider-agnostic
routing/translation engine (plain JavaScript ESM, no TypeScript, 392 `.js` files
+ 10 `.toml` custom filters).

Primary sources consulted: `open-sse/AGENTS.md`, `docs/ARCHITECTURE.md`,
and the files cited inline. Where the doc and the code disagree, the code wins
and the disagreement is called out in §8.

---

## 1. Entry points and public API

### 1.1 `open-sse/index.js` (78 lines)

`open-sse/package.json` is `{"type":"module"}` and declares **no `exports`
field** — the package is addressed by deep path (`open-sse/...`) via the
`jsconfig.json` path alias (`jsconfig.json:6-7`) and the matching vitest alias
(`tests/vitest.config.js:51-52`). There is therefore no single "public API
surface"; `index.js` is a convenience barrel that no production code imports for
its exported symbols except one: `src/app/api/translator/send/route.js:2`
(`getExecutor`). Five other modules import it purely for its side effect
(`import "open-sse/index.js"`), most importantly
`src/sse/handlers/chat.js:1` and `src/lib/oauth/providers/index.js:2`.

What `open-sse/index.js` does, in order:

| Line | Action |
| --- | --- |
| `:2` | `import "./utils/proxyFetch.js"` — **must be first**; patches global `fetch` with proxy support |
| `:5-17` | Re-exports config: `PROVIDERS`, `OAUTH_ENDPOINTS`, `CLAUDE_SYSTEM_PROMPT`, `CACHE_TTL`, `DEFAULT_MAX_TOKENS`, `COOLDOWN_MS`, `BACKOFF_CONFIG`, the `config/providerModels.js` helpers |
| `:20-28` | Translator: `FORMATS`, `register`, `translateRequest`, `translateResponse`, `needsTranslation`, `initState`, `initTranslators` |
| `:31-64` | Services: `detectFormat`, `getTargetFormat`, `parseModel`, `checkFallbackError`, token refresh, `oauthCredentialManager` |
| `:67-68` | Handlers: `handleChatCore`, `isTokenExpiringSoon`, stream-controller helpers |
| `:71` | Executors: `getExecutor`, `hasSpecializedExecutor` |
| `:74-78` | Utils: `errorResponse`, `formatProviderError`, two stream factories |

Notably **absent** from the barrel: `handleResponsesCore`, all media cores
(image/tts/stt/embedding/video/search/fetch), `PROVIDER_MEDIA`, and
`providers/index.js`'s `isCustomCompatibleProvider`.

### 1.2 The real entry chain into the engine

```
src/app/api/v1/*/route.js        (Next rewrite: /v1/* → /api/v1/*)
  └─ src/sse/handlers/chat.js            ← account-selection loop, combo expansion
       └─ open-sse/handlers/chatCore.js  ← format detect → translate → execute → stream
            ├─ open-sse/services/model.js        parseModel (called app-side, not here)
            ├─ open-sse/services/provider.js     detectFormat / getTargetFormat / resolveTransport
            ├─ open-sse/translator/index.js      translateRequest
            ├─ open-sse/executors/index.js       getExecutor → executor.execute()
            ├─ open-sse/rtk/*                    pre-translate body mutation (fail-open)
            └─ open-sse/handlers/chatCore/{streaming,nonStreaming,sseToJson}Handler.js
```

`src/sse/handlers/chat.js` is the app-side glue that owns the retry/fallback
loop (`src/sse/handlers/chat.js:288` `while (true)`), combo handling, credential
selection and `projectId` hydration; `chatCore.js` is single-shot per account.
Keep that boundary in mind: **`chatCore` does not iterate accounts.**

Media entry points (each with its own `<x>Core.js` + provider registry under
`handlers/<x>Providers/`): `embeddingsCore.js`, `imageGenerationCore.js`,
`ttsCore.js`, `sttCore.js`, `videoCore.js`, `search/index.js`,
`fetch/index.js`, and `responsesHandler.js` (which delegates to `handleChatCore`).

---

## 2. `handlers/` — the chat request lifecycle

### 2.1 File inventory

| Path | Purpose | Notes |
| --- | --- | --- |
| `handlers/chatCore.js` | Core chat handler: detect → translate → execute → stream | 557 lines. Export: `handleChatCore`, `isTokenExpiringSoon`, `stripContinuityFields` |
| `handlers/chatCore/streamingHandler.js` | SSE-to-SSE pipe + usage persistence | `handleStreamingResponse`, `buildOnStreamComplete`; owns the non-SSE upstream guard |
| `handlers/chatCore/nonStreamingHandler.js` | JSON response conversion per source format | 444 lines; hand-rolls OpenAI→Claude and Gemini→OpenAI flat conversions |
| `handlers/chatCore/sseToJsonHandler.js` | Forced-SSE upstream → JSON client (provider `forceStream`) | 399 lines; `handleForcedSSEToJson` + `parseSSEToOpenAIResponse` |
| `handlers/chatCore/jsonCompletionOutcome.js` | Truncation detection, OpenAI→Responses object, output-budget errors | `isTruncatedEmptyCompletion`, `openAICompletionToResponses`, `outputBudgetError` |
| `handlers/chatCore/streamMode.js` | `clientRequestedStreaming(body, sourceFormat)` | 24 lines; OpenAI `stream` default false, Gemini/Antigravity always SSE |
| `handlers/chatCore/requestDetail.js` | Build/persist request detail + usage lines | `extractRequestConfig`, `buildRequestDetail`, `saveUsageStats`, `formatDoneLine` |
| `handlers/responsesHandler.js` | `/v1/responses` client surface | Wraps `handleChatCore` |
| `handlers/embeddingsCore.js`, `imageGenerationCore.js`, `ttsCore.js`, `sttCore.js`, `videoCore.js` | Per-modality cores | Each resolves provider config then dispatches |
| `handlers/search/index.js`, `chatSearch.js`, `normalizers.js`, `callers.js` | Web search | `chatSearch.js` 582 lines |
| `handlers/fetch/index.js` | URL fetch tool | 359 lines; uses bare `fetch` with `redirect:"manual"` + `sanitizeHeaders` |
| `handlers/embeddingProviders/{_base,openai,openaiCompatNode,gemini,selfhostedEmbedding,index}.js` | Embedding adapters | |
| `handlers/imageProviders/*` (15 files) | Image adapters | openai, gemini, codex, antigravity, nanobanana, comfyui, sdwebui, falAi, huggingface, stabilityAi, blackForestLabs, cloudflareAi, runwayml + `_base`/`index` |
| `handlers/ttsProviders/*` (13 files) | TTS adapters | edgeTts, googleTts, elevenlabs, minimax, openai, openrouter, gemini, xiaomi-mimo, localDevice, selfhostedTts, genericFormats + `_base`/`index` |

### 2.2 `handleChatCore` — traced call chain

`open-sse/handlers/chatCore.js:73` takes a 30-key options object
(`body, modelInfo, credentials, log, onCredentialsRefreshed, onRequestSuccess,
onDisconnect, clientRawRequest, connectionId, userAgent, apiKey, ccFilterNaming,
rtkEnabled, headroomEnabled, headroomUrl, …, sourceFormatOverride,
providerThinking, clientSignal`).

| Step | Lines | What happens |
| --- | --- | --- |
| 1. Session tag | `:77-84` | `resolveSessionId({headers, body, connectionId, scope: provider})` |
| 2. **Source-format detection** | `:86` | `sourceFormat = sourceFormatOverride \|\| detectFormat(body)` |
| 3. Bypass short-circuit | `:89-90` | `handleBypassRequest(body, model, userAgent, ccFilterNaming)` — warmup/skip/`cc` naming; returns a Response and exits |
| 4. Target format resolution | `:92-119` | `alias = PROVIDER_ID_TO_ALIAS[provider]`; special-case Muse-on-opencode → `openai-responses`; `modelTargetFormat`; `runtimeTransport = resolveTransport(provider, sourceFormat)`; per-model `supportedFormats` guard; `targetFormat = useTransport?.format \|\| modelTargetFormat \|\| getTargetFormat(...)`; stashes `credentials.runtimeTransport` (and **deletes** it when absent, `:118`) |
| 5. Model mapping | `:120-121` | `getModelStrip`, `getModelUpstreamId` |
| 6. Provider-level thinking override | `:125-135` | Injects `thinking`/`reasoning_effort` from connection settings when the client set none |
| 7. Stream decision | `:137-164` | `clientRequestedStreaming` → `providerRequiresStreaming` (`PROVIDERS[provider].forceStream`) → image-gen forced non-stream for antigravity/gemini-cli → deepseek-tui non-interactive → `Accept:` header preference |
| 8. Logging | `:166-169` | `createRequestLogger(sourceFormat, targetFormat, model)`; logs raw body client-side and target-side |
| 9. Native passthrough | `:173-174` | `detectClientTool(headers, body)` + `isNativePassthrough(clientTool, provider)` — same-ecosystem CLI/provider skips **all** translation |
| 10. Modality stripping | `:180-191` | `getDeclaredModelCaps` → `withDeclaredCapabilities(getCapabilitiesForModel(...))` → `stripUnsupportedModalities`; then `prefetchRemoteImages` (in try/catch, warn-only) |
| 11. **Translation dispatch** | `:196-240` | passthrough branch (`:196-221`) copies the body, strips thinking suffix, adds codex reasoning effort, `normalizeClaudePassthrough`; else `translateRequest(sourceFormat, targetFormat, upstreamModel, body, stream, credentials, provider, reqLogger, stripList, connectionId, clientTool)`. `_toolNameMap` / `_customToolNames` are lifted off the body and then deleted; `stripContinuityFields` removes `encrypted_content` |
| 12. Tool normalisation | `:244-252` | `dedupeTools(tools, {clientTool, model})` then `normalizeToolSchemasForProvider(provider, tools, log)` |
| 13. Request log line | `:259-277` | One correlated `▶ …` line |
| 14. TTS cleanup | `:280-283` | Drops `role:"tool"` messages and `tools` |
| 15. Claude tool `type` default | `:291-293` | `shouldDefaultClaudeToolType(...)` → `defaultClaudeToolType` |
| 16. **Pre-translate / post-translate token savers** | `:296-343` | `TOKEN_SAVER_HEADER` (`x-zenrouter-token-saver: off`); `compressMessages` (RTK); `await compressWithHeadroom` (external proxy); `injectCaveman`; `injectPonytail`; `await compressWithPxpipe`. Order matters — every one can reshape `system`/`tools`/`messages` |
| 17. Cache anchor | `:348-350` | `anchorClaudeCache(translatedBody)` for Claude wire format — deliberately **after** all savers |
| 18. **Executor dispatch** | `:352` | `const executor = getExecutor(provider)` |
| 19. Pending tracking | `:353-354` | `trackPendingRequest(...true)` + `appendRequestLog({status:"PENDING"})` |
| 20. Stream controller | `:359-376` | `createStreamController({onDisconnect, onError, …})`; wires `clientSignal` abort → `handleDisconnect("client_aborted")` |
| 21. Proxy options | `:378-410` | Per-connection proxy / vercel relay; log line masks the proxy URL to `scheme//host:port` (`:392-404`) |
| 22. **`executor.execute({model, body, stream, credentials, signal, log, proxyOptions})`** | `:418` | `result = {response, url, headers, transformedBody, responseFormat?}`; `providerResponseFormat = result.responseFormat \|\| targetFormat` |
| 23. Execute-error path | `:425-451` | `AbortError` → 499; budget error → 400; else `formatProviderError` → 502 + `saveRequestDetail(status:"error")` |
| 24. **401/403 token refresh + retry** | `:459-502` | Skips when `executor.noAuth`. `isPermanentAuthDenial(status, peekText)` on a `response.clone()` **skips the refresh entirely** (Anthropic `oauth_not_allowed_for_organization`). Otherwise `refreshWithRetry(async () => executor.refreshCredentials(...), 3, log)`; rotating refresh tokens are written back onto the shared `credentials` object inside the callback (`:475-478`); on success `Object.assign(credentials, newCredentials)` + `onCredentialsRefreshed`, then **one** retry of `executor.execute` — accepted only `if (retryResult.response.ok)`; a failed retry silently keeps the original error response |
| 25. Upstream error path | `:505-528` | `parseUpstreamError(providerResponse, executor)` → `createErrorResult(statusCode, errMsg, resetsAtMs, diagnostics)` |
| 26. **Streaming setup / dispatch** | `:530-550` | Builds `sharedCtx`; (a) if `!clientWantsStream && providerRequiresStreaming` → `handleForcedSSEToJson`; (b) if `!stream` → `handleNonStreamingResponse`; (c) else `buildOnStreamComplete(...)` + `handleStreamingResponse` |

Note `:535-538`: if `handleForcedSSEToJson` returns `null` (upstream really answered
JSON), control **falls through** into the `!stream` branch at `:542` — intentional
but easy to misread.

### 2.3 Streaming setup inside `streamingHandler.js`

- `buildTransformStream` (`:25-41`) chooses:
  1. Responses-provider special case (`:28-34`): `PROVIDERS[provider].format ===
     "openai-responses"` and `targetFormat === "openai-responses"` and the UA is
     not droid/codex-cli → translate Responses SSE into the **client's** format
     using `CODEX_SOURCE_TO_TARGET` (`:14-20`, Gemini family all map to
     `antigravity`).
  2. `needsTranslation(targetFormat, sourceFormat)` → `createSSETransformStreamWithLogger(targetFormat, sourceFormat, …)` (`utils/stream.js:799`).
  3. Otherwise `createPassthroughStreamWithLogger(...)` (`utils/stream.js:817`).
- Non-SSE upstream guard (`:105-123`): if the upstream `content-type` is neither
  SSE nor `application/json` (nor `application/x-ndjson` for Ollama-format
  targets, `:77-84`), the body is read, an HTML `<title>` is sanitised and
  clamped to 160 chars, and a clean JSON error is returned rather than piping an
  HTML error page into the SSE transform (prevents a Next.js pipe crash).
- `pipeWithDisconnect(providerResponse, transformStream, recordingController,
  onAbortTerminal, stallTimeoutMs, …, sourceFormat)` (`:134-143`) — stall timeout
  from `PROVIDERS[provider].stallTimeoutMs || STREAM_STALL_TIMEOUT_MS`.
- `buildOnStreamComplete` (`:168-247`): a single `persistenceClaimed` latch makes
  completion and abort mutually exclusive; both write `saveRequestDetail` +
  `saveUsageStats`. In-stream failure (`streamMeta.failed`) is recorded as
  `status:"failed"` rather than success (issue #4104 referenced at `:183`).

### 2.4 Non-streaming path

`nonStreamingHandler.js` re-implements, by hand, several conversions the
translator registry already owns:

- `convertGeminiParts` (`:59`) + `appendGeminiToolCalls` (`:48`) reconstruct
  Gemini `functionCall` parts and thought signatures.
- `openAICompletionToClaudeMessage` (`:81`) is a **third** copy of the same
  conversion (also present in `sseToJsonHandler.js:51` and, in spirit, in
  `translator/response/openai-to-claude.js`).
- `openaiResponsesObjectToCompletion` / `ollamaBodyToOpenAI` /
  `convertResponsesStreamToJson` are pulled in for non-streaming Responses and
  Ollama shapes.

---

## 3. `executors/`

28 files (including `index.js`). `base.js` defines `BaseExecutor`; `default.js`
defines `DefaultExecutor extends BaseExecutor`; all others extend one of those.

### 3.1 Registration map (`executors/index.js:28-59`)

| Provider key | Executor class | Source file |
| --- | --- | --- |
| `antigravity` | `AntigravityExecutor` | `executors/antigravity.js` |
| `azure` | `AzureExecutor` | `executors/azure.js` |
| `gemini-cli` | `GeminiCLIExecutor` | `executors/gemini-cli.js` |
| `github` | `GithubExecutor` | `executors/github.js` |
| `iflow` | `IFlowExecutor` | `executors/iflow.js` |
| `qoder` | `QoderExecutor` | `executors/qoder.js` |
| `kiro` | `KiroExecutor` | `executors/kiro.js` |
| `kimchi` | `KimchiExecutor` | `executors/kimchi.js` |
| `codex` | `CodexExecutor` | `executors/codex.js` |
| `cursor` | `CursorExecutor` | `executors/cursor.js` |
| `cu` | `CursorExecutor` (**alias**) | same instance class |
| `vertex` | `VertexExecutor("vertex")` | `executors/vertex.js` |
| `vertex-partner` | `VertexExecutor("vertex-partner")` | same class, second instance |
| `opencode` | `OpenCodeExecutor` | `executors/opencode.js` |
| `grok-web` | `GrokWebExecutor` | `executors/grok-web.js` |
| `grok-cli` | `GrokCliExecutor` | `executors/grok-cli.js` |
| `gcli` | `GrokCliExecutor` (**alias, second instance**) | |
| `gb` | `GrokCliExecutor` (**alias, third instance**) | |
| `perplexity-web` | `PerplexityWebExecutor` | `executors/perplexity-web.js` |
| `ollama-local` | `OllamaLocalExecutor` | `executors/ollama-local.js` |
| `commandcode` | `CommandCodeExecutor` | `executors/commandcode.js` |
| `xiaomi-tokenplan` | `XiaomiTokenplanExecutor` | `executors/xiaomi-tokenplan.js` |
| `mimo-free` | `MimoFreeExecutor` | `executors/mimo-free.js` |
| `mmf` | `MimoFreeExecutor` (**alias**) | |
| `codebuddy-cn` | `CodeBuddyExecutor` | `executors/codebuddy-cn.js` |
| `codebuddy-intl` | `CodeBuddyIntlExecutor` | `executors/codebuddy-intl.js` |
| `trae` | `TraeExecutor` | `executors/trae.js` |
| `zed` | `ZedExecutor` | `executors/zed.js` |
| `windsurf` | `WindsurfExecutor` | `executors/windsurf.js` |
| `devin-cli` | `DevinCliExecutor` | `executors/devin-cli.js` |

`getExecutor(provider)` (`:63-67`) falls back to a memoised per-provider
`new DefaultExecutor(provider)`. `hasSpecializedExecutor` (`:69`) is exported and
re-exported from the barrel but **has no in-repo caller**.

Every executor file has a matching `providers/registry/<id>.js` (including
`trae.js`, `windsurf.js`, `devin-cli.js`) **except** the three alias keys `cu`,
`gcli`, `gb`, which are resolved to ids `cursor` / `grok-cli` / `grok-cli` by
`services/model.js` alias resolution when a registry alias exists. `providers/registry/`
holds 123 `.js` files: `index.js` plus **122 registry entries**.

### 3.2 Each executor vs the generic `default.js` path

`default.js` (435 lines, `DefaultExecutor extends BaseExecutor`) is the generic
OpenAI-compatible path. It provides, config-driven and with almost no per-provider
code: `buildUrl` (runtime transport, `openai-compatible-*`, `anthropic-compatible-*`,
gemini format, `urlSuffix`, `{accountId}` substitution), `buildHeaders` (auth
descriptor from `transport.auth`, header hooks `kimiHeaders`/`clineHeaders`/
`kilocodeOrg`, Anthropic beta selection + per-connection rejected-flag denylist,
`x-claude-code-session-id`, first-party-identity stripping for third-party
Anthropic gateways), `transformRequest` (JSON-schema→json_object fallback,
`injectReasoningContent`), `execute` (one beta-flag 400 retry), and
`refreshCredentials` (grant table + kiro/cline/kimi/iflow special cases).

| File | Extends | Overrides | Why it exists | Non-JSON upstream? |
| --- | --- | --- | --- | --- |
| `base.js` | — | `getBaseUrls`, `getFallbackCount`, `buildUrl`, `buildHeaders`, `transformRequest`, `shouldRetry`, `refreshCredentials`, `needsRefresh`, `parseError`, `execute` | Multi-URL fallback loop + config-driven retry/backoff + connect timeout | JSON only |
| `default.js` | `BaseExecutor` | `transformRequest`, `buildUrl`, `buildHeaders`, `resolveAuthDescriptor`, `readClientHeader`, `execute`, `refreshCredentials` (+ `applyJsonSchemaFallback`) | The OpenAI-compatible generic path | JSON |
| `azure.js` | `DefaultExecutor` | `buildUrl`, `buildHeaders`, `transformRequest` | Azure deployment URL (`/openai/deployments/{d}/chat/completions?api-version=…`) + `api-key` header | JSON |
| `codebuddy-cn.js` | `DefaultExecutor` | `transformRequest` | Upstream rejects non-stream requests (HTTP 400 code 11101); forces `stream:true` and swaps agent-identity system prompts for a neutral one to dodge Tencent's content filter | JSON (forced SSE) |
| `codebuddy-intl.js` | `DefaultExecutor` | `transformRequest` | Same stream-only gateway behaviour + `reasoning_summary:"auto"` mirroring + typed-block message normalisation | JSON (forced SSE) |
| `kimchi.js` | `DefaultExecutor` | `transformRequest` | Drops top-level Anthropic-only keys the Kimchi OpenAI gateway rejects (`anthropic_version`, `thinking`, `top_k`, …), flattens `system` | JSON |
| `ollama-local.js` | `DefaultExecutor` | `buildUrl` | Local `/api/chat` endpoint from per-connection base URL | JSON/NDJSON upstream |
| `xiaomi-tokenplan.js` | `DefaultExecutor` | `buildUrl` | Region-specific base URL; claude transport → `/anthropic/v1/messages` | JSON |
| `gemini-cli.js` | `BaseExecutor` | `buildUrl`, `buildHeaders`, `transformRequest`, `parseError`, `refreshCredentials` | Google Cloud Code envelope (`:streamGenerateContent?alt=sse`), `X-Goog-Api-Client` fingerprint | JSON |
| `vertex.js` | `BaseExecutor` | `buildUrl`, `buildHeaders`, `refreshCredentials`, `execute` | Vertex AI; parses SA JSON / ADC JSON out of `apiKey`, caches project id | JSON |
| `github.js` | `BaseExecutor` | `transformRequest`, `execute`, `executeWithResponsesEndpoint`, `executeWithMessagesEndpoint`, `sanitizeMessagesForChatCompletions`, `refreshCopilotToken`, `refreshGitHubToken`, `kindsRefresh` | Copilot has three incompatible endpoints (chat / responses / messages); the executor picks and **calls the translators itself** | JSON |
| `iflow.js` | `BaseExecutor` | `buildHeaders`, `buildUrl`, `transformRequest` | HMAC-SHA256 request signature + session headers | JSON |
| `antigravity.js` | `BaseExecutor` | `buildUrl`, `buildHeaders`, `transformRequest`, `refreshCredentials`, `parseError`, `computeRetryDelay`, `parseRetryHeaders`, `isTransientAntigravityError`, `static cloakTools` | Antigravity envelope, tool-name sanitising, telemetry-key stripping, Retry-After parsing | JSON |
| `kiro.js` | `BaseExecutor` | `buildHeaders`, `buildUrl`, `shouldRetry`, `transformRequest`, `execute`, `attachIntegrityGate`, `runIntegrityRecovery`, `readIntegrityAttempt`, `transformEventStreamToSSE`, `refreshCredentials` | **AWS EventStream (binary)** upstream; decodes frames itself and re-emits OpenAI-shaped SSE. Also implements an integrity gate: on a corrupt/truncated stream it re-runs the attempt with session replay and fails over to a terminal SSE error frame (`:501`, `:623`, `:1207` frame parser) | **Yes — AWS EventStream binary.** `responseFormat` stays the target format; the executor normalises to OpenAI SSE first |
| `codex.js` | `BaseExecutor` | `buildHeaders`, `buildUrl`, `refreshCredentials`, `needsRefresh`, `prefetchImages`, `execute`, `_peekSseTransientError`, `parseError` | ChatGPT Responses API; peeks the SSE head for `server_is_overloaded` / `model_at_capacity` / `response.failed` to decide retry-vs-account-fallback | Responses SSE (JSON lines) |
| `cursor.js` | `BaseExecutor` | `buildUrl`, `buildHeaders`, `transformRequest`, `makeFetchRequest`, `executeAgent`, `execute` | **Connect-RPC / protobuf** `AgentService`; encodes requests and decodes responses with `utils/cursorProtobuf.js`, can use HTTP/2. Reports `responseFormat: FORMATS.OPENAI` because it decodes into OpenAI-shaped output itself | **Yes — protobuf over Connect-RPC** |
| `commandcode.js` | `BaseExecutor` | `transformRequest`, `buildHeaders`, `execute`, `parseError` | **AI SDK v5 NDJSON** upstream (one JSON event per line, no `data:` prefix); converts each event to an OpenAI `chat.completion.chunk` and re-frames as SSE, then sets `result.responseFormat = FORMATS.OPENAI` (`:67`) so downstream needs no translation. Also injects `x-session-id` | **Yes — NDJSON** |
| `windsurf.js` | `BaseExecutor` | `buildUrl`, `buildHeaders`, `transformRequest`, `execute`, `transformToSSE`, `refreshCredentials` | **gRPC-web + hand-rolled protobuf encoder** (Codeium `GetChatMessage`); `transformToSSE` converts gRPC-web frames to OpenAI SSE | **Yes — gRPC-web protobuf** |
| `zed.js` | `BaseExecutor` | `execute` (wholesale), `resolveModel`, `parseError`, `refreshCredentials`, `needsRefresh` | **NDJSON/SSE-ish body-per-line** from `cloud.zed.dev/completions`; `{"event": <provider-shaped chunk>}` / `{"status":…}` / `[DONE]`. Re-uses the translator functions directly to normalise provider-shaped chunks, because the wire shape's thread envelope + LLM-token exchange don't fit `transformRequest`/`buildUrl` | **Yes — NDJSON with per-provider inner shapes** |
| `devin-cli.js` | `BaseExecutor` | `buildUrl`, `buildHeaders`, `transformRequest`, `execute` | **Spawns a local CLI subprocess** (`devin acp`, JSON-RPC 2.0 over stdio), bridges ACP `session/update` notifications into OpenAI SSE, kills the child on `_cognition.ai/agent_stopped`. `noAuth` — inherits parent env credentials | **Yes — subprocess stdio** |
| `trae.js` | `BaseExecutor` (default export) | `buildHeaders`, `resolveMode`, `commonParams`, `createSession`, `streamEvents`, `execute`, `refreshCredentials` | Two-step SOLO agent API: POST `/chat_sessions` then GET `/chat_sessions/{id}/events` SSE; assistant text arrives in `plan_item.thought` | SSE (session-based) |
| `grok-cli.js` | `BaseExecutor` | `buildUrl`, `buildHeaders`, `transformRequest`, `execute`, `refreshCredentials`, `needsRefresh`, `parseError` | `/responses` with `store:false`; strips server-generated item ids (`rs_`/`fc_`/`resp_`/`msg_`), handles hosted tool types, per-connection machine id | Responses JSON/SSE |
| `grok-web.js` | `BaseExecutor` | `execute` (wholesale) | Drives the grok.com **web** session API with a browser `User-Agent` + cookie/SSO credential; emits its own SSE (`sseChunk`) | Non-standard web JSON → SSE |
| `perplexity-web.js` | `BaseExecutor` | `execute` (wholesale) | Drives the perplexity.ai web SSE endpoint with a browser UA | Non-standard web SSE |
| `qoder.js` | `BaseExecutor` | `buildUrl`, `execute`, `parseError`, `refreshCredentials`, `needsRefresh` | COSY-signed (RSA+AES+MD5, ~17 `Cosy-*` headers) request; unwraps Qoder's `{statusCodeValue, body}` SSE envelope; per-model `model_config` is a hard requirement (a wrong block silently downgrades the model) | Envelope-wrapped SSE |
| `mimo-free.js` | `BaseExecutor` | `buildUrl`, `buildHeaders`, `transformRequest`, `execute` | Bootstrap-token flow for xiaomimimo free tier; Chrome UA is an anti-abuse gate (403 otherwise); session-affinity id | JSON |
| `opencode.js` | `BaseExecutor` | `transformRequest`, `buildUrl`, `buildHeaders` | Canonical `ses_`/`msg_` id derivation the Zen backend demands (403 `FreeTierError` otherwise); routes two `muse-*` models to `/zen/v1/responses` | JSON/Responses |
| `github.js` | see above | | | |

**Why the binary/protobuf/NDJSON executors bypass the translator.** The
translator registry is a pure `source:target` **format** pivot that assumes both
sides are JSON-shaped chat payloads. An AWS EventStream frame, a Connect-RPC
protobuf frame, a gRPC-web frame, a JSON-RPC stdio line and an AI-SDK NDJSON
event are not chat formats — they are transport encodings. Each such executor
therefore does its own decode into the format the rest of the pipeline expects
(usually OpenAI SSE), and either leaves `responseFormat` at the target format
(kiro) or explicitly declares `responseFormat: FORMATS.OPENAI`
(cursor `:547/631/646/682`, commandcode `:67`) so `chatCore` skips a second
translation hop.

---

## 4. `translator/`

51 files: `index.js`, `formats.js`, `request/` (12), `response/` (10),
`concerns/` (17), `formats/` (5), `schema/` (5).

### 4.1 Registration mechanism

`register(from, to, requestFn, responseFn)` (`translator/index.js:22-32`) writes
into two module-scoped `Map`s keyed `` `${from}:${to}` ``. The maps are declared
with **`var`, not `let`** (`:18-19`) — deliberate: translator modules call
`register()` as an import side effect, so the registry body may not have run yet,
and `var` hoisting yields `undefined` instead of a TDZ throw. `??=` lazily
creates the maps on first call.

`ensureInitialized()` (`:35`) is a documented **no-op**; `initTranslators()`
(`:339-341`) exists only for backward compatibility (`initTranslators` is
imported by `src/app/api/v1/*/route.js` purely to force module evaluation).
Actual registration happens through the **static import block at
`translator/index.js:344-365`** — 22 side-effect imports. A new translator file
that is not added there never runs.

### 4.2 Count and coverage

**30 `register()` calls across 22 files** (12 request files + 10 response files;
`request/gemini-to-openai.js`, `request/openai-to-gemini.js`,
`request/openai-responses.js`, `response/gemini-to-openai.js` and
`response/openai-responses.js` each register 2-3 keys):

| Key | Direction | File:line |
| --- | --- | --- |
| `claude:openai` | request | `request/claude-to-openai.js:360` |
| `openai:claude` | request | `request/openai-to-claude.js:459` |
| `gemini:openai` | request | `request/gemini-to-openai.js:160` |
| `gemini-cli:openai` | request | `request/gemini-to-openai.js:161` |
| `openai:gemini` | request | `request/openai-to-gemini.js:553` |
| `openai:gemini-cli` | request | `request/openai-to-gemini.js:554` |
| `openai:antigravity` | request | `request/openai-to-gemini.js:555` |
| `antigravity:openai` | request | `request/antigravity-to-openai.js:243` |
| `openai-responses:openai` | request | `request/openai-responses.js:470` |
| `openai:openai-responses` | request | `request/openai-responses.js:471` |
| `openai:kiro` | request | `request/openai-to-kiro.js:454` |
| `claude:kiro` | request | **`request/claude-to-kiro.js:361`** — direct route |
| `openai:cursor` | request | `request/openai-to-cursor.js:185` |
| `openai:ollama` | request | `request/openai-to-ollama.js:197` |
| `openai:commandcode` | request | `request/openai-to-commandcode.js:200` |
| `openai:vertex` | request | `request/openai-to-vertex.js:42` |
| `claude:openai` | response | `response/claude-to-openai.js:225` |
| `openai:claude` | response | `response/openai-to-claude.js:279` |
| `gemini:openai` | response | `response/gemini-to-openai.js:152` |
| `gemini-cli:openai` | response | `response/gemini-to-openai.js:153` |
| `antigravity:openai` | response | `response/gemini-to-openai.js:154` |
| `vertex:openai` | response | `response/gemini-to-openai.js:155` |
| `openai:openai-responses` | response | `response/openai-responses.js:781` |
| `openai-responses:openai` | response | `response/openai-responses.js:782` |
| `openai:antigravity` | response | `response/openai-to-antigravity.js:125` |
| `kiro:openai` | response | `response/kiro-to-openai.js:161` |
| `kiro:claude` | response | **`response/kiro-to-claude.js:279`** — direct route |
| `cursor:openai` | response | `response/cursor-to-openai.js:30` |
| `ollama:openai` | response | `response/ollama-to-openai.js:134` |
| `commandcode:openai` | response | `response/commandcode-to-openai.js:184` |

There is exactly **one request direct route** (`claude:kiro`) and **one response
direct route** (`kiro:claude`). Everything else goes through the OpenAI pivot.

### 4.3 Direct routes vs the OpenAI pivot

`translateRequest` (`:69-203`) runs a fixed pre-translation pipeline *before*
touching the registry:

1. `compressToolNames(sourceFormat, result)` — tools >64 chars get compressed;
   the map is stashed on `result._toolNameMap` (`:76-80`).
2. `stripContentTypes(result, stripList)` — explicit per-model opt-in from the
   registry's `strip[]` (`:38-52`, `:83`).
3. `normalizeThinkingConfig(result)` — deletes `thinking` unless the last message
   is from the user (`:86`, impl `services/provider.js:170-175`).
4. `ensureToolCallIds(result)` (`:89`).
5. `fixMissingToolResponses(result)` — **skipped when `targetFormat === KIRO`**
   (`:95-97`), because Kiro has its own source-aware reconciliation
   (`concerns/kiroConversation.js`) and the generic helper inserts OpenAI
   `role:"tool"` messages a direct Claude→Kiro translator cannot consume.
6. `captureThinking(result)` (`:101`) and `captureSessionId(...)` (`:104`) are
   taken **before** conversion, because translation strips/renames the fields.

Then the dispatch (`:109-135`): if `sourceFormat !== targetFormat`, first check
`requestRegistry.get(`${sourceFormat}:${targetFormat}`)`; if present, that one
function runs and the pivot is skipped. Otherwise step 1 `source→openai`, step 2
`openai→target`.

Post-translation, unconditionally: `applyThinking` (`:137-146`, skipped for the
Kiro direct-translator cases), `filterToOpenAIFormat` when the target is OpenAI
(`:150-162`, with `preserveCacheControl` / `preserveDeveloperRole` quirks and a
Responses→Chat `stripUnsupportedChatExtensions`), `prepareClaudeRequest` +
`ensureTrailingUserTurn` when the target is Claude (`:165-169`), and OAuth Claude
tool cloaking (`:173-191`). `translator/index.js:193-200` keeps a **commented-out
antigravity cloaking block** — dead code (the executor's `static cloakTools`
survives at `executors/antigravity.js:647` but is not called from here).

`translateResponse` (`:206-277`) mirrors this: same-format fast path still
decloaks (`:211-219`); then `responseRegistry.get(`${targetFormat}:${sourceFormat}`)`
direct route; else the two-hop pivot; the OpenAI intermediate is attached as a
non-enumerable-ish `results._openaiIntermediate` for logging (`:263-265`).

`initState(sourceFormat)` (`:285-336`) returns a base streaming state and, for
`openai-responses`, a much larger Responses-specific state (sequence numbers,
per-item buffers, `responsesUsage`, `completionPending`).

### 4.4 Supporting directories

| Dir | Contents | Role |
| --- | --- | --- |
| `translator/schema/` | `roles.js` (`ROLE`, `GEMINI_ROLE`), `blocks.js` (`OPENAI_BLOCK`, `CLAUDE_BLOCK`, `RESPONSES_ITEM`, `REASONING_DETAIL`, validity sets), `finishReasons.js` (`OPENAI_FINISH`, `CLAUDE_STOP`, `GEMINI_FINISH`), `defaults.js` (`MODEL_FALLBACK`, `DEFAULT_IMAGE_MIME`), `index.js` (barrel) | Pure-data enums. **No logic.** The convention forbids hardcoding role/block strings elsewhere |
| `translator/concerns/` | 17 files: `assistantPrefillPolicy`, `chunk`, `finishReason`, `image`, `json`, `kiroConversation`, `message`, `modality`, `paramSupport`, `prefetch`, `reasoning`, `thinking`, `thinkingUnified`, `thoughtSignature`, `toolCall`, `typedContent`, `usage` | Cross-translator shared logic — the DRY layer. `thinkingUnified.js` (461 lines) owns `extractThinking`/`captureThinking`/`applyThinking`/`stripThinkingSuffix`; `paramSupport.js` owns `STRIP_RULES` + `stripUnsupportedParams` (called centrally from `BaseExecutor.execute:135`); `modality.js` owns capability-based media stripping |
| `translator/formats/` | `openai.js`, `claude.js`, `gemini.js`, `responsesApi.js`, `maxTokens.js` | Per-format normalisers that are not directional pairs — e.g. `claude.js` exports `normalizeClaudePassthrough`, `anchorClaudeCache`, `prepareClaudeRequest`, `ensureTrailingUserTurn`; `openai.js` exports `filterToOpenAIFormat` |
| `translator/formats.js` | `FORMATS` enum + `detectFormatByEndpoint(pathname, body)` | `FORMATS` has 13 members: `openai`, `openai-responses`, `openai-response`, `claude`, `gemini`, `gemini-cli`, `vertex`, `codex`, `antigravity`, `kiro`, `cursor`, `ollama`, `commandcode` |

`FORMATS.OPENAI_RESPONSE` (singular), `FORMATS.CODEX` are only referenced from
`concerns/modality.js:156-157` and `utils/usageTracking.js:106` — they are
effectively vestigial enum members.

---

## 5. `providers/`

142 files: 11 top-level `.js`, `registry/` (123), `metadata/` (5),
`models/` (3).

### 5.1 Registry structure

```
providers/registry/{id}.js   →  export default { id, alias, aliases, uiAlias, category,
                                                display, transport, transports?, oauth?,
                                                media?, models?, features?, thinkingConfig? }
providers/registry/index.js  →  auto-generated: import pN from "./{id}.js" + export default [p0, p1, …]
providers/index.js           →  builds PROVIDERS / PROVIDER_MODELS / PROVIDER_OAUTH / PROVIDER_MEDIA
providers/schema.js          →  @typedef RegistryEntry + PROVIDER_DEFAULTS + ENDPOINT_DEFAULTS
                                (+ resolveProvider(), unwired — see §8)
providers/REGISTRY_TEMPLATE.js → copy-me template, deliberately outside registry/
config/providers.js          →  thin barrel re-exporting PROVIDERS/PROVIDER_OAUTH from providers/index.js
```

`providers/registry/index.js` is generated: 123 `import pN` statements and one
`export default [...]` array. Three entries are **commented out of the array**
but still imported:

- `// p102, // trae — hidden, no tool calling` (`:229`)
- `// p114, // devin-cli — hidden, spawns local agent with shell/fs access` (`:240`)
- `// p104, // windsurf — hidden, no tool calling` (`:241`)

The array also jumps `p66 → p123 → p67` (`:194-196`), so the numeric suffixes are
not a stable ordering contract. Generators: `scripts/migrate-registry.mjs`
(Model-A migration: `models[]` holds all kinds with a `kind` field; `media`
wrapper flattened) and `scripts/injectDisplayToRegistry.mjs` (injects
`display`/`category`/`uiAlias` from `src/shared/constants/providersDisplay.js` by
`new Function`-evaluating that file's source).

`providers/index.js` (`:34-48`) pivots the array into four maps:

- `PROVIDERS[id] = buildTransport(entry.transport, entry.oauth)` — `buildTransport`
  re-applies only `format:"openai"` as a default and injects the canonically-owned
  `clientId` / `clientSecret` / `tokenUrl` from `entry.oauth`. `entry.transports`
  (multi-endpoint) is copied verbatim.
- `PROVIDER_MODELS[entry.alias || entry.id] = entry.models.map(normalizeModel)`.
- `PROVIDER_OAUTH[id] = entry.oauth`.
- `PROVIDER_MEDIA[id]` = the subset of `MEDIA_KEYS` (`serviceKinds`, `ttsConfig`,
  `sttConfig`, `embeddingConfig`, `imageConfig`, `imageToTextConfig`,
  `videoConfig`, `musicConfig`, `searchViaChat`, `searchConfig`, `fetchConfig`,
  `modelsFetcher`, `mediaPriority`, `hiddenKinds`) plus legacy `entry.media`.
  `config/ttsModels.js`'s `buildTtsProviderModels()` is then merged over
  `PROVIDER_MODELS` under special keys (`openai-tts-models`, …).

`isCustomCompatibleProvider(providerId)` (`:59-66`) detects
`openai-compatible-*` / `anthropic-compatible-*` by string prefix; it is exported
from `providers/index.js` but not from `open-sse/index.js`.

### 5.2 Where models live

Two places, both authoritative in different scopes:

1. **Static/canonical:** `models: [...]` inside each `providers/registry/{id}.js`.
   Normalised by `providers/models/schema.js`'s `normalizeModel` (accepts a bare
   `"id"` string, fills `name` via `providers/models/namePatterns.js`). Helpers
   read it: `modelKind`/`inferModelKind`, `modelQuotaFamily`, `modelStrip`,
   `modelTargetFormat`, `modelSupportedFormats`.
2. **Derived/app-side:** `open-sse/config/providerModels.js` re-exports
   `PROVIDER_MODELS` from `providers/index.js` and adds the lookup helpers used
   across the app (`getProviderModels`, `getDefaultModel`, `isValidModel`,
   `findModelName`, `getModelTargetFormat`, `getModelSupportedFormats`,
   `getModelType`, `getModelUpstreamId`, `getModelQuotaFamily`, `getModelStrip`,
   `PROVIDER_ID_TO_ALIAS`, `OAUTH_ALIASES`). Its `findModel` tolerates dash/dot
   version drift and strips `model(level)` thinking suffixes.
   `config/models.js` (`MODEL_INFO`/`getModelInfo`) is a **separate, empty,
   unimported** model-metadata stub.

Capability/pricing metadata lives outside the registry:
`providers/capabilities.js` (770 lines, ordered `PATTERN_CAPABILITIES`),
`providers/declaredCaps.js` (live custom-model caps), `providers/pricing.js`
(720 lines), `providers/metadata/{coreModels,gatewayModels,vendorModels,mediaModels,reviewed}.js`
(≈7 000 lines of generated catalog data), `providers/catalogOverride.js`
(runtime catalog injection, installed from `src/instrumentation.js:8`),
`providers/identity.js` (canonicalisation), `providers/shared.js`
(`CLAUDE_API_HEADERS`, `OPENAI_COMPAT_BASE`, `ANTHROPIC_COMPAT_BASE`,
`selectAnthropicBeta`, `parseRejectedAnthropicBetaFlags`, OAuth client consts),
`providers/thinkingLevels.js`, `providers/visionPatterns.js`.

### 5.3 How a provider is added

Per `providers/REGISTRY_TEMPLATE.js` + `AGENTS.md:31`:

1. Copy the template to `providers/registry/{id}.js`, keep `id` + `category`,
   fill `transport.baseUrl` and `models[]`.
2. **Regenerate** `providers/registry/index.js` (do not hand-edit) —
   `scripts/migrate-registry.mjs` / `scripts/injectDisplayToRegistry.mjs`. Note:
   the template comment asserts the template "lives outside `registry/`" so the
   static list ignores it; but both generator scripts resolve `REGISTRY_DIR` to
   their own directory (`scripts/migrate-registry.mjs:15` sets
   `REGISTRY_DIR = __dirname`), i.e. `scripts/`, while
   `injectDisplayToRegistry.mjs:13` points at `open-sse/providers/registry`.
   The two scripts disagree about where the registry lives.
3. Only if the upstream is **not** OpenAI/Claude/Gemini-compatible: add an
   executor subclassing `BaseExecutor` and register it in `executors/index.js`.
4. For a new model: add an ordered `PATTERN_CAPABILITIES` entry in
   `providers/capabilities.js` (specific before generic) plus exact/pattern
   pricing in `providers/pricing.js`, then lock it in
   `tests/unit/capabilities.test.js`.

---

## 6. `config/`, `utils/`, `shared/`, `services/`, `transformer/`, `rtk/`

### 6.1 `config/` (16 files) — constants and thin resolvers

| Path | Purpose | Notes |
| --- | --- | --- |
| `config/providers.js` | Barrel over `providers/index.js` | 19 lines: re-exports `PROVIDERS`/`PROVIDER_OAUTH`, adds `OLLAMA_LOCAL_DEFAULT_HOST`, `resolveOllamaLocalHost`, `XIAOMI_TOKENPLAN_REGIONS`, `resolveXiaomiTokenplanBaseUrl`. So "registry" has two paths in: `config/providers.js` and `providers/index.js` directly |
| `config/providerModels.js` | Model lookup helpers over `PROVIDER_MODELS` | 128 lines; see §5.2 |
| `config/runtimeConfig.js` | Timeouts, HTTP status, retry config | `HTTP_STATUS`, `CACHE_TTL`, `MEMORY_CONFIG`, `SEARXNG_URL`, `STREAM_STALL_TIMEOUT_MS` (360 s), `STREAM_FIRST_CHUNK_TIMEOUT_MS` (200 s), `SSE_KEEPALIVE_MS` (15 s), `FETCH_CONNECT_TIMEOUT_MS` (60 s), `CODEX_SSE_PEEK_TIMEOUT_MS`, `QODER_SSE_PEEK_*`, `GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS`, `DEFAULT_MAX_TOKENS` (64000), `DEFAULT_MIN_TOKENS`, `REASONING_MIN_OUTPUT_FLOOR`, `TOKEN_SAVER_HEADER`, `RETRY_CONFIG`, `DEFAULT_RETRY_CONFIG`, `resolveRetryEntry`, `SKIP_PATTERNS`; re-exports `ERROR_TYPES`, `DEFAULT_ERROR_MESSAGES`, `BACKOFF_CONFIG`, `COOLDOWN_MS` from `errorConfig.js` |
| `config/errorConfig.js` | Error taxonomy + cooldowns | `ERROR_TYPES`, `DEFAULT_ERROR_MESSAGES`, `BACKOFF_CONFIG`, `TRANSIENT_COOLDOWN_MS`, `MAX_RATE_LIMIT_COOLDOWN_MS`, `ERROR_RULES`, `COOLDOWN_MS` |
| `config/clientVersions.js` | Third-party client fingerprints | 255 lines — Claude/Codex/Copilot/Cursor/Antigravity/Gemini/Kiro/Trae/CodeBuddy/Grok/Kimchi/CommandCode/Zed/iFlow/Windsurf/OpenCode/Qoder versions + UAs. This is the anti-ban fingerprint source of truth used by app-side OAuth too |
| `config/appConstants.js` | OAuth endpoints + provider header/prompt constants | `OAUTH_ENDPOINTS`, `buildKimiHeaders`, `GITHUB_COPILOT`, `IDE_TYPE`/`PLATFORM`/`PLUGIN_TYPE`, `CLIENT_METADATA`, `CLAUDE_TOOL_SUFFIX`, `AG_TOOL_SUFFIX`, `CC_DEFAULT_TOOLS`, `AG_DEFAULT_TOOLS`, `ANTIGRAVITY_*`, `CLOUD_CODE_API`, `CLAUDE_SYSTEM_PROMPT`, `REFRESH_LEAD_MS`, `GEMINI_CLI_API_CLIENT`, `geminiCLIUserAgent` |
| `config/kiroConstants.js` | Kiro/CodeWhisperer protocol constants + thinking helpers | 428 lines; `resolveKiroModel`, `resolveKiroThinkingBudget`, `buildKiroAdditionalModelRequestFields`, `KIRO_AGENTIC_SYSTEM_PROMPT`, default profile ARNs |
| `config/codexInstructions.js` | `CODEX_DEFAULT_INSTRUCTIONS` | |
| `config/grokCli.js` | `GROK_CLI_MODEL`, `GROK_CLI_BASE_URL`, `supportsGrokCliReasoningEffort` | |
| `config/mediaConfig.js` | `MAX_IMAGE_BYTES`, `FETCH_TIMEOUT_MS`, `IMAGE_SIGNATURES`, `BLOCKED_HOSTS` | `BLOCKED_HOSTS` is the SSRF guard for media fetches |
| `config/ttsModels.js` | TTS model/voice tables | `TTS_MODELS_CONFIG`, `getTtsVoicesForModel`, `buildTtsProviderModels` |
| `config/googleTtsLanguages.js` | `GOOGLE_TTS_LANGUAGES` | |
| `config/ollamaModels.js` | `ollamaModels` | |
| `config/defaultThinkingSignature.js` | Hardcoded thinking signatures | 4 large base64 blobs |
| `config/models.js` | **Dead stub** | `MODEL_INFO = {}`, `getModelInfo` — zero importers |
| `config/constants.js` | (exists in inventory) | |

### 6.2 `utils/` (26 files)

| Path | Purpose |
| --- | --- |
| `proxyFetch.js` | **Patches global `fetch`** (`export default patchedFetch`, `:560`) with proxy/relay support; exports `proxyAwareFetch`, `getDefaultAgent`, `isLoopbackTarget`, `getEnvProxyUrl`, `__testing`. 560 lines. Loaded first by `open-sse/index.js:2` |
| `stream.js` | `createSSEStream`, `createSSETransformStreamWithLogger`, `createPassthroughStreamWithLogger`, `buildAbortedOpenAITerminalBytes`; re-exports `COLORS`/`formatSSE`/SSE headers. 828 lines — the actual SSE engine |
| `streamHandler.js` | `createStreamController` (abort/complete bookkeeping), `createDisconnectAwareStream`, `pipeWithDisconnect` (stall timeout, abort terminal bytes) |
| `streamHelpers.js` | `parseSSELine`, `hasValuableContent`, `fixInvalidId`, `formatSSE` |
| `sse.js` / `sseConstants.js` | `sseChunk`, `chatChunkSse` / `SSE_DONE`, `SSE_HEADERS`, `SSE_HEADERS_NO_BUFFER`, `SSE_HEADERS_CORS` |
| `error.js` | `errorResponse`, `createErrorResult`, `parseUpstreamError`, `formatProviderError`, `extractResetsAtMs`, `writeStreamError`, `withLocationGateHint`, `MAX_UPSTREAM_ERROR_BYTES` |
| `clientDetector.js` | `detectClientTool(headers, body)`, `isNativePassthrough(clientTool, provider)` |
| `bypassHandler.js` | `handleBypassRequest` — warmup/skip/`cc` naming short-circuits |
| `sessionManager.js` | `resolveSessionId`, `resolveSessionIdentity`, `resolveContinuationId`, `captureSessionId`, `deriveSessionId`, `generateBinaryStyleId`, `toNumericSessionId`, `clearSessionStore` |
| `claudeCloaking.js` | `cloakClaudeTools` / `decloakToolNames` / `decloakStreamChunk` / `applyCloaking` — anti-ban tool renaming |
| `toolCompressor.js` | `MAX_TOOL_NAME_LENGTH`, `compressSingleToolName`, `compressToolNames`, `decloakOpenAIChunk` |
| `toolDeduper.js` | re-exports `dedupeTools` (MCP-equivalence + same-name dedup) |
| `toolSchemaCompatibility.js` | `normalizeToolSchemasForProvider` |
| `cursorProtobuf.js` | 1047 lines: full protobuf encode/decode + Connect-RPC framing for Cursor |
| `cursorChecksum.js` | `generateHashed64Hex`, `generateSessionId`, `generateCursorChecksum`, `buildCursorHeaders` |
| `kiroSessionReplay.js` | `applyKiroSessionReplay`, `clearKiroSessionReplayStore` |
| `ollamaTransform.js` | `transformToOllama` |
| `usageTracking.js` | `normalizeUsage`, `canonicalizeUsage`, `extractUsage`, `mergeUsage`, `estimateUsage`, `filterUsageForFormat`, `addBufferToUsage`, `formatUsage`, `logUsage`, `COLORS` |
| `requestLogger.js` | `createRequestLogger`, `maskSensitiveHeaders`, `safePayloadMetadata` |
| `reasoningContentInjector.js` | `injectReasoningContent` (provider-scoped reasoning injection) |
| `responsesStreamHelpers.js` | `getOpenAIResponsesEventName`, `isOpenAIResponsesTerminalEvent`, `buildAbortedResponsesTerminalBytes`, `formatIncompleteOpenAIResponsesStreamFailure` |
| `claudeSignature.js` | `hasClaudeSignaturePrefix`, `isValidClaudeSignature` |
| `codexToolSchema.js` | `hasUnicodePropertyEscape`, `stripCodexUnsupportedPatterns` |
| `modelMarkers.js` | `stripModelContextMarker` |
| `debugLog.js` | `dbg`, `isDebugEnabled` |

### 6.3 `shared/` (6 files) — cross-provider auth/identity

`clineAuth.js` (`getClineAccessToken`, `getClineAuthorizationHeader`,
`buildClineHeaders`), `machineId.js` (`getConsistentMachineId`, salted machine
fingerprint), `zedAuth.js` (421 lines: Zed keypair encode/decode, callback
parsing, RSA-decrypt of the access token, LLM-token exchange, usage/model
resolution), `qoder/constants.js` (endpoints, RSA public key, model map),
`qoder/cosy.js` (`generateMachineId`, `buildCosyHeaders`),
`qoder/encoding.js` (`qoderEncodeBody` — the `&Encode=1` WAF-bypass encoder).
`src/lib/qoder/*` and `src/shared/utils/clineAuth.js` are pure re-export shims
into here, i.e. qoder/cline logic has been fully moved engine-side.

### 6.4 `services/` (35 files)

| Path | Purpose | Side |
| --- | --- | --- |
| `services/model.js` | `parseModel` (`provider/model` split + alias resolution via the registry), `resolveProviderAlias`, `resolveModelAliasFromMap`, `getModelInfoCore` | engine (called app-side) |
| `services/provider.js` | `detectFormat(body)`, `getTargetFormat`, `resolveTransport`, `resolveOpenAICompatibleApiType`, `normalizeThinkingConfig`, `isLastMessageFromUser`, `hasThinkingConfig` | engine |
| `services/accountFallback.js` | Cooldowns/backoff, `checkFallbackError`, `isPermanentAuthDenial` + `PERMANENT_AUTH_DENIAL_TEXTS`, model locks (`MODEL_LOCK_PREFIX`, `getModelLockKey`, `buildModelLockUpdate`), `filterAvailableAccounts`, `applyErrorState`. 351 lines | engine, driven by `src/sse/handlers/chat.js` |
| `services/combo.js` | 1073 lines: `handleComboChat`, `handleFusionChat`, `getRotatedModels`, `detectRequiredCapabilities`, `reorderByCapabilities`, `peekStreamForContent`, `stripMultimodalContent`, `resetComboRotation`, `getComboModelsFromData` | engine (orchestrated app-side) |
| `services/compact.js` | **Dead duplicate** of two combo functions | engine |
| `services/capacityAdapter.js` | `getCapacityAdapterConfig/Models/Strategy`, `withCapacityAdapterStripping`, `stripHistoryForContext` | engine |
| `services/tokenRefresh.js` | Barrel + `refreshWithRetry`, `getAccessToken`, `refreshTokenByProvider`, `formatProviderCredentials`, `getAllAccessTokens`, `getRefreshLeadMs`, `isUnrecoverableRefreshError`, `parseVertexSaJson`, `refreshVertexToken`, `TOKEN_EXPIRY_BUFFER_MS` | engine |
| `services/tokenRefresh/providers.js` | 711 lines of per-provider OAuth refreshers (xai, kimi, cline, claude, google, codex, kiro, iflow, github, copilot, codebuddy cn/intl, trae, zed, windsurf) + `classifyOAuthRefreshError` | engine |
| `services/tokenRefresh/dedup.js` | `dedupRefresh`, `getRefreshProxyKey` — collapses concurrent refreshes | engine |
| `services/oauthCredentialManager.js` | `shouldRefreshCredentials`, `refreshProviderCredentials`, `mergeRefreshedCredentials`, `withCredentialRefreshLock`, `parseTimeMs`, `isCodexRefreshStale`, `CODEX_MAX_REFRESH_AGE_MS` | engine |
| `services/usage.js` + `usage/` (20 files) | `getUsageForProvider` + per-provider quota probes: `claude`, `codex`, `github`, `google` (gemini+antigravity), `grok-cli` (+ `grokCliQuotaFrame.js` binary frame decoder), `glm`, `groq`, `deepseek`, `kimi`, `kiro`, `minimax`, `zed`, `codebuddy-cn`, `misc` (iflow, ollama, vercel-ai-gateway, qoder), `shared` (`U()`, `parseResetTime`, `fetchWithTimeout`) | engine, consumed by app |
| `services/projectId.js` | Google Cloud project-id resolution + cache/TTL sweeper (`startCacheCleanup`, `stopCacheCleanup`) | engine |
| `services/{kiro,kimchi,qoder,cursor,copilot,clinepass,grokCli}Models.js` | Live model-catalog resolvers with explicit `clear*Cache()` invalidation | engine, consumed by `/v1/models` |

`services/usage.js` and `services/usage/*` are the only files in this directory
that are essentially app-facing (they exist to feed the dashboard's quota view),
but they are still pure engine code with no Next.js imports.

### 6.5 `transformer/` (2 files)

- `transformer/responsesTransformer.js` (555 lines) —
  `createResponsesApiTransformStream(logger, options)`: **Chat Completions SSE →
  Codex/Responses API SSE**. `createResponsesLogger(model, logsDir)` writes a
  debug log to disk.
- `transformer/streamToJsonConverter.js` (57 lines) —
  `convertResponsesStreamToJson(stream)`: Responses SSE → a single JSON object.

Importers: `handlers/responsesHandler.js:8-9`, and
`handlers/chatCore/{nonStreamingHandler.js:12, sseToJsonHandler.js:2}` for the
converter; `createResponsesApiTransformStream` is used only by
`responsesHandler.js:8`. Four test files import them directly.

### 6.6 `rtk/` (33 files) — the token saver, and its fail-open contract

`rtk/` is a port of an upstream Rust tool. It is a set of **pre-dispatch,
in-place body mutators** invoked from `chatCore.js:296-341`; nothing in `rtk/`
talks to the network except `headroom.js` (external compress proxy) and
`pxpipe.js` (injected transform).

| Path | Purpose |
| --- | --- |
| `rtk/index.js` | `compressMessages(body, enabled)` — compresses `tool_result` content in place across OpenAI (`role:"tool"`, string + array), Claude (`content[].type === "tool_result"`, string + array), OpenAI Responses (`function_call_output` / `custom_tool_call_output`, string + `input_text[]`) and Kiro (`conversationState.history/currentMessage → toolResults[].content[].text`). Also `formatRtkLog` |
| `rtk/constants.js` | `RAW_CAP` (10 MiB), `MIN_COMPRESS_SIZE` (500 B), `DETECT_WINDOW`, per-filter caps, `FILTERS` |
| `rtk/autodetect.js` | `autoDetectFilter(text)` — content sniffing: cargo/pytest/go/mypy/git log/diff/status/build output/grep/vitest/find/tree/ls/search-list/json/dedup/smart-truncate, then user TOML filters last |
| `rtk/registry.js` | `resolveFilter(name)`, `allFilters()` — used **only by tests** (`tests/unit/rtk-upstream-sync.test.js:10`) |
| `rtk/applyFilter.js` | `safeApply(fn, text)` — the catch_unwind equivalent |
| `rtk/filters/*.js` (20) | Per-tool compressors: `buildOutput`, `cargoTest`, `dedupLog`, `env`, `find`, `gitDiff`, `gitLog`, `gitStatus`, `goTest`, `grep`, `jsonCompact`, `ls`, `mypy`, `pytest`, `readNumbered`, `searchList`, `smartTruncate`, `tree`, `truncate`, `vitest` |
| `rtk/tomlEngine.js` | Minimal TOML parser + `applyTomlFilter`; `BUILTIN_FILTER_DIR` = `rtk/custom-filters`; also scans `$RTK_FILTERS_DIR` and `$DATA_DIR/rtk-filters`; `loadTomlFilters()` caches by directory signature |
| `rtk/custom-filters/*.toml` (10) | `brew-install`, `df`, `du`, `gcc`, `jq`, `make`, `ollama`, `ps`, `systemctl-status`, `terraform-plan` |
| `rtk/headroom.js` | `compressWithHeadroom(body, opts)` — external `/v1/compress` proxy. Projects Claude / OpenAI-Responses / Kiro / Gemini bodies to `messages[]`, compresses, copies back in place. Also `formatHeadroomLog`, `formatHeadroomSizeLog`, `isHeadroomPhantomSavings` |
| `rtk/pxpipe.js` | `compressWithPxpipe(body, {transform})` — renders bulky Claude-format text as PNGs via an injected `transformAnthropicMessages` |
| `rtk/systemInject.js` | `injectSystemPrompt(body, format, prompt)` — format-dispatching system-prompt appender (used by caveman + ponytail) |
| `rtk/caveman.js` + `cavemanPrompts.js` | `injectCaveman` + `CAVEMAN_LEVELS`/`CAVEMAN_PROMPTS` |
| `rtk/ponytail.js` + `ponytailPrompt.js` | `injectPonytail` + `PONYTAIL_LEVELS`/`PONYTAIL_PROMPTS` |

**The fail-open contract, concretely.** The rule is: *any error returns null /
leaves the body untouched; never throw out of an `rtk/` hook.* The mechanisms:

- `applyFilter.js:3-14` — `safeApply` wraps every filter invocation in
  `try/catch` and returns the **original text** on throw, with a `console.warn`.
  Filters marked with `filterName` get named in the warning.
- `rtk/index.js:83-86` — `compressMessages`'s whole loop is inside `try { … }
  catch (e) { console.warn("[RTK] compressMessages error:", e.message); return null; }`.
- `rtk/index.js:113-116` — `compressKiroFormat` has the same wrapper.
- `rtk/index.js:138-141` — a second safety net: an empty or *larger* output is
  discarded and the original text returned.
- `systemInject.js:11-59` — `injectSystemPrompt` wraps everything in
  `try { … } catch (_) { /* fail-open */ }`, and **every individual assignment**
  is itself wrapped (`:92, 126, 138, 145, 146, 149, 172, 177, 195, 206, 210, 211,
  214, 225, 229, 236, 240, 244, 254, 256, 259, 262, 265, 297`) so a frozen or
  proxied body object cannot abort the request.
- `headroom.js:400-485` — one outer `try`; the `catch` at `:482-485` records a
  diagnostic and `return null`. Every early-exit path returns `null`. Claude
  write-back is guarded by shape checks (`:406, :413-414`), Responses by
  `applyResponsesHeadroomMessages` returning falsy (`:431`).
- `pxpipe.js:45-97` — outer `try`; `catch` returns `skipped("transform_error")`.
  A timeout resolves to `null` via `Promise.race` (`:50-58`) and the *input body
  is never mutated* (`:49` comment). Only on success is a **new** body returned
  and reassigned in `chatCore.js:338`.
- `pxpipe.js:12-18` — `bodyChars` has its own `try` around `JSON.stringify`
  (circular bodies return 0).

**Deviations from fail-open, and other observations:**

1. `rtk/index.js:8-21` returns before entering the `try` for malformed input —
   fine. But the two `catch` blocks **mutate `stats` partially**: a throw
   mid-loop leaves already-compressed earlier messages compressed while the
   function returns `null`. The body is therefore not "untouched" on a partial
   failure — the contract is only honoured for the failing element onwards.
   This is benign (compression is lossy-but-safe by design) but is not what the
   doc claims.
2. **`headroom.js` and `pxpipe.js` mutate the body in place on success**
   (`headroom.js:413-414, 479`; `systemInject.js` for caveman/ponytail).
   AGENTS.md:41 ("mutate the request body in-place and are fail-open: any error
   returns null and leaves the body untouched") is precise — the "untouched"
   guarantee applies to the error path only. Worth stating explicitly because
   `chatCore.js:299-341` chains five mutators over the same object with no
   snapshot/rollback between them.
3. `rtk/registry.js` is dead in production — only a test imports it.
   `autoDetectFilter` imports the filter modules directly.
4. `rtk/headroom.js` writes back into the live `body` object, and
   `chatCore.js:305` passes the **translated** body — so Headroom operates
   post-translation, whereas the `rtk/index.js` comment (`:2`) still says
   "Injected at the top of translateRequest". It is not; it is called after.
5. `systemInject.js` dispatches on **actual wire shape first** (`instructions` →
   `messages[]` → `input[]`) and only then on the format label, with an explicit
   comment that Gemini/Claude fall through to a label-based path. Two
   overlapping dispatch strategies in one function is a maintenance hazard.
6. `rtk/tomlEngine.js` executes **user-supplied regexes from
   `$RTK_FILTERS_DIR` / `$DATA_DIR/rtk-filters`**; bad patterns are mapped to the
   never-match regex `/^$/` (`:179`) and substitutions are skipped (`:215`),
   which is the right call, but the parser is a hand-rolled TOML subset
   (`parseFilterToml`) — malformed user files are silently skipped (`:267, :286`).

---

## 7. Complete file inventory (by directory, counts)

| Directory | Files | Contents |
| --- | --- | --- |
| `open-sse/` | 4 | `index.js`, `package.json`, `AGENTS.md`, `.npmignore` |
| `open-sse/config/` | 16 | constants + 2 helper modules + `models.js` stub |
| `open-sse/executors/` | 28 | `base.js`, `default.js`, `index.js`, 25 provider executors |
| `open-sse/handlers/` | 7 top-level + 52 total | chatCore + 5 media cores + responsesHandler; subdirs `chatCore/` (6), `embeddingProviders/` (6), `fetch/` (1), `imageProviders/` (15), `search/` (4), `ttsProviders/` (13) |
| `open-sse/providers/` | 142 | 11 top-level, `registry/` 123, `metadata/` 5, `models/` 3 |
| `open-sse/rtk/` | 33 | 15 `.js` at root, `filters/` 20, `custom-filters/` 10 `.toml` |
| `open-sse/services/` | 35 | 12 top-level, `tokenRefresh/` 3, `usage/` 20 |
| `open-sse/shared/` | 6 | 4 top-level, `qoder/` 3 (minus overlap) |
| `open-sse/transformer/` | 2 | responsesTransformer, streamToJsonConverter |
| `open-sse/translator/` | 51 | `index.js`, `formats.js`, `request/` 12, `response/` 10, `concerns/` 17, `formats/` 5, `schema/` 5 |
| `open-sse/utils/` | 26 | see §6.2 |
| **Total `.js`** | **392** | plus 10 `.toml` |

---

## 8. Risks, gotchas, dead code, duplicated logic

### 8.1 Correctness / fragility

1. **Registry hides three executors; wiring them naively crashes.**
   *(Correction, second pass 2026-10-13: the original "123 bindings, array omits three"
   framing was wrong — the import **and** array lines for `p102` (trae), `p104`
   (windsurf), `p114` (devin-cli) are **both commented out**
   (`registry/index.js:105,116-117,229,240-241`). The module loads fine; no dangling
   references.)*
   The real hazard: those three have live, fully-exported executors
   (`executors/index.js:22,57,58`) while their registry entries are hidden, so `trae`,
   `windsurf` and `devin-cli` are **unreachable through
   alias resolution** (`services/model.js`) and are absent from `PROVIDERS` /
   `PROVIDER_MODELS` / `PROVIDER_OAUTH` / `PROVIDER_MEDIA`. A request
   routed to `trae` by a hard-coded provider id reaches
   `new TraeExecutor()` → `super("trae", PROVIDERS.trae)` with
   `PROVIDERS.trae === undefined` (`executors/trae.js:46-48`), so
   `BaseExecutor.config` is `undefined` and `getBaseUrls()` (`base.js:23-25`)
   throws on `this.config.baseUrls`. `windsurf` (`:376`, has a `|| {…}` fallback)
   and `devin-cli` (`:311`, own literal config) survive. `getTargetFormat` also
   falls back to `openai` for all three. The comments say "hidden", but nothing
   gates them — the registry files and executors are live code. Treat this as
   either intentional hidden wiring with a latent null-config hazard, or as
   generator/array drift. `devin-cli` is additionally the one executor that
   spawns a local process with filesystem/shell access.
2. **`export default` in a barrel.** `providers/registry/index.js` mixes
   `import pN` (default imports) with `export default [...]`. The current
   consumers use default imports, so it works, but the file is documented as an
   auto-generated *static import list* and adding a *named* import of `REGISTRY`
   anywhere would throw at module load (`SyntaxError: does not provide an export
   named 'REGISTRY'`). Easy trap, high blast radius (the registry is imported by
   dashboard components and API routes).
3. **Two `PROVIDERS` import paths.** `config/providers.js` (barrel) and
   `providers/index.js` (builder) are both imported across the codebase
   (`chatCore.js:11` uses `config/providers.js`, `translator/index.js:12` uses
   `providers/index.js`). They evaluate to the same object, but `PROVIDER_MEDIA`
   is only exported from the latter.
4. **`PROVIDER_DEFAULTS` / `resolveProvider()` in `providers/schema.js` are
   unwired** — confirmed by grep: `resolveProvider` has no caller outside its
   own file, and only `PROVIDER_DEFAULTS.format` is read (by
   `providers/index.js:14`). The schema file's own comment admits this
   (`schema.js:42-43`). Everything else documented there (defaults for
   `auth`, `retry`, `timeoutMs`, `headers`, `quirks`, `executor`, and all of
   `ENDPOINT_DEFAULTS`) is documentation, not behaviour. `transport.executor` is
   never read by `getExecutor` either — grep for `executor:` in
   `providers/registry/*.js` returns nothing.
5. **Executor aliases lack registry/detection support.** `cu`, `gcli`, `gb` are
   executor-only keys. `gcli` *is* resolvable to `grok-cli` via the registry
   alias list (used at `services/model.js:21` for the builtin model alias), but
   `gb` and `cu` have no registry entry and no alias mapping → `getExecutor("gb")`
   would return a `DefaultExecutor`, not the `GrokCliExecutor` the map intends.
   Triple-instantiating `GrokCliExecutor` (`:44-46`) is harmless but wasteful.
6. **`chatCore` retry after refresh is fire-and-forget on failure.**
   `chatCore.js:488-493`: the retry result is only adopted `if (retryResult.response.ok)`;
   a non-ok retry, or a throw, leaves the *original* 401/403 `providerResponse`
   in place and the original error text is reported. The `catch` logs at `warn`
   only.
7. **`handleForcedSSEToJson` fall-through** (`chatCore.js:535-546`): a `null`
   return intentionally falls into the `!stream` branch. Any future change that
   makes it return `false`/`undefined` for a different reason silently changes
   the response mode.
8. **`streamingHandler` clamps upstream error HTML by stripping tags**
   (`:109-111`) and the code comments note "the UI may render error.message as
   HTML". The sanitisation is `replace(/<[^>]*>/g, "")` + 160-char slice, which
   blocks tag injection but not HTML entity-encoded payloads or markdown-rendered
   links. Worth a look given the explicit XSS-adjacent comment.
9. **`anchorClaudeCache` is order-dependent** (`chatCore.js:348-350`): every
   token saver runs before it. Adding a new saver after that line silently
   invalidates the prompt-cache prefix.
10. **Shallow `credentials.runtimeTransport` mutation** (`chatCore.js:116-119`):
    the object handed in is mutated (and the key *deleted* when absent) so that
    executors/builders can see the per-request endpoint. Since `chat.js` reuses
    `credentials` across the account loop, any code path that throws between
    `:117` and the executor call leaves a stale transport on the shared object.
11. **`stripContinuityFields` runs only on the translated path** (`:239`), not
    the passthrough path (`:196-221`). A Responses→Chat stash reaching a
    passthrough provider is therefore not stripped. (The comment at `:46-54`
    describes the Chat-native 400 this guards against.)

### 8.2 Duplicated logic

1. **`openAICompletionToClaudeMessage` exists in three places**:
   `handlers/chatCore/nonStreamingHandler.js:81` and
   `handlers/chatCore/sseToJsonHandler.js:51` are near-identical hand-rolled
   copies; `translator/response/openai-to-claude.js` is the registered
   equivalent. The two handler copies diverge slightly (reasoning extraction
   from `provider_specific_fields`, tool-name fallback `fn.name || toolCall.name`).
2. **`convertGeminiParts` / `appendGeminiToolCalls` / `buildGeminiToolCall`**
   in `nonStreamingHandler.js:24-69` re-implement Gemini→OpenAI tool-call
   conversion that `translator/response/gemini-to-openai.js` and
   `translator/concerns/thoughtSignature.js` already provide.
3. **`extractResetsAtMs` is exported twice** — `services/accountFallback.js:25`
   and `utils/error.js:91` — with different implementations, and both are on the
   401/403 and error paths.
4. **`getComboModelsFromData` and `handleComboChat` exist in both
   `services/combo.js:390,556` and `services/compact.js:11,34`.**
   `services/compact.js` has **zero importers** — it is dead code, and it is the
   *simpler* older implementation (no capabilities, no rotation, no fusion).
5. **Two parallel "small-fallback" URLs in `BaseExecutor`** (`buildUrl` at `:31`,
   used only if a subclass does not override) vs `DefaultExecutor.buildUrl`
   (`:136`) which is a superset. Any subclass extending `BaseExecutor` directly
   (kiro, codex, cursor, github, vertex, iflow, antigravity, opencode, trae,
   grok-*, perplexity-web, windsurf, qoder, mimo-free, devin-cli, gemini-cli)
   loses the runtime-transport / compatible-node / gemini-format branches unless
   it re-implements them. Several do (kiro `:318`, codex `:238`, opencode `:242`,
   vertex `:66`), which is why the same logic appears ~6 times.
6. **Auth header construction appears twice**: `BaseExecutor.buildHeaders`
   (`:47-77`) and `DefaultExecutor.buildHeaders`/`applyAuth` (`:52-68, :190-275`).
   The `BaseExecutor` version still contains the older
   `anthropic-compatible-*` handling; both are reachable depending on the
   subclass.

### 8.3 Dead code / vestigial

1. `services/compact.js` — no importers.
2. `rtk/registry.js` (`resolveFilter`, `allFilters`) — test-only.
3. `config/models.js` (`MODEL_INFO`, `getModelInfo`) — no importers.
4. `providers/schema.js` `resolveProvider()` + `ENDPOINT_DEFAULTS` — no importers.
5. `providers/REGISTRY_TEMPLATE.js` — not imported (by design), and lives in
   `providers/` while both generator scripts disagree about whether the registry
   directory is `open-sse/providers/registry` or `scripts`
   (`scripts/migrate-registry.mjs:15` vs `scripts/injectDisplayToRegistry.mjs:13`).
6. `hasSpecializedExecutor` — exported from the barrel, no caller.
7. `translator/index.js:193-200` — commented-out Antigravity cloaking block;
   `AntigravityExecutor.cloakTools` (`executors/antigravity.js:647`) has no
   caller.
8. `FORMATS.OPENAI_RESPONSE` and `FORMATS.CODEX` — only referenced by
   `concerns/modality.js:156-157` and `utils/usageTracking.js:106`; no translator
   registers them.
9. `open-sse/index.js` exports `errorResponse`, `formatProviderError`,
   `createStreamController`, `pipeWithDisconnect`,
   `createDisconnectAwareStream`, `createSSETransformStreamWithLogger`,
   `createPassthroughStreamWithLogger` — only `getExecutor` is consumed from the
   barrel.

### 8.4 Security-relevant observations

(Read-only audit; no changes made. These are observations, not verified exploits.)

1. **`utils/proxyFetch.js` patches global `fetch` at import time** and is loaded
   by `open-sse/index.js:2`, which several app routes import for side effects.
   Any code that assumes a pristine `globalThis.fetch` (including the ~50 bare
   `fetch(...)` call sites still present in `handlers/`, listed in §6.2's grep)
   is affected by that patch but by nothing else — those call sites therefore
   **ignore per-connection proxy settings** (`proxyOptions`). `handlers/fetch`
   (the URL-fetch tool) is the most exposed: it does use bare `fetch` with
   `redirect:"manual"` and `sanitizeHeaders`, plus `getEnvProxyUrl`, but not the
   connection-scoped proxy. Worth confirming whether that is intended.
2. **SSRF surface**: `handlers/fetch/index.js` (user-supplied URL) and
   `utils/proxyFetch.js`'s `isLoopbackTarget`/`getEnvProxyUrl` are the guards;
   `config/mediaConfig.js` `BLOCKED_HOSTS` covers media only. `handlers/videoCore.js:102`
   uses bare `fetch` for a user-supplied URL.
3. **Credential handling**: token refresh mutates the caller's `credentials`
   object in place (`chatCore.js:476-483`) and `runtimeTransport` /
   `rawHeaders` / `_clientSessionId` are stashed on the same object
   (`:117`, `:177`, `translator/index.js:106`). `rawHeaders` holds the full raw
   client header map and is read by `DefaultExecutor.readClientHeader` (allowlisted
   usage) but is also reachable from every translator. There is no redaction
   between the client and the engine.
4. **`requestLogger.js`** exposes `maskSensitiveHeaders`; confirm every write
   path (`reqLogger.logTargetRequest`, `logClientRawRequest`) goes through it —
   `logClientRawRequest` (`chatCore.js:167`) passes the raw client headers.
5. **Long-lived process-local state**: `rejectedBetaByConnection`
   (`default.js:16`, unbounded `Map` keyed by connection/api-key), the executor
   `defaultCache` (`executors/index.js:61`), `canonicalSessionCache`
   (`opencode.js:34`, capped at 1000), `projectIdCache` (`vertex.js`). Only the
   opencode one has a stated cap.

### 8.5 Doc drift (ARCHITECTURE.md / AGENTS.md vs code)

- `docs/ARCHITECTURE.md` §"Provider Executor Coverage" lists **6** specialized
  executors. There are **25** (30 registry keys incl. aliases).
- `docs/ARCHITECTURE.md` §"Format Translation Coverage" omits `ollama`,
  `commandcode`, `vertex` and the `claude:kiro` / `kiro:claude` direct routes.
- `open-sse/AGENTS.md:7` describes the lifecycle as `handleChatCore` →
  `services/model.js parseModel` → pre-translate hooks → `getExecutor(provider)` →
  `translateRequest` → `execute` → `translateResponse`. Against the code:
  `parseModel` runs **app-side**, in `src/sse/handlers/chat.js:195` (via
  `src/sse/services/model.js`), before `handleChatCore` is entered. The order of
  `getExecutor` (`chatCore.js:352`) vs `translateRequest` (`:224`) is reversed in
  the doc. And the token-saving hooks (`:299-341`) run **after** `translateRequest`,
  not before it — which is why `rtk/index.js:2`'s comment "Injected at the top of
  translateRequest (before any format translation)" is also stale. The same
  AGENTS.md line omits `stripContinuityFields`, the tool dedup/normalisation pass
  and the token-refresh retry, all of which sit in the chain.
- `open-sse/AGENTS.md:14-15` describes `providers/` as "registry build +
  `capabilities.js` + `pricing.js`. Entry: `index.js` (`PROVIDERS`)" — true, but
  `providers/index.js` also builds `PROVIDER_MODELS`, `PROVIDER_OAUTH` and
  `PROVIDER_MEDIA`, and the latter two are undocumented there. The same section
  describes `handlers/chatCore/` as "streaming/non-streaming/sse-to-json"
  handlers — accurate, but it omits `streamMode.js`, `requestDetail.js` and
  `jsonCompletionOutcome.js`. `config/models.js` is not mentioned at all (it is
  dead); `transformer/`'s `streamToJsonConverter.js` is mentioned but its
  `responsesTransformer.js` consumer set is not.
- `open-sse/AGENTS.md:40` says the special binary formats "don't round-trip
  through OpenAI — handle in their executor". Accurate for kiro/cursor/
  commandcode/windsurf/zed/devin-cli; note `commandcode.js:67` **does** report
  `responseFormat: FORMATS.OPENAI`, i.e. it normalises *into* OpenAI rather than
  bypassing it.
- `open-sse/AGENTS.md:38` calls the OpenAI bridge "lossy (thinking, non-base64
  images, tool ids, is_error)" — the code backs this with a large amount of
  compensating machinery (`concerns/thinkingUnified.js`, `concerns/thoughtSignature.js`,
  `concerns/image.js`, `utils/toolCompressor.js`), which is where most of the
  engine's real complexity lives.

---

## 9. Quick reference — the call chain in one block

```
POST /v1/chat/completions
└─ src/sse/handlers/chat.js:195   getModelInfo (parseModel / combo)
   └─ :288  while(true)  account-selection + fallback loop
      └─ :336 handleChatCore({...})
         ├─ :86   detectFormat(body)                          services/provider.js:34
         ├─ :101  resolveTransport(provider, sourceFormat)     services/provider.js:148
         ├─ :112  targetFormat = transport | model.targetFormat | provider.format
         ├─ :137  clientRequestedStreaming                     chatCore/streamMode.js:15
         ├─ :154  detectClientTool / isNativePassthrough       utils/clientDetector.js
         ├─ :183  stripUnsupportedModalities                   concerns/modality.js
         ├─ :188  prefetchRemoteImages                         concerns/prefetch.js
         ├─ :224  translateRequest(source,target,model,body…)   translator/index.js:69
         │        ├─ compressToolNames / stripContentTypes / normalizeThinkingConfig
         │        ├─ ensureToolCallIds / fixMissingToolResponses (skipped for KIRO)
         │        ├─ captureThinking + captureSessionId
         │        ├─ direct route  requestRegistry["claude:kiro"]
         │        └─ else  source→openai→target
         ├─ :245  dedupeTools                                  utils/toolDeduper.js
         ├─ :252  normalizeToolSchemasForProvider              utils/toolSchemaCompatibility.js
         ├─ :299  compressMessages                             rtk/index.js:8      (fail-open)
         ├─ :305  compressWithHeadroom                         rtk/headroom.js:385 (fail-open)
         ├─ :320  injectCaveman / :326 injectPonytail          rtk/systemInject.js (fail-open)
         ├─ :333  compressWithPxpipe                           rtk/pxpipe.js:32    (fail-open)
         ├─ :349  anchorClaudeCache                            translator/formats/claude.js
         ├─ :352  getExecutor(provider)                        executors/index.js:63
         ├─ :418  executor.execute({…})                        executors/base.js:101
         ├─ :459  if 401/403 and !noAuth and !permanentDenial:
         │        refreshWithRetry(executor.refreshCredentials, 3) → one execute retry
         ├─ :536  handleForcedSSEToJson   (forceStream providers)  chatCore/sseToJsonHandler.js
         ├─ :543  handleNonStreamingResponse                    chatCore/nonStreamingHandler.js
         └─ :550  handleStreamingResponse                       chatCore/streamingHandler.js:89
                  └─ buildTransformStream → utils/stream.js:799 / :817
                     └─ pipeWithDisconnect → utils/streamHandler.js:273
                        └─ SSE to client (translateResponse per chunk)
```
