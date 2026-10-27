# VPS and Container Deployment

Remote Kitsune Router is an **operator-managed** gateway, not an included hosted endpoint. Localhost always refers to the machine making the request. No ByKitsune account or provider ordering is required.

## Source service

Use Node.js >=22.19.0, locked dependencies and the repository-root build workflow in [installation](/en/getting-started/installation/). Run the built application under your reviewed service manager with an absolute private `DATA_DIR`, stable secrets and a strong `INITIAL_PASSWORD`. Do not embed credentials into unit files committed to Git or sample images.

## Containers

**1.0.1 remains a candidate pending final tag/SHA verification and publication.** v1.0.0's retained tag did not publish an npm/GHCR artifact. Verify canonical GHCR access and the new version digest first; npm login alone does not prove publishing permission. The workflow targets **linux/amd64 only**.

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.1
    platform: linux/amd64
    restart: unless-stopped
    ports:
      - "127.0.0.1:20128:20128"
    volumes:
      - ./data:/app/data
    environment:
      DATA_DIR: /app/data
      INITIAL_PASSWORD: ${INITIAL_PASSWORD:?Set a strong dashboard password}
```

Canonical GHCR is the release target; a Docker Hub mirror is optional and must be independently verified. Keep the existing volume at the effective `DATA_DIR` (`/app/data` by default, or your supported custom mount). A renamed/new empty volume is not a migration. Read [Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md).

## HTTPS and trust

Use authenticated HTTPS, reviewed firewall/body limits, disabled SSE buffering and suitable bounded timeouts. A trusted loopback proxy must append the real peer to `X-Forwarded-For`, not forward client input verbatim. Never expose optional process-capable Headroom/MITM control services publicly. Use `https://router.example.com/v1` only as a placeholder for your deployment, not an advertised service.

Back up all stopped state, including keys and certificates. Explicit `DATA_DIR` stays in place; preserve secret values and existing trusted roots. [Migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Operations](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md). No deployment, current scan or production verification is implied here.
