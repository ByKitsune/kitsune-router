# ZenRouter Architecture

_Last updated: 2026-10-18_

## Executive Summary

ZenRouter is a local AI routing gateway and dashboard built on Next.js.
It provides a single OpenAI-compatible endpoint (`/v1/*`) and routes traffic across multiple upstream providers with translation, fallback, token refresh, and usage tracking.

Core capabilities:

- OpenAI-compatible API surface for CLI/tools
- Request/response translation across provider formats
- Model combo fallback (multi-model sequence)
- Account-level fallback (multi-account per provider)
- OAuth + API-key provider connection management
- Local persistence for providers, keys, aliases, combos, settings, pricing
- Usage/cost tracking and request logging
- Optional cloud sync for multi-device/state sync

Primary runtime model:

- Next.js app routes under `src/app/api/*` implement both dashboard APIs and compatibility APIs
- A shared SSE/routing core in `src/sse/*` + `open-sse/*` handles provider execution, translation, streaming, fallback, and usage

## Scope and Boundaries

### In Scope

- Local gateway runtime
- Dashboard management APIs
- Provider authentication and token refresh
- Request translation and SSE streaming
- Local state + usage persistence
- Optional cloud sync orchestration

### Out of Scope

- Cloud service implementation behind `NEXT_PUBLIC_CLOUD_URL`
- Provider SLA/control plane outside local process
- External CLI binaries themselves (Claude CLI, Codex CLI, etc.)

## High-Level System Context

```mermaid
flowchart LR
    subgraph Clients[Developer Clients]
        C1[Claude Code]
        C2[Codex CLI]
        C3[OpenClaw / Droid / Cline / Continue / Roo]
        C4[Custom OpenAI-compatible clients]
        BROWSER[Browser Dashboard]
    end

    subgraph Router[ZenRouter Local Process]
        API[V1 Compatibility API\n/v1/*]
        DASH[Dashboard + Management API\n/api/*]
        CORE[SSE + Translation Core\nopen-sse + src/sse]
        DB[(SQLite data.sqlite)]
        UDB[(SQLite usageHistory)]
    end

    subgraph Upstreams[Upstream Providers]
        P1[OAuth Providers\nClaude/Codex/Gemini/Qwen/iFlow/GitHub/Kiro/Cursor/Antigravity]
        P2[API Key Providers\nOpenAI/Anthropic/OpenRouter/GLM/Kimi/MiniMax]
        P3[Compatible Nodes\nOpenAI-compatible / Anthropic-compatible]
    end

    subgraph Cloud[Optional Cloud Sync]
        CLOUD[Cloud Sync Endpoint\nNEXT_PUBLIC_CLOUD_URL]
    end

    C1 --> API
    C2 --> API
    C3 --> API
    C4 --> API
    BROWSER --> DASH

    API --> CORE
    DASH --> DB
    CORE --> DB
    CORE --> UDB

    CORE --> P1
    CORE --> P2
    CORE --> P3

    DASH --> CLOUD
```

## Core Runtime Components

## 1) API and Routing Layer (Next.js App Routes)

Main directories:

- `src/app/api/v1/*` and `src/app/api/v1beta/*` for compatibility APIs
- `src/app/api/*` for management/configuration APIs
- Next rewrites in `next.config.mjs` map `/v1/*` to `/api/v1/*`

Important compatibility routes:

- `src/app/api/v1/chat/completions/route.js`
- `src/app/api/v1/messages/route.js`
- `src/app/api/v1/responses/route.js`
- `src/app/api/v1/models/route.js`
- `src/app/api/v1/messages/count_tokens/route.js`
- `src/app/api/v1beta/models/route.js`
- `src/app/api/v1beta/models/[...path]/route.js`

Management domains:

- Auth/settings: `src/app/api/auth/*`, `src/app/api/settings/*`
- Providers/connections: `src/app/api/providers*`
- Provider nodes: `src/app/api/provider-nodes*`
- OAuth: `src/app/api/oauth/*`
- Keys/aliases/combos/pricing: `src/app/api/keys*`, `src/app/api/models/alias`, `src/app/api/combos*`, `src/app/api/pricing`
- Usage: `src/app/api/usage/*`
- Sync/cloud: `src/app/api/sync/*`, `src/app/api/cloud/*`
- CLI tooling helpers: `src/app/api/cli-tools/*`

## 2) SSE + Translation Core

Main flow modules:

- Entry: `src/sse/handlers/chat.js`
- Core orchestration: `open-sse/handlers/chatCore.js`
- Provider execution adapters: `open-sse/executors/*`
- Format detection/provider config: `open-sse/services/provider.js`
- Model parse/resolve: `src/sse/services/model.js`, `open-sse/services/model.js`
- Account fallback logic: `open-sse/services/accountFallback.js`
- Translation registry: `open-sse/translator/index.js`
- Stream transformations: `open-sse/utils/stream.js`, `open-sse/utils/streamHandler.js`
- Usage extraction/normalization: `open-sse/utils/usageTracking.js`

### Cursor AgentService input and tool handoff

Cursor chat execution uses the bidirectional HTTP/2 `agent.v1.AgentService/Run` transport, not the retired outgoing ChatService route. The request translator detaches mutable caller-owned containers and retains typed media, tool-call IDs, arguments and results. Native history is rebuilt from the supplied conversation on each API request, so client-side compaction does not depend on an older cached transcript.

- Current user images use `UserMessage.selected_context` → `SelectedContext.selected_images` → `SelectedImage.data` **bytes**, with MIME and UUID. Remote images use the shared hardened image fetch helper before serialization; an unresolved image fails rather than becoming prose or a missing attachment. Inline images require no upload service. The official client does not require dimensions on this path.
- Prior user/tool images use the distinct `ConversationHistoryImageContent` image variant: its `data` field is a **string** carrying base64, with a separate MIME field. This is native typed image content, not text containing base64. Assistant calls and tool results retain their original IDs and native roles. Calls/results after the last user turn travel in `trailing_conversation_history`.
- Declared client tools are advertised as native MCP tools. An MCP execution request is handed to the requesting client as Chat `tool_calls`, with `finish_reason: "tool_calls"`; an announced parallel batch is collected before ending the response. The upstream run closes without a fabricated MCP success/error. A subsequent API request supplies the actual client-executed results through typed history. Context and MCP allowlist-precheck replies preserve native execution correlation; prechecks allow only this request's declared tool names for the gateway's MCP provider. The gateway does not execute IDE tools, and unsupported IDE requests remain explicit errors.
- `tool_choice: "none"` disables native tool declarations, precheck authorization and execution handoff; omitted/`"auto"` retains automatic selection. Required/named choices have no verified native mapping and return `unsupported_parameter` before dialing. The same explicit error applies to output-token caps, sampling/penalty controls, stop sequences, seed and multiple completions listed in `config/cursorConstants.js`. `RequestedModel.parameters` contains provider-defined ID/value strings, not verified OpenAI parameter names. There is no implicit 32,000-token floor, guessed parameter mapping or local output truncation.
- Ordinary response success requires the final JSON `EndStreamResponse` mandated by the [Connect protocol](https://connectrpc.com/docs/protocol/#error-end-stream). A native `turn_ended` protobuf update alone is not transport success: terminal errors preserve their code/message, and missing terminal envelopes fail as protocol errors. The deliberate client-tool handoff is the exception: it closes the waiting native run without expecting a normal terminal envelope.
- Native HTTP/2 retains the existing Cursor headers and Node TLS validation. It currently cannot implement the configured proxy/relay transports, so a resolved per-account/environment proxy, relay or `strictProxy` requirement fails **before any direct dial**, without exposing proxy credentials. The shared per-account `noProxy`, environment `NO_PROXY` and loopback exclusions still govern non-strict requests. There is no direct fallback around a required proxy.

Field numbers/types are pinned to the generated descriptors in the [official Cursor CLI `2026.10.16-e3cb207`](https://downloads.cursor.com/lab/2026.10.16-e3cb207/linux/x64/agent-cli-package.tar.gz), archive SHA-256 `3aa3f48cd7a3909a98c9b3f2a4085f0c021088bf826690b22c61f424c843e552`. [Official `@cursor/sdk@1.0.7`](https://registry.npmjs.org/@cursor/sdk/1.0.7) independently corroborates current-image/MCP-image fields, but predates the history fields used here. Offline regressions use an independent wire reader, pinned synthetic server frames and a real loopback HTTP/2 stream. These private-protocol source and loopback contracts do not establish live-provider acceptance, image understanding, model entitlement or a provider SLA.

### Antigravity native Argon routing and quota

Native Argon base/high/medium/low definitions and the effective output ceiling live in `open-sse/config/antigravity.js`. The base wire ID deliberately has no thinking preset: an explicit API thinking request must not be replaced by a default medium suffix. Named tiers retain their explicit level.

Reviewed metadata distinguishes the unified 1,048,576-token context from this gateway's 65,536-token output ceiling. Continuation decode is not implemented. The independent input ceiling and per-token Antigravity subscription rates remain unknown; protected operator declarations may supply an input cap or tariff, but cannot raise the gateway's output ceiling.

`getAntigravityUsage` combines per-model quota with real `retrieveUserQuotaSummary` windows. Argon bucket hints take precedence over generic Gemini group labels. Session windows exist only when supplied by upstream; the 1000-point UI normalization represents a percentage, not a token allowance.

The account prefilter and quota-error handler share an exact-model/tier plus family selector. Any applicable future exhaustion wins, using the latest exhausted reset. Partial refresh cannot erase a known future zero-reset deadline; expired or unusable zero readings cannot suppress fresh strike counting. Alias/wire-name success clears only equivalent synthesized blocks and partial strikes, retaining genuine exhaustion and unrelated tiers.

Public Argon documentation verifies published capabilities and eligible surfaces, not the authenticated Cloud Code model catalog. The base/tier wire IDs and raw quota-summary schema still require credential-redacted responses from an entitled account. `authenticatedRouteVerified: false` records that boundary; local fixtures do not change it.


## 3) Persistence Layer

Primary state DB — **SQLite** under `src/lib/db/` with an adapter fallback
chain (`driver.js`): `bun:sqlite` → `better-sqlite3` (optional native dep) →
`node:sqlite` (Node ≥22.5) → `sql.js`. Repos live in `src/lib/db/repos/*`;
schema/migrations in `src/lib/db/migrations/`.

- file: `${DATA_DIR}/db/data.sqlite` (or `~/.zenrouter/db/data.sqlite`)
- ⚠️ keep `DATA_DIR` ABSOLUTE for the standalone/bun build (it chdirs into
  `.next/standalone`; a relative path silently creates a fresh empty DB)
- entities: providerConnections, providerNodes, modelAliases, combos,
  apiKeys, settings, pricing, usageHistory/usageDaily/requestDetails
- startup integrity gate (`src/lib/db/integrity.js`): `PRAGMA quick_check`
  runs before any schema migration or backup pruning; on corruption boot
  throws `DatabaseCorruptionError` instead of starting with an empty
  accounts list, and the driver chain never falls through to another
  adapter. Recovery is manual — verify a candidate under
  `${DATA_DIR}/db/backups` with `PRAGMA quick_check`, then restore it.

Usage and request logs use the same SQLite layer:

- `src/lib/usageDb.js` re-exports the `usageHistory`, `usageDaily`, log and request-detail repositories
- State follows the absolute `DATA_DIR`; `usage.json` is a legacy import source, not the active usage database
- Recorded token costs and component costs use `number | null`: an unknown used tariff is `null`, not a zero-dollar charge
- Real free tariffs and zero token usage remain numeric zero; historical recorded costs are not repriced during endpoint backfill
- Daily/live groups, minute buckets and charts propagate unknown totals; Prometheus omits an unknown cost sample rather than publishing zero
- Cache-write totals include five-minute and one-hour subsets once; canonical TTL counters and the distinct hourly rate survive translation, persistence and pricing overrides
- Live `today`/`24h` statistics read standard or native input/output counters, then legacy persisted token columns. Native `prompt_cache_hit_tokens` remains consistent with daily summaries; key grouping still uses non-secret IDs or digests.

## 4) Auth + Security Surfaces

- Dashboard cookie auth: `src/proxy.js`, `src/app/api/auth/login/route.js`
- API key generation/verification: `src/shared/utils/apiKey.js`
- Provider secrets persisted in `providerConnections` entries
- Optional proxy support for upstream calls via env proxy variables (`open-sse/utils/proxyFetch.js`)
- Account-level strict proxy policy also applies to model catalogs, delegated token refresh, and credential/project caches. Cache and in-flight identities include the effective transport policy.
- SAML callbacks require a one-use, signed request correlation bound to browser state. Use HTTPS for cross-site POST callbacks (`SameSite=None; Secure`). The outstanding-request cache is process-local; route login start and callback to the same process. Restarts invalidate pending logins.
- OIDC supports public HTTP(S) issuers. Discovery issuer and advertised endpoints are validated; vetted DNS answers are pinned to each outbound socket. Token requests reject redirects. Draft tests reuse a stored secret only for the configured issuer/client pair.
- CLI status aggregation returns installation/configured booleans, not host credentials. Cowork configuration access requires the existing local-only/CLI-token authorization. If an older deployment exposed a privileged CLI token, rotate it and reapply local MCP configuration.
- `fetchPublic` uses direct Undici connections so environment proxies cannot bypass DNS pinning. `fetchTrustedLocal` shares that transport and validates metadata exclusions across the complete DNS snapshot and redirects. Callers must establish socket-derived local trust before selecting private-network access. If an environment proxy applies, local MCP fails closed; use an explicit `NO_PROXY` exemption.
- GitLab PAT verification requires the existing dashboard authorization. Remote probes accept only public targets; trusted local peers retain private self-hosted access, never metadata. Every redirect is rejected before forwarding `Private-Token`. The eight-second limit covers DNS, connection and body consumption. Unsupported proxy transport fails closed, and upstream bodies/exceptions never reach responses or logs. Explicit HTTP URLs retain their existing behavior; use HTTPS for credential confidentiality.
- Dependency cleanup (source change, 2026-10-18): root and CLI no longer depend on `node-forge`. MITM certificate generation uses WebCrypto and `@peculiar/x509`; existing unexpired roots remain unchanged and legacy PKCS#1/PKCS#8 private keys are imported through Node's crypto APIs. The asynchronous root/leaf API is awaited by startup and SNI. This does not change already-published npm/Docker artifacts or install a new root in a system trust store.
- Provider-node validation and suggested model catalogs use the same DNS-pinned public/trusted-local boundary. Private access requires `isLocalRequest`, metadata remains forbidden, each redirect is revalidated, and cancellation spans DNS, connection and bounded JSON reads. Credentialed error bodies are not returned to the dashboard.
- Remote-image requests use the engine's independent public-address policy, not the app helper. Literal IPs bypass DNS only after validation; every DNS record must be well formed and public. Mapped/NAT64 IPv4 is checked against the IPv4 ranges, and local-use, multicast, benchmark and documentation ranges are rejected.
- MITM interception trust does not imply upstream trust. Outbound ALPN, HTTP/2, and HTTPS connections validate upstream certificates and hostnames; failures return 502 without insecure retry. For an operator-managed CA, use Node's explicit startup trust contract (`NODE_EXTRA_CA_CERTS`); never disable TLS verification or add the interception root implicitly to upstream trust.

### Client release and protocol identities

`open-sse/config/clientVersions.js` records publisher-verified app releases separately from SDK/runtime and signed protocol pins. A published app version does not verify its bundled SDK or wire profile. Retain unverified SDK/runtime pins rather than replacing them with public SDK latest. Antigravity IDE, CLI, and Hub are separate release lines.

Native Antigravity gateway requests use the separate minimal `antigravity/cli/1.4.0` profile for transport, usage, project discovery and probes. The real IDE profile remains independent for opt-in MITM compatibility; actual IDE passthrough is not forcibly relabeled. Client identity does not grant model entitlement. Argon availability remains subject to eligible paid Pro, Ultra or Enterprise access on the supported App/CLI/extension surface.

OpenCode native session and parent-session aliases use one canonical request-local identity. Devin initializes ACP with integer major version `1` and `clientCapabilities`; incompatible peers terminate through the subprocess cleanup path.


## 5) Cloud Sync

- Scheduler init: `src/lib/initCloudSync.js`, `src/shared/services/initializeCloudSync.js`
- Periodic task: `src/shared/services/cloudSyncScheduler.js`
- Control route: `src/app/api/sync/cloud/route.js`

## Request Lifecycle (`/v1/chat/completions`)

```mermaid
sequenceDiagram
    autonumber
    participant Client as CLI/SDK Client
    participant Route as /api/v1/chat/completions
    participant Chat as src/sse/handlers/chat
    participant Core as open-sse/handlers/chatCore
    participant Model as Model Resolver
    participant Auth as Credential Selector
    participant Exec as Provider Executor
    participant Prov as Upstream Provider
    participant Stream as Stream Translator
    participant Usage as usageDb

    Client->>Route: POST /v1/chat/completions
    Route->>Chat: handleChat(request)
    Chat->>Model: parse/resolve model or combo

    alt Combo model
        Chat->>Chat: iterate combo models (handleComboChat)
    end

    Chat->>Auth: getProviderCredentials(provider)
    Auth-->>Chat: active account + tokens/api key

    Chat->>Core: handleChatCore(body, modelInfo, credentials)
    Core->>Core: detect source format
    Core->>Core: translate request to target format
    Core->>Exec: execute(provider, transformedBody)
    Exec->>Prov: upstream API call
    Prov-->>Exec: SSE/JSON response
    Exec-->>Core: response + metadata

    alt 401/403
        Core->>Exec: refreshCredentials()
        Exec-->>Core: updated tokens
        Core->>Exec: retry request
    end

    Core->>Stream: translate/normalize stream to client format
    Stream-->>Client: SSE chunks / JSON response

    Stream->>Usage: extract usage + persist history/log
```

### Response transport contracts

- Response handling uses the executor's actual response format and the selected per-model transport, not the provider's default format. Same-format streams retain native Messages/Responses/Google envelopes; only Chat and Responses use the OpenAI `[DONE]` sentinel.
- Tool-name compression/cloaking is reversed for both SSE and JSON, including forced-SSE aggregation. Fragmented Chat names are restored with request-local state keyed by choice/tool identity; native tool starts are emitted once with complete names. Only request-map entries are renamed: literal `_ide` suffixes or `proxy_` prefixes are not evidence of cloaking. Tool argument deltas remain exact strings, without guessing cumulative snapshots from shared prefixes. Responses calls are paired by native item/output identity, including custom freeform input represented as a JSON `input` parameter for function-tool clients.
- Reasoning/opaque continuity and actual terminal usage remain independent of tool/media conversion. Incomplete or refusal terminals must not become ordinary successful tool completions.
- Generated image bytes stay in typed response channels: Chat `message.images` / `delta.images` and Gemini `inlineData` / `fileData`. Each Gemini-derived Chat image has a response-local occurrence `index`; its opaque signature stays on that image's [documented `extra_content.google.thought_signature` extension](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures) and returns to the corresponding Gemini part's `thoughtSignature`, never a later tool. These channels are never manufactured markdown, JSON prose, or base64 text. Native Messages has no generic generated-image response block, and Responses needs a real image-generation tool result; those shapes cannot be invented to claim lossless conversion.
- DeepSeek native Responses replay preserves representable input and continuity fields without adding fabricated reasoning placeholders. A declared repository transport is not proof of current hosted endpoint availability; provider catalog support must be verified separately.

## Combo + Account Fallback Flow

```mermaid
flowchart TD
    A[Incoming model string] --> B{Combo name?}
    B -- Yes --> C[Load ordered combo members]
    B -- No --> D[Single model]
    C --> E[Try model N]
    E --> F[Resolve provider and model]
    D --> F
    F --> G[Select account credentials]
    G --> H{Credentials available?}
    H -- No --> Q{Combo has another model?}
    H -- Yes --> J[Execute request]
    J --> K{Accepted response?}
    K -- Yes --> L[Return response]
    K -- No --> M{Retry another account?}
    M -- Yes --> O[Apply cooldown if positive]
    O --> P{Another account available?}
    P -- Yes --> G
    P -- No --> Q
    M -- No --> S{Model-dependent incompatibility?}
    S -- Yes --> Q
    S -- No --> N[Return request error]
    Q -- Yes --> E
    Q -- No --> R[Return final error]
```

`checkFallbackError` uses `FALLBACK_SCOPE.ACCOUNT` by default. The combo boundary passes `FALLBACK_SCOPE.COMBO` and retains structured error codes. Only configured destination-dependent request failures advance a combo without rotating or cooling healthy accounts; generic client failures and cancellation remain terminal.

The nonstream handlers reject zero-output, nonfinal Chat completions as HTTP 502 `empty_response`, including SSE aggregation. Detection reuses parsed objects. Generated content, opaque reasoning, tools, refusals, images/audio, positive incurred usage and valid terminal no-ops prevent empty-response replay. Empty upstream failures retain the existing bounded retry/account policy.

## OAuth Onboarding and Token Refresh Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant UI as Dashboard UI
    participant OAuth as /api/oauth/[provider]/[action]
    participant ProvAuth as Provider Auth Server
    participant DB as localDb
    participant Test as /api/providers/[id]/test
    participant Exec as Provider Executor

    UI->>OAuth: GET authorize or device-code
    OAuth->>ProvAuth: create auth/device flow
    ProvAuth-->>OAuth: auth URL or device code payload
    OAuth-->>UI: flow data

    UI->>OAuth: POST exchange or poll
    OAuth->>ProvAuth: token exchange/poll
    ProvAuth-->>OAuth: access/refresh tokens
    OAuth->>DB: createProviderConnection(oauth data)
    OAuth-->>UI: success + connection id

    UI->>Test: POST /api/providers/[id]/test
    Test->>Exec: validate credentials / optional refresh
    Exec-->>Test: valid or refreshed token info
    Test->>DB: update status/tokens/errors
    Test-->>UI: validation result
```

Proactive checks in `src/sse/services/tokenRefresh.js` queue by connection through the database reread, upstream refresh and persistence attempt. Each caller retains its own `force`, transport policy and contextual fields. Newer persisted access/expiry state is adopted even when the refresh token does not rotate.

GitHub Copilot service-token freshness uses its own expiry, independently from the OAuth `lastRefreshAt`. Adoption copies only service-token fields and synchronizes top-level/nested carriers. It does not overwrite caller proxy metadata or mark the OAuth grant refreshed. Existing policy-aware single-flight and ten-second result caches remain intact.

This queue is process-local and proactive-only. It does not serialize other processes, reactive refresh writers or usage writers. The reactive path in `open-sse/handlers/chatCore.js` still uses executor `refreshCredentials()`.

## Cloud Sync Lifecycle (Enable / Sync / Disable)

```mermaid
sequenceDiagram
    autonumber
    participant UI as Endpoint Page UI
    participant Sync as /api/sync/cloud
    participant DB as localDb
    participant Cloud as External Cloud Sync
    participant Claude as ~/.claude/settings.json

    UI->>Sync: POST action=enable
    Sync->>DB: set cloudEnabled=true
    Sync->>DB: ensure API key exists
    Sync->>Cloud: POST /sync/{machineId} (providers/aliases/combos/keys)
    Cloud-->>Sync: sync result
    Sync->>Cloud: GET /{machineId}/v1/verify
    Sync-->>UI: enabled + verification status

    UI->>Sync: POST action=sync
    Sync->>Cloud: POST /sync/{machineId}
    Cloud-->>Sync: remote data
    Sync->>DB: update newer local tokens/status
    Sync-->>UI: synced

    UI->>Sync: POST action=disable
    Sync->>DB: set cloudEnabled=false
    Sync->>Cloud: DELETE /sync/{machineId}
    Sync->>Claude: switch ANTHROPIC_BASE_URL back to local (if needed)
    Sync-->>UI: disabled
```

Periodic sync is triggered by `CloudSyncScheduler` when cloud is enabled.

## Data Model and Storage Map

```mermaid
erDiagram
    SETTINGS ||--o{ PROVIDER_CONNECTION : controls
    PROVIDER_NODE ||--o{ PROVIDER_CONNECTION : backs_compatible_provider
    PROVIDER_CONNECTION ||--o{ USAGE_ENTRY : emits_usage

    SETTINGS {
      boolean cloudEnabled
      number stickyRoundRobinLimit
      boolean requireLogin
      string password_hash
    }

    PROVIDER_CONNECTION {
      string id
      string provider
      string authType
      string name
      number priority
      boolean isActive
      string apiKey
      string accessToken
      string refreshToken
      string expiresAt
      string testStatus
      string lastError
      string rateLimitedUntil
      json providerSpecificData
    }

    PROVIDER_NODE {
      string id
      string type
      string name
      string prefix
      string apiType
      string baseUrl
    }

    MODEL_ALIAS {
      string alias
      string targetModel
    }

    COMBO {
      string id
      string name
      string[] models
    }

    API_KEY {
      string id
      string name
      string key
      string machineId
      boolean isActive
    }

    USAGE_ENTRY {
      string provider
      string model
      number prompt_tokens
      number completion_tokens
      string connectionId
      string timestamp
    }
```

Physical storage files:

- main state: `${DATA_DIR}/db/data.sqlite` (or `~/.zenrouter/db/data.sqlite`; legacy `db.json`/`usage.json` kept only for migration via `src/lib/db/paths.js:LEGACY_FILES`)
- usage stats: SQLite tables `usageHistory`/`usageDaily` + in-memory recent-requests ring (`src/lib/db/repos/usageRepo.js`)
- request details: SQLite `requestDetails` (`requestDetailsRepo.js`, payloads redacted)
- optional translator/request debug sessions: `<repo>/logs/...`

## Deployment Topology

```mermaid
flowchart LR
    subgraph LocalHost[Developer Host]
        CLI[CLI Tools]
        Browser[Dashboard Browser]
    end

    subgraph ContainerOrProcess[ZenRouter Runtime]
        Next[Next.js Server\nPORT=20128]
        Core[SSE Core + Executors]
        MainDB[(SQLite data.sqlite)]
        UsageDB[(usageHistory/usageDaily)]
    end

    subgraph External[External Services]
        Providers[AI Providers]
        SyncCloud[Cloud Sync Service]
    end

    CLI --> Next
    Browser --> Next
    Next --> Core
    Next --> MainDB
    Core --> MainDB
    Core --> UsageDB
    Core --> Providers
    Next --> SyncCloud
```

### Development worker mesh

`scripts/worker-mesh.mjs` manages a development-only Mutagen 0.18.1 star: the local checkout is the hub and each isolated worker workspace is a leaf. There is no worker-to-worker sync cycle or production target. SSH aliases `zen-mesh-node1` and `zen-mesh-node2` must use their expected IPs, `User root`, `BatchMode yes`, `StrictHostKeyChecking yes`, and `ForwardAgent no`; verify host keys out-of-band first. Install the official Mutagen binary and agents archive under `~/.local/share/zenrouter-worker-mesh/tools`, verifying the release SHA256SUMS, or set `WORKER_MESH_MUTAGEN`.

```bash
node scripts/worker-mesh.mjs create
node scripts/worker-mesh.mjs status
node scripts/worker-mesh.mjs conflicts
node scripts/worker-mesh.mjs flush
node scripts/worker-mesh.mjs job node1 deps
node scripts/worker-mesh.mjs job node2 deps
node scripts/worker-mesh.mjs job node1 test
node scripts/worker-mesh.mjs job node2 build
node scripts/worker-mesh.mjs follow node1 JOB_ID
node scripts/worker-mesh.mjs job-status node1 JOB_ID
node scripts/worker-mesh.mjs stop
```

- Two-way-safe sessions preserve divergent edits as conflicts; flush refuses reported conflicts or scan/transition errors. Resolve intentionally before retrying. A two-pass flush carries reverse edits through the hub; it is a synchronization barrier, **not** a source lock. Freeze edits during build/test/lint/audit verification.
- Secrets, `.env*` (including examples), DBs, logs, history, SSH keys, dependencies, build products, and symlinks are excluded. Treat every synchronized source file as readable by both worker administrators; filename exclusions are not a substitute for keeping secrets out of source.
- Worker state is isolated under `/root/zenrouter-worker-mesh/{workspace,jobs,runtime}` with private permissions. Jobs use synthetic authentication values and private HOME/DATA_DIR, never production state. Per-node locking rejects concurrent jobs; node2 owns builds, while tests use at most three workers.
- `lint` and `audit` are additional fixed job types; audits cover the gateway, tests, and CLI packages. Machine-readable test/audit reports stay in the private job directory. Redacted stdout/stderr and exit status survive SSH disconnects; `follow NODE JOB_ID STDOUT_BYTES STDERR_BYTES` resumes from emitted byte offsets. Output is UTF-8-safe and bounded per frame.
- The Mutagen daemon persists independently of the CLI. `stop` pauses sessions without deleting archives; `create` resumes. After a workstation restart, run `create` again. No OS startup service, public listener, firewall change, or production deployment is installed.
- Network latency and availability remain finite; keepalives detect broken SSH sessions but cannot guarantee uninterrupted transport. Detached execution and persisted output allow recovery without replaying the job.


## Module Mapping (Decision-Critical)

### Route and API Modules

- `src/app/api/v1/*`, `src/app/api/v1beta/*`: compatibility APIs
- `src/app/api/providers*`: provider CRUD, validation, testing
- `src/app/api/provider-nodes*`: custom compatible node management
- `src/app/api/oauth/*`: OAuth/device-code flows
- `src/app/api/keys*`: local API key lifecycle
- `src/app/api/models/alias`: alias management
- `src/app/api/combos*`: fallback combo management
- `src/app/api/pricing`: pricing overrides for cost calculation
- `src/app/api/usage/*`: usage and logs APIs
- `src/app/api/sync/*` + `src/app/api/cloud/*`: cloud sync and cloud-facing helpers
- `src/app/api/cli-tools/*`: local CLI config writers/checkers

### Routing and Execution Core

- `src/sse/handlers/chat.js`: request parse, combo handling, account selection loop
- `open-sse/handlers/chatCore.js`: translation, executor dispatch, retry/refresh handling, stream setup
- `open-sse/executors/*`: provider-specific network and format behavior

### Translation Registry and Format Converters

- `open-sse/translator/index.js`: translator registry and orchestration
- Request translators: `open-sse/translator/request/*`
- Response translators: `open-sse/translator/response/*`
- Format constants: `open-sse/translator/formats.js`

### Persistence

- `src/lib/db/index.js` (+ repos): persistent config/state (`src/lib/localDb.js` is a compat shim)
- `src/lib/usageDb.js`: usage history and rolling request logs

## Provider Executor Coverage

Specialized executors:

- `antigravity`
- `gemini-cli`
- `github`
- `kiro`
- `codex`
- `cursor`

Default executor path:

- all other providers (including compatible node providers) use `open-sse/executors/default.js`

## Format Translation Coverage

Detected source formats include:

- `openai`
- `openai-responses`
- `claude`
- `gemini`

Target formats include:

- OpenAI chat/Responses
- Claude
- Gemini/Gemini-CLI/Antigravity envelope
- Kiro
- Cursor

Translations are selected dynamically based on source payload shape and provider target format.

### Request field contracts

| Intent | Chat Completions | Responses | Claude Messages | Gemini |
| --- | --- | --- | --- | --- |
| Sampling | `temperature`, `top_p` | `temperature`, `top_p` | `temperature`, `top_p`, `top_k` on supported legacy models | `temperature`, `topP`, `topK` on supporting models |
| Stops / seed | `stop`, `seed` | No native equivalent | `stop_sequences`; no seed | `stopSequences`, `seed` |
| Output limit | `max_completion_tokens` or legacy `max_tokens` | `max_output_tokens` | `max_tokens` | `generationConfig.maxOutputTokens` |
| Instructions | Ordered system/developer messages | `instructions` plus ordered system/developer input | Top-level `system` | `systemInstruction.parts` |
| JSON contract | `response_format` | `text.format` | `output_config.format` for native JSON Schema | `responseMimeType` plus `responseJsonSchema` or legacy `responseSchema` |
| Function choice | none / auto / required / named function | Same choices, flat named function | none / auto / any / tool | NONE / AUTO / ANY, optionally restricted names |
| Parallel choice | `parallel_tool_calls` | `parallel_tool_calls` | Inverse `disable_parallel_tool_use`, except the none variant | No equivalent disable control |

- Native structured-output schemas are not replaced by prompt instructions when the target supports them. Standard Gemini/Vertex function declarations use `parametersJsonSchema`; Cloud Code envelopes retain their restricted Schema cleaner. Legacy Gemini Schema types and nullable nodes are converted to JSON Schema on reverse requests. Names, descriptions and optional strict flags remain native where supported; Gemini has no per-function strict flag, and VALIDATED calling is not an identical cross-vendor guarantee.
- Every system/developer instruction survives Chat/Responses conversion, including structured text and later instruction turns. Opaque user attribution maps between Chat/Responses `user` and Claude `metadata.user_id`; arbitrary metadata is not an interchangeable Claude user identifier or Gemini label map.
- Stateful Responses `previous_response_id`/`conversation` references require a native Responses destination. Stateless destinations reject them with a request-scoped unsupported-parameter error rather than deleting inherited context or fetching unknown private history; null references are unset. Native tool/opaque continuity items stay on their supported native path.
- Generated assistant attachments remain typed media. Gemini model turns and supported Messages/Responses input retain the assistant role; strict Chat lifts assistant images into a user vision turn after the contiguous tool-result run. No bridge serializes image bytes as JSON prose or manufactured markdown.
- Google image signatures remain opaque metadata on their corresponding typed image blocks (`extra_content.google.thought_signature`) and replay as the same native image Part's `thoughtSignature`. Signed text Parts retain their separate signatures on native Google pivots; ordinary Chat answer content is not changed into arrays for continuity transport. Vertex replaces only gateway-synthetic defaults, never an original opaque signature. Foreign protocols without native Google continuity do not acquire fabricated signature fields.
- On Core's owned request containers, recognized legacy media arrays in Gemini function results are normalized once into adjacent native Content media parts, including same-format/passthrough requests. Existing caller-native FunctionResponse.parts stay unchanged; newly created nested multimedia responses are not assumed supported on older models. Legitimate repeated images, parallel IDs, errors and sibling metadata survive; ordinary Structs and literal JSON/base64 prose are not scanned or parsed as images.
- Unsupported vendor-only controls are not fabricated: Responses has no seed/stop controls, Claude has no seed or general JSON-object switch, and Gemini has no parallel-disable switch. Legacy Claude JSON-object mode remains prompt-only, not a native schema guarantee. Newer Claude models reject sampling controls accepted by older models; Gemini 3.6 Flash and newer ignore top-p/top-k. Preserve provider/model restrictions rather than claiming universal losslessness.
- Gemini 4 documents `temperature`, `top_p` and `top_k` as ignored. Native Google routes return local HTTP 400 `unsupported_parameter` when the client explicitly supplies them, retaining the source parameter path instead of silently discarding intent. Other generation controls and unverified reseller routes retain their own contracts.
- Gemini 4 user Content keeps `functionResponse` Parts last after same-role merging, including native and already-merged histories. Stable ordering preserves relative media/text/opaque and parallel-response order. Pending native or translated tool calls do not acquire fabricated success responses; older model compatibility guards remain unchanged.

Primary contracts: [OpenAI Chat](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create), [Claude Messages](https://platform.claude.com/docs/en/api/messages/create), [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Gemini generation](https://ai.google.dev/api/generate-content), [Gemini function controls](https://ai.google.dev/api/caching#FunctionCallingConfig), [Gemini signature replay](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures.md.txt), and [Vertex v1 discovery](https://aiplatform.googleapis.com/$discovery/rest?version=v1).


### Reasoning preservation and protocol limits

- Readable reasoning belongs in `reasoning_content`, Claude `thinking` blocks, Gemini thought parts, or Responses reasoning summaries—not visible answer text. Request histories, streaming responses, native JSON, and forced-SSE JSON must preserve ordered reasoning independently of final text and tool calls.
- Native Claude `redacted_thinking` blocks carry opaque `data`, not a thinking `signature`. Replay valid native blocks unchanged; do not apply signed-thinking validation to encrypted data. Non-native Chat bridges cannot replay Claude encrypted reasoning or signatures and must not fabricate them or expose them as text.
- The notice `[thinking block omitted: not supported on this route]` was generated by legacy request-history conversion, not an SSE warning. Ordinary thinking is handled before the unsupported-block fallback. Already-contaminated client history remains ordinary text; deleting that literal globally would corrupt legitimate input.
- Provider-requested summarized/omitted display and provider-specific history restrictions remain intentional. Preservation covers reasoning actually supplied by upstream; the gateway cannot recover reasoning an upstream withholds.
- Mistral's verified Chat transport uses `reasoning_effort`, not model-family native thinking flags or replayed `reasoning_content`/`reasoning` fields. Its recognized ThinkChunk/TextChunk arrays are normalized into separate reasoning and answer channels; unrelated multimodal/opaque arrays are not flattened. Other providers retain their native dialects; unverified reseller endpoint changes are not inferred from model names.
- OpenAI→Claude honors `max_completion_tokens` before `max_tokens`; explicit caps bypass tool-token floors and are clamped only by the model ceiling. Final enabled-thinking reconciliation can shrink a conflicting budget but never raise the selected cap. An impossible enabled budget with a cap at or below 1024 returns HTTP 400 before dispatch. Uncapped requests retain existing defaults; native passthrough retains its upstream validation behavior.

### Usage accounting across formats

- Claude prompt totals include uncached input plus cache reads and writes once. OpenAI usage details preserve supplied fields (including zero) and fill missing cache splits from native counters.
- Gemini thought tokens belong to completion/reasoning, not prompt. Missing totals derive from prompt plus completion; supplied numeric totals remain authoritative, including zero.
- CommandCode input totals remain cache-inclusive. Cache-write detail is exposed independently; read/write splits must not be added to inclusive prompt totals again.


### Multimodal translation and capability routing

- **Remote image URLs and inline base64**: Remote HTTP image URLs dispatched to Claude are prefetched and converted to inline base64 data URIs before reaching Anthropic's Messages API (which strictly forbids `source.type: "url"`). Claude requests with remote images preserve `OPENAI_BLOCK.IMAGE_URL` when bridging through OpenAI.
- **Multimodal tool outputs**: Screenshots and images returned within `tool_result` content arrays are preserved as structured `OPENAI_BLOCK.IMAGE_URL` blocks and hoisted into user messages rather than stringified into raw text, preventing multi-million token context overflows.
- **Documents and video**: Claude `document` blocks (PDF) map to OpenAI `file` and Responses `input_file` blocks. `video_url` and `input_video` blocks translate to Gemini `inlineData`/`fileData` and are cleanly stripped with descriptive placeholders when routed to non-video models.
- **Combo and fusion modality safety**: `detectRequiredCapabilities` scans the entire conversation history (including tool results and earlier user turns) so that follow-up turns never fall back to text-only models when media is present. In fusion mode, media blocks are stripped from the judge prompt so text-only judges evaluate clean text answers without crashing (Issue #3375).
The 2026-09-27–2026-10-02 upstream audit adapted [#4143](https://github.com/decolua/9router/pull/4143), [#4533](https://github.com/decolua/9router/pull/4533), [#4481](https://github.com/decolua/9router/pull/4481), [#4523](https://github.com/decolua/9router/pull/4523), and [#4412](https://github.com/decolua/9router/pull/4412). Already-present streaming defaults, forced-Claude JSON conversion, Gemini system/schema fixes, and fork-specific security fixes were not duplicated. [Upstream insecure-TLS fallback](https://github.com/decolua/9router/commit/b58bd80406a24030acac6312fce519534c61947a) was rejected; certificate failures must not trigger unauthenticated TLS.

## Failure Modes and Resilience

## 1) Account/Provider Availability

- provider account cooldown on transient/rate/auth errors
- account fallback before failing request
- combo model fallback when current model/provider path is exhausted

## 2) Token Expiry

- pre-check and refresh with retry for refreshable providers
- 401/403 retry after refresh attempt in core path

## 3) Stream Safety

- disconnect-aware stream controller with Bun & Node socket-close bridge in `custom-server.js` to immediately abort upstream requests and stop token billing on client hangup (#3559)
- translation stream with end-of-stream flush, cancel-path aborted usage recording, and `[DONE]` handling
- usage estimation fallback when provider usage metadata is missing
- Codex and Qoder inspect complete SSE events before committing response headers, bounded by 1000 ms and 256 KiB. Deadline handoff preserves consumed bytes and the outstanding read; cancellation closes the upstream reader/socket.
- Qoder queue code `10605` returns HTTP 429 with available retry timing; quota codes `110`/`112` remain 403. Errors after output terminate in-band as structured SSE errors, never fabricated assistant text or a replayed request.

## 4) Cloud Sync Degradation

- sync errors are surfaced but local runtime continues
- scheduler has retry-capable logic, but periodic execution currently calls single-attempt sync by default

## 5) Data Integrity

- DB shape migration/repair for missing keys
- corrupt JSON reset safeguards for localDb and usageDb

## Observability and Operational Signals

Runtime visibility sources:

- console logs from `src/sse/utils/logger.js`
- per-request usage aggregates in `usage.json`
- textual request status log in `log.txt`
- optional deep request/translation logs under `logs/` when `ENABLE_REQUEST_LOGS=true`
- dashboard usage endpoints (`/api/usage/*`) for UI consumption

## Security-Sensitive Boundaries

- JWT secret (`JWT_SECRET`) secures dashboard session cookie verification/signing
- Initial password fallback (`INITIAL_PASSWORD`, default `12345678`) must be overridden in real deployments
- API key HMAC secret (`API_KEY_SECRET`) secures generated local API key format
- Provider secrets (API keys/tokens) are persisted in local DB and should be protected at filesystem level
- Cloud sync endpoints rely on API key auth + machine id semantics

## Environment and Runtime Matrix

Environment variables actively used by code:

- App/auth: `JWT_SECRET`, `INITIAL_PASSWORD`
- Storage: `DATA_DIR`
- Security hashing: `API_KEY_SECRET`, `MACHINE_ID_SALT`
- Logging: `ENABLE_REQUEST_LOGS`
- Sync/cloud URLing: `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_CLOUD_URL`
- Outbound proxy: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` and lowercase variants
- Platform/runtime helpers (not app-specific config): `APPDATA`, `NODE_ENV`, `PORT`, `HOSTNAME`

## Known Architectural Notes

1. `usageDb` currently stores under `~/.zenrouter` and does not follow `DATA_DIR`.
2. `/api/v1/route.js` returns a static model list and is not the main models source used by `/v1/models`.
3. Request logger writes full headers/body when enabled; treat log directory as sensitive.
4. Cloud behavior depends on correct `NEXT_PUBLIC_BASE_URL` and cloud endpoint reachability.

## Operational Verification Checklist

- Build from source: `cd /root/dev/zenrouter && npm run build`
- Build Docker image: `cd /root/dev/zenrouter && docker build -t zenrouter .`
- Start service and verify:
- `GET /api/settings`
- `GET /api/v1/models`
- CLI target base URL should be `http://<host>:20128/v1` when `PORT=20128`
