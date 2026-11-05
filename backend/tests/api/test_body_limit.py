"""The body limit: a request bigger than any valid one is refused before anything reads it.

FastAPI reads and parses the whole body before the route's cost guard runs, so without this a
single large POST is the process's memory, and an OOM restart resets the guard's in-memory
counts. These drive the middleware as raw ASGI, because what matters is which messages it reads
and which it never asks for, and TestClient hides both.
"""

import asyncio
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api import routes as routes_module
from api.app import create_app
from api.body_limit import MAX_BODY_BYTES, BodyLimitMiddleware
from api.models import BriefingRequest
from tests.api.test_briefing_cost_guard import ParkedAgent, sent_text, serve_and_hang_up
from tests.api.test_routes import FakeAgent, successful_steps

LIMIT = 10

REFUSAL = {"code": "body_too_large", "max_bytes": LIMIT}


def http_scope(headers: list[tuple[bytes, bytes]] = ()) -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/briefing/stream",
        "raw_path": b"/api/briefing/stream",
        "root_path": "",
        "query_string": b"",
        "headers": list(headers),
        "client": ("203.0.113.7", 50000),
        "server": ("testserver", 80),
    }


def largest_valid_briefing_request() -> bytes:
    """The model's longest query, in the character that encodes longest: an astral-plane one,
    which ``json.dumps`` (``ensure_ascii`` by default, as most clients send) writes as a
    12-byte surrogate pair."""
    longest = BriefingRequest.model_json_schema()["properties"]["query"]["maxLength"]
    return json.dumps({"query": "\U0001f3ce" * longest}).encode()


class Downstream:
    """The wrapped app: reads ``reads`` messages, keeps them, and answers 200."""

    def __init__(self, reads: int = 1) -> None:
        self.reads = reads
        self.calls: list[list[dict[str, Any]]] = []

    async def __call__(self, scope, receive, send) -> None:
        self.calls.append([await receive() for _ in range(self.reads)])
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})


class Untouchable:
    """A ``receive`` the middleware must never await."""

    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self) -> dict[str, Any]:
        self.calls += 1
        raise AssertionError("receive was awaited")


class Endless:
    """A chunked upload that never ends: ``chunk`` after ``chunk``, always ``more_body``."""

    def __init__(self, chunk: bytes) -> None:
        self.chunk = chunk
        self.calls = 0

    async def __call__(self) -> dict[str, Any]:
        self.calls += 1
        return {"type": "http.request", "body": self.chunk, "more_body": True}


class Upload:
    """A client that sends ``chunks`` and then, like a real one, eventually hangs up."""

    def __init__(self, *chunks: bytes) -> None:
        self.messages = [
            {"type": "http.request", "body": chunk, "more_body": i < len(chunks) - 1}
            for i, chunk in enumerate(chunks)
        ]
        self.calls = 0

    async def __call__(self) -> dict[str, Any]:
        self.calls += 1
        if self.messages:
            return self.messages.pop(0)
        return {"type": "http.disconnect"}


def serve(
    downstream: Downstream, receive, headers: list[tuple[bytes, bytes]] = ()
) -> tuple[int, dict[bytes, bytes], bytes]:
    sent: list[dict[str, Any]] = []

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    middleware = BodyLimitMiddleware(downstream, max_bytes=LIMIT)
    asyncio.run(asyncio.wait_for(middleware(http_scope(headers), receive, send), timeout=5))
    start = sent[0]
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    return start["status"], dict(start["headers"]), body


# ── Refused ──────────────────────────────────────────────────────────────────


def test_a_declared_length_over_the_limit_is_refused_unread():
    downstream, receive = Downstream(), Untouchable()

    status, headers, body = serve(downstream, receive, [(b"content-length", b"11")])

    assert status == 413
    assert headers[b"content-type"] == b"application/json"
    assert json.loads(body) == REFUSAL
    assert downstream.calls == []
    assert receive.calls == 0


def test_an_undeclared_body_is_refused_at_the_chunk_that_crosses_the_limit():
    """4 + 4 is under 10 and the third chunk crosses it, so the third read is the last."""
    downstream, receive = Downstream(), Endless(b"abcd")

    status, _, body = serve(downstream, receive)

    assert status == 413
    assert json.loads(body) == REFUSAL
    assert receive.calls == 3
    assert downstream.calls == []


@pytest.mark.parametrize(
    ("receive", "headers"),
    [
        (Untouchable(), [(b"content-length", b"11")]),
        (Endless(b"abcd"), []),
    ],
    ids=["declared", "chunked"],
)
def test_a_refusal_closes_the_connection(receive, headers):
    """The rest of the upload is still on its way. Kept alive, uvicorn reads it to the end and
    discards it; ``connection: close`` makes it close the socket once the 413 is sent."""
    _, response_headers, _ = serve(Downstream(), receive, headers)

    assert response_headers[b"connection"] == b"close"


def test_a_length_it_cannot_read_is_not_trusted_and_the_body_is_still_counted():
    """uvicorn rejects such a header itself; this only keeps it from being a 500 here."""
    downstream, receive = Downstream(), Endless(b"abcd")

    status, _, _ = serve(downstream, receive, [(b"content-length", b"lots")])

    assert status == 413
    assert downstream.calls == []


def test_a_client_that_hangs_up_mid_body_never_reaches_the_app():
    """What arrived is a fragment, and there is nobody left to answer."""
    downstream = Downstream()
    receive = Upload(b"0123", b"4567")
    receive.messages.pop()  # the client leaves before its last chunk
    sent = []

    async def send(message):
        sent.append(message)

    asyncio.run(BodyLimitMiddleware(downstream, max_bytes=LIMIT)(http_scope(), receive, send))

    assert downstream.calls == []
    assert sent == []


# ── Let through ──────────────────────────────────────────────────────────────


def test_a_body_at_the_limit_reaches_the_app_byte_for_byte():
    downstream = Downstream()

    status, _, body = serve(downstream, Upload(b"0123", b"4567", b"89"))

    assert (status, body) == (200, b"ok")
    assert downstream.calls == [
        [{"type": "http.request", "body": b"0123456789", "more_body": False}]
    ]


def test_after_the_body_the_app_still_hears_the_client_hang_up():
    """sse-starlette keeps calling ``receive`` once the body is read, waiting for
    ``http.disconnect``; a replay that answered for the client would stream to nobody forever."""
    downstream = Downstream(reads=2)

    serve(downstream, Upload(b"hi"))

    assert downstream.calls == [
        [
            {"type": "http.request", "body": b"hi", "more_body": False},
            {"type": "http.disconnect"},
        ]
    ]


@pytest.mark.parametrize(
    "scope",
    [
        {"type": "lifespan", "asgi": {"version": "3.0"}},
        {"type": "websocket", "asgi": {"version": "3.0"}, "path": "/ws", "headers": []},
    ],
)
def test_a_non_http_scope_passes_through_untouched(scope):
    """Lifespan has no headers and no body; a websocket's messages are not request chunks."""
    seen = []

    async def app(scope, receive, send):
        seen.append((scope, receive, send))

    receive, send = Untouchable(), Untouchable()

    asyncio.run(BodyLimitMiddleware(app, max_bytes=LIMIT)(scope, receive, send))

    assert seen == [(scope, receive, send)]


# ── The limit ────────────────────────────────────────────────────────────────


def test_the_largest_valid_briefing_request_fits_with_room_to_spare():
    """Tied to the model, so raising ``max_length`` cannot quietly turn valid requests into
    413s. Twice over leaves room for a client that pads its JSON or adds a field."""
    body = largest_valid_briefing_request()

    BriefingRequest.model_validate_json(body)  # raises unless it really is valid
    assert 2 * len(body) <= MAX_BODY_BYTES


# ── Wired through create_app, as production runs it ─────────────────────────

ORIGIN = "http://localhost:3000"


def test_the_largest_valid_briefing_request_is_served(monkeypatch):
    """The limit create_app passes, not just the constant: a smaller one there fails only this."""
    monkeypatch.setattr(routes_module, "agent", FakeAgent(steps=successful_steps()))
    client = TestClient(create_app(expose_docs=False))

    response = client.post(
        "/api/briefing/stream",
        content=largest_valid_briefing_request(),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 200


def test_an_oversized_body_is_refused_readably_cross_origin():
    """Mounted with no client-IP header too, and inside CORS: without the CORS headers the
    browser hides the 413 and the page can only say "something went wrong"."""
    client = TestClient(create_app(expose_docs=False))

    response = client.post(
        "/api/briefing/stream",
        content=b"x" * (MAX_BODY_BYTES + 1),
        headers={"content-type": "application/json", "origin": ORIGIN},
    )

    assert response.status_code == 413
    assert response.json()["code"] == "body_too_large"
    assert response.headers["access-control-allow-origin"] == ORIGIN


def test_an_oversized_body_is_logged_as_the_visitor():
    """Refused without reaching the routes, so the client-IP rewrite must already have run:
    uvicorn's access line reads this same scope dict after the response."""
    app = create_app(expose_docs=False, client_ip_header="Fly-Client-IP")
    scope = http_scope(
        [
            (b"content-type", b"application/json"),
            (b"content-length", str(MAX_BODY_BYTES + 1).encode()),
            (b"fly-client-ip", b"198.51.100.9"),
        ]
    )
    sent = []

    async def send(message):
        sent.append(message)

    asyncio.run(app(scope, Untouchable(), send))

    assert sent[0]["status"] == 413
    assert scope["client"] == ("198.51.100.9", 0)


def test_a_hang_up_still_reaches_the_stream_through_the_limit(monkeypatch, briefing_guard):
    """The disconnect cases in test_briefing_cost_guard.py, through the full middleware stack:
    the hang-up arrives on ``receive`` after the body, and only the limit stands in between."""
    monkeypatch.setattr(routes_module, "agent", ParkedAgent(successful_steps()[:1]))

    sent, in_use = asyncio.run(
        serve_and_hang_up(
            create_app(expose_docs=False), after_bodies=2, probe=lambda: briefing_guard.in_use
        )
    )

    assert b"race_info" in sent_text(sent)  # it really was mid-stream
    assert in_use == 0
