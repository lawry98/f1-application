"""FastF1-based tools for recent race top finishers and circuit winner history."""

import logging
from datetime import date
from typing import Any

from langchain_core.tools import tool

from tools.fastf1_helpers import find_event, format_position, load_race_session
from tools.openf1_client import OPENF1_FIRST_YEAR, driver_index, session_results
from tools.openf1_races import completed_races, find_race_session
from tools.openf1_shaping import top_finisher_rows
from tools.schedule_cache import get_schedule

logger = logging.getLogger(__name__)


@tool
def get_recent_top_finishers(year: int) -> dict[str, Any]:
    """Get the top-10 finishing order of the season's most recent completed race.

    Note: This is a single race's finishing positions, not cumulative championship
    standings — use it as a snapshot of current competitive order. For a real table,
    ``get_championship_standings`` exists.

    Served by OpenF1 from OPENF1_FIRST_YEAR onwards and by FastF1 before that.

    Args:
        year: Season to query.

    Returns:
        Dictionary with the most recent race's top finishers or an 'error' key on failure.
    """
    note = "Positions from most recent race (not cumulative season standings)"

    if year >= OPENF1_FIRST_YEAR:
        try:
            races = completed_races(year, date.today())
            if not races:
                return {"error": f"No completed races found for {year} season yet"}

            last_race = races[-1]
            rows = session_results({last_race["session_key"]})
            if rows:
                drivers = driver_index({last_race["session_key"]})
                return {
                    "year": year,
                    "last_race": last_race["circuit_short_name"],
                    "top_finishers": top_finisher_rows(rows, drivers)[:10],
                    "note": note,
                }
        except Exception as exc:
            logger.warning(
                "OpenF1 top finishers for %d failed (%s: %s); falling back to FastF1",
                year,
                type(exc).__name__,
                exc,
            )

    try:
        schedule = get_schedule(year)
        today = date.today()
        completed_events = schedule[schedule["EventDate"].dt.date < today]

        if completed_events.empty:
            return {"error": f"No completed races found for {year} season yet"}

        last_event = completed_events.iloc[-1]
        session = load_race_session(year, last_event["EventName"])

        top_finishers = [
            {
                "position": format_position(row["Position"]),
                "driver": row["FullName"],
                "driver_code": row["Abbreviation"],
                "team": row["TeamName"],
                "points": float(row["Points"]),
            }
            for _, row in session.results.head(10).iterrows()
        ]

        return {
            "year": year,
            "last_race": last_event["EventName"],
            "top_finishers": top_finishers,
            "note": note,
        }
    except Exception as exc:
        return {"error": f"Failed to get recent top finishers: {exc}"}


@tool
def get_circuit_winners(circuit_name: str, years_back: int = 3) -> dict[str, Any]:
    """Get recent race winners at a specific circuit.

    The lookback window is split by source rather than truncated: years from
    ``OPENF1_FIRST_YEAR`` onwards come from OpenF1 in one request each, earlier years
    from FastF1. A years_back of 5 therefore still reaches back five years, just more
    slowly for the older half.

    Args:
        circuit_name: Name of the circuit/Grand Prix.
        years_back: Number of previous years to look back (default: 3).

    Returns:
        Dictionary with recent winners or an 'error' key on failure.
    """
    try:
        current_year = date.today().year
        winners = []

        for year in range(current_year - years_back, current_year):
            winner = None
            if year >= OPENF1_FIRST_YEAR:
                try:
                    winner = _openf1_circuit_winner(circuit_name, year)
                except Exception as exc:
                    logger.warning(
                        "OpenF1 winner lookup for %s %d failed (%s: %s); falling back to FastF1",
                        circuit_name,
                        year,
                        type(exc).__name__,
                        exc,
                    )
            if winner is None:
                winner = _fastf1_circuit_winner(circuit_name, year)
            if winner is not None:
                winners.append(winner)

        return {
            "circuit": circuit_name,
            "recent_winners": winners if winners else [{"note": "No recent data available"}],
        }
    except Exception as exc:
        return {"error": f"Failed to get circuit winners: {exc}"}


def _openf1_circuit_winner(circuit_name: str, year: int) -> dict[str, Any] | None:
    """Return the OpenF1 winner row for one circuit-year, or None if unavailable."""
    session = find_race_session(year, circuit_name)
    if session is None:
        return None

    key = session["session_key"]
    winner = next((row for row in session_results({key}) if row.get("position") == 1), None)
    if winner is None:
        return None

    identity = driver_index({key}).get(winner.get("driver_number"), {})
    return {
        "year": year,
        "driver": identity.get("full_name", ""),
        "driver_code": identity.get("name_acronym", ""),
        "team": identity.get("team_name", ""),
        # OpenF1 gives race duration in seconds; the FastF1 path gives an H:MM:SS string,
        # so format to match rather than handing the LLM two different units.
        "time": _format_duration(winner.get("duration")),
    }


def _format_duration(seconds: float | None) -> str:
    """Render a race duration in seconds as H:MM:SS, or '' when absent."""
    if not seconds:
        return ""
    total = int(seconds)
    return f"{total // 3600}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def _fastf1_circuit_winner(circuit_name: str, year: int) -> dict[str, Any] | None:
    """Return the FastF1 winner row for one circuit-year, or None if unavailable.

    A dead year is skipped rather than fatal — the caller is collecting a window, and one
    missing season should not cost the others.
    """
    try:
        schedule = get_schedule(year)
        event_data = find_event(schedule, circuit_name)
        if event_data is None:
            return None

        session = load_race_session(year, event_data["EventName"])
        winner = session.results[session.results["Position"] == 1]
        if winner.empty:
            return None

        winner_data = winner.iloc[0]
        return {
            "year": year,
            "driver": winner_data["FullName"],
            "driver_code": winner_data["Abbreviation"],
            "team": winner_data["TeamName"],
            "time": str(winner_data["Time"]),
        }
    except Exception:
        return None
