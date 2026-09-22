# Championship standings page — design

**Date:** 2026-09-22 · **Branch:** `lc/f1-standings-page-ce1e4f` (off `main` at `5052a43`) · **Status:** awaiting review

## Goal

A `/standings` page that renders the drivers' and constructors' championship tables served by the
existing `GET /api/standings/{year}` (`backend/api/routes.py`), for every season OpenF1 covers.
Nothing in `frontend/` calls that endpoint today.

## Decisions

Approved in brainstorming, 2026-09-22.

| Question | Decision | Why |
|---|---|---|
| Layout | Drivers table, then constructors table, one scroll | Both reachable with no interaction; constructors is only 11 rows; no `AnimatePresence`, so both stay testable |
| Year | `/standings` + a native season select; `?year=` for deep links; current season by default | `NAV_LINKS` keeps a static href (a `/standings/2026` href goes stale on 1 January); `usePathname()` ignores the query, so the nav's exact-match `aria-current` still fires |
| Pre-season | The route returns **200 with empty tables** for `reason: SEASON_NOT_STARTED` | It is a correct answer, not a failure. Behind the masked 502 the client cannot tell it from an OpenF1 outage |
| `/teams` | Untouched apart from one cross-link each way. `TEAMS.points` stays frozen | Different jobs: `/teams` explores teams, `/standings` reports the championship. Making `/teams` live has the largest blast radius in the app |
| Stamp | Shown, as the page's as-of line. **Format revised after approval:** the approved "After 16 of 24 rounds" rested on a wrong count (see "Cancelled races") | It is the live version of what `STANDINGS_AS_OF` hardcodes |
| Mid-season vs complete | Same page; a **Final** chip when every round is done | Nothing else differs |
| Ordering | Rows render in served order. No client sort | The backend's tie-break is deliberately deterministic |

## Verified against live data

Everything below was measured against OpenF1 and FastF1 on 2026-09-22. Latest held race: the
Spanish Grand Prix (Madrid), 13 September.

### Team names: the join is not exact

| OpenF1 `team_name` (2026) | `TEAMS.shortName` | Exact match |
|---|---|---|
| Alpine, Aston Martin, Audi, Cadillac, Ferrari, McLaren, Mercedes, Racing Bulls, Williams | same | yes, 9 of 11 |
| `Haas F1 Team` | `Haas` | no |
| `Red Bull Racing` | `Red Bull` | no |

Earlier seasons carry names that have no `TEAMS` entry at all, so the unmatched path runs on every
historical year:

| Season | Names with no `TEAMS` entry |
|---|---|
| 2023 | `Alfa Romeo`, `AlphaTauri` |
| 2024 | `Kick Sauber`, `RB` |
| 2025 | `Kick Sauber` |

### Cancelled races: `races_completed` over-counts (new finding)

The tool counts Race sessions **dated before today**. A cancelled race keeps its OpenF1 session and
has zero result rows, so it is counted.

| Season | Tool reports | Races actually held | FastF1 rounds | Cancelled |
|---|---|---|---|---|
| 2023 | 23 | 22 | 22 | Imola (floods) |
| 2024 | 24 | 24 | 24 | none |
| 2025 | 24 | 24 | 24 | none |
| 2026 | **16** | **14** | 23 | Bahrain, Saudi Arabia |

As shipped, the page would say "16 rounds" when 14 were held, and 2023 would read "23 of 22" and
never be marked final. The hand-written `STANDINGS_AS_OF = 'After Round 11 · Hungary'` already
counts held races: Hungary is the 13th scheduled race and the 11th held.

FastF1's calendar is correct: it removes cancelled events and renumbers. Round 14 of 23 is the
Spanish Grand Prix, which is why the numerator must count held races. With that fix, "round
`races_completed`" in the calendar is the last race whose points are in the table.

The table *values* are unaffected, because a race with no result rows adds no points.

### Other facts about the payload's shape

- **2026 has 23 drivers, not 22.** Tsunoda (#22, 1 pt) is a mid-season substitute. Three drivers
  are on zero.
- **Lawson raced for two teams** (Racing Bulls, then Red Bull Racing). His driver row names the
  latest team, and his 59 points are split across both constructors. The two tables deliberately
  do not reconcile by summing.
- **`driver` is `"Kimi ANTONELLI"`**: surname uppercased, diacritics already stripped upstream
  (`PEREZ`, `HULKENBERG`).
- **Cadillac appears on 0**, so the tool's roster seeding works. The table has 11 constructors.

## Backend changes

### 1. `get_championship_standings` counts only sessions that produced results

`backend/tools/standings_tools.py`:

- A scoring session (Race or Sprint) counts as **held** when its `session_key` appears in the result
  rows. The rows are already fetched, so this costs no requests and
  `test_the_whole_table_costs_three_requests` is unchanged.
- `races_completed` counts held Race sessions.
- If no scoring session is held, the tool returns `SEASON_NOT_STARTED`. That covers "every past
  session was cancelled", or results not yet published after the opener. Today that case returns
  a roster of zeros. The agent's existing fallback in `_invoke_tool`, which substitutes the prior
  season, is the right behaviour here too.
- The docstring states the new definition.

This also corrects the number the synthesizer cites in a briefing's "Championship Context" section.

### 2. The route serves pre-season as 200

`backend/api/routes.py` `get_standings`: when `result.get("reason") == SEASON_NOT_STARTED`, return

```json
{ "year": 2027, "races_completed": 0, "drivers": [], "constructors": [] }
```

Log it at info level. Every other error result still becomes `502 GENERIC_STANDINGS_ERROR`, and
the tool's error text never reaches the client.

## Frontend

### Files

| File | Change |
|---|---|
| `types/f1.ts` | `DriverStanding`, `ConstructorStanding`. Wire-shaped and snake_case, like `RaceInfo` |
| `types/api.ts` | `StandingsResponse`. The header comment widens to "SSE events and REST response envelopes" |
| `lib/api.ts` | `getStandings(year)`, modelled on `getRaces`: throws on a non-OK response |
| `lib/standings.ts` | Pure helpers (below). No class strings |
| `hooks/use-standings.ts` | Data hook (below). No class strings, because `hooks/` is outside Tailwind's `content` |
| `app/standings/page.tsx` | Server component: metadata, `searchParams`, `LandingNav` |
| `components/standings/standings-page-client.tsx` | Year state, URL sync, header, status line, states, sections |
| `components/standings/standings-tables.tsx` | `DriverStandingsTable`, `ConstructorStandingsTable`: presentation only, sharing style constants |
| `components/standings/season-select.tsx` | Native `<select>`, following `livery-select.tsx` |
| `components/landing/links.ts` | `Standings`, inserted before `Teams` |
| `components/landing/landing-nav.tsx` | The "Six links" comment becomes seven. No code change |
| `components/teams/teams-comparison-grid.tsx` | A "Live standings →" link beside the `STANDINGS_AS_OF` stamp |

### `lib/standings.ts`

| Export | Behaviour |
|---|---|
| `STANDINGS_FIRST_YEAR = 2023` | Mirrors the backend's `OPENF1_FIRST_YEAR`. A test reads the backend constant out of `backend/tools/openf1_client.py` and fails on drift |
| `standingsYears(latest)` | `[latest, …, STANDINGS_FIRST_YEAR]`, newest first |
| `parseStandingsYear(param, latest)` | Returns an integer within the range; anything else gives `latest`. Accepts `string \| string[] \| undefined`, as Next's `searchParams` does; a repeated `?year=` (an array) also gives `latest`. Keeps a hand-edited `?year=2019` from ever producing a 422 |
| `teamForStanding(name)` | Exact `shortName` match, or an explicit alias: `{ 'Haas F1 Team': 'haas', 'Red Bull Racing': 'red-bull' }`. Otherwise `null`. **No substring matching**, since that is the defect class the livery fix removed. Predecessor brands (`Kick Sauber`, `RB`, `AlphaTauri`, `Alfa Romeo`) are deliberately unmapped: putting Audi's colours on a 2024 row would misstate history |
| `formatDriverName(full)` | Title-cases fully uppercase tokens: `Kimi ANTONELLI` → `Kimi Antonelli`. Mixed-case tokens pass through. Diacritics cannot be recovered and are not attempted |
| `seasonStamp(racesCompleted, calendar)` | The as-of line. Rules below |

**Stamp rules.** `total` is the number of calendar rows with `round > 0`, which excludes the
round-0 pre-season testing rows. `event` is the calendar row whose `round === racesCompleted`.

| Condition | Label | Final chip |
|---|---|---|
| `racesCompleted === 0` | no stamp (the empty state renders instead) | no |
| calendar loaded, `event` found | `After Round 14 of 23 · Spanish Grand Prix` | when `racesCompleted === total` |
| calendar loaded, no `event` | `After 14 of 23 rounds` | when `racesCompleted === total` |
| calendar missing, or `racesCompleted > total` | `After 14 rounds` (`After 1 round`) | no |

The event is named by `Race.name`, never `Location`. FastF1 files the rescheduled 2026 Bahrain GP
under `Location: "Kuala Lumpur"`.

### `hooks/use-standings.ts`

`useStandings(year)` returns `{ standings, calendar, loading, error, retry }`. It follows the
shape of `use-races.ts`: state, one effect, and an `active` flag.

- It fetches `getStandings(year)` and `getRaces(year)` together with `Promise.allSettled`, so the
  stamp arrives complete rather than shifting from "After 14 rounds" to the full label.
- A failed standings fetch sets `error`. A failed calendar fetch sets `calendar: null` and logs to
  the console, which is the silent degradation `use-races` uses. The calendar only ever enriches
  the stamp.
- On a year change the `active` flag drops the older response, even if it resolves last. The
  previous year's tables never show under the new year's heading.
- `retry()` re-runs the effect through an attempt counter.
- Unlike `use-races`, this hook **exposes an error**. There, a failed fetch degrades to an
  already-correct rendering; here, the table is the page.

### Page, header and sections

`app/standings/page.tsx` is a server component. It computes `latestYear` with
`new Date().getFullYear()` **on the server** and passes it down as a prop, along with
`initialYear = parseStandingsYear(searchParams.year, latestYear)`. The client never reads the clock
during render, so there is no hydration mismatch at New Year (the trap `use-races.ts` documents).
Reading `searchParams` makes the route dynamic, which is correct for live data.

```
▬ 2026 SEASON                                   ← red tick + LABEL kicker
Championship Standings                          ← h1
AFTER ROUND 14 OF 23 · SPANISH GRAND PRIX [FINAL]  Season [2026 ▾]
                                                ← status line: aria-live="polite"

Drivers                                         ← h2
 1 ▍ Kimi Antonelli     Mercedes          292
 2 ▍ George Russell     Mercedes          211
 …  23 rows

Constructors                  Compare the teams →   ← h2 + link to /teams
 1 ▍ Mercedes                              503
 …  11 rows
```

- **Changing the season** updates state and calls `window.history.replaceState`: `/standings` for
  the latest season, `/standings?year=N` otherwise. It replaces rather than pushes, so the picker
  does not fill the history stack and there is no `popstate` to handle. Next 14.2 integrates native
  `replaceState` with its router, so no server round trip happens. The browser pass verifies that.
- **Drivers table**, columns Pos | Driver | Pts. The team is a second line inside the driver cell, so
  a 390px viewport needs no hidden column.
- **Constructors table**, columns Pos | Team | Pts.
- **Points** go through `Intl.NumberFormat` with at most one fraction digit (`292`, `12.5`),
  right-aligned, `tabular-nums`.
- **Markup** follows `attribution-table.tsx`: a real `<table>`, an `sr-only` `<caption>`,
  `th scope="col"`, and `border-t border-zinc-800` row rules.

### States

| State | Renders |
|---|---|
| Loading | Skeleton rows in both sections, `aria-busy`, and an `sr-only` "Loading standings…" |
| Error | "Could not load the championship standings." with a **Try again** button that calls `retry()`. Retrying is now honest, because pre-season no longer arrives as an error |
| Pre-season (`races_completed === 0`) | "The 2027 season hasn't started yet." and, when the prior season is in range, a **See the 2026 final standings** button that switches the year |
| Data | Stamp, both tables |

### Team colour: decorative only

Colour policy, chosen deliberately:

- **A team colour appears only as a 4px bar at the start of the row, in the true hex.** No team
  colour is ever applied to text. `readableOnDark`'s own documentation exempts bars and says they
  must keep the true colour. The team name beside the bar is what carries meaning, so WCAG 1.4.11
  does not apply to the bar, on the same reasoning as the livery wall.
- **Rows have no fill:** no zebra striping, no hover tint, no leader highlight. Every glyph in both
  tables sits on bare `zinc-950`, so judging the neutrals against `DARK_BG` is exact rather than a
  lower bound.
- **Filled controls are judged against their own fill:** the Final chip, the select and the two
  buttons are the only filled surfaces on the page, and each one's text is measured against that
  fill, not the page.
- **Why not coloured names:** 34 livery-coloured names would be a rainbow in a palette whose only
  rationed saturated colour is `f1-red`. It would also add 11 contrast obligations, on the shape
  CLAUDE.md calls the highest-risk, with no information gain.
- **Consequence:** no new `team-utils` backdrop variant is needed. If anyone later tints a row or
  colours a name, `inlineColouredText()` fails, which forces the variant question at that point.
- **An unmatched team** gets an empty bar slot of the same width, which keeps the columns aligned,
  and its raw OpenF1 name in the same neutral as matched names. The row always renders.
- **A matched team** shows `TEAMS.shortName`, consistent with `/teams`.

Focus rings come from `lib/focus.ts`. The select is a filled control on `base`, so it takes
`focusRingOffsetBase` (as `livery-select.tsx` does). Text links take a flush `focusRing`. Filled
buttons take `focusRingOffsetBase`.

Nothing uses `sm:text-base`, because in this theme that class is a colour. Use
`sm:text-[1rem]` if a breakpoint body size is needed.

### Nav placement and cross-links

`NAV_LINKS` becomes: Briefing, Car Anatomy, Tyres, **Standings**, Teams, Showcase, Credits.

The comment to add in `links.ts`: *Before Teams on purpose. The table answers who is winning and
Teams answers who they are, so a name in the table is one link from its profile. It also keeps
Teams beside Showcase, which share the liveries.*

The two cross-links:

- **`/teams` → `/standings`:** "Live standings →" beside `STANDINGS_AS_OF` in the comparison grid's
  header. The stale stamp now points at the live table.
- **`/standings` → `/teams`:** "Compare the teams →" in the constructors section header.

## Testing

### Backend (`pytest`, `ruff check .`)

| Test | Asserts |
|---|---|
| `test_a_race_with_no_results_is_not_counted_as_completed` | A past-dated Race session with no result rows is excluded from `races_completed` (the Imola 2023 and Bahrain 2026 shape) |
| `test_a_season_whose_past_sessions_have_no_results_has_not_started` | `reason == SEASON_NOT_STARTED` |
| `test_standings_serves_a_season_not_started_as_an_empty_table` (routes) | 200, the empty payload, and the tool's error text absent from the body |
| existing `test_the_whole_table_costs_three_requests` | Still passes unchanged: no new requests |

### Frontend (`pnpm typecheck && pnpm lint && pnpm test`)

Fixtures are **captured from the running route**, not written by hand:
`standings-2026.json` (Round 14, 23 drivers, 11 constructors), `standings-2024.json` (final, with
`Kick Sauber` and `RB`), and `races-2026.json` (23 rounds with the renumbering).
`tests/fixtures/README.md` records the capture date and the command used.

| File | Asserts |
|---|---|
| `standings.test.ts` | All 11 names in the 2026 fixture resolve to 11 **distinct** teams; predecessor names and substrings (`Bull`) resolve to `null`; the drift guard against `OPENF1_FIRST_YEAR`; `formatDriverName` cases; every stamp row above, including 2023's 22 of 22 → Final and round-0 testing excluded from `total`; `parseStandingsYear` rejecting out-of-range, non-integer and array input |
| `use-standings.test.ts` | Success; standings error sets `error`; calendar error leaves standings and no error; `retry` refetches; **a stale year resolving last is dropped** |
| `standings-tables.test.tsx` | 23 driver rows and 11 constructor rows (Cadillac on 0); **DOM order equals payload order**, including the three zero-point drivers; unmatched rows present with no bar colour; bar `backgroundColor` equals the exact `TEAMS` hex; **`inlineColouredText()` returns `[]`**; `restingTextNeutrals()` ≥ 4.5:1 on `DARK_BG`; caption and `th scope` present |
| `standings-page-client.test.tsx` | Season options from latest down to 2023; changing season fetches that year and calls `replaceState`; pre-season empty state and its prior-season button; error state and Try again; stamp and Final chip; the status line is `aria-live` |
| `standings-page.test.tsx` | `?year=2024` selects 2024; `?year=2019` and `?year=abc` fall back to latest |
| `api.test.ts` | `getStandings` returns the payload and throws when the response is not OK |
| `landing-nav.test.tsx` | `DESTINATIONS` gains Standings before Teams |
| `teams-comparison-grid.test.tsx` | The live-standings link and its href |

### Browser

jsdom computes no CSS, so these run in a real browser. The backend runs with a placeholder
`GOOGLE_API_KEY` (the standings route never calls Gemini) and `CORS_ORIGINS` set to the dev server's
port. The frontend runs on port 3131.

1. **2026:** 23 + 11 rows. The stamp reads `After Round 14 of 23 · Spanish Grand Prix`.
2. **2024:** the Final chip shows; `Kick Sauber` and `RB` render as plain text with empty bar
   slots.
3. **390px:** `document.documentElement.scrollWidth === 390`, with no horizontal overflow at any
   width.
4. **Contrast from computed values:** for every text node in both tables, compare its computed
   colour with the first opaque backdrop found walking up the tree. All ≥ 4.5:1.
5. **Pixel read:** hide the glyphs (`visibility: hidden`), screenshot, and sample behind a name.
   This confirms the backdrop really is `#09090b`, with no unexpected translucent layer.
6. **Focus rings:** the `focus-visible` ring rules exist in `document.styleSheets` for the select,
   the links and the buttons.
7. **Nav:** `/standings?year=2024` marks Standings as `aria-current`. A season change makes no RSC
   request.
8. **Pre-season** cannot be reached live (the route rejects next year with 422). Instead, stub
   `fetch` in the page to return the empty payload, change the season, and check the empty state.

## Out of scope

| Item | Why |
|---|---|
| Team logos in the table | Wide wordmarks at row height fall below legibility; `attribution-table.tsx` documents that fight at length. The bar carries identity |
| Driver headshots and a driver join on `driver_code` | `TEAMS` holds only the 2026 roster, and it is already stale (Lawson, Tsunoda). It would recover three diacritics at the cost of a second join |
| Gap to leader, per-row links, sorting | Not requested. The table renders exactly what the backend serves |
| Refreshing `TEAMS.points` or making `/teams` live | Declined in brainstorming |

## Documentation

CLAUDE.md gains one standings paragraph, and the `components/<feature>/` list gains `standings/`.
The paragraph covers:

- **Held vs dated:** a session counts only if it produced results. It carries the cancellation
  table above.
- **Why `round === races_completed` is a valid join:** FastF1 renumbers after a cancellation, and
  the join holds only because the numerator counts held races.
- **The team join:** exact `shortName` plus two aliases, with predecessor brands unmapped on
  purpose.
- **`STANDINGS_FIRST_YEAR`:** it mirrors `OPENF1_FIRST_YEAR` and has a guard test. The sentence
  saying `OPENF1_FIRST_YEAR` is "the only place that number lives" is amended to mention the mirror.
- **The colour rule:** team colour on this page is decorative only, and `inlineColouredText() ==
  []` guards it.
