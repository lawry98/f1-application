"""LangGraph agent workflow: resolver -> planner -> tool_executor -> synthesizer."""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from agent.prompts import DEFAULT_TOOLS, PLANNER_PROMPT, SYNTHESIZER_PROMPT
from agent.state import AgentState, RaceInfo, ToolResult
from config import (
    ANTHROPIC_API_KEY,
    COUNTRY_CODE_MAP,
    EXECUTOR_MAX_WORKERS,
    LLM_MODEL,
    LLM_TEMPERATURE,
)
from tools.f1_data_tools import get_circuit_winners, get_recent_top_finishers
from tools.fastf1_tools import get_driver_form, get_recent_race_results, get_track_info
from tools.race_resolver import resolve_next_race
from tools.search_tools import search_f1_news
from tools.weather_tools import get_race_weather

logger = logging.getLogger(__name__)

all_tools = [
    get_track_info,
    get_recent_top_finishers,
    get_circuit_winners,
    search_f1_news,
    get_race_weather,
    get_driver_form,
    get_recent_race_results,
]

llm = ChatAnthropic(
    model=LLM_MODEL,
    api_key=ANTHROPIC_API_KEY,
    temperature=LLM_TEMPERATURE,
)


def resolver_node(state: AgentState) -> dict[str, Any]:
    """Resolve the user query to a specific race using deterministic lookup."""
    query = state.get("race_query", "")
    result = resolve_next_race(query)

    if "error" in result:
        logger.warning("Race resolution failed for '%s': %s", query, result["error"])
        return {
            "race_info": None,
            "current_step": "error",
            "briefing": f"Could not resolve race: {result['error']}",
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

    response = llm.invoke(messages)

    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        tasks = json.loads(content.strip())
        if isinstance(tasks, list) and all(isinstance(t, str) for t in tasks):
            logger.info("Planner selected %d tools: %s", len(tasks), tasks)
            return {"tasks": tasks, "current_step": "gathering"}
    except Exception:
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

    tool_map = {tool.name: tool for tool in all_tools}
    tool_results: list[ToolResult] = []

    with ThreadPoolExecutor(max_workers=EXECUTOR_MAX_WORKERS) as pool:
        futures = {}
        for task_name in tasks:
            if task_name not in tool_map:
                logger.warning("Unknown tool requested: '%s'", task_name)
                tool_results.append(
                    ToolResult(
                        tool_name=task_name,
                        success=False,
                        data={"error": f"Unknown tool: {task_name}"},
                    )
                )
                continue
            future = pool.submit(_invoke_tool, tool_map[task_name], task_name, race_info)
            futures[future] = task_name

        for future in as_completed(futures):
            tool_results.append(future.result())

    successes = sum(1 for tr in tool_results if tr["success"])
    logger.info("Tool executor: %d/%d tools succeeded", successes, len(tool_results))

    return {"tool_results": tool_results, "current_step": "synthesizing"}


def synthesizer_node(state: AgentState) -> dict[str, Any]:
    """Synthesize tool results into the final race briefing."""
    tool_results = state.get("tool_results", [])
    race_info = state.get("race_info")

    if not tool_results:
        return {"briefing": "No data available to generate briefing", "current_step": "complete"}

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

    response = llm.invoke(messages)
    logger.info("Synthesizer produced %d chars", len(response.content))

    return {"briefing": response.content, "current_step": "complete"}


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
