---
name: kitsune-router-embeddings
description: Generate authorized text embeddings through Kitsune Router /v1/embeddings for retrieval or similarity. Discover configured embedding models, verify dimensions/encoding and batch limits, preserve input ordering and avoid mixing incompatible vector spaces or leaking source documents.
---

# Kitsune Router — Embeddings

Use for user-authorized embedding/RAG tasks. Setup and shared errors: https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router/SKILL.md. Keep the gateway key in a secure binding; do not echo credentials or send unrelated documents upstream.

## Initialize and discover

```bash
# Bash; URL is the gateway origin, without a trailing /v1.
: "${KITSUNE_ROUTER_URL:=http://127.0.0.1:20128}"
KITSUNE_ROUTER_URL="${KITSUNE_ROUTER_URL%/}"
AUTH_HEADERS=()
if [[ -n "${KITSUNE_ROUTER_KEY:-}" ]]; then
  AUTH_HEADERS=(-H "Authorization: Bearer ${KITSUNE_ROUTER_KEY}")
fi
```

```bash
set -o pipefail
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 60 \
  "${AUTH_HEADERS[@]}" "${KITSUNE_ROUTER_URL}/v1/models/embedding" | jq '.data[] | {id, owned_by}'
```

Select an advertised embedding ID in `KITSUNE_ROUTER_MODEL`. Inspect its metadata with the same bounded authenticated curl options, `--get "${KITSUNE_ROUTER_URL}/v1/models/info" --data-urlencode "id=${KITSUNE_ROUTER_MODEL}" --data-urlencode "kind=embedding"`. Missing `dimensions` or limits mean unknown, not permission to guess.

## Request contract

`POST /v1/embeddings` accepts OpenAI-shaped JSON:

| Field | Requirement |
|---|---|
| `model` | Exact discovered embedding route ID. Do not assume a chat combo supports embeddings. |
| `input` | A nonempty string or array of nonempty strings. Keep a stable mapping from each input to its result. |
| `encoding_format` | Prefer `float`; `base64` only if the selected provider supports it and the client decodes it correctly. |
| `dimensions` | Optional positive integer only when supported by this model/provider. It is not limited to one provider family; for Gemini the gateway maps it to `outputDimensionality`. |

Batch and per-input token limits vary. Bound batch size and input length to verified provider limits; never truncate source documents silently. Use the same model, dimensions and preprocessing for document and query vectors. A model or dimension change requires a separate index or deliberate re-embedding.

```bash
: "${KITSUNE_ROUTER_MODEL:?Choose a discovered embedding model}"
jq -n --arg model "$KITSUNE_ROUTER_MODEL" \
  '{model:$model,input:["An API gateway routes requests.","Embeddings support semantic retrieval."],encoding_format:"float"}' | \
  curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 120 \
    "${AUTH_HEADERS[@]}" -H "Content-Type: application/json" \
    "${KITSUNE_ROUTER_URL}/v1/embeddings" --data-binary @-
```

Expected structural shape (illustrative vector lengths only):

```json
{
  "object": "list",
  "model": "selected-provider/selected-embedding-model",
  "data": [
    {"object": "embedding", "index": 0, "embedding": [0.0123, -0.045]},
    {"object": "embedding", "index": 1, "embedding": [0.031, 0.004]}
  ],
  "usage": {"prompt_tokens": 12, "total_tokens": 12}
}
```

## Validate before indexing

Check HTTP status and JSON content type, then confirm `data` has the expected number of rows; match each `index` to its original input. For float encoding, require finite numeric components and a consistent, nonzero dimension equal to the target index schema. Do not index an error body, empty vector, missing row or base64 string as a numeric vector. Keep provider-normalized `model`/usage for provenance; missing or zero normalized usage is not proof that upstream work was free or precisely measured.

Prefer bounded small batches and a stable checkpoint. Cache only within the user's data/privacy policy. Retry only a failed known batch within the user-approved budget; never resend an entire corpus automatically after a timeout. A client timeout/cancel may occur after billable upstream processing. 400/404 needs model/input/dimension correction; 401/403 needs auth diagnosis; 429/503 requires inspecting `Retry-After` and reducing concurrency. If a configured self-hosted endpoint is missing, fix its connection configuration rather than sending local documents to a cloud provider as a substitute.
