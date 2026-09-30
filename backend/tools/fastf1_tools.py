"""FastF1-based tools for track info, race results, and driver form.

The two result tools here answer as of the briefing's ``as_of`` cutoff (ADR-0004), never as
of today: a past race is briefed from its Thursday, so a race that ran after it — including
the one being briefed — must not reach the prompt.
"""

import logging
from datetime import datetime
from typing import Any

import pandas as pd
from langchain_core.tools import tool

from tools.circuit_winners import circuit_record, events_at_circuit
from tools.cutoff import parse_utc
from tools.fastf1_helpers import format_position, load_race_session, race_start
from tools.openf1_client import OPENF1_FIRST_YEAR, driver_index, session_results
from tools.openf1_races import held_races, race_session_at
from tools.openf1_shaping import derive_status, race_result_rows
from tools.schedule_cache import get_schedule

logger = logging.getLogger(__name__)

NO_CIRCUIT = "No circuit data for this location"

# Seasons get_recent_race_results searches before the cutoff's own: the same three the
# winners window covers, so "no race here" and "no recent winners" describe one span.
RESULTS_LOOKBACK_YEARS = 3


@tool
def get_track_info(year: int, round: int, track_id: str | None) -> dict[str, Any]:
    """Get this event's details and the circuit it is held at.

    The event is the calendar row for ``round`` of ``year`` — matched by round, never by
    Grand Prix name, which can move between tracks. The circuit block comes from the track's
    own file, found by ``track_id``: its name, length and first Grand Prix.

    Args:
        year: The race's season.
        round: The race's round in that season.
        track_id: The circuit id its location matched, or None when the index has none.

    Returns:
        The Grand Prix, official name, year, round, location, country, date and format, plus
        a ``circuit`` block; or an 'error' key on failure.
    """
    try:
        schedule = get_schedule(year)
        rows = schedule[schedule["RoundNumber"] == round]
        if rows.empty:
            return {"error": f"No round {round} in the {year} calendar"}
        event = rows.iloc[0]

        record = circuit_record(track_id) if track_id else None
        circuit = (
            {
                "name": record["name"],
                "length_km": record["length_m"] / 1000 if record["length_m"] else None,
                "first_grand_prix": record["first_gp"],
            }
            if record
            else {"note": NO_CIRCUIT}
        )

        return {
            "grand_prix": event["EventName"],
            "official_name": event.get("OfficialEventName", event["EventName"]),
            "year": year,
            "round": round,
            "location": event["Location"],
            "country": event["Country"],
            "date": str(event["EventDate"]),
            "event_format": event.get("EventFormat", "Standard"),
            "circuit": circuit,
        }
    except Exception as exc:
        logger.warning("Track info for %d round %d failed (%s)", year, round, type(exc).__name__)
        return {"error": f"Failed to get track info: {exc}"}


def _latest_race_at(track_id: str, cutoff: datetime) -> tuple[int, pd.Series] | None:
    """The latest race at ``track_id`` that started before ``cutoff``, newest season first.

    Returns ``(year, event)``, or None when no searched season has one. Raises when a season
    cannot be loaded before a race is found: an older race reported past a season that never
    loaded might not be the latest, and "none here" built on it would be cached as true.
    """
    for year in _searched_years(cutoff):
        before = [e for e in events_at_circuit(track_id, year) if race_start(e) < cutoff]
        if before:
            return year, before[-1]
    return None


def _searched_years(cutoff: datetime) -> list[int]:
    return list(range(cutoff.year, cutoff.year - RESULTS_LOOKBACK_YEARS - 1, -1))


@tool
def get_recent_race_results(track_id: str | None, as_of: str) -> dict[str, Any]:
    """Get the top 10 of the latest race at this circuit that ran before the briefing's cutoff.

    The circuit is ``track_id`` — matched by location through ``circuit_winners``, never by
    Grand Prix name — so the 2026 Bahrain Grand Prix at Sepang finds Sepang's races, not
    Sakhir's. A circuit with no race in the seasons searched is a success that says so.

    Served by OpenF1 from OPENF1_FIRST_YEAR onwards and by FastF1 before that. The two
    paths differ in one visible way: ``Status`` is FastF1's own prose ("+1 Lap",
    "Accident") on the FastF1 path but only "Finished"/"DNF"/"DNS"/"DSQ" on the OpenF1
    path, because OpenF1 exposes booleans rather than a reason.

    Args:
        track_id: The circuit id, or None when the race's location has no circuit file.
        as_of: The briefing's ISO-8601 cutoff; only a race that started before it counts.

    Returns:
        The race's ``year`` (its season), ``event``, ``round`` and ``results``; a
        ``results: []`` success with a ``note`` and ``searched_years`` when there is none; or
        an 'error' key on failure.
    """
    if not track_id:
        return {"results": [], "note": NO_CIRCUIT}

    try:
        cutoff = parse_utc(as_of)
        found = _latest_race_at(track_id, cutoff)
    except Exception as exc:
        logger.warning("Race search at %s failed (%s: %s)", track_id, type(exc).__name__, exc)
        return {"error": f"Failed to get race results: {exc}"}

    if found is None:
        searched = _searched_years(cutoff)
        return {
            "results": [],
            "searched_years": searched,
            "note": (
                f"No Grand Prix at this circuit from {searched[-1]} to {searched[0]} "
                "before the cutoff"
            ),
        }

    year, event = found
    label = {"year": year, "event": str(event["EventName"]), "round": int(event["RoundNumber"])}

    if year >= OPENF1_FIRST_YEAR:
        try:
            session = race_session_at(year, race_start(event))
            if session is not None:
                rows = session_results({session["session_key"]})
                if rows:
                    drivers = driver_index({session["session_key"]})
                    return {**label, "results": race_result_rows(rows, drivers)[:10]}
        except Exception as exc:
            logger.warning(
                "OpenF1 results for %s %d failed (%s: %s); falling back to FastF1",
                label["event"],
                year,
                type(exc).__name__,
                exc,
            )

    try:
        session = load_race_session(year, label["round"])

        top_10 = session.results.head(10)[
            ["Position", "DriverNumber", "Abbreviation", "TeamName", "Points", "Status"]
        ]

        return {**label, "results": top_10.to_dict("records")}
    except Exception as exc:
        logger.warning("FastF1 results for %s %d failed (%s)", label["event"], year, exc)
        return {"error": f"Failed to get race results: {exc}"}


FormRows = tuple[list[dict[str, Any]], int]


def _openf1_form(driver_code: str, year: int, cutoff: datetime, wanted: int) -> FormRows:
    """The driver's results in the last ``wanted`` held races of ``year`` before ``cutoff``, and
    how many races that was, from OpenF1. Raises; the caller falls back to FastF1.
    """
    races, rows = held_races(year, cutoff)
    races = races[-wanted:]
    if not races:
        return [], 0
    keys = {race["session_key"] for race in races}
    drivers = driver_index(keys)
    number = next(
        (n for n, ident in drivers.items() if ident["name_acronym"] == driver_code),
        None,
    )
    by_session = {
        row["session_key"]: row
        for row in rows
        if row.get("session_key") in keys and row.get("driver_number") == number
    }

    results = []
    for race in races:
        row = by_session.get(race["session_key"])
        if row is None:
            continue
        results.append(
            {
                "year": year,
                "event": race["circuit_short_name"],
                "position": format_position(row.get("position") or 0),
                "points": float(row.get("points") or 0.0),
                "status": derive_status(row),
            }
        )
    return results, len(races)


def _fastf1_form(driver_code: str, year: int, cutoff: datetime, wanted: int) -> FormRows:
    """The same from FastF1: one session load per race, ~2.4s each. A race whose session will
    not load is dropped from the form rather than sinking the tool. Raises on a schedule
    failure."""
    schedule = get_schedule(year)
    events = [
        event
        for _, event in schedule.iterrows()
        if int(event["RoundNumber"]) != 0 and race_start(event) < cutoff
    ][-wanted:]

    results = []
    for event in events:
        try:
            session = load_race_session(year, int(event["RoundNumber"]))
            driver_result = session.results[session.results["Abbreviation"] == driver_code]
        except Exception:
            continue
        if driver_result.empty:
            continue
        result_data = driver_result.iloc[0]
        results.append(
            {
                "year": year,
                "event": event["EventName"],
                "position": format_position(result_data["Position"]),
                "points": float(result_data["Points"]),
                "status": result_data["Status"],
            }
        )
    return results, len(events)


def _season_form(driver_code: str, year: int, cutoff: datetime, wanted: int) -> FormRows:
    """One season's contribution: ``(results, races counted)``, OpenF1 first where covered."""
    if year >= OPENF1_FIRST_YEAR:
        try:
            return _openf1_form(driver_code, year, cutoff, wanted)
        except Exception as exc:
            logger.warning(
                "OpenF1 driver form for %s %d failed (%s: %s); falling back to FastF1",
                driver_code,
                year,
                type(exc).__name__,
                exc,
            )
    return _fastf1_form(driver_code, year, cutoff, wanted)


@tool
def get_driver_form(driver_code: str, as_of: str, num_races: int = 5) -> dict[str, Any]:
    """Get a driver's last N race results before the briefing's cutoff.

    Races are counted back from ``as_of``: the cutoff's own season first, reaching into the
    previous one only when too few had run — so early-season form is last season's tail, and
    the output names every season it covers. A cancelled race is not one of the N.

    Sprints are excluded — this is race form, and a sprint result on the 8-point scale
    alongside race results on the 25-point scale would distort both the points total and
    the average finish.

    Args:
        driver_code: Three-letter driver abbreviation (e.g., 'VER', 'HAM', 'LEC').
        as_of: The briefing's ISO-8601 cutoff; only races that started before it count.
        num_races: Number of recent races to analyse (default: 5).

    Returns:
        The driver's recent results oldest first, each with its season, plus ``seasons``;
        or an 'error' key on failure.
    """
    try:
        cutoff = parse_utc(as_of)
        results: list[dict[str, Any]] = []
        seasons: list[int] = []
        counted = 0
        for year in (cutoff.year, cutoff.year - 1):
            if counted >= num_races:
                break
            season_results, season_count = _season_form(
                driver_code, year, cutoff, num_races - counted
            )
            results = season_results + results
            counted += season_count
            if season_count:
                seasons.insert(0, year)
    except Exception as exc:
        logger.warning("Driver form for %s failed (%s: %s)", driver_code, type(exc).__name__, exc)
        return {"error": f"Failed to get driver form: {exc}"}

    numeric = [r["position"] for r in results if isinstance(r["position"], int)]
    return {
        "driver": driver_code,
        "seasons": seasons,
        "recent_results": results,
        "total_points_last_races": float(sum(r["points"] for r in results)),
        "average_finish": sum(numeric) / len(numeric) if numeric else None,
    }
