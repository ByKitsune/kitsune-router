# Subscription and OAuth Providers

Kitsune Router can connect supported OAuth/subscription-backed providers alongside API-key and local-compatible services. Subscription is a connection/billing category, not a mandatory first routing tier.

## Connect an account

1. Open Providers in `http://localhost:20128/dashboard`.
2. Choose the actual supported product (for example Codex, Claude Code, Gemini CLI or Copilot) and follow its OAuth/device flow.
3. Verify account status and available models in your installation. Reauthorize when the upstream reports invalid/revoked credentials.
4. Add a direct route or combo in your chosen order and use a **gateway key** in clients, not the upstream refresh token.

Product plans and transports differ. A public API subscription, coding-plan allowance and IDE entitlement are not interchangeable. No fixed monthly quotas/prices or universal model access are asserted here. Confirm the provider's current terms, region, plan and automation permissions before use. Routing does not create entitlement or evade limits.

## Quotas and cost

Quota windows are route/account-specific where observed; unknown values stay unknown. Fast/Ultrafast selection is separate from reasoning and may consume more allowance. API reference USD rates do not become subscription invoices. See [usage](/en/features/quota-tracking/).

No ByKitsune account or hosted purchase is required, and no sponsor is automatically prioritized. [API-key providers](/en/providers/cheap/) and [free/local options](/en/providers/free/) can be ordered as you choose. Preserve OAuth/secrets during [migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md); not all locally stored credentials are guaranteed encrypted at rest.
