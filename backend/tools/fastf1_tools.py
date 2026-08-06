"""FastF1-based tools for track info, race results, and driver form."""

import logging
from datetime import date
from typing import Any

from langchain_core.tools import tool

from tools.fastf1_helpers import find_event, format_position, load_race_session
from tools.openf1_client import OPENF1_FIRST_YEAR, driver_index, session_results
from tools.openf1_races import completed_races, find_race_session
from tools.openf1_shaping import derive_status, race_result_rows
from tools.schedule_cache import get_schedule

logger = logging.getLogger(__name__)


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

    Served by OpenF1 from OPENF1_FIRST_YEAR onwards and by FastF1 before that. The two
    paths differ in one visible way: ``Status`` is FastF1's own prose ("+1 Lap",
    "Accident") on the FastF1 path but only "Finished"/"DNF"/"DNS"/"DSQ" on the OpenF1
    path, because OpenF1 exposes booleans rather than a reason.

    Args:
        event_name: Name of the Grand Prix event.
        year: Year to look up.

    Returns:
        Dictionary with race results or an 'error' key on failure.
    """
    if year >= OPENF1_FIRST_YEAR:
        try:
            session = find_race_session(year, event_name)
            if session is not None:
                rows = session_results({session["session_key"]})
                if rows:
                    drivers = driver_index({session["session_key"]})
                    return {
                        "year": year,
                        "event": event_name,
                        "results": race_result_rows(rows, drivers)[:10],
                    }
        except Exception as exc:
            logger.warning(
                "OpenF1 lookup for %s %d failed (%s: %s); falling back to FastF1",
                event_name,
                year,
                type(exc).__name__,
                exc,
            )

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

    On the OpenF1 path this is two requests regardless of num_races: one range query
    spanning every wanted session and one for the driver roster. The FastF1 path it
    replaced loaded one session per race at roughly 2.4s each.

    Sprints are excluded — this is race form, and a sprint result on the 8-point scale
    alongside race results on the 25-point scale would distort both the points total and
    the average finish.

    Args:
        driver_code: Three-letter driver abbreviation (e.g., 'VER', 'HAM', 'LEC').
        year: Season to analyse (the pipeline passes historical_year — the last
            completed season for upcoming events).
        num_races: Number of recent races to analyse (default: 5).

    Returns:
        Dictionary with the driver's recent results or an 'error' key on failure.
    """
    if year >= OPENF1_FIRST_YEAR:
        try:
            races = completed_races(year, date.today())[-num_races:]
            keys = {race["session_key"] for race in races}
            if keys:
                drivers = driver_index(keys)
                number = next(
                    (n for n, ident in drivers.items() if ident["name_acronym"] == driver_code),
                    None,
                )
                by_session = {
                    row["session_key"]: row
                    for row in session_results(keys)
                    if row.get("driver_number") == number
                }

                driver_results = []
                total_points = 0.0
                for race in races:
                    row = by_session.get(race["session_key"])
                    if row is None:
                        continue
                    points = float(row.get("points") or 0.0)
                    driver_results.append(
                        {
                            "event": race["circuit_short_name"],
                            "position": format_position(row.get("position") or 0),
                            "points": points,
                            "status": derive_status(row),
                        }
                    )
                    total_points += points

                numeric = [r["position"] for r in driver_results if isinstance(r["position"], int)]
                return {
                    "driver": driver_code,
                    "recent_results": driver_results,
                    "total_points_last_races": total_points,
                    "average_finish": sum(numeric) / len(numeric) if numeric else None,
                }
        except Exception as exc:
            logger.warning(
                "OpenF1 driver form for %s %d failed (%s: %s); falling back to FastF1",
                driver_code,
                year,
                type(exc).__name__,
                exc,
            )

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
