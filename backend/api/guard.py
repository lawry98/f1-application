"""Admission control for briefing generation — the cost guard in front of Gemini.

Each briefing is two to four Gemini calls, so anything that can start one needs a ceiling. Three
checks, in this order, all before any work starts:

1. **Per-IP rolling hour.** ``429 rate_limited``.
2. **Global daily cap**, per calendar day in ``day_tz``. ``503 daily_cap``. UTC unless told
   otherwise; production counts Pacific days (``BRIEFING_DAY_TZ``), because that is when
   Gemini's free-tier daily quota resets. On UTC days one Gemini day spans the end of one guard
   day and the start of the next, so up to twice the cap could land in it.
3. **A concurrency slot**, taken without waiting. ``503 busy`` — a request is never queued,
   because a queued request is one a user has already given up on by the time it runs.

Only an admitted request counts against the first two. A rejection is free, so a user who
hits ``busy`` five times has not also spent their hour.

**The guard can also be closed until a given time** (:meth:`AdmissionGuard.close_until`), for
a budget upstream that it does not count itself: Gemini's daily quota can run out before the cap
does. A closed guard refuses at the daily cap's place in the order and with its ``daily_cap``
code — to a reader the day's budget is spent either way — until the close lifts, which need not
be the guard's own midnight.

**Everything is in this process's memory**, so the limits are per worker: run exactly one.
A second worker would double every limit and the two would never agree. Nothing here
survives a restart either, which resets the day's count; for a single small deployment that
is the right trade against running a shared store.

**The client IP is whatever the caller passes in**, and routes.py passes
``request.client.host``. It never parses a forwarding header itself, because anyone can send
one. Behind Fly, ``CLIENT_IP_HEADER=Fly-Client-IP`` makes ``client.host`` the visitor
(api/client_ip.py). Behind another proxy, either name the one header it sets the same way, or
run uvicorn with ``--proxy-headers`` and ``FORWARDED_ALLOW_IPS`` set to that proxy's exact
address — never ``*``, which trusts the leftmost, client-written entry.

**Memory is bounded.** An IP's history holds at most ``per_ip_per_hour`` timestamps and is
dropped once the hour has passed; the table holds at most ``max_tracked_ips`` addresses, and a
*new* address arriving when it is full is turned away as ``busy``. Evicting old entries instead
would let a flood of fresh addresses (an IPv6 /64 is plenty) reset everyone else's limits.

A slot is released by :meth:`Lease.release`, which the route calls from every way a response
can end. The lease also expires on its own after ``lease_seconds`` — a backstop for a teardown
path that never ran, so one leaked slot cannot turn into a permanently busy service.
"""

import itertools
import logging
import math
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, tzinfo

logger = logging.getLogger(__name__)

HOUR_SECONDS = 3600

# How long a busy client is told to wait. A normal briefing takes ~25s and two run at once, so
# a slot usually frees well inside this; it is a hint for the UI's countdown, not a promise.
BUSY_RETRY_AFTER_SECONDS = 10

DEFAULT_MAX_TRACKED_IPS = 10_000


def _wall_clock() -> float:
    """``time.time``, looked up on every call, so ``freeze_time`` moves the guard production
    builds too. A ``clock=time.time`` default would bind the real function once, at import."""
    return time.time()


@dataclass(frozen=True)
class Rejection:
    """Why a request was turned away, shaped for the HTTP response routes.py builds."""

    code: str
    status: int
    retry_after_seconds: int
    # The limit that was hit — the per-IP hourly count, the daily cap, or the slot count — so
    # the UI can say "your 5 briefings" without hard-coding a number the server owns.
    limit: int


class Lease:
    """One held concurrency slot. Releasing is idempotent."""

    def __init__(self, release: Callable[[], None]) -> None:
        self._release = release
        self._lock = threading.Lock()
        self._released = False

    def release(self) -> None:
        with self._lock:
            if self._released:
                return
            self._released = True
        self._release()


class AdmissionGuard:
    """Thread-safe, in-memory admission control. See the module docstring."""

    def __init__(
        self,
        *,
        per_ip_per_hour: int,
        daily_cap: int,
        max_concurrent: int,
        lease_seconds: float,
        day_tz: tzinfo = UTC,
        clock: Callable[[], float] = _wall_clock,
        max_tracked_ips: int = DEFAULT_MAX_TRACKED_IPS,
    ) -> None:
        self._per_ip_per_hour = per_ip_per_hour
        self._daily_cap = daily_cap
        self._max_concurrent = max_concurrent
        self._lease_seconds = lease_seconds
        self._day_tz = day_tz
        # Wall-clock seconds, not monotonic: the daily cap resets at a calendar boundary.
        self._clock = clock
        self._max_tracked_ips = max_tracked_ips

        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = {}
        self._day: date | None = None
        self._day_count = 0
        self._closed_until = 0.0
        self._leases: dict[int, float] = {}
        self._lease_ids = itertools.count()

    @property
    def in_use(self) -> int:
        """Slots currently held, after expiring any lease past its backstop."""
        with self._lock:
            self._reap_expired_leases(self._clock())
            return len(self._leases)

    @property
    def tracked_ips(self) -> int:
        with self._lock:
            self._forget_stale_ips(self._clock())
            return len(self._hits)

    def admit(self, ip: str) -> Lease | Rejection:
        """Admit ``ip`` and hand back a held slot, or say why not. Never blocks."""
        with self._lock:
            now = self._clock()
            self._reap_expired_leases(now)

            hits = self._hits.get(ip)
            if hits is not None:
                self._drop_old_hits(hits, now)
            if hits and len(hits) >= self._per_ip_per_hour:
                return Rejection(
                    code="rate_limited",
                    status=429,
                    retry_after_seconds=_whole_seconds(hits[0] + HOUR_SECONDS - now),
                    limit=self._per_ip_per_hour,
                )

            day = datetime.fromtimestamp(now, self._day_tz).date()
            if day != self._day:
                self._day, self._day_count = day, 0
            if now < self._closed_until:
                return self._closed_rejection(now)
            if self._daily_cap and self._day_count >= self._daily_cap:
                return Rejection(
                    code="daily_cap",
                    status=503,
                    retry_after_seconds=_whole_seconds(self._start_of_day_after(day) - now),
                    limit=self._daily_cap,
                )

            if len(self._leases) >= self._max_concurrent or not self._has_room_for(ip, now):
                return Rejection(
                    code="busy",
                    status=503,
                    retry_after_seconds=BUSY_RETRY_AFTER_SECONDS,
                    limit=self._max_concurrent,
                )

            # Admitted: only now does it count against anything.
            self._hits.setdefault(ip, deque()).append(now)
            self._day_count += 1
            lease_id = next(self._lease_ids)
            self._leases[lease_id] = now + self._lease_seconds

        return Lease(lambda: self._release(lease_id))

    def close_until(self, until: float) -> Rejection:
        """Refuse everyone as ``daily_cap`` until ``until``, a wall-clock time, and return what a
        request is now told. A later close never shortens an earlier one."""
        with self._lock:
            self._closed_until = max(self._closed_until, until)
            return self._closed_rejection(self._clock())

    def _closed_rejection(self, now: float) -> Rejection:
        return Rejection(
            code="daily_cap",
            status=503,
            retry_after_seconds=_whole_seconds(self._closed_until - now),
            limit=self._daily_cap,
        )

    def _release(self, lease_id: int) -> None:
        with self._lock:
            # Absent when the backstop already expired it — which must free nothing else.
            self._leases.pop(lease_id, None)

    def _start_of_day_after(self, day: date) -> float:
        """The instant of midnight after ``day`` in ``day_tz``. A day is not always 24 hours
        long there: Pacific's runs 23 when the clocks go forward and 25 when they go back."""
        after = day + timedelta(days=1)
        return datetime(after.year, after.month, after.day, tzinfo=self._day_tz).timestamp()

    def _has_room_for(self, ip: str, now: float) -> bool:
        if ip in self._hits or len(self._hits) < self._max_tracked_ips:
            return True
        self._forget_stale_ips(now)
        return len(self._hits) < self._max_tracked_ips

    def _reap_expired_leases(self, now: float) -> None:
        expired = [lease_id for lease_id, expires in self._leases.items() if expires <= now]
        for lease_id in expired:
            del self._leases[lease_id]
        if expired:
            logger.warning(
                "%d briefing slot(s) expired without being released; freed by the backstop",
                len(expired),
            )

    def _forget_stale_ips(self, now: float) -> None:
        for ip in list(self._hits):
            self._drop_old_hits(self._hits[ip], now)
            if not self._hits[ip]:
                del self._hits[ip]

    @staticmethod
    def _drop_old_hits(hits: deque[float], now: float) -> None:
        while hits and hits[0] <= now - HOUR_SECONDS:
            hits.popleft()


def _whole_seconds(seconds: float) -> int:
    """Round a wait up to whole seconds — a client told 0 would retry into the same wall."""
    return max(1, math.ceil(seconds))
