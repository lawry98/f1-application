import json
import os
from typing import Dict, Any
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from agent.state import AgentState, RaceInfo, ToolResult
from agent.prompts import PLANNER_PROMPT, SYNTHESIZER_PROMPT
from tools.fastf1_tools import get_track_info, get_driver_form, get_recent_race_results
from tools.f1_data_tools import (
    get_season_standings,
    get_circuit_winners,
    get_circuit_info
)
from tools.search_tools import search_f1_news
from tools.weather_tools import get_race_weather

all_tools = [
    get_track_info,
    get_season_standings,
    get_circuit_winners,
    get_circuit_info,
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

def planner_node(state: AgentState) -> Dict[str, Any]:
    """Parse user query and create execution plan."""
    query = state.get("race_query", "")
    
    messages = [
        SystemMessage(content=PLANNER_PROMPT.format(query=query)),
        HumanMessage(content=query)
    ]
    
    response = llm.invoke(messages)
    
    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        plan = json.loads(content.strip())
        
        race_info = RaceInfo(
            name=plan["race_info"]["name"],
            year=plan["race_info"]["year"],
            circuit_id=plan["race_info"]["circuit_id"],
            location=plan["race_info"]["location"],
            country=plan["race_info"]["country"]
        )
        
        return {
            "race_info": race_info,
            "tasks": plan["tasks"],
            "current_step": "gathering"
        }
    except Exception as e:
        return {
            "race_info": None,
            "tasks": [],
            "current_step": "error",
            "briefing": f"Failed to parse race query: {str(e)}"
        }

def tool_executor_node(state: AgentState) -> Dict[str, Any]:
    """Execute planned tools and gather data."""
    race_info = state.get("race_info")
    tasks = state.get("tasks", [])
    
    if not race_info:
        return {"current_step": "error", "briefing": "No race information available"}
    
    tool_results = []
    tool_map = {tool.name: tool for tool in all_tools}
    
    for task_name in tasks:
        if task_name not in tool_map:
            tool_results.append(ToolResult(
                tool_name=task_name,
                success=False,
                data={"error": f"Unknown tool: {task_name}"}
            ))
            continue
        
        tool = tool_map[task_name]
        
        try:
            if task_name == "get_track_info":
                result = tool.invoke({"circuit_name": race_info["name"], "year": race_info["year"]})
            elif task_name == "get_season_standings":
                result = tool.invoke({"year": race_info["year"]})
            elif task_name == "get_circuit_winners":
                result = tool.invoke({"circuit_name": race_info["name"], "years_back": 3})
            elif task_name == "get_circuit_info":
                result = tool.invoke({"circuit_name": race_info["name"], "year": race_info["year"]})
            elif task_name == "search_f1_news":
                result = tool.invoke({"query": f"{race_info['name']} {race_info['year']}", "max_results": 5})
            elif task_name == "get_race_weather":
                country_code_map = {
                    "Monaco": "MC", "United Kingdom": "GB", "Italy": "IT", "Belgium": "BE",
                    "Japan": "JP", "Singapore": "SG", "United States": "US", "Bahrain": "BH",
                    "Saudi Arabia": "SA", "Australia": "AU", "Spain": "ES", "Canada": "CA",
                    "Austria": "AT", "Hungary": "HU", "Netherlands": "NL", "Mexico": "MX",
                    "Brazil": "BR", "UAE": "AE"
                }
                country_code = country_code_map.get(race_info["country"], "US")
                result = tool.invoke({"city": race_info["location"], "country_code": country_code})
            elif task_name == "get_driver_form":
                result = tool.invoke({"driver_code": "VER", "year": race_info["year"], "num_races": 5})
            elif task_name == "get_recent_race_results":
                result = tool.invoke({"event_name": race_info["name"], "year": race_info["year"] - 1})
            else:
                result = {"error": f"No handler for tool: {task_name}"}
            
            tool_results.append(ToolResult(
                tool_name=task_name,
                success="error" not in result,
                data=result
            ))
        except Exception as e:
            tool_results.append(ToolResult(
                tool_name=task_name,
                success=False,
                data={"error": str(e)}
            ))
    
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

workflow = StateGraph(AgentState)

workflow.add_node("planner", planner_node)
workflow.add_node("tool_executor", tool_executor_node)
workflow.add_node("synthesizer", synthesizer_node)

workflow.set_entry_point("planner")
workflow.add_edge("planner", "tool_executor")
workflow.add_edge("tool_executor", "synthesizer")
workflow.add_edge("synthesizer", END)

agent = workflow.compile()
