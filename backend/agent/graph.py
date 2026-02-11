import json
import os
from typing import Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from agent.state import AgentState, RaceInfo, ToolResult
from agent.prompts import PLANNER_PROMPT, SYNTHESIZER_PROMPT, DEFAULT_TOOLS
from tools.race_resolver import resolve_next_race
from tools.schedule_cache import clear as clear_schedule_cache
from tools.fastf1_tools import get_track_info, get_driver_form, get_recent_race_results
from tools.f1_data_tools import get_season_standings, get_circuit_winners
from tools.search_tools import search_f1_news
from tools.weather_tools import get_race_weather

all_tools = [
    get_track_info,
    get_season_standings,
    get_circuit_winners,
    search_f1_news,
    get_race_weather,
    get_driver_form,
    get_recent_race_results
]

llm = ChatAnthropic(
    model="claude-sonnet-4-20250514",
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    temperature=0.7
)


def resolver_node(state: AgentState) -> Dict[str, Any]:
    """Resolve user query to a specific race using deterministic lookup."""
    query = state.get("race_query", "")
    result = resolve_next_race(query)

    if "error" in result:
        return {
            "race_info": None,
            "current_step": "error",
            "briefing": f"Could not resolve race: {result['error']}"
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

    return {
        "race_info": race_info,
        "current_step": "planning"
    }


def planner_node(state: AgentState) -> Dict[str, Any]:
    """Select tools to run based on pre-resolved race info."""
    race_info = state.get("race_info")
    if not race_info:
        return {"tasks": DEFAULT_TOOLS, "current_step": "gathering"}

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
        HumanMessage(content=f"Select tools for {race_info['name']} {race_info['year']}")
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
            return {"tasks": tasks, "current_step": "gathering"}
    except Exception:
        pass

    # Fallback to default tools
    return {"tasks": DEFAULT_TOOLS, "current_step": "gathering"}


def _invoke_tool(tool, task_name: str, race_info: dict) -> ToolResult:
    """Invoke a single tool and return the result."""
    try:
        if task_name == "get_track_info":
            result = tool.invoke({"circuit_name": race_info["name"], "year": race_info["historical_year"]})
        elif task_name == "get_season_standings":
            result = tool.invoke({"year": race_info["historical_year"]})
        elif task_name == "get_circuit_winners":
            result = tool.invoke({"circuit_name": race_info["name"], "years_back": 3})
        elif task_name == "search_f1_news":
            result = tool.invoke({"query": f"{race_info['name']} {race_info['year']}", "max_results": 5})
        elif task_name == "get_race_weather":
            country_code_map = {
                "Monaco": "MC", "United Kingdom": "GB", "Italy": "IT", "Belgium": "BE",
                "Japan": "JP", "Singapore": "SG", "United States": "US", "Bahrain": "BH",
                "Saudi Arabia": "SA", "Australia": "AU", "Spain": "ES", "Canada": "CA",
                "Austria": "AT", "Hungary": "HU", "Netherlands": "NL", "Mexico": "MX",
                "Brazil": "BR", "UAE": "AE", "Qatar": "QA", "China": "CN",
                "Azerbaijan": "AZ",
            }
            country_code = country_code_map.get(race_info["country"], "US")
            result = tool.invoke({"city": race_info["location"], "country_code": country_code})
        elif task_name == "get_driver_form":
            result = tool.invoke({"driver_code": "VER", "year": race_info["historical_year"], "num_races": 5})
        elif task_name == "get_recent_race_results":
            result = tool.invoke({"event_name": race_info["name"], "year": race_info["historical_year"]})
        else:
            result = {"error": f"No handler for tool: {task_name}"}

        return ToolResult(
            tool_name=task_name,
            success="error" not in result,
            data=result
        )
    except Exception as e:
        return ToolResult(
            tool_name=task_name,
            success=False,
            data={"error": str(e)}
        )


def tool_executor_node(state: AgentState) -> Dict[str, Any]:
    """Execute planned tools in parallel and gather data."""
    race_info = state.get("race_info")
    tasks = state.get("tasks", [])

    if not race_info:
        return {"current_step": "error", "briefing": "No race information available"}

    tool_map = {tool.name: tool for tool in all_tools}
    tool_results = []

    # Execute tools in parallel
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {}
        for task_name in tasks:
            if task_name not in tool_map:
                tool_results.append(ToolResult(
                    tool_name=task_name,
                    success=False,
                    data={"error": f"Unknown tool: {task_name}"}
                ))
                continue
            future = pool.submit(_invoke_tool, tool_map[task_name], task_name, race_info)
            futures[future] = task_name

        for future in as_completed(futures):
            tool_results.append(future.result())

    return {
        "tool_results": tool_results,
        "current_step": "synthesizing"
    }


def synthesizer_node(state: AgentState) -> Dict[str, Any]:
    """Synthesize tool results into final briefing."""
    tool_results = state.get("tool_results", [])
    race_info = state.get("race_info")

    if not tool_results:
        return {"briefing": "No data available to generate briefing", "current_step": "complete"}

    results_text = json.dumps([
        {"tool": tr["tool_name"], "success": tr["success"], "data": tr["data"]}
        for tr in tool_results
    ], indent=2)

    messages = [
        SystemMessage(content=SYNTHESIZER_PROMPT.format(tool_results=results_text)),
        HumanMessage(content=f"Generate briefing for {race_info['name']} {race_info['year']}")
    ]

    response = llm.invoke(messages)

    return {
        "briefing": response.content,
        "current_step": "complete"
    }


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
workflow.add_conditional_edges("resolver", should_continue_after_resolver, {END: END, "planner": "planner"})
workflow.add_edge("planner", "tool_executor")
workflow.add_edge("tool_executor", "synthesizer")
workflow.add_edge("synthesizer", END)

agent = workflow.compile()
