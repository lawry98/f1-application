"""FastF1-based tools for track info, race results, and driver form."""

from datetime import date
from typing import Any

import fastf1
from langchain_core.tools import tool

from tools.schedule_cache import get_schedule


@tool
def get_track_info(circuit_name: str, year: int) -> dict[str, Any]:
    """Get detailed track information including characteristics, length, corners, and DRS zones.

    Args:
        circuit_name: Name of the circuit/Grand Prix (e.g., 'Monaco', 'Silverstone').
        year: Year of the race.

    Returns:
        Dictionary with track details or an 'error' key on failure.
    """
    try:
        schedule = get_schedule(year)
        event = schedule[schedule["EventName"].str.contains(circuit_name, case=False, na=False)]

        if event.empty:
            return {"error": f"No event found for {circuit_name} in {year}"}

        event_data = event.iloc[0]
        session = fastf1.get_session(year, event_data["EventName"], "R")
        session.load(telemetry=False, weather=False, messages=False)

        circuit_length = session.event.get("CircuitLength")

        return {
            "circuit_name": event_data["EventName"],
            "country": event_data["Country"],
            "location": event_data["Location"],
            "circuit_length_km": float(circuit_length) if circuit_length is not None else None,
            "date": str(event_data["EventDate"]),
            "event_format": event_data.get("EventFormat", "Standard"),
            "official_name": event_data.get("OfficialEventName", event_data["EventName"]),
        }
    except Exception as exc:
        return {"error": f"Failed to get track info: {exc}"}


@tool
def get_recent_race_results(event_name: str, year: int) -> dict[str, Any]:
    """Get the most recent race results from this circuit.

    Args:
        event_name: Name of the Grand Prix event.
        year: Year to look up.

    Returns:
        Dictionary with race results or an 'error' key on failure.
    """
    try:
        session = fastf1.get_session(year, event_name, "R")
        session.load(telemetry=False, weather=False, messages=False)

        top_10 = session.results.head(10)[
            ["Position", "DriverNumber", "Abbreviation", "TeamName", "Points", "Status"]
        ]

        return {
            "year": year,
            "event": event_name,
            "results": top_10.to_dict("records"),
        }
    except Exception as exc:
        return {"error": f"Failed to get race results: {exc}"}


@tool
def get_driver_form(driver_code: str, year: int, num_races: int = 5) -> dict[str, Any]:
    """Get recent form for a specific driver showing their last N race results.

    Args:
        driver_code: Three-letter driver abbreviation (e.g., 'VER', 'HAM', 'LEC').
        year: Current season year.
        num_races: Number of recent races to analyse (default: 5).

    Returns:
        Dictionary with the driver's recent results or an 'error' key on failure.
    """
    try:
        schedule = get_schedule(year)
        today = date.today()
        completed_events = schedule[schedule["EventDate"].dt.date < today].tail(num_races)

        driver_results = []
        total_points = 0.0

        for _, event in completed_events.iterrows():
            try:
                session = fastf1.get_session(year, event["EventName"], "R")
                session.load(telemetry=False, weather=False, messages=False)
                driver_result = session.results[session.results["Abbreviation"] == driver_code]

                if not driver_result.empty:
                    result_data = driver_result.iloc[0]
                    position = (
                        int(result_data["Position"]) if result_data["Position"] > 0 else "DNF"
                    )
                    points = float(result_data["Points"])
                    driver_results.append(
                        {
                            "event": event["EventName"],
                            "position": position,
                            "points": points,
                            "status": result_data["Status"],
                        }
                    )
                    total_points += points
            except Exception:
                continue

        numeric_positions = [
            r["position"] for r in driver_results if isinstance(r["position"], int)
        ]
        average_finish = (
            sum(numeric_positions) / len(numeric_positions) if numeric_positions else None
        )

        return {
            "driver": driver_code,
            "recent_results": driver_results,
            "total_points_last_races": total_points,
            "average_finish": average_finish,
        }
    except Exception as exc:
        return {"error": f"Failed to get driver form: {exc}"}
