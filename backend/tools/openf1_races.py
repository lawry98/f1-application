"""Race-session lookup over the OpenF1 sessions endpoint. A plain helper, not a tool.

Every result tool starts by answering one of two questions — "which session is this
event's race?" or "which races had run by the cutoff?" — and both are one filtered pass
over ``list_sessions``. Keeping them here means the four tools share one definition of
what counts as a race.
"""

import logging
from datetime import datetime, timedelta
from typing import Any

from tools.cutoff import parse_utc
from tools.openf1_client import list_meetings, list_sessions, session_results

logger = logging.getLogger(__name__)

# How far apart FastF1's and OpenF1's start times for one race may be and still be the same
# race. Measured 2026-09-30 they agree to the minute on every held race of 2023-26; a day is
# slack for a late reschedule, and no two Grands Prix have ever been a day apart.
_SAME_RACE = timedelta(days=1)


def _session_start(session: dict[str, Any]) -> datetime:
    return parse_utc(session["date_start"])


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


def race_session_at(year: int, start: datetime) -> dict[str, Any] | None:
    """The year's Race session starting within a day of ``start``, or None.

    How a race found on FastF1's calendar — matched to its *track* by location — is joined to
    OpenF1: by when it starts, never by name. A Grand Prix name is not a track (2026 has two
    meetings called "Bahrain Grand Prix"), and a start time names exactly one race.
    """
    for session in list_sessions(year, "Race"):
        if abs(_session_start(session) - start) <= _SAME_RACE:
            return session
    return None


def completed_races(year: int, before: datetime) -> list[dict[str, Any]]:
    """Return the year's Race sessions that started before ``before``, in chronological order.

    Sprint and qualifying sessions are excluded by asking OpenF1 for ``session_name=Race``
    — a Sprint sits a day before its Grand Prix, so a naive "latest session" would name
    the wrong event as the most recent race.
    """
    races = [s for s in list_sessions(year, "Race") if _session_start(s) < before]
    return sorted(races, key=_session_start)


def held_races(year: int, before: datetime) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """The races that started before ``before`` *and* produced a classification, with the rows.

    A cancelled race keeps its session and serves no rows — Sakhir and Jeddah 2026 — so
    "the latest race" is the latest *held* one. One range query covers every race, and it is
    the same span the standings table asks for, so within a briefing the two share a request.
    """
    races = completed_races(year, before)
    rows = session_results({race["session_key"] for race in races})
    classified = {row.get("session_key") for row in rows}
    return [race for race in races if race["session_key"] in classified], rows


def scoring_sessions(year: int) -> list[dict[str, Any]]:
    """Return the year's points-scoring sessions: Races and Sprints, chronologically.

    Filtering on ``session_name`` rather than on the presence of a ``points`` key is
    deliberate. Qualifying rows happen to omit ``points`` entirely today, so a
    presence check would be correct by accident and would break silently the day
    OpenF1 starts returning ``points: 0`` for them.
    """
    sessions = list_sessions(year, "Race") + list_sessions(year, "Sprint")
    return sorted(sessions, key=_session_start)
