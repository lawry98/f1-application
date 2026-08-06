# /teams navigation, comparison and column roles — design

**Date:** 2026-08-06
**Branch:** `feat/teams-navigation-and-perf`
**Baseline:** `main` @ `db6d9a1`, 199 tests passing across 16 files
**Source brief:** a 15-point request from the user, written against `main`'s `/teams`

## Why this spec exists at all

An earlier attempt at this work was written against a branch **57 commits behind `main`** and
reported that `/teams` had no driver portraits, no team logos, and no standings. All three had
already shipped in PR #13. That work is parked at `ref/teams-column-roles` and is **reference
only** — it is not cherry-picked, merged, or checked out by this spec.

Every claim below was re-verified against `main` before being written down. Where the brief
describes something that has since shipped, this spec says so and narrows the item rather than
rebuilding it.

## Goal

Make `/teams` coherent, navigable, accessible and fast **without** flattening it into a
dashboard. It is a portfolio showcase page; motion, depth and 3D are features, not costs. Every
change below either removes a genuine ambiguity, removes a genuine duplication, or adds a
capability the page lacks — never simplification for its own sake.

## Verified starting state

Do not rebuild any of this. It is on `main` today.

| Capability | Where |
|---|---|
| Driver portraits, duotone, 22 PNGs | `components/teams/driver-portrait.tsx`, `public/drivers/` |
| Team logos + monogram fallback | `team-logo.tsx`, `team-monogram-tile.tsx`, `public/logos/` |
| 2026 standings, frozen | `Team.position`, `Team.points`, `STANDINGS_AS_OF` in `data/teams-data.ts` |
| Contrast layer | `lib/team-utils.ts` — `contrastRatio`, `readableOnDark`, `duotoneFor`, `DARK_BG`, `MIN_CONTRAST` |
| Bar-race comparison with sort tabs | `teams-comparison-grid.tsx` |
| Right rail as a dossier, three.js behind a click | `sticky-team-panel.tsx`, `inspect-modal.tsx` |
| Livery-wall hero | `teams-hero.tsx` |
| Dialog semantics: focus trap, Escape, restore, body lock | `inspect-modal.tsx` |

## Decisions

Each row was settled explicitly during brainstorming. The mockups behind rows 1–4 live in
`.superpowers/brainstorm/` (gitignored).

| Question | Decision |
|---|---|
| Does the right rail get a canvas back (brief item 10)? | **No.** The dossier stays. Item 10 collapses to: add championship position + points, drop the duplicated portraits, make team swaps premium, keep Inspect prominent |
| Grid index vs championship position (item 2) | **Label, and delete the index where it competes.** Bare `01`–`11` is removed from the nav rail; the sequence survives only as spelled-out `Team 2 of 11` and `02 / 11` |
| Comparison direction (item 7) | **Head-to-head.** The bar race becomes the selector; a compare tray animates in beneath |
| Compare selection cap | **Two** constructors |
| Modal prev/next behaviour (item 12) | **Wraps** 11→1 |
| Dialog primitive (item 12) | Harden the hand-rolled dialog. **No Radix** — only `@radix-ui/react-slot` is installed and one modal does not justify the dependency |
| Hero ambition (item 8) | **Minimal.** CTA copy plus tightening the existing stagger. No new parallax system |
| `TEAMS` array order | **Unchanged.** Reordering by standings would reshuffle the whole page on every data refresh |
| Scope carve-up | **One spec, two sequenced plans**, with a review and browser-QA gate between |

## The numbering problem, stated precisely

`TEAMS` order is `1, 2, 3, 4, 7, 5, 8, 6, 9, 11, 10` by championship position. It is not
standings order, and it is not arbitrary either — the first four happen to agree.

The consequence is a visible contradiction, not merely an unexplained number: the nav rail
renders `05` on the same row as `P7 · 21 PTS` for Haas, and `sticky-team-panel.tsx` calls that
same team `Constructor 05 / 11`. Because rows one through four *do* agree, the rail reads as a
standings list that is simply wrong.

Four numbering systems are live on the page today:

| Numeral | Where | Means |
|---|---|---|
| `01`–`11` | `teams-nav-rail.tsx:91` | document order |
| `P{position}` | `teams-nav-rail.tsx:52` (mobile chip) | championship position |
| `P# · N PTS` | `teams-nav-rail.tsx:105` | championship position + points |
| `Constructor 01 / 11` | `sticky-team-panel.tsx:60` | document order, phrased like a standing |

After this work there are two, each labelled: a championship standing (`P2 · 307 PTS`, under a
rail header that names it) and a spelled-out sequence (`Team 2 of 11`, `02 / 11`). The
comparison grid's leading numeral is labelled as a **sort** rank, because it moves with the
active tab and is not either of the above.

## Architecture

Three new hooks, one extracted component, one new component. The point of the split is that each
unit owns exactly one question.

```
hooks/
  use-scroll-spy.ts        which section is active
  use-team-navigation.ts   what the URL says
  use-media-query.ts       is the viewport wide enough to mount the dossier

components/teams/
  teams-chip-strip.tsx     extracted from teams-nav-rail.tsx
  teams-compare-tray.tsx   new; pure function of two teams
```

### `use-scroll-spy`

Replaces eleven per-section observers ([`team-section.tsx:39-51`](../../../frontend/components/teams/team-section.tsx)) with one.

- **One `IntersectionObserver`** watching all eleven sections.
- **A narrow activation band** near the top of the viewport, not `isIntersecting`. Sections are
  taller than the viewport and adjacent, so `isIntersecting` fires for two of them at every
  boundary and they fight — that is the flicker in brief item 5.
- **Deterministic winner:** the section covering most of the band. Ties break by document order.
- **`claim(id)`** sets the active id immediately and suppresses the observer. Suppression lifts
  when the observer's own winner agrees with the claim, or after a timeout, whichever comes
  first. The timeout is not decoration: a short final section may never cover the band, so
  without it suppression could never lift.

Click feedback must not wait for an observer; the observer still owns the state afterwards.

### `use-team-navigation`

Layers the URL over `activeId`. Knows nothing about observers.

- Hash restore on mount, after layout so `scroll-margin-top` applies.
- `popstate` claims the id from `location.hash`; the browser restores scroll itself.
- Explicit clicks are **native anchor navigations** — one history entry each, which is the
  desired `pushState` behaviour, obtained for free.
- Scroll-driven changes use `replaceState`, so eleven teams do not become eleven history
  entries.

### Scrolling needs no JavaScript

The rail, chip strip, and comparison rows become real `<a href="#team-ferrari">`. Offsets are
`scroll-margin-top` on the sections — responsive, because the sticky chip strip exists only
below `lg`: nav height alone at `lg` and up, nav + chip strip below it. Smoothness is
`scroll-behavior: smooth` on `html`, gated off under `prefers-reduced-motion`.

No `preventDefault`, no `scrollIntoView`, no arithmetic in a handler. The click handler's only
job is `claim(id)`.

This also discharges brief item 14's "use semantic elements instead of recreating links or
buttons with `role` and `tabIndex`" — these are genuine links to genuine fragments, so they get
middle-click, open-in-new-tab, and copy-link behaviour that buttons never had.

### `use-media-query`

The dossier mounts on `matchMedia`, not `hidden xl:block`. It carries no canvas, so this is not
about WebGL contexts — it is that a hidden dossier still runs `AnimatePresence` and instantiates
`next/image` nodes for both drivers on every team change.

## Surfaces

### Column roles (items 1, 3, 10)

| Column | Owns | Appears |
|---|---|---|
| Left rail | navigation + standings | `lg` and up |
| Centre | editorial: identity, standing line, facts, **the driver portraits** | always |
| Right dossier | identity, championship, all-time stats, Inspect | **`xl`** and up |
| Chip strip | navigation | below `lg` |

`DriverPortrait` currently renders in both [`team-section.tsx:191`](../../../frontend/components/teams/team-section.tsx)
and [`sticky-team-panel.tsx:83`](../../../frontend/components/teams/sticky-team-panel.tsx), so at
`lg` and up the same two faces are on screen twice. The dossier loses them. It also stops
repeating the section's Base / Power unit / First entry / Championships block verbatim.

The dossier gains what it lacks entirely today: **championship position and points**.

**The `lg`–`xl` trap.** The per-section Inspect button is `lg:hidden` and the dossier is
`lg:block`. Moving the dossier to `xl` without touching the button leaves 1024–1279px with
neither — no panel and no route to the 3D inspector. The button's visibility flips to
`xl:hidden`. This is the single easiest mistake to make in this whole spec.

One wart the prior retrospective logged is fixed while we are here: the dossier's Inspect button
is currently the **last** tab stop on the page, roughly 38 stops in, because its `<aside>`
follows the entire centre column in DOM order despite sitting visually at the top right.

### Team sections (item 9)

The separator bug is real. [`team-section.tsx:63`](../../../frontend/components/teams/team-section.tsx)
paints a 1px hairline in the section's **own** colour at its **top** edge — directly beneath the
previous team's content, where it reads as that team's bottom border. It becomes a downward
gradient wash in the incoming team's colour with the full constructor name set into it:
unmistakably the start of something rather than the end of something.

Sections also gain their own `P2 · 307 PTS · AFTER ROUND 11` line, so the standing survives the
dossier's disappearance below `xl`, and the gradient space around the portraits is rebalanced.

### Comparison (item 7)

The bar race stays and becomes a two-slot selector. A compare tray animates in below, laying the
two constructors out field by field: championship, titles, power unit, base, first entry,
drivers. The leading value in a numeric row is highlighted. **Non-numeric rows get no
highlight** — nothing wins a power unit. Below `lg` the tray stacks rather than sitting
side by side.

**The sort tabs stay at three.** Points / Titles / Since is already the complete set of useful
orderings: `position` is derived from `points` and sorts identically, and "seasons" is
`firstEntry` inverted. Adding tabs would add controls without adding information. The brief's
demand that position, points, drivers, power unit, base and championships all be comparable is
answered by the tray, which is what makes this a comparison rather than a ranking.

### Hero (item 8)

CTA becomes "Explore 11 Constructors". The existing stagger is tightened. The badge already
reads `2026 Season · 11 Constructors`, so the season and purpose are already clear and need no
change. No new parallax system — item 8 asks to reduce empty space *only if it improves pacing*,
and the livery wall already carries the cinematic weight.

### Modal (item 12)

Gains wrapping previous/next controls and an explicit `02 / 11`. Existing dialog semantics —
`role="dialog"`, `aria-modal`, focus trap, Escape, focus restore, body scroll lock, visible
close — are preserved and hardened, not replaced.

## 3D and WebGL (item 11)

Brief item 11's headline concern — "do not render the sticky canvas and the fullscreen modal
canvas at the same time" — **is already satisfied on `main`**, because the rail has no canvas.
The prior overhaul removed it deliberately, which moved the entire `three` /
`@react-three/fiber` bundle off page load and behind the Inspect click. This spec preserves that
win rather than reversing it.

What remains is narrower: `frameloop="demand"` on the hero scene, idling on
`visibilitychange`, and not remounting the scene merely because the active team changed.
`dpr={[1, 2]}` is already set and stays.

## Colour and accessibility (items 13, 14)

`lib/team-utils.ts` is extended, never replaced. It gains `ring` and `on` variants beside the
existing `readableOnDark` and `duotoneFor`, and `teamColorButtonStyle`'s hand-rolled
`isWhite` branch ([`team-utils.ts:5`](../../../frontend/lib/team-utils.ts)) is deleted and routed
through the contrast layer — that branch predates the layer and only ever covered Haas's literal
`#ffffff`, not Racing Bulls' navy at 2.02:1.

Decorative use keeps the true brand colour. Glows, bars, the livery wall, the 3D livery and
keylines wider than a hairline are large or decorative, exempt from the AA text rule, and a
livery wall painted in lightened brand colours is no longer a livery wall.

`aria-current="location"` replaces `aria-current="true"`.

Reduced motion must disable continuous and disorienting movement, not merely zero a duration:
the hero's looping scroll cue, the chip strip's smooth centring, `scroll-behavior`, and any
camera easing all stop rather than snap.

## Degradation

Unchanged from `main` and preserved: the page must look finished with zero image assets present.
`logo` and `headshot` are always populated paths and the fallback is driven purely by
`next/image`'s `onError`.

## Testing

**The 199-test baseline will move, and a lower count is not automatically a regression.** Four
existing suites assert behaviour this spec deliberately changes:

| Suite | Why it changes |
|---|---|
| `team-section.test.tsx` | the per-section observer is gone |
| `teams-nav-rail.test.tsx` | `aria-current` value, the deleted index numeral, buttons become anchors |
| `sticky-team-panel.test.tsx` | portraits removed, championship block added |
| `teams-comparison-grid.test.tsx` | leading numeral relabelled as sort rank |

`tests/setup.ts` gains `scrollIntoView`, `scrollTo` and `matchMedia` stubs. jsdom implements
none of them, and the page will now call all three.

New suites cover `use-scroll-spy`, `use-team-navigation`, the extracted chip strip, the compare
tray, and modal navigation. `use-media-query` is a thin `matchMedia` wrapper and is covered
through the components that consume it rather than on its own.

**jsdom does no layout, so the scroll spy's geometry is not directly testable.** The winner
selection is therefore extracted as a pure function over entry rectangles and tested
directly, and the claim/suppression state machine is tested against a fake observer. Testing
the hook end-to-end in jsdom would assert nothing real.

## CLAUDE.md

Notes land with the code that makes them true, not in advance:

| Note | Lands with |
|---|---|
| `AnimatePresence mode="wait"` is untestable in jsdom | **immediately** — true of `main` today, independent of both plans |
| One scroll spy, and why per-section observers fight | `use-scroll-spy.ts` |
| `setup.ts` also stubs `scrollIntoView` / `scrollTo` / `matchMedia` | those stubs |
| Three columns appear at three different widths; the dossier is `matchMedia`-mounted | the breakpoint change |
| Team colours go through `team-utils` before carrying text | the `ring` / `on` variants |

The 35 lines on `ref/teams-column-roles` that describe unshipped work are **not** ported.

## Plans

One spec, two sequenced plans, with a review and browser-QA gate between them.

| Plan | Items | Character |
|---|---|---|
| **A — structure and navigation** | 1, 2, 3, 4, 5, 6, 10, 13, 14 | mechanical, heavily testable in jsdom |
| **B — comparison, hero, sections, 3D** | 7, 8, 9, 11, 12 | design-heavy, needs browser judgement |

Item 15 is a constraint on both, not a task: no backend calls, the server/client boundary
stands, no new global state or dependencies, no layout shift, no observer churn, no needless
remounts.

Plan A leaves the page working and navigable before any of the ambitious visual work starts.

## Out of scope

- Any backend change. `/teams` stays static with no runtime data fetching.
- Other routes: the landing page, `/briefing`, `/teardown`.
- `components/ui/` — generated shadcn / Magic UI files are never hand-edited.
- Refreshing the standings. `Team.position` and `Team.points` stay frozen at `STANDINGS_AS_OF`.
  OpenF1 exposes `championship_teams` if the user later wants them updated; that is a data edit.
- Team-name staleness in `teams-data.ts` (`MoneyGram Haas F1 Team` against `haas.svg`'s
  "TGR Haas"; likewise Audi and Williams). Logged as out of scope by the prior overhaul and
  still out of scope here.
- Adding Radix for the modal.
