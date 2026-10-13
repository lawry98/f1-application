#!/usr/bin/env bash
#
# Boot the backend image and check what the CI `container` job checks. The image must already be
# built (docker build -f backend/Dockerfile -t f1-backend .). Usage:
#
#   scripts/container-smoke.sh f1-backend          # SMOKE_PORT=8080 by default
#
# GOOGLE_API_KEY is a dummy and Gemini's host resolves to loopback, so no check here can reach
# Google; nothing here sends a briefing anyway.
set -euo pipefail

image="${1:?usage: scripts/container-smoke.sh <image>}"
port="${SMOKE_PORT:-8080}"
name="f1-backend-smoke-$$"
base="http://127.0.0.1:${port}"

fail() { printf 'FAIL: %s\n' "$1" >&2; docker logs "$name" >&2 || true; exit 1; }

docker run -d --name "$name" -p "127.0.0.1:${port}:8080" \
  -e GOOGLE_API_KEY=ci-dummy \
  -e CLIENT_IP_HEADER=Fly-Client-IP \
  --add-host generativelanguage.googleapis.com:127.0.0.1 \
  "$image" >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  curl -fsS "${base}/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "${base}/api/health" >/dev/null || fail "/api/health never answered 200"
echo "ok: /api/health is 200"

# The paths come from config.py itself, so this cannot drift from what the app opens.
docker exec "$name" python -c '
import pathlib, config
for path in (config.CIRCUIT_INDEX_PATH, config.CIRCUIT_COORDINATES_PATH):
    assert path.is_file(), f"missing {path}"
for path in ("/app/backend/.env", "/app/backend/.venv", "/app/backend/tests", "/app/backend/scripts"):
    assert not pathlib.Path(path).exists(), f"should not ship: {path}"
' || fail "the image's files are wrong"
echo "ok: circuit data present; .env, .venv, tests, scripts absent"

[[ "$(docker exec "$name" id -u)" != 0 ]] || fail "the process runs as root"
echo "ok: runs as a non-root user"

[[ "$(curl -s -o /dev/null -w '%{http_code}' "${base}/openapi.json")" == 404 ]] \
  || fail "/openapi.json is served"
echo "ok: API docs are off"

# uvicorn's access line prints scope["client"], the address the guard keys on.
curl -fsS -H 'X-Forwarded-For: 203.0.113.7' "${base}/api/health?probe=xff" >/dev/null
curl -fsS -H 'Fly-Client-IP: 203.0.113.8' "${base}/api/health?probe=fly" >/dev/null
logs="$(docker logs "$name" 2>&1)"
xff_line="$(grep -F 'probe=xff' <<<"$logs" || true)"
fly_line="$(grep -F 'probe=fly' <<<"$logs" || true)"
[[ -n "$xff_line" && -n "$fly_line" ]] || fail "no access log lines for the probes"
[[ "$xff_line" != *203.0.113.7* ]] || fail "X-Forwarded-For reached client.host: $xff_line"
[[ "$fly_line" == *203.0.113.8* ]] || fail "Fly-Client-IP did not reach client.host: $fly_line"
echo "ok: X-Forwarded-For ignored; Fly-Client-IP is the client"
