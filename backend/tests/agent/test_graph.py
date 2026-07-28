"""Tests for the LangGraph workflow nodes and the routing between them.

The LLM is replaced wholesale — every test that reaches planner or synthesizer
monkeypatches ``agent.graph.llm``. No test here makes a network call.
"""

import logging

import pytest
from langgraph.graph import END

from agent import graph as graph_module
from agent.graph import (
    _invoke_tool,
    planner_node,
    resolver_node,
    should_continue_after_resolver,
    synthesizer_node,
    tool_executor_node,
)
from agent.prompts import DEFAULT_TOOLS
from tests.factories import make_llm, make_race_info, make_state, make_tool


@pytest.fixture
def fake_llm(monkeypatch):
    """Install a fake LLM and hand back the installer so tests can set the response."""

    def _install(content: str = "[]", raises: Exception | None = None):
        llm = make_llm(content=content, raises=raises)
        monkeypatch.setattr(graph_module, "llm", llm)
        return llm

    return _install


# ── Routing ──────────────────────────────────────────────────────────────────


def test_resolver_error_routes_straight_to_end():
    """The invariant CLAUDE.md calls out: on resolution failure the graph skips everything.

    Planner, tools and synthesizer must not run. If a refactor turns this conditional
    edge into a plain edge, this is the test that catches it.
    """
    assert should_continue_after_resolver(make_state(current_step="error")) == END


@pytest.mark.parametrize("step", ["planning", "resolving", "gathering", "complete", ""])
def test_any_non_error_step_routes_to_the_planner(step):
    assert should_continue_after_resolver(make_state(current_step=step)) == "planner"


def test_routing_treats_a_missing_step_as_non_error():
    assert should_continue_after_resolver({}) == "planner"


def test_the_full_graph_ends_without_synthesising_when_resolution_fails(monkeypatch, fake_llm):
    """End-to-end proof of the same invariant, through the compiled graph.

    The LLM is set to raise: if the planner or synthesizer were reached, this blows up
    instead of returning cleanly.
    """
    fake_llm(raises=AssertionError("LLM must not be reached after a resolution failure"))
    monkeypatch.setattr(
        graph_module, "resolve_next_race", lambda query: {"error": "No race found matching 'xyz'"}
    )

    result = graph_module.agent.invoke(make_state(race_query="xyz"))

    assert result["current_step"] == "error"
    assert result["race_info"] is None
    assert result["tool_results"] == []


# ── Resolver node ────────────────────────────────────────────────────────────


def test_resolver_maps_a_successful_lookup_into_race_info(monkeypatch):
    monkeypatch.setattr(graph_module, "resolve_next_race", lambda query: make_race_info())

    result = resolver_node(make_state(race_query="monaco"))

    assert result["current_step"] == "planning"
    assert result["race_info"]["name"] == "Monaco Grand Prix"
    assert result["race_info"]["historical_year"] == 2024


def test_resolver_passes_the_raw_query_through(monkeypatch):
    seen = []
    monkeypatch.setattr(
        graph_module,
        "resolve_next_race",
        lambda query: seen.append(query) or make_race_info(),
    )
    resolver_node(make_state(race_query="  Silverstone 2026 "))
    assert seen == ["  Silverstone 2026 "]


def test_resolver_smuggles_its_error_message_through_the_briefing_field(monkeypatch):
    """Pins current behaviour, which conflates two different things.

    ``briefing`` is the deliverable — the synthesised markdown a user reads. On failure
    the resolver reuses it as an error channel, and api/routes.py reads it back out as
    an HTTP 500 detail. One field, two meanings.

    Splitting them (an ``error`` field on AgentState) should flip this test and the
    matching one in tests/api/test_routes.py together, deliberately.
    """
    monkeypatch.setattr(graph_module, "resolve_next_race", lambda query: {"error": "no such race"})

    result = resolver_node(make_state(race_query="nope"))

    assert result["current_step"] == "error"
    assert result["race_info"] is None
    assert result["briefing"] == "Could not resolve race: no such race"


def test_resolver_handles_a_missing_query(monkeypatch):
    """An absent race_query becomes an empty string rather than raising a KeyError."""
    seen = []
    monkeypatch.setattr(
        graph_module,
        "resolve_next_race",
        lambda query: seen.append(query) or {"error": "empty query"},
    )
    result = resolver_node({})
    assert seen == [""]
    assert result["current_step"] == "error"


# ── Planner node ─────────────────────────────────────────────────────────────


def test_planner_parses_a_bare_json_list(fake_llm):
    fake_llm('["get_track_info", "search_f1_news"]')
    result = planner_node(make_state(race_info=make_race_info()))
    assert result["tasks"] == ["get_track_info", "search_f1_news"]
    assert result["current_step"] == "gathering"


def test_planner_strips_a_json_fenced_block(fake_llm):
    """Claude routinely wraps JSON in ```json fences; the node unwraps them."""
    fake_llm('Here you go:\n```json\n["get_race_weather"]\n```\nHope that helps!')
    assert planner_node(make_state(race_info=make_race_info()))["tasks"] == ["get_race_weather"]


def test_planner_strips_a_bare_fenced_block(fake_llm):
    fake_llm('```\n["get_race_weather"]\n```')
    assert planner_node(make_state(race_info=make_race_info()))["tasks"] == ["get_race_weather"]


def test_planner_tolerates_surrounding_whitespace(fake_llm):
    fake_llm('\n\n  ["get_track_info"]  \n\n')
    assert planner_node(make_state(race_info=make_race_info()))["tasks"] == ["get_track_info"]


@pytest.mark.parametrize(
    "content",
    [
        "not json at all",
        "{}",  # valid JSON, wrong type
        '{"tools": ["get_track_info"]}',  # object, not a list
        "[1, 2, 3]",  # list, but not of strings
        '["get_track_info", 7]',  # mixed
        "",
    ],
)
def test_planner_falls_back_to_default_tools_on_unusable_output(fake_llm, content):
    """Any output the node cannot turn into a list of tool names degrades to the defaults."""
    fake_llm(content)
    result = planner_node(make_state(race_info=make_race_info()))
    assert result["tasks"] == DEFAULT_TOOLS
    assert result["current_step"] == "gathering"


def test_planner_skips_the_llm_entirely_without_race_info(fake_llm):
    """No race info means nothing to plan around — the defaults are used without an API call."""
    llm = fake_llm('["get_track_info"]')
    result = planner_node(make_state(race_info=None))
    assert result["tasks"] == DEFAULT_TOOLS
    assert llm.calls == []


def test_planner_degrades_to_default_tools_when_the_llm_call_fails(fake_llm):
    """An unreachable or rate-limited LLM must not take the whole briefing down.

    This previously raised: ``llm.invoke`` sat outside the try, so a Gemini outage or
    rate limit surfaced as an HTTP 500 even though the node has a perfectly good fallback
    to DEFAULT_TOOLS. On a free-tier key a 429 is an expected part of normal operation
    rather than a rare outage, so the planner now degrades the way the rest of the
    pipeline does — the planner is an optimisation, not a prerequisite.
    """
    fake_llm(raises=RuntimeError("429 rate limit exceeded"))

    result = planner_node(make_state(race_info=make_race_info()))

    assert result["tasks"] == DEFAULT_TOOLS
    assert result["current_step"] == "gathering"


def test_planner_logs_which_llm_failure_caused_the_fallback(fake_llm, caplog):
    """A degraded planner must say *why*, or a persistent outage looks like normal operation.

    The parse-failure path and the call-failure path log differently on purpose: one means
    the model returned something unusable, the other means it was never reached.
    """
    fake_llm(raises=RuntimeError("429 rate limit exceeded"))

    with caplog.at_level(logging.WARNING, logger="agent.graph"):
        planner_node(make_state(race_info=make_race_info()))

    assert "Planner LLM call failed" in caplog.text
    assert "RuntimeError" in caplog.text
    assert "429 rate limit exceeded" in caplog.text


# ── Tool argument dispatch ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("task_name", "expected_args"),
    [
        ("get_track_info", {"circuit_name": "Monaco Grand Prix", "year": 2024}),
        ("get_season_standings", {"year": 2024}),
        ("get_circuit_winners", {"circuit_name": "Monaco Grand Prix", "years_back": 3}),
        ("search_f1_news", {"query": "Monaco Grand Prix 2025", "max_results": 5}),
        ("get_race_weather", {"city": "Monaco", "country_code": "MC"}),
        ("get_driver_form", {"driver_code": "VER", "year": 2024, "num_races": 5}),
        ("get_recent_race_results", {"event_name": "Monaco Grand Prix", "year": 2024}),
    ],
)
def test_each_tool_receives_arguments_derived_from_race_info(task_name, expected_args):
    """Pins the hand-written arg mapping — the part most likely to drift silently.

    Note that the history-oriented tools get ``historical_year`` (2024) while news gets
    the race's own year (2025): an upcoming race has no data of its own yet.
    """
    tool = make_tool(task_name, result={"ok": True})
    _invoke_tool(tool, task_name, make_race_info())
    assert tool.calls == [expected_args]


def test_weather_falls_back_to_us_for_an_unmapped_country():
    """COUNTRY_CODE_MAP has no entry for every country FastF1 can return."""
    tool = make_tool("get_race_weather")
    _invoke_tool(tool, "get_race_weather", make_race_info(country="Atlantis", location="Poseidon"))
    assert tool.calls == [{"city": "Poseidon", "country_code": "US"}]


def test_a_tool_returning_an_error_key_is_marked_unsuccessful():
    tool = make_tool("get_track_info", {"error": "nope"})
    result = _invoke_tool(tool, "get_track_info", make_race_info())
    assert result["success"] is False
    assert result["data"] == {"error": "nope"}


def test_a_raising_tool_is_caught_and_reported():
    """Tools are contracted never to raise; if one does anyway, the node absorbs it."""
    tool = make_tool("get_track_info", raises=ValueError("kaboom"))
    result = _invoke_tool(tool, "get_track_info", make_race_info())
    assert result["success"] is False
    assert "kaboom" in result["data"]["error"]


def test_an_unhandled_task_name_reports_a_missing_handler():
    result = _invoke_tool(make_tool("brand_new_tool"), "brand_new_tool", make_race_info())
    assert result["success"] is False
    assert result["data"] == {"error": "No handler for tool: brand_new_tool"}


# ── Tool executor node ───────────────────────────────────────────────────────


def test_tool_executor_requires_race_info():
    result = tool_executor_node(make_state(race_info=None, tasks=["get_track_info"]))
    assert result["current_step"] == "error"
    assert result["briefing"] == "No race information available"


def test_tool_executor_runs_every_planned_tool(monkeypatch):
    monkeypatch.setattr(
        graph_module,
        "all_tools",
        [make_tool("get_track_info", {"length": 3.3}), make_tool("search_f1_news", {"count": 2})],
    )

    result = tool_executor_node(
        make_state(race_info=make_race_info(), tasks=["get_track_info", "search_f1_news"])
    )

    assert result["current_step"] == "synthesizing"
    assert {tr["tool_name"] for tr in result["tool_results"]} == {
        "get_track_info",
        "search_f1_news",
    }
    assert all(tr["success"] for tr in result["tool_results"])


def test_tool_executor_reports_an_unknown_tool_without_running_anything(monkeypatch):
    """The planner is an LLM and can hallucinate a tool name that does not exist."""
    monkeypatch.setattr(graph_module, "all_tools", [make_tool("get_track_info")])

    result = tool_executor_node(
        make_state(race_info=make_race_info(), tasks=["get_track_info", "get_vibes"])
    )

    by_name = {tr["tool_name"]: tr for tr in result["tool_results"]}
    assert by_name["get_vibes"]["success"] is False
    assert by_name["get_vibes"]["data"] == {"error": "Unknown tool: get_vibes"}
    assert by_name["get_track_info"]["success"] is True


def test_tool_executor_continues_past_a_failing_tool(monkeypatch):
    """Partial data is the design: one dead tool must not sink the other three."""
    monkeypatch.setattr(
        graph_module,
        "all_tools",
        [
            make_tool("get_track_info", {"length": 3.3}),
            make_tool("search_f1_news", raises=RuntimeError("boom")),
            make_tool("get_race_weather", {"error": "OPENWEATHER_API_KEY not configured"}),
        ],
    )

    result = tool_executor_node(
        make_state(
            race_info=make_race_info(),
            tasks=["get_track_info", "search_f1_news", "get_race_weather"],
        )
    )

    by_name = {tr["tool_name"]: tr["success"] for tr in result["tool_results"]}
    assert by_name == {"get_track_info": True, "search_f1_news": False, "get_race_weather": False}
    assert result["current_step"] == "synthesizing"


def test_tool_executor_with_no_tasks_produces_no_results(monkeypatch):
    monkeypatch.setattr(graph_module, "all_tools", [make_tool("get_track_info")])
    result = tool_executor_node(make_state(race_info=make_race_info(), tasks=[]))
    assert result["tool_results"] == []
    assert result["current_step"] == "synthesizing"


# ── Synthesizer node ─────────────────────────────────────────────────────────


def test_synthesizer_returns_the_llm_output_as_the_briefing(fake_llm):
    fake_llm("## Monaco Grand Prix\n\nTight, slow, unforgiving.")

    result = synthesizer_node(
        make_state(
            race_info=make_race_info(),
            tool_results=[{"tool_name": "get_track_info", "success": True, "data": {"len": 3.3}}],
        )
    )

    assert result["briefing"].startswith("## Monaco Grand Prix")
    assert result["current_step"] == "complete"


def test_synthesizer_short_circuits_without_tool_results(fake_llm):
    """No data means no API call — the node bails before reaching the LLM."""
    llm = fake_llm("should not be used")
    result = synthesizer_node(make_state(race_info=make_race_info(), tool_results=[]))
    assert result["briefing"] == "No data available to generate briefing"
    assert result["current_step"] == "complete"
    assert llm.calls == []


def test_synthesizer_includes_failed_tools_in_the_prompt(fake_llm):
    """Failures are handed to the LLM too, so it can say what it could not find out."""
    llm = fake_llm("briefing")

    synthesizer_node(
        make_state(
            race_info=make_race_info(),
            tool_results=[
                {"tool_name": "get_race_weather", "success": False, "data": {"error": "no key"}}
            ],
        )
    )

    system_prompt = llm.calls[0][0].content
    assert "get_race_weather" in system_prompt
    assert "no key" in system_prompt
