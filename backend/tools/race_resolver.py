"""Deterministic resolver that maps a user query to the next upcoming race at a circuit."""

import logging
from datetime import date, timedelta
from typing import Any

import pandas as pd

from tools.circuit_winners import circuit_id_for_location, circuit_record
from tools.cutoff import start_of_day, to_iso
from tools.fastf1_helpers import event_sessions
from tools.schedule_cache import get_schedule

logger = logging.getLogger(__name__)

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
        name, year, round, circuit_id, track_id, circuit_name, circuit_length_m, location,
        country, date, is_upcoming, as_of, sessions
    Or dict with key 'error' on failure. 'error' is always safe to display; a
    schedule-load failure also carries a log-only 'detail' key with the upstream
    exception text.

    ``as_of`` is the briefing's cutoff (ADR-0004): the start of today for an upcoming race,
    mid-weekend included, and the first session's start for a race that has been run — a past
    race gets the briefing a reader would have seen on its Thursday, never a race review.
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

        return _build_result(event, explicit_year, is_upcoming, today)

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
            return _build_result(event, year, True, today)

    # No upcoming race found — fall back to most recent completed race at this circuit
    for year in (current_year, current_year - 1):
        try:
            schedule = get_schedule(year)
        except Exception:
            continue

        event = _find_event(schedule, search_term)
        if event is not None:
            return _build_result(event, year, False, today)

    return {"error": f"No race found matching '{circuit_query}'"}


def _track(location: str) -> tuple[str | None, dict[str, Any] | None]:
    """The circuit a FastF1 ``Location`` names, and its own file — matched by location.

    Never by Grand Prix name: the 2026 Bahrain Grand Prix is at Sepang. The circuit data is
    context rather than the race itself, so a missing or unreadable map degrades to None
    instead of failing the resolution.
    """
    try:
        track_id = circuit_id_for_location(location)
        return track_id, circuit_record(track_id) if track_id else None
    except Exception as exc:
        logger.warning(
            "No circuit data for location %r (%s: %s)", location, type(exc).__name__, exc
        )
        return None, None


def _as_of(event, sessions: list[dict[str, str]], is_upcoming: bool, today: date) -> str:
    """The briefing's cutoff: today for an upcoming race, the first session for a past one.

    FastF1 has no session times for older seasons; two days before race day stands in for FP1
    there, which is where a conventional weekend's first session falls.
    """
    if is_upcoming:
        return to_iso(start_of_day(today))
    if sessions:
        return sessions[0]["start"]
    race_day = pd.Timestamp(event["EventDate"]).date()
    return to_iso(start_of_day(race_day - timedelta(days=2)))


def _build_result(event, year: int, is_upcoming: bool, today: date) -> dict:
    event_name = event["EventName"]
    sessions = event_sessions(event)
    track_id, record = _track(str(event["Location"]))
    return {
        "name": event_name,
        "year": year,
        "round": int(event["RoundNumber"]),
        "circuit_id": event_name.lower().replace(" ", "_"),
        "track_id": track_id,
        "circuit_name": record["name"] if record else None,
        "circuit_length_m": record["length_m"] if record else None,
        "location": event["Location"],
        "country": event["Country"],
        "date": str(event["EventDate"]),
        "is_upcoming": is_upcoming,
        "as_of": _as_of(event, sessions, is_upcoming, today),
        "sessions": sessions,
    }
