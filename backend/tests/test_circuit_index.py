"""Tests for the location → circuit join that ``get_circuit_winners`` matches past years on.

The index is the real ``frontend/data/circuits/index.json``, read rather than faked, so a
re-export that renames or drops a venue fails here instead of quietly reverting the tool
to reporting another track's winners.
"""

import pytest

from tools import circuit_index
from tools.circuit_index import circuit_for_location, location_slug


@pytest.fixture(autouse=True)
def _fresh_index():
    circuit_index.load_index.cache_clear()
    yield
    circuit_index.load_index.cache_clear()


@pytest.mark.parametrize(
    ("location", "slug"),
    [
        ("Montréal", "montreal"),
        ("São Paulo", "sao-paulo"),
        ("Spa-Francorchamps", "spa-francorchamps"),
        ("Spa Francorchamps", "spa-francorchamps"),
        ("  Mexico City ", "mexico-city"),
    ],
)
def test_location_slug_matches_the_converter_that_wrote_the_index_keys(location, slug):
    """Must stay identical to ``slug()`` in ``frontend/scripts/fetch-circuit-geometry.mjs``."""
    assert location_slug(location) == slug


def test_every_index_key_is_already_a_slug():
    assert all(location_slug(key) == key for key in circuit_index.load_index())


@pytest.mark.parametrize(
    ("location", "circuit"),
    [
        ("Madrid", "es-2026"),
        ("Barcelona", "es-1991"),
        ("Kuala Lumpur", "my-1999"),
        ("Sepang", "my-1999"),
        ("Sakhir", "bh-2002"),
        ("Bahrain", "bh-2002"),
        # FastF1 files Abu Dhabi as "Yas Island" through 2025 and "Yas Marina" from 2026.
        ("Yas Island", "ae-2009"),
        ("Yas Marina", "ae-2009"),
    ],
)
def test_the_real_index_resolves_the_venues_name_matching_got_wrong(location, circuit):
    assert circuit_for_location(location) == circuit


def test_a_location_the_index_lacks_resolves_to_its_own_slug():
    assert circuit_for_location("Bangkok") == "bangkok"


def test_a_missing_index_degrades_to_slug_equality_without_raising(monkeypatch, tmp_path):
    monkeypatch.setattr(circuit_index, "INDEX_PATH", tmp_path / "absent.json")
    assert circuit_for_location("Madrid") == "madrid"


def test_an_unreadable_index_degrades_to_slug_equality_without_raising(monkeypatch, tmp_path):
    broken = tmp_path / "index.json"
    broken.write_text("{not json")
    monkeypatch.setattr(circuit_index, "INDEX_PATH", broken)
    assert circuit_for_location("Madrid") == "madrid"
