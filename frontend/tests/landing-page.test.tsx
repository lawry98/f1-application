import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';

// `LandingNav` calls `usePathname` to mark the current route. jsdom has no Next router, and the
// value only decides which link gets the active fill, so a constant is the whole of what this
// needs. Static import plus `vi.mock` (which is hoisted above it) rather than a top-level `await`
// — the latter passes under vitest and fails `pnpm typecheck` with TS1378.
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

/** The wrapper elements `LandingSectionTheme` renders, in document order. */
function themedWrappers(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-landing-tone]'));
}

describe('landing page', () => {
  describe('section theming', () => {
    it('alternates base / base-warm across every section in `main`', () => {
      /*
       * The spec's Phase 7 headline item: "Landing sections alternate `base` / `base-warm`".
       *
       * The table is retyped here rather than imported from `app/page.tsx`, for the same reason
       * `landing-how-it-works.test.tsx` retypes its step copy: a test that reads the same constant
       * the component renders asserts only that React can map over an array. This is the contract —
       * changing which band is warm should be a deliberate line in a diff, because two other things
       * are pinned to it (the CTA band's focus-ring offsets and the timeline's numeral mask).
       */
      const { container } = render(<Home />);

      expect(themedWrappers(container).map((el) => el.dataset.landingTone)).toEqual([
        'base', // hero
        'base-warm', // marquee band
        'base', // features
        'base-warm', // how it works
        'base', // built with
        'base-warm', // cta band
      ]);
    });

    it('leaves the surface colour to the wrapper — no section paints its own', () => {
      // The one way this feature silently does nothing: a section keeps the `bg-base` it had
      // before and paints straight over the wrapper that is trying to warm it. Nothing about the
      // rendered page would look wrong — it would look exactly like the day before the feature
      // landed — so it has to be asserted rather than eyeballed.
      const { container } = render(<Home />);

      for (const wrapper of themedWrappers(container)) {
        const section = wrapper.firstElementChild;
        expect(section).not.toBeNull();
        const backgrounds = Array.from(section?.classList ?? []).filter((c) => /^bg-/.test(c));
        expect(backgrounds, `${section?.tagName} paints ${backgrounds.join(' ')}`).toEqual([]);
      }
    });

    it('keeps the timeline numeral mask on the same tone as its own section', () => {
      /*
       * These two are one decision written twice, and the failure mode is invisible to every other
       * test in the suite: the numeral's opaque patch exists only to mask the connector line
       * between its digits, so it must be exactly the colour of the section behind it. Assert them
       * together or neither has a guard.
       */
      render(<Home />);

      const numeral = screen.getByText('01');
      const section = numeral.closest('[data-landing-tone]');

      expect(section).toHaveAttribute('data-landing-tone', 'base-warm');
      expect(numeral).toHaveClass('bg-base-warm');
    });

    it('does not wrap the footer', () => {
      // The footer already alternates internally — a `bg-base` landmark holding a `bg-base-warm`
      // card — and that contrast is the only reason its `rounded-t-2xl` corners are visible at all.
      // Wrapping it would paint warm behind the cut-away and silently undo the radius.
      const { container } = render(<Home />);

      const footer = screen.getByRole('contentinfo');
      expect(footer.closest('[data-landing-tone]')).toBeNull();
      // And every wrapper is inside `main`, so nothing outside the page's content is themed.
      for (const wrapper of themedWrappers(container)) {
        expect(wrapper.closest('main')).not.toBeNull();
      }
    });
  });

  describe('document outline', () => {
    it('never skips a heading level', () => {
      /*
       * axe's `heading-order` rule, asserted directly rather than trusted to a screenshot review.
       *
       * The violation this replaces was real: the page went **H1 → H3**, the H3 being "Monaco
       * Grand Prix" inside the hero's decorative preview card. Writing the rule out generically
       * rather than pinning the exact sequence is deliberate — the sequence will change as
       * sections are added, and the invariant will not.
       */
      render(<Home />);

      const levels = screen
        .getAllByRole('heading', { hidden: true })
        .map((el) => Number(el.tagName.slice(1)));

      expect(levels.length).toBeGreaterThan(0);
      expect(levels[0]).toBe(1);
      levels.forEach((level, i) => {
        if (i === 0) return;
        const previous = levels[i - 1] ?? 1;
        expect(level, `heading ${i} jumps from h${previous} to h${level}`).toBeLessThanOrEqual(
          previous + 1,
        );
      });
    });

    it('has exactly one h1', () => {
      render(<Home />);

      expect(screen.getAllByRole('heading', { level: 1, hidden: true })).toHaveLength(1);
    });
  });
});
