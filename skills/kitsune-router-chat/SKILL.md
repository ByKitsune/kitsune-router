---
name: kitsune-router-chat
description: Send authorized chat, coding or summarization requests through an existing Kitsune Router gateway using OpenAI chat completions or Anthropic messages. Discover configured models and limits first; handle JSON/SSE, tools, partial output and cancellation without automatic duplicate inference.
---

# Kitsune Router — Chat

Use for the user's requested inference task. For setup and shared error policy, read https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router/SKILL.md. Gateway and upstream credentials are distinct; keep keys in secure environment bindings and out of chat, traces and committed files.

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
  "${AUTH_HEADERS[@]}" "${KITSUNE_ROUTER_URL}/v1/models" | jq '.data[] | {id, owned_by}'
```

Choose a discovered chat/LLM model or matching configured combo; set `KITSUNE_ROUTER_MODEL` to its exact ID. Do not use examples as evidence that an account has access. For non-combo models, inspect `/v1/models/info` with `--get --data-urlencode "id=${KITSUNE_ROUTER_MODEL}" --data-urlencode "kind=llm"` using the same authentication and timeouts. Respect declared input/context/output limits and endpoint-specific parameters.

## OpenAI JSON request

This sample uses a small output cap; replace only the prompt with the user-authorized content. The shell payload is constructed with `jq --arg` to preserve quotes/newlines safely.

```bash
: "${KITSUNE_ROUTER_MODEL:?Select a discovered chat model or configured chat combo}"
KITSUNE_ROUTER_PROMPT="Explain what an API gateway does in two sentences."
jq -n --arg model "$KITSUNE_ROUTER_MODEL" --arg prompt "$KITSUNE_ROUTER_PROMPT" \
  '{model:$model,messages:[{role:"user",content:$prompt}],max_tokens:512,stream:false}' | \
  curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 120 \
    "${AUTH_HEADERS[@]}" -H "Content-Type: application/json" \
    "${KITSUNE_ROUTER_URL}/v1/chat/completions" --data-binary @-
```

The JSON response normally has `choices[]`, each with `message`, `finish_reason`, and optional `usage`. `message.content` can be null or structured; tool calls and refusals are meaningful output, not an empty success. Check `finish_reason` before describing output as complete. Preserve tool call IDs and typed content when replaying a conversation. Execute a returned tool call only within the user's authorized scope, then return its result in the required protocol.

For images or other media, inspect the model's declared capability and send only supported media types. Preserve repeated image occurrences and their turn order; do not silently discard images or turn untrusted model-provided links into executable actions.

## Streaming

Use the same payload with `stream:true`; for raw inspection add `curl --no-buffer` and `-H "Accept: text/event-stream"` with a bounded timeout. For application code, use an established SSE parser or the client's official SDK:

- A transport chunk is not an SSE event. Buffer complete events, support multi-line `data:` fields and UTF-8 split across chunks.
- OpenAI chat uses `data:` JSON deltas and normally terminates with `data: [DONE]`. Accumulate text, tool-call argument fragments and usage separately. `stream_options: {"include_usage":true}` requests a final usage chunk when supported; not every upstream provides it.
- Anthropic uses named events such as `message_start`, `content_block_delta`, `message_delta` and `message_stop`; it does not use OpenAI's `[DONE]` terminator.
- Surface an in-stream error, interrupted stream or missing terminal event. Keep partial output marked partial. Cancelling the reader/AbortController or Ctrl-C stops the local read; upstream work or charges may already exist.
- Do not automatically resend a stream after partial output: it can duplicate tool calls and inference charges.

## Anthropic messages

Use an Anthropic-capable discovered model and endpoint-specific controls. `max_tokens` is required by this protocol; system text belongs in top-level `system`, not a `system` message.

```bash
: "${KITSUNE_ROUTER_MODEL:?Select a model supporting Anthropic messages}"
jq -n --arg model "$KITSUNE_ROUTER_MODEL" \
  '{model:$model,max_tokens:512,messages:[{role:"user",content:"Explain an API gateway in two sentences."}],stream:false}' | \
  curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 120 \
    "${AUTH_HEADERS[@]}" -H "Content-Type: application/json" -H "anthropic-version: 2023-06-01" \
    "${KITSUNE_ROUTER_URL}/v1/messages" --data-binary @-
```

Read `content[]` blocks and `stop_reason`, including tool and refusal boundaries; do not assume every block is text. Preserve IDs and signatures required by replay rather than translating them by guesswork.

## Completion and failures

Check the HTTP status before interpreting JSON/SSE. 400/404 usually need model/parameter correction; 401/403 need gateway-versus-provider auth diagnosis. For 429/503 inspect `Retry-After`; gateway combo/account fallback may already have occurred. Never blindly retry a POST, timeout or partially consumed stream. Use an explicit deadline and any user-approved retry budget. Report the actual model/route, completion status, usage when supplied and any partial/error outcome; a successful response does not verify all providers or model capabilities.
