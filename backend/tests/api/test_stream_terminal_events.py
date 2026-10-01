"""Every briefing stream ends with exactly one terminal event — the reader is always told.

A run is finished for the frontend when it receives ``briefing`` (authoritative; ``complete``
follows it) or ``error``. A stream that ends with neither is shown as *interrupted*, a dropped
connection — so a server path that ends quietly would tell the reader their network failed when
the server did. Each path through ``event_generator`` is pinned here, including the ones that
already worked, so the guarantee is stated once rather than inferred from scattered tests.

The one exception is a client hang-up: nobody is left to send an event to.
"""

import asyncio
import json
from typing import Any

import pytest

from api import routes as routes_module
from api.errors import GENERIC_BRIEFING_ERROR
from api.models import BriefingRequest
from tests.api.test_briefing_cost_guard import ParkedAgent, ProseThenParkedAgent, fake_request
from tests.api.test_routes import FakeAgent, parse_sse, successful_deltas, successful_steps
from tests.factories import make_race_info

TERMINAL = {"briefing", "error"}


def assert_one_terminal_event(events: list[tuple[str, Any]]) -> None:
    names = [name for name, _ in events]
    assert sum(name in TERMINAL for name in names) == 1, names
    if names[-1] == "complete":
        assert names[-2] == "briefing", names
        assert names.count("complete") == 1, names
    else:
        assert names[-1] == "error", names


def generic_error() -> tuple[str, dict[str, str]]:
    return ("error", {"message": GENERIC_BRIEFING_ERROR})


@pytest.fixture
def run_stream(client, monkeypatch):
    """Serve one briefing through the real route with ``agent`` in place of the graph."""

    def _run(agent: Any) -> list[tuple[str, Any]]:
        monkeypatch.setattr(routes_module, "agent", agent)
        return parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)

    return _run


@pytest.fixture
def deadline(monkeypatch):
    """Zero means already passed: the backstop fires on the run's first wait."""

    def _set(seconds: float, grace: float) -> None:
        monkeypatch.setattr(routes_module, "BRIEFING_DEADLINE_SECONDS", seconds)
        monkeypatch.setattr(routes_module, "DEADLINE_GRACE_SECONDS", grace)

    return _set


def synthesis_of(briefing: str | None) -> list[dict[str, Any]]:
    """A run whose synthesizer returned ``briefing`` — every node ran, nothing raised."""
    return [
        *successful_steps()[:3],
        {"synthesizer": {"briefing": briefing, "current_step": "complete"}},
    ]


# ── The paths that end in a briefing ─────────────────────────────────────────


def test_a_clean_run_ends_with_its_briefing_then_complete(run_stream):
    events = run_stream(FakeAgent(steps=successful_steps(), deltas=successful_deltas()))

    assert_one_terminal_event(events)
    assert events[-2][1]["truncated"] is False


def test_a_truncated_run_ends_with_its_briefing_then_complete(run_stream):
    steps = successful_steps()
    steps[-1]["synthesizer"] = {
        "briefing": "## Mon",
        "briefing_truncated": True,
        "current_step": "complete",
    }

    events = run_stream(FakeAgent(steps=steps, deltas=["## Mon"]))

    assert_one_terminal_event(events)
    assert events[-2][1] == {"content": "## Mon", "truncated": True}


def test_a_backstop_with_prose_ends_with_the_truncated_briefing(run_stream, deadline):
    deadline(0, grace=0)

    events = run_stream(ProseThenParkedAgent(["## Mon", "aco"]))

    assert_one_terminal_event(events)
    assert events[-2][1] == {"content": "## Monaco", "truncated": True}


def test_a_failure_after_the_briefing_sends_no_second_terminal_event(run_stream):
    """Once ``complete`` is out the run is over for the reader; an error after it would put a
    red banner above a briefing that arrived whole."""
    events = run_stream(
        FakeAgent(
            steps=successful_steps(),
            deltas=successful_deltas(),
            raises=RuntimeError("graph teardown failed"),
            raises_after=4,
        )
    )

    assert_one_terminal_event(events)
    assert events[-1] == ("complete", {"message": "Briefing complete"})


# ── The paths that end in an error ───────────────────────────────────────────


@pytest.mark.parametrize("briefing", [None, ""], ids=["none", "empty-string"])
def test_a_synthesis_that_produced_no_prose_ends_with_the_generic_error(run_stream, briefing):
    """The synthesizer returns rather than raises when Gemini streams only empty chunks, and the
    transport's ``if briefing:`` guard then drops the briefing — so the error has to come from
    the transport, or the stream ends on ``status: synthesizing`` with nothing after it."""
    events = run_stream(FakeAgent(steps=synthesis_of(briefing)))

    assert_one_terminal_event(events)
    assert events[-1] == generic_error()
    assert events[-2] == ("status", {"step": "synthesizing", "message": "Generating briefing..."})


def test_a_graph_that_ends_before_the_synthesizer_ends_with_the_generic_error(run_stream):
    events = run_stream(FakeAgent(steps=successful_steps()[:2]))

    assert_one_terminal_event(events)
    assert events[-1] == generic_error()


def test_an_empty_synthesis_past_the_deadline_is_reported_as_the_deadline(run_stream, deadline):
    deadline(0, grace=60)

    events = run_stream(FakeAgent(steps=synthesis_of(None)))

    assert_one_terminal_event(events)
    assert events[-1] == (
        "error",
        {"message": routes_module.BRIEFING_DEADLINE_ERROR, "code": "deadline"},
    )


def test_an_unresolved_race_ends_with_the_resolvers_error(run_stream):
    events = run_stream(
        FakeAgent(
            steps=[
                {
                    "resolver": {
                        "race_info": None,
                        "current_step": "error",
                        "briefing": "No race found matching 'monakko'",
                    }
                }
            ]
        )
    )

    assert_one_terminal_event(events)
    assert events[-1] == ("error", {"message": "No race found matching 'monakko'"})


def test_a_graph_exception_ends_with_the_generic_error(run_stream):
    events = run_stream(FakeAgent(steps=successful_steps()[:1], raises=RuntimeError("boom")))

    assert_one_terminal_event(events)
    assert events[-1] == generic_error()


def test_a_backstop_with_no_prose_ends_with_the_deadline_error(run_stream, deadline):
    deadline(0, grace=0)

    events = run_stream(ParkedAgent(successful_steps()[:1]))

    assert_one_terminal_event(events)
    assert events[-1][1]["code"] == "deadline"


def test_a_failure_past_the_deadline_ends_with_the_deadline_error(run_stream, deadline):
    from agent.budget import BriefingStoppedError

    deadline(0, grace=60)

    events = run_stream(FakeAgent(raises=BriefingStoppedError("stopped (deadline)")))

    assert_one_terminal_event(events)
    assert events[-1][1]["code"] == "deadline"


# ── Cancellation ─────────────────────────────────────────────────────────────


class CancelledInsideAgent:
    """A graph that raises ``CancelledError`` of its own accord — a future cancelled inside it —
    while nobody has cancelled the request's task."""

    async def astream(self, state: dict[str, Any], config: Any = None, stream_mode: Any = None):
        yield ("updates", {"resolver": {"race_info": make_race_info(), "current_step": "planning"}})
        raise asyncio.CancelledError


async def drain(agent: Any, monkeypatch) -> list[tuple[str, Any]]:
    """Every event the generator yields, read straight off it.

    Read directly rather than through ``client``, so a ``CancelledError`` the generator lets
    escape reaches this test as itself instead of whatever the ASGI stack turns it into.
    """
    monkeypatch.setattr(routes_module, "agent", agent)
    response = await routes_module.generate_briefing_stream(
        BriefingRequest(query="monaco"), fake_request()
    )
    items = [item async for item in response.body_iterator]
    return [(item["event"], json.loads(item["data"])) for item in items]


def test_a_cancellation_raised_inside_the_graph_ends_with_the_generic_error(monkeypatch):
    events = asyncio.run(drain(CancelledInsideAgent(), monkeypatch))

    assert_one_terminal_event(events)
    assert events[-1] == generic_error()


def test_a_hang_up_while_the_graph_runs_sends_nothing_and_stays_cancelled(monkeypatch):
    """The other side of the test above: when the request's own task is cancelled — which is how
    sse-starlette reacts to a disconnect — the generator must not swallow it to send an event
    nobody will read."""
    monkeypatch.setattr(routes_module, "agent", ParkedAgent(successful_steps()[:1]))

    async def drive() -> list[Any]:
        response = await routes_module.generate_briefing_stream(
            BriefingRequest(query="monaco"), fake_request()
        )
        events = response.body_iterator
        seen = [await anext(events) for _ in range(3)]  # status, race_info, status
        pending = asyncio.ensure_future(anext(events))
        for _ in range(5):
            await asyncio.sleep(0)  # let it park on the graph
        pending.cancel()
        outcome = (await asyncio.gather(pending, return_exceptions=True))[0]
        await events.aclose()
        return [*seen, outcome]

    *seen, outcome = asyncio.run(drive())

    assert [item["event"] for item in seen] == ["status", "race_info", "status"]
    assert isinstance(outcome, asyncio.CancelledError)
