"""FastF1-based tools for track info, race results, and driver form.

The two result tools here answer as of the briefing's ``as_of`` cutoff (ADR-0004), never as
of today: a past race is briefed from its Thursday, so a race that ran after it — including
the one being briefed — must not reach the prompt.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import pandas as pd
from langchain_core.tools import tool

from tools.circuit_winners import circuit_record, events_at_circuit
from tools.cutoff import parse_utc
from tools.fastf1_helpers import classified_position, load_race_session, race_start
from tools.openf1_client import (
    OPENF1_FIRST_YEAR,
    driver_index,
    drivers_by_session,
    session_results,
)
from tools.openf1_races import held_races, race_session_at
from tools.openf1_shaping import race_result_rows, result_position
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

        top_10 = session.results.head(10)
        top_10 = top_10.assign(Position=top_10["ClassifiedPosition"].map(classified_position))[
            ["Position", "DriverNumber", "Abbreviation", "TeamName", "Points", "Status"]
        ]

        return {**label, "results": top_10.to_dict("records")}
    except Exception as exc:
        logger.warning("FastF1 results for %s %d failed (%s)", label["event"], year, exc)
        return {"error": f"Failed to get race results: {exc}"}


# A Grand Prix result is a classified place, or why there is none.
Result = int | str


@dataclass(frozen=True)
class _Finish:
    """One driver's Grand Prix: who, for whom, and how it ended."""

    code: str
    name: str
    team: str
    result: Result
    points: float


@dataclass(frozen=True)
class _GrandPrix:
    year: int
    label: str
    finishes: list[_Finish]


def _openf1_grands_prix(year: int, cutoff: datetime, wanted: int) -> tuple[list[_GrandPrix], int]:
    """The last ``wanted`` held Grands Prix of ``year`` before ``cutoff``, every car in each, and
    how many that was. Raises; the caller falls back to FastF1.

    Costs nothing a briefing has not already asked for. The results span is ``held_races``',
    which standings and the top finishers share, and the roster is drawn from the season's
    held races rather than the window's because that is the ``drivers`` span
    ``get_recent_top_finishers`` requests.
    """
    races, rows = held_races(year, cutoff)
    if not races:
        return [], 0
    drivers = drivers_by_session({race["session_key"] for race in races})
    window = races[-wanted:]

    by_session: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        by_session.setdefault(row.get("session_key"), []).append(row)

    grands_prix = []
    for race in window:
        key = race["session_key"]
        finishes = []
        for row in by_session.get(key, []):
            number = row.get("driver_number")
            identity = drivers.get((key, number))
            if identity is None:
                continue
            finishes.append(
                _Finish(
                    code=identity["name_acronym"] or f"#{number}",
                    name=identity["full_name"],
                    team=identity["team_name"],
                    result=result_position(row),
                    points=float(row.get("points") or 0.0),
                )
            )
        grands_prix.append(_GrandPrix(year, race["circuit_short_name"], finishes))
    return grands_prix, len(window)


def _fastf1_grands_prix(year: int, cutoff: datetime, wanted: int) -> tuple[list[_GrandPrix], int]:
    """The same from FastF1: one session load per race, 1.5-1.9s each (five measured at 8.1s,
    inside the fan-out's 25s). A race whose session will not load is dropped from the window
    rather than sinking the tool. Raises on a schedule failure."""
    schedule = get_schedule(year)
    events = [
        event
        for _, event in schedule.iterrows()
        if int(event["RoundNumber"]) != 0 and race_start(event) < cutoff
    ][-wanted:]

    grands_prix = []
    for event in events:
        try:
            results = load_race_session(year, int(event["RoundNumber"])).results
        except Exception as exc:
            logger.warning(
                "FastF1 results for %s %d failed (%s); left out of driver form",
                event["EventName"],
                year,
                exc,
            )
            continue
        finishes = [
            _Finish(
                code=row["Abbreviation"],
                name=row["FullName"],
                team=row["TeamName"],
                result=classified_position(row["ClassifiedPosition"]),
                points=float(row["Points"]),
            )
            for _, row in results.iterrows()
        ]
        label = str(event["EventName"]).replace(" Grand Prix", " GP")
        grands_prix.append(_GrandPrix(year, label, finishes))
    return grands_prix, len(events)


def _season_grands_prix(year: int, cutoff: datetime, wanted: int) -> tuple[list[_GrandPrix], int]:
    """One season's contribution and how many races it counted, OpenF1 first where covered."""
    if year >= OPENF1_FIRST_YEAR:
        try:
            return _openf1_grands_prix(year, cutoff, wanted)
        except Exception as exc:
            logger.warning(
                "OpenF1 driver form for %d failed (%s: %s); falling back to FastF1",
                year,
                type(exc).__name__,
                exc,
            )
    return _fastf1_grands_prix(year, cutoff, wanted)


def _form_row(code: str, entries: list[tuple[_GrandPrix, _Finish]], window: int) -> str:
    """One driver's form as one line — compact enough that a whole grid is ~3 KB."""
    latest = entries[-1][1]
    earlier = list(dict.fromkeys(f.team for _, f in entries if f.team != latest.team))
    team = latest.team + (f" (earlier {', '.join(earlier)})" if earlier else "")
    finishes = ", ".join(
        f"{gp.label} {'P' if isinstance(f.result, int) else ''}{f.result}" for gp, f in entries
    )
    places = [f.result for _, f in entries if isinstance(f.result, int)]
    average = f"avg P{sum(places) / len(places):.1f}" if places else "no classified finish"
    points = sum(f.points for _, f in entries)
    dnfs = sum(1 for _, f in entries if f.result == "DNF")
    return (
        f"{code} {latest.name}, {team}: {finishes} | {points:g} pts, {average}, "
        f"{dnfs} DNF, {len(entries)}/{window} races"
    )


def _form_rows(window: list[_GrandPrix]) -> list[str]:
    """A row for every driver who started at least one Grand Prix in the window, by points,
    then average finish. Keyed by acronym, never car number, which can change hands."""
    entries: dict[str, list[tuple[_GrandPrix, _Finish]]] = {}
    for gp in window:
        for finish in gp.finishes:
            entries.setdefault(finish.code, []).append((gp, finish))

    def standing(code: str) -> tuple[float, float, str]:
        finishes = [f for _, f in entries[code]]
        places = [f.result for f in finishes if isinstance(f.result, int)]
        average = sum(places) / len(places) if places else float("inf")
        return (-sum(f.points for f in finishes), average, code)

    started = [code for code, rows in entries.items() if any(f.result != "DNS" for _, f in rows)]
    return [_form_row(code, entries[code], len(window)) for code in sorted(started, key=standing)]


@tool
def get_driver_form(as_of: str, num_races: int = 5) -> dict[str, Any]:
    """Get every driver's results in the last N Grands Prix before the briefing's cutoff.

    Races are counted back from ``as_of``: the cutoff's own season first, reaching into the
    previous one only when too few had run — so early-season form is last season's tail, and
    the output names every season it covers. A cancelled race is not one of the N.

    Sprints are excluded — this is race form, and a sprint result on the 8-point scale
    alongside race results on the 25-point scale would distort both the points total and
    the average finish.

    Each driver is one line rather than an object: the synthesizer serialises tool data with
    ``indent=2``, where a list of ``{race, position}`` objects for 22 drivers came to 15.8 KB.

    Args:
        as_of: The briefing's ISO-8601 cutoff; only races that started before it count.
        num_races: Number of recent Grands Prix to cover (default: 5).

    Returns:
        ``seasons``, ``grands_prix`` (oldest first, each with its season) and ``drivers``: one
        line per driver who started any of them — code, name, team, each race's result
        (``P<n>``, ``DNF``, ``DNS`` or ``DSQ``), points, average classified finish, DNFs and
        races entered; or an 'error' key on failure.
    """
    try:
        cutoff = parse_utc(as_of)
        window: list[_GrandPrix] = []
        counted = 0
        for year in (cutoff.year, cutoff.year - 1):
            if counted >= num_races:
                break
            grands_prix, season_count = _season_grands_prix(year, cutoff, num_races - counted)
            window = grands_prix + window
            counted += season_count
        return {
            "seasons": sorted({gp.year for gp in window}),
            "grands_prix": [f"{gp.year} {gp.label}" for gp in window],
            "drivers": _form_rows(window),
        }
    except Exception as exc:
        logger.warning("Driver form as of %s failed (%s: %s)", as_of, type(exc).__name__, exc)
        return {"error": f"Failed to get driver form: {exc}"}
