"""Plain helpers shared by the FastF1-backed tools — not LLM-callable tools."""

from typing import Any

import fastf1
import pandas as pd


def find_event(schedule: pd.DataFrame, name: str) -> pd.Series | None:
    """Return the first schedule row whose EventName contains name, or None."""
    matches = schedule[schedule["EventName"].str.contains(name, case=False, na=False, regex=False)]
    return None if matches.empty else matches.iloc[0]


def load_race_session(year: int, event_name: str):
    """Fetch a race session with telemetry, weather, and messages disabled."""
    session = fastf1.get_session(year, event_name, "R")
    session.load(telemetry=False, weather=False, messages=False)
    return session


def format_position(position: Any) -> int | str:
    """Coerce a results Position value to int, or 'DNF' when unclassified."""
    return int(position) if position > 0 else "DNF"
