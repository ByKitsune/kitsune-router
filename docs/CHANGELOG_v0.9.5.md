# 🌿 ZenRouter v0.9.5 Changelog & Technical Documentation

> **Kitsune Router archive:** this dated ZenRouter record keeps its original names, artifacts and evidence; it is not current installation or verification guidance. See [current docs](INSTALLATION.md) and [migration](MIGRATION.md).

This document provides technical documentation for the ZenRouter **v0.9.5** release.

---

## 📌 Executive Summary

- **Version**: `0.9.5`
- **Release Date**: 2026-10-02
- **Previous Version**: `0.9.0`
- **Scope**: Core translation engine, real-time distributed worker compute mesh, thinking block omission fix, universal 1M context window alignment with `models.dev`, dynamic reasoning budget auto-floor, upstream 9Router cherry-picks, and security hardening.

---

## 🏗️ 1. Distributed Worker Compute Mesh Architecture

ZenRouter now includes an automated multi-node compute mesh via `scripts/worker-mesh.mjs`.

### Node Topology
- **Local Host**: Workstation development environment.
- **Worker Node 1 (`159.223.88.62`, `ubuntu-8c4-sgp1-13`)**: Dedicated 8-vCPU / 8-GB test executor running the complete Vitest test suite.
- **Worker Node 2 (`157.230.34.190`, `ubuntu-8c4-sgp1-92`)**: Dedicated 8-vCPU / 8-GB build and static analysis node running Next.js standalone webpack builds and ESLint checks.
- **Live Production VPS (`187.127.214.246`)**: Strict read-only live telemetry and traffic inspection.

### Synchronization
- Bidirectional synchronization via Mutagen daemon with automated flush routines (`node scripts/worker-mesh.mjs flush`).
- Isolated test and build directories (`/root/zenrouter-worker-mesh/jobs/`) with private temporary SQLite database instances.
- Zero-exposure policy: secrets, `.env*`, and database binaries are excluded from synchronization.

---

## 🧠 2. Thinking Block Omission Bug: Root Cause & Fix

### Bug Identification
Clients previously encountered streams returning:
```
"[thinking block omitted: not supported on this route]"
```
This occurred due to:
1. Loss of `reasoning_tokens` during format transitions between OpenAI, Claude, and Gemini formats.
2. Premature truncation during stream-to-JSON accumulation when reasoning details were not properly attributed to `completion_tokens_details.reasoning_tokens`.
3. Client-side validation mismatches in tools like Cline and Roo Code when the emitted model name in Claude `message_start` did not match the user-requested model identifier.

### Technical Resolutions
1. **Model Name Echo in `message_start`**:
   In `open-sse/handlers/chatCore/streamingHandler.js`, `open-sse/utils/stream.js`, and `open-sse/translator/response/openai-to-claude.js`, the exact client-requested model identifier is echoed back, preventing client rejection.
2. **Canonical Reasoning Tokens Accounting**:
   In `open-sse/transformer/streamToJsonConverter.js`, `open-sse/translator/response/openai-responses.js`, and `open-sse/utils/usageTracking.js`, `reasoning_tokens` is preserved and accumulated from `reasoning_tokens`, `completion_tokens_details.reasoning_tokens`, and `output_tokens_details.reasoning_tokens`.
3. **Lossless Thought Block Replay**:
   Maintained structured thinking across Claude, Gemini, and OpenAI Chat histories without exposing opaque bridge markers.

---

## 🌐 3. Universal 1M Context Window Alignment with `models.dev`

A batch analysis against `models.dev/api.json` covering 225 providers revealed that modern flagship models natively operate with 1,000,000+ context windows without requiring the legacy `[1m]` suffix.

### Updated Capability Specifications (`open-sse/providers/capabilities.js`)

| Model Family / ID | Context Window | Max Output | Thinking Format | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **`claude-sonnet-5.5`** | 1,000,000 | 128,000 | `claude-adaptive` | Native 1M; `thinkingCanDisable: false` |
| **`claude-sonnet-5`** | 1,000,000 | 128,000 | `claude-adaptive` | Native 1M |
| **`claude-opus-5.5`** | 1,000,000 | 128,000 | `claude-adaptive` | Native 1M; `thinkingCanDisable: false` |
| **`claude-opus-5`** | 1,000,000 | 128,000 | `claude-adaptive` | Native 1M |
| **`claude-fable-5.1` / `5`** | 1,000,000 | 128,000 | `claude-adaptive` | Native 1M |
| **`claude-opus-4.8` / `4.7` / `4.6`** | 1,000,000 | 128,000 | `claude-adaptive` | Native 1M |
| **`claude-sonnet-4.7` / `4.6`** | 1,000,000 | 128,000 | `claude-adaptive` | Native 1M |
| **`claude-sonnet-4.5` / `4`** | 1,000,000 | 64,000 | `claude-budget` | Native 1M; budget format |
| **`claude-3.7-sonnet`** | 200,000 / 1,000,000 | 64,000 / 128,000 | `claude-budget` | 200k base, 1M with `[1m]` tag |
| **`claude-opus-4.5`** | 200,000 | 64,000 | `claude-budget` | Preserved older 200k ceiling |
| **`gpt-6-astra` / `sol` / `luna`** | 1,050,000 | 128,000 | `openai` | OpenAI & Codex parity |
| **`gpt-6.1-sol`** | 1,050,000 | 128,000 | `openai` | 1.05M native, 872k Codex baseline |
| **`gpt-5.6-*` / `gpt-5.4`** | 1,050,000 | 128,000 | `openai` | Flagship 1.05M |
| **`deepseek-v4*` / `flash`** | 1,000,000 | 384,000 | `deepseek` | 1M context, 384k output |
| **`qwen3.8-max` / `flash`** | 1,000,000 | 131,072 | `qwen` | 1M multimodal |

---

## ⚡ 4. Dynamic Reasoning Budget Auto-Adjustment

- Added `REASONING_MIN_OUTPUT_FLOOR = 65536` in `open-sse/config/runtimeConfig.js`.
- In `open-sse/translator/formats/maxTokens.js`, when requests invoke reasoning (`reasoning_effort: medium/high/max/ultra` or `adaptive`/`enabled` thinking) with a client `max_tokens` cap smaller than the floor, ZenRouter automatically bumps `max_tokens` up to **65,536** tokens (bounded by model maxOutput).
- This prevents reasoning models from exhausting their token allocation during chain-of-thought processing and terminating with truncated empty outputs.
- Non-reasoning requests retain the standard default of **64,000** tokens.

---

## 🛡️ 5. Upstream Cherry-Picks & Security Hardening

- **PR #4513**: Model name echoing in Claude `message_start` events.
- **PR #4536**: Comprehensive reasoning token accounting.
- **PR #4537**: Audio-stream translation endpoints.
- **PR #4486**: Proper classification of safety filter and token budget exhaustion errors on Gemini.
- **PR #4515**: Antigravity functionResponse role alignment and guaranteed trailing user turns.
- **PR #4517**: Automatic remote image URL base64 prefetching for Anthropic endpoints.
- **ESLint 9 & React 19**: Configured `eslint-plugin-react-hooks` in flat config and eliminated effect cascading render warnings in `BaseUrlSelect.js`.

---

## 📊 6. Quality Gate & Test Evidence

- **Worker Node 1 Vitest Run**: 413 test files passed, 3,461 tests passed, 0 failures.
- **Worker Node 2 Webpack Build**: Production Next.js standalone build compiled cleanly in 31.6s.
- **Worker Node 2 ESLint Run**: 0 errors across entire codebase.
- **Local Snapshots**: Byte-for-byte verified for provider lists, alias mappings, and OAuth URLs.
