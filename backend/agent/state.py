from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


class RaceInfo(TypedDict):
    name: str
    year: int
    circuit_id: str
    location: str
    country: str
    date: str
    is_upcoming: bool
    historical_year: int


class ToolResult(TypedDict):
    tool_name: str
    success: bool
    data: dict


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    race_query: str
    race_info: RaceInfo | None
    tasks: list[str]
    tool_results: list[ToolResult]
    briefing: str | None
    current_step: str
