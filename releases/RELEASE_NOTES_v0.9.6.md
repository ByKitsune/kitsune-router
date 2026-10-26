# 🌿 ZenRouter v0.9.6 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.9.6` is an immediate critical hotfix release addressing connection lifecycle issues, erroneous model lockouts during client-side cancellations, and compound rate-limit reset duration parsing observed in live production telemetry.

---

## 🛠️ Critical Hotfix Details

### 1. Client Abort Short-Circuiting & Model Lock Immunity (`src/sse/handlers/chat.js`)
- **Problem**: When a client user disconnected, closed their browser tab, or clicked "Stop / Cancel" during an active streaming request, the resulting `client_aborted` / 499 status was passed to `markAccountUnavailable`. This caused healthy upstream accounts (such as Google Antigravity or Codex accounts) to receive an erroneous 30-second `modelLock_*` lock, unnecessarily knocking them out of rotation.
- **Fix**: Short-circuited client-aborted requests (`request.signal.aborted`, `client_aborted`, or status `499`) immediately after handler completion. Account error locking and combo failover loops are bypassed, preventing cascade failures and preserving account availability.

### 2. MITM Direct-IP Bypass Cooldown Immunity (`open-sse/utils/proxyFetch.js`)
- **Problem**: In environments using DNS spoofing or local hosts overrides, client-side cancellations (`AbortError`) caught in `proxyFetch` triggered a 15-minute cooldown (`markMitmBypassCooldown`). This temporarily disabled direct-IP routing to `daily-cloudcode-pa.sandbox.googleapis.com` and `cloudcode-pa.googleapis.com`, resulting in degraded performance or timeouts on subsequent requests.
- **Fix**: Added explicit guards for `AbortError`, `options.signal.aborted`, and abort error codes, ensuring client cancellations never trip the 15-minute direct-IP bypass cooldown.

### 3. Compound Reset Duration Parsing (`open-sse/services/accountFallback.js`)
- **Problem**: Upstream providers and proxy relays frequently emit compound reset duration strings (e.g. `reset after 1m 51s`, `Resets in 4m22s.`, `Resets in 99h31m0s.`, `Resets in 41.67s.`) wrapped in HTTP 403 or 503 responses. Previously, `extractResetsAtMs` only handled single-unit strings under status 429, causing ZenRouter to default to a 30-second cooldown and repeatedly pound rate-limited accounts.
- **Fix**: Implemented compound duration regex parsing (`\d+h`, `\d+m`, `\d+s`) and enabled reset extraction across HTTP 429, 403, and 503 error payloads.

---

## 🧪 Verification & Quality Gate

- **Unit Test Suite**: Added `tests/unit/client-abort-and-compound-reset.test.js` validating client abort immunity and compound duration parsing across all supported status codes.
- **Full Test Suite (Node 1)**: All 414 test suites passing (3,464 tests passed, 0 failures).
- **CI Automation**: Verified via GitHub Actions test and standalone compilation.
