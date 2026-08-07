"""Tests for the OpenF1 HTTP client.

Two things here are worth more than the response shaping. First, the range-query
pattern: one request spanning min..max of the wanted keys, filtered in Python. Looping
one request per race is both slow and the only realistic way to breach OpenF1's
3 req/s ceiling, so the request count is asserted directly. Second, the cache, which
is process-global and therefore reset by an autouse fixture in conftest.
"""

import threading
import time

import pytest
import requests

from tests.factories import make_openf1_get
from tools import openf1_client
from tools.openf1_client import (
    OPENF1_BASE_URL,
    OPENF1_FIRST_YEAR,
    OpenF1Error,
    _range_params,
    driver_index,
    list_meetings,
    list_sessions,
    session_results,
)

MEETINGS_2026 = [
    {
        "meeting_key": 1290,
        "meeting_name": "Belgian Grand Prix",
        "circuit_short_name": "Spa-Francorchamps",
        "country_name": "Belgium",
    },
    {
        "meeting_key": 1291,
        "meeting_name": "Hungarian Grand Prix",
        "circuit_short_name": "Hungaroring",
        "country_name": "Hungary",
    },
]

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


def test_list_sessions_asks_openf1_to_filter_server_side(monkeypatch):
    """Guards the request, not just the result. The client-side filter alone would make
    the assertion above pass while fetching the whole season on every call — which is the
    per-request cost this migration exists to remove.
    """
    fake = make_openf1_get({"sessions": SESSIONS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_sessions(2026, "Race")

    assert fake.calls[0]["params"]["session_name"] == "Race"


def test_list_sessions_sends_no_session_name_when_none_is_asked_for(monkeypatch):
    fake = make_openf1_get({"sessions": SESSIONS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_sessions(2026)

    assert "session_name" not in fake.calls[0]["params"]


def test_list_meetings_returns_the_years_meetings(monkeypatch):
    fake = make_openf1_get({"meetings": MEETINGS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    result = list_meetings(2026)

    assert [m["meeting_key"] for m in result] == [1290, 1291]


def test_list_meetings_asks_the_meetings_endpoint(monkeypatch):
    """Guards the request, not just the result — a client that quietly served sessions
    or a cached year would pass on result shape alone.
    """
    fake = make_openf1_get({"meetings": MEETINGS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_meetings(2026)

    assert fake.calls[0]["url"].endswith("/meetings")
    assert fake.calls[0]["params"]["year"] == 2026


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
    assert params["session_key>"] == 11334
    assert params["session_key<"] == 11342


def test_the_range_query_serialises_to_openf1s_filter_syntax():
    """Asserts the encoded URL, not the params dict.

    OpenF1 wants `session_key>=11334`. Because requests supplies the `=` separator
    itself, the param key must stop at `>`; spelling it `session_key>=` encodes to
    `session_key%3E%3D` and appends a second `=`, which the API answers with a 404 that
    every tool silently absorbs as a FastF1 fallback. A params-dict assertion cannot see
    that — only the serialised URL can.
    """
    from requests.models import PreparedRequest

    request = PreparedRequest()
    request.prepare_url(f"{OPENF1_BASE_URL}/session_result", _range_params({11342, 11334}))

    assert "session_key%3E=11334" in request.url
    assert "session_key%3C=11342" in request.url
    assert "%3E%3D" not in request.url
    assert "%3C%3D" not in request.url


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


# ── Single-flight: concurrent misses for the same key must coalesce ─────────────────


class _BlockingResponse:
    """Stand-in for a ``requests.Response``, paired with ``_BlockingGet`` below."""

    def __init__(self, rows: list) -> None:
        self.status_code = 200
        self._rows = rows

    def json(self):
        return self._rows


class _BlockingGet:
    """A ``requests.get`` stand-in that sleeps before answering, so overlapping callers
    genuinely overlap rather than happening to run one after the other on a fast fake.

    ``.calls`` is appended to under a lock because these tests call it from real threads,
    unlike ``make_openf1_get``'s fake, which only ever sees one thread at a time elsewhere
    in the suite.
    """

    def __init__(self, rows: list | None = None, delay: float = 0.05, raises=None) -> None:
        self.rows = rows if rows is not None else []
        self.delay = delay
        self.raises = raises
        self._calls_lock = threading.Lock()
        self.calls: list[dict] = []

    def __call__(self, url: str, params: dict | None = None, **kwargs):
        with self._calls_lock:
            self.calls.append({"url": url, "params": params or {}})
        time.sleep(self.delay)
        if self.raises is not None:
            raise self.raises
        return _BlockingResponse(self.rows)


def _run_concurrently(target, count: int) -> list[threading.Thread]:
    barrier = threading.Barrier(count)

    def _synced():
        barrier.wait(timeout=5)
        target()

    threads = [threading.Thread(target=_synced) for _ in range(count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)
    return threads


def test_concurrent_misses_for_the_same_key_issue_exactly_one_request(monkeypatch):
    fake = _BlockingGet(rows=[{"meeting_key": 1}], delay=0.05)
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    results: list[list] = []
    results_lock = threading.Lock()

    def _call():
        result = list_meetings(2026)
        with results_lock:
            results.append(result)

    _run_concurrently(_call, 5)

    assert len(fake.calls) == 1
    assert results == [[{"meeting_key": 1}]] * 5


def test_concurrent_misses_for_different_keys_still_overlap(monkeypatch):
    """A single-flight implementation that holds the global lock for the whole fetch
    would serialise every key behind every other one — exactly the regression the range
    query was supposed to fix. Two different-key fetches must run concurrently.
    """
    fake = _BlockingGet(rows=[{"meeting_key": 1}], delay=0.2)
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    started = time.monotonic()
    threads = [
        threading.Thread(target=list_meetings, args=(2025,)),
        threading.Thread(target=list_meetings, args=(2026,)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)
    elapsed = time.monotonic() - started

    assert len(fake.calls) == 2
    # Serialised, this would take >= 2 * delay (0.4s); overlapped, close to 1 * delay.
    assert elapsed < 0.35


def test_a_failed_in_flight_fetch_propagates_to_every_waiter_and_is_not_cached(monkeypatch):
    fake = _BlockingGet(delay=0.05, raises=requests.ConnectionError("openf1 unreachable"))
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    errors: list[Exception] = []
    errors_lock = threading.Lock()

    def _call():
        try:
            list_meetings(2026)
        except requests.RequestException as exc:
            with errors_lock:
                errors.append(exc)

    _run_concurrently(_call, 4)

    assert len(errors) == 4
    assert len(fake.calls) == 1

    # Not cached: a later call retries rather than replaying the stale failure forever.
    fake.raises = None
    fake.rows = [{"meeting_key": 2}]

    assert list_meetings(2026) == [{"meeting_key": 2}]
    assert len(fake.calls) == 2
