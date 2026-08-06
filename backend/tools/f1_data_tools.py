"""FastF1-based tools for recent race top finishers and circuit winner history."""

import logging
from datetime import date
from typing import Any

from langchain_core.tools import tool

from tools.fastf1_helpers import find_event, format_position, load_race_session
from tools.openf1_client import OPENF1_FIRST_YEAR, driver_index, session_results
from tools.openf1_races import completed_races
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
    """Get recent race winners at a specific circuit using FastF1 historical data.

    Deliberately still FastF1, unlike the other three result tools. This one wants a
    single race from each of N different years, and OpenF1's endpoints are per-year —
    it costs four requests per year to fetch one winner row, measured at 6.57s against
    FastF1's 4.62s, and twelve requests from one tool crowds OpenF1's unauthenticated
    30 req/min ceiling. The migration made the other tools faster; here it made things
    worse, so it was reverted.

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
            winner = _fastf1_circuit_winner(circuit_name, year)
            if winner is not None:
                winners.append(winner)

        return {
            "circuit": circuit_name,
            "recent_winners": winners if winners else [{"note": "No recent data available"}],
        }
    except Exception as exc:
        return {"error": f"Failed to get circuit winners: {exc}"}


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
