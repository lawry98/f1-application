"""Tests for the derived championship standings tool.

OpenF1's own ``drivers_championship`` and ``teams_championship`` endpoints return
``{"detail": "No results found."}`` without authentication, so the table is summed from
``session_result.points`` instead. Three properties of that derivation are easy to get
wrong and each has a test below: sprints score on a different scale but still count,
qualifying must not count, and a team on zero points must still appear.
"""

from freezegun import freeze_time

from tools.standings_tools import get_championship_standings


@freeze_time("2024-06-01")
def test_drivers_table_sums_races_and_sprints(openf1_season):
    """VER: 25 (Sakhir) + 7 (Miami sprint) + 18 (Miami) + 25 (Monaco) = 75.
    NOR: 18 + 8 (sprint) + 25 + 18 = 69.
    """
    result = get_championship_standings.invoke({"year": 2024})

    points = {row["driver_code"]: row["points"] for row in result["drivers"]}
    assert points["VER"] == 75.0
    assert points["NOR"] == 69.0


@freeze_time("2024-06-01")
def test_sprint_points_are_included(openf1_season):
    """The 8/7 sprint scale is real points. Dropping them undercounts a sprint weekend."""
    result = get_championship_standings.invoke({"year": 2024})

    points = {row["driver_code"]: row["points"] for row in result["drivers"]}
    # Without the Miami sprint's 8 points NOR would sit on 61, behind HAM's 30 by less.
    assert points["NOR"] == 69.0


@freeze_time("2024-06-01")
def test_qualifying_is_excluded(openf1_season):
    """Session 9511 is a Qualifying with a P1 for driver 1 and no points key at all.

    Filtering on session_name rather than on the presence of points is what makes this
    safe the day OpenF1 starts returning points: 0 for qualifying rows.
    """
    result = get_championship_standings.invoke({"year": 2024})

    assert result["races_completed"] == 3
    assert {row["driver_code"] for row in result["drivers"]} == {
        "VER",
        "NOR",
        "HAM",
        "TIE",
        "ZER",
    }


@freeze_time("2024-06-01")
def test_a_scoreless_team_still_appears(openf1_season):
    """Driver 50 / Cadillac scores nothing all season. Summing points alone drops them,
    which is how a real 11-team grid renders as 10 teams.
    """
    result = get_championship_standings.invoke({"year": 2024})

    cadillac = [row for row in result["constructors"] if row["team"] == "Cadillac"]
    assert cadillac == [{"position": 5, "team": "Cadillac", "points": 0.0}]


@freeze_time("2024-06-01")
def test_a_scoreless_driver_still_appears(openf1_season):
    result = get_championship_standings.invoke({"year": 2024})

    scoreless = [row for row in result["drivers"] if row["driver_code"] == "ZER"]
    assert scoreless[0]["points"] == 0.0


@freeze_time("2024-06-01")
def test_positions_are_dense_and_start_at_one(openf1_season):
    result = get_championship_standings.invoke({"year": 2024})

    assert [row["position"] for row in result["drivers"]] == [1, 2, 3, 4, 5]
    assert [row["position"] for row in result["constructors"]] == [1, 2, 3, 4, 5]


@freeze_time("2024-06-01")
def test_constructors_sum_every_car_in_a_team(openf1_season):
    """Each fixture team fields one driver, so these pin the aggregation mechanism rather
    than asserting an arithmetic coincidence between two cars.
    """
    result = get_championship_standings.invoke({"year": 2024})

    teams = {row["team"]: row["points"] for row in result["constructors"]}
    assert teams["Red Bull Racing"] == 75.0
    assert teams["McLaren"] == 69.0
    assert teams["Ferrari"] == 30.0
    assert teams["Williams"] == 30.0


@freeze_time("2024-06-01")
def test_a_driver_tie_breaks_on_best_finishing_position(openf1_season):
    """HAM and TIE both finish the season on 30.0. HAM's best result is a P3 and TIE's a
    P4, so HAM must rank ahead. Sorting on points alone would leave the pair's order down
    to dict iteration, and an LLM reading a reshuffling table reports a different
    championship every time it is asked.
    """
    result = get_championship_standings.invoke({"year": 2024})

    tied = [row for row in result["drivers"] if row["points"] == 30.0]
    assert [row["driver_code"] for row in tied] == ["HAM", "TIE"]
    assert [row["position"] for row in tied] == [3, 4]


@freeze_time("2024-06-01")
def test_a_constructor_tie_breaks_alphabetically(openf1_season):
    """Ferrari and Williams both finish on 30.0. Neither has a driver-level tiebreak to
    inherit, so the team name decides and the order is stable.
    """
    result = get_championship_standings.invoke({"year": 2024})

    tied = [row for row in result["constructors"] if row["points"] == 30.0]
    assert [row["team"] for row in tied] == ["Ferrari", "Williams"]


def test_a_year_before_coverage_is_an_error():
    """No FastF1 fallback: FastF1 has no standings source either, which is the whole
    reason this tool did not exist before.
    """
    result = get_championship_standings.invoke({"year": 2022})

    assert result == {"error": "Championship standings are only available from 2023 onwards."}


@freeze_time("2024-01-15")
def test_a_season_with_no_completed_races_is_an_error(openf1_season):
    result = get_championship_standings.invoke({"year": 2024})

    assert result == {"error": "No completed races found for 2024 season yet"}


def test_a_transport_failure_becomes_an_error_not_a_raise():
    """conftest's autouse fixture blocks OpenF1, so this is the unpatched default."""
    result = get_championship_standings.invoke({"year": 2024})

    assert "error" in result


@freeze_time("2024-06-01")
def test_the_whole_table_costs_three_requests(openf1_season):
    """One sessions fetch per session_name, one range query for results, one for drivers.
    Per-race looping would put a 24-race season over OpenF1's 30 req/min ceiling.
    """
    get_championship_standings.invoke({"year": 2024})

    assert len(openf1_season.calls) <= 4
