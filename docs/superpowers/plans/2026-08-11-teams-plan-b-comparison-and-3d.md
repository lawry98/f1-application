# /teams Plan B — comparison, hero, sections, 3D

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the bar race into a genuine head-to-head comparison, tighten the hero, rebalance the
portrait gradients around the caption scrim that landed on 2026-08-11, stop the 3D scene rendering
when nobody is looking at it, and give the inspector wrapping prev/next with an explicit index.

**Architecture:** One new pure component (`teams-compare-tray.tsx`) that is a function of exactly two
teams, driven by two-slot selection state held locally in `teams-comparison-grid.tsx` — no new global
state and no new dependency. The colour layer is **extended** with one more backdrop/colour pair,
because the tray is a new surface and every team-coloured glyph on a non-`zinc-950` surface has needed
its own pair. The modal owns its own index rather than driving the page's `claim`, so paging inside a
dialog never fights the scroll spy. The 3D scene's frame loop becomes state instead of a constant.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind, `motion` v12,
`@react-three/fiber` + `three`, Vitest 4 + jsdom + Testing Library 16.

**Spec:** [`docs/superpowers/specs/2026-08-06-teams-navigation-and-comparison-design.md`](../specs/2026-08-06-teams-navigation-and-comparison-design.md)

**Prior plan:** [`docs/superpowers/plans/2026-08-06-teams-plan-a-structure-and-navigation.md`](2026-08-06-teams-plan-a-structure-and-navigation.md) — Plan A, already shipped.

**Spec items covered:** 7, 8, 11, 12, and the one remaining clause of 9. Items 1–6, 10, 13, 14 shipped
in Plan A and must not be revisited. Item 15 is a constraint, below.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Where you are working.** Worktree `.claude/worktrees/teams-column-roles`, branch
**`feat/teams-plan-b-comparison-and-3d`**, based on `feat/teams-navigation-and-perf`. Run
`git branch --show-current` before your first edit. The *parent* checkout
`/Users/lawrencecrasto/Documents/personal/f1` is on a different, stale branch with unrelated
uncommitted work — never run git commands against it. All paths below are relative to the worktree
root.

**Commands.** All from `frontend/`. `node`, `pnpm` and `npx` are **not on PATH**:

```bash
mise exec -- pnpm test        # vitest run
mise exec -- pnpm typecheck   # tsc --noEmit
mise exec -- pnpm lint        # ESLint
```

**Never run `pnpm build`.** A dev server for this worktree is already running on :3000 and they share
`.next`. Confirm it is up rather than starting another:

```bash
curl -so /dev/null -w '%{http_code}\n' http://localhost:3000/teams   # expect 200
```

**Baseline, measured 2026-08-11 on this branch's first commit:**

| Check | Value |
|---|---|
| `pnpm test` | **324 passing, 24 files** |
| `pnpm typecheck` / `pnpm lint` | clean |
| axe `color-contrast` violation nodes on `/teams` | **0** at 1440x900, 1152x800, 390x844, and with the inspect modal open |
| 1152px must keep | dossier unmounted, all 11 Inspect buttons visible, rail at 199px |
| Reduced motion | kills `scroll-behavior` and the hero's looping chevron |

Each task states its own expected test delta. The count only goes **up** in this plan — no task here
removes behaviour an existing suite asserts.

**Git — and this worktree is genuinely shared.** Another agent is building the `/credits` page **in
this same worktree, on this same branch**, and landed `a0c9aae` and `fae79ad` on it while this plan
was being written. Consequences you must work around rather than fix:

- **Stage explicit paths — never `git add -A` or `git add .`.** Untracked files under
  `frontend/lib/` and `frontend/tests/` that this plan does not name are theirs.
- **`CLAUDE.md` is being edited by both of us.** Tasks 1 and 6 append to it. Re-read the section you
  are about to edit immediately before editing it; do not apply a stale diff, and never revert a
  paragraph you did not write.
- **Do not rebase, reset, amend or reorder this branch's history.** Their commits are interleaved
  with the ones this plan produces.
- **Do not touch `/credits`, `frontend/lib/credits.ts`, `frontend/app/credits/`, or the credits
  spec and plan documents.** They are a separate approved design.
- `pnpm test` may show a count higher than this plan predicts, from their suites. Judge your delta
  by the tests *you* added, and never "fix" a failure in a file this plan does not list — report it.

`gh pr create` fails here (gh authenticates as `crastoL`, the repo is `lawry98`); `git push` works and
PRs are opened by hand.

**Repo conventions (from CLAUDE.md):**
- File names **kebab-case, no exceptions**. Component names stay PascalCase.
- **Named exports.** The only default exports outside `app/` are the two `components/3d/` scenes.
- `Team` and `Driver` import from `@/data/teams-data`, **not** `@/types`.
- Hooks live in `hooks/`, `use-` prefix.
- Tests are **flat** in `frontend/tests/`, never mirroring the source tree.
- `components/ui/` is generated — **never hand-edit**.
- No `any`.

**Motion rules:**
- Animate **only `transform` and `opacity`**. Never `width`, `height`, `top`, `left`, `margin`.
- **Never `transition: all`** — always name exact properties.
- Springs are `{ type: 'spring', duration: 0.3, bounce: 0 }`. `bounce` is always `0`.
- Press feedback is exactly `scale(0.96)`.
- Reduced motion must **stop** continuous or disorienting movement, not merely zero a duration.

**Colour rules — the trap this plan walks straight into:**
- `readableOnDark` is correct **only on bare `zinc-950`** and has **zero headroom by construction**:
  it stops at the first lightness step clearing 4.5:1, so *any* translucent layer between the glyphs
  and the page puts it under. Five call sites already needed their own pair —
  `seamLabelColor`, `railStandingColor`, `sectionStandingColor`, `portraitCaptionColor`, `onColor`.
- **Any new team-coloured text on a card, wash or tint needs its own `<thing>Backdrop()` /
  `<thing>Color()` pair, built from `blendOver` + `liftUntilContrast` in `frontend/lib/team-utils.ts`.**
  That module is **extended, never replaced**.
- Decorative use — bars, glows, the livery wall, the 3D livery, keylines wider than a hairline —
  keeps the true brand hex.
- **A red contrast test may be the test's fault.** It happened three times on this branch, each time
  an assertion measuring the right *colour* against the wrong *background*. Work out which assertion
  encodes the wrong premise before changing either side, and say so in the commit message.

**Limits the spec sets, which no task may exceed:**
- The sort tabs **stay at three**. Points / Titles / Since is the complete set of useful orderings.
- Non-numeric rows in the compare tray get **no highlight** — nothing wins a power unit.
- **No new parallax** in the hero.
- **No new dependencies.** Radix for the modal is explicitly ruled out.
- **Do not reintroduce a canvas in the right rail.** Its absence moved the whole `three` /
  `@react-three/fiber` bundle off page load and behind the Inspect click. That win is preserved.

**Do not rewrite `hooks/use-scroll-spy.ts`.** `pickActive`, the claim/lease machine and
`CLAIM_TIMEOUT_MS` have been browser-verified twice, once across 31 sampled scroll positions. Read the
hook's doc comment before touching anything near it. If the spy misbehaves, use
`superpowers:systematic-debugging`.

**Item 15, as a constraint on every task:** no backend calls, no new runtime data fetching, the
existing server/client boundary stands, no new global state, no new dependencies, no layout shift, no
observer churn, no needless remounts.

**Do not touch:** `backend/`, `components/ui/`, `next.config.js`, `data/teams-data.ts`,
`hooks/use-scroll-spy.ts`, `hooks/use-team-navigation.ts`, `components/teams/teams-nav-rail.tsx`,
`components/teams/teams-chip-strip.tsx`, `components/teams/sticky-team-panel.tsx`, and the `/credits`
page work (a separate approved design at `/tmp/f1-credits-page-handoff.md`).

**jsdom lays nothing out, and a green `pnpm test` is not evidence.** This branch shipped a headline
scroll-spy bug past 290 tests and four review passes because nobody ran a browser. Task 8 is the
browser gate and is **not optional**.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/lib/team-utils.ts` | **Modify.** Adds `TRAY_FILL`, `TRAY_ALPHA`, `trayValueBackdrop()`, `trayValueColor()`, `PORTRAIT_DISSOLVE_ALPHA`, `portraitDissolve()` |
| `frontend/components/teams/teams-compare-tray.tsx` | **Create.** Pure function of two teams: six fields, leader per numeric field |
| `frontend/components/teams/teams-comparison-grid.tsx` | **Modify.** Row gains a compare toggle beside its anchor; owns two-slot selection; renders the tray |
| `frontend/components/teams/teams-hero.tsx` | **Modify.** CTA copy derived from `TEAMS.length`; entrance stagger tightened |
| `frontend/components/teams/driver-portrait.tsx` | **Modify.** The dissolve gradient stops double-darkening under the caption scrim |
| `frontend/hooks/use-document-visible.ts` | **Create.** `visibilitychange` as a boolean |
| `frontend/components/3d/f1-hero-scene.tsx` | **Modify.** `frameloop` becomes state; explicit invalidation under `demand` |
| `frontend/components/3d/README.md` | **Modify.** Stale consumer list; the frame-loop policy |
| `frontend/components/teams/inspect-modal.tsx` | **Modify.** Wrapping prev/next, `02 / 11`, live region; dialog semantics hardened not replaced |
| `frontend/components/teams/teams-page-client.tsx` | **Modify.** New modal props only |
| `CLAUDE.md` | **Modify.** Two notes, each landing with the code that makes it true |
| `frontend/tests/teams-compare-tray.test.tsx` | **Create.** |
| `frontend/tests/use-document-visible.test.ts` | **Create.** |
| `frontend/tests/team-utils.test.ts` | **Modify.** |
| `frontend/tests/teams-comparison-grid.test.tsx` | **Modify.** |
| `frontend/tests/teams-hero.test.tsx` | **Modify.** |
| `frontend/tests/driver-portrait.test.tsx` | **Modify.** |
| `frontend/tests/inspect-modal.test.tsx` | **Modify.** Extended, not rewritten — it was created 2026-08-11 |

---

### Task 1: Give the compare tray and the portrait dissolve their own entries in the colour layer

The tray is a **new surface**. Its leading value is team-coloured text sitting on `bg-zinc-900/60`,
not on bare `zinc-950`, so `readableOnDark` is the wrong tool there for the fifth time. This task adds
the pair before anything renders on it, so the tray cannot be built the wrong way round.

It also adds the constant Task 5 needs, because both are one-file changes to the same module and a
reviewer would not meaningfully reject one while approving the other.

**Files:**
- Modify: `frontend/lib/team-utils.ts`
- Modify: `frontend/tests/team-utils.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: existing `blendOver`, `liftUntilContrast` (module-private), `DARK_BG`, `MIN_CONTRAST`,
  `parseHex` (module-private), `PORTRAIT_SCRIM_ALPHA`.
- Produces, all from `@/lib/team-utils`:
  - `TRAY_FILL: string` — `'#18181b'`, Tailwind `zinc-900`.
  - `TRAY_ALPHA: number` — `0.6`, the alpha in `bg-zinc-900/60`.
  - `trayValueBackdrop(): string` — the opaque colour behind a tray value.
  - `trayValueColor(hex: string): string` — a livery lifted until it clears AA on that backdrop.
    Task 2 uses this for the leading value of a numeric row.
  - `PORTRAIT_DISSOLVE_ALPHA: number` — `0.6`.
  - `portraitDissolve(): string` — the portrait's bottom-edge dissolve gradient. Task 5 uses it.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/team-utils.test.ts`. Add `TRAY_FILL`, `TRAY_ALPHA`, `trayValueBackdrop`,
`trayValueColor`, `PORTRAIT_DISSOLVE_ALPHA`, `portraitDissolve` to the existing import from
`@/lib/team-utils` (`contrastRatio`, `DARK_BG`, `MIN_CONTRAST`, `readableOnDark`,
`PORTRAIT_SCRIM_ALPHA` and `TEAMS` are already imported there — check before adding duplicates), then:

```ts
describe('trayValueColor', () => {
  it('clears AA on the tray’s own backdrop for every team', () => {
    expect(TEAMS).toHaveLength(11);
    const backdrop = trayValueBackdrop();
    for (const team of TEAMS) {
      expect(
        contrastRatio(trayValueColor(team.color), backdrop),
        `${team.shortName} tray value ${trayValueColor(team.color)} on ${backdrop}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  // The reason this helper exists at all, stated as a test. `readableOnDark` stops at the first
  // lightness step clearing 4.5:1 on bare zinc-950, so it has no headroom for any layer on top.
  // The tray is zinc-900 at 0.6 over the page, which computes to #121215 — lighter than the page —
  // and a colour sitting at exactly 4.5:1 on #09090b lands at ~4.23:1 there. Ferrari is the
  // worked example; every livery that needed lifting behaves the same way.
  it('is a different answer from readableOnDark, because the tray is not the page', () => {
    const backdrop = trayValueBackdrop();
    expect(contrastRatio(readableOnDark('#dc0000'), backdrop)).toBeLessThan(MIN_CONTRAST);
    expect(contrastRatio(trayValueColor('#dc0000'), backdrop)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('leaves a livery that already clears the bar alone', () => {
    expect(trayValueColor('#ffffff')).toBe('#ffffff');
  });
});

describe('the tray backdrop', () => {
  // A Tailwind class cannot be built from a runtime value, so the component keeps the literal
  // `bg-zinc-900/60` and these two constants carry the same numbers for the contrast maths.
  // teams-compare-tray.test.tsx pins the class to them from the other side.
  it('is authored as zinc-900 at the opacity the component uses', () => {
    expect(TRAY_FILL).toBe('#18181b');
    expect(TRAY_ALPHA).toBe(0.6);
  });

  it('is lighter than the page, which is the whole problem', () => {
    expect(contrastRatio(trayValueBackdrop(), '#ffffff')).toBeLessThan(
      contrastRatio(DARK_BG, '#ffffff'),
    );
  });
});

describe('portraitDissolve', () => {
  // The dissolve and the caption scrim now overlap: the scrim is anchored to the same bottom edge
  // the dissolve is darkest at, so before this they stacked to near-opaque and ate the photo.
  // The scrim is what backs the caption and carries the AA guarantee, so it must stay the
  // stronger of the two — the dissolve is only there to soften the portrait's bottom edge.
  it('is weaker than the scrim that actually backs the caption', () => {
    expect(PORTRAIT_DISSOLVE_ALPHA).toBeLessThan(PORTRAIT_SCRIM_ALPHA);
  });

  it('fades to fully transparent at the top of the portrait', () => {
    expect(portraitDissolve()).toMatch(/rgba\(9, 9, 11, 0\) 100%/);
  });

  // jsdom's cssstyle cannot parse a gradient containing calc() — it rewrites the whole declaration
  // to `background-image: none`, which looks exactly like a component that never set it. Same
  // reason portraitScrim() is written downwards from 0px.
  it('contains no calc(), which jsdom cannot parse', () => {
    expect(portraitDissolve()).not.toMatch(/calc\(/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/team-utils.test.ts`
Expected: FAIL — `TRAY_FILL`, `TRAY_ALPHA`, `trayValueBackdrop`, `trayValueColor`,
`PORTRAIT_DISSOLVE_ALPHA` and `portraitDissolve` are not exported.

- [ ] **Step 3: Implement**

In `frontend/lib/team-utils.ts`, add **after** `portraitCaptionColor` and **before** `needsDamping`:

```ts
/**
 * Tailwind `zinc-900`, and the opacity the compare tray is authored at — `bg-zinc-900/60`.
 *
 * Same arrangement as `RAIL_ACTIVE_FILL` / `RAIL_ACTIVE_ALPHA` above, and for the same reason: a
 * Tailwind class cannot be built from a runtime value, so the component keeps the literal and the
 * tests pin the two together from both sides.
 */
export const TRAY_FILL = '#18181b';
export const TRAY_ALPHA = 0.6;

/**
 * The opaque colour behind a value in the compare tray. The tray is a card, not the page: a
 * `zinc-900` wash at `TRAY_ALPHA` over `zinc-950` flattens to `#121215`, which is *lighter* than
 * `zinc-950` and therefore a harder background to read on, not an easier one.
 */
export function trayValueBackdrop(): string {
  return blendOver(TRAY_FILL, TRAY_ALPHA, DARK_BG);
}

/**
 * A team colour lifted far enough to clear AA as the tray's leading value.
 *
 * Fifth call site of the same lesson. `readableOnDark` clears 4.5:1 on bare `zinc-950` *by
 * construction* — it returns the first lightness step that clears, so there is no headroom above
 * the bar — and a colour sitting at exactly 4.5:1 on `#09090b` measures ~4.23:1 on `#121215`.
 * Every livery that needed lifting at all fails here; the ones already above the bar (Haas's
 * white) pass through untouched.
 */
export function trayValueColor(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, trayValueBackdrop());
}

/**
 * Strength of the portrait's bottom-edge dissolve, at its darkest.
 *
 * This used to be a Tailwind `from-zinc-950 via-zinc-950/40` gradient reaching **full** `zinc-950`
 * at the bottom edge — authored before the caption had a scrim of its own. The scrim landed on
 * 2026-08-11 anchored to that same edge, so the two now stack: 0.9 over 1.0 is opaque, and the
 * bottom third of every headshot went black.
 *
 * The number is bounded rather than chosen freely: the scrim is what backs the caption and carries
 * the AA guarantee, so the dissolve must stay the *weaker* of the two, or it becomes a second
 * uncontrolled contributor to a composite `portraitCaptionBackdrop` already claims to describe.
 * Anything under `PORTRAIT_SCRIM_ALPHA` is safe for contrast — a darker composite only ever raises
 * the real ratio above the asserted worst case — so this is a visual judgement inside a hard
 * ceiling.
 */
export const PORTRAIT_DISSOLVE_ALPHA = 0.6;

/**
 * The portrait's bottom-edge dissolve: strongest at the bottom, gone by the top.
 *
 * Written with explicit `rgba()` stops rather than Tailwind's `from-`/`via-`/`to-` for the same
 * reason `portraitScrim` is: the alpha has to be one number shared with the contrast maths, and a
 * Tailwind opacity suffix cannot be built from a runtime value. No `calc()` — jsdom's CSS parser
 * silently discards a whole gradient declaration that contains one.
 */
export function portraitDissolve(): string {
  const [r, g, b] = parseHex(DARK_BG);
  const rgba = (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
  return `linear-gradient(to top, ${rgba(PORTRAIT_DISSOLVE_ALPHA)} 0%, ${rgba(
    PORTRAIT_DISSOLVE_ALPHA * 0.4,
  )} 45%, ${rgba(0)} 100%)`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/team-utils.test.ts`
Expected: PASS.

If `is a different answer from readableOnDark` fails, **do not loosen it.** Recompute
`trayValueBackdrop()` by hand and check whether the tray's authored class in Task 2 still matches
`TRAY_FILL`/`TRAY_ALPHA`; a mismatch between the class and the constants is the failure this pair of
tests exists to catch.

- [ ] **Step 5: Confirm the whole suite**

Run: `mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all green, **~333 passing** (324 + 9).

- [ ] **Step 6: Extend the CLAUDE.md contrast note**

In `CLAUDE.md`, find the paragraph beginning **`readableOnDark` is only correct on bare `zinc-950`**.
It currently names three call sites and says "Three call sites sit on something lighter". Replace that
sentence and its list with:

```markdown
construction** — it stops at the first lightness step clearing 4.5:1, so *any* translucent layer
between the glyphs and the page pushes it under. Five call sites sit on something lighter and each
needs its own backdrop variant, all built from `blendOver` + `liftUntilContrast`: `seamLabelColor`
for the seam wash, `railStandingColor` for the active rail row's `bg-zinc-800/60` highlight
(`readableOnDark` measured 4.02:1 there), `sectionStandingColor` for the section glow,
`portraitCaptionColor` for the caption scrim over a photograph, and `trayValueColor` for the compare
tray's `bg-zinc-900/60` card (4.23:1 there). The mistake looks identical every time and the tests
reproduced it twice: an assertion that measures the right *colour* against the wrong *background*
passes while the rendered page fails. If you add team-coloured text, ask what is behind it first.
```

Check the surrounding lines after editing — the paragraph's opening sentence must still read
correctly, and the count in it must be five.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/team-utils.ts frontend/tests/team-utils.test.ts CLAUDE.md
git commit -m "Give the compare tray its own backdrop before anything renders on it

The tray is a card, not the page: zinc-900 at 0.6 over zinc-950 flattens to
#121215, which is lighter than the page, and a colour sitting at exactly
4.5:1 on #09090b measures 4.23:1 there. Fifth call site of the same lesson,
so the pair lands before the component that would otherwise be built with
readableOnDark and look fine in jsdom.

Also adds portraitDissolve(), whose alpha is bounded below the caption
scrim's. The old dissolve reached full zinc-950 at the bottom edge, which
was correct until the scrim landed on that same edge yesterday; 0.9 over 1.0
is opaque and the bottom third of every headshot went black."
```

---

### Task 2: The compare tray, as a pure function of two teams

The tray knows nothing about selection, sorting or the grid. It is handed exactly two teams and lays
them out field by field. Building it standalone is what makes the leader logic testable without
driving a selection UI.

**Files:**
- Create: `frontend/components/teams/teams-compare-tray.tsx`
- Test: `frontend/tests/teams-compare-tray.test.tsx`

**Interfaces:**
- Consumes: `trayValueColor` from Task 1; `TeamMonogramTile` from `./team-monogram-tile`.
- Produces, from `@/components/teams/teams-compare-tray`:
  - `interface CompareField { label: string; value: (team: Team) => string; lead: ((team: Team) => number) | null }`
  - `COMPARE_FIELDS: CompareField[]` — the six fields the spec names, in order: Championship, Titles,
    Power Unit, Base, First Entry, Drivers.
  - `leaderIndex(field: CompareField, a: Team, b: Team): 0 | 1 | null` — pure.
  - `TeamsCompareTray(props: { teams: [Team, Team]; reducedMotion: boolean; onClear: () => void })`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/teams-compare-tray.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

import {
  TeamsCompareTray,
  COMPARE_FIELDS,
  leaderIndex,
} from '@/components/teams/teams-compare-tray';
import { TEAM_MAP, type Team } from '@/data/teams-data';
import {
  contrastRatio,
  trayValueBackdrop,
  trayValueColor,
  MIN_CONTRAST,
} from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

const ferrari = TEAM_MAP['ferrari']!;
const mercedes = TEAM_MAP['mercedes']!;
const cadillac = TEAM_MAP['cadillac']!;
const audi = TEAM_MAP['audi']!;

/** jsdom normalises any inline colour to `rgb(r, g, b)`; contrastRatio wants hex. */
function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

function renderTray(teams: [Team, Team] = [mercedes, ferrari], onClear = vi.fn()) {
  return render(<TeamsCompareTray teams={teams} reducedMotion={false} onClear={onClear} />);
}

function field(label: string) {
  return COMPARE_FIELDS.find((f) => f.label === label)!;
}

describe('leaderIndex', () => {
  it('gives a numeric field to whichever team is ahead', () => {
    // Mercedes 379 points, Ferrari 307.
    expect(leaderIndex(field('Championship'), mercedes, ferrari)).toBe(0);
    expect(leaderIndex(field('Championship'), ferrari, mercedes)).toBe(1);
  });

  // Nothing wins a power unit. The spec is explicit about this and it is the difference between
  // a comparison and a scoreboard.
  it('gives no leader to a non-numeric field', () => {
    expect(leaderIndex(field('Power Unit'), mercedes, ferrari)).toBeNull();
    expect(leaderIndex(field('Base'), mercedes, ferrari)).toBeNull();
    expect(leaderIndex(field('Drivers'), mercedes, ferrari)).toBeNull();
  });

  // Two teams on zero championships is a real pairing on the 2026 grid, not a hypothetical.
  it('gives no leader when a numeric field is tied', () => {
    expect(cadillac.championships).toBe(audi.championships);
    expect(leaderIndex(field('Titles'), cadillac, audi)).toBeNull();
  });

  // "Since" sorts ascending — oldest first — so the older constructor leads. Inverting this is
  // the easy mistake: the raw number is smaller for the winner.
  it('gives First Entry to the earlier debut, matching the Since tab', () => {
    expect(ferrari.firstEntry).toBeLessThan(mercedes.firstEntry);
    expect(leaderIndex(field('First Entry'), ferrari, mercedes)).toBe(0);
  });
});

describe('TeamsCompareTray', () => {
  it('lays both constructors out over all six fields the spec names', () => {
    renderTray();
    for (const label of [
      'Championship',
      'Titles',
      'Power Unit',
      'Base',
      'First Entry',
      'Drivers',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('names both constructors', () => {
    renderTray();
    expect(screen.getByText('Mercedes')).toBeInTheDocument();
    expect(screen.getByText('Ferrari')).toBeInTheDocument();
  });

  it('shows each team’s own value for a field', () => {
    renderTray();
    expect(screen.getByText(mercedes.powerUnit)).toBeInTheDocument();
    expect(screen.getByText(ferrari.base)).toBeInTheDocument();
  });

  it('marks the leading value of a numeric row for screen readers, not by colour alone', () => {
    renderTray();
    const row = screen.getByTestId('compare-row-championship');
    // Mercedes leads on points and is the left column.
    expect(within(row).getByTestId('compare-value-0')).toHaveTextContent(/leads/i);
    expect(within(row).getByTestId('compare-value-1')).not.toHaveTextContent(/leads/i);
  });

  it('marks nothing on a non-numeric row', () => {
    renderTray();
    const row = screen.getByTestId('compare-row-power-unit');
    expect(within(row).getByTestId('compare-value-0')).not.toHaveTextContent(/leads/i);
    expect(within(row).getByTestId('compare-value-1')).not.toHaveTextContent(/leads/i);
  });

  it('marks nothing on a tied numeric row', () => {
    renderTray([cadillac, audi]);
    const row = screen.getByTestId('compare-row-titles');
    expect(within(row).getByTestId('compare-value-0')).not.toHaveTextContent(/leads/i);
    expect(within(row).getByTestId('compare-value-1')).not.toHaveTextContent(/leads/i);
  });

  // The whole reason Task 1 exists. The leading value is the only team-coloured text in the tray
  // and it sits on the tray's card, not on the page.
  it('colours the leading value through the tray’s own contrast variant', () => {
    renderTray();
    const leader = within(screen.getByTestId('compare-row-championship')).getByTestId(
      'compare-value-0',
    );
    expect(rgbToHex(leader.style.color)).toBe(trayValueColor(mercedes.color));
  });

  it('holds the leading value above AA on the background it actually has', () => {
    renderTray();
    const leader = within(screen.getByTestId('compare-row-championship')).getByTestId(
      'compare-value-0',
    );
    expect(
      contrastRatio(rgbToHex(leader.style.color), trayValueBackdrop()),
    ).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  // The class and the constants are two halves of one number. team-utils.test.ts pins the
  // constants; this pins the class to them.
  it('is authored at the fill the contrast maths assumes', () => {
    renderTray();
    expect(screen.getByTestId('compare-tray').className).toMatch(/\bbg-zinc-900\/60\b/);
  });

  it('holds every resting neutral above AA on the page background', () => {
    const { container } = renderTray();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, '#09090b'), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  it('offers a way out', () => {
    const onClear = vi.fn();
    renderTray([mercedes, ferrari], onClear);
    fireEvent.click(screen.getByRole('button', { name: /clear comparison/i }));
    expect(onClear).toHaveBeenCalled();
  });

  // Below lg the two values stack under a shared label, so each one has to say whose it is.
  // At lg and up the column headers carry that and these are hidden.
  it('labels each value with its team for the stacked layout', () => {
    renderTray();
    const row = screen.getByTestId('compare-row-base');
    expect(within(row).getByTestId('compare-value-0').textContent).toMatch(/Mercedes/);
    expect(within(row).getByTestId('compare-value-1').textContent).toMatch(/Ferrari/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/teams-compare-tray.test.tsx`
Expected: FAIL — cannot resolve `@/components/teams/teams-compare-tray`.

- [ ] **Step 3: Implement**

Create `frontend/components/teams/teams-compare-tray.tsx`:

```tsx
'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/utils';
import { trayValueColor } from '@/lib/team-utils';
import { type Team } from '@/data/teams-data';
import { TeamMonogramTile } from './team-monogram-tile';

export interface CompareField {
  label: string;
  /** What one team shows for this field. */
  value: (team: Team) => string;
  /**
   * Higher-is-better score for this field, or `null` when nothing can lead it.
   *
   * `null` is not "not implemented yet" — it is the spec's rule that non-numeric rows get no
   * highlight. Nothing wins a power unit, a base or a driver pairing, and inventing an ordering
   * for them would turn a comparison back into the ranking the bar race already is.
   */
  lead: ((team: Team) => number) | null;
}

/**
 * The six fields the spec names, in its order.
 *
 * `First Entry` is negated because the leader is the *earlier* debut — the same direction the
 * "Since" sort tab already uses, which sorts ascending with the oldest constructor first. Scoring
 * the raw year would hand 1950 Ferrari's row to whichever team is youngest.
 */
export const COMPARE_FIELDS: CompareField[] = [
  {
    label: 'Championship',
    value: (t) => `P${t.position} · ${t.points} PTS`,
    lead: (t) => t.points,
  },
  {
    label: 'Titles',
    value: (t) => (t.championships > 0 ? `${t.championships} WCC` : '—'),
    lead: (t) => t.championships,
  },
  { label: 'Power Unit', value: (t) => t.powerUnit, lead: null },
  { label: 'Base', value: (t) => t.base, lead: null },
  { label: 'First Entry', value: (t) => String(t.firstEntry), lead: (t) => -t.firstEntry },
  { label: 'Drivers', value: (t) => t.drivers.map((d) => d.name).join(' · '), lead: null },
];

/**
 * Which of the two teams leads a field: `0`, `1`, or `null`.
 *
 * `null` covers both "nothing can lead this" and "they are level". A tie is a real case on this
 * grid rather than a defensive branch — Cadillac and Audi are both on zero championships — and
 * highlighting one of two equal values is worse than highlighting neither.
 */
export function leaderIndex(field: CompareField, a: Team, b: Team): 0 | 1 | null {
  if (!field.lead) return null;
  const scoreA = field.lead(a);
  const scoreB = field.lead(b);
  if (scoreA === scoreB) return null;
  return scoreA > scoreB ? 0 : 1;
}

/** `Power Unit` → `power-unit`, for the row's test id. */
function slug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

interface TeamsCompareTrayProps {
  teams: [Team, Team];
  reducedMotion: boolean;
  onClear: () => void;
}

/**
 * Two constructors laid out field by field.
 *
 * A pure function of its two teams: it holds no state, does no selection and knows nothing about
 * the bar race that feeds it. Everything about *which* two teams is the grid's business.
 *
 * The layout is one DOM at both breakpoints, not two rendered sets. At `lg` and up each field is a
 * three-cell row — value, label, value — with the label centred between the two columns; below
 * `lg` the same three cells stack, label first, and each value carries an `lg:hidden` copy of its
 * team's name so a stacked value still says whose it is. Rendering a second `lg:hidden` tray
 * instead would put two of every field in the DOM under jsdom, where no media query applies, and
 * every `getByText` here would throw on multiple matches.
 */
export function TeamsCompareTray({ teams: [left, right], reducedMotion, onClear }: TeamsCompareTrayProps) {
  const columns: [Team, Team] = [left, right];

  return (
    <motion.section
      data-testid="compare-tray"
      aria-label={`${left.shortName} compared with ${right.shortName}`}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }}
      className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/60 p-5"
    >
      {/* Column headers. The accent rule under each is decorative and keeps the true livery. */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="hidden flex-1 gap-6 lg:flex">
          {columns.map((team, i) => (
            <div key={team.id} className={cn('flex-1', i === 0 && 'text-right')}>
              <div
                className={cn('flex items-center gap-2', i === 0 && 'flex-row-reverse')}
              >
                <TeamMonogramTile team={team} size={20} />
                <span className="truncate text-sm font-bold uppercase tracking-wider text-white">
                  {team.shortName}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="mt-2 block h-[2px] w-full"
                style={{ backgroundColor: team.color }}
              />
            </div>
          ))}
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 lg:hidden">
          Head to head
        </p>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear comparison"
          className="flex-shrink-0 rounded border border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400 transition-colors duration-200 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 active:scale-[0.96]"
        >
          Clear
        </button>
      </div>

      <dl className="flex flex-col">
        {COMPARE_FIELDS.map((f) => {
          const leader = leaderIndex(f, left, right);
          return (
            <div
              key={f.label}
              data-testid={`compare-row-${slug(f.label)}`}
              className="flex flex-col gap-1 border-t border-zinc-800 py-3 lg:flex-row lg:items-center lg:gap-6"
            >
              <dt className="order-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400 lg:order-2 lg:w-32 lg:flex-shrink-0 lg:text-center">
                {f.label}
              </dt>
              {columns.map((team, i) => (
                <dd
                  key={team.id}
                  data-testid={`compare-value-${i}`}
                  className={cn(
                    'text-sm lg:flex-1',
                    i === 0 ? 'order-2 lg:order-1 lg:text-right' : 'order-3 lg:order-3',
                    leader === i ? 'font-semibold' : 'font-normal text-zinc-200',
                  )}
                  style={leader === i ? { color: trayValueColor(team.color) } : undefined}
                >
                  <span className="mr-2 text-[10px] uppercase tracking-[0.15em] text-zinc-400 lg:hidden">
                    {team.shortName}
                  </span>
                  {f.value(team)}
                  {leader === i && <span className="sr-only"> — leads</span>}
                </dd>
              ))}
            </div>
          );
        })}
      </dl>
    </motion.section>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/teams-compare-tray.test.tsx`
Expected: PASS, 15 tests.

Two failures worth reading carefully rather than patching:
- `holds every resting neutral above AA` failing means a neutral in the markup above is dimmer than
  `zinc-400`. Raise the class, do not lower the bar.
- `colours the leading value through the tray's own contrast variant` failing on the *hex* means
  the component reached for `readableOnDark`. That is the bug this plan is most likely to
  reintroduce.

- [ ] **Step 5: Typecheck and lint**

Run: `mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/teams/teams-compare-tray.tsx frontend/tests/teams-compare-tray.test.tsx
git commit -m "Add the compare tray as a pure function of two constructors

Six fields in the spec's order, one DOM at both breakpoints. The leading
value of a numeric row is highlighted; non-numeric rows are not, because
nothing wins a power unit, and a tie is not highlighted either — Cadillac
and Audi are both on zero championships, which is a real pairing on this
grid rather than a defensive branch.

First Entry is scored negated so the earlier debut leads, matching the
Since tab's ascending sort. The highlight goes through trayValueColor, not
readableOnDark: the tray is a zinc-900/60 card, and readableOnDark measures
4.23:1 on it.

Colour is not the only cue — the leading value also carries an sr-only
'leads' and a heavier weight."
```

---

### Task 3: Turn the bar race into a two-slot selector and hang the tray off it

The bar race **stays**. Each row keeps its anchor to the team's section — that is Plan A's item 14
work and it does not regress — and gains a sibling toggle that puts the team into one of two compare
slots.

**Files:**
- Modify: `frontend/components/teams/teams-comparison-grid.tsx`
- Modify: `frontend/tests/teams-comparison-grid.test.tsx`

**Interfaces:**
- Consumes: `TeamsCompareTray` from Task 2.
- Produces: `TeamsComparisonGrid` with an **unchanged** prop type —
  `{ teams: Team[]; activeTeamId: string; reducedMotion: boolean; onSelectTeam: (id: string) => void }`.
  Selection state is internal. `teams-page-client.tsx` needs no change.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/teams-comparison-grid.test.tsx`, inside the existing
`describe('TeamsComparisonGrid')` block. Add `within` to the existing import from
`@testing-library/react` if it is not already there (it is), and add `TEAM_MAP` to the existing
`@/data/teams-data` import:

```tsx
  describe('the two-slot comparison', () => {
    it('shows no tray until two constructors are chosen', () => {
      renderGrid();
      expect(screen.queryByTestId('compare-tray')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));
      expect(screen.queryByTestId('compare-tray')).not.toBeInTheDocument();
    });

    it('says what it is waiting for after one pick', () => {
      renderGrid();
      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));
      expect(screen.getByText(/select one more/i)).toBeInTheDocument();
    });

    it('opens the tray on the second pick', () => {
      renderGrid();
      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));

      const tray = screen.getByTestId('compare-tray');
      expect(within(tray).getByText('Power Unit')).toBeInTheDocument();
      expect(within(tray).getByText(TEAM_MAP['ferrari']!.base)).toBeInTheDocument();
    });

    it('reports each row’s slot state to assistive tech', () => {
      renderGrid();
      const mercedes = screen.getByRole('button', { name: /compare Mercedes/i });
      expect(mercedes).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(mercedes);
      expect(mercedes).toHaveAttribute('aria-pressed', 'true');
    });

    it('lets a chosen constructor be unchosen', () => {
      renderGrid();
      const mercedes = screen.getByRole('button', { name: /compare Mercedes/i });
      fireEvent.click(mercedes);
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));
      expect(screen.getByTestId('compare-tray')).toBeInTheDocument();

      fireEvent.click(mercedes);
      expect(screen.queryByTestId('compare-tray')).not.toBeInTheDocument();
      expect(mercedes).toHaveAttribute('aria-pressed', 'false');
    });

    // The cap is two. A third pick drops the older of the two rather than being silently
    // ignored — a control that visibly does nothing is worse than one that does something
    // predictable.
    it('caps the comparison at two, dropping the older pick', () => {
      renderGrid();
      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));
      fireEvent.click(screen.getByRole('button', { name: /compare McLaren/i }));

      expect(screen.getByRole('button', { name: /compare Mercedes/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.getByRole('button', { name: /compare Ferrari/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: /compare McLaren/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('keeps the picks in the order they were made', () => {
      renderGrid();
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));
      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));

      const row = screen.getByTestId('compare-row-championship');
      expect(within(row).getByTestId('compare-value-0').textContent).toMatch(/Ferrari/);
      expect(within(row).getByTestId('compare-value-1').textContent).toMatch(/Mercedes/);
    });

    it('clears both slots from the tray', () => {
      renderGrid();
      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));
      fireEvent.click(screen.getByRole('button', { name: /clear comparison/i }));

      expect(screen.queryByTestId('compare-tray')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /compare Mercedes/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    // The row's anchor and its compare toggle are siblings, not nested. A button inside an
    // anchor is invalid HTML and the browser's behaviour on click is undefined.
    it('keeps the compare toggle outside the jump link', () => {
      renderGrid();
      const link = screen.getByRole('link', { name: /jump to Ferrari/i });
      expect(link.querySelector('button')).toBeNull();
    });

    it('does not navigate when a constructor is picked for comparison', () => {
      const onSelectTeam = vi.fn();
      renderGrid(onSelectTeam);
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));
      expect(onSelectTeam).not.toHaveBeenCalled();
    });

    // The sort tabs stay at three. The tray is what answers the brief's demand that power unit,
    // base and drivers be comparable; adding tabs for them would add controls without adding
    // information.
    it('still offers exactly three orderings', () => {
      renderGrid();
      for (const label of ['Points', 'Titles', 'Since']) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      }
      const tabs = screen
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') !== null && !/compare /i.test(b.getAttribute('aria-label') ?? ''));
      expect(tabs).toHaveLength(3);
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/teams-comparison-grid.test.tsx`
Expected: FAIL — no `Compare …` buttons exist.

- [ ] **Step 3: Implement**

In `frontend/components/teams/teams-comparison-grid.tsx`:

Extend the imports at the top:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Plus } from 'lucide-react';
```

and add, beside the existing `./team-monogram-tile` import:

```tsx
import { TeamsCompareTray } from './teams-compare-tray';
```

Add, immediately after the `metricPhrase` function:

```tsx
/**
 * How many constructors the tray compares. Two is the spec's cap and it is a design decision, not
 * a limit of the layout: a head-to-head is the thing that makes this a comparison rather than the
 * ranking the bar race already is.
 */
const COMPARE_SLOTS = 2;
```

Inside the component, after the existing `handleSort`:

```tsx
  /**
   * The two constructors under comparison, in the order they were picked, so the left column of
   * the tray is the one chosen first.
   *
   * Local state on purpose. The spec forbids new global state, and nothing outside this section
   * needs to know what is being compared — the tray renders inside it and the rows that feed it
   * are its own children.
   */
  const [compared, setCompared] = useState<string[]>([]);

  const toggleCompare = useCallback((id: string) => {
    setCompared((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-COMPARE_SLOTS),
    );
  }, []);

  const clearCompare = useCallback(() => setCompared([]), []);

  // Resolved from `teams` rather than TEAM_MAP so the section compares exactly what it was given.
  const comparedTeams = useMemo(
    () => compared.map((id) => teams.find((t) => t.id === id)).filter((t): t is Team => Boolean(t)),
    [compared, teams],
  );
```

Replace the row — the whole `<motion.a …>…</motion.a>` block inside `ranked.map` — with:

```tsx
            <motion.div
              key={team.id}
              layout={!reducedMotion}
              transition={
                reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }
              }
              className={cn(
                'flex items-center gap-2 rounded px-2 py-2 transition-colors duration-200',
                team.id === activeTeamId ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/30',
              )}
            >
              <a
                href={`#team-${team.id}`}
                onClick={() => onSelectTeam(team.id)}
                // Team name first, so the eleven rows stay quick to tell apart when skimmed by
                // name, then the standing the row actually displays.
                aria-label={`Jump to ${team.shortName}, ${i + 1} of ${
                  ranked.length
                }, ${metricPhrase(sort, team)}`}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-3 text-left no-underline',
                  'rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                )}
                // `--tw-ring-color`, not `outlineColor` — Tailwind's ring is a box-shadow.
                style={{ '--tw-ring-color': ringOnDark(team.color) } as React.CSSProperties}
              >
                <span className="w-5 flex-shrink-0 font-mono text-[11px] text-zinc-400">
                  {i + 1}
                </span>
                <TeamMonogramTile team={team} size={22} />
                <span className="w-24 flex-shrink-0 truncate text-xs font-medium text-white">
                  {team.shortName}
                </span>

                <span className="h-[9px] min-w-0 flex-1 overflow-hidden bg-zinc-900">
                  <span
                    data-testid="bar-fill"
                    className={cn(
                      'block h-full origin-left ease-out',
                      !reducedMotion && 'transition-transform duration-700',
                    )}
                    style={{
                      backgroundColor: team.color,
                      transform: `scaleX(${Number((metric / leader).toFixed(2))})`,
                    }}
                  />
                </span>

                <span className="w-10 flex-shrink-0 text-right font-mono text-sm font-bold text-white">
                  {reducedMotion ? (
                    sort === 'firstEntry' ? team.firstEntry : metric
                  ) : sort === 'firstEntry' ? (
                    team.firstEntry
                  ) : (
                    <NumberTicker value={metric} className="text-sm text-white" />
                  )}
                </span>
              </a>

              {/* A sibling of the anchor, never a child of it: a button inside an anchor is
                  invalid HTML and what a browser does on click is undefined. */}
              <button
                type="button"
                onClick={() => toggleCompare(team.id)}
                aria-pressed={compared.includes(team.id)}
                aria-label={`Compare ${team.shortName}`}
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border transition-colors duration-200 active:scale-[0.96]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                  compared.includes(team.id)
                    ? 'border-zinc-500 bg-zinc-800 text-white'
                    : 'border-zinc-800 text-zinc-400 hover:text-zinc-200',
                )}
                style={{ '--tw-ring-color': ringOnDark(team.color) } as React.CSSProperties}
              >
                {compared.includes(team.id) ? (
                  <Check size={12} aria-hidden="true" />
                ) : (
                  <Plus size={12} aria-hidden="true" />
                )}
              </button>
            </motion.div>
```

Then, immediately after the closing `</div>` of the rows container and **before** the `<footer>`, add:

```tsx
      {/*
        Plain `AnimatePresence`, no `mode="wait"`. The incoming child under `mode="wait"` is held
        behind the outgoing one's exit animation, which never resolves synchronously in jsdom, so
        every assertion in this section's tests would find nothing. The swap here is between "no
        tray" and "a tray", which nothing is waiting on anyway.
      */}
      <AnimatePresence initial={false}>
        {comparedTeams.length === COMPARE_SLOTS && (
          <TeamsCompareTray
            key="compare-tray"
            teams={[comparedTeams[0]!, comparedTeams[1]!]}
            reducedMotion={reducedMotion}
            onClear={clearCompare}
          />
        )}
      </AnimatePresence>

      {compared.length === 1 && (
        <p className="mt-6 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
          Select one more constructor to compare
        </p>
      )}
```

Finally, add a short label above the rows so the new toggle is discoverable. Replace the existing
`Rank by …` paragraph with:

```tsx
      {/* Names the leading numeral. It is neither the championship position nor the page's
          running order — it is the rank under the active sort, and it moves with the tab. */}
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">
          {`Rank by ${SORTS.find((s) => s.key === sort)!.label.toLowerCase()}`}
        </p>
        <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">
          Pick two to compare
        </p>
      </div>
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/teams-comparison-grid.test.tsx`
Expected: PASS. Every pre-existing test in the file must still pass untouched — the anchor keeps its
`href`, its `aria-label`, its `onClick`, and the `bar-fill` inside it. If one of the *old* tests
fails, the row restructure moved something out of the anchor that belongs inside it.

- [ ] **Step 5: Confirm the whole suite and types**

Run: `mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: green, **~360 passing**.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/teams/teams-comparison-grid.tsx frontend/tests/teams-comparison-grid.test.tsx
git commit -m "Make the bar race a two-slot selector and hang the compare tray off it

The rows keep their anchors — middle-click, open-in-new-tab and one history
entry per click all survive — and gain a sibling toggle. The toggle is a
sibling and not a child because a button inside an anchor is invalid HTML.

The cap is two and a third pick drops the older one, rather than being
ignored: a control that visibly does nothing is worse than one that does
something predictable. Selection order is the tray's column order.

Selection is local state. Nothing outside this section needs to know what is
being compared, and the spec rules out new global state.

The sort tabs stay at three. The tray is what makes power unit, base and
drivers comparable; a tab for each would add controls without information."
```

---

### Task 4: Tighten the hero and name the grid in its CTA

**Files:**
- Modify: `frontend/components/teams/teams-hero.tsx`
- Modify: `frontend/tests/teams-hero.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `HERO_TIMING` from `@/components/teams/teams-hero` — the entrance's delays and durations
  in one object, so "tightened" is a number a test can hold rather than a claim in a commit message.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/teams-hero.test.tsx`, inside the existing top-level `describe`. Add
`HERO_TIMING` to the existing `@/components/teams/teams-hero` import:

```tsx
  it('says how many constructors the page holds, and counts them rather than asserting', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: `Explore ${TEAMS.length} Constructors` }),
    ).toBeInTheDocument();
  });

  // Item 8 is "tighten the existing stagger", which is only meaningful as a number. The last
  // thing to arrive is the scroll cue, and it now arrives inside a second — before this it was
  // 1.4s in, by which point a visitor who scrolled has already left.
  it('finishes its entrance inside a second', () => {
    expect(HERO_TIMING.cue).toBeLessThan(1);
    expect(HERO_TIMING.badge).toBeLessThan(HERO_TIMING.subtitleDelay);
    expect(HERO_TIMING.subtitleDelay).toBeLessThan(HERO_TIMING.cta);
    expect(HERO_TIMING.cta).toBeLessThan(HERO_TIMING.cue);
  });

  // Eleven columns at the old 0.06 step put the last livery 0.6s behind the first, which reads
  // as a queue rather than a wall arriving.
  it('lands the whole livery wall before the CTA does', () => {
    expect(HERO_TIMING.wallStep * (TEAMS.length - 1)).toBeLessThan(HERO_TIMING.cta);
  });
```

Check the top of the file first. `TEAMS`, `vi`, `render` and `screen` are already imported; there is
**no** render helper, so the inline `render(<TeamsHero onSelectTeam={vi.fn()} />)` above matches the
file's existing style. Do not introduce one.

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/teams-hero.test.tsx`
Expected: FAIL — `HERO_TIMING` is not exported, and the CTA reads `Explore Constructors`.

- [ ] **Step 3: Implement**

In `frontend/components/teams/teams-hero.tsx`, add above the `TeamsHeroProps` interface:

```tsx
/**
 * The hero's entrance, in one place.
 *
 * Item 8 asks for the existing stagger to be tightened, which is only a real change if it is a
 * number. It was: badge 0.1, subtitle 0.4, CTA 0.8, scroll cue 1.4, and a 0.06s step across
 * eleven livery columns — so the last element of a *hero* arrived two seconds in, well after a
 * visitor who is going to scroll has scrolled. Everything below finishes inside a second and the
 * wall lands before the CTA rather than behind it.
 *
 * Exported because "tightened" is otherwise unverifiable: `teams-hero.test.tsx` asserts the
 * ordering and the ceiling instead of pinning eleven literals that would drift.
 */
export const HERO_TIMING = {
  badge: 0.05,
  titleDuration: 0.6,
  subtitleDelay: 0.25,
  subtitleDuration: 0.5,
  cta: 0.5,
  cue: 0.9,
  cueDuration: 0.4,
  wallStep: 0.04,
  wallDuration: 0.5,
} as const;
```

Then thread it through, changing only these values:

| Where | From | To |
|---|---|---|
| Livery wall `transition.delay` | `i * 0.06` | `i * HERO_TIMING.wallStep` |
| Livery wall `transition.duration` | `0.6` | `HERO_TIMING.wallDuration` |
| Badge `BlurFade delay` | `0.1` | `HERO_TIMING.badge` |
| `THE GRID` `TextAnimate duration` | `0.8` | `HERO_TIMING.titleDuration` |
| Subtitle `TextAnimate delay` | `0.4` | `HERO_TIMING.subtitleDelay` |
| Subtitle `TextAnimate duration` | `0.6` | `HERO_TIMING.subtitleDuration` |
| CTA `BlurFade delay` | `reducedMotion ? 0 : 0.8` | `reducedMotion ? 0 : HERO_TIMING.cta` |
| Scroll cue `transition.delay` | `1.4` | `HERO_TIMING.cue` |
| Scroll cue `transition.duration` | `0.6` | `HERO_TIMING.cueDuration` |

Rows 2 and 9 were originally specified as literal→literal (`0.5` and `0.4`), which left those two
of the nine "tightened" values untestable — a later review corrected this; both now route through
`HERO_TIMING` like the rest.

And change the CTA's label from the literal to the derived one:

```tsx
            Explore {TEAMS.length} Constructors
            <ChevronRight className="h-4 w-4" />
```

Nothing else in this file changes. In particular: **no new parallax layer**, the livery wall keeps the
true brand hexes, the badge's `2026 Season · 11 Constructors` copy stays as it is, and the scroll cue
stays behind `!reducedMotion`.

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/teams-hero.test.tsx`
Expected: PASS. The pre-existing `reaches the Explore Constructors CTA before any livery column in
tab order` test matches on `/explore constructors/i`, which does **not** match the new copy —
`Explore 11 Constructors` does not contain the contiguous substring `explore constructors`, so the
number breaks it. Widen its matcher to `/explore \d+ constructors/i`; its subject is tab order, not
copy, and the CTA's exact wording is already pinned by the new "says how many constructors the
page holds" test, which derives it from `TEAMS.length` — duplicating that assertion here would
make an unrelated test fail every time the grid size changes.

- [ ] **Step 5: Confirm the suite**

Run: `mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: green, **~363 passing**.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/teams/teams-hero.tsx frontend/tests/teams-hero.test.tsx
git commit -m "Tighten the hero's entrance and let its CTA count the grid

The last element of the hero used to arrive two seconds in — scroll cue at
1.4s on top of a 0.6s livery-wall tail — which is after a visitor who is
going to scroll has scrolled. Everything now lands inside a second and the
wall arrives before the CTA rather than behind it.

The delays live in one exported object because 'tightened' is otherwise
unverifiable; the test asserts the ordering and the ceiling rather than
pinning eleven literals.

CTA copy comes from TEAMS.length, so it cannot say eleven while the grid
says twelve. No new parallax — item 8 asks to reduce empty space only if it
improves pacing, and the livery wall already carries the weight."
```

---

### Task 5: Rebalance the portrait's gradients around the caption scrim

The one clause of item 9 that has not shipped: *"the gradient space around the portraits is
rebalanced."* The seam and the per-section standing line landed in Plan A and were revised again on
2026-08-10/11; what is left is that the portrait now carries **two** darkenings anchored to the same
bottom edge, and they were authored years apart in spirit — the dissolve reaches full `zinc-950`, the
scrim adds 0.9 on top of it, and the composite is opaque over the bottom third of every headshot.

**Files:**
- Modify: `frontend/components/teams/driver-portrait.tsx`
- Modify: `frontend/tests/driver-portrait.test.tsx`

**Interfaces:**
- Consumes: `portraitDissolve`, `PORTRAIT_DISSOLVE_ALPHA` from Task 1.
- Produces: nothing new. `DriverPortrait`'s props are unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/driver-portrait.test.tsx`, inside the existing top-level
`describe('DriverPortrait')`. That file has **no** render helper — it calls
`render(<DriverPortrait driver={leclerc} team={ferrari} />)` inline, with `leclerc` and `ferrari`
already defined at the top — so match it rather than introducing one. Add `portraitDissolve`,
`PORTRAIT_DISSOLVE_ALPHA` and `PORTRAIT_SCRIM_ALPHA` to the existing `@/lib/team-utils` import
(`portraitScrim`, `PORTRAIT_SCRIM_FADE_PX` and `PORTRAIT_SCRIM_TEXT_INSET` are already there).

```tsx
  it('paints its dissolve from the shared gradient, not a Tailwind opacity suffix', () => {
    const { container } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
    const dissolve = container.querySelector('[data-testid="portrait-dissolve"]') as HTMLElement;
    expect(dissolve).not.toBeNull();
    // No `.replace()` here, unlike the scrim test two blocks down. jsdom drops `to bottom`
    // because it is the CSS default direction; `to top` is not the default and survives.
    expect(dissolve.style.background).toBe(portraitDissolve());
  });

  // The two darkenings are anchored to the same bottom edge. The scrim is the one that backs the
  // caption and carries the AA guarantee, so the dissolve has to stay under it — otherwise the
  // composite behind the text has a second contributor that portraitCaptionBackdrop does not
  // model, and the number the tests assert stops describing the page.
  it('keeps the dissolve weaker than the scrim it now sits beneath', () => {
    expect(PORTRAIT_DISSOLVE_ALPHA).toBeLessThan(PORTRAIT_SCRIM_ALPHA);
  });
```

**Do not add a test for the caption scrim.** `lays a scrim behind the caption and keeps the text out
of its fade` already covers it in this file, locating the caption as
`screen.getByText('Monégasque').parentElement!`. It must stay green untouched, which is the real
assertion this task needs from it.

If the first test fails on the *string*, print both sides before changing anything: jsdom may have
normalised something else in the declaration. Allow exactly the normalisation you can see, the way
the scrim test allows exactly one — never weaken it to a substring match.

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/driver-portrait.test.tsx`
Expected: FAIL — there is no `portrait-dissolve` test id and the dissolve is a Tailwind class.

- [ ] **Step 3: Implement**

In `frontend/components/teams/driver-portrait.tsx`:

Extend the `@/lib/team-utils` import to include `portraitDissolve`.

Replace the dissolve block:

```tsx
      {/* Dissolve into the page so the portrait has no hard bottom edge. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent"
      />
```

with:

```tsx
      {/*
        Dissolve into the page so the portrait has no hard bottom edge — and nothing more than
        that. It used to reach full `zinc-950` at the bottom, which was right while it was the only
        thing there; the caption scrim now covers that same edge at 0.9, and the two composited to
        opaque over the bottom third of every headshot. Its strength is bounded below the scrim's
        in `PORTRAIT_DISSOLVE_ALPHA` so the scrim stays the thing that backs the caption, which is
        what `portraitCaptionBackdrop` claims to describe.
      */}
      <div
        data-testid="portrait-dissolve"
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: portraitDissolve() }}
      />
```

Add `data-testid="portrait-caption"` to the caption block's wrapping `<div>` if it does not already
carry one — check the file first; the test above asserts on it.

Nothing else changes. The ghost number's opacities, the wash, the outline hairline, the
`PORTRAIT_SCRIM_TEXT_INSET` padding and `duotone.keyline` all stay exactly as they are.

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/driver-portrait.test.tsx`
Expected: PASS, including every pre-existing scrim and caption-contrast test **unchanged**.

If a caption-contrast test goes red here, read it before touching either side. The asserted worst case
is the scrim over a *white* photograph, and a weaker dissolve cannot lower that number — it is not in
the model at all. A red test here means the assertion was silently depending on the dissolve, which
is exactly the wrong-background mistake this branch has now made three times, and the fix is to say
so and correct the model rather than to raise `PORTRAIT_DISSOLVE_ALPHA` back.

- [ ] **Step 5: Confirm the suite**

Run: `mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: green, **~366 passing**.

- [ ] **Step 6: Verify it in a browser before committing**

jsdom lays nothing out and paints nothing; this task is entirely about what a composite looks like.

```bash
export PATH="/Users/lawrencecrasto/.local/share/mise/installs/node/24.17.0/bin:$PATH"
ab() { npx --yes agent-browser "$@"; }   # zsh does not word-split an unquoted $VAR

ab set viewport 1440 900
ab open http://localhost:3000/teams
ab eval 'document.getElementById("team-ferrari").scrollIntoView(); [innerWidth, innerHeight]'
ab screenshot /tmp/f1-plan-b/portrait-after.png
```

Assert `[1440, 900]` came back — a sweep that reports identical numbers at every width never changed
viewport. Open the PNG and confirm: the headshot is visible through the lower third rather than
black, the caption's three lines are still legible, and the portrait's bottom edge still dissolves
into the page rather than ending in a visible line.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/teams/driver-portrait.tsx frontend/tests/driver-portrait.test.tsx
git commit -m "Rebalance the portrait's two gradients around the caption scrim

The last unshipped clause of spec item 9. The dissolve reached full
zinc-950 at the bottom edge, which was correct while it was the only thing
there — the caption scrim landed on that same edge yesterday at 0.9, and
the two composited to opaque over the bottom third of every headshot.

The dissolve is now bounded below the scrim's alpha and written as an
explicit rgba gradient, so its strength is one number shared with the
contrast maths rather than a Tailwind opacity suffix. Contrast is unaffected
by construction: the caption's guarantee is judged against the scrim over a
white photograph, which a weaker dissolve cannot lower.

Verified at 1440x900 in a browser, not only in jsdom."
```

---

### Task 6: Stop the 3D scene rendering when nobody is looking at it

Spec item 11 is narrower than it sounds. Its headline concern — never render the sticky canvas and
the modal canvas together — **is already satisfied**, because the rail has no canvas: the prior
overhaul removed it and moved the whole `three` / `@react-three/fiber` bundle off page load and behind
the Inspect click. **That win is preserved. Do not add a canvas to the rail.**

What remains is the frame loop. `f1-hero-scene.tsx` is now imported by exactly one file
(`inspect-modal.tsx`) — confirm with `grep -rn "f1-hero-scene" app components` before you start, so
you know this change cannot reach the landing page.

**One deviation from the spec's literal wording, and why.** The spec asks for `frameloop="demand"`.
Taken literally that freezes the car: `RealCar` rotates and floats through `useFrame`, which under
`demand` runs only when something invalidates. So `frameloop` becomes **state** instead:

| Condition | `frameloop` | Why |
|---|---|---|
| Document hidden | `never` | The spec's "idle on `visibilitychange`", and the whole point |
| Reduced motion | `demand` | The spec's literal ask, in the one case where a still car is correct: continuous rotation is exactly the sustained movement `reduce` asks to be spared |
| Otherwise | `always` | A car that does not turn is not the feature |

Under `demand` nothing would ever render after the first frame, including the GLB arriving
asynchronously, so an explicit invalidator is part of this task rather than an optimisation.

**Files:**
- Create: `frontend/hooks/use-document-visible.ts`
- Test: `frontend/tests/use-document-visible.test.ts`
- Modify: `frontend/components/3d/f1-hero-scene.tsx`
- Modify: `frontend/components/3d/README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `useDocumentVisible(): boolean` from `@/hooks/use-document-visible` — `true` on the
  server and on first client render, then tracking `document.visibilityState`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/use-document-visible.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useDocumentVisible } from '@/hooks/use-document-visible';

/** jsdom's `document.visibilityState` is a read-only getter; this replaces it for one test. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

describe('useDocumentVisible', () => {
  // True first, not false first. The caller uses this to decide whether an animation runs, and a
  // scene that starts frozen and unfreezes after an effect is a visible flicker on every open.
  it('starts visible', () => {
    const { result } = renderHook(() => useDocumentVisible());
    expect(result.current).toBe(true);
  });

  it('goes false when the tab is backgrounded', () => {
    const { result } = renderHook(() => useDocumentVisible());
    act(() => setVisibility('hidden'));
    expect(result.current).toBe(false);
  });

  it('comes back when the tab is foregrounded again', () => {
    const { result } = renderHook(() => useDocumentVisible());
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(result.current).toBe(true);
  });

  it('stops listening on unmount', () => {
    const { result, unmount } = renderHook(() => useDocumentVisible());
    unmount();
    act(() => setVisibility('hidden'));
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/use-document-visible.test.ts`
Expected: FAIL — cannot resolve `@/hooks/use-document-visible`.

- [ ] **Step 3: Implement the hook**

Create `frontend/hooks/use-document-visible.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the document is currently visible.
 *
 * Starts `true` — on the server and on the first client render — and corrects itself in an effect.
 * The asymmetry is the opposite of `useMediaQuery`'s and deliberately so: this gates an animation
 * rather than a mount, and a scene that starts frozen and unfreezes one effect later is a visible
 * stutter every time the inspector opens. Being briefly wrong in a backgrounded tab costs a single
 * frame nobody is looking at.
 */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/use-document-visible.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Put the frame loop on it**

In `frontend/components/3d/f1-hero-scene.tsx`:

Replace the imports at the top with:

```tsx
'use client';

import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useDocumentVisible } from '@/hooks/use-document-visible';
import { PrimitiveCar, RealCar } from './f1-car-model';
```

Add, above `F1HeroSceneProps`:

```tsx
/**
 * Renders one frame whenever `teamColor` changes.
 *
 * Only load-bearing under `frameloop="demand"`, which is the reduced-motion path. R3F's own
 * reconciler already auto-invalidates on any scene-graph mutation — mounting/unmounting Object3D
 * children, which is exactly what the Suspense swap from the primitive fallback to `RealCar` does
 * once the GLB resolves — so that transition needs no help here. What isn't covered is `RealCar`'s
 * imperative `material.color.set(teamColor)`: it mutates an existing Three.js object directly,
 * outside R3F's declarative prop diffing, so nothing invalidates it on its own. Must live inside
 * `<Canvas>`; `useThree` throws outside one.
 */
function Invalidator({ teamColor }: { teamColor: string }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
  }, [invalidate, teamColor]);
  return null;
}
```

Inside the component, above the returned JSX:

```tsx
  const visible = useDocumentVisible();
  const reducedMotion = useReducedMotion() ?? false;

  /*
   * The frame loop, as state.
   *
   * `never` while the tab is backgrounded — spec item 11's "idle on visibilitychange", and the
   * only one of the three that is purely a saving.
   *
   * `demand` under reduced motion, which is the spec's literal `frameloop="demand"` applied in the
   * one case where it is right: the car turns and floats through `useFrame`, so `demand` in the
   * normal case would simply freeze the feature, while continuous rotation is exactly the
   * sustained movement `prefers-reduced-motion` asks to be spared. `Invalidator` is what keeps
   * the still frame correct.
   */
  const frameloop = !visible ? 'never' : reducedMotion ? 'demand' : 'always';
  const motion = { rotationSpeed: reducedMotion ? 0 : 0.3, float: !reducedMotion };
```

Change the `<Canvas>` opening tag to:

```tsx
      <Canvas camera={{ position: [5, 2.5, 5], fov: 45 }} dpr={[1, 2]} shadows frameloop={frameloop}>
```

`dpr={[1, 2]}` is already correct and stays.

Add `<Invalidator teamColor={teamColor} />` as the first child inside `<Canvas>`, and thread the
motion settings into both cars — `HeroFallbackCar` gains a `rotationSpeed`/`float` prop pair rather
than its hardcoded `rotationSpeed={0.3} float`:

```tsx
function HeroFallbackCar({ rotationSpeed, float }: { rotationSpeed: number; float: boolean }) {
  return (
    <PrimitiveCar
      bodyColor="#dc2626"
      sidepodColor="#b91c1c"
      scale={0.8}
      rotationSpeed={rotationSpeed}
      float={float}
      bodyEnvMapIntensity={1.5}
      exhaustEmissiveIntensity={0.2}
    />
  );
}
```

```tsx
        <Suspense fallback={<HeroFallbackCar {...motion} />}>
          <RealCar teamColor={teamColor} scale={1} position={[0, -0.5, 0]} {...motion} />
        </Suspense>
```

Nothing else in the file changes. In particular the lights, the ground plane, the grid helper, the
gradient overlays and the vignette all stay.

- [ ] **Step 6: Verify the scene does not remount when the team changes**

This is the third row of item 11's table and it is a *verification*, not a change. Read, do not edit:

- `frontend/components/teams/teams-page-client.tsx` — the `<InspectModal …>` element carries no
  `key`, so React reconciles it in place.
- `frontend/components/teams/inspect-modal.tsx` — `<F1HeroScene teamColor={team.color} …>` carries
  no `key`.
- `frontend/components/3d/f1-car-model.tsx` — `RealCar`'s `gltf.scene.clone()` stays inside a
  `useMemo` that does **not** list `teamColor`; colour is applied to the cloned materials in an
  effect.

Confirm all three. If any of them has a `key` that would remount on a team change, that is a finding —
report it rather than adding one.

- [ ] **Step 7: Run the suite and check the types**

Run: `mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: green, **~370 passing**. `inspect-modal.test.tsx` still passes because `next/dynamic` with
`ssr: false` never resolves under jsdom — the modal renders its loading fallback and nothing here
touches WebGL.

- [ ] **Step 8: Verify in a browser — both motion modes**

```bash
export PATH="/Users/lawrencecrasto/.local/share/mise/installs/node/24.17.0/bin:$PATH"
ab() { npx --yes agent-browser "$@"; }

ab set viewport 1440 900
ab open http://localhost:3000/teams
ab find role button click --name "Inspect in 3D"
ab wait 3000
ab screenshot /tmp/f1-plan-b/modal-normal.png
ab errors
```

The car must be **visible and turning** (take two screenshots a second apart and confirm the pose
differs). `ab errors` must be empty.

Then the reduced-motion path:

```bash
ab set media reduced-motion
ab reload
ab find role button click --name "Inspect in 3D"
ab wait 3000
ab screenshot /tmp/f1-plan-b/modal-reduced.png
ab errors
```

The car must be **visible and still**, in the livery colour for the team being inspected. R3F's
reconciler auto-invalidates the Suspense swap on its own, so a black or empty canvas here would
point elsewhere (a genuine load or WebGL failure), not at `Invalidator`. What a missing or broken
`Invalidator` actually produces is a wrong colour: `RealCar`'s `material.color.set(teamColor)` runs
outside the reconciler's prop diffing, so under `demand` a livery change would stick at whatever
colour was last drawn until something else triggers a frame. Reset with `ab set media` afterwards.

- [ ] **Step 9: Correct the 3D README, which is stale**

In `frontend/components/3d/README.md`, the **Consumers** line under `F1HeroScene` names
`components/teams/sticky-car-viewer.tsx`. That file no longer exists — the rail's canvas was removed
deliberately. Replace that line with:

```markdown
**Consumer:** `components/teams/inspect-modal.tsx`, and only that. The teams page's right rail
deliberately has **no** canvas: removing it moved the entire `three` / `@react-three/fiber` bundle
off page load and behind the Inspect click. Do not add one back.

**Frame loop.** `frameloop` is state, not a constant: `never` while the document is hidden,
`demand` under `prefers-reduced-motion` — where the car is deliberately still, and the in-canvas
`Invalidator` is what makes the one frame it does draw correct — and `always` otherwise. A literal
`frameloop="demand"` in the normal case would freeze the car, because `RealCar`'s rotation and
float run through `useFrame`.
```

- [ ] **Step 10: Land the CLAUDE.md note**

In `CLAUDE.md`, immediately after the `gltf.scene.clone()` must stay inside `useMemo` paragraph, add:

```markdown
**The 3D scene's `frameloop` is state, and `demand` is not the default for a reason.** `f1-hero-scene.tsx`
is reached from exactly one place — the teams page's Inspect modal — and the right rail deliberately
has no canvas, which is what keeps `three` / `@react-three/fiber` out of the page-load bundle. The
loop is `never` while `document.visibilityState` is not `visible`, `demand` under
`prefers-reduced-motion`, and `always` otherwise. Setting `demand` unconditionally looks like the
obvious optimisation and freezes the car: `RealCar`'s rotation and float run through `useFrame`,
which under `demand` fires only on invalidation. An `Invalidator` component sits inside the
`Canvas` for a narrower reason than it looks: R3F's reconciler already auto-invalidates on any
scene-graph mutation, so the Suspense swap when the GLB resolves needs no help. What actually
requires `Invalidator` is `RealCar`'s imperative `material.color.set(teamColor)`, which mutates an
existing Three.js object outside R3F's prop diffing and so is never auto-invalidated — without it,
a livery change under `demand` would show the wrong colour until the next invalidation.
```

- [ ] **Step 11: Commit**

```bash
git add frontend/hooks/use-document-visible.ts frontend/tests/use-document-visible.test.ts \
        frontend/components/3d/f1-hero-scene.tsx frontend/components/3d/README.md CLAUDE.md
git commit -m "Idle the 3D scene when nobody is looking at it

frameloop becomes state: never while the tab is backgrounded, demand under
prefers-reduced-motion, always otherwise. The spec asks for a literal
frameloop='demand', which taken at face value freezes the car — RealCar's
rotation and float run through useFrame — so demand is applied in the one
case where a still car is the correct answer, and the sustained rotation
stops rather than shortens, which is what reduce asks for.

An Invalidator inside the Canvas draws a frame when the livery changes.
R3F's own reconciler already invalidates on the Suspense swap when the GLB
resolves, so Invalidator isn't covering that; it exists because RealCar's
material.color.set(teamColor) mutates an existing object outside R3F's
prop diffing, which nothing else would invalidate under demand.

dpr=[1,2] was already set and is unchanged. The rail still has no canvas
and must not get one: its absence is what keeps three/@react-three/fiber
off page load. The README claimed a consumer that was deleted with it.

Verified in a browser in both motion modes."
```

---

### Task 7: Give the inspector wrapping prev/next and an explicit index

Existing dialog semantics — `role="dialog"`, `aria-modal`, the focus trap, Escape, focus restore,
body scroll lock, the visible close — are **preserved and hardened, not replaced**. No Radix.

**The modal owns its own index.** It does *not* call the page's `claim`. Paging inside a dialog would
otherwise rewrite the URL, move the rail's highlight and start a 1200ms claim lease against a scroll
spy that cannot see any scrolling, because the body is locked — observer churn the spec's item 15
rules out, in exchange for nothing a user of a dialog asked for.

**Files:**
- Modify: `frontend/components/teams/inspect-modal.tsx`
- Modify: `frontend/components/teams/teams-page-client.tsx`
- Modify: `frontend/tests/inspect-modal.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `InspectModal` with a **changed** prop type —
  `{ teams: Team[]; initialTeamId: string; onClose: () => void }`. The `team` prop is gone.
  `teams-page-client.tsx` is the only caller and is updated in the same task.

- [ ] **Step 1: Write the failing tests**

Replace `frontend/tests/inspect-modal.test.tsx`'s body, **keeping** its existing file-level doc
comment and its resting-neutrals test verbatim — that test was written on 2026-08-11 and this task
extends the file rather than starting over:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { InspectModal } from '@/components/teams/inspect-modal';
import { TEAMS } from '@/data/teams-data';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

function renderModal(initialTeamId = 'ferrari', onClose = vi.fn()) {
  return render(<InspectModal teams={TEAMS} initialTeamId={initialTeamId} onClose={onClose} />);
}

/**
 * The modal pulls the Three.js scene in through `next/dynamic` with `ssr: false`, which under
 * jsdom never resolves — it renders the loading fallback and nothing touches WebGL. That is what
 * makes this component testable at all, and it is why this file asserts only on the chrome
 * around the viewer.
 */
describe('InspectModal', () => {
  it('holds every resting neutral in the modal chrome above AA', () => {
    const { container } = renderModal();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  it('opens on the team it was given', () => {
    renderModal('ferrari');
    expect(screen.getByText('Scuderia Ferrari HP')).toBeInTheDocument();
  });

  // Spelled-out sequence, matching `Team 2 of 11` elsewhere. It is the page's running order, not
  // the championship position, and those disagree from row five down.
  it('says where in the grid it is', () => {
    renderModal('ferrari'); // index 1 of 11 in TEAMS order
    expect(screen.getByText('02 / 11')).toBeInTheDocument();
  });

  it('advances to the next constructor', () => {
    renderModal('mercedes');
    fireEvent.click(screen.getByRole('button', { name: /next constructor/i }));
    expect(screen.getByText('02 / 11')).toBeInTheDocument();
  });

  it('goes back to the previous constructor', () => {
    renderModal('ferrari');
    fireEvent.click(screen.getByRole('button', { name: /previous constructor/i }));
    expect(screen.getByText('01 / 11')).toBeInTheDocument();
  });

  // Wrapping is the spec's decision, so the controls are never disabled and there is never a
  // dead end at either edge.
  it('wraps forward from the last constructor to the first', () => {
    renderModal(TEAMS[TEAMS.length - 1]!.id);
    expect(screen.getByText('11 / 11')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next constructor/i }));
    expect(screen.getByText('01 / 11')).toBeInTheDocument();
  });

  it('wraps backward from the first constructor to the last', () => {
    renderModal(TEAMS[0]!.id);
    fireEvent.click(screen.getByRole('button', { name: /previous constructor/i }));
    expect(screen.getByText('11 / 11')).toBeInTheDocument();
  });

  it('names the constructor each control will reach', () => {
    renderModal('ferrari');
    expect(
      screen.getByRole('button', { name: new RegExp(`next constructor, ${TEAMS[2]!.shortName}`, 'i') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(`previous constructor, ${TEAMS[0]!.shortName}`, 'i') }),
    ).toBeInTheDocument();
  });

  it('pages with the arrow keys', () => {
    renderModal('ferrari');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByText('03 / 11')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByText('02 / 11')).toBeInTheDocument();
  });

  // A dialog's aria-label changing mid-session is not announced, so the team name that changes
  // under the user has to be a live region or a screen-reader user pages blind.
  it('announces the constructor it moved to', () => {
    renderModal('ferrari');
    expect(screen.getByTestId('inspect-team-name')).toHaveAttribute('aria-live', 'polite');
  });

  describe('the dialog semantics it must not lose', () => {
    it('is a modal dialog with a name', () => {
      renderModal('ferrari');
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAccessibleName(/ferrari/i);
    });

    it('closes on Escape', () => {
      const onClose = vi.fn();
      renderModal('ferrari', onClose);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('closes from the visible control', () => {
      const onClose = vi.fn();
      renderModal('ferrari', onClose);
      fireEvent.click(screen.getByRole('button', { name: /close inspector/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it('locks the body while it is open and restores on unmount', () => {
      const { unmount } = renderModal('ferrari');
      expect(document.body.style.overflow).toBe('hidden');
      unmount();
      expect(document.body.style.overflow).not.toBe('hidden');
    });

    // Paging must not re-run the mount effect. If it does, every arrow press re-locks the body
    // and yanks focus back to whatever was focused before the dialog opened.
    it('does not re-lock the body when the constructor changes', () => {
      renderModal('ferrari');
      const button = screen.getByRole('button', { name: /close inspector/i });
      button.focus();
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(button);
      expect(document.body.style.overflow).toBe('hidden');
    });
  });
});
```

Check `TEAMS[1]` really is Ferrari and `TEAMS[2]`'s `shortName` before relying on the index literals
above — `TEAMS` order is document order, not standings order.

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/inspect-modal.test.tsx`
Expected: FAIL — `InspectModal` still takes a `team` prop and has no navigation.

- [ ] **Step 3: Implement the modal**

In `frontend/components/teams/inspect-modal.tsx`:

Extend the imports:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
```

Replace the props interface and the top of the component:

```tsx
interface InspectModalProps {
  teams: Team[];
  /** Which constructor the inspector opens on. Paging from here is the dialog's own business. */
  initialTeamId: string;
  onClose: () => void;
}

/**
 * The 3D inspector.
 *
 * It owns its own index rather than driving the page's active team. Calling `claim` from in here
 * would rewrite the URL, move the nav rail's highlight and open a 1200ms claim lease against a
 * scroll spy that cannot see any scrolling — the body is locked — in exchange for nothing anyone
 * using a dialog asked for. Closing leaves the page exactly where it was.
 */
export function InspectModal({ teams, initialTeamId, onClose }: InspectModalProps) {
  const previousFocusRef = useRef<Element | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [index, setIndex] = useState(() => {
    const found = teams.findIndex((t) => t.id === initialTeamId);
    return found === -1 ? 0 : found;
  });

  const team = teams[index]!;
  const count = teams.length;

  /**
   * Wraps in both directions, so neither control is ever a dead end and neither is ever disabled.
   *
   * Reference-stable across index changes — it closes over `count`, not `index`. That matters more
   * than it looks: it is a dependency of the mount effect below, and an effect that re-ran on every
   * page would re-lock the body and restore focus out of the dialog on each arrow press.
   */
  const go = useCallback(
    (delta: number) => setIndex((i) => (i + delta + count) % count),
    [count],
  );

  const previousTeam = teams[(index - 1 + count) % count]!;
  const nextTeam = teams[(index + 1) % count]!;
```

In the existing `useEffect`, add the two arrow branches immediately after the Escape branch, and add
`go` to the dependency array:

```tsx
      if (e.key === 'ArrowLeft') {
        go(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        go(1);
        return;
      }
```

```tsx
  }, [onClose, go]);
```

Replace the header's right-hand side — the single close `Button` — with the control cluster:

```tsx
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => go(-1)}
              className="h-8 w-8 text-zinc-400 hover:text-white"
              aria-label={`Previous constructor, ${previousTeam.shortName}`}
            >
              <ChevronLeft size={16} />
            </Button>
            <p className="w-14 text-center font-mono text-[11px] tracking-[0.1em] text-zinc-400">
              {`${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`}
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => go(1)}
              className="h-8 w-8 text-zinc-400 hover:text-white"
              aria-label={`Next constructor, ${nextTeam.shortName}`}
            >
              <ChevronRight size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              autoFocus
              className="ml-2 h-8 w-8 text-zinc-400 hover:text-white"
              aria-label="Close inspector"
            >
              <X size={16} />
            </Button>
          </div>
```

And make the header's team name a live region, because a dialog's `aria-label` changing mid-session is
not announced:

```tsx
              <p
                data-testid="inspect-team-name"
                aria-live="polite"
                className="text-sm font-bold uppercase tracking-wider text-white"
              >
                {team.name}
              </p>
```

Everything else stays: the backdrop, the focus trap's `querySelectorAll` (which already matches
`button`, so the new controls are inside the trap for free), the accent line, the scene, and the
bottom info strip.

- [ ] **Step 4: Update the only caller**

In `frontend/components/teams/teams-page-client.tsx`, change:

```tsx
        {inspectOpen && <InspectModal team={TEAM_MAP[activeTeamId]!} onClose={closeInspect} />}
```

to:

```tsx
        {inspectOpen && (
          <InspectModal teams={TEAMS} initialTeamId={activeTeamId} onClose={closeInspect} />
        )}
```

`TEAMS` is already imported in that file. If `TEAM_MAP` becomes unused, `pnpm lint` will say so —
remove it from the import then, and not before.

- [ ] **Step 5: Run to verify it passes**

Run: `mise exec -- pnpm test tests/inspect-modal.test.tsx`
Expected: PASS, 16 tests.

`does not re-lock the body when the constructor changes` is the one to watch. If it fails, `go` has
stopped being reference-stable — check it closes over `count` and not `index`.

- [ ] **Step 6: Confirm the suite and types**

Run: `mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: green, **~385 passing**.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/teams/inspect-modal.tsx frontend/components/teams/teams-page-client.tsx \
        frontend/tests/inspect-modal.test.tsx
git commit -m "Give the inspector wrapping prev/next and an explicit 02 / 11

Arrow keys as well as buttons, and each control names the constructor it
will reach rather than saying only 'next'. Wrapping means neither control
is ever disabled and neither edge is a dead end.

The dialog owns its own index instead of driving the page's claim. Paging
through the page's state would rewrite the URL, move the rail's highlight
and open a 1200ms claim lease against a scroll spy that cannot see any
scrolling, because the body is locked. Closing now leaves the page where it
was.

`go` is deliberately reference-stable across index changes: it is a
dependency of the mount effect, and an effect that re-ran on every page
would re-lock the body and pull focus out of the dialog on each arrow press.
There is a test for exactly that.

The header's team name is a live region — a dialog's aria-label changing
mid-session is not announced, so without it a screen-reader user pages
blind. Everything else is preserved: role, aria-modal, the focus trap
(which already matched button, so the new controls joined it for free),
Escape, focus restore, the body lock and the visible close. No Radix."
```

---

### Task 8: The browser gate

Not optional and not merged into another task. Four review passes on this branch missed a headline bug
because none of them ran a browser, and jsdom lays nothing out: every claim in this plan about
contrast, layout or composited colour is unverified until this task passes.

**Files:**
- Modify: `CLAUDE.md` (only if a finding warrants a note)
- No source changes unless a check fails — in which case the fix belongs in the task that introduced
  it, and this task re-runs.

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: evidence.

- [ ] **Step 1: Set up**

```bash
export PATH="/Users/lawrencecrasto/.local/share/mise/installs/node/24.17.0/bin:$PATH"
ab() { npx --yes agent-browser "$@"; }   # a function, not a variable: zsh does not word-split $AB
mkdir -p /tmp/f1-plan-b
curl -so /dev/null -w '%{http_code}\n' http://localhost:3000/teams   # expect 200; do NOT start a second server
```

Reusable probes from the contrast work are in `/tmp/f1-contrast/` (`measure.sh`, `probe-section.js`,
`analyse2.js`, `probe-logo.js`, `probe-captions.js`). Reuse them rather than rewriting.

- [ ] **Step 2: axe at all three widths — the baseline is zero and must stay zero**

```bash
for w in "1440 900" "1152 800" "390 844"; do
  ab set viewport $w
  ab open http://localhost:3000/teams
  ab eval '[innerWidth, innerHeight]'
  ab a11y --json > /tmp/f1-plan-b/axe-${w// /x}.json
done
```

Assert the viewport echo really changes between runs — a sweep reporting identical numbers at every
width never changed viewport, which has happened here before. Then count `color-contrast` nodes in
each file; the expected value is **0**.

**axe returns *incomplete*, not a violation, for text over a blurred or absolutely positioned
sibling. Never read an incomplete as a pass.** Every one of the tray's and the section's coloured
call sites is exactly that case, so read the `incomplete` array too and measure those by pixel
(Step 4).

- [ ] **Step 3: The compare tray, opened**

```bash
ab set viewport 1440 900
ab open http://localhost:3000/teams
ab find role button click --name "Compare Mercedes"
ab find role button click --name "Compare Ferrari"
ab scrollintoview '[data-testid="compare-tray"]'
ab screenshot /tmp/f1-plan-b/tray-1440.png
ab a11y --selector '[data-testid="compare-tray"]' --json > /tmp/f1-plan-b/axe-tray.json
```

Confirm by eye: two columns side by side, the leading value of each numeric row visibly in that team's
colour, no highlight on Power Unit / Base / Drivers, and the Clear button works. Then repeat at
`390 844` and confirm the tray **stacks** — label, then each value under it carrying its team's name —
rather than squeezing two columns into a phone.

Then the tie case, which is the one that silently highlights the wrong thing:

```bash
ab open http://localhost:3000/teams
ab find role button click --name "Compare Cadillac"
ab find role button click --name "Compare Audi"
ab scrollintoview '[data-testid="compare-tray"]'
ab screenshot /tmp/f1-plan-b/tray-tie.png
```

Neither Titles value may be highlighted.

- [ ] **Step 4: Pixel ground truth on the tray's coloured text**

axe cannot judge these, so measure them. Hide **only the glyphs**, screenshot, and read the pixel
behind them:

```bash
ab eval 'document.querySelectorAll("[data-testid^=compare-value-]").forEach(e => e.style.visibility = "hidden")'
ab screenshot /tmp/f1-plan-b/tray-behind.png
sips -s format bmp /tmp/f1-plan-b/tray-behind.png --out /tmp/f1-plan-b/tray-behind.bmp
```

A 24-bit BMP is trivially indexable from node. The pixel behind a leading value must match
`trayValueBackdrop()` — `#121215` — to within Chrome's blend rounding (a unit or two per channel is
expected; the rail measured one unit of blue off). If it is materially different, the tray's authored
`bg-zinc-900/60` and `TRAY_FILL`/`TRAY_ALPHA` have drifted apart and **Task 1's constants are wrong,
not the test**.

Two traps in this method: an element carrying its own `background-color` disappears along with its
text, and `TextAnimate` renders an `sr-only` copy beside painted `aria-hidden` spans — hiding the
accessible copy measures the visible glyphs and reports 1:1. Neither applies to the tray's values,
but both apply elsewhere on this page.

- [ ] **Step 5: The modal, open, at 1440x900**

```bash
ab open http://localhost:3000/teams
ab find role button click --name "Inspect in 3D"
ab wait 3000
ab screenshot /tmp/f1-plan-b/modal-1440.png
ab a11y --json > /tmp/f1-plan-b/axe-modal.json
ab press ArrowRight
ab press ArrowRight
ab screenshot /tmp/f1-plan-b/modal-paged.png
ab press Escape
ab errors
```

Confirm: the index reads `02 / 11` then advances, the car recolours **without the canvas blanking or
remounting** (a flash to empty and back is the remount this task is checking for), Escape closes, and
`color-contrast` violations in `axe-modal.json` are **0**. `ab errors` must be empty.

- [ ] **Step 6: The breakpoints Plan A established, unbroken**

At `1152 800`, confirm all three still hold — this plan touches the comparison grid and the modal,
both of which live inside that layout:

```bash
ab set viewport 1152 800
ab open http://localhost:3000/teams
ab get count '[aria-label="Team dossier"]'            # expect 0 — dossier unmounted
ab get count 'button[aria-label*="Inspect"], button'  # then confirm 11 "Inspect in 3D" buttons
ab get box 'nav[aria-label="Constructors"]'           # expect width 199
```

- [ ] **Step 7: Reduced motion**

```bash
ab set media reduced-motion
ab open http://localhost:3000/teams
ab eval 'getComputedStyle(document.documentElement).scrollBehavior'   # expect "auto"
ab screenshot /tmp/f1-plan-b/reduced-hero.png
```

The hero's looping chevron must be absent, `scroll-behavior` must be `auto`, and the compare tray must
still open and be readable. Reset with `ab set media` when done.

- [ ] **Step 8: The hero, at speed**

Reload at 1440x900 and screenshot at ~0.4s and ~1.1s. Everything — badge, title, subtitle, CTA,
livery wall, scroll cue — must be present in the second shot. If anything is still arriving after a
second, `HERO_TIMING` and the component have drifted apart.

- [ ] **Step 9: Final suite, types and lint**

```bash
cd frontend && mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint
```

Expected: **~385 passing**, clean, clean.

- [ ] **Step 10: Record what was measured**

Write the numbers — axe counts per viewport, the pixel behind the tray value, the test count — into
the completion report. **Do not claim any of them without the command output in hand.** If a check
fails, fix it in the task that introduced it and re-run this one from Step 2; do not patch around it
here.

- [ ] **Step 11: Commit only if a note is warranted**

If nothing changed, there is nothing to commit — the evidence goes in the report. If a finding
produced a CLAUDE.md note:

```bash
git add CLAUDE.md
git commit -m "docs: record <the finding>, measured in a browser"
```

---

## Self-review

**Spec coverage.**

| Spec clause | Task |
|---|---|
| Item 7 — bar race becomes a two-slot selector | 3 |
| Item 7 — tray lays two constructors out over championship, titles, power unit, base, first entry, drivers | 2 |
| Item 7 — leading value of a numeric row highlighted | 2 |
| Item 7 — non-numeric rows get no highlight | 2 |
| Item 7 — tray stacks below `lg` | 2, verified in 8 |
| Item 7 — sort tabs stay at three | 3 (asserted, not merely left alone) |
| Item 8 — CTA becomes "Explore 11 Constructors" | 4 |
| Item 8 — existing stagger tightened | 4 |
| Item 8 — no new parallax | 4 (stated as a non-change) |
| Item 9 — gradient space around the portraits rebalanced | 1, 5 |
| Item 11 — `frameloop`, idle on `visibilitychange` | 6 |
| Item 11 — `dpr={[1,2]}` kept | 6 (unchanged, stated) |
| Item 11 — no remount on team change | 6, Step 6 (verification) |
| Item 11 — rail keeps no canvas | 6 (preserved, documented in two places) |
| Item 12 — wrapping prev/next | 7 |
| Item 12 — explicit `02 / 11` | 7 |
| Item 12 — dialog semantics preserved and hardened, no Radix | 7 |
| Item 15 — no backend, no new deps, no new global state, no observer churn | Global Constraints + 3, 7 |
| CLAUDE.md notes land with the code | 1, 6 |

**Type consistency.** `trayValueColor` / `trayValueBackdrop` / `TRAY_FILL` / `TRAY_ALPHA` /
`PORTRAIT_DISSOLVE_ALPHA` / `portraitDissolve` are defined in Task 1 and used under those exact names
in Tasks 2 and 5. `COMPARE_FIELDS`, `CompareField`, `leaderIndex` and `TeamsCompareTray`'s props are
defined in Task 2 and consumed under those names in Task 3. `useDocumentVisible` is defined in Task 6
and used only there. `InspectModal`'s prop change in Task 7 updates its only caller in the same task.

**Deviations from the spec, both deliberate and both argued in place:**

1. **`frameloop="demand"` is conditional, not constant** (Task 6). Constant `demand` freezes a car
   whose rotation runs through `useFrame`. Applied under reduced motion, where a still car is the
   correct answer.
2. **The modal owns its index rather than driving the page's `claim`** (Task 7). The spec settles
   *wrapping*, not ownership; driving `claim` from a scroll-locked dialog is observer churn item 15
   rules out.

**Judgement calls the spec leaves open, decided here:** a third compare pick drops the older of the
two rather than being ignored (Task 3); `First Entry`'s leader is the earlier debut, matching the
Since tab (Task 2); a tie highlights neither value (Task 2).
