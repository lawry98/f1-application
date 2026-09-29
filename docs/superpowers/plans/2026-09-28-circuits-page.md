# Circuits Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/circuits` (a season grid of circuit outlines) and `/circuits/[slug]` (circuit facts plus recent winners fetched on demand), with a cached backend winners route matched by circuit rather than by Grand Prix name.

**Architecture:**
- **Geometry** stays client-side static data. The converter gains five past-season aliases and emits a points-free `catalog.json`.
- **The grid** lazy-loads one chunk per unique circuit through the existing `loadCircuit`. The detail page loads its outline server-side.
- **Winners** come from a new plain helper, `backend/tools/circuit_winners.py`. It matches schedule `Location` → `index.json` → circuit id and caches per `(circuit_id, year)` for the life of the process, with a single-flight lock per circuit.
- **Year handling** copies `/standings`: `useSearchParams`, `replaceState`, `force-dynamic`.

**Tech Stack:**
- Next.js 14.2 App Router, React, Tailwind, motion, Vitest + RTL (jsdom), Playwright
- FastAPI 0.128, FastF1, pytest + freezegun

**Spec:** `docs/superpowers/specs/2026-09-28-circuits-page-design.md`. Read it first: the Findings section is the "why" behind most tasks.

## Global Constraints

**General**
- Read `CLAUDE.md` before starting. Its circuit-geometry, standings-URL and browser-tests sections apply.
- The join key is `location`, never `circuit_id`. No second alias table: aliases live only in `LOCATION_ALIASES` in `frontend/scripts/fetch-circuit-geometry.mjs`.
- Never static-import `data/circuits/<id>.json` outside the existing three files (`components/landing/landing-hero.tsx`, `components/briefing/briefing-chat.tsx`, `app/candy/page.tsx`).
- The TS `locationSlug`, the converter's `slug()` and the new Python `location_slug` must be byte-identical. `frontend/tests/fixtures/slug-cases.json` is the shared contract.

**Frontend**
- `pnpm` via `mise exec -- pnpm …`, never npm.
- Files kebab-case, named exports (only `app/**/page.tsx` default-exports).
- Never `sm:text-base` or any breakpoint-scoped `text-base`; use `sm:text-[1rem]`.
- No team or accent colour on text. Every glyph is a zinc neutral or `text-ink` on bare `zinc-950`.
- Every focusable control uses `focusRing` / `focusRingOffsetBase` from `lib/focus.ts`.
- Fixtures under `frontend/tests/fixtures/` are captured from real routes, never hand-written.

**Backend**
- `tools/` never raise: return `{"error": ...}`.
- Env vars only in `config.py` (`CIRCUIT_INDEX_PATH` is a constant, not an env var).
- `logger`, not `print`.
- Upstream detail is masked behind a `GENERIC_*_ERROR` constant in `api/errors.py`.

**Verification (all must pass before the branch is done)**
- `cd frontend && mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm test`
- `cd frontend && mise exec -- pnpm build && mise exec -- pnpm test:browser`
- `cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest`

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `frontend/scripts/fetch-circuit-geometry.mjs` | modify | +5 aliases; emit `catalog.json` |
| `frontend/data/circuits/index.json` | regenerate | +5 alias keys |
| `frontend/data/circuits/catalog.json` | create (generated) | id → canonical slug + facts, no points |
| `frontend/tests/fixtures/slug-cases.json` | create | shared slug test vectors (TS + Python) |
| `frontend/tests/circuit-catalog.test.ts` | create | catalog ↔ outline files agreement; aliases present |
| `frontend/tests/circuit-geometry.test.ts` | modify | slug cases read from `slug-cases.json`; new lookups |
| `backend/api/routes.py` | modify | `/api/races` +2 fields; new winners route |
| `backend/api/errors.py` | modify | `GENERIC_CIRCUIT_WINNERS_ERROR` |
| `backend/config.py` | modify | `CIRCUIT_INDEX_PATH` |
| `backend/tools/circuit_winners.py` | create | slug port, matcher, cache, single flight |
| `backend/tests/test_circuit_winners.py` | create | helper tests |
| `backend/tests/conftest.py` | modify | autouse cache clear for `circuit_winners` |
| `backend/tests/api/test_routes.py` | modify | races fields; winners route |
| `frontend/types/f1.ts` | modify | `Race` +2 fields; `CircuitWinner`, `CircuitWinnersResponse` |
| `frontend/lib/api.ts` | modify | `getCircuitWinners` |
| `frontend/lib/circuit-geometry.ts` | modify | `CircuitEntry`, `circuitEntry`, `canonicalSlug`, `circuitSlugForLocation`, `circuitBySlug` |
| `frontend/lib/circuit-route.ts` | create | pure detail-route resolution (render / redirect / notFound) |
| `frontend/tests/circuit-imports.test.ts` | create | source scan: no new static outline imports |
| `frontend/hooks/use-season-circuits.ts` | create | calendar + outlines for a season |
| `frontend/hooks/use-circuit-winners.ts` | create | winners fetch with retry |
| `frontend/hooks/use-calendar-race.ts` | create | this circuit's race in a season, or null |
| `frontend/components/circuits/circuit-card.tsx` | create | one grid card |
| `frontend/components/circuits/circuits-page-client.tsx` | create | `/circuits` client |
| `frontend/components/circuits/circuit-detail-client.tsx` | create | `/circuits/[slug]` client |
| `frontend/components/circuits/circuit-winners.tsx` | create | winners section |
| `frontend/app/circuits/page.tsx` | create | server wrapper, `force-dynamic` |
| `frontend/app/circuits/[slug]/page.tsx` | create | server: resolve, redirect/404, load outline |
| `frontend/lib/standings.ts` | modify | `SeasonStamp` +`lead`, +`event` |
| `frontend/components/standings/standings-page-client.tsx` | modify | circuits link; stamp event links |
| `frontend/components/briefing/briefing-circuit-band.tsx` | modify | CIRCUIT row value becomes a link |
| `frontend/components/landing/links.ts` | modify | Circuits nav entry |
| `frontend/browser/support/api-mocks.ts` | modify | winners fixture route |
| `frontend/browser/{a11y-smoke,focus-rings,invisible-text}.spec.ts` | modify | add circuits routes |
| `frontend/browser/circuits.spec.ts` | create | grid count, replaceState + Back, redirect, click-through |
| `frontend/tests/fixtures/races-2026.json` | re-capture | new fields |
| `frontend/tests/fixtures/circuit-winners-it-1922.json` | capture | Monza winners |
| `frontend/tests/fixtures/README.md` | modify | document both |
| `CLAUDE.md`, `README.md` | modify | docs |

All frontend paths below are relative to `frontend/` inside a `cd frontend` block, and backend paths are relative to `backend/`.

---

### Task 1: Circuit data — past-season aliases, catalog, shared slug vectors

**Files:**
- Modify: `frontend/scripts/fetch-circuit-geometry.mjs` (the `LOCATION_ALIASES` block at ~line 53–69, `main()` at ~126–162)
- Regenerate: `frontend/data/circuits/index.json`
- Create: `frontend/data/circuits/catalog.json` (generated)
- Create: `frontend/tests/fixtures/slug-cases.json`
- Create: `frontend/tests/circuit-catalog.test.ts`
- Modify: `frontend/tests/circuit-geometry.test.ts` (the `locationSlug` `it.each` block at ~line 36–56)

**Interfaces:**
- Produces:
  - `data/circuits/catalog.json`: `Array<{ id: string; slug: string; name: string; location: string; lengthM: number; firstGp: number }>`, sorted by `id`.
  - `index.json` gains keys `yas-island`, `abu-dhabi` → `ae-2009`; `spa` → `be-1925`; `nurburgring` → `de-1927`; `mugello` → `it-1914`.
  - `tests/fixtures/slug-cases.json`: `Array<[input: string, expected: string]>`.

- [ ] **Step 1: Write the shared slug vectors**

Create `frontend/tests/fixtures/slug-cases.json`:

```json
[
  ["Monza", "monza"],
  ["Montréal", "montreal"],
  ["São Paulo", "sao-paulo"],
  ["Spa-Francorchamps", "spa-francorchamps"],
  ["Las Vegas", "las-vegas"],
  ["Monte-Carlo", "monte-carlo"],
  ["Monte Carlo", "monte-carlo"],
  ["Nürburgring", "nurburgring"],
  ["Yas Island", "yas-island"],
  ["Scarperia e San Piero", "scarperia-e-san-piero"],
  ["  Marina  Bay  ", "marina-bay"]
]
```

- [ ] **Step 2: Point the TS slug test at the shared vectors**

In `frontend/tests/circuit-geometry.test.ts`, add `import slugCases from './fixtures/slug-cases.json';` to the imports. Then replace the `it.each([...])` block **and** the separate `'collapses runs of separators and trims the ends'` test inside `describe('locationSlug', …)` with:

```ts
  /*
   * The vectors are shared with `backend/tests/test_circuit_winners.py`, which pins the Python
   * port against the same file. Three copies of this rule exist — here, `slug()` in
   * `scripts/fetch-circuit-geometry.mjs`, and `location_slug` in `backend/tools/circuit_winners.py`
   * — and a drift between any two silently returns null for every lookup that depends on it.
   */
  it.each(slugCases as [string, string][])('slugs %j to %s', (location, expected) => {
    expect(locationSlug(location)).toBe(expected);
  });
```

Keep the existing comment above it, but change "each one is a real 2026-calendar location" to "each one is a real FastF1 or bacinger location".

- [ ] **Step 3: Write the failing catalog test**

Create `frontend/tests/circuit-catalog.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import catalog from '@/data/circuits/catalog.json';
import index from '@/data/circuits/index.json';
import { locationSlug } from '@/lib/circuit-geometry';

/**
 * `catalog.json` is the points-free view of the 40 outline files: the grid's links and the detail
 * page's facts come from it so neither has to download an outline. It is generated by
 * `scripts/fetch-circuit-geometry.mjs` alongside the outlines, and this is what keeps the two in
 * step — a re-export that changes a circuit and not the catalog fails here.
 */
const DIR = resolve(__dirname, '..', 'data', 'circuits');
const OUTLINE_FILE = /^[a-z]{2}-\d{4}\.json$/;
const files = readdirSync(DIR).filter((name) => OUTLINE_FILE.test(name)).sort();
const LOCATION_TO_ID: Record<string, string> = index;

describe('catalog.json', () => {
  it('has exactly one entry per outline file, sorted by id', () => {
    expect(catalog.map((entry) => `${entry.id}.json`)).toEqual(files);
  });

  it.each(files)('agrees with %s on every field it copies', (file) => {
    const outline = JSON.parse(readFileSync(resolve(DIR, file), 'utf8')) as Record<string, unknown>;
    const entry = catalog.find((row) => `${row.id}.json` === file);
    expect(entry).toEqual({
      id: outline.id,
      slug: locationSlug(outline.location as string),
      name: outline.name,
      location: outline.location,
      lengthM: outline.lengthM,
      firstGp: outline.firstGp,
    });
  });

  it('gives every circuit a unique canonical slug that resolves back to it', () => {
    const slugs = catalog.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const entry of catalog) expect(LOCATION_TO_ID[entry.slug]).toBe(entry.id);
  });
});

describe('index.json', () => {
  it('only ever points at a circuit that has an outline file', () => {
    for (const id of Object.values(LOCATION_TO_ID)) expect(files).toContain(`${id}.json`);
  });

  /*
   * FastF1 spells these locations differently in seasons before 2026. Without them Abu Dhabi
   * 2020–25 (`Yas Island`) and every Belgian GP before 2022 (`Spa`) resolve to nothing — the
   * briefing band drew no outline for them, and the winners matcher would miss them.
   */
  it.each([
    ['yas-island', 'ae-2009'],
    ['abu-dhabi', 'ae-2009'],
    ['spa', 'be-1925'],
    ['nurburgring', 'de-1927'],
    ['mugello', 'it-1914'],
  ])('aliases the earlier-season spelling %s to %s', (slug, id) => {
    expect(LOCATION_TO_ID[slug]).toBe(id);
  });
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `cd frontend && mise exec -- pnpm vitest run tests/circuit-catalog.test.ts tests/circuit-geometry.test.ts`
Expected: `circuit-catalog.test.ts` fails to resolve `@/data/circuits/catalog.json`. `circuit-geometry.test.ts` passes, because the vectors already hold for the TS function.

- [ ] **Step 5: Extend the converter**

In `frontend/scripts/fetch-circuit-geometry.mjs`, replace the `LOCATION_ALIASES` doc comment and object with:

```js
/**
 * FastF1 `Location` values that do not match a bacinger `Location`.
 *
 * Everything else matches once both sides are slugged, including the ones that only differ by an
 * accent or a hyphen (Montréal/Montreal, São Paulo/Sao Paulo, Spa-Francorchamps/Spa
 * Francorchamps). These are genuinely different names for the same place, so no amount of string
 * normalising will join them.
 *
 * The first five come from the 2026 calendar. The rest are how FastF1 spells the same circuits in
 * **earlier** seasons — measured 2026-09-28 across 1955–2025 — and they matter because the winners
 * route walks past seasons and the briefing band draws any year a user asks for: `Yas Island` is
 * Abu Dhabi 2020–25, `Spa` is every Belgian GP before 2022.
 *
 * Keys are slugged FastF1 locations; values are slugged bacinger locations.
 */
const LOCATION_ALIASES = {
  bahrain: 'sakhir',
  'miami-gardens': 'miami',
  'monte-carlo': 'monaco',
  'kuala-lumpur': 'sepang',
  'marina-bay': 'singapore',
  'yas-island': 'yas-marina',
  'abu-dhabi': 'yas-marina',
  spa: 'spa-francorchamps',
  nurburgring: 'nurburg',
  mugello: 'scarperia-e-san-piero',
};
```

In `main()`, declare `const catalog = [];` next to `const index = {};`. Inside the `for (const feature of collection.features)` loop, directly after `index[slug(location)] = id;`, add:

```js
    catalog.push({
      id,
      slug: slug(location),
      name,
      location,
      lengthM: length ?? null,
      firstGp: firstgp ?? null,
    });
```

After the `index.json` `writeFile`, add:

```js
  // The points-free view the grid and detail page read, so neither downloads an outline to learn a
  // circuit's slug, name or length. `tests/circuit-catalog.test.ts` checks it against every outline.
  catalog.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(join(OUT_DIR, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
```

Update the final `console.log` to `` `wrote ${written} circuits, ${catalog.length} catalog entries and ${Object.keys(index).length} location keys` ``.

- [ ] **Step 6: Regenerate, keeping every committed outline byte-for-byte**

Run: `cd frontend && node scripts/fetch-circuit-geometry.mjs && git status --short data/circuits/`

The expected changes are `M data/circuits/index.json` and `?? data/circuits/catalog.json` and nothing else. If any `data/circuits/<id>.json` shows as modified or added (upstream `master` moved), discard the outline changes and rebuild the catalog and index from the committed files. The landing hero, the band and `/candy` are tuned to the current shapes.

```bash
cd frontend && git checkout -- 'data/circuits/[a-z][a-z]-*.json' && git clean -f 'data/circuits/[a-z][a-z]-*.json'
```

```bash
cd frontend && node -e '
const fs = require("fs");
const dir = "data/circuits";
const slug = (v) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const rows = fs.readdirSync(dir).filter((f) => /^[a-z]{2}-\d{4}\.json$/.test(f)).sort()
  .map((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8")))
  .map((c) => ({ id: c.id, slug: slug(c.location), name: c.name, location: c.location, lengthM: c.lengthM, firstGp: c.firstGp }));
fs.writeFileSync(`${dir}/catalog.json`, JSON.stringify(rows, null, 2) + "\n");
const index = {};
for (const r of rows) index[r.slug] = r.id;
const aliases = { bahrain: "sakhir", "miami-gardens": "miami", "monte-carlo": "monaco", "kuala-lumpur": "sepang", "marina-bay": "singapore", "yas-island": "yas-marina", "abu-dhabi": "yas-marina", spa: "spa-francorchamps", nurburgring: "nurburg", mugello: "scarperia-e-san-piero" };
for (const [from, to] of Object.entries(aliases)) { if (!index[to]) throw new Error(to); index[from] = index[to]; }
fs.writeFileSync(`${dir}/index.json`, JSON.stringify(Object.fromEntries(Object.entries(index).sort()), null, 2) + "\n");
'
```

Then `git diff data/circuits/index.json`. Expected: exactly five added lines (the five new alias keys) and no removals.

- [ ] **Step 7: Run the tests**

Run: `cd frontend && mise exec -- pnpm vitest run tests/circuit-catalog.test.ts tests/circuit-geometry.test.ts tests/briefing-circuit-band.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/scripts/fetch-circuit-geometry.mjs frontend/data/circuits/index.json frontend/data/circuits/catalog.json frontend/tests/fixtures/slug-cases.json frontend/tests/circuit-catalog.test.ts frontend/tests/circuit-geometry.test.ts
git commit -m "feat(circuits): alias earlier-season FastF1 locations and emit a points-free catalog"
```

---

### Task 2: `/api/races` serves `event_format` and `official_name`, end to end

**Files:**
- Modify: `backend/api/routes.py` (`get_races`, ~line 215–235)
- Modify: `backend/tests/api/test_routes.py` (`test_races_returns_the_calendar`, ~line 794–814)
- Modify: `frontend/types/f1.ts` (`Race`, line 19–25)
- Modify (Race literals): `frontend/tests/use-standings.test.ts:~29`, `frontend/tests/standings-page-client.test.tsx:51`, `frontend/tests/use-races.test.ts:15`, `frontend/tests/race-selector.test.tsx:~66,73`, `frontend/tests/standings.test.ts:22`
- Re-capture: `frontend/tests/fixtures/races-2026.json`
- Modify: `frontend/tests/fixtures/README.md`

**Interfaces:**
- Produces: each `/api/races/{year}` row is `{ name, location, country, date, round, event_format: string, official_name: string }`; TS `Race` has `event_format: string; official_name: string`.

- [ ] **Step 1: Write the failing backend tests**

In `backend/tests/api/test_routes.py`, change the expected dict in `test_races_returns_the_calendar` to:

```python
    assert body["races"][2] == {
        "name": "Monaco Grand Prix",
        "location": "Monaco",
        "country": "Monaco",
        "date": "2025-05-25 00:00:00",
        "round": 3,
        "event_format": "conventional",
        "official_name": "FORMULA 1 MONACO GRAND PRIX",
    }
```

and add below it:

```python
def test_races_falls_back_to_the_event_name_when_the_official_name_is_blank(client, monkeypatch):
    """FastF1 leaves OfficialEventName empty for some historical events; the row still needs a
    name the page can print, and the event name is the honest one.
    """
    schedule = make_schedule([{"name": "Italian Grand Prix", "date": "2025-09-07", "official_name": ""}])
    monkeypatch.setattr(routes_module.fastf1, "get_event_schedule", lambda year: schedule)

    race = client.get("/api/races/2025").json()["races"][0]

    assert race["official_name"] == "Italian Grand Prix"


def test_races_carries_the_sprint_format_through(client, monkeypatch):
    schedule = make_schedule(
        [{"name": "Miami Grand Prix", "date": "2025-05-04", "format": "sprint_qualifying"}]
    )
    monkeypatch.setattr(routes_module.fastf1, "get_event_schedule", lambda year: schedule)

    assert client.get("/api/races/2025").json()["races"][0]["event_format"] == "sprint_qualifying"
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/api/test_routes.py -k races -v`
Expected: the three tests FAIL on missing keys.

- [ ] **Step 3: Implement**

In `backend/api/routes.py` `get_races`, replace the row dict with a call to a new module-level helper, and add the helper above the route:

```python
def _race_row(event: Any) -> dict[str, Any]:
    """One calendar row. ``event_format`` and ``official_name`` are the two fields
    ``get_track_info`` adds over this row, served here so /circuits needs no per-circuit call.
    """
    official = event.get("OfficialEventName")
    return {
        "name": event["EventName"],
        "location": event["Location"],
        "country": event["Country"],
        "date": str(event["EventDate"]),
        "round": int(event["RoundNumber"]) if "RoundNumber" in event else None,
        "event_format": str(event.get("EventFormat", "conventional")),
        # A blank or NaN official name falls back to the event name rather than printing nothing.
        "official_name": official if isinstance(official, str) and official else event["EventName"],
    }
```

and in `get_races`: `races = [_race_row(event) for _, event in schedule.iterrows()]`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/api/test_routes.py -v && .venv/bin/ruff check . && .venv/bin/ruff format .`
Expected: PASS.

- [ ] **Step 5: Add the fields to `Race`**

In `frontend/types/f1.ts`, extend `Race`:

```ts
export interface Race {
  name: string;
  location: string;
  country: string;
  date: string;
  round: number | null;
  /** FastF1's `EventFormat`: `conventional`, `sprint_qualifying`, `sprint_shootout`, `testing`… */
  event_format: string;
  /** FastF1's `OfficialEventName`, or the event name when FastF1 leaves it blank. */
  official_name: string;
}
```

Run `cd frontend && mise exec -- pnpm typecheck`. It fails at each `Race` literal listed under **Files**. In each one, add `event_format: 'conventional', official_name: <the literal's name>`. For example, `standings-page-client.test.tsx:51` becomes:

```ts
  return {
    name,
    location: 'Somewhere',
    country: 'Testland',
    date: '2024-01-01',
    round,
    event_format: 'conventional',
    official_name: name,
  };
```

Do the same in `standings.test.ts:22` and `use-races.test.ts:15`, and in the object literals in `use-standings.test.ts` and `race-selector.test.tsx`. Do **not** touch `RaceInfo` literals (`briefing-chat.test.tsx`, `briefing-circuit-band.test.tsx`, `use-briefing.test.tsx`), which have a different type. Re-run typecheck until clean.

- [ ] **Step 6: Re-capture `races-2026.json` from the real route**

In one terminal:

```bash
cd backend && GOOGLE_API_KEY=unused .venv/bin/python -m uvicorn main:app --port 8000
```

In another:

```bash
curl -sf http://localhost:8000/api/races/2026 | python3 -m json.tool > frontend/tests/fixtures/races-2026.json
```

Then stop the server. Check with `git diff --stat frontend/tests/fixtures/races-2026.json`: only added lines (two per race). If any existing value changed (upstream renumbered), stop and report it rather than committing, because it moves numbers other tests pin.

In `frontend/tests/fixtures/README.md`, under "Standings and calendar fixtures", add after the capture list: `` `races-2026.json` was re-captured on the capture date (`date +%F`) to pick up `event_format` and `official_name`; no existing value changed. ``

- [ ] **Step 7: Run the frontend suite**

Run: `cd frontend && mise exec -- pnpm typecheck && mise exec -- pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/api/routes.py backend/tests/api/test_routes.py frontend/types/f1.ts frontend/tests
git commit -m "feat(api): serve event_format and official_name on the race calendar"
```

---

### Task 3: `tools/circuit_winners.py` — matched by circuit, cached per circuit-year

**Files:**
- Modify: `backend/config.py` (add a section after "Standings cache")
- Create: `backend/tools/circuit_winners.py`
- Create: `backend/tests/test_circuit_winners.py`
- Modify: `backend/tests/conftest.py` (add an autouse cache clear after `_clear_standings_cache`)

**Interfaces:**
- Consumes: `tools.schedule_cache.get_schedule(year) -> pd.DataFrame`; `tools.fastf1_helpers.load_race_session(year, event_name)` → session with `.results` DataFrame (`Position`, `FullName`, `Abbreviation`, `TeamName`, `Time`); `frontend/tests/fixtures/slug-cases.json` (Task 1).
- Produces:
  - `location_slug(location: str) -> str`
  - `format_race_time(value: Any) -> str | None`
  - `UNKNOWN_CIRCUIT: str = "unknown_circuit"`
  - `WINDOW_YEARS: int = 3`
  - `get_recent_circuit_winners(circuit_id: str) -> dict[str, Any]`. It returns `{"circuit_id", "from_year", "to_year", "winners": [{"year", "event", "driver", "driver_code", "team", "time"}], "unavailable_years": [int]}`, or `{"error": str}`, or `{"error": str, "reason": UNKNOWN_CIRCUIT}`.
  - `clear() -> None`

- [ ] **Step 1: Add the config constant**

In `backend/config.py`, add `from pathlib import Path` to the imports and this section after the standings cache block:

```python
# ── Circuit geometry ─────────────────────────────────────────────────────────

# The frontend's slugged-location → circuit-id map, which tools/circuit_winners.py matches FastF1
# schedule rows against. A path into this repo, not deployment config, so it is a constant rather
# than an env var. If the backend is ever deployed without the frontend tree beside it, the winners
# route answers 502 and nothing else is affected.
CIRCUIT_INDEX_PATH: Path = (
    Path(__file__).resolve().parent.parent / "frontend" / "data" / "circuits" / "index.json"
)
```

- [ ] **Step 2: Add the conftest reset**

In `backend/tests/conftest.py`, after `_clear_standings_cache`:

```python
@pytest.fixture(autouse=True)
def _clear_circuit_winners_cache():
    """Reset the cross-request winners cache around every test — it outlives requests by design,
    so without this one test's Monza answers every later one.
    """
    from tools import circuit_winners

    circuit_winners.clear()
    yield
    circuit_winners.clear()
```

- [ ] **Step 3: Write the failing tests**

Create `backend/tests/test_circuit_winners.py`:

```python
"""Tests for tools/circuit_winners.py.

Every test runs on 2026-09-28, so the window is 2023–2025. ``get_schedule`` and
``load_race_session`` are patched at the module's own bindings; conftest's FastF1 guard fails any
test that reaches the network.
"""

import json
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest
from freezegun import freeze_time

from tests.factories import make_schedule
from tools import circuit_winners
from tools.circuit_winners import (
    UNKNOWN_CIRCUIT,
    format_race_time,
    get_recent_circuit_winners,
    location_slug,
)

SLUG_CASES = Path(__file__).resolve().parents[2] / "frontend" / "tests" / "fixtures" / "slug-cases.json"

pytestmark = pytest.mark.usefixtures("_frozen")


@pytest.fixture
def _frozen():
    with freeze_time("2026-09-28"):
        yield


def results(driver: str = "Max Verstappen", code: str = "VER", team: str = "Red Bull Racing"):
    return pd.DataFrame(
        [
            {"Position": 1.0, "FullName": driver, "Abbreviation": code, "TeamName": team,
             "Time": pd.Timedelta(hours=1, minutes=13, seconds=24.325)},
            {"Position": 2.0, "FullName": "Lando Norris", "Abbreviation": "NOR", "TeamName": "McLaren",
             "Time": pd.Timedelta(seconds=19.207)},
        ]
    )


class FakeFastF1:
    """Serves schedules per year and results per (year, event); counts every call."""

    def __init__(self, schedules, fail=frozenset(), delay=0.0):
        self.schedules = schedules
        self.fail = set(fail)
        self.delay = delay
        self.schedule_calls = []
        self.loads = []
        self._lock = threading.Lock()

    def get_schedule(self, year):
        self.schedule_calls.append(year)
        return self.schedules.get(year, make_schedule([]))

    def load_race_session(self, year, event_name):
        with self._lock:
            self.loads.append((year, event_name))
        if self.delay:
            time.sleep(self.delay)
        if year in self.fail:
            raise ConnectionError(f"livetiming down for {year}")
        return SimpleNamespace(results=results(driver=f"Winner {year} {event_name}"))


@pytest.fixture
def install(monkeypatch):
    def _install(schedules, **kwargs):
        fake = FakeFastF1(schedules, **kwargs)
        monkeypatch.setattr(circuit_winners, "get_schedule", fake.get_schedule)
        monkeypatch.setattr(circuit_winners, "load_race_session", fake.load_race_session)
        return fake

    return _install


def season(*events):
    return make_schedule([{"date": "2025-06-01", **event} for event in events])


SPANISH_AT_BARCELONA = {y: season({"name": "Spanish Grand Prix", "location": "Barcelona", "round": 9})
                        for y in (2023, 2024, 2025)}


# ── The slug port ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(("location", "expected"), json.loads(SLUG_CASES.read_text("utf8")))
def test_location_slug_matches_the_shared_vectors(location, expected):
    """The same file pins the TS locationSlug; a drift here silently empties every lookup."""
    assert location_slug(location) == expected


# ── Matching by circuit, not by Grand Prix name ─────────────────────────────


def test_madrid_gets_no_barcelona_winners(install):
    """2026's Spanish GP is at Madrid; 2023–25's was at Barcelona. Matching by event name — what
    the agent's tool does — would hand Madrid three Barcelona winners.
    """
    fake = install(SPANISH_AT_BARCELONA)

    result = get_recent_circuit_winners("es-2026")

    assert result["winners"] == []
    assert fake.loads == []


def test_barcelona_gets_the_spanish_gp_winners(install):
    install(SPANISH_AT_BARCELONA)

    result = get_recent_circuit_winners("es-1991")

    assert [w["year"] for w in result["winners"]] == [2025, 2024, 2023]
    assert {w["event"] for w in result["winners"]} == {"Spanish Grand Prix"}


def test_kuala_lumpur_is_sepang_not_sakhir(install):
    """FastF1 files the rescheduled Bahrain GP under Kuala Lumpur; the event name says Bahrain."""
    install({2024: season({"name": "Bahrain Grand Prix", "location": "Kuala Lumpur", "round": 1})})

    assert get_recent_circuit_winners("bh-2002")["winners"] == []
    assert [w["year"] for w in get_recent_circuit_winners("my-1999")["winners"]] == [2024]


def test_yas_island_is_yas_marina(install):
    install({2023: season({"name": "Abu Dhabi Grand Prix", "location": "Yas Island", "round": 22})})

    assert [w["year"] for w in get_recent_circuit_winners("ae-2009")["winners"]] == [2023]


def test_pre_season_testing_is_not_a_race(install):
    fake = install({2025: season(
        {"name": "Pre-Season Testing", "location": "Sakhir", "round": 0, "format": "testing"},
        {"name": "Bahrain Grand Prix", "location": "Sakhir", "round": 1},
    )})

    result = get_recent_circuit_winners("bh-2002")

    assert fake.loads == [(2025, "Bahrain Grand Prix")]
    assert len(result["winners"]) == 1


def test_a_circuit_can_host_two_races_in_one_year(install):
    install({2024: season(
        {"name": "Styrian Grand Prix", "location": "Spielberg", "round": 7},
        {"name": "Austrian Grand Prix", "location": "Spielberg", "round": 8},
    )})

    events = [w["event"] for w in get_recent_circuit_winners("at-1969")["winners"]]

    assert events == ["Styrian Grand Prix", "Austrian Grand Prix"]


def test_the_winner_row_shape(install):
    install({2025: season({"name": "Italian Grand Prix", "location": "Monza", "round": 16})})

    result = get_recent_circuit_winners("it-1922")

    assert result == {
        "circuit_id": "it-1922",
        "from_year": 2023,
        "to_year": 2025,
        "winners": [{
            "year": 2025, "event": "Italian Grand Prix",
            "driver": "Winner 2025 Italian Grand Prix", "driver_code": "VER",
            "team": "Red Bull Racing", "time": "1:13:24.325",
        }],
        "unavailable_years": [],
    }


# ── Cache ───────────────────────────────────────────────────────────────────


def test_a_second_view_costs_nothing(install):
    fake = install(SPANISH_AT_BARCELONA)
    get_recent_circuit_winners("es-1991")
    fake.loads.clear()
    fake.schedule_calls.clear()

    get_recent_circuit_winners("es-1991")

    assert fake.loads == []
    assert fake.schedule_calls == []


def test_a_year_the_circuit_did_not_host_is_cached_too(install):
    fake = install(SPANISH_AT_BARCELONA)
    get_recent_circuit_winners("es-2026")
    fake.schedule_calls.clear()

    get_recent_circuit_winners("es-2026")

    assert fake.schedule_calls == []


def test_a_failed_year_is_reported_and_not_cached(install, monkeypatch):
    fake = install(SPANISH_AT_BARCELONA, fail={2024})

    first = get_recent_circuit_winners("es-1991")

    assert first["unavailable_years"] == [2024]
    assert [w["year"] for w in first["winners"]] == [2025, 2023]

    fake.fail.clear()
    fake.loads.clear()
    second = get_recent_circuit_winners("es-1991")

    assert fake.loads == [(2024, "Spanish Grand Prix")]
    assert second["unavailable_years"] == []


def test_every_year_failing_is_an_error(install):
    install(SPANISH_AT_BARCELONA, fail={2023, 2024, 2025})

    result = get_recent_circuit_winners("es-1991")

    assert "error" in result
    assert "reason" not in result


def test_a_caller_mutating_the_result_cannot_reach_the_cache(install):
    install(SPANISH_AT_BARCELONA)
    get_recent_circuit_winners("es-1991")["winners"][0]["driver"] = "tampered"

    assert get_recent_circuit_winners("es-1991")["winners"][0]["driver"] != "tampered"


def test_two_cold_views_of_one_circuit_load_it_once(install):
    fake = install(SPANISH_AT_BARCELONA, delay=0.05)
    threads = [threading.Thread(target=get_recent_circuit_winners, args=("es-1991",)) for _ in range(2)]

    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(fake.loads) == 3


# ── Edges ───────────────────────────────────────────────────────────────────


def test_an_unknown_circuit_is_its_own_reason(install):
    install({})

    assert get_recent_circuit_winners("xx-0000") == {
        "error": "Unknown circuit xx-0000",
        "reason": UNKNOWN_CIRCUIT,
    }


def test_a_missing_index_file_is_an_error_not_a_raise(install, monkeypatch, tmp_path):
    install({})
    monkeypatch.setattr(circuit_winners, "CIRCUIT_INDEX_PATH", tmp_path / "absent.json")
    circuit_winners.clear()

    result = get_recent_circuit_winners("it-1922")

    assert "error" in result
    assert "reason" not in result


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (pd.Timedelta(hours=1, minutes=13, seconds=24.325), "1:13:24.325"),
        (pd.Timedelta(hours=2, seconds=5.0004), "2:00:05.000"),
        (pd.NaT, None),
        (None, None),
    ],
)
def test_format_race_time(value, expected):
    assert format_race_time(value) == expected
```

- [ ] **Step 4: Run to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_circuit_winners.py -v`
Expected: collection error, `No module named 'tools.circuit_winners'`.

- [ ] **Step 5: Implement**

Create `backend/tools/circuit_winners.py`:

```python
"""Recent Grand Prix winners at one circuit, for the /circuits detail page.

A plain helper, not a ``@tool``: only the winners route calls it, and nothing here is
LLM-callable. The agent's ``get_circuit_winners`` in ``f1_data_tools.py`` is separate and
unchanged.

**Matched by circuit, never by Grand Prix name.** ``fastf1_helpers.find_event`` is a
substring match on ``EventName``, and a Grand Prix is not a track: 2026's Spanish GP is
at Madrid while 2023–25's was at Barcelona, and FastF1 files the rescheduled 2026 Bahrain
GP under Kuala Lumpur. So each schedule row's ``Location`` is slugged and looked up in the
frontend's ``index.json`` — the same map, and the same aliases, the page draws with.
``location_slug`` is therefore a third copy of the slug rule; ``slug-cases.json`` pins
all three.

**Cached per (circuit, year), with no expiry.** The window is the three seasons before
the current one — the same window the agent's tool uses — and a finished season's winner
does not change, so there is nothing a TTL would refresh. A year the circuit did not host
is cached as an empty tuple; a year whose load *failed* is not cached at all, so a
transient FastF1 failure is not remembered as "never raced here". The key space is
bounded by the 40 ids in ``index.json`` — never by client input, because the route
rejects an unknown id before anything is stored.

**Single flight per circuit.** A cold circuit costs ~1.5s per hosted year (~4.6s for
three), so two people opening the same circuit at once would otherwise pay it twice. A
lock per circuit id serialises them; different circuits do not block each other.

The cache sits above FastF1, not above the OpenF1 client, so the routes'
``clear_openf1_cache()`` does not touch it and this module touches no OpenF1 at all.
"""

import copy
import json
import logging
import re
import threading
import unicodedata
from datetime import date
from typing import Any

import pandas as pd

from config import CIRCUIT_INDEX_PATH
from tools.fastf1_helpers import load_race_session
from tools.schedule_cache import get_schedule

logger = logging.getLogger(__name__)

UNKNOWN_CIRCUIT = "unknown_circuit"

# Seasons before the current one. Matches get_circuit_winners' own window.
WINDOW_YEARS = 3

_COMBINING_MARKS = re.compile(r"[̀-ͯ]")
_SEPARATORS = re.compile(r"[^a-z0-9]+")

_cache_lock = threading.Lock()
# (circuit_id, year) -> that year's winner rows; () means the circuit did not host that year.
_cache: dict[tuple[str, int], tuple[dict[str, Any], ...]] = {}
_circuit_locks: dict[str, threading.Lock] = {}
_index: dict[str, str] | None = None


def clear() -> None:
    """Drop every cached winner and the loaded index. Used by tests; harmless in production."""
    global _index
    with _cache_lock:
        _cache.clear()
        _circuit_locks.clear()
        _index = None


def location_slug(location: str) -> str:
    """Lowercase, strip accents, collapse everything else to single hyphens.

    Must stay identical to ``locationSlug`` in ``frontend/lib/circuit-geometry.ts`` and
    ``slug()`` in ``frontend/scripts/fetch-circuit-geometry.mjs``.
    """
    stripped = _COMBINING_MARKS.sub("", unicodedata.normalize("NFD", location)).lower()
    return _SEPARATORS.sub("-", stripped).strip("-")


def format_race_time(value: Any) -> str | None:
    """A winner's total race time as ``H:MM:SS.mmm``, or None when FastF1 has none."""
    if value is None or pd.isna(value):
        return None
    total_ms = round(pd.Timedelta(value).total_seconds() * 1000)
    hours, rest = divmod(total_ms, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    seconds, millis = divmod(rest, 1000)
    return f"{hours}:{minutes:02d}:{seconds:02d}.{millis:03d}"


def _circuit_index() -> dict[str, str]:
    global _index
    with _cache_lock:
        if _index is not None:
            return _index
    with open(CIRCUIT_INDEX_PATH, encoding="utf-8") as handle:
        loaded = json.load(handle)
    with _cache_lock:
        _index = loaded
    return loaded


def _lock_for(circuit_id: str) -> threading.Lock:
    with _cache_lock:
        return _circuit_locks.setdefault(circuit_id, threading.Lock())


def _cached(circuit_id: str, year: int) -> tuple[dict[str, Any], ...] | None:
    with _cache_lock:
        return _cache.get((circuit_id, year))


def _store(circuit_id: str, year: int, rows: tuple[dict[str, Any], ...]) -> None:
    with _cache_lock:
        _cache[(circuit_id, year)] = copy.deepcopy(rows)


def _winner_row(year: int, event_name: str) -> dict[str, Any]:
    """The P1 row of one race. Raises on any failure, including a race with no P1 — for a
    finished season that means the load went wrong, not that nobody won, so it must not be
    cached as an answer.
    """
    classification = load_race_session(year, event_name).results
    winner = classification[classification["Position"] == 1]
    if winner.empty:
        raise LookupError(f"No P1 row for {year} {event_name}")
    row = winner.iloc[0]
    return {
        "year": year,
        "event": event_name,
        "driver": str(row["FullName"]),
        "driver_code": str(row["Abbreviation"]),
        "team": str(row["TeamName"]),
        "time": format_race_time(row["Time"]),
    }


def _winners_in(circuit_id: str, year: int, index: dict[str, str]) -> tuple[dict[str, Any], ...]:
    """Every race this circuit hosted in ``year``, in calendar order. Raises on failure."""
    schedule = get_schedule(year)
    rows = []
    for _, event in schedule.iterrows():
        # Round 0 is pre-season testing, which runs at Sakhir and is not a Grand Prix.
        if int(event["RoundNumber"]) == 0:
            continue
        if index.get(location_slug(str(event["Location"]))) != circuit_id:
            continue
        rows.append(_winner_row(year, str(event["EventName"])))
    return tuple(rows)


def get_recent_circuit_winners(circuit_id: str) -> dict[str, Any]:
    """Winners at one circuit across the three seasons before this one.

    Args:
        circuit_id: A circuit id from ``index.json``'s values, e.g. ``it-1922``.

    Returns:
        ``circuit_id``, ``from_year``, ``to_year`` (inclusive), ``winners`` newest first, and
        ``unavailable_years`` for any year whose load failed; or ``{"error": ...}`` —
        with ``reason: UNKNOWN_CIRCUIT`` when the id is not one this repo draws.
    """
    try:
        index = _circuit_index()
    except Exception as exc:
        return {"error": f"Circuit index unavailable: {exc}"}

    if circuit_id not in set(index.values()):
        return {"error": f"Unknown circuit {circuit_id}", "reason": UNKNOWN_CIRCUIT}

    this_year = date.today().year
    years = list(range(this_year - WINDOW_YEARS, this_year))
    winners: list[dict[str, Any]] = []
    unavailable: list[int] = []

    try:
        with _lock_for(circuit_id):
            for year in years:
                rows = _cached(circuit_id, year)
                if rows is None:
                    try:
                        rows = _winners_in(circuit_id, year, index)
                    except Exception as exc:
                        logger.warning("Winners for %s in %d unavailable: %s", circuit_id, year, exc)
                        unavailable.append(year)
                        continue
                    _store(circuit_id, year, rows)
                winners.extend(copy.deepcopy(rows))
    except Exception as exc:
        return {"error": f"Failed to get circuit winners: {exc}"}

    if len(unavailable) == len(years):
        return {"error": f"No season from {years[0]} to {years[-1]} could be loaded for {circuit_id}"}

    # Stable, so two races in one year keep their calendar order.
    winners.sort(key=lambda row: row["year"], reverse=True)
    return {
        "circuit_id": circuit_id,
        "from_year": years[0],
        "to_year": years[-1],
        "winners": winners,
        "unavailable_years": unavailable,
    }
```

The missing-index test patches `circuit_winners.CIRCUIT_INDEX_PATH`. That works because `_circuit_index` reads the module-level name at call time and `clear()` resets `_index`.

- [ ] **Step 6: Run to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_circuit_winners.py -v && .venv/bin/ruff check . && .venv/bin/ruff format .`
Expected: all PASS. If `test_two_cold_views_of_one_circuit_load_it_once` reports 6 loads, the lock is not held across the loop. Fix the code, not the test.

- [ ] **Step 7: Commit**

```bash
git add backend/config.py backend/tools/circuit_winners.py backend/tests/test_circuit_winners.py backend/tests/conftest.py
git commit -m "feat(tools): recent winners matched by circuit, cached per circuit-year"
```

---

### Task 4: `GET /api/circuits/{circuit_id}/winners` + client + captured fixture

**Files:**
- Modify: `backend/api/errors.py`
- Modify: `backend/api/routes.py` (imports; new route after `get_standings`)
- Modify: `backend/tests/api/test_routes.py` (new section at end)
- Modify: `frontend/types/f1.ts`, `frontend/lib/api.ts`, `frontend/tests/api.test.ts`
- Capture: `frontend/tests/fixtures/circuit-winners-it-1922.json`
- Modify: `frontend/tests/fixtures/README.md`

**Interfaces:**
- Consumes: `get_recent_circuit_winners`, `UNKNOWN_CIRCUIT` (Task 3).
- Produces: route `GET /api/circuits/{circuit_id}/winners` → 200 payload | 404 `{"detail": "Unknown circuit."}` | 422 malformed id | 502 `GENERIC_CIRCUIT_WINNERS_ERROR`. TS: `CircuitWinner`, `CircuitWinnersResponse`, `getCircuitWinners(circuitId: string): Promise<CircuitWinnersResponse>`.

- [ ] **Step 1: Write the failing route tests**

Append to `backend/tests/api/test_routes.py`:

```python
# ── GET /api/circuits/{circuit_id}/winners ──────────────────────────────────


WINNERS_PAYLOAD = {
    "circuit_id": "it-1922",
    "from_year": 2023,
    "to_year": 2025,
    "winners": [
        {"year": 2025, "event": "Italian Grand Prix", "driver": "A B", "driver_code": "ABC",
         "team": "T", "time": "1:13:24.325"}
    ],
    "unavailable_years": [],
}


def test_winners_returns_the_helper_payload(client, monkeypatch):
    from api import routes

    monkeypatch.setattr(routes, "get_recent_circuit_winners", lambda circuit_id: WINNERS_PAYLOAD)

    response = client.get("/api/circuits/it-1922/winners")

    assert response.status_code == 200
    assert response.json() == WINNERS_PAYLOAD


def test_winners_serves_a_partial_answer_as_200(client, monkeypatch):
    from api import routes

    partial = {**WINNERS_PAYLOAD, "unavailable_years": [2024]}
    monkeypatch.setattr(routes, "get_recent_circuit_winners", lambda circuit_id: partial)

    assert client.get("/api/circuits/it-1922/winners").json()["unavailable_years"] == [2024]


def test_winners_for_an_unknown_circuit_is_404(client, monkeypatch):
    from api import routes
    from tools.circuit_winners import UNKNOWN_CIRCUIT

    monkeypatch.setattr(
        routes,
        "get_recent_circuit_winners",
        lambda circuit_id: {"error": f"Unknown circuit {circuit_id}", "reason": UNKNOWN_CIRCUIT},
    )

    response = client.get("/api/circuits/xx-0000/winners")

    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown circuit."


def test_winners_masks_an_upstream_failure_as_502(client, monkeypatch):
    from api import routes

    monkeypatch.setattr(
        routes,
        "get_recent_circuit_winners",
        lambda circuit_id: {"error": "livetiming.formula1.com: HTTP 503 <html>…"},
    )

    response = client.get("/api/circuits/it-1922/winners")

    assert response.status_code == 502
    assert response.json()["detail"] == GENERIC_CIRCUIT_WINNERS_ERROR
    assert "livetiming" not in response.text


@pytest.mark.parametrize("circuit_id", ["monza", "IT-1922", "it-19222", "it_1922"])
def test_winners_rejects_a_malformed_id_before_the_helper_runs(client, monkeypatch, circuit_id):
    from api import routes

    def refuse(circuit_id):
        raise AssertionError("helper reached for a malformed id")

    monkeypatch.setattr(routes, "get_recent_circuit_winners", refuse)

    assert client.get(f"/api/circuits/{circuit_id}/winners").status_code == 422
```

Add `GENERIC_CIRCUIT_WINNERS_ERROR` to the file's existing `from api.errors import (...)`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/api/test_routes.py -k winners -v`
Expected: ImportError on `GENERIC_CIRCUIT_WINNERS_ERROR`.

- [ ] **Step 3: Implement**

In `backend/api/errors.py`, change "Four constants rather than one" to "Five constants rather than one", then add after `GENERIC_STANDINGS_ERROR`:

```python
GENERIC_CIRCUIT_WINNERS_ERROR: str = "Could not load this circuit's recent winners. Please try again."
```

In `backend/api/routes.py`:
- add `GENERIC_CIRCUIT_WINNERS_ERROR` to the `api.errors` import;
- add `from tools.circuit_winners import UNKNOWN_CIRCUIT, get_recent_circuit_winners`;
- add after `get_standings`:

```python
@router.get("/circuits/{circuit_id}/winners")
async def get_circuit_winners_route(
    circuit_id: str = Path(pattern=r"^[a-z]{2}-\d{4}$"),
) -> dict[str, Any]:
    """Recent winners at one circuit, for the /circuits detail page.

    Slow when cold — one FastF1 session load per hosted year, ~4.6s for three — and instant
    after, because the helper caches finished seasons for the life of the process. Only FastF1
    is touched, so unlike the routes above there is no OpenF1 cache to clear.
    """
    result = await asyncio.to_thread(get_recent_circuit_winners, circuit_id)

    if result.get("reason") == UNKNOWN_CIRCUIT:
        # Actionable — the id names no circuit this app draws — so not masked.
        raise HTTPException(status_code=404, detail="Unknown circuit.")

    if "error" in result:
        logger.warning("Winners for %s unavailable: %s", circuit_id, result["error"])
        raise HTTPException(status_code=502, detail=GENERIC_CIRCUIT_WINNERS_ERROR)

    return result
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format .`
Expected: PASS.

- [ ] **Step 5: Frontend types and client, test first**

In `frontend/types/f1.ts`, add after `Race`:

```ts
/** One race win at a circuit, from `GET /api/circuits/{id}/winners`. */
export interface CircuitWinner {
  year: number;
  /** The Grand Prix, which can differ year to year at the same track — and a year can hold two. */
  event: string;
  driver: string;
  driver_code: string;
  team: string;
  /** Total race time as `H:MM:SS.mmm`, or null when FastF1 has none. */
  time: string | null;
}

/**
 * Winners across `from_year`..`to_year` inclusive — the three seasons before the current one.
 * A year the circuit did not host is simply absent; a year whose load failed is listed in
 * `unavailable_years` so the page can say so rather than implying the circuit sat out.
 */
export interface CircuitWinnersResponse {
  circuit_id: string;
  from_year: number;
  to_year: number;
  winners: CircuitWinner[];
  unavailable_years: number[];
}
```

Capture the fixture first, because the test uses it. Start the backend as in Task 2 Step 6, then:

```bash
curl -sf http://localhost:8000/api/circuits/it-1922/winners | python3 -m json.tool > frontend/tests/fixtures/circuit-winners-it-1922.json
```

The first call takes ~5s. Check that the file has three winners (2023, 2024, 2025) and `"unavailable_years": []`. If a year is unavailable, re-run the curl, since a failure is not cached. Stop the server.

Append to `frontend/tests/fixtures/README.md`:

```markdown
# Circuit winners fixture

`circuit-winners-it-1922.json` is the real `/api/circuits/it-1922/winners` response (Monza),
captured on the capture date (`date +%F`) against live FastF1 and pretty-printed with `python3 -m json.tool`. The
browser harness serves it for `/circuits/monza`; any other circuit id is unmocked and fails
closed. To re-capture, run the backend as above, then:

```bash
curl -sf http://localhost:8000/api/circuits/it-1922/winners | python3 -m json.tool > frontend/tests/fixtures/circuit-winners-it-1922.json
```

A cold call costs one FastF1 session load per season, about five seconds in all.
```

In `frontend/tests/api.test.ts`, import `getCircuitWinners` alongside `getStandings`, add `import monzaWinners from './fixtures/circuit-winners-it-1922.json';`, and append:

```ts
describe('getCircuitWinners', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the winners route for the circuit id and returns the payload as served', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(monzaWinners));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getCircuitWinners('it-1922');

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/circuits\/it-1922\/winners$/));
    expect(result).toEqual(monzaWinners);
  });

  it('throws on a non-OK response rather than handing the error body on as winners', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'x' }, 502)));

    await expect(getCircuitWinners('it-1922')).rejects.toThrow('Failed to fetch circuit winners');
  });
});
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/api.test.ts`. Expected: FAIL, `getCircuitWinners` is not exported.

In `frontend/lib/api.ts`, add `CircuitWinnersResponse` to the type import, and after `getStandings`:

```ts
export async function getCircuitWinners(circuitId: string): Promise<CircuitWinnersResponse> {
  const response = await fetch(`${API_BASE_URL}/api/circuits/${circuitId}/winners`);

  if (!response.ok) {
    throw new Error('Failed to fetch circuit winners');
  }

  return (await response.json()) as CircuitWinnersResponse;
}
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/api.test.ts && mise exec -- pnpm typecheck`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/api frontend/types/f1.ts frontend/lib/api.ts frontend/tests/api.test.ts frontend/tests/fixtures backend/tests/api/test_routes.py
git commit -m "feat(api): GET /api/circuits/{id}/winners, masked and cached"
```

---

### Task 5: Circuit lookups, the detail-route resolver, and the static-import guard

**Files:**
- Modify: `frontend/lib/circuit-geometry.ts`
- Create: `frontend/lib/circuit-route.ts`
- Modify: `frontend/tests/circuit-geometry.test.ts`
- Create: `frontend/tests/circuit-route.test.ts`
- Create: `frontend/tests/circuit-imports.test.ts`

**Interfaces:**
- Consumes: `data/circuits/catalog.json` (Task 1).
- Produces:
  - `circuit-geometry.ts`:
    - `interface CircuitEntry { id: string; slug: string; name: string; location: string; lengthM: number; firstGp: number }`
    - `circuitEntry(id: string): CircuitEntry | null`
    - `canonicalSlug(id: string): string | null`
    - `circuitSlugForLocation(location: string): string | null`
    - `circuitBySlug(slug: string): { entry: CircuitEntry; canonical: boolean } | null`
  - `circuit-route.ts`: `type CircuitRoute = { kind: 'render'; entry: CircuitEntry } | { kind: 'redirect'; to: string } | { kind: 'notFound' }` and `resolveCircuitRoute(slug: string, year: string | string[] | undefined): CircuitRoute`.

- [ ] **Step 1: Write failing tests**

Append to `frontend/tests/circuit-geometry.test.ts` (add the new names to its import from `@/lib/circuit-geometry`):

```ts
describe('catalog lookups', () => {
  it('names a circuit by id without loading its outline', () => {
    expect(circuitEntry('it-1922')).toEqual({
      id: 'it-1922',
      slug: 'monza',
      name: 'Autodromo Nazionale Monza',
      location: 'Monza',
      lengthM: 5793,
      firstGp: 1950,
    });
    expect(circuitEntry('xx-0000')).toBeNull();
  });

  it('gives the canonical slug for an id', () => {
    expect(canonicalSlug('bh-2002')).toBe('sakhir');
    expect(canonicalSlug('xx-0000')).toBeNull();
  });

  it('turns a calendar location into its detail-page slug, through the aliases', () => {
    expect(circuitSlugForLocation('Bahrain')).toBe('sakhir');
    expect(circuitSlugForLocation('Yas Island')).toBe('yas-marina');
    expect(circuitSlugForLocation('Atlantis')).toBeNull();
  });

  it('resolves a slug and says whether it is the canonical one', () => {
    expect(circuitBySlug('monza')).toMatchObject({ entry: { id: 'it-1922' }, canonical: true });
    expect(circuitBySlug('bahrain')).toMatchObject({ entry: { id: 'bh-2002' }, canonical: false });
    expect(circuitBySlug('Monza')).toMatchObject({ entry: { id: 'it-1922' }, canonical: false });
    expect(circuitBySlug('atlantis')).toBeNull();
  });

  /*
   * `index.json` is a plain object, so `index['constructor']` is `Object.prototype.constructor`,
   * not undefined. A URL segment is user input, and must not be able to reach a prototype key.
   */
  it('does not resolve a prototype key', () => {
    expect(circuitBySlug('constructor')).toBeNull();
    expect(circuitBySlug('__proto__')).toBeNull();
  });
});
```

Create `frontend/tests/circuit-route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { resolveCircuitRoute } from '@/lib/circuit-route';

describe('resolveCircuitRoute', () => {
  it('renders a canonical slug', () => {
    expect(resolveCircuitRoute('monza', undefined)).toMatchObject({
      kind: 'render',
      entry: { id: 'it-1922' },
    });
  });

  it('redirects an alias to the canonical slug', () => {
    expect(resolveCircuitRoute('bahrain', undefined)).toEqual({
      kind: 'redirect',
      to: '/circuits/sakhir',
    });
  });

  it('keeps a single ?year= through the redirect', () => {
    expect(resolveCircuitRoute('monte-carlo', '2024')).toEqual({
      kind: 'redirect',
      to: '/circuits/monaco?year=2024',
    });
  });

  it('drops a repeated or unusable ?year= rather than forwarding it', () => {
    expect(resolveCircuitRoute('bahrain', ['2024', '2025'])).toEqual({
      kind: 'redirect',
      to: '/circuits/sakhir',
    });
    expect(resolveCircuitRoute('bahrain', 'abc')).toEqual({
      kind: 'redirect',
      to: '/circuits/sakhir',
    });
  });

  it('is not found for a slug this app draws no circuit for', () => {
    expect(resolveCircuitRoute('atlantis', undefined)).toEqual({ kind: 'notFound' });
    expect(resolveCircuitRoute('constructor', undefined)).toEqual({ kind: 'notFound' });
  });
});
```

Create `frontend/tests/circuit-imports.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The guard for "never static-import the circuit set". `loadCircuit`'s template-literal import is
 * what makes the bundler emit one chunk per circuit, so a page drawing 24 circuits downloads 24.
 * A static import of an outline puts it in that module's bundle unconditionally, which is right
 * for exactly the three places below — each draws one known circuit at build time — and wrong
 * anywhere else. jsdom cannot see a bundle, so this reads the source.
 */
const ROOT = resolve(__dirname, '..');
const SCANNED = ['app', 'components', 'hooks', 'lib'];
const ALLOWED = [
  'app/candy/page.tsx',
  'components/briefing/briefing-chat.tsx',
  'components/landing/landing-hero.tsx',
];
const STATIC_OUTLINE_IMPORT = /from\s+['"]@\/data\/circuits\/[a-z]{2}-\d{4}\.json['"]/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [relative(ROOT, full)] : [];
  });
}

const offenders = SCANNED.flatMap((dir) => sources(join(ROOT, dir))).filter((file) =>
  STATIC_OUTLINE_IMPORT.test(readFileSync(join(ROOT, file), 'utf8')),
);

describe('circuit outline imports', () => {
  it('statically imports an outline only where one known circuit is drawn', () => {
    expect(offenders.sort()).toEqual(ALLOWED);
  });
});
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/circuit-geometry.test.ts tests/circuit-route.test.ts tests/circuit-imports.test.ts`
Expected: the geometry and route tests FAIL (missing exports and module). The import scan PASSES already. That's fine: it's a guard, not TDD.

- [ ] **Step 2: Implement the lookups**

In `frontend/lib/circuit-geometry.ts`, add `import catalog from '@/data/circuits/catalog.json';` below the `index` import. Add this to the module docstring's last paragraph: "`catalog.json` is the points-free view (id, canonical slug, name, facts), about 5 kB, so it is statically imported: the grid's links and the detail page's facts need no outline." Then append:

```ts
/** One circuit's facts and canonical slug — everything in its outline file except the points. */
export interface CircuitEntry {
  id: string;
  /** `locationSlug(location)`, the detail page's URL segment: `/circuits/monza`. */
  slug: string;
  name: string;
  location: string;
  lengthM: number;
  firstGp: number;
}

const CATALOG: readonly CircuitEntry[] = catalog;
const BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]));

export function circuitEntry(id: string): CircuitEntry | null {
  return BY_ID.get(id) ?? null;
}

/** The detail page's slug for an id. Several slugs can name one id; this is the source's own. */
export function canonicalSlug(id: string): string | null {
  return BY_ID.get(id)?.slug ?? null;
}

/** A calendar location's detail-page slug, through the aliases, or null for a circuit not in the set. */
export function circuitSlugForLocation(location: string): string | null {
  const id = resolveCircuitId(location);
  return id ? canonicalSlug(id) : null;
}

/**
 * A URL segment's circuit, and whether the segment is already that circuit's canonical slug —
 * `bahrain` and `Monza` resolve but are not, so the route redirects them.
 *
 * Looked up through `BY_ID` rather than trusting `LOCATION_TO_ID[key]` alone: the index is a
 * plain object, so `constructor` or `__proto__` would otherwise return a prototype member.
 */
export function circuitBySlug(slug: string): { entry: CircuitEntry; canonical: boolean } | null {
  const id: unknown = LOCATION_TO_ID[locationSlug(slug)];
  const entry = typeof id === 'string' ? BY_ID.get(id) : undefined;
  return entry ? { entry, canonical: entry.slug === slug } : null;
}
```

Also fix the same prototype hole in `resolveCircuitId`, since it now feeds user-visible links:

```ts
export function resolveCircuitId(location: string): string | null {
  const id: unknown = LOCATION_TO_ID[locationSlug(location)];
  return typeof id === 'string' ? id : null;
}
```

Create `frontend/lib/circuit-route.ts`:

```ts
import { circuitBySlug, type CircuitEntry } from '@/lib/circuit-geometry';

export type CircuitRoute =
  | { kind: 'render'; entry: CircuitEntry }
  | { kind: 'redirect'; to: string }
  | { kind: 'notFound' };

/**
 * What `/circuits/[slug]` does with a request, as a pure function so it is testable — the page
 * itself is an async server component, which RTL cannot render.
 *
 * An alias (`bahrain`, `monte-carlo`) or a mis-cased slug redirects to the canonical one so a
 * circuit has exactly one URL. A single four-digit `?year=` survives the redirect; anything else
 * is dropped rather than forwarded, since the client would ignore it anyway.
 */
export function resolveCircuitRoute(
  slug: string,
  year: string | string[] | undefined,
): CircuitRoute {
  const found = circuitBySlug(slug);
  if (!found) return { kind: 'notFound' };
  if (found.canonical) return { kind: 'render', entry: found.entry };

  const path = `/circuits/${found.entry.slug}`;
  return {
    kind: 'redirect',
    to: typeof year === 'string' && /^\d{4}$/.test(year) ? `${path}?year=${year}` : path,
  };
}
```

- [ ] **Step 3: Run the tests**

Run: `cd frontend && mise exec -- pnpm vitest run tests/circuit-geometry.test.ts tests/circuit-route.test.ts tests/circuit-imports.test.ts && mise exec -- pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/circuit-geometry.ts frontend/lib/circuit-route.ts frontend/tests/circuit-geometry.test.ts frontend/tests/circuit-route.test.ts frontend/tests/circuit-imports.test.ts
git commit -m "feat(circuits): catalog lookups, the detail-route resolver, and a static-import guard"
```

---

### Task 6: `useSeasonCircuits` — a season's calendar with its outlines

**Files:**
- Create: `frontend/hooks/use-season-circuits.ts`
- Create: `frontend/tests/use-season-circuits.test.ts`

**Interfaces:**
- Consumes: `getRaces` (lib/api), `resolveCircuitId`, `loadCircuit`, `canonicalSlug`, `CircuitGeometry` (lib/circuit-geometry).
- Produces:
  - `interface SeasonCircuit { race: Race; geometry: CircuitGeometry | null; slug: string | null }`
  - `useSeasonCircuits(year: number): { circuits: SeasonCircuit[] | null; loading: boolean; error: boolean; retry: () => void }`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/use-season-circuits.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSeasonCircuits } from '@/hooks/use-season-circuits';
import { getRaces } from '@/lib/api';
import { loadCircuit } from '@/lib/circuit-geometry';
import type { Race } from '@/types';
import races2026 from './fixtures/races-2026.json';

vi.mock('@/lib/api', () => ({ getRaces: vi.fn() }));
vi.mock('@/lib/circuit-geometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/circuit-geometry')>();
  return { ...actual, loadCircuit: vi.fn(actual.loadCircuit) };
});

const getRacesMock = vi.mocked(getRaces);
const loadMock = vi.mocked(loadCircuit);
const CALENDAR_2026: Race[] = races2026.races;

function race(round: number, location: string): Race {
  return {
    name: `${location} Grand Prix`,
    location,
    country: 'Testland',
    date: '2025-06-01 00:00:00',
    round,
    event_format: 'conventional',
    official_name: `${location} Grand Prix`,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSeasonCircuits', () => {
  it('drops pre-season testing and returns one card per round, in calendar order', async () => {
    getRacesMock.mockResolvedValue(CALENDAR_2026);
    const { result } = renderHook(() => useSeasonCircuits(2026));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const rounds = result.current.circuits?.map((c) => c.race.round);
    expect(rounds).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(result.current.circuits?.every((c) => c.geometry !== null && c.slug !== null)).toBe(true);
  });

  it('loads each circuit once however many rounds it hosts', async () => {
    getRacesMock.mockResolvedValue([race(1, 'Spielberg'), race(2, 'Spielberg'), race(3, 'Monza')]);
    const { result } = renderHook(() => useSeasonCircuits(2020));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(loadMock.mock.calls.map(([id]) => id).sort()).toEqual(['at-1969', 'it-1922']);
  });

  it('keeps a round the set has no outline for, with no geometry and no slug', async () => {
    getRacesMock.mockResolvedValue([race(1, 'Brands Hatch'), race(2, 'Monza')]);
    const { result } = renderHook(() => useSeasonCircuits(1985));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.circuits?.[0]).toMatchObject({ geometry: null, slug: null });
    expect(result.current.circuits?.[1]).toMatchObject({ slug: 'monza' });
  });

  it('reports a failed calendar as an error, and retry loads again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getRacesMock.mockRejectedValueOnce(new Error('down')).mockResolvedValue([race(1, 'Monza')]);
    const { result } = renderHook(() => useSeasonCircuits(2026));

    await waitFor(() => expect(result.current.error).toBe(true));
    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.circuits).toHaveLength(1));
    expect(result.current.error).toBe(false);
  });

  it('never reports one season under another season’s year', async () => {
    let finishOld: (races: Race[]) => void = () => {};
    getRacesMock
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce([race(1, 'Monza')]);
    const { result, rerender } = renderHook(({ year }) => useSeasonCircuits(year), {
      initialProps: { year: 2025 },
    });

    rerender({ year: 2026 });
    await waitFor(() => expect(result.current.circuits).toHaveLength(1));
    await act(async () => finishOld([race(1, 'Suzuka'), race(2, 'Baku')]));

    expect(result.current.circuits?.map((c) => c.race.location)).toEqual(['Monza']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && mise exec -- pnpm vitest run tests/use-season-circuits.test.ts`
Expected: FAIL, cannot resolve `@/hooks/use-season-circuits`.

- [ ] **Step 3: Implement**

Create `frontend/hooks/use-season-circuits.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

import { getRaces } from '@/lib/api';
import {
  canonicalSlug,
  loadCircuit,
  resolveCircuitId,
  type CircuitGeometry,
} from '@/lib/circuit-geometry';
import type { Race } from '@/types';

/** One round of a season, with the outline to draw for it. */
export interface SeasonCircuit {
  race: Race;
  /** Null for a location the vendored set has no outline for — the card still renders. */
  geometry: CircuitGeometry | null;
  /** The detail page's slug; null exactly when `geometry` is, since there is no page to link. */
  slug: string | null;
}

export interface UseSeasonCircuitsReturn {
  /** Every round in calendar order, or `null` while loading or after a failure. */
  circuits: SeasonCircuit[] | null;
  loading: boolean;
  /** The calendar fetch failed. A missing outline is never an error. */
  error: boolean;
  retry: () => void;
}

interface Loaded {
  year: number;
  circuits: SeasonCircuit[] | null;
  error: boolean;
}

/**
 * A season's calendar and every outline it needs, fetched together.
 *
 * **Same shape as `use-standings.ts`** — state, one effect, an `active` flag, a result only
 * reported for the year it was fetched for, and a retry that clears to loading first.
 *
 * **Outlines load once per circuit and land together.** Each id is one lazy chunk through
 * `loadCircuit` (~2 kB gzipped); a season is ~24 of them in parallel, and a circuit hosting two
 * rounds is fetched once. The cards appear only when every chunk has settled, so the grid
 * doesn't fill in piecemeal. `loadCircuit` resolves null rather than rejecting, so one bad
 * chunk renders one card without an outline and holds up nothing else.
 *
 * Round 0 is pre-season testing, which `/api/races` serves twice and which is not a Grand Prix.
 */
export function useSeasonCircuits(year: number): UseSeasonCircuitsReturn {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      let races: Race[];
      try {
        races = await getRaces(year);
      } catch (error) {
        console.error('Failed to fetch the calendar:', error);
        if (active) setLoaded({ year, circuits: null, error: true });
        return;
      }

      const rounds = races.filter((race) => typeof race.round === 'number' && race.round > 0);
      const ids = [
        ...new Set(
          rounds.map((race) => resolveCircuitId(race.location)).filter((id) => id !== null),
        ),
      ];
      const outlines = new Map(
        await Promise.all(ids.map(async (id) => [id, await loadCircuit(id)] as const)),
      );
      if (!active) return;

      setLoaded({
        year,
        error: false,
        circuits: rounds.map((race) => {
          const id = resolveCircuitId(race.location);
          const geometry = id ? (outlines.get(id) ?? null) : null;
          return { race, geometry, slug: geometry && id ? canonicalSlug(id) : null };
        }),
      });
    }

    void load();

    return () => {
      active = false;
    };
  }, [year, attempt]);

  const retry = useCallback(() => {
    setLoaded(null);
    setAttempt((count) => count + 1);
  }, []);

  const current = loaded?.year === year ? loaded : null;
  return {
    circuits: current?.circuits ?? null,
    loading: current === null,
    error: current?.error ?? false,
    retry,
  };
}
```

If typecheck complains that `ids` is `(string | null)[]`, change the filter to `.filter((id): id is string => id !== null)`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && mise exec -- pnpm vitest run tests/use-season-circuits.test.ts && mise exec -- pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/use-season-circuits.ts frontend/tests/use-season-circuits.test.ts
git commit -m "feat(circuits): useSeasonCircuits loads a season's outlines once per circuit"
```

---

### Task 7: `/circuits` — card, page client, route

**Files:**
- Create: `frontend/components/circuits/circuit-card.tsx`
- Create: `frontend/components/circuits/circuits-page-client.tsx`
- Create: `frontend/app/circuits/page.tsx`
- Create: `frontend/tests/circuit-card.test.tsx`
- Create: `frontend/tests/circuits-page-client.test.tsx`

**Interfaces:**
- Consumes:
  - `SeasonCircuit`, `useSeasonCircuits` (Task 6)
  - `SeasonSelect` (`@/components/standings/season-select`, props `{ years: number[]; value: number; onChange: (year: number) => void }`)
  - `parseStandingsYear`, `standingsYears` (`@/lib/standings`)
  - `CircuitGlow` (`@/components/candy/circuit-glow`, props `{ points; variant?: 'glow' | 'plain'; draw?: 'onView' | 'immediate'; className? }`)
  - `parseRaceDate` (`@/lib/race-date`)
- Produces:
  - `CircuitCard({ circuit: SeasonCircuit; year: number })`
  - `CircuitsPageClient({ latestYear: number })`

- [ ] **Step 1: Write the failing card test**

Create `frontend/tests/circuit-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CircuitCard } from '@/components/circuits/circuit-card';
import type { SeasonCircuit } from '@/hooks/use-season-circuits';
import { toPoints } from '@/lib/circuit-geometry';
import monza from '@/data/circuits/it-1922.json';
import type { Race } from '@/types';

function race(overrides: Partial<Race> = {}): Race {
  return {
    name: 'Italian Grand Prix',
    location: 'Monza',
    country: 'Italy',
    date: '2026-09-06 00:00:00',
    round: 13,
    event_format: 'conventional',
    official_name: 'FORMULA 1 PIRELLI GRAN PREMIO D’ITALIA 2026',
    ...overrides,
  };
}

const withOutline: SeasonCircuit = {
  race: race(),
  geometry: { ...monza, points: toPoints(monza.points) },
  slug: 'monza',
};

describe('CircuitCard', () => {
  it('links a drawn circuit to its detail page, carrying the season', () => {
    render(<CircuitCard circuit={withOutline} year={2025} />);

    const link = screen.getByRole('link', { name: /Italian Grand Prix/ });
    expect(link).toHaveAttribute('href', '/circuits/monza?year=2025');
    expect(screen.getByText('Round 13')).toBeInTheDocument();
    expect(screen.getByText('06 SEP')).toBeInTheDocument();
    expect(screen.getByText('Monza, Italy')).toBeInTheDocument();
  });

  /*
   * In a grid the card *is* the content, so a missing outline must not delete the race from the
   * calendar the way the briefing band hides its decoration. The slot keeps its box; nothing is
   * drawn in it; and there is no detail page to link to.
   */
  it('keeps a race with no outline, captioned, and not a link', () => {
    render(
      <CircuitCard
        circuit={{ race: race({ location: 'Brands Hatch', country: 'UK' }), geometry: null, slug: null }}
        year={1985}
      />,
    );

    expect(screen.getByText('Italian Grand Prix')).toBeInTheDocument();
    expect(screen.getByText('No track map')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('[data-circuit-slot]')).not.toBeNull();
  });

  it('marks a sprint weekend', () => {
    render(
      <CircuitCard circuit={{ ...withOutline, race: race({ event_format: 'sprint_qualifying' }) }} year={2026} />,
    );

    expect(screen.getByText('Sprint')).toBeInTheDocument();
  });

  it('marks nothing on a conventional weekend', () => {
    render(<CircuitCard circuit={withOutline} year={2026} />);

    expect(screen.queryByText('Sprint')).toBeNull();
  });
});
```

Test files may import an outline statically: the Task 5 guard scans only `app`, `components`, `hooks` and `lib`.

Run: `cd frontend && mise exec -- pnpm vitest run tests/circuit-card.test.tsx`. Expected: FAIL, missing module.

- [ ] **Step 2: Implement the card**

Create `frontend/components/circuits/circuit-card.tsx`:

```tsx
import Link from 'next/link';

import { CircuitGlow } from '@/components/candy/circuit-glow';
import type { SeasonCircuit } from '@/hooks/use-season-circuits';
import { focusRingOffsetBase } from '@/lib/focus';
import { parseRaceDate } from '@/lib/race-date';
import { cn } from '@/lib/utils';

const CARD = 'flex h-full flex-col rounded-xl border border-zinc-800/80 bg-zinc-950 p-5';
const KICKER = 'font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400';

interface CircuitCardProps {
  circuit: SeasonCircuit;
  /** The season on screen, carried into the detail link so its calendar row matches. */
  year: number;
}

/**
 * One round of the `/circuits` grid.
 *
 * **A round with no outline still renders, and that is deliberately not the band's rule.** The
 * briefing band hides its outline on a miss because a briefing without a track map is still
 * complete. Here the card is the content, so hiding it would delete a race from the calendar.
 * The slot keeps its square box and says "No track map", with no fake shape drawn. There's
 * nothing to link to, since the detail page needs an outline, so the card is not focusable.
 *
 * The outline is `CircuitGlow`'s `plain` variant: it exists for this ~120–250px size, and it
 * carries no blur filter. Twenty-four Gaussian blurs on one page is a paint cost the grid doesn't
 * need. Every glyph is a zinc neutral or `ink` on bare `zinc-950`: no accent colour on text, so
 * none of the lifted-colour helpers apply.
 */
export function CircuitCard({ circuit, year }: CircuitCardProps) {
  const { race, geometry, slug } = circuit;
  const date = parseRaceDate(race.date);
  const sprint = race.event_format.includes('sprint');

  const body = (
    <>
      <div data-circuit-slot className="aspect-square w-full">
        {geometry ? (
          <CircuitGlow points={geometry.points} variant="plain" draw="onView" className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-zinc-800">
            <p className={KICKER}>No track map</p>
          </div>
        )}
      </div>
      <div className={cn('mt-4 flex items-baseline justify-between gap-3', KICKER)}>
        <span>Round {race.round}</span>
        {date && (
          <span>
            {date.day} {date.monthAbbr}
          </span>
        )}
      </div>
      <h2 className="mt-2 text-lg font-bold leading-tight text-ink">{race.name}</h2>
      <p className="mt-1 text-sm text-zinc-300">
        {race.location}, {race.country}
      </p>
      {sprint && (
        <span className="mt-3 self-start rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-200">
          Sprint
        </span>
      )}
    </>
  );

  if (!slug) return <div className={CARD}>{body}</div>;

  return (
    <Link
      href={`/circuits/${slug}?year=${year}`}
      className={cn(CARD, 'transition-colors duration-200 hover:border-zinc-600', focusRingOffsetBase)}
    >
      {body}
    </Link>
  );
}
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/circuit-card.test.tsx`. Expected: PASS. If `'06 SEP'` is split across text nodes, assert with `screen.getByText((_, el) => el?.textContent === '06 SEP')`. Better still, render `{`${date.day} ${date.monthAbbr}`}` as one string in the component, which also keeps the DOM cleaner.

- [ ] **Step 3: Write the failing page-client test**

Create `frontend/tests/circuits-page-client.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CircuitsPageClient } from '@/components/circuits/circuits-page-client';
import { getRaces } from '@/lib/api';
import type { Race } from '@/types';
import races2026 from './fixtures/races-2026.json';

vi.mock('@/lib/api', () => ({ getRaces: vi.fn() }));

/** The URL's query as an external store, modelling Next's patched `replaceState` — see
 * `standings-page-client.test.tsx`, which this mirrors. */
const url = vi.hoisted(() => {
  let query = '';
  const listeners = new Set<() => void>();
  return {
    get: () => query,
    set(next: string) {
      query = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(url.subscribe, url.get, url.get)),
  };
});

const getRacesMock = vi.mocked(getRaces);
const CALENDAR_2026: Race[] = races2026.races;

function renderPage(query = '', latestYear = 2026) {
  url.set(query);
  return render(<CircuitsPageClient latestYear={latestYear} />);
}

beforeEach(() => {
  getRacesMock.mockResolvedValue(CALENDAR_2026);
  // Moves the query store instead, which is what Next's patched `replaceState` really does.
  vi.spyOn(window.history, 'replaceState').mockImplementation((_data, _unused, next) => {
    const search = String(next).split('?')[1];
    url.set(search ? `?${search}` : '');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  url.set('');
});

describe('CircuitsPageClient', () => {
  it('draws one card per round of the season, testing excluded', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: '2026 calendar' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(24);
    expect(screen.getByRole('heading', { level: 1, name: 'Circuits' })).toBeInTheDocument();
  });

  it('reads the season from the URL', async () => {
    renderPage('?year=2024');

    await screen.findByRole('list', { name: '2024 calendar' });
    expect(getRacesMock).toHaveBeenCalledWith(2024);
  });

  it('ignores an out-of-range year and opens on the latest season', async () => {
    renderPage('?year=2019');

    await screen.findByRole('list', { name: '2026 calendar' });
    expect(getRacesMock).toHaveBeenCalledWith(2026);
  });

  it('writes a picked season with replaceState, and the latest season keeps the bare URL', async () => {
    renderPage();
    await screen.findByRole('list', { name: '2026 calendar' });

    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '2024' } });
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/circuits?year=2024');
    await screen.findByRole('list', { name: '2024 calendar' });

    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '2026' } });
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/circuits');
  });

  it('links to the same season’s standings', async () => {
    renderPage('?year=2024');

    expect(await screen.findByRole('link', { name: '2024 standings →' })).toHaveAttribute(
      'href',
      '/standings?year=2024',
    );
  });

  it('links the latest season’s standings with the bare URL', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: '2026 standings →' })).toHaveAttribute(
      'href',
      '/standings',
    );
  });

  it('offers a retry when the calendar fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getRacesMock.mockRejectedValueOnce(new Error('down'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await screen.findByRole('list', { name: '2026 calendar' });
    await waitFor(() => expect(getRacesMock).toHaveBeenCalledTimes(2));
  });
});
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/circuits-page-client.test.tsx`. Expected: FAIL, missing module.

- [ ] **Step 4: Implement the page client and route**

Create `frontend/components/circuits/circuits-page-client.tsx`:

```tsx
'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { CircuitCard } from '@/components/circuits/circuit-card';
import { SeasonSelect } from '@/components/standings/season-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSeasonCircuits } from '@/hooks/use-season-circuits';
import { focusRing, focusRingOffsetBase } from '@/lib/focus';
import { parseStandingsYear, standingsYears } from '@/lib/standings';
import { cn } from '@/lib/utils';

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
/** The `/standings` link treatment: a flush ring, because a text link is not a filled control. */
const LINK = cn(
  'rounded text-sm text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400',
  focusRing,
);
const BUTTON = cn(
  'rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-700',
  focusRingOffsetBase,
);
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
const SKELETON_CARDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

interface CircuitsPageClientProps {
  /** The newest season, read from the server's clock so render never reads one. */
  latestYear: number;
}

/**
 * `/circuits`: every round of one season as its circuit outline, with a season picker.
 *
 * **The season is URL state, handled exactly as `/standings` handles it**, for the reasons
 * `StandingsPageClient` documents: read from `useSearchParams()` and never copied into state, and
 * the picker's only write is `replaceState`. The range is `/standings`' range on purpose, so the
 * two pages' `?year=` links always name a season the other can show — hence the `standings`
 * helpers here.
 */
export function CircuitsPageClient({ latestYear }: CircuitsPageClientProps) {
  const year = parseStandingsYear(useSearchParams().getAll('year'), latestYear);
  const { circuits, loading, error, retry } = useSeasonCircuits(year);

  const selectYear = useCallback(
    (next: number) => {
      window.history.replaceState(
        null,
        '',
        next === latestYear ? '/circuits' : `/circuits?year=${next}`,
      );
    },
    [latestYear],
  );

  return (
    <div className="container mx-auto max-w-7xl px-4 py-16">
      <header className="mb-12">
        <p className={cn('mb-3 flex items-center gap-3', LABEL)}>
          <span aria-hidden="true" className="h-1.5 w-5 flex-shrink-0 bg-f1-red" />
          {year} Season
        </p>
        <h1 className="mb-6 text-4xl font-black uppercase tracking-tight text-ink md:text-5xl">
          Circuits
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href={year === latestYear ? '/standings' : `/standings?year=${year}`} className={LINK}>
            {year} standings →
          </Link>
          <SeasonSelect years={standingsYears(latestYear)} value={year} onChange={selectYear} />
        </div>
      </header>

      {loading && (
        <div aria-busy="true">
          <p className="sr-only">Loading circuits…</p>
          <div aria-hidden="true" className={GRID}>
            {SKELETON_CARDS.map((key) => (
              <Skeleton key={key} className="aspect-[3/4] w-full bg-zinc-900 motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className="flex flex-col items-start gap-4">
          <p className="text-sm text-zinc-300">Could not load the {year} calendar.</p>
          <button type="button" onClick={retry} className={BUTTON}>
            Try again
          </button>
        </div>
      )}
      {circuits && (
        <ul aria-label={`${year} calendar`} className={GRID}>
          {circuits.map((circuit) => (
            <li key={`${circuit.race.round}-${circuit.race.name}`}>
              <CircuitCard circuit={circuit} year={year} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Create `frontend/app/circuits/page.tsx`:

```tsx
import type { Metadata } from 'next';

import { CircuitsPageClient } from '@/components/circuits/circuits-page-client';
import { LandingNav } from '@/components/landing/landing-nav';

export const metadata: Metadata = {
  title: 'F1 Circuits',
  description: 'Every round of a Formula 1 season, drawn from each circuit’s surveyed outline.',
};

/**
 * Rendered per request, for `/standings`' two reasons: `latestYear` is read from the server's
 * clock, and a static page would need a Suspense boundary around the client's `useSearchParams`.
 */
export const dynamic = 'force-dynamic';

/** `/circuits`. `?year=` is read by the client, never here — see `CircuitsPageClient`. */
export default function CircuitsPage() {
  const latestYear = new Date().getFullYear();

  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-zinc-950 pt-14">
        <CircuitsPageClient latestYear={latestYear} />
      </main>
    </>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && mise exec -- pnpm vitest run tests/circuit-card.test.tsx tests/circuits-page-client.test.tsx && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/circuits frontend/app/circuits/page.tsx frontend/tests/circuit-card.test.tsx frontend/tests/circuits-page-client.test.tsx
git commit -m "feat(circuits): /circuits season grid of circuit outlines"
```

---

### Task 8: `/circuits/[slug]` — facts, calendar row, recent winners

**Files:**
- Create: `frontend/hooks/use-circuit-winners.ts`
- Create: `frontend/hooks/use-calendar-race.ts`
- Create: `frontend/components/circuits/circuit-winners.tsx`
- Create: `frontend/components/circuits/circuit-detail-client.tsx`
- Create: `frontend/app/circuits/[slug]/page.tsx`
- Create: `frontend/tests/circuit-detail-client.test.tsx`

**Interfaces:**
- Consumes: `getRaces`, `getCircuitWinners` (lib/api); `CircuitEntry`, `loadCircuit`, `resolveCircuitId` (lib/circuit-geometry); `resolveCircuitRoute` (lib/circuit-route); `parseStandingsYear` (lib/standings); `parseRaceDate`; `CircuitGlow`; `Point` (`@/lib/svg-path`).
- Produces:
  - `useCircuitWinners(circuitId: string): { winners: CircuitWinnersResponse | null; loading: boolean; error: boolean; retry: () => void }`
  - `useCalendarRace(circuitId: string, year: number): Race | null`
  - `CircuitWinners(props: ReturnType<typeof useCircuitWinners>)`
  - `CircuitDetailClient({ circuit: CircuitEntry; points: Point[]; latestYear: number })`

- [ ] **Step 1: Write the failing detail test**

Create `frontend/tests/circuit-detail-client.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CircuitDetailClient } from '@/components/circuits/circuit-detail-client';
import { getCircuitWinners, getRaces } from '@/lib/api';
import { circuitEntry, toPoints, type CircuitEntry } from '@/lib/circuit-geometry';
import monza from '@/data/circuits/it-1922.json';
import type { CircuitWinnersResponse, Race } from '@/types';
import monzaWinners from './fixtures/circuit-winners-it-1922.json';
import races2026 from './fixtures/races-2026.json';

vi.mock('@/lib/api', () => ({ getRaces: vi.fn(), getCircuitWinners: vi.fn() }));

const query = vi.hoisted(() => ({ current: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query.current),
}));

const getRacesMock = vi.mocked(getRaces);
const winnersMock = vi.mocked(getCircuitWinners);
const MONZA = circuitEntry('it-1922') as CircuitEntry;
const KYALAMI = circuitEntry('za-1961') as CircuitEntry;
const POINTS = toPoints(monza.points);
const WINNERS = monzaWinners as CircuitWinnersResponse;

function renderDetail(circuit = MONZA, search = '') {
  query.current = search;
  return render(<CircuitDetailClient circuit={circuit} points={POINTS} latestYear={2026} />);
}

beforeEach(() => {
  getRacesMock.mockResolvedValue(races2026.races as Race[]);
  winnersMock.mockResolvedValue(WINNERS);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('CircuitDetailClient', () => {
  it('states the circuit’s facts from the catalog', () => {
    renderDetail();

    expect(screen.getByRole('heading', { level: 1, name: 'Autodromo Nazionale Monza' })).toBeInTheDocument();
    expect(screen.getByText('5.8 km')).toBeInTheDocument();
    expect(screen.getByText('1950')).toBeInTheDocument();
  });

  it('shows where the circuit sits on the season’s calendar', async () => {
    renderDetail();

    expect(await screen.findByText(/^Round 13 · /)).toBeInTheDocument();
    expect(getRacesMock).toHaveBeenCalledWith(2026);
  });

  it('shows no calendar row for a circuit that season does not visit', async () => {
    renderDetail(KYALAMI);

    await waitFor(() => expect(getRacesMock).toHaveBeenCalled());
    expect(screen.queryByText(/^Round /)).toBeNull();
  });

  it('carries ?year= into the calendar lookup and the back link', async () => {
    renderDetail(MONZA, '?year=2024');

    await waitFor(() => expect(getRacesMock).toHaveBeenCalledWith(2024));
    expect(screen.getByRole('link', { name: '← 2024 circuits' })).toHaveAttribute('href', '/circuits?year=2024');
  });

  it('lists the recent winners under a heading naming the window', async () => {
    renderDetail();

    const section = await screen.findByRole('region', {
      name: `Winners, ${WINNERS.from_year}–${WINNERS.to_year}`,
    });
    const rows = within(section).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(WINNERS.winners.length);
    expect(within(section).getByText(WINNERS.winners[0]!.driver)).toBeInTheDocument();
    expect(winnersMock).toHaveBeenCalledWith('it-1922');
  });

  it('says so when the circuit hosted no Grand Prix in the window', async () => {
    winnersMock.mockResolvedValue({ ...WINNERS, winners: [] });
    renderDetail();

    expect(
      await screen.findByText(`No Grand Prix here in ${WINNERS.from_year}–${WINNERS.to_year}.`),
    ).toBeInTheDocument();
  });

  it('names a season whose results could not be loaded', async () => {
    winnersMock.mockResolvedValue({ ...WINNERS, unavailable_years: [2024] });
    renderDetail();

    expect(await screen.findByText('Results for 2024 could not be loaded.')).toBeInTheDocument();
  });

  it('names the event when one year held two races here', async () => {
    const [first] = WINNERS.winners;
    winnersMock.mockResolvedValue({
      ...WINNERS,
      winners: [
        { ...first!, year: 2024, event: 'Styrian Grand Prix' },
        { ...first!, year: 2024, event: 'Austrian Grand Prix' },
      ],
    });
    renderDetail();

    expect(await screen.findByText('Styrian Grand Prix')).toBeInTheDocument();
    expect(screen.getByText('Austrian Grand Prix')).toBeInTheDocument();
  });

  it('offers a retry when the winners fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    winnersMock.mockRejectedValueOnce(new Error('502'));
    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(winnersMock).toHaveBeenCalledTimes(2));
    await screen.findByRole('table');
  });
});
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/circuit-detail-client.test.tsx`. Expected: FAIL, missing module.

- [ ] **Step 2: Implement the hooks**

Create `frontend/hooks/use-circuit-winners.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

import { getCircuitWinners } from '@/lib/api';
import type { CircuitWinnersResponse } from '@/types';

export interface UseCircuitWinnersReturn {
  winners: CircuitWinnersResponse | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

interface Loaded {
  circuitId: string;
  winners: CircuitWinnersResponse | null;
  error: boolean;
}

/**
 * One circuit's recent winners. **Slow when cold**: the backend loads one FastF1 session per
 * hosted season, ~4.6s for three, then caches them for the life of its process. So this is
 * fetched only on the detail page, never prefetched from the grid. Same shape as `use-standings`.
 */
export function useCircuitWinners(circuitId: string): UseCircuitWinnersReturn {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getCircuitWinners(circuitId).then(
      (winners) => {
        if (active) setLoaded({ circuitId, winners, error: false });
      },
      (reason: unknown) => {
        console.error('Failed to fetch circuit winners:', reason);
        if (active) setLoaded({ circuitId, winners: null, error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [circuitId, attempt]);

  const retry = useCallback(() => {
    setLoaded(null);
    setAttempt((count) => count + 1);
  }, []);

  const current = loaded?.circuitId === circuitId ? loaded : null;
  return {
    winners: current?.winners ?? null,
    loading: current === null,
    error: current?.error ?? false,
    retry,
  };
}
```

Create `frontend/hooks/use-calendar-race.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

import { getRaces } from '@/lib/api';
import { resolveCircuitId } from '@/lib/circuit-geometry';
import type { Race } from '@/types';

/**
 * This circuit's first Grand Prix in `year`, or null — while loading, when the season doesn't
 * visit it, and when the calendar fails. It only adds a row to the detail page, so a failure is
 * logged and renders as "not on the calendar" rather than as an error.
 */
export function useCalendarRace(circuitId: string, year: number): Race | null {
  const [found, setFound] = useState<{ key: string; race: Race | null } | null>(null);
  const key = `${circuitId}:${year}`;

  useEffect(() => {
    let active = true;
    getRaces(year).then(
      (races) => {
        const race =
          races.find(
            (r) => typeof r.round === 'number' && r.round > 0 && resolveCircuitId(r.location) === circuitId,
          ) ?? null;
        if (active) setFound({ key, race });
      },
      (reason: unknown) => {
        console.error('Failed to fetch the calendar:', reason);
        if (active) setFound({ key, race: null });
      },
    );
    return () => {
      active = false;
    };
  }, [circuitId, year, key]);

  return found?.key === key ? found.race : null;
}
```

- [ ] **Step 3: Implement the winners section**

Create `frontend/components/circuits/circuit-winners.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';
import type { UseCircuitWinnersReturn } from '@/hooks/use-circuit-winners';
import { focusRingOffsetBase } from '@/lib/focus';
import { cn } from '@/lib/utils';

const HEADING = 'mb-6 text-2xl font-black uppercase tracking-tight text-ink';
const CELL = 'py-3 pr-4 text-sm text-zinc-300';
const HEAD_CELL = 'pb-3 pr-4 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
const BUTTON = cn(
  'rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-700',
  focusRingOffsetBase,
);
const SKELETON_ROWS = ['a', 'b', 'c'] as const;

/**
 * The detail page's recent winners.
 *
 * Team names are plain text, no livery colour, for the reason `/standings` gives: a colour on
 * text needs its own backdrop variant, and a table row is not worth one. No `bg-` on any row.
 * The event name prints only in a year this circuit hosted two races (Spielberg, Silverstone and
 * Sakhir in 2020); otherwise it's the same Grand Prix every row and would be noise.
 */
export function CircuitWinners({ winners, loading, error, retry }: UseCircuitWinnersReturn) {
  const heading = winners ? `Winners, ${winners.from_year}–${winners.to_year}` : 'Recent winners';
  const window = winners ? `${winners.from_year}–${winners.to_year}` : '';
  const doubleYears = new Set(
    (winners?.winners ?? [])
      .map((row) => row.year)
      .filter((year, i, years) => years.indexOf(year) !== i),
  );

  return (
    <section aria-labelledby="winners-heading" className="mt-16">
      <h2 id="winners-heading" className={HEADING}>
        {heading}
      </h2>

      {loading && (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-zinc-400">Race results load on first view and can take a few seconds.</p>
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} aria-hidden="true" className="h-9 w-full bg-zinc-900 motion-reduce:animate-none" />
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-col items-start gap-4">
          <p className="text-sm text-zinc-300">Could not load this circuit&#39;s recent winners.</p>
          <button type="button" onClick={retry} className={BUTTON}>
            Try again
          </button>
        </div>
      )}

      {winners && winners.winners.length === 0 && (
        <p className="text-sm text-zinc-300">No Grand Prix here in {window}.</p>
      )}

      {winners && winners.winners.length > 0 && (
        <table className="w-full border-collapse">
          <caption className="sr-only">{heading}</caption>
          <thead>
            <tr className="border-b border-zinc-800">
              <th scope="col" className={HEAD_CELL}>Year</th>
              <th scope="col" className={HEAD_CELL}>Driver</th>
              <th scope="col" className={HEAD_CELL}>Team</th>
              <th scope="col" className={cn(HEAD_CELL, 'text-right')}>Time</th>
            </tr>
          </thead>
          <tbody>
            {winners.winners.map((row) => (
              <tr key={`${row.year}-${row.event}`} className="border-b border-zinc-900">
                <td className={cn(CELL, 'font-mono')}>
                  {row.year}
                  {doubleYears.has(row.year) && (
                    <span className="block font-sans text-xs text-zinc-400">{row.event}</span>
                  )}
                </td>
                <td className={cn(CELL, 'text-ink')}>{row.driver}</td>
                <td className={CELL}>{row.team}</td>
                <td className={cn(CELL, 'pr-0 text-right font-mono')}>{row.time ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {winners && winners.unavailable_years.length > 0 && (
        <p className="mt-4 text-sm text-zinc-400">
          Results for {winners.unavailable_years.join(', ')} could not be loaded.
        </p>
      )}
    </section>
  );
}
```

`window` is a local name shadowing the global. If lint flags `no-shadow`/`no-restricted-globals`, rename it `span`.

- [ ] **Step 4: Implement the detail client and route**

Create `frontend/components/circuits/circuit-detail-client.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { CircuitGlow } from '@/components/candy/circuit-glow';
import { CircuitWinners } from '@/components/circuits/circuit-winners';
import { useCalendarRace } from '@/hooks/use-calendar-race';
import { useCircuitWinners } from '@/hooks/use-circuit-winners';
import type { CircuitEntry } from '@/lib/circuit-geometry';
import { focusRing } from '@/lib/focus';
import { parseRaceDate } from '@/lib/race-date';
import { parseStandingsYear } from '@/lib/standings';
import type { Point } from '@/lib/svg-path';
import { cn } from '@/lib/utils';

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
const LINK = cn(
  'rounded text-sm text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400',
  focusRing,
);

interface CircuitDetailClientProps {
  circuit: CircuitEntry;
  /** Loaded on the server, so this page downloads no outline chunk. */
  points: Point[];
  latestYear: number;
}

/**
 * `/circuits/[slug]`: one circuit's outline, facts, place on a season's calendar, and recent
 * winners.
 *
 * **The text column sits beside the glow, never over it**, for the measured reason
 * `briefing-circuit-band.tsx` gives: over the red line layer `zinc-400` falls to 2.24:1.
 *
 * `?year=` only chooses which season's calendar row to show and where the back link returns to.
 * It's read from `useSearchParams` like `/circuits`, and this page never writes it.
 */
export function CircuitDetailClient({ circuit, points, latestYear }: CircuitDetailClientProps) {
  const year = parseStandingsYear(useSearchParams().getAll('year'), latestYear);
  const race = useCalendarRace(circuit.id, year);
  const winners = useCircuitWinners(circuit.id);
  const date = race ? parseRaceDate(race.date) : null;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-16">
      <Link href={year === latestYear ? '/circuits' : `/circuits?year=${year}`} className={LINK}>
        ← {year} circuits
      </Link>

      <div className="mt-10 grid items-center gap-10 md:grid-cols-2">
        <div className="mx-auto aspect-square w-full max-w-md">
          <CircuitGlow points={points} variant="glow" draw="immediate" className="h-full w-full" />
        </div>
        <div>
          <p className={cn('mb-3 flex items-center gap-3', LABEL)}>
            <span aria-hidden="true" className="h-1.5 w-5 flex-shrink-0 bg-f1-red" />
            {circuit.location}
          </p>
          <h1 className="mb-8 text-3xl font-black uppercase tracking-tight text-ink md:text-4xl">
            {circuit.name}
          </h1>
          <dl className="grid grid-cols-2 gap-6">
            <div>
              <dt className={LABEL}>Length</dt>
              <dd className="mt-1 font-mono text-xl text-ink">{(circuit.lengthM / 1000).toFixed(1)} km</dd>
            </div>
            <div>
              <dt className={LABEL}>First Grand Prix</dt>
              <dd className="mt-1 font-mono text-xl text-ink">{circuit.firstGp}</dd>
            </div>
          </dl>
          {race && (
            <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              {[`Round ${race.round}`, date && `${date.day} ${date.monthAbbr} ${date.year}`, race.official_name]
                .filter(Boolean)
                .join(' · ')}
              {race.event_format.includes('sprint') && (
                <span className="ml-2 rounded-sm bg-zinc-800 px-1.5 py-0.5 font-sans font-semibold text-zinc-200">
                  Sprint
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <CircuitWinners {...winners} />
    </div>
  );
}
```

The test matches `/^Round 13 · /` against the `<p>`'s own text. If the Sprint span ever makes `findByText` see mixed content, the first text node still starts with "Round 13 · ". Keep the Sprint span *after* the joined string.

Create `frontend/app/circuits/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { CircuitDetailClient } from '@/components/circuits/circuit-detail-client';
import { LandingNav } from '@/components/landing/landing-nav';
import { loadCircuit } from '@/lib/circuit-geometry';
import { resolveCircuitRoute } from '@/lib/circuit-route';

/** Per request for the same reasons as `/circuits`: the server clock, and `useSearchParams`. */
export const dynamic = 'force-dynamic';

interface CircuitPageProps {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export function generateMetadata({ params }: CircuitPageProps): Metadata {
  const route = resolveCircuitRoute(params.slug, undefined);
  if (route.kind !== 'render') return { title: 'Circuit not found' };
  return {
    title: `${route.entry.name} — F1 Circuits`,
    description: `${route.entry.name}, ${route.entry.location}: its outline, length, first Grand Prix and recent winners.`,
  };
}

/**
 * `/circuits/[slug]`. The outline is loaded **here**, on the server, and handed down as props,
 * so the page ships no geometry chunk. An alias slug redirects so each circuit has one URL. The
 * rules live in `resolveCircuitRoute`, because RTL cannot render an async server component.
 */
export default async function CircuitPage({ params, searchParams }: CircuitPageProps) {
  const route = resolveCircuitRoute(params.slug, searchParams.year);
  if (route.kind === 'notFound') notFound();
  if (route.kind === 'redirect') redirect(route.to);

  const geometry = await loadCircuit(route.entry.id);
  if (!geometry) notFound();

  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-zinc-950 pt-14">
        <CircuitDetailClient circuit={route.entry} points={geometry.points} latestYear={new Date().getFullYear()} />
      </main>
    </>
  );
}
```

`notFound()` and `redirect()` are typed `never`, so TS narrows `route` to `render` after them.

- [ ] **Step 5: Run the tests and a build**

Run: `cd frontend && mise exec -- pnpm vitest run tests/circuit-detail-client.test.tsx && mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm build`
Expected: tests PASS. The build lists `ƒ /circuits` and `ƒ /circuits/[slug]`.

- [ ] **Step 6: Commit**

```bash
git add frontend/hooks/use-circuit-winners.ts frontend/hooks/use-calendar-race.ts frontend/components/circuits frontend/app/circuits frontend/tests/circuit-detail-client.test.tsx
git commit -m "feat(circuits): /circuits/[slug] with facts, calendar row and recent winners"
```

---

### Task 9: Cross-links and nav

**Files:**
- Modify: `frontend/components/landing/links.ts`, `frontend/tests/landing-nav.test.tsx` (`DESTINATIONS`)
- Modify: `frontend/lib/standings.ts` (`SeasonStamp`, `seasonStamp`), `frontend/tests/standings.test.ts` (the `toEqual` assertions at ~132, 145, 160–161)
- Modify: `frontend/components/standings/standings-page-client.tsx`, `frontend/tests/standings-page-client.test.tsx`
- Modify: `frontend/components/briefing/briefing-circuit-band.tsx` (CIRCUIT row), `frontend/tests/briefing-circuit-band.test.tsx`

**Interfaces:**
- Consumes: `circuitSlugForLocation`, `canonicalSlug` (Task 5).
- Produces: `SeasonStamp` = `{ label: string; lead: string; event: Race | null; final: boolean }`, where `label === (event ? `${lead} · ${event.name}` : lead)`.

- [ ] **Step 1: Nav — test first**

In `frontend/tests/landing-nav.test.tsx`, insert into `DESTINATIONS` between `['/tyres', 'Tyres']` and the `/standings` comment:

```ts
  // Circuits opens the season group — where they race, then who is winning, then who they are —
  // and sits beside Standings because the two share `?year=` links.
  ['/circuits', 'Circuits'],
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/landing-nav.test.tsx`. Expected: FAIL.

In `frontend/components/landing/links.ts`, insert before the `/standings` entry's comment:

```ts
  // Opens the season group: where they race, then who is winning (Standings), then who they are
  // (Teams). Beside Standings on purpose — both pages carry `?year=` and link to each other — and
  // after Tyres so Car Anatomy and Tyres, the two "how the machine works" pages, stay adjacent.
  { href: '/circuits', label: 'Circuits' },
```

Run the same test. Expected: PASS.

- [ ] **Step 2: Stamp — test first**

In `frontend/tests/standings.test.ts`, change the four `toEqual(` assertions on `seasonStamp(...)` results (lines ~132, 145, 160, 161) to `toMatchObject(`. Then add inside the same `describe`:

```ts
  it('names the as-of event and its lead separately, so the page can link the event', () => {
    const stamp = seasonStamp(14, CALENDAR_2026);

    expect(stamp?.lead).toBe('After Round 14 of 23');
    expect(stamp?.event?.name).toBe('Spanish Grand Prix');
    expect(stamp?.label).toBe(`${stamp?.lead} · ${stamp?.event?.name}`);
  });

  it('has no event when the calendar cannot name one', () => {
    expect(seasonStamp(14, null)).toMatchObject({ lead: 'After 14 rounds', event: null });
  });
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/standings.test.ts`. Expected: the two new tests FAIL.

In `frontend/lib/standings.ts`, extend `SeasonStamp`:

```ts
export interface SeasonStamp {
  /** "After Round 14 of 23 · Spanish Grand Prix", or a shorter form when less is known. */
  label: string;
  /** `label` without the event: "After Round 14 of 23". Equal to `label` when `event` is null. */
  lead: string;
  /** The as-of event, so the page can link it to its circuit; null when the calendar can't name one. */
  event: Race | null;
  /** Every round on the calendar has been held — the season is over. */
  final: boolean;
}
```

In `seasonStamp`, make each return carry the new fields:

```ts
  if (total === 0 || racesCompleted > total) {
    const lead = `After ${racesCompleted} ${racesCompleted === 1 ? 'round' : 'rounds'}`;
    return { label: lead, lead, event: null, final: false };
  }

  const event = rounds.find((race) => race.round === racesCompleted) ?? null;
  const lead = event
    ? `After Round ${racesCompleted} of ${total}`
    : `After ${racesCompleted} of ${total} rounds`;
  return {
    label: event ? `${lead} · ${event.name}` : lead,
    lead,
    event,
    final: racesCompleted === total,
  };
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/standings.test.ts`. Expected: PASS.

- [ ] **Step 3: Standings page links — test first**

Append to `frontend/tests/standings-page-client.test.tsx`, inside its top-level `describe` (the suite's `beforeEach` already makes `getStandingsMock`/`getRacesMock` resolve per year; follow how the existing "stamp" tests set them up):

```tsx
  it('links the as-of event to its circuit', async () => {
    getStandingsMock.mockResolvedValue(standings2026 as StandingsResponse);
    getRacesMock.mockResolvedValue(CALENDAR_2026);
    renderPage();

    const link = await screen.findByRole('link', { name: 'Spanish Grand Prix' });
    expect(link).toHaveAttribute('href', '/circuits/madrid');
    expect(link.closest('p')).toHaveTextContent(MID_SEASON);
  });

  it('links to the same season’s circuits', async () => {
    getStandingsMock.mockResolvedValue(standings2024 as StandingsResponse);
    getRacesMock.mockResolvedValue(CALENDAR_2024);
    renderPage('?year=2024');

    expect(await screen.findByRole('link', { name: '2024 circuits →' })).toHaveAttribute(
      'href',
      '/circuits?year=2024',
    );
  });
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/standings-page-client.test.tsx`. Expected: the two new tests FAIL.

In `frontend/components/standings/standings-page-client.tsx`:
- import `circuitSlugForLocation` from `@/lib/circuit-geometry`;
- after `const stamp = …`, add `const eventSlug = stamp?.event ? circuitSlugForLocation(stamp.event.location) : null;`
- replace `{stamp?.label}` inside the live-region `<p>` with:

```tsx
            {stamp?.event && eventSlug ? (
              <>
                {stamp.lead} ·{' '}
                <Link href={`/circuits/${eventSlug}`} className={cn(LINK, 'text-[10px]')}>
                  {stamp.event.name}
                </Link>
              </>
            ) : (
              stamp?.label
            )}
```

`LINK` sets `text-sm`, so `cn(LINK, 'text-[10px]')` lets `twMerge` keep the stamp's size. Both are font sizes, so no colour collision.

- replace `<SeasonSelect … />` in the header row with:

```tsx
          <div className="flex flex-wrap items-center gap-6">
            <Link href={year === latestYear ? '/circuits' : `/circuits?year=${year}`} className={LINK}>
              {year} circuits →
            </Link>
            <SeasonSelect years={standingsYears(latestYear)} value={year} onChange={selectYear} />
          </div>
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/standings-page-client.test.tsx tests/standings.test.ts`. Expected: PASS. If an existing assertion reads the stamp with `getByText(MID_SEASON)`, it now spans a link. Change it to `screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.startsWith(MID_SEASON) === true)`, or assert `toHaveTextContent` on the live region.

- [ ] **Step 4: Briefing band link — test first**

In `frontend/tests/briefing-circuit-band.test.tsx`, change the module mock so the new import is real:

```ts
vi.mock('@/lib/circuit-geometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/circuit-geometry')>();
  return { ...actual, loadCircuitByLocation: vi.fn() };
});
```

and add inside `describe('the four rows', …)`, after `'renders ROUND, LOCATION, DATE and CIRCUIT when every field has data'`. The file's `beforeEach` already makes `load` resolve `MONZA_GEOMETRY` (`id: 'it-1922'`) for any location but Monaco:

```tsx
    it('links the CIRCUIT row to the circuit’s page', async () => {
      await renderBand(<BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />);

      expect(screen.getByRole('link', { name: 'Autodromo Nazionale Monza' })).toHaveAttribute(
        'href',
        '/circuits/monza',
      );
    });

    it('links Monaco to its canonical slug, not the calendar’s spelling', async () => {
      await renderBand(<BriefingCircuitBand raceInfo={MONACO_RACE} round={8} />);

      expect(screen.getByRole('link', { name: 'Circuit de Monaco' })).toHaveAttribute(
        'href',
        '/circuits/monaco',
      );
    });
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/briefing-circuit-band.test.tsx`. Expected: the new test FAILS.

In `frontend/components/briefing/briefing-circuit-band.tsx`, import `Link` from `next/link`, `canonicalSlug` alongside `loadCircuitByLocation`, and `focusRing` from `@/lib/focus`. In the `if (geometry)` block, replace `value: geometry.name,` with:

```tsx
      // Linked to the circuit's own page: the band is the briefing's one mention of the track,
      // and /circuits/[slug] is where its facts and winners live. `canonicalSlug` is non-null for
      // any geometry the loader returned, since both read the same 40 files.
      value: (
        <Link
          href={`/circuits/${canonicalSlug(geometry.id) ?? ''}`}
          className={cn('rounded underline decoration-zinc-600 underline-offset-2 hover:decoration-zinc-300', focusRing)}
        >
          {geometry.name}
        </Link>
      ),
```

Run: `cd frontend && mise exec -- pnpm vitest run tests/briefing-circuit-band.test.tsx tests/briefing-chat.test.tsx`. Expected: PASS.

- [ ] **Step 5: Full frontend check**

Run: `cd frontend && mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/landing/links.ts frontend/tests/landing-nav.test.tsx frontend/lib/standings.ts frontend/tests/standings.test.ts frontend/components/standings/standings-page-client.tsx frontend/tests/standings-page-client.test.tsx frontend/components/briefing/briefing-circuit-band.tsx frontend/tests/briefing-circuit-band.test.tsx
git commit -m "feat(circuits): nav entry and cross-links from standings and the briefing band"
```

---

### Task 10: Browser harness coverage

**Files:**
- Modify: `frontend/browser/support/api-mocks.ts`
- Modify: `frontend/browser/a11y-smoke.spec.ts`, `frontend/browser/focus-rings.spec.ts`, `frontend/browser/invisible-text.spec.ts`
- Create: `frontend/browser/circuits.spec.ts`

**Interfaces:**
- Consumes: fixtures `races-2026.json` and `circuit-winners-it-1922.json`; the routes from Tasks 7–8.

- [ ] **Step 1: Serve the winners fixture, failing closed for any other id**

In `frontend/browser/support/api-mocks.ts`, add before `unmocked.push(…)`:

```ts
    const winners = /^\/api\/circuits\/([a-z]{2}-\d{4})\/winners$/.exec(pathname);
    if (winners) {
      // Only circuits with a captured response are served. Any other id falls through to the
      // fail-closed 501 below, so a test that wanders onto an uncaptured circuit fails loudly.
      const named = `circuit-winners-${winners[1]}.json`;
      if (existsSync(path.join(FIXTURES, named))) return route.fulfill({ json: fixture(named) });
    }
```

- [ ] **Step 2: Add the routes to the three sweeps**

`a11y-smoke.spec.ts`:
- change the 1440 list to `['/', '/teams', '/tyres', '/candy', '/standings', '/circuits', '/circuits/monza']`;
- add `{ route: '/circuits', width: 390 }` to `PASSES`;
- after the existing `/standings` wait line, add:

```ts
    if (route === '/circuits') await expect(page.getByRole('list', { name: /calendar$/ })).toBeVisible();
    if (route === '/circuits/monza') await expect(page.getByRole('table')).toBeVisible();
```

`invisible-text.spec.ts`: add `{ path: '/circuits', width: 1440 }` and `{ path: '/circuits/monza', width: 1440 }` to `ROUTES`, and the same two wait lines (using `path`) after its `/standings` wait.

`focus-rings.spec.ts`:
- change the sweep list to `['/', '/teams', '/tyres', '/circuits', '/circuits/monza']`;
- above the loop, add the comment: "Routes are listed by hand, not discovered — a new route joins the sweep only when it is added here.";
- inside the loop, before `tabThroughPage`, add:

```ts
    if (route === '/circuits') await expect(page.getByRole('list', { name: /calendar$/ })).toBeVisible();
    if (route === '/circuits/monza') await expect(page.getByRole('table')).toBeVisible();
```

- [ ] **Step 3: Write the circuits spec**

Create `frontend/browser/circuits.spec.ts`:

```ts
import { expect, test } from './support/test';

/**
 * `/circuits` and `/circuits/[slug]` against the production build, where jsdom cannot reach:
 * real lazy chunks for the outlines, Next's patched `replaceState`, and a server-side redirect.
 */

test('/circuits draws every round of the calendar fixture with its outline', async ({ page }) => {
  await page.goto('/circuits');

  const cards = page.getByRole('list', { name: /calendar$/ }).getByRole('listitem');
  await expect(cards).toHaveCount(24);
  await expect(page.locator('[data-circuit-slot] svg')).toHaveCount(24);
  await expect(page.getByText('No track map')).toHaveCount(0);
});

test('the season picker replaces the URL, so Back leaves the page rather than the season', async ({ page }) => {
  await page.goto('/standings');
  await page.goto('/circuits');
  await expect(page.getByRole('list', { name: /calendar$/ })).toBeVisible();

  await page.getByLabel('Season').selectOption({ index: 1 });
  await expect(page).toHaveURL(/\/circuits\?year=\d{4}$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/standings$/);
});

test('an alias slug redirects to the canonical one', async ({ page }) => {
  const response = await page.request.get('/circuits/bahrain?year=2024', { maxRedirects: 0 });

  expect([307, 308]).toContain(response.status());
  expect(response.headers().location).toMatch(/\/circuits\/sakhir\?year=2024$/);
});

test('a card opens its circuit, and the circuit shows its winners', async ({ page }) => {
  await page.goto('/circuits');

  await page.getByRole('link', { name: /Italian Grand Prix/ }).click();

  await expect(page).toHaveURL(/\/circuits\/monza(\?year=\d{4})?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Autodromo Nazionale Monza' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});

test('an unknown circuit is a 404', async ({ page }) => {
  const response = await page.goto('/circuits/atlantis');

  expect(response?.status()).toBe(404);
});
```

- [ ] **Step 4: Build and run the harness**

Run: `cd frontend && mise exec -- pnpm build && mise exec -- pnpm test:browser`
Expected: all PASS.

If axe or invisible-text reports a finding on `/circuits*`, fix the component, never the spec. The likeliest cause is a zinc shade under 4.5:1 on `zinc-950` (`zinc-500` fails; use `zinc-400`). If the focus sweep finds a default-blue ring, a control is missing `focusRing`.

- [ ] **Step 5: Commit**

```bash
git add frontend/browser
git commit -m "test(browser): cover /circuits and /circuits/[slug] in every sweep"
```

---

### Task 11: Docs and final verification

**Files:**
- Modify: `CLAUDE.md` (a new section after the `/standings` sections; the `backend/tools` paragraph "`tools/` is not uniform"; the browser-tests bullet on the focus-ring sweep)
- Modify: `README.md` (the "API Endpoints" table at ~line 194–202)

- [ ] **Step 1: README**

Add rows to the endpoint table:

```markdown
| `/api/circuits/{circuit_id}/winners` | GET | Recent winners at one circuit (the three seasons before this one), matched by circuit; ~5s cold, cached after |
```

and change the `/api/races/{year}` description to `F1 calendar from FastF1, with each event's format and official name`.

- [ ] **Step 2: CLAUDE.md**

In "`tools/` is not uniform", change "The other six files are plain helpers" to "The other seven files are plain helpers", and add to the list: "`circuit_winners.py` (recent winners per circuit for the `/circuits` detail page)".

In the Browser tests list, replace the bullet "The focus-ring sweep runs on every route except `/candy`…" with:

```markdown
- **The route sweeps are hand-written lists, not discovered.** `focus-rings.spec.ts`, `a11y-smoke.spec.ts` and `invisible-text.spec.ts` each name their routes literally; a new route is covered only once it is added to all three. `/candy` stays out of the focus sweep because it has no focusable controls by design.
```

Add a new section after the last `/standings` section:

```markdown
**`/circuits` winners are matched by circuit, never by Grand Prix name — and the agent's tool
still matches by name.** `fastf1_helpers.find_event` is a substring match on `EventName`, and a
Grand Prix is not a track: 2026's Spanish GP is at Madrid while 2023–25's was at Barcelona, and
FastF1 files the rescheduled 2026 Bahrain GP under Kuala Lumpur. So `tools/circuit_winners.py`
slugs each schedule row's `Location` and looks it up in `frontend/data/circuits/index.json`
(`CIRCUIT_INDEX_PATH` in `config.py`) — which makes `location_slug` the **third** copy of the slug
rule, after `locationSlug` and the converter's `slug()`. `frontend/tests/fixtures/slug-cases.json`
is read by both test suites; add a case there, never to one side.

**The winners cache has no expiry, on purpose.** Keyed `(circuit_id, year)` across the three
seasons before the current one — all finished, so nothing a TTL could refresh — and bounded by the
40 ids in `index.json` because the route 404s an unknown id before anything is stored. A year the
circuit did not host is cached as `()`; a year whose FastF1 load *failed* is not cached and is
reported in `unavailable_years`, so a transient outage is never remembered as "never raced here". A
lock per circuit makes two cold views pay the ~4.6s once. The current season's winner is
deliberately out of the window.

**`index.json`'s aliases must cover past seasons, not just the current calendar.** FastF1 spells
Abu Dhabi `Yas Island` for 2020–25 and Belgium `Spa` before 2022; without those aliases the
winners matcher misses them and the briefing band draws no outline for those years. Aliases live in
`LOCATION_ALIASES` in `scripts/fetch-circuit-geometry.mjs` and nowhere else.
`tests/circuit-catalog.test.ts` pins them.

**A round with no outline renders a card on `/circuits`, unlike the band.** The band hides a missing
outline because a briefing without it is still complete; in the grid the card *is* the content, so
it keeps its box, says "No track map", and is not a link. The grid loads one lazy chunk per unique
circuit and reveals when all have settled; `tests/circuit-imports.test.ts` fails any new static
import of an outline outside the three files that draw one known circuit.
```

- [ ] **Step 3: Full verification**

Run every command, and read the output of each before moving on:

```bash
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest -q
```

```bash
cd frontend && mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm test
```

```bash
cd frontend && mise exec -- pnpm build && mise exec -- pnpm test:browser
```

Expected: all green. Report any failure verbatim. Don't claim done without the output.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: record the /circuits winners matching, cache shape and outline rules"
```
