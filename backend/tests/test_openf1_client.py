"""Tests for the OpenF1 HTTP client.

Two things here are worth more than the response shaping. First, the range-query
pattern: one request spanning min..max of the wanted keys, filtered in Python. Looping
one request per race is both slow and the only realistic way to breach OpenF1's
3 req/s ceiling, so the request count is asserted directly. Second, the cache, which
is process-global and therefore reset by an autouse fixture in conftest.
"""

import json
import logging
import threading
import time

import pytest
import requests
from freezegun import freeze_time

from tests.factories import OPENF1_RATE_LIMITED, make_openf1_get, make_openf1_sequence
from tools import openf1_client
from tools.openf1_client import (
    MAX_RETRIES,
    MAX_RETRY_WAIT,
    OPENF1_BASE_URL,
    OPENF1_FIRST_YEAR,
    OPENF1_MIN_INTERVAL,
    OpenF1Error,
    _pace,
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


# ── Throttle and retry ────────────────────────────────────────────────────────────────
#
# The first briefing after a restart fanned seven tools out cold against OpenF1's free tier
# (3 req/s, 30 req/min) and one request got a 429 — the standings, which have no FastF1
# fallback, were lost. conftest's ``openf1_retry_sleeps`` gives every test a fake clock, so these
# waits cost nothing and are all recorded.

ROWS = [{"meeting_key": 1}]


def test_two_429s_then_a_200_returns_the_rows(monkeypatch, openf1_retry_sleeps):
    fake = make_openf1_sequence([429, 429, 200], ROWS)
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert list_meetings(2026) == ROWS
    assert len(fake.calls) == 3
    assert len(openf1_retry_sleeps) == 2


def test_a_retry_after_header_is_honoured(monkeypatch, openf1_retry_sleeps):
    fake = make_openf1_sequence([429, 200], ROWS, headers={"Retry-After": "2"})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_meetings(2026)

    assert openf1_retry_sleeps == [2.0]


@pytest.mark.parametrize("status", [502, 503, 504])
def test_a_gateway_failure_is_retried_too(monkeypatch, status, openf1_retry_sleeps):
    fake = make_openf1_sequence([status, 200], ROWS)
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert list_meetings(2026) == ROWS


def test_retries_stop_after_three_and_name_the_status(monkeypatch, openf1_retry_sleeps):
    fake = make_openf1_sequence([503], ROWS)
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    with pytest.raises(OpenF1Error, match="503"):
        list_meetings(2026)

    assert len(fake.calls) == 4
    assert sum(openf1_retry_sleeps) <= 5.0


def test_retries_stop_once_the_wait_would_pass_the_cap(monkeypatch, openf1_retry_sleeps):
    """Two 2s Retry-Afters fit in the ~5s budget; a third does not, so a briefing is never held
    up for longer than that by one request."""
    fake = make_openf1_sequence([429], ROWS, headers={"Retry-After": "2"})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    with pytest.raises(OpenF1Error, match="429"):
        list_meetings(2026)

    assert len(fake.calls) == 3
    assert openf1_retry_sleeps == [2.0, 2.0]


def test_a_retry_after_longer_than_the_budget_gives_up_at_once(monkeypatch, openf1_retry_sleeps):
    fake = make_openf1_sequence([429], ROWS, headers={"Retry-After": "30"})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    with pytest.raises(OpenF1Error, match="429"):
        list_meetings(2026)

    assert len(fake.calls) == 1
    assert openf1_retry_sleeps == []


@pytest.mark.parametrize("status", [400, 401, 404, 500])
def test_any_other_error_status_is_not_retried(monkeypatch, status):
    fake = make_openf1_sequence([status, 200], ROWS)
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    with pytest.raises(OpenF1Error, match=str(status)):
        list_meetings(2026)

    assert len(fake.calls) == 1


def test_a_timeout_is_not_retried(monkeypatch):
    """A timeout has already spent OPENF1_TIMEOUT; retrying would triple it."""
    calls = []

    def _timeout(*args, **kwargs):
        calls.append(args)
        raise requests.Timeout("read timed out")

    monkeypatch.setattr(openf1_client.requests, "get", _timeout)

    with pytest.raises(requests.Timeout):
        list_meetings(2026)

    assert len(calls) == 1


def test_waiters_on_a_retried_fetch_get_its_rows(monkeypatch):
    """The retry lives in the single-flight fetcher, so the waiters keep waiting on its Event
    and share the eventual 200 — no waiter issues a request of its own."""
    sequence = make_openf1_sequence([429, 200], ROWS)

    def _slow(url, params=None, **kwargs):
        time.sleep(0.05)
        return sequence(url, params=params)

    monkeypatch.setattr(openf1_client.requests, "get", _slow)

    results: list[list] = []
    results_lock = threading.Lock()

    def _call():
        rows = list_meetings(2026)
        with results_lock:
            results.append(rows)

    _run_concurrently(_call, 4)

    assert results == [ROWS] * 4
    assert len(sequence.calls) == 2


@freeze_time("2026-09-30T12:00:00")
def test_a_retry_after_http_date_is_honoured(monkeypatch, openf1_retry_sleeps):
    fake = make_openf1_sequence(
        [429, 200], ROWS, headers={"Retry-After": "Wed, 30 Sep 2026 12:00:03 GMT"}
    )
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_meetings(2026)

    assert openf1_retry_sleeps == [3.0]


def test_an_unreadable_retry_after_falls_back_to_backoff(monkeypatch, openf1_retry_sleeps):
    fake = make_openf1_sequence([429, 200], ROWS, headers={"Retry-After": "soon"})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_meetings(2026)

    assert len(openf1_retry_sleeps) == 1
    assert 0.25 <= openf1_retry_sleeps[0] <= 0.5


# ── Rate limiting: requests are paced, a short 429 is waited out, a long one is not ──
#
# Measured live on 2026-09-30: a cold briefing fan-out bursts past OpenF1's 3 req/s and gets
# `429` with `Retry-After: 1`. Every tool but standings fell back to FastF1; standings has no
# fallback, so it failed in 2 of 3 runs and the briefing lost its championship context.


@freeze_time("2026-09-30")
def test_request_starts_are_spaced_min_interval_apart(monkeypatch, openf1_retry_sleeps):
    """With the clock frozen, each caller's wait is exactly its place in the queue."""
    monkeypatch.setattr(openf1_client, "_next_start", 0.0)

    for _ in range(3):
        _pace()

    # approx: a frozen monotonic reads an epoch-sized value, so 0.4 on top of it rounds.
    assert openf1_retry_sleeps == pytest.approx([OPENF1_MIN_INTERVAL, 2 * OPENF1_MIN_INTERVAL])


@freeze_time("2026-09-30")
def test_pacing_survives_the_per_request_cache_clear(monkeypatch, openf1_retry_sleeps):
    """Every route calls ``clear()`` when it finishes. If that reset the pacing, two
    back-to-back briefings would burst into each other as if neither had started.
    """
    monkeypatch.setattr(openf1_client, "_next_start", 0.0)

    _pace()
    openf1_client.clear()
    _pace()

    assert openf1_retry_sleeps == pytest.approx([OPENF1_MIN_INTERVAL])


def test_every_attempt_is_paced_including_a_retry(monkeypatch, openf1_retry_sleeps):
    paced = []
    monkeypatch.setattr(openf1_client, "_pace", lambda: paced.append(True))
    fake = make_openf1_get({"sessions": SESSIONS_2026}, throttled={"sessions": 1})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_sessions(2026)

    assert len(paced) == len(fake.calls) == 2


def _response(status_code: int, headers: dict[str, str] | None = None, rows=None):
    """A real ``requests.Response``, so the headers are the case-insensitive kind."""
    response = requests.Response()
    response.status_code = status_code
    response.headers.update(headers or {})
    response._content = json.dumps(rows if rows is not None else OPENF1_RATE_LIMITED).encode()
    return response


class _ScriptedGet:
    """A ``requests.get`` stand-in that answers with ``responses`` in order."""

    def __init__(self, *responses: requests.Response) -> None:
        self.responses = list(responses)
        self.calls: list[dict] = []

    def __call__(self, url: str, params: dict | None = None, **kwargs):
        self.calls.append({"url": url, "params": params or {}})
        return self.responses.pop(0)


def test_a_429_is_retried_after_the_wait_openf1_asks_for(monkeypatch, openf1_retry_sleeps):
    fake = make_openf1_get({"sessions": SESSIONS_2026}, throttled={"sessions": 1})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert list_sessions(2026) == SESSIONS_2026
    assert len(fake.calls) == 2
    assert fake.calls[0] == fake.calls[1]
    assert openf1_retry_sleeps == [1.0]


def test_a_retry_is_logged(monkeypatch, openf1_retry_sleeps, caplog):
    fake = make_openf1_get({"sessions": SESSIONS_2026}, throttled={"sessions": 1})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    with caplog.at_level(logging.INFO, logger="tools.openf1_client"):
        list_sessions(2026)

    assert "OpenF1 sessions returned HTTP 429" in caplog.text


def test_a_429_that_outlasts_every_attempt_raises(monkeypatch, openf1_retry_sleeps):
    fake = make_openf1_get({"sessions": []}, throttled={"sessions": MAX_RETRIES + 1})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    with pytest.raises(OpenF1Error, match="HTTP 429"):
        list_sessions(2026)

    assert len(fake.calls) == MAX_RETRIES + 1
    assert len(openf1_retry_sleeps) == MAX_RETRIES


def test_a_429_asking_for_a_long_wait_raises_at_once(monkeypatch, openf1_retry_sleeps):
    """A wait past the retry budget is some other limit — the per-minute one says 60 — which
    one briefing cannot usefully sit out. Raising now lets a tool with a FastF1 fallback take it.
    """
    wait = str(int(MAX_RETRY_WAIT) + 1)
    fake = _ScriptedGet(_response(429, {"Retry-After": wait}))
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    with pytest.raises(OpenF1Error, match="HTTP 429"):
        list_sessions(2026)

    assert len(fake.calls) == 1
    assert openf1_retry_sleeps == []


def test_waiters_share_the_fetchers_retry_rather_than_its_429(monkeypatch, openf1_retry_sleeps):
    """Standings and three other tools ask for the season's sessions at once. The retry
    has to happen inside the single flight: raised to the waiters, one 429 fails them all.
    """
    first_call_answered = threading.Event()

    class _SlowThenThrottled:
        def __init__(self) -> None:
            self.calls: list[dict] = []
            self._lock = threading.Lock()

        def __call__(self, url, params=None, **kwargs):
            with self._lock:
                self.calls.append({"url": url, "params": params or {}})
                first = len(self.calls) == 1
            if first:
                # Long enough for every other thread to arrive and wait on this flight.
                first_call_answered.wait(0.1)
                return _response(429, {"Retry-After": "1"})
            return _response(200, rows=[{"meeting_key": 1}])

    fake = _SlowThenThrottled()
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    results: list[list] = []
    errors: list[Exception] = []
    lock = threading.Lock()

    def _call():
        try:
            rows = list_meetings(2026)
        except Exception as exc:
            with lock:
                errors.append(exc)
        else:
            with lock:
                results.append(rows)

    _run_concurrently(_call, 4)

    assert errors == []
    assert results == [[{"meeting_key": 1}]] * 4
    assert len(fake.calls) == 2
