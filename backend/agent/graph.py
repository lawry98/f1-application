"""LangGraph agent workflow: resolver -> planner -> tool_executor -> synthesizer."""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
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
from tools.standings_tools import get_championship_standings
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


def _invoke_tool(tool: Any, task_name: str, race_info: dict) -> ToolResult:
    """Invoke a single tool with arguments derived from race_info; never raises."""
    try:
        if task_name == "get_track_info":
            result = tool.invoke(
                {"circuit_name": race_info["name"], "year": race_info["historical_year"]}
            )
        elif task_name == "get_recent_top_finishers":
            result = tool.invoke({"year": race_info["historical_year"]})
        elif task_name == "get_championship_standings":
            # The season currently underway, not `historical_year` (year - 1): from round
            # 2 onward, "current standings" means this season's table. `historical_year`
            # only applies before round 1, when this season has nothing to report yet —
            # retry with it once so a pre-season briefing still gets last year's final
            # classification instead of an empty section.
            result = tool.invoke({"year": race_info["year"]})
            if "error" in result:
                result = tool.invoke({"year": race_info["historical_year"]})
        elif task_name == "get_circuit_winners":
            result = tool.invoke({"circuit_name": race_info["name"], "years_back": 3})
        elif task_name == "search_f1_news":
            result = tool.invoke(
                {"query": f"{race_info['name']} {race_info['year']}", "max_results": 5}
            )
        elif task_name == "get_race_weather":
            country_code = COUNTRY_CODE_MAP.get(race_info["country"], "US")
            result = tool.invoke({"city": race_info["location"], "country_code": country_code})
        elif task_name == "get_driver_form":
            # Hardcoded to Verstappen — the planner prompt advertises exactly this scope.
            result = tool.invoke(
                {"driver_code": "VER", "year": race_info["historical_year"], "num_races": 5}
            )
        elif task_name == "get_recent_race_results":
            result = tool.invoke(
                {"event_name": race_info["name"], "year": race_info["historical_year"]}
            )
        else:
            result = {"error": f"No handler for tool: {task_name}"}

        return ToolResult(
            tool_name=task_name,
            success="error" not in result,
            data=result,
        )
    except Exception as exc:
        logger.exception("Tool '%s' raised an unexpected exception: %s", task_name, exc)
        return ToolResult(tool_name=task_name, success=False, data={"error": str(exc)})


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
