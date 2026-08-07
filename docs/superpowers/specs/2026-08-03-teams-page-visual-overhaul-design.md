# /teams visual overhaul — design

**Date:** 2026-08-03
**Status:** Approved, ready for planning
**Scope:** `frontend/app/teams` and `frontend/components/teams/` — visual overhaul of all four
surfaces, plus the data and asset layers they need.

## Goal

Replace the rotating 3D car in the right rail with real team logos and driver headshots, and
raise the whole page to a "broadcast + cinematic depth" visual language: F1 TV's hard-edged data
graphics carrying heavy atmosphere (scroll-driven parallax, colour-blob backlighting, oversized
watermarks bleeding off-canvas).

## Decisions

Each row was chosen explicitly during brainstorming; the mockups behind them live in
`.superpowers/brainstorm/` (gitignored).

| Question | Decision |
|---|---|
| What replaces the rail's 3D car | Real team logos + driver headshots |
| How assets arrive | Fetched from public sources and committed locally |
| Surfaces in scope | All four — rail, hero, 11 team sections, nav rail + comparison grid |
| Fate of 3D on the page | Inspect modal only; rail loses its canvas |
| Art direction | Broadcast graphics + cinematic depth |
| Motion budget | No hard limit; optimise for the visual result |
| Data | Static, with richer curated fields |
| Season numbers | Real 2026 standings fetched from the web, frozen with a visible as-of label |
| Rail composition | **A1 — dossier stack**: logo, both drivers, stat block with a 2×2 meta grid |
| Hero | **Livery wall** — 11 full-height team-colour columns |
| Team sections | **Full-bleed duotone drivers** |
| Comparison | **Bar race** with sort tabs |

## Architecture

The page keeps its current shape: `TeamsPageClient` owns `activeTeamId`, each `TeamSection`
reports itself via `IntersectionObserver`, and the sticky right rail re-renders for whichever
team is active. Nothing about that data flow changes — only what the four surfaces render.

Two new leaf components absorb all image handling so no page section has to think about missing
files:

- **`team-logo.tsx`** — takes a `Team`, renders `next/image` from `team.logo`; renders a monogram
  tile in the team colour instead when the image fails to load.
- **`driver-portrait.tsx`** — takes a `Driver` + team colour, renders the headshot with a duotone
  team-colour wash and a bottom gradient into the background; renders the existing ghost-number
  card instead when the image fails to load.

`logo` and `headshot` are always populated with their conventional path, so the fallback is
driven purely by `next/image`'s `onError` — never by an empty field. That keeps the types simple
and means a file that has not been fetched yet behaves identically to one that 404s.

Both are pure presentational components: given a team or driver they render, and they depend on
nothing but the data types and `lib/team-utils.ts`. Consumers never branch on asset availability.

## Data layer

`frontend/data/teams-data.ts`:

```ts
export interface Driver {
  // …existing fields
  headshot: string;   // '/drivers/<driver-id>.png'
}

export interface Team {
  // …existing fields
  logo: string;       // '/logos/<team-id>.svg'
  points: number;     // 2026 championship points
  position: number;   // 2026 championship position
}

export const STANDINGS_AS_OF = 'After Round 11 · Hungary';
```

`STANDINGS_AS_OF` is rendered in the comparison section and the nav rail header. The page states
the date of its own numbers rather than implying they are live.

### 2026 standings

Fetched 2026-08-03 and cross-checked between two independent sources that agreed exactly:
[formula1.com](https://www.formula1.com/en/results/2026/team) and
[RacingNews365](https://racingnews365.com/f1/standings/2026/teams).

| Position | Team | Points |
|---|---|---|
| 1 | Mercedes | 379 |
| 2 | Ferrari | 307 |
| 3 | McLaren | 220 |
| 4 | Red Bull | 177 |
| 5 | Racing Bulls | 66 |
| 6 | Alpine | 61 |
| 7 | Haas | 21 |
| 8 | Audi | 12 |
| 9 | Williams | 11 |
| 10 | Aston Martin | 1 |
| 11 | Cadillac | 0 |

Refreshing these is a re-run of the fetch, not a code change.

### Helpers

`frontend/lib/team-utils.ts` gains two functions alongside the existing
`teamColorButtonStyle`:

- `seasonsSince(firstEntry: number): number` — `2026 - firstEntry`, for the rail's derived
  "Seasons" cell.
- `duotoneFor(team: Team)` — returns the wash colour and opacity for a portrait. Extends the
  `team.color === '#ffffff'` special-case that `teamColorButtonStyle` already establishes: Haas
  gets a neutral zinc tint plus a white keyline instead of a white wash, which would vanish
  against `zinc-950`.

### Asset fetch

`frontend/scripts/fetch-team-assets.mjs` downloads 11 logos to `frontend/public/logos/` and 22
headshots to `frontend/public/drivers/`, named by `team.id` and `driver.id`. It is a one-shot
developer script, not part of the build — the committed files are the source of truth. Assets
that cannot be sourced are simply absent, and the fallback renderers cover them.

## Surfaces

### Hero — livery wall

`teams-hero.tsx` becomes eleven full-height columns, one per team, each a vertical gradient of
its team colour with a solid colour bar and wordmark at the floor. Columns stagger up on load.
Hovering a column expands it and brings its logo forward; clicking scrolls to that team's
section, so the hero doubles as navigation. The `TextAnimate` title, badge, and `DotPattern`
survive, layered above the wall with a text shadow for legibility.

Below `lg` the eleven columns would be ~34px wide each, so the wall becomes a three-row logo
grid and the title sits above it.

### Team sections — full-bleed duotone drivers

`team-section.tsx` keeps its left info column and its `IntersectionObserver`. The right column's
two text `DriverCard`s become tall `driver-portrait` image cards: duotone team-colour wash,
gradient dissolve into the background, oversized driver number at the top corner, name and
nationality plated at the bottom. An oversized team monogram watermark bleeds off the left edge
at very low opacity. The existing alternating glow blob stays and becomes the portraits'
backlight.

### Right rail — dossier stack (A1)

`sticky-car-viewer.tsx` is renamed `sticky-team-panel.tsx` and loses its `F1HeroScene` import
entirely. Top to bottom: constructor counter, logo lockup over faint livery stripes, both driver
portraits side by side, then a broadcast stat block — championships as a number plus a filled
bar, then a 2×2 meta grid of Base, Power unit, First entry, and Seasons. The "Inspect in 3D" CTA
stays at the foot.

The rename is deliberate: the file no longer views a car, and leaving it named
`sticky-car-viewer` would misdescribe it for the next reader.

### Nav rail

`teams-nav-rail.tsx` gains a logo chip per row and a `P3 · 220 PTS` line under each team name.
The active row keeps its `layoutId="teams-nav-active"` shared-layout highlight and team-colour
left bar, and gains a colour gradient. A scroll-progress line runs down the rail's right edge.

The mobile pill variant at the top of the same file gets the logo chip and position but not
points — there is no room in a pill.

### Comparison — bar race

`teams-comparison-grid.tsx` becomes a ranked table: position numeral, logo chip, team name, a
track-and-fill bar scaled to the leader, and the points total. Bars sweep from zero and
`NumberTicker` counts the totals up when the section scrolls in. Three tabs re-sort by Points,
Titles, or First entry, and rows physically reorder via motion's `layout` prop. Clicking a row
scrolls to that team.

## 3D

`inspect-modal.tsx` is unchanged and becomes the only consumer of `F1HeroScene` on this route.
Because the rail no longer mounts a canvas, the whole `three` / `@react-three/fiber` bundle moves
from page load to behind the Inspect click — a performance improvement that falls out of the
visual change rather than being paid for by it.

## Motion, performance, accessibility

`next/image` enters the repo for the first time. Local `public/` paths need no
`images.remotePatterns`, so `next.config.js` is untouched. Portraits are lazy-loaded except the
first team's, which are eager to avoid a blank rail on arrival.

Eleven sections each mounting two duotone portraits is the one real performance risk. If
`mix-blend-mode: color` over eleven mounted sections drops frames, the fallback is a pre-composed
gradient overlay per team, which is cheap. This is a swap inside `driver-portrait.tsx` and
touches nothing else.

`useReducedMotion` is already threaded from `TeamsPageClient` into every section; every new
animation branches on it the same way the existing ones do. Column stagger, bar sweep, number
tickers, and row reordering all collapse to instant final states.

Focus and keyboard behaviour are preserved: hero columns and bar-race rows are buttons, not
click handlers on divs, and the nav rail keeps its `focus-visible` rings.

## Degradation

The page must look finished with zero image assets present. `team-logo` falls back to a monogram
tile, `driver-portrait` falls back to the ghost-number card that ships today. A broken image icon
never appears. This makes the asset fetch independent of the component work — the two can land in
either order.

## Testing

Vitest with jsdom, flat in `frontend/tests/`, matching the existing convention.

| Test | Asserts |
|---|---|
| Bar race sort | Switching tabs reorders rows; Points order matches the standings table |
| Bar race scale | Bar widths are proportional to the leader's points |
| Nav rail | Active team's row shows its position and points; inactive rows do not carry the active styling |
| Logo fallback | Absent `logo` renders the monogram, not an `img` |
| Portrait fallback | Absent `headshot` renders the ghost-number card |
| Hero wall | Eleven columns render; clicking one calls the scroll handler with that team id |

`tests/setup.ts` already stubs `IntersectionObserver`, which the sections and `BlurFade` need.
No new test infrastructure is required.

## Out of scope

- Any backend change. No standings endpoint is added; `/teams` stays a static page.
- The landing page, `/briefing`, and `/teardown`.
- `components/3d/` internals — `F1HeroScene` is consumed as-is.
- `components/ui/` — generated shadcn/Magic UI files are not hand-edited.
