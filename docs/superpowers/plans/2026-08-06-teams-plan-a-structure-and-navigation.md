# /teams Plan A — structure and navigation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/teams` navigable and unambiguous — one scroll spy instead of eleven, real anchor links with hash support, three columns at three honest breakpoints, and a single labelled numbering scheme — without touching the page's visual ambition.

**Architecture:** Three new hooks each own one question (which section is active / what the URL says / is the viewport wide enough), so `teams-page-client.tsx` becomes a wiring layer rather than a state owner. Navigation becomes native `<a href="#team-id">` plus CSS `scroll-margin-top`, which removes all scroll arithmetic from JavaScript. The mobile chip strip is extracted out of `teams-nav-rail.tsx` because it now needs behaviour the desktop rail must not have.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind, `motion` v12, Vitest 4 + jsdom + Testing Library 16.

**Spec:** [`docs/superpowers/specs/2026-08-06-teams-navigation-and-comparison-design.md`](../specs/2026-08-06-teams-navigation-and-comparison-design.md)

**Brief items covered:** 1, 2, 3, 4, 5, 6, 10, 13, 14. Items 7, 8, 9, 11, 12 are Plan B and must not be started here. Item 15 is a constraint, below.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Where you are working.** The worktree is `.claude/worktrees/teams-column-roles`, branch `feat/teams-navigation-and-perf`, which sits at `main`. All paths below are relative to that worktree. The *parent* checkout is on a stale branch with unrelated uncommitted backend work — never run git commands against it.

**Commands.** All from `frontend/`. `node` and `pnpm` are **not on PATH** — always prefix with `mise exec --`:

```bash
mise exec -- pnpm test        # vitest run
mise exec -- pnpm typecheck   # tsc --noEmit
mise exec -- pnpm lint        # ESLint
```

Do **not** run `pnpm build` — a dev server may be running and they share `.next`.

**Baseline.** 199 tests passing across 16 files at the start of this plan. **This number will go down before it goes up, and that is correct.** Four suites assert behaviour this plan deliberately removes. Each task states its own expected test delta. Never "fix" a red test by restoring deleted behaviour.

**Git.** Other agents work this repo concurrently. **Stage explicit paths — never `git add -A` or `git add .`.** `gh pr create` fails here (gh identity vs repo owner); `git push` works.

**Repo conventions (from CLAUDE.md):**
- File names **kebab-case, no exceptions**. Component names stay PascalCase.
- **Named exports.** No default exports outside `app/`.
- `Team` and `Driver` import from `@/data/teams-data`, **not** `@/types`.
- Hooks live in `hooks/`, `use-` prefix. `hooks` is already in `next.config.js`'s `eslint.dirs`; no new top-level directory is added by this plan, so that list needs no edit.
- Tests are **flat** in `frontend/tests/`, never mirroring the source tree.
- `components/ui/` is generated — **never hand-edit**.
- No `any`.

**Motion rules:**
- Animate **only `transform` and `opacity`**. Never `width`, `height`, `top`, `left`, `margin`.
- **Never `transition: all`** — always name exact properties.
- Springs are `{ type: 'spring', duration: 0.3, bounce: 0 }`. `bounce` is always `0`.
- Press feedback is exactly `scale(0.96)`.
- `reducedMotion` is threaded from `TeamsPageClient` into every child. Reduced motion must **stop** continuous or disorienting movement, not merely zero a duration.

**Colour rules:**
- Team colour carrying **text** goes through `lib/team-utils.ts`. Never raw `team.color` on text.
- Team colour that is **decorative** — glows, bars, the livery wall, keylines wider than a hairline — keeps the true brand hex. A livery wall in lightened colours is no longer a livery wall.

**Item 15, as a constraint on every task:** no backend calls, no new runtime data fetching, the existing server/client boundary stands, no new global state library, no new dependencies, no layout shift, no observer churn, no needless remounts.

**Do not touch:** `backend/`, `components/ui/`, `components/3d/`, `next.config.js`, `data/teams-data.ts`, `inspect-modal.tsx`, `teams-hero.tsx`, or `driver-portrait.tsx`. The last three are Plan B.

---

## File Structure

| File | Responsibility |
|---|---|
| `hooks/use-scroll-spy.ts` | **Create.** Which section is active. One observer, deterministic winner, click-claims-then-reconciles |
| `hooks/use-team-navigation.ts` | **Create.** What the URL says. Hash restore, `popstate`, `replaceState` on scroll |
| `hooks/use-media-query.ts` | **Create.** A `matchMedia` subscription, SSR-safe |
| `components/teams/teams-chip-strip.tsx` | **Create.** Extracted mobile chips: anchors, auto-centring, edge fades |
| `components/teams/teams-nav-rail.tsx` | **Modify.** Desktop only. Anchors, labelled header, index numeral deleted |
| `components/teams/team-section.tsx` | **Modify.** Observer removed, standing line added, `scroll-mt`, Inspect flips to `xl:hidden` |
| `components/teams/sticky-team-panel.tsx` | **Modify.** Portraits removed, championship block added, counter spelled out |
| `components/teams/teams-comparison-grid.tsx` | **Modify.** Rows become anchors, leading numeral relabelled as sort rank |
| `components/teams/teams-page-client.tsx` | **Modify.** Wires the three hooks; dossier mounts at `xl` |
| `lib/team-utils.ts` | **Modify.** Adds `onColor`, `needsDamping`, `ringOnDark`; generalises the `isWhite` branch |
| `app/globals.css` | **Modify.** Scroll offset custom property + `scroll-behavior` |
| `tests/setup.ts` | **Modify.** Adds `scrollIntoView`, `scrollTo`, `matchMedia` stubs |
| `CLAUDE.md` | **Modify.** Notes land with the code that makes them true |

---

### Task 1: Land the one CLAUDE.md note that is already true

Independent of everything else. The spec calls for it to land first and alone, because it documents `main`'s behaviour today rather than anything this plan builds.

**Files:**
- Modify: `CLAUDE.md` (the `### Frontend tests` bullet list)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Documentation only.

- [ ] **Step 1: Add the note**

In `CLAUDE.md`, find the `### Frontend tests` section. Change the lead-in sentence from `Three things about them are not guessable:` to `A few things about them are not guessable:`, then append this bullet after the existing `tests/setup.ts stubs IntersectionObserver` bullet:

```markdown
- **`AnimatePresence mode="wait"` makes content untestable.** The incoming child is held back
  behind the outgoing one's exit animation, which never resolves synchronously under jsdom, so
  `getByRole` finds nothing. Use it for swaps nobody asserts on; anywhere a test needs the new
  content, render conditionally instead.
```

- [ ] **Step 2: Verify nothing else changed**

Run: `git diff --stat CLAUDE.md`
Expected: `1 file changed`, roughly `6 insertions(+), 1 deletion(-)`. No other file listed.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record that AnimatePresence mode=wait hides content from jsdom

sticky-team-panel.tsx already wraps its team swap in mode=\"wait\", so any
test that renders it and reaches for the incoming team finds nothing. True
of main today; recorded before the work that will depend on knowing it."
```

---

### Task 2: Teach jsdom the three DOM APIs this page is about to call

`tests/setup.ts` stubs `IntersectionObserver` only. This plan makes the page call `scrollIntoView` (chip centring), `scrollTo`, and `matchMedia` (dossier mounting). jsdom implements none of them, and the failure mode is a confusing throw from inside a component rather than a clear message.

**Files:**
- Modify: `frontend/tests/setup.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a jsdom environment where `Element.prototype.scrollIntoView`, `window.scrollTo` and `window.matchMedia` exist. Every later task's tests rely on this. `matchMedia` reports **no match** by default; tests that need a wide viewport override it per-test.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/setup-stubs.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

// These are environment gaps, not app code. They are asserted because a missing stub
// surfaces as a throw from deep inside a component, which reads like an app bug.
describe('jsdom stubs installed by tests/setup.ts', () => {
  it('gives every element a scrollIntoView', () => {
    const el = document.createElement('div');
    expect(typeof el.scrollIntoView).toBe('function');
    expect(() => el.scrollIntoView({ inline: 'center' })).not.toThrow();
  });

  it('gives window a scrollTo', () => {
    expect(typeof window.scrollTo).toBe('function');
    expect(() => window.scrollTo({ top: 0 })).not.toThrow();
  });

  it('gives window a matchMedia that reports no match by default', () => {
    const mql = window.matchMedia('(min-width: 1280px)');
    expect(mql.matches).toBe(false);
    expect(mql.media).toBe('(min-width: 1280px)');
  });

  it('lets a matchMedia listener be added and removed without throwing', () => {
    const mql = window.matchMedia('(min-width: 1280px)');
    const listener = vi.fn();
    expect(() => mql.addEventListener('change', listener)).not.toThrow();
    expect(() => mql.removeEventListener('change', listener)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `mise exec -- pnpm test tests/setup-stubs.test.ts`
Expected: FAIL. `scrollIntoView` and `matchMedia` are not functions in jsdom.

- [ ] **Step 3: Add the stubs**

Append to `frontend/tests/setup.ts`:

```ts
/**
 * jsdom implements no scrolling and no media queries. The teams page calls all three of
 * these — `scrollIntoView` to centre the active mobile chip, `scrollTo` via anchor
 * navigation, and `matchMedia` to decide whether to mount the sticky dossier at all.
 *
 * `matchMedia` reports **no match**, so components take their narrow-viewport branch
 * unless a test says otherwise. That is the safer default: the dossier stays unmounted
 * and tests assert what a phone actually renders. A test that wants the wide layout
 * overrides `window.matchMedia` itself.
 */
Element.prototype.scrollIntoView = function scrollIntoView(): void {};

window.scrollTo = function scrollTo(): void {};

window.matchMedia = function matchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList;
};
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `mise exec -- pnpm test tests/setup-stubs.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Confirm nothing regressed**

Run: `mise exec -- pnpm test`
Expected: **203 passed** (199 baseline + 4 new). No failures.

- [ ] **Step 6: Extend the CLAUDE.md stubs note**

In `CLAUDE.md`, find the `tests/setup.ts` stubs `IntersectionObserver` bullet and append to it:

```markdown
  It also stubs `scrollIntoView`, `scrollTo`, and `matchMedia` for the same reason — the teams
  page calls all three, and jsdom implements none of them. `matchMedia` reports no match, so
  components take their narrow branch unless a test overrides it.
```

- [ ] **Step 7: Commit**

```bash
git add frontend/tests/setup.ts frontend/tests/setup-stubs.test.ts CLAUDE.md
git commit -m "test: stub the three DOM APIs jsdom lacks and /teams is about to call

scrollIntoView, scrollTo and matchMedia. matchMedia reports no match so
components take their narrow-viewport branch by default, which keeps the
sticky dossier unmounted unless a test asks for it."
```

---

### Task 3: Generalise the colour layer's one-off white special case

`teamColorButtonStyle` tests `team.color === '#ffffff'` — an equality check against one team's hex. It only ever covered Haas. This replaces it with a luminance predicate that covers any near-white livery, and adds the two derived colours the rest of the plan needs.

**Files:**
- Modify: `frontend/lib/team-utils.ts`
- Test: `frontend/tests/team-utils.test.ts`

**Interfaces:**
- Consumes: existing `contrastRatio`, `DARK_BG`, `MIN_CONTRAST` from `lib/team-utils.ts`.
- Produces, all from `@/lib/team-utils`:
  - `MIN_RING_CONTRAST: number` — `3`, WCAG 2.1 non-text contrast.
  - `needsDamping(hex: string): boolean` — true when a fill is too bright to sit in a dark UI.
  - `onColor(fill: string): string` — `'#000000'` or `'#ffffff'`, whichever reads better **on** `fill`.
  - `ringOnDark(hex: string): string` — the livery colour lifted until it clears `MIN_RING_CONTRAST` against `DARK_BG`. Task 7 and Task 8 use this for focus rings.
  - `teamColorButtonStyle(team)` keeps its existing `{ style, className }` shape. Callers in `sticky-team-panel.tsx` and `team-section.tsx` need no change.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/team-utils.test.ts`. Add `MIN_RING_CONTRAST`, `needsDamping`, `onColor` and `ringOnDark` to the existing import from `@/lib/team-utils`, then:

```ts
describe('needsDamping', () => {
  it('damps a literally white livery', () => {
    expect(needsDamping('#ffffff')).toBe(true);
  });

  it('leaves every other livery on the grid undamped', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      if (team.color === '#ffffff') continue;
      expect(needsDamping(team.color), `${team.shortName} ${team.color}`).toBe(false);
    }
  });

  // The point of the predicate: it is not an equality check against one hex, so a future
  // near-white livery is caught without anyone remembering to add a special case.
  it('catches a near-white livery that is not exactly #ffffff', () => {
    expect(needsDamping('#fafafa')).toBe(true);
  });
});

describe('onColor', () => {
  it('picks black on a light fill and white on a dark one', () => {
    expect(onColor('#ffffff')).toBe('#000000');
    expect(onColor('#dc0000')).toBe('#ffffff');
  });

  // The property that matters: whatever it picks must actually be readable on that fill.
  // A mid-tone fill where neither black nor white reaches AA would be a real finding.
  it('clears AA on the fill it was given, for every fill this page uses', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const fill = needsDamping(team.color) ? '#27272a' : team.color;
      expect(
        contrastRatio(onColor(fill), fill),
        `${team.shortName} text on ${fill}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe('ringOnDark', () => {
  it('clears non-text contrast against the page background for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      expect(
        contrastRatio(ringOnDark(team.color), DARK_BG),
        `${team.shortName} ring ${ringOnDark(team.color)}`,
      ).toBeGreaterThanOrEqual(MIN_RING_CONTRAST);
    }
  });

  // A ring is not text. Holding it to 4.5:1 would lighten liveries further than they need
  // to go and wash the brand out for no accessibility gain.
  it('is a lower bar than the text variant, so it lifts colours less', () => {
    expect(MIN_RING_CONTRAST).toBeLessThan(MIN_CONTRAST);
    const navy = '#2b4562';
    expect(contrastRatio(ringOnDark(navy), DARK_BG)).toBeLessThan(
      contrastRatio(readableOnDark(navy), DARK_BG),
    );
  });

  it('leaves a colour that already clears the bar untouched', () => {
    expect(ringOnDark('#ffffff')).toBe('#ffffff');
  });
});

describe('teamColorButtonStyle after generalisation', () => {
  it('still damps Haas and keeps its keyline', () => {
    const haas = teamColorButtonStyle(TEAM_MAP['haas']!);
    expect(haas.className).toBe('border');
    expect(haas.style.backgroundColor).toBe('#27272a');
  });

  it('fills with the true livery for an undamped team', () => {
    const ferrari = teamColorButtonStyle(TEAM_MAP['ferrari']!);
    expect(ferrari.style.backgroundColor).toBe('#dc0000');
    expect(ferrari.className).toBe('');
  });

  // Derived from the fill, not read from the hand-authored textOnColor field.
  it('derives its label colour so every team’s CTA is readable', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const { style } = teamColorButtonStyle(team);
      expect(
        contrastRatio(style.color, style.backgroundColor),
        `${team.shortName} CTA label`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/team-utils.test.ts`
Expected: FAIL — `needsDamping`, `onColor`, `ringOnDark`, `MIN_RING_CONTRAST` are not exported.

- [ ] **Step 3: Implement**

In `frontend/lib/team-utils.ts`, add after the `MIN_CONTRAST` declaration:

```ts
/**
 * WCAG 2.1 non-text contrast, for UI boundaries rather than glyphs — focus rings above all.
 * Deliberately lower than `MIN_CONTRAST`: a ring is not text, and holding it to the text bar
 * would lighten the darker liveries further than they need to go for no gain.
 */
export const MIN_RING_CONTRAST = 3;

/**
 * Fills above this relative luminance read as blown-out against `zinc-950` and get damped
 * to a neutral before being used as a surface.
 *
 * This replaces a `team.color === '#ffffff'` equality check that only ever covered Haas.
 * The failure it guards against is aesthetic rather than a contrast one — white text on a
 * white button is unreadable, but so is a white button in a page this dark, whatever the
 * label does — so it is expressed as a property of the colour, not a list of hexes.
 */
const MAX_FILL_LUMINANCE = 0.75;

/** Whether a livery is too bright to use as a surface in this dark UI. */
export function needsDamping(hex: string): boolean {
  return relativeLuminance(hex) > MAX_FILL_LUMINANCE;
}

/** Black or white, whichever reads better **on top of** `fill`. */
export function onColor(fill: string): string {
  return contrastRatio('#000000', fill) >= contrastRatio('#ffffff', fill) ? '#000000' : '#ffffff';
}

const ringCache = new Map<string, string>();

/**
 * A team colour lifted just far enough to serve as a focus ring on `zinc-950`.
 *
 * Same lightness walk as `readableOnDark`, held to `MIN_RING_CONTRAST` instead of the text
 * bar, so the ring still reads as the brand colour rather than as a lightened wash of it.
 */
export function ringOnDark(hex: string): string {
  const cached = ringCache.get(hex);
  if (cached) return cached;

  let result = hex;
  if (contrastRatio(hex, DARK_BG) < MIN_RING_CONTRAST) {
    const [h, s, l] = rgbToHsl(parseHex(hex));
    result = '#ffffff';
    for (let step = l; step <= 1; step += 0.01) {
      const candidate = toHex(hslToRgb(h, s, Math.min(step, 1)));
      if (contrastRatio(candidate, DARK_BG) >= MIN_RING_CONTRAST) {
        result = candidate;
        break;
      }
    }
  }

  ringCache.set(hex, result);
  return result;
}
```

`relativeLuminance`, `rgbToHsl`, `parseHex`, `toHex` and `hslToRgb` are already defined in this file as module-private helpers. `needsDamping` and `ringOnDark` are declared **after** them in source order, which is fine — these are function declarations and are hoisted. Do not export the private helpers.

Then replace `teamColorButtonStyle` at the top of the file:

```ts
/**
 * Inline style + extra className for a team-colour-filled CTA.
 *
 * The fill is the true livery unless it is too bright for a dark UI, in which case it is
 * damped to a neutral and given a keyline so the button still has an edge. The label colour
 * is **derived from the fill it actually got**, not read from `team.textOnColor` — a damped
 * fill is no longer the team's colour, so the authored value would be describing the wrong
 * surface.
 */
export function teamColorButtonStyle(team: Team) {
  const damped = needsDamping(team.color);
  const fill = damped ? '#27272a' : team.color;
  return {
    style: {
      backgroundColor: fill,
      color: onColor(fill),
      borderColor: damped ? '#52525b' : 'transparent',
    },
    className: damped ? 'border' : '',
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/team-utils.test.ts`
Expected: PASS.

If the "clears AA on the fill" test fails for a specific team, that is a genuine finding about that livery, not a bug in `onColor` — stop and report it rather than loosening the assertion.

- [ ] **Step 5: Confirm the suite and types**

Run: `mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all green. Test count rises to **~215**. `team-monogram-tile.tsx` still reads `team.textOnColor` and is intentionally left alone — that field is still live and is not this task's business.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/team-utils.ts frontend/tests/team-utils.test.ts
git commit -m "Generalise the colour layer's white special case into a luminance test

teamColorButtonStyle compared team.color to '#ffffff', which only ever
covered Haas. needsDamping() asks whether a fill is too bright for a dark
UI, so a future near-white livery is handled without anyone adding a case.
The label colour is now derived from the fill the button actually got
rather than read from textOnColor, which describes the undamped colour.

Adds ringOnDark() at WCAG non-text contrast for the focus rings in the
next tasks."
```

---

### Task 4: One scroll spy to replace eleven

**Files:**
- Create: `frontend/hooks/use-scroll-spy.ts`
- Test: `frontend/tests/use-scroll-spy.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except Task 2's environment.
- Produces, from `@/hooks/use-scroll-spy`:
  - `pickActive(ids: string[], covered: Map<string, number>): string | null` — pure. Winner is the id with the greatest covered value; ties go to the earlier entry in `ids`; `null` when nothing is covered.
  - `CLAIM_TIMEOUT_MS: number` — `1200`.
  - `useScrollSpy(ids: string[]): { activeId: string; claim: (id: string) => void }`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/use-scroll-spy.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { pickActive, useScrollSpy, CLAIM_TIMEOUT_MS } from '@/hooks/use-scroll-spy';

// The winner selection is pure and tested directly. jsdom performs no layout, so an
// end-to-end test of the hook's geometry would assert only what the fake observer was
// told to say — which is worth nothing.
describe('pickActive', () => {
  const ids = ['a', 'b', 'c'];

  it('picks the id covering most of the band', () => {
    expect(pickActive(ids, new Map([['a', 10], ['b', 90]]))).toBe('b');
  });

  it('returns null when nothing covers the band', () => {
    expect(pickActive(ids, new Map())).toBeNull();
    expect(pickActive(ids, new Map([['a', 0], ['b', 0]]))).toBeNull();
  });

  // Two adjacent sections taller than the viewport cover the band equally at the exact
  // boundary. Without a deterministic tiebreak that is the flicker the old per-section
  // observers produced.
  it('breaks ties by document order', () => {
    expect(pickActive(ids, new Map([['b', 50], ['c', 50]]))).toBe('b');
    expect(pickActive(['c', 'b', 'a'], new Map([['b', 50], ['c', 50]]))).toBe('c');
  });

  it('ignores ids it was not given', () => {
    expect(pickActive(ids, new Map([['zzz', 999], ['a', 1]]))).toBe('a');
  });
});

/** Captures the observer the hook constructs so a test can drive it. */
class FakeObserver implements IntersectionObserver {
  static latest: FakeObserver | null = null;
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  readonly observed: Element[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.latest = this;
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  /** Report a section as covering `height` px of the activation band. */
  report(entries: { id: string; height: number }[]): void {
    this.callback(
      entries.map(
        ({ id, height }) =>
          ({
            target: document.getElementById(`team-${id}`)!,
            intersectionRect: { height } as DOMRectReadOnly,
            isIntersecting: height > 0,
          }) as IntersectionObserverEntry,
      ),
      this as IntersectionObserver,
    );
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const IDS = ['mercedes', 'ferrari', 'mclaren'];

function mountSections(): void {
  document.body.innerHTML = IDS.map((id) => `<section id="team-${id}"></section>`).join('');
}

describe('useScrollSpy', () => {
  let original: typeof globalThis.IntersectionObserver;

  beforeEach(() => {
    mountSections();
    original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.IntersectionObserver = original;
    FakeObserver.latest = null;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('starts on the first id', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    expect(result.current.activeId).toBe('mercedes');
  });

  it('observes every section exactly once', () => {
    renderHook(() => useScrollSpy(IDS));
    expect(FakeObserver.latest!.observed).toHaveLength(3);
  });

  it('follows the observer when nothing has been claimed', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      FakeObserver.latest!.report([{ id: 'mclaren', height: 120 }]);
    });
    expect(result.current.activeId).toBe('mclaren');
  });

  // Feedback must not wait for an observer. This is brief item 5's first half.
  it('claims immediately on click', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      result.current.claim('mclaren');
    });
    expect(result.current.activeId).toBe('mclaren');
  });

  it('ignores the observer while a claim is outstanding', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      result.current.claim('mclaren');
    });
    // Mid-flight through the smooth scroll the band is still covered by earlier sections.
    act(() => {
      FakeObserver.latest!.report([{ id: 'ferrari', height: 300 }]);
    });
    expect(result.current.activeId).toBe('mclaren');
  });

  // The observer owns the state again once it agrees — the claim is a lease, not a lock.
  it('hands control back as soon as the observer agrees with the claim', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      result.current.claim('mclaren');
    });
    act(() => {
      FakeObserver.latest!.report([{ id: 'mclaren', height: 400 }]);
    });
    act(() => {
      FakeObserver.latest!.report([{ id: 'ferrari', height: 400 }, { id: 'mclaren', height: 0 }]);
    });
    expect(result.current.activeId).toBe('ferrari');
  });

  // A short final section may never cover the band, so agreement may never arrive. Without
  // the timeout the spy would be frozen on the claimed id for the rest of the page's life.
  it('releases the claim on a timeout even if the observer never agrees', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      result.current.claim('mclaren');
    });
    act(() => {
      vi.advanceTimersByTime(CLAIM_TIMEOUT_MS + 1);
    });
    act(() => {
      FakeObserver.latest!.report([{ id: 'ferrari', height: 200 }]);
    });
    expect(result.current.activeId).toBe('ferrari');
  });

  it('does not blank the active id when the band is briefly uncovered', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      FakeObserver.latest!.report([{ id: 'mclaren', height: 120 }]);
    });
    act(() => {
      FakeObserver.latest!.report([{ id: 'mclaren', height: 0 }]);
    });
    expect(result.current.activeId).toBe('mclaren');
  });

  it('disconnects on unmount', () => {
    const spy = vi.spyOn(FakeObserver.prototype, 'disconnect');
    const { unmount } = renderHook(() => useScrollSpy(IDS));
    unmount();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/use-scroll-spy.test.ts`
Expected: FAIL — cannot resolve `@/hooks/use-scroll-spy`.

- [ ] **Step 3: Implement**

Create `frontend/hooks/use-scroll-spy.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How long a click's claim on the active id survives without the observer confirming it.
 *
 * The claim normally ends when the observer independently agrees. That agreement is not
 * guaranteed: a section shorter than the activation band — the last one, most likely —
 * may never cover enough of it to win. Without this ceiling the spy would stay frozen on
 * the claimed id for the rest of the page's life.
 */
export const CLAIM_TIMEOUT_MS = 1200;

/**
 * Top of the activation band, as a fraction of viewport height. Matches the `scroll-mt`
 * offset in `app/globals.css` closely enough that a section which has just been scrolled
 * to lands inside the band.
 */
const BAND_TOP = 0.08;

/** Bottom of the activation band, as a fraction of viewport height. */
const BAND_BOTTOM = 0.38;

/**
 * The id covering most of the activation band. Ties go to the earlier entry in `ids`, so
 * the winner is deterministic when two sections cover the band equally.
 *
 * Pure and exported for its own test: jsdom performs no layout, so this is the only part
 * of the spy that can be tested against real numbers rather than against a fake.
 */
export function pickActive(ids: string[], covered: Map<string, number>): string | null {
  let best: string | null = null;
  let bestValue = 0;
  for (const id of ids) {
    const value = covered.get(id) ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = id;
    }
  }
  return best;
}

/**
 * Tracks which of `ids` is the active section, using **one** observer for all of them.
 *
 * Eleven per-section observers firing on `isIntersecting` fight at every boundary, because
 * the sections are taller than the viewport and adjacent: two of them are always
 * intersecting, and whichever fired last wins. Instead the root is shrunk to a narrow band
 * near the top of the viewport via `rootMargin`, and the winner is whichever section covers
 * most of that band.
 *
 * `claim(id)` sets the active id at once and suppresses the observer, because click feedback
 * must not wait for a scroll to happen. The suppression is a lease: it lifts the moment the
 * observer's own winner agrees, or after `CLAIM_TIMEOUT_MS`, whichever comes first. The
 * observer still owns the state.
 */
export function useScrollSpy(ids: string[]): {
  activeId: string;
  claim: (id: string) => void;
} {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? '');

  const coveredRef = useRef<Map<string, number>>(new Map());
  const claimedRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  // Read inside the observer callback, which must not be re-created when ids change identity.
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const releaseClaim = useCallback(() => {
    claimedRef.current = null;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const claim = useCallback(
    (id: string) => {
      setActiveId(id);
      claimedRef.current = id;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(releaseClaim, CLAIM_TIMEOUT_MS);
    },
    [releaseClaim],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace(/^team-/, '');
          coveredRef.current.set(id, entry.intersectionRect.height);
        }

        const winner = pickActive(idsRef.current, coveredRef.current);
        // Nothing covers the band — between sections, or mid-hero. Keep the last answer
        // rather than blanking, which would clear the rail's highlight for a frame.
        if (winner === null) return;

        if (claimedRef.current !== null) {
          if (winner === claimedRef.current) releaseClaim();
          return;
        }

        setActiveId(winner);
      },
      {
        rootMargin: `-${BAND_TOP * 100}% 0px -${(1 - BAND_BOTTOM) * 100}% 0px`,
        // Every crossing of the band edge must be reported, not just full entry, or a
        // section taller than the band would never fire at all.
        threshold: [0, 0.01, 0.5, 1],
      },
    );

    for (const id of ids) {
      const el = document.getElementById(`team-${id}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
    // `ids` is a stable module-level array in practice; joined so a genuine change re-observes.
  }, [ids, releaseClaim, ids.join(',')]);

  useEffect(() => releaseClaim, [releaseClaim]);

  return { activeId, claim };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/use-scroll-spy.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Lint and typecheck**

Run: `mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: green. If ESLint objects to `ids.join(',')` in the dependency array, replace the whole array with `[ids, releaseClaim]` and add a one-line comment saying `ids` is module-stable — do **not** silence the rule with a disable comment.

- [ ] **Step 6: Commit**

```bash
git add frontend/hooks/use-scroll-spy.ts frontend/tests/use-scroll-spy.test.ts
git commit -m "Add one scroll spy to replace eleven fighting observers

Sections are taller than the viewport and adjacent, so a per-section
observer firing on isIntersecting has two of them intersecting at every
boundary and the last to fire wins — the active-team flicker. One observer
watches all eleven against a narrow band near the top of the viewport and
picks whichever covers most of it, ties going to document order.

claim() gives a click immediate feedback and suppresses the observer as a
lease, not a lock: it lifts when the observer agrees or after 1200ms. The
timeout is load-bearing — a section shorter than the band may never win,
and without a ceiling the spy would freeze on the claimed id."
```

---

### Task 5: Put the URL on top of the active id

**Files:**
- Create: `frontend/hooks/use-team-navigation.ts`
- Test: `frontend/tests/use-team-navigation.test.ts`

**Interfaces:**
- Consumes: `claim` from Task 4's `useScrollSpy` — the hook takes it as a parameter and does not import it.
- Produces, from `@/hooks/use-team-navigation`:
  - `teamIdFromHash(hash: string): string | null` — pure.
  - `useTeamNavigation(options: { activeId: string; claim: (id: string) => void; ids: string[] }): void`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/use-team-navigation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { teamIdFromHash, useTeamNavigation } from '@/hooks/use-team-navigation';

const IDS = ['mercedes', 'ferrari', 'mclaren'];

describe('teamIdFromHash', () => {
  it('reads a team id out of a well-formed hash', () => {
    expect(teamIdFromHash('#team-ferrari')).toBe('ferrari');
    expect(teamIdFromHash('#team-racing-bulls')).toBe('racing-bulls');
  });

  it('rejects anything that is not a team fragment', () => {
    expect(teamIdFromHash('')).toBeNull();
    expect(teamIdFromHash('#')).toBeNull();
    expect(teamIdFromHash('#ferrari')).toBeNull();
    expect(teamIdFromHash('#team-')).toBeNull();
    expect(teamIdFromHash('#TEAM-ferrari')).toBeNull();
  });

  // The hash is attacker-controllable and goes nowhere near innerHTML, but it does reach
  // getElementById, so the shape is pinned rather than trusted.
  it('rejects a hash carrying anything outside the id character set', () => {
    expect(teamIdFromHash('#team-ferrari<script>')).toBeNull();
    expect(teamIdFromHash('#team-fer rari')).toBeNull();
  });
});

describe('useTeamNavigation', () => {
  let replaceState: ReturnType<typeof vi.spyOn>;
  let pushState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.location.hash = '';
    replaceState = vi.spyOn(window.history, 'replaceState');
    pushState = vi.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    replaceState.mockRestore();
    pushState.mockRestore();
    window.location.hash = '';
  });

  it('claims the team named in the hash on mount', () => {
    window.location.hash = '#team-mclaren';
    const claim = vi.fn();
    renderHook(() => useTeamNavigation({ activeId: 'mercedes', claim, ids: IDS }));
    expect(claim).toHaveBeenCalledWith('mclaren');
  });

  it('ignores a hash naming a team that does not exist', () => {
    window.location.hash = '#team-brabham';
    const claim = vi.fn();
    renderHook(() => useTeamNavigation({ activeId: 'mercedes', claim, ids: IDS }));
    expect(claim).not.toHaveBeenCalled();
  });

  it('claims nothing when there is no hash', () => {
    const claim = vi.fn();
    renderHook(() => useTeamNavigation({ activeId: 'mercedes', claim, ids: IDS }));
    expect(claim).not.toHaveBeenCalled();
  });

  // Eleven teams must not become eleven history entries. Scroll-driven changes replace.
  it('replaces the hash as the active id changes, never pushes', () => {
    const claim = vi.fn();
    const { rerender } = renderHook(
      ({ activeId }: { activeId: string }) => useTeamNavigation({ activeId, claim, ids: IDS }),
      { initialProps: { activeId: 'mercedes' } },
    );
    replaceState.mockClear();
    pushState.mockClear();

    rerender({ activeId: 'ferrari' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '#team-ferrari');

    rerender({ activeId: 'mclaren' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '#team-mclaren');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('does not rewrite the hash when it already names the active id', () => {
    window.location.hash = '#team-ferrari';
    const claim = vi.fn();
    renderHook(() => useTeamNavigation({ activeId: 'ferrari', claim, ids: IDS }));
    replaceState.mockClear();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('claims the hash again when the user goes back', () => {
    const claim = vi.fn();
    renderHook(() => useTeamNavigation({ activeId: 'mercedes', claim, ids: IDS }));
    claim.mockClear();

    window.location.hash = '#team-mclaren';
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(claim).toHaveBeenCalledWith('mclaren');
  });

  it('stops listening for popstate on unmount', () => {
    const claim = vi.fn();
    const { unmount } = renderHook(() =>
      useTeamNavigation({ activeId: 'mercedes', claim, ids: IDS }),
    );
    unmount();
    claim.mockClear();

    window.location.hash = '#team-mclaren';
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(claim).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/use-team-navigation.test.ts`
Expected: FAIL — cannot resolve `@/hooks/use-team-navigation`.

- [ ] **Step 3: Implement**

Create `frontend/hooks/use-team-navigation.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Team ids are kebab-case slugs. Pinned rather than trusted — this value reaches getElementById. */
const TEAM_HASH = /^#team-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** The team id a hash names, or `null` if it names anything else. */
export function teamIdFromHash(hash: string): string | null {
  const match = TEAM_HASH.exec(hash);
  return match ? match[1]! : null;
}

/**
 * Layers the URL over the active team. Knows nothing about observers.
 *
 * Explicit clicks are left alone: the rail, chip strip and comparison rows are real
 * anchors, so the browser sets the hash and adds exactly one history entry per click,
 * which is the `pushState` behaviour brief item 4 asks for — obtained for free. This hook
 * only handles the three cases the browser does not: restoring a hash on arrival,
 * answering `popstate`, and keeping the hash current as the user *scrolls*, which uses
 * `replaceState` so eleven teams do not become eleven history entries.
 */
export function useTeamNavigation({
  activeId,
  claim,
  ids,
}: {
  activeId: string;
  claim: (id: string) => void;
  ids: string[];
}): void {
  const hydratedRef = useRef(false);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const claimFromHash = useCallback(() => {
    const id = teamIdFromHash(window.location.hash);
    if (id !== null && idsRef.current.includes(id)) claim(id);
  }, [claim]);

  // Deep link. Runs after the first commit, so `scroll-margin-top` is in effect and the
  // browser's own fragment scroll has already landed correctly.
  useEffect(() => {
    claimFromHash();
    hydratedRef.current = true;
  }, [claimFromHash]);

  useEffect(() => {
    window.addEventListener('popstate', claimFromHash);
    return () => window.removeEventListener('popstate', claimFromHash);
  }, [claimFromHash]);

  // Scroll-driven. Never before hydration, or the first paint would rewrite a deep link
  // to the default team before it had been read.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const next = `#team-${activeId}`;
    if (window.location.hash === next) return;
    window.history.replaceState(null, '', next);
  }, [activeId]);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/use-team-navigation.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/use-team-navigation.ts frontend/tests/use-team-navigation.test.ts
git commit -m "Support /teams#team-ferrari, and keep the hash current while scrolling

Deep link on arrival, popstate on back, replaceState while scrolling so
eleven teams do not become eleven history entries. Clicks are deliberately
not handled here: the nav becomes real anchors in the next tasks, so the
browser already pushes exactly one entry per click.

The hash shape is pinned by regex rather than trusted — it is
attacker-controllable and reaches getElementById."
```

---

### Task 6: A media-query hook, and the CSS that makes anchors land correctly

**Files:**
- Create: `frontend/hooks/use-media-query.ts`
- Modify: `frontend/app/globals.css`
- Test: `frontend/tests/use-media-query.test.ts`

**Interfaces:**
- Consumes: Task 2's `matchMedia` stub.
- Produces:
  - `useMediaQuery(query: string): boolean` from `@/hooks/use-media-query`. **False on the server and on first client render**, then correct after mount. Task 11 relies on that: the dossier must not be in the SSR output.
  - A `--teams-scroll-offset` custom property in `app/globals.css`, `6.5rem` below `lg` and `3.5rem` from `lg` up. Tasks 10 and 12 consume it via `scroll-mt-[var(--teams-scroll-offset)]`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/use-media-query.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useMediaQuery } from '@/hooks/use-media-query';

const original = window.matchMedia;

/** A matchMedia whose listeners a test can fire. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.add(l),
      removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.delete(l),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
  return {
    fire(next: boolean) {
      for (const l of listeners) l({ matches: next } as MediaQueryListEvent);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

afterEach(() => {
  window.matchMedia = original;
});

describe('useMediaQuery', () => {
  it('reports a matching query after mount', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1280px)'));
    expect(result.current).toBe(true);
  });

  it('reports false for a query that does not match', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1280px)'));
    expect(result.current).toBe(false);
  });

  it('follows the query when the viewport changes', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1280px)'));
    act(() => {
      media.fire(true);
    });
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1280px)'));
    expect(media.listenerCount).toBe(1);
    unmount();
    expect(media.listenerCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/use-media-query.test.ts`
Expected: FAIL — cannot resolve `@/hooks/use-media-query`.

- [ ] **Step 3: Implement the hook**

Create `frontend/hooks/use-media-query.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

/**
 * Whether a media query currently matches.
 *
 * Starts `false` — on the server, and on the first client render — and corrects itself in
 * an effect. That asymmetry is deliberate rather than a hydration bug waiting to happen:
 * the caller uses this to decide whether to *mount* a wide-viewport-only subtree, and
 * false-first means that subtree is absent from the SSR output and appears after mount,
 * which is the only order that cannot mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/use-media-query.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the scroll CSS**

Append to `frontend/app/globals.css`:

```css
/*
 * Where an anchored team section should come to rest.
 *
 * `LandingNav` is `fixed` and `h-14`, so a fragment target would otherwise land underneath
 * it. Below `lg` the teams page adds a sticky chip strip beneath the nav, so the offset has
 * to grow to clear both. Sections consume this as `scroll-mt-[var(--teams-scroll-offset)]`;
 * there is deliberately no arithmetic in any scroll handler.
 */
:root {
  --teams-scroll-offset: 6.5rem;
}

@media (min-width: 1024px) {
  :root {
    --teams-scroll-offset: 3.5rem;
  }
}

html {
  scroll-behavior: smooth;
}

/*
 * Reduced motion has to stop the movement, not shorten it. A smooth-scrolled jump across
 * eleven full-height sections is exactly the sustained travel `reduce` is asking to be
 * spared, so the jump becomes instant.
 */
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
```

- [ ] **Step 6: Verify the whole suite and types**

Run: `mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: green throughout.

- [ ] **Step 7: Commit**

```bash
git add frontend/hooks/use-media-query.ts frontend/tests/use-media-query.test.ts frontend/app/globals.css
git commit -m "Add useMediaQuery and the scroll offset anchored sections land on

The hook reports false on the server and on first render, then corrects in
an effect, so a wide-viewport-only subtree is absent from SSR output and
appears after mount rather than mismatching.

--teams-scroll-offset clears the fixed 3.5rem nav, and grows below lg to
clear the sticky chip strip as well. scroll-behavior is smooth, and flat
off under prefers-reduced-motion — a smooth jump across eleven full-height
sections is the travel reduce asks to be spared."
```

---

### Task 7: Turn the desktop rail into labelled anchors

Discharges brief item 2's rail half (delete the competing numeral, name what `P# · N PTS` is), item 4's `aria-current="location"`, and item 14's "semantic elements, not `role`/`tabIndex`".

**Files:**
- Modify: `frontend/components/teams/teams-nav-rail.tsx`
- Test: `frontend/tests/teams-nav-rail.test.tsx`

**Interfaces:**
- Consumes: `ringOnDark`, `readableOnDark` from Task 3.
- Produces: `TeamsNavRail` with a **narrowed** prop type — `{ activeTeamId: string; onSelectTeam: (id: string) => void; reducedMotion: boolean }`. The `mobile` prop is **gone**; Task 8 owns the chips. Task 11 must stop passing `mobile`.

- [ ] **Step 1: Rewrite the test file**

Replace `frontend/tests/teams-nav-rail.test.tsx` entirely:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsNavRail } from '@/components/teams/teams-nav-rail';
import { monogram } from '@/components/teams/team-monogram-tile';
import { contrastRatio, DARK_BG, MIN_CONTRAST, MIN_RING_CONTRAST } from '@/lib/team-utils';
import { TEAMS } from '@/data/teams-data';

/** jsdom normalises any inline colour to `rgb(r, g, b)`; contrastRatio wants hex. */
function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

function renderRail({
  activeTeamId = 'ferrari',
  onSelectTeam = vi.fn(),
  reducedMotion = false,
}: {
  activeTeamId?: string;
  onSelectTeam?: (id: string) => void;
  reducedMotion?: boolean;
} = {}) {
  return render(
    <TeamsNavRail
      activeTeamId={activeTeamId}
      onSelectTeam={onSelectTeam}
      reducedMotion={reducedMotion}
    />,
  );
}

/** The progress track's fill — the element whose transform the active index drives. */
function progressFill(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.origin-top');
  if (!el) throw new Error('progress fill not found');
  return el as HTMLElement;
}

describe('TeamsNavRail', () => {
  it('shows position and points for each team', () => {
    renderRail();
    expect(screen.getByText('P1 · 379 PTS')).toBeInTheDocument();
    expect(screen.getByText('P2 · 307 PTS')).toBeInTheDocument();
  });

  // Brief item 2. The rail used to render a document-order 01–11 alongside P#, and because
  // TEAMS order is 1,2,3,4,7,5,8,6,9,11,10 the two disagreed from the fifth row down —
  // Haas showed "05" next to "P7 · 21 PTS". The sequence numeral is gone; what remains is
  // labelled.
  it('shows no bare document-order numeral beside the standing', () => {
    const { container } = renderRail();
    const haasStanding = screen.getByText('P7 · 21 PTS');
    const row = haasStanding.closest('a');
    expect(row).not.toBeNull();
    expect(row!.textContent).not.toMatch(/\b0[1-9]\b|\b1[01]\b/);
    // And nowhere else in the rail either.
    expect(container.textContent).not.toMatch(/\b0[1-9]\b/);
  });

  it('names what the standings line is, so the numbers are not unexplained', () => {
    renderRail();
    expect(screen.getByText(/championship/i)).toBeInTheDocument();
  });

  // Brief items 4 and 14: real links to real fragments, so middle-click and
  // open-in-new-tab work, and no scroll arithmetic is needed.
  it('renders every team as an anchor to its section', () => {
    renderRail();
    for (const team of TEAMS) {
      const link = screen.getByRole('link', { name: new RegExp(team.shortName, 'i') });
      expect(link).toHaveAttribute('href', `#team-${team.id}`);
    }
  });

  it('claims the clicked team without preventing the browser’s own navigation', () => {
    const onSelectTeam = vi.fn();
    renderRail({ onSelectTeam });
    const link = screen.getByRole('link', { name: /mclaren/i });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(onSelectTeam).toHaveBeenCalledWith('mclaren');
    // The anchor must be left to do its own job — that is what pushes the history entry.
    expect(event.defaultPrevented).toBe(false);
  });

  // aria-current="true" is valid but says nothing about *why*. "location" is the token for
  // "this is the current place in a set of navigation links".
  it('marks the active team with aria-current="location"', () => {
    renderRail();
    const current = screen.getAllByRole('link', { current: 'location' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/ferrari/i);
    expect(current[0]).toHaveAttribute('aria-current', 'location');
  });

  it('renders a uniform monogram tile for every team, including racing-bulls', () => {
    renderRail();
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      expect(screen.getByText(monogram(team.shortName))).toBeInTheDocument();
    }
  });

  // Brief item 13 names focus indicators specifically. Tailwind's ring is a box-shadow that
  // reads --tw-ring-color, so a team-derived ring has to set that property — an outlineColor
  // would silently do nothing and leave the ring at Tailwind's default translucent blue.
  it('gives every row a team-derived focus ring that clears non-text contrast', () => {
    expect(TEAMS).toHaveLength(11);
    renderRail();
    for (const team of TEAMS) {
      const link = screen.getByRole('link', { name: new RegExp(team.shortName, 'i') });
      const ring = link.style.getPropertyValue('--tw-ring-color');
      expect(ring, `${team.shortName} has no --tw-ring-color`).not.toBe('');
      expect(
        contrastRatio(ring, DARK_BG),
        `${team.shortName} ring ${ring}`,
      ).toBeGreaterThanOrEqual(MIN_RING_CONTRAST);
    }
  });

  it('keeps the active row’s standings line above AA for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const { unmount } = renderRail({ activeTeamId: team.id });
      const line = screen.getByText(`P${team.position} · ${team.points} PTS`);
      expect(
        contrastRatio(rgbToHex(line.style.color), DARK_BG),
        `${team.shortName} standings ${line.style.color}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      unmount();
    }
  });

  it('sets the progress track to a sliver on the first team and full on the last', () => {
    const first = TEAMS.at(0);
    const last = TEAMS.at(-1);
    if (!first || !last) throw new Error('TEAMS must not be empty');

    const { container: firstContainer } = renderRail({ activeTeamId: first.id });
    expect(progressFill(firstContainer).style.transform).toBe(`scaleY(${1 / TEAMS.length})`);

    const { container: lastContainer } = renderRail({ activeTeamId: last.id });
    expect(progressFill(lastContainer).style.transform).toBe('scaleY(1)');
  });

  it('animates the progress track only when motion is allowed', () => {
    const { container } = renderRail();
    expect(progressFill(container).className).toMatch(/transition-transform/);
  });

  it('drops the progress track transition under reduced motion', () => {
    const { container } = renderRail({ reducedMotion: true });
    const fill = progressFill(container);
    expect(fill.className).not.toMatch(/transition-transform/);
    expect(fill.style.transform).toBe(`scaleY(${2 / TEAMS.length})`);
  });
});
```

Two tests are deliberately dropped rather than rewritten: `selects the team that was clicked` (superseded by the anchor test above) and `drops points but keeps position in the mobile pills` (moves to Task 8 with the chips).

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/teams-nav-rail.test.tsx`
Expected: FAIL — rows are still `<button>`, `aria-current` is still `"true"`, the `01`–`11` numeral is still rendered, and there is no "Championship" label.

- [ ] **Step 3: Implement**

Replace `frontend/components/teams/teams-nav-rail.tsx` entirely:

```tsx
'use client';

import { motion } from 'motion/react';

import { TEAMS, STANDINGS_AS_OF, type Team } from '@/data/teams-data';
import { cn } from '@/lib/utils';
import { readableOnDark, ringOnDark } from '@/lib/team-utils';
import { TeamMonogramTile } from './team-monogram-tile';

interface TeamsNavRailProps {
  activeTeamId: string;
  onSelectTeam: (id: string) => void;
  reducedMotion: boolean;
}

function NavLink({
  team,
  isActive,
  onSelect,
  reducedMotion,
}: {
  team: Team;
  isActive: boolean;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
}) {
  return (
    <a
      href={`#team-${team.id}`}
      // No preventDefault. The browser's own fragment navigation does the scrolling —
      // against `scroll-mt-[var(--teams-scroll-offset)]` on the section — and adds exactly
      // one history entry, which is the push semantics brief item 4 asks for. All this
      // handler does is claim the active id so the highlight moves before the scroll lands.
      onClick={() => onSelect(team.id)}
      aria-current={isActive ? 'location' : undefined}
      className={cn(
        'relative flex w-full items-center gap-2.5 rounded-r-md px-4 py-2.5 text-left text-sm no-underline transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
        isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
      )}
      // A team-derived focus ring, held to non-text contrast rather than the text bar so it
      // still reads as the livery instead of a lightened wash of it.
      //
      // Tailwind's `ring-*` utilities are box-shadow, not outline, and take their colour from
      // the `--tw-ring-color` custom property. Setting `outlineColor` here would do nothing
      // and would leave the ring at Tailwind's default translucent blue, because there is no
      // `ring-<color>` class on this element any more.
      style={{ '--tw-ring-color': ringOnDark(team.color) } as React.CSSProperties}
    >
      {isActive && (
        <motion.span
          layoutId="teams-nav-active"
          className="absolute inset-0 rounded-r-md bg-zinc-800/60"
          transition={
            reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }
          }
        />
      )}

      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-full w-[2px] rounded-full transition-opacity duration-300"
        style={{ backgroundColor: team.color, opacity: isActive ? 1 : 0 }}
      />

      <TeamMonogramTile team={team} size={22} className="relative z-10" />

      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{team.shortName}</span>
        <span
          className="block truncate font-mono text-[9px] tracking-wide"
          // 9px text, so the livery colour has to clear AA — seven of eleven do not raw.
          style={{ color: isActive ? readableOnDark(team.color) : '#71717a' }}
        >
          {`P${team.position} · ${team.points} PTS`}
        </span>
      </span>
    </a>
  );
}

export function TeamsNavRail({ activeTeamId, onSelectTeam, reducedMotion }: TeamsNavRailProps) {
  return (
    <nav
      aria-label="Constructors"
      className="relative flex h-full flex-col justify-start overflow-y-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/*
        The header names the numbers underneath it. Before this the rail showed a
        document-order `01`–`11` next to `P7 · 21 PTS` with nothing saying which was which —
        and because TEAMS order agrees with the standings for exactly the first four rows,
        it read as a standings list that was wrong. The sequence numeral is gone and what
        remains is labelled.
      */}
      <div className="mb-4 px-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Constructors</p>
        <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-zinc-600">
          {`Championship · ${STANDINGS_AS_OF}`}
        </p>
      </div>

      {TEAMS.map((team) => (
        <NavLink
          key={team.id}
          team={team}
          isActive={activeTeamId === team.id}
          onSelect={onSelectTeam}
          reducedMotion={reducedMotion}
        />
      ))}

      {/* Scroll-progress edge, driven by the active team's position in document order —
          which is what it honestly measures. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-full w-[2px] bg-zinc-900"
      >
        <span
          className={cn(
            'block w-full origin-top bg-zinc-600',
            // The active team changes on every section crossing — eleven animations per
            // scroll of the page — so this is exactly the motion `reduce` asks to be spared.
            !reducedMotion && 'transition-transform duration-300',
          )}
          style={{
            height: '100%',
            transform: `scaleY(${(TEAMS.findIndex((t) => t.id === activeTeamId) + 1) / TEAMS.length})`,
          }}
        />
      </span>
    </nav>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/teams-nav-rail.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 5: Expect a break elsewhere, and leave it**

Run: `mise exec -- pnpm typecheck`
Expected: **FAIL** in `teams-page-client.tsx` — it still passes `mobile` to `TeamsNavRail`. That is correct at this point; Task 11 fixes it. Do not add the prop back.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/teams/teams-nav-rail.tsx frontend/tests/teams-nav-rail.test.tsx
git commit -m "Make the nav rail labelled anchors, and delete the numeral that lied

TEAMS order is 1,2,3,4,7,5,8,6,9,11,10 by championship position, so the
rail's document-order 01-11 disagreed with the P# on the same row from the
fifth entry down: Haas rendered '05' beside 'P7 · 21 PTS'. Because the
first four rows agree, it read as a standings list that was simply wrong.
The sequence numeral is gone and the header now names what P# · PTS is.

Rows become real anchors to #team-<id>, so the browser scrolls against
scroll-margin-top and pushes one history entry per click, and middle-click
and open-in-new-tab work. aria-current is now 'location'.

Typecheck fails until teams-page-client stops passing the removed mobile
prop; the chips move to their own component in the next commit."
```

---

### Task 8: Extract the chip strip and give it the behaviour the rail must not have

**Files:**
- Create: `frontend/components/teams/teams-chip-strip.tsx`
- Test: `frontend/tests/teams-chip-strip.test.tsx`

**Interfaces:**
- Consumes: `ringOnDark` from Task 3; Task 2's `scrollIntoView` stub.
- Produces: `TeamsChipStrip` with props `{ activeTeamId: string; onSelectTeam: (id: string) => void; reducedMotion: boolean }`. Task 11 renders it where the `mobile` rail used to be.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/teams-chip-strip.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TeamsChipStrip } from '@/components/teams/teams-chip-strip';
import { TEAMS } from '@/data/teams-data';

function renderStrip({
  activeTeamId = 'ferrari',
  onSelectTeam = vi.fn(),
  reducedMotion = false,
} = {}) {
  return render(
    <TeamsChipStrip
      activeTeamId={activeTeamId}
      onSelectTeam={onSelectTeam}
      reducedMotion={reducedMotion}
    />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TeamsChipStrip', () => {
  it('renders one anchor per team', () => {
    renderStrip();
    expect(screen.getAllByRole('link')).toHaveLength(TEAMS.length);
    for (const team of TEAMS) {
      expect(screen.getByRole('link', { name: new RegExp(team.shortName, 'i') })).toHaveAttribute(
        'href',
        `#team-${team.id}`,
      );
    }
  });

  it('keeps position but drops points — there is no room in a chip', () => {
    renderStrip();
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.queryByText('P1 · 379 PTS')).not.toBeInTheDocument();
  });

  it('marks the active chip with aria-current="location"', () => {
    renderStrip();
    const current = screen.getAllByRole('link', { current: 'location' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/ferrari/i);
  });

  // Brief item 6. Eleven chips overflow every phone, so the active one is routinely off
  // screen — the strip showed no sign of which team you were on.
  it('centres the active chip when it changes', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = renderStrip({ activeTeamId: 'ferrari' });
    scrollIntoView.mockClear();

    rerender(
      <TeamsChipStrip activeTeamId="cadillac" onSelectTeam={vi.fn()} reducedMotion={false} />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'center', block: 'nearest', behavior: 'smooth' }),
    );
  });

  // Reduced motion must stop the travel, not shorten it: this is a horizontal pan that
  // fires on every section crossing.
  it('jumps rather than pans under reduced motion', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = renderStrip({ activeTeamId: 'ferrari', reducedMotion: true });
    scrollIntoView.mockClear();

    rerender(
      <TeamsChipStrip activeTeamId="cadillac" onSelectTeam={vi.fn()} reducedMotion />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto' }),
    );
  });

  it('shows overflow fades that screen readers ignore', () => {
    const { container } = renderStrip();
    const fades = container.querySelectorAll('[data-testid="chip-fade"]');
    expect(fades).toHaveLength(2);
    for (const fade of fades) {
      expect(fade).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('claims the clicked team without preventing navigation', () => {
    const onSelectTeam = vi.fn();
    renderStrip({ onSelectTeam });
    const link = screen.getByRole('link', { name: /mclaren/i });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(onSelectTeam).toHaveBeenCalledWith('mclaren');
    expect(event.defaultPrevented).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/teams-chip-strip.test.tsx`
Expected: FAIL — cannot resolve `@/components/teams/teams-chip-strip`.

- [ ] **Step 3: Implement**

Create `frontend/components/teams/teams-chip-strip.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';

import { TEAMS } from '@/data/teams-data';
import { cn } from '@/lib/utils';
import { ringOnDark } from '@/lib/team-utils';

interface TeamsChipStripProps {
  activeTeamId: string;
  onSelectTeam: (id: string) => void;
  reducedMotion: boolean;
}

/**
 * The below-`lg` team navigation.
 *
 * Extracted out of `teams-nav-rail.tsx`, where it lived behind a `mobile` prop. It needs
 * two behaviours the desktop rail must *not* have — the active item scrolls itself into
 * view, and the container carries overflow fades — so the shared component was two
 * components wearing one name.
 */
export function TeamsChipStrip({
  activeTeamId,
  onSelectTeam,
  reducedMotion,
}: TeamsChipStripProps) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Eleven chips overflow every phone, so the active chip is routinely off screen and the
  // strip gives no sign of where you are. Centre it whenever it changes — including when
  // scrolling changed it, not just on a tap.
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeTeamId, reducedMotion]);

  return (
    <div className="relative">
      <div className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TEAMS.map((team) => {
          const isActive = activeTeamId === team.id;
          return (
            <a
              key={team.id}
              ref={isActive ? activeRef : undefined}
              href={`#team-${team.id}`}
              onClick={() => onSelectTeam(team.id)}
              aria-current={isActive ? 'location' : undefined}
              className={cn(
                'relative flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-widest no-underline transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
              )}
              // `--tw-ring-color`, not `outlineColor`: Tailwind's ring is a box-shadow and
              // reads its colour from that custom property.
              style={
                {
                  '--tw-ring-color': ringOnDark(team.color),
                  ...(isActive
                    ? { backgroundColor: `${team.color}33`, border: `1px solid ${team.color}` }
                    : { border: '1px solid transparent' }),
                } as React.CSSProperties
              }
            >
              {team.shortName}
              {/* Position only. Points do not fit a chip, and the desktop rail carries them. */}
              <span className="ml-1.5 font-mono text-[9px] text-zinc-400">{`P${team.position}`}</span>
            </a>
          );
        })}
      </div>

      {/* Overflow affordance. Static rather than conditional: eleven chips overflow every
          viewport this strip is shown at, so a scrollability check would always say yes. */}
      <span
        data-testid="chip-fade"
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-zinc-950 to-transparent"
      />
      <span
        data-testid="chip-fade"
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-zinc-950 to-transparent"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/teams-chip-strip.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/teams/teams-chip-strip.tsx frontend/tests/teams-chip-strip.test.tsx
git commit -m "Extract the chip strip, and let it centre its own active chip

It lived behind a mobile prop inside teams-nav-rail.tsx, but it needs two
behaviours the desktop rail must not have — the active chip scrolls itself
into view, and the container carries overflow fades — so the shared
component was two components under one name.

Eleven chips overflow every phone, so the active chip was routinely off
screen with nothing indicating where you were. Centring runs on every
change, not just taps, because scrolling moves the active team too. Under
reduced motion it jumps rather than pans."
```

---

### Task 9: Stop the dossier repeating the centre column

Discharges brief item 1 (the duplication), item 10 (position and points, which the panel shows nowhere today), and item 2's counter.

**Files:**
- Modify: `frontend/components/teams/sticky-team-panel.tsx`
- Test: `frontend/tests/sticky-team-panel.test.tsx`

**Interfaces:**
- Consumes: `teamColorButtonStyle`, `seasonsSince`, `readableOnDark` from `lib/team-utils`.
- Produces: `StickyTeamPanel` with unchanged props `{ activeTeam: Team; onInspect: () => void }`. It no longer imports `DriverPortrait`. Keeps `data-testid="championship-count"`; adds `data-testid="standings-position"`.

- [ ] **Step 1: Rewrite the test file**

Replace `frontend/tests/sticky-team-panel.test.tsx` entirely:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StickyTeamPanel } from '@/components/teams/sticky-team-panel';
import { TEAM_MAP, TEAMS } from '@/data/teams-data';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';

const ferrari = TEAM_MAP['ferrari']!;

function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

describe('StickyTeamPanel', () => {
  it('shows the team logo', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    // Scoped to the logo's own accessible name — a bare getByText('Ferrari') is satisfied
    // by the Power-unit MetaCell (Ferrari supplies its own engine).
    expect(screen.getByRole('img', { name: /ferrari logo/i })).toBeInTheDocument();
  });

  // Brief item 1. DriverPortrait used to render here *and* in team-section.tsx, so at lg
  // and up the same two faces were on screen twice. The centre column owns the drivers.
  it('renders no driver portraits — the centre section owns those', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Lewis Hamilton')).not.toBeInTheDocument();
  });

  // Brief item 10. The dossier carried no championship information at all before this.
  it('shows the championship position and points', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByTestId('standings-position')).toHaveTextContent('P2');
    expect(screen.getByText(/307 PTS/)).toBeInTheDocument();
  });

  it('keeps the standings figure readable for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const { unmount } = render(<StickyTeamPanel activeTeam={team} onInspect={vi.fn()} />);
      const position = screen.getByTestId('standings-position');
      const colour = position.style.color;
      if (colour) {
        expect(
          contrastRatio(rgbToHex(colour), DARK_BG),
          `${team.shortName} standings position`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
      unmount();
    }
  });

  // Brief item 2: a spelled-out sequence cannot be mistaken for a standing. It used to
  // read "Constructor 05 / 11" for a team standing P7.
  it('spells out its position in the running order', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByText(/team 2 of 11/i)).toBeInTheDocument();
  });

  it('does not render a bare two-digit sequence numeral', () => {
    const { container } = render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(container.textContent).not.toMatch(/\b02\s*\/\s*11\b/);
  });

  it('keeps the all-time stats', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByTestId('championship-count')).toHaveTextContent('16');
    expect(screen.getByText('Maranello, Italy')).toBeInTheDocument();
    expect(screen.getByText('Power unit').nextElementSibling).toHaveTextContent('Ferrari');
    expect(screen.getByText('1950')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
  });

  it('calls onInspect when the CTA is pressed', () => {
    const onInspect = vi.fn();
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={onInspect} />);
    fireEvent.click(screen.getByRole('button', { name: /inspect/i }));
    expect(onInspect).toHaveBeenCalledOnce();
  });

  it('renders a team with no championships without claiming a bar', () => {
    const cadillac = TEAM_MAP['cadillac']!;
    render(<StickyTeamPanel activeTeam={cadillac} onInspect={vi.fn()} />);
    expect(screen.getByTestId('championship-count')).toHaveTextContent('—');
  });

  it('shows a pointless team’s zero without pretending it is a rank', () => {
    const cadillac = TEAM_MAP['cadillac']!;
    render(<StickyTeamPanel activeTeam={cadillac} onInspect={vi.fn()} />);
    expect(screen.getByTestId('standings-position')).toHaveTextContent('P11');
    expect(screen.getByText(/0 PTS/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/sticky-team-panel.test.tsx`
Expected: FAIL — portraits still render, there is no `standings-position`, and the counter still reads `Constructor 02 / 11`.

- [ ] **Step 3: Implement**

In `frontend/components/teams/sticky-team-panel.tsx`:

Remove the `DriverPortrait` import and add `readableOnDark`:

```tsx
import { teamColorButtonStyle, seasonsSince, readableOnDark } from '@/lib/team-utils';
```

Delete the `import { DriverPortrait } from './driver-portrait';` line, and delete the now-unused `isFirstTeam` constant.

Replace the counter paragraph:

```tsx
          {/*
            Spelled out, because a bare `02 / 11` sitting next to a championship position is
            the ambiguity brief item 2 is about — and this counter used to read
            "Constructor 05 / 11" for a team standing P7, since TEAMS order is not
            standings order.
          */}
          <p className="px-4 pt-4 text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            {`Team ${index + 1} of ${TEAMS.length}`}
          </p>
```

Replace the whole "Both drivers" block — the `<div className="flex min-h-0 flex-1 gap-1 px-1">` element and its contents — with the championship block. The drivers move out entirely; `flex-1` moves onto this block so it takes the space they vacated:

```tsx
          {/* Championship standing — brief item 10. The dossier carried none of this before,
              which left the one always-visible panel silent about the season it describes. */}
          <div className="flex min-h-0 flex-1 flex-col justify-center border-t border-zinc-800/60 px-4 py-4">
            <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
              {`Championship · ${STANDINGS_AS_OF}`}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                data-testid="standings-position"
                className="text-3xl font-black leading-none"
                // Large display text, but it is still text carrying the livery colour, so it
                // goes through the contrast layer like every other coloured label.
                style={{ color: readableOnDark(activeTeam.color) }}
              >
                {`P${activeTeam.position}`}
              </span>
              <span className="font-mono text-xs text-zinc-300">
                {`${activeTeam.points} PTS`}
              </span>
            </div>
            <span className="mt-2 h-[7px] overflow-hidden bg-zinc-800">
              <span
                className="block h-full origin-left"
                style={{
                  backgroundColor: activeTeam.color,
                  transform: `scaleX(${activeTeam.points / MOST_POINTS})`,
                }}
              />
            </span>
          </div>
```

Add the leader constant beside `MOST_CHAMPIONSHIPS` near the top of the file:

```tsx
/** The championship leader's total, so points bars share one scale. `1` floors a zeroed season. */
const MOST_POINTS = Math.max(...TEAMS.map((t) => t.points), 1);
```

Extend the data import to pull in `STANDINGS_AS_OF`:

```tsx
import { TEAMS, STANDINGS_AS_OF, type Team } from '@/data/teams-data';
```

Finally, relabel the existing all-time block's heading from `Championships` to `All-time`, and keep its 2×2 meta grid exactly as it is:

```tsx
            <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">All-time</p>
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/sticky-team-panel.test.tsx`
Expected: PASS, 10 tests.

If the "keeps the standings figure readable" test fails for a team, that is `readableOnDark` doing its job and the colour is genuinely unreadable raw — do not loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/teams/sticky-team-panel.tsx frontend/tests/sticky-team-panel.test.tsx
git commit -m "Give the dossier the standings, and stop it repeating the centre column

DriverPortrait rendered here and in team-section.tsx, so at lg and up the
same two faces were on screen twice — the repeated large driver imagery
brief item 1 names. The centre column owns the drivers; the dossier takes
the space for what it was missing entirely, which is the championship
position and points it never showed.

The counter now spells out 'Team 2 of 11'. It read 'Constructor 05 / 11'
for a team standing P7, because TEAMS order is not standings order."
```

---

### Task 10: Take the observer out of the sections and give them a standing

**Files:**
- Modify: `frontend/components/teams/team-section.tsx`
- Test: `frontend/tests/team-section.test.tsx`

**Interfaces:**
- Consumes: `readableOnDark`, `teamColorButtonStyle` from `lib/team-utils`; `--teams-scroll-offset` from Task 6.
- Produces: `TeamSection` with a **narrowed** prop type — `onActivate` is **removed**: `{ team: Team; index: number; isActive: boolean; onInspect: () => void; reducedMotion: boolean }`. Task 11 must stop passing `onActivate`.

- [ ] **Step 1: Rewrite the affected tests**

In `frontend/tests/team-section.test.tsx`, change the render helper to drop `onActivate`:

```tsx
function renderSection(overrides: Partial<Parameters<typeof TeamSection>[0]> = {}) {
  return render(
    <TeamSection
      team={mclaren}
      index={2}
      isActive
      onInspect={vi.fn()}
      reducedMotion={false}
      {...overrides}
    />,
  );
}
```

Delete the `reports itself active once the stubbed observer fires` test entirely — the behaviour it asserts is gone, and `use-scroll-spy.test.ts` covers its replacement.

Then append:

```tsx
  // Brief item 5. Eleven per-section observers firing on isIntersecting fought at every
  // boundary. The page has exactly one spy now, and it lives in hooks/use-scroll-spy.ts.
  it('constructs no IntersectionObserver of its own', () => {
    const observer = vi.spyOn(globalThis, 'IntersectionObserver');
    renderSection();
    // BlurFade's useInView legitimately builds its own; what must not appear is one
    // observing this section for activation purposes.
    const activationObservers = observer.mock.calls.filter(
      ([, options]) => options?.rootMargin?.includes('-15%') ?? false,
    );
    expect(activationObservers).toHaveLength(0);
    observer.mockRestore();
  });

  // Brief item 4: the browser does the scrolling, against this offset. No handler maths.
  it('carries a scroll offset so an anchored jump clears the fixed nav', () => {
    renderSection();
    const section = document.getElementById('team-mclaren');
    expect(section?.className).toMatch(/scroll-mt-\[var\(--teams-scroll-offset\)\]/);
  });

  // Brief item 10's consequence: the dossier is gone below xl, so the standing has to be
  // in the section or it disappears from the page below 1280px.
  it('states the team’s championship standing', () => {
    renderSection();
    expect(screen.getByTestId('section-standing')).toHaveTextContent('P3');
    expect(screen.getByTestId('section-standing')).toHaveTextContent('220 PTS');
  });

  // Brief item 3's trap. The dossier moves to xl, so the button that reaches the 3D
  // inspector has to survive down to xl — not lg — or 1024-1279px gets neither.
  it('exposes the inspect action below xl, not below lg', () => {
    renderSection();
    const button = screen.getByRole('button', { name: /inspect/i });
    const wrapper = button.closest('[class*="hidden"]') ?? button.parentElement;
    expect(wrapper?.className).toMatch(/xl:hidden/);
    expect(wrapper?.className).not.toMatch(/(^|\s)lg:hidden/);
  });

  // Brief item 9: the separator used to be a 1px rule in this section's own colour at its
  // top edge, sitting directly under the previous team's content, where it read as that
  // team's bottom border.
  it('opens with a seam that names the team it introduces', () => {
    renderSection();
    const seam = screen.getByTestId('team-seam');
    expect(seam).toHaveTextContent(mclaren.name);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/team-section.test.tsx`
Expected: FAIL — no `section-standing`, no `team-seam`, no scroll offset class, Inspect still `lg:hidden`.

- [ ] **Step 3: Implement**

In `frontend/components/teams/team-section.tsx`:

Delete the `useEffect` block containing the `IntersectionObserver` (lines 38–51), the `sectionRef` declaration, and the `useEffect` import if nothing else uses it. Remove `onActivate` from `TeamSectionProps` and from the destructured parameters.

Add `readableOnDark` to the team-utils import:

```tsx
import { teamColorButtonStyle, readableOnDark } from '@/lib/team-utils';
```

Extend the data import:

```tsx
import { STANDINGS_AS_OF, type Team } from '@/data/teams-data';
```

Change the `<section>` opening tag — drop `ref`, add the scroll offset:

```tsx
    <section
      id={`team-${team.id}`}
      className="relative overflow-hidden bg-zinc-950 scroll-mt-[var(--teams-scroll-offset)]"
    >
```

Replace the top separator `<div className="h-px w-full" …/>` with the seam:

```tsx
      {/*
        The seam. This used to be a 1px rule in *this* team's colour at this section's top
        edge — which put it directly beneath the previous team's content, where it read as
        that team's bottom border rather than this team's opening. A downward wash carrying
        the incoming constructor's own name cannot be mistaken for the end of something.
      */}
      <div
        data-testid="team-seam"
        className="relative h-16 w-full"
        style={{
          background: `linear-gradient(to bottom, ${team.color}4d, transparent)`,
        }}
      >
        <p
          className="absolute left-6 top-5 text-[10px] uppercase tracking-[0.24em] lg:left-12"
          style={{ color: readableOnDark(team.color) }}
        >
          {team.name}
        </p>
      </div>
```

Add the standing line immediately after the `TextAnimate` heading's closing `</div>` pair, inside the left column and before the tagline `BlurFade`:

```tsx
          {/* The dossier is gone below `xl`, so without this the championship standing
              simply is not on the page at laptop width and below. */}
          <p
            data-testid="section-standing"
            className="font-mono text-xs tracking-wide"
            style={{ color: readableOnDark(team.color) }}
          >
            {`P${team.position} · ${team.points} PTS · ${STANDINGS_AS_OF.toUpperCase()}`}
          </p>
```

Change the Inspect button's wrapper class from `lg:hidden` to `xl:hidden`:

```tsx
          <BlurFade delay={reducedMotion ? 0 : 0.25} inView className="xl:hidden">
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/team-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/teams/team-section.tsx frontend/tests/team-section.test.tsx
git commit -m "Take the observer out of the sections, and give them a standing and a seam

Eleven per-section IntersectionObservers firing on isIntersecting fought
at every boundary, because the sections are taller than the viewport and
adjacent. Activation now belongs entirely to hooks/use-scroll-spy.ts.

The separator was a 1px rule in the section's own colour at its top edge,
so it sat under the previous team's content and read as that team's bottom
border. It becomes a wash carrying the incoming constructor's name.

The standing moves into the section because the dossier is about to
disappear below xl, and the Inspect button's visibility follows it from
lg:hidden to xl:hidden so 1024-1279px is not left with neither."
```

---

### Task 11: Wire it together and move the dossier to `xl`

**Files:**
- Modify: `frontend/components/teams/teams-page-client.tsx`
- Test: `frontend/tests/teams-page-client.test.tsx` (create)

**Interfaces:**
- Consumes: `useScrollSpy` (Task 4), `useTeamNavigation` (Task 5), `useMediaQuery` (Task 6), `TeamsNavRail` (Task 7), `TeamsChipStrip` (Task 8), `StickyTeamPanel` (Task 9), `TeamSection` (Task 10).
- Produces: a `TeamsPageClient` that owns no active-team state of its own.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/teams-page-client.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsPageClient } from '@/components/teams/teams-page-client';
import { TEAMS } from '@/data/teams-data';

const originalMatchMedia = window.matchMedia;

/** Force every media query to a fixed answer, so the mount decision is testable. */
function setViewportMatches(matches: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('TeamsPageClient', () => {
  it('renders a section per team, each with an anchor target', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    for (const team of TEAMS) {
      expect(document.getElementById(`team-${team.id}`)).toBeInTheDocument();
    }
  });

  // Brief item 3 plus item 15's "no needless canvas or component remounts". A dossier
  // inside a `display: none` wrapper still runs AnimatePresence and instantiates images
  // on every team change, for a column nobody can see.
  it('does not mount the dossier at narrow viewports', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    expect(screen.queryByRole('complementary', { name: /dossier/i })).not.toBeInTheDocument();
  });

  it('mounts the dossier once the viewport is wide enough', async () => {
    setViewportMatches(true);
    render(<TeamsPageClient />);
    expect(await screen.findByRole('complementary', { name: /dossier/i })).toBeInTheDocument();
  });

  // The nav rail and the chip strip are separate components now, and both are always in
  // the DOM under jsdom where no media query applies. Two navigations is correct; what
  // must not happen is 22 links with the same accessible name in one of them.
  it('renders the rail and the chip strip as distinct navigations', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    const navs = screen.getAllByRole('navigation');
    expect(navs.length).toBeGreaterThanOrEqual(2);
  });

  it('restores the team named in the URL hash', () => {
    setViewportMatches(false);
    window.location.hash = '#team-cadillac';
    render(<TeamsPageClient />);
    const current = screen
      .getAllByRole('link', { current: 'location' })
      .map((el) => el.getAttribute('href'));
    expect(current).toContain('#team-cadillac');
  });

  it('defaults to the first team with no hash', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    const current = screen
      .getAllByRole('link', { current: 'location' })
      .map((el) => el.getAttribute('href'));
    expect(current).toContain(`#team-${TEAMS[0]!.id}`);
  });

  // The hero's livery columns are still buttons — teams-hero.tsx belongs to Plan B — so
  // they cannot rely on the browser to scroll the way the anchors do. Passing bare `claim`
  // to the hero would move the rail highlight and go nowhere.
  it('navigates as well as claims when the hero picks a team', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: /jump to ferrari/i }));
    expect(window.location.hash).toBe('#team-ferrari');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/teams-page-client.test.tsx`
Expected: FAIL — the dossier renders unconditionally, and `TeamsNavRail` is still being given a `mobile` prop.

- [ ] **Step 3: Implement**

Replace `frontend/components/teams/teams-page-client.tsx` entirely:

```tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, useReducedMotion } from 'motion/react';

import { TEAMS, TEAM_MAP } from '@/data/teams-data';
import { useScrollSpy } from '@/hooks/use-scroll-spy';
import { useTeamNavigation } from '@/hooks/use-team-navigation';
import { useMediaQuery } from '@/hooks/use-media-query';
import { TeamsHero } from './teams-hero';
import { TeamsNavRail } from './teams-nav-rail';
import { TeamsChipStrip } from './teams-chip-strip';
import { TeamSection } from './team-section';
import { TeamsComparisonGrid } from './teams-comparison-grid';

const StickyTeamPanel = dynamic(
  () => import('./sticky-team-panel').then((m) => ({ default: m.StickyTeamPanel })),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-zinc-900" />,
  },
);

const InspectModal = dynamic(
  () => import('./inspect-modal').then((m) => ({ default: m.InspectModal })),
  { ssr: false },
);

/** Matches Tailwind's `xl`. The dossier's own breakpoint, kept in one place. */
const DOSSIER_QUERY = '(min-width: 1280px)';

export function TeamsPageClient() {
  const reducedMotion = useReducedMotion() ?? false;
  const [inspectOpen, setInspectOpen] = useState(false);

  const ids = useMemo(() => TEAMS.map((t) => t.id), []);
  const { activeTeamId, claim } = useTeamsSpy(ids);

  // Mounted, not merely hidden. A dossier inside a `display: none` wrapper still runs its
  // AnimatePresence swap and instantiates a logo image on every team change, for a column
  // nobody can see.
  const showDossier = useMediaQuery(DOSSIER_QUERY);

  const openInspect = useCallback(() => setInspectOpen(true), []);
  const closeInspect = useCallback(() => setInspectOpen(false), []);

  /**
   * Claim *and* navigate, for callers that are not anchors.
   *
   * The rail, chip strip and comparison rows are real links, so the browser scrolls for
   * them and `claim` alone is enough. `TeamsHero`'s livery columns are still buttons — it
   * is Plan B's file and is not touched here — so they need the fragment set explicitly.
   * Assigning `location.hash` takes the same path an anchor would: it honours
   * `scroll-mt-[var(--teams-scroll-offset)]` and `scroll-behavior`, and pushes exactly one
   * history entry.
   */
  const jumpToTeam = useCallback(
    (id: string) => {
      claim(id);
      window.location.hash = `#team-${id}`;
    },
    [claim],
  );

  return (
    <div className="relative bg-zinc-950">
      <TeamsHero onSelectTeam={jumpToTeam} />

      <div className="sticky top-14 z-20 bg-zinc-950/90 backdrop-blur-sm lg:hidden">
        <TeamsChipStrip
          activeTeamId={activeTeamId}
          onSelectTeam={claim}
          reducedMotion={reducedMotion}
        />
      </div>

      <div className="flex">
        <aside
          aria-label="Constructor navigation"
          className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[200px] self-start overflow-y-auto border-r border-zinc-900 lg:block xl:w-[240px]"
        >
          <TeamsNavRail
            activeTeamId={activeTeamId}
            onSelectTeam={claim}
            reducedMotion={reducedMotion}
          />
        </aside>

        <div className="min-w-0 flex-1">
          {TEAMS.map((team, index) => (
            <TeamSection
              key={team.id}
              team={team}
              index={index}
              isActive={activeTeamId === team.id}
              onInspect={openInspect}
              reducedMotion={reducedMotion}
            />
          ))}
          <TeamsComparisonGrid
            teams={TEAMS}
            activeTeamId={activeTeamId}
            reducedMotion={reducedMotion}
            onSelectTeam={claim}
          />
        </div>

        {/* `xl`, not `lg`. Three columns at laptop width squeezed the centre to nothing;
            the per-section Inspect button covers everything below this. */}
        {showDossier && (
          <aside
            aria-label="Team dossier"
            className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[300px] self-start border-l border-zinc-900 xl:block xl:w-[360px]"
          >
            <StickyTeamPanel activeTeam={TEAM_MAP[activeTeamId]!} onInspect={openInspect} />
          </aside>
        )}
      </div>

      <AnimatePresence>
        {inspectOpen && <InspectModal team={TEAM_MAP[activeTeamId]!} onClose={closeInspect} />}
      </AnimatePresence>
    </div>
  );
}

/**
 * The spy and the URL, composed. Kept as a named helper so the component body reads as
 * layout rather than as state plumbing, and so the two hooks' wiring order — the URL layers
 * over the spy, never the other way round — is stated in one place.
 */
function useTeamsSpy(ids: string[]): { activeTeamId: string; claim: (id: string) => void } {
  const { activeId, claim } = useScrollSpy(ids);
  useTeamNavigation({ activeId, claim, ids });
  return { activeTeamId: activeId, claim };
}
```

Note the `TeamsComparisonGrid` prop rename from `onScrollToTeam` to `onSelectTeam`. Task 12 makes that change; typecheck will fail on it until then.

- [ ] **Step 4: Run and expect one known failure**

Run: `mise exec -- pnpm typecheck`
Expected: **FAIL** on `TeamsComparisonGrid`'s `onSelectTeam` prop. Correct at this point — Task 12 fixes it. Everything else must be clean; in particular there must be no error about `mobile` or `onActivate`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/teams/teams-page-client.tsx frontend/tests/teams-page-client.test.tsx
git commit -m "Wire the hooks in, and move the dossier from lg to xl

The page no longer owns active-team state: the spy owns it and the URL
layers over the spy. Clicks call claim() and let the anchor navigate.

The dossier is mounted on a matchMedia check rather than hidden by CSS,
because a dossier inside display:none still runs its AnimatePresence swap
and instantiates a logo image on every team change for a column nobody can
see. Laptop widths get two columns on purpose.

Typecheck fails on the comparison grid's renamed prop until the next
commit."
```

---

### Task 12: Make comparison rows anchors and label the rank they show

**Files:**
- Modify: `frontend/components/teams/teams-comparison-grid.tsx`
- Test: `frontend/tests/teams-comparison-grid.test.tsx`

This is item 2 and item 4 only. The head-to-head tray is **Plan B** — do not build it here.

**Interfaces:**
- Consumes: `ringOnDark` from Task 3.
- Produces: `TeamsComparisonGrid` with `onScrollToTeam` renamed to `onSelectTeam`; prop type otherwise unchanged. Rows are `<a>`, not `<button>`.

- [ ] **Step 1: Update the tests**

In `frontend/tests/teams-comparison-grid.test.tsx`, change the render helper and the row query:

```tsx
function renderGrid(onSelectTeam = vi.fn(), reducedMotion = false) {
  render(
    <TeamsComparisonGrid
      teams={TEAMS}
      activeTeamId="ferrari"
      reducedMotion={reducedMotion}
      onSelectTeam={onSelectTeam}
    />,
  );
}

function rowNames() {
  return screen
    .getAllByRole('link', { name: /jump to /i })
    .map((el) => el.getAttribute('aria-label'));
}
```

Then replace every `getByRole('button', { name: /jump to …/i })` with `getByRole('link', { … })`. The three sort-tab queries stay `getByRole('button', …)` — the tabs really are buttons.

Replace the `scrolls to the team whose row is clicked` test:

```tsx
  it('links each row to its team’s section', () => {
    renderGrid();
    expect(screen.getByRole('link', { name: /jump to McLaren/i })).toHaveAttribute(
      'href',
      '#team-mclaren',
    );
  });

  it('claims the clicked team without preventing navigation', () => {
    const onSelectTeam = vi.fn();
    renderGrid(onSelectTeam);
    const link = screen.getByRole('link', { name: /jump to McLaren/i });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(onSelectTeam).toHaveBeenCalledWith('mclaren');
    expect(event.defaultPrevented).toBe(false);
  });
```

And append:

```tsx
  // Brief item 2. This numeral is neither the championship position nor the running order —
  // it is the rank under whichever sort is active, and it moves when the tab changes. Saying
  // so is the difference between a third mystery number and a labelled one.
  it('labels its leading numeral as the rank of the active sort', () => {
    renderGrid();
    expect(screen.getByText(/by points/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Titles' }));
    expect(screen.getByText(/by titles/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise exec -- pnpm test tests/teams-comparison-grid.test.tsx`
Expected: FAIL — rows are buttons, the prop is `onScrollToTeam`, and there is no "by points" label.

- [ ] **Step 3: Implement**

In `frontend/components/teams/teams-comparison-grid.tsx`:

Rename the prop throughout — in `TeamsComparisonGridProps`, in the destructured parameters, and at the call site inside the row.

Add the import:

```tsx
import { ringOnDark } from '@/lib/team-utils';
```

Add a label for the rank column beneath the sort tabs, after the closing `</div>` of the tab row:

```tsx
      {/* Names the leading numeral. It is neither the championship position nor the page's
          running order — it is the rank under the active sort, and it moves with the tab. */}
      <p className="mb-3 text-[9px] uppercase tracking-[0.18em] text-zinc-600">
        {`Rank by ${SORTS.find((s) => s.key === sort)!.label.toLowerCase()}`}
      </p>
```

Change `motion.button` to `motion.a`, add the `href`, and keep everything else — the `layout` prop, the `aria-label`, the bar, the ticker:

```tsx
            <motion.a
              key={team.id}
              href={`#team-${team.id}`}
              layout={!reducedMotion}
              transition={
                reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }
              }
              onClick={() => onSelectTeam(team.id)}
              aria-label={`Jump to ${team.shortName}, ${i + 1} of ${ranked.length}, ${metricPhrase(
                sort,
                team,
              )}`}
              className={cn(
                'flex items-center gap-3 rounded px-2 py-2 text-left no-underline transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                team.id === activeTeamId ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/30',
              )}
              // `--tw-ring-color`, not `outlineColor` — Tailwind's ring is a box-shadow.
              style={{ '--tw-ring-color': ringOnDark(team.color) } as React.CSSProperties}
            >
```

Remember to close it with `</motion.a>`.

Note the removal of `active:scale-[0.96]`: motion's `layout` prop writes `transform` inline, and inline beats a class, so that press feedback was already dead. The prior overhaul's retrospective flagged it as suspected-dead; it is dead.

- [ ] **Step 4: Run to verify it passes**

Run: `mise exec -- pnpm test tests/teams-comparison-grid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/teams/teams-comparison-grid.tsx frontend/tests/teams-comparison-grid.test.tsx
git commit -m "Make comparison rows anchors, and say what their numeral ranks

The leading numeral is neither the championship position nor the page's
running order — it is the rank under the active sort, and it changes when
the tab does. It is now labelled 'Rank by points' and so on.

Rows become anchors like the rest of the navigation. Drops
active:scale-[0.96], which motion's layout prop had already killed by
writing transform inline; the previous overhaul logged it as suspected
dead and it is."
```

---

### Task 13: Full verification and the remaining CLAUDE.md notes

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a green tree and documentation matching it.

- [ ] **Step 1: Run everything**

```bash
mise exec -- pnpm test
mise exec -- pnpm typecheck
mise exec -- pnpm lint
```

Expected: all three green. Test count should land around **240**. If typecheck still complains about `mobile`, `onActivate`, or `onScrollToTeam`, a task was skipped.

- [ ] **Step 2: Confirm no stray npm lockfile appeared**

Run: `git status --short && find . -name package-lock.json -not -path './node_modules/*'`
Expected: only intended files modified; no `package-lock.json` anywhere. If one exists, delete it — someone ran npm by mistake.

- [ ] **Step 3: Prove the duplication is actually gone**

Run: `grep -rn "DriverPortrait" frontend/components/`
Expected: exactly two hits — the definition in `driver-portrait.tsx` and one consumer in `team-section.tsx`. Any hit in `sticky-team-panel.tsx` means Task 9 regressed.

- [ ] **Step 4: Prove there is exactly one activation observer**

Run: `grep -rn "new IntersectionObserver" frontend/hooks/ frontend/components/`
Expected: exactly one hit, in `frontend/hooks/use-scroll-spy.ts`.

- [ ] **Step 5: Add the remaining CLAUDE.md notes**

Insert these into `CLAUDE.md`'s **Key technical details** section, after the `landing page composes` paragraph:

```markdown
**The teams page has exactly one scroll spy, and it lives in `hooks/use-scroll-spy.ts`.** The
sections are taller than the viewport and adjacent, so a per-section `IntersectionObserver` firing
on `isIntersecting` fights itself at every boundary. One observer watches all eleven against a
narrow band near the top of the viewport and picks the section covering most of it, ties going to
document order. A click *claims* the active id immediately and suppresses the observer until the
observer independently agrees or `CLAIM_TIMEOUT_MS` elapses — feedback must not wait for an
observer, but the observer still owns the state afterwards, and the timeout matters because a
section shorter than the band may never win. `hooks/use-team-navigation.ts` layers the URL on top:
the rail, chips and comparison rows are real anchors, so the browser pushes one history entry per
click by itself, and the hook only handles hash restore, `popstate`, and `replaceState` while
scrolling. Scroll offsets are `--teams-scroll-offset` in `app/globals.css` consumed as
`scroll-mt-[…]`, never maths in a handler.

**Team colours are brand assets and must go through `lib/team-utils.ts` before carrying text.**
`readableOnDark` lifts a livery until it clears WCAG AA as small text on `zinc-950`; `ringOnDark`
does the same against the lower non-text bar for focus rings; `onColor` picks black or white to
sit *on* a fill; `needsDamping` says whether a fill is too bright to be a surface at all. That
last one replaced a `team.color === '#ffffff'` equality check that only ever covered Haas —
Racing Bulls' navy reads at 2.02:1 and was never caught by it. Decorative use — glows, bars, the
livery wall, the 3D livery — keeps the true hex. `tests/team-utils.test.ts` asserts every variant
for all eleven teams, so a new team with an unreadable colour fails CI rather than shipping.

**The teams page's three columns appear at three different widths.** Left rail from `lg`, sticky
dossier from `xl`, mobile chip strip below `lg` — laptop widths get two columns on purpose. The
dossier is also *mounted* on a `matchMedia` check, not just `hidden xl:block`: inside a
`display: none` wrapper it still runs its `AnimatePresence` swap and instantiates a logo image on
every team change. Moving it to `xl` also means the per-section "Inspect in 3D" button is
`xl:hidden`, not `lg:hidden` — otherwise 1024–1279px gets no dossier *and* no way to reach the
inspector.
```

- [ ] **Step 6: Final green run and commit**

```bash
mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint
git add CLAUDE.md
git commit -m "docs: record the scroll spy, the colour layer and the three breakpoints

Each note lands with the code that makes it true. The three-breakpoint
note carries the xl:hidden coupling explicitly, because moving the dossier
to xl without moving the Inspect button leaves laptop widths with neither."
```

- [ ] **Step 7: Report the test delta honestly**

State the final count against the 199 baseline, and name any test that was deleted rather than replaced. Do not describe a lower-than-expected count as "all passing" without saying which behaviour was intentionally removed.

---

## Self-Review

**Spec coverage.** Walking the spec section by section:

| Spec section | Task |
|---|---|
| `use-scroll-spy` | 4 |
| `use-team-navigation` | 5 |
| Scrolling needs no JavaScript | 6 (CSS), 7, 8, 12 (anchors), 10 (`scroll-mt`) |
| `use-media-query` | 6, consumed in 11 |
| Column roles table | 9 (dossier), 10 (centre), 11 (breakpoints) |
| The `lg`–`xl` trap | 10 (button), 11 (aside), asserted in both |
| Team sections — seam, standing line | 10 |
| Comparison — anchors, sort-rank label | 12 |
| Numbering — two labelled systems | 7 (rail), 9 (counter), 12 (sort rank) |
| Colour and accessibility | 3 (helpers), 7/8/12 (rings), 10 (standing colour) |
| `aria-current="location"` | 7, 8, asserted in 11 |
| Reduced motion stops travel | 6 (`scroll-behavior`), 8 (chip centring) |
| Testing — setup stubs, pure-function seam | 2, 4 |
| CLAUDE.md notes land with their code | 1, 2, 13 |

**Deliberately not covered here — Plan B:** the compare tray (item 7), hero depth and CTA copy (item 8), section gradient rebalance and inter-team motion (item 9's remainder), `frameloop`/`visibilitychange` (item 11), modal prev/next and `02 / 11` (item 12). Task 12's header says so explicitly so an executor does not wander into it.

**Two things Plan B must inherit.** Item 9's seam is done in Task 10 but the surrounding gradient rebalance is not. Item 12's `02 / 11` index is *not* built here even though Task 9 builds the dossier's spelled-out counter — the modal is untouched by Plan A.

**Type consistency.** Three prop-shape changes ripple across tasks and each is declared in the producing task's Interfaces block and consumed in Task 11: `TeamsNavRail` loses `mobile` (7), `TeamSection` loses `onActivate` (10), `TeamsComparisonGrid` renames `onScrollToTeam`→`onSelectTeam` (12). Tasks 7 and 11 explicitly predict the intermediate typecheck failure and say which later task clears it, so an executor does not "fix" it by reverting. `claim` has one signature — `(id: string) => void` — everywhere it appears.

**Placeholder scan.** No TBDs. Every code step carries the actual code. The one intentionally open outcome is Task 3 Step 4's contrast assertion, which is framed as "stop and report" rather than "handle appropriately", because a failure there is a data finding about a specific livery rather than something to code around.
