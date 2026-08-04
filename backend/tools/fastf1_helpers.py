"""Plain helpers shared by the FastF1-backed tools — not LLM-callable tools."""

from typing import Any

import fastf1
import pandas as pd


def find_event(schedule: pd.DataFrame, name: str) -> pd.Series | None:
    """Return the first schedule row whose EventName contains name, or None."""
    matches = schedule[schedule["EventName"].str.contains(name, case=False, na=False, regex=False)]
    return None if matches.empty else matches.iloc[0]


def load_race_session(year: int, event_name: str):
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
