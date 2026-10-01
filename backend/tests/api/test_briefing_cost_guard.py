"""The cost guard as the briefing routes apply it: admission, slot release, CORS.

``test_guard.py`` covers the guard's arithmetic on its own. What is pinned here is where the
routes put it — before the event stream opens, so a rejection is an ordinary HTTP response —
and that a held slot comes back however a response ends. The disconnect cases drive the ASGI
app directly, because TestClient always reads a response to the end and so cannot hang up.
"""

import asyncio
import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from api import routes as routes_module
from api.cors import add_cors
from api.guard import AdmissionGuard
from api.models import BriefingRequest
from tests.api.test_routes import FakeAgent, parse_sse, successful_deltas, successful_steps
from tests.factories import FakeClock, make_race_info

T0 = 1_790_762_400.0  # 2026-09-30 10:00:00 UTC


class ParkedAgent:
    """Yields ``steps`` and then waits forever, recording whether its stream was closed."""

    def __init__(self, steps: list[dict[str, Any]]) -> None:
        self.steps = steps
        self.closed = False
        self.configs: list[Any] = []

    async def astream(self, state: dict[str, Any], config: Any = None, stream_mode: Any = None):
        self.configs.append(config)
        try:
            for step in self.steps:
                yield ("updates", step)
            await asyncio.Event().wait()
        finally:
            self.closed = True


@pytest.fixture
def install_guard(monkeypatch):
    """Replace the conftest's default guard with one at chosen limits, on a hand-driven clock."""

    def _install(**limits: Any) -> AdmissionGuard:
        settings = {
            "per_ip_per_hour": 5,
            "daily_cap": 100,
            "max_concurrent": 2,
            "lease_seconds": 150,
        }
        settings.update(limits)
        guard = AdmissionGuard(clock=FakeClock(T0), **settings)
        monkeypatch.setattr(routes_module, "briefing_guard", guard)
        return guard

    return _install


@pytest.fixture
def install_agent(monkeypatch):
    def _install(agent: Any = None, **kwargs: Any) -> Any:
        agent = agent if agent is not None else FakeAgent(**kwargs)
        monkeypatch.setattr(routes_module, "agent", agent)
        return agent

    return _install


def stream(client: TestClient, query: str = "monaco", **kwargs: Any):
    return client.post("/api/briefing/stream", json={"query": query}, **kwargs)


# ── Admission ────────────────────────────────────────────────────────────────


def test_the_request_over_the_hourly_limit_is_a_429_with_retry_after(
    client, install_guard, install_agent
):
    install_guard(per_ip_per_hour=2)
    install_agent(steps=successful_steps())
    assert [stream(client).status_code for _ in range(2)] == [200, 200]

    response = stream(client)

    assert response.status_code == 429
    assert response.json() == {"code": "rate_limited", "retry_after_seconds": 3600, "limit": 2}
    assert response.headers["retry-after"] == "3600"


def test_a_rejection_is_plain_json_rather_than_an_event_stream(
    client, install_guard, install_agent
):
    """Checked before the SSE response starts, so the status code can still say no."""
    install_guard(per_ip_per_hour=1)
    install_agent(steps=successful_steps())
    stream(client)

    response = stream(client)

    assert response.headers["content-type"] == "application/json"
    assert parse_sse(response.text) == []


def test_a_full_house_is_a_503_busy(client, install_guard, install_agent):
    guard = install_guard(max_concurrent=1)
    guard.admit("198.51.100.2")  # someone else's briefing, still running
    agent = install_agent(steps=successful_steps())

    response = stream(client)

    assert response.status_code == 503
    assert response.json() == {"code": "busy", "retry_after_seconds": 10, "limit": 1}
    assert response.headers["retry-after"] == "10"
    assert agent.states == []


def test_a_spent_day_is_a_503_daily_cap_until_midnight_utc(client, install_guard, install_agent):
    install_guard(daily_cap=1)
    install_agent(steps=successful_steps())
    stream(client)  # the day's one briefing

    response = stream(client)

    assert response.status_code == 503
    assert response.json() == {"code": "daily_cap", "retry_after_seconds": 14 * 3600, "limit": 1}
    assert response.headers["retry-after"] == str(14 * 3600)


def test_a_rejected_request_never_reaches_the_agent(client, install_guard, install_agent):
    install_guard(per_ip_per_hour=1)
    agent = install_agent(steps=successful_steps())
    stream(client)

    stream(client)
    stream(client)

    assert len(agent.states) == 1


def test_forwarded_for_does_not_buy_a_fresh_limit(client, install_guard, install_agent):
    """The limit keys on the TCP peer. X-Forwarded-For is whatever the caller typed; behind a
    real proxy, uvicorn's --proxy-headers rewrites client.host from it, for that proxy only."""
    install_guard(per_ip_per_hour=1)
    install_agent(steps=successful_steps())
    stream(client, headers={"X-Forwarded-For": "192.0.2.1"})

    response = stream(client, headers={"X-Forwarded-For": "192.0.2.99"})

    assert response.status_code == 429


def test_an_invalid_body_is_turned_away_before_it_can_count(client, install_guard, install_agent):
    install_guard(per_ip_per_hour=1)
    install_agent(steps=successful_steps())

    for _ in range(3):
        assert client.post("/api/briefing/stream", json={}).status_code == 422

    assert stream(client).status_code == 200


def test_the_sync_briefing_route_is_guarded_too(client, install_guard, install_agent):
    install_guard(per_ip_per_hour=1)
    install_agent(
        result={"race_info": make_race_info(), "briefing": "x", "current_step": "complete"}
    )
    assert client.post("/api/briefing", json={"query": "monaco"}).status_code == 200

    response = client.post("/api/briefing", json={"query": "monaco"})

    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    assert response.headers["retry-after"] == "3600"


def test_both_routes_draw_on_one_budget(client, install_guard, install_agent):
    install_guard(per_ip_per_hour=1)
    install_agent(
        steps=successful_steps(),
        result={"race_info": make_race_info(), "briefing": "x", "current_step": "complete"},
    )
    stream(client)

    assert client.post("/api/briefing", json={"query": "monaco"}).status_code == 429


def test_a_rejection_is_readable_cross_origin(install_guard, install_agent):
    """Without CORS headers on the 429 the browser hides the whole response — status, body
    and Retry-After — and the page can only say "something went wrong"."""
    app = FastAPI()
    add_cors(app)
    app.include_router(routes_module.router)
    client = TestClient(app)
    install_guard(per_ip_per_hour=1)
    install_agent(steps=successful_steps())
    origin = {"Origin": "http://localhost:3000"}
    stream(client, headers=origin)

    response = stream(client, headers=origin)

    assert response.status_code == 429
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "retry-after" in response.headers["access-control-expose-headers"].lower()


# ── The slot comes back, however the response ends ──────────────────────────


def test_a_completed_stream_gives_its_slot_back(client, briefing_guard, install_agent):
    install_agent(steps=successful_steps(), deltas=successful_deltas())

    events = parse_sse(stream(client).text)

    assert events[-1][0] == "complete"
    assert briefing_guard.in_use == 0


def test_a_graph_exception_gives_its_slot_back(client, briefing_guard, install_agent):
    install_agent(raises=RuntimeError("graph exploded"))

    events = parse_sse(stream(client).text)

    assert events[-1][0] == "error"
    assert briefing_guard.in_use == 0


def test_an_unresolved_race_gives_its_slot_back(client, briefing_guard, install_agent):
    install_agent(
        steps=[{"resolver": {"race_info": None, "current_step": "error", "briefing": "No race"}}]
    )

    stream(client, "not-a-real-gp")

    assert briefing_guard.in_use == 0


@pytest.mark.parametrize(
    "agent_kwargs",
    [
        {"result": {"race_info": make_race_info(), "briefing": "x", "current_step": "complete"}},
        {"raises": RuntimeError("graph exploded")},
        {"result": {"current_step": "error", "briefing": "No race"}},
    ],
    ids=["complete", "exception", "unresolved"],
)
def test_the_sync_route_gives_its_slot_back(client, briefing_guard, install_agent, agent_kwargs):
    install_agent(**agent_kwargs)

    client.post("/api/briefing", json={"query": "monaco"})

    assert briefing_guard.in_use == 0


def test_the_slot_is_held_while_the_stream_runs(monkeypatch, briefing_guard):
    agent = ParkedAgent(successful_steps()[:1])
    monkeypatch.setattr(routes_module, "agent", agent)

    async def drive() -> tuple[int, int]:
        response = await routes_module.generate_briefing_stream(
            BriefingRequest(query="monaco"), fake_request()
        )
        events = response.body_iterator
        await asyncio.wait_for(anext(events), timeout=5)
        await asyncio.wait_for(anext(events), timeout=5)
        during = briefing_guard.in_use
        await events.aclose()
        return during, briefing_guard.in_use

    assert asyncio.run(drive()) == (1, 0)


def fake_request(host: str = "203.0.113.7") -> Request:
    return Request({"type": "http", "method": "POST", "headers": [], "client": (host, 50000)})


async def serve_and_hang_up(
    app: FastAPI, *, after_bodies: int, probe: Callable[[], Any] = lambda: None
) -> tuple[list[dict[str, Any]], Any]:
    """Run one POST through the real ASGI stack and disconnect after ``after_bodies`` chunks.

    ``send`` yields to the loop the way a real socket write can, which is what lets the
    disconnect land *while the response is mid-send*: with ``after_bodies=0`` before the event
    generator has even started, otherwise with it parked at a ``yield``. Those are the two cases
    a generator's own ``finally`` cannot cover. A ``send`` that never yields lets the generator
    run on to the agent and be cancelled at an ``await`` instead, where its ``finally`` does run,
    and a test written that way passes without the teardown it is meant to prove.

    ``probe`` is read the moment the app returns, still inside the loop — ``asyncio.run`` closes
    every leftover async generator on its way out, which would run the teardown late and pass
    the test anyway. ``wait_for`` bounds a regression that would otherwise hang the suite.
    """
    disconnected = asyncio.Event()
    if after_bodies == 0:
        disconnected.set()
    sent: list[dict[str, Any]] = []
    request_read = False

    async def receive() -> dict[str, Any]:
        nonlocal request_read
        if not request_read:
            request_read = True
            body = json.dumps({"query": "monaco"}).encode()
            return {"type": "http.request", "body": body, "more_body": False}
        await disconnected.wait()
        return {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)
        bodies = [m for m in sent if m["type"] == "http.response.body" and m.get("body")]
        if len(bodies) >= after_bodies:
            disconnected.set()
        await asyncio.sleep(0)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/briefing/stream",
        "raw_path": b"/api/briefing/stream",
        "root_path": "",
        "query_string": b"",
        "headers": [(b"content-type", b"application/json"), (b"host", b"testserver")],
        "client": ("203.0.113.7", 50000),
        "server": ("testserver", 80),
    }
    await asyncio.wait_for(app(scope, receive, send), timeout=5)
    return sent, probe()


def sent_text(sent: list[dict[str, Any]]) -> bytes:
    return b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(routes_module.router)
    return app


def test_hanging_up_before_the_first_event_gives_the_slot_back(app, monkeypatch, briefing_guard):
    monkeypatch.setattr(routes_module, "agent", ParkedAgent([]))

    sent, in_use = asyncio.run(
        serve_and_hang_up(app, after_bodies=0, probe=lambda: briefing_guard.in_use)
    )

    assert sent_text(sent) == b""  # the generator never ran, so its own finally cannot help
    assert in_use == 0


def test_hanging_up_mid_stream_gives_the_slot_back_and_tears_the_run_down(
    app, monkeypatch, briefing_guard
):
    from tools import schedule_cache

    monkeypatch.setattr(routes_module, "agent", ParkedAgent(successful_steps()[:1]))
    schedule_cache.prefill({2025: "sentinel"})

    sent, (in_use, cache) = asyncio.run(
        serve_and_hang_up(
            app,
            after_bodies=2,
            probe=lambda: (briefing_guard.in_use, dict(schedule_cache._cache)),
        )
    )

    assert b"race_info" in sent_text(sent)  # it really was mid-stream
    assert in_use == 0
    assert cache == {}  # the generator's finally ran, not just the slot release
