from typing import TypedDict


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
    race_query: str
    race_info: RaceInfo | None
    tasks: list[str]
    tool_results: list[ToolResult]
    briefing: str | None
    # Whether ``briefing`` is the whole synthesis or only what got written before it
    # failed. Named for its subject because the state dict is flat — bare ``truncated``
    # would not say truncated-what. See ADR-0002.
    briefing_truncated: bool
    current_step: str
