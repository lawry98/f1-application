"""Convert OpenF1 rows into the shapes the existing tools already return.

A plain helper, not an LLM-callable tool.

This module exists so the two tool modules do not each grow a private copy of the
conversion. The ``Status`` derivation in particular is the lossy edge of the migration
and belongs in exactly one place.
"""

from typing import Any

from tools.fastf1_helpers import format_position

# Sorts unclassified cars to the back. OpenF1 encodes "no finishing position" as 0, so a
# naive ascending sort puts every retirement *above* the winner. FastF1's results frame
# already orders DNFs last, and these rows have to match it.
_UNCLASSIFIED_SORT_RANK = 999


def _position_sort_key(row: dict[str, Any]) -> int:
    position = row.get("position")
    if not isinstance(position, int) or position <= 0:
        return _UNCLASSIFIED_SORT_RANK
    return position


def derive_status(row: dict[str, Any]) -> str:
    """Collapse OpenF1's three retirement booleans into a FastF1-style Status string.

    This is a genuine loss of fidelity. FastF1 reports *why* a car stopped — "+1 Lap",
    "Accident", "Gearbox", "Hydraulics" — because it reads the classification feed's own
    prose. OpenF1 exposes only ``dnf``/``dns``/``dsq``, so a briefing built on the OpenF1
    path can say a car retired but not what broke.

    Precedence is DSQ, then DNS, then DNF, most specific first: a disqualified car is
    frequently flagged ``dnf`` as well, and reporting that as a DNF would tell a reader
    the car failed rather than that it was excluded.
    """
    if row.get("dsq"):
        return "DSQ"
    if row.get("dns"):
        return "DNS"
    if row.get("dnf"):
        return "DNF"
    return "Finished"


def race_result_rows(
    rows: list[dict[str, Any]], drivers: dict[int, dict[str, str]]
) -> list[dict[str, Any]]:
    """Shape rows into ``get_recent_race_results``' PascalCase column contract.

    The keys mirror the FastF1 ``session.results`` columns that tool selects, because
    ``tests/test_fastf1_tools.py`` asserts on the exact key set and the migration's
    acceptance criterion is that it keeps passing.

    ``DriverNumber`` is a string: FastF1's results frame indexes drivers by string
    number, and the existing fixtures encode it that way.
    """
    shaped = []
    for row in sorted(rows, key=_position_sort_key):
        identity = drivers.get(row.get("driver_number"), {})
        shaped.append(
            {
                "Position": format_position(row.get("position") or 0),
                "DriverNumber": str(row.get("driver_number", "")),
                "Abbreviation": identity.get("name_acronym", ""),
                "TeamName": identity.get("team_name", ""),
                "Points": float(row.get("points") or 0.0),
                "Status": derive_status(row),
            }
        )
    return shaped


def top_finisher_rows(
    rows: list[dict[str, Any]], drivers: dict[int, dict[str, str]]
) -> list[dict[str, Any]]:
    """Shape rows into ``get_recent_top_finishers``' lowercase contract.

    Deliberately not the same shape as ``race_result_rows``: the two tools return
    different key names today, and unifying them would be a contract change wearing a
    refactor's clothes.
    """
    shaped = []
    for row in sorted(rows, key=_position_sort_key):
        identity = drivers.get(row.get("driver_number"), {})
        shaped.append(
            {
                "position": format_position(row.get("position") or 0),
                "driver": identity.get("full_name", ""),
                "driver_code": identity.get("name_acronym", ""),
                "team": identity.get("team_name", ""),
                "points": float(row.get("points") or 0.0),
            }
        )
    return shaped
