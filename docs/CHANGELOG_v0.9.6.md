# 🌿 ZenRouter v0.9.6 Changelog & Hotfix Documentation

> **Kitsune Router archive:** this dated ZenRouter record keeps its original names, artifacts and evidence; it is not current installation or verification guidance. See [current docs](INSTALLATION.md) and [migration](MIGRATION.md).

This document provides technical documentation for the ZenRouter **v0.9.6** hotfix release.

---

## 📌 Executive Summary

- **Version**: `0.9.6`
- **Release Date**: 2026-10-02
- **Previous Version**: `0.9.5`
- **Scope**: Hotfix addressing client abort account lockouts, MITM direct-IP bypass cooldown prevention, and compound rate-limit reset duration parsing across 403, 429, and 503 upstreams.

---

## 🛠️ Hotfix Root Causes & Implementations

### 1. Client Abort Model Lockout Prevention
- **Root Cause**: When a streaming turn was cancelled by a client (`client_aborted`), `chat.js` treated the resulting 502/499 status as an upstream failure and invoked `markAccountUnavailable()`, persisting a 30-second `modelLock_*` timestamp on the healthy account.
- **Implementation**:
  In `src/sse/handlers/chat.js`:
  ```javascript
  const isClientAborted = request?.signal?.aborted || result.error === "client_aborted" || Number(result.status) === 499;
  if (isClientAborted) {
    log.warn("CHAT", "Client aborted before upstream completion");
    return result.response || createErrorResponse(499, "Client Closed Request");
  }
  ```
  In `open-sse/services/accountFallback.js`:
  ```javascript
  if (status === 499 || lowerError.includes("client_aborted") || lowerError.includes("aborted")) {
    return { shouldFallback: false, cooldownMs: 0 };
  }
  ```

### 2. MITM Bypass Cooldown Protection
- **Root Cause**: In `open-sse/utils/proxyFetch.js`, the general `catch (error)` block in `createBypassRequest` caught `AbortError` when clients cancelled requests, triggering `markMitmBypassCooldown(bypassHost)` and disabling direct-IP bypass for 15 minutes.
- **Implementation**:
  Added guard to ignore `AbortError` and `signal.aborted` before triggering cooldown:
  ```javascript
  if (options?.signal?.aborted || error?.name === "AbortError" || error?.message === "aborted" || error?.code === "ABORT_ERR") {
    throw error;
  }
  ```

### 3. Compound Duration Reset Extraction
- **Root Cause**: Upstream errors reporting `reset after 1m 51s`, `Resets in 4m22s.`, or `Resets in 99h31m0s.` were not parsed by the single-token regex and were restricted to HTTP 429 only.
- **Implementation**:
  In `open-sse/services/accountFallback.js`, updated `extractResetsAtMs` to parse hours, minutes, and seconds, and enabled extraction across 429, 403, and 503 HTTP responses.

---

## 🧪 Verification Evidence

- `tests/unit/client-abort-and-compound-reset.test.js`: Passed 3/3 tests.
- Full Vitest suite on Worker Node 1: Passed 414/414 files, 3,464 tests.
