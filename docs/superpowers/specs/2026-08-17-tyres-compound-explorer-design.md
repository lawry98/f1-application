# /tyres compound explorer — design

**Date:** 2026-08-17
**Status:** Approved (user delegated design authority; only genuine product forks escalate)
**Branch:** `feat/tyres-compound-explorer`
**Worktree:** `.claude/worktrees/tyres-compound-explorer`
**Baseline:** `434ebd9`, 427 tests passing across 29 files, typecheck and lint clean
**Scope:** one new route `frontend/app/tyres/`, one new `frontend/components/tyres/` directory,
one new `frontend/data/tyres-data.ts`, one new `frontend/lib/tyre-utils.ts`, one exported symbol
added to `frontend/lib/team-utils.ts`, the shared nav link list, and one prose block plus one
data-source row on `/credits`

## Why this spec exists

The app teaches an F1 race weekend from five angles — the agent briefing, the car's anatomy, the
constructor grid, the 3D showcase, and the credits behind them — and has nothing at all on the
one variable that decides more races than any of them. Tyres are where grip, durability,
temperature and strategy meet, and the topic is genuinely hard to hold in your head because the
naming is two-layered: a season has a numbered dry range, and each Grand Prix relabels three of
those numbers as Hard, Medium and Soft. Most explanations blur those two layers together and
leave the reader believing C3 *is* the medium. It is not; it is the medium at some races.

So the page has one educational job — separate the numbered range from the race-weekend label —
and one experiential job: be the most memorable interaction on the site.

## Goal

A `/tyres` route whose centrepiece is a compound explorer where selecting a compound plays as
**one composed scene change**: the tyre, its title, its copy, its indicators, the accent lighting
and the oversized background type all move together, forward to the left and backward to the
right. Around it, five supporting sections that make the content useful rather than decorative.

## Verified starting state

Do not rebuild any of this. It is on `main` today.

| Fact | Where |
|---|---|
| Nav is a `fixed h-14` header driven by one array; active state is `pathname === href` | [`components/landing/links.ts`](../../../frontend/components/landing/links.ts), [`components/landing/landing-nav.tsx`](../../../frontend/components/landing/landing-nav.tsx) |
| Nav is rendered **per page**, not in the root layout | `app/page.tsx`, `app/briefing/page.tsx`, `app/teams/page.tsx` |
| The same array also drives the footer link column | [`components/landing/landing-footer.tsx`](../../../frontend/components/landing/landing-footer.tsx) |
| Section rhythm: `border-t border-zinc-800 bg-zinc-950 py-24` + `container mx-auto max-w-7xl px-4` | [`components/landing/landing-features.tsx`](../../../frontend/components/landing/landing-features.tsx) |
| Eyebrow / h2 / body scale: `text-sm font-semibold uppercase tracking-widest text-f1-red` / `text-3xl font-bold tracking-tight text-white lg:text-4xl` / `text-lg text-zinc-400` | same file |
| Motion is `motion/react` (v12), springs authored `{ type: 'spring', duration, bounce: 0 }` | [`components/teams/teams-hero.tsx`](../../../frontend/components/teams/teams-hero.tsx) |
| `useReducedMotion()` from `motion/react` is the established gate | same file |
| Contrast toolkit: `contrastRatio`, `blendOver`, `readableOnDark`, `ringOnDark`, `onColor`, `needsDamping`, `DARK_BG`, `MIN_CONTRAST` | [`lib/team-utils.ts`](../../../frontend/lib/team-utils.ts) |
| A decorative wash's peak opacity is treated as a **contrast constraint** (`GLOW_PEAK_OPACITY`) | same file |
| A way to ask a rendered tree for its resting neutral text colours | [`tests/zinc.ts`](../../../frontend/tests/zinc.ts) — `restingTextNeutrals` |
| UI kit present: `BlurFade`, `TextAnimate`, `Badge`, `Button`, `Card`, `DotPattern`, `NumberTicker`, `Skeleton`, `Input` | `components/ui/` |
| UI kit **absent**: Tabs, Accordion, Dialog, Tooltip, Progress, Separator | `components/ui/` |
| `/credits` has a "Data sources" section and is `force-static` | [`app/credits/page.tsx`](../../../frontend/app/credits/page.tsx) |
| The credits **tables** are keyed to files in `public/drivers` and `public/logos` and reject anything that is not a Commons `https://` link | [`lib/credits.ts`](../../../frontend/lib/credits.ts) |
| The established reduced-motion convention: the page client calls `useReducedMotion()` **once** and threads `reducedMotion: boolean` down as a required prop; children never call the hook | `teams-page-client.tsx` and its five children |
| `text-zinc-500` is 4.12:1 on `zinc-950` and is treated as **below AA for resting text**; `restingTextNeutrals` fails a component that uses it | [`tests/zinc.ts`](../../../frontend/tests/zinc.ts) |
| `tsconfig` has `noUncheckedIndexedAccess: true` — indexed access is `T \| undefined` | `tsconfig.json` |
| `TextAnimate`'s `children` must be a plain string | `components/ui/text-animate.tsx` |
| Prettier sorts Tailwind classes (`prettier-plugin-tailwindcss`) — do not hand-order them | `.prettierrc` |
| `useScrollSpy` hard-codes `document.getElementById(\`team-${id}\`)` | [`hooks/use-scroll-spy.ts`](../../../frontend/hooks/use-scroll-spy.ts) |

### One pre-existing defect this work must not inherit

At a 390px viewport the nav's link list is **393px wide starting at x=82**, so it runs 86px past
the viewport: `Showcase` is clipped mid-word and `Credits` is entirely unreachable. Measured in a
real browser on `/teams`, not inferred. Adding a sixth link makes a broken thing worse, so the
nav's small-viewport overflow is in scope — as a contained fix, not a redesign.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Nav label | **"Tyres"** — one word, matches the brief's spelling and the rest of the labels' register |
| 2 | Nav position | Third, after **Car Anatomy** — it is the other "how the machine works" experience, and Briefing stays first |
| 3 | Nav overflow fix | The link row becomes horizontally scrollable below `md` with the scrollbar hidden and momentum snapping; the brand wordmark collapses to a short form below `sm`. Desktop markup is unchanged |
| 4 | Where tyre facts live | **`data/tyres-data.ts`** — typed, one exported const per concept, mirroring `data/teams-data.ts`. No fact is authored inside a component |
| 5 | Tyre imagery | **Original inline SVG**, drawn in-repo, recoloured from the compound's hex. No third-party asset, no `public/` binary, no licence obligation, and it scales to any viewport for free |
| 6 | Numbers vs words | **Qualitative throughout.** Grip/durability/warm-up render as a 5-step *ordinal* scale that is labelled as a relative ranking, never as a measurement. Only figures published by Pirelli/FIA appear as numbers, each with a visible source |
| 7 | Content freshness | A visible "current as of" line naming the date and the season, plus a sources list, both fed from one exported constant so they cannot drift |
| 8 | Explorer ARIA contract | **Tabs.** `role="tablist"` / `role="tab"` / `role="tabpanel"` with roving tabindex and automatic activation — the standard pattern for "pick one of N, show its panel", and far more legible to a screen reader than a carousel |
| 9 | `AnimatePresence` mode | **Not `wait`.** CLAUDE.md records that `mode="wait"` makes content untestable under jsdom, and the mastering-animate-presence skill records that it nearly doubles perceived duration. Default sync mode, exiting panel positioned absolutely |
| 10 | How the exiting panel stays out of the way | `useIsPresent()` **in the child**, driving `aria-hidden`, `pointer-events-none` and `tabIndex={-1}`. Correct for screen readers *and* it makes `getByRole` deterministic, because RTL's role queries skip `aria-hidden` subtrees |
| 11 | Swipe | `motion`'s own `drag="x"` with velocity projection. No new dependency |
| 12 | Reduced motion | Tiered, not switched off: all x-translation and parallax removed (Tier 1), the scene swap becomes a ≤180ms opacity crossfade (Tier 2), colour and focus transitions survive (Tier 3) |
| 13 | Accordion / tabs dependency | **None.** FAQ uses native `<details>`/`<summary>`; the tablist is ~40 lines of our own code. Adding Radix for two widgets fails the brief's "no heavy dependency" rule |
| 14 | Compound colour discipline | A new `lib/tyre-utils.ts` built on `team-utils`' existing lift-until-readable mechanism, with a **per-backdrop** variant for every surface compound colour carries text on |
| 15 | Attribution | The artwork is original, so nothing is owed. `/credits` gains one prose line saying so and Pirelli / Formula 1 / FIA join its **Data sources** list. Deliberately **not** a new credits table: `lib/credits.ts`'s parsers are keyed to two hard-coded paths and demand a Commons `https://` link per row, so a table for files that do not exist and have no external source would be a lie dressed as rigour |
| 16 | Reduced-motion plumbing | Follow the teams convention exactly — `TyresPageClient` calls `useReducedMotion()` once, every child takes `reducedMotion: boolean` as a required prop. It also makes the reduced-motion tests trivial, since jsdom's `matchMedia` stub always reports no match |
| 17 | Eyebrow label colour | A **lifted** `f1-red`, not the raw token. `#dc2626` is 4.12:1 on `zinc-950`, which the repo's own `/credits` comment already flags as "`text-2xl` and up only" — yet eyebrows across the site use it at `text-sm`. Rather than copy an existing AA failure into a new page, `/tyres` uses `readableOnDark('#dc2626')`, which is visually indistinguishable at 14px and clears the bar |

## Architecture

```
app/tyres/page.tsx                 server component; metadata; composes the six sections
components/tyres/
  tyres-hero.tsx                   section 1
  compound-explorer.tsx            section 2 — the centrepiece (client)
  compound-scene.tsx                 the one keyed panel that enters/exits
  compound-tablist.tsx               the selection control
  tyre-visual.tsx                    the original SVG tyre
  indicator-bar.tsx                  one ordinal 5-step readout
  allocation-explainer.tsx         section 3
  strategy-scenarios.tsx           section 4
  tyre-lifecycle.tsx               section 5
  tyre-faq.tsx                     section 6a — native <details>
  related-experiences.tsx          section 6b — links to Car Anatomy / Briefing / Teams / Showcase
  compound-sources.tsx             the visible citation list
data/tyres-data.ts                 every fact, typed
lib/tyre-utils.ts                  compound colour → readable colour, per backdrop
hooks/use-compound-carousel.ts     index + direction state machine, keyboard, wrap
```

### The state machine, isolated from the pixels

`useCompoundCarousel` owns exactly one thing: which compound is selected and **which way we last
moved**. It exposes `{ index, direction, select(i), next(), previous() }` where `direction` is
`1` after a forward move and `-1` after a backward one. Every animated surface reads that single
number, which is what makes the scene move as one piece instead of six independently-authored
animations that happen to fire together.

`select(i)` derives direction from `i > index`, so clicking a tab three to the right animates the
same way as pressing Next three times. Wrapping is on: Next from the last compound goes to the
first with `direction = 1`, because the alternative — a dead control at each end — is worse for a
five-item set.

This lives in a hook, not the component, because direction-from-index is the one piece of logic
here that is worth testing without a DOM.

### The composed transition

One `AnimatePresence` wraps one keyed `CompoundScene`. Direction arrives through `custom`, and
every moving layer derives its distance from it:

| Layer | Forward exit | Forward enter | Why the distance differs |
|---|---|---|---|
| Oversized background type | `x: +6%` | `x: -6%` | Slowest layer — it is the far parallax plane |
| Accent glow | opacity only | opacity only | It has no edge to read a position from; moving it just smears |
| Tyre | `x: -18%`, `opacity: 0`, `scale: 0.94` | `x: +18%` | The subject; travels furthest |
| Copy column | `x: -10%`, `opacity: 0` | `x: +10%` | Slightly behind the tyre, which reads as depth |
| Indicators | inherit the copy column | staggered `0.04s` | The only stagger on the page |

Spring, not duration-based easing, and `bounce: 0` — the apple-design skill's critically-damped
default, and already this repo's house style. Response ~`0.42s`. Bounce is reserved for the
drag-release path, where the gesture actually carried momentum.

The exit and enter distances are **mirrored**, which the AnimatePresence skill's
`exit-matches-initial` rule asks for and which is also the spatial-consistency rule: a compound
that left to the left comes back from the left when you go back.

### Colour: what the compound owns, and where it must yield

Compound hexes are brand-adjacent constants (soft red, medium yellow, hard near-white,
intermediate green, wet blue). Two of the five are hostile to a dark UI in opposite ways: hard is
near-white, so it is a bad *surface*; medium's yellow is bright but the rest fail 4.5:1 as text
outright.

`lib/tyre-utils.ts` therefore repeats the pattern `team-utils` already proved, with one function
per **backdrop**, not one function overall:

- `compoundTextOnPage` — bare `zinc-950`
- `compoundTextOnGlow` — inside the accent glow, judged at the glow's peak alpha
- `compoundTextOnCard` — on `bg-zinc-900/60`
- `compoundSurface` / `compoundOnSurface` — a fill and the black-or-white that sits on it
- `compoundRing` — the 3:1 non-text bar, for focus rings

and a `TYRE_GLOW_PEAK` constant that is simultaneously the glow's opacity and the alpha the
contrast maths judges it at — the same arrangement, and the same reasoning, as `GLOW_PEAK_OPACITY`.

This needs `liftUntilContrast` from `team-utils`, which is currently module-private. It gets an
`export` keyword and nothing else; its own doc comment already describes it as the shared
mechanism behind every lift helper, so exporting it makes the file honest rather than changing it.

Decorative use — the glow, the tyre's sidewall band, the oversized type, the tablist's active
underline — keeps the **true** hex. Only glyphs go through a lift.

### The page's six sections

1. **Hero.** The trade-off stated in one sentence, the "current as of" badge, and a jump link to
   the explorer. Deliberately short: the brief says do not delay access to the explorer.
2. **Compound explorer.** Above, in full.
3. **Weekend allocation.** The numbered range as a strip, then a worked example of one real Grand
   Prix showing which three numbers were nominated and which label each carried — captioned so it
   reads as *an* example, never *the* mapping. A second, contrasting example is what actually
   proves the point, so the section carries two.
4. **Strategy scenarios.** Cards, each a situation with a "what it favours / what it costs"
   reveal. No card claims a single correct answer; each names the trade.
5. **Lifecycle.** Preparation → formation lap → stint → pit stop → post-use, as a stepped
   horizontal rail that stacks vertically on narrow viewports. Sustainability statements only
   where a Pirelli or FIA publication supports them, cited inline.
6. **FAQ + related.** Native `<details>` for graining, blistering, slick construction, warm-up,
   degradation and why allocations differ, then a link row into Car Anatomy, Briefing, Teams and
   Showcase.

## Responsive plan

| Breakpoint | Explorer layout | Notes |
|---|---|---|
| `< 640` | Tyre above copy, single column, tyre capped at `min(62vw, 260px)` | Tablist becomes a scrollable chip row; prev/next stay visible |
| `640–1023` | Same stack, larger tyre | Oversized background type drops to a smaller weight |
| `1024–1279` | Two columns: tyre left, copy right | Full background type |
| `≥ 1280` | Two columns with wider gutters, tyre `clamp`ed | Indicators go two-up |

Every horizontal element that can exceed the viewport — the tablist, the numbered-range strip,
the lifecycle rail — is a scroll container with `overflow-x-auto`, not a row that overflows the
page. The brief's "no horizontal overflow" is asserted in a browser at 390/768/1024/1440, not
assumed.

## Testing strategy

Vitest + jsdom, in `frontend/tests/`, flat, matching the existing convention.

| File | Proves |
|---|---|
| `tyres-data.test.ts` | Every compound has the required fields; the ordinal scales stay in range; the numbered range and the race labels are **separate** shapes, so no code path can treat a C-number as a permanent label; every sourced claim carries a URL |
| `tyre-utils.test.ts` | Every compound's text colour clears 4.5:1 **on the backdrop it actually has** — page, glow and card each asserted separately, because that is the mistake this repo has made twice |
| `use-compound-carousel.test.ts` | Direction is `+1` forward and `−1` backward, including across the wrap, and `select()` agrees with the equivalent number of `next()` calls |
| `compound-explorer.test.tsx` | Tablist ARIA contract; the selected tab controls the visible panel; arrow/Home/End keyboard; the exiting panel is `aria-hidden`; a live region announces the change; under reduced motion the variants carry **no x** |
| `compound-tablist.test.tsx` | Roving tabindex, accessible names, focus-visible ring present |
| `tyre-visual.test.tsx` | Renders one accessible label per compound and takes its colour from the data, not a literal |
| `landing-nav.test.tsx` | Six links in order, `/tyres` present, active highlighting on the current route only — the first test this component has ever had |
| `tyres-page.test.tsx` | The route renders; all six sections present by landmark/heading; no fact string is duplicated between data and markup |

Reduced motion is asserted on the **variant objects**, not on rendered pixels — jsdom lays nothing
out, so an assertion about movement can only honestly be made against the numbers handed to
motion. The rendered-pixel half of that claim is discharged in a real browser instead.

## Verification

`prettier --write`, `next lint`, `tsc --noEmit`, `vitest run`, `next build`, then agent-browser at
390 / 768 / 1024 / 1440: screenshot each, drive the explorer forward and backward, tab through the
controls, re-run with `set media reduced-motion`, and run `a11y` (axe) on the finished page. Console
must be clean.

## What research changed after this spec was written

Three things were settled by the Pirelli/FIA sweep rather than by design, and one of them
invalidated an assumption in the brief.

- **The 2026 dry range is C1–C5, not C1–C6.** Pirelli dropped the C6 after 2025 because the gap
  between it and the C5 was too small to be worth a step. Anything built for six compounds
  describes last season. `tyres-page.test.tsx` asserts the range has five entries and that no
  `C6` appears in the allocation section.
- **The explorer shows the five *colour-owning* tyres, not the numbered range.** Hard, Medium and
  Soft are roles; C1–C5 are products. Only the roles have a colour, so only the roles can carry
  the "strong colour ownership" the brief asks for — and a coloured `C3` chip would assert exactly
  the mapping the page exists to deny. The numbered range therefore lives in §3, rendered in
  graphite.
- **The worked example writes itself.** C3 carried *all three* labels inside the 2026 season —
  Soft at Suzuka, Medium at Barcelona, Hard at Monaco, each separately sourced. Three dated rows
  following one compound is a far better proof than three unrelated allocations.

Deliberately **not** published, because no primary source supports them: per-compound operating
temperature windows (the only Pirelli figures found describe the superseded ultrasoft range), any
recycled-content percentage for an F1 tyre, ISCC PLUS certification of one, and the front/rear
attribution of per-event camber limits. The water-displacement figures are published but date
from 2020 and 2022, and the page says so.

## Defects found by browser verification, not by tests

Every one of these passed the full Vitest suite. Recording them because the shape repeats.

| Defect | Why no test caught it |
|---|---|
| Accent glow and background wordmark both invisible | `-z-10` paints behind the section's own `bg-zinc-950`; needs `isolate`. jsdom has no paint order |
| Wordmark rendering at full strength | The variant sets `opacity` inline and overwrote the `opacity-[…]` class. Only visible when something actually animates |
| Wordmark hidden behind the tyre after the first fix | Clip box was the tyre's width. A layout relationship, and jsdom has no layout |
| Whole page scrolled sideways at 390px | A 520px glow centred on a 390px viewport. Needs a real viewport to observe |
| Hydration mismatch under reduced motion | `useReducedMotion()` is `false` on the server, so the reduced branch rendered a structurally different tree. Only reproducible with real SSR |
| Active tab label judged against the wrong backdrop | `bg-zinc-800/80` behind it, not `zinc-950`. The third instance of this exact mistake in this repo — hence a fourth backdrop helper and a test per surface |
| Hero compound band invisible | `top-0` under a `fixed h-14` nav |
| Nav's current-page link starting off screen | Only observable once the row actually scrolls |
| Broken list semantics in the lifecycle and allocation sections | `BlurFade` renders a `div` between `<ol>` and `<li>`. Caught by axe, which no unit test runs |

## Out of scope

- Any change to the briefing pipeline, the backend, or the other five pages beyond the shared nav
  and the two `/credits` additions.
- Live tyre data. This page is static, versioned content with a visible freshness date; wiring it
  to a feed is a different piece of work with a different failure mode.
- 3D. The existing 3D bundle is deliberately kept off page-load paths, and a spinning tyre would
  buy nothing an SVG does not already deliver.
