# Translation Layer Tests

These suites verify the **Kitsune Router** engine maintained by **ByKitsune**.
Use isolated state and the `KITSUNE_ROUTER_*` environment names. Historical
upstream issue references remain provenance, not product branding.

Tests for `open-sse/translator/`. Goals: data-driven protocol coverage and regression tests for information lost at format boundaries. Do not equate a catalog matrix entry with verified live-provider behavior.

## 1. Translation layer structure (`open-sse/translator/`)

Pipeline uses **OpenAI as the intermediate format**:
- Request: `source → openai → target` (`translateRequest`)
- Response (SSE chunk): `target → openai → source` (`translateResponse`)
- A registered direct request route bypasses the intermediate format.
- If `source === target`, conversion is skipped, but shared request preparation, capability policy and thinking normalization can still run.

Components:
- `index.js` — `translateRequest` / `translateResponse` / `register(from, to, requestFn, responseFn)` / registry.
- `formats.js` — `FORMATS` enum (openai, claude, gemini, gemini-cli, openai-responses, antigravity, kiro, cursor, commandcode, ollama, vertex).
- `request/<from>-to-<to>.js` — one-way request translation.
- `response/<from>-to-<to>.js` — one-way SSE response translation.
- `schema/` — pure data enums (no logic): `roles.js` (ROLE, GEMINI_ROLE), `blocks.js` (OPENAI_BLOCK, CLAUDE_BLOCK, RESPONSES_ITEM, valid-type lists), `finishReasons.js` (OPENAI_FINISH, CLAUDE_STOP, GEMINI_FINISH), `defaults.js` (MODEL_FALLBACK, DEFAULT_IMAGE_MIME). Import via `schema/index.js`.
- `concerns/` — cross-format translation LOGIC: `chunk.js`, `usage.js`, `reasoning.js`, `thinking.js` (effort↔budget/level), `toolCall.js`, `finishReason.js` (mapping fns), `image.js`, `json.js`.
- `formats/` — per-format logic: `openai.js` (filterToOpenAIFormat), `claude.js`, `gemini.js`, `responsesApi.js`, `maxTokens.js`.

**OpenAI-bridge pitfalls** (source of most bugs): going through OpenAI easily loses `thinking`/`reasoning`, image URLs (non-base64), `input_audio`, `is_error`; tool `id`/`index` become unstable (parallel tool calls), non-text system blocks, `tool_choice:"none"`.

## 2. Test layout

| File | Role |
|---|---|
| `matrix.js` | Reads `PROVIDER_MODELS` → builds matrix (alias, model, targetFormat, strip, upstreamId). DRY core. |
| `registerAll.js` | Explicit registration helper retained by existing tests; production also uses static imports (see §5). |
| `coverage-all-models.test.js` | Covers registry entries explicitly declaring image stripping, not every model. |
| `format-roundtrip.test.js` | Tier 2: tool id/system/parallel survive the bridge. |
| `bugs-openai-bridge.test.js` | Exposes concrete bugs (with source file:line). |

## 3. Running

Always pass `--config tests/vitest.config.js` (the alias config lives there; without it vitest may not resolve `@/...` subpaths).

```bash
# no-cred (default, offline): translator-only files
npm test -- tests/translator/
npm test -- tests/translator/bugs-openai-bridge.test.js

# real (calls live providers using credentials from the local DB)
RUN_REAL=1 npm test -- tests/translator/real/
```
Run from the repository root with isolated HOME/DATA_DIR and no production `.env`.
Default tests need no live credentials, but can use loopback sockets, subprocesses
and temporary files. Live suites read configured accounts and can incur usage.
Some surveys accept unavailable models or account errors without failing; inspect
their logs and do not report these outcomes as working vision or live acceptance.
See `tests/README.md` for complete gates and opt-in flags.

## 4. Adding a new provider

Follow `open-sse/AGENTS.md` and the provider registry's current structure. The
matrix reads `PROVIDER_MODELS`, but its consumers select subsets. Add a behavioral
case for each new transport contract; a no-throw assertion is not proof that the
image, tool result, reasoning control or output cap reached the correct wire field.

## 5. Translator registration

`translator/index.js` uses static imports and translators register as module side
effects. Existing tests may keep `import "./registerAll.js"`. New translators must
also be imported by production; assertions must inspect the destination shape so
a missing registration cannot masquerade as successful passthrough.

## 6. Bug-exposure convention — `it.fails`

- Existing `it.fails(...)` cases record confirmed limitations that are not yet fixed.
- `it.fails` **passes while the app still has the bug**, **turns red once the bug is fixed** → a reminder to update the test (switch `it.fails` → `it` and confirm correct behavior).
- New fixes start with ordinary failing regressions, then make them pass. Do not use `it.fails`, skip flags or weakened assertions to hide a regression in a change being delivered.

## 7. Special formats to watch

- `kiro` (binary AWS EventStream), `cursor` (protobuf ConnectRPC), `commandcode` (NDJSON) → responses do NOT round-trip cleanly through openai; test via their executors, not just the translator.
- Single-provider-two-formats (most fragile): `opencode-go` (minimax models → claude, others openai), `github` (escalates `/chat/completions` → `/responses` at runtime), `xiaomi-tokenplan` (claude alias).
- `gemini`/`gemini-cli`: inspect all system instructions and typed history, not just the final user message. Include tool images and compaction-shaped inputs.

## 8. Historical expected failures and current explicit limits

The October reconciliation replaces the former three expected-failure markers
with ordinary behavioral regressions: compatible-Claude requests do not acquire
a Claude Code identity prompt; unsupported Claude audio fails explicitly rather
than disappearing; Kiro remote images must be securely fetched and lowered to
real native image bytes on the public execution path. A synchronous Kiro
serializer cannot fetch an unresolved URL and must not invent a destination
field or turn it into image-looking prose.

Check executable tests rather than old audit counts. Explicit unsupported cases
are not claims of feature support: Claude audio and unverified
Antigravity-Claude structured-output fields remain unsupported. Preserve bytes,
ordering, tool ownership and native semantics, and exercise the actual public
translation/execution route when changing these boundaries.
