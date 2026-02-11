"""Thread-safe module-level cache for fastf1.get_event_schedule() results."""

import threading
import fastf1

_lock = threading.Lock()
_cache: dict = {}


def get_schedule(year: int):
    """Return cached schedule or fetch and cache it."""
    with _lock:
        if year in _cache:
            return _cache[year]
    schedule = fastf1.get_event_schedule(year)
    with _lock:
        _cache[year] = schedule
    return schedule


def prefill(schedules: dict):
    """Pre-populate cache with already-fetched schedules."""
    with _lock:
        _cache.update(schedules)


def clear():
    """Clear all cached schedules."""
    with _lock:
        _cache.clear()
