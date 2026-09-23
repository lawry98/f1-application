"""Tests for the derived championship standings tool.

OpenF1's own ``drivers_championship`` and ``teams_championship`` endpoints return
``{"detail": "No results found."}`` without authentication, so the table is summed from
``session_result.points`` instead. Three properties of that derivation are easy to get
wrong and each has a test below: sprints score on a different scale but still count,
qualifying must not count, and a team on zero points must still appear.
"""

import pytest
from freezegun import freeze_time

from tools.standings_tools import SEASON_NOT_STARTED, get_championship_standings

# A driver who transfers mid-season: Team A for the early race, Team B for the later
# one. ``driver_index`` deliberately collapses this to Team B (the latest session wins),
# which is correct for "who does this driver race for now" and wrong for attributing a
# constructor's season points — the regression this fixture guards against.
_TRANSFER_SESSIONS = [
    {
        "session_key": 9700,
        "meeting_key": 1300,
        "session_name": "Race",
        "circuit_short_name": "Sakhir",
        "country_name": "Bahrain",
        "date_start": "2024-03-02T15:00:00+00:00",
    },
    {
        "session_key": 9701,
        "meeting_key": 1301,
        "session_name": "Race",
        "circuit_short_name": "Miami",
        "country_name": "United States",
        "date_start": "2024-04-06T20:00:00+00:00",
    },
]

_TRANSFER_DRIVERS = [
    {
        "session_key": 9700,
        "driver_number": 99,
        "full_name": "Trans Fer",
        "name_acronym": "TRA",
        "team_name": "Team A",
    },
    {
        "session_key": 9701,
        "driver_number": 99,
        "full_name": "Trans Fer",
        "name_acronym": "TRA",
        "team_name": "Team B",
    },
]

_TRANSFER_RESULTS = [
    {
        "session_key": 9700,
        "position": 1,
        "driver_number": 99,
        "points": 25.0,
        "dnf": False,
        "dns": False,
        "dsq": False,
    },
    {
        "session_key": 9701,
        "position": 2,
        "driver_number": 99,
        "points": 18.0,
        "dnf": False,
        "dns": False,
        "dsq": False,
    },
]


@pytest.fixture
def openf1_mid_season_transfer(monkeypatch):
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get(
        {
            "sessions": _TRANSFER_SESSIONS,
            "session_result": _TRANSFER_RESULTS,
            "drivers": _TRANSFER_DRIVERS,
        }
    )
    monkeypatch.setattr(openf1_client.requests, "get", fake)
    return fake


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

    # Guards the *request*, not just the result: this fixture happens to put Qualifying
    # last by date with a zero-point row, so an implementation that fetched every
    # session_name and never filtered at all would still land on the right answer here
    # by coincidence. Pinning that scoring_sessions asks OpenF1 for exactly Race and
    # Sprint is what catches that.
    session_name_requests = {
        call["params"]["session_name"]
        for call in openf1_season.calls
        if call["url"].endswith("/sessions") and "session_name" in call["params"]
    }
    assert session_name_requests == {"Race", "Sprint"}

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
def test_a_mid_season_transfer_splits_points_across_both_constructors(
    openf1_mid_season_transfer,
):
    """Driver 99 scores 25 for Team A, then transfers and scores 18 for Team B.

    ``driver_index`` collapses the driver to Team B (their latest team), which is right
    for the driver table's "who they race for now" but would be wrong here: crediting
    the whole 43 to Team B is exactly the bug this test guards against.
    """
    result = get_championship_standings.invoke({"year": 2024})

    teams = {row["team"]: row["points"] for row in result["constructors"]}
    assert teams["Team A"] == 25.0
    assert teams["Team B"] == 18.0
    assert sum(teams.values()) == 43.0

    # The driver table still reports the driver's current team, unaffected by the split.
    driver = next(row for row in result["drivers"] if row["driver_code"] == "TRA")
    assert driver["team"] == "Team B"
    assert driver["points"] == 43.0


@freeze_time("2024-06-01")
def test_a_driver_tie_breaks_on_grand_prix_countback(openf1_season):
    """HAM and TIE both finish the season on 30.0. HAM has two Grand Prix P3s and TIE none,
    so HAM must rank ahead. Sorting on points alone would leave the pair's order down
    to dict iteration, and an LLM reading a reshuffling table reports a different
    championship every time it is asked.
    """
    result = get_championship_standings.invoke({"year": 2024})

    tied = [row for row in result["drivers"] if row["points"] == 30.0]
    assert [row["driver_code"] for row in tied] == ["HAM", "TIE"]
    assert [row["position"] for row in tied] == [3, 4]


@freeze_time("2024-06-01")
def test_a_constructor_tie_breaks_on_grand_prix_countback(openf1_season):
    """Ferrari and Williams both finish on 30.0. Ferrari's two P3s beat Williams' three P4s,
    even though Williams is inserted into the roster first.
    """
    result = get_championship_standings.invoke({"year": 2024})

    tied = [row for row in result["constructors"] if row["points"] == 30.0]
    assert [row["team"] for row in tied] == ["Ferrari", "Williams"]


def test_a_year_before_coverage_is_an_error():
    """No FastF1 fallback: FastF1 has no standings source either, which is the whole
    reason this tool did not exist before. Not structurally the "season not started"
    case, so no `reason` key rides along — agent/graph.py's retry must not fire here.
    """
    result = get_championship_standings.invoke({"year": 2022})

    assert result == {"error": "Championship standings are only available from 2023 onwards."}
    assert "reason" not in result


@freeze_time("2024-01-15")
def test_a_season_with_no_completed_races_is_an_error(openf1_season):
    """The one error carrying `reason=SEASON_NOT_STARTED` — agent/graph.py's
    historical-year retry keys off this sibling field, not the error prose.
    """
    result = get_championship_standings.invoke({"year": 2024})

    assert result == {
        "error": "No completed races found for 2024 season yet",
        "reason": SEASON_NOT_STARTED,
    }


def test_a_transport_failure_becomes_an_error_not_a_raise():
    """conftest's autouse fixture blocks OpenF1, so this is the unpatched default. A
    transport failure, not a not-yet-started season, so it must not carry `reason` —
    that is what stops agent/graph.py's retry from substituting last season's table for
    what is really just a failed request.
    """
    result = get_championship_standings.invoke({"year": 2024})

    assert "error" in result
    assert "reason" not in result


@freeze_time("2024-06-01")
def test_the_whole_table_costs_three_requests(openf1_season):
    """One sessions fetch per session_name, one range query for results, one for drivers.
    Per-race looping would put a 24-race season over OpenF1's 30 req/min ceiling.
    """
    get_championship_standings.invoke({"year": 2024})

    assert len(openf1_season.calls) <= 4


# A race that is on the calendar, dated in the past, and never ran. OpenF1 keeps the session
# and its entry list but serves no result rows for it — the shape Imola 2023 and Bahrain and
# Saudi Arabia 2026 really have. 9801 is that race; 9800 is one that ran.
_CANCELLED_SESSIONS = [
    {
        "session_key": 9800,
        "meeting_key": 1400,
        "session_name": "Race",
        "circuit_short_name": "Sakhir",
        "country_name": "Bahrain",
        "date_start": "2024-03-02T15:00:00+00:00",
    },
    {
        "session_key": 9801,
        "meeting_key": 1401,
        "session_name": "Race",
        "circuit_short_name": "Imola",
        "country_name": "Italy",
        "date_start": "2024-05-19T13:00:00+00:00",
    },
]

_CANCELLED_DRIVERS = [
    {
        "session_key": key,
        "driver_number": 1,
        "full_name": "Max VERSTAPPEN",
        "name_acronym": "VER",
        "team_name": "Red Bull Racing",
    }
    for key in (9800, 9801)
]

_CANCELLED_RESULTS = [
    {
        "session_key": 9800,
        "position": 1,
        "driver_number": 1,
        "points": 25.0,
        "dnf": False,
        "dns": False,
        "dsq": False,
    },
]


def _serve_cancelled_season(monkeypatch, results):
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get(
        {
            "sessions": _CANCELLED_SESSIONS,
            "session_result": results,
            "drivers": _CANCELLED_DRIVERS,
        }
    )
    monkeypatch.setattr(openf1_client.requests, "get", fake)
    return fake


@freeze_time("2024-06-01")
def test_a_race_with_no_results_is_not_counted_as_completed(monkeypatch):
    """Both races are dated before today; only one produced a classification.

    Counting by date reports 2 here — the bug that had the real 2026 table claiming 16 races
    completed when 14 had run, and 2023 claiming 23 of FastF1's 22 rounds.
    """
    _serve_cancelled_season(monkeypatch, _CANCELLED_RESULTS)

    result = get_championship_standings.invoke({"year": 2024})

    assert result["races_completed"] == 1
    # An empty race adds no points, so the table itself was never wrong — only the count.
    assert result["drivers"][0]["points"] == 25.0


@freeze_time("2024-06-01")
def test_a_season_whose_past_sessions_have_no_results_has_not_started(monkeypatch):
    """Every past session was cancelled, or none has published a classification yet.

    Before this the tool returned the whole roster on zero points, with races_completed
    counting the cancellations — a table no caller should render as a championship.
    """
    _serve_cancelled_season(monkeypatch, [])

    result = get_championship_standings.invoke({"year": 2024})

    assert result == {
        "error": "No completed races found for 2024 season yet",
        "reason": SEASON_NOT_STARTED,
    }


# One driver under two car numbers: Bearman raced #38 for Ferrari in one 2024 race (6 pts) and
# #50 for Haas in a later one (1 pt). Keyed by car number, the table listed him twice.
_TWO_NUMBER_DRIVERS = [
    {
        "session_key": 9700,
        "driver_number": 38,
        "full_name": "Oliver BEARMAN",
        "name_acronym": "BEA",
        "team_name": "Ferrari",
    },
    {
        "session_key": 9701,
        "driver_number": 50,
        "full_name": "Oliver BEARMAN",
        "name_acronym": "BEA",
        "team_name": "Haas F1 Team",
    },
]

_TWO_NUMBER_RESULTS = [
    {
        "session_key": 9700,
        "position": 7,
        "driver_number": 38,
        "points": 6.0,
        "dnf": False,
        "dns": False,
        "dsq": False,
    },
    {
        "session_key": 9701,
        "position": 10,
        "driver_number": 50,
        "points": 1.0,
        "dnf": False,
        "dns": False,
        "dsq": False,
    },
]


@pytest.fixture
def openf1_one_driver_two_numbers(monkeypatch):
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get(
        {
            "sessions": _TRANSFER_SESSIONS,
            "session_result": _TWO_NUMBER_RESULTS,
            "drivers": _TWO_NUMBER_DRIVERS,
        }
    )
    monkeypatch.setattr(openf1_client.requests, "get", fake)
    return fake


@freeze_time("2024-06-01")
def test_a_driver_who_raced_two_numbers_is_one_row(openf1_one_driver_two_numbers):
    """Rows are per driver, not per car number: the points are summed across both numbers,
    and the row names the team from the driver's latest session.
    """
    result = get_championship_standings.invoke({"year": 2024})

    assert result["drivers"] == [
        {
            "position": 1,
            "driver": "Oliver BEARMAN",
            "driver_code": "BEA",
            "team": "Haas F1 Team",
            "points": 7.0,
        }
    ]


@freeze_time("2024-06-01")
def test_a_driver_who_raced_two_numbers_still_scores_for_both_teams(
    openf1_one_driver_two_numbers,
):
    result = get_championship_standings.invoke({"year": 2024})

    teams = {row["team"]: row["points"] for row in result["constructors"]}
    assert teams == {"Ferrari": 6.0, "Haas F1 Team": 1.0}


# A season whose first weekend is a sprint weekend, frozen on the Sunday before the race: one held
# scoring session, and it is not a Race. (A session counts from the day after its date.)
_SPRINT_ONLY_SESSIONS = [
    {
        "session_key": 9900,
        "meeting_key": 1500,
        "session_name": "Sprint",
        "circuit_short_name": "Shanghai",
        "country_name": "China",
        "date_start": "2024-04-20T03:00:00+00:00",
    },
    {
        "session_key": 9901,
        "meeting_key": 1500,
        "session_name": "Race",
        "circuit_short_name": "Shanghai",
        "country_name": "China",
        "date_start": "2024-04-21T07:00:00+00:00",
    },
]

_SPRINT_ONLY_DRIVERS = [
    {
        "session_key": 9900,
        "driver_number": 1,
        "full_name": "Max VERSTAPPEN",
        "name_acronym": "VER",
        "team_name": "Red Bull Racing",
    },
]

_SPRINT_ONLY_RESULTS = [
    {
        "session_key": 9900,
        "position": 1,
        "driver_number": 1,
        "points": 8.0,
        "dnf": False,
        "dns": False,
        "dsq": False,
    },
]


@freeze_time("2024-04-21T01:00:00")
def test_a_held_sprint_with_no_held_race_is_a_table_with_no_races(monkeypatch):
    """Not "season not started": that is reserved for no scoring session having results. The
    page tells the two apart by whether the tables are empty, so a sprint-only table must come
    back as a real table with races_completed == 0.
    """
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get(
        {
            "sessions": _SPRINT_ONLY_SESSIONS,
            "session_result": _SPRINT_ONLY_RESULTS,
            "drivers": _SPRINT_ONLY_DRIVERS,
        }
    )
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    result = get_championship_standings.invoke({"year": 2024})

    assert "reason" not in result
    assert result["races_completed"] == 0
    assert result["drivers"] == [
        {
            "position": 1,
            "driver": "Max VERSTAPPEN",
            "driver_code": "VER",
            "team": "Red Bull Racing",
            "points": 8.0,
        }
    ]
    assert result["constructors"] == [{"position": 1, "team": "Red Bull Racing", "points": 8.0}]


# A tie the sprint and the Grand Prix countback decide in opposite directions — the shape of
# Albon and Ricciardo on 12 points in 2024, where Ricciardo's P4 in the Miami sprint was the
# best result either of them had, and the table put him ahead of the official order. The FIA
# counts back over Grand Prix results only.
#
#   ALB #23 (Williams): GP P7 (6) + GP P9 (2)       = 8, best GP finish P7
#   RIC  #3 (RB):       Sprint P5 (4) + GP P8 (4)   = 8, best GP finish P8, best overall P5
#
# Both confounds point at RIC: his sprint P5 is the best position either holds, his number is
# lower, and "RB" sorts before "Williams". Only a Grand Prix countback puts ALB — and Williams
# — ahead, so dropping the Race-only filter inverts both tables.
_COUNTBACK_SESSIONS = [
    {
        "session_key": 9950,
        "meeting_key": 1600,
        "session_name": "Race",
        "circuit_short_name": "Sakhir",
        "country_name": "Bahrain",
        "date_start": "2024-03-02T15:00:00+00:00",
    },
    {
        "session_key": 9951,
        "meeting_key": 1601,
        "session_name": "Sprint",
        "circuit_short_name": "Miami",
        "country_name": "United States",
        "date_start": "2024-05-04T16:00:00+00:00",
    },
    {
        "session_key": 9952,
        "meeting_key": 1601,
        "session_name": "Race",
        "circuit_short_name": "Miami",
        "country_name": "United States",
        "date_start": "2024-05-05T20:00:00+00:00",
    },
]

_COUNTBACK_DRIVERS = [
    {
        "session_key": key,
        "driver_number": number,
        "full_name": full_name,
        "name_acronym": acronym,
        "team_name": team,
    }
    for key in (9950, 9951, 9952)
    for number, full_name, acronym, team in (
        (23, "Alexander ALBON", "ALB", "Williams"),
        (3, "Daniel RICCIARDO", "RIC", "RB"),
    )
]


def _row(session_key, position, number, points):
    return {
        "session_key": session_key,
        "position": position,
        "driver_number": number,
        "points": points,
        "dnf": False,
        "dns": False,
        "dsq": False,
    }


_COUNTBACK_RESULTS = [
    _row(9950, 7, 23, 6.0),
    _row(9950, 11, 3, 0.0),
    _row(9951, 5, 3, 4.0),
    _row(9951, 9, 23, 0.0),
    _row(9952, 8, 3, 4.0),
    _row(9952, 9, 23, 2.0),
]


def _serve(monkeypatch, sessions, drivers, results):
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get({"sessions": sessions, "session_result": results, "drivers": drivers})
    monkeypatch.setattr(openf1_client.requests, "get", fake)
    return fake


@freeze_time("2024-06-01")
def test_a_driver_tie_counts_back_over_grand_prix_results_only(monkeypatch):
    _serve(monkeypatch, _COUNTBACK_SESSIONS, _COUNTBACK_DRIVERS, _COUNTBACK_RESULTS)

    result = get_championship_standings.invoke({"year": 2024})

    assert [(row["driver_code"], row["points"]) for row in result["drivers"]] == [
        ("ALB", 8.0),
        ("RIC", 8.0),
    ]


@freeze_time("2024-06-01")
def test_a_constructor_tie_counts_back_over_grand_prix_results_only(monkeypatch):
    _serve(monkeypatch, _COUNTBACK_SESSIONS, _COUNTBACK_DRIVERS, _COUNTBACK_RESULTS)

    result = get_championship_standings.invoke({"year": 2024})

    assert result["constructors"] == [
        {"position": 1, "team": "Williams", "points": 8.0},
        {"position": 2, "team": "RB", "points": 8.0},
    ]


# Countback is "most wins, then most 2nds, and so on" — a count at each position, not just the
# best one. Both drivers have one Grand Prix win, so a best-position tie-break ties them and
# falls through to the car number, which favours BBB (#2). AAA's other finish is a P5, BBB's a P6.
#
#   AAA #9: GP P1 (25) + GP P5 (10)                 = 35
#   BBB #2: GP P6 (8) + Sprint P7 (2) + GP P1 (25)  = 35
_DEEP_COUNTBACK_DRIVERS = [
    {
        "session_key": key,
        "driver_number": number,
        "full_name": full_name,
        "name_acronym": acronym,
        "team_name": team,
    }
    for key in (9950, 9951, 9952)
    for number, full_name, acronym, team in (
        (9, "Driver AAA", "AAA", "Zeta"),
        (2, "Driver BBB", "BBB", "Alpha"),
    )
]

_DEEP_COUNTBACK_RESULTS = [
    _row(9950, 1, 9, 25.0),
    _row(9950, 6, 2, 8.0),
    _row(9951, 7, 2, 2.0),
    _row(9951, 9, 9, 0.0),
    _row(9952, 1, 2, 25.0),
    _row(9952, 5, 9, 10.0),
]


@freeze_time("2024-06-01")
def test_a_driver_tie_counts_back_past_the_best_result(monkeypatch):
    _serve(monkeypatch, _COUNTBACK_SESSIONS, _DEEP_COUNTBACK_DRIVERS, _DEEP_COUNTBACK_RESULTS)

    result = get_championship_standings.invoke({"year": 2024})

    assert [(row["driver_code"], row["points"]) for row in result["drivers"]] == [
        ("AAA", 35.0),
        ("BBB", 35.0),
    ]


# A constructor's countback pools every car's Grand Prix finishes. Each team's best car
# finishes P3, so a best-car-only countback ties them and falls through to the name, which
# favours Alpha. Zeta's other car has a P4; Alpha's a P5.
#
#   Zeta:  P3 (15) + P4 (12)                 = 27
#   Alpha: P5 (10) + Sprint P7 (2) + P3 (15) = 27
_TEAM_COUNTBACK_DRIVERS = [
    {
        "session_key": key,
        "driver_number": number,
        "full_name": f"Driver {acronym}",
        "name_acronym": acronym,
        "team_name": team,
    }
    for key in (9950, 9951, 9952)
    for number, acronym, team in (
        (11, "ZEA", "Zeta"),
        (12, "ZEB", "Zeta"),
        (21, "ALA", "Alpha"),
        (22, "ALB", "Alpha"),
    )
]

_TEAM_COUNTBACK_RESULTS = [
    _row(9950, 3, 11, 15.0),
    _row(9950, 5, 22, 10.0),
    _row(9951, 7, 22, 2.0),
    _row(9952, 3, 21, 15.0),
    _row(9952, 4, 12, 12.0),
]


@freeze_time("2024-06-01")
def test_a_constructor_tie_counts_back_over_every_car(monkeypatch):
    _serve(monkeypatch, _COUNTBACK_SESSIONS, _TEAM_COUNTBACK_DRIVERS, _TEAM_COUNTBACK_RESULTS)

    result = get_championship_standings.invoke({"year": 2024})

    assert result["constructors"] == [
        {"position": 1, "team": "Zeta", "points": 27.0},
        {"position": 2, "team": "Alpha", "points": 27.0},
    ]


# Level on points *and* on the Grand Prix countback: both teams hold one P5 and one P10. The
# FIA would nominate here; the table falls back to the team name so the order is stable. Zeta
# has the better sprint finish (P6 to Alpha's P7 and P8), so a countback that let sprints in
# would put Zeta first.
#
#   Zeta:  P5 (10) + Sprint P6 (3) + P10 (1)                 = 14
#   Alpha: P10 (1) + Sprint P7 (2) + Sprint P8 (1) + P5 (10) = 14
_LEVEL_COUNTBACK_RESULTS = [
    _row(9950, 5, 11, 10.0),
    _row(9950, 10, 21, 1.0),
    _row(9951, 6, 12, 3.0),
    _row(9951, 7, 21, 2.0),
    _row(9951, 8, 22, 1.0),
    _row(9952, 5, 21, 10.0),
    _row(9952, 10, 11, 1.0),
]


@freeze_time("2024-06-01")
def test_a_constructor_tie_level_on_countback_falls_back_to_the_name(monkeypatch):
    _serve(monkeypatch, _COUNTBACK_SESSIONS, _TEAM_COUNTBACK_DRIVERS, _LEVEL_COUNTBACK_RESULTS)

    result = get_championship_standings.invoke({"year": 2024})

    assert result["constructors"] == [
        {"position": 1, "team": "Alpha", "points": 14.0},
        {"position": 2, "team": "Zeta", "points": 14.0},
    ]
