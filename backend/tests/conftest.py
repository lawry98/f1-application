"""Shared pytest fixtures and the import-time environment seam.

The environment mutation below runs at collection time, before any test module —
and therefore before any application module — is imported. That ordering is load
bearing: ``agent/graph.py`` builds a live ``ChatGoogleGenerativeAI`` client at module
scope, so importing it (or anything reaching it, which is almost everything) without a
key present fails at import rather than at call time.

Nothing here changes production code. Making the graph importable without a key is
a refactor this suite exists to protect, not a prerequisite for it.
"""

import os

# Force rather than default: a real key in the developer's shell must not leak into
# the suite. Tests should behave identically on a laptop and in CI.
os.environ["GOOGLE_API_KEY"] = "AIza-test-key-not-real"

# langchain-google-genai also falls back to GEMINI_API_KEY. Clear it so a developer's real
# key can never satisfy the client when GOOGLE_API_KEY above is the one under test.
os.environ.pop("GEMINI_API_KEY", None)

# The optional-integration tools branch on the *absence* of these. If a developer has
# real keys exported, the "not configured" paths would silently stop being tested.
os.environ.pop("TAVILY_API_KEY", None)
os.environ.pop("OPENWEATHER_API_KEY", None)

from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.factories import make_schedule

# A fixed "now" for the whole suite. Chosen mid-season so that both "earlier this year"
# and "later this year" events are expressible against the same fixture schedule.
FROZEN_TODAY = date(2025, 5, 1)
FROZEN_NOW = "2025-05-01"


@pytest.fixture(autouse=True)
def _block_fastf1_network(monkeypatch):
    """Make an unintended FastF1 fetch a loud failure rather than a slow success.

    Without this, a test that forgets to patch a seam still passes — it just quietly
    downloads from the F1 API, taking 30-60s and behaving differently in CI, offline,
    or when the season rolls over. Tests that legitimately need schedule data patch a
    narrower seam from inside the test body, which takes precedence over this.
    """
    import fastf1

    def _refuse(*args, **kwargs):
        raise AssertionError(
            "Unpatched FastF1 network call. Patch the seam this code path uses — "
            "tools.race_resolver.get_schedule, tools.schedule_cache.get_schedule, "
            "or api.routes.fastf1.get_event_schedule."
        )

    monkeypatch.setattr(fastf1, "get_event_schedule", _refuse)
    monkeypatch.setattr(fastf1, "get_session", _refuse)


@pytest.fixture(autouse=True)
def _clear_schedule_cache():
    """Reset the module-level schedule cache around every test.

    ``tools/schedule_cache.py`` holds process-global state. Without this, a schedule
    prefilled by one test satisfies a lookup in another and tests pass in isolation
    but not as a suite — or worse, only in the order you happened to write them.
    """
    from tools import schedule_cache

    schedule_cache.clear()
    yield
    schedule_cache.clear()


@pytest.fixture
def season_2025():
    """A 2025 schedule straddling FROZEN_TODAY: Bahrain past, Monaco and Silverstone ahead."""
    return make_schedule(
        [
            {
                "name": "Bahrain Grand Prix",
                "date": "2025-03-02",
                "location": "Sakhir",
                "country": "Bahrain",
                "round": 1,
            },
            {
                "name": "Miami Grand Prix",
                "date": "2025-04-06",
                "location": "Miami",
                "country": "United States",
                "round": 2,
            },
            {
                "name": "Monaco Grand Prix",
                "date": "2025-05-25",
                "location": "Monaco",
                "country": "Monaco",
                "round": 3,
            },
            {
                "name": "British Grand Prix",
                "date": "2025-07-06",
                "location": "Silverstone",
                "country": "United Kingdom",
                "round": 4,
            },
        ]
    )


@pytest.fixture
def season_2026():
    """A 2026 schedule — entirely ahead of FROZEN_TODAY."""
    return make_schedule(
        [
            {
                "name": "Monaco Grand Prix",
                "date": "2026-05-24",
                "location": "Monaco",
                "country": "Monaco",
                "round": 3,
            },
            {
                "name": "Singapore Grand Prix",
                "date": "2026-09-20",
                "location": "Singapore",
                "country": "Singapore",
                "round": 5,
            },
        ]
    )


@pytest.fixture
def season_2024():
    """A 2024 schedule — entirely behind FROZEN_TODAY.

    Monaco appears here *and* in 2025/2026 so explicit-year resolution can be shown to
    beat the upcoming-race search. Qatar appears only here, so the reach-back-a-year
    branch has something to find.
    """
    return make_schedule(
        [
            {
                "name": "Monaco Grand Prix",
                "date": "2024-05-26",
                "location": "Monaco",
                "country": "Monaco",
                "round": 8,
            },
            {
                "name": "Qatar Grand Prix",
                "date": "2024-12-01",
                "location": "Lusail",
                "country": "Qatar",
                "round": 23,
            },
        ]
    )


@pytest.fixture
def schedules(season_2024, season_2025, season_2026):
    """Year → schedule mapping for patching ``get_schedule``."""
    return {2024: season_2024, 2025: season_2025, 2026: season_2026}


@pytest.fixture
def fake_get_schedule(schedules):
    """A ``get_schedule`` stand-in that serves fixtures and raises for unknown years.

    Raising (rather than returning empty) mirrors FastF1, which errors on years it has
    no data for — and the resolver has explicit handling for that which needs exercising.
    """

    def _get_schedule(year: int):
        if year not in schedules:
            raise ValueError(f"No schedule available for {year}")
        return schedules[year]

    return _get_schedule


@pytest.fixture
def client():
    """TestClient over a bare app with only the router mounted.

    Deliberately not ``main.app``: importing main runs ``validate_config()`` (which
    exits the process on a missing key) and enables the on-disk FastF1 cache. Neither
    belongs in a unit test, and neither is what these tests are about.
    """
    from api.routes import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)
