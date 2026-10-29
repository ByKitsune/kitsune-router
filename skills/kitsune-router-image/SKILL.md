---
name: kitsune-router-image
description: Generate images through a configured Kitsune Router gateway. Discover the installation's image models and options, submit a user-authorized prompt, validate JSON or binary output, and save the result without assuming provider access or retrying ambiguous billable requests.
---

# Kitsune Router — Image generation

Use this skill for image creation. Provider-specific editing/reference-image inputs are optional capabilities, not a universal image-edit API. Setup and the other capabilities are indexed in the [entry skill](https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router/SKILL.md).

## Establish the route

- `KITSUNE_ROUTER_URL` is the configured gateway origin, for example `http://localhost:20128`, **without** a trailing `/v1`. Use HTTPS for remote credentials.
- Use an existing `KITSUNE_ROUTER_KEY` from the gateway's Endpoint & key page when API-key enforcement is enabled. This gateway key is separate from provider credentials stored in the dashboard. Do not ask for keys in chat, print their values, put them in URLs, or enable shell tracing.
- A healthy `/api/health` proves local database readiness; an advertised model does not prove upstream entitlement, available quota, or permission to generate many images. Keep the prompt, count and paid options within the user's request.

The examples use Bash, curl and jq. Every `/v1` request, including discovery, carries the same optional gateway authentication:

```bash
set -euo pipefail
: "${KITSUNE_ROUTER_URL:?Set the gateway origin first}"
kr_base="${KITSUNE_ROUTER_URL%/}"
kr_auth=()
if [ -n "${KITSUNE_ROUTER_KEY:-}" ]; then
  kr_auth=(-H "Authorization: Bearer ${KITSUNE_ROUTER_KEY}")
fi
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
  "${kr_auth[@]}" "$kr_base/v1/models/image" | jq '.data[] | {id, name, owned_by}'
```

Choose a full `data[].id` from that response; do not substitute an old example or a chat/vision model. Store the chosen ID in `KITSUNE_IMAGE_MODEL`, then inspect provider-specific metadata:

```bash
: "${KITSUNE_IMAGE_MODEL:?Select an advertised image model}"
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
  "${kr_auth[@]}" --get "$kr_base/v1/models/info" \
  --data-urlencode "id=$KITSUNE_IMAGE_MODEL" --data-urlencode 'kind=image'
```

Use the returned `params`, `options` and capabilities when present. Missing metadata is unknown support, not permission to invent a size, quality tier or editing feature. If no suitable route exists, explain which connection/capability the operator must configure before generating.

## Submit one request

`POST /v1/images/generations` accepts a JSON body. `model` and a nonempty `prompt` are required. `n`, `size`, `quality`, `style`, and `response_format` are adapter/model-dependent. Start with `n: 1`; do not increase count or select more expensive options without user intent.

```bash
: "${KITSUNE_IMAGE_PROMPT:?Set the user-authorized image description}"
(umask 077
  jq -n --arg model "$KITSUNE_IMAGE_MODEL" --arg prompt "$KITSUNE_IMAGE_PROMPT" \
    '{model: $model, prompt: $prompt, n: 1}' > image-request.json
  curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 300 \
    "${kr_auth[@]}" -H 'Content-Type: application/json' \
    --data-binary @image-request.json "$kr_base/v1/images/generations" \
    --output image-response.json
)
```

A timeout bounds the client wait, not upstream billing or cancellation. Never put this POST in an automatic retry loop: the first request may already have generated an image. On a timeout, connection failure or ambiguous 5xx, preserve the failure and inspect the gateway/provider result before considering another generation. The gateway may itself use configured account/combo fallback; a single client request is not a promise of exactly one upstream attempt.

## Validate and deliver

A normalized JSON success generally has this shape; URLs and embedded bytes depend on the adapter:

```json
{"created":1735000000,"data":[{"url":"https://example.invalid/generated-image.png"}]}
```

Alternatively an item contains `b64_json`, and may include `revised_prompt`. Check HTTP success, parse JSON, require a nonempty `data` array, then validate each returned artifact. Do not print an entire base64 payload or include private prompts/returned signed URLs in logs.

- For `b64_json`, decode to a private temporary file, validate recognizable image magic bytes/MIME, then atomically rename to a user-approved unused destination with the matching extension.
- For `url`, treat it as an untrusted, potentially expiring download address. Download only an expected HTTPS image destination; do not attach the gateway Authorization header to that different host. Reject unexpected schemes, private/local targets and unsafe redirects. Check the downloaded bytes before presenting a file.
- Query `?response_format=binary` asks the gateway to return the **first** image as raw bytes. It can still return JSON when no bytes can be recovered; inspect HTTP status and `Content-Type` rather than saving every body as `.png`. Actual PNG/JPEG/WebP content and MIME must agree. This query is separate from an adapter's JSON-body `response_format` option.
- Requesting `Accept: text/event-stream` is supported only by adapters that implement image streaming. Parse their terminal/error events; the default JSON flow does not need SSE. Do not treat a partial event as a completed image.

Report the saved artifact(s), requested model and any material limitation. Do not claim a model interpreted a reference image or that usage is free solely because generation returned successfully.

## Provider boundaries and recovery

Reference fields such as `image`, `images`, `image_detail`, `output_format` and `background` exist only for particular adapters. Remote image inputs can be rejected by the gateway's media-fetch policy. SDWebUI/ComfyUI routes require their configured local service to be reachable from the **gateway**, not from the client machine. A provider's noAuth mode does not disable gateway API-key enforcement.

For 400, correct the model/options/input; for gateway 401, verify the gateway key; for upstream 401/403, repair the dashboard connection/entitlement rather than sending a provider key to the public request. For 429/503, inspect the error and bounded `Retry-After` guidance without blindly resubmitting billable work. Preserve useful status/code information while redacting credentials. A rejected or interrupted request is not a successful artifact.
