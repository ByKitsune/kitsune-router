<div align="center">
  <img src="public/icons/icon-192.svg" width="96" height="96" alt="ZenRouter Logo" />
  <h1>🌿 ZenRouter</h1>
  <p><b>Unified High-Performance AI Gateway & Intelligent Multi-Provider Routing Engine</b></p>
  <p>
    <a href="https://github.com/ZenRouter/ZenRouter/releases"><img src="https://img.shields.io/github/v/release/ZenRouter/ZenRouter?color=84cc16&label=release" alt="Release" /></a>
    <a href="https://www.npmjs.com/package/@joyccn/zenrouter"><img src="https://img.shields.io/npm/v/@joyccn/zenrouter?color=84cc16&label=npm" alt="NPM Version" /></a>
    <a href="https://hub.docker.com/r/joyccn/zenrouter"><img src="https://img.shields.io/docker/pulls/joyccn/zenrouter?color=84cc16" alt="Docker Pulls" /></a>
    <a href="https://github.com/ZenRouter/ZenRouter/blob/master/LICENSE"><img src="https://img.shields.io/github/license/ZenRouter/ZenRouter?color=84cc16" alt="License" /></a>
  </p>
</div>

---

## ⚡ What is ZenRouter?

**ZenRouter** is an open-source, high-performance local AI gateway and routing platform that exposes a clean, drop-in **OpenAI & Anthropic-compatible API endpoint** (`/v1/*`) while intelligently orchestrating, translating, and load-balancing requests across **40+ upstream AI providers**.

Designed for developers, agentic frameworks, and multi-account setups, ZenRouter delivers:
- 🚀 **Zero-Downtime Smart Fallback**: Dynamic circuit breaker, quota reset tracking, and instant failover across model combos and pooled accounts.
- ✂️ **Real-Time Token Compression (RTK / Headroom)**: In-place prompt and tool execution compression saving up to 40% input tokens.
- 🎭 **Protocol-Aware Format Translation**: Bi-directional translation between OpenAI Chat, Anthropic Claude Messages, OpenAI Responses API, Google Gemini, and Ollama, with native media/tool preservation and explicit limits where protocols differ.
- 📊 **Local-First & Multi-Driver SQLite**: Shared configuration and usage storage. Bun prefers `bun:sqlite`; Node tries `better-sqlite3` then `node:sqlite`, with `sql.js` as the portable fallback.
- 🌐 **Web Search Grounding**: Integrated Google Search, Xquik (X platform search), and Ollama search providers.
- 💻 **One-Click CLI Tool Presets**: Instant configuration for Claude Code CLI, OpenAI Codex CLI, Cursor, Cline, OpenClaw, Hermes Agent, and Droid.

---

## Current release: 0.9.13

Dated **2026-10-19**. [GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.13) · [Changelog](CHANGELOG.md) · [Technical details](docs/CHANGELOG_v0.9.13.md) · [Release notes](releases/RELEASE_NOTES_v0.9.13.md).

This release fixes false thinking-budget errors in dashboard model tests and makes provider thinking defaults persist. OpenAI and Codex gain independent Standard/Fast/Ultrafast controls, with native request fields, account-scoped eligibility and retained file attachments. Faster tiers can cost more; selection does not prove account entitlement or actual delivery. See [processing speed](docs/PROCESSING-SPEED.md) and the [verification limits](releases/RELEASE_NOTES_v0.9.13.md#verification-and-limits).

Source updates after that release are listed under [Unreleased](CHANGELOG.md#unreleased).
They are not retroactively included in earlier published artifacts. For the current
test workflow and its live-provider limits, see [tests/README.md](tests/README.md).

## 🚀 Quick Start

Requires **Node.js >=22.19.0** for NPX/global installation. Examples pin 0.9.13 and apply after the package/image is published; preparing release documentation does not publish it.

### 1. Run with NPX (Zero-Install)
```bash
npx @joyccn/zenrouter@0.9.13
```

### 2. Global NPM Install
```bash
npm install -g @joyccn/zenrouter@0.9.13
zenrouter
```

### 3. Docker & Docker Compose

The publication workflow targets **linux/amd64**, not a multi-architecture image. Persist data at **/app/data**; see the [Docker guide](DOCKER_README.md).
```bash
docker run -d \
  --name zenrouter \
  -p 20128:20128 \
  -v zenrouter-data:/app/data \
  --restart unless-stopped \
  joyccn/zenrouter:0.9.13
```

Using `docker-compose.yml`:
```yaml
services:
  zenrouter:
    image: joyccn/zenrouter:0.9.13
    platform: linux/amd64
    container_name: zenrouter
    restart: unless-stopped
    ports:
      - "20128:20128"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=20128
      - INITIAL_PASSWORD=admin12345
```

---

## 🎯 Architecture Overview

```text
[Client / Agent / SDK]
  (Claude Code, Codex, Cline, Cursor, Hermes Agent, OpenAI SDK)
             │
             ▼
┌────────────────────────────────────────────────────────┐
│  ZenRouter Server (Port 20128 / /v1/*)                 │
│  • Format Detection & Bidirectional Translation        │
│  • RTK / Headroom In-Place Token Compression           │
│  • Multi-Account & Model-Combo Fallback Circuit        │
│  • Real-Time Token & Quota Tracking                    │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│  Multi-Provider Upstream Pools (40+ Providers)         │
│  • Google Antigravity / Gemini CLI (Multi-OAuth Pool)  │
│  • Anthropic Claude / OpenAI GPT / DeepSeek            │
│  • NVIDIA NIM (130+ Node Load-Balancing Pool)          │
│  • Mistral, Groq, Cerebras, Moonshot Kimi, MiniMax     │
└────────────────────────────────────────────────────────┘
```

---

## 🛠️ Configuration & Port Alignment

| Endpoint | Purpose | Description |
| :--- | :--- | :--- |
| `http://localhost:20128` | **Web Dashboard** | Manage providers, credentials, combos, and live logs |
| `http://localhost:20128/v1` | **API Base URL** | OpenAI / Anthropic-compatible routing endpoint |
| `http://localhost:20128/v1/models` | **Catalog** | Active models & single-model lookup endpoint |
| `http://localhost:20128/v1/search` | **Web Search** | Unified multi-provider web & X search |

---

## 📄 License

ZenRouter is open-source software licensed under the **MIT License**.
Sponsored & maintained by **Joy** and the open-source community.
