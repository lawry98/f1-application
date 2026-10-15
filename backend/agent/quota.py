"""Gemini's spent daily quota, told apart from every other failure.

On the free tier a project gets a fixed number of requests per model per day, and once they are
spent every call answers ``429 RESOURCE_EXHAUSTED`` until **midnight Pacific time** ("Requests per
day (RPD) quotas reset at midnight Pacific time", ai.google.dev/gemini-api/docs/rate-limits). The
reset is Google's, so it is a constant here and not the cost guard's ``BRIEFING_DAY_TZ``.

A 429 is a spent day only when its body names a per-day quota. Its ``QuotaFailure`` detail lists
the quotas broken, by id — ``GenerateRequestsPerDayPerProjectPerModel-FreeTier`` on a spent key —
and a per-*minute* 429 names ``…PerMinute…`` instead. Reading the id is the point: a per-minute
429 is over within a minute, and taking it for a spent day would turn every visitor away until
midnight. A 429 that names no quota is not taken for one either. Its ``RetryInfo`` is ignored:
the day comes back at midnight whatever wait it states.
"""

import time
from datetime import datetime, timedelta
from datetime import time as wall_time
from typing import Any
from zoneinfo import ZoneInfo

from google.genai import errors as genai_errors

QUOTA_RESET_ZONE = ZoneInfo("America/Los_Angeles")

_QUOTA_FAILURE = "type.googleapis.com/google.rpc.QuotaFailure"


class DailyQuotaExhaustedError(Exception):
    """Gemini refused a call because the project's daily quota is spent.

    Raised by either LLM-calling node instead of degrading: the other node calls the same model on
    the same project, so nothing later in the run can succeed. ``resets_at`` is epoch seconds.
    """

    def __init__(self, resets_at: float) -> None:
        super().__init__(f"Gemini's daily quota is spent until {resets_at:.0f}")
        self.resets_at = resets_at


def daily_quota_error(exc: BaseException) -> DailyQuotaExhaustedError | None:
    """The spent-day error ``exc`` amounts to, or ``None`` when it is any other failure.

    Walks the cause chain because langchain re-raises the planner's ``ClientError`` as its own
    ``ChatGoogleGenerativeAIError``, while the synthesizer's stream raises it bare.
    """
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, genai_errors.ClientError) and _names_a_daily_quota(current):
            return DailyQuotaExhaustedError(resets_at=next_quota_reset(time.time()))
        current = current.__cause__ or current.__context__
    return None


def next_quota_reset(now: float) -> float:
    """The first Pacific midnight strictly after ``now``, both in epoch seconds."""
    tomorrow = datetime.fromtimestamp(now, QUOTA_RESET_ZONE).date() + timedelta(days=1)
    return datetime.combine(tomorrow, wall_time.min, tzinfo=QUOTA_RESET_ZONE).timestamp()


def _names_a_daily_quota(exc: genai_errors.ClientError) -> bool:
    if exc.code != 429:
        return False
    body: Any = exc.details
    error = body.get("error", body) if isinstance(body, dict) else {}
    for detail in error.get("details") or []:
        if not isinstance(detail, dict) or detail.get("@type") != _QUOTA_FAILURE:
            continue
        for violation in detail.get("violations") or []:
            if isinstance(violation, dict) and "PerDay" in str(violation.get("quotaId", "")):
                return True
    return False
