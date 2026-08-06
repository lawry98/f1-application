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

from tools.openf1_client import OPENF1_FIRST_YEAR, driver_index, session_results
from tools.openf1_races import scoring_sessions

logger = logging.getLogger(__name__)


@tool
def get_championship_standings(year: int) -> dict[str, Any]:
    """Get the driver and constructor championship tables for a season.

    Points are summed across every completed Race and Sprint session. Only seasons from
    OPENF1_FIRST_YEAR onwards are available, which is where OpenF1's coverage begins.

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
            return {"error": f"No completed races found for {year} season yet"}

        keys = {session["session_key"] for session in sessions}
        drivers = driver_index(keys)
        rows = session_results(keys)

        # Seeded from the roster rather than from the results, so a driver — and
        # therefore a team — who has scored nothing all season still appears. Without
        # this a real 11-team grid renders as 10 teams the moment one of them is on zero.
        points: dict[int, float] = dict.fromkeys(drivers, 0.0)
        best_position: dict[int, int] = {}

        for row in rows:
            number = row.get("driver_number")
            if number not in points:
                continue
            points[number] += float(row.get("points") or 0.0)
            position = row.get("position")
            if isinstance(position, int) and position > 0:
                best_position[number] = min(best_position.get(number, position), position)

        # Ties break on best finishing position, then on driver number. Points alone
        # would let two equal drivers swap places between runs, and an LLM reading a
        # reshuffling table reports a different championship each time it is asked.
        def _driver_sort_key(number: int) -> tuple[float, int, int]:
            return (-points[number], best_position.get(number, 99), number)

        driver_table = [
            {
                "position": rank,
                "driver": drivers[number]["full_name"],
                "driver_code": drivers[number]["name_acronym"],
                "team": drivers[number]["team_name"],
                "points": points[number],
            }
            for rank, number in enumerate(sorted(points, key=_driver_sort_key), start=1)
        ]

        team_points: dict[str, float] = {}
        for number, identity in drivers.items():
            team = identity["team_name"]
            team_points[team] = team_points.get(team, 0.0) + points[number]

        constructor_table = [
            {"position": rank, "team": team, "points": team_points[team]}
            for rank, team in enumerate(
                sorted(team_points, key=lambda t: (-team_points[t], t)), start=1
            )
        ]

        races_completed = sum(1 for s in sessions if s["session_name"] == "Race")
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
