"""Tests for the briefing admission guard.

Every test drives the guard's clock by hand. The limits are about hours and days, so a test
that slept would either take that long or prove nothing.
"""

import logging
import threading
from zoneinfo import ZoneInfo

import pytest
from freezegun import freeze_time

from api.guard import BUSY_RETRY_AFTER_SECONDS, AdmissionGuard, Lease, Rejection
from tests.factories import FakeClock

# 2026-09-30 10:00:00 UTC — 14h before the next UTC midnight.
T0 = 1_790_762_400.0
SECONDS_TO_MIDNIGHT = 14 * 3600

PACIFIC = ZoneInfo("America/Los_Angeles")


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock(T0)


def make_guard(clock: FakeClock, **overrides) -> AdmissionGuard:
    limits = {
        "per_ip_per_hour": 3,
        "daily_cap": 100,
        "max_concurrent": 10,
        "lease_seconds": 150,
    }
    limits.update(overrides)
    return AdmissionGuard(clock=clock, **limits)


def admit_and_release(guard: AdmissionGuard, ip: str) -> None:
    lease = guard.admit(ip)
    assert isinstance(lease, Lease), lease
    lease.release()


def test_the_clock_constant_really_is_ten_hundred_utc():
    """The daily-cap arithmetic below leans on T0; pin what it is rather than trust a comment."""
    assert T0 % 86400 == 10 * 3600


# ── Per-IP rolling hour ──────────────────────────────────────────────────────


def test_an_ip_is_admitted_up_to_its_hourly_limit(clock):
    guard = make_guard(clock)

    for _ in range(3):
        admit_and_release(guard, "203.0.113.7")


def test_the_request_over_the_hourly_limit_is_rate_limited(clock):
    guard = make_guard(clock)
    for _ in range(3):
        admit_and_release(guard, "203.0.113.7")

    rejection = guard.admit("203.0.113.7")

    assert rejection == Rejection(
        code="rate_limited", status=429, retry_after_seconds=3600, limit=3
    )


def test_retry_after_counts_down_to_the_oldest_request_leaving_the_window(clock):
    guard = make_guard(clock)
    admit_and_release(guard, "203.0.113.7")
    clock.advance(600)
    admit_and_release(guard, "203.0.113.7")
    admit_and_release(guard, "203.0.113.7")
    clock.advance(100)

    rejection = guard.admit("203.0.113.7")

    # The first request was 700s ago, so it leaves the hour in 2900s.
    assert rejection.retry_after_seconds == 2900


def test_the_window_rolls_rather_than_resetting_on_the_hour(clock):
    guard = make_guard(clock)
    admit_and_release(guard, "203.0.113.7")
    clock.advance(1800)
    admit_and_release(guard, "203.0.113.7")
    admit_and_release(guard, "203.0.113.7")

    clock.advance(1800)  # the first request is now exactly an hour old

    admit_and_release(guard, "203.0.113.7")
    assert isinstance(guard.admit("203.0.113.7"), Rejection)


def test_one_ips_limit_does_not_touch_another(clock):
    guard = make_guard(clock)
    for _ in range(3):
        admit_and_release(guard, "203.0.113.7")

    admit_and_release(guard, "198.51.100.2")


# ── Global daily cap ─────────────────────────────────────────────────────────


def test_the_daily_cap_rejects_once_the_day_has_used_it_whoever_asks(clock):
    guard = make_guard(clock, daily_cap=4)
    for index in range(4):
        admit_and_release(guard, f"203.0.113.{index}")

    rejection = guard.admit("198.51.100.2")

    assert rejection == Rejection(
        code="daily_cap", status=503, retry_after_seconds=SECONDS_TO_MIDNIGHT, limit=4
    )


def test_the_daily_cap_resets_at_midnight_utc_by_default(clock):
    guard = make_guard(clock, daily_cap=1)
    admit_and_release(guard, "203.0.113.1")
    clock.advance(SECONDS_TO_MIDNIGHT - 1)
    assert guard.admit("203.0.113.2").code == "daily_cap"

    clock.advance(1)

    admit_and_release(guard, "203.0.113.2")


def test_a_zero_daily_cap_is_no_cap(clock):
    guard = make_guard(clock, daily_cap=0, per_ip_per_hour=1)

    for index in range(250):
        admit_and_release(guard, f"10.0.0.{index}")


# ── The day's zone ───────────────────────────────────────────────────────────
#
# Gemini's free-tier daily quota resets at midnight Pacific, DST included, so production counts
# the cap's day there. These run on the guard's default clock under freeze_time, so they also
# prove that clock is one freeze_time moves. In 2026 Pacific clocks go forward on 8 March and
# back on 1 November, both at 02:00 local.


def pacific_guard() -> AdmissionGuard:
    return AdmissionGuard(
        per_ip_per_hour=100,
        daily_cap=1,
        max_concurrent=10,
        lease_seconds=150,
        day_tz=PACIFIC,
    )


def test_a_pacific_day_runs_through_utc_midnight_to_pacific_midnight():
    with freeze_time("2026-10-13T23:00:00Z") as frozen:  # 16:00 PDT
        guard = pacific_guard()
        admit_and_release(guard, "203.0.113.1")
        assert guard.admit("203.0.113.2").retry_after_seconds == 8 * 3600

        frozen.move_to("2026-10-14T00:00:00Z")  # UTC's midnight, 17:00 PDT the same day
        assert guard.admit("203.0.113.2").code == "daily_cap"

        frozen.move_to("2026-10-14T07:00:00Z")  # 00:00 PDT

        admit_and_release(guard, "203.0.113.2")


def test_the_spring_forward_day_is_23_hours_long():
    with freeze_time("2026-03-08T07:59:59Z") as frozen:  # 7 March, 23:59:59 PST
        guard = pacific_guard()
        admit_and_release(guard, "203.0.113.1")
        assert guard.admit("203.0.113.2").retry_after_seconds == 1

        frozen.move_to("2026-03-08T08:00:00Z")  # 8 March, 00:00 PST
        admit_and_release(guard, "203.0.113.2")
        # To 9 March 00:00 PDT. A 24-hour day, or the offset the day began on, says 24h.
        assert guard.admit("203.0.113.3").retry_after_seconds == 23 * 3600

        frozen.move_to("2026-03-09T06:59:59Z")  # 8 March, 23:59:59 PDT
        assert guard.admit("203.0.113.3").code == "daily_cap"

        frozen.move_to("2026-03-09T07:00:00Z")  # 9 March, 00:00 PDT

        admit_and_release(guard, "203.0.113.3")


def test_the_fall_back_day_is_25_hours_long():
    with freeze_time("2026-11-01T06:59:59Z") as frozen:  # 31 October, 23:59:59 PDT
        guard = pacific_guard()
        admit_and_release(guard, "203.0.113.1")
        assert guard.admit("203.0.113.2").retry_after_seconds == 1

        frozen.move_to("2026-11-01T07:00:00Z")  # 1 November, 00:00 PDT
        admit_and_release(guard, "203.0.113.2")
        assert guard.admit("203.0.113.3").retry_after_seconds == 25 * 3600

        # 1 November, 23:59:59 PST — the hour a fixed PDT offset would already have reset at.
        frozen.move_to("2026-11-02T07:59:59Z")
        assert guard.admit("203.0.113.3").code == "daily_cap"

        frozen.move_to("2026-11-02T08:00:00Z")  # 2 November, 00:00 PST

        admit_and_release(guard, "203.0.113.3")


# ── Closed until an upstream budget comes back ───────────────────────────────

# Gemini's next reset seen from T0: 07:00 UTC tomorrow, seven hours past the guard's own midnight.
SECONDS_TO_REOPENING = 21 * 3600


def test_a_closed_guard_turns_everyone_away_as_the_daily_cap_until_it_reopens(clock):
    guard = make_guard(clock, daily_cap=4)

    closed = guard.close_until(T0 + SECONDS_TO_REOPENING)

    expected = Rejection(
        code="daily_cap", status=503, retry_after_seconds=SECONDS_TO_REOPENING, limit=4
    )
    assert closed == expected
    assert guard.admit("198.51.100.2") == expected


def test_a_close_outlasts_the_guards_own_day_turning_over(clock):
    """The guard's day and the upstream's need not end together: Gemini's resets at Pacific
    midnight, and a close that ended with the guard's day would let the next run spend its
    attempts on a quota that is still gone."""
    guard = make_guard(clock, daily_cap=1)
    guard.close_until(T0 + SECONDS_TO_REOPENING)
    clock.advance(SECONDS_TO_MIDNIGHT + 1800)

    rejection = guard.admit("203.0.113.1")

    assert rejection == Rejection(
        code="daily_cap",
        status=503,
        retry_after_seconds=SECONDS_TO_REOPENING - SECONDS_TO_MIDNIGHT - 1800,
        limit=1,
    )


def test_a_closed_guard_reopens_on_time_with_its_day_unspent(clock):
    """Refusals while closed are free, like every other refusal."""
    guard = make_guard(clock, daily_cap=1)
    guard.close_until(T0 + 600)
    for index in range(3):
        assert guard.admit(f"203.0.113.{index}").code == "daily_cap"

    clock.advance(600)

    admit_and_release(guard, "203.0.113.9")


def test_a_later_close_never_shortens_an_earlier_one(clock):
    guard = make_guard(clock)
    guard.close_until(T0 + 600)
    guard.close_until(T0 + 60)
    clock.advance(120)

    assert guard.admit("203.0.113.1").retry_after_seconds == 480


def test_a_guard_with_no_daily_cap_still_closes(clock):
    guard = make_guard(clock, daily_cap=0)
    guard.close_until(T0 + 600)

    assert guard.admit("203.0.113.1").code == "daily_cap"


def test_a_close_is_checked_before_the_slots(clock):
    """A full house while closed is told the day is spent, not to come back in ten seconds."""
    guard = make_guard(clock, max_concurrent=1)
    guard.admit("203.0.113.1")
    guard.close_until(T0 + 600)

    assert guard.admit("203.0.113.2").code == "daily_cap"


# ── Concurrency ──────────────────────────────────────────────────────────────


def test_a_full_house_is_busy_rather_than_queued(clock):
    guard = make_guard(clock, max_concurrent=2)
    guard.admit("203.0.113.1")
    guard.admit("203.0.113.2")

    rejection = guard.admit("203.0.113.3")

    assert rejection == Rejection(
        code="busy", status=503, retry_after_seconds=BUSY_RETRY_AFTER_SECONDS, limit=2
    )
    assert BUSY_RETRY_AFTER_SECONDS == 10


def test_releasing_a_lease_frees_its_slot(clock):
    guard = make_guard(clock, max_concurrent=1)
    lease = guard.admit("203.0.113.1")
    assert guard.in_use == 1

    lease.release()

    assert guard.in_use == 0
    admit_and_release(guard, "203.0.113.2")


def test_releasing_twice_frees_one_slot_not_two(clock):
    """Release is called from more than one teardown path on purpose, so it must be
    idempotent — a second release must not free a slot some other request now holds."""
    guard = make_guard(clock, max_concurrent=2)
    first = guard.admit("203.0.113.1")
    guard.admit("203.0.113.2")

    first.release()
    first.release()

    assert guard.in_use == 1


def test_a_lease_nobody_released_expires_as_a_backstop(clock, caplog):
    guard = make_guard(clock, max_concurrent=1, lease_seconds=150)
    guard.admit("203.0.113.1")  # never released
    clock.advance(149)
    assert guard.admit("203.0.113.2").code == "busy"

    clock.advance(1)

    with caplog.at_level(logging.WARNING, logger="api.guard"):
        assert guard.in_use == 0
    assert "expired without being released" in caplog.text
    admit_and_release(guard, "203.0.113.2")


def test_releasing_an_expired_lease_after_the_fact_frees_nothing_else(clock):
    guard = make_guard(clock, max_concurrent=1, lease_seconds=150)
    stale = guard.admit("203.0.113.1")
    clock.advance(150)
    fresh = guard.admit("203.0.113.2")
    assert isinstance(fresh, Lease)

    stale.release()

    assert guard.in_use == 1


# ── Order, and what counts ───────────────────────────────────────────────────


def test_a_rejected_request_counts_against_neither_limit(clock):
    guard = make_guard(clock, per_ip_per_hour=2, daily_cap=2, max_concurrent=1)
    held = guard.admit("203.0.113.1")

    for _ in range(5):
        assert guard.admit("203.0.113.9").code == "busy"
    held.release()

    # Five busy rejections later, .9 still has both of its hourly requests and the day has
    # one briefing left — which .9 then takes.
    admit_and_release(guard, "203.0.113.9")
    assert guard.admit("203.0.113.9").code == "daily_cap"


def test_a_daily_cap_rejection_does_not_spend_the_ips_hour(clock):
    guard = make_guard(clock, per_ip_per_hour=1, daily_cap=1)
    admit_and_release(guard, "203.0.113.1")
    for _ in range(3):
        assert guard.admit("203.0.113.2").code == "daily_cap"

    clock.advance(SECONDS_TO_MIDNIGHT)

    admit_and_release(guard, "203.0.113.2")


def test_the_per_ip_limit_is_checked_before_the_daily_cap(clock):
    guard = make_guard(clock, per_ip_per_hour=1, daily_cap=1)
    admit_and_release(guard, "203.0.113.1")

    assert guard.admit("203.0.113.1").code == "rate_limited"


def test_the_daily_cap_is_checked_before_the_slots(clock):
    guard = make_guard(clock, daily_cap=1, max_concurrent=1)
    guard.admit("203.0.113.1")  # holds the only slot and the day's only briefing

    assert guard.admit("203.0.113.2").code == "daily_cap"


# ── Threads and memory ───────────────────────────────────────────────────────


def test_concurrent_admission_never_hands_out_more_slots_than_there_are(clock):
    guard = make_guard(clock, per_ip_per_hour=1000, daily_cap=0, max_concurrent=3)
    start = threading.Barrier(32)
    results: list[object] = []
    lock = threading.Lock()

    def contend() -> None:
        start.wait()
        outcome = guard.admit("203.0.113.1")
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=contend) for _ in range(32)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sum(isinstance(r, Lease) for r in results) == 3
    assert guard.in_use == 3


def test_ips_whose_hour_has_passed_are_forgotten(clock):
    guard = make_guard(clock)
    for index in range(50):
        admit_and_release(guard, f"203.0.113.{index}")
    assert guard.tracked_ips == 50

    clock.advance(3600)
    admit_and_release(guard, "198.51.100.2")

    assert guard.tracked_ips == 1


def test_a_full_ip_table_turns_a_new_ip_away_as_busy_rather_than_growing(clock):
    """The table is bounded. Under a flood of distinct addresses (an IPv6 /64 is plenty),
    turning new ones away protects the budget; evicting old ones would let a flood reset
    everyone's limits, and growing without bound is the thing being guarded against."""
    guard = make_guard(clock, max_tracked_ips=2)
    admit_and_release(guard, "203.0.113.1")
    admit_and_release(guard, "203.0.113.2")

    assert guard.admit("203.0.113.3").code == "busy"
    admit_and_release(guard, "203.0.113.1")  # a known IP is unaffected
    assert guard.tracked_ips == 2

    clock.advance(3600)
    admit_and_release(guard, "203.0.113.3")
