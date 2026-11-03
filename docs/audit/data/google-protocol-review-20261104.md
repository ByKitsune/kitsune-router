# Google protocol and account safety review

This review covers Antigravity, Gemini CLI, Gemini API and the shared Google/Vertex thought-signature paths. Tests use synthetic opaque values and local mock transports; no live provider accounts were exercised. No Google client version, OAuth client registration, or fingerprint was changed.

## Version-matched official sources

- Official Gemini CLI repository: https://github.com/google-gemini/gemini-cli, cloned at `/tmp/kitsune-provider-sources/gemini-cli`. Compared tag `v0.66.0`, commit `970413207732f5d4d8c50540c7fc359c44fdaaf2`.
- [packages/core/package.json](https://github.com/google-gemini/gemini-cli/blob/970413207732f5d4d8c50540c7fc359c44fdaaf2/packages/core/package.json) confirms the CLI bundles `@google/genai` 1.30.0 and `google-auth-library` 10.9.0.
- [packages/core/src/core/geminiChat.ts:1384](https://github.com/google-gemini/gemini-cli/blob/970413207732f5d4d8c50540c7fc359c44fdaaf2/packages/core/src/core/geminiChat.ts#L1384) describes the first function call in each model step of the active loop. Its search for the latest user prompt excludes a coalesced turn containing functionResponse, so earlier steps in that loop remain covered. Later parallel calls do not require an added signature.
- That official CLI also uses the documented `skip_thought_signature_validator` control marker in migration/recovery. Kitsune preserves this value only when explicitly supplied by the caller; it does not inject it to substitute for missing provider signatures.
- Official GenAI SDK repository: https://github.com/googleapis/js-genai, cloned at `/tmp/kitsune-provider-sources/js-genai`. Compared tag `v1.30.0`, commit `38cac5bbf4941ec5fa760238bd423c0ecc2c6f04`.
- [src/types.ts:1383](https://github.com/googleapis/js-genai/blob/38cac5bbf4941ec5fa760238bd423c0ecc2c6f04/src/types.ts#L1383) defines a reusable opaque base64 thoughtSignature on its individual Part. [src/chats.ts:133](https://github.com/googleapis/js-genai/blob/38cac5bbf4941ec5fa760238bd423c0ecc2c6f04/src/chats.ts#L133) deep-clones caller history to preserve caller ownership.
- [Pinned CLI OAuth implementation](https://github.com/google-gemini/gemini-cli/blob/970413207732f5d4d8c50540c7fc359c44fdaaf2/packages/core/src/code_assist/oauth2.ts#L75) confirms the existing installed application OAuth registration and scopes. No new registration or scope was inferred.
- [Pinned Cloud Code types](https://github.com/google-gemini/gemini-cli/blob/970413207732f5d4d8c50540c7fc359c44fdaaf2/packages/core/src/code_assist/types.ts#L170) describe the real project provisioning response and long-running operation fields.
- Google documentation: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/thought-signatures. It documents preserving signatures on their original Parts, the first parallel call/current-turn Gemini 3 requirements, and the explicit migration marker. Saved source HTML is `/tmp/vertex-thought-signatures.html`.
- Antigravity product source is proprietary; no unofficial project was presented as the original client implementation and no new proprietary client version was guessed.

## Implemented corrections

- Removed every bundled captured Google fallback signature. Only SHA-256 quarantine digests remain so historical gateway samples cannot be replayed as an account's opaque identity.
- OpenAI → Gemini/CLI/Vertex/Antigravity translators retain supplied opaque tool signatures, preserve unsigned paths that the protocol supports, reject malformed/conflicting supplied signatures, and require the first current-turn Gemini 3 function call's actual signature. They never manufacture signed material.
- Explicit migration markers survive serialization through tool IDs. Request-local signature caches remain isolated; malformed or truncated encoded values cannot recover from another request.
- The Antigravity Claude bridge now retains each tool-call occurrence's actual Google signature rather than replacing it during its internal Claude pivot.
- Antigravity native chat and image-edit requests preserve original signed thought/image/text Parts. Legacy nested or snake_case signature spellings normalize to the Part field without altering the opaque value.
- Streaming and nonstreaming Google response lowering no longer transfer a preceding thought/text signature to an unrelated unsigned function call. A signature stays with the exact call that carried it.
- Gemini API, Gemini CLI, Antigravity and Vertex native dispatch enforce the same signature checks. Invalid history fails before credential refresh or HTTP dispatch where applicable.
- Removed generated project bindings. Gemini CLI and Antigravity dispatch require the provisioned project from the selected account; caller envelope projects cannot override it. Pure translation can omit a project while preparing a body without credentials. Caller cancellation remains terminal before project validation.
- Gemini CLI and Antigravity use the shared validated Google refresh operation, preserving the registered OAuth client, connection proxy, cancellation and original account project. Credential redirects fail closed; invalid grants and credential-bearing raw errors are not persisted or echoed.
- Project discovery and onboarding forbid credential redirects. Policy/authentication 4xx denials stop provisioning immediately; no fabricated project is created. Successful completed operations without a project and malformed/error payloads stop dispatch.
- Antigravity 4xx policy/authentication/input denials cannot trigger executor retries or endpoint changes even when the body mentions capacity or supplies a short retry hint. Ordinary 429/transient handling remains in its existing bounded path.
- Removed the unused Antigravity singleton session field; headers no longer imply shared mutable request state.

The parent integration adds explicit public HTTP 400 messages for `invalid_thought_signature`, `missing_thought_signature`, and `provider_project_required`, with `x-should-retry: false` and no account/combo fallback.

## Scope boundary

Standard OpenAI `reasoning_content` is a string, so an arbitrary client that discards provider extensions cannot retain every original signed thought Part. This change preserves native Google Parts and existing signed tool/text/image extensions, avoids assigning a thought signature to another Part, and fails explicitly when required signed history is missing. It does not invent a new undocumented reasoning schema.

Existing Antigravity thinking-tier wire model resolution remains intact. `body.model` is the Core-resolved wire-model snapshot, which may intentionally differ from the original selected public model; it was not replaced with an unprocessed alias.

## Verification

New focused safety/response/history tests passed: 208 tests across 8 suites, plus 99 tests across the tier/signature confirmation cluster. Final broad regression passed: **974 tests, 62 passed files, 1 intentionally skipped file / 6 skipped tests**. Results are recorded in `/tmp/google-protocol-final.log`; the command is:

```sh
node tests/node_modules/vitest/vitest.mjs run --config tests/vitest.config.js \
  tests/unit/antigravity tests/unit/gemini tests/translator/gemini tests/translator/bugs-gemini \
  tests/unit/google-thought-signature-contract.test.js tests/unit/google-oauth-project-safety.test.js \
  tests/unit/thought-signature-hardening.test.js tests/unit/refresh-client-primary-wire.test.js \
  tests/unit/reasoning-response-contracts.test.js tests/translator/modernize-stream-fidelity.test.js \
  tests/unit/vision-gemini-history.test.js tests/unit/vertex --maxWorkers=2
```

Transport suites require loopback socket permission for their local mock HTTP servers. The managed default sandbox forbids binding those sockets; the final transport runs used authorized escalation, without live provider calls.

Composed ESLint/Oxlint on the 25 assigned or narrowly coordinated production/test files passed `--max-warnings=0`; log `/tmp/google-protocol-final-lint.log`. Whitespace checks passed. Expected quota and malformed-tool warnings now have exact per-case test assertions with scoped spies. Unexpected warnings/errors fail the quota fixtures; the CommandCode malformed-input case asserts its single exact warning. Both warning fixture suites pass (42 tests) without stderr output, and composed lint passes `--max-warnings=0`. Logs: `/tmp/google-warning-fixtures-final.log` and `/tmp/google-warning-fixtures-final-lint.log`. No global test console suppression was added.

## Owned production paths

`open-sse/config/thoughtSignatures.js`, Google exports of `open-sse/config/defaultThinkingSignature.js`, `open-sse/utils/cloudCodeProject.js`, `open-sse/executors/antigravity.js`, `open-sse/executors/gemini-cli.js`, signature validation hook in `open-sse/executors/default.js`, signature validation hook in `open-sse/executors/vertex.js`, Google refresh branch in `open-sse/services/tokenRefresh/providers.js`, `open-sse/services/projectId.js`, `open-sse/translator/concerns/thoughtSignature.js`, `open-sse/translator/concerns/geminiToolHistory.js`, project generator removal in `open-sse/translator/formats/gemini.js`, `open-sse/translator/request/openai-to-gemini.js`, `open-sse/translator/request/openai-to-vertex.js`, signature ownership in `open-sse/translator/response/gemini-to-openai.js`, and Google-only helpers near the top of `open-sse/handlers/chatCore/nonStreamingHandler.js`.

Kiro runtime/login work and Antigravity OAuth provisioning were delegated; its separate report with 254 passing tests is `/workspace/.cloud-setup/kitsune-router/kiro-official-auth-review.md`.

## Final integration refinements (November 4)

- Retired signatures are quarantined by SHA-256 of their decoded bytes, rather than Base64 text. The three production digests were rederived in memory from the previous Git blob without printing or restoring captured signed material. Synthetic tests verify equivalent padded/unpadded representations cannot bypass validation, tool-ID decoding, or request-local caches.
- `validateGoogleThoughtSignatures` now returns a copy-on-write normalized history. Gemini API, Gemini CLI, and Vertex consume that history before dispatch; legacy nested and snake_case signature spellings move to `Part.thoughtSignature` and no caller-owned Part, turn, function arguments, or unrelated field is mutated. Native wire tests cover each executor, including Antigravity.
- Gemini CLI preserves the Core-resolved envelope model and strips gateway thinking annotations before dispatch. Its User-Agent also omits the annotation; native `(low)` tests keep the requested low thinking level, includeThoughts choice, and explicit output cap.
- Project onboarding distinguishes malformed completed JSON from an aborted response body. A per-attempt body deadline propagates to the existing five-attempt timeout cap; terminal 401/403/409 responses stop after discovery plus one onboarding request. Relay tests require all five stalled bodies to close and preserve the original six-request cap.
- The image-heavy Responses fixture now carries its original synthetic opaque tool signature. Gemini normalization coalesces a tool-result turn with its following user prompt, so the signed history remains inside the current validated loop, matching the pinned official client's documented coalescing rule. The test retains its image occurrence/text-size assertions and adds exact signature, tool/result linkage, and caller nonmutation assertions.

The five assigned integration/signature suites passed **86 tests**. Final broad Google regression ran 67 files: **1025 passed, 6 skipped**, with one unrelated catalog assertion (`gemini-2.5-pro` lifecycle expected `active-restricted`, actual `deprecated`) assigned to the catalog agent. No stderr or warnings appeared in that broad run. Logs: `/tmp/google-nov4-integration-fixes.log`, `/tmp/google-nov4-final-regression.log`, `/tmp/google-nov4-integration-fixes-lint.log`. All 11 touched integration/signature files pass composed lint with `--max-warnings=0`; whitespace checks pass. Production code is frozen again.
