"""Thread-safe module-level cache for fastf1.get_event_schedule() results.

Prevents repeated network fetches when multiple tools need the same year's schedule
within a single agent invocation.
"""

import threading

import fastf1
import pandas as pd

_lock = threading.Lock()
_cache: dict[int, pd.DataFrame] = {}


def get_schedule(year: int) -> pd.DataFrame:
    """Return cached schedule or fetch and cache it.

    Args:
        year: F1 championship year.

    Returns:
        FastF1 event schedule DataFrame for the given year.
    """
    with _lock:
        if year in _cache:
            return _cache[year]
    # Lock is deliberately released during the fetch so concurrent misses don't
    # serialise network I/O; a duplicate fetch of the same year is possible and
    # acceptable (last write wins).
    schedule = fastf1.get_event_schedule(year)
    with _lock:
        _cache[year] = schedule
    return schedule


def prefill(schedules: dict[int, pd.DataFrame]) -> None:
    """Pre-populate cache with already-fetched schedules.

    Args:
        schedules: Mapping of year → schedule DataFrame.
    """
    with _lock:
        _cache.update(schedules)


def clear() -> None:
    """Clear all cached schedules."""
    with _lock:
        _cache.clear()
