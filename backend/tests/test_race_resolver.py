"""Tests for the deterministic race resolver.

This is the most refactor-fragile code in the backend: a four-branch fallback chain
whose result depends on today's date. Every test here freezes the clock, so a branch
that only fires in November is exercised in May.

Resolution order, for orientation:
  1. explicit year in the query wins outright
  2. otherwise, first upcoming event in the current year
  3. otherwise, first upcoming event in the next year
  4. otherwise, most recent event at that circuit (current year, then last year)
"""

import pytest
from freezegun import freeze_time

from tests.conftest import FROZEN_NOW
from tools import race_resolver
from tools.race_resolver import _find_event, _parse_query, resolve_next_race


@pytest.fixture(autouse=True)
def _patch_get_schedule(monkeypatch, fake_get_schedule):
    """Serve fixture schedules instead of hitting FastF1.

    Patched on ``race_resolver`` rather than ``schedule_cache`` because the resolver
    binds the name at import (``from tools.schedule_cache import get_schedule``), so
    patching the source module would not affect the already-bound reference.
    """
    monkeypatch.setattr(race_resolver, "get_schedule", fake_get_schedule)


# ── Query parsing ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("monaco", ("monaco", None)),
        ("monaco 2024", ("monaco", 2024)),
        ("  monaco 2024  ", ("monaco", 2024)),
        ("las vegas", ("las vegas", None)),
        ("united states 2026", ("united states", 2026)),
        # Two digits is not a year — only a four-digit run counts.
        ("monaco 24", ("monaco 24", None)),
        # A bare four-digit number is treated as the circuit query, not a year,
        # because the split needs two parts.
        ("2024", ("2024", None)),
    ],
)
def test_parse_query(query, expected):
    assert _parse_query(query) == expected


# ── Event matching ───────────────────────────────────────────────────────────


def test_find_event_matches_on_event_name(season_2025):
    assert _find_event(season_2025, "Monaco")["EventName"] == "Monaco Grand Prix"


def test_find_event_is_case_insensitive(season_2025):
    assert _find_event(season_2025, "mOnAcO")["EventName"] == "Monaco Grand Prix"


def test_find_event_falls_back_to_location(season_2025):
    """'Silverstone' appears only in Location — the event is the British Grand Prix."""
    assert _find_event(season_2025, "Silverstone")["EventName"] == "British Grand Prix"


def test_find_event_falls_back_to_country(season_2025):
    """'United Kingdom' appears only in Country."""
    assert _find_event(season_2025, "United Kingdom")["EventName"] == "British Grand Prix"


def test_find_event_returns_none_when_nothing_matches(season_2025):
    assert _find_event(season_2025, "Nürburgring") is None


def test_find_event_returns_first_match_when_several(season_2025):
    """'Grand Prix' matches every row; the earliest-listed one wins."""
    assert _find_event(season_2025, "Grand Prix")["EventName"] == "Bahrain Grand Prix"


# ── Aliases ──────────────────────────────────────────────────────────────────


@freeze_time(FROZEN_NOW)
@pytest.mark.parametrize(
    ("query", "expected_event"),
    [
        ("monaco", "Monaco Grand Prix"),
        ("silverstone", "British Grand Prix"),
        ("british gp", "British Grand Prix"),
        # Alias lookup is case-insensitive on the query side.
        ("Silverstone", "British Grand Prix"),
    ],
)
def test_aliases_map_colloquial_names_to_event_names(query, expected_event):
    assert resolve_next_race(query)["name"] == expected_event


@freeze_time(FROZEN_NOW)
def test_unaliased_query_is_used_verbatim():
    """A query with no alias entry still resolves if it matches a schedule column."""
    assert resolve_next_race("British")["name"] == "British Grand Prix"


# ── Branch 1: explicit year ──────────────────────────────────────────────────


@freeze_time(FROZEN_NOW)
def test_explicit_year_wins_over_the_next_upcoming_race():
    """'monaco 2024' must return the 2024 running even though Monaco 2025 is upcoming."""
    result = resolve_next_race("monaco 2024")
    assert result["year"] == 2024
    assert result["name"] == "Monaco Grand Prix"


@freeze_time(FROZEN_NOW)
def test_explicit_year_in_the_past_is_not_upcoming_and_uses_its_own_year():
    result = resolve_next_race("qatar 2024")
    assert result["is_upcoming"] is False
    assert result["historical_year"] == 2024


@freeze_time(FROZEN_NOW)
def test_explicit_year_in_the_future_is_upcoming_and_looks_back_one_year():
    result = resolve_next_race("monaco 2026")
    assert result["is_upcoming"] is True
    assert result["historical_year"] == 2025


@freeze_time(FROZEN_NOW)
def test_explicit_year_with_unloadable_schedule_keeps_the_reason_out_of_error():
    """``error`` is the display channel; the upstream exception goes in ``detail``.

    The year stays in ``error`` because it is the user's own input and tells them which
    request failed. What is removed is the FastF1 exception wrapped around it.
    """
    result = resolve_next_race("monaco 1998")

    assert result["error"] == "Could not load the 1998 season schedule."
    assert result["detail"] == "No schedule available for 1998"


@freeze_time(FROZEN_NOW)
def test_explicit_year_with_no_matching_event_returns_error():
    result = resolve_next_race("singapore 2025")
    assert "error" in result
    assert "singapore" in result["error"]
    assert "2025" in result["error"]


# ── Branch 2: upcoming this year ─────────────────────────────────────────────


@freeze_time(FROZEN_NOW)
def test_resolves_to_upcoming_race_in_the_current_year():
    result = resolve_next_race("monaco")
    assert result["year"] == 2025
    assert result["is_upcoming"] is True
    assert result["historical_year"] == 2024


@freeze_time("2025-05-25")
def test_a_race_happening_today_still_counts_as_upcoming():
    """The comparison is ``>=``, so race day itself resolves to that race, not next year's."""
    result = resolve_next_race("monaco")
    assert result["year"] == 2025
    assert result["is_upcoming"] is True


@freeze_time("2025-05-26")
def test_the_day_after_a_race_rolls_past_it():
    """One day later, Monaco 2025 is behind us and the 2026 running is next."""
    result = resolve_next_race("monaco")
    assert result["year"] == 2026


# ── Branch 3: upcoming next year ─────────────────────────────────────────────


@freeze_time("2025-12-15")
def test_falls_through_to_next_year_when_this_year_is_done():
    """Late in the season every 2025 race is past, so Monaco resolves to 2026."""
    result = resolve_next_race("monaco")
    assert result["year"] == 2026
    assert result["is_upcoming"] is True
    assert result["historical_year"] == 2025


@freeze_time(FROZEN_NOW)
def test_next_year_is_used_when_the_circuit_is_absent_this_year():
    """Singapore is only on the 2026 calendar in these fixtures."""
    result = resolve_next_race("singapore")
    assert result["year"] == 2026
    assert result["is_upcoming"] is True


# ── Branch 4: fall back to most recent completed ─────────────────────────────


@freeze_time(FROZEN_NOW)
def test_falls_back_to_a_completed_race_this_year_when_nothing_is_upcoming():
    """Bahrain 2025 is past and absent from 2026 — the completed running is returned."""
    result = resolve_next_race("bahrain")
    assert result["year"] == 2025
    assert result["is_upcoming"] is False
    assert result["historical_year"] == 2025


@freeze_time(FROZEN_NOW)
def test_falls_back_to_last_year_when_the_circuit_is_absent_this_year():
    """Qatar appears only in 2024. Nothing upcoming, nothing this year — reach back one."""
    result = resolve_next_race("qatar")
    assert result["year"] == 2024
    assert result["is_upcoming"] is False
    assert result["historical_year"] == 2024


@freeze_time(FROZEN_NOW)
def test_unknown_circuit_returns_error():
    result = resolve_next_race("nurburgring")
    assert "error" in result
    assert "nurburgring" in result["error"]


@freeze_time("2028-05-01")
def test_returns_error_when_no_schedule_can_be_loaded_at_all():
    """Every get_schedule call raises; the resolver must degrade to an error dict, not blow up.

    2028 is chosen so that all four lookups miss: the upcoming search tries 2028/2029 and
    the fallback tries 2028/2027, none of which the fixture knows about. Freezing at 2027
    would silently pass through the fallback into the real 2026 fixture.
    """
    result = resolve_next_race("monaco")
    assert "error" in result


# ── Result shape ─────────────────────────────────────────────────────────────


@freeze_time(FROZEN_NOW)
def test_result_carries_the_full_race_info_shape():
    result = resolve_next_race("monaco")
    assert set(result) == {
        "name",
        "year",
        "circuit_id",
        "location",
        "country",
        "date",
        "is_upcoming",
        "historical_year",
    }
    assert result["location"] == "Monaco"
    assert result["country"] == "Monaco"
    assert result["date"].startswith("2025-05-25")


@freeze_time(FROZEN_NOW)
def test_circuit_id_is_derived_from_the_event_name():
    """Pins current behaviour, which is misnamed.

    ``circuit_id`` is ``event_name.lower().replace(" ", "_")`` — an *event* slug, not a
    circuit identifier. The British Grand Prix at Silverstone yields
    "british_grand_prix", which names neither the circuit nor anything stable: rename
    the event and the "circuit id" changes for the same physical track.

    It is also dead. Nothing reads it — not the backend, not the frontend, despite
    being declared in ``frontend/types/f1.ts`` and streamed over SSE.

    Renaming it to ``event_slug`` (or deleting it) should flip this test deliberately.
    """
    assert resolve_next_race("silverstone")["circuit_id"] == "british_grand_prix"


@freeze_time(FROZEN_NOW)
def test_resolution_prefills_the_schedule_cache():
    """Schedules fetched during resolution are shared with the tools that run next.

    This is the whole point of schedule_cache — dropping the prefill would not fail any
    other test, it would just quietly reintroduce duplicate network fetches per request.
    """
    from tools import schedule_cache

    schedule_cache.clear()
    resolve_next_race("monaco")
    assert 2025 in schedule_cache._cache
