"""Tests for tools/circuit_winners.py.

Every test runs on 2026-09-28, so the window is 2023-2025. ``get_schedule`` and
``load_race_session`` are patched at the module's own bindings; conftest's FastF1 guard fails any
test that reaches the network.
"""

import json
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest
from freezegun import freeze_time

from tests.factories import make_schedule
from tools import circuit_winners
from tools.circuit_winners import (
    UNKNOWN_CIRCUIT,
    format_race_time,
    get_recent_circuit_winners,
    location_slug,
)

SLUG_CASES = (
    Path(__file__).resolve().parents[2] / "frontend" / "tests" / "fixtures" / "slug-cases.json"
)

pytestmark = pytest.mark.usefixtures("_frozen")


@pytest.fixture
def _frozen():
    with freeze_time("2026-09-28"):
        yield


def results(driver: str = "Max Verstappen", code: str = "VER", team: str = "Red Bull Racing"):
    return pd.DataFrame(
        [
            {
                "Position": 1.0,
                "FullName": driver,
                "Abbreviation": code,
                "TeamName": team,
                "Time": pd.Timedelta(hours=1, minutes=13, seconds=24.325),
            },
            {
                "Position": 2.0,
                "FullName": "Lando Norris",
                "Abbreviation": "NOR",
                "TeamName": "McLaren",
                "Time": pd.Timedelta(seconds=19.207),
            },
        ]
    )


class FakeFastF1:
    """Serves schedules per year and results per (year, event); counts every call."""

    def __init__(self, schedules, fail=frozenset(), delay=0.0):
        self.schedules = schedules
        self.fail = set(fail)
        self.delay = delay
        self.schedule_calls = []
        self.loads = []
        self._lock = threading.Lock()

    def get_schedule(self, year):
        self.schedule_calls.append(year)
        return self.schedules.get(year, make_schedule([]))

    def load_race_session(self, year, event_name):
        with self._lock:
            self.loads.append((year, event_name))
        if self.delay:
            time.sleep(self.delay)
        if year in self.fail:
            raise ConnectionError(f"livetiming down for {year}")
        return SimpleNamespace(results=results(driver=f"Winner {year} {event_name}"))


@pytest.fixture
def install(monkeypatch):
    def _install(schedules, **kwargs):
        fake = FakeFastF1(schedules, **kwargs)
        monkeypatch.setattr(circuit_winners, "get_schedule", fake.get_schedule)
        monkeypatch.setattr(circuit_winners, "load_race_session", fake.load_race_session)
        return fake

    return _install


def season(*events):
    return make_schedule([{"date": "2025-06-01", **event} for event in events])


SPANISH_AT_BARCELONA = {
    y: season({"name": "Spanish Grand Prix", "location": "Barcelona", "round": 9})
    for y in (2023, 2024, 2025)
}


# ── The slug port ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(("location", "expected"), json.loads(SLUG_CASES.read_text("utf8")))
def test_location_slug_matches_the_shared_vectors(location, expected):
    """The same file pins the TS locationSlug; a drift here silently empties every lookup."""
    assert location_slug(location) == expected


# ── Matching by circuit, not by Grand Prix name ─────────────────────────────


def test_madrid_gets_no_barcelona_winners(install):
    """2026's Spanish GP is at Madrid; 2023-25's was at Barcelona. Matching by event name — what
    the agent's tool does — would hand Madrid three Barcelona winners.
    """
    fake = install(SPANISH_AT_BARCELONA)

    result = get_recent_circuit_winners("es-2026")

    assert result["winners"] == []
    assert fake.loads == []


def test_barcelona_gets_the_spanish_gp_winners(install):
    install(SPANISH_AT_BARCELONA)

    result = get_recent_circuit_winners("es-1991")

    assert [w["year"] for w in result["winners"]] == [2025, 2024, 2023]
    assert {w["event"] for w in result["winners"]} == {"Spanish Grand Prix"}


def test_kuala_lumpur_is_sepang_not_sakhir(install):
    """FastF1 files the rescheduled Bahrain GP under Kuala Lumpur; the event name says Bahrain."""
    install({2024: season({"name": "Bahrain Grand Prix", "location": "Kuala Lumpur", "round": 1})})

    assert get_recent_circuit_winners("bh-2002")["winners"] == []
    assert [w["year"] for w in get_recent_circuit_winners("my-1999")["winners"]] == [2024]


def test_yas_island_is_yas_marina(install):
    install({2023: season({"name": "Abu Dhabi Grand Prix", "location": "Yas Island", "round": 22})})

    assert [w["year"] for w in get_recent_circuit_winners("ae-2009")["winners"]] == [2023]


def test_pre_season_testing_is_not_a_race(install):
    fake = install(
        {
            2025: season(
                {
                    "name": "Pre-Season Testing",
                    "location": "Sakhir",
                    "round": 0,
                    "format": "testing",
                },
                {"name": "Bahrain Grand Prix", "location": "Sakhir", "round": 1},
            )
        }
    )

    result = get_recent_circuit_winners("bh-2002")

    assert fake.loads == [(2025, "Bahrain Grand Prix")]
    assert len(result["winners"]) == 1


def test_a_circuit_can_host_two_races_in_one_year(install):
    install(
        {
            2024: season(
                {"name": "Styrian Grand Prix", "location": "Spielberg", "round": 7},
                {"name": "Austrian Grand Prix", "location": "Spielberg", "round": 8},
            )
        }
    )

    events = [w["event"] for w in get_recent_circuit_winners("at-1969")["winners"]]

    assert events == ["Styrian Grand Prix", "Austrian Grand Prix"]


def test_the_winner_row_shape(install):
    install({2025: season({"name": "Italian Grand Prix", "location": "Monza", "round": 16})})

    result = get_recent_circuit_winners("it-1922")

    assert result == {
        "circuit_id": "it-1922",
        "from_year": 2023,
        "to_year": 2025,
        "winners": [
            {
                "year": 2025,
                "event": "Italian Grand Prix",
                "driver": "Winner 2025 Italian Grand Prix",
                "driver_code": "VER",
                "team": "Red Bull Racing",
                "time": "1:13:24.325",
            }
        ],
        "unavailable_years": [],
    }


# ── Cache ───────────────────────────────────────────────────────────────────


def test_a_second_view_costs_nothing(install):
    fake = install(SPANISH_AT_BARCELONA)
    get_recent_circuit_winners("es-1991")
    fake.loads.clear()
    fake.schedule_calls.clear()

    get_recent_circuit_winners("es-1991")

    assert fake.loads == []
    assert fake.schedule_calls == []


def test_a_year_the_circuit_did_not_host_is_cached_too(install):
    fake = install(SPANISH_AT_BARCELONA)
    get_recent_circuit_winners("es-2026")
    fake.schedule_calls.clear()

    get_recent_circuit_winners("es-2026")

    assert fake.schedule_calls == []


def test_a_failed_year_is_reported_and_not_cached(install, monkeypatch):
    fake = install(SPANISH_AT_BARCELONA, fail={2024})

    first = get_recent_circuit_winners("es-1991")

    assert first["unavailable_years"] == [2024]
    assert [w["year"] for w in first["winners"]] == [2025, 2023]

    fake.fail.clear()
    fake.loads.clear()
    second = get_recent_circuit_winners("es-1991")

    assert fake.loads == [(2024, "Spanish Grand Prix")]
    assert second["unavailable_years"] == []


def test_every_year_failing_is_an_error(install):
    install(SPANISH_AT_BARCELONA, fail={2023, 2024, 2025})

    result = get_recent_circuit_winners("es-1991")

    assert "error" in result
    assert "reason" not in result


def test_years_back_narrows_the_window(install):
    install(SPANISH_AT_BARCELONA)

    result = get_recent_circuit_winners("es-1991", years_back=1)

    assert (result["from_year"], result["to_year"]) == (2025, 2025)
    assert [row["year"] for row in result["winners"]] == [2025]


@pytest.mark.parametrize("years_back", [0, -1])
def test_an_empty_window_is_an_error_not_a_raise(install, years_back):
    fake = install(SPANISH_AT_BARCELONA)
    assert "error" in get_recent_circuit_winners("es-1991", years_back=years_back)
    assert fake.schedule_calls == []


@pytest.mark.parametrize(
    ("location", "circuit_id"),
    [("Madrid", "es-2026"), ("Kuala Lumpur", "my-1999"), ("Bangkok", None), ("", None)],
)
def test_circuit_id_for_location(location, circuit_id):
    assert circuit_winners.circuit_id_for_location(location) == circuit_id


def test_a_caller_mutating_the_result_cannot_reach_the_cache(install):
    install(SPANISH_AT_BARCELONA)
    get_recent_circuit_winners("es-1991")["winners"][0]["driver"] = "tampered"

    assert get_recent_circuit_winners("es-1991")["winners"][0]["driver"] != "tampered"


def test_two_cold_views_of_one_circuit_load_it_once(install):
    fake = install(SPANISH_AT_BARCELONA, delay=0.05)
    threads = [
        threading.Thread(target=get_recent_circuit_winners, args=("es-1991",)) for _ in range(2)
    ]

    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(fake.loads) == 3


# ── Edges ───────────────────────────────────────────────────────────────────


def test_an_unknown_circuit_is_its_own_reason(install):
    install({})

    assert get_recent_circuit_winners("xx-0000") == {
        "error": "Unknown circuit xx-0000",
        "reason": UNKNOWN_CIRCUIT,
    }


def test_a_missing_index_file_is_an_error_not_a_raise(install, monkeypatch, tmp_path):
    install({})
    monkeypatch.setattr(circuit_winners, "CIRCUIT_INDEX_PATH", tmp_path / "absent.json")
    circuit_winners.clear()

    result = get_recent_circuit_winners("it-1922")

    assert "error" in result
    assert "reason" not in result


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (pd.Timedelta(hours=1, minutes=13, seconds=24.325), "1:13:24.325"),
        (pd.Timedelta(hours=2, seconds=5.0004), "2:00:05.000"),
        (pd.NaT, None),
        (None, None),
    ],
)
def test_format_race_time(value, expected):
    assert format_race_time(value) == expected
