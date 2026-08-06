"""Tests for the four result tools on their OpenF1 path, and their FastF1 fallbacks.

The pre-existing ``test_fastf1_tools.py`` covers the same four tools on the FastF1 path
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
from tools.fastf1_tools import get_recent_race_results
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
    """Patch OpenF1's sessions endpoint with three same-country 2026 US races."""
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get({"sessions": _US_SESSIONS_2026})
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
