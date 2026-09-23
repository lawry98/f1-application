"""Tests for the derived championship standings tool.

OpenF1's own ``drivers_championship`` and ``teams_championship`` endpoints return
``{"detail": "No results found."}`` without authentication, so the table is summed from
``session_result.points`` instead. Three properties of that derivation are easy to get
wrong and each has a test below: sprints score on a different scale but still count,
qualifying must not count, and a team on zero points must still appear.
"""

import pytest
from freezegun import freeze_time

from tests.conftest import OPENF1_DRIVERS, OPENF1_RESULTS, OPENF1_SESSIONS_2024
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


# ── Cross-request cache ──────────────────────────────────────────────────────────────────
#
# routes.py clears the OpenF1 client cache after every request, so without a cache of its
# own each /standings view costs four OpenF1 requests against a 30 req/min ceiling. These
# tests call `openf1_client.clear()` between invocations to reproduce that route-level clear:
# a hit has to survive it, or it saves nothing in production.


def _calls_for_a_repeat(fake, *, between=None) -> int:
    """Invoke for 2024, clear the OpenF1 cache as routes.py does, invoke again.

    Returns how many OpenF1 requests the *second* invocation made.
    """
    from tools import openf1_client

    get_championship_standings.invoke({"year": 2024})
    openf1_client.clear()
    if between is not None:
        between()
    before = len(fake.calls)
    get_championship_standings.invoke({"year": 2024})
    return len(fake.calls) - before


def test_a_completed_season_is_served_without_touching_openf1(openf1_season):
    with freeze_time("2025-05-01"):
        assert _calls_for_a_repeat(openf1_season) == 0


def test_a_completed_season_does_not_expire(openf1_season):
    """A finished season cannot change, so no TTL applies — a month later is still a hit."""
    with freeze_time("2025-05-01") as frozen:
        assert _calls_for_a_repeat(openf1_season, between=lambda: frozen.tick(30 * 86400)) == 0


def test_a_repeat_hit_returns_the_same_table(openf1_season):
    with freeze_time("2025-05-01"):
        first = get_championship_standings.invoke({"year": 2024})
        second = get_championship_standings.invoke({"year": 2024})

    assert second == first


def test_a_hit_cannot_be_corrupted_by_mutating_an_earlier_result(openf1_season):
    """The cache outlives the request, so handing out the stored dict by reference would
    let one caller's in-place edit reach every later one.
    """
    with freeze_time("2025-05-01"):
        for _ in range(2):
            # The first pass edits the miss's result, the second a hit's.
            get_championship_standings.invoke({"year": 2024})["drivers"].clear()
        third = get_championship_standings.invoke({"year": 2024})

    assert len(third["drivers"]) == 5


def test_the_current_season_is_served_from_cache_within_the_ttl(openf1_season):
    with freeze_time("2024-06-01") as frozen:
        assert _calls_for_a_repeat(openf1_season, between=lambda: frozen.tick(299)) == 0


def test_the_current_season_refetches_once_the_ttl_has_passed(openf1_season):
    """The running season grows with every race, so it is only ever briefly cached."""
    with freeze_time("2024-06-01") as frozen:
        assert _calls_for_a_repeat(openf1_season, between=lambda: frozen.tick(301)) > 0


def test_a_zero_ttl_keeps_the_current_season_uncached(openf1_season, monkeypatch):
    from tools import standings_tools

    monkeypatch.setattr(standings_tools, "STANDINGS_TTL_SECONDS", 0)
    with freeze_time("2024-06-01"):
        assert _calls_for_a_repeat(openf1_season) > 0


def test_a_zero_ttl_still_caches_a_completed_season(openf1_season, monkeypatch):
    """The TTL governs only the running season; a finished one is immutable either way."""
    from tools import standings_tools

    monkeypatch.setattr(standings_tools, "STANDINGS_TTL_SECONDS", 0)
    with freeze_time("2025-05-01"):
        assert _calls_for_a_repeat(openf1_season) == 0


def test_a_season_not_started_is_cached_within_the_ttl(openf1_season):
    """January to the first race, every view of the new season would otherwise cost the
    sessions fetches — and the answer cannot change until a session is held.
    """
    with freeze_time("2024-01-15"):
        assert _calls_for_a_repeat(openf1_season) == 0
        assert get_championship_standings.invoke({"year": 2024})["reason"] == SEASON_NOT_STARTED


@pytest.mark.parametrize("today", ["2025-05-01", "2024-06-01"], ids=["completed", "current"])
def test_a_failure_is_never_cached(monkeypatch, today):
    """A 429 on one view must not become a persistent 502 — for good, or for a TTL."""
    from tests.factories import make_openf1_get
    from tools import openf1_client

    with freeze_time(today):
        # conftest's autouse fixture makes this first call a transport failure.
        assert "error" in get_championship_standings.invoke({"year": 2024})

        fake = make_openf1_get(
            {
                "sessions": OPENF1_SESSIONS_2024,
                "session_result": OPENF1_RESULTS,
                "drivers": OPENF1_DRIVERS,
            }
        )
        monkeypatch.setattr(openf1_client.requests, "get", fake)
        result = get_championship_standings.invoke({"year": 2024})

    assert "error" not in result
    assert len(fake.calls) > 0


def test_each_year_is_cached_separately(openf1_season):
    with freeze_time("2025-05-01"):
        get_championship_standings.invoke({"year": 2024})
        before = len(openf1_season.calls)
        get_championship_standings.invoke({"year": 2023})

    assert len(openf1_season.calls) > before
