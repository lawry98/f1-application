"""HTTP client for the OpenF1 API — a plain helper, not an LLM-callable tool.

Same category as ``fastf1_helpers.py`` and ``schedule_cache.py``: adding a file to
``tools/`` does not make it a tool.

Three design points carry the migration.

**The range-query pattern.** OpenF1 supports comparison filters on any non-array
attribute, so N sessions cost one request spanning ``min(keys)..max(keys)``, with
unwanted rows dropped in Python. This is what turns ``get_driver_form``'s five
sequential 2.4s FastF1 session loads into a single sub-second call. It does *not*, on
its own, keep the tool fan-out under OpenF1's unauthenticated 3 req/s, 30 req/min
ceiling — measured live, four OpenF1-backed tools running through the executor pool
issued 12 requests in one briefing, 5 of them exact duplicates of the same
endpoint+params. The range pattern only removes the per-race loop; it says nothing
about two different tools independently missing the same cache key at the same time.

**Single-flight fetching.** ``_get`` coalesces concurrent misses for the same key so
that duplicate case above costs one request, not four. Distinct keys still burst: the
first briefing after a restart fanned seven tools out cold, and one request got a 429 —
the standings, which have no FastF1 fallback, were lost, and /standings answered 502.

**Throttle, then retry.** Every request start takes a slot from one process-wide
limiter, so the client never starts more than OpenF1's per-second limit, however many
tools and routes are asking. A 429 or a 502/503/504 that still comes back is retried by
the single-flight fetcher alone — waiters keep waiting on its Event and share the result
— honouring Retry-After, else exponential backoff with jitter, at most three times and
within about five seconds of added wait, so a briefing is slowed rather than stalled.
Past that it raises ``OpenF1Error`` naming the status, and the tools' FastF1 fallbacks
take over as before. A timeout or any other 4xx is never retried.

**This module raises.** The never-raise contract belongs at the ``@tool`` boundary,
where a failure has to become ``{"error": ...}``. A client that swallowed transport
errors could not be distinguished from one that found no data, and the tools need that
distinction to decide whether to fall back to FastF1.
"""

import logging
import random
import threading
import time
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import requests

logger = logging.getLogger(__name__)

OPENF1_BASE_URL = "https://api.openf1.org/v1"
OPENF1_TIMEOUT = 15.0

# OpenF1's published free-tier limits — "Up to 3 requests per second and 30 requests per
# minute" (https://openf1.org/, checked 2026-09-30; sponsors get 6 and 60). The client
# throttles to the per-second one. The per-minute one is a budget, not a throttle: waiting
# out a minute would stall a briefing, so a breach surfaces as a 429 and the bounded retry
# below. A cold briefing costs five to eight requests and a cold /standings view four.
OPENF1_REQUESTS_PER_SECOND = 3

# Retried: rate limiting, and the gateway errors that mean "try again". Nothing else — a
# timeout has already spent OPENF1_TIMEOUT, and any other 4xx will not change on a retry.
RETRY_STATUSES = frozenset({429, 502, 503, 504})
MAX_RETRIES = 3
# Total seconds of backoff one request may add, so a briefing slows rather than stalls.
MAX_RETRY_WAIT = 5.0
# Exponential backoff with jitter, when there is no Retry-After: 0.25-0.5s, 0.5-1s, then
# 1-2s — 3.5s at worst, so all three retries fit inside MAX_RETRY_WAIT. Only a long
# Retry-After can reach the cap.
BACKOFF_BASE = 0.5

# OpenF1 coverage begins with the 2023 season; `sessions?year=2022` returns
# {"detail": "No results found."}. Every coverage check in the codebase reads this
# constant so the tools and the API route cannot disagree about the boundary.
OPENF1_FIRST_YEAR = 2023

_lock = threading.Lock()
_cache: dict[tuple[str, frozenset], list[dict[str, Any]]] = {}

# Single-flight bookkeeping, guarded by `_lock` like `_cache`. A key present in
# `_in_flight` has an in-progress fetch; whoever put it there is the "fetcher" and
# everyone else is a "waiter" blocking on that key's Event. `_in_flight_errors` is how a
# fetcher hands its exception to every waiter — it outlives the fetch itself (cleared only
# when a later attempt for the same key becomes the new fetcher) so a waiter that reads it
# after the Event fires never races the fetcher's own cleanup.
_in_flight: dict[tuple[str, frozenset], threading.Event] = {}
_in_flight_errors: dict[tuple[str, frozenset], BaseException] = {}


class OpenF1Error(RuntimeError):
    """A non-200 from OpenF1. Transport failures surface as requests exceptions."""


class StartRateLimiter:
    """At most ``limit`` request starts in any rolling ``per`` seconds, across threads.

    A rolling window rather than a fixed spacing, so a burst up to the limit starts at once —
    two tools' requests still overlap — and only the request past it waits for the oldest start
    to leave the window. The clock and the sleep are injectable so the suite never really waits.
    """

    def __init__(
        self,
        limit: int,
        per: float,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._limit = limit
        self._per = per
        self._clock = clock
        self._sleep = sleep
        self._starts: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> float:
        """Block until a start is allowed, record it, and return how long that took."""
        waited = 0.0
        while True:
            with self._lock:
                now = self._clock()
                while self._starts and now - self._starts[0] >= self._per:
                    self._starts.popleft()
                if len(self._starts) < self._limit:
                    self._starts.append(now)
                    return waited
                delay = self._per - (now - self._starts[0])
            self._sleep(delay)
            waited += delay


# Process-wide on purpose: the limit is OpenF1's per client, not per tool or per request.
# Never reset by `clear()`, which every route calls — that would free the slots of requests
# another route is still making.
_limiter = StartRateLimiter(OPENF1_REQUESTS_PER_SECOND, 1.0)
_sleep: Callable[[float], None] = time.sleep


def _retry_delay(response: Any, attempt: int) -> float:
    """Seconds before retry ``attempt`` (0-based): Retry-After when OpenF1 sends one — in
    seconds or as an HTTP date — else exponential backoff with jitter."""
    retry_after = response.headers.get("Retry-After")
    if retry_after is not None:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            try:
                when = parsedate_to_datetime(retry_after)
                return max(0.0, (when - datetime.now(UTC)).total_seconds())
            except (TypeError, ValueError):
                pass
    return BACKOFF_BASE * 2**attempt * (0.5 + random.random() / 2)


def _request(endpoint: str, params: dict[str, Any]) -> Any:
    """One throttled GET, retried on RETRY_STATUSES within MAX_RETRIES and MAX_RETRY_WAIT.

    Returns the final response, whatever its status, unless the retries ran out on a retryable
    one — then raises ``OpenF1Error`` naming it. Transport exceptions, timeouts included,
    propagate untouched on the first attempt.
    """
    waited = 0.0
    for attempt in range(MAX_RETRIES + 1):
        throttled = _limiter.acquire()
        if throttled:
            logger.info("Throttled OpenF1 %s: waited %.2fs for a request slot", endpoint, throttled)

        response = requests.get(
            f"{OPENF1_BASE_URL}/{endpoint}", params=params, timeout=OPENF1_TIMEOUT
        )
        status = response.status_code
        if status not in RETRY_STATUSES:
            return response
        if attempt == MAX_RETRIES:
            break

        delay = _retry_delay(response, attempt)
        if waited + delay > MAX_RETRY_WAIT:
            break
        logger.warning(
            "OpenF1 %s returned HTTP %d; retry %d of %d in %.2fs",
            endpoint,
            status,
            attempt + 1,
            MAX_RETRIES,
            delay,
        )
        _sleep(delay)
        waited += delay

    raise OpenF1Error(
        f"OpenF1 {endpoint} returned HTTP {status} after {attempt} retries ({waited:.1f}s)"
    )


def clear() -> None:
    """Clear the cached responses. Used by tests; harmless in production.

    Also clears single-flight bookkeeping so a stale recorded error from one test can
    never leak into the next; in production there is nothing in-flight by the time a
    request handler's ``finally`` block gets here.
    """
    with _lock:
        _cache.clear()
        _in_flight.clear()
        _in_flight_errors.clear()


def _get(endpoint: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    """Fetch and cache one endpoint+params combination, coalescing concurrent misses.

    The lock is released during the request, exactly as in ``schedule_cache.py``:
    concurrent misses for *different* keys must not serialise network I/O. Concurrent
    misses for the *same* key single-flight instead — one thread fetches, the rest wait
    on that fetch's ``Event`` and share its outcome — because a duplicate fetch of the
    same key is not the harmless "last write wins" it would be for the schedule cache:
    OpenF1's unauthenticated ceiling is 3 req/s, and this module is asked for the same
    key from every tool in one fan-out. Only the fetcher throttles and retries, so a
    retried 200 reaches every waiter without any of them issuing a request of its own.

    Failures are deliberately not cached — one blip would otherwise poison the process
    for its lifetime — but they are recorded long enough for every waiter on that fetch
    to see and re-raise them, so one thread's failure never leaves another hanging.
    """
    key = (endpoint, frozenset(params.items()))

    with _lock:
        if key in _cache:
            return _cache[key]
        event = _in_flight.get(key)
        if event is None:
            event = threading.Event()
            _in_flight[key] = event
            _in_flight_errors.pop(key, None)
            is_fetcher = True
        else:
            is_fetcher = False

    if not is_fetcher:
        logger.debug("Waiting on an in-flight OpenF1 fetch for %s", endpoint)
        event.wait()
        with _lock:
            if key in _cache:
                return _cache[key]
            error = _in_flight_errors.get(key)
        if error is not None:
            raise error
        # The fetcher's Event fired with neither a cached result nor a recorded error —
        # not reachable given the try/except/finally below, but recursing rather than
        # asserting means a future change here fails safe (a retry) instead of wedging
        # every waiter.
        return _get(endpoint, params)

    try:
        response = _request(endpoint, params)
        if response.status_code != 200:
            raise OpenF1Error(f"OpenF1 {endpoint} returned HTTP {response.status_code}")

        payload = response.json()
        # A miss is `{"detail": "No results found."}`, not an empty array. Normalising it
        # to [] here is what lets every caller treat "no data" as a falsy list.
        rows = payload if isinstance(payload, list) else []

        with _lock:
            _cache[key] = rows
        return rows
    except Exception as exc:
        with _lock:
            _in_flight_errors[key] = exc
        raise
    finally:
        with _lock:
            _in_flight.pop(key, None)
        event.set()


def _range_params(keys: set[int]) -> dict[str, Any]:
    """Build the one-request span covering every key in the set.

    The key names end at the comparison character on purpose. OpenF1's filter syntax is
    ``session_key>=11334``, and ``requests`` supplies the ``=`` itself as the key/value
    separator — so ``{"session_key>": 11334}`` serialises to ``session_key%3E=11334``,
    which is what the API wants. Writing the operator out in full as ``"session_key>="``
    makes requests encode it to ``session_key%3E%3D`` and append a second ``=``, producing
    ``session_key>==11334`` and a silent HTTP 404 that every tool then absorbs as a
    FastF1 fallback. Verified against the live API.
    """
    return {"session_key>": min(keys), "session_key<": max(keys)}


def list_sessions(year: int, session_name: str | None = None) -> list[dict[str, Any]]:
    """Return the year's sessions, optionally narrowed to one session_name.

    Args:
        year: Season to query.
        session_name: Exact OpenF1 name — "Race", "Sprint", "Qualifying", "Practice 1"…
            Sent to the server to save bandwidth, and filtered again client-side as a guard
            against a response that ignores the parameter.

    Returns:
        Session dicts carrying session_key, meeting_key, session_name,
        circuit_short_name, country_name, and date_start. Empty when OpenF1 has no data.
    """
    params: dict[str, Any] = {"year": year}
    if session_name is not None:
        params["session_name"] = session_name
    result = _get("sessions", params)
    if session_name is not None:
        result = [s for s in result if s.get("session_name") == session_name]
    return result


def list_meetings(year: int) -> list[dict[str, Any]]:
    """Return the year's meetings (one per Grand Prix weekend).

    Exists because ``meeting_name`` is the only OpenF1 field that speaks FastF1's event
    vocabulary. ``sessions`` carries ``circuit_short_name`` (a place — "Spa-Francorchamps")
    and ``country_name`` (a noun — "Belgium"), but FastF1's ``EventName`` is adjectival
    ("Belgian Grand Prix"). Substring matching cannot bridge "Belgian" to "Belgium" or to
    "Spa-Francorchamps", so callers needing to resolve an EventName match against
    ``meeting_name`` instead, then join back to a Race session via ``meeting_key``.

    Args:
        year: Season to query.

    Returns:
        Meeting dicts carrying meeting_key, meeting_name, circuit_short_name, and
        country_name. Empty when OpenF1 has no data.
    """
    return _get("meetings", {"year": year})


def session_results(keys: set[int]) -> list[dict[str, Any]]:
    """Return classification rows for exactly the given session keys, in one request.

    Args:
        keys: Session keys wanted. An empty set makes no request.

    Returns:
        Rows carrying position, driver_number, points, dnf, dns, dsq, duration and
        gap_to_leader. Rows whose session_key is not in ``keys`` are dropped — the range
        query sweeps in practice and qualifying sessions that fall inside the span.

        Note that qualifying rows carry no ``points`` key at all, so callers summing
        points must still filter by session_name upstream rather than relying on that.
    """
    if not keys:
        return []
    rows = _get("session_result", _range_params(keys))
    return [row for row in rows if row.get("session_key") in keys]


def driver_index(keys: set[int]) -> dict[int, dict[str, str]]:
    """Map driver_number to identity across the given sessions, in one request.

    ``session_result`` carries only ``driver_number``, so every tool that reports a name
    or a team needs this join.

    Args:
        keys: Session keys to draw the roster from.

    Returns:
        driver_number → {full_name, name_acronym, team_name}. Where a driver appears in
        several sessions the *latest* session wins, so a mid-season team change reports
        the team the driver is in now rather than the one they started the year in.
    """
    if not keys:
        return {}
    rows = [row for row in _get("drivers", _range_params(keys)) if row.get("session_key") in keys]

    index: dict[int, dict[str, str]] = {}
    for row in sorted(rows, key=lambda r: r.get("session_key", 0)):
        number = row.get("driver_number")
        if number is None:
            continue
        index[number] = {
            "full_name": row.get("full_name", ""),
            "name_acronym": row.get("name_acronym", ""),
            "team_name": row.get("team_name", ""),
        }
    return index


def driver_teams_by_session(keys: set[int]) -> dict[tuple[int, int], str]:
    """Map (session_key, driver_number) to the team driven for in that specific session.

    ``driver_index`` deliberately collapses each driver to their *latest* session's team
    — correct for reporting who a driver races for now, wrong for attributing historical
    points. A mid-season transfer (Tsunoda, RB -> Red Bull, 2025) must split a driver's
    points across both constructors, not credit the whole season to whichever team they
    ended up on. This is the per-session join that makes that possible.

    Reads the same ``drivers`` endpoint as ``driver_index`` and the same range query, so
    calling both for the same ``keys`` costs one request between them, not two — the
    second call is a cache hit.

    Args:
        keys: Session keys to draw the roster from.

    Returns:
        (session_key, driver_number) → team_name.
    """
    if not keys:
        return {}
    rows = [row for row in _get("drivers", _range_params(keys)) if row.get("session_key") in keys]

    teams: dict[tuple[int, int], str] = {}
    for row in rows:
        session_key = row.get("session_key")
        number = row.get("driver_number")
        if session_key is None or number is None:
            continue
        teams[(session_key, number)] = row.get("team_name", "")
    return teams
