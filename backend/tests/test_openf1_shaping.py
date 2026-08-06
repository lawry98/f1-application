"""Tests for the OpenF1 row → tool-contract converters.

These exist as their own module because ``fastf1_tools`` and ``f1_data_tools`` both need
identical conversion, and two private copies of ``derive_status`` would drift.

The Status derivation is the lossy part of the migration and the part most worth pinning:
FastF1 gives prose ("+1 Lap", "Accident", "Gearbox"), OpenF1 gives three booleans.
"""

from tools.openf1_shaping import derive_status, race_result_rows, top_finisher_rows

DRIVERS = {
    1: {"full_name": "Max VERSTAPPEN", "name_acronym": "VER", "team_name": "Red Bull Racing"},
    4: {"full_name": "Lando NORRIS", "name_acronym": "NOR", "team_name": "McLaren"},
    44: {"full_name": "Lewis HAMILTON", "name_acronym": "HAM", "team_name": "Ferrari"},
}


def test_a_clean_finish_is_finished():
    assert derive_status({"dnf": False, "dns": False, "dsq": False}) == "Finished"


def test_a_dnf_is_reported():
    assert derive_status({"dnf": True, "dns": False, "dsq": False}) == "DNF"


def test_a_dns_is_reported():
    assert derive_status({"dnf": False, "dns": True, "dsq": False}) == "DNS"


def test_a_dsq_is_reported():
    assert derive_status({"dnf": False, "dns": False, "dsq": True}) == "DSQ"


def test_dsq_outranks_dnf_and_dns():
    """A disqualified car is often also flagged dnf. DSQ is the more specific fact, and
    reporting it as a DNF would tell a reader the car broke rather than that it was
    thrown out.
    """
    assert derive_status({"dnf": True, "dns": True, "dsq": True}) == "DSQ"


def test_dns_outranks_dnf():
    assert derive_status({"dnf": True, "dns": True, "dsq": False}) == "DNS"


def test_missing_flags_default_to_finished():
    """OpenF1 omits keys rather than nulling them; absence must not crash."""
    assert derive_status({}) == "Finished"


def test_race_result_rows_match_the_fastf1_column_contract():
    """The keys here are the ones test_fastf1_tools.py asserts on. They cannot change."""
    rows = [{"session_key": 1, "position": 1, "driver_number": 1, "points": 25.0, "dnf": False}]

    assert race_result_rows(rows, DRIVERS) == [
        {
            "Position": 1,
            "DriverNumber": "1",
            "Abbreviation": "VER",
            "TeamName": "Red Bull Racing",
            "Points": 25.0,
            "Status": "Finished",
        }
    ]


def test_race_result_rows_report_an_unclassified_finish_as_dnf():
    """FastF1 encodes this as Position 0.0; format_position turns it into "DNF"."""
    rows = [{"session_key": 1, "position": 0, "driver_number": 4, "points": 0.0, "dnf": True}]

    assert race_result_rows(rows, DRIVERS)[0]["Position"] == "DNF"
    assert race_result_rows(rows, DRIVERS)[0]["Status"] == "DNF"


def test_race_result_rows_sort_by_position():
    """A range query returns rows in no guaranteed order; a briefing needs the order."""
    rows = [
        {"session_key": 1, "position": 4, "driver_number": 4, "points": 12.0},
        {"session_key": 1, "position": 1, "driver_number": 1, "points": 25.0},
    ]

    assert [row["Position"] for row in race_result_rows(rows, DRIVERS)] == [1, 4]


def test_race_result_rows_sort_unclassified_cars_last():
    """OpenF1 encodes "no finishing position" as 0, so an ascending sort would put every
    retirement above the winner. FastF1's frame orders DNFs last and these rows must match.
    """
    rows = [
        {"session_key": 1, "position": 0, "driver_number": 44, "points": 0.0, "dnf": True},
        {"session_key": 1, "position": 1, "driver_number": 1, "points": 25.0},
    ]

    assert [row["Position"] for row in race_result_rows(rows, DRIVERS)] == [1, "DNF"]


def test_top_finisher_rows_sort_unclassified_cars_last():
    rows = [
        {"session_key": 1, "position": 0, "driver_number": 44, "points": 0.0, "dnf": True},
        {"session_key": 1, "position": 1, "driver_number": 1, "points": 25.0},
    ]

    assert [row["position"] for row in top_finisher_rows(rows, DRIVERS)] == [1, "DNF"]


def test_race_result_rows_tolerate_an_unknown_driver_number():
    """A driver in the results but not the roster gets blanks, not a KeyError."""
    rows = [{"session_key": 1, "position": 1, "driver_number": 99, "points": 25.0}]

    shaped = race_result_rows(rows, DRIVERS)[0]
    assert shaped["Abbreviation"] == ""
    assert shaped["TeamName"] == ""


def test_top_finisher_rows_match_their_own_contract():
    """Different key names from race_result_rows — lowercase, and a full driver name."""
    rows = [{"session_key": 1, "position": 1, "driver_number": 1, "points": 25.0}]

    assert top_finisher_rows(rows, DRIVERS) == [
        {
            "position": 1,
            "driver": "Max VERSTAPPEN",
            "driver_code": "VER",
            "team": "Red Bull Racing",
            "points": 25.0,
        }
    ]


def test_top_finisher_rows_default_missing_points_to_zero():
    """Qualifying rows carry no points key. A None here would reach the LLM as null."""
    rows = [{"session_key": 1, "position": 1, "driver_number": 1}]

    assert top_finisher_rows(rows, DRIVERS)[0]["points"] == 0.0
