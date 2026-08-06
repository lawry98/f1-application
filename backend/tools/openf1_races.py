"""Race-session lookup over the OpenF1 sessions endpoint. A plain helper, not a tool.

Every result tool starts by answering one of two questions — "which session is this
event's race?" or "which races have already run?" — and both are one filtered pass over
``list_sessions``. Keeping them here means the four tools share one definition of what
counts as a race.
"""

import logging
from datetime import date
from typing import Any

from tools.openf1_client import list_sessions

logger = logging.getLogger(__name__)


def _session_date(session: dict[str, Any]) -> date:
    """Parse OpenF1's ISO-8601 date_start down to a date."""
    return date.fromisoformat(session["date_start"][:10])


def _bidirectional_match(needle: str, haystack: str) -> bool:
    return bool(haystack) and (needle in haystack or haystack in needle)


def find_race_session(year: int, event_name: str) -> dict[str, Any] | None:
    """Return the Race session identified by event_name, or None.

    Two passes, in order:

    1. **Circuit.** Bidirectional case-insensitive substring test against
       ``circuit_short_name``. Circuit names are effectively unique within a season, so
       the first match wins.
    2. **Country, only when unambiguous.** Multiple races can share a ``country_name`` —
       the United States alone can run three Grands Prix (Miami, Austin, Las Vegas) in
       one season — so a plain "first match" on country would silently return the wrong
       race whenever an event_name like "United States Grand Prix" matches more than
       one of them. This pass therefore collects every country match and returns one
       only if exactly one session qualifies. Two or more matches means the country arm
       cannot tell which race is meant, and returning None here — rather than guessing —
       is what lets the caller fall back to FastF1, which resolves the real EventName
       correctly. A wrong answer is worse than a miss, because a miss degrades instead
       of silently building a briefing for the wrong race.

    Matching mirrors how ``race_resolver._find_event`` searches the FastF1 schedule. It
    is deliberately loose: callers pass FastF1 EventNames like "Belgian Grand Prix" as
    well as circuit names like "Spa-Francorchamps", and OpenF1 indexes neither of those
    under a single field.

    Returning None rather than raising is what lets the tools decide to fall back.
    """
    needle = event_name.casefold()
    races = list_sessions(year, "Race")

    for session in races:
        if _bidirectional_match(needle, session.get("circuit_short_name", "").casefold()):
            return session

    country_matches = [
        session
        for session in races
        if _bidirectional_match(needle, session.get("country_name", "").casefold())
    ]
    if len(country_matches) == 1:
        return country_matches[0]
    return None


def completed_races(year: int, today: date) -> list[dict[str, Any]]:
    """Return the year's Race sessions that have already run, in chronological order.

    Sprint and qualifying sessions are excluded by asking OpenF1 for ``session_name=Race``
    — a Sprint sits a day before its Grand Prix, so a naive "latest session" would name
    the wrong event as the most recent race.
    """
    races = [s for s in list_sessions(year, "Race") if _session_date(s) < today]
    return sorted(races, key=_session_date)


def scoring_sessions(year: int) -> list[dict[str, Any]]:
    """Return the year's points-scoring sessions: Races and Sprints, chronologically.

    Filtering on ``session_name`` rather than on the presence of a ``points`` key is
    deliberate. Qualifying rows happen to omit ``points`` entirely today, so a
    presence check would be correct by accident and would break silently the day
    OpenF1 starts returning ``points: 0`` for them.
    """
    sessions = list_sessions(year, "Race") + list_sessions(year, "Sprint")
    return sorted(sessions, key=_session_date)
