"""Direct tests for the schedule cache's fetch/cache/clear contract.

Everything else in the suite patches ``get_schedule`` away; these are the only tests
that execute its body. The conftest network guard makes an unpatched fetch loud, so
the counting fake below is the sole seam.
"""

import fastf1
import pytest

from tests.factories import make_schedule
from tools import schedule_cache


@pytest.fixture
def fetch_calls(monkeypatch):
    """Patch the FastF1 fetch with a counting fake and return the call log."""
    calls: list[int] = []

    def fake_fetch(year: int):
        calls.append(year)
        return make_schedule([{"name": f"Test {year} Grand Prix", "date": f"{year}-05-01"}])

    monkeypatch.setattr(fastf1, "get_event_schedule", fake_fetch)
    return calls


def test_a_repeat_lookup_is_served_from_the_cache(fetch_calls):
    first = schedule_cache.get_schedule(2025)
    second = schedule_cache.get_schedule(2025)

    assert fetch_calls == [2025]
    assert second is first


def test_each_year_is_fetched_independently(fetch_calls):
    schedule_cache.get_schedule(2024)
    schedule_cache.get_schedule(2025)
    assert fetch_calls == [2024, 2025]


def test_prefill_satisfies_a_lookup_without_fetching(fetch_calls):
    frame = make_schedule([{"name": "Seeded Grand Prix", "date": "2025-06-01"}])
    schedule_cache.prefill({2025: frame})

    assert schedule_cache.get_schedule(2025) is frame
    assert fetch_calls == []


def test_clear_forces_a_refetch(fetch_calls):
    schedule_cache.get_schedule(2025)
    schedule_cache.clear()
    schedule_cache.get_schedule(2025)
    assert fetch_calls == [2025, 2025]


def test_a_fetch_failure_propagates_and_caches_nothing(fetch_calls, monkeypatch):
    """The cache is a plain helper, not a @tool — callers own the error handling, and
    a failed fetch must not poison later lookups.
    """

    def boom(year: int):
        raise ValueError("no data")

    monkeypatch.setattr(fastf1, "get_event_schedule", boom)
    with pytest.raises(ValueError, match="no data"):
        schedule_cache.get_schedule(2025)

    assert schedule_cache._cache == {}
