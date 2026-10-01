"""Convert OpenF1 rows into the shapes the existing tools already return.

A plain helper, not an LLM-callable tool.

This module exists so the two tool modules do not each grow a private copy of the
conversion. The ``Status`` derivation in particular is the lossy edge of the migration
and belongs in exactly one place.
"""

from typing import Any

# Sorts unclassified cars to the back. OpenF1 sends `None` for "no finishing position"
# (0 is tolerated defensively below, but not what the live API actually returns), so a
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


def result_position(row: dict[str, Any]) -> int | str:
    """A row's classified place, or 'DNF', 'DSQ' or 'DNS' — what FastF1's ``ClassifiedPosition``
    says on the other path.

    A classified place wins over the ``dnf`` flag: a car that ran 90% of the distance is
    classified though it retired (Bottas, Baku 2026: ``position: 16``, ``dnf: True``). An
    unclassified one carries ``position: None``."""
    status = derive_status(row)
    if status in ("DSQ", "DNS"):
        return status
    position = row.get("position")
    return position if isinstance(position, int) and position > 0 else "DNF"


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
                "Position": result_position(row),
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
                "position": result_position(row),
                "driver": identity.get("full_name", ""),
                "driver_code": identity.get("name_acronym", ""),
                "team": identity.get("team_name", ""),
                "points": float(row.get("points") or 0.0),
            }
        )
    return shaped
