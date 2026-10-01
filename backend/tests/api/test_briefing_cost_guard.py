"""The cost guard as the briefing stream applies it: admission, slot release, CORS.

``test_guard.py`` covers the guard's arithmetic on its own. What is pinned here is where the
route puts it — before the event stream opens, so a rejection is an ordinary HTTP response —
and that a held slot comes back however a response ends. The disconnect cases drive the ASGI
app directly, because TestClient always reads a response to the end and so cannot hang up.
"""

import asyncio
import json
import logging
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
from tests.factories import FakeClock

T0 = 1_790_762_400.0  # 2026-09-30 10:00:00 UTC


async def park() -> None:
    """Wait like a graph that never returns. Every passing test cancels this at once; the bound
    is there so a regression that stops abandoning it fails instead of hanging the suite."""
    await asyncio.wait_for(asyncio.Event().wait(), timeout=10)


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
            await park()
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


# ── Deadline and cancellation ────────────────────────────────────────────────


class ProseThenParkedAgent:
    """Resolves, writes some prose, then never returns — a synthesizer stuck on the network."""

    def __init__(self, deltas: list[str]) -> None:
        self.deltas = deltas
        self.configs: list[Any] = []

    async def astream(self, state: dict[str, Any], config: Any = None, stream_mode: Any = None):
        self.configs.append(config)
        yield ("updates", successful_steps()[0])
        for delta in self.deltas:
            yield ("custom", {"kind": "briefing_delta", "content": delta})
        await park()


@pytest.fixture
def deadline(monkeypatch):
    """Shrink the deadline and the backstop's grace. Zero means "already passed": the
    backstop then fires on the run's first wait, with no sleeping involved."""

    def _set(seconds: float, grace: float) -> None:
        monkeypatch.setattr(routes_module, "BRIEFING_DEADLINE_SECONDS", seconds)
        monkeypatch.setattr(routes_module, "DEADLINE_GRACE_SECONDS", grace)

    return _set


def budget_of(agent: Any):
    return agent.configs[0]["configurable"]["budget"]


def test_the_run_gets_a_budget_ending_at_the_deadline(client, install_agent, monkeypatch):
    import time

    agent = ParkedAgentThatFinishes()
    install_agent(agent)
    before = time.monotonic()

    stream(client)

    budget = budget_of(agent)
    assert before + 90 <= budget.deadline <= time.monotonic() + 90


class ParkedAgentThatFinishes:
    """Records its config and completes a normal run."""

    def __init__(self) -> None:
        self.configs: list[Any] = []
        self.inner = FakeAgent(steps=successful_steps(), deltas=successful_deltas())

    async def astream(self, state: dict[str, Any], config: Any = None, stream_mode: Any = None):
        self.configs.append(config)
        async for item in self.inner.astream(state, stream_mode=stream_mode):
            yield item


def test_the_budget_is_cancelled_once_the_response_is_over(client, install_agent):
    """Whatever is still running in a worker thread stops at its next check."""
    agent = install_agent(ParkedAgentThatFinishes())

    stream(client)

    assert budget_of(agent).cancel.is_set()


def test_the_deadline_timer_cancels_a_run_that_is_still_going(monkeypatch, deadline):
    deadline(0, grace=60)
    agent = ParkedAgent([])
    monkeypatch.setattr(routes_module, "agent", agent)

    async def drive() -> bool:
        response = await routes_module.generate_briefing_stream(
            BriefingRequest(query="monaco"), fake_request()
        )
        events = response.body_iterator
        await anext(events)  # status
        pending = asyncio.ensure_future(anext(events))
        for _ in range(5):
            await asyncio.sleep(0)  # let the zero-second timer fire
        cancelled = budget_of(agent).cancel.is_set()
        pending.cancel()
        await asyncio.gather(pending, return_exceptions=True)
        await events.aclose()
        return cancelled

    assert asyncio.run(drive()) is True


def test_a_run_past_its_backstop_ends_with_a_deadline_error(
    client, install_agent, deadline, briefing_guard
):
    deadline(0, grace=0)
    install_agent(ParkedAgent([]))

    events = parse_sse(stream(client).text)

    assert [name for name, _ in events] == ["status", "error"]
    assert events[-1][1]["code"] == "deadline"
    assert events[-1][1]["message"] == routes_module.BRIEFING_DEADLINE_ERROR
    assert briefing_guard.in_use == 0


def test_a_backstop_with_prose_already_sent_serves_it_as_a_truncated_briefing(
    client, install_agent, deadline
):
    """ADR-0002 holds at the transport too: prose in hand is a truncated briefing, never an
    error after the reader has already started reading."""
    deadline(0, grace=0)
    install_agent(ProseThenParkedAgent(["## Mon", "aco"]))

    events = parse_sse(stream(client).text)

    names = [name for name, _ in events]
    assert "error" not in names
    assert names[-2:] == ["briefing", "complete"]
    assert events[-2][1] == {"content": "## Monaco", "truncated": True}


def test_a_failure_after_the_deadline_is_reported_as_the_deadline(client, install_agent, deadline):
    """The synthesizer raises when it is stopped with no prose; past the deadline that is a
    deadline, not "something went wrong"."""
    from agent.budget import BriefingStoppedError

    deadline(0, grace=60)
    install_agent(raises=BriefingStoppedError("stopped before synthesis (deadline)"))

    events = parse_sse(stream(client).text)

    assert events[-1] == (
        "error",
        {"message": routes_module.BRIEFING_DEADLINE_ERROR, "code": "deadline"},
    )


def test_a_failure_inside_the_deadline_stays_generic(client, install_agent):
    from api.errors import GENERIC_BRIEFING_ERROR

    install_agent(raises=RuntimeError("graph exploded"))

    events = parse_sse(stream(client).text)

    assert events[-1] == ("error", {"message": GENERIC_BRIEFING_ERROR})


def test_hanging_up_cancels_the_run(app, monkeypatch):
    agent = ParkedAgent(successful_steps()[:1])
    monkeypatch.setattr(routes_module, "agent", agent)

    _, cancelled = asyncio.run(
        serve_and_hang_up(app, after_bodies=2, probe=lambda: budget_of(agent).cancel.is_set())
    )

    assert cancelled


# ── One log line per admitted request ────────────────────────────────────────


def finished_lines(caplog) -> list[str]:
    return [
        r.getMessage() for r in caplog.records if r.getMessage().startswith("Briefing finished")
    ]


@pytest.mark.parametrize(
    ("agent_kwargs", "outcome"),
    [
        ({"steps": successful_steps(), "deltas": successful_deltas()}, "complete"),
        (
            {
                "steps": [
                    successful_steps()[0],
                    {
                        "synthesizer": {
                            "briefing": "## Mon",
                            "briefing_truncated": True,
                            "current_step": "complete",
                        }
                    },
                ]
            },
            "truncated",
        ),
        ({"raises": RuntimeError("graph exploded")}, "error"),
        (
            {
                "steps": [
                    {"resolver": {"race_info": None, "current_step": "error", "briefing": "x"}}
                ]
            },
            "unresolved",
        ),
    ],
    ids=["complete", "truncated", "error", "unresolved"],
)
def test_each_admitted_stream_logs_one_line_with_ip_outcome_and_duration(
    client, install_agent, caplog, agent_kwargs, outcome
):
    install_agent(**agent_kwargs)

    with caplog.at_level(logging.INFO, logger="api.routes"):
        stream(client)

    lines = finished_lines(caplog)
    assert len(lines) == 1
    assert "ip=testclient" in lines[0]
    assert f"outcome={outcome} " in lines[0]
    assert "duration=" in lines[0]


def test_a_deadline_is_logged_as_the_outcome(client, install_agent, deadline, caplog):
    deadline(0, grace=0)
    install_agent(ParkedAgent([]))

    with caplog.at_level(logging.INFO, logger="api.routes"):
        stream(client)

    assert "outcome=deadline " in finished_lines(caplog)[0]


@pytest.mark.parametrize("after_bodies", [0, 2], ids=["before-first-event", "mid-stream"])
def test_a_hang_up_is_logged_once_as_disconnected(app, monkeypatch, caplog, after_bodies):
    monkeypatch.setattr(routes_module, "agent", ParkedAgent(successful_steps()[:1]))

    with caplog.at_level(logging.INFO, logger="api.routes"):
        asyncio.run(serve_and_hang_up(app, after_bodies=after_bodies))

    lines = finished_lines(caplog)
    assert len(lines) == 1
    assert "ip=203.0.113.7" in lines[0]
    assert "outcome=disconnected " in lines[0]


def test_a_rejection_logs_no_finished_line(client, install_guard, install_agent, caplog):
    install_guard(per_ip_per_hour=1)
    install_agent(steps=successful_steps())
    stream(client)

    with caplog.at_level(logging.INFO, logger="api.routes"):
        stream(client)

    assert finished_lines(caplog) == []


def test_a_timeout_raised_by_the_graph_itself_is_not_mistaken_for_the_backstop(
    client, install_agent
):
    """Only the route's own timer means the deadline. A provider's TimeoutError inside the
    deadline is an ordinary failure, with the ordinary generic copy."""
    from api.errors import GENERIC_BRIEFING_ERROR

    install_agent(raises=TimeoutError("read timed out"))

    events = parse_sse(stream(client).text)

    assert events[-1] == ("error", {"message": GENERIC_BRIEFING_ERROR})
