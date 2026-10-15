"""Telling Gemini's spent daily quota apart from every other failure, and when it comes back.

A spent day is the one 429 worth stopping a run for: the synthesizer calls the same model on
the same project, so it cannot succeed either. A per-minute 429 is over in a minute, and taking
it for a spent day would turn the whole service away until Pacific midnight.
"""

from datetime import UTC, datetime

import pytest
from freezegun import freeze_time
from google.genai import errors as genai_errors
from langchain_google_genai.chat_models import ChatGoogleGenerativeAIError

from agent.quota import DailyQuotaExhaustedError, daily_quota_error, next_quota_reset
from tests.factories import GEMINI_DAILY_QUOTA, GEMINI_PER_MINUTE_QUOTA, gemini_quota_body


def utc(*parts: int) -> float:
    return datetime(*parts, tzinfo=UTC).timestamp()


def quota_429(*quota_ids: str) -> genai_errors.ClientError:
    return genai_errors.ClientError(429, gemini_quota_body(*quota_ids))


def wrapped(cause: Exception) -> ChatGoogleGenerativeAIError:
    """What ``llm.invoke`` raises: langchain re-raises a ClientError as its own, chained."""
    try:
        raise cause
    except genai_errors.ClientError as exc:
        try:
            raise ChatGoogleGenerativeAIError(f"Error calling model: {exc}") from exc
        except ChatGoogleGenerativeAIError as outer:
            return outer


# ── Which failures are a spent day ───────────────────────────────────────────


@freeze_time("2026-09-30 10:00:00")
def test_a_spent_daily_quota_is_one_resetting_at_the_next_pacific_midnight():
    error = daily_quota_error(quota_429(GEMINI_DAILY_QUOTA))

    assert isinstance(error, DailyQuotaExhaustedError)
    assert error.resets_at == utc(2026, 10, 1, 7, 0)


def test_the_planners_wrapped_error_is_read_through_its_cause():
    """langchain wraps the planner's ClientError and leaves the stream's bare; both must read."""
    assert daily_quota_error(wrapped(quota_429(GEMINI_DAILY_QUOTA))) is not None


def test_a_per_minute_429_is_not_a_spent_day():
    assert daily_quota_error(quota_429(GEMINI_PER_MINUTE_QUOTA)) is None


def test_a_429_naming_both_quotas_is_a_spent_day():
    assert daily_quota_error(quota_429(GEMINI_PER_MINUTE_QUOTA, GEMINI_DAILY_QUOTA)) is not None


def test_a_paid_tiers_daily_quota_is_a_spent_day_too():
    assert daily_quota_error(quota_429("GenerateRequestsPerDayPerProjectPerModel")) is not None


@pytest.mark.parametrize(
    "failure",
    [
        # A 429 that names no quota: nothing says it is the day's, so it is not taken for one.
        genai_errors.ClientError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}}),
        # Only a 429 is a quota refusal, whatever detail a body carries.
        genai_errors.ClientError(400, gemini_quota_body(GEMINI_DAILY_QUOTA)),
        genai_errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE"}}),
        # The words alone are not enough: classification reads the body, never a message.
        RuntimeError(f"429 RESOURCE_EXHAUSTED {GEMINI_DAILY_QUOTA}"),
    ],
    ids=["429-without-details", "400-with-daily-detail", "503", "message-only"],
)
def test_nothing_else_is_a_spent_day(failure):
    assert daily_quota_error(failure) is None


# ── When the day comes back ──────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("now", "reset"),
    [
        # Summer time: Pacific midnight is 07:00 UTC.
        (utc(2026, 9, 30, 10, 0), utc(2026, 10, 1, 7, 0)),
        # Standard time: 08:00 UTC.
        (utc(2026, 12, 1, 10, 0), utc(2026, 12, 2, 8, 0)),
        # Past UTC midnight but still the previous Pacific day: four hours, not a whole day.
        (utc(2026, 10, 1, 3, 0), utc(2026, 10, 1, 7, 0)),
        # On the reset itself, the quota has just come back: the next one is a day away.
        (utc(2026, 10, 1, 7, 0), utc(2026, 10, 2, 7, 0)),
        # The night summer time ends (1 Nov 2026), on either side of the change.
        (utc(2026, 11, 1, 6, 0), utc(2026, 11, 1, 7, 0)),
        (utc(2026, 11, 1, 12, 0), utc(2026, 11, 2, 8, 0)),
    ],
    ids=["pdt", "pst", "after-utc-midnight", "at-the-reset", "before-dst-ends", "after-dst-ends"],
)
def test_the_quota_resets_at_the_next_midnight_in_los_angeles(now, reset):
    assert next_quota_reset(now) == reset
