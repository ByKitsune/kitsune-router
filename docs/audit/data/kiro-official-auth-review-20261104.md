# Kiro authentication source comparison and OAuth regression results

The implemented changes validate credential destinations, require successful typed grants, reject redirects, redact upstream payloads from errors, and make denied account provisioning terminal. No provider client versions or fingerprints were changed.

## First-party sources

- Public Kiro repository: <https://github.com/kirodotdev/Kiro>, cloned at `bfe7ff30d9b21e583566c844d75e3dd2b572e2c7` into `/workspace/.cloud-setup/kitsune-router/kiro-official-public`. [README.md:19](https://github.com/kirodotdev/Kiro/blob/bfe7ff30d9b21e583566c844d75e3dd2b572e2c7/README.md#L19) explicitly says product source code is not hosted there. It contains the issue tracker and its automation.
- AWS-owned predecessor client: <https://github.com/aws/amazon-q-developer-cli>, cloned at `15cc8f3cd18c4272925ce1c7053268eedff1ea0a` into `/workspace/.cloud-setup/kitsune-router/aws-amazon-q-developer-cli-official`. [README.md:4](https://github.com/aws/amazon-q-developer-cli/blob/15cc8f3cd18c4272925ce1c7053268eedff1ea0a/README.md#L4) explicitly identifies the successor Kiro CLI as closed source. This is a first-party AWS OIDC baseline, not a claim to possess current proprietary Kiro client source.
- [Kiro authentication documentation](https://kiro.dev/docs/getting-started/authentication/) documents GitHub, Google, AWS Builder ID, IAM Identity Center, and organization identity providers.
- AWS [RegisterClient](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/API_RegisterClient.html), [StartDeviceAuthorization](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/API_StartDeviceAuthorization.html), and [CreateToken](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/API_CreateToken.html) document the JSON request and response contracts. Downloaded HTML and SHA-256 provenance are in `/workspace/.cloud-setup/kitsune-router/kiro-official-docs/manifest.json`.

## Compared behavior

- [builder_id.rs:87](https://github.com/aws/amazon-q-developer-cli/blob/15cc8f3cd18c4272925ce1c7053268eedff1ea0a/crates/chat-cli/src/auth/builder_id.rs#L87) constructs `https://oidc.{region}.amazonaws.com`; [line 148](https://github.com/aws/amazon-q-developer-cli/blob/15cc8f3cd18c4272925ce1c7053268eedff1ea0a/crates/chat-cli/src/auth/builder_id.rs#L148) verifies the stored registration region. Lines 246, 344, and 537 preserve that region through authorization, refresh, and polling. Kitsune now validates persisted/imported regions at every assigned credential-bearing destination and refreshes Builder-ID grants in their registration region.
- [builder_id.rs:255](https://github.com/aws/amazon-q-developer-cli/blob/15cc8f3cd18c4272925ce1c7053268eedff1ea0a/crates/chat-cli/src/auth/builder_id.rs#L255) starts device authorization with client ID, client secret, and start URL. [Line 553](https://github.com/aws/amazon-q-developer-cli/blob/15cc8f3cd18c4272925ce1c7053268eedff1ea0a/crates/chat-cli/src/auth/builder_id.rs#L553) uses device grant, device code, and the same registered credentials. AWS REST documentation confirms `POST /client/register`, `POST /device_authorization`, and `POST /token` with the camelCase fields retained by Kitsune.
- [builder_id.rs:410](https://github.com/aws/amazon-q-developer-cli/blob/15cc8f3cd18c4272925ce1c7053268eedff1ea0a/crates/chat-cli/src/auth/builder_id.rs#L410) refreshes with the registered client ID/secret, refresh token, and `refresh_token` grant. Kitsune's refresh request retains those fields.
- [builder_id.rs:561](https://github.com/aws/amazon-q-developer-cli/blob/15cc8f3cd18c4272925ce1c7053268eedff1ea0a/crates/chat-cli/src/auth/builder_id.rs#L561) completes only a successful SDK response and separately recognizes a typed pending error at line 571. AWS CreateToken documents HTTP 200 and string access/refresh tokens, numeric expiry, and bearer token type. Kitsune now refuses non-success responses even if their bodies contain an access token, rejects malformed successful grants, and retains explicit pending/slow-down/expired/denied device states.
- Existing provider-declared registration metadata and social endpoint fields remain in place. Public AWS OIDC contracts substantiate the AWS device/refresh changes; the closed-source Kiro product's private social transport and exact current client identity cannot be established from these public repositories.

## Antigravity OAuth review

`exchangeTokens` and provider `postExchange(tokens)` expose no caller-signal API, so no new signal API was added. Antigravity uses the existing configured 60-second internal timeout. Preaborted deadlines stop before the first request, and an abort during the onboarding wait clears its timer and rejects immediately with the original reason. Only successful pending operations are polled; no asynchronous onboarding remains after login returns. Non-success and malformed JSON errors contain operation/status summaries and exclude credential-bearing upstream text.

OAuth project extraction now matches runtime validation: a trimmed ID must remain nonempty and contain no whitespace. Both string and object-form malformed project responses are rejected; a test through the real `exchangeTokens` boundary confirms account credential mapping never runs when provisioning returns an invalid ID.

## Owned files

- `open-sse/config/awsRegions.js` — shared existing AWS region policy.
- `src/lib/oauth/constants/oauth.js` — reexports that existing validator.
- `open-sse/executors/kiro.js` — `getOrderedBaseUrls` region validation only.
- `open-sse/services/kiroModels.js` — profile ARN region validation only.
- `open-sse/services/tokenRefresh/providers.js` — Kiro refresh branches and validator import only; parent edits Google/Copilot separately.
- `src/lib/oauth/kiroResponse.js` — narrow Kiro grant/JSON/error helpers.
- `src/lib/oauth/providers/kiro.js` — registered-client device flow.
- `src/lib/oauth/services/kiro.js` — alternate login/import/probe credential paths.
- `src/lib/oauth/providers/antigravity.js` — OAuth grant/project provisioning, terminal denials, and cancellation.
- `tests/unit/kiro-runtime-region-safety.test.js`.
- `tests/unit/kiro-oauth-login-safety.test.js`.
- `tests/unit/antigravity-oauth-login-safety.test.js`.

## Final verification

All 12 selected suites passed: 254 tests, no warnings. The log is `/workspace/.cloud-setup/kitsune-router/oauth-owned-final-tests.log`. Transport tests use synthetic credentials and capture actual module outbound calls without contacting providers.

```sh
RUN_REAL=0 RUN_E2E=0 RUN_LIVE_TESTS=0 AG_CACHE_TEST=0 MODEL_CATALOG_SYNC=off \
DISABLE_BACKGROUND_TOKEN_REFRESH=1 KITSUNE_ROUTER_DISABLE_MITM=1 NEXT_TELEMETRY_DISABLED=1 \
npm test -- --maxWorkers=2 \
  tests/unit/kiro-runtime-region-safety.test.js \
  tests/unit/kiro-api-key-endpoint-routing.test.js \
  tests/unit/kiro-live-catalog-facts.test.js \
  tests/unit/kiro-catalog-lifecycle.test.js \
  tests/unit/kiro-external-idp.test.js \
  tests/unit/ssrf-and-provider-auth-3497.test.js \
  tests/unit/refresh-client-secondary-wire.test.js \
  tests/unit/kiro-oauth-login-safety.test.js \
  tests/unit/kiro-profile-arn.test.js \
  tests/unit/antigravity-oauth-login-safety.test.js \
  tests/unit/antigravity-oauth-client.test.js \
  tests/unit/client-oauth-header-migrations.test.js
```

Composed lint passed with zero warnings:

```sh
node scripts/lint.mjs \
  open-sse/config/awsRegions.js open-sse/executors/kiro.js \
  open-sse/services/kiroModels.js open-sse/services/tokenRefresh/providers.js \
  src/lib/oauth/constants/oauth.js src/lib/oauth/kiroResponse.js \
  src/lib/oauth/providers/kiro.js src/lib/oauth/services/kiro.js \
  src/lib/oauth/providers/antigravity.js \
  tests/unit/kiro-runtime-region-safety.test.js \
  tests/unit/kiro-oauth-login-safety.test.js \
  tests/unit/antigravity-oauth-login-safety.test.js --max-warnings=0
```

Scoped `git diff --check` also passed. No commits or pushes were made.
