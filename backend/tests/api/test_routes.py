"""Tests for the REST and SSE endpoints.

These are the outer net: they run against the router with the agent replaced, so
graph.py's internals can be restructured freely without touching this file. What is
pinned here is the HTTP contract and — for the stream — the *order and type* of SSE
events, which the frontend's discriminated union depends on.
"""

import json
import logging
from typing import Any

import pytest

from api import routes as routes_module
from api.errors import GENERIC_BRIEFING_ERROR, GENERIC_SCHEDULE_ERROR
from tests.factories import make_race_info, make_schedule


class FakeAgent:
    """Stand-in for the compiled LangGraph agent.

    ``.stream()`` yields one ``{node_name: partial_state}`` dict per completed node,
    matching LangGraph's default stream mode — which is what routes.py translates into
    SSE events.
    """

    def __init__(
        self,
        steps: list[dict[str, Any]] | None = None,
        result: dict[str, Any] | None = None,
        raises: Exception | None = None,
    ) -> None:
        self.steps = steps or []
        self.result = result or {}
        self.raises = raises
        self.states: list[dict[str, Any]] = []

    def invoke(self, state: dict[str, Any]) -> dict[str, Any]:
        self.states.append(state)
        if self.raises is not None:
            raise self.raises
        return self.result

    def stream(self, state: dict[str, Any]):
        self.states.append(state)
        if self.raises is not None:
            raise self.raises
        yield from self.steps


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
        {"synthesizer": {"briefing": "## Monaco\n\nTight.", "current_step": "complete"}},
    ]


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


def test_briefing_falls_back_to_unknown_race_without_race_info(client, install_agent):
    install_agent(result={"briefing": "x", "current_step": "complete"})
    assert client.post("/api/briefing", json={"query": "monaco"}).json()["race"] == "Unknown Race"


def test_an_unresolvable_query_returns_500(client, install_agent):
    """Pins current behaviour, which is arguably the wrong status code.

    A query the resolver cannot match is a *client* error — the user typed something
    that is not a Grand Prix. It surfaces as 500 because the resolver writes its message
    into ``briefing`` (see tests/agent/test_graph.py) and routes.py reads that field back
    out as an internal-error detail.

    400 or 404 would be more honest. Changing it should flip this test deliberately, and
    would also need frontend work: lib/api.ts throws the same generic message for every
    non-ok status, so the improvement would not reach the UI on its own.
    """
    install_agent(
        result={"current_step": "error", "briefing": "Could not resolve race: no such race"}
    )

    response = client.post("/api/briefing", json={"query": "monakko"})

    assert response.status_code == 500
    assert response.json()["detail"] == "Could not resolve race: no such race"


def test_a_none_briefing_loses_the_fallback_message(client, install_agent):
    """Pins current behaviour, which contains a real defect.

    routes.py reads ``result.get("briefing", "Failed to generate briefing")``. A dict
    default only applies when the key is *absent* — here the key is present and set to
    None, so ``detail`` becomes None and FastAPI renders a bare "Internal Server Error".

    This is the case the fallback was written for, and it is the case that always
    happens: AgentState declares ``briefing`` and the initial state sets it to None, so
    the key is never missing in practice. The message below is effectively unreachable.

    Fixing it (``result.get("briefing") or "Failed to generate briefing"``) should flip
    this test.
    """
    install_agent(result={"current_step": "complete", "briefing": None})
    response = client.post("/api/briefing", json={"query": "monaco"})
    assert response.status_code == 500
    assert response.json()["detail"] == "Internal Server Error"


def test_the_fallback_message_only_appears_when_the_key_is_absent(client, install_agent):
    """The contrast case for the test above: no ``briefing`` key at all reaches the default.

    The agent never actually produces this state; it is here to show that the fallback
    works and that the bug is specifically about None, not about the message itself.
    """
    install_agent(result={"current_step": "complete"})
    response = client.post("/api/briefing", json={"query": "monaco"})
    assert response.status_code == 500
    assert response.json()["detail"] == "Failed to generate briefing"


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


# ── POST /api/briefing/stream ────────────────────────────────────────────────


def test_stream_emits_the_full_event_sequence(client, install_agent):
    """The frontend's StreamEvent union depends on this order and these type names."""
    install_agent(steps=successful_steps())

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)

    assert [event_type for event_type, _ in events] == [
        "status",
        "race_info",
        "status",
        "status",
        "tool_result",
        "tool_result",
        "status",
        "briefing",
        "complete",
    ]


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


def test_stream_sends_the_briefing_then_completes(client, install_agent):
    install_agent(steps=successful_steps())
    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monaco"}).text)
    assert events[-2] == ("briefing", {"content": "## Monaco\n\nTight."})
    assert events[-1] == ("complete", {"message": "Briefing complete"})


def test_stream_stops_at_the_resolver_when_resolution_fails(client, install_agent):
    """Mirrors the graph's conditional edge to END: no planning, no tools, no briefing."""
    install_agent(
        steps=[
            {
                "resolver": {
                    "race_info": None,
                    "current_step": "error",
                    "briefing": "Could not resolve race: no such race",
                }
            },
            {"planner": {"tasks": [], "current_step": "gathering"}},
        ]
    )

    events = parse_sse(client.post("/api/briefing/stream", json={"query": "monakko"}).text)

    assert [event_type for event_type, _ in events] == ["status", "error"]
    assert events[1][1] == {"message": "Could not resolve race: no such race"}


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


def test_stream_clears_the_schedule_cache(client, install_agent):
    from tools import schedule_cache

    install_agent(steps=successful_steps())
    schedule_cache.prefill({2025: "sentinel"})

    client.post("/api/briefing/stream", json={"query": "monaco"})

    assert schedule_cache._cache == {}


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

    response = client.get("/api/races/1066")

    assert response.status_code == 500
    assert response.json()["detail"] == GENERIC_SCHEDULE_ERROR
    assert "No data for" not in response.json()["detail"]


def test_races_rejects_a_non_numeric_year(client):
    assert client.get("/api/races/next").status_code == 422
