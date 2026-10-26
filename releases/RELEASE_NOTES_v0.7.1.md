# ZenRouter v0.7.1 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.7.1` is a targeted patch: it fixes a total Antigravity outage where every account failed with `403 PERMISSION_DENIED` on the shared free-tier project.

## Fix

### 🔥 Antigravity 403 — Root Cause Fixed
- **Symptom**: All Antigravity connections failed with `Caller does not have required permission to use project aicode-consumers`, while token refresh, `loadCodeAssist` (200, free-tier), and `onboardUser` (done) all succeeded. Same signature as upstream reports `decolua/9router#1059`, `#2461`, `#2932` (all still open; upstream fix PR #2471 was closed unmerged).
- **Root cause**: The gateway attached `x-goog-user-project: aicode-consumers` to every chat request. Google treats that header as "bill/attribute to this project" and enforces `serviceusage.services.use` — which the shared project denies to third-party OAuth callers.
- **Proof**: Live A/B against `daily-cloudcode-pa` — the identical envelope 403s with the header and passes the project gate without it. Verified end-to-end on a live Google AI Pro connection: `ag/gemini-3.8-flash-high` returns HTTP 200.
- **Change**: `open-sse/executors/antigravity.js` no longer sends the header (the project still travels in the body envelope's `project` field). Same approach as the working `opencode-antigravity-auth` reference, which strips this header to prevent 403 auth/license conflicts.
- **Not the model IDs**: The `(tier)` suffix in registry `upstreamModelId` values never reaches the wire — `chatCore.js` strips it via `stripThinkingSuffix` into `thinkingLevel`, matching the exact IDs from live `fetchAvailableModels`. No registry change.

### ✅ Validation
- Full suite: **2,509 tests passing, 0 failures**. ESLint clean.
- Live gateway test post-deploy: `ag/gemini-3.8-flash-high` → HTTP 200.
