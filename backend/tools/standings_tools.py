"""Derived championship standings — the one tool with no FastF1 equivalent.

``SYNTHESIZER_PROMPT`` has always asked for a "Championship Context" section citing
current standings, and until now no tool supplied one: FastF1 exposes per-session
classification, not a cumulative table, and OpenF1's own ``drivers_championship`` and
``teams_championship`` endpoints return ``{"detail": "No results found."}`` without a
paid subscription. So the table is summed here from per-session points.

If OpenF1 authentication is ever added, those endpoints replace this module wholesale.
"""

import logging
from datetime import date
from typing import Any

from langchain_core.tools import tool

from tools.openf1_client import (
    OPENF1_FIRST_YEAR,
    driver_index,
    driver_teams_by_session,
    session_results,
)
from tools.openf1_races import scoring_sessions

logger = logging.getLogger(__name__)

# Sibling `reason` value for the pre-season error below. `_invoke_tool` in agent/graph.py
# keys its historical-year retry off this — do not delete it as unused.
SEASON_NOT_STARTED = "season_not_started"


def _season_not_started(year: int) -> dict[str, Any]:
    return {
        "error": f"No completed races found for {year} season yet",
        "reason": SEASON_NOT_STARTED,
    }


@tool
def get_championship_standings(year: int) -> dict[str, Any]:
    """Get the driver and constructor championship tables for a season.

    Points are summed across every completed Race and Sprint session. A session counts as
    completed once it has produced results, so a cancelled race is neither scored nor counted
    in races_completed. Only seasons from OPENF1_FIRST_YEAR onwards are available, which is
    where OpenF1's coverage begins.

    Args:
        year: Season to query.

    Returns:
        Dictionary with 'drivers' and 'constructors' tables and 'races_completed', or an
        'error' key on failure.
    """
    if year < OPENF1_FIRST_YEAR:
        return {
            "error": f"Championship standings are only available from {OPENF1_FIRST_YEAR} onwards."
        }

    try:
        today = date.today()
        sessions = [
            session
            for session in scoring_sessions(year)
            if date.fromisoformat(session["date_start"][:10]) < today
        ]
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
        best_position: dict[str | int, int] = {}

        # Seeded from every team a driver has raced for this season (not just their
        # *current* one from `drivers`), so a scoreless team still appears and a
        # mid-season transfer doesn't quietly drop the driver's former team from the
        # table before any points are added to it.
        team_points: dict[str, float] = dict.fromkeys(driver_teams.values(), 0.0)

        for row in rows:
            number = row.get("driver_number")
            if number not in drivers:
                continue
            identity = _identity(number)
            row_points = float(row.get("points") or 0.0)
            points[identity] += row_points

            position = row.get("position")
            if isinstance(position, int) and position > 0:
                best_position[identity] = min(best_position.get(identity, position), position)

            # The team the driver was actually racing for *in this session* — not
            # `drivers[number]["team_name"]`, which is collapsed to their latest team and
            # would credit an entire season's points to whichever side of a transfer a
            # driver ended up on.
            session_key = row.get("session_key")
            team = driver_teams.get((session_key, number)) or drivers[number]["team_name"]
            team_points[team] = team_points.get(team, 0.0) + row_points

        # Ties break on best finishing position, then on driver number (the latest one).
        # Points alone would let two equal drivers swap places between runs, and an LLM
        # reading a reshuffling table reports a different championship each time it is asked.
        def _driver_sort_key(identity: str | int) -> tuple[float, int, int]:
            return (-points[identity], best_position.get(identity, 99), current_number[identity])

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
                sorted(team_points, key=lambda t: (-team_points[t], t)), start=1
            )
        ]

        races_completed = sum(
            1 for s in sessions if s["session_name"] == "Race" and s["session_key"] in held
        )
        logger.info(
            "Standings for %d: %d drivers, %d constructors, %d races",
            year,
            len(driver_table),
            len(constructor_table),
            races_completed,
        )

        return {
            "year": year,
            "races_completed": races_completed,
            "drivers": driver_table,
            "constructors": constructor_table,
        }
    except Exception as exc:
        return {"error": f"Failed to get championship standings: {exc}"}
