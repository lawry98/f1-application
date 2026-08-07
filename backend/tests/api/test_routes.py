"""Tests for the REST and SSE endpoints.

These are the outer net: they run against the router with the agent replaced, so
graph.py's internals can be restructured freely without touching this file. What is
pinned here is the HTTP contract and — for the stream — the *order and type* of SSE
events, which the frontend's discriminated union depends on.
"""

import asyncio
import json
import logging
from typing import Any

import pytest

from api import routes as routes_module
from api.errors import FAILED_TOOL_SUMMARY, GENERIC_BRIEFING_ERROR, GENERIC_SCHEDULE_ERROR
from api.models import BriefingRequest
from tests.factories import make_race_info, make_schedule, make_tool


class FakeAgent:
    """Stand-in for the compiled LangGraph agent.

    ``.astream()`` yields ``(mode, payload)`` tuples, which is what LangGraph produces
    once more than one ``stream_mode`` is requested. Each entry in ``steps`` — still a
    plain ``{node_name: partial_state}`` dict — wraps as ``("updates", step)``. Custom
    writes are derived from that same step data rather than passed in separately, so the
    fake and the fixtures stay in step by construction: each entry in ``deltas`` is
    emitted as ``("custom", …)`` immediately before the synthesizer's update, and each
    ``tool_executor`` step's ``tool_results`` is emitted the same way before its update —
    mirroring reality, where the writer fires while the node runs and the update lands
    when it returns.

    It yields everything without suspending, so it says nothing about *when* events reach
    the client; ``GatedAgent`` below is what pins that.
    """

    def __init__(
        self,
        steps: list[dict[str, Any]] | None = None,
        result: dict[str, Any] | None = None,
        raises: Exception | None = None,
        deltas: list[str] | None = None,
        raises_after: int | None = None,
    ) -> None:
        self.steps = steps or []
        self.result = result or {}
        self.raises = raises
        self.deltas = deltas or []
        self.raises_after = raises_after
        self.states: list[dict[str, Any]] = []
        self.stream_modes: list[Any] = []

    async def ainvoke(self, state: dict[str, Any]) -> dict[str, Any]:
        self.states.append(state)
        if self.raises is not None:
            raise self.raises
        return self.result

    async def astream(self, state: dict[str, Any], stream_mode: Any = None):
        self.states.append(state)
        self.stream_modes.append(stream_mode)
        if self.raises is not None and self.raises_after is None:
            raise self.raises
        for index, step in enumerate(self.steps):
            if "tool_executor" in step:
                for tr in step["tool_executor"].get("tool_results", []):
                    yield (
                        "custom",
                        {
                            "kind": "tool_result",
                            "tool": tr["tool_name"],
                            "success": tr["success"],
                        },
                    )
            if "synthesizer" in step:
                for delta in self.deltas:
                    yield ("custom", {"kind": "briefing_delta", "content": delta})
            yield ("updates", step)
            if self.raises is not None and self.raises_after == index + 1:
                raise self.raises


class GatedAgent:
    """A fake agent that yields its first step and then parks, mid-run, indefinitely.

    Whatever the transport has emitted by then, it emitted while the agent was still
    working — which is the property ``FakeAgent`` cannot express, because it runs to
    completion without ever suspending.
    """

    def __init__(self, steps: list[dict[str, Any]], gate: asyncio.Event) -> None:
        self.steps = steps
        self.gate = gate

    async def astream(self, state: dict[str, Any], stream_mode: Any = None):
        yield ("updates", self.steps[0])
        await self.gate.wait()
        for step in self.steps[1:]:
            yield ("updates", step)


def parse_sse(body: str) -> list[tuple[str, Any]]:
    """Parse an SSE body into ``(event_type, decoded_data)`` pairs, in order.

    Deliberately keyed on the ``event:`` line rather than sniffing the payload shape —
    the same discrimination rule lib/api.ts uses on the frontend.
    """
    events: list[tuple[str, Any]] = []
    pending_type: str | None = None

    for raw_line in body.splitlines():
        line = raw_line.strip()
        if line.startswith("event:"):
            pending_type = line[len("event:") :].strip()
        elif line.startswith("data:") and pending_type is not None:
            events.append((pending_type, json.loads(line[len("data:") :].strip())))
            pending_type = None

    return events


def successful_steps() -> list[dict[str, Any]]:
    """A complete four-node run, as the agent would stream it."""
    return [
        {"resolver": {"race_info": make_race_info(), "current_step": "planning"}},
        {"planner": {"tasks": ["get_track_info", "search_f1_news"], "current_step": "gathering"}},
        {
            "tool_executor": {
                "tool_results": [
                    {"tool_name": "get_track_info", "success": True, "data": {"length_km": 3.3}},
                    {"tool_name": "search_f1_news", "success": False, "data": {"error": "no key"}},
                ],
                "current_step": "synthesizing",
            }
        },
        {
            "synthesizer": {
                "briefing": "## Monaco\n\nTight.",
                "briefing_truncated": False,
                "current_step": "complete",
            }
        },
    ]


def successful_deltas() -> list[str]:
    """The synthesizer's prose, split the way it is written — concatenating them gives
    back exactly the briefing in ``successful_steps()``.
    """
    return ["## Mon", "aco\n\n", "Tight."]


@pytest.fixture
def install_agent(monkeypatch):
    """Install a FakeAgent in place of the compiled graph and return it."""

    def _install(**kwargs: Any) -> FakeAgent:
        agent = FakeAgent(**kwargs)
        monkeypatch.setattr(routes_module, "agent", agent)
        return agent

    return _install


# ── Health ───────────────────────────────────────────────────────────────────


def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "f1-briefing-agent"}


# ── POST /api/briefing ───────────────────────────────────────────────────────


def test_briefing_returns_race_briefing_and_trace(client, install_agent):
    install_agent(
        result={
            "race_info": make_race_info(),
            "briefing": "## Monaco\n\nTight.",
            "current_step": "complete",
            "tool_results": [
                {"tool_name": "get_track_info", "success": True, "data": {"length_km": 3.3}},
                {"tool_name": "search_f1_news", "success": False, "data": {"error": "no key"}},
            ],
        }
    )

    response = client.post("/api/briefing", json={"query": "monaco"})

    assert response.status_code == 200
    body = response.json()
    assert body["race"] == "Monaco Grand Prix"
    assert body["briefing"] == "## Monaco\n\nTight."
    assert [t["tool"] for t in body["tool_trace"]] == ["get_track_info", "search_f1_news"]
    assert [t["success"] for t in body["tool_trace"]] == [True, False]


def test_briefing_reports_an_untruncated_synthesis_as_complete(client, install_agent):
    install_agent(
        result={
            "race_info": make_race_info(),
            "briefing": "## Monaco\n\nTight.",
            "briefing_truncated": False,
            "current_step": "complete",
        }
    )
    assert client.post("/api/briefing", json={"query": "monaco"}).json()["truncated"] is False


def test_briefing_returns_a_truncated_synthesis_rather_than_failing(client, install_agent):
    """The sync endpoint gets truncation for free because the node owns it.

    ``agent.ainvoke()`` propagates, so had truncation lived in the transport this
    endpoint would have had no partial to return at all — it would have 500ed away a
    perfectly readable briefing. See ADR-0002.
    """
    install_agent(
        result={
            "race_info": make_race_info(),
            "briefing": "## Mon",
            "briefing_truncated": True,
            "current_step": "complete",
        }
    )

    response = client.post("/api/briefing", json={"query": "monaco"})

    assert response.status_code == 200
    assert response.json()["briefing"] == "## Mon"
    assert response.json()["truncated"] is True


def test_briefing_passes_the_query_into_the_initial_state(client, install_agent):
    agent = install_agent(
        result={"race_info": make_race_info(), "briefing": "x", "current_step": "complete"}
    )
    client.post("/api/briefing", json={"query": "silverstone 2026"})
    assert agent.states[0]["race_query"] == "silverstone 2026"
    assert agent.states[0]["current_step"] == "resolving"


def test_briefing_truncates_long_tool_payloads_in_the_trace(client, install_agent):
    """The trace is a UI summary, not the data — long payloads are clipped to 200 chars."""
    install_agent(
        result={
            "race_info": make_race_info(),
            "briefing": "x",
            "current_step": "complete",
            "tool_results": [
                {"tool_name": "search_f1_news", "success": True, "data": {"body": "y" * 500}}
            ],
        }
    )

    summary = client.post("/api/briefing", json={"query": "monaco"}).json()["tool_trace"][0][
        "summary"
    ]
    assert len(summary) == 203
    assert summary.endswith("...")


def test_briefing_leaves_short_tool_payloads_intact(client, install_agent):
    install_agent(
        result={
            "race_info": make_race_info(),
            "briefing": "x",
            "current_step": "complete",
            "tool_results": [{"tool_name": "get_track_info", "success": True, "data": {"a": 1}}],
        }
    )
    summary = client.post("/api/briefing", json={"query": "monaco"}).json()["tool_trace"][0][
        "summary"
    ]
    assert summary == "{'a': 1}"


def test_briefing_replaces_a_failed_tools_payload_in_the_trace(client, install_agent):
    """A failed tool's payload is ``{"error": ...}`` and can carry upstream detail.

    The trace is rendered verbatim by components/briefing/tool-trace.tsx, so the payload
    is dropped wholesale rather than truncated — truncation would still leak the first
    200 characters, which is exactly where a connection string or host lives.
    """
    install_agent(
        result={
            "race_info": make_race_info(),
            "briefing": "x",
            "current_step": "complete",
            "tool_results": [
                {
                    "tool_name": "get_race_weather",
                    "success": False,
                    "data": {
                        "error": "HTTPSConnectionPool(host='api.openweathermap.org', "
                        "port=443): Read timed out"
                    },
                }
            ],
        }
    )

    trace = client.post("/api/briefing", json={"query": "monaco"}).json()["tool_trace"][0]

    assert trace["tool"] == "get_race_weather"
    assert trace["success"] is False
    assert trace["summary"] == FAILED_TOOL_SUMMARY
    assert "openweathermap" not in trace["summary"]


def test_briefing_falls_back_to_unknown_race_without_race_info(client, install_agent):
    install_agent(result={"briefing": "x", "current_step": "complete"})
    assert client.post("/api/briefing", json={"query": "monaco"}).json()["race"] == "Unknown Race"


def test_an_unresolvable_query_returns_404_with_the_resolver_message(client, install_agent):
    """Resolution failure is a client error — the user typed something that is not a
    Grand Prix — and the resolver's message is deliberately user-facing.
    """
    install_agent(result={"current_step": "error", "briefing": "No race found matching 'monakko'"})

    response = client.post("/api/briefing", json={"query": "monakko"})

    assert response.status_code == 404
    assert response.json()["detail"] == "No race found matching 'monakko'"


@pytest.mark.parametrize(
    "result",
    [
        {"current_step": "complete", "briefing": None},
        {"current_step": "complete"},
    ],
    ids=["briefing-is-none", "briefing-key-absent"],
)
def test_a_completed_run_without_a_briefing_is_a_500(client, install_agent, result):
    """None and absent must behave identically: the initial state sets ``briefing`` to
    None, so a ``dict.get`` default alone would never fire in practice.
    """
    install_agent(result=result)
    response = client.post("/api/briefing", json={"query": "monaco"})
    assert response.status_code == 500
    assert response.json()["detail"] == GENERIC_BRIEFING_ERROR


def test_an_agent_crash_returns_500_without_the_exception_text(client, install_agent, caplog):
    """The sync twin of the stream's catch-all: generic detail, real reason in the log.

    This handler used to put ``str(exc)`` in the detail and log nothing — the leak
    was the only place the exception was visible at all. Now the detail is the
    generic constant and the log carries the exception plus the query that hit it.
    """
    install_agent(raises=RuntimeError("graph exploded"))

    with caplog.at_level(logging.ERROR, logger="api.routes"):
        response = client.post("/api/briefing", json={"query": "monaco"})

    assert response.status_code == 500
    assert response.json()["detail"] == GENERIC_BRIEFING_ERROR
    assert "graph exploded" not in response.json()["detail"]
    assert "graph exploded" in caplog.text
    assert "monaco" in caplog.text


def test_a_missing_query_field_is_rejected_before_the_agent_runs(client, install_agent):
    agent = install_agent(result={})
    assert client.post("/api/briefing", json={}).status_code == 422
    assert agent.states == []


def test_briefing_clears_the_schedule_cache_even_when_it_fails(client, install_agent):
    """The cache is per-request; leaking it across requests would serve stale schedules."""
    from tools import schedule_cache

    install_agent(raises=RuntimeError("boom"))
    schedule_cache.prefill({2025: "sentinel"})

    client.post("/api/briefing", json={"query": "monaco"})

    assert schedule_cache._cache == {}


def test_briefing_clears_the_openf1_cache_even_when_it_fails(client, install_agent):
    """A range query cached before a race's results are published must not survive past
    this request — otherwise the next briefing serves a stale championship table.
    """
    from tools import openf1_client

    install_agent(raises=RuntimeError("boom"))
    openf1_client._cache[("session_result", frozenset({("year", 2026)}))] = ["sentinel"]

    client.post("/api/briefing", json={"query": "monaco"})

    assert openf1_client._cache == {}


# ── POST /api/briefing/stream ────────────────────────────────────────────────


def test_stream_emits_the_full_event_sequence(client, install_agent):
    """The frontend's StreamEvent union depends on this order and these type names.

    Flipped when Deltas landed. ``briefing_delta`` now sits between the synthesizing
    status and the terminal ``briefing``, so the prose arrives as it is written. The
    terminal ``briefing`` is retained after them — no longer as the reader's first sight
    of the text, but as the reconciliation anchor a dropped Delta would otherwise
    corrupt undetectably. See ADR-0002.
    """
    install_agent(steps=successful_steps(), deltas=successful_deltas())

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)

    assert [event_type for event_type, _ in events] == [
        "status",
        "race_info",
        "status",
        "tool_plan",
        "status",
        "tool_result",
        "tool_result",
        "status",
        "briefing_delta",
        "briefing_delta",
        "briefing_delta",
        "briefing",
        "complete",
    ]


def test_stream_sends_every_delta_before_the_terminal_briefing(client, install_agent):
    install_agent(steps=successful_steps(), deltas=successful_deltas())

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    types = [event_type for event_type, _ in events]

    assert types.index("briefing") > max(
        index for index, name in enumerate(types) if name == "briefing_delta"
    )


def test_concatenated_deltas_reconstruct_the_terminal_briefing(client, install_agent):
    """The reconciliation guarantee, which is the terminal event's entire justification.

    ``lib/api.ts`` silently swallows malformed frames, so a Delta lost in transit would
    leave the reader with a quietly corrupted document. The terminal event is what makes
    that detectable — and this is the test that keeps the two in agreement.
    """
    install_agent(steps=successful_steps(), deltas=successful_deltas())

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)

    joined = "".join(data["content"] for name, data in events if name == "briefing_delta")
    terminal = next(data for name, data in events if name == "briefing")
    assert joined == terminal["content"]


def test_stream_asks_the_agent_for_both_update_and_custom_modes(client, install_agent):
    """Deltas ride the ``custom`` mode; dropping it would silently lose every one of them.

    Nothing else in this file catches that: ``FakeAgent`` yields what it likes regardless
    of what was asked for, so every ordering assertion would still pass.
    """
    agent = install_agent(steps=successful_steps(), deltas=successful_deltas())

    client.post("/api/briefing/stream", json={"query": "monaco"})

    assert agent.stream_modes == [["updates", "custom"]]


def test_stream_delivers_a_truncated_briefing_without_an_error_event(client, install_agent):
    """A truncated run ends in ``complete``, not ``error``, and that is deliberate.

    ``use-briefing.ts`` pipes error text into a red banner. Firing one directly above
    readable prose would read as "everything broke" when in fact most of the briefing
    arrived. The marker is the ``truncated`` field, rendered calmly after the text.
    """
    install_agent(
        steps=[
            {"resolver": {"race_info": make_race_info(), "current_step": "planning"}},
            {
                "synthesizer": {
                    "briefing": "## Mon",
                    "briefing_truncated": True,
                    "current_step": "complete",
                }
            },
        ],
        deltas=["## Mon"],
    )

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)

    assert [name for name, _ in events] == [
        "status",
        "race_info",
        "status",
        "briefing_delta",
        "briefing",
        "complete",
    ]
    assert next(data for name, data in events if name == "briefing")["truncated"] is True


def test_stream_reports_a_synthesis_that_died_before_any_delta_as_an_error(client, install_agent):
    """The ≥1 Delta rule at the transport: no prose means no ``briefing`` event at all.

    The node re-raises when it has nothing to deliver, so this arrives at the catch-all as
    an ordinary crash — generic message, real reason in the log. The run gets as far as
    announcing *synthesizing* and then stops there, which is the sequence the spec pins:
    ``… → status{synthesizing} → error``.
    """
    install_agent(
        steps=successful_steps()[:3],
        raises=RuntimeError("stream died before any prose"),
        raises_after=3,
    )

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    names = [name for name, _ in events]

    assert "briefing" not in names
    assert "briefing_delta" not in names
    assert names[-2:] == ["status", "error"]
    assert events[-2][1]["step"] == "synthesizing"
    assert events[-1][1] == {"message": GENERIC_BRIEFING_ERROR}


def test_stream_status_events_walk_through_every_step(client, install_agent):
    install_agent(steps=successful_steps())
    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    statuses = [data["step"] for event_type, data in events if event_type == "status"]
    assert statuses == ["resolving", "planning", "gathering", "synthesizing"]


def test_stream_sends_the_resolved_race_info(client, install_agent):
    install_agent(steps=successful_steps())
    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    race_info = next(data for event_type, data in events if event_type == "race_info")
    assert race_info["name"] == "Monaco Grand Prix"
    assert race_info["historical_year"] == 2024


def test_stream_reports_each_tool_with_its_success_flag_and_nothing_else(client, install_agent):
    """Only tool name and success cross the wire — payloads stay server-side."""
    install_agent(steps=successful_steps())
    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    tool_results = [data for event_type, data in events if event_type == "tool_result"]
    assert tool_results == [
        {"tool": "get_track_info", "success": True},
        {"tool": "search_f1_news", "success": False},
    ]


def test_the_planner_step_announces_the_planned_tools(client, install_agent):
    """The plan is what lets the loader show pending chips instead of counting up from zero."""
    install_agent(steps=successful_steps(), deltas=successful_deltas())

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)

    plans = [data for event_type, data in events if event_type == "tool_plan"]
    assert plans == [{"tools": ["get_track_info", "search_f1_news"]}]


def test_the_plan_is_announced_before_gathering_begins(client, install_agent):
    install_agent(steps=successful_steps(), deltas=successful_deltas())

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    names = [event_type for event_type, _ in events]

    gathering = next(
        i
        for i, (event_type, data) in enumerate(events)
        if event_type == "status" and data["step"] == "gathering"
    )

    assert names.index("tool_plan") < gathering


def test_each_tool_is_reported_exactly_once(client, install_agent):
    """The emission moved from the node's update to the writer. Emitting from both would
    double every chip, and a duplicate reads as a tool that ran twice."""
    install_agent(steps=successful_steps(), deltas=successful_deltas())

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    results = [data for event_type, data in events if event_type == "tool_result"]

    assert [r["tool"] for r in results] == ["get_track_info", "search_f1_news"]


def test_an_empty_plan_still_announces_itself(client, install_agent):
    """An empty plan still fires `tool_plan` with `tools: []` — the event's presence does
    not depend on the plan being non-empty."""
    install_agent(
        steps=[
            {"resolver": {"race_info": make_race_info(), "current_step": "planning"}},
            {"planner": {"tasks": [], "current_step": "gathering"}},
        ]
    )

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    plans = [data for event_type, data in events if event_type == "tool_plan"]

    assert plans == [{"tools": []}]


def test_stream_sends_the_briefing_then_completes(client, install_agent):
    install_agent(steps=successful_steps())
    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    assert events[-2] == ("briefing", {"content": "## Monaco\n\nTight.", "truncated": False})
    assert events[-1] == ("complete", {"message": "Briefing complete"})


def test_stream_stops_at_the_resolver_when_resolution_fails(client, install_agent):
    """Mirrors the graph's conditional edge to END: no planning, no tools, no briefing."""
    install_agent(
        steps=[
            {
                "resolver": {
                    "race_info": None,
                    "current_step": "error",
                    "briefing": "No race found matching 'monakko'",
                }
            },
            {"planner": {"tasks": [], "current_step": "gathering"}},
        ]
    )

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monakko"}).text)

    assert [event_type for event_type, _ in events] == ["status", "error"]
    assert events[1][1] == {"message": "No race found matching 'monakko'"}


def test_stream_reports_an_agent_crash_with_the_generic_message(client, install_agent):
    """A stream cannot change its status code once open, so failures arrive as events.

    The message is fixed, not the exception's: an exception that reached the boundary is
    internal by definition. The detail is in the server log.
    """
    install_agent(raises=RuntimeError("graph exploded"))

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)

    assert events[-1][0] == "error"
    assert events[-1][1] == {"message": GENERIC_BRIEFING_ERROR}
    assert "graph exploded" not in events[-1][1]["message"]


def test_stream_does_not_leak_a_provider_error_payload(client, install_agent):
    """The regression that motivated this work.

    A misconfigured API key made the provider client raise with its full error body,
    and the whole thing rendered in the briefing UI — including the request_id. The
    synthetic payload below is the historical Anthropic 401. Asserted against the raw
    SSE body rather than the parsed event, so a leak into any field of any event fails
    this test.
    """
    install_agent(
        raises=RuntimeError(
            "Error code: 401 - {'type': 'error', 'error': "
            "{'type': 'authentication_error', 'message': 'invalid x-api-key'}, "
            "'request_id': 'req_011CdXDnNNKs443fdUR7WoSp'}"
        )
    )

    body = client.post("/api/briefing/stream", json={"query": "monaco"}).text

    assert "401" not in body
    assert "x-api-key" not in body
    assert "req_011CdXDnNNKs443fdUR7WoSp" not in body
    assert GENERIC_BRIEFING_ERROR in body


def test_stream_omits_the_briefing_event_when_the_synthesizer_produces_nothing(
    client, install_agent
):
    install_agent(
        steps=[
            {"resolver": {"race_info": make_race_info(), "current_step": "planning"}},
            {"synthesizer": {"briefing": None, "current_step": "complete"}},
        ]
    )
    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    assert [event_type for event_type, _ in events] == ["status", "race_info", "status"]


def test_stream_delivers_events_while_the_agent_is_still_running(monkeypatch):
    """The point of the whole endpoint: events describe work that has not finished yet.

    Every other test in this file asserts *order*, which the old drain-the-agent-into-a-
    list-then-replay-it implementation satisfied perfectly — it just did all of it after
    the run had already finished. This one asserts *timing*, and is the only test that
    fails if buffering is reintroduced.

    It reads the SSE generator directly rather than going through ``client``: Starlette's
    TestClient runs the ASGI app to completion and hands back an already-buffered body,
    so over HTTP a lazy generator and an eager one are indistinguishable here.

    ``GatedAgent`` yields the resolver step and then parks on a gate nothing ever opens,
    so the agent cannot finish. Three events must come out anyway. ``wait_for`` turns a
    regression into a bounded failure rather than a hung suite.
    """
    monkeypatch.setattr(routes_module, "agent", GatedAgent(successful_steps(), asyncio.Event()))

    async def drive() -> list[str]:
        response = await routes_module.generate_briefing_stream(BriefingRequest(query="monaco"))
        events = response.body_iterator
        try:
            return [(await asyncio.wait_for(anext(events), timeout=5))["event"] for _ in range(3)]
        finally:
            await events.aclose()

    assert asyncio.run(drive()) == ["status", "race_info", "status"]


def test_stream_clears_the_schedule_cache(client, install_agent):
    from tools import schedule_cache

    install_agent(steps=successful_steps())
    schedule_cache.prefill({2025: "sentinel"})

    client.post("/api/briefing/stream", json={"query": "monaco"})

    assert schedule_cache._cache == {}


def test_stream_clears_the_openf1_cache(client, install_agent):
    from tools import openf1_client

    install_agent(steps=successful_steps())
    openf1_client._cache[("session_result", frozenset({("year", 2026)}))] = ["sentinel"]

    client.post("/api/briefing/stream", json={"query": "monaco"})

    assert openf1_client._cache == {}


# ── GET /api/races/{year} ────────────────────────────────────────────────────


def test_races_returns_the_calendar(client, monkeypatch, season_2025):
    monkeypatch.setattr(routes_module.fastf1, "get_event_schedule", lambda year: season_2025)

    response = client.get("/api/races/2025")

    assert response.status_code == 200
    body = response.json()
    assert body["year"] == 2025
    assert [race["name"] for race in body["races"]] == [
        "Bahrain Grand Prix",
        "Miami Grand Prix",
        "Monaco Grand Prix",
        "British Grand Prix",
    ]
    assert body["races"][2] == {
        "name": "Monaco Grand Prix",
        "location": "Monaco",
        "country": "Monaco",
        "date": "2025-05-25 00:00:00",
        "round": 3,
    }


def test_races_returns_an_empty_list_for_an_empty_schedule(client, monkeypatch):
    monkeypatch.setattr(routes_module.fastf1, "get_event_schedule", lambda year: make_schedule([]))
    response = client.get("/api/races/2025")
    assert response.status_code == 200
    assert response.json()["races"] == []


def test_races_returns_500_when_the_schedule_cannot_be_loaded(client, monkeypatch):
    """FastF1's exception text is internal; the calendar gets its own generic message.

    Not GENERIC_BRIEFING_ERROR — no briefing is being generated here, and telling the
    user otherwise would be misleading.
    """

    def boom(year):
        raise ValueError(f"No data for {year}")

    monkeypatch.setattr(routes_module.fastf1, "get_event_schedule", boom)

    response = client.get("/api/races/2025")

    assert response.status_code == 500
    assert response.json()["detail"] == GENERIC_SCHEDULE_ERROR
    assert "No data for" not in response.json()["detail"]


def test_races_rejects_a_non_numeric_year(client):
    assert client.get("/api/races/next").status_code == 422


@pytest.mark.parametrize("year", [1949, 99999, -5])
def test_races_rejects_an_out_of_range_year_before_touching_fastf1(client, year):
    """Validation happens at the path parameter, so fastf1 is never reached — the
    conftest network guard would fail this loudly otherwise.
    """
    assert client.get(f"/api/races/{year}").status_code == 422


def test_standings_returns_the_tool_payload(client, monkeypatch):
    # get_championship_standings is a langchain @tool (a pydantic BaseModel instance),
    # which rejects setattr on an undeclared field like "invoke" — so the module-level
    # binding is swapped for a fake tool instead, the same pattern test_graph.py uses
    # for `all_tools` via tests.factories.make_tool.
    from api import routes

    payload = {
        "year": 2026,
        "races_completed": 13,
        "drivers": [
            {"position": 1, "driver": "A B", "driver_code": "ABC", "team": "T", "points": 219.0}
        ],
        "constructors": [{"position": 1, "team": "T", "points": 379.0}],
    }
    monkeypatch.setattr(
        routes,
        "get_championship_standings",
        make_tool("get_championship_standings", result=payload),
    )

    response = client.get("/api/standings/2026")

    assert response.status_code == 200
    assert response.json() == payload


def test_standings_rejects_a_year_before_coverage(client):
    """422 from the Path bound, before any handler code runs — the year is user input
    and the boundary is the cheapest place to reject it.
    """
    response = client.get("/api/standings/2022")

    assert response.status_code == 422


def test_standings_clears_the_openf1_cache(client, monkeypatch):
    """A standings request must never serve a table cached before results were published,
    on the very next request — including a fresh call to this same route.
    """
    from tools import openf1_client

    monkeypatch.setattr(
        routes_module,
        "get_championship_standings",
        make_tool("get_championship_standings", result={"year": 2026, "drivers": []}),
    )
    openf1_client._cache[("session_result", frozenset({("year", 2026)}))] = ["sentinel"]

    client.get("/api/standings/2026")

    assert openf1_client._cache == {}


def test_standings_replaces_a_tool_error_with_a_generic_502(client, monkeypatch):
    """A tool-level {"error": ...} may carry upstream exception text. It is logged, not
    served — the same rule api/errors.py exists to enforce for every other route.
    """
    from api import routes

    monkeypatch.setattr(
        routes,
        "get_championship_standings",
        make_tool(
            "get_championship_standings",
            result={"error": "OpenF1 session_result returned HTTP 503"},
        ),
    )

    response = client.get("/api/standings/2026")

    assert response.status_code == 502
    assert "503" not in response.text
    assert response.json()["detail"] == routes.GENERIC_STANDINGS_ERROR
