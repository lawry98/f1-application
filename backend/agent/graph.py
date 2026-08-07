"""LangGraph agent workflow: resolver -> planner -> tool_executor -> synthesizer."""

import copy
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.config import get_stream_writer
from langgraph.graph import END, StateGraph

from agent.prompts import DEFAULT_TOOLS, PLANNER_PROMPT, SYNTHESIZER_PROMPT
from agent.state import AgentState, RaceInfo, ToolResult
from config import (
    COUNTRY_CODE_MAP,
    EXECUTOR_MAX_WORKERS,
    GOOGLE_API_KEY,
    LLM_MODEL,
)
from tools.f1_data_tools import get_circuit_winners, get_recent_top_finishers
from tools.fastf1_tools import get_driver_form, get_recent_race_results, get_track_info
from tools.race_resolver import resolve_next_race
from tools.search_tools import search_f1_news
from tools.standings_tools import SEASON_NOT_STARTED, get_championship_standings
from tools.weather_tools import get_race_weather

logger = logging.getLogger(__name__)

all_tools = [
    get_track_info,
    get_recent_top_finishers,
    get_championship_standings,
    get_circuit_winners,
    search_f1_news,
    get_race_weather,
    get_driver_form,
    get_recent_race_results,
]

# Cross-request cache for the historical race-data tools — the finishing order of a
# past race does not change, and these six are the dominant share of the gathering
# stage's wall clock. Weather (a forecast) and news (current by definition) are
# deliberately absent: serving either stale is worse than refetching. Only successful
# results are stored, so a transient upstream failure cannot poison later briefings.
# Deliberately cross-request, unlike the per-request schedule cache routes.py clears
# — see ADR-0003. Key space is bounded (~races x 6 tools x a few years), so there is
# no eviction.
CACHEABLE_TOOLS = frozenset(
    {
        "get_track_info",
        "get_recent_top_finishers",
        "get_championship_standings",
        "get_circuit_winners",
        "get_driver_form",
        "get_recent_race_results",
    }
)

# Of the six cacheable tools, these four answer a question whose meaning shifts
# with the calendar even though the race data behind it is immutable — it is the
# query, not the data, that is date-relative:
#   - get_recent_top_finishers: "the season's most recent completed race" — a new
#     race weekend changes which race that is.
#   - get_driver_form: "the last N races" — same sliding window.
#   - get_circuit_winners: "the last `years_back` years" — the window's boundary
#     year advances every 1 January.
#   - get_championship_standings: takes an explicit year, but its answer grows with
#     every race of that year. Without a date component the args ({"year": 2026})
#     never change, so one early-season fetch would be served as "current standings"
#     for the rest of the season.
# Their cache key includes today's date so a new day (or, for get_circuit_winners,
# a new year) forces a refetch instead of serving an answer that was only true
# yesterday. The other two tools (get_track_info, get_recent_race_results) take an
# explicit year and are pure functions of their arguments — they need no date
# component.
DATE_DEPENDENT_TOOLS = frozenset(
    {
        "get_recent_top_finishers",
        "get_driver_form",
        "get_circuit_winners",
        "get_championship_standings",
    }
)

_result_cache_lock = threading.Lock()
_result_cache: dict[tuple, dict] = {}


def clear_result_cache() -> None:
    """Clear all cached tool results."""
    with _result_cache_lock:
        _result_cache.clear()


# No temperature argument — gemini-3.6-flash uses fixed sampling defaults and ignores one.
# See the note in config.py.
llm = ChatGoogleGenerativeAI(
    model=LLM_MODEL,
    api_key=GOOGLE_API_KEY,
)


def resolver_node(state: AgentState) -> dict[str, Any]:
    """Resolve the user query to a specific race using deterministic lookup."""
    query = state.get("race_query", "")
    result = resolve_next_race(query)

    if "error" in result:
        # `error` is contractually safe to display; `detail` is log-only and must
        # never reach the user-facing briefing field.
        detail = result.get("detail")
        if detail:
            logger.warning(
                "Race resolution failed for '%s': %s (detail: %s)",
                query,
                result["error"],
                detail,
            )
        else:
            logger.warning("Race resolution failed for '%s': %s", query, result["error"])
        return {
            "race_info": None,
            "current_step": "error",
            "briefing": result["error"],
        }

    race_info = RaceInfo(
        name=result["name"],
        year=result["year"],
        circuit_id=result["circuit_id"],
        location=result["location"],
        country=result["country"],
        date=result["date"],
        is_upcoming=result["is_upcoming"],
        historical_year=result["historical_year"],
    )
    logger.info(
        "Resolved to: %s %d (upcoming=%s)",
        race_info["name"],
        race_info["year"],
        race_info["is_upcoming"],
    )

    return {"race_info": race_info, "current_step": "planning"}


def planner_node(state: AgentState) -> dict[str, Any]:
    """Select which tools to run based on resolved race info."""
    race_info = state["race_info"]

    prompt = PLANNER_PROMPT.format(
        race_name=race_info["name"],
        race_year=race_info["year"],
        race_location=race_info["location"],
        race_country=race_info["country"],
        race_date=race_info["date"],
        is_upcoming=race_info["is_upcoming"],
        historical_year=race_info["historical_year"],
    )

    messages = [
        SystemMessage(content=prompt),
        HumanMessage(content=f"Select tools for {race_info['name']} {race_info['year']}"),
    ]

    try:
        response = llm.invoke(messages)
    except Exception as exc:
        # Broad on purpose, and deliberately separate from the parse block below. Any
        # transport or API failure — a free-tier 429 above all — should degrade to the
        # default tools rather than take the whole briefing down with an HTTP 500. The
        # planner is an optimisation; the pipeline works without it.
        logger.warning(
            "Planner LLM call failed (%s: %s); falling back to default tools",
            type(exc).__name__,
            exc,
        )
        return {"tasks": DEFAULT_TOOLS, "current_step": "gathering"}

    try:
        # `.text`, not `.content`: Gemini 3 returns content as a list of blocks, so
        # `.content` is a list here rather than a str. `.text` flattens to the string
        # for every provider and content shape.
        content = response.text
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        tasks = json.loads(content.strip())
        if isinstance(tasks, list) and all(isinstance(t, str) for t in tasks):
            # A repeated name isn't harmless: tool_executor_node would submit it twice
            # (a wasted, sometimes paid, call for something like search_f1_news), emit two
            # tool_result events for one name, and collide two chips in the loading
            # panel's footer, whose result lookup is keyed by tool name. dict.fromkeys
            # dedupes while keeping first-appearance order — the plan's order is now the
            # order the footer renders in, and a set would shuffle it between runs.
            tasks = list(dict.fromkeys(tasks))
            logger.info("Planner selected %d tools: %s", len(tasks), tasks)
            return {"tasks": tasks, "current_step": "gathering"}
    except (json.JSONDecodeError, AttributeError, TypeError, IndexError):
        # Deliberately narrow. A bare `except Exception` here once hid a genuine type
        # error behind the default-tools fallback, which looks like a working planner.
        pass

    logger.warning("Planner failed to parse response; falling back to default tools")
    return {"tasks": DEFAULT_TOOLS, "current_step": "gathering"}


def _build_tool_args(task_name: str, race_info: dict) -> dict[str, Any] | None:
    """Build the invocation arguments for a tool, or None when no handler exists.

    Also the cache identity: two queries that resolve to the same race produce
    identical args here, which is what lets them share a cache entry.
    """
    if task_name == "get_track_info":
        return {"circuit_name": race_info["name"], "year": race_info["historical_year"]}
    if task_name == "get_recent_top_finishers":
        return {"year": race_info["historical_year"]}
    if task_name == "get_championship_standings":
        # The season currently underway, not `historical_year` (year - 1): from round 2
        # onward, "current standings" means this season's table. `historical_year` only
        # applies before round 1 — `_invoke_tool` retries with it in that one case.
        return {"year": race_info["year"]}
    if task_name == "get_circuit_winners":
        return {"circuit_name": race_info["name"], "years_back": 3}
    if task_name == "search_f1_news":
        return {"query": f"{race_info['name']} {race_info['year']}", "max_results": 5}
    if task_name == "get_race_weather":
        country_code = COUNTRY_CODE_MAP.get(race_info["country"], "US")
        return {"city": race_info["location"], "country_code": country_code}
    if task_name == "get_driver_form":
        # Hardcoded to Verstappen — the planner prompt advertises exactly this scope.
        return {"driver_code": "VER", "year": race_info["historical_year"], "num_races": 5}
    if task_name == "get_recent_race_results":
        return {"event_name": race_info["name"], "year": race_info["historical_year"]}
    return None


def _invoke_with_cache(tool: Any, task_name: str, args: dict) -> ToolResult:
    """Invoke a tool with explicit args, serving from the result cache when possible.

    Split out of ``_invoke_tool`` so the standings retry below can make a second,
    separately-keyed cache-aware call rather than bypassing the cache entirely.
    The lock is released during the invocation, as in tools/schedule_cache.py:
    concurrent misses on the same key both fetch, and the last write wins.
    """
    cacheable = task_name in CACHEABLE_TOOLS
    # The date belongs in the key, not the args: `_build_tool_args` stays a pure
    # function of race_info, and the date-dependent tools (see DATE_DEPENDENT_TOOLS
    # above) get an extra key component that changes once a day, forcing a refetch
    # instead of serving yesterday's "most recent" race.
    date_component = date.today().isoformat() if task_name in DATE_DEPENDENT_TOOLS else None
    cache_key = (task_name, tuple(sorted(args.items())), date_component)

    if cacheable:
        with _result_cache_lock:
            if cache_key in _result_cache:
                # Only successes are ever stored, so a hit is always success=True.
                # deepcopy: the cache is cross-request and lives for the process
                # lifetime, so handing out the stored dict by reference would let
                # any consumer that mutates ToolResult["data"] in place silently
                # corrupt every later hit. No consumer does today, but the cost of
                # a copy is nothing next to the fetch it replaces.
                return ToolResult(
                    tool_name=task_name,
                    success=True,
                    data=copy.deepcopy(_result_cache[cache_key]),
                    cached=True,
                )

    result = tool.invoke(args)
    success = "error" not in result

    if cacheable and success:
        with _result_cache_lock:
            # deepcopy on the way in too: the caller keeps `result` and may pass it
            # on or (in principle) mutate it, so the cache must hold its own private
            # copy rather than the same object the miss caller received.
            _result_cache[cache_key] = copy.deepcopy(result)

    return ToolResult(tool_name=task_name, success=success, data=result, cached=False)


def _invoke_tool(tool: Any, task_name: str, race_info: dict) -> ToolResult:
    """Invoke a single tool with arguments derived from race_info; never raises."""
    try:
        args = _build_tool_args(task_name, race_info)
        if args is None:
            return ToolResult(
                tool_name=task_name,
                success=False,
                data={"error": f"No handler for tool: {task_name}"},
                cached=False,
            )

        outcome = _invoke_with_cache(tool, task_name, args)

        # Pre-season fallback, and only that. A season that has not run yet has no
        # standings to report, so last year's final classification is the sensible
        # substitute. Keyed off the structural `reason` marker rather than the error
        # text: a transport failure (an HTTP 429, say) must NOT fall back, because
        # serving last season's table labelled as current is worse than serving the
        # error, which the synthesizer already knows how to omit.
        if (
            task_name == "get_championship_standings"
            and outcome["data"].get("reason") == SEASON_NOT_STARTED
        ):
            outcome = _invoke_with_cache(tool, task_name, {"year": race_info["historical_year"]})

        return outcome
    except Exception as exc:
        logger.exception("Tool '%s' raised an unexpected exception: %s", task_name, exc)
        return ToolResult(
            tool_name=task_name, success=False, data={"error": str(exc)}, cached=False
        )


def tool_executor_node(state: AgentState) -> dict[str, Any]:
    """Execute all planned tools in parallel and collect results."""
    race_info = state["race_info"]
    tasks = state.get("tasks", [])
    # Written per completion rather than per node return: `as_completed` already hands
    # results over one at a time, and the node's return is the only other chance the
    # transport gets — which is a burst of every chip at once after a long silence.
    writer = get_stream_writer()

    def report(result: ToolResult) -> None:
        writer(
            {
                "kind": "tool_result",
                "tool": result["tool_name"],
                "success": result["success"],
                "cached": result["cached"],
            }
        )

    tool_map = {tool.name: tool for tool in all_tools}
    tool_results: list[ToolResult] = []

    with ThreadPoolExecutor(max_workers=EXECUTOR_MAX_WORKERS) as pool:
        futures = {}
        for task_name in tasks:
            if task_name not in tool_map:
                logger.warning("Unknown tool requested: '%s'", task_name)
                unknown = ToolResult(
                    tool_name=task_name,
                    success=False,
                    data={"error": f"Unknown tool: {task_name}"},
                    cached=False,
                )
                tool_results.append(unknown)
                report(unknown)
                continue
            future = pool.submit(_invoke_tool, tool_map[task_name], task_name, race_info)
            futures[future] = task_name

        # This loop body runs in the node's own thread, not in a pool worker —
        # `as_completed` yields control back to its caller rather than running inline in
        # whichever future finished. That is what makes calling the writer here safe.
        for future in as_completed(futures):
            result = future.result()
            tool_results.append(result)
            report(result)

    successes = sum(1 for tr in tool_results if tr["success"])
    logger.info("Tool executor: %d/%d tools succeeded", successes, len(tool_results))

    return {"tool_results": tool_results, "current_step": "synthesizing"}


def synthesizer_node(state: AgentState) -> dict[str, Any]:
    """Synthesize tool results into the final race briefing."""
    tool_results = state.get("tool_results", [])
    race_info = state.get("race_info")

    if not tool_results:
        return {
            "briefing": "No data available to generate briefing",
            "briefing_truncated": False,
            "current_step": "complete",
        }

    results_text = json.dumps(
        [
            {"tool": tr["tool_name"], "success": tr["success"], "data": tr["data"]}
            for tr in tool_results
        ],
        indent=2,
    )

    messages = [
        SystemMessage(content=SYNTHESIZER_PROMPT.format(tool_results=results_text)),
        HumanMessage(content=f"Generate briefing for {race_info['name']} {race_info['year']}"),
    ]

    # No-ops when the graph is invoked rather than streamed, so /api/briefing needs no
    # special-casing. It does require an ambient graph run, which is why the tests that
    # reach this node drive it through one instead of calling it directly.
    writer = get_stream_writer()
    chunks: list[str] = []

    try:
        for chunk in llm.stream(messages):
            # `.text` rather than `.content` — see the note in planner_node. A Briefing is
            # a string; `.content` would hand the API a list of Gemini content blocks.
            text = chunk.text
            chunks.append(text)
            writer({"kind": "briefing_delta", "content": text})
    except Exception as exc:
        # Error-as-value, extended to the last node in the pipeline that still raised.
        # With prose in hand a reader is better served by an unfinished briefing than by
        # an error; with none there is no briefing to deliver, so the failure travels.
        # The step stays "complete" on purpose — see ADR-0002 before "fixing" this.
        #
        # Broad on purpose, like the planner's transport block above and unlike its parse
        # block: any provider failure should truncate. Enumerating provider exception
        # types is the classify-by-exception-type approach the error-sanitising work
        # rejected — a new upstream library would quietly stop being handled.
        #
        # The test is prose, not chunk count: Gemini emits metadata-only chunks whose
        # `.text` is empty, and an empty briefing marked truncated would be dropped by the
        # transport's `if briefing:` guard, ending the stream with nothing at all.
        partial = "".join(chunks)
        if not partial:
            raise
        logger.warning(
            "Synthesizer stream failed after %d deltas (%s: %s); serving a truncated briefing",
            len(chunks),
            type(exc).__name__,
            exc,
        )
        return {
            "briefing": partial,
            "briefing_truncated": True,
            "current_step": "complete",
        }

    briefing = "".join(chunks)
    logger.info("Synthesizer produced %d chars", len(briefing))

    return {"briefing": briefing, "briefing_truncated": False, "current_step": "complete"}


def should_continue_after_resolver(state: AgentState) -> str:
    """Route after resolver: continue to planner or end with error."""
    if state.get("current_step") == "error":
        return END
    return "planner"


workflow = StateGraph(AgentState)

workflow.add_node("resolver", resolver_node)
workflow.add_node("planner", planner_node)
workflow.add_node("tool_executor", tool_executor_node)
workflow.add_node("synthesizer", synthesizer_node)

workflow.set_entry_point("resolver")
# This edge is the pipeline's only error gate: downstream nodes assume race_info is set.
workflow.add_conditional_edges(
    "resolver", should_continue_after_resolver, {END: END, "planner": "planner"}
)
workflow.add_edge("planner", "tool_executor")
workflow.add_edge("tool_executor", "synthesizer")
workflow.add_edge("synthesizer", END)

agent = workflow.compile()
