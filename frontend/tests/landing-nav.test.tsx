import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LandingNav } from '@/components/landing/landing-nav';
import { NAV_LINKS } from '@/components/landing/links';

// Static import plus a hoisted `vi.mock`, not a top-level `await`: the latter passes under vitest
// and fails `pnpm typecheck` with TS1378.
const pathname = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

/**
 * The destinations, retyped rather than only mapped from `NAV_LINKS`.
 *
 * Both are asserted, and they are asserting different things. The retyped list is the contract:
 * `SHARED-P7.md` says every link survives the 390 px pass, so a destination silently disappearing
 * from `links.ts` has to fail somewhere, and it cannot fail in a test that derives its expectation
 * from the same file. The `NAV_LINKS` comparison then catches the opposite drift — a link added to
 * the shared list and not rendered.
 *
 * `/candy` is deliberately absent from `links.ts` and must stay absent; that is pinned below.
 */
const DESTINATIONS = [
  ['/briefing', 'Briefing'],
  ['/teardown', 'Car Anatomy'],
  ['/teams', 'Teams'],
  ['/showcase', 'Showcase'],
  ['/credits', 'Credits'],
] as const;

describe('LandingNav', () => {
  it('renders every destination with its label and href', () => {
    render(<LandingNav />);

    for (const [href, label] of DESTINATIONS) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
    expect(NAV_LINKS.map(({ href, label }) => [href, label])).toEqual(
      DESTINATIONS.map(([href, label]) => [href, label]),
    );
  });

  it('does not link to the styleguide', () => {
    // `/candy` is a development styleguide, not a destination for readers. Its absence is a
    // decision, and an absence with no test is indistinguishable from an oversight.
    render(<LandingNav />);

    expect(screen.queryByRole('link', { name: /candy/i })).toBeNull();
  });

  describe('the 390 px pass', () => {
    /*
     * Measured at a 390 viewport before this change: the `ul` was **393.3 px wide inside a 390 px
     * viewport**, `Showcase` ended at x=400.6 and `Credits` at x=475.8 — both entirely past the
     * right edge — while `document.documentElement.scrollWidth` stayed at 390, so the page did not
     * scroll to reach them. Two of five destinations were unreachable on a phone.
     *
     * **jsdom lays nothing out**, so none of that is assertable here and none of it is asserted
     * here. What these tests pin is the *mechanism* chosen to fix it, which is the part a later
     * edit can remove by accident: take away `min-w-0` and the row stops shrinking and overflows
     * the header again; take away `overflow-x-auto` and it is clipped instead of scrolled; take
     * away `flex-shrink-0` on the items and the labels squeeze and wrap. The geometry itself was
     * verified in a browser at 390 and at 1440.
     */
    it('makes the link row a horizontal scroller rather than clipping it', () => {
      const { container } = render(<LandingNav />);
      const list = container.querySelector('ul');

      expect(list).toHaveClass('overflow-x-auto');
      // Without this a flex item's automatic minimum size is its content, so the row keeps its
      // full width and overflows the header instead of scrolling inside itself.
      expect(list).toHaveClass('min-w-0');
      // Stops a horizontal swipe on the bar from chaining into the browser's back gesture.
      expect(list).toHaveClass('overscroll-x-contain');
    });

    it('gives the scroller room for a focus ring', () => {
      // Not spacing. `overflow-x: auto` forces `overflow-y` to compute to `auto` as well, and a
      // ring drawn at `ring-offset-2` is a box-shadow painted 4 px outside the link — which a
      // scroll container clips. Remove this padding and every focused link in the bar loses the
      // top and bottom of its indicator.
      const { container } = render(<LandingNav />);

      expect(container.querySelector('ul')).toHaveClass('py-1.5');
    });

    it('keeps every label on one line at its natural width', () => {
      const { container } = render(<LandingNav />);

      for (const item of Array.from(container.querySelectorAll('li'))) {
        expect(item).toHaveClass('flex-shrink-0');
      }
      for (const [, label] of DESTINATIONS) {
        expect(screen.getByRole('link', { name: label })).toHaveClass('whitespace-nowrap');
      }
    });

    it('never squeezes the wordmark', () => {
      // Before this, the brand and the link row shared the shortfall at 390 and both lost: the
      // wordmark wrapped to two lines inside a 56 px bar.
      render(<LandingNav />);

      expect(screen.getByRole('link', { name: /F1 Briefing Agent/ })).toHaveClass('flex-shrink-0');
    });
  });

  describe('focus rings', () => {
    // The rule and its measurements live in `lib/focus.ts`; these assert the call sites use it
    // rather than restating class strings, which is what let four near-identical rings drift apart
    // across this branch in the first place.
    it('gives every link a 2 px red ring', () => {
      render(<LandingNav />);

      const links = screen.getAllByRole('link');
      expect(links.length).toBe(DESTINATIONS.length + 1);
      for (const link of links) {
        expect(link).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-f1-red');
        expect(link).toHaveClass('focus-visible:outline-none');
      }
    });

    it('offsets the ring on the nav items, which can carry a fill, and not on the wordmark', () => {
      // The active item is `bg-zinc-800`, where a flush red ring measures 3.00:1 — exactly at
      // WCAG 2.4.11's bar. The offset band separates ring from fill. The wordmark is never filled,
      // so it takes the flush ring and no offset band to be mismatched against the header.
      render(<LandingNav />);

      for (const [, label] of DESTINATIONS) {
        expect(screen.getByRole('link', { name: label })).toHaveClass(
          'focus-visible:ring-offset-2',
          'focus-visible:ring-offset-base',
        );
      }
      expect(screen.getByRole('link', { name: /F1 Briefing Agent/ })).not.toHaveClass(
        'focus-visible:ring-offset-2',
      );
    });
  });

  it('marks the active route', () => {
    pathname.current = '/teams';
    render(<LandingNav />);

    expect(screen.getByRole('link', { name: 'Teams' })).toHaveClass('bg-zinc-800');
    expect(screen.getByRole('link', { name: 'Briefing' })).not.toHaveClass('bg-zinc-800');
    pathname.current = '/';
  });
});
