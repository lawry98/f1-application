# Circuits page — design

**Date:** 2026-09-28 · **Branch:** `lc/f1-circuits-page-5a6916` (off `main` at `fbfb44a`) · **Status:** awaiting review

## Goal

A `/circuits` season grid and a `/circuits/[slug]` detail page that put the 40 vendored circuit
outlines (`frontend/data/circuits/`) to use. Today one of them is drawn. The detail page also
serves recent winners, which the backend can compute but no route exposes.

## Decisions

Approved in brainstorming, 2026-09-28 ("all rec").

| Question | Decision | Why |
|---|---|---|
| Scope | `/circuits?year=` season grid + `/circuits/[slug]` detail for each of the 40 | The 4.6s winners cost stays on one circuit per view; a circuit gets a shareable URL |
| Detail URL | `/circuits/<canonical slug>` = `locationSlug(geometry.location)` (`monza`, `sakhir`). An alias slug (`/circuits/bahrain`) redirects to it; an unknown one is a 404 | Ids like `it-1922` stay internal. All 40 canonical slugs are unique and already keys in `index.json` (verified) |
| Grid outlines | Existing `loadCircuit` per unique id, awaited together per season, `CircuitGlow variant="plain"` | No new artefact. ~2 kB gz per chunk, parallel. `plain` has no blur filter; 24 Gaussian blurs is a paint cost |
| No outline, in the grid | Card stays with all its text; outline slot keeps its size, empty, captioned "No track map" (`zinc-400`); the card doesn't link to a detail page | In a grid the card is the content. Hiding it (the band's rule) would delete a race from the calendar |
| Year | `STANDINGS_FIRST_YEAR`..latest; the `/standings` pattern exactly | Same range as `/standings`, so `?year=` links work both ways |
| Track info | Two fields added to `/api/races` rows: `event_format`, `official_name`. No track-info route | `get_track_info` reads the same schedule row `/api/races` already serves. Zero per-circuit calls |
| Winners | Detail page only, fetched on demand, cached per `(circuit_id, year)` for the life of the process | See "Winners" |
| Briefing pre-fill link | Later (not v1) | `/briefing` reads no URL param today; it's a separate change to `briefing-chat` |
| Agent winners bug | Separate task (chip spawned) | Out of scope; see Finding 1 |
| Nav | `Circuits` between `Tyres` and `Standings` | See "Nav" |

## Findings that shaped this

Measured on 2026-09-28 against live FastF1.

1. **`find_event` matches the event name, not the track.** `fastf1_helpers.find_event` is a
   substring match on `EventName`, so `get_circuit_winners("Monza")` finds nothing, and matching
   by Grand Prix name gets the track wrong:

   | 2026 event | 2026 location | Name-matched 2023–25 winners are from |
   |---|---|---|
   | Spanish Grand Prix | Madrid | Barcelona |
   | Bahrain Grand Prix | Kuala Lumpur | Sakhir |
   | Barcelona Grand Prix | Barcelona | nothing (no event of that name) |

   The page's winners are therefore matched by circuit. The agent tool has the same bug today and
   is left to the separate task.

2. **`index.json`'s aliases cover the 2026 calendar only.** FastF1 spells past seasons differently:

   | FastF1 `Location` | Seasons seen | Circuit |
   |---|---|---|
   | `Yas Island` | 2020–2025 | `ae-2009` |
   | `Abu Dhabi` | 2015 | `ae-2009` |
   | `Spa` | every season before 2022 | `be-1925` |
   | `Nürburgring` | 2020 | `de-1927` |
   | `Mugello` | 2020 | `it-1914` |

   This matters for winners (Abu Dhabi 2023–25 is `Yas Island`) and for the briefing band, which
   draws no outline for a 2023–25 Abu Dhabi briefing today. The fix goes in the converter's
   existing `LOCATION_ALIASES` table (it becomes ten entries, not five), not in a second table.

3. **Missing outlines, once the aliases above are added:** 0 for any season from 2023 to 2026, so
   the no-outline card state exists for resilience and is tested in Vitest. The 2026 fixture
   doesn't exercise it.

4. **`/api/races` returns `Pre-Season Testing` twice, as round 0**, and the Sakhir testing rows
   resolve to `bh-2002`. The grid drops round 0, and so does the winners matcher. Otherwise
   testing would make Sakhir "held" and add a phantom winner lookup.

5. **`_fastf1_circuit_winner` returns `None` both when a race wasn't held and when its load
   failed.** A cache keyed on that result would store a transient failure as "never raced here",
   for good.

6. **A circuit can host two races in one season** (Spielberg, Silverstone and Sakhir in 2020). A
   winner row carries its event name, and a year can have several rows.

7. **Correction to the brainstorm:** the backend needs a Python `location_slug` whichever design is
   used, because it has to slug FastF1's `Location` to look it up in `index.json`. Reading the
   file still wins on cache size (40 known ids rather than client-supplied strings), but it is a
   third copy of the slug rule. It is guarded by a shared test-vector file both suites read (see
   Testing).

8. **Correction to the brief:** the focus-ring sweep is **not** automatic. `focus-rings.spec.ts`
   lists `['/', '/teams', '/tyres']` literally, and `a11y-smoke` and `invisible-text` hardcode
   their lists too. `/circuits` has to be added to all three by hand.

9. **The converter fetches bacinger's `master`**, which isn't pinned, so regenerating may also
   rewrite outlines that aren't meant to change. See "Regenerating the set".

## Backend

### `/api/races/{year}`: two more fields

Each row gains `event_format` (`EventFormat`, e.g. `conventional`, `sprint_qualifying`) and
`official_name` (`OfficialEventName`, falling back to `EventName`), read from the row
`get_races` already iterates. `get_track_info` stays as an agent tool, unchanged.

### `GET /api/circuits/{circuit_id}/winners`

```jsonc
// shape only — values illustrative
{
  "circuit_id": "it-1922",
  "from_year": 2023, "to_year": 2025,          // inclusive; current season excluded, as the tool does
  "winners": [
    { "year": 2025, "event": "Italian Grand Prix", "driver": "Max Verstappen",
      "driver_code": "VER", "team": "Red Bull Racing", "time": "1:13:24.325" }
  ],                                           // newest first; a year the circuit didn't host is simply absent
  "unavailable_years": []                      // years whose load failed; partial answers still render
}
```

- `circuit_id` not in `index.json`'s values → **404** `"Unknown circuit."` (actionable, so not
  masked).
- Every year in the window failed → **502** with a new `GENERIC_CIRCUIT_WINNERS_ERROR` in
  `api/errors.py`, detail logged.
- The handler runs the helper with `asyncio.to_thread`. Only FastF1 is touched, so no
  `clear_openf1_cache()` is needed.

### `tools/circuit_winners.py` (plain helper, not a `@tool`)

- `CIRCUIT_INDEX_PATH` is a constant in `config.py` (`backend/../frontend/data/circuits/index.json`),
  not an env var. The file is read once and cached. If it's missing, the endpoint returns 502 and
  nothing crashes.
- `location_slug()` is a Python port of `locationSlug`, pinned by the shared vectors.
- **Matching:** for each year, walk `get_schedule(year)` (already cached per process), skip
  `RoundNumber == 0`, and keep the rows whose `index[location_slug(Location)] == circuit_id`.
  Each kept row is loaded with `load_race_session` and its P1 row read.
- **Cache:** `{(circuit_id, year): tuple[winner_row, ...]}`. The empty tuple means "not held that
  year". No expiry, because every year in the window is a finished season. A failed load raises
  inside the helper, is caught per year, lands in `unavailable_years` and is not stored. A deep
  copy goes out on read, as in `standings_tools`.
- **Single flight:** each circuit id has its own lock, so two cold views of Monza make one set of
  loads. Different circuits don't block each other.
- **Size:** at most 40 × 3 entries.
- **Cost:** cold, ~1.5s per held year (≤ ~4.6s per circuit); warm, instant. Years a circuit didn't
  host cost only the schedule read.
- **Rejected:** prefetching on grid hover (FastF1 loads for idle curiosity), warming at startup
  (~110s of FastF1 on every restart, since its disk cache never fills), and a TTL (nothing in the
  window can change).
- **Non-goal:** the current season's winner. Showing it means a TTL entry and a stewards'-review
  window. v1 keeps the tool's window, and the heading states the years.
- The helper never raises: it returns `{"error": ...}`, following the `tools/` convention.

## Frontend

### Data

- **`data/circuits/catalog.json`**, written by the converter: `[{ id, slug, name, location,
  lengthM, firstGp }]` for all 40, with no points (~5 kB). It is statically imported, because it
  carries no geometry. It gives the grid its links (id → canonical slug) and the detail page its
  facts, with no outline chunk needed. A test asserts it agrees with every `<id>.json`.
- `Race` in `types/f1.ts` gains `event_format: string` and `official_name: string`, and a new
  `CircuitWinnersResponse` type is added. `lib/api.ts` gains `getCircuitWinners(id)`.
- `lib/circuit-geometry.ts` gains `circuitBySlug(slug)` (→ catalog entry and whether `slug` is
  canonical) and `canonicalSlug(id)`.

### `/circuits` (`app/circuits/page.tsx`, `force-dynamic`)

This copies `/standings`. `latestYear` comes from the server clock, and the client reads
`?year=` through `parseStandingsYear(useSearchParams().getAll('year'), latestYear)`. The
`standings` naming is kept on purpose: the range is the same range. `SeasonSelect` comes from
`components/standings/`, and its only write is `window.history.replaceState`.

- **`hooks/use-season-circuits.ts`** fetches `getRaces(year)`, drops round 0, resolves each
  location, and runs `loadCircuit` once per unique id through `Promise.all`. It returns the cards
  once everything has settled, so outlines don't pop in one by one. It follows `use-standings`'
  shape (`active` flag, error and retry, a result only reported for the year it was fetched for).
- **`components/circuits/circuits-page-client.tsx`** holds the header (eyebrow, h1, picker, a
  `Standings →` link carrying `?year=`) and the loading, error and data states.
- **`components/circuits/circuit-card.tsx`** shows round, event name, location, country, date
  (via `lib/race-date.ts`), a `Sprint` chip when `event_format` contains `sprint`, and the plain
  outline or the "No track map" slot. With an outline, the whole card is a `<Link>` to
  `/circuits/<slug>?year=<year>` using `focusRingOffsetBase`. Without one, it is not focusable.
- Layout: a grid of 1, 2, 3 and then 4 columns. Every glyph is a zinc neutral on bare `zinc-950`
  (no accent colour on text), so none of the lifted-colour helpers apply.

### `/circuits/[slug]` (`app/circuits/[slug]/page.tsx`, `force-dynamic`)

- **Server:** `circuitBySlug`. Unknown → `notFound()`; an alias → `redirect('/circuits/<canonical>')`,
  keeping `?year=`. The page loads geometry with `loadCircuit` and passes `points` as props, so
  the client downloads no outline chunk.
- **Hero:** `CircuitGlow variant="glow"` on the left and a facts column on the right: name,
  location, length (km, one decimal), first Grand Prix. Text sits beside the glow, never over it,
  for the reason `briefing-circuit-band.tsx` documents (neutrals collapse to 2.24:1 over the red
  line).
- **Calendar row** (client, `useSearchParams` for `?year=`, `getRaces`): if this circuit is on that
  season's calendar, it shows "Round N · date · official name · Sprint". Otherwise the row isn't
  rendered.
- **Winners** (client, `hooks/use-circuit-winners.ts`): a heading "Winners, 2023–2025" taken from
  the response, a skeleton while cold (up to ~5s), and a row per winner (year, driver, team, time; the event
  name too, but only in a year this circuit hosted two races). An empty list reads "No Grand Prix here in
  2023–2025". `unavailable_years` gets a quiet note, and an error offers retry. Team names are
  plain text; like `/standings`, there's no team colour on text.
- Back link to `/circuits?year=`.

### Cross-links

| From | To | Change |
|---|---|---|
| `/circuits` header | `/standings?year=` | new link |
| `/standings` header | `/circuits?year=` | new link, next to "Compare the teams →"'s style |
| `/standings` as-of stamp, event name | `/circuits/<slug>` | the name becomes a link when its location resolves |
| Briefing band's CIRCUIT row | `/circuits/<slug>` | the row value becomes a `<Link>`; nothing else in the band changes |

### Nav

`{ href: '/circuits', label: 'Circuits' }` goes between `Tyres` and `Standings`, with a comment:
it opens the season group (where they race → who's winning → who they are), keeps Car Anatomy +
Tyres and Teams + Showcase adjacent, and puts the two `?year=` pages side by side. That makes
eight links. The strip already scrolls horizontally (`overflow-x-auto`), so it's checked at 390px.

## Regenerating the set

1. Add the five aliases from Finding 2 to `LOCATION_ALIASES` and update its comment.
2. Have the converter also write `catalog.json`.
3. Run the converter. If any `<id>.json` changes beyond formatting, pin `SOURCE` to the bacinger
   commit that reproduces the committed files, or keep the committed outlines and take only
   `index.json` and `catalog.json`. Either way no outline changes in this branch, because the
   landing hero, band and `/candy` are tuned to the current shapes.

## Testing

**Backend (pytest):**
- matcher, with fake schedules:
  - the Madrid case (Spanish GP 2023–25 at Barcelona gives Madrid no winners);
  - Kuala Lumpur → `my-1999`, not Sakhir;
  - `Yas Island` → `ae-2009`;
  - round 0 skipped;
  - two races in one year.
- cache:
  - "not held" is cached, a failure is not;
  - a second call makes no loads;
  - single flight (two threads, one load).
- route: 404 for an unknown id, 502 masked when every year fails, partial results →
  `unavailable_years`.
- `/api/races` rows carry both new fields.
- `location_slug` against `frontend/tests/fixtures/slug-cases.json`.

**Frontend (Vitest):**
- `locationSlug` against the same `slug-cases.json`. The existing cases move there.
- `catalog.json` agrees with each `<id>.json`; the canonical slugs are unique and are all keys in
  `index.json`.
- `use-season-circuits`: drops round 0, loads each unique id once, stale-year responses are
  dropped.
- card: the no-outline state keeps the text, shows the caption and is not a link.
- page client: the year comes from the URL and the picker only calls `replaceState` (ported
  from `standings-page-client.test.tsx`).
- detail: a server alias redirects; an unknown slug is a 404; winners covers the empty state, the
  error with retry, and `unavailable_years`.
- nav order.
- no static import of `data/circuits/<id>.json` outside the existing allowlist (landing hero,
  `/candy`). This is a source scan, the guard for "never static-import the set".

**Fixtures (captured from the real routes, per `tests/fixtures/README.md`):**
- `races-2026.json`, re-captured with the new fields;
- `circuit-winners-it-1922.json` (Monza), newly captured;
- the README section extended.

**Browser (Playwright):**
- `api-mocks.ts` serves `/api/circuits/<id>/winners` from `circuit-winners-<id>.json` when that file
  exists and fails closed otherwise.
- `/circuits` and `/circuits/monza` are added to the `a11y-smoke` (1440 + 390), `focus-rings` and
  `invisible-text` lists.
- One spec checks that `/circuits` renders 24 cards from the 2026 fixture, every card has an
  outline, and the picker's `replaceState` survives Back.
- Every colour read calls `waitForMotionToSettle` first.

## Docs

- CLAUDE.md gets a `/circuits` section covering:
  - winners are matched by circuit, not by event name (Finding 1);
  - aliases come from past seasons too (Finding 2);
  - the winners cache shape and why it has no expiry;
  - the third slug copy and its shared vectors;
  - the browser route lists are hardcoded.
- README endpoint list: the winners route and the two new `/api/races` fields.

## Out of scope

- `/briefing?race=` pre-fill.
- A season-independent atlas of all 40.
- The current-season winner.
- Corner labels (no data).
- The agent tool's event-name matching.
