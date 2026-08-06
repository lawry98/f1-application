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
import requests
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.factories import make_schedule

# A fixed "now" for the whole suite. Chosen mid-season so that both "earlier this year"
# and "later this year" events are expressible against the same fixture schedule.
FROZEN_TODAY = date(2025, 5, 1)
FROZEN_NOW = FROZEN_TODAY.isoformat()


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


@pytest.fixture(autouse=True)
def _block_openf1_network(monkeypatch):
    """Make an unpatched OpenF1 fetch a deterministic transport failure, not a live call.

    Mirrors ``_block_fastf1_network`` in intent but not in mechanism, and the difference
    matters. FastF1 gets an ``AssertionError`` because no production path should ever
    swallow one. OpenF1 gets a ``requests.ConnectionError`` because the tools *do* have a
    legitimate handler for exactly that — the FastF1 fallback — and that is the behaviour
    the pre-existing tests in ``test_fastf1_tools.py`` depend on. Raising here means those
    tests keep exercising the FastF1 path they were written for, offline and unchanged.

    The cost of that choice: the fallback is the default under test, so a broken OpenF1
    implementation would look healthy to any test that does not opt in. Tests covering the
    OpenF1 path patch this same seam with ``make_openf1_get``, and
    ``test_openf1_tools.py`` asserts the OpenF1 path is genuinely taken rather than
    silently fallen through.
    """
    from tools import openf1_client

    def _refuse(*args, **kwargs):
        raise requests.ConnectionError(
            "Unpatched OpenF1 network call. Patch tools.openf1_client.requests.get "
            "with tests.factories.make_openf1_get, or let the FastF1 fallback handle it."
        )

    monkeypatch.setattr(openf1_client.requests, "get", _refuse)


@pytest.fixture(autouse=True)
def _clear_openf1_cache():
    """Reset the process-global OpenF1 response cache around every test.

    Same hazard as ``_clear_schedule_cache``: without it, one test's payload satisfies
    another test's lookup and the suite passes only in the order it was written.
    """
    from tools import openf1_client

    openf1_client.clear()
    yield
    openf1_client.clear()


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


OPENF1_SESSIONS_2024 = [
    {
        "session_key": 9500,
        "meeting_key": 1200,
        "session_name": "Race",
        "circuit_short_name": "Sakhir",
        "country_name": "Bahrain",
        "date_start": "2024-03-02T15:00:00+00:00",
    },
    {
        "session_key": 9510,
        "meeting_key": 1201,
        "session_name": "Sprint",
        "circuit_short_name": "Miami",
        "country_name": "United States",
        "date_start": "2024-04-05T16:00:00+00:00",
    },
    {
        "session_key": 9511,
        "meeting_key": 1201,
        "session_name": "Qualifying",
        "circuit_short_name": "Miami",
        "country_name": "United States",
        "date_start": "2024-04-05T20:00:00+00:00",
    },
    {
        "session_key": 9512,
        "meeting_key": 1201,
        "session_name": "Race",
        "circuit_short_name": "Miami",
        "country_name": "United States",
        "date_start": "2024-04-06T20:00:00+00:00",
    },
    {
        "session_key": 9600,
        "meeting_key": 1202,
        "session_name": "Race",
        "circuit_short_name": "Monte Carlo",
        "country_name": "Monaco",
        "date_start": "2024-05-26T13:00:00+00:00",
    },
]

OPENF1_DRIVERS = [
    {
        "session_key": key,
        "driver_number": number,
        "full_name": full_name,
        "name_acronym": acronym,
        "team_name": team,
    }
    for key in (9500, 9510, 9512, 9600)
    for number, full_name, acronym, team in (
        (1, "Max VERSTAPPEN", "VER", "Red Bull Racing"),
        (4, "Lando NORRIS", "NOR", "McLaren"),
        # Deliberately adversarial: driver number 5 sorts *ahead* of HAM's 44, and
        # Williams is listed *before* Ferrari below. Both confounds point the opposite
        # way from the correct answer, so dropping either tie-break component inverts
        # the order instead of leaving it unchanged by coincidence — that inversion is
        # what makes the tie-break tests actually fail on a regression. Do not "tidy"
        # this back into ascending driver-number / alphabetical-team order.
        (5, "Tied SECOND", "TIE", "Williams"),
        (44, "Lewis HAMILTON", "HAM", "Ferrari"),
        (50, "Zero POINTS", "ZER", "Cadillac"),
    )
]


def _openf1_result(session_key, position, number, points, **flags):
    row = {
        "session_key": session_key,
        "position": position,
        "driver_number": number,
        "points": points,
        "dnf": False,
        "dns": False,
        "dsq": False,
    }
    row.update(flags)
    return row


# Race points on the 25/18 scale; the Miami Sprint on the 8/7 scale.
#
# Season totals this produces: VER 75, NOR 69, HAM 30, TIE 30, ZER 0.
#   - Driver 44 (HAM) retires from Monaco — the DNF case.
#   - Driver 5 (TIE) finishes level with HAM on 30.0 — the tie-break case. HAM's best
#     finish is P3 and TIE's is P4, so best_position decides and HAM ranks ahead — even
#     though TIE's driver number (5) is numerically ahead of HAM's (44), which is what
#     makes this a real guard rather than a coincidence of ascending driver-number order.
#   - Driver 50 (ZER) scores nothing all season — the zero-fill case.
# Constructors: Red Bull 75, McLaren 69, Ferrari 30, Williams 30, Cadillac 0. Ferrari and
# Williams tie, broken alphabetically, so Cadillac lands at P5 — even though Williams is
# inserted into the roster before Ferrari (see OPENF1_DRIVERS), which is what makes this a
# real guard rather than a coincidence of dict-insertion order.
OPENF1_RESULTS = [
    _openf1_result(9500, 1, 1, 25.0),
    _openf1_result(9500, 2, 4, 18.0),
    _openf1_result(9500, 3, 44, 15.0),
    _openf1_result(9500, 4, 5, 12.0),
    _openf1_result(9510, 1, 4, 8.0),
    _openf1_result(9510, 2, 1, 7.0),
    _openf1_result(9512, 1, 4, 25.0),
    _openf1_result(9512, 2, 1, 18.0),
    _openf1_result(9512, 3, 44, 15.0),
    _openf1_result(9512, 4, 5, 12.0),
    _openf1_result(9600, 1, 1, 25.0, duration=3600.0),
    _openf1_result(9600, 2, 4, 18.0),
    _openf1_result(9600, 4, 5, 6.0),
    _openf1_result(9600, 0, 44, 0.0, dnf=True),
    # Qualifying carries no `points` key at all — pinning that OpenF1 quirk in the fixture.
    {"session_key": 9511, "position": 1, "driver_number": 1, "dnf": False},
]


@pytest.fixture
def openf1_season(monkeypatch):
    """Patch the OpenF1 client's requests.get with a full fake 2024 season.

    Overrides the autouse ``_block_openf1_network`` fixture for tests that want the
    OpenF1 path rather than the FastF1 fallback. Returns the fake so tests can assert
    on its ``.calls``.

    ``meetings`` is served empty rather than omitted: ``find_race_session`` always
    queries it first now, and an unmodelled endpoint makes ``make_openf1_get`` raise.
    An empty list means every meeting lookup here falls through to the circuit/country
    arms, which is exactly the behaviour these fixtures were written to exercise —
    adding real meeting names is deliberately left to the tests in
    ``test_openf1_tools.py`` that exist to cover the meeting arm.
    """
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get(
        {
            "sessions": OPENF1_SESSIONS_2024,
            "session_result": OPENF1_RESULTS,
            "drivers": OPENF1_DRIVERS,
            "meetings": [],
        }
    )
    monkeypatch.setattr(openf1_client.requests, "get", fake)
    return fake
