"""The briefing's time cutoff, ``as_of`` — a plain helper, not an LLM-callable tool.

Every data tool answers "as of" an instant: today for an upcoming race, the first session's
start for a past one (ADR-0004). The instant travels as an ISO-8601 string with a UTC offset,
because it is a tool argument, a cache-key component and an SSE field all at once, and all
three want something hashable and printable. These functions are the one place it is read
back into a ``datetime``, so the tools cannot disagree about what "before as_of" means.
"""

from datetime import UTC, date, datetime, time

import pandas as pd


def parse_utc(value: str) -> datetime:
    """An ISO-8601 string as an aware UTC datetime. A naive value is taken to be UTC.

    OpenF1 serves ``+00:00`` offsets and FastF1's ``SessionNDateUtc`` is naive UTC, so both
    spellings reach here and must compare equal.
    """
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def start_of_day(day: date) -> datetime:
    """Midnight UTC at the start of ``day`` — an upcoming race's cutoff."""
    return datetime.combine(day, time.min, tzinfo=UTC)


def to_iso(moment: datetime) -> str:
    """The wire form of an instant: ISO-8601 in UTC, ``+00:00`` offset, whole seconds."""
    return moment.astimezone(UTC).replace(microsecond=0).isoformat()


def timestamp_utc(value) -> datetime | None:
    """A FastF1 timestamp (naive UTC, or NaT) as an aware datetime, or None when absent."""
    if value is None or pd.isna(value):
        return None
    stamp = pd.Timestamp(value)
    if stamp.tzinfo is None:
        stamp = stamp.tz_localize("UTC")
    return stamp.to_pydatetime().astimezone(UTC)
