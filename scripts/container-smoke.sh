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

# Set before the run, not after it: a run that fails (a port already allocated) can still leave a
# Created container behind under this name.
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT

# FORWARDED_ALLOW_IPS='*' is the stray setting --no-proxy-headers exists to neutralise: with the flag
# gone, uvicorn would trust every peer and take the leftmost, client-written X-Forwarded-For entry
# as the client. Without it here the XFF probe below could not fail, because uvicorn's default trust
# list is 127.0.0.1 and the probe arrives from the Docker bridge gateway.
docker run -d --name "$name" -p "127.0.0.1:${port}:8080" \
  -e GOOGLE_API_KEY=ci-dummy \
  -e CLIENT_IP_HEADER=Fly-Client-IP \
  -e FORWARDED_ALLOW_IPS='*' \
  --add-host generativelanguage.googleapis.com:127.0.0.1 \
  "$image" >/dev/null || fail "docker run failed"

# Every curl has a --max-time, so a connection that hangs fails the check instead of the job's
# 15-minute timeout. A container that dies while booting ends the wait at once, with its logs.
for _ in $(seq 1 60); do
  curl -fsS --max-time 2 "${base}/api/health" >/dev/null 2>&1 && break
  [[ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" == true ]] \
    || fail "the container exited before /api/health answered"
  sleep 1
done
curl -fsS --max-time 5 "${base}/api/health" >/dev/null || fail "/api/health never answered 200"
echo "ok: /api/health is 200"

# The paths come from config.py itself, so this cannot drift from what the app opens.
docker exec "$name" python -c '
import pathlib, config
for path in (config.CIRCUIT_INDEX_PATH, config.CIRCUIT_COORDINATES_PATH):
    assert path.is_file(), f"missing {path}"
for path in ("/app/backend/.venv", "/app/backend/tests", "/app/backend/scripts"):
    assert not pathlib.Path(path).exists(), f"should not ship: {path}"
# Any .env* at any depth: an editor backup (.env~) or a .env.local holds the same keys as .env.
env_files = sorted(str(path) for path in pathlib.Path("/app").rglob(".env*"))
assert not env_files, f"should not ship: {env_files}"
' || fail "the image's files are wrong"
echo "ok: circuit data files exist; /app has no .env*, /app/backend no .venv, tests or scripts"

# Numeric and non-zero, so an exec that fails or prints nothing cannot pass as non-root.
uid="$(docker exec "$name" id -u)" || fail "could not run id -u in the container"
[[ "$uid" =~ ^[0-9]+$ && "$uid" != 0 ]] || fail "docker exec does not run as a non-root uid: '${uid}'"
echo "ok: docker exec runs as a non-root uid (${uid})"

# curl prints 000 for a connection that failed or timed out.
code="$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' "${base}/openapi.json")" || true
[[ "$code" == 404 ]] || fail "/openapi.json answered ${code}, not 404"
echo "ok: /openapi.json is 404"

# uvicorn's access line prints scope["client"], the address the guard keys on. With
# FORWARDED_ALLOW_IPS='*' above, an X-Forwarded-For that reaches client.host is a proxy-headers leak.
curl -fsS --max-time 5 -H 'X-Forwarded-For: 203.0.113.7' "${base}/api/health?probe=xff" >/dev/null \
  || fail "the X-Forwarded-For probe request failed"
curl -fsS --max-time 5 -H 'Fly-Client-IP: 203.0.113.8' "${base}/api/health?probe=fly" >/dev/null \
  || fail "the Fly-Client-IP probe request failed"

# The json-file log driver is asynchronous, so a line can trail its request: read until both probe
# lines are there, for at most ~5s.
xff_line=""
fly_line=""
for _ in $(seq 1 10); do
  logs="$(docker logs "$name" 2>&1)" || fail "could not read the container's logs"
  xff_line="$(grep -F 'probe=xff' <<<"$logs" || true)"
  fly_line="$(grep -F 'probe=fly' <<<"$logs" || true)"
  [[ -n "$xff_line" && -n "$fly_line" ]] && break
  sleep 0.5
done
[[ -n "$xff_line" && -n "$fly_line" ]] || fail "no access log lines for the probes after 5s"
[[ "$xff_line" != *203.0.113.7* ]] || fail "X-Forwarded-For reached client.host: $xff_line"
[[ "$fly_line" == *203.0.113.8* ]] || fail "Fly-Client-IP did not reach client.host: $fly_line"
echo "ok: access log: X-Forwarded-For is not the client (FORWARDED_ALLOW_IPS='*'); Fly-Client-IP is"

# The effective command line of PID 1, as the container really started it.
cmdline="$(docker exec "$name" cat /proc/1/cmdline | tr '\0' ' ')" || fail "could not read /proc/1/cmdline"
[[ "$cmdline" == *' --workers 1 '* ]] || fail "uvicorn is not started with --workers 1: $cmdline"
[[ "$cmdline" == *' --no-proxy-headers '* ]] || fail "uvicorn is not started with --no-proxy-headers: $cmdline"
echo "ok: uvicorn command line has --workers 1 and --no-proxy-headers"
