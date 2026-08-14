/**
 * Tests for RaceSelector.
 *
 * Two subjects, and the older one is still the important one.
 *
 * **The lock.** A click landing while a briefing generates used to abort the run and discard
 * everything it had produced. Phase 6 swapped the `<Button variant="outline">` pills for
 * `<button>`-wrapped ticket cards, and every guarantee the shadcn button gave for free — a
 * genuinely disabled control, an accessible name, a visible marker on the running race — had to be
 * rebuilt by hand. Those assertions are carried over from the pre-restyle file rather than
 * rewritten, because they are the regression net for exactly that swap.
 *
 * **The geometry.** The row now draws a circuit outline per card, loaded asynchronously and
 * per-circuit. The spec's rule is that a miss hides the visual *entirely* — no placeholder, no
 * error — and that is the behaviour most likely to be "fixed" into a fallback shape by a later
 * change, so it is pinned here.
 *
 * The fetch this component used to do is gone: the list arrives as a prop from `useRaces`, which
 * the circuit band shares. `@/lib/circuit-geometry` is what gets mocked now, not `fetch`.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceSelector } from '@/components/briefing/race-selector';
import { focusRing } from '@/lib/focus';
import {
  blendOver,
  cardSurfaceBackdrop,
  contrastRatio,
  DARK_BG,
  MIN_CONTRAST,
} from '@/lib/team-utils';
import type { Point } from '@/lib/svg-path';
import type { Race } from '@/types';
import { restingTextNeutrals, ZINC } from './zinc';

const { loadCircuitByLocation } = vi.hoisted(() => ({ loadCircuitByLocation: vi.fn() }));

// The whole module, not a partial mock: this component imports exactly one thing from it, and a
// factory that has to be kept in step with the module's other exports is a maintenance trap.
vi.mock('@/lib/circuit-geometry', () => ({ loadCircuitByLocation }));

/**
 * A square outline. `catmullRomPath` needs at least two points or `CircuitGlow` renders an empty
 * `<svg>` shell — four keeps the "geometry present" case genuinely distinguishable from the miss.
 */
const SQUARE: Point[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * Melbourne resolves, Shanghai does not. The pairing is the point: one card with geometry and one
 * without, rendered side by side, is what proves a miss costs the outline and nothing else.
 *
 * `date` carries the backend's real shape — `"2026-03-08 00:00:00"`, a **space**, not an ISO `T`.
 * That is the trap this file exists to pin: the string is not in the ECMAScript `Date` grammar, so
 * anything that parses it is relying on implementation-defined behaviour.
 */
const RACES: Race[] = [
  {
    name: 'Australian Grand Prix',
    location: 'Melbourne',
    country: 'Australia',
    date: '2026-03-08 00:00:00',
    round: 1,
  },
  {
    name: 'Chinese Grand Prix',
    location: 'Shanghai',
    country: 'China',
    date: '2026-03-15 00:00:00',
    round: 2,
  },
];

/**
 * Every `CircuitGlow` in the tree, and nothing else.
 *
 * A `viewBox` is the discriminator rather than a test id: `TicketCard` renders a `TopoBackground`
 * of its own, so a bare `querySelectorAll('svg')` counts one texture per card. `TopoBackground`
 * deliberately carries **no** `viewBox` (its docstring: one user unit must stay one CSS pixel so
 * the texture cannot magnify with its container) while `CircuitGlow` must have one to scale, so
 * the attribute separates them by a property neither is free to change quietly.
 */
function outlines(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('svg[viewBox]'));
}

/** Render with geometry resolved, waiting for the async import so nothing escapes `act`. */
async function renderSelector(props: Partial<Parameters<typeof RaceSelector>[0]> = {}) {
  const onSelectRace = vi.fn();
  const view = render(<RaceSelector races={RACES} onSelectRace={onSelectRace} {...props} />);

  // The outline lands a microtask after mount. Waiting for it here means every later assertion
  // runs against the settled tree, and no `setState` fires outside `act` to warn in the console.
  await waitFor(() => expect(outlines(view.container)).toHaveLength(1));

  return { ...view, onSelectRace };
}

beforeEach(() => {
  // `mockReset`, not just a fresh implementation: `vi.restoreAllMocks()` only restores spies made
  // with `vi.spyOn`, so a bare `vi.fn()` keeps its call history for the whole file and the
  // "looked up once per location" assertion would count every render in the suite.
  loadCircuitByLocation.mockReset();
  loadCircuitByLocation.mockImplementation(async (location: string) =>
    location === 'Melbourne' ? { id: 'au-1953', name: 'Albert Park', points: SQUARE } : null,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RaceSelector', () => {
  describe('the list it is given', () => {
    it('renders one card per race, each named by its Grand Prix', async () => {
      await renderSelector();

      expect(screen.getAllByRole('button')).toHaveLength(RACES.length);
      // Accessible name, not `getByText`: the card's name run sits beside a country kicker and a
      // date, and it is the *control's* name that has to carry the Grand Prix.
      for (const race of RACES) {
        expect(
          screen.getByRole('button', { name: new RegExp(race.name, 'i') }),
        ).toBeInTheDocument();
      }
    });

    it('does not fetch anything itself', async () => {
      // The contract with the parent: `useRaces` owns the calendar. A fallback fetch kept here
      // "in case the parent forgets" would put the list on the wire twice and let the two copies
      // disagree about what "upcoming" means, which is how the band's round join goes stale.
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      await renderSelector();

      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('renders nothing when the calendar came back empty', () => {
      // `useRaces` degrades a failed fetch to an empty list. A heading reading "quick select
      // upcoming races:" above no races labels something that is not on screen.
      const { container } = render(<RaceSelector races={[]} onSelectRace={vi.fn()} />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('selection', () => {
    it('selects a race when nothing is generating', async () => {
      const { onSelectRace } = await renderSelector();

      fireEvent.click(screen.getByRole('button', { name: /australian/i }));

      expect(onSelectRace).toHaveBeenCalledWith('Australian Grand Prix');
    });

    it('disables every card while a briefing is generating', async () => {
      await renderSelector({ disabled: true });

      for (const button of screen.getAllByRole('button')) {
        expect(button).toBeDisabled();
      }
    });

    it('does not select a race from a locked card', async () => {
      // The actual bug: a click here used to abort the in-flight run and discard its output. The
      // lock has to be the native `disabled`, not a class that only looks locked.
      const { onSelectRace } = await renderSelector({ disabled: true });

      fireEvent.click(screen.getByRole('button', { name: /chinese/i }));

      expect(onSelectRace).not.toHaveBeenCalled();
    });
  });

  describe('the focus ring', () => {
    it('takes the branch-wide token rather than restating one', async () => {
      /*
       * The class list is compared against `lib/focus.ts`'s own export, not against a copy of the
       * string: a literal here would let the shared token move while this row silently kept the
       * old shape, which is precisely the drift Phase 7 exists to close. The file used to carry
       * `ring-1` "so as not to invent a third shape until Phase 7 unifies the rings" — this is
       * that unification.
       */
      await renderSelector();

      const chip = screen.getByRole('button', { name: /australian/i });

      for (const token of focusRing.split(' ')) {
        expect(chip.classList.contains(token), `${token} missing from the chip`).toBe(true);
      }
    });

    it('carries no ring offset', async () => {
      /*
       * The measured reason, and it is the opposite of what the chip's surface suggests. A ring is
       * an *outer* box-shadow, so it is painted outside the button's border box and never lands on
       * the `TicketCard` fill inside it — where red would measure 2.96:1 and fail. What it is
       * actually painted on is the `bg-zinc-900` form card this whole row sits in: 3.57:1, over
       * WCAG 2.4.11's 3:1 non-text bar. An offset band would insert a strip of some *other*
       * colour between the two, and neither offset token names `zinc-900`.
       */
      await renderSelector();

      const chip = screen.getByRole('button', { name: /australian/i });

      expect(chip.className).not.toMatch(/ring-offset/);
    });
  });

  describe('the active race', () => {
    it('marks exactly one card, and marks it non-visually', async () => {
      const { container } = await renderSelector({
        disabled: true,
        activeRace: 'Australian Grand Prix',
      });

      // `aria-current` is the half the pre-restyle implementation was missing: it marked the
      // running race by border colour alone, which no screen reader reports and which anyone who
      // cannot separate red from zinc cannot see either.
      const marked = container.querySelectorAll('[aria-current="true"]');
      expect(marked).toHaveLength(1);
      expect(marked[0]).toBe(screen.getByRole('button', { name: /australian/i }));
    });

    it('keeps a red border on the marked card', async () => {
      const { container } = await renderSelector({ activeRace: 'Australian Grand Prix' });

      // Asserted as a whole class token on the card *inside* the marked button — a `className`
      // substring match would also hit `TicketCard`'s `hover:border-white/25` siblings.
      const card = screen
        .getByRole('button', { name: /australian/i })
        .querySelector('.notch-card') as HTMLElement;
      expect(card.classList.contains('border-f1-red')).toBe(true);

      const other = screen
        .getByRole('button', { name: /chinese/i })
        .querySelector('.notch-card') as HTMLElement;
      expect(other.classList.contains('border-f1-red')).toBe(false);
      expect(container.querySelectorAll('.border-f1-red')).toHaveLength(1);
    });

    it('keeps marking the race after its run has finished', async () => {
      // `activeRace` marks the briefing on screen, not just the one generating.
      const { container } = await renderSelector({
        disabled: false,
        activeRace: 'Australian Grand Prix',
      });

      expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    });

    it('marks nothing when no race is active', async () => {
      const { container } = await renderSelector();

      expect(container.querySelectorAll('[aria-current]')).toHaveLength(0);
    });
  });

  describe('loading', () => {
    it('shows a skeleton row sized to the cards, and no race cards', () => {
      const { container } = render(<RaceSelector races={[]} loading onSelectRace={vi.fn()} />);

      const skeletons = Array.from(container.querySelectorAll('.animate-pulse'));
      expect(skeletons).toHaveLength(6);
      // Sized to the ticket cards, not to the old `h-9 w-32` pills: a skeleton row of a different
      // width to what replaces it is a layout shift when the calendar lands.
      for (const skeleton of skeletons) {
        expect(skeleton.classList.contains('w-[184px]')).toBe(true);
      }
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('keeps the heading in both states', async () => {
      const { unmount } = render(<RaceSelector races={[]} loading onSelectRace={vi.fn()} />);
      expect(screen.getByText('Quick select upcoming races:')).toBeInTheDocument();
      unmount();

      await renderSelector();
      expect(screen.getByText('Quick select upcoming races:')).toBeInTheDocument();
    });

    it('names the row after that heading', async () => {
      // The heading is a paragraph, so without the association the scroll row is an unlabelled
      // group of six controls. `useId` is what keeps the id unique if the row is ever rendered
      // twice on one page.
      const { container } = await renderSelector();
      const row = container.querySelector('[role="group"]') as HTMLElement;

      const labelId = row.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      expect(container.querySelector(`#${CSS.escape(labelId!)}`)?.textContent).toBe(
        'Quick select upcoming races:',
      );
    });
  });

  describe('the date', () => {
    it('formats a space-separated backend datetime', async () => {
      // `"2026-03-08 00:00:00"` is what `/api/races/{year}` really sends — a space, not an ISO
      // `T`. That form is not in the ECMAScript grammar, so `new Date(…)` on it is
      // implementation-defined, and `new Date("2026-03-08")` — which *is* spec'd — parses as UTC
      // midnight and renders as 07 MAR anywhere west of Greenwich. Both failures are silent and
      // both are off by one day, which is why this is pinned to the character.
      await renderSelector();

      expect(screen.getByText('08 MAR')).toBeInTheDocument();
      expect(screen.getByText('15 MAR')).toBeInTheDocument();
    });

    it('omits the line rather than throwing on a date it cannot read', async () => {
      const malformed: Race[] = [{ ...RACES[0]!, date: 'later' }];
      const { container } = render(<RaceSelector races={malformed} onSelectRace={vi.fn()} />);

      await waitFor(() => expect(loadCircuitByLocation).toHaveBeenCalled());
      // The card survives; only the date line is gone. A crash inside the quick-select row would
      // take the whole briefing form down with it.
      expect(screen.getByRole('button', { name: /australian/i })).toBeInTheDocument();
      expect(container.textContent).not.toContain('undefined');
      expect(container.textContent).not.toContain('NaN');
    });
  });

  describe('circuit geometry', () => {
    it('draws an outline only for the circuits it has', async () => {
      const { container } = await renderSelector();

      // One outline across two cards: Melbourne resolved, Shanghai returned null. Per the spec a
      // miss hides the visual entirely — no placeholder shape, no error — and this is the
      // assertion that stops a later change from "helpfully" adding a fallback.
      expect(outlines(container)).toHaveLength(1);
      const australian = screen.getByRole('button', { name: /australian/i });
      const chinese = screen.getByRole('button', { name: /chinese/i });
      expect(outlines(australian)).toHaveLength(1);
      expect(outlines(chinese)).toHaveLength(0);

      // Both cards still carry all of their text. This is the "and nothing else" half.
      expect(chinese.textContent).toContain('Chinese Grand Prix');
      expect(chinese.textContent).toContain('China');
      expect(chinese.textContent).toContain('15 MAR');
    });

    it('looks each distinct location up once', async () => {
      await renderSelector();

      expect(loadCircuitByLocation).toHaveBeenCalledTimes(2);
      expect(loadCircuitByLocation).toHaveBeenCalledWith('Melbourne');
      expect(loadCircuitByLocation).toHaveBeenCalledWith('Shanghai');
    });

    it('survives every lookup missing', async () => {
      loadCircuitByLocation.mockResolvedValue(null);
      const { container } = render(<RaceSelector races={RACES} onSelectRace={vi.fn()} />);

      await waitFor(() => expect(loadCircuitByLocation).toHaveBeenCalledTimes(2));
      expect(outlines(container)).toHaveLength(0);
      expect(screen.getAllByRole('button')).toHaveLength(2);
    });

    it('reserves the outline box whether or not geometry arrives', async () => {
      // The box is what keeps CLS at 0: geometry lands one dynamic import after mount, so a box
      // that only existed once it resolved would grow every card mid-scroll. An empty box is not
      // a placeholder — nothing is drawn in it.
      const { container } = await renderSelector();

      expect(container.querySelectorAll('.aspect-square')).toHaveLength(RACES.length);
    });
  });

  describe('contrast', () => {
    /**
     * The real backdrop behind this row, composited rather than assumed.
     *
     * `/briefing` paints `bg-zinc-950` under `<TopoBackground className="text-zinc-300" />` at the
     * component's built-in 12%, so the page is **not** `#09090b` where text is concerned — it is
     * rgb(33, 33, 36). Every card then puts its own `white/0.03` wash on top of that. Measuring
     * against `DARK_BG` would report every run in this file optimistically, which is the one
     * mistake `CLAUDE.md` records shipping twice: the right colour against the wrong background.
     *
     * The `!` is safe by construction — `ZINC` is a literal map and '300' is one of its keys — and
     * is preferred to a fallback hex, which would let a rename silently measure the wrong colour.
     */
    const PAGE_BACKDROP = blendOver(ZINC['300']!, 0.12, DARK_BG);
    const CARD_BACKDROP = cardSurfaceBackdrop(PAGE_BACKDROP);

    it('clears 4.5:1 on every resting neutral, measured through the card wash', async () => {
      const { container } = await renderSelector();
      const neutrals = restingTextNeutrals(container);

      // Non-vacuity. A helper that finds nothing passes every ratio assertion in silence, and this
      // row has few enough text runs that an accidental empty list is entirely plausible.
      expect(neutrals.length).toBeGreaterThan(0);
      for (const { hex, text } of neutrals) {
        expect(contrastRatio(hex, CARD_BACKDROP), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    });

    it('is right that the card wash is the stricter background of the two', async () => {
      // The premise the test above rests on, asserted rather than assumed: for light-on-dark text
      // the card composite can only score at or below the bare page. If a future surface change
      // inverted that, the test above would quietly become the lenient one.
      const { container } = await renderSelector();

      for (const { hex, text } of restingTextNeutrals(container)) {
        expect(contrastRatio(hex, CARD_BACKDROP), `${hex} behind "${text}"`).toBeLessThanOrEqual(
          contrastRatio(hex, PAGE_BACKDROP),
        );
      }
    });

    it('would fail on the zinc-500 this row used to use', async () => {
      // Proof the measurement bites. The pre-restyle heading was `text-zinc-500`, which measures
      // 3.04:1 through the card wash and 3.23:1 on this page's composited backdrop — under the bar
      // on both, and the exact run SHARED-P6 §3 forbids. (Both are well below the 4.12:1 that
      // shade scores on bare `zinc-950`, which is the figure the old code was implicitly judged
      // against.) Without this, the loop above would still pass on a component that had simply
      // stopped rendering any text.
      expect(contrastRatio(ZINC['500']!, CARD_BACKDROP)).toBeLessThan(MIN_CONTRAST);
      expect(contrastRatio(ZINC['400']!, CARD_BACKDROP)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it('actually paints neutrals inside the cards, so the card backdrop is exercised', async () => {
      // Without this the ratio loops could be satisfied entirely by the heading, which sits on the
      // page rather than on a card, and the stricter background would be measured against nothing
      // that really sits on it. Each card carries its country kicker and its date.
      const { container } = await renderSelector();
      const cards = Array.from(container.querySelectorAll('.notch-card'));

      expect(cards).toHaveLength(RACES.length);
      for (const card of cards) {
        expect(restingTextNeutrals(card).length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
