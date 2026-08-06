"""HTTP client for the OpenF1 API — a plain helper, not an LLM-callable tool.

Same category as ``fastf1_helpers.py`` and ``schedule_cache.py``: adding a file to
``tools/`` does not make it a tool.

Two design points carry the migration.

**The range-query pattern.** OpenF1 supports comparison filters on any non-array
attribute, so N sessions cost one request spanning ``min(keys)..max(keys)``, with
unwanted rows dropped in Python. This is what turns ``get_driver_form``'s five
sequential 2.4s FastF1 session loads into a single sub-second call. It also keeps the
tool fan-out under OpenF1's unauthenticated 3 req/s, 30 req/min ceiling — a
request-per-race loop is the one shape that would breach it.

**This module raises.** The never-raise contract belongs at the ``@tool`` boundary,
where a failure has to become ``{"error": ...}``. A client that swallowed transport
errors could not be distinguished from one that found no data, and the tools need that
distinction to decide whether to fall back to FastF1.
"""

import logging
import threading
from typing import Any

import requests

logger = logging.getLogger(__name__)

OPENF1_BASE_URL = "https://api.openf1.org/v1"
OPENF1_TIMEOUT = 15.0

# OpenF1 coverage begins with the 2023 season; `sessions?year=2022` returns
# {"detail": "No results found."}. Every coverage check in the codebase reads this
# constant so the tools and the API route cannot disagree about the boundary.
OPENF1_FIRST_YEAR = 2023

_lock = threading.Lock()
_cache: dict[tuple[str, frozenset], list[dict[str, Any]]] = {}


class OpenF1Error(RuntimeError):
    """A non-200 from OpenF1. Transport failures surface as requests exceptions."""


def clear() -> None:
    """Clear the cached responses. Used by tests; harmless in production."""
    with _lock:
        _cache.clear()


def _get(endpoint: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    """Fetch and cache one endpoint+params combination.

    The lock is released during the request, exactly as in ``schedule_cache.py``:
    concurrent misses must not serialise network I/O, and a duplicate fetch of the same
    key is acceptable (last write wins). Failures are deliberately not cached — one blip
    would otherwise poison the process for its lifetime.
    """
    key = (endpoint, frozenset(params.items()))
    with _lock:
        if key in _cache:
            return _cache[key]

    response = requests.get(f"{OPENF1_BASE_URL}/{endpoint}", params=params, timeout=OPENF1_TIMEOUT)
    if response.status_code != 200:
        raise OpenF1Error(f"OpenF1 {endpoint} returned HTTP {response.status_code}")

    payload = response.json()
    # A miss is `{"detail": "No results found."}`, not an empty array. Normalising it to
    # [] here is what lets every caller treat "no data" as a falsy list.
    rows = payload if isinstance(payload, list) else []

    with _lock:
        _cache[key] = rows
    return rows


def _range_params(keys: set[int]) -> dict[str, Any]:
    """Build the one-request span covering every key in the set."""
    return {"session_key>=": min(keys), "session_key<=": max(keys)}


def list_sessions(year: int, session_name: str | None = None) -> list[dict[str, Any]]:
    """Return the year's sessions, optionally narrowed to one session_name.

    Args:
        year: Season to query.
        session_name: Exact OpenF1 name — "Race", "Sprint", "Qualifying", "Practice 1"…
            Filtering happens server-side when given.

    Returns:
        Session dicts carrying session_key, meeting_key, session_name,
        circuit_short_name, country_name, and date_start. Empty when OpenF1 has no data.
    """
    params: dict[str, Any] = {"year": year}
    if session_name is not None:
        params["session_name"] = session_name
    result = _get("sessions", params)
    if session_name is not None:
        result = [s for s in result if s.get("session_name") == session_name]
    return result


def session_results(keys: set[int]) -> list[dict[str, Any]]:
    """Return classification rows for exactly the given session keys, in one request.

    Args:
        keys: Session keys wanted. An empty set makes no request.

    Returns:
        Rows carrying position, driver_number, points, dnf, dns, dsq, duration and
        gap_to_leader. Rows whose session_key is not in ``keys`` are dropped — the range
        query sweeps in practice and qualifying sessions that fall inside the span.

        Note that qualifying rows carry no ``points`` key at all, so callers summing
        points must still filter by session_name upstream rather than relying on that.
    """
    if not keys:
        return []
    rows = _get("session_result", _range_params(keys))
    return [row for row in rows if row.get("session_key") in keys]


def driver_index(keys: set[int]) -> dict[int, dict[str, str]]:
    """Map driver_number to identity across the given sessions, in one request.

    ``session_result`` carries only ``driver_number``, so every tool that reports a name
    or a team needs this join.

    Args:
        keys: Session keys to draw the roster from.

    Returns:
        driver_number → {full_name, name_acronym, team_name}. Where a driver appears in
        several sessions the *latest* session wins, so a mid-season team change reports
        the team the driver is in now rather than the one they started the year in.
    """
    if not keys:
        return {}
    rows = [row for row in _get("drivers", _range_params(keys)) if row.get("session_key") in keys]

    index: dict[int, dict[str, str]] = {}
    for row in sorted(rows, key=lambda r: r.get("session_key", 0)):
        number = row.get("driver_number")
        if number is None:
            continue
        index[number] = {
            "full_name": row.get("full_name", ""),
            "name_acronym": row.get("name_acronym", ""),
            "team_name": row.get("team_name", ""),
        }
    return index
