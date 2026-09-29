"""Tests for the five FastF1-backed tools across fastf1_tools and f1_data_tools.

The invariant worth the most protection is the one CLAUDE.md declares for every tool:
failures produce ``{"error": ...}`` and never raise — the agent is built to continue
on partial data. Happy-path shaping is pinned alongside because it is cheap once the
Session double exists.

``get_schedule`` is patched on the *tool* modules (they bind the name at import);
sessions are served by patching ``fastf1.get_session``, so the real
``load_race_session`` helper runs and its load flags are exercised.
"""

from typing import Any

import fastf1
import pytest
from freezegun import freeze_time

from tests.conftest import FROZEN_NOW
from tests.factories import make_schedule, make_session
from tools import circuit_winners, f1_data_tools, fastf1_tools
from tools.f1_data_tools import get_circuit_winners, get_recent_top_finishers
from tools.fastf1_tools import get_driver_form, get_recent_race_results, get_track_info

RESULTS_ROWS = [
    {
        "Position": 1.0,
        "DriverNumber": "1",
        "Abbreviation": "VER",
        "FullName": "Max Verstappen",
        "TeamName": "Red Bull Racing",
        "Points": 25.0,
        "Status": "Finished",
        "Time": "1:30:00",
    },
    {
        "Position": 2.0,
        "DriverNumber": "4",
        "Abbreviation": "NOR",
        "FullName": "Lando Norris",
        "TeamName": "McLaren",
        "Points": 18.0,
        "Status": "Finished",
        "Time": "+5.000",
    },
    # Position 0 is how FastF1 encodes an unclassified finish — surfaces as "DNF".
    {
        "Position": 0.0,
        "DriverNumber": "44",
        "Abbreviation": "HAM",
        "FullName": "Lewis Hamilton",
        "TeamName": "Ferrari",
        "Points": 0.0,
        "Status": "Accident",
        "Time": "",
    },
]


def _boom(*args: Any, **kwargs: Any):
    raise ConnectionError("fastf1 unavailable")


@pytest.fixture
def race_session(monkeypatch):
    """Serve one fake loaded session for any (year, event) fastf1 is asked for."""
    session = make_session(RESULTS_ROWS)
    monkeypatch.setattr(fastf1, "get_session", lambda year, event, kind: session)
    return session


# ── get_track_info ───────────────────────────────────────────────────────────


def test_track_info_shapes_the_schedule_row(monkeypatch, season_2025):
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)

    result = get_track_info.invoke({"circuit_name": "Monaco", "year": 2025})

    assert result == {
        "circuit_name": "Monaco Grand Prix",
        "country": "Monaco",
        "location": "Monaco",
        "date": "2025-05-25 00:00:00",
        "event_format": "conventional",
        "official_name": "FORMULA 1 MONACO GRAND PRIX",
    }


def test_track_info_needs_no_session(monkeypatch, season_2025):
    """The payload comes entirely from the schedule row — loading a session here would
    reintroduce a 30-60s cold-cache download for data the row already carries.
    """
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)
    monkeypatch.setattr(fastf1, "get_session", _boom)
    assert "error" not in get_track_info.invoke({"circuit_name": "Monaco", "year": 2025})


def test_track_info_reports_an_unknown_event(monkeypatch, season_2025):
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)
    result = get_track_info.invoke({"circuit_name": "Nürburgring", "year": 2025})
    assert result == {"error": "No event found for Nürburgring in 2025"}


def test_track_info_converts_a_schedule_failure_into_an_error(monkeypatch):
    monkeypatch.setattr(fastf1_tools, "get_schedule", _boom)
    result = get_track_info.invoke({"circuit_name": "Monaco", "year": 2025})
    assert "error" in result
    assert "fastf1 unavailable" in result["error"]


# ── get_recent_race_results ──────────────────────────────────────────────────


def test_race_results_return_the_top_ten_columns(race_session):
    result = get_recent_race_results.invoke({"event_name": "Monaco Grand Prix", "year": 2024})

    assert result["year"] == 2024
    assert result["event"] == "Monaco Grand Prix"
    assert [row["Abbreviation"] for row in result["results"]] == ["VER", "NOR", "HAM"]
    assert set(result["results"][0]) == {
        "Position",
        "DriverNumber",
        "Abbreviation",
        "TeamName",
        "Points",
        "Status",
    }


def test_race_results_load_the_session_without_laps_or_telemetry(race_session):
    """Laps, telemetry, weather and messages all stay off.

    Telemetry and friends are megabytes the tools never read. Laps matter for a second
    reason: their endpoints fail on every call, and FastF1 refuses to persist a session
    that loaded partially — so loading laps made these calls slow *and* uncacheable.
    """
    get_recent_race_results.invoke({"event_name": "Monaco Grand Prix", "year": 2024})

    assert race_session.loads == [
        {"laps": False, "telemetry": False, "weather": False, "messages": False}
    ]


def test_race_results_convert_a_session_failure_into_an_error(monkeypatch):
    monkeypatch.setattr(fastf1, "get_session", _boom)
    result = get_recent_race_results.invoke({"event_name": "Monaco Grand Prix", "year": 2024})
    assert "error" in result
    assert "fastf1 unavailable" in result["error"]


# ── get_driver_form ──────────────────────────────────────────────────────────


@freeze_time(FROZEN_NOW)
def test_driver_form_aggregates_the_completed_races(monkeypatch, season_2025, race_session):
    """Only Bahrain and Miami are behind the frozen clock; both count toward form."""
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)

    result = get_driver_form.invoke({"driver_code": "VER", "year": 2025, "num_races": 5})

    assert result["driver"] == "VER"
    assert [r["event"] for r in result["recent_results"]] == [
        "Bahrain Grand Prix",
        "Miami Grand Prix",
    ]
    assert result["recent_results"][0]["position"] == 1
    assert result["total_points_last_races"] == 50.0
    assert result["average_finish"] == 1.0


@freeze_time(FROZEN_NOW)
def test_driver_form_reports_dnfs_and_excludes_them_from_the_average(
    monkeypatch, season_2025, race_session
):
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)

    result = get_driver_form.invoke({"driver_code": "HAM", "year": 2025})

    assert [r["position"] for r in result["recent_results"]] == ["DNF", "DNF"]
    assert result["average_finish"] is None
    assert result["total_points_last_races"] == 0.0


@freeze_time(FROZEN_NOW)
def test_driver_form_skips_races_whose_session_fails(monkeypatch, season_2025):
    """A dead session drops that race from the form rather than sinking the tool."""
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)
    monkeypatch.setattr(fastf1, "get_session", _boom)

    result = get_driver_form.invoke({"driver_code": "VER", "year": 2025})

    assert result["recent_results"] == []
    assert result["average_finish"] is None


def test_driver_form_converts_a_schedule_failure_into_an_error(monkeypatch):
    monkeypatch.setattr(fastf1_tools, "get_schedule", _boom)
    result = get_driver_form.invoke({"driver_code": "VER", "year": 2025})
    assert "error" in result
    assert "fastf1 unavailable" in result["error"]


# ── get_recent_top_finishers ─────────────────────────────────────────────────


@freeze_time(FROZEN_NOW)
def test_top_finishers_come_from_the_most_recent_completed_race(
    monkeypatch, season_2025, race_session
):
    monkeypatch.setattr(f1_data_tools, "get_schedule", lambda year: season_2025)

    result = get_recent_top_finishers.invoke({"year": 2025})

    assert result["last_race"] == "Miami Grand Prix"
    assert result["top_finishers"][0] == {
        "position": 1,
        "driver": "Max Verstappen",
        "driver_code": "VER",
        "team": "Red Bull Racing",
        "points": 25.0,
    }
    assert result["top_finishers"][2]["position"] == "DNF"
    assert result["note"] == "Positions from most recent race (not cumulative season standings)"


@freeze_time(FROZEN_NOW)
def test_top_finishers_report_a_season_with_no_completed_races(monkeypatch, season_2026):
    monkeypatch.setattr(f1_data_tools, "get_schedule", lambda year: season_2026)
    result = get_recent_top_finishers.invoke({"year": 2026})
    assert result == {"error": "No completed races found for 2026 season yet"}


def test_top_finishers_convert_a_schedule_failure_into_an_error(monkeypatch):
    monkeypatch.setattr(f1_data_tools, "get_schedule", _boom)
    result = get_recent_top_finishers.invoke({"year": 2025})
    assert "error" in result
    assert "fastf1 unavailable" in result["error"]


# ── get_circuit_winners ──────────────────────────────────────────────────────
#
# The tool delegates to tools/circuit_winners.py, the same per-circuit lookup the
# /circuits page serves, so schedules are patched on that module's binding. The schedules
# below mirror FastF1's real rows for the cases Event-name matching got wrong: the Spanish
# Grand Prix moved from Barcelona to Madrid in 2026, Barcelona's 2026 race is a
# differently-named Event, and the rescheduled 2026 Bahrain Grand Prix is filed under
# Location "Kuala Lumpur". Pre-season testing shares Sakhir with the race.

NO_DATA = [{"note": "No recent data available"}]

PAST_SEASON_EVENTS = [
    {"name": "Pre-Season Testing", "location": "Sakhir", "format": "testing", "round": 0},
    {"name": "Bahrain Grand Prix", "location": "Sakhir"},
    {"name": "Spanish Grand Prix", "location": "Barcelona"},
    {"name": "Monaco Grand Prix", "location": "Monaco"},
]


@pytest.fixture
def past_seasons(monkeypatch):
    """Serve 2023-2025 schedules and record every (year, event) a session is loaded for."""
    schedules = {
        year: make_schedule(
            [
                {**event, "date": f"{year}-0{index}-01"}
                for index, event in enumerate(PAST_SEASON_EVENTS, 1)
            ]
        )
        for year in (2023, 2024, 2025)
    }
    monkeypatch.setattr(circuit_winners, "get_schedule", lambda year: schedules[year])

    loaded: list[tuple[int, str]] = []

    def _get_session(year, event, kind):
        loaded.append((year, event))
        return make_session(RESULTS_ROWS)

    monkeypatch.setattr(fastf1, "get_session", _get_session)
    return loaded


def _winners_at(circuit_name: str, location: str, years_back: int = 3) -> dict[str, Any]:
    return get_circuit_winners.invoke(
        {"circuit_name": circuit_name, "location": location, "years_back": years_back}
    )


@freeze_time("2026-09-28")
def test_circuit_winners_shape_each_winner_newest_first(past_seasons):
    result = _winners_at("Monaco Grand Prix", "Monaco")

    assert result["circuit"] == "Monaco Grand Prix"
    assert [winner["year"] for winner in result["recent_winners"]] == [2025, 2024, 2023]
    assert result["recent_winners"][0] == {
        "year": 2025,
        "event": "Monaco Grand Prix",
        "driver": "Max Verstappen",
        "driver_code": "VER",
        "team": "Red Bull Racing",
        "time": "1:30:00.000",
    }


@freeze_time("2026-09-28")
def test_circuit_winners_honour_years_back(past_seasons):
    result = _winners_at("Monaco Grand Prix", "Monaco", years_back=1)
    assert [winner["year"] for winner in result["recent_winners"]] == [2025]


@freeze_time("2026-09-28")
def test_a_spanish_grand_prix_at_madrid_reports_no_barcelona_winners(past_seasons):
    assert _winners_at("Spanish Grand Prix", "Madrid")["recent_winners"] == NO_DATA
    assert past_seasons == []


@freeze_time("2026-09-28")
def test_a_bahrain_grand_prix_at_kuala_lumpur_reports_no_sakhir_winners(past_seasons):
    assert _winners_at("Bahrain Grand Prix", "Kuala Lumpur")["recent_winners"] == NO_DATA
    assert past_seasons == []


@freeze_time("2026-09-28")
def test_a_barcelona_grand_prix_finds_the_spanish_grands_prix_held_there(past_seasons):
    result = _winners_at("Barcelona Grand Prix", "Barcelona")

    assert [winner["year"] for winner in result["recent_winners"]] == [2025, 2024, 2023]
    assert {event for _, event in past_seasons} == {"Spanish Grand Prix"}


@freeze_time("2026-09-28")
def test_pre_season_testing_at_the_same_circuit_is_not_taken_for_the_race(past_seasons):
    _winners_at("Bahrain Grand Prix", "Sakhir")
    assert {event for _, event in past_seasons} == {"Bahrain Grand Prix"}


@freeze_time("2026-09-28")
@pytest.mark.parametrize("location", ["Bangkok", ""])
def test_a_location_outside_the_circuit_index_reports_no_winners(past_seasons, location):
    """No fallback to Event-name matching: that is the defect this tool no longer has."""
    assert _winners_at("Spanish Grand Prix", location)["recent_winners"] == NO_DATA
    assert past_seasons == []


@freeze_time("2026-09-28")
def test_circuit_winners_report_an_error_when_no_season_loads(monkeypatch, past_seasons):
    monkeypatch.setattr(fastf1, "get_session", _boom)

    result = _winners_at("Monaco Grand Prix", "Monaco")

    assert set(result) == {"error"}
    assert "2023" in result["error"]


@freeze_time("2026-09-28")
def test_circuit_winners_convert_an_unreadable_index_into_an_error(monkeypatch, tmp_path):
    monkeypatch.setattr(circuit_winners, "CIRCUIT_INDEX_PATH", tmp_path / "absent.json")

    result = _winners_at("Monaco Grand Prix", "Monaco")

    assert set(result) == {"error"}
