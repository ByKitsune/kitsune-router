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
RUN NEXT_PHASE=phase-production-build DISABLE_BACKGROUND_TOKEN_REFRESH=1 npm run build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app

LABEL org.opencontainers.image.title="zenrouter"

ENV NODE_ENV=production
ENV PORT=20128
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_DIR=/app/data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/custom-server.js ./custom-server.js
COPY --from=builder /app/open-sse ./open-sse
# Ensure `next` is available at runtime in case tracing did not include it.
COPY --from=builder /app/node_modules/next ./node_modules/next
# sql.js loads dist/sql-wasm.wasm by path at runtime; tracing only follows JS imports,
# so the last-resort DB driver would abort with ENOENT on the missing binary.
COPY --from=builder /app/node_modules/sql.js ./node_modules/sql.js
# node-machine-id is createRequire-loaded at runtime; tracing omits it.
COPY --from=builder /app/node_modules/node-machine-id ./node_modules/node-machine-id

RUN mkdir -p /app/data && chown -R node:node /app && \
  mkdir -p /app/data-home && chown node:node /app/data-home && \
  ln -sf /app/data-home /root/.zenrouter 2>/dev/null || true

# Fix permissions at runtime (handles mounted volumes) and auto-provision the
# runtime secrets. JWT_SECRET is required by the dashboard (no fallback, by
# design), so a container started with no env must still come up usable:
# generate a per-container random secret and persist it in the data volume so
# it survives restarts (a changing secret would invalidate every session).
# An explicitly passed JWT_SECRET always wins.
RUN apk --no-cache upgrade && apk --no-cache add su-exec && \
  printf '%s\n' \
    '#!/bin/sh' \
    'chown -R node:node /app/data /app/data-home 2>/dev/null' \
    'SECRETS_FILE="${DATA_DIR:-/app/data}/secrets.env"' \
    'if [ -z "$JWT_SECRET" ] || [ "${#JWT_SECRET}" -lt 32 ]; then' \
    '  if [ ! -f "$SECRETS_FILE" ]; then' \
    '    mkdir -p "$(dirname "$SECRETS_FILE")"' \
    '    umask 077' \
    '    { printf "JWT_SECRET=%s\n" "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d " \n")"' \
    '      printf "API_KEY_SECRET=%s\n" "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d " \n")"' \
    '      printf "MACHINE_ID_SALT=%s\n" "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d " \n")"; } > "$SECRETS_FILE"' \
    '    chown node:node "$SECRETS_FILE" 2>/dev/null' \
    '  fi' \
    '  . "$SECRETS_FILE"' \
    '  export JWT_SECRET API_KEY_SECRET MACHINE_ID_SALT' \
    'fi' \
    'exec su-exec node "$@"' \
    > /entrypoint.sh && \
  chmod +x /entrypoint.sh

EXPOSE 20128

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "custom-server.js"]
