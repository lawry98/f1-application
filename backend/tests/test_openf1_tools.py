"""Tests for the three migrated result tools on their OpenF1 path, and their FastF1
fallbacks. ``get_circuit_winners`` is the fourth result tool but stays FastF1-only —
see its docstring in ``f1_data_tools.py`` — so it is not covered here.

The pre-existing ``test_fastf1_tools.py`` covers all four tools on the FastF1 path
and must keep passing untouched — that is the migration's acceptance criterion. It gets
that path for free because conftest's autouse ``_block_openf1_network`` makes every
unpatched OpenF1 call a transport failure.

Which means the risk this module carries is specific: an implementation that always
falls through to FastF1 would satisfy every test over there. So the first test below
asserts the OpenF1 request actually happens, and the FastF1 seam is left poisoned in
the OpenF1-path tests so a fallthrough is a loud failure rather than a quiet pass.
"""

from typing import Any

import fastf1
import pytest
from freezegun import freeze_time

from tests.conftest import FROZEN_NOW

# race_session is defined in test_fastf1_tools.py, not conftest.py; importing it here is
# the standard pytest pattern for sharing a fixture across modules without editing the
# file test_fastf1_tools.py that must stay untouched. Each use as a test parameter below
# is flagged by ruff as a redefinition (F811), which is a false positive for this pattern.
from tests.test_fastf1_tools import race_session  # noqa: F401
from tools.f1_data_tools import get_recent_top_finishers
from tools.fastf1_tools import get_driver_form, get_recent_race_results
from tools.openf1_races import find_race_session


def _boom(*args: Any, **kwargs: Any):
    raise AssertionError("FastF1 must not be reached on the OpenF1 path")


@pytest.fixture
def no_fastf1(monkeypatch):
    """Poison the FastF1 seam so a silent fallthrough fails loudly."""
    monkeypatch.setattr(fastf1, "get_session", _boom)


# ── get_recent_race_results ──────────────────────────────────────────────────


def test_race_results_come_from_openf1(openf1_season, no_fastf1):
    result = get_recent_race_results.invoke({"event_name": "Monte Carlo", "year": 2024})

    assert result["year"] == 2024
    assert result["event"] == "Monte Carlo"
    # HAM retired (position 0) and must land last, not first.
    assert [row["Abbreviation"] for row in result["results"]] == ["VER", "NOR", "TIE", "HAM"]
    assert set(result["results"][0]) == {
        "Position",
        "DriverNumber",
        "Abbreviation",
        "TeamName",
        "Points",
        "Status",
    }


def test_race_results_actually_issue_an_openf1_request(openf1_season, no_fastf1):
    """Guards the failure mode the rest of the suite cannot see: an implementation that
    always falls through to FastF1 passes every test in test_fastf1_tools.py.
    """
    get_recent_race_results.invoke({"event_name": "Monte Carlo", "year": 2024})

    assert openf1_season.calls, "no OpenF1 request was made"


def test_race_results_report_the_dnf_from_the_boolean_flags(openf1_season, no_fastf1):
    result = get_recent_race_results.invoke({"event_name": "Monte Carlo", "year": 2024})

    retirement = next(row for row in result["results"] if row["Abbreviation"] == "HAM")
    assert retirement["Position"] == "DNF"
    assert retirement["Status"] == "DNF"


def test_race_results_fall_back_to_fastf1_before_2023(
    monkeypatch,
    openf1_season,
    race_session,  # noqa: F811
):
    """2022 is outside OpenF1 coverage, so the FastF1 path must run and no OpenF1
    request should be attempted at all.
    """
    result = get_recent_race_results.invoke({"event_name": "Monaco Grand Prix", "year": 2022})

    assert result["year"] == 2022
    assert [row["Abbreviation"] for row in result["results"]] == ["VER", "NOR", "HAM"]
    assert openf1_season.calls == []


def test_race_results_fall_back_when_openf1_has_no_such_race(
    openf1_season,
    race_session,  # noqa: F811
):
    """An in-coverage year whose event OpenF1 does not know still has a FastF1 answer."""
    result = get_recent_race_results.invoke({"event_name": "Nürburgring", "year": 2024})

    assert "error" not in result
    assert [row["Abbreviation"] for row in result["results"]] == ["VER", "NOR", "HAM"]


def test_race_results_error_when_both_sources_fail(monkeypatch):
    """conftest blocks OpenF1; poisoning FastF1 too leaves nothing. Never raise."""
    monkeypatch.setattr(fastf1, "get_session", _boom)

    result = get_recent_race_results.invoke({"event_name": "Monte Carlo", "year": 2024})

    assert "error" in result


# ── get_recent_top_finishers ─────────────────────────────────────────────────


@freeze_time("2024-06-01")
def test_top_finishers_come_from_the_last_completed_openf1_race(openf1_season, no_fastf1):
    result = get_recent_top_finishers.invoke({"year": 2024})

    assert result["last_race"] == "Monte Carlo"
    assert result["top_finishers"][0] == {
        "position": 1,
        "driver": "Max VERSTAPPEN",
        "driver_code": "VER",
        "team": "Red Bull Racing",
        "points": 25.0,
    }
    assert result["top_finishers"][-1]["position"] == "DNF"


@freeze_time("2024-06-01")
def test_top_finishers_keep_the_not_cumulative_note(openf1_season, no_fastf1):
    """The note stops the LLM reading one race's order as a championship table. The
    planner can select this tool without selecting get_championship_standings, so the
    risk it guards against survives the new tool.
    """
    result = get_recent_top_finishers.invoke({"year": 2024})

    assert result["note"] == "Positions from most recent race (not cumulative season standings)"


@freeze_time("2024-06-01")
def test_top_finishers_ignore_sprints_and_qualifying(openf1_season, no_fastf1):
    """Miami's Sprint is a day before its Race and qualifying is between them. The most
    recent *race* is what this tool reports, so neither may be picked as "last_race".
    """
    result = get_recent_top_finishers.invoke({"year": 2024})

    assert result["last_race"] == "Monte Carlo"
    assert len(result["top_finishers"]) == 4


@freeze_time("2024-01-15")
def test_top_finishers_report_a_season_with_no_completed_races(openf1_season, no_fastf1):
    result = get_recent_top_finishers.invoke({"year": 2024})

    assert result == {"error": "No completed races found for 2024 season yet"}


@freeze_time(FROZEN_NOW)
def test_top_finishers_fall_back_to_fastf1_before_2023(
    monkeypatch,
    openf1_season,
    season_2025,
    race_session,  # noqa: F811
):
    from tools import f1_data_tools

    monkeypatch.setattr(f1_data_tools, "get_schedule", lambda year: season_2025)

    result = get_recent_top_finishers.invoke({"year": 2022})

    assert result["last_race"] == "Miami Grand Prix"
    assert openf1_season.calls == []


# ── find_race_session: ambiguous-country regression ─────────────────────────
#
# Defined locally rather than folded into conftest's OPENF1_SESSIONS_2024: adding
# Austin and Las Vegas there would change which race is "most recent" for 2024 and
# break the get_recent_top_finishers tests above.

_US_SESSIONS_2026 = [
    {
        "session_key": 20001,
        "session_name": "Race",
        "circuit_short_name": "Miami",
        "country_name": "United States",
        "date_start": "2026-05-03T19:30:00+00:00",
    },
    {
        "session_key": 20002,
        "session_name": "Race",
        "circuit_short_name": "Austin",
        "country_name": "United States",
        "date_start": "2026-10-25T19:00:00+00:00",
    },
    {
        "session_key": 20003,
        "session_name": "Race",
        "circuit_short_name": "Las Vegas",
        "country_name": "United States",
        "date_start": "2026-11-21T06:00:00+00:00",
    },
    {
        "session_key": 20004,
        "session_name": "Race",
        # Deliberately not matching "Mexico Grand Prix" by substring in either
        # direction, so this session can only be found via the country arm.
        "circuit_short_name": "Autodromo Hermanos Rodriguez",
        "country_name": "Mexico",
        "date_start": "2026-11-08T19:00:00+00:00",
    },
]


@pytest.fixture
def us_sessions(monkeypatch):
    """Patch OpenF1's sessions endpoint with three same-country 2026 US races.

    No meetings are served (empty list), so these queries fall straight through pass 1
    and exercise the circuit/country arms exactly as round 1 intended.
    """
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get({"sessions": _US_SESSIONS_2026, "meetings": []})
    monkeypatch.setattr(openf1_client.requests, "get", fake)
    return fake


def test_find_race_session_refuses_an_ambiguous_country(us_sessions):
    """Three sessions share country_name="United States"; none of their
    circuit_short_names match, so the country arm alone would have to guess. It must
    refuse rather than silently return the wrong race.
    """
    assert find_race_session(2026, "United States Grand Prix") is None


def test_find_race_session_matches_via_circuit_when_unambiguous(us_sessions):
    """A circuit match short-circuits before the ambiguous country arm ever runs."""
    session = find_race_session(2026, "Miami Grand Prix")

    assert session["session_key"] == 20001


def test_find_race_session_matches_via_country_when_unique(us_sessions):
    """A country that resolves to exactly one session is still usable — pass 2 is not
    dead code, it only refuses when the country match is genuinely ambiguous.
    """
    session = find_race_session(2026, "Mexico Grand Prix")

    assert session["session_key"] == 20004


# ── find_race_session: meeting-name arm ──────────────────────────────────────
#
# Defined locally, same reasoning as the US-sessions fixtures above: these fixtures
# must not touch conftest's shared OPENF1_SESSIONS_2024.


def _openf1_get_with_meetings(monkeypatch, meetings, sessions):
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get({"meetings": meetings, "sessions": sessions})
    monkeypatch.setattr(openf1_client.requests, "get", fake)
    return fake


def test_find_race_session_resolves_an_adjectival_name_via_the_meeting_arm(monkeypatch):
    """ "Belgian Grand Prix" (FastF1's EventName) matches neither the circuit
    ("Spa-Francorchamps") nor the country ("Belgium") by substring — only the meeting
    arm, which speaks FastF1's own vocabulary, can resolve it.
    """
    _openf1_get_with_meetings(
        monkeypatch,
        meetings=[
            {"meeting_key": 1290, "meeting_name": "Belgian Grand Prix"},
        ],
        sessions=[
            {
                "session_key": 11334,
                "meeting_key": 1290,
                "session_name": "Race",
                "circuit_short_name": "Spa-Francorchamps",
                "country_name": "Belgium",
                "date_start": "2026-07-19T13:00:00+00:00",
            },
        ],
    )

    session = find_race_session(2026, "Belgian Grand Prix")

    assert session["session_key"] == 11334


def test_find_race_session_refuses_two_meetings_sharing_a_name(monkeypatch):
    """2026 has two meetings named "Bahrain Grand Prix" — Sakhir, and a
    Malaysia-hosted race branded the same way. Neither the meeting arm nor the
    country arm (both sessions report country_name="Bahrain") can break the tie, so
    the overall lookup must decline rather than guess.
    """
    _openf1_get_with_meetings(
        monkeypatch,
        meetings=[
            {"meeting_key": 1282, "meeting_name": "Bahrain Grand Prix"},
            {"meeting_key": 1308, "meeting_name": "Bahrain Grand Prix"},
        ],
        sessions=[
            {
                "session_key": 30001,
                "meeting_key": 1282,
                "session_name": "Race",
                "circuit_short_name": "Sakhir",
                "country_name": "Bahrain",
                "date_start": "2026-03-01T15:00:00+00:00",
            },
            {
                "session_key": 30002,
                "meeting_key": 1308,
                "session_name": "Race",
                "circuit_short_name": "Kuala Lumpur",
                "country_name": "Bahrain",
                "date_start": "2026-11-15T15:00:00+00:00",
            },
        ],
    )

    assert find_race_session(2026, "Bahrain Grand Prix") is None


def test_find_race_session_tries_the_meeting_arm_before_the_circuit_arm(monkeypatch):
    """Construct a case where the circuit arm and the meeting arm would disagree, and
    assert the meeting arm's answer wins — proving pass order matters, not just that
    the meeting arm can resolve names the circuit arm cannot reach at all.
    """
    _openf1_get_with_meetings(
        monkeypatch,
        # Only the meeting the query is meant to resolve to needs an entry here.
        meetings=[{"meeting_key": 5002, "meeting_name": "Miami Grand Prix"}],
        sessions=[
            # Circuit arm would match this session first if it ran before the meeting
            # arm: its circuit_short_name is a bidirectional substring of the query.
            {
                "session_key": 40001,
                "meeting_key": 5001,
                "session_name": "Race",
                "circuit_short_name": "Miami",
                "country_name": "United States",
                "date_start": "2026-05-03T19:30:00+00:00",
            },
            # The session the meeting arm should actually return.
            {
                "session_key": 40002,
                "meeting_key": 5002,
                "session_name": "Race",
                "circuit_short_name": "Somewhere Else",
                "country_name": "Nowhereland",
                "date_start": "2026-06-01T19:30:00+00:00",
            },
        ],
    )

    session = find_race_session(2026, "Miami Grand Prix")

    assert session["session_key"] == 40002


# ── get_driver_form ──────────────────────────────────────────────────────────


@freeze_time("2024-06-01")
def test_driver_form_aggregates_completed_races_from_openf1(openf1_season, no_fastf1):
    result = get_driver_form.invoke({"driver_code": "VER", "year": 2024, "num_races": 5})

    assert result["driver"] == "VER"
    assert [r["event"] for r in result["recent_results"]] == ["Sakhir", "Miami", "Monte Carlo"]
    assert result["total_points_last_races"] == 68.0
    assert result["average_finish"] == pytest.approx(1.333, abs=0.001)


@freeze_time("2024-06-01")
def test_driver_form_costs_one_results_request_for_every_race(openf1_season, no_fastf1):
    """The headline of the migration. Three races used to be three session loads at
    ~2.4s each; a range query makes it one request. A regression to per-race looping
    would restore the latency and put the tool near OpenF1's 3 req/s ceiling.
    """
    get_driver_form.invoke({"driver_code": "VER", "year": 2024, "num_races": 5})

    result_calls = [c for c in openf1_season.calls if c["url"].endswith("/session_result")]
    assert len(result_calls) == 1


@freeze_time("2024-06-01")
def test_driver_form_excludes_sprints_from_race_form(openf1_season, no_fastf1):
    """Miami's Sprint would otherwise appear as a fourth "race" and drag the average."""
    result = get_driver_form.invoke({"driver_code": "NOR", "year": 2024, "num_races": 5})

    assert len(result["recent_results"]) == 3
    assert result["total_points_last_races"] == 61.0


@freeze_time("2024-06-01")
def test_driver_form_honours_num_races(openf1_season, no_fastf1):
    result = get_driver_form.invoke({"driver_code": "VER", "year": 2024, "num_races": 2})

    assert [r["event"] for r in result["recent_results"]] == ["Miami", "Monte Carlo"]


@freeze_time("2024-06-01")
def test_driver_form_reports_dnfs_and_excludes_them_from_the_average(openf1_season, no_fastf1):
    result = get_driver_form.invoke({"driver_code": "HAM", "year": 2024, "num_races": 5})

    assert [r["position"] for r in result["recent_results"]] == [3, 3, "DNF"]
    assert result["average_finish"] == pytest.approx(3.0)
    assert result["recent_results"][2]["status"] == "DNF"


@freeze_time("2024-06-01")
def test_driver_form_returns_empty_for_an_unknown_driver_code(openf1_season, no_fastf1):
    result = get_driver_form.invoke({"driver_code": "ZZZ", "year": 2024, "num_races": 5})

    assert result["recent_results"] == []
    assert result["average_finish"] is None


@freeze_time(FROZEN_NOW)
def test_driver_form_falls_back_to_fastf1_before_2023(
    monkeypatch,
    openf1_season,
    season_2025,
    race_session,  # noqa: F811
):
    from tools import fastf1_tools

    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)

    result = get_driver_form.invoke({"driver_code": "VER", "year": 2022})

    assert [r["event"] for r in result["recent_results"]] == [
        "Bahrain Grand Prix",
        "Miami Grand Prix",
    ]
    assert openf1_season.calls == []
