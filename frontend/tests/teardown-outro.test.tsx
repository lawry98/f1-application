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

/**
 * The four "systems" card copy blocks, likewise copied out by hand rather than imported — these
 * are cited verbatim in the task brief and (per that brief) in the parent's commit message, so the
 * test should fail if a future edit rounds, rewords, or drops one rather than silently agreeing
 * with whatever the component says.
 */
const SYSTEM_KICKERS = [
  '01 · Power unit',
  '02 · Aerodynamics',
  '03 · Chassis',
  '04 · Tyres and brakes',
];
const SYSTEM_TITLES = ['V6 turbo-hybrid', 'Active wings', 'Carbon monocoque', '18-inch slicks'];
const SYSTEM_FOOTERS = ['~1000 HP combined', 'Active aero', 'Monocoque + halo', 'Carbon discs'];

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

    it('renders the second kicker, "Under the bodywork"', () => {
      render(<TeardownOutro />);
      expect(screen.getByText('Under the bodywork')).toBeInTheDocument();
    });

    it('renders the full h3 sentence despite it being split across spans', () => {
      // Same reasoning as the h2 test above: the accent run ("one compromise") is its own <span>
      // so the serif/italic/red treatment applies to it alone, so a naive `getByText` against the
      // full sentence finds nothing. Normalising `textContent` proves the sentence reads correctly
      // once the spans are flattened.
      render(<TeardownOutro />);
      const heading = screen.getByRole('heading', { level: 3 });

      expect(heading.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'Four systems, one compromise.',
      );
    });

    it('renders all four system-card kickers, titles and footers verbatim', () => {
      render(<TeardownOutro />);

      for (const kicker of SYSTEM_KICKERS) {
        expect(screen.getByText(kicker)).toBeInTheDocument();
      }
      for (const title of SYSTEM_TITLES) {
        expect(screen.getByText(title)).toBeInTheDocument();
      }
      for (const footer of SYSTEM_FOOTERS) {
        expect(screen.getByText(footer)).toBeInTheDocument();
      }
    });

    it('renders the closing line above the CTA', () => {
      render(<TeardownOutro />);
      expect(screen.getByText('That is the car. The race is the other half.')).toBeInTheDocument();
    });
  });

  describe('structural contract the parent page depends on', () => {
    it('carries id="teardown-outro" on the section', () => {
      const { container } = render(<TeardownOutro />);
      expect(container.querySelector('section#teardown-outro')).toBeInTheDocument();
    });

    it('labels the section with the heading it points at, not the newly-added h3', () => {
      // This is the assertion the task brief calls out as catching the easy mistake in this
      // change: adding a second heading group is exactly the kind of edit that tempts
      // re-pointing (or duplicating) `aria-labelledby` at the new heading. A section has exactly
      // one accessible name, and it must keep resolving to the original h2.
      const { container } = render(<TeardownOutro />);
      const section = container.querySelector('section#teardown-outro')!;
      const labelledBy = section.getAttribute('aria-labelledby');

      expect(labelledBy).toBe('teardown-outro-heading');
      // Resolving the reference, not just asserting the string: an `aria-labelledby` pointing at
      // an id that no longer exists is silently worse than no label at all, and the attribute
      // alone can't tell you which happened.
      const h2 = screen.getByRole('heading', { level: 2 });
      const h3 = screen.getByRole('heading', { level: 3 });
      expect(container.querySelector(`#${labelledBy}`)).toBe(h2);
      expect(container.querySelector(`#${labelledBy}`)).not.toBe(h3);
    });

    it('renders exactly four stats', () => {
      const { container } = render(<TeardownOutro />);
      // Six decorative red tick bars total: one in each of the section's two kickers ("By the
      // numbers" and the newly-added "Under the bodywork"), plus one per MegaStat (each stat
      // draws its own tick above its numeral). Scoped to `[aria-hidden="true"].bg-f1-red` rather
      // than a bare `.bg-f1-red` selector, because the `/briefing` CTA pill added by this task
      // also carries `bg-f1-red` as its fill colour — that element is an interactive link, not a
      // decorative tick, and a bare-class selector would silently fold it into this count. This
      // grew from 5 (4 stats + 1 kicker) to 6 when the second kicker was added, reusing the same
      // shared kicker idiom (and therefore the same red bar) as the first — per SHARED-P4.md,
      // that duplication is deliberate, not a copy-paste bug.
      expect(container.querySelectorAll('[aria-hidden="true"].bg-f1-red')).toHaveLength(
        STAT_VALUES.length + 2,
      );
    });

    it('renders exactly four TicketCards for the systems grid', () => {
      // `.notch-card` is `TicketCard`'s own class, applied only when `notch="bottom-right"`
      // (the default, and what this component uses) — counting it rather than a locally-authored
      // wrapper class ties the assertion to "four TicketCard instances actually rendered", not to
      // this file's own grid markup, which is free to change independently.
      const { container } = render(<TeardownOutro />);
      expect(container.querySelectorAll('.notch-card')).toHaveLength(4);
    });

    it('gives the new h3 an id, independent of the section label', () => {
      const { container } = render(<TeardownOutro />);
      const h3 = screen.getByRole('heading', { level: 3 });

      expect(h3.id).toBeTruthy();
      expect(h3.id).not.toBe('teardown-outro-heading');
      expect(container.querySelector(`#${h3.id}`)).toBe(h3);
    });

    it('renders the /briefing CTA as a reachable link with its accessible name', () => {
      render(<TeardownOutro />);
      const link = screen.getByRole('link', { name: 'Generate a Briefing' });

      expect(link).toHaveAttribute('href', '/briefing');
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
