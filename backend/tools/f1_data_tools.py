"""FastF1-based tools for recent race top finishers and circuit winner history.

Both answer as of the briefing's ``as_of`` cutoff (ADR-0004), never as of today.
"""

import logging
from datetime import datetime
from typing import Any

from langchain_core.tools import tool

from tools.circuit_winners import circuit_id_for_location, get_recent_circuit_winners
from tools.cutoff import parse_utc
from tools.fastf1_helpers import format_position, load_race_session, race_start
from tools.openf1_client import OPENF1_FIRST_YEAR, driver_index
from tools.openf1_races import held_races
from tools.openf1_shaping import top_finisher_rows
from tools.schedule_cache import get_schedule

logger = logging.getLogger(__name__)

_NOT_CUMULATIVE = "Positions from most recent race (not cumulative season standings)"


def _openf1_top(year: int, cutoff: datetime) -> dict[str, Any] | None:
    """The year's latest held race before ``cutoff`` from OpenF1, or None when none had run.
    Raises; the caller falls back to FastF1."""
    races, rows = held_races(year, cutoff)
    if not races:
        return None
    last_race = races[-1]
    keys = {race["session_key"] for race in races}
    drivers = driver_index(keys)
    race_rows = [row for row in rows if row.get("session_key") == last_race["session_key"]]
    return {
        "year": year,
        "last_race": last_race["circuit_short_name"],
        "race_date": last_race["date_start"][:10],
        "top_finishers": top_finisher_rows(race_rows, drivers)[:10],
        "note": _NOT_CUMULATIVE,
    }


def _fastf1_top(year: int, cutoff: datetime) -> dict[str, Any] | None:
    """The same from FastF1, or None when none had run. Raises on failure."""
    schedule = get_schedule(year)
    events = [
        event
        for _, event in schedule.iterrows()
        if int(event["RoundNumber"]) != 0 and race_start(event) < cutoff
    ]
    if not events:
        return None

    last_event = events[-1]
    session = load_race_session(year, int(last_event["RoundNumber"]))
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
        "race_date": race_start(last_event).date().isoformat(),
        "top_finishers": top_finishers,
        "note": _NOT_CUMULATIVE,
    }


def _season_top(year: int, cutoff: datetime) -> dict[str, Any] | None:
    if year >= OPENF1_FIRST_YEAR:
        try:
            return _openf1_top(year, cutoff)
        except Exception as exc:
            logger.warning(
                "OpenF1 top finishers for %d failed (%s: %s); falling back to FastF1",
                year,
                type(exc).__name__,
                exc,
            )
    return _fastf1_top(year, cutoff)


@tool
def get_recent_top_finishers(as_of: str) -> dict[str, Any]:
    """Get the top-10 finishing order of the latest race held before the briefing's cutoff.

    Note: This is a single race's finishing positions, not cumulative championship
    standings — use it as a snapshot of current competitive order. For a real table,
    ``get_championship_standings`` exists.

    The race is the latest one in the cutoff's own season with a classification; the
    previous season's last race stands in only when none of this one's has run. The
    result's ``year`` says which season it is.

    Served by OpenF1 from OPENF1_FIRST_YEAR onwards and by FastF1 before that.

    Args:
        as_of: The briefing's ISO-8601 cutoff; only a race that started before it counts.

    Returns:
        The race's ``year``, ``last_race``, ``race_date`` and ``top_finishers``, or an
        'error' key on failure.
    """
    try:
        cutoff = parse_utc(as_of)
        for year in (cutoff.year, cutoff.year - 1):
            result = _season_top(year, cutoff)
            if result is not None:
                return result
        return {
            "error": (
                f"No completed races found before {cutoff.date().isoformat()} "
                f"in {cutoff.year} or {cutoff.year - 1}"
            )
        }
    except Exception as exc:
        logger.warning("Top finishers as of %s failed (%s: %s)", as_of, type(exc).__name__, exc)
        return {"error": f"Failed to get recent top finishers: {exc}"}


@tool
def get_circuit_winners(
    circuit_name: str, location: str, race_year: int, as_of: str, years_back: int = 3
) -> dict[str, Any]:
    """Get the winners at this race's circuit in the seasons before the race's own.

    Past years are matched by ``location`` — the track — never by Event name, which matched
    the wrong circuit whenever an Event moved: a 2026 Spanish Grand Prix (Madrid) reported
    Barcelona's winners, and the rescheduled 2026 Bahrain Grand Prix (filed under Kuala
    Lumpur) reported Sakhir's. The lookup and its per-circuit-year cache are
    ``tools/circuit_winners.py``'s, shared with the /circuits page.

    The window is the ``years_back`` seasons before ``race_year`` — a Silverstone 2023
    briefing covers 2020-22 whenever it is asked for — and no edition on or after ``as_of``
    is ever included, so a past race's own result cannot appear.

    Deliberately still FastF1, unlike the other three result tools. This one wants a
    single race from each of N different years, and OpenF1's endpoints are per-year —
    it costs four requests per year to fetch one winner row, measured at 6.57s against
    FastF1's 4.62s, and twelve requests from one tool crowds OpenF1's unauthenticated
    30 req/min ceiling. The migration made the other tools faster; here it made things
    worse, so it was reverted.

    Args:
        circuit_name: The circuit's name (or the Grand Prix's, when the circuit has no
            file), echoed back as the result's label.
        location: The Event's FastF1 ``Location``, which identifies the circuit.
        race_year: The briefed race's season; the window ends the season before it.
        as_of: The briefing's ISO-8601 cutoff.
        years_back: Number of seasons to look back (default: 3).

    Returns:
        ``circuit``, ``seasons`` ({from, to}) and ``recent_winners`` newest first, or an
        'error' key on failure.
    """
    no_data = [{"note": "No recent data available"}]
    seasons = {"from": race_year - years_back, "to": race_year - 1}
    try:
        circuit_id = circuit_id_for_location(location)
        if circuit_id is None:
            return {"circuit": circuit_name, "seasons": seasons, "recent_winners": no_data}

        result = get_recent_circuit_winners(
            circuit_id, years_back, season=race_year, before=parse_utc(as_of)
        )
        if "error" in result:
            return {"error": f"Failed to get circuit winners: {result['error']}"}

        return {
            "circuit": circuit_name,
            "seasons": seasons,
            "recent_winners": result["winners"] or no_data,
        }
    except Exception as exc:
        logger.warning("Circuit winners for %s failed (%s: %s)", location, type(exc).__name__, exc)
        return {"error": f"Failed to get circuit winners: {exc}"}
