# 🌿 ZenRouter Docker Image

Official **linux/amd64** Docker container for **ZenRouter 0.9.9** — AI Gateway & Multi-Provider Routing Platform. The current publication workflow builds linux/amd64 only; it does not publish native ARM64 or a multi-architecture image.

- **GitHub Repository**: [https://github.com/ZenRouter/ZenRouter](https://github.com/ZenRouter/ZenRouter)
- **NPM Package**: [@joyccn/zenrouter](https://www.npmjs.com/package/@joyccn/zenrouter)
- **Release**: **0.9.9**, dated **2026-10-15** — [GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.9), [changelog](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md), [technical details](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.9.md), [release notes](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.9.md).
- **Pinned images**: `joyccn/zenrouter:0.9.9` and `ghcr.io/zenrouter/zenrouter:0.9.9`. Examples apply after publication; this guide does not establish that a tag is already available.
- **Runtime**: the app requires Node.js >=22.19.0; the container supplies its own Node runtime.
- **Limits**: catalog reconciliation does not prove provider account entitlement or live availability. Unresolved upstream dependency advisories remain; this is not a vulnerability-free release.

---

## 🚀 Quick Run

```bash
docker run -d \
  --name zenrouter \
  -p 20128:20128 \
  -v zenrouter-data:/app/data \
  --restart unless-stopped \
  joyccn/zenrouter:0.9.9
```

Open `http://localhost:20128` in your browser to access the dashboard.

---

## 🐳 Docker Compose

```yaml
services:
  zenrouter:
    image: joyccn/zenrouter:0.9.9
    platform: linux/amd64
    container_name: zenrouter
    restart: unless-stopped
    ports:
      - "20128:20128"
    volumes:
      - ./zenrouter-data:/app/data
    environment:
      - PORT=20128
      - INITIAL_PASSWORD=admin12345
```

---

## Persistent storage

The image sets `DATA_DIR=/app/data`. Both examples mount that path, so SQLite/configuration and generated runtime secrets survive container recreation. A mount at `/root/.zenrouter` is not the image's configured data directory. Keep the existing volume when changing image tags; back it up before upgrading.

## 🔒 Key Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `20128` | Internal HTTP listening port |
| `DATA_DIR` | `/app/data` | Persistent SQLite database and configuration directory; mount your volume here |
| `INITIAL_PASSWORD` | `12345678` | Initial dashboard admin password |
| `JWT_SECRET` | Auto-generated | Session signing secret key |
