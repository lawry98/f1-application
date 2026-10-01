"""LangGraph agent workflow: resolver -> planner -> tool_executor -> synthesizer."""

import copy
import json
import logging
import threading
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import date
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.config import get_stream_writer
from langgraph.graph import END, StateGraph

from agent.budget import BriefingStoppedError, budget_from
from agent.prompts import DEFAULT_TOOLS, PLANNER_PROMPT, SYNTHESIZER_PROMPT
from agent.state import AgentState, RaceInfo, ToolResult
from config import (
    EXECUTOR_MAX_WORKERS,
    GOOGLE_API_KEY,
    LLM_MAX_ATTEMPTS,
    LLM_MODEL,
    LLM_TIMEOUT_SECONDS,
    TOOL_FANOUT_TIMEOUT_SECONDS,
)
from tools.circuit_winners import circuit_coordinates
from tools.cutoff import parse_utc
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
# — see ADR-0003. Key space is bounded (~races x 6 tools x a few cutoffs), so there
# is no eviction.
#
# The key is the tool's args and nothing else. The five tools whose answer moves with the
# calendar — the latest race here, the latest race anywhere, the last N races, the winners
# window, the standings table — all take the briefing's `as_of`, and that is their date
# component. An upcoming race's `as_of` is the start of today, so its key rolls over daily
# and a new race weekend is picked up the day after it is held — what a separate
# today's-date component used to do. A past race's `as_of` is its first session, fixed,
# and what came before it cannot change, so its entry is good for the life of the
# process; a date component on top would only refetch that immutable answer every day.
# `get_track_info` carries no cutoff: it is this event's calendar row and its circuit
# file, pure functions of its args.
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

# A race that has been run is briefed as of its first session (ADR-0004). A forecast for
# that weekend, or today's news about it, would reach past the cutoff — so these are
# dropped from the plan whatever the planner chose, before the plan is announced.
UPCOMING_ONLY_TOOLS = frozenset({"get_race_weather", "search_f1_news"})

_result_cache_lock = threading.Lock()
_result_cache: dict[tuple, dict] = {}


def clear_result_cache() -> None:
    """Clear all cached tool results."""
    with _result_cache_lock:
        _result_cache.clear()


# No temperature argument — gemini-3.6-flash uses fixed sampling defaults and ignores one.
# See the note in config.py, which also carries the timeout arithmetic. `max_retries` is the
# SDK's attempt count, first request included, not a count of retries.
llm = ChatGoogleGenerativeAI(
    model=LLM_MODEL,
    api_key=GOOGLE_API_KEY,
    timeout=LLM_TIMEOUT_SECONDS,
    max_retries=LLM_MAX_ATTEMPTS,
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
        round=result["round"],
        circuit_id=result["circuit_id"],
        track_id=result["track_id"],
        circuit_name=result["circuit_name"],
        circuit_length_m=result["circuit_length_m"],
        location=result["location"],
        country=result["country"],
        date=result["date"],
        is_upcoming=result["is_upcoming"],
        as_of=result["as_of"],
        sessions=result["sessions"],
    )
    logger.info(
        "Resolved to: %s %d at %s (upcoming=%s, as_of=%s)",
        race_info["name"],
        race_info["year"],
        race_info["track_id"],
        race_info["is_upcoming"],
        race_info["as_of"],
    )

    return {"race_info": race_info, "current_step": "planning"}


def _utc_minute(iso: str) -> str:
    return parse_utc(iso).strftime("%Y-%m-%d %H:%M UTC")


def race_context(race_info: RaceInfo) -> str:
    """The resolved race as an authoritative block, for the planner and the synthesizer alike.

    Without it the synthesizer had only "Bahrain Grand Prix 2026" and described the track that
    name brought to mind — Sakhir — when the race is at Sepang. Every field is the resolver's;
    a circuit with no file is said to be unknown rather than left for the model to fill in.
    """
    length_m = race_info["circuit_length_m"]
    circuit = (
        f"{race_info['circuit_name']}" + (f" ({length_m / 1000:.3f} km)" if length_m else "")
        if race_info["circuit_name"]
        else "not in this app's circuit data — do not name one"
    )
    sessions = "; ".join(
        f"{session['name']} {_utc_minute(session['start'])}" for session in race_info["sessions"]
    )
    lines = [
        "Race context (authoritative):",
        f"- Grand Prix: {race_info['name']} {race_info['year']}, round {race_info['round']}",
        f"- Circuit: {circuit}",
        f"- Location: {race_info['location']} (calendar country: {race_info['country']})",
        f"- Sessions: {sessions or 'no session times published'}",
        "- Status: upcoming"
        if race_info["is_upcoming"]
        else "- Status: already run — pre-race briefing as of its first session",
        f"- Briefing as of: {_utc_minute(race_info['as_of'])}",
        f"- Today: {date.today().isoformat()}",
    ]
    if not race_info["is_upcoming"]:
        lines.append("- Not gathered for a race that has been run: weather forecast, news")
    return "\n".join(lines)


def _applicable(tasks: list[str], race_info: RaceInfo) -> list[str]:
    """The plan with the upcoming-only tools removed for a race that has been run."""
    if race_info["is_upcoming"]:
        return tasks
    return [task for task in tasks if task not in UPCOMING_ONLY_TOOLS]


def planner_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    """Select which tools to run based on resolved race info."""
    race_info = state["race_info"]

    budget = budget_from(config)
    if budget.stopped():
        # Nobody is waiting for this plan, so it is not worth a Gemini call. The defaults keep
        # the step's contract; the fan-out and the synthesizer stop on the same check.
        logger.info("Planner skipped, run already stopped (%s)", budget.stop_reason())
        return {"tasks": _applicable(DEFAULT_TOOLS, race_info), "current_step": "gathering"}

    prompt = PLANNER_PROMPT.format(race_context=race_context(race_info))

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
        return {"tasks": _applicable(DEFAULT_TOOLS, race_info), "current_step": "gathering"}

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
            tasks = _applicable(list(dict.fromkeys(tasks)), race_info)
            logger.info("Planner selected %d tools: %s", len(tasks), tasks)
            return {"tasks": tasks, "current_step": "gathering"}
    except (json.JSONDecodeError, AttributeError, TypeError, IndexError):
        # Deliberately narrow. A bare `except Exception` here once hid a genuine type
        # error behind the default-tools fallback, which looks like a working planner.
        pass

    logger.warning("Planner failed to parse response; falling back to default tools")
    return {"tasks": _applicable(DEFAULT_TOOLS, race_info), "current_step": "gathering"}


def _centroid(track_id: str | None) -> dict[str, float] | None:
    """A circuit's WGS84 centre from coordinates.json, or None when there is none to read."""
    if not track_id:
        return None
    try:
        return circuit_coordinates(track_id)
    except Exception as exc:
        logger.warning("No coordinates for %s (%s: %s)", track_id, type(exc).__name__, exc)
        return None


def _build_tool_args(task_name: str, race_info: dict) -> dict[str, Any] | None:
    """Build the invocation arguments for a tool, or None when no handler exists.

    Also the cache identity: two queries that resolve to the same race produce
    identical args here, which is what lets them share a cache entry. Every result tool
    takes the cutoff, `as_of`, and none takes a bare year to count back from — the cutoff
    is what keeps a past race's briefing from quoting anything after its Thursday.
    """
    as_of = race_info["as_of"]
    if task_name == "get_track_info":
        return {
            "year": race_info["year"],
            "round": race_info["round"],
            "track_id": race_info["track_id"],
        }
    if task_name == "get_recent_top_finishers":
        return {"as_of": as_of}
    if task_name == "get_championship_standings":
        # The race's own season as of the cutoff. Before its round 1 there is nothing to
        # count — `_invoke_tool` retries with the season before in that one case.
        return {"year": race_info["year"], "as_of": as_of}
    if task_name == "get_circuit_winners":
        return {
            "circuit_name": race_info["circuit_name"] or race_info["name"],
            "location": race_info["location"],
            "race_year": race_info["year"],
            "as_of": as_of,
            "years_back": 3,
        }
    if task_name == "search_f1_news":
        return {"query": f"{race_info['name']} {race_info['year']}", "max_results": 5}
    if task_name == "get_race_weather":
        # The circuit's own coordinates and the weekend's session times — never a geocoded
        # place name. No track means no coordinates, which the tool reports as an error.
        centroid = _centroid(race_info["track_id"])
        return {
            "lat": centroid["lat"] if centroid else None,
            "lon": centroid["lon"] if centroid else None,
            "sessions": race_info["sessions"],
        }
    if task_name == "get_driver_form":
        # Hardcoded to Verstappen — the planner prompt advertises exactly this scope.
        return {"driver_code": "VER", "as_of": as_of, "num_races": 5}
    if task_name == "get_recent_race_results":
        return {"track_id": race_info["track_id"], "as_of": as_of}
    return None


def _invoke_with_cache(tool: Any, task_name: str, args: dict) -> ToolResult:
    """Invoke a tool with explicit args, serving from the result cache when possible.

    Split out of ``_invoke_tool`` so the standings retry below can make a second,
    separately-keyed cache-aware call rather than bypassing the cache entirely.
    The lock is released during the invocation, as in tools/schedule_cache.py:
    concurrent misses on the same key both fetch, and the last write wins.
    """
    cacheable = task_name in CACHEABLE_TOOLS
    # Built only for a cacheable tool: weather's args carry a list, which cannot be hashed.
    cache_key = (task_name, tuple(sorted(args.items()))) if cacheable else None

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

        # Pre-season fallback, and only that. A season with nothing run by the cutoff has no
        # standings to report, so the previous season as of the same cutoff — its final
        # classification — is the sensible substitute, and its `year` says which it is.
        # Keyed off the structural `reason` marker rather than the error text: a transport
        # failure (an HTTP 429, say) must NOT fall back, because serving last season's table
        # labelled as current is worse than serving the error.
        if (
            task_name == "get_championship_standings"
            and outcome["data"].get("reason") == SEASON_NOT_STARTED
        ):
            outcome = _invoke_with_cache(
                tool, task_name, {"year": race_info["year"] - 1, "as_of": race_info["as_of"]}
            )

        # A tool fails by returning its error, not raising it, so the `except` below never
        # sees one — and standings once failed in every briefing with nothing logged. Only
        # the final outcome: the pre-season miss above is an answer the retry handles.
        if not outcome["success"]:
            logger.warning("Tool '%s' failed: %s", task_name, outcome["data"].get("error"))

        return outcome
    except Exception as exc:
        logger.exception("Tool '%s' raised an unexpected exception: %s", task_name, exc)
        return ToolResult(
            tool_name=task_name, success=False, data={"error": str(exc)}, cached=False
        )


# How often the fan-out looks up from its tools to check for a cancel. Only a hang-up needs
# it — the deadline and the fan-out cap are waited for exactly — so it trades a little idle
# wake-up for a closed tab being noticed within a quarter of a second.
CANCEL_POLL_SECONDS = 0.25


def _unfinished(task_name: str, reason: str) -> ToolResult:
    return ToolResult(tool_name=task_name, success=False, data={"error": reason}, cached=False)


def tool_executor_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    """Execute all planned tools in parallel and collect results.

    Waits for them only until the earlier of the run's deadline and the fan-out's own cap
    (``TOOL_FANOUT_TIMEOUT_SECONDS``), or until the run is cancelled. A tool still running
    then is reported ``{"error": "timed out"}`` and left behind: its thread cannot be killed,
    but nothing waits for it, and the synthesizer goes ahead with what arrived — the same
    partial-data path a failed tool takes.
    """
    race_info = state["race_info"]
    tasks = state.get("tasks", [])
    budget = budget_from(config)
    fanout_ends = budget.clock() + TOOL_FANOUT_TIMEOUT_SECONDS
    # Written per completion rather than per node return: results are collected one at a
    # time, and the node's return is the only other chance the transport gets — which is a
    # burst of every chip at once after a long silence.
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

    # Not `with ThreadPoolExecutor(...)`: its __exit__ waits for every thread, so one hung
    # tool would hold the node — and the briefing — however long it hung.
    pool = ThreadPoolExecutor(max_workers=EXECUTOR_MAX_WORKERS)
    try:
        futures = {}
        for task_name in tasks:
            if task_name not in tool_map:
                logger.warning("Unknown tool requested: '%s'", task_name)
                unknown = _unfinished(task_name, f"Unknown tool: {task_name}")
                tool_results.append(unknown)
                report(unknown)
                continue
            if budget.stopped():
                # Nobody will read this briefing; a tool started now is a paid call (Tavily)
                # or a FastF1 load for nothing.
                cancelled = _unfinished(task_name, "cancelled")
                tool_results.append(cancelled)
                report(cancelled)
                continue
            future = pool.submit(_invoke_tool, tool_map[task_name], task_name, race_info)
            futures[future] = task_name

        # `wait` rather than `as_completed(timeout=...)`, so a cancel is noticed within
        # CANCEL_POLL_SECONDS instead of only when the deadline itself arrives. The loop runs
        # in the node's own thread, not a pool worker, which is what makes the writer safe.
        pending = set(futures)
        while pending and not budget.stopped():
            left = min(budget.remaining(), fanout_ends - budget.clock())
            if left <= 0:
                break
            done, pending = wait(
                pending, timeout=min(left, CANCEL_POLL_SECONDS), return_when=FIRST_COMPLETED
            )
            for future in done:
                result = future.result()
                tool_results.append(result)
                report(result)

        # A tool that finished in the same instant the run stopped has a result; reporting it
        # as timed out would throw away data that is already paid for.
        for future in [future for future in pending if future.done()]:
            pending.discard(future)
            result = future.result()
            tool_results.append(result)
            report(result)

        if pending:
            why = budget.stop_reason() if budget.stopped() else "the fan-out's own cap"
            stragglers = sorted(futures[future] for future in pending)
            logger.warning(
                "Tool fan-out stopped (%s) with %d tool(s) unfinished: %s",
                why,
                len(stragglers),
                ", ".join(stragglers),
            )
            for task_name in stragglers:
                timed_out = _unfinished(task_name, "timed out")
                tool_results.append(timed_out)
                report(timed_out)
    finally:
        # Queued tools never start; running ones are abandoned rather than waited for.
        pool.shutdown(wait=False, cancel_futures=True)

    successes = sum(1 for tr in tool_results if tr["success"])
    logger.info("Tool executor: %d/%d tools succeeded", successes, len(tool_results))

    return {"tool_results": tool_results, "current_step": "synthesizing"}


def synthesizer_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    """Synthesize tool results into the final race briefing."""
    tool_results = state.get("tool_results", [])
    race_info = state.get("race_info")
    budget = budget_from(config)

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

    circuit = race_info["circuit_name"] or race_info["location"]
    messages = [
        SystemMessage(
            content=SYNTHESIZER_PROMPT.format(
                race_context=race_context(race_info), tool_results=results_text
            )
        ),
        HumanMessage(
            content=f"Generate the briefing for the {race_info['name']} {race_info['year']} "
            f"at {circuit}"
        ),
    ]

    # No-ops when the graph is invoked rather than streamed, so /api/briefing needs no
    # special-casing. It does require an ambient graph run, which is why the tests that
    # reach this node drive it through one instead of calling it directly.
    writer = get_stream_writer()
    chunks: list[str] = []

    if budget.stopped():
        # Before the call, so a run nobody is waiting for costs no Gemini call at all.
        raise BriefingStoppedError(f"Stopped before synthesis ({budget.stop_reason()})")

    stream = llm.stream(messages)
    stopped = False
    try:
        for chunk in stream:
            # `.text` rather than `.content` — see the note in planner_node. A Briefing is
            # a string; `.content` would hand the API a list of Gemini content blocks.
            text = chunk.text
            chunks.append(text)
            writer({"kind": "briefing_delta", "content": text})
            # Between chunks is the only point a synchronous stream can be stopped. Leaving
            # the loop lets the `finally` close it, which closes the HTTP response, so Gemini
            # stops generating — and billing — for a reader who has gone or run out of time.
            if budget.stopped():
                stopped = True
                break
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
    finally:
        stream.close()

    if stopped:
        # The same ADR-0002 rule as a provider failure, reached by a deadline or a hang-up
        # instead: prose in hand is a truncated briefing, none is a failure that travels.
        partial = "".join(chunks)
        if not partial:
            raise BriefingStoppedError(
                f"Synthesizer stopped before any prose ({budget.stop_reason()})"
            )
        logger.warning(
            "Synthesizer stopped after %d deltas (%s); stream closed, serving a truncated briefing",
            len(chunks),
            budget.stop_reason(),
        )
        return {"briefing": partial, "briefing_truncated": True, "current_step": "complete"}

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
