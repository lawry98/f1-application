from typing import TypedDict


class SessionTime(TypedDict):
    name: str
    # ISO-8601, UTC.
    start: str


class RaceInfo(TypedDict):
    name: str
    year: int
    round: int
    # An *event* slug ("british_grand_prix"), not a circuit id — see track_id.
    circuit_id: str
    # The circuit id the location matched in frontend/data/circuits/index.json ("gb-1948"),
    # or None. Everything circuit-shaped keys on this, never on the Grand Prix's name.
    track_id: str | None
    circuit_name: str | None
    circuit_length_m: int | None
    location: str
    country: str
    date: str
    is_upcoming: bool
    # The briefing's cutoff, ISO-8601 UTC: today for an upcoming race, the first session's
    # start for a past one. Every data tool answers as of it. See ADR-0004.
    as_of: str
    sessions: list[SessionTime]


class ToolResult(TypedDict):
    tool_name: str
    success: bool
    data: dict
    # True when ``data`` was served from the cross-request result cache rather
    # than a live tool invocation. See ADR-0003.
    cached: bool


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
