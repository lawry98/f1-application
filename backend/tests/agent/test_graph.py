"""Tests for the LangGraph workflow nodes and the routing between them.

The LLM is replaced wholesale — every test that reaches planner or synthesizer
monkeypatches ``agent.graph.llm``. No test here makes a network call.
"""

import json
import logging

import httpx
import pytest
from freezegun import freeze_time
from google.genai import _api_client as genai_api_client
from google.genai import errors as genai_errors
from langgraph.graph import END, StateGraph

from agent import graph as graph_module
from agent.graph import (
    _build_tool_args,
    _invoke_tool,
    planner_node,
    resolver_node,
    should_continue_after_resolver,
    synthesizer_node,
    tool_executor_node,
)
from agent.prompts import DEFAULT_TOOLS
from agent.state import AgentState
from config import BRIEFING_DEADLINE_SECONDS, LLM_TIMEOUT_SECONDS, SYNTHESIZER_TIMEOUT_SECONDS
from tests.factories import make_llm, make_race_info, make_state, make_tool

AS_OF = "2025-05-01T00:00:00+00:00"


@pytest.fixture
def fake_llm(monkeypatch):
    """Install a fake LLM and hand back the installer so tests can set the response."""

    def _install(content: str = "[]", **kwargs):
        llm = make_llm(content=content, **kwargs)
        monkeypatch.setattr(graph_module, "llm", llm)
        return llm

    return _install


def run_synthesizer_streamed(state: dict | None = None) -> tuple[list[dict], dict]:
    """Run ``synthesizer_node`` inside a one-node graph, streamed with ``custom`` mode.

    This is how every test that reaches the node drives it. ``get_stream_writer()`` needs
    an ambient runnable context, so the node cannot be called on its own; a throwaway
    single-node graph is the smallest thing that provides one, and it exercises the writer
    exactly as the production graph does instead of doubling it.

    ``state`` defaults to a resolved race with one successful tool — enough to get past
    the node's no-data short circuit, which is all most of these tests need.

    Returns the custom payloads in order, and the node's state update.
    """
    if state is None:
        state = make_state(
            race_info=make_race_info(),
            tool_results=[{"tool_name": "get_track_info", "success": True, "data": {"len": 3.3}}],
        )

    workflow = StateGraph(AgentState)
    workflow.add_node("synthesizer", synthesizer_node)
    workflow.set_entry_point("synthesizer")
    workflow.add_edge("synthesizer", END)

    deltas: list[dict] = []
    update: dict = {}
    for mode, payload in workflow.compile().stream(state, stream_mode=["updates", "custom"]):
        if mode == "custom":
            deltas.append(payload)
        else:
            update.update(payload.get("synthesizer", {}))

    return deltas, update


def run_tool_executor_streamed(state: dict) -> tuple[list[dict], dict]:
    """Run ``tool_executor_node`` inside a one-node graph, streamed with ``custom`` mode.

    Same reason as ``run_synthesizer_streamed`` above: the node calls
    ``get_stream_writer()``, which raises outside a runnable context, so it cannot be
    called on its own. Returns the custom payloads in the order they were written, and
    the node's state update.
    """
    workflow = StateGraph(AgentState)
    workflow.add_node("tool_executor", tool_executor_node)
    workflow.set_entry_point("tool_executor")
    workflow.add_edge("tool_executor", END)

    written: list[dict] = []
    update: dict = {}
    for mode, payload in workflow.compile().stream(state, stream_mode=["updates", "custom"]):
        if mode == "custom":
            written.append(payload)
        else:
            update.update(payload.get("tool_executor", {}))

    return written, update


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
    assert result["race_info"] == make_race_info()


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
    an HTTP 404 detail. One field, two meanings.

    The message is now passed through verbatim rather than prefixed with "Could not
    resolve race: ", which read redundantly against messages that already say what
    failed.

    Splitting them (an ``error`` field on AgentState) should flip this test and the
    matching one in tests/api/test_routes.py together, deliberately.
    """
    monkeypatch.setattr(graph_module, "resolve_next_race", lambda query: {"error": "no such race"})

    result = resolver_node(make_state(race_query="nope"))

    assert result["current_step"] == "error"
    assert result["race_info"] is None
    assert result["briefing"] == "no such race"


def test_resolver_keeps_the_detail_field_out_of_the_briefing(monkeypatch):
    """``detail`` is log-only. Only ``error`` is safe to put in front of a user."""
    monkeypatch.setattr(
        graph_module,
        "resolve_next_race",
        lambda query: {
            "error": "Could not load the 1998 season schedule.",
            "detail": "ConnectionError: fastf1 backend unreachable",
        },
    )

    result = resolver_node(make_state(race_query="monaco 1998"))

    assert result["current_step"] == "error"
    assert result["race_info"] is None
    assert result["briefing"] == "Could not load the 1998 season schedule."
    assert "ConnectionError" not in result["briefing"]


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
    """The model routinely wraps JSON in ```json fences; the node unwraps them."""
    fake_llm('Here you go:\n```json\n["get_race_weather"]\n```\nHope that helps!')
    assert planner_node(make_state(race_info=make_race_info()))["tasks"] == ["get_race_weather"]


def test_planner_strips_a_bare_fenced_block(fake_llm):
    fake_llm('```\n["get_race_weather"]\n```')
    assert planner_node(make_state(race_info=make_race_info()))["tasks"] == ["get_race_weather"]


def test_planner_tolerates_surrounding_whitespace(fake_llm):
    fake_llm('\n\n  ["get_track_info"]  \n\n')
    assert planner_node(make_state(race_info=make_race_info()))["tasks"] == ["get_track_info"]


def test_planner_deduplicates_a_repeated_tool(fake_llm):
    """A repeat would run the tool twice — a wasted, sometimes paid, call — and collide
    two chips in the loading panel's footer, whose result lookup is keyed by tool name."""
    fake_llm('["get_track_info", "search_f1_news", "get_track_info"]')
    result = planner_node(make_state(race_info=make_race_info()))
    assert result["tasks"] == ["get_track_info", "search_f1_news"]


def test_planner_keeps_first_appearance_order_when_deduplicating(fake_llm):
    """Pins that this is a dedupe, not a sort — a plain ``set`` would not reliably
    preserve ``["b", "a"]`` here, and order now drives the footer's chip order."""
    fake_llm('["b", "a", "b"]')
    result = planner_node(make_state(race_info=make_race_info()))
    assert result["tasks"] == ["b", "a"]


def test_planner_leaves_a_repeat_free_plan_unchanged(fake_llm):
    fake_llm('["get_track_info", "search_f1_news"]')
    result = planner_node(make_state(race_info=make_race_info()))
    assert result["tasks"] == ["get_track_info", "search_f1_news"]


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


PAST = {"is_upcoming": False, "as_of": "2026-06-05T11:30:00+00:00"}


def test_a_past_race_plans_no_weather_or_news_whatever_the_planner_says(fake_llm):
    """A forecast for a weekend that has been run, or today's news about it, would reach past
    the briefing's cutoff. The plan drops them before the plan is announced, so tool_plan,
    the trace and the synthesizer all see the same list — not left to the LLM's judgement."""
    fake_llm('["get_track_info", "get_race_weather", "search_f1_news", "get_driver_form"]')

    result = planner_node(make_state(race_info=make_race_info(**PAST)))

    assert result["tasks"] == ["get_track_info", "get_driver_form"]


@pytest.mark.parametrize(
    "llm_kwargs", [{"content": "not json"}, {"raises": RuntimeError("429")}], ids=["parse", "call"]
)
def test_a_past_race_drops_weather_and_news_from_the_default_tools_too(fake_llm, llm_kwargs):
    fake_llm(**llm_kwargs)

    result = planner_node(make_state(race_info=make_race_info(**PAST)))

    assert result["tasks"] == [
        tool for tool in DEFAULT_TOOLS if tool not in {"get_race_weather", "search_f1_news"}
    ]
    assert "get_championship_standings" in result["tasks"]


def test_an_upcoming_race_keeps_weather_and_news(fake_llm):
    fake_llm('["get_race_weather", "search_f1_news"]')

    result = planner_node(make_state(race_info=make_race_info()))

    assert result["tasks"] == ["get_race_weather", "search_f1_news"]


# ── Tool argument dispatch ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("task_name", "expected_args"),
    [
        ("get_track_info", {"year": 2025, "round": 3, "track_id": "mc-1929"}),
        ("get_recent_top_finishers", {"as_of": AS_OF}),
        (
            "get_circuit_winners",
            {
                "circuit_name": "Circuit de Monaco",
                "location": "Monaco",
                "race_year": 2025,
                "as_of": AS_OF,
                "years_back": 3,
            },
        ),
        ("search_f1_news", {"query": "Monaco Grand Prix 2025", "max_results": 5}),
        (
            "get_race_weather",
            {"lat": 43.7367, "lon": 7.4258, "sessions": make_race_info()["sessions"]},
        ),
        ("get_driver_form", {"as_of": AS_OF, "num_races": 5}),
        ("get_recent_race_results", {"track_id": "mc-1929", "as_of": AS_OF}),
    ],
)
def test_each_tool_receives_arguments_derived_from_race_info(task_name, expected_args):
    """Pins the hand-written arg mapping — the part most likely to drift silently.

    Track info is *this* event, found by round; every result tool takes the cutoff instead
    of a year, so none of them can reach past it (ADR-0004). The circuit tools are keyed by
    the track, never by the Grand Prix's name.
    """
    tool = make_tool(task_name, result={"ok": True})
    _invoke_tool(tool, task_name, make_race_info())
    assert tool.calls == [expected_args]


def test_weather_for_a_race_with_no_circuit_file_has_no_coordinates_to_guess_from():
    """The tool turns this into a structured error. The geocoding it replaced guessed: a
    country missing from its map silently became "US"."""
    tool = make_tool("get_race_weather")

    _invoke_tool(tool, "get_race_weather", make_race_info(track_id=None))

    assert tool.calls[0]["lat"] is None
    assert tool.calls[0]["lon"] is None


def test_an_unreadable_coordinates_file_leaves_weather_without_coordinates(monkeypatch, tmp_path):
    """Building args must not raise: the tool reports the missing coordinates itself."""
    from tools import circuit_winners

    monkeypatch.setattr(circuit_winners, "CIRCUIT_COORDINATES_PATH", tmp_path / "absent.json")
    tool = make_tool("get_race_weather")

    _invoke_tool(tool, "get_race_weather", make_race_info())

    assert (tool.calls[0]["lat"], tool.calls[0]["lon"]) == (None, None)


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


# ── Tool result cache ────────────────────────────────────────────────────────


def test_a_cacheable_tool_is_invoked_once_across_repeat_calls():
    """The feature: the second briefing for the same race skips the fetch."""
    tool = make_tool("get_track_info", {"length_km": 3.3})

    first = _invoke_tool(tool, "get_track_info", make_race_info())
    second = _invoke_tool(tool, "get_track_info", make_race_info())

    assert len(tool.calls) == 1
    assert first["cached"] is False
    assert second["cached"] is True
    assert second["success"] is True
    assert second["data"] == {"length_km": 3.3}


@pytest.mark.parametrize(
    "task_name",
    [
        "get_track_info",
        "get_recent_top_finishers",
        "get_circuit_winners",
        "get_driver_form",
        "get_recent_race_results",
    ],
)
def test_every_historical_tool_is_cacheable(task_name):
    tool = make_tool(task_name, {"ok": True})
    _invoke_tool(tool, task_name, make_race_info())
    _invoke_tool(tool, task_name, make_race_info())
    assert len(tool.calls) == 1


@pytest.mark.parametrize("task_name", ["get_race_weather", "search_f1_news"])
def test_weather_and_news_are_never_cached(task_name):
    """A cache that serves yesterday's forecast is worse than no cache; news exists
    to be current. Neither tool ever reads or writes the cache."""
    tool = make_tool(task_name, {"ok": True})

    first = _invoke_tool(tool, task_name, make_race_info())
    second = _invoke_tool(tool, task_name, make_race_info())

    assert len(tool.calls) == 2
    assert first["cached"] is False
    assert second["cached"] is False


def test_an_error_result_is_not_cached():
    """Caching an error would turn one transient upstream failure into a
    persistently degraded briefing. Only successes are stored."""
    tool = make_tool("get_track_info", {"error": "FastF1 timeout"})

    _invoke_tool(tool, "get_track_info", make_race_info())
    second = _invoke_tool(tool, "get_track_info", make_race_info())

    assert len(tool.calls) == 2
    assert second["cached"] is False


def test_a_raising_tool_is_not_cached():
    """The exception path must not poison the cache either."""
    tool = make_tool("get_track_info", raises=ValueError("kaboom"))
    _invoke_tool(tool, "get_track_info", make_race_info())
    _invoke_tool(tool, "get_track_info", make_race_info())
    assert len(tool.calls) == 2


def test_a_failure_then_success_serves_the_success_from_cache():
    """The recovery story the error-not-cached rule exists for."""
    failing = make_tool("get_track_info", {"error": "down"})
    working = make_tool("get_track_info", {"length_km": 3.3})

    _invoke_tool(failing, "get_track_info", make_race_info())
    _invoke_tool(working, "get_track_info", make_race_info())
    third = _invoke_tool(make_tool("get_track_info"), "get_track_info", make_race_info())

    assert third["cached"] is True
    assert third["data"] == {"length_km": 3.3}


def test_cache_keys_distinguish_different_races():
    """Different args must not collide: Monaco's results are not Silverstone's."""
    tool = make_tool("get_recent_race_results", {"ok": True})

    _invoke_tool(tool, "get_recent_race_results", make_race_info())
    _invoke_tool(tool, "get_recent_race_results", make_race_info(track_id="gb-1948"))

    assert len(tool.calls) == 2


def test_cache_keys_distinguish_different_cutoffs():
    tool = make_tool("get_recent_top_finishers", {"ok": True})
    _invoke_tool(tool, "get_recent_top_finishers", make_race_info())
    _invoke_tool(
        tool, "get_recent_top_finishers", make_race_info(as_of="2023-07-07T11:30:00+00:00")
    )
    assert len(tool.calls) == 2


def test_clear_result_cache_forces_a_refetch():
    tool = make_tool("get_track_info", {"ok": True})
    _invoke_tool(tool, "get_track_info", make_race_info())
    graph_module.clear_result_cache()
    _invoke_tool(tool, "get_track_info", make_race_info())
    assert len(tool.calls) == 2


def test_a_fresh_result_is_marked_not_cached():
    result = _invoke_tool(make_tool("get_track_info"), "get_track_info", make_race_info())
    assert result["cached"] is False


def test_mutating_a_cache_hits_data_does_not_corrupt_later_hits():
    """The cache is cross-request and process-lifetime; a consumer that mutates
    ToolResult["data"] in place must not poison every later request."""
    tool = make_tool("get_track_info", {"length_km": 3.3, "corners": [1, 2, 3]})

    _invoke_tool(tool, "get_track_info", make_race_info())  # miss, populates the cache

    second_hit = _invoke_tool(tool, "get_track_info", make_race_info())
    assert second_hit["cached"] is True
    second_hit["data"]["length_km"] = 999
    second_hit["data"]["corners"].append(4)

    third_hit = _invoke_tool(tool, "get_track_info", make_race_info())
    assert third_hit["cached"] is True
    assert third_hit["data"] == {"length_km": 3.3, "corners": [1, 2, 3]}


def test_mutating_a_cache_miss_result_does_not_corrupt_later_hits():
    """Same defect, other side: the caller that populates the cache must not be able
    to corrupt it either by mutating the fresh result it was handed back."""
    tool = make_tool("get_track_info", {"length_km": 3.3, "corners": [1, 2, 3]})

    first_miss = _invoke_tool(tool, "get_track_info", make_race_info())
    assert first_miss["cached"] is False
    first_miss["data"]["length_km"] = 999
    first_miss["data"]["corners"].append(4)

    hit = _invoke_tool(tool, "get_track_info", make_race_info())
    assert hit["cached"] is True
    assert hit["data"] == {"length_km": 3.3, "corners": [1, 2, 3]}


CUTOFF_TOOLS = [
    "get_recent_top_finishers",
    "get_driver_form",
    "get_circuit_winners",
    "get_championship_standings",
]


@pytest.mark.parametrize("task_name", CUTOFF_TOOLS)
def test_an_upcoming_race_refetches_once_its_cutoff_rolls_to_a_new_day(task_name):
    """An upcoming race's ``as_of`` is the start of today, so the next day's briefing carries a
    new cutoff — and a new key. That is the whole expiry: "the most recent race" moves on the
    day a new one is held, and nothing but the cutoff needs to say so."""
    tool = make_tool(task_name, {"ok": True})

    _invoke_tool(tool, task_name, make_race_info(as_of="2026-08-04T00:00:00+00:00"))
    _invoke_tool(tool, task_name, make_race_info(as_of="2026-08-05T00:00:00+00:00"))

    assert len(tool.calls) == 2


@pytest.mark.parametrize("task_name", CUTOFF_TOOLS)
def test_one_cutoff_hits_the_cache_whatever_the_date(task_name):
    """A past race's ``as_of`` never changes, and what came before it cannot either — so its
    answers are not refetched just because the calendar moved on. The key has no date of its
    own; the cutoff is the date."""
    tool = make_tool(task_name, {"ok": True})
    past = make_race_info(is_upcoming=False, as_of="2026-06-05T11:30:00+00:00")

    with freeze_time("2026-08-04") as frozen:
        _invoke_tool(tool, task_name, past)
        frozen.tick(86400 * 30)
        _invoke_tool(tool, task_name, past)

    assert len(tool.calls) == 1


def test_an_argument_pure_tool_still_hits_the_cache_across_a_date_change():
    """``get_track_info`` is this event's calendar row and its circuit file — a pure function
    of its arguments, which carry no cutoff because nothing in them moves."""
    tool = make_tool("get_track_info", {"ok": True})

    with freeze_time("2026-08-04") as frozen:
        _invoke_tool(tool, "get_track_info", make_race_info())
        frozen.tick(86400)
        _invoke_tool(tool, "get_track_info", make_race_info())

    assert len(tool.calls) == 1


def test_cacheable_tool_names_all_exist_among_the_real_tools():
    """A tool rename must break this test rather than silently disable its caching."""
    real_tool_names = {t.name for t in graph_module.all_tools}
    assert real_tool_names >= graph_module.CACHEABLE_TOOLS


# ── Tool executor node ───────────────────────────────────────────────────────


def test_tool_executor_runs_every_planned_tool(monkeypatch):
    monkeypatch.setattr(
        graph_module,
        "all_tools",
        [make_tool("get_track_info", {"length": 3.3}), make_tool("search_f1_news", {"count": 2})],
    )

    _, result = run_tool_executor_streamed(
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

    _, result = run_tool_executor_streamed(
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

    _, result = run_tool_executor_streamed(
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
    _, result = run_tool_executor_streamed(make_state(race_info=make_race_info(), tasks=[]))
    assert result["tool_results"] == []
    assert result["current_step"] == "synthesizing"


def test_tool_executor_writes_one_event_per_tool_as_it_completes(monkeypatch):
    """The write is why the gathering stage can report progress at all.

    Results are collected with ``as_completed``, so this is the only place a result exists
    before the node returns. Without the write, the transport cannot emit anything until
    every tool has finished — which was a 14.7-second silence on a real run.
    """
    monkeypatch.setattr(
        graph_module,
        "all_tools",
        [make_tool("get_track_info", {"length": 3.3}), make_tool("search_f1_news", {"count": 2})],
    )

    written, result = run_tool_executor_streamed(
        make_state(race_info=make_race_info(), tasks=["get_track_info", "search_f1_news"])
    )

    assert [w["kind"] for w in written] == ["tool_result", "tool_result"]
    assert {(w["tool"], w["success"]) for w in written} == {
        ("get_track_info", True),
        ("search_f1_news", True),
    }
    # The state update is unchanged — the write is additional, not a replacement.
    assert len(result["tool_results"]) == 2


def test_tool_executor_writes_a_failing_tool_as_unsuccessful(monkeypatch):
    monkeypatch.setattr(
        graph_module,
        "all_tools",
        [make_tool("search_f1_news", {"error": "no key"})],
    )

    written, _ = run_tool_executor_streamed(
        make_state(race_info=make_race_info(), tasks=["search_f1_news"])
    )

    assert written == [
        {"kind": "tool_result", "tool": "search_f1_news", "success": False, "cached": False}
    ]


def test_tool_executor_writes_an_unknown_tool_it_never_ran(monkeypatch):
    """The unknown-tool path appends before the pool, so it is easy to write past."""
    monkeypatch.setattr(graph_module, "all_tools", [])

    written, result = run_tool_executor_streamed(
        make_state(race_info=make_race_info(), tasks=["get_tyre_compounds"])
    )

    assert written == [
        {"kind": "tool_result", "tool": "get_tyre_compounds", "success": False, "cached": False}
    ]
    assert result["tool_results"][0]["success"] is False


def test_tool_executor_with_no_tasks_writes_nothing(monkeypatch):
    monkeypatch.setattr(graph_module, "all_tools", [])

    written, result = run_tool_executor_streamed(make_state(race_info=make_race_info(), tasks=[]))

    assert written == []
    assert result["tool_results"] == []


def test_tool_executor_writes_a_cache_hit_as_cached(monkeypatch):
    """The wire must distinguish a served-from-cache chip from a live fetch —
    that honesty is the whole reason the field exists (spec decision 5)."""
    tool = make_tool("get_track_info", {"length_km": 3.3})
    monkeypatch.setattr(graph_module, "all_tools", [tool])
    state = make_state(race_info=make_race_info(), tasks=["get_track_info"])

    first_written, _ = run_tool_executor_streamed(state)
    second_written, _ = run_tool_executor_streamed(state)

    assert len(tool.calls) == 1
    assert first_written == [
        {"kind": "tool_result", "tool": "get_track_info", "success": True, "cached": False}
    ]
    assert second_written == [
        {"kind": "tool_result", "tool": "get_track_info", "success": True, "cached": True}
    ]


# ── Synthesizer node ─────────────────────────────────────────────────────────


def test_synthesizer_returns_the_llm_output_as_the_briefing(fake_llm):
    fake_llm("## Monaco Grand Prix\n\nTight, slow, unforgiving.")

    _, update = run_synthesizer_streamed()

    assert update["briefing"].startswith("## Monaco Grand Prix")
    assert update["current_step"] == "complete"


def test_synthesizer_short_circuits_without_tool_results(fake_llm):
    """No data means no API call — the node bails before reaching the LLM."""
    llm = fake_llm("should not be used")

    _, update = run_synthesizer_streamed(make_state(race_info=make_race_info(), tool_results=[]))

    assert update["briefing"] == "No data available to generate briefing"
    assert update["current_step"] == "complete"
    assert llm.calls == []


def test_synthesizer_includes_failed_tools_in_the_prompt(fake_llm):
    """Failures are handed to the LLM too, so it can say what it could not find out."""
    llm = fake_llm("briefing")

    run_synthesizer_streamed(
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


def test_synthesizer_writes_one_delta_per_chunk(fake_llm):
    """Deltas are how the prose reaches the reader while it is still being written.

    Exactly one write per chunk, in order, tagged with the ``kind`` the transport
    switches on. Appending every Delta reconstructs the Briefing — the reconciliation
    guarantee the terminal ``briefing`` event exists to check.
    """
    fake_llm(chunks=["## Mon", "aco\n\n", "Tight."])

    deltas, update = run_synthesizer_streamed()

    assert deltas == [
        {"kind": "briefing_delta", "content": "## Mon"},
        {"kind": "briefing_delta", "content": "aco\n\n"},
        {"kind": "briefing_delta", "content": "Tight."},
    ]
    assert update["briefing"] == "## Monaco\n\nTight."


def test_a_complete_synthesis_is_not_truncated(fake_llm):
    fake_llm(chunks=["all ", "of it"])

    _, update = run_synthesizer_streamed()

    assert update["briefing"] == "all of it"
    assert update["briefing_truncated"] is False


def test_synthesizer_returns_partial_prose_when_the_stream_dies_mid_iteration(fake_llm):
    """Both LLM nodes degrade, but on different terms — and the difference is deliberate.

    ``test_planner_degrades_to_default_tools_when_the_llm_call_fails`` pins the node one
    step earlier degrading *unconditionally*, because ``DEFAULT_TOOLS`` is always there to
    fall back to. The synthesizer has no fallback prose, so it can only degrade once the
    stream has produced some. See ADR-0002.
    """
    fake_llm(chunks=["## Monaco\n\n", "Tight, slow, ", "unforgiv"], stream_raises_after=2)

    deltas, update = run_synthesizer_streamed()

    assert update["briefing"] == "## Monaco\n\nTight, slow, "
    assert update["briefing_truncated"] is True
    assert [d["content"] for d in deltas] == ["## Monaco\n\n", "Tight, slow, "]


def test_a_truncated_synthesis_still_reports_the_run_complete(fake_llm):
    """Truncation is a property of the Briefing, not a phase of the pipeline.

    The pipeline reached the end either way, so the Step stays ``complete`` and ``error``
    keeps meaning exactly "Resolution failed".
    """
    fake_llm(chunks=["some prose"], stream_raises_after=1)

    _, update = run_synthesizer_streamed()

    assert update["current_step"] == "complete"
    assert update["briefing_truncated"] is True


def test_synthesizer_propagates_a_failure_before_any_prose_exists(fake_llm):
    """The ≥1 Delta rule: no prose is not a Truncated Briefing, it is no Briefing.

    There is nothing to degrade to, so the exception travels and the run surfaces as an
    error rather than delivering an empty Briefing marked unfinished.
    """
    fake_llm(chunks=["never reached"], stream_raises_after=0)

    with pytest.raises(RuntimeError, match="stream died mid-iteration"):
        run_synthesizer_streamed()


def test_chunks_that_carried_no_prose_do_not_count_as_a_truncated_briefing(fake_llm):
    """The ≥1 Delta rule is about prose, not chunk count.

    Gemini emits metadata-only chunks whose ``.text`` is empty. Counting those as prose
    would return an empty briefing marked truncated, which the transport then drops on
    its ``if briefing:`` guard — ending the stream with no ``briefing``, no ``complete``
    and no ``error``, leaving the client waiting on a stream that is already over.
    """
    fake_llm(chunks=["", ""], stream_raises_after=2)

    with pytest.raises(RuntimeError, match="stream died mid-iteration"):
        run_synthesizer_streamed()


def test_the_llm_client_is_built_with_a_timeout_and_a_bounded_attempt_count():
    """The library defaults are ``timeout=None`` and six attempts, so an unanswered call held
    a worker thread forever and a flaky one was paid for six times. ``max_retries`` is the
    SDK's *attempt* count, first request included — see the note in config.py.
    """
    from config import LLM_MAX_ATTEMPTS, LLM_TIMEOUT_SECONDS

    assert graph_module.llm.timeout == LLM_TIMEOUT_SECONDS
    assert graph_module.llm.max_retries == LLM_MAX_ATTEMPTS


_GEMINI_REPLY = {
    "candidates": [
        {"content": {"role": "model", "parts": [{"text": "[]"}]}, "finishReason": "STOP"}
    ]
}

_GEMINI_OVERLOADED = {
    "error": {"code": 503, "message": "The model is overloaded.", "status": "UNAVAILABLE"}
}


def _serve_gemini(monkeypatch, status: int = 200) -> list[httpx.Request]:
    """Answer the real client's requests in process, and keep each one as it left the SDK.

    At 200 the planner's ``generateContent`` gets one JSON reply and the synthesizer's
    ``streamGenerateContent`` the same reply as one server-sent event; any other status gets
    Gemini's error body. Driving the nodes rather than the client is the point: it pins what
    each call site passes, which the client's constructor kwargs say nothing about. The SDK's
    backoff between attempts is zeroed, so a retried call costs no real sleep.
    """
    sent: list[httpx.Request] = []

    def gemini(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        if status != 200:
            return httpx.Response(status, json=_GEMINI_OVERLOADED)
        if request.url.path.endswith(":streamGenerateContent"):
            return httpx.Response(200, text=f"data: {json.dumps(_GEMINI_REPLY)}\n\n")
        return httpx.Response(200, json=_GEMINI_REPLY)

    monkeypatch.setattr(
        graph_module.llm.client._api_client,
        "_httpx_client",
        httpx.Client(transport=httpx.MockTransport(gemini)),
    )
    retry_args = genai_api_client.retry_args
    monkeypatch.setattr(
        genai_api_client,
        "retry_args",
        lambda options: {**retry_args(options), "wait": lambda _retry_state: 0},
    )
    return sent


def _plan() -> dict:
    return planner_node(make_state(race_info=make_race_info()))


def _synthesize() -> None:
    run_synthesizer_streamed()


@pytest.mark.parametrize(
    ("run_node", "read_timeout"),
    [(_plan, LLM_TIMEOUT_SECONDS), (_synthesize, SYNTHESIZER_TIMEOUT_SECONDS)],
    ids=["planner", "synthesizer"],
)
def test_each_call_gives_gemini_the_runs_deadline_and_its_own_read_timeout(
    monkeypatch, run_node, read_timeout
):
    """google-genai sends ``X-Server-Timeout: ceil(timeout)`` unless one is already set, and
    Gemini holds the whole request to it, a stream included: with only ``timeout=15`` it ended
    every synthesis with ``504 DEADLINE_EXCEEDED`` 15.0s in, mid-briefing. The per-read timeout
    is the wait for the first byte, which is the model's thinking time: the synthesizer's
    first chunk took 9.1s in one run and outlasted both 15s attempts in the next, so it reads
    for longer than the planner. Read off the request as it leaves the SDK.
    """
    sent = _serve_gemini(monkeypatch)

    run_node()

    [request] = sent
    # Exactly one: the SDK checks for the header case-sensitively, so a differently cased key
    # would go out alongside its own. A call-time timeout must not bring the SDK's back either.
    assert request.headers.get_list("x-server-timeout") == [str(BRIEFING_DEADLINE_SECONDS)]
    assert request.extensions["timeout"]["read"] == read_timeout


def test_the_planner_retries_a_503_once(monkeypatch):
    """Two attempts, then the default tools: the planner is cheap to repeat and the pipeline
    works without it, so it keeps the retry the synthesizer gave up."""
    sent = _serve_gemini(monkeypatch, status=503)

    result = _plan()

    assert len(sent) == 2
    assert result["tasks"] == DEFAULT_TOOLS


def test_the_synthesizer_makes_one_attempt_against_a_503(monkeypatch):
    """Two 30s attempts would not fit the deadline (32 + 25 + 62 > 90), so the synthesizer
    has one. The price is that a 503 while its stream opens ends the run on the error event,
    where a second attempt used to try again."""
    sent = _serve_gemini(monkeypatch, status=503)

    with pytest.raises(genai_errors.ServerError):
        _synthesize()

    assert len(sent) == 1


@pytest.mark.parametrize(
    ("run_node", "thinking_config"),
    [(_plan, {"thinking_level": "LOW"}), (_synthesize, None)],
    ids=["planner", "synthesizer"],
)
def test_only_the_planner_turns_geminis_thinking_down(monkeypatch, run_node, thinking_config):
    """gemini-3.6-flash thinks before its first byte, and the client's per-read timeout is
    what that wait runs into: the planner once timed out at 15.04s. It only picks names off a
    list, so low thinking is enough; the synthesizer writes the prose and keeps the default.
    The snake_case key is what google-genai puts on the wire, which proto3's JSON parsing
    accepts — asserted as sent, not as the kwarg the node passes.
    """
    sent = _serve_gemini(monkeypatch)

    run_node()

    [request] = sent
    generation_config = json.loads(request.content).get("generationConfig", {})
    assert generation_config.get("thinkingConfig") == thinking_config


def test_standings_is_a_registered_tool():
    from agent.graph import all_tools

    assert "get_championship_standings" in {tool.name for tool in all_tools}


def test_standings_is_in_the_default_tools():
    """The synthesizer prompt asks for a Championship Context section unconditionally, so
    the degraded path — a 429'd planner falling back to DEFAULT_TOOLS — needs it too.
    """
    from agent.prompts import DEFAULT_TOOLS

    assert "get_championship_standings" in DEFAULT_TOOLS


def test_driver_form_is_in_the_default_tools():
    """The Form Guide is written in every briefing, so the degraded plan needs its data too."""
    from agent.prompts import DEFAULT_TOOLS

    assert "get_driver_form" in DEFAULT_TOOLS


def test_the_planner_advertises_the_form_window_the_tool_is_given():
    """The planner chooses by description: it must say every driver, and the window it names
    must be the one `_build_tool_args` passes."""
    from agent.prompts import PLANNER_PROMPT

    args = _build_tool_args("get_driver_form", make_race_info())

    assert (
        f"- get_driver_form: Recent form for every driver: last {args['num_races']} Grands Prix\n"
        in PLANNER_PROMPT
    )
    assert "Verstappen" not in PLANNER_PROMPT


def test_the_planner_prompt_advertises_every_registered_tool():
    """A tool the planner is never told about is a tool the planner cannot select."""
    from agent.graph import all_tools
    from agent.prompts import PLANNER_PROMPT

    for tool in all_tools:
        assert tool.name in PLANNER_PROMPT


def test_standings_is_invoked_with_the_current_year():
    """From round 2 of a season onward, "current standings" means the season under way,
    as of the briefing's cutoff. Only before round 1 has run does the current season have
    nothing to report — see the retry test below for that case.
    """
    from agent.graph import _invoke_tool
    from tests.factories import make_race_info, make_tool

    fake = make_tool("get_championship_standings", {"drivers": []})
    race_info = make_race_info(year=2026, as_of="2026-09-30T00:00:00+00:00")

    _invoke_tool(fake, "get_championship_standings", race_info)

    assert fake.calls == [{"year": 2026, "as_of": "2026-09-30T00:00:00+00:00"}]


def test_standings_retries_with_the_previous_season_when_this_one_has_not_started():
    """Pre-season, `get_championship_standings` reports `reason=SEASON_NOT_STARTED`
    alongside its error. A briefing should still get last year's final classification
    rather than nothing, so the year - 1 retry must fire on that structural marker.
    """
    from agent.graph import _invoke_tool
    from tools.standings_tools import SEASON_NOT_STARTED

    class _RetryingTool:
        name = "get_championship_standings"

        def __init__(self) -> None:
            self.calls: list[dict] = []

        def invoke(self, args: dict) -> dict:
            self.calls.append(args)
            if args["year"] == 2026:
                return {
                    "error": "No completed races found for 2026 season yet",
                    "reason": SEASON_NOT_STARTED,
                }
            return {"year": 2025, "drivers": [{"driver_code": "NOR"}]}

    fake = _RetryingTool()
    race_info = make_race_info(year=2026, as_of="2026-03-06T01:30:00+00:00")

    result = _invoke_tool(fake, "get_championship_standings", race_info)

    # The same cutoff both times: the previous season as it stood then, which is its final table.
    assert fake.calls == [
        {"year": 2026, "as_of": "2026-03-06T01:30:00+00:00"},
        {"year": 2025, "as_of": "2026-03-06T01:30:00+00:00"},
    ]
    assert result["success"] is True
    assert result["data"]["year"] == 2025


def test_standings_does_not_retry_on_a_transport_failure():
    """A transient failure (e.g. an HTTP 429) carries no `reason` key, so it must not
    trigger the previous-season retry — substituting last season's final table for a
    briefing that asked for current standings is worse than serving the error, which the
    synthesizer already knows how to omit.
    """
    from agent.graph import _invoke_tool

    class _FailingTool:
        name = "get_championship_standings"

        def __init__(self) -> None:
            self.calls: list[dict] = []

        def invoke(self, args: dict) -> dict:
            self.calls.append(args)
            return {"error": "Failed to get championship standings: HTTP 429"}

    fake = _FailingTool()
    race_info = make_race_info(year=2026, as_of="2026-09-30T00:00:00+00:00")

    result = _invoke_tool(fake, "get_championship_standings", race_info)

    assert fake.calls == [{"year": 2026, "as_of": "2026-09-30T00:00:00+00:00"}]
    assert result["success"] is False
    assert result["data"]["error"] == "Failed to get championship standings: HTTP 429"


# ── Race context in the prompts ──────────────────────────────────────────────
#
# The Sakhir defect's last link: the synthesizer was handed "Generate briefing for Bahrain
# Grand Prix 2026" and the tool payloads, and nothing else, so it described the venue the name
# made it think of. Both prompts now carry the resolved race as an authoritative block.

SEPANG = make_race_info(
    name="Bahrain Grand Prix",
    year=2026,
    round=16,
    track_id="my-1999",
    circuit_name="Sepang International Circuit",
    circuit_length_m=5543,
    location="Kuala Lumpur",
    country="Bahrain",
    date="2026-10-04 00:00:00",
    is_upcoming=True,
    as_of="2026-09-30T00:00:00+00:00",
    sessions=[
        {"name": "Practice 1", "start": "2026-10-02T04:30:00+00:00"},
        {"name": "Race", "start": "2026-10-04T07:00:00+00:00"},
    ],
)

SECTIONS = [
    "## Track Profile",
    "## Championship Context",
    "## Form Guide",
    "## Key Storylines",
    "## Weather Watch",
    "## Predictions",
]


def _synthesizer_prompt(fake_llm, race_info) -> tuple[str, str]:
    llm = fake_llm("briefing")
    run_synthesizer_streamed(
        make_state(
            race_info=race_info,
            tool_results=[{"tool_name": "get_track_info", "success": True, "data": {}}],
        )
    )
    system, human = llm.calls[0]
    return system.content, human.content


@freeze_time("2026-09-30T09:00:00")
def test_the_synthesizer_is_told_the_circuit_the_race_is_actually_at(fake_llm):
    system, human = _synthesizer_prompt(fake_llm, SEPANG)

    assert "Grand Prix: Bahrain Grand Prix 2026, round 16" in system
    assert "Circuit: Sepang International Circuit (5.543 km)" in system
    assert "Location: Kuala Lumpur (calendar country: Bahrain)" in system
    assert "Practice 1 2026-10-02 04:30 UTC" in system
    assert "Race 2026-10-04 07:00 UTC" in system
    assert "Status: upcoming" in system
    assert "Briefing as of: 2026-09-30 00:00 UTC" in system
    assert "Today: 2026-09-30" in system
    assert "Sepang International Circuit" in human


@freeze_time("2026-09-30T09:00:00")
def test_the_synthesizer_is_told_a_past_race_is_briefed_from_before_its_weekend(fake_llm):
    past = make_race_info(is_upcoming=False, as_of="2026-06-05T11:30:00+00:00")

    system, _ = _synthesizer_prompt(fake_llm, past)

    assert "Status: already run — pre-race briefing as of its first session" in system
    assert "Briefing as of: 2026-06-05 11:30 UTC" in system
    assert "Not gathered for a race that has been run: weather forecast, news" in system


@freeze_time("2026-09-30T09:00:00")
def test_a_track_with_no_circuit_file_is_named_as_unknown_not_guessed(fake_llm):
    system, _ = _synthesizer_prompt(
        fake_llm, make_race_info(track_id=None, circuit_name=None, circuit_length_m=None)
    )

    assert "Circuit: not in this app's circuit data — do not name one" in system


def test_the_synthesizer_keeps_its_six_sections_in_order():
    """The structure is a contract with the reader and the frontend's card; the new rules are
    additions around it, never a change to it."""
    from agent.prompts import SYNTHESIZER_PROMPT

    positions = [SYNTHESIZER_PROMPT.index(section) for section in SECTIONS]
    assert positions == sorted(positions)


@freeze_time("2026-09-30T09:00:00")
def test_the_planner_sees_the_same_race_context(fake_llm):
    llm = fake_llm("[]")

    planner_node(make_state(race_info=SEPANG))

    system = llm.calls[0][0].content
    assert "Circuit: Sepang International Circuit (5.543 km)" in system
    assert "Briefing as of: 2026-09-30 00:00 UTC" in system
    assert "Today: 2026-09-30" in system


def test_a_failed_tool_logs_its_error(caplog):
    """A tool fails by returning ``{"error": ...}``, not by raising, so the
    ``logger.exception`` in ``_invoke_tool`` never sees it. Standings failed in every
    briefing measured on 2026-09-30 and nothing in the log said why.
    """
    error = "Failed to get championship standings: OpenF1 session_result returned HTTP 429"
    fake = make_tool("get_championship_standings", {"error": error})

    with caplog.at_level(logging.WARNING, logger="agent.graph"):
        result = _invoke_tool(fake, "get_championship_standings", make_race_info())

    assert result["success"] is False
    assert "Tool 'get_championship_standings' failed" in caplog.text
    assert error in caplog.text


def test_a_recovered_pre_season_miss_is_not_logged_as_a_failure(caplog):
    """The pre-season miss is an answer the previous-season retry handles; only the
    final outcome is worth a warning.
    """
    from tools.standings_tools import SEASON_NOT_STARTED

    class _PreSeasonTool:
        name = "get_championship_standings"

        def invoke(self, args: dict) -> dict:
            if args["year"] == 2026:
                return {"error": "No completed races yet", "reason": SEASON_NOT_STARTED}
            return {"year": 2025, "drivers": []}

    race_info = make_race_info(year=2026, as_of="2026-03-06T01:30:00+00:00")

    with caplog.at_level(logging.WARNING, logger="agent.graph"):
        result = _invoke_tool(_PreSeasonTool(), "get_championship_standings", race_info)

    assert result["success"] is True
    assert caplog.text == ""
