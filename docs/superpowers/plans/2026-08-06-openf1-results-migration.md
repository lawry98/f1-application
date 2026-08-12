# OpenF1 Results Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve race classification data from OpenF1 instead of FastF1 session loads, keeping every tool's return contract identical, and add a championship-standings tool the app currently has no source for.

**Architecture:** A new plain helper `tools/openf1_client.py` wraps three OpenF1 endpoints behind a cached, `requests`-based interface. The four result-reading tools try OpenF1 first and fall through to their existing `load_race_session` path for pre-2023 years or on transport failure. A new `tools/standings_tools.py` derives driver and constructor tables by summing `session_result.points` across Race and Sprint sessions, exposed as a `@tool` and as `GET /api/standings/{year}`.

**Tech Stack:** Python 3.12, `requests` (already declared), LangChain `@tool`, LangGraph, FastAPI, pytest + `freezegun`.

Spec: [`docs/superpowers/specs/2026-08-06-openf1-migration-design.md`](../specs/2026-08-06-openf1-migration-design.md)

## Global Constraints

- **`ruff` gates everything.** `line-length = 100`, `target-version = "py312"`, double quotes, lint set `["E","F","I","N","W","UP","B","SIM","RUF"]`. Run `ruff check . && ruff format .` from `backend/` before every commit.
- **Run pytest from `backend/`.** `pythonpath = ["."]`, `testpaths = ["tests"]`. Modules import as `from tools.x import ...`, never `from backend.tools.x import ...`.
- **Tools never raise.** Every `@tool` returns `{"error": "..."}` on failure. This is a `CLAUDE.md` invariant.
- **Backend test tree is flat.** New tests go at `backend/tests/test_openf1_client.py` and `backend/tests/test_standings_tools.py`. Do **not** create `backend/tests/tools/`.
- **No `os.getenv()` outside `config.py`.** Nothing in this plan needs an env var; `OPENF1_BASE_URL` is a module constant, matching how `LLM_MODEL` is handled.
- **`logger = logging.getLogger(__name__)`, never `print()`.**
- **`OPENF1_FIRST_YEAR = 2023`** is the single source of truth for coverage. Never write the literal `2023` anywhere else.
- **Never hit the live API from a test.** Task 1 installs an autouse fixture that enforces this.
- **Stage explicit paths on commit.** Other agents work this repo concurrently — `git add <path>`, never `git add -A`.

---

## Deviation from the spec, resolved here

The spec's acceptance criterion is "`tests/test_fastf1_tools.py` and `tests/test_tools.py` pass unchanged". Reading `backend/tests/conftest.py` shows why that needs machinery the spec did not specify.

`conftest.py:42` has an autouse `_block_fastf1_network` fixture that turns an unpatched FastF1 fetch into a loud `AssertionError`. There is no equivalent for `requests`. So the moment a tool gains an OpenF1 path, every existing test in `test_fastf1_tools.py` — which patches only `get_schedule` and `fastf1.get_session` — would **make live HTTP calls to OpenF1**.

Worse, `test_circuit_winners_collect_wins_across_the_lookback_window` freezes the clock at `FROZEN_TODAY = date(2025, 5, 1)`, making its 3-year window 2022–2024. Two of those years are inside OpenF1 coverage and one is not, so the test's outcome would depend on live 2023/2024 data.

**Resolution (Task 1):** an autouse `_block_openf1_network` fixture patches `openf1_client.requests.get` to raise `requests.RequestException`. Existing tests then deterministically exercise the FastF1 fallback and pass unchanged, offline. New OpenF1 tests patch the same seam with fixture payloads, which takes precedence — exactly the pattern `weather_tools` tests already use (`test_tools.py:81`).

This makes the fallback path the *default* under test, so the OpenF1 path is only ever covered by tests that opt in. Task 3's "issues exactly one request" test is what stops a silently-always-falling-back implementation from looking healthy.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/tools/openf1_client.py` | **Create.** HTTP + cache + the range-query pattern. Three functions, no F1 domain logic. |
| `backend/tools/standings_tools.py` | **Create.** The one new `@tool`. Points aggregation, zero-fill, ranking. |
| `backend/tools/fastf1_tools.py` | **Modify.** `get_recent_race_results`, `get_driver_form` gain an OpenF1 path. |
| `backend/tools/f1_data_tools.py` | **Modify.** `get_recent_top_finishers`, `get_circuit_winners` gain an OpenF1 path. |
| `backend/tools/openf1_shaping.py` | **Create.** Pure functions turning OpenF1 rows into each tool's contract shape. Keeps the two tool modules from each growing a private copy. |
| `backend/agent/graph.py` | **Modify.** `all_tools`, `_invoke_tool` branch. |
| `backend/agent/prompts.py` | **Modify.** `PLANNER_PROMPT` tool list, `DEFAULT_TOOLS`. |
| `backend/api/routes.py` | **Modify.** `GET /api/standings/{year}`. |
| `backend/api/errors.py` | **Modify.** One new constant. |
| `backend/tests/conftest.py` | **Modify.** `_block_openf1_network`, `_clear_openf1_cache`, OpenF1 payload fixtures. |
| `backend/tests/factories.py` | **Modify.** `make_openf1_get` builder. |
| `backend/tests/test_openf1_client.py` | **Create.** Cache, range query, transport. |
| `backend/tests/test_standings_tools.py` | **Create.** Sprint points, quali exclusion, zero-fill, ranking. |
| `backend/tests/test_openf1_tools.py` | **Create.** The four ported tools on the OpenF1 path, and their fallbacks. |
| `CLAUDE.md` | **Modify.** Final task. |

`openf1_shaping.py` exists because `fastf1_tools.py` and `f1_data_tools.py` both need identical row→contract conversion, and the alternative is duplicating `Status` derivation in two files where the two copies can drift.

---

## Task 1: OpenF1 client with caching and the test seam

**Files:**
- Create: `backend/tools/openf1_client.py`
- Create: `backend/tests/test_openf1_client.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/factories.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `OPENF1_FIRST_YEAR: int = 2023`
  - `OPENF1_BASE_URL: str = "https://api.openf1.org/v1"`
  - `OPENF1_TIMEOUT: float = 15.0`
  - `list_sessions(year: int, session_name: str | None = None) -> list[dict[str, Any]]`
  - `session_results(keys: set[int]) -> list[dict[str, Any]]`
  - `driver_index(keys: set[int]) -> dict[int, dict[str, str]]`
  - `clear() -> None`
  - Raises `requests.RequestException` on transport failure; raises `OpenF1Error` on a non-200.
- Test helper produced: `tests.factories.make_openf1_get(routes: dict[str, Any]) -> Callable`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_openf1_client.py`:

```python
"""Tests for the OpenF1 HTTP client.

Two things here are worth more than the response shaping. First, the range-query
pattern: one request spanning min..max of the wanted keys, filtered in Python. Looping
one request per race is both slow and the only realistic way to breach OpenF1's
3 req/s ceiling, so the request count is asserted directly. Second, the cache, which
is process-global and therefore reset by an autouse fixture in conftest.
"""

import pytest
import requests

from tests.factories import make_openf1_get
from tools import openf1_client
from tools.openf1_client import (
    OPENF1_FIRST_YEAR,
    OpenF1Error,
    driver_index,
    list_sessions,
    session_results,
)

SESSIONS_2026 = [
    {
        "session_key": 11334,
        "meeting_key": 1290,
        "session_name": "Race",
        "circuit_short_name": "Spa-Francorchamps",
        "country_name": "Belgium",
        "date_start": "2026-07-19T13:00:00+00:00",
    },
    {
        "session_key": 11330,
        "meeting_key": 1290,
        "session_name": "Qualifying",
        "circuit_short_name": "Spa-Francorchamps",
        "country_name": "Belgium",
        "date_start": "2026-07-18T14:00:00+00:00",
    },
    {
        "session_key": 11342,
        "meeting_key": 1291,
        "session_name": "Race",
        "circuit_short_name": "Hungaroring",
        "country_name": "Hungary",
        "date_start": "2026-07-26T13:00:00+00:00",
    },
]


def test_first_year_is_the_single_source_of_coverage_truth():
    """Hardcoding 2023 anywhere else lets the API and the tools disagree."""
    assert OPENF1_FIRST_YEAR == 2023


def test_list_sessions_filters_by_session_name(monkeypatch):
    fake = make_openf1_get({"sessions": SESSIONS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    result = list_sessions(2026, "Race")

    assert [s["session_key"] for s in result] == [11334, 11342]


def test_list_sessions_without_a_name_returns_everything(monkeypatch):
    fake = make_openf1_get({"sessions": SESSIONS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert len(list_sessions(2026)) == 3


def test_session_results_issues_one_request_for_many_keys(monkeypatch):
    """The whole point of the migration. Five races must cost one request, not five."""
    rows = [
        {"session_key": key, "position": 1, "driver_number": 1, "points": 25.0}
        for key in (11334, 11338, 11342)
    ]
    fake = make_openf1_get({"session_result": rows})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    session_results({11334, 11342})

    assert len(fake.calls) == 1


def test_session_results_spans_min_to_max_of_the_wanted_keys(monkeypatch):
    fake = make_openf1_get({"session_result": []})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    session_results({11342, 11334, 11338})

    params = fake.calls[0]["params"]
    assert params["session_key>="] == 11334
    assert params["session_key<="] == 11342


def test_session_results_discards_keys_outside_the_wanted_set(monkeypatch):
    """A range query sweeps in practice and quali sessions too. They must not survive."""
    rows = [
        {"session_key": 11334, "position": 1, "driver_number": 1, "points": 25.0},
        {"session_key": 11338, "position": 1, "driver_number": 4},
        {"session_key": 11342, "position": 1, "driver_number": 1, "points": 25.0},
    ]
    fake = make_openf1_get({"session_result": rows})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    result = session_results({11334, 11342})

    assert {row["session_key"] for row in result} == {11334, 11342}


def test_session_results_with_no_keys_makes_no_request(monkeypatch):
    fake = make_openf1_get({"session_result": []})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert session_results(set()) == []
    assert fake.calls == []


def test_driver_index_maps_number_to_identity(monkeypatch):
    rows = [
        {
            "session_key": 11334,
            "driver_number": 1,
            "full_name": "Max VERSTAPPEN",
            "name_acronym": "VER",
            "team_name": "Red Bull Racing",
        }
    ]
    fake = make_openf1_get({"drivers": rows})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert driver_index({11334}) == {
        1: {
            "full_name": "Max VERSTAPPEN",
            "name_acronym": "VER",
            "team_name": "Red Bull Racing",
        }
    }


def test_driver_index_prefers_the_latest_session_for_a_driver(monkeypatch):
    """A mid-season team change must report the team the driver is in now."""
    rows = [
        {
            "session_key": 11334,
            "driver_number": 5,
            "full_name": "A B",
            "name_acronym": "ABC",
            "team_name": "Old Team",
        },
        {
            "session_key": 11342,
            "driver_number": 5,
            "full_name": "A B",
            "name_acronym": "ABC",
            "team_name": "New Team",
        },
    ]
    fake = make_openf1_get({"drivers": rows})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    assert driver_index({11334, 11342})[5]["team_name"] == "New Team"


def test_a_non_200_raises_openf1_error(monkeypatch):
    fake = make_openf1_get({"sessions": []}, status_code=503)
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    with pytest.raises(OpenF1Error):
        list_sessions(2026)


def test_a_transport_failure_propagates(monkeypatch):
    """The client raises; translating to {"error": ...} is the @tool boundary's job."""

    def _boom(*args, **kwargs):
        raise requests.ConnectionError("openf1 unreachable")

    monkeypatch.setattr(openf1_client.requests, "get", _boom)

    with pytest.raises(requests.RequestException):
        list_sessions(2026)


def test_the_cache_collapses_a_repeated_call(monkeypatch):
    """Four tools fanning out in one briefing must not each fetch the same season."""
    fake = make_openf1_get({"sessions": SESSIONS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_sessions(2026, "Race")
    list_sessions(2026, "Race")

    assert len(fake.calls) == 1


def test_the_cache_distinguishes_different_params(monkeypatch):
    fake = make_openf1_get({"sessions": SESSIONS_2026})
    monkeypatch.setattr(openf1_client.requests, "get", fake)

    list_sessions(2026)
    list_sessions(2025)

    assert len(fake.calls) == 2


def test_a_failure_is_not_cached(monkeypatch):
    """Caching an exception would make one blip poison the process."""
    calls = []

    def _boom(*args, **kwargs):
        calls.append(kwargs)
        raise requests.ConnectionError("openf1 unreachable")

    monkeypatch.setattr(openf1_client.requests, "get", _boom)

    for _ in range(2):
        with pytest.raises(requests.RequestException):
            list_sessions(2026)

    assert len(calls) == 2
```

Add to `backend/tests/factories.py`:

```python
def make_openf1_get(routes: dict[str, Any], status_code: int = 200):
    """Build a stand-in for ``requests.get`` against OpenF1.

    Args:
        routes: Endpoint name (the last path segment, e.g. ``"sessions"``) → JSON payload.
        status_code: Status every response reports.

    The returned callable records each call as ``{"url": ..., "params": ...}`` on ``.calls``,
    which is what lets tests assert the request *count* — the range-query pattern's whole
    value is that five races cost one request, and only a call count can pin that.
    An endpoint missing from ``routes`` is a test-authoring mistake, so it raises rather
    than quietly returning an empty list.
    """

    class _FakeGet:
        def __init__(self) -> None:
            self.calls: list[dict[str, Any]] = []

        def __call__(self, url: str, params: dict[str, Any] | None = None, **kwargs: Any):
            self.calls.append({"url": url, "params": params or {}})
            endpoint = url.rstrip("/").rsplit("/", 1)[-1]
            if endpoint not in routes:
                raise AssertionError(
                    f"make_openf1_get has no payload for '{endpoint}'. "
                    f"Known endpoints: {sorted(routes)}"
                )
            return _FakeOpenF1Response(routes[endpoint], status_code)

    return _FakeGet()


class _FakeOpenF1Response:
    """Stand-in for a ``requests.Response`` — only status_code and json() are consumed."""

    def __init__(self, payload: Any, status_code: int) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> Any:
        return self._payload
```

Add to `backend/tests/conftest.py`, immediately after the `_clear_schedule_cache` fixture:

```python
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
```

Add `import requests` to the `conftest.py` import block (after `import pytest`).

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_openf1_client.py -v
```

Expected: collection error — `ModuleNotFoundError: No module named 'tools.openf1_client'`.

- [ ] **Step 3: Write the client**

Create `backend/tools/openf1_client.py`:

```python
"""HTTP client for the OpenF1 API — a plain helper, not an LLM-callable tool.

Same category as ``fastf1_helpers.py`` and ``schedule_cache.py``: adding a file to
``tools/`` does not make it a tool.

Two design points carry the migration.

**The range-query pattern.** OpenF1 supports comparison filters on any non-array
attribute, so N sessions cost one request spanning ``min(keys)..max(keys)``, with
unwanted rows dropped in Python. This is what turns ``get_driver_form``'s five
sequential 2.4s FastF1 session loads into a single sub-second call. It also keeps the
tool fan-out under OpenF1's unauthenticated 3 req/s, 30 req/min ceiling — a
request-per-race loop is the one shape that would breach it.

**This module raises.** The never-raise contract belongs at the ``@tool`` boundary,
where a failure has to become ``{"error": ...}``. A client that swallowed transport
errors could not be distinguished from one that found no data, and the tools need that
distinction to decide whether to fall back to FastF1.
"""

import logging
import threading
from typing import Any

import requests

logger = logging.getLogger(__name__)

OPENF1_BASE_URL = "https://api.openf1.org/v1"
OPENF1_TIMEOUT = 15.0

# OpenF1 coverage begins with the 2023 season; `sessions?year=2022` returns
# {"detail": "No results found."}. Every coverage check in the codebase reads this
# constant so the tools and the API route cannot disagree about the boundary.
OPENF1_FIRST_YEAR = 2023

_lock = threading.Lock()
_cache: dict[tuple[str, frozenset], list[dict[str, Any]]] = {}


class OpenF1Error(RuntimeError):
    """A non-200 from OpenF1. Transport failures surface as requests exceptions."""


def clear() -> None:
    """Clear the cached responses. Used by tests; harmless in production."""
    with _lock:
        _cache.clear()


def _get(endpoint: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    """Fetch and cache one endpoint+params combination.

    The lock is released during the request, exactly as in ``schedule_cache.py``:
    concurrent misses must not serialise network I/O, and a duplicate fetch of the same
    key is acceptable (last write wins). Failures are deliberately not cached — one blip
    would otherwise poison the process for its lifetime.
    """
    key = (endpoint, frozenset(params.items()))
    with _lock:
        if key in _cache:
            return _cache[key]

    response = requests.get(
        f"{OPENF1_BASE_URL}/{endpoint}", params=params, timeout=OPENF1_TIMEOUT
    )
    if response.status_code != 200:
        raise OpenF1Error(f"OpenF1 {endpoint} returned HTTP {response.status_code}")

    payload = response.json()
    # A miss is `{"detail": "No results found."}`, not an empty array. Normalising it to
    # [] here is what lets every caller treat "no data" as a falsy list.
    rows = payload if isinstance(payload, list) else []

    with _lock:
        _cache[key] = rows
    return rows


def _range_params(keys: set[int]) -> dict[str, Any]:
    """Build the one-request span covering every key in the set."""
    return {"session_key>=": min(keys), "session_key<=": max(keys)}


def list_sessions(year: int, session_name: str | None = None) -> list[dict[str, Any]]:
    """Return the year's sessions, optionally narrowed to one session_name.

    Args:
        year: Season to query.
        session_name: Exact OpenF1 name — "Race", "Sprint", "Qualifying", "Practice 1"…
            Filtering happens server-side when given.

    Returns:
        Session dicts carrying session_key, meeting_key, session_name,
        circuit_short_name, country_name, and date_start. Empty when OpenF1 has no data.
    """
    params: dict[str, Any] = {"year": year}
    if session_name is not None:
        params["session_name"] = session_name
    return _get("sessions", params)


def session_results(keys: set[int]) -> list[dict[str, Any]]:
    """Return classification rows for exactly the given session keys, in one request.

    Args:
        keys: Session keys wanted. An empty set makes no request.

    Returns:
        Rows carrying position, driver_number, points, dnf, dns, dsq, duration and
        gap_to_leader. Rows whose session_key is not in ``keys`` are dropped — the range
        query sweeps in practice and qualifying sessions that fall inside the span.

        Note that qualifying rows carry no ``points`` key at all, so callers summing
        points must still filter by session_name upstream rather than relying on that.
    """
    if not keys:
        return []
    rows = _get("session_result", _range_params(keys))
    return [row for row in rows if row.get("session_key") in keys]


def driver_index(keys: set[int]) -> dict[int, dict[str, str]]:
    """Map driver_number to identity across the given sessions, in one request.

    ``session_result`` carries only ``driver_number``, so every tool that reports a name
    or a team needs this join.

    Args:
        keys: Session keys to draw the roster from.

    Returns:
        driver_number → {full_name, name_acronym, team_name}. Where a driver appears in
        several sessions the *latest* session wins, so a mid-season team change reports
        the team the driver is in now rather than the one they started the year in.
    """
    if not keys:
        return {}
    rows = [row for row in _get("drivers", _range_params(keys)) if row.get("session_key") in keys]

    index: dict[int, dict[str, str]] = {}
    for row in sorted(rows, key=lambda r: r.get("session_key", 0)):
        number = row.get("driver_number")
        if number is None:
            continue
        index[number] = {
            "full_name": row.get("full_name", ""),
            "name_acronym": row.get("name_acronym", ""),
            "team_name": row.get("team_name", ""),
        }
    return index
```

- [ ] **Step 4: Run the new tests**

```bash
cd backend && .venv/bin/python -m pytest tests/test_openf1_client.py -v
```

Expected: all PASS.

- [ ] **Step 5: Run the whole suite — the seam must not have broken anything**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: all PASS. The tools have no OpenF1 path yet, so `_block_openf1_network` is inert; this run proves the fixture and the new `import requests` in conftest are harmless.

- [ ] **Step 6: Lint and commit**

```bash
cd backend && ruff check . && ruff format .
cd .. && git add backend/tools/openf1_client.py backend/tests/test_openf1_client.py \
  backend/tests/conftest.py backend/tests/factories.py
git commit -m "Add a cached OpenF1 client and its test seam"
```

---

## Task 2: Row shaping helpers

**Files:**
- Create: `backend/tools/openf1_shaping.py`
- Create: `backend/tests/test_openf1_shaping.py`

**Interfaces:**
- Consumes: nothing from Task 1 at runtime; shapes the row dicts `session_results` and `driver_index` return.
- Produces:
  - `derive_status(row: dict[str, Any]) -> str`
  - `race_result_rows(rows: list[dict], drivers: dict[int, dict[str, str]]) -> list[dict[str, Any]]`
  - `top_finisher_rows(rows: list[dict], drivers: dict[int, dict[str, str]]) -> list[dict[str, Any]]`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_openf1_shaping.py`:

```python
"""Tests for the OpenF1 row → tool-contract converters.

These exist as their own module because ``fastf1_tools`` and ``f1_data_tools`` both need
identical conversion, and two private copies of ``derive_status`` would drift.

The Status derivation is the lossy part of the migration and the part most worth pinning:
FastF1 gives prose ("+1 Lap", "Accident", "Gearbox"), OpenF1 gives three booleans.
"""

from tools.openf1_shaping import derive_status, race_result_rows, top_finisher_rows

DRIVERS = {
    1: {"full_name": "Max VERSTAPPEN", "name_acronym": "VER", "team_name": "Red Bull Racing"},
    4: {"full_name": "Lando NORRIS", "name_acronym": "NOR", "team_name": "McLaren"},
    44: {"full_name": "Lewis HAMILTON", "name_acronym": "HAM", "team_name": "Ferrari"},
}


def test_a_clean_finish_is_finished():
    assert derive_status({"dnf": False, "dns": False, "dsq": False}) == "Finished"


def test_a_dnf_is_reported():
    assert derive_status({"dnf": True, "dns": False, "dsq": False}) == "DNF"


def test_a_dns_is_reported():
    assert derive_status({"dnf": False, "dns": True, "dsq": False}) == "DNS"


def test_a_dsq_is_reported():
    assert derive_status({"dnf": False, "dns": False, "dsq": True}) == "DSQ"


def test_dsq_outranks_dnf_and_dns():
    """A disqualified car is often also flagged dnf. DSQ is the more specific fact, and
    reporting it as a DNF would tell a reader the car broke rather than that it was
    thrown out.
    """
    assert derive_status({"dnf": True, "dns": True, "dsq": True}) == "DSQ"


def test_dns_outranks_dnf():
    assert derive_status({"dnf": True, "dns": True, "dsq": False}) == "DNS"


def test_missing_flags_default_to_finished():
    """OpenF1 omits keys rather than nulling them; absence must not crash."""
    assert derive_status({}) == "Finished"


def test_race_result_rows_match_the_fastf1_column_contract():
    """The keys here are the ones test_fastf1_tools.py asserts on. They cannot change."""
    rows = [{"session_key": 1, "position": 1, "driver_number": 1, "points": 25.0, "dnf": False}]

    assert race_result_rows(rows, DRIVERS) == [
        {
            "Position": 1,
            "DriverNumber": "1",
            "Abbreviation": "VER",
            "TeamName": "Red Bull Racing",
            "Points": 25.0,
            "Status": "Finished",
        }
    ]


def test_race_result_rows_report_an_unclassified_finish_as_dnf():
    """FastF1 encodes this as Position 0.0; format_position turns it into "DNF"."""
    rows = [{"session_key": 1, "position": 0, "driver_number": 4, "points": 0.0, "dnf": True}]

    assert race_result_rows(rows, DRIVERS)[0]["Position"] == "DNF"
    assert race_result_rows(rows, DRIVERS)[0]["Status"] == "DNF"


def test_race_result_rows_sort_by_position():
    """A range query returns rows in no guaranteed order; a briefing needs the order."""
    rows = [
        {"session_key": 1, "position": 4, "driver_number": 4, "points": 12.0},
        {"session_key": 1, "position": 1, "driver_number": 1, "points": 25.0},
    ]

    assert [row["Position"] for row in race_result_rows(rows, DRIVERS)] == [1, 4]


def test_race_result_rows_sort_unclassified_cars_last():
    """OpenF1 encodes "no finishing position" as 0, so an ascending sort would put every
    retirement above the winner. FastF1's frame orders DNFs last and these rows must match.
    """
    rows = [
        {"session_key": 1, "position": 0, "driver_number": 44, "points": 0.0, "dnf": True},
        {"session_key": 1, "position": 1, "driver_number": 1, "points": 25.0},
    ]

    assert [row["Position"] for row in race_result_rows(rows, DRIVERS)] == [1, "DNF"]


def test_top_finisher_rows_sort_unclassified_cars_last():
    rows = [
        {"session_key": 1, "position": 0, "driver_number": 44, "points": 0.0, "dnf": True},
        {"session_key": 1, "position": 1, "driver_number": 1, "points": 25.0},
    ]

    assert [row["position"] for row in top_finisher_rows(rows, DRIVERS)] == [1, "DNF"]


def test_race_result_rows_tolerate_an_unknown_driver_number():
    """A driver in the results but not the roster gets blanks, not a KeyError."""
    rows = [{"session_key": 1, "position": 1, "driver_number": 99, "points": 25.0}]

    shaped = race_result_rows(rows, DRIVERS)[0]
    assert shaped["Abbreviation"] == ""
    assert shaped["TeamName"] == ""


def test_top_finisher_rows_match_their_own_contract():
    """Different key names from race_result_rows — lowercase, and a full driver name."""
    rows = [{"session_key": 1, "position": 1, "driver_number": 1, "points": 25.0}]

    assert top_finisher_rows(rows, DRIVERS) == [
        {
            "position": 1,
            "driver": "Max VERSTAPPEN",
            "driver_code": "VER",
            "team": "Red Bull Racing",
            "points": 25.0,
        }
    ]


def test_top_finisher_rows_default_missing_points_to_zero():
    """Qualifying rows carry no points key. A None here would reach the LLM as null."""
    rows = [{"session_key": 1, "position": 1, "driver_number": 1}]

    assert top_finisher_rows(rows, DRIVERS)[0]["points"] == 0.0
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_openf1_shaping.py -v
```

Expected: collection error — `ModuleNotFoundError: No module named 'tools.openf1_shaping'`.

- [ ] **Step 3: Write the shaping module**

Create `backend/tools/openf1_shaping.py`:

```python
"""Convert OpenF1 rows into the shapes the existing tools already return.

A plain helper, not an LLM-callable tool.

This module exists so the two tool modules do not each grow a private copy of the
conversion. The ``Status`` derivation in particular is the lossy edge of the migration
and belongs in exactly one place.
"""

from typing import Any

from tools.fastf1_helpers import format_position

# Sorts unclassified cars to the back. OpenF1 encodes "no finishing position" as 0, so a
# naive ascending sort puts every retirement *above* the winner. FastF1's results frame
# already orders DNFs last, and these rows have to match it.
_UNCLASSIFIED_SORT_RANK = 999


def _position_sort_key(row: dict[str, Any]) -> int:
    position = row.get("position")
    if not isinstance(position, int) or position <= 0:
        return _UNCLASSIFIED_SORT_RANK
    return position


def derive_status(row: dict[str, Any]) -> str:
    """Collapse OpenF1's three retirement booleans into a FastF1-style Status string.

    This is a genuine loss of fidelity. FastF1 reports *why* a car stopped — "+1 Lap",
    "Accident", "Gearbox", "Hydraulics" — because it reads the classification feed's own
    prose. OpenF1 exposes only ``dnf``/``dns``/``dsq``, so a briefing built on the OpenF1
    path can say a car retired but not what broke.

    Precedence is DSQ, then DNS, then DNF, most specific first: a disqualified car is
    frequently flagged ``dnf`` as well, and reporting that as a DNF would tell a reader
    the car failed rather than that it was excluded.
    """
    if row.get("dsq"):
        return "DSQ"
    if row.get("dns"):
        return "DNS"
    if row.get("dnf"):
        return "DNF"
    return "Finished"


def race_result_rows(
    rows: list[dict[str, Any]], drivers: dict[int, dict[str, str]]
) -> list[dict[str, Any]]:
    """Shape rows into ``get_recent_race_results``' PascalCase column contract.

    The keys mirror the FastF1 ``session.results`` columns that tool selects, because
    ``tests/test_fastf1_tools.py`` asserts on the exact key set and the migration's
    acceptance criterion is that it keeps passing.

    ``DriverNumber`` is a string: FastF1's results frame indexes drivers by string
    number, and the existing fixtures encode it that way.
    """
    shaped = []
    for row in sorted(rows, key=_position_sort_key):
        identity = drivers.get(row.get("driver_number"), {})
        shaped.append(
            {
                "Position": format_position(row.get("position") or 0),
                "DriverNumber": str(row.get("driver_number", "")),
                "Abbreviation": identity.get("name_acronym", ""),
                "TeamName": identity.get("team_name", ""),
                "Points": float(row.get("points") or 0.0),
                "Status": derive_status(row),
            }
        )
    return shaped


def top_finisher_rows(
    rows: list[dict[str, Any]], drivers: dict[int, dict[str, str]]
) -> list[dict[str, Any]]:
    """Shape rows into ``get_recent_top_finishers``' lowercase contract.

    Deliberately not the same shape as ``race_result_rows``: the two tools return
    different key names today, and unifying them would be a contract change wearing a
    refactor's clothes.
    """
    shaped = []
    for row in sorted(rows, key=_position_sort_key):
        identity = drivers.get(row.get("driver_number"), {})
        shaped.append(
            {
                "position": format_position(row.get("position") or 0),
                "driver": identity.get("full_name", ""),
                "driver_code": identity.get("name_acronym", ""),
                "team": identity.get("team_name", ""),
                "points": float(row.get("points") or 0.0),
            }
        )
    return shaped
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && .venv/bin/python -m pytest tests/test_openf1_shaping.py -v
```

Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
cd backend && ruff check . && ruff format .
cd .. && git add backend/tools/openf1_shaping.py backend/tests/test_openf1_shaping.py
git commit -m "Add OpenF1 row shaping with an explicit Status derivation"
```

---

## Task 3: Port `get_recent_race_results` and `get_recent_top_finishers`

The two single-session tools. Ported together because they share the "find one race, read its classification" shape, and a reviewer judging one would judge the other identically.

**Files:**
- Modify: `backend/tools/fastf1_tools.py` (`get_recent_race_results`, lines 42-66)
- Modify: `backend/tools/f1_data_tools.py` (`get_recent_top_finishers`, lines 12-54)
- Create: `backend/tests/test_openf1_tools.py`
- Modify: `backend/tests/conftest.py` (add the `openf1_season` fixture)

**Interfaces:**
- Consumes: `tools.openf1_client.{OPENF1_FIRST_YEAR, list_sessions, session_results, driver_index}`; `tools.openf1_shaping.{race_result_rows, top_finisher_rows}`.
- Produces: `tools.openf1_races.find_race_session(year, event_name) -> dict | None` and `tools.openf1_races.completed_races(year, today) -> list[dict]`, both used by Task 4.

- [ ] **Step 1: Add the shared season fixture to `backend/tests/conftest.py`**

Append:

```python
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
        (44, "Lewis HAMILTON", "HAM", "Ferrari"),
        # Finishes level with HAM on 30.0 — the tie-break case. Never beats HAM's best
        # finish, so best_position decides and the order is predictable.
        (55, "Tied SECOND", "TIE", "Williams"),
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
#   - Driver 55 (TIE) finishes level with HAM on 30.0 — the tie-break case. HAM's best
#     finish is P3 and TIE's is P4, so best_position decides and HAM ranks ahead.
#   - Driver 50 (ZER) scores nothing all season — the zero-fill case.
# Constructors: Red Bull 75, McLaren 69, Ferrari 30, Williams 30, Cadillac 0. Ferrari and
# Williams tie, broken alphabetically, so Cadillac lands at P5.
OPENF1_RESULTS = [
    _openf1_result(9500, 1, 1, 25.0),
    _openf1_result(9500, 2, 4, 18.0),
    _openf1_result(9500, 3, 44, 15.0),
    _openf1_result(9500, 4, 55, 12.0),
    _openf1_result(9510, 1, 4, 8.0),
    _openf1_result(9510, 2, 1, 7.0),
    _openf1_result(9512, 1, 4, 25.0),
    _openf1_result(9512, 2, 1, 18.0),
    _openf1_result(9512, 3, 44, 15.0),
    _openf1_result(9512, 4, 55, 12.0),
    _openf1_result(9600, 1, 1, 25.0, duration=3600.0),
    _openf1_result(9600, 2, 4, 18.0),
    _openf1_result(9600, 4, 55, 6.0),
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
    """
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get(
        {
            "sessions": OPENF1_SESSIONS_2024,
            "session_result": OPENF1_RESULTS,
            "drivers": OPENF1_DRIVERS,
        }
    )
    monkeypatch.setattr(openf1_client.requests, "get", fake)
    return fake
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/test_openf1_tools.py`:

```python
"""Tests for the four result tools on their OpenF1 path, and their FastF1 fallbacks.

The pre-existing ``test_fastf1_tools.py`` covers the same four tools on the FastF1 path
and must keep passing untouched — that is the migration's acceptance criterion. It gets
that path for free because conftest's autouse ``_block_openf1_network`` makes every
unpatched OpenF1 call a transport failure.

Which means the risk this module carries is specific: an implementation that always
falls through to FastF1 would satisfy every test over there. So the first test below
asserts the OpenF1 request actually happens, and the FastF1 seam is left poisoned in
the OpenF1-path tests so a fallthrough is a loud failure rather than a quiet pass.
"""

from typing import Any

import fastf1
import pytest
from freezegun import freeze_time

from tests.conftest import FROZEN_NOW
from tools.f1_data_tools import get_circuit_winners, get_recent_top_finishers
from tools.fastf1_tools import get_driver_form, get_recent_race_results


def _boom(*args: Any, **kwargs: Any):
    raise AssertionError("FastF1 must not be reached on the OpenF1 path")


@pytest.fixture
def no_fastf1(monkeypatch):
    """Poison the FastF1 seam so a silent fallthrough fails loudly."""
    monkeypatch.setattr(fastf1, "get_session", _boom)


# ── get_recent_race_results ──────────────────────────────────────────────────


def test_race_results_come_from_openf1(openf1_season, no_fastf1):
    result = get_recent_race_results.invoke({"event_name": "Monte Carlo", "year": 2024})

    assert result["year"] == 2024
    assert result["event"] == "Monte Carlo"
    # HAM retired (position 0) and must land last, not first.
    assert [row["Abbreviation"] for row in result["results"]] == ["VER", "NOR", "TIE", "HAM"]
    assert set(result["results"][0]) == {
        "Position",
        "DriverNumber",
        "Abbreviation",
        "TeamName",
        "Points",
        "Status",
    }


def test_race_results_actually_issue_an_openf1_request(openf1_season, no_fastf1):
    """Guards the failure mode the rest of the suite cannot see: an implementation that
    always falls through to FastF1 passes every test in test_fastf1_tools.py.
    """
    get_recent_race_results.invoke({"event_name": "Monte Carlo", "year": 2024})

    assert openf1_season.calls, "no OpenF1 request was made"


def test_race_results_report_the_dnf_from_the_boolean_flags(openf1_season, no_fastf1):
    result = get_recent_race_results.invoke({"event_name": "Monte Carlo", "year": 2024})

    retirement = [row for row in result["results"] if row["Abbreviation"] == "HAM"][0]
    assert retirement["Position"] == "DNF"
    assert retirement["Status"] == "DNF"


def test_race_results_fall_back_to_fastf1_before_2023(monkeypatch, openf1_season, race_session):
    """2022 is outside OpenF1 coverage, so the FastF1 path must run and no OpenF1
    request should be attempted at all.
    """
    result = get_recent_race_results.invoke({"event_name": "Monaco Grand Prix", "year": 2022})

    assert result["year"] == 2022
    assert [row["Abbreviation"] for row in result["results"]] == ["VER", "NOR", "HAM"]
    assert openf1_season.calls == []


def test_race_results_fall_back_when_openf1_has_no_such_race(openf1_season, race_session):
    """An in-coverage year whose event OpenF1 does not know still has a FastF1 answer."""
    result = get_recent_race_results.invoke({"event_name": "Nürburgring", "year": 2024})

    assert "error" not in result
    assert [row["Abbreviation"] for row in result["results"]] == ["VER", "NOR", "HAM"]


def test_race_results_error_when_both_sources_fail(monkeypatch):
    """conftest blocks OpenF1; poisoning FastF1 too leaves nothing. Never raise."""
    monkeypatch.setattr(fastf1, "get_session", _boom)

    result = get_recent_race_results.invoke({"event_name": "Monte Carlo", "year": 2024})

    assert "error" in result


# ── get_recent_top_finishers ─────────────────────────────────────────────────


@freeze_time("2024-06-01")
def test_top_finishers_come_from_the_last_completed_openf1_race(openf1_season, no_fastf1):
    result = get_recent_top_finishers.invoke({"year": 2024})

    assert result["last_race"] == "Monte Carlo"
    assert result["top_finishers"][0] == {
        "position": 1,
        "driver": "Max VERSTAPPEN",
        "driver_code": "VER",
        "team": "Red Bull Racing",
        "points": 25.0,
    }
    assert result["top_finishers"][-1]["position"] == "DNF"


@freeze_time("2024-06-01")
def test_top_finishers_keep_the_not_cumulative_note(openf1_season, no_fastf1):
    """The note stops the LLM reading one race's order as a championship table. The
    planner can select this tool without selecting get_championship_standings, so the
    risk it guards against survives the new tool.
    """
    result = get_recent_top_finishers.invoke({"year": 2024})

    assert result["note"] == "Positions from most recent race (not cumulative season standings)"


@freeze_time("2024-06-01")
def test_top_finishers_ignore_sprints_and_qualifying(openf1_season, no_fastf1):
    """Miami's Sprint is a day before its Race and qualifying is between them. The most
    recent *race* is what this tool reports, so neither may be picked as "last_race".
    """
    result = get_recent_top_finishers.invoke({"year": 2024})

    assert result["last_race"] == "Monte Carlo"
    assert len(result["top_finishers"]) == 4


@freeze_time("2024-01-15")
def test_top_finishers_report_a_season_with_no_completed_races(openf1_season, no_fastf1):
    result = get_recent_top_finishers.invoke({"year": 2024})

    assert result == {"error": "No completed races found for 2024 season yet"}


@freeze_time(FROZEN_NOW)
def test_top_finishers_fall_back_to_fastf1_before_2023(
    monkeypatch, openf1_season, season_2025, race_session
):
    from tools import f1_data_tools

    monkeypatch.setattr(f1_data_tools, "get_schedule", lambda year: season_2025)

    result = get_recent_top_finishers.invoke({"year": 2022})

    assert result["last_race"] == "Miami Grand Prix"
    assert openf1_season.calls == []
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_openf1_tools.py -v
```

Expected: the `test_race_results_come_from_openf1` group FAILs with the `AssertionError("FastF1 must not be reached on the OpenF1 path")` from the `no_fastf1` fixture, because no OpenF1 path exists yet.

- [ ] **Step 4: Add the race-lookup helper**

Create `backend/tools/openf1_races.py`:

```python
"""Race-session lookup over the OpenF1 sessions endpoint. A plain helper, not a tool.

Every result tool starts by answering one of two questions — "which session is this
event's race?" or "which races have already run?" — and both are one filtered pass over
``list_sessions``. Keeping them here means the four tools share one definition of what
counts as a race.
"""

import logging
from datetime import date
from typing import Any

from tools.openf1_client import list_sessions

logger = logging.getLogger(__name__)


def _session_date(session: dict[str, Any]) -> date:
    """Parse OpenF1's ISO-8601 date_start down to a date."""
    return date.fromisoformat(session["date_start"][:10])


def find_race_session(year: int, event_name: str) -> dict[str, Any] | None:
    """Return the Race session whose circuit or country matches event_name, or None.

    Matching is a case-insensitive substring test against ``circuit_short_name`` and
    ``country_name``, mirroring how ``race_resolver._find_event`` searches the FastF1
    schedule. It is deliberately loose: callers pass FastF1 EventNames like
    "Belgian Grand Prix" as well as circuit names like "Spa-Francorchamps", and OpenF1
    indexes neither of those under a single field.

    Returning None rather than raising is what lets the tools decide to fall back.
    """
    needle = event_name.casefold()
    for session in list_sessions(year, "Race"):
        haystacks = (
            session.get("circuit_short_name", "").casefold(),
            session.get("country_name", "").casefold(),
        )
        if any(needle in hay or hay in needle for hay in haystacks if hay):
            return session
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
```

- [ ] **Step 5: Rewrite `get_recent_race_results` in `backend/tools/fastf1_tools.py`**

Add to the imports:

```python
import logging

from tools.openf1_client import OPENF1_FIRST_YEAR, driver_index, session_results
from tools.openf1_races import find_race_session
from tools.openf1_shaping import race_result_rows

logger = logging.getLogger(__name__)
```

Replace the body of `get_recent_race_results` (currently lines 42-66):

```python
@tool
def get_recent_race_results(event_name: str, year: int) -> dict[str, Any]:
    """Get the most recent race results from this circuit.

    Served by OpenF1 for 2023 onwards and by FastF1 before that. The two paths differ in
    one visible way: ``Status`` is FastF1's own prose ("+1 Lap", "Accident") on the
    FastF1 path but only "Finished"/"DNF"/"DNS"/"DSQ" on the OpenF1 path, because OpenF1
    exposes booleans rather than a reason.

    Args:
        event_name: Name of the Grand Prix event.
        year: Year to look up.

    Returns:
        Dictionary with race results or an 'error' key on failure.
    """
    if year >= OPENF1_FIRST_YEAR:
        try:
            session = find_race_session(year, event_name)
            if session is not None:
                rows = session_results({session["session_key"]})
                if rows:
                    drivers = driver_index({session["session_key"]})
                    return {
                        "year": year,
                        "event": event_name,
                        "results": race_result_rows(rows, drivers)[:10],
                    }
        except Exception as exc:
            logger.warning(
                "OpenF1 lookup for %s %d failed (%s: %s); falling back to FastF1",
                event_name,
                year,
                type(exc).__name__,
                exc,
            )

    try:
        session = load_race_session(year, event_name)

        top_10 = session.results.head(10)[
            ["Position", "DriverNumber", "Abbreviation", "TeamName", "Points", "Status"]
        ]

        return {
            "year": year,
            "event": event_name,
            "results": top_10.to_dict("records"),
        }
    except Exception as exc:
        return {"error": f"Failed to get race results: {exc}"}
```

- [ ] **Step 6: Rewrite `get_recent_top_finishers` in `backend/tools/f1_data_tools.py`**

Add to the imports:

```python
import logging

from tools.openf1_client import OPENF1_FIRST_YEAR, driver_index, session_results
from tools.openf1_races import completed_races
from tools.openf1_shaping import top_finisher_rows

logger = logging.getLogger(__name__)
```

Replace the body of `get_recent_top_finishers` (currently lines 12-54):

```python
@tool
def get_recent_top_finishers(year: int) -> dict[str, Any]:
    """Get the top-10 finishing order of the season's most recent completed race.

    Note: This is a single race's finishing positions, not cumulative championship
    standings — use it as a snapshot of current competitive order. For a real table,
    ``get_championship_standings`` exists.

    Served by OpenF1 for 2023 onwards and by FastF1 before that.

    Args:
        year: Season to query.

    Returns:
        Dictionary with the most recent race's top finishers or an 'error' key on failure.
    """
    note = "Positions from most recent race (not cumulative season standings)"

    if year >= OPENF1_FIRST_YEAR:
        try:
            races = completed_races(year, date.today())
            if not races:
                return {"error": f"No completed races found for {year} season yet"}

            last_race = races[-1]
            rows = session_results({last_race["session_key"]})
            if rows:
                drivers = driver_index({last_race["session_key"]})
                return {
                    "year": year,
                    "last_race": last_race["circuit_short_name"],
                    "top_finishers": top_finisher_rows(rows, drivers)[:10],
                    "note": note,
                }
        except Exception as exc:
            logger.warning(
                "OpenF1 top finishers for %d failed (%s: %s); falling back to FastF1",
                year,
                type(exc).__name__,
                exc,
            )

    try:
        schedule = get_schedule(year)
        today = date.today()
        completed_events = schedule[schedule["EventDate"].dt.date < today]

        if completed_events.empty:
            return {"error": f"No completed races found for {year} season yet"}

        last_event = completed_events.iloc[-1]
        session = load_race_session(year, last_event["EventName"])

        top_finishers = [
            {
                "position": format_position(row["Position"]),
                "driver": row["FullName"],
                "driver_code": row["Abbreviation"],
                "team": row["TeamName"],
                "points": float(row["Points"]),
            }
            for _, row in session.results.head(10).iterrows()
        ]

        return {
            "year": year,
            "last_race": last_event["EventName"],
            "top_finishers": top_finishers,
            "note": note,
        }
    except Exception as exc:
        return {"error": f"Failed to get recent top finishers: {exc}"}
```

Note the `return {"error": f"No completed races found for {year} season yet"}` inside the OpenF1 branch: an in-coverage season that genuinely has not started yet is an answer, not a reason to fall back to FastF1 and download a schedule for the same conclusion.

- [ ] **Step 7: Run the new tests**

```bash
cd backend && .venv/bin/python -m pytest tests/test_openf1_tools.py -v
```

Expected: all PASS.

- [ ] **Step 8: Run the full suite — the old tests are the acceptance criterion**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: all PASS, including `tests/test_fastf1_tools.py` **with no edits to that file**. If anything there fails, the port changed a contract — fix the port, not the test.

- [ ] **Step 9: Lint and commit**

```bash
cd backend && ruff check . && ruff format .
cd .. && git add backend/tools/openf1_races.py backend/tools/fastf1_tools.py \
  backend/tools/f1_data_tools.py backend/tests/test_openf1_tools.py backend/tests/conftest.py
git commit -m "Serve single-race results from OpenF1, falling back to FastF1"
```

---

## Task 4: Port `get_driver_form` and `get_circuit_winners`

The two multi-session tools — the ones that cost ~12s and ~7s today. Both collapse to a single range query.

**Files:**
- Modify: `backend/tools/fastf1_tools.py` (`get_driver_form`, lines 69-124)
- Modify: `backend/tools/f1_data_tools.py` (`get_circuit_winners`, lines 57-100)
- Modify: `backend/tests/test_openf1_tools.py`

**Interfaces:**
- Consumes: `tools.openf1_races.{completed_races, find_race_session}`, `tools.openf1_client.{OPENF1_FIRST_YEAR, session_results, driver_index}`, `tools.openf1_shaping.derive_status`.
- Produces: nothing new.

- [ ] **Step 1: Append the failing tests to `backend/tests/test_openf1_tools.py`**

```python
# ── get_driver_form ──────────────────────────────────────────────────────────


@freeze_time("2024-06-01")
def test_driver_form_aggregates_completed_races_from_openf1(openf1_season, no_fastf1):
    result = get_driver_form.invoke({"driver_code": "VER", "year": 2024, "num_races": 5})

    assert result["driver"] == "VER"
    assert [r["event"] for r in result["recent_results"]] == ["Sakhir", "Miami", "Monte Carlo"]
    assert result["total_points_last_races"] == 68.0
    assert result["average_finish"] == pytest.approx(1.333, abs=0.001)


@freeze_time("2024-06-01")
def test_driver_form_costs_one_results_request_for_every_race(openf1_season, no_fastf1):
    """The headline of the migration. Three races used to be three session loads at
    ~2.4s each; a range query makes it one request. A regression to per-race looping
    would restore the latency and put the tool near OpenF1's 3 req/s ceiling.
    """
    get_driver_form.invoke({"driver_code": "VER", "year": 2024, "num_races": 5})

    result_calls = [c for c in openf1_season.calls if c["url"].endswith("/session_result")]
    assert len(result_calls) == 1


@freeze_time("2024-06-01")
def test_driver_form_excludes_sprints_from_race_form(openf1_season, no_fastf1):
    """Miami's Sprint would otherwise appear as a fourth "race" and drag the average."""
    result = get_driver_form.invoke({"driver_code": "NOR", "year": 2024, "num_races": 5})

    assert len(result["recent_results"]) == 3
    assert result["total_points_last_races"] == 61.0


@freeze_time("2024-06-01")
def test_driver_form_honours_num_races(openf1_season, no_fastf1):
    result = get_driver_form.invoke({"driver_code": "VER", "year": 2024, "num_races": 2})

    assert [r["event"] for r in result["recent_results"]] == ["Miami", "Monte Carlo"]


@freeze_time("2024-06-01")
def test_driver_form_reports_dnfs_and_excludes_them_from_the_average(openf1_season, no_fastf1):
    result = get_driver_form.invoke({"driver_code": "HAM", "year": 2024, "num_races": 5})

    assert [r["position"] for r in result["recent_results"]] == [3, 3, "DNF"]
    assert result["average_finish"] == pytest.approx(3.0)
    assert result["recent_results"][2]["status"] == "DNF"


@freeze_time("2024-06-01")
def test_driver_form_returns_empty_for_an_unknown_driver_code(openf1_season, no_fastf1):
    result = get_driver_form.invoke({"driver_code": "ZZZ", "year": 2024, "num_races": 5})

    assert result["recent_results"] == []
    assert result["average_finish"] is None


@freeze_time(FROZEN_NOW)
def test_driver_form_falls_back_to_fastf1_before_2023(
    monkeypatch, openf1_season, season_2025, race_session
):
    from tools import fastf1_tools

    monkeypatch.setattr(fastf1_tools, "get_schedule", lambda year: season_2025)

    result = get_driver_form.invoke({"driver_code": "VER", "year": 2022})

    assert [r["event"] for r in result["recent_results"]] == [
        "Bahrain Grand Prix",
        "Miami Grand Prix",
    ]
    assert openf1_season.calls == []


# ── get_circuit_winners ──────────────────────────────────────────────────────


@freeze_time("2025-01-15")
def test_circuit_winners_come_from_openf1(openf1_season, no_fastf1):
    """The window from frozen 2025 with years_back=1 is 2024 alone, which the fixture
    covers. Driver 1 won Monaco there.
    """
    result = get_circuit_winners.invoke({"circuit_name": "Monte Carlo", "years_back": 1})

    assert result["circuit"] == "Monte Carlo"
    assert result["recent_winners"] == [
        {
            "year": 2024,
            "driver": "Max VERSTAPPEN",
            "driver_code": "VER",
            "team": "Red Bull Racing",
            "time": "1:00:00",
        }
    ]


@freeze_time("2025-01-15")
def test_circuit_winners_degrade_to_a_note_when_nothing_matches(openf1_season, no_fastf1):
    result = get_circuit_winners.invoke({"circuit_name": "Nürburgring", "years_back": 1})

    assert result == {
        "circuit": "Nürburgring",
        "recent_winners": [{"note": "No recent data available"}],
    }


@freeze_time("2025-01-15")
def test_circuit_winners_use_fastf1_for_the_years_openf1_cannot_cover(
    monkeypatch, openf1_season, fake_get_schedule, race_session
):
    """A years_back window straddling 2023 must draw from both sources rather than
    truncating. This is the case that keeps deep circuit history working.
    """
    from tools import f1_data_tools

    monkeypatch.setattr(f1_data_tools, "get_schedule", fake_get_schedule)

    result = get_circuit_winners.invoke({"circuit_name": "Monte Carlo", "years_back": 4})

    assert [w["year"] for w in result["recent_winners"]] == [2024]
    assert openf1_season.calls, "the in-coverage years should still hit OpenF1"
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_openf1_tools.py -v -k "driver_form or circuit_winners"
```

Expected: FAIL with the `no_fastf1` `AssertionError`, because neither tool has an OpenF1 path yet.

- [ ] **Step 3: Rewrite `get_driver_form` in `backend/tools/fastf1_tools.py`**

Add `from tools.openf1_shaping import derive_status` and `from tools.openf1_races import completed_races` to the imports, then replace `get_driver_form`'s body (currently lines 69-124):

```python
@tool
def get_driver_form(driver_code: str, year: int, num_races: int = 5) -> dict[str, Any]:
    """Get recent form for a specific driver showing their last N race results.

    On the OpenF1 path this is two requests regardless of num_races: one range query
    spanning every wanted session and one for the driver roster. The FastF1 path it
    replaced loaded one session per race at roughly 2.4s each.

    Sprints are excluded — this is race form, and a sprint result on the 8-point scale
    alongside race results on the 25-point scale would distort both the points total and
    the average finish.

    Args:
        driver_code: Three-letter driver abbreviation (e.g., 'VER', 'HAM', 'LEC').
        year: Season to analyse (the pipeline passes historical_year — the last
            completed season for upcoming events).
        num_races: Number of recent races to analyse (default: 5).

    Returns:
        Dictionary with the driver's recent results or an 'error' key on failure.
    """
    if year >= OPENF1_FIRST_YEAR:
        try:
            races = completed_races(year, date.today())[-num_races:]
            keys = {race["session_key"] for race in races}
            if keys:
                drivers = driver_index(keys)
                number = next(
                    (n for n, ident in drivers.items() if ident["name_acronym"] == driver_code),
                    None,
                )
                by_session = {
                    row["session_key"]: row
                    for row in session_results(keys)
                    if row.get("driver_number") == number
                }

                driver_results = []
                total_points = 0.0
                for race in races:
                    row = by_session.get(race["session_key"])
                    if row is None:
                        continue
                    points = float(row.get("points") or 0.0)
                    driver_results.append(
                        {
                            "event": race["circuit_short_name"],
                            "position": format_position(row.get("position") or 0),
                            "points": points,
                            "status": derive_status(row),
                        }
                    )
                    total_points += points

                numeric = [r["position"] for r in driver_results if isinstance(r["position"], int)]
                return {
                    "driver": driver_code,
                    "recent_results": driver_results,
                    "total_points_last_races": total_points,
                    "average_finish": sum(numeric) / len(numeric) if numeric else None,
                }
        except Exception as exc:
            logger.warning(
                "OpenF1 driver form for %s %d failed (%s: %s); falling back to FastF1",
                driver_code,
                year,
                type(exc).__name__,
                exc,
            )

    try:
        schedule = get_schedule(year)
        today = date.today()
        completed_events = schedule[schedule["EventDate"].dt.date < today].tail(num_races)

        driver_results = []
        total_points = 0.0

        for _, event in completed_events.iterrows():
            try:
                session = load_race_session(year, event["EventName"])
                driver_result = session.results[session.results["Abbreviation"] == driver_code]

                if not driver_result.empty:
                    result_data = driver_result.iloc[0]
                    points = float(result_data["Points"])
                    driver_results.append(
                        {
                            "event": event["EventName"],
                            "position": format_position(result_data["Position"]),
                            "points": points,
                            "status": result_data["Status"],
                        }
                    )
                    total_points += points
            except Exception:
                continue

        numeric_positions = [
            r["position"] for r in driver_results if isinstance(r["position"], int)
        ]
        average_finish = (
            sum(numeric_positions) / len(numeric_positions) if numeric_positions else None
        )

        return {
            "driver": driver_code,
            "recent_results": driver_results,
            "total_points_last_races": total_points,
            "average_finish": average_finish,
        }
    except Exception as exc:
        return {"error": f"Failed to get driver form: {exc}"}
```

An unknown `driver_code` yields `number = None`, no matching rows, and an empty
`recent_results` with `average_finish: None` — the same shape the FastF1 path returns for
a driver who did not appear, so the contract holds without a special case.

- [ ] **Step 4: Rewrite `get_circuit_winners` in `backend/tools/f1_data_tools.py`**

Add `from tools.openf1_races import find_race_session` to the imports, then replace `get_circuit_winners`'s body (currently lines 57-100):

```python
@tool
def get_circuit_winners(circuit_name: str, years_back: int = 3) -> dict[str, Any]:
    """Get recent race winners at a specific circuit.

    The lookback window is split by source rather than truncated: years from
    ``OPENF1_FIRST_YEAR`` onwards come from OpenF1 in one request each, earlier years
    from FastF1. A years_back of 5 therefore still reaches back five years, just more
    slowly for the older half.

    Args:
        circuit_name: Name of the circuit/Grand Prix.
        years_back: Number of previous years to look back (default: 3).

    Returns:
        Dictionary with recent winners or an 'error' key on failure.
    """
    try:
        current_year = date.today().year
        winners = []

        for year in range(current_year - years_back, current_year):
            winner = None
            if year >= OPENF1_FIRST_YEAR:
                try:
                    winner = _openf1_circuit_winner(circuit_name, year)
                except Exception as exc:
                    logger.warning(
                        "OpenF1 winner lookup for %s %d failed (%s: %s); falling back to FastF1",
                        circuit_name,
                        year,
                        type(exc).__name__,
                        exc,
                    )
            if winner is None:
                winner = _fastf1_circuit_winner(circuit_name, year)
            if winner is not None:
                winners.append(winner)

        return {
            "circuit": circuit_name,
            "recent_winners": winners if winners else [{"note": "No recent data available"}],
        }
    except Exception as exc:
        return {"error": f"Failed to get circuit winners: {exc}"}


def _openf1_circuit_winner(circuit_name: str, year: int) -> dict[str, Any] | None:
    """Return the OpenF1 winner row for one circuit-year, or None if unavailable."""
    session = find_race_session(year, circuit_name)
    if session is None:
        return None

    key = session["session_key"]
    winner = next((row for row in session_results({key}) if row.get("position") == 1), None)
    if winner is None:
        return None

    identity = driver_index({key}).get(winner.get("driver_number"), {})
    return {
        "year": year,
        "driver": identity.get("full_name", ""),
        "driver_code": identity.get("name_acronym", ""),
        "team": identity.get("team_name", ""),
        # OpenF1 gives race duration in seconds; the FastF1 path gives an H:MM:SS string,
        # so format to match rather than handing the LLM two different units.
        "time": _format_duration(winner.get("duration")),
    }


def _format_duration(seconds: float | None) -> str:
    """Render a race duration in seconds as H:MM:SS, or '' when absent."""
    if not seconds:
        return ""
    total = int(seconds)
    return f"{total // 3600}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def _fastf1_circuit_winner(circuit_name: str, year: int) -> dict[str, Any] | None:
    """Return the FastF1 winner row for one circuit-year, or None if unavailable.

    A dead year is skipped rather than fatal — the caller is collecting a window, and one
    missing season should not cost the others.
    """
    try:
        schedule = get_schedule(year)
        event_data = find_event(schedule, circuit_name)
        if event_data is None:
            return None

        session = load_race_session(year, event_data["EventName"])
        winner = session.results[session.results["Position"] == 1]
        if winner.empty:
            return None

        winner_data = winner.iloc[0]
        return {
            "year": year,
            "driver": winner_data["FullName"],
            "driver_code": winner_data["Abbreviation"],
            "team": winner_data["TeamName"],
            "time": str(winner_data["Time"]),
        }
    except Exception:
        return None
```

The conftest fixture from Task 3 already gives session 9600's winner `duration=3600.0`, which is what makes the test's expected `"1:00:00"` hold. No fixture change is needed here.

- [ ] **Step 5: Run the new tests**

```bash
cd backend && .venv/bin/python -m pytest tests/test_openf1_tools.py -v
```

Expected: all PASS.

- [ ] **Step 6: Run the full suite**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: all PASS, `tests/test_fastf1_tools.py` still unedited.

- [ ] **Step 7: Lint and commit**

```bash
cd backend && ruff check . && ruff format .
cd .. && git add backend/tools/fastf1_tools.py backend/tools/f1_data_tools.py \
  backend/tests/test_openf1_tools.py backend/tests/conftest.py
git commit -m "Collapse driver form and circuit winners to range queries"
```

---

## Task 5: `get_championship_standings`

**Files:**
- Create: `backend/tools/standings_tools.py`
- Create: `backend/tests/test_standings_tools.py`

**Interfaces:**
- Consumes: `tools.openf1_client.{OPENF1_FIRST_YEAR, session_results, driver_index}`, `tools.openf1_races.scoring_sessions`.
- Produces: `get_championship_standings` — a LangChain `@tool` whose `.name` is `"get_championship_standings"`, taking `year: int`, returning
  `{"year": int, "races_completed": int, "drivers": [{"position", "driver", "driver_code", "team", "points"}], "constructors": [{"position", "team", "points"}]}`
  or `{"error": str}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_standings_tools.py`:

```python
"""Tests for the derived championship standings tool.

OpenF1's own ``drivers_championship`` and ``teams_championship`` endpoints return
``{"detail": "No results found."}`` without authentication, so the table is summed from
``session_result.points`` instead. Three properties of that derivation are easy to get
wrong and each has a test below: sprints score on a different scale but still count,
qualifying must not count, and a team on zero points must still appear.
"""

import pytest
from freezegun import freeze_time

from tools.standings_tools import get_championship_standings


@freeze_time("2024-06-01")
def test_drivers_table_sums_races_and_sprints(openf1_season):
    """VER: 25 (Sakhir) + 7 (Miami sprint) + 18 (Miami) + 25 (Monaco) = 75.
    NOR: 18 + 8 (sprint) + 25 + 18 = 69.
    """
    result = get_championship_standings.invoke({"year": 2024})

    points = {row["driver_code"]: row["points"] for row in result["drivers"]}
    assert points["VER"] == 75.0
    assert points["NOR"] == 69.0


@freeze_time("2024-06-01")
def test_sprint_points_are_included(openf1_season):
    """The 8/7 sprint scale is real points. Dropping them undercounts a sprint weekend."""
    result = get_championship_standings.invoke({"year": 2024})

    points = {row["driver_code"]: row["points"] for row in result["drivers"]}
    # Without the Miami sprint's 8 points NOR would sit on 61, behind HAM's 30 by less.
    assert points["NOR"] == 69.0


@freeze_time("2024-06-01")
def test_qualifying_is_excluded(openf1_season):
    """Session 9511 is a Qualifying with a P1 for driver 1 and no points key at all.

    Filtering on session_name rather than on the presence of points is what makes this
    safe the day OpenF1 starts returning points: 0 for qualifying rows.
    """
    result = get_championship_standings.invoke({"year": 2024})

    assert result["races_completed"] == 3
    assert {row["driver_code"] for row in result["drivers"]} == {
        "VER",
        "NOR",
        "HAM",
        "TIE",
        "ZER",
    }


@freeze_time("2024-06-01")
def test_a_scoreless_team_still_appears(openf1_season):
    """Driver 50 / Cadillac scores nothing all season. Summing points alone drops them,
    which is how a real 11-team grid renders as 10 teams.
    """
    result = get_championship_standings.invoke({"year": 2024})

    cadillac = [row for row in result["constructors"] if row["team"] == "Cadillac"]
    assert cadillac == [{"position": 5, "team": "Cadillac", "points": 0.0}]


@freeze_time("2024-06-01")
def test_a_scoreless_driver_still_appears(openf1_season):
    result = get_championship_standings.invoke({"year": 2024})

    scoreless = [row for row in result["drivers"] if row["driver_code"] == "ZER"]
    assert scoreless[0]["points"] == 0.0


@freeze_time("2024-06-01")
def test_positions_are_dense_and_start_at_one(openf1_season):
    result = get_championship_standings.invoke({"year": 2024})

    assert [row["position"] for row in result["drivers"]] == [1, 2, 3, 4, 5]
    assert [row["position"] for row in result["constructors"]] == [1, 2, 3, 4, 5]


@freeze_time("2024-06-01")
def test_constructors_sum_every_car_in_a_team(openf1_season):
    """Each fixture team fields one driver, so these pin the aggregation mechanism rather
    than asserting an arithmetic coincidence between two cars.
    """
    result = get_championship_standings.invoke({"year": 2024})

    teams = {row["team"]: row["points"] for row in result["constructors"]}
    assert teams["Red Bull Racing"] == 75.0
    assert teams["McLaren"] == 69.0
    assert teams["Ferrari"] == 30.0
    assert teams["Williams"] == 30.0


@freeze_time("2024-06-01")
def test_a_driver_tie_breaks_on_best_finishing_position(openf1_season):
    """HAM and TIE both finish the season on 30.0. HAM's best result is a P3 and TIE's a
    P4, so HAM must rank ahead. Sorting on points alone would leave the pair's order down
    to dict iteration, and an LLM reading a reshuffling table reports a different
    championship every time it is asked.
    """
    result = get_championship_standings.invoke({"year": 2024})

    tied = [row for row in result["drivers"] if row["points"] == 30.0]
    assert [row["driver_code"] for row in tied] == ["HAM", "TIE"]
    assert [row["position"] for row in tied] == [3, 4]


@freeze_time("2024-06-01")
def test_a_constructor_tie_breaks_alphabetically(openf1_season):
    """Ferrari and Williams both finish on 30.0. Neither has a driver-level tiebreak to
    inherit, so the team name decides and the order is stable.
    """
    result = get_championship_standings.invoke({"year": 2024})

    tied = [row for row in result["constructors"] if row["points"] == 30.0]
    assert [row["team"] for row in tied] == ["Ferrari", "Williams"]


def test_a_year_before_coverage_is_an_error():
    """No FastF1 fallback: FastF1 has no standings source either, which is the whole
    reason this tool did not exist before.
    """
    result = get_championship_standings.invoke({"year": 2022})

    assert result == {"error": "Championship standings are only available from 2023 onwards."}


@freeze_time("2024-01-15")
def test_a_season_with_no_completed_races_is_an_error(openf1_season):
    result = get_championship_standings.invoke({"year": 2024})

    assert result == {"error": "No completed races found for 2024 season yet"}


def test_a_transport_failure_becomes_an_error_not_a_raise():
    """conftest's autouse fixture blocks OpenF1, so this is the unpatched default."""
    result = get_championship_standings.invoke({"year": 2024})

    assert "error" in result


@freeze_time("2024-06-01")
def test_the_whole_table_costs_three_requests(openf1_season):
    """One sessions fetch per session_name, one range query for results, one for drivers.
    Per-race looping would put a 24-race season over OpenF1's 30 req/min ceiling.
    """
    get_championship_standings.invoke({"year": 2024})

    assert len(openf1_season.calls) <= 4
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_standings_tools.py -v
```

Expected: collection error — `ModuleNotFoundError: No module named 'tools.standings_tools'`.

- [ ] **Step 3: Write the tool**

Create `backend/tools/standings_tools.py`:

```python
"""Derived championship standings — the one tool with no FastF1 equivalent.

``SYNTHESIZER_PROMPT`` has always asked for a "Championship Context" section citing
current standings, and until now no tool supplied one: FastF1 exposes per-session
classification, not a cumulative table, and OpenF1's own ``drivers_championship`` and
``teams_championship`` endpoints return ``{"detail": "No results found."}`` without a
paid subscription. So the table is summed here from per-session points.

If OpenF1 authentication is ever added, those endpoints replace this module wholesale.
"""

import logging
from datetime import date
from typing import Any

from langchain_core.tools import tool

from tools.openf1_client import OPENF1_FIRST_YEAR, driver_index, session_results
from tools.openf1_races import scoring_sessions

logger = logging.getLogger(__name__)


@tool
def get_championship_standings(year: int) -> dict[str, Any]:
    """Get the driver and constructor championship tables for a season.

    Points are summed across every completed Race and Sprint session. Only 2023 onwards
    is available, which is where OpenF1's coverage begins.

    Args:
        year: Season to query.

    Returns:
        Dictionary with 'drivers' and 'constructors' tables and 'races_completed', or an
        'error' key on failure.
    """
    if year < OPENF1_FIRST_YEAR:
        return {
            "error": f"Championship standings are only available from {OPENF1_FIRST_YEAR} onwards."
        }

    try:
        today = date.today()
        sessions = [
            session
            for session in scoring_sessions(year)
            if date.fromisoformat(session["date_start"][:10]) < today
        ]
        if not sessions:
            return {"error": f"No completed races found for {year} season yet"}

        keys = {session["session_key"] for session in sessions}
        drivers = driver_index(keys)
        rows = session_results(keys)

        # Seeded from the roster rather than from the results, so a driver — and
        # therefore a team — who has scored nothing all season still appears. Without
        # this a real 11-team grid renders as 10 teams the moment one of them is on zero.
        points: dict[int, float] = dict.fromkeys(drivers, 0.0)
        best_position: dict[int, int] = {}

        for row in rows:
            number = row.get("driver_number")
            if number not in points:
                continue
            points[number] += float(row.get("points") or 0.0)
            position = row.get("position")
            if isinstance(position, int) and position > 0:
                best_position[number] = min(best_position.get(number, position), position)

        # Ties break on best finishing position, then on driver number. Points alone
        # would let two equal drivers swap places between runs, and an LLM reading a
        # reshuffling table reports a different championship each time it is asked.
        def _driver_sort_key(number: int) -> tuple[float, int, int]:
            return (-points[number], best_position.get(number, 99), number)

        driver_table = [
            {
                "position": rank,
                "driver": drivers[number]["full_name"],
                "driver_code": drivers[number]["name_acronym"],
                "team": drivers[number]["team_name"],
                "points": points[number],
            }
            for rank, number in enumerate(sorted(points, key=_driver_sort_key), start=1)
        ]

        team_points: dict[str, float] = {}
        for number, identity in drivers.items():
            team = identity["team_name"]
            team_points[team] = team_points.get(team, 0.0) + points[number]

        constructor_table = [
            {"position": rank, "team": team, "points": team_points[team]}
            for rank, team in enumerate(
                sorted(team_points, key=lambda t: (-team_points[t], t)), start=1
            )
        ]

        races_completed = sum(1 for s in sessions if s["session_name"] == "Race")
        logger.info(
            "Standings for %d: %d drivers, %d constructors, %d races",
            year,
            len(driver_table),
            len(constructor_table),
            races_completed,
        )

        return {
            "year": year,
            "races_completed": races_completed,
            "drivers": driver_table,
            "constructors": constructor_table,
        }
    except Exception as exc:
        return {"error": f"Failed to get championship standings: {exc}"}
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && .venv/bin/python -m pytest tests/test_standings_tools.py -v
```

Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
cd backend && ruff check . && ruff format .
cd .. && git add backend/tools/standings_tools.py backend/tests/test_standings_tools.py
git commit -m "Derive championship standings from per-session points"
```

---

## Task 6: Wire the standings tool into the agent

**Files:**
- Modify: `backend/agent/graph.py` (`all_tools` lines 29-37, `_invoke_tool` lines 154-191)
- Modify: `backend/agent/prompts.py` (`PLANNER_PROMPT` lines 10-17, `DEFAULT_TOOLS` lines 58-64)
- Modify: `backend/tests/agent/test_graph.py`

**Interfaces:**
- Consumes: `tools.standings_tools.get_championship_standings` from Task 5.
- Produces: `"get_championship_standings"` as a valid planner task string.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/agent/test_graph.py`:

```python
def test_standings_is_a_registered_tool():
    from agent.graph import all_tools

    assert "get_championship_standings" in {tool.name for tool in all_tools}


def test_standings_is_in_the_default_tools():
    """The synthesizer prompt asks for a Championship Context section unconditionally, so
    the degraded path — a 429'd planner falling back to DEFAULT_TOOLS — needs it too.
    """
    from agent.prompts import DEFAULT_TOOLS

    assert "get_championship_standings" in DEFAULT_TOOLS


def test_the_planner_prompt_advertises_every_registered_tool():
    """A tool the planner is never told about is a tool the planner cannot select."""
    from agent.graph import all_tools
    from agent.prompts import PLANNER_PROMPT

    for tool in all_tools:
        assert tool.name in PLANNER_PROMPT


def test_standings_is_invoked_with_the_historical_year():
    """Same year the other historical tools get. Passing race_info["year"] would ask for
    standings from a season that has not been run yet on an upcoming race.
    """
    from agent.graph import _invoke_tool
    from tests.factories import make_race_info, make_tool

    fake = make_tool("get_championship_standings", {"drivers": []})
    race_info = make_race_info(year=2026, historical_year=2025)

    _invoke_tool(fake, "get_championship_standings", race_info)

    assert fake.calls == [{"year": 2025}]
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend && .venv/bin/python -m pytest tests/agent/test_graph.py -v -k standings
```

Expected: 4 FAILs.

- [ ] **Step 3: Register the tool in `backend/agent/graph.py`**

Add the import beside the other tool imports:

```python
from tools.standings_tools import get_championship_standings
```

Add to `all_tools`, after `get_recent_top_finishers`:

```python
    get_championship_standings,
```

Add a branch in `_invoke_tool`, after the `get_recent_top_finishers` branch:

```python
        elif task_name == "get_championship_standings":
            result = tool.invoke({"year": race_info["historical_year"]})
```

- [ ] **Step 4: Update `backend/agent/prompts.py`**

In `PLANNER_PROMPT`'s tool list, after the `get_recent_top_finishers` line:

```
- get_championship_standings: Driver and constructor championship tables for the season
```

In `DEFAULT_TOOLS`, after `"get_recent_top_finishers"`:

```python
    "get_championship_standings",
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && .venv/bin/python -m pytest tests/agent/test_graph.py -v
```

Expected: all PASS.

- [ ] **Step 6: Run the full suite**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: all PASS. Watch `tests/api/test_routes.py` in particular — adding a tool to `DEFAULT_TOOLS` changes how many `tool_result` SSE events a default run emits, and a route test asserting an exact count will fail. If one does, that is a genuine contract change: update the expected count in `test_routes.py`, and regenerate the frontend fixtures in Task 8.

- [ ] **Step 7: Lint and commit**

```bash
cd backend && ruff check . && ruff format .
cd .. && git add backend/agent/graph.py backend/agent/prompts.py backend/tests/agent/test_graph.py
git commit -m "Offer championship standings to the planner"
```

---

## Task 7: `GET /api/standings/{year}`

**Files:**
- Modify: `backend/api/routes.py` (after `get_races`, around line 220)
- Modify: `backend/api/errors.py`
- Modify: `backend/tests/api/test_routes.py`

**Interfaces:**
- Consumes: `tools.standings_tools.get_championship_standings`, `tools.openf1_client.OPENF1_FIRST_YEAR`.
- Produces: `GET /api/standings/{year}` → 200 with the tool payload, 422 for an out-of-range year, 502 on an upstream failure.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/api/test_routes.py`:

```python
def test_standings_returns_the_tool_payload(client, monkeypatch):
    from api import routes

    payload = {
        "year": 2026,
        "races_completed": 13,
        "drivers": [{"position": 1, "driver": "A B", "driver_code": "ABC", "team": "T", "points": 219.0}],
        "constructors": [{"position": 1, "team": "T", "points": 379.0}],
    }
    monkeypatch.setattr(
        routes.get_championship_standings, "invoke", lambda args: payload
    )

    response = client.get("/api/standings/2026")

    assert response.status_code == 200
    assert response.json() == payload


def test_standings_rejects_a_year_before_coverage(client):
    """422 from the Path bound, before any handler code runs — the year is user input
    and the boundary is the cheapest place to reject it.
    """
    response = client.get("/api/standings/2022")

    assert response.status_code == 422


def test_standings_replaces_a_tool_error_with_a_generic_502(client, monkeypatch):
    """A tool-level {"error": ...} may carry upstream exception text. It is logged, not
    served — the same rule api/errors.py exists to enforce for every other route.
    """
    from api import routes

    monkeypatch.setattr(
        routes.get_championship_standings,
        "invoke",
        lambda args: {"error": "OpenF1 session_result returned HTTP 503"},
    )

    response = client.get("/api/standings/2026")

    assert response.status_code == 502
    assert "503" not in response.text
    assert response.json()["detail"] == routes.GENERIC_STANDINGS_ERROR
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_routes.py -v -k standings
```

Expected: 3 FAILs — 404 on the route, and an `AttributeError` for `GENERIC_STANDINGS_ERROR`.

- [ ] **Step 3: Add the error constant to `backend/api/errors.py`**

```python
GENERIC_STANDINGS_ERROR: str = "Could not load the championship standings. Please try again."
```

The module docstring's "Three constants rather than one" line is now wrong — change it to "Four constants rather than one".

- [ ] **Step 4: Add the route to `backend/api/routes.py`**

Extend the `api.errors` import with `GENERIC_STANDINGS_ERROR`, and add:

```python
from tools.openf1_client import OPENF1_FIRST_YEAR
from tools.standings_tools import get_championship_standings
```

Then, after `get_races`:

```python
@router.get("/standings/{year}")
async def get_standings(
    year: int = Path(ge=OPENF1_FIRST_YEAR, le=date.today().year),
) -> dict[str, Any]:
    """Get the driver and constructor championship tables for a season.

    The lower bound is ``OPENF1_FIRST_YEAR`` rather than a literal, so the route and the
    tool cannot disagree about where coverage starts.
    """
    result = await asyncio.to_thread(get_championship_standings.invoke, {"year": year})

    if "error" in result:
        # The tool's error text can carry upstream exception detail, which is neither
        # actionable nor safe to show. Log it, serve the fixed copy.
        logger.warning("Standings for %d unavailable: %s", year, result["error"])
        raise HTTPException(status_code=502, detail=GENERIC_STANDINGS_ERROR)

    return result
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_routes.py -v
```

Expected: all PASS.

- [ ] **Step 6: Lint and commit**

```bash
cd backend && ruff check . && ruff format .
cd .. && git add backend/api/routes.py backend/api/errors.py backend/tests/api/test_routes.py
git commit -m "Serve championship standings over the API"
```

---

## Task 8: Regenerate the SSE fixtures and update the docs

`DEFAULT_TOOLS` grew, so a default run emits one more `tool_result` event. The frontend's `.sse` fixtures are real captured bytes from this route and now under-describe it.

**Files:**
- Modify: `frontend/tests/fixtures/*.sse` (regenerated, never hand-edited)
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-06-openf1-migration-design.md`

- [ ] **Step 1: Check whether the fixtures actually changed**

```bash
cd backend && .venv/bin/python scripts/dump_sse_fixtures.py
cd .. && git diff --stat frontend/tests/fixtures/
```

If the diff is empty the fixtures do not encode the tool list and this step is done — skip to Step 3. If it is non-empty, continue.

- [ ] **Step 2: Verify the frontend still parses them**

```bash
cd frontend && mise exec -- pnpm test
```

Expected: PASS. If a parser test fails, the fixture change surfaced a real gap in the frontend's `StreamEvent` handling — fix the frontend, never the `.sse` bytes.

- [ ] **Step 3: Update `CLAUDE.md`**

Under **Key technical details**, replace the "FastF1 session loads hit the network every time" paragraph with:

```markdown
**FastF1 session loads hit the network every time, cache or no cache — which is why
classification data no longer comes from them.** `backend/cache/` (gitignored) never gets
populated: FastF1 only persists a session that loaded cleanly, and these loads never do
(`Failed to load session info data!` on every call), so warming it achieves nothing. The
four result tools now read OpenF1 instead — one range query rather than one 2.4s session
load per race. FastF1 remains the **schedule** source (`get_event_schedule` is 0.16s,
works, and reaches back to 1950) and the fallback for pre-2023 seasons.

**OpenF1 coverage starts in 2023, and `OPENF1_FIRST_YEAR` is the only place that number
lives.** Every result tool tries OpenF1 first and falls through to its `load_race_session`
path for an earlier year or a transport failure, so `get_circuit_winners(years_back=5)`
still reaches five years back — the older half is just slower. The visible cost of the
OpenF1 path is `Status`: FastF1 reports *why* a car stopped ("+1 Lap", "Accident"),
OpenF1 exposes only `dnf`/`dns`/`dsq`, so `derive_status()` collapses it to
`Finished`/`DNF`/`DNS`/`DSQ`.

**Standings are derived, not fetched.** OpenF1's `drivers_championship` and
`teams_championship` endpoints return `{"detail": "No results found."}` without a paid
subscription, so `get_championship_standings` sums `session_result.points` across Race
**and Sprint** sessions. Two traps live in that derivation: sprints score on the 8/7/6
scale and must be included, and the table is seeded from the driver roster rather than
from the results — otherwise a team on zero points (Cadillac, 2026) vanishes and an
11-team grid renders as 10.

**`tests/conftest.py` blocks OpenF1 as well as FastF1, and the two differ on purpose.**
`_block_fastf1_network` raises `AssertionError` because no production path should swallow
one. `_block_openf1_network` raises `requests.ConnectionError` because the tools *do*
handle that — it is the FastF1 fallback — and that is what lets `test_fastf1_tools.py`
keep testing the FastF1 path unedited. The consequence is that the fallback is the
default under test, so `test_openf1_tools.py` asserts the OpenF1 request is genuinely
made rather than silently fallen through.
```

In the `tools/` is not uniform paragraph, update the counts: eight `@tool` functions across five modules (`fastf1_tools`, `f1_data_tools`, `search_tools`, `weather_tools`, `standings_tools`), and add `openf1_client.py`, `openf1_races.py`, and `openf1_shaping.py` to the list of plain helpers.

Add `GET /api/standings/{year}` to the endpoint list in `README.md`.

- [ ] **Step 4: Mark the spec implemented**

Change the spec's `**Status:**` line to `Implemented — see docs/superpowers/plans/2026-08-06-openf1-results-migration.md`.

- [ ] **Step 5: Full verification**

```bash
cd backend && ruff check . && ruff format --check . && .venv/bin/python -m pytest -q
cd ../frontend && mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint
```

Expected: all PASS. Do **not** run `pnpm build` if a dev server is running — the shared `.next` directory breaks the live server with `MODULE_NOT_FOUND`.

- [ ] **Step 6: End-to-end against the live API**

With `backend/.env` populated, start the server and check both the new endpoint and the latency claim:

```bash
curl -s localhost:8000/api/standings/2026 | python3 -m json.tool | head -30
```

Expected: 11 constructors, Cadillac present at 0.0 points, positions 1..11 dense.

```bash
time curl -s -X POST localhost:8000/api/briefing \
  -H 'Content-Type: application/json' -d '{"race_query": "Zandvoort"}' | head -c 400
```

Expected: measurably faster than `main`, and a `## Championship Context` section citing real points gaps rather than one race's finishing order. Record both timings in the commit message.

Then check the fallback by hand, since no live test covers it:

```bash
cd backend && .venv/bin/python -c "
from tools.f1_data_tools import get_circuit_winners
r = get_circuit_winners.invoke({'circuit_name': 'Monaco', 'years_back': 5})
for w in r['recent_winners']: print(w)"
```

Expected: five years of winners — 2021 and 2022 from FastF1, 2023–2025 from OpenF1.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md docs/superpowers/specs/2026-08-06-openf1-migration-design.md
git add frontend/tests/fixtures/
git commit -m "Document the OpenF1 migration and its test seam"
```

---

## Self-review

**Spec coverage.** Every section of the spec maps to a task: the client and its cache → Task 1; `Status` derivation → Task 2; the four ported tools with their pre-2023 and transport fallbacks → Tasks 3–4; `get_championship_standings` with sprint inclusion, quali exclusion, zero-fill and stable ties → Task 5; agent wiring including keeping the `"note"` → Task 6; `GET /api/standings/{year}` → Task 7; docs → Task 8. The spec's "explicitly not changing" table is honoured — no task touches `race_resolver.py`, `weather_tools.py`, `search_tools.py`, or `get_track_info`.

**One thing the spec got wrong, corrected here.** The spec called for `session_results` and `driver_index` to live in `openf1_client.py` and for the tools to consume them directly. Writing out Tasks 3–5 showed all four tools plus the standings tool needed the same "which sessions count as races" logic, so `openf1_races.py` was added — otherwise `scoring_sessions`' session_name-over-points-presence reasoning would have been duplicated in five places.

**Two things the spec did not anticipate, both resolved in-plan.** The autouse OpenF1 test seam (documented at the top of this plan) and the `DEFAULT_TOOLS` growth invalidating the frontend `.sse` fixtures (Task 8, Step 1).

**Type consistency.** `derive_status`, `race_result_rows`, `top_finisher_rows`, `find_race_session`, `completed_races`, `scoring_sessions`, `list_sessions`, `session_results`, `driver_index`, `clear`, `OPENF1_FIRST_YEAR`, `OpenF1Error`, `make_openf1_get`, `GENERIC_STANDINGS_ERROR` are each defined in one task and referenced with the same name and signature everywhere after. `driver_index` returns `dict[int, dict[str, str]]` keyed on `driver_number` in Task 1 and is consumed that way in Tasks 2–5. `session_results` takes `set[int]` throughout.

**Known risk, flagged not fixed.** `find_race_session` matches on `circuit_short_name` and `country_name` with a bidirectional substring test, so `_invoke_tool`'s FastF1 EventName ("Belgian Grand Prix") reaches an OpenF1 circuit ("Spa-Francorchamps") only via the country. Some events will miss and fall back to FastF1 — correct, just slower. The spec's Bahrain / Kuala Lumpur double-match is the same class of problem and is explicitly out of scope. If misses turn out to be common, an alias map belongs in `openf1_races.py` as a follow-up, not in this branch.
