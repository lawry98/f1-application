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


def _track_info(round_number: int = 3, track_id: str | None = "mc-1929", year: int = 2025):
    return get_track_info.invoke({"year": year, "round": round_number, "track_id": track_id})


def test_track_info_shapes_this_event_and_its_circuit(monkeypatch, season_2025):
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)

    assert _track_info() == {
        "grand_prix": "Monaco Grand Prix",
        "official_name": "FORMULA 1 MONACO GRAND PRIX",
        "year": 2025,
        "round": 3,
        "location": "Monaco",
        "country": "Monaco",
        "date": "2025-05-25 00:00:00",
        "event_format": "conventional",
        "circuit": {
            "name": "Circuit de Monaco",
            "length_km": 3.337,
            "first_grand_prix": 1929,
        },
    }


def test_track_info_describes_the_track_the_event_is_held_at(monkeypatch):
    """The 2026 Bahrain Grand Prix is at Sepang. The event row says Bahrain; the circuit block
    must say Sepang, because it comes from the track id and never from the Grand Prix's name."""
    schedule = make_schedule(
        [
            {
                "name": "Bahrain Grand Prix",
                "date": "2026-10-04",
                "location": "Kuala Lumpur",
                "country": "Bahrain",
                "round": 16,
            }
        ]
    )
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: schedule)

    result = _track_info(round_number=16, track_id="my-1999", year=2026)

    assert result["grand_prix"] == "Bahrain Grand Prix"
    assert result["circuit"]["name"] == "Sepang International Circuit"
    assert result["circuit"]["first_grand_prix"] == 1999


def test_track_info_says_so_when_the_location_has_no_circuit_file(monkeypatch, season_2025):
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)

    result = _track_info(track_id=None)

    assert result["grand_prix"] == "Monaco Grand Prix"
    assert result["circuit"] == {"note": "No circuit data for this location"}


def test_track_info_needs_no_session(monkeypatch, season_2025):
    """The payload comes entirely from the schedule row and a local file — loading a session
    here would reintroduce a 30-60s cold-cache download for data the row already carries.
    """
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)
    monkeypatch.setattr(fastf1, "get_session", _boom)
    assert "error" not in _track_info()


def test_track_info_reports_an_unknown_round(monkeypatch, season_2025):
    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)
    assert _track_info(round_number=9) == {"error": "No round 9 in the 2025 calendar"}


def test_track_info_converts_a_schedule_failure_into_an_error(monkeypatch):
    monkeypatch.setattr(fastf1_tools, "get_schedule", _boom)
    result = _track_info()
    assert "error" in result
    assert "fastf1 unavailable" in result["error"]


# ── get_recent_race_results ──────────────────────────────────────────────────


def british_seasons(*years: int, fail: frozenset[int] = frozenset()):
    """A per-year ``get_schedule`` with the British GP at Silverstone on the first Sunday of July
    and the Bahrain GP at Sakhir in March. Years not listed have neither; years in ``fail`` raise.
    """

    def _get_schedule(year: int):
        if year in fail:
            raise ConnectionError(f"schedule {year} unavailable")
        if year not in years:
            return make_schedule([])
        return make_schedule(
            [
                {"name": "Bahrain Grand Prix", "date": f"{year}-03-05", "location": "Sakhir"},
                {"name": "British Grand Prix", "date": f"{year}-07-03", "location": "Silverstone"},
            ]
        )

    return _get_schedule


def _race_results(track_id: str = "gb-1948", as_of: str = "2022-07-01T11:30:00+00:00"):
    return get_recent_race_results.invoke({"track_id": track_id, "as_of": as_of})


def test_race_results_are_the_latest_race_at_this_circuit_before_as_of(monkeypatch, race_session):
    """As of FP1 of the 2022 British GP, the latest Silverstone race is 2021's — the weekend
    being briefed has not produced a result yet, and must never be the one reported."""
    monkeypatch.setattr(circuit_winners, "get_schedule", british_seasons(2020, 2021, 2022))

    result = _race_results()

    assert (result["year"], result["event"]) == (2021, "British Grand Prix")
    assert [row["Abbreviation"] for row in result["results"]] == ["VER", "NOR", "HAM"]
    assert set(result["results"][0]) == {
        "Position",
        "DriverNumber",
        "Abbreviation",
        "TeamName",
        "Points",
        "Status",
    }


def test_race_results_load_the_session_without_laps_or_telemetry(monkeypatch, race_session):
    """Laps, telemetry, weather and messages all stay off.

    Telemetry and friends are megabytes the tools never read. Laps matter for a second
    reason: their endpoints fail on every call, and FastF1 refuses to persist a session
    that loaded partially — so loading laps made these calls slow *and* uncacheable.
    """
    monkeypatch.setattr(circuit_winners, "get_schedule", british_seasons(2021))

    _race_results()

    assert race_session.loads == [
        {"laps": False, "telemetry": False, "weather": False, "messages": False}
    ]


def test_race_results_load_the_race_by_round_not_by_name(monkeypatch):
    """FastF1 resolves a name fuzzily; a round number is exact."""
    monkeypatch.setattr(circuit_winners, "get_schedule", british_seasons(2021))
    asked: list[tuple] = []

    def _get_session(year, event, kind):
        asked.append((year, event, kind))
        return make_session(RESULTS_ROWS)

    monkeypatch.setattr(fastf1, "get_session", _get_session)

    _race_results()

    assert asked == [(2021, 2, "R")]


def test_a_circuit_with_no_race_in_range_is_a_success_that_says_so(monkeypatch):
    """Sepang last hosted in 2017. "No race here since" is an answer, and a Sakhir-hosted Bahrain
    Grand Prix in the window must not be offered in its place."""
    monkeypatch.setattr(circuit_winners, "get_schedule", british_seasons(2023, 2024, 2025, 2026))
    monkeypatch.setattr(fastf1, "get_session", _boom)

    result = _race_results(track_id="my-1999", as_of="2026-09-30T00:00:00+00:00")

    assert "error" not in result
    assert result["results"] == []
    assert result["searched_years"] == [2026, 2025, 2024, 2023]
    assert result["note"] == "No Grand Prix at this circuit from 2023 to 2026 before the cutoff"


def test_a_season_that_would_not_load_is_an_error_rather_than_none_found(monkeypatch):
    """A "none here" built on a schedule that never loaded would be cached as an answer."""
    monkeypatch.setattr(
        circuit_winners, "get_schedule", british_seasons(2023, 2024, fail=frozenset({2025}))
    )

    result = _race_results(track_id="my-1999", as_of="2026-09-30T00:00:00+00:00")

    assert "error" in result


def test_race_results_without_a_track_say_there_is_no_circuit_to_match(monkeypatch):
    monkeypatch.setattr(circuit_winners, "get_schedule", _boom)

    result = _race_results(track_id=None)

    assert result == {"results": [], "note": "No circuit data for this location"}


def test_a_season_without_session_times_dates_its_race_by_event_date(monkeypatch, race_session):
    """Older FastF1 seasons carry no session times, so a race starts at midnight UTC on its
    EventDate. The 2012 race on 8 July has not started as of 7 July, so 2011's is the latest."""

    def _get_schedule(year):
        return make_schedule(
            [
                {
                    "name": "British Grand Prix",
                    "date": f"{year}-07-08",
                    "location": "Silverstone",
                    "sessions": [],
                }
            ]
        )

    monkeypatch.setattr(circuit_winners, "get_schedule", _get_schedule)

    assert _race_results(as_of="2012-07-07T00:00:00+00:00")["year"] == 2011
    assert _race_results(as_of="2012-07-08T00:00:01+00:00")["year"] == 2012


def test_race_results_convert_a_session_failure_into_an_error(monkeypatch):
    monkeypatch.setattr(circuit_winners, "get_schedule", british_seasons(2021))
    monkeypatch.setattr(fastf1, "get_session", _boom)
    result = _race_results()
    assert "error" in result
    assert "fastf1 unavailable" in result["error"]


# ── get_driver_form ──────────────────────────────────────────────────────────


def _form(driver_code: str = "VER", as_of: str = "2025-05-01T00:00:00+00:00", **kwargs):
    return get_driver_form.invoke({"driver_code": driver_code, "as_of": as_of, **kwargs})


def test_driver_form_aggregates_the_races_before_as_of(
    monkeypatch, fake_get_schedule, race_session
):
    """Bahrain and Miami 2025 ran before the cutoff; 2024 is reached for the other three."""
    monkeypatch.setattr(fastf1_tools, "get_schedule", fake_get_schedule)

    result = _form(num_races=3)

    assert result["driver"] == "VER"
    assert result["seasons"] == [2024, 2025]
    assert [(r["year"], r["event"]) for r in result["recent_results"]] == [
        (2024, "Qatar Grand Prix"),
        (2025, "Bahrain Grand Prix"),
        (2025, "Miami Grand Prix"),
    ]
    assert result["recent_results"][0]["position"] == 1
    assert result["total_points_last_races"] == 75.0
    assert result["average_finish"] == 1.0


def test_driver_form_stays_in_one_season_when_it_has_enough(
    monkeypatch, fake_get_schedule, race_session
):
    monkeypatch.setattr(fastf1_tools, "get_schedule", fake_get_schedule)

    result = _form(num_races=2)

    assert result["seasons"] == [2025]
    assert [r["event"] for r in result["recent_results"]] == [
        "Bahrain Grand Prix",
        "Miami Grand Prix",
    ]


def test_driver_form_reports_dnfs_and_excludes_them_from_the_average(
    monkeypatch, fake_get_schedule, race_session
):
    monkeypatch.setattr(fastf1_tools, "get_schedule", fake_get_schedule)

    result = _form("HAM", num_races=2)

    assert [r["position"] for r in result["recent_results"]] == ["DNF", "DNF"]
    assert result["average_finish"] is None
    assert result["total_points_last_races"] == 0.0


def test_driver_form_skips_races_whose_session_fails(monkeypatch, fake_get_schedule):
    """A dead session drops that race from the form rather than sinking the tool."""
    monkeypatch.setattr(fastf1_tools, "get_schedule", fake_get_schedule)
    monkeypatch.setattr(fastf1, "get_session", _boom)

    result = _form(num_races=2)

    assert result["recent_results"] == []
    assert result["average_finish"] is None


def test_driver_form_omits_a_race_the_driver_did_not_start(
    monkeypatch, fake_get_schedule, race_session
):
    monkeypatch.setattr(fastf1_tools, "get_schedule", fake_get_schedule)

    result = _form("ZZZ", num_races=2)

    assert result["recent_results"] == []
    assert result["seasons"] == [2025]


def test_driver_form_converts_a_schedule_failure_into_an_error(monkeypatch):
    monkeypatch.setattr(fastf1_tools, "get_schedule", _boom)
    result = _form()
    assert "error" in result
    assert "fastf1 unavailable" in result["error"]


# ── get_recent_top_finishers ─────────────────────────────────────────────────


def _top(as_of: str = "2025-05-01T00:00:00+00:00"):
    return get_recent_top_finishers.invoke({"as_of": as_of})


def test_top_finishers_come_from_the_latest_race_before_as_of(
    monkeypatch, fake_get_schedule, race_session
):
    monkeypatch.setattr(f1_data_tools, "get_schedule", fake_get_schedule)

    result = _top()

    assert (result["year"], result["last_race"]) == (2025, "Miami Grand Prix")
    assert result["top_finishers"][0] == {
        "position": 1,
        "driver": "Max Verstappen",
        "driver_code": "VER",
        "team": "Red Bull Racing",
        "points": 25.0,
    }
    assert result["top_finishers"][2]["position"] == "DNF"
    assert result["note"] == "Positions from most recent race (not cumulative season standings)"


def test_top_finishers_reach_back_a_season_only_when_none_has_run(
    monkeypatch, fake_get_schedule, race_session
):
    """As of 1 Feb 2025 nothing in 2025 has run, so the latest race is 2024's last."""
    monkeypatch.setattr(f1_data_tools, "get_schedule", fake_get_schedule)

    result = _top("2025-02-01T00:00:00+00:00")

    assert (result["year"], result["last_race"]) == (2024, "Qatar Grand Prix")


def test_top_finishers_report_when_neither_season_has_a_race(monkeypatch):
    monkeypatch.setattr(f1_data_tools, "get_schedule", lambda year: make_schedule([]))
    result = _top("2022-02-01T00:00:00+00:00")
    assert result == {"error": "No completed races found before 2022-02-01 in 2022 or 2021"}


def test_top_finishers_convert_a_schedule_failure_into_an_error(monkeypatch):
    monkeypatch.setattr(f1_data_tools, "get_schedule", _boom)
    result = _top("2022-05-01T00:00:00+00:00")
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


def _winners_at(
    circuit_name: str,
    location: str,
    years_back: int = 3,
    race_year: int = 2026,
    as_of: str = "2026-09-28T00:00:00+00:00",
) -> dict[str, Any]:
    return get_circuit_winners.invoke(
        {
            "circuit_name": circuit_name,
            "location": location,
            "race_year": race_year,
            "as_of": as_of,
            "years_back": years_back,
        }
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
def test_circuit_winners_are_the_seasons_before_the_race_not_before_today(past_seasons):
    """A 2025 Monaco briefing, asked in 2026, covers 2022-24: 2025's own winner is the result of
    the weekend being briefed. The seasons searched travel with the answer."""
    result = _winners_at(
        "Monaco Grand Prix", "Monaco", race_year=2025, as_of="2025-05-23T11:30:00+00:00"
    )

    assert [winner["year"] for winner in result["recent_winners"]] == [2024, 2023]
    assert result["seasons"] == {"from": 2022, "to": 2024}


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
