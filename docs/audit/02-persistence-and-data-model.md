# 02 — Persistence and Data Model

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

Audit snapshot: **2026-10-13** · version **0.9.7** · scope: `src/lib/db/**`, `src/lib/localDb.js`,
`src/lib/usageDb.js`, `src/lib/**` (inventory), `src/models/`, `src/store/`, `src/shared/`,
and the on-disk state under `~/.zenrouter`.

> **Read this, not ARCHITECTURE.md, for persistence.** `docs/ARCHITECTURE.md` is partially stale
> (§3 "Usage DB", §"Observability"), and so is the `CLAUDE.md` note that usage/logs "do not follow
> `DATA_DIR`". Details in [§7](#7-risks-gotchas-and-stale-doc-discrepancies).
>
> **Method caveat:** no `node_modules/` was installed (matches `docs/audit/README.md`), so nothing
> here was executed. All claims are static reading plus direct inspection of a real
> `~/.zenrouter` data dir. Behavioral claims are labelled as such.

---

## 1. Driver fallback chain (`src/lib/db/driver.js`)

`getAdapter()` (`driver.js:86`) memoizes one adapter on a **`global`** object so Next.js dev
hot-reload does not re-open the DB (`driver.js:5-6`). `getAdapterSync()` (`driver.js:92`) throws if
`getAdapter()` was never awaited.

| Order | Driver | Probe | Skip condition | File |
|---|---|---|---|---|
| 1 | `bun:sqlite` | `process.versions.bun` truthy, then dynamic `import("bun:sqlite")` | not Bun | `driver.js:13-24` → `adapters/bunSqliteAdapter.js` |
| 2 | `better-sqlite3` | static `import Database from "better-sqlite3"` in the adapter module | Bun runtime (`driver.js:28`) | `driver.js:26-37` → `adapters/betterSqliteAdapter.js` |
| 3 | `node:sqlite` | Node version gate `maj>22 || (maj==22 && min>=5)` (`driver.js:42-43`), then dynamic import | Bun, or Node < 22.5 | `driver.js:39-52` → `adapters/nodeSqliteAdapter.js` |
| 4 | `sql.js` | dynamic `import("sql.js")` (a hard dependency, always installable) | never — always tried last | `driver.js:54-63` → `adapters/sqljsAdapter.js` |

`better-sqlite3` is an **`optionalDependency`** (`package.json`), so a failed native build does not
break `npm install`; `sql.js` is a normal dependency.

**Probing is by import + construction, not by a feature check.** Each `try*` wraps
`create*Adapter(DATA_FILE)` in `try/catch`; on error it either rethrows corruption or logs and
returns `null` so the chain continues (`driver.js:19-23, 32-36, 47-51, 58-62`).

**Corruption short-circuits the chain.** `stopOnCorruption()` (`driver.js:8-11`) converts a
`SQLITE_CORRUPT` / `SQLITE_NOTADB` / "database disk image is malformed" error into
`DatabaseCorruptionError` and **rethrows instead of returning `null`** — so a corrupt
`data.sqlite` never silently "falls through" to the next driver and boots empty. If all four fail,
`initAdapter` throws `[DB] No SQLite driver available` (`driver.js:74`).

Adapter init then calls `runMigrationOnce(adapter)` (`driver.js:81-82`).

### Transaction and durability per driver

| Driver | Transaction primitive | Durability model |
|---|---|---|
| `better-sqlite3` | `db.transaction(fn)()` — real BEGIN/COMMIT, nests via SAVEPOINT | WAL on disk, `synchronous=NORMAL` |
| `bun:sqlite` | `db.transaction(fn)()` (`bunSqliteAdapter.js:51-55`) | WAL on disk |
| `node:sqlite` | hand-rolled `SAVEPOINT sp_x` / `RELEASE` / `ROLLBACK TO` (`nodeSqliteAdapter.js:64-76`) — nesting works | WAL on disk |
| `sql.js` | hand-rolled `SAVEPOINT` (`sqljsAdapter.js:131-143`) | **whole-image rewrite to disk, debounced 100 ms** |

All four run `PRAGMA_SQL` from `schema.js:8-16`: `journal_mode=WAL`, `synchronous=NORMAL`,
`temp_store=MEMORY`, `mmap_size`, `cache_size`, `foreign_keys=ON`, `busy_timeout=5000`. The three
native drivers also run `PRAGMA wal_checkpoint(TRUNCATE)` on a 60 s unref'd interval and on
shutdown (`betterSqliteAdapter.js:24-39`, `bunSqliteAdapter.js:23-36`, `nodeSqliteAdapter.js:36-49`).

### The `sql.js` fallback — concurrency / transaction concerns (real)

`sqljsAdapter.js` is the only driver with meaningful persistence risk, and it is the one that
"always works" for users without build tools.

1. **No WAL, no locking.** `sql.js` is an in-memory wasm SQLite. `PRAGMA journal_mode=WAL` and
   `busy_timeout` are effectively no-ops there; the file is written by the Node filesystem layer,
   **not** through the SQLite locking protocol. Two processes (e.g. dashboard + tray/CLI) opening
   the same `data.sqlite` each hold their own image and each `rename()` a full snapshot over the
   other's — **last writer wins, whole-file clobber, no error**. The adapter's own comment
   acknowledges this (`sqljsAdapter.js:40-42`).
2. **Persistence is debounced and detached from commit.** Every `run`/`exec` sets `dirty` and
   (re)schedules a 100 ms timer (`SAVE_DEBOUNCE_MS`, `sqljsAdapter.js:23, 73-82, 96, 128`).
   `transaction()` `RELEASE`s the savepoint and *then* calls `scheduleSave()` (`sqljsAdapter.js:136`)
   — so a transaction can "commit" and still be lost if the process dies inside the debounce window.
   There is no fsync-on-commit, and commit latency is not a durability guarantee.
3. **A write is a full rewrite.** `persist()` does `db.export()` → temp sibling file → `writeFileSync`
   → `fsyncSync` → `renameSync` (`sqljsAdapter.js:47-71`). This *is* the correct atomic-publish
   pattern (and the comment at `:27-46` explains the earlier truncate-in-place bug it replaced), but
   cost and I/O grow with total DB size, and the temp file is a **sibling** so `rename` stays
   intra-filesystem (`:44-45`).
4. **Save failures are swallowed.** `scheduleSave`'s timer catches and `console.error`s
   (`sqljsAdapter.js:79`); `gracefulClose` likewise (`:151`). A failing disk produces log noise, not
   a surfaced error, so the in-memory DB keeps diverging from disk.
5. **No directory fsync.** `persist()` fsyncs the file but not `path.dirname(filePath)`, so the
   rename itself is not guaranteed durable across power loss.
6. **Shutdown flush is best-effort and process-global.** `beforeExit` / `SIGINT` / `SIGTERM` handlers
   flush, but the SIGINT/SIGTERM handlers also call `process.exit(0)` (`sqljsAdapter.js:161-164`).
   Every adapter registers its own `process.once` handlers (`betterSqliteAdapter.js:36-39`,
   `bunSqliteAdapter.js:33-36`, `nodeSqliteAdapter.js:46-49`); after a hot-reload-driven re-init,
   these accumulate.
7. **`ATTACH DATABASE` backups are doubtful under `sql.js`.** `backupDbLite()` uses
   `ATTACH DATABASE '<file>' AS bak` + cross-database `INSERT ... SELECT`
   (`backup.js:39-63`). That is a native-SQLite path; the pre-schema backup is wrapped in
   try/catch and only warns on failure (`migrate.js:241-248`), so on the `sql.js` path you may
   silently get **no pre-migration backup**.

Net: `sql.js` gives correct single-process atomic writes but **no multi-process safety, no
commit-durability, and up to ~100 ms of unflushed state**. Everything else in this document
(native drivers) uses WAL.

---

## 2. Path resolution (`src/lib/db/paths.js`, `src/lib/dataDir.js`)

```
DATA_DIR (src/lib/dataDir.js:26-47)
   ├─ process.env.DATA_DIR if set (mkdirSync'd; on Windows a /unix/path is ignored → default;
   │  EACCES/EPERM → default dir)
   └─ else defaultDir():  win32 → %APPDATA%\zenrouter  |  else ~/.zenrouter
        (legacy fallback: if ~/.zenrouter is absent but ~/.9router exists → use ~/.9router)

DB_DIR      = <DATA_DIR>/db                       paths.js:5
DATA_FILE   = <DATA_DIR>/db/data.sqlite           paths.js:6
BACKUPS_DIR = <DATA_DIR>/db/backups               paths.js:7
LEGACY_FILES (migration sources only)             paths.js:8-13
   main     = <DATA_DIR>/db.json
   usage    = <DATA_DIR>/usage.json
   disabled = <DATA_DIR>/disabledModels.json
   details  = <DATA_DIR>/request-details.json
```

`ensureDirs()` (`paths.js:14-18`) creates `DATA_DIR`, `db/`, `db/backups/`.

Other state that resolves through the same `DATA_DIR`:

| Path | Written by |
|---|---|
| `<DATA_DIR>/machine-id` (0600) | `src/shared/utils/machineId.js:7, 29` |
| `<DATA_DIR>/auth/cli-secret` (0600) | `src/shared/utils/machineId.js:9, 44` |
| `<DATA_DIR>/secrets.json` (0600) | `cli/hooks/runtimeSecrets.js:24, 63-69` |
| `<DATA_DIR>/mitm/aliases.json` | `src/lib/mitmAliasCache.js:12, 16` (duplicates the DATA_DIR logic locally; no legacy/EACCES fallback) |

### Is the "usage/logs do not follow DATA_DIR" claim true? **No — not anymore.**

- The claim is **true only for the legacy files**: `LEGACY_FILES.usage` is
  `<DATA_DIR>/usage.json` (`paths.js:10`) and is now read **only** as a one-time import source.
- **Usage and request logs are stored in the same SQLite file as everything else** —
  `usageHistory`, `usageDaily`, `requestDetails` live in `<DATA_DIR>/db/data.sqlite`
  (`schema.js:109-154`, `usageRepo.js`, `requestDetailsRepo.js`).
- Nothing in the repo writes `usage.json` or `log.txt`: `appendRequestLog()` is now an explicit
  no-op (`usageRepo.js:805-806`) and `getRecentLogs()` derives lines from `usageHistory`
  (`usageRepo.js:808-838`). Grep for `usage.json|log.txt` across `src/` and `cli/` returns only
  `paths.js:10` (migration source) and docs.
- On the inspected host: no `~/.zenrouter/usage.json`, no `log.txt`, no `db.json`. The only
  JSON-ish leftovers are `secrets.json` and `~/.zenrouter/logs/mitm/` (empty).

**So the accurate statement is the inverse of the docs:** usage and logs *do* follow `DATA_DIR`
now, because they are rows in `data.sqlite`. Two log sinks still do not:

- `~/.zenrouter/logs/mitm/` — MITM debug output (observed on disk).
- `src/mitm/handlers/kiro.js:8` — `path.join(__dirname, "../../../data/logs/mitm/kiro-debug.log")`
  — **repo-relative**, so it follows neither `DATA_DIR` nor `~/.zenrouter`.
- `docs/ARCHITECTURE.md:408` mentions translator debug sessions under `<repo>/logs/...` — also
  repo-relative, and gated by `ENABLE_REQUEST_LOGS`/`ENABLE_TRANSLATOR`.

---

## 3. Migration system

**Declaration** — one file per migration under `src/lib/db/migrations/`, each
`export default { version, name, up(db) }`. Registered by hand in
`migrations/index.js:4-6`, then sorted: `MIGRATIONS.sort((a,b) => a.version - b.version)`.
`latestVersion()` = last element's version. Only `001-initial.js` exists today.

**Two independent version numbers:**

| Version | Where stored | Purpose |
|---|---|---|
| `schemaVersion` | `_meta` row, written **per migration** (`migrate.js:71`) | decides which `MIGRATIONS` are pending |
| `SCHEMA_VERSION` (`schema.js:6`, currently `1`) | `_meta.backupSchemaVersion` (`migrate.js:258`) | decides whether a pre-change **backup** is taken; must be bumped by hand on every schema edit (`schema.js:1-5`) |
| `appVersion` | `_meta.appVersion` | informational only; app bumps no longer trigger backups (`migrate.js:297-301`) |

**Application order** (`runMigrationOnce`, `migrate.js:217-302`):

1. `assertDatabaseIntegrity()` — `PRAGMA quick_check` **before any schema mutation or backup
   pruning**; throws `DatabaseCorruptionError` and stops boot (`migrate.js:222`, `integrity.js:41-57`).
2. `_migratedAdapters` WeakSet guard so a reused adapter skips re-run (`migrate.js:16, 218`).
3. Capture `fresh = isFreshDb()` *before* `_meta` is stamped (`migrate.js:227`; `isFreshDb` at `:47-55`
   treats a missing/empty `_meta` as fresh).
4. `pruneOldBackups()` — keeps newest `KEEP_BACKUPS = 3` (`backup.js:14, 65-75`).
5. Bootstrap `_meta`, then if `!fresh && storedSchemaVer < SCHEMA_VERSION` take a **lite** pre-schema
   backup (`backup.js:39-63`, excludes `requestDetails`). Failure here only warns (`migrate.js:246-248`).
6. `runVersionedMigrations()` (`migrate.js:58-77`) — `pending = MIGRATIONS.filter(m => m.version > current)`,
   each run inside **its own `adapter.transaction()`** together with the `schemaVersion` stamp
   (`migrate.js:69-72`). Skip-version safe: a DB at 0 with migrations 1..N applies all of them.
7. `syncSchemaFromTables()` (`migrate.js:80-110`) — additive auto-sync from the declarative `TABLES`:
   `CREATE TABLE IF NOT EXISTS`, then per-column `ALTER TABLE ... ADD COLUMN` for columns absent from
   `PRAGMA table_info`, stripping `PRIMARY KEY`/`UNIQUE` (invalid in ADD COLUMN), then
   `CREATE INDEX IF NOT EXISTS`.
8. Stamp `backupSchemaVersion = SCHEMA_VERSION`.
9. **One-time legacy JSON import** — only when `fresh && hasLegacy && !alreadyImported`
   (`migrate.js:261-295`). Backs up the JSON files first, imports inside one transaction, then writes
   the marker `<DATA_DIR>/db/.migrated-from-json`. A row-count mismatch raises `MigrationAborted`
   (`migrate.js:29-40`) which rolls the transaction back, keeps the legacy JSON, and does **not** write
   the marker, so the next boot retries.

**Idempotency / transactionality — assessment:**

- ✅ Idempotent in practice: `001-initial` is `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT
  EXISTS` (`001-initial.js:9-12`), and `syncSchemaFromTables` is a no-op when nothing is missing.
- ✅ Versioned migrations are transactional, including the version stamp — so a crash mid-migration
  leaves the old `schemaVersion` and the migration re-runs.
- ✅ Legacy import is transactional and has a rollback-on-mismatch safety valve.
- ⚠️ `syncSchemaFromTables()` runs **outside** any transaction, and its `ALTER TABLE` failures are
  caught and only warned (`migrate.js:99-101`). A partially-added column set is possible.
- ⚠️ `ALTER TABLE ADD COLUMN` cannot add `NOT NULL` without a default, and the strip logic can
  therefore produce a column with weaker constraints than `TABLES` declares.
- ⚠️ `importLegacyUsage` inserts `usageHistory` rows without any row-count assertion (unlike the
  other importers) — silent partial usage import is possible.
- ⚠️ Because the import requires `fresh`, and the marker prevents re-import, deleting `data.sqlite`
  does **not** re-import legacy JSON (documented intent at `migrate.js:12-13`).
- ⚠️ A **fresh DB that was never stamped** is treated as fresh, so a DB created by an older build
  with an empty `_meta` can trigger the legacy import path.

---

## 4. `src/lib/db/repos/` inventory

One file per entity, but not one file per table: three repos are thin wrappers over the shared
`kv` scope table.

| File | Table / scope | Entity | Key exports |
|---|---|---|---|
| `repos/settingsRepo.js` | `settings` (singleton row `id=1`) | app settings blob | `getSettings`, `updateSettings`, `isCloudEnabled`, `getCloudUrl`, `exportSettings`, `isApiKeyRequired`, `mergeWithDefaults` |
| `repos/connectionsRepo.js` | `providerConnections` | provider **accounts** (oauth/apikey/access_token) | `getProviderConnections`, `getProviderConnectionById`, `createProviderConnection`, `updateProviderConnection`, `deleteProviderConnection`, `deleteProviderConnectionsByProvider`, `reorderProviderConnections`, `cleanupProviderConnections`, `invalidateConnectionCache`, `resetHealthStateOnActivation` |
| `repos/nodesRepo.js` | `providerNodes` | custom compatible nodes (openai/anthropic-compatible) | `getProviderNodes`, `getProviderNodeById`, `createProviderNode`, `updateProviderNode`, `deleteProviderNode`, `isCustomCompatibleNode` |
| `repos/proxyPoolsRepo.js` | `proxyPools` | outbound proxy pools | `getProxyPools`, `getProxyPoolById`, `createProxyPool`, `updateProxyPool`, `deleteProxyPool` |
| `repos/apiKeysRepo.js` | `apiKeys` | local gateway API keys | `getApiKeys`, `getApiKeyById`, `createApiKey`, `updateApiKey`, `deleteApiKey`, `validateApiKey`, `invalidateApiKeyCache` |
| `repos/combosRepo.js` | `combos` | model-combo fallback chains | `getCombos`, `getComboById`, `getComboByName`, `createCombo`, `updateCombo`, `deleteCombo` |
| `repos/aliasRepo.js` | `kv` scopes `modelAliases`, `customModels`, `mitmAlias` | model aliases, custom models, MITM tool aliases | `getModelAliases`, `setModelAlias`, `deleteModelAlias`, `getCustomModels`, `addCustomModel`, `deleteCustomModel`, `getMitmAlias`, `setMitmAliasAll` |
| `repos/pricingRepo.js` | `kv` scope `pricing` | per-provider/model price overrides | `getPricing`, `getPricingForModel`, `updatePricing`, `resetPricing`, `resetAllPricing` |
| `repos/disabledModelsRepo.js` | `kv` scope `disabledModels` | disabled model ids per provider | `getDisabledModels`, `getDisabledByProvider`, `disableModels`, `enableModels` |
| `repos/usageRepo.js` | `usageHistory`, `usageDaily`, `_meta.totalRequestsLifetime` | per-request usage + daily rollups | `saveRequestUsage`, `getUsageHistory`, `getUsageStats`, `getChartData`, `getRecentLogs`, `appendRequestLog` (no-op), `trackPendingRequest`, `getActiveRequests`, `statsEmitter` |
| `repos/requestDetailsRepo.js` | `requestDetails` | redacted observability records (batched) | `saveRequestDetail`, `getRequestDetails`, `getRequestDetailById`, `getDistinctProviders`, `resolveObservabilityEnabled` |

Support modules: `db/helpers/kvStore.js` (`makeKv(scope)` CRUD), `db/helpers/metaStore.js`
(`get/setMeta` + sync variants for migrations), `db/helpers/jsonCol.js` (`parseJson`/`stringifyJson`
— both fail-soft), `db/backup.js`, `db/integrity.js`, `db/version.js`, `db/schema.js`,
`db/migrate.js`, `db/driver.js`, `db/index.js` (barrel + `exportDb`/`importDb`/`initDb`).

`db/index.js` does **not** re-export `invalidateConnectionCache` / `invalidateApiKeyCache` — see
[§7](#7-risks-gotchas-and-stale-doc-discrepancies).

---

## 5. Credential storage — what is plaintext vs protected

**Headline: every provider credential — API keys, OAuth access tokens, refresh tokens, ID tokens —
is stored in plaintext on disk. There is no encryption layer for provider credentials anywhere in
the persistence path.** The only encrypted value in the whole DB is the MITM sudo password.

### 5.1 `providerConnections` — provider secrets, plaintext JSON

The table hoists only non-secret columns (`schema.js:34-52`); **everything else is jammed into a
single `data` TEXT column**. `connectionsRepo.js:65-79`:

```js
function connToRow(c) {
  const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = c;
  return {
    ...
    data: stringifyJson(rest),   // ← apiKey / accessToken / refreshToken / idToken / providerSpecificData
    ...
  };
}
```

The fields deliberately carried into `rest` are enumerated at `connectionsRepo.js:5-11`:

```js
const OPTIONAL_FIELDS = [
  "displayName", "email", "globalPriority", "defaultModel",
  "accessToken", "refreshToken", "expiresAt", "tokenType",
  "scope", "projectId", "apiKey", "testStatus",
  "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn", "errorCode",
  "consecutiveUseCount", "idToken", "lastRefreshAt",
];
```

plus the untyped `providerSpecificData` object (`connectionsRepo.js:275-277`), which carries
provider-specific secrets such as GitHub/Copilot `copilotToken` (`src/sse/services/auth.js:349`,
`src/sse/services/tokenRefresh.js:196-200, 316-329`) and per-provider cookies/session tokens.

`rowToConn` (`connectionsRepo.js:48-63`) simply `JSON.parse`s `data` back. No
`encrypt`/`decrypt`/cipher call exists on this path — grep for `createCipher|createDecipher|AES|
scrypt|pbkdf2` across `src/lib/db/**` returns **zero** matches.

### 5.2 `apiKeys` — the local gateway key is stored verbatim

`apiKeysRepo.js:47-50`:

```js
db.run(
  `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)`,
  [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.createdAt]
);
```

The key format is `sk-{machineId}-{keyId}-{crc8}` (`src/shared/utils/apiKey.js:34-39`), where `crc8`
is `HMAC-SHA256(API_KEY_SECRET, machineId + keyId).slice(0,8)` (`apiKey.js:20-26`). That HMAC is
**only an 8-hex-char format/integrity checksum** — it is *not* a password hash, it cannot be used to
authenticate without the key, and it is recomputed from the key itself. `validateApiKey`
(`apiKeysRepo.js:79-89`) confirms this with a plaintext equality lookup:

```js
const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
```

So **the DB column is the credential**: anyone who reads `data.sqlite` can present the stored key
to `/v1/*`. `API_KEY_SECRET` protects the *key format*, not the key at rest.

### 5.3 `usageHistory` / `usageDaily` — raw API keys in the usage log

`saveRequestUsage` writes the caller's raw key into the `apiKey` column (`usageRepo.js:309-317`), and
`aggregateEntryToDay` embeds the raw key into the daily bucket name and meta
(`usageRepo.js:123-125`):

```js
const apiKeyVal = entry.apiKey && typeof entry.apiKey === "string" ? entry.apiKey : "local-no-key";
const akModelKey = `${apiKeyVal}|${entry.model}|${entry.provider || "unknown"}`;
addToCounter(day.byApiKey, akModelKey, { ...vals, meta: { ..., apiKey: entry.apiKey || null } });
```

Masking happens **only on read/response** (`maskApiKey`, `usageRepo.js:8-12`; `apiKeyIdentity`
deliberately avoids returning the secret, `:14-29`). Storage is raw.

### 5.4 `settings` — mixed: one bcrypt hash, one AES value, several plaintext secrets

| Setting key | Protection | Evidence |
|---|---|---|
| `password` (dashboard login) | **bcrypt hash**, `genSalt(10)` | `src/app/api/settings/route.js:149-150`, `src/app/api/auth/change-password/route.js:37-38`; verified with `bcrypt.compare` (`src/lib/auth/dashboardSession.js:144`) |
| `mitmSudoEncrypted` | **AES-256-GCM**, key = `sha256(machineIdSync() + "zenrouter-mitm-pwd")`, format `iv:tag:ciphertext` | `src/mitm/manager.js:97-98, 154-171` |
| `oidcClientSecret` | **plaintext** (in the settings JSON blob; allowed at DB layer `settingsRepo.js:36`, blocked from mass-assignment at route layer) | `settingsRepo.js:11-79`, `src/app/api/settings/route.js:62-85, 90-91` |
| `samlCert`, `outboundProxyUrl`, `tunnelUrl` | **plaintext** | `settingsRepo.js:41-53, 129-131` |
| `providerStrategies`, `quotaVisibility`, `dnsToolEnabled` | plaintext | `settingsRepo.js` defaults |

Note on the AES key (`mitm/manager.js:154-162`): it is **machine-derived, not passphrase-derived**,
and the `catch` branch derives the key from the hard-coded salt alone:

```js
function deriveKey() {
  try { const raw = machineIdSync(); return crypto.createHash("sha256").update(raw + ENCRYPT_SALT).digest(); }
  catch { return crypto.createHash("sha256").update(ENCRYPT_SALT).digest(); }
}
```

`MACHINE_ID_SALT` is **not** used here. So `mitmSudoEncrypted` is obfuscation-grade at best: the
salt is in the source (`ENCRYPT_SALT = "zenrouter-mitm-pwd"`, `:98`) and the machine identity is a
file next to the DB (`<DATA_DIR>/machine-id`, 0600).

### 5.5 The three real secrets — plaintext in `secrets.json` (0600)

`cli/hooks/runtimeSecrets.js:79-112` auto-generates and persists `JWT_SECRET`, `API_KEY_SECRET`,
`MACHINE_ID_SALT` to `<DATA_DIR>/secrets.json`, written atomically (temp + `rename`) with
`{ mode: 0o600 }` (`:63-69`). Values are `crypto.randomBytes(32).toString("hex")`. This file **is**
the root of trust for session cookies and key-format checksums, and it is plaintext — but it is at
least correctly permissioned, unlike the DB (see §7).

`JWT_SECRET` is otherwise required from env with no fallback (`src/lib/auth/dashboardSession.js:43-49`,
min 32 chars, rotation via `JWT_SECRET_OLD`). `MACHINE_ID_SALT` defaults to the constant
`'endpoint-proxy-salt'` if unset (`src/shared/utils/machineId.js:50`) — a shared default.

### 5.6 Where credentials *are* protected (read paths)

These are output-side mitigations, not at-rest protections — worth stating so the finding is precise:

| Surface | Mitigation |
|---|---|
| `GET/PUT /api/providers/[id]` | deletes `apiKey`, `accessToken`, `refreshToken`, `idToken` from the response (`src/app/api/providers/[id]/route.js:72-79, 160-166`) |
| `POST /api/providers` | `delete result.apiKey` etc. (`src/app/api/providers/route.js:81-83, 205`) |
| `GET /api/providers/client` | field allow-list `sanitize()` + `maskName()` (`src/app/api/providers/client/route.js:32-50`) |
| `GET /api/settings` | strips `password` and `oidcClientSecret`, returns `hasPassword`/`oidcConfigured` booleans (`src/app/api/settings/route.js:90-103`) |
| `GET/POST /api/settings/database` | dual auth (JWT **and** API key/CLI token) **plus** password re-auth (`src/app/api/settings/database/route.js:28-35`) — but on success it returns the **full plaintext export** including every `data` blob (`db/index.js:77`) |
| `requestDetails` records | request/response payloads replaced with `{redacted:true}` and sensitive headers stripped (`requestDetailsRepo.js:58-79, 96-112`) |

The dashboard UI claims otherwise. `src/app/(dashboard)/dashboard/providers/new/page.js:163`:

> `hint="Your API key will be encrypted and stored securely."`

**That string is false.** There is no encryption of provider API keys, at rest or in transit to the DB.

### 5.7 Summary table — field by field

| Field / location | Storage | Protected? |
|---|---|---|
| `providerConnections.data.accessToken` | plaintext JSON in SQLite | ❌ |
| `providerConnections.data.refreshToken` | plaintext JSON in SQLite | ❌ (highest impact — long-lived) |
| `providerConnections.data.idToken` | plaintext JSON in SQLite | ❌ |
| `providerConnections.data.apiKey` | plaintext JSON in SQLite | ❌ |
| `providerConnections.data.providerSpecificData.*` (e.g. `copilotToken`, cookies) | plaintext JSON in SQLite | ❌ |
| `apiKeys.key` | plaintext column | ❌ |
| `usageHistory.apiKey`, `usageDaily.byApiKey` keys | plaintext (masked on read only) | ❌ |
| `settings.password` | bcrypt (cost 10) | ✅ (one-way) |
| `settings.mitmSudoEncrypted` | AES-256-GCM, machine-derived key | ⚠️ weak (obfuscation) |
| `settings.oidcClientSecret`, `samlCert` | plaintext JSON | ❌ |
| `secrets.json` (`JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT`) | plaintext, mode 0600 | ⚠️ plaintext but permissioned |
| `<DATA_DIR>/machine-id`, `<DATA_DIR>/auth/cli-secret` | plaintext, mode 0600 | ⚠️ plaintext but permissioned |

**Observed on the audited host:** `data.sqlite` is mode **0644** and `db/` is **0755**, while
`secrets.json` and `machine-id` are **0600**. The file that holds the provider tokens is the
world-readable one.

---

## 6. Data model

```
settings (singleton, id=1)            — app config blob (password hash, SSO, tunnel, MITM, flags)
providerNodes (id)                    — custom compatible endpoints (baseUrl, apiType, prefix)
        │  soft reference (node id / provider alias string)
        ▼
providerConnections (id, provider)    — one ROW per ACCOUNT; secrets in `data` JSON blob
        │  soft reference (connectionId, no FK)
        ├──▶ usageHistory (id AUTOINCREMENT, connectionId)   — one row per request
        │         └──▶ usageDaily (dateKey)                  — per-day rollup of the above
        └──▶ requestDetails (id, connectionId)               — redacted observability records
apiKeys (id, key UNIQUE)              — local gateway keys; independent of accounts
combos (id, name UNIQUE, models JSON) — ordered model list; names resolve via modelAliases
kv (scope, key) PK                    — modelAliases | customModels | mitmAlias | pricing | disabledModels
_meta (key)                           — schemaVersion, backupSchemaVersion, appVersion,
                                        totalRequestsLifetime, migratedAt
```

**Relationships are logical, not enforced.** No table declares a `FOREIGN KEY`
(`schema.js:21-155`), so `PRAGMA foreign_keys = ON` (`schema.js:14`) has nothing to enforce; deleting
a `providerConnections` row leaves orphaned `usageHistory.connectionId` values (the read path falls
back to `Account <id.slice(0,8)>…`, e.g. `usageRepo.js:445`).

**Notable modelling details**

- `settings` is a single-row table with a `CHECK (id = 1)` and a JSON blob (`schema.js:28-33`) — there
  is **no users table**; auth is one password plus optional SSO (`settings.password`, `authMode`).
- `combos.models` is a JSON array of *model strings*, not FK ids (`combosRepo.js:42, 48`).
- `modelAliases` maps alias → model string in `kv` (`aliasRepo.js:9-20`).
- `customModels` key is the composite `` `${providerAlias}|${id}|${type}` `` (`aliasRepo.js:23-25`).
- `usageDaily` buckets are keyed by `byProvider` / `byModel` / `byAccount` / `byApiKey` / `byEndpoint`,
  each a counter object; the `byApiKey` bucket name embeds the **raw** key (`usageRepo.js:123-125`).
- `requestDetails` is auto-pruned to `observabilityMaxRecords` (default 200) inside the flush
  transaction (`requestDetailsRepo.js:120-126`).
- `_meta.totalRequestsLifetime` is incremented inside the same transaction as the history insert
  (`usageRepo.js:336-338`).
- `schema.js` is the declarative source of truth; `SCHEMA_VERSION` is a **manual** bump that only
  controls whether a backup is taken (`schema.js:1-6`) — additive changes still auto-apply without it.

---

## 7. Risks, gotchas, and stale-doc discrepancies

### Stale documentation

| Claim | Location | Reality |
|---|---|---|
| "usage DB: `~/.zenrouter/usage.json`, `~/.zenrouter/log.txt` … independent from `DATA_DIR`" | `docs/ARCHITECTURE.md:155-159` | Both files are gone. Usage/logs are `usageHistory`/`usageDaily`/`requestDetails` rows inside `<DATA_DIR>/db/data.sqlite`; `appendRequestLog` is a no-op (`usageRepo.js:805-806`) |
| "per-request usage aggregates in `usage.json`; textual request status log in `log.txt`" | `docs/ARCHITECTURE.md:595-596` | Stale; `getRecentLogs()` synthesises lines from `usageHistory` (`usageRepo.js:808-838`) |
| "Usage/logs … still live under `~/.zenrouter` and do **not** follow `DATA_DIR`" | `CLAUDE.md:79` | Inverted. Only MITM/translator debug logs are outside `DATA_DIR` |
| "legacy `db.json`/`usage.json` kept only for migration" | `docs/ARCHITECTURE.md:405` | Correct for `db.json`/`usage.json`, but the reader is `paths.js:8-13`; note `LEGACY_FILES.usage` is `<DATA_DIR>/usage.json`, i.e. it *did* follow `DATA_DIR` |
| `docs/ARCHITECTURE.md` §3 does describe SQLite correctly | `:136-153` | Accurate (driver chain, integrity gate, backup path) — the staleness is confined to the usage-DB paragraph and the observability list |
| Cloud-sync sections and env matrix | `docs/ARCHITECTURE.md:182-186, 299-331, 606` | **Routes and schedulers do not exist**: no `src/app/api/sync/`, no `src/app/api/cloud/`, no `src/lib/initCloudSync.js`, no `src/shared/services/cloudSyncScheduler.js`. Only `settings.cloudEnabled` / `getCloudUrl` remain |
| Dashboard hint "Your API key will be encrypted and stored securely" | `src/app/(dashboard)/dashboard/providers/new/page.js:163` | False — see §5 |

### Correctness / consistency gotchas

1. **`exportDb`/`importDb` are asymmetric.** `importDb` wipes and rewrites `modelAliases`,
   `customModels`, `mitmAlias`, `pricing` — but **not** `disabledModels` (`db/index.js:110`), and
   `exportDb` never emits `disabledModels` at all (`db/index.js:75-93`). Round-tripping a backup
   silently preserves the *current* disabled-model set. Usage/`requestDetails` are also excluded
   from export (config-only export).
2. **`importDb` does not invalidate caches.** `db/index.js:96-166` never calls
   `invalidateConnectionCache()` / `invalidateApiKeyCache()`, and `db/index.js` doesn't even
   re-export them (`:11-33`). `connectionCache` (`connectionsRepo.js:105-133`) has **no TTL** — it is
   cleared only by a write through `create/update/deleteProviderConnection`. So after a DB import,
   `getProviderConnections()` can keep serving the pre-import account list (with the old tokens)
   for the life of the process. `settingsRepo`'s 2 s raw cache (`settingsRepo.js:149-166`) self-heals;
   `apiKeyCache` does not until the next key write.
3. **`deleteProviderConnectionsByProvider` is not transactional** (`connectionsRepo.js:325-331`) —
   a single `DELETE ... WHERE provider = ?` (fine), but it reads a count first outside any
   transaction.
4. **`reorderInTx` is O(pool) and runs inside the write transaction** on update/delete
   (`connectionsRepo.js:150-163, 304, 318`). Inserts deliberately skip it (`:281-285`), which is why
   the delete path is the expensive one.
5. **`resetHealthStateOnActivation` preserves "manual" model locks** that expire more than 24 h out
   (`connectionsRepo.js:29-43`) — an operator kill-switch (year-2099 lock) survives an account
   reactivation by design; runtime cooldowns are cleared.
6. **`usageRepo` per-request dedup is by object identity**, not by field equality
   (`usageRepo.js:296-307`): the same `entry` object re-saved updates the stored row via
   `entry._persistedUsageId`. Two distinct requests completing in the same millisecond both persist
   (intended). But any caller that *clones* the entry before a retry will duplicate a row.
7. **`requestDetails` buffer is module-scoped, not global** (`requestDetailsRepo.js:54-56`) — a
   Next.js hot reload drops buffered records; `ensureShutdownHandler` re-registers `process.on`
   handlers each call (`:205-217`) without an idempotency guard beyond `off`-then-`on`.
8. **`kv` has no `NOT NULL`/`CHECK` on scope naming** — scopes are string conventions
   (`modelAliases`, `customModels`, `mitmAlias`, `pricing`, `disabledModels`), easy to typo and
   silently read back empty.
9. **`_meta` is written outside transactions in places** (`metaStore.js:11, 21`) — the
   `totalRequestsLifetime` counter *is* inside the usage transaction (`usageRepo.js:336-338`), but
   `appVersion`/`backupSchemaVersion` stamps are not.
10. **File permissions are inconsistent.** `data.sqlite` 0644 / `db/` 0755 vs `secrets.json` 0600
    and `machine-id` 0600 (observed). Nothing in the code chmods the DB or its directory.
11. **`mitmAliasCache.js` duplicates the `DATA_DIR` resolver** instead of importing
    `src/lib/dataDir.js` (`mitmAliasCache.js:9-12`) — no legacy `~/.9router` fallback, no
    EACCES fallback, so the MITM JSON replica can diverge from the DB's directory on edge configs.
12. **`getUsageStats` is O(all daily rows)** when `period` is not `24h`/`today`/`7d`/`30d`/`60d`
    (`usageRepo.js:371-379, 483-486`) — `maxDays = null` loads the whole `usageDaily` table.
13. **`saveRequestUsage` swallows errors** (`usageRepo.js:346-348`) — usage loss is a log line, never
    a surfaced failure.
14. **`apiKeyIdentity` hashes unregistered keys with a bare SHA-256** and truncates to 12 hex chars
    (`usageRepo.js:28`) — a 48-bit digest of a low-entropy secret; it is a bucketing identifier, not
    a security boundary, but it is derived from the secret and does reach responses.

### Race conditions

| Race | Where | Impact |
|---|---|---|
| Two processes write `data.sqlite` under `sql.js` | `sqljsAdapter.js:47-82` | Whole-image last-writer-wins clobber; no locking, no error |
| Process dies inside the 100 ms save debounce | `sqljsAdapter.js:23, 73-82` | Committed-looking transaction lost |
| Hot-reload re-init registers duplicate `process.once` shutdown handlers | all adapters | Duplicate checkpoints/closes; noisy but non-fatal |
| `importDb` vs in-process connection cache | `db/index.js:96` + `connectionsRepo.js:105-133` | Stale accounts/tokens served indefinitely |
| `settings` read-modify-write | `settingsRepo.js:203-225` | Safe — inside a transaction |
| `pricing` / `disabledModels` read-modify-write | `pricingRepo.js:73-91`, `disabledModelsRepo.js:21-56` | Safe — inside transactions |
| OAuth refresh-token rotation overwrite | `connectionsRepo.js:293-309` | Mitigated: atomic merge inside a transaction, plus Codex-specific identity matching (`:188-223`) so a second login does not clobber the first token pair |
| `better-sqlite3` transactions block the event loop | `betterSqliteAdapter.js:47` | Correctness is fine (sync), but long transactions stall the gateway |

### Prioritised recommendations

1. **Encrypt provider credentials at rest** (`providerConnections.data`, `apiKeys.key`), or at
   minimum store `apiKeys.key` as a hash and stop persisting raw keys into `usageHistory`.
   This is the single highest-value fix; today a `data.sqlite` copy is a full credential dump.
2. **Fix the false UI claim** at `providers/new/page.js:163` until (1) lands.
3. **chmod 0600 `data.sqlite`** (and consider 0700 for `<DATA_DIR>`), matching `secrets.json`.
4. **Make `importDb` invalidate caches** (export the invalidators, call them), and include
   `disabledModels` symmetrically in `exportDb`/`importDb`.
5. **Refuse to run the `sql.js` fallback in multi-process mode**, or add a lockfile/`O_EXCL` guard —
   today the "always works" driver is the one that silently loses data.
6. **Flush `sql.js` synchronously at transaction end** (or drop the debounce to a
   flush-on-commit) so a RELEASE is actually durable.
7. **Correct `docs/ARCHITECTURE.md` §3/observability** and **`CLAUDE.md:79`** — the usage-DB claim is
   now backwards.
8. **Remove or clearly mark the cloud-sync sections** of `ARCHITECTURE.md`; the code paths do not exist.
9. **Add row-count assertions to `importLegacyUsage`** and wrap `syncSchemaFromTables` in a transaction.
10. **Derive the MITM AES key from a real secret** (e.g. `API_KEY_SECRET` or a user passphrase) rather
    than `machineIdSync()` + a hard-coded salt, and drop the salt-only `catch` fallback.
