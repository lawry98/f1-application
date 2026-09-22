# Championship Standings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/standings`, rendering the drivers' and constructors' championship tables from `GET /api/standings/{year}` for every season since 2023, after correcting the backend's race count and its pre-season response.

**Architecture:** Two backend fixes come first:
- the standings tool counts a session only once it has produced results;
- the route answers a season that has not started with a 200 and empty tables.

The frontend then follows the repo's existing layering: wire types in `types/`, a typed fetcher in `lib/api.ts`, pure helpers in `lib/standings.ts`, and one data hook. The pages split into a server component (`app/standings/page.tsx`, which reads `?year=` and the clock) and a client component (year state, URL sync, loading/error/pre-season states). The tables are presentation-only. Team colour appears only as a decorative bar.

**Tech Stack:**
- Backend: FastAPI, LangChain `@tool`, pytest + freezegun, ruff.
- Frontend: Next.js 14.2 App Router, React 18, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind 3.4, Vitest + React Testing Library (jsdom), pnpm 11 via mise.

**Spec:** `docs/superpowers/specs/2026-09-22-standings-page-design.md`. Read it before starting; this plan argues from it.

## Global Constraints

- **Frontend package manager:** pnpm only, always as `mise exec -- pnpm …` from `frontend/`. Never npm. Delete any `package-lock.json` that appears.
- **Backend:** runs from `backend/` with the venv at `backend/.venv` (e.g. `.venv/bin/pytest`, `.venv/bin/ruff`). Ruff line length is 100.
- **Files:** kebab-case filenames and named exports. Only `app/**/page.tsx` default-exports.
- **Wire types** mirror the backend exactly, in snake_case (`races_completed`, `driver_code`), like `RaceInfo`.
- **Row order:** standings rows render in served order. Never sort them client-side.
- **Team colour on `/standings` is decorative only:**
  - a 4px bar in the true `TEAMS` hex;
  - never applied to text;
  - no fill on any table element (no zebra, no hover tint, no leader highlight).
- **Contrast:** text neutrals are `text-zinc-200` / `text-zinc-300` / `text-zinc-400` (all in `tests/zinc.ts`'s `ZINC` map). `text-zinc-500` fails 4.5:1 and must not carry text.
- **Never write `sm:text-base`:** in this theme it is a *colour* (`#09090b`). Use `sm:text-[1rem]` if a breakpoint body size is needed.
- **No class strings in `hooks/` or `data/`:** Tailwind's `content` only scans `components/`, `app/`, `lib/`.
- **Focus rings** come from `lib/focus.ts`:
  - filled controls (the select, buttons) use `focusRingOffsetBase`;
  - text links use `focusRing`.
- **TypeScript and lint:** no non-null assertions (`!`) and no array-index keys (`react/no-array-index-key`). `noUncheckedIndexedAccess` is on, so guard every index access.
- **No top-level `await` in tests:** it fails `pnpm typecheck` with TS1378. Use a hoisted `vi.mock` plus a static import.
- **JSON fixtures in `frontend/tests/fixtures/` are captured from the running routes and never hand-edited.**
- **The backend never leaks a tool's error text to the client.** `SEASON_NOT_STARTED` is the one error served as a 200.
- **Commits** follow the repo's conventional style: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `docs(scope): …`.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `backend/tools/standings_tools.py` | modify | Count held sessions; no held session means `SEASON_NOT_STARTED` |
| `backend/tests/test_standings_tools.py` | modify | Cancelled-race and nothing-held tests |
| `backend/api/routes.py` | modify | `SEASON_NOT_STARTED` becomes 200 with empty tables |
| `backend/tests/api/test_routes.py` | modify | Route test for the 200 |
| `frontend/types/f1.ts` | modify | `DriverStanding`, `ConstructorStanding` |
| `frontend/types/api.ts` | modify | `StandingsResponse` |
| `frontend/lib/api.ts` | modify | `getStandings(year)` |
| `frontend/tests/fixtures/standings-2026.json`, `standings-2024.json`, `races-2026.json` | create | Captured payloads |
| `frontend/tests/fixtures/README.md` | modify | Provenance of the JSON fixtures |
| `frontend/tests/api.test.ts` | modify | `getStandings` tests |
| `frontend/lib/standings.ts` | create | Season range, `?year=` parsing, team join, name formatting, stamp |
| `frontend/tests/standings.test.ts` | create | Helper tests, including the backend drift guard |
| `frontend/hooks/use-standings.ts` | create | Fetch the table and its calendar per season |
| `frontend/tests/use-standings.test.ts` | create | Hook tests |
| `frontend/components/standings/standings-tables.tsx` | create | `DriverStandingsTable`, `ConstructorStandingsTable` |
| `frontend/tests/standings-tables.test.tsx` | create | Table tests, including the colour guards |
| `frontend/components/standings/season-select.tsx` | create | Native season `<select>` |
| `frontend/components/standings/standings-page-client.tsx` | create | Year state, URL sync, header, states, sections |
| `frontend/tests/standings-page-client.test.tsx` | create | Page-client tests |
| `frontend/app/standings/page.tsx` | create | Server page: metadata, `searchParams`, clock, nav |
| `frontend/tests/standings-page.test.tsx` | create | `?year=` wiring |
| `frontend/components/landing/links.ts` | modify | Add Standings before Teams |
| `frontend/components/landing/landing-nav.tsx` | modify | Comments: six links become seven |
| `frontend/tests/landing-nav.test.tsx` | modify | `DESTINATIONS` gains Standings |
| `frontend/components/teams/teams-comparison-grid.tsx` | modify | "Live standings →" link |
| `frontend/tests/teams-comparison-grid.test.tsx` | modify | Link test |
| `CLAUDE.md`, `README.md` | modify | Traps, invariants, route row |

---

### Task 1: The standings tool counts only sessions that produced results

**Files:**
- Modify: `backend/tools/standings_tools.py`
- Test: `backend/tests/test_standings_tools.py`
- Modify: `CLAUDE.md` (a new paragraph after "Standings are derived, not fetched.")

**Interfaces:**
- Consumes: nothing new.
- Produces: `get_championship_standings` keeps its return shape. Two things change:
  - `races_completed` now counts only Race sessions with at least one result row;
  - a season whose past sessions have no results returns `{"error": ..., "reason": SEASON_NOT_STARTED}`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_standings_tools.py`:

```python
# A race that is on the calendar, dated in the past, and never ran. OpenF1 keeps the session
# and its entry list but serves no result rows for it — the shape Imola 2023 and Bahrain and
# Saudi Arabia 2026 really have. 9801 is that race; 9800 is one that ran.
_CANCELLED_SESSIONS = [
    {
        "session_key": 9800,
        "meeting_key": 1400,
        "session_name": "Race",
        "circuit_short_name": "Sakhir",
        "country_name": "Bahrain",
        "date_start": "2024-03-02T15:00:00+00:00",
    },
    {
        "session_key": 9801,
        "meeting_key": 1401,
        "session_name": "Race",
        "circuit_short_name": "Imola",
        "country_name": "Italy",
        "date_start": "2024-05-19T13:00:00+00:00",
    },
]

_CANCELLED_DRIVERS = [
    {
        "session_key": key,
        "driver_number": 1,
        "full_name": "Max VERSTAPPEN",
        "name_acronym": "VER",
        "team_name": "Red Bull Racing",
    }
    for key in (9800, 9801)
]

_CANCELLED_RESULTS = [
    {
        "session_key": 9800,
        "position": 1,
        "driver_number": 1,
        "points": 25.0,
        "dnf": False,
        "dns": False,
        "dsq": False,
    },
]


def _serve_cancelled_season(monkeypatch, results):
    from tests.factories import make_openf1_get
    from tools import openf1_client

    fake = make_openf1_get(
        {
            "sessions": _CANCELLED_SESSIONS,
            "session_result": results,
            "drivers": _CANCELLED_DRIVERS,
        }
    )
    monkeypatch.setattr(openf1_client.requests, "get", fake)
    return fake


@freeze_time("2024-06-01")
def test_a_race_with_no_results_is_not_counted_as_completed(monkeypatch):
    """Both races are dated before today; only one produced a classification.

    Counting by date reports 2 here — the bug that had the real 2026 table claiming 16 races
    completed when 14 had run, and 2023 claiming 23 of FastF1's 22 rounds.
    """
    _serve_cancelled_season(monkeypatch, _CANCELLED_RESULTS)

    result = get_championship_standings.invoke({"year": 2024})

    assert result["races_completed"] == 1
    # An empty race adds no points, so the table itself was never wrong — only the count.
    assert result["drivers"][0]["points"] == 25.0


@freeze_time("2024-06-01")
def test_a_season_whose_past_sessions_have_no_results_has_not_started(monkeypatch):
    """Every past session was cancelled, or none has published a classification yet.

    Before this the tool returned the whole roster on zero points, with races_completed
    counting the cancellations — a table no caller should render as a championship.
    """
    _serve_cancelled_season(monkeypatch, [])

    result = get_championship_standings.invoke({"year": 2024})

    assert result == {
        "error": "No completed races found for 2024 season yet",
        "reason": SEASON_NOT_STARTED,
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_standings_tools.py -k "no_results" -v`
Expected: FAIL, both:
- `assert 2 == 1`;
- the second returns a table dict rather than the error.

- [ ] **Step 3: Implement**

In `backend/tools/standings_tools.py`:

(a) Add this helper directly below the `SEASON_NOT_STARTED = "season_not_started"` line:

```python
def _season_not_started(year: int) -> dict[str, Any]:
    return {
        "error": f"No completed races found for {year} season yet",
        "reason": SEASON_NOT_STARTED,
    }
```

(b) Replace the docstring's first paragraph. The current text is:

```python
    Points are summed across every completed Race and Sprint session. Only seasons from
    OPENF1_FIRST_YEAR onwards are available, which is where OpenF1's coverage begins.
```

The replacement:

```python
    Points are summed across every completed Race and Sprint session. A session counts as
    completed once it has produced results, so a cancelled race is neither scored nor counted
    in races_completed. Only seasons from OPENF1_FIRST_YEAR onwards are available, which is
    where OpenF1's coverage begins.
```

(c) Replace the early return. The current code is:

```python
        if not sessions:
            return {
                "error": f"No completed races found for {year} season yet",
                "reason": SEASON_NOT_STARTED,
            }
```

The replacement:

```python
        if not sessions:
            return _season_not_started(year)
```

(d) Directly after `rows = session_results(keys)`, add:

```python

        # A session is *held* once it has produced a classification, not once its date has
        # passed. A cancelled race keeps its OpenF1 session and entry list and serves no result
        # rows — Imola 2023, Bahrain and Saudi Arabia 2026 — so the date-based count reported 16
        # races for a 2026 season that had run 14. It never touched the points (an empty race
        # adds none); it corrupted the count, which is the number the briefing and /standings
        # both quote.
        held = {row.get("session_key") for row in rows}
        if not held:
            return _season_not_started(year)
```

(e) Replace:

```python
        races_completed = sum(1 for s in sessions if s["session_name"] == "Race")
```

with:

```python
        races_completed = sum(
            1 for s in sessions if s["session_name"] == "Race" and s["session_key"] in held
        )
```

- [ ] **Step 4: Run the file, then the whole backend suite**

Run: `cd backend && .venv/bin/pytest tests/test_standings_tools.py -v`
Expected: PASS for all of them. Two existing tests are unchanged and still hold:
- `test_qualifying_is_excluded` still sees `races_completed == 3`, because all three fixture races have results;
- `test_the_whole_table_costs_three_requests` still counts `<= 4` calls, since nothing new is fetched.

Run: `cd backend && .venv/bin/pytest && .venv/bin/ruff format . && .venv/bin/ruff check .`
Expected: all pass. The format step changes no file outside this task.

- [ ] **Step 5: Document the trap in CLAUDE.md**

Insert this paragraph immediately **before** the paragraph that begins `**\`tests/conftest.py\` blocks OpenF1 as well as FastF1`:

```markdown
**A standings session counts only once it has results, not once its date has passed.** A
cancelled race keeps its OpenF1 session and entry list and serves no result rows, so the
date-based count reported 16 races for 2026 when 14 had run (Bahrain and Saudi Arabia never did)
and 23 for 2023's 22 (Imola). It never touched the points — an empty race adds none — only
`races_completed`, which is exactly the number the briefing and `/standings` quote. A season
with no held session at all returns `reason: SEASON_NOT_STARTED`.

```

- [ ] **Step 6: Commit**

```bash
git add backend/tools/standings_tools.py backend/tests/test_standings_tools.py CLAUDE.md
git commit -m "fix(standings): count only races that produced results

A cancelled race keeps its OpenF1 session with no result rows, so the
date-based count reported 16 races for 2026 (14 held) and 23 for 2023
(22). A season with no held session is now SEASON_NOT_STARTED instead of
a roster of zeros."
```

---

### Task 2: The route serves a season that has not started as a 200

**Files:**
- Modify: `backend/api/routes.py` (the import from `tools.standings_tools`, and `get_standings`)
- Test: `backend/tests/api/test_routes.py`
- Modify: `CLAUDE.md` (extend Task 1's paragraph)

**Interfaces:**
- Consumes: `SEASON_NOT_STARTED` from `tools.standings_tools`.
- Produces: `GET /api/standings/{year}` returns `200 {"year": Y, "races_completed": 0, "drivers": [], "constructors": []}` when the tool reports `SEASON_NOT_STARTED`. Every other tool error is still `502 GENERIC_STANDINGS_ERROR`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/api/test_routes.py`, directly after `test_standings_replaces_a_tool_error_with_a_generic_502`:

```python
def test_standings_serves_a_season_not_started_as_an_empty_table(client, monkeypatch):
    """A season with no completed race is a correct, permanent answer, not an outage — so it
    is a 200 with empty tables rather than the generic 502 that tells the page to retry. The
    tool's error prose still never reaches the client.
    """
    from api import routes
    from tools.standings_tools import SEASON_NOT_STARTED

    monkeypatch.setattr(
        routes,
        "get_championship_standings",
        make_tool(
            "get_championship_standings",
            result={
                "error": "No completed races found for 2026 season yet",
                "reason": SEASON_NOT_STARTED,
            },
        ),
    )

    response = client.get("/api/standings/2026")

    assert response.status_code == 200
    assert response.json() == {
        "year": 2026,
        "races_completed": 0,
        "drivers": [],
        "constructors": [],
    }
    assert "No completed races" not in response.text
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/api/test_routes.py -k season_not_started -v`
Expected: FAIL with `assert 502 == 200`.

- [ ] **Step 3: Implement**

In `backend/api/routes.py`, replace:

```python
from tools.standings_tools import get_championship_standings
```

with:

```python
from tools.standings_tools import SEASON_NOT_STARTED, get_championship_standings
```

In `get_standings`, directly after `result = await asyncio.to_thread(get_championship_standings.invoke, {"year": year})`, insert:

```python

        if result.get("reason") == SEASON_NOT_STARTED:
            # Not a failure: a season that has not run has an empty table, and saying so is the
            # correct answer. Folded into the 502 below it told the page to "try again" every day
            # from January to the first race, and no retry could ever succeed.
            logger.info("Standings for %d: season not started", year)
            return {"year": year, "races_completed": 0, "drivers": [], "constructors": []}
```

- [ ] **Step 4: Run the route suite, then the whole backend**

Run: `cd backend && .venv/bin/pytest tests/api/test_routes.py -v`
Expected: PASS. `test_standings_replaces_a_tool_error_with_a_generic_502` still passes, because its error carries no `reason`.

Run: `cd backend && .venv/bin/pytest && .venv/bin/ruff format . && .venv/bin/ruff check .`
Expected: all pass.

- [ ] **Step 5: Extend Task 1's CLAUDE.md paragraph**

In the paragraph Task 1 added, replace its last sentence:

```markdown
with no held session at all returns `reason: SEASON_NOT_STARTED`.
```

with:

```markdown
with no held session at all returns `reason: SEASON_NOT_STARTED`, which `/api/standings` serves as
a **200 with empty tables** — the one tool error the route does not fold into
`502 GENERIC_STANDINGS_ERROR`, because it is a correct answer and no retry changes it.
```

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes.py backend/tests/api/test_routes.py CLAUDE.md
git commit -m "fix(api): serve a season that has not started as an empty table, not a 502

SEASON_NOT_STARTED is a permanent, correct answer. Collapsed into the
generic 502 it told the page to retry from January until the first race."
```

---

### Task 3: Wire types, `getStandings`, and captured fixtures

**Files:**
- Modify: `frontend/types/f1.ts`, `frontend/types/api.ts`, `frontend/lib/api.ts`
- Create: `frontend/tests/fixtures/standings-2026.json`, `frontend/tests/fixtures/standings-2024.json`, `frontend/tests/fixtures/races-2026.json`
- Modify: `frontend/tests/fixtures/README.md`
- Test: `frontend/tests/api.test.ts`

**Interfaces:**
- Consumes: the Task 1 and Task 2 backend, running locally, for the capture.
- Produces:
  - `interface DriverStanding { position: number; driver: string; driver_code: string; team: string; points: number }` (from `@/types`)
  - `interface ConstructorStanding { position: number; team: string; points: number }` (from `@/types`)
  - `interface StandingsResponse { year: number; races_completed: number; drivers: DriverStanding[]; constructors: ConstructorStanding[] }` (from `@/types`)
  - `getStandings(year: number): Promise<StandingsResponse>` (from `@/lib/api`), which throws `Error('Failed to fetch standings')` when `!response.ok`.
  - The three fixture files. Later tasks import them as JSON modules (`resolveJsonModule` is on).

- [ ] **Step 1: Capture the fixtures from the running backend**

Neither route calls Gemini, so a placeholder key satisfies `validate_config()` without touching real credentials. In one terminal:

```bash
cd backend && GOOGLE_API_KEY=unused .venv/bin/uvicorn main:app --port 8000
```

Wait for `Application startup complete`. Then, from the repo root:

```bash
curl -sf http://localhost:8000/api/standings/2026 | python3 -m json.tool > frontend/tests/fixtures/standings-2026.json
curl -sf http://localhost:8000/api/standings/2024 | python3 -m json.tool > frontend/tests/fixtures/standings-2024.json
curl -sf http://localhost:8000/api/races/2026 | python3 -m json.tool > frontend/tests/fixtures/races-2026.json
```

Stop the server (Ctrl-C).

- [ ] **Step 2: Sanity-check the capture**

Run:

```bash
python3 - <<'PY'
import json
s26 = json.load(open("frontend/tests/fixtures/standings-2026.json"))
s24 = json.load(open("frontend/tests/fixtures/standings-2024.json"))
r26 = json.load(open("frontend/tests/fixtures/races-2026.json"))["races"]
rounds = [r for r in r26 if (r["round"] or 0) > 0]
print("2026:", s26["races_completed"], len(s26["drivers"]), len(s26["constructors"]))
print("2024:", s24["races_completed"], sorted(c["team"] for c in s24["constructors"]))
print("calendar rounds:", len(rounds), "| round 14:", next(r["name"] for r in rounds if r["round"] == 14))
PY
```

Expected:
- `2026: 14 23 11`
- `2024: 24 [...]`, where the list contains `'Kick Sauber'` and `'RB'`
- `calendar rounds: 23 | round 14: Spanish Grand Prix`

**If 2026 shows 15 or more, a race has been held since 2026-09-22** (Baku runs on 26 September). Keep the capture. Wherever a later task expects `Round 14 of 23 · Spanish Grand Prix`, substitute the new round and event name.

**If 2026 shows 16, Task 1 is not in effect.** Stop and fix that before continuing.

- [ ] **Step 3: Record the fixtures' provenance**

Append to `frontend/tests/fixtures/README.md`:

````markdown

# Standings and calendar fixtures

`standings-2026.json`, `standings-2024.json` and `races-2026.json` are responses from the real
`/api/standings/{year}` and `/api/races/{year}` routes. They were captured on 2026-09-22 against
live OpenF1 and FastF1 and pretty-printed with `python3 -m json.tool`; the values are untouched.

They are real for the same reason the `.sse` files are. The team-name join in `lib/standings.ts`
and the round join in `seasonStamp` both depend on how upstream *spells* things: `Haas F1 Team`,
`Red Bull Racing`, and a 2026 calendar renumbered around two cancelled races. A hand-written
fixture would encode the spelling its author expected rather than the one served.

Unlike the `.sse` files, these are **snapshots of live data**. There is no generator script, and
re-capturing changes the numbers the tests pin:
- 2026, after Round 14 of 23 (the Spanish Grand Prix): 23 drivers, 11 constructors;
- 2024, final after 24 rounds, with `Kick Sauber` and `RB`.

To re-capture, run the backend (`GOOGLE_API_KEY=unused` is enough, since neither route calls
Gemini), then:

```bash
curl -sf http://localhost:8000/api/standings/2026 | python3 -m json.tool > frontend/tests/fixtures/standings-2026.json
curl -sf http://localhost:8000/api/standings/2024 | python3 -m json.tool > frontend/tests/fixtures/standings-2024.json
curl -sf http://localhost:8000/api/races/2026 | python3 -m json.tool > frontend/tests/fixtures/races-2026.json
```
````

- [ ] **Step 4: Write the failing test**

In `frontend/tests/api.test.ts`:
- change the imports from `'vitest'` to `import { afterEach, describe, expect, it, vi } from 'vitest';`
- change the `@/lib/api` import to `import { getStandings, streamBriefing } from '@/lib/api';`
- add `import standings2026 from './fixtures/standings-2026.json';` below the existing imports.

Append:

```ts
/**
 * `getStandings` is a plain JSON fetch, so the only fetch surface it touches is `ok` and `json()`
 * — the stub is exactly that, which keeps this independent of whether the test environment
 * ships a `Response` constructor. The body is the captured route response, not a literal.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('getStandings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the standings route for the year and returns the payload as served', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(standings2026));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getStandings(2026);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/standings\/2026$/));
    expect(result).toEqual(standings2026);
  });

  it('throws on a non-OK response rather than handing the error body on as a table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: 'Could not load the standings.' }, 502)),
    );

    await expect(getStandings(2026)).rejects.toThrow('Failed to fetch standings');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd frontend && mise exec -- pnpm test tests/api.test.ts`
Expected: FAIL. `getStandings` is not exported, so the call is `undefined`.

- [ ] **Step 6: Implement**

Append to `frontend/types/f1.ts`:

```ts
/**
 * One row of the drivers' table from `GET /api/standings/{year}` — mirrors the dicts
 * `get_championship_standings` builds in `backend/tools/standings_tools.py`.
 *
 * `driver` is OpenF1's `full_name`, surname uppercased ("Kimi ANTONELLI"). `team` is the team
 * the driver raced for in their latest session, spelled as OpenF1 spells it ("Haas F1 Team") —
 * a display string, not a `Team` id.
 */
export interface DriverStanding {
  position: number;
  driver: string;
  driver_code: string;
  team: string;
  points: number;
}

/** One row of the constructors' table. `team` is OpenF1's spelling, as on `DriverStanding`. */
export interface ConstructorStanding {
  position: number;
  team: string;
  points: number;
}
```

In `frontend/types/api.ts`, replace the header comment and the import:

```ts
/**
 * API types — discriminated union matching SSE events emitted by
 * backend/api/routes.py event_generator()
 */
import type { RaceInfo } from './f1';
```

with:

```ts
/**
 * API types — the discriminated union matching SSE events emitted by
 * backend/api/routes.py event_generator(), and the envelopes its REST routes return.
 */
import type { ConstructorStanding, DriverStanding, RaceInfo } from './f1';
```

Then append:

```ts
/**
 * `GET /api/standings/{year}`. Rows arrive already ranked — driver ties broken on best finish,
 * then car number — so they render in served order and are never re-sorted.
 *
 * A season that has not started is a 200 with `races_completed: 0` and both tables empty, not
 * an error: it is a correct answer, and no retry would change it.
 */
export interface StandingsResponse {
  year: number;
  races_completed: number;
  drivers: DriverStanding[];
  constructors: ConstructorStanding[];
}
```

In `frontend/lib/api.ts`, replace the first line:

```ts
import type { StreamEvent, Race, RaceInfo } from '@/types';
```

with:

```ts
import type { StreamEvent, Race, RaceInfo, StandingsResponse } from '@/types';
```

Insert directly after the `getRaces` function:

```ts
export async function getStandings(year: number): Promise<StandingsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/standings/${year}`);

  if (!response.ok) {
    throw new Error('Failed to fetch standings');
  }

  return (await response.json()) as StandingsResponse;
}
```

- [ ] **Step 7: Run the tests and the type check**

Run: `cd frontend && mise exec -- pnpm test tests/api.test.ts && mise exec -- pnpm typecheck`
Expected: PASS. Every existing `streamBriefing` case still passes.

- [ ] **Step 8: Commit**

```bash
git add frontend/types/f1.ts frontend/types/api.ts frontend/lib/api.ts frontend/tests/api.test.ts frontend/tests/fixtures/
git commit -m "feat(standings): typed client for /api/standings with captured fixtures"
```

---

### Task 4: Pure helpers in `lib/standings.ts`

**Files:**
- Create: `frontend/lib/standings.ts`
- Test: `frontend/tests/standings.test.ts`
- Modify: `CLAUDE.md` (the `OPENF1_FIRST_YEAR` sentence, plus a new paragraph)

**Interfaces:**
- Consumes:
  - `TEAMS`, `TEAM_MAP`, `type Team` from `@/data/teams-data`;
  - `type Race` from `@/types`;
  - the fixtures from Task 3.
- Produces (all exported from `@/lib/standings`):
  - `STANDINGS_FIRST_YEAR: 2023`
  - `standingsYears(latest: number): number[]`, newest first
  - `parseStandingsYear(param: string | string[] | undefined, latest: number): number`
  - `teamForStanding(name: string): Team | null`
  - `formatDriverName(full: string): string`
  - `interface SeasonStamp { label: string; final: boolean }`
  - `seasonStamp(racesCompleted: number, calendar: Race[] | null): SeasonStamp | null`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/standings.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TEAMS } from '@/data/teams-data';
import {
  STANDINGS_FIRST_YEAR,
  formatDriverName,
  parseStandingsYear,
  seasonStamp,
  standingsYears,
  teamForStanding,
} from '@/lib/standings';
import type { Race } from '@/types';
import races2026 from './fixtures/races-2026.json';
import standings2024 from './fixtures/standings-2024.json';
import standings2026 from './fixtures/standings-2026.json';

const CALENDAR_2026: Race[] = races2026.races;

function race(round: number, name: string): Race {
  return { name, location: 'Somewhere', country: 'Testland', date: '2023-01-01', round };
}

describe('STANDINGS_FIRST_YEAR', () => {
  it('matches the backend constant the route validates against', () => {
    // The route rejects a year below OPENF1_FIRST_YEAR with a 422, so a picker offering one would
    // offer a page that can only fail. Read out of the Python source rather than retyped here,
    // because a retyped copy drifts exactly as silently as the mirror it is meant to check.
    const source = readFileSync(
      resolve(__dirname, '../../backend/tools/openf1_client.py'),
      'utf8',
    );
    const match = /^OPENF1_FIRST_YEAR = (\d{4})$/m.exec(source);

    expect(match?.[1]).toBe(String(STANDINGS_FIRST_YEAR));
  });
});

describe('standingsYears', () => {
  it('lists every covered season, newest first', () => {
    expect(standingsYears(2026)).toEqual([2026, 2025, 2024, 2023]);
  });
});

describe('parseStandingsYear', () => {
  it.each([
    ['2023', 2023],
    ['2024', 2024],
    ['2026', 2026],
  ])('accepts ?year=%s', (param, year) => {
    expect(parseStandingsYear(param, 2026)).toBe(year);
  });

  it.each([
    ['a year before coverage', '2019'],
    ['a year after the latest', '2027'],
    ['a non-number', 'abc'],
    ['a fraction', '2024.5'],
    ['padding', ' 2024'],
    ['an empty value', ''],
  ])('falls back to the latest season for %s', (_label, param) => {
    expect(parseStandingsYear(param, 2026)).toBe(2026);
  });

  it('falls back for a missing param and for a repeated one', () => {
    expect(parseStandingsYear(undefined, 2026)).toBe(2026);
    // Next hands a repeated `?year=` over as an array. Guessing which one was meant is worse
    // than showing the default.
    expect(parseStandingsYear(['2024', '2025'], 2026)).toBe(2026);
  });
});

describe('teamForStanding', () => {
  it('resolves every 2026 constructor, as OpenF1 spells it, to a distinct team', () => {
    // The live payload, not a list typed from memory: "Haas F1 Team" and "Red Bull Racing" are
    // the two an exact shortName match misses. Eleven names resolving to ten teams means the
    // join ate one.
    const names = standings2026.constructors.map((row) => row.team);
    const ids = names.map((name) => teamForStanding(name)?.id);

    expect(names).toHaveLength(11);
    expect(ids).not.toContain(undefined);
    expect(new Set(ids).size).toBe(TEAMS.length);
  });

  it('resolves the two spellings exact matching misses', () => {
    expect(teamForStanding('Haas F1 Team')?.id).toBe('haas');
    expect(teamForStanding('Red Bull Racing')?.id).toBe('red-bull');
  });

  it('leaves predecessor brands unmatched, so 2024 is not painted in 2026 liveries', () => {
    const unmatched = standings2024.constructors
      .map((row) => row.team)
      .filter((name) => teamForStanding(name) === null);

    expect(new Set(unmatched)).toEqual(new Set(['Kick Sauber', 'RB']));
    expect(teamForStanding('AlphaTauri')).toBeNull();
    expect(teamForStanding('Alfa Romeo')).toBeNull();
  });

  it('never matches on a substring or a case variant', () => {
    for (const name of ['Bull', 'Racing', 'Aston', 'mercedes', 'RED BULL RACING']) {
      expect(teamForStanding(name)).toBeNull();
    }
  });
});

describe('formatDriverName', () => {
  it.each([
    ['Kimi ANTONELLI', 'Kimi Antonelli'],
    ['Nico HULKENBERG', 'Nico Hulkenberg'],
    ['Max Verstappen', 'Max Verstappen'],
  ])('%s → %s', (raw, formatted) => {
    expect(formatDriverName(raw)).toBe(formatted);
  });

  it('leaves no shouted surname anywhere in the captured 2026 table', () => {
    for (const row of standings2026.drivers) {
      expect(formatDriverName(row.driver)).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});

describe('seasonStamp', () => {
  it('names the last race in the table by its round, mid-season', () => {
    // 14 held races. FastF1 renumbered around the cancelled Bahrain and Saudi Arabia rounds, so
    // Round 14 of 23 is Madrid — a date-based count would have pointed two rounds into the future.
    expect(seasonStamp(standings2026.races_completed, CALENDAR_2026)).toEqual({
      label: 'After Round 14 of 23 · Spanish Grand Prix',
      final: false,
    });
  });

  it('marks a season final when every round is held — 2023, after Imola, is 22 of 22', () => {
    const calendar2023: Race[] = [
      race(0, 'Pre-Season Testing'),
      ...Array.from({ length: 21 }, (_, i) => race(i + 1, `Round ${i + 1} Grand Prix`)),
      race(22, 'Abu Dhabi Grand Prix'),
    ];

    expect(seasonStamp(22, calendar2023)).toEqual({
      label: 'After Round 22 of 22 · Abu Dhabi Grand Prix',
      final: true,
    });
  });

  it('leaves round-0 testing out of the total', () => {
    // FastF1 lists pre-season testing as round 0 — twice in 2026. Counting those would make the
    // season 25 rounds long.
    expect(seasonStamp(1, CALENDAR_2026)?.label).toBe('After Round 1 of 23 · Australian Grand Prix');
  });

  it('falls back to a bare count without a calendar', () => {
    expect(seasonStamp(14, null)).toEqual({ label: 'After 14 rounds', final: false });
    expect(seasonStamp(1, null)).toEqual({ label: 'After 1 round', final: false });
  });

  it('drops the denominator rather than print a count the calendar cannot hold', () => {
    expect(seasonStamp(24, CALENDAR_2026)).toEqual({ label: 'After 24 rounds', final: false });
  });

  it('keeps the denominator when the round itself is missing from the calendar', () => {
    const gappy = CALENDAR_2026.filter((r) => r.round !== 14);

    expect(seasonStamp(14, gappy)).toEqual({ label: 'After 14 of 22 rounds', final: false });
  });

  it('gives no stamp for a season with no race yet', () => {
    expect(seasonStamp(0, CALENDAR_2026)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && mise exec -- pnpm test tests/standings.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/standings"`.

- [ ] **Step 3: Implement**

Create `frontend/lib/standings.ts`:

```ts
import { TEAMS, TEAM_MAP, type Team } from '@/data/teams-data';
import type { Race } from '@/types';

/**
 * First season `/api/standings` serves — a mirror of `OPENF1_FIRST_YEAR` in
 * `backend/tools/openf1_client.py`, where OpenF1's coverage begins.
 *
 * Mirrored rather than fetched because the season picker needs its range before any request is
 * made, and a range that disagreed with the route would offer a year the route rejects with a
 * 422. `tests/standings.test.ts` reads the backend constant out of its source and fails the
 * moment the two drift.
 */
export const STANDINGS_FIRST_YEAR = 2023;

/** Every season the picker offers, newest first. */
export function standingsYears(latest: number): number[] {
  const years: number[] = [];
  for (let year = latest; year >= STANDINGS_FIRST_YEAR; year -= 1) years.push(year);
  return years;
}

/**
 * The season a `?year=` query asks for, or `latest` when it asks for nothing usable.
 *
 * Validated here, at the edge, so a hand-edited `?year=2019` or `?year=abc` renders the current
 * table rather than sending the route a year it answers with a 422. Next hands a repeated param
 * over as an array; that is treated as unusable rather than guessed at.
 */
export function parseStandingsYear(param: string | string[] | undefined, latest: number): number {
  if (typeof param !== 'string' || !/^\d{4}$/.test(param)) return latest;
  const year = Number(param);
  return year >= STANDINGS_FIRST_YEAR && year <= latest ? year : latest;
}

/**
 * OpenF1 spellings that differ from `Team.shortName` but name the same team.
 *
 * Exact strings, never substrings: the livery fix replaced a `body`/`paint` substring guess that
 * matched nothing and reported nothing, and a `'Bull'` substring here would match two teams.
 * Predecessor brands — `Kick Sauber`, `RB`, `AlphaTauri`, `Alfa Romeo` — are left out on purpose.
 * They are the same entrants as Audi and Racing Bulls, but painting a 2024 row in Audi's colours
 * would misstate who was on the grid, so they render as plain text.
 */
const OPENF1_TEAM_ALIASES: Record<string, string> = {
  'Haas F1 Team': 'haas',
  'Red Bull Racing': 'red-bull',
};

/**
 * The `Team` a standings row's OpenF1 team name refers to, or `null`.
 *
 * `null` is a value the tables render — OpenF1's own spelling as plain text, with no colour bar
 * — not an error. It is the normal case for every season before 2026.
 */
export function teamForStanding(name: string): Team | null {
  const aliased = OPENF1_TEAM_ALIASES[name];
  if (aliased) return TEAM_MAP[aliased] ?? null;
  return TEAMS.find((team) => team.shortName === name) ?? null;
}

/**
 * OpenF1's `full_name` with its uppercased surname returned to title case: `"Kimi ANTONELLI"` →
 * `"Kimi Antonelli"`, matching how `/teams` writes every name.
 *
 * Only fully uppercase tokens of two or more letters change, so a name OpenF1 ever serves in
 * mixed case passes through untouched. Diacritics are already gone upstream (`PEREZ`,
 * `HULKENBERG`) and are not reconstructed.
 */
export function formatDriverName(full: string): string {
  return full
    .split(' ')
    .map((token) =>
      token.length > 1 && token === token.toUpperCase() && token !== token.toLowerCase()
        ? token.charAt(0) + token.slice(1).toLowerCase()
        : token,
    )
    .join(' ');
}

export interface SeasonStamp {
  /** "After Round 14 of 23 · Spanish Grand Prix", or a shorter form when less is known. */
  label: string;
  /** Every round on the calendar has been held — the season is over. */
  final: boolean;
}

/**
 * The as-of line for a season's table — the live counterpart of `STANDINGS_AS_OF`.
 *
 * `racesCompleted` counts races that produced results, and FastF1's calendar drops cancelled
 * events and renumbers the rest, so calendar round `racesCompleted` *is* the last race whose
 * points are in the table. That join is exact only because both halves skip cancellations; the
 * date-based count it replaced pointed two rounds into the future.
 *
 * `null` for a season with no race yet, which the page renders as its own empty state. Without
 * a calendar the label falls back to a bare count, and a count the calendar cannot hold drops the
 * denominator rather than printing "24 of 23". The event is named by `Race.name`, never
 * `location`: FastF1 files the rescheduled 2026 Bahrain Grand Prix under "Kuala Lumpur".
 */
export function seasonStamp(racesCompleted: number, calendar: Race[] | null): SeasonStamp | null {
  if (racesCompleted <= 0) return null;

  const rounds = (calendar ?? []).filter(
    (race) => typeof race.round === 'number' && race.round > 0,
  );
  const total = rounds.length;
  if (total === 0 || racesCompleted > total) {
    return {
      label: `After ${racesCompleted} ${racesCompleted === 1 ? 'round' : 'rounds'}`,
      final: false,
    };
  }

  const event = rounds.find((race) => race.round === racesCompleted);
  return {
    label: event
      ? `After Round ${racesCompleted} of ${total} · ${event.name}`
      : `After ${racesCompleted} of ${total} rounds`,
    final: racesCompleted === total,
  };
}
```

- [ ] **Step 4: Run the tests, the type check and lint**

Run: `cd frontend && mise exec -- pnpm test tests/standings.test.ts && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Update CLAUDE.md**

(a) Replace:

```markdown
**OpenF1 coverage starts in 2023, and `OPENF1_FIRST_YEAR` is the only place that number
lives.** Every ported result tool
```

with:

```markdown
**OpenF1 coverage starts in 2023, and `OPENF1_FIRST_YEAR` is the only place in the backend that
number lives.** The frontend's season picker mirrors it as `STANDINGS_FIRST_YEAR` in
`lib/standings.ts`, and `tests/standings.test.ts` reads the constant out of this Python source
and fails on drift. Every ported result tool
```

(b) Insert immediately **before** the paragraph beginning `**\`tests/conftest.py\` blocks OpenF1 as well as FastF1` (so it lands after Task 1's paragraph):

```markdown
**`/standings` joins two upstreams, and both joins are exact on purpose.** OpenF1 spells two
2026 teams differently from `Team.shortName` (`Haas F1 Team`, `Red Bull Racing`), so
`teamForStanding` matches `shortName` exactly plus an explicit two-entry alias map — never a
substring, the defect class the livery fix removed. Predecessor brands (`Kick Sauber`, `RB`,
`AlphaTauri`, `Alfa Romeo`) are deliberately unmapped: an unmatched team renders as plain text
with an empty bar slot, which is the normal case for every season before 2026. The as-of stamp
joins `races_completed` to FastF1's calendar by `round`, and that is exact only because FastF1
drops cancelled events and renumbers the rest *and* the count now skips them too — Round 14 of
23 is the Spanish Grand Prix. Name the event by `Race.name`: FastF1 files the rescheduled 2026
Bahrain Grand Prix under `Location: "Kuala Lumpur"`.

```

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/standings.ts frontend/tests/standings.test.ts CLAUDE.md
git commit -m "feat(standings): helpers for the season range, team join and as-of stamp"
```

---

### Task 5: The `useStandings` hook

**Files:**
- Create: `frontend/hooks/use-standings.ts`
- Test: `frontend/tests/use-standings.test.ts`

**Interfaces:**
- Consumes: `getStandings(year)` (Task 3) and `getRaces(year)` from `@/lib/api`; the types `Race` and `StandingsResponse` from `@/types`.
- Produces: `useStandings(year: number): UseStandingsReturn`, where

  `interface UseStandingsReturn { standings: StandingsResponse | null; calendar: Race[] | null; loading: boolean; error: boolean; retry: () => void }`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/use-standings.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStandings } from '@/hooks/use-standings';
import { getRaces, getStandings } from '@/lib/api';
import type { Race, StandingsResponse } from '@/types';

// Hoisted above the imports, so the static bindings above are already the mocks. A top-level
// `await import(…)` would pass under vitest and fail `pnpm typecheck` with TS1378.
vi.mock('@/lib/api', () => ({ getStandings: vi.fn(), getRaces: vi.fn() }));
const getStandingsMock = vi.mocked(getStandings);
const getRacesMock = vi.mocked(getRaces);

function table(year: number): StandingsResponse {
  return {
    year,
    races_completed: 1,
    drivers: [
      { position: 1, driver: 'Kimi ANTONELLI', driver_code: 'ANT', team: 'Mercedes', points: 25 },
    ],
    constructors: [{ position: 1, team: 'Mercedes', points: 25 }],
  };
}

const CALENDAR: Race[] = [
  {
    name: 'Australian Grand Prix',
    location: 'Melbourne',
    country: 'Australia',
    date: '2026-03-08',
    round: 1,
  },
];

/** A promise the test settles by hand, to control which response lands first. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  getStandingsMock.mockReset();
  getRacesMock.mockReset();
  getRacesMock.mockResolvedValue(CALENDAR);
  // Both fetch failures are logged on purpose; keep them out of the test output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useStandings', () => {
  it('fetches the season and its calendar, and reports loading until both land', async () => {
    getStandingsMock.mockResolvedValue(table(2026));

    const { result } = renderHook(() => useStandings(2026));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getStandingsMock).toHaveBeenCalledWith(2026);
    expect(getRacesMock).toHaveBeenCalledWith(2026);
    expect(result.current.standings).toEqual(table(2026));
    expect(result.current.calendar).toEqual(CALENDAR);
    expect(result.current.error).toBe(false);
  });

  it('reports an error when the standings fetch fails', async () => {
    getStandingsMock.mockRejectedValue(new Error('502'));

    const { result } = renderHook(() => useStandings(2026));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.standings).toBeNull();
  });

  it('degrades a calendar failure to no calendar, not to an error', async () => {
    // The calendar only enriches the stamp. Failing the page over it would hide a table that
    // loaded fine.
    getStandingsMock.mockResolvedValue(table(2026));
    getRacesMock.mockRejectedValue(new Error('500'));

    const { result } = renderHook(() => useStandings(2026));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(false);
    expect(result.current.standings).toEqual(table(2026));
    expect(result.current.calendar).toBeNull();
  });

  it('fetches again on retry, and reports loading while it does', async () => {
    getStandingsMock.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce(table(2026));

    const { result } = renderHook(() => useStandings(2026));
    await waitFor(() => expect(result.current.error).toBe(true));

    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);

    await waitFor(() => expect(result.current.standings).toEqual(table(2026)));
    expect(getStandingsMock).toHaveBeenCalledTimes(2);
  });

  it('drops an earlier season that resolves after the current one', async () => {
    // Switch 2025 → 2024 and let 2025 land last. Without the guard the older response overwrites
    // the newer one, and 2025's table renders under a 2024 heading.
    const slow = deferred<StandingsResponse>();
    getStandingsMock.mockImplementation((year) =>
      year === 2025 ? slow.promise : Promise.resolve(table(2024)),
    );

    const { result, rerender } = renderHook(({ year }) => useStandings(year), {
      initialProps: { year: 2025 },
    });
    rerender({ year: 2024 });
    await waitFor(() => expect(result.current.standings?.year).toBe(2024));

    await act(async () => {
      slow.resolve(table(2025));
      await slow.promise;
    });

    expect(result.current.standings?.year).toBe(2024);
  });

  it('reports loading, not the previous table, while a new season is in flight', async () => {
    getStandingsMock.mockImplementation((year) =>
      year === 2026 ? Promise.resolve(table(2026)) : new Promise<StandingsResponse>(() => {}),
    );

    const { result, rerender } = renderHook(({ year }) => useStandings(year), {
      initialProps: { year: 2026 },
    });
    await waitFor(() => expect(result.current.standings?.year).toBe(2026));

    rerender({ year: 2025 });

    expect(result.current.loading).toBe(true);
    expect(result.current.standings).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && mise exec -- pnpm test tests/use-standings.test.ts`
Expected: FAIL with `Failed to resolve import "@/hooks/use-standings"`.

- [ ] **Step 3: Implement**

Create `frontend/hooks/use-standings.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

import { getRaces, getStandings } from '@/lib/api';
import type { Race, StandingsResponse } from '@/types';

export interface UseStandingsReturn {
  /** The requested season's tables, or `null` while loading or after a failure. */
  standings: StandingsResponse | null;
  /**
   * That season's calendar, or `null` when it failed or has not landed. It only ever enriches the
   * as-of stamp, so a failure here is logged and degrades the stamp to a bare count.
   */
  calendar: Race[] | null;
  /** True until this season's result lands — including straight after a season change. */
  loading: boolean;
  /** The standings fetch failed. The calendar failing never sets this. */
  error: boolean;
  /** Fetch the current season again. */
  retry: () => void;
}

interface Loaded {
  year: number;
  standings: StandingsResponse | null;
  calendar: Race[] | null;
  error: boolean;
}

/**
 * One season's championship tables and its calendar, fetched together.
 *
 * **Same shape as `use-races.ts`** — state, one effect, an `active` flag — **with one deliberate
 * difference: this hook exposes an error.** A failed calendar degrades `use-races`' consumers to
 * renderings that were already correct for "we do not know"; here the table *is* the page, so
 * the page has to be able to say it failed and offer a retry.
 *
 * Both requests go out together through `Promise.allSettled`, so the stamp arrives complete
 * instead of reading "After 14 rounds" and then shifting to the full label. On a season change
 * the previous effect's `active` flag drops its response even if it lands last, and a result is
 * only reported for the year it was fetched for — so the previous season's tables never render
 * under the new season's heading.
 */
export function useStandings(year: number): UseStandingsReturn {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      const [standings, calendar] = await Promise.allSettled([
        getStandings(year),
        getRaces(year),
      ]);
      if (!active) return;

      // Kept for the same reason `use-races` keeps its log: a silent network failure in
      // development is worse than a noisy one.
      if (standings.status === 'rejected') {
        console.error('Failed to fetch standings:', standings.reason);
      }
      if (calendar.status === 'rejected') {
        console.error('Failed to fetch the calendar:', calendar.reason);
      }

      setLoaded({
        year,
        standings: standings.status === 'fulfilled' ? standings.value : null,
        calendar: calendar.status === 'fulfilled' ? calendar.value : null,
        error: standings.status === 'rejected',
      });
    }

    void load();

    return () => {
      active = false;
    };
  }, [year, attempt]);

  const retry = useCallback(() => {
    // Cleared first so the page reads "loading" immediately rather than showing the error until
    // the new response lands.
    setLoaded(null);
    setAttempt((count) => count + 1);
  }, []);

  const current = loaded?.year === year ? loaded : null;
  return {
    standings: current?.standings ?? null,
    calendar: current?.calendar ?? null,
    loading: current === null,
    error: current?.error ?? false,
    retry,
  };
}
```

- [ ] **Step 4: Run the tests, the type check and lint**

Run: `cd frontend && mise exec -- pnpm test tests/use-standings.test.ts && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/use-standings.ts frontend/tests/use-standings.test.ts
git commit -m "feat(standings): useStandings hook fetching a season and its calendar"
```

---

### Task 6: The drivers' and constructors' tables

**Files:**
- Create: `frontend/components/standings/standings-tables.tsx`
- Test: `frontend/tests/standings-tables.test.tsx`
- Modify: `CLAUDE.md` (a new paragraph)

**Interfaces:**
- Consumes: `teamForStanding` and `formatDriverName` from `@/lib/standings`; `type Team` from `@/data/teams-data`; `DriverStanding` and `ConstructorStanding` from `@/types`.
- Produces:
  - `DriverStandingsTable({ rows }: { rows: DriverStanding[] })`
  - `ConstructorStandingsTable({ rows }: { rows: ConstructorStanding[] })`

  Both render a `<table>` whose accessible name comes from an `sr-only` caption, beginning "Drivers' championship" and "Constructors' championship" respectively. Every bar carries `data-team-bar="<team id>"`, or `data-team-bar="unmatched"`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/standings-tables.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ConstructorStandingsTable,
  DriverStandingsTable,
} from '@/components/standings/standings-tables';
import { TEAM_MAP } from '@/data/teams-data';
import { formatDriverName } from '@/lib/standings';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import standings2024 from './fixtures/standings-2024.json';
import standings2026 from './fixtures/standings-2026.json';
import { inlineColouredText, restingTextNeutrals } from './zinc';

function bodyRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('tbody > tr'));
}

function rowFor(text: string): HTMLElement {
  const row = screen.getByText(text).closest('tr');
  if (!row) throw new Error(`no row contains "${text}"`);
  return row;
}

describe('DriverStandingsTable', () => {
  it('renders every driver the season served — 23 in 2026, not 22', () => {
    // Tsunoda started races as a substitute, and the roster is seeded from every session.
    const { container } = render(<DriverStandingsTable rows={standings2026.drivers} />);

    expect(bodyRows(container)).toHaveLength(23);
  });

  it('renders rows in the order they arrive and never sorts them', () => {
    // Reversed on purpose: no ranking of any field produces this order, so a client-side sort of
    // any kind — points, position, name — would reorder it and fail here. The backend's
    // tie-break is the only ordering the page may show.
    const reversed = [...standings2026.drivers].reverse();
    const { container } = render(<DriverStandingsTable rows={reversed} />);

    const shown = bodyRows(container).map((tr) => tr.firstElementChild?.textContent);
    expect(shown).toEqual(reversed.map((row) => String(row.position)));
  });

  it('shows each driver under the formatted name, with the team as /teams names it', () => {
    render(<DriverStandingsTable rows={standings2026.drivers} />);

    for (const row of standings2026.drivers) {
      expect(screen.getByText(formatDriverName(row.driver))).toBeInTheDocument();
    }
    // "Red Bull Racing" on the wire; "Red Bull" everywhere else in the app.
    expect(within(rowFor('Max Verstappen')).getByText('Red Bull')).toBeInTheDocument();
  });

  it('is a real table with a caption and scoped column headers', () => {
    render(<DriverStandingsTable rows={standings2026.drivers} />);

    const table = screen.getByRole('table', { name: /^drivers' championship/i });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((th) => th.getAttribute('scope'))).toEqual(['col', 'col', 'col']);
    expect(within(table).getByRole('columnheader', { name: 'Position' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Points' })).toBeInTheDocument();
  });
});

describe('ConstructorStandingsTable', () => {
  it('renders all eleven 2026 constructors, Cadillac on zero included', () => {
    const { container } = render(<ConstructorStandingsTable rows={standings2026.constructors} />);

    expect(bodyRows(container)).toHaveLength(11);
    expect(within(rowFor('Cadillac')).getByText('0')).toBeInTheDocument();
  });

  it('paints every bar in its team’s true colour', () => {
    // Decorative, so never lifted for contrast: a "readable" Racing Bulls navy would misreport
    // the livery.
    const { container } = render(<ConstructorStandingsTable rows={standings2026.constructors} />);
    const bars = Array.from(container.querySelectorAll<HTMLElement>('[data-team-bar]'));

    expect(bars).toHaveLength(11);
    for (const bar of bars) {
      const team = TEAM_MAP[bar.dataset.teamBar ?? ''];
      expect(team, bar.dataset.teamBar).toBeDefined();
      expect(bar).toHaveStyle({ backgroundColor: team?.color });
    }
  });

  it('keeps an unmatched team as plain text with an empty bar slot', () => {
    // Every season before 2026 has these. The row must survive the failed join.
    const { container } = render(<ConstructorStandingsTable rows={standings2024.constructors} />);

    expect(bodyRows(container)).toHaveLength(standings2024.constructors.length);
    for (const name of ['Kick Sauber', 'RB']) {
      const bar = rowFor(name).querySelector<HTMLElement>('[data-team-bar]');
      expect(bar?.dataset.teamBar).toBe('unmatched');
      expect(bar?.style.backgroundColor).toBe('');
    }
  });
});

describe('colour on both tables', () => {
  function renderBoth() {
    return render(
      <>
        <DriverStandingsTable rows={standings2026.drivers} />
        <ConstructorStandingsTable rows={standings2026.constructors} />
      </>,
    );
  }

  it('puts no team colour on any text', () => {
    // A livery on text needs a backdrop variant from lib/team-utils.ts first. This is where
    // adding one without that gets caught.
    const { container } = renderBoth();

    expect(inlineColouredText(container)).toEqual([]);
  });

  it('keeps every neutral readable on the bare page it really sits on', () => {
    // Exact, not a lower bound: the next test pins that no row has a fill, so zinc-950 really is
    // behind every glyph.
    const { container } = renderBoth();
    const runs = restingTextNeutrals(container);

    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(contrastRatio(run.hex, DARK_BG), run.text).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('has no fill on any table element', () => {
    const { container } = renderBoth();

    for (const el of Array.from(container.querySelectorAll('table, thead, tbody, tr, th, td'))) {
      const fills = Array.from(el.classList).filter((c) => /^([a-z-]+:)*bg-/.test(c));
      expect(fills, el.tagName).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && mise exec -- pnpm test tests/standings-tables.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/standings/standings-tables"`.

- [ ] **Step 3: Implement**

Create `frontend/components/standings/standings-tables.tsx`:

```tsx
import type { ReactNode } from 'react';

import { type Team } from '@/data/teams-data';
import { formatDriverName, teamForStanding } from '@/lib/standings';
import { cn } from '@/lib/utils';
import type { ConstructorStanding, DriverStanding } from '@/types';

/**
 * The two championship tables on `/standings`.
 *
 * Presentation only, like `attribution-table.tsx`: rows in, markup out. Rows render in the order
 * they arrive and are never sorted — the backend breaks ties on best finish and then car number
 * precisely so that two reads of the table agree, and a client-side sort would undo that.
 *
 * **Team colour is decorative here, never text.** Each row carries a 4px bar in the team's true
 * hex — bars are exempt from the text-contrast rule and must keep the real colour, per
 * `readableOnDark` — and every glyph is a zinc neutral on the bare `zinc-950` page: no zebra
 * stripes, no hover tint, no highlighted leader. That is the whole reason this file calls no
 * `lib/team-utils.ts` helper. A livery on text, or any fill behind a row, needs its own backdrop
 * variant built from `blendOver` + `liftUntilContrast` first, and
 * `tests/standings-tables.test.tsx` fails until it has one.
 */

/** Small-caps tracked label, as `/credits` uses for its table headers. */
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
/** A rule above each body row and no fill, so the backdrop behind every glyph stays `zinc-950`. */
const CELL = 'border-t border-zinc-800 py-2.5 align-middle';
const POSITION = cn(CELL, 'w-10 pr-2 font-mono text-xs tabular-nums text-zinc-400');
const POINTS = cn(CELL, 'w-16 text-right font-semibold tabular-nums');

/** At most one decimal: `292`, and `12.5` for a half-points race should one ever be served. */
const formatPoints = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format;

/**
 * The team's colour bar, or an empty slot of the same width for a team `TEAMS` does not know,
 * so the names beside it still line up. `aria-hidden`: the team name carries the meaning, which
 * is also why the bar is not held to WCAG's non-text contrast bar.
 */
function TeamBar({ team }: { team: Team | null }) {
  return (
    <span
      aria-hidden="true"
      data-team-bar={team?.id ?? 'unmatched'}
      className="h-6 w-1 flex-shrink-0 rounded-full"
      style={team ? { backgroundColor: team.color } : undefined}
    />
  );
}

interface StandingsTableProps {
  caption: string;
  subjectLabel: string;
  children: ReactNode;
}

/** The shared shell. `text-zinc-200` here is what every body cell inherits. */
function StandingsTable({ caption, subjectLabel, children }: StandingsTableProps) {
  return (
    <table className="w-full border-collapse text-left text-sm text-zinc-200">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(LABEL, 'w-10 pb-2 pr-2')}>
            <span aria-hidden="true">Pos</span>
            <span className="sr-only">Position</span>
          </th>
          <th scope="col" className={cn(LABEL, 'pb-2')}>
            {subjectLabel}
          </th>
          <th scope="col" className={cn(LABEL, 'w-16 pb-2 text-right')}>
            <span aria-hidden="true">Pts</span>
            <span className="sr-only">Points</span>
          </th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function DriverStandingsTable({ rows }: { rows: DriverStanding[] }) {
  return (
    <StandingsTable
      caption="Drivers' championship: position, driver and team, points."
      subjectLabel="Driver"
    >
      {rows.map((row) => {
        const team = teamForStanding(row.team);
        return (
          <tr key={row.position}>
            <td className={POSITION}>{row.position}</td>
            <td className={CELL}>
              {/* The team is a second line rather than a fourth column, so 390px needs no hidden
                  column and no horizontal scroll. */}
              <span className="flex items-center gap-3">
                <TeamBar team={team} />
                <span className="min-w-0">
                  <span className="block">{formatDriverName(row.driver)}</span>
                  <span className="block text-xs text-zinc-400">{team?.shortName ?? row.team}</span>
                </span>
              </span>
            </td>
            <td className={POINTS}>{formatPoints(row.points)}</td>
          </tr>
        );
      })}
    </StandingsTable>
  );
}

export function ConstructorStandingsTable({ rows }: { rows: ConstructorStanding[] }) {
  return (
    <StandingsTable caption="Constructors' championship: position, team, points." subjectLabel="Team">
      {rows.map((row) => {
        const team = teamForStanding(row.team);
        return (
          <tr key={row.position}>
            <td className={POSITION}>{row.position}</td>
            <td className={CELL}>
              <span className="flex items-center gap-3">
                <TeamBar team={team} />
                <span className="min-w-0">{team?.shortName ?? row.team}</span>
              </span>
            </td>
            <td className={POINTS}>{formatPoints(row.points)}</td>
          </tr>
        );
      })}
    </StandingsTable>
  );
}
```

- [ ] **Step 4: Run the tests, the type check and lint**

Run: `cd frontend && mise exec -- pnpm test tests/standings-tables.test.tsx && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Document the colour rule in CLAUDE.md**

Insert immediately **before** the paragraph beginning `**\`tests/conftest.py\` blocks OpenF1 as well as FastF1` (so it lands after Task 4's paragraph):

```markdown
**Team colour on `/standings` is decorative only.** Each row carries a 4px bar in the true hex
and every glyph is a zinc neutral on bare `zinc-950` — no zebra, no hover tint, no highlighted
leader — which is why `standings-tables.tsx` calls no `team-utils` helper at all.
`tests/standings-tables.test.tsx` asserts `inlineColouredText()` is empty and that no table
element carries a `bg-` class, so colouring a name or tinting a row fails there until it has its
own backdrop variant, built the way the five on `/teams` are.

```

- [ ] **Step 6: Commit**

```bash
git add frontend/components/standings/standings-tables.tsx frontend/tests/standings-tables.test.tsx CLAUDE.md
git commit -m "feat(standings): drivers' and constructors' tables"
```

---

### Task 7: The season picker and the page client

**Files:**
- Create: `frontend/components/standings/season-select.tsx`, `frontend/components/standings/standings-page-client.tsx`
- Test: `frontend/tests/standings-page-client.test.tsx`

**Interfaces:**
- Consumes:
  - `useStandings` (Task 5);
  - `DriverStandingsTable` and `ConstructorStandingsTable` (Task 6);
  - `STANDINGS_FIRST_YEAR`, `seasonStamp` and `standingsYears` (Task 4);
  - `Skeleton` from `@/components/ui/skeleton`;
  - `focusRing` and `focusRingOffsetBase` from `@/lib/focus`.
- Produces:
  - `SeasonSelect({ years, value, onChange, className? })`: `years: number[]`, `value: number`, `onChange: (year: number) => void`. It renders a native `<select>` labelled "Season".
  - `StandingsPageClient({ initialYear, latestYear }: { initialYear: number; latestYear: number })`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/standings-page-client.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StandingsPageClient } from '@/components/standings/standings-page-client';
import { getRaces, getStandings } from '@/lib/api';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import type { Race, StandingsResponse } from '@/types';
import races2026 from './fixtures/races-2026.json';
import standings2024 from './fixtures/standings-2024.json';
import standings2026 from './fixtures/standings-2026.json';
import { ZINC, restingTextNeutrals } from './zinc';

vi.mock('@/lib/api', () => ({ getStandings: vi.fn(), getRaces: vi.fn() }));
const getStandingsMock = vi.mocked(getStandings);
const getRacesMock = vi.mocked(getRaces);

const CALENDAR_2026: Race[] = races2026.races;

function race(round: number, name: string): Race {
  return { name, location: 'Somewhere', country: 'Testland', date: '2024-01-01', round };
}

/** 2024's shape: 24 rounds, all held, Abu Dhabi last. */
const CALENDAR_2024: Race[] = [
  ...Array.from({ length: 23 }, (_, i) => race(i + 1, `Round ${i + 1} Grand Prix`)),
  race(24, 'Abu Dhabi Grand Prix'),
];

function notStarted(year: number): StandingsResponse {
  return { year, races_completed: 0, drivers: [], constructors: [] };
}

const MID_SEASON = 'After Round 14 of 23 · Spanish Grand Prix';
const FINAL_2024 = 'After Round 24 of 24 · Abu Dhabi Grand Prix';

function renderPage(initialYear = 2026, latestYear = 2026) {
  return render(<StandingsPageClient initialYear={initialYear} latestYear={latestYear} />);
}

/**
 * A filled button's label, judged against the button's own `zinc-800` fill rather than the page —
 * judging it against `DARK_BG` would pass optimistically while the rendered button failed.
 */
function expectReadableOnButton(label: string) {
  const runs = restingTextNeutrals(document.body).filter((run) => run.text === label);
  expect(runs, label).toHaveLength(1);
  for (const run of runs) {
    expect(contrastRatio(run.hex, ZINC['800'] ?? ''), label).toBeGreaterThanOrEqual(MIN_CONTRAST);
  }
}

beforeEach(() => {
  getStandingsMock.mockReset();
  getRacesMock.mockReset();
  getStandingsMock.mockImplementation(async (year) =>
    year === 2024 ? standings2024 : standings2026,
  );
  getRacesMock.mockImplementation(async (year) => (year === 2024 ? CALENDAR_2024 : CALENDAR_2026));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Stubbed rather than spied through: the real call would move jsdom's URL for later tests.
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StandingsPageClient', () => {
  it('offers every covered season, newest first, with the initial one selected', () => {
    renderPage();

    const select = screen.getByRole('combobox', { name: 'Season' });
    const options = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['2026', '2025', '2024', '2023']);
    expect(select).toHaveValue('2026');
  });

  it('shows the stamp and both tables once the season lands', async () => {
    renderPage();

    expect(await screen.findByText(MID_SEASON)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /^drivers' championship/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /^constructors' championship/i })).toBeInTheDocument();
    expect(screen.queryByText('Final')).toBeNull();
  });

  it('announces the stamp politely', async () => {
    renderPage();

    expect(await screen.findByText(MID_SEASON)).toHaveAttribute('aria-live', 'polite');
  });

  it('marks a finished season final', async () => {
    renderPage(2024);

    expect(await screen.findByText(FINAL_2024)).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('fetches the chosen season and records it in the URL without adding history', async () => {
    renderPage();
    await screen.findByText(MID_SEASON);

    fireEvent.change(screen.getByRole('combobox', { name: 'Season' }), {
      target: { value: '2024' },
    });

    expect(getStandingsMock).toHaveBeenLastCalledWith(2024);
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/standings?year=2024');
    expect(await screen.findByText(FINAL_2024)).toBeInTheDocument();
  });

  it('keeps the latest season on the bare URL', async () => {
    renderPage(2024);
    await screen.findByText(FINAL_2024);

    fireEvent.change(screen.getByRole('combobox', { name: 'Season' }), {
      target: { value: '2026' },
    });

    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/standings');
  });

  it('says a season that has not started has not started, and offers the last one', async () => {
    getStandingsMock.mockImplementation(async (year) =>
      year === 2027 ? notStarted(2027) : standings2026,
    );
    renderPage(2027, 2027);

    expect(await screen.findByText('The 2027 season hasn’t started yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    // Not an error, so nothing offers a retry that could never succeed.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expectReadableOnButton('See the 2026 final standings');

    fireEvent.click(screen.getByRole('button', { name: 'See the 2026 final standings' }));

    expect(getStandingsMock).toHaveBeenLastCalledWith(2026);
    expect(await screen.findByText(MID_SEASON)).toBeInTheDocument();
  });

  it('offers no earlier season before coverage begins', async () => {
    getStandingsMock.mockResolvedValue(notStarted(2023));
    renderPage(2023);

    await screen.findByText('The 2023 season hasn’t started yet.');
    expect(screen.queryByRole('button', { name: /final standings/ })).toBeNull();
  });

  it('offers a retry that works when the standings fail', async () => {
    getStandingsMock.mockRejectedValueOnce(new Error('502'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the championship standings.',
    );
    expectReadableOnButton('Try again');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(MID_SEASON)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows placeholders, not an empty page, while loading', () => {
    getStandingsMock.mockImplementation(() => new Promise<StandingsResponse>(() => {}));
    renderPage();

    expect(screen.getByText('Loading standings…')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('links the constructors to the team profiles', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Compare the teams →' })).toHaveAttribute(
      'href',
      '/teams',
    );
  });

  it('keeps every neutral readable against what is really behind it', async () => {
    renderPage(2024);
    await screen.findByText('Final');

    const runs = restingTextNeutrals(document.body);
    const onChip = runs.filter((run) => run.text === 'Final');
    const onPage = runs.filter((run) => run.text !== 'Final');

    // The chip is the one filled surface in this state; its label is judged against that fill.
    expect(onChip).toHaveLength(1);
    for (const run of onChip) {
      expect(contrastRatio(run.hex, ZINC['800'] ?? '')).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
    expect(onPage.length).toBeGreaterThan(0);
    for (const run of onPage) {
      expect(contrastRatio(run.hex, DARK_BG), run.text).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && mise exec -- pnpm test tests/standings-page-client.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/standings/standings-page-client"`.

- [ ] **Step 3: Implement the season select**

Create `frontend/components/standings/season-select.tsx`:

```tsx
'use client';

import { useId } from 'react';
import { ChevronDown } from 'lucide-react';

import { focusRingOffsetBase } from '@/lib/focus';
import { cn } from '@/lib/utils';

interface SeasonSelectProps {
  /** Newest first, as `standingsYears` returns them. */
  years: number[];
  value: number;
  onChange: (year: number) => void;
  className?: string;
}

/**
 * The `/standings` season picker.
 *
 * A **native `<select>`** for the reasons `livery-select.tsx` gives: a short list of mutually
 * exclusive plain options is what the platform control is for, and it arrives with keyboard
 * operation, typeahead, correct ARIA and the OS picker on a phone already working.
 */
export function SeasonSelect({ years, value, onChange, className }: SeasonSelectProps) {
  const id = useId();

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <label
        htmlFor={id}
        className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
      >
        Season
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={cn(
            'appearance-none rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-3 pr-9',
            'text-sm font-semibold text-white transition-colors hover:border-zinc-600',
            // A filled control on `base`, so the ring is held off the fill by a band of the page
            // colour — the choice `livery-select.tsx` makes, for the same reason.
            focusRingOffsetBase,
          )}
        >
          {years.map((year) => (
            // Explicit colours for Windows and Linux, whose popup list inherits the control's
            // palette; macOS draws it with the system one and ignores both.
            <option key={year} value={year} className="bg-zinc-900 text-white">
              {year}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the page client**

Create `frontend/components/standings/standings-page-client.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';

import { SeasonSelect } from '@/components/standings/season-select';
import {
  ConstructorStandingsTable,
  DriverStandingsTable,
} from '@/components/standings/standings-tables';
import { Skeleton } from '@/components/ui/skeleton';
import { useStandings } from '@/hooks/use-standings';
import { focusRing, focusRingOffsetBase } from '@/lib/focus';
import { STANDINGS_FIRST_YEAR, seasonStamp, standingsYears } from '@/lib/standings';
import { cn } from '@/lib/utils';

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
const SECTION_HEADING = 'text-2xl font-black uppercase tracking-tight text-ink';
/** The link treatment `/credits` uses. A flush ring, because a text link is not a filled control. */
const LINK = cn(
  'rounded text-sm text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400',
  focusRing,
);
/** A filled neutral button: its label is judged against `zinc-800`, the fill it sits on. */
const BUTTON = cn(
  'rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-700',
  focusRingOffsetBase,
);

/** Stable keys for the placeholder rows — `react/no-array-index-key` forbids the index. */
const SKELETON_SECTIONS = ['drivers', 'constructors'] as const;
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

interface StandingsPageClientProps {
  /** The season `?year=` asked for, already validated by `parseStandingsYear`. */
  initialYear: number;
  /** The newest season, read from the server's clock so render never reads one. */
  latestYear: number;
}

/**
 * `/standings`: one season's drivers' and constructors' tables, stacked, with a picker.
 *
 * Both tables are always in the page — no tabs, no `AnimatePresence` swap — so either is
 * reachable without interaction and both stay testable. The four states are mutually exclusive:
 * loading, error, a season that has not started, and data.
 */
export function StandingsPageClient({ initialYear, latestYear }: StandingsPageClientProps) {
  const [year, setYear] = useState(initialYear);
  const { standings, calendar, loading, error, retry } = useStandings(year);

  const selectYear = useCallback(
    (next: number) => {
      setYear(next);
      // Replace, not push: a picker is not navigation, so it should not fill the back stack, and
      // nothing then needs a `popstate` handler. Next 14.2 syncs native history calls into its
      // router, so this costs no server round trip. The newest season keeps the bare URL.
      window.history.replaceState(
        null,
        '',
        next === latestYear ? '/standings' : `/standings?year=${next}`,
      );
    },
    [latestYear],
  );

  const stamp = standings ? seasonStamp(standings.races_completed, calendar) : null;
  const notStarted = standings !== null && standings.races_completed === 0;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <header className="mb-12">
        <p className={cn('mb-3 flex items-center gap-3', LABEL)}>
          {/* The repeated red tick — decorative, so it is not held to a text-contrast bar. */}
          <span aria-hidden="true" className="h-1.5 w-5 flex-shrink-0 bg-f1-red" />
          {year} Season
        </p>
        <h1 className="mb-6 text-4xl font-black uppercase tracking-tight text-ink md:text-5xl">
          Championship Standings
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Polite, so a season change is announced once its table has landed. `min-h-6` holds
              the row's height while the stamp is still empty. */}
          <p
            aria-live="polite"
            className="flex min-h-6 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400"
          >
            {stamp?.label}
            {stamp?.final && (
              <span className="rounded-sm bg-zinc-800 px-1.5 py-0.5 font-sans font-semibold text-zinc-200">
                Final
              </span>
            )}
          </p>
          <SeasonSelect years={standingsYears(latestYear)} value={year} onChange={selectYear} />
        </div>
      </header>

      {loading && <LoadingState />}
      {error && <ErrorState onRetry={retry} />}
      {notStarted && <NotStartedState year={year} onSelectYear={selectYear} />}
      {standings && !notStarted && (
        <>
          <section aria-labelledby="drivers-heading" className="mb-16">
            <h2 id="drivers-heading" className={cn('mb-6', SECTION_HEADING)}>
              Drivers
            </h2>
            <DriverStandingsTable rows={standings.drivers} />
          </section>
          <section aria-labelledby="constructors-heading">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <h2 id="constructors-heading" className={SECTION_HEADING}>
                Constructors
              </h2>
              <Link href="/teams" className={LINK}>
                Compare the teams →
              </Link>
            </div>
            <ConstructorStandingsTable rows={standings.constructors} />
          </section>
        </>
      )}
    </div>
  );
}

/** Placeholder rows in both sections' place, read out once rather than as a dozen empty rows. */
function LoadingState() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Loading standings…</p>
      {SKELETON_SECTIONS.map((section) => (
        <div key={section} aria-hidden="true" className="mb-16 space-y-3">
          <Skeleton className="mb-6 h-7 w-40 bg-zinc-800 motion-reduce:animate-none" />
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className="h-9 w-full bg-zinc-900 motion-reduce:animate-none" />
          ))}
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <p className="text-sm text-zinc-300">Could not load the championship standings.</p>
      <button type="button" onClick={onRetry} className={BUTTON}>
        Try again
      </button>
    </div>
  );
}

/**
 * A season with no race yet. Not an error — the route answers it with a 200 and empty tables —
 * so the page says what is true and offers last season's final table, not a retry that could
 * never succeed.
 */
function NotStartedState({
  year,
  onSelectYear,
}: {
  year: number;
  onSelectYear: (year: number) => void;
}) {
  const previous = year - 1;
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-sm text-zinc-300">The {year} season hasn&rsquo;t started yet.</p>
      {previous >= STANDINGS_FIRST_YEAR && (
        <button type="button" onClick={() => onSelectYear(previous)} className={BUTTON}>
          See the {previous} final standings
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests, the type check and lint**

Run: `cd frontend && mise exec -- pnpm test tests/standings-page-client.test.tsx && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/standings/season-select.tsx frontend/components/standings/standings-page-client.tsx frontend/tests/standings-page-client.test.tsx
git commit -m "feat(standings): season picker and page client with loading, error and pre-season states"
```

---

### Task 8: The route, the nav entry and the cross-links

**Files:**
- Create: `frontend/app/standings/page.tsx`
- Test: `frontend/tests/standings-page.test.tsx`
- Modify: `frontend/components/landing/links.ts`, `frontend/components/landing/landing-nav.tsx` (comments only), `frontend/tests/landing-nav.test.tsx`
- Modify: `frontend/components/teams/teams-comparison-grid.tsx`, `frontend/tests/teams-comparison-grid.test.tsx`
- Modify: `CLAUDE.md` (the feature list), `README.md` (the Frontend Routes table)

**Interfaces:**
- Consumes: `StandingsPageClient` (Task 7); `parseStandingsYear` and `STANDINGS_FIRST_YEAR` (Task 4); `LandingNav`.
- Produces:
  - the route `/standings`, `default export function StandingsPage({ searchParams }: { searchParams: { year?: string | string[] } })`;
  - `NAV_LINKS` gains `{ href: '/standings', label: 'Standings' }` before Teams.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/standings-page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import StandingsPage from '@/app/standings/page';

vi.mock('next/navigation', () => ({ usePathname: () => '/standings' }));
// Never settles: this suite is about which season the page opens on, not about its data.
vi.mock('@/lib/api', () => ({
  getStandings: vi.fn(() => new Promise(() => {})),
  getRaces: vi.fn(() => new Promise(() => {})),
}));

beforeEach(() => {
  // Only the clock: the page reads the newest season from it, and nothing here waits on a timer.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-22T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StandingsPage', () => {
  it.each([
    ['2024', '2024'],
    ['2023', '2023'],
    ['2019', '2026'],
    ['abc', '2026'],
    [undefined, '2026'],
  ])('?year=%s opens on %s', (param, shown) => {
    render(<StandingsPage searchParams={{ year: param }} />);

    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveValue(shown);
  });

  it('marks Standings as the current page in the nav', () => {
    render(<StandingsPage searchParams={{}} />);

    expect(screen.getByRole('link', { name: 'Standings' })).toHaveAttribute('aria-current', 'page');
  });
});
```

In `frontend/tests/landing-nav.test.tsx`, replace:

```ts
  ['/tyres', 'Tyres'],
  ['/teams', 'Teams'],
```

with:

```ts
  ['/tyres', 'Tyres'],
  // The table sits before the profiles it leads to, and leaves Teams beside Showcase, which
  // shares its liveries.
  ['/standings', 'Standings'],
  ['/teams', 'Teams'],
```

In the same file, replace the comment line:

```ts
   * Six links do not fit a 390 px viewport, so the row scrolls — which means the link for the page
```

with:

```ts
   * Seven links do not fit a 390 px viewport, so the row scrolls — which means the link for the page
```

In `frontend/tests/teams-comparison-grid.test.tsx`, add inside `describe('TeamsComparisonGrid', …)`, after the `links each row to its team’s section` test:

```tsx
  it('points its frozen stamp at the live standings', () => {
    renderGrid();

    expect(screen.getByRole('link', { name: 'Live standings →' })).toHaveAttribute(
      'href',
      '/standings',
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && mise exec -- pnpm test tests/standings-page.test.tsx tests/landing-nav.test.tsx tests/teams-comparison-grid.test.tsx`
Expected: FAIL, in three places:
- `Failed to resolve import "@/app/standings/page"`;
- the nav's `NAV_LINKS` comparison (no Standings);
- the grid: no "Live standings →" link.

- [ ] **Step 3: Implement the route**

Create `frontend/app/standings/page.tsx`:

```tsx
import type { Metadata } from 'next';

import { LandingNav } from '@/components/landing/landing-nav';
import { StandingsPageClient } from '@/components/standings/standings-page-client';
import { parseStandingsYear, STANDINGS_FIRST_YEAR } from '@/lib/standings';

export const metadata: Metadata = {
  title: 'F1 Championship Standings',
  description: `The drivers' and constructors' championship tables for every Formula 1 season since ${STANDINGS_FIRST_YEAR}, summed from each race's results.`,
};

interface StandingsPageProps {
  searchParams: { year?: string | string[] };
}

/**
 * `/standings`.
 *
 * The clock and `?year=` are both read **here, on the server**, and handed down as props, so the
 * client never calls `new Date()` during render and cannot hydrate a different season either
 * side of midnight on New Year's Eve — the trap `use-races.ts` documents. Reading `searchParams`
 * also makes the route dynamic, which a live table wants anyway.
 */
export default function StandingsPage({ searchParams }: StandingsPageProps) {
  const latestYear = new Date().getFullYear();
  const initialYear = parseStandingsYear(searchParams.year, latestYear);

  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-zinc-950 pt-14">
        <StandingsPageClient initialYear={initialYear} latestYear={latestYear} />
      </main>
    </>
  );
}
```

- [ ] **Step 4: Add the nav entry**

In `frontend/components/landing/links.ts`, replace:

```ts
  { href: '/tyres', label: 'Tyres' },
  { href: '/teams', label: 'Teams' },
```

with:

```ts
  { href: '/tyres', label: 'Tyres' },
  // Before Teams on purpose: the table answers who is winning and Teams answers who they are, so
  // a name in the table is one link from its profile — and it leaves Teams beside Showcase, which
  // shares the liveries.
  { href: '/standings', label: 'Standings' },
  { href: '/teams', label: 'Teams' },
```

In `frontend/components/landing/landing-nav.tsx`, replace:

```tsx
   * Six links overflow a phone, so the row scrolls — and the link for the page you are on can
```

with:

```tsx
   * Seven links overflow a phone, so the row scrolls — and the link for the page you are on can
```

and replace:

```tsx
         * unreachable on a phone, and `/tyres` has since made it a six-link row.
```

with:

```tsx
         * unreachable on a phone, and `/tyres` and `/standings` have since made it a seven-link row.
```

- [ ] **Step 5: Add the cross-link on `/teams`**

In `frontend/components/teams/teams-comparison-grid.tsx`, add `import Link from 'next/link';` directly below `import { Check, Plus } from 'lucide-react';`. Add this constant directly below the `SORTS` array:

```tsx
/**
 * The link treatment `/credits` uses. The ring is flush: this is a text link on the section's bare
 * `bg-zinc-950`, not a filled control.
 */
const LIVE_LINK = cn(
  'rounded text-xs text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400',
  focusRing,
);
```

Then replace:

```tsx
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
          {STANDINGS_AS_OF}
        </p>
```

with:

```tsx
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            {STANDINGS_AS_OF}
          </p>
          {/* The stamp above is frozen on purpose — this section explores the teams, it is not
              the championship — so it points at the live table rather than pretending to be one. */}
          <Link href="/standings" className={LIVE_LINK}>
            Live standings →
          </Link>
        </div>
```

- [ ] **Step 6: Update the docs**

In `CLAUDE.md`, replace:

```markdown
    <feature>/   Page sections: landing/, briefing/, teams/, teardown/, tyres/
```

with:

```markdown
    <feature>/   Page sections: landing/, briefing/, standings/, teams/, teardown/, tyres/
```

In `README.md`'s Frontend Routes table, insert directly above the `| \`/teams\` |` row:

```markdown
| `/standings` | Drivers' and constructors' championship tables for every season since 2023, with a season picker |
```

- [ ] **Step 7: Run the affected suites, then everything**

Run: `cd frontend && mise exec -- pnpm test tests/standings-page.test.tsx tests/landing-nav.test.tsx tests/teams-comparison-grid.test.tsx`
Expected: PASS.

Run: `cd frontend && mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm test`
Expected: all PASS. The whole suite runs here, because the nav renders on every page test.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/standings/page.tsx frontend/tests/standings-page.test.tsx frontend/components/landing/links.ts frontend/components/landing/landing-nav.tsx frontend/tests/landing-nav.test.tsx frontend/components/teams/teams-comparison-grid.tsx frontend/tests/teams-comparison-grid.test.tsx CLAUDE.md README.md
git commit -m "feat(standings): /standings route, nav entry and cross-links with /teams"
```

---

### Task 9: Full verification and the browser pass

No new code unless a check fails. **If any check fails:**
1. stop and use superpowers:systematic-debugging;
2. write a failing test where jsdom *can* see the defect;
3. fix it, commit it, and re-run from Step 1.

**Files:** none expected.

- [ ] **Step 1: Run every suite and the production build**

Run:

```bash
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest
cd ../frontend && mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm test && mise exec -- pnpm build
```

Expected: every command exits 0. `pnpm build` lists `/standings` as `ƒ (Dynamic)`.

- [ ] **Step 2: Start both servers**

Check the ports are free: `lsof -i :8000 -i :3131` should print nothing.

Backend. `CORS_ORIGINS` must name the dev server's origin, because it defaults to 3000 and 3001 only:

```bash
cd backend && GOOGLE_API_KEY=unused CORS_ORIGINS=http://localhost:3131 .venv/bin/uvicorn main:app --port 8000
```

Frontend:

```bash
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8000 mise exec -- pnpm dev --port 3131
```

Open `http://localhost:3131/standings` in the Browser pane with `preview_start({ url })`. The pane runs hidden, so set a real viewport first with `resize_window` (width 1440, height 900). Drive checks with `javascript_tool`; screenshot only settled states.

- [ ] **Step 3: Check 2026 content (spec check 1)**

```js
({
  drivers: document.querySelectorAll('table')[0]?.querySelectorAll('tbody tr').length,
  constructors: document.querySelectorAll('table')[1]?.querySelectorAll('tbody tr').length,
  stamp: document.querySelector('[aria-live="polite"]')?.textContent,
})
```

Expected: `{ drivers: 23, constructors: 11, stamp: "After Round 14 of 23 · Spanish Grand Prix" }`.

- [ ] **Step 4: Check 2024, the Final chip and the unmatched teams (spec check 2)**

Navigate to `http://localhost:3131/standings?year=2024` and wait for the tables. Then:

```js
({
  stamp: document.querySelector('[aria-live="polite"]')?.textContent,
  unmatched: [...document.querySelectorAll('[data-team-bar="unmatched"]')].map(
    (bar) => bar.closest('td')?.textContent,
  ),
  navCurrent: document.querySelector('nav a[aria-current="page"]')?.textContent,
})
```

Expected:
- `stamp` contains `After Round 24 of 24 · Abu Dhabi Grand Prix` followed by `Final`;
- `unmatched` includes `Kick Sauber` and `RB` (driver rows add their team name after the driver's);
- `navCurrent` is `Standings`, so `aria-current` survives the query string (spec check 7).

- [ ] **Step 5: Check the 390px overflow (spec check 3)**

`resize_window` to width 390, height 844, then run `window.dispatchEvent(new Event('resize'))`. Then:

```js
({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })
```

Expected: the two values are equal (390). Take a screenshot of the top of the page. The stamp, picker and first rows should be legible, with no clipped text.

- [ ] **Step 6: Check contrast from computed values (spec check 4)**

Back at 1440 wide, on 2026:

```js
(() => {
  const channel = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const rgba = (s) => { const v = s.match(/[\d.]+/g).map(Number); return v.length === 3 ? [...v, 1] : v; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const failures = [];
  const translucent = [];
  for (const table of document.querySelectorAll('table')) {
    for (const el of table.querySelectorAll('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || getComputedStyle(el).visibility === 'hidden') continue;
      let bg = null;
      for (let n = el; n && !bg; n = n.parentElement) {
        const c = rgba(getComputedStyle(n).backgroundColor);
        if (c[3] === 1) bg = c;
        else if (c[3] > 0) translucent.push(n.tagName + '.' + n.className);
      }
      const r = ratio(rgba(getComputedStyle(el).color), bg ?? [255, 255, 255, 1]);
      if (r < 4.5) failures.push({ text: el.textContent.trim().slice(0, 30), r: r.toFixed(2) });
    }
  }
  return { failures, translucent: [...new Set(translucent)] };
})()
```

Expected: `{ failures: [], translucent: [] }`. Text marked `sr-only` still passes, since it inherits the same colours.

- [ ] **Step 7: Check what is really behind the glyphs (spec check 5)**

The structural check comes first. Find what is painted at the centre of a driver name:

```js
(() => {
  const name = [...document.querySelectorAll('tbody td span.block')][0];
  const box = name.getBoundingClientRect();
  return document
    .elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    .map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
})()
```

Expected: only the name's own spans, then `td`, `tr`, `tbody`, `table`, the page wrappers, `main.min-h-screen`, `body` and `html`. No absolutely positioned layer should appear.

Then the pixel check:
1. Run `document.querySelectorAll('table').forEach((t) => (t.style.color = 'transparent'))`.
2. Take a screenshot and `zoom` into the first rows' name column.
3. The region must be uniformly the page colour `#09090b`, with only the colour bars and row rules visible.
4. Restore with `document.querySelectorAll('table').forEach((t) => (t.style.color = ''))`.

- [ ] **Step 8: Check the focus rings exist and apply (spec check 6)**

```js
(() => {
  const rules = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
    .map((r) => r.selectorText ?? '').filter((t) => t.includes('focus-visible'));
  const select = document.querySelector('select');
  select.focus();
  return {
    redRing: rules.some((t) => t.includes('ring-f1-red')),
    baseOffset: rules.some((t) => t.includes('ring-offset-base')),
    selectFocusVisible: select.matches(':focus-visible'),
    selectShadow: getComputedStyle(select).boxShadow,
  };
})()
```

Expected:
- `redRing` and `baseOffset` are `true`;
- if `selectFocusVisible` is `true`, `selectShadow` contains `rgb(225, 6, 0)` (f1-red), **not** `rgb(59, 130, 246)` (Tailwind's default blue — the defect CLAUDE.md documents).

- [ ] **Step 9: Check a season change makes no RSC round trip (spec check 7)**

On `/standings`, call `read_network_requests` once and note how many entries it lists; the list
cannot be cleared, so only entries after that point count. Then change the season:

```js
const select = document.querySelector('select');
Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '2025');
select.dispatchEvent(new Event('change', { bubbles: true }));
```

Then call `read_network_requests` again, first with `urlPattern: "_rsc"` and then unfiltered.
Expected, among the entries added since the first read:
- no `_rsc` request;
- a request to `http://localhost:8000/api/standings/2025`;
- `location.search` is `?year=2025`.

- [ ] **Step 10: Check the pre-season state by stubbing the response (spec check 8)**

The route rejects next year with a 422, so the state cannot be reached live. Stub fetch in the page, then change the season:

```js
const realFetch = window.fetch;
window.fetch = (url, ...rest) =>
  String(url).includes('/api/standings/')
    ? Promise.resolve(new Response(JSON.stringify({ year: 2024, races_completed: 0, drivers: [], constructors: [] }), { headers: { 'content-type': 'application/json' } }))
    : realFetch(url, ...rest);
const select = document.querySelector('select');
Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '2024');
select.dispatchEvent(new Event('change', { bubbles: true }));
```

Then read `document.querySelector('main').innerText`.
Expected:
- it contains `The 2024 season hasn’t started yet.` and a `See the 2023 final standings` button;
- no table is present;
- no `Try again` button is present.

Reload the page afterwards to drop the stub.

- [ ] **Step 11: Check the cross-links**

- `/standings`: `Compare the teams →` has `href="/teams"`.
- `/teams`: `document.querySelector('a[href="/standings"]')?.textContent` is `Live standings →`, and it sits beside the "After Round 11 · Hungary" stamp. Screenshot that header at 1440 and at 390.

- [ ] **Step 12: Stop the servers and confirm a clean tree**

Stop both servers. Then run: `git status --short`
Expected: empty, or only files a failed check legitimately changed and committed. No `package-lock.json` anywhere.
