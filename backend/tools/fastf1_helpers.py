"""Plain helpers shared by the FastF1-backed tools — not LLM-callable tools."""

from datetime import UTC, datetime
from typing import Any

import fastf1
import pandas as pd

from tools.cutoff import timestamp_utc, to_iso

# FastF1's schedule has five session slots per event; a sprint weekend fills them in a
# different order from a conventional one, so a session is found by its name, not its slot.
SESSION_SLOTS = 5


def event_sessions(event: pd.Series) -> list[dict[str, str]]:
    """Every session FastF1 lists for an event, in order: ``{"name", "start"}``, start in UTC.

    A slot with no name or no UTC time is skipped — FastF1 carries no session times for
    older seasons, and those events come back with an empty list.
    """
    sessions = []
    for slot in range(1, SESSION_SLOTS + 1):
        name = event.get(f"Session{slot}")
        start = timestamp_utc(event.get(f"Session{slot}DateUtc"))
        if isinstance(name, str) and name and start is not None:
            sessions.append({"name": name, "start": to_iso(start)})
    return sessions


def race_start(event: pd.Series) -> datetime:
    """When an event's Grand Prix starts, in UTC.

    The session named ``Race`` when FastF1 has one; otherwise midnight UTC on ``EventDate``,
    which is the race day. The fallback only matters for seasons without session times.
    """
    for session in event_sessions(event):
        if session["name"] == "Race":
            return datetime.fromisoformat(session["start"])
    event_date = pd.Timestamp(event["EventDate"])
    return datetime(event_date.year, event_date.month, event_date.day, tzinfo=UTC)


def load_race_session(year: int, event_name: str | int):
    """Fetch a race session with lap, telemetry, weather, and message loading disabled.

    Every consumer reads ``session.results`` and nothing else — ``session.laps`` appears
    nowhere in this codebase. Lap loading is not merely unused, it is actively harmful:
    its endpoints fail on every call, and FastF1 only persists a session that loaded
    cleanly, so requesting laps made these calls both slow (3.5s against 1.1s per
    session) and permanently uncacheable.
    """
    session = fastf1.get_session(year, event_name, "R")
    session.load(laps=False, telemetry=False, weather=False, messages=False)
    return session


def format_position(position: Any) -> int | str:
    """Coerce a results Position value to int, or 'DNF' when unclassified."""
    return int(position) if position > 0 else "DNF"
