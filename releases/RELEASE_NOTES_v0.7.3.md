# ZenRouter v0.7.3 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.7.3` aligns OAuth authentication architecture 100% with upstream 9Router standards, resolving callback mismatch issues with desktop/installed-app providers (Claude Code CLI, Google Antigravity, Gemini CLI).

---

## Highlights

### 🔄 Upstream 9Router OAuth Standard Restoration
- **Eliminated Custom Domain Mismatch (#4054)**: Reverted experimental public tunnel callback routing that caused upstream authorization errors (`Redirect URI is not supported by client`) on providers with strict loopback client IDs (such as Anthropic Claude Code and Google Desktop clients).
- **Restored Upstream Loopback Architecture**: All installed-app OAuth flows now cleanly use standard loopback ports (`http://localhost:${appPort}/callback`, Codex `1455`, xAI `56121`).
- **Synchronized UI Modal & Exchange Routes**: Reverted `OAuthModal.js` and `/api/oauth/[provider]/[action]/route.js` directly to upstream `decolua/9router` master to ensure seamless popups, direct code copy-pasting, and standard authorization flow compatibility.

### 🛡️ Full Suite Verification
- **100% Green Test Suite**: 323 test files (2,571 unit and integration tests) verified and passing without regression.
