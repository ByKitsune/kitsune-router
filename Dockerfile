# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS base
WORKDIR /app

FROM base AS builder

RUN apk --no-cache upgrade && apk --no-cache add python3 make g++ linux-headers

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci

COPY . ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN HOME=/tmp/kitsune-router-build-home DATA_DIR=/tmp/kitsune-router-build-data \
  KITSUNE_ROUTER_MIGRATION=skip NEXT_PHASE=phase-production-build \
  DISABLE_BACKGROUND_TOKEN_REFRESH=1 npm run build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app

LABEL org.opencontainers.image.title="Kitsune Router" \
  org.opencontainers.image.description="Provider-neutral AI gateway. Your models. Your routes." \
  org.opencontainers.image.vendor="ByKitsune" \
  org.opencontainers.image.url="https://github.com/ByKitsune/kitsune-router"

ENV NODE_ENV=production
ENV PORT=20128
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_DIR=/app/data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/custom-server.js ./custom-server.js
COPY --from=builder /app/cli/hooks/containerEntrypoint.js ./cli/hooks/containerEntrypoint.js
COPY --from=builder /app/open-sse ./open-sse
# Ensure `next` is available at runtime in case tracing did not include it.
COPY --from=builder /app/node_modules/next ./node_modules/next
# sql.js loads dist/sql-wasm.wasm by path at runtime; tracing only follows JS imports,
# so the last-resort DB driver would abort with ENOENT on the missing binary.
COPY --from=builder /app/node_modules/sql.js ./node_modules/sql.js
# node-machine-id is createRequire-loaded at runtime; tracing omits it.
COPY --from=builder /app/node_modules/node-machine-id ./node_modules/node-machine-id

RUN mkdir -p /app/data /app/data-home && chown -R node:node /app

# Fix mounted-volume ownership, then exec the actual command as the node user.
# The default Node command preloads the shared JSON/legacy-env secret resolver;
# never source a secret file as shell code or put resolved values in argv.
RUN apk --no-cache upgrade && apk --no-cache add su-exec && \
  printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    'DATA_DIR="${DATA_DIR:-/app/data}"' \
    'case "$DATA_DIR" in /*) ;; *) printf "%s\n" "DATA_DIR must be absolute" >&2; exit 1 ;; esac' \
    'mkdir -p "$DATA_DIR" /app/data-home' \
    'chown -R node:node "$DATA_DIR" /app/data-home' \
    'export DATA_DIR' \
    'exec su-exec node "$@"' \
    > /entrypoint.sh && \
  chmod +x /entrypoint.sh

EXPOSE 20128

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "--require", "./cli/hooks/containerEntrypoint.js", "custom-server.js"]
