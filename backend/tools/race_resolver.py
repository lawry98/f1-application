"""Deterministic resolver that maps a user query to the next upcoming race at a circuit."""

from datetime import date
from typing import Any

from tools.schedule_cache import get_schedule

# Common aliases → FastF1 EventName substrings
ALIASES: dict[str, str] = {
    "monaco": "Monaco",
    "silverstone": "British",
    "british gp": "British",
    "monza": "Italian",
    "italian gp": "Italian",
    "spa": "Belgian",
    "belgian gp": "Belgian",
    "suzuka": "Japanese",
    "japanese gp": "Japanese",
    "singapore": "Singapore",
    "austin": "United States",
    "cota": "United States",
    "us gp": "United States",
    "las vegas": "Las Vegas",
    "bahrain": "Bahrain",
    "jeddah": "Saudi Arabian",
    "saudi arabia": "Saudi Arabian",
    "melbourne": "Australian",
    "australia": "Australian",
    "imola": "Emilia Romagna",
    "emilia romagna": "Emilia Romagna",
    "miami": "Miami",
    "spain": "Spanish",
    "barcelona": "Spanish",
    "catalunya": "Spanish",
    "canada": "Canadian",
    "montreal": "Canadian",
    "austria": "Austrian",
    "hungary": "Hungarian",
    "budapest": "Hungarian",
    "netherlands": "Dutch",
    "zandvoort": "Dutch",
    "mexico": "Mexico City",
    "brazil": "São Paulo",
    "sao paulo": "São Paulo",
    "interlagos": "São Paulo",
    "abu dhabi": "Abu Dhabi",
    "qatar": "Qatar",
    "china": "Chinese",
    "shanghai": "Chinese",
    "baku": "Azerbaijan",
    "azerbaijan": "Azerbaijan",
}


def _parse_query(query: str) -> tuple[str, int | None]:
    """Strip an optional year suffix and return (circuit_query, year_or_none)."""
    parts = query.strip().rsplit(maxsplit=1)
    if len(parts) == 2 and parts[1].isdigit() and len(parts[1]) == 4:
        return parts[0], int(parts[1])
    return query.strip(), None


def _find_event(schedule, search_term: str):
    """Search schedule for an event matching search_term."""
    for col in ("EventName", "Location", "Country"):
        matches = schedule[
            schedule[col].str.contains(search_term, case=False, na=False, regex=False)
        ]
        if not matches.empty:
            return matches.iloc[0]
    return None


def resolve_next_race(query: str) -> dict[str, Any]:
    """Resolve a user query to the next upcoming race at that circuit.

    Returns dict with keys:
        name, year, location, country, date, is_upcoming, historical_year, circuit_id
    Or dict with key 'error' on failure. 'error' is always safe to display; a
    schedule-load failure also carries a log-only 'detail' key with the upstream
    exception text.
    """
    circuit_query, explicit_year = _parse_query(query)

    # Map aliases
    search_term = ALIASES.get(circuit_query.lower(), circuit_query)

    today = date.today()
    current_year = today.year
    next_year = current_year + 1

    # If user gave an explicit year, honour it
    if explicit_year:
        try:
            schedule = get_schedule(explicit_year)
        except Exception as e:
            # `error` is safe to display: the year is the user's own input. The
            # upstream exception text is log-only, under the optional `detail` key.
            return {
                "error": f"Could not load the {explicit_year} season schedule.",
                "detail": str(e),
            }

        event = _find_event(schedule, search_term)
        if event is None:
            return {"error": f"No event matching '{circuit_query}' found in {explicit_year}"}

        event_date = event["EventDate"]
        event_date_d = event_date.date() if hasattr(event_date, "date") else event_date
        is_upcoming = event_date_d >= today
        historical_year = explicit_year - 1 if is_upcoming else explicit_year

        return _build_result(event, explicit_year, is_upcoming, historical_year)

    # No explicit year — search current year then next year for upcoming race
    for year in (current_year, next_year):
        try:
            schedule = get_schedule(year)
        except Exception:
            continue

        event = _find_event(schedule, search_term)
        if event is None:
            continue

        event_date = event["EventDate"]
        event_date_d = event_date.date() if hasattr(event_date, "date") else event_date
        if event_date_d >= today:
            historical_year = year - 1 if year == current_year else current_year
            return _build_result(event, year, True, historical_year)

    # No upcoming race found — fall back to most recent completed race at this circuit
    for year in (current_year, current_year - 1):
        try:
            schedule = get_schedule(year)
        except Exception:
            continue

        event = _find_event(schedule, search_term)
        if event is not None:
            return _build_result(event, year, False, year)

    return {"error": f"No race found matching '{circuit_query}'"}


def _build_result(event, year: int, is_upcoming: bool, historical_year: int) -> dict:
    event_name = event["EventName"]
    return {
        "name": event_name,
        "year": year,
        "circuit_id": event_name.lower().replace(" ", "_"),
        "location": event["Location"],
        "country": event["Country"],
        "date": str(event["EventDate"]),
        "is_upcoming": is_upcoming,
        "historical_year": historical_year,
    }
