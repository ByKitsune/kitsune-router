# Web search routing and grounding

Kitsune Router keeps standard `/v1/search` routing; rebranding does not rename provider model IDs. See [current installation](INSTALLATION.md), [1.0.2 status](CHANGELOG_v1.0.2.md) and [migration](MIGRATION.md). Dated validation below is not a fresh rebrand or live-provider result.

`POST /v1/search` supports dedicated search providers and grounded LLM search. Provider selection is separate from the upstream grounding model.

## Request forms

```json
{ "model": "gemini", "query": "Current release notes" }
```

A bare `model` selects a **provider**, preserving the historical web-search API and dashboard behavior. It does not request an upstream model literally named `gemini`. These forms also use the provider's configured search default:

```json
{ "provider": "gemini", "query": "Current release notes" }
```

```json
{ "provider": "gemini", "model": "gemini", "query": "Current release notes" }
```

```json
{ "model": "gemini/search", "query": "Current release notes" }
```

`provider/search` is the service ID advertised by `/v1/models/web`, not an upstream model named `search`. Provider aliases are accepted, including `ag` for Antigravity.

To select a grounding model explicitly:

```json
{ "provider": "gemini", "model": "gemini-3.8-flash", "query": "Current release notes" }
```

```json
{ "model": "ag/gemini-3.8-flash", "query": "Current release notes" }
```

Split the combined form at the first slash only. Preserve nested upstream namespaces. Explicit separate models must be nonempty strings. A combo member owns its own provider/model selector; the original combo name must not override it.

## Antigravity grounded search

Search is a separate grounding request, not a call through the chat executor. Antigravity chat normalization currently retains function declarations and would remove `googleSearch`.

The dedicated search configuration retains `gemini-2.5-flash` and uses `daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent`, matching the pinned public dedicated-search client. The search model need not appear in the IDE chat registry. This is protocol alignment, **not proof of account entitlement or current upstream search availability**.[1][2]

Explicit registered Antigravity model aliases use the existing upstream-ID and thinking helpers. For example, `gemini-3.8-flash` resolves to wire model `gemini-3.8-flash-medium` with native `thinkingLevel: "medium"`. Parenthesized effort presets never appear in the final wire model.

Requests preserve the real project ID, `userAgent: "antigravity"`, `googleSearch`, and the existing grounding citation deduplication. Returned `thought: true` parts are excluded from the visible answer and the answer text used to expand grounding context; reasoning configuration and actual total usage are unchanged. They include request/session IDs and omit the unverified `requestType: "search"` field. Missing project IDs are rejected; none are fabricated. Search forwards the same per-account proxy/relay/strict-proxy policy as chat. Client search options cannot set a credential-bearing upstream URL.

## Error and account-state policy

- A Gemini 404 with the specific `models/... is not found for API version` message is request-scoped: return it after one account attempt without changing credential health.
- The exact Antigravity `Requested entity was not found.` 404 is ambiguous between model/endpoint and account project. Try at most three eligible accounts for that request, without writing credential cooldowns. A different account can still succeed; a repeated failure cannot drain and lock an entire pool.
- Other authentication, quota and provider errors retain existing fallback/lock handling. This is not a global removal of HTTP 404 fallback.
- On success, clear the matching `websearch:<provider>` scope. Unrelated active chat/model locks remain.
- Preserve upstream error text and HTTP status. Logger calls use the tag/message convention rather than producing an `undefined` message.

A generic 404 does not establish that an account is invalid. A successful fixture response does not establish that Google permits the same request for a real account.

## Verification boundaries

Regression tests exercise serialized requests and citation responses on actual loopback sockets. Additional tests exercise an actual strict relay and fail-closed missing-proxy policy. Built standalone acceptance uses disposable provider rows and actual isolated SQLite to verify search-lock clearing and resource-404 health preservation. No production account, OAuth grant, upstream inference, implicit provider substitution or real quota is used.

## Sources

[1] https://github.com/NoeFabris/opencode-antigravity-auth/blob/16e0056431d0a1291ee66e5938c732720b13a851/src/plugin/search.ts
[2] https://github.com/NoeFabris/opencode-antigravity-auth/issues/384
