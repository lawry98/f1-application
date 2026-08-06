"""Race-session lookup over the OpenF1 sessions endpoint. A plain helper, not a tool.

Every result tool starts by answering one of two questions — "which session is this
event's race?" or "which races have already run?" — and both are one filtered pass over
``list_sessions``. Keeping them here means the four tools share one definition of what
counts as a race.
"""

import logging
from datetime import date
from typing import Any

from tools.openf1_client import list_meetings, list_sessions

logger = logging.getLogger(__name__)


def _session_date(session: dict[str, Any]) -> date:
    """Parse OpenF1's ISO-8601 date_start down to a date."""
    return date.fromisoformat(session["date_start"][:10])


def _bidirectional_match(needle: str, haystack: str) -> bool:
    return bool(haystack) and (needle in haystack or haystack in needle)


def find_race_session(year: int, event_name: str) -> dict[str, Any] | None:
    """Return the Race session identified by event_name, or None.

    Three passes, in order:

    1. **Meeting name, exact.** Casefolded equality against ``meeting_name``, then
       joined to the meeting's Race session via ``meeting_key``. This is the primary
       path: FastF1's ``EventName`` is adjectival ("Belgian Grand Prix"), while
       ``circuit_short_name`` is a place ("Spa-Francorchamps") and ``country_name`` is a
       noun ("Belgium") — no substring test bridges "Belgian" to either. ``meeting_name``
       is the one OpenF1 field written in the same vocabulary as FastF1's EventName, so
       it resolves the large majority of the calendar that the other two passes cannot
       even attempt. Returns only if exactly one meeting matches: 2026 has two meetings
       named "Bahrain Grand Prix" (Sakhir, and Kuala Lumpur under the official name
       "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026") and guessing between
       them would repeat the mistake pass 3 below exists to avoid.
    2. **Circuit.** Bidirectional case-insensitive substring test against
       ``circuit_short_name``, for callers that pass a circuit name rather than an event
       name (``get_circuit_winners`` passes "Monte Carlo", not "Monaco Grand Prix").
       Circuit names are effectively unique within a season, so the first match wins.
    3. **Country, only when unambiguous.** Multiple races can share a ``country_name`` —
       the United States alone can run three Grands Prix (Miami, Austin, Las Vegas) in
       one season — so a plain "first match" on country would silently return the wrong
       race whenever a query like "United States Grand Prix" matches more than one of
       them. This pass therefore collects every country match and returns one only if
       exactly one session qualifies.

    Every ambiguous pass returns None rather than guessing, and None here is what lets
    the caller fall back to FastF1, which resolves the real EventName correctly. A wrong
    answer is worse than a miss, because a miss degrades instead of silently building a
    briefing for the wrong race.
    """
    needle = event_name.casefold()
    races = list_sessions(year, "Race")

    meeting_matches = [
        meeting
        for meeting in list_meetings(year)
        if meeting.get("meeting_name", "").casefold() == needle
    ]
    if len(meeting_matches) == 1:
        meeting_key = meeting_matches[0].get("meeting_key")
        race_matches = [s for s in races if s.get("meeting_key") == meeting_key]
        if len(race_matches) == 1:
            return race_matches[0]

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
