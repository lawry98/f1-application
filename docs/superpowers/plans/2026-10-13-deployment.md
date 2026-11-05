# Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything up to the first deploy of the app as a public portfolio — Next.js on Vercel Hobby, FastAPI on one 512 MB Fly machine — built, booted and proven locally and in CI, with an owner-run wizard for the steps only the owner can do.

**Architecture:** One application change: a pure ASGI middleware that takes the visitor's address from a header the edge proxy sets (`Fly-Client-IP`), switched on by `CLIENT_IP_HEADER`, with uvicorn's own proxy handling off. Around it, configuration only: a Dockerfile and an allow-list `.dockerignore`, `fly.toml`, `frontend/vercel.json`, a `deploy.yml` that deploys the exact commit CI passed and skips green until a token exists, a CI `container` job, documentation, ADR-0005 and a setup wizard.

**Tech Stack:** FastAPI 0.128 / Starlette, uvicorn 0.40, pytest; Docker (BuildKit); Fly.io (flyctl 0.4.115); Vercel; GitHub Actions; bash.

**Spec:** `docs/superpowers/specs/2026-10-02-deployment-design.md` — read the **Revalidated 2026-10-13** section first; it overrides the sections above it. Evidence: `docs/superpowers/research/2026-10-13-deployment-platforms.md`.

## Global Constraints

- One machine, ever: `--ha=false`, `auto_stop_machines = "off"`, `[deploy] strategy = "rolling"`, one uvicorn worker. 512 MB, `shared-cpu-1x`, region `iad`, `swap_size_mb = 512` (top-level).
- `BRIEFING_DAILY_CAP = "8"`, `BRIEFING_PER_IP_PER_HOUR = "3"`, `CLIENT_IP_HEADER = "Fly-Client-IP"`, `CORS_ORIGINS = "https://f1-race-briefing.vercel.app"` in `fly.toml [env]`; Fly app `f1-race-briefing-api`.
- uvicorn runs with `--no-proxy-headers`. Never `FORWARDED_ALLOW_IPS='*'` anywhere: uvicorn then trusts the leftmost, client-written `X-Forwarded-For`.
- Base image `python:3.12.15-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1`.
- `.dockerignore` is an allow-list; the image keeps `/app/backend` beside `/app/frontend/data/circuits`.
- `deploy.yml` runs only after `CI` succeeds on a push to `main` (or a manual run on `main`), checks out that exact SHA, and skips green when `FLY_API_TOKEN` is unset.
- `superfly/flyctl-actions/setup-flyctl@ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1  # 1.6`, flyctl `0.4.115`, `actions/checkout@v7` in `deploy.yml`; `ci.yml` keeps its `actions/checkout@v4`.
- No `ENABLE_EXPERIMENTAL_COREPACK` anywhere. Vercel takes pnpm 11.8.0 from `frontend/package.json`'s `packageManager`; `engines.node` is `"24.x"`.
- Gemini budget is **zero**: no request may reach `generativelanguage.googleapis.com` from any check in this plan. Containers run with `GOOGLE_API_KEY=ci-dummy` and `--add-host generativelanguage.googleapis.com:127.0.0.1`. Real keys are never baked into an image, written to a committed file, or printed.
- Ports for local runs: container :8025, frontend :3025, Playwright :3125 (temp untracked config). Never :3100, never another session's server.
- Backend conventions: config read only in `config.py`; `logger = logging.getLogger(__name__)`; snake_case; ruff (line length 100). Coverage floor 95% (`pyproject.toml`).

## Review Focus

1. **A visitor forging `Fly-Client-IP` or `X-Forwarded-For`** expects nothing; the guard must key on the real address. Fly's edge overwrites `Fly-Client-IP` (observed, R1); in the image `X-Forwarded-For` must never reach `client.host`. → Task 3's smoke script asserts a forged XFF never appears in the access log and a `Fly-Client-IP` does; Task 1 asserts the middleware ignores XFF.
2. **A developer's real `backend/.env` present at build time** must never enter the image. A CI checkout has none, so an absence check there proves nothing. → Task 3's CI step plants a decoy `backend/.env` before building; the smoke script asserts it is absent.
3. **`deploy.yml` firing before setup** (no `FLY_API_TOKEN`) must leave `main` green. → Task 4 gates every step on a token-presence output; actionlint validates; the report notes it can only run for real after merge (workflow_run needs the default branch).
4. **A CORS preflight** must log the visitor, not the proxy — CORS answers preflights without calling inner middleware. → Task 2 drives a raw ASGI `OPTIONS` through `create_app` and asserts `scope["client"]` afterwards, which is what uvicorn's access log reads.
5. **A request that bypasses the edge** (repeated header, zone id, garbage) must fall back to the TCP peer, never crash or key on the raw text. → Task 1 tests each.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `backend/api/client_ip.py` (new) | The middleware: one header → `scope["client"]` | 1 |
| `backend/tests/api/test_client_ip.py` (new) | Its unit tests and its wiring through `create_app` | 1, 2 |
| `backend/config.py` | `CLIENT_IP_HEADER` | 2 |
| `backend/tests/test_config.py` | Its parsing tests | 2 |
| `backend/api/app.py`, `backend/main.py` | Mount it when configured, outermost | 2 |
| `backend/api/guard.py`, `backend/api/routes.py`, `backend/tests/api/test_briefing_cost_guard.py` | Docstrings that still advise `--proxy-headers` | 2 |
| `backend/Dockerfile`, `.dockerignore` (new) | The image | 3 |
| `scripts/container-smoke.sh` (new) | Boot an image and assert what CI asserts | 3 |
| `.github/workflows/ci.yml`, `Makefile` | `container` job; `docker`, `docker-check` targets | 3 |
| `fly.toml`, `frontend/vercel.json`, `.github/workflows/deploy.yml` (new); `frontend/package.json` | Host config | 4 |
| `README.md`, `CLAUDE.md`, `backend/env.example`, `docs/adr/0005-deploy-on-fly-and-vercel.md` | Docs | 5 |
| `scripts/deploy-wizard.sh` (new) | Owner-only steps, first deploy, post-deploy checks | 6 |

---

### Task 1: The client-IP middleware

**Files:**
- Create: `backend/api/client_ip.py`
- Test: `backend/tests/api/test_client_ip.py`

**Interfaces:**
- Produces: `class ClientIPMiddleware` with `__init__(self, app: ASGIApp, *, header: str) -> None` and the ASGI `__call__(scope, receive, send)`. On an `http` scope carrying exactly one `header` (case-insensitive) whose stripped value parses as an IP with no zone, sets `scope["client"] = (str(ip), 0)` in place, IPv4-mapped IPv6 unwrapped. Otherwise leaves the scope untouched. Non-`http` scopes pass through untouched.

- [ ] **Step 1: Write the failing tests**

```python
"""The client-IP middleware: one header the edge proxy sets becomes ``request.client``.

The guard keys on ``request.client.host`` (api/guard.py), and so does uvicorn's access log, so
this middleware is the whole of "which visitor is this" in production. What it must never do is
key on text a visitor chose: anything but exactly one well-formed address leaves the TCP peer.
"""

import asyncio

import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from api.client_ip import ClientIPMiddleware

# TestClient's own peer, which every "left untouched" case must still report.
PEER = "testclient"


def whoami(request: Request) -> PlainTextResponse:
    return PlainTextResponse(request.client.host if request.client else "none")


def client_for(header: str = "Fly-Client-IP") -> TestClient:
    app = Starlette(routes=[Route("/whoami", whoami)])
    return TestClient(ClientIPMiddleware(app, header=header))


def host_seen(headers, header: str = "Fly-Client-IP") -> str:
    return client_for(header).get("/whoami", headers=headers).text


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("203.0.113.7", "203.0.113.7"),
        ("2001:db8::1", "2001:db8::1"),
        ("2001:DB8::1", "2001:db8::1"),  # canonical form, so one visitor is one key
        ("::ffff:203.0.113.7", "203.0.113.7"),  # mapped IPv4 keys as the IPv4 it is
        ("  203.0.113.7 ", "203.0.113.7"),
    ],
)
def test_the_header_becomes_the_client_address(value, expected):
    assert host_seen({"Fly-Client-IP": value}) == expected


def test_the_header_name_is_matched_without_regard_to_case():
    assert host_seen({"fly-client-ip": "203.0.113.7"}, header="FLY-CLIENT-IP") == "203.0.113.7"


def test_without_the_header_the_peer_is_left_alone():
    assert host_seen({}) == PEER


@pytest.mark.parametrize(
    "value",
    [
        "",
        "unknown",
        "203.0.113.7, 198.51.100.1",  # a list is a forwarding chain, not an address
        "203.0.113.7:4321",
        "[2001:db8::1]",
        "fe80::1%eth0",  # a zone means nothing from a client, and str() would keep it
        "01.2.3.4",
    ],
)
def test_a_value_that_is_not_one_plain_address_leaves_the_peer(value):
    assert host_seen({"Fly-Client-IP": value}) == PEER


def test_a_repeated_header_leaves_the_peer():
    """Fly's edge always sends exactly one, so two means the request did not come through it."""
    headers = [("Fly-Client-IP", "203.0.113.7"), ("Fly-Client-IP", "198.51.100.1")]

    assert host_seen(headers) == PEER


def test_x_forwarded_for_is_never_read():
    assert host_seen({"X-Forwarded-For": "203.0.113.7"}) == PEER


def test_a_non_http_scope_passes_through_untouched():
    """Lifespan has no headers and no client; the app must still start."""
    seen = []

    async def app(scope, receive, send):
        seen.append(dict(scope))

    scope = {"type": "lifespan", "asgi": {"version": "3.0"}}

    asyncio.run(ClientIPMiddleware(app, header="Fly-Client-IP")(scope, None, None))

    assert seen == [scope]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/api/test_client_ip.py -q --no-cov`
Expected: collection error, `ModuleNotFoundError: No module named 'api.client_ip'`.

- [ ] **Step 3: Write the implementation**

```python
"""The visitor's address, read from the one header the edge proxy sets.

The cost guard keys on ``request.client.host`` (api/guard.py), and uvicorn's access log prints the
same ``scope["client"]``. Behind Fly's proxy that is the proxy, so every visitor would share one
hourly allowance. uvicorn's own fix, ``--proxy-headers``, is no fix there: Fly does not document its
proxy's address, and ``FORWARDED_ALLOW_IPS='*'`` makes uvicorn trust the *leftmost* X-Forwarded-For
entry, which the visitor writes. Fly's ``Fly-Client-IP`` is set by the proxy itself, and a value the
visitor sends is replaced (observed 2026-10-13; see docs/adr/0005-deploy-on-fly-and-vercel.md).

So this reads exactly that header and nothing else, and rewrites ``scope["client"]`` **in place**,
which is what makes the access log agree with the guard. Anything but exactly one plain address
leaves the TCP peer: a repeated header means the request did not come through the edge, and a
zone id or a list is not an address a client can have.
"""

import ipaddress

from starlette.types import ASGIApp, Receive, Scope, Send


class ClientIPMiddleware:
    def __init__(self, app: ASGIApp, *, header: str) -> None:
        self.app = app
        # ASGI header names arrive as lowercased bytes.
        self._header = header.lower().encode("latin-1")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            visitor = self._visitor(scope)
            if visitor is not None:
                scope["client"] = (visitor, 0)
        await self.app(scope, receive, send)

    def _visitor(self, scope: Scope) -> str | None:
        values = [value for name, value in scope["headers"] if name.lower() == self._header]
        if len(values) != 1:
            return None
        try:
            ip = ipaddress.ip_address(values[0].decode("latin-1").strip())
        except ValueError:
            return None
        if isinstance(ip, ipaddress.IPv6Address):
            if ip.scope_id is not None:
                return None
            ip = ip.ipv4_mapped or ip
        return str(ip)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/api/test_client_ip.py -q --no-cov`
Expected: all pass.

- [ ] **Step 5: Lint, format, commit**

```bash
cd backend && .venv/bin/python -m ruff check . && .venv/bin/python -m ruff format --check .
git add backend/api/client_ip.py backend/tests/api/test_client_ip.py
git commit -m "feat(api): read the visitor's address from one proxy-set header"
```

---

### Task 2: `CLIENT_IP_HEADER`, mounted outermost

**Files:**
- Modify: `backend/config.py` (after `EXPOSE_API_DOCS`, in the `── API ──` block)
- Modify: `backend/api/app.py`, `backend/main.py`
- Modify (docstrings only): `backend/api/guard.py:19-23`, `backend/api/routes.py:72-78`, `backend/tests/api/test_briefing_cost_guard.py:155-156`
- Test: `backend/tests/test_config.py`, `backend/tests/api/test_client_ip.py`

**Interfaces:**
- Consumes: `ClientIPMiddleware(app, *, header: str)` from Task 1.
- Produces: `config.CLIENT_IP_HEADER: str | None`; `create_app(*, expose_docs: bool, client_ip_header: str | None = None) -> FastAPI`.

- [ ] **Step 1: Write the failing config tests** (append to `backend/tests/test_config.py`, using its `reload_config` fixture)

```python
# ── Client IP header ─────────────────────────────────────────────────────────


def test_the_client_ip_header_is_off_by_default(reload_config, monkeypatch):
    """Local dev has no proxy in front, so the TCP peer is the visitor."""
    monkeypatch.delenv("CLIENT_IP_HEADER", raising=False)

    assert reload_config().CLIENT_IP_HEADER is None


@pytest.mark.parametrize(("raw", "expected"), [("Fly-Client-IP", "Fly-Client-IP"), (" Fly-Client-IP ", "Fly-Client-IP")])
def test_the_client_ip_header_reads_the_environment(reload_config, raw, expected):
    assert reload_config(CLIENT_IP_HEADER=raw).CLIENT_IP_HEADER == expected


def test_an_empty_client_ip_header_is_off_quietly(reload_config, caplog):
    with caplog.at_level(logging.WARNING, logger="config"):
        assert reload_config(CLIENT_IP_HEADER="").CLIENT_IP_HEADER is None

    assert "CLIENT_IP_HEADER" not in caplog.text


@pytest.mark.parametrize("raw", ["Fly Client IP", "Fly-Client-IP:", "X(Forwarded)"])
def test_a_client_ip_header_that_is_not_a_header_name_warns_and_stays_off(
    reload_config, raw, caplog
):
    """RFC 9110 §5.6.2: a field name is a token. A typo fails closed, to the TCP peer."""
    with caplog.at_level(logging.WARNING, logger="config"):
        assert reload_config(CLIENT_IP_HEADER=raw).CLIENT_IP_HEADER is None

    assert "CLIENT_IP_HEADER" in caplog.text
```

- [ ] **Step 2: Write the failing wiring tests** (append to `backend/tests/api/test_client_ip.py`)

```python
# ── Wired through create_app, as production runs it ─────────────────────────

from api import routes as routes_module
from api.app import create_app
from api.guard import AdmissionGuard
from tests.api.test_routes import FakeAgent, successful_steps
from tests.factories import FakeClock

T0 = 1_790_762_400.0  # 2026-09-30 10:00:00 UTC


@pytest.fixture
def one_briefing_per_ip(monkeypatch):
    guard = AdmissionGuard(
        per_ip_per_hour=1, daily_cap=100, max_concurrent=2, lease_seconds=150, clock=FakeClock(T0)
    )
    monkeypatch.setattr(routes_module, "briefing_guard", guard)
    monkeypatch.setattr(routes_module, "agent", FakeAgent(steps=successful_steps()))
    return guard


def brief(client: TestClient, visitor: str) -> int:
    return client.post(
        "/api/briefing/stream", json={"query": "monaco"}, headers={"Fly-Client-IP": visitor}
    ).status_code


def test_two_visitors_get_two_allowances(one_briefing_per_ip):
    client = TestClient(create_app(expose_docs=False, client_ip_header="Fly-Client-IP"))

    assert [brief(client, "203.0.113.7"), brief(client, "198.51.100.1")] == [200, 200]


def test_one_visitor_shares_one_allowance_across_requests(one_briefing_per_ip):
    client = TestClient(create_app(expose_docs=False, client_ip_header="Fly-Client-IP"))

    assert [brief(client, "203.0.113.7"), brief(client, "203.0.113.7")] == [200, 429]


def test_without_a_configured_header_it_is_not_mounted(one_briefing_per_ip):
    """Off, the header is just text a caller typed: both requests are TestClient's one peer."""
    client = TestClient(create_app(expose_docs=False, client_ip_header=None))

    assert [brief(client, "203.0.113.7"), brief(client, "198.51.100.1")] == [200, 429]


def test_a_cors_preflight_is_logged_as_the_visitor():
    """CORS answers a preflight without calling what it wraps, so the middleware must sit outside
    it. uvicorn's access line is read from this same scope dict after the response."""
    app = create_app(expose_docs=False, client_ip_header="Fly-Client-IP")
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "OPTIONS",
        "scheme": "http",
        "path": "/api/briefing/stream",
        "raw_path": b"/api/briefing/stream",
        "query_string": b"",
        "root_path": "",
        "headers": [
            (b"origin", b"http://localhost:3000"),
            (b"access-control-request-method", b"POST"),
            (b"fly-client-ip", b"203.0.113.7"),
        ],
        "client": ("172.16.0.1", 50000),
        "server": ("testserver", 80),
    }
    sent = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    asyncio.run(app(scope, receive, send))

    assert sent[0]["status"] == 200  # answered by CORS itself
    assert scope["client"] == ("203.0.113.7", 0)


def test_the_app_still_starts_with_the_middleware_mounted():
    with TestClient(create_app(expose_docs=False, client_ip_header="Fly-Client-IP")) as client:
        assert client.get("/api/health").status_code == 200
```

Move these imports to the top of the file with Task 1's (ruff's `I` rule sorts them).

- [ ] **Step 3: Run them to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_config.py tests/api/test_client_ip.py -q --no-cov`
Expected: config tests fail with `AttributeError: module 'config' has no attribute 'CLIENT_IP_HEADER'`; wiring tests fail with `TypeError: create_app() got an unexpected keyword argument 'client_ip_header'`.

- [ ] **Step 4: Implement config** (`backend/config.py`, after `EXPOSE_API_DOCS`)

```python
# RFC 9110 §5.6.2: a field name is a token, `1*tchar`.
_HTTP_TOKEN = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")


def _header_name_from_env(name: str) -> str | None:
    """Read an HTTP header name: unset or empty is off; anything not a header name warns and is off."""
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    if not _HTTP_TOKEN.fullmatch(raw):
        logger.warning("Invalid %s=%r — not an HTTP header name, leaving it off", name, raw)
        return None
    return raw


# The header the edge proxy writes the visitor's address into — `Fly-Client-IP` on Fly, set in
# fly.toml. Off by default, so `client.host` is the TCP peer, which is the visitor in local dev.
# See api/client_ip.py for why this is not uvicorn's --proxy-headers.
CLIENT_IP_HEADER: str | None = _header_name_from_env("CLIENT_IP_HEADER")
```

- [ ] **Step 5: Implement the factory and entry point**

`backend/api/app.py`:

```python
"""The FastAPI app, built by a factory so tests can make one without importing main.

Importing main runs ``validate_config()`` and switches on FastF1's on-disk cache, neither of
which belongs in a unit test (see the ``client`` fixture in tests/conftest.py).
"""

import logging

from fastapi import FastAPI

from api.client_ip import ClientIPMiddleware
from api.cors import add_cors
from api.routes import router

logger = logging.getLogger(__name__)


def create_app(*, expose_docs: bool, client_ip_header: str | None = None) -> FastAPI:
    """Build the API.

    ``expose_docs`` serves /docs, /redoc and /openapi.json; off, all three 404.
    ``client_ip_header`` names the header the edge proxy writes the visitor's address into
    (api/client_ip.py); ``None`` leaves ``request.client`` as the TCP peer.
    """
    docs_urls = {} if expose_docs else {"docs_url": None, "redoc_url": None, "openapi_url": None}
    app = FastAPI(
        title="F1 Briefing Agent API",
        description="AI-powered F1 race weekend briefing generator",
        version="1.0.0",
        **docs_urls,
    )

    add_cors(app)
    # Added after CORS, so it wraps it: CORS answers a preflight without calling what it wraps,
    # and the access log should show the visitor on those lines too.
    if client_ip_header:
        app.add_middleware(ClientIPMiddleware, header=client_ip_header)
        logger.info("Client address read from the %s header", client_ip_header)

    app.include_router(router)
    # … root() unchanged …
    return app
```

`backend/main.py`: import `CLIENT_IP_HEADER` beside `EXPOSE_API_DOCS` and call
`create_app(expose_docs=EXPOSE_API_DOCS, client_ip_header=CLIENT_IP_HEADER)`.

- [ ] **Step 6: Correct the proxy advice in docstrings** (behaviour untouched)

- `backend/api/guard.py` module docstring, the "client IP" paragraph → "**The client IP is whatever
  the caller passes in**, and routes.py passes ``request.client.host``. It never parses a forwarding
  header itself, because anyone can send one. Behind Fly, ``CLIENT_IP_HEADER=Fly-Client-IP`` makes
  ``client.host`` the visitor (api/client_ip.py). Behind another proxy, either name the one header
  it sets the same way, or run uvicorn with ``--proxy-headers`` and ``FORWARDED_ALLOW_IPS`` set to
  that proxy's exact address — never ``*``, which trusts the leftmost, client-written entry."
- `backend/api/routes.py` `_admit` docstring → "``client.host`` is the TCP peer, or, with
  ``CLIENT_IP_HEADER`` set, the visitor the edge proxy names (api/client_ip.py). X-Forwarded-For is
  never read here, because anyone can send one."
- `test_forwarded_for_does_not_buy_a_fresh_limit` docstring → "The limit keys on ``client.host``.
  X-Forwarded-For is whatever the caller typed, and nothing in the app reads it."

- [ ] **Step 7: Run the whole backend suite**

Run: `cd backend && .venv/bin/python -m ruff check . && .venv/bin/python -m ruff format --check . && .venv/bin/python -m pytest -q`
Expected: all pass, coverage ≥ 95%.

- [ ] **Step 8: Commit**

```bash
git add backend/config.py backend/api/app.py backend/main.py backend/api/guard.py backend/api/routes.py backend/tests
git commit -m "feat(api): CLIENT_IP_HEADER mounts the client-IP middleware outside CORS"
```

---

### Task 3: The image, its smoke check, CI and `make`

**Files:**
- Create: `backend/Dockerfile`, `.dockerignore`, `scripts/container-smoke.sh`
- Modify: `.github/workflows/ci.yml` (new `container` job, last), `Makefile`

**Interfaces:**
- Consumes: `CLIENT_IP_HEADER` and `config.CIRCUIT_INDEX_PATH` / `CIRCUIT_COORDINATES_PATH`.
- Produces: an image built by `docker build -f backend/Dockerfile -t f1-backend .` from the repo root, listening on 8080; `scripts/container-smoke.sh <image>` (env `SMOKE_PORT`, default 8080) exiting non-zero on any failed check.

- [ ] **Step 1: Write the smoke script first — it is this task's test** (`scripts/container-smoke.sh`, `chmod +x`)

```bash
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
```

- [ ] **Step 2: Run it against nothing, to see it fail**

Run: `docker image rm f1-backend 2>/dev/null; SMOKE_PORT=8025 scripts/container-smoke.sh f1-backend`
Expected: non-zero, `Unable to find image 'f1-backend:latest' locally` (or a pull error).

- [ ] **Step 3: Write the image**

`.dockerignore` (repo root):

```gitignore
# An allow-list: everything is out unless named below. The image is the backend and the one
# frontend directory the backend reads at runtime (config.CIRCUIT_INDEX_PATH); a new runtime file
# outside backend/ needs a line here *and* a COPY in backend/Dockerfile.
*
!backend/
!frontend/data/circuits/

# …and, inside those, nothing that is only for development. backend/.env above all: a developer's
# real keys must never be baked into an image (CI plants a decoy to prove it).
**/.env
**/.env.*
backend/.venv
backend/tests
backend/scripts
backend/cache
**/__pycache__
**/.pytest_cache
**/.ruff_cache
**/.coverage*
```

`backend/Dockerfile`:

```dockerfile
# The backend's production image. The context is the repo root, not backend/:
#
#   docker build -f backend/Dockerfile .
#
# The backend reads frontend/data/circuits/ at runtime (config.CIRCUIT_INDEX_PATH), so the image
# keeps the repo's layout, /app/backend beside /app/frontend/data/circuits. The root .dockerignore
# is an allow-list; read it before adding a COPY.

# Tag and digest, so a rebuild is the same base until someone edits this line.
FROM python:3.12.15-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    FASTF1_CACHE_DIR=/tmp/fastf1

# Dependencies in their own layer, before the source, so a code-only change reuses it.
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt

COPY frontend/data/circuits/ /app/frontend/data/circuits/
COPY backend/ /app/backend/

RUN useradd --system --uid 10001 --create-home --home-dir /home/app app
USER app
WORKDIR /app/backend

EXPOSE 8080

# One worker: the cost guard's limits live in this process's memory (api/guard.py), so a second
# worker would double every one. --no-proxy-headers: uvicorn's X-Forwarded-For handling stays off
# even if FORWARDED_ALLOW_IPS is set by mistake — with '*' it trusts the leftmost, client-written
# entry. The visitor's address comes from CLIENT_IP_HEADER instead (api/client_ip.py).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-proxy-headers"]
```

- [ ] **Step 4: Build with a decoy `.env`, then run the smoke script**

```bash
printf 'GOOGLE_API_KEY=decoy-must-not-ship\n' > backend/.env
docker build -f backend/Dockerfile -t f1-backend .
rm backend/.env
SMOKE_PORT=8025 scripts/container-smoke.sh f1-backend
```

Expected: every line `ok: …`, exit 0. (Only delete `backend/.env` inside this worktree, which has no real one — check with `git status --ignored backend/.env` first.)

- [ ] **Step 5: Prove a briefing stream, with no Gemini** (not committed — the evidence goes in the report)

```bash
docker run -d --name f1-stream -p 127.0.0.1:8025:8080 \
  -e GOOGLE_API_KEY=ci-dummy -e BRIEFING_DEADLINE_SECONDS=5 \
  --add-host generativelanguage.googleapis.com:127.0.0.1 f1-backend
# wait for /api/health, then:
curl -sN -X POST http://127.0.0.1:8025/api/briefing/stream \
  -H 'Content-Type: application/json' -d '{"query":"monaco"}' | ts -s '%.s' || true
docker logs f1-stream 2>&1 | grep -E 'Briefing|planner|generativelanguage' ; docker rm -f f1-stream
```

Expected: `event: step` lines (resolver, then the planner degrading to `DEFAULT_TOOLS` — its request is refused locally), tool events, then exactly one terminal `event: error` with `"code": "deadline"`. No `event: delta`. (`ts` may be absent — then pipe through `while IFS= read -r l; do printf '%s %s\n' "$(date +%s.%N)" "$l"; done`.)

- [ ] **Step 6: Measure memory, with no Gemini** (spec Revalidated → Sizing; not committed)

```bash
docker run -d --name f1-size -p 127.0.0.1:8025:8080 --memory 512m --memory-swap 1g \
  -e GOOGLE_API_KEY=ci-dummy --add-host generativelanguage.googleapis.com:127.0.0.1 f1-backend
# wait for health; then concurrently: two briefings (monaco, silverstone 2023), /api/standings,
# /api/circuits/monza/winners (pick a real id from frontend/data/circuits/index.json); wait for all
docker exec f1-size cat /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.swap.peak
docker rm -f f1-size
```

Record the peak and which Sizing row applies. If 400–512 MB, `fly.toml` gets `BRIEFING_MAX_CONCURRENT = "1"` (Task 4). Over 512 MB: stop and report.

- [ ] **Step 7: CI job and make targets**

Append to `.github/workflows/ci.yml` `jobs:` (after `browser`):

```yaml
  container:
    name: Container (build + boot the backend image)
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      # A checkout has no backend/.env, so plant one: the image must leave it out because the
      # .dockerignore allow-list says so, not because there was nothing there to copy.
      - name: Plant a decoy backend/.env
        run: printf 'GOOGLE_API_KEY=decoy-must-not-ship\n' > backend/.env

      # The context is the repo root: the image also takes frontend/data/circuits/.
      - name: Build
        run: docker build -f backend/Dockerfile -t f1-backend .

      - name: Boot and check
        run: scripts/container-smoke.sh f1-backend
```

`Makefile`: add `docker docker-check` to `.PHONY`, add `docker-check` to the end of `ci:`'s prerequisites, and a section:

```make
# --- Container ------------------------------------------------------------

# Both build exactly as CI's container job does. `docker` runs the image with your keys on :8080;
# `docker-check` runs CI's checks against it, with a dummy key.
docker: ## Build the backend image and run it on :8080 with backend/.env
	docker build -f backend/Dockerfile -t f1-backend .
	docker run --rm -p 8080:8080 --env-file backend/.env f1-backend

docker-check: ## Build the backend image and run CI's container checks against it
	docker build -f backend/Dockerfile -t f1-backend .
	scripts/container-smoke.sh f1-backend
```

- [ ] **Step 8: Validate and commit**

Run: `actionlint .github/workflows/ci.yml && bash -n scripts/container-smoke.sh && (command -v shellcheck >/dev/null && shellcheck scripts/container-smoke.sh || true) && make -n docker docker-check`
Expected: no output from actionlint; make prints the two recipes.

```bash
git add backend/Dockerfile .dockerignore scripts/container-smoke.sh .github/workflows/ci.yml Makefile
git commit -m "build: backend image, an allow-list .dockerignore and a CI container job"
```

---

### Task 4: Host config — `fly.toml`, `vercel.json`, `deploy.yml`

**Files:**
- Create: `fly.toml`, `frontend/vercel.json`, `.github/workflows/deploy.yml`
- Modify: `frontend/package.json` (add `engines`)

**Interfaces:**
- Consumes: the image from Task 3 (`backend/Dockerfile`, port 8080).
- Produces: secret name `FLY_API_TOKEN` (the wizard sets it); Fly app `f1-race-briefing-api`; Vercel origin `https://f1-race-briefing.vercel.app`.

- [ ] **Step 1: `fly.toml`** (repo root; `flyctl deploy` runs here, so this is both the build context and fly.toml's directory)

```toml
# Fly.io config for the backend. One machine, always on, never two — the cost guard's limits live
# in one process's memory (api/guard.py). The first deploy must be `fly deploy --ha=false`, or Fly
# creates two machines; .github/workflows/deploy.yml passes it on every deploy.
# Docs: https://docs.fly.io/reference/configuration — why each value: docs/adr/0005.

app = "f1-race-briefing-api"
primary_region = "iad"
# A top-level key, so it must stay above the first [table]. A cushion for a brief spike, not
# capacity: past 512 MB the machine slows instead of being killed, which would cut every stream
# and reset the guard's day.
swap_size_mb = 512

[build]
  dockerfile = "backend/Dockerfile" # relative to this file; the context is the repo root

[deploy]
  # The default, said out loud: with one machine it updates that machine in place. canary and
  # bluegreen would boot a second.
  strategy = "rolling"

[env]
  CLIENT_IP_HEADER = "Fly-Client-IP"
  CORS_ORIGINS = "https://f1-race-briefing.vercel.app"
  BRIEFING_DAILY_CAP = "8"        # 8 briefings x 2 Gemini calls inside the free tier's ~20/day
  BRIEFING_PER_IP_PER_HOUR = "3"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true      # if the machine ever stops, the next request starts it

  [http_service.http_options]
    # The proxy buffers a response to compress it, which would hold back the briefing's SSE
    # events. The API serves small JSON, so compression is worth nothing here.
    compress = false

  [[http_service.checks]]
    grace_period = "30s"
    interval = "30s"
    method = "GET"
    path = "/api/health"
    timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

(If Task 3 Step 6 measured 400–512 MB, add `BRIEFING_MAX_CONCURRENT = "1"` to `[env]`.)

Validate: `python3 -c "import tomllib,json;print(json.dumps(tomllib.load(open('fly.toml','rb')),indent=1))"` shows `swap_size_mb` at the top level and `compress` under `http_service.http_options`. Then, if Docker can pull it: `docker run --rm -v "$PWD:/w" -w /w flyio/flyctl:v0.4.115 config validate --config fly.toml` — record whether it needs auth (it may; that is not a failure of the file).

- [ ] **Step 2: `frontend/vercel.json`** and `engines`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": {
    "deploymentEnabled": {
      "**": false,
      "main": true
    }
  },
  "ignoreCommand": "[ \"$VERCEL_ENV\" != production ]"
}
```

`frontend/package.json`, after `"packageManager"`: `"engines": { "node": "24.x" },`.

Validate: `cd frontend && mise exec -- pnpm install --frozen-lockfile && mise exec -- pnpm exec prettier --check vercel.json package.json`.

- [ ] **Step 3: `.github/workflows/deploy.yml`**

```yaml
name: Deploy backend

# Deploys the backend to Fly after CI passes on a push to main — the exact commit CI passed, not
# main's tip. The frontend deploys itself, through Vercel's Git integration.
#
# Until the FLY_API_TOKEN secret exists, every run ends green with its deploy steps skipped, so
# main never goes red before setup (scripts/deploy-wizard.sh sets the secret last).
# workflow_run fires only for a workflow file on the default branch, so none of this runs before
# it is merged.

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
  workflow_dispatch:

# One deploy at a time, and a queued one waits rather than cancelling a deploy mid-flight.
concurrency:
  group: deploy-backend
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  deploy:
    name: Deploy to Fly
    # workflow_run fires whatever CI's conclusion, and for pull-request runs of a branch named
    # main too, so both are checked. A manual run has no workflow_run and may only deploy main.
    if: >-
      (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') ||
      (github.event.workflow_run.conclusion == 'success' &&
       github.event.workflow_run.event == 'push')
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      # Secrets cannot appear in an `if:`, and a missing one reads as an empty string, so its
      # presence is turned into an output every later step is gated on. The token itself only
      # ever reaches the deploy step.
      - name: Check for FLY_API_TOKEN
        id: token
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: |
          if [ -n "$FLY_API_TOKEN" ]; then
            echo "present=true" >> "$GITHUB_OUTPUT"
          else
            echo "present=false" >> "$GITHUB_OUTPUT"
            echo "::notice title=Deploy skipped::FLY_API_TOKEN is not set. Run scripts/deploy-wizard.sh (README → Deployment)."
          fi

      - uses: actions/checkout@v7
        if: steps.token.outputs.present == 'true'
        with:
          ref: ${{ github.event.workflow_run.head_sha || github.sha }}

      # Tag 1.6 is the Node 24 build; the newest GitHub *release*, 1.5, is a Node 20 action.
      - uses: superfly/flyctl-actions/setup-flyctl@ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1 # 1.6
        if: steps.token.outputs.present == 'true'
        with:
          version: 0.4.115

      # --ha=false matters only if the app has no machine (say, after one was destroyed): without
      # it Fly would create two.
      - name: Deploy
        if: steps.token.outputs.present == 'true'
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: flyctl deploy --remote-only --ha=false
```

Validate: `actionlint .github/workflows/deploy.yml` → no output.

- [ ] **Step 4: Commit**

```bash
git add fly.toml frontend/vercel.json frontend/package.json .github/workflows/deploy.yml
git commit -m "build: Fly and Vercel config, and a deploy that waits for CI and skips without a token"
```

---

### Task 5: Documentation and ADR-0005

**Files:**
- Create: `docs/adr/0005-deploy-on-fly-and-vercel.md` (via `mattpocock-skills:domain-modeling`; follow `docs/adr/0004-*.md`'s format: front-matter `status: accepted`, a title that states the decision, then the why and the rejected alternatives)
- Modify: `README.md` (the "Cost guard and deploying" bullets; a new "Deployment" section), `CLAUDE.md` (env table row; the cost-guard paragraph's proxy advice; new traps), `backend/env.example`

- [ ] **Step 1: ADR-0005** — content: the topology (Vercel Hobby for `frontend/`, one always-on Fly machine for the API, browser calls the API directly so CORS and the build-time `NEXT_PUBLIC_API_URL` follow); the one-machine rule and what enforces it (`--ha=false`, `auto_stop_machines = "off"`, `strategy = "rolling"`, one worker) and why (guard state is per process; a restart resets the day, accepted); the client-IP choice (uvicorn `*` trusts the leftmost XFF, measured in 0.40 source and unchanged in 0.54; Fly's proxy address undocumented; `Fly-Client-IP` replaced by the edge, observed 2026-10-13, not documented — so the post-deploy forged-header check is the proof); deploys gated on CI by `workflow_run` with the exact `head_sha`; rejected alternatives: Railway/Render (no documented client-IP header), `--proxy-headers` with `*`, two machines, path-gated deploys, a separate Gemini key.
- [ ] **Step 2: README** — replace the "Behind a proxy, let uvicorn rewrite…" bullet with the `CLIENT_IP_HEADER` rule (and the `FORWARDED_ALLOW_IPS=<exact address>` alternative, never `*`); add "Deployment": topology diagram from the spec, the costs ($3.69/30 days + egress; Vercel Hobby free), "Set it up" = `scripts/deploy-wizard.sh`, "Redeploy" (merge to main; or `gh workflow run deploy.yml`), "Change a URL" (Vercel env + redeploy for `NEXT_PUBLIC_*`; `CORS_ORIGINS` in `fly.toml` + merge), `make docker` / `make docker-check`.
- [ ] **Step 3: `backend/env.example`** — the cost-guard comment's proxy advice corrected to match; a `CLIENT_IP_HEADER` block (unset off; `Fly-Client-IP` on Fly, set in `fly.toml`; never needs uvicorn `--proxy-headers`).
- [ ] **Step 4: CLAUDE.md** — env-table row `CLIENT_IP_HEADER` | Unset or empty: off, `client.host` is the TCP peer; not a header name warns and stays off; `fly.toml` sets `Fly-Client-IP`. Replace the cost-guard paragraph's "behind a proxy, run uvicorn with `--proxy-headers`…" sentence. Add a "Deploying" trap block: uvicorn `*`; `.dockerignore` allow-list (+ the decoy); `NEXT_PUBLIC_*` needs a Vercel rebuild, `CORS_ORIGINS` a Fly deploy; `--ha=false` / one machine; Vercel pnpm comes from `packageManager` — `ENABLE_EXPERIMENTAL_COREPACK` reads a repo-root `package.json` this repo lacks and breaks the install; `deploymentEnabled` needs `**`; `compress = false`; `deploy.yml` cannot run before merge and skips green without the token. Use `mattpocock-skills:writing-for-agents` conventions: traps only, nothing derivable from the files.
- [ ] **Step 5: Verify and commit** — `cd frontend && mise exec -- pnpm exec prettier --check ../README.md ../CLAUDE.md` is not configured for root files; instead check every relative link resolves (`grep -o '](\S*)' …`) and `git diff --check`.

```bash
git add docs/adr/0005-deploy-on-fly-and-vercel.md README.md CLAUDE.md backend/env.example CONTEXT.md
git commit -m "docs: deployment runbook, ADR-0005, and the client-IP traps"
```

---

### Task 6: The owner's setup wizard

**Files:**
- Create: `scripts/deploy-wizard.sh` (from `mattpocock-skills:wizard`'s `template.sh`; the library above the `STAGES` marker untouched)

**Interfaces:**
- Consumes: `fly.toml` (app name, `CORS_ORIGINS`), `frontend/vercel.json`, the secret name `FLY_API_TOKEN` from `deploy.yml`, the post-deploy checks from the spec's Verification and V1–V5.
- Produces: `ENV_FILE=.env.deploy.local` (gitignored by `.env*.local`) holding only non-secret choices (`FLY_APP`, `VERCEL_ORIGIN`); the `FLY_API_TOKEN` GitHub secret.

Every flyctl flag and dashboard path comes from `docs/superpowers/research/2026-10-13-deployment-platforms.md` (and the wizard research appended to it); mark anything unverified "check the UI" rather than inventing it.

Stages, in dependency order:

1. **Tools** — `flyctl` (`brew install flyctl` if missing), `gh` authenticated as `lawry98`, `curl`, `python3`; run from the repo root on an up-to-date `main`.
2. **Fly account** — `fly auth signup` or `fly auth login`; open the billing page and add a card (trial machines stop after 5 minutes).
3. **Fly app** — ask `FLY_APP` (default from `fly.toml`); `fly apps create "$FLY_APP"`; on a clash ask again; if it differs from `fly.toml`, rewrite the `app =` line.
4. **Fly secrets** — the three keys from a `backend/.env` the owner points at (default the main checkout's), piped as `NAME=VALUE` lines into `fly secrets import --stage -a "$FLY_APP"` — never echoed, never written elsewhere; then `fly secrets list` shows the three names.
5. **First deploy** — `confirm`, then `fly deploy --ha=false`; checks: `/api/health` 200, `/docs` and `/openapi.json` 404, `fly machines list --json` shows exactly one machine at 512 MB, forged `Fly-Client-IP: 203.0.113.7` + `X-Forwarded-For: 203.0.113.7` on `/api/health?probe=<random>` → that access line in `fly logs --no-tail` does not contain `203.0.113.7` (V4).
6. **Vercel** — open vercel.com/new; import `lawry98/f1-application` (GitHub App access to this one repo); Root Directory `frontend`; project name `f1-race-briefing`; Production env vars `NEXT_PUBLIC_API_URL=https://$FLY_APP.fly.dev`, `NEXT_PUBLIC_SITE_URL=<guess>`; deploy; check "Automatically expose System Environment Variables" is on; ask for the real production domain → `VERCEL_ORIGIN`; if it differs, update `NEXT_PUBLIC_SITE_URL` and redeploy without build cache; V1 (build log pnpm line); optional AI-training opt-out.
7. **CORS** — if `VERCEL_ORIGIN` differs from `fly.toml`, rewrite `CORS_ORIGINS`; `confirm` → `fly deploy --ha=false`; preflight with `Origin: $VERCEL_ORIGIN` echoes it, with `Origin: https://example.com` does not.
8. **Frontend checks** — every `<loc>` in `$VERCEL_ORIGIN/sitemap.xml` answers 200; `og:image` on `/` is absolute on `$VERCEL_ORIGIN`; `robots.txt`'s `Sitemap:` is too; `/candy` is 404; open the site and check the console by hand.
9. **Commit the names** — if `fly.toml` differs from `origin/main`, show the diff and the commands to open a PR, and stop before stage 10 until it is merged: a CI deploy from a stale `fly.toml` would ship the wrong `CORS_ORIGINS`.
10. **Deploy token** — `confirm`, then `fly tokens create deploy -a "$FLY_APP" -x 8760h | gh secret set FLY_API_TOKEN -R lawry98/f1-application` — the token is never shown; `gh secret list` shows the name.
11. **One real briefing** (optional, `confirm` — 2 Gemini calls) — `curl -N` the stream with `Accept-Encoding: gzip, br, zstd`, timestamping each line: no `content-encoding` (V3), events spread over the run; then `fly ssh console -C "cat /sys/fs/cgroup/memory.peak"` (V5); V2 reminder (no Preview deployment on the next `lc/` push).

- [ ] **Step 1:** write the script; `TOTAL_STAGES=11`.
- [ ] **Step 2:** `bash -n scripts/deploy-wizard.sh`; `shellcheck` if available; `chmod +x`.
- [ ] **Step 3:** trace statically: every `set_secret` name matches a `secrets.*` reference (`FLY_API_TOKEN` only); no secret is passed via argv or printed; every value lands where the stage list says. Do **not** run it — it opens browsers and creates accounts.
- [ ] **Step 4:** link it from README → Deployment; commit.

```bash
git add scripts/deploy-wizard.sh README.md
git commit -m "feat(scripts): an owner-run wizard for the first deploy and its checks"
```

---

## After the tasks

1. `superpowers:verification-before-completion`: every `ci.yml` step locally — backend `ruff check`, `ruff format --check`, `pytest`; frontend `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`, `build`; browser `pnpm build && playwright test -c <temp :3125 config>`; container (Task 3 Steps 4–6). Plus `actionlint` on both workflows.
2. `team-review` on the branch; fix what it confirms.
3. `git fetch && git merge origin/main` (siblings: briefing cache ADR-0006 may move `_admit`; this branch only touches its docstring), re-run the suites, push, open the PR against `main`, bind it with the ccd_pr tools.
