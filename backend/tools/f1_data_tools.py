"""FastF1-based tools for season standings and circuit winner history."""

from datetime import date
from typing import Any

import fastf1
from langchain_core.tools import tool

from tools.schedule_cache import get_schedule


@tool
def get_season_standings(year: int) -> dict[str, Any]:
    """Get recent race results used to approximate championship standings.

    Note: Returns the finishing positions from the most recent completed race
    as a proxy for current championship context.

    Args:
        year: Championship year to query.

    Returns:
        Dictionary with results from the most recent race or an 'error' key on failure.
    """
    try:
        schedule = get_schedule(year)
        today = date.today()
        completed_events = schedule[schedule["EventDate"].dt.date < today]

        if completed_events.empty:
            return {"error": f"No completed races found for {year} season yet"}

        last_event = completed_events.iloc[-1]

        try:
            session = fastf1.get_session(year, last_event["EventName"], "R")
            session.load(telemetry=False, weather=False, messages=False)
            results = session.results

            driver_standings = [
                {
                    "position": int(row["Position"]) if row["Position"] > 0 else "DNF",
                    "driver": row["FullName"],
                    "driver_code": row["Abbreviation"],
                    "team": row["TeamName"],
                    "points": float(row["Points"]),
                }
                for _, row in results.head(10).iterrows()
            ]

            return {
                "year": year,
                "last_race": last_event["EventName"],
                "driver_standings": driver_standings,
                "note": "Positions from most recent race (not cumulative season standings)",
            }
        except Exception as exc:
            return {"error": f"Could not load race data: {exc}"}

    except Exception as exc:
        return {"error": f"Failed to get season standings: {exc}"}


@tool
def get_circuit_winners(circuit_name: str, years_back: int = 3) -> dict[str, Any]:
    """Get recent race winners at a specific circuit using FastF1 historical data.

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
            try:
                schedule = get_schedule(year)
                event = schedule[
                    schedule["EventName"].str.contains(circuit_name, case=False, na=False)
                ]

                if not event.empty:
                    event_data = event.iloc[0]
                    session = fastf1.get_session(year, event_data["EventName"], "R")
                    session.load(telemetry=False, weather=False, messages=False)

                    winner = session.results[session.results["Position"] == 1]

                    if not winner.empty:
                        winner_data = winner.iloc[0]
                        time_val = winner_data.get("Time", "N/A")
                        time_str = str(time_val) if time_val != "N/A" else "N/A"

                        winners.append(
                            {
                                "year": year,
                                "driver": winner_data["FullName"],
                                "driver_code": winner_data["Abbreviation"],
                                "team": winner_data["TeamName"],
                                "time": time_str,
                            }
                        )
            except Exception:
                continue

        return {
            "circuit": circuit_name,
            "recent_winners": winners if winners else [{"note": "No recent data available"}],
        }
    except Exception as exc:
        return {"error": f"Failed to get circuit winners: {exc}"}
