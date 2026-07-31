"""FastF1-based tools for track info, race results, and driver form."""

from datetime import date
from typing import Any

from langchain_core.tools import tool

from tools.fastf1_helpers import find_event, format_position, load_race_session
from tools.schedule_cache import get_schedule


@tool
def get_track_info(circuit_name: str, year: int) -> dict[str, Any]:
    """Get event details for a circuit: name, location, country, date, and format.

    Args:
        circuit_name: Name of the circuit/Grand Prix (e.g., 'Monaco', 'Silverstone').
        year: Year of the race.

    Returns:
        Dictionary with event details or an 'error' key on failure.
    """
    try:
        schedule = get_schedule(year)
        event_data = find_event(schedule, circuit_name)

        if event_data is None:
            return {"error": f"No event found for {circuit_name} in {year}"}

        return {
            "circuit_name": event_data["EventName"],
            "country": event_data["Country"],
            "location": event_data["Location"],
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
        session = load_race_session(year, event_name)

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
        year: Season to analyse (the pipeline passes historical_year — the last
            completed season for upcoming events).
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
                session = load_race_session(year, event["EventName"])
                driver_result = session.results[session.results["Abbreviation"] == driver_code]

                if not driver_result.empty:
                    result_data = driver_result.iloc[0]
                    points = float(result_data["Points"])
                    driver_results.append(
                        {
                            "event": event["EventName"],
                            "position": format_position(result_data["Position"]),
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
