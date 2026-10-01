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


def test_find_event_treats_regex_metacharacters_literally(season_2025):
    """An unbalanced paren must be a failed substring match, not a re.error."""
    assert _find_event(season_2025, "monaco (2024") is None


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
def test_explicit_year_in_the_past_is_briefed_as_of_its_first_session():
    """A past race is briefed as a reader saw it on the Thursday: the cutoff is FP1's start
    (FastF1's Session1DateUtc), not today, so nothing from the weekend itself leaks in."""
    result = resolve_next_race("qatar 2024")
    assert result["is_upcoming"] is False
    assert result["as_of"] == "2024-11-29T11:30:00+00:00"


@freeze_time(FROZEN_NOW)
def test_explicit_year_in_the_future_is_upcoming_and_briefed_as_of_today():
    result = resolve_next_race("monaco 2026")
    assert result["is_upcoming"] is True
    assert result["as_of"] == "2025-05-01T00:00:00+00:00"


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
    assert result["as_of"] == "2025-05-01T00:00:00+00:00"


@freeze_time("2025-05-25")
def test_a_race_happening_today_still_counts_as_upcoming():
    """The comparison is ``>=``, so race day itself resolves to that race, not next year's."""
    result = resolve_next_race("monaco")
    assert result["year"] == 2025
    assert result["is_upcoming"] is True


@freeze_time("2025-05-24T18:00:00")
def test_mid_weekend_the_race_is_upcoming_and_briefed_as_of_today():
    """FP1 has run but the race has not: still upcoming, and the cutoff is today rather than
    FP1 — the one case where a started weekend is briefed from the present."""
    result = resolve_next_race("monaco")
    assert result["is_upcoming"] is True
    assert result["as_of"] == "2025-05-24T00:00:00+00:00"


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
    assert result["as_of"] == "2025-12-15T00:00:00+00:00"


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
    assert result["as_of"] == "2025-02-28T11:30:00+00:00"


@freeze_time(FROZEN_NOW)
def test_falls_back_to_last_year_when_the_circuit_is_absent_this_year():
    """Qatar appears only in 2024. Nothing upcoming, nothing this year — reach back one."""
    result = resolve_next_race("qatar")
    assert result["year"] == 2024
    assert result["is_upcoming"] is False
    assert result["as_of"] == "2024-11-29T11:30:00+00:00"


@freeze_time(FROZEN_NOW)
def test_unknown_circuit_returns_error():
    result = resolve_next_race("nurburgring")
    assert "error" in result
    assert "nurburgring" in result["error"]


@freeze_time(FROZEN_NOW)
@pytest.mark.parametrize("query", ["monaco (2024", "c++ gp", "what about spa?"])
def test_regex_metacharacters_in_a_query_return_an_error_not_a_crash(query):
    """Queries are matched as literal substrings; metacharacters must not raise.

    ``str.contains`` defaults to regex=True, so without ``regex=False`` an unbalanced
    paren raises ``re.error`` straight through the resolver — bypassing the error-dict
    contract and surfacing to the client as a regex parse message.
    """
    result = resolve_next_race(query)
    assert "error" in result


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
        "round",
        "circuit_id",
        "track_id",
        "circuit_name",
        "circuit_length_m",
        "location",
        "country",
        "date",
        "is_upcoming",
        "as_of",
        "sessions",
    }
    assert result["location"] == "Monaco"
    assert result["country"] == "Monaco"
    assert result["date"].startswith("2025-05-25")
    assert result["round"] == 3


@freeze_time(FROZEN_NOW)
def test_sessions_list_every_session_fastf1_lists_with_its_utc_start():
    assert resolve_next_race("monaco")["sessions"] == [
        {"name": "Practice 1", "start": "2025-05-23T11:30:00+00:00"},
        {"name": "Practice 2", "start": "2025-05-23T15:00:00+00:00"},
        {"name": "Practice 3", "start": "2025-05-24T10:30:00+00:00"},
        {"name": "Qualifying", "start": "2025-05-24T14:00:00+00:00"},
        {"name": "Race", "start": "2025-05-25T13:00:00+00:00"},
    ]


@freeze_time(FROZEN_NOW)
def test_the_track_is_matched_by_location_and_carries_the_circuit_file(monkeypatch):
    """The 2026 Bahrain Grand Prix is filed under Kuala Lumpur. Its track is Sepang, and the
    name and length come from that circuit's own file — never from the Grand Prix's name."""
    from tests.factories import make_schedule

    schedule = make_schedule(
        [
            {
                "name": "Bahrain Grand Prix",
                "date": "2025-10-04",
                "location": "Kuala Lumpur",
                "country": "Bahrain",
                "round": 16,
            }
        ]
    )
    monkeypatch.setattr(race_resolver, "get_schedule", lambda year: schedule)

    result = resolve_next_race("bahrain")

    assert result["track_id"] == "my-1999"
    assert result["circuit_name"] == "Sepang International Circuit"
    assert result["circuit_length_m"] == 5543


@freeze_time(FROZEN_NOW)
def test_a_location_with_no_circuit_file_leaves_the_track_fields_empty(monkeypatch):
    from tests.factories import make_schedule

    schedule = make_schedule([{"name": "Atlantis Grand Prix", "date": "2025-09-01"}])
    monkeypatch.setattr(race_resolver, "get_schedule", lambda year: schedule)

    result = resolve_next_race("atlantis")

    assert "error" not in result
    assert (result["track_id"], result["circuit_name"], result["circuit_length_m"]) == (
        None,
        None,
        None,
    )


@freeze_time(FROZEN_NOW)
def test_an_unreadable_circuit_index_still_resolves_the_race(monkeypatch, tmp_path):
    """The track fields are context, not the race: losing the map must not lose the briefing."""
    from tools import circuit_winners

    monkeypatch.setattr(circuit_winners, "CIRCUIT_INDEX_PATH", tmp_path / "absent.json")

    result = resolve_next_race("monaco")

    assert result["name"] == "Monaco Grand Prix"
    assert result["track_id"] is None


@freeze_time(FROZEN_NOW)
def test_a_past_race_with_no_session_times_is_briefed_as_of_two_days_before_race_day(
    monkeypatch,
):
    """FastF1 carries no session times for older seasons; EventDate - 2 days stands in for FP1."""
    from tests.factories import make_schedule

    schedule = make_schedule(
        [
            {
                "name": "Japanese Grand Prix",
                "date": "2012-10-07",
                "location": "Suzuka",
                "sessions": [],
            }
        ]
    )
    monkeypatch.setattr(race_resolver, "get_schedule", lambda year: schedule)

    result = resolve_next_race("suzuka 2012")

    assert result["as_of"] == "2012-10-05T00:00:00+00:00"
    assert result["sessions"] == []


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
