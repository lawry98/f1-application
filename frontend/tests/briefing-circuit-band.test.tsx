/**
 * `BriefingCircuitBand` — the `/briefing` header band.
 *
 * The component's whole job is *not* inventing anything: four rows, every one a real field, and a
 * row without data is a row that is not rendered. So most of what is asserted below is an
 * **absence** — the ROUND label gone rather than empty, the circuit outline gone rather than
 * replaced by a fallback shape, `circuit_id` nowhere in the output. An absence is exactly the kind
 * of assertion that passes vacuously if it is written carelessly, which is why each one is paired
 * with a positive assertion proving the rest of the band really did render.
 */

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefingCircuitBand } from '@/components/briefing/briefing-circuit-band';
import type { CircuitGeometry } from '@/lib/circuit-geometry';
import { loadCircuitByLocation } from '@/lib/circuit-geometry';
import { blendOver, contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import type { RaceInfo } from '@/types';
import { inlineColouredText, restingTextNeutrals, ZINC } from './zinc';

/**
 * The geometry module is mocked rather than the network, because there is no network to mock:
 * `loadCircuitByLocation` resolves a location through a statically imported index and then reaches
 * for one circuit's JSON through a *dynamic import*. Faking `fetch` would fake nothing. Mocking
 * the module is also what makes the two cases this component branches on — a hit and a miss —
 * addressable at all, since every location in the real index is a hit.
 *
 * `tests/circuit-geometry.test.ts` owns the real loader (the slug rules, the aliases, the null on
 * an unknown id), so nothing here re-tests it.
 */
vi.mock('@/lib/circuit-geometry', () => ({
  loadCircuitByLocation: vi.fn(),
}));

/**
 * The reduced-motion recipe: motion caches the preference in a module global on the first
 * `useReducedMotion()` call and queries `(prefers-reduced-motion)` rather than
 * `(prefers-reduced-motion: reduce)`, so `window.matchMedia` cannot drive it from a test. A
 * partial module mock over a mutable flag can. `useReducedMotionSafe` calls motion's hook
 * underneath, so mocking it here reaches the component's branch.
 */
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

const load = vi.mocked(loadCircuitByLocation);

const MONZA_GEOMETRY: CircuitGeometry = {
  id: 'it-1922',
  name: 'Autodromo Nazionale Monza',
  location: 'Monza',
  lengthM: 5793,
  firstGp: 1950,
  // Four points is enough for `catmullRomPath` to emit a real `d` (it returns '' below two) and
  // keeps the fixture readable — the density of the real outlines is the loader's concern.
  points: [
    [0, 0],
    [0.5, 0.2],
    [1, 1],
    [0.3, 0.8],
  ],
};

const MONACO_GEOMETRY: CircuitGeometry = {
  id: 'mc-1929',
  name: 'Circuit de Monaco',
  location: 'Monaco',
  lengthM: 3337,
  firstGp: 1929,
  points: [
    [0, 0],
    [0.4, 0.9],
    [0.9, 0.4],
  ],
};

/**
 * `circuit_id` is `italian_grand_prix` on purpose — it is the shape the backend really derives
 * (from the *event* name, not the track) and it is what the CIRCUIT row must never print. The
 * `date` is the exact space-separated string the API serves; the space rather than a `T` is the
 * trap `formatBandDate` exists for.
 */
const MONZA_RACE: RaceInfo = {
  name: 'Italian Grand Prix',
  year: 2025,
  circuit_id: 'italian_grand_prix',
  location: 'Monza',
  country: 'Italy',
  date: '2025-05-25 00:00:00',
  is_upcoming: false,
  historical_year: 2025,
};

const MONACO_RACE: RaceInfo = {
  name: 'Monaco Grand Prix',
  year: 2025,
  circuit_id: 'monaco_grand_prix',
  location: 'Monaco',
  country: 'Monaco',
  date: '2025-05-25 00:00:00',
  is_upcoming: false,
  historical_year: 2025,
};

beforeEach(() => {
  reduceMotion = false;
  load.mockReset();
  load.mockImplementation(async (location: string) =>
    location === 'Monaco' ? MONACO_GEOMETRY : MONZA_GEOMETRY,
  );
});

/**
 * Render and let the geometry effect's promise settle inside `act`.
 *
 * The load is async even when the mock resolves immediately, so a bare `render()` leaves a state
 * update queued outside `act` — which React reports as a warning rather than a failure, and which
 * would leave every assertion below reading the pre-load tree. Flushing here rather than in each
 * test means the CIRCUIT row and the outline are present wherever a test expects them.
 */
async function renderBand(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {});
  return result;
}

describe('BriefingCircuitBand', () => {
  describe('the four rows', () => {
    it('renders ROUND, LOCATION, DATE and CIRCUIT when every field has data', async () => {
      await renderBand(<BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />);

      expect(screen.getByText('ROUND')).toBeInTheDocument();
      expect(screen.getByText('LOCATION')).toBeInTheDocument();
      expect(screen.getByText('DATE')).toBeInTheDocument();
      expect(screen.getByText('CIRCUIT')).toBeInTheDocument();

      expect(screen.getByText('16')).toBeInTheDocument();
      expect(screen.getByText('Monza')).toBeInTheDocument();
      expect(screen.getByText('25 MAY 2025')).toBeInTheDocument();
      expect(screen.getByText('Autodromo Nazionale Monza')).toBeInTheDocument();
    });

    it('pairs each label with its value as a dt/dd, not as two loose runs', async () => {
      // The rows are a description list so a screen reader gets the ROUND↔16 association. Four
      // pairs, and the count is pinned so a fifth invented row (TRACK / LAPS / LENGTH — the spec
      // notes those exist only inside briefing prose and are not fields) fails here.
      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />,
      );

      expect(container.querySelectorAll('dt')).toHaveLength(4);
      expect(container.querySelectorAll('dd')).toHaveLength(4);
    });

    it('zero-pads a single-digit round to the branch RND.08 idiom', async () => {
      await renderBand(<BriefingCircuitBand raceInfo={MONZA_RACE} round={8} />);

      expect(screen.getByText('08')).toBeInTheDocument();
    });
  });

  describe('a missing field hides its row rather than printing a placeholder', () => {
    it('drops the ROUND row entirely when round is null', async () => {
      // Asserted as an absent *label*, not as an empty value: a row rendered with a blank `dd`
      // would still pass a "no round number on screen" check while showing a dangling ROUND
      // heading, which is the placeholder the spec forbids. The LOCATION assertion beside it
      // stops this passing on a component that rendered nothing at all.
      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={null} />,
      );

      expect(screen.queryByText('ROUND')).not.toBeInTheDocument();
      expect(screen.getByText('LOCATION')).toBeInTheDocument();
      expect(container.querySelectorAll('dt')).toHaveLength(3);
    });

    it('drops both the outline and the CIRCUIT row when the geometry is a miss', async () => {
      // The spec's central rule for this component: a miss hides the visual entirely — no
      // placeholder shape, no error, no fallback. ROUND / LOCATION / DATE are real fields that do
      // not depend on geometry, so they must survive; a briefing missing its decorative track map
      // is still a complete briefing.
      load.mockResolvedValue(null);

      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />,
      );

      expect(container.querySelector('svg')).toBeNull();
      expect(screen.queryByText('CIRCUIT')).not.toBeInTheDocument();

      expect(screen.getByText('ROUND')).toBeInTheDocument();
      expect(screen.getByText('LOCATION')).toBeInTheDocument();
      expect(screen.getByText('DATE')).toBeInTheDocument();
    });

    it('drops the DATE row for a datetime it cannot parse rather than printing the raw string', async () => {
      // `formatBandDate` returns null instead of falling back to the API's raw value: half-parsed
      // data on a briefing header is worse than one fewer row.
      await renderBand(
        <BriefingCircuitBand raceInfo={{ ...MONZA_RACE, date: 'sometime in May' }} round={16} />,
      );

      expect(screen.queryByText('DATE')).not.toBeInTheDocument();
      expect(screen.queryByText('sometime in May')).not.toBeInTheDocument();
      expect(screen.getByText('LOCATION')).toBeInTheDocument();
    });
  });

  describe('date formatting', () => {
    /*
     * `RaceInfo.date` is `"2025-05-25 00:00:00"` — a **space**, not an ISO `T`. `new Date()` on
     * that string parses in V8 and jsdom but is not spec-guaranteed, and would additionally shift
     * the day across a timezone boundary, printing a confidently wrong date. The component splits
     * the string instead, and these cases pin the output form so the split cannot silently regress
     * to a `Date`.
     */
    it.each([
      ['2025-05-25 00:00:00', '25 MAY 2025'],
      ['2024-01-05 14:00:00', '05 JAN 2024'],
      ['2023-12-31 00:00:00', '31 DEC 2023'],
      // No time component at all — `/api/races/{year}` serves dates in this shorter shape.
      ['2026-03-08', '08 MAR 2026'],
    ])('formats %s as %s', async (date, expected) => {
      await renderBand(<BriefingCircuitBand raceInfo={{ ...MONZA_RACE, date }} round={16} />);

      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it('rejects an out-of-range month instead of indexing past the month table', async () => {
      await renderBand(
        <BriefingCircuitBand
          raceInfo={{ ...MONZA_RACE, date: '2025-13-25 00:00:00' }}
          round={16}
        />,
      );

      expect(screen.queryByText('DATE')).not.toBeInTheDocument();
    });
  });

  describe('the band reserves its box instead of growing into it', () => {
    /*
     * The defect this group exists for, measured in Chromium on the real stream before it was
     * fixed: **totalCLS 0.0651 at 1440×1400, of which 0.05393 was this band alone** — one shift
     * 3.2 s into a run, pushing the loader 222 px down the page, on a surface whose spec success
     * criterion is CLS 0. Two causes: the band was mounted only once `race_info` landed, and its
     * root then flipped from one column to two when the geometry chunk resolved, moving the data
     * column sideways and adding the CIRCUIT row underneath it.
     *
     * **jsdom lays nothing out, so none of this can be asserted as geometry.** What jsdom *can*
     * see is the structural cause: whether the boxes exist before their contents do, and whether
     * the root's layout classes change between the two states. The pixel figures are re-measured
     * in a browser; these are the guards that fail if the structure regresses.
     */

    it('reserves the outline box while the chunk is still in flight', async () => {
      // The `race-selector.tsx` precedent, 40 lines away, spelled out for the same reason: an
      // empty box is not a placeholder shape — nothing is drawn, which is the spec's rule for a
      // miss — and reserving it is what stops the outline's arrival growing the band.
      load.mockImplementation(() => new Promise<CircuitGeometry | null>(() => {}));

      const { container } = render(<BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />);
      await act(async () => {});

      expect(container.querySelector('svg'), 'an outline was drawn before it loaded').toBeNull();
      expect(
        container.querySelector('[data-circuit-slot]'),
        'the outline column was not reserved',
      ).not.toBeNull();
    });

    it('keeps the reserved box on a miss rather than collapsing the column', async () => {
      /*
       * The trade this makes, deliberately. The band previously collapsed to a single column for
       * a circuit with no geometry, on the grounds that an empty gutter is a kind of placeholder.
       * But the collapse cannot happen until the chunk has resolved, so it *is* the layout shift
       * — and `race-selector.tsx` had already settled the question the other way for its own
       * 48 px outline. A miss now leaves an empty box and draws nothing in it.
       */
      load.mockResolvedValue(null);

      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />,
      );

      expect(container.querySelector('svg')).toBeNull();
      expect(container.querySelector('[data-circuit-slot]')).not.toBeNull();
    });

    it('does not change the root’s layout classes when the geometry lands', async () => {
      /*
       * The direct guard on the second shift, written without naming a single class: whatever the
       * root's layout is, it must be the *same* string before and after the chunk resolves. A
       * `geometry && 'sm:grid-cols-[…]'` conditional — which is what shipped — fails here
       * immediately, and so does any future variant of it, including ones using different class
       * names than today's.
       */
      let resolveGeometry: (value: CircuitGeometry | null) => void = () => {};
      load.mockImplementation(
        () =>
          new Promise<CircuitGeometry | null>((resolve) => {
            resolveGeometry = resolve;
          }),
      );

      const { container } = render(<BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />);
      await act(async () => {});
      const beforeLoad = container.firstElementChild?.className;

      await act(async () => {
        resolveGeometry(MONZA_GEOMETRY);
      });

      expect(screen.getByText('Autodromo Nazionale Monza')).toBeInTheDocument();
      expect(container.firstElementChild?.className).toBe(beforeLoad);
    });

    it('renders its shell, with no rows at all, before the stream has resolved a race', async () => {
      /*
       * The first shift's cause. `race_info` lands 2–4 s into a run, and the band used to mount
       * only then — above a loader that was already on screen, so the whole page below it moved.
       * A shell from submit time holds the space instead. It carries **no rows**: every row is a
       * real field and there are none yet, so a placeholder row here would break the same rule
       * the null-round and unparseable-date branches obey.
       */
      const { container } = await renderBand(<BriefingCircuitBand raceInfo={null} round={null} />);

      expect(container.querySelectorAll('dt')).toHaveLength(0);
      expect(container.querySelectorAll('dd')).toHaveLength(0);
      expect(container.querySelector('svg')).toBeNull();
      // The box is still there — that is the entire point of rendering it.
      expect(container.querySelector('[data-circuit-slot]')).not.toBeNull();
      // And no circuit is fetched for a race that does not exist yet.
      expect(load).not.toHaveBeenCalled();
    });

    it('reserves the row column’s height so a later row cannot grow the band', async () => {
      /*
       * The rows arrive in three waves — LOCATION and DATE with `race_info`, ROUND as soon as the
       * calendar join resolves, CIRCUIT when the chunk lands — so the list's height is what is
       * left growing once the outline column is reserved. A floor on the list holds it.
       *
       * The class is asserted, never the height: jsdom applies no stylesheet, so the *value* can
       * only be checked in a browser, which is where it was measured — the same standing as
       * `SKELETON_HEIGHT` in `race-selector.tsx`. `\b` cannot bound an arbitrary-value Tailwind
       * class (`[` and `]` are non-word characters), hence the explicit boundaries.
       */
      const { container } = await renderBand(<BriefingCircuitBand raceInfo={null} round={null} />);

      const list = container.querySelector('dl');
      expect(list?.className).toMatch(/(^|\s)min-h-\[[^\]]+\](\s|$)/);
    });
  });

  describe('the CIRCUIT row names the track, not the Grand Prix', () => {
    it('shows the loaded geometry name and never the event-derived circuit_id', async () => {
      // The trap this file exists to catch. `RaceInfo.circuit_id` is derived from the *event*
      // name, so it reads `italian_grand_prix` — a Grand Prix, not a track. Asserting the string
      // is absent from the whole rendered output (not just from the CIRCUIT row) also catches it
      // leaking into a title attribute or a key-turned-content.
      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />,
      );

      expect(screen.getByText('Autodromo Nazionale Monza')).toBeInTheDocument();
      expect(container.innerHTML).not.toContain('italian_grand_prix');
    });

    it('joins on location, not on circuit_id', async () => {
      // The join key is the one decision in this component that fails silently if it is wrong:
      // keying on `circuit_id` resolves for almost nothing in the index, and a miss hides the
      // visual with no error anywhere to trace. Assert the argument, not just the result.
      await renderBand(<BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />);

      expect(load).toHaveBeenCalledWith('Monza');
    });
  });

  describe('a second race while the first is still loading', () => {
    it('loads the new circuit and stops showing the old one', async () => {
      // A fresh element rather than a mutated one: `rerender` bails on referential equality, so
      // re-passing the same element object would never re-render and the test would pass by
      // asserting on the first render twice.
      const { rerender } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />,
      );
      expect(screen.getByText('Autodromo Nazionale Monza')).toBeInTheDocument();

      rerender(<BriefingCircuitBand raceInfo={MONACO_RACE} round={8} />);
      await act(async () => {});

      expect(screen.getByText('Circuit de Monaco')).toBeInTheDocument();
      expect(screen.queryByText('Autodromo Nazionale Monza')).not.toBeInTheDocument();
    });

    it('ignores the first race’s chunk when it lands after the race changed', async () => {
      /*
       * The stale-async guard, driven rather than assumed. A user can submit a second race while
       * the first circuit's chunk is still in flight — the chunks are per-circuit dynamic imports
       * and their arrival order is not the request order. Without the guard, the late resolution
       * calls `setGeometry` with the *previous* race's circuit and the band paints Monza's outline
       * and name beside Monaco's rows: a wrong fact, not a cosmetic glitch.
       */
      let resolveMonza: (value: CircuitGeometry | null) => void = () => {};
      load.mockImplementation((location: string) =>
        location === 'Monaco'
          ? Promise.resolve(MONACO_GEOMETRY)
          : new Promise<CircuitGeometry | null>((resolve) => {
              resolveMonza = resolve;
            }),
      );

      const { rerender } = render(<BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />);
      await act(async () => {});
      // Monza's chunk is still in flight, so there is no circuit row yet — the band holds null
      // rather than guessing.
      expect(screen.queryByText('CIRCUIT')).not.toBeInTheDocument();

      rerender(<BriefingCircuitBand raceInfo={MONACO_RACE} round={8} />);
      await act(async () => {});
      expect(screen.getByText('Circuit de Monaco')).toBeInTheDocument();

      await act(async () => {
        resolveMonza(MONZA_GEOMETRY);
      });

      expect(screen.queryByText('Autodromo Nazionale Monza')).not.toBeInTheDocument();
      expect(screen.getByText('Circuit de Monaco')).toBeInTheDocument();
    });
  });

  describe('the ROUND accent', () => {
    it('carries the red treatment as a rule, and puts no red on any text', async () => {
      /*
       * The decision this pins: `f1-red` is 3.23:1 on this page's backdrop — it clears WCAG's 3:1
       * large-text bar and fails the 4.5:1 small-text one. The 11px ROUND label could not be red
       * under any reading, and the 30px numeral would be *legal* but would spend 0.23 of headroom
       * to say what a 2px rule says with none. So the accent is a rule: red as a bar, rule, tick
       * or fill is unconstrained. Asserting no `text-f1-red` anywhere is what stops a later pass
       * "making the accent read stronger" by recolouring the glyphs.
       */
      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />,
      );

      const rules = container.querySelectorAll('.bg-f1-red');
      expect(rules).toHaveLength(1);
      expect(rules[0]).toHaveAttribute('aria-hidden', 'true');

      // The rule belongs to the ROUND row and to no other.
      const roundRow = screen.getByText('ROUND').parentElement;
      expect(roundRow?.querySelector('.bg-f1-red')).not.toBeNull();

      // Scoped to the data column, not the whole container: `CircuitGlow` itself carries
      // `text-f1-red` on its `<svg>`, which is how it feeds `currentColor` to three *strokes*.
      // Red as a stroke is unconstrained; red on a glyph in this column is not.
      const column = container.querySelector('dl');
      expect(column?.querySelectorAll('.text-f1-red')).toHaveLength(0);
    });

    it('drops the rule with the row when round is null', async () => {
      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={null} />,
      );

      expect(container.querySelectorAll('.bg-f1-red')).toHaveLength(0);
    });
  });

  describe('reduced motion', () => {
    it('renders every row’s label and value with the preference set', async () => {
      // `useReducedMotionSafe` returns false on the first render and flips in a layout effect, so
      // a plain render under the flag exercises the false→true transition inside `act`. Content is
      // in the DOM from the first render either way — the branch decides how a row appears, never
      // whether it exists — and this is the assertion that keeps it that way.
      reduceMotion = true;

      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />,
      );

      for (const label of ['ROUND', 'LOCATION', 'DATE', 'CIRCUIT']) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
      for (const value of ['16', 'Monza', '25 MAY 2025', 'Autodromo Nazionale Monza']) {
        expect(screen.getByText(value)).toBeInTheDocument();
      }
      // The outline is still drawn — reduced motion means the static *final* state, never nothing.
      expect(container.querySelector('svg')).not.toBeNull();
    });
  });

  describe('beside the glow, never over it', () => {
    it('renders no text of its own inside the CircuitGlow subtree', async () => {
      /*
       * The structural guard for the contrast constraint that fixes this component's layout. Over
       * the red glow's line layer (`f1-red` at 0.9) `zinc-400` measures 2.24:1 and `zinc-300`
       * 3.88:1; only `ink` clears 4.5:1, and it does so with 0.7 of headroom over a blurred,
       * animated backdrop. jsdom cannot see an overlap done with absolute positioning, but it can
       * see text that has been moved *inside* the glow's subtree, which is how the overlap would
       * most plausibly be written. `CircuitGlow` is `aria-hidden` and carries text only when it is
       * passed `corners` — which it never is here, because there is no real corner data.
       */
      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />,
      );

      const glow = container.querySelector('svg');
      expect(glow).not.toBeNull();
      expect(glow).toHaveAttribute('aria-hidden');
      expect(glow?.textContent).toBe('');

      // And the data column really is a sibling, not a descendant — the positive half of the same
      // check, so this cannot pass on a band that rendered no rows.
      const label = screen.getByText('LOCATION');
      expect(glow?.contains(label)).toBe(false);
    });
  });

  describe('contrast', () => {
    /**
     * The page's backdrop is **not** `#09090b`. `/briefing` paints `bg-zinc-950` under a
     * `TopoBackground className="text-zinc-300"` at the component's built-in `opacity-[0.12]`, so
     * the opaque colour behind this band's glyphs is the composite of the two: `#212124`. Judging
     * the band against bare `zinc-950` would report every neutral optimistically — the same
     * right-colour-wrong-background failure `CLAUDE.md` records shipping twice on `/teams`.
     */
    const TOPO_ALPHA = 0.12;
    // `!` rather than `??`: an absent key here means the ZINC ramp lost a shade the whole branch
    // uses, and a silent fallback would compute a contrast figure against the wrong colour.
    const PAGE_BACKDROP = blendOver(ZINC['300']!, TOPO_ALPHA, DARK_BG);

    it('holds every resting neutral above the small-text floor on the page backdrop', async () => {
      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />,
      );
      const neutrals = restingTextNeutrals(container);

      // Non-vacuity: a helper that finds nothing passes every ratio assertion below in silence.
      // Four labels at `zinc-400` is the floor of what this band can legitimately contain.
      expect(neutrals.length).toBeGreaterThanOrEqual(4);
      for (const { hex, text } of neutrals) {
        expect(contrastRatio(hex, PAGE_BACKDROP), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    });

    it('is measuring against a floor that can actually fail', async () => {
      // The premise the test above rests on. `zinc-400` clears the bar on this backdrop and
      // `zinc-500` does not (6.27:1 against 3.32:1 — note the topo layer makes `zinc-500` *worse*
      // than the 4.12:1 it scores on bare `zinc-950`, so the branch's "no resting zinc-500 on
      // text" rule is if anything stricter here). Without this, a future edit that broke
      // `PAGE_BACKDROP` into something dark enough to pass everything would leave the assertion
      // above green and meaningless.
      expect(contrastRatio(ZINC['400']!, PAGE_BACKDROP)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrastRatio(ZINC['500']!, PAGE_BACKDROP)).toBeLessThan(MIN_CONTRAST);
    });

    it('paints no colour inline, so nothing escapes the class-based measurement', async () => {
      /*
       * `restingTextNeutrals` reads `text-zinc-N` classes and stops its upward walk at an inline
       * colour, so a run coloured by `style="color: …"` is invisible to it. This band computes no
       * colour at render time — every value is `text-ink` and every label `text-zinc-400` — and
       * pinning that at zero is what stops an unmeasured inline colour appearing later and passing
       * the suite above by simply not being seen.
       */
      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} />,
      );

      expect(inlineColouredText(container)).toHaveLength(0);
      // Paired with the positive half, so this cannot pass on an empty tree.
      expect(restingTextNeutrals(container).length).toBeGreaterThan(0);
    });
  });

  describe('className', () => {
    it('merges a caller class onto the band root', async () => {
      const { container } = await renderBand(
        <BriefingCircuitBand raceInfo={MONZA_RACE} round={16} className="mb-10" />,
      );

      expect(container.firstElementChild).toHaveClass('mb-10');
    });
  });
});
