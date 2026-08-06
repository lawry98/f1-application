"""Tests for the OpenF1 HTTP client.

Two things here are worth more than the response shaping. First, the range-query
pattern: one request spanning min..max of the wanted keys, filtered in Python. Looping
one request per race is both slow and the only realistic way to breach OpenF1's
3 req/s ceiling, so the request count is asserted directly. Second, the cache, which
is process-global and therefore reset by an autouse fixture in conftest.
"""

import pytest
import requests

from tests.factories import make_openf1_get
from tools import openf1_client
from tools.openf1_client import (
    OPENF1_FIRST_YEAR,
    OpenF1Error,
    driver_index,
    list_sessions,
    session_results,
)

SESSIONS_2026 = [
    {
        "session_key": 11334,
        "meeting_key": 1290,
        "session_name": "Race",
        "circuit_short_name": "Spa-Francorchamps",
        "country_name": "Belgium",
        "date_start": "2026-07-19T13:00:00+00:00",
    },
    {
        "session_key": 11330,
        "meeting_key": 1290,
        "session_name": "Qualifying",
        "circuit_short_name": "Spa-Francorchamps",
        "country_name": "Belgium",
        "date_start": "2026-07-18T14:00:00+00:00",
    },
    {
        "session_key": 11342,
        "meeting_key": 1291,
        "session_name": "Race",
        "circuit_short_name": "Hungaroring",
        "country_name": "Hungary",
        "date_start": "2026-07-26T13:00:00+00:00",
    },
]


def test_first_year_is_the_single_source_of_coverage_truth():
    """Hardcoding 2023 anywhere else lets the API and the tools disagree."""
    assert OPENF1_FIRST_YEAR == 2023


def test_list_sessions_filters_by_session_name(monkeypatch):
    fake = make_openf1_get({"sessions": SESSIONS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    result = list_sessions(2026, "Race")

    assert [s["session_key"] for s in result] == [11334, 11342]


def test_list_sessions_without_a_name_returns_everything(monkeypatch):
    fake = make_openf1_get({"sessions": SESSIONS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert len(list_sessions(2026)) == 3


def test_session_results_issues_one_request_for_many_keys(monkeypatch):
    """The whole point of the migration. Five races must cost one request, not five."""
    rows = [
        {"session_key": key, "position": 1, "driver_number": 1, "points": 25.0}
        for key in (11334, 11338, 11342)
    ]
    fake = make_openf1_get({"session_result": rows})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    session_results({11334, 11342})

    assert len(fake.calls) == 1


def test_session_results_spans_min_to_max_of_the_wanted_keys(monkeypatch):
    fake = make_openf1_get({"session_result": []})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    session_results({11342, 11334, 11338})

    params = fake.calls[0]["params"]
    assert params["session_key>="] == 11334
    assert params["session_key<="] == 11342


def test_session_results_discards_keys_outside_the_wanted_set(monkeypatch):
    """A range query sweeps in practice and quali sessions too. They must not survive."""
    rows = [
        {"session_key": 11334, "position": 1, "driver_number": 1, "points": 25.0},
        {"session_key": 11338, "position": 1, "driver_number": 4},
        {"session_key": 11342, "position": 1, "driver_number": 1, "points": 25.0},
    ]
    fake = make_openf1_get({"session_result": rows})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    result = session_results({11334, 11342})

    assert {row["session_key"] for row in result} == {11334, 11342}


def test_session_results_with_no_keys_makes_no_request(monkeypatch):
    fake = make_openf1_get({"session_result": []})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert session_results(set()) == []
    assert fake.calls == []


def test_driver_index_maps_number_to_identity(monkeypatch):
    rows = [
        {
            "session_key": 11334,
            "driver_number": 1,
            "full_name": "Max VERSTAPPEN",
            "name_acronym": "VER",
            "team_name": "Red Bull Racing",
        }
    ]
    fake = make_openf1_get({"drivers": rows})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert driver_index({11334}) == {
        1: {
            "full_name": "Max VERSTAPPEN",
            "name_acronym": "VER",
            "team_name": "Red Bull Racing",
        }
    }


def test_driver_index_prefers_the_latest_session_for_a_driver(monkeypatch):
    """A mid-season team change must report the team the driver is in now."""
    rows = [
        {
            "session_key": 11334,
            "driver_number": 5,
            "full_name": "A B",
            "name_acronym": "ABC",
            "team_name": "Old Team",
        },
        {
            "session_key": 11342,
            "driver_number": 5,
            "full_name": "A B",
            "name_acronym": "ABC",
            "team_name": "New Team",
        },
    ]
    fake = make_openf1_get({"drivers": rows})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert driver_index({11334, 11342})[5]["team_name"] == "New Team"


def test_a_non_200_raises_openf1_error(monkeypatch):
    fake = make_openf1_get({"sessions": []}, status_code=503)
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    with pytest.raises(OpenF1Error):
        list_sessions(2026)


def test_a_transport_failure_propagates(monkeypatch):
    """The client raises; translating to {"error": ...} is the @tool boundary's job."""

    def _boom(*args, **kwargs):
        raise requests.ConnectionError("openf1 unreachable")

    monkeypatch.setattr(openf1_client.requests, "get", _boom)

    with pytest.raises(requests.RequestException):
        list_sessions(2026)


def test_the_cache_collapses_a_repeated_call(monkeypatch):
    """Four tools fanning out in one briefing must not each fetch the same season."""
    fake = make_openf1_get({"sessions": SESSIONS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_sessions(2026, "Race")
    list_sessions(2026, "Race")

    assert len(fake.calls) == 1


def test_the_cache_distinguishes_different_params(monkeypatch):
    fake = make_openf1_get({"sessions": SESSIONS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_sessions(2026)
    list_sessions(2025)

    assert len(fake.calls) == 2


def test_a_failure_is_not_cached(monkeypatch):
    """Caching an exception would make one blip poison the process."""
    calls = []

    def _boom(*args, **kwargs):
        calls.append(kwargs)
        raise requests.ConnectionError("openf1 unreachable")

    monkeypatch.setattr(openf1_client.requests, "get", _boom)

    for _ in range(2):
        with pytest.raises(requests.RequestException):
            list_sessions(2026)

    assert len(calls) == 2
