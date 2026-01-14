from typing import TypedDict, Annotated, List, Optional
from langgraph.graph.message import add_messages

class RaceInfo(TypedDict):
    name: str
    year: int
    circuit_id: str
    location: str
    country: str

class ToolResult(TypedDict):
    tool_name: str
    success: bool
    data: dict

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    race_query: str
    race_info: Optional[RaceInfo]
    tasks: List[str]
    tool_results: List[ToolResult]
    briefing: Optional[str]
    current_step: str
