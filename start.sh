#!/usr/bin/env bash
set -euo pipefail

# Build locally without tagging or publishing a release. Build before stopping
# the running gateway so a failed build leaves the existing service untouched.
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${KITSUNE_ROUTER_IMAGE:-ghcr.io/bykitsune/kitsune-router:local}"
CONTAINER="${KITSUNE_ROUTER_CONTAINER:-kitsune-router}"
DATA_VOLUME="${KITSUNE_ROUTER_DATA_VOLUME:-kitsune-router-data}"
PORT="${KITSUNE_ROUTER_PORT:-20128}"
ENV_FILE="${KITSUNE_ROUTER_ENV_FILE:-$PROJECT_DIR/.env}"
RUN_ARGS=(run -d --name "$CONTAINER" --restart unless-stopped -p "$PORT:20128")
CONTAINER_DATA_DIR=/app/data

if [[ -f "$ENV_FILE" ]]; then
  # Docker --env-file is literal, not shell/dotenv syntax: no quote removal,
  # interpolation or evaluation. Last assignment wins; a bare key inherits the
  # invoking environment. Read only, and validate before stopping any service.
  first_line=true
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$first_line" == true ]]; then line="${line#$'\xef\xbb\xbf'}"; first_line=false; fi
    line="${line%$'\r'}"
    line="${line#"${line%%[!$' \t']*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    if [[ -z "$key" || "$key" == *[[:space:]]* ]]; then
      printf '%s\n' 'Invalid Docker env-file key; review the private file before restarting.' >&2
      exit 1
    fi
    if [[ "$key" == DATA_DIR ]]; then
      if [[ "$line" == *=* ]]; then CONTAINER_DATA_DIR="${line#*=}"
      else CONTAINER_DATA_DIR="${DATA_DIR:-/app/data}"; fi
    fi
  done < "$ENV_FILE"
  RUN_ARGS+=(--env-file "$ENV_FILE")
elif [[ -n "${KITSUNE_ROUTER_ENV_FILE:-}" ]]; then
  printf 'Configured environment file not found: %s\n' "$ENV_FILE" >&2
  exit 1
fi

# An explicit invoking DATA_DIR wins over the env file. Pass the exact resolved
# container path so Docker and the volume target cannot diverge.
if [[ ${DATA_DIR+x} ]]; then CONTAINER_DATA_DIR="$DATA_DIR"; fi
CONTAINER_DATA_DIR="${CONTAINER_DATA_DIR:-/app/data}"
while [[ "$CONTAINER_DATA_DIR" != / && "$CONTAINER_DATA_DIR" == */ ]]; do CONTAINER_DATA_DIR="${CONTAINER_DATA_DIR%/}"; done
case "$CONTAINER_DATA_DIR" in
  /*) ;;
  *) printf '%s\n' 'DATA_DIR must be an absolute container path.' >&2; exit 1 ;;
esac
case "/${CONTAINER_DATA_DIR#/}/" in
  *'/../'*|*'/./'*|*'//'*) printf '%s\n' 'DATA_DIR must be a normalized absolute container path.' >&2; exit 1 ;;
esac
if [[ "$CONTAINER_DATA_DIR" == / || "$CONTAINER_DATA_DIR" == /app || "$CONTAINER_DATA_DIR" == *:* || "$CONTAINER_DATA_DIR" == *[[:cntrl:]]* ]]; then
  printf '%s\n' 'DATA_DIR is not a usable persistent container mount target.' >&2
  exit 1
fi
RUN_ARGS+=(-e "DATA_DIR=$CONTAINER_DATA_DIR")

docker build -t "$IMAGE" "$PROJECT_DIR"
if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  docker stop "$CONTAINER"
  # Never remove volumes: database, runtime secrets and MITM keys survive updates.
  docker rm "$CONTAINER"
fi
docker "${RUN_ARGS[@]}" -v "$DATA_VOLUME:$CONTAINER_DATA_DIR" "$IMAGE"
