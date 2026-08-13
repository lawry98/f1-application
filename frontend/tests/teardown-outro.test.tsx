import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeardownOutro } from '@/components/teardown/teardown-outro';

/**
 * The four 2026-regulation figures, copied out of the component by hand on purpose — importing
 * `STATS` from the source would make every assertion below tautological, agreeing with whatever
 * the component says today even if a value got rounded or dropped in a future edit. These are the
 * exact numbers the task brief names as ones the parent cites in the commit message.
 */
const STAT_VALUES = ['1000', '15000', '768', '5'];
const STAT_UNITS = ['HP', 'RPM', 'KG', 'G'];
const STAT_LABELS = ['Power unit output', 'Rev limit', 'Minimum weight', 'Peak cornering'];

describe('TeardownOutro', () => {
  describe('content survives', () => {
    it('renders the kicker', () => {
      render(<TeardownOutro />);
      expect(screen.getByText('By the numbers')).toBeInTheDocument();
    });

    it('renders the full heading sentence despite it being split across spans', () => {
      // The accent run ("behind the car") is its own <span> so the caps/serif treatment can
      // apply to it alone (see SHARED-P4.md's mixed-type-heading idiom) — a naive
      // `getByText('The numbers behind the car.')` therefore finds nothing, because Testing
      // Library matches per element and no single element holds the whole sentence. Normalising
      // `textContent` is what proves the sentence still reads correctly once the spans are
      // flattened, which is what a screen reader and a copy-paste both actually get.
      render(<TeardownOutro />);
      const heading = screen.getByRole('heading', { level: 2 });

      expect(heading.textContent?.replace(/\s+/g, ' ').trim()).toBe('The numbers behind the car.');
    });

    it('renders all four stat values, units and labels verbatim', () => {
      // MegaStat's non-animating path (jsdom's stubbed IntersectionObserver reports everything
      // in view immediately, but `useReducedMotion` still defaults to "no preference" here, so
      // this exercises the counting path) still renders the true final digits in an
      // `aria-hidden` painted span plus an invisible sibling holding the same final text for
      // layout — either way, the final string is in the DOM. Asserting via `getAllByText` (not
      // `getByText`) for the values because MegaStat renders the same final text twice per stat
      // (the width-reserving invisible twin and the live digits), by design.
      render(<TeardownOutro />);

      for (const value of STAT_VALUES) {
        expect(screen.getAllByText(value).length).toBeGreaterThanOrEqual(1);
      }
      for (const unit of STAT_UNITS) {
        expect(screen.getByText(unit)).toBeInTheDocument();
      }
      for (const label of STAT_LABELS) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it('renders the closing paragraph', () => {
      render(<TeardownOutro />);
      expect(
        screen.getByText(
          'Every one of those numbers is a compromise with the other three. That is the whole sport.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('structural contract the parent page depends on', () => {
    it('carries id="teardown-outro" on the section', () => {
      const { container } = render(<TeardownOutro />);
      expect(container.querySelector('section#teardown-outro')).toBeInTheDocument();
    });

    it('labels the section with the heading it points at', () => {
      const { container } = render(<TeardownOutro />);
      const section = container.querySelector('section#teardown-outro')!;
      const labelledBy = section.getAttribute('aria-labelledby');

      expect(labelledBy).toBe('teardown-outro-heading');
      // Resolving the reference, not just asserting the string: an `aria-labelledby` pointing at
      // an id that no longer exists is silently worse than no label at all, and the attribute
      // alone can't tell you which happened.
      expect(container.querySelector(`#${labelledBy}`)).toBe(
        screen.getByRole('heading', { level: 2 }),
      );
    });

    it('renders exactly four stats', () => {
      const { container } = render(<TeardownOutro />);
      // Five red tick bars total: one in this section's own kicker, one per MegaStat (each
      // stat draws its own tick above its numeral). Counted by the mark rather than a grid/layout
      // class, so this survives any amount of Tailwind churn to the grid itself.
      expect(container.querySelectorAll('.bg-f1-red')).toHaveLength(STAT_VALUES.length + 1);
    });
  });

  describe('TopoBackground regression guard', () => {
    /**
     * The single most valuable assertion in this file, per the task brief: a `TopoBackground`
     * with no colour class strokes `currentColor` against a declared-nowhere ancestor colour and
     * resolves to black-on-`zinc-950` — invisible, and indistinguishable from a correctly
     * coloured instance in a screenshot, because there is nothing wrong to see. That exact bug
     * shipped once already on this branch (Phase 3's hero). Asserting the `text-ink` class is
     * present is the only way to catch a missing colour without sampling rendered pixels, which
     * jsdom cannot do at all.
     */
    it('gives TopoBackground a text colour so its currentColor stroke is not invisible', () => {
      const { container } = render(<TeardownOutro />);
      const svg = container.querySelector('svg')!;

      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg.classList.contains('text-ink')).toBe(true);
    });
  });
});
