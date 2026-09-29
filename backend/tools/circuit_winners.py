"""Recent Grand Prix winners at one circuit, for the /circuits detail page and the agent.

A plain helper, not a ``@tool``. Two callers share it and its cache: the winners route, by
circuit id, and the agent's ``get_circuit_winners`` in ``f1_data_tools.py``, which resolves
the briefing's race location to a circuit id with ``circuit_id_for_location`` first.

**Matched by circuit, never by Grand Prix name.** ``fastf1_helpers.find_event`` is a
substring match on ``EventName``, and a Grand Prix is not a track: 2026's Spanish GP is
at Madrid while 2023-25's was at Barcelona, and FastF1 files the rescheduled 2026 Bahrain
GP under Kuala Lumpur. So each schedule row's ``Location`` is slugged and looked up in the
frontend's ``index.json`` — the same map, and the same aliases, the page draws with.
``location_slug`` is therefore a third copy of the slug rule; ``slug-cases.json`` pins
all three.

**Cached per (circuit, year), with no expiry.** The window is the three seasons before
the current one — the same window the agent's tool uses — and a finished season's winner
does not change, so there is nothing a TTL would refresh. A year the circuit did not host
is cached as an empty tuple; a year whose load *failed* is not cached at all, so a
transient FastF1 failure is not remembered as "never raced here". The key space is
bounded by the 40 ids in ``index.json`` — never by client input, because the route
rejects an unknown id before anything is stored.

**Single flight per circuit.** A cold circuit costs ~1.5s per hosted year (~4.6s for
three), so two people opening the same circuit at once would otherwise pay it twice. A
lock per circuit id serialises them; different circuits do not block each other.

The cache sits above FastF1, not above the OpenF1 client, so the routes'
``clear_openf1_cache()`` does not touch it and this module touches no OpenF1 at all.
"""

import copy
import json
import logging
import re
import threading
import unicodedata
from datetime import date
from typing import Any

import pandas as pd

from config import CIRCUIT_INDEX_PATH
from tools.fastf1_helpers import load_race_session
from tools.schedule_cache import get_schedule

logger = logging.getLogger(__name__)

UNKNOWN_CIRCUIT = "unknown_circuit"

# Seasons before the current one. Matches get_circuit_winners' own window.
WINDOW_YEARS = 3

_COMBINING_MARKS = re.compile(r"[̀-ͯ]")
_SEPARATORS = re.compile(r"[^a-z0-9]+")

_cache_lock = threading.Lock()
# (circuit_id, year) -> that year's winner rows; () means the circuit did not host that year.
_cache: dict[tuple[str, int], tuple[dict[str, Any], ...]] = {}
_circuit_locks: dict[str, threading.Lock] = {}
_index: dict[str, str] | None = None


def clear() -> None:
    """Drop every cached winner and the loaded index. Used by tests; harmless in production."""
    global _index
    with _cache_lock:
        _cache.clear()
        _circuit_locks.clear()
        _index = None


def location_slug(location: str) -> str:
    """Lowercase, strip accents, collapse everything else to single hyphens.

    Must stay identical to ``locationSlug`` in ``frontend/lib/circuit-geometry.ts`` and
    ``slug()`` in ``frontend/scripts/fetch-circuit-geometry.mjs``.
    """
    stripped = _COMBINING_MARKS.sub("", unicodedata.normalize("NFD", location)).lower()
    return _SEPARATORS.sub("-", stripped).strip("-")


def format_race_time(value: Any) -> str | None:
    """A winner's total race time as ``H:MM:SS.mmm``, or None when FastF1 has none."""
    if value is None or pd.isna(value):
        return None
    total_ms = round(pd.Timedelta(value).total_seconds() * 1000)
    hours, rest = divmod(total_ms, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    seconds, millis = divmod(rest, 1000)
    return f"{hours}:{minutes:02d}:{seconds:02d}.{millis:03d}"


def _circuit_index() -> dict[str, str]:
    global _index
    with _cache_lock:
        if _index is not None:
            return _index
    with open(CIRCUIT_INDEX_PATH, encoding="utf-8") as handle:
        loaded = json.load(handle)
    with _cache_lock:
        _index = loaded
    return loaded


def circuit_id_for_location(location: str) -> str | None:
    """The circuit id a FastF1 ``Location`` names, or None if the set does not carry it.

    Raises if the index cannot be read, so a caller can tell "unknown circuit" from "no map".
    """
    return _circuit_index().get(location_slug(location))


def _lock_for(circuit_id: str) -> threading.Lock:
    with _cache_lock:
        return _circuit_locks.setdefault(circuit_id, threading.Lock())


def _cached(circuit_id: str, year: int) -> tuple[dict[str, Any], ...] | None:
    with _cache_lock:
        return _cache.get((circuit_id, year))


def _store(circuit_id: str, year: int, rows: tuple[dict[str, Any], ...]) -> None:
    with _cache_lock:
        _cache[(circuit_id, year)] = copy.deepcopy(rows)


def _winner_row(year: int, event_name: str) -> dict[str, Any]:
    """The P1 row of one race. Raises on any failure, including a race with no P1 — for a
    finished season that means the load went wrong, not that nobody won, so it must not be
    cached as an answer.
    """
    classification = load_race_session(year, event_name).results
    winner = classification[classification["Position"] == 1]
    if winner.empty:
        raise LookupError(f"No P1 row for {year} {event_name}")
    row = winner.iloc[0]
    return {
        "year": year,
        "event": event_name,
        "driver": str(row["FullName"]),
        "driver_code": str(row["Abbreviation"]),
        "team": str(row["TeamName"]),
        "time": format_race_time(row["Time"]),
    }


def _winners_in(circuit_id: str, year: int, index: dict[str, str]) -> tuple[dict[str, Any], ...]:
    """Every race this circuit hosted in ``year``, in calendar order. Raises on failure."""
    schedule = get_schedule(year)
    rows = []
    for _, event in schedule.iterrows():
        # Round 0 is pre-season testing, which runs at Sakhir and is not a Grand Prix.
        if int(event["RoundNumber"]) == 0:
            continue
        if index.get(location_slug(str(event["Location"]))) != circuit_id:
            continue
        rows.append(_winner_row(year, str(event["EventName"])))
    return tuple(rows)


def get_recent_circuit_winners(circuit_id: str, years_back: int = WINDOW_YEARS) -> dict[str, Any]:
    """Winners at one circuit across the ``years_back`` seasons before this one.

    Args:
        circuit_id: A circuit id from ``index.json``'s values, e.g. ``it-1922``.
        years_back: How many seasons before the current one to cover.

    Returns:
        ``circuit_id``, ``from_year``, ``to_year`` (inclusive), ``winners`` newest first, and
        ``unavailable_years`` for any year whose load failed; or ``{"error": ...}`` —
        with ``reason: UNKNOWN_CIRCUIT`` when the id is not one this repo draws.
    """
    if years_back < 1:
        return {"error": f"years_back must be at least 1, got {years_back}"}

    try:
        index = _circuit_index()
    except Exception as exc:
        return {"error": f"Circuit index unavailable: {exc}"}

    if circuit_id not in set(index.values()):
        return {"error": f"Unknown circuit {circuit_id}", "reason": UNKNOWN_CIRCUIT}

    this_year = date.today().year
    years = list(range(this_year - years_back, this_year))
    winners: list[dict[str, Any]] = []
    unavailable: list[int] = []

    try:
        with _lock_for(circuit_id):
            for year in years:
                rows = _cached(circuit_id, year)
                if rows is None:
                    try:
                        rows = _winners_in(circuit_id, year, index)
                    except Exception as exc:
                        logger.warning(
                            "Winners for %s in %d unavailable: %s", circuit_id, year, exc
                        )
                        unavailable.append(year)
                        continue
                    _store(circuit_id, year, rows)
                winners.extend(copy.deepcopy(rows))
    except Exception as exc:
        return {"error": f"Failed to get circuit winners: {exc}"}

    if len(unavailable) == len(years):
        return {
            "error": f"No season from {years[0]} to {years[-1]} could be loaded for {circuit_id}"
        }

    # Stable, so two races in one year keep their calendar order.
    winners.sort(key=lambda row: row["year"], reverse=True)
    return {
        "circuit_id": circuit_id,
        "from_year": years[0],
        "to_year": years[-1],
        "winners": winners,
        "unavailable_years": unavailable,
    }
