"""Derived championship standings — the one tool with no FastF1 equivalent.

``SYNTHESIZER_PROMPT`` has always asked for a "Championship Context" section citing
current standings, and until now no tool supplied one: FastF1 exposes per-session
classification, not a cumulative table, and OpenF1's own ``drivers_championship`` and
``teams_championship`` endpoints return ``{"detail": "No results found."}`` without a
paid subscription. So the table is summed here from per-session points.

If OpenF1 authentication is ever added, those endpoints replace this module wholesale.

**The table is cached per year, across requests.** ``api/routes.py`` clears the OpenF1
client cache after every request, so without this each /standings view cost four OpenF1
requests against the free tier's 30 req/min — a public page rate-limited at about seven
views a minute. The freshness policy is the year:

- A **completed** season (``year < date.today().year``) is kept for the life of the process.
  The calendar year, not "the last race has been held", is the test on purpose: the final
  race's classification can still move for days afterwards (OpenF1 publication lag, the
  stewards' 14-day right of review), and the season always ends in early December, so the
  year boundary is a margin that needs no data to decide.
- The **running** season is kept for ``STANDINGS_TTL_SECONDS`` (0 disables it), which bounds
  its cost at four requests per TTL however many people are looking.
- A failure is never cached, so one 429 cannot become a persistent outage. "Season not
  started" is the exception for the running season — it is an answer, not a failure, and
  from January to the first race it is the answer every view gets.

A briefing passes ``as_of`` (ADR-0004), and only sessions that *started* before that instant
count — the table a reader saw before the weekend, not the season's final one. The key is
``(year, as_of)``. /standings passes none, and that path is exactly the policy above. With a
cutoff, a completed season is still kept for good, and so is any cutoff before today: nothing
that started before a past instant is still moving. A cutoff of today — every upcoming race's
— is the running season again, under the TTL, because yesterday's race may still be
publishing. "Season not started" under a cutoff is TTL-only, like the running season's.

Process-local and unevicted, as in ADR-0003. The key space is one entry per season plus one
per briefed race weekend, bounded by the calendar. Two concurrent misses on one key both
derive the table; the OpenF1 client's single-flight collapses their identical requests while
they overlap.
"""

import copy
import logging
import threading
import time
from collections import Counter
from datetime import date
from typing import Any

from langchain_core.tools import tool

from config import STANDINGS_TTL_SECONDS
from tools.cutoff import parse_utc
from tools.openf1_client import (
    OPENF1_FIRST_YEAR,
    driver_index,
    driver_teams_by_session,
    session_results,
)
from tools.openf1_races import scoring_sessions

logger = logging.getLogger(__name__)

# Sibling `reason` value for the pre-season error below. `_invoke_tool` in agent/graph.py
# keys its previous-season retry off this — do not delete it as unused.
SEASON_NOT_STARTED = "season_not_started"


def _countback(finishes: Counter[int], depth: int) -> tuple[int, ...]:
    """Sort key for the FIA tie-break: most wins, then most 2nds, and so on down to ``depth``.

    Negated so that an ascending sort puts the better record first.
    """
    return tuple(-finishes[place] for place in range(1, depth + 1))


# (year, as_of) -> (monotonic expiry, or None for an immutable table; the tool's result).
_cache_lock = threading.Lock()
_cache: dict[tuple[int, str | None], tuple[float | None, dict[str, Any]]] = {}


def clear() -> None:
    """Clear the cached tables. Used by tests; harmless in production."""
    with _cache_lock:
        _cache.clear()


def _season_not_started(year: int) -> dict[str, Any]:
    return {
        "error": f"No completed races found for {year} season yet",
        "reason": SEASON_NOT_STARTED,
    }


def _cached(year: int, as_of: str | None) -> dict[str, Any] | None:
    with _cache_lock:
        entry = _cache.get((year, as_of))
    if entry is None:
        return None
    expires_at, result = entry
    if expires_at is not None and time.monotonic() >= expires_at:
        return None
    # A copy: the cache outlives the request, and a caller editing its result in place
    # must not reach every later caller.
    return copy.deepcopy(result)


def _is_immutable(year: int, as_of: str | None) -> bool:
    """Whether nothing this table counts can still change: a finished season, or a cutoff
    before today. A cutoff of today is not — the race it follows may still be publishing."""
    today = date.today()
    if year < today.year:
        return True
    return as_of is not None and parse_utc(as_of).date() < today


def _store(year: int, as_of: str | None, result: dict[str, Any]) -> None:
    not_started = result.get("reason") == SEASON_NOT_STARTED
    if "error" in result and not not_started:
        return
    if _is_immutable(year, as_of) and not not_started:
        expires_at = None
    elif as_of is None and year < date.today().year:
        # A finished season with no results is an outage, not an answer: /standings' own rule.
        return
    else:
        if STANDINGS_TTL_SECONDS <= 0:
            return
        expires_at = time.monotonic() + STANDINGS_TTL_SECONDS
    with _cache_lock:
        _cache[(year, as_of)] = (expires_at, copy.deepcopy(result))


@tool
def get_championship_standings(year: int, as_of: str | None = None) -> dict[str, Any]:
    """Get the driver and constructor championship tables for a season.

    Points are summed across every completed Race and Sprint session. A session counts as
    completed once it has produced results, so a cancelled race is neither scored nor counted
    in races_completed. Only seasons from OPENF1_FIRST_YEAR onwards are available, which is
    where OpenF1's coverage begins.

    Args:
        year: Season to query.
        as_of: Optional ISO-8601 cutoff. When given, only sessions that started before it are
            scored or counted — the table as it stood then. Without it, every session dated
            before today counts, which is what /standings serves.

    Returns:
        Dictionary with 'drivers' and 'constructors' tables and 'races_completed' (plus
        'as_of' when one was given), or an 'error' key on failure.
    """
    if year < OPENF1_FIRST_YEAR:
        return {
            "error": f"Championship standings are only available from {OPENF1_FIRST_YEAR} onwards."
        }

    cached = _cached(year, as_of)
    if cached is not None:
        return cached

    result = _derive_standings(year, as_of)
    _store(year, as_of, result)
    return result


def _counts(session: dict[str, Any], as_of: str | None) -> bool:
    """Whether a scoring session falls inside the table's window.

    Without a cutoff this is the date-level test /standings has always used. With one it is an
    instant: a sprint that started at 16:00 is in a table as of 16:01 and not one as of 15:59.
    """
    if as_of is None:
        return date.fromisoformat(session["date_start"][:10]) < date.today()
    return parse_utc(session["date_start"]) < parse_utc(as_of)


def _derive_standings(year: int, as_of: str | None) -> dict[str, Any]:
    """Sum the tables from OpenF1. Never raises; a failure is ``{"error": ...}``."""
    try:
        sessions = [session for session in scoring_sessions(year) if _counts(session, as_of)]
        if not sessions:
            return _season_not_started(year)

        keys = {session["session_key"] for session in sessions}
        drivers = driver_index(keys)
        driver_teams = driver_teams_by_session(keys)
        rows = session_results(keys)

        # A session is *held* once it has produced a classification, not once its date has
        # passed. A cancelled race keeps its OpenF1 session and entry list and serves no result
        # rows — Imola 2023, Bahrain and Saudi Arabia 2026 — so the date-based count reported 16
        # races for a 2026 season that had run 14. It never touched the points (an empty race
        # adds none); it corrupted the count, which is the number the briefing and /standings
        # both quote.
        held = {row.get("session_key") for row in rows}
        if not held:
            return _season_not_started(year)

        # Rows are per *driver*, not per car number. A driver can race two numbers in a
        # season — Bearman drove #38 for Ferrari and #50 for Haas in 2024 — and a table keyed
        # by number listed him twice. The identity is the acronym, falling back to the number
        # when OpenF1 serves none.
        def _identity(number: int) -> str | int:
            return drivers[number]["name_acronym"] or number

        # Each number's latest session, the same "highest session_key wins" convention
        # `driver_index` uses. It decides which of a driver's numbers the row reports.
        latest_session: dict[int, int] = {}
        for session_key, number in driver_teams:
            latest_session[number] = max(latest_session.get(number, session_key), session_key)

        # Seeded from the roster rather than from the results, so a driver — and
        # therefore a team — who has scored nothing all season still appears. Without
        # this a real 11-team grid renders as 10 teams the moment one of them is on zero.
        # Walked oldest-first, so each driver ends up mapped to the number they raced last.
        current_number: dict[str | int, int] = {}
        for number in sorted(drivers, key=lambda n: (latest_session.get(n, 0), n)):
            current_number[_identity(number)] = number
        points: dict[str | int, float] = dict.fromkeys(current_number, 0.0)

        # The FIA breaks a tie on points by counting back over *Grand Prix* finishes only.
        # Sprints score points but never enter the countback — a best-position tie-break
        # over both put Ricciardo (P4 in the 2024 Miami sprint) ahead of Albon, level on 12,
        # the reverse of the official order.
        race_keys = {s["session_key"] for s in sessions if s["session_name"] == "Race"}
        gp_finishes: dict[str | int, Counter[int]] = {i: Counter() for i in current_number}

        # Seeded from every team a driver has raced for this season (not just their
        # *current* one from `drivers`), so a scoreless team still appears and a
        # mid-season transfer doesn't quietly drop the driver's former team from the
        # table before any points are added to it.
        team_points: dict[str, float] = dict.fromkeys(driver_teams.values(), 0.0)
        # A constructor's countback pools every one of its cars' finishes.
        team_gp_finishes: dict[str, Counter[int]] = {t: Counter() for t in team_points}

        for row in rows:
            number = row.get("driver_number")
            if number not in drivers:
                continue
            identity = _identity(number)
            row_points = float(row.get("points") or 0.0)
            points[identity] += row_points

            # The team the driver was actually racing for *in this session* — not
            # `drivers[number]["team_name"]`, which is collapsed to their latest team and
            # would credit an entire season's points to whichever side of a transfer a
            # driver ended up on.
            session_key = row.get("session_key")
            team = driver_teams.get((session_key, number)) or drivers[number]["team_name"]
            team_points[team] = team_points.get(team, 0.0) + row_points

            # An unclassified row carries position None (not 0) and holds no place to count.
            position = row.get("position")
            if session_key in race_keys and isinstance(position, int) and position > 0:
                gp_finishes[identity][position] += 1
                team_gp_finishes.setdefault(team, Counter())[position] += 1

        depth = max((place for finishes in gp_finishes.values() for place in finishes), default=0)

        # Ties break on the Grand Prix countback, then on driver number (the latest one) where
        # the FIA would nominate. Points alone would let two equal drivers swap places between
        # runs, and an LLM reading a reshuffling table reports a different championship each
        # time it is asked.
        def _driver_sort_key(identity: str | int) -> tuple[float, tuple[int, ...], int]:
            return (
                -points[identity],
                _countback(gp_finishes[identity], depth),
                current_number[identity],
            )

        driver_table = []
        for rank, identity in enumerate(sorted(points, key=_driver_sort_key), start=1):
            # Name, code and team from the driver's latest session.
            latest = drivers[current_number[identity]]
            driver_table.append(
                {
                    "position": rank,
                    "driver": latest["full_name"],
                    "driver_code": latest["name_acronym"],
                    "team": latest["team_name"],
                    "points": points[identity],
                }
            )

        constructor_table = [
            {"position": rank, "team": team, "points": team_points[team]}
            for rank, team in enumerate(
                sorted(
                    team_points,
                    key=lambda t: (-team_points[t], _countback(team_gp_finishes[t], depth), t),
                ),
                start=1,
            )
        ]

        races_completed = len(race_keys & held)
        logger.info(
            "Standings for %d: %d drivers, %d constructors, %d races",
            year,
            len(driver_table),
            len(constructor_table),
            races_completed,
        )

        table = {
            "year": year,
            "races_completed": races_completed,
            "drivers": driver_table,
            "constructors": constructor_table,
        }
        if as_of is not None:
            table["as_of"] = as_of
        return table
    except Exception as exc:
        # No FastF1 fallback here, so this is a briefing's missing Championship Context or a
        # /standings 502 — logged, still returned as a value.
        logger.warning("Standings for %d unavailable (%s: %s)", year, type(exc).__name__, exc)
        return {"error": f"Failed to get championship standings: {exc}"}
