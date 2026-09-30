"""Tests for tools/cutoff.py — the one reader of ``as_of`` strings.

OpenF1 serves ``+00:00`` offsets and FastF1's ``SessionNDateUtc`` is naive UTC. Both reach
``parse_utc``, and a cutoff comparison between the two must not raise or shift by an offset.
"""

from datetime import UTC, date, datetime

from tools.cutoff import parse_utc, start_of_day, to_iso


def test_a_naive_value_is_read_as_utc():
    assert parse_utc("2026-06-05T11:30:00") == datetime(2026, 6, 5, 11, 30, tzinfo=UTC)


def test_an_offset_value_is_converted_to_utc():
    assert parse_utc("2026-06-05T13:30:00+02:00") == datetime(2026, 6, 5, 11, 30, tzinfo=UTC)


def test_the_wire_form_round_trips():
    moment = start_of_day(date(2026, 9, 30))
    assert to_iso(moment) == "2026-09-30T00:00:00+00:00"
    assert parse_utc(to_iso(moment)) == moment
