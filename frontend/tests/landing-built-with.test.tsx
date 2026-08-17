import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingBuiltWith } from '@/components/landing/landing-built-with';
import { blendOver, contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

// Testing reduced motion, the only recipe verified to work in this repo. `useReducedMotion` caches
// its answer in a module-global on the first call and queries `(prefers-reduced-motion)` — not the
// `: reduce` variant `tests/setup.ts` stubs `matchMedia` with — so overriding `matchMedia` cannot
// drive it. Partial-mocking the module and flipping this flag is the only way to control it
// per-test, and real `motion` elements still render through the spread.
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/**
 * The six stack entries, retyped rather than imported from the component. `TECH_STACK` is not
 * exported and should not be: a test that imports the same constant the component renders asserts
 * only that React can map over an array. Retyping makes this a contract — the failure mode that
 * matters is a label or a note being quietly dropped or reworded while the section is re-set.
 */
const STACK_LABELS = [
  'FastF1',
  'LangGraph',
  'Gemini 3.6 Flash',
  'OpenWeather',
  'Tavily',
  'Next.js 14',
];

const STACK_NOTES = [
  'Telemetry & results',
  'Agent orchestration',
  'Synthesis & analysis',
  'Weather forecasts',
  'News & web search',
  'Frontend framework',
];

/**
 * The chip surface, resolved the way the browser composites it.
 *
 * The chips are `bg-zinc-900/50` over the section's `bg-zinc-950`, which is `DARK_BG`. That is a
 * *lighter* background than the page, so a light-on-dark neutral scores a **lower** ratio inside a
 * chip than the same neutral outside one. `whiteWashSurfaces` cannot find these — it pins
 * `bg-white/[0.02|0.03]` by design, and this is a zinc wash at a different alpha — and
 * `cardSurfaceBackdrop()` is the 3% white card, not this. So the composite is built here with the
 * same `blendOver` the shipped colour helpers use, rather than reusing a helper that describes a
 * different surface.
 */
const ZINC_900 = '#18181b';
const CHIP_ALPHA = 0.5;
const CHIP_BG = blendOver(ZINC_900, CHIP_ALPHA, DARK_BG);

describe('LandingBuiltWith', () => {
  describe('content survives', () => {
    it('labels the section', () => {
      render(<LandingBuiltWith />);
      expect(screen.getByRole('region', { name: 'Built with' })).toBeInTheDocument();
    });

    it('renders the heading label', () => {
      render(<LandingBuiltWith />);
      expect(screen.getByText('Built with')).toBeInTheDocument();
    });

    it('renders all six labels and all six notes verbatim', () => {
      render(<LandingBuiltWith />);
      for (const label of STACK_LABELS) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
      for (const note of STACK_NOTES) {
        // The rendered span is `&middot;` + a space + the note, so assert the composed run.
        expect(screen.getByText(`· ${note}`)).toBeInTheDocument();
      }
    });

    it('exposes the stack as a labelled list of six items', () => {
      render(<LandingBuiltWith />);
      const list = screen.getByRole('list', { name: 'Technologies used' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(6);
    });
  });

  describe('contrast', () => {
    /*
     * This section shipped with **no test file at all**, and with the "Built with" label and all
     * six `· note` strings on `zinc-600` — **2.57:1** against `DARK_BG`, against a 4.5:1 floor for
     * text this size. They are real accessible text, not `aria-hidden` decoration, so the
     * `#how-it-works` numerals precedent does not cover them. Both runs are now `zinc-400`
     * (7.76:1 on the page, 7.36:1 inside a chip).
     *
     * Measured against `CHIP_BG` rather than `DARK_BG` for the whole tree: the chip is the
     * stricter of the two backgrounds present, and the premise is asserted below rather than
     * assumed. That is the exact mistake `CLAUDE.md` records shipping twice on the teams pages —
     * the right colour measured against the wrong background passes while the page fails.
     */
    it('holds every resting neutral above the small-text floor on the chip surface', () => {
      const { container } = render(<LandingBuiltWith />);

      const neutrals = restingTextNeutrals(container);
      expect(neutrals.length).toBeGreaterThan(0);

      for (const { hex, text } of neutrals) {
        expect(contrastRatio(hex, CHIP_BG), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    });

    it('is right that the chip surface is the stricter background of the two', () => {
      // The premise the test above rests on, asserted rather than assumed: for light-on-dark text,
      // washing the page lighter can only lower the ratio. If a chip ever goes darker than the
      // page, this fails and the test above stops being the conservative measurement.
      const { container } = render(<LandingBuiltWith />);

      for (const { hex, text } of restingTextNeutrals(container)) {
        expect(contrastRatio(hex, CHIP_BG), `${hex} behind "${text}"`).toBeLessThanOrEqual(
          contrastRatio(hex, DARK_BG),
        );
      }
    });

    it('actually paints neutrals inside the chips, so the chip backdrop is exercised', () => {
      // Non-vacuity. Without this the assertions above would pass just as happily against a
      // section whose text had all been deleted, or one whose chips carried none of it.
      const { container } = render(<LandingBuiltWith />);

      const chips = Array.from(container.querySelectorAll<HTMLElement>('[class*="bg-zinc-900/50"]'));
      expect(chips).toHaveLength(6);

      for (const chip of chips) {
        // Two runs per chip: the `zinc-300` label and the `zinc-400` note.
        expect(restingTextNeutrals(chip).length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('reduced motion', () => {
    it('renders the full stack when motion is reduced', () => {
      reduceMotion = true;
      render(<LandingBuiltWith />);

      for (const label of STACK_LABELS) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });
  });
});
